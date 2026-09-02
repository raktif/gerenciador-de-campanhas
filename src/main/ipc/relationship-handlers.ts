import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { relationshipChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import {
  createRelationshipInputSchema,
  getRelationshipInputSchema,
  relationshipLifecycleInputSchema,
  relationshipMutationResultSchema,
  relationshipPageRequestSchema,
  relationshipPageResultSchema,
  relationshipSchema,
  updateRelationshipInputSchema,
} from '../../core/contracts/relationships';
import type { Logger } from '../../core/logging/logger';
import type { RelationshipService } from '../services/relationship-service';
import { executeIpcHandler } from './ipc-handler';

export function registerRelationshipIpcHandlers(
  ipcMain: IpcMain,
  dependencies: { service: RelationshipService; logger: Logger; authorizedWebContentsId: number },
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: relationshipChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createRelationshipInputSchema,
          relationshipMutationResultSchema,
          dependencies,
          (value) => dependencies.service.create(value),
        ),
    },
    {
      channel: relationshipChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getRelationshipInputSchema,
          relationshipSchema,
          dependencies,
          (value) => dependencies.service.get(value),
        ),
    },
    {
      channel: relationshipChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          relationshipPageRequestSchema,
          relationshipPageResultSchema,
          dependencies,
          (value) => dependencies.service.list(value),
        ),
    },
    {
      channel: relationshipChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateRelationshipInputSchema,
          relationshipMutationResultSchema,
          dependencies,
          (value) => dependencies.service.update(value),
        ),
    },
    {
      channel: relationshipChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          relationshipLifecycleInputSchema,
          relationshipSchema,
          dependencies,
          (value) => dependencies.service.archive(value),
        ),
    },
    {
      channel: relationshipChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          relationshipLifecycleInputSchema,
          relationshipSchema,
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
