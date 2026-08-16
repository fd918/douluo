export type AiWorldDirective = {
  eventTitle: string;
  eventType: "探索" | "关系" | "势力" | "战斗" | "交易" | "奇遇";
  summary: string;
  factionId?: string;
  reputationDelta?: number;
  coinDelta?: number;
  experienceDelta?: number;
  locationId?: string;
  addFlag?: string;
  rewardItemId?: string;
  quest?: {
    id?: string;
    title: string;
    objective: string;
    source?: string;
    target?: number;
    rewardText?: string;
  };
};

export type AiActionResult = {
  narrative: string;
  note: string;
  memory: string;
  worldDirective?: AiWorldDirective;
};

export type AiDialogueResult = {
  reply: string;
  memory: string;
  affectionDelta: number;
};

export type AiSummaryResult = {
  summary: string;
};

type AiResponse<T> = {
  ok: true;
  data: T;
  meta: {
    model: string;
    provider?: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
};

const AI_GENERATE_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT?.trim() || "/api/ai/generate";

async function generate<T>(kind: "action" | "dialogue" | "summary", payload: unknown): Promise<T> {
  const response = await fetch(AI_GENERATE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  if (!response.ok) throw new Error("AI_UNAVAILABLE");
  const result = await response.json() as AiResponse<T>;
  if (!result.ok || !result.data) throw new Error("AI_INVALID_RESPONSE");
  return result.data;
}

export function generateAiAction(payload: unknown) {
  return generate<AiActionResult>("action", payload);
}

export function generateAiDialogue(payload: unknown) {
  return generate<AiDialogueResult>("dialogue", payload);
}

export function generateAiSummary(payload: unknown) {
  return generate<AiSummaryResult>("summary", payload);
}
