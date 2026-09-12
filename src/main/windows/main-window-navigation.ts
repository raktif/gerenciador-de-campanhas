export interface MainWindowContentLoader {
  loadFile(path: string): Promise<void>;
  loadURL(url: string): Promise<void>;
}

export function loadMainWindowContent(
  window: MainWindowContentLoader,
  developmentUrl: string | undefined,
  productionFile: string,
): Promise<void> {
  return developmentUrl === undefined
    ? window.loadFile(productionFile)
    : window.loadURL(developmentUrl);
}
