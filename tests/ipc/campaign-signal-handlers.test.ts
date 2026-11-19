import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { campaignSignalChannels } from '../../src/core/contracts/ipc-channels';
import { registerCampaignSignalIpcHandlers } from '../../src/main/ipc/campaign-signal-handlers';
import { AppError } from '../../src/core/errors/app-error';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;
const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-14T14:00:00.000Z';

describe('handlers IPC de sinais da campanha', () => {
  it('consulta contextual valida entrada, remetente, par real e erros sem gravar revisão', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeSignalService();
    registerCampaignSignalIpcHandlers(ipc(handlers), {
      service: service as never,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const invoke = handler(handlers, campaignSignalChannels.getContradictionReview);
    const input = { campaignId, id, revision: 1 };
    expect(await invoke(event(99), input)).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(await invoke(event(42), { ...input, revision: 0 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await invoke(event(42), input)).toMatchObject({
      ok: true,
      data: {
        assertions: [
          {
            assertion: { knowledgeState: 'fact' },
            sourceDescription: null,
            sessionTitle: null,
            sourceState: 'unlinked',
          },
          {
            assertion: { knowledgeState: 'disproved' },
            sourceDescription: null,
            sessionTitle: null,
            sourceState: 'unlinked',
          },
        ],
      },
    });
    service.failure = new AppError(
      'POTENTIAL_CONTRADICTION_NO_LONGER_DETECTED',
      'Par indisponível.',
    );
    expect(await invoke(event(42), input)).toMatchObject({
      ok: false,
      error: { code: 'POTENTIAL_CONTRADICTION_NO_LONGER_DETECTED' },
    });
    service.failure = null;
    service.failure = new AppError(
      'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
      'A fonte da afirmação não pertence à campanha solicitada.',
    );
    expect(await invoke(event(42), input)).toMatchObject({
      ok: false,
      error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
    });
    service.failure = null;
    service.invalidProvenance = true;
    expect(await invoke(event(42), input)).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
    service.invalidProvenance = false;
    service.invalidOutput = true;
    expect(await invoke(event(42), input)).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });
  it('encaminha os canais registrados e remove as inscrições', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeSignalService();
    const unregister = registerCampaignSignalIpcHandlers(ipc(handlers), {
      service: service as never,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    expect([...handlers.keys()].sort()).toEqual(Object.values(campaignSignalChannels).sort());

    await handler(handlers, campaignSignalChannels.list)(event(42), { campaignId });
    await handler(handlers, campaignSignalChannels.listForWorldInMotion)(event(42), { campaignId });
    await handler(handlers, campaignSignalChannels.recalculate)(event(42), { campaignId });
    await handler(handlers, campaignSignalChannels.review)(event(42), {
      campaignId,
      id,
      revision: 1,
    });
    await handler(handlers, campaignSignalChannels.dismiss)(event(42), {
      campaignId,
      id,
      revision: 1,
    });
    await handler(handlers, campaignSignalChannels.reactivate)(event(42), {
      campaignId,
      id,
      revision: 1,
    });
    await handler(handlers, campaignSignalChannels.snooze)(event(42), {
      campaignId,
      id,
      revision: 1,
      dismissedUntil: '2026-11-15T14:00:00.000Z',
    });
    await handler(handlers, campaignSignalChannels.markContradictionException)(event(42), {
      campaignId,
      id,
      revision: 1,
    });
    expect(service.calls).toEqual([
      'list',
      'listForWorldInMotion',
      'recalculate',
      'review',
      'dismiss',
      'reactivate',
      'snooze',
      'markContradictionException',
    ]);

    expect(
      await handler(handlers, campaignSignalChannels.snooze)(event(42), {
        campaignId,
        id,
        revision: 1,
        dismissedUntil: 'amanhã',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      await handler(handlers, campaignSignalChannels.list)(event(99), { campaignId }),
    ).toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });

    unregister();
    expect(handlers.size).toBe(0);
  });

  it('valida remetente, entrada e saída da leitura exclusiva do painel', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeSignalService();
    registerCampaignSignalIpcHandlers(ipc(handlers), {
      service: service as never,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    const invoke = handler(handlers, campaignSignalChannels.listForWorldInMotion);
    expect(await invoke(event(99), { campaignId })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(await invoke(event(42), { campaignId, expire: true })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.calls).toEqual([]);
    expect(await invoke(event(42), { campaignId })).toMatchObject({
      ok: true,
      data: { items: [] },
    });
    service.invalidOutput = true;
    expect(await invoke(event(42), { campaignId })).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(service.calls).toEqual(['listForWorldInMotion', 'listForWorldInMotion']);
  });

  it('normaliza erros do serviço e rejeita saídas que violem o contrato', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeSignalService();
    registerCampaignSignalIpcHandlers(ipc(handlers), {
      service: service as never,
      logger: new TestLogger(),
      authorizedWebContentsId: 42,
    });
    service.failure = new AppError('INVALID_CAMPAIGN_SIGNAL_TRANSITION', 'Transição recusada.');
    expect(
      await handler(handlers, campaignSignalChannels.review)(event(42), {
        campaignId,
        id,
        revision: 1,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CAMPAIGN_SIGNAL_TRANSITION' },
    });
    service.failure = null;
    service.invalidOutput = true;
    expect(
      await handler(handlers, campaignSignalChannels.list)(event(42), { campaignId }),
    ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
});

class FakeSignalService {
  public readonly calls: string[] = [];
  public failure: AppError | null = null;
  public invalidOutput = false;
  public invalidProvenance = false;

  public getContradictionReview() {
    if (this.failure !== null) throw this.failure;
    if (this.invalidOutput) return { invalid: true };
    const signal = {
      ...this.signal('getContradictionReview'),
      signalType: 'potential_contradiction',
    };
    return {
      signal,
      assertions: ['fact', 'disproved'].map((knowledgeState, index) => ({
        subjectName: 'Gorel',
        objectName: null,
        sourceDescription: this.invalidProvenance ? 'Descrição não vinculada' : null,
        sessionTitle: null,
        sourceState: 'unlinked',
        assertion: {
          id:
            index === 0
              ? '20000000-0000-4000-8000-000000000001'
              : '20000000-0000-4000-8000-000000000002',
          campaignId,
          subjectEntityId: '30000000-0000-4000-8000-000000000001',
          statement: 'A torre está aberta.',
          predicate: null,
          objectEntityId: null,
          value: null,
          canonState: 'accepted',
          knowledgeState,
          visibility: 'gm',
          originKind: 'manual',
          sourceId: null,
          archivedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          revision: 1,
        },
      })),
    };
  }

  public list() {
    this.calls.push('list');
    return this.invalidOutput ? { invalid: true } : { items: [] };
  }
  public listForWorldInMotion() {
    this.calls.push('listForWorldInMotion');
    return this.invalidOutput ? { invalid: true } : { items: [] };
  }
  public recalculate() {
    this.calls.push('recalculate');
    return { items: [], detectedCount: 0, expiredSnoozes: 0 };
  }
  public review() {
    return this.signal('review');
  }
  public dismiss() {
    return this.signal('dismiss');
  }
  public reactivate() {
    return this.signal('reactivate');
  }
  public snooze() {
    return this.signal('snooze');
  }
  public markContradictionException() {
    return this.signal('markContradictionException');
  }
  private signal(action: string) {
    this.calls.push(action);
    if (this.failure !== null) throw this.failure;
    return {
      id,
      campaignId,
      signalType: 'explicit_need',
      title: 'Necessidade explícita: Gorel',
      summary: 'Entender os cabos',
      priority: 'high',
      status: 'viewed',
      generatedAt: timestamp,
      lastDetectedAt: timestamp,
      dismissedUntil: null,
      ruleVersion: 'explicit-need-v1',
      generatorKind: 'deterministic',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 2,
    };
  }
}

function handler(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const registered = handlers.get(channel);
  if (registered === undefined) throw new Error(`Canal não registrado: ${channel}`);
  return registered;
}

function event(senderId: number): IpcMainInvokeEvent {
  const frame = {};
  return { sender: { id: senderId, mainFrame: frame }, senderFrame: frame } as never;
}

function ipc(handlers: Map<string, CapturedHandler>): IpcMain {
  return {
    handle: (channel: string, registered: CapturedHandler) => handlers.set(channel, registered),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as never;
}
