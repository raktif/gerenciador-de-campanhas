import { randomUUID } from 'node:crypto';
import type {
  Campaign,
  CampaignLifecycleInput,
  CampaignPageRequest,
  CampaignPageResult,
  CreateCampaignInput,
  GetCampaignInput,
  UpdateCampaignInput,
} from '../../core/contracts/campaigns';
import { AppError } from '../../core/errors/app-error';
import type { CampaignRepositoryUpdate } from '../../db/repositories/campaign-repository';

export interface CampaignRepositoryPort {
  insert(campaign: Campaign): Campaign;
  findById(id: string): Campaign | null;
  list(request: CampaignPageRequest): CampaignPageResult;
  update(input: CampaignRepositoryUpdate, updatedAt: string): Campaign;
}

export interface CampaignServiceDependencies {
  repository: CampaignRepositoryPort;
  createId?: () => string;
  now?: () => string;
}

export class CampaignService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(private readonly dependencies: CampaignServiceDependencies) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateCampaignInput): Campaign {
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      name: input.name,
      systemName: input.systemName ?? null,
      concept: input.concept ?? null,
      genre: input.genre ?? null,
      tone: input.tone ?? null,
      summary: input.summary ?? null,
      imagePath: input.imagePath ?? null,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    });
  }

  public get(input: GetCampaignInput): Campaign {
    const campaign = this.dependencies.repository.findById(input.id);
    if (campaign === null) throw campaignNotFound(input.id);
    return campaign;
  }

  public list(request: CampaignPageRequest): CampaignPageResult {
    return this.dependencies.repository.list(request);
  }

  public update(input: UpdateCampaignInput): Campaign {
    return this.dependencies.repository.update(input, this.now());
  }

  public archive(input: CampaignLifecycleInput): Campaign {
    const current = this.requireCurrentRevision(input);
    if (current.status !== 'active') {
      throw invalidState(current, 'Somente uma campanha ativa pode ser arquivada.');
    }
    const timestamp = this.now();
    return this.dependencies.repository.update(
      {
        ...input,
        patch: { status: 'archived', archivedAt: timestamp },
      },
      timestamp,
    );
  }

  public restore(input: CampaignLifecycleInput): Campaign {
    const current = this.requireCurrentRevision(input);
    if (current.status === 'active') {
      throw invalidState(current, 'A campanha já está ativa.');
    }
    return this.dependencies.repository.update(
      {
        ...input,
        patch: { status: 'active', archivedAt: null },
      },
      this.now(),
    );
  }

  public moveToTrash(input: CampaignLifecycleInput): Campaign {
    const current = this.requireCurrentRevision(input);
    if (current.status === 'deleted') {
      throw invalidState(current, 'A campanha já está na lixeira.');
    }
    const timestamp = this.now();
    return this.dependencies.repository.update(
      {
        ...input,
        patch: { status: 'deleted', archivedAt: timestamp },
      },
      timestamp,
    );
  }

  private requireCurrentRevision(input: CampaignLifecycleInput): Campaign {
    const current = this.dependencies.repository.findById(input.id);
    if (current === null) throw campaignNotFound(input.id);
    if (current.revision !== input.revision) {
      throw new AppError('REVISION_CONFLICT', 'A campanha foi alterada em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    }
    return current;
  }
}

function campaignNotFound(id: string): AppError {
  return new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { id });
}

function invalidState(campaign: Campaign, message: string): AppError {
  return new AppError('INVALID_CAMPAIGN_STATE', message, {
    id: campaign.id,
    status: campaign.status,
  });
}
