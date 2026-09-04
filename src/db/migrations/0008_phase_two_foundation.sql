CREATE TABLE sessions (
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
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  played_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  summary_markdown TEXT CHECK (summary_markdown IS NULL OR length(summary_markdown) <= 100000),
  gm_notes_markdown TEXT CHECK (gm_notes_markdown IS NULL OR length(gm_notes_markdown) <= 100000),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (campaign_id, sequence_number)
);

CREATE INDEX sessions_campaign_status_sequence_idx
  ON sessions (campaign_id, status, sequence_number DESC, id DESC);
CREATE INDEX sessions_campaign_played_at_idx
  ON sessions (campaign_id, played_at DESC, sequence_number DESC, id DESC);

CREATE TABLE sources (
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
  kind TEXT NOT NULL
    CHECK (kind IN ('manual', 'session', 'document', 'ai', 'import', 'ruleset', 'generator')),
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  document_chunk_id TEXT,
  ai_run_id TEXT,
  import_batch_id TEXT,
  ruleset_pack_id TEXT,
  description TEXT CHECK (description IS NULL OR length(trim(description)) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  CHECK (
    (kind = 'manual'
      AND session_id IS NULL
      AND document_chunk_id IS NULL
      AND ai_run_id IS NULL
      AND import_batch_id IS NULL
      AND ruleset_pack_id IS NULL)
    OR (kind = 'session'
      AND session_id IS NOT NULL
      AND document_chunk_id IS NULL
      AND ai_run_id IS NULL
      AND import_batch_id IS NULL
      AND ruleset_pack_id IS NULL)
    OR (kind = 'document'
      AND session_id IS NULL
      AND document_chunk_id IS NOT NULL
      AND ai_run_id IS NULL
      AND import_batch_id IS NULL
      AND ruleset_pack_id IS NULL)
    OR (kind = 'ai'
      AND session_id IS NULL
      AND document_chunk_id IS NULL
      AND ai_run_id IS NOT NULL
      AND import_batch_id IS NULL
      AND ruleset_pack_id IS NULL)
    OR (kind = 'import'
      AND session_id IS NULL
      AND document_chunk_id IS NULL
      AND ai_run_id IS NULL
      AND import_batch_id IS NOT NULL
      AND ruleset_pack_id IS NULL)
    OR (kind = 'ruleset'
      AND session_id IS NULL
      AND document_chunk_id IS NULL
      AND ai_run_id IS NULL
      AND import_batch_id IS NULL
      AND ruleset_pack_id IS NOT NULL)
    OR (kind = 'generator'
      AND session_id IS NULL
      AND document_chunk_id IS NULL
      AND ai_run_id IS NULL
      AND import_batch_id IS NULL
      AND ruleset_pack_id IS NULL
      AND description IS NOT NULL)
  )
);

CREATE INDEX sources_kind_created_at_idx ON sources (kind, created_at DESC, id DESC);
CREATE UNIQUE INDEX sources_session_unique
  ON sources (session_id) WHERE kind = 'session';

CREATE TEMP TABLE legacy_source_map (
  old_id TEXT PRIMARY KEY NOT NULL,
  new_id TEXT NOT NULL UNIQUE
);

INSERT INTO legacy_source_map (old_id, new_id)
SELECT DISTINCT
  source_id,
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  '8' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6)))
FROM entities
WHERE source_id IS NOT NULL;

INSERT INTO sources (id, kind, description, created_at)
SELECT new_id, 'manual', 'Referência legada: ' || old_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM legacy_source_map;

UPDATE entities
SET source_id = (
  SELECT new_id FROM legacy_source_map WHERE old_id = entities.source_id
)
WHERE source_id IS NOT NULL;

DROP TABLE legacy_source_map;

CREATE TRIGGER entities_source_insert_guard
BEFORE INSERT ON entities
WHEN NEW.source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sources
    LEFT JOIN sessions ON sessions.id = sources.session_id
    WHERE sources.id = NEW.source_id
      AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
  )
BEGIN
  SELECT RAISE(ABORT, 'ENTITY_SOURCE_INVALID');
END;

CREATE TRIGGER entities_source_update_guard
BEFORE UPDATE OF source_id, campaign_id ON entities
WHEN NEW.source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sources
    LEFT JOIN sessions ON sessions.id = sources.session_id
    WHERE sources.id = NEW.source_id
      AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
  )
BEGIN
  SELECT RAISE(ABORT, 'ENTITY_SOURCE_INVALID');
END;

CREATE TRIGGER sources_entity_delete_guard
BEFORE DELETE ON sources
WHEN EXISTS (SELECT 1 FROM entities WHERE source_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'SOURCE_IN_USE');
END;

CREATE TABLE relationship_types (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  pack_id TEXT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  slug TEXT NOT NULL CHECK (
    length(slug) BETWEEN 1 AND 100
    AND slug = lower(slug)
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(slug, 1, 1) <> '-'
    AND substr(slug, -1, 1) <> '-'
    AND instr(slug, '--') = 0
  ),
  inverse_name TEXT CHECK (inverse_name IS NULL OR length(trim(inverse_name)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  semantic_role TEXT,
  is_symmetric INTEGER NOT NULL DEFAULT 0 CHECK (is_symmetric IN (0, 1)),
  allowed_source_types_json TEXT CHECK (
    allowed_source_types_json IS NULL OR (
      json_valid(allowed_source_types_json) AND json_type(allowed_source_types_json) = 'array'
    )
  ),
  allowed_target_types_json TEXT CHECK (
    allowed_target_types_json IS NULL OR (
      json_valid(allowed_target_types_json) AND json_type(allowed_target_types_json) = 'array'
    )
  ),
  icon TEXT CHECK (icon IS NULL OR length(icon) <= 120),
  color TEXT CHECK (color IS NULL OR length(color) <= 64),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (campaign_id, slug)
);

CREATE INDEX relationship_types_campaign_archived_sort_idx
  ON relationship_types (campaign_id, is_archived, sort_order, name, id);

CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description_markdown TEXT CHECK (description_markdown IS NULL OR length(description_markdown) <= 100000),
  event_order INTEGER NOT NULL DEFAULT 0 CHECK (event_order >= 0),
  occurred_at_label TEXT CHECK (occurred_at_label IS NULL OR length(occurred_at_label) <= 200),
  canon_state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (canon_state IN ('draft', 'accepted', 'rejected', 'archived')),
  knowledge_state TEXT NOT NULL DEFAULT 'fact'
    CHECK (knowledge_state IN ('fact', 'rumor', 'suspicion', 'secret', 'possibility', 'disproved')),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players', 'public')),
  origin_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin_kind IN ('manual', 'session', 'import', 'document', 'ruleset', 'ai', 'generator')),
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE INDEX events_campaign_archived_order_idx
  ON events (campaign_id, archived_at, session_id, event_order, created_at, id);
CREATE INDEX events_campaign_created_at_idx
  ON events (campaign_id, archived_at, created_at DESC, id DESC);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  relationship_type_id TEXT NOT NULL REFERENCES relationship_types(id) ON DELETE RESTRICT,
  source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  description TEXT CHECK (description IS NULL OR length(description) <= 10000),
  strength REAL,
  canon_state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (canon_state IN ('draft', 'accepted', 'rejected', 'archived')),
  knowledge_state TEXT NOT NULL DEFAULT 'fact'
    CHECK (knowledge_state IN ('fact', 'rumor', 'suspicion', 'secret', 'possibility', 'disproved')),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players', 'public')),
  origin_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin_kind IN ('manual', 'session', 'import', 'document', 'ruleset', 'ai', 'generator')),
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  valid_from_event_id TEXT REFERENCES events(id) ON DELETE RESTRICT,
  valid_to_event_id TEXT REFERENCES events(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE INDEX relationships_campaign_type_archived_idx
  ON relationships (campaign_id, relationship_type_id, archived_at, updated_at DESC, id DESC);
CREATE INDEX relationships_source_entity_idx
  ON relationships (campaign_id, source_entity_id, archived_at, relationship_type_id, id);
CREATE INDEX relationships_target_entity_idx
  ON relationships (campaign_id, target_entity_id, archived_at, relationship_type_id, id);

CREATE TABLE assertions (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  predicate TEXT CHECK (predicate IS NULL OR length(trim(predicate)) BETWEEN 1 AND 200),
  object_entity_id TEXT REFERENCES entities(id) ON DELETE RESTRICT,
  statement TEXT CHECK (statement IS NULL OR length(trim(statement)) BETWEEN 1 AND 10000),
  value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
  canon_state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (canon_state IN ('draft', 'accepted', 'rejected', 'archived')),
  knowledge_state TEXT NOT NULL DEFAULT 'fact'
    CHECK (knowledge_state IN ('fact', 'rumor', 'suspicion', 'secret', 'possibility', 'disproved')),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players', 'public')),
  origin_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin_kind IN ('manual', 'session', 'import', 'document', 'ruleset', 'ai', 'generator')),
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (statement IS NOT NULL OR predicate IS NOT NULL OR value_json IS NOT NULL)
);

CREATE INDEX assertions_campaign_subject_archived_idx
  ON assertions (campaign_id, subject_entity_id, archived_at, updated_at DESC, id DESC);
CREATE INDEX assertions_campaign_archived_updated_idx
  ON assertions (campaign_id, archived_at, updated_at DESC, id DESC);

CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  body_markdown TEXT NOT NULL CHECK (length(body_markdown) BETWEEN 1 AND 100000),
  note_type TEXT NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general', 'idea', 'scene', 'clue', 'secret', 'preparation', 'reference')),
  canon_state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (canon_state IN ('draft', 'accepted', 'rejected', 'archived')),
  knowledge_state TEXT NOT NULL DEFAULT 'fact'
    CHECK (knowledge_state IN ('fact', 'rumor', 'suspicion', 'secret', 'possibility', 'disproved')),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players', 'public')),
  origin_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin_kind IN ('manual', 'session', 'import', 'document', 'ruleset', 'ai', 'generator')),
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE INDEX notes_campaign_type_archived_updated_idx
  ON notes (campaign_id, note_type, archived_at, updated_at DESC, id DESC);

CREATE TABLE note_entity_links (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'related' CHECK (length(trim(role)) BETWEEN 1 AND 100),
  PRIMARY KEY (note_id, entity_id, role)
);

CREATE INDEX note_entity_links_entity_idx ON note_entity_links (entity_id, note_id);

CREATE TABLE session_participants (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  role TEXT NOT NULL
    CHECK (role IN ('player_character', 'ally', 'npc', 'observer', 'other')),
  attended INTEGER NOT NULL DEFAULT 1 CHECK (attended IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (session_id, entity_id)
);

CREATE INDEX session_participants_entity_idx
  ON session_participants (entity_id, session_id);

CREATE TABLE session_intentions (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id TEXT REFERENCES entities(id) ON DELETE RESTRICT,
  text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 10000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'abandoned', 'transformed')),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE INDEX session_intentions_session_status_idx
  ON session_intentions (session_id, status, created_at, id);

CREATE TABLE event_entity_links (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (
    role IN ('participant', 'location', 'cause', 'target', 'witness', 'beneficiary', 'victim', 'related')
  ),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (event_id, entity_id, role)
);

CREATE INDEX event_entity_links_entity_idx
  ON event_entity_links (entity_id, event_id, sort_order);

CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  raw_text TEXT NOT NULL CHECK (length(trim(raw_text)) BETWEEN 1 AND 10000),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'converted', 'dismissed', 'archived')),
  origin_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin_kind IN ('manual', 'session', 'import', 'document', 'ruleset', 'ai', 'generator')),
  captured_at TEXT NOT NULL CHECK (length(captured_at) > 0),
  converted_object_type TEXT,
  converted_object_id TEXT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (
    (status = 'converted' AND converted_object_type IS NOT NULL AND converted_object_id IS NOT NULL)
    OR (status <> 'converted' AND converted_object_type IS NULL AND converted_object_id IS NULL)
  )
);

CREATE INDEX inbox_items_campaign_status_captured_idx
  ON inbox_items (campaign_id, status, captured_at DESC, id DESC);
CREATE INDEX inbox_items_session_status_idx
  ON inbox_items (session_id, status, captured_at DESC, id DESC);
