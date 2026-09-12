import type { Campaign } from '../../core/contracts/campaigns';
import type { Entity } from '../../core/contracts/entities';
import type {
  ReplaceSessionParticipantsInput,
  Session,
  SessionParticipant,
  SessionParticipantInput,
} from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';
import type { SessionParticipantsReplace } from '../../db/repositories/session-repository';

export interface SessionParticipantRepositoryPort {
  findById(campaignId: string, id: string): Session | null;
  listParticipants(campaignId: string, sessionId: string): SessionParticipant[];
  replaceParticipants(input: SessionParticipantsReplace, updatedAt: string): SessionParticipant[];
}

export interface SessionParticipantEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
}

export interface SessionParticipantCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export class SessionParticipantService {
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: SessionParticipantRepositoryPort;
      campaigns: SessionParticipantCampaignLookupPort;
      entities: SessionParticipantEntityLookupPort;
      now?: () => string;
    },
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public replace(input: ReplaceSessionParticipantsInput): SessionParticipant[] {
    this.requireCampaign(input.campaignId);
    const session = this.requireSession(input.campaignId, input.sessionId);
    this.requireRevision(session, input.revision);
    this.validateParticipants(input.campaignId, input.participants);
    return this.dependencies.repository.replaceParticipants(input, this.now());
  }

  public list(campaignId: string, sessionId: string): SessionParticipant[] {
    this.requireCampaign(campaignId);
    this.requireSession(campaignId, sessionId);
    return this.dependencies.repository.listParticipants(campaignId, sessionId);
  }

  private requireSession(campaignId: string, id: string): Session {
    const session = this.dependencies.repository.findById(campaignId, id);
    if (session === null)
      throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada.', { campaignId, id });
    return session;
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { campaignId });
    return campaign;
  }

  private requireRevision(session: Session, revision: number): void {
    if (session.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'A sessão foi alterada em outra operação.', {
        expectedRevision: revision,
        currentRevision: session.revision,
        current: session,
      });
  }

  private validateParticipants(campaignId: string, participants: SessionParticipantInput[]): void {
    for (const participant of participants) {
      const entity = this.dependencies.entities.findById(campaignId, participant.entityId);
      if (entity === null)
        throw new AppError(
          'ENTITY_NOT_FOUND',
          'A entidade participante não foi encontrada nesta campanha.',
          { campaignId, entityId: participant.entityId },
        );
      if (entity.archivedAt !== null)
        throw new AppError('INVALID_ENTITY_STATE', 'A entidade participante está arquivada.', {
          entityId: entity.id,
        });
    }
  }
}
