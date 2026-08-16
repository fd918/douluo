import { execFile } from "node:child_process";
import { access, copyFile, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MARTIAL_SOULS } from "../src/content/douluoWorldContent.ts";
import { PROLOGUE_NARRATION, buildOpeningNarration } from "../src/narrationText.ts";
import { buildSceneBridge, storyNodes } from "../src/story.ts";

const run = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(gameRoot, "public", "audio", "douluo", "narration");
const edgeTtsCommand = process.env.EDGE_TTS_BIN ?? "edge-tts";
const voiceProfiles = {
  story: {
    label: "主旁白 · 云希",
    voice: "zh-CN-YunxiNeural",
    rate: "-11%",
    pitch: "-6Hz",
    use: "日常剧情、探索、人物关系与普通转场",
  },
  fate: {
    label: "命运之声 · 云健",
    voice: "zh-CN-YunjianNeural",
    rate: "-14%",
    pitch: "-8Hz",
    use: "世界序章、武魂觉醒、重大转折、终局抉择与结局",
  },
};
const voiceMasteringFilter = [
  "highpass=f=70",
  "lowpass=f=13000",
  "acompressor=threshold=0.08:ratio=1.8:attack=20:release=250:makeup=1.5",
  "aecho=0.8:0.06:32:0.035",
  "loudnorm=I=-18:TP=-2:LRA=8",
].join(",");
const fateStoryNodeIds = new Set([
  "tournament_final",
  "final_crossroads",
  "sea_god_shore",
  "deep_sea_crossroads",
]);
const fateCanonNodeIds = new Set([
  "canon_awakening_morning",
  "canon_awakening_hall",
  "canon_ring_choice",
  "canon_graduation_eve",
  "canon_zhaowuji",
  "canon_titan_ape",
  "canon_spider_crisis",
  "canon_xiaowu_exposed",
  "canon_departure_five_years",
  "canon_reunion",
  "canon_magic_whale",
  "canon_seagod_arrival",
  "canon_final_war",
  "canon_after_war",
  "canon_crossroads",
  "canon_ending_new_academy",
  "canon_ending_shrek_legacy",
  "canon_ending_open_horizon",
]);

function getStoryNarratorRole(currentNode, nextNode) {
  if (fateStoryNodeIds.has(currentNode.id)) return "fate";
  if (nextNode?.id === "second_ring_awakened" || nextNode?.choices.length === 0) return "fate";
  return "story";
}

function buildStaticCanonNarration(node) {
  const replacements = {
    name: "你",
    martialSoul: "你的武魂",
    identity: "原著同行者",
    talent: "属于自己的天赋",
    originPlace: "法斯诺行省的家乡",
    background: "你的家庭",
    lifeGoal: "最初的人生目标",
    secret: "没有向伙伴说出的心事",
  };
  const intro = node.intro.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => replacements[key] ?? placeholder);
  return `${node.title}。${intro}`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function synthesizeVoice(profile, text, outputPath) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await run(
        edgeTtsCommand,
        [
          "--voice", profile.voice,
          `--rate=${profile.rate}`,
          `--pitch=${profile.pitch}`,
          "--text", text,
          "--write-media", outputPath,
        ],
        { timeout: 45_000, killSignal: "SIGTERM" },
      );
      await wait(600);
      return;
    } catch (error) {
      lastError = error;
      await rm(outputPath, { force: true });
      if (attempt < 8) await wait(Math.min(15_000, attempt * 2_000));
    }
  }
  throw lastError;
}

function getClips() {
  const clips = [
    { id: "prologue", text: PROLOGUE_NARRATION, source: "世界序章", role: "fate" },
    ...MARTIAL_SOULS.map((martialSoul) => ({
      id: `opening-${martialSoul.id}`,
      text: buildOpeningNarration(martialSoul),
      source: `${martialSoul.name}开局`,
      role: "fate",
    })),
    {
      id: "timeline-restart",
      text: "熟悉的雨再次落在诺丁城。你不记得上一条时间线的所有细节，却知道这一次，每个选择都可能把大陆带向不同未来。",
      source: "重新开启剧情时间线",
      role: "fate",
    },
  ];

  for (const currentNode of Object.values(storyNodes).filter((node) => !node.id.startsWith("canon_"))) {
    for (const choice of currentNode.choices) {
      const nextNode = storyNodes[choice.nextId];
      const bridge = nextNode ? buildSceneBridge(currentNode, nextNode) : "";
      clips.push({
        id: `story-${currentNode.id}-${choice.id}`,
        text: `${choice.outcome}${bridge ? ` ${bridge}` : ""}`,
        source: `${currentNode.title} · ${choice.label}`,
        role: getStoryNarratorRole(currentNode, nextNode),
      });
    }
  }
  for (const canonNode of Object.values(storyNodes).filter((node) => node.id.startsWith("canon_") && node.intro)) {
    clips.push({
      id: `canon-scene-${canonNode.id}`,
      text: buildStaticCanonNarration(canonNode),
      source: `原著同行 · ${canonNode.chapter} · ${canonNode.title}`,
      role: fateCanonNodeIds.has(canonNode.id) ? "fate" : "story",
    });
  }
  return clips;
}

async function renderClip(clip, temporaryDirectory, stagedOutputDirectory, existingClips) {
  const rawVoicePath = path.join(temporaryDirectory, `${clip.id}-raw.mp3`);
  const mp3Path = path.join(stagedOutputDirectory, `${clip.id}.mp3`);
  const profile = voiceProfiles[clip.role];
  const existing = existingClips.get(clip.id);
  const existingPath = path.join(outputDirectory, `${clip.id}.mp3`);
  if (
    existing?.text === clip.text
    && existing?.role === clip.role
    && existing?.voice === profile.voice
    && existing?.mix === "纯人声轻母带；游戏场景 BGM 独立动态压低"
  ) {
    try {
      await access(existingPath);
      await copyFile(existingPath, mp3Path);
      return { ...clip, file: `${clip.id}.mp3`, voice: profile.voice, mix: existing.mix };
    } catch {
      // 资源缺失时重新生成当前段落。
    }
  }
  await synthesizeVoice(profile, clip.text, rawVoicePath);
  await run("/opt/homebrew/bin/ffmpeg", [
    "-loglevel", "error", "-y", "-i", rawVoicePath,
    "-af", voiceMasteringFilter,
    "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "64k", mp3Path,
  ]);
  return {
    ...clip,
    file: `${clip.id}.mp3`,
    voice: profile.voice,
    mix: "纯人声轻母带；游戏场景 BGM 独立动态压低",
  };
}

async function main() {
  try {
    await run(edgeTtsCommand, ["--version"]);
  } catch {
    throw new Error("未找到 edge-tts。请先运行 `pipx install edge-tts`，或通过 EDGE_TTS_BIN 指定可执行文件。");
  }
  const clips = getClips();
  const ids = new Set(clips.map((clip) => clip.id));
  if (ids.size !== clips.length) throw new Error("旁白 ID 存在重复");
  await mkdir(outputDirectory, { recursive: true });
  let existingClips = new Map();
  try {
    const existingManifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
    if (existingManifest.version === 3 && Array.isArray(existingManifest.clips)) {
      existingClips = new Map(existingManifest.clips.map((clip) => [clip.id, clip]));
    }
  } catch {
    existingClips = new Map();
  }
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "douluo-narration-"));
  const stagedOutputDirectory = path.join(temporaryDirectory, "final");
  await mkdir(stagedOutputDirectory, { recursive: true });
  const rendered = new Array(clips.length);
  let cursor = 0;

  try {
    const workerCount = Math.max(1, Math.min(3, Number(process.env.NARRATION_WORKERS) || 2));
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < clips.length) {
        const index = cursor;
        cursor += 1;
        rendered[index] = await renderClip(clips[index], temporaryDirectory, stagedOutputDirectory, existingClips);
        process.stdout.write(`\r已生成 ${rendered.filter(Boolean).length}/${clips.length} 段旁白`);
      }
    });
    await Promise.all(workers);
    const manifest = {
      version: 3,
      voices: voiceProfiles,
      format: "MP3 44.1kHz mono 64kbps",
      mastering: "纯人声：低频清理、轻动态压缩、极轻空间感、响度统一",
      bgmStrategy: "旁白不内置 BGM；游戏连续场景 BGM 在旁白期间动态压低 9dB",
      clips: rendered,
    };
    await writeFile(path.join(stagedOutputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    for (const clip of rendered) {
      await rename(path.join(stagedOutputDirectory, clip.file), path.join(outputDirectory, clip.file));
    }
    await rename(path.join(stagedOutputDirectory, "manifest.json"), path.join(outputDirectory, "manifest.json"));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  console.log(`\n旁白生成完成：${clips.length} 段。`);
}

main().catch((error) => {
  console.error(`旁白生成失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
