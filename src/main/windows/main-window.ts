import path from 'node:path';
import { BrowserWindow } from 'electron';

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

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  let initialNavigationComplete = false;
  mainWindow.webContents.on('did-finish-load', () => {
    initialNavigationComplete = true;
  });
  mainWindow.webContents.on('will-navigate', (event) => {
    if (initialNavigationComplete) event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
}
