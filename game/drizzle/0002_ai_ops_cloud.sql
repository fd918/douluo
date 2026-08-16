CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  encrypted_api_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  priority INTEGER NOT NULL DEFAULT 0,
  timeout_ms INTEGER NOT NULL DEFAULT 90000,
  last_test_status TEXT NOT NULL DEFAULT 'untested',
  last_test_at INTEGER,
  last_test_latency_ms INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled_priority ON ai_providers(enabled, priority);

CREATE TABLE IF NOT EXISTS ai_provider_models (
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  input_price_micros_per_million INTEGER NOT NULL DEFAULT 0 CHECK (input_price_micros_per_million >= 0),
  output_price_micros_per_million INTEGER NOT NULL DEFAULT 0 CHECK (output_price_micros_per_million >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(provider_id, model_id),
  FOREIGN KEY(provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_models_default ON ai_provider_models(provider_id, enabled, is_default);

CREATE TABLE IF NOT EXISTS ai_ops_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO ai_ops_settings(key, value, updated_at) VALUES
  ('requests_per_minute', '12', unixepoch() * 1000),
  ('daily_request_limit', '120', unixepoch() * 1000),
  ('auto_fallback', 'true', unixepoch() * 1000),
  ('log_retention_days', '30', unixepoch() * 1000);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at INTEGER NOT NULL,
  request_kind TEXT NOT NULL,
  provider_id TEXT,
  provider_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  status_code INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  fallback_used INTEGER NOT NULL DEFAULT 0 CHECK (fallback_used IN (0, 1)),
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_time ON ai_usage_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider_time ON ai_usage_events(provider_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_success_time ON ai_usage_events(success, occurred_at DESC);
