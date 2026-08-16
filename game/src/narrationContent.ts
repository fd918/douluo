import { publicAssetUrl } from "./publicAsset";
export { PROLOGUE_NARRATION, PROLOGUE_PARAGRAPHS, buildOpeningNarration } from "./narrationText";

export function narrationClipUrl(clipId: string | null | undefined) {
  return clipId ? publicAssetUrl(`audio/douluo/narration/${clipId}.mp3`) : null;
}
