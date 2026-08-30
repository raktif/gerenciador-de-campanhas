import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { EntityType } from '../../../core/contracts/entity-types';
import type {
  FieldDefinition,
  FieldDefinitionPatch,
} from '../../../core/contracts/field-definitions';
import { FieldDefinitionForm, type FieldDefinitionCreateValues } from './field-definition-form';

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
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await window.campaignManager.fieldDefinitions.list({
      campaignId: campaign.id,
      entityTypeId: entityType.id,
      filters: { isArchived: showArchived },
    });
    if (result.ok) setFields(result.data.items);
    else setError(result.error.message);
    setLoading(false);
  }, [campaign.id, entityType.id, showArchived]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(values: FieldDefinitionCreateValues): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await window.campaignManager.fieldDefinitions.create({
      campaignId: campaign.id,
      entityTypeId: entityType.id,
      ...values,
    });
    if (result.ok) {
      setFields((items) => [...items, result.data].sort(compare));
      setView('list');
      setAnnouncement(`Campo “${result.data.label}” criado.`);
    } else setError(result.error.message);
    setBusy(false);
  }
  async function update(patch: FieldDefinitionPatch): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setError(null);
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
      setView('list');
      setAnnouncement(`Campo “${result.data.label}” atualizado.`);
    } else setError(result.error.message);
    setBusy(false);
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
    } else setError(result.error.message);
    setBusy(false);
  }
  function backToList(): void {
    setEditing(null);
    setError(null);
    setView('list');
  }
  if (view === 'create')
    return (
      <FieldDefinitionForm
        busy={busy}
        error={error}
        mode="create"
        onCancel={backToList}
        onSubmit={create}
      />
    );
  if (view === 'edit' && editing !== null)
    return (
      <FieldDefinitionForm
        busy={busy}
        error={error}
        field={editing}
        key={`${editing.id}:${String(editing.revision)}`}
        mode="edit"
        onCancel={backToList}
        onSubmit={update}
      />
    );

  return (
    <section aria-labelledby="fields-title">
      <button className={backClass} onClick={onBack} type="button">
        ← Voltar para tipos de entidade
      </button>
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
          <button
            className={primaryClass}
            onClick={() => {
              setError(null);
              setView('create');
            }}
            type="button"
          >
            Novo campo
          </button>
        ) : null}
      </header>
      <div className="mt-6 flex gap-2" role="group" aria-label="Estado das definições de campo">
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
      </div>
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
          <div className="mt-4 flex gap-3">
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setPending(null)}
              type="button"
            >
              Cancelar ação
            </button>
            <button
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
              disabled={busy}
              onClick={() => void lifecycle()}
              type="button"
            >
              Confirmar {pending.isArchived ? 'restauração' : 'arquivamento'} do campo
            </button>
          </div>
        </div>
      )}
      {error === null ? null : (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button
            className="mt-2 text-sm font-semibold underline"
            onClick={() => void load()}
            type="button"
          >
            Tentar novamente
          </button>
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
            <button
              className={`${primaryClass} mt-6`}
              onClick={() => setView('create')}
              type="button"
            >
              Criar primeiro campo
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-4" data-testid="field-definition-list">
          {fields.map((field) => (
            <article
              className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
              key={field.id}
            >
              <div className="flex justify-between gap-5">
                <div>
                  <h2 className="text-xl font-semibold">{field.label}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {field.key} · {dataTypeLabel(field.dataType)}
                  </p>
                  {field.description === null ? null : (
                    <p className="mt-3 text-slate-600">{field.description}</p>
                  )}
                  <div className="mt-3 flex gap-2 text-xs">
                    {field.required ? <Badge>Obrigatório</Badge> : null}
                    {field.searchable ? <Badge>Pesquisável</Badge> : null}
                    {field.secretByDefault ? <Badge>Secreto</Badge> : null}
                  </div>
                </div>
                <span className="text-xs text-slate-500">Ordem {field.sortOrder}</span>
              </div>
              <div className="mt-5 flex justify-end gap-3 border-t border-stone-100 pt-4">
                <button
                  className={secondaryClass}
                  aria-label={`Editar campo ${field.label}`}
                  onClick={() => {
                    setEditing(field);
                    setError(null);
                    setView('edit');
                  }}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className={secondaryClass}
                  aria-label={`${field.isArchived ? 'Restaurar' : 'Arquivar'} campo ${field.label}`}
                  onClick={() => setPending(field)}
                  type="button"
                >
                  {field.isArchived ? 'Restaurar' : 'Arquivar'}
                </button>
              </div>
            </article>
          ))}
        </div>
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
    <button
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-slate-900 text-white' : 'border border-stone-300 bg-white text-slate-600'}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
const primaryClass =
  'rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white disabled:opacity-60';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60';
const backClass = 'mb-6 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600';
