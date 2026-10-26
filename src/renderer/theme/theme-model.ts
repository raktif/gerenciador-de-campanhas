import type { AppearanceSetting, AppearanceTheme } from '../../core/contracts/appearance';
import type { AppearanceGateway } from '../../core/contracts/appearance';

export const defaultAppearanceSetting: AppearanceSetting = Object.freeze({
  theme: 'light',
  revision: 0,
});

export interface InitialAppearance {
  setting: AppearanceSetting;
  loadFailed: boolean;
}

export async function loadInitialAppearance(
  gateway: AppearanceGateway,
): Promise<InitialAppearance> {
  try {
    const result = await gateway.getTheme();
    return result.ok
      ? { setting: result.data, loadFailed: false }
      : { setting: defaultAppearanceSetting, loadFailed: true };
  } catch {
    return { setting: defaultAppearanceSetting, loadFailed: true };
  }
}

export function applyDocumentTheme(
  theme: AppearanceTheme,
  root: Pick<HTMLElement, 'dataset' | 'style'>,
): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function toggledTheme(theme: AppearanceTheme): AppearanceTheme {
  return theme === 'light' ? 'dark' : 'light';
}
