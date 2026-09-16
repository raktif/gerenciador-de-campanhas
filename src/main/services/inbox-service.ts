import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type {
  CaptureInboxItemInput,
  GetInboxItemInput,
  InboxItem,
  InboxLifecycleInput,
  InboxPageRequest,
  InboxPageResult,
  ConvertInboxItemToEntityInput,
  InboxEntityConversionResult,
} from '../../core/contracts/inbox';
import type { Entity } from '../../core/contracts/entities';
import type { EntityType } from '../../core/contracts/entity-types';
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
  convertToEntity?(
    input: { campaignId: string; id: string; revision: number },
    entity: Entity,
    sourceId: string,
    timestamp: string,
  ): InboxEntityConversionResult;
}

export interface InboxCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export interface InboxSessionLookupPort {
  findById(campaignId: string, id: string): Session | null;
}

export interface InboxEntityTypeLookupPort {
  findById(campaignId: string, id: string): EntityType | null;
}

export class InboxService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: InboxRepositoryPort;
      campaigns: InboxCampaignLookupPort;
      sessions: InboxSessionLookupPort;
      entityTypes?: InboxEntityTypeLookupPort;
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

  public convertToEntity(input: ConvertInboxItemToEntityInput): InboxEntityConversionResult {
    const current = this.requireItem(input.campaignId, input.id);
    if (current.revision !== input.revision)
      throw new AppError('REVISION_CONFLICT', 'A captura foi alterada em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    if (current.status !== 'reviewing')
      throw new AppError('INVALID_INBOX_CONVERSION_STATE', 'A captura precisa estar em revisão.');
    if (
      this.dependencies.entityTypes === undefined ||
      this.dependencies.repository.convertToEntity === undefined
    )
      throw new AppError('INBOX_CONVERSION_UNAVAILABLE', 'A conversão não está disponível.');
    const entityType = this.dependencies.entityTypes.findById(
      input.campaignId,
      input.destination.entityTypeId,
    );
    if (entityType === null)
      throw new AppError('ENTITY_TYPE_NOT_FOUND', 'O tipo de entidade não foi encontrado.');
    if (entityType.isArchived)
      throw new AppError('INVALID_ENTITY_TYPE_STATE', 'O tipo de entidade está arquivado.');
    if (current.originKind === 'session' && current.sessionId === null)
      throw new AppError(
        'INVALID_INBOX_ORIGIN',
        'A captura de sessão não possui sessão de origem.',
      );
    const timestamp = this.now();
    const sourceId = this.createId();
    const entity: Entity = {
      id: this.createId(),
      campaignId: input.campaignId,
      entityTypeId: input.destination.entityTypeId,
      name: input.destination.name,
      summary: input.destination.summary,
      canonState: input.destination.canonState,
      knowledgeState: input.destination.knowledgeState,
      visibility: input.destination.visibility,
      originKind: current.originKind,
      sourceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    };
    return this.dependencies.repository.convertToEntity(input, entity, sourceId, timestamp);
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
