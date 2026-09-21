import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  captureInboxItemInputSchema,
  convertInboxItemToAssertionInputSchema,
  convertInboxItemToEventInputSchema,
  convertInboxItemToNoteInputSchema,
  convertInboxItemToEntityInputSchema,
  convertInboxItemToRelationshipInputSchema,
  inboxEntityConversionResultSchema,
  inboxAssertionConversionResultSchema,
  inboxEventConversionResultSchema,
  inboxNoteConversionResultSchema,
  inboxRelationshipConversionResultSchema,
  getInboxItemInputSchema,
  inboxItemSchema,
  inboxLifecycleInputSchema,
  inboxPageRequestSchema,
  inboxPageResultSchema,
} from '../../core/contracts/inbox';
import { inboxChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { InboxService } from '../services/inbox-service';
import { executeIpcHandler } from './ipc-handler';

export interface InboxHandlerDependencies {
  service: InboxService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerInboxIpcHandlers(
  ipcMain: IpcMain,
  dependencies: InboxHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: inboxChannels.capture,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          captureInboxItemInputSchema,
          inboxItemSchema,
          dependencies,
          (value) => dependencies.service.capture(value),
        ),
    },
    {
      channel: inboxChannels.convertToEntity,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          convertInboxItemToEntityInputSchema,
          inboxEntityConversionResultSchema,
          dependencies,
          (value) => dependencies.service.convertToEntity(value),
        ),
    },
    {
      channel: inboxChannels.convertToAssertion,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          convertInboxItemToAssertionInputSchema,
          inboxAssertionConversionResultSchema,
          dependencies,
          (value) => dependencies.service.convertToAssertion(value),
        ),
    },
    {
      channel: inboxChannels.convertToNote,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          convertInboxItemToNoteInputSchema,
          inboxNoteConversionResultSchema,
          dependencies,
          (value) => dependencies.service.convertToNote(value),
        ),
    },
    {
      channel: inboxChannels.convertToEvent,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          convertInboxItemToEventInputSchema,
          inboxEventConversionResultSchema,
          dependencies,
          (value) => dependencies.service.convertToEvent(value),
        ),
    },
    {
      channel: inboxChannels.convertToRelationship,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          convertInboxItemToRelationshipInputSchema,
          inboxRelationshipConversionResultSchema,
          dependencies,
          (value) => dependencies.service.convertToRelationship(value),
        ),
    },
    {
      channel: inboxChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getInboxItemInputSchema,
          inboxItemSchema,
          dependencies,
          (value) => dependencies.service.get(value),
        ),
    },
    {
      channel: inboxChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          inboxPageRequestSchema,
          inboxPageResultSchema,
          dependencies,
          (value) => dependencies.service.list(value),
        ),
    },
    {
      channel: inboxChannels.beginReview,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          inboxLifecycleInputSchema,
          inboxItemSchema,
          dependencies,
          (value) => dependencies.service.beginReview(value),
        ),
    },
    {
      channel: inboxChannels.dismiss,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          inboxLifecycleInputSchema,
          inboxItemSchema,
          dependencies,
          (value) => dependencies.service.dismiss(value),
        ),
    },
    {
      channel: inboxChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          inboxLifecycleInputSchema,
          inboxItemSchema,
          dependencies,
          (value) => dependencies.service.archive(value),
        ),
    },
    {
      channel: inboxChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          inboxLifecycleInputSchema,
          inboxItemSchema,
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
