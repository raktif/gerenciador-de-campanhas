import { randomUUID } from 'node:crypto';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { phaseZeroChannels } from '../../core/contracts/ipc-channels';
import {
  applicationStatusSchema,
  emptyInputSchema,
  openDataDirectoryResultSchema,
  phaseZeroTestRecordSchema,
} from '../../core/contracts/phase-zero';
import { failure, success, type Result } from '../../core/contracts/result';
import { AppError, toSafeError } from '../../core/errors/app-error';
import type { Logger } from '../../core/logging/logger';
import type { PhaseZeroService } from '../services/phase-zero-service';

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
        executeHandler(event, input, dependencies, () =>
          applicationStatusSchema.parse(dependencies.service.getStatus()),
        ),
    },
    {
      channel: phaseZeroChannels.writeTest,
      handler: (event, input) =>
        executeHandler(event, input, dependencies, () =>
          phaseZeroTestRecordSchema.parse(dependencies.service.writeTest()),
        ),
    },
    {
      channel: phaseZeroChannels.readTest,
      handler: (event, input) =>
        executeHandler(event, input, dependencies, () =>
          phaseZeroTestRecordSchema.nullable().parse(dependencies.service.readTest()),
        ),
    },
    {
      channel: phaseZeroChannels.openDataDirectory,
      handler: (event, input) =>
        executeHandler(event, input, dependencies, async () =>
          openDataDirectoryResultSchema.parse(await dependencies.service.openDataDirectory()),
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

async function executeHandler<T>(
  event: IpcMainInvokeEvent,
  input: unknown,
  dependencies: PhaseZeroHandlerDependencies,
  operation: () => T | Promise<T>,
): Promise<Result<T>> {
  const requestId = randomUUID();

  try {
    assertAuthorizedSender(event, dependencies.authorizedWebContentsId);
    emptyInputSchema.parse(input ?? {});
    return success(await operation(), requestId);
  } catch (error) {
    await dependencies.logger.error('Falha em operação IPC.', {
      requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return failure(toSafeError(error), requestId);
  }
}

function assertAuthorizedSender(event: IpcMainInvokeEvent, authorizedWebContentsId: number): void {
  if (
    event.sender.id !== authorizedWebContentsId ||
    event.senderFrame === null ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new AppError('IPC_SENDER_NOT_ALLOWED', 'A origem da operação não é autorizada.');
  }
}
