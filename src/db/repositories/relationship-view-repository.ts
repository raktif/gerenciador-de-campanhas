import type Database from 'better-sqlite3';
import {
  relationshipViewNodeSchema,
  relationshipViewSchema,
  relationshipViewStateSchema,
  type ApplyRelationshipAutoLayoutInput,
  type GetRelationshipViewInput,
  type RelationshipNodePosition,
  type RelationshipView,
  type RelationshipViewNode,
  type RelationshipViewState,
  type ResetRelationshipLayoutInput,
  type SaveRelationshipNodePositionInput,
  type SaveRelationshipViewportInput,
} from '../../core/contracts/relationship-views';
import { AppError } from '../../core/errors/app-error';

export class RelationshipViewRepository {
  public constructor(private readonly database: Database.Database) {}

  public findDefault(input: GetRelationshipViewInput): RelationshipViewState | null {
    const row = this.database
      .prepare(
        `${viewSelect}
         WHERE campaign_id = ? AND view_type = ? AND is_default = 1
           AND ((? IS NULL AND source_entity_id IS NULL) OR source_entity_id = ?)
         LIMIT 1`,
      )
      .get(input.campaignId, input.viewType, input.sourceEntityId, input.sourceEntityId) as
      RelationshipViewRow | undefined;
    return row === undefined ? null : this.toState(row);
  }

  public findById(campaignId: string, id: string): RelationshipViewState | null {
    const row = this.database
      .prepare(`${viewSelect} WHERE campaign_id = ? AND id = ? LIMIT 1`)
      .get(campaignId, id) as RelationshipViewRow | undefined;
    return row === undefined ? null : this.toState(row);
  }

  public insertDefault(view: RelationshipView): RelationshipViewState {
    return this.database.transaction(() => {
      try {
        this.database
          .prepare(
            `INSERT INTO relationship_views (
              id, campaign_id, name, view_type, source_entity_id, is_default,
              viewport_json, created_at, updated_at, revision
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            view.id,
            view.campaignId,
            view.name,
            view.viewType,
            view.sourceEntityId,
            view.isDefault ? 1 : 0,
            JSON.stringify(view.viewport),
            view.createdAt,
            view.updatedAt,
            view.revision,
          );
      } catch (error) {
        const existing = this.findDefault({
          campaignId: view.campaignId,
          viewType: view.viewType,
          sourceEntityId: view.sourceEntityId,
        });
        if (existing !== null) return existing;
        throw error;
      }
      return this.requireState(view.campaignId, view.id);
    })();
  }

  public saveNodePosition(
    input: SaveRelationshipNodePositionInput,
    updatedAt: string,
  ): RelationshipViewState {
    return this.database.transaction(() => {
      this.bumpRevision(input, updatedAt);
      this.upsertPosition(input.relationshipViewId, input.position, updatedAt);
      return this.requireState(input.campaignId, input.relationshipViewId);
    })();
  }

  public saveViewport(
    input: SaveRelationshipViewportInput,
    updatedAt: string,
  ): RelationshipViewState {
    return this.database.transaction(() => {
      this.bumpRevision(input, updatedAt, JSON.stringify(input.viewport));
      return this.requireState(input.campaignId, input.relationshipViewId);
    })();
  }

  public applyAutoLayout(
    input: ApplyRelationshipAutoLayoutInput,
    updatedAt: string,
  ): RelationshipViewState {
    return this.database.transaction(() => {
      this.bumpRevision(input, updatedAt, JSON.stringify(input.viewport));
      for (const position of input.positions)
        this.upsertPosition(input.relationshipViewId, position, updatedAt);
      return this.requireState(input.campaignId, input.relationshipViewId);
    })();
  }

  public resetLayout(
    input: ResetRelationshipLayoutInput,
    updatedAt: string,
  ): RelationshipViewState {
    return this.database.transaction(() => {
      this.bumpRevision(input, updatedAt, JSON.stringify({ x: 0, y: 0, zoom: 1 }));
      this.database
        .prepare('DELETE FROM relationship_view_nodes WHERE relationship_view_id = ?')
        .run(input.relationshipViewId);
      return this.requireState(input.campaignId, input.relationshipViewId);
    })();
  }

  private bumpRevision(
    input: { campaignId: string; relationshipViewId: string; revision: number },
    updatedAt: string,
    viewportJson?: string,
  ): void {
    const update =
      viewportJson === undefined
        ? this.database
            .prepare(
              `UPDATE relationship_views
               SET updated_at = ?, revision = revision + 1
               WHERE id = ? AND campaign_id = ? AND revision = ?`,
            )
            .run(updatedAt, input.relationshipViewId, input.campaignId, input.revision)
        : this.database
            .prepare(
              `UPDATE relationship_views
               SET viewport_json = ?, updated_at = ?, revision = revision + 1
               WHERE id = ? AND campaign_id = ? AND revision = ?`,
            )
            .run(
              viewportJson,
              updatedAt,
              input.relationshipViewId,
              input.campaignId,
              input.revision,
            );
    if (update.changes === 1) return;
    const current = this.findById(input.campaignId, input.relationshipViewId);
    if (current === null) throw relationshipViewNotFound(input.relationshipViewId);
    throw new AppError('REVISION_CONFLICT', 'O layout foi alterado em outra operação.', {
      expectedRevision: input.revision,
      currentRevision: current.view.revision,
    });
  }

  private upsertPosition(
    relationshipViewId: string,
    position: RelationshipNodePosition,
    updatedAt: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO relationship_view_nodes (
          relationship_view_id, entity_id, x, y, width, height, pinned, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (relationship_view_id, entity_id) DO UPDATE SET
          x = excluded.x,
          y = excluded.y,
          width = excluded.width,
          height = excluded.height,
          pinned = excluded.pinned,
          updated_at = excluded.updated_at`,
      )
      .run(
        relationshipViewId,
        position.entityId,
        position.x,
        position.y,
        position.width,
        position.height,
        position.pinned ? 1 : 0,
        updatedAt,
      );
  }

  private requireState(campaignId: string, id: string): RelationshipViewState {
    const state = this.findById(campaignId, id);
    if (state === null) throw relationshipViewNotFound(id);
    return state;
  }

  private toState(row: RelationshipViewRow): RelationshipViewState {
    const view = relationshipViewSchema.parse({
      id: row.id,
      campaignId: row.campaign_id,
      name: row.name,
      viewType: row.view_type,
      sourceEntityId: row.source_entity_id,
      isDefault: row.is_default === 1,
      viewport: JSON.parse(row.viewport_json) as unknown,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
    });
    const nodes = (
      this.database
        .prepare(
          `SELECT relationship_view_id, entity_id, x, y, width, height, pinned, updated_at
           FROM relationship_view_nodes
           WHERE relationship_view_id = ?
           ORDER BY entity_id`,
        )
        .all(view.id) as RelationshipViewNodeRow[]
    ).map(toNode);
    return relationshipViewStateSchema.parse({ view, nodes });
  }
}

const viewSelect = `
  SELECT id, campaign_id, name, view_type, source_entity_id, is_default,
         viewport_json, created_at, updated_at, revision
  FROM relationship_views
`;

interface RelationshipViewRow {
  id: string;
  campaign_id: string;
  name: string;
  view_type: RelationshipView['viewType'];
  source_entity_id: string | null;
  is_default: number;
  viewport_json: string;
  created_at: string;
  updated_at: string;
  revision: number;
}

interface RelationshipViewNodeRow {
  relationship_view_id: string;
  entity_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned: number;
  updated_at: string;
}

function toNode(row: RelationshipViewNodeRow): RelationshipViewNode {
  return relationshipViewNodeSchema.parse({
    relationshipViewId: row.relationship_view_id,
    entityId: row.entity_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    pinned: row.pinned === 1,
    updatedAt: row.updated_at,
  });
}

function relationshipViewNotFound(id: string): AppError {
  return new AppError(
    'RELATIONSHIP_VIEW_NOT_FOUND',
    'A visualização de Relações não foi encontrada nesta campanha.',
    { id },
  );
}
