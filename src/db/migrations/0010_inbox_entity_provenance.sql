ALTER TABLE sources ADD COLUMN inbox_item_id TEXT REFERENCES inbox_items(id) ON DELETE RESTRICT;

DROP INDEX sources_session_unique;
CREATE UNIQUE INDEX sources_session_unique
  ON sources (session_id)
  WHERE kind = 'session' AND inbox_item_id IS NULL;
CREATE UNIQUE INDEX sources_inbox_item_unique
  ON sources (inbox_item_id)
  WHERE inbox_item_id IS NOT NULL;

CREATE TABLE inbox_entity_conversions (
  inbox_item_id TEXT PRIMARY KEY NOT NULL REFERENCES inbox_items(id) ON DELETE RESTRICT,
  entity_id TEXT NOT NULL UNIQUE REFERENCES entities(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0)
);

CREATE INDEX inbox_entity_conversions_entity_idx ON inbox_entity_conversions (entity_id);
