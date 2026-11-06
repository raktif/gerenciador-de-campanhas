CREATE TABLE attachments (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'gm',
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  thumbnail_relative_path TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_url TEXT,
  processed_mime_type TEXT NOT NULL,
  processing_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CHECK (
    length(id) = 36
    AND substr(id, 9, 1) = '-'
    AND substr(id, 14, 1) = '-'
    AND substr(id, 19, 1) = '-'
    AND substr(id, 24, 1) = '-'
    AND id = lower(id)
    AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'
  ),
  CHECK (length(trim(original_filename)) BETWEEN 1 AND 255),
  CHECK (
    length(stored_filename) BETWEEN 1 AND 255
    AND stored_filename = lower(stored_filename)
    AND substr(stored_filename, 1, 1) GLOB '[a-z0-9]'
    AND substr(stored_filename, -1, 1) GLOB '[a-z0-9]'
    AND stored_filename NOT GLOB '*[^a-z0-9._-]*'
    AND stored_filename NOT IN ('.', '..')
  ),
  CHECK (
    length(relative_path) BETWEEN 1 AND 1000
    AND relative_path = lower(relative_path)
    AND substr(relative_path, 1, 1) GLOB '[a-z0-9]'
    AND substr(relative_path, -1, 1) GLOB '[a-z0-9]'
    AND relative_path NOT GLOB '*[^a-z0-9._/-]*'
    AND instr(relative_path, '//') = 0
    AND relative_path NOT LIKE './%'
    AND relative_path NOT LIKE '../%'
    AND relative_path NOT LIKE '%/./%'
    AND relative_path NOT LIKE '%/../%'
    AND relative_path NOT LIKE '%/.'
    AND relative_path NOT LIKE '%/..'
  ),
  CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  CHECK (file_size BETWEEN 1 AND 10485760),
  CHECK (
    length(checksum_sha256) = 64
    AND checksum_sha256 = lower(checksum_sha256)
    AND checksum_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  CHECK (visibility IN ('gm', 'players', 'public')),
  CHECK (width BETWEEN 1 AND 1280),
  CHECK (height BETWEEN 1 AND 1024),
  CHECK (
    length(thumbnail_relative_path) BETWEEN 1 AND 1000
    AND thumbnail_relative_path = lower(thumbnail_relative_path)
    AND substr(thumbnail_relative_path, 1, 1) GLOB '[a-z0-9]'
    AND substr(thumbnail_relative_path, -1, 1) GLOB '[a-z0-9]'
    AND thumbnail_relative_path NOT GLOB '*[^a-z0-9._/-]*'
    AND instr(thumbnail_relative_path, '//') = 0
    AND thumbnail_relative_path NOT LIKE './%'
    AND thumbnail_relative_path NOT LIKE '../%'
    AND thumbnail_relative_path NOT LIKE '%/./%'
    AND thumbnail_relative_path NOT LIKE '%/../%'
    AND thumbnail_relative_path NOT LIKE '%/.'
    AND thumbnail_relative_path NOT LIKE '%/..'
  ),
  CHECK (thumbnail_relative_path <> relative_path),
  CHECK (source_kind IN ('file', 'url', 'clipboard', 'drag_drop')),
  CHECK (source_url IS NULL OR length(trim(source_url)) BETWEEN 1 AND 2048),
  CHECK (
    (source_kind = 'url' AND source_url IS NOT NULL)
    OR (source_kind <> 'url' AND source_url IS NULL)
  ),
  CHECK (processed_mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  CHECK (processing_status IN ('pending', 'ready', 'failed')),
  CHECK (length(created_at) > 0),
  CHECK (length(updated_at) > 0),
  CHECK (revision > 0),
  UNIQUE (stored_filename),
  UNIQUE (relative_path),
  UNIQUE (thumbnail_relative_path)
);

CREATE INDEX attachments_campaign_status_created_idx
  ON attachments (campaign_id, processing_status, created_at DESC, id DESC);

CREATE INDEX attachments_campaign_checksum_idx
  ON attachments (campaign_id, checksum_sha256);

ALTER TABLE campaigns
  ADD COLUMN cover_attachment_id TEXT
  REFERENCES attachments(id) ON DELETE RESTRICT;

CREATE INDEX campaigns_cover_attachment_idx
  ON campaigns (cover_attachment_id)
  WHERE cover_attachment_id IS NOT NULL;

CREATE TRIGGER campaigns_cover_attachment_insert_guard
BEFORE INSERT ON campaigns
WHEN NEW.cover_attachment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM attachments
    WHERE id = NEW.cover_attachment_id
      AND campaign_id = NEW.id
      AND processing_status = 'ready'
  )
BEGIN
  SELECT RAISE(ABORT, 'campaign cover attachment must be ready and belong to the campaign');
END;

CREATE TRIGGER campaigns_cover_attachment_update_guard
BEFORE UPDATE OF cover_attachment_id ON campaigns
WHEN NEW.cover_attachment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM attachments
    WHERE id = NEW.cover_attachment_id
      AND campaign_id = NEW.id
      AND processing_status = 'ready'
  )
BEGIN
  SELECT RAISE(ABORT, 'campaign cover attachment must be ready and belong to the campaign');
END;

CREATE TRIGGER attachments_campaign_immutable
BEFORE UPDATE OF campaign_id ON attachments
WHEN NEW.campaign_id <> OLD.campaign_id
BEGIN
  SELECT RAISE(ABORT, 'attachment campaign cannot be changed');
END;

CREATE TRIGGER attachments_ready_cover_guard
BEFORE UPDATE OF processing_status ON attachments
WHEN NEW.processing_status <> 'ready'
  AND EXISTS (
    SELECT 1
    FROM campaigns
    WHERE cover_attachment_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'a campaign cover attachment must remain ready');
END;
