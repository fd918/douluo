export type SoulAttribute = "植物" | "水" | "火" | "兽" | "无";

export type CharacterStats = {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  control: number;
};

export type EquipmentSlot =
  | "护具"
  | "饰品"
  | "武器"
  | "头部魂骨"
  | "躯干魂骨"
  | "左臂魂骨"
  | "右臂魂骨"
  | "左腿魂骨"
  | "右腿魂骨"
  | "外附魂骨";

export type ItemEffect =
  | { kind: "heal"; amount: number }
  | { kind: "experience"; amount: number }
  | { kind: "energy"; amount: number };

export type ItemCategory = "关键物品" | "消耗品" | "装备" | "普通物品" | "魂骨";

/**
 * buyPrice/sellPrice/effect/slot/bonus intentionally match the existing
 * Prototype item shape, so old inventory records can be used without migration.
 */
export type ItemDefinition = {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  buyPrice: number | null;
  sellPrice: number | null;
  effect?: ItemEffect;
  slot?: EquipmentSlot;
  bonus?: Partial<CharacterStats>;
  unique?: boolean;
  bindOnEquip?: boolean;
  maxStack?: number;
};

export type EconomyState = {
  coins: number;
  soulExperience: number;
  inventory: Record<string, number>;
  equipment: Partial<Record<EquipmentSlot, string | null>>;
  boundItemIds: string[];
  claimedRewardIds: string[];
};

export type ConsumableTarget = {
  currentHp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
};

export type ShopPricingContext = {
  /** Shop surcharge, expressed as 0.1 for 10%. */
  buyMarkup?: number;
  /** Shop's resale deduction, expressed as 0.1 for 10%. */
  sellMarkdown?: number;
  /** 0-100; grants at most 15% purchase discount and 10% sale bonus. */
  reputation?: number;
};

export type StatusKind = "眩晕" | "中毒" | "灼烧" | "护盾" | "虚弱" | "迟缓" | "再生";

export type StatusEffect = {
  id: string;
  kind: StatusKind;
  source: string;
  remainingTurns: number;
  potency: number;
};

export type CombatEffectDefinition = {
  kind: StatusKind;
  target: "self" | "enemy";
  chance: number;
  duration: number;
  potency: number;
};

export type CombatActionDefinition = {
  id: string;
  name: string;
  kind: "basic" | "soulSkill";
  energyCost: number;
  power: number;
  attribute?: SoulAttribute;
  effects?: CombatEffectDefinition[];
  heal?: number;
  aiWeight?: number;
};

export type CombatantState = {
  id: string;
  name: string;
  hp: number;
  energy: number;
  maxEnergy: number;
  attribute: SoulAttribute;
  stats: CharacterStats;
  statuses: StatusEffect[];
  actions: CombatActionDefinition[];
};

export type BattleReward = {
  id: string;
  coins: number;
  soulExperience: number;
  items: Record<string, number>;
};

export type BattleStatus = "active" | "won" | "lost";

export type BattleEvent = {
  round: number;
  actorId: string;
  kind: "damage" | "heal" | "status" | "skip" | "victory" | "defeat";
  text: string;
  amount?: number;
};

export type BattleState = {
  id: string;
  seed: number;
  round: number;
  status: BattleStatus;
  player: CombatantState;
  enemy: CombatantState;
  reward: BattleReward;
  rewardClaimed: boolean;
  events: BattleEvent[];
};

export type BattleStartOptions = {
  id: string;
  seed: number;
  player: Omit<CombatantState, "hp" | "energy" | "statuses"> &
    Partial<Pick<CombatantState, "hp" | "energy" | "statuses">>;
  enemy: Omit<CombatantState, "hp" | "energy" | "statuses"> &
    Partial<Pick<CombatantState, "hp" | "energy" | "statuses">>;
  reward: Omit<BattleReward, "id"> & { id?: string };
};

export type RuleErrorCode =
  | "INVALID_QUANTITY"
  | "ITEM_NOT_FOUND"
  | "ITEM_NOT_PURCHASABLE"
  | "ITEM_NOT_SELLABLE"
  | "ITEM_NOT_USABLE"
  | "INSUFFICIENT_COINS"
  | "INSUFFICIENT_ITEMS"
  | "ITEM_EQUIPPED"
  | "ITEM_BOUND"
  | "STACK_LIMIT"
  | "BATTLE_FINISHED"
  | "ACTION_NOT_FOUND"
  | "INSUFFICIENT_ENERGY"
  | "REWARD_UNAVAILABLE"
  | "REWARD_ALREADY_CLAIMED"
  | "AUCTION_NOT_FOUND"
  | "AUCTION_CLOSED"
  | "AUCTION_NOT_ENDED"
  | "BID_TOO_LOW"
  | "BIDDER_NOT_FOUND"
  | "SELLER_CANNOT_BID"
  | "DUPLICATE_LISTING";

export type RuleResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: RuleErrorCode; message: string };

export type AuctionListing = {
  id: string;
  itemId: string;
  quantity: number;
  sellerId: string | null;
  reservePrice: number;
  minimumIncrement: number;
  buyoutPrice: number | null;
  closesAt: number;
  status: "open" | "sold" | "unsold";
  currentBid: number;
  currentBidderId: string | null;
  settlementId: string | null;
};

export type AuctionMarketState = {
  accounts: Record<string, EconomyState>;
  listings: Record<string, AuctionListing>;
};

export type CreateAuctionRequest = {
  id: string;
  itemId: string;
  quantity: number;
  sellerId?: string | null;
  reservePrice: number;
  minimumIncrement?: number;
  buyoutPrice?: number | null;
  closesAt: number;
};
