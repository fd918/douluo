#!/usr/bin/env python3
"""生成《斗罗大陆人生模拟器》原创动态 BGM 素材。"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from synth_utils import SAMPLE_RATE, add_signal, shaker, synth_note, taiko, write_wav


ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "game" / "public" / "audio" / "douluo"
LOOPS = OUT / "loops"
STINGERS = OUT / "stingers"
SR = SAMPLE_RATE


@dataclass(frozen=True)
class LoopSpec:
    cue_id: str
    title: str
    use: str
    bpm: int
    key: str
    chords: tuple[tuple[str, str, str], ...]
    melody: tuple[tuple[float, str, float], ...]
    lead: str
    mood: str
    tags: tuple[str, ...]
    intensity: int = 1


def bus(seconds: float) -> np.ndarray:
    return np.zeros((int(seconds * SR), 2), dtype=np.float64)


def add_note(audio: np.ndarray, note: str, start: float, duration: float, kind: str,
             gain: float, pan: float = 0.0) -> None:
    add_signal(audio, synth_note(note, duration + 0.14, kind), start, gain, pan)


def add_chord(audio: np.ndarray, chord: tuple[str, str, str], start: float,
              duration: float, kind: str, gain: float) -> None:
    for note, pan in zip(chord, (-0.35, 0.0, 0.35)):
        add_note(audio, note, start, duration, kind, gain, pan)


def add_ambience(audio: np.ndarray, gain: float, seed: int) -> None:
    raw = np.random.default_rng(seed).normal(0, 1, len(audio) + 1200)
    texture = np.convolve(raw, np.ones(1000) / 1000, mode="valid")[:len(audio)]
    add_signal(audio, texture, 0, gain, -0.28)
    add_signal(audio, texture[::-1], 0, gain * 0.7, 0.28)


def add_reverb(audio: np.ndarray, amount: float) -> np.ndarray:
    dry = audio.copy()
    for delay, gain, cross in ((0.16, 0.11, False), (0.29, 0.075, True),
                               (0.49, 0.05, False), (0.73, 0.032, True)):
        shift = int(delay * SR)
        source = dry[:-shift, ::-1] if cross else dry[:-shift]
        audio[shift:] += source * gain * amount
    return audio


def master(audio: np.ndarray, target_rms: float = 0.125) -> np.ndarray:
    audio -= np.mean(audio, axis=0, keepdims=True)
    audio = np.tanh(audio * 1.08)
    rms = float(np.sqrt(np.mean(audio * audio)))
    if rms > 1e-9:
        audio *= target_rms / rms
    peak = float(np.max(np.abs(audio)))
    if peak > 0.86:
        audio *= 0.86 / peak
    return audio


def seamless(audio: np.ndarray, seconds: float, fade_seconds: float = 1.4) -> np.ndarray:
    base = int(seconds * SR)
    fade = min(int(fade_seconds * SR), len(audio) - base, base // 4)
    result = audio[:base].copy()
    curve = np.sin(np.linspace(0, math.pi / 2, fade)) ** 2
    result[:fade] = audio[base:base + fade] * (1 - curve[:, None]) + result[:fade] * curve[:, None]
    return master(result)


def compose_loop(spec: LoopSpec, bars: int = 8) -> tuple[np.ndarray, float]:
    beat = 60 / spec.bpm
    bar = beat * 4
    audio = bus((bars + 1) * bar + 1.8)
    for index in range(bars + 1):
        chord = spec.chords[index % len(spec.chords)]
        start = index * bar
        pad_kind = "choir" if spec.mood in {"mystery", "solemn"} else "strings"
        add_chord(audio, chord, start, bar * 1.04, pad_kind, 0.05 + spec.intensity * 0.006)
        if spec.mood in {"training", "battle", "tension"}:
            steps = 8 if spec.mood == "battle" else 4
            for step in range(steps):
                add_note(audio, chord[step % 3], start + step * bar / steps,
                         beat * 0.32, "pluck", 0.07 + spec.intensity * 0.012,
                         -0.25 if step % 2 else 0.25)
        else:
            for step in range(4):
                add_note(audio, chord[(step + index) % 3], start + step * beat,
                         beat * 0.58, "pluck", 0.055, -0.22 if step % 2 else 0.22)
        if index % 4 == 0:
            for offset, note, duration in spec.melody:
                add_note(audio, note, start + offset * beat, duration * beat,
                         spec.lead, 0.10 + spec.intensity * 0.012, 0.08)
        if spec.intensity >= 2:
            add_signal(audio, taiko(0.75, 0.7), start, 0.08 + spec.intensity * 0.025, -0.12)
            add_signal(audio, shaker(0.11), start + beat * 2, 0.025, 0.34)
        elif index % 2 == 0:
            add_signal(audio, shaker(0.10), start + beat * 2.5, 0.014, 0.3)
    add_ambience(audio, 0.012 + spec.intensity * 0.003, 815 + spec.bpm)
    return seamless(add_reverb(audio, 0.55 + (spec.mood in {"mystery", "solemn"}) * 0.45), bars * bar), bars * bar


LOOP_SPECS = (
    LoopSpec("bgm_notting_daily", "诺丁初晴", "诺丁城、学院与日常探索", 92, "D大调五声",
             (("D3", "F#3", "A3"), ("G3", "B3", "D4"), ("B2", "D3", "F#3"), ("A2", "E3", "A3")),
             ((0, "D4", .65), (1, "F#4", .42), (2, "A4", .7), (3, "B4", .4), (4, "A4", .55), (6, "E4", .8)),
             "flute", "daily", ("notting_city", "notting_academy", "daily")),
    LoopSpec("bgm_blue_silver_mystery", "蓝银微光", "旧井、脚印、魂力实验与谜团", 66, "D小调",
             (("D2", "A2", "D3"), ("Eb2", "Bb2", "D3"), ("Bb1", "F2", "A2"), ("A1", "E2", "A2")),
             ((0, "D4", 1.25), (2, "A3", .9), (4, "G3", .8), (6, "D3", 1.4)),
             "flute", "mystery", ("old_well", "underground_lab", "mystery")),
    LoopSpec("bgm_shrek_training", "怪物晨练", "史莱克训练、考核与团队行动", 112, "E小调",
             (("E2", "B2", "E3"), ("C2", "G2", "C3"), ("D2", "A2", "D3"), ("B1", "F#2", "B2")),
             ((0, "E4", .42), (.75, "G4", .38), (1.5, "B4", .52), (2.5, "A4", .38), (3.25, "E5", .7)),
             "erhu", "training", ("shrek_academy", "shrek_mirror_forest", "training", "intensity_2"), 2),
    LoopSpec("bgm_star_dou_forest", "星斗林语", "星斗大森林与魂兽探索", 78, "A小调五声",
             (("A2", "C3", "E3"), ("F2", "C3", "E3"), ("G2", "D3", "G3"), ("A2", "E3", "A3")),
             ((0, "A4", .72), (1.5, "C5", .5), (2.5, "D5", .55), (3.35, "E5", .68)),
             "flute", "exploration", ("star_dou_forest", "wilderness", "exploration")),
    LoopSpec("bgm_tension", "暗线逼近", "追踪、埋伏与战前紧张", 74, "C小调",
             (("C2", "G2", "C3"), ("Db2", "Ab2", "C3"), ("Ab1", "Eb2", "G2"), ("G1", "D2", "G2")),
             ((0, "C4", .45), (1.5, "Db4", .35), (2.25, "C4", .5), (3.25, "G3", .8)),
             "erhu", "tension", ("danger", "pursuit", "prebattle", "intensity_2"), 2),
    LoopSpec("bgm_soul_battle", "魂环共振", "魂师战斗与强敌交锋", 132, "D小调五声",
             (("D2", "A2", "D3"), ("Bb1", "F2", "Bb2"), ("C2", "G2", "C3"), ("A1", "E2", "A2")),
             ((0, "D4", .42), (.7, "F4", .38), (1.4, "G4", .42), (2.1, "A4", .45), (2.8, "C5", .38), (3.4, "D5", .62)),
             "horn", "battle", ("soul_arena", "battle", "combat", "intensity_3"), 3),
    LoopSpec("bgm_academy_bond", "伙伴灯火", "伙伴、回忆与安静对话", 70, "G大调",
             (("G3", "B3", "D4"), ("D3", "A3", "D4"), ("E3", "G3", "B3"), ("C3", "G3", "C4")),
             ((0, "G4", .75), (1, "A4", .5), (1.75, "B4", .9), (3, "D5", .65), (5, "A4", .55), (6, "G4", 1.0)),
             "flute", "warm", ("academy", "bond", "warm", "memory")),
    LoopSpec("bgm_distant_sea", "远海星潮", "海神岛远景与庄严时刻", 76, "E小调",
             (("E3", "G3", "B3"), ("C3", "E3", "B3"), ("D3", "A3", "D4"), ("B2", "F#3", "B3")),
             ((0, "B4", 1.0), (1.5, "A4", .5), (2.3, "G4", .58), (3.1, "E4", .82)),
             "flute", "solemn", ("sea_god_island", "solemn", "distant")),
)


STINGER_SPECS = (
    ("stinger_martial_soul", "武魂觉醒", "martial_soul_awakened", (("D3", 0), ("A3", .6), ("D4", 1.2), ("F#4", 1.8), ("A4", 2.5)), "bell"),
    ("stinger_soul_ring", "魂环入体", "soul_ring_absorbed", (("A2", 0), ("E3", .7), ("A3", 1.4), ("C4", 2.1), ("E4", 2.9)), "erhu"),
    ("stinger_breakthrough", "魂力突破", "level_breakthrough", (("D3", 0), ("F3", .55), ("A3", 1.1), ("D4", 1.7), ("F4", 2.35), ("A4", 3.0), ("D5", 3.8)), "horn"),
    ("stinger_boss", "强敌现身", "boss_appears", (("D2", 0), ("Eb2", .9), ("C2", 1.8), ("A1", 2.7), ("D4", 3.5)), "horn"),
    ("stinger_victory", "战斗胜利", "battle_victory", (("D4", 0), ("F4", .5), ("A4", 1.0), ("D5", 1.65)), "horn"),
    ("stinger_danger", "危险逼近", "sudden_danger", (("C3", 0), ("Db3", .55), ("G3", 1.15), ("C4", 1.8)), "strings"),
)


def compose_stinger(notes: tuple[tuple[str, float], ...], lead: str) -> np.ndarray:
    length = max(start for _, start in notes) + 2.4
    audio = bus(length)
    for index, (note, start) in enumerate(notes):
        add_note(audio, note, start, 1.35 if index < len(notes) - 1 else 2.0, lead, 0.14, 0.08)
        if index in {0, len(notes) - 1}:
            add_signal(audio, taiko(0.9, 0.85), start, 0.15, -0.08)
    add_reverb(audio, 0.78)
    fade = min(int(.8 * SR), len(audio))
    audio[-fade:] *= np.cos(np.linspace(0, math.pi / 2, fade))[:, None] ** 2
    return master(audio, 0.14)


def encode_ogg(audio: np.ndarray, destination: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("未找到 ffmpeg，无法生成 OGG")
    temporary = OUT / "_render.wav"
    write_wav(temporary, audio)
    subprocess.run((ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(temporary),
                    "-codec:a", "libopus", "-b:a", "112k", str(destination)), check=True)
    temporary.unlink()


def main() -> None:
    LOOPS.mkdir(parents=True, exist_ok=True)
    STINGERS.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 1,
        "project": "斗罗大陆人生模拟器原创动态音乐",
        "default_fade_seconds": 1.5,
        "minimum_hold_seconds": 16,
        "cues": [],
    }
    for spec in LOOP_SPECS:
        print(f"生成循环：{spec.title}")
        audio, nominal = compose_loop(spec)
        filename = f"{spec.cue_id}.ogg"
        encode_ogg(audio, LOOPS / filename)
        manifest["cues"].append({
            "id": spec.cue_id, "name": spec.title, "type": "loop", "file": f"loops/{filename}",
            "duration_seconds": round(len(audio) / SR, 3), "loop_start_seconds": 0,
            "loop_end_seconds": round(nominal, 3), "bpm": spec.bpm, "key": spec.key,
            "use": spec.use, "tags": list(spec.tags), "priority": 60 if spec.intensity == 3 else 40,
            "fade_in_seconds": .6 if spec.intensity == 3 else 1.5,
            "fade_out_seconds": .8 if spec.intensity == 3 else 1.5,
        })
    for cue_id, title, event, notes, lead in STINGER_SPECS:
        print(f"生成短过场：{title}")
        audio = compose_stinger(notes, lead)
        filename = f"{cue_id}.ogg"
        encode_ogg(audio, STINGERS / filename)
        manifest["cues"].append({
            "id": cue_id, "name": title, "type": "stinger", "file": f"stingers/{filename}",
            "duration_seconds": round(len(audio) / SR, 3), "events": [event],
            "priority": 100 if event in {"soul_ring_absorbed", "boss_appears"} else 90,
            "duck_bgm_db": -12, "resume_previous_bgm": event not in {"boss_appears", "sudden_danger"},
        })
    (OUT / "music_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"完成：{len(LOOP_SPECS)} 条循环、{len(STINGER_SPECS)} 条短过场，输出到 {OUT}")


if __name__ == "__main__":
    main()
