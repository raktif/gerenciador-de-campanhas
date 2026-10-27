import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { Entity } from '../../src/core/contracts/entities';
import type { TimelineEntityRequest, TimelinePageResult } from '../../src/core/contracts/timeline';
import { AppError } from '../../src/core/errors/app-error';
import {
  TimelineService,
  type TimelineRepositoryPort,
} from '../../src/main/services/timeline-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const entityId = '30000000-0000-4000-8000-000000000001';
const archivedEntityId = '30000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-11T12:00:00.000Z';

describe('TimelineService', () => {
  it('consulta campanha e entidade arquivada na mesma campanha', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    service.listCampaign({ campaignId, limit: 50, filters: { archived: false } });
    service.listEntity({
      campaignId,
      entityId: archivedEntityId,
      limit: 50,
      filters: { archived: false },
    });
    expect(repository.calls).toEqual(['campaign', `entity:${archivedEntityId}`]);
  });

  it('isola campanhas e recusa entidade estrangeira antes do reposit\u00f3rio', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    expect(
      capture(() =>
        service.listCampaign({
          campaignId: otherCampaignId,
          limit: 50,
          filters: { archived: false },
        }),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
    expect(
      capture(() =>
        service.listEntity({
          campaignId,
          entityId: '30000000-0000-4000-8000-000000000099',
          limit: 50,
          filters: { archived: false },
        }),
      ).code,
    ).toBe('ENTITY_NOT_FOUND');
    expect(repository.calls).toEqual([]);
  });
});

class MemoryRepository implements TimelineRepositoryPort {
  public readonly calls: string[] = [];
  public listCampaign(): TimelinePageResult {
    this.calls.push('campaign');
    return page();
  }
  public listEntity(request: TimelineEntityRequest): TimelinePageResult {
    this.calls.push(`entity:${request.entityId}`);
    return page();
  }
}

function createService(repository: TimelineRepositoryPort): TimelineService {
  const campaign = createCampaign();
  const entities = new Map<string, Entity>([
    [entityId, entity(entityId, null)],
    [archivedEntityId, entity(archivedEntityId, timestamp)],
  ]);
  return new TimelineService({
    repository,
    campaigns: { findById: (id) => (id === campaignId ? campaign : null) },
    entities: {
      findById: (owner, id) => (owner === campaignId ? (entities.get(id) ?? null) : null),
    },
  });
}

function page(): TimelinePageResult {
  return { items: [], nextCursor: null, total: 0 };
}
function createCampaign(): Campaign {
  return {
    id: campaignId,
    name: 'Campanha',
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    coverAttachmentId: null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
  };
}
function entity(id: string, archivedAt: string | null): Entity {
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
function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A opera\u00e7\u00e3o deveria falhar.');
}
