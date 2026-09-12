import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type { EntityType } from '../../core/contracts/entity-types';
import type {
  CreateRelationshipTypeInput,
  GetRelationshipTypeInput,
  RelationshipType,
  RelationshipTypeLifecycleInput,
  RelationshipTypePageRequest,
  RelationshipTypePageResult,
  UpdateRelationshipTypeInput,
} from '../../core/contracts/relationship-types';
import { AppError } from '../../core/errors/app-error';
import type { RelationshipTypeRepositoryUpdate } from '../../db/repositories/relationship-type-repository';

export interface RelationshipTypeRepositoryPort {
  insert(relationshipType: RelationshipType): RelationshipType;
  findById(campaignId: string, id: string): RelationshipType | null;
  list(request: RelationshipTypePageRequest): RelationshipTypePageResult;
  update(input: RelationshipTypeRepositoryUpdate, updatedAt: string): RelationshipType;
}
export interface RelationshipTypeCampaignLookupPort {
  findById(id: string): Campaign | null;
}
export interface RelationshipTypeEntityTypeLookupPort {
  findById(campaignId: string, id: string): EntityType | null;
}

export class RelationshipTypeService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: RelationshipTypeRepositoryPort;
      campaigns: RelationshipTypeCampaignLookupPort;
      entityTypes: RelationshipTypeEntityTypeLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateRelationshipTypeInput): RelationshipType {
    this.requireCampaign(input.campaignId);
    this.validateAllowedTypes(input.campaignId, input.allowedSourceTypeIds);
    this.validateAllowedTypes(input.campaignId, input.allowedTargetTypeIds);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      campaignId: input.campaignId,
      packId: null,
      name: input.name,
      slug: input.slug,
      inverseName: input.inverseName,
      description: input.description,
      semanticRole: input.semanticRole,
      isSymmetric: input.isSymmetric,
      allowedSourceTypeIds: input.allowedSourceTypeIds,
      allowedTargetTypeIds: input.allowedTargetTypeIds,
      icon: input.icon,
      color: input.color,
      sortOrder: input.sortOrder,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
  }

  public get(input: GetRelationshipTypeInput): RelationshipType {
    return this.requireRelationshipType(input.campaignId, input.id);
  }

  public list(request: RelationshipTypePageRequest): RelationshipTypePageResult {
    this.requireCampaign(request.campaignId);
    return this.dependencies.repository.list(request);
  }

  public update(input: UpdateRelationshipTypeInput): RelationshipType {
    this.requireRelationshipType(input.campaignId, input.id);
    if (input.patch.allowedSourceTypeIds !== undefined)
      this.validateAllowedTypes(input.campaignId, input.patch.allowedSourceTypeIds);
    if (input.patch.allowedTargetTypeIds !== undefined)
      this.validateAllowedTypes(input.campaignId, input.patch.allowedTargetTypeIds);
    return this.dependencies.repository.update(input, this.now());
  }

  public archive(input: RelationshipTypeLifecycleInput): RelationshipType {
    const current = this.requireRelationshipType(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.isArchived)
      throw new AppError('INVALID_RELATIONSHIP_TYPE_STATE', 'O tipo de relação já está arquivado.');
    return this.dependencies.repository.update(
      { ...input, patch: { isArchived: true } },
      this.now(),
    );
  }

  public restore(input: RelationshipTypeLifecycleInput): RelationshipType {
    const current = this.requireRelationshipType(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (!current.isArchived)
      throw new AppError('INVALID_RELATIONSHIP_TYPE_STATE', 'O tipo de relação já está ativo.');
    return this.dependencies.repository.update(
      { ...input, patch: { isArchived: false } },
      this.now(),
    );
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { campaignId });
    return campaign;
  }

  private requireRelationshipType(campaignId: string, id: string): RelationshipType {
    const relationshipType = this.dependencies.repository.findById(campaignId, id);
    if (relationshipType === null)
      throw new AppError('RELATIONSHIP_TYPE_NOT_FOUND', 'O tipo de relação não foi encontrado.', {
        campaignId,
        id,
      });
    return relationshipType;
  }

  private validateAllowedTypes(campaignId: string, ids: string[] | null): void {
    if (ids === null) return;
    for (const id of ids) {
      const entityType = this.dependencies.entityTypes.findById(campaignId, id);
      if (entityType === null)
        throw new AppError(
          'ENTITY_TYPE_NOT_FOUND',
          'Um tipo de entidade permitido não pertence a esta campanha.',
          { campaignId, id },
        );
      if (entityType.isArchived)
        throw new AppError(
          'INVALID_ENTITY_TYPE_STATE',
          'Um tipo de entidade arquivado não pode ser incluído nas restrições.',
          { campaignId, id },
        );
    }
  }

  private requireRevision(relationshipType: RelationshipType, revision: number): void {
    if (relationshipType.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'O tipo de relação foi alterado em outra operação.', {
        expectedRevision: revision,
        currentRevision: relationshipType.revision,
        current: relationshipType,
      });
  }
}
