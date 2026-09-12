import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import {
  createSessionInputSchema,
  sessionPageRequestSchema,
  sessionSchema,
  type Session,
  type SessionPageRequest,
  type SessionPageResult,
} from '../../src/core/contracts/sessions';
import { AppError } from '../../src/core/errors/app-error';
import type { SessionRepositoryUpdate } from '../../src/db/repositories/session-repository';
import {
  SessionService,
  type SessionRepositoryPort,
} from '../../src/main/services/session-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const sessionId = '70000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-04T12:00:00.000Z';

describe('SessionService', () => {
  it('cria uma sessão planejada e rejeita campanha inexistente sem persistir', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    const created = service.create(
      createSessionInputSchema.parse({
        campaignId,
        sequenceNumber: 1,
        title: 'Planejamento',
        gmNotesMarkdown: 'Preparar mapa.',
      }),
    );
    expect(created).toMatchObject({ status: 'planned', revision: 1, playedAt: null });
    expect(repository.count()).toBe(1);
    expect(
      capture(() =>
        service.create(
          createSessionInputSchema.parse({
            campaignId: missingCampaignId,
            sequenceNumber: 1,
            title: 'Não persistir',
          }),
        ),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
    expect(repository.count()).toBe(1);
  });

  it('permite somente as transições planejadas e mantém estados finais irreversíveis', () => {
    const repository = new MemoryRepository([createSession()]);
    const service = createService(repository);
    let current = service.update({
      campaignId,
      id: sessionId,
      revision: 1,
      patch: { status: 'in_progress' },
    });
    expect(current).toMatchObject({ status: 'in_progress', revision: 2 });
    current = service.update({
      campaignId,
      id: sessionId,
      revision: 2,
      patch: { status: 'completed', summaryMarkdown: 'Resumo manual.' },
    });
    expect(current).toMatchObject({ status: 'completed', summaryMarkdown: 'Resumo manual.' });
    expect(
      capture(() =>
        service.update({
          campaignId,
          id: sessionId,
          revision: 3,
          patch: { status: 'in_progress' },
        }),
      ).code,
    ).toBe('INVALID_SESSION_TRANSITION');
    expect(
      capture(() =>
        createService(new MemoryRepository([createSession()])).update({
          campaignId,
          id: sessionId,
          revision: 1,
          patch: { status: 'completed' },
        }),
      ).code,
    ).toBe('INVALID_SESSION_TRANSITION');
  });

  it('permite cancelar uma sessão em andamento e rejeita toda transição a partir de cancelada', () => {
    const repository = new MemoryRepository([createSession()]);
    const service = createService(repository);
    const inProgress = service.update({
      campaignId,
      id: sessionId,
      revision: 1,
      patch: { status: 'in_progress' },
    });
    const cancelled = service.update({
      campaignId,
      id: sessionId,
      revision: inProgress.revision,
      patch: { status: 'cancelled' },
    });
    expect(cancelled).toMatchObject({ status: 'cancelled', revision: 3 });
    for (const status of ['planned', 'in_progress', 'completed', 'cancelled'] as const) {
      expect(
        capture(() =>
          service.update({
            campaignId,
            id: sessionId,
            revision: cancelled.revision,
            patch: { status },
          }),
        ).code,
      ).toBe('INVALID_SESSION_TRANSITION');
    }
  });

  it('rejeita toda transição a partir de concluída', () => {
    const repository = new MemoryRepository([createSession({ status: 'completed', revision: 3 })]);
    const service = createService(repository);
    for (const status of ['planned', 'in_progress', 'completed', 'cancelled'] as const) {
      expect(
        capture(() => service.update({ campaignId, id: sessionId, revision: 3, patch: { status } }))
          .code,
      ).toBe('INVALID_SESSION_TRANSITION');
    }
  });

  it('aceita cancelamento nos estados permitidos e protege revisão e campanhas', () => {
    const repository = new MemoryRepository([createSession()]);
    const service = createService(repository);
    expect(
      service.update({ campaignId, id: sessionId, revision: 1, patch: { status: 'cancelled' } }),
    ).toMatchObject({ status: 'cancelled', revision: 2 });
    expect(
      capture(() =>
        service.update({ campaignId, id: sessionId, revision: 1, patch: { title: 'Obsoleta' } }),
      ).code,
    ).toBe('REVISION_CONFLICT');
    expect(capture(() => service.get({ campaignId: otherCampaignId, id: sessionId })).code).toBe(
      'SESSION_NOT_FOUND',
    );
    expect(
      capture(() => service.list(sessionPageRequestSchema.parse({ campaignId: missingCampaignId })))
        .code,
    ).toBe('CAMPAIGN_NOT_FOUND');
  });
});

class MemoryRepository implements SessionRepositoryPort {
  private records: Session[];

  public constructor(records: Session[] = []) {
    this.records = records;
  }

  public count(): number {
    return this.records.length;
  }

  public insert(session: Session): Session {
    if (
      this.records.some(
        (record) =>
          record.campaignId === session.campaignId &&
          record.sequenceNumber === session.sequenceNumber,
      )
    )
      throw new AppError('SESSION_SEQUENCE_CONFLICT', 'Sequência duplicada.');
    this.records.push(session);
    return session;
  }

  public findById(campaign: string, id: string): Session | null {
    return this.records.find((item) => item.campaignId === campaign && item.id === id) ?? null;
  }

  public list(request: SessionPageRequest): SessionPageResult {
    const items = this.records.filter((item) => item.campaignId === request.campaignId);
    return { items, nextCursor: null, total: items.length };
  }

  public update(input: SessionRepositoryUpdate, updatedAt: string): Session {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new Error('Registro ausente.');
    if (current.revision !== input.revision) throw new Error('Conflito não interceptado.');
    const updated = sessionSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records = this.records.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  }
}

function createService(repository: SessionRepositoryPort): SessionService {
  const campaigns = new Map<string, Campaign>([
    [campaignId, createCampaign(campaignId)],
    [otherCampaignId, createCampaign(otherCampaignId)],
  ]);
  return new SessionService({
    repository,
    campaigns: { findById: (id) => campaigns.get(id) ?? null },
    createId: () => sessionId,
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

function createSession(overrides: Partial<Session> = {}): Session {
  return sessionSchema.parse({
    id: sessionId,
    campaignId,
    sequenceNumber: 1,
    title: 'Sessão',
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

function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
