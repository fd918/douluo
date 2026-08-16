export type BrowserAiConfig = {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  enabled: boolean;
  lastTestedAt?: string;
};

export type BrowserAiTestResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

type AiKind = "action" | "dialogue" | "summary";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type Prompt = {
  system: string;
  user: string;
  schema: AiKind;
  worldMode?: boolean;
  worldLimits?: {
    factionIds: string[];
    locationIds: string[];
    rewardItemIds: string[];
    flagIds: string[];
  } | null;
};

const STORAGE_KEY = "douluo.browser-ai.v1";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_ACTION_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 300;

export const DEFAULT_BROWSER_AI_CONFIG: BrowserAiConfig = {
  baseUrl: "https://apihub.agnes-ai.com/v1",
  modelId: "agnes-2.5-flash",
  apiKey: "",
  enabled: false,
};

function getStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeArray(value: unknown, maxItems = 8): unknown[] {
  return Array.isArray(value) ? value.slice(-maxItems) : [];
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, Math.round(number)))
    : fallback;
}

export function normalizeBrowserAiConfig(value: Partial<BrowserAiConfig> = {}): BrowserAiConfig {
  const baseUrl = cleanText(value.baseUrl, 500).replace(/\/+$/, "");
  const modelId = cleanText(value.modelId, 200);
  const apiKey = cleanText(value.apiKey, 1000);
  return {
    baseUrl: baseUrl || DEFAULT_BROWSER_AI_CONFIG.baseUrl,
    modelId: modelId || DEFAULT_BROWSER_AI_CONFIG.modelId,
    apiKey,
    enabled: Boolean(value.enabled && apiKey),
    lastTestedAt: cleanText(value.lastTestedAt, 80) || undefined,
  };
}

export function loadBrowserAiConfig(storage: StorageLike | null = getStorage()): BrowserAiConfig {
  if (!storage) return { ...DEFAULT_BROWSER_AI_CONFIG };
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return saved ? normalizeBrowserAiConfig(JSON.parse(saved)) : { ...DEFAULT_BROWSER_AI_CONFIG };
  } catch {
    return { ...DEFAULT_BROWSER_AI_CONFIG };
  }
}

export function saveBrowserAiConfig(config: Partial<BrowserAiConfig>, storage: StorageLike | null = getStorage()) {
  const normalized = normalizeBrowserAiConfig(config);
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearBrowserAiConfig(storage: StorageLike | null = getStorage()) {
  storage?.removeItem(STORAGE_KEY);
  return { ...DEFAULT_BROWSER_AI_CONFIG };
}

function validateConfig(config: BrowserAiConfig) {
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new Error("AI_ADDRESS_INVALID");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("AI_ADDRESS_INVALID");
  if (!config.modelId) throw new Error("AI_MODEL_REQUIRED");
  if (!config.apiKey) throw new Error("AI_KEY_REQUIRED");
}

function providerHeaders(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function testBrowserAiConfig(
  input: Partial<BrowserAiConfig>,
  fetchImpl: typeof fetch = fetch,
): Promise<BrowserAiTestResult> {
  const config = normalizeBrowserAiConfig(input);
  try {
    validateConfig(config);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_CONFIG_INVALID";
    const messages: Record<string, string> = {
      AI_ADDRESS_INVALID: "API 地址格式不正确",
      AI_MODEL_REQUIRED: "请填写模型 ID",
      AI_KEY_REQUIRED: "请填写 API 密钥",
    };
    return { ok: false, message: messages[code] ?? "配置不完整" };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: providerHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: "user", content: "只回复：连接成功" }],
        temperature: 0,
        max_tokens: 16,
        stream: false,
      }),
    }, fetchImpl);
    if (!response.ok) {
      return { ok: false, message: `服务返回 ${response.status}，已保持本地剧情模式` };
    }
    const result = await response.json() as unknown;
    if (!getMessageContent(result)) {
      return { ok: false, message: "服务没有返回有效内容，已保持本地剧情模式" };
    }
    return { ok: true, message: "连接成功，AI 剧情已启用", latencyMs: Date.now() - startedAt };
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "连接超时，已保持本地剧情模式"
      : "无法连接服务商，已保持本地剧情模式";
    return { ok: false, message };
  }
}

function parseModelJson(content: string) {
  const normalized = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(normalized.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function getMessageContent(body: unknown) {
  const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => item && typeof item === "object" && "text" in item && typeof item.text === "string" ? item.text : "")
    .join("")
    .trim();
}

function createActionPrompt(payload: any): Prompt | null {
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
    世界导演约束: worldMode ? {
      当前日期: clampInteger(payload?.world?.day, 1, 1000000, 1),
      势力声望: safeArray(payload?.world?.reputations, 10).map((item: any) => ({
        id: cleanText(item?.id, 60),
        name: cleanText(item?.name, 60),
        score: clampInteger(item?.score, -100, 100, 0),
      })),
      可用势力ID: safeArray(payload?.world?.factionIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      可用地点ID: safeArray(payload?.world?.locationIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      可奖励物品ID: safeArray(payload?.world?.rewardItemIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      可新增标记ID: safeArray(payload?.world?.flagIds, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      本地事件参考: cleanText(
        typeof payload?.world?.localEvent === "string" ? payload.world.localEvent : JSON.stringify(payload?.world?.localEvent ?? {}),
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

function createDialoguePrompt(payload: any): Prompt | null {
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
    最近十轮完整对话: safeArray(payload?.history, 20).map((item: any) => ({
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

function createSummaryPrompt(payload: any): Prompt | null {
  const events = safeArray(payload?.events, 16)
    .map((item: any) => ({
      轮次: clampInteger(item?.turn, 0, 1000000, 0),
      事件: cleanText(item?.title, 100),
      结果: cleanText(item?.summary, 220),
    }))
    .filter((item) => item.事件 || item.结果);
  if (events.length === 0) return null;
  return {
    system: [
      "你是《斗罗大陆人生模拟器》的长期记忆压缩器。",
      "把此前摘要与本阶段事件合并为一份滚动剧情摘要，保留人物关系、关键线索、未解决任务、重要选择和不可逆结果。",
      "删除重复描写、战斗过程细节和不影响未来选择的修辞，不虚构新事件。",
      "只返回 JSON：{\"summary\":\"压缩后的阶段剧情摘要\"}。",
      "summary 控制在 220 到 420 个汉字。",
    ].join("\n"),
    user: JSON.stringify({
      此前阶段摘要: cleanText(payload?.previousSummary, 700),
      本阶段新增事件: events,
      当前状态: {
        地点: cleanText(payload?.current?.location, 80),
        章节: cleanText(payload?.current?.chapter, 80),
        当前任务: cleanText(payload?.current?.quest, 120),
        关键线索: safeArray(payload?.current?.flags, 12).map((item) => cleanText(item, 60)).filter(Boolean),
      },
    }),
    schema: "summary",
  };
}

function normalizeOutput(schema: AiKind, value: any, rawContent: string, worldLimits: Prompt["worldLimits"] = null) {
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
    const directive = object.worldDirective && typeof object.worldDirective === "object" ? object.worldDirective : null;
    const eventTitle = cleanText(directive?.eventTitle, 80);
    const summary = cleanText(directive?.summary, 220);
    const eventTypes = new Set(["探索", "关系", "势力", "战斗", "交易", "奇遇"]);
    const rawQuest = directive?.quest && typeof directive.quest === "object" ? directive.quest : null;
    const questTitle = cleanText(rawQuest?.title, 80);
    const questObjective = cleanText(rawQuest?.objective, 160);
    const allow = (values: string[] | undefined, candidate: string) => values?.includes(candidate) ? candidate : undefined;
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
  return {
    reply,
    memory: cleanText(object.memory ?? object.memorySummary ?? object.summary, 100)
      || "对方记住了玩家这次坦诚的询问与共同约定。",
    affectionDelta: clampInteger(object.affectionDelta ?? object.affection, -2, 3, 1),
  };
}

function buildPrompt(kind: AiKind, payload: unknown) {
  if (kind === "action") return createActionPrompt(payload);
  if (kind === "dialogue") return createDialoguePrompt(payload);
  return createSummaryPrompt(payload);
}

export async function generateWithBrowserAi<T>(
  kind: AiKind,
  payload: unknown,
  configInput: Partial<BrowserAiConfig> = loadBrowserAiConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const config = normalizeBrowserAiConfig(configInput);
  validateConfig(config);
  if (!config.enabled) throw new Error("AI_NOT_ENABLED");
  const prompt = buildPrompt(kind, payload);
  if (!prompt) throw new Error("AI_PAYLOAD_INVALID");
  const generationOptions = kind === "dialogue"
    ? { temperature: 0.55, maxTokens: 360 }
    : kind === "summary"
      ? { temperature: 0.25, maxTokens: 520 }
      : { temperature: 0.65, maxTokens: prompt.worldMode ? 900 : 480 };
  const basePayload = {
    model: config.modelId,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: generationOptions.temperature,
    max_tokens: generationOptions.maxTokens,
    stream: false,
  };
  const attempts = [
    { ...basePayload, response_format: { type: "json_object" }, enable_thinking: false },
    basePayload,
  ];

  for (const body of attempts) {
    const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: providerHeaders(config.apiKey),
      body: JSON.stringify(body),
    }, fetchImpl);
    const raw = await response.text();
    if (!response.ok) {
      if ((response.status === 400 || response.status === 422) && "response_format" in body) continue;
      throw new Error("AI_PROVIDER_ERROR");
    }
    let result: unknown;
    try {
      result = JSON.parse(raw);
    } catch {
      result = null;
    }
    const content = getMessageContent(result);
    const normalized = normalizeOutput(prompt.schema, parseModelJson(content), content, prompt.worldLimits);
    if (normalized) return normalized as T;
    if (!("response_format" in body)) throw new Error("AI_OUTPUT_INVALID");
  }
  throw new Error("AI_PROVIDER_ERROR");
}
