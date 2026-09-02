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
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import type {
  Relationship,
  RelationshipPageRequest,
  RelationshipPageResult,
  RelationshipPatch,
} from '../../core/contracts/relationships';
import { AppError } from '../../core/errors/app-error';
import { relationships } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    relationshipTypeId: z.uuid().optional(),
    entityId: z.uuid().optional(),
    canonState: z.string().optional(),
    knowledgeState: z.string().optional(),
    visibility: z.string().optional(),
    archived: z.boolean(),
    order: z.enum(['asc', 'desc']),
    updatedAt: z.string(),
    id: z.uuid(),
  })
  .strict();
export interface RelationshipRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: RelationshipPatch | { archivedAt: string | null };
}
export interface AdjacentRelationshipQuery {
  campaignId: string;
  entityIds: string[];
  relationshipTypeIds: string[];
  canonStates: Relationship['canonState'][];
  knowledgeStates: Relationship['knowledgeState'][];
  visibilities: Relationship['visibility'][];
}

export class RelationshipRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(relationship: Relationship): Relationship {
    this.database.insert(relationships).values(relationship).run();
    return relationship;
  }

  public findById(campaignId: string, id: string): Relationship | null {
    const row = this.database
      .select()
      .from(relationships)
      .where(and(eq(relationships.campaignId, campaignId), eq(relationships.id, id)))
      .get();
    return row ?? null;
  }

  public findActiveEquivalent(
    campaignId: string,
    relationshipTypeId: string,
    sourceEntityId: string,
    targetEntityId: string,
    exceptId?: string,
  ): Relationship[] {
    const filters: SQL[] = [
      eq(relationships.campaignId, campaignId),
      eq(relationships.relationshipTypeId, relationshipTypeId),
      eq(relationships.sourceEntityId, sourceEntityId),
      eq(relationships.targetEntityId, targetEntityId),
      isNull(relationships.archivedAt),
    ];
    if (exceptId !== undefined) filters.push(sql`${relationships.id} <> ${exceptId}`);
    return this.database
      .select()
      .from(relationships)
      .where(and(...filters))
      .all();
  }

  public listActiveAdjacent(query: AdjacentRelationshipQuery): Relationship[] {
    if (query.entityIds.length === 0) return [];
    const endpointFilter = or(
      inArray(relationships.sourceEntityId, query.entityIds),
      inArray(relationships.targetEntityId, query.entityIds),
    );
    const filters: SQL[] = [
      eq(relationships.campaignId, query.campaignId),
      isNull(relationships.archivedAt),
    ];
    if (endpointFilter !== undefined) filters.push(endpointFilter);
    if (query.relationshipTypeIds.length > 0)
      filters.push(inArray(relationships.relationshipTypeId, query.relationshipTypeIds));
    if (query.canonStates.length > 0)
      filters.push(inArray(relationships.canonState, query.canonStates));
    if (query.knowledgeStates.length > 0)
      filters.push(inArray(relationships.knowledgeState, query.knowledgeStates));
    if (query.visibilities.length > 0)
      filters.push(inArray(relationships.visibility, query.visibilities));
    return this.database
      .select()
      .from(relationships)
      .where(and(...filters))
      .orderBy(asc(relationships.updatedAt), asc(relationships.id))
      .all();
  }

  public list(request: RelationshipPageRequest): RelationshipPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const compare = request.order === 'asc' ? gt : lt;
    const filters: (SQL | undefined)[] = [
      eq(relationships.campaignId, request.campaignId),
      request.filters.archived
        ? isNotNull(relationships.archivedAt)
        : isNull(relationships.archivedAt),
      request.filters.relationshipTypeId === undefined
        ? undefined
        : eq(relationships.relationshipTypeId, request.filters.relationshipTypeId),
      request.filters.entityId === undefined
        ? undefined
        : or(
            eq(relationships.sourceEntityId, request.filters.entityId),
            eq(relationships.targetEntityId, request.filters.entityId),
          ),
      request.filters.canonState === undefined
        ? undefined
        : eq(relationships.canonState, request.filters.canonState),
      request.filters.knowledgeState === undefined
        ? undefined
        : eq(relationships.knowledgeState, request.filters.knowledgeState),
      request.filters.visibility === undefined
        ? undefined
        : eq(relationships.visibility, request.filters.visibility),
      cursor === null
        ? undefined
        : or(
            compare(relationships.updatedAt, cursor.updatedAt),
            and(
              eq(relationships.updatedAt, cursor.updatedAt),
              compare(relationships.id, cursor.id),
            ),
          ),
    ];
    const where = and(...filters.filter((value): value is SQL => value !== undefined));
    const rows = this.database
      .select()
      .from(relationships)
      .where(where)
      .orderBy(
        request.order === 'asc' ? asc(relationships.updatedAt) : desc(relationships.updatedAt),
        request.order === 'asc' ? asc(relationships.id) : desc(relationships.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = hasNextPage ? rows.slice(0, request.limit) : rows;
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasNextPage && last !== undefined
          ? Buffer.from(
              JSON.stringify({
                version: 1,
                campaignId: request.campaignId,
                ...request.filters,
                order: request.order,
                updatedAt: last.updatedAt,
                id: last.id,
              }),
              'utf8',
            ).toString('base64url')
          : null,
      total:
        this.database
          .select({ total: count() })
          .from(relationships)
          .where(and(...filters.slice(0, -1).filter((value): value is SQL => value !== undefined)))
          .get()?.total ?? 0,
    };
  }

  public update(input: RelationshipRepositoryUpdate, updatedAt: string): Relationship {
    const result = this.database
      .update(relationships)
      .set({ ...input.patch, updatedAt, revision: sql`${relationships.revision} + 1` })
      .where(
        and(
          eq(relationships.campaignId, input.campaignId),
          eq(relationships.id, input.id),
          eq(relationships.revision, input.revision),
        ),
      )
      .run();
    if (result.changes === 0) {
      const current = this.findById(input.campaignId, input.id);
      if (current === null) throw notFound(input.campaignId, input.id);
      throw new AppError('REVISION_CONFLICT', 'A relação foi alterada em outra operação.', {
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

function decodeCursor(
  cursor: string,
  request: RelationshipPageRequest,
): z.infer<typeof cursorSchema> {
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    if (
      parsed.campaignId !== request.campaignId ||
      parsed.relationshipTypeId !== request.filters.relationshipTypeId ||
      parsed.entityId !== request.filters.entityId ||
      parsed.canonState !== request.filters.canonState ||
      parsed.knowledgeState !== request.filters.knowledgeState ||
      parsed.visibility !== request.filters.visibility ||
      parsed.archived !== request.filters.archived ||
      parsed.order !== request.order
    )
      throw new Error();
    return parsed;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}
function notFound(campaignId: string, id: string): AppError {
  return new AppError('RELATIONSHIP_NOT_FOUND', 'A relação não foi encontrada.', {
    campaignId,
    id,
  });
}
