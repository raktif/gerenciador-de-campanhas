import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../src/core/contracts/entity-types';
import type { FieldDefinition } from '../../src/core/contracts/field-definitions';
import {
  createEntityInputSchema,
  entitySchema,
  type Entity,
  type EntityDetails,
  type EntityPageRequest,
  type EntityPageResult,
} from '../../src/core/contracts/entities';
import { AppError } from '../../src/core/errors/app-error';
import type {
  EntityRepositoryUpdate,
  FieldValuePersistence,
} from '../../src/db/repositories/entity-repository';
import { EntityService, type EntityRepositoryPort } from '../../src/main/services/entity-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const otherTypeId = '10000000-0000-4000-8000-000000000002';
const entityId = '20000000-0000-4000-8000-000000000001';
const textFieldId = '30000000-0000-4000-8000-000000000001';
const numberFieldId = '30000000-0000-4000-8000-000000000002';
const referenceFieldId = '30000000-0000-4000-8000-000000000003';
const timestamp = '2026-08-28T12:00:00.000Z';

describe('EntityService', () => {
  it('cria entidade sem exigir campos personalizados', () => {
    const service = createService(new MemoryRepository());
    expect(
      service.create(createEntityInputSchema.parse({ campaignId, entityTypeId, name: 'Aris' }))
        .entity,
    ).toMatchObject({
      id: entityId,
      name: 'Aris',
      canonState: 'accepted',
      archivedAt: null,
      revision: 1,
    });
  });

  it('valida e prepara representações tipadas dos valores', () => {
    const repository = new MemoryRepository();
    createService(repository).create(
      createEntityInputSchema.parse({
        campaignId,
        entityTypeId,
        name: 'Aris',
        fieldValues: [
          { fieldDefinitionId: textFieldId, value: 'Capitã' },
          { fieldDefinitionId: numberFieldId, value: 7.5 },
        ],
      }),
    );
    expect(repository.lastValues).toMatchObject([
      { fieldDefinitionId: textFieldId, valueText: 'Capitã', valueNumber: null },
      { fieldDefinitionId: numberFieldId, valueText: null, valueNumber: 7.5 },
    ]);
  });

  it('rejeita tipo incorreto, duplicidade e referência fora da tabela de relações', () => {
    const service = createService(new MemoryRepository());
    expect(
      capture(() =>
        service.create(
          createEntityInputSchema.parse({
            campaignId,
            entityTypeId,
            name: 'Aris',
            fieldValues: [{ fieldDefinitionId: numberFieldId, value: 'sete' }],
          }),
        ),
      ).code,
    ).toBe('INVALID_FIELD_VALUE');
    expect(
      capture(() =>
        service.create(
          createEntityInputSchema.parse({
            campaignId,
            entityTypeId,
            name: 'Aris',
            fieldValues: [
              { fieldDefinitionId: textFieldId, value: 'A' },
              { fieldDefinitionId: textFieldId, value: 'B' },
            ],
          }),
        ),
      ).code,
    ).toBe('DUPLICATE_FIELD_VALUE');
    expect(
      capture(() =>
        service.create(
          createEntityInputSchema.parse({
            campaignId,
            entityTypeId,
            name: 'Aris',
            fieldValues: [{ fieldDefinitionId: referenceFieldId, value: entityId }],
          }),
        ),
      ).code,
    ).toBe('REFERENCE_FIELD_REQUIRES_RELATIONSHIP');
  });

  it('exige valores explícitos ao trocar o tipo e mantém isolamento', () => {
    const repository = new MemoryRepository([createEntity()]);
    const service = createService(repository);
    expect(
      capture(() =>
        service.update({
          campaignId,
          id: entityId,
          revision: 1,
          patch: { entityTypeId: otherTypeId },
        }),
      ).code,
    ).toBe('ENTITY_TYPE_CHANGE_REQUIRES_FIELD_VALUES');
    expect(
      service.update({
        campaignId,
        id: entityId,
        revision: 1,
        patch: { entityTypeId: otherTypeId },
        fieldValues: [],
      }).entity.entityTypeId,
    ).toBe(otherTypeId);
    expect(capture(() => service.get({ campaignId: otherCampaignId, id: entityId })).code).toBe(
      'ENTITY_NOT_FOUND',
    );
  });

  it('arquiva e restaura com revisão otimista', () => {
    const service = createService(new MemoryRepository([createEntity()]));
    const archived = service.archive({ campaignId, id: entityId, revision: 1 });
    expect(archived.entity).toMatchObject({ archivedAt: timestamp, revision: 2 });
    expect(service.restore({ campaignId, id: entityId, revision: 2 }).entity).toMatchObject({
      archivedAt: null,
      revision: 3,
    });
    expect(capture(() => service.archive({ campaignId, id: entityId, revision: 1 })).code).toBe(
      'REVISION_CONFLICT',
    );
  });
});

class MemoryRepository implements EntityRepositoryPort {
  private records = new Map<string, Entity>();
  public lastValues: FieldValuePersistence[] = [];
  public constructor(items: Entity[] = []) {
    for (const item of items) this.records.set(item.id, item);
  }
  public insert(entity: Entity, values: FieldValuePersistence[]): EntityDetails {
    this.records.set(entity.id, entity);
    this.lastValues = values;
    return { entity, fieldValues: [] };
  }
  public findById(requestCampaignId: string, id: string): Entity | null {
    const entity = this.records.get(id);
    return entity?.campaignId === requestCampaignId ? entity : null;
  }
  public getDetails(requestCampaignId: string, id: string): EntityDetails | null {
    const entity = this.findById(requestCampaignId, id);
    return entity === null ? null : { entity, fieldValues: [] };
  }
  public list(request: EntityPageRequest): EntityPageResult {
    const items = [...this.records.values()].filter(
      (item) => item.campaignId === request.campaignId,
    );
    return { items, nextCursor: null, total: items.length };
  }
  public update(
    input: EntityRepositoryUpdate,
    updatedAt: string,
    values?: FieldValuePersistence[],
  ): EntityDetails {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new AppError('ENTITY_NOT_FOUND', 'Ausente.');
    const entity = entitySchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records.set(entity.id, entity);
    if (values !== undefined) this.lastValues = values;
    return { entity, fieldValues: [] };
  }
}

function createService(repository: EntityRepositoryPort): EntityService {
  let sequence = 0;
  const ids = [
    entityId,
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
  ];
  return new EntityService({
    repository,
    entityTypes: {
      findById: (requestedCampaign, id) =>
        requestedCampaign === campaignId && [entityTypeId, otherTypeId].includes(id)
          ? createEntityType(id)
          : null,
    },
    fieldDefinitions: {
      findById: (requestedCampaign, requestedType, id) =>
        requestedCampaign === campaignId && requestedType === entityTypeId ? createField(id) : null,
    },
    createId: () => ids[sequence++] ?? crypto.randomUUID(),
    now: () => timestamp,
  });
}
function createEntity(overrides: Partial<Entity> = {}): Entity {
  return entitySchema.parse({
    id: entityId,
    campaignId,
    entityTypeId,
    name: 'Aris',
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
    ...overrides,
  });
}
function createEntityType(id: string): EntityType {
  return {
    id,
    campaignId,
    packId: null,
    name: 'Tipos',
    singularName: 'Tipo',
    slug: id === entityTypeId ? 'personagens' : 'locais',
    description: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}
function createField(id: string): FieldDefinition | null {
  const dataType =
    id === textFieldId
      ? 'short_text'
      : id === numberFieldId
        ? 'number'
        : id === referenceFieldId
          ? 'entity_reference'
          : null;
  if (dataType === null) return null;
  return {
    id,
    entityTypeId,
    key: id,
    label: id,
    description: null,
    dataType,
    semanticRole: null,
    required: false,
    searchable: false,
    secretByDefault: false,
    defaultValue: null,
    options: null,
    validation: null,
    referenceRelationshipTypeId: null,
    referenceDirection: null,
    allowedTargetTypeIds: null,
    onDeleteBehavior: null,
    sortOrder: 0,
    isArchived: false,
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
  throw new Error('Era esperado AppError.');
}
