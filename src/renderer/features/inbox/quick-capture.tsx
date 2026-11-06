import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Session } from '../../../core/contracts/sessions';
import {
  createQuickCaptureFeedback,
  inProgressSessions,
  isQuickCaptureShortcut,
  quickCaptureAriaShortcut,
  quickCaptureShortcutLabel,
  submitQuickCapture,
} from './quick-capture-model';
import type { UserFacingError } from '../../../core/errors/user-facing-error';
import { presentUserFacingError } from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { Button, DialogActions, IconButton } from '../../components/actions';

export function QuickCapture({
  campaign,
  onOpenInbox,
}: {
  campaign: Campaign;
  onOpenInbox: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState<UserFacingError | null>(null);
  const [captureError, setCaptureError] = useState<UserFacingError | null>(null);
  const [feedback, setFeedback] = useState<ReturnType<typeof createQuickCaptureFeedback> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLElement>(null);
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
          setSessionError(presentUserFacingError(result.error, 'sessions.list'));
          return;
        }
        loaded.push(...result.data.items);
        cursor = result.data.nextCursor ?? undefined;
      } while (cursor !== undefined);
      setSessions(inProgressSessions(loaded));
    } catch {
      setSessionError(presentUserFacingError(undefined, 'sessions.list'));
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

  const dismissFeedback = useCallback((): void => {
    setFeedback(null);
  }, []);

  const openInboxFromFeedback = useCallback((): void => {
    dismissFeedback();
    onOpenInbox();
  }, [dismissFeedback, onOpenInbox]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closeCapture();
        return;
      }
      if (feedback !== null && event.key === 'Escape') {
        event.preventDefault();
        dismissFeedback();
        return;
      }
      if (isQuickCaptureShortcut(event, platform)) {
        event.preventDefault();
        openCapture();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCapture, dismissFeedback, feedback, open, openCapture, platform]);

  useEffect(() => {
    if (feedback === null) return;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && feedbackRef.current?.contains(target)) return;
      dismissFeedback();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [dismissFeedback, feedback]);

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

  async function submit(event: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setCaptureError(null);
    const result = await submitQuickCapture(
      (input) => window.campaignManager.inbox.capture(input),
      campaign.id,
      rawText,
      sessionId === '' ? null : sessionId,
    );
    if (result.ok) {
      setRawText('');
      setSessionId('');
      setOpen(false);
      setFeedback(createQuickCaptureFeedback(result.item));
      requestAnimationFrame(() => triggerRef.current?.focus());
    } else setCaptureError(result.error);
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
        {feedback === null ? null : (
          <section
            className="max-w-sm rounded-xl border semantic-success-border semantic-success-surface px-4 py-3 text-sm semantic-success-text shadow-lg"
            data-testid="quick-capture-feedback"
            role="status"
            aria-atomic="true"
            ref={feedbackRef}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{feedback.message}</p>
              <IconButton
                aria-label="Fechar aviso de captura"
                className="-mt-1 semantic-success-text semantic-hover-success-surface"
                onClick={dismissFeedback}
                size="small"
                variant="ghost"
              >
                <span aria-hidden="true">×</span>
              </IconButton>
            </div>
            <Button className="mt-2" onClick={openInboxFromFeedback} size="small" variant="link">
              Abrir Caixa de Entrada
            </Button>
          </section>
        )}
        <Button
          aria-haspopup="dialog"
          aria-keyshortcuts={ariaShortcut}
          aria-controls="quick-capture-dialog"
          aria-expanded={open}
          className="shadow-lg semantic-accent-shadow"
          onClick={openCapture}
          ref={triggerRef}
          size="large"
          variant="primary"
        >
          Captura rápida <span aria-hidden="true">({shortcutLabel})</span>
        </Button>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center semantic-overlay p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCapture();
          }}
          role="presentation"
        >
          <section
            aria-describedby="quick-capture-description"
            aria-labelledby="quick-capture-title"
            aria-modal="true"
            className="w-full max-w-xl rounded-2xl semantic-surface p-6 shadow-2xl"
            id="quick-capture-dialog"
            onKeyDown={trapDialogFocus}
            ref={dialogRef}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
                  {campaign.name}
                </p>
                <h2 className="mt-2 text-2xl font-semibold" id="quick-capture-title">
                  Captura rápida
                </h2>
                <p className="mt-2 semantic-text-secondary" id="quick-capture-description">
                  Registre agora; a classificação fica para depois.
                </p>
              </div>
              <Button
                aria-label="Fechar captura rápida"
                disabled={busy}
                onClick={closeCapture}
                size="small"
                variant="ghost"
              >
                Fechar
              </Button>
            </header>
            <form className="mt-6 grid gap-5" onSubmit={(event) => void submit(event)}>
              <div>
                <label
                  className="block text-sm font-semibold semantic-text-primary"
                  htmlFor="quick-capture-text"
                >
                  Texto <span className="semantic-accent-text">*</span>
                </label>
                <textarea
                  aria-describedby="quick-capture-text-help"
                  className="mt-2 min-h-32 w-full resize-y rounded-xl border semantic-border semantic-surface px-4 py-3 semantic-text-primary shadow-sm outline-none semantic-placeholder semantic-focus-border focus:ring-3 semantic-focus-ring semantic-disabled-surface"
                  disabled={busy}
                  id="quick-capture-text"
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Ex.: O sino tocou três vezes antes da ponte cair."
                  ref={textAreaRef}
                  required
                  value={rawText}
                />
                <p className="mt-1 text-xs semantic-text-secondary" id="quick-capture-text-help">
                  O texto original será preservado para revisão posterior.
                </p>
              </div>
              <div>
                <label
                  className="block text-sm font-semibold semantic-text-primary"
                  htmlFor="quick-capture-session"
                >
                  Sessão em andamento{' '}
                  <span className="font-normal semantic-text-secondary">(opcional)</span>
                </label>
                <select
                  className="mt-2 w-full rounded-xl border semantic-border semantic-surface px-4 py-3 semantic-text-primary shadow-sm outline-none semantic-focus-border focus:ring-3 semantic-focus-ring semantic-disabled-surface"
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
                  <div className="mt-2">
                    <UserFacingErrorNotice
                      compact
                      error={sessionError}
                      operation="sessions.list"
                      onRetry={() => void loadSessions()}
                    />
                  </div>
                )}
              </div>
              {captureError === null ? null : (
                <UserFacingErrorNotice compact error={captureError} operation="inbox.capture" />
              )}
              <DialogActions className="border-t semantic-border pt-5">
                <Button disabled={busy} onClick={closeCapture}>
                  Cancelar
                </Button>
                <Button
                  busy={busy}
                  disabled={rawText.trim().length === 0}
                  type="submit"
                  variant="primary"
                >
                  {busy ? 'Salvando captura…' : 'Salvar captura'}
                </Button>
              </DialogActions>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
