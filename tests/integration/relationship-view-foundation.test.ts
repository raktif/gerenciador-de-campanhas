import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureDataDirectories,
  getDataDirectories,
  type DataDirectories,
} from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { migrations } from '../../src/db/migrations/registry';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })),
  );
});

describe('fundação persistente do canvas de Relações', () => {
  it('migra um banco v20 preservado e cria as estruturas até a versão atual', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const native = new Database(path.join(directories.database, 'app.db'));
    applyThroughVersion(native, 20);
    const seeded = seedCampaignStructure(native, 'Ethéria');
    native.close();

    const context = await openTestDatabase(directories);

    expect(context.schemaVersion).toBe(22);
    expect(
      context.native.prepare('SELECT name FROM campaigns WHERE id = ?').get(seeded.campaignId),
    ).toEqual({ name: 'Ethéria' });
    expect(
      context.native
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN ('relationship_views', 'relationship_view_nodes')
           ORDER BY name`,
        )
        .all(),
    ).toEqual([{ name: 'relationship_view_nodes' }, { name: 'relationship_views' }]);
    expect((await readdir(directories.automaticBackups)).some((name) => name.endsWith('.db'))).toBe(
      true,
    );
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
  });

  it('impõe layout válido, view padrão única e isolamento entre campanhas', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openTestDatabase(directories);
    const first = seedCampaignStructure(context.native, 'Primeira');
    const second = seedCampaignStructure(context.native, 'Segunda');
    const viewId = randomUUID();
    const now = timestamp();
    const insertView = context.native.prepare(
      `INSERT INTO relationship_views (
        id, campaign_id, name, view_type, source_entity_id, is_default,
        viewport_json, created_at, updated_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );

    insertView.run(
      viewId,
      first.campaignId,
      'Mapa principal',
      'campaign',
      null,
      1,
      JSON.stringify({ x: 0, y: 0, zoom: 1 }),
      now,
      now,
    );
    expect(() =>
      insertView.run(
        randomUUID(),
        first.campaignId,
        'Outro padrão',
        'campaign',
        null,
        1,
        JSON.stringify({ x: 0, y: 0, zoom: 1 }),
        now,
        now,
      ),
    ).toThrow();
    expect(() =>
      insertView.run(
        randomUUID(),
        first.campaignId,
        'Vizinhança estrangeira',
        'neighborhood',
        second.entityId,
        1,
        JSON.stringify({ x: 0, y: 0, zoom: 1 }),
        now,
        now,
      ),
    ).toThrow(/source must belong to the campaign/u);
    expect(() =>
      insertView.run(
        randomUUID(),
        first.campaignId,
        'Viewport inválido',
        'campaign',
        null,
        0,
        JSON.stringify({ x: 0, y: 0, zoom: 10 }),
        now,
        now,
      ),
    ).toThrow();

    const insertNode = context.native.prepare(
      `INSERT INTO relationship_view_nodes (
        relationship_view_id, entity_id, x, y, width, height, pinned, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertNode.run(viewId, first.entityId, 100, 200, 180, 64, 0, now);
    expect(() => insertNode.run(viewId, second.entityId, 300, 400, 180, 64, 0, now)).toThrow(
      /node must belong to the campaign/u,
    );
    expect(() =>
      insertNode.run(viewId, first.secondEntityId, 1_000_001, 0, 180, 64, 0, now),
    ).toThrow();
    expect(() =>
      context.native
        .prepare('UPDATE relationship_views SET campaign_id = ? WHERE id = ?')
        .run(second.campaignId, viewId),
    ).toThrow(/nodes must belong to the campaign/u);
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
  });
});

function applyThroughVersion(database: Database.Database, maximumVersion: number): void {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const insert = database.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
  );
  for (const migration of migrations.filter(({ version }) => version <= maximumVersion)) {
    database.exec(migration.sql);
    insert.run(migration.version, migration.name, migration.checksum, timestamp());
  }
}

function seedCampaignStructure(
  database: Database.Database,
  name: string,
): { campaignId: string; entityTypeId: string; entityId: string; secondEntityId: string } {
  const campaignId = randomUUID();
  const entityTypeId = randomUUID();
  const entityId = randomUUID();
  const secondEntityId = randomUUID();
  const now = timestamp();
  database
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, name, now, now);
  database
    .prepare(
      `INSERT INTO entity_types (
        id, campaign_id, name, singular_name, slug, created_at, updated_at
      ) VALUES (?, ?, 'Pessoas', 'Pessoa', ?, ?, ?)`,
    )
    .run(entityTypeId, campaignId, `pessoas-${campaignId.slice(0, 8)}`, now, now);
  const insertEntity = database.prepare(
    `INSERT INTO entities (
      id, campaign_id, entity_type_id, name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertEntity.run(entityId, campaignId, entityTypeId, `${name} A`, now, now);
  insertEntity.run(secondEntityId, campaignId, entityTypeId, `${name} B`, now, now);
  return { campaignId, entityTypeId, entityId, secondEntityId };
}

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'relationship-view-foundation-'));
  roots.push(root);
  return root;
}

async function openTestDatabase(directories: DataDirectories): Promise<DatabaseContext> {
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  return context;
}

function timestamp(): string {
  return new Date().toISOString();
}
