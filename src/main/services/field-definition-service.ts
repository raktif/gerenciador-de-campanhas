import { randomUUID } from 'node:crypto';
import type { EntityType } from '../../core/contracts/entity-types';
import type {
  CreateFieldDefinitionInput,
  FieldDefinition,
  FieldDefinitionLifecycleInput,
  FieldDefinitionPageRequest,
  FieldDefinitionPageResult,
  GetFieldDefinitionInput,
  UpdateFieldDefinitionInput,
} from '../../core/contracts/field-definitions';
import { AppError } from '../../core/errors/app-error';
import type { FieldDefinitionRepositoryUpdate } from '../../db/repositories/field-definition-repository';

export interface FieldDefinitionRepositoryPort {
  insert(fieldDefinition: FieldDefinition): FieldDefinition;
  findById(campaignId: string, entityTypeId: string, id: string): FieldDefinition | null;
  list(request: FieldDefinitionPageRequest): FieldDefinitionPageResult;
  update(input: FieldDefinitionRepositoryUpdate, updatedAt: string): FieldDefinition;
}

export interface EntityTypeLookupPort {
  findById(campaignId: string, id: string): EntityType | null;
}

export interface FieldDefinitionServiceDependencies {
  repository: FieldDefinitionRepositoryPort;
  entityTypes: EntityTypeLookupPort;
  createId?: () => string;
  now?: () => string;
}

export class FieldDefinitionService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(private readonly dependencies: FieldDefinitionServiceDependencies) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateFieldDefinitionInput): FieldDefinition {
    this.requireEntityType(input.campaignId, input.entityTypeId);
    this.validateReferenceConfiguration(input.campaignId, input);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      entityTypeId: input.entityTypeId,
      key: input.key,
      label: input.label,
      description: input.description,
      dataType: input.dataType,
      semanticRole: input.semanticRole,
      required: input.required,
      searchable: input.searchable,
      secretByDefault: input.secretByDefault,
      defaultValue: input.defaultValue,
      options: input.options,
      validation: input.validation,
      referenceRelationshipTypeId: input.referenceRelationshipTypeId,
      referenceDirection: input.referenceDirection,
      allowedTargetTypeIds: input.allowedTargetTypeIds,
      onDeleteBehavior: input.onDeleteBehavior,
      sortOrder: input.sortOrder,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
  }

  public get(input: GetFieldDefinitionInput): FieldDefinition {
    return this.requireFieldDefinition(input);
  }

  public list(request: FieldDefinitionPageRequest): FieldDefinitionPageResult {
    this.requireEntityType(request.campaignId, request.entityTypeId);
    return this.dependencies.repository.list(request);
  }

  public update(input: UpdateFieldDefinitionInput): FieldDefinition {
    const current = this.requireFieldDefinition(input);
    this.validateReferenceConfiguration(input.campaignId, {
      dataType: input.patch.dataType ?? current.dataType,
      referenceRelationshipTypeId:
        input.patch.referenceRelationshipTypeId === undefined
          ? current.referenceRelationshipTypeId
          : input.patch.referenceRelationshipTypeId,
      referenceDirection:
        input.patch.referenceDirection === undefined
          ? current.referenceDirection
          : input.patch.referenceDirection,
      allowedTargetTypeIds:
        input.patch.allowedTargetTypeIds === undefined
          ? current.allowedTargetTypeIds
          : input.patch.allowedTargetTypeIds,
      onDeleteBehavior:
        input.patch.onDeleteBehavior === undefined
          ? current.onDeleteBehavior
          : input.patch.onDeleteBehavior,
    });
    return this.dependencies.repository.update(input, this.now());
  }

  public archive(input: FieldDefinitionLifecycleInput): FieldDefinition {
    const current = this.requireFieldDefinition(input);
    this.requireRevision(current, input.revision);
    if (current.isArchived) {
      throw new AppError(
        'INVALID_FIELD_DEFINITION_STATE',
        'A definição de campo já está arquivada.',
        {
          id: current.id,
        },
      );
    }
    return this.dependencies.repository.update(
      { ...input, patch: { isArchived: true } },
      this.now(),
    );
  }

  public restore(input: FieldDefinitionLifecycleInput): FieldDefinition {
    const current = this.requireFieldDefinition(input);
    this.requireRevision(current, input.revision);
    if (!current.isArchived) {
      throw new AppError('INVALID_FIELD_DEFINITION_STATE', 'A definição de campo já está ativa.', {
        id: current.id,
      });
    }
    return this.dependencies.repository.update(
      { ...input, patch: { isArchived: false } },
      this.now(),
    );
  }

  private requireEntityType(campaignId: string, entityTypeId: string): EntityType {
    const entityType = this.dependencies.entityTypes.findById(campaignId, entityTypeId);
    if (entityType === null) {
      throw new AppError('ENTITY_TYPE_NOT_FOUND', 'O tipo de entidade não foi encontrado.', {
        campaignId,
        id: entityTypeId,
      });
    }
    return entityType;
  }

  private requireFieldDefinition(input: {
    campaignId: string;
    entityTypeId: string;
    id: string;
  }): FieldDefinition {
    const field = this.dependencies.repository.findById(
      input.campaignId,
      input.entityTypeId,
      input.id,
    );
    if (field === null) {
      throw new AppError('FIELD_DEFINITION_NOT_FOUND', 'A definição de campo não foi encontrada.', {
        campaignId: input.campaignId,
        entityTypeId: input.entityTypeId,
        id: input.id,
      });
    }
    return field;
  }

  private requireRevision(field: FieldDefinition, revision: number): void {
    if (field.revision !== revision) {
      throw new AppError(
        'REVISION_CONFLICT',
        'A definição de campo foi alterada em outra operação.',
        {
          expectedRevision: revision,
          currentRevision: field.revision,
          current: field,
        },
      );
    }
  }

  private validateReferenceConfiguration(
    campaignId: string,
    field: Pick<
      FieldDefinition,
      | 'dataType'
      | 'referenceRelationshipTypeId'
      | 'referenceDirection'
      | 'allowedTargetTypeIds'
      | 'onDeleteBehavior'
    >,
  ): void {
    const isReference =
      field.dataType === 'entity_reference' || field.dataType === 'entity_reference_list';
    const hasReferenceConfiguration =
      field.referenceRelationshipTypeId !== null ||
      field.referenceDirection !== null ||
      field.allowedTargetTypeIds !== null ||
      field.onDeleteBehavior !== null;
    if (!isReference && hasReferenceConfiguration) {
      throw new AppError(
        'INVALID_FIELD_REFERENCE_CONFIG',
        'Somente campos de referência podem possuir configuração de referência.',
      );
    }
    if (!isReference) return;

    if (
      field.referenceRelationshipTypeId !== null &&
      (field.referenceDirection === null || field.onDeleteBehavior === null)
    ) {
      throw new AppError(
        'INVALID_FIELD_REFERENCE_CONFIG',
        'Uma relação de referência exige direção e comportamento de exclusão.',
      );
    }

    for (const targetTypeId of field.allowedTargetTypeIds ?? []) {
      if (this.dependencies.entityTypes.findById(campaignId, targetTypeId) === null) {
        throw new AppError(
          'INVALID_FIELD_REFERENCE_TARGET',
          'Um tipo de destino não pertence à campanha.',
          { campaignId, targetTypeId },
        );
      }
    }
  }
}
