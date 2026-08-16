import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const migrations = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model_id TEXT NOT NULL,
    encrypted_api_key TEXT,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    priority INTEGER NOT NULL DEFAULT 100,
    timeout_ms INTEGER NOT NULL DEFAULT 90000,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_test_status TEXT NOT NULL DEFAULT 'untested',
    last_test_at INTEGER,
    last_test_latency_ms INTEGER,
    last_error TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_providers_name ON ai_providers(name)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled_priority ON ai_providers(enabled, priority)`,
  `CREATE TABLE IF NOT EXISTS ai_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_usage_events (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_usage_events_time ON ai_usage_events(occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider_time ON ai_usage_events(provider_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_usage_events_success_time ON ai_usage_events(success, occurred_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_request_budgets (
    client_key TEXT PRIMARY KEY NOT NULL,
    minute_key TEXT NOT NULL,
    minute_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
    day_key TEXT NOT NULL,
    day_count INTEGER NOT NULL DEFAULT 0 CHECK (day_count >= 0),
    touched_at INTEGER NOT NULL
  )`,
];

const defaultSettings = {
  requests_per_minute: "12",
  daily_request_limit: "120",
  auto_fallback: "true",
  log_retention_days: "30",
};

export function openDatabase(pathname) {
  mkdirSync(dirname(pathname), { recursive: true });
  const db = new DatabaseSync(pathname);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  for (const statement of migrations) db.prepare(statement).run();
  const usageColumns = new Set(db.prepare("PRAGMA table_info(ai_usage_events)").all().map((column) => column.name));
  if (!usageColumns.has("estimated_cost_micros")) {
    db.exec("ALTER TABLE ai_usage_events ADD COLUMN estimated_cost_micros INTEGER NOT NULL DEFAULT 0");
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)").run(Date.now());
  const upsertSetting = db.prepare("INSERT OR IGNORE INTO ai_settings(key, value, updated_at) VALUES(?, ?, ?)");
  for (const [key, value] of Object.entries(defaultSettings)) upsertSetting.run(key, value, Date.now());
  db.exec("PRAGMA optimize");
  return db;
}

export function readSettings(db) {
  const result = { ...defaultSettings };
  for (const row of db.prepare("SELECT key, value FROM ai_settings").all()) result[row.key] = row.value;
  return {
    requestsPerMinute: Number(result.requests_per_minute),
    dailyRequestLimit: Number(result.daily_request_limit),
    autoFallback: result.auto_fallback === "true",
    logRetentionDays: Number(result.log_retention_days),
  };
}

export function writeSettings(db, settings) {
  const values = {
    requests_per_minute: String(Math.max(1, Math.min(120, Number(settings.requestsPerMinute) || 12))),
    daily_request_limit: String(Math.max(1, Math.min(100000, Number(settings.dailyRequestLimit) || 120))),
    auto_fallback: settings.autoFallback === false ? "false" : "true",
    log_retention_days: String(Math.max(1, Math.min(365, Number(settings.logRetentionDays) || 30))),
  };
  const statement = db.prepare(`INSERT INTO ai_settings(key, value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [key, value] of Object.entries(values)) statement.run(key, value, Date.now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readSettings(db);
}

export function recordUsage(db, event) {
  db.prepare(`INSERT INTO ai_usage_events (
    occurred_at, request_kind, provider_id, provider_name, model_id, success, status_code,
    prompt_tokens, completion_tokens, total_tokens, estimated_cost_micros, latency_ms, attempt_no, fallback_used,
    error_code, error_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    event.occurredAt ?? Date.now(), event.requestKind ?? "unknown", event.providerId ?? null,
    event.providerName ?? "未知服务", event.modelId ?? "unknown", event.success ? 1 : 0,
    event.statusCode ?? null, event.promptTokens ?? 0, event.completionTokens ?? 0,
    event.totalTokens ?? 0, event.estimatedCostMicros ?? 0, event.latencyMs ?? 0, event.attemptNo ?? 1,
    event.fallbackUsed ? 1 : 0, event.errorCode ?? null,
    event.errorMessage ? String(event.errorMessage).slice(0, 500) : null,
  );
}

export function cleanupUsage(db, retentionDays) {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  return db.prepare("DELETE FROM ai_usage_events WHERE occurred_at < ?").run(cutoff).changes;
}

export function getOverview(db) {
  const now = Date.now();
  const nowDate = new Date(now);
  const currentMinuteKey = nowDate.toISOString().slice(0, 16);
  const currentDayKey = nowDate.toISOString().slice(0, 10);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const summary = db.prepare(`SELECT
    COUNT(*) AS attempts,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
    SUM(prompt_tokens) AS prompt_tokens,
    SUM(completion_tokens) AS completion_tokens,
    SUM(total_tokens) AS total_tokens,
    SUM(estimated_cost_micros) AS estimated_cost_micros,
    ROUND(AVG(latency_ms)) AS avg_latency_ms,
    SUM(CASE WHEN fallback_used = 1 AND success = 1 THEN 1 ELSE 0 END) AS fallback_successes
    FROM ai_usage_events WHERE occurred_at >= ?`).get(todayStart.getTime());
  const errors24h = db.prepare("SELECT COUNT(*) AS count FROM ai_usage_events WHERE success = 0 AND occurred_at >= ?").get(now - 86_400_000).count;
  const activeProviders = db.prepare("SELECT COUNT(*) AS count FROM ai_providers WHERE enabled = 1 AND encrypted_api_key IS NOT NULL").get().count;
  const budget = db.prepare(`SELECT
    SUM(CASE WHEN minute_key = ? THEN minute_count ELSE 0 END) AS minute_count,
    SUM(CASE WHEN day_key = ? THEN day_count ELSE 0 END) AS day_count
    FROM ai_request_budgets`).get(currentMinuteKey, currentDayKey);
  const trendRows = db.prepare(`SELECT
    CAST((occurred_at - ?) / 3600000 AS INTEGER) AS bucket,
    COUNT(*) AS attempts,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
    SUM(total_tokens) AS tokens
    FROM ai_usage_events WHERE occurred_at >= ?
    GROUP BY bucket ORDER BY bucket`).all(now - 23 * 3_600_000, now - 23 * 3_600_000);
  const trendMap = new Map(trendRows.map((row) => [Number(row.bucket), row]));
  const providerBreakdown = db.prepare(`SELECT provider_id, provider_name, COUNT(*) AS attempts,
    SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens,
    SUM(estimated_cost_micros) AS estimated_cost_micros
    FROM ai_usage_events WHERE occurred_at >= ? GROUP BY provider_id, provider_name
    ORDER BY estimated_cost_micros DESC`).all(todayStart.getTime()).map((row) => ({
      providerId: row.provider_id,
      providerName: row.provider_name,
      attempts: Number(row.attempts ?? 0),
      promptTokens: Number(row.prompt_tokens ?? 0),
      completionTokens: Number(row.completion_tokens ?? 0),
      estimatedCost: Number(row.estimated_cost_micros ?? 0) / 1_000_000,
    }));
  const trend = Array.from({ length: 24 }, (_, index) => {
    const row = trendMap.get(index);
    const time = new Date(now - (23 - index) * 3_600_000);
    return {
      label: `${String(time.getHours()).padStart(2, "0")}:00`,
      attempts: Number(row?.attempts ?? 0),
      successes: Number(row?.successes ?? 0),
      tokens: Number(row?.tokens ?? 0),
    };
  });
  return {
    today: {
      attempts: Number(summary.attempts ?? 0),
      successes: Number(summary.successes ?? 0),
      successRate: summary.attempts ? Math.round((Number(summary.successes) / Number(summary.attempts)) * 1000) / 10 : 100,
      promptTokens: Number(summary.prompt_tokens ?? 0),
      completionTokens: Number(summary.completion_tokens ?? 0),
      totalTokens: Number(summary.total_tokens ?? 0),
      estimatedCost: Number(summary.estimated_cost_micros ?? 0) / 1_000_000,
      avgLatencyMs: Number(summary.avg_latency_ms ?? 0),
      fallbackSuccesses: Number(summary.fallback_successes ?? 0),
    },
    errors24h: Number(errors24h ?? 0),
    activeProviders: Number(activeProviders ?? 0),
    budget: {
      minuteCount: Number(budget.minute_count ?? 0),
      dayCount: Number(budget.day_count ?? 0),
    },
    trend,
    providerBreakdown,
  };
}

export function listUsage(db, filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.providerId) { clauses.push("provider_id = ?"); params.push(filters.providerId); }
  if (filters.status === "success") clauses.push("success = 1");
  if (filters.status === "error") clauses.push("success = 0");
  if (filters.kind) { clauses.push("request_kind = ?"); params.push(filters.kind); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(200, Number(filters.limit) || 60));
  return db.prepare(`SELECT * FROM ai_usage_events ${where} ORDER BY occurred_at DESC, id DESC LIMIT ?`).all(...params, limit).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    requestKind: row.request_kind,
    providerId: row.provider_id,
    providerName: row.provider_name,
    modelId: row.model_id,
    success: Boolean(row.success),
    statusCode: row.status_code,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    estimatedCost: Number(row.estimated_cost_micros ?? 0) / 1_000_000,
    latencyMs: row.latency_ms,
    attemptNo: row.attempt_no,
    fallbackUsed: Boolean(row.fallback_used),
    errorCode: row.error_code,
    errorMessage: row.error_message,
  }));
}

export function createD1Adapter(db) {
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...nextValues) { values = nextValues; return this; },
        async run() {
          const statement = db.prepare(sql);
          const result = statement.run(...values);
          return { success: true, meta: { changes: result.changes } };
        },
        async first() {
          const statement = db.prepare(sql);
          if (/\bRETURNING\b/i.test(sql)) return statement.get(...values) ?? null;
          return statement.get(...values) ?? null;
        },
      };
    },
  };
}
