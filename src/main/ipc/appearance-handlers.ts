import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  appearanceSettingSchema,
  updateAppearanceThemeInputSchema,
} from '../../core/contracts/appearance';
import { appearanceChannels } from '../../core/contracts/ipc-channels';
import { emptyInputSchema } from '../../core/contracts/phase-zero';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { AppearanceController } from '../appearance/appearance-controller';
import { executeIpcHandler } from './ipc-handler';

export interface AppearanceHandlerDependencies {
  controller: AppearanceController;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerAppearanceIpcHandlers(
  ipcMain: IpcMain,
  dependencies: AppearanceHandlerDependencies,
): () => void {
  const registrations: {
    channel: string;
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<unknown>>;
  }[] = [
    {
      channel: appearanceChannels.getTheme,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          emptyInputSchema,
          appearanceSettingSchema,
          dependencies,
          () => dependencies.controller.getTheme(),
        ),
    },
    {
      channel: appearanceChannels.setTheme,
      handler: (event, input) =>
        executeIpcHandler(
          event,
          input,
          updateAppearanceThemeInputSchema,
          appearanceSettingSchema,
          dependencies,
          (validatedInput) => dependencies.controller.setTheme(validatedInput),
        ),
    },
  ];

  for (const registration of registrations) {
    ipcMain.handle(registration.channel, registration.handler);
  }

  return () => {
    for (const registration of registrations) ipcMain.removeHandler(registration.channel);
  };
}
