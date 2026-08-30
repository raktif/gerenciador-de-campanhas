import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  createEntityTypeInputSchema,
  entityTypeLifecycleInputSchema,
  entityTypePageRequestSchema,
  entityTypePageResultSchema,
  entityTypeSchema,
  getEntityTypeInputSchema,
  updateEntityTypeInputSchema,
} from '../../core/contracts/entity-types';
import { entityTypeChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { EntityTypeService } from '../services/entity-type-service';
import { executeIpcHandler } from './ipc-handler';

export interface EntityTypeHandlerDependencies {
  service: EntityTypeService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerEntityTypeIpcHandlers(
  ipcMain: IpcMain,
  dependencies: EntityTypeHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: entityTypeChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createEntityTypeInputSchema,
          entityTypeSchema,
          dependencies,
          (validatedInput) => dependencies.service.create(validatedInput),
        ),
    },
    {
      channel: entityTypeChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getEntityTypeInputSchema,
          entityTypeSchema,
          dependencies,
          (validatedInput) => dependencies.service.get(validatedInput),
        ),
    },
    {
      channel: entityTypeChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          entityTypePageRequestSchema,
          entityTypePageResultSchema,
          dependencies,
          (validatedInput) => dependencies.service.list(validatedInput),
        ),
    },
    {
      channel: entityTypeChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateEntityTypeInputSchema,
          entityTypeSchema,
          dependencies,
          (validatedInput) => dependencies.service.update(validatedInput),
        ),
    },
    {
      channel: entityTypeChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          entityTypeLifecycleInputSchema,
          entityTypeSchema,
          dependencies,
          (validatedInput) => dependencies.service.archive(validatedInput),
        ),
    },
    {
      channel: entityTypeChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          entityTypeLifecycleInputSchema,
          entityTypeSchema,
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
