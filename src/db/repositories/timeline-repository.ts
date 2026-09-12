import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  timelineEntrySchema,
  type TimelineCampaignRequest,
  type TimelineEntityRequest,
  type TimelinePageResult,
} from '../../core/contracts/timeline';
import { AppError } from '../../core/errors/app-error';
import { eventEntityLinks, events, sessions } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    entityId: z.uuid().optional(),
    archived: z.boolean(),
    group: z.union([z.literal(0), z.literal(1)]),
    sessionSequenceNumber: z.number().int().positive().nullable(),
    eventOrder: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
  })
  .strict();
type TimelineCursor = z.infer<typeof cursorSchema>;

export class TimelineRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public listCampaign(request: TimelineCampaignRequest): TimelinePageResult {
    return this.list(request);
  }

  public listEntity(request: TimelineEntityRequest): TimelinePageResult {
    return this.list(request, request.entityId);
  }

  private list(request: TimelineCampaignRequest, entityId?: string): TimelinePageResult {
    const cursor =
      request.cursor === undefined ? null : decodeCursor(request.cursor, request, entityId);
    const baseFilters = createBaseFilters(this.database, request, entityId);
    const group = timelineGroupExpression();
    const sessionSequence = sessionSequenceExpression();
    const narrativeOrder = narrativeOrderExpression();
    const cursorFilter =
      cursor === null
        ? undefined
        : createCursorFilter(cursor, group, sessionSequence, narrativeOrder);
    const rows = this.database
      .select({ event: events, sessionSequenceNumber: sessions.sequenceNumber })
      .from(events)
      .leftJoin(sessions, eq(events.sessionId, sessions.id))
      .where(and(...baseFilters, cursorFilter))
      .orderBy(
        asc(group),
        asc(sessionSequence),
        asc(narrativeOrder),
        asc(events.createdAt),
        asc(events.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const pageRows = hasNextPage ? rows.slice(0, request.limit) : rows;
    const eventIds = pageRows.map((row) => row.event.id);
    const linksByEvent = this.listLinks(eventIds);
    const items = pageRows.map((row) =>
      timelineEntrySchema.parse({
        event: row.event,
        sessionSequenceNumber: row.sessionSequenceNumber,
        links: linksByEvent.get(row.event.id) ?? [],
      }),
    );
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasNextPage && last !== undefined ? encodeCursor(request, entityId, last) : null,
      total:
        this.database
          .select({ total: count() })
          .from(events)
          .where(and(...baseFilters))
          .get()?.total ?? 0,
    };
  }

  private listLinks(eventIds: string[]): Map<string, TimelinePageResult['items'][number]['links']> {
    if (eventIds.length === 0) return new Map();
    const result = new Map<string, TimelinePageResult['items'][number]['links']>();
    const rows = this.database
      .select()
      .from(eventEntityLinks)
      .where(inArray(eventEntityLinks.eventId, eventIds))
      .orderBy(
        asc(eventEntityLinks.eventId),
        asc(eventEntityLinks.sortOrder),
        asc(eventEntityLinks.entityId),
        asc(eventEntityLinks.role),
      )
      .all();
    for (const row of rows) {
      const current = result.get(row.eventId) ?? [];
      current.push(row);
      result.set(row.eventId, current);
    }
    return result;
  }
}

function createBaseFilters(
  database: BetterSQLite3Database<typeof schema>,
  request: TimelineCampaignRequest,
  entityId?: string,
): SQL[] {
  const linkedEventIds =
    entityId === undefined
      ? undefined
      : database
          .select({ eventId: eventEntityLinks.eventId })
          .from(eventEntityLinks)
          .where(eq(eventEntityLinks.entityId, entityId));
  const filters: (SQL | undefined)[] = [
    eq(events.campaignId, request.campaignId),
    request.filters.archived ? isNotNull(events.archivedAt) : isNull(events.archivedAt),
    linkedEventIds === undefined ? undefined : inArray(events.id, linkedEventIds),
  ];
  return filters.filter((value): value is SQL => value !== undefined);
}

function timelineGroupExpression(): SQL<number> {
  return sql<number>`CASE WHEN ${events.sessionId} IS NULL THEN 1 ELSE 0 END`;
}

function sessionSequenceExpression(): SQL<number> {
  return sql<number>`coalesce(${sessions.sequenceNumber}, 0)`;
}

function narrativeOrderExpression(): SQL<number> {
  return sql<number>`CASE WHEN ${events.sessionId} IS NULL THEN 0 ELSE ${events.eventOrder} END`;
}

function createCursorFilter(
  cursor: TimelineCursor,
  group: SQL<number>,
  sessionSequence: SQL<number>,
  narrativeOrder: SQL<number>,
): SQL {
  if (cursor.group === 1) {
    const filter = and(
      eq(group, 1),
      or(
        gt(events.createdAt, cursor.createdAt),
        and(eq(events.createdAt, cursor.createdAt), gt(events.id, cursor.id)),
      ),
    );
    if (filter === undefined) throw invalidCursor();
    return filter;
  }
  const sessionSequenceNumber = cursor.sessionSequenceNumber;
  if (sessionSequenceNumber === null) throw invalidCursor();
  const filter = or(
    gt(group, 0),
    and(
      eq(group, 0),
      or(
        gt(sessionSequence, sessionSequenceNumber),
        and(
          eq(sessionSequence, sessionSequenceNumber),
          or(
            gt(narrativeOrder, cursor.eventOrder),
            and(
              eq(narrativeOrder, cursor.eventOrder),
              or(
                gt(events.createdAt, cursor.createdAt),
                and(eq(events.createdAt, cursor.createdAt), gt(events.id, cursor.id)),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  if (filter === undefined) throw invalidCursor();
  return filter;
}

function encodeCursor(
  request: TimelineCampaignRequest,
  entityId: string | undefined,
  entry: TimelinePageResult['items'][number],
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      campaignId: request.campaignId,
      ...(entityId === undefined ? {} : { entityId }),
      archived: request.filters.archived,
      group: entry.sessionSequenceNumber === null ? 1 : 0,
      sessionSequenceNumber: entry.sessionSequenceNumber,
      eventOrder: entry.sessionSequenceNumber === null ? 0 : entry.event.eventOrder,
      createdAt: entry.event.createdAt,
      id: entry.event.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(
  value: string,
  request: TimelineCampaignRequest,
  entityId: string | undefined,
): TimelineCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.entityId !== entityId ||
      cursor.archived !== request.filters.archived ||
      (cursor.group === 0 && cursor.sessionSequenceNumber === null) ||
      (cursor.group === 1 && cursor.sessionSequenceNumber !== null)
    )
      throw new Error();
    return cursor;
  } catch {
    throw invalidCursor();
  }
}

function invalidCursor(): AppError {
  return new AppError('INVALID_CURSOR', 'O cursor de pagina\u00e7\u00e3o \u00e9 inv\u00e1lido.');
}
