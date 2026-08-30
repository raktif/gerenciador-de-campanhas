import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type {
  CreateEntityTypeInput,
  EntityType,
  EntityTypeLifecycleInput,
  EntityTypePageRequest,
  EntityTypePageResult,
  GetEntityTypeInput,
  UpdateEntityTypeInput,
} from '../../core/contracts/entity-types';
import { AppError } from '../../core/errors/app-error';
import type { EntityTypeRepositoryUpdate } from '../../db/repositories/entity-type-repository';

export interface EntityTypeRepositoryPort {
  insert(entityType: EntityType): EntityType;
  findById(campaignId: string, id: string): EntityType | null;
  list(request: EntityTypePageRequest): EntityTypePageResult;
  update(input: EntityTypeRepositoryUpdate, updatedAt: string): EntityType;
}

export interface CampaignLookupPort {
  findById(id: string): Campaign | null;
}

export interface EntityTypeServiceDependencies {
  repository: EntityTypeRepositoryPort;
  campaigns: CampaignLookupPort;
  createId?: () => string;
  now?: () => string;
}

export class EntityTypeService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(private readonly dependencies: EntityTypeServiceDependencies) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateEntityTypeInput): EntityType {
    this.requireCampaign(input.campaignId);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      campaignId: input.campaignId,
      packId: null,
      name: input.name,
      singularName: input.singularName,
      slug: input.slug,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder,
      isSystem: false,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
  }

  public get(input: GetEntityTypeInput): EntityType {
    return this.requireEntityType(input.campaignId, input.id);
  }

  public list(request: EntityTypePageRequest): EntityTypePageResult {
    this.requireCampaign(request.campaignId);
    return this.dependencies.repository.list(request);
  }

  public update(input: UpdateEntityTypeInput): EntityType {
    return this.dependencies.repository.update(input, this.now());
  }

  public archive(input: EntityTypeLifecycleInput): EntityType {
    const current = this.requireEntityType(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.isArchived) {
      throw new AppError('INVALID_ENTITY_TYPE_STATE', 'O tipo de entidade já está arquivado.', {
        campaignId: current.campaignId,
        id: current.id,
      });
    }
    return this.dependencies.repository.update(
      { ...input, patch: { isArchived: true } },
      this.now(),
    );
  }

  public restore(input: EntityTypeLifecycleInput): EntityType {
    const current = this.requireEntityType(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (!current.isArchived) {
      throw new AppError('INVALID_ENTITY_TYPE_STATE', 'O tipo de entidade já está ativo.', {
        campaignId: current.campaignId,
        id: current.id,
      });
    }
    return this.dependencies.repository.update(
      { ...input, patch: { isArchived: false } },
      this.now(),
    );
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null) {
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { campaignId });
    }
    return campaign;
  }

  private requireEntityType(campaignId: string, id: string): EntityType {
    const entityType = this.dependencies.repository.findById(campaignId, id);
    if (entityType === null) {
      throw new AppError('ENTITY_TYPE_NOT_FOUND', 'O tipo de entidade não foi encontrado.', {
        campaignId,
        id,
      });
    }
    return entityType;
  }

  private requireRevision(entityType: EntityType, revision: number): void {
    if (entityType.revision !== revision) {
      throw new AppError(
        'REVISION_CONFLICT',
        'O tipo de entidade foi alterado em outra operação.',
        {
          expectedRevision: revision,
          currentRevision: entityType.revision,
          current: entityType,
        },
      );
    }
  }
}
