import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { EntityType, EntityTypePatch } from '../../../core/contracts/entity-types';
import { EntityTypeForm, type EntityTypeCreateValues } from './entity-type-form';
import { FieldDefinitionManager } from '../field-definitions/field-definition-manager';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { ReorderableList } from '../../components/reorderable-list';
import type { RelativeMove } from '../../../core/ordering/move-relative';
import { Button, ButtonGroup, ToolbarActions } from '../../components/actions';
import { Icon } from '../../components/icon';
import { entityTypeColorStyle } from './entity-type-color';

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
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const loadEntityTypes = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await window.campaignManager.entityTypes.list({
      campaignId: campaign.id,
      filters: { isArchived: showArchived },
    });
    if (result.ok) setEntityTypes(result.data.items);
    else setError(presentUserFacingError(result.error, 'entity-types.list'));
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
    try {
      const result = await window.campaignManager.entityTypes.create({
        campaignId: campaign.id,
        ...values,
      });
      if (result.ok) {
        setEntityTypes((current) => [...current, result.data].sort(compareEntityTypes));
        setView('list');
        setAnnouncement(`Tipo “${result.data.name}” criado.`);
      } else {
        setError(presentUserFacingError(result.error, 'entity-types.mutate'));
      }
    } catch {
      setError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'entity-types.mutate'));
    } finally {
      setBusy(false);
    }
  }

  async function updateEntityType(patch: EntityTypePatch): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setError(null);
    try {
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
        setError(presentUserFacingError(result.error, 'entity-types.mutate'));
      }
    } catch {
      setError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'entity-types.mutate'));
    } finally {
      setBusy(false);
    }
  }

  async function moveEntityType(move: RelativeMove): Promise<void> {
    const source = entityTypes.find(({ id }) => id === move.sourceId);
    const target = entityTypes.find(({ id }) => id === move.targetId);
    if (source === undefined || target === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.entityTypes.move({
        campaignId: campaign.id,
        sourceId: source.id,
        sourceRevision: source.revision,
        targetId: target.id,
        targetRevision: target.revision,
        placement: move.placement,
      });
      if (result.ok) {
        setEntityTypes(result.data);
        setAnnouncement(`Tipo “${source.name}” reposicionado.`);
        return;
      }
      const presented = presentUserFacingError(result.error, 'entity-types.mutate');
      const refreshed = await window.campaignManager.entityTypes.list({
        campaignId: campaign.id,
        filters: { isArchived: false },
      });
      if (refreshed.ok) setEntityTypes(refreshed.data.items);
      setError(presented);
      throw new Error(presented.message);
    } finally {
      setBusy(false);
    }
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
      setError(presentUserFacingError(result.error, 'entity-types.mutate'));
    }
    setBusy(false);
  }

  if (view === 'create') {
    return (
      <>
        <EntityTypeForm
          busy={busy}
          error={null}
          mode="create"
          onCancel={returnToList}
          onSubmit={createEntityType}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-3xl">
            <UserFacingErrorNotice error={error} operation="entity-types.mutate" />
          </div>
        )}
      </>
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
      <>
        <EntityTypeForm
          busy={busy}
          entityType={editing}
          error={null}
          key={`${editing.id}:${String(editing.revision)}`}
          mode="edit"
          onCancel={returnToList}
          onSubmit={updateEntityType}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-3xl">
            <UserFacingErrorNotice error={error} operation="entity-types.mutate" />
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="entity-types-title">
      <Button className="mb-6" onClick={onBack} size="small" variant="ghost">
        <span aria-hidden="true">←</span>
        Voltar para detalhes da campanha
      </Button>

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
          <Button onClick={beginCreate} size="large" variant="primary">
            Novo tipo
          </Button>
        ) : null}
      </header>

      <ToolbarActions aria-label="Estado dos tipos de entidade" className="mt-6 gap-2">
        <FilterButton active={!showArchived} onClick={() => selectArchived(false)}>
          Ativos
        </FilterButton>
        <FilterButton active={showArchived} onClick={() => selectArchived(true)}>
          Arquivados
        </FilterButton>
      </ToolbarActions>

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
          <ButtonGroup aria-label="Ações de confirmação" className="mt-4">
            <Button disabled={busy} onClick={() => setPendingLifecycle(null)}>
              Cancelar ação
            </Button>
            <Button busy={busy} onClick={() => void applyLifecycle()} variant="primary">
              {pendingLifecycle.action === 'archive'
                ? 'Confirmar arquivamento do tipo'
                : 'Confirmar restauração do tipo'}
            </Button>
          </ButtonGroup>
        </div>
      )}

      {error === null ? null : (
        <div className="mt-6">
          <UserFacingErrorNotice
            error={error}
            operation="entity-types.list"
            onRetry={() => void loadEntityTypes()}
          />
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
            <Button className="mt-6" onClick={beginCreate} size="large" variant="primary">
              Criar primeiro tipo
            </Button>
          ) : null}
        </div>
      ) : (
        <ReorderableList
          ariaLabel={showArchived ? 'Tipos de entidade arquivados' : 'Ordenar tipos de entidade'}
          busy={busy}
          className="mt-8 grid gap-4"
          getLabel={(entityType) => entityType.name}
          items={entityTypes}
          onMove={moveEntityType}
          reorderable={!showArchived}
          renderItem={(entityType) => (
            <EntityTypeCard
              entityType={entityType}
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
          )}
        />
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
            data-testid="entity-type-icon"
            style={entityTypeColorStyle(entityType.color)}
          >
            {entityType.icon === null ? (
              entityType.singularName.slice(0, 1).toUpperCase()
            ) : (
              <Icon className="size-6" value={entityType.icon} />
            )}
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
      </div>
      <ToolbarActions
        aria-label={`Ações de ${entityType.name}`}
        className="mt-5 justify-end border-t border-stone-100 pt-4"
      >
        <Button aria-label={`Gerenciar campos de ${entityType.name}`} onClick={onFields}>
          Gerenciar campos
        </Button>
        <Button aria-label={`Editar tipo ${entityType.name}`} onClick={onEdit}>
          Editar
        </Button>
        <Button
          aria-label={`${entityType.isArchived ? 'Restaurar' : 'Arquivar'} tipo ${entityType.name}`}
          onClick={onLifecycle}
        >
          {entityType.isArchived ? 'Restaurar' : 'Arquivar'}
        </Button>
      </ToolbarActions>
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

function compareEntityTypes(left: EntityType, right: EntityType): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'pt-BR');
}
