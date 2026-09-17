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
import {
  inboxItemSchema,
  type InboxItem,
  type InboxLifecycleInput,
  type InboxPageRequest,
  type InboxPageResult,
} from '../../core/contracts/inbox';
import { AppError } from '../../core/errors/app-error';
import {
  entities,
  inboxEntityConversions,
  inboxItems,
  inboxRelationshipConversions,
  relationships,
  sources,
} from '../schema';
import { entitySchema, type Entity } from '../../core/contracts/entities';
import { relationshipSchema, type Relationship } from '../../core/contracts/relationships';
import type {
  InboxEntityConversionResult,
  InboxRelationshipConversionResult,
} from '../../core/contracts/inbox';
import type * as schema from '../schema';

const cursorBaseSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    statuses: z.array(z.string()).optional(),
    sessionId: z.uuid().optional(),
    originKind: z.string().optional(),
    order: z.enum(['asc', 'desc']),
    id: z.uuid(),
  })
  .strict();
const cursorSchema = z.discriminatedUnion('sort', [
  cursorBaseSchema.extend({ sort: z.literal('capturedAt'), value: z.iso.datetime() }),
  cursorBaseSchema.extend({ sort: z.literal('updatedAt'), value: z.iso.datetime() }),
]);
type InboxCursor = z.infer<typeof cursorSchema>;

export class InboxRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(item: InboxItem): InboxItem {
    this.database.transaction((transaction) => {
      transaction.insert(inboxItems).values(item).run();
    });
    return inboxItemSchema.parse(item);
  }

  public findById(campaignId: string, id: string): InboxItem | null {
    const row = this.database
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.campaignId, campaignId), eq(inboxItems.id, id)))
      .get();
    return row === undefined ? null : inboxItemSchema.parse(row);
  }

  public list(request: InboxPageRequest): InboxPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression =
      request.sort === 'capturedAt' ? inboxItems.capturedAt : inboxItems.updatedAt;
    const filters = createBaseFilters(request);
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    const rows = this.database
      .select()
      .from(inboxItems)
      .where(and(...filters, cursorFilter))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(inboxItems.id) : desc(inboxItems.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = (hasNextPage ? rows.slice(0, request.limit) : rows).map((row) =>
      inboxItemSchema.parse(row),
    );
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasNextPage && last !== undefined
          ? encodeCursor(
              request,
              request.sort === 'capturedAt' ? last.capturedAt : last.updatedAt,
              last.id,
            )
          : null,
      total:
        this.database
          .select({ total: count() })
          .from(inboxItems)
          .where(and(...filters))
          .get()?.total ?? 0,
    };
  }

  public updateStatus(
    input: InboxLifecycleInput,
    status: InboxItem['status'],
    updatedAt: string,
  ): InboxItem {
    const result = this.database
      .update(inboxItems)
      .set({ status, updatedAt, revision: sql`${inboxItems.revision} + 1` })
      .where(
        and(
          eq(inboxItems.campaignId, input.campaignId),
          eq(inboxItems.id, input.id),
          eq(inboxItems.revision, input.revision),
        ),
      )
      .run();
    if (result.changes === 0) {
      const current = this.findById(input.campaignId, input.id);
      if (current === null)
        throw new AppError('INBOX_ITEM_NOT_FOUND', 'A captura não foi encontrada.', {
          campaignId: input.campaignId,
          id: input.id,
        });
      throw new AppError('REVISION_CONFLICT', 'A captura foi alterada em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    }
    const updated = this.findById(input.campaignId, input.id);
    if (updated === null) throw new Error('A captura atualizada não foi encontrada.');
    return updated;
  }

  public convertToEntity(
    input: { campaignId: string; id: string; revision: number },
    entity: Entity,
    sourceId: string,
    timestamp: string,
  ): InboxEntityConversionResult {
    return this.database.transaction((transaction) => {
      const item = transaction
        .select()
        .from(inboxItems)
        .where(and(eq(inboxItems.campaignId, input.campaignId), eq(inboxItems.id, input.id)))
        .get();
      if (item === undefined)
        throw new AppError('INBOX_ITEM_NOT_FOUND', 'A captura não foi encontrada.', input);
      const current = inboxItemSchema.parse(item);
      if (current.revision !== input.revision)
        throw new AppError('REVISION_CONFLICT', 'A captura foi alterada em outra operação.', {
          expectedRevision: input.revision,
          currentRevision: current.revision,
          current,
        });
      if (current.status !== 'reviewing')
        throw new AppError(
          'INVALID_INBOX_CONVERSION_STATE',
          'A captura precisa estar em revisão.',
          {
            status: current.status,
          },
        );
      transaction
        .insert(sources)
        .values({
          id: sourceId,
          kind: current.originKind,
          sessionId: current.sessionId,
          description: current.rawText,
          inboxItemId: current.id,
          createdAt: timestamp,
        })
        .run();
      transaction.insert(entities).values(entity).run();
      const updated = transaction
        .update(inboxItems)
        .set({
          status: 'converted',
          convertedObjectType: 'entity',
          convertedObjectId: entity.id,
          updatedAt: timestamp,
          revision: sql`${inboxItems.revision} + 1`,
        })
        .where(
          and(
            eq(inboxItems.campaignId, input.campaignId),
            eq(inboxItems.id, input.id),
            eq(inboxItems.revision, input.revision),
          ),
        )
        .run();
      if (updated.changes !== 1) throw new Error('Conflito de conversão inesperado.');
      transaction
        .insert(inboxEntityConversions)
        .values({ inboxItemId: current.id, entityId: entity.id, sourceId, createdAt: timestamp })
        .run();
      const converted = transaction
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.id, current.id))
        .get();
      if (converted === undefined) throw new Error('A captura convertida não foi encontrada.');
      return { inboxItem: inboxItemSchema.parse(converted), entity: entitySchema.parse(entity) };
    });
  }

  public convertToRelationship(
    input: { campaignId: string; id: string; revision: number },
    relationship: Relationship,
    createdEntities: Entity[],
    sourceId: string,
    timestamp: string,
  ): Omit<InboxRelationshipConversionResult, 'warnings'> {
    return this.database.transaction((transaction) => {
      const current = this.requireReviewingItem(transaction, input);
      transaction
        .insert(sources)
        .values({
          id: sourceId,
          kind: current.originKind,
          sessionId: current.sessionId,
          description: current.rawText,
          inboxItemId: current.id,
          createdAt: timestamp,
        })
        .run();
      if (createdEntities.length > 0) transaction.insert(entities).values(createdEntities).run();
      transaction.insert(relationships).values(relationship).run();
      const updated = transaction
        .update(inboxItems)
        .set({
          status: 'converted',
          convertedObjectType: 'relationship',
          convertedObjectId: relationship.id,
          updatedAt: timestamp,
          revision: sql`${inboxItems.revision} + 1`,
        })
        .where(
          and(
            eq(inboxItems.campaignId, input.campaignId),
            eq(inboxItems.id, input.id),
            eq(inboxItems.revision, input.revision),
          ),
        )
        .run();
      if (updated.changes !== 1) throw new Error('Conflito de conversÃ£o inesperado.');
      transaction
        .insert(inboxRelationshipConversions)
        .values({
          inboxItemId: current.id,
          relationshipId: relationship.id,
          sourceId,
          createdAt: timestamp,
        })
        .run();
      const converted = transaction
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.id, current.id))
        .get();
      if (converted === undefined) throw new Error('A captura convertida nÃ£o foi encontrada.');
      return {
        inboxItem: inboxItemSchema.parse(converted),
        relationship: relationshipSchema.parse(relationship),
        createdEntities: createdEntities.map((entity) => entitySchema.parse(entity)),
      };
    });
  }

  private requireReviewingItem(
    transaction: Parameters<Parameters<typeof this.database.transaction>[0]>[0],
    input: { campaignId: string; id: string; revision: number },
  ): InboxItem {
    const item = transaction
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.campaignId, input.campaignId), eq(inboxItems.id, input.id)))
      .get();
    if (item === undefined)
      throw new AppError('INBOX_ITEM_NOT_FOUND', 'A captura nÃ£o foi encontrada.', input);
    const current = inboxItemSchema.parse(item);
    if (current.revision !== input.revision)
      throw new AppError('REVISION_CONFLICT', 'A captura foi alterada em outra operaÃ§Ã£o.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    if (current.status !== 'reviewing')
      throw new AppError('INVALID_INBOX_CONVERSION_STATE', 'A captura precisa estar em revisÃ£o.', {
        status: current.status,
      });
    return current;
  }
}

function createBaseFilters(request: InboxPageRequest): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(inboxItems.campaignId, request.campaignId),
    request.filters.statuses === undefined
      ? undefined
      : inArray(inboxItems.status, request.filters.statuses),
    request.filters.sessionId === undefined
      ? undefined
      : eq(inboxItems.sessionId, request.filters.sessionId),
    request.filters.originKind === undefined
      ? undefined
      : eq(inboxItems.originKind, request.filters.originKind),
  ];
  return filters.filter((value): value is SQL => value !== undefined);
}

function createCursorFilter(cursor: InboxCursor, expression: SQLWrapper): SQL | undefined {
  const compare = cursor.order === 'asc' ? gt : lt;
  return or(
    compare(expression, cursor.value),
    and(eq(expression, cursor.value), compare(inboxItems.id, cursor.id)),
  );
}

function encodeCursor(request: InboxPageRequest, value: string, id: string): string {
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

function decodeCursor(value: string, request: InboxPageRequest): InboxCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      JSON.stringify(cursor.statuses) !== JSON.stringify(request.filters.statuses) ||
      cursor.sessionId !== request.filters.sessionId ||
      cursor.originKind !== request.filters.originKind ||
      cursor.sort !== request.sort ||
      cursor.order !== request.order
    )
      throw new Error();
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}
