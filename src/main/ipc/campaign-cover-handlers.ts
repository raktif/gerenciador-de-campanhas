import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  campaignCoverSchema,
  campaignCoverPreviewSchema,
  deleteAttachmentInputSchema,
  deleteAttachmentResultSchema,
  getCampaignCoverInputSchema,
  removeCampaignCoverInputSchema,
  setCampaignCoverInputSchema,
} from '../../core/contracts/campaign-covers';
import { imageImportChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { CampaignCoverService } from '../services/campaign-cover-service';
import { executeIpcHandler } from './ipc-handler';

export interface CampaignCoverHandlerDependencies {
  service: CampaignCoverService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerCampaignCoverIpcHandlers(
  ipcMain: IpcMain,
  dependencies: CampaignCoverHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: imageImportChannels.getCover,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getCampaignCoverInputSchema,
          campaignCoverSchema,
          dependencies,
          (validated) => dependencies.service.get(validated),
        ),
    },
    {
      channel: imageImportChannels.getCoverPreview,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getCampaignCoverInputSchema,
          campaignCoverPreviewSchema,
          dependencies,
          (validated) => dependencies.service.getPreview(validated),
        ),
    },
    {
      channel: imageImportChannels.setCover,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          setCampaignCoverInputSchema,
          campaignCoverSchema,
          dependencies,
          (validated) => dependencies.service.set(validated),
        ),
    },
    {
      channel: imageImportChannels.removeCover,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          removeCampaignCoverInputSchema,
          campaignCoverSchema,
          dependencies,
          (validated) => dependencies.service.remove(validated),
        ),
    },
    {
      channel: imageImportChannels.deleteAttachment,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          deleteAttachmentInputSchema,
          deleteAttachmentResultSchema,
          dependencies,
          (validated) => dependencies.service.deleteAttachment(validated),
        ),
    },
  ];
  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
