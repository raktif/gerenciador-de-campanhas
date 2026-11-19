import { useEffect, useMemo, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import {
  causalObjectTypes,
  causalTypes,
  type CausalChain,
  type CausalObjectType,
  type CausalType,
} from '../../../core/contracts/causality';
import { Button, ButtonGroup } from '../../components/actions';

interface RecordOption {
  id: string;
  label: string;
}
type RecordOptions = Record<CausalObjectType, RecordOption[]>;
const emptyRecordOptions: RecordOptions = {
  entity: [], relationship: [], assertion: [], note: [], event: [], session: [], clock: [], demand: [], story_thread: [],
};

const labels: Record<string, string> = {
  entity: 'Entidade',
  relationship: 'Relação',
  assertion: 'Afirmação',
  note: 'Nota',
  event: 'Evento',
  session: 'Sessão',
  clock: 'Relógio',
  demand: 'Demanda',
  story_thread: 'Fio aberto',
};
function inputClass(): string {
  return 'w-full min-w-0 rounded-lg border semantic-border semantic-input p-2 text-sm';
}

const causalTypeLabels: Record<CausalType, string> = {
  causes: 'Causa',
  contributes_to: 'Contribui para',
  enables: 'Permite',
  blocks: 'Bloqueia',
  worsens: 'Agrava',
  improves: 'Melhora',
  transforms: 'Transforma',
  resolves: 'Resolve',
  reveals: 'Revela',
};

export function CausalityManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [rootType, setRootType] = useState<CausalObjectType>('event');
  const [rootId, setRootId] = useState('');
  const [chain, setChain] = useState<CausalChain | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [sourceType, setSourceType] = useState<CausalObjectType>('event');
  const [sourceId, setSourceId] = useState('');
  const [targetType, setTargetType] = useState<CausalObjectType>('entity');
  const [targetId, setTargetId] = useState('');
  const [causalType, setCausalType] = useState<CausalType>('causes');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [recordOptions, setRecordOptions] = useState<RecordOptions>(emptyRecordOptions);
  const [recordOptionsLoading, setRecordOptionsLoading] = useState(true);
  const [recordOptionsFailure, setRecordOptionsFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRecordOptions(): Promise<void> {
      setRecordOptionsLoading(true);
      setRecordOptionsFailure(null);
      try {
        const [entities, relationships, assertions, notes, events, sessions, clocks, demands, threads] = await Promise.all([
          window.campaignManager.entities.list({ campaignId: campaign.id, limit: 100, filters: { archived: false }, sort: 'name', order: 'asc' }),
          window.campaignManager.relationships.list({ campaignId: campaign.id, limit: 100, filters: { archived: false }, order: 'asc' }),
          window.campaignManager.assertions.list({ campaignId: campaign.id, limit: 100, filters: { archived: false }, sort: 'updatedAt', order: 'desc' }),
          window.campaignManager.notes.list({ campaignId: campaign.id, limit: 100, filters: { archived: false }, sort: 'updatedAt', order: 'desc' }),
          window.campaignManager.events.list({ campaignId: campaign.id, limit: 100, filters: { archived: false }, sort: 'eventOrder', order: 'asc' }),
          window.campaignManager.sessions.list({ campaignId: campaign.id, limit: 100, filters: {}, sort: 'sequenceNumber', order: 'asc' }),
          window.campaignManager.clocks.list({ campaignId: campaign.id, limit: 100 }),
          window.campaignManager.demands.list({ campaignId: campaign.id, limit: 100 }),
          window.campaignManager.storyThreads.list({ campaignId: campaign.id, limit: 100 }),
        ]);
        const results = [entities, relationships, assertions, notes, events, sessions, clocks, demands, threads];
        const failed = results.find((result) => !result.ok);
        if (failed !== undefined) throw new Error(failed.error.message);
        if (cancelled) return;
        const entityNames = new Map(entities.ok ? entities.data.items.map((entity) => [entity.id, entity.name]) : []);
        setRecordOptions({
          entity: entities.ok ? entities.data.items.map((item) => ({ id: item.id, label: item.name })) : [],
          relationship: relationships.ok ? relationships.data.items.map((item) => ({ id: item.id, label: `Relação: ${entityNames.get(item.sourceEntityId) ?? 'origem'} → ${entityNames.get(item.targetEntityId) ?? 'destino'}` })) : [],
          assertion: assertions.ok ? assertions.data.items.map((item) => ({ id: item.id, label: item.statement ?? item.predicate ?? 'Afirmação sem texto' })) : [],
          note: notes.ok ? notes.data.items.map((item) => ({ id: item.id, label: item.title })) : [],
          event: events.ok ? events.data.items.map((item) => ({ id: item.id, label: item.title })) : [],
          session: sessions.ok ? sessions.data.items.map((item) => ({ id: item.id, label: item.title })) : [],
          clock: clocks.ok ? clocks.data.items.map((item) => ({ id: item.id, label: item.name })) : [],
          demand: demands.ok ? demands.data.items.map((item) => ({ id: item.id, label: item.title })) : [],
          story_thread: threads.ok ? threads.data.items.map((item) => ({ id: item.id, label: item.title })) : [],
        });
      } catch (error) {
        if (!cancelled) setRecordOptionsFailure(error instanceof Error ? error.message : 'Não foi possível carregar os registros disponíveis.');
      } finally {
        if (!cancelled) setRecordOptionsLoading(false);
      }
    }
    void loadRecordOptions();
    return () => { cancelled = true; };
  }, [campaign.id]);
  const rootOptions = useMemo(() => recordOptions[rootType], [recordOptions, rootType]);
  const sourceOptions = useMemo(() => recordOptions[sourceType], [recordOptions, sourceType]);
  const targetOptions = useMemo(() => recordOptions[targetType], [recordOptions, targetType]);
  async function load(nextRootType = rootType, nextRootId = rootId): Promise<void> {
    if (nextRootId.trim() === '') {
      setFailure('Informe o identificador do registro raiz.');
      return;
    }
    setLoading(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await window.campaignManager.causality.getChain({
        campaignId: campaign.id,
        objectType: nextRootType,
        objectId: nextRootId.trim(),
        direction: 'both',
        maxDepth: 8,
        maxNodes: 100,
      });
      if (result.ok) setChain(result.data);
      else setFailure(result.error.message);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o mapa causal. Tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }
  async function createLink(event: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMutating(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await window.campaignManager.causality.createLink({
        campaignId: campaign.id,
        sourceType,
        sourceId: sourceId.trim(),
        targetType,
        targetId: targetId.trim(),
        causalType,
        description: description.trim() === '' ? null : description.trim(),
      });
      if (!result.ok) {
        setFailure(result.error.message);
        return;
      }
      setRootType(sourceType);
      setRootId(sourceId.trim());
      setDescription('');
      await load(sourceType, sourceId.trim());
      setNotice('Vínculo causal criado.');
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o vínculo causal. Tente novamente.',
      );
    } finally {
      setMutating(false);
    }
  }
  async function updateLink(id: string, revision: number): Promise<void> {
    setMutating(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await window.campaignManager.causality.updateLink({
        campaignId: campaign.id,
        id,
        revision,
        description: editingDescription.trim() === '' ? null : editingDescription.trim(),
      });
      if (!result.ok) {
        setFailure(result.error.message);
        return;
      }
      setEditingId(null);
      await load();
      setNotice('Vínculo causal atualizado.');
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o vínculo causal. Tente novamente.',
      );
    } finally {
      setMutating(false);
    }
  }
  const typeOptions = causalObjectTypes.map((type) => (
    <option key={type} value={type}>
      {labels[type]}
    </option>
  ));
  return (
    <section aria-labelledby="causality-title" className="mx-auto max-w-5xl space-y-5">
      <header>
        <Button onClick={onBack} size="small" variant="ghost">
          ← Voltar para detalhes da campanha
        </Button>
        <p className="mt-5 text-sm font-semibold semantic-text-secondary">Consequências</p>
        <h1 id="causality-title" className="mt-1 text-3xl font-black">
          Mapa causal
        </h1>
        <p className="mt-2 semantic-text-secondary">
          Visualize e registre como acontecimentos e registros narrativos se encadeiam. Relações
          comuns não são usadas como causalidade.
        </p>
      </header>
      <form
        className="rounded-2xl border semantic-border p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <h2 className="text-xl font-bold">Consultar mapa</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-end">
          <label className="grid min-w-0 gap-2 text-sm font-semibold">
            Tipo do registro
            <select
              className={inputClass()}
              value={rootType}
              onChange={(event) => {
                setRootType(event.target.value as CausalObjectType);
                setRootId('');
              }}
            >
              {typeOptions}
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold">
            Identificador do registro
            <select
              required
              className={inputClass()}
              value={rootId}
              onChange={(event) => setRootId(event.target.value)}
              disabled={recordOptionsLoading}
            >
              <option value="">Selecione um registro…</option>
              {rootOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <Button type="submit" busy={loading}>
            {loading ? 'Carregando…' : 'Ver mapa'}
          </Button>
        </div>
        {failure === null ? null : (
          <div
            role="alert"
            className="mt-4 rounded-lg border semantic-border p-3 text-sm semantic-text-danger"
          >
            <p>{failure}</p>
            <Button className="mt-2" size="small" onClick={() => void load()} disabled={loading}>
              Tentar novamente
            </Button>
          </div>
        )}
        {notice === null ? null : (
          <p role="status" className="mt-4 text-sm semantic-text-success">
            {notice}
          </p>
        )}
        {recordOptionsFailure === null ? null : <p role="alert" className="mt-4 text-sm semantic-text-danger">{recordOptionsFailure}</p>}
      </form>
      <form
        aria-labelledby="create-causal-link-title"
        className="rounded-2xl border semantic-border p-5"
        onSubmit={(event) => void createLink(event)}
      >
        <h2 id="create-causal-link-title" className="text-xl font-bold">
          Adicionar vínculo causal
        </h2>
        <p className="mt-1 text-sm semantic-text-secondary">
          Os registros devem pertencer à campanha atual e estar ativos.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid min-w-0 gap-2 text-sm font-semibold">
            Causa
            <select
              className={inputClass()}
              value={sourceType}
              onChange={(event) => {
                setSourceType(event.target.value as CausalObjectType);
                setSourceId('');
              }}
            >
              {typeOptions}
            </select>
            <select
              required
              className={inputClass()}
              aria-label="Registro da causa"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              disabled={recordOptionsLoading}
            >
              <option value="">Selecione a causa…</option>
              {sourceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold">
            Efeito
            <select
              className={inputClass()}
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value as CausalObjectType);
                setTargetId('');
              }}
            >
              {typeOptions}
            </select>
            <select
              required
              className={inputClass()}
              aria-label="Registro do efeito"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              disabled={recordOptionsLoading}
            >
              <option value="">Selecione o efeito…</option>
              {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold">
            Tipo causal
            <select
              className={inputClass()}
              value={causalType}
              onChange={(event) => setCausalType(event.target.value as CausalType)}
            >
              {causalTypes.map((type) => (
                <option key={type} value={type}>
                  {causalTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Descrição opcional
            <textarea
              className={inputClass()}
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>
        <ButtonGroup className="mt-4" aria-label="Ações do vínculo causal">
          <Button type="submit" variant="primary" busy={mutating}>
            Criar vínculo
          </Button>
        </ButtonGroup>
      </form>
      {chain === null ? (
        <div className="rounded-2xl border semantic-border p-8 text-center semantic-text-secondary">
          Informe um registro narrativo para começar a travessia do mapa.
        </div>
      ) : (
        <section
          aria-labelledby="causal-chain-title"
          className="rounded-2xl border semantic-border p-5"
        >
          <h2 id="causal-chain-title" className="text-xl font-bold">
            Cadeia causal
          </h2>
          <p className="mt-1 text-sm semantic-text-secondary">
            {chain.nodes.length} registros · profundidade máxima {chain.maxDepth}
            {chain.truncated ? ' · resultado limitado pelos limites da consulta' : ''}
          </p>
          <ul className="mt-5 grid gap-3">
            {chain.links.map((link) => (
              <li key={link.id} className="rounded-xl semantic-navigation-surface p-4">
                <div>
                  <span className="font-semibold">{link.source.label}</span>
                  <span className="mx-2 semantic-text-secondary">— {causalTypeLabels[link.causalType]} →</span>
                  <span className="font-semibold">{link.target.label}</span>
                </div>
                {editingId === link.id ? (
                  <div className="mt-3 grid gap-2">
                    <label className="text-sm font-semibold">
                      Descrição
                      <textarea
                        className={inputClass()}
                        rows={2}
                        maxLength={2000}
                        value={editingDescription}
                        onChange={(event) => setEditingDescription(event.target.value)}
                      />
                    </label>
                    <ButtonGroup aria-label="Salvar edição do vínculo">
                      <Button
                        size="small"
                        variant="primary"
                        busy={mutating}
                        onClick={() => void updateLink(link.id, link.revision)}
                      >
                        Salvar
                      </Button>
                      <Button size="small" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </ButtonGroup>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-sm semantic-text-secondary">
                      {link.description ?? 'Sem descrição.'}
                    </p>
                    <Button
                      className="mt-2"
                      size="small"
                      onClick={() => {
                        setEditingId(link.id);
                        setEditingDescription(link.description ?? '');
                      }}
                    >
                      Editar descrição
                    </Button>
                  </>
                )}
              </li>
            ))}
            {chain.links.length === 0 ? (
              <li className="semantic-text-secondary">Nenhum vínculo causal encontrado.</li>
            ) : null}
          </ul>
        </section>
      )}
    </section>
  );
}
