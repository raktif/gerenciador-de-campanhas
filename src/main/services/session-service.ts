import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type {
  CreateSessionInput,
  GetSessionInput,
  Session,
  SessionPageRequest,
  SessionPageResult,
  UpdateSessionInput,
} from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';
import type { SessionRepositoryUpdate } from '../../db/repositories/session-repository';

export interface SessionRepositoryPort {
  insert(session: Session): Session;
  findById(campaignId: string, id: string): Session | null;
  list(request: SessionPageRequest): SessionPageResult;
  update(input: SessionRepositoryUpdate, updatedAt: string): Session;
}

export interface SessionCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export class SessionService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: SessionRepositoryPort;
      campaigns: SessionCampaignLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateSessionInput): Session {
    this.requireCampaign(input.campaignId);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      ...input,
      status: 'planned',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
  }

  public get(input: GetSessionInput): Session {
    return this.requireSession(input.campaignId, input.id);
  }

  public list(input: SessionPageRequest): SessionPageResult {
    this.requireCampaign(input.campaignId);
    return this.dependencies.repository.list(input);
  }

  public update(input: UpdateSessionInput): Session {
    const current = this.requireSession(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (input.patch.status !== undefined) {
      this.assertTransition(current.status, input.patch.status);
      if (current.status === 'planned' && input.patch.status === 'in_progress')
        this.assertPreviousSessionsCompleted(current);
    }
    return this.dependencies.repository.update(input, this.now());
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { campaignId });
    return campaign;
  }

  private requireSession(campaignId: string, id: string): Session {
    const session = this.dependencies.repository.findById(campaignId, id);
    if (session === null)
      throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada.', { campaignId, id });
    return session;
  }

  private requireRevision(session: Session, revision: number): void {
    if (session.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'A sessão foi alterada em outra operação.', {
        expectedRevision: revision,
        currentRevision: session.revision,
        current: session,
      });
  }

  private assertTransition(from: Session['status'], to: Session['status']): void {
    const allowed =
      (from === 'planned' && (to === 'in_progress' || to === 'cancelled')) ||
      (from === 'in_progress' && (to === 'completed' || to === 'cancelled'));
    if (!allowed)
      throw new AppError(
        'INVALID_SESSION_TRANSITION',
        'A transição de status da sessão é inválida.',
        {
          from,
          to,
        },
      );
  }

  private assertPreviousSessionsCompleted(session: Session): void {
    let cursor: string | undefined;
    do {
      const page = this.dependencies.repository.list({
        campaignId: session.campaignId,
        limit: 100,
        filters: {},
        sort: 'sequenceNumber',
        order: 'asc',
        ...(cursor === undefined ? {} : { cursor }),
      });
      const previous = page.items.find(
        (candidate) =>
          candidate.sequenceNumber < session.sequenceNumber && candidate.status !== 'completed',
      );
      if (previous !== undefined)
        throw new AppError(
          'PREVIOUS_SESSIONS_INCOMPLETE',
          'Conclua todas as sessões anteriores antes de iniciar esta sessão.',
          {
            sessionId: session.id,
            sequenceNumber: session.sequenceNumber,
            previousSessionId: previous.id,
            previousSequenceNumber: previous.sequenceNumber,
            previousStatus: previous.status,
          },
        );
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
  }
}
