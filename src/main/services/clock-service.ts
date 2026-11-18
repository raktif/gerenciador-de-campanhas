import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import {
  clockPageRequestSchema,
  completeClockInputSchema,
  createClockInputSchema,
  getClockInputSchema,
  updateClockInputSchema,
  type Clock,
  type ClockPageRequestInput,
  type ClockPageResult,
  type CompleteClockInput,
  type CreateClockInput,
  type GetClockInput,
  type UpdateClockInput,
} from '../../core/contracts/clocks';
import { AppError } from '../../core/errors/app-error';
import type { ClockRepository } from '../../db/repositories/clock-repository';

export interface ClockCampaignLookup {
  findById(id: string): Campaign | null;
}

export class ClockService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: ClockRepository;
      campaigns: ClockCampaignLookup;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(request: CreateClockInput): Clock {
    const input = createClockInputSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.create({
      idempotencyKey: input.idempotencyKey,
      id: this.createId(),
      campaignId: input.campaignId,
      name: input.name,
      description: input.description ?? null,
      consequence: input.consequence,
      clockType: input.clockType,
      segmentsTotal: input.segmentsTotal,
      segmentsFilled: input.segmentsFilled,
      entityId: input.entityId,
      canonState: input.canonState,
      knowledgeState: input.knowledgeState,
      visibility: input.visibility,
      originKind: input.originKind,
      sourceId: input.sourceId,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      generateEvent: input.generateEvent === true,
      generatedEventId: input.generateEvent === true ? this.createId() : null,
      now: this.now(),
    });
  }

  public get(request: GetClockInput): Clock {
    const input = getClockInputSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    const clock = this.dependencies.repository.findById(input.campaignId, input.id);
    if (clock === null)
      throw new AppError('CLOCK_NOT_FOUND', 'O relógio não foi encontrado nesta campanha.');
    return clock;
  }

  public list(request: ClockPageRequestInput): ClockPageResult {
    const input = clockPageRequestSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.list(input);
  }

  public update(request: UpdateClockInput): Clock {
    const input = updateClockInputSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.update({
      campaignId: input.campaignId,
      id: input.id,
      revision: input.revision,
      patch: {
        ...(input.patch.name === undefined ? {} : { name: input.patch.name }),
        ...(input.patch.description === undefined ? {} : { description: input.patch.description }),
        ...(input.patch.consequence === undefined ? {} : { consequence: input.patch.consequence }),
        ...(input.patch.clockType === undefined ? {} : { clockType: input.patch.clockType }),
        ...(input.patch.segmentsTotal === undefined
          ? {}
          : { segmentsTotal: input.patch.segmentsTotal }),
        ...(input.patch.segmentsFilled === undefined
          ? {}
          : { segmentsFilled: input.patch.segmentsFilled }),
        ...(input.patch.entityId === undefined ? {} : { entityId: input.patch.entityId }),
        ...(input.patch.canonState === undefined ? {} : { canonState: input.patch.canonState }),
        ...(input.patch.knowledgeState === undefined
          ? {}
          : { knowledgeState: input.patch.knowledgeState }),
        ...(input.patch.visibility === undefined ? {} : { visibility: input.patch.visibility }),
        ...(input.patch.originKind === undefined ? {} : { originKind: input.patch.originKind }),
        ...(input.patch.sourceId === undefined ? {} : { sourceId: input.patch.sourceId }),
        ...(input.patch.sessionId === undefined ? {} : { sessionId: input.patch.sessionId }),
      },
      ...(input.generateEvent === undefined ? {} : { generateEvent: input.generateEvent }),
      ...(input.generateEvent === true ? { generatedEventId: this.createId() } : {}),
      now: this.now(),
    });
  }

  public complete(request: CompleteClockInput): Clock {
    const input = completeClockInputSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.complete(
      input.campaignId,
      input.id,
      input.revision,
      input.generateEvent,
      input.generateEvent ? this.createId() : undefined,
      this.now(),
    );
  }

  private requireActiveCampaign(campaignId: string): void {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.');
    if (campaign.status !== 'active')
      throw new AppError('CLOCK_CAMPAIGN_NOT_ACTIVE', 'A campanha não está ativa para relógios.');
  }
}
