CREATE TABLE story_threads (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 10000),
  thread_type TEXT NOT NULL CHECK (thread_type IN (
    'promise', 'mystery', 'clue', 'threat', 'relationship', 'unanswered_question',
    'unfinished_goal', 'ignored_demand', 'custom'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'open', 'active', 'dormant', 'resolved', 'abandoned', 'archived'
  )),
  status_before_archive TEXT CHECK (status_before_archive IN (
    'open', 'active', 'dormant', 'resolved', 'abandoned'
  )),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('manual', 'session')),
  origin_session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  origin_reason TEXT CHECK (origin_reason IS NULL OR length(origin_reason) <= 2000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (
    typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991
  ),
  CHECK ((status = 'archived' AND status_before_archive IS NOT NULL)
    OR (status <> 'archived' AND status_before_archive IS NULL)),
  CHECK ((origin_kind = 'session' AND origin_session_id IS NOT NULL)
    OR (origin_kind = 'manual' AND origin_session_id IS NULL))
);

CREATE INDEX story_threads_campaign_status_updated_idx
  ON story_threads(campaign_id, status, updated_at DESC, id DESC);
CREATE INDEX story_threads_campaign_type_idx
  ON story_threads(campaign_id, thread_type, status, updated_at DESC, id DESC);

CREATE TRIGGER story_threads_origin_session_campaign_insert
BEFORE INSERT ON story_threads
WHEN NEW.origin_session_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = NEW.origin_session_id AND s.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'story_thread_origin_session_campaign_mismatch') END;
END;

CREATE TRIGGER story_threads_origin_session_campaign_update
BEFORE UPDATE OF campaign_id, origin_session_id ON story_threads
WHEN NEW.origin_session_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = NEW.origin_session_id AND s.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'story_thread_origin_session_campaign_mismatch') END;
END;

CREATE TABLE story_thread_links (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES story_threads(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'entity', 'relationship', 'assertion', 'note', 'event', 'session'
  )),
  target_id TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id) ON DELETE RESTRICT,
  relationship_id TEXT REFERENCES relationships(id) ON DELETE RESTRICT,
  assertion_id TEXT REFERENCES assertions(id) ON DELETE RESTRICT,
  note_id TEXT REFERENCES notes(id) ON DELETE RESTRICT,
  event_id TEXT REFERENCES events(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (
    typeof(sort_order) = 'integer' AND sort_order BETWEEN 0 AND 9007199254740991
  ),
  created_at TEXT NOT NULL,
  CHECK (
    (target_type = 'entity' AND entity_id = target_id
      AND relationship_id IS NULL AND assertion_id IS NULL AND note_id IS NULL
      AND event_id IS NULL AND session_id IS NULL)
    OR (target_type = 'relationship' AND relationship_id = target_id
      AND entity_id IS NULL AND assertion_id IS NULL AND note_id IS NULL
      AND event_id IS NULL AND session_id IS NULL)
    OR (target_type = 'assertion' AND assertion_id = target_id
      AND entity_id IS NULL AND relationship_id IS NULL AND note_id IS NULL
      AND event_id IS NULL AND session_id IS NULL)
    OR (target_type = 'note' AND note_id = target_id
      AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL
      AND event_id IS NULL AND session_id IS NULL)
    OR (target_type = 'event' AND event_id = target_id
      AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL
      AND note_id IS NULL AND session_id IS NULL)
    OR (target_type = 'session' AND session_id = target_id
      AND entity_id IS NULL AND relationship_id IS NULL AND assertion_id IS NULL
      AND note_id IS NULL AND event_id IS NULL)
  ),
  UNIQUE(thread_id, target_type, target_id)
);

CREATE INDEX story_thread_links_campaign_target_idx
  ON story_thread_links(campaign_id, target_type, target_id);
CREATE INDEX story_thread_links_thread_order_idx
  ON story_thread_links(thread_id, sort_order, id);

CREATE TRIGGER story_thread_links_campaign_guard_insert
BEFORE INSERT ON story_thread_links
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM story_threads t
    WHERE t.id = NEW.thread_id AND t.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'story_thread_link_campaign_mismatch') END;
  SELECT CASE WHEN
    (NEW.target_type = 'entity' AND NOT EXISTS (
      SELECT 1 FROM entities WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'relationship' AND NOT EXISTS (
      SELECT 1 FROM relationships WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'assertion' AND NOT EXISTS (
      SELECT 1 FROM assertions WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'note' AND NOT EXISTS (
      SELECT 1 FROM notes WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'event' AND NOT EXISTS (
      SELECT 1 FROM events WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'session' AND NOT EXISTS (
      SELECT 1 FROM sessions WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    ))
  THEN RAISE(ABORT, 'story_thread_link_target_campaign_mismatch') END;
END;

CREATE TRIGGER story_thread_links_campaign_guard_update
BEFORE UPDATE OF campaign_id, thread_id, target_type, target_id ON story_thread_links
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM story_threads t
    WHERE t.id = NEW.thread_id AND t.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'story_thread_link_campaign_mismatch') END;
  SELECT CASE WHEN
    (NEW.target_type = 'entity' AND NOT EXISTS (
      SELECT 1 FROM entities WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'relationship' AND NOT EXISTS (
      SELECT 1 FROM relationships WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'assertion' AND NOT EXISTS (
      SELECT 1 FROM assertions WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'note' AND NOT EXISTS (
      SELECT 1 FROM notes WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'event' AND NOT EXISTS (
      SELECT 1 FROM events WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    )) OR
    (NEW.target_type = 'session' AND NOT EXISTS (
      SELECT 1 FROM sessions WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
    ))
  THEN RAISE(ABORT, 'story_thread_link_target_campaign_mismatch') END;
END;

CREATE TRIGGER story_thread_links_archived_target_guard_insert
BEFORE INSERT ON story_thread_links
BEGIN
  SELECT CASE WHEN
    (NEW.target_type = 'entity' AND EXISTS (
      SELECT 1 FROM entities WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'relationship' AND EXISTS (
      SELECT 1 FROM relationships WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'assertion' AND EXISTS (
      SELECT 1 FROM assertions WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'note' AND EXISTS (
      SELECT 1 FROM notes WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'event' AND EXISTS (
      SELECT 1 FROM events WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    ))
  THEN RAISE(ABORT, 'story_thread_link_archived_target') END;
END;

CREATE TRIGGER story_thread_links_archived_target_guard_update
BEFORE UPDATE OF campaign_id, target_type, target_id ON story_thread_links
WHEN NEW.target_type <> OLD.target_type OR NEW.target_id <> OLD.target_id
BEGIN
  SELECT CASE WHEN
    (NEW.target_type = 'entity' AND EXISTS (
      SELECT 1 FROM entities WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'relationship' AND EXISTS (
      SELECT 1 FROM relationships WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'assertion' AND EXISTS (
      SELECT 1 FROM assertions WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'note' AND EXISTS (
      SELECT 1 FROM notes WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    )) OR
    (NEW.target_type = 'event' AND EXISTS (
      SELECT 1 FROM events WHERE id = NEW.target_id AND campaign_id = NEW.campaign_id
        AND archived_at IS NOT NULL
    ))
  THEN RAISE(ABORT, 'story_thread_link_archived_target') END;
END;

CREATE TABLE story_thread_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES story_threads(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (
    typeof(sequence_number) = 'integer' AND sequence_number BETWEEN 1 AND 9007199254740991
  ),
  from_status TEXT CHECK (from_status IN (
    'open', 'active', 'dormant', 'resolved', 'abandoned', 'archived'
  )),
  to_status TEXT NOT NULL CHECK (to_status IN (
    'open', 'active', 'dormant', 'resolved', 'abandoned', 'archived'
  )),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 2000),
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  CHECK (from_status IS NULL OR from_status <> to_status),
  UNIQUE(thread_id, sequence_number)
);

CREATE TRIGGER story_thread_transitions_campaign_guard_insert
BEFORE INSERT ON story_thread_transitions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM story_threads t
    WHERE t.id = NEW.thread_id AND t.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'story_thread_transition_campaign_mismatch') END;
  SELECT CASE WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = NEW.session_id AND s.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'story_thread_transition_session_campaign_mismatch') END;
END;

CREATE TRIGGER story_thread_transitions_immutable_update
BEFORE UPDATE ON story_thread_transitions
BEGIN
  SELECT RAISE(ABORT, 'story_thread_transition_immutable');
END;

CREATE TRIGGER story_thread_transitions_immutable_delete
BEFORE DELETE ON story_thread_transitions
BEGIN
  SELECT RAISE(ABORT, 'story_thread_transition_immutable');
END;
