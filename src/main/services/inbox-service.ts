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
  ConvertInboxItemToRelationshipInput,
  ConvertInboxItemToAssertionInput,
  ConvertInboxItemToEventInput,
  ConvertInboxItemToNoteInput,
  InboxEntityConversionResult,
  InboxRelationshipConversionResult,
  InboxAssertionConversionResult,
  InboxEventConversionResult,
  InboxNoteConversionResult,
} from '../../core/contracts/inbox';
import type { Entity } from '../../core/contracts/entities';
import type { Assertion } from '../../core/contracts/assertions';
import type { Event, EventEntityLinkInput } from '../../core/contracts/events';
import type { Note, NoteEntityLinkInput } from '../../core/contracts/notes';
import type { Relationship } from '../../core/contracts/relationships';
import type { EntityType } from '../../core/contracts/entity-types';
import type { Session } from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';
import type { RelationshipService } from './relationship-service';

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
  convertToRelationship?(
    input: { campaignId: string; id: string; revision: number },
    relationship: Relationship,
    createdEntities: Entity[],
    sourceId: string,
    timestamp: string,
  ): Omit<InboxRelationshipConversionResult, 'warnings'>;
  convertToAssertion?(
    input: { campaignId: string; id: string; revision: number },
    assertion: Assertion,
    sourceId: string,
    timestamp: string,
  ): InboxAssertionConversionResult;
  convertToNote?(
    input: { campaignId: string; id: string; revision: number },
    note: Note,
    links: NoteEntityLinkInput[],
    sourceId: string,
    timestamp: string,
  ): InboxNoteConversionResult;
  convertToEvent?(
    input: { campaignId: string; id: string; revision: number },
    event: Event,
    links: EventEntityLinkInput[],
    sourceId: string,
    timestamp: string,
  ): InboxEventConversionResult;
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

export interface InboxEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
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
      entities?: InboxEntityLookupPort;
      relationships?: Pick<RelationshipService, 'validateAndNormalize' | 'duplicateWarnings'>;
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

  public convertToRelationship(
    input: ConvertInboxItemToRelationshipInput,
  ): InboxRelationshipConversionResult {
    const current = this.requireConvertibleItem(input);
    if (
      this.dependencies.entities === undefined ||
      this.dependencies.relationships === undefined ||
      this.dependencies.repository.convertToRelationship === undefined
    )
      throw new AppError('INBOX_CONVERSION_UNAVAILABLE', 'A conversÃ£o nÃ£o estÃ¡ disponÃ­vel.');
    if (current.originKind === 'session' && current.sessionId === null)
      throw new AppError(
        'INVALID_INBOX_ORIGIN',
        'A captura de sessÃ£o nÃ£o possui sessÃ£o de origem.',
      );
    const timestamp = this.now();
    const sourceId = this.createId();
    const createdEntities: Entity[] = [];
    const source = this.resolveRelationshipEndpoint(
      input.campaignId,
      input.destination.source,
      current,
      sourceId,
      timestamp,
      createdEntities,
    );
    const target = this.resolveRelationshipEndpoint(
      input.campaignId,
      input.destination.target,
      current,
      sourceId,
      timestamp,
      createdEntities,
    );
    const relationshipId = this.createId();
    const normalized = this.dependencies.relationships.validateAndNormalize(
      input.campaignId,
      {
        relationshipTypeId: input.destination.relationshipTypeId,
        sourceEntityId: source.id,
        targetEntityId: target.id,
        description: input.destination.description,
        strength: input.destination.strength,
        canonState: input.destination.canonState,
        knowledgeState: input.destination.knowledgeState,
        visibility: input.destination.visibility,
        originKind: current.originKind,
        sourceId,
        validFromEventId: input.destination.validFromEventId,
        validToEventId: input.destination.validToEventId,
      },
      source,
      target,
    );
    const relationship: Relationship = {
      id: relationshipId,
      campaignId: input.campaignId,
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    };
    const warnings = this.dependencies.relationships.duplicateWarnings(relationship);
    const result = this.dependencies.repository.convertToRelationship(
      input,
      relationship,
      createdEntities,
      sourceId,
      timestamp,
    );
    return { ...result, warnings };
  }

  public convertToAssertion(
    input: ConvertInboxItemToAssertionInput,
  ): InboxAssertionConversionResult {
    const current = this.requireConvertibleItem(input);
    if (
      this.dependencies.entities === undefined ||
      this.dependencies.repository.convertToAssertion === undefined
    )
      throw new AppError('INBOX_CONVERSION_UNAVAILABLE', 'A conversão não está disponível.');
    if (current.originKind === 'session' && current.sessionId === null)
      throw new AppError(
        'INVALID_INBOX_ORIGIN',
        'A captura de sessão não possui sessão de origem.',
      );

    this.requireActiveAssertionEntity(
      input.campaignId,
      input.destination.subjectEntityId,
      'sujeito',
    );
    if (input.destination.objectEntityId !== null)
      this.requireActiveAssertionEntity(
        input.campaignId,
        input.destination.objectEntityId,
        'objeto',
      );
    this.validateAssertionContent(input.destination);

    const timestamp = this.now();
    const sourceId = this.createId();
    const assertion: Assertion = {
      id: this.createId(),
      campaignId: input.campaignId,
      subjectEntityId: input.destination.subjectEntityId,
      predicate: input.destination.predicate,
      objectEntityId: input.destination.objectEntityId,
      statement: input.destination.statement,
      value: input.destination.value,
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
    return this.dependencies.repository.convertToAssertion(input, assertion, sourceId, timestamp);
  }

  public convertToNote(input: ConvertInboxItemToNoteInput): InboxNoteConversionResult {
    const current = this.requireConvertibleItem(input);
    if (
      this.dependencies.entities === undefined ||
      this.dependencies.repository.convertToNote === undefined
    )
      throw new AppError('INBOX_CONVERSION_UNAVAILABLE', 'A conversão não está disponível.');
    if (current.originKind === 'session' && current.sessionId === null)
      throw new AppError(
        'INVALID_INBOX_ORIGIN',
        'A captura de sessão não possui sessão de origem.',
      );
    for (const link of input.destination.links)
      this.requireActiveAssertionEntity(input.campaignId, link.entityId, 'objeto');
    const timestamp = this.now();
    const sourceId = this.createId();
    const note: Note = {
      id: this.createId(),
      campaignId: input.campaignId,
      title: input.destination.title,
      bodyMarkdown: input.destination.bodyMarkdown,
      noteType: input.destination.noteType,
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
    return this.dependencies.repository.convertToNote(
      input,
      note,
      input.destination.links,
      sourceId,
      timestamp,
    );
  }

  public convertToEvent(input: ConvertInboxItemToEventInput): InboxEventConversionResult {
    const current = this.requireConvertibleItem(input);
    if (
      this.dependencies.entities === undefined ||
      this.dependencies.repository.convertToEvent === undefined
    )
      throw new AppError('INBOX_CONVERSION_UNAVAILABLE', 'A conversão não está disponível.');
    if (current.originKind === 'session' && current.sessionId === null)
      throw new AppError(
        'INVALID_INBOX_ORIGIN',
        'A captura de sessão não possui sessão de origem.',
      );
    if (input.destination.sessionId !== null)
      this.requireSession(input.campaignId, input.destination.sessionId);
    for (const link of input.destination.links)
      this.requireActiveAssertionEntity(input.campaignId, link.entityId, 'objeto');
    const timestamp = this.now();
    const sourceId = this.createId();
    const event: Event = {
      id: this.createId(),
      campaignId: input.campaignId,
      sessionId: input.destination.sessionId,
      title: input.destination.title,
      descriptionMarkdown: input.destination.descriptionMarkdown,
      eventOrder: input.destination.eventOrder,
      occurredAtLabel: input.destination.occurredAtLabel,
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
    return this.dependencies.repository.convertToEvent(
      input,
      event,
      input.destination.links,
      sourceId,
      timestamp,
    );
  }

  private resolveRelationshipEndpoint(
    campaignId: string,
    endpoint: ConvertInboxItemToRelationshipInput['destination']['source'],
    item: InboxItem,
    sourceId: string,
    timestamp: string,
    createdEntities: Entity[],
  ): Entity {
    if (endpoint.mode === 'existing') {
      const entity = this.dependencies.entities?.findById(campaignId, endpoint.entityId) ?? null;
      if (entity === null)
        throw new AppError('ENTITY_NOT_FOUND', 'A entidade nÃ£o foi encontrada nesta campanha.', {
          campaignId,
          id: endpoint.entityId,
        });
      return entity;
    }
    const entityType =
      this.dependencies.entityTypes?.findById(campaignId, endpoint.entityTypeId) ?? null;
    if (entityType === null)
      throw new AppError('ENTITY_TYPE_NOT_FOUND', 'O tipo de entidade nÃ£o foi encontrado.');
    if (entityType.isArchived)
      throw new AppError('INVALID_ENTITY_TYPE_STATE', 'O tipo de entidade estÃ¡ arquivado.');
    const entity: Entity = {
      id: this.createId(),
      campaignId,
      entityTypeId: endpoint.entityTypeId,
      name: endpoint.name,
      summary: endpoint.summary,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: item.originKind,
      sourceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    };
    createdEntities.push(entity);
    return entity;
  }

  private requireConvertibleItem(
    input:
      | ConvertInboxItemToEntityInput
      | ConvertInboxItemToRelationshipInput
      | ConvertInboxItemToAssertionInput
      | ConvertInboxItemToNoteInput
      | ConvertInboxItemToEventInput,
  ): InboxItem {
    const current = this.requireItem(input.campaignId, input.id);
    if (current.revision !== input.revision)
      throw new AppError('REVISION_CONFLICT', 'A captura foi alterada em outra operaÃ§Ã£o.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    if (current.status !== 'reviewing')
      throw new AppError('INVALID_INBOX_CONVERSION_STATE', 'A captura precisa estar em revisÃ£o.');
    return current;
  }

  private requireActiveAssertionEntity(
    campaignId: string,
    entityId: string,
    role: 'sujeito' | 'objeto',
  ): Entity {
    const entity = this.dependencies.entities?.findById(campaignId, entityId) ?? null;
    if (entity === null)
      throw new AppError('ENTITY_NOT_FOUND', 'A entidade da afirmação não foi encontrada.', {
        campaignId,
        id: entityId,
        role,
      });
    if (entity.archivedAt !== null)
      throw new AppError('INVALID_ENTITY_STATE', `A entidade usada como ${role} está arquivada.`, {
        entityId,
        role,
      });
    return entity;
  }

  private validateAssertionContent(input: ConvertInboxItemToAssertionInput['destination']): void {
    if (
      input.statement !== null ||
      (input.predicate !== null && (input.objectEntityId !== null || input.value !== null))
    )
      return;
    throw new AppError(
      'INVALID_ASSERTION_CONTENT',
      'Informe uma declaração textual ou um predicado acompanhado de objeto ou valor.',
    );
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
