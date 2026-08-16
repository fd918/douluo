import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_ENDINGS,
  CANON_SCENE_COUNT,
  CANON_START_NODE_ID,
  getStoryIntro,
  resolveStoryChoice,
  storyNodes,
} from "../src/story.ts";

test("every story choice points to a real node", () => {
  for (const current of Object.values(storyNodes)) {
    for (const choice of current.choices) {
      assert.ok(storyNodes[choice.nextId], `${current.id} -> ${choice.nextId}`);
    }
  }
});

test("all legacy and original-companion endings are reachable", () => {
  const reachable = new Set(["notting_street", CANON_START_NODE_ID]);
  const queue = ["notting_street", CANON_START_NODE_ID];
  while (queue.length > 0) {
    const current = storyNodes[queue.shift()];
    for (const choice of current.choices) {
      if (!reachable.has(choice.nextId)) {
        reachable.add(choice.nextId);
        queue.push(choice.nextId);
      }
    }
  }

  const endingNames = Object.values(storyNodes)
    .filter((current) => current.endingName)
    .map((current) => current.endingName);
  assert.deepEqual([...new Set(endingNames)], [...ALL_ENDINGS]);
  for (const current of Object.values(storyNodes).filter((item) => item.endingName)) {
    assert.ok(reachable.has(current.id), `${current.endingName} is unreachable`);
  }
});

test("原著同行主线包含足够密度的完整场景", () => {
  assert.ok(CANON_SCENE_COUNT >= 60);
  const canonScenes = Object.values(storyNodes).filter((current) => current.id.startsWith("canon_") && current.sceneIndex);
  assert.ok(canonScenes.length >= 60);
  for (const scene of canonScenes.filter((current) => current.choices.length > 0 && current.id !== "canon_crossroads")) {
    assert.ok(scene.intro.length >= 120, `${scene.id} intro is too short`);
    assert.ok(scene.canonAnchor, `${scene.id} needs a canon anchor`);
    assert.equal(scene.choices.length, 3, `${scene.id} needs three meaningful choices`);
  }
});

test("原著同行从觉醒一路覆盖诺丁、史莱克、魂师大赛和海神岛", () => {
  const source = JSON.stringify(Object.values(storyNodes).filter((current) => current.id.startsWith("canon_")));
  for (const milestone of ["武魂觉醒", "诺丁学院", "第一次猎魂", "史莱克", "大斗魂场", "精英赛", "五年之约", "海神岛", "嘉陵关"]) {
    assert.ok(source.includes(milestone), milestone);
  }
});

test("武魂、姓名和人生设定会写入场景且不会遗留模板", () => {
  const game = {
    currentStoryNodeId: "canon_awakening_hall",
    storyMode: "canon",
    narrativePace: "immersive",
    storyFlags: [],
    name: "闻舟",
    martialSoul: "星轨罗盘",
    identity: "原著同行者",
    talent: "天才档",
    originPlace: "天斗城旧街",
    background: "工匠家庭",
    lifeGoal: "让普通武魂也得到公平对待",
  };
  const intro = getStoryIntro(game);
  assert.match(intro, /闻舟/);
  assert.match(intro, /星轨罗盘/);
  assert.ok(!intro.includes("{{"));
  const resolution = resolveStoryChoice(game, "awakening_hall_1");
  assert.ok(resolution);
  assert.ok(!resolution.narrative.includes("{{"));
  assert.equal(resolution.nextNodeId, "canon_family_night");
  assert.match(resolution.narrative, /工读生名额/);
});

test("默认选择可以从六岁觉醒完整推进到原著同行结局", () => {
  let game = {
    currentStoryNodeId: CANON_START_NODE_ID,
    storyMode: "canon",
    narrativePace: "immersive",
    storyFlags: [],
    relationship: 35,
    name: "闻舟",
    martialSoul: "星辉罗盘",
  };
  const visited = [];
  for (let turn = 0; turn < 80; turn += 1) {
    const current = storyNodes[game.currentStoryNodeId];
    visited.push(current.id);
    if (current.choices.length === 0) break;
    const choice = current.choices.find((item) => !item.condition || item.condition(game));
    assert.ok(choice, `${current.id} has no available choice`);
    const resolution = resolveStoryChoice(game, choice.id);
    assert.ok(resolution, `${current.id}/${choice.id} did not resolve`);
    game = {
      ...game,
      currentStoryNodeId: resolution.nextNodeId,
      storyFlags: resolution.flags,
      relationship: Math.max(0, Math.min(100, game.relationship + resolution.relationship)),
    };
  }
  const ending = storyNodes[game.currentStoryNodeId];
  assert.equal(ending.endingName, "大陆新芽");
  assert.ok(visited.length >= 62);
  assert.ok(game.storyFlags.includes("第一魂环已吸收"));
  assert.ok(game.storyFlags.includes("第二魂环已吸收"));
});

test("the expanded saga includes the second soul ring, tournament, voyage and Sea God Island", () => {
  const source = JSON.stringify(storyNodes);
  for (const milestone of ["第二魂环", "精英赛", "瀚海航路", "海神岛"]) {
    assert.ok(source.includes(milestone), milestone);
  }
  assert.ok(Object.keys(storyNodes).length >= 35);
});

test("主线跨场景时会在选择结果后补充转场交代", () => {
  const resolution = resolveStoryChoice(
    { currentStoryNodeId: "notting_night", storyFlags: [] },
    "enter",
  );

  assert.ok(resolution);
  assert.match(resolution.narrative, /你从火中抢下一页账册/);
  assert.match(resolution.narrative, /第二章 · 离城之路/);
  assert.match(resolution.narrative, /四月·清晨，你抵达诺丁城南门/);
});
