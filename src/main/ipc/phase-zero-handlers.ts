import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { phaseZeroChannels } from '../../core/contracts/ipc-channels';
import {
  applicationStatusSchema,
  emptyInputSchema,
  openDataDirectoryResultSchema,
  phaseZeroTestRecordSchema,
} from '../../core/contracts/phase-zero';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { PhaseZeroService } from '../services/phase-zero-service';
import { executeIpcHandler } from './ipc-handler';

export interface PhaseZeroHandlerDependencies {
  service: PhaseZeroService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerPhaseZeroIpcHandlers(
  ipcMain: IpcMain,
  dependencies: PhaseZeroHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: phaseZeroChannels.getStatus,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          emptyInputSchema,
          applicationStatusSchema,
          dependencies,
          () => dependencies.service.getStatus(),
        ),
    },
    {
      channel: phaseZeroChannels.writeTest,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          emptyInputSchema,
          phaseZeroTestRecordSchema,
          dependencies,
          () => dependencies.service.writeTest(),
        ),
    },
    {
      channel: phaseZeroChannels.readTest,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          emptyInputSchema,
          phaseZeroTestRecordSchema.nullable(),
          dependencies,
          () => dependencies.service.readTest(),
        ),
    },
    {
      channel: phaseZeroChannels.openDataDirectory,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          emptyInputSchema,
          openDataDirectoryResultSchema,
          dependencies,
          () => dependencies.service.openDataDirectory(),
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
