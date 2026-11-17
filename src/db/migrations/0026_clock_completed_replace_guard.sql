CREATE TRIGGER clocks_completed_insert_replace_guard
BEFORE INSERT ON clocks
WHEN EXISTS (
  SELECT 1
  FROM clocks
  WHERE id = NEW.id AND status = 'completed'
)
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;

CREATE TRIGGER clocks_completed_update_replace_guard
BEFORE UPDATE ON clocks
WHEN NEW.id <> OLD.id
  AND EXISTS (
    SELECT 1
    FROM clocks
    WHERE id = NEW.id AND status = 'completed'
  )
BEGIN
  SELECT RAISE(ABORT, 'completed_clock_immutable');
END;
