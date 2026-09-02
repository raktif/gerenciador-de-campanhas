import { describe, expect, it } from 'vitest';
import {
  campaignChannels,
  entityChannels,
  entityTypeChannels,
  fieldDefinitionChannels,
  relationshipChannels,
  relationshipTypeChannels,
} from '../../src/core/contracts/ipc-channels';
import {
  createCampaignManagerGateway,
  type IpcInvoker,
} from '../../src/preload/gateways/campaign-manager-gateway';

describe('gateway do preload', () => {
  it('expõe somente gateways nomeados e não expõe o invocador bruto', () => {
    const gateway = createCampaignManagerGateway(createInvoker([]));

    expect(Object.keys(gateway).sort()).toEqual([
      'campaigns',
      'entities',
      'entityTypes',
      'fieldDefinitions',
      'phaseZero',
      'relationshipTypes',
      'relationships',
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
    expect('ipcRenderer' in gateway).toBe(false);
    expect('invoke' in gateway).toBe(false);
    expect(Object.keys(gateway.entityTypes).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'restore',
      'update',
    ]);
    expect(Object.keys(gateway.fieldDefinitions).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
      'restore',
      'update',
    ]);
    expect(Object.keys(gateway.relationshipTypes).sort()).toEqual([
      'archive',
      'create',
      'get',
      'list',
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

  it('normaliza entradas e mapeia cada operação ao canal permitido', async () => {
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
    const fieldIdentity = {
      campaignId: identity.id,
      entityTypeId: entityTypeIdentity.id,
      id: '20000000-0000-4000-8000-000000000001',
    };
    const fieldLifecycle = { ...fieldIdentity, revision: 1 };
    await gateway.fieldDefinitions.create({
      campaignId: identity.id,
      entityTypeId: entityTypeIdentity.id,
      key: 'nome',
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
      { channel: campaignChannels.create, input: { name: 'Ethéria' } },
      { channel: campaignChannels.get, input: identity },
      {
        channel: campaignChannels.list,
        input: {
          limit: 50,
          filters: { statuses: ['active'] },
          sort: 'updatedAt',
          order: 'desc',
        },
      },
      {
        channel: campaignChannels.update,
        input: { ...lifecycle, patch: { name: 'Nova Ethéria' } },
      },
      { channel: campaignChannels.archive, input: lifecycle },
      { channel: campaignChannels.restore, input: lifecycle },
      { channel: campaignChannels.moveToTrash, input: lifecycle },
      {
        channel: entityTypeChannels.create,
        input: {
          campaignId: identity.id,
          name: 'Personagens',
          singularName: 'Personagem',
          slug: 'personagens',
          sortOrder: 0,
        },
      },
      { channel: entityTypeChannels.get, input: entityTypeIdentity },
      {
        channel: entityTypeChannels.list,
        input: {
          campaignId: identity.id,
          limit: 50,
          filters: { isArchived: false },
          sort: 'sortOrder',
          order: 'asc',
        },
      },
      {
        channel: entityTypeChannels.update,
        input: { ...entityTypeLifecycle, patch: { name: 'Protagonistas' } },
      },
      { channel: entityTypeChannels.archive, input: entityTypeLifecycle },
      { channel: entityTypeChannels.restore, input: entityTypeLifecycle },
      {
        channel: relationshipTypeChannels.create,
        input: {
          campaignId: identity.id,
          name: 'Trabalha em',
          slug: 'trabalha-em',
          inverseName: null,
          description: null,
          semanticRole: null,
          isSymmetric: false,
          allowedSourceTypeIds: null,
          allowedTargetTypeIds: null,
          icon: null,
          color: null,
          sortOrder: 0,
        },
      },
      { channel: relationshipTypeChannels.get, input: relationshipTypeIdentity },
      {
        channel: relationshipTypeChannels.list,
        input: {
          campaignId: identity.id,
          limit: 50,
          filters: { isArchived: false },
          sort: 'sortOrder',
          order: 'asc',
        },
      },
      {
        channel: relationshipTypeChannels.update,
        input: { ...relationshipTypeLifecycle, patch: { inverseName: 'Emprega' } },
      },
      { channel: relationshipTypeChannels.archive, input: relationshipTypeLifecycle },
      { channel: relationshipTypeChannels.restore, input: relationshipTypeLifecycle },
      {
        channel: fieldDefinitionChannels.create,
        input: {
          campaignId: identity.id,
          entityTypeId: entityTypeIdentity.id,
          key: 'nome',
          label: 'Nome',
          dataType: 'short_text',
          description: null,
          semanticRole: null,
          required: false,
          searchable: false,
          secretByDefault: false,
          defaultValue: null,
          options: null,
          validation: null,
          referenceRelationshipTypeId: null,
          referenceDirection: null,
          allowedTargetTypeIds: null,
          onDeleteBehavior: null,
          sortOrder: 0,
        },
      },
      { channel: fieldDefinitionChannels.get, input: fieldIdentity },
      {
        channel: fieldDefinitionChannels.list,
        input: {
          campaignId: identity.id,
          entityTypeId: entityTypeIdentity.id,
          limit: 50,
          filters: { isArchived: false },
          sort: 'sortOrder',
          order: 'asc',
        },
      },
      {
        channel: fieldDefinitionChannels.update,
        input: { ...fieldLifecycle, patch: { label: 'Nome completo' } },
      },
      { channel: fieldDefinitionChannels.archive, input: fieldLifecycle },
      { channel: fieldDefinitionChannels.restore, input: fieldLifecycle },
      {
        channel: entityChannels.create,
        input: {
          campaignId: identity.id,
          entityTypeId: entityTypeIdentity.id,
          name: 'Aris',
          summary: null,
          canonState: 'accepted',
          knowledgeState: 'fact',
          visibility: 'gm',
          originKind: 'manual',
          sourceId: null,
          fieldValues: [],
          referenceValues: [],
        },
      },
      { channel: entityChannels.get, input: entityIdentity },
      {
        channel: entityChannels.list,
        input: {
          campaignId: identity.id,
          limit: 50,
          filters: { archived: false },
          sort: 'name',
          order: 'asc',
        },
      },
      {
        channel: entityChannels.update,
        input: { ...entityLifecycle, patch: { name: 'Aris, a Capitã' } },
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

  it('normaliza a consulta de vizinhança antes de invocar o IPC', async () => {
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
          depth: 1,
          maxEntities: 100,
          maxRelationships: 200,
          filters: {
            relationshipTypeIds: [],
            canonStates: [],
            knowledgeStates: [],
            visibilities: [],
          },
        },
      },
    ]);
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
