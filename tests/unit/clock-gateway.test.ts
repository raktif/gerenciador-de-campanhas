import { describe, expect, it } from 'vitest';
import { clockChannels } from '../../src/core/contracts/ipc-channels';
import { createCampaignManagerGateway } from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';

describe('gateway tipado de Relógios', () => {
  it('valida entradas e encaminha apenas os canais definidos', async () => {
    const calls: { channel: string; input: unknown }[] = [];
    const gateway = createCampaignManagerGateway((channel, input) => {
      calls.push({ channel, input });
      return Promise.resolve({ ok: true, data: null, requestId: 'test' });
    });
    await gateway.clocks.create({
      campaignId,
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
      name: 'Objetivo',
      clockType: 'countdown',
      segmentsTotal: 4,
      segmentsFilled: 2,
      entityId: '20000000-0000-4000-8000-000000000001',
      consequence: 'A consequência do objetivo.',
    });
    await gateway.clocks.get({ campaignId, id });
    await gateway.clocks.list({ campaignId, status: 'completed' });
    await gateway.clocks.sourceOptions({ campaignId, originKind: 'document' });
    await gateway.clocks.update({
      campaignId,
      id,
      revision: 1,
      patch: { segmentsFilled: 4 },
      generateEvent: false,
    });
    await gateway.clocks.complete({ campaignId, id, revision: 2, generateEvent: true });
    expect(calls.map(({ channel }) => channel).sort()).toEqual(Object.values(clockChannels).sort());
    expect(() =>
      gateway.clocks.create({
        campaignId,
        idempotencyKey: '30000000-0000-4000-8000-000000000004',
        name: 'Total inválido',
        clockType: 'progress',
        segmentsTotal: 5,
      } as never),
    ).toThrow();
    expect(() =>
      gateway.clocks.update({
        campaignId,
        id,
        revision: 1,
        patch: { status: 'inactive' },
      } as never),
    ).toThrow();
    expect(calls).toHaveLength(6);
  });
});
