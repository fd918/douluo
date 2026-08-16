#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const aiCore = path.join(root, "worker", "ai-core.js");
const aiOpsCloud = path.join(root, "worker", "ai-ops-cloud.js");
const hosting = path.join(root, ".openai", "hosting.json");
const migrationsDir = path.join(root, "drizzle");
const migrationFiles = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

for (const file of [index, worker, aiCore, aiOpsCloud, hosting, ...migrationFiles.map((file) => path.join(migrationsDir, file))]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
mkdirSync(path.join(dist, ".openai", "drizzle"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(aiCore, path.join(dist, "server", "ai-core.js"));
copyFileSync(aiOpsCloud, path.join(dist, "server", "ai-ops-cloud.js"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));
for (const file of migrationFiles) {
  copyFileSync(path.join(migrationsDir, file), path.join(dist, ".openai", "drizzle", file));
}

console.log(`Prepared Sites build: Worker, hosting config and ${migrationFiles.length} D1 migrations`);
