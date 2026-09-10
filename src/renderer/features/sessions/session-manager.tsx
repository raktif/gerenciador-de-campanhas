import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type {
  CreateSessionInput,
  Session,
  SessionIntention,
  SessionParticipantInput,
} from '../../../core/contracts/sessions';
import { inputClass, primaryClass, secondaryClass } from '../narrative/narrative-metadata-fields';

type View = 'list' | 'create' | 'edit';
type SessionStatus = Session['status'];
interface PendingTransition {
  session: Session;
  status: Extract<SessionStatus, 'in_progress' | 'completed' | 'cancelled'>;
}
interface ParticipantDraft extends SessionParticipantInput {
  key: number;
}

const errorMessage = 'Não foi possível concluir a operação. Revise os dados e tente novamente.';
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
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTransition | null>(null);

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
        } else setError(result.error.message);
      } catch {
        setError(errorMessage);
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
      .catch(() => setError(errorMessage));
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
      } else setError(result.error.message);
    } catch {
      setError(errorMessage);
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
      } else setError(result.error.message);
    } catch {
      setError(errorMessage);
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
      } else setError(result.error.message);
    } catch {
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }
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
      <button className={secondaryClass} onClick={onBack} type="button">
        ← Voltar para detalhes da campanha
      </button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="sessions-title">
            Sessões
          </h1>
          <p className="mt-2 text-slate-600">Planeje e acompanhe o ciclo de vida de cada sessão.</p>
        </div>
        <button
          className={primaryClass}
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setView('create');
          }}
          type="button"
        >
          Planejar sessão
        </button>
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
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">
          <p>{error}</p>
          <button
            className={`${secondaryClass} mt-3`}
            disabled={loading}
            onClick={() => void load(false)}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <div aria-busy="true" aria-label="Carregando sessões" className="mt-8 animate-pulse">
          <div className="h-24 rounded-2xl bg-stone-200" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <h2 className="text-xl font-semibold">Nenhuma sessão encontrada</h2>
          <p className="mt-2 text-slate-600">Planeje a próxima sessão para começar.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4" data-testid="session-list">
          {items.map((item) => (
            <li
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
              key={item.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Sessão {item.sequenceNumber} · {statusLabel(item.status)}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">{formatDate(item.playedAt)}</p>
                </div>
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => void beginEdit(item)}
                  type="button"
                  aria-label={`Editar ${item.title}`}
                >
                  Abrir sessão
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor === null || loading ? null : (
        <button className={`${secondaryClass} mt-5`} onClick={() => void load(true)} type="button">
          Carregar mais sessões
        </button>
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
  error: string | null;
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
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [intentionsLoading, setIntentionsLoading] = useState(false);
  const [intentionText, setIntentionText] = useState('');
  const [intentionEntityId, setIntentionEntityId] = useState('');
  const [editingIntention, setEditingIntention] = useState<SessionIntention | null>(null);
  const [intentionError, setIntentionError] = useState<string | null>(null);
  const loadParticipants = useCallback(async () => {
    if (session === null) return;
    setParticipantsLoading(true);
    setParticipantError(null);
    try {
      const result = await window.campaignManager.sessionParticipants.list({
        campaignId: campaign.id,
        sessionId: session.id,
      });
      if (result.ok) setParticipants(result.data.map((item, index) => ({ ...item, key: index })));
      else setParticipantError(result.error.message);
    } catch {
      setParticipantError(errorMessage);
    } finally {
      setParticipantsLoading(false);
    }
  }, [campaign.id, session]);
  const loadIntentions = useCallback(
    async (append = false, nextCursor?: string) => {
      if (session === null) return;
      setIntentionsLoading(true);
      setIntentionError(null);
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
        } else setIntentionError(result.error.message);
      } catch {
        setIntentionError(errorMessage);
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
          sortOrder: item.sortOrder,
        })),
      });
      if (result.ok) onReplace({ ...session, revision: session.revision + 1 });
      else setParticipantError(result.error.message);
    } catch {
      setParticipantError(errorMessage);
    } finally {
      onBusyChange(false);
    }
  }
  async function saveIntention(): Promise<void> {
    if (session === null || intentionText.trim() === '') return;
    onBusyChange(true);
    setIntentionError(null);
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
      } else setIntentionError(result.error.message);
    } catch {
      setIntentionError(errorMessage);
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
    setIntentionError(null);
    try {
      const result = await window.campaignManager.sessionIntentions.update({
        campaignId: campaign.id,
        sessionId: session.id,
        id: item.id,
        revision: item.revision,
        patch: { status },
      });
      if (result.ok) await loadIntentions();
      else setIntentionError(result.error.message);
    } catch {
      setIntentionError(errorMessage);
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <section aria-labelledby="session-form-title" className="mx-auto max-w-5xl">
      <button className={secondaryClass} disabled={busy} onClick={onBack} type="button">
        ← Voltar para sessões
      </button>
      <header className="mt-6 border-b border-stone-200 pb-6">
        <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
          {campaign.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold" id="session-form-title">
          {session === null ? 'Planejar sessão' : `Sessão ${String(session.sequenceNumber)}`}
        </h1>
      </header>
      <form
        className="mt-6 space-y-5 rounded-2xl border border-stone-200 bg-white p-6"
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
        {error === null && intentionError === null ? null : (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
            {error ?? intentionError}
          </p>
        )}
        {pending === null ? null : (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p>Confirmar: {transitionLabel(pending.status)} esta sessão?</p>
            <div className="mt-3 flex gap-3">
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={onCancelTransition}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={primaryClass}
                disabled={busy}
                onClick={() => void onConfirmTransition()}
                type="button"
              >
                Confirmar {transitionLabel(pending.status).toLowerCase()}
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">
            {session === null ? null : (
              <LifecycleButtons session={session} busy={busy} onTransition={onTransition} />
            )}
          </div>
          <button className={primaryClass} disabled={busy} type="submit">
            {busy ? 'Salvando…' : session === null ? 'Planejar sessão' : 'Salvar sessão'}
          </button>
        </div>
      </form>
      {session === null ? null : (
        <>
          <ParticipantEditor
            entities={entities}
            participants={participants}
            setParticipants={setParticipants}
            busy={busy}
            loading={participantsLoading}
            error={participantError}
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
            error={intentionError}
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
  onSave,
  onRetry,
}: {
  entities: Entity[];
  participants: ParticipantDraft[];
  setParticipants: React.Dispatch<React.SetStateAction<ParticipantDraft[]>>;
  busy: boolean;
  loading: boolean;
  error: string | null;
  onSave: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const add = () =>
    setParticipants((current) => [
      ...current,
      {
        key: Date.now(),
        entityId: '',
        role: 'player_character',
        attended: true,
        sortOrder: current.length,
      },
    ]);
  const update = (key: number, patch: Partial<ParticipantDraft>) =>
    setParticipants((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  return (
    <section
      className="mt-6 rounded-2xl border border-stone-200 bg-white p-6"
      aria-labelledby="participants-title"
    >
      <h2 className="text-xl font-semibold" id="participants-title">
        Participantes
      </h2>
      {error === null ? null : (
        <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">
          <p>{error}</p>
          <button
            className={`${secondaryClass} mt-3`}
            disabled={busy || loading}
            onClick={onRetry}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}
      <p className="mt-1 text-sm text-slate-600">
        Salvar substitui integralmente a lista de participantes desta sessão.
      </p>
      <div aria-busy={loading} className="mt-4 grid gap-3">
        {loading ? <p className="text-sm text-slate-600">Carregando participantes…</p> : null}
        {participants.map((item) => (
          <div
            className="grid gap-3 rounded-xl bg-stone-50 p-3 md:grid-cols-[1fr_11rem_8rem_6rem_auto]"
            key={item.key}
          >
            <label className="text-sm font-semibold">
              Entidade
              <select
                aria-label="Entidade participante"
                className={inputClass}
                value={item.entityId}
                required
                onChange={(e) => update(item.key, { entityId: e.target.value })}
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
                  update(item.key, { role: e.target.value as SessionParticipantInput['role'] })
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
                onChange={(e) => update(item.key, { attended: e.target.value === 'true' })}
                disabled={busy}
              >
                <option value="true">Presente</option>
                <option value="false">Ausente</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Ordem
              <input
                className={inputClass}
                type="number"
                min="0"
                value={item.sortOrder}
                onChange={(e) => update(item.key, { sortOrder: Number(e.target.value) })}
                disabled={busy}
              />
            </label>
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() =>
                setParticipants((current) => current.filter((entry) => entry.key !== item.key))
              }
              type="button"
            >
              Remover
            </button>
          </div>
        ))}
      </div>
      {!loading && participants.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">Nenhum participante registrado.</p>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button
          className={secondaryClass}
          disabled={busy || entities.length === 0}
          onClick={add}
          type="button"
        >
          Adicionar participante
        </button>
        <button
          className={primaryClass}
          disabled={busy || participants.some((item) => item.entityId === '')}
          onClick={onSave}
          type="button"
        >
          Salvar participantes
        </button>
        <button
          className={secondaryClass}
          disabled={busy || loading}
          onClick={onRetry}
          type="button"
        >
          Atualizar participantes
        </button>
      </div>
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
  error: string | null;
  onText: (value: string) => void;
  onEntity: (value: string) => void;
  onSave: () => void;
  onEdit: (item: SessionIntention) => void;
  onCancelEdit: () => void;
  onStatus: (item: SessionIntention, status: Exclude<SessionIntention['status'], 'open'>) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <section
      className="mt-6 rounded-2xl border border-stone-200 bg-white p-6"
      aria-labelledby="intentions-title"
    >
      <h2 className="text-xl font-semibold" id="intentions-title">
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
        <div className="flex self-end gap-2">
          {editing === null ? null : (
            <button className={secondaryClass} disabled={busy} onClick={onCancelEdit} type="button">
              Cancelar edição
            </button>
          )}
          <button
            className={primaryClass}
            disabled={busy || text.trim() === ''}
            onClick={onSave}
            type="button"
          >
            {editing === null ? 'Registrar intenção' : 'Salvar intenção'}
          </button>
        </div>
      </div>
      {error === null ? null : (
        <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">
          <p>{error}</p>
          <button
            className={`${secondaryClass} mt-3`}
            disabled={busy || loading}
            onClick={onRetry}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}
      <div aria-busy={loading}>
        {loading ? <p className="mt-5 text-sm text-slate-600">Carregando intenções…</p> : null}
        <ul className="mt-5 grid gap-3" aria-label="Lista de intenções">
          {items.map((item) => (
            <li className="rounded-xl bg-stone-50 p-4" key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.text}</p>
                  <p className="mt-1 text-sm text-slate-600">{intentionStatusLabel(item.status)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => onEdit(item)}
                    type="button"
                  >
                    Editar intenção
                  </button>
                  {item.status === 'open'
                    ? (['completed', 'abandoned', 'transformed'] as const).map((status) => (
                        <button
                          className={secondaryClass}
                          disabled={busy}
                          key={status}
                          onClick={() => onStatus(item, status)}
                          type="button"
                        >
                          {intentionActionLabel(status)}
                        </button>
                      ))
                    : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {cursor === null || loading ? null : (
          <button
            className={`${secondaryClass} mt-4`}
            disabled={busy || loading}
            onClick={onLoadMore}
            type="button"
          >
            Carregar mais intenções
          </button>
        )}
        {!loading && items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">Nenhuma intenção registrada.</p>
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
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => onTransition({ session, status: 'in_progress' })}
          type="button"
        >
          Iniciar sessão
        </button>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => onTransition({ session, status: 'cancelled' })}
          type="button"
        >
          Cancelar sessão
        </button>
      </>
    );
  if (session.status === 'in_progress')
    return (
      <>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => onTransition({ session, status: 'completed' })}
          type="button"
        >
          Concluir sessão
        </button>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => onTransition({ session, status: 'cancelled' })}
          type="button"
        >
          Cancelar sessão
        </button>
      </>
    );
  return (
    <span className="text-sm font-semibold text-slate-500">
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
        <button
          className={secondaryClass}
          aria-pressed={value === option.value}
          key={option.value || 'all'}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
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
    if (!result.ok) throw new Error(result.error.message);
    items.push(...result.data.items);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}
