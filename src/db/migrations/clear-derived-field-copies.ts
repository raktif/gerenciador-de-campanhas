import type Database from 'better-sqlite3';
import { z } from 'zod';
import { stableExplicitNeedSignalId } from '../../core/domain/campaign-signal';

const notice = 'Conteúdo removido pela limpeza de campos.';
const record = z.record(z.string(), z.unknown());

function parseRecord(raw: string): Record<string, unknown> | undefined {
  try {
    const result = record.safeParse(JSON.parse(raw));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function isGeneratedNeedEvidence(
  type: unknown,
  order: unknown,
  role: unknown,
  description: unknown,
  summary: unknown,
): number {
  if (
    type !== 'entity' ||
    order !== 0 ||
    typeof role !== 'string' ||
    !role.startsWith('Necessidade explícita no campo “') ||
    typeof summary !== 'string'
  )
    return 0;
  const points = Array.from(summary);
  return Number(
    description === (points.length <= 2000 ? summary : `${points.slice(0, 1999).join('')}…`),
  );
}

function redactSnapshot(raw: string, signalId: string, entityId: string): string {
  const snapshot = record.parse(JSON.parse(raw));
  const signal = record.parse(snapshot.signal);
  const originalNeed = snapshot.need;
  if (typeof snapshot.acceptedPayload === 'string') {
    const payload = parseRecord(snapshot.acceptedPayload);
    if (payload?.need === originalNeed && payload?.requesterEntityId === entityId) {
      snapshot.acceptedPayload = JSON.stringify({ ...payload, need: notice });
    }
  }
  if (Array.isArray(snapshot.evidence)) {
    snapshot.evidence = snapshot.evidence.map((entry: unknown) => {
      const evidence = record.safeParse(entry);
      if (!evidence.success) return entry;
      const e = evidence.data;
      return e.signal_id === signalId &&
        e.object_id === entityId &&
        isGeneratedNeedEvidence(e.object_type, e.sort_order, e.role, e.description, signal.summary)
        ? { ...e, description: notice }
        : entry;
    });
  }
  snapshot.signal = { ...signal, summary: notice };
  snapshot.need = notice;
  return JSON.stringify(snapshot);
}

export function registerDerivedFieldCleanupFunctions(database: Database.Database): void {
  const options = { deterministic: true };
  database.function(
    'explicit_need_signal_id',
    options,
    (campaignId: string, entityId: string, fieldDefinitionId: string) =>
      stableExplicitNeedSignalId({ campaignId, entityId, fieldDefinitionId }),
  );
  database.function('removed_field_content_notice', options, () => notice);
  database.function('redact_explicit_need_snapshot', options, redactSnapshot);
  database.function('is_generated_need_evidence', options, isGeneratedNeedEvidence);
  database.function('explicit_need_summary', options, (value: unknown) =>
    typeof value === 'string' ? value.trim().replaceAll('\0', '�') : null,
  );
}

export function stageDerivedFieldCleanup(
  database: Database.Database,
  beforeFieldCleanup: boolean,
): void {
  database.exec(`CREATE TEMP TABLE cleared_explicit_need_signals (
    signal_id TEXT PRIMARY KEY NOT NULL, entity_id TEXT NOT NULL
  )`);
  if (!beforeFieldCleanup) return;
  database.exec(`
    INSERT INTO temp.cleared_explicit_need_signals
    SELECT s.id, v.entity_id
    FROM field_values v
    JOIN field_definitions f ON f.id = v.field_definition_id
    JOIN entities e ON e.id = v.entity_id AND e.entity_type_id = f.entity_type_id
    JOIN campaign_signals s ON s.id = explicit_need_signal_id(e.campaign_id, e.id, f.id)
      AND s.campaign_id = e.campaign_id
    WHERE s.signal_type = 'explicit_need' AND s.generator_kind = 'deterministic'
      AND s.rule_version = 'explicit-need-v1' AND s.summary = explicit_need_summary(v.value_text)
      AND (v.value_json IS NOT NULL OR f.data_type IN ('structured', 'rich_text')
        OR is_json_container_text(v.value_text) = 1)
  `);
}

export function applyDerivedFieldCleanup(database: Database.Database, sql: string): void {
  const guard = database
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'demands_update_guard'",
    )
    .get() as { sql: string } | undefined;
  if (guard === undefined) throw new Error('Proteção de atualização de Demandas não encontrada.');
  database.exec('DROP TRIGGER demands_update_guard');
  database.exec(sql);
  database.exec(guard.sql);
}
