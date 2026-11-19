import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  campaignSignalCampaignInputSchema,
  campaignSignalListResultSchema,
  campaignSignalRecalculationResultSchema,
  dismissCampaignSignalInputSchema,
  markContradictionExceptionInputSchema,
  reactivateCampaignSignalInputSchema,
  reviewCampaignSignalInputSchema,
  snoozeCampaignSignalInputSchema,
  contradictionReviewSchema,
} from '../../core/contracts/campaign-signal-engine';
import { campaignSignalSchema } from '../../core/contracts/campaign-signals';
import { campaignSignalChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { CampaignSignalService } from '../services/campaign-signal-service';
import { executeIpcHandler } from './ipc-handler';

export interface CampaignSignalHandlerDependencies {
  service: CampaignSignalService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerCampaignSignalIpcHandlers(
  ipcMain: IpcMain,
  dependencies: CampaignSignalHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: campaignSignalChannels.getContradictionReview,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          reviewCampaignSignalInputSchema,
          contradictionReviewSchema,
          dependencies,
          (value) => dependencies.service.getContradictionReview(value),
        ),
    },
    {
      channel: campaignSignalChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          campaignSignalCampaignInputSchema,
          campaignSignalListResultSchema,
          dependencies,
          (value) => dependencies.service.list(value),
        ),
    },
    {
      channel: campaignSignalChannels.listForWorldInMotion,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          campaignSignalCampaignInputSchema,
          campaignSignalListResultSchema,
          dependencies,
          (value) => dependencies.service.listForWorldInMotion(value),
        ),
    },
    {
      channel: campaignSignalChannels.recalculate,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          campaignSignalCampaignInputSchema,
          campaignSignalRecalculationResultSchema,
          dependencies,
          (value) => dependencies.service.recalculate(value),
        ),
    },
    {
      channel: campaignSignalChannels.review,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          reviewCampaignSignalInputSchema,
          campaignSignalSchema,
          dependencies,
          (value) => dependencies.service.review(value),
        ),
    },
    {
      channel: campaignSignalChannels.dismiss,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          dismissCampaignSignalInputSchema,
          campaignSignalSchema,
          dependencies,
          (value) => dependencies.service.dismiss(value),
        ),
    },
    {
      channel: campaignSignalChannels.reactivate,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          reactivateCampaignSignalInputSchema,
          campaignSignalSchema,
          dependencies,
          (value) => dependencies.service.reactivate(value),
        ),
    },
    {
      channel: campaignSignalChannels.snooze,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          snoozeCampaignSignalInputSchema,
          campaignSignalSchema,
          dependencies,
          (value) => dependencies.service.snooze(value),
        ),
    },
    {
      channel: campaignSignalChannels.markContradictionException,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          markContradictionExceptionInputSchema,
          campaignSignalSchema,
          dependencies,
          (value) => dependencies.service.markContradictionException(value),
        ),
    },
  ];

  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
