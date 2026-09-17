CREATE TABLE inbox_relationship_conversions (
  inbox_item_id TEXT PRIMARY KEY NOT NULL REFERENCES inbox_items(id) ON DELETE RESTRICT,
  relationship_id TEXT NOT NULL UNIQUE REFERENCES relationships(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0)
);

CREATE INDEX inbox_relationship_conversions_relationship_idx
  ON inbox_relationship_conversions (relationship_id);

CREATE TRIGGER relationships_campaign_insert_guard
BEFORE INSERT ON relationships
WHEN NOT EXISTS (
  SELECT 1 FROM relationship_types
  JOIN entities AS source_entity ON source_entity.id = NEW.source_entity_id
  JOIN entities AS target_entity ON target_entity.id = NEW.target_entity_id
  WHERE relationship_types.id = NEW.relationship_type_id
    AND relationship_types.campaign_id = NEW.campaign_id
    AND source_entity.campaign_id = NEW.campaign_id
    AND target_entity.campaign_id = NEW.campaign_id
    AND source_entity.archived_at IS NULL
    AND target_entity.archived_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'RELATIONSHIP_CAMPAIGN_INVALID');
END;

CREATE TRIGGER relationships_inbox_source_insert_guard
BEFORE INSERT ON relationships
WHEN NEW.source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sources
    LEFT JOIN sessions ON sessions.id = sources.session_id
    LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
    WHERE sources.id = NEW.source_id
      AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
      AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
  )
BEGIN
  SELECT RAISE(ABORT, 'RELATIONSHIP_SOURCE_INVALID');
END;

CREATE TRIGGER relationships_inbox_source_update_guard
BEFORE UPDATE OF source_id, campaign_id, origin_kind ON relationships
WHEN (
  NEW.source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sources
    LEFT JOIN sessions ON sessions.id = sources.session_id
    LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
    WHERE sources.id = NEW.source_id
      AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
      AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
  )
)
OR (
  EXISTS (
    SELECT 1 FROM sources
    WHERE sources.id = OLD.source_id AND sources.inbox_item_id IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM sources
    JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
    WHERE sources.id = NEW.source_id
      AND inbox_items.campaign_id = NEW.campaign_id
      AND sources.kind = NEW.origin_kind
  )
)
BEGIN
  SELECT RAISE(ABORT, 'RELATIONSHIP_SOURCE_INVALID');
END;
