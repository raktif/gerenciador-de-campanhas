import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import {
  createEntityTypeInputSchema,
  entityTypePageRequestSchema,
  entityTypeSchema,
  type EntityType,
  type EntityTypePageRequest,
  type EntityTypePageResult,
} from '../../src/core/contracts/entity-types';
import { AppError } from '../../src/core/errors/app-error';
import type { EntityTypeRepositoryUpdate } from '../../src/db/repositories/entity-type-repository';
import {
  EntityTypeService,
  type CampaignLookupPort,
  type EntityTypeRepositoryPort,
} from '../../src/main/services/entity-type-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const firstTimestamp = '2026-08-28T12:00:00.000Z';
const secondTimestamp = '2026-08-28T13:00:00.000Z';

describe('EntityTypeService', () => {
  it('cria tipo personalizado dentro de uma campanha existente', () => {
    const repository = new MemoryEntityTypeRepository();
    const service = createService(repository);

    expect(
      service.create(
        createEntityTypeInputSchema.parse({
          campaignId,
          name: 'Personagens',
          singularName: 'Personagem',
          slug: 'personagens',
          color: '#92400e',
        }),
      ),
    ).toEqual({
      id: entityTypeId,
      campaignId,
      packId: null,
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens',
      description: null,
      icon: null,
      color: '#92400e',
      sortOrder: 0,
      isSystem: false,
      isArchived: false,
      createdAt: secondTimestamp,
      updatedAt: secondTimestamp,
      revision: 1,
    });
  });

  it('lista somente após validar a campanha', () => {
    const repository = new MemoryEntityTypeRepository([createEntityType()]);
    const service = createService(repository);
    const request = entityTypePageRequestSchema.parse({ campaignId });

    expect(service.list(request).items).toHaveLength(1);
    expect(repository.lastListRequest).toBe(request);
    expect(
      captureAppError(() =>
        service.list(entityTypePageRequestSchema.parse({ campaignId: otherCampaignId })),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
  });

  it('arquiva e restaura com revisão otimista', () => {
    const repository = new MemoryEntityTypeRepository([createEntityType()]);
    const service = createService(repository);

    const archived = service.archive({ campaignId, id: entityTypeId, revision: 1 });
    expect(archived).toMatchObject({ isArchived: true, revision: 2 });
    expect(
      service.restore({ campaignId, id: entityTypeId, revision: archived.revision }),
    ).toMatchObject({ isArchived: false, revision: 3 });
  });

  it('não revela tipo pertencente a outra campanha e rejeita estado ou revisão inválidos', () => {
    const repository = new MemoryEntityTypeRepository([createEntityType()]);
    const service = createService(repository);

    expect(
      captureAppError(() => service.get({ campaignId: otherCampaignId, id: entityTypeId })).code,
    ).toBe('ENTITY_TYPE_NOT_FOUND');
    expect(
      captureAppError(() => service.restore({ campaignId, id: entityTypeId, revision: 1 })).code,
    ).toBe('INVALID_ENTITY_TYPE_STATE');
    expect(
      captureAppError(() => service.archive({ campaignId, id: entityTypeId, revision: 2 })).code,
    ).toBe('REVISION_CONFLICT');
  });
});

class MemoryEntityTypeRepository implements EntityTypeRepositoryPort {
  private readonly records = new Map<string, EntityType>();
  public lastListRequest: EntityTypePageRequest | null = null;

  public constructor(entityTypes: EntityType[] = []) {
    for (const entityType of entityTypes) this.records.set(entityType.id, entityType);
  }

  public insert(entityType: EntityType): EntityType {
    this.records.set(entityType.id, entityType);
    return entityType;
  }

  public findById(requestCampaignId: string, id: string): EntityType | null {
    const entityType = this.records.get(id);
    return entityType?.campaignId === requestCampaignId ? entityType : null;
  }

  public list(request: EntityTypePageRequest): EntityTypePageResult {
    this.lastListRequest = request;
    const items = [...this.records.values()].filter(
      (entityType) =>
        entityType.campaignId === request.campaignId &&
        entityType.isArchived === request.filters.isArchived,
    );
    return { items, nextCursor: null, total: items.length };
  }

  public update(input: EntityTypeRepositoryUpdate, updatedAt: string): EntityType {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new AppError('ENTITY_TYPE_NOT_FOUND', 'Tipo ausente.');
    if (current.revision !== input.revision) {
      throw new AppError('REVISION_CONFLICT', 'Revisão obsoleta.');
    }
    const updated = entityTypeSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records.set(updated.id, updated);
    return updated;
  }
}

class MemoryCampaigns implements CampaignLookupPort {
  public findById(id: string): Campaign | null {
    return id === campaignId ? createCampaign() : null;
  }
}

function createService(repository: EntityTypeRepositoryPort): EntityTypeService {
  return new EntityTypeService({
    repository,
    campaigns: new MemoryCampaigns(),
    createId: () => entityTypeId,
    now: () => secondTimestamp,
  });
}

function createEntityType(overrides: Partial<EntityType> = {}): EntityType {
  return {
    id: entityTypeId,
    campaignId,
    packId: null,
    name: 'Personagens',
    singularName: 'Personagem',
    slug: 'personagens',
    description: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    isArchived: false,
    createdAt: firstTimestamp,
    updatedAt: firstTimestamp,
    revision: 1,
    ...overrides,
  };
}

function createCampaign(): Campaign {
  return {
    id: campaignId,
    name: 'Ethéria',
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    imagePath: null,
    status: 'active',
    createdAt: firstTimestamp,
    updatedAt: firstTimestamp,
    archivedAt: null,
    revision: 1,
  };
}

function captureAppError(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria ter lançado AppError.');
}
