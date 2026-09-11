import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type {
  CreateEventInput,
  Event,
  EventDetails,
  EventEntityLinkInput,
} from '../../../core/contracts/events';
import type { Session } from '../../../core/contracts/sessions';
import {
  NarrativeMetadataFields,
  canonLabel,
  inputClass,
  knowledgeLabel,
  primaryClass,
  secondaryClass,
  visibilityLabel,
  type NarrativeMetadataValues,
} from '../narrative/narrative-metadata-fields';
import {
  activeEntities,
  eventPatch,
  linksChanged,
  validateEventInput,
} from './event-manager-model';

type View = 'list' | 'create' | 'edit';
interface PendingLifecycle {
  event: Event;
  restore: boolean;
}

const gatewayError =
  'N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o. Revise os dados e tente novamente.';
const eventRoleLabels: Record<EventEntityLinkInput['role'], string> = {
  participant: 'Participante',
  location: 'Local',
  cause: 'Causa',
  target: 'Alvo',
  witness: 'Testemunha',
  beneficiary: 'Benefici\u00e1rio',
  victim: 'V\u00edtima',
  related: 'Relacionado',
};

export function EventManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<Event[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<EventDetails | null>(null);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingLifecycle | null>(null);

  const load = useCallback(
    async (append = false): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.campaignManager.events.list({
          campaignId: campaign.id,
          limit: 50,
          ...(append && cursor !== null ? { cursor } : {}),
          filters: { archived },
        });
        if (result.ok) {
          setItems((current) => (append ? [...current, ...result.data.items] : result.data.items));
          setCursor(result.data.nextCursor);
        } else setError(result.error.message);
      } catch {
        setError(gatewayError);
      } finally {
        setLoading(false);
      }
    },
    [archived, campaign.id, cursor],
  );

  const loadReferences = useCallback(async (): Promise<void> => {
    try {
      const [loadedSessions, loadedEntities] = await Promise.all([
        loadAllSessions(campaign.id),
        loadAllActiveEntities(campaign.id),
      ]);
      setSessions(loadedSessions);
      setEntities(loadedEntities);
    } catch {
      setError(gatewayError);
    }
  }, [campaign.id]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [archived, campaign.id]);
  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  async function beginEdit(item: Event): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.events.get({
        campaignId: campaign.id,
        id: item.id,
      });
      if (result.ok) {
        setEditing(result.data);
        setView('edit');
      } else setError(result.error.message);
    } catch {
      setError(gatewayError);
    } finally {
      setBusy(false);
    }
  }

  async function submit(input: CreateEventInput): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        editing === null
          ? await window.campaignManager.events.create(input)
          : await updateEvent(input, editing);
      if (result.ok) {
        setAnnouncement(editing === null ? 'Evento registrado.' : 'Evento atualizado.');
        setEditing(null);
        setView('list');
        await load(false);
      } else setError(result.error.message);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : gatewayError);
    } finally {
      setBusy(false);
    }
  }

  async function updateEvent(input: CreateEventInput, current: EventDetails) {
    const patch = eventPatch(input, current.event);
    const replaceLinks = linksChanged(input.links, current.links);
    if (Object.keys(patch).length === 0 && !replaceLinks)
      throw new Error('Altere ao menos um campo ou v\u00ednculo antes de salvar.');
    return window.campaignManager.events.update({
      campaignId: campaign.id,
      id: current.event.id,
      revision: current.event.revision,
      ...(Object.keys(patch).length === 0 ? {} : { patch }),
      ...(replaceLinks ? { links: input.links } : {}),
    });
  }

  async function lifecycle(): Promise<void> {
    if (pending === null || busy) return;
    setBusy(true);
    setError(null);
    const input = {
      campaignId: campaign.id,
      id: pending.event.id,
      revision: pending.event.revision,
    };
    try {
      const result = pending.restore
        ? await window.campaignManager.events.restore(input)
        : await window.campaignManager.events.archive(input);
      if (result.ok) {
        setAnnouncement(pending.restore ? 'Evento restaurado.' : 'Evento arquivado.');
        setPending(null);
        await load(false);
      } else setError(result.error.message);
    } catch {
      setError(gatewayError);
    } finally {
      setBusy(false);
    }
  }

  if (view !== 'list')
    return (
      <EventEditor
        campaign={campaign}
        details={editing}
        entities={entities}
        sessions={sessions}
        busy={busy}
        error={error}
        onCancel={() => {
          setEditing(null);
          setError(null);
          setView('list');
        }}
        onSubmit={submit}
      />
    );

  return (
    <section aria-labelledby="events-title">
      <button className={secondaryClass} disabled={busy} onClick={onBack} type="button">
        â† Voltar para sessÃµes
      </button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="events-title">
            Eventos
          </h1>
          <p className="mt-2 text-slate-600">
            Registre acontecimentos, a sessÃ£o associada e as entidades envolvidas.
          </p>
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
          Registrar evento
        </button>
      </header>
      <div className="mt-5 flex gap-2" role="group" aria-label="Filtrar eventos por estado">
        <button
          aria-pressed={!archived}
          className={secondaryClass}
          disabled={busy}
          onClick={() => setArchived(false)}
          type="button"
        >
          Ativos
        </button>
        <button
          aria-pressed={archived}
          className={secondaryClass}
          disabled={busy}
          onClick={() => setArchived(true)}
          type="button"
        >
          Arquivados
        </button>
      </div>
      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
          role="status"
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">
          <p>{error}</p>
          <button
            className={`${secondaryClass} mt-3`}
            disabled={busy || loading}
            onClick={() => {
              void load(false);
              void loadReferences();
            }}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {pending === null ? null : (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5" role="alert">
          <p className="font-semibold">
            {pending.restore ? 'Restaurar' : 'Arquivar'} â€œ{pending.event.title}â€?
          </p>
          <p className="mt-1 text-sm">
            {pending.restore
              ? 'Os vÃ­nculos serÃ£o validados novamente antes da restauraÃ§Ã£o.'
              : 'O evento e seus vÃ­nculos permanecerÃ£o preservados.'}
          </p>
          <div className="mt-3 flex gap-3">
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setPending(null)}
              type="button"
            >
              Cancelar aÃ§Ã£o
            </button>
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() => void lifecycle()}
              type="button"
            >
              Confirmar {pending.restore ? 'restauraÃ§Ã£o' : 'arquivamento'}
            </button>
          </div>
        </div>
      )}
      {loading && items.length === 0 ? (
        <p aria-busy="true" aria-live="polite" className="mt-8">
          Carregando eventosâ€¦
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <h2 className="text-xl font-semibold">Nenhum evento encontrado</h2>
          <p className="mt-2 text-slate-600">
            Registre um acontecimento para comeÃ§ar a cronologia.
          </p>
        </div>
      ) : (
        <ul className="mt-7 grid gap-4" data-testid="event-list">
          {items.map((item) => (
            <li className="rounded-2xl border border-stone-200 bg-white p-6" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {sessionLabel(item.sessionId, sessions)} Â· Ordem {item.eventOrder}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{item.title}</h2>
                  {item.occurredAtLabel === null ? null : (
                    <p className="mt-2 text-sm text-slate-600">{item.occurredAtLabel}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge>{canonLabel(item.canonState)}</Badge>
                    <Badge>{knowledgeLabel(item.knowledgeState)}</Badge>
                    <Badge>{visibilityLabel(item.visibility)}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    aria-label={`Editar ${item.title}`}
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => void beginEdit(item)}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => setPending({ event: item, restore: item.archivedAt !== null })}
                    type="button"
                  >
                    {item.archivedAt === null ? 'Arquivar' : 'Restaurar'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor === null ? null : (
        <button
          className={`${secondaryClass} mt-6`}
          disabled={busy || loading}
          onClick={() => void load(true)}
          type="button"
        >
          {loading ? 'Carregandoâ€¦' : 'Carregar mais eventos'}
        </button>
      )}
    </section>
  );
}

function EventEditor({
  campaign,
  details,
  sessions,
  entities,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  campaign: Campaign;
  details: EventDetails | null;
  sessions: Session[];
  entities: Entity[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateEventInput) => Promise<void>;
}): React.JSX.Element {
  const [title, setTitle] = useState(details?.event.title ?? '');
  const [description, setDescription] = useState(details?.event.descriptionMarkdown ?? '');
  const [sessionId, setSessionId] = useState(details?.event.sessionId ?? '');
  const [eventOrder, setEventOrder] = useState(String(details?.event.eventOrder ?? 0));
  const [occurredAtLabel, setOccurredAtLabel] = useState(details?.event.occurredAtLabel ?? '');
  const [links, setLinks] = useState<EventEntityLinkInput[]>(() =>
    details === null
      ? []
      : details.links.map(({ entityId, role, sortOrder }) => ({ entityId, role, sortOrder })),
  );
  const [metadata, setMetadata] = useState<NarrativeMetadataValues>({
    canonState: details?.event.canonState ?? 'accepted',
    knowledgeState: details?.event.knowledgeState ?? 'fact',
    visibility: details?.event.visibility ?? 'gm',
    originKind: details?.event.originKind ?? 'manual',
    sourceId: details?.event.sourceId ?? null,
  });
  const [validation, setValidation] = useState<string | null>(null);
  const availableEntities = useMemo(() => activeEntities(entities), [entities]);
  const availableEntityIds = useMemo(
    () => new Set(availableEntities.map((entity) => entity.id)),
    [availableEntities],
  );

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    const input: CreateEventInput = {
      campaignId: campaign.id,
      sessionId: sessionId === '' ? null : sessionId,
      title: title.trim(),
      descriptionMarkdown: description === '' ? null : description,
      eventOrder: Number(eventOrder),
      occurredAtLabel: occurredAtLabel.trim() === '' ? null : occurredAtLabel.trim(),
      links,
      ...metadata,
    };
    const message = validateEventInput(input, availableEntityIds);
    if (message !== null) {
      setValidation(message);
      return;
    }
    setValidation(null);
    void onSubmit(input);
  }

  function updateLink(index: number, patch: Partial<EventEntityLinkInput>): void {
    setLinks((current) =>
      current.map((link, position) => (position === index ? { ...link, ...patch } : link)),
    );
  }

  return (
    <section className="mx-auto max-w-5xl" aria-labelledby="event-form-title">
      <button className={secondaryClass} disabled={busy} onClick={onCancel} type="button">
        â† Voltar para eventos
      </button>
      <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-8">
        <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
          {campaign.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold" id="event-form-title">
          {details === null ? 'Registrar evento' : `Editar ${details.event.title}`}
        </h1>
        <form className="mt-7 space-y-6" noValidate onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-[1fr_14rem_10rem]">
            <label className="block font-semibold">
              TÃ­tulo *
              <input
                autoFocus
                className={inputClass}
                disabled={busy}
                maxLength={200}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block font-semibold">
              SessÃ£o associada
              <select
                className={inputClass}
                disabled={busy}
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
              >
                <option value="">Nenhuma</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    SessÃ£o {session.sequenceNumber}: {session.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-semibold">
              Ordem *
              <input
                className={inputClass}
                disabled={busy}
                min="0"
                required
                type="number"
                value={eventOrder}
                onChange={(event) => setEventOrder(event.target.value)}
              />
            </label>
          </div>
          <label className="block font-semibold">
            ReferÃªncia temporal
            <input
              className={inputClass}
              disabled={busy}
              maxLength={200}
              value={occurredAtLabel}
              onChange={(event) => setOccurredAtLabel(event.target.value)}
            />
          </label>
          <label className="block font-semibold">
            DescriÃ§Ã£o em Markdown
            <textarea
              className={`${inputClass} min-h-40 resize-y whitespace-pre-wrap`}
              disabled={busy}
              maxLength={100000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <NarrativeMetadataFields disabled={busy} values={metadata} onChange={setMetadata} />
          <fieldset className="rounded-2xl border border-stone-200 p-5">
            <legend className="px-2 font-semibold">VÃ­nculos com entidades</legend>
            <p className="mt-1 text-sm text-slate-600">
              Somente entidades ativas desta campanha podem ser vinculadas.
            </p>
            <div className="mt-4 grid gap-4">
              {links.map((link, index) => {
                const isActiveEntity = availableEntityIds.has(link.entityId);
                return (
                  <div
                    className="grid gap-3 rounded-xl bg-stone-50 p-4 md:grid-cols-[1fr_12rem_7rem_auto]"
                    key={`${String(index)}:${link.entityId}:${link.role}`}
                  >
                    {isActiveEntity ? (
                      <label className="text-sm font-semibold">
                        Entidade
                        <select
                          className={inputClass}
                          disabled={busy}
                          required
                          value={link.entityId}
                          onChange={(event) => updateLink(index, { entityId: event.target.value })}
                        >
                          <option value="">Selecioneâ€¦</option>
                          {availableEntities.map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {entity.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="text-sm font-semibold text-red-800">
                        Entidade indisponÃ­vel
                        <p className="mt-2 font-normal">
                          Esta entidade foi arquivada; remova o vÃ­nculo antes de salvar.
                        </p>
                      </div>
                    )}
                    <label className="text-sm font-semibold">
                      Papel
                      <select
                        className={inputClass}
                        disabled={busy}
                        value={link.role}
                        onChange={(event) =>
                          updateLink(index, {
                            role: event.target.value as EventEntityLinkInput['role'],
                          })
                        }
                      >
                        {Object.entries(eventRoleLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold">
                      Ordem
                      <input
                        className={inputClass}
                        disabled={busy}
                        min="0"
                        type="number"
                        value={link.sortOrder}
                        onChange={(event) =>
                          updateLink(index, { sortOrder: Number(event.target.value) })
                        }
                      />
                    </label>
                    <button
                      className={secondaryClass}
                      disabled={busy}
                      onClick={() =>
                        setLinks((current) => current.filter((_, position) => position !== index))
                      }
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>
            {links.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">Nenhuma entidade vinculada.</p>
            ) : null}
            <button
              className={`${secondaryClass} mt-4`}
              disabled={busy || availableEntities.length === 0}
              onClick={() =>
                setLinks((current) => [
                  ...current,
                  { entityId: '', role: 'related', sortOrder: current.length },
                ])
              }
              type="button"
            >
              Adicionar vÃ­nculo
            </button>
          </fieldset>
          {error === null && validation === null ? null : (
            <p className="rounded-xl bg-red-50 p-4 text-red-800" role="alert">
              {error ?? validation}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button className={secondaryClass} disabled={busy} onClick={onCancel} type="button">
              Cancelar
            </button>
            <button className={primaryClass} disabled={busy} type="submit">
              {busy ? 'Salvandoâ€¦' : details === null ? 'Registrar evento' : 'Salvar evento'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

async function loadAllSessions(campaignId: string): Promise<Session[]> {
  const items: Session[] = [];
  let cursor: string | undefined;
  do {
    const result = await window.campaignManager.sessions.list({
      campaignId,
      limit: 100,
      filters: {},
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!result.ok) throw new Error(result.error.message);
    items.push(...result.data.items);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}

async function loadAllActiveEntities(campaignId: string): Promise<Entity[]> {
  const items: Entity[] = [];
  let cursor: string | undefined;
  do {
    const result = await window.campaignManager.entities.list({
      campaignId,
      limit: 100,
      filters: { archived: false },
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!result.ok) throw new Error(result.error.message);
    items.push(...result.data.items);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}

function sessionLabel(sessionId: string | null, sessions: Session[]): string {
  if (sessionId === null) return 'Sem sessÃ£o associada';
  const session = sessions.find((item) => item.id === sessionId);
  return session === undefined ? 'SessÃ£o indisponÃ­vel' : `SessÃ£o ${session.sequenceNumber}`;
}

function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded-full bg-stone-100 px-3 py-1">{children}</span>;
}
