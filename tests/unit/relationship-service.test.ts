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
});

class MemoryRepository implements RelationshipRepositoryPort {
  private records: Relationship[] = [];
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
