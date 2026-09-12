import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { EntityType } from '../../src/core/contracts/entity-types';
import {
  createRelationshipTypeInputSchema,
  relationshipTypePageRequestSchema,
  relationshipTypeSchema,
  type RelationshipType,
  type RelationshipTypePageRequest,
  type RelationshipTypePageResult,
} from '../../src/core/contracts/relationship-types';
import { AppError } from '../../src/core/errors/app-error';
import type { RelationshipTypeRepositoryUpdate } from '../../src/db/repositories/relationship-type-repository';
import {
  RelationshipTypeService,
  type RelationshipTypeCampaignLookupPort,
  type RelationshipTypeEntityTypeLookupPort,
  type RelationshipTypeRepositoryPort,
} from '../../src/main/services/relationship-type-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const relationshipTypeId = '20000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-31T12:00:00.000Z';

describe('RelationshipTypeService', () => {
  it('cria tipo com restrições pertencentes à campanha', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    const result = service.create(
      createRelationshipTypeInputSchema.parse({
        campaignId,
        name: 'Trabalha em',
        slug: 'trabalha-em',
        inverseName: 'Emprega',
        semanticRole: 'belongs_to',
        allowedSourceTypeIds: [entityTypeId],
      }),
    );
    expect(result).toMatchObject({
      id: relationshipTypeId,
      campaignId,
      name: 'Trabalha em',
      inverseName: 'Emprega',
      allowedSourceTypeIds: [entityTypeId],
      isArchived: false,
      revision: 1,
    });
  });

  it('rejeita tipo permitido ausente, externo ou arquivado', () => {
    const service = createService(new MemoryRepository());
    const create = (id: string) =>
      service.create(
        createRelationshipTypeInputSchema.parse({
          campaignId,
          name: 'Conhece',
          slug: 'conhece',
          allowedTargetTypeIds: [id],
        }),
      );
    expect(capture(() => create('10000000-0000-4000-8000-000000000099')).code).toBe(
      'ENTITY_TYPE_NOT_FOUND',
    );
    expect(capture(() => create('10000000-0000-4000-8000-000000000002')).code).toBe(
      'ENTITY_TYPE_NOT_FOUND',
    );
    expect(capture(() => create('10000000-0000-4000-8000-000000000003')).code).toBe(
      'INVALID_ENTITY_TYPE_STATE',
    );
  });

  it('isola campanha e controla arquivamento por revisão', () => {
    const repository = new MemoryRepository([createRelationshipType()]);
    const service = createService(repository);
    expect(
      capture(() => service.get({ campaignId: otherCampaignId, id: relationshipTypeId })).code,
    ).toBe('RELATIONSHIP_TYPE_NOT_FOUND');
    const archived = service.archive({ campaignId, id: relationshipTypeId, revision: 1 });
    expect(archived).toMatchObject({ isArchived: true, revision: 2 });
    expect(
      capture(() => service.archive({ campaignId, id: relationshipTypeId, revision: 1 })).code,
    ).toBe('REVISION_CONFLICT');
    expect(service.restore({ campaignId, id: relationshipTypeId, revision: 2 })).toMatchObject({
      isArchived: false,
      revision: 3,
    });
  });

  it('valida campanha antes de listar', () => {
    const repository = new MemoryRepository([createRelationshipType()]);
    const service = createService(repository);
    expect(
      service.list(relationshipTypePageRequestSchema.parse({ campaignId })).items,
    ).toHaveLength(1);
    expect(
      capture(() =>
        service.list(relationshipTypePageRequestSchema.parse({ campaignId: otherCampaignId })),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
  });
});

class MemoryRepository implements RelationshipTypeRepositoryPort {
  private readonly records = new Map<string, RelationshipType>();
  public constructor(records: RelationshipType[] = []) {
    for (const record of records) this.records.set(record.id, record);
  }
  public insert(value: RelationshipType): RelationshipType {
    this.records.set(value.id, value);
    return value;
  }
  public findById(targetCampaignId: string, id: string): RelationshipType | null {
    const value = this.records.get(id);
    return value?.campaignId === targetCampaignId ? value : null;
  }
  public list(request: RelationshipTypePageRequest): RelationshipTypePageResult {
    const items = [...this.records.values()].filter(
      (value) =>
        value.campaignId === request.campaignId && value.isArchived === request.filters.isArchived,
    );
    return { items, nextCursor: null, total: items.length };
  }
  public update(input: RelationshipTypeRepositoryUpdate, updatedAt: string): RelationshipType {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new AppError('RELATIONSHIP_TYPE_NOT_FOUND', 'Ausente.');
    if (current.revision !== input.revision) throw new AppError('REVISION_CONFLICT', 'Obsoleta.');
    const updated = relationshipTypeSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records.set(updated.id, updated);
    return updated;
  }
}

class Campaigns implements RelationshipTypeCampaignLookupPort {
  public findById(id: string): Campaign | null {
    return id === campaignId ? ({ id: campaignId } as Campaign) : null;
  }
}
class EntityTypes implements RelationshipTypeEntityTypeLookupPort {
  public findById(targetCampaignId: string, id: string): EntityType | null {
    if (targetCampaignId !== campaignId || id === '10000000-0000-4000-8000-000000000002')
      return null;
    if (id === entityTypeId) return { id, campaignId, isArchived: false } as EntityType;
    if (id === '10000000-0000-4000-8000-000000000003')
      return { id, campaignId, isArchived: true } as EntityType;
    return null;
  }
}
function createService(repository: RelationshipTypeRepositoryPort): RelationshipTypeService {
  return new RelationshipTypeService({
    repository,
    campaigns: new Campaigns(),
    entityTypes: new EntityTypes(),
    createId: () => relationshipTypeId,
    now: () => timestamp,
  });
}
function createRelationshipType(overrides: Partial<RelationshipType> = {}): RelationshipType {
  return {
    id: relationshipTypeId,
    campaignId,
    packId: null,
    name: 'Conhece',
    slug: 'conhece',
    inverseName: null,
    description: null,
    semanticRole: 'knows',
    isSymmetric: true,
    allowedSourceTypeIds: null,
    allowedTargetTypeIds: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    ...overrides,
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
