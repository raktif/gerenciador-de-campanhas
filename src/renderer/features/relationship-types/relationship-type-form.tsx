import { useState } from 'react';
import type { EntityType } from '../../../core/contracts/entity-types';
import type {
  CreateRelationshipTypeInput,
  RelationshipType,
  RelationshipTypePatch,
} from '../../../core/contracts/relationship-types';

export type RelationshipTypeCreateValues = Omit<CreateRelationshipTypeInput, 'campaignId'>;

interface FormValues {
  name: string;
  slug: string;
  inverseName: string;
  description: string;
  semanticRole: string;
  isSymmetric: boolean;
  allowedSourceTypeIds: string[];
  allowedTargetTypeIds: string[];
  icon: string;
  color: string;
  sortOrder: string;
}

type Props = {
  busy: boolean;
  entityTypes: EntityType[];
  error: string | null;
  onCancel: () => void;
} & (
  | { mode: 'create'; onSubmit: (values: RelationshipTypeCreateValues) => Promise<void> }
  | {
      mode: 'edit';
      relationshipType: RelationshipType;
      onSubmit: (patch: RelationshipTypePatch) => Promise<void>;
    }
);

export function RelationshipTypeForm(props: Props): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() =>
    props.mode === 'create' ? emptyValues() : toFormValues(props.relationshipType),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function update<Key extends keyof FormValues>(field: Key, value: FormValues[Key]): void {
    setValidationError(null);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    if (!Number.isInteger(Number(values.sortOrder)) || Number(values.sortOrder) < 0) {
      setValidationError('A ordem deve ser um número inteiro maior ou igual a zero.');
      return;
    }
    if (props.mode === 'create') {
      void props.onSubmit(toCreateValues(values));
      return;
    }
    const patch = toPatch(values, props.relationshipType);
    if (patch === null) {
      setValidationError('Altere ao menos um campo antes de salvar.');
      return;
    }
    void props.onSubmit(patch);
  }

  return (
    <section aria-labelledby="relationship-type-form-title" className="mx-auto w-full max-w-5xl">
      <button className={backClass} disabled={props.busy} onClick={props.onCancel} type="button">
        ← Voltar para tipos de relação
      </button>
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-200 bg-stone-50 px-8 py-7">
          <p className="text-xs font-bold tracking-[0.2em] text-amber-800 uppercase">
            Estrutura do grafo
          </p>
          <h1 id="relationship-type-form-title" className="mt-2 text-3xl font-semibold">
            {props.mode === 'create'
              ? 'Novo tipo de relação'
              : `Editar ${props.relationshipType.name}`}
          </h1>
          <p className="mt-3 text-slate-600">
            Defina como a conexão será apresentada em cada direção e quais entidades poderão usá-la.
          </p>
        </header>
        <form className="space-y-8 px-8 py-8" onSubmit={submit}>
          {props.error === null && validationError === null ? null : (
            <p
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              {validationError ?? props.error}
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <TextField
              autoFocus
              disabled={props.busy}
              label="Nome"
              onChange={(value) => update('name', value)}
              required
              value={values.name}
            />
            <TextField
              disabled={props.busy}
              label="Slug"
              onChange={(value) => update('slug', value)}
              placeholder="ex.: trabalha-em"
              required
              value={values.slug}
            />
            <TextField
              disabled={props.busy}
              label="Nome inverso"
              onChange={(value) => update('inverseName', value)}
              placeholder="ex.: emprega"
              value={values.inverseName}
            />
            <TextField
              disabled={props.busy}
              label="Papel semântico"
              onChange={(value) => update('semanticRole', value)}
              placeholder="ex.: belongs_to"
              value={values.semanticRole}
            />
            <TextField
              disabled={props.busy}
              label="Ícone"
              onChange={(value) => update('icon', value)}
              value={values.icon}
            />
            <TextField
              disabled={props.busy}
              label="Cor"
              onChange={(value) => update('color', value)}
              placeholder="#92400e"
              value={values.color}
            />
            <TextField
              disabled={props.busy}
              label="Ordem"
              onChange={(value) => update('sortOrder', value)}
              type="number"
              value={values.sortOrder}
            />
          </div>

          <label className="block text-sm font-semibold text-slate-800">
            Descrição
            <textarea
              className={`${inputClass} min-h-28 resize-y`}
              disabled={props.busy}
              maxLength={2000}
              onChange={(event) => update('description', event.target.value)}
              value={values.description}
            />
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-stone-200 p-5">
            <input
              checked={values.isSymmetric}
              className="mt-1 size-4 accent-amber-700"
              disabled={props.busy}
              onChange={(event) => update('isSymmetric', event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-semibold text-slate-900">Relação simétrica</span>
              <span className="mt-1 block text-sm text-slate-600">
                A conexão representa o mesmo vínculo nos dois sentidos. O nome inverso é opcional.
              </span>
            </span>
          </label>

          <div className="grid gap-6 lg:grid-cols-2">
            <EntityTypeChoices
              disabled={props.busy}
              entityTypes={props.entityTypes}
              label="Tipos permitidos na origem"
              onChange={(ids) => update('allowedSourceTypeIds', ids)}
              selected={values.allowedSourceTypeIds}
            />
            <EntityTypeChoices
              disabled={props.busy}
              entityTypes={props.entityTypes}
              label="Tipos permitidos no destino"
              onChange={(ids) => update('allowedTargetTypeIds', ids)}
              selected={values.allowedTargetTypeIds}
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-stone-200 pt-6">
            <button
              className={secondaryClass}
              disabled={props.busy}
              onClick={props.onCancel}
              type="button"
            >
              Cancelar
            </button>
            <button className={primaryClass} disabled={props.busy} type="submit">
              {props.busy
                ? 'Salvando…'
                : props.mode === 'create'
                  ? 'Criar tipo'
                  : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function EntityTypeChoices({
  disabled,
  entityTypes,
  label,
  onChange,
  selected,
}: {
  disabled: boolean;
  entityTypes: EntityType[];
  label: string;
  onChange: (ids: string[]) => void;
  selected: string[];
}): React.JSX.Element {
  return (
    <fieldset className="rounded-2xl border border-stone-200 p-5">
      <legend className="px-2 font-semibold text-slate-900">{label}</legend>
      <p className="mb-4 text-sm text-slate-600">Nenhuma seleção significa sem restrição.</p>
      {entityTypes.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum tipo de entidade ativo.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {entityTypes.map((entityType) => (
            <label className="flex items-center gap-3 text-sm" key={entityType.id}>
              <input
                checked={selected.includes(entityType.id)}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, entityType.id]
                      : selected.filter((id) => id !== entityType.id),
                  )
                }
                type="checkbox"
              />
              {entityType.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function TextField({
  autoFocus = false,
  disabled,
  label,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  value,
}: {
  autoFocus?: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: React.HTMLInputTypeAttribute;
  value: string;
}): React.JSX.Element {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label} {required ? <span className="text-amber-800">*</span> : null}
      <input
        autoFocus={autoFocus}
        className={inputClass}
        disabled={disabled}
        min={type === 'number' ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function emptyValues(): FormValues {
  return {
    name: '',
    slug: '',
    inverseName: '',
    description: '',
    semanticRole: '',
    isSymmetric: false,
    allowedSourceTypeIds: [],
    allowedTargetTypeIds: [],
    icon: '',
    color: '',
    sortOrder: '0',
  };
}
function toFormValues(type: RelationshipType): FormValues {
  return {
    name: type.name,
    slug: type.slug,
    inverseName: type.inverseName ?? '',
    description: type.description ?? '',
    semanticRole: type.semanticRole ?? '',
    isSymmetric: type.isSymmetric,
    allowedSourceTypeIds: type.allowedSourceTypeIds ?? [],
    allowedTargetTypeIds: type.allowedTargetTypeIds ?? [],
    icon: type.icon ?? '',
    color: type.color ?? '',
    sortOrder: String(type.sortOrder),
  };
}
export function toCreateValues(values: FormValues): RelationshipTypeCreateValues {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    inverseName: nullable(values.inverseName),
    description: nullable(values.description),
    semanticRole: nullable(values.semanticRole),
    isSymmetric: values.isSymmetric,
    allowedSourceTypeIds: nullableIds(values.allowedSourceTypeIds),
    allowedTargetTypeIds: nullableIds(values.allowedTargetTypeIds),
    icon: nullable(values.icon),
    color: nullable(values.color),
    sortOrder: Number(values.sortOrder),
  };
}
export function toPatch(
  values: FormValues,
  current: RelationshipType,
): RelationshipTypePatch | null {
  const next = toCreateValues(values);
  const patch: RelationshipTypePatch = {};
  for (const field of [
    'name',
    'slug',
    'inverseName',
    'description',
    'semanticRole',
    'isSymmetric',
    'icon',
    'color',
    'sortOrder',
  ] as const)
    if (next[field] !== current[field]) Object.assign(patch, { [field]: next[field] });
  if (!sameIds(next.allowedSourceTypeIds, current.allowedSourceTypeIds))
    patch.allowedSourceTypeIds = next.allowedSourceTypeIds;
  if (!sameIds(next.allowedTargetTypeIds, current.allowedTargetTypeIds))
    patch.allowedTargetTypeIds = next.allowedTargetTypeIds;
  return Object.keys(patch).length === 0 ? null : patch;
}
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
function nullableIds(ids: string[]): string[] | null {
  return ids.length === 0 ? null : [...ids].sort();
}
function sameIds(left: string[] | null, right: string[] | null): boolean {
  return (
    JSON.stringify(left === null ? null : [...left].sort()) ===
    JSON.stringify(right === null ? null : [...right].sort())
  );
}

const inputClass =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none focus:border-amber-700 focus:ring-3 focus:ring-amber-700/15 disabled:bg-stone-100';
const primaryClass =
  'rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white hover:bg-amber-800 disabled:opacity-60';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-stone-50 disabled:opacity-60';
const backClass =
  'mb-6 inline-flex rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:text-slate-950';
