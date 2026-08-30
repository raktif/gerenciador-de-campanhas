import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  campaignLifecycleInputSchema,
  campaignPageRequestSchema,
  campaignPageResultSchema,
  campaignSchema,
  createCampaignInputSchema,
  getCampaignInputSchema,
  updateCampaignInputSchema,
} from '../../core/contracts/campaigns';
import { campaignChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { CampaignService } from '../services/campaign-service';
import { executeIpcHandler } from './ipc-handler';

export interface CampaignHandlerDependencies {
  service: CampaignService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerCampaignIpcHandlers(
  ipcMain: IpcMain,
  dependencies: CampaignHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: campaignChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createCampaignInputSchema,
          campaignSchema,
          dependencies,
          (validatedInput) => dependencies.service.create(validatedInput),
        ),
    },
    {
      channel: campaignChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getCampaignInputSchema,
          campaignSchema,
          dependencies,
          (validatedInput) => dependencies.service.get(validatedInput),
        ),
    },
    {
      channel: campaignChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          campaignPageRequestSchema,
          campaignPageResultSchema,
          dependencies,
          (validatedInput) => dependencies.service.list(validatedInput),
        ),
    },
    {
      channel: campaignChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateCampaignInputSchema,
          campaignSchema,
          dependencies,
          (validatedInput) => dependencies.service.update(validatedInput),
        ),
    },
    {
      channel: campaignChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          campaignLifecycleInputSchema,
          campaignSchema,
          dependencies,
          (validatedInput) => dependencies.service.archive(validatedInput),
        ),
    },
    {
      channel: campaignChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          campaignLifecycleInputSchema,
          campaignSchema,
          dependencies,
          (validatedInput) => dependencies.service.restore(validatedInput),
        ),
    },
    {
      channel: campaignChannels.moveToTrash,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          campaignLifecycleInputSchema,
          campaignSchema,
          dependencies,
          (validatedInput) => dependencies.service.moveToTrash(validatedInput),
        ),
    },
  ];

  for (const registration of registrations) {
    ipcMain.handle(registration.channel, registration.handler);
  }

  return () => {
    for (const registration of registrations) {
      ipcMain.removeHandler(registration.channel);
    }
  };
}
