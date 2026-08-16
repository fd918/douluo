#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const aiCore = path.join(root, "worker", "ai-core.js");
const hosting = path.join(root, ".openai", "hosting.json");
const aiBudgetMigration = path.join(root, "drizzle", "0001_ai_request_budgets.sql");

for (const file of [index, worker, aiCore, hosting, aiBudgetMigration]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
mkdirSync(path.join(dist, ".openai", "drizzle"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(aiCore, path.join(dist, "server", "ai-core.js"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));
copyFileSync(aiBudgetMigration, path.join(dist, ".openai", "drizzle", "0001_ai_request_budgets.sql"));

console.log("Prepared Sites build: Worker, hosting config and D1 migration");
