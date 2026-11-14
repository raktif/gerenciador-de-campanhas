import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  assertionLifecycleInputSchema,
  assertionPageRequestSchema,
  assertionPageResultSchema,
  assertionRegistryPageResultSchema,
  assertionSchema,
  createAssertionInputSchema,
  getAssertionInputSchema,
  promoteAssertionPossibilityInputSchema,
  updateAssertionInputSchema,
  type AssertionPageRequest,
} from '../../core/contracts/assertions';
import { assertionChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { AssertionService } from '../services/assertion-service';
import { executeIpcHandler } from './ipc-handler';

export interface AssertionRegistryTestHooks {
  beforeList(input: AssertionPageRequest): Promise<void>;
  afterList(input: AssertionPageRequest): Promise<void>;
  beforePromotion(): Promise<void>;
  afterPromotion(): Promise<void>;
}

export interface AssertionHandlerDependencies {
  service: AssertionService;
  logger: Logger;
  authorizedWebContentsId: number;
  testHooks?: AssertionRegistryTestHooks;
}

export function registerAssertionIpcHandlers(
  ipcMain: IpcMain,
  dependencies: AssertionHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: assertionChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createAssertionInputSchema,
          assertionSchema,
          dependencies,
          (value) => dependencies.service.create(value),
        ),
    },
    {
      channel: assertionChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getAssertionInputSchema,
          assertionSchema,
          dependencies,
          (value) => dependencies.service.get(value),
        ),
    },
    {
      channel: assertionChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          assertionPageRequestSchema,
          assertionPageResultSchema,
          dependencies,
          (value) => dependencies.service.list(value),
        ),
    },
    {
      channel: assertionChannels.listRegistry,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          assertionPageRequestSchema,
          assertionRegistryPageResultSchema,
          dependencies,
          async (value) => {
            const testHooks = dependencies.testHooks;
            if (testHooks !== undefined) await testHooks.beforeList(value);
            const result = dependencies.service.listRegistry(value);
            if (testHooks !== undefined) await testHooks.afterList(value);
            return result;
          },
        ),
    },
    {
      channel: assertionChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateAssertionInputSchema,
          assertionSchema,
          dependencies,
          (value) => dependencies.service.update(value),
        ),
    },
    {
      channel: assertionChannels.promotePossibilityToFact,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          promoteAssertionPossibilityInputSchema,
          assertionSchema,
          dependencies,
          async (value) => {
            const testHooks = dependencies.testHooks;
            if (testHooks !== undefined) await testHooks.beforePromotion();
            const result = dependencies.service.promotePossibilityToFact(value);
            if (testHooks !== undefined) await testHooks.afterPromotion();
            return result;
          },
        ),
    },
    {
      channel: assertionChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          assertionLifecycleInputSchema,
          assertionSchema,
          dependencies,
          (value) => dependencies.service.archive(value),
        ),
    },
    {
      channel: assertionChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          assertionLifecycleInputSchema,
          assertionSchema,
          dependencies,
          (value) => dependencies.service.restore(value),
        ),
    },
  ];

  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
