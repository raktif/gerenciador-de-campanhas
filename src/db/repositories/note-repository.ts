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
  type SQLWrapper,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  noteDetailsSchema,
  noteEntityLinkSchema,
  noteSchema,
  type Note,
  type NoteDetails,
  type NoteEntityLinkInput,
  type NotePageRequest,
  type NotePageResult,
  type NotePatch,
} from '../../core/contracts/notes';
import { AppError } from '../../core/errors/app-error';
import { noteEntityLinks, notes, sessions, sources } from '../schema';
import type * as schema from '../schema';

const cursorSchema = z
  .object({
    version: z.literal(1),
    campaignId: z.uuid(),
    entityId: z.uuid().optional(),
    noteType: z.string().optional(),
    canonState: z.string().optional(),
    knowledgeState: z.string().optional(),
    visibility: z.string().optional(),
    originKind: z.string().optional(),
    archived: z.boolean(),
    sort: z.enum(['title', 'updatedAt', 'createdAt']),
    order: z.enum(['asc', 'desc']),
    value: z.string(),
    id: z.uuid(),
  })
  .strict();

export interface NoteRepositoryUpdate {
  campaignId: string;
  id: string;
  revision: number;
  patch: NotePatch | { archivedAt: string | null };
  links?: NoteEntityLinkInput[];
}

export interface NoteSourceContext {
  kind: Note['originKind'];
  sessionCampaignId: string | null;
}

export class NoteRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(note: Note, links: NoteEntityLinkInput[]): NoteDetails {
    this.database.transaction((transaction) => {
      transaction.insert(notes).values(note).run();
      if (links.length > 0)
        transaction
          .insert(noteEntityLinks)
          .values(links.map((link) => ({ noteId: note.id, ...link })))
          .run();
    });
    return this.requireDetails(note.campaignId, note.id);
  }

  public findById(campaignId: string, id: string): NoteDetails | null {
    const row = this.database
      .select()
      .from(notes)
      .where(and(eq(notes.campaignId, campaignId), eq(notes.id, id)))
      .get();
    if (row === undefined) return null;
    const note = noteSchema.parse(row);
    const links = this.database
      .select()
      .from(noteEntityLinks)
      .where(eq(noteEntityLinks.noteId, id))
      .orderBy(asc(noteEntityLinks.entityId), asc(noteEntityLinks.role))
      .all()
      .map((link) => noteEntityLinkSchema.parse(link));
    return noteDetailsSchema.parse({ note, links });
  }

  public findSourceContext(id: string): NoteSourceContext | null {
    const row = this.database
      .select({ kind: sources.kind, sessionCampaignId: sessions.campaignId })
      .from(sources)
      .leftJoin(sessions, eq(sources.sessionId, sessions.id))
      .where(eq(sources.id, id))
      .get();
    return row ?? null;
  }

  public list(request: NotePageRequest): NotePageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const sortExpression = getSortExpression(request.sort);
    const baseFilters = createBaseFilters(this.database, request);
    const cursorFilter =
      cursor === null ? undefined : createCursorFilter(cursor, sortExpression, request.order);
    const rows = this.database
      .select()
      .from(notes)
      .where(and(...baseFilters, cursorFilter))
      .orderBy(
        request.order === 'asc' ? asc(sortExpression) : desc(sortExpression),
        request.order === 'asc' ? asc(notes.id) : desc(notes.id),
      )
      .limit(request.limit + 1)
      .all();
    const hasNextPage = rows.length > request.limit;
    const items = (hasNextPage ? rows.slice(0, request.limit) : rows).map((row) =>
      noteSchema.parse(row),
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
          .from(notes)
          .where(and(...baseFilters))
          .get()?.total ?? 0,
    };
  }

  public update(input: NoteRepositoryUpdate, updatedAt: string): NoteDetails {
    this.database.transaction((transaction) => {
      const result = transaction
        .update(notes)
        .set({ ...input.patch, updatedAt, revision: sql`${notes.revision} + 1` })
        .where(
          and(
            eq(notes.campaignId, input.campaignId),
            eq(notes.id, input.id),
            eq(notes.revision, input.revision),
          ),
        )
        .run();
      if (result.changes === 0) {
        const current = transaction
          .select()
          .from(notes)
          .where(and(eq(notes.campaignId, input.campaignId), eq(notes.id, input.id)))
          .get();
        if (current === undefined) throw notFound(input.campaignId, input.id);
        throw new AppError('REVISION_CONFLICT', 'A nota foi alterada em outra operação.', {
          expectedRevision: input.revision,
          currentRevision: current.revision,
          current: noteSchema.parse(current),
        });
      }
      if (input.links !== undefined) {
        transaction.delete(noteEntityLinks).where(eq(noteEntityLinks.noteId, input.id)).run();
        if (input.links.length > 0)
          transaction
            .insert(noteEntityLinks)
            .values(input.links.map((link) => ({ noteId: input.id, ...link })))
            .run();
      }
    });
    return this.requireDetails(input.campaignId, input.id);
  }

  private requireDetails(campaignId: string, id: string): NoteDetails {
    const details = this.findById(campaignId, id);
    if (details === null) throw notFound(campaignId, id);
    return details;
  }
}

function createBaseFilters(
  database: BetterSQLite3Database<typeof schema>,
  request: NotePageRequest,
): SQL[] {
  const linkedNoteIds =
    request.filters.entityId === undefined
      ? undefined
      : database
          .select({ noteId: noteEntityLinks.noteId })
          .from(noteEntityLinks)
          .where(eq(noteEntityLinks.entityId, request.filters.entityId));
  const filters: (SQL | undefined)[] = [
    eq(notes.campaignId, request.campaignId),
    request.filters.archived ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt),
    linkedNoteIds === undefined ? undefined : inArray(notes.id, linkedNoteIds),
    request.filters.noteType === undefined
      ? undefined
      : eq(notes.noteType, request.filters.noteType),
    request.filters.canonState === undefined
      ? undefined
      : eq(notes.canonState, request.filters.canonState),
    request.filters.knowledgeState === undefined
      ? undefined
      : eq(notes.knowledgeState, request.filters.knowledgeState),
    request.filters.visibility === undefined
      ? undefined
      : eq(notes.visibility, request.filters.visibility),
    request.filters.originKind === undefined
      ? undefined
      : eq(notes.originKind, request.filters.originKind),
  ];
  return filters.filter((value): value is SQL => value !== undefined);
}

function getSortExpression(sort: NotePageRequest['sort']): SQLWrapper {
  if (sort === 'title') return notes.title;
  return sort === 'createdAt' ? notes.createdAt : notes.updatedAt;
}

function getCursorValue(note: Note, sort: NotePageRequest['sort']): string {
  if (sort === 'title') return note.title;
  return sort === 'createdAt' ? note.createdAt : note.updatedAt;
}

function createCursorFilter(
  cursor: z.infer<typeof cursorSchema>,
  expression: SQLWrapper,
  order: NotePageRequest['order'],
): SQL | undefined {
  const compare = order === 'asc' ? gt : lt;
  return or(
    compare(expression, cursor.value),
    and(eq(expression, cursor.value), compare(notes.id, cursor.id)),
  );
}

function encodeCursor(request: NotePageRequest, value: string, id: string): string {
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

function decodeCursor(value: string, request: NotePageRequest): z.infer<typeof cursorSchema> {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.entityId !== request.filters.entityId ||
      cursor.noteType !== request.filters.noteType ||
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
  return new AppError('NOTE_NOT_FOUND', 'A nota não foi encontrada.', { campaignId, id });
}
