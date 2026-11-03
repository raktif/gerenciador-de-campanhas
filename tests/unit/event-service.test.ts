import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { Entity } from '../../src/core/contracts/entities';
import {
  createEventInputSchema,
  eventDetailsSchema,
  eventSchema,
  updateEventInputSchema,
  type Event,
  type EventDetails,
  type EventEntityLinkPersistenceInput,
  type EventPageResult,
} from '../../src/core/contracts/events';
import type { Session } from '../../src/core/contracts/sessions';
import { AppError } from '../../src/core/errors/app-error';
import type {
  EventRepositoryUpdate,
  EventSourceContext,
} from '../../src/db/repositories/event-repository';
import { EventService, type EventRepositoryPort } from '../../src/main/services/event-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const sessionId = '70000000-0000-4000-8000-000000000001';
const foreignSessionId = '70000000-0000-4000-8000-000000000002';
const entityId = '30000000-0000-4000-8000-000000000001';
const archivedEntityId = '30000000-0000-4000-8000-000000000002';
const foreignEntityId = '30000000-0000-4000-8000-000000000003';
const timestamp = '2026-09-10T12:00:00.000Z';

describe('EventService', () => {
  it('cria evento apenas com sess\u00e3o e entidades ativas da mesma campanha', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    expect(
      capture(() =>
        service.create(
          createEventInputSchema.parse({
            campaignId,
            sessionId: foreignSessionId,
            title: 'Falha',
          }),
        ),
      ).code,
    ).toBe('SESSION_NOT_FOUND');
    expect(
      capture(() =>
        service.create(
          createEventInputSchema.parse({
            campaignId,
            title: 'Falha',
            links: [{ entityId: archivedEntityId, role: 'participant' }],
          }),
        ),
      ).code,
    ).toBe('INVALID_ENTITY_STATE');
    const created = service.create(
      createEventInputSchema.parse({
        campaignId,
        sessionId,
        title: 'A ponte desaba',
        eventOrder: 2,
        links: [
          { entityId, role: 'location' },
          { entityId, role: 'witness' },
        ],
      }),
    );
    expect(created).toMatchObject({
      event: { campaignId, sessionId, eventOrder: 2, revision: 1 },
      links: [
        { entityId, role: 'location', sortOrder: 0 },
        { entityId, role: 'witness', sortOrder: 1 },
      ],
    });
  });

  it('substitui v\u00ednculos e aplica revis\u00e3o otimista sem aceitar entidades estrangeiras', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    const created = service.create(
      createEventInputSchema.parse({
        campaignId,
        title: 'Alarme',
        links: [{ entityId, role: 'participant' }],
      }),
    );
    expect(
      capture(() =>
        service.update(
          updateEventInputSchema.parse({
            campaignId,
            id: created.event.id,
            revision: 1,
            links: [{ entityId: foreignEntityId, role: 'target' }],
          }),
        ),
      ).code,
    ).toBe('ENTITY_NOT_FOUND');
    const updated = service.update(
      updateEventInputSchema.parse({
        campaignId,
        id: created.event.id,
        revision: 1,
        patch: { title: 'Alarme confirmado' },
        links: [{ entityId, role: 'witness' }],
      }),
    );
    expect(updated).toMatchObject({
      event: { title: 'Alarme confirmado', revision: 2 },
      links: [{ entityId, role: 'witness', sortOrder: 0 }],
    });
    expect(
      capture(() =>
        service.update(
          updateEventInputSchema.parse({
            campaignId,
            id: created.event.id,
            revision: 1,
            patch: { eventOrder: 4 },
          }),
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
  });

  it('resolve a origem de sess\u00e3o sem expor identificador de fonte e preserva o isolamento', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    expect(
      capture(() =>
        service.create(
          createEventInputSchema.parse({ campaignId, title: 'Falha', originKind: 'session' }),
        ),
      ).code,
    ).toBe('EVENT_SESSION_SOURCE_REQUIRED');
    expect(
      capture(() =>
        service.create(
          createEventInputSchema.parse({
            campaignId,
            title: 'Falha',
            originKind: 'session',
            sourceSessionId: foreignSessionId,
          }),
        ),
      ).code,
    ).toBe('SESSION_NOT_FOUND');
    expect(
      service.create(
        createEventInputSchema.parse({
          campaignId,
          title: 'Ocorr\u00eancia da sess\u00e3o',
          originKind: 'session',
          sourceSessionId: sessionId,
        }),
      ).event,
    ).toMatchObject({ originKind: 'session', sourceId: sessionId });
  });

  it('aceita origens sem fonte dispon\u00edvel e valida arquivamento e restaura\u00e7\u00e3o', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    expect(
      service.create(
        createEventInputSchema.parse({ campaignId, title: 'Importado', originKind: 'import' }),
      ).event,
    ).toMatchObject({ originKind: 'import', sourceId: null });
    const created = service.create(
      createEventInputSchema.parse({ campaignId, title: 'Encerramento' }),
    );
    const archived = service.archive({ campaignId, id: created.event.id, revision: 1 });
    expect(archived.event).toMatchObject({ archivedAt: timestamp, revision: 2 });
    expect(
      capture(() => service.archive({ campaignId, id: created.event.id, revision: 2 })).code,
    ).toBe('INVALID_EVENT_STATE');
    expect(service.restore({ campaignId, id: created.event.id, revision: 2 }).event).toMatchObject({
      archivedAt: null,
      revision: 3,
    });
  });
});

class MemoryRepository implements EventRepositoryPort {
  private records: EventDetails[] = [];

  public insert(event: Event, links: EventEntityLinkPersistenceInput[]): EventDetails {
    const details = eventDetailsSchema.parse({
      event,
      links: links.map((link) => ({ eventId: event.id, ...link })),
    });
    this.records.push(details);
    return details;
  }

  public findById(campaign: string, id: string): EventDetails | null {
    return (
      this.records.find((item) => item.event.campaignId === campaign && item.event.id === id) ??
      null
    );
  }

  public findSourceContext(id: string): EventSourceContext | null {
    if (id === sessionId) return { kind: 'session', sessionCampaignId: campaignId };
    if (id === foreignSessionId) return { kind: 'session', sessionCampaignId: otherCampaignId };
    return null;
  }

  public list(): EventPageResult {
    return {
      items: this.records.map(({ event }) => event),
      nextCursor: null,
      total: this.records.length,
    };
  }

  public update(input: EventRepositoryUpdate, updatedAt: string): EventDetails {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new Error('Evento ausente.');
    if (current.event.revision !== input.revision)
      throw new Error('Conflito n\u00e3o interceptado.');
    const updated = eventDetailsSchema.parse({
      event: eventSchema.parse({
        ...current.event,
        ...input.patch,
        updatedAt,
        revision: current.event.revision + 1,
      }),
      links:
        input.links === undefined
          ? current.links
          : input.links.map((link) => ({ eventId: input.id, ...link })),
    });
    this.records = this.records.map((item) => (item.event.id === input.id ? updated : item));
    return updated;
  }
}

function createService(repository: EventRepositoryPort): EventService {
  const campaigns = new Map<string, Campaign>([
    [campaignId, createCampaign(campaignId)],
    [otherCampaignId, createCampaign(otherCampaignId)],
  ]);
  const sessions = new Map<string, Session>([
    [sessionId, createSession(sessionId, campaignId)],
    [foreignSessionId, createSession(foreignSessionId, otherCampaignId)],
  ]);
  const entities = new Map<string, Entity>([
    [entityId, createEntity(entityId, campaignId)],
    [archivedEntityId, createEntity(archivedEntityId, campaignId, timestamp)],
    [foreignEntityId, createEntity(foreignEntityId, otherCampaignId)],
  ]);
  let sequence = 0;
  return new EventService({
    repository,
    campaigns: { findById: (id) => campaigns.get(id) ?? null },
    sessions: {
      findById: (campaign, id) => {
        const session = sessions.get(id);
        return session?.campaignId === campaign ? session : null;
      },
    },
    entities: {
      findById: (campaign, id) => {
        const entity = entities.get(id);
        return entity?.campaignId === campaign ? entity : null;
      },
    },
    createId: () => `60000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => timestamp,
  });
}

function createCampaign(id: string): Campaign {
  return {
    id,
    name: id,
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    coverAttachmentId: null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
  };
}

function createSession(id: string, owner: string): Session {
  return {
    id,
    campaignId: owner,
    sequenceNumber: 1,
    title: id,
    playedAt: null,
    status: 'planned',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

function createEntity(id: string, owner: string, archivedAt: string | null = null): Entity {
  return {
    id,
    campaignId: owner,
    entityTypeId: '10000000-0000-4000-8000-000000000001',
    referenceImageAttachmentId: null,
    name: id,
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt,
    revision: 1,
  };
}

function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A opera\u00e7\u00e3o deveria falhar.');
}
