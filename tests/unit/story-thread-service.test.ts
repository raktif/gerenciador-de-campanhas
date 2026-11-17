import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { StoryThreadDetails } from '../../src/core/contracts/story-threads';
import type { StoryThreadRepository } from '../../src/db/repositories/story-thread-repository';
import { StoryThreadService } from '../../src/main/services/story-thread-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000001';
const threadId = '20000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-16T14:00:00.000Z';

describe('serviço de Fios Abertos', () => {
  it('cria deterministicamente origem manual ou por sessão e normaliza contexto opcional', () => {
    const repository = new FakeThreadRepository();
    const service = createService(repository);

    service.create({
      campaignId,
      title: '  Promessa  ',
      threadType: 'promise',
      originReason: '  contexto inicial  ',
    });
    expect(repository.created).toMatchObject({
      record: {
        id: threadId,
        campaignId,
        title: 'Promessa',
        threadType: 'promise',
        status: 'open',
        originKind: 'manual',
        originSessionId: null,
        originReason: 'contexto inicial',
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      },
      links: [],
      initialReason: 'contexto inicial',
    });

    service.create({
      campaignId,
      title: 'O minerador desaparecido',
      threadType: 'mystery',
      originKind: 'session',
      sessionId,
      originReason: '  foi notado na mesa  ',
    });
    expect(repository.created?.record).toMatchObject({
      originKind: 'session',
      originSessionId: sessionId,
      originReason: 'foi notado na mesa',
    });
  });

  it('bloqueia leitura e escrita de campanhas ausentes ou inativas antes do repositório', () => {
    const repository = new FakeThreadRepository();
    const service = createService(repository, 'archived');

    expect(() => service.create({ campaignId, title: 'Fio', threadType: 'custom' })).toThrow(
      'A campanha não está ativa para este recurso.',
    );
    expect(() => service.get({ campaignId, id: threadId })).toThrow(
      'A campanha não está ativa para este recurso.',
    );
    expect(repository.createCalls).toBe(0);
    expect(repository.findCalls).toBe(0);

    const missingCampaignService = createService(repository, null);
    expect(() =>
      missingCampaignService.update({
        campaignId,
        id: threadId,
        revision: 1,
        patch: { title: 'Bloqueado' },
      }),
    ).toThrow('A campanha não foi encontrada.');
    expect(repository.updateCalls).toBe(0);
  });

  it('encaminha transição explícita, campanha, revisão e proveniência normalizada', () => {
    const repository = new FakeThreadRepository();
    const service = createService(repository);

    service.reopen({
      campaignId,
      id: threadId,
      revision: 4,
      reason: '  decisão do narrador  ',
      sessionId,
    });

    expect(repository.transitionInput).toMatchObject({
      campaignId,
      id: threadId,
      revision: 4,
      action: 'reopen',
      reason: 'decisão do narrador',
      sessionId,
    });
    expect(repository.transitionTimestamp).toBe(timestamp);
  });
});

function createService(
  repository: FakeThreadRepository,
  status: Campaign['status'] | null = 'active',
): StoryThreadService {
  return new StoryThreadService({
    repository: repository as unknown as StoryThreadRepository,
    campaigns: {
      findById: (id) => (id === campaignId && status !== null ? makeCampaign(status) : null),
    },
    createId: () => threadId,
    now: () => timestamp,
  });
}

function makeCampaign(status: Campaign['status']): Campaign {
  return {
    id: campaignId,
    name: 'Campanha',
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    coverAttachmentId: null,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: status === 'archived' ? timestamp : null,
    revision: 1,
  };
}

class FakeThreadRepository {
  public created:
    | {
        record: Record<string, unknown>;
        links: unknown[];
        initialReason: string | null;
      }
    | undefined;
  public createCalls = 0;
  public findCalls = 0;
  public updateCalls = 0;
  public transitionInput: Record<string, unknown> | undefined;
  public transitionTimestamp: string | undefined;

  public create(record: Record<string, unknown>, links: unknown[], initialReason: string | null) {
    this.createCalls += 1;
    this.created = { record, links, initialReason };
    return {} as StoryThreadDetails;
  }

  public findById() {
    this.findCalls += 1;
    return null;
  }

  public list() {
    return { items: [], total: 0, nextCursor: null };
  }

  public listTargets() {
    return { items: [], nextCursor: null };
  }

  public update() {
    this.updateCalls += 1;
    return {} as StoryThreadDetails;
  }

  public transition(input: Record<string, unknown>, timestampValue: string) {
    this.transitionInput = input;
    this.transitionTimestamp = timestampValue;
    return {} as StoryThreadDetails;
  }
}
