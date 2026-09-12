import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { noteChannels } from '../../core/contracts/ipc-channels';
import {
  createNoteInputSchema,
  getNoteInputSchema,
  noteDetailsSchema,
  noteLifecycleInputSchema,
  notePageRequestSchema,
  notePageResultSchema,
  updateNoteInputSchema,
} from '../../core/contracts/notes';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { NoteService } from '../services/note-service';
import { executeIpcHandler } from './ipc-handler';

export interface NoteHandlerDependencies {
  service: NoteService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerNoteIpcHandlers(
  ipcMain: IpcMain,
  dependencies: NoteHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: noteChannels.create,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          createNoteInputSchema,
          noteDetailsSchema,
          dependencies,
          (value) => dependencies.service.create(value),
        ),
    },
    {
      channel: noteChannels.get,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          getNoteInputSchema,
          noteDetailsSchema,
          dependencies,
          (value) => dependencies.service.get(value),
        ),
    },
    {
      channel: noteChannels.list,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          notePageRequestSchema,
          notePageResultSchema,
          dependencies,
          (value) => dependencies.service.list(value),
        ),
    },
    {
      channel: noteChannels.update,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateNoteInputSchema,
          noteDetailsSchema,
          dependencies,
          (value) => dependencies.service.update(value),
        ),
    },
    {
      channel: noteChannels.archive,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          noteLifecycleInputSchema,
          noteDetailsSchema,
          dependencies,
          (value) => dependencies.service.archive(value),
        ),
    },
    {
      channel: noteChannels.restore,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          noteLifecycleInputSchema,
          noteDetailsSchema,
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
