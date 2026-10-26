import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity, EntityDetails, EntityLifecycleInput } from '../../../core/contracts/entities';
import type { EntityType } from '../../../core/contracts/entity-types';
import { EntityForm, type EntityFormSubmitValues } from './entity-form';
import { EntityDetailsView } from './entity-details';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { Button, ButtonGroup, ToolbarActions } from '../../components/actions';

type View = 'list' | 'create' | 'details' | 'edit';
type LifecycleAction = 'archive' | 'restore';

export function EntityManager({
  campaign,
  onBack,
  onOpenAssertions,
  onOpenNotes,
  onOpenTimeline,
  onOpenRelationships,
  initialDetailEntity,
  focusRelationshipButton = false,
}: {
  campaign: Campaign;
  onBack: () => void;
  onOpenAssertions: (entity: Entity) => void;
  onOpenNotes: (entity: Entity) => void;
  onOpenTimeline: (entity: Entity) => void;
  onOpenRelationships: (entity: Entity) => void;
  initialDetailEntity?: Entity;
  focusRelationshipButton?: boolean;
}): React.JSX.Element {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<EntityDetails | null>(null);
  const [viewing, setViewing] = useState<EntityDetails | null>(null);
  const [pending, setPending] = useState<{ action: LifecycleAction; entity: Entity } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const listFocusTargetRef = useRef<string | null>(null);
  const [pendingListFocusTarget, setPendingListFocusTarget] = useState<string | null>(null);
  const loadedInitialDetailEntityId = useRef<string | null>(null);

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
    else setError(presentUserFacingError(result.error, 'entities.list'));
    setLoading(false);
  }, [campaign.id, showArchived, typeFilter]);

  useEffect(() => {
    void loadEntityTypes();
  }, [loadEntityTypes]);
  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);
  useEffect(() => {
    if (view !== 'list' || pendingListFocusTarget === null) return;
    document
      .querySelector<HTMLElement>(`[data-entity-focus-id="${pendingListFocusTarget}"]`)
      ?.focus();
    setPendingListFocusTarget(null);
  }, [entities, pendingListFocusTarget, view]);
  useEffect(() => {
    if (
      initialDetailEntity?.campaignId !== campaign.id ||
      loadedInitialDetailEntityId.current === initialDetailEntity.id
    )
      return;
    loadedInitialDetailEntityId.current = initialDetailEntity.id;
    void loadDetails(initialDetailEntity, 'details');
  }, [campaign.id, initialDetailEntity]);

  function restoreListFocus(): void {
    if (listFocusTargetRef.current !== null) setPendingListFocusTarget(listFocusTargetRef.current);
  }

  function returnToList(): void {
    restoreListFocus();
    setEditing(null);
    setViewing(null);
    setError(null);
    setView('list');
  }

  async function loadDetails(entity: Entity, destination: 'details' | 'edit'): Promise<void> {
    setBusy(true);
    setError(null);
    const details = await window.campaignManager.entities.get({
      campaignId: campaign.id,
      id: entity.id,
    });
    setBusy(false);
    if (!details.ok) {
      setError(presentUserFacingError(details.error, 'entities.mutate'));
      return;
    }
    if (destination === 'details') setViewing(details.data);
    else setEditing(details.data);
    setView(destination);
  }

  function openDetails(entity: Entity, focusTarget: string): void {
    listFocusTargetRef.current = focusTarget;
    void loadDetails(entity, 'details');
  }

  function beginEditFromDetails(): void {
    if (viewing === null) return;
    setEditing(viewing);
    setViewing(null);
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
      referenceValues: values.referenceValues,
    });
    if (!result.ok) {
      setError(presentUserFacingError(result.error, 'entities.mutate'));
      setBusy(false);
      return;
    }
    setAnnouncement(`Entidade “${result.data.entity.name}” criada.`);
    listFocusTargetRef.current = null;
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
      referenceValues: values.referenceValues,
    });
    if (!result.ok) {
      setError(presentUserFacingError(result.error, 'entities.mutate'));
      setBusy(false);
      return;
    }
    setAnnouncement(`Entidade “${result.data.entity.name}” atualizada.`);
    restoreListFocus();
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
      setError(presentUserFacingError(result.error, 'entities.mutate'));
    }
    setBusy(false);
  }

  if (view === 'create') {
    return (
      <>
        <EntityForm
          busy={busy}
          campaign={campaign}
          entityTypes={entityTypes}
          error={null}
          mode="create"
          onCancel={returnToList}
          onSubmit={createEntity}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-5xl">
            <UserFacingErrorNotice error={error} operation="entities.mutate" />
          </div>
        )}
      </>
    );
  }
  if (view === 'edit' && editing !== null) {
    return (
      <>
        <EntityForm
          busy={busy}
          campaign={campaign}
          entity={editing.entity}
          entityTypes={entityTypes}
          error={null}
          fieldValues={editing.fieldValues}
          key={`${editing.entity.id}:${String(editing.entity.revision)}`}
          mode="edit"
          onCancel={returnToList}
          onSubmit={updateEntity}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-5xl">
            <UserFacingErrorNotice error={error} operation="entities.mutate" />
          </div>
        )}
      </>
    );
  }
  if (view === 'details' && viewing !== null) {
    return (
      <EntityDetailsView
        campaign={campaign}
        details={viewing}
        entityTypes={entityTypes}
        onBack={returnToList}
        onEdit={beginEditFromDetails}
        onOpenAssertions={() => onOpenAssertions(viewing.entity)}
        onOpenNotes={() => onOpenNotes(viewing.entity)}
        onOpenTimeline={() => onOpenTimeline(viewing.entity)}
        onOpenRelationships={onOpenRelationships}
        focusRelationshipButton={
          focusRelationshipButton && initialDetailEntity?.id === viewing.entity.id
        }
      />
    );
  }
  return (
    <section aria-labelledby="entities-title">
      <Button className="mb-6" onClick={onBack} size="small" variant="ghost">
        ← Voltar para detalhes da campanha
      </Button>
      <header className="flex flex-wrap items-end justify-between gap-6 border-b semantic-border pb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="entities-title">
            Entidades
          </h1>
          <p className="mt-3 semantic-text-secondary">
            Personagens, locais e outros elementos cadastrados nesta campanha.
          </p>
        </div>
        <ToolbarActions aria-label="Ações de entidades">
          <Button
            disabled={entityTypes.length === 0}
            onClick={() => {
              listFocusTargetRef.current = null;
              setError(null);
              setView('create');
            }}
            size="large"
            variant="primary"
          >
            Nova entidade
          </Button>
        </ToolbarActions>
      </header>

      {entityTypes.length === 0 ? (
        <p className="mt-6 rounded-xl border semantic-warning-border semantic-warning-surface p-4 text-sm semantic-accent-text">
          Crie ao menos um tipo de entidade antes de cadastrar entidades.
        </p>
      ) : null}

      <ToolbarActions aria-label="Filtros de entidades" className="mt-6">
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
      </ToolbarActions>

      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-6 rounded-xl border semantic-success-border semantic-success-surface px-4 py-3 text-sm semantic-success-text"
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
            {pending.action === 'archive' ? 'Arquivar' : 'Restaurar'} “{pending.entity.name}”?
          </h2>
          <ButtonGroup aria-label="Ações de confirmação" className="mt-4">
            <Button disabled={busy} onClick={() => setPending(null)}>
              Cancelar ação
            </Button>
            <Button busy={busy} onClick={() => void applyLifecycle()} variant="primary">
              Confirmar {pending.action === 'archive' ? 'arquivamento' : 'restauração'}
            </Button>
          </ButtonGroup>
        </div>
      )}

      {error === null ? null : (
        <div className="mt-6">
          <UserFacingErrorNotice
            error={error}
            operation="entities.list"
            onRetry={() => void loadEntities()}
          />
        </div>
      )}

      {loading ? (
        <div
          aria-label="Carregando entidades"
          className="mt-8 h-32 animate-pulse rounded-2xl semantic-skeleton"
        />
      ) : entities.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed semantic-border semantic-surface px-8 py-14 text-center">
          <h2 className="text-xl font-semibold">
            {showArchived ? 'Nenhuma entidade arquivada' : 'Nenhuma entidade cadastrada'}
          </h2>
        </div>
      ) : (
        <div className="mt-8 grid gap-4" data-testid="entity-list">
          {entities.map((entity) => (
            <article
              className="rounded-2xl border semantic-border semantic-surface p-6 shadow-sm"
              key={entity.id}
            >
              <div className="flex justify-between gap-5">
                <div>
                  <h2 className="text-xl font-semibold">
                    <Button
                      aria-label={`Abrir detalhes de ${entity.name}`}
                      className="justify-start text-left"
                      data-entity-focus-id={`${entity.id}:title`}
                      onClick={() => openDetails(entity, `${entity.id}:title`)}
                      size="inline"
                      variant="link"
                    >
                      {entity.name}
                    </Button>
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold semantic-text-secondary">
                    <span className="rounded-full semantic-surface-muted px-3 py-1">
                      {entityTypes.find((type) => type.id === entity.entityTypeId)?.singularName ??
                        'Tipo desconhecido'}
                    </span>
                    <span className="rounded-full semantic-surface-muted px-3 py-1">
                      {canonStateLabel(entity.canonState)}
                    </span>
                    <span className="rounded-full semantic-surface-muted px-3 py-1">
                      {knowledgeStateLabel(entity.knowledgeState)}
                    </span>
                    <span className="rounded-full semantic-surface-muted px-3 py-1">
                      {visibilityLabel(entity.visibility)}
                    </span>
                  </div>
                  {entity.summary === null ? null : (
                    <p className="mt-2 semantic-text-secondary">{entity.summary}</p>
                  )}
                </div>
              </div>
              <ToolbarActions
                aria-label={`Ações de ${entity.name}`}
                className="mt-5 justify-end border-t semantic-border pt-4"
              >
                <Button
                  aria-label={`Ver afirmações de ${entity.name}`}
                  onClick={() => onOpenAssertions(entity)}
                >
                  Afirmações
                </Button>
                <Button
                  aria-label={`Ver notas de ${entity.name}`}
                  onClick={() => onOpenNotes(entity)}
                >
                  Notas
                </Button>
                <Button
                  aria-label={`Ver cronologia de ${entity.name}`}
                  onClick={() => onOpenTimeline(entity)}
                >
                  Cronologia
                </Button>
                <Button
                  aria-label={`Abrir detalhes de ${entity.name}`}
                  data-entity-focus-id={`${entity.id}:details`}
                  onClick={() => openDetails(entity, `${entity.id}:details`)}
                >
                  Ver detalhes
                </Button>
                <Button
                  aria-label={`${entity.archivedAt !== null ? 'Restaurar' : 'Arquivar'} ${entity.name}`}
                  onClick={() =>
                    setPending({
                      action: entity.archivedAt !== null ? 'restore' : 'archive',
                      entity,
                    })
                  }
                >
                  {entity.archivedAt !== null ? 'Restaurar' : 'Arquivar'}
                </Button>
              </ToolbarActions>
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

const inputClass =
  'mt-2 w-full rounded-xl border semantic-border px-4 py-2.5 semantic-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 semantic-focus-outline';
