CREATE TABLE clocks (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 10000),
  segments_total INTEGER NOT NULL CHECK (
    typeof(segments_total) = 'integer' AND segments_total IN (4, 6, 8, 10, 12)
  ),
  segments_filled INTEGER NOT NULL DEFAULT 0 CHECK (
    typeof(segments_filled) = 'integer' AND segments_filled BETWEEN 0 AND 12
  ),
  clock_type TEXT NOT NULL CHECK (clock_type IN (
    'progress', 'threat', 'countdown', 'project', 'investigation', 'custom'
  )),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (
    typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991
  ),
  CHECK (segments_filled <= segments_total),
  CHECK ((segments_filled = segments_total AND status = 'completed')
      OR (segments_filled < segments_total AND status IN ('active', 'completed')))
);

CREATE INDEX clocks_campaign_status_updated_idx
  ON clocks(campaign_id, status, updated_at DESC, id DESC);
CREATE INDEX clocks_campaign_type_idx
  ON clocks(campaign_id, clock_type, updated_at DESC, id DESC);

CREATE TRIGGER clocks_completed_immutable
BEFORE UPDATE ON clocks
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;

CREATE TRIGGER clocks_records_are_historical
BEFORE DELETE ON clocks
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_is_historical');
END;

CREATE TRIGGER clocks_campaign_id_immutable
BEFORE UPDATE OF campaign_id ON clocks
WHEN NEW.campaign_id <> OLD.campaign_id
BEGIN
  SELECT RAISE(ABORT, 'clock_campaign_immutable');
END;
