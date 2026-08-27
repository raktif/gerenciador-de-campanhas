import type { CampaignManagerGateway } from '../core/contracts/phase-zero';

declare global {
  interface Window {
    campaignManager: CampaignManagerGateway;
  }
}

export {};
