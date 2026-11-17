CREATE TEMP TABLE clock_v27_migration_preflight (checked INTEGER);
CREATE TEMP TRIGGER clock_v27_migration_preflight_guard
BEFORE INSERT ON clock_v27_migration_preflight
WHEN EXISTS (SELECT 1 FROM main.clocks)
BEGIN
  SELECT RAISE(
    ABORT,
    'CLOCKS_V27_INCOMPATIBLE_LEGACY_CLOCKS: upgrade stopped because existing clocks lack required entity and consequence; database and backup were preserved'
  );
END;
INSERT INTO clock_v27_migration_preflight (checked) VALUES (1);
DROP TRIGGER clock_v27_migration_preflight_guard;
DROP TABLE clock_v27_migration_preflight;

DROP TRIGGER clocks_completed_immutable;
DROP TRIGGER clocks_records_are_historical;
DROP TRIGGER clocks_campaign_id_immutable;
DROP TRIGGER clocks_completed_insert_replace_guard;
DROP TRIGGER clocks_completed_update_replace_guard;
DROP INDEX clocks_campaign_status_updated_idx;
DROP INDEX clocks_campaign_type_idx;
DROP TABLE clocks;

CREATE TABLE clocks (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 10000),
  consequence TEXT NOT NULL CHECK (length(trim(consequence)) BETWEEN 1 AND 10000),
  segments_total INTEGER NOT NULL CHECK (
    typeof(segments_total) = 'integer' AND segments_total IN (4, 6, 8, 10, 12)
  ),
  segments_filled INTEGER NOT NULL DEFAULT 0 CHECK (
    typeof(segments_filled) = 'integer' AND segments_filled BETWEEN 0 AND 12
  ),
  clock_type TEXT NOT NULL CHECK (clock_type IN (
    'progress', 'threat', 'countdown', 'project', 'investigation', 'custom'
  )),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  canon_state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (canon_state IN ('draft', 'accepted', 'rejected', 'archived')),
  knowledge_state TEXT NOT NULL DEFAULT 'fact'
    CHECK (knowledge_state IN ('fact', 'rumor', 'suspicion', 'secret', 'possibility', 'disproved')),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK (visibility IN ('gm', 'players', 'public')),
  origin_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin_kind IN ('manual', 'session', 'import', 'document', 'ruleset', 'ai', 'generator')),
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  generated_event_id TEXT UNIQUE REFERENCES events(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (
    typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991
  ),
  CHECK (segments_filled <= segments_total),
  CHECK ((segments_filled = segments_total AND status = 'completed')
      OR (segments_filled < segments_total AND status IN ('active', 'completed')))
);

CREATE INDEX clocks_campaign_status_updated_idx
  ON clocks(campaign_id, status, updated_at DESC, id DESC);
CREATE INDEX clocks_campaign_type_idx
  ON clocks(campaign_id, clock_type, updated_at DESC, id DESC);
CREATE INDEX clocks_entity_idx ON clocks(entity_id, status, updated_at DESC, id DESC);

CREATE TABLE clock_entity_links (
  clock_id TEXT PRIMARY KEY NOT NULL REFERENCES clocks(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT
);
CREATE INDEX clock_entity_links_entity_idx ON clock_entity_links(entity_id, clock_id);

CREATE TRIGGER clocks_entity_link_insert
AFTER INSERT ON clocks
BEGIN
  INSERT INTO clock_entity_links (clock_id, entity_id) VALUES (NEW.id, NEW.entity_id);
END;

CREATE TRIGGER clocks_entity_link_update
AFTER UPDATE OF entity_id ON clocks
WHEN NEW.entity_id <> OLD.entity_id
BEGIN
  UPDATE clock_entity_links SET entity_id = NEW.entity_id WHERE clock_id = NEW.id;
END;

CREATE TRIGGER clock_entity_links_validate_insert
BEFORE INSERT ON clock_entity_links
WHEN NOT EXISTS (
  SELECT 1 FROM clocks c
  JOIN entities e ON e.id = NEW.entity_id
  WHERE c.id = NEW.clock_id
    AND c.entity_id = NEW.entity_id
    AND c.campaign_id = e.campaign_id
    AND e.archived_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'CLOCK_ENTITY_LINK_INVALID');
END;

CREATE TRIGGER clock_entity_links_validate_update
BEFORE UPDATE ON clock_entity_links
WHEN NOT EXISTS (
  SELECT 1 FROM clocks c
  JOIN entities e ON e.id = NEW.entity_id
  WHERE c.id = NEW.clock_id
    AND c.entity_id = NEW.entity_id
    AND c.campaign_id = e.campaign_id
    AND e.archived_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'CLOCK_ENTITY_LINK_INVALID');
END;

CREATE TRIGGER clock_entity_links_completed_immutable_update
BEFORE UPDATE ON clock_entity_links
WHEN EXISTS (SELECT 1 FROM clocks c WHERE c.id = OLD.clock_id AND c.status = 'completed')
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;

CREATE TRIGGER clock_entity_links_completed_immutable_delete
BEFORE DELETE ON clock_entity_links
WHEN EXISTS (SELECT 1 FROM clocks c WHERE c.id = OLD.clock_id AND c.status = 'completed')
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;

CREATE TRIGGER clock_entity_links_required
BEFORE DELETE ON clock_entity_links
WHEN EXISTS (SELECT 1 FROM clocks c WHERE c.id = OLD.clock_id)
BEGIN
  SELECT RAISE(ABORT, 'clock_entity_link_required');
END;

CREATE TRIGGER clocks_source_insert_guard
BEFORE INSERT ON clocks
WHEN NEW.source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM sources
  LEFT JOIN sessions ON sessions.id = sources.session_id
  LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
  WHERE sources.id = NEW.source_id
    AND sources.kind = NEW.origin_kind
    AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
    AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
)
BEGIN
  SELECT RAISE(ABORT, 'CLOCK_SOURCE_INVALID');
END;

CREATE TRIGGER clocks_source_update_guard
BEFORE UPDATE OF source_id, campaign_id, origin_kind ON clocks
WHEN NEW.source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM sources
  LEFT JOIN sessions ON sessions.id = sources.session_id
  LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
  WHERE sources.id = NEW.source_id
    AND sources.kind = NEW.origin_kind
    AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
    AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
)
BEGIN
  SELECT RAISE(ABORT, 'CLOCK_SOURCE_INVALID');
END;

CREATE TRIGGER clocks_completed_immutable
BEFORE UPDATE ON clocks
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;

CREATE TRIGGER clocks_records_are_historical
BEFORE DELETE ON clocks
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_is_historical');
END;

CREATE TRIGGER clocks_campaign_id_immutable
BEFORE UPDATE OF campaign_id ON clocks
WHEN NEW.campaign_id <> OLD.campaign_id
BEGIN
  SELECT RAISE(ABORT, 'clock_campaign_immutable');
END;

CREATE TRIGGER clocks_completed_insert_replace_guard
BEFORE INSERT ON clocks
WHEN EXISTS (SELECT 1 FROM clocks WHERE id = NEW.id AND status = 'completed')
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;

CREATE TRIGGER clocks_completed_update_replace_guard
BEFORE UPDATE ON clocks
WHEN NEW.id <> OLD.id
  AND EXISTS (SELECT 1 FROM clocks WHERE id = NEW.id AND status = 'completed')
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;
