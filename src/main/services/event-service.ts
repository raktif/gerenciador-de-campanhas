import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type { Entity } from '../../core/contracts/entities';
import type {
  CreateEventInput,
  Event,
  EventDetails,
  EventEntityLinkInput,
  EventEntityLinkPersistenceInput,
  EventLifecycleInput,
  EventPageRequest,
  EventPageResult,
  GetEventInput,
  UpdateEventInput,
} from '../../core/contracts/events';
import type { Session } from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';
import type {
  EventRepositoryUpdate,
  EventSourceContext,
} from '../../db/repositories/event-repository';

export interface EventRepositoryPort {
  insert(event: Event, links: EventEntityLinkPersistenceInput[]): EventDetails;
  findById(campaignId: string, id: string): EventDetails | null;
  findSourceContext(id: string): EventSourceContext | null;
  list(request: EventPageRequest): EventPageResult;
  update(input: EventRepositoryUpdate, updatedAt: string): EventDetails;
}

export interface EventCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export interface EventSessionLookupPort {
  findById(campaignId: string, id: string): Session | null;
}

export interface EventEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
}

export class EventService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: EventRepositoryPort;
      campaigns: EventCampaignLookupPort;
      sessions: EventSessionLookupPort;
      entities: EventEntityLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateEventInput): EventDetails {
    this.requireCampaign(input.campaignId);
    this.validateSession(input.campaignId, input.sessionId);
    this.validateLinks(input.campaignId, input.links, true);
    const sourceId = this.resolveSourceId(
      input.campaignId,
      input.originKind,
      input.sourceId,
      input.sourceSessionId,
    );
    const { links, sourceSessionId, ...eventInput } = input;
    void sourceSessionId;
    const timestamp = this.now();
    return this.dependencies.repository.insert(
      {
        id: this.createId(),
        ...eventInput,
        sourceId,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        revision: 1,
      },
      this.withVisualOrder(links),
    );
  }

  public get(input: GetEventInput): EventDetails {
    return this.requireEvent(input.campaignId, input.id);
  }

  public list(input: EventPageRequest): EventPageResult {
    this.requireCampaign(input.campaignId);
    if (input.filters.sessionId !== undefined)
      this.requireSession(input.campaignId, input.filters.sessionId);
    if (input.filters.entityId !== undefined)
      this.requireEntity(input.campaignId, input.filters.entityId);
    return this.dependencies.repository.list(input);
  }

  public update(input: UpdateEventInput): EventDetails {
    const current = this.requireEvent(input.campaignId, input.id);
    this.requireRevision(current.event, input.revision);
    const patch = input.patch ?? {};
    const merged = {
      sessionId: patch.sessionId === undefined ? current.event.sessionId : patch.sessionId,
      originKind: patch.originKind ?? current.event.originKind,
      sourceId: patch.sourceId === undefined ? current.event.sourceId : patch.sourceId,
    };
    this.validateSession(input.campaignId, merged.sessionId);
    const sourceId = this.resolveSourceId(
      input.campaignId,
      merged.originKind,
      merged.sourceId,
      input.sourceSessionId,
      patch.originKind === undefined && current.event.originKind === 'session'
        ? current.event.sourceId
        : undefined,
    );
    if (input.links !== undefined) this.validateLinks(input.campaignId, input.links, true);
    return this.dependencies.repository.update(
      {
        campaignId: input.campaignId,
        id: input.id,
        revision: input.revision,
        patch: { ...patch, sourceId },
        ...(input.links === undefined ? {} : { links: this.withVisualOrder(input.links) }),
      },
      this.now(),
    );
  }

  public archive(input: EventLifecycleInput): EventDetails {
    const current = this.requireEvent(input.campaignId, input.id);
    this.requireRevision(current.event, input.revision);
    if (current.event.archivedAt !== null)
      throw new AppError('INVALID_EVENT_STATE', 'O evento j\u00e1 est\u00e1 arquivado.');
    const timestamp = this.now();
    return this.dependencies.repository.update(
      { ...input, patch: { archivedAt: timestamp } },
      timestamp,
    );
  }

  public restore(input: EventLifecycleInput): EventDetails {
    const current = this.requireEvent(input.campaignId, input.id);
    this.requireRevision(current.event, input.revision);
    if (current.event.archivedAt === null)
      throw new AppError('INVALID_EVENT_STATE', 'O evento j\u00e1 est\u00e1 ativo.');
    this.validateSession(input.campaignId, current.event.sessionId);
    this.validateLinks(
      input.campaignId,
      current.links.map(({ entityId, role }) => ({ entityId, role })),
      true,
    );
    this.validateSource(input.campaignId, current.event.originKind, current.event.sourceId);
    return this.dependencies.repository.update(
      { ...input, patch: { archivedAt: null } },
      this.now(),
    );
  }

  private validateSession(campaignId: string, sessionId: string | null): void {
    if (sessionId !== null) this.requireSession(campaignId, sessionId);
  }

  private validateLinks(
    campaignId: string,
    links: EventEntityLinkInput[],
    requireActive: boolean,
  ): void {
    for (const link of links) {
      const entity = this.requireEntity(campaignId, link.entityId);
      if (requireActive && entity.archivedAt !== null)
        throw new AppError(
          'INVALID_ENTITY_STATE',
          'A entidade vinculada ao evento est\u00e1 arquivada.',
          {
            entityId: entity.id,
            role: link.role,
          },
        );
    }
  }

  private withVisualOrder(links: EventEntityLinkInput[]): EventEntityLinkPersistenceInput[] {
    return links.map((link, sortOrder) => ({ ...link, sortOrder }));
  }

  private validateSource(
    campaignId: string,
    originKind: Event['originKind'],
    sourceId: string | null,
  ): void {
    if (sourceId === null) {
      if (originKind === 'manual') return;
      throw new AppError(
        'EVENT_SOURCE_REQUIRED',
        'A origem informada exige uma fonte correspondente.',
        {
          originKind,
        },
      );
    }
    const source = this.dependencies.repository.findSourceContext(sourceId);
    if (source === null)
      throw new AppError('SOURCE_NOT_FOUND', 'A fonte do evento n\u00e3o foi encontrada.', {
        sourceId,
      });
    if (source.kind !== originKind)
      throw new AppError(
        'EVENT_SOURCE_KIND_MISMATCH',
        'A fonte n\u00e3o corresponde \u00e0 origem do evento.',
        {
          originKind,
          sourceKind: source.kind,
          sourceId,
        },
      );
    if (source.kind === 'session' && source.sessionCampaignId !== campaignId)
      throw new AppError(
        'EVENT_SOURCE_CAMPAIGN_MISMATCH',
        'A fonte de sess\u00e3o n\u00e3o pertence \u00e0 campanha do evento.',
        { campaignId, sourceId },
      );
  }

  private resolveSourceId(
    campaignId: string,
    originKind: Event['originKind'],
    sourceId: string | null,
    sourceSessionId: string | undefined,
    existingSessionSourceId?: string | null,
  ): string | null {
    if (originKind !== 'session') {
      if (sourceSessionId !== undefined)
        throw new AppError(
          'EVENT_SESSION_SOURCE_NOT_APPLICABLE',
          'Selecione uma sessão de origem somente quando a origem for Sessão.',
        );
      if (sourceId === null) return null;
      this.validateSource(campaignId, originKind, sourceId);
      return sourceId;
    }
    const resolvedSessionId = sourceSessionId ?? existingSessionSourceId;
    if (resolvedSessionId === undefined || resolvedSessionId === null)
      throw new AppError(
        'EVENT_SESSION_SOURCE_REQUIRED',
        'Selecione a sessão que originou este evento.',
      );
    if (sourceId !== null && sourceId !== resolvedSessionId)
      throw new AppError(
        'EVENT_SESSION_SOURCE_AMBIGUOUS',
        'A sessão de origem não corresponde à fonte informada.',
      );
    this.requireSession(campaignId, resolvedSessionId);
    this.validateSource(campaignId, 'session', resolvedSessionId);
    return resolvedSessionId;
  }

  private requireEvent(campaignId: string, id: string): EventDetails {
    const event = this.dependencies.repository.findById(campaignId, id);
    if (event === null)
      throw new AppError('EVENT_NOT_FOUND', 'O evento n\u00e3o foi encontrado.', {
        campaignId,
        id,
      });
    return event;
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha n\u00e3o foi encontrada.', {
        campaignId,
      });
    return campaign;
  }

  private requireSession(campaignId: string, id: string): Session {
    const session = this.dependencies.sessions.findById(campaignId, id);
    if (session === null)
      throw new AppError('SESSION_NOT_FOUND', 'A sess\u00e3o n\u00e3o foi encontrada.', {
        campaignId,
        id,
      });
    return session;
  }

  private requireEntity(campaignId: string, id: string): Entity {
    const entity = this.dependencies.entities.findById(campaignId, id);
    if (entity === null)
      throw new AppError(
        'ENTITY_NOT_FOUND',
        'A entidade vinculada ao evento n\u00e3o foi encontrada.',
        {
          campaignId,
          id,
        },
      );
    return entity;
  }

  private requireRevision(event: Event, revision: number): void {
    if (event.revision !== revision)
      throw new AppError(
        'REVISION_CONFLICT',
        'O evento foi alterado em outra opera\u00e7\u00e3o.',
        {
          expectedRevision: revision,
          currentRevision: event.revision,
          current: event,
        },
      );
  }
}
