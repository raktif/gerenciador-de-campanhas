CREATE TABLE field_definitions (
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
  data_type TEXT NOT NULL CHECK (
    data_type IN (
      'short_text', 'long_text', 'number', 'boolean', 'date', 'single_select',
      'multi_select', 'entity_reference', 'entity_reference_list', 'progress', 'structured'
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
  UNIQUE (entity_type_id, key)
);

CREATE INDEX field_definitions_type_archived_sort_idx
  ON field_definitions (entity_type_id, is_archived, sort_order, label, id);
