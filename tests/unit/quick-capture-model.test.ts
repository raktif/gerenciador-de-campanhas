import { describe, expect, it } from 'vitest';
import type { InboxItem } from '../../src/core/contracts/inbox';
import type { Result } from '../../src/core/contracts/result';
import type { Session } from '../../src/core/contracts/sessions';
import {
  inProgressSessions,
  isQuickCaptureShortcut,
  quickCaptureAriaShortcut,
  quickCaptureShortcutLabel,
  submitQuickCapture,
} from '../../src/renderer/features/inbox/quick-capture-model';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-14T12:00:00.000Z';

describe('modelo de captura rápida', () => {
  it('aceita Ctrl+K fora do macOS e Cmd+K no macOS, sem modificadores extras', () => {
    expect(isQuickCaptureShortcut(key('k', { ctrlKey: true }), 'Win32')).toBe(true);
    expect(isQuickCaptureShortcut(key('K', { metaKey: true }), 'MacIntel')).toBe(true);
    expect(isQuickCaptureShortcut(key('k', { ctrlKey: true }), 'MacIntel')).toBe(false);
    expect(isQuickCaptureShortcut(key('k', { metaKey: true }), 'Linux x86_64')).toBe(false);
    expect(isQuickCaptureShortcut(key('k', { ctrlKey: true, shiftKey: true }), 'Win32')).toBe(
      false,
    );
    expect(quickCaptureShortcutLabel('MacIntel')).toBe('⌘K');
    expect(quickCaptureShortcutLabel('Win32')).toBe('Ctrl+K');
    expect(quickCaptureAriaShortcut('MacIntel')).toBe('Meta+K');
    expect(quickCaptureAriaShortcut('Win32')).toBe('Control+K');
  });

  it('mantém somente sessões em andamento em ordem estável para associação opcional', () => {
    expect(
      inProgressSessions([
        session('70000000-0000-4000-8000-000000000003', 3, 'completed'),
        session(sessionId, 1, 'in_progress'),
        session('70000000-0000-4000-8000-000000000002', 2, 'in_progress'),
      ]).map((item) => item.id),
    ).toEqual(['70000000-0000-4000-8000-000000000002', sessionId]);
  });

  it('captura com sessão opcional e preserva texto em falha para o componente recuperar', async () => {
    const calls: unknown[] = [];
    const success = await submitQuickCapture(
      async (input) => {
        calls.push(input);
        return { ok: true, data: inboxItem(), requestId: 'request' };
      },
      campaignId,
      '  O sino tocou.  ',
      null,
    );
    expect(success).toMatchObject({ ok: true, item: { status: 'new' } });
    expect(calls).toEqual([{ campaignId, sessionId: null, rawText: '  O sino tocou.  ' }]);

    const failure = await submitQuickCapture(
      async () => failureResult('SESSION_NOT_FOUND', 'Sessão indisponível.'),
      campaignId,
      'Texto preservado.',
      sessionId,
    );
    expect(failure).toEqual({ ok: false, message: 'Sessão indisponível.' });
  });
});

function key(
  value: string,
  modifiers: Partial<{
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  }> = {},
) {
  return {
    key: value,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

function session(id: string, sequenceNumber: number, status: Session['status']): Session {
  return {
    id,
    campaignId,
    sequenceNumber,
    title: id,
    playedAt: null,
    status,
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

function inboxItem(): InboxItem {
  return {
    id: '80000000-0000-4000-8000-000000000001',
    campaignId,
    sessionId: null,
    rawText: 'O sino tocou.',
    status: 'new',
    originKind: 'manual',
    capturedAt: timestamp,
    convertedObjectType: null,
    convertedObjectId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

function failureResult(code: string, message: string): Result<InboxItem> {
  return { ok: false, error: { code, message }, requestId: 'request' };
}
