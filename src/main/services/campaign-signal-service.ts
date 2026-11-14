import type { Campaign } from '../../core/contracts/campaigns';
import type {
  CampaignSignalCampaignInput,
  CampaignSignalListResult,
  CampaignSignalRecalculationResult,
  DismissCampaignSignalInput,
  MarkContradictionExceptionInput,
  ReactivateCampaignSignalInput,
  ReviewCampaignSignalInput,
  SnoozeCampaignSignalInput,
  ContradictionReview,
} from '../../core/contracts/campaign-signal-engine';
import type { CampaignSignal } from '../../core/contracts/campaign-signals';
import { AppError } from '../../core/errors/app-error';
import type { CampaignSignalReviewItem } from '../../core/contracts/campaign-signal-engine';

export interface CampaignSignalRepositoryPort {
  getContradictionReview(input: ReviewCampaignSignalInput): ContradictionReview;
  list(campaignId: string): CampaignSignalReviewItem[];
  listAndExpireSnoozes(
    campaignId: string,
    now: string,
  ): { items: CampaignSignalReviewItem[]; expiredSnoozes: number };
  findById(campaignId: string, id: string): CampaignSignal | null;
  recalculate(campaignId: string, now: string): CampaignSignalRecalculationResult;
  updateStatus(
    campaignId: string,
    id: string,
    revision: number,
    status: CampaignSignal['status'],
    dismissedUntil: string | null,
    updatedAt: string,
  ): CampaignSignal;
  markContradictionException(
    campaignId: string,
    id: string,
    revision: number,
    createdAt: string,
  ): CampaignSignal;
}

export interface CampaignSignalCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export class CampaignSignalService {
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: CampaignSignalRepositoryPort;
      campaigns: CampaignSignalCampaignLookupPort;
      now?: () => string;
    },
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public list(input: CampaignSignalCampaignInput): CampaignSignalListResult {
    this.requireCampaign(input.campaignId);
    const result = this.dependencies.repository.listAndExpireSnoozes(input.campaignId, this.now());
    return { items: result.items };
  }

  public recalculate(input: CampaignSignalCampaignInput): CampaignSignalRecalculationResult {
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.recalculate(input.campaignId, this.now());
  }

  public review(input: ReviewCampaignSignalInput): CampaignSignal {
    return this.transition(input, 'review');
  }

  public getContradictionReview(input: ReviewCampaignSignalInput): ContradictionReview {
    this.requireActiveCampaign(input.campaignId);
    return this.dependencies.repository.getContradictionReview(input);
  }

  public dismiss(input: DismissCampaignSignalInput): CampaignSignal {
    return this.transition(input, 'dismiss');
  }

  public reactivate(input: ReactivateCampaignSignalInput): CampaignSignal {
    return this.transition(input, 'reactivate');
  }

  public snooze(input: SnoozeCampaignSignalInput): CampaignSignal {
    return this.transition(input, 'snooze', input.dismissedUntil);
  }

  public markContradictionException(input: MarkContradictionExceptionInput): CampaignSignal {
    this.requireActiveCampaign(input.campaignId);
    const current = this.dependencies.repository.findById(input.campaignId, input.id);
    if (current === null)
      throw new AppError('CAMPAIGN_SIGNAL_NOT_FOUND', 'O sinal não foi encontrado nesta campanha.');
    if (current.revision !== input.revision)
      throw new AppError('REVISION_CONFLICT', 'O sinal foi alterado em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
      });
    if (current.signalType !== 'potential_contradiction')
      throw new AppError(
        'INVALID_POTENTIAL_CONTRADICTION_ACTION',
        'Somente uma possível contradição pode ser marcada como exceção.',
      );
    return this.dependencies.repository.markContradictionException(
      input.campaignId,
      input.id,
      input.revision,
      this.now(),
    );
  }

  private transition(
    input: ReviewCampaignSignalInput | SnoozeCampaignSignalInput,
    action: 'review' | 'dismiss' | 'reactivate' | 'snooze',
    dismissedUntil?: string,
  ): CampaignSignal {
    this.requireActiveCampaign(input.campaignId);
    const current = this.dependencies.repository.findById(input.campaignId, input.id);
    if (current === null)
      throw new AppError('CAMPAIGN_SIGNAL_NOT_FOUND', 'O sinal não foi encontrado nesta campanha.');
    if (current.revision !== input.revision)
      throw new AppError('REVISION_CONFLICT', 'O sinal foi alterado em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
      });

    const now = this.now();
    if (action === 'review') {
      if (current.status !== 'new') throw invalidTransition(action, current.status);
      return this.dependencies.repository.updateStatus(
        input.campaignId,
        input.id,
        input.revision,
        'viewed',
        null,
        now,
      );
    }

    if (action === 'dismiss') {
      if (!['new', 'viewed', 'stale', 'snoozed'].includes(current.status))
        throw invalidTransition(action, current.status);
      return this.dependencies.repository.updateStatus(
        input.campaignId,
        input.id,
        input.revision,
        'dismissed',
        null,
        now,
      );
    }

    if (action === 'reactivate') {
      if (!['dismissed', 'snoozed', 'stale'].includes(current.status))
        throw invalidTransition(action, current.status);
      return this.dependencies.repository.updateStatus(
        input.campaignId,
        input.id,
        input.revision,
        'viewed',
        null,
        now,
      );
    }

    if (!['new', 'viewed', 'stale'].includes(current.status))
      throw invalidTransition(action, current.status);
    if (
      dismissedUntil === undefined ||
      Number.isNaN(Date.parse(dismissedUntil)) ||
      Date.parse(dismissedUntil) <= Date.parse(now)
    )
      throw new AppError(
        'INVALID_SIGNAL_SNOOZE_DEADLINE',
        'O prazo para adiar o sinal precisa estar no futuro.',
      );
    return this.dependencies.repository.updateStatus(
      input.campaignId,
      input.id,
      input.revision,
      'snoozed',
      dismissedUntil,
      now,
    );
  }

  private requireCampaign(id: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(id);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { id });
    return campaign;
  }

  private requireActiveCampaign(id: string): void {
    const campaign = this.requireCampaign(id);
    if (campaign.status !== 'active')
      throw new AppError(
        'INVALID_CAMPAIGN_STATE',
        'Somente campanhas ativas podem revisar sinais.',
        {
          id: campaign.id,
          status: campaign.status,
        },
      );
  }
}

function invalidTransition(action: string, status: CampaignSignal['status']): AppError {
  return new AppError(
    'INVALID_CAMPAIGN_SIGNAL_TRANSITION',
    'Esta ação não é permitida para o estado atual do sinal.',
    { action, status },
  );
}
