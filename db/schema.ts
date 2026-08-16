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
