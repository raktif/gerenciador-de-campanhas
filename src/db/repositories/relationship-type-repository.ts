import { and, asc, count, desc, eq, gt, lt, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import type {
  RelationshipType,
  RelationshipTypePageRequest,
  RelationshipTypePageResult,
  MoveRelationshipTypeInput,
} from '../../core/contracts/relationship-types';
import { AppError } from '../../core/errors/app-error';
import { moveRelative } from '../../core/ordering/move-relative';
import { relationshipTypes } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    isArchived: z.boolean(),
    sort: z.enum(['sortOrder', 'name', 'updatedAt']),
    order: z.enum(['asc', 'desc']),
    value: z.union([z.string(), z.number()]),
    id: z.uuid(),
  })
  .strict();
type RelationshipTypeCursor = z.infer<typeof cursorSchema>;

type MutableField =
  | 'name'
  | 'slug'
  | 'inverseName'
  | 'description'
  | 'semanticRole'
  | 'isSymmetric'
  | 'allowedSourceTypeIds'
  | 'allowedTargetTypeIds'
  | 'icon'
  | 'color'
  | 'sortOrder'
  | 'isArchived';
export type RelationshipTypePersistencePatch = {
  [Field in MutableField]?: RelationshipType[Field] | undefined;
};
export interface RelationshipTypeRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: RelationshipTypePersistencePatch;
}

export class RelationshipTypeRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(relationshipType: RelationshipType): RelationshipType {
    try {
      this.database.insert(relationshipTypes).values(toPersistenceValues(relationshipType)).run();
      return relationshipType;
    } catch (error) {
      throw translateConstraintError(error, relationshipType.campaignId, relationshipType.slug);
    }
  }

  public insertAtEnd(relationshipType: RelationshipType): RelationshipType {
    return this.database.transaction((transaction) => {
      const last = transaction
        .select({ sortOrder: relationshipTypes.sortOrder })
        .from(relationshipTypes)
        .where(
          and(
            eq(relationshipTypes.campaignId, relationshipType.campaignId),
            eq(relationshipTypes.isArchived, false),
          ),
        )
        .orderBy(desc(relationshipTypes.sortOrder))
        .get();
      const positioned = { ...relationshipType, sortOrder: (last?.sortOrder ?? -1) + 1 };
      try {
        transaction.insert(relationshipTypes).values(toPersistenceValues(positioned)).run();
      } catch (error) {
        throw translateConstraintError(error, positioned.campaignId, positioned.slug);
      }
      return positioned;
    });
  }

  public findById(campaignId: string, id: string): RelationshipType | null {
    const row = this.database
      .select()
      .from(relationshipTypes)
      .where(and(eq(relationshipTypes.campaignId, campaignId), eq(relationshipTypes.id, id)))
      .get();
    return row === undefined ? null : toContract(row);
  }

  public findBySlug(campaignId: string, slug: string): RelationshipType | null {
    const row = this.database
      .select()
      .from(relationshipTypes)
      .where(and(eq(relationshipTypes.campaignId, campaignId), eq(relationshipTypes.slug, slug)))
      .get();
    return row === undefined ? null : toContract(row);
  }

  public list(request: RelationshipTypePageRequest): RelationshipTypePageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = [
      eq(relationshipTypes.campaignId, request.campaignId),
      eq(relationshipTypes.isArchived, request.filters.isArchived),
    ];
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    const filters = cursorFilter === undefined ? baseFilters : [...baseFilters, cursorFilter];
    const rows = this.database
      .select()
      .from(relationshipTypes)
      .where(and(...filters))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(relationshipTypes.id) : desc(relationshipTypes.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = (hasNextPage ? rows.slice(0, request.limit) : rows).map(toContract);
    const lastItem = items.at(-1);
    const total =
      this.database
        .select({ total: count() })
        .from(relationshipTypes)
        .where(and(...baseFilters))
        .get()?.total ?? 0;
    return {
      items,
      nextCursor:
        hasNextPage && lastItem !== undefined
          ? encodeCursor({
              version: 1,
              campaignId: request.campaignId,
              isArchived: request.filters.isArchived,
              sort: request.sort,
              order: request.order,
              value: getCursorValue(lastItem, request.sort),
              id: lastItem.id,
            })
          : null,
      total,
    };
  }

  public update(input: RelationshipTypeRepositoryUpdate, updatedAt: string): RelationshipType {
    try {
      const result = this.database
        .update(relationshipTypes)
        .set({
          ...toPersistencePatch(input.patch),
          updatedAt,
          revision: sql`${relationshipTypes.revision} + 1`,
        })
        .where(
          and(
            eq(relationshipTypes.campaignId, input.campaignId),
            eq(relationshipTypes.id, input.id),
            eq(relationshipTypes.revision, input.revision),
          ),
        )
        .run();
      if (result.changes === 0) return this.throwUpdateFailure(input);
    } catch (error) {
      throw translateConstraintError(error, input.campaignId, input.patch.slug);
    }
    const updated = this.findById(input.campaignId, input.id);
    if (updated === null) throw notFound(input.campaignId, input.id);
    return updated;
  }

  public restoreAtEnd(
    input: Omit<RelationshipTypeRepositoryUpdate, 'patch'>,
    updatedAt: string,
  ): RelationshipType {
    return this.database.transaction((transaction) => {
      const row = transaction
        .select()
        .from(relationshipTypes)
        .where(
          and(
            eq(relationshipTypes.campaignId, input.campaignId),
            eq(relationshipTypes.id, input.id),
          ),
        )
        .get();
      if (row === undefined) throw notFound(input.campaignId, input.id);
      const current = toContract(row);
      if (current.revision !== input.revision) throw revisionConflict(current, input.revision);
      if (!current.isArchived)
        throw new AppError(
          'INVALID_RELATIONSHIP_TYPE_STATE',
          'O tipo de rela\u00e7\u00e3o j\u00e1 est\u00e1 ativo.',
        );

      const last = transaction
        .select({ sortOrder: relationshipTypes.sortOrder })
        .from(relationshipTypes)
        .where(
          and(
            eq(relationshipTypes.campaignId, input.campaignId),
            eq(relationshipTypes.isArchived, false),
          ),
        )
        .orderBy(desc(relationshipTypes.sortOrder))
        .get();
      const restoredResult = transaction
        .update(relationshipTypes)
        .set({
          isArchived: false,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          updatedAt,
          revision: sql`${relationshipTypes.revision} + 1`,
        })
        .where(
          and(
            eq(relationshipTypes.campaignId, input.campaignId),
            eq(relationshipTypes.id, input.id),
            eq(relationshipTypes.revision, input.revision),
          ),
        )
        .run();
      if (restoredResult.changes !== 1) throw revisionConflict(current, input.revision);
      const restored = transaction
        .select()
        .from(relationshipTypes)
        .where(
          and(
            eq(relationshipTypes.campaignId, input.campaignId),
            eq(relationshipTypes.id, input.id),
          ),
        )
        .get();
      if (restored === undefined) throw notFound(input.campaignId, input.id);
      return toContract(restored);
    });
  }

  public move(input: MoveRelationshipTypeInput, updatedAt: string): RelationshipType[] {
    return this.database.transaction((transaction) => {
      const current = transaction
        .select()
        .from(relationshipTypes)
        .where(
          and(
            eq(relationshipTypes.campaignId, input.campaignId),
            eq(relationshipTypes.isArchived, false),
          ),
        )
        .orderBy(
          asc(relationshipTypes.sortOrder),
          asc(relationshipTypes.name),
          asc(relationshipTypes.id),
        )
        .all()
        .map(toContract);
      const source = current.find(({ id }) => id === input.sourceId);
      const target = current.find(({ id }) => id === input.targetId);
      if (source === undefined) throw notFound(input.campaignId, input.sourceId);
      if (target === undefined) throw notFound(input.campaignId, input.targetId);
      if (source.revision !== input.sourceRevision)
        throw revisionConflict(source, input.sourceRevision);
      if (target.revision !== input.targetRevision)
        throw revisionConflict(target, input.targetRevision);

      const ordered = moveRelative(current, input);
      ordered.forEach((item, sortOrder) => {
        if (item.sortOrder === sortOrder) return;
        const result = transaction
          .update(relationshipTypes)
          .set({ sortOrder, updatedAt, revision: sql`${relationshipTypes.revision} + 1` })
          .where(
            and(
              eq(relationshipTypes.campaignId, input.campaignId),
              eq(relationshipTypes.id, item.id),
              eq(relationshipTypes.revision, item.revision),
            ),
          )
          .run();
        if (result.changes !== 1) throw revisionConflict(item, item.revision);
      });
      return transaction
        .select()
        .from(relationshipTypes)
        .where(
          and(
            eq(relationshipTypes.campaignId, input.campaignId),
            eq(relationshipTypes.isArchived, false),
          ),
        )
        .orderBy(
          asc(relationshipTypes.sortOrder),
          asc(relationshipTypes.name),
          asc(relationshipTypes.id),
        )
        .all()
        .map(toContract);
    });
  }

  private throwUpdateFailure(input: RelationshipTypeRepositoryUpdate): never {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw notFound(input.campaignId, input.id);
    throw new AppError('REVISION_CONFLICT', 'O tipo de relação foi alterado em outra operação.', {
      expectedRevision: input.revision,
      currentRevision: current.revision,
      current,
    });
  }
}

function toContract(row: typeof relationshipTypes.$inferSelect): RelationshipType {
  const { allowedSourceTypes, allowedTargetTypes, ...relationshipType } = row;
  return {
    ...relationshipType,
    allowedSourceTypeIds: allowedSourceTypes,
    allowedTargetTypeIds: allowedTargetTypes,
  };
}
function toPersistenceValues(
  relationshipType: RelationshipType,
): typeof relationshipTypes.$inferInsert {
  const { allowedSourceTypeIds, allowedTargetTypeIds, ...values } = relationshipType;
  return {
    ...values,
    allowedSourceTypes: allowedSourceTypeIds,
    allowedTargetTypes: allowedTargetTypeIds,
  };
}
function toPersistencePatch(
  patch: RelationshipTypePersistencePatch,
): Partial<typeof relationshipTypes.$inferInsert> {
  const values: Partial<typeof relationshipTypes.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.slug !== undefined) values.slug = patch.slug;
  if (patch.inverseName !== undefined) values.inverseName = patch.inverseName;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.semanticRole !== undefined) values.semanticRole = patch.semanticRole;
  if (patch.isSymmetric !== undefined) values.isSymmetric = patch.isSymmetric;
  if (patch.allowedSourceTypeIds !== undefined)
    values.allowedSourceTypes = patch.allowedSourceTypeIds;
  if (patch.allowedTargetTypeIds !== undefined)
    values.allowedTargetTypes = patch.allowedTargetTypeIds;
  if (patch.icon !== undefined) values.icon = patch.icon;
  if (patch.color !== undefined) values.color = patch.color;
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.isArchived !== undefined) values.isArchived = patch.isArchived;
  return values;
}
function getSortExpression(sort: RelationshipTypePageRequest['sort']): SQLWrapper {
  if (sort === 'name') return relationshipTypes.name;
  if (sort === 'updatedAt') return relationshipTypes.updatedAt;
  return relationshipTypes.sortOrder;
}
function createCursorFilter(
  cursor: RelationshipTypeCursor,
  expression: SQLWrapper,
): SQL | undefined {
  const compare = cursor.order === 'asc' ? gt : lt;
  return or(
    compare(expression, cursor.value),
    and(eq(expression, cursor.value), compare(relationshipTypes.id, cursor.id)),
  );
}
function getCursorValue(
  relationshipType: RelationshipType,
  sort: RelationshipTypePageRequest['sort'],
): string | number {
  if (sort === 'name') return relationshipType.name;
  if (sort === 'updatedAt') return relationshipType.updatedAt;
  return relationshipType.sortOrder;
}
function encodeCursor(cursor: RelationshipTypeCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
function decodeCursor(value: string, request: RelationshipTypePageRequest): RelationshipTypeCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.isArchived !== request.filters.isArchived ||
      cursor.sort !== request.sort ||
      cursor.order !== request.order
    )
      throw new Error();
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}
function translateConstraintError(error: unknown, campaignId: string, slug?: string): Error {
  if (
    findSqliteCode(error)?.startsWith('SQLITE_CONSTRAINT_UNIQUE') === true &&
    findSqliteMessage(error)?.includes('relationship_types.campaign_id, relationship_types.slug')
  )
    return new AppError(
      'RELATIONSHIP_TYPE_NAME_ALREADY_EXISTS',
      'Já existe um tipo de relação com esse nome. Escolha um nome diferente.',
      { campaignId, ...(slug === undefined ? {} : { slug }) },
    );
  return error instanceof Error ? error : new Error('Falha ao persistir tipo de relação.');
}
function findSqliteCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? findSqliteCode(error.cause) : undefined;
}
function findSqliteMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('message' in error && typeof error.message === 'string') return error.message;
  return 'cause' in error ? findSqliteMessage(error.cause) : undefined;
}

function revisionConflict(current: RelationshipType, expectedRevision: number): AppError {
  return new AppError(
    'REVISION_CONFLICT',
    'O tipo de rela\u00e7\u00e3o foi alterado em outra opera\u00e7\u00e3o.',
    { expectedRevision, currentRevision: current.revision, current },
  );
}
function notFound(campaignId: string, id: string): AppError {
  return new AppError('RELATIONSHIP_TYPE_NOT_FOUND', 'O tipo de relação não foi encontrado.', {
    campaignId,
    id,
  });
}
