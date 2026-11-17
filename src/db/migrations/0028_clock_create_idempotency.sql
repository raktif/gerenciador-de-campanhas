CREATE TABLE clock_create_operations (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  clock_id TEXT NOT NULL UNIQUE REFERENCES clocks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX clock_create_operations_campaign_idx
  ON clock_create_operations(campaign_id, created_at DESC);
