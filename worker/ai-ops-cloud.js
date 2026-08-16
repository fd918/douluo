const DEFAULT_TIMEOUT_MS = 90000;
const MAX_TIMEOUT_MS = 120000;
const schemaPromises = new WeakMap();

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ai_request_budgets (
    client_key TEXT PRIMARY KEY NOT NULL,
    minute_key TEXT NOT NULL,
    minute_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
    day_key TEXT NOT NULL,
    day_count INTEGER NOT NULL DEFAULT 0 CHECK (day_count >= 0),
    touched_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_providers (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled_priority ON ai_providers(enabled, priority)`,
  `CREATE TABLE IF NOT EXISTS ai_provider_models (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_provider_models_default ON ai_provider_models(provider_id, enabled, is_default)`,
  `CREATE TABLE IF NOT EXISTS ai_ops_settings (
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
];

const DEFAULT_SETTINGS = {
  requests_per_minute: "12",
  daily_request_limit: "120",
  auto_fallback: "true",
  log_retention_days: "30",
};

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
}

function clampMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1_000_000, number)) : 0;
}

function normalizeBaseUrl(value) {
  const baseUrl = cleanText(value, 500).replace(/\/+$/, "");
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("接口地址只支持 HTTP 或 HTTPS");
  return baseUrl;
}

function bytesToBase64(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function getEncryptionKey(secret) {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(plaintext, masterSecret) {
  if (!plaintext) return null;
  if (!masterSecret) throw new Error("云端密钥加密主密钥尚未配置");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(masterSecret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptSecret(payload, masterSecret) {
  if (!payload) return "";
  if (!masterSecret) throw new Error("云端密钥加密主密钥尚未配置");
  const [version, ivText, encryptedText] = String(payload).split(".");
  if (version !== "v1" || !ivText || !encryptedText) throw new Error("服务商密钥格式无效");
  const key = await getEncryptionKey(masterSecret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivText) },
    key,
    base64ToBytes(encryptedText),
  );
  return new TextDecoder().decode(decrypted);
}

function maskSecret(secret) {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 3)}••••••••${secret.slice(-4)}`;
}

async function all(db, sql, values = []) {
  const result = await db.prepare(sql).bind(...values).all();
  return result?.results ?? [];
}

async function first(db, sql, values = []) {
  return db.prepare(sql).bind(...values).first();
}

async function run(db, sql, values = []) {
  return db.prepare(sql).bind(...values).run();
}

export async function ensureCloudSchema(db) {
  if (!db?.prepare) throw new Error("D1 数据库尚未绑定");
  let pending = schemaPromises.get(db);
  if (!pending) {
    pending = (async () => {
      for (const statement of SCHEMA) await db.prepare(statement).run();
      const now = Date.now();
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await run(db, "INSERT OR IGNORE INTO ai_ops_settings(key, value, updated_at) VALUES(?, ?, ?)", [key, value, now]);
      }
    })().catch((error) => {
      schemaPromises.delete(db);
      throw error;
    });
    schemaPromises.set(db, pending);
  }
  await pending;
}

async function readSettings(db, env = {}) {
  const rows = await all(db, "SELECT key, value FROM ai_ops_settings");
  const values = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  return {
    requestsPerMinute: clampInteger(values.requests_per_minute ?? env.AI_REQUESTS_PER_MINUTE, 1, 120, 12),
    dailyRequestLimit: clampInteger(values.daily_request_limit ?? env.AI_DAILY_REQUEST_LIMIT, 1, 100000, 120),
    autoFallback: values.auto_fallback !== "false",
    logRetentionDays: clampInteger(values.log_retention_days, 1, 365, 30),
  };
}

async function writeSettings(db, input) {
  const values = {
    requests_per_minute: String(clampInteger(input.requestsPerMinute, 1, 120, 12)),
    daily_request_limit: String(clampInteger(input.dailyRequestLimit, 1, 100000, 120)),
    auto_fallback: input.autoFallback === false ? "false" : "true",
    log_retention_days: String(clampInteger(input.logRetentionDays, 1, 365, 30)),
  };
  const now = Date.now();
  for (const [key, value] of Object.entries(values)) {
    await run(db, `INSERT INTO ai_ops_settings(key, value, updated_at) VALUES(?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [key, value, now]);
  }
  return readSettings(db);
}

function normalizeModels(input, fallbackModelId = "") {
  const source = Array.isArray(input) ? input : [];
  const seen = new Set();
  const models = source.flatMap((item) => {
    const modelId = cleanText(item?.modelId ?? item?.id, 200);
    if (!modelId || seen.has(modelId)) return [];
    seen.add(modelId);
    return [{
      modelId,
      displayName: cleanText(item?.displayName, 160) || modelId,
      enabled: item?.enabled !== false,
      isDefault: Boolean(item?.isDefault),
      inputPricePerMillion: clampMoney(item?.inputPricePerMillion),
      outputPricePerMillion: clampMoney(item?.outputPricePerMillion),
    }];
  });
  if (!models.length && fallbackModelId) {
    models.push({ modelId: fallbackModelId, displayName: fallbackModelId, enabled: true, isDefault: true, inputPricePerMillion: 0, outputPricePerMillion: 0 });
  }
  const enabled = models.filter((model) => model.enabled);
  if (enabled.length && !enabled.some((model) => model.isDefault)) enabled[0].isDefault = true;
  let foundDefault = false;
  for (const model of models) {
    if (!model.enabled) model.isDefault = false;
    if (model.isDefault && foundDefault) model.isDefault = false;
    if (model.isDefault) foundDefault = true;
  }
  return models;
}

async function replaceModels(db, providerId, models) {
  const now = Date.now();
  const keep = new Set(models.map((model) => model.modelId));
  const existing = await all(db, "SELECT model_id FROM ai_provider_models WHERE provider_id = ?", [providerId]);
  for (const row of existing) {
    if (!keep.has(row.model_id)) await run(db, "DELETE FROM ai_provider_models WHERE provider_id = ? AND model_id = ?", [providerId, row.model_id]);
  }
  for (const model of models) {
    await run(db, `INSERT INTO ai_provider_models (
      provider_id, model_id, display_name, enabled, is_default,
      input_price_micros_per_million, output_price_micros_per_million, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id, model_id) DO UPDATE SET
      display_name = excluded.display_name,
      enabled = excluded.enabled,
      is_default = excluded.is_default,
      input_price_micros_per_million = excluded.input_price_micros_per_million,
      output_price_micros_per_million = excluded.output_price_micros_per_million,
      updated_at = excluded.updated_at`, [
      providerId, model.modelId, model.displayName, model.enabled ? 1 : 0, model.isDefault ? 1 : 0,
      Math.round(model.inputPricePerMillion * 1_000_000), Math.round(model.outputPricePerMillion * 1_000_000), now, now,
    ]);
  }
}

async function listModels(db, providerId) {
  const rows = await all(db, `SELECT model_id, display_name, enabled, is_default,
    input_price_micros_per_million, output_price_micros_per_million
    FROM ai_provider_models WHERE provider_id = ? ORDER BY is_default DESC, model_id ASC`, [providerId]);
  return rows.map((row) => ({
    modelId: row.model_id,
    displayName: row.display_name,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    inputPricePerMillion: Number(row.input_price_micros_per_million ?? 0) / 1_000_000,
    outputPricePerMillion: Number(row.output_price_micros_per_million ?? 0) / 1_000_000,
  }));
}

async function listProviders(db, masterSecret, includeSecret = false) {
  const rows = await all(db, "SELECT * FROM ai_providers ORDER BY priority ASC, created_at ASC");
  let enabledIndex = 0;
  const output = [];
  for (const row of rows) {
    const models = await listModels(db, row.id);
    const selectedModel = models.find((model) => model.isDefault && model.enabled) ?? models.find((model) => model.enabled) ?? models[0] ?? null;
    let apiKey = "";
    if (includeSecret && row.encrypted_api_key) apiKey = await decryptSecret(row.encrypted_api_key, masterSecret);
    let masked = "";
    if (!includeSecret && row.encrypted_api_key && masterSecret) {
      try { masked = maskSecret(await decryptSecret(row.encrypted_api_key, masterSecret)); } catch { masked = "已加密"; }
    }
    const role = row.enabled ? (enabledIndex++ === 0 ? "primary" : "fallback") : "disabled";
    output.push({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      modelId: selectedModel?.modelId ?? "",
      models,
      apiKey: includeSecret ? apiKey : undefined,
      apiKeyMasked: masked,
      hasApiKey: Boolean(row.encrypted_api_key),
      enabled: Boolean(row.enabled),
      priority: Number(row.priority),
      role,
      timeoutMs: Number(row.timeout_ms),
      lastTestStatus: row.last_test_status,
      lastTestAt: row.last_test_at,
      lastTestLatencyMs: row.last_test_latency_ms,
      lastError: row.last_error,
    });
  }
  return output;
}

async function saveProvider(db, masterSecret, input, providerId = null) {
  const now = Date.now();
  const id = providerId || cleanText(input.id, 120) || crypto.randomUUID();
  const name = cleanText(input.name, 80);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const timeoutMs = clampInteger(input.timeoutMs, 1000, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const models = normalizeModels(input.models, cleanText(input.modelId, 200));
  if (!name) throw new Error("请填写服务商名称");
  if (!models.length) throw new Error("请至少添加一个模型");
  if (providerId) {
    const current = await first(db, "SELECT * FROM ai_providers WHERE id = ?", [providerId]);
    if (!current) throw new Error("服务商不存在");
    const apiKey = cleanText(input.apiKey, 2000);
    const encryptedApiKey = apiKey ? await encryptSecret(apiKey, masterSecret) : current.encrypted_api_key;
    await run(db, `UPDATE ai_providers SET name = ?, base_url = ?, encrypted_api_key = ?, timeout_ms = ?,
      enabled = ?, updated_at = ? WHERE id = ?`, [name, baseUrl, encryptedApiKey, timeoutMs, input.enabled === false ? 0 : current.enabled, now, providerId]);
  } else {
    const next = await first(db, "SELECT COALESCE(MAX(priority), -10) + 10 AS next_priority FROM ai_providers");
    const apiKey = cleanText(input.apiKey, 2000);
    await run(db, `INSERT INTO ai_providers (
      id, name, base_url, encrypted_api_key, enabled, priority, timeout_ms, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id, name, baseUrl, apiKey ? await encryptSecret(apiKey, masterSecret) : null,
      input.enabled === false ? 0 : 1, Number(next?.next_priority ?? 0), timeoutMs, now, now,
    ]);
  }
  await replaceModels(db, id, models);
  return id;
}

async function setProviderEnabled(db, providerId, enabled) {
  const provider = await first(db, "SELECT encrypted_api_key FROM ai_providers WHERE id = ?", [providerId]);
  if (!provider) throw new Error("服务商不存在");
  if (enabled && !provider.encrypted_api_key) throw new Error("请先填写该服务商的 API 密钥");
  await run(db, "UPDATE ai_providers SET enabled = ?, updated_at = ? WHERE id = ?", [enabled ? 1 : 0, Date.now(), providerId]);
}

async function makeProviderPrimary(db, providerId) {
  const provider = await first(db, "SELECT encrypted_api_key FROM ai_providers WHERE id = ?", [providerId]);
  if (!provider) throw new Error("服务商不存在");
  if (!provider.encrypted_api_key) throw new Error("请先填写该服务商的 API 密钥");
  await run(db, "UPDATE ai_providers SET priority = priority + 10 WHERE id != ?", [providerId]);
  await run(db, "UPDATE ai_providers SET priority = 0, enabled = 1, updated_at = ? WHERE id = ?", [Date.now(), providerId]);
}

async function requestProvider(provider, body, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${provider.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, model: provider.modelId, stream: false }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); } catch { payload = { error: { message: raw.slice(0, 500) || "服务商返回了非 JSON 数据" } }; }
    return { response, payload, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const message = error?.name === "AbortError" ? `请求超过 ${provider.timeoutMs} 毫秒` : cleanText(error?.message, 500) || "网络请求失败";
    return { response: null, payload: { error: { message } }, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function updateHealth(db, providerId, success, latencyMs, errorMessage) {
  await run(db, `UPDATE ai_providers SET last_test_status = ?, last_test_at = ?, last_test_latency_ms = ?,
    last_error = ?, updated_at = ? WHERE id = ?`, [success ? "healthy" : "error", Date.now(), latencyMs, errorMessage, Date.now(), providerId]);
}

async function calculateCostMicros(provider, promptTokens, completionTokens) {
  const model = provider.models.find((item) => item.modelId === provider.modelId) ?? provider.models[0];
  const inputPriceMicros = Math.round((model?.inputPricePerMillion ?? 0) * 1_000_000);
  const outputPriceMicros = Math.round((model?.outputPricePerMillion ?? 0) * 1_000_000);
  return Math.round((promptTokens * inputPriceMicros + completionTokens * outputPriceMicros) / 1_000_000);
}

export async function recordCloudAttempt(db, event) {
  const promptTokens = clampInteger(event.promptTokens, 0, 100_000_000, 0);
  const completionTokens = clampInteger(event.completionTokens, 0, 100_000_000, 0);
  const totalTokens = clampInteger(event.totalTokens, 0, 200_000_000, promptTokens + completionTokens);
  const estimatedCostMicros = event.estimatedCostMicros ?? await calculateCostMicros(event.provider, promptTokens, completionTokens);
  await run(db, `INSERT INTO ai_usage_events (
    occurred_at, request_kind, provider_id, provider_name, model_id, success, status_code,
    prompt_tokens, completion_tokens, total_tokens, estimated_cost_micros, latency_ms,
    attempt_no, fallback_used, error_code, error_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    event.occurredAt ?? Date.now(), cleanText(event.requestKind, 40) || "unknown", event.provider?.id ?? null,
    cleanText(event.provider?.name, 80) || "未知服务", cleanText(event.modelId ?? event.provider?.modelId, 200) || "unknown",
    event.success ? 1 : 0, event.statusCode ?? null, promptTokens, completionTokens, totalTokens,
    Math.max(0, Math.round(estimatedCostMicros)), clampInteger(event.latencyMs, 0, 600_000, 0),
    clampInteger(event.attemptNo, 1, 20, 1), event.fallbackUsed ? 1 : 0,
    cleanText(event.errorCode, 80) || null, cleanText(event.errorMessage, 500) || null,
  ]);
  await updateHealth(db, event.provider.id, event.success, event.latencyMs ?? 0, event.success ? null : cleanText(event.errorMessage, 500));
}

async function bootstrapEnvironmentProviders(env) {
  const db = env.DB;
  const count = await first(db, "SELECT COUNT(*) AS count FROM ai_providers");
  if (Number(count?.count ?? 0) > 0) return;
  const seeds = [
    {
      id: "environment-primary",
      name: (() => { try { return new URL(env.AI_BASE_URL).host.includes("agnes-ai.com") ? "Agnes AI" : "原有主服务"; } catch { return "原有主服务"; } })(),
      baseUrl: env.AI_BASE_URL,
      modelId: env.AI_MODEL_ID,
      apiKey: env.AI_API_KEY,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    },
    {
      id: "environment-fallback",
      name: "原有备用服务",
      baseUrl: env.AI_FALLBACK_BASE_URL,
      modelId: env.AI_FALLBACK_MODEL_ID,
      apiKey: env.AI_FALLBACK_API_KEY,
      timeoutMs: env.AI_FALLBACK_REQUEST_TIMEOUT_MS,
    },
  ].filter((item) => cleanText(item.baseUrl, 500) && cleanText(item.modelId, 200) && cleanText(item.apiKey, 2000));
  for (const seed of seeds) {
    await saveProvider(db, env.AI_CONFIG_MASTER_KEY, {
      ...seed,
      models: [{ modelId: seed.modelId, displayName: seed.modelId, enabled: true, isDefault: true, inputPricePerMillion: 0, outputPricePerMillion: 0 }],
      enabled: true,
    });
  }
}

export async function getCloudRuntime(env) {
  if (!env?.DB?.prepare || !env?.AI_CONFIG_MASTER_KEY) return null;
  await ensureCloudSchema(env.DB);
  await bootstrapEnvironmentProviders(env);
  const providers = (await listProviders(env.DB, env.AI_CONFIG_MASTER_KEY, true))
    .filter((provider) => provider.enabled && provider.hasApiKey && provider.modelId)
    .map((provider, index) => ({
      ...provider,
      model: provider.modelId,
      label: index === 0 ? "primary" : "fallback",
    }));
  const settings = await readSettings(env.DB, env);
  return {
    providers: settings.autoFallback ? providers : providers.slice(0, 1),
    settings,
    async onAttempt(event) {
      try { await recordCloudAttempt(env.DB, event); } catch { /* 统计故障不阻塞游戏 */ }
    },
  };
}

async function testProvider(db, masterSecret, providerId, fetchImpl = fetch) {
  const provider = (await listProviders(db, masterSecret, true)).find((item) => item.id === providerId);
  if (!provider?.apiKey) throw new Error("请先填写 API 密钥");
  if (!provider.modelId) throw new Error("请先选择默认模型");
  const result = await requestProvider(provider, {
    messages: [{ role: "user", content: "请只回复：连接正常" }],
    max_tokens: 32,
    temperature: 0,
    enable_thinking: false,
  }, fetchImpl);
  const success = Boolean(result.response?.ok && result.payload?.choices?.[0]?.message?.content);
  const errorMessage = success ? null : cleanText(result.payload?.error?.message, 500) || "返回内容不完整";
  await recordCloudAttempt(db, {
    provider, requestKind: "health_check", success, statusCode: result.response?.status ?? 0,
    promptTokens: result.payload?.usage?.prompt_tokens ?? 0,
    completionTokens: result.payload?.usage?.completion_tokens ?? 0,
    totalTokens: result.payload?.usage?.total_tokens ?? 0,
    latencyMs: result.latencyMs,
    errorCode: success ? null : "PROVIDER_TEST_FAILED",
    errorMessage,
  });
  return { success, latencyMs: result.latencyMs, message: success ? "连接成功" : errorMessage };
}

async function discoverModels(db, masterSecret, providerId, fetchImpl = fetch) {
  const provider = (await listProviders(db, masterSecret, true)).find((item) => item.id === providerId);
  if (!provider?.apiKey) throw new Error("请先填写 API 密钥并保存服务商");
  const response = await fetchImpl(`${provider.baseUrl}/models`, {
    headers: { authorization: `Bearer ${provider.apiKey}`, accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(cleanText(payload?.error?.message, 300) || `模型列表读取失败（HTTP ${response.status}）`);
  const discovered = Array.isArray(payload?.data) ? payload.data.map((item) => cleanText(item?.id, 200)).filter(Boolean) : [];
  if (!discovered.length) throw new Error("服务商没有返回可用模型；你仍可手动填写模型 ID");
  const current = provider.models;
  const currentIds = new Set(current.map((model) => model.modelId));
  const merged = [...current, ...discovered.filter((modelId) => !currentIds.has(modelId)).map((modelId) => ({
    modelId, displayName: modelId, enabled: true, isDefault: current.length === 0,
    inputPricePerMillion: 0, outputPricePerMillion: 0,
  }))];
  await replaceModels(db, providerId, normalizeModels(merged));
  return listModels(db, providerId);
}

function mapUsage(row) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    requestKind: row.request_kind,
    providerId: row.provider_id,
    providerName: row.provider_name,
    modelId: row.model_id,
    success: Boolean(row.success),
    statusCode: row.status_code,
    promptTokens: Number(row.prompt_tokens ?? 0),
    completionTokens: Number(row.completion_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    estimatedCost: Number(row.estimated_cost_micros ?? 0) / 1_000_000,
    latencyMs: Number(row.latency_ms ?? 0),
    attemptNo: Number(row.attempt_no ?? 1),
    fallbackUsed: Boolean(row.fallback_used),
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

async function listUsage(db, search) {
  const clauses = [];
  const values = [];
  if (search.get("provider")) { clauses.push("provider_id = ?"); values.push(search.get("provider")); }
  if (search.get("status") === "success") clauses.push("success = 1");
  if (search.get("status") === "error") clauses.push("success = 0");
  if (search.get("kind")) { clauses.push("request_kind = ?"); values.push(search.get("kind")); }
  const limit = clampInteger(search.get("limit"), 1, 200, 80);
  values.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return (await all(db, `SELECT * FROM ai_usage_events ${where} ORDER BY occurred_at DESC, id DESC LIMIT ?`, values)).map(mapUsage);
}

async function getOverview(db) {
  const now = Date.now();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const summary = await first(db, `SELECT COUNT(*) AS attempts,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
    SUM(prompt_tokens) AS prompt_tokens,
    SUM(completion_tokens) AS completion_tokens,
    SUM(total_tokens) AS total_tokens,
    SUM(estimated_cost_micros) AS estimated_cost_micros,
    ROUND(AVG(latency_ms)) AS avg_latency_ms,
    SUM(CASE WHEN fallback_used = 1 AND success = 1 THEN 1 ELSE 0 END) AS fallback_successes
    FROM ai_usage_events WHERE occurred_at >= ?`, [today.getTime()]);
  const errors = await first(db, "SELECT COUNT(*) AS count FROM ai_usage_events WHERE success = 0 AND occurred_at >= ?", [now - 86_400_000]);
  const active = await first(db, "SELECT COUNT(*) AS count FROM ai_providers WHERE enabled = 1 AND encrypted_api_key IS NOT NULL");
  const currentMinuteKey = new Date(now).toISOString().slice(0, 16);
  const currentDayKey = new Date(now).toISOString().slice(0, 10);
  const budget = await first(db, `SELECT
    SUM(CASE WHEN minute_key = ? THEN minute_count ELSE 0 END) AS minute_count,
    SUM(CASE WHEN day_key = ? THEN day_count ELSE 0 END) AS day_count FROM ai_request_budgets`, [currentMinuteKey, currentDayKey]);
  const trendRows = await all(db, `SELECT CAST((occurred_at - ?) / 3600000 AS INTEGER) AS bucket,
    COUNT(*) AS attempts, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
    SUM(total_tokens) AS tokens, SUM(estimated_cost_micros) AS cost_micros
    FROM ai_usage_events WHERE occurred_at >= ? GROUP BY bucket ORDER BY bucket`, [now - 23 * 3_600_000, now - 23 * 3_600_000]);
  const trendMap = new Map(trendRows.map((row) => [Number(row.bucket), row]));
  const providerRows = await all(db, `SELECT provider_id, provider_name, COUNT(*) AS attempts,
    SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens,
    SUM(estimated_cost_micros) AS cost_micros
    FROM ai_usage_events WHERE occurred_at >= ? GROUP BY provider_id, provider_name ORDER BY cost_micros DESC`, [today.getTime()]);
  return {
    today: {
      attempts: Number(summary?.attempts ?? 0),
      successes: Number(summary?.successes ?? 0),
      successRate: summary?.attempts ? Math.round(Number(summary.successes) / Number(summary.attempts) * 1000) / 10 : 100,
      promptTokens: Number(summary?.prompt_tokens ?? 0),
      completionTokens: Number(summary?.completion_tokens ?? 0),
      totalTokens: Number(summary?.total_tokens ?? 0),
      estimatedCost: Number(summary?.estimated_cost_micros ?? 0) / 1_000_000,
      avgLatencyMs: Number(summary?.avg_latency_ms ?? 0),
      fallbackSuccesses: Number(summary?.fallback_successes ?? 0),
    },
    errors24h: Number(errors?.count ?? 0),
    activeProviders: Number(active?.count ?? 0),
    budget: { minuteCount: Number(budget?.minute_count ?? 0), dayCount: Number(budget?.day_count ?? 0) },
    trend: Array.from({ length: 24 }, (_, index) => {
      const row = trendMap.get(index);
      const time = new Date(now - (23 - index) * 3_600_000);
      return { label: `${String(time.getHours()).padStart(2, "0")}:00`, attempts: Number(row?.attempts ?? 0), successes: Number(row?.successes ?? 0), tokens: Number(row?.tokens ?? 0), estimatedCost: Number(row?.cost_micros ?? 0) / 1_000_000 };
    }),
    providerBreakdown: providerRows.map((row) => ({
      providerId: row.provider_id, providerName: row.provider_name, attempts: Number(row.attempts ?? 0),
      promptTokens: Number(row.prompt_tokens ?? 0), completionTokens: Number(row.completion_tokens ?? 0),
      estimatedCost: Number(row.cost_micros ?? 0) / 1_000_000,
    })),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function authorized(request, expected) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !provided) return false;
  const [a, b] = await Promise.all([expected, provided].map((value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
  const left = new Uint8Array(a); const right = new Uint8Array(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function readJson(request) {
  try { return await request.json(); } catch { throw new Error("请求内容不是合法 JSON"); }
}

export async function handleOpsRequest(request, env, fetchImpl = fetch) {
  if (!await authorized(request, env.AI_OPS_ADMIN_TOKEN)) return json({ ok: false, error: "中台管理凭证无效", code: "OPS_UNAUTHORIZED" }, 401);
  if (!env?.DB?.prepare) return json({ ok: false, error: "云端数据库尚未绑定", code: "OPS_DB_UNAVAILABLE" }, 503);
  try {
    await ensureCloudSchema(env.DB);
    await bootstrapEnvironmentProviders(env);
    const url = new URL(request.url);
    const providers = () => listProviders(env.DB, env.AI_CONFIG_MASTER_KEY, false);

    if (url.pathname === "/api/ops/health" && request.method === "GET") {
      const list = await providers();
      const primary = list.find((item) => item.role === "primary");
      return json({ ok: true, status: primary?.lastTestStatus === "error" ? "degraded" : primary ? "healthy" : "unconfigured", primaryProvider: primary?.name ?? null, database: "d1", localOnly: false, controlMode: "cloud", uptimeSeconds: 0 });
    }
    if (url.pathname === "/api/ops/overview" && request.method === "GET") return json({ ok: true, data: await getOverview(env.DB), settings: await readSettings(env.DB, env) });
    if (url.pathname === "/api/ops/providers" && request.method === "GET") return json({ ok: true, data: await providers() });
    if (url.pathname === "/api/ops/providers" && request.method === "POST") {
      const providerId = await saveProvider(env.DB, env.AI_CONFIG_MASTER_KEY, await readJson(request));
      return json({ ok: true, providerId, data: await providers() }, 201);
    }
    const match = url.pathname.match(/^\/api\/ops\/providers\/([^/]+)(?:\/(test|primary|enabled|models))?$/);
    if (match) {
      const providerId = decodeURIComponent(match[1]);
      const action = match[2];
      if (!action && request.method === "PUT") await saveProvider(env.DB, env.AI_CONFIG_MASTER_KEY, await readJson(request), providerId);
      else if (action === "primary" && request.method === "PUT") await makeProviderPrimary(env.DB, providerId);
      else if (action === "enabled" && request.method === "PUT") await setProviderEnabled(env.DB, providerId, Boolean((await readJson(request)).enabled));
      else if (action === "test" && request.method === "POST") {
        const result = await testProvider(env.DB, env.AI_CONFIG_MASTER_KEY, providerId, fetchImpl);
        return json({ ok: result.success, ...result, providers: await providers() }, result.success ? 200 : 502);
      } else if (action === "models" && request.method === "POST") {
        return json({ ok: true, data: await discoverModels(env.DB, env.AI_CONFIG_MASTER_KEY, providerId, fetchImpl) });
      } else return json({ ok: false, error: "不支持的中台操作", code: "OPS_METHOD_NOT_ALLOWED" }, 405);
      return json({ ok: true, data: await providers() });
    }
    if (url.pathname === "/api/ops/settings" && request.method === "GET") return json({ ok: true, data: await readSettings(env.DB, env) });
    if (url.pathname === "/api/ops/settings" && request.method === "PUT") return json({ ok: true, data: await writeSettings(env.DB, await readJson(request)) });
    if (url.pathname === "/api/ops/logs" && request.method === "GET") return json({ ok: true, data: await listUsage(env.DB, url.searchParams) });
    return json({ ok: false, error: "中台接口不存在", code: "OPS_ROUTE_NOT_FOUND" }, 404);
  } catch (error) {
    return json({ ok: false, error: cleanText(error?.message, 500) || "中台服务异常", code: "OPS_REQUEST_FAILED" }, 500);
  }
}
