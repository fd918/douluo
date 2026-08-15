const AI_GENERATE_PATH = "/api/ai/generate";
const AI_STATUS_PATH = "/api/ai/status";
const DEFAULT_TIMEOUT_MS = 90000;
const MAX_TIMEOUT_MS = 120000;
const MAX_ACTION_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 300;
const DEFAULT_REQUESTS_PER_MINUTE = 12;
const DEFAULT_DAILY_REQUEST_LIMIT = 120;
const requestBuckets = new Map();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeArray(value, maxItems = 8) {
  return Array.isArray(value) ? value.slice(-maxItems) : [];
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, Math.round(number)))
    : fallback;
}

function getProviderConfig(env, prefix, label) {
  const baseUrl = cleanText(env?.[`${prefix}BASE_URL`], 500).replace(/\/$/, "");
  const model = cleanText(env?.[`${prefix}MODEL_ID`], 200);
  const apiKey = cleanText(env?.[`${prefix}API_KEY`], 1000);
  const timeoutMs = clampInteger(env?.[`${prefix}REQUEST_TIMEOUT_MS`], 1000, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  return { baseUrl, model, apiKey, timeoutMs, label };
}

function getConfig(env) {
  const providers = [
    getProviderConfig(env, "AI_", "primary"),
    getProviderConfig(env, "AI_FALLBACK_", "fallback"),
  ].filter((provider) => provider.baseUrl && provider.model && provider.apiKey && isValidBaseUrl(provider.baseUrl));
  return {
    providers,
    requestsPerMinute: clampInteger(env?.AI_REQUESTS_PER_MINUTE, 1, 120, DEFAULT_REQUESTS_PER_MINUTE),
    dailyRequestLimit: clampInteger(env?.AI_DAILY_REQUEST_LIMIT, 1, 5000, DEFAULT_DAILY_REQUEST_LIMIT),
  };
}

function isValidBaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function createProviderHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function getProviderPublicInfo(provider) {
  return {
    role: provider.label,
    model: provider.model,
    provider: new URL(provider.baseUrl).host,
  };
}

function checkRequestBudget(request, config) {
  const clientKey = cleanText(
    request.headers.get("cf-connecting-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]
      || request.headers.get("x-real-ip")
      || "local",
    120,
  );
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  const dayKey = now.toISOString().slice(0, 10);
  const current = requestBuckets.get(clientKey);
  const bucket = {
    minuteKey,
    minuteCount: current?.minuteKey === minuteKey ? current.minuteCount : 0,
    dayKey,
    dayCount: current?.dayKey === dayKey ? current.dayCount : 0,
    touchedAt: Date.now(),
  };
  if (bucket.minuteCount >= config.requestsPerMinute) {
    return { allowed: false, code: "AI_RATE_LIMITED", message: "请求过于频繁，请稍后再试" };
  }
  if (bucket.dayCount >= config.dailyRequestLimit) {
    return { allowed: false, code: "AI_DAILY_LIMIT", message: "今日 AI 剧情额度已经用完，本地剧情仍可继续游玩" };
  }
  bucket.minuteCount += 1;
  bucket.dayCount += 1;
  requestBuckets.set(clientKey, bucket);
  if (requestBuckets.size > 2000) {
    const expiry = Date.now() - 86_400_000;
    for (const [key, value] of requestBuckets) {
      if (value.touchedAt < expiry) requestBuckets.delete(key);
    }
  }
  return { allowed: true };
}

function parseModelJson(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  const withoutFence = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parseCandidate = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed !== "string") return parsed;
      try {
        return JSON.parse(parsed);
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  };
  const direct = parseCandidate(withoutFence);
  if (direct) return direct;
  if (/^\s*"(?:narrative|reply|response|scene|summary)"\s*:/.test(withoutFence)) {
    const repaired = parseCandidate(`{${withoutFence}`);
    if (repaired) return repaired;
  }
  try {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return parseCandidate(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}

function getMessageContent(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => (item && typeof item.text === "string" ? item.text : ""))
    .join("")
    .trim();
}

function createActionPrompt(payload) {
  const action = cleanText(payload?.action, MAX_ACTION_LENGTH);
  if (!action) return null;
  const context = {
    玩家: {
      姓名: cleanText(payload?.player?.name, 40),
      身份: cleanText(payload?.player?.identity, 40),
      天赋: cleanText(payload?.player?.talent, 40),
      魂力等级: clampInteger(payload?.player?.soulPower, 0, 999, 0),
    },
    当前场景: {
      章节: cleanText(payload?.scene?.chapter, 60),
      标题: cleanText(payload?.scene?.title, 80),
      地点: cleanText(payload?.scene?.location, 80),
      当前剧情: cleanText(payload?.scene?.narrative, 500),
      下一节点参考: cleanText(payload?.scene?.localOutcome, 500),
    },
    阶段剧情摘要: cleanText(payload?.storySummary, 700),
    已有线索: safeArray(payload?.flags, 12).map((item) => cleanText(item, 60)).filter(Boolean),
    近期共同记忆: safeArray(payload?.memories, 6).map((item) => cleanText(item, 160)).filter(Boolean),
    玩家行动: action,
  };
  return {
    system: [
      "你是《斗罗大陆人生模拟器》的剧情引擎。",
      "根据玩家行动续写一次事件结果，保持东方玄幻氛围和既有设定连贯。",
      "不要照抄小说原文，不替玩家做未选择的重大决定，不新增无法解释的神器或无敌能力。",
      "避免露骨色情、重度血腥和现实违法指导。",
      "只返回 JSON：{\"narrative\":\"剧情结果\",\"note\":\"获得的线索或影响\",\"memory\":\"一名伙伴会记住的内容\"}。",
      "narrative 80到180个汉字，note 20到60个汉字，memory 20到80个汉字。",
    ].join("\n"),
    user: JSON.stringify(context),
    schema: "action",
  };
}

function createDialoguePrompt(payload) {
  const message = cleanText(payload?.message, MAX_MESSAGE_LENGTH);
  if (!message) return null;
  const context = {
    玩家: {
      姓名: cleanText(payload?.player?.name, 40),
      身份: cleanText(payload?.player?.identity, 40),
      魂力等级: clampInteger(payload?.player?.soulPower, 0, 999, 0),
      所在地点: cleanText(payload?.player?.location, 80),
    },
    角色: {
      姓名: cleanText(payload?.character?.name, 40),
      称号: cleanText(payload?.character?.title, 80),
      武魂: cleanText(payload?.character?.martialSoul, 80),
      性格与背景: cleanText(payload?.character?.profile, 300),
      当前好感: clampInteger(payload?.character?.affection, 0, 100, 0),
    },
    阶段剧情摘要: cleanText(payload?.storySummary, 700),
    最近十轮完整对话: safeArray(payload?.history, 20).map((item) => ({
      说话者: item?.role === "player" ? "玩家" : cleanText(payload?.character?.name, 40),
      内容: cleanText(item?.text, 140),
    })),
    共同记忆: safeArray(payload?.memories, 6).map((item) => cleanText(item, 180)).filter(Boolean),
    玩家这次说: message,
  };
  return {
    system: [
      `你正在扮演${cleanText(payload?.character?.name, 40) || "一名伙伴"}，与玩家进行沉浸式角色对话。`,
      "保持角色性格、关系和共同记忆连贯，不替玩家发言，不声称自己是 AI。",
      "不要照抄小说原文，避免露骨色情、重度血腥和现实违法指导。",
      "只返回 JSON：{\"reply\":\"角色回复\",\"memory\":\"值得长期记住的对话摘要\",\"affectionDelta\":1}。",
      "reply 30到120个汉字，memory 20到80个汉字；affectionDelta 必须是 -2 到 3 的整数。",
    ].join("\n"),
    user: JSON.stringify(context),
    schema: "dialogue",
  };
}

function createSummaryPrompt(payload) {
  const events = safeArray(payload?.events, 16)
    .map((item) => ({
      轮次: clampInteger(item?.turn, 0, 1000000, 0),
      事件: cleanText(item?.title, 100),
      结果: cleanText(item?.summary, 220),
    }))
    .filter((item) => item.事件 || item.结果);
  if (events.length === 0) return null;
  const context = {
    此前阶段摘要: cleanText(payload?.previousSummary, 700),
    本阶段新增事件: events,
    当前状态: {
      地点: cleanText(payload?.current?.location, 80),
      章节: cleanText(payload?.current?.chapter, 80),
      当前任务: cleanText(payload?.current?.quest, 120),
      关键线索: safeArray(payload?.current?.flags, 12).map((item) => cleanText(item, 60)).filter(Boolean),
    },
  };
  return {
    system: [
      "你是《斗罗大陆人生模拟器》的长期记忆压缩器。",
      "把此前摘要与本阶段事件合并为一份滚动剧情摘要，保留人物关系、关键线索、未解决任务、重要选择和不可逆结果。",
      "删除重复描写、战斗过程细节和不影响未来选择的修辞，不虚构新事件。",
      "只返回 JSON：{\"summary\":\"压缩后的阶段剧情摘要\"}。",
      "summary 控制在 220 到 420 个汉字。",
    ].join("\n"),
    user: JSON.stringify(context),
    schema: "summary",
  };
}

function normalizeOutput(schema, value, rawContent) {
  const object = value && typeof value === "object" ? value : {};
  const rawLooksStructured = /["']?(?:narrative|note|memory|reply|response|summary|affectionDelta)["']?\s*:/.test(rawContent ?? "");
  const plainText = rawLooksStructured ? "" : rawContent;
  if (schema === "summary") {
    const summary = cleanText(object.summary ?? object.storySummary ?? plainText, 600);
    return summary ? { summary } : null;
  }
  if (schema === "action") {
    const narrative = cleanText(object.narrative ?? object.scene ?? object.story ?? object.outcome ?? plainText, 220);
    if (!narrative) return null;
    const note = cleanText(object.note ?? object.impact ?? object.summary, 100)
      || "这次行动改变了眼前局势，后续影响仍需继续观察。";
    const memory = cleanText(object.memory ?? object.memorySummary, 120)
      || "伙伴记住了玩家这次主动改变局势的选择。";
    return { narrative, note, memory };
  }
  const reply = cleanText(object.reply ?? object.response ?? object.dialogue ?? object.content ?? plainText, 160);
  if (!reply) return null;
  const memory = cleanText(object.memory ?? object.memorySummary ?? object.summary, 100)
    || "对方记住了玩家这次坦诚的询问与共同约定。";
  return {
    reply,
    memory,
    affectionDelta: clampInteger(object.affectionDelta ?? object.affection, -2, 3, 1),
  };
}

async function callProvider(config, prompt, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const generationOptions = prompt.schema === "dialogue"
    ? { temperature: 0.55, maxTokens: 360 }
    : prompt.schema === "summary"
      ? { temperature: 0.25, maxTokens: 520 }
      : { temperature: 0.65, maxTokens: 480 };
  const basePayload = {
    model: config.model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: generationOptions.temperature,
    max_tokens: generationOptions.maxTokens,
    stream: false,
  };
  const attempts = [
    {
      ...basePayload,
      response_format: { type: "json_object" },
      enable_thinking: false,
    },
    basePayload,
  ];

  try {
    let lastStatus = 502;
    for (const body of attempts) {
      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: createProviderHeaders(config.apiKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      lastStatus = response.status;
      const raw = await response.text();
      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        result = null;
      }
      if (!response.ok) {
        if ((response.status === 400 || response.status === 422) && body.response_format) continue;
        const error = new Error("AI_PROVIDER_ERROR");
        error.status = response.status;
        throw error;
      }
      const content = getMessageContent(result);
      const normalized = normalizeOutput(prompt.schema, parseModelJson(content), content);
      if (!normalized) {
        if (body.response_format) continue;
        const error = new Error("AI_OUTPUT_INVALID");
        error.status = 502;
        throw error;
      }
      return {
        data: normalized,
        meta: {
          model: cleanText(result?.model, 200) || config.model,
          provider: new URL(config.baseUrl).host,
          usage: {
            promptTokens: clampInteger(result?.usage?.prompt_tokens, 0, 1000000, 0),
            completionTokens: clampInteger(result?.usage?.completion_tokens, 0, 1000000, 0),
            totalTokens: clampInteger(result?.usage?.total_tokens, 0, 1000000, 0),
          },
        },
      };
    }
    const error = new Error("AI_PROVIDER_ERROR");
    error.status = lastStatus;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleAiRequest(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  const config = getConfig(env);

  if (url.pathname === AI_STATUS_PATH && request.method === "GET") {
    const primary = config.providers[0] ?? null;
    return jsonResponse({
      configured: config.providers.length > 0,
      model: primary?.model ?? null,
      provider: primary ? new URL(primary.baseUrl).host : null,
      providers: config.providers.map(getProviderPublicInfo),
      limits: {
        requestsPerMinute: config.requestsPerMinute,
        dailyRequests: config.dailyRequestLimit,
      },
    });
  }

  if (url.pathname !== AI_GENERATE_PATH) return jsonResponse({ error: "接口不存在" }, 404);
  if (request.method !== "POST") return jsonResponse({ error: "仅支持 POST 请求" }, 405);
  if (config.providers.length === 0) {
    return jsonResponse({ error: "AI 服务尚未配置", code: "AI_NOT_CONFIGURED" }, 503);
  }

  const budget = checkRequestBudget(request, config);
  if (!budget.allowed) return jsonResponse({ error: budget.message, code: budget.code }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求内容不是合法 JSON" }, 400);
  }

  const prompt = body?.kind === "action"
    ? createActionPrompt(body.payload)
    : body?.kind === "dialogue"
      ? createDialoguePrompt(body.payload)
      : body?.kind === "summary"
        ? createSummaryPrompt(body.payload)
      : null;
  if (!prompt) return jsonResponse({ error: "请求类型或内容无效" }, 400);

  try {
    let lastError;
    for (const provider of config.providers) {
      try {
        const result = await callProvider(provider, prompt, fetchImpl);
        return jsonResponse({ ok: true, ...result });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  } catch (error) {
    if (error?.name === "AbortError") {
      return jsonResponse({ error: "AI 服务响应超时", code: "AI_TIMEOUT" }, 504);
    }
    if (error?.message === "AI_OUTPUT_INVALID") {
      return jsonResponse({ error: "AI 返回格式不完整", code: "AI_OUTPUT_INVALID" }, 502);
    }
    const status = error?.status === 401 || error?.status === 403 ? 502 : 502;
    return jsonResponse({ error: "AI 服务暂时不可用", code: "AI_PROVIDER_ERROR" }, status);
  }
}
