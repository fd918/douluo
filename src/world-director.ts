export type WorldEventType = "探索" | "关系" | "势力" | "战斗" | "交易" | "奇遇";

export type WorldQuest = {
  id: string;
  title: string;
  objective: string;
  source: string;
  status: "进行中" | "已完成" | "已放弃";
  progress: number;
  target: number;
  rewardText: string;
  createdTurn: number;
};

export type WorldEventRecord = {
  id: string;
  turn: number;
  day: number;
  title: string;
  type: WorldEventType;
  summary: string;
  source: "AI导演" | "本地事件" | "固定剧情";
};

export type WorldDirectorState = {
  day: number;
  factionReputation: Record<string, number>;
  activeQuests: WorldQuest[];
  eventHistory: WorldEventRecord[];
  lastEventId: string | null;
  explorationSeed: number;
  aiEventsGenerated: number;
};

export type WorldDirective = {
  eventTitle: string;
  eventType: WorldEventType;
  summary: string;
  factionId?: string;
  reputationDelta: number;
  coinDelta: number;
  experienceDelta: number;
  locationId?: string;
  addFlag?: string;
  rewardItemId?: string;
  quest?: Omit<WorldQuest, "status" | "progress" | "createdTurn">;
};

export type WorldDirectiveLimits = {
  factionIds: readonly string[];
  locationIds: readonly string[];
  rewardItemIds: readonly string[];
  flagIds?: readonly string[];
};

const EVENT_TYPES: readonly WorldEventType[] = ["探索", "关系", "势力", "战斗", "交易", "奇遇"];
const EVENT_HISTORY_LIMIT = 40;
const QUEST_LIMIT = 8;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, Math.round(number)))
    : fallback;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function createEventId(turn: number, title: string) {
  let hash = 2166136261;
  for (const character of title) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `world-${turn}-${(hash >>> 0).toString(36)}`;
}

export function createInitialWorldDirectorState(factionIds: readonly string[]): WorldDirectorState {
  return {
    day: 1,
    factionReputation: Object.fromEntries(factionIds.map((id) => [id, 0])),
    activeQuests: [],
    eventHistory: [],
    lastEventId: null,
    explorationSeed: 20260816,
    aiEventsGenerated: 0,
  };
}

export function hydrateWorldDirectorState(
  value: Partial<WorldDirectorState> | null | undefined,
  factionIds: readonly string[],
): WorldDirectorState {
  const initial = createInitialWorldDirectorState(factionIds);
  const factionReputation = { ...initial.factionReputation };
  for (const factionId of factionIds) {
    factionReputation[factionId] = clampInteger(value?.factionReputation?.[factionId], -100, 100, 0);
  }
  const activeQuests: WorldQuest[] = Array.isArray(value?.activeQuests)
    ? value.activeQuests
      .filter((quest): quest is WorldQuest => Boolean(quest && cleanText(quest.id, 80) && cleanText(quest.title, 80)))
      .slice(-QUEST_LIMIT)
      .map((quest) => ({
        ...quest,
        id: cleanText(quest.id, 80),
        title: cleanText(quest.title, 80),
        objective: cleanText(quest.objective, 160),
        source: cleanText(quest.source, 60) || "世界事件",
        rewardText: cleanText(quest.rewardText, 100),
        progress: clampInteger(quest.progress, 0, 99, 0),
        target: clampInteger(quest.target, 1, 99, 1),
        createdTurn: clampInteger(quest.createdTurn, 0, 1_000_000, 0),
        status: quest.status === "已完成" || quest.status === "已放弃" ? quest.status : "进行中" as const,
      }))
    : [];
  const eventHistory: WorldEventRecord[] = Array.isArray(value?.eventHistory)
    ? value.eventHistory
      .filter((event): event is WorldEventRecord => Boolean(event && cleanText(event.id, 100) && cleanText(event.title, 80)))
      .slice(-EVENT_HISTORY_LIMIT)
      .map((event) => ({
        ...event,
        id: cleanText(event.id, 100),
        turn: clampInteger(event.turn, 0, 1_000_000, 0),
        day: clampInteger(event.day, 1, 1_000_000, 1),
        title: cleanText(event.title, 80),
        type: includes(EVENT_TYPES, event.type) ? event.type : "奇遇",
        summary: cleanText(event.summary, 220),
        source: event.source === "AI导演" || event.source === "固定剧情" ? event.source : "本地事件" as const,
      }))
    : [];
  return {
    day: clampInteger(value?.day, 1, 1_000_000, 1),
    factionReputation,
    activeQuests,
    eventHistory,
    lastEventId: cleanText(value?.lastEventId, 100) || null,
    explorationSeed: clampInteger(value?.explorationSeed, 1, 2_147_483_647, initial.explorationSeed),
    aiEventsGenerated: clampInteger(value?.aiEventsGenerated, 0, 1_000_000, 0),
  };
}

export function normalizeWorldDirective(value: unknown, limits: WorldDirectiveLimits): WorldDirective | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const eventTitle = cleanText(source.eventTitle, 80);
  const summary = cleanText(source.summary, 220);
  if (!eventTitle || !summary) return null;

  const factionId = includes(limits.factionIds, source.factionId) ? source.factionId : undefined;
  const locationId = includes(limits.locationIds, source.locationId) ? source.locationId : undefined;
  const rewardItemId = includes(limits.rewardItemIds, source.rewardItemId) ? source.rewardItemId : undefined;
  const addFlag = limits.flagIds && includes(limits.flagIds, source.addFlag) ? source.addFlag : undefined;
  const rawQuest = source.quest && typeof source.quest === "object"
    ? source.quest as Record<string, unknown>
    : null;
  const questTitle = cleanText(rawQuest?.title, 80);
  const questObjective = cleanText(rawQuest?.objective, 160);
  const quest = questTitle && questObjective
    ? {
        id: cleanText(rawQuest?.id, 80) || createEventId(0, questTitle),
        title: questTitle,
        objective: questObjective,
        source: cleanText(rawQuest?.source, 60) || eventTitle,
        target: clampInteger(rawQuest?.target, 1, 10, 1),
        rewardText: cleanText(rawQuest?.rewardText, 100),
      }
    : undefined;

  return {
    eventTitle,
    eventType: includes(EVENT_TYPES, source.eventType) ? source.eventType : "奇遇",
    summary,
    factionId,
    reputationDelta: factionId ? clampInteger(source.reputationDelta, -4, 6, 0) : 0,
    coinDelta: clampInteger(source.coinDelta, -10, 30, 0),
    experienceDelta: clampInteger(source.experienceDelta, 0, 240, 0),
    locationId,
    addFlag,
    rewardItemId,
    quest,
  };
}

export function applyWorldDirective(
  state: WorldDirectorState,
  directive: WorldDirective,
  turn: number,
  source: WorldEventRecord["source"],
): WorldDirectorState {
  const eventId = createEventId(turn, directive.eventTitle);
  const reputation = { ...state.factionReputation };
  if (directive.factionId && directive.factionId in reputation) {
    reputation[directive.factionId] = clampInteger(
      reputation[directive.factionId] + directive.reputationDelta,
      -100,
      100,
    );
  }
  const quests = directive.quest && !state.activeQuests.some((quest) => quest.id === directive.quest?.id)
    ? [...state.activeQuests, { ...directive.quest, status: "进行中" as const, progress: 0, createdTurn: turn }].slice(-QUEST_LIMIT)
    : state.activeQuests;
  return {
    ...state,
    day: Math.max(state.day, Math.floor(turn / 3) + 1),
    factionReputation: reputation,
    activeQuests: quests,
    eventHistory: [
      ...state.eventHistory,
      {
        id: eventId,
        turn,
        day: Math.max(state.day, Math.floor(turn / 3) + 1),
        title: directive.eventTitle,
        type: directive.eventType,
        summary: directive.summary,
        source,
      },
    ].slice(-EVENT_HISTORY_LIMIT),
    lastEventId: eventId,
    explorationSeed: (Math.imul(state.explorationSeed, 48271) % 2_147_483_647) || 1,
    aiEventsGenerated: state.aiEventsGenerated + (source === "AI导演" ? 1 : 0),
  };
}

export function getReputationLabel(score: number) {
  if (score >= 70) return "核心盟友";
  if (score >= 35) return "深受信任";
  if (score >= 10) return "友善";
  if (score <= -70) return "死敌";
  if (score <= -35) return "敌对";
  if (score <= -10) return "警惕";
  return "中立";
}
