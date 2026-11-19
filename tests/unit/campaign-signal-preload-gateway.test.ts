import { describe, expect, it } from 'vitest';
import { campaignSignalChannels } from '../../src/core/contracts/ipc-channels';
import { createCampaignManagerGateway } from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';

describe('gateway de sinais do preload', () => {
  it('expõe ações tipadas e valida cada entrada antes do IPC', async () => {
    const calls: { channel: string; input: unknown }[] = [];
    const gateway = createCampaignManagerGateway((channel, input) => {
      calls.push({ channel, input });
      return Promise.resolve({ ok: true, data: null, requestId: 'test' });
    });

    expect(Object.keys(gateway.campaignSignals).sort()).toEqual([
      'dismiss',
      'getContradictionReview',
      'list',
      'listForWorldInMotion',
      'markContradictionException',
      'reactivate',
      'recalculate',
      'review',
      'snooze',
    ]);
    await gateway.campaignSignals.list({ campaignId });
    await gateway.campaignSignals.listForWorldInMotion({ campaignId });
    await gateway.campaignSignals.recalculate({ campaignId });
    await gateway.campaignSignals.review({ campaignId, id, revision: 1 });
    await gateway.campaignSignals.dismiss({ campaignId, id, revision: 1 });
    await gateway.campaignSignals.reactivate({ campaignId, id, revision: 1 });
    await gateway.campaignSignals.snooze({
      campaignId,
      id,
      revision: 1,
      dismissedUntil: '2026-11-15T14:00:00.000Z',
    });
    await gateway.campaignSignals.markContradictionException({ campaignId, id, revision: 1 });
    await gateway.campaignSignals.getContradictionReview({ campaignId, id, revision: 1 });
    expect(calls.map((call) => call.channel).sort()).toEqual(
      Object.values(campaignSignalChannels).sort(),
    );
    expect(() =>
      gateway.campaignSignals.getContradictionReview({ campaignId, id, revision: 0 }),
    ).toThrow();
    expect(() =>
      gateway.campaignSignals.snooze({
        campaignId,
        id,
        revision: 1,
        dismissedUntil: 'amanhã',
      }),
    ).toThrow();
    expect(() =>
      gateway.campaignSignals.review({ campaignId, id, revision: 1, extra: true } as never),
    ).toThrow();
    expect(() =>
      gateway.campaignSignals.markContradictionException({
        campaignId,
        id,
        revision: 1,
        extra: true,
      } as never),
    ).toThrow();
    expect(() =>
      gateway.campaignSignals.listForWorldInMotion({ campaignId: 'inválido' }),
    ).toThrow();
    expect(calls).toHaveLength(Object.keys(campaignSignalChannels).length);
  });
});
