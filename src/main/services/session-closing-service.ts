import type { Campaign } from '../../core/contracts/campaigns';
import type { CampaignSignalRecalculationResult } from '../../core/contracts/campaign-signal-engine';
import { getSessionClosingInputSchema, getSessionPreparationInputSchema, quickCloseSessionInputSchema, selectSessionPreparationItemInputSchema, updateSessionClosingStepInputSchema, type GetSessionClosingInput, type GetSessionPreparationInput, type QuickCloseSessionInput, type SelectSessionPreparationItemInput, type SessionClosingWorkflow, type SessionPreparation, type UpdateSessionClosingStepInput } from '../../core/contracts/session-closing';
import { AppError } from '../../core/errors/app-error';
import type { SessionClosingRepository } from '../../db/repositories/session-closing-repository';

interface CampaignLookup { findById(id: string): Campaign | null }
export interface CampaignSignalRecalculationPort { recalculate(input: { campaignId: string }): CampaignSignalRecalculationResult }
export class SessionClosingService {
  public constructor(private readonly dependencies: { repository: SessionClosingRepository; campaigns: CampaignLookup; signals?: CampaignSignalRecalculationPort; now?: () => string }) {}
  public get(request: GetSessionClosingInput): SessionClosingWorkflow { const input = getSessionClosingInputSchema.parse(request); this.requireCampaign(input.campaignId); return this.dependencies.repository.getWorkflow(input.campaignId, input.sessionId, this.now()); }
  public updateStep(request: UpdateSessionClosingStepInput): SessionClosingWorkflow {
    const input = updateSessionClosingStepInputSchema.parse(request); this.requireCampaign(input.campaignId);
    if (input.step === 'signals' && input.status === 'completed') {
      if (this.dependencies.signals === undefined) throw new AppError('SESSION_SIGNAL_RECALCULATION_UNAVAILABLE', 'O recálculo determinístico de sinais não está disponível. A etapa permanece pendente.');
      this.dependencies.signals.recalculate({ campaignId: input.campaignId });
    }
    return this.dependencies.repository.updateStep({ ...input, now: this.now() });
  }
  public quickClose(request: QuickCloseSessionInput): SessionClosingWorkflow { const input = quickCloseSessionInputSchema.parse(request); this.requireCampaign(input.campaignId); return this.dependencies.repository.quickClose(input.campaignId, input.sessionId, this.now()); }
  public getPreparation(request: GetSessionPreparationInput): SessionPreparation { const input = getSessionPreparationInputSchema.parse(request); this.requireCampaign(input.campaignId); return this.dependencies.repository.getPreparation(input, this.now()); }
  public selectPreparationItem(request: SelectSessionPreparationItemInput): SessionPreparation { const input = selectSessionPreparationItemInputSchema.parse(request); this.requireCampaign(input.campaignId); return this.dependencies.repository.selectPreparationItem({ ...input, now: this.now() }); }
  private now(): string { return this.dependencies.now?.() ?? new Date().toISOString(); }
  private requireCampaign(id: string): void { const campaign = this.dependencies.campaigns.findById(id); if (campaign === null) throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.'); if (campaign.status !== 'active') throw new AppError('CAMPAIGN_NOT_ACTIVE', 'A campanha não está ativa para este recurso.'); }
}
