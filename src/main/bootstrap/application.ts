import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import { readEnvironment, resolveDataRoot } from '../../core/config/environment';
import { FileLogger } from '../../core/logging/logger';
import { ensureDataDirectories, getDataDirectories } from '../../core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../db/connection';
import { CampaignRepository } from '../../db/repositories/campaign-repository';
import { EntityRepository } from '../../db/repositories/entity-repository';
import { EntityTypeRepository } from '../../db/repositories/entity-type-repository';
import { FieldDefinitionRepository } from '../../db/repositories/field-definition-repository';
import { PhaseZeroRepository } from '../../db/repositories/phase-zero-repository';
import { RelationshipTypeRepository } from '../../db/repositories/relationship-type-repository';
import { registerCampaignIpcHandlers } from '../ipc/campaign-handlers';
import { registerEntityIpcHandlers } from '../ipc/entity-handlers';
import { registerEntityTypeIpcHandlers } from '../ipc/entity-type-handlers';
import { registerFieldDefinitionIpcHandlers } from '../ipc/field-definition-handlers';
import { registerPhaseZeroIpcHandlers } from '../ipc/phase-zero-handlers';
import { registerRelationshipTypeIpcHandlers } from '../ipc/relationship-type-handlers';
import { CampaignService } from '../services/campaign-service';
import { EntityService } from '../services/entity-service';
import { EntityTypeService } from '../services/entity-type-service';
import { FieldDefinitionService } from '../services/field-definition-service';
import { PhaseZeroService } from '../services/phase-zero-service';
import { RelationshipTypeService } from '../services/relationship-type-service';
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
  const phaseZeroRepository = new PhaseZeroRepository(database.orm);
  const campaignRepository = new CampaignRepository(database.orm);
  const entityTypeRepository = new EntityTypeRepository(database.orm);
  const fieldDefinitionRepository = new FieldDefinitionRepository(database.orm);
  const entityRepository = new EntityRepository(database.orm);
  const relationshipTypeRepository = new RelationshipTypeRepository(database.orm);
  const window = createMainWindow();
  const service = new PhaseZeroService({
    applicationVersion: app.getVersion(),
    dataDirectory: dataRoot,
    database,
    repository: phaseZeroRepository,
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
  const campaignService = new CampaignService({ repository: campaignRepository });
  const unregisterCampaignIpc = registerCampaignIpcHandlers(ipcMain, {
    service: campaignService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const entityTypeService = new EntityTypeService({
    repository: entityTypeRepository,
    campaigns: campaignRepository,
  });
  const unregisterEntityTypeIpc = registerEntityTypeIpcHandlers(ipcMain, {
    service: entityTypeService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const fieldDefinitionService = new FieldDefinitionService({
    repository: fieldDefinitionRepository,
    entityTypes: entityTypeRepository,
  });
  const unregisterFieldDefinitionIpc = registerFieldDefinitionIpcHandlers(ipcMain, {
    service: fieldDefinitionService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const entityService = new EntityService({
    repository: entityRepository,
    entityTypes: entityTypeRepository,
    fieldDefinitions: fieldDefinitionRepository,
  });
  const unregisterEntityIpc = registerEntityIpcHandlers(ipcMain, {
    service: entityService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const relationshipTypeService = new RelationshipTypeService({
    repository: relationshipTypeRepository,
    campaigns: campaignRepository,
    entityTypes: entityTypeRepository,
  });
  const unregisterRelationshipTypeIpc = registerRelationshipTypeIpcHandlers(ipcMain, {
    service: relationshipTypeService,
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
      unregisterCampaignIpc();
      unregisterEntityTypeIpc();
      unregisterFieldDefinitionIpc();
      unregisterEntityIpc();
      unregisterRelationshipTypeIpc();
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
