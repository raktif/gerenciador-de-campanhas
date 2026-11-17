import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  createStoryThreadInputSchema,
  getStoryThreadInputSchema,
  setStoryThreadStatusInputSchema,
  storyThreadDetailsSchema,
  storyThreadLifecycleInputSchema,
  storyThreadPageRequestSchema,
  storyThreadPageResultSchema,
  storyThreadTargetRequestSchema,
  storyThreadTargetsResultSchema,
  updateStoryThreadInputSchema,
} from '../../core/contracts/story-threads';
import { storyThreadChannels } from '../../core/contracts/ipc-channels';
import type { Logger } from '../../core/logging/logger';
import type { StoryThreadService } from '../services/story-thread-service';
import { executeIpcHandler } from './ipc-handler';
import type { z } from 'zod';

export interface StoryThreadHandlerDependencies {
  service: StoryThreadService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerStoryThreadIpcHandlers(
  ipcMain: IpcMain,
  dependencies: StoryThreadHandlerDependencies,
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
  register(
    storyThreadChannels.create,
    createStoryThreadInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.create(value),
  );
  register(storyThreadChannels.get, getStoryThreadInputSchema, storyThreadDetailsSchema, (value) =>
    dependencies.service.get(value),
  );
  register(
    storyThreadChannels.list,
    storyThreadPageRequestSchema,
    storyThreadPageResultSchema,
    (value) => dependencies.service.list(value),
  );
  register(
    storyThreadChannels.listTargets,
    storyThreadTargetRequestSchema,
    storyThreadTargetsResultSchema,
    (value) => dependencies.service.listTargets(value),
  );
  register(
    storyThreadChannels.update,
    updateStoryThreadInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.update(value),
  );
  register(
    storyThreadChannels.setStatus,
    setStoryThreadStatusInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.setStatus(value),
  );
  register(
    storyThreadChannels.resolve,
    storyThreadLifecycleInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.resolve(value),
  );
  register(
    storyThreadChannels.abandon,
    storyThreadLifecycleInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.abandon(value),
  );
  register(
    storyThreadChannels.reopen,
    storyThreadLifecycleInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.reopen(value),
  );
  register(
    storyThreadChannels.archive,
    storyThreadLifecycleInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.archive(value),
  );
  register(
    storyThreadChannels.restore,
    storyThreadLifecycleInputSchema,
    storyThreadDetailsSchema,
    (value) => dependencies.service.restore(value),
  );
  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}
