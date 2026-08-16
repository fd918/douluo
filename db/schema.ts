/**
 * Sites D1 schema for durable AI request budgets.
 *
 * The Worker also creates this table defensively at runtime so a fresh binding
 * can serve traffic before a manual migration is run. Keep this definition and
 * drizzle/0001_ai_request_budgets.sql in sync with worker/ai-core.js.
 */
export const createAiRequestBudgetsTableSql = `
  CREATE TABLE IF NOT EXISTS ai_request_budgets (
    client_key TEXT PRIMARY KEY NOT NULL,
    minute_key TEXT NOT NULL,
    minute_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
    day_key TEXT NOT NULL,
    day_count INTEGER NOT NULL DEFAULT 0 CHECK (day_count >= 0),
    touched_at INTEGER NOT NULL
  )
`;

/**
 * 公网 AI 运营中台的服务商、模型价格、策略和调用记录。
 * 完整结构以 drizzle/0002_ai_ops_cloud.sql 为准。真实密钥只存密文，
 * 调用记录只保存运营指标，不保存剧情文本和原始来源地址。
 */
export const aiOpsCloudTables = [
  "ai_providers",
  "ai_provider_models",
  "ai_ops_settings",
  "ai_usage_events",
] as const;
