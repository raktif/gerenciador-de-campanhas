import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type { RelationshipType } from '../../../core/contracts/relationship-types';
import type { RelationshipViewState } from '../../../core/contracts/relationship-views';
import type {
  Relationship,
  RelationshipNeighborhoodResult,
} from '../../../core/contracts/relationships';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { Button } from '../../components/actions';
import { RelationshipCanvas, RelationshipLayoutUnavailableNotice } from './relationship-canvas';
import {
  createRelationshipAutoLayoutModel,
  createRelationshipCanvasModel,
} from './relationship-canvas-model';
import {
  idleRelationshipLayoutStatus,
  RelationshipLayoutController,
  type RelationshipLayoutPersistenceStatus,
} from './relationship-layout-controller';
import { relationshipMetadataSummary } from './relationship-metadata-labels';
import { RelationshipTextAccordion } from './relationship-text-accordion';

interface NeighborhoodFilters {
  relationshipTypeId: string;
  canonState: string;
  knowledgeState: string;
  visibility: string;
}
const emptyFilters: NeighborhoodFilters = {
  relationshipTypeId: '',
  canonState: '',
  knowledgeState: '',
  visibility: '',
};

export function RelationshipNeighborhood({
  campaign,
  entities,
  types,
  centralEntityId,
  directOnly = false,
}: {
  campaign: Campaign;
  entities: Entity[];
  types: RelationshipType[];
  centralEntityId?: string;
  directOnly?: boolean;
}): React.JSX.Element {
  const [entityId, setEntityId] = useState('');
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<RelationshipNeighborhoodResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [layoutState, setLayoutState] = useState<RelationshipViewState | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(true);
  const [layoutLoadFailed, setLayoutLoadFailed] = useState(false);
  const [layoutReloadKey, setLayoutReloadKey] = useState(0);
  const [layoutStatus, setLayoutStatus] = useState<RelationshipLayoutPersistenceStatus>(
    idleRelationshipLayoutStatus,
  );
  const layoutStateRef = useRef<RelationshipViewState | null>(null);
  const initializedCentralContext = useRef<string | null>(null);

  const acceptLayoutState = useCallback((state: RelationshipViewState) => {
    layoutStateRef.current = state;
    setLayoutState(state);
    setLayoutLoadFailed(false);
  }, []);
  const layoutController = useMemo(
    () =>
      new RelationshipLayoutController({
        campaignId: campaign.id,
        gateway: window.campaignManager.relationshipViews,
        getState: () => layoutStateRef.current,
        onState: acceptLayoutState,
        onStatus: setLayoutStatus,
      }),
    [acceptLayoutState, campaign.id],
  );

  useEffect(() => () => layoutController.dispose(), [layoutController]);

  useEffect(() => {
    if (centralEntityId === undefined) return;
    const validCentralEntityId = resolveCentralEntityId(centralEntityId, campaign.id, entities);
    if (validCentralEntityId === '') return;
    const contextKey = `${campaign.id}:${validCentralEntityId}`;
    if (initializedCentralContext.current === contextKey) return;
    initializedCentralContext.current = contextKey;
    setEntityId(validCentralEntityId);
    setDepth(1);
  }, [campaign.id, centralEntityId, entities]);

  useEffect(() => {
    let cancelled = false;
    layoutStateRef.current = null;
    setLayoutState(null);
    setLayoutLoading(true);
    setLayoutLoadFailed(false);
    setLayoutStatus(idleRelationshipLayoutStatus);
    void window.campaignManager.relationshipViews
      .get({ campaignId: campaign.id, viewType: 'campaign', sourceEntityId: null })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) acceptLayoutState(response.data);
        else setLayoutLoadFailed(true);
      })
      .catch(() => {
        if (!cancelled) setLayoutLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLayoutLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [acceptLayoutState, campaign.id, layoutReloadKey]);

  useEffect(() => {
    let cancelled = false;
    if (entityId === '') {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    void window.campaignManager.relationships
      .neighborhood({
        campaignId: campaign.id,
        entityId,
        depth,
        directOnly,
        filters: {
          relationshipTypeIds:
            filters.relationshipTypeId === '' ? [] : [filters.relationshipTypeId],
          canonStates:
            filters.canonState === '' ? [] : [filters.canonState as Relationship['canonState']],
          knowledgeStates:
            filters.knowledgeState === ''
              ? []
              : [filters.knowledgeState as Relationship['knowledgeState']],
          visibilities:
            filters.visibility === '' ? [] : [filters.visibility as Relationship['visibility']],
        },
      })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) setResult(response.data);
        else {
          setResult(null);
          setError(presentUserFacingError(response.error, 'relationships.list'));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign.id, depth, directOnly, entityId, filters]);

  const entityNames = useMemo(
    () => new Map((result?.nodes ?? []).map((node) => [node.entity.id, node.entity.name])),
    [result],
  );
  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);
  const nodeDepthById = useMemo(
    () => new Map((result?.nodes ?? []).map((node) => [node.entity.id, node.depth])),
    [result],
  );
  const graphModel = useMemo(
    () =>
      result === null
        ? null
        : createRelationshipCanvasModel(result, types, layoutState?.nodes ?? []),
    [layoutState?.nodes, result, types],
  );
  const automaticGraphModel = useMemo(
    () => (result === null ? null : createRelationshipAutoLayoutModel(result, types)),
    [result, types],
  );

  return (
    <section
      className="mt-8 rounded-2xl border semantic-border semantic-surface-muted p-6"
      aria-labelledby="neighborhood-title"
    >
      <div>
        <p className="text-xs font-bold tracking-[0.16em] semantic-accent-text uppercase">
          Exploração
        </p>
        <h2 className="mt-1 text-2xl font-semibold" id="neighborhood-title">
          Vizinhança de uma entidade
        </h2>
        <p className="mt-2 text-sm semantic-text-secondary">
          Navegue pelas conexões sem carregar o grafo inteiro da campanha.
        </p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Select
          label="Entidade central"
          value={entityId}
          onChange={setEntityId}
          options={entities.map((entity) => ({
            value: entity.id,
            label: `${entity.name}${entity.archivedAt === null ? '' : ' (arquivada)'}`,
          }))}
        />
        <label className={labelClass}>
          Profundidade
          <select
            className={inputClass}
            disabled={directOnly}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value) as 1 | 2 | 3)}
          >
            <option value={1}>1 — conexões diretas</option>
            <option value={2}>2 — duas camadas</option>
            <option value={3}>3 — três camadas</option>
          </select>
        </label>
        <Select
          label="Tipo de relação"
          value={filters.relationshipTypeId}
          onChange={(value) => setFilters((current) => ({ ...current, relationshipTypeId: value }))}
          options={types.map((type) => ({
            value: type.id,
            label: `${type.name}${type.isArchived ? ' (arquivado)' : ''}`,
          }))}
          allLabel="Todos os tipos"
        />
        <Select
          label="Estado canônico"
          value={filters.canonState}
          onChange={(value) => setFilters((current) => ({ ...current, canonState: value }))}
          options={[
            { value: 'accepted', label: 'Aceito' },
            { value: 'draft', label: 'Rascunho' },
            { value: 'rejected', label: 'Rejeitado' },
            { value: 'archived', label: 'Arquivado' },
          ]}
          allLabel="Todos os estados"
        />
        <Select
          label="Natureza"
          value={filters.knowledgeState}
          onChange={(value) => setFilters((current) => ({ ...current, knowledgeState: value }))}
          options={[
            { value: 'fact', label: 'Fato' },
            { value: 'rumor', label: 'Rumor' },
            { value: 'suspicion', label: 'Suspeita' },
            { value: 'secret', label: 'Segredo' },
            { value: 'possibility', label: 'Possibilidade' },
            { value: 'disproved', label: 'Refutado' },
          ]}
          allLabel="Todas as naturezas"
        />
        <Select
          label="Visibilidade"
          value={filters.visibility}
          onChange={(value) => setFilters((current) => ({ ...current, visibility: value }))}
          options={[
            { value: 'gm', label: 'Somente mestre' },
            { value: 'players', label: 'Jogadores' },
            { value: 'public', label: 'Público' },
          ]}
          allLabel="Todas as visibilidades"
        />
      </div>
      {loading ? (
        <p className="mt-6 text-sm semantic-text-secondary" aria-live="polite">
          Carregando vizinhança…
        </p>
      ) : null}
      {error === null ? null : (
        <div className="mt-6">
          <UserFacingErrorNotice
            compact
            error={error}
            operation="relationships.list"
            onRetry={() => setFilters((current) => ({ ...current }))}
          />
        </div>
      )}
      {result === null || loading ? null : (
        <>
          {result.truncated ? (
            <p className="mt-6 rounded-xl border semantic-warning-border semantic-warning-surface p-4 text-sm semantic-accent-text">
              O resultado atingiu o limite seguro de entidades ou relações. Refine os filtros.
            </p>
          ) : null}
          <div className="mt-6 rounded-2xl border semantic-border semantic-surface p-5">
            {layoutLoading || graphModel === null || automaticGraphModel === null ? (
              <p aria-live="polite" className="text-sm semantic-text-secondary" role="status">
                Carregando layout do mapa…
              </p>
            ) : (
              <RelationshipCanvas
                automaticModel={automaticGraphModel}
                model={graphModel}
                onAutoLayout={(positions, viewport) =>
                  layoutController.enqueue({ kind: 'auto-layout', positions, viewport })
                }
                onResetLayout={() => layoutController.enqueue({ kind: 'reset' })}
                onRetry={() => layoutController.retry()}
                onSaveNodePosition={(position) =>
                  layoutController.enqueue({ kind: 'node', position })
                }
                onSaveViewport={(viewport) =>
                  layoutController.enqueue({ kind: 'viewport', viewport })
                }
                persistenceAvailable={layoutState !== null}
                persistenceStatus={layoutStatus}
                viewport={layoutState?.view.viewport ?? { x: 0, y: 0, zoom: 1 }}
              />
            )}
            {layoutLoadFailed ? (
              <RelationshipLayoutUnavailableNotice
                onRetry={() => setLayoutReloadKey((current) => current + 1)}
              />
            ) : null}
          </div>
          <RelationshipTextAccordion>
            {result.relationships.length === 0 ? (
              <p aria-live="polite" className="text-sm semantic-text-secondary" role="status">
                Nenhuma conexão corresponde aos filtros.
              </p>
            ) : (
              <ul className="grid gap-2">
                {result.relationships.map((relationship) => {
                  const fromId = displayFromEntityId(
                    relationship,
                    result.rootEntityId,
                    nodeDepthById,
                  );
                  const toId =
                    fromId === relationship.sourceEntityId
                      ? relationship.targetEntityId
                      : relationship.sourceEntityId;
                  return (
                    <li
                      className="rounded-xl border semantic-border semantic-surface px-4 py-3 text-sm"
                      key={relationship.id}
                    >
                      <Button
                        className="align-baseline"
                        onClick={() => setEntityId(fromId)}
                        size="inline"
                        variant="link"
                      >
                        {entityNames.get(fromId) ?? 'Entidade'}
                      </Button>{' '}
                      <span>
                        {directionLabel(
                          relationship,
                          fromId,
                          typeById.get(relationship.relationshipTypeId),
                        )}
                      </span>{' '}
                      <Button
                        className="align-baseline"
                        onClick={() => setEntityId(toId)}
                        size="inline"
                        variant="link"
                      >
                        {entityNames.get(toId) ?? 'Entidade'}
                      </Button>
                      <span className="ml-2 text-xs semantic-text-secondary">
                        {relationshipMetadataSummary(relationship)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </RelationshipTextAccordion>
        </>
      )}
    </section>
  );
}

export function resolveCentralEntityId(
  centralEntityId: string | undefined,
  campaignId: string,
  entities: Entity[],
): string {
  if (centralEntityId === undefined) return '';
  return entities.some(
    (entity) => entity.id === centralEntityId && entity.campaignId === campaignId,
  )
    ? centralEntityId
    : '';
}

function displayFromEntityId(
  relationship: Relationship,
  rootEntityId: string,
  nodeDepthById: ReadonlyMap<string, number>,
): string {
  if (relationship.sourceEntityId === rootEntityId) return relationship.sourceEntityId;
  if (relationship.targetEntityId === rootEntityId) return relationship.targetEntityId;
  const sourceDepth = nodeDepthById.get(relationship.sourceEntityId) ?? Number.MAX_SAFE_INTEGER;
  const targetDepth = nodeDepthById.get(relationship.targetEntityId) ?? Number.MAX_SAFE_INTEGER;
  return targetDepth < sourceDepth ? relationship.targetEntityId : relationship.sourceEntityId;
}

function directionLabel(
  relationship: Relationship,
  fromEntityId: string,
  type: RelationshipType | undefined,
): string {
  if (type?.isSymmetric === true) return `— ${type.name} —`;
  if (relationship.sourceEntityId === fromEntityId)
    return `— ${type?.name ?? 'relaciona-se com'} →`;
  return `— ${type?.inverseName ?? `é destino de ${type?.name ?? 'uma relação'}`} →`;
}
function Select({
  label,
  value,
  onChange,
  options,
  allLabel = 'Selecione…',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}): React.JSX.Element {
  return (
    <label className={labelClass}>
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
const labelClass = 'block text-sm font-semibold semantic-text-primary';
const inputClass =
  'mt-2 w-full rounded-xl border semantic-border semantic-surface px-3 py-2.5 semantic-text-primary';
