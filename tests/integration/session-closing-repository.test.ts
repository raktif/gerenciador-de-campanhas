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
import { migrations } from '../../src/db/migrations/registry';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { SessionClosingRepository } from '../../src/db/repositories/session-closing-repository';
import { SessionClosingService } from '../../src/main/services/session-closing-service';
import type { Session } from '../../src/core/contracts/sessions';
import { TestLogger } from '../helpers/test-logger';

const contexts: DatabaseContext[] = [];
const roots: string[] = [];
const now = '2026-11-19T15:00:00.000Z';
afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('encerramento incremental e preparação', () => {
  it('persiste etapas separadas, retoma progresso, executa encerramento rápido e seleciona preparação', async () => {
    const { context, service, sessionId, campaignId } = await setup();
    const initial = service.get({ campaignId, sessionId });
    expect(initial.steps).toHaveLength(8);
    expect(initial.steps.every((step) => step.status === 'pending')).toBe(true);
    const confirmed = service.updateStep({
      campaignId,
      sessionId,
      step: 'events',
      revision: 1,
      status: 'completed',
    });
    expect(confirmed.steps.find((step) => step.step === 'events')).toMatchObject({
      status: 'completed',
      revision: 2,
    });
    expect(() =>
      service.updateStep({ campaignId, sessionId, step: 'events', revision: 1, status: 'skipped' }),
    ).toThrow(expect.objectContaining({ code: 'SESSION_CLOSING_REVISION_CONFLICT' }));
    const quick = service.quickClose({ campaignId, sessionId });
    expect(quick.steps.find((step) => step.step === 'events')?.status).toBe('completed');
    expect(quick.steps.filter((step) => step.status === 'skipped')).toHaveLength(7);
    const preparation = service.getPreparation({ campaignId, sessionId });
    expect(preparation.items).toHaveLength(1);
    expect(preparation.items[0]?.objectType).toBe('story_thread');
    const preparationItem = preparation.items[0];
    expect(preparationItem).toBeDefined();
    if (preparationItem === undefined) throw new Error('Item de preparaÃ§Ã£o ausente.');
    const selected = service.selectPreparationItem({
      campaignId,
      sessionId,
      id: preparationItem.id,
      revision: preparationItem.revision,
      selected: true,
    });
    expect(selected.items[0]?.selected).toBe(true);
    expect(() =>
      service.selectPreparationItem({
        campaignId,
        sessionId,
        id: preparationItem.id,
        revision: preparationItem.revision,
        selected: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'SESSION_PREPARATION_REVISION_CONFLICT' }));
    expect(
      context.native
        .prepare('SELECT count(*) AS total FROM session_closing_steps WHERE session_id = ?')
        .get(sessionId),
    ).toEqual({ total: 8 });
  });

  it('preserva etapa pendente quando o recálculo de sinais falha e conclui após sucesso', async () => {
    const { context, campaignId, sessionId } = await setup();
    const repository = new SessionClosingRepository(context.native);
    const campaigns = new CampaignRepository(context.orm);
    const calls: string[] = [];
    const failing = new SessionClosingService({
      repository,
      campaigns,
      signals: {
        recalculate: () => {
          calls.push('failed');
          throw new Error('falha do motor');
        },
      },
      now: () => now,
    });
    failing.get({ campaignId, sessionId });
    expect(() =>
      failing.updateStep({
        campaignId,
        sessionId,
        step: 'signals',
        revision: 1,
        status: 'completed',
      }),
    ).toThrow('falha do motor');
    expect(
      repository
        .getWorkflow(campaignId, sessionId, now)
        .steps.find((step) => step.step === 'signals')?.status,
    ).toBe('pending');
    const successful = new SessionClosingService({
      repository,
      campaigns,
      signals: {
        recalculate: () => {
          calls.push('success');
          return { items: [], detectedCount: 0, expiredSnoozes: 0 };
        },
      },
      now: () => now,
    });
    expect(
      successful
        .updateStep({ campaignId, sessionId, step: 'signals', revision: 1, status: 'completed' })
        .steps.find((step) => step.step === 'signals'),
    ).toMatchObject({ status: 'completed', revision: 2 });
    expect(calls).toEqual(['failed', 'success']);
  });

  it('aplica a migração v36 em banco vazio e no upgrade a partir da v35', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'session-closing-upgrade-'));
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
    for (const migration of migrations.filter(({ version }) => version <= 35)) {
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
        .run(migration.version, migration.name, migration.checksum, now);
      if (migration.requiresForeignKeysDisabled) {
        if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table = OFF');
        legacy.pragma('foreign_keys = ON');
      }
    }
    legacy.close();
    const context = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(context);
    expect(context.schemaVersion).toBe(36);
    expect(
      context.native
        .prepare(
          "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('session_closing_steps', 'session_preparation_items')",
        )
        .get(),
    ).toEqual({ total: 2 });
  });
});

async function setup(): Promise<{
  context: DatabaseContext;
  service: SessionClosingService;
  campaignId: string;
  sessionId: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'session-closing-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const campaignId = randomUUID();
  const sessionId = randomUUID();
  context.native
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, 'Encerramento', now, now);
  const session: Session = {
    id: sessionId,
    campaignId,
    sequenceNumber: 1,
    title: 'Sessão atual',
    playedAt: null,
    status: 'completed',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
  new SessionRepository(context.orm).insert(session);
  const threadId = randomUUID();
  context.native
    .prepare(
      "INSERT INTO story_threads (id, campaign_id, title, description, thread_type, status, status_before_archive, origin_kind, origin_session_id, origin_reason, created_at, updated_at, revision) VALUES (?, ?, ?, NULL, 'mystery', 'open', NULL, 'manual', NULL, NULL, ?, ?, 1)",
    )
    .run(threadId, campaignId, 'Fio para a próxima sessão', now, now);
  return {
    context,
    campaignId,
    sessionId,
    service: new SessionClosingService({
      repository: new SessionClosingRepository(context.native),
      campaigns: new CampaignRepository(context.orm),
      now: () => now,
    }),
  };
}
