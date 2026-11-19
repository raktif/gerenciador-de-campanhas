CREATE TABLE narrative_objects (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN (
    'entity', 'relationship', 'assertion', 'note', 'event', 'session', 'clock', 'demand', 'story_thread'
  )),
  object_id TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id) ON DELETE RESTRICT,
  relationship_id TEXT REFERENCES relationships(id) ON DELETE RESTRICT,
  assertion_id TEXT REFERENCES assertions(id) ON DELETE RESTRICT,
  note_id TEXT REFERENCES notes(id) ON DELETE RESTRICT,
  event_id TEXT REFERENCES events(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  clock_id TEXT REFERENCES clocks(id) ON DELETE RESTRICT,
  demand_id TEXT REFERENCES demands(id) ON DELETE RESTRICT,
  story_thread_id TEXT REFERENCES story_threads(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE(campaign_id, object_type, object_id),
  CHECK (
    (object_type = 'entity' AND entity_id = object_id AND relationship_id IS NULL AND assertion_id IS NULL AND note_id IS NULL AND event_id IS NULL AND session_id IS NULL AND clock_id IS NULL AND demand_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'relationship' AND relationship_id = object_id AND entity_id IS NULL AND assertion_id IS NULL AND note_id IS NULL AND event_id IS NULL AND session_id IS NULL AND clock_id IS NULL AND demand_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'assertion' AND assertion_id = object_id AND entity_id IS NULL AND relationship_id IS NULL AND note_id IS NULL AND event_id IS NULL AND session_id IS NULL AND clock_id IS NULL AND demand_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'note' AND note_id = object_id AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL AND event_id IS NULL AND session_id IS NULL AND clock_id IS NULL AND demand_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'event' AND event_id = object_id AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL AND note_id IS NULL AND session_id IS NULL AND clock_id IS NULL AND demand_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'session' AND session_id = object_id AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL AND note_id IS NULL AND event_id IS NULL AND clock_id IS NULL AND demand_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'clock' AND clock_id = object_id AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL AND note_id IS NULL AND event_id IS NULL AND session_id IS NULL AND demand_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'demand' AND demand_id = object_id AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL AND note_id IS NULL AND event_id IS NULL AND session_id IS NULL AND clock_id IS NULL AND story_thread_id IS NULL) OR
    (object_type = 'story_thread' AND story_thread_id = object_id AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL AND note_id IS NULL AND event_id IS NULL AND session_id IS NULL AND clock_id IS NULL AND demand_id IS NULL)
  )
);
CREATE INDEX narrative_objects_campaign_type_idx ON narrative_objects(campaign_id, object_type, object_id);
CREATE TRIGGER narrative_objects_campaign_guard_insert
BEFORE INSERT ON narrative_objects
BEGIN
  SELECT CASE WHEN
    (NEW.object_type = 'entity' AND NOT EXISTS (SELECT 1 FROM entities WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'relationship' AND NOT EXISTS (SELECT 1 FROM relationships WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'assertion' AND NOT EXISTS (SELECT 1 FROM assertions WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'note' AND NOT EXISTS (SELECT 1 FROM notes WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'event' AND NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'session' AND NOT EXISTS (SELECT 1 FROM sessions WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'clock' AND NOT EXISTS (SELECT 1 FROM clocks WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'demand' AND NOT EXISTS (SELECT 1 FROM demands WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'story_thread' AND NOT EXISTS (SELECT 1 FROM story_threads WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id))
  THEN RAISE(ABORT, 'narrative_object_campaign_mismatch') END;
END;
CREATE TRIGGER narrative_objects_identity_guard_update
BEFORE UPDATE OF campaign_id, object_type, object_id, entity_id, relationship_id, assertion_id, note_id, event_id, session_id, clock_id, demand_id, story_thread_id ON narrative_objects
BEGIN
  SELECT CASE WHEN NEW.campaign_id <> OLD.campaign_id OR NEW.object_type <> OLD.object_type OR NEW.object_id <> OLD.object_id
    THEN RAISE(ABORT, 'narrative_object_identity_immutable') END;
END;
CREATE TRIGGER narrative_objects_campaign_guard_update
BEFORE UPDATE OF campaign_id, object_type, object_id ON narrative_objects
BEGIN
  SELECT CASE WHEN
    (NEW.object_type = 'entity' AND NOT EXISTS (SELECT 1 FROM entities WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'relationship' AND NOT EXISTS (SELECT 1 FROM relationships WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'assertion' AND NOT EXISTS (SELECT 1 FROM assertions WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'note' AND NOT EXISTS (SELECT 1 FROM notes WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'event' AND NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'session' AND NOT EXISTS (SELECT 1 FROM sessions WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'clock' AND NOT EXISTS (SELECT 1 FROM clocks WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'demand' AND NOT EXISTS (SELECT 1 FROM demands WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'story_thread' AND NOT EXISTS (SELECT 1 FROM story_threads WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id))
  THEN RAISE(ABORT, 'narrative_object_campaign_mismatch') END;
END;

CREATE TABLE causal_links (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source_object_id TEXT NOT NULL REFERENCES narrative_objects(id) ON DELETE RESTRICT,
  target_object_id TEXT NOT NULL REFERENCES narrative_objects(id) ON DELETE RESTRICT,
  causal_type TEXT NOT NULL CHECK (causal_type IN ('causes', 'contributes_to', 'enables', 'blocks', 'worsens', 'improves', 'transforms', 'resolves', 'reveals')),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (typeof(revision) = 'integer' AND revision > 0),
  CHECK (source_object_id <> target_object_id),
  UNIQUE(campaign_id, source_object_id, target_object_id, causal_type)
);
CREATE INDEX causal_links_campaign_source_idx ON causal_links(campaign_id, source_object_id, created_at, id);
CREATE INDEX causal_links_campaign_target_idx ON causal_links(campaign_id, target_object_id, created_at, id);

CREATE TRIGGER causal_links_campaign_guard_insert
BEFORE INSERT ON causal_links
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM narrative_objects WHERE id = NEW.source_object_id AND campaign_id = NEW.campaign_id) THEN RAISE(ABORT, 'causal_source_campaign_mismatch') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM narrative_objects WHERE id = NEW.target_object_id AND campaign_id = NEW.campaign_id) THEN RAISE(ABORT, 'causal_target_campaign_mismatch') END;
END;
CREATE TRIGGER causal_links_campaign_guard_update
BEFORE UPDATE OF campaign_id, source_object_id, target_object_id ON causal_links
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM narrative_objects WHERE id = NEW.source_object_id AND campaign_id = NEW.campaign_id) THEN RAISE(ABORT, 'causal_source_campaign_mismatch') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM narrative_objects WHERE id = NEW.target_object_id AND campaign_id = NEW.campaign_id) THEN RAISE(ABORT, 'causal_target_campaign_mismatch') END;
END;
