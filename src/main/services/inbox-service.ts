import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type { CaptureInboxItemInput, InboxItem } from '../../core/contracts/inbox';
import type { Session } from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';

export interface InboxRepositoryPort {
  insert(item: InboxItem): InboxItem;
}

export interface InboxCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export interface InboxSessionLookupPort {
  findById(campaignId: string, id: string): Session | null;
}

export class InboxService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: InboxRepositoryPort;
      campaigns: InboxCampaignLookupPort;
      sessions: InboxSessionLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public capture(input: CaptureInboxItemInput): InboxItem {
    this.requireCampaign(input.campaignId);
    if (input.sessionId !== null) this.requireSession(input.campaignId, input.sessionId);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      ...input,
      status: 'new',
      originKind: input.sessionId === null ? 'manual' : 'session',
      capturedAt: timestamp,
      convertedObjectType: null,
      convertedObjectId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
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
}
