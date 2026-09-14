import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { captureInboxItemInputSchema, inboxItemSchema } from '../../core/contracts/inbox';
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
  ];

  for (const registration of registrations)
    ipcMain.handle(registration.channel, registration.handler);
  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
