import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type {
  CreateEntityInput,
  Entity,
  EntityDetails,
  EntityPageRequest,
} from '../../src/core/contracts/entities';
import { entityChannels } from '../../src/core/contracts/ipc-channels';
import { registerEntityIpcHandlers } from '../../src/main/ipc/entity-handlers';
import type { EntityService } from '../../src/main/services/entity-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de entidades', () => {
  it('registra somente os canais explícitos e remove todos ao encerrar', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = registerEntityIpcHandlers(createIpcMain(handlers), {
      service: new FakeEntityService() as unknown as EntityService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    expect([...handlers.keys()].sort()).toEqual(Object.values(entityChannels).sort());
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('normaliza criação e aplica padrões de paginação', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityService();
    registerEntityIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as EntityService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    const created = await requireHandler(handlers, entityChannels.create)(createEvent(42), {
      campaignId,
      entityTypeId,
      name: '  Aris  ',
    });
    expect(created).toMatchObject({ ok: true });
    expect(service.lastCreateInput).toMatchObject({ campaignId, entityTypeId, name: 'Aris' });

    await requireHandler(handlers, entityChannels.list)(createEvent(42), { campaignId });
    expect(service.lastListRequest).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'name',
      order: 'asc',
    });
  });

  it('encaminha consulta, edição, arquivamento e restauração', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityService();
    registerEntityIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as EntityService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const identity = { campaignId, id: entityId };
    const lifecycle = { ...identity, revision: 1 };

    await requireHandler(handlers, entityChannels.get)(createEvent(42), identity);
    await requireHandler(handlers, entityChannels.update)(createEvent(42), {
      ...lifecycle,
      patch: { name: 'Aris, a Capitã' },
    });
    await requireHandler(handlers, entityChannels.archive)(createEvent(42), lifecycle);
    await requireHandler(handlers, entityChannels.restore)(createEvent(42), lifecycle);

    expect(service.calledOperations).toEqual(['get', 'update', 'archive', 'restore']);
  });

  it('rejeita entrada inválida e renderer não autorizado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityService();
    registerEntityIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as EntityService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const handler = requireHandler(handlers, entityChannels.create);
    const invalidInput = { campaignId, entityTypeId, name: '' };

    expect(await handler(createEvent(42), invalidInput)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await handler(createEvent(99), { campaignId, entityTypeId, name: 'Aris' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
  });
});

class FakeEntityService {
  public lastCreateInput: CreateEntityInput | null = null;
  public lastListRequest: EntityPageRequest | null = null;
  public readonly calledOperations: string[] = [];

  public create(input: CreateEntityInput): EntityDetails {
    this.lastCreateInput = input;
    return createEntityDetails({ name: input.name });
  }

  public get(): EntityDetails {
    this.calledOperations.push('get');
    return createEntityDetails();
  }

  public list(request: EntityPageRequest): { items: Entity[]; nextCursor: null; total: number } {
    this.lastListRequest = request;
    return { items: [createEntityDetails().entity], nextCursor: null, total: 1 };
  }

  public update(): EntityDetails {
    this.calledOperations.push('update');
    return createEntityDetails({ revision: 2 });
  }

  public archive(): EntityDetails {
    this.calledOperations.push('archive');
    return createEntityDetails({ archivedAt: '2026-08-28T13:00:00.000Z', revision: 2 });
  }

  public restore(): EntityDetails {
    this.calledOperations.push('restore');
    return createEntityDetails({ revision: 2 });
  }
}

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';

function createEntityDetails(overrides: Partial<Entity> = {}): EntityDetails {
  return {
    entity: {
      id: entityId,
      campaignId,
      entityTypeId,
      name: 'Aris',
      summary: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      archivedAt: null,
      revision: 1,
      ...overrides,
    },
    fieldValues: [],
  };
}

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

function requireHandler(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`Handler não registrado: ${channel}`);
  return handler;
}
