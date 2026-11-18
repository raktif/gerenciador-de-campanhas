-- After v33, a locked, empty Need row plus the exact accepted JSON and
-- deterministic lineage identifies a cleared source even on a v33-only base.
CREATE TEMP TABLE cleared_demand_copies (id TEXT PRIMARY KEY NOT NULL);
INSERT INTO temp.cleared_demand_copies
SELECT d.id
FROM demands d
JOIN field_values v ON v.id = d.source_field_value_id
  AND v.entity_id = d.source_entity_id AND v.field_definition_id = d.source_field_definition_id
JOIN entities e ON e.id = v.entity_id AND e.campaign_id = d.campaign_id
JOIN campaign_signals s ON s.id = d.lineage_signal_id AND s.campaign_id = d.campaign_id
WHERE v.value_text = '' AND s.signal_type = 'explicit_need'
  AND s.generator_kind = 'deterministic' AND s.rule_version = 'explicit-need-v1'
  AND s.id = explicit_need_signal_id(d.campaign_id, v.entity_id, v.field_definition_id)
  AND json_extract(d.source_snapshot, '$.signal.id') = s.id
  AND json_extract(d.source_snapshot, '$.signal.campaign_id') = d.campaign_id
  AND json_extract(d.source_snapshot, '$.signal.signal_type') = s.signal_type
  AND json_extract(d.source_snapshot, '$.signal.generator_kind') = s.generator_kind
  AND json_extract(d.source_snapshot, '$.signal.rule_version') = s.rule_version
  AND json_extract(d.source_snapshot, '$.signal.summary') = explicit_need_summary(json_extract(d.source_snapshot, '$.need'))
  AND is_json_container_text(json_extract(d.source_snapshot, '$.need')) = 1;

INSERT OR IGNORE INTO temp.cleared_explicit_need_signals
SELECT d.lineage_signal_id, d.source_entity_id
FROM demands d JOIN temp.cleared_demand_copies c ON c.id = d.id;

UPDATE demands
SET need = CASE WHEN accepted_signal_id = lineage_signal_id
  AND need = json_extract(source_snapshot, '$.need') THEN removed_field_content_notice()
  ELSE need END,
  source_snapshot = redact_explicit_need_snapshot(source_snapshot, lineage_signal_id, source_entity_id)
WHERE id IN (SELECT id FROM temp.cleared_demand_copies);

UPDATE signal_evidence AS e
SET description = removed_field_content_notice()
WHERE EXISTS (
  SELECT 1
  FROM temp.cleared_explicit_need_signals c
  JOIN campaign_signals s ON s.id = c.signal_id
  WHERE e.signal_id = c.signal_id AND e.object_id = c.entity_id
    AND is_generated_need_evidence(e.object_type, e.sort_order, e.role, e.description, s.summary) = 1
);

UPDATE campaign_signals SET summary = removed_field_content_notice()
WHERE id IN (SELECT signal_id FROM temp.cleared_explicit_need_signals);

DROP TABLE temp.cleared_demand_copies;
DROP TABLE temp.cleared_explicit_need_signals;
