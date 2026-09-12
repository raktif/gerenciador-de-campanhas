import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { Entity } from '../../src/core/contracts/entities';
import {
  createSessionIntentionInputSchema,
  sessionIntentionPageRequestSchema,
  sessionIntentionSchema,
  type Session,
  type SessionIntention,
  type SessionIntentionPageRequest,
  type SessionIntentionPageResult,
} from '../../src/core/contracts/sessions';
import { AppError } from '../../src/core/errors/app-error';
import type { SessionIntentionRepositoryUpdate } from '../../src/db/repositories/session-intention-repository';
import {
  SessionIntentionService,
  type SessionIntentionRepositoryPort,
} from '../../src/main/services/session-intention-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const sessionId = '70000000-0000-4000-8000-000000000001';
const otherSessionId = '70000000-0000-4000-8000-000000000002';
const intentionId = '80000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const foreignEntityId = '30000000-0000-4000-8000-000000000002';
const archivedEntityId = '30000000-0000-4000-8000-000000000003';
const timestamp = '2026-09-04T12:00:00.000Z';

describe('SessionIntentionService', () => {
  it('cria intenção aberta, com entidade opcional, e rejeita campanha ou sessão ausentes', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    expect(
      service.create(
        createSessionIntentionInputSchema.parse({ campaignId, sessionId, text: '  Investigar. ' }),
      ),
    ).toMatchObject({ id: intentionId, entityId: null, text: 'Investigar.', status: 'open' });
    expect(
      capture(() =>
        service.create(
          createSessionIntentionInputSchema.parse({
            campaignId: missingCampaignId,
            sessionId,
            text: 'Não persistir',
          }),
        ),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
    expect(
      capture(() =>
        service.create(
          createSessionIntentionInputSchema.parse({
            campaignId,
            sessionId: otherSessionId,
            text: 'Sessão estrangeira',
          }),
        ),
      ).code,
    ).toBe('SESSION_NOT_FOUND');
  });

  it('exige entidade ativa da mesma campanha e protege filtro de entidade', () => {
    const service = createService(new MemoryRepository());
    const input = (entityId: string) =>
      createSessionIntentionInputSchema.parse({
        campaignId,
        sessionId,
        entityId,
        text: 'Objetivo',
      });
    expect(capture(() => service.create(input(foreignEntityId))).code).toBe('ENTITY_NOT_FOUND');
    expect(capture(() => service.create(input(archivedEntityId))).code).toBe(
      'INVALID_ENTITY_STATE',
    );
    expect(
      capture(() =>
        service.list(
          sessionIntentionPageRequestSchema.parse({
            campaignId,
            sessionId,
            filters: { entityId: foreignEntityId },
          }),
        ),
      ).code,
    ).toBe('ENTITY_NOT_FOUND');
  });

  it('permite encerrar somente a partir de aberta e mantém terminais irreversíveis', () => {
    for (const terminal of ['completed', 'abandoned', 'transformed'] as const) {
      const repository = new MemoryRepository([createIntention()]);
      const service = createService(repository);
      const updated = service.update({
        campaignId,
        sessionId,
        id: intentionId,
        revision: 1,
        patch: { status: terminal },
      });
      expect(updated.status).toBe(terminal);
      for (const status of ['open', 'completed', 'abandoned', 'transformed'] as const) {
        expect(
          capture(() =>
            service.update({
              campaignId,
              sessionId,
              id: intentionId,
              revision: 2,
              patch: { status },
            }),
          ).code,
        ).toBe('INVALID_SESSION_INTENTION_TRANSITION');
      }
    }
    expect(
      capture(() =>
        createService(new MemoryRepository([createIntention()])).update({
          campaignId,
          sessionId,
          id: intentionId,
          revision: 1,
          patch: { status: 'open' },
        }),
      ).code,
    ).toBe('INVALID_SESSION_INTENTION_TRANSITION');
  });

  it('atualiza texto e entidade, exigindo revisão atual', () => {
    const repository = new MemoryRepository([createIntention()]);
    const service = createService(repository);
    expect(
      service.update({
        campaignId,
        sessionId,
        id: intentionId,
        revision: 1,
        patch: { text: 'Novo objetivo', entityId },
      }),
    ).toMatchObject({ text: 'Novo objetivo', entityId, revision: 2 });
    expect(
      capture(() =>
        service.update({
          campaignId,
          sessionId,
          id: intentionId,
          revision: 1,
          patch: { text: 'Obsoleto' },
        }),
      ).code,
    ).toBe('REVISION_CONFLICT');
  });
});

class MemoryRepository implements SessionIntentionRepositoryPort {
  private records: SessionIntention[];

  public constructor(records: SessionIntention[] = []) {
    this.records = records;
  }

  public insert(intention: SessionIntention): SessionIntention {
    this.records.push(intention);
    return intention;
  }

  public findById(campaign: string, session: string, id: string): SessionIntention | null {
    return (
      this.records.find(
        (intention) =>
          intention.sessionId === session && intention.id === id && campaign === campaignId,
      ) ?? null
    );
  }

  public list(request: SessionIntentionPageRequest): SessionIntentionPageResult {
    const items = this.records.filter((intention) => intention.sessionId === request.sessionId);
    return { items, nextCursor: null, total: items.length };
  }

  public update(input: SessionIntentionRepositoryUpdate, updatedAt: string): SessionIntention {
    const current = this.findById(input.campaignId, input.sessionId, input.id);
    if (current === null) throw new Error('Intenção ausente.');
    if (current.revision !== input.revision) throw new Error('Conflito não interceptado.');
    const updated = sessionIntentionSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records = this.records.map((intention) =>
      intention.id === updated.id ? updated : intention,
    );
    return updated;
  }
}

function createService(repository: SessionIntentionRepositoryPort): SessionIntentionService {
  const campaigns = new Map<string, Campaign>([
    [campaignId, createCampaign(campaignId)],
    [otherCampaignId, createCampaign(otherCampaignId)],
  ]);
  const sessions = new Map<string, Session>([
    [sessionId, createSession(sessionId, campaignId)],
    [otherSessionId, createSession(otherSessionId, otherCampaignId)],
  ]);
  const entities = new Map<string, Entity>([
    [entityId, createEntity(entityId, campaignId)],
    [foreignEntityId, createEntity(foreignEntityId, otherCampaignId)],
    [archivedEntityId, createEntity(archivedEntityId, campaignId, timestamp)],
  ]);
  return new SessionIntentionService({
    repository,
    campaigns: { findById: (id) => campaigns.get(id) ?? null },
    sessions: {
      findById: (campaign, id) => {
        const session = sessions.get(id);
        return session?.campaignId === campaign ? session : null;
      },
    },
    entities: {
      findById: (campaign, id) => {
        const entity = entities.get(id);
        return entity?.campaignId === campaign ? entity : null;
      },
    },
    createId: () => intentionId,
    now: () => timestamp,
  });
}

function createCampaign(id: string): Campaign {
  return {
    id,
    name: id,
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    imagePath: null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
  };
}

function createSession(id: string, campaignId: string): Session {
  return {
    id,
    campaignId,
    sequenceNumber: 1,
    title: id,
    playedAt: null,
    status: 'planned',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

function createEntity(id: string, campaignId: string, archivedAt: string | null = null): Entity {
  return {
    id,
    campaignId,
    entityTypeId: '10000000-0000-4000-8000-000000000001',
    name: id,
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt,
    revision: 1,
  };
}

function createIntention(overrides: Partial<SessionIntention> = {}): SessionIntention {
  return sessionIntentionSchema.parse({
    id: intentionId,
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

function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
