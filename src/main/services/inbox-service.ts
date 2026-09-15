import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type {
  CaptureInboxItemInput,
  GetInboxItemInput,
  InboxItem,
  InboxLifecycleInput,
  InboxPageRequest,
  InboxPageResult,
} from '../../core/contracts/inbox';
import type { Session } from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';

export interface InboxRepositoryPort {
  insert(item: InboxItem): InboxItem;
  findById(campaignId: string, id: string): InboxItem | null;
  list(request: InboxPageRequest): InboxPageResult;
  updateStatus(
    input: InboxLifecycleInput,
    status: InboxItem['status'],
    updatedAt: string,
  ): InboxItem;
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

  public get(input: GetInboxItemInput): InboxItem {
    return this.requireItem(input.campaignId, input.id);
  }

  public list(input: InboxPageRequest): InboxPageResult {
    this.requireCampaign(input.campaignId);
    if (input.filters.sessionId !== undefined)
      this.requireSession(input.campaignId, input.filters.sessionId);
    return this.dependencies.repository.list(input);
  }

  public beginReview(input: InboxLifecycleInput): InboxItem {
    return this.transition(input, ['new', 'dismissed'], 'reviewing', 'INVALID_INBOX_REVIEW_STATE');
  }

  public dismiss(input: InboxLifecycleInput): InboxItem {
    return this.transition(input, ['new', 'reviewing'], 'dismissed', 'INVALID_INBOX_DISMISS_STATE');
  }

  public archive(input: InboxLifecycleInput): InboxItem {
    return this.transition(
      input,
      ['new', 'reviewing', 'dismissed'],
      'archived',
      'INVALID_INBOX_ARCHIVE_STATE',
    );
  }

  public restore(input: InboxLifecycleInput): InboxItem {
    return this.transition(input, ['archived'], 'new', 'INVALID_INBOX_RESTORE_STATE');
  }

  private transition(
    input: InboxLifecycleInput,
    allowedCurrent: InboxItem['status'][],
    next: InboxItem['status'],
    invalidCode: string,
  ): InboxItem {
    const current = this.requireItem(input.campaignId, input.id);
    if (current.revision !== input.revision)
      throw new AppError('REVISION_CONFLICT', 'A captura foi alterada em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    if (!allowedCurrent.includes(current.status))
      throw new AppError(invalidCode, 'A transição de estado da captura não é permitida.', {
        currentStatus: current.status,
        nextStatus: next,
      });
    return this.dependencies.repository.updateStatus(input, next, this.now());
  }

  private requireItem(campaignId: string, id: string): InboxItem {
    const item = this.dependencies.repository.findById(campaignId, id);
    if (item === null)
      throw new AppError('INBOX_ITEM_NOT_FOUND', 'A captura não foi encontrada.', {
        campaignId,
        id,
      });
    return item;
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
