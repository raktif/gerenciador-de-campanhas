import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { EntityType, EntityTypePatch } from '../../../core/contracts/entity-types';
import { EntityTypeForm, type EntityTypeCreateValues } from './entity-type-form';
import { FieldDefinitionManager } from '../field-definitions/field-definition-manager';

type ManagerView = 'list' | 'create' | 'edit' | 'fields';
type LifecycleAction = 'archive' | 'restore';

export function EntityTypeManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<ManagerView>('list');
  const [editing, setEditing] = useState<EntityType | null>(null);
  const [fieldOwner, setFieldOwner] = useState<EntityType | null>(null);
  const [pendingLifecycle, setPendingLifecycle] = useState<{
    action: LifecycleAction;
    entityType: EntityType;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const loadEntityTypes = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await window.campaignManager.entityTypes.list({
      campaignId: campaign.id,
      filters: { isArchived: showArchived },
    });
    if (result.ok) setEntityTypes(result.data.items);
    else setError(result.error.message);
    setLoading(false);
  }, [campaign.id, showArchived]);

  useEffect(() => {
    void loadEntityTypes();
  }, [loadEntityTypes]);

  function selectArchived(value: boolean): void {
    setAnnouncement(null);
    setEntityTypes([]);
    setLoading(true);
    setShowArchived(value);
  }

  function beginCreate(): void {
    setError(null);
    setAnnouncement(null);
    setView('create');
  }

  function beginEdit(entityType: EntityType): void {
    setEditing(entityType);
    setError(null);
    setAnnouncement(null);
    setView('edit');
  }

  function returnToList(): void {
    setEditing(null);
    setError(null);
    setView('list');
  }

  async function createEntityType(values: EntityTypeCreateValues): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await window.campaignManager.entityTypes.create({
      campaignId: campaign.id,
      ...values,
    });
    if (result.ok) {
      setEntityTypes((current) => [...current, result.data].sort(compareEntityTypes));
      setView('list');
      setAnnouncement(`Tipo “${result.data.name}” criado.`);
    } else {
      setError(result.error.message);
    }
    setBusy(false);
  }

  async function updateEntityType(patch: EntityTypePatch): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setError(null);
    const result = await window.campaignManager.entityTypes.update({
      campaignId: campaign.id,
      id: editing.id,
      revision: editing.revision,
      patch,
    });
    if (result.ok) {
      setEntityTypes((current) =>
        current
          .map((entityType) => (entityType.id === result.data.id ? result.data : entityType))
          .sort(compareEntityTypes),
      );
      setEditing(null);
      setView('list');
      setAnnouncement(`Tipo “${result.data.name}” atualizado.`);
    } else {
      setError(result.error.message);
    }
    setBusy(false);
  }

  async function applyLifecycle(): Promise<void> {
    if (pendingLifecycle === null) return;
    setBusy(true);
    setError(null);
    const input = {
      campaignId: campaign.id,
      id: pendingLifecycle.entityType.id,
      revision: pendingLifecycle.entityType.revision,
    };
    const result =
      pendingLifecycle.action === 'archive'
        ? await window.campaignManager.entityTypes.archive(input)
        : await window.campaignManager.entityTypes.restore(input);
    if (result.ok) {
      setEntityTypes((current) => current.filter(({ id }) => id !== result.data.id));
      setAnnouncement(
        pendingLifecycle.action === 'archive'
          ? `Tipo “${result.data.name}” arquivado.`
          : `Tipo “${result.data.name}” restaurado.`,
      );
      setPendingLifecycle(null);
    } else {
      setError(result.error.message);
    }
    setBusy(false);
  }

  if (view === 'create') {
    return (
      <EntityTypeForm
        busy={busy}
        error={error}
        mode="create"
        onCancel={returnToList}
        onSubmit={createEntityType}
      />
    );
  }

  if (view === 'fields' && fieldOwner !== null) {
    return (
      <FieldDefinitionManager
        campaign={campaign}
        entityType={fieldOwner}
        onBack={() => {
          setFieldOwner(null);
          setView('list');
        }}
      />
    );
  }

  if (view === 'edit' && editing !== null) {
    return (
      <EntityTypeForm
        busy={busy}
        entityType={editing}
        error={error}
        key={`${editing.id}:${String(editing.revision)}`}
        mode="edit"
        onCancel={returnToList}
        onSubmit={updateEntityType}
      />
    );
  }

  return (
    <section aria-labelledby="entity-types-title">
      <button className={backButtonClassName} onClick={onBack} type="button">
        <span aria-hidden="true">←</span>
        Voltar para detalhes da campanha
      </button>

      <header className="flex items-end justify-between gap-6 border-b border-stone-200 pb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            Estrutura de {campaign.name}
          </p>
          <h1 id="entity-types-title" className="mt-2 text-4xl font-semibold tracking-tight">
            Tipos de entidade
          </h1>
          <p className="mt-3 text-slate-600">
            Defina as categorias usadas para organizar pessoas, locais, facções e outros elementos.
          </p>
        </div>
        {!showArchived ? (
          <button className={primaryButtonClassName} onClick={beginCreate} type="button">
            Novo tipo
          </button>
        ) : null}
      </header>

      <div aria-label="Estado dos tipos de entidade" className="mt-6 flex gap-2" role="group">
        <FilterButton active={!showArchived} onClick={() => selectArchived(false)}>
          Ativos
        </FilterButton>
        <FilterButton active={showArchived} onClick={() => selectArchived(true)}>
          Arquivados
        </FilterButton>
      </div>

      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {announcement}
        </p>
      )}

      {pendingLifecycle === null ? null : (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5" role="alert">
          <h2 className="font-semibold text-slate-950">
            {pendingLifecycle.action === 'archive'
              ? `Arquivar “${pendingLifecycle.entityType.name}”?`
              : `Restaurar “${pendingLifecycle.entityType.name}”?`}
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            O tipo e todos os seus dados permanecerão preservados.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              className={secondaryButtonClassName}
              disabled={busy}
              onClick={() => setPendingLifecycle(null)}
              type="button"
            >
              Cancelar ação
            </button>
            <button
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
              disabled={busy}
              onClick={() => void applyLifecycle()}
              type="button"
            >
              {pendingLifecycle.action === 'archive'
                ? 'Confirmar arquivamento do tipo'
                : 'Confirmar restauração do tipo'}
            </button>
          </div>
        </div>
      )}

      {error === null ? null : (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button
            className="mt-3 text-sm font-semibold text-red-800 underline"
            onClick={() => void loadEntityTypes()}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div aria-busy="true" aria-label="Carregando tipos de entidade" className="mt-8 grid gap-4">
          {[0, 1, 2].map((item) => (
            <div className="h-32 animate-pulse rounded-2xl bg-stone-200" key={item} />
          ))}
        </div>
      ) : entityTypes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-8 py-14 text-center">
          <h2 className="text-xl font-semibold text-slate-900">
            {showArchived ? 'Nenhum tipo arquivado' : 'Nenhum tipo de entidade criado'}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            {showArchived
              ? 'Tipos arquivados permanecerão disponíveis aqui para restauração.'
              : 'Crie a primeira categoria para começar a estruturar este mundo.'}
          </p>
          {!showArchived ? (
            <button
              className={`${primaryButtonClassName} mt-6`}
              onClick={beginCreate}
              type="button"
            >
              Criar primeiro tipo
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-4" data-testid="entity-type-list">
          {entityTypes.map((entityType) => (
            <EntityTypeCard
              entityType={entityType}
              key={entityType.id}
              onEdit={() => beginEdit(entityType)}
              onFields={() => {
                setFieldOwner(entityType);
                setView('fields');
              }}
              onLifecycle={() =>
                setPendingLifecycle({
                  action: entityType.isArchived ? 'restore' : 'archive',
                  entityType,
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EntityTypeCard({
  entityType,
  onEdit,
  onLifecycle,
  onFields,
}: {
  entityType: EntityType;
  onEdit: () => void;
  onLifecycle: () => void;
  onFields: () => void;
}): React.JSX.Element {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 gap-4">
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-lg font-bold text-white"
            style={entityType.color === null ? undefined : { backgroundColor: entityType.color }}
          >
            {entityType.icon ?? entityType.singularName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-950">{entityType.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Singular: {entityType.singularName} · {entityType.slug}
            </p>
            {entityType.description === null ? null : (
              <p className="mt-3 leading-6 text-slate-600">{entityType.description}</p>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-500">
          Ordem {String(entityType.sortOrder)}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-4">
        <button
          aria-label={`Gerenciar campos de ${entityType.name}`}
          className={secondaryButtonClassName}
          onClick={onFields}
          type="button"
        >
          Gerenciar campos
        </button>
        <button
          aria-label={`Editar tipo ${entityType.name}`}
          className={secondaryButtonClassName}
          onClick={onEdit}
          type="button"
        >
          Editar
        </button>
        <button
          aria-label={`${entityType.isArchived ? 'Restaurar' : 'Arquivar'} tipo ${entityType.name}`}
          className={secondaryButtonClassName}
          onClick={onLifecycle}
          type="button"
        >
          {entityType.isArchived ? 'Restaurar' : 'Arquivar'}
        </button>
      </div>
    </article>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${
        active
          ? 'bg-slate-900 text-white'
          : 'border border-stone-300 bg-white text-slate-600 hover:border-amber-700'
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function compareEntityTypes(left: EntityType, right: EntityType): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'pt-BR');
}

const primaryButtonClassName =
  'rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const secondaryButtonClassName =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60';
const backButtonClassName =
  'mb-6 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
