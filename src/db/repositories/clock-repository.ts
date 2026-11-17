import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  clockPageResultSchema,
  clockSchema,
  type Clock,
  type ClockPageRequest,
  type ClockPageResult,
  type ClockStatus,
  type ClockType,
} from '../../core/contracts/clocks';
import type {
  CanonState,
  KnowledgeState,
  OriginKind,
  VisibilityState,
} from '../../core/contracts/narrative';
import { AppError } from '../../core/errors/app-error';

type ClockRow = Record<string, unknown>;

interface ClockCursor {
  campaignId: string;
  status?: ClockStatus;
  updatedAt: string;
  id: string;
}

export interface ClockCreateRecord {
  idempotencyKey: string;
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  consequence: string;
  clockType: ClockType;
  segmentsTotal: number;
  segmentsFilled: number;
  entityId: string;
  canonState: CanonState;
  knowledgeState: KnowledgeState;
  visibility: VisibilityState;
  originKind: OriginKind;
  sourceId: string | null;
  generateEvent: boolean;
  generatedEventId: string | null;
  now: string;
}

export interface ClockUpdateRecord {
  campaignId: string;
  id: string;
  revision: number;
  patch: {
    name?: string;
    description?: string | null;
    consequence?: string;
    clockType?: ClockType;
    segmentsTotal?: number;
    segmentsFilled?: number;
    entityId?: string;
    canonState?: CanonState;
    knowledgeState?: KnowledgeState;
    visibility?: VisibilityState;
    originKind?: OriginKind;
    sourceId?: string | null;
  };
  generateEvent?: boolean;
  generatedEventId?: string;
  now: string;
}

export class ClockRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(record: ClockCreateRecord): Clock {
    return this.immediate(() => {
      const payloadHash = hashClockCreatePayload(record);
      const priorOperation = this.database
        .prepare(
          `SELECT campaign_id, payload_hash, clock_id
           FROM clock_create_operations WHERE idempotency_key = ?`,
        )
        .get(record.idempotencyKey) as
        { campaign_id: string; payload_hash: string; clock_id: string } | undefined;
      if (priorOperation !== undefined) {
        if (
          priorOperation.campaign_id !== record.campaignId ||
          priorOperation.payload_hash !== payloadHash
        )
          throw new AppError(
            'CLOCK_CREATE_IDEMPOTENCY_CONFLICT',
            'Esta tentativa de criação já foi usada com outros dados. Inicie uma nova criação.',
          );
        return this.requireClock(record.campaignId, priorOperation.clock_id);
      }
      this.requireActiveCampaign(record.campaignId);
      this.requireEntity(record.campaignId, record.entityId, true);
      this.validateSource(record.campaignId, record.originKind, record.sourceId);
      const status: ClockStatus =
        record.segmentsFilled === record.segmentsTotal ? 'completed' : 'active';
      const generatedEventId =
        status === 'completed' && record.generateEvent ? record.generatedEventId : null;
      if (status === 'completed' && record.generateEvent && generatedEventId === null)
        throw new AppError(
          'CLOCK_EVENT_ID_REQUIRED',
          'Não foi possível preparar o Evento de conclusão. Tente novamente.',
        );
      if (status !== 'completed' && record.generateEvent)
        throw new AppError(
          'CLOCK_EVENT_CHOICE_NOT_APPLICABLE',
          'O relógio ainda não será concluído.',
        );
      if (generatedEventId !== null) this.insertGeneratedEvent(record, generatedEventId);
      this.database
        .prepare(
          `INSERT INTO clocks (
            id, campaign_id, name, description, consequence, segments_total, segments_filled,
            clock_type, status, entity_id, canon_state, knowledge_state, visibility, origin_kind,
            source_id, generated_event_id, created_at, updated_at, revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          record.id,
          record.campaignId,
          record.name,
          record.description,
          record.consequence,
          record.segmentsTotal,
          record.segmentsFilled,
          record.clockType,
          status,
          record.entityId,
          record.canonState,
          record.knowledgeState,
          record.visibility,
          record.originKind,
          record.sourceId,
          generatedEventId,
          record.now,
          record.now,
        );
      this.database
        .prepare(
          `INSERT INTO clock_create_operations (
            idempotency_key, campaign_id, payload_hash, clock_id, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(record.idempotencyKey, record.campaignId, payloadHash, record.id, record.now);
      return this.requireClock(record.campaignId, record.id);
    });
  }

  public findById(campaignId: string, id: string): Clock | null {
    const row = this.database
      .prepare(
        `SELECT c.*, e.name AS entity_name, e.archived_at AS entity_archived_at
         FROM clocks c JOIN entities e ON e.id = c.entity_id
         WHERE c.campaign_id = ? AND c.id = ?`,
      )
      .get(campaignId, id) as ClockRow | undefined;
    return row === undefined ? null : this.mapClock(row);
  }

  public list(request: ClockPageRequest): ClockPageResult {
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor, request);
    const where = ['c.campaign_id = @campaignId'];
    const values: Record<string, string | number> = {
      campaignId: request.campaignId,
      limit: request.limit + 1,
    };
    if (request.status !== undefined) {
      where.push('c.status = @status');
      values.status = request.status;
    }
    if (cursor !== null) {
      where.push(
        '(c.updated_at < @cursorUpdatedAt OR (c.updated_at = @cursorUpdatedAt AND c.id < @cursorId))',
      );
      values.cursorUpdatedAt = cursor.updatedAt;
      values.cursorId = cursor.id;
    }
    const filter = where.join(' AND ');
    const rows = this.database
      .prepare(
        `SELECT c.*, e.name AS entity_name, e.archived_at AS entity_archived_at
         FROM clocks c JOIN entities e ON e.id = c.entity_id
         WHERE ${filter}
         ORDER BY c.updated_at DESC, c.id DESC LIMIT @limit`,
      )
      .all(values) as ClockRow[];
    const hasNext = rows.length > request.limit;
    const items = (hasNext ? rows.slice(0, request.limit) : rows).map((row) => this.mapClock(row));
    const last = items.at(-1);
    const totalRow = this.database
      .prepare(
        `SELECT count(*) AS total FROM clocks
         WHERE campaign_id = @campaignId ${request.status === undefined ? '' : 'AND status = @status'}`,
      )
      .get({
        campaignId: request.campaignId,
        ...(request.status === undefined ? {} : { status: request.status }),
      }) as { total: number };
    return clockPageResultSchema.parse({
      items,
      nextCursor:
        hasNext && last !== undefined
          ? encodeCursor({
              campaignId: request.campaignId,
              ...(request.status === undefined ? {} : { status: request.status }),
              updatedAt: last.updatedAt,
              id: last.id,
            })
          : null,
      total: totalRow.total,
    });
  }

  public update(input: ClockUpdateRecord): Clock {
    return this.immediate(() => {
      this.requireActiveCampaign(input.campaignId);
      const current = this.requireCurrent(input.campaignId, input.id, input.revision);
      this.requireActiveClock(current);
      const segmentsTotal = input.patch.segmentsTotal ?? current.segmentsTotal;
      const segmentsFilled = input.patch.segmentsFilled ?? current.segmentsFilled;
      if (segmentsFilled > segmentsTotal)
        throw new AppError(
          'CLOCK_PROGRESS_EXCEEDS_TOTAL',
          'O progresso atual excede o total escolhido. Ajuste o preenchimento antes de salvar.',
        );
      const status: ClockStatus = segmentsFilled === segmentsTotal ? 'completed' : 'active';
      const isCompleting = status === 'completed';
      if (isCompleting && input.generateEvent === undefined)
        throw new AppError(
          'CLOCK_EVENT_CHOICE_REQUIRED',
          'Confirme se deseja gerar um Evento antes de concluir o relógio.',
        );
      if (!isCompleting && input.generateEvent !== undefined)
        throw new AppError(
          'CLOCK_EVENT_CHOICE_NOT_APPLICABLE',
          'A escolha de gerar Evento só se aplica ao concluir o relógio.',
        );
      const entityId = input.patch.entityId ?? current.entityId;
      if (entityId !== current.entityId || current.entityArchivedAt === null)
        this.requireEntity(input.campaignId, entityId, true);
      const originKind = input.patch.originKind ?? current.originKind;
      const sourceId = input.patch.sourceId === undefined ? current.sourceId : input.patch.sourceId;
      this.validateSource(input.campaignId, originKind, sourceId);
      let generatedEventId: string | null = null;
      if (isCompleting && input.generateEvent) {
        this.requireEntity(input.campaignId, entityId, true);
        if (input.generatedEventId === undefined)
          throw new AppError(
            'CLOCK_EVENT_ID_REQUIRED',
            'Não foi possível preparar o Evento de conclusão. Tente novamente.',
          );
        generatedEventId = input.generatedEventId;
        this.insertGeneratedEvent(
          {
            id: input.id,
            campaignId: input.campaignId,
            name: input.patch.name ?? current.name,
            consequence: input.patch.consequence ?? current.consequence,
            entityId,
            now: input.now,
          },
          generatedEventId,
        );
      }
      const result = this.database
        .prepare(
          `UPDATE clocks SET
           name = @name, description = @description, consequence = @consequence,
           clock_type = @clockType, entity_id = @entityId,
           segments_total = @segmentsTotal, segments_filled = @segmentsFilled,
           status = @status, canon_state = @canonState, knowledge_state = @knowledgeState,
           visibility = @visibility, origin_kind = @originKind, source_id = @sourceId,
           generated_event_id = @generatedEventId,
           updated_at = @now, revision = revision + 1
           WHERE campaign_id = @campaignId AND id = @id AND revision = @revision
             AND status = 'active'`,
        )
        .run({
          campaignId: input.campaignId,
          id: input.id,
          revision: input.revision,
          name: input.patch.name ?? current.name,
          description:
            input.patch.description === undefined ? current.description : input.patch.description,
          consequence: input.patch.consequence ?? current.consequence,
          clockType: input.patch.clockType ?? current.clockType,
          entityId,
          segmentsTotal,
          segmentsFilled,
          status,
          canonState: input.patch.canonState ?? current.canonState,
          knowledgeState: input.patch.knowledgeState ?? current.knowledgeState,
          visibility: input.patch.visibility ?? current.visibility,
          originKind,
          sourceId,
          generatedEventId: generatedEventId ?? current.generatedEventId,
          now: input.now,
        });
      if (result.changes !== 1) throw this.revisionConflict(input.campaignId, input.id);
      return this.requireClock(input.campaignId, input.id);
    });
  }

  public complete(
    campaignId: string,
    id: string,
    revision: number,
    generateEvent: boolean,
    generatedEventId: string | undefined,
    now: string,
  ): Clock {
    return this.immediate(() => {
      this.requireActiveCampaign(campaignId);
      const current = this.requireCurrent(campaignId, id, revision);
      this.requireActiveClock(current);
      if (generateEvent) {
        this.requireEntity(campaignId, current.entityId, true);
        if (generatedEventId === undefined)
          throw new AppError(
            'CLOCK_EVENT_ID_REQUIRED',
            'Não foi possível preparar o Evento de conclusão. Tente novamente.',
          );
        this.insertGeneratedEvent(
          {
            id: current.id,
            campaignId,
            name: current.name,
            consequence: current.consequence,
            entityId: current.entityId,
            now,
          },
          generatedEventId,
        );
      }
      const result = this.database
        .prepare(
          `UPDATE clocks SET status = 'completed', generated_event_id = ?,
           updated_at = ?, revision = revision + 1
           WHERE campaign_id = ? AND id = ? AND revision = ? AND status = 'active'`,
        )
        .run(generateEvent ? generatedEventId : null, now, campaignId, id, revision);
      if (result.changes !== 1) throw this.revisionConflict(campaignId, id);
      return this.requireClock(campaignId, id);
    });
  }

  private requireActiveCampaign(campaignId: string): void {
    const row = this.database
      .prepare('SELECT status FROM campaigns WHERE id = ?')
      .get(campaignId) as { status: string } | undefined;
    if (row === undefined)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.');
    if (row.status !== 'active')
      throw new AppError('CLOCK_CAMPAIGN_NOT_ACTIVE', 'A campanha não está ativa para relógios.');
  }

  private requireEntity(campaignId: string, entityId: string, mustBeActive: boolean): void {
    const entity = this.database
      .prepare('SELECT campaign_id, archived_at FROM entities WHERE id = ?')
      .get(entityId) as { campaign_id: string; archived_at: string | null } | undefined;
    if (entity?.campaign_id !== campaignId)
      throw new AppError(
        'CLOCK_ENTITY_NOT_FOUND',
        'Escolha uma entidade existente desta campanha.',
      );
    if (mustBeActive && entity.archived_at !== null)
      throw new AppError(
        'CLOCK_ENTITY_ARCHIVED',
        'A entidade está arquivada. Não é possível criar um novo vínculo ou Evento.',
      );
  }

  private validateSource(
    campaignId: string,
    originKind: OriginKind,
    sourceId: string | null,
  ): void {
    if (sourceId === null) {
      if (originKind !== 'manual')
        throw new AppError('CLOCK_SOURCE_REQUIRED', 'A origem selecionada exige uma fonte válida.');
      return;
    }
    const source = this.database
      .prepare(
        `SELECT s.kind, s.inbox_item_id, i.campaign_id AS inbox_campaign_id,
                s.session_id, ss.campaign_id AS session_campaign_id
         FROM sources s
         LEFT JOIN inbox_items i ON i.id = s.inbox_item_id
         LEFT JOIN sessions ss ON ss.id = s.session_id
         WHERE s.id = ?`,
      )
      .get(sourceId) as
      | {
          kind: string;
          inbox_item_id: string | null;
          inbox_campaign_id: string | null;
          session_id: string | null;
          session_campaign_id: string | null;
        }
      | undefined;
    if (
      source?.kind !== originKind ||
      (source.session_id !== null && source.session_campaign_id !== campaignId) ||
      (source.inbox_item_id !== null && source.inbox_campaign_id !== campaignId)
    )
      throw new AppError(
        'CLOCK_SOURCE_INVALID',
        'A fonte não corresponde à origem ou não pertence a esta campanha.',
      );
  }

  private insertGeneratedEvent(
    clock: {
      id: string;
      campaignId: string;
      name: string;
      consequence: string;
      entityId: string;
      now: string;
    },
    eventId: string,
  ): void {
    this.requireEntity(clock.campaignId, clock.entityId, true);
    this.database
      .prepare(
        `INSERT INTO events (
          id, campaign_id, session_id, title, description_markdown, event_order,
          occurred_at_label, canon_state, knowledge_state, visibility, origin_kind, source_id,
          created_at, updated_at, archived_at, revision
        ) VALUES (?, ?, NULL, ?, ?, 0, NULL, 'draft', 'possibility', 'gm', 'manual', NULL, ?, ?, NULL, 1)`,
      )
      .run(eventId, clock.campaignId, clock.name, clock.consequence, clock.now, clock.now);
    this.database
      .prepare(
        `INSERT INTO event_entity_links (event_id, entity_id, role, sort_order)
         VALUES (?, ?, 'related', 0)`,
      )
      .run(eventId, clock.entityId);
  }

  private requireCurrent(campaignId: string, id: string, revision: number): Clock {
    const current = this.findById(campaignId, id);
    if (current === null)
      throw new AppError('CLOCK_NOT_FOUND', 'O relógio não foi encontrado nesta campanha.');
    if (current.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'O relógio foi alterado em outra operação.', {
        expectedRevision: revision,
        currentRevision: current.revision,
      });
    return current;
  }

  private requireActiveClock(clock: Clock): void {
    if (clock.status === 'completed')
      throw new AppError(
        'INVALID_CLOCK_STATE',
        'Relógios concluídos permanecem disponíveis para consulta, mas não podem ser alterados.',
      );
  }

  private revisionConflict(campaignId: string, id: string): AppError {
    const row = this.database
      .prepare('SELECT revision FROM clocks WHERE campaign_id = ? AND id = ?')
      .get(campaignId, id) as { revision: number } | undefined;
    return row === undefined
      ? new AppError('CLOCK_NOT_FOUND', 'O relógio não foi encontrado nesta campanha.')
      : new AppError('REVISION_CONFLICT', 'O relógio foi alterado em outra operação.', {
          currentRevision: row.revision,
        });
  }

  private requireClock(campaignId: string, id: string): Clock {
    const clock = this.findById(campaignId, id);
    if (clock === null)
      throw new AppError('CLOCK_NOT_FOUND', 'O relógio não foi encontrado nesta campanha.');
    return clock;
  }

  private mapClock(row: ClockRow): Clock {
    return clockSchema.parse({
      id: row.id,
      campaignId: row.campaign_id,
      name: row.name,
      description: row.description,
      consequence: row.consequence,
      clockType: row.clock_type,
      segmentsTotal: row.segments_total,
      segmentsFilled: row.segments_filled,
      status: row.status,
      entityId: row.entity_id,
      entityName: row.entity_name,
      entityArchivedAt: row.entity_archived_at,
      canonState: row.canon_state,
      knowledgeState: row.knowledge_state,
      visibility: row.visibility,
      originKind: row.origin_kind,
      sourceId: row.source_id,
      generatedEventId: row.generated_event_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
    });
  }

  private immediate<T>(operation: () => T): T {
    try {
      return this.database.transaction(operation).immediate();
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')
      )
        throw new AppError('DATABASE_BUSY', 'O banco está ocupado. Tente novamente.');
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
      )
        throw new AppError(
          'CLOCK_PERSISTENCE_CONFLICT',
          'A campanha mudou durante a operação. Nenhum progresso parcial foi salvo.',
        );
      if (error instanceof Error && error.message.includes('CLOCK_ENTITY_LINK_INVALID'))
        throw new AppError(
          'CLOCK_ENTITY_ARCHIVED',
          'A entidade foi arquivada durante a operação. O relógio não foi alterado.',
        );
      if (error instanceof Error && error.message.includes('CLOCK_SOURCE_INVALID'))
        throw new AppError(
          'CLOCK_SOURCE_INVALID',
          'A origem ou fonte não é válida para esta campanha.',
        );
      throw error;
    }
  }
}

function hashClockCreatePayload(record: ClockCreateRecord): string {
  const canonicalPayload = JSON.stringify({
    campaignId: record.campaignId,
    name: record.name,
    description: record.description,
    consequence: record.consequence,
    clockType: record.clockType,
    segmentsTotal: record.segmentsTotal,
    segmentsFilled: record.segmentsFilled,
    entityId: record.entityId,
    canonState: record.canonState,
    knowledgeState: record.knowledgeState,
    visibility: record.visibility,
    originKind: record.originKind,
    sourceId: record.sourceId,
    generateEvent: record.generateEvent,
  });
  return createHash('sha256').update(canonicalPayload).digest('hex');
}

function encodeCursor(cursor: ClockCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string, request: ClockPageRequest): ClockCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error('invalid cursor');
    const cursor = parsed as Record<string, unknown>;
    if (
      cursor.campaignId !== request.campaignId ||
      cursor.status !== request.status ||
      typeof cursor.updatedAt !== 'string' ||
      typeof cursor.id !== 'string'
    )
      throw new Error('cursor context mismatch');
    return {
      campaignId: request.campaignId,
      ...(request.status === undefined ? {} : { status: request.status }),
      updatedAt: cursor.updatedAt,
      id: cursor.id,
    };
  } catch {
    throw new AppError('INVALID_CLOCK_CURSOR', 'A página solicitada não corresponde à consulta.');
  }
}
