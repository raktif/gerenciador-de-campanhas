CREATE TABLE structured_value_migration_snapshots (
  field_value_id TEXT PRIMARY KEY NOT NULL,
  field_definition_id TEXT NOT NULL,
  source_json TEXT CHECK (source_json IS NULL OR json_valid(source_json)),
  prior_rich_text TEXT,
  lossless_rich_text TEXT NOT NULL,
  restored_from_snapshot INTEGER NOT NULL CHECK (restored_from_snapshot IN (0, 1)),
  captured_at TEXT NOT NULL
);

INSERT INTO structured_value_migration_snapshots (
  field_value_id, field_definition_id, source_json, prior_rich_text,
  lossless_rich_text, restored_from_snapshot, captured_at
)
SELECT
  v.id,
  v.field_definition_id,
  source.source_json,
  v.value_text,
  CASE
    WHEN source.source_json IS NOT NULL
      AND v.entity_id = source.entity_id
      AND v.field_definition_id = source.field_definition_id
      AND v.created_at = source.created_at
      AND v.updated_at = source.updated_at
      AND v.revision = source.revision
      AND v.value_text IS source.legacy_rich_text
      THEN source.lossless_rich_text
    ELSE v.value_text
  END,
  CASE
    WHEN source.source_json IS NOT NULL
      AND v.entity_id = source.entity_id
      AND v.field_definition_id = source.field_definition_id
      AND v.created_at = source.created_at
      AND v.updated_at = source.updated_at
      AND v.revision = source.revision
      AND v.value_text IS source.legacy_rich_text THEN 1
    ELSE 0
  END,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM field_values v
JOIN field_definitions f ON f.id = v.field_definition_id AND f.data_type = 'rich_text'
LEFT JOIN temp.structured_value_snapshot_v31 source ON source.field_value_id = v.id
WHERE v.value_text IS NOT NULL;

UPDATE field_values
SET value_text = (
  SELECT snapshot.lossless_rich_text
  FROM structured_value_migration_snapshots snapshot
  WHERE snapshot.field_value_id = field_values.id
)
WHERE id IN (
  SELECT field_value_id
  FROM structured_value_migration_snapshots
  WHERE restored_from_snapshot = 1
);

CREATE INDEX structured_value_migration_snapshots_definition_idx
  ON structured_value_migration_snapshots (field_definition_id, field_value_id);
