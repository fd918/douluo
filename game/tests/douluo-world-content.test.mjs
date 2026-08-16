import assert from "node:assert/strict";
import test from "node:test";
import {
  EXTENDED_CHARACTERS,
  FACTIONS,
  MARTIAL_SOULS,
  RANDOM_SIDE_EVENTS,
  SOUL_BEASTS,
  STANDARD_REPUTATION_TIERS,
  WORLD_LOCATIONS,
  createWorldProgress,
  evaluateUnlockCondition,
  findMartialSoulByLegacyName,
  getAvailableEventChoices,
  getAvailableMartialSouls,
  getEligibleRandomEvents,
  getEncounterableSoulBeasts,
  getReputationTier,
  getUnlockedLocations,
} from "../src/content/douluoWorldContent.ts";

const unique = (values) => new Set(values).size === values.length;

test("content pack has the promised amount of typed world content", () => {
  assert.equal(MARTIAL_SOULS.length, 6);
  assert.ok(FACTIONS.length >= 7);
  assert.ok(EXTENDED_CHARACTERS.length >= 8);
  assert.ok(WORLD_LOCATIONS.length >= 12);
  assert.ok(SOUL_BEASTS.length >= 12);
  assert.ok(RANDOM_SIDE_EVENTS.length >= 12);

  for (const collection of [MARTIAL_SOULS, FACTIONS, EXTENDED_CHARACTERS, WORLD_LOCATIONS, SOUL_BEASTS, RANDOM_SIDE_EVENTS]) {
    assert.ok(unique(collection.map((item) => item.id)), "content ids must be unique inside each collection");
  }
});

test("all six martial souls are starter choices and have complete growth data", () => {
  const available = getAvailableMartialSouls(createWorldProgress());
  assert.equal(available.length, 6);
  for (const soul of MARTIAL_SOULS) {
    assert.ok(soul.initialSkill.name);
    assert.ok(soul.initialSkill.energyCost > 0);
    assert.ok(soul.growthDirections.length >= 2, `${soul.name} needs two growth directions`);
    assert.ok(Object.values(soul.starterStats).some((value) => value > 0));
  }
});

test("Blue Silver Grass remains compatible with the existing route", () => {
  const blueSilver = findMartialSoulByLegacyName("蓝银草");
  assert.ok(blueSilver);
  assert.equal(blueSilver.id, "blue-silver-grass");
  assert.equal(blueSilver.attribute, "植物");
  assert.equal(blueSilver.initialSkill.name, "蓝银缠绕");
  for (const flag of ["魂环·千年鬼藤", "魂环·千年月藤", "魂环·千年青藤王", "蓝银囚笼"]) {
    assert.ok(blueSilver.compatibleStoryFlags.includes(flag), flag);
  }
});

test("faction reputation tiers are ordered and resolve boundary scores", () => {
  const minimums = STANDARD_REPUTATION_TIERS.map((tier) => tier.minimum);
  assert.deepEqual(minimums, [...minimums].sort((a, b) => a - b));
  for (const faction of FACTIONS) {
    assert.equal(faction.reputationTiers.length, 7);
    assert.equal(getReputationTier(faction.id, -50).name, "敌对");
    assert.equal(getReputationTier(faction.id, 0).name, "中立");
    assert.equal(getReputationTier(faction.id, 100).name, "传奇");
  }
});

test("declarative unlock conditions evaluate nested progression safely", () => {
  const progress = createWorldProgress({
    soulPower: 45,
    coins: 20,
    victories: 8,
    martialSoulId: "starlight-compass",
    storyFlags: ["获得瀚海航图", "完整船队"],
    completedEventIds: ["lost-work-study-ledger"],
    visitedLocationIds: ["notting-city", "west-sea-port", "vast-sea-route"],
    reputation: { "heaven-dou-empire": 30 },
    relationships: { "ning-rongrong": 50 },
  });

  assert.ok(evaluateUnlockCondition({ kind: "all", conditions: [
    { kind: "soulPower", minimum: 40 },
    { kind: "coins", minimum: 10 },
    { kind: "martialSoul", soulId: "starlight-compass" },
    { kind: "reputation", factionId: "heaven-dou-empire", minimum: 20 },
  ] }, progress));
  assert.ok(!evaluateUnlockCondition({ kind: "not", condition: { kind: "completedEvent", eventId: "lost-work-study-ledger" } }, progress));
});

test("location, beast and event selectors enforce unlock state", () => {
  const initial = createWorldProgress();
  assert.ok(getUnlockedLocations(initial).some((item) => item.id === "notting-city"));
  assert.ok(!getUnlockedLocations(initial).some((item) => item.id === "sea-god-island"));
  assert.ok(getEncounterableSoulBeasts("star-forest", initial).some((item) => item.id === "dew-leaf-deer"));
  assert.ok(!getEncounterableSoulBeasts("sunset-forest", initial).some((item) => item.id === "ghost-vine"));
  assert.ok(getEligibleRandomEvents("notting-city", initial).some((item) => item.id === "lost-work-study-ledger"));

  const voyage = createWorldProgress({
    soulPower: 55,
    storyFlags: ["获得瀚海航图", "完整船队", "海神岛认可"],
    visitedLocationIds: ["notting-city", "west-sea-port", "vast-sea-route", "sea-god-island"],
  });
  assert.ok(getUnlockedLocations(voyage).some((item) => item.id === "sea-god-island"));
  assert.ok(getEligibleRandomEvents("sea-god-island", voyage).some((item) => item.id === "tide-stone-echo"));
});

test("all cross references, unlock rules and event rewards are valid", () => {
  const factionIds = new Set(FACTIONS.map((item) => item.id));
  const locationIds = new Set(WORLD_LOCATIONS.map((item) => item.id));
  const soulIds = new Set(MARTIAL_SOULS.map((item) => item.id));
  const knownCharacterIds = new Set([
    "xiao-wu", "dai-mubai", "oscar", "ning-rongrong",
    ...EXTENDED_CHARACTERS.map((item) => item.id),
  ]);

  for (const faction of FACTIONS) {
    assert.ok(locationIds.has(faction.headquarters), `${faction.id} headquarters`);
    for (const rivalId of faction.rivalryIds) assert.ok(factionIds.has(rivalId), rivalId);
  }
  for (const character of EXTENDED_CHARACTERS) {
    assert.ok(character.affiliation === "independent" || factionIds.has(character.affiliation), character.id);
    for (const locationId of character.locations) assert.ok(locationIds.has(locationId), locationId);
  }
  for (const beast of SOUL_BEASTS) {
    for (const locationId of beast.habitatIds) assert.ok(locationIds.has(locationId), locationId);
    for (const soulId of beast.suitableSoulIds) assert.ok(soulIds.has(soulId), soulId);
  }
  for (const event of RANDOM_SIDE_EVENTS) {
    assert.ok(event.weight > 0);
    assert.ok(event.choices.length >= 2);
    for (const locationId of event.locationIds) assert.ok(locationIds.has(locationId), locationId);
    for (const choice of event.choices) {
      assert.ok(choice.label && choice.outcome);
      assert.ok(Object.keys(choice.rewards).length > 0, `${event.id}/${choice.id} needs a reward`);
      for (const factionId of Object.keys(choice.rewards.reputation ?? {})) assert.ok(factionIds.has(factionId), factionId);
      for (const characterId of Object.keys(choice.rewards.relationships ?? {})) assert.ok(knownCharacterIds.has(characterId), characterId);
    }
  }

  const race = RANDOM_SIDE_EVENTS.find((item) => item.id === "night-rooftop-race");
  const initialChoices = getAvailableEventChoices(race, createWorldProgress());
  assert.deepEqual(initialChoices.map((item) => item.id), ["match-pace", "find-shortcut"]);
});

test("content pack contains no Dou Po terminology", () => {
  const source = JSON.stringify({ MARTIAL_SOULS, FACTIONS, EXTENDED_CHARACTERS, WORLD_LOCATIONS, SOUL_BEASTS, RANDOM_SIDE_EVENTS });
  for (const forbidden of ["斗气", "斗者", "斗师", "异火", "炼药师", "萧炎", "药老", "乌坦城", "云岚宗"]) {
    assert.ok(!source.includes(forbidden), forbidden);
  }
});
