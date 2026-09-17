CREATE TRIGGER notes_inbox_source_update_guard
BEFORE UPDATE OF source_id, campaign_id, origin_kind ON notes
WHEN (NEW.source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sources LEFT JOIN sessions ON sessions.id = sources.session_id LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
  WHERE sources.id = NEW.source_id
    AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
    AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
    AND sources.kind = NEW.origin_kind
)) OR (EXISTS (SELECT 1 FROM sources WHERE sources.id = OLD.source_id AND sources.inbox_item_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM sources JOIN inbox_items ON inbox_items.id = sources.inbox_item_id WHERE sources.id = NEW.source_id AND inbox_items.campaign_id = NEW.campaign_id AND sources.kind = NEW.origin_kind))
BEGIN SELECT RAISE(ABORT, 'NOTE_SOURCE_INVALID'); END;

CREATE TRIGGER events_inbox_source_update_guard
BEFORE UPDATE OF source_id, campaign_id, origin_kind ON events
WHEN (NEW.source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sources LEFT JOIN sessions ON sessions.id = sources.session_id LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
  WHERE sources.id = NEW.source_id
    AND (sources.kind <> 'session' OR sessions.campaign_id = NEW.campaign_id)
    AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
    AND sources.kind = NEW.origin_kind
)) OR (EXISTS (SELECT 1 FROM sources WHERE sources.id = OLD.source_id AND sources.inbox_item_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM sources JOIN inbox_items ON inbox_items.id = sources.inbox_item_id WHERE sources.id = NEW.source_id AND inbox_items.campaign_id = NEW.campaign_id AND sources.kind = NEW.origin_kind))
BEGIN SELECT RAISE(ABORT, 'EVENT_SOURCE_INVALID'); END;
