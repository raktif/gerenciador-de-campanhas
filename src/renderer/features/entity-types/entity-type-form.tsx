import { useState } from 'react';
import type {
  CreateEntityTypeInputRequest,
  EntityType,
  EntityTypePatch,
} from '../../../core/contracts/entity-types';

export type EntityTypeCreateValues = Omit<CreateEntityTypeInputRequest, 'campaignId'>;

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
  slug: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: string;
}

const emptyValues: FormValues = {
  name: '',
  singularName: '',
  slug: '',
  description: '',
  icon: '',
  color: '',
  sortOrder: '0',
};

const stableKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function EntityTypeForm(props: EntityTypeFormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() =>
    props.mode === 'create' ? emptyValues : toFormValues(props.entityType),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function update(field: keyof FormValues, value: string): void {
    setValidationError(null);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    if (!stableKeyPattern.test(values.slug.trim())) {
      setValidationError(
        'O identificador deve usar apenas letras minúsculas sem acentos, números e hífens simples.',
      );
      return;
    }
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
      <button
        className={backButtonClassName}
        disabled={props.busy}
        onClick={props.onCancel}
        type="button"
      >
        <span aria-hidden="true">←</span>
        Voltar para tipos de entidade
      </button>

      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)]">
        <header className="border-b border-stone-200 bg-stone-50 px-8 py-7 sm:px-10">
          <p className="text-xs font-bold tracking-[0.2em] text-amber-800 uppercase">
            {props.mode === 'create' ? 'Novo tipo de entidade' : 'Editar tipo de entidade'}
          </p>
          <h1 id="entity-type-form-title" className="mt-2 text-3xl font-semibold tracking-tight">
            {props.mode === 'create' ? 'Defina uma categoria do seu mundo' : props.entityType.name}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
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

          <div className="grid gap-6 md:grid-cols-[1fr_10rem]">
            <TextField
              disabled={props.busy}
              id="entity-type-slug"
              label="Identificador (slug)"
              onChange={(value) => update('slug', value)}
              placeholder="personagens"
              required
              value={values.slug}
            />
            <TextField
              disabled={props.busy}
              id="entity-type-sort-order"
              inputMode="numeric"
              label="Ordem"
              min="0"
              onChange={(value) => update('sortOrder', value)}
              required
              type="number"
              value={values.sortOrder}
            />
          </div>
          <p className="-mt-5 text-xs text-slate-500">
            Use letras minúsculas, números e hífens simples no identificador.
          </p>

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

          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              disabled={props.busy}
              id="entity-type-icon"
              label="Ícone ou símbolo"
              onChange={(value) => update('icon', value)}
              placeholder="Ex.: ◈"
              value={values.icon}
            />
            <TextField
              disabled={props.busy}
              id="entity-type-color"
              label="Cor"
              onChange={(value) => update('color', value)}
              placeholder="Ex.: #92400e"
              value={values.color}
            />
          </div>

          {props.error === null && validationError === null ? null : (
            <p
              aria-live="assertive"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {props.error ?? validationError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-7">
            <button
              className={secondaryButtonClassName}
              disabled={props.busy}
              onClick={props.onCancel}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60"
              disabled={props.busy}
              type="submit"
            >
              {props.busy
                ? 'Salvando tipo…'
                : props.mode === 'create'
                  ? 'Criar tipo de entidade'
                  : 'Salvar tipo de entidade'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

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
        {label} {required ? <span className="text-amber-800">*</span> : null}
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
    slug: values.slug.trim(),
    sortOrder: Number(values.sortOrder),
    ...optionalValue('description', values.description),
    ...optionalValue('icon', values.icon),
    ...optionalValue('color', values.color),
  };
}

export function toEntityTypePatch(
  values: FormValues,
  entityType: EntityType,
): EntityTypePatch | null {
  const patch: EntityTypePatch = {};
  assignTextChange(patch, 'name', values.name, entityType.name);
  assignTextChange(patch, 'singularName', values.singularName, entityType.singularName);
  assignTextChange(patch, 'slug', values.slug, entityType.slug);
  assignNullableChange(patch, 'description', values.description, entityType.description);
  assignNullableChange(patch, 'icon', values.icon, entityType.icon);
  assignNullableChange(patch, 'color', values.color, entityType.color);
  const sortOrder = Number(values.sortOrder);
  if (sortOrder !== entityType.sortOrder) patch.sortOrder = sortOrder;
  return Object.keys(patch).length === 0 ? null : patch;
}

function toFormValues(entityType: EntityType): FormValues {
  return {
    name: entityType.name,
    singularName: entityType.singularName,
    slug: entityType.slug,
    description: entityType.description ?? '',
    icon: entityType.icon ?? '',
    color: entityType.color ?? '',
    sortOrder: String(entityType.sortOrder),
  };
}

function assignTextChange(
  patch: EntityTypePatch,
  field: 'name' | 'singularName' | 'slug',
  value: string,
  currentValue: string,
): void {
  const trimmed = value.trim();
  if (trimmed !== currentValue) patch[field] = trimmed;
}

function assignNullableChange(
  patch: EntityTypePatch,
  field: 'description' | 'icon' | 'color',
  value: string,
  currentValue: string | null,
): void {
  const trimmed = value.trim();
  const normalized = trimmed === '' ? null : trimmed;
  if (normalized !== currentValue) patch[field] = normalized;
}

function optionalValue(
  field: 'description' | 'icon' | 'color',
  value: string,
): Partial<Record<'description' | 'icon' | 'color', string>> {
  const trimmed = value.trim();
  return trimmed === '' ? {} : { [field]: trimmed };
}

const labelClassName = 'block text-sm font-semibold text-slate-800';
const inputClassName =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-amber-700 focus:ring-3 focus:ring-amber-700/15 disabled:bg-stone-100 disabled:text-slate-500';
const backButtonClassName =
  'mb-6 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const secondaryButtonClassName =
  'rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60';
