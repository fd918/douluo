import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, maskSecret } from "../server/crypto-store.mjs";
import { getOverview, listUsage, openDatabase, readSettings, writeSettings } from "../server/database.mjs";
import { listProviders, makeProviderPrimary, routeChatCompletion, saveProvider, setProviderEnabled } from "../server/providers.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "douluo-ai-ops-"));
  const db = openDatabase(join(directory, "test.sqlite"));
  const masterKey = randomBytes(32);
  return { directory, db, masterKey, close() { db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("密钥使用 AES-GCM 加密，列表只显示掩码", () => {
  const key = randomBytes(32);
  const plaintext = "local-test-secret-123456";
  const encrypted = encryptSecret(plaintext, key);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptSecret(encrypted, key), plaintext);
  assert.equal(maskSecret(plaintext), "loc••••••••3456");
});

test("设置和服务商会持久保存并保留主备顺序", () => {
  const app = fixture();
  try {
    const first = saveProvider(app.db, app.masterKey, { name: "主服务", baseUrl: "https://primary.example/v1", modelId: "model-a", apiKey: "key-a", timeoutMs: 30000, enabled: true });
    const second = saveProvider(app.db, app.masterKey, { name: "备用服务", baseUrl: "https://fallback.example/v1", modelId: "model-b", apiKey: "key-b", timeoutMs: 45000, enabled: true });
    assert.equal(listProviders(app.db, app.masterKey)[0].id, first);
    makeProviderPrimary(app.db, second);
    const providers = listProviders(app.db, app.masterKey);
    assert.equal(providers[0].id, second);
    assert.equal(providers[0].role, "primary");
    setProviderEnabled(app.db, first, false);
    assert.equal(listProviders(app.db, app.masterKey).find((item) => item.id === first).enabled, false);

    const updated = writeSettings(app.db, { requestsPerMinute: 8, dailyRequestLimit: 88, autoFallback: false, logRetentionDays: 14 });
    assert.deepEqual(updated, { requestsPerMinute: 8, dailyRequestLimit: 88, autoFallback: false, logRetentionDays: 14 });
    assert.deepEqual(readSettings(app.db), updated);
  } finally { app.close(); }
});

test("主服务失败后会自动降级，并分别记录失败与成功", async () => {
  const app = fixture();
  const originalFetch = globalThis.fetch;
  try {
    saveProvider(app.db, app.masterKey, { name: "主服务", baseUrl: "https://primary.example/v1", modelId: "model-a", apiKey: "key-a", enabled: true });
    saveProvider(app.db, app.masterKey, { name: "备用服务", baseUrl: "https://fallback.example/v1", modelId: "model-b", apiKey: "key-b", enabled: true });
    globalThis.fetch = async (url) => {
      if (String(url).includes("primary.example")) return new Response(JSON.stringify({ error: { message: "主服务限流" } }), { status: 429, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({
        id: "test", model: "model-b", choices: [{ message: { role: "assistant", content: "备用服务正常" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await routeChatCompletion({
      db: app.db, masterKey: app.masterKey, settings: { autoFallback: true }, headers: new Headers({ "x-ai-request-kind": "dialogue" }),
      body: { messages: [{ role: "user", content: "你好" }], model: "ops-router" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers["x-ai-fallback-used"], "1");
    const logs = listUsage(app.db, { limit: 10 });
    assert.equal(logs.length, 2);
    assert.equal(logs[0].success, true);
    assert.equal(logs[0].fallbackUsed, true);
    assert.equal(logs[1].success, false);
    assert.equal(getOverview(app.db).today.fallbackSuccesses, 1);
  } finally {
    globalThis.fetch = originalFetch;
    app.close();
  }
});
