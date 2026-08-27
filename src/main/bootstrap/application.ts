import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import { readEnvironment, resolveDataRoot } from '../../core/config/environment';
import { FileLogger } from '../../core/logging/logger';
import { ensureDataDirectories, getDataDirectories } from '../../core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../db/connection';
import { PhaseZeroRepository } from '../../db/repositories/phase-zero-repository';
import { registerPhaseZeroIpcHandlers } from '../ipc/phase-zero-handlers';
import { PhaseZeroService } from '../services/phase-zero-service';
import { createMainWindow } from '../windows/main-window';

export interface RunningApplication {
  window: BrowserWindow;
  database: DatabaseContext;
  dispose(): void;
}

export async function bootstrapApplication(): Promise<RunningApplication> {
  const environment = readEnvironment();
  const dataRoot = resolveDataRoot(app.getPath('userData'), environment);
  const directories = getDataDirectories(dataRoot);
  await ensureDataDirectories(directories);
  const logger = new FileLogger(directories.logs, environment.LOG_LEVEL);
  let database: DatabaseContext;
  try {
    database = await openApplicationDatabase(directories, logger);
  } catch (error) {
    await logger.error('Falha ao inicializar o banco de dados.', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
  const repository = new PhaseZeroRepository(database.orm);
  const window = createMainWindow();
  const service = new PhaseZeroService({
    applicationVersion: app.getVersion(),
    dataDirectory: dataRoot,
    database,
    repository,
    openDataDirectory: async () => {
      const errorMessage = await shell.openPath(dataRoot);
      if (errorMessage !== '') throw new Error(errorMessage);
    },
  });
  const unregisterIpc = registerPhaseZeroIpcHandlers(ipcMain, {
    service,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });

  await logger.info('Aplicação inicializada.', { applicationVersion: app.getVersion() });
  let disposed = false;

  return {
    window,
    database,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unregisterIpc();
      database.close();
    },
  };
}

export function showBootstrapError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  dialog.showErrorBox(
    'Não foi possível iniciar o Gerenciador de Campanhas de RPG',
    `${message}\n\nNenhum dado foi removido. Consulte a pasta de logs para diagnóstico.`,
  );
}
