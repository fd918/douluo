import { useCallback, useEffect, useRef, useState } from "react";

const NARRATION_STORAGE_KEY = "douluo.narration.settings.v1";

export type NarrationStatus = "idle" | "speaking" | "paused" | "unavailable";

function loadNarrationEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(NARRATION_STORAGE_KEY);
    return stored === null ? true : stored !== "off";
  } catch {
    return true;
  }
}

function selectChineseVoice(voices: SpeechSynthesisVoice[]) {
  const chineseVoices = voices.filter((voice) => /^zh(?:-|_)/i.test(voice.lang));
  return chineseVoices.find((voice) => /zh-CN/i.test(voice.lang) && voice.localService)
    ?? chineseVoices.find((voice) => /zh-CN/i.test(voice.lang))
    ?? chineseVoices.find((voice) => voice.localService)
    ?? chineseVoices[0]
    ?? null;
}

function normalizeNarrationText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function useNarration() {
  const supported = typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
  const [enabled, setEnabled] = useState(loadNarrationEnabled);
  const [status, setStatus] = useState<NarrationStatus>(supported ? "idle" : "unavailable");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentTextRef = useRef("");
  const generationRef = useRef(0);

  const stop = useCallback(() => {
    if (!supported) return;
    generationRef.current += 1;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setStatus("idle");
  }, [supported]);

  const speakRaw = useCallback((text: string) => {
    const normalized = normalizeNarrationText(text);
    if (!supported || !normalized) return false;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(normalized);
    const voice = selectChineseVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "zh-CN";
    utterance.rate = 0.9;
    utterance.pitch = 0.94;
    utterance.volume = 1;
    utterance.onstart = () => {
      if (generationRef.current === generation) setStatus("speaking");
    };
    utterance.onend = () => {
      if (generationRef.current === generation) {
        utteranceRef.current = null;
        setStatus("idle");
      }
    };
    utterance.onerror = (event) => {
      if (generationRef.current !== generation || event.error === "canceled" || event.error === "interrupted") return;
      utteranceRef.current = null;
      setStatus("idle");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    return true;
  }, [supported]);

  const speak = useCallback((text: string) => {
    currentTextRef.current = normalizeNarrationText(text);
    if (!enabled) return false;
    return speakRaw(currentTextRef.current);
  }, [enabled, speakRaw]);

  const replay = useCallback(() => {
    if (!enabled || !currentTextRef.current) return false;
    return speakRaw(currentTextRef.current);
  }, [enabled, speakRaw]);

  const pauseOrResume = useCallback(() => {
    if (!supported || !enabled) return;
    if (window.speechSynthesis.paused || status === "paused") {
      window.speechSynthesis.resume();
      setStatus("speaking");
      return;
    }
    if (window.speechSynthesis.speaking || status === "speaking") {
      window.speechSynthesis.pause();
      setStatus("paused");
    }
  }, [enabled, status, supported]);

  const toggleEnabled = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(NARRATION_STORAGE_KEY, next ? "on" : "off");
      } catch {
        // 存储不可用时继续保留当前会话设置。
      }
      if (!next) {
        generationRef.current += 1;
        window.speechSynthesis.cancel();
        utteranceRef.current = null;
        setStatus("idle");
      } else if (currentTextRef.current) {
        window.setTimeout(() => speakRaw(currentTextRef.current), 0);
      }
      return next;
    });
  }, [speakRaw]);

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return {
    enabled,
    pauseOrResume,
    replay,
    speak,
    status,
    stop,
    supported,
    toggleEnabled,
  };
}
