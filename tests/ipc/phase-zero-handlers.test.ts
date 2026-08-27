import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type { ApplicationStatus } from '../../src/core/contracts/phase-zero';
import { phaseZeroChannels } from '../../src/core/contracts/ipc-channels';
import { registerPhaseZeroIpcHandlers } from '../../src/main/ipc/phase-zero-handlers';
import type { PhaseZeroService } from '../../src/main/services/phase-zero-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC', () => {
  it('valida remetente, entrada e saída do status', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const ipcMain = createIpcMain(handlers);
    const status: ApplicationStatus = {
      application: 'ready',
      database: 'connected',
      applicationVersion: '0.0.1',
      schemaVersion: 1,
      sqliteVersion: '3.53.4',
      fts5Available: true,
      dataDirectory: 'C:\\data',
    };
    const service = {
      getStatus: () => status,
      writeTest: () => ({ value: 'test', savedAt: new Date().toISOString() }),
      readTest: () => null,
      openDataDirectory: () => Promise.resolve({ opened: true as const }),
    } as unknown as PhaseZeroService;
    const unregister = registerPhaseZeroIpcHandlers(ipcMain, {
      service,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    const handler = handlers.get(phaseZeroChannels.getStatus);
    expect(handler).toBeDefined();
    if (handler === undefined) throw new Error('Handler de status não registrado.');
    const result = await handler(createEvent(42), {});
    expect(result).toMatchObject({ ok: true, data: status });
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('rejeita um renderer não autorizado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = { getStatus: () => ({}) } as unknown as PhaseZeroService;
    registerPhaseZeroIpcHandlers(createIpcMain(handlers), {
      service,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    const handler = handlers.get(phaseZeroChannels.getStatus);
    if (handler === undefined) throw new Error('Handler de status não registrado.');
    const result = await handler(createEvent(99), {});
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
  });
});

function createIpcMain(handlers: Map<string, CapturedHandler>): IpcMain {
  return {
    handle: (channel: string, handler: CapturedHandler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
}

function createEvent(senderId: number): IpcMainInvokeEvent {
  const mainFrame = {};
  return {
    sender: { id: senderId, mainFrame },
    senderFrame: mainFrame,
  } as unknown as IpcMainInvokeEvent;
}
