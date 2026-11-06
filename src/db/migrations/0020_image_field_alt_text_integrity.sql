PRAGMA defer_foreign_keys = ON;

DROP TRIGGER entities_image_field_values_type_update_guard;
DROP TRIGGER field_definitions_image_values_update_guard;
DROP TRIGGER attachments_ready_reference_guard;

CREATE TABLE image_field_values_v20 (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (
      length(id) = 36
      AND substr(id, 9, 1) = '-'
      AND substr(id, 14, 1) = '-'
      AND substr(id, 19, 1) = '-'
      AND substr(id, 24, 1) = '-'
      AND id = lower(id)
      AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'
    ),
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  field_definition_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE RESTRICT,
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
  caption TEXT CHECK (caption IS NULL OR length(trim(caption)) BETWEEN 1 AND 1000),
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) BETWEEN 1 AND 1000),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (entity_id, field_definition_id, attachment_id)
);

INSERT INTO image_field_values_v20 (
  id, entity_id, field_definition_id, attachment_id, caption, alt_text,
  sort_order, created_at, updated_at, revision
)
SELECT
  i.id,
  i.entity_id,
  i.field_definition_id,
  i.attachment_id,
  i.caption,
  CASE
    WHEN i.alt_text IS NULL OR length(trim(i.alt_text)) = 0
      THEN 'Imagem de ' || trim(e.name) || ' no campo ' || trim(f.label)
    ELSE trim(i.alt_text)
  END,
  i.sort_order,
  i.created_at,
  i.updated_at,
  i.revision
FROM image_field_values i
JOIN entities e ON e.id = i.entity_id
JOIN field_definitions f ON f.id = i.field_definition_id;

DROP TABLE image_field_values;
ALTER TABLE image_field_values_v20 RENAME TO image_field_values;

CREATE INDEX image_field_values_entity_field_sort_idx
  ON image_field_values (entity_id, field_definition_id, sort_order, id);
CREATE INDEX image_field_values_attachment_idx
  ON image_field_values (attachment_id);

CREATE TRIGGER image_field_values_insert_guard
BEFORE INSERT ON image_field_values
WHEN NOT EXISTS (
  SELECT 1
  FROM entities e
  JOIN field_definitions f
    ON f.id = NEW.field_definition_id
   AND f.entity_type_id = e.entity_type_id
   AND f.data_type = 'image'
  JOIN attachments a
    ON a.id = NEW.attachment_id
   AND a.campaign_id = e.campaign_id
   AND a.processing_status = 'ready'
  WHERE e.id = NEW.entity_id
)
BEGIN
  SELECT RAISE(ABORT, 'image field value must match entity type and use a ready campaign attachment');
END;

CREATE TRIGGER image_field_values_update_guard
BEFORE UPDATE OF entity_id, field_definition_id, attachment_id ON image_field_values
WHEN NOT EXISTS (
  SELECT 1
  FROM entities e
  JOIN field_definitions f
    ON f.id = NEW.field_definition_id
   AND f.entity_type_id = e.entity_type_id
   AND f.data_type = 'image'
  JOIN attachments a
    ON a.id = NEW.attachment_id
   AND a.campaign_id = e.campaign_id
   AND a.processing_status = 'ready'
  WHERE e.id = NEW.entity_id
)
BEGIN
  SELECT RAISE(ABORT, 'image field value must match entity type and use a ready campaign attachment');
END;

CREATE TRIGGER entities_image_field_values_type_update_guard
BEFORE UPDATE OF entity_type_id ON entities
WHEN EXISTS (
  SELECT 1
  FROM image_field_values i
  JOIN field_definitions f ON f.id = i.field_definition_id
  WHERE i.entity_id = OLD.id AND f.entity_type_id <> NEW.entity_type_id
)
BEGIN
  SELECT RAISE(ABORT, 'entity type is incompatible with existing image field values');
END;

CREATE TRIGGER field_definitions_image_values_update_guard
BEFORE UPDATE OF entity_type_id, data_type ON field_definitions
WHEN (
  EXISTS (
    SELECT 1 FROM image_field_values i
    JOIN entities e ON e.id = i.entity_id
    WHERE i.field_definition_id = OLD.id
      AND (NEW.data_type <> 'image' OR NEW.entity_type_id <> e.entity_type_id)
  )
  OR (
    NEW.data_type = 'image'
    AND EXISTS (SELECT 1 FROM field_values v WHERE v.field_definition_id = OLD.id)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'field type is incompatible with existing values');
END;

CREATE TRIGGER attachments_ready_reference_guard
BEFORE UPDATE OF processing_status ON attachments
WHEN NEW.processing_status <> 'ready'
  AND (
    EXISTS (SELECT 1 FROM campaigns WHERE cover_attachment_id = OLD.id)
    OR EXISTS (SELECT 1 FROM entities WHERE reference_image_attachment_id = OLD.id)
    OR EXISTS (SELECT 1 FROM image_field_values WHERE attachment_id = OLD.id)
  )
BEGIN
  SELECT RAISE(ABORT, 'a referenced attachment must remain ready');
END;
