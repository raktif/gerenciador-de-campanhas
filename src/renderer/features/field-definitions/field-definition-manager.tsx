import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { EntityType } from '../../../core/contracts/entity-types';
import type {
  FieldDefinition,
  FieldDefinitionPatch,
} from '../../../core/contracts/field-definitions';
import { FieldDefinitionForm, type FieldDefinitionCreateValues } from './field-definition-form';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { ReorderableList } from '../../components/reorderable-list';
import type { RelativeMove } from '../../../core/ordering/move-relative';
import { Button, ButtonGroup, ToolbarActions } from '../../components/actions';

type View = 'list' | 'create' | 'edit';

export function FieldDefinitionManager({
  campaign,
  entityType,
  onBack,
}: {
  campaign: Campaign;
  entityType: EntityType;
  onBack: () => void;
}): React.JSX.Element {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<FieldDefinition | null>(null);
  const [pending, setPending] = useState<FieldDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusTarget = useRef<{ kind: 'create' } | { kind: 'edit'; id: string } | null>(null);
  const shouldRestoreFocus = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await window.campaignManager.fieldDefinitions.list({
      campaignId: campaign.id,
      entityTypeId: entityType.id,
      filters: { isArchived: showArchived },
    });
    if (result.ok) setFields(result.data.items);
    else setError(presentUserFacingError(result.error, 'field-definitions.list'));
    setLoading(false);
  }, [campaign.id, entityType.id, showArchived]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (view !== 'list' || !shouldRestoreFocus.current) return;
    shouldRestoreFocus.current = false;
    const target = returnFocusTarget.current;
    returnFocusTarget.current = null;
    if (target?.kind === 'edit') editButtonRefs.current.get(target.id)?.focus();
    else createButtonRef.current?.focus();
  }, [fields, view]);

  async function create(values: FieldDefinitionCreateValues): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.fieldDefinitions.create({
        campaignId: campaign.id,
        entityTypeId: entityType.id,
        ...values,
      });
      if (result.ok) {
        setFields((items) => [...items, result.data].sort(compare));
        closeForm();
        setAnnouncement(`Campo “${result.data.label}” criado.`);
      } else setError(presentUserFacingError(result.error, 'field-definitions.mutate'));
    } catch {
      setError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'field-definitions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function update(patch: FieldDefinitionPatch): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.fieldDefinitions.update({
        campaignId: campaign.id,
        entityTypeId: entityType.id,
        id: editing.id,
        revision: editing.revision,
        patch,
      });
      if (result.ok) {
        setFields((items) =>
          items.map((item) => (item.id === result.data.id ? result.data : item)).sort(compare),
        );
        setEditing(null);
        closeForm();
        setAnnouncement(`Campo “${result.data.label}” atualizado.`);
      } else setError(presentUserFacingError(result.error, 'field-definitions.mutate'));
    } catch {
      setError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'field-definitions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function moveField(move: RelativeMove): Promise<void> {
    const source = fields.find(({ id }) => id === move.sourceId);
    const target = fields.find(({ id }) => id === move.targetId);
    if (source === undefined || target === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.fieldDefinitions.move({
        campaignId: campaign.id,
        entityTypeId: entityType.id,
        sourceId: source.id,
        sourceRevision: source.revision,
        targetId: target.id,
        targetRevision: target.revision,
        placement: move.placement,
      });
      if (result.ok) {
        setFields(result.data);
        setAnnouncement(`Campo “${source.label}” reposicionado.`);
        return;
      }
      const presented = presentUserFacingError(result.error, 'field-definitions.mutate');
      const refreshed = await window.campaignManager.fieldDefinitions.list({
        campaignId: campaign.id,
        entityTypeId: entityType.id,
        filters: { isArchived: false },
      });
      if (refreshed.ok) setFields(refreshed.data.items);
      setError(presented);
      throw new Error(presented.message);
    } finally {
      setBusy(false);
    }
  }
  async function lifecycle(): Promise<void> {
    if (pending === null) return;
    setBusy(true);
    setError(null);
    const input = {
      campaignId: campaign.id,
      entityTypeId: entityType.id,
      id: pending.id,
      revision: pending.revision,
    };
    const result = pending.isArchived
      ? await window.campaignManager.fieldDefinitions.restore(input)
      : await window.campaignManager.fieldDefinitions.archive(input);
    if (result.ok) {
      setFields((items) => items.filter((item) => item.id !== result.data.id));
      setAnnouncement(
        `Campo “${result.data.label}” ${pending.isArchived ? 'restaurado' : 'arquivado'}.`,
      );
      setPending(null);
    } else setError(presentUserFacingError(result.error, 'field-definitions.mutate'));
    setBusy(false);
  }
  function closeForm(): void {
    shouldRestoreFocus.current = true;
    setEditing(null);
    setError(null);
    setView('list');
  }
  function openCreate(): void {
    returnFocusTarget.current = { kind: 'create' };
    setError(null);
    setView('create');
  }
  function openEdit(field: FieldDefinition): void {
    returnFocusTarget.current = { kind: 'edit', id: field.id };
    setEditing(field);
    setError(null);
    setView('edit');
  }
  if (view === 'create')
    return (
      <>
        <FieldDefinitionForm
          busy={busy}
          campaignId={campaign.id}
          error={null}
          mode="create"
          onCancel={closeForm}
          onSubmit={create}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-3xl">
            <UserFacingErrorNotice error={error} operation="field-definitions.mutate" />
          </div>
        )}
      </>
    );
  if (view === 'edit' && editing !== null)
    return (
      <>
        <FieldDefinitionForm
          busy={busy}
          campaignId={campaign.id}
          error={null}
          field={editing}
          key={`${editing.id}:${String(editing.revision)}`}
          mode="edit"
          onCancel={closeForm}
          onSubmit={update}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-3xl">
            <UserFacingErrorNotice error={error} operation="field-definitions.mutate" />
          </div>
        )}
      </>
    );

  return (
    <section aria-labelledby="fields-title">
      <Button className="mb-6" onClick={onBack} size="small" variant="ghost">
        ← Voltar para tipos de entidade
      </Button>
      <header className="flex items-end justify-between gap-6 border-b border-stone-200 pb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            {campaign.name} · {entityType.name}
          </p>
          <h1 id="fields-title" className="mt-2 text-4xl font-semibold">
            Definições de campo
          </h1>
          <p className="mt-3 text-slate-600">
            Configure os atributos usados por cada{' '}
            {entityType.singularName.toLocaleLowerCase('pt-BR')}.
          </p>
        </div>
        {!showArchived ? (
          <Button onClick={openCreate} ref={createButtonRef} size="large" variant="primary">
            Novo campo
          </Button>
        ) : null}
      </header>
      <ToolbarActions aria-label="Estado das definições de campo" className="mt-6 gap-2">
        <Filter
          active={!showArchived}
          onClick={() => {
            setShowArchived(false);
            setFields([]);
            setAnnouncement(null);
          }}
        >
          Ativas
        </Filter>
        <Filter
          active={showArchived}
          onClick={() => {
            setShowArchived(true);
            setFields([]);
            setAnnouncement(null);
          }}
        >
          Arquivadas
        </Filter>
      </ToolbarActions>
      {announcement === null ? null : (
        <p
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          role="status"
        >
          {announcement}
        </p>
      )}
      {pending === null ? null : (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5" role="alert">
          <h2 className="font-semibold">
            {pending.isArchived ? 'Restaurar' : 'Arquivar'} “{pending.label}”?
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            A definição e os valores associados permanecerão preservados.
          </p>
          <ButtonGroup aria-label="Ações de confirmação" className="mt-4">
            <Button disabled={busy} onClick={() => setPending(null)}>
              Cancelar ação
            </Button>
            <Button busy={busy} onClick={() => void lifecycle()} variant="primary">
              Confirmar {pending.isArchived ? 'restauração' : 'arquivamento'} do campo
            </Button>
          </ButtonGroup>
        </div>
      )}
      {error === null ? null : (
        <div className="mt-6">
          <UserFacingErrorNotice
            error={error}
            operation="field-definitions.list"
            onRetry={() => void load()}
          />
        </div>
      )}
      {loading ? (
        <div
          className="mt-8 h-32 animate-pulse rounded-2xl bg-stone-200"
          aria-label="Carregando definições de campo"
        />
      ) : fields.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-8 py-14 text-center">
          <h2 className="text-xl font-semibold">
            {showArchived ? 'Nenhum campo arquivado' : 'Nenhuma definição de campo criada'}
          </h2>
          {!showArchived ? (
            <Button
              className="mt-6"
              onClick={openCreate}
              ref={createButtonRef}
              size="large"
              variant="primary"
            >
              Criar primeiro campo
            </Button>
          ) : null}
        </div>
      ) : (
        <ReorderableList
          ariaLabel={
            showArchived ? 'Definições de campo arquivadas' : 'Ordenar definições de campo'
          }
          busy={busy}
          className="mt-8 grid gap-4"
          getLabel={(field) => field.label}
          items={fields}
          onMove={moveField}
          reorderable={!showArchived}
          renderItem={(field) => (
            <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex justify-between gap-5">
                <div>
                  <h2 className="text-xl font-semibold">{field.label}</h2>
                  <p className="mt-1 text-sm text-slate-500">{dataTypeLabel(field.dataType)}</p>
                  {field.description === null ? null : (
                    <p className="mt-3 text-slate-600">{field.description}</p>
                  )}
                  <div className="mt-3 flex gap-2 text-xs">
                    {field.required ? <Badge>Obrigatório</Badge> : null}
                    {field.searchable ? <Badge>Pesquisável</Badge> : null}
                    {field.secretByDefault ? <Badge>Secreto</Badge> : null}
                  </div>
                </div>
              </div>
              <ToolbarActions
                aria-label={`Ações do campo ${field.label}`}
                className="mt-5 justify-end border-t border-stone-100 pt-4"
              >
                <Button
                  aria-label={`Editar campo ${field.label}`}
                  onClick={() => openEdit(field)}
                  ref={(node) => {
                    if (node === null) editButtonRefs.current.delete(field.id);
                    else editButtonRefs.current.set(field.id, node);
                  }}
                >
                  Editar
                </Button>
                <Button
                  aria-label={`${field.isArchived ? 'Restaurar' : 'Arquivar'} campo ${field.label}`}
                  onClick={() => setPending(field)}
                >
                  {field.isArchived ? 'Restaurar' : 'Arquivar'}
                </Button>
              </ToolbarActions>
            </article>
          )}
        />
      )}
    </section>
  );
}

function Filter({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button
      aria-pressed={active}
      className={`rounded-full ${active ? 'bg-slate-900 text-white' : ''}`}
      onClick={onClick}
      size="small"
    >
      {children}
    </Button>
  );
}
function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded-full bg-stone-100 px-2 py-1 font-semibold text-slate-600">
      {children}
    </span>
  );
}
function compare(left: FieldDefinition, right: FieldDefinition): number {
  return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'pt-BR');
}
function dataTypeLabel(value: string): string {
  return value.replaceAll('_', ' ');
}
