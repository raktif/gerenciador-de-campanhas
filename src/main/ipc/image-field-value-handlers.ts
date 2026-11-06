import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  getImageFieldValueInputSchema,
  imageFieldValueDetailsSchema,
  imageFieldValueDisplaySchema,
  imageFieldValueListSchema,
  imageFieldValuePreviewSchema,
  listImageFieldValuesInputSchema,
  moveImageFieldValueInputSchema,
  removeImageFieldValueInputSchema,
  updateImageFieldValueInputSchema,
} from '../../core/contracts/image-field-values';
import { imageFieldValueChannels } from '../../core/contracts/ipc-channels';
import type { Logger } from '../../core/logging/logger';
import type { Result } from '../../core/contracts/result';
import type { ImageFieldValueService } from '../services/image-field-value-service';
import { executeIpcHandler } from './ipc-handler';

export function registerImageFieldValueIpcHandlers(
  ipcMain: IpcMain,
  dependencies: {
    service: ImageFieldValueService;
    logger: Logger;
    authorizedWebContentsId: number;
  },
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: imageFieldValueChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          listImageFieldValuesInputSchema,
          imageFieldValueListSchema,
          dependencies,
          (validated) => dependencies.service.list(validated),
        ),
    },
    {
      channel: imageFieldValueChannels.getPreview,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getImageFieldValueInputSchema,
          imageFieldValuePreviewSchema,
          dependencies,
          (validated) => dependencies.service.getPreview(validated),
        ),
    },
    {
      channel: imageFieldValueChannels.getDisplay,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getImageFieldValueInputSchema,
          imageFieldValueDisplaySchema,
          dependencies,
          (validated) => dependencies.service.getDisplay(validated),
        ),
    },
    {
      channel: imageFieldValueChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateImageFieldValueInputSchema,
          imageFieldValueDetailsSchema,
          dependencies,
          (validated) => dependencies.service.update(validated),
        ),
    },
    {
      channel: imageFieldValueChannels.remove,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          removeImageFieldValueInputSchema,
          imageFieldValueDetailsSchema,
          dependencies,
          (validated) => dependencies.service.remove(validated),
        ),
    },
    {
      channel: imageFieldValueChannels.move,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          moveImageFieldValueInputSchema,
          imageFieldValueListSchema,
          dependencies,
          (validated) => dependencies.service.move(validated),
        ),
    },
  ];
  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
