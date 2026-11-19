import { randomUUID } from 'node:crypto';
import { createCausalLinkInputSchema, getCausalChainInputSchema, updateCausalLinkInputSchema, type CausalChain, type CausalLink, type CreateCausalLinkInput, type GetCausalChainInput, type UpdateCausalLinkInput } from '../../core/contracts/causality';
import type { Campaign } from '../../core/contracts/campaigns';
import { AppError } from '../../core/errors/app-error';
import type { CausalityRepository } from '../../db/repositories/causality-repository';
interface Campaigns { findById(id: string): Campaign | null }
export class CausalityService {
  public constructor(private readonly dependencies: { repository: CausalityRepository; campaigns: Campaigns; createId?: () => string; now?: () => string }) {}
  public createLink(request: CreateCausalLinkInput): CausalLink { const input = createCausalLinkInputSchema.parse(request); this.requireCampaign(input.campaignId); const now = this.dependencies.now?.() ?? new Date().toISOString(); return this.dependencies.repository.createLink({ ...input, description: input.description ?? null, id: this.dependencies.createId?.() ?? randomUUID(), createdAt: now, updatedAt: now }); }
  public updateLink(request: UpdateCausalLinkInput): CausalLink { const input = updateCausalLinkInputSchema.parse(request); this.requireCampaign(input.campaignId); return this.dependencies.repository.updateLink({ ...input, updatedAt: this.dependencies.now?.() ?? new Date().toISOString() }); }
  public getChain(request: GetCausalChainInput): CausalChain { const input = getCausalChainInputSchema.parse(request); this.requireCampaign(input.campaignId); return this.dependencies.repository.getChain(input); }
  private requireCampaign(id: string): void { const campaign = this.dependencies.campaigns.findById(id); if (campaign === null) throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.'); if (campaign.status !== 'active') throw new AppError('CAMPAIGN_NOT_ACTIVE', 'A campanha não está ativa para este recurso.'); }
}
