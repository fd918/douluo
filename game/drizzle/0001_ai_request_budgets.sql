CREATE TABLE IF NOT EXISTS ai_request_budgets (
  client_key TEXT PRIMARY KEY NOT NULL,
  minute_key TEXT NOT NULL,
  minute_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
  day_key TEXT NOT NULL,
  day_count INTEGER NOT NULL DEFAULT 0 CHECK (day_count >= 0),
  touched_at INTEGER NOT NULL
);
