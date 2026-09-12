import { describe, expect, it } from 'vitest';
import { assertionChannels, noteChannels } from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
} from '../../src/preload/gateways/campaign-manager-gateway';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const assertionId = '50000000-0000-4000-8000-000000000001';
const noteId = '55000000-0000-4000-8000-000000000001';

describe('gateways narrativos do preload', () => {
  it('expõe somente operações nomeadas e mapeia todos os canais permitidos', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(Object.keys(gateway.assertions).sort()).toEqual(operations);
    expect(Object.keys(gateway.notes).sort()).toEqual(operations);
    expect('ipcRenderer' in gateway).toBe(false);
    expect('invoke' in gateway).toBe(false);

    const assertionIdentity = { campaignId, id: assertionId };
    const assertionLifecycle = { ...assertionIdentity, revision: 1 };
    await gateway.assertions.create({
      campaignId,
      subjectEntityId: entityId,
      statement: '  Pista.  ',
    });
    await gateway.assertions.get(assertionIdentity);
    await gateway.assertions.list({ campaignId });
    await gateway.assertions.update({
      ...assertionLifecycle,
      patch: { statement: 'Revisada.' },
    });
    await gateway.assertions.archive(assertionLifecycle);
    await gateway.assertions.restore(assertionLifecycle);

    const noteIdentity = { campaignId, id: noteId };
    const noteLifecycle = { ...noteIdentity, revision: 1 };
    await gateway.notes.create({ campaignId, title: '  Nota  ', bodyMarkdown: '**Corpo**' });
    await gateway.notes.get(noteIdentity);
    await gateway.notes.list({ campaignId });
    await gateway.notes.update({
      ...noteLifecycle,
      links: [{ entityId, role: '  alvo  ' }],
    });
    await gateway.notes.archive(noteLifecycle);
    await gateway.notes.restore(noteLifecycle);

    expect(invocations.map(({ channel }) => channel)).toEqual([
      ...Object.values(assertionChannels),
      ...Object.values(noteChannels),
    ]);
    expect(invocations[0]?.input).toMatchObject({
      statement: 'Pista.',
      canonState: 'accepted',
      sourceId: null,
    });
    expect(invocations[2]?.input).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'updatedAt',
      order: 'desc',
    });
    expect(invocations[6]?.input).toMatchObject({ title: 'Nota', noteType: 'general', links: [] });
    expect(invocations[9]?.input).toMatchObject({ links: [{ entityId, role: 'alvo' }] });
  });

  it('bloqueia entradas inválidas antes de invocar o IPC', () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(invoker(invocations));
    expect(() => gateway.assertions.create({ campaignId, subjectEntityId: entityId })).toThrow();
    expect(() =>
      gateway.assertions.create({
        campaignId,
        subjectEntityId: entityId,
        statement: 'Conteúdo válido.',
        originKind: 'document',
        sourceId: 'fonte-inválida',
      }),
    ).toThrow();
    expect(() => gateway.notes.create({ campaignId, title: ' ', bodyMarkdown: ' ' })).toThrow();
    expect(() =>
      gateway.notes.create({
        campaignId,
        title: 'Nota válida',
        bodyMarkdown: 'Conteúdo válido.',
        originKind: 'document',
        sourceId: 'fonte-inválida',
      }),
    ).toThrow();
    expect(invocations).toHaveLength(0);
  });
});

const operations = ['archive', 'create', 'get', 'list', 'restore', 'update'];
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
