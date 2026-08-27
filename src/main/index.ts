import { app, BrowserWindow } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import {
  bootstrapApplication,
  showBootstrapError,
  type RunningApplication,
} from './bootstrap/application';
import { scheduleSquirrelUninstallCleanup } from './squirrel/uninstall-cleanup';

let runningApplication: RunningApplication | null = null;
const isPackageSmokeTest = process.env.PHASE_ZERO_PACKAGE_SMOKE === '1';

scheduleSquirrelUninstallCleanup();

if (!squirrelStartup) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();

  if (!hasSingleInstanceLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      const window = runningApplication?.window;
      if (window === undefined) return;
      if (window.isMinimized()) window.restore();
      window.focus();
    });

    void app
      .whenReady()
      .then(async () => {
        await startApplication();
        app.on('activate', () => {
          if (BrowserWindow.getAllWindows().length === 0) {
            void startApplication();
          }
        });
      })
      .catch((error: unknown) => {
        if (isPackageSmokeTest) {
          console.error(error);
          process.exit(1);
        }
        showBootstrapError(error);
        app.quit();
      });

    app.on('before-quit', () => {
      runningApplication?.dispose();
      runningApplication = null;
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }
}

async function startApplication(): Promise<void> {
  const application = await bootstrapApplication();
  runningApplication = application;
  application.window.once('closed', () => {
    if (runningApplication !== application) return;
    application.dispose();
    runningApplication = null;
  });
}
