import type {
  AppearanceSetting,
  AppearanceTheme,
  UpdateAppearanceThemeInput,
} from '../../core/contracts/appearance';

export const appearanceWindowBackgrounds: Readonly<Record<AppearanceTheme, string>> = {
  light: '#f7f4ed',
  dark: '#1c1917',
};

export interface NativeThemeSourcePort {
  themeSource: AppearanceTheme | 'system';
}

export function createWindowWithInitialTheme<TWindow>(
  theme: AppearanceTheme,
  nativeTheme: NativeThemeSourcePort,
  createWindow: (theme: AppearanceTheme) => TWindow,
): TWindow {
  nativeTheme.themeSource = theme;
  return createWindow(theme);
}

export interface AppearanceServicePort {
  get(): AppearanceSetting;
  update(input: UpdateAppearanceThemeInput): AppearanceSetting;
}

export interface AppearanceShellPort {
  notifyThemeChanged(setting: AppearanceSetting): void;
  setMenuTheme(theme: AppearanceTheme): void;
  setNativeTheme(theme: AppearanceTheme): void;
  setWindowBackground(color: string): void;
}

export class AppearanceController {
  private synchronizedTheme: AppearanceTheme | null = null;

  public constructor(
    private readonly service: AppearanceServicePort,
    private readonly shell: AppearanceShellPort,
  ) {}

  public initialize(setting: AppearanceSetting): void {
    this.synchronize(setting.theme);
  }

  public getTheme(): AppearanceSetting {
    const setting = this.service.get();
    this.synchronize(setting.theme);
    return setting;
  }

  public setTheme(input: UpdateAppearanceThemeInput): AppearanceSetting {
    const setting = this.service.update(input);
    this.synchronize(setting.theme);
    this.shell.notifyThemeChanged(setting);
    return setting;
  }

  public setThemeFromMenu(theme: AppearanceTheme): AppearanceSetting {
    try {
      const current = this.service.get();
      if (current.theme === theme) {
        this.synchronize(current.theme);
        return current;
      }
      return this.setTheme({ theme, revision: current.revision });
    } catch (error) {
      if (this.synchronizedTheme !== null) this.synchronize(this.synchronizedTheme);
      throw error;
    }
  }

  private synchronize(theme: AppearanceTheme): void {
    this.shell.setNativeTheme(theme);
    this.shell.setWindowBackground(appearanceWindowBackgrounds[theme]);
    this.shell.setMenuTheme(theme);
    this.synchronizedTheme = theme;
  }
}
