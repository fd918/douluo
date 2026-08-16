import type { MartialSoulDefinition } from "./content/douluoWorldContent";

export const PROLOGUE_PARAGRAPHS = [
  "斗罗大陆。这里没有魔法，也没有斗气。每个人六岁那年，都要等待属于自己的武魂苏醒；少数能够感受到魂力的人，会由此踏上魂师之路。",
  "这一年，圣魂村的唐三也将觉醒武魂，随后进入诺丁学院，结识小舞，并一步步走向史莱克学院。原著时间线会真实推进，而你不是替代任何人的影子。",
  "你会以同龄人的身份进入这个时代：经历工读生活、第一次猎魂、史莱克考核、大斗魂场、魂师精英赛、五年之约、海神岛与大陆终局。重大事件不会再被一句话跳过。",
  "你的出身、武魂、选择和关系，会决定你在每个事件里的位置。你可以与伙伴同行，也可以保留分歧，最终写下属于自己的平行人生。现在，先决定六岁那年的你是谁。",
] as const;

export const PROLOGUE_NARRATION = PROLOGUE_PARAGRAPHS.join("\n\n");

export function buildOpeningNarration(martialSoul: Pick<MartialSoulDefinition, "name" | "description">) {
  return `六岁的春天，${martialSoul.name}将在觉醒法阵中第一次出现在你掌心。${martialSoul.description}同一天，圣魂村的唐三也会觉醒武魂。你们尚未相识，但已经站在同一条时代时间线上。`;
}
