import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSessionIntentionInputSchema,
  sessionIntentionPageRequestSchema,
  sessionIntentionSchema,
  type SessionIntention,
} from '../../src/core/contracts/sessions';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityRepository } from '../../src/db/repositories/entity-repository';
import { SessionIntentionRepository } from '../../src/db/repositories/session-intention-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { SessionIntentionService } from '../../src/main/services/session-intention-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const sessionId = '70000000-0000-4000-8000-000000000001';
const otherSessionId = '70000000-0000-4000-8000-000000000002';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const otherEntityTypeId = '10000000-0000-4000-8000-000000000002';
const entityA = '30000000-0000-4000-8000-000000000001';
const entityB = '30000000-0000-4000-8000-000000000002';
const foreignEntity = '30000000-0000-4000-8000-000000000003';
const archivedEntity = '30000000-0000-4000-8000-000000000004';
const intentionId = '80000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-04T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SessionIntentionRepository', () => {
  it('cria, consulta e atualiza intenção sem cruzar sessão, entidade ou campanha', async () => {
    const { context, service } = await setup();
    const created = service.create(
      createSessionIntentionInputSchema.parse({
        campaignId,
        sessionId,
        entityId: entityA,
        text: '  Encontrar o farol. ',
      }),
    );
    expect(created).toMatchObject({
      id: intentionId,
      entityId: entityA,
      text: 'Encontrar o farol.',
      status: 'open',
      revision: 1,
    });
    const updated = service.update({
      campaignId,
      sessionId,
      id: created.id,
      revision: 1,
      patch: { status: 'completed', entityId: entityB },
    });
    expect(updated).toMatchObject({ status: 'completed', entityId: entityB, revision: 2 });
    expect(service.get({ campaignId, sessionId, id: created.id })).toEqual(updated);
    expect(
      captureCode(() =>
        service.create(
          createSessionIntentionInputSchema.parse({
            campaignId,
            sessionId: otherSessionId,
            text: 'Sessão estrangeira',
          }),
        ),
      ),
    ).toBe('SESSION_NOT_FOUND');
    expect(
      captureCode(() =>
        service.create(
          createSessionIntentionInputSchema.parse({
            campaignId,
            sessionId,
            entityId: foreignEntity,
            text: 'Entidade estrangeira',
          }),
        ),
      ),
    ).toBe('ENTITY_NOT_FOUND');
    expect(
      captureCode(() =>
        service.create(
          createSessionIntentionInputSchema.parse({
            campaignId,
            sessionId,
            entityId: archivedEntity,
            text: 'Entidade arquivada',
          }),
        ),
      ),
    ).toBe('INVALID_ENTITY_STATE');
    context.close();
  });

  it('pagina com filtros determinísticos e rejeita cursor alterado ou de outra sessão', async () => {
    const { context, repository } = await setup();
    for (let index = 1; index <= 4; index += 1) {
      repository.insert(
        createIntention(`80000000-0000-4000-8000-${String(index).padStart(12, '0')}`, {
          entityId: index % 2 === 0 ? entityA : null,
          status: index === 3 ? 'completed' : 'open',
          createdAt: index < 3 ? timestamp : `2026-09-04T1${String(index)}:00:00.000Z`,
          updatedAt: index < 3 ? timestamp : `2026-09-04T1${String(index)}:00:00.000Z`,
        }),
      );
    }
    const request = sessionIntentionPageRequestSchema.parse({
      campaignId,
      sessionId,
      limit: 2,
      sort: 'createdAt',
      order: 'asc',
    });
    const first = repository.list(request);
    const second = repository.list({ ...request, cursor: first.nextCursor ?? undefined });
    expect([...first.items, ...second.items].map((intention) => intention.id)).toEqual([
      '80000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000002',
      '80000000-0000-4000-8000-000000000003',
      '80000000-0000-4000-8000-000000000004',
    ]);
    expect(
      repository
        .list(
          sessionIntentionPageRequestSchema.parse({
            campaignId,
            sessionId,
            filters: { entityId: entityA },
            sort: 'createdAt',
            order: 'asc',
          }),
        )
        .items.map((intention) => intention.id),
    ).toEqual(['80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000004']);
    expect(
      repository
        .list(
          sessionIntentionPageRequestSchema.parse({
            campaignId,
            sessionId,
            filters: { status: 'completed' },
          }),
        )
        .items.map((intention) => intention.id),
    ).toEqual(['80000000-0000-4000-8000-000000000003']);
    expect(() =>
      repository.list({
        ...request,
        sessionId: otherSessionId,
        cursor: first.nextCursor ?? undefined,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    const incompatibleCursor = Buffer.from(
      JSON.stringify({
        version: 1,
        campaignId,
        sessionId,
        sort: 'createdAt',
        order: 'asc',
        value: 2,
        id: '80000000-0000-4000-8000-000000000002',
      }),
      'utf8',
    ).toString('base64url');
    expect(() => repository.list({ ...request, cursor: incompatibleCursor })).toThrow(
      expect.objectContaining({ code: 'INVALID_CURSOR' }),
    );
    context.close();
  });

  it('controla revisão otimista e impede que atualização direta atravesse a campanha', async () => {
    const { context, repository, service } = await setup();
    repository.insert(createIntention(intentionId));
    expect(
      captureCode(() =>
        service.update({
          campaignId,
          sessionId,
          id: intentionId,
          revision: 9,
          patch: { text: 'Obsoleta' },
        }),
      ),
    ).toBe('REVISION_CONFLICT');
    expect(
      captureCode(() =>
        repository.update(
          {
            campaignId: otherCampaignId,
            sessionId,
            id: intentionId,
            revision: 1,
            patch: { text: 'Não pode atualizar' },
          },
          '2026-09-04T13:00:00.000Z',
        ),
      ),
    ).toBe('SESSION_INTENTION_NOT_FOUND');
    expect(repository.findById(campaignId, sessionId, intentionId)).toMatchObject({
      text: 'Objetivo original',
      revision: 1,
    });
    context.close();
  });
});

async function setup(): Promise<{
  context: DatabaseContext;
  repository: SessionIntentionRepository;
  service: SessionIntentionService;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-session-intentions-test-'));
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
  const insertSession = context.native.prepare(
    "INSERT INTO sessions (id, campaign_id, sequence_number, title, status, created_at, updated_at, revision) VALUES (?, ?, 1, 'Sessão', 'planned', ?, ?, 1)",
  );
  insertSession.run(sessionId, campaignId, timestamp, timestamp);
  insertSession.run(otherSessionId, otherCampaignId, timestamp, timestamp);
  const insertType = context.native.prepare(
    "INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Entidades', 'Entidade', ?, 0, 0, 0, ?, ?, 1)",
  );
  insertType.run(entityTypeId, campaignId, 'entidades', timestamp, timestamp);
  insertType.run(otherEntityTypeId, otherCampaignId, 'outras-entidades', timestamp, timestamp);
  const insertEntity = context.native.prepare(
    "INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, archived_at, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, ?, 1)",
  );
  insertEntity.run(entityA, campaignId, entityTypeId, 'A', null, timestamp, timestamp);
  insertEntity.run(entityB, campaignId, entityTypeId, 'B', null, timestamp, timestamp);
  insertEntity.run(
    archivedEntity,
    campaignId,
    entityTypeId,
    'Arquivada',
    timestamp,
    timestamp,
    timestamp,
  );
  insertEntity.run(
    foreignEntity,
    otherCampaignId,
    otherEntityTypeId,
    'Estrangeira',
    null,
    timestamp,
    timestamp,
  );
  const repository = new SessionIntentionRepository(context.orm);
  return {
    context,
    repository,
    service: new SessionIntentionService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      sessions: new SessionRepository(context.orm),
      entities: new EntityRepository(context.orm),
      createId: () => intentionId,
      now: () => timestamp,
    }),
  };
}

function createIntention(id: string, overrides: Partial<SessionIntention> = {}): SessionIntention {
  return sessionIntentionSchema.parse({
    id,
    sessionId,
    entityId: null,
    text: 'Objetivo original',
    status: 'open',
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
