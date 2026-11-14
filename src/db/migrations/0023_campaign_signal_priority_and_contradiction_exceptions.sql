-- Version 23 replaces the provisional numeric score/severity model with one priority enum.
-- The verified pre-migration backup is created by openApplicationDatabase before this runs.
CREATE TABLE campaign_signals_v23 (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (
      length(id) = 36 AND substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-'
      AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-'
      AND length(replace(id, '-', '')) = 32 AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'
    ),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'explicit_need', 'blocked_goal', 'open_consequence', 'clock_pressure', 'shared_resource',
    'recent_change', 'open_thread', 'stale_thread', 'uninvestigated_clue', 'ignored_demand',
    'cross_plot_bridge', 'potential_contradiction', 'inactive_entity', 'unresolved_mystery',
    'unfulfilled_promise'
  )),
  title TEXT NOT NULL CHECK (
    length(trim(title, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0
  ),
  summary TEXT NOT NULL CHECK (
    length(trim(summary, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0
  ),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'very_high')),
  status TEXT NOT NULL CHECK (status IN (
    'new', 'viewed', 'dismissed', 'snoozed', 'converted', 'resolved', 'stale'
  )),
  generated_at TEXT NOT NULL CHECK (
    length(generated_at) = 24 AND generated_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', generated_at) = generated_at, 0)
  ),
  last_detected_at TEXT NOT NULL CHECK (
    length(last_detected_at) = 24 AND last_detected_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', last_detected_at) = last_detected_at, 0)
  ),
  dismissed_until TEXT CHECK (
    dismissed_until IS NULL OR (
      length(dismissed_until) = 24 AND dismissed_until GLOB '????-??-??T??:??:??.???Z'
      AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', dismissed_until) = dismissed_until, 0)
    )
  ),
  rule_version TEXT NOT NULL CHECK (
    length(trim(rule_version, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0
  ),
  generator_kind TEXT NOT NULL CHECK (generator_kind = 'deterministic'),
  created_at TEXT NOT NULL CHECK (
    length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at, 0)
  ),
  updated_at TEXT NOT NULL CHECK (
    length(updated_at) = 24 AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at, 0)
  ),
  revision INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991)
);

INSERT INTO campaign_signals_v23 (
  id, campaign_id, signal_type, title, summary, priority, status, generated_at,
  last_detected_at, dismissed_until, rule_version, generator_kind, created_at, updated_at, revision
)
SELECT id, campaign_id, signal_type, title, summary,
  CASE
    WHEN signal_type = 'explicit_need' THEN 'high'
    WHEN score <= 0 THEN 'low'
    WHEN score = 1 THEN 'medium'
    WHEN score = 2 THEN 'high'
    ELSE 'very_high'
  END,
  status, generated_at, last_detected_at, dismissed_until, rule_version, generator_kind,
  created_at, updated_at, revision
FROM campaign_signals;

-- The runner disables FK rewriting and enables legacy ALTER semantics around this migration.
-- Rename the old table only after the replacement is fully populated; dependent triggers and
-- signal_evidence keep their campaign_signals reference and resolve to the new table name.
ALTER TABLE campaign_signals RENAME TO campaign_signals_v22;
ALTER TABLE campaign_signals_v23 RENAME TO campaign_signals;
DROP TABLE campaign_signals_v22;
-- Fail atomically if the existing evidence table needed by this migration is missing.
SELECT count(*) FROM signal_evidence;

CREATE INDEX campaign_signals_campaign_status_updated_idx
  ON campaign_signals (campaign_id, status, updated_at DESC, id DESC);
CREATE INDEX campaign_signals_campaign_type_detected_idx
  ON campaign_signals (campaign_id, signal_type, last_detected_at DESC, id DESC);

CREATE TRIGGER campaign_signals_campaign_evidence_update_guard
BEFORE UPDATE OF campaign_id ON campaign_signals
WHEN EXISTS (
  SELECT 1 FROM signal_evidence e
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

CREATE TABLE potential_contradiction_exceptions (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  assertion_low_id TEXT NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  assertion_high_id TEXT NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  signal_id TEXT NOT NULL UNIQUE REFERENCES campaign_signals(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL CHECK (
    length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at, 0)
  ),
  PRIMARY KEY (campaign_id, assertion_low_id, assertion_high_id),
  CHECK (assertion_low_id < assertion_high_id)
);

CREATE INDEX potential_contradiction_exceptions_low_idx
  ON potential_contradiction_exceptions (assertion_low_id);
CREATE INDEX potential_contradiction_exceptions_high_idx
  ON potential_contradiction_exceptions (assertion_high_id);

CREATE TRIGGER potential_contradiction_exception_insert_guard
BEFORE INSERT ON potential_contradiction_exceptions
WHEN NOT EXISTS (
  SELECT 1 FROM campaign_signals s
  JOIN assertions a ON a.id = NEW.assertion_low_id
  JOIN assertions b ON b.id = NEW.assertion_high_id
  WHERE s.id = NEW.signal_id
    AND s.campaign_id = NEW.campaign_id
    AND s.signal_type = 'potential_contradiction'
    AND a.campaign_id = NEW.campaign_id
    AND b.campaign_id = NEW.campaign_id
)
BEGIN
  SELECT RAISE(ABORT, 'POTENTIAL_CONTRADICTION_EXCEPTION_SCOPE_INVALID');
END;

CREATE TRIGGER potential_contradiction_exception_update_guard
BEFORE UPDATE OF campaign_id, assertion_low_id, assertion_high_id, signal_id
ON potential_contradiction_exceptions
WHEN NOT EXISTS (
  SELECT 1 FROM campaign_signals s
  JOIN assertions a ON a.id = NEW.assertion_low_id
  JOIN assertions b ON b.id = NEW.assertion_high_id
  WHERE s.id = NEW.signal_id
    AND s.campaign_id = NEW.campaign_id
    AND s.signal_type = 'potential_contradiction'
    AND a.campaign_id = NEW.campaign_id
    AND b.campaign_id = NEW.campaign_id
)
BEGIN
  SELECT RAISE(ABORT, 'POTENTIAL_CONTRADICTION_EXCEPTION_SCOPE_INVALID');
END;

CREATE TRIGGER potential_contradiction_exception_source_update
AFTER UPDATE OF subject_entity_id, predicate, object_entity_id, statement, value_json,
  canon_state, knowledge_state, archived_at
ON assertions
WHEN NEW.subject_entity_id IS NOT OLD.subject_entity_id
  OR NEW.predicate IS NOT OLD.predicate
  OR NEW.object_entity_id IS NOT OLD.object_entity_id
  OR NEW.statement IS NOT OLD.statement
  OR NEW.value_json IS NOT OLD.value_json
  OR NEW.canon_state IS NOT OLD.canon_state
  OR NEW.knowledge_state IS NOT OLD.knowledge_state
  OR NEW.archived_at IS NOT OLD.archived_at
BEGIN
  UPDATE campaign_signals
  SET status = 'stale',
      dismissed_until = NULL,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      revision = revision + 1
  WHERE id IN (
    SELECT signal_id FROM potential_contradiction_exceptions
    WHERE assertion_low_id = OLD.id OR assertion_high_id = OLD.id
  );
  DELETE FROM potential_contradiction_exceptions
  WHERE assertion_low_id = OLD.id OR assertion_high_id = OLD.id;
END;

CREATE TRIGGER potential_contradiction_exception_source_delete
BEFORE DELETE ON assertions
BEGIN
  UPDATE campaign_signals
  SET status = 'stale',
      dismissed_until = NULL,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      revision = revision + 1
  WHERE id IN (
    SELECT signal_id FROM potential_contradiction_exceptions
    WHERE assertion_low_id = OLD.id OR assertion_high_id = OLD.id
  );
END;
