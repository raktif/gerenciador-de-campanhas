import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import {
  captureInboxItemInputSchema,
  inboxItemSchema,
  type InboxItem,
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
});

class MemoryRepository implements InboxRepositoryPort {
  private records: InboxItem[] = [];

  public insert(item: InboxItem): InboxItem {
    const persisted = inboxItemSchema.parse(item);
    this.records.push(persisted);
    return persisted;
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
