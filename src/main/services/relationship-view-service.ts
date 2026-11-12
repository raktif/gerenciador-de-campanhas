import { randomUUID } from 'node:crypto';
import {
  applyRelationshipAutoLayoutInputSchema,
  getRelationshipViewInputSchema,
  relationshipViewSchema,
  relationshipViewStateSchema,
  resetRelationshipLayoutInputSchema,
  saveRelationshipNodePositionInputSchema,
  saveRelationshipViewportInputSchema,
  type ApplyRelationshipAutoLayoutInput,
  type GetRelationshipViewInput,
  type RelationshipViewState,
  type ResetRelationshipLayoutInput,
  type SaveRelationshipNodePositionInput,
  type SaveRelationshipViewportInput,
} from '../../core/contracts/relationship-views';
import { AppError } from '../../core/errors/app-error';
import type { CampaignRepository } from '../../db/repositories/campaign-repository';
import type { EntityRepository } from '../../db/repositories/entity-repository';
import type { RelationshipViewRepository } from '../../db/repositories/relationship-view-repository';

type RelationshipViewPersistence = Pick<
  RelationshipViewRepository,
  | 'findDefault'
  | 'findById'
  | 'insertDefault'
  | 'saveNodePosition'
  | 'saveViewport'
  | 'applyAutoLayout'
  | 'resetLayout'
>;
type CampaignLookup = Pick<CampaignRepository, 'findById'>;
type EntityLookup = Pick<EntityRepository, 'findById'>;

export class RelationshipViewService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: {
      repository: RelationshipViewPersistence;
      campaigns: CampaignLookup;
      entities: EntityLookup;
      createId?: () => string;
      now?: () => Date;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  public get(input: GetRelationshipViewInput): RelationshipViewState {
    const parsed = getRelationshipViewInputSchema.parse(input);
    this.requireCampaign(parsed.campaignId);
    if (parsed.sourceEntityId !== null)
      this.requireEntity(parsed.campaignId, parsed.sourceEntityId);
    const existing = this.dependencies.repository.findDefault(parsed);
    if (existing !== null) return relationshipViewStateSchema.parse(existing);
    const timestamp = this.now().toISOString();
    return relationshipViewStateSchema.parse(
      this.dependencies.repository.insertDefault(
        relationshipViewSchema.parse({
          id: this.createId(),
          campaignId: parsed.campaignId,
          name: parsed.viewType === 'campaign' ? 'Mapa principal' : 'Vizinhança',
          viewType: parsed.viewType,
          sourceEntityId: parsed.sourceEntityId,
          isDefault: true,
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: timestamp,
          updatedAt: timestamp,
          revision: 1,
        }),
      ),
    );
  }

  public saveNodePosition(input: SaveRelationshipNodePositionInput): RelationshipViewState {
    const parsed = saveRelationshipNodePositionInputSchema.parse(input);
    this.requireCampaign(parsed.campaignId);
    this.requireEntity(parsed.campaignId, parsed.position.entityId);
    return relationshipViewStateSchema.parse(
      this.dependencies.repository.saveNodePosition(parsed, this.now().toISOString()),
    );
  }

  public saveViewport(input: SaveRelationshipViewportInput): RelationshipViewState {
    const parsed = saveRelationshipViewportInputSchema.parse(input);
    this.requireCampaign(parsed.campaignId);
    return relationshipViewStateSchema.parse(
      this.dependencies.repository.saveViewport(parsed, this.now().toISOString()),
    );
  }

  public autoLayout(input: ApplyRelationshipAutoLayoutInput): RelationshipViewState {
    const parsed = applyRelationshipAutoLayoutInputSchema.parse(input);
    this.requireCampaign(parsed.campaignId);
    for (const position of parsed.positions)
      this.requireEntity(parsed.campaignId, position.entityId);
    return relationshipViewStateSchema.parse(
      this.dependencies.repository.applyAutoLayout(parsed, this.now().toISOString()),
    );
  }

  public resetLayout(input: ResetRelationshipLayoutInput): RelationshipViewState {
    const parsed = resetRelationshipLayoutInputSchema.parse(input);
    this.requireCampaign(parsed.campaignId);
    return relationshipViewStateSchema.parse(
      this.dependencies.repository.resetLayout(parsed, this.now().toISOString()),
    );
  }

  private requireCampaign(campaignId: string): void {
    if (this.dependencies.campaigns.findById(campaignId) === null)
      throw new AppError(
        'CAMPAIGN_NOT_FOUND',
        'A campanha da visualização de Relações não foi encontrada.',
      );
  }

  private requireEntity(campaignId: string, entityId: string): void {
    if (this.dependencies.entities.findById(campaignId, entityId) === null)
      throw new AppError(
        'ENTITY_NOT_FOUND',
        'A entidade da visualização de Relações não foi encontrada nesta campanha.',
      );
  }
}
