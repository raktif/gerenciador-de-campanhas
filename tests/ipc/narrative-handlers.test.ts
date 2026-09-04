import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type { Assertion, CreateAssertionInput } from '../../src/core/contracts/assertions';
import { assertionChannels, noteChannels } from '../../src/core/contracts/ipc-channels';
import type { CreateNoteInput, NoteDetails } from '../../src/core/contracts/notes';
import { AppError } from '../../src/core/errors/app-error';
import { registerAssertionIpcHandlers } from '../../src/main/ipc/assertion-handlers';
import { registerNoteIpcHandlers } from '../../src/main/ipc/note-handlers';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const assertionId = '50000000-0000-4000-8000-000000000001';
const noteId = '55000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-03T12:00:00.000Z';

describe('handlers IPC narrativos', () => {
  it('registra, encaminha e remove todos os canais de afirmações', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeAssertionService();
    const unregister = registerAssertionIpcHandlers(ipc(handlers), dependencies(service));
    expect([...handlers.keys()].sort()).toEqual(Object.values(assertionChannels).sort());

    const identity = { campaignId, id: assertionId };
    const lifecycle = { ...identity, revision: 1 };
    await requireHandler(handlers, assertionChannels.create)(event(42), {
      campaignId,
      subjectEntityId: entityId,
      statement: '  Uma possibilidade.  ',
    });
    await requireHandler(handlers, assertionChannels.get)(event(42), identity);
    await requireHandler(handlers, assertionChannels.list)(event(42), { campaignId });
    await requireHandler(handlers, assertionChannels.update)(event(42), {
      ...lifecycle,
      patch: { statement: 'Revisada.' },
    });
    await requireHandler(handlers, assertionChannels.archive)(event(42), lifecycle);
    await requireHandler(handlers, assertionChannels.restore)(event(42), lifecycle);

    expect(service.createInput).toMatchObject({
      statement: 'Uma possibilidade.',
      canonState: 'accepted',
      sourceId: null,
    });
    expect(service.listInput).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'updatedAt',
      order: 'desc',
    });
    expect(service.calls).toEqual(['create', 'get', 'list', 'update', 'archive', 'restore']);
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('normaliza falhas de entrada, remetente, domínio e saída de afirmações', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeAssertionService();
    registerAssertionIpcHandlers(ipc(handlers), dependencies(service));
    const create = requireHandler(handlers, assertionChannels.create);
    expect(await create(event(42), { campaignId, subjectEntityId: entityId })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await create(event(99), { campaignId, subjectEntityId: entityId, statement: 'Válida.' }),
    ).toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
    service.failure = new AppError('ASSERTION_NOT_FOUND', 'Ausente.');
    expect(
      await requireHandler(handlers, assertionChannels.get)(event(42), {
        campaignId,
        id: assertionId,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ASSERTION_NOT_FOUND' } });
    service.failure = null;
    service.invalidOutput = true;
    expect(
      await requireHandler(handlers, assertionChannels.get)(event(42), {
        campaignId,
        id: assertionId,
      }),
    ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('registra, encaminha e remove todos os canais de notas', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeNoteService();
    const unregister = registerNoteIpcHandlers(ipc(handlers), dependencies(service));
    expect([...handlers.keys()].sort()).toEqual(Object.values(noteChannels).sort());

    const identity = { campaignId, id: noteId };
    const lifecycle = { ...identity, revision: 1 };
    await requireHandler(handlers, noteChannels.create)(event(42), {
      campaignId,
      title: '  Pista  ',
      bodyMarkdown: '**Texto**',
    });
    await requireHandler(handlers, noteChannels.get)(event(42), identity);
    await requireHandler(handlers, noteChannels.list)(event(42), { campaignId });
    await requireHandler(handlers, noteChannels.update)(event(42), {
      ...lifecycle,
      links: [{ entityId, role: '  alvo  ' }],
    });
    await requireHandler(handlers, noteChannels.archive)(event(42), lifecycle);
    await requireHandler(handlers, noteChannels.restore)(event(42), lifecycle);

    expect(service.createInput).toMatchObject({ title: 'Pista', noteType: 'general', links: [] });
    expect(service.listInput).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'updatedAt',
      order: 'desc',
    });
    expect(service.calls).toEqual(['create', 'get', 'list', 'update', 'archive', 'restore']);
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('normaliza falhas de entrada, remetente, domínio e saída de notas', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeNoteService();
    registerNoteIpcHandlers(ipc(handlers), dependencies(service));
    const create = requireHandler(handlers, noteChannels.create);
    expect(await create(event(42), { campaignId, title: '', bodyMarkdown: '' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await create(event(99), { campaignId, title: 'Nota', bodyMarkdown: 'Corpo' }),
    ).toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
    service.failure = new AppError('NOTE_NOT_FOUND', 'Ausente.');
    expect(
      await requireHandler(handlers, noteChannels.get)(event(42), { campaignId, id: noteId }),
    ).toMatchObject({ ok: false, error: { code: 'NOTE_NOT_FOUND' } });
    service.failure = null;
    service.invalidOutput = true;
    expect(
      await requireHandler(handlers, noteChannels.get)(event(42), { campaignId, id: noteId }),
    ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
});

class FakeAssertionService {
  public createInput: CreateAssertionInput | null = null;
  public listInput: unknown = null;
  public readonly calls: string[] = [];
  public failure: AppError | null = null;
  public invalidOutput = false;

  public create(input: CreateAssertionInput): Assertion {
    this.createInput = input;
    return this.result('create');
  }
  public get(): Assertion {
    return this.result('get');
  }
  public list(input: unknown) {
    this.calls.push('list');
    this.listInput = input;
    return { items: [assertion()], nextCursor: null, total: 1 };
  }
  public update(): Assertion {
    return this.result('update');
  }
  public archive(): Assertion {
    return this.result('archive');
  }
  public restore(): Assertion {
    return this.result('restore');
  }
  private result(operation: string): Assertion {
    this.calls.push(operation);
    if (this.failure !== null) throw this.failure;
    return (this.invalidOutput ? { invalid: true } : assertion()) as Assertion;
  }
}

class FakeNoteService {
  public createInput: CreateNoteInput | null = null;
  public listInput: unknown = null;
  public readonly calls: string[] = [];
  public failure: AppError | null = null;
  public invalidOutput = false;

  public create(input: CreateNoteInput): NoteDetails {
    this.createInput = input;
    return this.result('create');
  }
  public get(): NoteDetails {
    return this.result('get');
  }
  public list(input: unknown) {
    this.calls.push('list');
    this.listInput = input;
    return { items: [noteDetails().note], nextCursor: null, total: 1 };
  }
  public update(): NoteDetails {
    return this.result('update');
  }
  public archive(): NoteDetails {
    return this.result('archive');
  }
  public restore(): NoteDetails {
    return this.result('restore');
  }
  private result(operation: string): NoteDetails {
    this.calls.push(operation);
    if (this.failure !== null) throw this.failure;
    return (this.invalidOutput ? { invalid: true } : noteDetails()) as NoteDetails;
  }
}

function assertion(): Assertion {
  return {
    id: assertionId,
    campaignId,
    subjectEntityId: entityId,
    predicate: null,
    objectEntityId: null,
    statement: 'Uma possibilidade.',
    value: null,
    canonState: 'accepted',
    knowledgeState: 'possibility',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
  };
}

function noteDetails(): NoteDetails {
  return {
    note: {
      id: noteId,
      campaignId,
      title: 'Pista',
      bodyMarkdown: '**Texto**',
      noteType: 'general',
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    },
    links: [],
  };
}

function dependencies(service: unknown) {
  return {
    service,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  } as never;
}
function ipc(handlers: Map<string, CapturedHandler>): IpcMain {
  return {
    handle: (channel: string, handler: CapturedHandler) => handlers.set(channel, handler),
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
function requireHandler(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`Handler não registrado: ${channel}`);
  return handler;
}
