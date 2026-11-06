import { describe, expect, it } from 'vitest';
import type {
  AppearanceSetting,
  AppearanceTheme,
  UpdateAppearanceThemeInput,
} from '../../src/core/contracts/appearance';
import { AppError } from '../../src/core/errors/app-error';
import {
  AppearanceController,
  appearanceWindowBackgrounds,
  createWindowWithInitialTheme,
  type AppearanceServicePort,
  type AppearanceShellPort,
} from '../../src/main/appearance/appearance-controller';

describe('AppearanceController', () => {
  it('aplica o tema nativo persistido antes de criar a janela', () => {
    const order: string[] = [];
    const nativeTheme = {
      get themeSource(): 'system' | 'light' | 'dark' {
        return 'system';
      },
      set themeSource(theme: 'system' | 'light' | 'dark') {
        order.push(`native:${theme}`);
      },
    };

    const window = createWindowWithInitialTheme('dark', nativeTheme, (theme) => {
      order.push(`window:${theme}`);
      return { theme };
    });

    expect(window).toEqual({ theme: 'dark' });
    expect(order).toEqual(['native:dark', 'window:dark']);
  });

  it('sincroniza menu, tema nativo e fundo ao inicializar e ler', () => {
    const service = new FakeAppearanceService({ theme: 'dark', revision: 3 });
    const shell = new RecordingShell();
    const controller = new AppearanceController(service, shell);

    controller.initialize({ theme: 'light', revision: 2 });
    expect(controller.getTheme()).toEqual({ theme: 'dark', revision: 3 });
    expect(shell.applied).toEqual([
      { target: 'native', value: 'light' },
      { target: 'background', value: appearanceWindowBackgrounds.light },
      { target: 'menu', value: 'light' },
      { target: 'native', value: 'dark' },
      { target: 'background', value: appearanceWindowBackgrounds.dark },
      { target: 'menu', value: 'dark' },
    ]);
    expect(shell.notifications).toEqual([]);
  });

  it('só altera o shell depois de a gravação CAS ser confirmada', () => {
    const service = new FakeAppearanceService({ theme: 'light', revision: 1 });
    const shell = new RecordingShell();
    const controller = new AppearanceController(service, shell);
    service.updateError = new AppError('REVISION_CONFLICT', 'Conflito.');

    expect(() => controller.setTheme({ theme: 'dark', revision: 1 })).toThrow(service.updateError);
    expect(shell.applied).toEqual([]);

    service.updateError = null;
    expect(controller.setTheme({ theme: 'dark', revision: 1 })).toEqual({
      theme: 'dark',
      revision: 2,
    });
    expect(shell.applied).toEqual([
      { target: 'native', value: 'dark' },
      { target: 'background', value: appearanceWindowBackgrounds.dark },
      { target: 'menu', value: 'dark' },
    ]);
    expect(shell.notifications).toEqual([{ theme: 'dark', revision: 2 }]);
  });

  it('reverte o checkbox e o shell ao tema persistido quando a ação do menu falha', () => {
    const service = new FakeAppearanceService({ theme: 'light', revision: 4 });
    const shell = new RecordingShell();
    const controller = new AppearanceController(service, shell);
    controller.initialize({ theme: 'light', revision: 4 });
    shell.applied.splice(0);
    service.updateError = new AppError('REVISION_CONFLICT', 'Conflito.');

    expect(() => controller.setThemeFromMenu('dark')).toThrow(service.updateError);
    expect(shell.applied).toEqual([
      { target: 'native', value: 'light' },
      { target: 'background', value: appearanceWindowBackgrounds.light },
      { target: 'menu', value: 'light' },
    ]);
  });

  it('restaura o último tema sincronizado quando a própria leitura do menu falha', () => {
    const service = new FakeAppearanceService({ theme: 'light', revision: 4 });
    const shell = new RecordingShell();
    const controller = new AppearanceController(service, shell);
    controller.initialize({ theme: 'dark', revision: 3 });
    shell.applied.splice(0);
    service.getError = new AppError('DATABASE_UNAVAILABLE', 'Indisponível.');

    expect(() => controller.setThemeFromMenu('light')).toThrow(service.getError);
    expect(shell.applied).toEqual([
      { target: 'native', value: 'dark' },
      { target: 'background', value: appearanceWindowBackgrounds.dark },
      { target: 'menu', value: 'dark' },
    ]);
  });
});

class FakeAppearanceService implements AppearanceServicePort {
  public getError: Error | null = null;
  public updateError: Error | null = null;

  public constructor(private setting: AppearanceSetting) {}

  public get(): AppearanceSetting {
    if (this.getError !== null) throw this.getError;
    return this.setting;
  }

  public update(input: UpdateAppearanceThemeInput): AppearanceSetting {
    if (this.updateError !== null) throw this.updateError;
    this.setting = { theme: input.theme, revision: input.revision + 1 };
    return this.setting;
  }
}

class RecordingShell implements AppearanceShellPort {
  public readonly applied: { target: string; value: string }[] = [];
  public readonly notifications: AppearanceSetting[] = [];

  public notifyThemeChanged(setting: AppearanceSetting): void {
    this.notifications.push(setting);
  }

  public setMenuTheme(theme: AppearanceTheme): void {
    this.applied.push({ target: 'menu', value: theme });
  }

  public setNativeTheme(theme: AppearanceTheme): void {
    this.applied.push({ target: 'native', value: theme });
  }

  public setWindowBackground(color: string): void {
    this.applied.push({ target: 'background', value: color });
  }
}
