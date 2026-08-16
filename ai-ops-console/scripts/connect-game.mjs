import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const gameEnv = resolve(root, "../game/.env.local");
const backupEnv = resolve(root, "../game/.env.aiops-backup.local");
const disconnect = process.argv.includes("--restore");

if (disconnect) {
  if (!existsSync(backupEnv)) throw new Error("没有找到可恢复的游戏 AI 配置备份");
  copyFileSync(backupEnv, gameEnv);
  console.log("已恢复游戏原 AI 配置；重启游戏开发服务后生效。");
  process.exit(0);
}

if (!existsSync(gameEnv)) throw new Error("没有找到 game/.env.local，无法自动接管游戏 AI 请求");
if (!existsSync(backupEnv)) copyFileSync(gameEnv, backupEnv);

const managedKeys = new Set([
  "AI_BASE_URL", "AI_MODEL_ID", "AI_API_KEY", "AI_REQUEST_TIMEOUT_MS",
  "AI_FALLBACK_BASE_URL", "AI_FALLBACK_MODEL_ID", "AI_FALLBACK_API_KEY", "AI_FALLBACK_REQUEST_TIMEOUT_MS",
]);
const preserved = readFileSync(gameEnv, "utf8").split(/\r?\n/).filter((line) => {
  const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
  return !key || !managedKeys.has(key);
});
const managed = [
  "",
  "# 本机 AI 运营中台统一网关（由 scripts/connect-game.mjs 管理）",
  "AI_BASE_URL=http://127.0.0.1:4180/v1",
  "AI_MODEL_ID=ops-router",
  "AI_API_KEY=local-ops-router",
  "AI_REQUEST_TIMEOUT_MS=120000",
  "AI_FALLBACK_BASE_URL=",
  "AI_FALLBACK_MODEL_ID=",
  "AI_FALLBACK_API_KEY=",
  "AI_FALLBACK_REQUEST_TIMEOUT_MS=30000",
  "",
];
writeFileSync(gameEnv, `${preserved.join("\n").trimEnd()}${managed.join("\n")}`, { mode: 0o600 });
console.log("斗罗游戏已切换为使用本机 AI 运营中台；重启游戏开发服务后生效。");
