import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  storyThreadDetailsSchema,
  storyThreadSchema,
  storyThreadTransitionSchema,
  storyThreadLinkSchema,
  type StoryThread,
  type StoryThreadDetails,
  type StoryThreadLinkInput,
  type StoryThreadPageRequest,
  type StoryThreadPageResult,
  type StoryThreadTarget,
  type StoryThreadTargetRequest,
  type StoryThreadTargetPageResult,
} from '../../core/contracts/story-threads';
import { AppError } from '../../core/errors/app-error';

type Link = StoryThreadLinkInput;
type CreateRecord = Omit<StoryThread, 'originSessionTitle'>;
type ThreadRow = Record<string, unknown>;
interface Cursor {
  campaignId: string;
  updatedAt: string;
  id: string;
  status?: string;
  type?: string;
}

const targetColumns: Record<string, string> = {
  entity: 'entity_id',
  relationship: 'relationship_id',
  assertion: 'assertion_id',
  note: 'note_id',
  event: 'event_id',
  session: 'session_id',
};
const targetTables: Record<string, { table: string; label: string; archived?: string }> = {
  entity: { table: 'entities', label: 'name', archived: 'archived_at' },
  relationship: { table: 'relationships', label: 'id', archived: 'archived_at' },
  assertion: {
    table: 'assertions',
    label: "coalesce(statement, predicate, 'Afirmação')",
    archived: 'archived_at',
  },
  note: { table: 'notes', label: 'title', archived: 'archived_at' },
  event: { table: 'events', label: 'title', archived: 'archived_at' },
  session: { table: 'sessions', label: 'title' },
};

export class StoryThreadRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(
    record: CreateRecord,
    links: Link[],
    initialReason: string | null,
  ): StoryThreadDetails {
    return this.immediate(() => {
      this.requireActiveCampaign(record.campaignId);
      if (record.originSessionId !== null)
        this.requireSession(record.campaignId, record.originSessionId);
      this.validateLinks(record.campaignId, links, new Set());
      this.database
        .prepare(
          `INSERT INTO story_threads (
            id, campaign_id, title, description, thread_type, status, status_before_archive,
            origin_kind, origin_session_id, origin_reason, created_at, updated_at, revision
          ) VALUES (@id, @campaignId, @title, @description, @threadType, @status, NULL,
            @originKind, @originSessionId, @originReason, @createdAt, @updatedAt, @revision)`,
        )
        .run(record);
      this.replaceLinks(record.campaignId, record.id, links, record.createdAt);
      this.insertTransition({
        campaignId: record.campaignId,
        threadId: record.id,
        fromStatus: null,
        toStatus: 'open',
        reason: initialReason,
        sessionId: record.originSessionId,
        occurredAt: record.createdAt,
      });
      return this.requireDetails(record.campaignId, record.id);
    });
  }

  public findById(campaignId: string, id: string): StoryThreadDetails | null {
    const row = this.database
      .prepare(
        `SELECT t.*, s.title AS origin_session_title
         FROM story_threads t LEFT JOIN sessions s ON s.id = t.origin_session_id
         WHERE t.campaign_id = ? AND t.id = ?`,
      )
      .get(campaignId, id) as ThreadRow | undefined;
    return row === undefined ? null : this.detailsFromRow(row);
  }

  public list(request: StoryThreadPageRequest): StoryThreadPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const filters = ['t.campaign_id = @campaignId'];
    const values: Record<string, string | number> = {
      campaignId: request.campaignId,
      limit: request.limit + 1,
    };
    if (request.status !== undefined) {
      filters.push('t.status = @status');
      values.status = request.status;
    }
    if (request.threadType !== undefined) {
      filters.push('t.thread_type = @threadType');
      values.threadType = request.threadType;
    }
    if (cursor !== null) {
      filters.push(
        '(t.updated_at < @cursorUpdatedAt OR (t.updated_at = @cursorUpdatedAt AND t.id < @cursorId))',
      );
      values.cursorUpdatedAt = cursor.updatedAt;
      values.cursorId = cursor.id;
    }
    const where = filters.join(' AND ');
    const rows = this.database
      .prepare(
        `SELECT t.*, s.title AS origin_session_title FROM story_threads t
         LEFT JOIN sessions s ON s.id = t.origin_session_id
         WHERE ${where} ORDER BY t.updated_at DESC, t.id DESC LIMIT @limit`,
      )
      .all(values) as ThreadRow[];
    const hasNext = rows.length > request.limit;
    const pageRows = hasNext ? rows.slice(0, request.limit) : rows;
    const items = pageRows.map((row) => storyThreadSchema.parse(this.mapThread(row)));
    const last = items.at(-1);
    const countValues: Record<string, string> = { campaignId: request.campaignId };
    const countFilters = ['campaign_id = @campaignId'];
    if (request.status !== undefined) {
      countFilters.push('status = @status');
      countValues.status = request.status;
    }
    if (request.threadType !== undefined) {
      countFilters.push('thread_type = @threadType');
      countValues.threadType = request.threadType;
    }
    const total = (
      this.database
        .prepare(`SELECT count(*) AS total FROM story_threads WHERE ${countFilters.join(' AND ')}`)
        .get(countValues) as { total: number }
    ).total;
    return {
      items,
      total,
      nextCursor:
        hasNext && last !== undefined
          ? encodeCursor({
              campaignId: request.campaignId,
              updatedAt: last.updatedAt,
              id: last.id,
              ...(request.status === undefined ? {} : { status: request.status }),
              ...(request.threadType === undefined ? {} : { type: request.threadType }),
            })
          : null,
    };
  }

  public listTargets(request: StoryThreadTargetRequest): StoryThreadTargetPageResult {
    const target = targetTables[request.targetType];
    if (target === undefined)
      throw new AppError('INVALID_THREAD_TARGET', 'Tipo de vínculo inválido.');
    const cursor =
      request.cursor === undefined ? null : decodeTargetCursor(request.cursor, request);
    const base =
      request.targetType === 'relationship'
        ? `SELECT r.id AS id,
           coalesce(nullif(r.description, ''), e1.name || ' — ' || rt.name || ' — ' || e2.name) AS label,
           0 AS archived
           FROM relationships r
           JOIN relationship_types rt ON rt.id = r.relationship_type_id
           JOIN entities e1 ON e1.id = r.source_entity_id
           JOIN entities e2 ON e2.id = r.target_entity_id
           WHERE r.campaign_id = ? AND r.archived_at IS NULL`
        : `SELECT id, ${target.label} AS label, 0 AS archived
           FROM ${target.table} WHERE campaign_id = ? ${
             target.archived === undefined ? '' : `AND ${target.archived} IS NULL`
           }`;
    const query =
      cursor === null
        ? `SELECT * FROM (${base}) AS candidates
           ORDER BY label COLLATE NOCASE, id LIMIT ?`
        : `SELECT * FROM (${base}) AS candidates
           WHERE label COLLATE NOCASE > ? COLLATE NOCASE
             OR (label COLLATE NOCASE = ? COLLATE NOCASE AND id > ?)
           ORDER BY label COLLATE NOCASE, id LIMIT ?`;
    const rows = this.database
      .prepare(query)
      .all(
        request.campaignId,
        ...(cursor === null ? [] : [cursor.label, cursor.label, cursor.id]),
        request.limit + 1,
      ) as ThreadRow[];
    const hasNext = rows.length > request.limit;
    const pageRows = hasNext ? rows.slice(0, request.limit) : rows;
    const items: StoryThreadTarget[] = pageRows.map((row) => ({
      id: String(row.id),
      label: typeof row.label === 'string' ? row.label : 'Registro sem título',
      archived: Boolean(row.archived),
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasNext && last !== undefined
          ? encodeTargetCursor({
              campaignId: request.campaignId,
              targetType: request.targetType,
              label: last.label,
              id: last.id,
            })
          : null,
    };
  }

  public update(
    input: {
      campaignId: string;
      id: string;
      revision: number;
      patch: { title?: string; description?: string | null; threadType?: string };
      links?: Link[];
    },
    updatedAt: string,
  ): StoryThreadDetails {
    return this.immediate(() => {
      this.requireActiveCampaign(input.campaignId);
      const current = this.requireCurrent(input.campaignId, input.id, input.revision);
      if (current.status === 'archived')
        throw new AppError('INVALID_THREAD_STATE', 'Desarquive o fio antes de editá-lo.');
      if (input.links !== undefined) {
        const old = this.database
          .prepare('SELECT target_type, target_id FROM story_thread_links WHERE thread_id = ?')
          .all(input.id) as { target_type: string; target_id: string }[];
        const historical = new Set(old.map((link) => `${link.target_type}\u0000${link.target_id}`));
        this.validateLinks(input.campaignId, input.links, historical);
      }
      const result = this.database
        .prepare(
          `UPDATE story_threads SET
           title = coalesce(@title, title),
           description = CASE WHEN @descriptionSet = 1 THEN @description ELSE description END,
           thread_type = coalesce(@threadType, thread_type),
           updated_at = @updatedAt, revision = revision + 1
           WHERE campaign_id = @campaignId AND id = @id AND revision = @revision`,
        )
        .run({
          campaignId: input.campaignId,
          id: input.id,
          revision: input.revision,
          title: input.patch.title ?? null,
          descriptionSet: input.patch.description === undefined ? 0 : 1,
          description: input.patch.description ?? null,
          threadType: input.patch.threadType ?? null,
          updatedAt,
        });
      if (result.changes !== 1) throw this.revisionConflict(input.campaignId, input.id);
      if (input.links !== undefined)
        this.replaceLinks(input.campaignId, input.id, input.links, updatedAt);
      return this.requireDetails(input.campaignId, input.id);
    });
  }

  public transition(
    input: {
      campaignId: string;
      id: string;
      revision: number;
      action: 'resolve' | 'abandon' | 'reopen' | 'archive' | 'restore' | 'set';
      status?: string;
      reason?: string | null;
      sessionId?: string;
    },
    timestamp: string,
  ): StoryThreadDetails {
    return this.immediate(() => {
      this.requireActiveCampaign(input.campaignId);
      const current = this.requireCurrent(input.campaignId, input.id, input.revision);
      const next = nextStatus(current, input.action, input.status);
      if (input.sessionId !== undefined) this.requireSession(input.campaignId, input.sessionId);
      const result = this.database
        .prepare(
          `UPDATE story_threads SET status = ?, status_before_archive = ?, updated_at = ?,
           revision = revision + 1 WHERE campaign_id = ? AND id = ? AND revision = ?`,
        )
        .run(
          next,
          next === 'archived' ? current.status : null,
          timestamp,
          input.campaignId,
          input.id,
          input.revision,
        );
      if (result.changes !== 1) throw this.revisionConflict(input.campaignId, input.id);
      this.insertTransition({
        campaignId: input.campaignId,
        threadId: input.id,
        fromStatus: current.status,
        toStatus: next,
        reason: input.reason ?? null,
        sessionId: input.sessionId ?? null,
        occurredAt: timestamp,
      });
      return this.requireDetails(input.campaignId, input.id);
    });
  }

  private validateLinks(campaignId: string, links: Link[], existing: Set<string>): void {
    for (const link of links) {
      const target = targetTables[link.targetType];
      if (target === undefined)
        throw new AppError('INVALID_THREAD_TARGET', 'Tipo de vínculo inválido.');
      const row = this.database
        .prepare(
          `SELECT ${target.archived === undefined ? '0' : `${target.archived} IS NOT NULL`} AS archived
           FROM ${target.table} WHERE id = ? AND campaign_id = ?`,
        )
        .get(link.targetId, campaignId) as { archived: number } | undefined;
      if (row === undefined)
        throw new AppError(
          'THREAD_TARGET_NOT_FOUND',
          'O registro escolhido não existe nesta campanha.',
          { targetType: link.targetType },
        );
      if (row.archived && !existing.has(`${link.targetType}\u0000${link.targetId}`))
        throw new AppError(
          'THREAD_TARGET_ARCHIVED',
          'Não é possível adicionar um novo vínculo a um registro arquivado.',
        );
    }
  }

  private replaceLinks(
    campaignId: string,
    threadId: string,
    links: Link[],
    timestamp: string,
  ): void {
    const existing = this.database
      .prepare(
        'SELECT id, target_type, target_id, sort_order, created_at FROM story_thread_links WHERE thread_id = ? ORDER BY sort_order, id',
      )
      .all(threadId) as {
      id: string;
      target_type: string;
      target_id: string;
      sort_order: number;
      created_at: string;
    }[];
    const existingByKey = new Map(
      existing.map((link) => [`${link.target_type}\u0000${link.target_id}`, link]),
    );
    const desiredKeys = new Set(links.map((link) => `${link.targetType}\u0000${link.targetId}`));
    for (const link of existing) {
      if (!desiredKeys.has(`${link.target_type}\u0000${link.target_id}`))
        this.database.prepare('DELETE FROM story_thread_links WHERE id = ?').run(link.id);
    }
    const insert = this.database.prepare(
      `INSERT INTO story_thread_links (
        id, campaign_id, thread_id, target_type, target_id, entity_id, relationship_id,
        assertion_id, note_id, event_id, session_id, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    links.forEach((link, index) => {
      const key = `${link.targetType}\u0000${link.targetId}`;
      const existingLink = existingByKey.get(key);
      if (existingLink !== undefined) {
        this.database
          .prepare('UPDATE story_thread_links SET sort_order = ? WHERE id = ?')
          .run(index, existingLink.id);
        return;
      }
      const column = targetColumns[link.targetType];
      insert.run(
        randomUUID(),
        campaignId,
        threadId,
        link.targetType,
        link.targetId,
        column === 'entity_id' ? link.targetId : null,
        column === 'relationship_id' ? link.targetId : null,
        column === 'assertion_id' ? link.targetId : null,
        column === 'note_id' ? link.targetId : null,
        column === 'event_id' ? link.targetId : null,
        column === 'session_id' ? link.targetId : null,
        index,
        timestamp,
      );
    });
  }

  private requireActiveCampaign(campaignId: string): void {
    const row = this.database
      .prepare('SELECT status FROM campaigns WHERE id = ?')
      .get(campaignId) as { status: string } | undefined;
    if (row === undefined)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.');
    if (row.status !== 'active')
      throw new AppError('CAMPAIGN_NOT_ACTIVE', 'A campanha não está ativa para alterações.');
  }

  private requireSession(campaignId: string, sessionId: string): void {
    const row = this.database
      .prepare('SELECT id FROM sessions WHERE id = ? AND campaign_id = ?')
      .get(sessionId, campaignId);
    if (row === undefined)
      throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada nesta campanha.');
  }

  private requireCurrent(campaignId: string, id: string, revision: number): StoryThread {
    const row = this.database
      .prepare('SELECT * FROM story_threads WHERE campaign_id = ? AND id = ?')
      .get(campaignId, id) as ThreadRow | undefined;
    if (row === undefined)
      throw new AppError('STORY_THREAD_NOT_FOUND', 'O fio não foi encontrado nesta campanha.');
    const current = storyThreadSchema.parse(this.mapThread(row));
    if (current.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'O fio foi alterado em outra operação.', {
        expectedRevision: revision,
        currentRevision: current.revision,
      });
    return current;
  }

  private revisionConflict(campaignId: string, id: string): AppError {
    const row = this.database
      .prepare('SELECT revision FROM story_threads WHERE campaign_id = ? AND id = ?')
      .get(campaignId, id) as { revision: number } | undefined;
    return row === undefined
      ? new AppError('STORY_THREAD_NOT_FOUND', 'O fio não foi encontrado nesta campanha.')
      : new AppError('REVISION_CONFLICT', 'O fio foi alterado em outra operação.', {
          currentRevision: row.revision,
        });
  }

  private insertTransition(input: {
    campaignId: string;
    threadId: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    sessionId: string | null;
    occurredAt: string;
  }): void {
    this.database
      .prepare(
        `INSERT INTO story_thread_transitions (
          id, campaign_id, thread_id, sequence_number, from_status, to_status, reason, session_id, occurred_at
        ) VALUES (?, ?, ?, (
          SELECT coalesce(max(sequence_number), 0) + 1
          FROM story_thread_transitions WHERE thread_id = ?
        ), ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.campaignId,
        input.threadId,
        input.threadId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.sessionId,
        input.occurredAt,
      );
  }

  private requireDetails(campaignId: string, id: string): StoryThreadDetails {
    const details = this.findById(campaignId, id);
    if (details === null) throw new AppError('STORY_THREAD_NOT_FOUND', 'O fio não foi encontrado.');
    return details;
  }

  private detailsFromRow(row: ThreadRow): StoryThreadDetails {
    const thread = storyThreadSchema.parse(this.mapThread(row));
    const links = this.database
      .prepare(
        `SELECT l.*, ${targetLabelSql()} AS label,
         ${targetArchiveSql()} AS archived
         FROM story_thread_links l
         LEFT JOIN entities e ON l.target_type = 'entity' AND e.id = l.target_id
         LEFT JOIN relationships r ON l.target_type = 'relationship' AND r.id = l.target_id
         LEFT JOIN relationship_types rt ON l.target_type = 'relationship' AND rt.id = r.relationship_type_id
         LEFT JOIN entities re1 ON l.target_type = 'relationship' AND re1.id = r.source_entity_id
         LEFT JOIN entities re2 ON l.target_type = 'relationship' AND re2.id = r.target_entity_id
         LEFT JOIN assertions a ON l.target_type = 'assertion' AND a.id = l.target_id
         LEFT JOIN notes n ON l.target_type = 'note' AND n.id = l.target_id
         LEFT JOIN events ev ON l.target_type = 'event' AND ev.id = l.target_id
         LEFT JOIN sessions s ON l.target_type = 'session' AND s.id = l.target_id
         WHERE l.thread_id = ? ORDER BY l.sort_order, l.id`,
      )
      .all(thread.id) as ThreadRow[];
    const transitions = this.database
      .prepare(
        `SELECT h.*, s.title AS session_title FROM story_thread_transitions h
         LEFT JOIN sessions s ON s.id = h.session_id
         WHERE h.thread_id = ? ORDER BY h.sequence_number`,
      )
      .all(thread.id) as ThreadRow[];
    return storyThreadDetailsSchema.parse({
      thread,
      links: links.map((link) =>
        storyThreadLinkSchema.parse({
          id: link.id,
          threadId: link.thread_id,
          targetType: link.target_type,
          targetId: link.target_id,
          label: link.label ?? 'Registro indisponível',
          archived: Boolean(link.archived),
          sortOrder: link.sort_order,
          createdAt: link.created_at,
        }),
      ),
      transitions: transitions.map((item) =>
        storyThreadTransitionSchema.parse({
          id: item.id,
          threadId: item.thread_id,
          fromStatus: item.from_status,
          toStatus: item.to_status,
          reason: item.reason,
          sessionId: item.session_id,
          sessionTitle: item.session_title,
          occurredAt: item.occurred_at,
        }),
      ),
    });
  }

  private mapThread(row: ThreadRow): unknown {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      title: row.title,
      description: row.description,
      threadType: row.thread_type,
      status: row.status,
      statusBeforeArchive: row.status_before_archive,
      originKind: row.origin_kind,
      originSessionId: row.origin_session_id,
      originSessionTitle: row.origin_session_title ?? null,
      originReason: row.origin_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
    };
  }

  private immediate<T>(operation: () => T): T {
    try {
      return this.database.transaction(operation).immediate();
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'SQLITE_BUSY' ||
          error.code === 'SQLITE_LOCKED' ||
          error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY')
      )
        throw new AppError(
          'STORY_THREAD_PERSISTENCE_CONFLICT',
          'A operação foi interrompida por um conflito de persistência.',
        );
      throw error;
    }
  }
}

function nextStatus(
  current: StoryThread,
  action: 'resolve' | 'abandon' | 'reopen' | 'archive' | 'restore' | 'set',
  target?: string,
): string {
  if (action === 'archive') {
    if (current.status === 'archived') throw invalidState('O fio já está arquivado.');
    return 'archived';
  }
  if (action === 'restore') {
    if (current.status !== 'archived' || current.statusBeforeArchive === null)
      throw invalidState('O fio não está arquivado.');
    return current.statusBeforeArchive;
  }
  if (action === 'resolve') {
    if (!['open', 'active', 'dormant'].includes(current.status))
      throw invalidState('Somente um fio aberto, ativo ou adormecido pode ser resolvido.');
    return 'resolved';
  }
  if (action === 'abandon') {
    if (!['open', 'active', 'dormant'].includes(current.status))
      throw invalidState('Somente um fio aberto, ativo ou adormecido pode ser abandonado.');
    return 'abandoned';
  }
  if (action === 'reopen') {
    if (!['resolved', 'abandoned'].includes(current.status))
      throw invalidState('Somente um fio resolvido ou abandonado pode ser reaberto.');
    return 'open';
  }
  if (current.status === 'archived' || ['resolved', 'abandoned'].includes(current.status))
    throw invalidState('Use a ação explícita de reabertura para este estado.');
  const destination = target ?? '';
  if (!['open', 'active', 'dormant'].includes(destination))
    throw new AppError('INVALID_THREAD_TRANSITION', 'Estado de destino inválido para esta ação.');
  if (current.status === destination) throw invalidState('O fio já está nesse estado.');
  return destination;
}

function invalidState(message: string): AppError {
  return new AppError('INVALID_THREAD_STATE', message);
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string, request: StoryThreadPageRequest): Cursor {
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.status !== request.status ||
      cursor.type !== request.threadType ||
      typeof cursor.updatedAt !== 'string' ||
      typeof cursor.id !== 'string'
    )
      throw new Error('invalid cursor');
    return cursor;
  } catch {
    throw new AppError('INVALID_CURSOR', 'O cursor de paginação não corresponde a esta consulta.');
  }
}

function encodeTargetCursor(cursor: {
  campaignId: string;
  targetType: string;
  label: string;
  id: string;
}): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeTargetCursor(
  value: string,
  request: StoryThreadTargetRequest,
): { label: string; id: string } {
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      campaignId: string;
      targetType: string;
      label: string;
      id: string;
    };
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.targetType !== request.targetType ||
      typeof cursor.label !== 'string' ||
      typeof cursor.id !== 'string'
    )
      throw new Error('invalid target cursor');
    return { label: cursor.label, id: cursor.id };
  } catch {
    throw new AppError(
      'INVALID_CURSOR',
      'O cursor de registros vinculáveis não corresponde a esta consulta.',
    );
  }
}

function targetLabelSql(): string {
  return "CASE l.target_type WHEN 'entity' THEN e.name WHEN 'relationship' THEN coalesce(nullif(r.description, ''), re1.name || ' — ' || rt.name || ' — ' || re2.name) WHEN 'assertion' THEN coalesce(a.statement, a.predicate, 'Afirmação') WHEN 'note' THEN n.title WHEN 'event' THEN ev.title WHEN 'session' THEN s.title END";
}

function targetArchiveSql(): string {
  return "CASE l.target_type WHEN 'entity' THEN e.archived_at IS NOT NULL WHEN 'relationship' THEN r.archived_at IS NOT NULL WHEN 'assertion' THEN a.archived_at IS NOT NULL WHEN 'note' THEN n.archived_at IS NOT NULL WHEN 'event' THEN ev.archived_at IS NOT NULL ELSE 0 END";
}
