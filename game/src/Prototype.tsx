import {
  ArchiveIcon,
  BackpackIcon,
  BookmarkIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  DrawingPinIcon,
  ExclamationTriangleIcon,
  GlobeIcon,
  HeartFilledIcon,
  LockClosedIcon,
  MagicWandIcon,
  PaperPlaneIcon,
  PersonIcon,
  ReaderIcon,
  ReloadIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";
import {
  generateAiAction,
  generateAiDialogue,
  generateAiSummary,
  type AiActionResult,
  type AiDialogueResult,
} from "./ai";
import {
  getDefaultCustomChoice,
  getStoryNode,
  resolveStoryChoice,
  type StoryHistoryEntry,
} from "./story";
import { useDynamicGameMusic } from "./audio/useDynamicGameMusic";

type TabId = "story" | "world" | "relations" | "bag" | "archive";
type Stage = "welcome" | "creation" | "game";
type BagMode = "inventory" | "shop";
type SoulAttribute = "植物" | "水" | "火" | "兽" | "无";
type EquipmentSlot = "护具" | "饰品";
type CombatStatus = "active" | "won" | "lost";
type LocationId = "notting-city" | "shrek-academy" | "star-forest" | "sea-god-island";
type CharacterId = "xiao-wu" | "dai-mubai" | "oscar" | "ning-rongrong";
type DialogueMessage = { role: "player" | "character"; text: string };
type NpcActionKind = "visit" | "conflict" | "romance" | "quest";
type NpcActionId = "xiao-wu-visit" | "dai-mubai-conflict" | "ning-rongrong-romance" | "oscar-quest";

type NpcMemory = {
  id: string;
  characterId: CharacterId;
  turn: number;
  source: "行动" | "对话" | "拜访" | "冲突" | "心意" | "任务";
  title: string;
  detail: string;
  important: boolean;
};

type NpcActionLog = {
  actionId: NpcActionId;
  characterId: CharacterId;
  kind: NpcActionKind;
  turn: number;
  resolution: string;
};

type RecentRelationChange = {
  characterId: CharacterId;
  delta: number;
};

type WorldLocation = {
  id: LocationId;
  name: string;
  className: string;
  unlocked: boolean;
  region: string;
  distance: string;
  travelTime: string;
  risk: string;
  description: string;
  arrival: string;
  note: string;
  season: string;
  questTitle: string;
  questDescription: string;
};

type CharacterProfile = {
  id: CharacterId;
  name: string;
  title: string;
  affiliation: string;
  martialSoul: string;
  image: string;
  tone: string;
  profile: string;
  story: string;
  greeting: string;
  defaultResponse: string;
  dialogues: Array<{ prompt: string; keywords: string[]; response: string; affection: number }>;
};

type CharacterStats = {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  control: number;
};

type ItemEffect =
  | { kind: "heal"; amount: number }
  | { kind: "experience"; amount: number };

type ItemDefinition = {
  id: string;
  name: string;
  category: "关键物品" | "消耗品" | "装备" | "普通物品";
  description: string;
  buyPrice: number | null;
  sellPrice: number | null;
  effect?: ItemEffect;
  slot?: EquipmentSlot;
  bonus?: Partial<CharacterStats>;
};

type SoulRing = {
  id: string;
  name: string;
  age: number;
  attribute: SoulAttribute;
  skillName: string;
  skillDescription: string;
};

type GameState = {
  name: string;
  identity: string;
  talent: string;
  soulPower: number;
  soulProgress: number;
  coins: number;
  turns: number;
  rewinds: number;
  relationship: number;
  relationships: Record<CharacterId, number>;
  dialogueHistory: Record<CharacterId, DialogueMessage[]>;
  npcMemories: NpcMemory[];
  npcActionLog: NpcActionLog[];
  pendingNpcAction: NpcActionId | null;
  recentRelationChange: RecentRelationChange | null;
  location: string;
  season: string;
  narrative: string;
  note: string;
  martialSoul: string;
  martialAttribute: SoulAttribute;
  currentHp: number;
  victories: number;
  inventory: Record<string, number>;
  equipment: Record<EquipmentSlot, string | null>;
  soulRings: SoulRing[];
  currentStoryNodeId: string;
  storyFlags: string[];
  storyHistory: StoryHistoryEntry[];
  completedEndings: string[];
  storyCycle: number;
  lastStoryChange: string;
  storyNarrative: string;
  storyNote: string;
  storySummary: string;
  storySummaryThroughTurn: number;
};

type TimelineNode = {
  id: string;
  parentId: string | null;
  branchId: string;
  sequence: number;
  turn: number;
  title: string;
  summary: string;
  createdAt: string;
  snapshot: GameState;
};

type GameSession = {
  version: 2;
  game: GameState;
  nodes: TimelineNode[];
  currentNodeId: string;
  nextNodeNumber: number;
  nextBranchNumber: number;
  savedAt: string;
};

type TimelineEvent = {
  title: string;
  summary: string;
};

type EnemyDefinition = {
  id: string;
  name: string;
  title: string;
  attribute: SoulAttribute;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  expReward: number;
  coinReward: number;
  lootId: string;
};

type CombatState = {
  enemyId: string;
  enemyHp: number;
  playerHp: number;
  energy: number;
  round: number;
  status: CombatStatus;
  log: string[];
};

const SAVE_KEY = "douluo-life-simulator-save-v2";
const LEGACY_SAVE_KEY = "douluo-life-simulator-save-v1";
const STORY_SUMMARY_INTERVAL = 12;
const STORY_SUMMARY_EVENT_LIMIT = 16;
const DIALOGUE_MESSAGE_LIMIT = 20;

const initialRelationships: Record<CharacterId, number> = {
  "xiao-wu": 35,
  "dai-mubai": 18,
  oscar: 22,
  "ning-rongrong": 40,
};

const initialDialogueHistory: Record<CharacterId, DialogueMessage[]> = {
  "xiao-wu": [],
  "dai-mubai": [],
  oscar: [],
  "ning-rongrong": [],
};

function trimDialogueHistory(value: Partial<Record<CharacterId, DialogueMessage[]>> | null | undefined) {
  const result = { ...initialDialogueHistory };
  for (const characterId of Object.keys(initialDialogueHistory) as CharacterId[]) {
    const messages = value?.[characterId];
    result[characterId] = Array.isArray(messages) ? messages.slice(-DIALOGUE_MESSAGE_LIMIT) : [];
  }
  return result;
}

const ITEMS: Record<string, ItemDefinition> = {
  academy_letter: {
    id: "academy_letter",
    name: "学院推荐信",
    category: "关键物品",
    description: "老杰克交给你的入学凭证，无法出售或使用。",
    buyPrice: null,
    sellPrice: null,
  },
  old_purse: {
    id: "old_purse",
    name: "旧布钱袋",
    category: "普通物品",
    description: "针脚已经磨白的小钱袋，还能换回少量金魂币。",
    buyPrice: null,
    sellPrice: 2,
  },
  healing_herb: {
    id: "healing_herb",
    name: "止血草",
    category: "消耗品",
    description: "常见的疗伤草药，使用后恢复 36 点生命。",
    buyPrice: 8,
    sellPrice: 4,
    effect: { kind: "heal", amount: 36 },
  },
  blank_notebook: {
    id: "blank_notebook",
    name: "空白笔记册",
    category: "普通物品",
    description: "适合记录魂兽踪迹和修炼心得。",
    buyPrice: 5,
    sellPrice: 2,
  },
  focus_incense: {
    id: "focus_incense",
    name: "凝神香",
    category: "消耗品",
    description: "点燃后帮助魂师入定，获得 160 点魂力经验。",
    buyPrice: 12,
    sellPrice: 6,
    effect: { kind: "experience", amount: 160 },
  },
  apprentice_guard: {
    id: "apprentice_guard",
    name: "学徒护腕",
    category: "装备",
    description: "铁匠学徒常用的皮护腕，装备后提升防御与控制。",
    buyPrice: 26,
    sellPrice: 13,
    slot: "饰品",
    bonus: { defense: 3, control: 2 },
  },
  cloth_armor: {
    id: "cloth_armor",
    name: "轻韧布甲",
    category: "装备",
    description: "夹入细铁丝的轻便布甲，适合初阶魂师。",
    buyPrice: 42,
    sellPrice: 21,
    slot: "护具",
    bonus: { maxHp: 22, defense: 4 },
  },
};

const INVENTORY_ORDER = [
  "academy_letter",
  "old_purse",
  "healing_herb",
  "blank_notebook",
  "focus_incense",
  "apprentice_guard",
  "cloth_armor",
];

const SHOP_ITEM_IDS = ["healing_herb", "focus_incense", "blank_notebook", "apprentice_guard", "cloth_armor"];

const FIRST_SOUL_RING: SoulRing = {
  id: "blue-silver-centennial",
  name: "百年蓝银藤环",
  age: 423,
  attribute: "植物",
  skillName: "蓝银缠绕",
  skillDescription: "以蓝银草限制敌人行动，造成植物属性伤害，并有机会打断反击。",
};

const initialGame: GameState = {
  name: "唐三",
  identity: "原创角色",
  talent: "天才档",
  soulPower: 12,
  soulProgress: 1250,
  coins: 18,
  turns: 0,
  rewinds: 3,
  relationship: 35,
  relationships: initialRelationships,
  dialogueHistory: initialDialogueHistory,
  npcMemories: [],
  npcActionLog: [],
  pendingNpcAction: null,
  recentRelationChange: null,
  location: "诺丁城",
  season: "三月·午后",
  narrative:
    "你走在诺丁城的街道上，铁匠铺的敲击声隔着两条巷子传来。雨刚停，前方青石路上留着一串新鲜脚印，边缘浮着极淡的蓝光。那人走得很急，方向正是学院后门。",
  note: "发光的脚印不像普通行人留下的，附近似乎残留着植物系魂力。",
  martialSoul: "蓝银草",
  martialAttribute: "植物",
  currentHp: 152,
  victories: 0,
  inventory: {
    academy_letter: 1,
    old_purse: 1,
    healing_herb: 2,
    blank_notebook: 1,
    apprentice_guard: 1,
  },
  equipment: { 护具: null, 饰品: null },
  soulRings: [FIRST_SOUL_RING],
  currentStoryNodeId: "notting_street",
  storyFlags: [],
  storyHistory: [],
  completedEndings: [],
  storyCycle: 1,
  lastStoryChange: "新的时间线已经开启",
  storyNarrative:
    "你走在诺丁城的街道上，铁匠铺的敲击声隔着两条巷子传来。雨刚停，前方青石路上留着一串泛着蓝光的新鲜脚印，方向正是学院后门。",
  storyNote: "脚印边缘残留着植物系魂力，这不是普通行人留下的痕迹。",
  storySummary: "",
  storySummaryThroughTurn: 0,
};

const locations: WorldLocation[] = [
  {
    id: "notting-city",
    name: "诺丁城",
    className: "city",
    unlocked: true,
    region: "法斯诺行省",
    distance: "城内通行",
    travelTime: "片刻",
    risk: "低",
    description: "初级魂师学院与铁匠铺坐落于此。城外商路平稳，适合调查线索和补充物资。",
    arrival: "你重新踏上诺丁城的青石路。铁匠铺的敲击声依旧规律，学院后门那缕植物系魂力却比离开前更清晰了。",
    note: "已返回诺丁城。学院后门与铁匠铺仍有未完成的线索。",
    season: "三月·午后",
    questTitle: "调查发光脚印的线索",
    questDescription: "学院后门残留着植物系魂力，继续追踪可能遇到陌生魂师。",
  },
  {
    id: "shrek-academy",
    name: "史莱克学院",
    className: "academy",
    unlocked: true,
    region: "索托城外",
    distance: "西南三十里",
    travelTime: "半日",
    risk: "中",
    description: "只收怪物、不收普通人的特殊学院。破旧村落中聚集着远超同龄人的年轻魂师。",
    arrival: "木牌上歪斜的“史莱克学院”映入眼帘。训练场上传来魂力碰撞的闷响，几道年轻而锐利的目光同时落在你身上。",
    note: "已抵达史莱克学院。戴沐白似乎正在训练场等人，可先与学院成员交谈。",
    season: "三月·黄昏",
    questTitle: "通过怪物学院的考验",
    questDescription: "学院只认可实力与潜力。找到戴沐白，了解今天的入院考核。",
  },
  {
    id: "star-forest",
    name: "星斗大森林",
    className: "forest",
    unlocked: true,
    region: "天斗帝国东南",
    distance: "东行八十里",
    travelTime: "一日",
    risk: "高",
    description: "大陆最著名的魂兽聚居地之一。森林越深，魂兽越强，任何疏忽都可能付出代价。",
    arrival: "参天古木遮住天光，潮湿空气里混杂着草木与魂兽的气息。远处灌木忽然晃动，一双幽蓝眼睛在阴影里一闪而过。",
    note: "已进入星斗大森林外围。不要独自深入，附近可能有适合魂师历练的百年魂兽。",
    season: "三月·清晨",
    questTitle: "寻找植物系魂兽踪迹",
    questDescription: "辨认外围魂兽活动痕迹，在不惊动高阶魂兽的前提下继续探索。",
  },
  {
    id: "sea-god-island",
    name: "海神岛",
    className: "island",
    unlocked: false,
    region: "西海深处",
    distance: "航路未知",
    travelTime: "无法估算",
    risk: "极高",
    description: "被海洋与传说包围的神秘岛屿。当前尚未掌握安全航路，也没有足以横渡海域的实力。",
    arrival: "",
    note: "",
    season: "",
    questTitle: "寻找通往海神岛的航路",
    questDescription: "提升魂力并结识熟悉远海的人，才能逐步解锁这条路线。",
  },
];

const characters: CharacterProfile[] = [
  {
    id: "xiao-wu",
    name: "小舞",
    title: "灵动敏攻系魂师",
    affiliation: "史莱克学院",
    martialSoul: "柔骨兔",
    image: "/game-assets/xiao-wu.png",
    tone: "pink",
    profile: "性格直率活泼，珍视真正的伙伴。看似无忧无虑，却对魂兽与星斗大森林的话题格外敏感。",
    story: "她邀请你在训练结束后去学院后山。林间有一串不属于普通野兽的足迹，她似乎知道那是什么，却没有立刻说破。",
    greeting: "你来啦？别站那么远，有什么想问的就直接说。",
    defaultResponse: "小舞认真看了你一会儿，随后笑起来：“这件事我记住了。等我们更熟一点，我再告诉你我的答案。”",
    dialogues: [
      { prompt: "一起去学院后山看看", keywords: ["后山", "一起", "散步"], response: "“好啊，不过要跟紧我。”小舞压低声音，“后山最近不太安静，我可不想回头发现你走丢了。”", affection: 2 },
      { prompt: "你了解星斗大森林吗？", keywords: ["星斗", "森林", "魂兽"], response: "小舞的笑意停了一瞬：“那里不是用来炫耀胆量的地方。真要去的话，答应我别随便伤害没有威胁的魂兽。”", affection: 2 },
      { prompt: "今天的训练辛苦吗？", keywords: ["训练", "辛苦", "累"], response: "“这点训练算什么！”她活动了一下手腕，又冲你眨眼，“不过你要是请我吃胡萝卜，我可以考虑早点休息。”", affection: 1 },
    ],
  },
  {
    id: "dai-mubai",
    name: "戴沐白",
    title: "强攻系战魂尊",
    affiliation: "史莱克学院",
    martialSoul: "邪眸白虎",
    image: "/game-assets/dai-mubai.png",
    tone: "blue",
    profile: "外表冷峻强势，战斗时果断直接。对认可的同伴很有担当，但很少主动提起自己的过去。",
    story: "训练场边缘留着一道被虎爪撕开的深痕。戴沐白愿意给你一次正面对练的机会，这也是他判断同伴的方式。",
    greeting: "戴沐白抱臂站在训练场边：“找我？有话直说，我不喜欢绕弯子。”",
    defaultResponse: "他没有立刻评价，只平静地点头：“我更相信行动。等下次训练时，把你刚才的话证明给我看。”",
    dialogues: [
      { prompt: "请你和我进行一次对练", keywords: ["对练", "切磋", "战斗"], response: "“有胆量。”戴沐白向后退开半步，异色双瞳亮起，“我会控制力量，但你最好别指望我放水。”", affection: 2 },
      { prompt: "史莱克真正看重什么？", keywords: ["史莱克", "学院", "看重"], response: "“不是等级本身，是你在压力下还能不能做出正确选择。”他看向训练场，“天赋只是让你有资格站在门口。”", affection: 2 },
      { prompt: "你为什么总是独自训练？", keywords: ["独自", "过去", "为什么"], response: "戴沐白沉默片刻：“因为有些东西只能靠自己夺回来。至少现在，我还没有停下的资格。”", affection: 1 },
    ],
  },
  {
    id: "oscar",
    name: "奥斯卡",
    title: "食物系器魂师",
    affiliation: "史莱克学院",
    martialSoul: "香肠",
    image: "/game-assets/oscar.png",
    tone: "green",
    profile: "看起来随性风趣，实际上观察细致。作为少见的先天满魂力食物系魂师，他比谁都清楚辅助同伴的责任。",
    story: "奥斯卡正在尝试改良恢复香肠的味道，需要有人陪他去集市辨认几种香料。一次普通采购，也可能遇见不普通的线索。",
    greeting: "奥斯卡扬了扬手中的香肠：“来得正好。先声明，试吃免费，第二根可就要收钱了。”",
    defaultResponse: "奥斯卡摸了摸下巴：“这个问题有点意思。让我准备点吃的，我们边走边聊，答案说不定自己就冒出来了。”",
    dialogues: [
      { prompt: "陪你去集市寻找香料", keywords: ["集市", "香料", "采购"], response: "“成交！”奥斯卡立刻收好摊位，“有你帮忙砍价，今天说不定还能省下一枚银魂币。”", affection: 2 },
      { prompt: "食物系魂师如何战斗？", keywords: ["食物系", "战斗", "辅助"], response: "“让该站着的人继续站着，就是我的战斗。”他难得认真起来，“真正危险的时候，一根香肠能决定所有人能不能回来。”", affection: 2 },
      { prompt: "你的香肠能换个名字吗？", keywords: ["香肠", "名字", "魂咒"], response: "奥斯卡夸张地叹气：“名字可以商量，魂咒可没得选。不过看在你没有笑出声的份上，算你有品位。”", affection: 1 },
    ],
  },
  {
    id: "ning-rongrong",
    name: "宁荣荣",
    title: "七宝琉璃宗魂师",
    affiliation: "史莱克学院",
    martialSoul: "七宝琉璃塔",
    image: "/game-assets/ning-rongrong.png",
    tone: "gold",
    profile: "出身上三宗，知识与眼界远超同龄人。骄傲之外，她正在学习如何成为可以交付后背的伙伴。",
    story: "她收到一封来自宗门的密信，却发现封口魂力被人触碰过。宁荣荣希望你陪她查清是谁在学院外窥探七宝琉璃宗。",
    greeting: "宁荣荣合上手里的信：“既然来了，就坐吧。我正好需要一个不会把秘密随便说出去的人。”",
    defaultResponse: "她轻轻转动指间的琉璃坠饰：“我会考虑你的话。至少，你愿意当面告诉我，而不是在背后议论。”",
    dialogues: [
      { prompt: "我陪你调查那封密信", keywords: ["密信", "调查", "陪你"], response: "“那就从封口的魂力残留查起。”宁荣荣把信递给你，“这件事暂时只告诉你，别让我看错人。”", affection: 2 },
      { prompt: "七宝琉璃塔如何辅助队友？", keywords: ["七宝", "琉璃塔", "辅助"], response: "“速度、力量，以及战局中最需要被放大的那一点优势。”她抬起手，“优秀的辅助不是站在最后，而是比所有人更早看懂战场。”", affection: 2 },
      { prompt: "你习惯学院生活了吗？", keywords: ["学院生活", "习惯", "伙伴"], response: "宁荣荣别开视线：“这里和宗门完全不同……但有人敢直接指出我的问题，也不算一件坏事。”", affection: 1 },
    ],
  },
];

type NpcActionTemplate = {
  id: NpcActionId;
  characterId: CharacterId;
  kind: NpcActionKind;
  minTurn: number;
  title: string;
  narrative: string;
  reason: string;
};

type NpcActionResponse = {
  label: string;
  narrative: string;
  note: string;
  relationDelta: number;
  memory: string;
};

const npcActionTemplates: NpcActionTemplate[] = [
  { id: "xiao-wu-visit", characterId: "xiao-wu", kind: "visit", minTurn: 1, title: "小舞找到了你", narrative: "你刚把线索整理好，小舞便从学院方向追了过来。她想亲口问问你刚才经历的事。", reason: "小舞好感达到 30，且你已经留下第一段可追踪经历。" },
  { id: "dai-mubai-conflict", characterId: "dai-mubai", kind: "conflict", minTurn: 2, title: "戴沐白拦住去路", narrative: "戴沐白听说了你最近的行动。他挡在路中央，直言真正的线索不该交给一个尚未证明实力的人。", reason: "戴沐白对你的了解仍少于 25，好胜心让他选择正面试探。" },
  { id: "ning-rongrong-romance", characterId: "ning-rongrong", kind: "romance", minTurn: 3, title: "宁荣荣的含蓄邀约", narrative: "夜色落下后，宁荣荣送来一张短笺。等你赴约，她故作随意地问：以后的调查，能不能也算她一份？", reason: "宁荣荣好感达到 40，共同经历让她愿意主动靠近。" },
  { id: "oscar-quest", characterId: "oscar", kind: "quest", minTurn: 4, title: "奥斯卡带来委托", narrative: "奥斯卡抱着封好的木匣赶来。他记得你擅长从细节找线索，想请你一起把木匣送到药草园。", reason: "你已经积累多段人物记忆，奥斯卡判断你适合处理这项委托。" },
];

const npcActionResponses: Record<NpcActionId, [NpcActionResponse, NpcActionResponse]> = {
  "xiao-wu-visit": [
    { label: "把线索完整告诉她", narrative: "你把沿途所见一一告诉小舞。她认真听完，提醒你下次别再独自追得那么急。", note: "小舞记住了你的信任，并答应共同调查。", relationDelta: 3, memory: "你愿意分享线索，并接受她一起调查的提议。" },
    { label: "先问她为何在意", narrative: "你反问她为什么如此在意。小舞承认，她担心那股魂力会伤到学院里的人。", note: "小舞透露了对学院安全的担忧，但仍在等你的答案。", relationDelta: 1, memory: "你谨慎追问她的动机，没有轻易交出全部线索。" },
  ],
  "dai-mubai-conflict": [
    { label: "接受他的正面试探", narrative: "短暂的魂力碰撞后，戴沐白收起敌意，承认你有资格继续追查。", note: "这场冲突以互相尊重结束。", relationDelta: 2, memory: "你接受了他的实力试探，并在压力下没有退让。" },
    { label: "指出争斗会惊动目标", narrative: "你指向正在消失的脚印。戴沐白虽然让开了路，神情却仍有些不服。", note: "你避免了无意义的战斗。", relationDelta: -1, memory: "你拒绝争斗，用正在消失的线索迫使他让路。" },
  ],
  "ning-rongrong-romance": [
    { label: "答应以后一起行动", narrative: "你答应把她算进今后的计划。宁荣荣掩住笑意，把早已准备好的联络玉牌塞进你手里。", note: "两人的关系出现了更亲密的可能。", relationDelta: 4, memory: "你接受她的邀约，约定今后共同调查与行动。" },
    { label: "先以伙伴身份相处", narrative: "你坦白说还需要更多时间了解彼此。宁荣荣点头，仍把联络玉牌留给了你。", note: "关系暂时停留在可靠伙伴。", relationDelta: 0, memory: "你认真回应了她的心意，但希望先以伙伴身份相处。" },
  ],
  "oscar-quest": [
    { label: "接下护送与调查委托", narrative: "你接过木匣，奥斯卡明显松了口气。一条新的调查路线就此展开。", note: "新任务：护送木匣前往药草园。", relationDelta: 3, memory: "你接下他的委托，并承诺调查沿途尾随者。" },
    { label: "要求先检查木匣", narrative: "你先检查封条。奥斯卡很快同意，并称赞你没有被“任务”两个字冲昏头。", note: "木匣内部有稳定的植物系魂力波动。", relationDelta: 1, memory: "你在接受委托前坚持检查木匣与风险。" },
  ],
};

const actionKindLabels: Record<NpcActionKind, string> = {
  visit: "主动拜访",
  conflict: "主动冲突",
  romance: "主动心意",
  quest: "主动任务",
};

const tabs = [
  { id: "story" as const, label: "剧情", Icon: ReaderIcon },
  { id: "world" as const, label: "世界", Icon: GlobeIcon },
  { id: "relations" as const, label: "关系", Icon: PersonIcon },
  { id: "bag" as const, label: "行囊", Icon: BackpackIcon },
  { id: "archive" as const, label: "档案", Icon: ArchiveIcon },
];

const ENEMIES: EnemyDefinition[] = [
  {
    id: "ripple-snake",
    name: "涟水蛇",
    title: "百年水系魂兽",
    attribute: "水",
    maxHp: 118,
    attack: 28,
    defense: 13,
    speed: 20,
    expReward: 330,
    coinReward: 7,
    lootId: "healing_herb",
  },
  {
    id: "ember-fox",
    name: "赤炎狐",
    title: "百年火系魂兽",
    attribute: "火",
    maxHp: 136,
    attack: 33,
    defense: 15,
    speed: 26,
    expReward: 390,
    coinReward: 9,
    lootId: "focus_incense",
  },
  {
    id: "stone-boar",
    name: "岩甲野猪",
    title: "百年兽系魂兽",
    attribute: "兽",
    maxHp: 156,
    attack: 36,
    defense: 21,
    speed: 16,
    expReward: 450,
    coinReward: 11,
    lootId: "healing_herb",
  },
];

function getCharacter(characterId: CharacterId) {
  return characters.find((character) => character.id === characterId)!;
}

function getNpcAction(actionId: NpcActionId | null) {
  return actionId ? npcActionTemplates.find((action) => action.id === actionId) ?? null : null;
}

function addNpcMemory(memories: NpcMemory[], memory: Omit<NpcMemory, "id">) {
  const duplicateIndex = memories.findIndex(
    (item) => item.characterId === memory.characterId && item.title === memory.title,
  );
  const next = duplicateIndex >= 0 ? memories.filter((_, index) => index !== duplicateIndex) : memories;
  return [...next, { ...memory, id: `${memory.characterId}-${memory.turn}-${next.length + 1}` }].slice(-40);
}

function chooseMemoryWitness(text: string, relationships: Record<CharacterId, number>) {
  const mentioned = characters.find((character) => text.includes(character.name));
  if (mentioned) return mentioned.id;
  if (/战|实力|对练|强攻/.test(text)) return "dai-mubai" as const;
  if (/森林|魂兽|追|伙伴/.test(text)) return "xiao-wu" as const;
  if (/药|食物|线索|调查/.test(text)) return "oscar" as const;
  return characters.reduce((best, character) => (
    relationships[character.id] > relationships[best.id] ? character : best
  )).id;
}

function selectNpcAction(game: GameState) {
  if (game.pendingNpcAction) return game.pendingNpcAction;
  const completed = new Set(game.npcActionLog.map((action) => action.actionId));
  const eligible = npcActionTemplates.find((action) => {
    if (completed.has(action.id) || game.turns < action.minTurn) return false;
    if (action.id === "xiao-wu-visit") return game.relationships["xiao-wu"] >= 30;
    if (action.id === "dai-mubai-conflict") return game.relationships["dai-mubai"] < 25;
    if (action.id === "ning-rongrong-romance") return game.relationships["ning-rongrong"] >= 40;
    return game.npcMemories.length >= 3;
  });
  return eligible?.id ?? null;
}

function resetPhoneViewport() {
  const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]');
  if (screen) screen.scrollTop = 0;
}

function soulExperienceRequired(level: number) {
  return 1200 + level * 50;
}

function getTalentBonus(talent: string) {
  if (talent === "怪物档") return 4;
  if (talent === "天才档") return 2;
  if (talent === "普通档") return 1;
  return 0;
}

function getStats(game: GameState): CharacterStats {
  const talent = getTalentBonus(game.talent);
  const stats: CharacterStats = {
    maxHp: 80 + game.soulPower * 6 + talent * 3,
    attack: 16 + game.soulPower * 2 + talent,
    defense: 8 + Math.floor(game.soulPower * 1.2) + talent,
    speed: 10 + game.soulPower + talent,
    control: 14 + Math.floor(game.soulPower * 1.5) + talent * 2,
  };

  for (const itemId of Object.values(game.equipment)) {
    const bonus = itemId ? ITEMS[itemId]?.bonus : undefined;
    if (!bonus) continue;
    stats.maxHp += bonus.maxHp ?? 0;
    stats.attack += bonus.attack ?? 0;
    stats.defense += bonus.defense ?? 0;
    stats.speed += bonus.speed ?? 0;
    stats.control += bonus.control ?? 0;
  }
  return stats;
}

function hydrateGame(value: Partial<GameState> | null | undefined): GameState {
  const hasStructuredStory =
    typeof value?.storyNarrative === "string" &&
    Array.isArray(value?.storyHistory) &&
    typeof value?.currentStoryNodeId === "string";
  const merged: GameState = {
    ...initialGame,
    ...value,
    inventory: { ...initialGame.inventory, ...(value?.inventory ?? {}) },
    equipment: { ...initialGame.equipment, ...(value?.equipment ?? {}) },
    relationships: { ...initialRelationships, ...(value?.relationships ?? {}) },
    dialogueHistory: trimDialogueHistory(value?.dialogueHistory),
    npcMemories: Array.isArray(value?.npcMemories) ? value.npcMemories : [],
    npcActionLog: Array.isArray(value?.npcActionLog) ? value.npcActionLog : [],
    pendingNpcAction: value?.pendingNpcAction && npcActionTemplates.some((action) => action.id === value.pendingNpcAction)
      ? value.pendingNpcAction
      : null,
    recentRelationChange: value?.recentRelationChange ?? null,
    soulRings: Array.isArray(value?.soulRings) && value.soulRings.length > 0 ? value.soulRings : initialGame.soulRings,
    storyFlags: Array.isArray(value?.storyFlags) ? value.storyFlags : [],
    storyHistory: Array.isArray(value?.storyHistory) ? value.storyHistory : [],
    completedEndings: Array.isArray(value?.completedEndings) ? value.completedEndings : [],
    currentStoryNodeId: hasStructuredStory ? (value?.currentStoryNodeId ?? initialGame.currentStoryNodeId) : initialGame.currentStoryNodeId,
    storyNarrative: hasStructuredStory ? (value?.storyNarrative ?? initialGame.storyNarrative) : initialGame.storyNarrative,
    storyNote: hasStructuredStory ? (value?.storyNote ?? initialGame.storyNote) : initialGame.storyNote,
    storySummary: typeof value?.storySummary === "string" ? value.storySummary.slice(0, 600) : "",
    storySummaryThroughTurn: Math.max(0, Math.min(value?.turns ?? 0, value?.storySummaryThroughTurn ?? 0)),
  };
  const maxHp = getStats(merged).maxHp;
  return { ...merged, currentHp: Math.max(1, Math.min(merged.currentHp || maxHp, maxHp)) };
}

function createSession(game: GameState, title = "进入诺丁城"): GameSession {
  const now = new Date().toISOString();
  const root: TimelineNode = {
    id: "node-1",
    parentId: null,
    branchId: "主时间线",
    sequence: 1,
    turn: game.turns,
    title,
    summary: "角色与世界状态已经记录，可以随时回到这里。",
    createdAt: now,
    snapshot: game,
  };
  return {
    version: 2,
    game,
    nodes: [root],
    currentNodeId: root.id,
    nextNodeNumber: 2,
    nextBranchNumber: 1,
    savedAt: now,
  };
}

function loadSavedSession(): GameSession | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSession>;
      if (parsed.version === 2 && parsed.game && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        const nodes = parsed.nodes.map((node) => ({ ...node, snapshot: hydrateGame(node.snapshot) }));
        const currentNodeId = nodes.some((node) => node.id === parsed.currentNodeId)
          ? (parsed.currentNodeId as string)
          : nodes[nodes.length - 1].id;
        return {
          version: 2,
          game: hydrateGame(parsed.game),
          nodes,
          currentNodeId,
          nextNodeNumber: parsed.nextNodeNumber ?? nodes.length + 1,
          nextBranchNumber: parsed.nextBranchNumber ?? 1,
          savedAt: parsed.savedAt ?? new Date().toISOString(),
        };
      }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_SAVE_KEY);
    if (!legacyRaw) return null;
    const legacyGame = hydrateGame(JSON.parse(legacyRaw) as Partial<GameState>);
    return createSession(legacyGame, "旧版存档迁移");
  } catch {
    return null;
  }
}

function appendTimelineNode(
  session: GameSession,
  nextGame: GameState,
  event: TimelineEvent,
  options?: { parentId?: string; forceNewBranch?: boolean },
): GameSession {
  const parentId = options?.parentId ?? session.currentNodeId;
  const parent = session.nodes.find((node) => node.id === parentId) ?? session.nodes[session.nodes.length - 1];
  const hasExistingChild = session.nodes.some((node) => node.parentId === parent.id);
  const startsNewBranch = Boolean(options?.forceNewBranch || hasExistingChild);
  const branchId = startsNewBranch ? `支线 ${session.nextBranchNumber}` : parent.branchId;
  const node: TimelineNode = {
    id: `node-${session.nextNodeNumber}`,
    parentId: parent.id,
    branchId,
    sequence: session.nextNodeNumber,
    turn: nextGame.turns,
    title: event.title,
    summary: event.summary,
    createdAt: new Date().toISOString(),
    snapshot: nextGame,
  };
  return {
    ...session,
    game: nextGame,
    nodes: [...session.nodes, node],
    currentNodeId: node.id,
    nextNodeNumber: session.nextNodeNumber + 1,
    nextBranchNumber: session.nextBranchNumber + (startsNewBranch ? 1 : 0),
    savedAt: new Date().toISOString(),
  };
}

function gainSoulExperience(game: GameState, amount: number): GameState {
  const oldMaxHp = getStats(game).maxHp;
  let soulPower = game.soulPower;
  let soulProgress = game.soulProgress + amount;
  while (soulPower < 99 && soulProgress >= soulExperienceRequired(soulPower)) {
    soulProgress -= soulExperienceRequired(soulPower);
    soulPower += 1;
  }
  const leveled = { ...game, soulPower, soulProgress };
  const newMaxHp = getStats(leveled).maxHp;
  return { ...leveled, currentHp: Math.min(newMaxHp, game.currentHp + (newMaxHp - oldMaxHp)) };
}

function updateInventory(game: GameState, itemId: string, delta: number): GameState {
  const quantity = Math.max(0, (game.inventory[itemId] ?? 0) + delta);
  return { ...game, inventory: { ...game.inventory, [itemId]: quantity } };
}

function applyStoryChoice(game: GameState, choiceId: string, customAction?: string): GameState {
  const resolution = resolveStoryChoice(game, choiceId, customAction);
  if (!resolution) return game;
  const destination = getStoryNode({ ...game, currentStoryNodeId: resolution.nextNodeId });
  const relationship = Math.max(0, Math.min(100, game.relationship + resolution.relationship));
  const xiaoWuScore = Math.max(0, Math.min(100, game.relationships["xiao-wu"] + resolution.relationship));
  let next: GameState = {
    ...game,
    turns: game.turns + 1,
    coins: Math.max(0, game.coins + resolution.coins),
    relationship,
    relationships: { ...game.relationships, "xiao-wu": xiaoWuScore },
    currentStoryNodeId: resolution.nextNodeId,
    storyFlags: resolution.flags,
    storyHistory: [...game.storyHistory, resolution.historyEntry],
    completedEndings:
      resolution.endingName && !game.completedEndings.includes(resolution.endingName)
        ? [...game.completedEndings, resolution.endingName]
        : game.completedEndings,
    lastStoryChange: resolution.lastChange,
    location: destination.location,
    season: destination.season,
    narrative: resolution.narrative,
    note: resolution.note,
    storyNarrative: resolution.narrative,
    storyNote: resolution.note,
  };
  if (resolution.rewardItemId) next = updateInventory(next, resolution.rewardItemId, 1);
  return gainSoulExperience(next, resolution.experience);
}

function attributeMultiplier(attacker: SoulAttribute, defender: SoulAttribute) {
  if (attacker === "无" || defender === "无" || attacker === "兽" || defender === "兽") return 1;
  if (
    (attacker === "植物" && defender === "水") ||
    (attacker === "水" && defender === "火") ||
    (attacker === "火" && defender === "植物")
  ) {
    return 1.35;
  }
  if (
    (attacker === "水" && defender === "植物") ||
    (attacker === "火" && defender === "水") ||
    (attacker === "植物" && defender === "火")
  ) {
    return 0.75;
  }
  return 1;
}

function getCounterText(attacker: SoulAttribute, defender: SoulAttribute) {
  const multiplier = attributeMultiplier(attacker, defender);
  if (multiplier > 1) return `克制 · 伤害 ×${multiplier.toFixed(2)}`;
  if (multiplier < 1) return `被克制 · 伤害 ×${multiplier.toFixed(2)}`;
  return "中性 · 无伤害修正";
}

function calculateDamage(attack: number, defense: number, power: number, multiplier: number) {
  return Math.max(5, Math.floor(attack * power * multiplier - defense * 0.42));
}

function getRelationshipLabel(score: number) {
  if (score >= 80) return "羁绊";
  if (score >= 60) return "信赖";
  if (score >= 40) return "好友";
  if (score >= 20) return "熟悉";
  return "初识";
}

function getLocationByName(name: string) {
  return locations.find((location) => location.name === name) ?? locations[0];
}

function getTravelStoryNode(locationId: LocationId) {
  if (locationId === "star-forest") return "forest_edge";
  if (locationId === "shrek-academy") return "shrek_gate";
  return "notting_street";
}

function createLocalStorySummary(previousSummary: string, events: TimelineNode[]) {
  const recent = events
    .map((event) => `第${event.turn}轮「${event.title}」：${event.summary}`)
    .join("；");
  const combined = [previousSummary ? `此前：${previousSummary}` : "", recent ? `本阶段：${recent}` : ""]
    .filter(Boolean)
    .join("。 ");
  if (combined.length <= 600) return combined;
  return `${combined.slice(0, 280)}……${combined.slice(-300)}`;
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const savedSession = useMemo(loadSavedSession, []);
  const [stage, setStage] = useState<Stage>(savedSession ? "game" : "welcome");
  const [activeTab, setActiveTab] = useState<TabId>("story");
  const [session, setSession] = useState<GameSession>(() => savedSession ?? createSession(initialGame));
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("原创角色");
  const [talent, setTalent] = useState("天才档");
  const [customOpen, setCustomOpen] = useState(false);
  const [customAction, setCustomAction] = useState("");
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState("");
  const [bagMode, setBagMode] = useState<BagMode>("inventory");
  const [selectedItem, setSelectedItem] = useState<{ id: string; source: BagMode } | null>(null);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<LocationId | null>(null);
  const [travelingTo, setTravelingTo] = useState<LocationId | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId | null>(null);
  const [dialogueSending, setDialogueSending] = useState<CharacterId | null>(null);
  const summaryAttemptKeyRef = useRef("");
  const game = session.game;
  const stats = useMemo(() => getStats(game), [game]);
  const selectedLocation = selectedLocationId
    ? locations.find((location) => location.id === selectedLocationId) ?? null
    : null;
  const selectedCharacter = selectedCharacterId
    ? characters.find((character) => character.id === selectedCharacterId) ?? null
    : null;
  const currentStoryNode = getStoryNode(game);
  const music = useDynamicGameMusic({
    stage,
    activeTab,
    location: game.location,
    chapter: currentStoryNode.chapter,
    inCombat: combat?.status === "active",
  });

  useEffect(() => {
    if (stage !== "game") return;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(session));
  }, [session, stage]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (stage !== "game" || thinking || dialogueSending) return;
    const summarizedThrough = game.storySummaryThroughTurn;
    if (game.turns - summarizedThrough < STORY_SUMMARY_INTERVAL) return;

    const targetTurn = game.turns;
    const targetNodeId = session.currentNodeId;
    const attemptKey = `${targetNodeId}:${targetTurn}:${summarizedThrough}`;
    if (summaryAttemptKeyRef.current === attemptKey) return;
    summaryAttemptKeyRef.current = attemptKey;

    const events = session.nodes
      .filter((node) => node.turn > summarizedThrough && node.turn <= targetTurn)
      .slice(-STORY_SUMMARY_EVENT_LIMIT);
    if (events.length === 0) return;

    const node = getStoryNode(game);
    const fallbackSummary = createLocalStorySummary(game.storySummary, events);
    void (async () => {
      let summary = fallbackSummary;
      try {
        const result = await generateAiSummary({
          previousSummary: game.storySummary,
          events: events.map((event) => ({ turn: event.turn, title: event.title, summary: event.summary })),
          current: {
            location: game.location,
            chapter: node.chapter,
            quest: node.quest,
            flags: game.storyFlags,
          },
        });
        summary = result.summary;
      } catch {
        summary = fallbackSummary;
      }

      setSession((current) => {
        if (current.currentNodeId !== targetNodeId || current.game.storySummaryThroughTurn >= targetTurn) {
          return current;
        }
        const updatedGame = hydrateGame({
          ...current.game,
          storySummary: summary,
          storySummaryThroughTurn: targetTurn,
        });
        return {
          ...current,
          game: updatedGame,
          nodes: current.nodes.map((timelineNode) => (
            timelineNode.id === current.currentNodeId ? { ...timelineNode, snapshot: updatedGame } : timelineNode
          )),
          savedAt: new Date().toISOString(),
        };
      });
    })();
  }, [dialogueSending, game.storySummary, game.storySummaryThroughTurn, game.turns, session.currentNodeId, stage, thinking]);

  const commitGame = (transform: (current: GameState) => GameState, event: TimelineEvent) => {
    setSession((current) => appendTimelineNode(current, hydrateGame(transform(current.game)), event));
  };

  const beginGame = () => {
    const base = { ...initialGame, name: name.trim() || "无名", identity, talent };
    const nextGame = { ...base, currentHp: getStats(base).maxHp };
    keyboard.hide();
    setSession(createSession(nextGame));
    music.playEvent("martial_soul_awakened");
    window.setTimeout(() => {
      resetPhoneViewport();
      setStage("game");
      setActiveTab("story");
    }, 300);
  };

  const chooseStory = (choiceId: string) => {
    if (thinking) return;
    const node = getStoryNode(game);
    const choice = node.choices.find((item) => item.id === choiceId);
    const resolution = resolveStoryChoice(game, choiceId);
    if (!choice || !resolution) return;
    setThinking(true);
    window.setTimeout(() => {
      commitGame(
        (current) => {
          const advanced = applyStoryChoice(current, choiceId);
          const witnessId = chooseMemoryWitness(`${choice.label}${resolution.note}`, advanced.relationships);
          const next: GameState = {
            ...advanced,
            npcMemories: addNpcMemory(advanced.npcMemories, {
              characterId: witnessId,
              turn: advanced.turns,
              source: "行动",
              title: `${node.title}：${choice.label}`,
              detail: `${getCharacter(witnessId).name}记住了这次选择。${resolution.note}`,
              important: true,
            }),
            recentRelationChange: null,
          };
          return { ...next, pendingNpcAction: selectNpcAction(next) };
        },
        { title: `${node.title} · ${choice.label}`, summary: resolution.note },
      );
      setToast(resolution.lastChange);
      setThinking(false);
    }, 720);
  };

  const submitCustomAction = async () => {
    const action = customAction.trim();
    if (!action || thinking) return;
    const node = getStoryNode(game);
    const defaultChoice = getDefaultCustomChoice(game);
    if (!defaultChoice) {
      setToast("当前结局已经完成，请开启新的时间线");
      return;
    }
    const resolution = resolveStoryChoice(game, defaultChoice.id, action);
    if (!resolution) return;

    keyboard.hide();
    setCustomOpen(false);
    setCustomAction("");
    setThinking(true);
    window.setTimeout(resetPhoneViewport, 320);

    let aiResult: AiActionResult | null = null;
    try {
      aiResult = await generateAiAction({
        action,
        player: {
          name: game.name,
          identity: game.identity,
          talent: game.talent,
          soulPower: game.soulPower,
        },
        scene: {
          chapter: node.chapter,
          title: node.title,
          location: node.location,
          narrative: game.storyNarrative,
          localOutcome: resolution.narrative,
        },
        storySummary: game.storySummary,
        flags: game.storyFlags,
        memories: game.npcMemories.map((memory) => `${getCharacter(memory.characterId).name}：${memory.detail}`),
      });
    } catch {
      aiResult = null;
    }

    try {
      commitGame(
        (current) => {
          const advanced = applyStoryChoice(current, defaultChoice.id, action);
          const witnessId = chooseMemoryWitness(action, advanced.relationships);
          const next: GameState = {
            ...advanced,
            narrative: aiResult?.narrative ?? advanced.narrative,
            note: aiResult?.note ?? advanced.note,
            storyNarrative: aiResult?.narrative ?? advanced.storyNarrative,
            storyNote: aiResult?.note ?? advanced.storyNote,
            lastStoryChange: aiResult ? `AI 动态剧情 · ${advanced.lastStoryChange}` : advanced.lastStoryChange,
            npcMemories: addNpcMemory(advanced.npcMemories, {
              characterId: witnessId,
              turn: advanced.turns,
              source: "行动",
              title: "你选择了自己的道路",
              detail: aiResult?.memory ?? `${getCharacter(witnessId).name}记住了你的决定：“${action}”。`,
              important: true,
            }),
            recentRelationChange: null,
          };
          return { ...next, pendingNpcAction: selectNpcAction(next) };
        },
        { title: `${getStoryNode(game).title} · 自由行动`, summary: action },
      );
      setToast(aiResult ? "AI 已生成新的剧情分支" : "AI 暂不可用，已用本地剧情推进");
    } finally {
      setThinking(false);
    }
  };

  const restartStory = () => {
    commitGame(
      (current) => ({
        ...current,
        currentStoryNodeId: "notting_street",
        storyFlags: [],
        storyHistory: [],
        storySummary: "",
        storySummaryThroughTurn: current.turns,
        storyCycle: current.storyCycle + 1,
        lastStoryChange: `第 ${current.storyCycle + 1} 条时间线已经开启`,
        location: "诺丁城",
        season: "三月·午后",
        narrative: "熟悉的雨再次落在诺丁城。你不记得上一条时间线的所有细节，却知道这一次，每个选择都可能把大陆带向不同未来。",
        note: "已发现的结局会保留在档案中；新的剧情状态从诺丁城重新开始。",
        storyNarrative: "熟悉的雨再次落在诺丁城。你不记得上一条时间线的所有细节，却知道这一次，每个选择都可能把大陆带向不同未来。",
        storyNote: "已发现的结局会保留在档案中；新的剧情状态从诺丁城重新开始。",
      }),
      { title: "开启新的剧情时间线", summary: `保留 ${game.completedEndings.length} 个已发现结局，重新回到诺丁城。` },
    );
    setToast("新的剧情时间线已开启");
    window.setTimeout(resetPhoneViewport, 320);
  };

  const train = () => {
    const willLevel = game.soulProgress + 120 >= soulExperienceRequired(game.soulPower);
    commitGame(
      (current) => {
        const trained = gainSoulExperience({ ...current, turns: current.turns + 1 }, 120);
        return { ...trained, currentHp: Math.min(getStats(trained).maxHp, trained.currentHp + 12) };
      },
      { title: "冥想修炼", summary: "运转魂力一个周天，恢复状态并积累 120 点魂力经验。" },
    );
    setToast(willLevel ? "修炼突破，魂力等级提升" : "修炼完成，魂力经验 +120");
    if (willLevel) music.playEvent("level_breakthrough");
  };

  const openLocation = (locationId: LocationId) => {
    setCustomOpen(false);
    setSelectedItem(null);
    setCombat(null);
    setSelectedCharacterId(null);
    setSelectedLocationId(locationId);
  };

  const travelTo = (location: WorldLocation) => {
    if (!location.unlocked || location.name === game.location || travelingTo) return;

    keyboard.hide();
    setTravelingTo(location.id);
    window.setTimeout(() => {
      commitGame(
        (current) =>
          gainSoulExperience(
            {
              ...current,
              location: location.name,
              season: location.season,
              currentStoryNodeId: getTravelStoryNode(location.id),
              narrative: location.arrival,
              note: location.note,
              storyNarrative: location.arrival,
              storyNote: location.note,
              lastStoryChange: `旅行抵达 · ${location.name}`,
              turns: current.turns + 1,
            },
            20,
          ),
        { title: `抵达${location.name}`, summary: location.note },
      );
      setTravelingTo(null);
      setSelectedLocationId(null);
      setActiveTab("story");
      setToast(`已抵达${location.name}，魂力经验 +20`);
      window.setTimeout(resetPhoneViewport, 320);
    }, 720);
  };

  const openCharacter = (characterId: CharacterId) => {
    setCustomOpen(false);
    setSelectedItem(null);
    setCombat(null);
    setSelectedLocationId(null);
    setSelectedCharacterId(characterId);
  };

  const sendCharacterMessage = async (character: CharacterProfile, rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || dialogueSending) return;

    keyboard.hide();
    const dialogue = character.dialogues.find(
      (item) => item.prompt === message || item.keywords.some((keyword) => message.includes(keyword)),
    );
    const localResponse = dialogue?.response ?? character.defaultResponse;
    const localAffection = dialogue?.affection ?? 1;
    const rememberedMessage = message.length > 96 ? `${message.slice(0, 94)}……` : message;
    setDialogueSending(character.id);

    let aiResult: AiDialogueResult | null = null;
    try {
      aiResult = await generateAiDialogue({
        message,
        player: {
          name: game.name,
          identity: game.identity,
          soulPower: game.soulPower,
          location: game.location,
        },
        character: {
          name: character.name,
          title: character.title,
          martialSoul: character.martialSoul,
          profile: character.profile,
          affection: game.relationships[character.id] ?? initialRelationships[character.id],
        },
        storySummary: game.storySummary,
        history: game.dialogueHistory[character.id] ?? [],
        memories: game.npcMemories
          .filter((memory) => memory.characterId === character.id)
          .map((memory) => memory.detail),
      });
    } catch {
      aiResult = null;
    }

    const response = aiResult?.reply ?? localResponse;
    const affection = aiResult?.affectionDelta ?? localAffection;

    try {
      commitGame(
        (current) => {
          const history = current.dialogueHistory[character.id] ?? [];
          const turn = current.turns + 1;
          const oldAffection = current.relationships[character.id] ?? initialRelationships[character.id];
          const nextAffection = Math.max(0, Math.min(100, oldAffection + affection));
          const next: GameState = {
            ...current,
            turns: turn,
            relationship: character.id === "xiao-wu"
              ? Math.max(0, Math.min(100, current.relationship + affection))
              : current.relationship,
            relationships: {
              ...current.relationships,
              [character.id]: nextAffection,
            },
            dialogueHistory: {
              ...current.dialogueHistory,
              [character.id]: [
              ...history,
              { role: "player", text: message } as DialogueMessage,
              { role: "character", text: response } as DialogueMessage,
              ].slice(-DIALOGUE_MESSAGE_LIMIT),
            },
            npcMemories: addNpcMemory(current.npcMemories, {
              characterId: character.id,
              turn,
              source: "对话",
              title: dialogue?.prompt ?? `谈到“${rememberedMessage.slice(0, 16)}”`,
              detail: aiResult?.memory ?? `你说：“${rememberedMessage}” ${character.name}回应后，把这件事记了下来。`,
              important: affection >= 2 || /答应|约定|喜欢|秘密|以后/.test(message),
            }),
            recentRelationChange: { characterId: character.id, delta: affection },
            note: `你与${character.name}谈到了“${rememberedMessage}”。这段对话已经记录在人物关系中。`,
          };
          return { ...next, pendingNpcAction: selectNpcAction(next) };
        },
        { title: `与${character.name}交谈`, summary: message },
      );
      const affectionText = affection > 0 ? `+${affection}` : `${affection}`;
      setToast(aiResult ? `${character.name}已回应，好感 ${affectionText}` : "AI 暂不可用，已使用本地角色回应");
    } finally {
      setDialogueSending(null);
    }
  };

  const respondToNpcAction = (responseIndex: number) => {
    const activeAction = getNpcAction(game.pendingNpcAction);
    if (!activeAction) return;
    const selectedResponse = npcActionResponses[activeAction.id][responseIndex];
    commitGame(
      (current) => {
        const action = getNpcAction(current.pendingNpcAction);
        if (!action) return current;
        const response = npcActionResponses[action.id][responseIndex];
        const turn = current.turns + 1;
        return {
          ...current,
          turns: turn,
          pendingNpcAction: null,
          relationship: action.characterId === "xiao-wu"
            ? Math.max(0, Math.min(100, current.relationship + response.relationDelta))
            : current.relationship,
          relationships: {
            ...current.relationships,
            [action.characterId]: Math.max(0, Math.min(100, current.relationships[action.characterId] + response.relationDelta)),
          },
          npcMemories: addNpcMemory(current.npcMemories, {
            characterId: action.characterId,
            turn,
            source: action.kind === "visit" ? "拜访" : action.kind === "conflict" ? "冲突" : action.kind === "romance" ? "心意" : "任务",
            title: action.title,
            detail: response.memory,
            important: true,
          }),
          npcActionLog: [
            ...current.npcActionLog,
            { actionId: action.id, characterId: action.characterId, kind: action.kind, turn, resolution: response.label },
          ],
          recentRelationChange: { characterId: action.characterId, delta: response.relationDelta },
          narrative: response.narrative,
          note: response.note,
          storyNarrative: response.narrative,
          storyNote: response.note,
          lastStoryChange: `${getCharacter(action.characterId).name}主动行动 · 已回应`,
        };
      },
      { title: activeAction.title, summary: selectedResponse.note },
    );
    setToast(`${getCharacter(activeAction.characterId).name}的主动事件已回应`);
    window.setTimeout(resetPhoneViewport, 120);
  };

  const openCombat = () => {
    const enemy = ENEMIES[game.victories % ENEMIES.length];
    setCombat({
      enemyId: enemy.id,
      enemyHp: enemy.maxHp,
      playerHp: Math.min(game.currentHp, stats.maxHp),
      energy: 2,
      round: 1,
      status: "active",
      log: [`${enemy.name}挡住了去路。你的${game.martialSoul}已经展开。`],
    });
    music.playEvent("boss_appears");
  };

  const performCombatAction = (action: "basic" | "skill") => {
    if (!combat || combat.status !== "active") return;
    const enemy = ENEMIES.find((item) => item.id === combat.enemyId);
    if (!enemy || (action === "skill" && combat.energy < 2)) return;

    const isSkill = action === "skill";
    const attackAttribute: SoulAttribute = isSkill ? game.martialAttribute : "无";
    const multiplier = attributeMultiplier(attackAttribute, enemy.attribute);
    const damage = calculateDamage(stats.attack, enemy.defense, isSkill ? 1.25 : 0.88, multiplier);
    const enemyHp = Math.max(0, combat.enemyHp - damage);
    const energy = isSkill ? combat.energy - 2 : Math.min(4, combat.energy + 1);
    const stunned = isSkill && combat.round % 2 === 1 && stats.control >= enemy.speed;
    const nextLog = [
      `${isSkill ? FIRST_SOUL_RING.skillName : "普通攻击"}造成 ${damage} 点伤害${multiplier > 1 ? "，触发属性克制" : multiplier < 1 ? "，伤害受到压制" : ""}。`,
      ...combat.log,
    ];

    if (enemyHp <= 0) {
      const willLevel = game.soulProgress + enemy.expReward >= soulExperienceRequired(game.soulPower);
      setCombat({ ...combat, enemyHp: 0, energy, status: "won", log: [`战斗胜利，获得 ${enemy.expReward} 经验与 ${enemy.coinReward} 金魂币。`, ...nextLog] });
      commitGame(
        (current) => {
          const rewarded = updateInventory(
            {
              ...current,
              turns: current.turns + 1,
              victories: current.victories + 1,
              coins: current.coins + enemy.coinReward,
              currentHp: Math.max(1, combat.playerHp),
              narrative: `你在诺丁城外击败了${enemy.name}。${FIRST_SOUL_RING.skillName}在实战中变得更加凝练。`,
              note: `${enemy.name}的${enemy.attribute}属性已记录。战利品：${ITEMS[enemy.lootId].name}。`,
            },
            enemy.lootId,
            1,
          );
          return gainSoulExperience(rewarded, enemy.expReward);
        },
        { title: `战胜${enemy.name}`, summary: `获得 ${enemy.expReward} 经验、${enemy.coinReward} 金魂币和${ITEMS[enemy.lootId].name}。` },
      );
      setToast(willLevel ? "战斗突破，魂力等级提升" : "战利品已放入行囊");
      music.playEvent(willLevel ? "level_breakthrough" : "battle_victory");
      return;
    }

    if (stunned) {
      setCombat({
        ...combat,
        enemyHp,
        energy,
        round: combat.round + 1,
        log: [`蓝银草锁住了${enemy.name}，对方本轮无法反击。`, ...nextLog],
      });
      return;
    }

    const enemyMultiplier = attributeMultiplier(enemy.attribute, game.martialAttribute);
    const enemyDamage = calculateDamage(enemy.attack, stats.defense, 0.82, enemyMultiplier);
    const playerHp = Math.max(0, combat.playerHp - enemyDamage);
    const retaliateLog = `${enemy.name}反击，造成 ${enemyDamage} 点伤害${enemyMultiplier > 1 ? "，你受到属性克制" : enemyMultiplier < 1 ? "，伤害被武魂属性削弱" : ""}。`;

    if (playerHp <= 0) {
      setCombat({ ...combat, enemyHp, playerHp: 0, energy, status: "lost", log: ["你失去继续战斗的力量，只能暂时撤退。", retaliateLog, ...nextLog] });
      commitGame(
        (current) => ({
          ...current,
          turns: current.turns + 1,
          currentHp: 1,
          coins: Math.max(0, current.coins - 3),
          narrative: `你没能突破${enemy.name}的阻拦，只得带伤退回诺丁城。`,
          note: `战斗失败，损失 3 金魂币。可在行囊使用止血草后再次挑战。`,
        }),
        { title: `败退于${enemy.name}`, summary: "生命降至 1，损失 3 金魂币。" },
      );
      setToast("战斗失败，已保留本次时间节点");
      return;
    }

    setCombat({
      ...combat,
      enemyHp,
      playerHp,
      energy,
      round: combat.round + 1,
      log: [retaliateLog, ...nextLog],
    });
  };

  const useItem = (itemId: string) => {
    const item = ITEMS[itemId];
    if (!item?.effect || (game.inventory[itemId] ?? 0) <= 0) return;
    if (item.effect.kind === "heal" && game.currentHp >= stats.maxHp) {
      setToast("当前生命已满，无需使用");
      return;
    }
    const willLevel = item.effect.kind === "experience" && game.soulProgress + item.effect.amount >= soulExperienceRequired(game.soulPower);
    commitGame(
      (current) => {
        let next = updateInventory(current, itemId, -1);
        if (item.effect?.kind === "heal") {
          next = { ...next, currentHp: Math.min(getStats(next).maxHp, next.currentHp + item.effect.amount) };
        } else if (item.effect?.kind === "experience") {
          next = gainSoulExperience(next, item.effect.amount);
        }
        return next;
      },
      { title: `使用${item.name}`, summary: item.description },
    );
    setSelectedItem(null);
    setToast(willLevel ? "魂力突破，等级提升" : `${item.name}已使用`);
  };

  const buyItem = (itemId: string) => {
    const item = ITEMS[itemId];
    if (item.buyPrice === null || game.coins < item.buyPrice) return;
    commitGame(
      (current) => updateInventory({ ...current, coins: current.coins - (item.buyPrice ?? 0) }, itemId, 1),
      { title: `购买${item.name}`, summary: `花费 ${item.buyPrice} 金魂币。` },
    );
    setSelectedItem(null);
    setToast(`${item.name}已放入行囊`);
  };

  const sellItem = (itemId: string) => {
    const item = ITEMS[itemId];
    const equipped = item.slot ? game.equipment[item.slot] === itemId : false;
    if (item.sellPrice === null || (game.inventory[itemId] ?? 0) <= 0 || equipped) return;
    commitGame(
      (current) => updateInventory({ ...current, coins: current.coins + (item.sellPrice ?? 0) }, itemId, -1),
      { title: `出售${item.name}`, summary: `获得 ${item.sellPrice} 金魂币。` },
    );
    setSelectedItem(null);
    setToast(`获得 ${item.sellPrice} 金魂币`);
  };

  const toggleEquipment = (itemId: string) => {
    const item = ITEMS[itemId];
    if (!item.slot || (game.inventory[itemId] ?? 0) <= 0) return;
    const isEquipped = game.equipment[item.slot] === itemId;
    commitGame(
      (current) => ({
        ...current,
        equipment: { ...current.equipment, [item.slot as EquipmentSlot]: isEquipped ? null : itemId },
      }),
      { title: `${isEquipped ? "卸下" : "装备"}${item.name}`, summary: isEquipped ? "装备加成已移除。" : item.description },
    );
    setSelectedItem(null);
    setToast(isEquipped ? `${item.name}已卸下` : `${item.name}已装备`);
  };

  const rewindTo = (nodeId: string) => {
    if (game.rewinds <= 0 || nodeId === session.currentNodeId) return;
    setSession((current) => {
      const target = current.nodes.find((node) => node.id === nodeId);
      if (!target || current.game.rewinds <= 0) return current;
      const restored = hydrateGame({ ...target.snapshot, rewinds: current.game.rewinds - 1 });
      return appendTimelineNode(
        current,
        restored,
        { title: "时空回溯落点", summary: `回到“${target.title}”之后，原时间线完整保留。` },
        { parentId: target.id, forceNewBranch: true },
      );
    });
    setActiveTab("archive");
    setToast("已回到所选节点，旧分支仍被保留");
  };

  const saveNow = () => {
    setSession((current) => ({ ...current, savedAt: new Date().toISOString() }));
    setToast("完整存档与时间分支已保存");
  };

  const resetGame = () => {
    window.localStorage.removeItem(SAVE_KEY);
    window.localStorage.removeItem(LEGACY_SAVE_KEY);
    setSelectedLocationId(null);
    setSelectedCharacterId(null);
    setSelectedItem(null);
    setCombat(null);
    setSession(createSession(initialGame));
    setGameCreationDefaults();
    setStage("welcome");
    setActiveTab("story");
  };

  const setGameCreationDefaults = () => {
    setName("");
    setIdentity("原创角色");
    setTalent("天才档");
  };

  const selectedItemDefinition = selectedItem ? ITEMS[selectedItem.id] : null;
  const selectedItemEquipped = selectedItemDefinition?.slot
    ? game.equipment[selectedItemDefinition.slot] === selectedItemDefinition.id
    : false;

  return (
    <div className="game-shell">
      <MobileScroll className="game-scroll" key={`${stage}-${activeTab}-${game.turns}`}>
        {stage === "welcome" ? (
          <WelcomeScreen onStart={() => setStage("creation")} />
        ) : stage === "creation" ? (
          <CreationScreen
            name={name}
            identity={identity}
            talent={talent}
            onNameChange={setName}
            onIdentityChange={setIdentity}
            onTalentChange={setTalent}
            onBegin={beginGame}
          />
        ) : (
          <main className="screen-content game-content">
            {activeTab === "story" ? (
              <StoryScreen
                game={game}
                thinking={thinking}
                onChoose={chooseStory}
                onCustom={() => setCustomOpen(true)}
                onRestart={restartStory}
                onRespondToNpc={respondToNpcAction}
              />
            ) : null}
            {activeTab === "world" ? (
              <WorldScreen game={game} onBattle={openCombat} onSelectLocation={openLocation} />
            ) : null}
            {activeTab === "relations" ? (
              <RelationsScreen game={game} stats={stats} onTrain={train} onSelectCharacter={openCharacter} />
            ) : null}
            {activeTab === "bag" ? (
              <BagScreen
                game={game}
                stats={stats}
                mode={bagMode}
                onModeChange={setBagMode}
                onSelectItem={(id, source) => setSelectedItem({ id, source })}
              />
            ) : null}
            {activeTab === "archive" ? (
              <ArchiveScreen
                session={session}
                musicMuted={music.muted}
                musicReady={music.ready}
                onToggleMusic={music.toggleMuted}
                onSave={saveNow}
                onRewind={rewindTo}
                onReset={resetGame}
              />
            ) : null}
          </main>
        )}
      </MobileScroll>

      {stage === "game" ? (
        <nav className="bottom-nav" aria-label="游戏主导航">
          {tabs.map(({ id, label, Icon }) => (
            <button
              className={activeTab === id ? "nav-button active" : "nav-button"}
              key={id}
              type="button"
              onClick={() => {
                keyboard.hide();
                setSelectedLocationId(null);
                setSelectedCharacterId(null);
                setActiveTab(id);
                window.setTimeout(resetPhoneViewport, 320);
              }}
              aria-label={label}
              aria-current={activeTab === id ? "page" : undefined}
            >
              <Icon width={21} height={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {toast ? (
        <div className="save-toast" role="status">
          <CheckCircledIcon />
          {toast}
        </div>
      ) : null}

      <BottomSheet
        open={customOpen}
        onOpenChange={setCustomOpen}
        title="你想怎么做？"
        description="自由行动会改变当前时间线，系统会保留这次选择。"
        snap={0.55}
      >
        <div className="custom-action-sheet">
          <label htmlFor="custom-action">描述你的行动</label>
          <KeyboardTextarea
            id="custom-action"
            value={customAction}
            onChange={(event) => setCustomAction(event.target.value)}
            placeholder="例如：先去铁匠铺打听脚印的主人……"
            rows={4}
          />
          <button className="primary-button" type="button" onClick={submitCustomAction} disabled={!customAction.trim()}>
            <PaperPlaneIcon />
            推进时间线
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={selectedLocation !== null}
        onOpenChange={(open) => {
          if (!open && !travelingTo) setSelectedLocationId(null);
        }}
        title={selectedLocation?.name ?? "地点详情"}
        description={selectedLocation ? `${selectedLocation.region} · 风险 ${selectedLocation.risk}` : undefined}
        snap={0.58}
      >
        {selectedLocation ? (
          <LocationSheet
            location={selectedLocation}
            current={selectedLocation.name === game.location}
            traveling={travelingTo === selectedLocation.id}
            onTravel={() => travelTo(selectedLocation)}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={selectedCharacter !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCharacterId(null);
        }}
        title={selectedCharacter ? `${selectedCharacter.name} · 人物档案` : "人物档案"}
        description={selectedCharacter?.title}
        snap={0.86}
      >
        {selectedCharacter ? (
          <CharacterSheet
            character={selectedCharacter}
            score={game.relationships[selectedCharacter.id] ?? initialRelationships[selectedCharacter.id]}
            history={game.dialogueHistory[selectedCharacter.id] ?? []}
            memories={game.npcMemories.filter((memory) => memory.characterId === selectedCharacter.id)}
            sending={dialogueSending === selectedCharacter.id}
            onSend={(message) => sendCharacterMessage(selectedCharacter, message)}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedItemDefinition)}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
        title={selectedItemDefinition?.name ?? "物品"}
        description={selectedItemDefinition?.description}
        snap={0.48}
      >
        {selectedItemDefinition && selectedItem ? (
          <ItemActionSheet
            item={selectedItemDefinition}
            source={selectedItem.source}
            quantity={game.inventory[selectedItemDefinition.id] ?? 0}
            coins={game.coins}
            equipped={selectedItemEquipped}
            onUse={() => useItem(selectedItemDefinition.id)}
            onBuy={() => buyItem(selectedItemDefinition.id)}
            onSell={() => sellItem(selectedItemDefinition.id)}
            onEquip={() => toggleEquipment(selectedItemDefinition.id)}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(combat)}
        onOpenChange={(open) => {
          if (!open) setCombat(null);
        }}
        title="魂师实战"
        description="植物克水、水克火、火克植物；兽属性保持中性。"
        snap={0.88}
      >
        {combat ? (
          <CombatSheet
            game={game}
            stats={stats}
            combat={combat}
            enemy={ENEMIES.find((enemy) => enemy.id === combat.enemyId) ?? ENEMIES[0]}
            onAction={performCombatAction}
            onClose={() => setCombat(null)}
          />
        ) : null}
      </BottomSheet>
    </div>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="screen-content welcome-screen">
      <div className="welcome-emblem" aria-hidden="true">
        <img src="/game-assets/soul-meter.png" alt="" />
      </div>
      <p className="eyebrow">沉浸式开放世界文字 RPG</p>
      <h1>斗罗大陆<br />人生模拟器</h1>
      <p className="welcome-copy">
        实力为尊的大陆上，你的身份、立场与命运都由自己决定。原著时间线会继续运转，而你可以让它彻底改写。
      </p>
      <button className="primary-button start-button" type="button" onClick={onStart}>
        开始新的人生
        <ChevronRightIcon />
      </button>
      <div className="welcome-meta">
        <span>自由选择</span>
        <span>动态世界</span>
        <span>分支回溯</span>
      </div>
    </main>
  );
}

type CreationProps = {
  name: string;
  identity: string;
  talent: string;
  onNameChange: (value: string) => void;
  onIdentityChange: (value: string) => void;
  onTalentChange: (value: string) => void;
  onBegin: () => void;
};

function CreationScreen(props: CreationProps) {
  return (
    <main className="screen-content creation-screen">
      <div className="screen-heading">
        <span className="section-kicker">角色创建 · 第一步</span>
        <h1>你想成为谁？</h1>
        <p>这不是永久束缚，进入世界后仍然可以改变道路。</p>
      </div>

      <label className="field-label" htmlFor="character-name">角色姓名</label>
      <KeyboardInput
        id="character-name"
        className="text-field"
        value={props.name}
        onChange={(event) => props.onNameChange(event.target.value)}
        placeholder="输入你的名字"
      />

      <fieldset className="choice-fieldset">
        <legend>开局身份</legend>
        {[
          ["穿越者", "带着另一个世界的记忆醒来"],
          ["原著角色重生", "成为某位已存在的角色"],
          ["原创角色", "在大陆留下自己的名字"],
          ["自定义身份", "进入游戏后继续补充设定"],
        ].map(([title, detail], index) => (
          <button
            className={props.identity === title ? "selection-card selected" : "selection-card"}
            key={title}
            type="button"
            onClick={() => props.onIdentityChange(title)}
          >
            <span className="selection-index">{String.fromCharCode(65 + index)}</span>
            <span><strong>{title}</strong><small>{detail}</small></span>
            {props.identity === title ? <CheckCircledIcon /> : null}
          </button>
        ))}
      </fieldset>

      <fieldset className="choice-fieldset compact-grid">
        <legend>天赋强度</legend>
        {["凡人档", "普通档", "天才档", "怪物档"].map((item) => (
          <button
            className={props.talent === item ? "talent-chip selected" : "talent-chip"}
            key={item}
            type="button"
            onClick={() => props.onTalentChange(item)}
          >
            {item}
          </button>
        ))}
      </fieldset>

      <button className="primary-button creation-submit" type="button" onClick={props.onBegin}>
        进入斗罗大陆
        <MagicWandIcon />
      </button>
    </main>
  );
}

function StoryScreen({
  game,
  thinking,
  onChoose,
  onCustom,
  onRestart,
  onRespondToNpc,
}: {
  game: GameState;
  thinking: boolean;
  onChoose: (choiceId: string) => void;
  onCustom: () => void;
  onRestart: () => void;
  onRespondToNpc: (responseIndex: number) => void;
}) {
  const node = getStoryNode(game);
  const activeNpcAction = getNpcAction(game.pendingNpcAction);
  const activeNpcCharacter = activeNpcAction ? getCharacter(activeNpcAction.characterId) : null;
  const image = node.image ?? (node.location.includes("诺丁") ? "/game-assets/notting-city.png" : "/game-assets/world-map.png");
  return (
    <section className="story-screen" aria-label="当前剧情">
      <div className="story-chapter-bar"><span>{node.chapter}</span><strong>时间线 {game.storyCycle}</strong></div>
      <header className="location-bar">
        <span><DrawingPinIcon />{node.location} · {node.season}</span>
        <SunIcon />
      </header>
      <div className="story-art">
        <img src={image} alt={node.imageAlt ?? `${node.location}当前剧情场景`} />
        <span className="story-scene-title"><small>{node.quest}</small><strong>{node.title}</strong></span>
      </div>
      <article className="narrative-card">
        <p>{thinking ? "魂力在空气里轻轻震动，世界正在回应你的选择……" : game.storyNarrative}</p>
      </article>
      <div className="change-chip"><MagicWandIcon /><span>{game.lastStoryChange}</span></div>
      {activeNpcAction && activeNpcCharacter ? (
        <section className={`npc-action-card ${activeNpcCharacter.tone}`} aria-label={`${activeNpcCharacter.name}主动事件`}>
          <header>
            <img src={activeNpcCharacter.image} alt={`${activeNpcCharacter.name}角色头像`} />
            <div><small>{actionKindLabels[activeNpcAction.kind]}</small><strong>{activeNpcAction.title}</strong></div>
          </header>
          <p>{activeNpcAction.narrative}</p>
          <em>{activeNpcAction.reason}</em>
          <div>
            {npcActionResponses[activeNpcAction.id].map((response, index) => (
              <button key={response.label} type="button" onClick={() => onRespondToNpc(index)}>
                {response.label}<ChevronRightIcon />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {node.endingName ? (
        <div className="story-ending-card">
          <span className="section-kicker">本轮结局</span><h2>{node.endingName}</h2>
          <p>已发现 {game.completedEndings.length} / 4 个结局。你可以在档案中回溯任意选择，或保留结局记录重新开始。</p>
          <div className="ending-collection">
            {["大陆守望者", "怪物同盟", "魂核君临者", "自由行者"].map((ending) => (
              <span className={game.completedEndings.includes(ending) ? "found" : ""} key={ending}>{game.completedEndings.includes(ending) ? ending : "未发现"}</span>
            ))}
          </div>
          <button className="primary-button" type="button" onClick={onRestart}>开启下一条时间线</button>
        </div>
      ) : (
      <div className="option-list" aria-label="行动选项">
        {node.choices.map((choice, index) => {
          const locked = Boolean(choice.condition && !choice.condition(game));
          return (
          <button className={locked ? "locked" : ""} key={choice.id} type="button" onClick={() => onChoose(choice.id)} disabled={thinking || locked || Boolean(activeNpcAction)}>
            <span className="option-letter">{String.fromCharCode(65 + index)}</span>
            <span>{choice.label}{locked ? <small>{choice.lockedText}</small> : null}</span>
            {locked ? <LockClosedIcon /> : <ChevronRightIcon />}
          </button>
          );
        })}
        <button type="button" onClick={onCustom} disabled={thinking || Boolean(activeNpcAction)}>
          <span className="option-letter">{String.fromCharCode(65 + node.choices.length)}</span>
          <span>输入自己的行动<small>将沿当前可行路线继续推进</small></span>
          <MagicWandIcon />
        </button>
      </div>
      )}
      <aside className="note-card">
        <BookmarkIcon />
        <div><strong>{node.chapter} · {node.title}</strong><p>{game.storyNote}</p></div>
      </aside>
    </section>
  );
}

function WorldScreen({
  game,
  onBattle,
  onSelectLocation,
}: {
  game: GameState;
  onBattle: () => void;
  onSelectLocation: (locationId: LocationId) => void;
}) {
  const enemy = ENEMIES[game.victories % ENEMIES.length];
  const currentLocation = getLocationByName(game.location);
  const storyNode = getStoryNode(game);
  return (
    <section className="world-screen">
      <header className="page-title"><span>世界</span><GlobeIcon /></header>
      <div className="map-panel" aria-label="斗罗大陆旅行地图">
        <img src="/game-assets/world-map.png" alt="斗罗大陆可探索区域地图" />
        {locations.map((location) => (
          <button
            className={`map-label ${location.className}${location.name === game.location ? " active" : ""}${location.unlocked ? "" : " locked"}`}
            key={location.id}
            type="button"
            onClick={() => onSelectLocation(location.id)}
            aria-label={`${location.name}${location.name === game.location ? "，当前位置" : "，查看地点详情"}`}
            aria-pressed={location.name === game.location}
          >
            {location.unlocked ? null : <LockClosedIcon aria-hidden="true" />}
            {location.name}
          </button>
        ))}
      </div>
      <article className="quest-card story-quest-card">
        <span className="quest-icon"><ReaderIcon /></span>
        <div><small>{storyNode.chapter}</small><h2>{storyNode.title}</h2><p>{storyNode.quest}</p></div>
        <ChevronRightIcon />
      </article>
      <article className="quest-card">
        <span className="quest-icon"><DrawingPinIcon /></span>
        <div><small>当前区域任务</small><h2>{currentLocation.questTitle}</h2><p>{currentLocation.questDescription}</p></div>
        <ChevronRightIcon />
      </article>
      <article className="quest-card battle-quest-card">
        <span className="quest-icon"><ExclamationTriangleIcon /></span>
        <div><small>实战试炼</small><h2>遭遇{enemy.name}</h2><p>{enemy.title} · {enemy.attribute}属性。根据克制关系选择攻击方式。</p></div>
        <button type="button" onClick={onBattle} aria-label={`挑战${enemy.name}`}><ChevronRightIcon /></button>
      </article>
      <button className="world-battle-button" type="button" onClick={onBattle}>
        <MagicWandIcon />进入魂师战斗
      </button>
      <div className="world-status"><span>当前位置</span><strong>{game.location}</strong><span>实战胜场</span><strong>{game.victories}</strong></div>
    </section>
  );
}

function RelationsScreen({
  game,
  stats,
  onTrain,
  onSelectCharacter,
}: {
  game: GameState;
  stats: CharacterStats;
  onTrain: () => void;
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const required = soulExperienceRequired(game.soulPower);
  const ring = game.soulRings[0];
  return (
    <section className="relations-screen">
      <header className="profile-header">
        <div className="spirit-mark"><img src="/game-assets/blue-silver-grass.png" alt="蓝银草武魂徽记" /></div>
        <div><h1>{game.name}</h1><p>魂力 <strong>{game.soulPower}级</strong></p><p>武魂 <strong>{game.martialSoul} · {game.martialAttribute}</strong></p></div>
      </header>
      <div className="soul-meter compact-soul-meter">
        <img src="/game-assets/soul-meter.png" alt="魂力进度圆环" />
        <div><small>魂力</small><strong>{game.soulPower}<em>级</em></strong><span>{game.soulProgress} / {required}</span></div>
      </div>
      <div className="experience-track" role="progressbar" aria-label="魂力升级进度" aria-valuemin={0} aria-valuemax={required} aria-valuenow={game.soulProgress}>
        <i style={{ width: `${Math.min(100, (game.soulProgress / required) * 100)}%` }} />
      </div>
      <button className="train-button" type="button" onClick={onTrain}><MagicWandIcon />冥想修炼 <span>经验 +120</span></button>

      <h2 className="section-title">战斗属性</h2>
      <div className="attribute-grid">
        <article><small>生命</small><strong>{game.currentHp} / {stats.maxHp}</strong></article>
        <article><small>攻击</small><strong>{stats.attack}</strong></article>
        <article><small>防御</small><strong>{stats.defense}</strong></article>
        <article><small>速度</small><strong>{stats.speed}</strong></article>
        <article><small>控制</small><strong>{stats.control}</strong></article>
      </div>

      <h2 className="section-title">魂环与魂技</h2>
      <article className="soul-ring-card">
        <span className="ring-orb" aria-hidden="true" />
        <div><small>第一魂环 · {ring.age} 年</small><h3>{ring.name}</h3><p>{ring.attribute}属性</p></div>
      </article>
      <article className="soul-skill-card">
        <span><MagicWandIcon /></span>
        <div><small>第一魂技 · 消耗 2 点魂力</small><h3>{ring.skillName}</h3><p>{ring.skillDescription}</p></div>
      </article>
      <aside className="counter-card"><strong>属性克制</strong><p>植物克水，水克火，火克植物；克制伤害 ×1.35，被克制伤害 ×0.75。</p></aside>

      <h2 className="section-title">人物关系</h2>
      <div className="character-grid">
        {characters.map((character) => {
          const score = game.relationships[character.id] ?? initialRelationships[character.id];
          return (
          <button
            className={`character-card ${character.tone}`}
            key={character.id}
            type="button"
            onClick={() => onSelectCharacter(character.id)}
            aria-label={`查看${character.name}的人物档案并对话，当前好感${score}`}
          >
            <img src={character.image} alt={`${character.name}角色头像`} />
            <strong>{character.name}</strong>
            <span><HeartFilledIcon /> {getRelationshipLabel(score)} {score}</span>
            <i className="affection-track" aria-hidden="true">
              <b style={{ width: `${Math.min(100, score)}%` }} />
            </i>
          </button>
          );
        })}
      </div>
      <aside className="relation-tip"><ChatBubbleIcon /><span>点击人物卡可查看专属档案、剧情并进行对话。</span></aside>
    </section>
  );
}

function LocationSheet({
  location,
  current,
  traveling,
  onTravel,
}: {
  location: WorldLocation;
  current: boolean;
  traveling: boolean;
  onTravel: () => void;
}) {
  return (
    <div className="location-sheet">
      <p className="sheet-body-copy">{location.description}</p>
      <dl className="location-facts">
        <div><dt>所属区域</dt><dd>{location.region}</dd></div>
        <div><dt>路程</dt><dd>{location.distance}</dd></div>
        <div><dt>预计耗时</dt><dd>{location.travelTime}</dd></div>
        <div><dt>危险程度</dt><dd className={`risk-${location.risk}`}>{location.risk}</dd></div>
      </dl>
      <article className="destination-quest">
        <small>区域线索</small>
        <strong>{location.questTitle}</strong>
        <p>{location.questDescription}</p>
      </article>
      <button
        className="primary-button sheet-primary-action"
        type="button"
        onClick={onTravel}
        disabled={current || !location.unlocked || traveling}
      >
        {!location.unlocked ? <LockClosedIcon /> : <DrawingPinIcon />}
        {traveling ? "正在赶路……" : current ? "你正在这里" : location.unlocked ? `启程前往${location.name}` : "路线尚未解锁"}
      </button>
      {!location.unlocked ? <p className="sheet-hint">提升魂力并推进大陆剧情后，才能获得安全航路。</p> : null}
    </div>
  );
}

function CharacterSheet({
  character,
  score,
  history,
  memories,
  sending,
  onSend,
}: {
  character: CharacterProfile;
  score: number;
  history: DialogueMessage[];
  memories: NpcMemory[];
  sending: boolean;
  onSend: (message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage("");
  }, [character.id]);

  const submitMessage = () => {
    const nextMessage = message.trim();
    if (!nextMessage || sending) return;
    void onSend(nextMessage);
    setMessage("");
  };

  return (
    <div className={`character-sheet ${character.tone}`}>
      <section className="character-file" aria-label={`${character.name}人物档案`}>
        <img src={character.image} alt={`${character.name}角色头像`} />
        <div>
          <span>{character.affiliation}</span>
          <strong>武魂 · {character.martialSoul}</strong>
          <p>{character.profile}</p>
        </div>
      </section>

      <div className="sheet-affection" aria-label={`${character.name}好感度${score}`}>
        <span><HeartFilledIcon /> {getRelationshipLabel(score)}</span>
        <strong>{score} / 100</strong>
        <i aria-hidden="true"><b style={{ width: `${Math.min(100, score)}%` }} /></i>
      </div>

      <section className="exclusive-story">
        <span>专属剧情</span>
        <h3>待回应的邀请</h3>
        <p>{character.story}</p>
      </section>

      {memories.length > 0 ? (
        <section className="character-memories" aria-label={`${character.name}共同记忆`}>
          <div className="sheet-section-title"><BookmarkIcon /><strong>共同记忆</strong></div>
          <div>
            {[...memories].slice(-4).reverse().map((memory) => (
              <article className={memory.important ? "important" : ""} key={memory.id}>
                <span>{memory.source} · 第 {memory.turn + 1} 轮</span>
                <strong>{memory.title}</strong>
                <p>{memory.detail}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dialogue-section" aria-label={`与${character.name}对话`}>
        <div className="sheet-section-title"><ChatBubbleIcon /><strong>对话记录</strong></div>
        <div className="dialogue-thread" role="log" aria-live="polite">
          <p className="dialogue-bubble character"><strong>{character.name}</strong>{character.greeting}</p>
          {history.map((item, index) => (
            <p className={`dialogue-bubble ${item.role}`} key={`${item.role}-${index}-${item.text.slice(0, 8)}`}>
              <strong>{item.role === "player" ? "你" : character.name}</strong>
              {item.text}
            </p>
          ))}
        </div>

        <div className="dialogue-suggestions" aria-label="推荐话题">
          {character.dialogues.map((dialogue) => (
            <button key={dialogue.prompt} type="button" onClick={() => void onSend(dialogue.prompt)} disabled={sending}>
              {dialogue.prompt}<ChevronRightIcon />
            </button>
          ))}
        </div>

        <div className="dialogue-composer">
          <label htmlFor={`message-${character.id}`}>输入想说的话</label>
          <div>
            <KeyboardInput
              id={`message-${character.id}`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitMessage();
              }}
              placeholder={`和${character.name}说点什么……`}
              disabled={sending}
            />
            <button type="button" onClick={submitMessage} disabled={!message.trim() || sending} aria-label={`发送给${character.name}`}>
              <PaperPlaneIcon />
            </button>
          </div>
        </div>
        <p className="dialogue-engine-note">
          {sending ? "角色正在结合共同记忆思考回应……" : "自由输入优先使用 AI；服务不可用时自动回退本地角色剧情。"}
        </p>
      </section>
    </div>
  );
}

function BagScreen({
  game,
  stats,
  mode,
  onModeChange,
  onSelectItem,
}: {
  game: GameState;
  stats: CharacterStats;
  mode: BagMode;
  onModeChange: (mode: BagMode) => void;
  onSelectItem: (id: string, source: BagMode) => void;
}) {
  const inventoryIds = INVENTORY_ORDER.filter((id) => (game.inventory[id] ?? 0) > 0);
  const itemIds = mode === "inventory" ? inventoryIds : SHOP_ITEM_IDS;
  return (
    <section className="bag-screen">
      <header className="page-title"><span>行囊与经济</span><BackpackIcon /></header>
      <div className="status-grid bag-status-grid">
        <article><small>生命</small><strong>{game.currentHp} / {stats.maxHp}</strong><span>可使用药草恢复</span></article>
        <article><small>财富</small><strong>{game.coins} 金魂币</strong><span>购买与出售共用</span></article>
        <article><small>护具</small><strong>{game.equipment.护具 ? ITEMS[game.equipment.护具].name : "未装备"}</strong><span>防御类装备</span></article>
        <article><small>饰品</small><strong>{game.equipment.饰品 ? ITEMS[game.equipment.饰品].name : "未装备"}</strong><span>辅助类装备</span></article>
      </div>
      <div className="bag-segmented" aria-label="行囊视图">
        <button className={mode === "inventory" ? "active" : ""} type="button" onClick={() => onModeChange("inventory")}>我的行囊</button>
        <button className={mode === "shop" ? "active" : ""} type="button" onClick={() => onModeChange("shop")}>诺丁商店</button>
      </div>
      <div className="economy-summary">
        <span>{mode === "inventory" ? `共 ${inventoryIds.length} 种物品` : "价格使用金魂币结算"}</span>
        <strong>{game.coins} 金魂币</strong>
      </div>
      <div className="inventory-list interactive-inventory">
        {itemIds.map((id) => {
          const item = ITEMS[id];
          const quantity = game.inventory[id] ?? 0;
          const isEquipped = item.slot ? game.equipment[item.slot] === id : false;
          return (
            <button key={item.id} type="button" onClick={() => onSelectItem(id, mode)}>
              <span className="item-icon"><BookmarkIcon /></span>
              <span><strong>{item.name}</strong><small>{item.category}{isEquipped ? " · 已装备" : ""}</small></span>
              <span className="item-value">{mode === "inventory" ? `× ${quantity}` : `${item.buyPrice} 金`}</span>
              <ChevronRightIcon />
            </button>
          );
        })}
      </div>
      {mode === "inventory" && itemIds.length === 0 ? <p className="empty-state">行囊空空如也，可以前往诺丁商店补给。</p> : null}
    </section>
  );
}

function ItemActionSheet({
  item,
  source,
  quantity,
  coins,
  equipped,
  onUse,
  onBuy,
  onSell,
  onEquip,
}: {
  item: ItemDefinition;
  source: BagMode;
  quantity: number;
  coins: number;
  equipped: boolean;
  onUse: () => void;
  onBuy: () => void;
  onSell: () => void;
  onEquip: () => void;
}) {
  const bonusParts = item.bonus
    ? [
        item.bonus.maxHp ? `生命 +${item.bonus.maxHp}` : null,
        item.bonus.attack ? `攻击 +${item.bonus.attack}` : null,
        item.bonus.defense ? `防御 +${item.bonus.defense}` : null,
        item.bonus.speed ? `速度 +${item.bonus.speed}` : null,
        item.bonus.control ? `控制 +${item.bonus.control}` : null,
      ].filter(Boolean)
    : [];
  return (
    <div className="item-action-sheet">
      <div className="item-sheet-meta"><span>{item.category}</span><strong>持有 {quantity}</strong></div>
      {bonusParts.length > 0 ? <p className="item-bonus">{bonusParts.join(" · ")}</p> : null}
      {source === "shop" ? (
        <button className="primary-button" type="button" onClick={onBuy} disabled={item.buyPrice === null || coins < (item.buyPrice ?? 0)}>
          购买 · {item.buyPrice} 金魂币
        </button>
      ) : (
        <div className="item-sheet-actions">
          {item.effect ? <button className="primary-button" type="button" onClick={onUse}>使用物品</button> : null}
          {item.slot ? <button className="primary-button" type="button" onClick={onEquip}>{equipped ? "卸下装备" : "装备物品"}</button> : null}
          <button className="secondary-sheet-button" type="button" onClick={onSell} disabled={item.sellPrice === null || equipped}>
            {equipped ? "请先卸下再出售" : item.sellPrice === null ? "此物品不可出售" : `出售 · ${item.sellPrice} 金魂币`}
          </button>
        </div>
      )}
    </div>
  );
}

function CombatSheet({
  game,
  stats,
  combat,
  enemy,
  onAction,
  onClose,
}: {
  game: GameState;
  stats: CharacterStats;
  combat: CombatState;
  enemy: EnemyDefinition;
  onAction: (action: "basic" | "skill") => void;
  onClose: () => void;
}) {
  const counter = getCounterText(game.martialAttribute, enemy.attribute);
  return (
    <div className="combat-sheet">
      <div className="combat-opponents">
        <article>
          <span className="combat-avatar player"><img src="/game-assets/blue-silver-grass.png" alt="蓝银草武魂" /></span>
          <small>{game.name}</small><strong>{game.soulPower}级 · {game.martialAttribute}</strong>
          <div className="health-track" role="progressbar" aria-label="玩家生命" aria-valuemin={0} aria-valuemax={stats.maxHp} aria-valuenow={combat.playerHp}>
            <i style={{ width: `${(combat.playerHp / stats.maxHp) * 100}%` }} />
          </div>
          <em>{combat.playerHp} / {stats.maxHp}</em>
        </article>
        <span className="versus-mark">对战</span>
        <article>
          <span className={`combat-avatar enemy ${enemy.attribute}`}>{enemy.name.slice(0, 1)}</span>
          <small>{enemy.title}</small><strong>{enemy.name} · {enemy.attribute}</strong>
          <div className="health-track enemy-track" role="progressbar" aria-label="敌人生命" aria-valuemin={0} aria-valuemax={enemy.maxHp} aria-valuenow={combat.enemyHp}>
            <i style={{ width: `${(combat.enemyHp / enemy.maxHp) * 100}%` }} />
          </div>
          <em>{combat.enemyHp} / {enemy.maxHp}</em>
        </article>
      </div>
      <div className={counter.startsWith("克制") ? "counter-result advantage" : counter.startsWith("被") ? "counter-result danger" : "counter-result"}>
        {game.martialAttribute} 对 {enemy.attribute}：<strong>{counter}</strong>
      </div>
      <div className="soul-energy-row"><span>可用魂力</span><strong>{"●".repeat(combat.energy)}{"○".repeat(4 - combat.energy)}</strong><span>第 {combat.round} 回合</span></div>
      <div className="combat-log" aria-live="polite">
        {combat.log.slice(0, 4).map((line, index) => <p key={`${combat.round}-${index}-${line}`}>{line}</p>)}
      </div>
      {combat.status === "active" ? (
        <div className="combat-actions">
          <button type="button" onClick={() => onAction("basic")}>
            <span>普通攻击</span><small>恢复 1 点魂力 · 中性伤害</small>
          </button>
          <button type="button" onClick={() => onAction("skill")} disabled={combat.energy < 2}>
            <span>第一魂技 · {FIRST_SOUL_RING.skillName}</span><small>消耗 2 点魂力 · 植物伤害</small>
          </button>
        </div>
      ) : (
        <div className={`combat-result ${combat.status}`}>
          <CheckCircledIcon />
          <div><strong>{combat.status === "won" ? "战斗胜利" : "战斗结束"}</strong><p>{combat.status === "won" ? "经验、金魂币和战利品已经结算。" : "状态与损失已经写入当前时间线。"}</p></div>
          <button type="button" onClick={onClose}>返回世界</button>
        </div>
      )}
    </div>
  );
}

function ArchiveScreen({ session, musicMuted, musicReady, onToggleMusic, onSave, onRewind, onReset }: {
  session: GameSession;
  musicMuted: boolean;
  musicReady: boolean;
  onToggleMusic: () => void;
  onSave: () => void;
  onRewind: (nodeId: string) => void;
  onReset: () => void;
}) {
  const game = session.game;
  const storyNode = getStoryNode(game);
  const timeline = [...session.nodes].sort((a, b) => b.sequence - a.sequence);
  const branchCount = new Set(session.nodes.map((node) => node.branchId)).size;
  return (
    <section className="archive-screen">
      <header className="page-title"><span>档案与时间线</span><ArchiveIcon /></header>
      <article className="save-card">
        <small>{storyNode.chapter}</small><h2>{game.location} · 第 {game.turns + 1} 轮</h2><p>{game.name} · {game.identity} · {game.talent}</p>
        <div className="archive-stat-row"><span>{session.nodes.length} 个节点</span><span>{branchCount} 条分支</span><span>结局 {game.completedEndings.length}/4</span><span>回溯 {game.rewinds} 次</span></div>
        <button className="primary-button" type="button" onClick={onSave}><BookmarkIcon />保存完整档案</button>
      </article>

      <button
        className="audio-setting-button"
        type="button"
        onClick={onToggleMusic}
        aria-pressed={!musicMuted}
        disabled={!musicReady}
      >
        {musicMuted ? <SpeakerOffIcon /> : <SpeakerLoudIcon />}
        <span>
          <strong>动态背景音乐</strong>
          <small>{musicReady ? (musicMuted ? "当前已关闭，点击开启" : "根据剧情与战斗自动切换") : "音乐资源正在准备"}</small>
        </span>
        <span>{musicMuted ? "开启" : "关闭"}</span>
      </button>

      <div className="timeline-heading"><div><span className="section-kicker">完整历史</span><h2>选择回溯节点</h2></div><ReloadIcon /></div>
      <p className="timeline-help">回溯会消耗 1 次机会，并从所选节点建立新支线；原有历史不会被删除。</p>
      <div className="timeline-list">
        {timeline.map((node) => {
          const active = node.id === session.currentNodeId;
          return (
            <article className={active ? "timeline-node active" : "timeline-node"} key={node.id}>
              <span className="timeline-dot" aria-hidden="true" />
              <div className="timeline-node-body">
                <div><span>{node.branchId}</span><small>第 {node.turn + 1} 轮 · 节点 {node.sequence}</small></div>
                <h3>{node.title}</h3>
                <p>{node.summary}</p>
                <button type="button" onClick={() => onRewind(node.id)} disabled={active || game.rewinds <= 0}>
                  {active ? "当前节点" : "回到此处"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <article className="engine-card"><span className="engine-light" /><div><strong>本地规则引擎 · 完整状态存档</strong><p>剧情条件、已发现结局、角色属性、行囊、战斗结果和所有时间分支都会保存在当前设备。</p></div></article>
      <button className="danger-button" type="button" onClick={onReset}>重新创建角色</button>
    </section>
  );
}
