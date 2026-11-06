import { describe, expect, it } from 'vitest';
import type { AppearanceGateway } from '../../src/core/contracts/appearance';
import { success } from '../../src/core/contracts/result';
import {
  applyDocumentTheme,
  defaultAppearanceSetting,
  loadInitialAppearance,
  toggledTheme,
} from '../../src/renderer/theme/theme-model';

describe('modelo de tema do renderer', () => {
  it('carrega o tema persistido e usa fallback seguro em falha ou exceção', async () => {
    const darkGateway = gatewayWithGet(() =>
      Promise.resolve(success({ theme: 'dark', revision: 4 }, 'request')),
    );
    expect(await loadInitialAppearance(darkGateway)).toEqual({
      setting: { theme: 'dark', revision: 4 },
      loadFailed: false,
    });

    const failedGateway = gatewayWithGet(() => Promise.reject(new Error('indisponível')));
    expect(await loadInitialAppearance(failedGateway)).toEqual({
      setting: defaultAppearanceSetting,
      loadFailed: true,
    });
  });

  it('aplica data-theme e color-scheme antes do render e alterna somente light/dark', () => {
    const root = { dataset: {}, style: {} } as Pick<HTMLElement, 'dataset' | 'style'>;

    applyDocumentTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(toggledTheme('dark')).toBe('light');
    expect(toggledTheme('light')).toBe('dark');
  });
});

function gatewayWithGet(getTheme: AppearanceGateway['getTheme']): AppearanceGateway {
  return {
    getTheme,
    onThemeChanged: () => () => undefined,
    setTheme: () => Promise.resolve(success({ theme: 'light', revision: 1 }, 'request')),
  };
}
