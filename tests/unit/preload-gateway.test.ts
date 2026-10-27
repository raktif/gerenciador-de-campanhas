import { describe, expect, it } from 'vitest';
import {
  appearanceChannels,
  campaignChannels,
  diagnosticsChannels,
  entityChannels,
  entityTypeChannels,
  fieldDefinitionChannels,
  imageImportChannels,
  relationshipChannels,
  relationshipTypeChannels,
} from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
  type IpcSubscriber,
} from '../../src/preload/gateways/campaign-manager-gateway';

describe('gateway do preload', () => {
  it('expõe somente gateways nomeados e não expõe o invocador bruto', () => {
    const gateway = createCampaignManagerGateway(createInvoker([]));

    expect(Object.keys(gateway).sort()).toEqual([
      'appearance',
      'assertions',
      'campaigns',
      'diagnostics',
      'entities',
      'entityTypes',
      'events',
      'fieldDefinitions',
      'images',
      'inbox',
      'notes',
      'phaseZero',
      'relationshipTypes',
      'relationships',
      'sessionIntentions',
      'sessionParticipants',
      'sessions',
      'timeline',
    ]);
    expect(Object.keys(gateway.campaigns).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'moveToTrash',
      'restore',
      'update',
    ]);
    expect(Object.keys(gateway.images).sort()).toEqual(['importBytes', 'importUrl', 'selectLocal']);
    expect(Object.keys(gateway.appearance).sort()).toEqual([
      'getTheme',
      'onThemeChanged',
      'setTheme',
    ]);
    expect('ipcRenderer' in gateway).toBe(false);
    expect('invoke' in gateway).toBe(false);
    expect(Object.keys(gateway.entityTypes).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'move',
      'restore',
      'update',
    ]);
    expect(Object.keys(gateway.fieldDefinitions).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'move',
      'restore',
      'update',
    ]);
    expect(Object.keys(gateway.relationshipTypes).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'move',
      'restore',
      'update',
    ]);
    expect(Object.keys(gateway.relationships).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'neighborhood',
      'restore',
      'update',
    ]);
    expect(Object.keys(gateway.entities).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'restore',
      'update',
    ]);
  });

  it('expõe somente get/set de aparência e bloqueia payloads fora do contrato', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(createInvoker(invocations));

    await gateway.appearance.getTheme();
    await gateway.appearance.setTheme({ theme: 'dark', revision: 2 });

    expect(invocations).toEqual([
      { channel: appearanceChannels.getTheme, input: {} },
      {
        channel: appearanceChannels.setTheme,
        input: { theme: 'dark', revision: 2 },
      },
    ]);
    expect(() =>
      gateway.appearance.setTheme({ theme: 'dark', revision: 2, rawChannel: true } as never),
    ).toThrow();
    expect(invocations).toHaveLength(2);
  });

  it('valida eventos de tema e oferece unsubscribe idempotente sem expor o listener bruto', () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const removed: string[] = [];
    const gateway = createCampaignManagerGateway(
      createInvoker([]),
      createSubscriber(listeners, removed),
    );
    const received: unknown[] = [];
    const unsubscribe = gateway.appearance.onThemeChanged((setting) => received.push(setting));
    const listener = listeners.get(appearanceChannels.themeChanged);
    if (listener === undefined) throw new Error('Listener de tema não registrado.');

    listener({ theme: 'dark', revision: 2, rawChannel: true });
    listener({ theme: 'system', revision: 2 });
    expect(received).toEqual([]);

    listener({ theme: 'dark', revision: 2 });
    expect(received).toEqual([{ theme: 'dark', revision: 2 }]);

    unsubscribe();
    unsubscribe();
    expect(removed).toEqual([appearanceChannels.themeChanged]);
  });

  it('valida entradas públicas e as encaminha sem aplicar transforms do main', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(createInvoker(invocations));
    const identity = { id: '00000000-0000-4000-8000-000000000001' };
    const lifecycle = { ...identity, revision: 1 };

    await gateway.campaigns.create({ name: '  Ethéria  ' });
    await gateway.campaigns.get(identity);
    await gateway.campaigns.list();
    await gateway.campaigns.update({
      ...lifecycle,
      patch: { name: '  Nova Ethéria  ' },
    });
    await gateway.campaigns.archive(lifecycle);
    await gateway.campaigns.restore(lifecycle);
    await gateway.campaigns.moveToTrash(lifecycle);
    const entityTypeIdentity = {
      campaignId: identity.id,
      id: '10000000-0000-4000-8000-000000000001',
    };
    const entityTypeLifecycle = { ...entityTypeIdentity, revision: 1 };
    await gateway.entityTypes.create({
      campaignId: identity.id,
      name: '  Personagens  ',
      singularName: '  Personagem  ',
      slug: 'personagens',
    });
    await gateway.entityTypes.get(entityTypeIdentity);
    await gateway.entityTypes.list({ campaignId: identity.id });
    await gateway.entityTypes.update({
      ...entityTypeLifecycle,
      patch: { name: '  Protagonistas  ' },
    });
    await gateway.entityTypes.archive(entityTypeLifecycle);
    await gateway.entityTypes.restore(entityTypeLifecycle);
    const entityTypeMove = {
      campaignId: identity.id,
      sourceId: entityTypeIdentity.id,
      sourceRevision: 1,
      targetId: '10000000-0000-4000-8000-000000000002',
      targetRevision: 2,
      placement: 'before' as const,
    };
    await gateway.entityTypes.move(entityTypeMove);
    const relationshipTypeIdentity = {
      campaignId: identity.id,
      id: '15000000-0000-4000-8000-000000000001',
    };
    const relationshipTypeLifecycle = { ...relationshipTypeIdentity, revision: 1 };
    await gateway.relationshipTypes.create({
      campaignId: identity.id,
      name: '  Trabalha em  ',
      slug: 'trabalha-em',
    });
    await gateway.relationshipTypes.get(relationshipTypeIdentity);
    await gateway.relationshipTypes.list({ campaignId: identity.id });
    await gateway.relationshipTypes.update({
      ...relationshipTypeLifecycle,
      patch: { inverseName: '  Emprega  ' },
    });
    await gateway.relationshipTypes.archive(relationshipTypeLifecycle);
    await gateway.relationshipTypes.restore(relationshipTypeLifecycle);
    const relationshipTypeMove = {
      campaignId: identity.id,
      sourceId: relationshipTypeIdentity.id,
      sourceRevision: 1,
      targetId: '15000000-0000-4000-8000-000000000002',
      targetRevision: 2,
      placement: 'after' as const,
    };
    await gateway.relationshipTypes.move(relationshipTypeMove);
    const fieldIdentity = {
      campaignId: identity.id,
      entityTypeId: entityTypeIdentity.id,
      id: '20000000-0000-4000-8000-000000000001',
    };
    const fieldLifecycle = { ...fieldIdentity, revision: 1 };
    await gateway.fieldDefinitions.create({
      campaignId: identity.id,
      entityTypeId: entityTypeIdentity.id,
      label: '  Nome  ',
      dataType: 'short_text',
    });
    await gateway.fieldDefinitions.get(fieldIdentity);
    await gateway.fieldDefinitions.list({
      campaignId: identity.id,
      entityTypeId: entityTypeIdentity.id,
    });
    await gateway.fieldDefinitions.update({
      ...fieldLifecycle,
      patch: { label: '  Nome completo  ' },
    });
    await gateway.fieldDefinitions.archive(fieldLifecycle);
    await gateway.fieldDefinitions.restore(fieldLifecycle);
    const fieldMove = {
      campaignId: identity.id,
      entityTypeId: entityTypeIdentity.id,
      sourceId: fieldIdentity.id,
      sourceRevision: 1,
      targetId: '20000000-0000-4000-8000-000000000002',
      targetRevision: 2,
      placement: 'before' as const,
    };
    await gateway.fieldDefinitions.move(fieldMove);
    const entityIdentity = { campaignId: identity.id, id: '30000000-0000-4000-8000-000000000001' };
    const entityLifecycle = { ...entityIdentity, revision: 1 };
    await gateway.entities.create({
      campaignId: identity.id,
      entityTypeId: entityTypeIdentity.id,
      name: '  Aris  ',
    });
    await gateway.entities.get(entityIdentity);
    await gateway.entities.list({ campaignId: identity.id });
    await gateway.entities.update({
      ...entityLifecycle,
      patch: { name: '  Aris, a Capit\u00e3  ' },
    });
    await gateway.entities.archive(entityLifecycle);
    await gateway.entities.restore(entityLifecycle);

    expect(invocations).toEqual([
      { channel: campaignChannels.create, input: { name: '  Ethéria  ' } },
      { channel: campaignChannels.get, input: identity },
      {
        channel: campaignChannels.list,
        input: {},
      },
      {
        channel: campaignChannels.update,
        input: { ...lifecycle, patch: { name: '  Nova Ethéria  ' } },
      },
      { channel: campaignChannels.archive, input: lifecycle },
      { channel: campaignChannels.restore, input: lifecycle },
      { channel: campaignChannels.moveToTrash, input: lifecycle },
      {
        channel: entityTypeChannels.create,
        input: {
          campaignId: identity.id,
          name: '  Personagens  ',
          singularName: '  Personagem  ',
          slug: 'personagens',
        },
      },
      { channel: entityTypeChannels.get, input: entityTypeIdentity },
      {
        channel: entityTypeChannels.list,
        input: { campaignId: identity.id },
      },
      {
        channel: entityTypeChannels.update,
        input: { ...entityTypeLifecycle, patch: { name: '  Protagonistas  ' } },
      },
      { channel: entityTypeChannels.archive, input: entityTypeLifecycle },
      { channel: entityTypeChannels.restore, input: entityTypeLifecycle },
      { channel: entityTypeChannels.move, input: entityTypeMove },
      {
        channel: relationshipTypeChannels.create,
        input: {
          campaignId: identity.id,
          name: '  Trabalha em  ',
          slug: 'trabalha-em',
        },
      },
      { channel: relationshipTypeChannels.get, input: relationshipTypeIdentity },
      {
        channel: relationshipTypeChannels.list,
        input: { campaignId: identity.id },
      },
      {
        channel: relationshipTypeChannels.update,
        input: { ...relationshipTypeLifecycle, patch: { inverseName: '  Emprega  ' } },
      },
      { channel: relationshipTypeChannels.archive, input: relationshipTypeLifecycle },
      { channel: relationshipTypeChannels.restore, input: relationshipTypeLifecycle },
      { channel: relationshipTypeChannels.move, input: relationshipTypeMove },
      {
        channel: fieldDefinitionChannels.create,
        input: {
          campaignId: identity.id,
          entityTypeId: entityTypeIdentity.id,
          label: '  Nome  ',
          dataType: 'short_text',
        },
      },
      { channel: fieldDefinitionChannels.get, input: fieldIdentity },
      {
        channel: fieldDefinitionChannels.list,
        input: { campaignId: identity.id, entityTypeId: entityTypeIdentity.id },
      },
      {
        channel: fieldDefinitionChannels.update,
        input: { ...fieldLifecycle, patch: { label: '  Nome completo  ' } },
      },
      { channel: fieldDefinitionChannels.archive, input: fieldLifecycle },
      { channel: fieldDefinitionChannels.restore, input: fieldLifecycle },
      { channel: fieldDefinitionChannels.move, input: fieldMove },
      {
        channel: entityChannels.create,
        input: {
          campaignId: identity.id,
          entityTypeId: entityTypeIdentity.id,
          name: '  Aris  ',
        },
      },
      { channel: entityChannels.get, input: entityIdentity },
      {
        channel: entityChannels.list,
        input: { campaignId: identity.id },
      },
      {
        channel: entityChannels.update,
        input: { ...entityLifecycle, patch: { name: '  Aris, a Capitã  ' } },
      },
      { channel: entityChannels.archive, input: entityLifecycle },
      { channel: entityChannels.restore, input: entityLifecycle },
    ]);
  });

  it('bloqueia entrada inválida antes de chamar o IPC', () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(createInvoker(invocations));

    expect(() => gateway.campaigns.create({ name: '   ' })).toThrow();
    expect(() => gateway.entityTypes.list({ campaignId: 'campanha-inválida' })).toThrow();
    expect(invocations).toHaveLength(0);
  });

  it('não transmite defaults nem propriedades geradas pelo schema de criação', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(createInvoker(invocations));
    const input = {
      campaignId: '00000000-0000-4000-8000-000000000001',
      entityTypeId: '10000000-0000-4000-8000-000000000001',
      label: '  Aliados  ',
      helpText: '  Escolha aliados relevantes.  ',
      dataType: 'entity_reference_list' as const,
    };

    await gateway.fieldDefinitions.create(input);

    expect(invocations).toEqual([{ channel: fieldDefinitionChannels.create, input }]);
    expect(invocations[0]?.input).not.toHaveProperty('sortOrder');
    expect(invocations[0]?.input).not.toHaveProperty('required');
  });

  it('expõe somente a cópia de diagnóstico de inicialização validada', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(createInvoker(invocations));

    await gateway.diagnostics.copyStartupDiagnostic({
      version: 1,
      screen: 'campaigns',
      operation: 'campaigns.list',
      code: 'DATABASE_UNAVAILABLE',
    });

    expect(invocations).toEqual([
      {
        channel: diagnosticsChannels.copyStartupDiagnostic,
        input: {
          version: 1,
          screen: 'campaigns',
          operation: 'campaigns.list',
          code: 'DATABASE_UNAVAILABLE',
        },
      },
    ]);
    expect(() =>
      gateway.diagnostics.copyStartupDiagnostic({
        version: 1,
        screen: 'campaigns',
        operation: 'campaigns.list',
        code: 'INVALID\\PATH',
      }),
    ).toThrow();
  });

  it('deixa a normalização da consulta de vizinhança para o main', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(createInvoker(invocations));
    await gateway.relationships.neighborhood({
      campaignId: '00000000-0000-4000-8000-000000000001',
      entityId: '30000000-0000-4000-8000-000000000001',
    });
    expect(invocations).toEqual([
      {
        channel: relationshipChannels.neighborhood,
        input: {
          campaignId: '00000000-0000-4000-8000-000000000001',
          entityId: '30000000-0000-4000-8000-000000000001',
        },
      },
    ]);
  });

  it('limita o ingresso de imagens a bytes e metadados sem paths', async () => {
    const invocations: Invocation[] = [];
    const gateway = createCampaignManagerGateway(createInvoker(invocations));
    const identity = {
      campaignId: '00000000-0000-4000-8000-000000000001',
      revision: 1,
    };
    await gateway.images.selectLocal(identity);
    await gateway.images.importBytes({
      ...identity,
      bytes: new Uint8Array([1, 2, 3]),
      metadata: { originalFilename: 'capa.png', sourceKind: 'clipboard' },
    });
    await gateway.images.importUrl({
      ...identity,
      url: 'https://images.example/capa.png',
    });
    expect(invocations.map(({ channel }) => channel)).toEqual([
      imageImportChannels.selectLocal,
      imageImportChannels.importBytes,
      imageImportChannels.importUrl,
    ]);
    expect(() =>
      gateway.images.selectLocal({ ...identity, path: 'C:\\capa.png' } as never),
    ).toThrow();
    expect(() =>
      gateway.images.importBytes({
        ...identity,
        bytes: new Uint8Array([1]),
        metadata: { originalFilename: 'capa.png', sourceKind: 'file' },
      } as never),
    ).toThrow();
    expect(() =>
      gateway.images.importUrl({
        ...identity,
        url: 'file:///C:/capa.png',
      }),
    ).toThrow();
  });
});

interface Invocation {
  channel: string;
  input: unknown;
}

function createInvoker(invocations: Invocation[]): IpcInvoker {
  return (channel, input) => {
    invocations.push({ channel, input });
    return Promise.resolve({ ok: true, data: null, requestId: 'test-request' });
  };
}

function createSubscriber(
  listeners: Map<string, (payload: unknown) => void>,
  removed: string[],
): IpcSubscriber {
  return (channel, listener) => {
    listeners.set(channel, listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners.delete(channel);
      removed.push(channel);
    };
  };
}
