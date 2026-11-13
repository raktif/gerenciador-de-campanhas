CREATE TABLE campaign_signals (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (
      length(id) = 36
      AND substr(id, 9, 1) = '-'
      AND substr(id, 14, 1) = '-'
      AND substr(id, 19, 1) = '-'
      AND substr(id, 24, 1) = '-'
      AND length(replace(id, '-', '')) = 32
      AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'
    ),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'explicit_need',
    'blocked_goal',
    'open_consequence',
    'clock_pressure',
    'shared_resource',
    'recent_change',
    'open_thread',
    'stale_thread',
    'uninvestigated_clue',
    'ignored_demand',
    'cross_plot_bridge',
    'potential_contradiction',
    'inactive_entity',
    'unresolved_mystery',
    'unfulfilled_promise'
  )),
  title TEXT NOT NULL CHECK (
    length(trim(title, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0
  ),
  summary TEXT NOT NULL CHECK (
    length(trim(summary, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0
  ),
  score INTEGER NOT NULL CHECK (typeof(score) = 'integer' AND score BETWEEN -5 AND 5),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL CHECK (status IN (
    'new', 'viewed', 'dismissed', 'snoozed', 'converted', 'resolved', 'stale'
  )),
  generated_at TEXT NOT NULL CHECK (
    length(generated_at) = 24
    AND generated_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', generated_at) = generated_at, 0)
  ),
  last_detected_at TEXT NOT NULL CHECK (
    length(last_detected_at) = 24
    AND last_detected_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', last_detected_at) = last_detected_at, 0)
  ),
  dismissed_until TEXT CHECK (
    dismissed_until IS NULL OR (
      length(dismissed_until) = 24
      AND dismissed_until GLOB '????-??-??T??:??:??.???Z'
      AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', dismissed_until) = dismissed_until, 0)
    )
  ),
  rule_version TEXT NOT NULL CHECK (
    length(trim(rule_version, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0
  ),
  generator_kind TEXT NOT NULL CHECK (generator_kind = 'deterministic'),
  created_at TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at, 0)
  ),
  updated_at TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at, 0)
  ),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (
    typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991
  )
);

CREATE INDEX campaign_signals_campaign_status_updated_idx
  ON campaign_signals (campaign_id, status, updated_at DESC, id DESC);
CREATE INDEX campaign_signals_campaign_type_detected_idx
  ON campaign_signals (campaign_id, signal_type, last_detected_at DESC, id DESC);

CREATE TABLE signal_evidence (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (
      length(id) = 36
      AND substr(id, 9, 1) = '-'
      AND substr(id, 14, 1) = '-'
      AND substr(id, 19, 1) = '-'
      AND substr(id, 24, 1) = '-'
      AND length(replace(id, '-', '')) = 32
      AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'
    ),
  signal_id TEXT NOT NULL REFERENCES campaign_signals(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (
    object_type IN ('entity', 'relationship', 'assertion', 'event', 'session', 'note')
  ),
  object_id TEXT NOT NULL
    CHECK (
      length(object_id) = 36
      AND substr(object_id, 9, 1) = '-'
      AND substr(object_id, 14, 1) = '-'
      AND substr(object_id, 19, 1) = '-'
      AND substr(object_id, 24, 1) = '-'
      AND length(replace(object_id, '-', '')) = 32
      AND replace(object_id, '-', '') NOT GLOB '*[^0-9a-f]*'
    ),
  role TEXT NOT NULL CHECK (
    instr(role, char(0)) = 0
    AND length(trim(role, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) BETWEEN 1 AND 100
  ),
  description TEXT CHECK (
    description IS NULL OR (
      instr(description, char(0)) = 0
      AND length(trim(description, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) BETWEEN 1 AND 2000
    )
  ),
  graph_path_json TEXT CHECK (
    graph_path_json IS NULL OR (
      json_valid(graph_path_json)
      AND json_type(graph_path_json) = 'array'
    )
  ),
  sort_order INTEGER NOT NULL CHECK (
    typeof(sort_order) = 'integer' AND sort_order BETWEEN 0 AND 9007199254740991
  ),
  created_at TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at, 0)
  )
);

CREATE INDEX signal_evidence_signal_order_idx
  ON signal_evidence (signal_id, sort_order, id);
CREATE INDEX signal_evidence_object_idx
  ON signal_evidence (object_type, object_id);

CREATE TRIGGER signal_evidence_target_insert_guard
BEFORE INSERT ON signal_evidence
WHEN NOT EXISTS (
  SELECT 1
  FROM campaign_signals s
  WHERE s.id = NEW.signal_id
    AND (
      (NEW.object_type = 'entity' AND EXISTS (
        SELECT 1 FROM entities o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'relationship' AND EXISTS (
        SELECT 1 FROM relationships o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'assertion' AND EXISTS (
        SELECT 1 FROM assertions o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'event' AND EXISTS (
        SELECT 1 FROM events o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'session' AND EXISTS (
        SELECT 1 FROM sessions o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'note' AND EXISTS (
        SELECT 1 FROM notes o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;

CREATE TRIGGER signal_evidence_target_update_guard
BEFORE UPDATE OF signal_id, object_type, object_id ON signal_evidence
WHEN NOT EXISTS (
  SELECT 1
  FROM campaign_signals s
  WHERE s.id = NEW.signal_id
    AND (
      (NEW.object_type = 'entity' AND EXISTS (
        SELECT 1 FROM entities o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'relationship' AND EXISTS (
        SELECT 1 FROM relationships o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'assertion' AND EXISTS (
        SELECT 1 FROM assertions o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'event' AND EXISTS (
        SELECT 1 FROM events o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'session' AND EXISTS (
        SELECT 1 FROM sessions o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
      OR (NEW.object_type = 'note' AND EXISTS (
        SELECT 1 FROM notes o WHERE o.id = NEW.object_id AND o.campaign_id = s.campaign_id
      ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;

CREATE TRIGGER campaign_signals_campaign_evidence_update_guard
BEFORE UPDATE OF campaign_id ON campaign_signals
WHEN EXISTS (
  SELECT 1
  FROM signal_evidence e
  WHERE e.signal_id = OLD.id
    AND NOT (
      (e.object_type = 'entity' AND EXISTS (
        SELECT 1 FROM entities o WHERE o.id = e.object_id AND o.campaign_id = NEW.campaign_id
      ))
      OR (e.object_type = 'relationship' AND EXISTS (
        SELECT 1 FROM relationships o WHERE o.id = e.object_id AND o.campaign_id = NEW.campaign_id
      ))
      OR (e.object_type = 'assertion' AND EXISTS (
        SELECT 1 FROM assertions o WHERE o.id = e.object_id AND o.campaign_id = NEW.campaign_id
      ))
      OR (e.object_type = 'event' AND EXISTS (
        SELECT 1 FROM events o WHERE o.id = e.object_id AND o.campaign_id = NEW.campaign_id
      ))
      OR (e.object_type = 'session' AND EXISTS (
        SELECT 1 FROM sessions o WHERE o.id = e.object_id AND o.campaign_id = NEW.campaign_id
      ))
      OR (e.object_type = 'note' AND EXISTS (
        SELECT 1 FROM notes o WHERE o.id = e.object_id AND o.campaign_id = NEW.campaign_id
      ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;

CREATE TRIGGER signal_evidence_entity_delete_cascade
AFTER DELETE ON entities
BEGIN
  DELETE FROM signal_evidence WHERE object_type = 'entity' AND object_id = OLD.id;
END;
CREATE TRIGGER signal_evidence_relationship_delete_cascade
AFTER DELETE ON relationships
BEGIN
  DELETE FROM signal_evidence WHERE object_type = 'relationship' AND object_id = OLD.id;
END;
CREATE TRIGGER signal_evidence_assertion_delete_cascade
AFTER DELETE ON assertions
BEGIN
  DELETE FROM signal_evidence WHERE object_type = 'assertion' AND object_id = OLD.id;
END;
CREATE TRIGGER signal_evidence_event_delete_cascade
AFTER DELETE ON events
BEGIN
  DELETE FROM signal_evidence WHERE object_type = 'event' AND object_id = OLD.id;
END;
CREATE TRIGGER signal_evidence_session_delete_cascade
AFTER DELETE ON sessions
BEGIN
  DELETE FROM signal_evidence WHERE object_type = 'session' AND object_id = OLD.id;
END;
CREATE TRIGGER signal_evidence_note_delete_cascade
AFTER DELETE ON notes
BEGIN
  DELETE FROM signal_evidence WHERE object_type = 'note' AND object_id = OLD.id;
END;

CREATE TRIGGER signal_evidence_entity_campaign_update_guard
BEFORE UPDATE OF campaign_id ON entities
WHEN NEW.campaign_id <> OLD.campaign_id
  AND EXISTS (
    SELECT 1 FROM signal_evidence e JOIN campaign_signals s ON s.id = e.signal_id
    WHERE e.object_type = 'entity' AND e.object_id = OLD.id AND s.campaign_id <> NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;
CREATE TRIGGER signal_evidence_relationship_campaign_update_guard
BEFORE UPDATE OF campaign_id ON relationships
WHEN NEW.campaign_id <> OLD.campaign_id
  AND EXISTS (
    SELECT 1 FROM signal_evidence e JOIN campaign_signals s ON s.id = e.signal_id
    WHERE e.object_type = 'relationship' AND e.object_id = OLD.id AND s.campaign_id <> NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;
CREATE TRIGGER signal_evidence_assertion_campaign_update_guard
BEFORE UPDATE OF campaign_id ON assertions
WHEN NEW.campaign_id <> OLD.campaign_id
  AND EXISTS (
    SELECT 1 FROM signal_evidence e JOIN campaign_signals s ON s.id = e.signal_id
    WHERE e.object_type = 'assertion' AND e.object_id = OLD.id AND s.campaign_id <> NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;
CREATE TRIGGER signal_evidence_event_campaign_update_guard
BEFORE UPDATE OF campaign_id ON events
WHEN NEW.campaign_id <> OLD.campaign_id
  AND EXISTS (
    SELECT 1 FROM signal_evidence e JOIN campaign_signals s ON s.id = e.signal_id
    WHERE e.object_type = 'event' AND e.object_id = OLD.id AND s.campaign_id <> NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;
CREATE TRIGGER signal_evidence_session_campaign_update_guard
BEFORE UPDATE OF campaign_id ON sessions
WHEN NEW.campaign_id <> OLD.campaign_id
  AND EXISTS (
    SELECT 1 FROM signal_evidence e JOIN campaign_signals s ON s.id = e.signal_id
    WHERE e.object_type = 'session' AND e.object_id = OLD.id AND s.campaign_id <> NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;
CREATE TRIGGER signal_evidence_note_campaign_update_guard
BEFORE UPDATE OF campaign_id ON notes
WHEN NEW.campaign_id <> OLD.campaign_id
  AND EXISTS (
    SELECT 1 FROM signal_evidence e JOIN campaign_signals s ON s.id = e.signal_id
    WHERE e.object_type = 'note' AND e.object_id = OLD.id AND s.campaign_id <> NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_INVALID_OR_CROSS_CAMPAIGN');
END;

CREATE TRIGGER signal_evidence_entity_id_update_guard
BEFORE UPDATE OF id ON entities
WHEN NEW.id IS NOT OLD.id
  AND EXISTS (
    SELECT 1 FROM signal_evidence WHERE object_type = 'entity' AND (object_id = OLD.id OR object_id = NEW.id)
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_IN_USE');
END;
CREATE TRIGGER signal_evidence_relationship_id_update_guard
BEFORE UPDATE OF id ON relationships
WHEN NEW.id IS NOT OLD.id
  AND EXISTS (
    SELECT 1 FROM signal_evidence WHERE object_type = 'relationship' AND (object_id = OLD.id OR object_id = NEW.id)
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_IN_USE');
END;
CREATE TRIGGER signal_evidence_assertion_id_update_guard
BEFORE UPDATE OF id ON assertions
WHEN NEW.id IS NOT OLD.id
  AND EXISTS (
    SELECT 1 FROM signal_evidence WHERE object_type = 'assertion' AND (object_id = OLD.id OR object_id = NEW.id)
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_IN_USE');
END;
CREATE TRIGGER signal_evidence_event_id_update_guard
BEFORE UPDATE OF id ON events
WHEN NEW.id IS NOT OLD.id
  AND EXISTS (
    SELECT 1 FROM signal_evidence WHERE object_type = 'event' AND (object_id = OLD.id OR object_id = NEW.id)
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_IN_USE');
END;
CREATE TRIGGER signal_evidence_session_id_update_guard
BEFORE UPDATE OF id ON sessions
WHEN NEW.id IS NOT OLD.id
  AND EXISTS (
    SELECT 1 FROM signal_evidence WHERE object_type = 'session' AND (object_id = OLD.id OR object_id = NEW.id)
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_IN_USE');
END;
CREATE TRIGGER signal_evidence_note_id_update_guard
BEFORE UPDATE OF id ON notes
WHEN NEW.id IS NOT OLD.id
  AND EXISTS (
    SELECT 1 FROM signal_evidence WHERE object_type = 'note' AND (object_id = OLD.id OR object_id = NEW.id)
  )
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_IN_USE');
END;

-- REPLACE deletes conflicts without running DELETE triggers when
-- recursive_triggers=0. Refuse inserts conflicting with referenced targets;
-- normal UPDATE and unreferenced INSERT/REPLACE keep their existing semantics.
CREATE TRIGGER signal_evidence_entity_replace_guard
BEFORE INSERT ON entities
WHEN EXISTS (
  SELECT 1 FROM signal_evidence WHERE object_type = 'entity' AND object_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_REPLACE_FORBIDDEN');
END;
CREATE TRIGGER signal_evidence_relationship_replace_guard
BEFORE INSERT ON relationships
WHEN EXISTS (
  SELECT 1 FROM signal_evidence WHERE object_type = 'relationship' AND object_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_REPLACE_FORBIDDEN');
END;
CREATE TRIGGER signal_evidence_assertion_replace_guard
BEFORE INSERT ON assertions
WHEN EXISTS (
  SELECT 1 FROM signal_evidence WHERE object_type = 'assertion' AND object_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_REPLACE_FORBIDDEN');
END;
CREATE TRIGGER signal_evidence_event_replace_guard
BEFORE INSERT ON events
WHEN EXISTS (
  SELECT 1 FROM signal_evidence WHERE object_type = 'event' AND object_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_REPLACE_FORBIDDEN');
END;
CREATE TRIGGER signal_evidence_session_replace_guard
BEFORE INSERT ON sessions
WHEN EXISTS (
  SELECT 1 FROM signal_evidence e JOIN sessions o ON o.id = e.object_id
  WHERE e.object_type = 'session'
    AND (o.id = NEW.id OR (o.campaign_id = NEW.campaign_id AND o.sequence_number = NEW.sequence_number))
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_REPLACE_FORBIDDEN');
END;
CREATE TRIGGER signal_evidence_note_replace_guard
BEFORE INSERT ON notes
WHEN EXISTS (
  SELECT 1 FROM signal_evidence WHERE object_type = 'note' AND object_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_REPLACE_FORBIDDEN');
END;

CREATE TRIGGER signal_evidence_session_natural_key_update_guard
BEFORE UPDATE OF campaign_id, sequence_number ON sessions
WHEN EXISTS (
  SELECT 1 FROM signal_evidence e JOIN sessions o ON o.id = e.object_id
  WHERE e.object_type = 'session' AND o.id IS NOT OLD.id
    AND o.campaign_id = NEW.campaign_id AND o.sequence_number = NEW.sequence_number
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNAL_EVIDENCE_TARGET_REPLACE_FORBIDDEN');
END;
