CREATE TABLE campaigns (
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
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  system_name TEXT,
  concept TEXT,
  genre TEXT,
  tone TEXT,
  summary TEXT,
  image_path TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE INDEX campaigns_status_updated_at_idx
  ON campaigns (status, updated_at DESC, id DESC);
