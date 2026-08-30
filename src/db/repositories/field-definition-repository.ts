import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  lt,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  fieldDefinitionSchema,
  type FieldDefinition,
  type FieldDefinitionPageRequest,
  type FieldDefinitionPageResult,
} from '../../core/contracts/field-definitions';
import { AppError } from '../../core/errors/app-error';
import { entityTypes, fieldDefinitions } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    entityTypeId: z.uuid(),
    isArchived: z.boolean(),
    sort: z.enum(['sortOrder', 'label', 'updatedAt']),
    order: z.enum(['asc', 'desc']),
    value: z.union([z.string(), z.number()]),
    id: z.uuid(),
  })
  .strict();
type FieldDefinitionCursor = z.infer<typeof cursorSchema>;

type MutableField =
  | 'key'
  | 'label'
  | 'description'
  | 'dataType'
  | 'semanticRole'
  | 'required'
  | 'searchable'
  | 'secretByDefault'
  | 'defaultValue'
  | 'options'
  | 'validation'
  | 'referenceRelationshipTypeId'
  | 'referenceDirection'
  | 'allowedTargetTypeIds'
  | 'onDeleteBehavior'
  | 'sortOrder'
  | 'isArchived';

export type FieldDefinitionPersistencePatch = {
  [Field in MutableField]?: FieldDefinition[Field] | undefined;
};

export interface FieldDefinitionRepositoryUpdate {
  campaignId: string;
  entityTypeId: string;
  id: string;
  revision: number;
  patch: FieldDefinitionPersistencePatch;
}

export class FieldDefinitionRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(fieldDefinition: FieldDefinition): FieldDefinition {
    try {
      this.database.insert(fieldDefinitions).values(fieldDefinition).run();
      return fieldDefinition;
    } catch (error) {
      throw translateConstraintError(error, fieldDefinition.entityTypeId, fieldDefinition.key);
    }
  }

  public findById(campaignId: string, entityTypeId: string, id: string): FieldDefinition | null {
    const row = this.database
      .select(getTableColumns(fieldDefinitions))
      .from(fieldDefinitions)
      .innerJoin(entityTypes, eq(fieldDefinitions.entityTypeId, entityTypes.id))
      .where(
        and(
          eq(entityTypes.campaignId, campaignId),
          eq(fieldDefinitions.entityTypeId, entityTypeId),
          eq(fieldDefinitions.id, id),
        ),
      )
      .get();
    return row === undefined ? null : fieldDefinitionSchema.parse(row);
  }

  public listActive(campaignId: string, entityTypeId: string): FieldDefinition[] {
    return this.database
      .select(getTableColumns(fieldDefinitions))
      .from(fieldDefinitions)
      .innerJoin(entityTypes, eq(fieldDefinitions.entityTypeId, entityTypes.id))
      .where(
        and(
          eq(entityTypes.campaignId, campaignId),
          eq(fieldDefinitions.entityTypeId, entityTypeId),
          eq(fieldDefinitions.isArchived, false),
        ),
      )
      .orderBy(asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.label))
      .all()
      .map((row) => fieldDefinitionSchema.parse(row));
  }

  public list(request: FieldDefinitionPageRequest): FieldDefinitionPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = [
      eq(entityTypes.campaignId, request.campaignId),
      eq(fieldDefinitions.entityTypeId, request.entityTypeId),
      eq(fieldDefinitions.isArchived, request.filters.isArchived),
    ];
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    const filters = cursorFilter === undefined ? baseFilters : [...baseFilters, cursorFilter];
    const rows = this.database
      .select(getTableColumns(fieldDefinitions))
      .from(fieldDefinitions)
      .innerJoin(entityTypes, eq(fieldDefinitions.entityTypeId, entityTypes.id))
      .where(and(...filters))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(fieldDefinitions.id) : desc(fieldDefinitions.id),
      )
      .limit(request.limit + 1)
      .all()
      .map((row) => fieldDefinitionSchema.parse(row));
    const hasNextPage = rows.length > request.limit;
    const items = hasNextPage ? rows.slice(0, request.limit) : rows;
    const lastItem = items.at(-1);
    const totalRow = this.database
      .select({ total: count() })
      .from(fieldDefinitions)
      .innerJoin(entityTypes, eq(fieldDefinitions.entityTypeId, entityTypes.id))
      .where(and(...baseFilters))
      .get();

    return {
      items,
      nextCursor:
        hasNextPage && lastItem !== undefined
          ? encodeCursor({
              version: 1,
              campaignId: request.campaignId,
              entityTypeId: request.entityTypeId,
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

  public update(input: FieldDefinitionRepositoryUpdate, updatedAt: string): FieldDefinition {
    const scopedCurrent = this.findById(input.campaignId, input.entityTypeId, input.id);
    if (scopedCurrent === null) throw fieldDefinitionNotFound(input);

    try {
      const result = this.database
        .update(fieldDefinitions)
        .set({
          ...input.patch,
          updatedAt,
          revision: sql`${fieldDefinitions.revision} + 1`,
        })
        .where(
          and(
            eq(fieldDefinitions.entityTypeId, input.entityTypeId),
            eq(fieldDefinitions.id, input.id),
            eq(fieldDefinitions.revision, input.revision),
          ),
        )
        .run();
      if (result.changes === 0) {
        const current = this.findById(input.campaignId, input.entityTypeId, input.id);
        if (current === null) throw fieldDefinitionNotFound(input);
        throw new AppError(
          'REVISION_CONFLICT',
          'A definição de campo foi alterada em outra operação.',
          {
            expectedRevision: input.revision,
            currentRevision: current.revision,
            current,
          },
        );
      }
    } catch (error) {
      const key = typeof input.patch.key === 'string' ? input.patch.key : undefined;
      throw translateConstraintError(error, input.entityTypeId, key);
    }

    const updated = this.findById(input.campaignId, input.entityTypeId, input.id);
    if (updated === null) throw fieldDefinitionNotFound(input);
    return updated;
  }
}

function getSortExpression(sort: FieldDefinitionPageRequest['sort']): SQLWrapper {
  if (sort === 'label') return fieldDefinitions.label;
  if (sort === 'updatedAt') return fieldDefinitions.updatedAt;
  return fieldDefinitions.sortOrder;
}

function createCursorFilter(
  cursor: FieldDefinitionCursor,
  sortExpression: SQLWrapper,
): SQL | undefined {
  const compareValue = cursor.order === 'asc' ? gt : lt;
  const compareId = cursor.order === 'asc' ? gt : lt;
  return or(
    compareValue(sortExpression, cursor.value),
    and(eq(sortExpression, cursor.value), compareId(fieldDefinitions.id, cursor.id)),
  );
}

function getCursorValue(
  fieldDefinition: FieldDefinition,
  sort: FieldDefinitionPageRequest['sort'],
): string | number {
  if (sort === 'label') return fieldDefinition.label;
  if (sort === 'updatedAt') return fieldDefinition.updatedAt;
  return fieldDefinition.sortOrder;
}

function encodeCursor(cursor: FieldDefinitionCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string, request: FieldDefinitionPageRequest): FieldDefinitionCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.entityTypeId !== request.entityTypeId ||
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

function translateConstraintError(error: unknown, entityTypeId: string, key?: string): Error {
  if (findSqliteCode(error)?.startsWith('SQLITE_CONSTRAINT_UNIQUE') === true) {
    return new AppError(
      'FIELD_DEFINITION_KEY_CONFLICT',
      'Já existe um campo com essa chave neste tipo de entidade.',
      { entityTypeId, ...(key === undefined ? {} : { key }) },
    );
  }
  return error instanceof Error ? error : new Error('Falha desconhecida ao persistir campo.');
}

function findSqliteCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? findSqliteCode(error.cause) : undefined;
}

function fieldDefinitionNotFound(input: {
  campaignId: string;
  entityTypeId: string;
  id: string;
}): AppError {
  return new AppError('FIELD_DEFINITION_NOT_FOUND', 'A definição de campo não foi encontrada.', {
    campaignId: input.campaignId,
    entityTypeId: input.entityTypeId,
    id: input.id,
  });
}
