import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto-store.mjs";
import { recordUsage } from "./database.mjs";

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeBaseUrl(value) {
  const baseUrl = cleanText(value).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("接口地址只支持 HTTP 或 HTTPS");
  return baseUrl;
}

export function listProviders(db, masterKey) {
  return db.prepare("SELECT * FROM ai_providers ORDER BY priority ASC, created_at ASC").all().map((row, index) => {
    let secret = "";
    try { secret = decryptSecret(row.encrypted_api_key, masterKey); } catch { secret = ""; }
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      modelId: row.model_id,
      models: [{
        modelId: row.model_id,
        displayName: row.model_id,
        enabled: true,
        isDefault: true,
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
      }],
      apiKeyMasked: maskSecret(secret),
      hasApiKey: Boolean(secret),
      enabled: Boolean(row.enabled),
      priority: Number(row.priority),
      role: row.enabled ? (index === 0 ? "primary" : "fallback") : "disabled",
      timeoutMs: Number(row.timeout_ms),
      lastTestStatus: row.last_test_status,
      lastTestAt: row.last_test_at,
      lastTestLatencyMs: row.last_test_latency_ms,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function getEnabledProviders(db, masterKey) {
  return db.prepare("SELECT * FROM ai_providers WHERE enabled = 1 AND encrypted_api_key IS NOT NULL ORDER BY priority ASC, created_at ASC").all().flatMap((row) => {
    try {
      const apiKey = decryptSecret(row.encrypted_api_key, masterKey);
      return apiKey ? [{
        id: row.id, name: row.name, baseUrl: row.base_url, modelId: row.model_id,
        apiKey, timeoutMs: row.timeout_ms, priority: row.priority,
      }] : [];
    } catch {
      return [];
    }
  });
}

export function saveProvider(db, masterKey, input, providerId = null) {
  const now = Date.now();
  const name = cleanText(input.name, 80);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const modelId = cleanText(input.modelId, 160);
  const timeoutMs = Math.max(1000, Math.min(120000, Number(input.timeoutMs) || 90000));
  if (!name) throw new Error("请填写服务商名称");
  if (!modelId) throw new Error("请填写模型 ID");

  if (providerId) {
    const current = db.prepare("SELECT * FROM ai_providers WHERE id = ?").get(providerId);
    if (!current) throw new Error("服务商不存在");
    const encryptedApiKey = cleanText(input.apiKey, 2000)
      ? encryptSecret(cleanText(input.apiKey, 2000), masterKey)
      : current.encrypted_api_key;
    db.prepare(`UPDATE ai_providers SET name = ?, base_url = ?, model_id = ?, encrypted_api_key = ?,
      timeout_ms = ?, enabled = ?, updated_at = ? WHERE id = ?`).run(
      name, baseUrl, modelId, encryptedApiKey, timeoutMs,
      input.enabled === false ? 0 : current.enabled, now, providerId,
    );
    return providerId;
  }

  const id = randomUUID();
  const priority = Number(db.prepare("SELECT COALESCE(MAX(priority), 0) + 10 AS next_priority FROM ai_providers").get().next_priority);
  const apiKey = cleanText(input.apiKey, 2000);
  db.prepare(`INSERT INTO ai_providers (
    id, name, base_url, model_id, encrypted_api_key, enabled, priority, timeout_ms, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, name, baseUrl, modelId, apiKey ? encryptSecret(apiKey, masterKey) : null,
    input.enabled === false ? 0 : 1, priority, timeoutMs, now, now,
  );
  return id;
}

export function setProviderEnabled(db, providerId, enabled) {
  const provider = db.prepare("SELECT encrypted_api_key FROM ai_providers WHERE id = ?").get(providerId);
  if (!provider) throw new Error("服务商不存在");
  if (enabled && !provider.encrypted_api_key) throw new Error("请先填写该服务商的 API 密钥");
  db.prepare("UPDATE ai_providers SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, Date.now(), providerId);
}

export function makeProviderPrimary(db, providerId) {
  const provider = db.prepare("SELECT encrypted_api_key FROM ai_providers WHERE id = ?").get(providerId);
  if (!provider) throw new Error("服务商不存在");
  if (!provider.encrypted_api_key) throw new Error("请先填写该服务商的 API 密钥");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE ai_providers SET priority = priority + 10 WHERE id != ?").run(providerId);
    db.prepare("UPDATE ai_providers SET priority = 0, enabled = 1, updated_at = ? WHERE id = ?").run(Date.now(), providerId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function inferRequestKind(body, headers) {
  const explicit = cleanText(headers?.get?.("x-ai-request-kind"), 30);
  if (explicit) return explicit;
  const systemText = Array.isArray(body?.messages)
    ? body.messages.filter((item) => item?.role === "system").map((item) => item?.content ?? "").join(" ")
    : "";
  if (systemText.includes("世界导演")) return "world";
  if (systemText.includes("长期记忆压缩器") || systemText.includes("压缩后的阶段剧情摘要")) return "summary";
  if (systemText.includes("正在扮演") || systemText.includes("沉浸式角色对话")) return "dialogue";
  if (systemText.includes("剧情引擎")) return "action";
  return "chat";
}

async function requestProvider(provider, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...body, model: provider.modelId, stream: false }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { error: { message: text.slice(0, 500) || "服务商返回了非 JSON 数据" } }; }
    return { response, payload, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    const message = error?.name === "AbortError" ? `请求超过 ${provider.timeoutMs} 毫秒` : (error?.message || "网络请求失败");
    return { response: null, payload: { error: { message } }, latencyMs: Math.round(performance.now() - startedAt), error };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testProvider(db, masterKey, providerId) {
  const provider = getEnabledProviders(db, masterKey).find((item) => item.id === providerId)
    ?? (() => {
      const row = db.prepare("SELECT * FROM ai_providers WHERE id = ?").get(providerId);
      if (!row) return null;
      const apiKey = decryptSecret(row.encrypted_api_key, masterKey);
      return { id: row.id, name: row.name, baseUrl: row.base_url, modelId: row.model_id, apiKey, timeoutMs: row.timeout_ms };
    })();
  if (!provider?.apiKey) throw new Error("请先填写 API 密钥");
  const result = await requestProvider(provider, {
    messages: [{ role: "user", content: "请只回复：连接正常" }],
    max_tokens: 32,
    temperature: 0,
    enable_thinking: false,
  });
  const success = Boolean(result.response?.ok && result.payload?.choices?.[0]?.message?.content);
  const errorMessage = success ? null : cleanText(result.payload?.error?.message || "返回内容不完整", 500);
  db.prepare(`UPDATE ai_providers SET last_test_status = ?, last_test_at = ?, last_test_latency_ms = ?, last_error = ?, updated_at = ? WHERE id = ?`).run(
    success ? "healthy" : "error", Date.now(), result.latencyMs, errorMessage, Date.now(), providerId,
  );
  recordUsage(db, {
    requestKind: "health_check", providerId, providerName: provider.name, modelId: provider.modelId,
    success, statusCode: result.response?.status ?? 0,
    promptTokens: result.payload?.usage?.prompt_tokens ?? 0,
    completionTokens: result.payload?.usage?.completion_tokens ?? 0,
    totalTokens: result.payload?.usage?.total_tokens ?? 0,
    latencyMs: result.latencyMs, errorCode: success ? null : "PROVIDER_TEST_FAILED", errorMessage,
  });
  return { success, latencyMs: result.latencyMs, message: success ? "连接成功" : errorMessage };
}

export async function routeChatCompletion({ db, masterKey, body, headers, settings }) {
  const providers = getEnabledProviders(db, masterKey);
  if (!providers.length) {
    return { status: 503, body: { error: { message: "暂无已启用且已配置密钥的 AI 服务商", code: "NO_ACTIVE_PROVIDER" } } };
  }
  const requestKind = inferRequestKind(body, headers);
  const attempts = settings.autoFallback ? providers : providers.slice(0, 1);
  let lastError = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const provider = attempts[index];
    const result = await requestProvider(provider, body);
    const success = Boolean(result.response?.ok && result.payload?.choices?.length);
    const errorMessage = success ? null : cleanText(result.payload?.error?.message || `HTTP ${result.response?.status ?? 0}`, 500);
    recordUsage(db, {
      requestKind, providerId: provider.id, providerName: provider.name, modelId: provider.modelId,
      success, statusCode: result.response?.status ?? 0,
      promptTokens: result.payload?.usage?.prompt_tokens ?? 0,
      completionTokens: result.payload?.usage?.completion_tokens ?? 0,
      totalTokens: result.payload?.usage?.total_tokens ?? 0,
      latencyMs: result.latencyMs, attemptNo: index + 1, fallbackUsed: index > 0,
      errorCode: success ? null : (result.response ? `UPSTREAM_${result.response.status}` : "UPSTREAM_NETWORK_ERROR"),
      errorMessage,
    });
    db.prepare("UPDATE ai_providers SET last_test_status = ?, last_test_at = ?, last_test_latency_ms = ?, last_error = ? WHERE id = ?").run(
      success ? "healthy" : "error", Date.now(), result.latencyMs, errorMessage, provider.id,
    );
    if (success) {
      return {
        status: result.response.status,
        body: result.payload,
        headers: { "x-ai-provider": provider.name, "x-ai-fallback-used": index > 0 ? "1" : "0" },
      };
    }
    lastError = { message: errorMessage, code: `UPSTREAM_${result.response?.status ?? "ERROR"}` };
  }

  return { status: 502, body: { error: { message: lastError?.message || "所有 AI 服务均暂时不可用", code: lastError?.code || "ALL_PROVIDERS_FAILED" } } };
}
