import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type {
  CreateSessionInput,
  Session,
  SessionIntention,
  SessionParticipantInput,
} from '../../../core/contracts/sessions';
import { inputClass } from '../narrative/narrative-metadata-fields';
import { EventManager } from './event-manager';
import {
  presentUserFacingError,
  type UserFacingError,
  type UserFacingErrorOperation,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { ReorderableList } from '../../components/reorderable-list';
import {
  Button,
  ButtonGroup,
  DialogActions,
  FormActions,
  ToolbarActions,
} from '../../components/actions';
import { moveRelative } from '../../../core/ordering/move-relative';

type View = 'list' | 'create' | 'edit';
type SessionStatus = Session['status'];
interface PendingTransition {
  session: Session;
  status: Extract<SessionStatus, 'in_progress' | 'completed' | 'cancelled'>;
}
interface ParticipantDraft extends SessionParticipantInput {
  id: string;
}
type SessionOperation = Extract<UserFacingErrorOperation, 'sessions.list' | 'sessions.mutate'>;
interface SessionOperationFailure {
  error: UserFacingError;
  operation: SessionOperation;
}

const roleLabels: Record<SessionParticipantInput['role'], string> = {
  player_character: 'Personagem jogador',
  ally: 'Aliado',
  npc: 'NPC',
  observer: 'Observador',
  other: 'Outro',
};

export function SessionManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<Session[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus | ''>('');
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [section, setSection] = useState<'sessions' | 'events'>('sessions');

  const load = useCallback(
    async (append = false): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.campaignManager.sessions.list({
          campaignId: campaign.id,
          limit: 50,
          ...(append && cursor !== null ? { cursor } : {}),
          filters: status === '' ? {} : { status },
        });
        if (result.ok) {
          setItems((current) => (append ? [...current, ...result.data.items] : result.data.items));
          setCursor(result.data.nextCursor);
        } else setError(presentUserFacingError(result.error, 'sessions.list'));
      } catch {
        setError(presentUserFacingError(undefined, 'sessions.list'));
      } finally {
        setLoading(false);
      }
    },
    [campaign.id, cursor, status],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [campaign.id, status]);
  useEffect(() => {
    void loadAllEntities(campaign.id)
      .then(setEntities)
      .catch((loadError: unknown) => setError(presentUserFacingError(loadError, 'entities.list')));
  }, [campaign.id]);

  async function beginEdit(item: Session): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.sessions.get({
        campaignId: campaign.id,
        id: item.id,
      });
      if (result.ok) {
        setEditing(result.data);
        setView('edit');
      } else setError(presentUserFacingError(result.error, 'sessions.mutate'));
    } catch {
      setError(presentUserFacingError(undefined, 'sessions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function saveSession(input: CreateSessionInput): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        editing === null
          ? await window.campaignManager.sessions.create(input)
          : await window.campaignManager.sessions.update({
              campaignId: campaign.id,
              id: editing.id,
              revision: editing.revision,
              patch: sessionPatch(input, editing),
            });
      if (result.ok) {
        setEditing(result.data);
        setView('edit');
        setAnnouncement(editing === null ? 'Sessão planejada.' : 'Sessão atualizada.');
        await load(false);
      } else setError(presentUserFacingError(result.error, 'sessions.mutate'));
    } catch {
      setError(presentUserFacingError(undefined, 'sessions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function transition(): Promise<void> {
    if (pending === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.sessions.update({
        campaignId: campaign.id,
        id: pending.session.id,
        revision: pending.session.revision,
        patch: { status: pending.status },
      });
      if (result.ok) {
        setEditing((current) => (current?.id === result.data.id ? result.data : current));
        setPending(null);
        setAnnouncement(`Sessão ${statusLabel(result.data.status).toLowerCase()}.`);
        await load(false);
      } else setError(presentUserFacingError(result.error, 'sessions.mutate'));
    } catch {
      setError(presentUserFacingError(undefined, 'sessions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  if (section === 'events')
    return <EventManager campaign={campaign} onBack={() => setSection('sessions')} />;
  if (view !== 'list')
    return (
      <SessionEditor
        campaign={campaign}
        entities={entities}
        session={editing}
        busy={busy}
        error={error}
        pending={pending}
        onBack={() => {
          setEditing(null);
          setView('list');
          setError(null);
        }}
        onSave={saveSession}
        onTransition={setPending}
        onCancelTransition={() => setPending(null)}
        onConfirmTransition={transition}
        onReplace={(session) => setEditing(session)}
        onBusyChange={setBusy}
      />
    );
  return (
    <section aria-labelledby="sessions-title">
      <Button onClick={onBack} size="small" variant="ghost">
        ← Voltar para detalhes da campanha
      </Button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b semantic-border pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="sessions-title">
            Sessões
          </h1>
          <p className="mt-2 semantic-text-secondary">
            Planeje e acompanhe o ciclo de vida de cada sessão.
          </p>
        </div>
        <ToolbarActions aria-label="Ações de sessões">
          <Button
            disabled={busy}
            onClick={() => {
              setEditing(null);
              setView('create');
            }}
            size="large"
            variant="primary"
          >
            Planejar sessão
          </Button>
          <Button disabled={busy} onClick={() => setSection('events')} size="large">
            Gerenciar eventos
          </Button>
        </ToolbarActions>
      </header>
      <div
        className="mt-5 flex flex-wrap gap-2"
        role="group"
        aria-label="Filtrar sessões por status"
      >
        <StatusFilter value={status} onChange={setStatus} />
      </div>
      {announcement === null ? null : (
        <p
          role="status"
          aria-live="polite"
          className="mt-5 rounded-xl border semantic-success-border semantic-success-surface p-4 semantic-success-text"
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div className="mt-5">
          <UserFacingErrorNotice
            error={error}
            operation="sessions.list"
            onRetry={() => void load(false)}
          />
        </div>
      )}
      {loading ? (
        <div aria-busy="true" aria-label="Carregando sessões" className="mt-8 animate-pulse">
          <div className="h-24 rounded-2xl semantic-skeleton" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed semantic-border semantic-surface p-10 text-center">
          <h2 className="text-xl font-semibold">Nenhuma sessão encontrada</h2>
          <p className="mt-2 semantic-text-secondary">Planeje a próxima sessão para começar.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4" data-testid="session-list">
          {items.map((item) => (
            <li
              className="rounded-2xl border semantic-border semantic-surface p-5 shadow-sm"
              key={item.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold semantic-accent-text">
                    Sessão {item.sequenceNumber} · {statusLabel(item.status)}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm semantic-text-secondary">
                    {formatDate(item.playedAt)}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={() => void beginEdit(item)}
                  aria-label={`Editar ${item.title}`}
                >
                  Abrir sessão
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor === null || loading ? null : (
        <Button className="mt-5" onClick={() => void load(true)}>
          Carregar mais sessões
        </Button>
      )}
    </section>
  );
}

function SessionEditor({
  campaign,
  entities,
  session,
  busy,
  error,
  pending,
  onBack,
  onSave,
  onTransition,
  onCancelTransition,
  onConfirmTransition,
  onReplace,
  onBusyChange,
}: {
  campaign: Campaign;
  entities: Entity[];
  session: Session | null;
  busy: boolean;
  error: UserFacingError | null;
  pending: PendingTransition | null;
  onBack: () => void;
  onSave: (input: CreateSessionInput) => Promise<void>;
  onTransition: (value: PendingTransition) => void;
  onCancelTransition: () => void;
  onConfirmTransition: () => Promise<void>;
  onReplace: (session: Session) => void;
  onBusyChange: (busy: boolean) => void;
}): React.JSX.Element {
  const [title, setTitle] = useState(session?.title ?? '');
  const [sequence, setSequence] = useState(String(session?.sequenceNumber ?? ''));
  const [playedAt, setPlayedAt] = useState(dateValue(session?.playedAt ?? null));
  const [summary, setSummary] = useState(session?.summaryMarkdown ?? '');
  const [notes, setNotes] = useState(session?.gmNotesMarkdown ?? '');
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [intentions, setIntentions] = useState<SessionIntention[]>([]);
  const [intentionCursor, setIntentionCursor] = useState<string | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantError, setParticipantError] = useState<SessionOperationFailure | null>(null);
  const [intentionsLoading, setIntentionsLoading] = useState(false);
  const [intentionText, setIntentionText] = useState('');
  const [intentionEntityId, setIntentionEntityId] = useState('');
  const [editingIntention, setEditingIntention] = useState<SessionIntention | null>(null);
  const [intentionError, setIntentionError] = useState<string | null>(null);
  const [intentionOperationError, setIntentionOperationError] =
    useState<SessionOperationFailure | null>(null);
  const loadParticipants = useCallback(async () => {
    if (session === null) return;
    setParticipantsLoading(true);
    setParticipantError(null);
    try {
      const result = await window.campaignManager.sessionParticipants.list({
        campaignId: campaign.id,
        sessionId: session.id,
      });
      if (result.ok) {
        setParticipants(
          result.data.map(({ entityId, role, attended }, index) => ({
            entityId,
            role,
            attended,
            id: `participant-${String(index)}-${entityId}`,
          })),
        );
        setParticipantError(null);
      } else
        setParticipantError({
          error: presentUserFacingError(result.error, 'sessions.list'),
          operation: 'sessions.list',
        });
    } catch {
      setParticipantError({
        error: presentUserFacingError(undefined, 'sessions.list'),
        operation: 'sessions.list',
      });
    } finally {
      setParticipantsLoading(false);
    }
  }, [campaign.id, session]);
  const loadIntentions = useCallback(
    async (append = false, nextCursor?: string) => {
      if (session === null) return;
      setIntentionsLoading(true);
      setIntentionOperationError(null);
      try {
        const result = await window.campaignManager.sessionIntentions.list({
          campaignId: campaign.id,
          sessionId: session.id,
          limit: 50,
          filters: {},
          ...(append && nextCursor !== undefined ? { cursor: nextCursor } : {}),
        });
        if (result.ok) {
          setIntentions((current) =>
            append ? mergeIntentions(current, result.data.items) : result.data.items,
          );
          setIntentionCursor(result.data.nextCursor);
        } else
          setIntentionOperationError({
            error: presentUserFacingError(result.error, 'sessions.list'),
            operation: 'sessions.list',
          });
      } catch {
        setIntentionOperationError({
          error: presentUserFacingError(undefined, 'sessions.list'),
          operation: 'sessions.list',
        });
      } finally {
        setIntentionsLoading(false);
      }
    },
    [campaign.id, session],
  );
  useEffect(() => {
    setIntentions([]);
    setIntentionCursor(null);
    void loadIntentions();
  }, [loadIntentions]);
  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);
  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    const number = Number(sequence);
    if (!Number.isInteger(number) || number < 1) {
      setIntentionError('A sequência deve ser um número positivo.');
      return;
    }
    const input = {
      campaignId: campaign.id,
      sequenceNumber: number,
      title,
      playedAt: playedAt === '' ? null : new Date(`${playedAt}T00:00:00.000Z`).toISOString(),
      summaryMarkdown: nullable(summary),
      gmNotesMarkdown: nullable(notes),
    };
    if (session !== null && Object.keys(sessionPatch(input, session)).length === 0) {
      setIntentionError('Altere ao menos um campo antes de salvar.');
      return;
    }
    void onSave(input);
  }
  async function replaceParticipants(): Promise<void> {
    if (session === null) return;
    onBusyChange(true);
    setParticipantError(null);
    try {
      const result = await window.campaignManager.sessionParticipants.replace({
        campaignId: campaign.id,
        sessionId: session.id,
        revision: session.revision,
        participants: participants.map((item) => ({
          entityId: item.entityId,
          role: item.role,
          attended: item.attended,
        })),
      });
      if (result.ok) onReplace({ ...session, revision: session.revision + 1 });
      else
        setParticipantError({
          error: presentUserFacingError(result.error, 'sessions.mutate'),
          operation: 'sessions.mutate',
        });
    } catch {
      setParticipantError({
        error: presentUserFacingError(undefined, 'sessions.mutate'),
        operation: 'sessions.mutate',
      });
    } finally {
      onBusyChange(false);
    }
  }
  async function saveIntention(): Promise<void> {
    if (session === null || intentionText.trim() === '') return;
    onBusyChange(true);
    setIntentionOperationError(null);
    try {
      const result =
        editingIntention === null
          ? await window.campaignManager.sessionIntentions.create({
              campaignId: campaign.id,
              sessionId: session.id,
              entityId: intentionEntityId === '' ? null : intentionEntityId,
              text: intentionText,
            })
          : await window.campaignManager.sessionIntentions.update({
              campaignId: campaign.id,
              sessionId: session.id,
              id: editingIntention.id,
              revision: editingIntention.revision,
              patch: {
                text: intentionText,
                entityId: intentionEntityId === '' ? null : intentionEntityId,
              },
            });
      if (result.ok) {
        setIntentionText('');
        setIntentionEntityId('');
        setEditingIntention(null);
        await loadIntentions();
      } else
        setIntentionOperationError({
          error: presentUserFacingError(result.error, 'sessions.mutate'),
          operation: 'sessions.mutate',
        });
    } catch {
      setIntentionOperationError({
        error: presentUserFacingError(undefined, 'sessions.mutate'),
        operation: 'sessions.mutate',
      });
    } finally {
      onBusyChange(false);
    }
  }
  async function setIntentionStatus(
    item: SessionIntention,
    status: Exclude<SessionIntention['status'], 'open'>,
  ): Promise<void> {
    if (session === null) return;
    onBusyChange(true);
    setIntentionOperationError(null);
    try {
      const result = await window.campaignManager.sessionIntentions.update({
        campaignId: campaign.id,
        sessionId: session.id,
        id: item.id,
        revision: item.revision,
        patch: { status },
      });
      if (result.ok) await loadIntentions();
      else
        setIntentionOperationError({
          error: presentUserFacingError(result.error, 'sessions.mutate'),
          operation: 'sessions.mutate',
        });
    } catch {
      setIntentionOperationError({
        error: presentUserFacingError(undefined, 'sessions.mutate'),
        operation: 'sessions.mutate',
      });
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <section aria-labelledby="session-form-title" className="mx-auto max-w-5xl">
      <Button disabled={busy} onClick={onBack} size="small" variant="ghost">
        ← Voltar para sessões
      </Button>
      <header className="mt-6 border-b semantic-border pb-6">
        <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
          {campaign.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold" id="session-form-title">
          {session === null ? 'Planejar sessão' : `Sessão ${String(session.sequenceNumber)}`}
        </h1>
      </header>
      <form
        className="mt-6 space-y-5 rounded-2xl border semantic-border semantic-surface p-6"
        onSubmit={submit}
      >
        <div className="grid gap-5 md:grid-cols-[10rem_1fr_12rem]">
          <Field
            id="session-sequence"
            label="Sequência *"
            value={sequence}
            onChange={setSequence}
            type="number"
            disabled={busy || session !== null}
            min="1"
          />
          <Field
            id="session-title"
            label="Título *"
            value={title}
            onChange={setTitle}
            disabled={busy}
            autoFocus
          />
          <Field
            id="session-date"
            label="Data da sessão"
            value={playedAt}
            onChange={setPlayedAt}
            type="date"
            disabled={busy}
          />
        </div>
        <TextArea
          id="session-summary"
          label="Resumo manual (Markdown)"
          value={summary}
          onChange={setSummary}
          disabled={busy}
        />
        <TextArea
          id="session-notes"
          label="Notas do mestre (Markdown)"
          value={notes}
          onChange={setNotes}
          disabled={busy}
        />
        {error === null ? null : (
          <UserFacingErrorNotice error={error} operation="sessions.mutate" />
        )}
        {intentionError === null ? null : (
          <p role="alert" className="rounded-xl semantic-danger-surface p-4 semantic-error-text">
            {intentionError}
          </p>
        )}
        {pending === null ? null : (
          <div
            role="alert"
            className="rounded-xl border semantic-warning-border semantic-warning-surface p-4"
          >
            <p>Confirmar: {transitionLabel(pending.status)} esta sessão?</p>
            <DialogActions className="mt-3">
              <Button disabled={busy} onClick={onCancelTransition}>
                Cancelar
              </Button>
              <Button busy={busy} onClick={() => void onConfirmTransition()} variant="primary">
                Confirmar {transitionLabel(pending.status).toLowerCase()}
              </Button>
            </DialogActions>
          </div>
        )}
        <FormActions layout="between">
          {session === null ? null : (
            <ButtonGroup aria-label="Ações de ciclo de vida da sessão">
              <LifecycleButtons session={session} busy={busy} onTransition={onTransition} />
            </ButtonGroup>
          )}
          <Button busy={busy} type="submit" variant="primary">
            {busy ? 'Salvando…' : session === null ? 'Planejar sessão' : 'Salvar sessão'}
          </Button>
        </FormActions>
      </form>
      {session === null ? null : (
        <>
          <ParticipantEditor
            entities={entities}
            participants={participants}
            setParticipants={setParticipants}
            busy={busy}
            loading={participantsLoading}
            error={participantError?.error ?? null}
            operation={participantError?.operation ?? 'sessions.list'}
            onSave={() => void replaceParticipants()}
            onRetry={() => void loadParticipants()}
          />
          <IntentionEditor
            entities={entities}
            items={intentions}
            cursor={intentionCursor}
            text={intentionText}
            entityId={intentionEntityId}
            editing={editingIntention}
            busy={busy}
            loading={intentionsLoading}
            error={intentionOperationError?.error ?? null}
            operation={intentionOperationError?.operation ?? 'sessions.list'}
            onText={setIntentionText}
            onEntity={setIntentionEntityId}
            onSave={() => void saveIntention()}
            onEdit={(item) => {
              setEditingIntention(item);
              setIntentionText(item.text);
              setIntentionEntityId(item.entityId ?? '');
            }}
            onCancelEdit={() => {
              setEditingIntention(null);
              setIntentionText('');
              setIntentionEntityId('');
            }}
            onStatus={(item, status) => void setIntentionStatus(item, status)}
            onLoadMore={() => {
              if (intentionCursor !== null) void loadIntentions(true, intentionCursor);
            }}
            onRetry={() => void loadIntentions()}
          />
        </>
      )}
    </section>
  );
}

function ParticipantEditor({
  entities,
  participants,
  setParticipants,
  busy,
  loading,
  error,
  operation,
  onSave,
  onRetry,
}: {
  entities: Entity[];
  participants: ParticipantDraft[];
  setParticipants: React.Dispatch<React.SetStateAction<ParticipantDraft[]>>;
  busy: boolean;
  loading: boolean;
  error: UserFacingError | null;
  operation: SessionOperation;
  onSave: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!retrying || loading) return;
    if (error === null) titleRef.current?.focus();
    else retryButtonRef.current?.focus();
    setRetrying(false);
  }, [error, loading, retrying]);

  function retry(): void {
    setRetrying(true);
    onRetry();
  }

  const add = () =>
    setParticipants((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        entityId: '',
        role: 'player_character',
        attended: true,
      },
    ]);
  const update = (id: string, patch: Partial<ParticipantDraft>) =>
    setParticipants((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  return (
    <section
      className="mt-6 rounded-2xl border semantic-border semantic-surface p-6"
      aria-labelledby="participants-title"
    >
      <h2 className="text-xl font-semibold" id="participants-title" ref={titleRef} tabIndex={-1}>
        Participantes
      </h2>
      {error === null ? null : (
        <div className="mt-4">
          <UserFacingErrorNotice
            compact
            error={error}
            operation={operation}
            onRetry={retry}
            retryButtonRef={retryButtonRef}
            retryDisabled={busy || loading}
          />
        </div>
      )}
      <p className="mt-1 text-sm semantic-text-secondary">
        Salvar substitui integralmente a lista de participantes desta sessão.
      </p>
      {loading ? (
        <p className="mt-4 text-sm semantic-text-secondary">Carregando participantes…</p>
      ) : null}
      <ReorderableList
        ariaLabel="Ordenar participantes"
        busy={busy || loading}
        className="mt-4 grid gap-3"
        getLabel={(item) =>
          entities.find((entity) => entity.id === item.entityId)?.name ??
          'Participante sem entidade'
        }
        items={participants}
        onMove={(move) => setParticipants((current) => moveRelative(current, move))}
        renderItem={(item) => (
          <div className="grid gap-3 rounded-xl semantic-surface-muted p-3 md:grid-cols-[1fr_11rem_8rem_auto]">
            <label className="text-sm font-semibold">
              Entidade
              <select
                aria-label="Entidade participante"
                className={inputClass}
                value={item.entityId}
                required
                onChange={(e) => update(item.id, { entityId: e.target.value })}
                disabled={busy}
              >
                <option value="">Selecione…</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Papel
              <select
                className={inputClass}
                value={item.role}
                onChange={(e) =>
                  update(item.id, { role: e.target.value as SessionParticipantInput['role'] })
                }
                disabled={busy}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Presença
              <select
                className={inputClass}
                value={String(item.attended)}
                onChange={(e) => update(item.id, { attended: e.target.value === 'true' })}
                disabled={busy}
              >
                <option value="true">Presente</option>
                <option value="false">Ausente</option>
              </select>
            </label>
            <Button
              disabled={busy}
              onClick={() =>
                setParticipants((current) => current.filter((entry) => entry.id !== item.id))
              }
            >
              Remover
            </Button>
          </div>
        )}
      />
      {!loading && participants.length === 0 ? (
        <p className="mt-4 text-sm semantic-text-secondary">Nenhum participante registrado.</p>
      ) : null}
      <ButtonGroup aria-label="Ações dos participantes" className="mt-4">
        <Button disabled={busy || entities.length === 0} onClick={add}>
          Adicionar participante
        </Button>
        <Button
          busy={busy}
          disabled={busy || participants.some((item) => item.entityId === '')}
          onClick={onSave}
          variant="primary"
        >
          Salvar participantes
        </Button>
        <Button disabled={busy || loading} onClick={retry}>
          Atualizar participantes
        </Button>
      </ButtonGroup>
    </section>
  );
}

function IntentionEditor({
  entities,
  items,
  cursor,
  text,
  entityId,
  editing,
  busy,
  loading,
  error,
  operation,
  onText,
  onEntity,
  onSave,
  onEdit,
  onCancelEdit,
  onStatus,
  onLoadMore,
  onRetry,
}: {
  entities: Entity[];
  items: SessionIntention[];
  cursor: string | null;
  text: string;
  entityId: string;
  editing: SessionIntention | null;
  busy: boolean;
  loading: boolean;
  error: UserFacingError | null;
  operation: SessionOperation;
  onText: (value: string) => void;
  onEntity: (value: string) => void;
  onSave: () => void;
  onEdit: (item: SessionIntention) => void;
  onCancelEdit: () => void;
  onStatus: (item: SessionIntention, status: Exclude<SessionIntention['status'], 'open'>) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!retrying || loading) return;
    if (error === null) titleRef.current?.focus();
    else retryButtonRef.current?.focus();
    setRetrying(false);
  }, [error, loading, retrying]);

  function retry(): void {
    setRetrying(true);
    onRetry();
  }

  return (
    <section
      className="mt-6 rounded-2xl border semantic-border semantic-surface p-6"
      aria-labelledby="intentions-title"
    >
      <h2 className="text-xl font-semibold" id="intentions-title" ref={titleRef} tabIndex={-1}>
        Intenções
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_15rem_auto]">
        <label className="text-sm font-semibold">
          Intenção
          <textarea
            className={inputClass}
            maxLength={10000}
            value={text}
            onChange={(e) => onText(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="text-sm font-semibold">
          Entidade relacionada (opcional)
          <select
            className={inputClass}
            value={entityId}
            onChange={(e) => onEntity(e.target.value)}
            disabled={busy}
          >
            <option value="">Nenhuma</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <ButtonGroup aria-label="Ações da intenção" className="self-end">
          {editing === null ? null : (
            <Button disabled={busy} onClick={onCancelEdit}>
              Cancelar edição
            </Button>
          )}
          <Button busy={busy} disabled={text.trim() === ''} onClick={onSave} variant="primary">
            {editing === null ? 'Registrar intenção' : 'Salvar intenção'}
          </Button>
        </ButtonGroup>
      </div>
      {error === null ? null : (
        <div className="mt-4">
          <UserFacingErrorNotice
            compact
            error={error}
            operation={operation}
            onRetry={retry}
            retryButtonRef={retryButtonRef}
            retryDisabled={busy || loading}
          />
        </div>
      )}
      <div aria-busy={loading}>
        {loading ? (
          <p className="mt-5 text-sm semantic-text-secondary">Carregando intenções…</p>
        ) : null}
        <ul className="mt-5 grid gap-3" aria-label="Lista de intenções">
          {items.map((item) => (
            <li className="rounded-xl semantic-surface-muted p-4" key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.text}</p>
                  <p className="mt-1 text-sm semantic-text-secondary">
                    {intentionStatusLabel(item.status)}
                  </p>
                </div>
                <ToolbarActions aria-label={`Ações da intenção ${item.text}`} className="gap-2">
                  <Button disabled={busy} onClick={() => onEdit(item)}>
                    Editar intenção
                  </Button>
                  {item.status === 'open'
                    ? (['completed', 'abandoned', 'transformed'] as const).map((status) => (
                        <Button disabled={busy} key={status} onClick={() => onStatus(item, status)}>
                          {intentionActionLabel(status)}
                        </Button>
                      ))
                    : null}
                </ToolbarActions>
              </div>
            </li>
          ))}
        </ul>
        {cursor === null || loading ? null : (
          <Button busy={loading} className="mt-4" disabled={busy} onClick={onLoadMore}>
            Carregar mais intenções
          </Button>
        )}
        {!loading && items.length === 0 ? (
          <p className="mt-4 text-sm semantic-text-secondary">Nenhuma intenção registrada.</p>
        ) : null}
      </div>
    </section>
  );
}

function LifecycleButtons({
  session,
  busy,
  onTransition,
}: {
  session: Session;
  busy: boolean;
  onTransition: (value: PendingTransition) => void;
}): React.JSX.Element {
  if (session.status === 'planned')
    return (
      <>
        <Button disabled={busy} onClick={() => onTransition({ session, status: 'in_progress' })}>
          Iniciar sessão
        </Button>
        <Button disabled={busy} onClick={() => onTransition({ session, status: 'cancelled' })}>
          Cancelar sessão
        </Button>
      </>
    );
  if (session.status === 'in_progress')
    return (
      <>
        <Button disabled={busy} onClick={() => onTransition({ session, status: 'completed' })}>
          Concluir sessão
        </Button>
        <Button disabled={busy} onClick={() => onTransition({ session, status: 'cancelled' })}>
          Cancelar sessão
        </Button>
      </>
    );
  return (
    <span className="text-sm font-semibold semantic-text-secondary">
      Status final: {statusLabel(session.status)}
    </span>
  );
}
function StatusFilter({
  value,
  onChange,
}: {
  value: SessionStatus | '';
  onChange: (value: SessionStatus | '') => void;
}): React.JSX.Element {
  return (
    <>
      {(
        [
          { value: '', label: 'Todas' },
          { value: 'planned', label: 'Planejadas' },
          { value: 'in_progress', label: 'Em andamento' },
          { value: 'completed', label: 'Concluídas' },
          { value: 'cancelled', label: 'Canceladas' },
        ] as const
      ).map((option) => (
        <Button
          aria-pressed={value === option.value}
          key={option.value || 'all'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </>
  );
}
function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
  autoFocus?: boolean;
  min?: string;
}): React.JSX.Element {
  return (
    <label className="text-sm font-semibold" htmlFor={id}>
      {label}
      <input
        id={id}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        type={type}
        {...rest}
      />
    </label>
  );
}
function TextArea({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <label className="block text-sm font-semibold" htmlFor={id}>
      {label}
      <textarea
        id={id}
        className={`${inputClass} min-h-28 resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={100000}
      />
    </label>
  );
}
function sessionPatch(input: CreateSessionInput, session: Session) {
  const patch: {
    title?: string;
    playedAt?: string | null;
    summaryMarkdown?: string | null;
    gmNotesMarkdown?: string | null;
  } = {};
  if (input.title.trim() !== session.title) patch.title = input.title;
  if (input.playedAt !== session.playedAt) patch.playedAt = input.playedAt;
  if (input.summaryMarkdown !== session.summaryMarkdown)
    patch.summaryMarkdown = input.summaryMarkdown;
  if (input.gmNotesMarkdown !== session.gmNotesMarkdown)
    patch.gmNotesMarkdown = input.gmNotesMarkdown;
  return patch;
}
function nullable(value: string): string | null {
  return value === '' ? null : value;
}
function dateValue(value: string | null): string {
  return value === null ? '' : value.slice(0, 10);
}
function formatDate(value: string | null): string {
  return value === null
    ? 'Data não informada'
    : new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
        year: 'numeric',
      }).format(new Date(value));
}

function mergeIntentions(
  current: SessionIntention[],
  next: SessionIntention[],
): SessionIntention[] {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !known.has(item.id))];
}
function statusLabel(value: SessionStatus): string {
  return {
    planned: 'Planejada',
    in_progress: 'Em andamento',
    completed: 'Concluída',
    cancelled: 'Cancelada',
  }[value];
}
function transitionLabel(value: PendingTransition['status']): string {
  return { in_progress: 'início', completed: 'conclusão', cancelled: 'cancelamento' }[value];
}
function intentionStatusLabel(value: SessionIntention['status']): string {
  return {
    open: 'Aberta',
    completed: 'Concluída',
    abandoned: 'Abandonada',
    transformed: 'Transformada',
  }[value];
}
function intentionActionLabel(value: Exclude<SessionIntention['status'], 'open'>): string {
  return { completed: 'Concluir', abandoned: 'Abandonar', transformed: 'Transformar' }[value];
}
async function loadAllEntities(campaignId: string): Promise<Entity[]> {
  const items: Entity[] = [];
  let cursor: string | undefined;
  do {
    const result = await window.campaignManager.entities.list({
      campaignId,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
      filters: { archived: false },
    });
    if (!result.ok) {
      throw Object.assign(new Error(result.error.message, { cause: result.error }), result.error);
    }
    items.push(...result.data.items);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}
