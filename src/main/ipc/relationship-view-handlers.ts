import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  applyRelationshipAutoLayoutInputSchema,
  getRelationshipViewInputSchema,
  relationshipViewStateSchema,
  resetRelationshipLayoutInputSchema,
  saveRelationshipNodePositionInputSchema,
  saveRelationshipViewportInputSchema,
} from '../../core/contracts/relationship-views';
import { relationshipViewChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { RelationshipViewService } from '../services/relationship-view-service';
import { executeIpcHandler } from './ipc-handler';

export function registerRelationshipViewIpcHandlers(
  ipcMain: IpcMain,
  dependencies: {
    service: RelationshipViewService;
    logger: Logger;
    authorizedWebContentsId: number;
  },
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: relationshipViewChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getRelationshipViewInputSchema,
          relationshipViewStateSchema,
          dependencies,
          (validated) => dependencies.service.get(validated),
        ),
    },
    {
      channel: relationshipViewChannels.saveNodePosition,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          saveRelationshipNodePositionInputSchema,
          relationshipViewStateSchema,
          dependencies,
          (validated) => dependencies.service.saveNodePosition(validated),
        ),
    },
    {
      channel: relationshipViewChannels.saveViewport,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          saveRelationshipViewportInputSchema,
          relationshipViewStateSchema,
          dependencies,
          (validated) => dependencies.service.saveViewport(validated),
        ),
    },
    {
      channel: relationshipViewChannels.autoLayout,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          applyRelationshipAutoLayoutInputSchema,
          relationshipViewStateSchema,
          dependencies,
          (validated) => dependencies.service.autoLayout(validated),
        ),
    },
    {
      channel: relationshipViewChannels.resetLayout,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          resetRelationshipLayoutInputSchema,
          relationshipViewStateSchema,
          dependencies,
          (validated) => dependencies.service.resetLayout(validated),
        ),
    },
  ];
  for (const { channel, handler } of registrations) ipcMain.handle(channel, handler);
  return () => registrations.forEach(({ channel }) => ipcMain.removeHandler(channel));
}
