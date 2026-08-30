import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type {
  CreateEntityTypeInput,
  EntityType,
  EntityTypePageRequest,
} from '../../src/core/contracts/entity-types';
import { entityTypeChannels } from '../../src/core/contracts/ipc-channels';
import { registerEntityTypeIpcHandlers } from '../../src/main/ipc/entity-type-handlers';
import type { EntityTypeService } from '../../src/main/services/entity-type-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de tipos de entidade', () => {
  it('registra somente os canais explícitos e remove todos ao encerrar', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = registerEntityTypeIpcHandlers(createIpcMain(handlers), {
      service: new FakeEntityTypeService() as unknown as EntityTypeService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    expect([...handlers.keys()].sort()).toEqual(Object.values(entityTypeChannels).sort());
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('normaliza criação e aplica padrões de paginação', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityTypeService();
    registerEntityTypeIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as EntityTypeService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    await requireHandler(handlers, entityTypeChannels.create)(createEvent(42), {
      campaignId,
      name: '  Personagens  ',
      singularName: '  Personagem  ',
      slug: 'personagens',
    });
    await requireHandler(handlers, entityTypeChannels.list)(createEvent(42), { campaignId });

    expect(service.lastCreateInput).toEqual({
      campaignId,
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens',
      sortOrder: 0,
    });
    expect(service.lastListRequest).toEqual({
      campaignId,
      limit: 50,
      filters: { isArchived: false },
      sort: 'sortOrder',
      order: 'asc',
    });
  });

  it('encaminha consulta, edição, arquivamento e restauração', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityTypeService();
    registerEntityTypeIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as EntityTypeService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const identity = { campaignId, id: entityTypeId };
    const lifecycle = { ...identity, revision: 1 };

    await requireHandler(handlers, entityTypeChannels.get)(createEvent(42), identity);
    await requireHandler(handlers, entityTypeChannels.update)(createEvent(42), {
      ...lifecycle,
      patch: { name: 'Protagonistas' },
    });
    await requireHandler(handlers, entityTypeChannels.archive)(createEvent(42), lifecycle);
    await requireHandler(handlers, entityTypeChannels.restore)(createEvent(42), lifecycle);

    expect(service.calledOperations).toEqual(['get', 'update', 'archive', 'restore']);
  });

  it('rejeita entrada inválida e renderer não autorizado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityTypeService();
    registerEntityTypeIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as EntityTypeService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const handler = requireHandler(handlers, entityTypeChannels.create);
    const invalidInput = {
      campaignId,
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'Slug Inválido',
    };

    expect(await handler(createEvent(42), invalidInput)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await handler(createEvent(99), { ...invalidInput, slug: 'personagens' })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
  });
});

class FakeEntityTypeService {
  public lastCreateInput: CreateEntityTypeInput | null = null;
  public lastListRequest: EntityTypePageRequest | null = null;
  public readonly calledOperations: string[] = [];

  public create(input: CreateEntityTypeInput): EntityType {
    this.lastCreateInput = input;
    return createEntityType({
      name: input.name,
      singularName: input.singularName,
      slug: input.slug,
    });
  }

  public get(): EntityType {
    this.calledOperations.push('get');
    return createEntityType();
  }

  public list(request: EntityTypePageRequest): {
    items: EntityType[];
    nextCursor: null;
    total: number;
  } {
    this.lastListRequest = request;
    return { items: [createEntityType()], nextCursor: null, total: 1 };
  }

  public update(): EntityType {
    this.calledOperations.push('update');
    return createEntityType({ revision: 2 });
  }

  public archive(): EntityType {
    this.calledOperations.push('archive');
    return createEntityType({ isArchived: true, revision: 2 });
  }

  public restore(): EntityType {
    this.calledOperations.push('restore');
    return createEntityType({ revision: 2 });
  }
}

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';

function createEntityType(overrides: Partial<EntityType> = {}): EntityType {
  return {
    id: entityTypeId,
    campaignId,
    packId: null,
    name: 'Personagens',
    singularName: 'Personagem',
    slug: 'personagens',
    description: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    isArchived: false,
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
    revision: 1,
    ...overrides,
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
