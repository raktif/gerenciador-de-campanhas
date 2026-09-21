CREATE TRIGGER inbox_items_session_insert_guard
BEFORE INSERT ON inbox_items
WHEN NEW.session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sessions
    WHERE sessions.id = NEW.session_id
      AND sessions.campaign_id = NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'INBOX_SESSION_CAMPAIGN_MISMATCH');
END;

CREATE TRIGGER inbox_items_session_update_guard
BEFORE UPDATE OF campaign_id, session_id ON inbox_items
WHEN NEW.session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sessions
    WHERE sessions.id = NEW.session_id
      AND sessions.campaign_id = NEW.campaign_id
  )
BEGIN
  SELECT RAISE(ABORT, 'INBOX_SESSION_CAMPAIGN_MISMATCH');
END;
