import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity, EntityDetails, EntityLifecycleInput } from '../../../core/contracts/entities';
import type { EntityType } from '../../../core/contracts/entity-types';
import { EntityForm, type EntityFormSubmitValues } from './entity-form';

type View = 'list' | 'create' | 'edit';
type LifecycleAction = 'archive' | 'restore';

export function EntityManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<EntityDetails | null>(null);
  const [pending, setPending] = useState<{ action: LifecycleAction; entity: Entity } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const loadEntityTypes = useCallback(async (): Promise<void> => {
    const result = await window.campaignManager.entityTypes.list({
      campaignId: campaign.id,
      filters: { isArchived: false },
    });
    if (result.ok) setEntityTypes(result.data.items);
  }, [campaign.id]);

  const loadEntities = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await window.campaignManager.entities.list({
      campaignId: campaign.id,
      filters: {
        archived: showArchived,
        ...(typeFilter === '' ? {} : { entityTypeId: typeFilter }),
      },
    });
    if (result.ok) setEntities(result.data.items);
    else setError(result.error.message);
    setLoading(false);
  }, [campaign.id, showArchived, typeFilter]);

  useEffect(() => {
    void loadEntityTypes();
  }, [loadEntityTypes]);
  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  function returnToList(): void {
    setEditing(null);
    setError(null);
    setView('list');
  }

  async function beginEdit(entity: Entity): Promise<void> {
    setBusy(true);
    setError(null);
    const details = await window.campaignManager.entities.get({
      campaignId: campaign.id,
      id: entity.id,
    });
    setBusy(false);
    if (!details.ok) {
      setError(details.error.message);
      return;
    }
    setEditing(details.data);
    setView('edit');
  }

  async function createEntity(
    values: EntityFormSubmitValues & { entityTypeId: string },
  ): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await window.campaignManager.entities.create({
      campaignId: campaign.id,
      entityTypeId: values.entityTypeId,
      name: values.name,
      summary: values.summary,
      canonState: values.canonState,
      knowledgeState: values.knowledgeState,
      visibility: values.visibility,
      originKind: values.originKind,
      sourceId: values.sourceId,
      fieldValues: values.fieldValues,
    });
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    setAnnouncement(`Entidade “${result.data.entity.name}” criada.`);
    setView('list');
    setBusy(false);
    await loadEntities();
  }

  async function updateEntity(
    values: EntityFormSubmitValues & { entityTypeId: string },
  ): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setError(null);
    const result = await window.campaignManager.entities.update({
      campaignId: campaign.id,
      id: editing.entity.id,
      revision: editing.entity.revision,
      patch: {
        name: values.name,
        summary: values.summary,
        canonState: values.canonState,
        knowledgeState: values.knowledgeState,
        visibility: values.visibility,
        originKind: values.originKind,
        sourceId: values.sourceId,
      },
      fieldValues: values.fieldValues,
    });
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    setAnnouncement(`Entidade “${result.data.entity.name}” atualizada.`);
    setEditing(null);
    setView('list');
    setBusy(false);
    await loadEntities();
  }

  async function applyLifecycle(): Promise<void> {
    if (pending === null) return;
    setBusy(true);
    setError(null);
    const input: EntityLifecycleInput = {
      campaignId: campaign.id,
      id: pending.entity.id,
      revision: pending.entity.revision,
    };
    const result =
      pending.action === 'archive'
        ? await window.campaignManager.entities.archive(input)
        : await window.campaignManager.entities.restore(input);
    if (result.ok) {
      setAnnouncement(
        pending.action === 'archive'
          ? `Entidade “${result.data.entity.name}” arquivada.`
          : `Entidade “${result.data.entity.name}” restaurada.`,
      );
      setPending(null);
      await loadEntities();
    } else {
      setError(result.error.message);
    }
    setBusy(false);
  }

  if (view === 'create') {
    return (
      <EntityForm
        busy={busy}
        campaign={campaign}
        entityTypes={entityTypes}
        error={error}
        mode="create"
        onCancel={returnToList}
        onSubmit={createEntity}
      />
    );
  }
  if (view === 'edit' && editing !== null) {
    return (
      <EntityForm
        busy={busy}
        campaign={campaign}
        entity={editing.entity}
        entityTypes={entityTypes}
        error={error}
        fieldValues={editing.fieldValues}
        key={`${editing.entity.id}:${String(editing.entity.revision)}`}
        mode="edit"
        onCancel={returnToList}
        onSubmit={updateEntity}
      />
    );
  }
  return (
    <section aria-labelledby="entities-title">
      <button className={backClass} onClick={onBack} type="button">
        ← Voltar para detalhes da campanha
      </button>
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-stone-200 pb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="entities-title">
            Entidades
          </h1>
          <p className="mt-3 text-slate-600">
            Personagens, locais e outros elementos cadastrados nesta campanha.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className={primaryClass}
            disabled={entityTypes.length === 0}
            onClick={() => {
              setError(null);
              setView('create');
            }}
            type="button"
          >
            Nova entidade
          </button>
        </div>
      </header>

      {entityTypes.length === 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Crie ao menos um tipo de entidade antes de cadastrar entidades.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          aria-label="Filtrar por tipo"
          className={inputClass}
          onChange={(event) => setTypeFilter(event.target.value)}
          value={typeFilter}
        >
          <option value="">Todos os tipos</option>
          {entityTypes.map((entityType) => (
            <option key={entityType.id} value={entityType.id}>
              {entityType.name}
            </option>
          ))}
        </select>
        <FilterButton active={!showArchived} onClick={() => setShowArchived(false)}>
          Ativas
        </FilterButton>
        <FilterButton active={showArchived} onClick={() => setShowArchived(true)}>
          Arquivadas
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

      {pending === null ? null : (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5" role="alert">
          <h2 className="font-semibold">
            {pending.action === 'archive' ? 'Arquivar' : 'Restaurar'} “{pending.entity.name}”?
          </h2>
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
              onClick={() => void applyLifecycle()}
              type="button"
            >
              Confirmar {pending.action === 'archive' ? 'arquivamento' : 'restauração'}
            </button>
          </div>
        </div>
      )}

      {error === null ? null : (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button
            className="mt-2 text-sm font-semibold underline"
            onClick={() => void loadEntities()}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div
          aria-label="Carregando entidades"
          className="mt-8 h-32 animate-pulse rounded-2xl bg-stone-200"
        />
      ) : entities.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-8 py-14 text-center">
          <h2 className="text-xl font-semibold">
            {showArchived ? 'Nenhuma entidade arquivada' : 'Nenhuma entidade cadastrada'}
          </h2>
        </div>
      ) : (
        <div className="mt-8 grid gap-4" data-testid="entity-list">
          {entities.map((entity) => (
            <article
              className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
              key={entity.id}
            >
              <div className="flex justify-between gap-5">
                <div>
                  <h2 className="text-xl font-semibold">{entity.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full bg-stone-100 px-3 py-1">
                      {entityTypes.find((type) => type.id === entity.entityTypeId)?.singularName ??
                        'Tipo desconhecido'}
                    </span>
                    <span className="rounded-full bg-stone-100 px-3 py-1">
                      {canonStateLabel(entity.canonState)}
                    </span>
                    <span className="rounded-full bg-stone-100 px-3 py-1">
                      {knowledgeStateLabel(entity.knowledgeState)}
                    </span>
                    <span className="rounded-full bg-stone-100 px-3 py-1">
                      {visibilityLabel(entity.visibility)}
                    </span>
                  </div>
                  {entity.summary === null ? null : (
                    <p className="mt-2 text-slate-600">{entity.summary}</p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-3 border-t border-stone-100 pt-4">
                <button
                  aria-label={`Editar ${entity.name}`}
                  className={secondaryClass}
                  onClick={() => void beginEdit(entity)}
                  type="button"
                >
                  Editar
                </button>
                <button
                  aria-label={`${entity.archivedAt !== null ? 'Restaurar' : 'Arquivar'} ${entity.name}`}
                  className={secondaryClass}
                  onClick={() =>
                    setPending({
                      action: entity.archivedAt !== null ? 'restore' : 'archive',
                      entity,
                    })
                  }
                  type="button"
                >
                  {entity.archivedAt !== null ? 'Restaurar' : 'Arquivar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function canonStateLabel(value: Entity['canonState']): string {
  return { draft: 'Rascunho', accepted: 'Aceito', rejected: 'Rejeitado', archived: 'Arquivado' }[
    value
  ];
}

function knowledgeStateLabel(value: Entity['knowledgeState']): string {
  return {
    fact: 'Fato',
    rumor: 'Rumor',
    suspicion: 'Suspeita',
    secret: 'Segredo',
    possibility: 'Possibilidade',
    disproved: 'Refutado',
  }[value];
}

function visibilityLabel(value: Entity['visibility']): string {
  return { gm: 'Somente mestre', players: 'Jogadores', public: 'Público' }[value];
}

function FilterButton({
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

const inputClass =
  'mt-2 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const primaryClass =
  'rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white disabled:opacity-60';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60';
const backClass = 'mb-6 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600';
