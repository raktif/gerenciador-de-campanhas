import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '../../src/core/contracts/field-definitions';
import type { RelationshipType } from '../../src/core/contracts/relationship-types';
import type { Relationship } from '../../src/core/contracts/relationships';
import { referencedEntityIds } from '../../src/renderer/features/entities/entity-details';

const entityId = '00000000-0000-4000-8000-000000000001';
const relatedEntityId = '00000000-0000-4000-8000-000000000002';
const relationshipTypeId = '10000000-0000-4000-8000-000000000001';

describe('referencedEntityIds', () => {
  it('deriva referências de saída e entrada apenas das relações aplicáveis', () => {
    const outgoing = referenceField('outgoing');
    const incoming = referenceField('incoming');
    const relation = relationship({ sourceEntityId: entityId, targetEntityId: relatedEntityId });

    expect(referencedEntityIds(outgoing, entityId, [relation], [relationshipType()])).toEqual([
      relatedEntityId,
    ]);
    expect(referencedEntityIds(incoming, entityId, [relation], [relationshipType()])).toEqual([]);
  });

  it('deriva referências simétricas sem depender da direção armazenada', () => {
    const relation = relationship({ sourceEntityId: relatedEntityId, targetEntityId: entityId });

    expect(
      referencedEntityIds(referenceField('outgoing'), entityId, [relation], [relationshipType(true)]),
    ).toEqual([relatedEntityId]);
  });
});

function referenceField(direction: 'outgoing' | 'incoming'): FieldDefinition {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    entityTypeId: '30000000-0000-4000-8000-000000000001',
    key: 'aliados',
    label: 'Aliados',
    description: null,
    dataType: 'entity_reference_list',
    semanticRole: null,
    required: false,
    searchable: false,
    secretByDefault: false,
    defaultValue: null,
    options: null,
    validation: null,
    referenceRelationshipTypeId: relationshipTypeId,
    referenceDirection: direction,
    allowedTargetTypeIds: null,
    onDeleteBehavior: 'unlink',
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-09-29T12:00:00.000Z',
    updatedAt: '2026-09-29T12:00:00.000Z',
    revision: 1,
  };
}

function relationship(overrides: Partial<Relationship>): Relationship {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    campaignId: '50000000-0000-4000-8000-000000000001',
    relationshipTypeId,
    sourceEntityId: entityId,
    targetEntityId: relatedEntityId,
    description: null,
    strength: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    validFromEventId: null,
    validToEventId: null,
    createdAt: '2026-09-29T12:00:00.000Z',
    updatedAt: '2026-09-29T12:00:00.000Z',
    archivedAt: null,
    revision: 1,
    ...overrides,
  };
}

function relationshipType(isSymmetric = false): RelationshipType {
  return {
    id: relationshipTypeId,
    campaignId: '50000000-0000-4000-8000-000000000001',
    packId: null,
    name: 'Aliado de',
    slug: 'aliado-de',
    inverseName: null,
    description: null,
    semanticRole: null,
    isSymmetric,
    allowedSourceTypeIds: null,
    allowedTargetTypeIds: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-09-29T12:00:00.000Z',
    updatedAt: '2026-09-29T12:00:00.000Z',
    revision: 1,
  };
}
