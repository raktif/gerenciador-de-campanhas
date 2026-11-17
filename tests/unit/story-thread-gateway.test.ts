import { describe, expect, it } from 'vitest';
import { storyThreadChannels } from '../../src/core/contracts/ipc-channels';
import { createCampaignManagerGateway } from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';

describe('gateway tipado de Fios Abertos', () => {
  it('valida entradas e encaminha os canais explicitamente suportados', async () => {
    const calls: { channel: string; input: unknown }[] = [];
    const gateway = createCampaignManagerGateway((channel, input) => {
      calls.push({ channel, input });
      return Promise.resolve({ ok: true, data: null, requestId: 'test' });
    });
    await gateway.storyThreads.create({ campaignId, title: 'Promessa', threadType: 'promise' });
    await gateway.storyThreads.get({ campaignId, id });
    await gateway.storyThreads.list({ campaignId });
    await gateway.storyThreads.listTargets({ campaignId, targetType: 'entity' });
    await gateway.storyThreads.update({
      campaignId,
      id,
      revision: 1,
      patch: { title: 'Revisado' },
    });
    const lifecycle = { campaignId, id, revision: 1 };
    await gateway.storyThreads.setStatus({ ...lifecycle, status: 'active' });
    await gateway.storyThreads.resolve(lifecycle);
    await gateway.storyThreads.abandon(lifecycle);
    await gateway.storyThreads.reopen(lifecycle);
    await gateway.storyThreads.archive(lifecycle);
    await gateway.storyThreads.restore(lifecycle);
    expect(calls.map(({ channel }) => channel).sort()).toEqual(
      Object.values(storyThreadChannels).sort(),
    );
    expect(() =>
      gateway.storyThreads.create({ campaignId, title: 'Inválido', threadType: 'clock' } as never),
    ).toThrow();
    expect(() =>
      gateway.storyThreads.setStatus({ ...lifecycle, status: 'archived' } as never),
    ).toThrow();
    expect(() =>
      gateway.storyThreads.update({
        campaignId,
        id,
        revision: 1,
        patch: { title: 'Ok' },
        status: 'resolved',
      } as never),
    ).toThrow();
    expect(calls).toHaveLength(11);
  });
});
