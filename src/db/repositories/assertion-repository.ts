import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
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
  assertionSchema,
  type Assertion,
  type AssertionPageRequest,
  type AssertionPageResult,
  type AssertionPatch,
} from '../../core/contracts/assertions';
import { AppError } from '../../core/errors/app-error';
import { assertions, sessions, sources } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    entityId: z.uuid().optional(),
    canonState: z.string().optional(),
    knowledgeState: z.string().optional(),
    visibility: z.string().optional(),
    originKind: z.string().optional(),
    archived: z.boolean(),
    sort: z.enum(['updatedAt', 'createdAt']),
    order: z.enum(['asc', 'desc']),
    value: z.string(),
    id: z.uuid(),
  })
  .strict();

export interface AssertionRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: Omit<AssertionPatch, 'sessionId'> | { archivedAt: string | null };
  sessionId?: string;
}

export interface AssertionSourceContext {
  kind: Assertion['originKind'];
  sessionCampaignId: string | null;
  sessionId: string | null;
}

export class AssertionRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(assertion: Assertion): Assertion {
    return this.database.transaction((transaction) => {
      const persisted = ensureSessionSource(transaction, assertion);
      transaction.insert(assertions).values(persisted).run();
      return persisted;
    });
  }

  public findById(campaignId: string, id: string): Assertion | null {
    const row = this.database
      .select()
      .from(assertions)
      .where(and(eq(assertions.campaignId, campaignId), eq(assertions.id, id)))
      .get();
    return row === undefined ? null : assertionSchema.parse(row);
  }

  public findSourceContext(id: string): AssertionSourceContext | null {
    const row = this.database
      .select({
        kind: sources.kind,
        sessionCampaignId: sessions.campaignId,
        sessionId: sources.sessionId,
      })
      .from(sources)
      .leftJoin(sessions, eq(sources.sessionId, sessions.id))
      .where(eq(sources.id, id))
      .get();
    return row ?? null;
  }

  public list(request: AssertionPageRequest): AssertionPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = createBaseFilters(request);
    const cursorFilter =
      cursor === null ? undefined : createCursorFilter(cursor, sortExpression, request.order);
    const where = and(...baseFilters, cursorFilter);
    const rows = this.database
      .select()
      .from(assertions)
      .where(where)
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(assertions.id) : desc(assertions.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = (hasNextPage ? rows.slice(0, request.limit) : rows).map((row) =>
      assertionSchema.parse(row),
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
          .from(assertions)
          .where(and(...baseFilters))
          .get()?.total ?? 0,
    };
  }

  public update(input: AssertionRepositoryUpdate, updatedAt: string): Assertion {
    return this.database.transaction((transaction) => {
      const sourceId =
        input.sessionId === undefined
          ? undefined
          : ensureSessionSourceId(transaction, input.campaignId, input.sessionId, updatedAt);
      const result = transaction
        .update(assertions)
        .set({
          ...input.patch,
          ...(sourceId === undefined ? {} : { sourceId }),
          updatedAt,
          revision: sql`${assertions.revision} + 1`,
        })
        .where(
          and(
            eq(assertions.campaignId, input.campaignId),
            eq(assertions.id, input.id),
            eq(assertions.revision, input.revision),
          ),
        )
        .run();
      if (result.changes === 0) {
        const current = this.findById(input.campaignId, input.id);
        if (current === null) throw notFound(input.campaignId, input.id);
        throw new AppError('REVISION_CONFLICT', 'A afirmação foi alterada em outra operação.', {
          expectedRevision: input.revision,
          currentRevision: current.revision,
          current,
        });
      }
      const updated = this.findById(input.campaignId, input.id);
      if (updated === null) throw notFound(input.campaignId, input.id);
      return updated;
    });
  }
}

function ensureSessionSourceId(
  transaction: Parameters<Parameters<BetterSQLite3Database<typeof schema>['transaction']>[0]>[0],
  campaignId: string,
  sessionId: string,
  createdAt: string,
): string {
  const session = transaction
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.campaignId, campaignId)))
    .get();
  if (session === undefined)
    throw new AppError('SESSION_NOT_FOUND', 'Sessão não encontrada nesta campanha.', {
      campaignId,
      id: sessionId,
    });
  const current = transaction
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.kind, 'session'), eq(sources.sessionId, session.id)))
    .get();
  const sourceId = current?.id ?? session.id;
  if (current === undefined)
    transaction
      .insert(sources)
      .values({ id: sourceId, kind: 'session', sessionId: session.id, createdAt })
      .run();
  return sourceId;
}

function ensureSessionSource(
  transaction: Parameters<Parameters<BetterSQLite3Database<typeof schema>['transaction']>[0]>[0],
  assertion: Assertion,
): Assertion {
  if (assertion.originKind !== 'session' || assertion.sourceId === null) return assertion;
  const session = transaction
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, assertion.sourceId), eq(sessions.campaignId, assertion.campaignId)))
    .get();
  if (session === undefined)
    throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada nesta campanha.', {
      campaignId: assertion.campaignId,
      id: assertion.sourceId,
    });
  const current = transaction
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.kind, 'session'), eq(sources.sessionId, session.id)))
    .get();
  const sourceId = current?.id ?? assertion.sourceId;
  if (current === undefined)
    transaction
      .insert(sources)
      .values({
        id: sourceId,
        kind: 'session',
        sessionId: session.id,
        createdAt: assertion.createdAt,
      })
      .run();
  return { ...assertion, sourceId };
}

function createBaseFilters(request: AssertionPageRequest): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(assertions.campaignId, request.campaignId),
    request.filters.archived ? isNotNull(assertions.archivedAt) : isNull(assertions.archivedAt),
    request.filters.entityId === undefined
      ? undefined
      : or(
          eq(assertions.subjectEntityId, request.filters.entityId),
          eq(assertions.objectEntityId, request.filters.entityId),
        ),
    request.filters.canonState === undefined
      ? undefined
      : eq(assertions.canonState, request.filters.canonState),
    request.filters.knowledgeState === undefined
      ? undefined
      : eq(assertions.knowledgeState, request.filters.knowledgeState),
    request.filters.visibility === undefined
      ? undefined
      : eq(assertions.visibility, request.filters.visibility),
    request.filters.originKind === undefined
      ? undefined
      : eq(assertions.originKind, request.filters.originKind),
  ];
  return filters.filter((value): value is SQL => value !== undefined);
}

function getSortExpression(sort: AssertionPageRequest['sort']): SQLWrapper {
  return sort === 'createdAt' ? assertions.createdAt : assertions.updatedAt;
}

function getCursorValue(assertion: Assertion, sort: AssertionPageRequest['sort']): string {
  return sort === 'createdAt' ? assertion.createdAt : assertion.updatedAt;
}

function createCursorFilter(
  cursor: z.infer<typeof cursorSchema>,
  expression: SQLWrapper,
  order: AssertionPageRequest['order'],
): SQL | undefined {
  const compare = order === 'asc' ? gt : lt;
  return or(
    compare(expression, cursor.value),
    and(eq(expression, cursor.value), compare(assertions.id, cursor.id)),
  );
}

function encodeCursor(request: AssertionPageRequest, value: string, id: string): string {
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

function decodeCursor(value: string, request: AssertionPageRequest): z.infer<typeof cursorSchema> {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
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
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}

function notFound(campaignId: string, id: string): AppError {
  return new AppError('ASSERTION_NOT_FOUND', 'A afirmação não foi encontrada.', {
    campaignId,
    id,
  });
}
