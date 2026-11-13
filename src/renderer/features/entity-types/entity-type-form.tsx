import { useState } from 'react';
import { Button, FormActions } from '../../components/actions';
import { IconPicker } from '../../components/icon-picker';
import { ColorPicker } from '../../components/color-picker';
import type {
  CreateEntityTypeInputRequest,
  EntityType,
  EntityTypePatch,
} from '../../../core/contracts/entity-types';
import { iconIdSchema, type IconId } from '../../../core/contracts/icons';
import { normalizeHexColor } from '../../../core/contracts/colors';

export type EntityTypeCreateValues = Omit<CreateEntityTypeInputRequest, 'campaignId' | 'slug'>;

type EntityTypeFormProps = {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
} & (
  | {
      mode: 'create';
      onSubmit: (values: EntityTypeCreateValues) => Promise<void>;
    }
  | {
      mode: 'edit';
      entityType: EntityType;
      onSubmit: (patch: EntityTypePatch) => Promise<void>;
    }
);

interface FormValues {
  name: string;
  singularName: string;
  description: string;
  icon: EntityTypeFormIconValue;
  color: string;
}

const emptyValues: FormValues = {
  name: '',
  singularName: '',
  description: '',
  icon: null,
  color: '',
};

export function EntityTypeForm(props: EntityTypeFormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() =>
    props.mode === 'create' ? emptyValues : toFormValues(props.entityType),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function update<Key extends keyof FormValues>(field: Key, value: FormValues[Key]): void {
    setValidationError(null);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    if (props.mode === 'create') {
      void props.onSubmit(toCreateEntityTypeValues(values));
      return;
    }

    const patch = toEntityTypePatch(values, props.entityType);
    if (patch === null) {
      setValidationError('Altere ao menos um campo antes de salvar.');
      return;
    }
    void props.onSubmit(patch);
  }

  return (
    <section aria-labelledby="entity-type-form-title" className="mx-auto w-full max-w-4xl">
      <Button
        className="mb-6"
        disabled={props.busy}
        onClick={props.onCancel}
        size="small"
        variant="ghost"
      >
        <span aria-hidden="true">←</span>
        Voltar para tipos de entidade
      </Button>

      <div className="overflow-hidden rounded-3xl border semantic-border semantic-surface semantic-domain-card">
        <header className="border-b semantic-border semantic-surface-muted px-8 py-7 sm:px-10">
          <p className="text-xs font-bold tracking-[0.2em] semantic-accent-text uppercase">
            {props.mode === 'create' ? 'Novo tipo de entidade' : 'Editar tipo de entidade'}
          </p>
          <h1 id="entity-type-form-title" className="mt-2 text-3xl font-semibold tracking-tight">
            {props.mode === 'create' ? 'Defina uma categoria do seu mundo' : props.entityType.name}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 semantic-text-secondary">
            O nome plural organiza a coleção; o singular aparece ao criar cada entidade.
          </p>
        </header>

        <form className="space-y-7 px-8 py-8 sm:px-10" onSubmit={submit}>
          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              autoFocus
              disabled={props.busy}
              id="entity-type-name"
              label="Nome plural"
              onChange={(value) => update('name', value)}
              placeholder="Ex.: Personagens"
              required
              value={values.name}
            />
            <TextField
              disabled={props.busy}
              id="entity-type-singular-name"
              label="Nome singular"
              onChange={(value) => update('singularName', value)}
              placeholder="Ex.: Personagem"
              required
              value={values.singularName}
            />
          </div>

          <div>
            <label className={labelClassName} htmlFor="entity-type-description">
              Descrição
            </label>
            <textarea
              className={`${inputClassName} min-h-28 resize-y`}
              disabled={props.busy}
              id="entity-type-description"
              onChange={(event) => update('description', event.target.value)}
              placeholder="Explique quando este tipo deve ser usado."
              value={values.description}
            />
          </div>

          <div className="space-y-6">
            <IconPicker
              disabled={props.busy}
              id="entity-type-icon"
              onChange={(value) => update('icon', value)}
              value={iconPickerValue(values.icon)}
            />
            <ColorPicker
              disabled={props.busy}
              id="entity-type-color"
              onChange={(value) => update('color', value ?? '')}
              value={values.color === '' ? null : values.color}
            />
          </div>

          {props.error === null && validationError === null ? null : (
            <p
              aria-live="assertive"
              className="rounded-xl border semantic-danger-border semantic-danger-surface px-4 py-3 text-sm semantic-error-text"
              role="alert"
            >
              {props.error ?? validationError}
            </p>
          )}

          <FormActions>
            <Button disabled={props.busy} onClick={props.onCancel}>
              Cancelar
            </Button>
            <Button busy={props.busy} type="submit" variant="primary">
              {props.busy
                ? 'Salvando tipo…'
                : props.mode === 'create'
                  ? 'Criar tipo de entidade'
                  : 'Salvar tipo de entidade'}
            </Button>
          </FormActions>
        </form>
      </div>
    </section>
  );
}

export type EntityTypeFormIconValue = IconId | null | { readonly legacy: string };

function TextField({
  autoFocus = false,
  disabled,
  id,
  inputMode,
  label,
  min,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  value,
}: {
  autoFocus?: boolean;
  disabled: boolean;
  id: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  label: string;
  min?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: React.HTMLInputTypeAttribute;
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <label className={labelClassName} htmlFor={id}>
        {label} {required ? <span className="semantic-accent-text">*</span> : null}
      </label>
      <input
        autoFocus={autoFocus}
        className={inputClassName}
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </div>
  );
}

export function toCreateEntityTypeValues(values: FormValues): EntityTypeCreateValues {
  return {
    name: values.name.trim(),
    singularName: values.singularName.trim(),
    ...optionalValue('description', values.description),
    ...optionalIconValue(values.icon),
    ...optionalColorValue(values.color),
  };
}

export function toEntityTypePatch(
  values: FormValues,
  entityType: EntityType,
): EntityTypePatch | null {
  const patch: EntityTypePatch = {};
  assignTextChange(patch, 'name', values.name, entityType.name);
  assignTextChange(patch, 'singularName', values.singularName, entityType.singularName);
  assignNullableChange(patch, 'description', values.description, entityType.description);
  assignNullableIconChange(patch, values.icon, entityType.icon);
  assignNullableColorChange(patch, values.color, entityType.color);
  return Object.keys(patch).length === 0 ? null : patch;
}

function toFormValues(entityType: EntityType): FormValues {
  return {
    name: entityType.name,
    singularName: entityType.singularName,
    description: entityType.description ?? '',
    icon: toFormIconValue(entityType.icon),
    color: entityType.color ?? '',
  };
}

function assignTextChange(
  patch: EntityTypePatch,
  field: 'name' | 'singularName',
  value: string,
  currentValue: string,
): void {
  const trimmed = value.trim();
  if (trimmed !== currentValue) patch[field] = trimmed;
}

function assignNullableChange(
  patch: EntityTypePatch,
  field: 'description' | 'color',
  value: string,
  currentValue: string | null,
): void {
  const trimmed = value.trim();
  const normalized = trimmed === '' ? null : trimmed;
  if (normalized !== currentValue) patch[field] = normalized;
}

function assignNullableIconChange(
  patch: EntityTypePatch,
  value: EntityTypeFormIconValue,
  currentValue: string | null,
): void {
  if (typeof value === 'object' && value !== null) {
    if (value.legacy === currentValue) return;
    throw new Error('Um ícone legado somente pode ser preservado sem alterações.');
  }
  if (value !== currentValue) patch.icon = value;
}

function optionalValue(
  field: 'description',
  value: string,
): Partial<Record<'description', string>> {
  const trimmed = value.trim();
  return trimmed === '' ? {} : { [field]: trimmed };
}

function optionalColorValue(value: string): { color?: string } {
  const trimmed = value.trim();
  return trimmed === '' ? {} : { color: normalizeHexColor(trimmed) };
}

function assignNullableColorChange(
  patch: EntityTypePatch,
  value: string,
  currentValue: string | null,
): void {
  if (value === currentValue) return;
  const trimmed = value.trim();
  const normalized = trimmed === '' ? null : trimmed;
  patch.color = normalized === null ? null : normalizeHexColor(normalized);
}

function optionalIconValue(value: EntityTypeFormIconValue): { icon?: IconId } {
  if (value === null) return {};
  if (typeof value === 'object')
    throw new Error('Um ícone legado não pode ser usado na criação de um tipo de entidade.');
  return { icon: value };
}

function toFormIconValue(value: string | null): EntityTypeFormIconValue {
  if (value === null) return null;
  const parsed = iconIdSchema.safeParse(value);
  return parsed.success ? parsed.data : { legacy: value };
}

function iconPickerValue(value: EntityTypeFormIconValue): string | null {
  return typeof value === 'object' && value !== null ? value.legacy : value;
}

const labelClassName = 'block text-sm font-semibold semantic-text-primary';
const inputClassName =
  'mt-2 w-full rounded-xl border semantic-border semantic-surface px-4 py-3 semantic-text-primary shadow-sm outline-none semantic-placeholder semantic-focus-border focus:ring-3 semantic-focus-ring semantic-disabled-surface semantic-disabled-text';
