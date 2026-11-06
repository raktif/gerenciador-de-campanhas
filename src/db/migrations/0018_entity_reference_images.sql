ALTER TABLE entities
  ADD COLUMN reference_image_attachment_id TEXT
  REFERENCES attachments(id) ON DELETE RESTRICT;

CREATE INDEX entities_reference_image_attachment_idx
  ON entities (reference_image_attachment_id)
  WHERE reference_image_attachment_id IS NOT NULL;

CREATE TRIGGER entities_reference_image_insert_guard
BEFORE INSERT ON entities
WHEN NEW.reference_image_attachment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM attachments
    WHERE id = NEW.reference_image_attachment_id
      AND campaign_id = NEW.campaign_id
      AND processing_status = 'ready'
  )
BEGIN
  SELECT RAISE(ABORT, 'entity reference image must be ready and belong to the campaign');
END;

CREATE TRIGGER entities_reference_image_update_guard
BEFORE UPDATE OF reference_image_attachment_id, campaign_id ON entities
WHEN NEW.reference_image_attachment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM attachments
    WHERE id = NEW.reference_image_attachment_id
      AND campaign_id = NEW.campaign_id
      AND processing_status = 'ready'
  )
BEGIN
  SELECT RAISE(ABORT, 'entity reference image must be ready and belong to the campaign');
END;

DROP TRIGGER attachments_ready_cover_guard;

CREATE TRIGGER attachments_ready_reference_guard
BEFORE UPDATE OF processing_status ON attachments
WHEN NEW.processing_status <> 'ready'
  AND (
    EXISTS (
      SELECT 1 FROM campaigns WHERE cover_attachment_id = OLD.id
    )
    OR EXISTS (
      SELECT 1 FROM entities WHERE reference_image_attachment_id = OLD.id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'a referenced attachment must remain ready');
END;
