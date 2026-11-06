PRAGMA defer_foreign_keys = ON;

CREATE TABLE field_definitions_v19 (
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
  entity_type_id TEXT NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
  key TEXT NOT NULL
    CHECK (
      length(key) BETWEEN 1 AND 100
      AND key = lower(key)
      AND key NOT GLOB '*[^a-z0-9-]*'
      AND substr(key, 1, 1) <> '-'
      AND substr(key, -1, 1) <> '-'
      AND instr(key, '--') = 0
    ),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  help_text TEXT CHECK (help_text IS NULL OR length(trim(help_text)) BETWEEN 1 AND 2000),
  example_text TEXT CHECK (example_text IS NULL OR length(trim(example_text)) BETWEEN 1 AND 2000),
  help_article_id TEXT
    CHECK (
      help_article_id IS NULL OR (
        length(help_article_id) BETWEEN 1 AND 120
        AND help_article_id = lower(help_article_id)
        AND help_article_id NOT GLOB '*[^a-z0-9-]*'
        AND substr(help_article_id, 1, 1) <> '-'
        AND substr(help_article_id, -1, 1) <> '-'
        AND instr(help_article_id, '--') = 0
      )
    ),
  data_type TEXT NOT NULL CHECK (
    data_type IN (
      'short_text', 'long_text', 'number', 'boolean', 'date', 'single_select',
      'multi_select', 'entity_reference', 'entity_reference_list', 'image', 'progress',
      'structured'
    )
  ),
  semantic_role TEXT CHECK (
    semantic_role IS NULL OR semantic_role IN (
      'name', 'description', 'goal', 'need', 'fear', 'resource', 'obstacle', 'status',
      'secret', 'location', 'owner', 'motivation', 'stakes', 'clue', 'reward'
    )
  ),
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  searchable INTEGER NOT NULL DEFAULT 0 CHECK (searchable IN (0, 1)),
  secret_by_default INTEGER NOT NULL DEFAULT 0 CHECK (secret_by_default IN (0, 1)),
  default_value_json TEXT CHECK (default_value_json IS NULL OR json_valid(default_value_json)),
  options_json TEXT CHECK (options_json IS NULL OR json_valid(options_json)),
  validation_json TEXT CHECK (validation_json IS NULL OR json_valid(validation_json)),
  reference_relationship_type_id TEXT CHECK (
    reference_relationship_type_id IS NULL OR (
      length(reference_relationship_type_id) = 36
      AND substr(reference_relationship_type_id, 9, 1) = '-'
      AND substr(reference_relationship_type_id, 14, 1) = '-'
      AND substr(reference_relationship_type_id, 19, 1) = '-'
      AND substr(reference_relationship_type_id, 24, 1) = '-'
      AND reference_relationship_type_id = lower(reference_relationship_type_id)
      AND replace(reference_relationship_type_id, '-', '') NOT GLOB '*[^0-9a-f]*'
    )
  ),
  reference_direction TEXT CHECK (
    reference_direction IS NULL OR reference_direction IN ('outgoing', 'incoming')
  ),
  allowed_target_type_ids_json TEXT CHECK (
    allowed_target_type_ids_json IS NULL OR (
      json_valid(allowed_target_type_ids_json)
      AND json_type(allowed_target_type_ids_json) = 'array'
    )
  ),
  on_delete_behavior TEXT CHECK (
    on_delete_behavior IS NULL OR on_delete_behavior IN ('restrict', 'unlink')
  ),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (entity_type_id, key),
  CHECK (
    data_type <> 'image' OR (
      required = 0
      AND searchable = 0
      AND default_value_json IS NULL
      AND options_json IS NULL
      AND validation_json IS NULL
      AND reference_relationship_type_id IS NULL
      AND reference_direction IS NULL
      AND allowed_target_type_ids_json IS NULL
      AND on_delete_behavior IS NULL
    )
  )
);

INSERT INTO field_definitions_v19 (
  id, entity_type_id, key, label, description, help_text, example_text, help_article_id,
  data_type, semantic_role, required, searchable, secret_by_default, default_value_json,
  options_json, validation_json, reference_relationship_type_id, reference_direction,
  allowed_target_type_ids_json, on_delete_behavior, sort_order, is_archived, created_at,
  updated_at, revision
)
SELECT
  id, entity_type_id, key, label, description, help_text, example_text, help_article_id,
  data_type, semantic_role, required, searchable, secret_by_default, default_value_json,
  options_json, validation_json, reference_relationship_type_id, reference_direction,
  allowed_target_type_ids_json, on_delete_behavior, sort_order, is_archived, created_at,
  updated_at, revision
FROM field_definitions;

CREATE TABLE field_values_v19 (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  field_definition_id TEXT NOT NULL REFERENCES field_definitions_v19(id) ON DELETE RESTRICT,
  value_text TEXT,
  value_number REAL,
  value_boolean INTEGER CHECK (value_boolean IN (0, 1)),
  value_date TEXT,
  value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE(entity_id, field_definition_id),
  CHECK (
    (value_text IS NOT NULL) + (value_number IS NOT NULL) +
    (value_boolean IS NOT NULL) + (value_date IS NOT NULL) +
    (value_json IS NOT NULL) = 1
  )
);

INSERT INTO field_values_v19 (
  id, entity_id, field_definition_id, value_text, value_number, value_boolean, value_date,
  value_json, created_at, updated_at, revision
)
SELECT
  id, entity_id, field_definition_id, value_text, value_number, value_boolean, value_date,
  value_json, created_at, updated_at, revision
FROM field_values;

DROP TABLE field_values;
DROP TABLE field_definitions;
ALTER TABLE field_definitions_v19 RENAME TO field_definitions;
ALTER TABLE field_values_v19 RENAME TO field_values;

CREATE INDEX field_definitions_type_archived_sort_idx
  ON field_definitions (entity_type_id, is_archived, sort_order, label, id);
CREATE INDEX field_values_entity_idx
  ON field_values (entity_id, field_definition_id);

CREATE TABLE image_field_values (
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
  alt_text TEXT CHECK (alt_text IS NULL OR length(trim(alt_text)) BETWEEN 1 AND 1000),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (entity_id, field_definition_id, attachment_id)
);

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

CREATE TRIGGER field_values_image_insert_guard
BEFORE INSERT ON field_values
WHEN EXISTS (
  SELECT 1 FROM field_definitions
  WHERE id = NEW.field_definition_id AND data_type = 'image'
)
BEGIN
  SELECT RAISE(ABORT, 'image fields must use image_field_values');
END;

CREATE TRIGGER field_values_image_update_guard
BEFORE UPDATE OF field_definition_id ON field_values
WHEN EXISTS (
  SELECT 1 FROM field_definitions
  WHERE id = NEW.field_definition_id AND data_type = 'image'
)
BEGIN
  SELECT RAISE(ABORT, 'image fields must use image_field_values');
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

DROP TRIGGER attachments_ready_reference_guard;

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

