import { contextBridge, ipcRenderer } from 'electron';
import { phaseZeroChannels } from '../core/contracts/ipc-channels';
import { emptyInputSchema, type CampaignManagerGateway } from '../core/contracts/phase-zero';
import type { Result } from '../core/contracts/result';

async function invoke<T>(channel: string, input: unknown): Promise<Result<T>> {
  const validatedInput = emptyInputSchema.parse(input ?? {});
  return ipcRenderer.invoke(channel, validatedInput) as Promise<Result<T>>;
}

const gateway: CampaignManagerGateway = {
  phaseZero: {
    getStatus: (input = {}) => invoke(phaseZeroChannels.getStatus, input),
    writeTest: (input = {}) => invoke(phaseZeroChannels.writeTest, input),
    readTest: (input = {}) => invoke(phaseZeroChannels.readTest, input),
    openDataDirectory: (input = {}) => invoke(phaseZeroChannels.openDataDirectory, input),
  },
};

contextBridge.exposeInMainWorld('campaignManager', gateway);
