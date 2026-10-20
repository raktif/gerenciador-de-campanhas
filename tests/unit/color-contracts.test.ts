import { describe, expect, it } from 'vitest';
import {
  colorPalette,
  contrastRatio,
  contrastingTextColor,
  hexColorSchema,
  hexToHsl,
  hexToRgb,
  hslToHex,
  hslToRgb,
  isCanonicalHexColor,
  normalizeHexColor,
  rgbToHex,
  rgbToHsl,
} from '../../src/core/contracts/colors';

describe('contrato de cores', () => {
  it('normaliza somente o formato #RRGGBB canônico', () => {
    expect(hexColorSchema.parse('  #a1b2c3  ')).toBe('#A1B2C3');
    expect(normalizeHexColor('#FFFFFF')).toBe('#FFFFFF');
    expect(isCanonicalHexColor('#A1B2C3')).toBe(true);
    expect(isCanonicalHexColor('#a1b2c3')).toBe(false);

    for (const value of [
      '',
      '#FFF',
      '#FFFFFFFF',
      'red',
      'rgb(1, 2, 3)',
      'var(--accent)',
      '#GG0000',
      '<style />',
    ]) {
      expect(() => hexColorSchema.parse(value)).toThrow();
    }
  });

  it('expõe uma paleta pronta, estável e imutável', () => {
    expect(colorPalette).toHaveLength(12);
    expect(Object.isFrozen(colorPalette)).toBe(true);
    expect(colorPalette.every((option) => Object.isFrozen(option))).toBe(true);
    expect(new Set(colorPalette.map(({ id }) => id)).size).toBe(colorPalette.length);
    expect(new Set(colorPalette.map(({ label }) => label)).size).toBe(colorPalette.length);
    expect(new Set(colorPalette.map(({ value }) => value)).size).toBe(colorPalette.length);
    for (const option of colorPalette) expect(isCanonicalHexColor(option.value)).toBe(true);
  });
});

describe('conversões de cores', () => {
  it('converte entre hexadecimal e RGB com validação estrita', () => {
    expect(hexToRgb('#1D4ED8')).toEqual({ red: 29, green: 78, blue: 216 });
    expect(rgbToHex({ red: 29, green: 78, blue: 216 })).toBe('#1D4ED8');
    expect(() => rgbToHex({ red: 256, green: 0, blue: 0 })).toThrow();
    expect(() => rgbToHex({ red: 1.5, green: 0, blue: 0 })).toThrow();
  });

  it('converte as cores primárias e os extremos entre RGB e HSL', () => {
    expect(rgbToHsl({ red: 255, green: 0, blue: 0 })).toEqual({
      hue: 0,
      saturation: 100,
      lightness: 50,
    });
    expect(hexToHsl('#FFFFFF')).toEqual({ hue: 0, saturation: 0, lightness: 100 });
    expect(hslToRgb({ hue: 120, saturation: 100, lightness: 50 })).toEqual({
      red: 0,
      green: 255,
      blue: 0,
    });
    expect(hslToHex({ hue: 240, saturation: 100, lightness: 50 })).toBe('#0000FF');
    expect(hslToHex({ hue: 360, saturation: 100, lightness: 50 })).toBe('#FF0000');
  });

  it('mantém a cor em um ciclo hexadecimal-HSL dentro do arredondamento RGB', () => {
    for (const value of ['#1D4ED8', '#B45309', '#475569']) {
      const original = hexToRgb(value);
      const roundTrip = hexToRgb(hslToHex(hexToHsl(value)));
      expect(Math.abs(roundTrip.red - original.red)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTrip.green - original.green)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTrip.blue - original.blue)).toBeLessThanOrEqual(1);
    }
  });
});

describe('contraste', () => {
  it('calcula a razão WCAG e escolhe texto preto ou branco de maior contraste', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(contrastingTextColor('#FFFFFF')).toBe('#000000');
    expect(contrastingTextColor('#000000')).toBe('#FFFFFF');
    expect(contrastingTextColor('#B45309')).toBe('#FFFFFF');
  });
});
