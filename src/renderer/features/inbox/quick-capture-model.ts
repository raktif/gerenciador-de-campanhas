import {
  captureInboxItemInputSchema,
  type CaptureInboxItemInput,
  type InboxItem,
} from '../../../core/contracts/inbox';
import type { Result } from '../../../core/contracts/result';
import type { Session } from '../../../core/contracts/sessions';

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

export type QuickCaptureResult = { ok: true; item: InboxItem } | { ok: false; message: string };

export async function submitQuickCapture(
  capture: InboxCapture,
  campaignId: string,
  rawText: string,
  sessionId: string | null,
): Promise<QuickCaptureResult> {
  const parsed = captureInboxItemInputSchema.safeParse({ campaignId, sessionId, rawText });
  if (!parsed.success) return { ok: false, message: 'Informe o texto da captura.' };
  try {
    const result = await capture(parsed.data);
    return result.ok
      ? { ok: true, item: result.data }
      : { ok: false, message: result.error.message };
  } catch {
    return { ok: false, message: 'Não foi possível salvar a captura. Tente novamente.' };
  }
}
