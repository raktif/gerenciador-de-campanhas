import { describe, expect, it } from 'vitest';
import {
  campaignPageRequestSchema,
  campaignSchema,
  createCampaignInputSchema,
  updateCampaignInputSchema,
  type Campaign,
  type CampaignPageRequest,
  type CampaignPageResult,
} from '../../src/core/contracts/campaigns';
import { AppError } from '../../src/core/errors/app-error';
import type { CampaignRepositoryUpdate } from '../../src/db/repositories/campaign-repository';
import {
  CampaignService,
  type CampaignRepositoryPort,
} from '../../src/main/services/campaign-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const firstTimestamp = '2026-08-27T12:00:00.000Z';
const secondTimestamp = '2026-08-27T13:00:00.000Z';

describe('CampaignService', () => {
  it('cria campanha ativa somente com o nome', () => {
    const repository = new MemoryCampaignRepository();
    const service = createService(repository, firstTimestamp);

    expect(service.create(createCampaignInputSchema.parse({ name: 'Ethéria' }))).toEqual({
      id: campaignId,
      name: 'Ethéria',
      systemName: null,
      concept: null,
      genre: null,
      tone: null,
      summary: null,
      imagePath: null,
      status: 'active',
      createdAt: firstTimestamp,
      updatedAt: firstTimestamp,
      archivedAt: null,
      revision: 1,
    });
  });

  it('consulta, lista e atualiza dados editoriais', () => {
    const repository = new MemoryCampaignRepository([createCampaign()]);
    const service = createService(repository, secondTimestamp);
    const request = campaignPageRequestSchema.parse({});

    expect(service.get({ id: campaignId }).name).toBe('Ethéria');
    expect(service.list(request).items).toHaveLength(1);
    expect(repository.lastListRequest).toBe(request);
    expect(
      service.update(
        updateCampaignInputSchema.parse({
          id: campaignId,
          revision: 1,
          patch: { name: 'Nova Ethéria', summary: 'Campanha em andamento.' },
        }),
      ),
    ).toMatchObject({
      name: 'Nova Ethéria',
      summary: 'Campanha em andamento.',
      updatedAt: secondTimestamp,
      revision: 2,
    });
  });

  it('arquiva campanha ativa com data e revisão novas', () => {
    const repository = new MemoryCampaignRepository([createCampaign()]);
    const service = createService(repository, secondTimestamp);

    expect(service.archive({ id: campaignId, revision: 1 })).toMatchObject({
      status: 'archived',
      archivedAt: secondTimestamp,
      updatedAt: secondTimestamp,
      revision: 2,
    });
  });

  it('restaura campanhas arquivadas ou presentes na lixeira', () => {
    for (const status of ['archived', 'deleted'] as const) {
      const repository = new MemoryCampaignRepository([
        createCampaign({ status, archivedAt: firstTimestamp }),
      ]);
      const service = createService(repository, secondTimestamp);

      expect(service.restore({ id: campaignId, revision: 1 })).toMatchObject({
        status: 'active',
        archivedAt: null,
        revision: 2,
      });
    }
  });

  it('envia campanha ativa ou arquivada para a lixeira sem exclusão física', () => {
    const repository = new MemoryCampaignRepository([createCampaign()]);
    const service = createService(repository, secondTimestamp);

    expect(service.moveToTrash({ id: campaignId, revision: 1 })).toMatchObject({
      status: 'deleted',
      archivedAt: secondTimestamp,
      revision: 2,
    });
    expect(repository.findById(campaignId)).not.toBeNull();
  });

  it('rejeita transições inválidas, revisão obsoleta e campanha ausente', () => {
    const repository = new MemoryCampaignRepository([createCampaign()]);
    const service = createService(repository, secondTimestamp);

    expect(captureAppError(() => service.restore({ id: campaignId, revision: 1 })).code).toBe(
      'INVALID_CAMPAIGN_STATE',
    );
    expect(captureAppError(() => service.archive({ id: campaignId, revision: 2 })).code).toBe(
      'REVISION_CONFLICT',
    );
    expect(
      captureAppError(() => service.get({ id: '00000000-0000-4000-8000-000000000099' })).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
  });
});

class MemoryCampaignRepository implements CampaignRepositoryPort {
  private readonly records = new Map<string, Campaign>();
  public lastListRequest: CampaignPageRequest | null = null;

  public constructor(campaigns: Campaign[] = []) {
    for (const campaign of campaigns) this.records.set(campaign.id, campaign);
  }

  public insert(campaign: Campaign): Campaign {
    this.records.set(campaign.id, campaign);
    return campaign;
  }

  public findById(id: string): Campaign | null {
    return this.records.get(id) ?? null;
  }

  public list(request: CampaignPageRequest): CampaignPageResult {
    this.lastListRequest = request;
    const items = [...this.records.values()].filter(({ status }) =>
      request.filters.statuses.includes(status),
    );
    return { items, nextCursor: null, total: items.length };
  }

  public update(input: CampaignRepositoryUpdate, updatedAt: string): Campaign {
    const current = this.findById(input.id);
    if (current === null) throw new AppError('CAMPAIGN_NOT_FOUND', 'Campanha ausente.');
    if (current.revision !== input.revision) {
      throw new AppError('REVISION_CONFLICT', 'Revisão obsoleta.');
    }
    const updated = campaignSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records.set(updated.id, updated);
    return updated;
  }
}

function createService(repository: CampaignRepositoryPort, timestamp: string): CampaignService {
  return new CampaignService({
    repository,
    createId: () => campaignId,
    now: () => timestamp,
  });
}

function createCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: campaignId,
    name: 'Ethéria',
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    imagePath: null,
    status: 'active',
    createdAt: firstTimestamp,
    updatedAt: firstTimestamp,
    archivedAt: null,
    revision: 1,
    ...overrides,
  };
}

function captureAppError(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria ter lançado AppError.');
}
