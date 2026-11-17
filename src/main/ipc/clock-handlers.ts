import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  clockPageRequestSchema,
  clockPageResultSchema,
  clockSchema,
  completeClockInputSchema,
  createClockInputSchema,
  getClockInputSchema,
  updateClockInputSchema,
} from '../../core/contracts/clocks';
import { clockChannels } from '../../core/contracts/ipc-channels';
import type { Logger } from '../../core/logging/logger';
import type { ClockService } from '../services/clock-service';
import { executeIpcHandler } from './ipc-handler';
import type { z } from 'zod';

export interface ClockHandlerDependencies {
  service: ClockService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerClockIpcHandlers(
  ipcMain: IpcMain,
  dependencies: ClockHandlerDependencies,
): () => void {
  const channels: string[] = [];
  const register = <TInput, TOutput>(
    channel: string,
    inputSchema: z.ZodType<TInput>,
    outputSchema: z.ZodType<TOutput>,
    operation: (value: TInput) => TOutput,
  ): void => {
    channels.push(channel);
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, input: unknown) =>
      executeIpcHandler(event, input, inputSchema, outputSchema, dependencies, operation),
    );
  };
  register(clockChannels.create, createClockInputSchema, clockSchema, (value) =>
    dependencies.service.create(value),
  );
  register(clockChannels.get, getClockInputSchema, clockSchema, (value) =>
    dependencies.service.get(value),
  );
  register(clockChannels.list, clockPageRequestSchema, clockPageResultSchema, (value) =>
    dependencies.service.list(value),
  );
  register(clockChannels.update, updateClockInputSchema, clockSchema, (value) =>
    dependencies.service.update(value),
  );
  register(clockChannels.complete, completeClockInputSchema, clockSchema, (value) =>
    dependencies.service.complete(value),
  );
  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}
