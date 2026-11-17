import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { demandChannels } from '../../src/core/contracts/ipc-channels';
import { registerDemandIpcHandlers } from '../../src/main/ipc/demand-handlers';
import { TestLogger } from '../helpers/test-logger';
type Handler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const id = '10000000-0000-4000-8000-000000000001';
function event(sender = 42, child = false): IpcMainInvokeEvent {
  const frame = {};
  return { sender: { id: sender, mainFrame: frame }, senderFrame: child ? {} : frame } as never;
}
describe('3B.3 fronteira IPC Demandas', () => {
  it('valida sender/frame/input/output; remove todos canais e não chama domínio com entradas inválidas', async () => {
    const handlers = new Map<string, Handler>();
    const list = vi.fn(() => ({ items: [], nextCursor: null, total: 0 }));
    const cleanup = registerDemandIpcHandlers(
      {
        handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
        removeHandler: (channel: string) => handlers.delete(channel),
      } as unknown as IpcMain,
      { service: { list } as never, logger: new TestLogger(), authorizedWebContentsId: 42 },
    );
    expect([...handlers.keys()].sort()).toEqual(Object.values(demandChannels).sort());
    const invoke = handlers.get(demandChannels.list);
    if (!invoke) throw new Error('Canal ausente');
    expect(await invoke(event(3), { campaignId: id })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(await invoke(event(42, true), { campaignId: id })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(await invoke(event(), { campaignId: id, limit: 1000 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(list).not.toHaveBeenCalled();
    expect(await invoke(event(), { campaignId: id })).toMatchObject({
      ok: true,
      data: { items: [] },
    });
    list.mockReturnValueOnce({ items: 'invalid', total: 0, nextCursor: null } as never);
    expect(await invoke(event(), { campaignId: id })).toMatchObject({ ok: false });
    cleanup();
    expect(handlers.size).toBe(0);
  });
});
