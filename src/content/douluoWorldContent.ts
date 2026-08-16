/**
 * 斗罗世界扩展内容包。
 *
 * 本文件只包含可序列化的规则与数据，不依赖 UI 或存档实现。
 * 主游戏接入时可通过本文件导出的查询函数获取可用内容。
 */

export type MartialSoulId =
  | "blue-silver-grass"
  | "emerald-vine-blade"
  | "clear-tide-pearl"
  | "crimson-feather-falcon"
  | "black-armor-rhino"
  | "starlight-compass";

export type SoulAttribute = "植物" | "水" | "火" | "兽" | "无";
export type MartialSoulQuality = "普通" | "稀有" | "卓越" | "顶级";
export type CombatRole = "控制" | "强攻" | "敏攻" | "防御" | "辅助";
export type StatKey = "maxHp" | "attack" | "defense" | "speed" | "control";

export type FactionId =
  | "heaven-dou-empire"
  | "star-luo-empire"
  | "spirit-hall"
  | "seven-treasure-clan"
  | "blue-lightning-clan"
  | "clear-sky-clan"
  | "shrek-academy";

export type ExistingCharacterId = "xiao-wu" | "dai-mubai" | "oscar" | "ning-rongrong";
export type ExtendedCharacterId =
  | "zhu-zhuqing"
  | "ma-hongjun"
  | "yu-xiaogang"
  | "flender"
  | "du-gu-yan"
  | "ye-lingling"
  | "shui-binger"
  | "huo-wu"
  | "lan-xing"
  | "lin-lan";
export type KnownCharacterId = ExistingCharacterId | ExtendedCharacterId;

export type WorldLocationId =
  | "notting-city"
  | "shrek-academy"
  | "soto-city"
  | "star-forest"
  | "heaven-dou-city"
  | "sunset-forest"
  | "heaven-dou-arena"
  | "seven-treasure-valley"
  | "star-luo-city"
  | "west-sea-port"
  | "vast-sea-route"
  | "sea-god-island";

export type UnlockCondition =
  | { kind: "always" }
  | { kind: "soulPower"; minimum: number }
  | { kind: "coins"; minimum: number }
  | { kind: "victories"; minimum: number }
  | { kind: "storyFlag"; flag: string }
  | { kind: "completedEvent"; eventId: string }
  | { kind: "visitedLocation"; locationId: WorldLocationId }
  | { kind: "martialSoul"; soulId: MartialSoulId }
  | { kind: "reputation"; factionId: FactionId; minimum: number }
  | { kind: "relationship"; characterId: KnownCharacterId; minimum: number }
  | { kind: "all"; conditions: readonly UnlockCondition[] }
  | { kind: "any"; conditions: readonly UnlockCondition[] }
  | { kind: "not"; condition: UnlockCondition };

export type WorldProgress = {
  soulPower: number;
  coins: number;
  victories: number;
  martialSoulId?: MartialSoulId;
  storyFlags: readonly string[];
  completedEventIds: readonly string[];
  visitedLocationIds: readonly WorldLocationId[];
  reputation: Readonly<Partial<Record<FactionId, number>>>;
  relationships: Readonly<Partial<Record<KnownCharacterId, number>>>;
};

export type ContentReward = {
  experience?: number;
  coins?: number;
  reputation?: Readonly<Partial<Record<FactionId, number>>>;
  relationships?: Readonly<Partial<Record<KnownCharacterId, number>>>;
  itemIds?: readonly string[];
  storyFlags?: readonly string[];
};

export type StarterSkill = {
  id: string;
  name: string;
  role: CombatRole;
  description: string;
  basePower: number;
  energyCost: number;
  status?: "缠绕" | "破甲" | "潮湿" | "灼烧" | "嘲讽" | "加速" | "护盾";
};

export type GrowthDirection = {
  id: string;
  name: string;
  role: CombatRole;
  description: string;
  statBias: Readonly<Partial<Record<StatKey, number>>>;
  recommendedSoulBeastTraits: readonly string[];
  unlock: UnlockCondition;
};

export type MartialSoulDefinition = {
  id: MartialSoulId;
  name: string;
  legacyNames: readonly string[];
  attribute: SoulAttribute;
  quality: MartialSoulQuality;
  role: CombatRole;
  identity: string;
  description: string;
  starterStats: Readonly<Record<StatKey, number>>;
  initialSkill: StarterSkill;
  growthDirections: readonly GrowthDirection[];
  unlock: UnlockCondition;
  compatibleStoryFlags: readonly string[];
};

const always = { kind: "always" } as const;

export const MARTIAL_SOULS = [
  {
    id: "blue-silver-grass",
    name: "蓝银草",
    legacyNames: ["蓝银草"],
    attribute: "植物",
    quality: "普通",
    role: "控制",
    identity: "韧性成长型植物武魂",
    description: "起点平实，但能借根系感知环境，适合缠绕、探查与团队控场。",
    starterStats: { maxHp: 8, attack: 1, defense: 2, speed: 1, control: 6 },
    initialSkill: { id: "blue-silver-bind", name: "蓝银缠绕", role: "控制", description: "催生蓝银藤限制目标行动。", basePower: 18, energyCost: 2, status: "缠绕" },
    growthDirections: [
      { id: "root-domain", name: "根系领域", role: "控制", description: "扩大感知与群体束缚范围。", statBias: { control: 5, defense: 2 }, recommendedSoulBeastTraits: ["藤蔓", "群体感知"], unlock: always },
      { id: "life-weave", name: "生命织网", role: "辅助", description: "让根系在队友之间传导恢复魂力。", statBias: { maxHp: 4, control: 3 }, recommendedSoulBeastTraits: ["恢复", "共生"], unlock: { kind: "storyFlag", flag: "守护倾向" } },
      { id: "thorn-verdict", name: "荆棘裁决", role: "强攻", description: "压缩藤索魂力，以穿刺和破甲补足输出。", statBias: { attack: 5, control: 2 }, recommendedSoulBeastTraits: ["尖刺", "破甲"], unlock: { kind: "storyFlag", flag: "魂技·裁决藤" } },
    ],
    unlock: always,
    compatibleStoryFlags: ["魂环·千年鬼藤", "魂环·千年月藤", "魂环·千年青藤王", "蓝银囚笼"],
  },
  {
    id: "emerald-vine-blade",
    name: "碧藤刃",
    legacyNames: [],
    attribute: "植物",
    quality: "稀有",
    role: "强攻",
    identity: "刃藤双形态器武魂",
    description: "可在长刃与柔韧藤索之间切换，擅长近中距离连携。",
    starterStats: { maxHp: 4, attack: 5, defense: 1, speed: 3, control: 3 },
    initialSkill: { id: "vine-cleave", name: "藤刃横切", role: "强攻", description: "将藤索瞬间绷直，切开目标的外层防御。", basePower: 24, energyCost: 2, status: "破甲" },
    growthDirections: [
      { id: "blade-storm", name: "叶刃风暴", role: "强攻", description: "提升群体切割与破甲效率。", statBias: { attack: 5, speed: 2 }, recommendedSoulBeastTraits: ["锋利叶片", "破甲"], unlock: always },
      { id: "whip-step", name: "藤索游步", role: "敏攻", description: "借地形牵引移动，快速改变攻击角度。", statBias: { speed: 5, control: 2 }, recommendedSoulBeastTraits: ["攀援", "弹射"], unlock: { kind: "victories", minimum: 3 } },
    ],
    unlock: always,
    compatibleStoryFlags: [],
  },
  {
    id: "clear-tide-pearl",
    name: "澄潮珠",
    legacyNames: [],
    attribute: "水",
    quality: "卓越",
    role: "辅助",
    identity: "水息调律型器武魂",
    description: "可调整小范围水汽与魂力节律，善于消耗战和远海生存。",
    starterStats: { maxHp: 5, attack: 1, defense: 3, speed: 2, control: 5 },
    initialSkill: { id: "tide-screen", name: "潮息幕", role: "防御", description: "在身前形成流动水幕，削弱一次攻击。", basePower: 16, energyCost: 2, status: "护盾" },
    growthDirections: [
      { id: "healing-tide", name: "复苏潮", role: "辅助", description: "用潮息节律稳定队友呼吸与魂力。", statBias: { maxHp: 4, control: 3 }, recommendedSoulBeastTraits: ["治愈", "净化"], unlock: always },
      { id: "undertow-prison", name: "暗流囚笼", role: "控制", description: "叠加旋流限制敌人的移动和发力。", statBias: { control: 5, defense: 2 }, recommendedSoulBeastTraits: ["漩涡", "缠绕"], unlock: { kind: "soulPower", minimum: 20 } },
    ],
    unlock: always,
    compatibleStoryFlags: ["潮汐经验", "海魂兽盟约"],
  },
  {
    id: "crimson-feather-falcon",
    name: "赤羽隼",
    legacyNames: [],
    attribute: "火",
    quality: "卓越",
    role: "敏攻",
    identity: "高速突击型兽武魂",
    description: "以短距离爆发和高空视野见长，需要精准控制魂力温度。",
    starterStats: { maxHp: 2, attack: 5, defense: 1, speed: 6, control: 2 },
    initialSkill: { id: "ember-dive", name: "燃羽俯冲", role: "敏攻", description: "沿目标视野死角快速突进，留下短暂火痕。", basePower: 25, energyCost: 2, status: "灼烧" },
    growthDirections: [
      { id: "sky-hunter", name: "天际猎手", role: "敏攻", description: "强化追击、视野与先手优势。", statBias: { speed: 6, attack: 2 }, recommendedSoulBeastTraits: ["飞行", "视觉"], unlock: always },
      { id: "sunfire-wing", name: "曜火羽阵", role: "强攻", description: "让火羽在一片区域连锁引爆。", statBias: { attack: 6, control: 1 }, recommendedSoulBeastTraits: ["高温", "爆发"], unlock: { kind: "victories", minimum: 5 } },
    ],
    unlock: always,
    compatibleStoryFlags: [],
  },
  {
    id: "black-armor-rhino",
    name: "玄甲犀",
    legacyNames: [],
    attribute: "兽",
    quality: "稀有",
    role: "防御",
    identity: "阵地承伤型兽武魂",
    description: "魂力形成层叠甲片，能在防守中积蓄冲锋势能。",
    starterStats: { maxHp: 8, attack: 3, defense: 6, speed: 0, control: 1 },
    initialSkill: { id: "iron-line", name: "玄甲阵线", role: "防御", description: "强制稳住身形，吸引附近敌人的攻击。", basePower: 15, energyCost: 2, status: "嘲讽" },
    growthDirections: [
      { id: "immovable-wall", name: "不动壁垒", role: "防御", description: "为身后队友承担范围伤害。", statBias: { maxHp: 6, defense: 5 }, recommendedSoulBeastTraits: ["甲壳", "坚韧"], unlock: always },
      { id: "quake-charge", name: "震地冲锋", role: "强攻", description: "释放蓄积的承伤势能，打乱敌方阵型。", statBias: { attack: 4, defense: 3 }, recommendedSoulBeastTraits: ["震地", "蓄力"], unlock: { kind: "victories", minimum: 4 } },
    ],
    unlock: always,
    compatibleStoryFlags: [],
  },
  {
    id: "starlight-compass",
    name: "星辉罗盘",
    legacyNames: [],
    attribute: "无",
    quality: "顶级",
    role: "控制",
    identity: "战场测算型器武魂",
    description: "以魂力轨迹测算下一次交锋，上手较难，但擅长改变战场节奏。",
    starterStats: { maxHp: 3, attack: 1, defense: 2, speed: 4, control: 7 },
    initialSkill: { id: "star-path", name: "星轨标记", role: "控制", description: "标记目标的魂力轨迹，提高队伍下次行动效率。", basePower: 14, energyCost: 2, status: "加速" },
    growthDirections: [
      { id: "battle-calculation", name: "战局演算", role: "控制", description: "提前暴露敌方技能节奏与薄弱点。", statBias: { control: 6, speed: 2 }, recommendedSoulBeastTraits: ["精神感知", "拟态"], unlock: always },
      { id: "guiding-stars", name: "群星引导", role: "辅助", description: "为队友指引安全移动路径。", statBias: { speed: 4, control: 4 }, recommendedSoulBeastTraits: ["星光", "定位"], unlock: { kind: "relationship", characterId: "ning-rongrong", minimum: 45 } },
    ],
    unlock: always,
    compatibleStoryFlags: ["星轨航路", "获得瀚海航图"],
  },
] as const satisfies readonly MartialSoulDefinition[];

export type ReputationTier = {
  id: "hostile" | "distrusted" | "neutral" | "known" | "respected" | "honored" | "legendary";
  name: string;
  minimum: number;
  privileges: readonly string[];
};

export const STANDARD_REPUTATION_TIERS = [
  { id: "hostile", name: "敌对", minimum: -100, privileges: ["势力巡逻可能主动阻拦"] },
  { id: "distrusted", name: "戒备", minimum: -30, privileges: ["只开放基础交易"] },
  { id: "neutral", name: "中立", minimum: 0, privileges: ["可接取普通委托"] },
  { id: "known", name: "闻名", minimum: 20, privileges: ["解锁地区情报与折扣"] },
  { id: "respected", name: "敬重", minimum: 45, privileges: ["解锁核心成员支线"] },
  { id: "honored", name: "贵宾", minimum: 70, privileges: ["可使用势力专属资源"] },
  { id: "legendary", name: "传奇", minimum: 100, privileges: ["可影响势力重大决策"] },
] as const satisfies readonly ReputationTier[];

export type FactionDefinition = {
  id: FactionId;
  name: string;
  category: "帝国" | "魂师组织" | "宗门" | "学院";
  headquarters: WorldLocationId;
  values: readonly string[];
  description: string;
  reputationTiers: readonly ReputationTier[];
  joinCondition: UnlockCondition;
  rivalryIds: readonly FactionId[];
};

export const FACTIONS = [
  { id: "heaven-dou-empire", name: "天斗帝国", category: "帝国", headquarters: "heaven-dou-city", values: ["秩序", "学院", "外交"], description: "广阔的北方帝国，魂师学院和宗门在其境内保持较大自主性。", reputationTiers: STANDARD_REPUTATION_TIERS, joinCondition: { kind: "soulPower", minimum: 15 }, rivalryIds: ["star-luo-empire"] },
  { id: "star-luo-empire", name: "星罗帝国", category: "帝国", headquarters: "star-luo-city", values: ["竞争", "军纪", "实力"], description: "尚武且重视实战的南方帝国，对青年魂师的战场能力要求严格。", reputationTiers: STANDARD_REPUTATION_TIERS, joinCondition: { kind: "victories", minimum: 5 }, rivalryIds: ["heaven-dou-empire"] },
  { id: "spirit-hall", name: "武魂殿", category: "魂师组织", headquarters: "heaven-dou-city", values: ["鉴定", "管理", "扩张"], description: "在多座城市设立分殿的魂师组织，掌握武魂鉴定与大量魂师档案。", reputationTiers: STANDARD_REPUTATION_TIERS, joinCondition: { kind: "soulPower", minimum: 10 }, rivalryIds: ["clear-sky-clan"] },
  { id: "seven-treasure-clan", name: "七宝琉璃宗", category: "宗门", headquarters: "seven-treasure-valley", values: ["信誉", "资源", "协作"], description: "以辅助系武魂与商路网络见长的宗门，重视承诺和长期合作。", reputationTiers: STANDARD_REPUTATION_TIERS, joinCondition: { kind: "relationship", characterId: "ning-rongrong", minimum: 45 }, rivalryIds: [] },
  { id: "blue-lightning-clan", name: "蓝电霸王龙宗", category: "宗门", headquarters: "heaven-dou-city", values: ["血脉", "雷霆", "荣誉"], description: "以雷属性兽武魂闻名的宗门，对战斗天赋与家族责任同样看重。", reputationTiers: STANDARD_REPUTATION_TIERS, joinCondition: { kind: "all", conditions: [{ kind: "soulPower", minimum: 25 }, { kind: "victories", minimum: 8 }] }, rivalryIds: [] },
  { id: "clear-sky-clan", name: "昊天宗", category: "宗门", headquarters: "star-luo-city", values: ["意志", "承担", "传承"], description: "长期隐居的强攻系宗门，对外来者极为审慎，只认可经受住考验的人。", reputationTiers: STANDARD_REPUTATION_TIERS, joinCondition: { kind: "all", conditions: [{ kind: "soulPower", minimum: 40 }, { kind: "storyFlag", flag: "承担倾向" }] }, rivalryIds: ["spirit-hall"] },
  { id: "shrek-academy", name: "史莱克学院", category: "学院", headquarters: "shrek-academy", values: ["潜力", "实战", "伙伴"], description: "以高门槛和实战训练著称的小型学院，比等级更看重应变和团队意识。", reputationTiers: STANDARD_REPUTATION_TIERS, joinCondition: { kind: "any", conditions: [{ kind: "storyFlag", flag: "史莱克认可" }, { kind: "victories", minimum: 2 }] }, rivalryIds: [] },
] as const satisfies readonly FactionDefinition[];

export type InteractiveCharacterDefinition = {
  id: ExtendedCharacterId;
  name: string;
  title: string;
  affiliation: FactionId | "independent";
  martialSoul: string;
  role: CombatRole;
  locations: readonly WorldLocationId[];
  personality: readonly string[];
  boundaries: readonly string[];
  conversationHooks: readonly string[];
  relationshipTiers: ReadonlyArray<{ minimum: number; label: string; unlock: string }>;
  unlock: UnlockCondition;
};

const STANDARD_RELATIONSHIP_TIERS = [
  { minimum: 0, label: "陌生", unlock: "基础对话" },
  { minimum: 25, label: "熟悉", unlock: "个人话题" },
  { minimum: 45, label: "信任", unlock: "专属支线" },
  { minimum: 70, label: "挚友", unlock: "共同决策与结局支援" },
] as const;

export const EXTENDED_CHARACTERS = [
  { id: "zhu-zhuqing", name: "朱竹清", title: "幽冥敏攻魂师", affiliation: "shrek-academy", martialSoul: "幽冥灵猫", role: "敏攻", locations: ["shrek-academy", "star-luo-city"], personality: ["克制", "专注", "重视行动"], boundaries: ["不接受轻佻追问家族隐私", "不用玩笑消解真正的危险"], conversationHooks: ["夜间追踪", "敏攻步法", "星罗旅程"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "visitedLocation", locationId: "shrek-academy" } },
  { id: "ma-hongjun", name: "马红俊", title: "凤凰火焰魂师", affiliation: "shrek-academy", martialSoul: "邪火凤凰", role: "强攻", locations: ["shrek-academy", "soto-city"], personality: ["热情", "爽快", "对力量有焦虑"], boundaries: ["不把武魂缺陷当作笑料", "危急时刻优先保护同伴"], conversationHooks: ["火焰控制", "美食", "魂技合击"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "visitedLocation", locationId: "shrek-academy" } },
  { id: "yu-xiaogang", name: "玉小刚", title: "武魂理论研究者", affiliation: "shrek-academy", martialSoul: "罗三炮", role: "控制", locations: ["notting-city", "shrek-academy"], personality: ["理性", "严谨", "重视证据"], boundaries: ["不会为讨好而修改研究结论", "不鼓励越级吸收危险魂环"], conversationHooks: ["武魂分析", "魂环选择", "实验线索"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: always },
  { id: "flender", name: "弗兰德", title: "史莱克院长", affiliation: "shrek-academy", martialSoul: "四眼猫鹰", role: "敏攻", locations: ["shrek-academy", "soto-city"], personality: ["务实", "爱惜学员", "擅长试探潜力"], boundaries: ["不免费浪费稀缺物资", "不容忍有人故意伤害学员"], conversationHooks: ["学院经费", "飞行训练", "团队考核"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "reputation", factionId: "shrek-academy", minimum: 20 } },
  { id: "du-gu-yan", name: "独孤雁", title: "碧磷控制魂师", affiliation: "heaven-dou-empire", martialSoul: "碧磷蛇", role: "控制", locations: ["heaven-dou-city", "sunset-forest", "heaven-dou-arena"], personality: ["骄傲", "果断", "保护队友"], boundaries: ["不轻易分享用毒细节", "不接受对队伍的轻视"], conversationHooks: ["毒素克制", "落日森林", "竞技战术"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "visitedLocation", locationId: "heaven-dou-arena" } },
  { id: "ye-lingling", name: "叶泠泠", title: "九心治愈魂师", affiliation: "heaven-dou-empire", martialSoul: "九心海棠", role: "辅助", locations: ["heaven-dou-city", "heaven-dou-arena"], personality: ["安静", "敏锐", "对伤痛有同理心"], boundaries: ["不把治愈当作无代价的奇迹", "不泄露伤者私密"], conversationHooks: ["战后恢复", "药草", "辅助魂师的压力"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "storyFlag", flag: "精英赛连胜" } },
  { id: "shui-binger", name: "水冰儿", title: "冰凤控场魂师", affiliation: "heaven-dou-empire", martialSoul: "凝水飞鸾", role: "控制", locations: ["heaven-dou-arena", "heaven-dou-city"], personality: ["沉着", "有责任感", "善于分析"], boundaries: ["不轻视任何对手", "不用队友安全换表面胜利"], conversationHooks: ["温度控制", "赛场复盘", "队长责任"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "visitedLocation", locationId: "heaven-dou-arena" } },
  { id: "huo-wu", name: "火舞", title: "火影强攻魂师", affiliation: "heaven-dou-empire", martialSoul: "火影", role: "强攻", locations: ["heaven-dou-arena", "heaven-dou-city"], personality: ["好胜", "直接", "尊重真正的实力"], boundaries: ["不接受敷衍式让赛", "不会因一次败负放弃追赶"], conversationHooks: ["融环思路", "正面对决", "火系修炼"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "victories", minimum: 5 } },
  { id: "lan-xing", name: "澜星", title: "远海领航员", affiliation: "independent", martialSoul: "潮音海豚", role: "辅助", locations: ["west-sea-port", "vast-sea-route", "sea-god-island"], personality: ["冷静", "守信", "对海况高度敏感"], boundaries: ["不在风暴预警时冒险逞强", "不为利益出卖同船者"], conversationHooks: ["潮汐记录", "海魂兽习性", "失落航线"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "any", conditions: [{ kind: "storyFlag", flag: "远海领航员" }, { kind: "visitedLocation", locationId: "west-sea-port" }] } },
  { id: "lin-lan", name: "林岚", title: "森林巡护魂师", affiliation: "independent", martialSoul: "青叶猫头鹰", role: "敏攻", locations: ["star-forest", "sunset-forest"], personality: ["谨慎", "熟悉魂兽", "厌恶滥捕"], boundaries: ["不提供稀有魂兽巢穴坐标", "不支持无目标猎杀"], conversationHooks: ["踪迹辨识", "魂兽救助", "森林异常"], relationshipTiers: STANDARD_RELATIONSHIP_TIERS, unlock: { kind: "visitedLocation", locationId: "star-forest" } },
] as const satisfies readonly InteractiveCharacterDefinition[];

export type LocationDefinition = {
  id: WorldLocationId;
  name: string;
  region: string;
  category: "城市" | "学院" | "森林" | "竞技场" | "宗门" | "港口" | "航路" | "岛屿";
  risk: 1 | 2 | 3 | 4 | 5;
  recommendedSoulPower: readonly [number, number];
  description: string;
  factionIds: readonly FactionId[];
  unlock: UnlockCondition;
  storyNodeHint?: string;
};

export const WORLD_LOCATIONS = [
  { id: "notting-city", name: "诺丁城", region: "法斯诺行省", category: "城市", risk: 1, recommendedSoulPower: [1, 15], description: "适合新生魂师成长的小城，学院、工坊和商路支线集中。", factionIds: ["spirit-hall"], unlock: always, storyNodeHint: "notting_street" },
  { id: "shrek-academy", name: "史莱克学院", region: "索托城外", category: "学院", risk: 2, recommendedSoulPower: [10, 35], description: "以高压实战和团队配合为主的特殊学院。", factionIds: ["shrek-academy"], unlock: always, storyNodeHint: "shrek_trial" },
  { id: "soto-city", name: "索托城", region: "巴拉克王国", category: "城市", risk: 2, recommendedSoulPower: [10, 40], description: "商贩、魂师和游客汇集的区域中心，夜间交易活跃。", factionIds: ["heaven-dou-empire", "spirit-hall"], unlock: { kind: "visitedLocation", locationId: "shrek-academy" }, storyNodeHint: "arena_final" },
  { id: "star-forest", name: "星斗大森林", region: "大陆中南部", category: "森林", risk: 4, recommendedSoulPower: [10, 80], description: "魂兽群落复杂的广阔森林，深度决定风险，非必要不应离开成熟路线。", factionIds: [], unlock: always, storyNodeHint: "forest_crossroads" },
  { id: "heaven-dou-city", name: "天斗城", region: "天斗帝国腹地", category: "城市", risk: 2, recommendedSoulPower: [20, 60], description: "帝国中枢，学院、商会和多个势力的联络点在此交错。", factionIds: ["heaven-dou-empire", "spirit-hall", "seven-treasure-clan", "blue-lightning-clan"], unlock: { kind: "any", conditions: [{ kind: "storyFlag", flag: "第二卷·天斗来函" }, { kind: "soulPower", minimum: 20 }] }, storyNodeHint: "heaven_dou_letter" },
  { id: "sunset-forest", name: "落日森林", region: "天斗城外", category: "森林", risk: 4, recommendedSoulPower: [20, 70], description: "植被、毒障与稀有魂兽并存的猎魂区，近期受异常魂晶干扰。", factionIds: ["heaven-dou-empire"], unlock: { kind: "any", conditions: [{ kind: "storyFlag", flag: "落日根系坐标" }, { kind: "storyFlag", flag: "皇家通行证" }] }, storyNodeHint: "sunset_hunt" },
  { id: "heaven-dou-arena", name: "天斗大斗魂场", region: "天斗城", category: "竞技场", risk: 3, recommendedSoulPower: [20, 65], description: "大型魂师赛事场地，胜负、情报和各势力观察同时发生。", factionIds: ["heaven-dou-empire", "spirit-hall"], unlock: { kind: "visitedLocation", locationId: "heaven-dou-city" }, storyNodeHint: "tournament_qualifier" },
  { id: "seven-treasure-valley", name: "七宝山谷", region: "天斗城郊", category: "宗门", risk: 2, recommendedSoulPower: [20, 70], description: "七宝琉璃宗核心地带，拥有严格身份验证与完善的物资网络。", factionIds: ["seven-treasure-clan"], unlock: { kind: "any", conditions: [{ kind: "storyFlag", flag: "七宝担保" }, { kind: "reputation", factionId: "seven-treasure-clan", minimum: 20 }] } },
  { id: "star-luo-city", name: "星罗城", region: "星罗帝国中心", category: "城市", risk: 3, recommendedSoulPower: [30, 80], description: "戒备严密的尚武都城，公开演武与秘密竞争都很常见。", factionIds: ["star-luo-empire", "clear-sky-clan"], unlock: { kind: "all", conditions: [{ kind: "soulPower", minimum: 30 }, { kind: "relationship", characterId: "dai-mubai", minimum: 35 }] } },
  { id: "west-sea-port", name: "西海港", region: "天斗西境", category: "港口", risk: 3, recommendedSoulPower: [30, 80], description: "远海船队的补给与信息集散地，潮汐和海魂兽情报价值极高。", factionIds: ["heaven-dou-empire"], unlock: { kind: "storyFlag", flag: "获得瀚海航图" }, storyNodeHint: "vast_sea_map" },
  { id: "vast-sea-route", name: "瀚海航路", region: "西海深处", category: "航路", risk: 5, recommendedSoulPower: [40, 95], description: "穿过风暴、洋流和高年限海魂兽活动区的远海航线。", factionIds: [], unlock: { kind: "all", conditions: [{ kind: "storyFlag", flag: "获得瀚海航图" }, { kind: "visitedLocation", locationId: "west-sea-port" }] }, storyNodeHint: "sea_route" },
  { id: "sea-god-island", name: "海神岛", region: "西海尽头", category: "岛屿", risk: 5, recommendedSoulPower: [50, 100], description: "被潮汐试炼与强大海魂兽环绕的远海岛屿。", factionIds: [], unlock: { kind: "all", conditions: [{ kind: "storyFlag", flag: "获得瀚海航图" }, { kind: "any", conditions: [{ kind: "storyFlag", flag: "完整船队" }, { kind: "storyFlag", flag: "撕裂风暴" }] }] }, storyNodeHint: "sea_god_shore" },
] as const satisfies readonly LocationDefinition[];

export type SoulBeastDefinition = {
  id: string;
  name: string;
  habitatIds: readonly WorldLocationId[];
  attribute: SoulAttribute;
  ageRange: readonly [number, number];
  danger: 1 | 2 | 3 | 4 | 5;
  temperament: "温和" | "警惕" | "领地性" | "主动攻击";
  traits: readonly string[];
  suitableSoulIds: readonly MartialSoulId[];
  drops: readonly string[];
  encounterWeight: number;
  unlock: UnlockCondition;
};

export const SOUL_BEASTS = [
  { id: "dew-leaf-deer", name: "露叶鹿", habitatIds: ["star-forest"], attribute: "植物", ageRange: [80, 450], danger: 1, temperament: "温和", traits: ["恢复", "感知"], suitableSoulIds: ["blue-silver-grass", "clear-tide-pearl"], drops: ["露叶粉"], encounterWeight: 14, unlock: always },
  { id: "iron-bark-boar", name: "铁皮林猪", habitatIds: ["star-forest", "sunset-forest"], attribute: "兽", ageRange: [120, 900], danger: 2, temperament: "领地性", traits: ["坚韧", "冲锋"], suitableSoulIds: ["black-armor-rhino"], drops: ["铁皮碎片"], encounterWeight: 12, unlock: always },
  { id: "wind-tail-marten", name: "风尾貂", habitatIds: ["star-forest"], attribute: "兽", ageRange: [200, 1200], danger: 2, temperament: "警惕", traits: ["高速", "变向"], suitableSoulIds: ["crimson-feather-falcon", "emerald-vine-blade"], drops: ["风尾毫"], encounterWeight: 10, unlock: { kind: "soulPower", minimum: 12 } },
  { id: "echo-owl", name: "回声枭", habitatIds: ["star-forest", "sunset-forest"], attribute: "无", ageRange: [300, 1800], danger: 3, temperament: "警惕", traits: ["精神感知", "定位"], suitableSoulIds: ["starlight-compass"], drops: ["回声羽"], encounterWeight: 8, unlock: { kind: "soulPower", minimum: 18 } },
  { id: "ghost-vine", name: "千年鬼藤", habitatIds: ["sunset-forest"], attribute: "植物", ageRange: [1000, 1800], danger: 4, temperament: "主动攻击", traits: ["藤蔓", "破甲", "缠绕"], suitableSoulIds: ["blue-silver-grass", "emerald-vine-blade"], drops: ["千年鬼藤精髓"], encounterWeight: 7, unlock: { kind: "visitedLocation", locationId: "sunset-forest" } },
  { id: "moon-vine", name: "千年月藤", habitatIds: ["sunset-forest"], attribute: "植物", ageRange: [1000, 1600], danger: 3, temperament: "温和", traits: ["恢复", "共生", "缠绕"], suitableSoulIds: ["blue-silver-grass", "clear-tide-pearl"], drops: ["月纹藤芯"], encounterWeight: 5, unlock: { kind: "storyFlag", flag: "守护倾向" } },
  { id: "jade-vine-king", name: "千年青藤王", habitatIds: ["sunset-forest"], attribute: "植物", ageRange: [1300, 2200], danger: 4, temperament: "领地性", traits: ["藤蔓", "群体感知", "净化"], suitableSoulIds: ["blue-silver-grass", "emerald-vine-blade"], drops: ["青藤王结晶"], encounterWeight: 4, unlock: { kind: "storyFlag", flag: "远海黑市线索" } },
  { id: "ember-crest-lizard", name: "炎冠蜥", habitatIds: ["sunset-forest"], attribute: "火", ageRange: [700, 2400], danger: 4, temperament: "主动攻击", traits: ["高温", "爆发"], suitableSoulIds: ["crimson-feather-falcon"], drops: ["炎冠晶片"], encounterWeight: 7, unlock: { kind: "soulPower", minimum: 25 } },
  { id: "stone-shell-tortoise", name: "岩甲龟", habitatIds: ["sunset-forest"], attribute: "兽", ageRange: [600, 3000], danger: 3, temperament: "温和", traits: ["甲壳", "蓄力", "坚韧"], suitableSoulIds: ["black-armor-rhino"], drops: ["岩甲龟片"], encounterWeight: 8, unlock: { kind: "soulPower", minimum: 20 } },
  { id: "mist-fin-ray", name: "雾鳍魟", habitatIds: ["vast-sea-route"], attribute: "水", ageRange: [900, 3200], danger: 3, temperament: "警惕", traits: ["水幕", "滑翔", "定位"], suitableSoulIds: ["clear-tide-pearl", "starlight-compass"], drops: ["雾鳍鳞"], encounterWeight: 9, unlock: { kind: "visitedLocation", locationId: "west-sea-port" } },
  { id: "chain-current-eel", name: "链流电鳗", habitatIds: ["vast-sea-route"], attribute: "水", ageRange: [1500, 5000], danger: 4, temperament: "主动攻击", traits: ["麻痹", "漩涡", "群体行动"], suitableSoulIds: ["clear-tide-pearl", "starlight-compass"], drops: ["蓄电鳗骨"], encounterWeight: 6, unlock: { kind: "visitedLocation", locationId: "vast-sea-route" } },
  { id: "storm-wing-albatross", name: "风暴翼信天翁", habitatIds: ["vast-sea-route", "sea-god-island"], attribute: "兽", ageRange: [2200, 8000], danger: 4, temperament: "领地性", traits: ["飞行", "视觉", "风压"], suitableSoulIds: ["crimson-feather-falcon"], drops: ["风暴羽"], encounterWeight: 5, unlock: { kind: "storyFlag", flag: "潮汐经验" } },
  { id: "tide-song-whale", name: "潮歌鲸", habitatIds: ["sea-god-island"], attribute: "水", ageRange: [6000, 18000], danger: 5, temperament: "温和", traits: ["治愈", "潮汐共鸣", "精神感知"], suitableSoulIds: ["clear-tide-pearl", "starlight-compass"], drops: ["潮歌回音石"], encounterWeight: 2, unlock: { kind: "storyFlag", flag: "海魂兽盟约" } },
  { id: "abyss-claw-crab", name: "深渊钳蟹", habitatIds: ["sea-god-island"], attribute: "水", ageRange: [4500, 12000], danger: 5, temperament: "主动攻击", traits: ["甲壳", "破甲", "漩涡"], suitableSoulIds: ["black-armor-rhino", "emerald-vine-blade"], drops: ["深渊钳片"], encounterWeight: 3, unlock: { kind: "visitedLocation", locationId: "sea-god-island" } },
] as const satisfies readonly SoulBeastDefinition[];

export type RandomEventChoice = {
  id: string;
  label: string;
  outcome: string;
  unlock: UnlockCondition;
  rewards: ContentReward;
};

export type RandomSideEventDefinition = {
  id: string;
  title: string;
  category: "探索" | "人物" | "势力" | "交易" | "魂兽" | "战斗";
  summary: string;
  locationIds: readonly WorldLocationId[];
  weight: number;
  repeatable: boolean;
  unlock: UnlockCondition;
  choices: readonly RandomEventChoice[];
};

export const RANDOM_SIDE_EVENTS = [
  { id: "lost-work-study-ledger", title: "遗失的工读生账本", category: "探索", summary: "一本记录了学院药草去向的账本掉在雨水里。", locationIds: ["notting-city"], weight: 12, repeatable: false, unlock: always, choices: [
    { id: "return-ledger", label: "交还工读生管事", outcome: "账本回到了真正使用它的人手里。", unlock: always, rewards: { experience: 40, relationships: { "xiao-wu": 2 }, storyFlags: ["工读生账本归还"] } },
    { id: "copy-ledger", label: "先抄下异常条目", outcome: "你发现多笔药草被送往旧井。", unlock: always, rewards: { experience: 55, storyFlags: ["药草流向证据"] } },
  ] },
  { id: "forge-sparks", title: "铁匠铺的异常火花", category: "交易", summary: "一批魂导金属在锻打时产生不稳定魂力。", locationIds: ["notting-city", "soto-city"], weight: 9, repeatable: true, unlock: { kind: "coins", minimum: 2 }, choices: [
    { id: "stabilize-metal", label: "协助稳定魂力", outcome: "金属恢复平静，铁匠为你保留了一块试作品。", unlock: always, rewards: { experience: 45, itemIds: ["tempered-metal"] } },
    { id: "buy-scrap", label: "买下异常边角料", outcome: "边角料在接近魂晶时会轻微共鸣。", unlock: { kind: "coins", minimum: 5 }, rewards: { coins: -5, itemIds: ["resonant-scrap"], storyFlags: ["金属共鸣线索"] } },
  ] },
  { id: "night-rooftop-race", title: "屋顶夜跑", category: "人物", summary: "朱竹清邀请你用一场无声追逐检验步法。", locationIds: ["shrek-academy", "soto-city"], weight: 7, repeatable: true, unlock: { kind: "relationship", characterId: "zhu-zhuqing", minimum: 25 }, choices: [
    { id: "match-pace", label: "保持节奏完成全程", outcome: "你没有抢先，却始终没有掉队。", unlock: always, rewards: { experience: 70, relationships: { "zhu-zhuqing": 3 }, storyFlags: ["夜行步法"] } },
    { id: "find-shortcut", label: "利用藤索穿越窄巷", outcome: "你用自己的方式提前到达，赢得了一次认真点头。", unlock: { kind: "martialSoul", soulId: "blue-silver-grass" }, rewards: { experience: 85, relationships: { "zhu-zhuqing": 2 } } },
  ] },
  { id: "academy-supply-gap", title: "学院补给缺口", category: "势力", summary: "训练物资即将耗尽，学院需要在两条不同渠道中做决定。", locationIds: ["shrek-academy", "soto-city"], weight: 8, repeatable: false, unlock: { kind: "reputation", factionId: "shrek-academy", minimum: 20 }, choices: [
    { id: "negotiate-supplies", label: "去索托城谈长期价格", outcome: "你用稳定订单换得了较低单价。", unlock: always, rewards: { coins: 6, reputation: { "shrek-academy": 8 }, relationships: { oscar: 2 } } },
    { id: "escort-supplies", label: "亲自押送高风险货车", outcome: "货车安全抵达，学院获得更多紧缺药品。", unlock: { kind: "soulPower", minimum: 18 }, rewards: { experience: 100, reputation: { "shrek-academy": 10 }, itemIds: ["academy-supply-token"] } },
  ] },
  { id: "wounded-dew-deer", title: "受伤的露叶鹿", category: "魂兽", summary: "一只年幼露叶鹿被旧式猎具卡住，附近还有猎人脚印。", locationIds: ["star-forest"], weight: 11, repeatable: false, unlock: always, choices: [
    { id: "free-deer", label: "拆除猎具并处理伤口", outcome: "露叶鹿恢复站立，在离开前轻轻触碰你的武魂。", unlock: always, rewards: { experience: 65, relationships: { "xiao-wu": 3, "lin-lan": 2 }, storyFlags: ["森林善意"] } },
    { id: "track-hunter", label: "留下记号追查猎人", outcome: "你找到了一处未登记的捕猎营地。", unlock: { kind: "relationship", characterId: "lin-lan", minimum: 25 }, rewards: { experience: 80, storyFlags: ["滥捕营地坐标"], reputation: { "spirit-hall": 3 } } },
  ] },
  { id: "poison-fog-patrol", title: "毒雾边界巡查", category: "探索", summary: "落日森林的毒雾边界向商路移动，原因尚未确定。", locationIds: ["sunset-forest"], weight: 8, repeatable: true, unlock: { kind: "visitedLocation", locationId: "sunset-forest" }, choices: [
    { id: "collect-samples", label: "采样并标记安全路线", outcome: "样本显示毒雾中混入了人工魂晶尘。", unlock: always, rewards: { experience: 90, relationships: { "du-gu-yan": 2 }, storyFlags: ["毒雾魂晶样本"] } },
    { id: "disperse-fog", label: "引导气流暂时驱散毒雾", outcome: "商队获得了数日安全通行时间。", unlock: { kind: "martialSoul", soulId: "crimson-feather-falcon" }, rewards: { experience: 110, reputation: { "heaven-dou-empire": 6 }, coins: 5 } },
  ] },
  { id: "arena-injury", title: "赛后医务室", category: "人物", summary: "一名年轻魂师隐瞒旧伤上场，赛后魂力突然失衡。", locationIds: ["heaven-dou-arena"], weight: 8, repeatable: true, unlock: { kind: "storyFlag", flag: "精英赛连胜" }, choices: [
    { id: "assist-healing", label: "协助叶泠泠稳定魂力", outcome: "你守住魂力节点，让治愈过程顺利完成。", unlock: always, rewards: { experience: 75, relationships: { "ye-lingling": 3 }, reputation: { "heaven-dou-empire": 3 } } },
    { id: "investigate-equipment", label: "检查对方的护具", outcome: "护具夹层残留着与深海魂晶相近的粉末。", unlock: { kind: "storyFlag", flag: "远海黑市线索" }, rewards: { experience: 95, storyFlags: ["赛事魂晶证物"] } },
  ] },
  { id: "seven-treasure-appraisal", title: "琉璃宝库鉴定", category: "势力", summary: "一批来路复杂的魂兽材料需要鉴别真伪与来源。", locationIds: ["seven-treasure-valley"], weight: 6, repeatable: true, unlock: { kind: "reputation", factionId: "seven-treasure-clan", minimum: 20 }, choices: [
    { id: "trace-materials", label: "沿商路记录追溯", outcome: "你找出了其中两件非法捕猎材料。", unlock: always, rewards: { experience: 85, reputation: { "seven-treasure-clan": 7 }, storyFlags: ["宝库追溯记录"] } },
    { id: "assess-resonance", label: "以武魂测试材料共鸣", outcome: "一枚普通石珠里藏着被封存的航海坐标。", unlock: { kind: "martialSoul", soulId: "starlight-compass" }, rewards: { experience: 100, itemIds: ["sealed-sea-coordinate"], relationships: { "ning-rongrong": 2 } } },
  ] },
  { id: "star-luo-duel-letter", title: "星罗挑战书", category: "战斗", summary: "一名军院魂师以正式挑战书邀请你参加限制魂力的对决。", locationIds: ["star-luo-city"], weight: 6, repeatable: true, unlock: { kind: "visitedLocation", locationId: "star-luo-city" }, choices: [
    { id: "accept-limited-duel", label: "接受同级对决", outcome: "你在严格规则下完成了一场干净的比试。", unlock: always, rewards: { experience: 120, reputation: { "star-luo-empire": 8 }, relationships: { "zhu-zhuqing": 2 } } },
    { id: "request-team-duel", label: "改为小队战", outcome: "挑战变成对队伍默契的公开检验。", unlock: { kind: "relationship", characterId: "dai-mubai", minimum: 45 }, rewards: { experience: 135, reputation: { "star-luo-empire": 6, "shrek-academy": 4 }, storyFlags: ["星罗小队战认可"] } },
  ] },
  { id: "port-missing-crates", title: "港区失踪的补给箱", category: "交易", summary: "出航前夜，三箱净水魂导器从封闭仓库里消失。", locationIds: ["west-sea-port"], weight: 10, repeatable: false, unlock: { kind: "visitedLocation", locationId: "west-sea-port" }, choices: [
    { id: "follow-tide-marks", label: "追查地面潮水印记", outcome: "印记通往一艘伪装成渔船的走私船。", unlock: always, rewards: { experience: 95, relationships: { "lan-xing": 3 }, storyFlags: ["港区走私船"] } },
    { id: "replace-supplies", label: "先购买替代品确保出航", outcome: "船队没有误点，但你付出了一笔额外成本。", unlock: { kind: "coins", minimum: 10 }, rewards: { coins: -10, storyFlags: ["应急净水储备"], reputation: { "heaven-dou-empire": 4 } } },
  ] },
  { id: "ray-in-fishing-net", title: "误入渔网的雾鳍魟", category: "魂兽", summary: "一只雾鳍魟缠在旧网中，浓雾正让附近船只偏离航道。", locationIds: ["vast-sea-route"], weight: 9, repeatable: true, unlock: { kind: "visitedLocation", locationId: "vast-sea-route" }, choices: [
    { id: "cut-net", label: "切断旧网释放魂兽", outcome: "雾鳍魟散去浓雾，并在船首前留下一段安全水纹。", unlock: always, rewards: { experience: 100, relationships: { "lan-xing": 2 }, storyFlags: ["雾中安全水纹"] } },
    { id: "tow-net", label: "拖走整张旧网清理航道", outcome: "你们同时救下魂兽并清除了漂浮危险。", unlock: { kind: "soulPower", minimum: 45 }, rewards: { experience: 130, reputation: { "heaven-dou-empire": 5 }, itemIds: ["mist-fin-scale"] } },
  ] },
  { id: "tide-stone-echo", title: "潮石中的旧回声", category: "探索", summary: "岛上一块潮石重现了某支失踪船队的魂力节律。", locationIds: ["sea-god-island"], weight: 5, repeatable: false, unlock: { kind: "storyFlag", flag: "海神岛认可" }, choices: [
    { id: "record-echo", label: "完整记录魂力节律", outcome: "记录中隐藏着一条避开深海领地的返航线。", unlock: always, rewards: { experience: 140, itemIds: ["tide-echo-record"], storyFlags: ["安全返航线"] } },
    { id: "answer-echo", label: "以自身魂力回应", outcome: "潮石把你的回应送向远海，一头潮歌鲸在雾外回应。", unlock: { kind: "storyFlag", flag: "海魂兽盟约" }, rewards: { experience: 160, relationships: { "lan-xing": 3 }, storyFlags: ["潮歌鲸回应"] } },
  ] },
  { id: "two-faction-couriers", title: "交错的两封密函", category: "势力", summary: "天斗与星罗的两名信使在驿站发生冲突，两封信却有相同的封缄印记。", locationIds: ["heaven-dou-city", "star-luo-city"], weight: 5, repeatable: false, unlock: { kind: "all", conditions: [{ kind: "reputation", factionId: "heaven-dou-empire", minimum: 20 }, { kind: "reputation", factionId: "star-luo-empire", minimum: 20 }] }, choices: [
    { id: "mediate-couriers", label: "先分开信使再核对印记", outcome: "你证明两封信都被第三方替换过封缄。", unlock: always, rewards: { experience: 120, reputation: { "heaven-dou-empire": 5, "star-luo-empire": 5 }, storyFlags: ["双国伪印证据"] } },
    { id: "shadow-courier", label: "跟踪前来回收假信的人", outcome: "你找到了一个同时向两国出售情报的中间人。", unlock: { kind: "relationship", characterId: "zhu-zhuqing", minimum: 45 }, rewards: { experience: 145, coins: 8, storyFlags: ["双面情报人"] } },
  ] },
] as const satisfies readonly RandomSideEventDefinition[];

export const DEFAULT_WORLD_PROGRESS: WorldProgress = {
  soulPower: 1,
  coins: 0,
  victories: 0,
  martialSoulId: "blue-silver-grass",
  storyFlags: [],
  completedEventIds: [],
  visitedLocationIds: ["notting-city"],
  reputation: {},
  relationships: {},
};

export function evaluateUnlockCondition(condition: UnlockCondition, progress: WorldProgress): boolean {
  switch (condition.kind) {
    case "always": return true;
    case "soulPower": return progress.soulPower >= condition.minimum;
    case "coins": return progress.coins >= condition.minimum;
    case "victories": return progress.victories >= condition.minimum;
    case "storyFlag": return progress.storyFlags.includes(condition.flag);
    case "completedEvent": return progress.completedEventIds.includes(condition.eventId);
    case "visitedLocation": return progress.visitedLocationIds.includes(condition.locationId);
    case "martialSoul": return progress.martialSoulId === condition.soulId;
    case "reputation": return (progress.reputation[condition.factionId] ?? 0) >= condition.minimum;
    case "relationship": return (progress.relationships[condition.characterId] ?? 0) >= condition.minimum;
    case "all": return condition.conditions.every((item) => evaluateUnlockCondition(item, progress));
    case "any": return condition.conditions.some((item) => evaluateUnlockCondition(item, progress));
    case "not": return !evaluateUnlockCondition(condition.condition, progress);
  }
}

export function createWorldProgress(overrides: Partial<WorldProgress> = {}): WorldProgress {
  return {
    ...DEFAULT_WORLD_PROGRESS,
    ...overrides,
    storyFlags: overrides.storyFlags ?? DEFAULT_WORLD_PROGRESS.storyFlags,
    completedEventIds: overrides.completedEventIds ?? DEFAULT_WORLD_PROGRESS.completedEventIds,
    visitedLocationIds: overrides.visitedLocationIds ?? DEFAULT_WORLD_PROGRESS.visitedLocationIds,
    reputation: overrides.reputation ?? DEFAULT_WORLD_PROGRESS.reputation,
    relationships: overrides.relationships ?? DEFAULT_WORLD_PROGRESS.relationships,
  };
}

export function getMartialSoul(id: MartialSoulId) {
  return MARTIAL_SOULS.find((item) => item.id === id) ?? null;
}

export function findMartialSoulByLegacyName(name: string) {
  return MARTIAL_SOULS.find(
    (item) => item.name === name || (item.legacyNames as readonly string[]).includes(name),
  ) ?? null;
}

export function getAvailableMartialSouls(progress: WorldProgress) {
  return MARTIAL_SOULS.filter((item) => evaluateUnlockCondition(item.unlock, progress));
}

export function getFaction(id: FactionId) {
  return FACTIONS.find((item) => item.id === id) ?? null;
}

export function getReputationTier(factionId: FactionId, score: number): ReputationTier {
  const faction = getFaction(factionId);
  const tiers = faction?.reputationTiers ?? STANDARD_REPUTATION_TIERS;
  return [...tiers].reverse().find((tier) => score >= tier.minimum) ?? tiers[0];
}

export function getExtendedCharacter(id: ExtendedCharacterId) {
  return EXTENDED_CHARACTERS.find((item) => item.id === id) ?? null;
}

export function getUnlockedExtendedCharacters(progress: WorldProgress) {
  return EXTENDED_CHARACTERS.filter((item) => evaluateUnlockCondition(item.unlock, progress));
}

export function getWorldLocation(id: WorldLocationId) {
  return WORLD_LOCATIONS.find((item) => item.id === id) ?? null;
}

export function getUnlockedLocations(progress: WorldProgress) {
  return WORLD_LOCATIONS.filter((item) => evaluateUnlockCondition(item.unlock, progress));
}

export function getEncounterableSoulBeasts(locationId: WorldLocationId, progress: WorldProgress) {
  return SOUL_BEASTS.filter(
    (item) => (item.habitatIds as readonly WorldLocationId[]).includes(locationId)
      && evaluateUnlockCondition(item.unlock, progress),
  );
}

export function getEligibleRandomEvents(locationId: WorldLocationId, progress: WorldProgress) {
  return RANDOM_SIDE_EVENTS.filter((event) =>
    (event.locationIds as readonly WorldLocationId[]).includes(locationId)
    && (event.repeatable || !progress.completedEventIds.includes(event.id))
    && evaluateUnlockCondition(event.unlock, progress));
}

export function getAvailableEventChoices(event: RandomSideEventDefinition, progress: WorldProgress) {
  return event.choices.filter((choice) => evaluateUnlockCondition(choice.unlock, progress));
}
