import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getCloudRuntime, handleOpsRequest, recordCloudAttempt } from "../worker/ai-ops-cloud.js";

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      const statement = sqlite.prepare(sql);
      return {
        bind(...next) { values = next; return this; },
        async run() { const result = statement.run(...values); return { success: true, meta: { changes: result.changes } }; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { success: true, results: statement.all(...values) }; },
      };
    },
  };
}

function adminRequest(pathname, token, init = {}) {
  return new Request(`https://example.test${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
}

test("云端控制层会导入现有服务商并保持模型选择", async () => {
  const DB = createD1();
  const env = {
    DB,
    AI_CONFIG_MASTER_KEY: "test-master-key-not-real",
    AI_OPS_ADMIN_TOKEN: "test-admin-token-not-real",
    AI_BASE_URL: "https://provider.example/v1",
    AI_MODEL_ID: "model-a",
    AI_API_KEY: "test-provider-key-not-real",
  };
  const runtime = await getCloudRuntime(env);
  assert.equal(runtime.providers.length, 1);
  assert.equal(runtime.providers[0].model, "model-a");

  const listResponse = await handleOpsRequest(adminRequest("/api/ops/providers", env.AI_OPS_ADMIN_TOKEN), env);
  const list = await listResponse.json();
  assert.equal(list.data[0].apiKeyMasked.includes("provider-key"), false);
  assert.equal(list.data[0].models[0].isDefault, true);

  const update = await handleOpsRequest(adminRequest(`/api/ops/providers/${list.data[0].id}`, env.AI_OPS_ADMIN_TOKEN, {
    method: "PUT",
    body: JSON.stringify({
      name: "测试服务",
      baseUrl: "https://provider.example/v1",
      timeoutMs: 60000,
      models: [
        { modelId: "model-a", displayName: "模型 A", enabled: true, isDefault: false, inputPricePerMillion: 1, outputPricePerMillion: 2 },
        { modelId: "model-b", displayName: "模型 B", enabled: true, isDefault: true, inputPricePerMillion: 1.5, outputPricePerMillion: 6 },
      ],
    }),
  }), env);
  assert.equal(update.status, 200);
  const updatedRuntime = await getCloudRuntime(env);
  assert.equal(updatedRuntime.providers[0].model, "model-b");
  DB.sqlite.close();
});
test("调用指标分别统计输入输出 Token 和预估费用", async () => {
  const DB = createD1();
  const env = {
    DB,
    AI_CONFIG_MASTER_KEY: "test-master-key-not-real",
    AI_OPS_ADMIN_TOKEN: "test-admin-token-not-real",
    AI_BASE_URL: "https://provider.example/v1",
    AI_MODEL_ID: "model-a",
    AI_API_KEY: "test-provider-key-not-real",
  };
  const runtime = await getCloudRuntime(env);
  const provider = runtime.providers[0];
  provider.models[0].inputPricePerMillion = 2;
  provider.models[0].outputPricePerMillion = 8;
  await recordCloudAttempt(DB, {
    provider,
    requestKind: "dialogue",
    success: true,
    statusCode: 200,
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    latencyMs: 320,
  });

  const response = await handleOpsRequest(adminRequest("/api/ops/overview", env.AI_OPS_ADMIN_TOKEN), env);
  const result = await response.json();
  assert.equal(result.data.today.attempts, 1);
  assert.equal(result.data.today.promptTokens, 1000);
  assert.equal(result.data.today.completionTokens, 500);
  assert.equal(result.data.today.estimatedCost, 0.006);
  DB.sqlite.close();
});

test("中台管理接口拒绝没有凭证的公网请求", async () => {
  const DB = createD1();
  const response = await handleOpsRequest(new Request("https://example.test/api/ops/providers"), {
    DB,
    AI_CONFIG_MASTER_KEY: "test-master-key-not-real",
    AI_OPS_ADMIN_TOKEN: "test-admin-token-not-real",
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "OPS_UNAUTHORIZED");
  DB.sqlite.close();
});
