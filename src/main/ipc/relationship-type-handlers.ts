import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  createRelationshipTypeInputSchema,
  getRelationshipTypeInputSchema,
  relationshipTypeLifecycleInputSchema,
  relationshipTypePageRequestSchema,
  relationshipTypePageResultSchema,
  relationshipTypeSchema,
  updateRelationshipTypeInputSchema,
} from '../../core/contracts/relationship-types';
import { relationshipTypeChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { RelationshipTypeService } from '../services/relationship-type-service';
import { executeIpcHandler } from './ipc-handler';

export function registerRelationshipTypeIpcHandlers(
  ipcMain: IpcMain,
  dependencies: {
    service: RelationshipTypeService;
    logger: Logger;
    authorizedWebContentsId: number;
  },
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: relationshipTypeChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createRelationshipTypeInputSchema,
          relationshipTypeSchema,
          dependencies,
          (validated) => dependencies.service.create(validated),
        ),
    },
    {
      channel: relationshipTypeChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getRelationshipTypeInputSchema,
          relationshipTypeSchema,
          dependencies,
          (validated) => dependencies.service.get(validated),
        ),
    },
    {
      channel: relationshipTypeChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          relationshipTypePageRequestSchema,
          relationshipTypePageResultSchema,
          dependencies,
          (validated) => dependencies.service.list(validated),
        ),
    },
    {
      channel: relationshipTypeChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateRelationshipTypeInputSchema,
          relationshipTypeSchema,
          dependencies,
          (validated) => dependencies.service.update(validated),
        ),
    },
    {
      channel: relationshipTypeChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          relationshipTypeLifecycleInputSchema,
          relationshipTypeSchema,
          dependencies,
          (validated) => dependencies.service.archive(validated),
        ),
    },
    {
      channel: relationshipTypeChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          relationshipTypeLifecycleInputSchema,
          relationshipTypeSchema,
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
