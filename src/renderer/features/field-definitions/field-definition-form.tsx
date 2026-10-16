import { useEffect, useId, useRef, useState } from 'react';
import { Button, FormActions } from '../../components/actions';
import { ContextualHelp, type ContextualHelpContent } from '../../components/contextual-help';
import { contextualHelpCatalog } from '../../content/contextual-help';
import {
  fieldDataTypes,
  fieldSemanticRoles,
  type CreateFieldDefinitionInputRequest,
  type FieldDefinition,
  type FieldDefinitionPatch,
} from '../../../core/contracts/field-definitions';
import type { EntityType } from '../../../core/contracts/entity-types';
import type { RelationshipType } from '../../../core/contracts/relationship-types';

export type FieldDefinitionCreateValues = Omit<
  CreateFieldDefinitionInputRequest,
  'campaignId' | 'entityTypeId'
>;

type FormProps = {
  campaignId: string;
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
  label: string;
  description: string;
  helpText: string;
  exampleText: string;
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
  allowedTargetTypeIds: string[];
  onDeleteBehavior: string;
}

export function FieldDefinitionForm(props: FormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() =>
    props.mode === 'create' ? emptyValues : toFormValues(props.field),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [referenceOptions, setReferenceOptions] = useState<{
    entityTypes: EntityType[];
    relationshipTypes: RelationshipType[];
  }>({ entityTypes: [], relationshipTypes: [] });
  const [referenceOptionsState, setReferenceOptionsState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [referenceOptionsAttempt, setReferenceOptionsAttempt] = useState(0);
  const referenceOptionsRequest = useRef(0);

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
            allowedTargetTypeIds: [],
            onDeleteBehavior: '',
          }),
    }));
  }

  const isReference = values.dataType.startsWith('entity_reference');
  useEffect(() => {
    if (!isReference) {
      setReferenceOptionsState('idle');
      return;
    }
    const requestId = referenceOptionsRequest.current + 1;
    referenceOptionsRequest.current = requestId;
    setReferenceOptions({ entityTypes: [], relationshipTypes: [] });
    setReferenceOptionsState('loading');
    void (async () => {
      try {
        const [relationshipResult, entityResult] = await Promise.all([
          window.campaignManager.relationshipTypes.list({
            campaignId: props.campaignId,
            limit: 100,
            filters: { isArchived: false },
          }),
          window.campaignManager.entityTypes.list({
            campaignId: props.campaignId,
            limit: 100,
            filters: { isArchived: false },
          }),
        ]);
        if (requestId !== referenceOptionsRequest.current) return;
        if (!relationshipResult.ok || !entityResult.ok) {
          setReferenceOptionsState('error');
          return;
        }
        setReferenceOptions({
          relationshipTypes: relationshipResult.data.items,
          entityTypes: entityResult.data.items,
        });
        setReferenceOptionsState('ready');
      } catch {
        if (requestId !== referenceOptionsRequest.current) return;
        setReferenceOptionsState('error');
      }
    })();
    return () => {
      referenceOptionsRequest.current += 1;
    };
  }, [isReference, props.campaignId, referenceOptionsAttempt]);

  const selectedRelationshipType = referenceOptions.relationshipTypes.find(
    ({ id }) => id === values.referenceRelationshipTypeId,
  );
  const allowedEntityTypes = referenceOptions.entityTypes.filter((entityType) => {
    if (selectedRelationshipType === undefined || values.referenceDirection === '') return true;
    const allowedIds =
      values.referenceDirection === 'outgoing'
        ? selectedRelationshipType.allowedTargetTypeIds
        : selectedRelationshipType.allowedSourceTypeIds;
    return allowedIds === null || allowedIds.includes(entityType.id);
  });
  const referenceOptionsBusy = props.busy || referenceOptionsState === 'loading';
  const referenceOptionsUnavailable = isReference && referenceOptionsState !== 'ready';
  return (
    <section className="mx-auto w-full max-w-5xl" aria-labelledby="field-form-title">
      <Button
        className="mb-6"
        disabled={props.busy}
        onClick={props.onCancel}
        size="small"
        variant="ghost"
      >
        ← Voltar para definições de campo
      </Button>
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
          <TextInput
            autoFocus
            describedBy={props.mode === 'create' ? 'field-key-generation-help' : undefined}
            id="field-label"
            label="Rótulo"
            value={values.label}
            onChange={(v) => update('label', v)}
            required
          />
          {props.mode === 'create' ? (
            <p className="-mt-5 text-sm text-slate-600" id="field-key-generation-help">
              A chave técnica será gerada automaticamente ao criar o campo.
            </p>
          ) : null}
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
          <div className="grid gap-6 md:grid-cols-2">
            <TextArea
              label="Texto de ajuda"
              maxLength={2000}
              value={values.helpText}
              onChange={(v) => update('helpText', v)}
            />
            <TextArea
              label="Exemplo"
              maxLength={2000}
              value={values.exampleText}
              onChange={(v) => update('exampleText', v)}
            />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Select
              help={contextualHelpCatalog['fieldDefinition.dataType']}
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
              <Select
                disabled={referenceOptionsBusy || referenceOptionsState === 'error'}
                label="Tipo de relacionamento"
                value={values.referenceRelationshipTypeId}
                onChange={(v) => {
                  update('referenceRelationshipTypeId', v);
                  update('allowedTargetTypeIds', []);
                }}
                options={[
                  ['', 'Selecione'],
                  ...relationshipOptions(referenceOptions.relationshipTypes, values),
                ]}
              />
              <Select
                disabled={referenceOptionsBusy}
                label="Direção"
                value={values.referenceDirection}
                onChange={(v) => {
                  update('referenceDirection', v);
                  update('allowedTargetTypeIds', []);
                }}
                options={[
                  ['', 'Nenhuma'],
                  ['outgoing', 'Saída'],
                  ['incoming', 'Entrada'],
                ]}
              />
              <EntityTypeChoices
                disabled={referenceOptionsBusy || referenceOptionsState === 'error'}
                entityTypes={allowedEntityTypes}
                label="Tipos de entidade permitidos"
                onChange={(v) => update('allowedTargetTypeIds', v)}
                selected={values.allowedTargetTypeIds}
              />
              <Select
                disabled={props.busy}
                label="Ao excluir"
                value={values.onDeleteBehavior}
                onChange={(v) => update('onDeleteBehavior', v)}
                options={[
                  ['', 'Nenhum'],
                  ['restrict', 'Impedir'],
                  ['unlink', 'Desvincular'],
                ]}
              />
              {referenceOptionsState === 'loading' ? (
                <p className="text-sm text-slate-600 md:col-span-2" role="status">
                  Carregando opções de referência…
                </p>
              ) : referenceOptionsState === 'error' ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 md:col-span-2"
                  role="alert"
                >
                  <p>Não foi possível carregar as opções de referência.</p>
                  <Button
                    className="mt-3"
                    disabled={props.busy}
                    onClick={() => setReferenceOptionsAttempt((attempt) => attempt + 1)}
                    size="small"
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : null}
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
          <FormActions>
            <Button disabled={props.busy} onClick={props.onCancel}>
              Cancelar
            </Button>
            <Button
              busy={props.busy}
              disabled={props.busy || referenceOptionsUnavailable}
              type="submit"
              variant="primary"
            >
              {props.busy
                ? 'Salvando…'
                : props.mode === 'create'
                  ? 'Criar definição de campo'
                  : 'Salvar definição de campo'}
            </Button>
          </FormActions>
        </form>
      </div>
    </section>
  );
}

function normalize(values: FormValues): FieldDefinitionCreateValues {
  return {
    label: values.label.trim(),
    description: nullable(values.description),
    helpText: nullable(values.helpText),
    exampleText: nullable(values.exampleText),
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
      values.allowedTargetTypeIds.length === 0 ? null : values.allowedTargetTypeIds,
    onDeleteBehavior:
      values.onDeleteBehavior === ''
        ? null
        : (values.onDeleteBehavior as FieldDefinition['onDeleteBehavior']),
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
    label: field.label,
    description: field.description ?? '',
    helpText: field.helpText ?? '',
    exampleText: field.exampleText ?? '',
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
    allowedTargetTypeIds: field.allowedTargetTypeIds ?? [],
    onDeleteBehavior: field.onDeleteBehavior ?? '',
  };
}

const emptyValues: FormValues = {
  label: '',
  description: '',
  helpText: '',
  exampleText: '',
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
  allowedTargetTypeIds: [],
  onDeleteBehavior: '',
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
  autoFocus = false,
  describedBy,
  id,
  label,
  value,
  onChange,
  required = false,
  type = 'text',
}: {
  autoFocus?: boolean;
  describedBy?: string | undefined;
  id?: string;
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
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        className={inputClass}
        id={id}
        min={type === 'number' ? 0 : undefined}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
function TextArea({
  label,
  maxLength,
  value,
  onChange,
}: {
  label: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className={labelClass}>
      {label}
      <textarea
        className={`${inputClass} min-h-24`}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
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
  disabled = false,
  help,
  label,
  value,
  onChange,
  options,
}: {
  disabled?: boolean;
  help?: ContextualHelpContent;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
}): React.JSX.Element {
  const generatedId = useId();
  const selectId = `field-select-${generatedId.replaceAll(':', '')}`;
  return (
    <div>
      <div className="flex items-center gap-1">
        <label className={labelClass} htmlFor={selectId}>
          {label}
        </label>
        {help === undefined ? null : <ContextualHelp content={help} label={label} />}
      </div>
      <select
        className={inputClass}
        disabled={disabled}
        id={selectId}
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </div>
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
  onChange: (value: string[]) => void;
  selected: string[];
}): React.JSX.Element {
  const generatedId = useId();
  const labelId = `field-entity-types-${generatedId.replaceAll(':', '')}`;
  const options = entityTypeOptions(entityTypes, selected);
  return (
    <div aria-labelledby={labelId} className="rounded-xl border border-stone-200 p-4" role="group">
      <p className="font-semibold text-slate-800" id={labelId}>
        {label}
      </p>
      <p className="mt-1 text-xs text-slate-600">Nenhuma seleção permite todos os tipos.</p>
      {options.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhum tipo de entidade ativo.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {options.map(([id, text]) => (
            <label className="flex items-center gap-3 text-sm" key={id}>
              <input
                checked={selected.includes(id)}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, id]
                      : selected.filter((selectedId) => selectedId !== id),
                  )
                }
                type="checkbox"
              />
              {text}
            </label>
          ))}
        </div>
      )}
    </div>
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
function relationshipOptions(
  relationshipTypes: RelationshipType[],
  values: FormValues,
): (readonly [string, string])[] {
  const options: (readonly [string, string])[] = relationshipTypes.map(({ id, name }) => [
    id,
    name,
  ]);
  if (
    values.referenceRelationshipTypeId !== '' &&
    !relationshipTypes.some(({ id }) => id === values.referenceRelationshipTypeId)
  )
    options.push([
      values.referenceRelationshipTypeId,
      'Tipo anteriormente selecionado (indisponível)',
    ]);
  return options;
}
function entityTypeOptions(
  entityTypes: EntityType[],
  selectedIds: string[],
): (readonly [string, string])[] {
  const options: (readonly [string, string])[] = entityTypes.map(({ id, name }) => [id, name]);
  for (const id of selectedIds) {
    if (!entityTypes.some((entityType) => entityType.id === id))
      options.push([id, 'Tipo anteriormente selecionado (indisponível)']);
  }
  return options;
}
const labelClass = 'block text-sm font-semibold text-slate-800';
const inputClass =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal text-slate-950 outline-none focus:border-amber-700 focus:ring-3 focus:ring-amber-700/15';
