import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type {
  CreateFieldDefinitionInput,
  FieldDefinition,
  FieldDefinitionPageRequest,
} from '../../src/core/contracts/field-definitions';
import { fieldDefinitionChannels } from '../../src/core/contracts/ipc-channels';
import { registerFieldDefinitionIpcHandlers } from '../../src/main/ipc/field-definition-handlers';
import type { FieldDefinitionService } from '../../src/main/services/field-definition-service';
import { TestLogger } from '../helpers/test-logger';

type Handler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const fieldId = '20000000-0000-4000-8000-000000000001';

describe('handlers IPC de definições de campo', () => {
  it('registra e remove somente os canais explícitos', () => {
    const handlers = new Map<string, Handler>();
    const unregister = registerFieldDefinitionIpcHandlers(ipc(handlers), dependencies());
    expect([...handlers.keys()].sort()).toEqual(Object.values(fieldDefinitionChannels).sort());
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('normaliza criação e paginação e encaminha as demais operações', async () => {
    const handlers = new Map<string, Handler>();
    const service = new FakeService();
    registerFieldDefinitionIpcHandlers(ipc(handlers), dependencies(service));
    await required(handlers, fieldDefinitionChannels.create)(event(42), {
      campaignId,
      entityTypeId,
      key: 'nome',
      label: '  Nome  ',
      dataType: 'short_text',
    });
    await required(handlers, fieldDefinitionChannels.list)(event(42), { campaignId, entityTypeId });
    const identity = { campaignId, entityTypeId, id: fieldId };
    const lifecycle = { ...identity, revision: 1 };
    await required(handlers, fieldDefinitionChannels.get)(event(42), identity);
    await required(handlers, fieldDefinitionChannels.update)(event(42), {
      ...lifecycle,
      patch: { label: 'Nome completo' },
    });
    await required(handlers, fieldDefinitionChannels.archive)(event(42), lifecycle);
    await required(handlers, fieldDefinitionChannels.restore)(event(42), lifecycle);
    expect(service.createInput).toMatchObject({ label: 'Nome', required: false, sortOrder: 0 });
    expect(service.listInput).toMatchObject({ limit: 50, filters: { isArchived: false } });
    expect(service.operations).toEqual(['get', 'update', 'archive', 'restore']);
  });

  it('rejeita entrada inválida e renderer não autorizado', async () => {
    const handlers = new Map<string, Handler>();
    registerFieldDefinitionIpcHandlers(ipc(handlers), dependencies());
    const handler = required(handlers, fieldDefinitionChannels.create);
    expect(
      await handler(event(42), {
        campaignId,
        entityTypeId,
        key: 'Chave Inválida',
        label: 'Nome',
        dataType: 'short_text',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      await handler(event(99), {
        campaignId,
        entityTypeId,
        key: 'nome',
        label: 'Nome',
        dataType: 'short_text',
      }),
    ).toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
  });
});

class FakeService {
  public createInput: CreateFieldDefinitionInput | null = null;
  public listInput: FieldDefinitionPageRequest | null = null;
  public operations: string[] = [];
  public create(input: CreateFieldDefinitionInput): FieldDefinition {
    this.createInput = input;
    return field();
  }
  public get(): FieldDefinition {
    this.operations.push('get');
    return field();
  }
  public list(input: FieldDefinitionPageRequest) {
    this.listInput = input;
    return { items: [field()], nextCursor: null, total: 1 };
  }
  public update(): FieldDefinition {
    this.operations.push('update');
    return field({ revision: 2 });
  }
  public archive(): FieldDefinition {
    this.operations.push('archive');
    return field({ isArchived: true, revision: 2 });
  }
  public restore(): FieldDefinition {
    this.operations.push('restore');
    return field({ revision: 2 });
  }
}

function field(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: fieldId,
    entityTypeId,
    key: 'nome',
    label: 'Nome',
    description: null,
    dataType: 'short_text',
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
    isArchived: false,
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}
function dependencies(service = new FakeService()) {
  return {
    service: service as unknown as FieldDefinitionService,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  };
}
function ipc(handlers: Map<string, Handler>): IpcMain {
  return {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
}
function event(senderId: number): IpcMainInvokeEvent {
  const mainFrame = {};
  return {
    sender: { id: senderId, mainFrame },
    senderFrame: mainFrame,
  } as unknown as IpcMainInvokeEvent;
}
function required(handlers: Map<string, Handler>, channel: string): Handler {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`Handler não registrado: ${channel}`);
  return handler;
}
