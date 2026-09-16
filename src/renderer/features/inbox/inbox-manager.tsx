import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { InboxItem } from '../../../core/contracts/inbox';
import type { Session } from '../../../core/contracts/sessions';
import type { EntityType } from '../../../core/contracts/entity-types';
import { primaryClass, secondaryClass } from '../narrative/narrative-metadata-fields';

type Filter = 'pending' | 'dismissed' | 'archived';
type Action = 'beginReview' | 'dismiss' | 'archive' | 'restore';

const statuses: Record<Filter, InboxItem['status'][]> = {
  pending: ['new', 'reviewing'],
  dismissed: ['dismissed'],
  archived: ['archived'],
};

export function InboxManager({
  campaign,
  onBack,
  onManageEntityTypes,
}: {
  campaign: Campaign;
  onBack: () => void;
  onManageEntityTypes: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    item: InboxItem;
    action: Extract<Action, 'dismiss' | 'archive'>;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef(0);
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [conversion, setConversion] = useState<InboxItem | null>(null);
  const [conversionTypeId, setConversionTypeId] = useState('');
  const [conversionName, setConversionName] = useState('');
  const [conversionSummary, setConversionSummary] = useState('');
  const [conversionCanonState, setConversionCanonState] = useState<
    'draft' | 'accepted' | 'rejected' | 'archived'
  >('accepted');
  const [conversionKnowledgeState, setConversionKnowledgeState] = useState<
    'fact' | 'rumor' | 'suspicion' | 'secret' | 'possibility' | 'disproved'
  >('fact');
  const [conversionVisibility, setConversionVisibility] = useState<'gm' | 'players' | 'public'>(
    'gm',
  );
  const [conversionError, setConversionError] = useState<string | null>(null);
  const conversionDialogRef = useRef<HTMLFormElement>(null);
  const conversionNameRef = useRef<HTMLInputElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(
    async (append = false): Promise<void> => {
      const requestId = ++requestRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await window.campaignManager.inbox.list({
          campaignId: campaign.id,
          limit: 50,
          ...(append && cursor !== null ? { cursor } : {}),
          filters: { statuses: statuses[filter] },
        });
        if (requestId !== requestRef.current) return;
        if (result.ok) {
          setItems((current) => (append ? [...current, ...result.data.items] : result.data.items));
          setCursor(result.data.nextCursor);
        } else setError(result.error.message);
      } catch {
        if (requestId !== requestRef.current) return;
        setError('Não foi possível carregar a Caixa de Entrada. Tente novamente.');
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [campaign.id, cursor, filter],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [campaign.id, filter]);
  useEffect(() => {
    if (confirming !== null) cancelRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (conversion !== null) conversionNameRef.current?.focus();
  }, [conversion]);
  useEffect(() => {
    void window.campaignManager.sessions
      .list({
        campaignId: campaign.id,
        limit: 100,
        filters: {},
        sort: 'sequenceNumber',
        order: 'desc',
      })
      .then((result) => {
        if (result.ok)
          setSessions(new Map(result.data.items.map((session) => [session.id, session])));
      });
  }, [campaign.id]);
  useEffect(() => {
    void window.campaignManager.entityTypes
      .list({ campaignId: campaign.id, limit: 100, filters: { isArchived: false } })
      .then((result) => {
        if (result.ok) setEntityTypes(result.data.items);
      });
  }, [campaign.id]);
  useEffect(() => {
    const root = document.querySelector('#root');
    if ((confirming === null && conversion === null) || root === null) return;
    root.setAttribute('inert', '');
    return () => root.removeAttribute('inert');
  }, [confirming, conversion]);

  async function execute(item: InboxItem, action: Action): Promise<void> {
    if (busy !== null) return;
    setBusy(item.id);
    setError(null);
    try {
      const input = { campaignId: campaign.id, id: item.id, revision: item.revision };
      const result =
        action === 'beginReview'
          ? await window.campaignManager.inbox.beginReview(input)
          : action === 'dismiss'
            ? await window.campaignManager.inbox.dismiss(input)
            : action === 'archive'
              ? await window.campaignManager.inbox.archive(input)
              : await window.campaignManager.inbox.restore(input);
      if (result.ok) {
        setConfirming(null);
        requestAnimationFrame(() => triggerRef.current?.focus());
        if (action === 'beginReview' && item.status === 'dismissed') setFilter('pending');
        setAnnouncement(
          action === 'beginReview'
            ? 'Captura marcada como em revisão.'
            : action === 'dismiss'
              ? 'Captura descartada e preservada.'
              : action === 'archive'
                ? 'Captura arquivada.'
                : 'Captura restaurada para novas pendências.',
        );
        await load(false);
      } else setError(result.error.message);
    } catch {
      setError('Não foi possível concluir a ação. Tente novamente.');
    } finally {
      setBusy(null);
    }
  }

  async function convert(): Promise<void> {
    if (conversion === null || busy !== null) return;
    setBusy(conversion.id);
    setError(null);
    setConversionError(null);
    try {
      const result = await window.campaignManager.inbox.convertToEntity({
        campaignId: campaign.id,
        id: conversion.id,
        revision: conversion.revision,
        destination: {
          entityTypeId: conversionTypeId,
          name: conversionName,
          summary: conversionSummary.trim() === '' ? null : conversionSummary,
          canonState: conversionCanonState,
          knowledgeState: conversionKnowledgeState,
          visibility: conversionVisibility,
        },
      });
      if (result.ok) {
        setConversion(null);
        setAnnouncement(`Entidade “${result.data.entity.name}” criada a partir da captura.`);
        await load(false);
        requestAnimationFrame(() => announcementRef.current?.focus());
      } else setConversionError(result.error.message);
    } catch {
      setConversionError('Não foi possível converter a captura. Tente novamente.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="inbox-title">
      <button className={secondaryClass} disabled={busy !== null} onClick={onBack} type="button">
        ← Voltar para detalhes da campanha
      </button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="inbox-title">
            Caixa de Entrada
          </h1>
          <p className="mt-2 text-slate-600">Revise capturas sem alterar seu texto original.</p>
        </div>
      </header>
      <div aria-label="Filtrar capturas" className="mt-5 flex flex-wrap gap-2" role="group">
        {(
          [
            ['pending', 'Pendentes'],
            ['dismissed', 'Descartadas'],
            ['archived', 'Arquivadas'],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={filter === value}
            className={filter === value ? primaryClass : secondaryClass}
            disabled={busy !== null || loading}
            key={value}
            onClick={() => {
              setAnnouncement(null);
              setFilter(value);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
          role="status"
          ref={announcementRef}
          tabIndex={-1}
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">
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
        <div aria-busy="true" aria-label="Carregando capturas" className="mt-8 animate-pulse">
          <div className="h-28 rounded-2xl bg-stone-200" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <h2 className="text-xl font-semibold">{emptyTitle(filter)}</h2>
          <p className="mt-2 text-slate-600">{emptyDescription(filter)}</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4" data-testid="inbox-list">
          {items.map((item) => (
            <li
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
              key={item.id}
            >
              <article
                aria-busy={busy === item.id}
                aria-label={`Captura ${statusLabel(item.status)}`}
              >
                <p className="break-words whitespace-pre-wrap leading-7 text-slate-800">
                  {item.rawText}
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  {statusLabel(item.status)} · {new Date(item.capturedAt).toLocaleString('pt-BR')}
                </p>
                {item.sessionId === null ? null : (
                  <p className="mt-1 text-sm text-slate-500">
                    Sessão: {sessionLabel(sessions.get(item.sessionId))}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.status === 'new' || item.status === 'dismissed' ? (
                    <button
                      className={primaryClass}
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        void execute(item, 'beginReview');
                      }}
                      type="button"
                    >
                      Marcar como em revisão
                    </button>
                  ) : null}
                  {item.status === 'new' || item.status === 'reviewing' ? (
                    <button
                      className={secondaryClass}
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setConfirming({ item, action: 'dismiss' });
                      }}
                      type="button"
                    >
                      Descartar
                    </button>
                  ) : null}
                  {item.status === 'reviewing' ? (
                    <>
                      <button
                        aria-describedby={
                          entityTypes.length === 0
                            ? `inbox-conversion-reason-${item.id}`
                            : undefined
                        }
                        className={primaryClass}
                        disabled={busy !== null || entityTypes.length === 0}
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          setConversion(item);
                          setConversionName(item.rawText.slice(0, 200));
                          setConversionSummary('');
                          setConversionTypeId(entityTypes[0]?.id ?? '');
                          setConversionCanonState('accepted');
                          setConversionKnowledgeState('fact');
                          setConversionVisibility('gm');
                        }}
                        type="button"
                      >
                        Converter em entidade
                      </button>
                      {entityTypes.length === 0 ? (
                        <span
                          className="text-sm text-amber-900"
                          id={`inbox-conversion-reason-${item.id}`}
                        >
                          Crie um tipo de entidade ativo para converter esta captura.
                          <button
                            className="ml-2 font-semibold underline"
                            disabled={busy !== null}
                            onClick={onManageEntityTypes}
                            type="button"
                          >
                            Gerenciar tipos de entidade
                          </button>
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {item.status !== 'archived' && item.status !== 'converted' ? (
                    <button
                      className={secondaryClass}
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setConfirming({ item, action: 'archive' });
                      }}
                      type="button"
                    >
                      Arquivar
                    </button>
                  ) : null}
                  {item.status === 'archived' ? (
                    <button
                      className={primaryClass}
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        void execute(item, 'restore');
                      }}
                      type="button"
                    >
                      Restaurar
                    </button>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {cursor === null || loading ? null : (
        <button
          className={`${secondaryClass} mt-5`}
          disabled={busy !== null || loadingMore}
          onClick={() => void load(true)}
          type="button"
        >
          {loadingMore ? 'Carregando mais…' : 'Carregar mais'}
        </button>
      )}
      {confirming === null
        ? null
        : createPortal(
            <div
              aria-describedby="inbox-confirmation-message"
              aria-labelledby="inbox-confirmation-title"
              aria-modal="true"
              className="fixed inset-0 grid place-items-center bg-slate-950/40 p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setConfirming(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') {
                  const focusable =
                    dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
                  if (focusable === undefined || focusable.length === 0) return;
                  const first = focusable[0];
                  const last = focusable[focusable.length - 1];
                  if (first === undefined || last === undefined) return;
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                  }
                }
              }}
              role="dialog"
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                ref={dialogRef}
                tabIndex={-1}
              >
                <h2 className="text-xl font-semibold" id="inbox-confirmation-title">
                  Confirmar {confirming.action === 'dismiss' ? 'descarte' : 'arquivamento'}
                </h2>
                <p className="mt-3 text-slate-600" id="inbox-confirmation-message">
                  {confirming.action === 'dismiss'
                    ? 'A captura será marcada como descartada, mas seu texto continuará preservado.'
                    : 'A captura será removida das pendências, mas continuará preservada.'}
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    className={secondaryClass}
                    disabled={busy !== null}
                    onClick={() => {
                      setConfirming(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                    ref={cancelRef}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className={primaryClass}
                    disabled={busy !== null}
                    onClick={() => void execute(confirming.item, confirming.action)}
                    type="button"
                  >
                    {confirming.action === 'dismiss'
                      ? 'Confirmar descarte'
                      : 'Confirmar arquivamento'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
      {conversion === null
        ? null
        : createPortal(
            <div
              aria-labelledby="inbox-conversion-title"
              aria-modal="true"
              className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && busy === null) {
                  setConversion(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') trapFocus(event, conversionDialogRef.current);
              }}
              role="dialog"
            >
              <form
                aria-busy={busy === conversion.id}
                className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  void convert();
                }}
                ref={conversionDialogRef}
              >
                <h2 className="text-xl font-semibold" id="inbox-conversion-title">
                  Converter em entidade
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  O texto original continuará vinculado como fonte desta entidade.
                </p>
                <div
                  aria-labelledby="inbox-source-text-label"
                  className="mt-4 max-h-32 overflow-y-auto rounded-xl bg-stone-100 p-3"
                >
                  <p className="text-xs font-semibold" id="inbox-source-text-label">
                    Texto original da captura
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-sm">
                    {conversion.rawText}
                  </p>
                </div>
                {entityTypes.length === 0 ? (
                  <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    <p>Crie um tipo de entidade ativo antes de converter.</p>
                    <button
                      className="mt-2 font-semibold underline"
                      onClick={() => {
                        setConversion(null);
                        onManageEntityTypes();
                      }}
                      type="button"
                    >
                      Gerenciar tipos de entidade
                    </button>
                  </div>
                ) : null}
                {conversionError === null ? null : (
                  <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
                    {conversionError}
                  </p>
                )}
                <label className="mt-5 block text-sm font-semibold" htmlFor="inbox-entity-type">
                  Tipo de entidade
                </label>
                <select
                  className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2"
                  disabled={busy !== null || entityTypes.length === 0}
                  id="inbox-entity-type"
                  onChange={(event) => setConversionTypeId(event.target.value)}
                  required
                  value={conversionTypeId}
                >
                  {entityTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.singularName}
                    </option>
                  ))}
                </select>
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-entity-name">
                  Nome
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-entity-name"
                  maxLength={200}
                  onChange={(event) => setConversionName(event.target.value)}
                  ref={conversionNameRef}
                  required
                  value={conversionName}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-entity-summary">
                  Resumo
                </label>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-stone-300 px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-entity-summary"
                  maxLength={10000}
                  onChange={(event) => setConversionSummary(event.target.value)}
                  value={conversionSummary}
                />
                <fieldset
                  className="mt-5 grid gap-4 rounded-xl border border-stone-200 p-4"
                  disabled={busy !== null}
                >
                  <legend className="px-1 text-sm font-semibold">Metadados narrativos</legend>
                  <MetadataSelect
                    id="inbox-entity-canon"
                    label="Estado canônico"
                    onChange={(value) =>
                      setConversionCanonState(value as typeof conversionCanonState)
                    }
                    value={conversionCanonState}
                    options={[
                      ['accepted', 'Aceito'],
                      ['draft', 'Rascunho'],
                      ['rejected', 'Rejeitado'],
                      ['archived', 'Arquivado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-entity-knowledge"
                    label="Natureza do conhecimento"
                    onChange={(value) =>
                      setConversionKnowledgeState(value as typeof conversionKnowledgeState)
                    }
                    value={conversionKnowledgeState}
                    options={[
                      ['fact', 'Fato'],
                      ['rumor', 'Rumor'],
                      ['suspicion', 'Suspeita'],
                      ['secret', 'Segredo'],
                      ['possibility', 'Possibilidade'],
                      ['disproved', 'Refutado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-entity-visibility"
                    label="Visibilidade"
                    onChange={(value) =>
                      setConversionVisibility(value as typeof conversionVisibility)
                    }
                    value={conversionVisibility}
                    options={[
                      ['gm', 'Somente mestre'],
                      ['players', 'Jogadores'],
                      ['public', 'Pública'],
                    ]}
                  />
                </fieldset>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    className={secondaryClass}
                    disabled={busy !== null}
                    onClick={() => {
                      setConversion(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className={primaryClass}
                    disabled={busy !== null || entityTypes.length === 0}
                    type="submit"
                  >
                    {busy === conversion.id ? 'Convertendo…' : 'Confirmar conversão'}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )}
    </section>
  );
}

function statusLabel(status: InboxItem['status']): string {
  return {
    new: 'Nova',
    reviewing: 'Em revisão',
    converted: 'Convertida',
    dismissed: 'Descartada',
    archived: 'Arquivada',
  }[status];
}

function emptyTitle(filter: Filter): string {
  if (filter === 'pending') return 'Nenhuma captura pendente';
  if (filter === 'dismissed') return 'Nenhuma captura descartada';
  return 'Nenhuma captura arquivada';
}

function emptyDescription(filter: Filter): string {
  if (filter === 'pending') return 'As novas capturas rápidas aparecerão aqui para revisão.';
  if (filter === 'dismissed') return 'Capturas descartadas permanecem preservadas nesta lista.';
  return 'Capturas arquivadas permanecem preservadas nesta lista.';
}

function sessionLabel(session: Session | undefined): string {
  return session === undefined
    ? 'Sessão associada'
    : `Sessão ${String(session.sequenceNumber)} — ${session.title}`;
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  const focusable = container?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
  );
  if (focusable === undefined || focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function MetadataSelect({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: [string, string][];
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <select
        className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
