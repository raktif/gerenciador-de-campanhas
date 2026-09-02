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
  const relationshipById = useMemo(
    () => new Map((result?.relationships ?? []).map((item) => [item.id, item])),
    [result],
  );

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
          options={entities.map((entity) => ({ value: entity.id, label: entity.name }))}
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
          options={types.map((type) => ({ value: type.id, label: type.name }))}
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
            <div className="flex min-w-max items-start gap-8">
              {Array.from({ length: depth + 1 }, (_, layer) => {
                const layerNodes = result.nodes.filter((node) => node.depth === layer);
                if (layerNodes.length === 0) return null;
                return (
                  <div className="w-52" key={layer}>
                    <p className="mb-3 text-xs font-bold tracking-wider text-slate-500 uppercase">
                      {layer === 0 ? 'Centro' : `Camada ${String(layer)}`}
                    </p>
                    <div className="grid gap-3">
                      {layerNodes.map((node) => (
                        <button
                          className={`rounded-xl border p-3 text-left text-sm shadow-sm ${layer === 0 ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-white'}`}
                          key={node.entity.id}
                          onClick={() => setEntityId(node.entity.id)}
                          type="button"
                        >
                          <span className="font-semibold">{node.entity.name}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {layer === 0 ? 'Entidade central' : 'Tornar central'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-6" data-testid="neighborhood-text-list">
            <h3 className="text-lg font-semibold">Lista textual acessível</h3>
            {result.nodes.length === 1 ? (
              <p className="mt-3 text-sm text-slate-600">
                Nenhuma conexão corresponde aos filtros.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {result.nodes
                  .filter((node) => node.depth > 0)
                  .map((node) => {
                    const relationship =
                      node.viaRelationshipId === null
                        ? undefined
                        : relationshipById.get(node.viaRelationshipId);
                    const parentId = node.pathEntityIds.at(-2);
                    if (relationship === undefined || parentId === undefined) return null;
                    return (
                      <li
                        className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
                        key={node.entity.id}
                      >
                        <span className="font-semibold">
                          {entityNames.get(parentId) ?? 'Entidade'}
                        </span>{' '}
                        <span>
                          {directionLabel(
                            relationship,
                            parentId,
                            typeById.get(relationship.relationshipTypeId),
                          )}
                        </span>{' '}
                        <button
                          className="font-semibold text-amber-800 underline"
                          onClick={() => setEntityId(node.entity.id)}
                          type="button"
                        >
                          {node.entity.name}
                        </button>
                        <span className="ml-2 text-xs text-slate-500">
                          profundidade {node.depth}
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
