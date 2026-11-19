import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import { sessionClosingChannels } from '../../core/contracts/ipc-channels';
import {
  getSessionClosingInputSchema,
  getSessionPreparationInputSchema,
  quickCloseSessionInputSchema,
  selectSessionPreparationItemInputSchema,
  sessionPreparationSchema,
  sessionClosingWorkflowSchema,
  updateSessionClosingStepInputSchema,
} from '../../core/contracts/session-closing';
import type { Logger } from '../../core/logging/logger';
import type { SessionClosingService } from '../services/session-closing-service';
import { executeIpcHandler } from './ipc-handler';
export interface SessionClosingHandlerDependencies {
  service: SessionClosingService;
  logger: Logger;
  authorizedWebContentsId: number;
}
export function registerSessionClosingIpcHandlers(
  ipcMain: IpcMain,
  dependencies: SessionClosingHandlerDependencies,
): () => void {
  const channels: string[] = [];
  const register = <I, O>(
    channel: string,
    input: z.ZodType<I>,
    output: z.ZodType<O>,
    operation: (value: I) => O,
  ): void => {
    channels.push(channel);
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, value: unknown) =>
      executeIpcHandler(event, value, input, output, dependencies, operation),
    );
  };
  register(
    sessionClosingChannels.get,
    getSessionClosingInputSchema,
    sessionClosingWorkflowSchema,
    (value) => dependencies.service.get(value),
  );
  register(
    sessionClosingChannels.updateStep,
    updateSessionClosingStepInputSchema,
    sessionClosingWorkflowSchema,
    (value) => dependencies.service.updateStep(value),
  );
  register(
    sessionClosingChannels.quickClose,
    quickCloseSessionInputSchema,
    sessionClosingWorkflowSchema,
    (value) => dependencies.service.quickClose(value),
  );
  register(
    sessionClosingChannels.getPreparation,
    getSessionPreparationInputSchema,
    sessionPreparationSchema,
    (value) => dependencies.service.getPreparation(value),
  );
  register(
    sessionClosingChannels.selectPreparationItem,
    selectSessionPreparationItemInputSchema,
    sessionPreparationSchema,
    (value) => dependencies.service.selectPreparationItem(value),
  );
  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}
