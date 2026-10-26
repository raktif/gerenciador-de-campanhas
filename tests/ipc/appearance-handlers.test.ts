import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type { AppearanceSetting } from '../../src/core/contracts/appearance';
import { appearanceChannels } from '../../src/core/contracts/ipc-channels';
import type { AppearanceController } from '../../src/main/appearance/appearance-controller';
import { registerAppearanceIpcHandlers } from '../../src/main/ipc/appearance-handlers';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de aparência', () => {
  it('valida entrada, saída e encaminha a revisão otimista', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const setting: AppearanceSetting = { theme: 'light', revision: 2 };
    const controller = {
      getTheme: () => setting,
      setTheme: (input: unknown) => ({ ...(input as object), revision: 3 }),
    } as AppearanceController;
    const unregister = registerAppearanceIpcHandlers(createIpcMain(handlers), {
      controller,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    await expect(
      handler(handlers, appearanceChannels.getTheme)(createEvent(42), {}),
    ).resolves.toMatchObject({
      ok: true,
      data: setting,
    });
    await expect(
      handler(handlers, appearanceChannels.setTheme)(createEvent(42), {
        theme: 'dark',
        revision: 2,
      }),
    ).resolves.toMatchObject({ ok: true, data: { theme: 'dark', revision: 3 } });
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('rejeita remetente, propriedades extras e saída inválida', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const controller = {
      getTheme: () => ({ theme: 'system', revision: 1 }),
      setTheme: () => ({ theme: 'dark', revision: 2 }),
    } as unknown as AppearanceController;
    registerAppearanceIpcHandlers(createIpcMain(handlers), {
      controller,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    await expect(
      handler(handlers, appearanceChannels.getTheme)(createEvent(99), {}),
    ).resolves.toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
    await expect(
      handler(handlers, appearanceChannels.setTheme)(createEvent(42), {
        theme: 'dark',
        revision: 1,
        channel: 'raw',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    await expect(
      handler(handlers, appearanceChannels.getTheme)(createEvent(42), {}),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
});

function handler(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const captured = handlers.get(channel);
  if (captured === undefined) throw new Error(`Handler ${channel} não registrado.`);
  return captured;
}

function createIpcMain(handlers: Map<string, CapturedHandler>): IpcMain {
  return {
    handle: (channel: string, captured: CapturedHandler) => handlers.set(channel, captured),
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
