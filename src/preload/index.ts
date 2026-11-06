import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { createCampaignManagerGateway } from './gateways/campaign-manager-gateway';

const gateway = createCampaignManagerGateway(
  (channel, input) => ipcRenderer.invoke(channel, input),
  (channel, listener) => {
    const handlePayload = (_event: IpcRendererEvent, payload: unknown): void => listener(payload);
    ipcRenderer.on(channel, handlePayload);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(channel, handlePayload);
    };
  },
);

contextBridge.exposeInMainWorld('campaignManager', gateway);
