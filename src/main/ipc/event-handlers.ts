import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  createEventInputSchema,
  eventDetailsSchema,
  eventLifecycleInputSchema,
  eventPageRequestSchema,
  eventPageResultSchema,
  getEventInputSchema,
  updateEventInputSchema,
} from '../../core/contracts/events';
import { eventChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { EventService } from '../services/event-service';
import { executeIpcHandler } from './ipc-handler';

export interface EventHandlerDependencies {
  service: EventService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerEventIpcHandlers(
  ipcMain: IpcMain,
  dependencies: EventHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: eventChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createEventInputSchema,
          eventDetailsSchema,
          dependencies,
          (value) => dependencies.service.create(value),
        ),
    },
    {
      channel: eventChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getEventInputSchema,
          eventDetailsSchema,
          dependencies,
          (value) => dependencies.service.get(value),
        ),
    },
    {
      channel: eventChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          eventPageRequestSchema,
          eventPageResultSchema,
          dependencies,
          (value) => dependencies.service.list(value),
        ),
    },
    {
      channel: eventChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateEventInputSchema,
          eventDetailsSchema,
          dependencies,
          (value) => dependencies.service.update(value),
        ),
    },
    {
      channel: eventChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          eventLifecycleInputSchema,
          eventDetailsSchema,
          dependencies,
          (value) => dependencies.service.archive(value),
        ),
    },
    {
      channel: eventChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          eventLifecycleInputSchema,
          eventDetailsSchema,
          dependencies,
          (value) => dependencies.service.restore(value),
        ),
    },
  ];

  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
