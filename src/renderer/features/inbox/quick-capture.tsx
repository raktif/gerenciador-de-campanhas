import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Session } from '../../../core/contracts/sessions';
import {
  inProgressSessions,
  isQuickCaptureShortcut,
  quickCaptureAriaShortcut,
  quickCaptureShortcutLabel,
  submitQuickCapture,
} from './quick-capture-model';

const genericLoadError = 'Não foi possível carregar as sessões em andamento.';

export function QuickCapture({ campaign }: { campaign: Campaign }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const platform = navigator.platform;
  const shortcutLabel = quickCaptureShortcutLabel(platform);
  const ariaShortcut = quickCaptureAriaShortcut(platform);

  const loadSessions = useCallback(async (): Promise<void> => {
    setSessionsLoading(true);
    setSessionError(null);
    try {
      const loaded: Session[] = [];
      let cursor: string | undefined;
      do {
        const result = await window.campaignManager.sessions.list({
          campaignId: campaign.id,
          limit: 100,
          filters: { status: 'in_progress' },
          sort: 'sequenceNumber',
          order: 'desc',
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (!result.ok) {
          setSessionError(result.error.message);
          return;
        }
        loaded.push(...result.data.items);
        cursor = result.data.nextCursor ?? undefined;
      } while (cursor !== undefined);
      setSessions(inProgressSessions(loaded));
    } catch {
      setSessionError(genericLoadError);
    } finally {
      setSessionsLoading(false);
    }
  }, [campaign.id]);

  const openCapture = useCallback((): void => {
    if (busy) return;
    setOpen(true);
    setCaptureError(null);
    void loadSessions();
  }, [busy, loadSessions]);

  const closeCapture = useCallback((): void => {
    if (busy) return;
    setOpen(false);
    setCaptureError(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [busy]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closeCapture();
        return;
      }
      if (isQuickCaptureShortcut(event, platform)) {
        event.preventDefault();
        openCapture();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCapture, open, openCapture, platform]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => textAreaRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setRawText('');
    setSessionId('');
    setSessions([]);
    setCaptureError(null);
    setSessionError(null);
  }, [campaign.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setCaptureError(null);
    const result = await submitQuickCapture(
      window.campaignManager.inbox.capture,
      campaign.id,
      rawText,
      sessionId === '' ? null : sessionId,
    );
    if (result.ok) {
      setRawText('');
      setSessionId('');
      setOpen(false);
      setAnnouncement('Captura salva na Caixa de Entrada.');
      requestAnimationFrame(() => triggerRef.current?.focus());
    } else setCaptureError(result.message);
    setBusy(false);
  }

  function trapDialogFocus(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), select:not([disabled])',
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

  return (
    <>
      <div className="fixed right-6 bottom-6 z-20 flex flex-col items-end gap-3">
        {announcement === null ? null : (
          <p
            aria-live="polite"
            className="max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg"
            role="status"
          >
            {announcement}
          </p>
        )}
        <button
          aria-haspopup="dialog"
          aria-keyshortcuts={ariaShortcut}
          className="rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white shadow-lg shadow-amber-900/20 hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
          onClick={openCapture}
          ref={triggerRef}
          type="button"
        >
          Captura rápida <span aria-hidden="true">({shortcutLabel})</span>
        </button>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-slate-950/40 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCapture();
          }}
          role="presentation"
        >
          <section
            aria-describedby="quick-capture-description"
            aria-labelledby="quick-capture-title"
            aria-modal="true"
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
            onKeyDown={trapDialogFocus}
            ref={dialogRef}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
                  {campaign.name}
                </p>
                <h2 className="mt-2 text-2xl font-semibold" id="quick-capture-title">
                  Captura rápida
                </h2>
                <p className="mt-2 text-slate-600" id="quick-capture-description">
                  Registre agora; a classificação fica para depois.
                </p>
              </div>
              <button
                aria-label="Fechar captura rápida"
                className="rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                disabled={busy}
                onClick={closeCapture}
                type="button"
              >
                Fechar
              </button>
            </header>
            <form className="mt-6 grid gap-5" onSubmit={(event) => void submit(event)}>
              <div>
                <label
                  className="block text-sm font-semibold text-slate-800"
                  htmlFor="quick-capture-text"
                >
                  Texto <span className="text-amber-800">*</span>
                </label>
                <textarea
                  aria-describedby="quick-capture-text-help"
                  className="mt-2 min-h-32 w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-amber-700 focus:ring-3 focus:ring-amber-700/15 disabled:bg-stone-100"
                  disabled={busy}
                  id="quick-capture-text"
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Ex.: O sino tocou três vezes antes da ponte cair."
                  ref={textAreaRef}
                  required
                  value={rawText}
                />
                <p className="mt-1 text-xs text-slate-600" id="quick-capture-text-help">
                  O texto original será preservado para revisão posterior.
                </p>
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-slate-800"
                  htmlFor="quick-capture-session"
                >
                  Sessão em andamento <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <select
                  className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none focus:border-amber-700 focus:ring-3 focus:ring-amber-700/15 disabled:bg-stone-100"
                  disabled={busy || sessionsLoading || sessions.length === 0}
                  id="quick-capture-session"
                  onChange={(event) => setSessionId(event.target.value)}
                  value={sessionId}
                >
                  <option value="">
                    {sessionsLoading
                      ? 'Carregando sessões…'
                      : sessions.length === 0
                        ? 'Nenhuma sessão em andamento'
                        : 'Sem associação'}
                  </option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      Sessão {String(session.sequenceNumber)} — {session.title}
                    </option>
                  ))}
                </select>
                {sessionError === null ? null : (
                  <div className="mt-2 text-sm text-red-800" role="alert">
                    <p>{sessionError}</p>
                    <button
                      className="mt-2 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                      disabled={sessionsLoading}
                      onClick={() => void loadSessions()}
                      type="button"
                    >
                      Tentar carregar sessões novamente
                    </button>
                  </div>
                )}
              </div>
              {captureError === null ? null : (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {captureError}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
                <button
                  className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60"
                  disabled={busy}
                  onClick={closeCapture}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-60"
                  disabled={busy || rawText.trim().length === 0}
                  type="submit"
                >
                  {busy ? 'Salvando captura…' : 'Salvar captura'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
