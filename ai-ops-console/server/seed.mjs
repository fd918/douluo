import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { encryptSecret } from "./crypto-store.mjs";

function parseEnv(pathname) {
  if (!existsSync(pathname)) return {};
  const result = {};
  for (const line of readFileSync(pathname, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return result;
}

function insertProvider(db, masterKey, provider) {
  if (db.prepare("SELECT id FROM ai_providers WHERE name = ?").get(provider.name)) return;
  const now = Date.now();
  db.prepare(`INSERT INTO ai_providers (
    id, name, base_url, model_id, encrypted_api_key, enabled, priority, timeout_ms,
    created_at, updated_at, last_test_status, last_error
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    randomUUID(), provider.name, provider.baseUrl, provider.modelId,
    provider.apiKey ? encryptSecret(provider.apiKey, masterKey) : null,
    provider.enabled ? 1 : 0, provider.priority, provider.timeoutMs,
    now, now, "untested", provider.error ?? null,
  );
}

export function seedExistingProviders(db, masterKey, gameEnvPath) {
  const env = parseEnv(gameEnvPath);
  if (env.AI_BASE_URL && env.AI_MODEL_ID && env.AI_API_KEY && !env.AI_BASE_URL.includes("127.0.0.1:4180")) {
    const host = (() => { try { return new URL(env.AI_BASE_URL).host; } catch { return ""; } })();
    insertProvider(db, masterKey, {
      name: host.includes("agnes-ai.com") ? "Agnes AI" : "原有主服务",
      baseUrl: env.AI_BASE_URL.replace(/\/+$/, ""), modelId: env.AI_MODEL_ID,
      apiKey: env.AI_API_KEY, enabled: true, priority: 0,
      timeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS) || 90000,
    });
  }
  if (env.AI_FALLBACK_BASE_URL && env.AI_FALLBACK_MODEL_ID && env.AI_FALLBACK_API_KEY) {
    insertProvider(db, masterKey, {
      name: "原有备用服务", baseUrl: env.AI_FALLBACK_BASE_URL.replace(/\/+$/, ""),
      modelId: env.AI_FALLBACK_MODEL_ID, apiKey: env.AI_FALLBACK_API_KEY,
      enabled: true, priority: 10, timeoutMs: Number(env.AI_FALLBACK_REQUEST_TIMEOUT_MS) || 30000,
    });
  }

  insertProvider(db, masterKey, {
    name: "云瞻本机反代", baseUrl: "http://ai.yunzhanos.com:1234/v1",
    modelId: "qwen/qwen3.6-35b-a3b", apiKey: "", enabled: false, priority: 20,
    timeoutMs: 120000, error: "已导入接口地址和模型；需在中台内确认密钥后启用",
  });
}
