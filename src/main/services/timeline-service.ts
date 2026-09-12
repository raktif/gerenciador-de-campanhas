import type { Campaign } from '../../core/contracts/campaigns';
import type { Entity } from '../../core/contracts/entities';
import type {
  TimelineCampaignRequest,
  TimelineEntityRequest,
  TimelinePageResult,
} from '../../core/contracts/timeline';
import { AppError } from '../../core/errors/app-error';

export interface TimelineRepositoryPort {
  listCampaign(request: TimelineCampaignRequest): TimelinePageResult;
  listEntity(request: TimelineEntityRequest): TimelinePageResult;
}

export interface TimelineCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export interface TimelineEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
}

export class TimelineService {
  public constructor(
    private readonly dependencies: {
      repository: TimelineRepositoryPort;
      campaigns: TimelineCampaignLookupPort;
      entities: TimelineEntityLookupPort;
    },
  ) {}

  public listCampaign(input: TimelineCampaignRequest): TimelinePageResult {
    this.requireCampaign(input.campaignId);
    return this.dependencies.repository.listCampaign(input);
  }

  public listEntity(input: TimelineEntityRequest): TimelinePageResult {
    this.requireCampaign(input.campaignId);
    // Entidades arquivadas seguem consultáveis para preservar a leitura histórica.
    this.requireEntity(input.campaignId, input.entityId);
    return this.dependencies.repository.listEntity(input);
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { campaignId });
    return campaign;
  }

  private requireEntity(campaignId: string, entityId: string): Entity {
    const entity = this.dependencies.entities.findById(campaignId, entityId);
    if (entity === null)
      throw new AppError('ENTITY_NOT_FOUND', 'A entidade não foi encontrada nesta campanha.', {
        campaignId,
        entityId,
      });
    return entity;
  }
}
