import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { Clock } from '../../src/core/contracts/clocks';
import type { ClockRepository } from '../../src/db/repositories/clock-repository';
import { ClockService } from '../../src/main/services/clock-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const now = '2026-11-16T14:00:00.000Z';

describe('serviço de Relógios', () => {
  it('valida campanha ativa e encaminha criação explícita sem associar divisões a Sessões', () => {
    const repository = new FakeClockRepository();
    const service = createService(repository);
    service.create({
      campaignId,
      idempotencyKey: '30000000-0000-4000-8000-000000000001',
      name: 'Alarme',
      clockType: 'countdown',
      segmentsTotal: 4,
      segmentsFilled: 2,
      entityId,
      consequence: 'A consequência do alarme.',
    });
    expect(repository.created).toMatchObject({
      id,
      campaignId,
      idempotencyKey: '30000000-0000-4000-8000-000000000001',
      name: 'Alarme',
      clockType: 'countdown',
      segmentsTotal: 4,
      segmentsFilled: 2,
      entityId,
      consequence: 'A consequência do alarme.',
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      now,
    });

    const inactive = createService(repository, 'archived');
    expect(() =>
      inactive.create({
        campaignId,
        idempotencyKey: '30000000-0000-4000-8000-000000000002',
        name: 'Bloqueado',
        clockType: 'progress',
        segmentsTotal: 4,
        entityId,
        consequence: 'Bloqueado.',
      }),
    ).toThrow('A campanha não está ativa para relógios.');
    expect(repository.createCalls).toBe(1);
  });

  it('encaminha alteração de preenchimento e conclusão parcial como comandos explícitos revisionados', () => {
    const repository = new FakeClockRepository();
    const service = createService(repository);
    service.update({
      campaignId,
      id,
      revision: 3,
      patch: { segmentsFilled: 4, segmentsTotal: 4 },
      generateEvent: false,
    });
    expect(repository.updateInput).toMatchObject({
      campaignId,
      id,
      revision: 3,
      patch: { segmentsFilled: 4, segmentsTotal: 4 },
      now,
    });
    service.complete({ campaignId, id, revision: 4, generateEvent: false });
    expect(repository.completed).toEqual({
      campaignId,
      id,
      revision: 4,
      generateEvent: false,
      generatedEventId: undefined,
      now,
    });
  });
});

class FakeClockRepository {
  public createCalls = 0;
  public created: unknown;
  public updateInput: unknown;
  public completed: unknown;
  public create(input: unknown): Clock {
    this.createCalls += 1;
    this.created = input;
    return clock();
  }
  public findById(): Clock | null {
    return clock();
  }
  public list() {
    return { items: [], nextCursor: null, total: 0 };
  }
  public update(input: unknown): Clock {
    this.updateInput = input;
    return clock();
  }
  public complete(
    campaignId: string,
    id: string,
    revision: number,
    generateEvent: boolean,
    generatedEventId: string | undefined,
    now: string,
  ): Clock {
    this.completed = { campaignId, id, revision, generateEvent, generatedEventId, now };
    return clock();
  }
}

function createService(repository: FakeClockRepository, status = 'active'): ClockService {
  const campaign: Campaign = {
    id: campaignId,
    name: 'Campanha',
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    coverAttachmentId: null,
    status: status as Campaign['status'],
    createdAt: now,
    updatedAt: now,
    archivedAt: status === 'active' ? null : now,
    revision: 1,
  };
  return new ClockService({
    repository: repository as unknown as ClockRepository,
    campaigns: { findById: (requestedId) => (requestedId === campaignId ? campaign : null) },
    createId: () => id,
    now: () => now,
  });
}

function clock(): Clock {
  return {
    id,
    campaignId,
    name: 'Alarme',
    description: null,
    consequence: 'A consequência do alarme.',
    clockType: 'countdown',
    segmentsTotal: 4,
    segmentsFilled: 2,
    status: 'active',
    entityId,
    entityName: 'Entidade',
    entityArchivedAt: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    sessionId: null,
    generatedEventId: null,
    createdAt: now,
    updatedAt: now,
    revision: 4,
  };
}
