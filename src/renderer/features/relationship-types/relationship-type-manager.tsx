import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { EntityType } from '../../../core/contracts/entity-types';
import type {
  RelationshipType,
  RelationshipTypePatch,
} from '../../../core/contracts/relationship-types';
import { RelationshipTypeForm, type RelationshipTypeCreateValues } from './relationship-type-form';

type View = 'list' | 'create' | 'edit';

export function RelationshipTypeManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<RelationshipType | null>(null);
  const [pending, setPending] = useState<RelationshipType | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const [relationshipResult, entityResult] = await Promise.all([
      window.campaignManager.relationshipTypes.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { isArchived: showArchived },
      }),
      window.campaignManager.entityTypes.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { isArchived: false },
      }),
    ]);
    if (!relationshipResult.ok) setError(relationshipResult.error.message);
    else setTypes(relationshipResult.data.items);
    if (!entityResult.ok) setError(entityResult.error.message);
    else setEntityTypes(entityResult.data.items);
    setLoading(false);
  }, [campaign.id, showArchived]);

  useEffect(() => void load(), [load]);

  async function create(values: RelationshipTypeCreateValues): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.relationshipTypes.create({
        campaignId: campaign.id,
        ...values,
      });
      if (!result.ok) setError(result.error.message);
      else {
        setTypes((current) => [...current, result.data].sort(compare));
        setView('list');
        setAnnouncement(`Tipo de relação “${result.data.name}” criado.`);
      }
    } catch {
      setError(validationMessage);
    } finally {
      setBusy(false);
    }
  }

  async function update(patch: RelationshipTypePatch): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.relationshipTypes.update({
        campaignId: campaign.id,
        id: editing.id,
        revision: editing.revision,
        patch,
      });
      if (!result.ok) setError(result.error.message);
      else {
        setTypes((current) =>
          current.map((item) => (item.id === result.data.id ? result.data : item)).sort(compare),
        );
        setEditing(null);
        setView('list');
        setAnnouncement(`Tipo de relação “${result.data.name}” atualizado.`);
      }
    } catch {
      setError(validationMessage);
    } finally {
      setBusy(false);
    }
  }

  async function changeLifecycle(): Promise<void> {
    if (pending === null) return;
    setBusy(true);
    const input = { campaignId: campaign.id, id: pending.id, revision: pending.revision };
    const result = pending.isArchived
      ? await window.campaignManager.relationshipTypes.restore(input)
      : await window.campaignManager.relationshipTypes.archive(input);
    if (!result.ok) setError(result.error.message);
    else {
      setTypes((current) => current.filter(({ id }) => id !== result.data.id));
      setAnnouncement(
        `Tipo de relação “${result.data.name}” ${pending.isArchived ? 'restaurado' : 'arquivado'}.`,
      );
      setPending(null);
    }
    setBusy(false);
  }

  if (view === 'create')
    return (
      <RelationshipTypeForm
        busy={busy}
        entityTypes={entityTypes}
        error={error}
        mode="create"
        onCancel={() => setView('list')}
        onSubmit={create}
      />
    );
  if (view === 'edit' && editing !== null)
    return (
      <RelationshipTypeForm
        busy={busy}
        entityTypes={entityTypes}
        error={error}
        key={`${editing.id}:${String(editing.revision)}`}
        mode="edit"
        onCancel={() => {
          setEditing(null);
          setView('list');
        }}
        onSubmit={update}
        relationshipType={editing}
      />
    );

  return (
    <section aria-labelledby="relationship-types-title">
      <button className={backClass} onClick={onBack} type="button">
        ← Voltar para detalhes da campanha
      </button>
      <header className="flex items-end justify-between gap-6 border-b border-stone-200 pb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            Grafo de {campaign.name}
          </p>
          <h1 id="relationship-types-title" className="mt-2 text-4xl font-semibold">
            Tipos de relação
          </h1>
          <p className="mt-3 text-slate-600">
            Configure conexões direcionais, inversas ou simétricas entre entidades.
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
            Novo tipo de relação
          </button>
        ) : null}
      </header>
      <div className="mt-6 flex gap-2" role="group" aria-label="Estado dos tipos de relação">
        <Filter
          active={!showArchived}
          onClick={() => {
            setShowArchived(false);
            setAnnouncement(null);
          }}
        >
          Ativos
        </Filter>
        <Filter
          active={showArchived}
          onClick={() => {
            setShowArchived(true);
            setAnnouncement(null);
          }}
        >
          Arquivados
        </Filter>
      </div>
      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          role="status"
        >
          {announcement}
        </p>
      )}
      {pending === null ? null : (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5" role="alert">
          <h2 className="font-semibold">
            {pending.isArchived ? 'Restaurar' : 'Arquivar'} “{pending.name}”?
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            O tipo permanecerá preservado e poderá ser restaurado.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setPending(null)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() => void changeLifecycle()}
              type="button"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
      {error === null ? null : (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button
            className="mt-3 text-sm font-semibold text-red-800 underline"
            onClick={() => void load()}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <div aria-busy="true" aria-label="Carregando tipos de relação" className="mt-8 grid gap-4">
          {[0, 1, 2].map((item) => (
            <div className="h-32 animate-pulse rounded-2xl bg-stone-200" key={item} />
          ))}
        </div>
      ) : types.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-8 py-14 text-center">
          <h2 className="text-xl font-semibold">
            {showArchived ? 'Nenhum tipo arquivado' : 'Nenhum tipo de relação criado'}
          </h2>
          <p className="mt-2 text-slate-600">
            {showArchived
              ? 'Tipos arquivados aparecerão aqui.'
              : 'Crie a primeira linguagem de conexão deste mundo.'}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4" data-testid="relationship-type-list">
          {types.map((type) => (
            <RelationshipTypeCard
              entityTypes={entityTypes}
              key={type.id}
              onEdit={() => {
                setEditing(type);
                setView('edit');
              }}
              onLifecycle={() => setPending(type)}
              relationshipType={type}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RelationshipTypeCard({
  entityTypes,
  onEdit,
  onLifecycle,
  relationshipType,
}: {
  entityTypes: EntityType[];
  onEdit: () => void;
  onLifecycle: () => void;
  relationshipType: RelationshipType;
}): React.JSX.Element {
  const entityTypeNames = new Map(entityTypes.map((type) => [type.id, type.name]));
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold">{relationshipType.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {relationshipType.slug} ·{' '}
            {relationshipType.isSymmetric
              ? 'Simétrica'
              : `Inversa: ${relationshipType.inverseName ?? 'não definida'}`}
          </p>
          {relationshipType.description === null ? null : (
            <p className="mt-3 text-slate-600">{relationshipType.description}</p>
          )}
          <p className="mt-3 text-sm text-slate-600">
            Origem: {allowedLabel(relationshipType.allowedSourceTypeIds, entityTypeNames)} ·
            Destino: {allowedLabel(relationshipType.allowedTargetTypeIds, entityTypeNames)}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-500">
          Ordem {relationshipType.sortOrder}
        </span>
      </div>
      <div className="mt-5 flex justify-end gap-3 border-t border-stone-100 pt-4">
        <button className={secondaryClass} onClick={onEdit} type="button">
          Editar
        </button>
        <button className={secondaryClass} onClick={onLifecycle} type="button">
          {relationshipType.isArchived ? 'Restaurar' : 'Arquivar'}
        </button>
      </div>
    </article>
  );
}
function Filter({
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
      className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-slate-900 text-white' : 'border border-stone-300 bg-white text-slate-600'}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
function allowedLabel(ids: string[] | null, names: Map<string, string>): string {
  if (ids === null) return 'qualquer tipo';
  return ids.map((id) => names.get(id) ?? 'tipo arquivado').join(', ');
}
function compare(left: RelationshipType, right: RelationshipType): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'pt-BR');
}
const primaryClass =
  'rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 disabled:opacity-60';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-stone-50 disabled:opacity-60';
const backClass =
  'mb-6 inline-flex rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:text-slate-950';
const validationMessage = 'Não foi possível validar os dados. Revise os campos e tente novamente.';
