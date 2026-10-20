import {
  hexColorSchema,
  type HexColor,
} from '../../core/contracts/colors';

export interface ColorPickerModel {
  readonly selectedColor: HexColor | null;
  readonly hexDraft: string;
  readonly hasLegacyValue: boolean;
  readonly validationMessage: string | null;
}

export type HexCommitResult =
  | {
      readonly status: 'committed';
      readonly model: ColorPickerModel;
      readonly value: HexColor | null;
    }
  | {
      readonly status: 'invalid';
      readonly model: ColorPickerModel;
    };

export function createColorPickerModel(value: string | null): ColorPickerModel {
  if (value === null) return selectedModel(null);
  const parsed = hexColorSchema.safeParse(value);
  if (parsed.success) return selectedModel(parsed.data);
  return {
    selectedColor: null,
    hexDraft: '',
    hasLegacyValue: true,
    validationMessage: null,
  };
}

export function selectColor(
  model: ColorPickerModel,
  value: HexColor | null,
): ColorPickerModel {
  void model;
  return selectedModel(value);
}

export function updateHexDraft(model: ColorPickerModel, value: string): ColorPickerModel {
  return { ...model, hexDraft: value, validationMessage: null };
}

export function commitHexDraft(model: ColorPickerModel): HexCommitResult {
  if (model.hexDraft.trim() === '') {
    return { status: 'committed', model: selectedModel(null), value: null };
  }

  const parsed = hexColorSchema.safeParse(model.hexDraft);
  if (!parsed.success) {
    return {
      status: 'invalid',
      model: {
        ...model,
        validationMessage: 'Use uma cor hexadecimal no formato #RRGGBB.',
      },
    };
  }

  return {
    status: 'committed',
    model: selectedModel(parsed.data),
    value: parsed.data,
  };
}

function selectedModel(value: HexColor | null): ColorPickerModel {
  return {
    selectedColor: value,
    hexDraft: value ?? '',
    hasLegacyValue: false,
    validationMessage: null,
  };
}
