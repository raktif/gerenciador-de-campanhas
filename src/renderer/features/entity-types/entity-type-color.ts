import {
  contrastingTextColor,
  hexColorSchema,
  type HexColor,
} from '../../../core/contracts/colors';

export interface EntityTypeColorStyle {
  readonly backgroundColor: HexColor;
  readonly color: HexColor;
}

export function entityTypeColorStyle(value: string | null): EntityTypeColorStyle | undefined {
  const parsed = hexColorSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const normalized = parsed.data;
  return {
    backgroundColor: normalized,
    color: contrastingTextColor(normalized),
  };
}
