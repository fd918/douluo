import type { MartialSoulDefinition } from "./content/douluoWorldContent";

export const PROLOGUE_PARAGRAPHS = [
  "斗罗大陆。这里，没有魔法，也没有斗气。每个人六岁那年，都要走进武魂殿，等待属于自己的武魂苏醒。有人握住刀剑，有人唤出兽影；而极少数人，会在掌心感受到魂力的回应。从那一刻起，他们有了同一个名字——魂师。",
  "帝国、宗门、魂师学院与魂兽森林，共同维持着这片大陆脆弱的秩序。可力量，从来不是答案。它能守护伙伴，也能让人坠入欲望；没有哪一条道路，天生正确。",
  "你的故事，将从法斯诺行省的诺丁城开始。雨后的青石路上，一串泛着蓝光的脚印，正悄无声息地通向学院后门。它会把原本平静的新生活，牵进一场横跨学院、森林、天斗城与远海的阴谋。",
  "你可以结交伙伴，守护魂兽，追逐力量；也可以拒绝所有既定的答案。每一次选择，都会留在时间线上，并把这片大陆带向不同的未来。至于你……现在，先决定要以怎样的身份醒来。",
] as const;

export const PROLOGUE_NARRATION = PROLOGUE_PARAGRAPHS.join("\n\n");

export function buildOpeningNarration(martialSoul: Pick<MartialSoulDefinition, "name" | "description">) {
  return `武魂觉醒仪式那天，${martialSoul.name}在你掌心缓缓展开。${martialSoul.description}三天后，你带着学院推荐信，来到诺丁城。雨后的青石路上，一串泛着蓝光的脚印，正通向学院后门。你还不知道……从踏上这条路开始，命运就已经改变。`;
}
