import { describe, expect, it } from 'vitest';
import {
  sessionChannels,
  sessionIntentionChannels,
  sessionParticipantChannels,
} from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
} from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const intentionId = '80000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';

describe('gateway do preload de sessões', () => {
  it('expõe somente operações nomeadas e mapeia os dez canais permitidos', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(Object.keys(gateway.sessions).sort()).toEqual(['create', 'get', 'list', 'update']);
    expect(Object.keys(gateway.sessionParticipants).sort()).toEqual(['list', 'replace']);
    expect(Object.keys(gateway.sessionIntentions).sort()).toEqual([
      'create',
      'get',
      'list',
      'update',
    ]);
    expect('ipcRenderer' in gateway).toBe(false);
    expect('invoke' in gateway).toBe(false);

    await gateway.sessions.create({ campaignId, sequenceNumber: 1, title: '  Sessão um ' });
    await gateway.sessions.get({ campaignId, id: sessionId });
    await gateway.sessions.list({ campaignId });
    await gateway.sessions.update({
      campaignId,
      id: sessionId,
      revision: 1,
      patch: { title: 'Revisada' },
    });
    await gateway.sessionParticipants.list({ campaignId, sessionId });
    await gateway.sessionParticipants.replace({
      campaignId,
      sessionId,
      revision: 1,
      participants: [{ entityId, role: 'npc' }],
    });
    await gateway.sessionIntentions.create({
      campaignId,
      sessionId,
      text: '  Encontrar a chave. ',
    });
    await gateway.sessionIntentions.get({ campaignId, sessionId, id: intentionId });
    await gateway.sessionIntentions.list({ campaignId, sessionId });
    await gateway.sessionIntentions.update({
      campaignId,
      sessionId,
      id: intentionId,
      revision: 1,
      patch: { status: 'completed' },
    });

    expect(invocations.map(({ channel }) => channel)).toEqual([
      ...Object.values(sessionChannels),
      ...Object.values(sessionParticipantChannels),
      ...Object.values(sessionIntentionChannels),
    ]);
    expect(invocations[0]?.input).toMatchObject({ title: 'Sessão um', playedAt: null });
    expect(invocations[2]?.input).toEqual({
      campaignId,
      limit: 50,
      filters: {},
      sort: 'sequenceNumber',
      order: 'desc',
    });
    expect(invocations[4]?.input).toEqual({ campaignId, sessionId });
    expect(invocations[5]?.input).toMatchObject({
      participants: [{ entityId, role: 'npc', attended: true }],
    });
    expect(invocations[6]?.input).toMatchObject({ text: 'Encontrar a chave.', entityId: null });
    expect(invocations[8]?.input).toEqual({
      campaignId,
      sessionId,
      limit: 50,
      filters: {},
      sort: 'createdAt',
      order: 'asc',
    });
  });

  it('rejeita entrada inválida antes de invocar IPC', () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(() => gateway.sessions.create({ campaignId, sequenceNumber: 0, title: ' ' })).toThrow();
    expect(() =>
      gateway.sessionParticipants.replace({
        campaignId,
        sessionId,
        revision: 1,
        participants: [
          { entityId, role: 'npc' },
          { entityId, role: 'observer' },
        ],
      }),
    ).toThrow();
    expect(() =>
      gateway.sessionParticipants.replace({
        campaignId,
        sessionId,
        revision: 1,
        participants: [{ entityId, role: 'npc', sortOrder: 0 }],
      } as never),
    ).toThrow();
    expect(() => gateway.sessionIntentions.create({ campaignId, sessionId, text: ' ' })).toThrow();
    expect(() =>
      gateway.sessionIntentions.update({
        campaignId,
        sessionId,
        id: intentionId,
        revision: 1,
        patch: {},
      }),
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
