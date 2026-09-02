import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/contracts/entities';
import type { RelationshipType } from '../../src/core/contracts/relationship-types';
import {
  createRelationshipInputSchema,
  relationshipSchema,
  type Relationship,
  type RelationshipPageResult,
} from '../../src/core/contracts/relationships';
import { AppError } from '../../src/core/errors/app-error';
import type { RelationshipRepositoryUpdate } from '../../src/db/repositories/relationship-repository';
import type { AdjacentRelationshipQuery } from '../../src/db/repositories/relationship-repository';
import {
  RelationshipService,
  type RelationshipRepositoryPort,
} from '../../src/main/services/relationship-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const typeId = '20000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000002';
const targetId = '30000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-02T12:00:00.000Z';

describe('RelationshipService', () => {
  it('normaliza a ordem de relação simétrica e sinaliza duplicata', () => {
    const repository = new MemoryRepository();
    const service = createService(repository, true);
    const first = service.create(
      createRelationshipInputSchema.parse({
        campaignId,
        relationshipTypeId: typeId,
        sourceEntityId: sourceId,
        targetEntityId: targetId,
      }),
    );
    expect(first.relationship).toMatchObject({
      sourceEntityId: targetId,
      targetEntityId: sourceId,
    });
    expect(first.warnings).toEqual([]);
    const second = service.create(
      createRelationshipInputSchema.parse({
        campaignId,
        relationshipTypeId: typeId,
        sourceEntityId: targetId,
        targetEntityId: sourceId,
      }),
    );
    expect(second.warnings[0]).toMatchObject({
      code: 'POSSIBLE_DUPLICATE',
      relationshipIds: [first.relationship.id],
    });
  });

  it('rejeita entidade arquivada e tipo de entidade fora das regras', () => {
    expect(
      capture(() =>
        createService(new MemoryRepository(), false, true).create(
          createRelationshipInputSchema.parse({
            campaignId,
            relationshipTypeId: typeId,
            sourceEntityId: sourceId,
            targetEntityId: targetId,
          }),
        ),
      ).code,
    ).toBe('INVALID_ENTITY_STATE');
    expect(
      capture(() =>
        createService(new MemoryRepository(), false, false, [
          '99999999-0000-4000-8000-000000000001',
        ]).create(
          createRelationshipInputSchema.parse({
            campaignId,
            relationshipTypeId: typeId,
            sourceEntityId: sourceId,
            targetEntityId: targetId,
          }),
        ),
      ).code,
    ).toBe('RELATIONSHIP_ENTITY_TYPE_NOT_ALLOWED');
  });

  it('percorre ciclos pelo menor caminho, preserva arestas e respeita filtros e limites', () => {
    const thirdId = '30000000-0000-4000-8000-000000000003';
    const records = [
      createRelationship('40000000-0000-4000-8000-000000000001', targetId, sourceId),
      createRelationship('40000000-0000-4000-8000-000000000002', sourceId, thirdId),
      createRelationship('40000000-0000-4000-8000-000000000003', thirdId, targetId, {
        knowledgeState: 'rumor',
      }),
    ];
    const repository = new MemoryRepository(records);
    const entities = new Map(
      [targetId, sourceId, thirdId].map((id) => [
        id,
        {
          id,
          campaignId,
          entityTypeId: '10000000-0000-4000-8000-000000000001',
          archivedAt: null,
        } as Entity,
      ]),
    );
    const service = new RelationshipService({
      repository,
      relationshipTypes: {
        findById: (_campaign, id) =>
          id === typeId ? ({ id, campaignId } as RelationshipType) : null,
      },
      entities: { findById: (_campaign, id) => entities.get(id) ?? null },
    });

    const complete = service.neighborhood({
      campaignId,
      entityId: targetId,
      depth: 1,
      maxEntities: 100,
      maxRelationships: 200,
      filters: { relationshipTypeIds: [], canonStates: [], knowledgeStates: [], visibilities: [] },
    });
    expect(complete.nodes.map((node) => node.entity.id)).toEqual([targetId, sourceId, thirdId]);
    expect(complete.nodes.find((node) => node.entity.id === thirdId)?.pathEntityIds).toEqual([
      targetId,
      thirdId,
    ]);
    expect(complete.relationships).toHaveLength(3);
    expect(complete.truncated).toBe(false);

    const filtered = service.neighborhood({
      campaignId,
      entityId: targetId,
      depth: 3,
      maxEntities: 2,
      maxRelationships: 200,
      filters: {
        relationshipTypeIds: [],
        canonStates: [],
        knowledgeStates: ['fact'],
        visibilities: [],
      },
    });
    expect(filtered.nodes).toHaveLength(2);
    expect(filtered.relationships).toHaveLength(1);
    expect(filtered.truncated).toBe(true);
  });
});

class MemoryRepository implements RelationshipRepositoryPort {
  private records: Relationship[];
  public constructor(records: Relationship[] = []) {
    this.records = records;
  }
  public insert(value: Relationship): Relationship {
    this.records.push(value);
    return value;
  }
  public findById(campaign: string, id: string): Relationship | null {
    return this.records.find((item) => item.campaignId === campaign && item.id === id) ?? null;
  }
  public findActiveEquivalent(
    campaign: string,
    relationshipTypeId: string,
    source: string,
    target: string,
    exceptId?: string,
  ): Relationship[] {
    return this.records.filter(
      (item) =>
        item.campaignId === campaign &&
        item.relationshipTypeId === relationshipTypeId &&
        item.sourceEntityId === source &&
        item.targetEntityId === target &&
        item.archivedAt === null &&
        item.id !== exceptId,
    );
  }
  public list(): RelationshipPageResult {
    return { items: this.records, nextCursor: null, total: this.records.length };
  }
  public listActiveAdjacent(query: AdjacentRelationshipQuery): Relationship[] {
    return this.records.filter(
      (item) =>
        item.campaignId === query.campaignId &&
        item.archivedAt === null &&
        (query.entityIds.includes(item.sourceEntityId) ||
          query.entityIds.includes(item.targetEntityId)) &&
        (query.relationshipTypeIds.length === 0 ||
          query.relationshipTypeIds.includes(item.relationshipTypeId)) &&
        (query.canonStates.length === 0 || query.canonStates.includes(item.canonState)) &&
        (query.knowledgeStates.length === 0 ||
          query.knowledgeStates.includes(item.knowledgeState)) &&
        (query.visibilities.length === 0 || query.visibilities.includes(item.visibility)),
    );
  }
  public update(input: RelationshipRepositoryUpdate, updatedAt: string): Relationship {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new Error();
    const updated = relationshipSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records = this.records.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  }
}

function createRelationship(
  id: string,
  sourceEntityId: string,
  targetEntityId: string,
  overrides: Partial<Relationship> = {},
): Relationship {
  return relationshipSchema.parse({
    id,
    campaignId,
    relationshipTypeId: typeId,
    sourceEntityId,
    targetEntityId,
    description: null,
    strength: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    validFromEventId: null,
    validToEventId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
    ...overrides,
  });
}

function createService(
  repository: RelationshipRepositoryPort,
  symmetric: boolean,
  archiveTarget = false,
  allowedSourceTypeIds: string[] | null = null,
): RelationshipService {
  const relationshipType = {
    id: typeId,
    campaignId,
    isSymmetric: symmetric,
    isArchived: false,
    allowedSourceTypeIds,
    allowedTargetTypeIds: null,
  } as RelationshipType;
  const entities = new Map<string, Entity>([
    [
      sourceId,
      {
        id: sourceId,
        campaignId,
        entityTypeId: '10000000-0000-4000-8000-000000000001',
        archivedAt: null,
      } as Entity,
    ],
    [
      targetId,
      {
        id: targetId,
        campaignId,
        entityTypeId: '10000000-0000-4000-8000-000000000001',
        archivedAt: archiveTarget ? timestamp : null,
      } as Entity,
    ],
  ]);
  let sequence = 0;
  return new RelationshipService({
    repository,
    relationshipTypes: {
      findById: (campaign, id) =>
        campaign === campaignId && id === typeId ? relationshipType : null,
    },
    entities: {
      findById: (campaign, id) => (campaign === campaignId ? (entities.get(id) ?? null) : null),
    },
    createId: () => `40000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => timestamp,
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
