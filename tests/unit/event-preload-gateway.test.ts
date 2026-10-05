import { describe, expect, it } from 'vitest';
import { eventChannels } from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
} from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const eventId = '60000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';

describe('gateway do preload de eventos', () => {
  it('exp\u00f5e somente as seis opera\u00e7\u00f5es aprovadas e mapeia seus canais', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(Object.keys(gateway.events).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'restore',
      'update',
    ]);
    expect('ipcRenderer' in gateway).toBe(false);
    expect('invoke' in gateway).toBe(false);

    await gateway.events.create({
      campaignId,
      title: '  A ponte desaba  ',
      links: [{ entityId, role: 'location' }],
    });
    await gateway.events.get({ campaignId, id: eventId });
    await gateway.events.list({ campaignId });
    await gateway.events.update({
      campaignId,
      id: eventId,
      revision: 1,
      patch: { eventOrder: 2 },
    });
    await gateway.events.archive({ campaignId, id: eventId, revision: 1 });
    await gateway.events.restore({ campaignId, id: eventId, revision: 1 });

    expect(invocations.map(({ channel }) => channel)).toEqual(Object.values(eventChannels));
    expect(invocations[0]?.input).toMatchObject({
      title: 'A ponte desaba',
      eventOrder: 0,
      links: [{ entityId, role: 'location' }],
    });
    expect(invocations[2]?.input).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'eventOrder',
      order: 'asc',
    });
  });

  it('rejeita a entrada inv\u00e1lida antes de invocar IPC', () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(() => gateway.events.create({ campaignId, title: ' ' })).toThrow();
    expect(() =>
      gateway.events.update({ campaignId, id: eventId, revision: 1, patch: {} }),
    ).toThrow();
    expect(() =>
      gateway.events.create({
        campaignId,
        title: 'Evento',
        links: [
          { entityId, role: 'participant' },
          { entityId, role: 'participant' },
        ],
      }),
    ).toThrow();
    expect(() =>
      gateway.events.create({
        campaignId,
        title: 'Evento',
        links: [{ entityId, role: 'participant', sortOrder: 0 }],
      } as never),
    ).toThrow();
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
    return Promise.resolve({ ok: true, data: null, requestId: 'test-request' });
  };
}
