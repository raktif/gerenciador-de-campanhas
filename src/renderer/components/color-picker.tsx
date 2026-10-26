import { useEffect, useState } from 'react';
import {
  colorPalette,
  hexToHsl,
  hslToHex,
  normalizeHexColor,
  type HexColor,
  type HslColor,
} from '../../core/contracts/colors';
import {
  commitHexDraft,
  createColorPickerModel,
  selectColor,
  updateHexDraft,
  type ColorPickerModel,
} from './color-picker-model';

interface ColorPickerProps {
  disabled?: boolean;
  id: string;
  legend?: string;
  onChange: (value: HexColor | null) => void;
  value: string | null;
}

const fallbackColor: HexColor = '#475569';

export function ColorPicker({
  disabled = false,
  id,
  legend = 'Cor',
  onChange,
  value,
}: ColorPickerProps): React.JSX.Element {
  const [model, setModel] = useState<ColorPickerModel>(() => createColorPickerModel(value));

  useEffect(() => setModel(createColorPickerModel(value)), [value]);

  const activeColor = model.selectedColor ?? fallbackColor;
  const hsl = hexToHsl(activeColor);
  const legacyMessageId = `${id}-legacy-message`;
  const sampleId = `${id}-sample`;
  const advancedHelpId = `${id}-hex-help`;
  const validationId = `${id}-hex-error`;

  function choose(nextValue: HexColor | null): void {
    setModel((current) => selectColor(current, nextValue));
    onChange(nextValue);
  }

  function changeHsl(field: keyof HslColor, nextValue: number): void {
    choose(hslToHex({ ...hsl, [field]: nextValue }));
  }

  function commitDraft(): void {
    const result = commitHexDraft(model);
    setModel(result.model);
    if (result.status === 'committed') onChange(result.value);
  }

  return (
    <fieldset
      aria-describedby={model.hasLegacyValue ? legacyMessageId : undefined}
      className="space-y-5"
      disabled={disabled}
    >
      <legend className="semantic-field-label text-sm font-semibold">{legend}</legend>

      {model.hasLegacyValue ? (
        <p className="semantic-warning-text text-sm" id={legacyMessageId} role="status">
          A cor anterior não usa o formato atual e será preservada. Escolha uma nova cor ou use Sem
          cor para substituí-la.
        </p>
      ) : null}

      <div
        aria-label="Paleta de cores"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="radiogroup"
      >
        <ColorOption
          checked={model.selectedColor === null && !model.hasLegacyValue}
          disabled={disabled}
          id={`${id}-none`}
          label="Sem cor"
          name={`${id}-palette`}
          onChange={() => choose(null)}
          value={null}
        />
        {colorPalette.map((option) => (
          <ColorOption
            checked={model.selectedColor === option.value}
            disabled={disabled}
            id={`${id}-${option.id}`}
            key={option.id}
            label={option.label}
            name={`${id}-palette`}
            onChange={() => choose(option.value)}
            value={option.value}
          />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-4">
          <label className={labelClassName} htmlFor={`${id}-visual`}>
            Seletor visual
          </label>
          <input
            aria-describedby={sampleId}
            className="semantic-input h-12 w-full cursor-pointer rounded-xl border p-1 disabled:cursor-not-allowed disabled:opacity-60"
            id={`${id}-visual`}
            onChange={(event) => choose(normalizeHexColor(event.target.value))}
            type="color"
            value={activeColor}
          />

          <RangeControl
            id={`${id}-hue`}
            label="Matiz"
            maximum={360}
            onChange={(nextValue) => changeHsl('hue', nextValue)}
            unit="°"
            value={Math.round(hsl.hue)}
          />
          <RangeControl
            id={`${id}-saturation`}
            label="Saturação"
            maximum={100}
            onChange={(nextValue) => changeHsl('saturation', nextValue)}
            unit="%"
            value={Math.round(hsl.saturation)}
          />
          <RangeControl
            id={`${id}-lightness`}
            label="Luminosidade"
            maximum={100}
            onChange={(nextValue) => changeHsl('lightness', nextValue)}
            unit="%"
            value={Math.round(hsl.lightness)}
          />
        </div>

        <div>
          <p className={labelClassName}>Amostra</p>
          <div
            className="semantic-panel semantic-field-label mt-2 rounded-xl border p-3 text-center text-sm font-semibold"
            id={sampleId}
          >
            <span
              aria-hidden="true"
              className="mx-auto mb-3 block h-20 w-full rounded-lg border border-[var(--border)]"
              style={{ backgroundColor: model.selectedColor ?? 'transparent' }}
            />
            {model.selectedColor ?? (model.hasLegacyValue ? 'Cor anterior preservada' : 'Sem cor')}
          </div>
        </div>
      </div>

      <details
        className="semantic-panel-muted rounded-xl border p-4"
        onToggle={(event) => {
          if (disabled && event.currentTarget.open) event.currentTarget.open = false;
        }}
      >
        <summary
          aria-disabled={disabled || undefined}
          className={`semantic-field-label flex min-h-11 items-center rounded-lg font-semibold outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          onClick={(event) => {
            if (disabled) event.preventDefault();
          }}
          tabIndex={disabled ? -1 : undefined}
        >
          Opções avançadas
        </summary>
        <div className="mt-4">
          <label className={labelClassName} htmlFor={`${id}-hex`}>
            Cor hexadecimal
          </label>
          <input
            aria-describedby={`${advancedHelpId}${model.validationMessage === null ? '' : ` ${validationId}`}`}
            aria-invalid={model.validationMessage === null ? undefined : true}
            autoComplete="off"
            className="semantic-input mt-2 w-full rounded-xl border px-4 py-3 font-mono shadow-sm outline-none placeholder:text-[var(--text-secondary)]"
            id={`${id}-hex`}
            inputMode="text"
            maxLength={7}
            onBlur={commitDraft}
            onChange={(event) => setModel((current) => updateHexDraft(current, event.target.value))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              event.currentTarget.blur();
            }}
            pattern="#[0-9A-Fa-f]{6}"
            placeholder="#RRGGBB"
            spellCheck={false}
            value={model.hexDraft}
          />
          <p className="semantic-help-text mt-2 text-xs" id={advancedHelpId}>
            Digite seis algarismos hexadecimais. O valor será normalizado ao sair do campo.
          </p>
          {model.validationMessage === null ? null : (
            <p className="semantic-error-text mt-2 text-sm" id={validationId} role="alert">
              {model.validationMessage}
            </p>
          )}
        </div>
      </details>
    </fieldset>
  );
}

function ColorOption({
  checked,
  disabled,
  id,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  disabled: boolean;
  id: string;
  label: string;
  name: string;
  onChange: () => void;
  value: HexColor | null;
}): React.JSX.Element {
  return (
    <label
      className={`semantic-choice relative flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition has-focus-visible:outline-3 has-focus-visible:outline-offset-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      htmlFor={id}
    >
      <input
        checked={checked}
        className="semantic-accent-control size-4 shrink-0"
        disabled={disabled}
        id={id}
        name={name}
        onChange={onChange}
        type="radio"
        value={value ?? 'none'}
      />
      <span
        aria-hidden="true"
        className="size-5 shrink-0 rounded-full border border-[var(--border)]"
        style={{ backgroundColor: value ?? 'transparent' }}
      />
      <span>{label}</span>
      {checked ? (
        <span aria-hidden="true" className="ml-auto font-bold">
          ✓
        </span>
      ) : null}
    </label>
  );
}

function RangeControl({
  id,
  label,
  maximum,
  onChange,
  unit,
  value,
}: {
  id: string;
  label: string;
  maximum: number;
  onChange: (value: number) => void;
  unit: string;
  value: number;
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className={labelClassName} htmlFor={id}>
          {label}
        </label>
        <output
          className="semantic-help-text min-w-14 text-right text-sm tabular-nums"
          htmlFor={id}
        >
          {value}
          {unit}
        </output>
      </div>
      <input
        className="semantic-accent-control mt-2 h-11 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        id={id}
        max={maximum}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={1}
        type="range"
        value={value}
      />
    </div>
  );
}

const labelClassName = 'semantic-field-label text-sm font-semibold';
