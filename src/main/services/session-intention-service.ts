import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type { Entity } from '../../core/contracts/entities';
import type {
  CreateSessionIntentionInput,
  GetSessionIntentionInput,
  Session,
  SessionIntention,
  SessionIntentionPageRequest,
  SessionIntentionPageResult,
  UpdateSessionIntentionInput,
} from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';
import type { SessionIntentionRepositoryUpdate } from '../../db/repositories/session-intention-repository';

export interface SessionIntentionRepositoryPort {
  insert(intention: SessionIntention): SessionIntention;
  findById(campaignId: string, sessionId: string, id: string): SessionIntention | null;
  list(request: SessionIntentionPageRequest): SessionIntentionPageResult;
  update(input: SessionIntentionRepositoryUpdate, updatedAt: string): SessionIntention;
}

export interface SessionIntentionCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export interface SessionIntentionSessionLookupPort {
  findById(campaignId: string, id: string): Session | null;
}

export interface SessionIntentionEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
}

export class SessionIntentionService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: SessionIntentionRepositoryPort;
      campaigns: SessionIntentionCampaignLookupPort;
      sessions: SessionIntentionSessionLookupPort;
      entities: SessionIntentionEntityLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateSessionIntentionInput): SessionIntention {
    this.requireCampaign(input.campaignId);
    this.requireSession(input.campaignId, input.sessionId);
    if (input.entityId !== null) this.requireActiveEntity(input.campaignId, input.entityId);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      sessionId: input.sessionId,
      entityId: input.entityId,
      text: input.text,
      status: 'open',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
  }

  public get(input: GetSessionIntentionInput): SessionIntention {
    this.requireCampaign(input.campaignId);
    this.requireSession(input.campaignId, input.sessionId);
    return this.requireIntention(input.campaignId, input.sessionId, input.id);
  }

  public list(input: SessionIntentionPageRequest): SessionIntentionPageResult {
    this.requireCampaign(input.campaignId);
    this.requireSession(input.campaignId, input.sessionId);
    if (input.filters.entityId !== undefined)
      this.requireEntity(input.campaignId, input.filters.entityId);
    return this.dependencies.repository.list(input);
  }

  public update(input: UpdateSessionIntentionInput): SessionIntention {
    this.requireCampaign(input.campaignId);
    this.requireSession(input.campaignId, input.sessionId);
    const current = this.requireIntention(input.campaignId, input.sessionId, input.id);
    this.requireRevision(current, input.revision);
    if (input.patch.entityId !== undefined && input.patch.entityId !== null)
      this.requireActiveEntity(input.campaignId, input.patch.entityId);
    if (input.patch.status !== undefined) this.assertTransition(current.status, input.patch.status);
    return this.dependencies.repository.update(input, this.now());
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { campaignId });
    return campaign;
  }

  private requireSession(campaignId: string, id: string): Session {
    const session = this.dependencies.sessions.findById(campaignId, id);
    if (session === null)
      throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada.', { campaignId, id });
    return session;
  }

  private requireIntention(campaignId: string, sessionId: string, id: string): SessionIntention {
    const intention = this.dependencies.repository.findById(campaignId, sessionId, id);
    if (intention === null)
      throw new AppError('SESSION_INTENTION_NOT_FOUND', 'A intenção não foi encontrada.', {
        campaignId,
        sessionId,
        id,
      });
    return intention;
  }

  private requireEntity(campaignId: string, id: string): Entity {
    const entity = this.dependencies.entities.findById(campaignId, id);
    if (entity === null)
      throw new AppError('ENTITY_NOT_FOUND', 'A entidade relacionada não foi encontrada.', {
        campaignId,
        id,
      });
    return entity;
  }

  private requireActiveEntity(campaignId: string, id: string): Entity {
    const entity = this.requireEntity(campaignId, id);
    if (entity.archivedAt !== null)
      throw new AppError('INVALID_ENTITY_STATE', 'A entidade relacionada está arquivada.', {
        entityId: entity.id,
      });
    return entity;
  }

  private requireRevision(intention: SessionIntention, revision: number): void {
    if (intention.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'A intenção foi alterada em outra operação.', {
        expectedRevision: revision,
        currentRevision: intention.revision,
        current: intention,
      });
  }

  private assertTransition(from: SessionIntention['status'], to: SessionIntention['status']): void {
    if (from === 'open' && (to === 'completed' || to === 'abandoned' || to === 'transformed'))
      return;
    throw new AppError(
      'INVALID_SESSION_INTENTION_TRANSITION',
      'A transição da intenção é inválida.',
      {
        from,
        to,
      },
    );
  }
}
