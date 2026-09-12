import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/contracts/entities';
import { relationshipChannels } from '../../src/core/contracts/ipc-channels';
import type {
  Relationship,
  RelationshipNeighborhoodInput,
} from '../../src/core/contracts/relationships';
import { registerRelationshipIpcHandlers } from '../../src/main/ipc/relationship-handlers';
import type { RelationshipService } from '../../src/main/services/relationship-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';

describe('handlers IPC de relações', () => {
  it('registra todos os canais e normaliza a vizinhança', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeService();
    const unregister = registerRelationshipIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as RelationshipService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    expect([...handlers.keys()].sort()).toEqual(Object.values(relationshipChannels).sort());
    const response = await requireHandler(handlers, relationshipChannels.neighborhood)(event(42), {
      campaignId,
      entityId,
      depth: 2,
    });
    expect(response).toMatchObject({ ok: true, data: { rootEntityId: entityId } });
    expect(service.input).toMatchObject({
      depth: 2,
      maxEntities: 100,
      maxRelationships: 200,
      filters: { relationshipTypeIds: [], canonStates: [], knowledgeStates: [], visibilities: [] },
    });
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('rejeita profundidade inválida e remetente não autorizado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    registerRelationshipIpcHandlers(createIpcMain(handlers), {
      service: new FakeService() as unknown as RelationshipService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const handler = requireHandler(handlers, relationshipChannels.neighborhood);
    expect(await handler(event(42), { campaignId, entityId, depth: 4 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await handler(event(99), { campaignId, entityId })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
  });
});

class FakeService {
  public input: RelationshipNeighborhoodInput | null = null;
  public neighborhood(input: RelationshipNeighborhoodInput) {
    this.input = input;
    return {
      rootEntityId: entityId,
      nodes: [
        { entity: createEntity(), depth: 0, pathEntityIds: [entityId], viaRelationshipId: null },
      ],
      relationships: [] as Relationship[],
      truncated: false,
    };
  }
}
function createEntity(): Entity {
  return {
    id: entityId,
    campaignId,
    entityTypeId: '10000000-0000-4000-8000-000000000001',
    name: 'Gorel',
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: '2026-09-02T12:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
    archivedAt: null,
    revision: 1,
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
