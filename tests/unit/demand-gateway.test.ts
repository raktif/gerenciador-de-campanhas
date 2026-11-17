import { describe, expect, it } from 'vitest';
import { demandChannels } from '../../src/core/contracts/ipc-channels';
import { createCampaignManagerGateway } from '../../src/preload/gateways/campaign-manager-gateway';
const id = '10000000-0000-4000-8000-000000000001';
describe('3B.3 gateway Demandas', () => {
  it('expõe apenas o contrato tipado e rejeita alteração canônica/IDs inválidos antes de IPC', async () => {
    const calls: string[] = [];
    const g = createCampaignManagerGateway((channel) => {
      calls.push(channel);
      return Promise.resolve({ ok: true, data: null, requestId: 'test' });
    }).demands;
    const base = { campaignId: id, id, revision: 1 };
    const content = {
      title: 'Título',
      need: 'Need',
      summary: '',
      obstacle: '',
      risks: '',
      urgency: 'low' as const,
      requesterEntityId: id,
      links: [],
    };
    await g.suggestion({ campaignId: id, signalId: id });
    await g.accept({ campaignId: id, signalId: id, signalRevision: 1, content });
    await g.get({ campaignId: id, id });
    await g.list({ campaignId: id });
    await g.targets({ campaignId: id, targetType: 'entity' });
    await g.update({ ...base, content });
    await g.transform({ ...base, content, idempotencyKey: id, confirmed: true });
    await g.transition({ ...base, action: 'resolve', confirmed: true });
    await g.sourceLocks({ campaignId: id, id });
    expect(calls.sort()).toEqual(Object.values(demandChannels).sort());
    expect(() => g.get({ campaignId: 'invalid', id })).toThrow();
    expect(() => g.update({ ...base, content, canonState: 'accepted' } as never)).toThrow();
    expect(calls).toHaveLength(9);
  });
});
