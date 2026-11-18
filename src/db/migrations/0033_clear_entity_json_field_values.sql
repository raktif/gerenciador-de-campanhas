-- Store only IDs, never the contents being cleared.
CREATE TEMP TABLE entity_json_field_value_removals (id TEXT PRIMARY KEY NOT NULL);

INSERT INTO temp.entity_json_field_value_removals (id)
SELECT v.id
FROM field_values v
JOIN field_definitions f ON f.id = v.field_definition_id
WHERE v.value_json IS NOT NULL
  OR f.data_type IN ('structured', 'rich_text')
  OR is_json_container_text(v.value_text) = 1;

-- Demands can reference a text field containing JSON. Clear the payload but keep
-- the referenced row and Demand history. Restore the original guard immediately.
DROP TRIGGER demand_need_value_update;
UPDATE field_values
SET value_text = '', value_number = NULL, value_boolean = NULL, value_date = NULL, value_json = NULL
WHERE id IN (SELECT id FROM temp.entity_json_field_value_removals)
  AND id IN (SELECT source_field_value_id FROM demands);
CREATE TRIGGER demand_need_value_update BEFORE UPDATE ON field_values
WHEN EXISTS(SELECT 1 FROM demands WHERE source_field_value_id=OLD.id) AND (
  NEW.id<>OLD.id OR NEW.entity_id<>OLD.entity_id OR NEW.field_definition_id<>OLD.field_definition_id
  OR NEW.value_text IS NOT OLD.value_text OR NEW.value_number IS NOT OLD.value_number
  OR NEW.value_boolean IS NOT OLD.value_boolean OR NEW.value_date IS NOT OLD.value_date OR NEW.value_json IS NOT OLD.value_json
) BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;

-- A field_values row must have exactly one populated column. Delete rows
-- with no Demand reference so those fields have no stored value.
DELETE FROM field_values
WHERE id IN (SELECT id FROM temp.entity_json_field_value_removals)
  AND id NOT IN (SELECT source_field_value_id FROM demands);

DROP TABLE temp.entity_json_field_value_removals;
