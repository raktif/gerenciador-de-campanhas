import { describe, expect, it } from 'vitest';
import { timelineChannels } from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
} from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';

describe('gateway do preload de cronologia', () => {
  it('exp\u00f5e somente as consultas aprovadas e normaliza a entrada', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(Object.keys(gateway.timeline).sort()).toEqual(['listCampaign', 'listEntity']);
    expect('ipcRenderer' in gateway).toBe(false);
    await gateway.timeline.listCampaign({ campaignId });
    await gateway.timeline.listEntity({ campaignId, entityId, filters: { archived: true } });
    expect(invocations).toEqual([
      {
        channel: timelineChannels.listCampaign,
        input: { campaignId },
      },
      {
        channel: timelineChannels.listEntity,
        input: { campaignId, entityId, filters: { archived: true } },
      },
    ]);
  });
  it('rejeita entrada inv\u00e1lida antes de IPC', () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(() => gateway.timeline.listEntity({ campaignId, entityId, limit: 101 })).toThrow();
    expect(invocations).toHaveLength(0);
  });
});
interface Invocation {
  channel: string;
  input: unknown;
}
function invoker(invocations: Invocation[]): IpcInvoker {
  return (channel, input) => {
    invocations.push({ channel, input });
    return Promise.resolve({ ok: true, data: null, requestId: 'test' });
  };
}
