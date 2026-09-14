import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type { CaptureInboxItemInput, InboxItem } from '../../src/core/contracts/inbox';
import { inboxChannels } from '../../src/core/contracts/ipc-channels';
import { AppError } from '../../src/core/errors/app-error';
import { registerInboxIpcHandlers } from '../../src/main/ipc/inbox-handlers';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const inboxItemId = '80000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-14T12:00:00.000Z';

describe('handler IPC da captura rápida', () => {
  it('registra somente a captura, valida a entrada e remove o canal', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeInboxService();
    const unregister = registerInboxIpcHandlers(ipc(handlers), dependencies(service));
    expect([...handlers.keys()]).toEqual([inboxChannels.capture]);

    const result = await handler(handlers)(event(42), {
      campaignId,
      sessionId,
      rawText: '  O sino tocou.  ',
    });
    expect(result).toMatchObject({ ok: true, data: inboxItem() });
    expect(service.captureInput).toEqual({ campaignId, sessionId, rawText: '  O sino tocou.  ' });
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('rejeita remetente e entrada antes do serviço e normaliza erro e saída inválida', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeInboxService();
    registerInboxIpcHandlers(ipc(handlers), dependencies(service));
    const capture = handler(handlers);

    expect(await capture(event(42), { campaignId, rawText: '' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await capture(event(99), { campaignId, rawText: 'Válido' })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(service.calls).toBe(0);

    service.failure = new AppError('SESSION_NOT_FOUND', 'Ausente.');
    expect(await capture(event(42), { campaignId, sessionId, rawText: 'Válido' })).toMatchObject({
      ok: false,
      error: { code: 'SESSION_NOT_FOUND' },
    });
    service.failure = null;
    service.invalidOutput = true;
    expect(await capture(event(42), { campaignId, rawText: 'Válido' })).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});

class FakeInboxService {
  public captureInput: CaptureInboxItemInput | null = null;
  public calls = 0;
  public failure: AppError | null = null;
  public invalidOutput = false;

  public capture(input: CaptureInboxItemInput): InboxItem {
    this.calls += 1;
    this.captureInput = input;
    if (this.failure !== null) throw this.failure;
    return (this.invalidOutput ? { invalid: true } : inboxItem()) as InboxItem;
  }
}

function inboxItem(): InboxItem {
  return {
    id: inboxItemId,
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

function dependencies(service: FakeInboxService) {
  return {
    service,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  } as never;
}

function ipc(handlers: Map<string, CapturedHandler>): IpcMain {
  return {
    handle: (channel: string, registered: CapturedHandler) => handlers.set(channel, registered),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
}

function event(senderId: number): IpcMainInvokeEvent {
  const mainFrame = {};
  return {
    sender: { id: senderId, mainFrame },
    senderFrame: mainFrame,
  } as unknown as IpcMainInvokeEvent;
}

function handler(handlers: Map<string, CapturedHandler>): CapturedHandler {
  const registered = handlers.get(inboxChannels.capture);
  if (registered === undefined) throw new Error('Handler de captura não registrado.');
  return registered;
}
