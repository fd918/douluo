import type { MartialSoulDefinition } from "./content/douluoWorldContent";
import { publicAssetUrl } from "./publicAsset";

export const PROLOGUE_PARAGRAPHS = [
  "斗罗大陆，一个没有魔法与斗气，却由武魂决定无数人命运的世界。每个人都会在六岁觉醒武魂，少数拥有魂力的人，则能通过魂环踏上魂师之路。",
  "帝国、宗门、魂师学院与魂兽森林共同维持着脆弱的秩序。力量可以守护伙伴，也可能让人沦为欲望的容器；没有哪条道路天生正确。",
  "你的故事将从法斯诺行省的诺丁城开始。学院后门一串泛着蓝光的脚印，正把平静的新生活引向一场横跨学院、森林、天斗城与远海的阴谋。",
  "你可以结交伙伴、守护魂兽、追逐力量，也可以拒绝所有既定答案。每一次选择都会留在时间线上，并把你带向不同的结局。现在，先决定你要以怎样的身份醒来。",
] as const;

export const PROLOGUE_NARRATION = PROLOGUE_PARAGRAPHS.join("");

export function buildOpeningNarration(martialSoul: Pick<MartialSoulDefinition, "name" | "description">) {
  return `武魂觉醒仪式上，${martialSoul.name}在你掌心展开。${martialSoul.description}三天后，你带着学院推荐信来到诺丁城。雨后的青石路上，一串泛着蓝光的脚印正通向学院后门。你的入学之日，也因此成为命运改变的起点。`;
}

export function narrationClipUrl(clipId: string | null | undefined) {
  return clipId ? publicAssetUrl(`audio/douluo/narration/${clipId}.mp3`) : null;
}
