import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  lt,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import type {
  SessionIntention,
  SessionIntentionPageRequest,
  SessionIntentionPageResult,
  SessionIntentionPatch,
} from '../../core/contracts/sessions';
import { sessionIntentionSchema } from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';
import { sessionIntentions, sessions } from '../schema';
import type * as schema from '../schema';

const cursorBaseSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    status: z.enum(['open', 'completed', 'abandoned', 'transformed']).optional(),
    entityId: z.uuid().optional(),
    order: z.enum(['asc', 'desc']),
    id: z.uuid(),
  })
  .strict();
const cursorSchema = z.discriminatedUnion('sort', [
  cursorBaseSchema.extend({ sort: z.literal('createdAt'), value: z.iso.datetime() }),
  cursorBaseSchema.extend({ sort: z.literal('updatedAt'), value: z.iso.datetime() }),
]);
type SessionIntentionCursor = z.infer<typeof cursorSchema>;

export interface SessionIntentionRepositoryUpdate {
  campaignId: string;
  sessionId: string;
  id: string;
  revision: number;
  patch: SessionIntentionPatch;
}

export class SessionIntentionRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(intention: SessionIntention): SessionIntention {
    this.database.insert(sessionIntentions).values(intention).run();
    return intention;
  }

  public findById(campaignId: string, sessionId: string, id: string): SessionIntention | null {
    const row = this.database
      .select({ intention: sessionIntentions })
      .from(sessionIntentions)
      .innerJoin(sessions, eq(sessionIntentions.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.campaignId, campaignId),
          eq(sessionIntentions.sessionId, sessionId),
          eq(sessionIntentions.id, id),
        ),
      )
      .get();
    return row === undefined ? null : sessionIntentionSchema.parse(row.intention);
  }

  public list(request: SessionIntentionPageRequest): SessionIntentionPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = createBaseFilters(request);
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    const rows = this.database
      .select({ intention: sessionIntentions })
      .from(sessionIntentions)
      .innerJoin(sessions, eq(sessionIntentions.sessionId, sessions.id))
      .where(and(...baseFilters, cursorFilter))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(sessionIntentions.id) : desc(sessionIntentions.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = (hasNextPage ? rows.slice(0, request.limit) : rows).map((row) =>
      sessionIntentionSchema.parse(row.intention),
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
          .from(sessionIntentions)
          .innerJoin(sessions, eq(sessionIntentions.sessionId, sessions.id))
          .where(and(...baseFilters))
          .get()?.total ?? 0,
    };
  }

  public update(input: SessionIntentionRepositoryUpdate, updatedAt: string): SessionIntention {
    const result = this.database
      .update(sessionIntentions)
      .set({ ...input.patch, updatedAt, revision: sql`${sessionIntentions.revision} + 1` })
      .where(
        and(
          eq(sessionIntentions.id, input.id),
          eq(sessionIntentions.sessionId, input.sessionId),
          eq(sessionIntentions.revision, input.revision),
          inArray(
            sessionIntentions.sessionId,
            this.database
              .select({ id: sessions.id })
              .from(sessions)
              .where(eq(sessions.campaignId, input.campaignId)),
          ),
        ),
      )
      .run();
    if (result.changes === 0) {
      const current = this.findById(input.campaignId, input.sessionId, input.id);
      if (current === null) throw notFound(input.campaignId, input.sessionId, input.id);
      throw new AppError('REVISION_CONFLICT', 'A intenção foi alterada em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    }
    const updated = this.findById(input.campaignId, input.sessionId, input.id);
    if (updated === null) throw notFound(input.campaignId, input.sessionId, input.id);
    return updated;
  }
}

function createBaseFilters(request: SessionIntentionPageRequest): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(sessions.campaignId, request.campaignId),
    eq(sessionIntentions.sessionId, request.sessionId),
    request.filters.status === undefined
      ? undefined
      : eq(sessionIntentions.status, request.filters.status),
    request.filters.entityId === undefined
      ? undefined
      : eq(sessionIntentions.entityId, request.filters.entityId),
  ];
  return filters.filter((value): value is SQL => value !== undefined);
}

function getSortExpression(sort: SessionIntentionPageRequest['sort']): SQLWrapper {
  return sort === 'createdAt' ? sessionIntentions.createdAt : sessionIntentions.updatedAt;
}

function getCursorValue(
  intention: SessionIntention,
  sort: SessionIntentionPageRequest['sort'],
): string {
  return sort === 'createdAt' ? intention.createdAt : intention.updatedAt;
}

function createCursorFilter(
  cursor: SessionIntentionCursor,
  expression: SQLWrapper,
): SQL | undefined {
  const compare = cursor.order === 'asc' ? gt : lt;
  return or(
    compare(expression, cursor.value),
    and(eq(expression, cursor.value), compare(sessionIntentions.id, cursor.id)),
  );
}

function encodeCursor(request: SessionIntentionPageRequest, value: string, id: string): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      campaignId: request.campaignId,
      sessionId: request.sessionId,
      ...request.filters,
      sort: request.sort,
      order: request.order,
      value,
      id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value: string, request: SessionIntentionPageRequest): SessionIntentionCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.sessionId !== request.sessionId ||
      cursor.status !== request.filters.status ||
      cursor.entityId !== request.filters.entityId ||
      cursor.sort !== request.sort ||
      cursor.order !== request.order
    )
      throw new Error();
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}

function notFound(campaignId: string, sessionId: string, id: string): AppError {
  return new AppError('SESSION_INTENTION_NOT_FOUND', 'A intenção não foi encontrada.', {
    campaignId,
    sessionId,
    id,
  });
}
