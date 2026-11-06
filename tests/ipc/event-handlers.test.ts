import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type { CreateEventInput, EventDetails } from '../../src/core/contracts/events';
import { eventChannels } from '../../src/core/contracts/ipc-channels';
import { AppError } from '../../src/core/errors/app-error';
import { registerEventIpcHandlers } from '../../src/main/ipc/event-handlers';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const eventId = '60000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-11T12:00:00.000Z';

describe('handlers IPC de eventos', () => {
  it('registra, valida, encaminha e remove apenas os seis canais de eventos', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEventService();
    const unregister = registerEventIpcHandlers(ipc(handlers), dependencies(service));
    expect([...handlers.keys()].sort()).toEqual(Object.values(eventChannels).sort());

    const identity = { campaignId, id: eventId };
    const lifecycle = { ...identity, revision: 1 };
    await handler(handlers, eventChannels.create)(event(42), {
      campaignId,
      title: '  A ponte desaba  ',
      originKind: 'session',
      sourceSessionId: sessionId,
      links: [{ entityId, role: 'location' }],
    });
    await handler(handlers, eventChannels.get)(event(42), identity);
    await handler(handlers, eventChannels.list)(event(42), { campaignId });
    await handler(handlers, eventChannels.update)(event(42), {
      ...lifecycle,
      patch: { eventOrder: 2 },
    });
    await handler(handlers, eventChannels.archive)(event(42), lifecycle);
    await handler(handlers, eventChannels.restore)(event(42), lifecycle);

    expect(service.createInput).toMatchObject({
      title: 'A ponte desaba',
      eventOrder: 0,
      sourceSessionId: sessionId,
      links: [{ entityId, role: 'location' }],
    });
    expect(service.listInput).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'eventOrder',
      order: 'asc',
    });
    expect(service.calls).toEqual(['create', 'get', 'list', 'update', 'archive', 'restore']);
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('bloqueia entrada e remetente antes do servi\u00e7o e normaliza falhas de dom\u00ednio e sa\u00edda', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEventService();
    registerEventIpcHandlers(ipc(handlers), dependencies(service));
    const create = handler(handlers, eventChannels.create);
    expect(await create(event(42), { campaignId, title: '' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.calls).toEqual([]);
    expect(await create(event(99), { campaignId, title: 'V\u00e1lido' })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(service.calls).toEqual([]);
    service.failure = new AppError('EVENT_NOT_FOUND', 'Ausente.');
    expect(
      await handler(handlers, eventChannels.get)(event(42), { campaignId, id: eventId }),
    ).toMatchObject({
      ok: false,
      error: { code: 'EVENT_NOT_FOUND' },
    });
    service.failure = null;
    service.invalidOutput = true;
    expect(
      await handler(handlers, eventChannels.get)(event(42), { campaignId, id: eventId }),
    ).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});

class FakeEventService {
  public createInput: CreateEventInput | null = null;
  public listInput: unknown = null;
  public readonly calls: string[] = [];
  public failure: AppError | null = null;
  public invalidOutput = false;

  public create(input: CreateEventInput): EventDetails {
    this.createInput = input;
    return this.result('create');
  }
  public get(): EventDetails {
    return this.result('get');
  }
  public list(input: unknown) {
    this.calls.push('list');
    this.listInput = input;
    return { items: [eventDetails().event], nextCursor: null, total: 1 };
  }
  public update(): EventDetails {
    return this.result('update');
  }
  public archive(): EventDetails {
    return this.result('archive');
  }
  public restore(): EventDetails {
    return this.result('restore');
  }
  private result(operation: string): EventDetails {
    this.calls.push(operation);
    if (this.failure !== null) throw this.failure;
    return (this.invalidOutput ? { invalid: true } : eventDetails()) as EventDetails;
  }
}

function eventDetails(): EventDetails {
  return {
    event: {
      id: eventId,
      campaignId,
      sessionId: null,
      title: 'A ponte desaba',
      descriptionMarkdown: null,
      eventOrder: 0,
      occurredAtLabel: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    },
    links: [],
  };
}

function dependencies(service: FakeEventService) {
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
function handler(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const registered = handlers.get(channel);
  if (registered === undefined) throw new Error(`Handler n\u00e3o registrado: ${channel}`);
  return registered;
}
