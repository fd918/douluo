import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWorldDirective,
  createInitialWorldDirectorState,
  hydrateWorldDirectorState,
  normalizeWorldDirective,
} from "../src/world-director.ts";

const limits = {
  factionIds: ["shrek", "spirit-hall"],
  locationIds: ["notting-city", "star-forest"],
  rewardItemIds: ["healing_herb"],
  flagIds: ["helped-villagers"],
};

test("AI world directives are clamped to safe game effects", () => {
  const directive = normalizeWorldDirective({
    eventTitle: "雨夜求援",
    eventType: "势力",
    summary: "村民请求魂师寻找失踪的药师。",
    factionId: "shrek",
    reputationDelta: 999,
    coinDelta: 999,
    experienceDelta: 9999,
    locationId: "unknown-place",
    rewardItemId: "forged-artifact",
    addFlag: "forged-flag",
    quest: { title: "寻找药师", objective: "前往森林外围调查", target: 999 },
  }, limits);

  assert.ok(directive);
  assert.equal(directive.reputationDelta, 6);
  assert.equal(directive.coinDelta, 30);
  assert.equal(directive.experienceDelta, 240);
  assert.equal(directive.locationId, undefined);
  assert.equal(directive.rewardItemId, undefined);
  assert.equal(directive.addFlag, undefined);
  assert.equal(directive.quest?.target, 10);
});

test("world director state survives old and malformed saves", () => {
  const hydrated = hydrateWorldDirectorState({
    day: -3,
    factionReputation: { shrek: 999, "spirit-hall": -999, unknown: 50 },
    activeQuests: [],
  }, limits.factionIds);
  assert.equal(hydrated.day, 1);
  assert.deepEqual(hydrated.factionReputation, { shrek: 100, "spirit-hall": -100 });
  assert.deepEqual(hydrated.eventHistory, []);
});

test("applying a world directive records one event and never overflows reputation", () => {
  const initial = createInitialWorldDirectorState(limits.factionIds);
  const directive = normalizeWorldDirective({
    eventTitle: "学院委托",
    eventType: "势力",
    summary: "你协助学院确认了外围魂兽的迁徙方向。",
    factionId: "shrek",
    reputationDelta: 5,
    quest: { id: "forest-route", title: "森林巡查", objective: "完成一次外围战斗", target: 1, rewardText: "学院声望" },
  }, limits);
  assert.ok(directive);
  const next = applyWorldDirective(initial, directive, 4, "AI导演");
  assert.equal(next.factionReputation.shrek, 5);
  assert.equal(next.eventHistory.length, 1);
  assert.equal(next.activeQuests.length, 1);
  assert.equal(next.aiEventsGenerated, 1);
  assert.equal(next.day, 2);
});
