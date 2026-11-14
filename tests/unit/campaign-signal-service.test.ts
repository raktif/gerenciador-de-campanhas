import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/core/errors/app-error';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { CampaignSignalReviewItem } from '../../src/core/contracts/campaign-signal-engine';
import type { CampaignSignal } from '../../src/core/contracts/campaign-signals';
import { CampaignSignalService } from '../../src/main/services/campaign-signal-service';
import type {
  ExplicitNeedDetection,
  ExplicitNeedInput,
} from '../../src/core/domain/campaign-signal';
import { campaignSignalRecalculationResultSchema } from '../../src/core/contracts/campaign-signal-engine';
import { detectExplicitNeeds } from '../../src/core/domain/campaign-signal';
import type { CampaignSignalRepositoryPort } from '../../src/main/services/campaign-signal-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const signalId = '10000000-0000-4000-8000-000000000001';
const now = '2026-11-14T14:00:00.000Z';

describe('serviço de sinais da campanha', () => {
  it('consulta contextual exige campanha ativa e propaga indisponibilidade sem alterar estado', () => {
    const repository = new FakeSignalRepository();
    const input = { campaignId, id: signalId, revision: 1 };
    expect(() => createService(repository).getContradictionReview(input)).toThrow(
      'Par indisponível.',
    );
    expect(() =>
      createService(repository).getContradictionReview({
        ...input,
        campaignId: '00000000-0000-4000-8000-000000000099',
      }),
    ).toThrow('A campanha não foi encontrada.');
    for (const status of ['archived', 'deleted'] as const)
      expect(() => createService(repository, status).getContradictionReview(input)).toThrow(
        'Somente campanhas ativas',
      );
    expect(repository.updateCalls).toBe(0);
    expect(repository.recalculateCalls).toBe(0);
  });
  it('encaminha recálculo puro e mantém o escopo obrigatório da campanha', () => {
    const repository = new FakeSignalRepository();
    const service = createService(repository);

    const result = service.recalculate({ campaignId });

    expect(result.detectedCount).toBe(1);
    expect(repository.reconciledCampaignId).toBe(campaignId);
    expect(repository.reconciledDetections[0]).toMatchObject({
      signalType: 'explicit_need',
      priority: 'high',
    });
    expect(repository.reconciledAt).toBe(now);
    expect(repository.reconciledDetectedIds.size).toBe(1);
    expect(() => service.list({ campaignId: '00000000-0000-4000-8000-000000000099' })).toThrow(
      'A campanha não foi encontrada.',
    );
  });

  it('valida transições, prazo futuro e revisão otimista antes de gravar ações', () => {
    const repository = new FakeSignalRepository();
    const service = createService(repository);
    expect(service.review({ campaignId, id: signalId, revision: 1 }).status).toBe('viewed');
    expect(() => service.review({ campaignId, id: signalId, revision: 1 })).toThrow(
      'O sinal foi alterado em outra operação.',
    );

    const currentRevision = repository.signal.revision;
    expect(() =>
      service.snooze({
        campaignId,
        id: signalId,
        revision: currentRevision,
        dismissedUntil: '2026-11-14T13:59:59.000Z',
      }),
    ).toThrow('O prazo para adiar o sinal precisa estar no futuro.');
    expect(
      service.snooze({
        campaignId,
        id: signalId,
        revision: currentRevision,
        dismissedUntil: '2026-11-15T14:00:00.000Z',
      }).status,
    ).toBe('snoozed');
    expect(() =>
      service.dismiss({
        campaignId,
        id: signalId,
        revision: repository.signal.revision,
      }),
    ).not.toThrow();
    expect(repository.signal.status).toBe('dismissed');
  });

  it('impede reativação de sinais convertidos ou resolvidos', () => {
    const repository = new FakeSignalRepository();
    const service = createService(repository);
    repository.signal = { ...repository.signal, status: 'resolved' };
    expect(() =>
      service.reactivate({ campaignId, id: signalId, revision: repository.signal.revision }),
    ).toThrow('Esta ação não é permitida para o estado atual do sinal.');
  });

  it('marca exceção somente para contradição e usa revisão otimista', () => {
    const repository = new FakeSignalRepository();
    const service = createService(repository);
    expect(() =>
      service.markContradictionException({ campaignId, id: signalId, revision: 1 }),
    ).toThrow('Somente uma possível contradição pode ser marcada como exceção.');
    repository.signal = { ...repository.signal, signalType: 'potential_contradiction' };
    const resolved = service.markContradictionException({
      campaignId,
      id: signalId,
      revision: 1,
    });
    expect(resolved.status).toBe('resolved');
    expect(repository.exceptionCalls).toBe(1);
    expect(() =>
      service.markContradictionException({ campaignId, id: signalId, revision: 1 }),
    ).toThrow('O sinal foi alterado em outra operação.');
  });

  it.each(['archived', 'deleted'] as const)(
    'permite apenas leitura sem expiração e rejeita mutações quando a campanha está %s',
    (status) => {
      const repository = new FakeSignalRepository();
      const service = createService(repository, status);

      expect(service.list({ campaignId }).items).toHaveLength(1);
      expect(repository.expireCalls).toBe(0);
      expect(() => service.recalculate({ campaignId })).toThrow(
        'Somente campanhas ativas podem revisar sinais.',
      );
      expect(() => service.review({ campaignId, id: signalId, revision: 1 })).toThrow(
        'Somente campanhas ativas podem revisar sinais.',
      );
      expect(() => service.dismiss({ campaignId, id: signalId, revision: 1 })).toThrow(
        'Somente campanhas ativas podem revisar sinais.',
      );
      expect(() => service.reactivate({ campaignId, id: signalId, revision: 1 })).toThrow(
        'Somente campanhas ativas podem revisar sinais.',
      );
      expect(() =>
        service.snooze({
          campaignId,
          id: signalId,
          revision: 1,
          dismissedUntil: '2026-11-15T14:00:00.000Z',
        }),
      ).toThrow('Somente campanhas ativas podem revisar sinais.');
      expect(() =>
        service.markContradictionException({ campaignId, id: signalId, revision: 1 }),
      ).toThrow('Somente campanhas ativas podem revisar sinais.');
      expect(repository.signal).toEqual(signal());
      expect(repository.recalculateCalls).toBe(0);
      expect(repository.updateCalls).toBe(0);
    },
  );
});

function createService(
  repository: FakeSignalRepository,
  status: Campaign['status'] = 'active',
): CampaignSignalService {
  repository.activeCampaign = status === 'active';
  return new CampaignSignalService({
    repository,
    campaigns: {
      findById: (id) => (id === campaignId ? ({ id, status } as Campaign) : null),
    },
    now: () => now,
  });
}

class FakeSignalRepository implements CampaignSignalRepositoryPort {
  public getContradictionReview(): never {
    throw new AppError('POTENTIAL_CONTRADICTION_NO_LONGER_DETECTED', 'Par indisponível.');
  }
  public signal = signal();
  public reconciledCampaignId = '';
  public reconciledDetections: readonly ExplicitNeedDetection[] = [];
  public reconciledAt = '';
  public reconciledDetectedIds: ReadonlySet<string> = new Set();
  public expireCalls = 0;
  public recalculateCalls = 0;
  public updateCalls = 0;
  public exceptionCalls = 0;
  public activeCampaign = true;

  public list(): CampaignSignalReviewItem[] {
    return [{ signal: this.signal, evidence: [] }];
  }
  public listAndExpireSnoozes(): { items: CampaignSignalReviewItem[]; expiredSnoozes: number } {
    if (this.activeCampaign) {
      this.expireCalls += 1;
      detectExplicitNeeds(this.inputs());
    }
    return { items: this.list(), expiredSnoozes: 0 };
  }
  public findById(_campaignId: string, id: string): CampaignSignal | null {
    return id === signalId ? this.signal : null;
  }
  public recalculate(campaign: string, now: string) {
    this.recalculateCalls += 1;
    const detections = detectExplicitNeeds(this.inputs());
    this.reconciledCampaignId = campaign;
    this.reconciledDetections = detections;
    this.reconciledAt = now;
    this.reconciledDetectedIds = new Set(detections.map(({ signalId }) => signalId));
    return campaignSignalRecalculationResultSchema.parse({
      items: this.list(),
      detectedCount: detections.length,
      expiredSnoozes: 0,
    });
  }
  public updateStatus(
    _campaignId: string,
    id: string,
    revision: number,
    status: CampaignSignal['status'],
    dismissedUntil: string | null,
    updatedAt: string,
  ): CampaignSignal {
    this.updateCalls += 1;
    if (this.signal.id !== id || this.signal.revision !== revision)
      throw new Error('REVISION_CONFLICT');
    this.signal = {
      ...this.signal,
      status,
      dismissedUntil,
      updatedAt,
      revision: revision + 1,
    };
    return this.signal;
  }

  public markContradictionException(
    _campaignId: string,
    id: string,
    revision: number,
    createdAt: string,
  ): CampaignSignal {
    if (this.signal.id !== id || this.signal.revision !== revision)
      throw new Error('REVISION_CONFLICT');
    this.exceptionCalls += 1;
    this.signal = { ...this.signal, status: 'resolved', revision: this.signal.revision + 1 };
    this.signal.updatedAt = createdAt;
    return this.signal;
  }

  private inputs(): ExplicitNeedInput[] {
    return [
      {
        campaignId,
        entityId: '20000000-0000-4000-8000-000000000001',
        entityName: 'Gorel',
        fieldDefinitionId: '30000000-0000-4000-8000-000000000001',
        fieldLabel: 'Necessidade',
        value: 'Entender os cabos',
      },
    ];
  }
}

function signal(): CampaignSignal {
  return {
    id: signalId,
    campaignId,
    signalType: 'explicit_need',
    title: 'Necessidade explícita: Gorel',
    summary: 'Entender os cabos',
    priority: 'high',
    status: 'new',
    generatedAt: now,
    lastDetectedAt: now,
    dismissedUntil: null,
    ruleVersion: 'explicit-need-v1',
    generatorKind: 'deterministic',
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}
