import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import {
  captureInboxItemInputSchema,
  inboxItemSchema,
  type InboxLifecycleInput,
  type InboxItem,
  type InboxPageRequest,
  type InboxPageResult,
} from '../../src/core/contracts/inbox';
import type { Session } from '../../src/core/contracts/sessions';
import { AppError } from '../../src/core/errors/app-error';
import { InboxService, type InboxRepositoryPort } from '../../src/main/services/inbox-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const sessionId = '70000000-0000-4000-8000-000000000001';
const foreignSessionId = '70000000-0000-4000-8000-000000000002';
const inboxItemId = '80000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-14T12:00:00.000Z';

describe('InboxService', () => {
  it('captura texto sem classificação, com estado novo e origem manual por padrão', () => {
    const repository = new MemoryRepository();
    const captured = createService(repository).capture(
      captureInboxItemInputSchema.parse({ campaignId, rawText: '  O sino tocou três vezes.  ' }),
    );
    expect(captured).toEqual({
      id: inboxItemId,
      campaignId,
      sessionId: null,
      rawText: '  O sino tocou três vezes.  ',
      status: 'new',
      originKind: 'manual',
      capturedAt: timestamp,
      convertedObjectType: null,
      convertedObjectId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
  });

  it('associa a sessão da mesma campanha e registra sua proveniência', () => {
    const captured = createService(new MemoryRepository()).capture(
      captureInboxItemInputSchema.parse({ campaignId, sessionId, rawText: 'A ponte caiu.' }),
    );
    expect(captured).toMatchObject({ sessionId, originKind: 'session', status: 'new' });
  });

  it('rejeita campanha inexistente ou sessão de outra campanha sem persistir', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    expect(
      capture(() =>
        service.capture(
          captureInboxItemInputSchema.parse({ campaignId: missingCampaignId, rawText: 'X' }),
        ),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
    expect(
      capture(() =>
        service.capture(
          captureInboxItemInputSchema.parse({
            campaignId,
            sessionId: foreignSessionId,
            rawText: 'X',
          }),
        ),
      ).code,
    ).toBe('SESSION_NOT_FOUND');
    expect(repository.count()).toBe(0);
  });

  it('aplica maquina de estados e revisao otimista', () => {
    const service = createService(new MemoryRepository());
    const captured = service.capture(
      captureInboxItemInputSchema.parse({ campaignId, rawText: 'X' }),
    );
    const reviewing = service.beginReview({ campaignId, id: captured.id, revision: 1 });
    const dismissed = service.dismiss({ campaignId, id: captured.id, revision: 2 });
    const archived = service.archive({ campaignId, id: captured.id, revision: 3 });
    expect(service.restore({ campaignId, id: captured.id, revision: 4 })).toMatchObject({
      status: 'new',
      revision: 5,
    });
    expect([reviewing.status, dismissed.status, archived.status]).toEqual([
      'reviewing',
      'dismissed',
      'archived',
    ]);
    expect(capture(() => service.dismiss({ campaignId, id: captured.id, revision: 1 })).code).toBe(
      'REVISION_CONFLICT',
    );
  });

  it('rejeita todas as transições proibidas e respeita get/list com filtros', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    const captured = service.capture(
      captureInboxItemInputSchema.parse({ campaignId, sessionId, rawText: 'X' }),
    );
    expect(capture(() => service.restore({ campaignId, id: captured.id, revision: 1 })).code).toBe(
      'INVALID_INBOX_RESTORE_STATE',
    );
    expect(capture(() => service.archive({ campaignId, id: captured.id, revision: 2 })).code).toBe(
      'REVISION_CONFLICT',
    );
    const reviewing = service.beginReview({ campaignId, id: captured.id, revision: 1 });
    expect(
      capture(() => service.beginReview({ campaignId, id: captured.id, revision: 2 })).code,
    ).toBe('INVALID_INBOX_REVIEW_STATE');
    const dismissed = service.dismiss({
      campaignId,
      id: captured.id,
      revision: reviewing.revision,
    });
    expect(
      capture(() => service.dismiss({ campaignId, id: captured.id, revision: dismissed.revision }))
        .code,
    ).toBe('INVALID_INBOX_DISMISS_STATE');
    expect(service.get({ campaignId, id: captured.id })).toEqual(dismissed);
    expect(
      service.list({
        campaignId,
        filters: { statuses: ['dismissed'], sessionId },
        limit: 50,
        sort: 'capturedAt',
        order: 'desc',
      }).items,
    ).toEqual([dismissed]);
    expect(capture(() => service.get({ campaignId: otherCampaignId, id: captured.id })).code).toBe(
      'INBOX_ITEM_NOT_FOUND',
    );
  });
});

class MemoryRepository implements InboxRepositoryPort {
  private records: InboxItem[] = [];

  public insert(item: InboxItem): InboxItem {
    const persisted = inboxItemSchema.parse(item);
    this.records.push(persisted);
    return persisted;
  }

  public findById(owner: string, id: string): InboxItem | null {
    return this.records.find((item) => item.campaignId === owner && item.id === id) ?? null;
  }

  public list(request: InboxPageRequest): InboxPageResult {
    const items = this.records.filter(
      (item) =>
        item.campaignId === request.campaignId &&
        (request.filters.statuses === undefined ||
          request.filters.statuses.includes(item.status)) &&
        (request.filters.sessionId === undefined || request.filters.sessionId === item.sessionId) &&
        (request.filters.originKind === undefined ||
          request.filters.originKind === item.originKind),
    );
    return { items, nextCursor: null, total: items.length };
  }

  public updateStatus(
    input: InboxLifecycleInput,
    status: InboxItem['status'],
    updatedAt: string,
  ): InboxItem {
    const index = this.records.findIndex(
      (item) =>
        item.campaignId === input.campaignId &&
        item.id === input.id &&
        item.revision === input.revision,
    );
    if (index === -1) throw new Error('Conflito inesperado no teste.');
    const updated = inboxItemSchema.parse({
      ...this.records[index],
      status,
      updatedAt,
      revision: input.revision + 1,
    });
    this.records[index] = updated;
    return updated;
  }

  public count(): number {
    return this.records.length;
  }
}

function createService(repository: InboxRepositoryPort): InboxService {
  const campaigns = new Map<string, Campaign>([
    [campaignId, createCampaign(campaignId)],
    [otherCampaignId, createCampaign(otherCampaignId)],
  ]);
  const sessions = new Map<string, Session>([
    [sessionId, createSession(sessionId, campaignId)],
    [foreignSessionId, createSession(foreignSessionId, otherCampaignId)],
  ]);
  return new InboxService({
    repository,
    campaigns: { findById: (id) => campaigns.get(id) ?? null },
    sessions: {
      findById: (owner, id) => {
        const session = sessions.get(id);
        return session?.campaignId === owner ? session : null;
      },
    },
    createId: () => inboxItemId,
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

function createSession(id: string, owner: string): Session {
  return {
    id,
    campaignId: owner,
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

function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
