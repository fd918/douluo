const AI_GENERATE_PATH = "/api/ai/generate";
const AI_STATUS_PATH = "/api/ai/status";
const DEFAULT_TIMEOUT_MS = 90000;
const MAX_TIMEOUT_MS = 120000;
const MAX_ACTION_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 300;
const DEFAULT_REQUESTS_PER_MINUTE = 12;
const DEFAULT_DAILY_REQUEST_LIMIT = 120;
const requestBuckets = new Map();
const budgetSchemaPromises = new WeakMap();

const CREATE_BUDGET_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ai_request_budgets (
    client_key TEXT PRIMARY KEY NOT NULL,
    minute_key TEXT NOT NULL,
    minute_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
    day_key TEXT NOT NULL,
    day_count INTEGER NOT NULL DEFAULT 0 CHECK (day_count >= 0),
    touched_at INTEGER NOT NULL
  )
`;

const CONSUME_BUDGET_SQL = `
  INSERT INTO ai_request_budgets (
    client_key, minute_key, minute_count, day_key, day_count, touched_at
  ) VALUES (?, ?, 1, ?, 1, ?)
  ON CONFLICT(client_key) DO UPDATE SET
    minute_key = excluded.minute_key,
    minute_count = CASE
      WHEN ai_request_budgets.minute_key = excluded.minute_key
        THEN ai_request_budgets.minute_count + 1
      ELSE 1
    END,
    day_key = excluded.day_key,
    day_count = CASE
      WHEN ai_request_budgets.day_key = excluded.day_key
        THEN ai_request_budgets.day_count + 1
      ELSE 1
    END,
    touched_at = excluded.touched_at
  WHERE
    (CASE
      WHEN ai_request_budgets.minute_key = excluded.minute_key
        THEN ai_request_budgets.minute_count
      ELSE 0
    END) < ?
    AND
    (CASE
      WHEN ai_request_budgets.day_key = excluded.day_key
        THEN ai_request_budgets.day_count
      ELSE 0
    END) < ?
  RETURNING minute_count, day_count
`;

const READ_BUDGET_SQL = `
  SELECT minute_key, minute_count, day_key, day_count
  FROM ai_request_budgets
  WHERE client_key = ?
`;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorResponse(code, message, status, options = {}) {
  const response = jsonResponse({ ok: false, error: message, code }, status);
  if (options.retryAfterSeconds) {
    response.headers.set("retry-after", String(options.retryAfterSeconds));
  }
  if (options.allow) response.headers.set("allow", options.allow);
  return response;
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

function getConfig(env, providerOverride = null, settingsOverride = null) {
  const environmentProviders = [
    getProviderConfig(env, "AI_", "primary"),
    getProviderConfig(env, "AI_FALLBACK_", "fallback"),
  ].filter((provider) => provider.baseUrl && provider.model && provider.apiKey && isValidBaseUrl(provider.baseUrl));
  const providers = Array.isArray(providerOverride)
    ? providerOverride.filter((provider) => provider.baseUrl && provider.model && provider.apiKey && isValidBaseUrl(provider.baseUrl))
    : environmentProviders;
  return {
    providers,
    requestsPerMinute: clampInteger(settingsOverride?.requestsPerMinute ?? env?.AI_REQUESTS_PER_MINUTE, 1, 120, DEFAULT_REQUESTS_PER_MINUTE),
    dailyRequestLimit: clampInteger(settingsOverride?.dailyRequestLimit ?? env?.AI_DAILY_REQUEST_LIMIT, 1, 100000, DEFAULT_DAILY_REQUEST_LIMIT),
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
    provider: provider.name || new URL(provider.baseUrl).host,
  };
}

function getClientSource(request) {
  return cleanText(
    request.headers.get("cf-connecting-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]
      || request.headers.get("x-real-ip")
      || "local",
    120,
  );
}

async function hashClientSource(source, salt = "") {
  const value = new TextEncoder().encode(`douluo-ai-budget:${salt}:${source}`);
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getRetryAfterSeconds(kind, now) {
  if (kind === "day") {
    const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000));
  }
  return Math.max(1, 60 - now.getUTCSeconds());
}

function deniedBudget(kind, now, storage) {
  if (kind === "minute") {
    return {
      allowed: false,
      code: "AI_RATE_LIMITED",
      message: "请求过于频繁，请稍后再试",
      retryAfterSeconds: getRetryAfterSeconds("minute", now),
      storage,
    };
  }
  return {
    allowed: false,
    code: "AI_DAILY_LIMIT",
    message: "今日 AI 剧情额度已经用完，本地剧情仍可继续游玩",
    retryAfterSeconds: getRetryAfterSeconds("day", now),
    storage,
  };
}

function checkMemoryRequestBudget(clientKey, config, now = new Date(), storage = "memory") {
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
    return deniedBudget("minute", now, storage);
  }
  if (bucket.dayCount >= config.dailyRequestLimit) {
    return deniedBudget("day", now, storage);
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
  return { allowed: true, storage };
}

function hasPersistentBudgetStore(env) {
  return Boolean(env?.DB && typeof env.DB.prepare === "function");
}

async function ensureBudgetSchema(db) {
  let pending = budgetSchemaPromises.get(db);
  if (!pending) {
    pending = db.prepare(CREATE_BUDGET_TABLE_SQL).run().catch((error) => {
      budgetSchemaPromises.delete(db);
      throw error;
    });
    budgetSchemaPromises.set(db, pending);
  }
  await pending;
}

async function checkPersistentRequestBudget(clientKey, db, config, now = new Date()) {
  await ensureBudgetSchema(db);
  const minuteKey = now.toISOString().slice(0, 16);
  const dayKey = now.toISOString().slice(0, 10);
  const consumed = await db.prepare(CONSUME_BUDGET_SQL)
    .bind(
      clientKey,
      minuteKey,
      dayKey,
      now.getTime(),
      config.requestsPerMinute,
      config.dailyRequestLimit,
    )
    .first();
  if (consumed) return { allowed: true, storage: "d1" };

  const current = await db.prepare(READ_BUDGET_SQL).bind(clientKey).first();
  const minuteCount = current?.minute_key === minuteKey ? Number(current.minute_count) : 0;
  if (minuteCount >= config.requestsPerMinute) return deniedBudget("minute", now, "d1");
  const dayCount = current?.day_key === dayKey ? Number(current.day_count) : 0;
  if (dayCount >= config.dailyRequestLimit) return deniedBudget("day", now, "d1");

  // A concurrent first write can briefly make the conditional upsert return no row.
  // Falling back to the local guard keeps the request protected without failing gameplay.
  return checkMemoryRequestBudget(clientKey, config, now, "memory-fallback");
}

async function checkRequestBudget(request, env, config) {
  const source = getClientSource(request);
  const localClientKey = await hashClientSource(source, cleanText(env?.AI_RATE_LIMIT_SALT, 500));
  if (!hasPersistentBudgetStore(env)) {
    return checkMemoryRequestBudget(localClientKey, config);
  }
  try {
    return await checkPersistentRequestBudget(localClientKey, env.DB, config);
  } catch {
    return checkMemoryRequestBudget(localClientKey, config, new Date(), "memory-fallback");
  }
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
  const worldMode = payload?.mode === "world";
  const context = {
    玩家: {
      姓名: cleanText(payload?.player?.name, 40),
      身份: cleanText(payload?.player?.identity, 40),
      天赋: cleanText(payload?.player?.talent, 40),
      魂力等级: clampInteger(payload?.player?.soulPower, 0, 999, 0),
      武魂: cleanText(payload?.player?.martialSoul, 80),
      出生地: cleanText(payload?.player?.originPlace, 80),
      家庭背景: cleanText(payload?.player?.background, 80),
      人生目标: cleanText(payload?.player?.lifeGoal, 120),
      私人秘密: cleanText(payload?.player?.secret, 180),
    },
    当前场景: {
      章节: cleanText(payload?.scene?.chapter, 60),
      标题: cleanText(payload?.scene?.title, 80),
      地点: cleanText(payload?.scene?.location, 80),
      当前剧情: cleanText(payload?.scene?.narrative, 500),
      下一节点参考: cleanText(payload?.scene?.localOutcome, 500),
      原著时间锚点: cleanText(payload?.scene?.canonAnchor, 120),
      剧情模式: cleanText(payload?.scene?.storyMode, 30),
      叙事节奏: cleanText(payload?.scene?.narrativePace, 30),
    },
    阶段剧情摘要: cleanText(payload?.storySummary, 700),
    已有线索: safeArray(payload?.flags, 12).map((item) => cleanText(item, 60)).filter(Boolean),
    近期共同记忆: safeArray(payload?.memories, 6).map((item) => cleanText(item, 160)).filter(Boolean),
    世界导演约束: worldMode ? {
      当前日期: clampInteger(payload?.world?.day, 1, 1000000, 1),
      势力声望: safeArray(payload?.world?.reputations, 10).map((item) => ({
        id: cleanText(item?.id, 60),
        name: cleanText(item?.name, 60),
        score: clampInteger(item?.score, -100, 100, 0),
      })),
      可用势力ID: safeArray(payload?.world?.factionIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      可用地点ID: safeArray(payload?.world?.locationIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      可奖励物品ID: safeArray(payload?.world?.rewardItemIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      可新增标记ID: safeArray(payload?.world?.flagIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      本地事件参考: cleanText(
        typeof payload?.world?.localEvent === "string"
          ? payload.world.localEvent
          : JSON.stringify(payload?.world?.localEvent ?? {}),
        500,
      ),
    } : undefined,
    玩家行动: action,
  };
  const responseInstruction = worldMode
    ? "只返回 JSON：{\"narrative\":\"剧情结果\",\"note\":\"影响\",\"memory\":\"伙伴记忆\",\"worldDirective\":{\"eventTitle\":\"事件名\",\"eventType\":\"探索\",\"summary\":\"事件摘要\",\"factionId\":\"白名单ID\",\"reputationDelta\":1,\"coinDelta\":0,\"experienceDelta\":80,\"locationId\":\"白名单ID\",\"addFlag\":\"白名单ID\",\"rewardItemId\":\"白名单ID\",\"quest\":{\"title\":\"支线名\",\"objective\":\"目标\",\"target\":1,\"rewardText\":\"奖励说明\"}}}。没有必要的字段可省略。"
    : "只返回 JSON：{\"narrative\":\"剧情结果\",\"note\":\"获得的线索或影响\",\"memory\":\"一名伙伴会记住的内容\"}。";
  return {
    system: [
      worldMode ? "你是《斗罗大陆人生模拟器》的世界导演。" : "你是《斗罗大陆人生模拟器》的剧情引擎。",
      "根据玩家行动续写一次事件结果，保持东方玄幻氛围和既有设定连贯。",
      "不要照抄小说原文，不替玩家做未选择的重大决定，不新增无法解释的神器或无敌能力。",
      "处于原著同行模式时，必须尊重给定的原著时间锚点；玩家可以影响关系、战术和自己的经历，但不能提前让角色登场，也不能擅自替代原著人物的关键选择。",
      worldMode ? "世界变化只能使用用户上下文给出的势力、地点、物品和标记 ID；数值变化必须克制，不能直接改变主线结局。" : "",
      "避免露骨色情、重度血腥和现实违法指导。",
      responseInstruction,
      "narrative 80到180个汉字，note 20到60个汉字，memory 20到80个汉字。",
    ].filter(Boolean).join("\n"),
    user: JSON.stringify(context),
    schema: "action",
    worldMode,
    worldLimits: worldMode ? {
      factionIds: safeArray(payload?.world?.factionIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      locationIds: safeArray(payload?.world?.locationIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      rewardItemIds: safeArray(payload?.world?.rewardItemIds, 24).map((item) => cleanText(item, 60)).filter(Boolean),
      flagIds: safeArray(payload?.world?.flagIds, 24).map((item) => cleanText(item, 60)).filter(Boolean),
    } : null,
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
      武魂: cleanText(payload?.player?.martialSoul, 80),
      家庭背景: cleanText(payload?.player?.background, 80),
      人生目标: cleanText(payload?.player?.lifeGoal, 120),
      私人秘密: cleanText(payload?.player?.secret, 180),
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
      "只讨论当前时间线已经发生或角色合理知道的内容，不提前泄露尚未发生的原著事件。",
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

function normalizeOutput(schema, value, rawContent, worldLimits = null) {
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
    const directive = object.worldDirective && typeof object.worldDirective === "object"
      ? object.worldDirective
      : null;
    const eventTitle = cleanText(directive?.eventTitle, 80);
    const summary = cleanText(directive?.summary, 220);
    const eventTypes = new Set(["探索", "关系", "势力", "战斗", "交易", "奇遇"]);
    const rawQuest = directive?.quest && typeof directive.quest === "object" ? directive.quest : null;
    const questTitle = cleanText(rawQuest?.title, 80);
    const questObjective = cleanText(rawQuest?.objective, 160);
    const allow = (values, value) => values?.includes(value) ? value : undefined;
    const worldDirective = eventTitle && summary ? {
      eventTitle,
      eventType: eventTypes.has(directive?.eventType) ? directive.eventType : "奇遇",
      summary,
      factionId: allow(worldLimits?.factionIds, cleanText(directive?.factionId, 60)),
      reputationDelta: clampInteger(directive?.reputationDelta, -4, 6, 0),
      coinDelta: clampInteger(directive?.coinDelta, -10, 30, 0),
      experienceDelta: clampInteger(directive?.experienceDelta, 0, 240, 0),
      locationId: allow(worldLimits?.locationIds, cleanText(directive?.locationId, 60)),
      addFlag: allow(worldLimits?.flagIds, cleanText(directive?.addFlag, 60)),
      rewardItemId: allow(worldLimits?.rewardItemIds, cleanText(directive?.rewardItemId, 60)),
      quest: questTitle && questObjective ? {
        id: cleanText(rawQuest?.id, 80) || undefined,
        title: questTitle,
        objective: questObjective,
        source: cleanText(rawQuest?.source, 60) || eventTitle,
        target: clampInteger(rawQuest?.target, 1, 10, 1),
        rewardText: cleanText(rawQuest?.rewardText, 100),
      } : undefined,
    } : undefined;
    return { narrative, note, memory, worldDirective };
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
  const startedAt = Date.now();
  const generationOptions = prompt.schema === "dialogue"
    ? { temperature: 0.55, maxTokens: 360 }
    : prompt.schema === "summary"
      ? { temperature: 0.25, maxTokens: 520 }
      : { temperature: 0.65, maxTokens: prompt.worldMode ? 900 : 480 };
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
      const normalized = normalizeOutput(prompt.schema, parseModelJson(content), content, prompt.worldLimits);
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
        statusCode: response.status,
        latencyMs: Date.now() - startedAt,
      };
    }
    const error = new Error("AI_PROVIDER_ERROR");
    error.status = lastStatus;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleAiRequest(request, env, fetchImpl = fetch, options = {}) {
  const url = new URL(request.url);
  const config = getConfig(env, options.providers, options.settings);

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
        storage: hasPersistentBudgetStore(env) ? "d1" : "memory",
        persistent: hasPersistentBudgetStore(env),
        fallback: "memory",
      },
    });
  }

  if (url.pathname !== AI_GENERATE_PATH) {
    return errorResponse("AI_ROUTE_NOT_FOUND", "接口不存在", 404);
  }
  if (request.method !== "POST") {
    return errorResponse("AI_METHOD_NOT_ALLOWED", "仅支持 POST 请求", 405, { allow: "POST" });
  }
  if (config.providers.length === 0) {
    return errorResponse("AI_NOT_CONFIGURED", "AI 服务尚未配置", 503);
  }

  const budget = await checkRequestBudget(request, env, config);
  if (!budget.allowed) {
    return errorResponse(budget.code, budget.message, 429, {
      retryAfterSeconds: budget.retryAfterSeconds,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("AI_INVALID_JSON", "请求内容不是合法 JSON", 400);
  }

  const prompt = body?.kind === "action"
    ? createActionPrompt(body.payload)
    : body?.kind === "dialogue"
      ? createDialoguePrompt(body.payload)
      : body?.kind === "summary"
        ? createSummaryPrompt(body.payload)
      : null;
  if (!prompt) return errorResponse("AI_INVALID_REQUEST", "请求类型或内容无效", 400);

  try {
    let lastError;
    for (let index = 0; index < config.providers.length; index += 1) {
      const provider = config.providers[index];
      const startedAt = Date.now();
      try {
        const result = await callProvider(provider, prompt, fetchImpl);
        if (options.onAttempt) {
          await Promise.resolve(options.onAttempt({
            requestKind: body.kind,
            provider,
            success: true,
            statusCode: result.statusCode,
            promptTokens: result.meta.usage.promptTokens,
            completionTokens: result.meta.usage.completionTokens,
            totalTokens: result.meta.usage.totalTokens,
            modelId: result.meta.model,
            latencyMs: result.latencyMs,
            attemptNo: index + 1,
            fallbackUsed: index > 0,
          })).catch(() => {});
        }
        return jsonResponse({ ok: true, ...result });
      } catch (error) {
        if (options.onAttempt) {
          await Promise.resolve(options.onAttempt({
            requestKind: body.kind,
            provider,
            success: false,
            statusCode: error?.status ?? 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs: Date.now() - startedAt,
            attemptNo: index + 1,
            fallbackUsed: index > 0,
            errorCode: error?.message || "AI_PROVIDER_ERROR",
            errorMessage: error?.name === "AbortError" ? "AI 服务响应超时" : "AI 服务暂时不可用",
          })).catch(() => {});
        }
        lastError = error;
      }
    }
    throw lastError;
  } catch (error) {
    if (error?.name === "AbortError") {
      return errorResponse("AI_TIMEOUT", "AI 服务响应超时", 504);
    }
    if (error?.message === "AI_OUTPUT_INVALID") {
      return errorResponse("AI_OUTPUT_INVALID", "AI 返回格式不完整", 502);
    }
    const status = error?.status === 401 || error?.status === 403 ? 502 : 502;
    return errorResponse("AI_PROVIDER_ERROR", "AI 服务暂时不可用", status);
  }
}
