import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import {
  openApplicationDatabase,
  registerMigrationFunctions,
  type DatabaseContext,
} from '../../src/db/connection';
import { latestMigrationVersion, migrations } from '../../src/db/migrations/registry';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { CausalityRepository } from '../../src/db/repositories/causality-repository';
import { CausalityService } from '../../src/main/services/causality-service';
import { TestLogger } from '../helpers/test-logger';

const contexts: DatabaseContext[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe('persistência do mapa causal', () => {
  it('migra, cria cadeia com ciclo limitado e isola campanhas', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'causality-'));
    roots.push(root);
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(context);
    const now = '2026-11-19T12:00:00.000Z';
    const campaign = randomUUID();
    const other = randomUUID();
    const entityType = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    context.native
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(campaign, 'Causalidade', now, now);
    context.native
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(other, 'Outra', now, now);
    context.native
      .prepare(
        'INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(entityType, campaign, 'Pessoas', 'Pessoa', 'pessoas', now, now);
    context.native
      .prepare(
        'INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(first, campaign, entityType, 'Primeiro', now, now);
    context.native
      .prepare(
        'INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(second, campaign, entityType, 'Segundo', now, now);
    const campaigns = new CampaignRepository(context.orm);
    const service = new CausalityService({
      repository: new CausalityRepository(context.native),
      campaigns,
      now: () => now,
    });
    const a = service.createLink({
      campaignId: campaign,
      sourceType: 'entity',
      sourceId: first,
      targetType: 'entity',
      targetId: second,
      causalType: 'causes',
    });
    service.createLink({
      campaignId: campaign,
      sourceType: 'entity',
      sourceId: second,
      targetType: 'entity',
      targetId: first,
      causalType: 'reveals',
    });
    const chain = service.getChain({
      campaignId: campaign,
      objectType: 'entity',
      objectId: first,
      direction: 'both',
      maxDepth: 8,
      maxNodes: 2,
    });
    expect(chain.nodes).toHaveLength(2);
    expect(chain.links).toHaveLength(2);
    expect(chain.truncated).toBe(false);
    expect(a.source.label).toBe('Primeiro');
    expect(
      service.getChain({
        campaignId: campaign,
        objectType: 'entity',
        objectId: first,
        direction: 'outgoing',
        maxDepth: 8,
        maxNodes: 10,
      }).links,
    ).toHaveLength(2);
    expect(
      service.getChain({
        campaignId: campaign,
        objectType: 'entity',
        objectId: first,
        direction: 'incoming',
        maxDepth: 8,
        maxNodes: 10,
      }).links,
    ).toHaveLength(2);
    expect(
      service.getChain({
        campaignId: campaign,
        objectType: 'entity',
        objectId: first,
        direction: 'both',
        maxDepth: 1,
        maxNodes: 10,
      }).truncated,
    ).toBe(true);
    expect(
      service.getChain({
        campaignId: campaign,
        objectType: 'entity',
        objectId: first,
        direction: 'both',
        maxDepth: 8,
        maxNodes: 1,
      }).truncated,
    ).toBe(true);
    const edited = service.updateLink({
      campaignId: campaign,
      id: a.id,
      revision: 1,
      description: 'Descrição revisada',
    });
    expect(edited.description).toBe('Descrição revisada');
    expect(() =>
      service.updateLink({ campaignId: campaign, id: a.id, revision: 1, description: 'Conflito' }),
    ).toThrow(expect.objectContaining({ code: 'CAUSAL_LINK_REVISION_CONFLICT' }));
    const narrativeObject = context.native
      .prepare(
        'SELECT id FROM narrative_objects WHERE campaign_id = ? AND object_type = ? AND object_id = ?',
      )
      .get(campaign, 'entity', first) as { id: string };
    expect(() =>
      context.native
        .prepare('UPDATE narrative_objects SET object_id = ? WHERE id = ?')
        .run(second, narrativeObject.id),
    ).toThrow(/narrative_object_identity_immutable/);
    context.native.prepare('UPDATE entities SET archived_at = ? WHERE id = ?').run(now, first);
    expect(() =>
      service.createLink({
        campaignId: campaign,
        sourceType: 'entity',
        sourceId: second,
        targetType: 'entity',
        targetId: first,
        causalType: 'blocks',
      }),
    ).toThrow(expect.objectContaining({ code: 'CAUSAL_OBJECT_ARCHIVED' }));
    expect(
      service.getChain({
        campaignId: campaign,
        objectType: 'entity',
        objectId: first,
        direction: 'both',
        maxDepth: 8,
        maxNodes: 10,
      }).links,
    ).toHaveLength(2);
    expect(() =>
      service.createLink({
        campaignId: other,
        sourceType: 'entity',
        sourceId: first,
        targetType: 'entity',
        targetId: second,
        causalType: 'causes',
      }),
    ).toThrow(expect.objectContaining({ code: 'CAUSAL_OBJECT_NOT_FOUND' }));
    expect(() => context.native.prepare('DELETE FROM entities WHERE id = ?').run(first)).toThrow();
  });

  it('aplica a migração 3C.1 em banco vazio e em upgrade v34', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'causality-upgrade-'));
    roots.push(root);
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const databasePath = path.join(directories.database, 'app.db');
    const legacy = new Database(databasePath);
    registerMigrationFunctions(legacy);
    legacy.pragma('foreign_keys = ON');
    legacy.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    for (const migration of migrations.filter(({ version }) => version <= 34)) {
      if (migration.version === 31) {
        legacy.exec(`CREATE TEMP TABLE structured_value_snapshot_v31 (
          field_value_id TEXT PRIMARY KEY, field_definition_id TEXT NOT NULL, entity_id TEXT NOT NULL,
          source_json TEXT NOT NULL, legacy_rich_text TEXT NOT NULL, lossless_rich_text TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL
        )`);
      }
      if (migration.version === 34) {
        legacy.exec(
          'CREATE TEMP TABLE cleared_explicit_need_signals (signal_id TEXT NOT NULL, entity_id TEXT NOT NULL)',
        );
      }
      if (migration.requiresForeignKeysDisabled) {
        legacy.pragma('foreign_keys = OFF');
        if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table = ON');
      }
      legacy.exec(migration.sql);
      legacy
        .prepare(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        )
        .run(migration.version, migration.name, migration.checksum, new Date().toISOString());
      if (migration.requiresForeignKeysDisabled) {
        if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table = OFF');
        legacy.pragma('foreign_keys = ON');
      }
    }
    legacy.close();
    const context = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(context);
    expect(context.schemaVersion).toBe(latestMigrationVersion);
    expect(
      context.native
        .prepare(
          "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('narrative_objects', 'causal_links')",
        )
        .get(),
    ).toEqual({ total: 2 });
  });
});
