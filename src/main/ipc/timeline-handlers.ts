import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  timelineCampaignRequestSchema,
  timelineEntityRequestSchema,
  timelinePageResultSchema,
} from '../../core/contracts/timeline';
import { timelineChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { TimelineService } from '../services/timeline-service';
import { executeIpcHandler } from './ipc-handler';

export interface TimelineHandlerDependencies {
  service: TimelineService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerTimelineIpcHandlers(
  ipcMain: IpcMain,
  dependencies: TimelineHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: timelineChannels.listCampaign,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          timelineCampaignRequestSchema,
          timelinePageResultSchema,
          dependencies,
          (value) => dependencies.service.listCampaign(value),
        ),
    },
    {
      channel: timelineChannels.listEntity,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          timelineEntityRequestSchema,
          timelinePageResultSchema,
          dependencies,
          (value) => dependencies.service.listEntity(value),
        ),
    },
  ];
  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
