import {
  app,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type BrowserWindow,
} from 'electron';
import type { CampaignPageRequest, CampaignPageResult } from '../../core/contracts/campaigns';
import { appearanceSettingSchema } from '../../core/contracts/appearance';
import { appearanceChannels } from '../../core/contracts/ipc-channels';
import { AppError } from '../../core/errors/app-error';
import { readEnvironment, resolveDataRoot } from '../../core/config/environment';
import { FileLogger } from '../../core/logging/logger';
import { ensureDataDirectories, getDataDirectories } from '../../core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../db/connection';
import { AssertionRepository } from '../../db/repositories/assertion-repository';
import { AppearanceRepository } from '../../db/repositories/appearance-repository';
import { CampaignRepository } from '../../db/repositories/campaign-repository';
import { AttachmentRepository } from '../../db/repositories/attachment-repository';
import { EntityRepository } from '../../db/repositories/entity-repository';
import { EventRepository } from '../../db/repositories/event-repository';
import { EntityTypeRepository } from '../../db/repositories/entity-type-repository';
import { FieldDefinitionRepository } from '../../db/repositories/field-definition-repository';
import { PhaseZeroRepository } from '../../db/repositories/phase-zero-repository';
import { NoteRepository } from '../../db/repositories/note-repository';
import { InboxRepository } from '../../db/repositories/inbox-repository';
import { RelationshipTypeRepository } from '../../db/repositories/relationship-type-repository';
import { RelationshipRepository } from '../../db/repositories/relationship-repository';
import { TimelineRepository } from '../../db/repositories/timeline-repository';
import { SessionIntentionRepository } from '../../db/repositories/session-intention-repository';
import { SessionRepository } from '../../db/repositories/session-repository';
import { registerCampaignIpcHandlers } from '../ipc/campaign-handlers';
import { registerCampaignCoverIpcHandlers } from '../ipc/campaign-cover-handlers';
import { registerImageImportIpcHandlers } from '../ipc/image-import-handlers';
import { registerEntityReferenceImageIpcHandlers } from '../ipc/entity-reference-image-handlers';
import { registerAppearanceIpcHandlers } from '../ipc/appearance-handlers';
import { registerDiagnosticsIpcHandlers } from '../ipc/diagnostics-handlers';
import { registerAssertionIpcHandlers } from '../ipc/assertion-handlers';
import { registerEntityIpcHandlers } from '../ipc/entity-handlers';
import { registerEntityTypeIpcHandlers } from '../ipc/entity-type-handlers';
import { registerEventIpcHandlers } from '../ipc/event-handlers';
import { registerFieldDefinitionIpcHandlers } from '../ipc/field-definition-handlers';
import { registerPhaseZeroIpcHandlers } from '../ipc/phase-zero-handlers';
import { registerNoteIpcHandlers } from '../ipc/note-handlers';
import { registerInboxIpcHandlers } from '../ipc/inbox-handlers';
import { registerRelationshipTypeIpcHandlers } from '../ipc/relationship-type-handlers';
import { registerRelationshipIpcHandlers } from '../ipc/relationship-handlers';
import {
  registerSessionIpcHandlers,
  type SessionHandlerDependencies,
} from '../ipc/session-handlers';
import { registerTimelineIpcHandlers } from '../ipc/timeline-handlers';
import { CampaignService } from '../services/campaign-service';
import { CampaignCoverService } from '../services/campaign-cover-service';
import { recoverPendingAttachmentDeletions } from '../services/attachment-deletion-journal';
import { ImageImportService } from '../services/image-import-service';
import { EntityReferenceImageService } from '../services/entity-reference-image-service';
import { ImageProcessingService } from '../services/image-processing-service';
import { SecureImageDownloadService } from '../services/secure-image-download-service';
import { AppearanceService } from '../services/appearance-service';
import { StartupDiagnosticsService } from '../services/startup-diagnostics-service';
import { AssertionService } from '../services/assertion-service';
import { EntityService } from '../services/entity-service';
import { EntityTypeService } from '../services/entity-type-service';
import { EventService } from '../services/event-service';
import { FieldDefinitionService } from '../services/field-definition-service';
import { PhaseZeroService } from '../services/phase-zero-service';
import { NoteService } from '../services/note-service';
import { InboxService } from '../services/inbox-service';
import { RelationshipTypeService } from '../services/relationship-type-service';
import { RelationshipService } from '../services/relationship-service';
import { SessionIntentionService } from '../services/session-intention-service';
import { SessionParticipantService } from '../services/session-participant-service';
import { SessionService } from '../services/session-service';
import { TimelineService } from '../services/timeline-service';
import {
  AppearanceController,
  createWindowWithInitialTheme,
} from '../appearance/appearance-controller';
import { showAppearanceChangeFailure } from '../appearance/appearance-failure-dialog';
import { installApplicationMenu, type AppearanceMenuPort } from '../appearance/application-menu';
import { createMainWindow, loadMainWindow } from '../windows/main-window';

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
  const appearanceRepository = new AppearanceRepository(database.orm);
  const phaseZeroRepository = new PhaseZeroRepository(database.orm);
  const campaignRepository = new CampaignRepository(database.orm);
  const attachmentRepository = new AttachmentRepository(database.native);
  try {
    const recovery = await recoverPendingAttachmentDeletions(attachmentRepository, directories);
    if (recovery.restored > 0 || recovery.purged > 0) {
      await logger.info('Exclusões de anexos interrompidas foram reconciliadas.', {
        restored: recovery.restored,
        purged: recovery.purged,
      });
    }
  } catch (error) {
    await logger.error('Falha ao reconciliar exclusões de anexos interrompidas.', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    database.close();
    throw error;
  }
  const entityTypeRepository = new EntityTypeRepository(database.orm);
  const fieldDefinitionRepository = new FieldDefinitionRepository(database.orm);
  const entityRepository = new EntityRepository(database.orm);
  const relationshipTypeRepository = new RelationshipTypeRepository(database.orm);
  const relationshipRepository = new RelationshipRepository(database.orm);
  const eventRepository = new EventRepository(database.orm);
  const timelineRepository = new TimelineRepository(database.orm);
  const assertionRepository = new AssertionRepository(database.orm);
  const noteRepository = new NoteRepository(database.orm);
  const inboxRepository = new InboxRepository(database.orm);
  const sessionRepository = new SessionRepository(database.orm);
  const sessionIntentionRepository = new SessionIntentionRepository(database.orm);
  const appearanceService = new AppearanceService({ repository: appearanceRepository });
  const initialAppearance = appearanceService.get();
  const window = createWindowWithInitialTheme(
    initialAppearance.theme,
    nativeTheme,
    createMainWindow,
  );
  let appearanceMenu: AppearanceMenuPort | null = null;
  const appearanceController = new AppearanceController(appearanceService, {
    notifyThemeChanged: (setting) =>
      window.webContents.send(
        appearanceChannels.themeChanged,
        appearanceSettingSchema.parse(setting),
      ),
    setMenuTheme: (theme) => appearanceMenu?.setTheme(theme),
    setNativeTheme: (theme) => {
      nativeTheme.themeSource = theme;
    },
    setWindowBackground: (color) => window.setBackgroundColor(color),
  });
  appearanceMenu = installApplicationMenu(Menu, {
    applicationName: app.name,
    platform: process.platform,
    onThemeSelected: (theme) => {
      try {
        appearanceController.setThemeFromMenu(theme);
      } catch (error) {
        void showAppearanceChangeFailure(dialog, window).catch(() => undefined);
        void logger
          .error('Falha ao alterar o tema pelo menu nativo.', {
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          })
          .catch(() => undefined);
      }
    },
  });
  appearanceController.initialize(initialAppearance);
  const unregisterAppearanceIpc = registerAppearanceIpcHandlers(ipcMain, {
    controller: appearanceController,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
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
  const campaignService = createCampaignService(campaignRepository);
  const unregisterCampaignIpc = registerCampaignIpcHandlers(ipcMain, {
    service: campaignService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const imageImportService = new ImageImportService({
    repository: attachmentRepository,
    processor: new ImageProcessingService(),
    downloader: new SecureImageDownloadService(),
    directories,
    selectImageFile: async () => {
      const selection = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      return selection.canceled ? null : (selection.filePaths[0] ?? null);
    },
  });
  const unregisterImageImportIpc = registerImageImportIpcHandlers(ipcMain, {
    service: imageImportService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const campaignCoverService = new CampaignCoverService({
    repository: attachmentRepository,
    directories,
  });
  const unregisterCampaignCoverIpc = registerCampaignCoverIpcHandlers(ipcMain, {
    service: campaignCoverService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const entityReferenceImageService = new EntityReferenceImageService({
    repository: attachmentRepository,
    directories,
  });
  const unregisterEntityReferenceImageIpc = registerEntityReferenceImageIpcHandlers(ipcMain, {
    service: entityReferenceImageService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const startupDiagnosticsService = new StartupDiagnosticsService((text) =>
    clipboard.writeText(text),
  );
  const unregisterDiagnosticsIpc = registerDiagnosticsIpcHandlers(ipcMain, {
    service: startupDiagnosticsService,
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
    relationshipTypes: relationshipTypeRepository,
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
    relationshipTypes: relationshipTypeRepository,
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
  const relationshipService = new RelationshipService({
    repository: relationshipRepository,
    relationshipTypes: relationshipTypeRepository,
    entities: entityRepository,
    events: eventRepository,
  });
  const unregisterRelationshipIpc = registerRelationshipIpcHandlers(ipcMain, {
    service: relationshipService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const assertionService = new AssertionService({
    repository: assertionRepository,
    campaigns: campaignRepository,
    entities: entityRepository,
    sessions: sessionRepository,
  });
  const unregisterAssertionIpc = registerAssertionIpcHandlers(ipcMain, {
    service: assertionService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const noteService = new NoteService({
    repository: noteRepository,
    campaigns: campaignRepository,
    entities: entityRepository,
    sessions: sessionRepository,
  });
  const unregisterNoteIpc = registerNoteIpcHandlers(ipcMain, {
    service: noteService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const inboxService = new InboxService({
    repository: inboxRepository,
    campaigns: campaignRepository,
    sessions: sessionRepository,
    entityTypes: entityTypeRepository,
    entities: entityRepository,
    relationships: relationshipService,
  });
  const unregisterInboxIpc = registerInboxIpcHandlers(ipcMain, {
    service: inboxService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const eventService = new EventService({
    repository: eventRepository,
    campaigns: campaignRepository,
    sessions: sessionRepository,
    entities: entityRepository,
  });
  const unregisterEventIpc = registerEventIpcHandlers(ipcMain, {
    service: eventService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const timelineService = new TimelineService({
    repository: timelineRepository,
    campaigns: campaignRepository,
    entities: entityRepository,
  });
  const unregisterTimelineIpc = registerTimelineIpcHandlers(ipcMain, {
    service: timelineService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  const sessionService = new SessionService({
    repository: sessionRepository,
    campaigns: campaignRepository,
  });
  const sessionHandlerService = createSessionHandlerService(sessionService);
  const sessionParticipantService = new SessionParticipantService({
    repository: sessionRepository,
    campaigns: campaignRepository,
    entities: entityRepository,
  });
  const sessionIntentionService = new SessionIntentionService({
    repository: sessionIntentionRepository,
    campaigns: campaignRepository,
    sessions: sessionRepository,
    entities: entityRepository,
  });
  const unregisterSessionIpc = registerSessionIpcHandlers(ipcMain, {
    sessions: sessionHandlerService,
    participants: sessionParticipantService,
    intentions: sessionIntentionService,
    logger,
    authorizedWebContentsId: window.webContents.id,
  });
  await logger.info('Aplicação inicializada.', { applicationVersion: app.getVersion() });
  await loadMainWindow(window);
  let disposed = false;

  return {
    window,
    database,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unregisterAppearanceIpc();
      unregisterIpc();
      unregisterCampaignIpc();
      unregisterImageImportIpc();
      unregisterCampaignCoverIpc();
      unregisterEntityReferenceImageIpc();
      unregisterDiagnosticsIpc();
      unregisterEntityTypeIpc();
      unregisterFieldDefinitionIpc();
      unregisterEntityIpc();
      unregisterRelationshipTypeIpc();
      unregisterRelationshipIpc();
      unregisterAssertionIpc();
      unregisterNoteIpc();
      unregisterInboxIpc();
      unregisterEventIpc();
      unregisterTimelineIpc();
      unregisterSessionIpc();
      appearanceMenu.dispose();
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

function createCampaignService(repository: CampaignRepository): CampaignService {
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.CAMPAIGN_MANAGER_TEST_FAIL_INITIAL_CAMPAIGN_LIST === '1'
  )
    return new InitialCampaignListFailureService({ repository });
  return new CampaignService({ repository });
}

class InitialCampaignListFailureService extends CampaignService {
  private shouldFail = true;

  public override list(input: CampaignPageRequest): CampaignPageResult {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new AppError('DATABASE_UNAVAILABLE', 'Falha de teste na leitura de campanhas.');
    }
    return super.list(input);
  }
}

function createSessionHandlerService(
  service: SessionService,
): SessionHandlerDependencies['sessions'] {
  const shouldInjectFailure =
    process.env.NODE_ENV === 'test' && process.env.E2E_SESSION_LIST_FAIL_ONCE === '1';
  const configuredDelay =
    process.env.NODE_ENV === 'test' ? Number(process.env.E2E_SESSION_LIST_DELAY_MS ?? 0) : 0;
  const delayMilliseconds =
    Number.isFinite(configuredDelay) && configuredDelay > 0 ? configuredDelay : 0;

  if (!shouldInjectFailure && delayMilliseconds === 0) return service;

  let shouldFail = shouldInjectFailure;
  return {
    create: (input) => service.create(input),
    get: (input) => service.get(input),
    list: async (input) => {
      if (shouldFail) {
        shouldFail = false;
        throw new AppError('TEST_SESSION_LIST_FAILURE', 'Falha de teste ao carregar sessões.');
      }
      if (delayMilliseconds > 0)
        await new Promise<void>((resolve) => setTimeout(resolve, delayMilliseconds));
      return service.list(input);
    },
    update: (input) => service.update(input),
  };
}
