import { publicAssetUrl } from "./publicAsset.ts";
export {
  PROLOGUE_NARRATION,
  PROLOGUE_PARAGRAPHS,
  buildOpeningNarration,
  canonSceneNarrationClipId,
} from "./narrationText.ts";

export function narrationClipUrl(clipId: string | null | undefined) {
  return clipId ? publicAssetUrl(`audio/douluo/narration/${clipId}.mp3`) : null;
}
