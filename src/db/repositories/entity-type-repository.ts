import { and, asc, count, desc, eq, gt, lt, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import type {
  EntityType,
  EntityTypePageRequest,
  EntityTypePageResult,
  MoveEntityTypeInput,
} from '../../core/contracts/entity-types';
import { AppError } from '../../core/errors/app-error';
import { moveRelative } from '../../core/ordering/move-relative';
import { entityTypes } from '../schema';
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
type EntityTypeCursor = z.infer<typeof cursorSchema>;

type EntityTypeMutableField =
  'name' | 'singularName' | 'slug' | 'description' | 'icon' | 'color' | 'sortOrder' | 'isArchived';

export type EntityTypePersistencePatch = {
  [Field in EntityTypeMutableField]?: EntityType[Field] | undefined;
};

export interface EntityTypeRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: EntityTypePersistencePatch;
}

export class EntityTypeRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(entityType: EntityType): EntityType {
    try {
      this.database.insert(entityTypes).values(entityType).run();
      return entityType;
    } catch (error) {
      throw translateConstraintError(error, entityType.campaignId, entityType.slug);
    }
  }

  public insertAtEnd(entityType: EntityType): EntityType {
    return this.database.transaction((transaction) => {
      const last = transaction
        .select({ sortOrder: entityTypes.sortOrder })
        .from(entityTypes)
        .where(
          and(
            eq(entityTypes.campaignId, entityType.campaignId),
            eq(entityTypes.isArchived, false),
          ),
        )
        .orderBy(desc(entityTypes.sortOrder))
        .get();
      const positioned = { ...entityType, sortOrder: (last?.sortOrder ?? -1) + 1 };
      try {
        transaction.insert(entityTypes).values(positioned).run();
      } catch (error) {
        throw translateConstraintError(error, positioned.campaignId, positioned.slug);
      }
      return positioned;
    });
  }

  public findById(campaignId: string, id: string): EntityType | null {
    return (
      this.database
        .select()
        .from(entityTypes)
        .where(and(eq(entityTypes.campaignId, campaignId), eq(entityTypes.id, id)))
        .get() ?? null
    );
  }

  public list(request: EntityTypePageRequest): EntityTypePageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = [
      eq(entityTypes.campaignId, request.campaignId),
      eq(entityTypes.isArchived, request.filters.isArchived),
    ];
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    const filters = cursorFilter === undefined ? baseFilters : [...baseFilters, cursorFilter];

    const rows = this.database
      .select()
      .from(entityTypes)
      .where(and(...filters))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(entityTypes.id) : desc(entityTypes.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = hasNextPage ? rows.slice(0, request.limit) : rows;
    const lastItem = items.at(-1);
    const totalRow = this.database
      .select({ total: count() })
      .from(entityTypes)
      .where(and(...baseFilters))
      .get();

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
      total: totalRow?.total ?? 0,
    };
  }

  public update(input: EntityTypeRepositoryUpdate, updatedAt: string): EntityType {
    try {
      const result = this.database
        .update(entityTypes)
        .set({
          ...input.patch,
          updatedAt,
          revision: sql`${entityTypes.revision} + 1`,
        })
        .where(
          and(
            eq(entityTypes.campaignId, input.campaignId),
            eq(entityTypes.id, input.id),
            eq(entityTypes.revision, input.revision),
          ),
        )
        .run();

      if (result.changes === 0) return this.throwUpdateFailure(input);
    } catch (error) {
      const slug = typeof input.patch.slug === 'string' ? input.patch.slug : undefined;
      throw translateConstraintError(error, input.campaignId, slug);
    }

    const updated = this.findById(input.campaignId, input.id);
    if (updated === null) throw entityTypeNotFound(input.campaignId, input.id);
    return updated;
  }

  public restoreAtEnd(
    input: Omit<EntityTypeRepositoryUpdate, 'patch'>,
    updatedAt: string,
  ): EntityType {
    return this.database.transaction((transaction) => {
      const current = transaction
        .select()
        .from(entityTypes)
        .where(and(eq(entityTypes.campaignId, input.campaignId), eq(entityTypes.id, input.id)))
        .get();
      if (current === undefined) throw entityTypeNotFound(input.campaignId, input.id);
      if (current.revision !== input.revision) throw revisionConflict(current, input.revision);
      if (!current.isArchived)
        throw new AppError('INVALID_ENTITY_TYPE_STATE', 'O tipo de entidade j\u00e1 est\u00e1 ativo.');

      const last = transaction
        .select({ sortOrder: entityTypes.sortOrder })
        .from(entityTypes)
        .where(
          and(eq(entityTypes.campaignId, input.campaignId), eq(entityTypes.isArchived, false)),
        )
        .orderBy(desc(entityTypes.sortOrder))
        .get();
      const restoredResult = transaction
        .update(entityTypes)
        .set({
          isArchived: false,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          updatedAt,
          revision: sql`${entityTypes.revision} + 1`,
        })
        .where(
          and(
            eq(entityTypes.campaignId, input.campaignId),
            eq(entityTypes.id, input.id),
            eq(entityTypes.revision, input.revision),
          ),
        )
        .run();
      if (restoredResult.changes !== 1) throw revisionConflict(current, input.revision);
      const restored = transaction
        .select()
        .from(entityTypes)
        .where(and(eq(entityTypes.campaignId, input.campaignId), eq(entityTypes.id, input.id)))
        .get();
      if (restored === undefined) throw entityTypeNotFound(input.campaignId, input.id);
      return restored;
    });
  }

  public move(input: MoveEntityTypeInput, updatedAt: string): EntityType[] {
    return this.database.transaction((transaction) => {
      const current = transaction
        .select()
        .from(entityTypes)
        .where(
          and(eq(entityTypes.campaignId, input.campaignId), eq(entityTypes.isArchived, false)),
        )
        .orderBy(asc(entityTypes.sortOrder), asc(entityTypes.name), asc(entityTypes.id))
        .all();
      const source = current.find(({ id }) => id === input.sourceId);
      const target = current.find(({ id }) => id === input.targetId);
      if (source === undefined) throw entityTypeNotFound(input.campaignId, input.sourceId);
      if (target === undefined) throw entityTypeNotFound(input.campaignId, input.targetId);
      if (source.revision !== input.sourceRevision)
        throw revisionConflict(source, input.sourceRevision);
      if (target.revision !== input.targetRevision)
        throw revisionConflict(target, input.targetRevision);

      const ordered = moveRelative(current, input);
      ordered.forEach((item, sortOrder) => {
        if (item.sortOrder === sortOrder) return;
        const result = transaction
          .update(entityTypes)
          .set({ sortOrder, updatedAt, revision: sql`${entityTypes.revision} + 1` })
          .where(
            and(
              eq(entityTypes.campaignId, input.campaignId),
              eq(entityTypes.id, item.id),
              eq(entityTypes.revision, item.revision),
            ),
          )
          .run();
        if (result.changes !== 1) throw revisionConflict(item, item.revision);
      });
      return transaction
        .select()
        .from(entityTypes)
        .where(
          and(eq(entityTypes.campaignId, input.campaignId), eq(entityTypes.isArchived, false)),
        )
        .orderBy(asc(entityTypes.sortOrder), asc(entityTypes.name), asc(entityTypes.id))
        .all();
    });
  }

  private throwUpdateFailure(input: EntityTypeRepositoryUpdate): never {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw entityTypeNotFound(input.campaignId, input.id);
    throw new AppError('REVISION_CONFLICT', 'O tipo de entidade foi alterado em outra operação.', {
      expectedRevision: input.revision,
      currentRevision: current.revision,
      current,
    });
  }
}

function getSortExpression(sort: EntityTypePageRequest['sort']): SQLWrapper {
  if (sort === 'name') return entityTypes.name;
  if (sort === 'updatedAt') return entityTypes.updatedAt;
  return entityTypes.sortOrder;
}

function createCursorFilter(cursor: EntityTypeCursor, sortExpression: SQLWrapper): SQL | undefined {
  const compareValue = cursor.order === 'asc' ? gt : lt;
  const compareId = cursor.order === 'asc' ? gt : lt;
  return or(
    compareValue(sortExpression, cursor.value),
    and(eq(sortExpression, cursor.value), compareId(entityTypes.id, cursor.id)),
  );
}

function getCursorValue(
  entityType: EntityType,
  sort: EntityTypePageRequest['sort'],
): string | number {
  if (sort === 'name') return entityType.name;
  if (sort === 'updatedAt') return entityType.updatedAt;
  return entityType.sortOrder;
}

function encodeCursor(cursor: EntityTypeCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string, request: EntityTypePageRequest): EntityTypeCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.isArchived !== request.filters.isArchived ||
      cursor.sort !== request.sort ||
      cursor.order !== request.order
    ) {
      throw new Error();
    }
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}

function translateConstraintError(error: unknown, campaignId: string, slug?: string): Error {
  if (findSqliteCode(error)?.startsWith('SQLITE_CONSTRAINT_UNIQUE') === true) {
    return new AppError(
      'ENTITY_TYPE_SLUG_CONFLICT',
      'Já existe um tipo de entidade com esse slug nesta campanha.',
      { campaignId, ...(slug === undefined ? {} : { slug }) },
    );
  }
  return error instanceof Error
    ? error
    : new Error('Falha desconhecida ao persistir tipo de entidade.');
}

function findSqliteCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? findSqliteCode(error.cause) : undefined;
}

function entityTypeNotFound(campaignId: string, id: string): AppError {
  return new AppError('ENTITY_TYPE_NOT_FOUND', 'O tipo de entidade não foi encontrado.', {
    campaignId,
    id,
  });
}

function revisionConflict(current: EntityType, expectedRevision: number): AppError {
  return new AppError('REVISION_CONFLICT', 'O tipo de entidade foi alterado em outra opera\u00e7\u00e3o.', {
    expectedRevision,
    currentRevision: current.revision,
    current,
  });
}
