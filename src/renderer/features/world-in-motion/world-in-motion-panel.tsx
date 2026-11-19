import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { CampaignSignalReviewItem } from '../../../core/contracts/campaign-signal-engine';
import type { CampaignSignal } from '../../../core/contracts/campaign-signals';
import type { Clock } from '../../../core/contracts/clocks';
import type { Demand } from '../../../core/contracts/demands';
import type { StoryThread } from '../../../core/contracts/story-threads';
import { Button } from '../../components/actions';
import { loadWorldInMotionData, buildWorldInMotionModel } from './world-in-motion-data';

type Destination = 'signals' | 'threads' | 'clocks' | 'demands';
export type WorldInMotionPanelState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      recovered?: boolean;
      signals: CampaignSignalReviewItem[];
      threads: StoryThread[];
      clocks: Clock[];
      demands: Demand[];
    };

const signalTypeLabels: Record<CampaignSignal['signalType'], string> = {
  explicit_need: 'Necessidade explícita',
  blocked_goal: 'Objetivo bloqueado',
  open_consequence: 'Consequência pendente',
  clock_pressure: 'Pressão de relógio',
  shared_resource: 'Recurso compartilhado',
  recent_change: 'Mudança recente',
  open_thread: 'Fio aberto',
  stale_thread: 'Fio sem atualização',
  uninvestigated_clue: 'Pista não investigada',
  ignored_demand: 'Demanda ignorada',
  cross_plot_bridge: 'Conexão entre tramas',
  potential_contradiction: 'Possível contradição',
  inactive_entity: 'Entidade inativa',
  unresolved_mystery: 'Mistério não resolvido',
  unfulfilled_promise: 'Promessa não cumprida',
};
const signalPriorityLabels = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  very_high: 'Altíssima',
} as const;
const signalStatusLabels: Record<CampaignSignal['status'], string> = {
  new: 'Novo',
  viewed: 'Em revisão',
  dismissed: 'Descartado',
  snoozed: 'Adiado',
  converted: 'Convertido',
  resolved: 'Resolvido',
  stale: 'Condição não detectada',
};
const threadStatusLabels = {
  open: 'aberto',
  active: 'ativo',
  dormant: 'adormecido',
  resolved: 'resolvido',
  abandoned: 'abandonado',
  archived: 'arquivado',
} as const;
const threadTypeLabels = {
  promise: 'Promessa',
  mystery: 'Mistério',
  clue: 'Pista',
  threat: 'Ameaça',
  relationship: 'Relação',
  unanswered_question: 'Pergunta sem resposta',
  unfinished_goal: 'Objetivo inacabado',
  ignored_demand: 'Demanda ignorada',
  custom: 'Personalizado',
} as const;
const clockTypeLabels = {
  progress: 'Progresso',
  threat: 'Ameaça',
  countdown: 'Contagem regressiva',
  project: 'Projeto',
  investigation: 'Investigação',
  custom: 'Personalizado',
} as const;
const demandStatusLabels = {
  available: 'Disponível',
  active: 'Ativa',
  resolved: 'Resolvida',
  failed: 'Falhada',
  ignored: 'Ignorada',
  archived: 'Arquivada',
} as const;
const demandUrgencyLabels = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
} as const;

export function WorldInMotionPanel({
  campaign,
  onNavigate,
  onBack,
}: {
  campaign: Campaign;
  onNavigate: (destination: Destination) => void;
  onBack?: () => void;
}): React.JSX.Element {
  const [state, setState] = useState<WorldInMotionPanelState>({ kind: 'loading' });
  const request = useRef(0);
  const campaignIdRef = useRef(campaign.id);
  campaignIdRef.current = campaign.id;

  const load = useCallback(
    async (retry = false): Promise<void> => {
      const requestId = ++request.current;
      const isCurrent = (): boolean =>
        request.current === requestId && campaignIdRef.current === campaign.id;
      setState({ kind: 'loading' });
      try {
        const data = await loadWorldInMotionData(campaign.id, window.campaignManager);
        if (isCurrent())
          setState({ kind: 'ready', recovered: retry, ...buildWorldInMotionModel(data) });
      } catch {
        if (isCurrent()) setState({ kind: 'error' });
      }
    },
    [campaign.id],
  );

  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);

  return (
    <WorldInMotionPanelView
      campaign={campaign}
      onNavigate={onNavigate}
      {...(onBack === undefined ? {} : { onBack })}
      onRetry={() => void load(true)}
      state={state}
    />
  );
}

export function WorldInMotionPanelView({
  campaign,
  state,
  onNavigate,
  onBack,
  onRetry,
}: {
  campaign: Campaign;
  state: WorldInMotionPanelState;
  onNavigate: (destination: Destination) => void;
  onBack?: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <section aria-labelledby="world-in-motion-heading" className="mx-auto max-w-5xl">
      <header className="mb-8">
        {onBack === undefined ? null : (
          <Button onClick={onBack} size="small" variant="ghost">
            ← Voltar para detalhes da campanha
          </Button>
        )}
        <p className="text-sm font-semibold semantic-text-secondary">{campaign.name}</p>
        <h1
          className="semantic-focus-outline mt-1 text-3xl font-bold"
          id="world-in-motion-heading"
          ref={headingRef}
          tabIndex={-1}
        >
          Mundo em Movimento
        </h1>
        <p className="mt-3 max-w-3xl leading-6 semantic-text-secondary">
          Contexto para navegar pelos registros atuais da campanha. O painel não oferece comandos
          para alterar dados, não decide acontecimentos e não infere mudanças.
        </p>
      </header>

      <p
        className={state.kind === 'loading' ? 'rounded-xl border semantic-border p-5' : 'sr-only'}
        role="status"
      >
        {state.kind === 'loading'
          ? 'Carregando o contexto da campanha…'
          : state.kind === 'ready' && state.recovered === true
            ? 'Painel carregado com sucesso após nova tentativa.'
            : null}
      </p>
      {state.kind === 'error' ? (
        <div
          aria-live="assertive"
          className="rounded-xl border semantic-error-notice p-5"
          role="alert"
        >
          <h2 className="font-semibold">Não foi possível carregar o painel</h2>
          <p className="mt-1">
            Uma ou mais listas da campanha não responderam. Nenhuma informação parcial será
            apresentada.
          </p>
          <Button
            className="mt-3"
            onClick={() => {
              headingRef.current?.focus();
              onRetry();
            }}
            variant="secondary"
          >
            Tentar novamente
          </Button>
        </div>
      ) : state.kind === 'ready' ? (
        <WorldInMotionContent state={state} onNavigate={onNavigate} />
      ) : null}
    </section>
  );
}

export function WorldInMotionContent({
  state,
  onNavigate,
}: {
  state: Extract<WorldInMotionPanelState, { kind: 'ready' }>;
  onNavigate: (destination: Destination) => void;
}): React.JSX.Element {
  const empty =
    state.signals.length === 0 &&
    state.threads.length === 0 &&
    state.clocks.length === 0 &&
    state.demands.length === 0;
  return (
    <div className="space-y-8">
      {empty ? (
        <p className="rounded-xl border semantic-border p-5">
          Não há registros ativos nas categorias disponíveis para exibir. As categorias sem detecção
          implementada estão identificadas abaixo; este vazio não significa que tenham sido
          verificadas.
        </p>
      ) : null}
      <section aria-labelledby="world-signals-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold" id="world-signals-heading">
            Sugestões e avisos disponíveis
          </h2>
          <Button onClick={() => onNavigate('signals')} variant="secondary">
            Abrir Sinais da campanha
          </Button>
        </div>
        {state.signals.length === 0 ? (
          <p className="semantic-text-secondary">
            Nenhum sinal novo ou em revisão registrado. A lista usa os sinais existentes; ela não
            representa detecção das categorias indisponíveis.
          </p>
        ) : (
          <ul className="space-y-3">
            {state.signals.map((item) => (
              <li
                className="rounded-xl border semantic-border semantic-surface-muted p-4"
                key={item.signal.id}
              >
                <h3 className="font-semibold">{item.signal.title}</h3>
                <p className="mt-1 text-sm semantic-text-secondary">
                  {signalTypeLabels[item.signal.signalType]} · Prioridade{' '}
                  {signalPriorityLabels[item.signal.priority]}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold">
                    Por que estou vendo isto?
                  </summary>
                  <p className="mt-2 leading-6">{item.signal.summary}</p>
                  {item.evidence.length === 0 ? (
                    <p className="mt-2 text-sm semantic-text-secondary">
                      O sinal não retornou evidências detalhadas nesta consulta.
                    </p>
                  ) : (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {item.evidence.map((evidence, index) => (
                        <li key={`${evidence.objectType}:${evidence.role}:${String(index)}`}>
                          <span className="font-medium">{evidence.role}</span>
                          {evidence.objectName === null ? '' : ` — ${evidence.objectName}`}
                          {evidence.description === null ? '' : `: ${evidence.description}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-sm semantic-text-secondary">
                    O item está registrado com estado {signalStatusLabels[item.signal.status]}; não
                    é uma conclusão narrativa nem uma alteração de cânone.
                  </p>
                </details>
                <Button
                  className="mt-3"
                  onClick={() =>
                    onNavigate(item.signal.signalType === 'explicit_need' ? 'demands' : 'signals')
                  }
                  size="small"
                  variant="link"
                >
                  {item.signal.signalType === 'explicit_need'
                    ? 'Abrir Demandas emergentes'
                    : 'Abrir Sinais da campanha'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecordSection
        heading="Fios em andamento"
        emptyText="Não há Fios Abertos em estado Aberto, Ativo ou Adormecido."
        records={state.threads}
        onNavigate={() => onNavigate('threads')}
        openLabel="Abrir Fios Abertos"
      >
        {(thread) => (
          <article className="rounded-xl border semantic-border p-4" key={thread.id}>
            <h3 className="font-semibold">{thread.title}</h3>
            <p className="mt-1 text-sm semantic-text-secondary">
              {threadStatusLabels[thread.status]} · {threadTypeLabels[thread.threadType]}
            </p>
            {thread.description === null ? null : <p className="mt-2">{thread.description}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Por que estou vendo isto?</summary>
              <p className="mt-2 text-sm leading-6">
                Este Fio está salvo nesta campanha com estado {threadStatusLabels[thread.status]}. O
                painel o exibe por seu estado persistido, não por uma detecção nova.
                {thread.originSessionTitle === null
                  ? ''
                  : ` Sessão de origem registrada: ${thread.originSessionTitle}.`}
              </p>
            </details>
          </article>
        )}
      </RecordSection>

      <RecordSection
        heading="Relógios ativos"
        emptyText="Não há Relógios em estado Ativo."
        records={state.clocks}
        onNavigate={() => onNavigate('clocks')}
        openLabel="Abrir Relógios"
      >
        {(clock) => (
          <article className="rounded-xl border semantic-border p-4" key={clock.id}>
            <h3 className="font-semibold">{clock.name}</h3>
            <p className="mt-1">
              Progresso registrado: {clock.segmentsFilled} de {clock.segmentsTotal} divisões
            </p>
            <p className="text-sm semantic-text-secondary">
              {clock.entityName} · {clockTypeLabels[clock.clockType]}
            </p>
            {clock.consequence.length === 0 ? null : (
              <p className="mt-2 text-sm">Consequência cadastrada: {clock.consequence}</p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Por que estou vendo isto?</summary>
              <p className="mt-2 text-sm leading-6">
                Este Relógio está salvo como Ativo. O painel apenas apresenta o progresso registrado
                ({clock.segmentsFilled}/{clock.segmentsTotal}); não o avança nem prevê quando será
                concluído.
              </p>
            </details>
          </article>
        )}
      </RecordSection>

      <RecordSection
        heading="Demandas em andamento"
        emptyText="Não há Demandas salvas em estado Disponível ou Ativa."
        records={state.demands}
        onNavigate={() => onNavigate('demands')}
        openLabel="Abrir Demandas emergentes"
      >
        {(demand) => (
          <article className="rounded-xl border semantic-border p-4" key={demand.id}>
            <h3 className="font-semibold">{demand.title}</h3>
            <p className="mt-1 text-sm semantic-text-secondary">
              {demandStatusLabels[demand.status]} · Urgência {demandUrgencyLabels[demand.urgency]}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{demand.need}</p>
            {demand.summary.length === 0 ? null : (
              <p className="mt-2 whitespace-pre-wrap">{demand.summary}</p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Por que estou vendo isto?</summary>
              <p className="mt-2 text-sm leading-6">
                Esta Demanda já foi salva explicitamente e está em estado{' '}
                {demandStatusLabels[demand.status]}. Sua necessidade é o texto registrado na própria
                Demanda; o painel não aceita, edita ou converte sugestões.
              </p>
            </details>
          </article>
        )}
      </RecordSection>

      <section aria-labelledby="world-unavailable-heading">
        <h2 className="text-xl font-semibold" id="world-unavailable-heading">
          Categorias não disponíveis nesta versão
        </h2>
        <ul className="mt-3 space-y-3">
          <li className="rounded-xl border semantic-border p-4">
            <h3 className="font-semibold">Consequências pendentes</h3>
            <p className="mt-1 text-sm semantic-text-secondary">
              Não disponível nesta versão: ainda não há detector de consequências pendentes.
            </p>
          </li>
          <li className="rounded-xl border semantic-border p-4">
            <h3 className="font-semibold">Mistérios sem detector</h3>
            <p className="mt-1 text-sm semantic-text-secondary">
              Não disponível nesta versão: não há detecção implementada para esta categoria.
            </p>
          </li>
          <li className="rounded-xl border semantic-border p-4">
            <h3 className="font-semibold">Mudanças desde a última sessão</h3>
            <p className="mt-1 text-sm semantic-text-secondary">
              Indisponível: os registros consultados não comprovam vínculo explícito com a última
              sessão. Não inferimos mudanças a partir de datas de atualização.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}

function RecordSection<T>({
  heading,
  emptyText,
  records,
  onNavigate,
  openLabel,
  children,
}: {
  heading: string;
  emptyText: string;
  records: T[];
  onNavigate: () => void;
  openLabel: string;
  children: (record: T) => React.JSX.Element;
}): React.JSX.Element {
  return (
    <section aria-label={heading}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{heading}</h2>
        <Button onClick={onNavigate} variant="secondary">
          {openLabel}
        </Button>
      </div>
      {records.length === 0 ? (
        <p className="semantic-text-secondary">{emptyText}</p>
      ) : (
        <div className="space-y-3">{records.map(children)}</div>
      )}
    </section>
  );
}
