import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  imageImportResultSchema,
  importImageBytesInputSchema,
  importImageUrlInputSchema,
  selectLocalImageInputSchema,
} from '../../core/contracts/image-imports';
import { imageImportChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { ImageImportService } from '../services/image-import-service';
import { executeIpcHandler } from './ipc-handler';

export interface ImageImportHandlerDependencies {
  service: ImageImportService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerImageImportIpcHandlers(
  ipcMain: IpcMain,
  dependencies: ImageImportHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: imageImportChannels.selectLocal,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          selectLocalImageInputSchema,
          imageImportResultSchema,
          dependencies,
          (validatedInput) => dependencies.service.selectLocal(validatedInput),
        ),
    },
    {
      channel: imageImportChannels.importBytes,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          importImageBytesInputSchema,
          imageImportResultSchema,
          dependencies,
          (validatedInput) => dependencies.service.importBytes(validatedInput),
        ),
    },
    {
      channel: imageImportChannels.importUrl,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          importImageUrlInputSchema,
          imageImportResultSchema,
          dependencies,
          (validatedInput) => dependencies.service.importUrl(validatedInput),
        ),
    },
  ];

  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
