import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MARTIAL_SOULS } from "../src/content/douluoWorldContent.ts";
import { storyNodes } from "../src/story.ts";

const run = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(gameRoot, "public", "audio", "douluo", "narration");
const PROLOGUE_NARRATION = [
  "斗罗大陆，一个没有魔法与斗气，却由武魂决定无数人命运的世界。每个人都会在六岁觉醒武魂，少数拥有魂力的人，则能通过魂环踏上魂师之路。",
  "帝国、宗门、魂师学院与魂兽森林共同维持着脆弱的秩序。力量可以守护伙伴，也可能让人沦为欲望的容器；没有哪条道路天生正确。",
  "你的故事将从法斯诺行省的诺丁城开始。学院后门一串泛着蓝光的脚印，正把平静的新生活引向一场横跨学院、森林、天斗城与远海的阴谋。",
  "你可以结交伙伴、守护魂兽、追逐力量，也可以拒绝所有既定答案。每一次选择都会留在时间线上，并把你带向不同的结局。现在，先决定你要以怎样的身份醒来。",
].join("");

function buildOpeningNarration(martialSoul) {
  return `武魂觉醒仪式上，${martialSoul.name}在你掌心展开。${martialSoul.description}三天后，你带着学院推荐信来到诺丁城。雨后的青石路上，一串泛着蓝光的脚印正通向学院后门。你的入学之日，也因此成为命运改变的起点。`;
}

function buildSceneBridge(currentNode, nextNode) {
  if (nextNode.choices.length === 0) return "";
  if (currentNode.chapter !== nextNode.chapter) {
    return `这条线索让时间线进入${nextNode.chapter}。${nextNode.season}，你来到${nextNode.location}，“${nextNode.title}”已经展开。眼下，你需要${nextNode.quest}。`;
  }
  if (currentNode.location !== nextNode.location) {
    return `局势没有停下。${nextNode.season}，你转入${nextNode.location}，“${nextNode.title}”随之展开。接下来，你需要${nextNode.quest}。`;
  }
  return `局势随即进入“${nextNode.title}”。接下来，你需要${nextNode.quest}。`;
}

function getClips() {
  const clips = [
    { id: "prologue", text: PROLOGUE_NARRATION, source: "世界序章" },
    ...MARTIAL_SOULS.map((martialSoul) => ({
      id: `opening-${martialSoul.id}`,
      text: buildOpeningNarration(martialSoul),
      source: `${martialSoul.name}开局`,
    })),
    {
      id: "timeline-restart",
      text: "熟悉的雨再次落在诺丁城。你不记得上一条时间线的所有细节，却知道这一次，每个选择都可能把大陆带向不同未来。",
      source: "重新开启剧情时间线",
    },
  ];

  for (const currentNode of Object.values(storyNodes)) {
    for (const choice of currentNode.choices) {
      const nextNode = storyNodes[choice.nextId];
      const bridge = nextNode ? buildSceneBridge(currentNode, nextNode) : "";
      clips.push({
        id: `story-${currentNode.id}-${choice.id}`,
        text: `${choice.outcome}${bridge ? ` ${bridge}` : ""}`,
        source: `${currentNode.title} · ${choice.label}`,
      });
    }
  }
  return clips;
}

async function renderClip(clip, temporaryDirectory) {
  const aiffPath = path.join(temporaryDirectory, `${clip.id}.aiff`);
  const mp3Path = path.join(outputDirectory, `${clip.id}.mp3`);
  await run("/usr/bin/say", ["-v", "Tingting", "-r", "180", "-o", aiffPath, clip.text]);
  await run("/opt/homebrew/bin/ffmpeg", [
    "-loglevel", "error", "-y", "-i", aiffPath,
    "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "32k", mp3Path,
  ]);
  return { ...clip, file: `${clip.id}.mp3` };
}

async function main() {
  const clips = getClips();
  const ids = new Set(clips.map((clip) => clip.id));
  if (ids.size !== clips.length) throw new Error("旁白 ID 存在重复");
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "douluo-narration-"));
  const rendered = new Array(clips.length);
  let cursor = 0;

  try {
    const workers = Array.from({ length: 4 }, async () => {
      while (cursor < clips.length) {
        const index = cursor;
        cursor += 1;
        rendered[index] = await renderClip(clips[index], temporaryDirectory);
        process.stdout.write(`\r已生成 ${rendered.filter(Boolean).length}/${clips.length} 段旁白`);
      }
    });
    await Promise.all(workers);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const manifest = {
    version: 1,
    voice: "Tingting（普通话女声）",
    format: "MP3 24kHz mono 32kbps",
    clips: rendered,
  };
  await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`\n旁白生成完成：${clips.length} 段。`);
}

main().catch((error) => {
  console.error(`旁白生成失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
