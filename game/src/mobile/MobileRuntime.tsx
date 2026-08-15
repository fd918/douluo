import { useEffect, type PropsWithChildren } from "react";
import { MobileDeviceProvider, useMobileDevice } from "./Device";
import { KeyboardDock, KeyboardProvider, useKeyboard } from "./Keyboard";
import { PhoneFrame } from "./PhoneFrame";
import { HomeIndicator, StatusBar } from "./components";
import { useNativePresentation } from "./useNativePresentation";

export function MobileRuntime({ children }: PropsWithChildren) {
  const nativePresentation = useNativePresentation();

  return (
    <MobileDeviceProvider>
      <PhoneFrame nativePresentation={nativePresentation}>
        <KeyboardProvider simulated={!nativePresentation}>
          <KeyboardPreview />
          {nativePresentation ? null : <StatusBar />}
          <MobileAppViewport nativePresentation={nativePresentation}>{children}</MobileAppViewport>
          {nativePresentation ? null : <HomeIndicator />}
          {nativePresentation ? null : <KeyboardDock />}
        </KeyboardProvider>
      </PhoneFrame>
    </MobileDeviceProvider>
  );
}

function MobileAppViewport({
  children,
  nativePresentation,
}: PropsWithChildren<{ nativePresentation: boolean }>) {
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();

  return (
    <div
      className="mobile-app-viewport"
      data-keyboard-visible={keyboard.visible ? "true" : "false"}
      data-platform={device.platform}
      data-presentation={nativePresentation ? "native" : "preview"}
      data-testid="mobile-app-viewport"
    >
      {children}
    </div>
  );
}

function KeyboardPreview() {
  const keyboard = useKeyboard();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("keyboard") === "1") {
      keyboard.show();
    }
  }, [keyboard]);

  return null;
}
