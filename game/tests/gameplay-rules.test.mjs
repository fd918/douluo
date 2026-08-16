import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ENEMY_ACTIONS, DEFAULT_PLAYER_ACTIONS, EXPANDED_ITEMS } from "../src/gameplay/catalog.ts";
import { chooseEnemyAction, performBattleTurn, simulateBattle, startBattle } from "../src/gameplay/battle.ts";
import {
  createAuctionListing,
  createAuctionMarket,
  createEconomyState,
  calculateShopPrice,
  equipItem,
  getEffectiveStats,
  placeAuctionBid,
  purchaseItem,
  sellItem,
  settleAuction,
  settleBattleReward,
  unequipItem,
  useConsumable,
} from "../src/gameplay/economy.ts";

function createBattle(seed = 20260816) {
  return startBattle({
    id: "forest-test",
    seed,
    player: {
      id: "player",
      name: "测试魂师",
      attribute: "植物",
      maxEnergy: 4,
      energy: 2,
      stats: { maxHp: 150, attack: 48, defense: 25, speed: 28, control: 38 },
      actions: DEFAULT_PLAYER_ACTIONS,
    },
    enemy: {
      id: "ripple-snake",
      name: "涟水蛇",
      attribute: "水",
      maxEnergy: 4,
      energy: 2,
      stats: { maxHp: 118, attack: 28, defense: 13, speed: 20, control: 12 },
      actions: DEFAULT_ENEMY_ACTIONS,
    },
    reward: { coins: 7, soulExperience: 330, items: { healing_herb: 1 } },
  });
}

test("相同种子和行动序列产生完全相同的战斗结果", () => {
  const selectAction = (battle) => battle.player.energy >= 3 ? "blue-silver-prison" : battle.player.energy >= 2 ? "blue-silver-bind" : "basic";
  const first = simulateBattle(createBattle(42), selectAction);
  const second = simulateBattle(createBattle(42), selectAction);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first, second);
  assert.equal(first.value.status, "won");
  assert.ok(first.value.events.some((event) => event.text.includes("属性克制")));
});

test("魂技状态会造成持续伤害并跳过敌方行动", () => {
  const battle = startBattle({
    id: "status-test",
    seed: 7,
    player: {
      id: "player", name: "控制系魂师", attribute: "植物", maxEnergy: 4, energy: 4,
      stats: { maxHp: 100, attack: 20, defense: 10, speed: 20, control: 50 },
      actions: [{
        id: "control", name: "藤网毒刺", kind: "soulSkill", energyCost: 2, power: 0.5, attribute: "植物",
        effects: [
          { kind: "眩晕", target: "enemy", chance: 1, duration: 1, potency: 0 },
          { kind: "中毒", target: "enemy", chance: 1, duration: 2, potency: 6 },
        ],
      }],
    },
    enemy: {
      id: "enemy", name: "测试魂兽", attribute: "水", maxEnergy: 2, energy: 0,
      stats: { maxHp: 100, attack: 25, defense: 10, speed: 5, control: 5 },
      actions: [{ id: "hit", name: "撞击", kind: "basic", energyCost: 0, power: 1 }],
    },
    reward: { coins: 1, soulExperience: 1, items: {} },
  });
  const result = performBattleTurn(battle, "control");
  assert.equal(result.ok, true);
  assert.ok(result.value.events.some((event) => event.kind === "skip"));
  assert.ok(result.value.events.some((event) => event.text.includes("中毒影响")));
  assert.equal(result.value.player.hp, 100);
});

test("敌方在低生命时优先选择可用的恢复技能", () => {
  const enemy = {
    id: "enemy", name: "魂兽", hp: 20, energy: 2, maxEnergy: 4, attribute: "兽", statuses: [],
    stats: { maxHp: 100, attack: 20, defense: 10, speed: 10, control: 10 },
    actions: [
      { id: "hit", name: "撞击", kind: "basic", energyCost: 0, power: 1, aiWeight: 10 },
      { id: "heal", name: "再生", kind: "soulSkill", energyCost: 2, power: 0, heal: 30, aiWeight: 1 },
    ],
  };
  assert.equal(chooseEnemyAction(enemy, 99).action.id, "heal");
});

test("商店购买、出售和消耗品结算不会产生负金币或负库存", () => {
  const initial = createEconomyState({ coins: 18, inventory: { healing_herb: 1 } });
  const bought = purchaseItem(initial, EXPANDED_ITEMS.healing_herb, 2);
  assert.equal(bought.ok, true);
  assert.equal(bought.value.coins, 2);
  assert.equal(bought.value.inventory.healing_herb, 3);
  const denied = purchaseItem(bought.value, EXPANDED_ITEMS.healing_herb, 1);
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "INSUFFICIENT_COINS");
  assert.equal(bought.value.coins, 2);

  const used = useConsumable(
    bought.value,
    { currentHp: 40, maxHp: 100, energy: 0, maxEnergy: 4 },
    EXPANDED_ITEMS.healing_herb,
  );
  assert.equal(used.ok, true);
  assert.equal(used.value.target.currentHp, 76);
  assert.equal(used.value.economy.inventory.healing_herb, 2);
  const sold = sellItem(used.value.economy, EXPANDED_ITEMS.healing_herb, 2);
  assert.equal(sold.ok, true);
  assert.equal(sold.value.inventory.healing_herb, 0);
  assert.equal(sold.value.coins, 10);
  assert.equal(calculateShopPrice(EXPANDED_ITEMS.healing_herb, "buy", { buyMarkup: 0.1, reputation: 100 }), 8);
  assert.equal(calculateShopPrice(EXPANDED_ITEMS.healing_herb, "sell", { sellMarkdown: 0.1, reputation: 100 }), 3);
});

test("普通装备兼容旧槽位，魂骨融合后不能卸下或出售", () => {
  let economy = createEconomyState({
    inventory: { apprentice_guard: 1, wind_chaser_right_leg_bone: 1 },
    equipment: { 护具: null, 饰品: null },
  });
  const guard = equipItem(economy, EXPANDED_ITEMS.apprentice_guard);
  assert.equal(guard.ok, true);
  economy = guard.value;
  assert.equal(economy.equipment.饰品, "apprentice_guard");

  const bone = equipItem(economy, EXPANDED_ITEMS.wind_chaser_right_leg_bone);
  assert.equal(bone.ok, true);
  economy = bone.value;
  assert.ok(economy.boundItemIds.includes("wind_chaser_right_leg_bone"));
  assert.equal(unequipItem(economy, "右腿魂骨").code, "ITEM_BOUND");
  assert.equal(sellItem(economy, EXPANDED_ITEMS.wind_chaser_right_leg_bone).code, "ITEM_NOT_SELLABLE");
  const stats = getEffectiveStats(
    { maxHp: 100, attack: 20, defense: 10, speed: 10, control: 10 },
    economy,
    EXPANDED_ITEMS,
  );
  assert.deepEqual(stats, { maxHp: 100, attack: 23, defense: 13, speed: 22, control: 12 });
});

test("战斗奖励只能结算一次", () => {
  const result = simulateBattle(createBattle(101), (battle) => battle.player.energy >= 2 ? "blue-silver-bind" : "basic");
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "won");
  const economy = createEconomyState({ coins: 0, inventory: {} });
  const first = settleBattleReward(result.value, economy);
  assert.equal(first.ok, true);
  assert.equal(first.value.economy.coins, 7);
  assert.equal(first.value.economy.soulExperience, 330);
  assert.equal(first.value.economy.inventory.healing_herb, 1);
  const duplicate = settleBattleReward(first.value.battle, first.value.economy);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "REWARD_ALREADY_CLAIMED");
});

test("拍卖会托管物品、退还被超价者资金，并只结算一次", () => {
  let market = createAuctionMarket({
    seller: { coins: 0, inventory: { tide_armor: 1 } },
    alice: { coins: 100 },
    bob: { coins: 100 },
  });
  const listed = createAuctionListing(market, {
    id: "auction-1", itemId: "tide_armor", quantity: 1, sellerId: "seller",
    reservePrice: 30, minimumIncrement: 5, closesAt: 1_000,
  }, EXPANDED_ITEMS);
  assert.equal(listed.ok, true);
  market = listed.value;
  assert.equal(market.accounts.seller.inventory.tide_armor, 0);

  const aliceBid = placeAuctionBid(market, "auction-1", "alice", 30, 100);
  assert.equal(aliceBid.ok, true);
  assert.equal(aliceBid.value.accounts.alice.coins, 70);
  const bobBid = placeAuctionBid(aliceBid.value, "auction-1", "bob", 35, 200);
  assert.equal(bobBid.ok, true);
  assert.equal(bobBid.value.accounts.alice.coins, 100);
  assert.equal(bobBid.value.accounts.bob.coins, 65);

  const settled = settleAuction(bobBid.value, "auction-1", 1_000);
  assert.equal(settled.ok, true);
  assert.equal(settled.value.accounts.bob.inventory.tide_armor, 1);
  assert.equal(settled.value.accounts.seller.coins, 35);
  const duplicate = settleAuction(settled.value, "auction-1", 1_001);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "AUCTION_CLOSED");
  assert.equal(settled.value.accounts.seller.coins, 35);
});

test("一口价立即成交，失败竞拍不会扣款", () => {
  let market = createAuctionMarket({ player: { coins: 20 } });
  const listed = createAuctionListing(market, {
    id: "auction-2", itemId: "healing_herb", quantity: 2,
    reservePrice: 10, buyoutPrice: 18, closesAt: 1_000,
  }, EXPANDED_ITEMS);
  assert.equal(listed.ok, true);
  market = listed.value;
  const low = placeAuctionBid(market, "auction-2", "player", 9, 100);
  assert.equal(low.ok, false);
  assert.equal(market.accounts.player.coins, 20);
  const buyout = placeAuctionBid(market, "auction-2", "player", 99, 100);
  assert.equal(buyout.ok, true);
  assert.equal(buyout.value.listings["auction-2"].status, "sold");
  assert.equal(buyout.value.accounts.player.coins, 2);
  assert.equal(buyout.value.accounts.player.inventory.healing_herb, 2);
});
