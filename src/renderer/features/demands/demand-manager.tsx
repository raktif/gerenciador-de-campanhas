import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import {
  demandRoles,
  demandStatuses,
  type Demand,
  type DemandContent,
  type DemandDetails,
  type DemandSuggestion,
  type DemandTarget,
  type DemandLink,
  type TransitionDemand,
} from '../../../core/contracts/demands';
import type { CampaignSignalReviewItem } from '../../../core/contracts/campaign-signal-engine';
import type { EventDetails } from '../../../core/contracts/events';
import type { Result } from '../../../core/contracts/result';
import {
  campaignSignalChannels,
  demandChannels,
  entityChannels,
  eventChannels,
} from '../../../core/contracts/ipc-channels';
import {
  demandScreenDiagnosticOperations,
  type DemandScreenDiagnosticChannel,
} from '../../../core/contracts/diagnostics';
import {
  presentUserFacingError,
  type UserFacingError,
  type UserFacingErrorOperation,
} from '../../../core/errors/user-facing-error';
import { Button, ButtonGroup } from '../../components/actions';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { AppError } from '../../../core/errors/app-error';

const labels: Record<Demand['status'], string> = {
  available: 'Disponível',
  active: 'Ativa',
  resolved: 'Resolvida',
  failed: 'Falhada',
  ignored: 'Ignorada',
  archived: 'Arquivada',
};
const roles: Record<DemandLink['role'], string> = {
  requester: 'Solicitante',
  affected: 'Afetada',
  location: 'Local',
  opposition: 'Oposição',
  resource: 'Recurso',
  clue: 'Pista',
  hidden_connection: 'Conexão oculta',
  beneficiary: 'Beneficiária',
  related: 'Relacionada',
};
const targetLabels = { entity: 'Entidade', clock: 'Relógio', session: 'Sessão' };
const inputClass = 'rounded-lg border semantic-border semantic-input p-2';
type FormMode = 'accept' | 'edit' | 'child';
interface Failure {
  error: UserFacingError;
  operation: UserFacingErrorOperation;
  retry: () => void;
}
type LoadState = 'loading' | 'success' | 'error';
const contentOf = (details: DemandDetails): DemandContent => ({
  title: details.demand.title,
  need: details.demand.need,
  summary: details.demand.summary,
  obstacle: details.demand.obstacle,
  risks: details.demand.risks,
  urgency: details.demand.urgency,
  requesterEntityId: details.demand.requesterEntityId,
  links: details.links
    .filter((link) => link.role !== 'requester')
    .map(({ targetType, targetId, role }) => ({ targetType, targetId, role })),
});

export function DemandManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<Demand[]>([]);
  const [signals, setSignals] = useState<CampaignSignalReviewItem[]>([]);
  const [filter, setFilter] = useState<'' | Demand['status']>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [details, setDetails] = useState<DemandDetails | null>(null);
  const [suggestion, setSuggestion] = useState<DemandSuggestion | null>(null);
  const [form, setForm] = useState<DemandContent | null>(null);
  const [mode, setMode] = useState<FormMode>('accept');
  const [urgencySelected, setUrgencySelected] = useState(false);
  const [demandsState, setDemandsState] = useState<LoadState>('loading');
  const [signalsState, setSignalsState] = useState<LoadState>('loading');
  const loading = demandsState === 'loading' || signalsState === 'loading';
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [demandsFailure, setDemandsFailure] = useState<Failure | null>(null);
  const [signalsFailure, setSignalsFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'resolve' | 'child' | null>(null);
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [until, setUntil] = useState('');
  const operation = useRef(0);
  const listGeneration = useRef(0);
  const signalsGeneration = useRef(0);
  const alive = useRef(true);
  const transformKey = useRef(globalThis.crypto.randomUUID());
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current += 1;
      listGeneration.current += 1;
      signalsGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    if (confirm) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirm]);

  const loadDemands = useCallback(
    async (next: string | null = null): Promise<void> => {
      const generation = ++listGeneration.current;
      setDemandsState('loading');
      setDemandsFailure(null);
      try {
        const demands = await window.campaignManager.demands.list({
          campaignId: campaign.id,
          ...(filter ? { status: filter } : {}),
          ...(next ? { cursor: next } : {}),
          limit: 50,
        });
        if (!alive.current || generation !== listGeneration.current) return;
        if (!demands.ok) throw new AppError(demands.error.code, demands.error.message);
        setItems((previous) => (next ? [...previous, ...demands.data.items] : demands.data.items));
        setCursor(demands.data.nextCursor);
        setDemandsState('success');
      } catch (reason) {
        if (alive.current && generation === listGeneration.current) {
          setDemandsState('error');
          setDemandsFailure({
            error: presentUserFacingError(
              reason,
              demandScreenDiagnosticOperations[demandChannels.list],
            ),
            operation: demandScreenDiagnosticOperations[demandChannels.list],
            retry: () => void loadDemands(next),
          });
        }
      }
    },
    [campaign.id, filter],
  );
  const loadSignals = useCallback(async (): Promise<void> => {
    const generation = ++signalsGeneration.current;
    setSignalsState('loading');
    setSignalsFailure(null);
    try {
      const review = await window.campaignManager.campaignSignals.list({ campaignId: campaign.id });
      if (!alive.current || generation !== signalsGeneration.current) return;
      if (!review.ok) throw new AppError(review.error.code, review.error.message);
      setSignals(review.data.items.filter((item) => item.signal.signalType === 'explicit_need'));
      setSignalsState('success');
    } catch (reason) {
      if (alive.current && generation === signalsGeneration.current) {
        setSignalsState('error');
        setSignalsFailure({
          error: presentUserFacingError(
            reason,
            demandScreenDiagnosticOperations[campaignSignalChannels.list],
          ),
          operation: demandScreenDiagnosticOperations[campaignSignalChannels.list],
          retry: () => void loadSignals(),
        });
      }
    }
  }, [campaign.id]);
  const load = useCallback(async (): Promise<void> => {
    await Promise.all([loadDemands(), loadSignals()]);
  }, [loadDemands, loadSignals]);
  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load();
  }, [load]);

  async function run<T>(
    request: () => Promise<Result<T>>,
    apply: (data: T) => void,
    channel: DemandScreenDiagnosticChannel,
  ): Promise<void> {
    const op = demandScreenDiagnosticOperations[channel];
    const sequence = ++operation.current;
    setBusy(true);
    setFailure(null);
    try {
      const result = await request();
      if (!alive.current || sequence !== operation.current) return;
      if (!result.ok) throw new AppError(result.error.code, result.error.message);
      apply(result.data);
    } catch (reason) {
      if (alive.current && sequence === operation.current)
        setFailure({
          error: presentUserFacingError(reason, op),
          operation: op,
          retry: () => void run(request, apply, channel),
        });
    } finally {
      if (alive.current && sequence === operation.current) setBusy(false);
    }
  }
  function open(id: string): void {
    setForm(null);
    setDetails(null);
    setSuggestion(null);
    setEvent(null);
    setSourceText('');
    void run(
      () => window.campaignManager.demands.get({ campaignId: campaign.id, id }),
      setDetails,
      demandChannels.get,
    );
  }
  function review(signalId: string): void {
    setDetails(null);
    setForm(null);
    setEvent(null);
    void run(
      () => window.campaignManager.demands.suggestion({ campaignId: campaign.id, signalId }),
      (value) => {
        setSuggestion(value);
        setMode('accept');
        setUrgencySelected(false);
        setForm({
          title: value.title,
          need: value.need,
          summary: '',
          obstacle: '',
          risks: '',
          urgency: 'medium',
          requesterEntityId: value.entityId,
          links: [],
        });
      },
      demandChannels.suggestion,
    );
  }
  function saved(value: DemandDetails): void {
    setDetails(value);
    setForm(null);
    setSuggestion(null);
    setConfirm(null);
    setNotice('Operação confirmada. Nenhum cânone foi promovido automaticamente.');
    void load();
  }
  function save(): void {
    if (!form) return;
    if (mode === 'accept' && suggestion) {
      const input = {
        campaignId: campaign.id,
        signalId: suggestion.signalId,
        signalRevision: suggestion.signalRevision,
        content: form,
      };
      void run(() => window.campaignManager.demands.accept(input), saved, demandChannels.accept);
    } else if (details) {
      const input = {
        campaignId: campaign.id,
        id: details.demand.id,
        revision: details.demand.revision,
        content: form,
      };
      if (mode === 'child') {
        const request = {
          ...input,
          idempotencyKey: transformKey.current,
          confirmed: true as const,
        };
        void run(
          () => window.campaignManager.demands.transform(request),
          saved,
          demandChannels.transform,
        );
      } else
        void run(() => window.campaignManager.demands.update(input), saved, demandChannels.update);
    }
  }
  function transition(action: TransitionDemand['action'], confirmed?: boolean): void {
    if (!details) return;
    const input = {
      campaignId: campaign.id,
      id: details.demand.id,
      revision: details.demand.revision,
      action,
      ...(confirmed === undefined ? {} : { confirmed }),
    };
    void run(
      () => window.campaignManager.demands.transition(input),
      saved,
      demandChannels.transition,
    );
  }
  function signalAction(
    item: CampaignSignalReviewItem,
    action: 'dismiss' | 'snooze' | 'reactivate',
  ): void {
    const input = { campaignId: campaign.id, id: item.signal.id, revision: item.signal.revision };
    if (action === 'snooze') {
      const time = new Date(until);
      if (!Number.isFinite(time.getTime()) || time.getTime() <= Date.now()) {
        setNotice('Escolha um prazo futuro para adiar.');
        return;
      }
      const request = { ...input, dismissedUntil: time.toISOString() };
      void run(
        () => window.campaignManager.campaignSignals.snooze(request),
        () => {
          void load();
        },
        campaignSignalChannels.snooze,
      );
    } else
      void run(
        () => window.campaignManager.campaignSignals[action](input),
        () => {
          void load();
        },
        campaignSignalChannels[action],
      );
  }
  const d = details?.demand;
  const editable = d && ['available', 'active'].includes(d.status);
  return (
    <section aria-labelledby="demands-title" className="grid gap-5">
      <Button onClick={onBack} disabled={busy}>
        Voltar à campanha
      </Button>
      <h1 id="demands-title" className="text-3xl font-semibold">
        Demandas emergentes
      </h1>
      <p>
        Sugestões não são Demandas aceitas. Revise as fontes antes de confirmar. Uso exclusivo do
        narrador, sem IA e sem rede.
      </p>
      {notice && <p role="status">{notice}</p>}
      {failure && !confirm && (
        <UserFacingErrorNotice
          error={failure.error}
          operation={failure.operation}
          onRetry={failure.retry}
        />
      )}
      {busy && <p role="status">Processando…</p>}
      {form ? (
        <>
          <h2>
            {mode === 'accept'
              ? 'Revisar sugestão'
              : mode === 'child'
                ? 'Nova subdemanda'
                : 'Editar Demanda'}
          </h2>
          {suggestion && (
            <p>
              {suggestion.entityName} — {suggestion.fieldLabel}. {suggestion.rationale}
            </p>
          )}
          <DemandForm
            campaignId={campaign.id}
            initialLinks={details?.links ?? []}
            value={form}
            urgencySelected={urgencySelected}
            onUrgencySelect={() => setUrgencySelected(true)}
            onChange={(value) => {
              setForm(value);
              transformKey.current = globalThis.crypto.randomUUID();
            }}
            disabled={busy}
            sourceLocked={mode === 'accept'}
          />
          <ButtonGroup aria-label="Salvar revisão">
            <Button
              disabled={busy}
              onClick={() => {
                setForm(null);
                setSuggestion(null);
              }}
            >
              Cancelar edição
            </Button>
            <Button
              disabled={
                busy ||
                !urgencySelected ||
                !form.title.trim() ||
                !form.need.trim() ||
                !form.requesterEntityId
              }
              onClick={() => (mode === 'child' ? setConfirm('child') : save())}
            >
              {mode === 'accept'
                ? 'Aceitar Demanda'
                : mode === 'child'
                  ? 'Criar filha e arquivar pai'
                  : 'Salvar Demanda'}
            </Button>
          </ButtonGroup>
        </>
      ) : d ? (
        <>
          <h2 className="text-2xl">{d.title}</h2>
          <p>
            {labels[d.status]} · Rascunho / Possibilidade · Urgência: {d.urgency}
          </p>
          <p className="whitespace-pre-wrap">{d.need}</p>
          <p className="whitespace-pre-wrap">{d.summary}</p>
          {d.obstacle && <p>Obstáculo: {d.obstacle}</p>}
          {d.risks && <p>Riscos: {d.risks}</p>}
          {d.parentId && (
            <Button
              disabled={busy}
              onClick={() => {
                if (d.parentId) open(d.parentId);
              }}
            >
              Ver Demanda pai (inclusive arquivada)
            </Button>
          )}
          <h3>Vínculos</h3>
          <ul>
            {details.links.map((link, index) => (
              <li key={index}>
                {targetLabels[link.targetType]} — {link.label} · {roles[link.role]}
                {link.archived ? ' (arquivada)' : ''}
              </li>
            ))}
          </ul>
          <h3>Subdemandas</h3>
          <ul>
            {details.children.map((child) => (
              <li key={child.id}>
                <Button disabled={busy} onClick={() => open(child.id)}>
                  {child.title} — {labels[child.status]}
                </Button>
              </li>
            ))}
          </ul>
          {!details.canResolve && editable && (
            <p>
              Encerre todas as subdemandas antes de resolver o pai; arquivadas só contam se já
              estavam encerradas.
            </p>
          )}
          <SourceSnapshot snapshot={d.sourceSnapshot} />
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  window.campaignManager.entities.get({
                    campaignId: campaign.id,
                    id: d.sourceEntityId,
                  }),
                (value) => {
                  const need = value.fieldValues.find(
                    (field) => field.fieldDefinitionId === d.sourceFieldDefinitionId,
                  )?.value;
                  setSourceText(
                    `${value.entity.name}: ${typeof need === 'string' ? need : 'Fonte indisponível'}`,
                  );
                },
                entityChannels.get,
              )
            }
          >
            Ver entidade e campo Need de origem
          </Button>
          {sourceText && <p className="whitespace-pre-wrap">{sourceText}</p>}
          <ButtonGroup aria-label="Ações da Demanda">
            {editable && (
              <>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setMode('edit');
                    setUrgencySelected(true);
                    setForm(contentOf(details));
                  }}
                >
                  Editar Demanda
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setMode('child');
                    setUrgencySelected(false);
                    setForm({
                      ...contentOf(details),
                      title: '',
                      need: '',
                      summary: '',
                      obstacle: '',
                      risks: '',
                    });
                    transformKey.current = globalThis.crypto.randomUUID();
                  }}
                >
                  Criar subdemanda
                </Button>
                {d.status === 'available' && (
                  <Button disabled={busy} onClick={() => transition('activate')}>
                    Ativar
                  </Button>
                )}
                <Button
                  disabled={busy || !details.canResolve}
                  onClick={() => setConfirm('resolve')}
                >
                  Resolver e criar Evento
                </Button>
                <Button disabled={busy} onClick={() => transition('fail')}>
                  Marcar falhada
                </Button>
                <Button disabled={busy} onClick={() => transition('ignore')}>
                  Ignorar Demanda aceita
                </Button>
              </>
            )}
            {['failed', 'ignored'].includes(d.status) && (
              <Button disabled={busy} onClick={() => transition('reopen')}>
                Reabrir para Disponível
              </Button>
            )}
            {d.status === 'archived' ? (
              <Button disabled={busy} onClick={() => transition('restore')}>
                Restaurar estado anterior
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => transition('archive')}>
                Arquivar Demanda
              </Button>
            )}
            <Button disabled={busy} onClick={() => open(d.id)}>
              Recarregar detalhe (descartar edição)
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setDetails(null);
                setEvent(null);
              }}
            >
              Voltar à lista
            </Button>
          </ButtonGroup>
          {d.generatedEventId && (
            <Button
              disabled={busy}
              onClick={() => {
                const id = d.generatedEventId;
                if (id)
                  void run(
                    () => window.campaignManager.events.get({ campaignId: campaign.id, id }),
                    setEvent,
                    eventChannels.get,
                  );
              }}
            >
              Ver Evento gerado
            </Button>
          )}
          {event && (
            <article className="grid gap-3 rounded border p-4">
              <h3>{event.event.title}</h3>
              <p className="whitespace-pre-wrap">{event.event.descriptionMarkdown}</p>
              <p>
                Evento{' '}
                {event.event.canonState === 'draft' ? 'Rascunho / Possibilidade' : 'Aceito / Fato'}.
                Conteúdo e vínculos congelados.
              </p>
              {event.event.canonState === 'draft' && event.event.archivedAt === null && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    const input = {
                      campaignId: campaign.id,
                      id: event.event.id,
                      revision: event.event.revision,
                      patch: { canonState: 'accepted' as const, knowledgeState: 'fact' as const },
                    };
                    void run(
                      () => window.campaignManager.events.update(input),
                      setEvent,
                      eventChannels.update,
                    );
                  }}
                >
                  Promover explicitamente Evento a Aceito / Fato
                </Button>
              )}
              <Button
                disabled={busy}
                onClick={() => {
                  const input = {
                    campaignId: campaign.id,
                    id: event.event.id,
                    revision: event.event.revision,
                  };
                  const action = event.event.archivedAt ? 'restore' : 'archive';
                  void run(
                    () => window.campaignManager.events[action](input),
                    setEvent,
                    eventChannels[action],
                  );
                }}
              >
                {event.event.archivedAt ? 'Restaurar Evento' : 'Arquivar Evento'}
              </Button>
            </article>
          )}
        </>
      ) : (
        <>
          <h2>Sugestões a partir de necessidades explícitas</h2>
          <Button
            disabled={busy || loading}
            onClick={() =>
              void run(
                () =>
                  window.campaignManager.campaignSignals.recalculate({ campaignId: campaign.id }),
                () => {
                  void load();
                },
                campaignSignalChannels.recalculate,
              )
            }
          >
            Recalcular sinais
          </Button>
          <label>
            Adiar até{' '}
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className={inputClass}
            />
          </label>
          {signalsFailure && (
            <UserFacingErrorNotice
              error={signalsFailure.error}
              operation={signalsFailure.operation}
              onRetry={signalsFailure.retry}
            />
          )}
          {signalsState === 'loading' && <p role="status">Carregando sugestões…</p>}
          {signalsState === 'success' && signals.length === 0 && (
            <p>
              Nenhuma necessidade explícita disponível. Preencha um campo de papel Need e recalcule
              os sinais.
            </p>
          )}
          <ul className="grid gap-4">
            {signals.map((item) => (
              <li key={item.signal.id} className="border rounded p-4">
                <h3>{item.signal.title}</h3>
                <p className="whitespace-pre-wrap">{item.signal.summary}</p>
                <p>
                  Estado do sinal: {item.signal.status}. Regra: {item.signal.ruleVersion}
                </p>
                <ul>
                  {item.evidence.map((e, index) => (
                    <li key={index}>
                      {e.objectName ?? 'Fonte removida'} — {e.role}: {e.description}
                    </li>
                  ))}
                </ul>
                <ButtonGroup aria-label="Revisar sinal">
                  {['new', 'viewed'].includes(item.signal.status) && (
                    <Button disabled={busy} onClick={() => review(item.signal.id)}>
                      Revisar para aceitar
                    </Button>
                  )}
                  {['new', 'viewed', 'stale', 'snoozed'].includes(item.signal.status) && (
                    <Button disabled={busy} onClick={() => signalAction(item, 'dismiss')}>
                      Ignorar sugestão
                    </Button>
                  )}
                  {['new', 'viewed', 'stale'].includes(item.signal.status) && (
                    <Button disabled={busy} onClick={() => signalAction(item, 'snooze')}>
                      Adiar sugestão
                    </Button>
                  )}
                  {['dismissed', 'snoozed', 'stale'].includes(item.signal.status) && (
                    <Button disabled={busy} onClick={() => signalAction(item, 'reactivate')}>
                      Reativar para revisão
                    </Button>
                  )}
                </ButtonGroup>
              </li>
            ))}
          </ul>
          <h2>Demandas aceitas</h2>
          <label>
            Estado{' '}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              disabled={loading}
              className={inputClass}
            >
              <option value="">Todos</option>
              {demandStatuses.map((status) => (
                <option value={status} key={status}>
                  {labels[status]}
                </option>
              ))}
            </select>
          </label>
          {demandsFailure && (
            <UserFacingErrorNotice
              error={demandsFailure.error}
              operation={demandsFailure.operation}
              onRetry={demandsFailure.retry}
            />
          )}
          {demandsState === 'loading' && <p role="status">Carregando Demandas…</p>}
          {demandsState === 'success' && items.length === 0 && (
            <p>Nenhuma Demanda aceita neste filtro.</p>
          )}
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Button disabled={busy} onClick={() => open(item.id)}>
                  {item.title} — {labels[item.status]}
                </Button>
              </li>
            ))}
          </ul>
          {cursor && (
            <Button disabled={loading} onClick={() => void loadDemands(cursor)}>
              Carregar mais Demandas
            </Button>
          )}
          <Button disabled={loading} onClick={() => void load()}>
            Atualizar lista
          </Button>
        </>
      )}
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setConfirm(null);
        }}
        aria-labelledby="demand-confirm-title"
        className="semantic-surface semantic-text rounded-xl p-6 max-w-xl"
      >
        <h2 id="demand-confirm-title">
          {confirm === 'resolve'
            ? 'Resolver Demanda e criar Evento?'
            : 'Criar filha e arquivar pai?'}
        </h2>
        <p>
          {confirm === 'resolve'
            ? 'A Demanda será resolvida e ficará somente leitura. Um Evento Rascunho será criado com todas as entidades vinculadas. Seu conteúdo, origem e vínculos não poderão ser modificados; somente promoção explícita a canônico e arquivamento serão permitidos.'
            : 'Uma nova subdemanda será criada e o pai será arquivado na mesma operação. Restaure o pai para resolvê-lo manualmente depois que todas as filhas forem encerradas.'}
        </p>
        {failure && (
          <UserFacingErrorNotice
            error={failure.error}
            operation={failure.operation}
            onRetry={failure.retry}
          />
        )}
        <ButtonGroup aria-label="Confirmar operação">
          <Button
            disabled={busy}
            onClick={() => {
              setConfirm(null);
              setFailure(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={() => (confirm === 'resolve' ? transition('resolve', true) : save())}
          >
            Confirmar
          </Button>
        </ButtonGroup>
      </dialog>
    </section>
  );
}

function SourceSnapshot({ snapshot }: { snapshot: string }): React.JSX.Element {
  const source = JSON.parse(snapshot) as {
    entityName: string;
    fieldLabel: string;
    need: string;
    rationale: string;
    signal: { rule_version: string };
    evidence: { role: string; description: string | null }[];
  };
  return (
    <aside className="border rounded p-4">
      <h3>Por que estou vendo isto? — proveniência preservada</h3>
      <p>
        {source.entityName} — {source.fieldLabel} · Regra {source.signal.rule_version}
      </p>
      <p className="whitespace-pre-wrap">{source.need}</p>
      <p>{source.rationale}</p>
      <ul>
        {source.evidence.map((item, index) => (
          <li key={index}>
            {item.role}: {item.description}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function DemandForm({
  campaignId,
  value,
  onChange,
  disabled,
  sourceLocked,
  urgencySelected,
  onUrgencySelect,
  initialLinks,
}: {
  campaignId: string;
  value: DemandContent;
  onChange: (value: DemandContent) => void;
  disabled: boolean;
  sourceLocked: boolean;
  initialLinks: DemandDetails['links'];
  urgencySelected: boolean;
  onUrgencySelect: () => void;
}): React.JSX.Element {
  const [type, setType] = useState<DemandLink['targetType']>('entity');
  const [targets, setTargets] = useState<DemandTarget[]>([]);
  const [entities, setEntities] = useState<DemandTarget[]>([]);
  const [target, setTarget] = useState('');
  const [role, setRole] = useState<DemandLink['role']>('related');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [retry, setRetry] = useState(0);
  const [linkLabels, setLinkLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialLinks.map((link) => [`${link.targetType}:${link.targetId}`, link.label]),
    ),
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setTarget('');
    async function all(targetType: DemandLink['targetType']): Promise<DemandTarget[]> {
      let cursor: string | null = null;
      const items: DemandTarget[] = [];
      do {
        const result = await window.campaignManager.demands.targets({
          campaignId,
          targetType,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
        if (!result.ok) throw new AppError(result.error.code, result.error.message);
        if (!active) return [];
        items.push(...result.data.items);
        cursor = result.data.nextCursor;
      } while (cursor);
      return items;
    }
    void Promise.all([all(type), all('entity')])
      .then(([options, requesters]) => {
        if (!active) return;
        setTargets(options);
        setEntities(requesters);
        setLinkLabels((previous) => ({
          ...previous,
          ...Object.fromEntries(options.map((item) => [`${type}:${item.id}`, item.label])),
          ...Object.fromEntries(requesters.map((item) => [`entity:${item.id}`, item.label])),
        }));
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            presentUserFacingError(
              reason,
              demandScreenDiagnosticOperations[demandChannels.targets],
            ),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, type, retry]);
  function patch<K extends keyof DemandContent>(key: K, next: DemandContent[K]): void {
    onChange({ ...value, [key]: next });
  }
  return (
    <fieldset disabled={disabled} className="grid gap-4 border rounded p-4">
      <legend>Dados da Demanda</legend>
      <label>
        Título obrigatório{' '}
        <input
          required
          className={inputClass}
          value={value.title}
          maxLength={200}
          onChange={(e) => patch('title', e.target.value)}
        />
      </label>
      <label>
        Necessidade obrigatória{' '}
        <textarea
          required
          readOnly={sourceLocked}
          className={inputClass}
          value={value.need}
          onChange={(e) => patch('need', e.target.value)}
        />
      </label>
      <label>
        Resumo{' '}
        <textarea
          className={inputClass}
          value={value.summary}
          onChange={(e) => patch('summary', e.target.value)}
        />
      </label>
      <label>
        Obstáculo{' '}
        <textarea
          className={inputClass}
          value={value.obstacle}
          onChange={(e) => patch('obstacle', e.target.value)}
        />
      </label>
      <label>
        Riscos{' '}
        <textarea
          className={inputClass}
          value={value.risks}
          onChange={(e) => patch('risks', e.target.value)}
        />
      </label>
      <label>
        Urgência (escolha manual){' '}
        <select
          className={inputClass}
          value={urgencySelected ? value.urgency : ''}
          onChange={(e) => {
            onUrgencySelect();
            patch('urgency', e.target.value as DemandContent['urgency']);
          }}
        >
          <option value="" disabled>
            Escolha a urgência
          </option>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="critical">Crítica</option>
        </select>
      </label>
      <label>
        Solicitante obrigatório{' '}
        <select
          aria-label="Solicitante obrigatório"
          className={inputClass}
          value={value.requesterEntityId}
          disabled={sourceLocked || loading}
          onChange={(e) => patch('requesterEntityId', e.target.value)}
        >
          <option value="">Selecione</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.label}
            </option>
          ))}
        </select>
      </label>
      <p>O solicitante é sempre uma entidade vinculada. Outros vínculos são opcionais.</p>
      <label>
        Tipo de vínculo{' '}
        <select
          aria-label="Tipo de vínculo"
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="entity">Entidade</option>
          <option value="clock">Relógio</option>
          <option value="session">Sessão</option>
        </select>
      </label>
      {loading ? (
        <p role="status">Carregando alvos…</p>
      ) : error ? (
        <UserFacingErrorNotice
          error={error}
          operation={demandScreenDiagnosticOperations[demandChannels.targets]}
          onRetry={() => setRetry((n) => n + 1)}
          retryLabel="Tentar carregar alvos novamente"
        />
      ) : (
        <>
          <label>
            Alvo{' '}
            <select
              aria-label="Alvo"
              className={inputClass}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Selecione</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {type === 'entity' && (
            <label>
              Papel{' '}
              <select
                aria-label="Papel"
                className={inputClass}
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                {demandRoles
                  .filter((r) => r !== 'requester')
                  .map((r) => (
                    <option value={r} key={r}>
                      {roles[r]}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <Button
            disabled={!target}
            aria-label="Adicionar vínculo"
            onClick={() => {
              const link = {
                targetType: type,
                targetId: target,
                role: type === 'entity' ? role : ('related' as const),
              };
              if (
                !value.links.some(
                  (l) =>
                    l.targetType === link.targetType &&
                    l.targetId === link.targetId &&
                    l.role === link.role,
                )
              )
                patch('links', [...value.links, link]);
            }}
          >
            + Adicionar
          </Button>
        </>
      )}
      <ul>
        {value.links.map((link, index) => (
          <li key={index}>
            {targetLabels[link.targetType]} —{' '}
            {linkLabels[`${link.targetType}:${link.targetId}`] ?? 'Vínculo preservado'} ·{' '}
            {roles[link.role]}{' '}
            <Button
              onClick={() =>
                patch(
                  'links',
                  value.links.filter((_, i) => i !== index),
                )
              }
            >
              Remover vínculo
            </Button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
