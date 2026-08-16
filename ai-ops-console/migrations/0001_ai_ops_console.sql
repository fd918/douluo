CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model_id TEXT NOT NULL,
  encrypted_api_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  timeout_ms INTEGER NOT NULL DEFAULT 90000,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_test_status TEXT NOT NULL DEFAULT 'untested',
  last_test_at INTEGER,
  last_test_latency_ms INTEGER,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at INTEGER NOT NULL,
  request_kind TEXT NOT NULL,
  provider_id TEXT,
  provider_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  success INTEGER NOT NULL,
  status_code INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS ai_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
