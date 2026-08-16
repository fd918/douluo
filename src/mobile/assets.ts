import { publicAssetUrl } from "../publicAsset";

export const mobileAssets = {
  iphoneBezel: publicAssetUrl("assets/iphone/Bezel.png"),
  iphoneKeyboard: publicAssetUrl("assets/iphone/Keyboard.png"),
  androidKeyboard: publicAssetUrl("assets/android/Keyboard.png"),
  pixel10Bezel: publicAssetUrl("assets/android/Pixel10.png"),
} as const;
