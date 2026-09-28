import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  sessionChannels,
  sessionIntentionChannels,
  sessionParticipantChannels,
} from '../../core/contracts/ipc-channels';
import {
  createSessionInputSchema,
  createSessionIntentionInputSchema,
  getSessionInputSchema,
  getSessionIntentionInputSchema,
  listSessionParticipantsInputSchema,
  replaceSessionParticipantsInputSchema,
  sessionIntentionPageRequestSchema,
  sessionIntentionPageResultSchema,
  sessionIntentionSchema,
  sessionPageRequestSchema,
  sessionPageResultSchema,
  sessionParticipantsSchema,
  sessionSchema,
  updateSessionInputSchema,
  updateSessionIntentionInputSchema,
  type CreateSessionInput,
  type GetSessionInput,
  type Session,
  type SessionPageRequest,
  type SessionPageResult,
  type UpdateSessionInput,
} from '../../core/contracts/sessions';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { SessionIntentionService } from '../services/session-intention-service';
import type { SessionParticipantService } from '../services/session-participant-service';
import { executeIpcHandler } from './ipc-handler';

export interface SessionHandlerDependencies {
  sessions: {
    create(input: CreateSessionInput): Session | Promise<Session>;
    get(input: GetSessionInput): Session | Promise<Session>;
    list(input: SessionPageRequest): SessionPageResult | Promise<SessionPageResult>;
    update(input: UpdateSessionInput): Session | Promise<Session>;
  };
  participants: SessionParticipantService;
  intentions: SessionIntentionService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerSessionIpcHandlers(
  ipcMain: IpcMain,
  dependencies: SessionHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: sessionChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createSessionInputSchema,
          sessionSchema,
          dependencies,
          (value) => dependencies.sessions.create(value),
        ),
    },
    {
      channel: sessionChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getSessionInputSchema,
          sessionSchema,
          dependencies,
          (value) => dependencies.sessions.get(value),
        ),
    },
    {
      channel: sessionChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          sessionPageRequestSchema,
          sessionPageResultSchema,
          dependencies,
          (value) => dependencies.sessions.list(value),
        ),
    },
    {
      channel: sessionChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateSessionInputSchema,
          sessionSchema,
          dependencies,
          (value) => dependencies.sessions.update(value),
        ),
    },
    {
      channel: sessionParticipantChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          listSessionParticipantsInputSchema,
          sessionParticipantsSchema,
          dependencies,
          (value) => dependencies.participants.list(value.campaignId, value.sessionId),
        ),
    },
    {
      channel: sessionParticipantChannels.replace,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          replaceSessionParticipantsInputSchema,
          sessionParticipantsSchema,
          dependencies,
          (value) => dependencies.participants.replace(value),
        ),
    },
    {
      channel: sessionIntentionChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createSessionIntentionInputSchema,
          sessionIntentionSchema,
          dependencies,
          (value) => dependencies.intentions.create(value),
        ),
    },
    {
      channel: sessionIntentionChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getSessionIntentionInputSchema,
          sessionIntentionSchema,
          dependencies,
          (value) => dependencies.intentions.get(value),
        ),
    },
    {
      channel: sessionIntentionChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          sessionIntentionPageRequestSchema,
          sessionIntentionPageResultSchema,
          dependencies,
          (value) => dependencies.intentions.list(value),
        ),
    },
    {
      channel: sessionIntentionChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateSessionIntentionInputSchema,
          sessionIntentionSchema,
          dependencies,
          (value) => dependencies.intentions.update(value),
        ),
    },
  ];
  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
