import { useCallback, useEffect, useRef, useState } from "react";
import { createDynamicMusicController, type DynamicMusicController } from "./index";

type MusicContext = {
  stage: "welcome" | "creation" | "game";
  activeTab: "story" | "world" | "relations" | "bag" | "archive";
  location: string;
  chapter: string;
  inCombat: boolean;
};

function getScene(location: string) {
  if (location.includes("海神岛")) return "sea_god_island";
  if (location.includes("星斗")) return "star_dou_forest";
  if (location.includes("镜林")) return "shrek_mirror_forest";
  if (location.includes("史莱克")) return "shrek_academy";
  if (location.includes("斗魂场")) return "soul_arena";
  if (location.includes("地下")) return "underground_lab";
  if (location.includes("旧井")) return "old_well";
  return "notting_city";
}

function getMood(context: MusicContext) {
  if (context.inCombat) return { mood: "battle", intensity: 3 as const };
  if (context.activeTab === "relations") return { mood: "warm", intensity: 1 as const };
  if (context.activeTab === "archive") return { mood: "memory", intensity: 1 as const };
  if (context.activeTab === "world") return { mood: "exploration", intensity: 1 as const };
  if (context.chapter.includes("终章")) return { mood: "solemn", intensity: 2 as const };
  if (context.chapter.includes("第四章")) return { mood: "tension", intensity: 2 as const };
  if (context.location.includes("旧井") || context.location.includes("地下")) {
    return { mood: "mystery", intensity: 2 as const };
  }
  if (context.location.includes("史莱克") || context.location.includes("镜林")) {
    return { mood: "training", intensity: 2 as const };
  }
  return { mood: "daily", intensity: 1 as const };
}

export function useDynamicGameMusic(context: MusicContext) {
  const controllerRef = useRef<DynamicMusicController | null>(null);
  const contextRef = useRef(context);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);

  contextRef.current = context;

  useEffect(() => {
    let disposed = false;
    let detachUnlock: () => void = () => undefined;
    void createDynamicMusicController()
      .then((controller) => {
        if (disposed) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        detachUnlock = controller.attachAutoUnlock();
        const settings = controller.getSettings();
        setMuted(settings.muted);
        setReady(true);
        const current = contextRef.current;
        const mood = getMood(current);
        return controller.setState({ scene: getScene(current.location), ...mood });
      })
      .catch(() => setReady(false));
    return () => {
      disposed = true;
      detachUnlock();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const mood = getMood(context);
    void controller.setState({ scene: getScene(context.location), ...mood });
  }, [context.activeTab, context.chapter, context.inCombat, context.location, context.stage]);

  const toggleMuted = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (!controller.getSnapshot().unlocked) await controller.unlock();
    const nextMuted = !controller.getSettings().muted;
    controller.setMuted(nextMuted);
    setMuted(nextMuted);
  }, []);

  const playEvent = useCallback((event: string) => {
    void controllerRef.current?.playEvent(event);
  }, []);

  return { muted, ready, toggleMuted, playEvent };
}
