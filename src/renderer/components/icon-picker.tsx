import { iconCatalog, iconIdSchema, type IconId } from '../../core/contracts/icons';
import { Icon } from './icon';

type IconPickerProps = {
  disabled?: boolean;
  id: string;
  legend?: string;
  onChange: (value: IconId | null) => void;
  value: string | null;
};

export function IconPicker({
  disabled = false,
  id,
  legend = 'Ícone',
  onChange,
  value,
}: IconPickerProps): React.JSX.Element {
  const parsed = value === null ? null : iconIdSchema.safeParse(value);
  const selected = parsed?.success === true ? parsed.data : null;
  const hasLegacyValue = value !== null && parsed?.success === false;
  const legacyMessageId = `${id}-legacy-message`;

  return (
    <fieldset
      aria-describedby={hasLegacyValue ? legacyMessageId : undefined}
      className="space-y-3"
      disabled={disabled}
    >
      <legend className="text-sm font-semibold text-slate-800">{legend}</legend>
      {hasLegacyValue ? (
        <p className="text-sm text-amber-800" id={legacyMessageId} role="status">
          O ícone anterior não pertence ao catálogo e será preservado. Para substituí-lo, escolha
          uma opção.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <IconOption
          checked={value === null}
          disabled={disabled}
          id={`${id}-none`}
          label="Nenhum"
          name={id}
          onChange={() => onChange(null)}
          value="none"
        />
        {iconCatalog.map((option) => (
          <IconOption
            checked={selected === option.id}
            disabled={disabled}
            iconId={option.id}
            id={`${id}-${option.id}`}
            key={option.id}
            label={option.label}
            name={id}
            onChange={() => onChange(option.id)}
            value={option.id}
          />
        ))}
      </div>
    </fieldset>
  );
}

function IconOption({
  checked,
  disabled,
  iconId = null,
  id,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  disabled: boolean;
  iconId?: IconId | null;
  id: string;
  label: string;
  name: string;
  onChange: () => void;
  value: string;
}): React.JSX.Element {
  return (
    <label
      className={`relative flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition has-checked:border-slate-900 has-checked:ring-2 has-checked:ring-slate-900/20 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-amber-700 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-amber-600'}`}
      htmlFor={id}
    >
      <input
        checked={checked}
        className="size-4 shrink-0 accent-amber-700"
        disabled={disabled}
        id={id}
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      <Icon className="size-5 shrink-0" value={iconId} />
      <span>{label}</span>
      {checked ? (
        <span aria-hidden="true" className="ml-auto font-bold">
          ✓
        </span>
      ) : null}
    </label>
  );
}
