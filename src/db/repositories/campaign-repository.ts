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
  Campaign,
  CampaignPageRequest,
  CampaignPageResult,
} from '../../core/contracts/campaigns';
import { AppError } from '../../core/errors/app-error';
import { campaigns } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    sort: z.enum(['updatedAt', 'createdAt', 'name']),
    order: z.enum(['asc', 'desc']),
    value: z.string(),
    id: z.uuid(),
  })
  .strict();
type CampaignCursor = z.infer<typeof cursorSchema>;

type CampaignMutableField =
  | 'name'
  | 'systemName'
  | 'concept'
  | 'genre'
  | 'tone'
  | 'summary'
  | 'imagePath'
  | 'status'
  | 'archivedAt';

export type CampaignPersistencePatch = {
  [Field in CampaignMutableField]?: Campaign[Field] | undefined;
};

export interface CampaignRepositoryUpdate {
  id: string;
  revision: number;
  patch: CampaignPersistencePatch;
}

export class CampaignRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(campaign: Campaign): Campaign {
    this.database.insert(campaigns).values(campaign).run();
    return campaign;
  }

  public findById(id: string): Campaign | null {
    return this.database.select().from(campaigns).where(eq(campaigns.id, id)).get() ?? null;
  }

  public list(request: CampaignPageRequest): CampaignPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const filters = [inArray(campaigns.status, request.filters.statuses)];
    const cursorFilter = cursor === null ? undefined : createCursorFilter(cursor, sortExpression);
    if (cursorFilter !== undefined) filters.push(cursorFilter);

    const rows = this.database
      .select()
      .from(campaigns)
      .where(and(...filters))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(campaigns.id) : desc(campaigns.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = hasNextPage ? rows.slice(0, request.limit) : rows;
    const lastItem = items.at(-1);
    const totalRow = this.database
      .select({ total: count() })
      .from(campaigns)
      .where(inArray(campaigns.status, request.filters.statuses))
      .get();

    return {
      items,
      nextCursor:
        hasNextPage && lastItem !== undefined
          ? encodeCursor({
              version: 1,
              sort: request.sort,
              order: request.order,
              value: getCursorValue(lastItem, request.sort),
              id: lastItem.id,
            })
          : null,
      total: totalRow?.total ?? 0,
    };
  }

  public update(input: CampaignRepositoryUpdate, updatedAt: string): Campaign {
    const result = this.database
      .update(campaigns)
      .set({
        ...input.patch,
        updatedAt,
        revision: sql`${campaigns.revision} + 1`,
      })
      .where(and(eq(campaigns.id, input.id), eq(campaigns.revision, input.revision)))
      .run();

    if (result.changes === 0) {
      const current = this.findById(input.id);
      if (current === null) {
        throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', {
          id: input.id,
        });
      }

      throw new AppError('REVISION_CONFLICT', 'A campanha foi alterada em outra operação.', {
        expectedRevision: input.revision,
        currentRevision: current.revision,
        current,
      });
    }

    const updated = this.findById(input.id);
    if (updated === null) {
      throw new AppError(
        'CAMPAIGN_NOT_FOUND',
        'A campanha não foi encontrada após a atualização.',
        {
          id: input.id,
        },
      );
    }
    return updated;
  }
}

function getSortExpression(sort: CampaignPageRequest['sort']): SQLWrapper {
  if (sort === 'createdAt') return campaigns.createdAt;
  if (sort === 'name') return campaigns.name;
  return campaigns.updatedAt;
}

function createCursorFilter(cursor: CampaignCursor, sortExpression: SQLWrapper): SQL | undefined {
  const compareValue = cursor.order === 'asc' ? gt : lt;
  const compareId = cursor.order === 'asc' ? gt : lt;
  return or(
    compareValue(sortExpression, cursor.value),
    and(eq(sortExpression, cursor.value), compareId(campaigns.id, cursor.id)),
  );
}

function getCursorValue(campaign: Campaign, sort: CampaignPageRequest['sort']): string {
  if (sort === 'createdAt') return campaign.createdAt;
  if (sort === 'name') return campaign.name;
  return campaign.updatedAt;
}

function encodeCursor(cursor: CampaignCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string, request: CampaignPageRequest): CampaignCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (cursor.sort !== request.sort || cursor.order !== request.order) throw new Error();
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}
