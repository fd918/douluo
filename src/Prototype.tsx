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
  PauseIcon,
  PersonIcon,
  PlayIcon,
  ReaderIcon,
  ReloadIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";
import {
  clearBrowserAiConfig,
  generateAiAction,
  generateAiDialogue,
  generateAiSummary,
  loadBrowserAiConfig,
  saveBrowserAiConfig,
  testBrowserAiConfig,
  type AiActionResult,
  type AiDialogueResult,
  type BrowserAiConfig,
} from "./ai";
import {
  ALL_ENDINGS,
  CANON_START_NODE_ID,
  formatStoryText,
  getDefaultCustomChoice,
  getStoryIntro,
  getStoryNode,
  resolveStoryChoice,
  type StoryHistoryEntry,
} from "./story";
import { useDynamicGameMusic } from "./audio/useDynamicGameMusic";
import { useNarration, type NarrationStatus } from "./audio/useNarration";
import {
  PROLOGUE_NARRATION,
  PROLOGUE_PARAGRAPHS,
  narrationClipUrl,
} from "./narrationContent";
import { publicAssetUrl } from "./publicAsset";
import {
  EXTENDED_CHARACTERS,
  FACTIONS,
  MARTIAL_SOULS,
  RANDOM_SIDE_EVENTS,
  createWorldProgress,
  findMartialSoulByLegacyName,
  getAvailableEventChoices,
  getEligibleRandomEvents,
  getMartialSoul,
  getReputationTier,
  getUnlockedExtendedCharacters,
  type FactionId,
  type MartialSoulId,
  type RandomEventChoice,
  type RandomSideEventDefinition,
  type WorldLocationId,
} from "./content/douluoWorldContent";
import { EXPANDED_ITEMS } from "./gameplay/catalog";
import { performBattleTurn, startBattle } from "./gameplay/battle";
import type { BattleState, CombatEffectDefinition } from "./gameplay/types";
import {
  applyWorldDirective,
  createInitialWorldDirectorState,
  hydrateWorldDirectorState,
  normalizeWorldDirective,
  type WorldDirectorState,
  type WorldDirective,
} from "./world-director";

type TabId = "story" | "world" | "relations" | "bag" | "archive";
type Stage = "welcome" | "prologue" | "creation" | "game";
type BagMode = "inventory" | "shop" | "auction";
type SoulAttribute = "植物" | "水" | "火" | "兽" | "无";
type EquipmentSlot = "护具" | "饰品" | "武器" | "头部魂骨" | "躯干魂骨" | "左臂魂骨" | "右臂魂骨" | "左腿魂骨" | "右腿魂骨" | "外附魂骨";
type CombatStatus = "active" | "won" | "lost";
type CombatAction = "basic" | "skill" | "secondSkill";
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
  | { kind: "experience"; amount: number }
  | { kind: "energy"; amount: number };

type ItemDefinition = {
  id: string;
  name: string;
  category: "关键物品" | "消耗品" | "装备" | "普通物品" | "魂骨";
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
  storyMode: "canon" | "legacy";
  narrativePace: "immersive" | "standard" | "fast";
  originPlace: string;
  background: string;
  lifeGoal: string;
  secret: string;
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
  martialSoulId: MartialSoulId;
  martialAttribute: SoulAttribute;
  currentHp: number;
  victories: number;
  inventory: Record<string, number>;
  equipment: Partial<Record<EquipmentSlot, string | null>>;
  soulRings: SoulRing[];
  currentStoryNodeId: string;
  storyFlags: string[];
  storyHistory: StoryHistoryEntry[];
  completedEndings: string[];
  storyCycle: number;
  lastStoryChange: string;
  storyNarrative: string;
  storyNarrationClipId: string | null;
  storyNote: string;
  storySummary: string;
  storySummaryThroughTurn: number;
  worldDirector: WorldDirectorState;
  visitedWorldLocationIds: WorldLocationId[];
  completedWorldEventIds: string[];
  extendedRelationships: Record<string, number>;
  auctionPurchases: string[];
  boundItemIds: string[];
  claimedRewardIds: string[];
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
  engine?: BattleState;
};

type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  unlocked: (game: GameState) => boolean;
};

const SAVE_KEY = "douluo-life-simulator-save-v2";
const LEGACY_SAVE_KEY = "douluo-life-simulator-save-v1";
const STORY_SUMMARY_INTERVAL = 12;
const STORY_SUMMARY_EVENT_LIMIT = 16;
const DIALOGUE_MESSAGE_LIMIT = 20;
function mobileGameAssetUrl(path: string) {
  return publicAssetUrl(path.replace(/\.png$/i, "-mobile.webp"));
}

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
  ...EXPANDED_ITEMS,
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
  millennium_essence: {
    id: "millennium_essence",
    name: "千年魂力精华",
    category: "消耗品",
    description: "吸收第二魂环后凝结的纯净精华，使用后获得 500 点魂力经验。",
    buyPrice: null,
    sellPrice: 25,
    effect: { kind: "experience", amount: 500 },
  },
  sea_crystal: {
    id: "sea_crystal",
    name: "深海魂晶",
    category: "关键物品",
    description: "来自远海的蓝色晶体，与人造魂核及瀚海罗盘存在共鸣。",
    buyPrice: null,
    sellPrice: null,
  },
  tournament_badge: {
    id: "tournament_badge",
    name: "精英赛资格徽章",
    category: "关键物品",
    description: "刻有天斗赛区纹章，可进入精英赛参赛者区域。",
    buyPrice: null,
    sellPrice: null,
  },
  vast_sea_chart: {
    id: "vast_sea_chart",
    name: "瀚海航图",
    category: "关键物品",
    description: "以罗盘、星轨与潮汐记录补全的航图，标注了海神岛外围安全航线。",
    buyPrice: null,
    sellPrice: null,
  },
  tide_armor: {
    id: "tide_armor",
    name: "潮汐轻甲",
    category: "装备",
    description: "以海魂兽自然脱落的鳞片制成，在风暴与控制魂技中保持稳定。",
    buyPrice: null,
    sellPrice: 60,
    slot: "护具",
    bonus: { maxHp: 48, defense: 8, speed: 5, control: 4 },
  },
};

const ITEM_ART = {
  academy_letter: "academy-letter.jpg",
  old_purse: "old-purse.jpg",
  healing_herb: "healing-herb.jpg",
  blank_notebook: "blank-notebook.jpg",
  focus_incense: "focus-incense.jpg",
  apprentice_guard: "apprentice-guard.jpg",
  cloth_armor: "cloth-armor.jpg",
  millennium_essence: "millennium-essence.jpg",
  sea_crystal: "sea-crystal.jpg",
  tournament_badge: "tournament-badge.jpg",
  vast_sea_chart: "vast-sea-chart.jpg",
  tide_armor: "tide-armor.jpg",
  soul_energy_draught: "soul-energy-draught.jpg",
  wind_chaser_right_leg_bone: "wind-chaser-right-leg-bone.jpg",
  ironback_torso_bone: "ironback-torso-bone.jpg",
} as const;

function ItemGlyph({ item, className = "" }: { item: ItemDefinition; className?: string }) {
  const artwork = ITEM_ART[item.id as keyof typeof ITEM_ART];
  const tone = item.category === "关键物品"
    ? "quest"
    : item.category === "消耗品"
      ? "consumable"
      : item.category === "魂骨"
        ? "soul-bone"
        : item.category === "装备"
          ? "equipment"
          : "common";
  return (
    <span className={`item-icon ${tone} ${className}`.trim()}>
      {artwork
        ? <img src={publicAssetUrl(`game-assets/items/${artwork}`)} alt={`${item.name}图标`} width="256" height="256" loading="lazy" />
        : <BookmarkIcon aria-hidden="true" />}
    </span>
  );
}

const INVENTORY_ORDER = [
  "academy_letter",
  "old_purse",
  "healing_herb",
  "blank_notebook",
  "focus_incense",
  "apprentice_guard",
  "cloth_armor",
  "millennium_essence",
  "sea_crystal",
  "tournament_badge",
  "vast_sea_chart",
  "tide_armor",
  "soul_energy_draught",
  "wind_chaser_right_leg_bone",
  "ironback_torso_bone",
];

const SHOP_ITEM_IDS = ["healing_herb", "focus_incense", "blank_notebook", "apprentice_guard", "cloth_armor"];
const AUCTION_LISTINGS = [
  { itemId: "soul_energy_draught", price: 16, seller: "索托商会" },
  { itemId: "wind_chaser_right_leg_bone", price: 88, seller: "匿名魂师" },
  { itemId: "ironback_torso_bone", price: 96, seller: "大斗魂场寄售" },
];

const FIRST_SOUL_RING: SoulRing = {
  id: "blue-silver-centennial",
  name: "百年蓝银藤环",
  age: 423,
  attribute: "植物",
  skillName: "蓝银缠绕",
  skillDescription: "以蓝银草限制敌人行动，造成植物属性伤害，并有机会打断反击。",
};

const SECOND_SOUL_RINGS: Record<string, SoulRing> = {
  "魂环·千年鬼藤": {
    id: "ghost-vine-millennium",
    name: "千年鬼藤环",
    age: 1300,
    attribute: "植物",
    skillName: "蓝银囚笼",
    skillDescription: "以多重藤蔓封锁范围，削弱防御并提高打断敌方行动的概率。",
  },
  "魂环·千年月藤": {
    id: "moon-vine-millennium",
    name: "千年月藤环",
    age: 1100,
    attribute: "植物",
    skillName: "生命藤网",
    skillDescription: "展开兼具束缚与生命共鸣的藤网，稳定自身并保护并肩作战的伙伴。",
  },
  "魂环·千年青藤王": {
    id: "verdant-vine-king",
    name: "千年青藤王环",
    age: 1500,
    attribute: "植物",
    skillName: "青藤领域",
    skillDescription: "让蓝银根系覆盖战场，在大范围内持续限制敌人的速度与行动。",
  },
};

const FACTION_IDS = FACTIONS.map((faction) => faction.id);

const initialGame: GameState = {
  name: "无名",
  identity: "原创角色",
  talent: "天才档",
  storyMode: "canon",
  narrativePace: "immersive",
  originPlace: "法斯诺行省边缘村落",
  background: "普通家庭",
  lifeGoal: "与伙伴同行，也走出自己的道路",
  secret: "",
  soulPower: 10,
  soulProgress: 0,
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
  location: "法斯诺行省边缘村落",
  season: "斗罗历二六三七年 · 初春清晨",
  narrative:
    "六岁的春天，村口铜钟正在召集参加武魂觉醒的孩子。与此同时，圣魂村的唐三也将走进觉醒法阵。你们尚未相识，同一个时代已经开始转动。",
  note: "原著同行模式：重大事件遵循原著时间线，你拥有独立身份、关系与人生结局。",
  martialSoul: "蓝银草",
  martialSoulId: "blue-silver-grass",
  martialAttribute: "植物",
  currentHp: 140,
  victories: 0,
  inventory: {
    academy_letter: 1,
    old_purse: 1,
    healing_herb: 2,
    blank_notebook: 1,
    apprentice_guard: 1,
  },
  equipment: { 护具: null, 饰品: null },
  soulRings: [],
  currentStoryNodeId: CANON_START_NODE_ID,
  storyFlags: [],
  storyHistory: [],
  completedEndings: [],
  storyCycle: 1,
  lastStoryChange: "原著同行时间线已经开启",
  storyNarrative:
    "六岁的春天，村口铜钟正在召集参加武魂觉醒的孩子。与此同时，圣魂村的唐三也将走进觉醒法阵。你们尚未相识，同一个时代已经开始转动。",
  storyNarrationClipId: null,
  storyNote: "原著时期：圣魂村武魂觉醒日前后。你将作为独立角色进入同一条时间线。",
  storySummary: "",
  storySummaryThroughTurn: 0,
  worldDirector: createInitialWorldDirectorState(FACTION_IDS),
  visitedWorldLocationIds: ["notting-city"],
  completedWorldEventIds: [],
  extendedRelationships: Object.fromEntries(EXTENDED_CHARACTERS.map((character) => [character.id, 20])),
  auctionPurchases: [],
  boundItemIds: [],
  claimedRewardIds: [],
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
    description: "初级魂师学院与铁匠铺坐落于此。这里承载着工读生活、基础理论、日常修炼和少年魂师最初的友情。",
    arrival: "你踏上诺丁城的青石路。铁匠铺的敲击声与学院钟声交错传来，工读生们正为新一天的课程和杂务奔忙。",
    note: "已抵达诺丁城。自由探索不会跳过当前原著主线，可随时返回剧情继续推进。",
    season: "三月·午后",
    questTitle: "体验诺丁学院的日常",
    questDescription: "完成课程、工读与基础训练，逐步认识唐三、小舞、大师和七舍伙伴。",
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
    questTitle: "辨认魂兽与环境痕迹",
    questDescription: "在不惊动高阶魂兽的前提下探索外围，并根据自己的武魂定位判断是否适合交战。",
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
    image: mobileGameAssetUrl("game-assets/xiao-wu.png"),
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
    image: mobileGameAssetUrl("game-assets/dai-mubai.png"),
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
    image: mobileGameAssetUrl("game-assets/oscar.png"),
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
    image: mobileGameAssetUrl("game-assets/ning-rongrong.png"),
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
  { id: "xiao-wu-visit", characterId: "xiao-wu", kind: "visit", minTurn: 1, title: "小舞约你晚间训练", narrative: "七舍安静下来后，小舞抱着训练用的护具来找你。她想知道你是否愿意把白天没完成的配合再练一次。", reason: "你已经在诺丁学院与小舞相识，且此前的选择让她愿意主动靠近。" },
  { id: "dai-mubai-conflict", characterId: "dai-mubai", kind: "conflict", minTurn: 2, title: "戴沐白要求再试一次", narrative: "戴沐白在训练场拦住你，直言一次入学考核不足以证明默契。他提出重新模拟赵无极试炼中的一次失误。", reason: "你已经进入史莱克，但戴沐白仍想确认你在真正压力下是否可靠。" },
  { id: "ning-rongrong-romance", characterId: "ning-rongrong", kind: "romance", minTurn: 3, title: "宁荣荣的赛后邀约", narrative: "夜色落下后，宁荣荣送来一张短笺。她邀请你一起复盘团战，还特意在末尾补了一句：不要带其他人。", reason: "多次团队经历让宁荣荣愿意与你分享不对所有人公开的想法。" },
  { id: "oscar-quest", characterId: "oscar", kind: "quest", minTurn: 4, title: "奥斯卡来核对远行补给", narrative: "奥斯卡抱着写满数字的补给册来找你。他想请你一起检查下一次森林行动需要的食物、药品和撤退余量。", reason: "你已经成为史莱克队伍的一员，奥斯卡相信你会认真对待后勤。" },
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
  {
    id: "shadow-mantis",
    name: "暗影螳螂",
    title: "千年敏攻系魂兽",
    attribute: "兽",
    maxHp: 204,
    attack: 43,
    defense: 23,
    speed: 38,
    expReward: 620,
    coinReward: 14,
    lootId: "millennium_essence",
  },
  {
    id: "storm-ray",
    name: "风暴魔鳐",
    title: "远海千年魂兽",
    attribute: "水",
    maxHp: 236,
    attack: 46,
    defense: 26,
    speed: 35,
    expReward: 760,
    coinReward: 18,
    lootId: "sea_crystal",
  },
  {
    id: "magma-crab",
    name: "熔岩钳蟹",
    title: "海岛火系魂兽",
    attribute: "火",
    maxHp: 278,
    attack: 51,
    defense: 35,
    speed: 21,
    expReward: 880,
    coinReward: 22,
    lootId: "tide_armor",
  },
];

const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "first-choice", name: "命运起笔", description: "完成第一次剧情选择", unlocked: (game) => game.turns >= 1 },
  { id: "first-win", name: "初战告捷", description: "赢得第一场魂师实战", unlocked: (game) => game.victories >= 1 },
  { id: "veteran", name: "百战之心", description: "累计赢得 5 场实战", unlocked: (game) => game.victories >= 5 },
  { id: "trusted", name: "真正的伙伴", description: "与任意角色的好感达到 60", unlocked: (game) => Object.values(game.relationships).some((score) => score >= 60) },
  { id: "second-ring", name: "双环魂师", description: "获得第二魂环与第二魂技", unlocked: (game) => game.soulRings.length >= 2 },
  { id: "first-ending", name: "命运观测者", description: "发现任意一个结局", unlocked: (game) => game.completedEndings.length >= 1 },
  { id: "time-weaver", name: "时间织师", description: "开启第二条剧情时间线", unlocked: (game) => game.storyCycle >= 2 },
  { id: "navigator", name: "瀚海领航员", description: "获得通往远海的瀚海航图", unlocked: (game) => game.storyFlags.includes("获得瀚海航图") },
  { id: "island", name: "潮汐试炼者", description: "抵达海神岛并得到认可", unlocked: (game) => game.storyFlags.includes("海神岛认可") },
  { id: "final-saga", name: "穿越大陆与远海", description: "完成第二卷最终结局", unlocked: (game) => game.completedEndings.some((ending) => ALL_ENDINGS.slice(4).includes(ending as typeof ALL_ENDINGS[number])) },
  { id: "collector", name: "八方命运", description: "收集全部 8 个结局", unlocked: (game) => ALL_ENDINGS.every((ending) => game.completedEndings.includes(ending)) },
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

const canonNpcMinimumScene: Partial<Record<NpcActionId, number>> = {
  "xiao-wu-visit": 6,
  "dai-mubai-conflict": 25,
  "ning-rongrong-romance": 33,
  "oscar-quest": 27,
};

function isNpcActionChronologicallyAvailable(game: GameState, actionId: NpcActionId) {
  if (game.storyMode !== "canon") return true;
  const sceneIndex = getStoryNode(game).sceneIndex ?? Number.POSITIVE_INFINITY;
  return sceneIndex >= (canonNpcMinimumScene[actionId] ?? 1);
}

function selectNpcAction(game: GameState) {
  if (game.pendingNpcAction) return game.pendingNpcAction;
  const completed = new Set(game.npcActionLog.map((action) => action.actionId));
  const eligible = npcActionTemplates.find((action) => {
    if (completed.has(action.id) || game.turns < action.minTurn) return false;
    if (!isNpcActionChronologicallyAvailable(game, action.id)) return false;
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
  const martialSoul = getMartialSoul(game.martialSoulId);
  const stats: CharacterStats = {
    maxHp: 80 + game.soulPower * 6 + talent * 3 + (martialSoul?.starterStats.maxHp ?? 0),
    attack: 16 + game.soulPower * 2 + talent + (martialSoul?.starterStats.attack ?? 0),
    defense: 8 + Math.floor(game.soulPower * 1.2) + talent + (martialSoul?.starterStats.defense ?? 0),
    speed: 10 + game.soulPower + talent + (martialSoul?.starterStats.speed ?? 0),
    control: 14 + Math.floor(game.soulPower * 1.5) + talent * 2 + (martialSoul?.starterStats.control ?? 0),
  };

  const additionalRings = Math.max(0, game.soulRings.length - 1);
  stats.maxHp += additionalRings * 24;
  stats.attack += additionalRings * 5;
  stats.defense += additionalRings * 4;
  stats.control += additionalRings * 7;

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
  const legacySoul = findMartialSoulByLegacyName(value?.martialSoul ?? "");
  const martialSoulId = getMartialSoul(value?.martialSoulId ?? "blue-silver-grass")
    ? (value?.martialSoulId ?? "blue-silver-grass")
    : (legacySoul?.id ?? "blue-silver-grass");
  const hasStructuredStory =
    typeof value?.storyNarrative === "string" &&
    Array.isArray(value?.storyHistory) &&
    typeof value?.currentStoryNodeId === "string";
  const storyMode = value?.storyMode
    ?? (value?.currentStoryNodeId?.startsWith("canon_") ? "canon" : value?.currentStoryNodeId ? "legacy" : "canon");
  const merged: GameState = {
    ...initialGame,
    ...value,
    storyMode,
    narrativePace: value?.narrativePace ?? "immersive",
    martialSoulId,
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
    soulRings: Array.isArray(value?.soulRings) ? value.soulRings : initialGame.soulRings,
    storyFlags: Array.isArray(value?.storyFlags) ? value.storyFlags : [],
    storyHistory: Array.isArray(value?.storyHistory) ? value.storyHistory : [],
    completedEndings: Array.isArray(value?.completedEndings) ? value.completedEndings : [],
    currentStoryNodeId: hasStructuredStory ? (value?.currentStoryNodeId ?? initialGame.currentStoryNodeId) : initialGame.currentStoryNodeId,
    storyNarrative: hasStructuredStory ? (value?.storyNarrative ?? initialGame.storyNarrative) : initialGame.storyNarrative,
    storyNarrationClipId: typeof value?.storyNarrationClipId === "string" ? value.storyNarrationClipId : null,
    storyNote: hasStructuredStory ? (value?.storyNote ?? initialGame.storyNote) : initialGame.storyNote,
    storySummary: typeof value?.storySummary === "string" ? value.storySummary.slice(0, 600) : "",
    storySummaryThroughTurn: Math.max(0, Math.min(value?.turns ?? 0, value?.storySummaryThroughTurn ?? 0)),
    worldDirector: hydrateWorldDirectorState(value?.worldDirector, FACTION_IDS),
    visitedWorldLocationIds: Array.isArray(value?.visitedWorldLocationIds) && value.visitedWorldLocationIds.length > 0
      ? value.visitedWorldLocationIds
      : ["notting-city"],
    completedWorldEventIds: Array.isArray(value?.completedWorldEventIds) ? value.completedWorldEventIds : [],
    extendedRelationships: { ...initialGame.extendedRelationships, ...(value?.extendedRelationships ?? {}) },
    auctionPurchases: Array.isArray(value?.auctionPurchases) ? value.auctionPurchases : [],
    boundItemIds: Array.isArray(value?.boundItemIds) ? value.boundItemIds : [],
    claimedRewardIds: Array.isArray(value?.claimedRewardIds) ? value.claimedRewardIds : [],
  };
  const maxHp = getStats(merged).maxHp;
  const hydrated = { ...merged, currentHp: Math.max(1, Math.min(merged.currentHp || maxHp, maxHp)) };
  return hydrated.pendingNpcAction && !isNpcActionChronologicallyAvailable(hydrated, hydrated.pendingNpcAction)
    ? { ...hydrated, pendingNpcAction: null }
    : hydrated;
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

function createMilestoneSoulRing(game: GameState, order: 1 | 2): SoulRing {
  const soul = getMartialSoul(game.martialSoulId) ?? MARTIAL_SOULS[0];
  if (order === 1) {
    return {
      id: `${soul.id}-first-ring`,
      name: `百年${soul.name}魂环`,
      age: 420,
      attribute: soul.attribute,
      skillName: soul.initialSkill.name,
      skillDescription: soul.initialSkill.description,
    };
  }
  return {
    id: `${soul.id}-second-ring`,
    name: `千年${soul.name}魂环`,
    age: 1180,
    attribute: soul.attribute,
    skillName: `${soul.name}·进阶魂技`,
    skillDescription: `沿${soul.role}方向深化${soul.name}的能力，并能与史莱克伙伴形成稳定配合。`,
  };
}

function applyStoryChoice(game: GameState, choiceId: string, customAction?: string): GameState {
  const resolution = resolveStoryChoice(game, choiceId, customAction);
  if (!resolution) return game;
  const currentNode = getStoryNode(game);
  const selectedChoice = currentNode.choices.find((choice) => choice.id === choiceId);
  const destination = getStoryNode({ ...game, currentStoryNodeId: resolution.nextNodeId });
  const relationship = Math.max(0, Math.min(100, game.relationship + resolution.relationship));
  const witnessId = chooseMemoryWitness(`${currentNode.title}${selectedChoice?.label ?? ""}${resolution.narrative}`, game.relationships);
  const witnessScore = Math.max(0, Math.min(100, game.relationships[witnessId] + resolution.relationship));
  let next: GameState = {
    ...game,
    turns: game.turns + 1,
    coins: Math.max(0, game.coins + resolution.coins),
    relationship,
    relationships: { ...game.relationships, [witnessId]: witnessScore },
    currentStoryNodeId: resolution.nextNodeId,
    storyFlags: resolution.flags,
    storyHistory: [...game.storyHistory, resolution.historyEntry],
    completedEndings:
      resolution.endingName && !game.completedEndings.includes(resolution.endingName)
        ? [...game.completedEndings, resolution.endingName]
        : game.completedEndings,
    lastStoryChange: resolution.lastChange,
    location: formatStoryText(destination.location, game),
    season: destination.season,
    narrative: resolution.narrative,
    note: resolution.note,
    storyNarrative: resolution.narrative,
    storyNarrationClipId: game.storyMode === "canon" || customAction ? null : `story-${game.currentStoryNodeId}-${choiceId}`,
    storyNote: resolution.note,
  };
  if (next.storyMode === "canon" && resolution.flags.includes("第一魂环已吸收") && next.soulRings.length === 0) {
    const firstRing = createMilestoneSoulRing(next, 1);
    next = {
      ...next,
      soulRings: [firstRing],
      lastStoryChange: `第一魂环觉醒 · ${firstRing.skillName}`,
    };
  }
  if (next.storyMode === "canon" && resolution.flags.includes("第二魂环已吸收") && next.soulRings.length < 2) {
    const secondRing = createMilestoneSoulRing(next, 2);
    next = {
      ...next,
      soulRings: [...next.soulRings, secondRing],
      inventory: {
        ...next.inventory,
        millennium_essence: (next.inventory.millennium_essence ?? 0) + 1,
      },
      lastStoryChange: `第二魂环觉醒 · ${secondRing.skillName}`,
    };
  }
  const secondRingFlag = Object.keys(SECOND_SOUL_RINGS).find((flag) => resolution.flags.includes(flag));
  if (secondRingFlag && next.soulRings.length < 2) {
    next = {
      ...next,
      soulRings: [...next.soulRings, SECOND_SOUL_RINGS[secondRingFlag]],
      inventory: {
        ...next.inventory,
        millennium_essence: (next.inventory.millennium_essence ?? 0) + 1,
      },
      lastStoryChange: `第二魂环觉醒 · ${SECOND_SOUL_RINGS[secondRingFlag].name}`,
    };
  }
  if (resolution.flags.includes("海神岛认可") && (next.inventory.tide_armor ?? 0) === 0) {
    next = updateInventory(next, "tide_armor", 1);
  }
  if (resolution.rewardItemId) next = updateInventory(next, resolution.rewardItemId, 1);
  return gainSoulExperience(next, resolution.experience);
}

function isLocationUnlocked(location: WorldLocation, game: GameState) {
  if (game.storyMode === "canon") {
    const sceneIndex = getStoryNode(game).sceneIndex ?? 1;
    if (location.id === "notting-city") return sceneIndex >= 4;
    if (location.id === "shrek-academy") return sceneIndex >= 22;
    if (location.id === "star-forest") return sceneIndex >= 34;
    if (location.id === "sea-god-island") return sceneIndex >= 56;
  }
  return location.unlocked || (
    location.id === "sea-god-island" &&
    (game.storyFlags.includes("获得瀚海航图") || game.location === "海神岛")
  );
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

function getCurrentWorldLocationId(game: GameState): WorldLocationId {
  const direct = game.visitedWorldLocationIds.at(-1);
  if (direct) return direct;
  if (game.location.includes("史莱克")) return "shrek-academy";
  if (game.location.includes("星斗")) return "star-forest";
  if (game.location.includes("海神")) return "sea-god-island";
  return "notting-city";
}

function getContentProgress(game: GameState) {
  return createWorldProgress({
    soulPower: game.soulPower,
    coins: game.coins,
    victories: game.victories,
    martialSoulId: game.martialSoulId,
    storyFlags: game.storyFlags,
    completedEventIds: game.completedWorldEventIds,
    visitedLocationIds: game.visitedWorldLocationIds,
    reputation: game.worldDirector.factionReputation,
    relationships: { ...game.relationships, ...game.extendedRelationships },
  });
}

function localDirectiveFromEvent(event: RandomSideEventDefinition, choice: RandomEventChoice): WorldDirective {
  const reputationEntry = Object.entries(choice.rewards.reputation ?? {})[0];
  return {
    eventTitle: event.title,
    eventType: event.category === "人物" ? "关系" : event.category === "魂兽" ? "奇遇" : event.category,
    summary: choice.outcome,
    factionId: reputationEntry?.[0],
    reputationDelta: reputationEntry?.[1] ?? 0,
    coinDelta: choice.rewards.coins ?? 0,
    experienceDelta: choice.rewards.experience ?? 0,
    addFlag: choice.rewards.storyFlags?.[0],
    rewardItemId: choice.rewards.itemIds?.[0],
  };
}

function getStarterCombatEffects(status: string | undefined): CombatEffectDefinition[] {
  if (status === "缠绕") return [{ kind: "眩晕", target: "enemy", chance: 0.58, duration: 1, potency: 0 }];
  if (status === "破甲") return [{ kind: "虚弱", target: "enemy", chance: 0.72, duration: 2, potency: 4 }];
  if (status === "灼烧") return [{ kind: "灼烧", target: "enemy", chance: 0.72, duration: 2, potency: 7 }];
  if (status === "护盾" || status === "嘲讽") return [{ kind: "护盾", target: "self", chance: 1, duration: 2, potency: 6 }];
  if (status === "加速") return [{ kind: "迟缓", target: "enemy", chance: 0.65, duration: 2, potency: 5 }];
  return [];
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

const narrationStatusLabels: Record<NarrationStatus, string> = {
  idle: "等待下一段剧情",
  speaking: "正在自动朗读",
  paused: "旁白已暂停",
  unavailable: "当前段落仅显示文字",
};

function NarrationControls({
  enabled,
  status,
  supported,
  onToggle,
  onPauseOrResume,
  onReplay,
}: {
  enabled: boolean;
  status: NarrationStatus;
  supported: boolean;
  onToggle: () => void;
  onPauseOrResume: () => void;
  onReplay: () => void;
}) {
  return (
    <div className="narration-controls" aria-label="语音旁白控制">
      <button
        type="button"
        onClick={onToggle}
        disabled={!supported}
        aria-label={enabled ? "关闭自动语音旁白" : "开启自动语音旁白"}
        aria-pressed={enabled}
        title={enabled ? "关闭自动语音旁白" : "开启自动语音旁白"}
      >
        {enabled ? <SpeakerLoudIcon /> : <SpeakerOffIcon />}
      </button>
      <button
        type="button"
        onClick={onPauseOrResume}
        disabled={!enabled || status === "idle" || status === "unavailable"}
        aria-label={status === "paused" ? "继续语音旁白" : "暂停语音旁白"}
        title={status === "paused" ? "继续语音旁白" : "暂停语音旁白"}
      >
        {status === "paused" ? <PlayIcon /> : <PauseIcon />}
      </button>
      <button
        type="button"
        onClick={onReplay}
        disabled={!enabled || !supported}
        aria-label="重新朗读当前旁白"
        title="重新朗读当前旁白"
      >
        <ReloadIcon />
      </button>
    </div>
  );
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
  const [originPlace, setOriginPlace] = useState("法斯诺行省边缘村落");
  const [background, setBackground] = useState("普通家庭");
  const [lifeGoal, setLifeGoal] = useState("与伙伴同行，也走出自己的道路");
  const [secret, setSecret] = useState("");
  const [narrativePace, setNarrativePace] = useState<GameState["narrativePace"]>("immersive");
  const [selectedMartialSoulId, setSelectedMartialSoulId] = useState<MartialSoulId>("blue-silver-grass");
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
  const [selectedWorldEvent, setSelectedWorldEvent] = useState<RandomSideEventDefinition | null>(null);
  const [worldThinking, setWorldThinking] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [browserAiConfig, setBrowserAiConfig] = useState<BrowserAiConfig>(loadBrowserAiConfig);
  const summaryAttemptKeyRef = useRef("");
  const lastNarrationKeyRef = useRef("");
  const game = session.game;
  const stats = useMemo(() => getStats(game), [game]);
  const selectedLocation = selectedLocationId
    ? (() => {
        const location = locations.find((item) => item.id === selectedLocationId);
        if (!location) return null;
        const unlocked = isLocationUnlocked(location, game);
        if (location.id !== "sea-god-island" || !unlocked) return { ...location, unlocked };
        return {
          ...location,
          unlocked,
          distance: "西海远航",
          travelTime: "三日航程",
          description: "被潮汐与传说包围的神秘岛屿。瀚海航图已经标出外围安全航线，真正的试炼将在登岛后开始。",
          arrival: "清晨的海雾向两侧散开，高耸海崖与蓝色神殿出现在地平线。岛上的潮汐正以奇异节奏回应你的魂力。",
          note: "已抵达海神岛。可以进入潮汐试炼，并追查深海魂晶的真正来源。",
          season: "十一月·清晨",
          questTitle: "通过潮汐试炼",
          questDescription: "在风暴、幻境与魂兽守护中获得海神岛认可。",
        };
      })()
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
  const narration = useNarration();

  useEffect(() => {
    const isSpeaking = narration.status === "speaking";
    music.setNarrationDucking(isSpeaking, -9);
    return () => music.setNarrationDucking(false);
  }, [music.setNarrationDucking, narration.status, stage]);

  useEffect(() => {
    if (stage !== "game") return;
    if (!narration.enabled) {
      lastNarrationKeyRef.current = "";
      narration.stop();
      return;
    }
    if (activeTab !== "story" || thinking) {
      narration.stop();
      return;
    }
    const narrationKey = `${game.currentStoryNodeId}:${game.storyNarrative}`;
    if (lastNarrationKeyRef.current === narrationKey) return;
    lastNarrationKeyRef.current = narrationKey;
    narration.speak(game.storyNarrative, narrationClipUrl(game.storyNarrationClipId));
  }, [activeTab, game.currentStoryNodeId, game.storyNarrationClipId, game.storyNarrative, narration.enabled, narration.speak, narration.stop, stage, thinking]);

  useEffect(() => {
    if (stage !== "game" || !narration.enabled || !narration.hasRecordedClip || narration.status !== "unavailable") return;
    const resumeAfterMobileGesture = () => narration.replay();
    window.addEventListener("pointerdown", resumeAfterMobileGesture, { once: true });
    return () => window.removeEventListener("pointerdown", resumeAfterMobileGesture);
  }, [narration.enabled, narration.hasRecordedClip, narration.replay, narration.status, stage]);

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
    const martialSoul = getMartialSoul(selectedMartialSoulId) ?? MARTIAL_SOULS[0];
    const base: GameState = {
      ...initialGame,
      name: name.trim() || "无名",
      identity,
      talent,
      storyMode: "canon",
      narrativePace,
      originPlace,
      background,
      lifeGoal,
      secret: secret.trim(),
      martialSoulId: martialSoul.id,
      martialSoul: martialSoul.name,
      martialAttribute: martialSoul.attribute,
      soulRings: [],
      currentStoryNodeId: CANON_START_NODE_ID,
      storyNarrationClipId: null,
    };
    const openingNarration = getStoryIntro(base);
    const openingNode = getStoryNode(base);
    const nextGame: GameState = {
      ...base,
      currentHp: getStats(base).maxHp,
      location: formatStoryText(openingNode.location, base),
      season: openingNode.season,
      narrative: openingNarration,
      storyNarrative: openingNarration,
      note: formatStoryText(openingNode.timelineNote ?? openingNode.quest, base),
      storyNote: formatStoryText(openingNode.canonAnchor ?? openingNode.quest, base),
      lastStoryChange: `原著同行 · ${originPlace} · ${background}`,
    };
    keyboard.hide();
    setSession(createSession(nextGame));
    lastNarrationKeyRef.current = `${nextGame.currentStoryNodeId}:${nextGame.storyNarrative}`;
    narration.speak(openingNarration);
    music.playEvent("martial_soul_awakened");
    window.setTimeout(() => {
      resetPhoneViewport();
      setStage("game");
      setActiveTab("story");
    }, 300);
  };

  const startPrologue = () => {
    keyboard.hide();
    narration.speak(PROLOGUE_NARRATION);
    setStage("prologue");
  };

  const continueFromPrologue = () => {
    narration.stop();
    setStage("creation");
  };

  const chooseStory = (choiceId: string) => {
    if (thinking) return;
    const node = getStoryNode(game);
    const choice = node.choices.find((item) => item.id === choiceId);
    const resolution = resolveStoryChoice(game, choiceId);
    if (!choice || !resolution) return;
    void music.playEvent("story_choice");
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
    void music.playEvent("story_choice");

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
          martialSoul: game.martialSoul,
          originPlace: game.originPlace,
          background: game.background,
          lifeGoal: game.lifeGoal,
          secret: game.secret,
        },
        scene: {
          chapter: node.chapter,
          title: node.title,
          location: node.location,
          narrative: game.storyNarrative,
          localOutcome: resolution.narrative,
          canonAnchor: node.canonAnchor,
          storyMode: game.storyMode,
          narrativePace: game.narrativePace,
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
        storyNarrationClipId: "timeline-restart",
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
              narrative: location.arrival,
              note: location.note,
              lastStoryChange: `旅行抵达 · ${location.name}`,
              turns: current.turns + 1,
              visitedWorldLocationIds: current.visitedWorldLocationIds.includes(location.id as WorldLocationId)
                ? current.visitedWorldLocationIds
                : [...current.visitedWorldLocationIds, location.id as WorldLocationId],
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
          martialSoul: game.martialSoul,
          background: game.background,
          lifeGoal: game.lifeGoal,
          secret: game.secret,
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
    void music.playEvent("story_choice");
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
          storyNarrationClipId: null,
          storyNote: response.note,
          lastStoryChange: `${getCharacter(action.characterId).name}主动行动 · 已回应`,
        };
      },
      { title: activeAction.title, summary: selectedResponse.note },
    );
    setToast(`${getCharacter(activeAction.characterId).name}的主动事件已回应`);
    window.setTimeout(resetPhoneViewport, 120);
  };

  const discoverWorldEvent = () => {
    const eligible = getEligibleRandomEvents(getCurrentWorldLocationId(game), getContentProgress(game));
    if (eligible.length === 0) {
      setToast("当前区域暂时没有新的支线，推进主线或前往其他地点后再来看看");
      return;
    }
    const weighted = eligible.flatMap((event) => Array.from({ length: Math.max(1, event.weight) }, () => event));
    setSelectedWorldEvent(weighted[game.worldDirector.explorationSeed % weighted.length]);
  };

  const resolveWorldEvent = async (event: RandomSideEventDefinition, choice: RandomEventChoice) => {
    if (worldThinking) return;
    void music.playEvent("story_choice");
    setWorldThinking(true);
    const localDirective = localDirectiveFromEvent(event, choice);
    const allowedFlags = RANDOM_SIDE_EVENTS.flatMap((item) => item.choices.flatMap((itemChoice) => (
      "storyFlags" in itemChoice.rewards ? itemChoice.rewards.storyFlags ?? [] : []
    )));
    let directive = localDirective;
    let usedAi = false;
    try {
      const aiResult = await generateAiAction({
        mode: "world",
        action: choice.label,
        player: {
          name: game.name,
          identity: game.identity,
          talent: game.talent,
          soulPower: game.soulPower,
          martialSoul: game.martialSoul,
          originPlace: game.originPlace,
          background: game.background,
          lifeGoal: game.lifeGoal,
        },
        scene: {
          chapter: "开放世界",
          title: event.title,
          location: game.location,
          narrative: event.summary,
          localOutcome: choice.outcome,
        },
        storySummary: game.storySummary,
        flags: game.storyFlags,
        world: {
          day: game.worldDirector.day,
          reputation: game.worldDirector.factionReputation,
          factionIds: FACTION_IDS,
          locationIds: game.visitedWorldLocationIds,
          rewardItemIds: Object.keys(ITEMS),
          flagIds: allowedFlags,
          localEvent: { title: event.title, choice: choice.label, outcome: choice.outcome },
        },
      });
      const normalized = normalizeWorldDirective(aiResult.worldDirective, {
        factionIds: FACTION_IDS,
        locationIds: game.visitedWorldLocationIds,
        rewardItemIds: Object.keys(ITEMS),
        flagIds: allowedFlags,
      });
      if (normalized) {
        directive = normalized;
        usedAi = true;
      }
    } catch {
      usedAi = false;
    }

    commitGame(
      (current) => {
        const turn = current.turns + 1;
        let next: GameState = {
          ...current,
          turns: turn,
          coins: Math.max(0, current.coins + directive.coinDelta),
          worldDirector: applyWorldDirective(current.worldDirector, directive, turn, usedAi ? "AI导演" : "本地事件"),
          completedWorldEventIds: event.repeatable || current.completedWorldEventIds.includes(event.id)
            ? current.completedWorldEventIds
            : [...current.completedWorldEventIds, event.id],
          extendedRelationships: { ...current.extendedRelationships },
          storyFlags: directive.addFlag && !current.storyFlags.includes(directive.addFlag)
            ? [...current.storyFlags, directive.addFlag]
            : current.storyFlags,
          narrative: directive.summary,
          note: `${event.title} · ${choice.label}`,
          lastStoryChange: `${usedAi ? "AI 世界导演" : "本地世界事件"} · ${event.title}`,
        };
        for (const [characterId, delta] of Object.entries(choice.rewards.relationships ?? {})) {
          next.extendedRelationships[characterId] = Math.max(0, Math.min(100, (next.extendedRelationships[characterId] ?? 20) + delta));
        }
        if (directive.rewardItemId && ITEMS[directive.rewardItemId]) next = updateInventory(next, directive.rewardItemId, 1);
        return gainSoulExperience(next, directive.experienceDelta);
      },
      { title: event.title, summary: directive.summary },
    );
    setSelectedWorldEvent(null);
    setWorldThinking(false);
    setToast(usedAi ? "AI 世界导演已生成并校验本次支线" : "已使用本地世界规则完成支线");
  };

  const buyAuctionItem = (itemId: string, price: number) => {
    if (game.auctionPurchases.includes(itemId)) {
      setToast("本轮拍卖已经买下该物品");
      return;
    }
    if (game.coins < price) {
      setToast("金魂币不足，无法一口价竞拍");
      return;
    }
    const item = ITEMS[itemId];
    if (!item) return;
    commitGame(
      (current) => updateInventory({
        ...current,
        turns: current.turns + 1,
        coins: current.coins - price,
        auctionPurchases: [...current.auctionPurchases, itemId],
        narrative: `拍卖师落槌，你以 ${price} 金魂币获得了${item.name}。`,
        note: item.category === "魂骨" ? "魂骨装备后会与魂师绑定，出售前请慎重考虑。" : "拍卖品已经收入行囊。",
      }, itemId, 1),
      { title: `拍得${item.name}`, summary: `支付 ${price} 金魂币完成竞拍。` },
    );
    setToast(`${item.name}已收入行囊`);
  };

  const openCombat = () => {
    if (!game.soulRings[0]) {
      setToast("完成第一次猎魂并获得魂环后，才会开放自由战斗");
      setActiveTab("story");
      return;
    }
    const enemy = ENEMIES[game.victories % ENEMIES.length];
    const soul = getMartialSoul(game.martialSoulId) ?? MARTIAL_SOULS[0];
    const playerActions = [
      { id: "basic", name: "普通攻击", kind: "basic" as const, energyCost: 0, power: 0.88, attribute: "无" as const },
      { id: "skill", name: game.soulRings[0].skillName, kind: "soulSkill" as const, energyCost: 2, power: 1.25, attribute: game.martialAttribute, effects: getStarterCombatEffects(soul.initialSkill.status) },
      ...(game.soulRings[1] ? [{ id: "secondSkill", name: game.soulRings[1].skillName, kind: "soulSkill" as const, energyCost: 3, power: 1.62, attribute: game.martialAttribute, effects: [{ kind: "眩晕" as const, target: "enemy" as const, chance: 0.72, duration: 1, potency: 0 }] }] : []),
    ];
    const engine = startBattle({
      id: `${enemy.id}:${game.turns}:${game.victories}`,
      seed: game.worldDirector.explorationSeed + game.turns + 1,
      player: {
        id: "player",
        name: game.name,
        hp: Math.min(game.currentHp, stats.maxHp),
        energy: 2,
        maxEnergy: 4,
        attribute: game.martialAttribute,
        stats,
        actions: playerActions,
      },
      enemy: {
        id: enemy.id,
        name: enemy.name,
        maxEnergy: 4,
        energy: 2,
        attribute: enemy.attribute,
        stats: { maxHp: enemy.maxHp, attack: enemy.attack, defense: enemy.defense, speed: enemy.speed, control: Math.max(8, enemy.speed - 2) },
        actions: [
          { id: "enemy-basic", name: "魂兽扑击", kind: "basic", energyCost: 0, power: 0.82, attribute: "无", aiWeight: 4 },
          { id: "enemy-skill", name: "野性震荡", kind: "soulSkill", energyCost: 2, power: 1.08, attribute: enemy.attribute, effects: [{ kind: "迟缓", target: "enemy", chance: 0.35, duration: 1, potency: 3 }], aiWeight: 2 },
        ],
      },
      reward: { id: `reward:${enemy.id}:${game.victories}`, coins: enemy.coinReward, soulExperience: enemy.expReward, items: { [enemy.lootId]: 1 } },
    });
    setCombat({
      enemyId: enemy.id,
      enemyHp: engine.enemy.hp,
      playerHp: engine.player.hp,
      energy: engine.player.energy,
      round: engine.round,
      status: engine.status,
      log: [`${enemy.name}挡住了去路。你的${game.martialSoul}已经展开。`],
      engine,
    });
    music.playEvent("boss_appears");
  };

  const performCombatAction = (action: CombatAction) => {
    if (!combat || combat.status !== "active") return;
    const enemy = ENEMIES.find((item) => item.id === combat.enemyId);
    if (enemy && combat.engine) {
      const result = performBattleTurn(combat.engine, action);
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      const engine = result.value;
      const nextCombat: CombatState = {
        ...combat,
        enemyHp: engine.enemy.hp,
        playerHp: engine.player.hp,
        energy: engine.player.energy,
        round: engine.round,
        status: engine.status,
        log: [...engine.events.slice(-6).reverse().map((event) => event.text), ...combat.log].slice(0, 10),
        engine,
      };
      setCombat(nextCombat);
      if (engine.status === "won") {
        const willLevel = game.soulProgress + enemy.expReward >= soulExperienceRequired(game.soulPower);
        commitGame(
          (current) => gainSoulExperience(updateInventory({
            ...current,
            turns: current.turns + 1,
            victories: current.victories + 1,
            coins: current.coins + enemy.coinReward,
            currentHp: Math.max(1, engine.player.hp),
            narrative: `你在${current.location}击败了${enemy.name}。${game.soulRings[0].skillName}的实战运用更加成熟。`,
            note: `持续状态与属性克制完成结算，获得${ITEMS[enemy.lootId].name}。`,
          }, enemy.lootId, 1), enemy.expReward),
          { title: `战胜${enemy.name}`, summary: `获得 ${enemy.expReward} 经验、${enemy.coinReward} 金魂币和${ITEMS[enemy.lootId].name}。` },
        );
        setToast(willLevel ? "战斗突破，魂力等级提升" : "战利品已放入行囊");
        music.playEvent(willLevel ? "level_breakthrough" : "battle_victory");
      } else if (engine.status === "lost") {
        commitGame(
          (current) => ({ ...current, turns: current.turns + 1, currentHp: 1, coins: Math.max(0, current.coins - 3), narrative: `你没能突破${enemy.name}的阻拦，只得带伤撤退。`, note: "战斗失败，损失 3 金魂币。" }),
          { title: `败于${enemy.name}`, summary: "撤退并保留战斗经验。" },
        );
        setToast("战斗失败，已保留本次时间节点");
      }
      return;
    }
    const secondRing = game.soulRings[1];
    const energyCost = action === "secondSkill" ? 3 : action === "skill" ? 2 : 0;
    if (!enemy || combat.energy < energyCost || (action === "secondSkill" && !secondRing)) return;

    const isSkill = action !== "basic";
    const skillName = action === "secondSkill" ? secondRing.skillName : action === "skill" ? game.soulRings[0].skillName : "普通攻击";
    const attackAttribute: SoulAttribute = isSkill ? game.martialAttribute : "无";
    const multiplier = attributeMultiplier(attackAttribute, enemy.attribute);
    const power = action === "secondSkill" ? 1.62 : action === "skill" ? 1.25 : 0.88;
    const damage = calculateDamage(stats.attack, enemy.defense, power, multiplier);
    const enemyHp = Math.max(0, combat.enemyHp - damage);
    const energy = isSkill ? combat.energy - energyCost : Math.min(4, combat.energy + 1);
    const stunned = isSkill && (action === "secondSkill" || combat.round % 2 === 1) && stats.control >= enemy.speed;
    const nextLog = [
      `${skillName}造成 ${damage} 点伤害${multiplier > 1 ? "，触发属性克制" : multiplier < 1 ? "，伤害受到压制" : ""}。`,
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
              narrative: `你在${current.location}击败了${enemy.name}。${skillName}在实战中变得更加凝练。`,
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
        log: [`${game.martialSoul}控制住了${enemy.name}，对方本轮无法反击。`, ...nextLog],
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
    if (item.effect.kind === "energy" && (!combat || combat.status !== "active")) {
      setToast("回魂露需要在战斗中使用");
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
    if (item.effect.kind === "energy" && combat) {
      setCombat({ ...combat, energy: Math.min(4, combat.energy + item.effect.amount) });
    }
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
    if (item.sellPrice === null || (game.inventory[itemId] ?? 0) <= 0 || equipped || game.boundItemIds.includes(itemId)) return;
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
        boundItemIds: !isEquipped && item.category === "魂骨" && !current.boundItemIds.includes(itemId)
          ? [...current.boundItemIds, itemId]
          : current.boundItemIds,
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
    narration.stop();
    keyboard.hide();
    window.localStorage.removeItem(SAVE_KEY);
    window.localStorage.removeItem(LEGACY_SAVE_KEY);
    setSelectedLocationId(null);
    setSelectedCharacterId(null);
    setSelectedItem(null);
    setCombat(null);
    setResetConfirmOpen(false);
    setSession(createSession(initialGame));
    setGameCreationDefaults();
    setStage("welcome");
    setActiveTab("story");
  };

  const setGameCreationDefaults = () => {
    setName("");
    setIdentity("原创角色");
    setTalent("天才档");
    setOriginPlace("法斯诺行省边缘村落");
    setBackground("普通家庭");
    setLifeGoal("与伙伴同行，也走出自己的道路");
    setSecret("");
    setNarrativePace("immersive");
    setSelectedMartialSoulId("blue-silver-grass");
  };

  const selectedItemDefinition = selectedItem ? ITEMS[selectedItem.id] : null;
  const selectedItemEquipped = selectedItemDefinition?.slot
    ? game.equipment[selectedItemDefinition.slot] === selectedItemDefinition.id
    : false;

  return (
    <div className="game-shell">
      <MobileScroll className="game-scroll" key={`${stage}-${activeTab}-${game.turns}`}>
        {stage === "welcome" ? (
          <WelcomeScreen onStart={startPrologue} />
        ) : stage === "prologue" ? (
          <PrologueScreen
            narrationEnabled={narration.enabled}
            narrationStatus={narration.status}
            narrationSupported={narration.currentSupported}
            onToggleNarration={narration.toggleEnabled}
            onPauseOrResume={narration.pauseOrResume}
            onReplay={narration.replay}
            onContinue={continueFromPrologue}
          />
        ) : stage === "creation" ? (
          <CreationScreen
            name={name}
            identity={identity}
            talent={talent}
            originPlace={originPlace}
            background={background}
            lifeGoal={lifeGoal}
            secret={secret}
            narrativePace={narrativePace}
            martialSoulId={selectedMartialSoulId}
            onNameChange={setName}
            onIdentityChange={setIdentity}
            onTalentChange={setTalent}
            onOriginPlaceChange={setOriginPlace}
            onBackgroundChange={setBackground}
            onLifeGoalChange={setLifeGoal}
            onSecretChange={setSecret}
            onNarrativePaceChange={setNarrativePace}
            onMartialSoulChange={setSelectedMartialSoulId}
            onBegin={beginGame}
          />
        ) : (
          <main className="screen-content game-content">
            {activeTab === "story" ? (
              <StoryScreen
                game={game}
                thinking={thinking}
                musicMuted={music.muted}
                musicReady={music.ready}
                narrationEnabled={narration.enabled}
                narrationStatus={narration.status}
                narrationSupported={narration.currentSupported}
                onChoose={chooseStory}
                onCustom={() => setCustomOpen(true)}
                onToggleMusic={music.toggleMuted}
                onToggleNarration={narration.toggleEnabled}
                onPauseOrResumeNarration={narration.pauseOrResume}
                onReplayNarration={narration.replay}
                onRestart={restartStory}
                onRespondToNpc={respondToNpcAction}
              />
            ) : null}
            {activeTab === "world" ? (
              <WorldScreen
                game={game}
                worldThinking={worldThinking}
                onBattle={openCombat}
                onSelectLocation={openLocation}
                onExplore={discoverWorldEvent}
              />
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
                onBuyAuction={buyAuctionItem}
              />
            ) : null}
            {activeTab === "archive" ? (
              <ArchiveScreen
                session={session}
                aiEnabled={browserAiConfig.enabled}
                aiModel={browserAiConfig.modelId}
                musicMuted={music.muted}
                musicReady={music.ready}
                narrationEnabled={narration.enabled}
                narrationStatus={narration.status}
                narrationSupported={narration.supported}
                onToggleMusic={music.toggleMuted}
                onToggleNarration={narration.toggleEnabled}
                onOpenAiSettings={() => {
                  keyboard.hide();
                  setAiSettingsOpen(true);
                }}
                onSave={saveNow}
                onRewind={rewindTo}
                onReset={() => {
                  keyboard.hide();
                  setResetConfirmOpen(true);
                }}
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
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="确认重新创建角色？"
        description="这是不可撤销的清档操作，请确认后再继续。"
        snap={0.42}
      >
        <div className="reset-confirm-sheet">
          <div className="reset-warning">
            <ExclamationTriangleIcon aria-hidden="true" />
            <p><strong>当前角色进度将被清除</strong><span>角色属性、剧情时间线、已发现结局、关系、行囊和战斗记录都会从当前设备删除。</span></p>
          </div>
          <button className="confirm-reset-button" type="button" onClick={resetGame}>确认清除并重新创建</button>
          <button className="secondary-sheet-button" type="button" onClick={() => setResetConfirmOpen(false)}>取消，保留当前角色</button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={aiSettingsOpen}
        onOpenChange={setAiSettingsOpen}
        title="玩家自带 AI"
        description="连接成功才启用；连接失败时游戏会自动使用本地剧情。"
        snap={0.78}
      >
        <AiSettingsSheet
          config={browserAiConfig}
          onChange={setBrowserAiConfig}
        />
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedWorldEvent)}
        onOpenChange={(open) => {
          if (!open && !worldThinking) setSelectedWorldEvent(null);
        }}
        title={selectedWorldEvent?.title ?? "世界支线"}
        description={selectedWorldEvent ? `${selectedWorldEvent.category} · ${game.location}` : undefined}
        snap={0.66}
      >
        {selectedWorldEvent ? (
          <WorldEventSheet
            event={selectedWorldEvent}
            choices={getAvailableEventChoices(selectedWorldEvent, getContentProgress(game))}
            thinking={worldThinking}
            onChoose={(choice) => resolveWorldEvent(selectedWorldEvent, choice)}
          />
        ) : null}
      </BottomSheet>

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
    <main
      className="screen-content welcome-screen"
      style={{ backgroundImage: `url("${mobileGameAssetUrl("game-assets/notting-city.png")}")` }}
    >
      <div className="welcome-emblem" aria-hidden="true">
        <img src={mobileGameAssetUrl("game-assets/soul-meter.png")} alt="" width="384" height="384" fetchPriority="high" />
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

function PrologueScreen({
  narrationEnabled,
  narrationStatus,
  narrationSupported,
  onToggleNarration,
  onPauseOrResume,
  onReplay,
  onContinue,
}: {
  narrationEnabled: boolean;
  narrationStatus: NarrationStatus;
  narrationSupported: boolean;
  onToggleNarration: () => void;
  onPauseOrResume: () => void;
  onReplay: () => void;
  onContinue: () => void;
}) {
  return (
    <main
      className="screen-content prologue-screen"
      style={{ backgroundImage: `url("${mobileGameAssetUrl("game-assets/world-map.png")}")` }}
    >
      <article className="prologue-panel">
        <span className="section-kicker">世界序章 · 自动旁白</span>
        <h1>在你的命运开始之前</h1>
        <div className="prologue-status" role="status">
          <span className={narrationStatus === "speaking" ? "active" : ""} aria-hidden="true" />
          {narrationEnabled ? narrationStatusLabels[narrationStatus] : "自动旁白已关闭"}
        </div>
        <div className="prologue-copy">
          {PROLOGUE_PARAGRAPHS.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <NarrationControls
          enabled={narrationEnabled}
          status={narrationStatus}
          supported={narrationSupported}
          onToggle={onToggleNarration}
          onPauseOrResume={onPauseOrResume}
          onReplay={onReplay}
        />
        <button className="primary-button prologue-continue" type="button" onClick={onContinue}>
          塑造我的身份
          <ChevronRightIcon />
        </button>
        <small className="prologue-hint">无需等待朗读结束，点击后会自动停止旁白并继续。</small>
      </article>
    </main>
  );
}

type CreationProps = {
  name: string;
  identity: string;
  talent: string;
  originPlace: string;
  background: string;
  lifeGoal: string;
  secret: string;
  narrativePace: GameState["narrativePace"];
  martialSoulId: MartialSoulId;
  onNameChange: (value: string) => void;
  onIdentityChange: (value: string) => void;
  onTalentChange: (value: string) => void;
  onOriginPlaceChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onLifeGoalChange: (value: string) => void;
  onSecretChange: (value: string) => void;
  onNarrativePaceChange: (value: GameState["narrativePace"]) => void;
  onMartialSoulChange: (value: MartialSoulId) => void;
  onBegin: () => void;
};

function CreationScreen(props: CreationProps) {
  return (
    <main className="screen-content creation-screen">
      <div className="screen-heading">
        <span className="section-kicker">原著同行 · 角色创建</span>
        <h1>在原著时代，成为你自己</h1>
        <p>唐三、小舞与史莱克七怪会依照原著时间成长；你拥有自己的出身、武魂、关系和结局。</p>
      </div>

      <article className="canon-mode-card">
        <strong>主线模式已启用</strong>
        <p>从六岁武魂觉醒开始，完整经历诺丁六年、史莱克入学、魂师大赛、五年之约、海神岛与大陆终局。</p>
      </article>

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
          ["原著同行者", "进入同一时代，但不替代原著角色"],
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

      <fieldset className="choice-fieldset compact-grid creation-detail-grid">
        <legend>出生地点</legend>
        {["法斯诺行省边缘村落", "诺丁城平民区", "圣魂村邻村", "猎魂森林外围聚落"].map((item) => (
          <button className={props.originPlace === item ? "talent-chip selected" : "talent-chip"} key={item} type="button" onClick={() => props.onOriginPlaceChange(item)}>{item}</button>
        ))}
      </fieldset>

      <fieldset className="choice-fieldset compact-grid creation-detail-grid">
        <legend>家庭背景</legend>
        {["普通家庭", "工匠家庭", "没落魂师家庭", "孤身由村落照料"].map((item) => (
          <button className={props.background === item ? "talent-chip selected" : "talent-chip"} key={item} type="button" onClick={() => props.onBackgroundChange(item)}>{item}</button>
        ))}
      </fieldset>

      <fieldset className="choice-fieldset creation-goal-grid">
        <legend>人生目标</legend>
        {["与伙伴同行，也走出自己的道路", "让普通武魂也得到公平对待", "理解魂师与魂兽能否共存", "成为足以保护重要之人的强者"].map((item) => (
          <button className={props.lifeGoal === item ? "goal-card selected" : "goal-card"} key={item} type="button" onClick={() => props.onLifeGoalChange(item)}>
            <span>{item}</span>{props.lifeGoal === item ? <CheckCircledIcon /> : null}
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

      <fieldset className="choice-fieldset martial-soul-grid">
        <legend>初始武魂</legend>
        {MARTIAL_SOULS.map((soul) => (
          <button
            className={props.martialSoulId === soul.id ? "martial-soul-card selected" : "martial-soul-card"}
            key={soul.id}
            type="button"
            onClick={() => props.onMartialSoulChange(soul.id)}
          >
            <span className={`martial-soul-glyph ${soul.attribute}`}>{soul.name.slice(0, 1)}</span>
            <span><strong>{soul.name}</strong><small>{soul.quality} · {soul.role}</small></span>
            <em>{soul.initialSkill.name}</em>
          </button>
        ))}
      </fieldset>

      <label className="field-label" htmlFor="character-secret">个人秘密（可选）</label>
      <KeyboardTextarea
        id="character-secret"
        className="text-field creation-secret"
        value={props.secret}
        onChange={(event) => props.onSecretChange(event.target.value)}
        placeholder="例如：我隐约记得另一条时间线，但不确定那是否只是梦……"
        rows={3}
      />

      <fieldset className="choice-fieldset pace-grid">
        <legend>剧情节奏</legend>
        {([
          ["immersive", "沉浸", "完整场景与人物交流，推荐首次游玩"],
          ["standard", "标准", "保留关键对话与成长过程"],
          ["fast", "快速", "压缩过场，更快抵达重大事件"],
        ] as const).map(([value, title, detail]) => (
          <button className={props.narrativePace === value ? "pace-card selected" : "pace-card"} key={value} type="button" onClick={() => props.onNarrativePaceChange(value)}>
            <strong>{title}{value === "immersive" ? " · 推荐" : ""}</strong><small>{detail}</small>
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
  musicMuted,
  musicReady,
  narrationEnabled,
  narrationStatus,
  narrationSupported,
  onChoose,
  onCustom,
  onToggleMusic,
  onToggleNarration,
  onPauseOrResumeNarration,
  onReplayNarration,
  onRestart,
  onRespondToNpc,
}: {
  game: GameState;
  thinking: boolean;
  musicMuted: boolean;
  musicReady: boolean;
  narrationEnabled: boolean;
  narrationStatus: NarrationStatus;
  narrationSupported: boolean;
  onChoose: (choiceId: string) => void;
  onCustom: () => void;
  onToggleMusic: () => void;
  onToggleNarration: () => void;
  onPauseOrResumeNarration: () => void;
  onReplayNarration: () => void;
  onRestart: () => void;
  onRespondToNpc: (responseIndex: number) => void;
}) {
  const node = getStoryNode(game);
  const activeNpcAction = getNpcAction(game.pendingNpcAction);
  const activeNpcCharacter = activeNpcAction ? getCharacter(activeNpcAction.characterId) : null;
  const displayLocation = formatStoryText(node.location, game);
  const image = node.image ?? (displayLocation.includes("诺丁") ? "/game-assets/notting-city.png" : "/game-assets/world-map.png");
  const terminalEnding = Boolean(node.endingName && node.choices.length === 0);
  return (
    <section className="story-screen" aria-label="当前剧情">
      <div className="story-chapter-bar"><span>{node.chapter}</span><strong>时间线 {game.storyCycle}</strong></div>
      <header className="location-bar">
        <span><DrawingPinIcon />{displayLocation} · {node.season}</span>
        <button
          className="story-audio-toggle"
          type="button"
          onClick={onToggleMusic}
          disabled={!musicReady}
          aria-label={musicReady ? (musicMuted ? "开启游戏声音" : "关闭游戏声音") : "游戏声音正在准备"}
          aria-pressed={!musicMuted}
          title={musicMuted ? "开启游戏声音" : "关闭游戏声音"}
        >
          {musicMuted ? <SpeakerOffIcon /> : <SpeakerLoudIcon />}
        </button>
      </header>
      {node.canonAnchor ? (
        <aside className="canon-anchor-card" aria-label="原著时间锚点">
          <span>原著时间锚点</span>
          <strong>{formatStoryText(node.canonAnchor, game)}</strong>
          {node.sceneIndex && node.sceneCount ? <small>主线场景 {node.sceneIndex} / {node.sceneCount}</small> : null}
        </aside>
      ) : null}
      <div className="story-art">
        <img src={mobileGameAssetUrl(image)} alt={node.imageAlt ?? `${displayLocation}当前剧情场景`} width="720" height="1279" fetchPriority="high" />
        <span className="story-scene-title"><small>{node.quest}</small><strong>{node.title}</strong></span>
      </div>
      <article className="narrative-card">
        <div className="narrative-heading">
          <span className="narrator-label">
            <ReaderIcon />
            <span>旁白<small>{narrationEnabled ? narrationStatusLabels[narrationStatus] : "自动旁白已关闭"}</small></span>
          </span>
          <NarrationControls
            enabled={narrationEnabled}
            status={narrationStatus}
            supported={narrationSupported}
            onToggle={onToggleNarration}
            onPauseOrResume={onPauseOrResumeNarration}
            onReplay={onReplayNarration}
          />
        </div>
        <p>{thinking ? "魂力在空气里轻轻震动，世界正在回应你的选择……" : game.storyNarrative}</p>
      </article>
      {!thinking && node.dialogue?.length ? (
        <section className="scene-dialogue" aria-label="当前场景人物对话">
          <header><ChatBubbleIcon /><span>场景对话</span></header>
          {node.dialogue.map((line, index) => (
            <div key={`${line.speaker}-${index}`}>
              <strong>{formatStoryText(line.speaker, game)}</strong>
              <p>{formatStoryText(line.text, game)}</p>
            </div>
          ))}
        </section>
      ) : null}
      <div className="change-chip"><MagicWandIcon /><span>{game.lastStoryChange}</span></div>
      {activeNpcAction && activeNpcCharacter ? (
        <section className={`npc-action-card ${activeNpcCharacter.tone}`} aria-label={`${activeNpcCharacter.name}主动事件`}>
          <header>
            <img src={activeNpcCharacter.image} alt={`${activeNpcCharacter.name}角色头像`} width="384" height="384" decoding="async" />
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
          <span className="section-kicker">{terminalEnding ? "最终结局" : "第一卷结局"}</span><h2>{node.endingName}</h2>
          <p>{terminalEnding ? "这条跨越大陆与远海的时间线已经完整收束。" : "第一卷已完成，命运将继续通往天斗暗潮、魂师精英赛与海神岛。"} 已发现 {game.completedEndings.length} / {ALL_ENDINGS.length} 个结局。</p>
          <div className="ending-collection">
            {ALL_ENDINGS.map((ending) => (
              <span className={game.completedEndings.includes(ending) ? "found" : ""} key={ending}>{game.completedEndings.includes(ending) ? ending : "未发现"}</span>
            ))}
          </div>
          {terminalEnding ? <button className="primary-button" type="button" onClick={onRestart}>开启下一条时间线</button> : null}
        </div>
      ) : null}
      {!terminalEnding ? (
      <div className="option-list" aria-label="行动选项">
        {node.choices.map((choice, index) => {
          const locked = Boolean(choice.condition && !choice.condition(game));
          return (
          <button className={locked ? "locked" : ""} key={choice.id} type="button" onClick={() => onChoose(choice.id)} disabled={thinking || locked || Boolean(activeNpcAction)}>
            <span className="option-letter">{String.fromCharCode(65 + index)}</span>
            <span>{formatStoryText(choice.label, game)}{locked ? <small>{choice.lockedText}</small> : null}</span>
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
      ) : null}
      {game.storyMode === "canon" && game.storyHistory.length > 0 ? (
        <details className="journey-recap">
          <summary>最近的原著同行经历 <span>{game.storyHistory.length} 次选择</span></summary>
          <div>
            {game.storyHistory.slice(-5).reverse().map((entry, index) => (
              <article key={`${entry.nodeTitle}-${entry.choiceLabel}-${index}`}>
                <strong>{entry.nodeTitle}</strong>
                <p>{entry.choiceLabel}</p>
                <small>{entry.result}</small>
              </article>
            ))}
          </div>
        </details>
      ) : null}
      <aside className="note-card">
        <BookmarkIcon />
        <div><strong>{node.chapter} · {node.title}</strong><p>{game.storyNote}</p>{node.timelineNote ? <small>{node.timelineNote}</small> : null}</div>
      </aside>
    </section>
  );
}

function WorldScreen({
  game,
  worldThinking,
  onBattle,
  onSelectLocation,
  onExplore,
}: {
  game: GameState;
  worldThinking: boolean;
  onBattle: () => void;
  onSelectLocation: (locationId: LocationId) => void;
  onExplore: () => void;
}) {
  const enemy = ENEMIES[game.victories % ENEMIES.length];
  const currentLocation = getLocationByName(game.location);
  const storyNode = getStoryNode(game);
  const canExploreWorld = game.storyMode !== "canon" || (storyNode.sceneIndex ?? 1) >= 4;
  const progress = getContentProgress(game);
  const unlockedCharacters = getUnlockedExtendedCharacters(progress);
  const recentWorldEvent = game.worldDirector.eventHistory.at(-1);
  return (
    <section className="world-screen">
      <header className="page-title"><span>世界</span><GlobeIcon /></header>
      <div className="map-panel" aria-label="斗罗大陆旅行地图">
        <img src={mobileGameAssetUrl("game-assets/world-map.png")} alt="斗罗大陆可探索区域地图" width="720" height="1279" decoding="async" />
        {locations.map((location) => {
          const unlocked = isLocationUnlocked(location, game);
          return (
          <button
            className={`map-label ${location.className}${location.name === game.location ? " active" : ""}${unlocked ? "" : " locked"}`}
            key={location.id}
            type="button"
            onClick={() => onSelectLocation(location.id)}
            aria-label={`${location.name}${location.name === game.location ? "，当前位置" : "，查看地点详情"}`}
            aria-pressed={location.name === game.location}
          >
            {unlocked ? null : <LockClosedIcon aria-hidden="true" />}
            {location.name}
          </button>
          );
        })}
      </div>
      <article className="world-director-card">
        <header><span><MagicWandIcon /> 世界导演</span><strong>第 {game.worldDirector.day} 日</strong></header>
        <h2>{recentWorldEvent?.title ?? "大陆正在等待你的下一次探索"}</h2>
        <p>{recentWorldEvent?.summary ?? "随机支线会结合当前位置、武魂、关系与势力声望出现；AI 只在安全规则内改变世界。"}</p>
        <button type="button" onClick={onExplore} disabled={worldThinking || !canExploreWorld}>
          {worldThinking ? "世界正在回应……" : canExploreWorld ? "探索当前区域" : "完成入学旅程后开放"}<ChevronRightIcon />
        </button>
      </article>
      <section className="faction-panel" aria-label="大陆势力声望">
        <header><span>势力声望</span><small>共 {FACTIONS.length} 个势力</small></header>
        <div>
          {FACTIONS.slice(0, 4).map((faction) => {
            const score = game.worldDirector.factionReputation[faction.id] ?? 0;
            return <article key={faction.id}><span>{faction.name}</span><strong>{score}</strong><small>{getReputationTier(faction.id, score).name}</small></article>;
          })}
        </div>
      </section>
      <section className="world-contacts-panel">
        <header><span>可结识角色</span><small>{unlockedCharacters.length} / {EXTENDED_CHARACTERS.length}</small></header>
        <div>{unlockedCharacters.slice(0, 5).map((character) => <span key={character.id}>{character.name}<small>{character.role}</small></span>)}</div>
      </section>
      <article className="quest-card story-quest-card">
        <span className="quest-icon"><ReaderIcon /></span>
        <div><small>{storyNode.chapter}</small><h2>{storyNode.title}</h2><p>{storyNode.quest}</p></div>
        <ChevronRightIcon />
      </article>
      <article className="quest-card">
        <span className="quest-icon"><DrawingPinIcon /></span>
        <div><small>{game.storyMode === "canon" ? "当前时代定位" : "当前区域任务"}</small><h2>{game.storyMode === "canon" ? formatStoryText(storyNode.canonAnchor ?? storyNode.title, game) : currentLocation.questTitle}</h2><p>{game.storyMode === "canon" ? "世界探索会随主线年代逐步开放，不会提前遇见尚未登场的人物或地点。" : currentLocation.questDescription}</p></div>
        <ChevronRightIcon />
      </article>
      {game.soulRings.length > 0 ? <><article className="quest-card battle-quest-card">
        <span className="quest-icon"><ExclamationTriangleIcon /></span>
        <div><small>实战试炼</small><h2>遭遇{enemy.name}</h2><p>{enemy.title} · {enemy.attribute}属性。根据克制关系选择攻击方式。</p></div>
        <button type="button" onClick={onBattle} aria-label={`挑战${enemy.name}`}><ChevronRightIcon /></button>
      </article>
      <button className="world-battle-button" type="button" onClick={onBattle}>
        <MagicWandIcon />进入魂师战斗
      </button>
      </> : <article className="quest-card battle-quest-card locked-battle-card"><span className="quest-icon"><LockClosedIcon /></span><div><small>实战尚未开放</small><h2>先完成第一次猎魂</h2><p>获得第一魂环后，世界页才会开放自由魂师战斗。</p></div></article>}
      <div className="world-status"><span>当前位置</span><strong>{game.location}</strong><span>实战胜场</span><strong>{game.victories}</strong></div>
    </section>
  );
}

function WorldEventSheet({
  event,
  choices,
  thinking,
  onChoose,
}: {
  event: RandomSideEventDefinition;
  choices: readonly RandomEventChoice[];
  thinking: boolean;
  onChoose: (choice: RandomEventChoice) => void;
}) {
  return (
    <div className="world-event-sheet">
      <p>{event.summary}</p>
      <div>
        {choices.map((choice) => (
          <button key={choice.id} type="button" onClick={() => onChoose(choice)} disabled={thinking}>
            <span><strong>{choice.label}</strong><small>{choice.outcome}</small></span>
            <ChevronRightIcon />
          </button>
        ))}
      </div>
      <small className="world-rule-note">结果先经过本地斗罗规则校验；AI 不可直接修改等级、稀有物品或跳过主线。</small>
    </div>
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
  const sceneIndex = getStoryNode(game).sceneIndex ?? Number.POSITIVE_INFINITY;
  const introducedCharacters = game.storyMode === "canon"
    ? characters.filter((character) => sceneIndex >= ({ "xiao-wu": 6, "ning-rongrong": 23, "dai-mubai": 23, oscar: 27 }[character.id]))
    : characters;
  return (
    <section className="relations-screen">
      <header className="profile-header">
        <div className="spirit-mark">
          {game.martialSoulId === "blue-silver-grass"
            ? <img src={mobileGameAssetUrl("game-assets/blue-silver-grass.png")} alt="蓝银草武魂徽记" width="384" height="384" decoding="async" />
            : <span className={`martial-soul-glyph ${game.martialAttribute}`}>{game.martialSoul.slice(0, 1)}</span>}
        </div>
        <div><h1>{game.name}</h1><p>魂力 <strong>{game.soulPower}级</strong></p><p>武魂 <strong>{game.martialSoul} · {game.martialAttribute}</strong></p></div>
      </header>
      <div className="soul-meter compact-soul-meter">
        <img src={mobileGameAssetUrl("game-assets/soul-meter.png")} alt="魂力进度圆环" width="384" height="384" decoding="async" />
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
      {game.soulRings.length === 0 ? <aside className="empty-soul-ring"><span className="ring-orb" /><div><strong>尚未获得第一魂环</strong><p>继续原著主线至第一次猎魂，你的武魂定位和选择会决定第一魂技。</p></div></aside> : null}
      {game.soulRings.map((ring, index) => {
        const ordinal = index === 0 ? "第一" : "第二";
        return (
          <div className="soul-ring-group" key={ring.id}>
            <article className="soul-ring-card">
              <span className={`ring-orb ${ring.age >= 1000 ? "millennium" : ""}`} aria-hidden="true" />
              <div><small>{ordinal}魂环 · {ring.age} 年</small><h3>{ring.name}</h3><p>{ring.attribute}属性</p></div>
            </article>
            <article className="soul-skill-card">
              <span><MagicWandIcon /></span>
              <div><small>{ordinal}魂技 · 消耗 {index === 0 ? 2 : 3} 点魂力</small><h3>{ring.skillName}</h3><p>{ring.skillDescription}</p></div>
            </article>
          </div>
        );
      })}
      <aside className="counter-card"><strong>属性克制</strong><p>植物克水，水克火，火克植物；克制伤害 ×1.35，被克制伤害 ×0.75。</p></aside>

      <h2 className="section-title">人物关系</h2>
      <div className="character-grid">
        {introducedCharacters.map((character) => {
          const score = game.relationships[character.id] ?? initialRelationships[character.id];
          return (
          <button
            className={`character-card ${character.tone}`}
            key={character.id}
            type="button"
            onClick={() => onSelectCharacter(character.id)}
            aria-label={`查看${character.name}的人物档案并对话，当前好感${score}`}
          >
            <img src={character.image} alt={`${character.name}角色头像`} width="384" height="384" loading="lazy" decoding="async" />
            <strong>{character.name}</strong>
            <span><HeartFilledIcon /> {getRelationshipLabel(score)} {score}</span>
            <i className="affection-track" aria-hidden="true">
              <b style={{ width: `${Math.min(100, score)}%` }} />
            </i>
          </button>
          );
        })}
      </div>
      <aside className="relation-tip"><ChatBubbleIcon /><span>{introducedCharacters.length > 0 ? "点击人物卡可查看专属档案、剧情并进行对话。" : "你还没有正式结识原著人物。关系会在对应主线场景后自然开放。"}</span></aside>
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
        <img src={character.image} alt={`${character.name}角色头像`} width="384" height="384" decoding="async" />
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
  onBuyAuction,
}: {
  game: GameState;
  stats: CharacterStats;
  mode: BagMode;
  onModeChange: (mode: BagMode) => void;
  onSelectItem: (id: string, source: BagMode) => void;
  onBuyAuction: (itemId: string, price: number) => void;
}) {
  const inventoryIds = INVENTORY_ORDER.filter((id) => (game.inventory[id] ?? 0) > 0);
  const itemIds = mode === "inventory" ? inventoryIds : mode === "shop" ? SHOP_ITEM_IDS : [];
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
        <button className={mode === "auction" ? "active" : ""} type="button" onClick={() => onModeChange("auction")}>魂师拍卖</button>
      </div>
      <div className="economy-summary">
        <span>{mode === "inventory" ? `共 ${inventoryIds.length} 种物品` : mode === "shop" ? "价格使用金魂币结算" : "一口价拍卖 · 每件限购一次"}</span>
        <strong>{game.coins} 金魂币</strong>
      </div>
      <div className="inventory-list interactive-inventory">
        {itemIds.map((id) => {
          const item = ITEMS[id];
          const quantity = game.inventory[id] ?? 0;
          const isEquipped = item.slot ? game.equipment[item.slot] === id : false;
          return (
            <button key={item.id} type="button" onClick={() => onSelectItem(id, mode)}>
              <ItemGlyph item={item} />
              <span><strong>{item.name}</strong><small>{item.category}{isEquipped ? " · 已装备" : ""}</small></span>
              <span className="item-value">{mode === "inventory" ? `× ${quantity}` : `${item.buyPrice} 金`}</span>
              <ChevronRightIcon />
            </button>
          );
        })}
      </div>
      {mode === "auction" ? (
        <div className="auction-list">
          {AUCTION_LISTINGS.map((listing) => {
            const item = ITEMS[listing.itemId];
            const sold = game.auctionPurchases.includes(listing.itemId);
            return (
              <article key={listing.itemId}>
                <ItemGlyph item={item} />
                <div><strong>{item.name}</strong><small>{listing.seller} · {item.category}</small><p>{item.description}</p></div>
                <button type="button" onClick={() => onBuyAuction(listing.itemId, listing.price)} disabled={sold || game.coins < listing.price}>
                  {sold ? "已拍得" : `${listing.price} 金`}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
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
      <div className="item-sheet-hero">
        <ItemGlyph item={item} className="item-sheet-glyph" />
        <div><span>{item.category}</span><strong>持有 {quantity}</strong></div>
      </div>
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
  onAction: (action: CombatAction) => void;
  onClose: () => void;
}) {
  const counter = getCounterText(game.martialAttribute, enemy.attribute);
  return (
    <div className="combat-sheet">
      <div className="combat-opponents">
        <article>
          <span className="combat-avatar player">
            {game.martialSoulId === "blue-silver-grass"
              ? <img src={mobileGameAssetUrl("game-assets/blue-silver-grass.png")} alt="蓝银草武魂" width="384" height="384" decoding="async" />
              : <span className={`martial-soul-glyph ${game.martialAttribute}`}>{game.martialSoul.slice(0, 1)}</span>}
          </span>
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
      {combat.engine && (combat.engine.player.statuses.length > 0 || combat.engine.enemy.statuses.length > 0) ? (
        <div className="combat-status-row">
          {combat.engine.player.statuses.map((status) => <span key={`player-${status.id}`}>自身 · {status.kind} {status.remainingTurns}回合</span>)}
          {combat.engine.enemy.statuses.map((status) => <span key={`enemy-${status.id}`}>敌方 · {status.kind} {status.remainingTurns}回合</span>)}
        </div>
      ) : null}
      <div className="combat-log" aria-live="polite">
        {combat.log.slice(0, 4).map((line, index) => <p key={`${combat.round}-${index}-${line}`}>{line}</p>)}
      </div>
      {combat.status === "active" ? (
        <div className="combat-actions">
          <button type="button" onClick={() => onAction("basic")}>
            <span>普通攻击</span><small>恢复 1 点魂力 · 中性伤害</small>
          </button>
          <button type="button" onClick={() => onAction("skill")} disabled={combat.energy < 2}>
            <span>第一魂技 · {game.soulRings[0].skillName}</span><small>消耗 2 点魂力 · {game.martialAttribute}伤害</small>
          </button>
          {game.soulRings[1] ? (
            <button className="second-soul-skill" type="button" onClick={() => onAction("secondSkill")} disabled={combat.energy < 3}>
              <span>第二魂技 · {game.soulRings[1].skillName}</span><small>消耗 3 点魂力 · 强控与高额伤害</small>
            </button>
          ) : null}
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

function ArchiveScreen({
  session,
  aiEnabled,
  aiModel,
  musicMuted,
  musicReady,
  narrationEnabled,
  narrationStatus,
  narrationSupported,
  onToggleMusic,
  onToggleNarration,
  onOpenAiSettings,
  onSave,
  onRewind,
  onReset,
}: {
  session: GameSession;
  aiEnabled: boolean;
  aiModel: string;
  musicMuted: boolean;
  musicReady: boolean;
  narrationEnabled: boolean;
  narrationStatus: NarrationStatus;
  narrationSupported: boolean;
  onToggleMusic: () => void;
  onToggleNarration: () => void;
  onOpenAiSettings: () => void;
  onSave: () => void;
  onRewind: (nodeId: string) => void;
  onReset: () => void;
}) {
  const game = session.game;
  const storyNode = getStoryNode(game);
  const timeline = [...session.nodes].sort((a, b) => b.sequence - a.sequence);
  const branchCount = new Set(session.nodes.map((node) => node.branchId)).size;
  const unlockedAchievements = ACHIEVEMENTS.filter((achievement) => achievement.unlocked(game));
  return (
    <section className="archive-screen">
      <header className="page-title"><span>档案与时间线</span><ArchiveIcon /></header>
      <article className="save-card">
        <small>{storyNode.chapter}</small><h2>{game.location} · 第 {game.turns + 1} 轮</h2><p>{game.name} · {game.identity} · {game.talent}</p>
        <div className="archive-stat-row"><span>{session.nodes.length} 个节点</span><span>{branchCount} 条分支</span><span>结局 {game.completedEndings.length}/{ALL_ENDINGS.length}</span><span>回溯 {game.rewinds} 次</span></div>
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

      <button
        className="audio-setting-button narration-setting-button"
        type="button"
        onClick={onToggleNarration}
        aria-pressed={narrationEnabled}
        disabled={!narrationSupported}
      >
        {narrationEnabled ? <ReaderIcon /> : <SpeakerOffIcon />}
        <span>
          <strong>自动语音旁白</strong>
          <small>{narrationSupported
            ? (narrationEnabled ? narrationStatusLabels[narrationStatus] : "当前已关闭，点击开启")
            : "当前浏览器不支持系统语音"}</small>
        </span>
        <span>{narrationEnabled ? "关闭" : "开启"}</span>
      </button>

      <button
        className={`audio-setting-button ai-setting-button${aiEnabled ? " connected" : ""}`}
        type="button"
        onClick={onOpenAiSettings}
        aria-label="配置玩家自己的 AI 服务"
      >
        <MagicWandIcon />
        <span>
          <strong>玩家自带 AI</strong>
          <small>{aiEnabled ? `已连接 ${aiModel}` : "未连接，当前使用本地剧情"}</small>
        </span>
        <span>设置</span>
      </button>

      <div className="achievement-heading">
        <div><span className="section-kicker">命运印记</span><h2>成就图鉴</h2></div>
        <strong>{unlockedAchievements.length} / {ACHIEVEMENTS.length}</strong>
      </div>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((achievement) => {
          const unlocked = achievement.unlocked(game);
          return (
            <article className={unlocked ? "achievement-card unlocked" : "achievement-card"} key={achievement.id}>
              <span>{unlocked ? "✦" : "◇"}</span>
              <div><strong>{unlocked ? achievement.name : "未解锁印记"}</strong><small>{achievement.description}</small></div>
            </article>
          );
        })}
      </div>

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

function AiSettingsSheet({
  config,
  onChange,
}: {
  config: BrowserAiConfig;
  onChange: (config: BrowserAiConfig) => void;
}) {
  const keyboard = useKeyboard();
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [modelId, setModelId] = useState(config.modelId);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setBaseUrl(config.baseUrl);
    setModelId(config.modelId);
    setApiKey(config.apiKey);
  }, [config.apiKey, config.baseUrl, config.modelId]);

  const saveAndTest = async () => {
    keyboard.hide();
    setTesting(true);
    setFeedback(null);
    const draft = saveBrowserAiConfig({ baseUrl, modelId, apiKey, enabled: false });
    onChange(draft);
    const result = await testBrowserAiConfig(draft);
    const saved = saveBrowserAiConfig({
      ...draft,
      enabled: result.ok,
      lastTestedAt: new Date().toISOString(),
    });
    onChange(saved);
    setFeedback({ ok: result.ok, message: result.latencyMs ? `${result.message} · ${result.latencyMs}ms` : result.message });
    setTesting(false);
  };

  const disableAi = () => {
    keyboard.hide();
    const cleared = clearBrowserAiConfig();
    onChange(cleared);
    setBaseUrl(cleared.baseUrl);
    setModelId(cleared.modelId);
    setApiKey("");
    setFeedback({ ok: true, message: "AI 已关闭并清除本机密钥，游戏继续使用本地剧情" });
  };

  return (
    <div className="ai-settings-sheet">
      <div className={`ai-connection-status ${config.enabled ? "connected" : "local"}`} role="status">
        <span aria-hidden="true" />
        <div>
          <strong>{config.enabled ? "AI 剧情已启用" : "本地剧情模式"}</strong>
          <small>{config.enabled ? `${config.modelId} · 已通过连接测试` : "不填写也能完整游玩，AI 只负责剧情润色"}</small>
        </div>
      </div>

      <label htmlFor="player-ai-url">API 地址</label>
      <KeyboardInput
        id="player-ai-url"
        type="url"
        inputMode="url"
        value={baseUrl}
        onChange={(event) => setBaseUrl(event.target.value)}
        placeholder="https://服务商地址/v1"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <label htmlFor="player-ai-model">模型 ID</label>
      <KeyboardInput
        id="player-ai-model"
        value={modelId}
        onChange={(event) => setModelId(event.target.value)}
        placeholder="例如 agnes-2.5-flash"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <label htmlFor="player-ai-key">API 密钥</label>
      <KeyboardInput
        id="player-ai-key"
        type="password"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="仅保存在当前浏览器"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <p className="ai-privacy-note">密钥只存于这台设备的浏览器，不会写入游戏代码或 GitHub。使用公共电脑时，请在离开前清除密钥。</p>

      {feedback ? (
        <div className={feedback.ok ? "ai-test-feedback success" : "ai-test-feedback error"} role="status">
          {feedback.ok ? <CheckCircledIcon /> : <ExclamationTriangleIcon />}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <button
        className="primary-button ai-test-button"
        type="button"
        onClick={saveAndTest}
        disabled={testing || !baseUrl.trim() || !modelId.trim() || !apiKey.trim()}
      >
        {testing ? <ReloadIcon className="spin-icon" /> : <MagicWandIcon />}
        {testing ? "正在测试连接…" : "保存并测试连接"}
      </button>
      <button className="secondary-sheet-button" type="button" onClick={disableAi} disabled={testing}>
        关闭 AI 并清除密钥
      </button>
    </div>
  );
}
