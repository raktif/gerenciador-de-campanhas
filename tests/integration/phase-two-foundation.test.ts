import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase } from '../../src/db/connection';
import { migrations } from '../../src/db/migrations/registry';
import { TestLogger } from '../helpers/test-logger';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) => rm(temporaryRoot, { recursive: true, force: true })),
  );
});

describe('fundação narrativa da Fase 2', () => {
  it('cria todas as estruturas em um banco vazio', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openApplicationDatabase(directories, new TestLogger());

    expect(context.schemaVersion).toBe(8);
    const rows = context.native
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (
           'sources', 'relationship_types', 'relationships', 'assertions', 'sessions',
           'session_participants', 'session_intentions', 'events', 'event_entity_links',
           'notes', 'note_entity_links', 'inbox_items'
         )
         ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(rows.map(({ name }) => name)).toEqual([
      'assertions',
      'event_entity_links',
      'events',
      'inbox_items',
      'note_entity_links',
      'notes',
      'relationship_types',
      'relationships',
      'session_intentions',
      'session_participants',
      'sessions',
      'sources',
    ]);
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
    context.close();
  });

  it('migra a versão 7, preserva dados e centraliza referências livres', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const databasePath = path.join(directories.database, 'app.db');
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.pragma('foreign_keys = ON');
    applyThroughVersionSeven(legacyDatabase);
    const campaignId = randomUUID();
    const entityTypeId = randomUUID();
    const entityId = randomUUID();
    const now = timestamp();
    legacyDatabase
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(campaignId, 'Ethéria', now, now);
    legacyDatabase
      .prepare(
        `INSERT INTO entity_types
          (id, campaign_id, name, singular_name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(entityTypeId, campaignId, 'Locais', 'Local', 'locais', now, now);
    legacyDatabase
      .prepare(
        `INSERT INTO entities
          (id, campaign_id, entity_type_id, name, source_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(entityId, campaignId, entityTypeId, 'Kabotya', 'caderno-da-mesa', now, now);
    legacyDatabase.close();

    const context = await openApplicationDatabase(directories, new TestLogger());
    const entity = context.native
      .prepare('SELECT name, source_id FROM entities WHERE id = ?')
      .get(entityId) as { name: string; source_id: string };
    const source = context.native
      .prepare('SELECT kind, description FROM sources WHERE id = ?')
      .get(entity.source_id);

    expect(context.schemaVersion).toBe(8);
    expect(entity.name).toBe('Kabotya');
    expect(entity.source_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(source).toEqual({ kind: 'manual', description: 'Referência legada: caderno-da-mesa' });
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
    context.close();
  });

  it('valida fonte de sessão e impede seu uso por outra campanha', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openApplicationDatabase(directories, new TestLogger());
    const first = createCampaignStructure(context.native, 'Primeira');
    const second = createCampaignStructure(context.native, 'Segunda');
    const sessionId = randomUUID();
    const sourceId = randomUUID();
    const now = timestamp();
    context.native
      .prepare(
        `INSERT INTO sessions
          (id, campaign_id, sequence_number, title, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)`,
      )
      .run(sessionId, first.campaignId, 'Sessão 1', now, now);
    context.native
      .prepare('INSERT INTO sources (id, kind, session_id, created_at) VALUES (?, ?, ?, ?)')
      .run(sourceId, 'session', sessionId, now);
    const insertEntity = context.native.prepare(
      `INSERT INTO entities
        (id, campaign_id, entity_type_id, name, origin_kind, source_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'session', ?, ?, ?)`,
    );

    expect(() =>
      insertEntity.run(
        randomUUID(),
        second.campaignId,
        second.entityTypeId,
        'Entidade inválida',
        sourceId,
        now,
        now,
      ),
    ).toThrow(/ENTITY_SOURCE_INVALID/);
    const entityId = randomUUID();
    insertEntity.run(
      entityId,
      first.campaignId,
      first.entityTypeId,
      'Entidade válida',
      sourceId,
      now,
      now,
    );
    expect(() => context.native.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)).toThrow(
      /SOURCE_IN_USE/,
    );
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
    context.close();
  });

  it('aplica restrições de sequência, proveniência e conversão da Caixa de Entrada', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openApplicationDatabase(directories, new TestLogger());
    const { campaignId } = createCampaignStructure(context.native, 'Restrições');
    const now = timestamp();
    const insertSession = context.native.prepare(
      `INSERT INTO sessions
        (id, campaign_id, sequence_number, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertSession.run(randomUUID(), campaignId, 1, 'Sessão 1', now, now);
    expect(() => insertSession.run(randomUUID(), campaignId, 1, 'Duplicada', now, now)).toThrow();
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO sources (id, kind, description, created_at)
           VALUES (?, 'session', ?, ?)`,
        )
        .run(randomUUID(), 'Sem sessão', now),
    ).toThrow();
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO inbox_items
            (id, campaign_id, raw_text, status, captured_at, created_at, updated_at)
           VALUES (?, ?, ?, 'converted', ?, ?, ?)`,
        )
        .run(randomUUID(), campaignId, 'Texto ainda sem destino', now, now, now),
    ).toThrow();
    context.close();
  });
});

function applyThroughVersionSeven(database: Database.Database): void {
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const insertMigration = database.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
  );
  for (const migration of migrations.filter(({ version }) => version <= 7)) {
    database.exec(migration.sql);
    insertMigration.run(migration.version, migration.name, migration.checksum, timestamp());
  }
}

function createCampaignStructure(
  database: Database.Database,
  name: string,
): { campaignId: string; entityTypeId: string } {
  const campaignId = randomUUID();
  const entityTypeId = randomUUID();
  const now = timestamp();
  database
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, name, now, now);
  database
    .prepare(
      `INSERT INTO entity_types
        (id, campaign_id, name, singular_name, slug, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entityTypeId,
      campaignId,
      'Pessoas',
      'Pessoa',
      `pessoas-${campaignId.slice(0, 8)}`,
      now,
      now,
    );
  return { campaignId, entityTypeId };
}

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-phase-two-foundation-test-'));
  temporaryRoots.push(root);
  return root;
}

function timestamp(): string {
  return new Date().toISOString();
}
