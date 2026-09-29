import {
  captureInboxItemInputSchema,
  type CaptureInboxItemInput,
  type InboxItem,
} from '../../../core/contracts/inbox';
import type { Result } from '../../../core/contracts/result';
import type { Session } from '../../../core/contracts/sessions';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function isQuickCaptureShortcut(event: ShortcutEvent, platform: string): boolean {
  const isMac = /mac/i.test(platform);
  return (
    event.key.toLowerCase() === 'k' &&
    !event.altKey &&
    !event.shiftKey &&
    (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  );
}

export function quickCaptureShortcutLabel(platform: string): string {
  return /mac/i.test(platform) ? '⌘K' : 'Ctrl+K';
}

export function quickCaptureAriaShortcut(platform: string): string {
  return /mac/i.test(platform) ? 'Meta+K' : 'Control+K';
}

export function inProgressSessions(sessions: readonly Session[]): Session[] {
  return [...sessions]
    .filter((session) => session.status === 'in_progress')
    .sort(
      (first, second) =>
        second.sequenceNumber - first.sequenceNumber || first.id.localeCompare(second.id),
    );
}

export type InboxCapture = (input: CaptureInboxItemInput) => Promise<Result<InboxItem>>;

export type QuickCaptureResult =
  { ok: true; item: InboxItem } | { ok: false; message: string; error: UserFacingError };

export interface QuickCaptureFeedback {
  captureId: string;
  message: string;
}

export function createQuickCaptureFeedback(item: Pick<InboxItem, 'id'>): QuickCaptureFeedback {
  return { captureId: item.id, message: 'Captura salva na Caixa de Entrada.' };
}

export async function submitQuickCapture(
  capture: InboxCapture,
  campaignId: string,
  rawText: string,
  sessionId: string | null,
): Promise<QuickCaptureResult> {
  const parsed = captureInboxItemInputSchema.safeParse({ campaignId, sessionId, rawText });
  if (!parsed.success) {
    const error = presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'inbox.capture');
    return { ok: false, message: error.message, error };
  }
  try {
    const result = await capture(parsed.data);
    if (result.ok) return { ok: true, item: result.data };
    const error = presentUserFacingError(result.error, 'inbox.capture');
    return { ok: false, message: error.message, error };
  } catch {
    const error = presentUserFacingError(undefined, 'inbox.capture');
    return { ok: false, message: error.message, error };
  }
}
