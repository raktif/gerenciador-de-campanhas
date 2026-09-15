import { describe, expect, it } from 'vitest';
import { inboxChannels } from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
} from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const inboxItemId = '80000000-0000-4000-8000-000000000001';

describe('gateway do preload da captura rápida', () => {
  it('expõe apenas a captura e encaminha entrada validada pelo canal aprovado', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(Object.keys(gateway.inbox)).toEqual([
      'capture',
      'get',
      'list',
      'beginReview',
      'dismiss',
      'archive',
      'restore',
    ]);
    expect('ipcRenderer' in gateway).toBe(false);
    expect('invoke' in gateway).toBe(false);

    await gateway.inbox.capture({ campaignId, sessionId, rawText: '  O sino tocou.  ' });

    expect(invocations).toEqual([
      {
        channel: inboxChannels.capture,
        input: { campaignId, sessionId, rawText: '  O sino tocou.  ' },
      },
    ]);
  });

  it('rejeita entrada inválida antes de invocar IPC', () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(() => gateway.inbox.capture({ campaignId, rawText: ' ' })).toThrow();
    expect(() =>
      gateway.inbox.capture({ campaignId, sessionId: 'sessão-inválida', rawText: 'Válido' }),
    ).toThrow();
    expect(invocations).toHaveLength(0);
  });
});

describe('operações de triagem no preload', () => {
  it('encaminha os seis métodos nos canais aprovados e valida schemas', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    const lifecycle = { campaignId, id: inboxItemId, revision: 1 };
    await gateway.inbox.get({ campaignId, id: inboxItemId });
    await gateway.inbox.list({ campaignId, filters: {} });
    await gateway.inbox.beginReview(lifecycle);
    await gateway.inbox.dismiss(lifecycle);
    await gateway.inbox.archive(lifecycle);
    await gateway.inbox.restore(lifecycle);
    expect(invocations.map((value) => value.channel)).toEqual([
      inboxChannels.get,
      inboxChannels.list,
      inboxChannels.beginReview,
      inboxChannels.dismiss,
      inboxChannels.archive,
      inboxChannels.restore,
    ]);
    expect(() => gateway.inbox.archive({ campaignId, id: inboxItemId, revision: 0 })).toThrow();
    expect(() => gateway.inbox.list({ campaignId, filters: {}, extra: true } as never)).toThrow();
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
