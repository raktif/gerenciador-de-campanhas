import type { AppearanceGateway, AppearanceSetting } from '../../core/contracts/appearance';

export interface ThemeSynchronizer {
  accept(setting: AppearanceSetting): boolean;
  current(): AppearanceSetting;
  start(): () => void;
}

export function createThemeSynchronizer(options: {
  gateway: AppearanceGateway;
  initialSetting: AppearanceSetting;
  onAccepted(setting: AppearanceSetting): void;
}): ThemeSynchronizer {
  let currentSetting = options.initialSetting;
  let generation = 0;

  const accept = (setting: AppearanceSetting): boolean => {
    if (setting.revision < currentSetting.revision) return false;
    currentSetting = setting;
    options.onAccepted(setting);
    return true;
  };

  return {
    accept,
    current: () => currentSetting,
    start: () => {
      const activeGeneration = ++generation;
      const isActive = (): boolean => generation === activeGeneration;
      const unsubscribe = options.gateway.onThemeChanged((setting) => {
        if (isActive()) accept(setting);
      });

      void options.gateway
        .getTheme()
        .then((result) => {
          if (isActive() && result.ok) accept(result.data);
        })
        .catch(() => undefined);

      return () => {
        if (isActive()) generation += 1;
        unsubscribe();
      };
    },
  };
}
