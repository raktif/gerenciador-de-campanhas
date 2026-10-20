import { z } from 'zod';

const hexColorInputPattern = /^#[0-9a-fA-F]{6}$/;
const canonicalHexColorPattern = /^#[0-9A-F]{6}$/;

export const hexColorSchema = z
  .string()
  .trim()
  .regex(hexColorInputPattern, 'Use uma cor hexadecimal no formato #RRGGBB.')
  .transform((value) => value.toUpperCase());
export type HexColor = z.output<typeof hexColorSchema>;

export const nullableHexColorSchema = hexColorSchema.nullable();

export interface ColorPaletteOption {
  readonly id: string;
  readonly label: string;
  readonly value: HexColor;
}

const paletteEntries = [
  { id: 'crimson', label: 'Carmesim', value: '#B91C1C' },
  { id: 'orange', label: 'Laranja', value: '#C2410C' },
  { id: 'amber', label: 'Âmbar', value: '#B45309' },
  { id: 'olive', label: 'Oliva', value: '#4D7C0F' },
  { id: 'emerald', label: 'Esmeralda', value: '#047857' },
  { id: 'teal', label: 'Turquesa', value: '#0F766E' },
  { id: 'blue', label: 'Azul', value: '#1D4ED8' },
  { id: 'indigo', label: 'Índigo', value: '#4338CA' },
  { id: 'violet', label: 'Violeta', value: '#7E22CE' },
  { id: 'magenta', label: 'Magenta', value: '#BE185D' },
  { id: 'slate', label: 'Ardósia', value: '#475569' },
  { id: 'brown', label: 'Marrom', value: '#78350F' },
] as const satisfies readonly ColorPaletteOption[];

export const colorPalette: readonly ColorPaletteOption[] = Object.freeze(
  paletteEntries.map((option) => Object.freeze(option)),
);

export interface RgbColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface HslColor {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

const rgbColorSchema = z
  .object({
    red: z.number().int().min(0).max(255),
    green: z.number().int().min(0).max(255),
    blue: z.number().int().min(0).max(255),
  })
  .strict();

const hslColorSchema = z
  .object({
    hue: z.number().finite().min(0).max(360),
    saturation: z.number().finite().min(0).max(100),
    lightness: z.number().finite().min(0).max(100),
  })
  .strict();

export function normalizeHexColor(value: string): HexColor {
  return hexColorSchema.parse(value);
}

export function isCanonicalHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && canonicalHexColorPattern.test(value);
}

export function hexToRgb(value: string): RgbColor {
  const normalized = normalizeHexColor(value);
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex(value: RgbColor): HexColor {
  const { red, green, blue } = rgbColorSchema.parse(value);
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

export function rgbToHsl(value: RgbColor): HslColor {
  const { red, green, blue } = rgbColorSchema.parse(value);
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if (delta === 0) return { hue: 0, saturation: 0, lightness: round(lightness * 100) };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (maximum === normalizedRed) {
    hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
  } else if (maximum === normalizedGreen) {
    hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
  } else {
    hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
  }

  return {
    hue: round(hue < 0 ? hue + 360 : hue),
    saturation: round(saturation * 100),
    lightness: round(lightness * 100),
  };
}

export function hslToRgb(value: HslColor): RgbColor {
  const { hue, saturation, lightness } = hslColorSchema.parse(value);
  const normalizedHue = hue === 360 ? 0 : hue;
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const segment = normalizedHue / 60;
  const intermediate = chroma * (1 - Math.abs((segment % 2) - 1));
  const offset = normalizedLightness - chroma / 2;

  let channels: readonly [number, number, number];
  if (segment < 1) channels = [chroma, intermediate, 0];
  else if (segment < 2) channels = [intermediate, chroma, 0];
  else if (segment < 3) channels = [0, chroma, intermediate];
  else if (segment < 4) channels = [0, intermediate, chroma];
  else if (segment < 5) channels = [intermediate, 0, chroma];
  else channels = [chroma, 0, intermediate];

  return {
    red: Math.round((channels[0] + offset) * 255),
    green: Math.round((channels[1] + offset) * 255),
    blue: Math.round((channels[2] + offset) * 255),
  };
}

export function hexToHsl(value: string): HslColor {
  return rgbToHsl(hexToRgb(value));
}

export function hslToHex(value: HslColor): HexColor {
  return rgbToHex(hslToRgb(value));
}

export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(hexToRgb(first));
  const secondLuminance = relativeLuminance(hexToRgb(second));
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastingTextColor(background: string): HexColor {
  const black = '#000000';
  const white = '#FFFFFF';
  return contrastRatio(background, black) >= contrastRatio(background, white) ? black : white;
}

function relativeLuminance(value: RgbColor): number {
  const { red, green, blue } = rgbColorSchema.parse(value);
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function toHexChannel(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
