import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { timelineChannels } from '../../src/core/contracts/ipc-channels';
import type {
  TimelineCampaignRequest,
  TimelineEntityRequest,
  TimelinePageResult,
} from '../../src/core/contracts/timeline';
import { AppError } from '../../src/core/errors/app-error';
import { registerTimelineIpcHandlers } from '../../src/main/ipc/timeline-handlers';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';

describe('handlers IPC de cronologia', () => {
  it('registra, normaliza e remove os dois canais permitidos', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeTimelineService();
    const unregister = registerTimelineIpcHandlers(ipc(handlers), dependencies(service));
    expect([...handlers.keys()].sort()).toEqual(Object.values(timelineChannels).sort());
    await handler(handlers, timelineChannels.listCampaign)(event(42), { campaignId });
    await handler(handlers, timelineChannels.listEntity)(event(42), { campaignId, entityId });
    expect(service.campaignInput).toEqual({ campaignId, limit: 50, filters: { archived: false } });
    expect(service.entityInput).toEqual({
      campaignId,
      entityId,
      limit: 50,
      filters: { archived: false },
    });
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('bloqueia entrada/remetente e normaliza falhas de dom\u00ednio e sa\u00edda', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeTimelineService();
    registerTimelineIpcHandlers(ipc(handlers), dependencies(service));
    const listCampaign = handler(handlers, timelineChannels.listCampaign);
    expect(await listCampaign(event(42), { campaignId, extra: true })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await listCampaign(event(99), { campaignId })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    service.failure = new AppError('CAMPAIGN_NOT_FOUND', 'Ausente.');
    expect(await listCampaign(event(42), { campaignId })).toMatchObject({
      ok: false,
      error: { code: 'CAMPAIGN_NOT_FOUND' },
    });
    service.failure = null;
    service.invalidOutput = true;
    expect(await listCampaign(event(42), { campaignId })).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});

class FakeTimelineService {
  public campaignInput: TimelineCampaignRequest | null = null;
  public entityInput: TimelineEntityRequest | null = null;
  public failure: AppError | null = null;
  public invalidOutput = false;
  public listCampaign(input: TimelineCampaignRequest): TimelinePageResult {
    this.campaignInput = input;
    return this.result();
  }
  public listEntity(input: TimelineEntityRequest): TimelinePageResult {
    this.entityInput = input;
    return this.result();
  }
  private result(): TimelinePageResult {
    if (this.failure !== null) throw this.failure;
    return (
      this.invalidOutput ? { bad: true } : { items: [], nextCursor: null, total: 0 }
    ) as TimelinePageResult;
  }
}
function dependencies(service: FakeTimelineService) {
  return { service, logger: new TestLogger(), authorizedWebContentsId: 42 } as never;
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
