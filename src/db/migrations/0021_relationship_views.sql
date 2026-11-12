CREATE TABLE relationship_views (
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
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  view_type TEXT NOT NULL CHECK (view_type IN ('campaign', 'neighborhood')),
  source_entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  viewport_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'
    CHECK (
      json_valid(viewport_json)
      AND json_type(viewport_json) = 'object'
      AND json_type(viewport_json, '$.x') IN ('integer', 'real')
      AND json_type(viewport_json, '$.y') IN ('integer', 'real')
      AND json_type(viewport_json, '$.zoom') IN ('integer', 'real')
      AND json_extract(viewport_json, '$.x') BETWEEN -1000000 AND 1000000
      AND json_extract(viewport_json, '$.y') BETWEEN -1000000 AND 1000000
      AND json_extract(viewport_json, '$.zoom') BETWEEN 0.1 AND 4
    ),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (
    (view_type = 'campaign' AND source_entity_id IS NULL)
    OR (view_type = 'neighborhood' AND source_entity_id IS NOT NULL)
  )
);

CREATE INDEX relationship_views_campaign_type_idx
  ON relationship_views (campaign_id, view_type, updated_at DESC, id DESC);
CREATE UNIQUE INDEX relationship_views_default_campaign_unique
  ON relationship_views (campaign_id, view_type)
  WHERE is_default = 1 AND view_type = 'campaign';
CREATE UNIQUE INDEX relationship_views_default_neighborhood_unique
  ON relationship_views (campaign_id, view_type, source_entity_id)
  WHERE is_default = 1 AND view_type = 'neighborhood';

CREATE TABLE relationship_view_nodes (
  relationship_view_id TEXT NOT NULL REFERENCES relationship_views(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  x REAL NOT NULL CHECK (x BETWEEN -1000000 AND 1000000),
  y REAL NOT NULL CHECK (y BETWEEN -1000000 AND 1000000),
  width REAL NOT NULL CHECK (width > 0 AND width <= 4096),
  height REAL NOT NULL CHECK (height > 0 AND height <= 4096),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  PRIMARY KEY (relationship_view_id, entity_id)
);

CREATE INDEX relationship_view_nodes_entity_idx
  ON relationship_view_nodes (entity_id, relationship_view_id);

CREATE TRIGGER relationship_views_source_insert_guard
BEFORE INSERT ON relationship_views
WHEN NEW.source_entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entities e
    WHERE e.id = NEW.source_entity_id AND e.campaign_id = NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'relationship view source must belong to the campaign');
END;

CREATE TRIGGER relationship_views_source_update_guard
BEFORE UPDATE OF campaign_id, source_entity_id ON relationship_views
WHEN NEW.source_entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entities e
    WHERE e.id = NEW.source_entity_id AND e.campaign_id = NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'relationship view source must belong to the campaign');
END;

CREATE TRIGGER relationship_views_campaign_nodes_update_guard
BEFORE UPDATE OF campaign_id ON relationship_views
WHEN EXISTS (
  SELECT 1
  FROM relationship_view_nodes n
  JOIN entities e ON e.id = n.entity_id
  WHERE n.relationship_view_id = OLD.id AND e.campaign_id <> NEW.campaign_id
)
BEGIN
  SELECT RAISE(ABORT, 'relationship view nodes must belong to the campaign');
END;

CREATE TRIGGER relationship_view_nodes_insert_guard
BEFORE INSERT ON relationship_view_nodes
WHEN NOT EXISTS (
  SELECT 1
  FROM relationship_views v
  JOIN entities e ON e.id = NEW.entity_id AND e.campaign_id = v.campaign_id
  WHERE v.id = NEW.relationship_view_id
)
BEGIN
  SELECT RAISE(ABORT, 'relationship view node must belong to the campaign');
END;

CREATE TRIGGER relationship_view_nodes_update_guard
BEFORE UPDATE OF relationship_view_id, entity_id ON relationship_view_nodes
WHEN NOT EXISTS (
  SELECT 1
  FROM relationship_views v
  JOIN entities e ON e.id = NEW.entity_id AND e.campaign_id = v.campaign_id
  WHERE v.id = NEW.relationship_view_id
)
BEGIN
  SELECT RAISE(ABORT, 'relationship view node must belong to the campaign');
END;

CREATE TRIGGER entities_relationship_views_campaign_update_guard
BEFORE UPDATE OF campaign_id ON entities
WHEN NEW.campaign_id <> OLD.campaign_id
  AND (
    EXISTS (
      SELECT 1 FROM relationship_views v
      WHERE v.source_entity_id = OLD.id AND v.campaign_id <> NEW.campaign_id
    )
    OR EXISTS (
      SELECT 1
      FROM relationship_view_nodes n
      JOIN relationship_views v ON v.id = n.relationship_view_id
      WHERE n.entity_id = OLD.id AND v.campaign_id <> NEW.campaign_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'entity campaign is incompatible with relationship views');
END;
