CREATE TABLE session_closing_steps (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  step TEXT NOT NULL CHECK (step IN ('inbox', 'events', 'changes', 'clocks', 'consequences', 'threads', 'signals', 'next_session')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (typeof(revision) = 'integer' AND revision > 0),
  UNIQUE(session_id, step)
);
CREATE INDEX session_closing_steps_campaign_session_idx ON session_closing_steps(campaign_id, session_id, step);
CREATE TRIGGER session_closing_steps_campaign_guard_insert
BEFORE INSERT ON session_closing_steps
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND campaign_id = NEW.campaign_id) THEN RAISE(ABORT, 'session_closing_session_campaign_mismatch') END;
END;
CREATE TRIGGER session_closing_steps_campaign_guard_update
BEFORE UPDATE OF campaign_id, session_id ON session_closing_steps
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND campaign_id = NEW.campaign_id) THEN RAISE(ABORT, 'session_closing_session_campaign_mismatch') END;
END;

CREATE TABLE session_preparation_items (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  object_type TEXT NOT NULL CHECK (object_type IN ('story_thread', 'clock', 'demand', 'signal')),
  object_id TEXT NOT NULL,
  story_thread_id TEXT REFERENCES story_threads(id) ON DELETE RESTRICT,
  clock_id TEXT REFERENCES clocks(id) ON DELETE RESTRICT,
  demand_id TEXT REFERENCES demands(id) ON DELETE RESTRICT,
  signal_id TEXT REFERENCES campaign_signals(id) ON DELETE RESTRICT,
  selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (typeof(revision) = 'integer' AND revision > 0),
  UNIQUE(session_id, object_type, object_id),
  CHECK (
    (object_type = 'story_thread' AND story_thread_id = object_id AND clock_id IS NULL AND demand_id IS NULL AND signal_id IS NULL) OR
    (object_type = 'clock' AND clock_id = object_id AND story_thread_id IS NULL AND demand_id IS NULL AND signal_id IS NULL) OR
    (object_type = 'demand' AND demand_id = object_id AND story_thread_id IS NULL AND clock_id IS NULL AND signal_id IS NULL) OR
    (object_type = 'signal' AND signal_id = object_id AND story_thread_id IS NULL AND clock_id IS NULL AND demand_id IS NULL)
  )
);
CREATE INDEX session_preparation_items_campaign_session_idx ON session_preparation_items(campaign_id, session_id, selected, object_type, object_id);
CREATE TRIGGER session_preparation_items_campaign_guard_insert
BEFORE INSERT ON session_preparation_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND campaign_id = NEW.campaign_id) THEN RAISE(ABORT, 'session_preparation_session_campaign_mismatch') END;
  SELECT CASE WHEN
    (NEW.object_type = 'story_thread' AND NOT EXISTS (SELECT 1 FROM story_threads WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'clock' AND NOT EXISTS (SELECT 1 FROM clocks WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'demand' AND NOT EXISTS (SELECT 1 FROM demands WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id)) OR
    (NEW.object_type = 'signal' AND NOT EXISTS (SELECT 1 FROM campaign_signals WHERE id = NEW.object_id AND campaign_id = NEW.campaign_id))
  THEN RAISE(ABORT, 'session_preparation_object_campaign_mismatch') END;
END;
CREATE TRIGGER session_preparation_items_identity_guard_update
BEFORE UPDATE OF campaign_id, session_id, object_type, object_id, story_thread_id, clock_id, demand_id, signal_id ON session_preparation_items
BEGIN
  SELECT CASE WHEN NEW.campaign_id <> OLD.campaign_id OR NEW.session_id <> OLD.session_id OR NEW.object_type <> OLD.object_type OR NEW.object_id <> OLD.object_id OR NEW.story_thread_id IS NOT OLD.story_thread_id OR NEW.clock_id IS NOT OLD.clock_id OR NEW.demand_id IS NOT OLD.demand_id OR NEW.signal_id IS NOT OLD.signal_id THEN RAISE(ABORT, 'session_preparation_identity_immutable') END;
END;
