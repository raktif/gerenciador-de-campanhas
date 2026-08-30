import { contextBridge, ipcRenderer } from 'electron';
import { createCampaignManagerGateway } from './gateways/campaign-manager-gateway';

const gateway = createCampaignManagerGateway((channel, input) =>
  ipcRenderer.invoke(channel, input),
);

contextBridge.exposeInMainWorld('campaignManager', gateway);
