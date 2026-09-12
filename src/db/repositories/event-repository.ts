import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  eventDetailsSchema,
  eventEntityLinkSchema,
  eventSchema,
  type Event,
  type EventDetails,
  type EventEntityLinkInput,
  type EventPageRequest,
  type EventPageResult,
  type EventPatch,
} from '../../core/contracts/events';
import { AppError } from '../../core/errors/app-error';
import { eventEntityLinks, events, sessions, sources } from '../schema';
import type * as schema from '../schema';

const cursorBaseSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    sessionId: z.uuid().optional(),
    entityId: z.uuid().optional(),
    canonState: z.string().optional(),
    knowledgeState: z.string().optional(),
    visibility: z.string().optional(),
    originKind: z.string().optional(),
    archived: z.boolean(),
    order: z.enum(['asc', 'desc']),
    id: z.uuid(),
  })
  .strict();
const cursorSchema = z.discriminatedUnion('sort', [
  cursorBaseSchema.extend({ sort: z.literal('eventOrder'), value: z.number().int().nonnegative() }),
  cursorBaseSchema.extend({ sort: z.literal('createdAt'), value: z.iso.datetime() }),
  cursorBaseSchema.extend({ sort: z.literal('updatedAt'), value: z.iso.datetime() }),
]);
type EventCursor = z.infer<typeof cursorSchema>;

export interface EventRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: EventPatch | { archivedAt: string | null };
  links?: EventEntityLinkInput[];
}

export interface EventSourceContext {
  kind: Event['originKind'];
  sessionCampaignId: string | null;
}

export class EventRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(event: Event, links: EventEntityLinkInput[]): EventDetails {
    this.database.transaction((transaction) => {
      transaction.insert(events).values(event).run();
      if (links.length > 0)
        transaction
          .insert(eventEntityLinks)
          .values(links.map((link) => ({ eventId: event.id, ...link })))
          .run();
    });
    return this.requireDetails(event.campaignId, event.id);
  }

  public findById(campaignId: string, id: string): EventDetails | null {
    const row = this.database
      .select()
      .from(events)
      .where(and(eq(events.campaignId, campaignId), eq(events.id, id)))
      .get();
    if (row === undefined) return null;
    const event = eventSchema.parse(row);
    const links = this.database
      .select()
      .from(eventEntityLinks)
      .where(eq(eventEntityLinks.eventId, id))
      .orderBy(
        asc(eventEntityLinks.sortOrder),
        asc(eventEntityLinks.entityId),
        asc(eventEntityLinks.role),
      )
      .all()
      .map((link) => eventEntityLinkSchema.parse(link));
    return eventDetailsSchema.parse({ event, links });
  }

  public findSourceContext(id: string): EventSourceContext | null {
    const row = this.database
      .select({ kind: sources.kind, sessionCampaignId: sessions.campaignId })
      .from(sources)
      .leftJoin(sessions, eq(sources.sessionId, sessions.id))
      .where(eq(sources.id, id))
      .get();
    return row ?? null;
  }

  public list(request: EventPageRequest): EventPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = createBaseFilters(this.database, request);
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    const rows = this.database
      .select()
      .from(events)
      .where(and(...baseFilters, cursorFilter))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(events.id) : desc(events.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = (hasNextPage ? rows.slice(0, request.limit) : rows).map((row) =>
      eventSchema.parse(row),
    );
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasNextPage && last !== undefined
          ? encodeCursor(request, getCursorValue(last, request.sort), last.id)
          : null,
      total:
        this.database
          .select({ total: count() })
          .from(events)
          .where(and(...baseFilters))
          .get()?.total ?? 0,
    };
  }

  public update(input: EventRepositoryUpdate, updatedAt: string): EventDetails {
    this.database.transaction((transaction) => {
      const result = transaction
        .update(events)
        .set({ ...input.patch, updatedAt, revision: sql`${events.revision} + 1` })
        .where(
          and(
            eq(events.campaignId, input.campaignId),
            eq(events.id, input.id),
            eq(events.revision, input.revision),
          ),
        )
        .run();
      if (result.changes === 0) {
        const current = transaction
          .select()
          .from(events)
          .where(and(eq(events.campaignId, input.campaignId), eq(events.id, input.id)))
          .get();
        if (current === undefined) throw notFound(input.campaignId, input.id);
        throw new AppError(
          'REVISION_CONFLICT',
          'O evento foi alterado em outra opera\u00e7\u00e3o.',
          {
            expectedRevision: input.revision,
            currentRevision: current.revision,
            current: eventSchema.parse(current),
          },
        );
      }
      if (input.links !== undefined) {
        transaction.delete(eventEntityLinks).where(eq(eventEntityLinks.eventId, input.id)).run();
        if (input.links.length > 0)
          transaction
            .insert(eventEntityLinks)
            .values(input.links.map((link) => ({ eventId: input.id, ...link })))
            .run();
      }
    });
    return this.requireDetails(input.campaignId, input.id);
  }

  private requireDetails(campaignId: string, id: string): EventDetails {
    const details = this.findById(campaignId, id);
    if (details === null) throw notFound(campaignId, id);
    return details;
  }
}

function createBaseFilters(
  database: BetterSQLite3Database<typeof schema>,
  request: EventPageRequest,
): SQL[] {
  const linkedEventIds =
    request.filters.entityId === undefined
      ? undefined
      : database
          .select({ eventId: eventEntityLinks.eventId })
          .from(eventEntityLinks)
          .where(eq(eventEntityLinks.entityId, request.filters.entityId));
  const filters: (SQL | undefined)[] = [
    eq(events.campaignId, request.campaignId),
    request.filters.archived ? isNotNull(events.archivedAt) : isNull(events.archivedAt),
    request.filters.sessionId === undefined
      ? undefined
      : eq(events.sessionId, request.filters.sessionId),
    linkedEventIds === undefined ? undefined : inArray(events.id, linkedEventIds),
    request.filters.canonState === undefined
      ? undefined
      : eq(events.canonState, request.filters.canonState),
    request.filters.knowledgeState === undefined
      ? undefined
      : eq(events.knowledgeState, request.filters.knowledgeState),
    request.filters.visibility === undefined
      ? undefined
      : eq(events.visibility, request.filters.visibility),
    request.filters.originKind === undefined
      ? undefined
      : eq(events.originKind, request.filters.originKind),
  ];
  return filters.filter((value): value is SQL => value !== undefined);
}

function getSortExpression(sort: EventPageRequest['sort']): SQLWrapper {
  if (sort === 'eventOrder') return events.eventOrder;
  return sort === 'createdAt' ? events.createdAt : events.updatedAt;
}

function getCursorValue(event: Event, sort: EventPageRequest['sort']): string | number {
  if (sort === 'eventOrder') return event.eventOrder;
  return sort === 'createdAt' ? event.createdAt : event.updatedAt;
}

function createCursorFilter(cursor: EventCursor, expression: SQLWrapper): SQL | undefined {
  const compare = cursor.order === 'asc' ? gt : lt;
  return or(
    compare(expression, cursor.value),
    and(eq(expression, cursor.value), compare(events.id, cursor.id)),
  );
}

function encodeCursor(request: EventPageRequest, value: string | number, id: string): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      campaignId: request.campaignId,
      ...request.filters,
      sort: request.sort,
      order: request.order,
      value,
      id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value: string, request: EventPageRequest): EventCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.sessionId !== request.filters.sessionId ||
      cursor.entityId !== request.filters.entityId ||
      cursor.canonState !== request.filters.canonState ||
      cursor.knowledgeState !== request.filters.knowledgeState ||
      cursor.visibility !== request.filters.visibility ||
      cursor.originKind !== request.filters.originKind ||
      cursor.archived !== request.filters.archived ||
      cursor.sort !== request.sort ||
      cursor.order !== request.order
    )
      throw new Error();
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de pagina\u00e7\u00e3o \u00e9 inv\u00e1lido.');
  }
}

function notFound(campaignId: string, id: string): AppError {
  return new AppError('EVENT_NOT_FOUND', 'O evento n\u00e3o foi encontrado.', { campaignId, id });
}
