import { useCallback, useEffect, useState } from 'react';
import { useNavigationState, useRestoredRecord } from '../../app/navigation-provider';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { EntityType } from '../../../core/contracts/entity-types';
import type {
  RelationshipType,
  RelationshipTypePatch,
} from '../../../core/contracts/relationship-types';
import { RelationshipTypeForm, type RelationshipTypeCreateValues } from './relationship-type-form';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { ReorderableList } from '../../components/reorderable-list';
import type { RelativeMove } from '../../../core/ordering/move-relative';
import { Button, ButtonGroup, ToolbarActions } from '../../components/actions';
import { Icon } from '../../components/icon';
import { entityTypeColorStyle } from '../entity-types/entity-type-color';

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
  const [showArchived, , setShowArchived] = useNavigationState(
    `relationship-types:${campaign.id}:archived`,
    false,
  );
  const [view, setView] = useNavigationState<View>(
    `relationship-types:${campaign.id}:view`,
    'list',
  );
  const [editing, , setEditing] = useNavigationState<RelationshipType | null>(
    `relationship-types:${campaign.id}:editing`,
    null,
  );
  const [pending, setPending] = useState<RelationshipType | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useRestoredRecord(
    view === 'edit' ? editing?.id : undefined,
    (id) => window.campaignManager.relationshipTypes.get({ campaignId: campaign.id, id }),
    setEditing,
    (failure) => setError(presentUserFacingError(failure, 'relationship-types.mutate')),
    setBusy,
  );

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
    if (!relationshipResult.ok)
      setError(presentUserFacingError(relationshipResult.error, 'relationship-types.list'));
    else setTypes(relationshipResult.data.items);
    if (!entityResult.ok) setError(presentUserFacingError(entityResult.error, 'entity-types.list'));
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
      if (!result.ok) setError(presentUserFacingError(result.error, 'relationship-types.mutate'));
      else {
        setTypes((current) => [...current, result.data].sort(compare));
        setView('list');
        setAnnouncement(`Tipo de relação “${result.data.name}” criado.`);
      }
    } catch {
      setError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'relationship-types.mutate'));
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
      if (!result.ok) setError(presentUserFacingError(result.error, 'relationship-types.mutate'));
      else {
        setTypes((current) =>
          current.map((item) => (item.id === result.data.id ? result.data : item)).sort(compare),
        );
        setEditing(null);
        setView('list');
        setAnnouncement(`Tipo de relação “${result.data.name}” atualizado.`);
      }
    } catch {
      setError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'relationship-types.mutate'));
    } finally {
      setBusy(false);
    }
  }

  async function moveRelationshipType(move: RelativeMove): Promise<void> {
    const source = types.find(({ id }) => id === move.sourceId);
    const target = types.find(({ id }) => id === move.targetId);
    if (source === undefined || target === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.relationshipTypes.move({
        campaignId: campaign.id,
        sourceId: source.id,
        sourceRevision: source.revision,
        targetId: target.id,
        targetRevision: target.revision,
        placement: move.placement,
      });
      if (result.ok) {
        setTypes(result.data);
        setAnnouncement(`Tipo de relação “${source.name}” reposicionado.`);
        return;
      }
      const presented = presentUserFacingError(result.error, 'relationship-types.mutate');
      const refreshed = await window.campaignManager.relationshipTypes.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { isArchived: false },
      });
      if (refreshed.ok) setTypes(refreshed.data.items);
      setError(presented);
      throw new Error(presented.message);
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
    if (!result.ok) setError(presentUserFacingError(result.error, 'relationship-types.mutate'));
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
      <>
        <RelationshipTypeForm
          busy={busy}
          entityTypes={entityTypes}
          error={null}
          mode="create"
          onCancel={() => {
            setError(null);
            setView('list');
          }}
          onSubmit={create}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-3xl">
            <UserFacingErrorNotice error={error} operation="relationship-types.mutate" />
          </div>
        )}
      </>
    );
  if (view === 'edit' && editing !== null)
    return (
      <>
        <RelationshipTypeForm
          busy={busy}
          entityTypes={entityTypes}
          error={null}
          key={`${editing.id}:${String(editing.revision)}`}
          mode="edit"
          onCancel={() => {
            setEditing(null);
            setView('list');
            setError(null);
          }}
          onSubmit={update}
          relationshipType={editing}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-3xl">
            <UserFacingErrorNotice error={error} operation="relationship-types.mutate" />
          </div>
        )}
      </>
    );

  return (
    <section aria-labelledby="relationship-types-title">
      <Button className="mb-6" onClick={onBack} size="small" variant="ghost">
        ← Voltar para detalhes da campanha
      </Button>
      <header className="flex items-end justify-between gap-6 border-b semantic-border pb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
            Grafo de {campaign.name}
          </p>
          <h1 id="relationship-types-title" className="mt-2 text-4xl font-semibold">
            Tipos de relação
          </h1>
          <p className="mt-3 semantic-text-secondary">
            Configure conexões direcionais, inversas ou simétricas entre entidades.
          </p>
        </div>
        {!showArchived ? (
          <Button
            onClick={() => {
              setError(null);
              setView('create');
            }}
            size="large"
            variant="primary"
          >
            Novo tipo de relação
          </Button>
        ) : null}
      </header>
      <ToolbarActions aria-label="Estado dos tipos de relação" className="mt-6 gap-2">
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
      </ToolbarActions>
      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-6 rounded-xl border semantic-success-border semantic-success-surface p-4 text-sm semantic-success-text"
          role="status"
        >
          {announcement}
        </p>
      )}
      {pending === null ? null : (
        <div
          className="mt-6 rounded-2xl border semantic-warning-border semantic-warning-surface p-5"
          role="alert"
        >
          <h2 className="font-semibold">
            {pending.isArchived ? 'Restaurar' : 'Arquivar'} “{pending.name}”?
          </h2>
          <p className="mt-2 text-sm semantic-text-secondary">
            O tipo permanecerá preservado e poderá ser restaurado.
          </p>
          <ButtonGroup aria-label="Ações de confirmação" className="mt-4">
            <Button disabled={busy} onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button busy={busy} onClick={() => void changeLifecycle()} variant="primary">
              Confirmar
            </Button>
          </ButtonGroup>
        </div>
      )}
      {error === null ? null : (
        <div className="mt-6">
          <UserFacingErrorNotice
            error={error}
            operation="relationship-types.list"
            onRetry={() => void load()}
          />
        </div>
      )}
      {loading ? (
        <div aria-busy="true" aria-label="Carregando tipos de relação" className="mt-8 grid gap-4">
          {[0, 1, 2].map((item) => (
            <div className="h-32 animate-pulse rounded-2xl semantic-skeleton" key={item} />
          ))}
        </div>
      ) : types.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed semantic-border semantic-surface px-8 py-14 text-center">
          <h2 className="text-xl font-semibold">
            {showArchived ? 'Nenhum tipo arquivado' : 'Nenhum tipo de relação criado'}
          </h2>
          <p className="mt-2 semantic-text-secondary">
            {showArchived
              ? 'Tipos arquivados aparecerão aqui.'
              : 'Crie a primeira linguagem de conexão deste mundo.'}
          </p>
        </div>
      ) : (
        <ReorderableList
          ariaLabel={showArchived ? 'Tipos de relação arquivados' : 'Ordenar tipos de relação'}
          busy={busy}
          className="mt-8 grid gap-4"
          getLabel={(type) => type.name}
          items={types}
          onMove={moveRelationshipType}
          reorderable={!showArchived}
          renderItem={(type) => (
            <RelationshipTypeCard
              entityTypes={entityTypes}
              onEdit={() => {
                setEditing(type);
                setError(null);
                setView('edit');
              }}
              onLifecycle={() => setPending(type)}
              relationshipType={type}
            />
          )}
        />
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
    <article className="rounded-2xl border semantic-border semantic-surface p-6 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 gap-4">
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-xl semantic-selected-surface text-lg font-bold semantic-selected-text"
            data-testid="relationship-type-icon"
            style={entityTypeColorStyle(relationshipType.color)}
          >
            {relationshipType.icon === null ? (
              relationshipType.name.slice(0, 1).toUpperCase()
            ) : (
              <Icon className="size-6" value={relationshipType.icon} />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{relationshipType.name}</h2>
            <p className="mt-1 text-sm semantic-text-secondary">
              {relationshipType.isSymmetric
                ? 'Simétrica'
                : `Inversa: ${relationshipType.inverseName ?? 'não definida'}`}
            </p>
            {relationshipType.description === null ? null : (
              <p className="mt-3 semantic-text-secondary">{relationshipType.description}</p>
            )}
            <p className="mt-3 text-sm semantic-text-secondary">
              Origem: {allowedLabel(relationshipType.allowedSourceTypeIds, entityTypeNames)} ·
              Destino: {allowedLabel(relationshipType.allowedTargetTypeIds, entityTypeNames)}
            </p>
          </div>
        </div>
      </div>
      <ToolbarActions
        aria-label={`Ações de ${relationshipType.name}`}
        className="mt-5 justify-end border-t semantic-border pt-4"
      >
        <Button onClick={onEdit}>Editar</Button>
        <Button onClick={onLifecycle}>
          {relationshipType.isArchived ? 'Restaurar' : 'Arquivar'}
        </Button>
      </ToolbarActions>
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
    <Button
      aria-pressed={active}
      className={`rounded-full ${active ? 'semantic-selected-surface semantic-selected-text' : ''}`}
      onClick={onClick}
      size="small"
    >
      {children}
    </Button>
  );
}
function allowedLabel(ids: string[] | null, names: Map<string, string>): string {
  if (ids === null) return 'qualquer tipo';
  return ids.map((id) => names.get(id) ?? 'tipo arquivado').join(', ');
}
function compare(left: RelationshipType, right: RelationshipType): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'pt-BR');
}
