CREATE TRIGGER sources_inbox_item_insert_guard
BEFORE INSERT ON sources
WHEN NEW.inbox_item_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM inbox_items
    WHERE id = NEW.inbox_item_id
      AND origin_kind = NEW.kind
      AND ((NEW.kind = 'manual' AND session_id IS NULL AND NEW.session_id IS NULL)
        OR (NEW.kind = 'session' AND session_id = NEW.session_id))
  )
BEGIN
  SELECT RAISE(ABORT, 'INBOX_SOURCE_INVALID');
END;

DROP TRIGGER entities_source_insert_guard;
DROP TRIGGER entities_source_update_guard;

CREATE TRIGGER entities_source_insert_guard
BEFORE INSERT ON entities
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
  SELECT RAISE(ABORT, 'ENTITY_SOURCE_INVALID');
END;

CREATE TRIGGER entities_source_update_guard
BEFORE UPDATE OF source_id, campaign_id ON entities
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
  SELECT RAISE(ABORT, 'ENTITY_SOURCE_INVALID');
END;
