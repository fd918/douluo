import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";
import { handleAiRequest } from "../worker/ai-core.js";

function createBudgetDbMock({ fail = false } = {}) {
  const rows = new Map();
  let prepareCalls = 0;
  return {
    rows,
    get prepareCalls() {
      return prepareCalls;
    },
    prepare(sql) {
      prepareCalls += 1;
      if (fail) throw new Error("D1_UNAVAILABLE");
      const normalized = sql.replace(/\s+/g, " ").trim();
      return {
        async run() {
          assert.match(normalized, /^CREATE TABLE IF NOT EXISTS ai_request_budgets/);
          return { success: true };
        },
        bind(...args) {
          return {
            async first() {
              if (normalized.startsWith("INSERT INTO ai_request_budgets")) {
                const [clientKey, minuteKey, dayKey, touchedAt, minuteLimit, dailyLimit] = args;
                const current = rows.get(clientKey);
                const minuteCount = current?.minute_key === minuteKey ? current.minute_count : 0;
                const dayCount = current?.day_key === dayKey ? current.day_count : 0;
                if (minuteCount >= minuteLimit || dayCount >= dailyLimit) return null;
                const next = {
                  minute_key: minuteKey,
                  minute_count: minuteCount + 1,
                  day_key: dayKey,
                  day_count: dayCount + 1,
                  touched_at: touchedAt,
                };
                rows.set(clientKey, next);
                return { minute_count: next.minute_count, day_count: next.day_count };
              }
              if (normalized.startsWith("SELECT minute_key")) {
                return rows.get(args[0]) ?? null;
              }
              throw new Error(`Unexpected D1 query: ${normalized}`);
            },
          };
        },
      };
    },
  };
}

function successfulActionProvider() {
  return new Response(JSON.stringify({
    model: "example-model",
    choices: [{ message: { content: JSON.stringify({
      narrative: "蓝银草探入石缝，找到了被掩藏的道路。",
      note: "发现一条隐秘道路。",
      memory: "伙伴记住了这次谨慎探路。",
    }) } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function createActionRequest(source, action = "用蓝银草探路") {
  return new Request("https://example.test/api/ai/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": source },
    body: JSON.stringify({ kind: "action", payload: { action } }),
  });
}

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("reports AI configuration without exposing the API key", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/ai/status"), {
    AI_BASE_URL: "https://provider.example/v1",
    AI_MODEL_ID: "example-model",
    AI_API_KEY: "test-secret-not-real",
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(result, {
    configured: true,
    model: "example-model",
    provider: "provider.example",
    providers: [{ role: "primary", model: "example-model", provider: "provider.example" }],
    limits: {
      requestsPerMinute: 12,
      dailyRequests: 120,
      storage: "memory",
      persistent: false,
      fallback: "memory",
    },
  });
  assert.equal(JSON.stringify(result).includes("test-secret-not-real"), false);
});

test("reports D1 as the persistent budget store when the DB binding exists", async () => {
  const response = await handleAiRequest(new Request("https://example.test/api/ai/status"), {
    AI_BASE_URL: "https://provider.example/v1",
    AI_MODEL_ID: "example-model",
    AI_API_KEY: "test-secret-not-real",
    DB: createBudgetDbMock(),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.limits.storage, "d1");
  assert.equal(result.limits.persistent, true);
  assert.equal(result.limits.fallback, "memory");
});

test("persists and atomically enforces the per-minute D1 budget without storing the raw source", async () => {
  const db = createBudgetDbMock();
  const env = {
    AI_BASE_URL: "https://provider.example/v1",
    AI_MODEL_ID: "example-model",
    AI_API_KEY: "test-secret-not-real",
    AI_REQUESTS_PER_MINUTE: "2",
    AI_DAILY_REQUEST_LIMIT: "10",
    AI_RATE_LIMIT_SALT: "test-salt-not-real",
    DB: db,
  };
  let providerCalls = 0;
  const fetchImpl = async () => {
    providerCalls += 1;
    return successfulActionProvider();
  };

  for (let index = 0; index < 2; index += 1) {
    const response = await handleAiRequest(createActionRequest("203.0.113.10"), env, fetchImpl);
    assert.equal(response.status, 200);
  }
  const limited = await handleAiRequest(createActionRequest("203.0.113.10"), env, fetchImpl);
  const result = await limited.json();

  assert.equal(limited.status, 429);
  assert.deepEqual(result, {
    ok: false,
    error: "请求过于频繁，请稍后再试",
    code: "AI_RATE_LIMITED",
  });
  assert.equal(Number(limited.headers.get("retry-after")) > 0, true);
  assert.equal(providerCalls, 2);
  assert.equal(db.rows.size, 1);
  const [storedClientKey] = db.rows.keys();
  assert.equal(storedClientKey.length, 64);
  assert.notEqual(storedClientKey, "203.0.113.10");
});

test("persists and enforces the daily D1 budget independently of the minute limit", async () => {
  const db = createBudgetDbMock();
  const env = {
    AI_BASE_URL: "https://provider.example/v1",
    AI_MODEL_ID: "example-model",
    AI_API_KEY: "test-secret-not-real",
    AI_REQUESTS_PER_MINUTE: "10",
    AI_DAILY_REQUEST_LIMIT: "1",
    DB: db,
  };

  const allowed = await handleAiRequest(createActionRequest("203.0.113.11"), env, successfulActionProvider);
  assert.equal(allowed.status, 200);
  const limited = await handleAiRequest(createActionRequest("203.0.113.11"), env, successfulActionProvider);
  const result = await limited.json();

  assert.equal(limited.status, 429);
  assert.equal(result.ok, false);
  assert.equal(result.code, "AI_DAILY_LIMIT");
  assert.equal(Number(limited.headers.get("retry-after")) > 60, true);
});

test("falls back to the in-memory budget when the D1 binding is temporarily unavailable", async () => {
  const db = createBudgetDbMock({ fail: true });
  const response = await handleAiRequest(
    createActionRequest("203.0.113.12"),
    {
      AI_BASE_URL: "https://provider.example/v1",
      AI_MODEL_ID: "example-model",
      AI_API_KEY: "test-secret-not-real",
      DB: db,
    },
    successfulActionProvider,
  );

  assert.equal(response.status, 200);
  assert.equal(db.prepareCalls > 0, true);
});

test("uses one stable error envelope for invalid AI requests", async () => {
  const env = {
    AI_BASE_URL: "https://provider.example/v1",
    AI_MODEL_ID: "example-model",
    AI_API_KEY: "test-secret-not-real",
  };
  const invalidJson = await handleAiRequest(new Request("https://example.test/api/ai/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "invalid-json-test" },
    body: "{",
  }), env);
  assert.deepEqual(await invalidJson.json(), {
    ok: false,
    error: "请求内容不是合法 JSON",
    code: "AI_INVALID_JSON",
  });

  const wrongMethod = await handleAiRequest(new Request("https://example.test/api/ai/generate", {
    method: "GET",
  }), env);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");
  assert.deepEqual(await wrongMethod.json(), {
    ok: false,
    error: "仅支持 POST 请求",
    code: "AI_METHOD_NOT_ALLOWED",
  });
});

test("allows the short GitHub Pages frontend to call the protected AI worker", async () => {
  const origin = "https://fd918.github.io";
  const preflight = await worker.fetch(
    new Request("https://example.test/api/ai/generate", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "POST" },
    }),
    {},
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");

  const denied = await worker.fetch(
    new Request("https://example.test/api/ai/status", { headers: { origin: "https://untrusted.example" } }),
    {},
  );
  assert.equal(denied.headers.has("access-control-allow-origin"), false);
});

test("falls back to the secondary AI provider without exposing either key", async () => {
  const calls = [];
  const response = await handleAiRequest(
    new Request("https://example.test/api/ai/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "fallback-test" },
      body: JSON.stringify({ kind: "action", payload: { action: "沿蓝银草的方向继续追踪" } }),
    }),
    {
      AI_BASE_URL: "https://primary.example/v1",
      AI_MODEL_ID: "primary-model",
      AI_API_KEY: "primary-secret-not-real",
      AI_FALLBACK_BASE_URL: "https://fallback.example/v1",
      AI_FALLBACK_MODEL_ID: "fallback-model",
      AI_FALLBACK_API_KEY: "fallback-secret-not-real",
    },
    async (url, options) => {
      calls.push({ url, authorization: options.headers.authorization });
      if (url.startsWith("https://primary.example")) {
        return new Response("upstream unavailable", { status: 503 });
      }
      return new Response(JSON.stringify({
        model: "fallback-model",
        choices: [{ message: { content: JSON.stringify({
          narrative: "蓝银草在墙缝间轻轻摆动，指出了一条被遮住的暗道。",
          note: "发现通往学院旧井的暗道。",
          memory: "伙伴记住了你善用武魂追踪线索。",
        }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.meta.provider, "fallback.example");
  assert.deepEqual(calls.map((call) => call.url), [
    "https://primary.example/v1/chat/completions",
    "https://fallback.example/v1/chat/completions",
  ]);
  assert.equal(JSON.stringify(result).includes("secret-not-real"), false);
});

test("world director mode requests a short response and clamps generated effects", async () => {
  let providerBody = null;
  const response = await handleAiRequest(
    new Request("https://example.test/api/ai/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "world-director-test" },
      body: JSON.stringify({
        kind: "action",
        payload: {
          mode: "world",
          action: "归还账本",
          player: { name: "测试魂师", martialSoul: "澄潮珠", soulPower: 12 },
          scene: { title: "遗失的工读生账本", location: "诺丁城", localOutcome: "账本已经归还。" },
          world: {
            factionIds: ["shrek-academy"],
            locationIds: ["notting-city"],
            rewardItemIds: ["healing_herb"],
            flagIds: ["工读生账本归还"],
          },
        },
      }),
    }),
    {
      AI_BASE_URL: "https://provider.example/v1",
      AI_MODEL_ID: "example-model",
      AI_API_KEY: "test-secret-not-real",
    },
    async (_url, init) => {
      providerBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        model: "example-model",
        choices: [{ message: { content: JSON.stringify({
          narrative: "你把账本交回学院，管理员补齐了缺失记录。",
          note: "学院记住了你的谨慎。",
          memory: "归还了工读生账本。",
          worldDirective: {
            eventTitle: "账本归还",
            eventType: "势力",
            summary: "学院补齐了药草去向记录。",
            factionId: "shrek-academy",
            reputationDelta: 999,
            coinDelta: 999,
            experienceDelta: 9999,
            locationId: "forbidden-place",
            rewardItemId: "forbidden-item",
            addFlag: "forbidden-flag",
          },
        }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerBody.max_tokens, 900);
  assert.equal(result.data.worldDirective.reputationDelta, 6);
  assert.equal(result.data.worldDirective.coinDelta, 30);
  assert.equal(result.data.worldDirective.experienceDelta, 240);
  assert.equal("locationId" in result.data.worldDirective, false);
  assert.equal("rewardItemId" in result.data.worldDirective, false);
  assert.equal("addFlag" in result.data.worldDirective, false);
});

test("normalizes a structured AI dialogue response", async () => {
  const response = await handleAiRequest(
    new Request("https://example.test/api/ai/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "dialogue",
        payload: {
          message: "这些脚印和学院有关吗？",
          player: { name: "测试玩家", location: "诺丁城" },
          character: { name: "小舞", affection: 35 },
          storySummary: "玩家已经追查蓝色脚印十二轮。",
          history: Array.from({ length: 24 }, (_, index) => ({
            role: index % 2 === 0 ? "player" : "character",
            text: `消息${index + 1}`,
          })),
        },
      }),
    }),
    {
      AI_BASE_URL: "https://provider.example/v1",
      AI_MODEL_ID: "example-model",
      AI_API_KEY: "test-secret-not-real",
    },
    async (_url, options) => {
      assert.equal(options.headers.authorization, "Bearer test-secret-not-real");
      const providerRequest = JSON.parse(options.body);
      const promptContext = JSON.parse(providerRequest.messages[1].content);
      assert.equal(providerRequest.enable_thinking, false);
      assert.equal(providerRequest.max_tokens, 360);
      assert.equal(promptContext.阶段剧情摘要, "玩家已经追查蓝色脚印十二轮。");
      assert.equal(promptContext.最近十轮完整对话.length, 20);
      assert.equal(promptContext.最近十轮完整对话[0].内容, "消息5");
      return new Response(JSON.stringify({
        model: "example-model",
        choices: [{ message: { content: JSON.stringify({ reply: "我也觉得可疑，我们一起查。", memory: "两人决定共同调查学院线索。", affectionDelta: 2 }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    reply: "我也觉得可疑，我们一起查。",
    memory: "两人决定共同调查学院线索。",
    affectionDelta: 2,
  });
  assert.equal(result.meta.usage.totalTokens, 140);
});

test("repairs a plain-text AI dialogue response", async () => {
  const response = await handleAiRequest(
    new Request("https://example.test/api/ai/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "dialogue",
        payload: { message: "还记得我们的约定吗？", character: { name: "小舞" } },
      }),
    }),
    {
      AI_BASE_URL: "https://provider.example/v1",
      AI_MODEL_ID: "example-model",
      AI_API_KEY: "test-secret-not-real",
    },
    async () => new Response(JSON.stringify({
      choices: [{ message: { content: "当然记得，我们说好要一起追查到底。" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.data.reply, "当然记得，我们说好要一起追查到底。");
  assert.equal(result.data.memory.length > 0, true);
  assert.equal(result.data.affectionDelta, 1);
});

test("repairs JSON that is missing its opening brace", async () => {
  const response = await handleAiRequest(
    new Request("https://example.test/api/ai/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "action", payload: { action: "用蓝银草探路" } }),
    }),
    {
      AI_BASE_URL: "https://provider.example/v1",
      AI_MODEL_ID: "example-model",
      AI_API_KEY: "test-secret-not-real",
    },
    async (_url, options) => {
      const providerRequest = JSON.parse(options.body);
      assert.equal(providerRequest.enable_thinking, false);
      assert.equal(providerRequest.max_tokens, 480);
      return new Response(JSON.stringify({
        choices: [{ message: { content: '"narrative":"蓝银草探入缝隙，找到了阵眼。","note":"发现阵眼位置。","memory":"伙伴记住了这次默契配合。"}' } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    narrative: "蓝银草探入缝隙，找到了阵眼。",
    note: "发现阵眼位置。",
    memory: "伙伴记住了这次默契配合。",
  });
});

test("compresses story events with a non-reasoning summary request", async () => {
  const response = await handleAiRequest(
    new Request("https://example.test/api/ai/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "summary",
        payload: {
          previousSummary: "玩家在诺丁城发现了蓝色脚印。",
          events: Array.from({ length: 12 }, (_, index) => ({
            turn: index + 1,
            title: `事件${index + 1}`,
            summary: `事件${index + 1}的结果`,
          })),
          current: { location: "史莱克学院", chapter: "第三章", quest: "寻找内应", flags: ["团队信任"] },
        },
      }),
    }),
    {
      AI_BASE_URL: "https://provider.example/v1",
      AI_MODEL_ID: "example-model",
      AI_API_KEY: "test-secret-not-real",
    },
    async (_url, options) => {
      const providerRequest = JSON.parse(options.body);
      assert.equal(providerRequest.enable_thinking, false);
      assert.equal(providerRequest.max_tokens, 520);
      assert.equal(providerRequest.temperature, 0.25);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ summary: "玩家从诺丁城一路追查到史莱克学院，已经建立团队信任，并继续寻找实验组织内应。" }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.data.summary.includes("史莱克学院"), true);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/server/ai-core.js", import.meta.url));
  await access(new URL("../dist/server/ai-ops-cloud.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  await access(new URL("../dist/.openai/drizzle/0001_ai_request_budgets.sql", import.meta.url));
  await access(new URL("../dist/.openai/drizzle/0002_ai_ops_cloud.sql", import.meta.url));
});
