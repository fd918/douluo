import { useEffect, useState } from "react";

const MOBILE_VIEWPORT_QUERY = "(max-width: 767px)";
const COARSE_POINTER_QUERY = "(hover: none) and (pointer: coarse)";

function readNativePresentation() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") return false;
  if (params.get("native") === "1") return true;
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
    || window.matchMedia(COARSE_POINTER_QUERY).matches;
}

export function useNativePresentation() {
  const [native, setNative] = useState(readNativePresentation);

  useEffect(() => {
    const viewport = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const pointer = window.matchMedia(COARSE_POINTER_QUERY);
    const update = () => setNative(readNativePresentation());
    viewport.addEventListener("change", update);
    pointer.addEventListener("change", update);
    window.addEventListener("popstate", update);
    return () => {
      viewport.removeEventListener("change", update);
      pointer.removeEventListener("change", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return native;
}
