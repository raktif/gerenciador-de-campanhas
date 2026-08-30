import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  createEntityInputSchema,
  entityDetailsSchema,
  entityLifecycleInputSchema,
  entityPageRequestSchema,
  entityPageResultSchema,
  getEntityInputSchema,
  updateEntityInputSchema,
} from '../../core/contracts/entities';
import { entityChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { EntityService } from '../services/entity-service';
import { executeIpcHandler } from './ipc-handler';

export interface EntityHandlerDependencies {
  service: EntityService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerEntityIpcHandlers(
  ipcMain: IpcMain,
  dependencies: EntityHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: entityChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createEntityInputSchema,
          entityDetailsSchema,
          dependencies,
          (validatedInput) => dependencies.service.create(validatedInput),
        ),
    },
    {
      channel: entityChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getEntityInputSchema,
          entityDetailsSchema,
          dependencies,
          (validatedInput) => dependencies.service.get(validatedInput),
        ),
    },
    {
      channel: entityChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          entityPageRequestSchema,
          entityPageResultSchema,
          dependencies,
          (validatedInput) => dependencies.service.list(validatedInput),
        ),
    },
    {
      channel: entityChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateEntityInputSchema,
          entityDetailsSchema,
          dependencies,
          (validatedInput) => dependencies.service.update(validatedInput),
        ),
    },
    {
      channel: entityChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          entityLifecycleInputSchema,
          entityDetailsSchema,
          dependencies,
          (validatedInput) => dependencies.service.archive(validatedInput),
        ),
    },
    {
      channel: entityChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          entityLifecycleInputSchema,
          entityDetailsSchema,
          dependencies,
          (validatedInput) => dependencies.service.restore(validatedInput),
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
