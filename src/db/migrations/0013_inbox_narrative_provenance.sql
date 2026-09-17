CREATE TABLE inbox_assertion_conversions (
  inbox_item_id TEXT PRIMARY KEY NOT NULL REFERENCES inbox_items(id) ON DELETE RESTRICT,
  assertion_id TEXT NOT NULL UNIQUE REFERENCES assertions(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0)
);
CREATE TABLE inbox_note_conversions (
  inbox_item_id TEXT PRIMARY KEY NOT NULL REFERENCES inbox_items(id) ON DELETE RESTRICT,
  note_id TEXT NOT NULL UNIQUE REFERENCES notes(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0)
);
CREATE TABLE inbox_event_conversions (
  inbox_item_id TEXT PRIMARY KEY NOT NULL REFERENCES inbox_items(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0)
);

CREATE TRIGGER assertions_inbox_source_insert_guard
BEFORE INSERT ON assertions
WHEN NEW.source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sources LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
  WHERE sources.id = NEW.source_id
    AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
    AND sources.kind = NEW.origin_kind
)
BEGIN SELECT RAISE(ABORT, 'ASSERTION_SOURCE_INVALID'); END;
CREATE TRIGGER notes_inbox_source_insert_guard
BEFORE INSERT ON notes
WHEN NEW.source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sources LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
  WHERE sources.id = NEW.source_id
    AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
    AND sources.kind = NEW.origin_kind
)
BEGIN SELECT RAISE(ABORT, 'NOTE_SOURCE_INVALID'); END;
CREATE TRIGGER events_inbox_source_insert_guard
BEFORE INSERT ON events
WHEN NEW.source_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sources LEFT JOIN inbox_items ON inbox_items.id = sources.inbox_item_id
  WHERE sources.id = NEW.source_id
    AND (sources.inbox_item_id IS NULL OR inbox_items.campaign_id = NEW.campaign_id)
    AND sources.kind = NEW.origin_kind
)
BEGIN SELECT RAISE(ABORT, 'EVENT_SOURCE_INVALID'); END;
