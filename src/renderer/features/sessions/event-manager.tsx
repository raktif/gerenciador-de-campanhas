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
interface UserFacingError {
  message: string;
  field?: 'sourceSession';
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

function eventFailure(code: string, message: string): UserFacingError {
  if (code === 'EVENT_SESSION_SOURCE_REQUIRED')
    return { message: 'Selecione a sessão que originou este evento.', field: 'sourceSession' };
  if (code === 'EVENT_SESSION_SOURCE_AMBIGUOUS')
    return {
      message: 'Escolha novamente a sessão desta campanha que originou o evento.',
      field: 'sourceSession',
    };
  if (code === 'SESSION_NOT_FOUND')
    return {
      message: 'A sessão selecionada não está disponível nesta campanha. Escolha outra.',
      field: 'sourceSession',
    };
  if (code === 'VALIDATION_ERROR')
    return {
      message: 'Revise os campos destacados e tente novamente.',
    };
  return { message };
}

function sourceSessionError(
  error: UserFacingError | null,
  validation: string | null,
): {} | { error: string } {
  if (error?.field === 'sourceSession') return { error: error.message };
  if (validation === 'Selecione a sessão que originou este evento.') return { error: validation };
  return {};
}

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
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
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
        } else setError({ message: result.error.message });
      } catch {
        setError({ message: gatewayError });
      } finally {
        setLoading(false);
      }
    },
    [archived, campaign.id, cursor],
  );

  const loadReferences = useCallback(async (): Promise<void> => {
    setReferencesLoading(true);
    try {
      const [loadedSessions, loadedEntities] = await Promise.all([
        loadAllSessions(campaign.id),
        loadAllActiveEntities(campaign.id),
      ]);
      setSessions(loadedSessions);
      setEntities(loadedEntities);
    } catch {
      setError({ message: gatewayError });
    } finally {
      setReferencesLoading(false);
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
      } else setError({ message: result.error.message });
    } catch {
      setError({ message: gatewayError });
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
      } else setError(eventFailure(result.error.code, result.error.message));
    } catch (exception) {
      setError({ message: gatewayError });
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
      ...(input.sourceSessionId === undefined ? {} : { sourceSessionId: input.sourceSessionId }),
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
      } else setError({ message: result.error.message });
    } catch {
      setError({ message: gatewayError });
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
      <button
        aria-label={'Voltar para sess\u00f5es'}
        className={secondaryClass}
        disabled={busy}
        onClick={onBack}
        type="button"
      >
        ← Voltar para sessões
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
            Registre acontecimentos, a sessão associada e as entidades envolvidas.
          </p>
        </div>
        <button
          className={primaryClass}
          disabled={busy || referencesLoading}
          onClick={() => {
            setEditing(null);
            setView('create');
          }}
          type="button"
        >
          Registrar evento
        </button>
      </header>
      {referencesLoading ? (
        <p aria-live="polite" className="mt-4 text-sm text-slate-600" role="status">
          Carregando sessões e entidades para o evento…
        </p>
      ) : null}
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
          <p>{error.message}</p>
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
            {pending.restore ? 'Restaurar' : 'Arquivar'} “{pending.event.title}”?
          </p>
          <p className="mt-1 text-sm">
            {pending.restore
              ? 'Os vínculos serão validados novamente antes da restauração.'
              : 'O evento e seus vínculos permanecerão preservados.'}
          </p>
          <div className="mt-3 flex gap-3">
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setPending(null)}
              type="button"
            >
              Cancelar ação
            </button>
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() => void lifecycle()}
              type="button"
            >
              Confirmar {pending.restore ? 'restauração' : 'arquivamento'}
            </button>
          </div>
        </div>
      )}
      {loading && items.length === 0 ? (
        <p aria-busy="true" aria-live="polite" className="mt-8">
          Carregando eventos…
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <h2 className="text-xl font-semibold">Nenhum evento encontrado</h2>
          <p className="mt-2 text-slate-600">
            Registre um acontecimento para começar a cronologia.
          </p>
        </div>
      ) : (
        <ul className="mt-7 grid gap-4" data-testid="event-list">
          {items.map((item) => (
            <li className="rounded-2xl border border-stone-200 bg-white p-6" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {sessionLabel(item.sessionId, sessions)} · Ordem {item.eventOrder}
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
          {loading ? 'Carregando…' : 'Carregar mais eventos'}
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
  error: UserFacingError | null;
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
  const [sourceSessionId, setSourceSessionId] = useState(
    details?.event.originKind === 'session' ? (details.event.sourceId ?? '') : '',
  );
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
      ...(metadata.originKind === 'session' && sourceSessionId !== '' ? { sourceSessionId } : {}),
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
        ← Voltar para eventos
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
            <label className="block font-semibold" htmlFor="event-title">
              Título *
              <input
                autoFocus
                aria-label="Título do evento"
                className={inputClass}
                disabled={busy}
                id="event-title"
                maxLength={200}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block font-semibold" htmlFor="event-session">
              Sessão associada
              <select
                className={inputClass}
                disabled={busy}
                id="event-session"
                aria-label="Sessão associada ao evento"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
              >
                <option value="">Nenhuma</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    Sessão {session.sequenceNumber}: {session.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-semibold" htmlFor="event-order">
              Ordem *
              <input
                className={inputClass}
                disabled={busy}
                id="event-order"
                aria-label="Ordem do evento"
                min="0"
                required
                type="number"
                value={eventOrder}
                onChange={(event) => setEventOrder(event.target.value)}
              />
            </label>
          </div>
          <label className="block font-semibold" htmlFor="event-occurred-at-label">
            Referência temporal
            <input
              aria-label="Referência temporal do evento"
              className={inputClass}
              disabled={busy}
              id="event-occurred-at-label"
              maxLength={200}
              value={occurredAtLabel}
              onChange={(event) => setOccurredAtLabel(event.target.value)}
            />
          </label>
          <label className="block font-semibold" htmlFor="event-description">
            Descrição em Markdown
            <textarea
              aria-label="Descrição do evento em Markdown"
              className={`${inputClass} min-h-40 resize-y whitespace-pre-wrap`}
              disabled={busy}
              id="event-description"
              maxLength={100000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <NarrativeMetadataFields
            disabled={busy}
            hideSourceIdentifier
            sessionSource={{
              options: sessions.map((session) => ({
                id: session.id,
                label: `Sessão ${String(session.sequenceNumber)}: ${session.title}`,
              })),
              value: sourceSessionId,
              onChange: (nextSessionId) => {
                setSourceSessionId(nextSessionId);
                setMetadata((current) => ({ ...current, sourceId: null }));
              },
              ...sourceSessionError(error, validation),
            }}
            values={metadata}
            onChange={(nextMetadata) => {
              setMetadata((current) => ({
                ...nextMetadata,
                sourceId:
                  nextMetadata.originKind === current.originKind ? nextMetadata.sourceId : null,
              }));
              if (nextMetadata.originKind !== 'session') setSourceSessionId('');
            }}
          />
          <fieldset
            aria-label="Vínculos com entidades"
            className="rounded-2xl border border-stone-200 p-5"
          >
            <legend className="px-2 font-semibold">Vínculos com entidades</legend>
            <p className="mt-1 text-sm text-slate-600">
              Somente entidades ativas desta campanha podem ser vinculadas.
            </p>
            <div className="mt-4 grid gap-4">
              {links.map((link, index) => {
                const isActiveEntity =
                  link.entityId === '' || availableEntityIds.has(link.entityId);
                return (
                  <div
                    className="grid gap-3 rounded-xl bg-stone-50 p-4 md:grid-cols-[1fr_12rem_7rem_auto]"
                    key={`${String(index)}:${link.entityId}:${link.role}`}
                  >
                    {isActiveEntity ? (
                      <label
                        className="text-sm font-semibold"
                        htmlFor={`event-link-${String(index)}-entity`}
                      >
                        Entidade
                        <select
                          className={inputClass}
                          disabled={busy}
                          id={`event-link-${String(index)}-entity`}
                          aria-label="Entidade vinculada"
                          required
                          value={link.entityId}
                          onChange={(event) => updateLink(index, { entityId: event.target.value })}
                        >
                          <option value="">Selecione…</option>
                          {availableEntities.map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {entity.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="text-sm font-semibold text-red-800">
                        Entidade indisponível
                        <p className="mt-2 font-normal">
                          Esta entidade foi arquivada; remova o vínculo antes de salvar.
                        </p>
                      </div>
                    )}
                    <label
                      className="text-sm font-semibold"
                      htmlFor={`event-link-${String(index)}-role`}
                    >
                      Papel
                      <select
                        className={inputClass}
                        disabled={busy}
                        id={`event-link-${String(index)}-role`}
                        aria-label="Papel da entidade vinculada"
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
                    <label
                      className="text-sm font-semibold"
                      htmlFor={`event-link-${String(index)}-order`}
                    >
                      Ordem
                      <input
                        className={inputClass}
                        disabled={busy}
                        id={`event-link-${String(index)}-order`}
                        aria-label="Ordem do vínculo da entidade"
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
              aria-label="Adicionar vínculo"
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
              Adicionar vínculo
            </button>
          </fieldset>
          {error === null && validation === null ? null : (
            <p className="rounded-xl bg-red-50 p-4 text-red-800" role="alert">
              {error?.message ?? validation}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button className={secondaryClass} disabled={busy} onClick={onCancel} type="button">
              Cancelar
            </button>
            <button className={primaryClass} disabled={busy} type="submit">
              {busy ? 'Salvando…' : details === null ? 'Registrar evento' : 'Salvar evento'}
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
  if (sessionId === null) return 'Sem sessão associada';
  const session = sessions.find((item) => item.id === sessionId);
  return session === undefined ? 'Sessão indisponível' : `Sessão ${String(session.sequenceNumber)}`;
}

function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded-full bg-stone-100 px-3 py-1">{children}</span>;
}
