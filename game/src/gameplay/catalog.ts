import type { CombatActionDefinition, ItemDefinition } from "./types";

export const LEGACY_ITEMS: Record<string, ItemDefinition> = {
  academy_letter: {
    id: "academy_letter", name: "学院推荐信", category: "关键物品",
    description: "老杰克交给你的入学凭证，无法出售或使用。", buyPrice: null, sellPrice: null,
  },
  old_purse: {
    id: "old_purse", name: "旧布钱袋", category: "普通物品",
    description: "针脚已经磨白的小钱袋，还能换回少量金魂币。", buyPrice: null, sellPrice: 2,
  },
  healing_herb: {
    id: "healing_herb", name: "止血草", category: "消耗品",
    description: "常见的疗伤草药，使用后恢复 36 点生命。", buyPrice: 8, sellPrice: 4,
    effect: { kind: "heal", amount: 36 }, maxStack: 99,
  },
  blank_notebook: {
    id: "blank_notebook", name: "空白笔记册", category: "普通物品",
    description: "适合记录魂兽踪迹和修炼心得。", buyPrice: 5, sellPrice: 2, maxStack: 99,
  },
  focus_incense: {
    id: "focus_incense", name: "凝神香", category: "消耗品",
    description: "点燃后帮助魂师入定，获得 160 点魂力经验。", buyPrice: 12, sellPrice: 6,
    effect: { kind: "experience", amount: 160 }, maxStack: 99,
  },
  apprentice_guard: {
    id: "apprentice_guard", name: "学徒护腕", category: "装备",
    description: "铁匠学徒常用的皮护腕，装备后提升防御与控制。", buyPrice: 26, sellPrice: 13,
    slot: "饰品", bonus: { defense: 3, control: 2 },
  },
  cloth_armor: {
    id: "cloth_armor", name: "轻韧布甲", category: "装备",
    description: "夹入细铁丝的轻便布甲，适合初阶魂师。", buyPrice: 42, sellPrice: 21,
    slot: "护具", bonus: { maxHp: 22, defense: 4 },
  },
  millennium_essence: {
    id: "millennium_essence", name: "千年魂力精华", category: "消耗品",
    description: "吸收第二魂环后凝结的纯净精华，使用后获得 500 点魂力经验。", buyPrice: null, sellPrice: 25,
    effect: { kind: "experience", amount: 500 }, maxStack: 99,
  },
  sea_crystal: {
    id: "sea_crystal", name: "深海魂晶", category: "关键物品",
    description: "来自远海的蓝色晶体，与人造魂核及瀚海罗盘存在共鸣。", buyPrice: null, sellPrice: null,
  },
  tournament_badge: {
    id: "tournament_badge", name: "精英赛资格徽章", category: "关键物品",
    description: "刻有天斗赛区纹章，可进入精英赛参赛者区域。", buyPrice: null, sellPrice: null,
  },
  vast_sea_chart: {
    id: "vast_sea_chart", name: "瀚海航图", category: "关键物品",
    description: "以罗盘、星轨与潮汐记录补全的航图，标注了海神岛外围安全航线。", buyPrice: null, sellPrice: null,
  },
  tide_armor: {
    id: "tide_armor", name: "潮汐轻甲", category: "装备",
    description: "以海魂兽自然脱落的鳞片制成，在风暴与控制魂技中保持稳定。", buyPrice: null, sellPrice: 60,
    slot: "护具", bonus: { maxHp: 48, defense: 8, speed: 5, control: 4 },
  },
};

export const EXPANDED_ITEMS: Record<string, ItemDefinition> = {
  ...LEGACY_ITEMS,
  soul_energy_draught: {
    id: "soul_energy_draught", name: "回魂露", category: "消耗品",
    description: "恢复 2 点战斗魂力。", buyPrice: 18, sellPrice: 9,
    effect: { kind: "energy", amount: 2 }, maxStack: 30,
  },
  wind_chaser_right_leg_bone: {
    id: "wind_chaser_right_leg_bone", name: "追风右腿魂骨", category: "魂骨",
    description: "源自千年追风兽的右腿魂骨，融合后无法卸下或交易。", buyPrice: null, sellPrice: null,
    slot: "右腿魂骨", bonus: { speed: 12, attack: 3 }, unique: true, bindOnEquip: true, maxStack: 1,
  },
  ironback_torso_bone: {
    id: "ironback_torso_bone", name: "玄甲躯干魂骨", category: "魂骨",
    description: "凝聚厚重土系生命力的躯干魂骨，融合后无法卸下或交易。", buyPrice: null, sellPrice: null,
    slot: "躯干魂骨", bonus: { maxHp: 55, defense: 11 }, unique: true, bindOnEquip: true, maxStack: 1,
  },
};

export const DEFAULT_PLAYER_ACTIONS: CombatActionDefinition[] = [
  { id: "basic", name: "普通攻击", kind: "basic", energyCost: 0, power: 0.88 },
  {
    id: "blue-silver-bind", name: "蓝银缠绕", kind: "soulSkill", energyCost: 2, power: 1.25,
    attribute: "植物", effects: [{ kind: "眩晕", target: "enemy", chance: 0.55, duration: 1, potency: 0 }],
  },
  {
    id: "blue-silver-prison", name: "蓝银囚笼", kind: "soulSkill", energyCost: 3, power: 1.62,
    attribute: "植物", effects: [
      { kind: "迟缓", target: "enemy", chance: 1, duration: 2, potency: 8 },
      { kind: "虚弱", target: "enemy", chance: 0.7, duration: 2, potency: 5 },
    ],
  },
];

export const DEFAULT_ENEMY_ACTIONS: CombatActionDefinition[] = [
  { id: "enemy-basic", name: "撕咬", kind: "basic", energyCost: 0, power: 0.82, aiWeight: 5 },
  {
    id: "enemy-burst", name: "魂力冲击", kind: "soulSkill", energyCost: 2, power: 1.18, aiWeight: 3,
    effects: [{ kind: "迟缓", target: "enemy", chance: 0.35, duration: 1, potency: 5 }],
  },
];
