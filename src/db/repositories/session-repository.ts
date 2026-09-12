import { and, asc, count, desc, eq, gt, lt, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import type {
  Session,
  SessionParticipant,
  SessionParticipantInput,
  SessionPageRequest,
  SessionPageResult,
  SessionPatch,
} from '../../core/contracts/sessions';
import { sessionParticipantSchema, sessionSchema } from '../../core/contracts/sessions';
import { AppError } from '../../core/errors/app-error';
import { sessionParticipants, sessions, sources } from '../schema';
import type * as schema from '../schema';

const cursorBaseSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
    order: z.enum(['asc', 'desc']),
    id: z.uuid(),
  })
  .strict();
const cursorSchema = z.discriminatedUnion('sort', [
  cursorBaseSchema.extend({
    sort: z.literal('sequenceNumber'),
    value: z.number().int().positive(),
  }),
  cursorBaseSchema.extend({
    sort: z.literal('playedAt'),
    value: z.union([z.literal(''), z.iso.datetime()]),
  }),
  cursorBaseSchema.extend({
    sort: z.literal('updatedAt'),
    value: z.iso.datetime(),
  }),
]);
type SessionCursor = z.infer<typeof cursorSchema>;

export interface SessionRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: SessionPatch;
}

export interface SessionParticipantsReplace {
  campaignId: string;
  sessionId: string;
  revision: number;
  participants: SessionParticipantInput[];
}

export class SessionRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(session: Session): Session {
    try {
      this.database.transaction((transaction) => {
        transaction.insert(sessions).values(session).run();
        transaction
          .insert(sources)
          .values({
            id: session.id,
            kind: 'session',
            sessionId: session.id,
            createdAt: session.createdAt,
          })
          .run();
      });
      return session;
    } catch (error) {
      throw translateConstraintError(error, session.campaignId, session.sequenceNumber);
    }
  }

  public findById(campaignId: string, id: string): Session | null {
    const row = this.database
      .select()
      .from(sessions)
      .where(and(eq(sessions.campaignId, campaignId), eq(sessions.id, id)))
      .get();
    return row === undefined ? null : sessionSchema.parse(row);
  }

  public list(request: SessionPageRequest): SessionPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = createBaseFilters(request);
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    const rows = this.database
      .select()
      .from(sessions)
      .where(and(...baseFilters, cursorFilter))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(sessions.id) : desc(sessions.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = (hasNextPage ? rows.slice(0, request.limit) : rows).map((row) =>
      sessionSchema.parse(row),
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
          .from(sessions)
          .where(and(...baseFilters))
          .get()?.total ?? 0,
    };
  }

  public listParticipants(campaignId: string, sessionId: string): SessionParticipant[] {
    if (this.findById(campaignId, sessionId) === null) return [];
    return this.database
      .select()
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, sessionId))
      .orderBy(asc(sessionParticipants.sortOrder), asc(sessionParticipants.entityId))
      .all()
      .map((row) => sessionParticipantSchema.parse(row));
  }

  public replaceParticipants(
    input: SessionParticipantsReplace,
    updatedAt: string,
  ): SessionParticipant[] {
    this.database.transaction((transaction) => {
      const result = transaction
        .update(sessions)
        .set({ updatedAt, revision: sql`${sessions.revision} + 1` })
        .where(
          and(
            eq(sessions.campaignId, input.campaignId),
            eq(sessions.id, input.sessionId),
            eq(sessions.revision, input.revision),
          ),
        )
        .run();
      if (result.changes === 0) {
        const current = transaction
          .select()
          .from(sessions)
          .where(and(eq(sessions.campaignId, input.campaignId), eq(sessions.id, input.sessionId)))
          .get();
        if (current === undefined) throw notFound(input.campaignId, input.sessionId);
        throw new AppError('REVISION_CONFLICT', 'A sessão foi alterada em outra operação.', {
          expectedRevision: input.revision,
          currentRevision: current.revision,
          current: sessionSchema.parse(current),
        });
      }
      transaction
        .delete(sessionParticipants)
        .where(eq(sessionParticipants.sessionId, input.sessionId))
        .run();
      if (input.participants.length > 0)
        transaction
          .insert(sessionParticipants)
          .values(
            input.participants.map((participant) => ({
              sessionId: input.sessionId,
              ...participant,
            })),
          )
          .run();
    });
    return this.listParticipants(input.campaignId, input.sessionId);
  }

  public update(input: SessionRepositoryUpdate, updatedAt: string): Session {
    const result = this.database
      .update(sessions)
      .set({ ...input.patch, updatedAt, revision: sql`${sessions.revision} + 1` })
      .where(
        and(
          eq(sessions.campaignId, input.campaignId),
          eq(sessions.id, input.id),
          eq(sessions.revision, input.revision),
        ),
      )
      .run();
    if (result.changes === 0) {
      const current = this.findById(input.campaignId, input.id);
      if (current === null) throw notFound(input.campaignId, input.id);
      throw new AppError('REVISION_CONFLICT', 'A sessão foi alterada em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    }
    const updated = this.findById(input.campaignId, input.id);
    if (updated === null) throw notFound(input.campaignId, input.id);
    return updated;
  }
}

function createBaseFilters(request: SessionPageRequest): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(sessions.campaignId, request.campaignId),
    request.filters.status === undefined ? undefined : eq(sessions.status, request.filters.status),
  ];
  return filters.filter((value): value is SQL => value !== undefined);
}

function getSortExpression(sort: SessionPageRequest['sort']): SQLWrapper {
  if (sort === 'sequenceNumber') return sessions.sequenceNumber;
  if (sort === 'updatedAt') return sessions.updatedAt;
  return sql<string>`coalesce(${sessions.playedAt}, '')`;
}

function getCursorValue(session: Session, sort: SessionPageRequest['sort']): string | number {
  if (sort === 'sequenceNumber') return session.sequenceNumber;
  if (sort === 'updatedAt') return session.updatedAt;
  return session.playedAt ?? '';
}

function createCursorFilter(cursor: SessionCursor, expression: SQLWrapper): SQL | undefined {
  const compare = cursor.order === 'asc' ? gt : lt;
  return or(
    compare(expression, cursor.value),
    and(eq(expression, cursor.value), compare(sessions.id, cursor.id)),
  );
}

function encodeCursor(request: SessionPageRequest, value: string | number, id: string): string {
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

function decodeCursor(value: string, request: SessionPageRequest): SessionCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.status !== request.filters.status ||
      cursor.sort !== request.sort ||
      cursor.order !== request.order
    )
      throw new Error();
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}

function translateConstraintError(
  error: unknown,
  campaignId: string,
  sequenceNumber: number,
): Error {
  if (findSqliteCode(error)?.startsWith('SQLITE_CONSTRAINT_UNIQUE') === true)
    return new AppError(
      'SESSION_SEQUENCE_CONFLICT',
      'Já existe uma sessão com esse número nesta campanha.',
      { campaignId, sequenceNumber },
    );
  return error instanceof Error ? error : new Error('Falha ao persistir sessão.');
}

function findSqliteCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? findSqliteCode(error.cause) : undefined;
}

function notFound(campaignId: string, id: string): AppError {
  return new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada.', { campaignId, id });
}
