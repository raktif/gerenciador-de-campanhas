import { randomUUID } from 'node:crypto';
import type { EntityType } from '../../core/contracts/entity-types';
import type { FieldDefinition } from '../../core/contracts/field-definitions';
import type {
  CreateEntityInput,
  Entity,
  EntityDetails,
  EntityLifecycleInput,
  EntityPageRequest,
  EntityPageResult,
  FieldValueInput,
  UpdateEntityInput,
} from '../../core/contracts/entities';
import { AppError } from '../../core/errors/app-error';
import type {
  EntityPersistencePatch,
  EntityRepositoryUpdate,
  FieldValuePersistence,
} from '../../db/repositories/entity-repository';

export interface EntityRepositoryPort {
  insert(entity: Entity, values: FieldValuePersistence[]): EntityDetails;
  findById(campaignId: string, id: string): Entity | null;
  getDetails(campaignId: string, id: string): EntityDetails | null;
  list(request: EntityPageRequest): EntityPageResult;
  update(
    input: EntityRepositoryUpdate,
    updatedAt: string,
    values?: FieldValuePersistence[],
  ): EntityDetails;
}
export interface EntityTypeLookupPort {
  findById(campaignId: string, id: string): EntityType | null;
}
export interface FieldDefinitionLookupPort {
  findById(campaignId: string, entityTypeId: string, id: string): FieldDefinition | null;
}

export class EntityService {
  private readonly createId: () => string;
  private readonly now: () => string;
  public constructor(
    private readonly dependencies: {
      repository: EntityRepositoryPort;
      entityTypes: EntityTypeLookupPort;
      fieldDefinitions: FieldDefinitionLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateEntityInput): EntityDetails {
    this.requireActiveEntityType(input.campaignId, input.entityTypeId);
    const timestamp = this.now();
    const values = this.prepareValues(input.campaignId, input.entityTypeId, input.fieldValues);
    return this.dependencies.repository.insert(
      {
        id: this.createId(),
        campaignId: input.campaignId,
        entityTypeId: input.entityTypeId,
        name: input.name,
        summary: input.summary,
        canonState: input.canonState,
        knowledgeState: input.knowledgeState,
        visibility: input.visibility,
        originKind: input.originKind,
        sourceId: input.sourceId,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        revision: 1,
      },
      values,
    );
  }

  public get(input: { campaignId: string; id: string }): EntityDetails {
    const details = this.dependencies.repository.getDetails(input.campaignId, input.id);
    if (details === null) throw notFound(input);
    return details;
  }
  public list(request: EntityPageRequest): EntityPageResult {
    if (request.filters.entityTypeId !== undefined)
      this.requireEntityType(request.campaignId, request.filters.entityTypeId);
    return this.dependencies.repository.list(request);
  }

  public update(input: UpdateEntityInput): EntityDetails {
    const current = this.requireEntity(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    const targetTypeId = input.patch?.entityTypeId ?? current.entityTypeId;
    if (targetTypeId !== current.entityTypeId && input.fieldValues === undefined)
      throw new AppError(
        'ENTITY_TYPE_CHANGE_REQUIRES_FIELD_VALUES',
        'Ao alterar o tipo, informe novamente os valores de campo.',
      );
    this.requireActiveEntityType(input.campaignId, targetTypeId);
    const values =
      input.fieldValues === undefined
        ? undefined
        : this.prepareValues(input.campaignId, targetTypeId, input.fieldValues);
    return this.dependencies.repository.update(
      {
        campaignId: input.campaignId,
        id: input.id,
        revision: input.revision,
        patch: input.patch ?? {},
      },
      this.now(),
      values,
    );
  }

  public archive(input: EntityLifecycleInput): EntityDetails {
    const current = this.requireEntity(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.archivedAt !== null)
      throw new AppError('INVALID_ENTITY_STATE', 'A entidade já está arquivada.', {
        id: current.id,
      });
    return this.lifecycleUpdate(input, { archivedAt: this.now() });
  }
  public restore(input: EntityLifecycleInput): EntityDetails {
    const current = this.requireEntity(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.archivedAt === null)
      throw new AppError('INVALID_ENTITY_STATE', 'A entidade já está ativa.', { id: current.id });
    return this.lifecycleUpdate(input, { archivedAt: null });
  }

  private lifecycleUpdate(
    input: EntityLifecycleInput,
    patch: EntityPersistencePatch,
  ): EntityDetails {
    return this.dependencies.repository.update({ ...input, patch }, this.now());
  }
  private requireEntity(campaignId: string, id: string): Entity {
    const entity = this.dependencies.repository.findById(campaignId, id);
    if (entity === null) throw notFound({ campaignId, id });
    return entity;
  }
  private requireRevision(entity: Entity, revision: number): void {
    if (entity.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'A entidade foi alterada em outra operação.', {
        expectedRevision: revision,
        currentRevision: entity.revision,
        current: entity,
      });
  }
  private requireEntityType(campaignId: string, id: string): EntityType {
    const type = this.dependencies.entityTypes.findById(campaignId, id);
    if (type === null)
      throw new AppError('ENTITY_TYPE_NOT_FOUND', 'O tipo de entidade não foi encontrado.', {
        campaignId,
        id,
      });
    return type;
  }
  private requireActiveEntityType(campaignId: string, id: string): EntityType {
    const type = this.requireEntityType(campaignId, id);
    if (type.isArchived)
      throw new AppError(
        'INVALID_ENTITY_TYPE_STATE',
        'Não é possível usar um tipo de entidade arquivado.',
        { id },
      );
    return type;
  }

  private prepareValues(
    campaignId: string,
    entityTypeId: string,
    inputs: FieldValueInput[],
  ): FieldValuePersistence[] {
    const seen = new Set<string>();
    return inputs.map((input) => {
      if (seen.has(input.fieldDefinitionId))
        throw new AppError(
          'DUPLICATE_FIELD_VALUE',
          'Uma definição de campo foi informada mais de uma vez.',
          { fieldDefinitionId: input.fieldDefinitionId },
        );
      seen.add(input.fieldDefinitionId);
      const definition = this.dependencies.fieldDefinitions.findById(
        campaignId,
        entityTypeId,
        input.fieldDefinitionId,
      );
      if (definition === null)
        throw new AppError(
          'FIELD_DEFINITION_NOT_FOUND',
          'A definição de campo não pertence ao tipo da entidade.',
          { fieldDefinitionId: input.fieldDefinitionId },
        );
      if (definition.isArchived)
        throw new AppError(
          'INVALID_FIELD_DEFINITION_STATE',
          'Não é possível preencher uma definição de campo arquivada.',
          { fieldDefinitionId: definition.id },
        );
      return toPersistenceValue(this.createId(), definition, input.value);
    });
  }
}

function toPersistenceValue(
  id: string,
  definition: FieldDefinition,
  value: FieldValueInput['value'],
): FieldValuePersistence {
  if (value === null)
    throw invalidValue(definition, 'Valores nulos devem ser representados pela ausência do campo.');
  const base = {
    id,
    fieldDefinitionId: definition.id,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
  };
  if (definition.dataType === 'entity_reference' || definition.dataType === 'entity_reference_list')
    throw new AppError(
      'REFERENCE_FIELD_REQUIRES_RELATIONSHIP',
      'Campos de referência devem ser gravados como relações.',
    );
  if (
    definition.dataType === 'short_text' ||
    definition.dataType === 'long_text' ||
    definition.dataType === 'single_select'
  ) {
    if (typeof value !== 'string') throw invalidValue(definition, 'Informe um texto.');
    return { ...base, valueText: value };
  }
  if (definition.dataType === 'number' || definition.dataType === 'progress') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw invalidValue(definition, 'Informe um número finito.');
    return { ...base, valueNumber: value };
  }
  if (definition.dataType === 'boolean') {
    if (typeof value !== 'boolean') throw invalidValue(definition, 'Informe verdadeiro ou falso.');
    return { ...base, valueBoolean: value };
  }
  if (definition.dataType === 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw invalidValue(definition, 'Informe uma data no formato AAAA-MM-DD.');
    return { ...base, valueDate: value };
  }
  if (definition.dataType === 'multi_select') {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
      throw invalidValue(definition, 'Informe uma lista de textos.');
    return { ...base, valueJson: value };
  }
  if (typeof value !== 'object' || Array.isArray(value))
    throw invalidValue(definition, 'Informe um objeto JSON.');
  return { ...base, valueJson: value };
}
function invalidValue(definition: FieldDefinition, message: string): AppError {
  return new AppError('INVALID_FIELD_VALUE', message, {
    fieldDefinitionId: definition.id,
    dataType: definition.dataType,
  });
}
function notFound(input: { campaignId: string; id: string }): AppError {
  return new AppError('ENTITY_NOT_FOUND', 'A entidade não foi encontrada.', input);
}
