import { useEffect, useState } from 'react';
import type { Entity, FieldValue, FieldValueInput } from '../../../core/contracts/entities';
import type { EntityType } from '../../../core/contracts/entity-types';
import type { FieldDefinition } from '../../../core/contracts/field-definitions';

export interface EntityFormSubmitValues {
  name: string;
  summary: string | null;
  canonState: Entity['canonState'];
  knowledgeState: Entity['knowledgeState'];
  visibility: Entity['visibility'];
  originKind: Entity['originKind'];
  sourceId: string | null;
  fieldValues: FieldValueInput[];
}

type EntityFormProps = {
  campaign: { id: string };
  entityTypes: EntityType[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: EntityFormSubmitValues & { entityTypeId: string }) => Promise<void>;
} & (
  | { mode: 'create' }
  | {
      mode: 'edit';
      entity: Entity;
      fieldValues: FieldValue[];
    }
);

export function EntityForm(props: EntityFormProps): React.JSX.Element {
  const [entityTypeId, setEntityTypeId] = useState(
    props.mode === 'edit' ? props.entity.entityTypeId : (props.entityTypes[0]?.id ?? ''),
  );
  const [name, setName] = useState(props.mode === 'edit' ? props.entity.name : '');
  const [summary, setSummary] = useState(props.mode === 'edit' ? (props.entity.summary ?? '') : '');
  const [canonState, setCanonState] = useState<Entity['canonState']>(
    props.mode === 'edit' ? props.entity.canonState : 'accepted',
  );
  const [knowledgeState, setKnowledgeState] = useState<Entity['knowledgeState']>(
    props.mode === 'edit' ? props.entity.knowledgeState : 'fact',
  );
  const [visibility, setVisibility] = useState<Entity['visibility']>(
    props.mode === 'edit' ? props.entity.visibility : 'gm',
  );
  const [originKind, setOriginKind] = useState<Entity['originKind']>(
    props.mode === 'edit' ? props.entity.originKind : 'manual',
  );
  const [sourceId, setSourceId] = useState(
    props.mode === 'edit' ? (props.entity.sourceId ?? '') : '',
  );
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>(() =>
    props.mode === 'edit' ? toFieldValueTexts(props.fieldValues) : {},
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (entityTypeId === '') {
      setFields([]);
      setFieldsLoading(false);
      return;
    }
    setFieldsLoading(true);
    void window.campaignManager.fieldDefinitions
      .list({ campaignId: props.campaign.id, entityTypeId, filters: { isArchived: false } })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setFields(result.data.items);
        setFieldsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityTypeId, props.campaign.id]);

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    setValidationError(null);
    if (entityTypeId === '') {
      setValidationError('Escolha um tipo de entidade.');
      return;
    }
    try {
      const fieldValues = toFieldValueInputs(fields, values);
      void props.onSubmit({
        entityTypeId,
        name: name.trim(),
        summary: summary.trim() === '' ? null : summary.trim(),
        canonState,
        knowledgeState,
        visibility,
        originKind,
        sourceId: sourceId.trim() === '' ? null : sourceId.trim(),
        fieldValues,
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Valores de campo inválidos.');
    }
  }

  return (
    <section aria-labelledby="entity-form-title" className="mx-auto w-full max-w-4xl">
      <button className={backClass} disabled={props.busy} onClick={props.onCancel} type="button">
        ← Voltar para entidades
      </button>
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-200 bg-stone-50 px-8 py-7">
          <p className="text-xs font-bold tracking-[0.2em] text-amber-800 uppercase">
            {props.mode === 'create' ? 'Nova entidade' : 'Editar entidade'}
          </p>
          <h1 id="entity-form-title" className="mt-2 text-3xl font-semibold">
            {props.mode === 'create' ? 'Adicione um elemento ao mundo' : props.entity.name}
          </h1>
        </header>

        <form className="space-y-7 px-8 py-8" onSubmit={submit}>
          <div className="grid gap-6 md:grid-cols-2">
            <label className={labelClass}>
              Nome *
              <input
                autoFocus
                className={inputClass}
                disabled={props.busy}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className={labelClass}>
              Tipo de entidade *
              <select
                className={inputClass}
                disabled={props.busy || props.mode === 'edit'}
                onChange={(event) => setEntityTypeId(event.target.value)}
                required
                value={entityTypeId}
              >
                <option disabled value="">
                  Selecione…
                </option>
                {props.entityTypes.map((entityType) => (
                  <option key={entityType.id} value={entityType.id}>
                    {entityType.singularName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={labelClass}>
            Resumo
            <textarea
              className={`${inputClass} min-h-24`}
              disabled={props.busy}
              onChange={(event) => setSummary(event.target.value)}
              value={summary}
            />
          </label>

          <fieldset className="grid gap-6 rounded-2xl border border-stone-200 p-5 md:grid-cols-2">
            <legend className="px-2 font-semibold">Metadados narrativos</legend>
            <label className={labelClass}>
              Estado canônico
              <select
                className={inputClass}
                disabled={props.busy}
                onChange={(event) => setCanonState(event.target.value as Entity['canonState'])}
                value={canonState}
              >
                <option value="draft">Rascunho</option>
                <option value="accepted">Aceito</option>
                <option value="rejected">Rejeitado</option>
                <option value="archived">Arquivado</option>
              </select>
            </label>
            <label className={labelClass}>
              Natureza do conhecimento
              <select
                className={inputClass}
                disabled={props.busy}
                onChange={(event) =>
                  setKnowledgeState(event.target.value as Entity['knowledgeState'])
                }
                value={knowledgeState}
              >
                <option value="fact">Fato</option>
                <option value="rumor">Rumor</option>
                <option value="suspicion">Suspeita</option>
                <option value="secret">Segredo</option>
                <option value="possibility">Possibilidade</option>
                <option value="disproved">Refutado</option>
              </select>
            </label>
            <label className={labelClass}>
              Visibilidade
              <select
                className={inputClass}
                disabled={props.busy}
                onChange={(event) => setVisibility(event.target.value as Entity['visibility'])}
                value={visibility}
              >
                <option value="gm">Somente mestre</option>
                <option value="players">Jogadores</option>
                <option value="public">Público</option>
              </select>
            </label>
            <label className={labelClass}>
              Origem
              <select
                className={inputClass}
                disabled={props.busy}
                onChange={(event) => setOriginKind(event.target.value as Entity['originKind'])}
                value={originKind}
              >
                <option value="manual">Manual</option>
                <option value="session">Sessão</option>
                <option value="import">Importação</option>
                <option value="document">Documento</option>
                <option value="ruleset">Regras</option>
                <option value="ai">IA</option>
                <option value="generator">Gerador</option>
              </select>
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Identificador da fonte
              <input
                className={inputClass}
                disabled={props.busy}
                maxLength={200}
                onChange={(event) => setSourceId(event.target.value)}
                value={sourceId}
              />
            </label>
          </fieldset>

          {fieldsLoading ? (
            <p className="text-sm text-slate-500">Carregando campos do tipo…</p>
          ) : fields.length === 0 ? null : (
            <fieldset className="grid gap-6 rounded-2xl border border-stone-200 p-5 md:grid-cols-2">
              <legend className="px-2 font-semibold">
                Campos de {entityTypeLabel(props.entityTypes, entityTypeId)}
              </legend>
              <p className="text-sm text-slate-500 md:col-span-2">
                Os campos personalizados podem ficar em branco; apenas nome e tipo são obrigatórios.
              </p>
              {fields.map((field) => (
                <FieldValueInputControl
                  disabled={props.busy}
                  field={field}
                  key={field.id}
                  onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))}
                  value={values[field.id] ?? ''}
                />
              ))}
            </fieldset>
          )}

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
                  ? 'Criar entidade'
                  : 'Salvar entidade'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function FieldValueInputControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  const label = `${field.label}${field.required ? ' (definido como obrigatório)' : ''}`;
  if (field.dataType === 'entity_reference' || field.dataType === 'entity_reference_list') {
    return (
      <p className="text-sm text-slate-500 md:col-span-2">
        {field.label}: campos de referência ainda não são editáveis nesta versão. Use a tela de
        relações quando disponível.
      </p>
    );
  }
  if (field.dataType === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <input
          checked={value === 'true'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
          type="checkbox"
        />
        {label}
      </label>
    );
  }
  if (field.dataType === 'long_text' || field.dataType === 'structured') {
    return (
      <label className={labelClass}>
        {label}
        <textarea
          className={`${inputClass} min-h-24`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </label>
    );
  }
  if (field.dataType === 'number' || field.dataType === 'progress') {
    return (
      <label className={labelClass}>
        {label}
        <input
          className={inputClass}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          type="number"
          value={value}
        />
      </label>
    );
  }
  if (field.dataType === 'date') {
    return (
      <label className={labelClass}>
        {label}
        <input
          className={inputClass}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          type="date"
          value={value}
        />
      </label>
    );
  }
  if (field.dataType === 'multi_select') {
    return (
      <label className={labelClass}>
        {label} (separados por vírgula)
        <input
          className={inputClass}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </label>
    );
  }
  return (
    <label className={labelClass}>
      {label}
      <input
        className={inputClass}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function toFieldValueTexts(fieldValues: FieldValue[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const fieldValue of fieldValues) {
    const value = fieldValue.value;
    result[fieldValue.fieldDefinitionId] =
      typeof value === 'boolean'
        ? String(value)
        : Array.isArray(value)
          ? value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ')
          : typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : String(value);
  }
  return result;
}

function toFieldValueInputs(
  fields: FieldDefinition[],
  values: Record<string, string>,
): FieldValueInput[] {
  const result: FieldValueInput[] = [];
  for (const field of fields) {
    if (field.dataType === 'entity_reference' || field.dataType === 'entity_reference_list')
      continue;
    const raw = values[field.id];
    if (raw === undefined || raw.trim() === '') continue;
    if (field.dataType === 'boolean') {
      result.push({ fieldDefinitionId: field.id, value: raw === 'true' });
    } else if (field.dataType === 'number' || field.dataType === 'progress') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new Error(`${field.label} deve ser um número válido.`);
      result.push({ fieldDefinitionId: field.id, value: parsed });
    } else if (field.dataType === 'multi_select') {
      result.push({
        fieldDefinitionId: field.id,
        value: raw
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      });
    } else if (field.dataType === 'structured') {
      try {
        result.push({
          fieldDefinitionId: field.id,
          value: JSON.parse(raw) as FieldValueInput['value'],
        });
      } catch {
        throw new Error(`${field.label} deve conter JSON válido.`);
      }
    } else {
      result.push({ fieldDefinitionId: field.id, value: raw });
    }
  }
  return result;
}

function entityTypeLabel(entityTypes: EntityType[], id: string): string {
  return entityTypes.find((entityType) => entityType.id === id)?.singularName ?? '';
}

const labelClass = 'block text-sm font-semibold text-slate-800';
const inputClass =
  'mt-2 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const primaryClass =
  'rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white hover:bg-amber-800 disabled:opacity-60';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60';
const backClass = 'mb-6 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600';
