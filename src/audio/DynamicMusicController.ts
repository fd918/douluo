import type {
  AudioSettings,
  DynamicMusicControllerOptions,
  DynamicMusicSnapshot,
  DynamicMusicState,
  LoopMusicCue,
  MusicManifest,
  SetMusicStateOptions,
  StingerMusicCue,
} from "./types";
import { publicAssetUrl } from "../publicAsset";

const DEFAULT_MANIFEST_URL = publicAssetUrl("audio/douluo/music_manifest.json");
const DEFAULT_ASSET_BASE_URL = publicAssetUrl("audio/douluo/");
const DEFAULT_STORAGE_KEY = "douluo.audio.settings.v1";
const DEFAULT_STATE_DEBOUNCE_MS = 3_000;
const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  masterVolume: 0.8,
  bgmVolume: 0.65,
};

const SCENE_CUE_MAP: Record<string, string> = {
  notting_city: "bgm_notting_daily",
  notting_academy: "bgm_notting_daily",
  academy: "bgm_academy_bond",
  shrek_academy: "bgm_shrek_training",
  shrek_mirror_forest: "bgm_shrek_training",
  star_dou_forest: "bgm_star_dou_forest",
  wilderness: "bgm_star_dou_forest",
  soul_arena: "bgm_soul_battle",
  underground_lab: "bgm_blue_silver_mystery",
  old_well: "bgm_blue_silver_mystery",
  sea_god_island: "bgm_distant_sea",
};

const MOOD_CUE_MAP: Record<string, string> = {
  daily: "bgm_notting_daily",
  mystery: "bgm_blue_silver_mystery",
  mysterious: "bgm_blue_silver_mystery",
  training: "bgm_shrek_training",
  exploration: "bgm_star_dou_forest",
  tension: "bgm_tension",
  danger: "bgm_tension",
  pursuit: "bgm_tension",
  prebattle: "bgm_tension",
  battle: "bgm_soul_battle",
  combat: "bgm_soul_battle",
  solemn: "bgm_distant_sea",
  warm: "bgm_academy_bond",
  bond: "bgm_academy_bond",
  family: "bgm_academy_bond",
  memory: "bgm_academy_bond",
};

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function decibelsToGain(decibels: number) {
  return Math.pow(10, decibels / 20);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isLoopCue(cue: MusicManifest["cues"][number]): cue is LoopMusicCue {
  return cue.type === "loop";
}

function isStingerCue(cue: MusicManifest["cues"][number]): cue is StingerMusicCue {
  return cue.type === "stinger";
}

function validateManifest(manifest: MusicManifest) {
  if (!manifest || !Array.isArray(manifest.cues) || manifest.cues.length === 0) {
    throw new Error("动态音乐 manifest 缺少 cues 列表");
  }
  const ids = new Set<string>();
  for (const cue of manifest.cues) {
    if (!cue.id || !cue.file || (cue.type !== "loop" && cue.type !== "stinger")) {
      throw new Error("动态音乐 manifest 包含无效音乐项");
    }
    if (ids.has(cue.id)) throw new Error(`动态音乐 ID 重复：${cue.id}`);
    ids.add(cue.id);
  }
}

function loadSettings(storageKey: string, initial?: Partial<AudioSettings>): AudioSettings {
  let stored: Partial<AudioSettings> = {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) stored = JSON.parse(raw) as Partial<AudioSettings>;
  } catch {
    stored = {};
  }
  const merged = { ...DEFAULT_SETTINGS, ...initial, ...stored };
  return {
    muted: Boolean(merged.muted),
    masterVolume: clampVolume(merged.masterVolume),
    bgmVolume: clampVolume(merged.bgmVolume),
  };
}

export class DynamicMusicController {
  readonly manifest: MusicManifest;

  private readonly loops: LoopMusicCue[];
  private readonly stingers: StingerMusicCue[];
  private readonly options: Required<Pick<DynamicMusicControllerOptions, "assetBaseUrl" | "storageKey" | "stateDebounceMs">> &
    Pick<DynamicMusicControllerOptions, "onError">;
  private settings: AudioSettings;
  private bgmChannels: [HTMLAudioElement, HTMLAudioElement] | null = null;
  private stingerChannel: HTMLAudioElement | null = null;
  private activeBgmIndex = 0;
  private channelMix: [number, number] = [0, 0];
  private currentLoopId: string | null = null;
  private pendingLoopId: string | null = null;
  private activeStingerId: string | null = null;
  private activeStingerPriority = -Infinity;
  private desiredState: DynamicMusicState | null = null;
  private lastEvent: string | null = null;
  private lastLoopStartedAt = 0;
  private manualDuckGain = 1;
  private stingerDuckGain = 1;
  private stateTimer: ReturnType<typeof window.setTimeout> | null = null;
  private fadeFrame: number | null = null;
  private duckFrame: number | null = null;
  private stingerGeneration = 0;
  private detachUnlockListeners: (() => void) | null = null;
  private unlockPromise: Promise<boolean> | null = null;
  private unlocked = false;
  private suspended = typeof document !== "undefined" ? document.hidden : false;
  private destroyed = false;

  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      this.suspend();
    } else {
      void this.resume();
    }
  };

  constructor(manifest: MusicManifest, options: DynamicMusicControllerOptions = {}) {
    validateManifest(manifest);
    this.manifest = manifest;
    this.loops = manifest.cues.filter(isLoopCue);
    this.stingers = manifest.cues.filter(isStingerCue);
    this.options = {
      assetBaseUrl: options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL,
      storageKey: options.storageKey ?? DEFAULT_STORAGE_KEY,
      stateDebounceMs: Math.max(0, options.stateDebounceMs ?? DEFAULT_STATE_DEBOUNCE_MS),
      onError: options.onError,
    };
    const initialSettings = { ...DEFAULT_SETTINGS, ...options.initialSettings };
    this.settings = typeof window === "undefined"
      ? {
          muted: Boolean(initialSettings.muted),
          masterVolume: clampVolume(initialSettings.masterVolume),
          bgmVolume: clampVolume(initialSettings.bgmVolume),
        }
      : loadSettings(this.options.storageKey, options.initialSettings);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  attachAutoUnlock(target?: EventTarget) {
    if (this.unlocked || this.destroyed) return () => undefined;
    const unlockTarget = target ?? (typeof document !== "undefined" ? document : null);
    if (!unlockTarget) return () => undefined;

    this.detachUnlockListeners?.();
    const handler = () => {
      this.detachUnlockListeners?.();
      void this.unlock();
    };
    const events = ["pointerdown", "touchstart", "keydown"];
    for (const event of events) unlockTarget.addEventListener(event, handler, { passive: true });
    const detach = () => {
      for (const event of events) unlockTarget.removeEventListener(event, handler);
      if (this.detachUnlockListeners === detach) this.detachUnlockListeners = null;
    };
    this.detachUnlockListeners = detach;
    return detach;
  }

  async unlock() {
    if (this.destroyed) return false;
    if (this.unlocked) return true;
    if (this.unlockPromise) return this.unlockPromise;
    this.unlockPromise = this.performUnlock();
    try {
      return await this.unlockPromise;
    } finally {
      this.unlockPromise = null;
    }
  }

  private async performUnlock() {
    if (typeof Audio === "undefined" || this.loops.length === 0) return false;

    this.ensureChannels();
    const firstUrl = this.getAssetUrl(this.loops[0].file);
    const elements = [...(this.bgmChannels ?? []), this.stingerChannel].filter(
      (audio): audio is HTMLAudioElement => Boolean(audio),
    );
    const attempts = elements.map((audio) => {
      audio.src = firstUrl;
      audio.muted = true;
      audio.volume = 0;
      return audio.play();
    });
    const results = await Promise.allSettled(attempts);
    const success = results.some((result) => result.status === "fulfilled");
    for (const audio of elements) {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = this.settings.muted;
    }
    if (!success) {
      this.reportError(new Error("浏览器阻止了音频解锁，请在用户点击事件中调用 unlock()"));
      return false;
    }

    this.unlocked = true;
    this.applyVolumes();
    if (this.desiredState && !this.suspended) {
      await this.applyState(this.desiredState, { immediate: true });
    }
    return true;
  }

  async setState(state: DynamicMusicState, options: SetMusicStateOptions = {}) {
    if (this.destroyed) return;
    const normalized: DynamicMusicState = {
      scene: normalizeKey(state.scene),
      mood: normalizeKey(state.mood),
      event: state.event ? normalizeKey(state.event) : null,
      intensity: Math.max(1, Math.min(3, state.intensity)) as DynamicMusicState["intensity"],
    };
    this.desiredState = normalized;
    if (!normalized.event) this.lastEvent = null;
    if (!this.unlocked || this.suspended) return;
    await this.applyState(normalized, options);
  }

  async playEvent(event: string) {
    if (!event || this.destroyed) return;
    const normalizedEvent = normalizeKey(event);
    const cue = this.findStinger(normalizedEvent);
    if (!cue || !this.unlocked || this.suspended) return;
    await this.playStinger(cue);
  }

  setMuted(muted: boolean) {
    this.settings.muted = muted;
    this.persistSettings();
    this.applyVolumes();
    if (!muted && this.unlocked && !this.suspended) {
      void this.resumeActivePlayback();
    }
  }

  setMasterVolume(volume: number) {
    this.settings.masterVolume = clampVolume(volume);
    this.persistSettings();
    this.applyVolumes();
  }

  setBgmVolume(volume: number) {
    this.settings.bgmVolume = clampVolume(volume);
    this.persistSettings();
    this.applyVolumes();
  }

  setBackgroundDucking(active: boolean, decibels = -6) {
    const target = active ? decibelsToGain(Math.min(0, decibels)) : 1;
    this.fadeDuck("manual", target, 180);
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  getSnapshot(): DynamicMusicSnapshot {
    return {
      unlocked: this.unlocked,
      suspended: this.suspended,
      currentLoopId: this.currentLoopId,
      activeStingerId: this.activeStingerId,
      state: this.desiredState ? { ...this.desiredState } : null,
      settings: this.getSettings(),
    };
  }

  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    this.clearStateTimer();
    this.cancelAnimationFrames();
    for (const audio of this.bgmChannels ?? []) audio.pause();
    this.stingerChannel?.pause();
  }

  async resume() {
    if (!this.suspended || this.destroyed) return;
    this.suspended = false;
    if (!this.unlocked || this.settings.muted) return;
    await this.resumeActivePlayback();
  }

  private async resumeActivePlayback() {
    if (this.activeStingerId && this.stingerChannel) {
      await this.resumeCurrentLoop();
      await this.safePlay(this.stingerChannel);
      return;
    }
    if (this.pendingLoopId) {
      const pending = this.loops.find((cue) => cue.id === this.pendingLoopId);
      if (pending) await this.transitionToLoop(pending, 0.2);
      return;
    }
    if (this.currentLoopId && this.bgmChannels) {
      await this.safePlay(this.bgmChannels[this.activeBgmIndex]);
    } else if (this.desiredState) {
      await this.applyState(this.desiredState, { immediate: true });
    }
  }

  private async resumeCurrentLoop() {
    if (!this.currentLoopId || !this.bgmChannels) return;
    const inactiveIndex = (1 - this.activeBgmIndex) as 0 | 1;
    const inactive = this.bgmChannels[inactiveIndex];
    inactive.pause();
    inactive.removeAttribute("src");
    inactive.load();
    this.channelMix[this.activeBgmIndex] = 1;
    this.channelMix[inactiveIndex] = 0;
    this.applyVolumes();
    await this.safePlay(this.bgmChannels[this.activeBgmIndex]);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachUnlockListeners?.();
    this.clearStateTimer();
    this.cancelAnimationFrames();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    for (const audio of [...(this.bgmChannels ?? []), this.stingerChannel]) {
      if (!audio) continue;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    this.bgmChannels = null;
    this.stingerChannel = null;
  }

  private async applyState(state: DynamicMusicState, options: SetMusicStateOptions) {
    const loop = this.selectLoop(state);
    const eventCue = state.event ? this.findStinger(state.event) : null;
    if (eventCue && state.event !== this.lastEvent) {
      this.lastEvent = state.event ?? null;
      this.pendingLoopId = loop?.id ?? null;
      await this.playStinger(eventCue);
      return;
    }
    if (loop) this.scheduleLoop(loop, Boolean(options.immediate), state);
  }

  private selectLoop(state: DynamicMusicState) {
    const sceneCue = SCENE_CUE_MAP[state.scene];
    const moodCue = MOOD_CUE_MAP[state.mood];
    const requestedTags = new Set([state.scene, state.mood, `intensity_${state.intensity}`]);
    let best: LoopMusicCue | null = null;
    let bestScore = -Infinity;
    for (const cue of this.loops) {
      let score = cue.priority;
      if (cue.id === sceneCue) score += 130;
      if (cue.id === moodCue) score += 160;
      for (const tag of cue.tags.map(normalizeKey)) {
        if (requestedTags.has(tag)) score += tag.startsWith("intensity_") ? 25 : 80;
      }
      if (state.intensity === 3 && cue.id === "bgm_soul_battle" && ["battle", "combat"].includes(state.mood)) score += 30;
      if (score > bestScore) {
        best = cue;
        bestScore = score;
      }
    }
    return best ?? this.loops.find((cue) => cue.id === "bgm_notting_daily") ?? this.loops[0] ?? null;
  }

  private findStinger(event: string) {
    return this.stingers
      .filter((cue) => cue.events.map(normalizeKey).includes(event))
      .sort((left, right) => right.priority - left.priority)[0] ?? null;
  }

  private scheduleLoop(cue: LoopMusicCue, immediate: boolean, state: DynamicMusicState) {
    if (this.currentLoopId === cue.id) {
      this.pendingLoopId = null;
      this.applyVolumes();
      return;
    }
    if (this.activeStingerId) {
      this.pendingLoopId = cue.id;
      return;
    }
    this.clearStateTimer();
    const urgent = state.intensity === 3 || ["battle", "combat"].includes(state.mood);
    const minimumHoldMs = Math.max(0, this.manifest.minimum_hold_seconds * 1_000);
    const heldForMs = this.lastLoopStartedAt ? Date.now() - this.lastLoopStartedAt : minimumHoldMs;
    const holdRemainingMs = Math.max(0, minimumHoldMs - heldForMs);
    const delayMs = immediate || urgent || !this.currentLoopId
      ? 0
      : Math.max(this.options.stateDebounceMs, holdRemainingMs);
    if (delayMs === 0) {
      void this.transitionToLoop(cue);
      return;
    }
    this.pendingLoopId = cue.id;
    this.stateTimer = window.setTimeout(() => {
      this.stateTimer = null;
      if (this.activeStingerId || this.suspended) return;
      void this.transitionToLoop(cue);
    }, delayMs);
  }

  private async transitionToLoop(cue: LoopMusicCue, durationOverride?: number) {
    if (!this.unlocked || this.suspended || this.destroyed) {
      this.pendingLoopId = cue.id;
      return;
    }
    if (this.currentLoopId === cue.id) {
      this.pendingLoopId = null;
      this.applyVolumes();
      return;
    }
    this.ensureChannels();
    if (!this.bgmChannels) return;

    const fromIndex = this.currentLoopId ? this.activeBgmIndex : -1;
    const toIndex = fromIndex < 0 ? 0 : (1 - fromIndex) as 0 | 1;
    const to = this.bgmChannels[toIndex];
    to.src = this.getAssetUrl(cue.file);
    to.dataset.cueId = cue.id;
    to.loop = true;
    to.currentTime = Math.max(0, cue.loop_start_seconds);
    this.channelMix[toIndex] = 0;
    to.muted = this.settings.muted;
    this.applyVolumes();
    if (!(await this.safePlay(to))) return;

    this.activeBgmIndex = toIndex;
    this.currentLoopId = cue.id;
    this.pendingLoopId = null;
    this.lastLoopStartedAt = Date.now();
    const fadeSeconds = durationOverride ?? cue.fade_in_seconds ?? this.manifest.default_fade_seconds;
    this.fadeBetweenChannels(fromIndex, toIndex, Math.max(0, fadeSeconds));
  }

  private async playStinger(cue: StingerMusicCue) {
    if (!this.unlocked || this.suspended || this.destroyed) return;
    if (this.activeStingerId === cue.id) return;
    if (this.activeStingerId && cue.priority <= this.activeStingerPriority) return;
    this.ensureChannels();
    if (!this.stingerChannel) return;

    this.clearStateTimer();
    const generation = ++this.stingerGeneration;
    this.stingerChannel.pause();
    this.stingerChannel.src = this.getAssetUrl(cue.file);
    this.stingerChannel.currentTime = 0;
    this.stingerChannel.loop = false;
    this.stingerChannel.muted = this.settings.muted;
    this.activeStingerId = cue.id;
    this.activeStingerPriority = cue.priority;
    this.fadeDuck("stinger", decibelsToGain(cue.duck_bgm_db), 150);
    this.applyVolumes();

    this.stingerChannel.onended = () => {
      if (generation !== this.stingerGeneration) return;
      this.activeStingerId = null;
      this.activeStingerPriority = -Infinity;
      this.fadeDuck("stinger", 1, 260);
      const pending = this.pendingLoopId ? this.loops.find((loop) => loop.id === this.pendingLoopId) : null;
      if (pending) {
        void this.transitionToLoop(pending);
      } else if (!cue.resume_previous_bgm && this.bgmChannels && this.currentLoopId) {
        const current = this.bgmChannels[this.activeBgmIndex];
        current.pause();
      }
    };

    if (!(await this.safePlay(this.stingerChannel))) {
      this.activeStingerId = null;
      this.activeStingerPriority = -Infinity;
      this.fadeDuck("stinger", 1, 150);
    }
  }

  private ensureChannels() {
    if (this.bgmChannels && this.stingerChannel) return;
    const createAudio = (preload: "auto" | "metadata") => {
      const audio = new Audio();
      audio.preload = preload;
      audio.crossOrigin = "anonymous";
      return audio;
    };
    this.bgmChannels = [createAudio("auto"), createAudio("auto")];
    this.stingerChannel = createAudio("auto");
    for (const channel of this.bgmChannels) {
      channel.addEventListener("timeupdate", () => {
        const cue = this.loops.find((item) => item.id === channel.dataset.cueId);
        if (cue && channel.currentTime >= cue.loop_end_seconds - 0.04) {
          channel.currentTime = cue.loop_start_seconds;
        }
      });
    }
  }

  private fadeBetweenChannels(fromIndex: number, toIndex: 0 | 1, durationSeconds: number) {
    if (!this.bgmChannels) return;
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
    const from = fromIndex >= 0 ? this.bgmChannels[fromIndex] : null;
    const start = performance.now();
    const durationMs = durationSeconds * 1_000;
    const step = (now: number) => {
      const progress = durationMs === 0 ? 1 : Math.min(1, (now - start) / durationMs);
      this.channelMix[toIndex] = Math.sin(progress * Math.PI * 0.5);
      if (fromIndex >= 0) this.channelMix[fromIndex] = Math.cos(progress * Math.PI * 0.5);
      this.applyVolumes();
      if (progress < 1) {
        this.fadeFrame = requestAnimationFrame(step);
      } else {
        this.fadeFrame = null;
        this.channelMix[toIndex] = 1;
        if (from) {
          from.pause();
          from.removeAttribute("src");
          from.load();
          this.channelMix[fromIndex] = 0;
        }
        this.applyVolumes();
      }
    };
    this.fadeFrame = requestAnimationFrame(step);
  }

  private fadeDuck(kind: "manual" | "stinger", target: number, durationMs: number) {
    if (this.duckFrame !== null) cancelAnimationFrame(this.duckFrame);
    const startValue = kind === "manual" ? this.manualDuckGain : this.stingerDuckGain;
    const start = performance.now();
    const step = (now: number) => {
      const progress = durationMs === 0 ? 1 : Math.min(1, (now - start) / durationMs);
      const value = startValue + (target - startValue) * progress;
      if (kind === "manual") this.manualDuckGain = value;
      else this.stingerDuckGain = value;
      this.applyVolumes();
      if (progress < 1) this.duckFrame = requestAnimationFrame(step);
      else this.duckFrame = null;
    };
    this.duckFrame = requestAnimationFrame(step);
  }

  private applyVolumes() {
    const mutedGain = this.settings.muted ? 0 : 1;
    const bgmGain = mutedGain * this.settings.masterVolume * this.settings.bgmVolume * this.manualDuckGain * this.stingerDuckGain;
    if (this.bgmChannels) {
      this.bgmChannels[0].muted = this.settings.muted;
      this.bgmChannels[1].muted = this.settings.muted;
      this.bgmChannels[0].volume = clampVolume(bgmGain * this.channelMix[0]);
      this.bgmChannels[1].volume = clampVolume(bgmGain * this.channelMix[1]);
    }
    if (this.stingerChannel) {
      this.stingerChannel.muted = this.settings.muted;
      this.stingerChannel.volume = clampVolume(mutedGain * this.settings.masterVolume * 0.75);
    }
  }

  private persistSettings() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.options.storageKey, JSON.stringify(this.settings));
    } catch {
      // 存储不可用时继续保留当前会话设置。
    }
  }

  private getAssetUrl(file: string) {
    const base = this.options.assetBaseUrl.endsWith("/") ? this.options.assetBaseUrl : `${this.options.assetBaseUrl}/`;
    return new URL(file, new URL(base, window.location.href)).toString();
  }

  private async safePlay(audio: HTMLAudioElement) {
    try {
      await audio.play();
      return true;
    } catch (error) {
      this.reportError(error instanceof Error ? error : new Error("音频播放失败"));
      return false;
    }
  }

  private reportError(error: Error) {
    this.options.onError?.(error);
  }

  private clearStateTimer() {
    if (this.stateTimer !== null) {
      window.clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
  }

  private cancelAnimationFrames() {
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
    if (this.duckFrame !== null) cancelAnimationFrame(this.duckFrame);
    this.fadeFrame = null;
    this.duckFrame = null;
  }
}

export async function createDynamicMusicController(options: DynamicMusicControllerOptions = {}) {
  const manifestUrl = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`无法加载动态音乐 manifest：HTTP ${response.status}`);
  const manifest = await response.json() as MusicManifest;
  return new DynamicMusicController(manifest, options);
}
