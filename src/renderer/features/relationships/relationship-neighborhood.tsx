import { useEffect, useMemo, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type { RelationshipType } from '../../../core/contracts/relationship-types';
import type {
  Relationship,
  RelationshipNeighborhoodResult,
} from '../../../core/contracts/relationships';

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
}: {
  campaign: Campaign;
  entities: Entity[];
  types: RelationshipType[];
}): React.JSX.Element {
  const [entityId, setEntityId] = useState('');
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<RelationshipNeighborhoodResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          setError(response.error.message);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign.id, depth, entityId, filters]);

  const entityNames = useMemo(
    () => new Map((result?.nodes ?? []).map((node) => [node.entity.id, node.entity.name])),
    [result],
  );
  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);
  const nodeDepthById = useMemo(
    () => new Map((result?.nodes ?? []).map((node) => [node.entity.id, node.depth])),
    [result],
  );
  const graphLayout = useMemo(() => createGraphLayout(result), [result]);

  return (
    <section
      className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-6"
      aria-labelledby="neighborhood-title"
    >
      <div>
        <p className="text-xs font-bold tracking-[0.16em] text-amber-800 uppercase">Exploração</p>
        <h2 className="mt-1 text-2xl font-semibold" id="neighborhood-title">
          Vizinhança de uma entidade
        </h2>
        <p className="mt-2 text-sm text-slate-600">
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
        <p className="mt-6 text-sm text-slate-500" aria-live="polite">
          Carregando vizinhança…
        </p>
      ) : null}
      {error === null ? null : (
        <p
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {result === null || loading ? null : (
        <>
          {result.truncated ? (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              O resultado atingiu o limite seguro de entidades ou relações. Refine os filtros.
            </p>
          ) : null}
          <div
            className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-5"
            aria-label="Mapa da vizinhança"
          >
            <svg
              aria-hidden="true"
              className="block"
              role="img"
              style={{ minWidth: graphLayout.width }}
              viewBox={`0 0 ${String(graphLayout.width)} ${String(graphLayout.height)}`}
            >
              <defs>
                <marker
                  id="relationship-arrow"
                  markerHeight="7"
                  markerWidth="7"
                  orient="auto-start-reverse"
                  refX="6"
                  refY="3.5"
                >
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#92400e" />
                </marker>
              </defs>
              {result.relationships.map((relationship) => {
                const source = graphLayout.positions.get(relationship.sourceEntityId);
                const target = graphLayout.positions.get(relationship.targetEntityId);
                if (source === undefined || target === undefined) return null;
                const type = typeById.get(relationship.relationshipTypeId);
                const markerEnd =
                  type?.isSymmetric === true ? undefined : 'url(#relationship-arrow)';
                const isLoop = relationship.sourceEntityId === relationship.targetEntityId;
                const labelX = isLoop ? source.x : (source.x + target.x) / 2;
                const labelY = isLoop ? source.y - 78 : (source.y + target.y) / 2 - 8;
                return (
                  <g data-testid="neighborhood-graph-edge" key={relationship.id}>
                    {isLoop ? (
                      <path
                        d={`M ${String(source.x - 30)} ${String(source.y - 25)} C ${String(source.x - 85)} ${String(source.y - 95)}, ${String(source.x + 85)} ${String(source.y - 95)}, ${String(source.x + 30)} ${String(source.y - 25)}`}
                        fill="none"
                        markerEnd={markerEnd}
                        stroke="#92400e"
                        strokeWidth="2"
                      />
                    ) : (
                      <line
                        markerEnd={markerEnd}
                        stroke="#92400e"
                        strokeWidth="2"
                        x1={source.x}
                        x2={target.x}
                        y1={source.y}
                        y2={target.y}
                      />
                    )}
                    <text
                      fill="#78350f"
                      fontSize="12"
                      fontWeight="600"
                      paintOrder="stroke"
                      stroke="white"
                      strokeWidth="4"
                      textAnchor="middle"
                      x={labelX}
                      y={labelY}
                    >
                      {type?.name ?? 'Relação'}
                    </text>
                  </g>
                );
              })}
              {result.nodes.map((node) => {
                const point = graphLayout.positions.get(node.entity.id);
                if (point === undefined) return null;
                const central = node.depth === 0;
                return (
                  <g key={node.entity.id}>
                    <rect
                      fill={central ? '#fffbeb' : 'white'}
                      height="56"
                      rx="12"
                      stroke={central ? '#f59e0b' : '#d6d3d1'}
                      strokeWidth="2"
                      width="160"
                      x={point.x - 80}
                      y={point.y - 28}
                    />
                    <text
                      fill="#1e293b"
                      fontSize="13"
                      fontWeight="600"
                      textAnchor="middle"
                      x={point.x}
                      y={point.y + 4}
                    >
                      {truncateLabel(node.entity.name)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-6" data-testid="neighborhood-text-list">
            <h3 className="text-lg font-semibold">Lista textual acessível</h3>
            {result.relationships.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                Nenhuma conexão corresponde aos filtros.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
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
                      className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
                      key={relationship.id}
                    >
                      <button
                        className="font-semibold text-amber-800 underline"
                        onClick={() => setEntityId(fromId)}
                        type="button"
                      >
                        {entityNames.get(fromId) ?? 'Entidade'}
                      </button>{' '}
                      <span>
                        {directionLabel(
                          relationship,
                          fromId,
                          typeById.get(relationship.relationshipTypeId),
                        )}
                      </span>{' '}
                      <button
                        className="font-semibold text-amber-800 underline"
                        onClick={() => setEntityId(toId)}
                        type="button"
                      >
                        {entityNames.get(toId) ?? 'Entidade'}
                      </button>
                      <span className="ml-2 text-xs text-slate-500">
                        {relationship.canonState} · {relationship.knowledgeState} ·{' '}
                        {relationship.visibility}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

interface GraphPoint {
  x: number;
  y: number;
}

function createGraphLayout(result: RelationshipNeighborhoodResult | null): {
  width: number;
  height: number;
  positions: Map<string, GraphPoint>;
} {
  if (result === null) return { width: 480, height: 240, positions: new Map() };
  const layers = new Map<number, RelationshipNeighborhoodResult['nodes']>();
  for (const node of result.nodes) {
    const layer = layers.get(node.depth) ?? [];
    layer.push(node);
    layers.set(node.depth, layer);
  }
  const maximumDepth = Math.max(...result.nodes.map((node) => node.depth), 0);
  const largestLayer = Math.max(...[...layers.values()].map((layer) => layer.length), 1);
  const width = Math.max(480, (maximumDepth + 1) * 260);
  const height = Math.max(240, largestLayer * 100 + 80);
  const positions = new Map<string, GraphPoint>();
  for (const [layerNumber, layerNodes] of layers) {
    const x = 130 + layerNumber * 260;
    const spacing = height / (layerNodes.length + 1);
    layerNodes.forEach((node, index) => {
      positions.set(node.entity.id, { x, y: spacing * (index + 1) });
    });
  }
  return { width, height, positions };
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

function truncateLabel(label: string): string {
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
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
const labelClass = 'block text-sm font-semibold text-slate-800';
const inputClass =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-slate-900';
