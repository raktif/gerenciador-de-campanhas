import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type {
  CreateRelationshipTypeInput,
  RelationshipType,
  RelationshipTypePageRequest,
} from '../../src/core/contracts/relationship-types';
import { relationshipTypeChannels } from '../../src/core/contracts/ipc-channels';
import { registerRelationshipTypeIpcHandlers } from '../../src/main/ipc/relationship-type-handlers';
import type { RelationshipTypeService } from '../../src/main/services/relationship-type-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const relationshipTypeId = '20000000-0000-4000-8000-000000000001';

describe('handlers IPC de tipos de relação', () => {
  it('registra e remove somente os canais explícitos', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = registerRelationshipTypeIpcHandlers(createIpcMain(handlers), {
      service: new FakeService() as unknown as RelationshipTypeService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    expect([...handlers.keys()].sort()).toEqual(Object.values(relationshipTypeChannels).sort());
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('normaliza criação e paginação e encaminha todos os casos de uso', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeService();
    registerRelationshipTypeIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as RelationshipTypeService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    await requireHandler(handlers, relationshipTypeChannels.create)(event(42), {
      campaignId,
      name: '  Trabalha em  ',
      slug: 'trabalha-em',
    });
    await requireHandler(handlers, relationshipTypeChannels.list)(event(42), { campaignId });
    const identity = { campaignId, id: relationshipTypeId };
    const lifecycle = { ...identity, revision: 1 };
    await requireHandler(handlers, relationshipTypeChannels.get)(event(42), identity);
    await requireHandler(handlers, relationshipTypeChannels.update)(event(42), {
      ...lifecycle,
      patch: { inverseName: 'Emprega' },
    });
    await requireHandler(handlers, relationshipTypeChannels.archive)(event(42), lifecycle);
    await requireHandler(handlers, relationshipTypeChannels.restore)(event(42), lifecycle);

    expect(service.lastCreate).toMatchObject({
      name: 'Trabalha em',
      inverseName: null,
      isSymmetric: false,
      sortOrder: 0,
    });
    expect(service.lastList).toEqual({
      campaignId,
      limit: 50,
      filters: { isArchived: false },
      sort: 'sortOrder',
      order: 'asc',
    });
    expect(service.calls).toEqual(['get', 'update', 'archive', 'restore']);
  });

  it('rejeita dados inválidos e remetente não autorizado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeService();
    registerRelationshipTypeIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as RelationshipTypeService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const handler = requireHandler(handlers, relationshipTypeChannels.create);
    expect(
      await handler(event(42), { campaignId, name: 'Conhece', slug: 'Slug Inválido' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await handler(event(99), { campaignId, name: 'Conhece', slug: 'conhece' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
  });
});

class FakeService {
  public lastCreate: CreateRelationshipTypeInput | null = null;
  public lastList: RelationshipTypePageRequest | null = null;
  public readonly calls: string[] = [];
  public create(input: CreateRelationshipTypeInput): RelationshipType {
    this.lastCreate = input;
    return createType({ name: input.name, slug: input.slug });
  }
  public list(request: RelationshipTypePageRequest) {
    this.lastList = request;
    return { items: [createType()], nextCursor: null, total: 1 };
  }
  public get(): RelationshipType {
    this.calls.push('get');
    return createType();
  }
  public update(): RelationshipType {
    this.calls.push('update');
    return createType({ revision: 2 });
  }
  public archive(): RelationshipType {
    this.calls.push('archive');
    return createType({ isArchived: true, revision: 2 });
  }
  public restore(): RelationshipType {
    this.calls.push('restore');
    return createType({ revision: 2 });
  }
}
function createType(overrides: Partial<RelationshipType> = {}): RelationshipType {
  return {
    id: relationshipTypeId,
    campaignId,
    packId: null,
    name: 'Conhece',
    slug: 'conhece',
    inverseName: null,
    description: null,
    semanticRole: null,
    isSymmetric: false,
    allowedSourceTypeIds: null,
    allowedTargetTypeIds: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
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
function event(senderId: number): IpcMainInvokeEvent {
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
