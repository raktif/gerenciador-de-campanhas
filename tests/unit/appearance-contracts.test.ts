import { describe, expect, it } from 'vitest';
import {
  appearanceSettingSchema,
  appearanceThemeSchema,
  updateAppearanceThemeInputSchema,
} from '../../src/core/contracts/appearance';

describe('contratos de apar\u00eancia', () => {
  it('aceita somente os temas diurno e noturno', () => {
    expect(appearanceThemeSchema.parse('light')).toBe('light');
    expect(appearanceThemeSchema.parse('dark')).toBe('dark');
    expect(appearanceThemeSchema.safeParse('system').success).toBe(false);
  });

  it('mant\u00e9m setting e muta\u00e7\u00e3o estritos e exige revis\u00e3o inteira n\u00e3o negativa', () => {
    expect(appearanceSettingSchema.parse({ theme: 'light', revision: 0 })).toEqual({
      theme: 'light',
      revision: 0,
    });
    expect(updateAppearanceThemeInputSchema.parse({ theme: 'dark', revision: 1 })).toEqual({
      theme: 'dark',
      revision: 1,
    });
    expect(
      appearanceSettingSchema.safeParse({ theme: 'light', revision: 1, unexpected: true }).success,
    ).toBe(false);
    expect(
      updateAppearanceThemeInputSchema.safeParse({ theme: 'dark', revision: -1 }).success,
    ).toBe(false);
    expect(
      updateAppearanceThemeInputSchema.safeParse({ theme: 'dark', revision: 1.5 }).success,
    ).toBe(false);
  });
});
