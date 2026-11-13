import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getTableConfig, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureDataDirectories,
  getDataDirectories,
  type DataDirectories,
} from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { migrations } from '../../src/db/migrations/registry';
import { campaignSignals, signalEvidence } from '../../src/db/schema';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];
const evidenceObjectTables = {
  entity: 'entities',
  relationship: 'relationships',
  assertion: 'assertions',
  event: 'events',
  session: 'sessions',
  note: 'notes',
} as const;

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3 })),
  );
});

describe('fundação persistente de sinais de campanha', () => {
  it('executa os CHECKs declarados pelo Drizzle contra as regressões de validação', () => {
    const db = new Database(':memory:');
    try {
      const dialect = new SQLiteSyncDialect();
      for (const table of [campaignSignals, signalEvidence]) {
        const config = getTableConfig(table);
        const columns = config.columns.map(
          (column) => `"${column.name}" ${column.getSQLType()}${column.notNull ? ' NOT NULL' : ''}`,
        );
        const checks = config.checks.map(({ value }) => `CHECK (${dialect.sqlToQuery(value).sql})`);
        db.exec(`CREATE TABLE "${config.name}" (${[...columns, ...checks].join(', ')})`);
      }
      const now = timestamp();
      const signal = {
        id: randomUUID(),
        campaign_id: randomUUID(),
        signal_type: 'open_thread',
        title: 'Título',
        summary: 'Resumo',
        score: 0,
        severity: 'low',
        status: 'new',
        generated_at: now,
        last_detected_at: now,
        dismissed_until: null,
        rule_version: '1',
        generator_kind: 'deterministic',
        created_at: now,
        updated_at: now,
        revision: 1,
      };
      const insertSignal = db.prepare(
        `INSERT INTO campaign_signals (${Object.keys(signal).join(', ')})
         VALUES (${Object.keys(signal)
           .map((key) => `@${key}`)
           .join(', ')})`,
      );
      insertSignal.run(signal);
      for (const column of [
        'generated_at',
        'last_detected_at',
        'dismissed_until',
        'created_at',
        'updated_at',
      ])
        for (const value of ['9999-99-99T99:99:99.999Z', '2026-02-30T12:00:00.000Z'])
          expect(() => insertSignal.run({ ...signal, [column]: value })).toThrow(
            /CHECK constraint failed/u,
          );
      for (const column of ['title', 'summary', 'rule_version'])
        expect(() => insertSignal.run({ ...signal, [column]: '\t\n' })).toThrow(
          /CHECK constraint failed/u,
        );
      for (const revision of [0.5, Number.MAX_SAFE_INTEGER + 1])
        expect(() => insertSignal.run({ ...signal, revision })).toThrow(/CHECK constraint failed/u);
      expect(() =>
        insertSignal.run({ ...signal, id: '00000000-0000-4000-8000-00000000000-' }),
      ).toThrow(/CHECK constraint failed/u);
      insertSignal.run({ ...signal, revision: Number.MAX_SAFE_INTEGER });
      insertSignal.run({ ...signal, dismissed_until: now });
      const evidence = {
        id: randomUUID(),
        signal_id: signal.id,
        object_type: 'entity',
        object_id: randomUUID(),
        role: 'related',
        description: null,
        graph_path_json: null,
        sort_order: 0,
        created_at: now,
      };
      const insertEvidence = db.prepare(
        `INSERT INTO signal_evidence (${Object.keys(evidence).join(', ')})
         VALUES (${Object.keys(evidence)
           .map((key) => `@${key}`)
           .join(', ')})`,
      );
      insertEvidence.run(evidence);
      for (const column of ['role', 'description'])
        for (const value of ['\t\n', '\u00a0\u2003\ufeff'])
          expect(() => insertEvidence.run({ ...evidence, [column]: value })).toThrow(
            /CHECK constraint failed/u,
          );
      expect(() =>
        insertEvidence.run({ ...evidence, created_at: '9999-99-99T99:99:99.999Z' }),
      ).toThrow(/CHECK constraint failed/u);
      for (const sort_order of [0.5, Number.MAX_SAFE_INTEGER + 1])
        expect(() => insertEvidence.run({ ...evidence, sort_order })).toThrow(
          /CHECK constraint failed/u,
        );
      insertEvidence.run({ ...evidence, sort_order: Number.MAX_SAFE_INTEGER });
    } finally {
      db.close();
    }
  });
  it('cria as estruturas da versão 22 em banco vazio', async () => {
    const directories = await createDirectories();
    const context = await openTestDatabase(directories);

    expect(context.schemaVersion).toBe(22);
    expect(
      context.native
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN ('campaign_signals', 'signal_evidence')
           ORDER BY name`,
        )
        .all(),
    ).toEqual([{ name: 'campaign_signals' }, { name: 'signal_evidence' }]);
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
  });

  it('atualiza v21 preservando campanha, cria backup e impõe valores e isolamento', async () => {
    const directories = await createDirectories();
    const databasePath = path.join(directories.database, 'app.db');
    const legacy = new Database(databasePath);
    applyThroughVersion(legacy, 21);
    const campaignId = randomUUID();
    const now = timestamp();
    const insertCampaign = legacy.prepare(
      'INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    );
    insertCampaign.run(campaignId, 'Campanha preservada', now, now);
    const foreignCampaignId = randomUUID();
    insertCampaign.run(foreignCampaignId, 'Outra campanha', now, now);
    legacy.close();

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(22);
    expect(
      context.native.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId),
    ).toEqual({ name: 'Campanha preservada' });
    expect((await readdir(directories.automaticBackups)).some((name) => name.endsWith('.db'))).toBe(
      true,
    );

    const signalId = randomUUID();
    const insertSignal = context.native.prepare(`
      INSERT INTO campaign_signals (
        id, campaign_id, signal_type, title, summary, score, severity, status,
        generated_at, last_detected_at, dismissed_until, rule_version,
        generator_kind, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `);
    insertSignal.run(
      signalId,
      campaignId,
      'open_thread',
      'Pista pendente',
      'A pista ainda não foi investigada.',
      4,
      'high',
      'new',
      now,
      now,
      '1',
      'deterministic',
      now,
      now,
    );
    expect(() =>
      insertSignal.run(
        randomUUID(),
        campaignId,
        'not_a_signal',
        'Título',
        'Resumo',
        0,
        'low',
        'new',
        now,
        now,
        '1',
        'deterministic',
        now,
        now,
      ),
    ).toThrow();
    expect(() =>
      insertSignal.run(
        '00000000-0000-4000-8000-00000000000-',
        campaignId,
        'open_thread',
        'Título',
        'Resumo',
        0,
        'low',
        'new',
        now,
        now,
        '1',
        'deterministic',
        now,
        now,
      ),
    ).toThrow(/CHECK constraint failed/u);
    expect(() =>
      context.native
        .prepare('UPDATE campaign_signals SET generated_at = ? WHERE id = ?')
        .run('2026-02-30T12:00:00.000Z', signalId),
    ).toThrow(/CHECK constraint failed/u);
    expect(() =>
      insertSignal.run(
        randomUUID(),
        campaignId,
        'open_thread',
        'Título',
        'Resumo',
        0.5,
        'low',
        'new',
        now,
        now,
        '1',
        'deterministic',
        now,
        now,
      ),
    ).toThrow();
    expect(() =>
      insertSignal.run(
        randomUUID(),
        campaignId,
        'open_thread',
        '   ',
        'Resumo',
        0,
        'low',
        'new',
        now,
        now,
        '1',
        'deterministic',
        now,
        now,
      ),
    ).toThrow();
    for (const column of [
      'generated_at',
      'last_detected_at',
      'created_at',
      'updated_at',
      'dismissed_until',
    ])
      for (const value of [
        'not-a-date',
        ' ',
        '9999-99-99T99:99:99.999Z',
        '2026-02-30T12:00:00.000Z',
      ])
        expect(() =>
          context.native
            .prepare(`UPDATE campaign_signals SET ${column} = ? WHERE id = ?`)
            .run(value, signalId),
        ).toThrow(/CHECK constraint failed/u);
    for (const column of ['title', 'summary', 'rule_version'])
      for (const value of ['\t\n', '\u00a0\u2003\ufeff'])
        expect(() =>
          context.native
            .prepare(`UPDATE campaign_signals SET ${column} = ? WHERE id = ?`)
            .run(value, signalId),
        ).toThrow(/CHECK constraint failed/u);
    expect(() =>
      context.native
        .prepare('UPDATE campaign_signals SET revision = ? WHERE id = ?')
        .run(Number.MAX_SAFE_INTEGER + 1, signalId),
    ).toThrow(/CHECK constraint failed/u);
    context.native
      .prepare('UPDATE campaign_signals SET revision = ? WHERE id = ?')
      .run(Number.MAX_SAFE_INTEGER, signalId);
    context.native
      .prepare('UPDATE campaign_signals SET dismissed_until = ? WHERE id = ?')
      .run(now, signalId);
    context.native
      .prepare('UPDATE campaign_signals SET dismissed_until = NULL WHERE id = ?')
      .run(signalId);
    expect(() =>
      insertSignal.run(
        '00000000--0000-4000-8000-000000000001',
        campaignId,
        'open_thread',
        'Título',
        'Resumo',
        0,
        'low',
        'new',
        now,
        now,
        '1',
        'deterministic',
        now,
        now,
      ),
    ).toThrow();
    expect(() =>
      insertSignal.run(
        '00000000-0000-4000-8000-00000000000A',
        campaignId,
        'open_thread',
        'Título',
        'Resumo',
        0,
        'low',
        'new',
        now,
        now,
        '1',
        'deterministic',
        now,
        now,
      ),
    ).toThrow();
    expect(() =>
      context.native
        .prepare('UPDATE campaign_signals SET revision = 1.5 WHERE id = ?')
        .run(signalId),
    ).toThrow();
    expect(() =>
      insertSignal.run(
        randomUUID(),
        campaignId,
        'open_thread',
        'Título',
        'Resumo',
        6,
        'low',
        'new',
        now,
        now,
        '1',
        'deterministic',
        now,
        now,
      ),
    ).toThrow();
    const updateSignal = context.native.prepare(
      'UPDATE campaign_signals SET severity = ? WHERE id = ?',
    );
    expect(() => updateSignal.run('critical', signalId)).toThrow();
    expect(() =>
      context.native
        .prepare('UPDATE campaign_signals SET status = ? WHERE id = ?')
        .run('ignored', signalId),
    ).toThrow();
    expect(() =>
      context.native
        .prepare('UPDATE campaign_signals SET generator_kind = ? WHERE id = ?')
        .run('ai', signalId),
    ).toThrow();

    const localTargets = seedEvidenceTargets(context.native, campaignId, 'Local');
    const foreignTargets = seedEvidenceTargets(context.native, foreignCampaignId, 'Estrangeira');
    const insertEvidence = context.native.prepare(
      `INSERT INTO signal_evidence (
        id, signal_id, object_type, object_id, role, description,
        graph_path_json, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const localEvidence = localTargets.map((target, sortOrder) => {
      const id = randomUUID();
      insertEvidence.run(
        id,
        signalId,
        target.objectType,
        target.objectId,
        'related',
        `Evidência ${target.objectType}`,
        null,
        sortOrder,
        now,
      );
      return { id, ...target };
    });

    for (const target of foreignTargets)
      expect(() =>
        insertEvidence.run(
          randomUUID(),
          signalId,
          target.objectType,
          target.objectId,
          'related',
          null,
          null,
          0,
          now,
        ),
      ).toThrow(/TARGET_INVALID_OR_CROSS_CAMPAIGN/u);

    for (const target of localTargets)
      expect(() =>
        insertEvidence.run(
          randomUUID(),
          signalId,
          target.objectType,
          randomUUID(),
          'related',
          null,
          null,
          0,
          now,
        ),
      ).toThrow(/TARGET_INVALID_OR_CROSS_CAMPAIGN/u);

    expect(() =>
      insertEvidence.run(
        randomUUID(),
        signalId,
        'clock',
        randomUUID(),
        'related',
        null,
        null,
        0,
        now,
      ),
    ).toThrow();
    const foreignEntityEvidenceTarget = foreignTargets[0];
    const firstLocalEvidence = localEvidence[0];
    if (!foreignEntityEvidenceTarget || !firstLocalEvidence)
      throw new Error('Os alvos de evidência de teste não foram inicializados.');
    for (const value of ['9999-99-99T99:99:99.999Z', '2026-02-30T12:00:00.000Z', 'not-a-date'])
      expect(() =>
        context.native
          .prepare('UPDATE signal_evidence SET created_at = ? WHERE id = ?')
          .run(value, firstLocalEvidence.id),
      ).toThrow(/CHECK constraint failed/u);
    for (const column of ['role', 'description'])
      for (const value of ['\t\n', '\u00a0\u2003\ufeff'])
        expect(() =>
          context.native
            .prepare(`UPDATE signal_evidence SET ${column} = ? WHERE id = ?`)
            .run(value, firstLocalEvidence.id),
        ).toThrow(/CHECK constraint failed/u);
    for (const value of [0.5, -1, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        context.native
          .prepare('UPDATE signal_evidence SET sort_order = ? WHERE id = ?')
          .run(value, firstLocalEvidence.id),
      ).toThrow(/CHECK constraint failed/u);
    context.native
      .prepare('UPDATE signal_evidence SET sort_order = ? WHERE id = ?')
      .run(Number.MAX_SAFE_INTEGER, firstLocalEvidence.id);
    context.native
      .prepare('UPDATE signal_evidence SET description = NULL WHERE id = ?')
      .run(firstLocalEvidence.id);
    expect(() =>
      context.native
        .prepare('UPDATE signal_evidence SET object_id = ? WHERE id = ?')
        .run(foreignEntityEvidenceTarget.objectId, firstLocalEvidence.id),
    ).toThrow(/TARGET_INVALID_OR_CROSS_CAMPAIGN/u);
    expect(() =>
      context.native
        .prepare('UPDATE campaign_signals SET campaign_id = ? WHERE id = ?')
        .run(foreignCampaignId, signalId),
    ).toThrow(/TARGET_INVALID_OR_CROSS_CAMPAIGN/u);

    for (const target of localEvidence) {
      const table = evidenceObjectTables[target.objectType];
      expect(() =>
        context.native.prepare(`UPDATE ${table} SET id = NULL WHERE id = ?`).run(target.objectId),
      ).toThrow(/TARGET_IN_USE/u);
      expect(() =>
        context.native
          .prepare(`UPDATE ${table} SET campaign_id = ? WHERE id = ?`)
          .run(foreignCampaignId, target.objectId),
      ).toThrow();
      expect(() =>
        context.native
          .prepare(`UPDATE ${table} SET id = ? WHERE id = ?`)
          .run(randomUUID(), target.objectId),
      ).toThrow(/TARGET_IN_USE/u);
    }

    const localEntityEvidence = localEvidence.find(({ objectType }) => objectType === 'entity');
    if (!localEntityEvidence) throw new Error('Alvo entity de teste não foi inicializado.');
    expect(() =>
      context.native
        .prepare('UPDATE entities SET campaign_id = ? WHERE id = ?')
        .run(foreignCampaignId, localEntityEvidence.objectId),
    ).toThrow(/TARGET_INVALID_OR_CROSS_CAMPAIGN/u);
    expect(() =>
      context.native
        .prepare('UPDATE entities SET id = ? WHERE id = ?')
        .run(randomUUID(), localEntityEvidence.objectId),
    ).toThrow(/TARGET_IN_USE/u);
    context.native
      .prepare('UPDATE entities SET archived_at = ? WHERE id = ?')
      .run(now, localEntityEvidence.objectId);
    expect(
      context.native
        .prepare('SELECT count(*) AS count FROM signal_evidence WHERE signal_id = ?')
        .get(signalId),
    ).toEqual({ count: 6 });

    expect(context.native.pragma('recursive_triggers', { simple: true })).toBe(0);
    expect(context.native.pragma('foreign_keys', { simple: true })).toBe(1);
    for (const target of localEvidence) {
      const table = evidenceObjectTables[target.objectType];
      // Clone the actual persisted row, avoiding omitted required columns or
      // unrelated constraints as false-positive explanations for REPLACE failure.
      const columns = (
        context.native.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      ).map(({ name }) => name);
      for (const crossCampaign of [false, true]) {
        const projection = columns.map((name) =>
          name === 'campaign_id' && crossCampaign ? '?' : name,
        );
        expect(() =>
          context.native
            .prepare(
              `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
             SELECT ${projection.join(', ')} FROM ${table} WHERE id = ?`,
            )
            .run(...(crossCampaign ? [foreignCampaignId, target.objectId] : [target.objectId])),
        ).toThrow(/TARGET_REPLACE_FORBIDDEN/u);
      }
    }
    for (const target of foreignTargets) {
      const table = evidenceObjectTables[target.objectType];
      context.native
        .prepare(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE id = ?`)
        .run(target.objectId);
      const localTarget = localTargets.find(({ objectType }) => objectType === target.objectType);
      if (!localTarget) throw new Error('Alvo local de teste ausente.');
      expect(() =>
        context.native
          .prepare(`UPDATE OR REPLACE ${table} SET id = ? WHERE id = ?`)
          .run(localTarget.objectId, target.objectId),
      ).toThrow(/TARGET_IN_USE/u);
    }
    const sessionEvidence = localEvidence.find(({ objectType }) => objectType === 'session');
    if (!sessionEvidence) throw new Error('Sessão de evidência de teste ausente.');
    expect(() =>
      context.native
        .prepare(
          `INSERT OR REPLACE INTO sessions (id, campaign_id, sequence_number, title, created_at, updated_at)
         SELECT ?, campaign_id, sequence_number, title, created_at, updated_at FROM sessions WHERE id = ?`,
        )
        .run(randomUUID(), sessionEvidence.objectId),
    ).toThrow(/TARGET_REPLACE_FORBIDDEN/u);
    // Non-conflicting inserts and replacement of an unreferenced natural key remain allowed.
    context.native
      .prepare(
        `INSERT INTO sessions (id, campaign_id, sequence_number, title, created_at, updated_at)
       VALUES (?, ?, 2, 'Livre', ?, ?)`,
      )
      .run(randomUUID(), campaignId, now, now);
    const freeSessionId = randomUUID();
    context.native
      .prepare(
        `INSERT OR REPLACE INTO sessions (id, campaign_id, sequence_number, title, created_at, updated_at)
       VALUES (?, ?, 2, 'Livre substituída', ?, ?)`,
      )
      .run(freeSessionId, campaignId, now, now);
    expect(() =>
      context.native
        .prepare('UPDATE OR REPLACE sessions SET sequence_number = 1 WHERE id = ?')
        .run(freeSessionId),
    ).toThrow(/TARGET_REPLACE_FORBIDDEN/u);
    for (const target of localEvidence)
      expect(
        context.native
          .prepare(
            `SELECT id, campaign_id FROM ${evidenceObjectTables[target.objectType]} WHERE id = ?`,
          )
          .get(target.objectId),
      ).toEqual({ id: target.objectId, campaign_id: campaignId });

    for (const target of localEvidence) {
      context.native
        .prepare(`DELETE FROM ${evidenceObjectTables[target.objectType]} WHERE id = ?`)
        .run(target.objectId);
      expect(
        context.native
          .prepare('SELECT count(*) AS count FROM signal_evidence WHERE id = ?')
          .get(target.id),
      ).toEqual({ count: 0 });
    }

    context.native.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
    expect(
      context.native
        .prepare(
          `SELECT
             (SELECT count(*) FROM campaign_signals WHERE id = ?) AS signals,
             (SELECT count(*) FROM signal_evidence WHERE signal_id = ?) AS evidence`,
        )
        .get(signalId, signalId),
    ).toEqual({ signals: 0, evidence: 0 });
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
  });
});

async function createDirectories(): Promise<DataDirectories> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'campaign-signal-foundation-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  return directories;
}

async function openTestDatabase(directories: DataDirectories): Promise<DatabaseContext> {
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  return context;
}

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

function seedEvidenceTargets(
  database: Database.Database,
  campaignId: string,
  label: string,
): { objectType: keyof typeof evidenceObjectTables; objectId: string }[] {
  const now = timestamp();
  const entityTypeId = randomUUID();
  const entityIds = Array.from({ length: 4 }, () => randomUUID());
  const evidenceEntityId = entityIds[3];
  if (!evidenceEntityId) throw new Error('Entidade de evidência de teste não foi inicializada.');
  database
    .prepare(
      `INSERT INTO entity_types (
        id, campaign_id, name, singular_name, slug, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entityTypeId,
      campaignId,
      'Personagens',
      'Personagem',
      `personagens-${campaignId.slice(0, 8)}`,
      now,
      now,
    );
  const insertEntity = database.prepare(
    `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  entityIds.forEach((id, index) =>
    insertEntity.run(id, campaignId, entityTypeId, `${label} ${String(index)}`, now, now),
  );

  const sessionId = randomUUID();
  database
    .prepare(
      `INSERT INTO sessions (
        id, campaign_id, sequence_number, title, created_at, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?)`,
    )
    .run(sessionId, campaignId, `${label} sessão`, now, now);

  const relationshipTypeId = randomUUID();
  database
    .prepare(
      `INSERT INTO relationship_types (
        id, campaign_id, name, slug, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      relationshipTypeId,
      campaignId,
      `${label} vínculo`,
      `vinculo-${campaignId.slice(0, 8)}`,
      now,
      now,
    );

  const relationshipId = randomUUID();
  database
    .prepare(
      `INSERT INTO relationships (
        id, campaign_id, relationship_type_id, source_entity_id, target_entity_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(relationshipId, campaignId, relationshipTypeId, entityIds[0], entityIds[1], now, now);

  const assertionId = randomUUID();
  database
    .prepare(
      `INSERT INTO assertions (
        id, campaign_id, subject_entity_id, predicate, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(assertionId, campaignId, entityIds[0], 'conhece', now, now);

  const eventId = randomUUID();
  database
    .prepare(
      `INSERT INTO events (
        id, campaign_id, title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(eventId, campaignId, `${label} evento`, now, now);

  const noteId = randomUUID();
  database
    .prepare(
      `INSERT INTO notes (
        id, campaign_id, title, body_markdown, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(noteId, campaignId, `${label} nota`, 'Texto de teste', now, now);

  return [
    { objectType: 'entity', objectId: evidenceEntityId },
    { objectType: 'relationship', objectId: relationshipId },
    { objectType: 'assertion', objectId: assertionId },
    { objectType: 'event', objectId: eventId },
    { objectType: 'session', objectId: sessionId },
    { objectType: 'note', objectId: noteId },
  ];
}

function timestamp(): string {
  return new Date().toISOString();
}
