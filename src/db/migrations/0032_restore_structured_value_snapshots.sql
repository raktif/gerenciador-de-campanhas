UPDATE structured_value_migration_snapshots
SET
  source_json = (
    SELECT source.source_json
    FROM temp.structured_value_snapshot_v31 source
    WHERE source.field_value_id = structured_value_migration_snapshots.field_value_id
  ),
  lossless_rich_text = (
    SELECT source.lossless_rich_text
    FROM temp.structured_value_snapshot_v31 source
    WHERE source.field_value_id = structured_value_migration_snapshots.field_value_id
  ),
  restored_from_snapshot = CASE
    WHEN EXISTS (
      SELECT 1
      FROM field_values value
      JOIN temp.structured_value_snapshot_v31 source
        ON source.field_value_id = value.id
      WHERE value.id = structured_value_migration_snapshots.field_value_id
        AND value.value_text IS source.legacy_rich_text
    ) OR EXISTS (
      SELECT 1
      FROM field_values value
      JOIN temp.structured_value_snapshot_v31 source
        ON source.field_value_id = value.id
      WHERE value.id = structured_value_migration_snapshots.field_value_id
        AND value.value_text IS source.lossless_rich_text
    ) THEN 1
    ELSE 0
  END
WHERE EXISTS (
  SELECT 1
  FROM temp.structured_value_snapshot_v31 source
  WHERE source.field_value_id = structured_value_migration_snapshots.field_value_id
);

UPDATE field_values
SET value_text = (
  SELECT source.lossless_rich_text
  FROM temp.structured_value_snapshot_v31 source
  WHERE source.field_value_id = field_values.id
)
WHERE EXISTS (
  SELECT 1
  FROM temp.structured_value_snapshot_v31 source
  WHERE source.field_value_id = field_values.id
    AND field_values.value_text IS source.legacy_rich_text
);
