DROP TABLE IF EXISTS entity_tags;
DROP TABLE IF EXISTS tags;

DROP TABLE IF EXISTS app_search_fts;
CREATE VIRTUAL TABLE app_search_fts USING fts5(
  object_type UNINDEXED,
  object_id UNINDEXED,
  title,
  body,
  tags
);
