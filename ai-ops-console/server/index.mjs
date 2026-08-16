import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createServer as createViteServer } from "vite";
import { handleAiRequest } from "../../game/worker/ai-core.js";
import { loadOrCreateMasterKey } from "./crypto-store.mjs";
import { cleanupUsage, createD1Adapter, getOverview, listUsage, openDatabase, readSettings, writeSettings } from "./database.mjs";
import { listProviders, makeProviderPrimary, routeChatCompletion, saveProvider, setProviderEnabled, testProvider } from "./providers.mjs";
import { applyCors, jsonResponse, readJson } from "./http-utils.mjs";
import { seedExistingProviders } from "./seed.mjs";
import { isCloudManagementRequest, loadCloudConfig, proxyCloudManagement } from "./cloud-client.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "..");
const args = new Set(process.argv.slice(2));
const development = args.has("--dev");
const port = Number(process.env.OPS_PORT) || 4180;
const host = process.env.OPS_HOST || "127.0.0.1";
const dataDir = resolve(process.env.OPS_DATA_DIR || join(root, ".data"));
const db = openDatabase(join(dataDir, "ai-ops.sqlite"));
const masterKey = loadOrCreateMasterKey(join(dataDir, "master.key"));
const cloudConfig = loadCloudConfig(root);
seedExistingProviders(db, masterKey, join(repoRoot, "game", ".env.local"));
cleanupUsage(db, readSettings(db).logRetentionDays);

const d1 = createD1Adapter(db);
const vite = development ? await createViteServer({ root, server: { middlewareMode: true }, appType: "spa" }) : null;

function getClientKey(request) {
  const source = request.headers["x-forwarded-for"]?.split(",")[0] || request.socket.remoteAddress || "local";
  return createHash("sha256").update(`douluo-ai-ops:${source}`).digest("hex");
}

function consumeGatewayBudget(request, settings) {
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  const dayKey = now.toISOString().slice(0, 10);
  const result = db.prepare(`INSERT INTO ai_request_budgets (
      client_key, minute_key, minute_count, day_key, day_count, touched_at
    ) VALUES (?, ?, 1, ?, 1, ?)
    ON CONFLICT(client_key) DO UPDATE SET
      minute_key = excluded.minute_key,
      minute_count = CASE WHEN ai_request_budgets.minute_key = excluded.minute_key THEN ai_request_budgets.minute_count + 1 ELSE 1 END,
      day_key = excluded.day_key,
      day_count = CASE WHEN ai_request_budgets.day_key = excluded.day_key THEN ai_request_budgets.day_count + 1 ELSE 1 END,
      touched_at = excluded.touched_at
    WHERE (CASE WHEN ai_request_budgets.minute_key = excluded.minute_key THEN ai_request_budgets.minute_count ELSE 0 END) < ?
      AND (CASE WHEN ai_request_budgets.day_key = excluded.day_key THEN ai_request_budgets.day_count ELSE 0 END) < ?
    RETURNING minute_count, day_count`).get(
      getClientKey(request), minuteKey, dayKey, Date.now(), settings.requestsPerMinute, settings.dailyRequestLimit,
    );
  if (result) return { allowed: true, ...result };
  const current = db.prepare("SELECT minute_key, minute_count, day_key, day_count FROM ai_request_budgets WHERE client_key = ?").get(getClientKey(request));
  const daily = current?.day_key === dayKey ? current.day_count : 0;
  return { allowed: false, code: daily >= settings.dailyRequestLimit ? "AI_DAILY_LIMIT" : "AI_RATE_LIMITED" };
}

async function handleApi(request, response, url) {
  applyCors(request, response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return true; }

  if (isCloudManagementRequest(url.pathname) && cloudConfig.configured) {
    return proxyCloudManagement(request, response, url, cloudConfig);
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    const providers = listProviders(db, masterKey);
    const primary = providers.find((provider) => provider.enabled && provider.hasApiKey);
    jsonResponse(response, 200, {
      ok: true,
      status: primary?.lastTestStatus === "error" ? "degraded" : primary ? "healthy" : "unconfigured",
      primaryProvider: primary?.name ?? null,
      database: "sqlite",
      localOnly: host === "127.0.0.1" || host === "localhost",
      controlMode: "local",
      uptimeSeconds: Math.round(process.uptime()),
    });
    return true;
  }

  if (url.pathname === "/api/overview" && request.method === "GET") {
    jsonResponse(response, 200, { ok: true, data: getOverview(db), settings: readSettings(db) });
    return true;
  }

  if (url.pathname === "/api/providers" && request.method === "GET") {
    jsonResponse(response, 200, { ok: true, data: listProviders(db, masterKey) });
    return true;
  }

  if (url.pathname === "/api/providers" && request.method === "POST") {
    const providerId = saveProvider(db, masterKey, await readJson(request));
    jsonResponse(response, 201, { ok: true, providerId, data: listProviders(db, masterKey) });
    return true;
  }

  const providerMatch = url.pathname.match(/^\/api\/providers\/([^/]+)(?:\/(test|primary|enabled))?$/);
  if (providerMatch && request.method === "PUT") {
    const providerId = decodeURIComponent(providerMatch[1]);
    const action = providerMatch[2];
    const body = await readJson(request);
    if (action === "primary") makeProviderPrimary(db, providerId);
    else if (action === "enabled") setProviderEnabled(db, providerId, Boolean(body.enabled));
    else saveProvider(db, masterKey, body, providerId);
    jsonResponse(response, 200, { ok: true, data: listProviders(db, masterKey) });
    return true;
  }

  if (providerMatch && providerMatch[2] === "test" && request.method === "POST") {
    const result = await testProvider(db, masterKey, decodeURIComponent(providerMatch[1]));
    jsonResponse(response, result.success ? 200 : 502, { ok: result.success, ...result, providers: listProviders(db, masterKey) });
    return true;
  }

  if (url.pathname === "/api/settings" && request.method === "GET") {
    jsonResponse(response, 200, { ok: true, data: readSettings(db) });
    return true;
  }

  if (url.pathname === "/api/settings" && request.method === "PUT") {
    jsonResponse(response, 200, { ok: true, data: writeSettings(db, await readJson(request)) });
    return true;
  }

  if (url.pathname === "/api/logs" && request.method === "GET") {
    jsonResponse(response, 200, { ok: true, data: listUsage(db, {
      providerId: url.searchParams.get("provider") || "",
      status: url.searchParams.get("status") || "",
      kind: url.searchParams.get("kind") || "",
      limit: url.searchParams.get("limit") || "60",
    }) });
    return true;
  }

  if (url.pathname === "/v1/models" && request.method === "GET") {
    const providers = listProviders(db, masterKey).filter((provider) => provider.enabled && provider.hasApiKey);
    jsonResponse(response, 200, { object: "list", data: providers.map((provider) => ({
      id: provider.modelId, object: "model", owned_by: provider.name,
    })) });
    return true;
  }

  if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
    const settings = readSettings(db);
    const isInternalAdapter = request.headers.authorization === "Bearer ops-internal-adapter";
    if (!isInternalAdapter) {
      const budget = consumeGatewayBudget(request, settings);
      if (!budget.allowed) {
        jsonResponse(response, 429, { error: { message: budget.code === "AI_DAILY_LIMIT" ? "今日 AI 额度已用完" : "请求过于频繁", code: budget.code } });
        return true;
      }
    }
    const result = await routeChatCompletion({ db, masterKey, body: await readJson(request), headers: new Headers(request.headers), settings });
    jsonResponse(response, result.status, result.body, result.headers);
    return true;
  }

  if (url.pathname.startsWith("/api/ai/") && ["GET", "POST"].includes(request.method || "")) {
    const settings = readSettings(db);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
      else if (value != null) headers.set(key, value);
    }
    const webRequest = new Request(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
      method: request.method, headers,
      body: request.method === "GET" ? undefined : Buffer.concat(chunks),
    });
    const workerResponse = await handleAiRequest(webRequest, {
      AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      AI_MODEL_ID: "ops-router",
      AI_API_KEY: "ops-internal-adapter",
      AI_REQUEST_TIMEOUT_MS: "120000",
      AI_REQUESTS_PER_MINUTE: String(settings.requestsPerMinute),
      AI_DAILY_REQUEST_LIMIT: String(settings.dailyRequestLimit),
      AI_RATE_LIMIT_SALT: "douluo-local-ops",
      DB: d1,
    });
    response.writeHead(workerResponse.status, Object.fromEntries(workerResponse.headers.entries()));
    response.end(Buffer.from(await workerResponse.arrayBuffer()));
    return true;
  }

  return false;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

function serveProduction(response, url) {
  const dist = join(root, "dist");
  const candidate = join(dist, url.pathname === "/" ? "index.html" : url.pathname);
  const pathname = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(dist, "index.html");
  if (!existsSync(pathname)) {
    jsonResponse(response, 503, { ok: false, error: "请先执行 npm run build" });
    return;
  }
  response.writeHead(200, { "content-type": mimeTypes[extname(pathname)] || "application/octet-stream" });
  response.end(readFileSync(pathname));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    if (await handleApi(request, response, url)) return;
    if (vite) {
      vite.middlewares(request, response, (error) => {
        if (error) jsonResponse(response, 500, { ok: false, error: error.message || "页面服务异常" });
      });
    } else serveProduction(response, url);
  } catch (error) {
    jsonResponse(response, 500, { ok: false, error: error?.message || "中台服务异常" });
  }
});

server.listen(port, host, () => {
  console.log(`AI 运营中台已启动: http://${host}:${port}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await vite?.close();
    db.close();
    server.close(() => process.exit(0));
  });
}
