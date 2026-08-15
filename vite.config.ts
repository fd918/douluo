import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { aiDevApiPlugin } from "./server/vite-ai-plugin";

export default defineConfig(({ mode }) => {
  const aiEnvironment = loadEnv(mode, ".", "AI_");
  const githubPages = process.env.GITHUB_PAGES === "1";
  return {
    base: githubPages ? "/douluo/" : "/",
    build: {
      outDir: githubPages ? "dist/pages" : "dist/client",
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
    },
    plugins: [react(), aiDevApiPlugin(aiEnvironment)],
  };
});
