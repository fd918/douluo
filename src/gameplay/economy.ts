import type {
  AuctionMarketState,
  ConsumableTarget,
  CreateAuctionRequest,
  EconomyState,
  EquipmentSlot,
  ItemDefinition,
  RuleErrorCode,
  RuleResult,
  BattleState,
  CharacterStats,
  ShopPricingContext,
} from "./types";

const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;

function success<T>(value: T): RuleResult<T> {
  return { ok: true, value };
}

function failure<T>(code: RuleErrorCode, message: string): RuleResult<T> {
  return { ok: false, code, message };
}

function wholeAmount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function addSafe(left: number, right: number) {
  return Math.min(MAX_SAFE_AMOUNT, wholeAmount(left) + wholeAmount(right));
}

function normalizeInventory(inventory: Record<string, number> | undefined) {
  return Object.fromEntries(
    Object.entries(inventory ?? {}).map(([itemId, quantity]) => [itemId, wholeAmount(quantity)]),
  );
}

export function createEconomyState(value: Partial<EconomyState> = {}): EconomyState {
  return {
    coins: wholeAmount(value.coins ?? 0),
    soulExperience: wholeAmount(value.soulExperience ?? 0),
    inventory: normalizeInventory(value.inventory),
    equipment: { ...(value.equipment ?? {}) },
    boundItemIds: [...new Set(value.boundItemIds ?? [])],
    claimedRewardIds: [...new Set(value.claimedRewardIds ?? [])],
  };
}

export function getEffectiveStats(
  base: CharacterStats,
  economy: EconomyState,
  catalog: Record<string, ItemDefinition>,
): CharacterStats {
  const stats = { ...base };
  for (const itemId of Object.values(economy.equipment)) {
    if (!itemId) continue;
    const bonus = catalog[itemId]?.bonus;
    if (!bonus) continue;
    stats.maxHp += bonus.maxHp ?? 0;
    stats.attack += bonus.attack ?? 0;
    stats.defense += bonus.defense ?? 0;
    stats.speed += bonus.speed ?? 0;
    stats.control += bonus.control ?? 0;
  }
  return stats;
}

export function grantItem(state: EconomyState, itemId: string, quantity: number): EconomyState {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return state;
  return {
    ...state,
    inventory: {
      ...state.inventory,
      [itemId]: addSafe(state.inventory[itemId] ?? 0, quantity),
    },
  };
}

export function calculateShopPrice(
  item: ItemDefinition,
  mode: "buy" | "sell",
  context: ShopPricingContext = {},
) {
  const base = mode === "buy" ? item.buyPrice : item.sellPrice;
  if (base === null) return null;
  const reputation = clampPercent(context.reputation ?? 0);
  if (mode === "buy") {
    const markup = Math.max(0, context.buyMarkup ?? 0);
    const discount = reputation * 0.15;
    return Math.max(0, Math.ceil(base * (1 + markup) * (1 - discount)));
  }
  const markdown = clampPercent(context.sellMarkdown ?? 0);
  const bonus = reputation * 0.1;
  return Math.max(0, Math.floor(base * (1 - markdown) * (1 + bonus)));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value / (value > 1 ? 100 : 1) : 0));
}

export function purchaseItem(
  state: EconomyState,
  item: ItemDefinition | undefined,
  quantity = 1,
  unitPrice = item?.buyPrice ?? null,
): RuleResult<EconomyState> {
  if (!item) return failure("ITEM_NOT_FOUND", "找不到要购买的物品。");
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return failure("INVALID_QUANTITY", "购买数量必须是正整数。");
  if (unitPrice === null || !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
    return failure("ITEM_NOT_PURCHASABLE", "该物品不能在商店购买。");
  }
  const current = wholeAmount(state.inventory[item.id] ?? 0);
  const stackLimit = item.unique ? 1 : item.maxStack ?? MAX_SAFE_AMOUNT;
  if (current + quantity > stackLimit) return failure("STACK_LIMIT", "购买数量超过物品持有上限。");
  const total = unitPrice * quantity;
  if (!Number.isSafeInteger(total) || total > state.coins) return failure("INSUFFICIENT_COINS", "金魂币不足。");
  return success(grantItem({ ...state, coins: state.coins - total }, item.id, quantity));
}

export function sellItem(
  state: EconomyState,
  item: ItemDefinition | undefined,
  quantity = 1,
  unitPrice = item?.sellPrice ?? null,
): RuleResult<EconomyState> {
  if (!item) return failure("ITEM_NOT_FOUND", "找不到要出售的物品。");
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return failure("INVALID_QUANTITY", "出售数量必须是正整数。");
  if (unitPrice === null || !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
    return failure("ITEM_NOT_SELLABLE", "该物品不能出售。");
  }
  if (state.boundItemIds.includes(item.id)) return failure("ITEM_BOUND", "已融合或绑定的物品不能出售。");
  const equippedCount = Object.values(state.equipment).filter((itemId) => itemId === item.id).length;
  const available = wholeAmount(state.inventory[item.id] ?? 0) - equippedCount;
  if (available < quantity) {
    return failure(equippedCount > 0 ? "ITEM_EQUIPPED" : "INSUFFICIENT_ITEMS", "可出售数量不足，请先卸下装备。");
  }
  const proceeds = unitPrice * quantity;
  if (!Number.isSafeInteger(proceeds)) return failure("INVALID_QUANTITY", "出售总价超出安全范围。");
  return success({
    ...state,
    coins: addSafe(state.coins, proceeds),
    inventory: { ...state.inventory, [item.id]: available + equippedCount - quantity },
  });
}

export function equipItem(state: EconomyState, item: ItemDefinition | undefined): RuleResult<EconomyState> {
  if (!item) return failure("ITEM_NOT_FOUND", "找不到要装备的物品。");
  if (!item.slot) return failure("ITEM_NOT_USABLE", "该物品不能装备。");
  if ((state.inventory[item.id] ?? 0) <= 0) return failure("INSUFFICIENT_ITEMS", "行囊中没有该物品。");
  if (state.equipment[item.slot] === item.id) return success(state);
  const occupiedItemId = state.equipment[item.slot];
  if (occupiedItemId && state.boundItemIds.includes(occupiedItemId)) {
    return failure("ITEM_BOUND", "该魂骨槽位已有融合魂骨，不能替换。");
  }
  const boundItemIds = item.bindOnEquip && !state.boundItemIds.includes(item.id)
    ? [...state.boundItemIds, item.id]
    : state.boundItemIds;
  return success({
    ...state,
    equipment: { ...state.equipment, [item.slot]: item.id },
    boundItemIds,
  });
}

export function unequipItem(state: EconomyState, slot: EquipmentSlot): RuleResult<EconomyState> {
  const itemId = state.equipment[slot];
  if (!itemId) return success(state);
  if (state.boundItemIds.includes(itemId)) return failure("ITEM_BOUND", "已融合的魂骨不能卸下。");
  return success({ ...state, equipment: { ...state.equipment, [slot]: null } });
}

export function useConsumable(
  state: EconomyState,
  target: ConsumableTarget,
  item: ItemDefinition | undefined,
): RuleResult<{ economy: EconomyState; target: ConsumableTarget }> {
  if (!item) return failure("ITEM_NOT_FOUND", "找不到要使用的物品。");
  if (!item.effect) return failure("ITEM_NOT_USABLE", "该物品不能直接使用。");
  if ((state.inventory[item.id] ?? 0) <= 0) return failure("INSUFFICIENT_ITEMS", "行囊中没有该物品。");
  if (item.effect.kind === "heal" && target.currentHp >= target.maxHp) {
    return failure("ITEM_NOT_USABLE", "当前生命已满，无需使用恢复物品。");
  }
  if (item.effect.kind === "energy" && target.energy >= target.maxEnergy) {
    return failure("ITEM_NOT_USABLE", "当前魂力已满，无需使用恢复物品。");
  }
  const economy = {
    ...state,
    inventory: { ...state.inventory, [item.id]: (state.inventory[item.id] ?? 0) - 1 },
    soulExperience: item.effect.kind === "experience"
      ? addSafe(state.soulExperience, item.effect.amount)
      : state.soulExperience,
  };
  const nextTarget = { ...target };
  if (item.effect.kind === "heal") nextTarget.currentHp = Math.min(target.maxHp, target.currentHp + item.effect.amount);
  if (item.effect.kind === "energy") nextTarget.energy = Math.min(target.maxEnergy, target.energy + item.effect.amount);
  return success({ economy, target: nextTarget });
}

export function settleBattleReward(
  battle: BattleState,
  state: EconomyState,
): RuleResult<{ battle: BattleState; economy: EconomyState }> {
  if (battle.status !== "won") return failure("REWARD_UNAVAILABLE", "只有战斗胜利后才能结算奖励。");
  if (battle.rewardClaimed || state.claimedRewardIds.includes(battle.reward.id)) {
    return failure("REWARD_ALREADY_CLAIMED", "本场战斗奖励已经结算，不能重复领取。");
  }
  let economy: EconomyState = {
    ...state,
    coins: addSafe(state.coins, battle.reward.coins),
    soulExperience: addSafe(state.soulExperience, battle.reward.soulExperience),
    claimedRewardIds: [...state.claimedRewardIds, battle.reward.id],
  };
  for (const [itemId, quantity] of Object.entries(battle.reward.items)) economy = grantItem(economy, itemId, quantity);
  return success({ battle: { ...battle, rewardClaimed: true }, economy });
}

export function createAuctionMarket(accounts: Record<string, Partial<EconomyState>> = {}): AuctionMarketState {
  return {
    accounts: Object.fromEntries(Object.entries(accounts).map(([id, state]) => [id, createEconomyState(state)])),
    listings: {},
  };
}

export function createAuctionListing(
  market: AuctionMarketState,
  request: CreateAuctionRequest,
  catalog: Record<string, ItemDefinition>,
): RuleResult<AuctionMarketState> {
  if (market.listings[request.id]) return failure("DUPLICATE_LISTING", "拍卖编号已存在。");
  const item = catalog[request.itemId];
  if (!item) return failure("ITEM_NOT_FOUND", "找不到要拍卖的物品。");
  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) return failure("INVALID_QUANTITY", "拍卖数量必须是正整数。");
  if (!Number.isSafeInteger(request.reservePrice) || request.reservePrice < 0 || !Number.isSafeInteger(request.closesAt)) {
    return failure("INVALID_QUANTITY", "拍卖价格或结束时间无效。");
  }
  const sellerId = request.sellerId ?? null;
  let accounts = market.accounts;
  if (sellerId) {
    const seller = accounts[sellerId];
    if (!seller) return failure("BIDDER_NOT_FOUND", "找不到拍卖卖家账户。");
    if (item.category === "关键物品" || seller.boundItemIds.includes(item.id)) {
      return failure("ITEM_NOT_SELLABLE", "关键物品或已绑定物品不能拍卖。");
    }
    const equippedCount = Object.values(seller.equipment).filter((id) => id === item.id).length;
    const available = (seller.inventory[item.id] ?? 0) - equippedCount;
    if (available < request.quantity) return failure(equippedCount ? "ITEM_EQUIPPED" : "INSUFFICIENT_ITEMS", "可拍卖物品数量不足。");
    accounts = {
      ...accounts,
      [sellerId]: {
        ...seller,
        inventory: { ...seller.inventory, [item.id]: (seller.inventory[item.id] ?? 0) - request.quantity },
      },
    };
  }
  const minimumIncrement = Math.max(1, wholeAmount(request.minimumIncrement ?? 1));
  const buyoutPrice = request.buyoutPrice == null ? null : wholeAmount(request.buyoutPrice);
  return success({
    accounts,
    listings: {
      ...market.listings,
      [request.id]: {
        id: request.id,
        itemId: request.itemId,
        quantity: request.quantity,
        sellerId,
        reservePrice: request.reservePrice,
        minimumIncrement,
        buyoutPrice: buyoutPrice !== null && buyoutPrice >= request.reservePrice ? buyoutPrice : null,
        closesAt: request.closesAt,
        status: "open",
        currentBid: 0,
        currentBidderId: null,
        settlementId: null,
      },
    },
  });
}

function settleOpenAuction(
  market: AuctionMarketState,
  listingId: string,
): RuleResult<AuctionMarketState> {
  const listing = market.listings[listingId];
  if (!listing) return failure("AUCTION_NOT_FOUND", "找不到该拍卖。");
  if (listing.status !== "open") return failure("AUCTION_CLOSED", "该拍卖已经结算。");
  const settlementId = `auction:${listing.id}`;
  let accounts = market.accounts;
  if (!listing.currentBidderId) {
    if (listing.sellerId && accounts[listing.sellerId]) {
      accounts = {
        ...accounts,
        [listing.sellerId]: grantItem(accounts[listing.sellerId], listing.itemId, listing.quantity),
      };
    }
    return success({
      accounts,
      listings: { ...market.listings, [listing.id]: { ...listing, status: "unsold", settlementId } },
    });
  }
  const winner = accounts[listing.currentBidderId];
  if (!winner) return failure("BIDDER_NOT_FOUND", "竞拍获胜者账户不存在。");
  accounts = {
    ...accounts,
    [listing.currentBidderId]: grantItem(winner, listing.itemId, listing.quantity),
  };
  if (listing.sellerId && accounts[listing.sellerId]) {
    accounts = {
      ...accounts,
      [listing.sellerId]: {
        ...accounts[listing.sellerId],
        coins: addSafe(accounts[listing.sellerId].coins, listing.currentBid),
      },
    };
  }
  return success({
    accounts,
    listings: { ...market.listings, [listing.id]: { ...listing, status: "sold", settlementId } },
  });
}

export function placeAuctionBid(
  market: AuctionMarketState,
  listingId: string,
  bidderId: string,
  amount: number,
  now: number,
): RuleResult<AuctionMarketState> {
  const listing = market.listings[listingId];
  if (!listing) return failure("AUCTION_NOT_FOUND", "找不到该拍卖。");
  if (listing.status !== "open" || now >= listing.closesAt) return failure("AUCTION_CLOSED", "该拍卖已经结束。");
  const bidder = market.accounts[bidderId];
  if (!bidder) return failure("BIDDER_NOT_FOUND", "找不到竞拍账户。");
  if (listing.sellerId === bidderId) return failure("SELLER_CANNOT_BID", "卖家不能竞拍自己的物品。");
  const minimumBid = listing.currentBidderId
    ? listing.currentBid + listing.minimumIncrement
    : listing.reservePrice;
  const normalizedAmount = listing.buyoutPrice !== null && amount >= listing.buyoutPrice
    ? listing.buyoutPrice
    : amount;
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount < minimumBid) {
    return failure("BID_TOO_LOW", `出价至少需要 ${minimumBid} 金魂币。`);
  }
  const ownHeldBid = listing.currentBidderId === bidderId ? listing.currentBid : 0;
  const additionalCost = normalizedAmount - ownHeldBid;
  if (bidder.coins < additionalCost) return failure("INSUFFICIENT_COINS", "金魂币不足以完成出价。");

  let accounts = { ...market.accounts };
  if (listing.currentBidderId && listing.currentBidderId !== bidderId) {
    const previous = accounts[listing.currentBidderId];
    if (previous) accounts[listing.currentBidderId] = { ...previous, coins: addSafe(previous.coins, listing.currentBid) };
  }
  accounts[bidderId] = { ...accounts[bidderId], coins: accounts[bidderId].coins - additionalCost };
  const nextMarket: AuctionMarketState = {
    accounts,
    listings: {
      ...market.listings,
      [listingId]: { ...listing, currentBid: normalizedAmount, currentBidderId: bidderId },
    },
  };
  if (listing.buyoutPrice !== null && normalizedAmount >= listing.buyoutPrice) return settleOpenAuction(nextMarket, listingId);
  return success(nextMarket);
}

export function settleAuction(
  market: AuctionMarketState,
  listingId: string,
  now: number,
): RuleResult<AuctionMarketState> {
  const listing = market.listings[listingId];
  if (!listing) return failure("AUCTION_NOT_FOUND", "找不到该拍卖。");
  if (listing.status !== "open") return failure("AUCTION_CLOSED", "该拍卖已经结算，不能重复发放物品或金币。");
  if (now < listing.closesAt) return failure("AUCTION_NOT_ENDED", "拍卖尚未结束。");
  return settleOpenAuction(market, listingId);
}
