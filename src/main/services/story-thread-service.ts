import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import {
  createStoryThreadInputSchema,
  storyThreadTargetRequestSchema,
  storyThreadPageRequestSchema,
} from '../../core/contracts/story-threads';
import type {
  GetStoryThreadInput,
  StoryThreadDetails,
  StoryThreadLifecycleInput,
  StoryThreadPageRequestInput,
  StoryThreadPageResult,
  StoryThreadTargetPageResult,
  StoryThreadTargetRequestInput,
  UpdateStoryThreadInput,
  SetStoryThreadStatusInput,
  CreateStoryThreadInputRequest,
} from '../../core/contracts/story-threads';
import { AppError } from '../../core/errors/app-error';
import type { StoryThreadRepository } from '../../db/repositories/story-thread-repository';

export interface StoryThreadCampaignLookup {
  findById(id: string): Campaign | null;
}

export class StoryThreadService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: StoryThreadRepository;
      campaigns: StoryThreadCampaignLookup;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(request: CreateStoryThreadInputRequest): StoryThreadDetails {
    const input = createStoryThreadInputSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    const now = this.now();
    const originKind = input.originKind;
    const links = input.links;
    return this.dependencies.repository.create(
      {
        id: this.createId(),
        campaignId: input.campaignId,
        title: input.title,
        description: input.description ?? null,
        threadType: input.threadType,
        status: 'open',
        statusBeforeArchive: null,
        originKind,
        originSessionId: input.sessionId ?? null,
        originReason: normalizeReason(input.originReason),
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
      [...links].sort(compareLinks),
      normalizeReason(input.originReason),
    );
  }

  public get(input: GetStoryThreadInput): StoryThreadDetails {
    this.requireActiveCampaign(input.campaignId);
    const result = this.dependencies.repository.findById(input.campaignId, input.id);
    if (result === null)
      throw new AppError('STORY_THREAD_NOT_FOUND', 'O fio não foi encontrado nesta campanha.');
    return result;
  }

  public list(request: StoryThreadPageRequestInput): StoryThreadPageResult {
    const input = storyThreadPageRequestSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.list(input);
  }

  public listTargets(request: StoryThreadTargetRequestInput): StoryThreadTargetPageResult {
    const input = storyThreadTargetRequestSchema.parse(request);
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.listTargets(input);
  }

  public update(input: UpdateStoryThreadInput): StoryThreadDetails {
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.update(
      {
        campaignId: input.campaignId,
        id: input.id,
        revision: input.revision,
        patch: {
          ...(input.patch?.title === undefined ? {} : { title: input.patch.title }),
          ...(input.patch?.description === undefined
            ? {}
            : { description: input.patch.description }),
          ...(input.patch?.threadType === undefined ? {} : { threadType: input.patch.threadType }),
        },
        ...(input.links === undefined ? {} : { links: [...input.links].sort(compareLinks) }),
      },
      this.now(),
    );
  }

  public resolve(input: StoryThreadLifecycleInput): StoryThreadDetails {
    return this.transition(input, 'resolve');
  }
  public abandon(input: StoryThreadLifecycleInput): StoryThreadDetails {
    return this.transition(input, 'abandon');
  }
  public reopen(input: StoryThreadLifecycleInput): StoryThreadDetails {
    return this.transition(input, 'reopen');
  }
  public archive(input: StoryThreadLifecycleInput): StoryThreadDetails {
    return this.transition(input, 'archive');
  }
  public restore(input: StoryThreadLifecycleInput): StoryThreadDetails {
    return this.transition(input, 'restore');
  }

  public setStatus(input: SetStoryThreadStatusInput): StoryThreadDetails {
    return this.transition(input, 'set', input.status);
  }

  private transition(
    input: StoryThreadLifecycleInput,
    action: 'resolve' | 'abandon' | 'reopen' | 'archive' | 'restore' | 'set',
    status?: string,
  ): StoryThreadDetails {
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.transition(
      {
        campaignId: input.campaignId,
        id: input.id,
        revision: input.revision,
        action,
        ...(status === undefined ? {} : { status }),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        reason: normalizeReason(input.reason),
      },
      this.now(),
    );
  }

  private requireActiveCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.');
    if (campaign.status !== 'active')
      throw new AppError('CAMPAIGN_NOT_ACTIVE', 'A campanha não está ativa para este recurso.');
    return campaign;
  }
}

function normalizeReason(value: string | undefined): string | null {
  const reason = value?.trim();
  return reason === undefined || reason.length === 0 ? null : reason;
}

function compareLinks(
  left: { targetType: string; targetId: string },
  right: { targetType: string; targetId: string },
): number {
  return left.targetType === right.targetType
    ? left.targetId.localeCompare(right.targetId)
    : left.targetType.localeCompare(right.targetType);
}
