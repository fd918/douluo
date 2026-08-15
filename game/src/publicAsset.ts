const baseUrl = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function publicAssetUrl(path: string) {
  if (/^(?:https?:|data:|blob:)/.test(path)) return path;
  return `${baseUrl}${path.replace(/^\/+/, "")}`;
}
