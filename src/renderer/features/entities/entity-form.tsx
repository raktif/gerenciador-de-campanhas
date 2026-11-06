import { useEffect, useRef, useState } from 'react';
import { Button, DialogActions, FormActions } from '../../components/actions';
import type {
  Entity,
  EntityReferenceValueInput,
  FieldValue,
  FieldValueInput,
} from '../../../core/contracts/entities';
import type { EntityType } from '../../../core/contracts/entity-types';
import type { FieldDefinition } from '../../../core/contracts/field-definitions';
import { ContextualHelp } from '../../components/contextual-help';
import { contextualHelpCatalog, fieldDefinitionHelpContent } from '../../content/contextual-help';

export interface EntityFormSubmitValues {
  name: string;
  summary: string | null;
  canonState: Entity['canonState'];
  knowledgeState: Entity['knowledgeState'];
  visibility: Entity['visibility'];
  originKind: Entity['originKind'];
  sourceId: string | null;
  fieldValues: FieldValueInput[];
  referenceValues: EntityReferenceValueInput[];
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
  const sourceId = props.mode === 'edit' ? props.entity.sourceId : null;
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>(() =>
    props.mode === 'edit' ? toFieldValueTexts(props.fieldValues) : {},
  );
  const [referenceValues, setReferenceValues] = useState<Record<string, string[]>>({});
  const [referenceEntities, setReferenceEntities] = useState<Entity[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const continueEditingRef = useRef<HTMLButtonElement>(null);
  const discardDialogRef = useRef<HTMLElement>(null);
  const cancelInvokerRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    const relationRequest =
      props.mode === 'edit'
        ? window.campaignManager.relationships.list({
            campaignId: props.campaign.id,
            limit: 100,
            filters: { archived: false, entityId: props.entity.id },
          })
        : Promise.resolve(null);
    void Promise.all([
      window.campaignManager.entities.list({
        campaignId: props.campaign.id,
        limit: 100,
        filters: { archived: false },
      }),
      relationRequest,
      window.campaignManager.relationshipTypes.list({
        campaignId: props.campaign.id,
        limit: 100,
        filters: { isArchived: false },
      }),
    ]).then(([entityResult, relationshipResult, typeResult]) => {
      if (cancelled) return;
      if (entityResult.ok)
        setReferenceEntities(
          entityResult.data.items.filter(
            (item) => props.mode !== 'edit' || item.id !== props.entity.id,
          ),
        );
      if (props.mode === 'edit' && relationshipResult?.ok) {
        const selected: Record<string, string[]> = {};
        for (const field of fields) {
          if (field.referenceRelationshipTypeId === null || field.referenceDirection === null)
            continue;
          const symmetric =
            typeResult.ok &&
            typeResult.data.items.some(
              (type) => type.id === field.referenceRelationshipTypeId && type.isSymmetric,
            );
          selected[field.id] = relationshipResult.data.items
            .filter((item) => item.relationshipTypeId === field.referenceRelationshipTypeId)
            .filter((item) =>
              symmetric
                ? item.sourceEntityId === props.entity.id || item.targetEntityId === props.entity.id
                : field.referenceDirection === 'outgoing'
                  ? item.sourceEntityId === props.entity.id
                  : item.targetEntityId === props.entity.id,
            )
            .map((item) =>
              symmetric
                ? item.sourceEntityId === props.entity.id
                  ? item.targetEntityId
                  : item.sourceEntityId
                : field.referenceDirection === 'outgoing'
                  ? item.targetEntityId
                  : item.sourceEntityId,
            );
        }
        setReferenceValues(selected);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fields, props.campaign.id, props.mode, props.mode === 'edit' ? props.entity.id : 'create']);

  useEffect(() => {
    if (confirmDiscard) continueEditingRef.current?.focus();
  }, [confirmDiscard]);

  function requestCancel(event: React.MouseEvent<HTMLButtonElement>): void {
    cancelInvokerRef.current = event.currentTarget;
    if (hasUnsavedChanges) {
      setConfirmDiscard(true);
      return;
    }
    props.onCancel();
  }

  function discardChanges(): void {
    setConfirmDiscard(false);
    props.onCancel();
  }

  function continueEditing(): void {
    setConfirmDiscard(false);
    requestAnimationFrame(() => cancelInvokerRef.current?.focus());
  }

  function handleDiscardDialogKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      continueEditing();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable =
      discardDialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    if (focusable === undefined || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    setValidationError(null);
    if (entityTypeId === '') {
      setValidationError('Escolha um tipo de entidade.');
      return;
    }
    try {
      const fieldValues = toFieldValueInputs(fields, values);
      const references = fields
        .filter(
          (field) =>
            field.dataType === 'entity_reference' || field.dataType === 'entity_reference_list',
        )
        .map((field) => ({
          fieldDefinitionId: field.id,
          entityIds: referenceValues[field.id] ?? [],
        }));
      void props.onSubmit({
        entityTypeId,
        name: name.trim(),
        summary: summary.trim() === '' ? null : summary.trim(),
        canonState,
        knowledgeState,
        visibility,
        originKind,
        sourceId,
        fieldValues,
        referenceValues: references,
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Valores de campo inválidos.');
    }
  }

  return (
    <section aria-labelledby="entity-form-title" className="mx-auto w-full max-w-4xl">
      <Button
        className="mb-6"
        disabled={props.busy}
        onClick={requestCancel}
        size="small"
        variant="ghost"
      >
        ← Voltar para entidades
      </Button>
      <div className="overflow-hidden rounded-3xl border semantic-border semantic-surface shadow-sm">
        <header className="border-b semantic-border semantic-surface-muted px-8 py-7">
          <p className="text-xs font-bold tracking-[0.2em] semantic-accent-text uppercase">
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
                onChange={(event) => {
                  setName(event.target.value);
                  setHasUnsavedChanges(true);
                }}
                required
                value={name}
              />
            </label>
            <label className={labelClass}>
              Tipo de entidade *
              <select
                className={inputClass}
                disabled={props.busy || props.mode === 'edit'}
                onChange={(event) => {
                  setEntityTypeId(event.target.value);
                  setHasUnsavedChanges(true);
                }}
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
              onChange={(event) => {
                setSummary(event.target.value);
                setHasUnsavedChanges(true);
              }}
              value={summary}
            />
          </label>

          <fieldset className="grid gap-6 rounded-2xl border semantic-border p-5 md:grid-cols-2">
            <legend className="px-2 font-semibold">Metadados narrativos</legend>
            <div className={labelClass}>
              <div className="flex items-center gap-1">
                <label htmlFor="entity-canon-state">Estado canônico</label>
                <ContextualHelp
                  content={contextualHelpCatalog['narrative.canonState']}
                  label="Estado canônico"
                />
              </div>
              <select
                className={inputClass}
                disabled={props.busy}
                id="entity-canon-state"
                onChange={(event) => {
                  setCanonState(event.target.value as Entity['canonState']);
                  setHasUnsavedChanges(true);
                }}
                value={canonState}
              >
                <option value="draft">Rascunho</option>
                <option value="accepted">Aceito</option>
                <option value="rejected">Rejeitado</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>
            <div className={labelClass}>
              <div className="flex items-center gap-1">
                <label htmlFor="entity-knowledge-state">Natureza do conhecimento</label>
                <ContextualHelp
                  content={contextualHelpCatalog['narrative.knowledgeState']}
                  label="Natureza do conhecimento"
                />
              </div>
              <select
                className={inputClass}
                disabled={props.busy}
                id="entity-knowledge-state"
                onChange={(event) => {
                  setKnowledgeState(event.target.value as Entity['knowledgeState']);
                  setHasUnsavedChanges(true);
                }}
                value={knowledgeState}
              >
                <option value="fact">Fato</option>
                <option value="rumor">Rumor</option>
                <option value="suspicion">Suspeita</option>
                <option value="secret">Segredo</option>
                <option value="possibility">Possibilidade</option>
                <option value="disproved">Refutado</option>
              </select>
            </div>
            <div className={labelClass}>
              <div className="flex items-center gap-1">
                <label htmlFor="entity-visibility">Visibilidade</label>
                <ContextualHelp
                  content={contextualHelpCatalog['narrative.visibility']}
                  label="Visibilidade"
                />
              </div>
              <select
                className={inputClass}
                disabled={props.busy}
                id="entity-visibility"
                onChange={(event) => {
                  setVisibility(event.target.value as Entity['visibility']);
                  setHasUnsavedChanges(true);
                }}
                value={visibility}
              >
                <option value="gm">Somente mestre</option>
                <option value="players">Jogadores</option>
                <option value="public">Público</option>
              </select>
            </div>
            <div className={labelClass}>
              <div className="flex items-center gap-1">
                <label htmlFor="entity-origin-kind">Origem</label>
                <ContextualHelp
                  content={contextualHelpCatalog['narrative.originKind']}
                  label="Origem"
                />
              </div>
              <select
                className={inputClass}
                disabled={props.busy}
                id="entity-origin-kind"
                onChange={(event) => {
                  setOriginKind(event.target.value as Entity['originKind']);
                  setHasUnsavedChanges(true);
                }}
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
            </div>
          </fieldset>

          {fieldsLoading ? (
            <p className="text-sm semantic-text-secondary">Carregando campos do tipo…</p>
          ) : fields.length === 0 ? null : (
            <fieldset className="grid gap-6 rounded-2xl border semantic-border p-5 md:grid-cols-2">
              <legend className="px-2 font-semibold">
                Campos de {entityTypeLabel(props.entityTypes, entityTypeId)}
              </legend>
              <p className="text-sm semantic-text-secondary md:col-span-2">
                Os campos personalizados podem ficar em branco; apenas nome e tipo são obrigatórios.
              </p>
              {fields.map((field) =>
                field.dataType === 'image' ? (
                  <p className="text-sm semantic-text-secondary md:col-span-2" key={field.id}>
                    {field.label}: imagens são gerenciadas nos detalhes da entidade após salvar.
                  </p>
                ) : field.dataType === 'entity_reference' ||
                  field.dataType === 'entity_reference_list' ? (
                  <ReferenceInputControl
                    disabled={props.busy}
                    entities={referenceEntities.filter(
                      (entity) =>
                        field.allowedTargetTypeIds === null ||
                        field.allowedTargetTypeIds.includes(entity.entityTypeId),
                    )}
                    field={field}
                    key={field.id}
                    onChange={(selected) => {
                      setReferenceValues((current) => ({ ...current, [field.id]: selected }));
                      setHasUnsavedChanges(true);
                    }}
                    value={referenceValues[field.id] ?? []}
                  />
                ) : (
                  <FieldValueInputControl
                    disabled={props.busy}
                    field={field}
                    key={field.id}
                    onChange={(value) => {
                      setValues((current) => ({ ...current, [field.id]: value }));
                      setHasUnsavedChanges(true);
                    }}
                    value={values[field.id] ?? ''}
                  />
                ),
              )}
            </fieldset>
          )}

          {props.error === null && validationError === null ? null : (
            <p
              className="rounded-xl border semantic-danger-border semantic-danger-surface p-4 text-sm semantic-error-text"
              role="alert"
            >
              {props.error ?? validationError}
            </p>
          )}

          <FormActions>
            <Button disabled={props.busy} onClick={requestCancel}>
              Cancelar
            </Button>
            <Button busy={props.busy} type="submit" variant="primary">
              {props.busy
                ? 'Salvando…'
                : props.mode === 'create'
                  ? 'Criar entidade'
                  : 'Salvar entidade'}
            </Button>
          </FormActions>
        </form>
      </div>
      {confirmDiscard ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center semantic-overlay p-6"
          role="presentation"
        >
          <section
            aria-describedby="entity-discard-description"
            aria-labelledby="entity-discard-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl semantic-surface p-6 shadow-2xl"
            onKeyDown={handleDiscardDialogKeyDown}
            ref={discardDialogRef}
            role="dialog"
          >
            <h2 className="text-xl font-semibold" id="entity-discard-title">
              Descartar alterações?
            </h2>
            <p className="mt-3 semantic-text-secondary" id="entity-discard-description">
              Você possui alterações que ainda não foram salvas.
            </p>
            <DialogActions className="mt-6">
              <Button onClick={continueEditing} ref={continueEditingRef}>
                Continuar editando
              </Button>
              <Button onClick={discardChanges} variant="danger">
                Descartar alterações
              </Button>
            </DialogActions>
          </section>
        </div>
      ) : null}
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
  const controlId = `entity-field-${field.id}`;
  if (field.dataType === 'entity_reference' || field.dataType === 'entity_reference_list') {
    return (
      <p className="text-sm semantic-text-secondary md:col-span-2">
        {field.label}: campos de referência ainda não são editáveis nesta versão. Use a tela de
        relações quando disponível.
      </p>
    );
  }
  if (field.dataType === 'boolean') {
    return (
      <div className="flex items-center gap-2 text-sm font-semibold semantic-text-primary">
        <input
          checked={value === 'true'}
          disabled={disabled}
          id={controlId}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
          type="checkbox"
        />
        <label htmlFor={controlId}>{label}</label>
        <FieldHelp field={field} />
      </div>
    );
  }
  if (field.dataType === 'long_text' || field.dataType === 'structured') {
    return (
      <div>
        <FieldLabel controlId={controlId} field={field} label={label} />
        <textarea
          className={`${inputClass} min-h-24`}
          disabled={disabled}
          id={controlId}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </div>
    );
  }
  if (field.dataType === 'number' || field.dataType === 'progress') {
    return (
      <div>
        <FieldLabel controlId={controlId} field={field} label={label} />
        <input
          className={inputClass}
          disabled={disabled}
          id={controlId}
          onChange={(event) => onChange(event.target.value)}
          type="number"
          value={value}
        />
      </div>
    );
  }
  if (field.dataType === 'date') {
    return (
      <div>
        <FieldLabel controlId={controlId} field={field} label={label} />
        <input
          className={inputClass}
          disabled={disabled}
          id={controlId}
          onChange={(event) => onChange(event.target.value)}
          type="date"
          value={value}
        />
      </div>
    );
  }
  if (field.dataType === 'multi_select') {
    return (
      <div>
        <FieldLabel
          controlId={controlId}
          field={field}
          label={`${label} (separados por vírgula)`}
        />
        <input
          className={inputClass}
          disabled={disabled}
          id={controlId}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </div>
    );
  }
  return (
    <div>
      <FieldLabel controlId={controlId} field={field} label={label} />
      <input
        className={inputClass}
        disabled={disabled}
        id={controlId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function ReferenceInputControl({
  field,
  entities,
  value,
  onChange,
  disabled,
}: {
  field: FieldDefinition;
  entities: Entity[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
}): React.JSX.Element {
  const controlId = `entity-field-${field.id}`;
  if (field.dataType === 'entity_reference')
    return (
      <div>
        <FieldLabel controlId={controlId} field={field} label={field.label} />
        <select
          className={inputClass}
          disabled={disabled}
          id={controlId}
          value={value[0] ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? [] : [event.target.value])}
        >
          <option value="">Nenhuma</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </div>
    );
  return (
    <fieldset className="rounded-xl border semantic-border p-4">
      <legend className="px-1 text-sm font-semibold">
        <span className="inline-flex items-center gap-1">
          {field.label}
          <FieldHelp field={field} />
        </span>
      </legend>
      <div className="mt-2 grid gap-2">
        {entities.map((entity) => (
          <label className="flex items-center gap-2 text-sm" key={entity.id}>
            <input
              checked={value.includes(entity.id)}
              disabled={disabled}
              type="checkbox"
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, entity.id]
                    : value.filter((id) => id !== entity.id),
                )
              }
            />
            {entity.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FieldLabel({
  controlId,
  field,
  label,
}: {
  controlId: string;
  field: FieldDefinition;
  label: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <label className={labelClass} htmlFor={controlId}>
        {label}
      </label>
      <FieldHelp field={field} />
    </div>
  );
}

function FieldHelp({ field }: { field: FieldDefinition }): React.JSX.Element | null {
  const content = fieldDefinitionHelpContent(field);
  return content === null ? null : <ContextualHelp content={content} label={field.label} />;
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

export function toFieldValueInputs(
  fields: FieldDefinition[],
  values: Record<string, string>,
): FieldValueInput[] {
  const result: FieldValueInput[] = [];
  for (const field of fields) {
    if (
      field.dataType === 'image' ||
      field.dataType === 'entity_reference' ||
      field.dataType === 'entity_reference_list'
    )
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

const labelClass = 'block text-sm font-semibold semantic-text-primary';
const inputClass =
  'mt-2 w-full rounded-xl border semantic-border px-4 py-2.5 semantic-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 semantic-focus-outline';
