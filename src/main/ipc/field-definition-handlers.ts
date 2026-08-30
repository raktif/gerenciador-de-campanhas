import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  createFieldDefinitionInputSchema,
  fieldDefinitionLifecycleInputSchema,
  fieldDefinitionPageRequestSchema,
  fieldDefinitionPageResultSchema,
  fieldDefinitionSchema,
  getFieldDefinitionInputSchema,
  updateFieldDefinitionInputSchema,
} from '../../core/contracts/field-definitions';
import { fieldDefinitionChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { FieldDefinitionService } from '../services/field-definition-service';
import { executeIpcHandler } from './ipc-handler';

export interface FieldDefinitionHandlerDependencies {
  service: FieldDefinitionService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerFieldDefinitionIpcHandlers(
  ipcMain: IpcMain,
  dependencies: FieldDefinitionHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: fieldDefinitionChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createFieldDefinitionInputSchema,
          fieldDefinitionSchema,
          dependencies,
          (validated) => dependencies.service.create(validated),
        ),
    },
    {
      channel: fieldDefinitionChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getFieldDefinitionInputSchema,
          fieldDefinitionSchema,
          dependencies,
          (validated) => dependencies.service.get(validated),
        ),
    },
    {
      channel: fieldDefinitionChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          fieldDefinitionPageRequestSchema,
          fieldDefinitionPageResultSchema,
          dependencies,
          (validated) => dependencies.service.list(validated),
        ),
    },
    {
      channel: fieldDefinitionChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateFieldDefinitionInputSchema,
          fieldDefinitionSchema,
          dependencies,
          (validated) => dependencies.service.update(validated),
        ),
    },
    {
      channel: fieldDefinitionChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          fieldDefinitionLifecycleInputSchema,
          fieldDefinitionSchema,
          dependencies,
          (validated) => dependencies.service.archive(validated),
        ),
    },
    {
      channel: fieldDefinitionChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          fieldDefinitionLifecycleInputSchema,
          fieldDefinitionSchema,
          dependencies,
          (validated) => dependencies.service.restore(validated),
        ),
    },
  ];

  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
