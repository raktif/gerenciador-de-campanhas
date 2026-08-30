CREATE TABLE entity_types (
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
  pack_id TEXT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  singular_name TEXT NOT NULL CHECK (length(trim(singular_name)) BETWEEN 1 AND 120),
  slug TEXT NOT NULL
    CHECK (
      length(slug) BETWEEN 1 AND 100
      AND slug = lower(slug)
      AND slug NOT GLOB '*[^a-z0-9-]*'
      AND substr(slug, 1, 1) <> '-'
      AND substr(slug, -1, 1) <> '-'
      AND instr(slug, '--') = 0
    ),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  icon TEXT CHECK (icon IS NULL OR length(icon) <= 120),
  color TEXT CHECK (color IS NULL OR length(color) <= 64),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (campaign_id, slug)
);

CREATE INDEX entity_types_campaign_archived_sort_idx
  ON entity_types (campaign_id, is_archived, sort_order, name, id);
