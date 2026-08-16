import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnv(pathname) {
  if (!existsSync(pathname)) return {};
  const output = {};
  for (const line of readFileSync(pathname, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    output[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return output;
}

export function loadCloudConfig(root) {
  const file = parseEnv(resolve(root, ".env.local"));
  const baseUrl = (process.env.OPS_CLOUD_URL || file.OPS_CLOUD_URL || "").replace(/\/+$/, "");
  const adminToken = process.env.OPS_CLOUD_ADMIN_TOKEN || file.OPS_CLOUD_ADMIN_TOKEN || "";
  return { baseUrl, adminToken, configured: Boolean(baseUrl && adminToken) };
}

function cloudPath(pathname) {
  const mappings = [
    ["/api/health", "/api/ops/health"],
    ["/api/overview", "/api/ops/overview"],
    ["/api/providers", "/api/ops/providers"],
    ["/api/settings", "/api/ops/settings"],
    ["/api/logs", "/api/ops/logs"],
  ];
  for (const [local, cloud] of mappings) {
    if (pathname === local || pathname.startsWith(`${local}/`)) return `${cloud}${pathname.slice(local.length)}`;
  }
  return null;
}

export function isCloudManagementRequest(pathname) {
  return Boolean(cloudPath(pathname));
}

export async function proxyCloudManagement(request, response, url, config) {
  const pathname = cloudPath(url.pathname);
  if (!pathname || !config.configured) return false;
  const chunks = [];
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    for await (const chunk of request) chunks.push(chunk);
  }
  const headers = {
    authorization: `Bearer ${config.adminToken}`,
    accept: "application/json",
  };
  if (chunks.length) headers["content-type"] = request.headers["content-type"] || "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const cloudResponse = await fetch(`${config.baseUrl}${pathname}${url.search}`, {
      method: request.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      signal: controller.signal,
    });
    const body = Buffer.from(await cloudResponse.arrayBuffer());
    response.writeHead(cloudResponse.status, {
      "content-type": cloudResponse.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(body);
    return true;
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: false, error: `无法连接公网控制层：${error?.message || "网络异常"}`, code: "OPS_CLOUD_UNREACHABLE" }));
    return true;
  } finally {
    clearTimeout(timer);
  }
}
