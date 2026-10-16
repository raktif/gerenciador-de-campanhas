ALTER TABLE field_definitions
  ADD COLUMN help_text TEXT
  CHECK (help_text IS NULL OR length(trim(help_text)) BETWEEN 1 AND 2000);

ALTER TABLE field_definitions
  ADD COLUMN example_text TEXT
  CHECK (example_text IS NULL OR length(trim(example_text)) BETWEEN 1 AND 2000);

ALTER TABLE field_definitions
  ADD COLUMN help_article_id TEXT
  CHECK (
    help_article_id IS NULL OR (
      length(help_article_id) BETWEEN 1 AND 120
      AND help_article_id = lower(help_article_id)
      AND help_article_id NOT GLOB '*[^a-z0-9-]*'
      AND substr(help_article_id, 1, 1) <> '-'
      AND substr(help_article_id, -1, 1) <> '-'
      AND instr(help_article_id, '--') = 0
    )
  );
