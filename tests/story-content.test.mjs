import assert from "node:assert/strict";
import test from "node:test";
import { ALL_ENDINGS, resolveStoryChoice, storyNodes } from "../src/story.ts";

test("every story choice points to a real node", () => {
  for (const current of Object.values(storyNodes)) {
    for (const choice of current.choices) {
      assert.ok(storyNodes[choice.nextId], `${current.id} -> ${choice.nextId}`);
    }
  }
});

test("all eight endings are reachable from the opening node", () => {
  const reachable = new Set(["notting_street"]);
  const queue = ["notting_street"];
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
  assert.match(resolution.narrative, /四月·清晨，你来到诺丁城南门/);
});
