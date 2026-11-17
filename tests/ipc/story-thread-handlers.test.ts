import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { storyThreadChannels } from '../../src/core/contracts/ipc-channels';
import { AppError } from '../../src/core/errors/app-error';
import { registerStoryThreadIpcHandlers } from '../../src/main/ipc/story-thread-handlers';
import { TestLogger } from '../helpers/test-logger';

type Handler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-16T14:00:00.000Z';

describe('fronteira IPC de Fios Abertos', () => {
  it('valida remetente/contrato, encaminha operações e remove canais', async () => {
    const handlers = new Map<string, Handler>();
    const service = new FakeThreadService();
    const unregister = registerStoryThreadIpcHandlers(ipc(handlers), {
      service: service as never,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    expect([...handlers.keys()].sort()).toEqual(Object.values(storyThreadChannels).sort());
    const invoke = (channel: string): Handler => {
      const registered = handlers.get(channel);
      if (registered === undefined) throw new Error(`Canal não registrado: ${channel}`);
      return registered;
    };
    const base = { campaignId, id, revision: 1 };
    expect(await invoke(storyThreadChannels.resolve)(event(12), base)).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(
      await invoke(storyThreadChannels.setStatus)(event(42), { ...base, status: 'archived' }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    for (const [channel, input] of [
      [storyThreadChannels.create, { campaignId, title: 'Novo fio', threadType: 'promise' }],
      [storyThreadChannels.get, { campaignId, id }],
      [storyThreadChannels.list, { campaignId }],
      [storyThreadChannels.listTargets, { campaignId, targetType: 'entity' }],
      [storyThreadChannels.update, { ...base, patch: { title: 'Atualizado' } }],
      [storyThreadChannels.setStatus, { ...base, status: 'active' }],
      [storyThreadChannels.resolve, base],
      [storyThreadChannels.abandon, base],
      [storyThreadChannels.reopen, base],
      [storyThreadChannels.archive, base],
      [storyThreadChannels.restore, base],
    ] as const) {
      expect(await invoke(channel)(event(42), input)).toMatchObject({ ok: true });
    }
    expect(service.calls).toEqual([
      'create',
      'get',
      'list',
      'listTargets',
      'update',
      'setStatus',
      'resolve',
      'abandon',
      'reopen',
      'archive',
      'restore',
    ]);
    service.failure = new AppError('INVALID_THREAD_STATE', 'Ação indisponível.');
    expect(await invoke(storyThreadChannels.reopen)(event(42), base)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_THREAD_STATE' },
    });
    unregister();
    expect(handlers.size).toBe(0);
  });
});

class FakeThreadService {
  public calls: string[] = [];
  public failure: AppError | null = null;
  public create() {
    return this.value('create');
  }
  public get() {
    return this.value('get');
  }
  public list() {
    this.calls.push('list');
    return { items: [], nextCursor: null, total: 0 };
  }
  public listTargets() {
    this.calls.push('listTargets');
    return { items: [], nextCursor: null };
  }
  public update() {
    return this.value('update');
  }
  public setStatus() {
    return this.value('setStatus');
  }
  public resolve() {
    return this.value('resolve');
  }
  public abandon() {
    return this.value('abandon');
  }
  public reopen() {
    return this.value('reopen');
  }
  public archive() {
    return this.value('archive');
  }
  public restore() {
    return this.value('restore');
  }
  private value(action: string) {
    this.calls.push(action);
    if (this.failure !== null) throw this.failure;
    return {
      thread: {
        id,
        campaignId,
        title: 'Fio',
        description: null,
        threadType: 'promise',
        status: 'open',
        statusBeforeArchive: null,
        originKind: 'manual',
        originSessionId: null,
        originSessionTitle: null,
        originReason: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      },
      links: [],
      transitions: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          threadId: id,
          fromStatus: null,
          toStatus: 'open',
          reason: null,
          sessionId: null,
          sessionTitle: null,
          occurredAt: timestamp,
        },
      ],
    };
  }
}

function event(senderId: number): IpcMainInvokeEvent {
  const frame = {};
  return { sender: { id: senderId, mainFrame: frame }, senderFrame: frame } as never;
}

function ipc(handlers: Map<string, Handler>): IpcMain {
  return {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as never;
}
