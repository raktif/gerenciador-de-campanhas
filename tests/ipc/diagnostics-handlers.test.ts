import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { diagnosticsChannels } from '../../src/core/contracts/ipc-channels';
import { registerDiagnosticsIpcHandlers } from '../../src/main/ipc/diagnostics-handlers';
import { StartupDiagnosticsService } from '../../src/main/services/startup-diagnostics-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de diagnóstico', () => {
  it('copia somente o diagnóstico validado para o renderer autorizado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const copied: string[] = [];
    const unregister = registerDiagnosticsIpcHandlers(createIpcMain(handlers), {
      service: new StartupDiagnosticsService((value) => copied.push(value)),
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const handler = handlers.get(diagnosticsChannels.copyStartupDiagnostic);
    if (handler === undefined) throw new Error('Handler de diagnóstico não registrado.');

    await expect(
      handler(createEvent(42), {
        version: 1,
        screen: 'campaigns',
        operation: 'campaigns.list',
        code: 'DATABASE_UNAVAILABLE',
      }),
    ).resolves.toMatchObject({ ok: true, data: { copied: true } });
    expect(copied).toEqual([
      [
        'Gerenciador de Campanhas de RPG — diagnóstico da aplicação',
        'versão=1',
        'tela=campaigns',
        'operação=campaigns.list',
        'código=DATABASE_UNAVAILABLE',
      ].join('\n'),
    ]);
    unregister();
  });

  it('rejeita remetente não autorizado e entrada que tente injetar dados técnicos', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const copied: string[] = [];
    registerDiagnosticsIpcHandlers(createIpcMain(handlers), {
      service: new StartupDiagnosticsService((value) => copied.push(value)),
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const handler = handlers.get(diagnosticsChannels.copyStartupDiagnostic);
    if (handler === undefined) throw new Error('Handler de diagnóstico não registrado.');

    await expect(
      handler(createEvent(99), {
        version: 1,
        screen: 'campaigns',
        operation: 'campaigns.list',
        code: 'DATABASE_UNAVAILABLE',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
    await expect(
      handler(createEvent(42), {
        version: 1,
        screen: 'campaigns',
        operation: 'campaigns.list',
        code: 'ERROR_C:\\secret',
        stack: 'não deve passar',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(copied).toEqual([]);
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
