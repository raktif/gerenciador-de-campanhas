import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { relationshipViewChannels } from '../../src/core/contracts/ipc-channels';
import { registerRelationshipViewIpcHandlers } from '../../src/main/ipc/relationship-view-handlers';
import type { RelationshipViewService } from '../../src/main/services/relationship-view-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const ids = {
  campaign: '00000000-0000-4000-8000-000000000001',
  view: '00000000-0000-4000-8000-000000000002',
  entity: '00000000-0000-4000-8000-000000000003',
};

describe('handlers IPC de visualizações de Relações', () => {
  it('registra a superfície explícita, valida entrada/saída e remove handlers', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeService();
    const unregister = register(handlers, service);
    expect([...handlers.keys()].sort()).toEqual(Object.values(relationshipViewChannels).sort());

    const result = await required(handlers, relationshipViewChannels.get)(event(42), {
      campaignId: ids.campaign,
      viewType: 'campaign',
      sourceEntityId: null,
    });
    expect(result).toMatchObject({ ok: true, data: { view: { id: ids.view }, nodes: [] } });
    expect(service.lastInput).toMatchObject({ campaignId: ids.campaign });
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('rejeita remetente e propriedades extras antes do serviço', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeService();
    register(handlers, service);
    const input = {
      campaignId: ids.campaign,
      relationshipViewId: ids.view,
      revision: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const save = required(handlers, relationshipViewChannels.saveViewport);
    expect(await save(event(42), { ...input, rawChannel: true })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await save(event(7), input)).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(service.calls).toBe(0);
  });
});

class FakeService {
  public lastInput: unknown;
  public calls = 0;
  public get(input: unknown) {
    this.lastInput = input;
    this.calls += 1;
    return state();
  }
  public saveNodePosition() {
    this.calls += 1;
    return state();
  }
  public saveViewport() {
    this.calls += 1;
    return state();
  }
  public autoLayout() {
    this.calls += 1;
    return state();
  }
  public resetLayout() {
    this.calls += 1;
    return state();
  }
}

function state() {
  const timestamp = '2026-11-11T12:00:00.000Z';
  return {
    view: {
      id: ids.view,
      campaignId: ids.campaign,
      name: 'Mapa principal',
      viewType: 'campaign' as const,
      sourceEntityId: null,
      isDefault: true,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    },
    nodes: [],
  };
}

function register(handlers: Map<string, CapturedHandler>, service: FakeService) {
  const ipcMain = {
    handle: (channel: string, handler: CapturedHandler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
  return registerRelationshipViewIpcHandlers(ipcMain, {
    service: service as unknown as RelationshipViewService,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  });
}

function event(senderId: number): IpcMainInvokeEvent {
  const mainFrame = {};
  return {
    sender: { id: senderId, mainFrame },
    senderFrame: mainFrame,
  } as unknown as IpcMainInvokeEvent;
}

function required(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`Handler não registrado: ${channel}`);
  return handler;
}
