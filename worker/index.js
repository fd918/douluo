import { handleAiRequest } from "./ai-core.js";

const CORS_ORIGINS = new Set(["https://fd918.github.io"]);

function withCors(response, request) {
  const origin = request.headers.get("origin");
  if (!origin || !CORS_ORIGINS.has(origin)) return response;
  const corsResponse = new Response(response.body, response);
  corsResponse.headers.set("access-control-allow-origin", origin);
  corsResponse.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  corsResponse.headers.set("access-control-allow-headers", "content-type");
  corsResponse.headers.append("vary", "Origin");
  return corsResponse;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/ai/")) {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request);
      }
      return withCors(await handleAiRequest(request, env), request);
    }

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
