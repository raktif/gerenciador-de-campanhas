import { z } from 'zod';
import type { EmptyInput } from './phase-zero';
import type { Result } from './result';

export const appearanceThemes = ['light', 'dark'] as const;
export const appearanceThemeSchema = z.enum(appearanceThemes);
export type AppearanceTheme = z.infer<typeof appearanceThemeSchema>;

export const appearanceSettingSchema = z
  .object({
    theme: appearanceThemeSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type AppearanceSetting = z.infer<typeof appearanceSettingSchema>;

export const updateAppearanceThemeInputSchema = z
  .object({
    theme: appearanceThemeSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateAppearanceThemeInput = z.infer<typeof updateAppearanceThemeInputSchema>;

export interface AppearanceGateway {
  getTheme(input?: EmptyInput): Promise<Result<AppearanceSetting>>;
  setTheme(input: UpdateAppearanceThemeInput): Promise<Result<AppearanceSetting>>;
  onThemeChanged(listener: (setting: AppearanceSetting) => void): () => void;
}
