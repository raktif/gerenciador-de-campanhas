import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  copyStartupDiagnosticInputSchema,
  copiedStartupDiagnosticSchema,
} from '../../core/contracts/diagnostics';
import { diagnosticsChannels } from '../../core/contracts/ipc-channels';
import type { Result } from '../../core/contracts/result';
import type { Logger } from '../../core/logging/logger';
import type { StartupDiagnosticsService } from '../services/startup-diagnostics-service';
import { executeIpcHandler } from './ipc-handler';

export interface DiagnosticsHandlerDependencies {
  service: StartupDiagnosticsService;
  logger: Logger;
  authorizedWebContentsId: number;
}

export function registerDiagnosticsIpcHandlers(
  ipcMain: IpcMain,
  dependencies: DiagnosticsHandlerDependencies,
): () => void {
  const handler = (event: IpcMainInvokeEvent, input: unknown): Promise<Result<unknown>> =>
    executeIpcHandler(
      event,
      input,
      copyStartupDiagnosticInputSchema,
      copiedStartupDiagnosticSchema,
      dependencies,
      (validatedInput) => dependencies.service.copyStartupDiagnostic(validatedInput),
    );

  ipcMain.handle(diagnosticsChannels.copyStartupDiagnostic, handler);
  return () => ipcMain.removeHandler(diagnosticsChannels.copyStartupDiagnostic);
}
