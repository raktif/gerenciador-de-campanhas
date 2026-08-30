import type { CampaignManagerGateway } from '../core/contracts/gateway';

declare global {
  interface Window {
    campaignManager: CampaignManagerGateway;
  }
}

export {};
