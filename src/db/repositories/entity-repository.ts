import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  entitySchema,
  fieldValueSchema,
  type Entity,
  type EntityDetails,
  type EntityPageRequest,
  type EntityPageResult,
  type FieldValue,
} from '../../core/contracts/entities';
import { AppError } from '../../core/errors/app-error';
import { entities, fieldValues } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    entityTypeId: z.uuid().optional(),
    archived: z.boolean(),
    sort: z.enum(['name', 'updatedAt', 'createdAt']),
    order: z.enum(['asc', 'desc']),
    value: z.string(),
    id: z.uuid(),
  })
  .strict();
type Cursor = z.infer<typeof cursorSchema>;
type MutableEntity =
  | 'entityTypeId'
  | 'name'
  | 'summary'
  | 'canonState'
  | 'knowledgeState'
  | 'visibility'
  | 'originKind'
  | 'sourceId'
  | 'archivedAt';
export type EntityPersistencePatch = { [Field in MutableEntity]?: Entity[Field] | undefined };
export interface EntityRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: EntityPersistencePatch;
}
export interface FieldValuePersistence {
  id: string;
  fieldDefinitionId: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueJson: FieldValue['value'];
}

export class EntityRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(entity: Entity, values: FieldValuePersistence[]): EntityDetails {
    this.database.transaction((transaction) => {
      transaction.insert(entities).values(entity).run();
      if (values.length > 0)
        transaction
          .insert(fieldValues)
          .values(
            values.map((value) => ({
              ...value,
              entityId: entity.id,
              createdAt: entity.createdAt,
              updatedAt: entity.updatedAt,
              revision: 1,
            })),
          )
          .run();
    });
    return this.requireDetails(entity.campaignId, entity.id);
  }

  public findById(campaignId: string, id: string): Entity | null {
    const row = this.database
      .select()
      .from(entities)
      .where(and(eq(entities.campaignId, campaignId), eq(entities.id, id)))
      .get();
    return row === undefined ? null : entitySchema.parse(row);
  }

  public getDetails(campaignId: string, id: string): EntityDetails | null {
    const entity = this.findById(campaignId, id);
    if (entity === null) return null;
    const values = this.database
      .select()
      .from(fieldValues)
      .where(eq(fieldValues.entityId, id))
      .all()
      .map(toFieldValue);
    return { entity, fieldValues: values };
  }

  public list(request: EntityPageRequest): EntityPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = sortColumn(request.sort);
    const baseFilters: SQL[] = [
      eq(entities.campaignId, request.campaignId),
      request.filters.archived ? isNotNull(entities.archivedAt) : isNull(entities.archivedAt),
    ];
    if (request.filters.entityTypeId !== undefined)
      baseFilters.push(eq(entities.entityTypeId, request.filters.entityTypeId));
    const cursorFilter = cursor === null ? undefined : cursorCondition(cursor, sortExpression);
    const filters = cursorFilter === undefined ? baseFilters : [...baseFilters, cursorFilter];
    const rows = this.database
      .select(getTableColumns(entities))
      .from(entities)
      .where(and(...filters))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(entities.id) : desc(entities.id),
      )
      .limit(request.limit + 1)
      .all()
      .map((row) => entitySchema.parse(row));
    const hasNext = rows.length > request.limit;
    const items = hasNext ? rows.slice(0, request.limit) : rows;
    const last = items.at(-1);
    const total =
      this.database
        .select({ total: count() })
        .from(entities)
        .where(and(...baseFilters))
        .get()?.total ?? 0;
    return {
      items,
      total,
      nextCursor:
        hasNext && last !== undefined
          ? encodeCursor({
              version: 1,
              campaignId: request.campaignId,
              ...(request.filters.entityTypeId === undefined
                ? {}
                : { entityTypeId: request.filters.entityTypeId }),
              archived: request.filters.archived,
              sort: request.sort,
              order: request.order,
              value: cursorValue(last, request.sort),
              id: last.id,
            })
          : null,
    };
  }

  public update(
    input: EntityRepositoryUpdate,
    updatedAt: string,
    values?: FieldValuePersistence[],
  ): EntityDetails {
    if (this.findById(input.campaignId, input.id) === null) throw notFound(input);
    this.database.transaction((transaction) => {
      const result = transaction
        .update(entities)
        .set({ ...input.patch, updatedAt, revision: sql`${entities.revision} + 1` })
        .where(
          and(
            eq(entities.campaignId, input.campaignId),
            eq(entities.id, input.id),
            eq(entities.revision, input.revision),
          ),
        )
        .run();
      if (result.changes === 0)
        throw new AppError('REVISION_CONFLICT', 'A entidade foi alterada em outra operação.');
      if (values !== undefined) {
        const ids = values.map(({ fieldDefinitionId }) => fieldDefinitionId);
        if (ids.length === 0)
          transaction.delete(fieldValues).where(eq(fieldValues.entityId, input.id)).run();
        else
          transaction
            .delete(fieldValues)
            .where(
              and(
                eq(fieldValues.entityId, input.id),
                notInArray(fieldValues.fieldDefinitionId, ids),
              ),
            )
            .run();
        for (const value of values)
          transaction
            .insert(fieldValues)
            .values({ ...value, entityId: input.id, createdAt: updatedAt, updatedAt, revision: 1 })
            .onConflictDoUpdate({
              target: [fieldValues.entityId, fieldValues.fieldDefinitionId],
              set: {
                valueText: value.valueText,
                valueNumber: value.valueNumber,
                valueBoolean: value.valueBoolean,
                valueDate: value.valueDate,
                valueJson: value.valueJson,
                updatedAt,
                revision: sql`${fieldValues.revision} + 1`,
              },
            })
            .run();
      }
    });
    return this.requireDetails(input.campaignId, input.id);
  }

  private requireDetails(campaignId: string, id: string): EntityDetails {
    const details = this.getDetails(campaignId, id);
    if (details === null) throw notFound({ campaignId, id });
    return details;
  }
}

function toFieldValue(row: typeof fieldValues.$inferSelect): FieldValue {
  const candidates = [
    row.valueText,
    row.valueNumber,
    row.valueBoolean,
    row.valueDate,
    row.valueJson,
  ].filter((value) => value !== null);
  if (candidates.length !== 1)
    throw new AppError('CORRUPT_FIELD_VALUE', 'O valor de campo persistido é inválido.', {
      id: row.id,
    });
  return fieldValueSchema.parse({
    id: row.id,
    entityId: row.entityId,
    fieldDefinitionId: row.fieldDefinitionId,
    value: candidates[0],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revision: row.revision,
  });
}
function sortColumn(sort: EntityPageRequest['sort']): SQLWrapper {
  if (sort === 'updatedAt') return entities.updatedAt;
  if (sort === 'createdAt') return entities.createdAt;
  return entities.name;
}
function cursorValue(entity: Entity, sort: EntityPageRequest['sort']): string {
  if (sort === 'updatedAt') return entity.updatedAt;
  if (sort === 'createdAt') return entity.createdAt;
  return entity.name;
}
function cursorCondition(cursor: Cursor, column: SQLWrapper): SQL | undefined {
  const compare = cursor.order === 'asc' ? gt : lt;
  return or(
    compare(column, cursor.value),
    and(eq(column, cursor.value), compare(entities.id, cursor.id)),
  );
}
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
function decodeCursor(value: string, request: EntityPageRequest): Cursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.entityTypeId !== request.filters.entityTypeId ||
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
function notFound(input: { campaignId: string; id: string }): AppError {
  return new AppError('ENTITY_NOT_FOUND', 'A entidade não foi encontrada.', input);
}
