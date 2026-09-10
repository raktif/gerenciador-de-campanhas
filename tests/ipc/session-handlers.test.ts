import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  sessionChannels,
  sessionIntentionChannels,
  sessionParticipantChannels,
} from '../../src/core/contracts/ipc-channels';
import type {
  Session,
  SessionIntention,
  SessionParticipant,
} from '../../src/core/contracts/sessions';
import { AppError } from '../../src/core/errors/app-error';
import { registerSessionIpcHandlers } from '../../src/main/ipc/session-handlers';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const intentionId = '80000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-04T12:00:00.000Z';

describe('handlers IPC de sessões', () => {
  it('registra, encaminha e remove os canais de sessão', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const services = new FakeServices();
    const unregister = registerSessionIpcHandlers(ipc(handlers), dependencies(services));
    expect([...handlers.keys()].sort()).toEqual(
      [
        ...Object.values(sessionChannels),
        ...Object.values(sessionParticipantChannels),
        ...Object.values(sessionIntentionChannels),
      ].sort(),
    );

    await handler(handlers, sessionChannels.create)(event(42), {
      campaignId,
      sequenceNumber: 1,
      title: '  Sessão 1  ',
    });
    await handler(handlers, sessionChannels.get)(event(42), { campaignId, id: sessionId });
    await handler(handlers, sessionChannels.list)(event(42), { campaignId });
    await handler(handlers, sessionChannels.update)(event(42), {
      campaignId,
      id: sessionId,
      revision: 1,
      patch: { title: 'Revisada' },
    });
    await handler(handlers, sessionParticipantChannels.list)(event(42), { campaignId, sessionId });
    await handler(handlers, sessionParticipantChannels.replace)(event(42), {
      campaignId,
      sessionId,
      revision: 1,
      participants: [{ entityId, role: 'npc' }],
    });
    await handler(handlers, sessionIntentionChannels.create)(event(42), {
      campaignId,
      sessionId,
      text: '  Encontrar a chave. ',
    });
    await handler(handlers, sessionIntentionChannels.get)(event(42), {
      campaignId,
      sessionId,
      id: intentionId,
    });
    await handler(handlers, sessionIntentionChannels.list)(event(42), { campaignId, sessionId });
    await handler(handlers, sessionIntentionChannels.update)(event(42), {
      campaignId,
      sessionId,
      id: intentionId,
      revision: 1,
      patch: { status: 'completed' },
    });

    expect(services.calls).toEqual([
      'sessions.create',
      'sessions.get',
      'sessions.list',
      'sessions.update',
      'participants.list',
      'participants.replace',
      'intentions.create',
      'intentions.get',
      'intentions.list',
      'intentions.update',
    ]);
    expect(services.sessionCreateInput).toMatchObject({ title: 'Sessão 1', playedAt: null });
    expect(services.sessionListInput).toEqual({
      campaignId,
      limit: 50,
      filters: {},
      sort: 'sequenceNumber',
      order: 'desc',
    });
    expect(services.participantInput).toMatchObject({
      participants: [{ entityId, role: 'npc', attended: true, sortOrder: 0 }],
    });
    expect(services.intentionCreateInput).toMatchObject({
      text: 'Encontrar a chave.',
      entityId: null,
    });
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('rejeita entrada e remetente antes do serviço, mapeia domínio e bloqueia saída inválida', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const services = new FakeServices();
    registerSessionIpcHandlers(ipc(handlers), dependencies(services));
    const create = handler(handlers, sessionChannels.create);
    expect(await create(event(42), { campaignId, sequenceNumber: 0, title: '' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(services.calls).toEqual([]);
    expect(
      await create(event(99), { campaignId, sequenceNumber: 1, title: 'Válida' }),
    ).toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
    expect(services.calls).toEqual([]);
    services.failure = new AppError('SESSION_NOT_FOUND', 'Ausente.');
    expect(
      await handler(handlers, sessionChannels.get)(event(42), { campaignId, id: sessionId }),
    ).toMatchObject({ ok: false, error: { code: 'SESSION_NOT_FOUND' } });
    services.failure = null;
    services.invalidOutput = true;
    expect(
      await handler(handlers, sessionIntentionChannels.get)(event(42), {
        campaignId,
        sessionId,
        id: intentionId,
      }),
    ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    services.invalidOutput = false;
    services.duplicateParticipantsOutput = true;
    expect(
      await handler(handlers, sessionParticipantChannels.replace)(event(42), {
        campaignId,
        sessionId,
        revision: 1,
        participants: [{ entityId, role: 'npc' }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
});

class FakeServices {
  public readonly calls: string[] = [];
  public sessionCreateInput: unknown;
  public sessionListInput: unknown;
  public participantInput: unknown;
  public intentionCreateInput: unknown;
  public failure: AppError | null = null;
  public invalidOutput = false;
  public duplicateParticipantsOutput = false;

  public readonly sessions = {
    create: (input: unknown) => {
      this.calls.push('sessions.create');
      this.sessionCreateInput = input;
      return this.session();
    },
    get: () => this.session('sessions.get'),
    list: (input: unknown) => {
      this.calls.push('sessions.list');
      this.sessionListInput = input;
      return { items: [this.session()], nextCursor: null, total: 1 };
    },
    update: () => this.session('sessions.update'),
  };

  public readonly participants = {
    list: () => {
      this.calls.push('participants.list');
      return [participant()];
    },
    replace: (input: unknown) => {
      this.calls.push('participants.replace');
      this.participantInput = input;
      return this.duplicateParticipantsOutput ? [participant(), participant()] : [participant()];
    },
  };

  public readonly intentions = {
    create: (input: unknown) => {
      this.calls.push('intentions.create');
      this.intentionCreateInput = input;
      return this.intention();
    },
    get: () => this.intention('intentions.get'),
    list: () => {
      this.calls.push('intentions.list');
      return { items: [this.intention()], nextCursor: null, total: 1 };
    },
    update: () => this.intention('intentions.update'),
  };

  private session(operation?: string): Session {
    if (operation !== undefined) this.calls.push(operation);
    if (this.failure !== null) throw this.failure;
    return (this.invalidOutput ? { invalid: true } : session()) as Session;
  }

  private intention(operation?: string): SessionIntention {
    if (operation !== undefined) this.calls.push(operation);
    if (this.failure !== null) throw this.failure;
    return (this.invalidOutput ? { invalid: true } : intention()) as SessionIntention;
  }
}

function session(): Session {
  return {
    id: sessionId,
    campaignId,
    sequenceNumber: 1,
    title: 'Sessão',
    playedAt: null,
    status: 'planned',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}
function participant(): SessionParticipant {
  return { sessionId, entityId, role: 'npc', attended: true, sortOrder: 0 };
}
function intention(): SessionIntention {
  return {
    id: intentionId,
    sessionId,
    entityId: null,
    text: 'Encontrar a chave.',
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}
function dependencies(services: FakeServices) {
  return {
    sessions: services.sessions,
    participants: services.participants,
    intentions: services.intentions,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  } as never;
}
function ipc(handlers: Map<string, CapturedHandler>): IpcMain {
  return {
    handle: (channel: string, registered: CapturedHandler) => handlers.set(channel, registered),
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
function handler(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const registered = handlers.get(channel);
  if (registered === undefined) throw new Error(`Handler não registrado: ${channel}`);
  return registered;
}
