import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import {
  storyThreadStatuses,
  storyThreadTargetTypes,
  storyThreadTypes,
  type StoryThread,
  type StoryThreadDetails,
  type StoryThreadLinkInput,
  type StoryThreadTarget,
  type StoryThreadTargetTypes,
} from '../../../core/contracts/story-threads';
import type { Session } from '../../../core/contracts/sessions';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import {
  loadAllCampaignSessions,
  retryStoryThreadOperation,
  type StoryThreadRetryOperation,
} from './story-thread-async';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { Button, ButtonGroup } from '../../components/actions';
import { ContextualHelp } from '../../components/contextual-help';

const typeLabels: Record<(typeof storyThreadTypes)[number], string> = {
  promise: 'Promessa',
  mystery: 'Mistério',
  clue: 'Pista',
  threat: 'Ameaça',
  relationship: 'Relação',
  unanswered_question: 'Pergunta sem resposta',
  unfinished_goal: 'Objetivo inacabado',
  ignored_demand: 'Demanda ignorada',
  custom: 'Personalizado',
};
const statusLabels: Record<(typeof storyThreadStatuses)[number], string> = {
  open: 'Aberto',
  active: 'Ativo',
  dormant: 'Adormecido',
  resolved: 'Resolvido',
  abandoned: 'Abandonado',
  archived: 'Arquivado',
};
const targetLabels: Record<StoryThreadTargetTypes, string> = {
  entity: 'Entidade',
  relationship: 'Relação',
  assertion: 'Afirmação',
  note: 'Nota',
  event: 'Evento',
  session: 'Sessão',
};
const textClass = 'rounded-lg border semantic-border semantic-input px-3 py-2';

type View = 'list' | 'detail' | 'create' | 'edit';

export function StoryThreadManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>('list');
  const [items, setItems] = useState<StoryThread[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [targetCursor, setTargetCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof storyThreadStatuses)[number] | ''>('');
  const [selected, setSelected] = useState<StoryThreadDetails | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<UserFacingError | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [errorOperation, setErrorOperation] =
    useState<StoryThreadRetryOperation>('story-threads.list');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<ThreadForm>(emptyForm);
  const [targetType, setTargetType] = useState<StoryThreadTargetTypes>('entity');
  const [targets, setTargets] = useState<StoryThreadTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [newTargetId, setNewTargetId] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionSession, setTransitionSession] = useState('');
  const listRequest = useRef(0);
  const targetRequest = useRef(0);
  const selectionRequest = useRef(0);
  const sessionRequest = useRef(0);
  const failedGet = useRef<StoryThread | null>(null);

  useEffect(
    () => () => {
      listRequest.current += 1;
      targetRequest.current += 1;
      selectionRequest.current += 1;
      sessionRequest.current += 1;
    },
    [],
  );

  const loadSessions = useCallback(async (): Promise<void> => {
    const requestNumber = ++sessionRequest.current;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const loaded = await loadAllCampaignSessions(
        (input) => window.campaignManager.sessions.list(input),
        campaign.id,
      );
      if (requestNumber === sessionRequest.current) setSessions(loaded);
    } catch (reason) {
      if (requestNumber === sessionRequest.current)
        setSessionsError(presentUserFacingError(reason, 'sessions.list'));
    } finally {
      if (requestNumber === sessionRequest.current) setSessionsLoading(false);
    }
  }, [campaign.id]);

  const loadList = useCallback(
    async (append = false, requestedCursor: string | null = null): Promise<void> => {
      const requestNumber = ++listRequest.current;
      setLoading(true);
      setError(null);
      setErrorOperation('story-threads.list');
      const requestCursor = append ? requestedCursor : null;
      try {
        const result = await window.campaignManager.storyThreads.list({
          campaignId: campaign.id,
          ...(statusFilter === '' ? {} : { status: statusFilter }),
          ...(requestCursor === null ? {} : { cursor: requestCursor }),
          limit: 50,
        });
        if (requestNumber !== listRequest.current) return;
        if (!result.ok) {
          setError(presentUserFacingError(result.error, 'story-threads.list'));
          return;
        }
        setItems((previous) =>
          append && requestCursor !== null
            ? [...previous, ...result.data.items]
            : result.data.items,
        );
        setCursor(result.data.nextCursor);
      } catch {
        if (requestNumber === listRequest.current)
          setError(presentUserFacingError(undefined, 'story-threads.list'));
      } finally {
        if (requestNumber === listRequest.current) setLoading(false);
      }
    },
    [campaign.id, statusFilter],
  );

  const loadTargets = useCallback(
    async (requestCursor: string | null): Promise<void> => {
      const requestNumber = ++targetRequest.current;
      setTargetsLoading(true);
      setError(null);
      setErrorOperation('story-threads.targets');
      try {
        const result = await window.campaignManager.storyThreads.listTargets({
          campaignId: campaign.id,
          targetType,
          ...(requestCursor === null ? {} : { cursor: requestCursor }),
          limit: 50,
        });
        if (requestNumber !== targetRequest.current) return;
        if (result.ok) {
          setTargets((current) =>
            requestCursor === null ? result.data.items : [...current, ...result.data.items],
          );
          setTargetCursor(result.data.nextCursor);
        } else setError(presentUserFacingError(result.error, 'story-threads.targets'));
      } catch {
        if (requestNumber === targetRequest.current)
          setError(presentUserFacingError(undefined, 'story-threads.targets'));
      } finally {
        if (requestNumber === targetRequest.current) setTargetsLoading(false);
      }
    },
    [campaign.id, targetType],
  );

  useEffect(() => {
    setSessions([]);
    void loadSessions();
    return () => {
      sessionRequest.current += 1;
    };
  }, [loadSessions]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setSelected(null);
    setView('list');
    setError(null);
    void loadList(false, null);
    return () => {
      listRequest.current += 1;
      selectionRequest.current += 1;
      failedGet.current = null;
    };
  }, [campaign.id, statusFilter, loadList]);

  useEffect(() => {
    setTargets([]);
    setTargetCursor(null);
    setNewTargetId('');
    void loadTargets(null);
    return () => {
      targetRequest.current += 1;
    };
  }, [campaign.id, targetType, loadTargets]);

  const openThread = useCallback(
    async (item: StoryThread): Promise<void> => {
      const requestNumber = ++selectionRequest.current;
      failedGet.current = item;
      setBusy(true);
      setError(null);
      setErrorOperation('story-threads.get');
      try {
        const result = await window.campaignManager.storyThreads.get({
          campaignId: campaign.id,
          id: item.id,
        });
        if (requestNumber !== selectionRequest.current) return;
        if (result.ok) {
          failedGet.current = null;
          setSelected(result.data);
          setView('detail');
        } else setError(presentUserFacingError(result.error, 'story-threads.get'));
      } catch {
        if (requestNumber === selectionRequest.current)
          setError(presentUserFacingError(undefined, 'story-threads.get'));
      } finally {
        if (requestNumber === selectionRequest.current) setBusy(false);
      }
    },
    [campaign.id],
  );

  const startCreate = (): void => {
    selectionRequest.current += 1;
    failedGet.current = null;
    setSelected(null);
    setForm(emptyForm());
    setView('create');
    setError(null);
  };
  const leaveCurrentView = (): void => {
    selectionRequest.current += 1;
    failedGet.current = null;
    setError(null);
    setView(view === 'detail' ? 'list' : selected === null ? 'list' : 'detail');
  };
  const startEdit = (): void => {
    if (selected === null) return;
    setForm({
      title: selected.thread.title,
      description: selected.thread.description ?? '',
      threadType: selected.thread.threadType,
      originKind: selected.thread.originKind,
      sessionId: selected.thread.originSessionId ?? '',
      reason: selected.thread.originReason ?? '',
      links: selected.links.map(({ targetType, targetId }) => ({ targetType, targetId })),
      linkLabels: Object.fromEntries(
        selected.links.map((link) => [`${link.targetType}:${link.targetId}`, link.label]),
      ),
    });
    setView('edit');
    setError(null);
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        view === 'edit' && selected !== null
          ? await window.campaignManager.storyThreads.update({
              campaignId: campaign.id,
              id: selected.thread.id,
              revision: selected.thread.revision,
              patch: {
                title: form.title,
                description: form.description === '' ? null : form.description,
                threadType: form.threadType,
              },
              links: form.links,
            })
          : await window.campaignManager.storyThreads.create({
              campaignId: campaign.id,
              title: form.title,
              description: form.description === '' ? null : form.description,
              threadType: form.threadType,
              originKind: form.originKind,
              ...(form.originKind === 'session' && form.sessionId !== ''
                ? { sessionId: form.sessionId }
                : {}),
              ...(form.reason.trim() === '' ? {} : { originReason: form.reason }),
              links: form.links,
            });
      if (result.ok) {
        setSelected(result.data);
        setNotice(view === 'edit' ? 'Fio atualizado.' : 'Fio criado.');
        setView('detail');
        await loadList(false, null);
      } else {
        setErrorOperation('story-threads.mutate');
        setError(presentUserFacingError(result.error, 'story-threads.mutate'));
      }
    } catch {
      setErrorOperation('story-threads.mutate');
      setError(presentUserFacingError(undefined, 'story-threads.mutate'));
    } finally {
      setBusy(false);
    }
  };

  const transition = async (
    action: 'resolve' | 'abandon' | 'reopen' | 'archive' | 'restore' | 'set',
    status?: 'open' | 'active' | 'dormant',
  ): Promise<void> => {
    if (busy || selected === null) return;
    setBusy(true);
    setError(null);
    const input = {
      campaignId: campaign.id,
      id: selected.thread.id,
      revision: selected.thread.revision,
      ...(transitionReason.trim() === '' ? {} : { reason: transitionReason }),
      ...(transitionSession === '' ? {} : { sessionId: transitionSession }),
    };
    try {
      const api = window.campaignManager.storyThreads;
      const result =
        action === 'resolve'
          ? await api.resolve(input)
          : action === 'abandon'
            ? await api.abandon(input)
            : action === 'reopen'
              ? await api.reopen(input)
              : action === 'archive'
                ? await api.archive(input)
                : action === 'restore'
                  ? await api.restore(input)
                  : await api.setStatus({ ...input, status: status ?? 'open' });
      if (result.ok) {
        setSelected(result.data);
        setTransitionReason('');
        setTransitionSession('');
        setNotice(`Estado atualizado: ${statusLabels[result.data.thread.status]}.`);
        await loadList(false, null);
      } else {
        setErrorOperation('story-threads.mutate');
        setError(presentUserFacingError(result.error, 'story-threads.mutate'));
      }
    } catch {
      setErrorOperation('story-threads.mutate');
      setError(presentUserFacingError(undefined, 'story-threads.mutate'));
    } finally {
      setBusy(false);
    }
  };

  const addTarget = (): void => {
    if (newTargetId === '') return;
    const candidate: StoryThreadLinkInput = { targetType, targetId: newTargetId };
    if (
      !form.links.some((link) => link.targetType === targetType && link.targetId === newTargetId)
    ) {
      const target = targets.find((item) => item.id === newTargetId);
      setForm((value) => ({
        ...value,
        links: [...value.links, candidate],
        linkLabels: {
          ...value.linkLabels,
          [`${targetType}:${newTargetId}`]: target?.label ?? 'Registro vinculado',
        },
      }));
    }
    setNewTargetId('');
  };

  const viewLabel = useMemo(() => {
    if (view === 'create') return 'Novo fio';
    if (view === 'edit') return 'Editar fio';
    if (view === 'detail') return selected?.thread.title ?? 'Detalhes do fio';
    return 'Fios Abertos';
  }, [selected?.thread.title, view]);

  return (
    <section aria-labelledby="threads-title" className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
            Mundo em Movimento
          </p>
          <h1 className="mt-2 text-3xl font-semibold semantic-text-primary" id="threads-title">
            {viewLabel}
            <ContextualHelp
              label="Fios Abertos"
              content={{
                description: 'Elementos narrativos que ainda podem retornar à campanha.',
                purpose: 'Registrar e acompanhar pendências narrativas sem alterar o cânone.',
                example: 'Uma promessa não cumprida ou um mistério ainda sem resposta.',
                consequence:
                  'Resolver, abandonar, reabrir e arquivar são ações explícitas; mudanças não ocorrem automaticamente.',
              }}
            />
          </h1>
          <p className="mt-2 max-w-3xl text-sm semantic-text-secondary">
            Registre aqui pontas soltas da história que você quer acompanhar e talvez retomar em
            sessões futuras — como mistérios, promessas, ameaças e objetivos inacabados. Vincule
            personagens ou registros relacionados e atualize o estado conforme a história avança. Um
            fio é um lembrete para o narrador: ele não cria acontecimentos nem os resolve
            automaticamente.
          </p>
        </div>
        <ButtonGroup aria-label="Navegação dos fios">
          {view !== 'list' ? (
            <Button disabled={busy} onClick={leaveCurrentView}>
              Voltar
            </Button>
          ) : (
            <Button onClick={onBack}>Voltar à campanha</Button>
          )}
          {view === 'list' ? (
            <Button disabled={busy} onClick={startCreate} variant="primary">
              Criar fio
            </Button>
          ) : null}
        </ButtonGroup>
      </header>

      {notice !== '' ? (
        <p aria-live="polite" className="semantic-text-secondary" role="status">
          {notice}
        </p>
      ) : null}
      {error !== null ? (
        <UserFacingErrorNotice
          error={error}
          operation={errorOperation}
          onRetry={() =>
            retryStoryThreadOperation(errorOperation, {
              list: () => void loadList(false, null),
              targets: () => void loadTargets(null),
              get: () => {
                const item = failedGet.current;
                if (item !== null) void openThread(item);
              },
              mutate: () => void save(),
              sessions: () => void loadSessions(),
            })
          }
        />
      ) : null}
      {sessionsLoading ? (
        <p aria-busy="true" className="semantic-text-secondary" role="status">
          Carregando sessões da campanha…
        </p>
      ) : null}
      {sessionsError !== null ? (
        <UserFacingErrorNotice
          error={sessionsError}
          operation="sessions.list"
          onRetry={() => void loadSessions()}
          retryLabel="Tentar carregar sessões novamente"
        />
      ) : null}

      {view === 'list' ? (
        <>
          <label className="grid max-w-sm gap-1 text-sm semantic-text-secondary">
            Filtrar por estado
            <select
              className={textClass}
              onChange={(event) =>
                setStatusFilter(event.currentTarget.value as typeof statusFilter)
              }
              value={statusFilter}
            >
              <option value="">Todos os estados</option>
              {storyThreadStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          {loading ? (
            <p aria-busy="true" className="semantic-text-secondary" role="status">
              Carregando fios…
            </p>
          ) : null}
          {!loading && error === null && items.length === 0 ? (
            <div className="rounded-2xl border semantic-border p-6">
              <p className="font-semibold semantic-text-primary">Ainda não há fios neste filtro.</p>
              <p className="mt-2 text-sm semantic-text-secondary">
                Crie um fio para registrar algo que poderá retornar à campanha.
              </p>
              <Button className="mt-4" onClick={startCreate} variant="primary">
                Criar primeiro fio
              </Button>
            </div>
          ) : null}
          <ul className="grid gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className="w-full cursor-pointer rounded-2xl border semantic-border p-4 text-left transition hover:semantic-navigation-surface"
                  disabled={busy}
                  onClick={() => void openThread(item)}
                  type="button"
                >
                  <span className="font-semibold semantic-text-primary">{item.title}</span>
                  <span className="mt-1 block text-sm semantic-text-secondary">
                    {typeLabels[item.threadType]} · {statusLabels[item.status]}
                  </span>
                  {item.description ? (
                    <span className="mt-2 block text-sm semantic-text-secondary">
                      {item.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {cursor !== null ? (
            <Button disabled={loading} onClick={() => void loadList(true, cursor)}>
              Carregar mais fios
            </Button>
          ) : null}
        </>
      ) : null}

      {view === 'create' || view === 'edit' ? (
        <div className="grid max-w-3xl gap-4">
          <label className="grid gap-1 text-sm semantic-text-secondary">
            Título
            <input
              autoFocus
              className={textClass}
              maxLength={200}
              onChange={(event) => {
                const title = event.currentTarget.value;
                setForm((value) => ({ ...value, title }));
              }}
              value={form.title}
            />
          </label>
          <label className="grid gap-1 text-sm semantic-text-secondary">
            Tipo
            <select
              aria-label="Tipo do fio"
              className={textClass}
              onChange={(event) => {
                const threadType = event.currentTarget.value as ThreadForm['threadType'];
                setForm((value) => ({
                  ...value,
                  threadType,
                }));
              }}
              value={form.threadType}
            >
              {storyThreadTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm semantic-text-secondary">
            Descrição (opcional)
            <textarea
              className={textClass}
              maxLength={10000}
              onChange={(event) => {
                const description = event.currentTarget.value;
                setForm((value) => ({ ...value, description }));
              }}
              rows={4}
              value={form.description}
            />
          </label>
          {view === 'create' ? (
            <>
              <label className="grid gap-1 text-sm semantic-text-secondary">
                Origem do fio
                <select
                  className={textClass}
                  onChange={(event) => {
                    const originKind = event.currentTarget.value as 'manual' | 'session';
                    setForm((value) => ({
                      ...value,
                      originKind,
                      sessionId: '',
                    }));
                  }}
                  value={form.originKind}
                >
                  <option value="manual">Registro manual</option>
                  <option value="session">Sessão</option>
                </select>
              </label>
              {form.originKind === 'session' ? (
                <SessionField
                  loading={sessionsLoading}
                  sessions={sessions}
                  value={form.sessionId}
                  onChange={(sessionId) => setForm((value) => ({ ...value, sessionId }))}
                  label="Sessão de origem"
                />
              ) : null}
              <label className="grid gap-1 text-sm semantic-text-secondary">
                Motivo ou contexto inicial (opcional)
                <textarea
                  className={textClass}
                  maxLength={2000}
                  onChange={(event) => {
                    const reason = event.currentTarget.value;
                    setForm((value) => ({ ...value, reason }));
                  }}
                  rows={2}
                  value={form.reason}
                />
              </label>
            </>
          ) : null}
          <TargetEditor
            form={form}
            targetType={targetType}
            targets={targets}
            loading={targetsLoading}
            targetCursor={targetCursor}
            targetId={newTargetId}
            setTargetType={setTargetType}
            setTargetId={setNewTargetId}
            onAdd={addTarget}
            onLoadMore={() => void loadTargets(targetCursor)}
            onRemove={(index) =>
              setForm((value) => ({
                ...value,
                links: value.links.filter((_, itemIndex) => itemIndex !== index),
              }))
            }
          />
          <ButtonGroup aria-label="Salvar alterações do fio">
            <Button disabled={busy} onClick={() => setView(selected === null ? 'list' : 'detail')}>
              Cancelar
            </Button>
            <Button
              disabled={
                busy ||
                form.title.trim() === '' ||
                (view === 'create' && form.originKind === 'session' && form.sessionId === '')
              }
              onClick={() => void save()}
              variant="primary"
            >
              {busy ? 'Salvando…' : view === 'edit' ? 'Salvar alterações' : 'Criar fio'}
            </Button>
          </ButtonGroup>
        </div>
      ) : null}

      {view === 'detail' && selected !== null ? (
        <ThreadDetail
          details={selected}
          busy={busy}
          sessionsLoading={sessionsLoading}
          sessions={sessions}
          reason={transitionReason}
          sessionId={transitionSession}
          onReasonChange={setTransitionReason}
          onSessionChange={setTransitionSession}
          onEdit={startEdit}
          onTransition={(action, status) => void transition(action, status)}
        />
      ) : null}
    </section>
  );
}

interface ThreadForm {
  title: string;
  description: string;
  threadType: (typeof storyThreadTypes)[number];
  originKind: 'manual' | 'session';
  sessionId: string;
  reason: string;
  links: StoryThreadLinkInput[];
  linkLabels: Record<string, string>;
}
function emptyForm(): ThreadForm {
  return {
    title: '',
    description: '',
    threadType: 'custom',
    originKind: 'manual',
    sessionId: '',
    reason: '',
    links: [],
    linkLabels: {},
  };
}

function SessionField({
  sessions,
  loading,
  value,
  onChange,
  label,
}: {
  sessions: Session[];
  loading: boolean;
  value: string;
  onChange: (value: string) => void;
  label: string;
}): React.JSX.Element {
  return (
    <label className="grid gap-1 text-sm semantic-text-secondary">
      {label}
      <select
        className={textClass}
        disabled={loading}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        <option value="">{loading ? 'Carregando sessões…' : 'Escolher sessão'}</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            Sessão {session.sequenceNumber}: {session.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function TargetEditor({
  form,
  targetType,
  targets,
  loading,
  targetCursor,
  targetId,
  setTargetType,
  setTargetId,
  onAdd,
  onLoadMore,
  onRemove,
}: {
  form: ThreadForm;
  targetType: StoryThreadTargetTypes;
  targets: StoryThreadTarget[];
  loading: boolean;
  targetCursor: string | null;
  targetId: string;
  setTargetType: (type: StoryThreadTargetTypes) => void;
  setTargetId: (id: string) => void;
  onAdd: () => void;
  onLoadMore: () => void;
  onRemove: (index: number) => void;
}): React.JSX.Element {
  return (
    <fieldset className="grid max-w-full gap-3 overflow-hidden rounded-2xl border semantic-border p-4">
      <legend className="px-2 font-semibold semantic-text-primary">
        Vínculos com registros existentes
      </legend>
      <p className="text-sm semantic-text-secondary">
        Só é possível adicionar registros ativos. Vínculos já existentes com registros
        posteriormente arquivados são preservados.
      </p>
      <div className="grid min-w-0 max-w-full gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <label className="grid min-w-0 gap-1 text-sm semantic-text-secondary">
          Tipo de registro
          <select
            className={`${textClass} w-full min-w-0`}
            onChange={(event) => setTargetType(event.currentTarget.value as StoryThreadTargetTypes)}
            value={targetType}
          >
            {storyThreadTargetTypes.map((type) => (
              <option key={type} value={type}>
                {targetLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm semantic-text-secondary">
          Registro
          <select
            className={`${textClass} w-full min-w-0 truncate`}
            disabled={loading || targets.length === 0}
            onChange={(event) => setTargetId(event.currentTarget.value)}
            value={targetId}
          >
            <option value="">{loading ? 'Carregando registros…' : 'Escolher registro'}</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="self-end justify-self-start"
          disabled={targetId === '' || loading}
          onClick={onAdd}
        >
          Vincular
        </Button>
      </div>
      {form.links.length === 0 ? (
        <p className="text-sm semantic-text-secondary">Nenhum registro vinculado.</p>
      ) : (
        <ul className="grid gap-2">
          {form.links.map((link, index) => {
            const label =
              form.linkLabels[`${link.targetType}:${link.targetId}`] ?? 'Registro vinculado';
            return (
              <li
                className="flex items-center justify-between gap-3 rounded-lg semantic-surface px-3 py-2"
                key={`${link.targetType}:${link.targetId}`}
              >
                <span className="text-sm semantic-text-primary">
                  {targetLabels[link.targetType]} — {label}
                </span>
                <Button
                  aria-label={`Remover vínculo ${targetLabels[link.targetType]}`}
                  onClick={() => onRemove(index)}
                  size="small"
                >
                  Remover
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {targetCursor !== null ? (
        <Button disabled={loading} onClick={onLoadMore}>
          Carregar mais registros
        </Button>
      ) : null}
    </fieldset>
  );
}

function ThreadDetail({
  details,
  busy,
  sessionsLoading,
  sessions,
  reason,
  sessionId,
  onReasonChange,
  onSessionChange,
  onEdit,
  onTransition,
}: {
  details: StoryThreadDetails;
  busy: boolean;
  sessionsLoading: boolean;
  sessions: Session[];
  reason: string;
  sessionId: string;
  onReasonChange: (value: string) => void;
  onSessionChange: (value: string) => void;
  onEdit: () => void;
  onTransition: (
    action: 'resolve' | 'abandon' | 'reopen' | 'archive' | 'restore' | 'set',
    status?: 'open' | 'active' | 'dormant',
  ) => void;
}): React.JSX.Element {
  const thread = details.thread;
  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border semantic-border p-5">
        <p className="text-sm semantic-text-secondary">
          {typeLabels[thread.threadType]} · {statusLabels[thread.status]}
        </p>
        {thread.description ? (
          <p className="mt-3 whitespace-pre-wrap semantic-text-primary">{thread.description}</p>
        ) : null}
        <p className="mt-3 text-sm semantic-text-secondary">
          Origem:{' '}
          {thread.originKind === 'manual'
            ? 'Registro manual'
            : `Sessão — ${thread.originSessionTitle ?? 'indisponível'}`}
          {thread.originReason ? ` · Contexto: ${thread.originReason}` : ''}
        </p>
        <Button className="mt-4" disabled={busy || thread.status === 'archived'} onClick={onEdit}>
          Editar fio
        </Button>
      </section>

      <section className="rounded-2xl border semantic-border p-5">
        <h2 className="text-lg font-semibold semantic-text-primary">Registros vinculados</h2>
        {details.links.length === 0 ? (
          <p className="mt-2 text-sm semantic-text-secondary">Nenhum vínculo.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {details.links.map((link) => (
              <li className="rounded-lg semantic-surface px-3 py-2 text-sm" key={link.id}>
                <span className="font-semibold">{targetLabels[link.targetType]}:</span> {link.label}
                {link.archived ? (
                  <span className="ml-2 semantic-text-secondary">
                    (arquivado; vínculo preservado)
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border semantic-border p-5">
        <h2 className="text-lg font-semibold semantic-text-primary">
          Registrar uma mudança de estado
        </h2>
        <p className="mt-1 text-sm semantic-text-secondary">
          Motivo e sessão são opcionais. A ação não altera o cânone.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm semantic-text-secondary">
            Motivo (opcional)
            <textarea
              className={textClass}
              maxLength={2000}
              onChange={(event) => onReasonChange(event.currentTarget.value)}
              rows={2}
              value={reason}
            />
          </label>
          <SessionField
            loading={sessionsLoading}
            label="Sessão relacionada (opcional)"
            onChange={onSessionChange}
            sessions={sessions}
            value={sessionId}
          />
        </div>
        <ButtonGroup aria-label="Transições de estado" className="mt-4">
          {['open', 'active', 'dormant'].includes(thread.status) ? (
            <>
              {(['open', 'active', 'dormant'] as const)
                .filter((status) => status !== thread.status)
                .map((status) => (
                  <Button disabled={busy} key={status} onClick={() => onTransition('set', status)}>
                    Marcar como {statusLabels[status].toLocaleLowerCase('pt-BR')}
                  </Button>
                ))}
              <Button disabled={busy} onClick={() => onTransition('resolve')}>
                Resolver
              </Button>
              <Button disabled={busy} onClick={() => onTransition('abandon')}>
                Abandonar
              </Button>
              <Button disabled={busy} onClick={() => onTransition('archive')}>
                Arquivar
              </Button>
            </>
          ) : null}
          {['resolved', 'abandoned'].includes(thread.status) ? (
            <>
              <Button disabled={busy} onClick={() => onTransition('reopen')} variant="primary">
                Reabrir como aberto
              </Button>
              <Button disabled={busy} onClick={() => onTransition('archive')}>
                Arquivar
              </Button>
            </>
          ) : null}
          {thread.status === 'archived' ? (
            <Button disabled={busy} onClick={() => onTransition('restore')}>
              Desarquivar e restaurar estado anterior
            </Button>
          ) : null}
        </ButtonGroup>
      </section>

      <section className="rounded-2xl border semantic-border p-5">
        <h2 className="text-lg font-semibold semantic-text-primary">Histórico deste fio</h2>
        {details.transitions.length === 0 ? (
          <p className="mt-2 text-sm semantic-text-secondary">Sem mudanças registradas.</p>
        ) : (
          <ol className="mt-3 grid gap-3">
            {details.transitions.map((transition) => (
              <li className="border-l-2 semantic-border pl-3" key={transition.id}>
                <p className="font-semibold semantic-text-primary">
                  {transition.fromStatus === null ? 'Criado' : statusLabels[transition.fromStatus]}{' '}
                  → {statusLabels[transition.toStatus]}
                </p>
                <p className="text-sm semantic-text-secondary">
                  {new Date(transition.occurredAt).toLocaleString('pt-BR')}
                  {transition.reason ? ` · ${transition.reason}` : ''}
                  {transition.sessionTitle ? ` · Sessão: ${transition.sessionTitle}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
