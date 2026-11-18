import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { clockChannels } from '../../src/core/contracts/ipc-channels';
import { AppError } from '../../src/core/errors/app-error';
import { registerClockIpcHandlers } from '../../src/main/ipc/clock-handlers';
import { TestLogger } from '../helpers/test-logger';

type Handler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const now = '2026-11-16T14:00:00.000Z';

describe('fronteira IPC de Relógios', () => {
  it('valida remetente e contratos, expõe somente operações autorizadas e remove canais', async () => {
    const handlers = new Map<string, Handler>();
    const service = new FakeClockService();
    const unregister = registerClockIpcHandlers(ipc(handlers), {
      service: service as never,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    expect([...handlers.keys()].sort()).toEqual(Object.values(clockChannels).sort());
    const invoke = (channel: string): Handler => {
      const handler = handlers.get(channel);
      if (handler === undefined) throw new Error(`Canal não registrado: ${channel}`);
      return handler;
    };
    const base = { campaignId, id, revision: 1 };
    expect(
      await invoke(clockChannels.create)(event(12), {
        campaignId,
        name: 'Bloqueado',
        clockType: 'progress',
        segmentsTotal: 4,
      }),
    ).toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
    expect(
      await invoke(clockChannels.create)(event(42), {
        campaignId,
        name: 'Total livre',
        clockType: 'progress',
        segmentsTotal: 5,
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    for (const [channel, input] of [
      [
        clockChannels.create,
        {
          campaignId,
          idempotencyKey: '30000000-0000-4000-8000-000000000005',
          name: 'Relógio',
          clockType: 'countdown',
          segmentsTotal: 4,
          entityId,
          consequence: 'A consequência.',
        },
      ],
      [clockChannels.get, { campaignId, id }],
      [clockChannels.list, { campaignId }],
      [clockChannels.sourceOptions, { campaignId, originKind: 'document' }],
      [clockChannels.update, { ...base, patch: { segmentsFilled: 2 } }],
      [clockChannels.complete, { ...base, generateEvent: false }],
    ] as const)
      expect(await invoke(channel)(event(42), input), channel).toMatchObject({ ok: true });

    expect(service.calls).toEqual(['create', 'get', 'list', 'sourceOptions', 'update', 'complete']);
    service.failure = new AppError('INVALID_CLOCK_STATE', 'Relógio concluído.');
    expect(
      await invoke(clockChannels.update)(event(42), {
        ...base,
        patch: { name: 'Alteração' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_CLOCK_STATE' } });
    service.failure = new AppError(
      'CLOCK_ENTITY_ARCHIVED',
      'A entidade arquivada não pode receber Evento.',
    );
    expect(
      await invoke(clockChannels.complete)(event(42), { ...base, generateEvent: true }),
    ).toMatchObject({ ok: false, error: { code: 'CLOCK_ENTITY_ARCHIVED' } });
    expect(service.calls.slice(-1)).toEqual(['complete']);
    unregister();
    expect(handlers.size).toBe(0);
  });
});

class FakeClockService {
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
  public sourceOptions() {
    this.calls.push('sourceOptions');
    return [];
  }
  public update() {
    return this.value('update');
  }
  public complete() {
    return this.value('complete');
  }
  private value(action: string) {
    this.calls.push(action);
    if (this.failure !== null) throw this.failure;
    return {
      id,
      campaignId,
      name: 'Relógio',
      description: null,
      consequence: 'A consequência.',
      clockType: 'progress',
      segmentsTotal: 4,
      segmentsFilled: 0,
      status: 'active',
      entityId,
      entityName: 'Entidade',
      entityArchivedAt: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      sessionId: null,
      generatedEventId: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
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
