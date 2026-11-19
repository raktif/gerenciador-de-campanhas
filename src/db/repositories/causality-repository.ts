import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../../core/errors/app-error';
import { causalChainSchema, causalLinkSchema, causalObjectSchema, type CausalChain, type CausalLink, type CausalObject, type CausalObjectType, type CausalType, type GetCausalChainInput } from '../../core/contracts/causality';

type Row = Record<string, unknown>;
const sourceTables: Record<CausalObjectType, { table: string; fk: string; label: string; archived: string }> = {
  entity: { table: 'entities', fk: 'entity_id', label: 'name', archived: 'archived_at IS NOT NULL' },
  relationship: { table: 'relationships', fk: 'relationship_id', label: 'coalesce(nullif(description, \'\'), id)', archived: 'archived_at IS NOT NULL' },
  assertion: { table: 'assertions', fk: 'assertion_id', label: "coalesce(statement, predicate, 'Afirmação')", archived: 'archived_at IS NOT NULL' },
  note: { table: 'notes', fk: 'note_id', label: 'title', archived: 'archived_at IS NOT NULL' },
  event: { table: 'events', fk: 'event_id', label: 'title', archived: 'archived_at IS NOT NULL' },
  session: { table: 'sessions', fk: 'session_id', label: 'title', archived: '0' },
  clock: { table: 'clocks', fk: 'clock_id', label: 'name', archived: "status = 'completed'" },
  demand: { table: 'demands', fk: 'demand_id', label: 'title', archived: "status = 'archived'" },
  story_thread: { table: 'story_threads', fk: 'story_thread_id', label: 'title', archived: "status = 'archived'" },
};

export class CausalityRepository {
  public constructor(private readonly database: Database.Database) {}

  public createLink(input: { id: string; campaignId: string; sourceType: CausalObjectType; sourceId: string; targetType: CausalObjectType; targetId: string; causalType: CausalType; description: string | null; createdAt: string; updatedAt: string }): CausalLink {
    return this.immediate(() => {
      const source = this.ensureObject(input.campaignId, input.sourceType, input.sourceId, input.createdAt, true);
      const target = this.ensureObject(input.campaignId, input.targetType, input.targetId, input.createdAt, true);
      this.database.prepare(`INSERT INTO causal_links (id, campaign_id, source_object_id, target_object_id, causal_type, description, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(input.id, input.campaignId, source.id, target.id, input.causalType, input.description, input.createdAt, input.updatedAt);
      return this.requireLink(input.campaignId, input.id);
    });
  }

  public updateLink(input: { campaignId: string; id: string; revision: number; description: string | null; updatedAt: string }): CausalLink {
    return this.immediate(() => {
      const result = this.database.prepare(`UPDATE causal_links SET description = ?, updated_at = ?, revision = revision + 1 WHERE campaign_id = ? AND id = ? AND revision = ?`).run(input.description, input.updatedAt, input.campaignId, input.id, input.revision);
      if (result.changes !== 1) throw new AppError('CAUSAL_LINK_REVISION_CONFLICT', 'O vínculo causal foi alterado. Recarregue o mapa e tente novamente.');
      return this.requireLink(input.campaignId, input.id);
    });
  }

  public getChain(input: GetCausalChainInput): CausalChain {
    const maxDepth = input.maxDepth ?? 8;
    const maxNodes = input.maxNodes ?? 100;
    const root = this.ensureObject(input.campaignId, input.objectType, input.objectId, new Date().toISOString(), false);
    const nodes = new Map<string, CausalObject>([[root.id, root]]);
    const links = new Map<string, CausalLink>();
    const queue: { id: string; depth: number }[] = [{ id: root.id, depth: 0 }];
    let truncated = false;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      if (current.depth >= maxDepth) {
        if (this.hasAdjacent(input.campaignId, current.id, input.direction)) truncated = true;
        continue;
      }
      for (const row of this.adjacentRows(input.campaignId, current.id, input.direction)) {
        const link = this.requireLink(input.campaignId, String(row.id));
        links.set(link.id, link);
        const next = link.source.id === current.id ? link.target : link.source;
        if (nodes.has(next.id)) continue;
        if (nodes.size >= maxNodes) { truncated = true; continue; }
        nodes.set(next.id, next);
        queue.push({ id: next.id, depth: current.depth + 1 });
      }
    }
    return causalChainSchema.parse({ root, nodes: [...nodes.values()], links: [...links.values()], truncated, maxDepth, maxNodes });
  }

  private ensureObject(campaignId: string, type: CausalObjectType, objectId: string, now: string, rejectArchived: boolean): CausalObject {
    const source = sourceTables[type];
    const sourceRow = this.database.prepare(`SELECT id, (${source.archived}) AS archived FROM ${source.table} WHERE id = ? AND campaign_id = ?`).get(objectId, campaignId) as Row | undefined;
    if (sourceRow === undefined) throw new AppError('CAUSAL_OBJECT_NOT_FOUND', 'O registro causal não foi encontrado nesta campanha.');
    if (rejectArchived && Boolean(sourceRow.archived)) throw new AppError('CAUSAL_OBJECT_ARCHIVED', 'Registros arquivados permanecem no histórico, mas não podem receber novos vínculos causais.');
    const existing = this.database.prepare('SELECT id FROM narrative_objects WHERE campaign_id = ? AND object_type = ? AND object_id = ?').get(campaignId, type, objectId) as Row | undefined;
    const id = existing === undefined ? randomUUID() : String(existing.id);
    if (existing === undefined) {
      this.database.prepare(`INSERT INTO narrative_objects (id, campaign_id, object_type, object_id, ${source.fk}, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, campaignId, type, objectId, objectId, now);
    }
    return this.readObject(campaignId, id);
  }

  private readObject(campaignId: string, id: string): CausalObject {
    const row = this.database.prepare('SELECT id, campaign_id, object_type, object_id FROM narrative_objects WHERE campaign_id = ? AND id = ?').get(campaignId, id) as Row | undefined;
    if (row === undefined) throw new AppError('CAUSAL_OBJECT_NOT_FOUND', 'O objeto causal não foi encontrado.');
    const type = String(row.object_type) as CausalObjectType;
    const source = sourceTables[type];
    const sourceRow = this.database.prepare(`SELECT ${source.label} AS label, (${source.archived}) AS archived FROM ${source.table} WHERE id = ?`).get(String(row.object_id)) as Row;
    return causalObjectSchema.parse({ id: textValue(row.id), campaignId: textValue(row.campaign_id), objectType: type, objectId: textValue(row.object_id), label: textValue(sourceRow.label) || 'Registro sem titulo', archived: Boolean(sourceRow.archived) });
  }

  private requireLink(campaignId: string, id: string): CausalLink {
    const row = this.database.prepare('SELECT * FROM causal_links WHERE campaign_id = ? AND id = ?').get(campaignId, id) as Row | undefined;
    if (row === undefined) throw new AppError('CAUSAL_LINK_NOT_FOUND', 'O vínculo causal não foi encontrado nesta campanha.');
    const source = this.readObject(campaignId, String(row.source_object_id));
    const target = this.readObject(campaignId, String(row.target_object_id));
    return causalLinkSchema.parse({ id: textValue(row.id), campaignId: textValue(row.campaign_id), source, target, causalType: row.causal_type, description: row.description === null ? null : textValue(row.description), createdAt: textValue(row.created_at), updatedAt: textValue(row.updated_at), revision: Number(row.revision) });
  }

  private adjacentRows(campaignId: string, objectId: string, direction: GetCausalChainInput['direction']): Row[] {
    const queries: string[] = [];
    if (direction === 'outgoing' || direction === 'both') queries.push('SELECT id FROM causal_links WHERE campaign_id = ? AND source_object_id = ? ORDER BY created_at, id');
    if (direction === 'incoming' || direction === 'both') queries.push('SELECT id FROM causal_links WHERE campaign_id = ? AND target_object_id = ? ORDER BY created_at, id');
    return queries.flatMap((query) => this.database.prepare(query).all(campaignId, objectId) as Row[]);
  }
  private hasAdjacent(campaignId: string, objectId: string, direction: GetCausalChainInput['direction']): boolean { return this.adjacentRows(campaignId, objectId, direction).length > 0; }
  private immediate<T>(operation: () => T): T { return this.database.transaction(operation).immediate(); }
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return value.toString();
  return '';
}
