export interface MainWindowContentLoader {
  loadFile(path: string): Promise<void>;
  loadURL(url: string): Promise<void>;
}

export interface DevelopmentNavigationOptions {
  delay?: (milliseconds: number) => Promise<void>;
  onRetry?: (attempt: number, maximumAttempts: number) => void;
}

const developmentNavigationAttempts = 8;
const developmentNavigationDelayMilliseconds = 250;

export function isMainWindowNavigationAllowed(currentUrl: string, targetUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    if (currentUrl === '' || currentUrl === 'about:blank')
      return (
        target.protocol === 'http:' || target.protocol === 'https:' || target.protocol === 'file:'
      );

    const current = new URL(currentUrl);

    if (current.protocol === 'http:' || current.protocol === 'https:')
      return target.origin === current.origin;
    if (current.protocol === 'file:')
      return target.protocol === 'file:' && target.pathname === current.pathname;
    return target.href === current.href;
  } catch {
    return false;
  }
}

export function selectMainWindowDevelopmentUrl(
  developmentUrl: string | undefined,
  nodeEnvironment: string | undefined,
): string | undefined {
  // E2E launches the already-built Electron main process.  It must not use a
  // development URL baked into a stale development artifact when no Vite
  // server is running.
  return nodeEnvironment === 'test' ? undefined : developmentUrl;
}

export function loadMainWindowContent(
  window: MainWindowContentLoader,
  developmentUrl: string | undefined,
  productionFile: string,
  options: DevelopmentNavigationOptions = {},
): Promise<void> {
  if (developmentUrl === undefined) return window.loadFile(productionFile);

  return loadDevelopmentUrlWithRetry(window, developmentUrl, options);
}

async function loadDevelopmentUrlWithRetry(
  window: MainWindowContentLoader,
  developmentUrl: string,
  options: DevelopmentNavigationOptions,
): Promise<void> {
  const delay = options.delay ?? defaultDelay;

  for (let attempt = 1; attempt <= developmentNavigationAttempts; attempt += 1) {
    try {
      await window.loadURL(developmentUrl);
      return;
    } catch (error) {
      if (!isConnectionRefused(error) || attempt === developmentNavigationAttempts) throw error;

      options.onRetry?.(attempt, developmentNavigationAttempts);
      await delay(developmentNavigationDelayMilliseconds);
    }
  }
}

function isConnectionRefused(error: unknown): boolean {
  return error instanceof Error && error.message.includes('ERR_CONNECTION_REFUSED');
}

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
