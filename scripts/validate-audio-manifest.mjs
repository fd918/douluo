import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(scriptDirectory, "..");
const audioRoot = path.join(gameRoot, "public", "audio", "douluo");
const manifestPath = path.join(audioRoot, "music_manifest.json");
const narrationRoot = path.join(audioRoot, "narration");
const narrationManifestPath = path.join(narrationRoot, "manifest.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function main() {
  await access(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert(Array.isArray(manifest.cues), "manifest.cues 必须是数组");

  const ids = new Set();
  let loopCount = 0;
  let stingerCount = 0;

  for (const [index, cue] of manifest.cues.entries()) {
    const label = `第 ${index + 1} 条音乐`;
    assert(isNonEmptyString(cue.id), `${label}缺少 id`);
    assert(!ids.has(cue.id), `音乐 ID 重复：${cue.id}`);
    ids.add(cue.id);

    assert(cue.type === "loop" || cue.type === "stinger", `${cue.id} 的 type 无效`);
    assert(isNonEmptyString(cue.file), `${cue.id} 缺少 file`);
    assert(!path.isAbsolute(cue.file), `${cue.id} 的 file 不能是绝对路径`);
    assert(!cue.file.split(/[\\/]/).includes(".."), `${cue.id} 的 file 不能越出音频目录`);
    const extension = path.extname(cue.file).toLowerCase();
    assert(
      cue.type === "loop" ? extension === ".ogg" : [".ogg", ".wav"].includes(extension),
      `${cue.id} 的音频格式无效`,
    );

    const resolvedFile = path.resolve(audioRoot, cue.file);
    assert(resolvedFile.startsWith(`${audioRoot}${path.sep}`), `${cue.id} 的文件路径无效`);
    await access(resolvedFile);
    const fileStats = await stat(resolvedFile);
    assert(fileStats.isFile() && fileStats.size > 0, `${cue.id} 引用的音频文件为空或无效`);

    assert(Number.isFinite(cue.duration_seconds) && cue.duration_seconds > 0, `${cue.id} 的时长无效`);
    assert(Number.isFinite(cue.priority), `${cue.id} 的优先级无效`);

    if (cue.type === "loop") {
      loopCount += 1;
      assert(Array.isArray(cue.tags) && cue.tags.length > 0, `${cue.id} 缺少场景标签`);
      assert(Number.isFinite(cue.loop_start_seconds) && cue.loop_start_seconds >= 0, `${cue.id} 的循环起点无效`);
      assert(
        Number.isFinite(cue.loop_end_seconds) && cue.loop_end_seconds > cue.loop_start_seconds,
        `${cue.id} 的循环终点无效`,
      );
      assert(cue.loop_end_seconds <= cue.duration_seconds + 0.05, `${cue.id} 的循环终点超出音频时长`);
    } else {
      stingerCount += 1;
      assert(Array.isArray(cue.events) && cue.events.length > 0, `${cue.id} 缺少事件映射`);
      assert(Number.isFinite(cue.duck_bgm_db) && cue.duck_bgm_db <= 0, `${cue.id} 的背景压低值无效`);
      assert(typeof cue.resume_previous_bgm === "boolean", `${cue.id} 缺少恢复背景音乐设置`);
    }
  }

  assert(loopCount === 8, `循环 BGM 数量应为 8，实际为 ${loopCount}`);
  assert(stingerCount === 7, `短音效数量应为 7，实际为 ${stingerCount}`);
  assert(ids.size === 15, `音乐总数应为 15，实际为 ${ids.size}`);

  await access(narrationManifestPath);
  const narrationManifest = JSON.parse(await readFile(narrationManifestPath, "utf8"));
  assert(narrationManifest.version === 3, "narration manifest 必须使用双男声版本 3");
  assert(narrationManifest.voices?.story?.voice === "zh-CN-YunxiNeural", "主旁白必须使用云希音色");
  assert(narrationManifest.voices?.fate?.voice === "zh-CN-YunjianNeural", "命运之声必须使用云健音色");
  assert(isNonEmptyString(narrationManifest.mastering), "沉浸旁白缺少人声母带说明");
  assert(isNonEmptyString(narrationManifest.bgmStrategy) && narrationManifest.bgmStrategy.includes("不内置 BGM"), "旁白必须与游戏 BGM 分轨");
  assert(Array.isArray(narrationManifest.clips), "narration manifest.clips 必须是数组");
  const narrationIds = new Set();
  const narrationRoles = { story: 0, fate: 0 };
  for (const [index, clip] of narrationManifest.clips.entries()) {
    const label = `第 ${index + 1} 段旁白`;
    assert(isNonEmptyString(clip.id), `${label}缺少 id`);
    assert(!narrationIds.has(clip.id), `旁白 ID 重复：${clip.id}`);
    narrationIds.add(clip.id);
    assert(isNonEmptyString(clip.text), `${clip.id} 缺少朗读文本`);
    assert(isNonEmptyString(clip.source), `${clip.id} 缺少剧情来源`);
    assert(isNonEmptyString(clip.mix), `${clip.id} 缺少声音混合方式`);
    assert(clip.role === "story" || clip.role === "fate", `${clip.id} 的旁白角色无效`);
    narrationRoles[clip.role] += 1;
    assert(clip.voice === narrationManifest.voices[clip.role].voice, `${clip.id} 的音色与旁白角色不一致`);
    assert(clip.file === `${clip.id}.mp3`, `${clip.id} 的文件名与 ID 不一致`);
    const resolvedFile = path.resolve(narrationRoot, clip.file);
    assert(resolvedFile.startsWith(`${narrationRoot}${path.sep}`), `${clip.id} 的文件路径无效`);
    await access(resolvedFile);
    const fileStats = await stat(resolvedFile);
    assert(fileStats.isFile() && fileStats.size > 1000, `${clip.id} 的 MP3 文件为空或无效`);
  }
  assert(narrationIds.has("prologue"), "旁白包缺少世界序章");
  const prologue = narrationManifest.clips.find((clip) => clip.id === "prologue");
  assert(prologue?.role === "fate", "世界序章必须使用命运之声");
  assert(narrationRoles.story > narrationRoles.fate, "主旁白段落数量必须多于命运之声");
  assert(narrationRoles.fate >= 24 && narrationRoles.fate <= 60, `命运之声数量应保持克制，实际为 ${narrationRoles.fate}`);
  assert(narrationIds.has("timeline-restart"), "旁白包缺少时间线重启内容");
  const canonNarrationIds = [...narrationIds].filter((id) => id.startsWith("canon-scene-canon_"));
  assert(canonNarrationIds.length >= 180, `原著同行固定旁白至少需要 180 段，实际为 ${canonNarrationIds.length}`);
  for (const requiredId of [
    "canon-scene-canon_awakening_morning",
    "canon-scene-canon_ring_choice",
    "canon-scene-canon_xiaowu_exposed",
    "canon-scene-canon_final_war",
    "canon-scene-canon_crossroads",
  ]) assert(narrationIds.has(requiredId), `旁白包缺少关键原著同行场景：${requiredId}`);
  assert(narrationIds.size >= 280, `旁白总数至少应为 280，实际为 ${narrationIds.size}`);

  console.log(`斗罗音频 manifest 校验通过：${loopCount} 条循环 BGM、${stingerCount} 条短音效、${narrationRoles.story} 段云希主旁白、${narrationRoles.fate} 段云健命运之声。`);
}

main().catch((error) => {
  console.error(`音频 manifest 校验失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
