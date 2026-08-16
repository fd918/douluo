import { useCallback, useEffect, useRef, useState } from "react";

const NARRATION_STORAGE_KEY = "douluo.narration.settings.v1";

export type NarrationStatus = "idle" | "speaking" | "paused" | "unavailable";
export type NarrationEngine = "recorded" | "system" | "none";

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
  const systemSupported = typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
  const recordedSupported = typeof window !== "undefined" && typeof Audio !== "undefined";
  const supported = recordedSupported || systemSupported;
  const [enabled, setEnabled] = useState(loadNarrationEnabled);
  const [status, setStatus] = useState<NarrationStatus>(supported ? "idle" : "unavailable");
  const [engine, setEngine] = useState<NarrationEngine>("none");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentTextRef = useRef("");
  const currentClipUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  const stopPlayback = useCallback((nextStatus: NarrationStatus = "idle") => {
    generationRef.current += 1;
    if (systemSupported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setStatus(nextStatus);
  }, [systemSupported]);

  const stop = useCallback(() => {
    stopPlayback(supported ? "idle" : "unavailable");
  }, [stopPlayback, supported]);

  const speakSystem = useCallback((text: string, generation: number) => {
    if (!systemSupported) {
      setEngine("none");
      setStatus("unavailable");
      return false;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
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
      setStatus("unavailable");
    };

    utteranceRef.current = utterance;
    setEngine("system");
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    return true;
  }, [systemSupported]);

  const playRecorded = useCallback((clipUrl: string, text: string, generation: number) => {
    if (!recordedSupported) return speakSystem(text, generation);

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.preload = "auto";
    audio.onplaying = () => {
      if (generationRef.current === generation) setStatus("speaking");
    };
    audio.onended = () => {
      if (generationRef.current === generation) setStatus("idle");
    };
    audio.onerror = () => {
      if (generationRef.current === generation) speakSystem(text, generation);
    };
    audio.src = clipUrl;
    audio.currentTime = 0;
    setEngine("recorded");
    setStatus("speaking");
    void audio.play().catch(() => {
      if (generationRef.current === generation) speakSystem(text, generation);
    });
    return true;
  }, [recordedSupported, speakSystem]);

  const speakRaw = useCallback((text: string, clipUrl: string | null) => {
    const normalized = normalizeNarrationText(text);
    if (!normalized) return false;

    stopPlayback("idle");
    const generation = generationRef.current;
    if (clipUrl) return playRecorded(clipUrl, normalized, generation);
    return speakSystem(normalized, generation);
  }, [playRecorded, speakSystem, stopPlayback]);

  const speak = useCallback((text: string, clipUrl?: string | null) => {
    currentTextRef.current = normalizeNarrationText(text);
    currentClipUrlRef.current = clipUrl ?? null;
    if (!enabled) return false;
    return speakRaw(currentTextRef.current, currentClipUrlRef.current);
  }, [enabled, speakRaw]);

  const replay = useCallback(() => {
    if (!enabled || !currentTextRef.current) return false;
    return speakRaw(currentTextRef.current, currentClipUrlRef.current);
  }, [enabled, speakRaw]);

  const pauseOrResume = useCallback(() => {
    if (!enabled) return;
    if (engine === "recorded" && audioRef.current) {
      if (audioRef.current.paused) {
        void audioRef.current.play().then(() => setStatus("speaking")).catch(() => setStatus("unavailable"));
      } else {
        audioRef.current.pause();
        setStatus("paused");
      }
      return;
    }
    if (engine === "system" && systemSupported) {
      if (window.speechSynthesis.paused || status === "paused") {
        window.speechSynthesis.resume();
        setStatus("speaking");
      } else if (window.speechSynthesis.speaking || status === "speaking") {
        window.speechSynthesis.pause();
        setStatus("paused");
      }
    }
  }, [enabled, engine, status, systemSupported]);

  const toggleEnabled = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    try {
      window.localStorage.setItem(NARRATION_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // 存储不可用时继续保留当前会话设置。
    }
    if (!next) {
      stopPlayback("idle");
    } else if (currentTextRef.current) {
      speakRaw(currentTextRef.current, currentClipUrlRef.current);
    }
  }, [enabled, speakRaw, stopPlayback]);

  useEffect(() => () => {
    if (systemSupported) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
  }, [systemSupported]);

  return {
    currentSupported: systemSupported || Boolean(currentClipUrlRef.current),
    enabled,
    engine,
    hasRecordedClip: Boolean(currentClipUrlRef.current),
    pauseOrResume,
    replay,
    speak,
    status,
    stop,
    supported,
    systemSupported,
    toggleEnabled,
  };
}
