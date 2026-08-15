import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleAiRequest } from "../worker/ai-core.js";

type AiEnvironment = Record<string, string>;

function readBody(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
async function forwardResponse(response: Response, outgoing: ServerResponse) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => outgoing.setHeader(key, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

export function aiDevApiPlugin(env: AiEnvironment): Plugin {
  return {
    name: "douluo-ai-dev-api",
    configureServer(server) {
      server.middlewares.use(async (incoming, outgoing, next) => {
        const pathname = new URL(incoming.url ?? "/", "http://localhost").pathname;
        if (!pathname.startsWith("/api/ai/")) {
          next();
          return;
        }

        try {
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
            else if (value !== undefined) headers.set(key, value);
          }
          const method = incoming.method ?? "GET";
          const body = method === "GET" || method === "HEAD" ? undefined : await readBody(incoming);
          const request = new Request(`http://localhost${incoming.url ?? "/"}`, {
            method,
            headers,
            body,
          });
          await forwardResponse(await handleAiRequest(request, env), outgoing);
        } catch {
          outgoing.statusCode = 500;
          outgoing.setHeader("content-type", "application/json; charset=utf-8");
          outgoing.end(JSON.stringify({ error: "本地 AI 代理执行失败" }));
        }
      });
    },
  };
}
