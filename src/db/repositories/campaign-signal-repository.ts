import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { AssertionRepository } from './assertion-repository';
import {
  contradictionReviewSchema,
  type ContradictionReview,
  type ReviewCampaignSignalInput,
} from '../../core/contracts/campaign-signal-engine';
import type { Campaign } from '../../core/contracts/campaigns';
import {
  campaignSignalReviewItemSchema,
  campaignSignalRecalculationResultSchema,
  type CampaignSignalReviewItem,
  type CampaignSignalRecalculationResult,
} from '../../core/contracts/campaign-signal-engine';
import { campaignSignalSchema, type CampaignSignal } from '../../core/contracts/campaign-signals';
import { AppError } from '../../core/errors/app-error';
import {
  detectExplicitNeeds,
  type ExplicitNeedDetection,
  type ExplicitNeedInput,
} from '../../core/domain/campaign-signal';
import {
  detectPotentialContradictions,
  type ContradictionAssertionInput,
  type PotentialContradictionDetection,
} from '../../core/domain/campaign-contradiction';

interface SignalRow {
  id: string;
  campaign_id: string;
  signal_type: CampaignSignal['signalType'];
  title: string;
  summary: string;
  priority: CampaignSignal['priority'];
  status: CampaignSignal['status'];
  generated_at: string;
  last_detected_at: string;
  dismissed_until: string | null;
  rule_version: string;
  generator_kind: CampaignSignal['generatorKind'];
  created_at: string;
  updated_at: string;
  revision: number;
}

interface EvidenceRow {
  object_type: CampaignSignalReviewItem['evidence'][number]['objectType'];
  role: string;
  description: string | null;
  object_name: string | null;
  object_archived: number | null;
}

type CandidateRow = ExplicitNeedInput;
type SignalDetection = ExplicitNeedDetection | PotentialContradictionDetection;

export class CampaignSignalRepository {
  public constructor(private readonly database: Database.Database) {}

  public getContradictionReview(input: ReviewCampaignSignalInput): ContradictionReview {
    return this.runImmediateTransaction(() => {
      this.requireActiveCampaign(input.campaignId);
      const signal = this.findById(input.campaignId, input.id);
      if (signal === null)
        throw new AppError(
          'CAMPAIGN_SIGNAL_NOT_FOUND',
          'O sinal não foi encontrado nesta campanha.',
        );
      if (signal.revision !== input.revision)
        throw new AppError(
          'REVISION_CONFLICT',
          'O aviso mudou. Atualize os sinais antes de revisar.',
        );
      const inputs = this.readContradictionAssertions(input.campaignId);
      const detection = detectPotentialContradictions(inputs).find(
        ({ signalId }) => signalId === input.id,
      );
      const evidence = this.database
        .prepare('SELECT object_type, object_id FROM signal_evidence WHERE signal_id = ?')
        .all(input.id) as { object_type: string; object_id: string }[];
      if (
        signal.signalType !== 'potential_contradiction' ||
        detection === undefined ||
        evidence.length !== 2 ||
        !detection.assertions.every(({ id }) =>
          evidence.some((entry) => entry.object_type === 'assertion' && entry.object_id === id),
        )
      )
        throw new AppError(
          'POTENTIAL_CONTRADICTION_NO_LONGER_DETECTED',
          'O par está desatualizado ou suas evidências não estão disponíveis. Atualize os sinais.',
        );
      const repository = new AssertionRepository(drizzle(this.database, { schema }));
      return contradictionReviewSchema.parse({
        signal,
        assertions: detection.assertions.map(({ id }) => {
          const assertion = repository.findById(input.campaignId, id);
          const source = inputs.find((entry) => entry.id === id);
          if (assertion === null || source === undefined)
            throw new AppError('ASSERTION_NOT_FOUND', 'Uma afirmação do par não está disponível.');
          // Reuse the Registry's source lookup and scope guards before returning any metadata.
          const provenance =
            assertion.sourceId === null ? null : repository.findSourceContext(assertion.sourceId);
          if (assertion.sourceId !== null) {
            if (provenance === null)
              throw new AppError(
                'ASSERTION_SOURCE_SCOPE_UNVERIFIABLE',
                'Não é possível comprovar o escopo da fonte vinculada.',
              );
            this.requireExclusiveSourceScope(assertion.sourceId, input.campaignId);
          }
          if (provenance !== null) {
            if (provenance.kind !== assertion.originKind)
              throw new AppError(
                'ASSERTION_SOURCE_KIND_MISMATCH',
                'A fonte não corresponde à origem da afirmação.',
              );
            if (
              (provenance.kind === 'session' &&
                provenance.sessionCampaignId !== input.campaignId) ||
              (provenance.inboxItemId != null && provenance.inboxCampaignId !== input.campaignId)
            )
              throw new AppError(
                'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
                'A fonte da afirmação não pertence à campanha solicitada.',
              );
            if (
              provenance.inboxItemId != null &&
              (provenance.inboxOriginKind !== provenance.kind ||
                provenance.inboxSessionId !== provenance.sessionId ||
                (provenance.kind !== 'manual' && provenance.kind !== 'session') ||
                (provenance.kind === 'manual' && provenance.sessionId !== null) ||
                (provenance.kind === 'session' && provenance.sessionId === null))
            )
              throw new AppError(
                'ASSERTION_SOURCE_CAPTURE_MISMATCH',
                'A origem ou sessão da fonte não corresponde à captura vinculada.',
              );
          }

          return {
            assertion:
              provenance?.kind === 'session' && provenance.sessionId !== null
                ? { ...assertion, sessionId: provenance.sessionId }
                : assertion,
            subjectName: source.subjectName,
            objectName: source.objectName,
            sourceState: assertion.sourceId === null ? 'unlinked' : 'available',
            sourceDescription: provenance?.description ?? null,
            sessionTitle: provenance?.kind === 'session' ? (provenance.sessionTitle ?? null) : null,
          };
        }),
      });
    });
  }

  private requireExclusiveSourceScope(sourceId: string, campaignId: string): void {
    // sources has no owner/campaign column. Prove scope from ALL current associations,
    // including archived records and both endpoints of conversion records, in the caller's snapshot.
    const associations = this.database
      .prepare(
        `
      SELECT campaign_id FROM entities WHERE source_id = @sourceId
      UNION ALL SELECT campaign_id FROM assertions WHERE source_id = @sourceId
      UNION ALL SELECT campaign_id FROM relationships WHERE source_id = @sourceId
      UNION ALL SELECT campaign_id FROM notes WHERE source_id = @sourceId
      UNION ALL SELECT campaign_id FROM events WHERE source_id = @sourceId
      UNION ALL SELECT s.campaign_id FROM sources src LEFT JOIN sessions s ON s.id = src.session_id
        WHERE src.id = @sourceId AND src.session_id IS NOT NULL
      UNION ALL SELECT i.campaign_id FROM sources src LEFT JOIN inbox_items i ON i.id = src.inbox_item_id
        WHERE src.id = @sourceId AND src.inbox_item_id IS NOT NULL
      UNION ALL SELECT i.campaign_id FROM inbox_entity_conversions c LEFT JOIN inbox_items i ON i.id = c.inbox_item_id WHERE c.source_id = @sourceId
      UNION ALL SELECT e.campaign_id FROM inbox_entity_conversions c LEFT JOIN entities e ON e.id = c.entity_id WHERE c.source_id = @sourceId
      UNION ALL SELECT i.campaign_id FROM inbox_assertion_conversions c LEFT JOIN inbox_items i ON i.id = c.inbox_item_id WHERE c.source_id = @sourceId
      UNION ALL SELECT a.campaign_id FROM inbox_assertion_conversions c LEFT JOIN assertions a ON a.id = c.assertion_id WHERE c.source_id = @sourceId
      UNION ALL SELECT i.campaign_id FROM inbox_relationship_conversions c LEFT JOIN inbox_items i ON i.id = c.inbox_item_id WHERE c.source_id = @sourceId
      UNION ALL SELECT r.campaign_id FROM inbox_relationship_conversions c LEFT JOIN relationships r ON r.id = c.relationship_id WHERE c.source_id = @sourceId
      UNION ALL SELECT i.campaign_id FROM inbox_note_conversions c LEFT JOIN inbox_items i ON i.id = c.inbox_item_id WHERE c.source_id = @sourceId
      UNION ALL SELECT n.campaign_id FROM inbox_note_conversions c LEFT JOIN notes n ON n.id = c.note_id WHERE c.source_id = @sourceId
      UNION ALL SELECT i.campaign_id FROM inbox_event_conversions c LEFT JOIN inbox_items i ON i.id = c.inbox_item_id WHERE c.source_id = @sourceId
      UNION ALL SELECT e.campaign_id FROM inbox_event_conversions c LEFT JOIN events e ON e.id = c.event_id WHERE c.source_id = @sourceId
    `,
      )
      .all({ sourceId }) as { campaign_id: string | null }[];
    if (associations.length === 0 || associations.some((entry) => entry.campaign_id === null))
      throw new AppError(
        'ASSERTION_SOURCE_SCOPE_UNVERIFIABLE',
        'Não é possível comprovar o escopo da fonte vinculada.',
      );
    if (associations.some((entry) => entry.campaign_id !== campaignId))
      throw new AppError(
        'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
        'A fonte da afirmação não pertence exclusivamente à campanha solicitada.',
      );
  }

  private readExplicitNeedInputs(campaignId: string): ExplicitNeedInput[] {
    const rows = this.database
      .prepare(
        `SELECT entity.campaign_id AS campaignId,
                entity.id AS entityId,
                entity.name AS entityName,
                definition.id AS fieldDefinitionId,
                definition.label AS fieldLabel,
                value.value_text AS value
         FROM entities AS entity
         JOIN entity_types AS entity_type
           ON entity_type.id = entity.entity_type_id
          AND entity_type.campaign_id = entity.campaign_id
          AND entity_type.is_archived = 0
         JOIN field_definitions AS definition
           ON definition.entity_type_id = entity.entity_type_id
          AND definition.is_archived = 0
         JOIN field_values AS value
           ON value.entity_id = entity.id
          AND value.field_definition_id = definition.id
         WHERE entity.campaign_id = ?
           AND entity.archived_at IS NULL
           AND definition.semantic_role = 'need'
           AND definition.data_type IN ('short_text', 'long_text')
           AND value.value_text IS NOT NULL
         ORDER BY entity.id, definition.id`,
      )
      .all(campaignId) as CandidateRow[];
    return rows.filter((row) => row.value.trim().length > 0);
  }

  private readContradictionAssertions(campaignId: string): ContradictionAssertionInput[] {
    const rows = this.database
      .prepare(
        `SELECT assertion.campaign_id AS campaignId,
                assertion.id,
                assertion.subject_entity_id AS subjectEntityId,
                subject.name AS subjectName,
                assertion.predicate,
                assertion.object_entity_id AS objectEntityId,
                object.name AS objectName,
                assertion.statement,
                assertion.value_json AS valueJson,
                assertion.canon_state AS canonState,
                assertion.knowledge_state AS knowledgeState,
                assertion.archived_at AS archivedAt
         FROM assertions AS assertion
         JOIN entities AS subject
           ON subject.id = assertion.subject_entity_id
          AND subject.campaign_id = assertion.campaign_id
         LEFT JOIN entities AS object
           ON object.id = assertion.object_entity_id
          AND object.campaign_id = assertion.campaign_id
         WHERE assertion.campaign_id = ?
         ORDER BY assertion.id`,
      )
      .all(campaignId) as (Omit<ContradictionAssertionInput, 'value'> & {
      valueJson: string | null;
    })[];
    return rows.map(({ valueJson, ...row }) => ({
      ...row,
      value: valueJson === null ? null : (JSON.parse(valueJson) as unknown),
    }));
  }

  public list(campaignId: string): CampaignSignalReviewItem[] {
    return this.readList(campaignId);
  }

  private readList(campaignId: string): CampaignSignalReviewItem[] {
    const rows = this.database
      .prepare(
        `SELECT *
         FROM campaign_signals
         WHERE campaign_id = ?
         ORDER BY CASE status
           WHEN 'new' THEN 0 WHEN 'viewed' THEN 1 WHEN 'snoozed' THEN 2
           WHEN 'stale' THEN 3 WHEN 'dismissed' THEN 4 WHEN 'resolved' THEN 5
           ELSE 6 END,
           CASE priority
             WHEN 'very_high' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
             ELSE 3 END,
           updated_at DESC, id`,
      )
      .all(campaignId) as SignalRow[];
    return rows.map((row) => {
      const signal = parseSignalRow(row);
      const evidence = this.database
        .prepare(
          `SELECT evidence.object_type, evidence.role, evidence.description,
                  CASE
                    WHEN evidence.object_type = 'entity' THEN entity.name
                    WHEN evidence.object_type = 'assertion' THEN subject.name
                    ELSE NULL
                  END AS object_name,
                  CASE
                    WHEN evidence.object_type = 'entity' THEN
                      CASE WHEN entity.id IS NULL THEN NULL
                           WHEN entity.archived_at IS NULL THEN 0 ELSE 1 END
                    WHEN evidence.object_type = 'assertion' THEN
                      CASE WHEN assertion.id IS NULL THEN NULL
                           WHEN assertion.archived_at IS NULL THEN 0 ELSE 1 END
                    ELSE NULL
                  END AS object_archived
           FROM signal_evidence AS evidence
           LEFT JOIN entities AS entity
             ON evidence.object_type = 'entity'
            AND entity.id = evidence.object_id
            AND entity.campaign_id = ?
           LEFT JOIN assertions AS assertion
             ON evidence.object_type = 'assertion'
            AND assertion.id = evidence.object_id
            AND assertion.campaign_id = ?
           LEFT JOIN entities AS subject
             ON assertion.subject_entity_id = subject.id
            AND subject.campaign_id = ?
           WHERE evidence.signal_id = ?
           ORDER BY evidence.sort_order, evidence.id`,
        )
        .all(campaignId, campaignId, campaignId, signal.id) as EvidenceRow[];
      return campaignSignalReviewItemSchema.parse({
        signal,
        evidence: evidence.map((item) => ({
          objectType: item.object_type,
          role: item.role,
          description: item.description,
          objectName: item.object_name,
          objectArchived: item.object_archived === null ? null : item.object_archived === 1,
        })),
      });
    });
  }

  public findById(campaignId: string, id: string): CampaignSignal | null {
    const row = this.database
      .prepare('SELECT * FROM campaign_signals WHERE campaign_id = ? AND id = ?')
      .get(campaignId, id) as SignalRow | undefined;
    return row === undefined ? null : parseSignalRow(row);
  }

  public listAndExpireSnoozes(
    campaignId: string,
    now: string,
  ): { items: CampaignSignalReviewItem[]; expiredSnoozes: number } {
    return this.runImmediateTransaction(() => {
      const campaign = this.findCampaignStatus(campaignId);
      if (campaign === null)
        throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', {
          id: campaignId,
        });

      let expiredSnoozes = 0;
      if (campaign.status === 'active') {
        const detections = this.readDetections(campaignId);
        expiredSnoozes = this.expireSnoozesWithinTransaction(
          campaignId,
          new Set(detections.map(({ signalId }) => signalId)),
          now,
        );
      }

      return { items: this.readList(campaignId), expiredSnoozes };
    });
  }

  public recalculate(campaignId: string, now: string): CampaignSignalRecalculationResult {
    return this.runImmediateTransaction(() => {
      this.requireActiveCampaign(campaignId);
      const detections = this.readDetections(campaignId);
      const detectedSignalIds = new Set(detections.map(({ signalId }) => signalId));
      const detectedById = new Map(detections.map((detection) => [detection.signalId, detection]));
      const expiredSnoozes = this.expireSnoozesWithinTransaction(
        campaignId,
        detectedSignalIds,
        now,
      );
      const rows = this.database
        .prepare('SELECT * FROM campaign_signals WHERE campaign_id = ?')
        .all(campaignId) as SignalRow[];
      const existingIds = new Set(rows.map((row) => row.id));

      for (const row of rows) {
        const detection = detectedById.get(row.id);
        let nextStatus = row.status;
        const nextDismissedUntil = row.dismissed_until;
        if (detection === undefined && (row.status === 'new' || row.status === 'viewed'))
          nextStatus = 'stale';
        if (detection?.signalType === 'potential_contradiction' && row.status === 'stale')
          nextStatus = 'new';

        if (detection === undefined) {
          if (nextStatus !== row.status || nextDismissedUntil !== row.dismissed_until)
            this.updateRecalculatedSignal(row, {}, nextStatus, nextDismissedUntil, now);
          continue;
        }

        this.updateRecalculatedSignal(row, detection, nextStatus, nextDismissedUntil, now);
        this.upsertDetectionEvidence(detection, now);
      }

      const insert = this.database.prepare(
        `INSERT INTO campaign_signals (
          id, campaign_id, signal_type, title, summary, priority, status,
          generated_at, last_detected_at, dismissed_until, rule_version,
          generator_kind, created_at, updated_at, revision
        ) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, NULL, ?, 'deterministic', ?, ?, 1)`,
      );
      for (const detection of detections) {
        if (existingIds.has(detection.signalId)) continue;
        insert.run(
          detection.signalId,
          campaignId,
          detection.signalType,
          detection.title,
          detection.summary,
          detection.priority,
          now,
          now,
          detection.ruleVersion,
          now,
          now,
        );
        this.upsertDetectionEvidence(detection, now);
      }

      return campaignSignalRecalculationResultSchema.parse({
        items: this.readList(campaignId),
        detectedCount: detections.length,
        expiredSnoozes,
      });
    });
  }

  private readDetections(campaignId: string): SignalDetection[] {
    const existingExceptions = new Set(
      (
        this.database
          .prepare('SELECT signal_id FROM potential_contradiction_exceptions WHERE campaign_id = ?')
          .all(campaignId) as { signal_id: string }[]
      ).map(({ signal_id }) => signal_id),
    );
    const contradictions = detectPotentialContradictions(
      this.readContradictionAssertions(campaignId),
    ).filter(({ signalId }) => !existingExceptions.has(signalId));
    return [
      ...detectExplicitNeeds(this.readExplicitNeedInputs(campaignId)),
      ...contradictions,
    ].sort((left, right) => left.signalId.localeCompare(right.signalId));
  }

  private expireSnoozesWithinTransaction(
    campaignId: string,
    detectedSignalIds: ReadonlySet<string>,
    now: string,
  ): number {
    this.requireActiveCampaign(campaignId);
    const expired = this.database
      .prepare(
        `SELECT id, revision
           FROM campaign_signals
           WHERE campaign_id = ? AND status = 'snoozed'
             AND dismissed_until IS NOT NULL AND dismissed_until <= ?`,
      )
      .all(campaignId, now) as { id: string; revision: number }[];
    const update = this.database.prepare(
      `UPDATE campaign_signals
         SET status = ?, dismissed_until = NULL, updated_at = ?, revision = revision + 1
         WHERE campaign_id = ? AND id = ? AND status = 'snoozed'
           AND revision = ? AND dismissed_until <= ?`,
    );
    let updatedCount = 0;
    for (const signal of expired)
      updatedCount += update.run(
        detectedSignalIds.has(signal.id) ? 'new' : 'stale',
        now,
        campaignId,
        signal.id,
        signal.revision,
        now,
      ).changes;
    return updatedCount;
  }

  public updateStatus(
    campaignId: string,
    id: string,
    revision: number,
    status: CampaignSignal['status'],
    dismissedUntil: string | null,
    updatedAt: string,
  ): CampaignSignal {
    return this.runImmediateTransaction(() => {
      this.requireActiveCampaign(campaignId);
      const result = this.database
        .prepare(
          `UPDATE campaign_signals
           SET status = ?, dismissed_until = ?, updated_at = ?, revision = revision + 1
           WHERE campaign_id = ? AND id = ? AND revision = ?
             AND EXISTS (
               SELECT 1 FROM campaigns
               WHERE campaigns.id = campaign_signals.campaign_id
                 AND campaigns.status = 'active'
             )`,
        )
        .run(status, dismissedUntil, updatedAt, campaignId, id, revision);
      if (result.changes === 0) {
        this.requireActiveCampaign(campaignId);
        const current = this.findById(campaignId, id);
        if (current === null)
          throw new AppError(
            'CAMPAIGN_SIGNAL_NOT_FOUND',
            'O sinal não foi encontrado nesta campanha.',
          );
        throw new AppError('REVISION_CONFLICT', 'O sinal foi alterado em outra operação.', {
          expectedRevision: revision,
          currentRevision: current.revision,
        });
      }
      const updated = this.findById(campaignId, id);
      if (updated === null)
        throw new AppError(
          'CAMPAIGN_SIGNAL_NOT_FOUND',
          'O sinal não foi encontrado nesta campanha.',
        );
      return updated;
    });
  }

  public markContradictionException(
    campaignId: string,
    id: string,
    revision: number,
    createdAt: string,
  ): CampaignSignal {
    return this.runImmediateTransaction(() => {
      this.requireActiveCampaign(campaignId);
      const current = this.findById(campaignId, id);
      if (current === null)
        throw new AppError(
          'CAMPAIGN_SIGNAL_NOT_FOUND',
          'O sinal não foi encontrado nesta campanha.',
        );
      if (current.revision !== revision)
        throw new AppError('REVISION_CONFLICT', 'O sinal foi alterado em outra operação.', {
          expectedRevision: revision,
          currentRevision: current.revision,
        });
      if (current.signalType !== 'potential_contradiction')
        throw new AppError(
          'INVALID_POTENTIAL_CONTRADICTION_ACTION',
          'Somente uma possível contradição pode ser marcada como exceção.',
        );

      const detection = detectPotentialContradictions(
        this.readContradictionAssertions(campaignId),
      ).find(({ signalId }) => signalId === id);
      if (detection === undefined)
        throw new AppError(
          'POTENTIAL_CONTRADICTION_NO_LONGER_DETECTED',
          'As afirmações já não correspondem a este aviso. Recalcule os sinais.',
        );
      if (current.status === 'resolved')
        throw new AppError('INVALID_CAMPAIGN_SIGNAL_TRANSITION', 'Esta exceção já foi registrada.');

      const [first, second] = detection.assertions;
      this.database
        .prepare(
          `INSERT INTO potential_contradiction_exceptions (
             campaign_id, assertion_low_id, assertion_high_id, signal_id, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(campaignId, first.id, second.id, id, createdAt);
      const result = this.database
        .prepare(
          `UPDATE campaign_signals
           SET status = 'resolved', dismissed_until = NULL, updated_at = ?, revision = revision + 1
           WHERE campaign_id = ? AND id = ? AND revision = ?
             AND signal_type = 'potential_contradiction'
             AND EXISTS (
               SELECT 1 FROM campaigns
               WHERE campaigns.id = campaign_signals.campaign_id
                 AND campaigns.status = 'active'
             )`,
        )
        .run(createdAt, campaignId, id, revision);
      if (result.changes === 0)
        throw new AppError('REVISION_CONFLICT', 'O sinal foi alterado em outra operação.', {
          expectedRevision: revision,
        });
      const updated = this.findById(campaignId, id);
      if (updated === null)
        throw new AppError(
          'CAMPAIGN_SIGNAL_NOT_FOUND',
          'O sinal não foi encontrado nesta campanha.',
        );
      return updated;
    });
  }

  private requireActiveCampaign(campaignId: string): void {
    const campaign = this.findCampaignStatus(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', {
        id: campaignId,
      });
    if (campaign.status !== 'active')
      throw new AppError(
        'INVALID_CAMPAIGN_STATE',
        'Somente campanhas ativas podem revisar sinais.',
        {
          id: campaignId,
          status: campaign.status,
        },
      );
  }

  private findCampaignStatus(campaignId: string): Pick<Campaign, 'id' | 'status'> | null {
    const campaign = this.database
      .prepare('SELECT id, status FROM campaigns WHERE id = ?')
      .get(campaignId) as Pick<Campaign, 'id' | 'status'> | undefined;
    return campaign ?? null;
  }

  private runImmediateTransaction<T>(operation: () => T): T {
    try {
      return this.database.transaction(operation).immediate();
    } catch (error) {
      if (this.isSqliteLockError(error))
        throw new AppError(
          'DATABASE_BUSY',
          'O banco está ocupado por outra operação. Tente novamente.',
        );
      throw error;
    }
  }

  private updateRecalculatedSignal(
    current: SignalRow,
    detection: Partial<SignalDetection>,
    status: CampaignSignal['status'],
    dismissedUntil: string | null,
    now: string,
  ): void {
    const title = detection.title ?? current.title;
    const summary = detection.summary ?? current.summary;
    const priority = detection.priority ?? current.priority;
    const ruleVersion = detection.ruleVersion ?? current.rule_version;
    if (
      title === current.title &&
      summary === current.summary &&
      priority === current.priority &&
      ruleVersion === current.rule_version &&
      status === current.status &&
      dismissedUntil === current.dismissed_until &&
      now === current.last_detected_at
    )
      return;
    this.database
      .prepare(
        `UPDATE campaign_signals
         SET title = ?, summary = ?, priority = ?, status = ?,
             last_detected_at = CASE WHEN ? = 1 THEN ? ELSE last_detected_at END,
             dismissed_until = ?, rule_version = ?, updated_at = ?, revision = revision + 1
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(
        title,
        summary,
        priority,
        status,
        detection.title === undefined ? 0 : 1,
        now,
        dismissedUntil,
        ruleVersion,
        now,
        current.campaign_id,
        current.id,
      );
  }

  private isSqliteLockError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) return false;
    const code = error.code;
    return typeof code === 'string' && /^SQLITE_(BUSY|LOCKED)/.test(code);
  }

  private upsertEvidence(detection: ExplicitNeedDetection, now: string): void {
    const rows = this.database
      .prepare(
        `SELECT id, object_id, role, description
         FROM signal_evidence
         WHERE signal_id = ? AND object_type = 'entity'
         ORDER BY sort_order, id`,
      )
      .all(detection.signalId) as {
      id: string;
      object_id: string;
      role: string;
      description: string | null;
    }[];
    const primary = rows[0];
    if (primary === undefined) {
      this.database
        .prepare(
          `INSERT INTO signal_evidence (
            id, signal_id, object_type, object_id, role, description,
            graph_path_json, sort_order, created_at
          ) VALUES (?, ?, 'entity', ?, ?, ?, NULL, 0, ?)`,
        )
        .run(
          randomUUID(),
          detection.signalId,
          detection.entityId,
          detection.evidenceRole,
          detection.evidenceDescription,
          now,
        );
      return;
    }

    if (
      primary.role !== detection.evidenceRole ||
      primary.description !== detection.evidenceDescription ||
      primary.object_id !== detection.entityId
    )
      this.database
        .prepare('UPDATE signal_evidence SET object_id = ?, role = ?, description = ? WHERE id = ?')
        .run(detection.entityId, detection.evidenceRole, detection.evidenceDescription, primary.id);
    if (rows.length > 1)
      this.database
        .prepare('DELETE FROM signal_evidence WHERE signal_id = ? AND id <> ?')
        .run(detection.signalId, primary.id);
  }

  private upsertDetectionEvidence(detection: SignalDetection, now: string): void {
    if (detection.signalType === 'explicit_need') {
      this.upsertEvidence(detection, now);
      return;
    }

    const existing = this.database
      .prepare(
        `SELECT id, object_id, role, description
         FROM signal_evidence
         WHERE signal_id = ? AND object_type = 'assertion'
         ORDER BY sort_order, id`,
      )
      .all(detection.signalId) as {
      id: string;
      object_id: string;
      role: string;
      description: string | null;
    }[];
    const update = this.database.prepare(
      'UPDATE signal_evidence SET object_id = ?, role = ?, description = ?, sort_order = ? WHERE id = ?',
    );
    const insert = this.database.prepare(
      `INSERT INTO signal_evidence (
        id, signal_id, object_type, object_id, role, description,
        graph_path_json, sort_order, created_at
      ) VALUES (?, ?, 'assertion', ?, ?, ?, NULL, ?, ?)`,
    );
    detection.assertions.forEach((assertion, sortOrder) => {
      const row = existing[sortOrder];
      if (row === undefined) {
        insert.run(
          randomUUID(),
          detection.signalId,
          assertion.id,
          assertion.role,
          truncateEvidence(assertion.description),
          sortOrder,
          now,
        );
      } else if (
        row.object_id !== assertion.id ||
        row.role !== assertion.role ||
        row.description !== truncateEvidence(assertion.description)
      ) {
        update.run(
          assertion.id,
          assertion.role,
          truncateEvidence(assertion.description),
          sortOrder,
          row.id,
        );
      }
    });
    const keep = new Set(existing.slice(0, detection.assertions.length).map(({ id }) => id));
    if (existing.length > detection.assertions.length)
      this.database
        .prepare(
          `DELETE FROM signal_evidence
           WHERE signal_id = ? AND object_type = 'assertion' AND id NOT IN (${
             [...keep].map(() => '?').join(', ') || "''"
           })`,
        )
        .run(detection.signalId, ...keep);
  }
}

function parseSignalRow(row: SignalRow): CampaignSignal {
  return campaignSignalSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    signalType: row.signal_type,
    title: row.title,
    summary: row.summary,
    priority: row.priority,
    status: row.status,
    generatedAt: row.generated_at,
    lastDetectedAt: row.last_detected_at,
    dismissedUntil: row.dismissed_until,
    ruleVersion: row.rule_version,
    generatorKind: row.generator_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  });
}

function truncateEvidence(value: string): string {
  const points = Array.from(value.replaceAll('\0', '�'));
  if (points.length <= 2000) return value;
  return `${points.slice(0, 1999).join('')}…`;
}
