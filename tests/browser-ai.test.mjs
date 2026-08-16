import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BROWSER_AI_CONFIG,
  clearBrowserAiConfig,
  generateWithBrowserAi,
  loadBrowserAiConfig,
  normalizeBrowserAiConfig,
  saveBrowserAiConfig,
  testBrowserAiConfig,
} from "../src/browserAi.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("默认预填 Agnes 地址和模型，但不会内置密钥", () => {
  assert.equal(DEFAULT_BROWSER_AI_CONFIG.baseUrl, "https://apihub.agnes-ai.com/v1");
  assert.equal(DEFAULT_BROWSER_AI_CONFIG.modelId, "agnes-2.5-flash");
  assert.equal(DEFAULT_BROWSER_AI_CONFIG.apiKey, "");
  assert.equal(DEFAULT_BROWSER_AI_CONFIG.enabled, false);
});

test("配置只保存到传入的浏览器存储并可清除", () => {
  const storage = createStorage();
  const saved = saveBrowserAiConfig({
    baseUrl: "https://example.com/v1/",
    modelId: "demo-model",
    apiKey: "player-key",
    enabled: true,
  }, storage);
  assert.equal(saved.baseUrl, "https://example.com/v1");
  assert.deepEqual(loadBrowserAiConfig(storage), saved);
  clearBrowserAiConfig(storage);
  assert.deepEqual(loadBrowserAiConfig(storage), DEFAULT_BROWSER_AI_CONFIG);
});

test("缺少密钥时连接测试直接失败且不发送请求", async () => {
  let called = false;
  const result = await testBrowserAiConfig(DEFAULT_BROWSER_AI_CONFIG, async () => {
    called = true;
    throw new Error("不应调用");
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /密钥/);
  assert.equal(called, false);
});

test("连接测试使用玩家密钥并识别有效响应", async () => {
  let authorization = "";
  const result = await testBrowserAiConfig({
    baseUrl: "https://example.com/v1",
    modelId: "demo-model",
    apiKey: "player-key",
  }, async (_url, init) => {
    authorization = init.headers.authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: "连接成功" } }] }), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(authorization, "Bearer player-key");
  assert.equal("apiKey" in result, false);
});

test("直连剧情会限制输出并保留结构化结果", async () => {
  const config = normalizeBrowserAiConfig({
    baseUrl: "https://example.com/v1",
    modelId: "demo-model",
    apiKey: "player-key",
    enabled: true,
  });
  const result = await generateWithBrowserAi("dialogue", {
    message: "你愿意一起去星斗大森林吗？",
    player: { name: "无名", soulPower: 12 },
    character: { name: "小舞", affection: 35 },
  }, config, async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, "demo-model");
    assert.equal(body.enable_thinking, false);
    assert.equal(body.max_tokens, 360);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ reply: "当然，一起出发吧。", memory: "约定同行", affectionDelta: 9 }) } }],
    }), { status: 200 });
  });
  assert.deepEqual(result, { reply: "当然，一起出发吧。", memory: "约定同行", affectionDelta: 3 });
});
