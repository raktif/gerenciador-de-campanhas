CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE TABLE IF NOT EXISTS phase_zero_test (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  value TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS app_search_fts USING fts5(
  object_type UNINDEXED,
  object_id UNINDEXED,
  title,
  body,
  tags
);
