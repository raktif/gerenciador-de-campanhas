import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  entityReferenceImagePreviewSchema,
  entityReferenceImageDisplaySchema,
  entityReferenceImageSchema,
  getEntityReferenceImageInputSchema,
  removeEntityReferenceImageInputSchema,
  setEntityReferenceImageInputSchema,
} from '../../core/contracts/entity-reference-images';
import { imageImportChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { EntityReferenceImageService } from '../services/entity-reference-image-service';
import { executeIpcHandler } from './ipc-handler';

export function registerEntityReferenceImageIpcHandlers(
  ipcMain: IpcMain,
  dependencies: {
    service: EntityReferenceImageService;
    logger: Logger;
    authorizedWebContentsId: number;
  },
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: imageImportChannels.getEntityReference,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getEntityReferenceImageInputSchema,
          entityReferenceImageSchema,
          dependencies,
          (validated) => dependencies.service.get(validated),
        ),
    },
    {
      channel: imageImportChannels.getEntityReferencePreview,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getEntityReferenceImageInputSchema,
          entityReferenceImagePreviewSchema,
          dependencies,
          (validated) => dependencies.service.getPreview(validated),
        ),
    },
    {
      channel: imageImportChannels.getEntityReferenceDisplay,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getEntityReferenceImageInputSchema,
          entityReferenceImageDisplaySchema,
          dependencies,
          (validated) => dependencies.service.getDisplay(validated),
        ),
    },
    {
      channel: imageImportChannels.setEntityReference,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          setEntityReferenceImageInputSchema,
          entityReferenceImageSchema,
          dependencies,
          (validated) => dependencies.service.set(validated),
        ),
    },
    {
      channel: imageImportChannels.removeEntityReference,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          removeEntityReferenceImageInputSchema,
          entityReferenceImageSchema,
          dependencies,
          (validated) => dependencies.service.remove(validated),
        ),
    },
  ];
  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
