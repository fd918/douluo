export type MusicCueType = "loop" | "stinger";

export type MusicIntensity = 1 | 2 | 3;

export interface DynamicMusicState {
  scene: string;
  mood: string;
  event?: string | null;
  intensity: MusicIntensity;
}

interface MusicCueBase {
  id: string;
  name: string;
  type: MusicCueType;
  file: string;
  duration_seconds: number;
  priority: number;
}

export interface LoopMusicCue extends MusicCueBase {
  type: "loop";
  loop_start_seconds: number;
  loop_end_seconds: number;
  bpm: number;
  key: string;
  use: string;
  tags: string[];
  fade_in_seconds: number;
  fade_out_seconds: number;
}

export interface StingerMusicCue extends MusicCueBase {
  type: "stinger";
  events: string[];
  duck_bgm_db: number;
  resume_previous_bgm: boolean;
}

export type MusicCue = LoopMusicCue | StingerMusicCue;

export interface MusicManifest {
  version: number;
  project: string;
  default_fade_seconds: number;
  minimum_hold_seconds: number;
  cues: MusicCue[];
}

export interface AudioSettings {
  muted: boolean;
  masterVolume: number;
  bgmVolume: number;
}

export interface DynamicMusicSnapshot {
  unlocked: boolean;
  suspended: boolean;
  currentLoopId: string | null;
  activeStingerId: string | null;
  state: DynamicMusicState | null;
  settings: AudioSettings;
}

export interface DynamicMusicControllerOptions {
  manifestUrl?: string;
  assetBaseUrl?: string;
  storageKey?: string;
  stateDebounceMs?: number;
  initialSettings?: Partial<AudioSettings>;
  onError?: (error: Error) => void;
}

export interface SetMusicStateOptions {
  immediate?: boolean;
}
