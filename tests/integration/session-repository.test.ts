import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSessionInputSchema,
  sessionPageRequestSchema,
  sessionSchema,
  type Session,
} from '../../src/core/contracts/sessions';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { SessionService } from '../../src/main/services/session-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const timestamp = '2026-09-04T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SessionRepository', () => {
  it('cria fonte de sessão na mesma transação e rejeita campanha inexistente sem persistir', async () => {
    const { context, repository } = await setup();
    const service = new SessionService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      createId: () => '70000000-0000-4000-8000-000000000001',
      now: () => timestamp,
    });
    const created = service.create(
      createSessionInputSchema.parse({ campaignId, sequenceNumber: 1, title: 'Planejamento' }),
    );
    expect(created).toMatchObject({ status: 'planned', revision: 1 });
    expect(
      context.native
        .prepare('SELECT id, kind, session_id FROM sources WHERE id = ?')
        .get(created.id),
    ).toEqual({ id: created.id, kind: 'session', session_id: created.id });
    expect(
      captureCode(() =>
        service.create(
          createSessionInputSchema.parse({
            campaignId: missingCampaignId,
            sequenceNumber: 1,
            title: 'Não persistir',
          }),
        ),
      ),
    ).toBe('CAMPAIGN_NOT_FOUND');
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM sessions').get()).toEqual({
      total: 1,
    });
    context.close();
  });

  it('mantém sequência única por campanha e mapeia o conflito com segurança', async () => {
    const { context, repository } = await setup();
    repository.insert(createSession('70000000-0000-4000-8000-000000000001'));
    expect(() =>
      repository.insert(
        createSession('70000000-0000-4000-8000-000000000002', { title: 'Duplicada' }),
      ),
    ).toThrow(expect.objectContaining({ code: 'SESSION_SEQUENCE_CONFLICT' }));
    repository.insert(
      createSession('70000000-0000-4000-8000-000000000003', {
        campaignId: otherCampaignId,
      }),
    );
    expect(repository.list(sessionPageRequestSchema.parse({ campaignId })).items).toHaveLength(1);
    expect(repository.findById(otherCampaignId, '70000000-0000-4000-8000-000000000001')).toBeNull();
    context.close();
  });

  it('reverte sessão e fonte quando a criação da fonte falha na transação', async () => {
    const { context, repository } = await setup();
    context.native.exec(`
      CREATE TRIGGER reject_session_source_for_test
      BEFORE INSERT ON sources
      WHEN NEW.kind = 'session'
      BEGIN
        SELECT RAISE(ABORT, 'TEST_SOURCE_INSERT_FAILURE');
      END;
    `);
    expect(() =>
      repository.insert(createSession('70000000-0000-4000-8000-000000000001')),
    ).toThrow();
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM sessions').get()).toEqual({
      total: 0,
    });
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM sources').get()).toEqual({
      total: 0,
    });
    context.close();
  });

  it('pagina de forma estável, associa cursor ao contexto e mantém isolamento', async () => {
    const { context, repository } = await setup();
    for (let index = 1; index <= 4; index += 1) {
      repository.insert(
        createSession(`70000000-0000-4000-8000-${String(index).padStart(12, '0')}`, {
          sequenceNumber: index,
          title: `Sessão ${String(index)}`,
          updatedAt: index < 3 ? timestamp : `2026-09-04T1${String(index)}:00:00.000Z`,
        }),
      );
    }
    const request = sessionPageRequestSchema.parse({
      campaignId,
      limit: 2,
      sort: 'sequenceNumber',
      order: 'asc',
    });
    const first = repository.list(request);
    const second = repository.list({ ...request, cursor: first.nextCursor ?? undefined });
    expect([...first.items, ...second.items].map((session) => session.sequenceNumber)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(() =>
      repository.list({
        ...request,
        campaignId: otherCampaignId,
        cursor: first.nextCursor ?? undefined,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    expect(() =>
      repository.list({ ...request, order: 'desc', cursor: first.nextCursor ?? undefined }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    const incompatibleSequenceCursor = Buffer.from(
      JSON.stringify({
        version: 1,
        campaignId,
        sort: 'sequenceNumber',
        order: 'asc',
        value: '2',
        id: '70000000-0000-4000-8000-000000000002',
      }),
      'utf8',
    ).toString('base64url');
    const incompatibleUpdatedAtCursor = Buffer.from(
      JSON.stringify({
        version: 1,
        campaignId,
        sort: 'updatedAt',
        order: 'asc',
        value: 2,
        id: '70000000-0000-4000-8000-000000000002',
      }),
      'utf8',
    ).toString('base64url');
    expect(() => repository.list({ ...request, cursor: incompatibleSequenceCursor })).toThrow(
      expect.objectContaining({ code: 'INVALID_CURSOR' }),
    );
    expect(() =>
      repository.list({ ...request, sort: 'updatedAt', cursor: incompatibleUpdatedAtCursor }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    context.close();
  });

  it('persiste edição, transições, revisão otimista e impede acesso cruzado', async () => {
    const { context, repository } = await setup();
    repository.insert(createSession('70000000-0000-4000-8000-000000000001'));
    const service = new SessionService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      now: () => '2026-09-04T13:00:00.000Z',
    });
    const started = service.update({
      campaignId,
      id: '70000000-0000-4000-8000-000000000001',
      revision: 1,
      patch: { status: 'in_progress', playedAt: '2026-09-04T13:00:00.000Z' },
    });
    const completed = service.update({
      campaignId,
      id: started.id,
      revision: 2,
      patch: { status: 'completed', summaryMarkdown: 'Resumo manual.' },
    });
    expect(completed).toMatchObject({ status: 'completed', revision: 3 });
    expect(
      captureCode(() =>
        service.update({
          campaignId,
          id: completed.id,
          revision: 2,
          patch: { title: 'Obsoleta' },
        }),
      ),
    ).toBe('REVISION_CONFLICT');
    expect(captureCode(() => service.get({ campaignId: otherCampaignId, id: completed.id }))).toBe(
      'SESSION_NOT_FOUND',
    );
    context.close();
  });
});

async function setup(): Promise<{ context: DatabaseContext; repository: SessionRepository }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-sessions-test-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const insertCampaign = context.native.prepare(
    "INSERT INTO campaigns (id, name, status, created_at, updated_at, revision) VALUES (?, ?, 'active', ?, ?, 1)",
  );
  insertCampaign.run(campaignId, 'Ethéria', timestamp, timestamp);
  insertCampaign.run(otherCampaignId, 'Outra', timestamp, timestamp);
  return { context, repository: new SessionRepository(context.orm) };
}

function createSession(id: string, overrides: Partial<Session> = {}): Session {
  return sessionSchema.parse({
    id,
    campaignId,
    sequenceNumber: 1,
    title: 'Sessão original',
    playedAt: null,
    status: 'planned',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    ...overrides,
  });
}

function captureCode(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
