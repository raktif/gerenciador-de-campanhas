CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_type_id TEXT NOT NULL REFERENCES entity_types(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  summary TEXT,
  canon_state TEXT NOT NULL DEFAULT 'accepted' CHECK (canon_state IN ('draft','accepted','rejected','archived')),
  knowledge_state TEXT NOT NULL DEFAULT 'fact' CHECK (knowledge_state IN ('fact','rumor','suspicion','secret','possibility','disproved')),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm','players','public')),
  origin_kind TEXT NOT NULL DEFAULT 'manual' CHECK (origin_kind IN ('manual','session','import','document','ruleset','ai','generator')),
  source_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(trim(name)) BETWEEN 1 AND 200),
  CHECK (summary IS NULL OR length(summary) <= 10000)
);
CREATE INDEX entities_campaign_archived_name_idx ON entities(campaign_id, archived_at, name, id);
CREATE INDEX entities_campaign_type_archived_idx ON entities(campaign_id, entity_type_id, archived_at, name, id);

CREATE TABLE field_values (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  field_definition_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE RESTRICT,
  value_text TEXT,
  value_number REAL,
  value_boolean INTEGER CHECK (value_boolean IN (0, 1)),
  value_date TEXT,
  value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE(entity_id, field_definition_id),
  CHECK ((value_text IS NOT NULL) + (value_number IS NOT NULL) + (value_boolean IS NOT NULL) + (value_date IS NOT NULL) + (value_json IS NOT NULL) = 1)
);
CREATE INDEX field_values_entity_idx ON field_values(entity_id, field_definition_id);
