import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type {
  Campaign,
  CampaignPageRequest,
  CreateCampaignInput,
} from '../../src/core/contracts/campaigns';
import { campaignChannels } from '../../src/core/contracts/ipc-channels';
import { registerCampaignIpcHandlers } from '../../src/main/ipc/campaign-handlers';
import type { CampaignService } from '../../src/main/services/campaign-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de campanhas', () => {
  it('registra apenas os canais explícitos e remove todos ao encerrar', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = registerCampaignIpcHandlers(createIpcMain(handlers), {
      service: new FakeCampaignService() as unknown as CampaignService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    expect([...handlers.keys()].sort()).toEqual(Object.values(campaignChannels).sort());
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('valida e normaliza a entrada antes de criar uma campanha', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeCampaignService();
    registerCampaignIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as CampaignService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    const handler = requireHandler(handlers, campaignChannels.create);
    const result = await handler(createEvent(42), { name: '  Ethéria  ' });

    expect(service.lastCreateInput).toEqual({ name: 'Ethéria' });
    expect(result).toMatchObject({ ok: true, data: createCampaign() });
  });

  it('aplica padrões de paginação antes de listar', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeCampaignService();
    registerCampaignIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as CampaignService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });

    const result = await requireHandler(handlers, campaignChannels.list)(createEvent(42), {});

    expect(service.lastListRequest).toEqual({
      limit: 50,
      filters: { statuses: ['active'] },
      sort: 'updatedAt',
      order: 'desc',
    });
    expect(result).toMatchObject({
      ok: true,
      data: { items: [createCampaign()], nextCursor: null, total: 1 },
    });
  });

  it('encaminha consulta, edição e transições aos casos de uso corretos', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeCampaignService();
    registerCampaignIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as CampaignService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const identity = { id: createCampaign().id };
    const lifecycle = { ...identity, revision: 1 };

    await requireHandler(handlers, campaignChannels.get)(createEvent(42), identity);
    await requireHandler(handlers, campaignChannels.update)(createEvent(42), {
      ...lifecycle,
      patch: { summary: 'Atualizada.' },
    });
    await requireHandler(handlers, campaignChannels.archive)(createEvent(42), lifecycle);
    await requireHandler(handlers, campaignChannels.restore)(createEvent(42), lifecycle);
    await requireHandler(handlers, campaignChannels.moveToTrash)(createEvent(42), lifecycle);

    expect(service.calledOperations).toEqual([
      'get',
      'update',
      'archive',
      'restore',
      'moveToTrash',
    ]);
  });

  it('rejeita entrada inválida e renderer não autorizado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeCampaignService();
    registerCampaignIpcHandlers(createIpcMain(handlers), {
      service: service as unknown as CampaignService,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const handler = requireHandler(handlers, campaignChannels.create);

    expect(await handler(createEvent(42), { name: '   ' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.lastCreateInput).toBeNull();
    expect(await handler(createEvent(99), { name: 'Ethéria' })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
  });
});

class FakeCampaignService {
  public lastCreateInput: CreateCampaignInput | null = null;
  public lastListRequest: CampaignPageRequest | null = null;
  public readonly calledOperations: string[] = [];

  public create(input: CreateCampaignInput): Campaign {
    this.calledOperations.push('create');
    this.lastCreateInput = input;
    return createCampaign({ name: input.name });
  }

  public get(): Campaign {
    this.calledOperations.push('get');
    return createCampaign();
  }

  public list(request: CampaignPageRequest): {
    items: Campaign[];
    nextCursor: null;
    total: number;
  } {
    this.calledOperations.push('list');
    this.lastListRequest = request;
    return { items: [createCampaign()], nextCursor: null, total: 1 };
  }

  public update(): Campaign {
    this.calledOperations.push('update');
    return createCampaign();
  }

  public archive(): Campaign {
    this.calledOperations.push('archive');
    return createCampaign({ status: 'archived', archivedAt: '2026-08-27T13:00:00.000Z' });
  }

  public restore(): Campaign {
    this.calledOperations.push('restore');
    return createCampaign();
  }

  public moveToTrash(): Campaign {
    this.calledOperations.push('moveToTrash');
    return createCampaign({ status: 'deleted', archivedAt: '2026-08-27T13:00:00.000Z' });
  }
}

function createCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Ethéria',
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    imagePath: null,
    status: 'active',
    createdAt: '2026-08-27T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
    archivedAt: null,
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
