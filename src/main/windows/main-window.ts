import path from 'node:path';
import { BrowserWindow } from 'electron';
import { loadMainWindowContent, selectMainWindowDevelopmentUrl } from './main-window-navigation';

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f6f4ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !process.env.NODE_ENV?.includes('production'),
    },
  });

  const showOnce = (): void => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once('ready-to-show', showOnce);
  // Em algumas sessões remotas/VMs corporativas o compositor nunca emite
  // 'ready-to-show'; este time-out evita que a janela fique invisível para sempre.
  const fallbackShowTimer = setTimeout(showOnce, 3000);
  mainWindow.once('closed', () => clearTimeout(fallbackShowTimer));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  let initialNavigationComplete = false;
  mainWindow.webContents.on('did-finish-load', () => {
    initialNavigationComplete = true;
  });
  mainWindow.webContents.on('will-navigate', (event) => {
    if (initialNavigationComplete) event.preventDefault();
  });

  return mainWindow;
}

export function loadMainWindow(window: BrowserWindow): Promise<void> {
  return loadMainWindowContent(
    window,
    selectMainWindowDevelopmentUrl(MAIN_WINDOW_VITE_DEV_SERVER_URL, process.env.NODE_ENV),
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    {
      onRetry: (attempt, maximumAttempts) => {
        console.warn(
          `Renderer Vite ainda indisponível; repetindo carregamento inicial (${String(attempt)}/${String(maximumAttempts)}).`,
        );
      },
    },
  );
}
