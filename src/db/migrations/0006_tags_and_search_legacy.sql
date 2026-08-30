-- Migração legada já aplicada durante o desenvolvimento da Fase 1.
-- A versão 7 remove estas estruturas, que pertencem a fases posteriores.
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (length(id) = 36 AND id = lower(id) AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(trim(name)) BETWEEN 1 AND 60),
  CHECK (color IS NULL OR length(color) <= 64),
  UNIQUE(campaign_id, name)
);

CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entity_id, tag_id)
);

DROP TABLE IF EXISTS app_search_fts;
CREATE VIRTUAL TABLE app_search_fts USING fts5(
  campaign_id UNINDEXED,
  object_type UNINDEXED,
  object_id UNINDEXED,
  title,
  body,
  tags
);
