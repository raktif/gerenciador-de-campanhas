import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../src/core/contracts/entity-types';
import {
  createFieldDefinitionInputSchema,
  fieldDefinitionPageRequestSchema,
  fieldDefinitionSchema,
  type FieldDefinition,
  type FieldDefinitionPageRequest,
  type FieldDefinitionPageResult,
} from '../../src/core/contracts/field-definitions';
import { AppError } from '../../src/core/errors/app-error';
import type { FieldDefinitionRepositoryUpdate } from '../../src/db/repositories/field-definition-repository';
import {
  FieldDefinitionService,
  type EntityTypeLookupPort,
  type FieldDefinitionRepositoryPort,
} from '../../src/main/services/field-definition-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const targetTypeId = '10000000-0000-4000-8000-000000000002';
const fieldId = '20000000-0000-4000-8000-000000000001';
const firstTimestamp = '2026-08-28T12:00:00.000Z';
const secondTimestamp = '2026-08-28T13:00:00.000Z';

describe('FieldDefinitionService', () => {
  it('cria campo com os padrões do contrato em um tipo existente', () => {
    const repository = new MemoryFieldDefinitionRepository();
    const service = createService(repository);
    const created = service.create(
      createFieldDefinitionInputSchema.parse({
        campaignId,
        entityTypeId,
        key: 'nome',
        label: 'Nome',
        dataType: 'short_text',
      }),
    );

    expect(created).toMatchObject({
      id: fieldId,
      entityTypeId,
      key: 'nome',
      required: false,
      isArchived: false,
      createdAt: secondTimestamp,
      revision: 1,
    });
  });

  it('valida o tipo pai antes de listar', () => {
    const repository = new MemoryFieldDefinitionRepository([createField()]);
    const service = createService(repository);
    const request = fieldDefinitionPageRequestSchema.parse({ campaignId, entityTypeId });

    expect(service.list(request).items).toHaveLength(1);
    expect(repository.lastListRequest).toBe(request);
    expect(
      captureAppError(() =>
        service.list(
          fieldDefinitionPageRequestSchema.parse({ campaignId: otherCampaignId, entityTypeId }),
        ),
      ).code,
    ).toBe('ENTITY_TYPE_NOT_FOUND');
  });

  it('arquiva e restaura com revisão otimista', () => {
    const service = createService(new MemoryFieldDefinitionRepository([createField()]));

    const archived = service.archive({ campaignId, entityTypeId, id: fieldId, revision: 1 });
    expect(archived).toMatchObject({ isArchived: true, revision: 2 });
    expect(
      service.restore({ campaignId, entityTypeId, id: fieldId, revision: archived.revision }),
    ).toMatchObject({ isArchived: false, revision: 3 });
  });

  it('valida configurações e destinos de campos de referência', () => {
    const service = createService(new MemoryFieldDefinitionRepository());
    expect(() =>
      service.create(
        createFieldDefinitionInputSchema.parse({
          campaignId,
          entityTypeId,
          key: 'aliados',
          label: 'Aliados',
          dataType: 'entity_reference_list',
          allowedTargetTypeIds: [targetTypeId],
        }),
      ),
    ).not.toThrow();

    expect(
      captureAppError(() =>
        service.create(
          createFieldDefinitionInputSchema.parse({
            campaignId,
            entityTypeId,
            key: 'nome',
            label: 'Nome',
            dataType: 'short_text',
            referenceDirection: 'outgoing',
          }),
        ),
      ).code,
    ).toBe('INVALID_FIELD_REFERENCE_CONFIG');
    expect(
      captureAppError(() =>
        service.create(
          createFieldDefinitionInputSchema.parse({
            campaignId,
            entityTypeId,
            key: 'inimigo',
            label: 'Inimigo',
            dataType: 'entity_reference',
            allowedTargetTypeIds: ['10000000-0000-4000-8000-000000000099'],
          }),
        ),
      ).code,
    ).toBe('INVALID_FIELD_REFERENCE_TARGET');
  });

  it('não revela campos de outra campanha e rejeita estado ou revisão inválidos', () => {
    const service = createService(new MemoryFieldDefinitionRepository([createField()]));

    expect(
      captureAppError(() => service.get({ campaignId: otherCampaignId, entityTypeId, id: fieldId }))
        .code,
    ).toBe('FIELD_DEFINITION_NOT_FOUND');
    expect(
      captureAppError(() => service.restore({ campaignId, entityTypeId, id: fieldId, revision: 1 }))
        .code,
    ).toBe('INVALID_FIELD_DEFINITION_STATE');
    expect(
      captureAppError(() => service.archive({ campaignId, entityTypeId, id: fieldId, revision: 2 }))
        .code,
    ).toBe('REVISION_CONFLICT');
  });
});

class MemoryFieldDefinitionRepository implements FieldDefinitionRepositoryPort {
  private readonly records = new Map<string, FieldDefinition>();
  public lastListRequest: FieldDefinitionPageRequest | null = null;

  public constructor(fields: FieldDefinition[] = []) {
    for (const field of fields) this.records.set(field.id, field);
  }

  public insert(field: FieldDefinition): FieldDefinition {
    this.records.set(field.id, field);
    return field;
  }

  public findById(
    requestCampaignId: string,
    requestEntityTypeId: string,
    id: string,
  ): FieldDefinition | null {
    const field = this.records.get(id);
    return requestCampaignId === campaignId && field?.entityTypeId === requestEntityTypeId
      ? field
      : null;
  }

  public list(request: FieldDefinitionPageRequest): FieldDefinitionPageResult {
    this.lastListRequest = request;
    const items = [...this.records.values()].filter(
      (field) =>
        request.campaignId === campaignId &&
        field.entityTypeId === request.entityTypeId &&
        field.isArchived === request.filters.isArchived,
    );
    return { items, nextCursor: null, total: items.length };
  }

  public update(input: FieldDefinitionRepositoryUpdate, updatedAt: string): FieldDefinition {
    const current = this.findById(input.campaignId, input.entityTypeId, input.id);
    if (current === null) throw new AppError('FIELD_DEFINITION_NOT_FOUND', 'Campo ausente.');
    if (current.revision !== input.revision) {
      throw new AppError('REVISION_CONFLICT', 'Revisão obsoleta.');
    }
    const updated = fieldDefinitionSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records.set(updated.id, updated);
    return updated;
  }
}

class MemoryEntityTypes implements EntityTypeLookupPort {
  public findById(requestCampaignId: string, id: string): EntityType | null {
    if (requestCampaignId !== campaignId || ![entityTypeId, targetTypeId].includes(id)) return null;
    return createEntityType(id);
  }
}

function createService(repository: FieldDefinitionRepositoryPort): FieldDefinitionService {
  return new FieldDefinitionService({
    repository,
    entityTypes: new MemoryEntityTypes(),
    createId: () => fieldId,
    now: () => secondTimestamp,
  });
}

function createField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return fieldDefinitionSchema.parse({
    id: fieldId,
    entityTypeId,
    key: 'nome',
    label: 'Nome',
    description: null,
    dataType: 'short_text',
    semanticRole: 'name',
    required: true,
    searchable: true,
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
    createdAt: firstTimestamp,
    updatedAt: firstTimestamp,
    revision: 1,
    ...overrides,
  });
}

function createEntityType(id: string): EntityType {
  return {
    id,
    campaignId,
    packId: null,
    name: 'Tipo',
    singularName: 'Tipo',
    slug: id === entityTypeId ? 'personagens' : 'faccoes',
    description: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    isArchived: false,
    createdAt: firstTimestamp,
    updatedAt: firstTimestamp,
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
