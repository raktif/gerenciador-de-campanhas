import { describe, expect, it } from 'vitest';
import { inboxChannels } from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
} from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';

describe('gateway do preload da captura rápida', () => {
  it('expõe apenas a captura e encaminha entrada validada pelo canal aprovado', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(Object.keys(gateway.inbox)).toEqual(['capture']);
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
