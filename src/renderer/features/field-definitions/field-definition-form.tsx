import { useState } from 'react';
import {
  fieldDataTypes,
  fieldSemanticRoles,
  type CreateFieldDefinitionInputRequest,
  type FieldDefinition,
  type FieldDefinitionPatch,
} from '../../../core/contracts/field-definitions';

export type FieldDefinitionCreateValues = Omit<
  CreateFieldDefinitionInputRequest,
  'campaignId' | 'entityTypeId'
>;

type FormProps = {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
} & (
  | { mode: 'create'; onSubmit: (values: FieldDefinitionCreateValues) => Promise<void> }
  | {
      mode: 'edit';
      field: FieldDefinition;
      onSubmit: (patch: FieldDefinitionPatch) => Promise<void>;
    }
);

interface FormValues {
  key: string;
  label: string;
  description: string;
  dataType: FieldDefinition['dataType'];
  semanticRole: string;
  required: boolean;
  searchable: boolean;
  secretByDefault: boolean;
  defaultValue: string;
  options: string;
  validation: string;
  referenceRelationshipTypeId: string;
  referenceDirection: string;
  allowedTargetTypeIds: string;
  onDeleteBehavior: string;
  sortOrder: string;
}

export function FieldDefinitionForm(props: FormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() =>
    props.mode === 'create' ? emptyValues : toFormValues(props.field),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function update<Field extends keyof FormValues>(field: Field, value: FormValues[Field]): void {
    setValidationError(null);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    try {
      const normalized = normalize(values);
      if (props.mode === 'create') {
        void props.onSubmit(normalized);
        return;
      }
      const patch = createPatch(normalized, props.field);
      if (Object.keys(patch).length === 0) {
        setValidationError('Altere ao menos um campo antes de salvar.');
        return;
      }
      void props.onSubmit(patch);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Configuração inválida.');
    }
  }

  function updateDataType(value: FieldDefinition['dataType']): void {
    setValidationError(null);
    setValues((current) => ({
      ...current,
      dataType: value,
      ...(value.startsWith('entity_reference')
        ? {}
        : {
            referenceRelationshipTypeId: '',
            referenceDirection: '',
            allowedTargetTypeIds: '',
            onDeleteBehavior: '',
          }),
    }));
  }

  const isReference = values.dataType.startsWith('entity_reference');
  return (
    <section className="mx-auto w-full max-w-5xl" aria-labelledby="field-form-title">
      <button className={backClass} disabled={props.busy} onClick={props.onCancel} type="button">
        ← Voltar para definições de campo
      </button>
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-200 bg-stone-50 px-8 py-7">
          <p className="text-xs font-bold tracking-[0.2em] text-amber-800 uppercase">
            {props.mode === 'create' ? 'Nova definição de campo' : 'Editar definição de campo'}
          </p>
          <h1 id="field-form-title" className="mt-2 text-3xl font-semibold">
            {props.mode === 'create' ? 'Configure um atributo reutilizável' : props.field.label}
          </h1>
        </header>
        <form className="space-y-7 px-8 py-8" onSubmit={submit}>
          <div className="grid gap-6 md:grid-cols-2">
            <TextInput
              label="Rótulo"
              value={values.label}
              onChange={(v) => update('label', v)}
              required
            />
            <TextInput
              label="Chave"
              value={values.key}
              onChange={(v) => update('key', v)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="field-description">
              Descrição
            </label>
            <textarea
              className={`${inputClass} min-h-24`}
              id="field-description"
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Select
              label="Tipo de dado"
              value={values.dataType}
              onChange={(v) => updateDataType(v as FieldDefinition['dataType'])}
              options={fieldDataTypes.map((value) => [value, dataTypeLabel(value)])}
            />
            <Select
              label="Papel semântico"
              value={values.semanticRole}
              onChange={(v) => update('semanticRole', v)}
              options={[
                ['', 'Nenhum'],
                ...fieldSemanticRoles.map((value) => [value, value] as const),
              ]}
            />
            <TextInput
              label="Ordem"
              value={values.sortOrder}
              onChange={(v) => update('sortOrder', v)}
              type="number"
              required
            />
          </div>
          <div className="flex flex-wrap gap-6 rounded-2xl bg-stone-50 p-5">
            <Check
              label="Obrigatório"
              checked={values.required}
              onChange={(v) => update('required', v)}
            />
            <Check
              label="Pesquisável"
              checked={values.searchable}
              onChange={(v) => update('searchable', v)}
            />
            <Check
              label="Secreto por padrão"
              checked={values.secretByDefault}
              onChange={(v) => update('secretByDefault', v)}
            />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <JsonInput
              label="Valor padrão (JSON)"
              value={values.defaultValue}
              onChange={(v) => update('defaultValue', v)}
            />
            <JsonInput
              label="Opções (JSON)"
              value={values.options}
              onChange={(v) => update('options', v)}
            />
            <JsonInput
              label="Validação (JSON)"
              value={values.validation}
              onChange={(v) => update('validation', v)}
            />
          </div>
          {isReference ? (
            <fieldset className="grid gap-6 rounded-2xl border border-stone-200 p-5 md:grid-cols-2">
              <legend className="px-2 font-semibold">Configuração da referência</legend>
              <TextInput
                label="ID do tipo de relacionamento"
                value={values.referenceRelationshipTypeId}
                onChange={(v) => update('referenceRelationshipTypeId', v)}
              />
              <Select
                label="Direção"
                value={values.referenceDirection}
                onChange={(v) => update('referenceDirection', v)}
                options={[
                  ['', 'Nenhuma'],
                  ['outgoing', 'Saída'],
                  ['incoming', 'Entrada'],
                ]}
              />
              <TextInput
                label="IDs dos tipos permitidos (separados por vírgula)"
                value={values.allowedTargetTypeIds}
                onChange={(v) => update('allowedTargetTypeIds', v)}
              />
              <Select
                label="Ao excluir"
                value={values.onDeleteBehavior}
                onChange={(v) => update('onDeleteBehavior', v)}
                options={[
                  ['', 'Nenhum'],
                  ['restrict', 'Impedir'],
                  ['unlink', 'Desvincular'],
                ]}
              />
            </fieldset>
          ) : null}
          {props.error === null && validationError === null ? null : (
            <p
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              {props.error ?? validationError}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t border-stone-200 pt-7">
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
                  ? 'Criar definição de campo'
                  : 'Salvar definição de campo'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function normalize(values: FormValues): FieldDefinitionCreateValues {
  return {
    key: values.key.trim(),
    label: values.label.trim(),
    description: nullable(values.description),
    dataType: values.dataType,
    semanticRole:
      values.semanticRole === '' ? null : (values.semanticRole as FieldDefinition['semanticRole']),
    required: values.required,
    searchable: values.searchable,
    secretByDefault: values.secretByDefault,
    defaultValue: json(values.defaultValue, 'Valor padrão'),
    options: json(values.options, 'Opções'),
    validation: json(values.validation, 'Validação'),
    referenceRelationshipTypeId: nullable(values.referenceRelationshipTypeId),
    referenceDirection:
      values.referenceDirection === ''
        ? null
        : (values.referenceDirection as FieldDefinition['referenceDirection']),
    allowedTargetTypeIds:
      values.allowedTargetTypeIds.trim() === ''
        ? null
        : values.allowedTargetTypeIds.split(',').map((id) => id.trim()),
    onDeleteBehavior:
      values.onDeleteBehavior === ''
        ? null
        : (values.onDeleteBehavior as FieldDefinition['onDeleteBehavior']),
    sortOrder: Number(values.sortOrder),
  };
}

function createPatch(
  values: FieldDefinitionCreateValues,
  current: FieldDefinition,
): FieldDefinitionPatch {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (JSON.stringify(value) !== JSON.stringify(current[key as keyof FieldDefinition]))
      patch[key] = value;
  }
  return patch;
}

function toFormValues(field: FieldDefinition): FormValues {
  return {
    key: field.key,
    label: field.label,
    description: field.description ?? '',
    dataType: field.dataType,
    semanticRole: field.semanticRole ?? '',
    required: field.required,
    searchable: field.searchable,
    secretByDefault: field.secretByDefault,
    defaultValue: displayJson(field.defaultValue),
    options: displayJson(field.options),
    validation: displayJson(field.validation),
    referenceRelationshipTypeId: field.referenceRelationshipTypeId ?? '',
    referenceDirection: field.referenceDirection ?? '',
    allowedTargetTypeIds: field.allowedTargetTypeIds?.join(', ') ?? '',
    onDeleteBehavior: field.onDeleteBehavior ?? '',
    sortOrder: String(field.sortOrder),
  };
}

const emptyValues: FormValues = {
  key: '',
  label: '',
  description: '',
  dataType: 'short_text',
  semanticRole: '',
  required: false,
  searchable: false,
  secretByDefault: false,
  defaultValue: '',
  options: '',
  validation: '',
  referenceRelationshipTypeId: '',
  referenceDirection: '',
  allowedTargetTypeIds: '',
  onDeleteBehavior: '',
  sortOrder: '0',
};
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
function json(value: string, label: string): FieldDefinition['defaultValue'] {
  if (value.trim() === '') return null;
  try {
    return JSON.parse(value) as FieldDefinition['defaultValue'];
  } catch {
    throw new Error(`${label} deve conter JSON válido.`);
  }
}
function displayJson(value: unknown): string {
  return value === null ? '' : JSON.stringify(value);
}
function dataTypeLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function TextInput({
  label,
  value,
  onChange,
  required = false,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}): React.JSX.Element {
  return (
    <label className={labelClass}>
      {label}
      {required ? ' *' : ''}
      <input
        className={inputClass}
        min={type === 'number' ? 0 : undefined}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
function JsonInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className={labelClass}>
      {props.label}
      <textarea
        className={`${inputClass} min-h-24 font-mono text-sm`}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder='{"exemplo": true}'
        value={props.value}
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
}): React.JSX.Element {
  return (
    <label className={labelClass}>
      {label}
      <select className={inputClass} onChange={(e) => onChange(e.target.value)} value={value}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input checked={checked} onChange={(e) => onChange(e.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}
const labelClass = 'block text-sm font-semibold text-slate-800';
const inputClass =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal text-slate-950 outline-none focus:border-amber-700 focus:ring-3 focus:ring-amber-700/15';
const primaryClass =
  'rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white disabled:opacity-60';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 disabled:opacity-60';
const backClass = 'mb-6 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600';
