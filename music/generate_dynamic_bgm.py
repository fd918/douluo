#!/usr/bin/env python3
"""生成《斗破苍穹》剧情驱动 BGM 素材包。"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import numpy as np

from generate_music import SAMPLE_RATE, add_signal, fire_texture, shaker, synth_note, taiko, write_wav


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dynamic_bgm"
LOOPS = OUT / "loops"
STINGERS = OUT / "stingers"
SR = SAMPLE_RATE


def bus(seconds: float) -> np.ndarray:
    return np.zeros((int(seconds * SR), 2), dtype=np.float64)


def add_note(audio: np.ndarray, note: str, start: float, duration: float, kind: str,
             gain: float, pan: float = 0.0) -> None:
    add_signal(audio, synth_note(note, duration + 0.16, kind), start, gain, pan)


def add_chord(audio: np.ndarray, chord: tuple[str, ...], start: float, duration: float,
              kind: str, gain: float) -> None:
    pans = np.linspace(-0.38, 0.38, len(chord))
    for note, pan in zip(chord, pans):
        add_note(audio, note, start, duration, kind, gain, float(pan))


def add_reverb(audio: np.ndarray, amount: float = 1.0) -> np.ndarray:
    dry = audio.copy()
    for delay, gain, cross in ((0.17, 0.12, False), (0.31, 0.085, True), (0.53, 0.06, False), (0.79, 0.038, True)):
        shift = int(delay * SR)
        source = dry[:-shift, ::-1] if cross else dry[:-shift]
        audio[shift:] += source * gain * amount
    return audio


def master(audio: np.ndarray, target_rms: float = 0.135, peak_limit: float = 0.86) -> np.ndarray:
    audio -= np.mean(audio, axis=0, keepdims=True)
    audio = np.tanh(audio * 1.08)
    rms = float(np.sqrt(np.mean(audio * audio)))
    if rms > 1e-9:
        audio *= target_rms / rms
    peak = float(np.max(np.abs(audio)))
    if peak > peak_limit:
        audio *= peak_limit / peak
    return audio


def make_loop(audio: np.ndarray, base_seconds: float, fade_seconds: float = 1.5) -> np.ndarray:
    base = int(base_seconds * SR)
    fade = min(int(fade_seconds * SR), len(audio) - base, base // 4)
    result = audio[:base].copy()
    # 尾部包含首小节重复演奏与上轮混响；将它折回开头，确保循环边界连续。
    x = np.sin(np.linspace(0, math.pi / 2, fade)) ** 2
    result[:fade] = audio[base:base + fade] * (1 - x[:, None]) + result[:fade] * x[:, None]
    return master(result)


def add_ambience(audio: np.ndarray, gain: float = 0.018, fire: bool = False) -> None:
    if fire:
        texture = fire_texture(len(audio) / SR)
    else:
        raw = np.random.default_rng(815).normal(0, 1, len(audio) + 1000)
        texture = np.convolve(raw, np.ones(900) / 900, mode="valid")[:len(audio)]
    add_signal(audio, texture, 0, gain, -0.22)
    add_signal(audio, texture[::-1], 0, gain * 0.75, 0.24)


def town() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 92, 16
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("D3", "F#3", "A3"), ("G3", "B3", "D4"), ("B2", "D3", "F#3"), ("A2", "E3", "A3")]
    phrase = [(0, "D4", .7), (1, "F#4", .45), (2, "A4", .8), (3, "B4", .45),
              (4, "A4", .55), (5, "F#4", .45), (6, "E4", .55), (7, "D4", .9)]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar * .96, "strings", .055)
        for k in range(4):
            note = chord[(k + b) % 3]
            add_note(audio, note, b * bar + k * beat, beat * .62, "pluck", .12, -.28 if k % 2 == 0 else .28)
        if b % 4 == 0:
            for off, note, dur in phrase:
                add_note(audio, note, b * bar + off * beat / 2, dur * beat, "flute", .12, -.08)
        add_signal(audio, shaker(.1), b * bar + beat * 2, .018, .36)
    add_ambience(audio, .015)
    return make_loop(add_reverb(audio, .55), bars * bar), bars * bar, bpm, "D大调五声"


def mystery() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 68, 12
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("D2", "A2", "D3"), ("Eb2", "Bb2", "D3"), ("Bb1", "F2", "A2"), ("A1", "E2", "A2")]
    motif = [(0, "D4", 1.3), (2, "A3", 1.0), (4, "G3", .9), (6, "D3", 1.6)]
    for b in range(bars + 1):
        add_chord(audio, chords[b % 4], b * bar, bar * 1.04, "choir", .052)
        if b % 4 == 0:
            for off, note, dur in motif:
                add_note(audio, note, b * bar + off * beat / 2, dur * beat, "flute", .13, -.2)
                add_note(audio, note, b * bar + off * beat / 2, dur * beat + .5, "bell", .028, .3)
    add_ambience(audio, .024)
    return make_loop(add_reverb(audio, 1.25), bars * bar, 2.1), bars * bar, bpm, "D小调/降二级"


def alchemy() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 108, 16
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("E3", "G3", "B3"), ("C3", "E3", "G3"), ("A2", "E3", "A3"), ("B2", "F#3", "B3")]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar, "strings", .05 + .006 * (b % 4))
        for k in range(8):
            note = chord[(k * 2 + b) % 3]
            add_note(audio, note, b * bar + k * beat / 2, beat * .32, "pluck", .09 + .008 * (k % 3), -.3 if k % 2 else .3)
        add_signal(audio, taiko(.7, .5), b * bar, .055, 0)
        if b % 4 == 3:
            add_note(audio, "D#4", b * bar + beat * 3, beat * .25, "bell", .06, .2)
            add_note(audio, "E4", b * bar + beat * 3.5, beat * .42, "bell", .08, -.2)
    add_ambience(audio, .027, fire=True)
    return make_loop(add_reverb(audio, .6), bars * bar), bars * bar, bpm, "E小调"


def forest() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 78, 16
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("A2", "C3", "E3"), ("F2", "C3", "E3"), ("G2", "D3", "G3"), ("A2", "E3", "A3")]
    calls = [(0, "A4", .8), (1.5, "C5", .55), (2.5, "D5", .6), (3.25, "E5", .7)]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar * 1.02, "strings", .065)
        add_note(audio, chord[0], b * bar, beat * 2.5, "bass", .095, -.1)
        if b % 4 in (0, 2):
            for off, note, dur in calls:
                add_note(audio, note, b * bar + off * beat, dur * beat, "flute", .11, .16)
        add_signal(audio, taiko(.65, .42), b * bar, .052, -.25)
        add_signal(audio, shaker(.13), b * bar + beat * 2.5, .024, .4)
    add_ambience(audio, .026)
    return make_loop(add_reverb(audio, .72), bars * bar), bars * bar, bpm, "A小调五声"


def tension() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 76, 12
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("C2", "G2", "C3"), ("Db2", "Ab2", "C3"), ("Ab1", "Eb2", "G2"), ("G1", "D2", "G2")]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar * 1.03, "strings", .085)
        for k in range(4):
            add_note(audio, chord[0], b * bar + k * beat, beat * .4, "bass", .085 + .012 * (k == 0), 0)
        add_signal(audio, taiko(.8, .65), b * bar, .11, -.12)
        add_signal(audio, taiko(.6, .42), b * bar + beat * 2, .075, .14)
        if b % 3 == 2:
            add_note(audio, "Db4", b * bar + beat * 2.8, beat * .28, "erhu", .09, .22)
            add_note(audio, "C4", b * bar + beat * 3.2, beat * .62, "erhu", .11, .22)
    add_ambience(audio, .022, fire=True)
    return make_loop(add_reverb(audio, .42), bars * bar), bars * bar, bpm, "C小调/降二级"


def battle() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 132, 16
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("D2", "A2", "D3"), ("Bb1", "F2", "Bb2"), ("C2", "G2", "C3"), ("A1", "E2", "A2")]
    theme = [(0, "D4"), (.75, "F4"), (1.5, "G4"), (2.25, "A4"), (3, "C5"), (3.5, "A4")]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar, "horn", .075)
        for k in range(8):
            add_note(audio, chord[k % 3], b * bar + k * beat / 2, beat * .28, "pluck", .095, -.24 if k % 2 else .24)
        add_signal(audio, taiko(.8, 1.0), b * bar, .18, -.14)
        add_signal(audio, taiko(.65, .75), b * bar + beat * 2, .14, .16)
        for k in (1, 3):
            add_signal(audio, shaker(.1), b * bar + k * beat, .04, .4 if k == 1 else -.4)
        if b % 4 == 0:
            for off, note in theme:
                add_note(audio, note, b * bar + off * beat, beat * .55, "erhu", .13, .08)
    add_ambience(audio, .018, fire=True)
    return make_loop(add_reverb(audio, .34), bars * bar, 1.0), bars * bar, bpm, "D小调五声"


def yunlan() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 72, 12
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.5)
    chords = [("E3", "G3", "B3"), ("C3", "E3", "B3"), ("D3", "A3", "D4"), ("B2", "F#3", "B3")]
    phrase = [(0, "B4", 1.1), (1.5, "A4", .55), (2.25, "G4", .65), (3.0, "E4", .9)]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar * 1.04, "choir", .075)
        add_chord(audio, chord, b * bar, bar, "strings", .055)
        add_note(audio, chord[2], b * bar, beat * 1.7, "bell", .038, .3)
        if b % 4 == 0:
            for off, note, dur in phrase:
                add_note(audio, note, b * bar + off * beat, dur * beat, "flute", .105, -.18)
    add_ambience(audio, .016)
    return make_loop(add_reverb(audio, 1.05), bars * bar, 2.0), bars * bar, bpm, "E小调"


def desert() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 100, 16
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("D2", "A2", "D3"), ("Eb2", "Bb2", "D3"), ("C2", "G2", "C3"), ("D2", "A2", "D3")]
    phrase = [(0, "D4", .6), (.75, "Eb4", .35), (1.25, "G4", .55), (2.1, "F4", .45), (3, "D4", .8)]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar, "strings", .058)
        for k in range(6):
            add_note(audio, chord[(k + 1) % 3], b * bar + k * bar / 6, beat * .34, "pluck", .09, -.32 if k % 2 else .32)
        add_signal(audio, taiko(.72, .72), b * bar, .095, -.18)
        add_signal(audio, shaker(.15), b * bar + beat * 1.5, .032, .35)
        if b % 4 == 0:
            for off, note, dur in phrase:
                add_note(audio, note, b * bar + off * beat, dur * beat, "flute", .115, -.05)
    add_ambience(audio, .03)
    return make_loop(add_reverb(audio, .48), bars * bar), bars * bar, bpm, "D弗里吉亚/五声"


def emotion() -> tuple[np.ndarray, float, int, str]:
    bpm, bars = 70, 12
    beat, bar = 60 / bpm, 4 * 60 / bpm
    audio = bus((bars + 1) * bar + 2.0)
    chords = [("G3", "B3", "D4"), ("D3", "A3", "D4"), ("E3", "G3", "B3"), ("C3", "G3", "C4")]
    phrase = [(0, "G4", .8), (1, "A4", .55), (1.75, "B4", 1.0), (3, "D5", .7),
              (4, "B4", .7), (5, "A4", .55), (6, "G4", 1.2)]
    for b in range(bars + 1):
        chord = chords[b % 4]
        add_chord(audio, chord, b * bar, bar * 1.02, "strings", .06)
        add_note(audio, chord[0], b * bar, beat * 2.8, "pluck", .06, -.2)
        if b % 4 == 0:
            for off, note, dur in phrase:
                add_note(audio, note, b * bar + off * beat / 2, dur * beat, "flute", .105, -.12)
                if off in (0, 4):
                    add_note(audio, note, b * bar + off * beat / 2 + .18, dur * beat, "erhu", .055, .18)
    add_ambience(audio, .012)
    return make_loop(add_reverb(audio, .85), bars * bar, 1.8), bars * bar, bpm, "G大调/B小调五声"


def stinger(kind: str) -> np.ndarray:
    lengths = {"mystery": 6.5, "fire": 7.2, "breakthrough": 7.8, "boss": 6.8, "victory": 5.5, "danger": 4.2}
    audio = bus(lengths[kind])
    if kind == "mystery":
        for note, start, dur in (("D3", 0, 4.8), ("A3", .7, 3.2), ("D4", 1.8, 2.7), ("F4", 3.0, 2.0)):
            add_note(audio, note, start, dur, "flute" if note in ("D4", "F4") else "choir", .13)
            add_note(audio, note, start, dur + .4, "bell", .04, .25)
    elif kind == "fire":
        add_ambience(audio, .07, fire=True)
        for note, start in (("D3", 0), ("Eb3", .65), ("A3", 1.3), ("C#4", 2.0), ("D4", 2.45), ("A4", 3.3), ("D5", 4.15)):
            add_note(audio, note, start, 1.8, "erhu", .14, .12)
        add_signal(audio, taiko(1.5, 1.1), 4.1, .23, 0)
    elif kind == "breakthrough":
        add_ambience(audio, .045, fire=True)
        for note, start in (("D3", 0), ("F3", .7), ("G3", 1.4), ("A3", 2.1), ("C4", 2.8), ("D4", 3.5), ("F4", 4.2), ("A4", 5.0), ("D5", 5.6)):
            add_note(audio, note, start, 1.5, "horn" if start < 3 else "erhu", .14)
        add_signal(audio, taiko(1.5, 1.2), 5.15, .25, 0)
    elif kind == "boss":
        for start, root in ((0, "D2"), (1.15, "Eb2"), (2.3, "C2"), (3.5, "A1")):
            add_note(audio, root, start, 2.5, "horn", .17)
            add_signal(audio, taiko(1.2, 1.0), start, .22, -.1)
        add_note(audio, "D4", 4.1, 2.1, "erhu", .15, .18)
    elif kind == "victory":
        for note, start, dur in (("D4", 0, .8), ("F4", .65, .7), ("G4", 1.25, .7), ("A4", 1.85, .8), ("D5", 2.6, 2.0)):
            add_note(audio, note, start, dur, "horn", .15)
            add_note(audio, note, start, dur, "pluck", .08, .25)
        add_signal(audio, taiko(1.2, .9), 2.5, .18, 0)
    else:
        add_signal(audio, taiko(1.0, 1.0), 0, .22, -.1)
        add_note(audio, "C3", .1, 3.2, "strings", .18, -.2)
        add_note(audio, "Db3", .65, 2.6, "strings", .16, .2)
        add_note(audio, "C4", 1.4, 1.6, "erhu", .13, 0)
    add_reverb(audio, .75)
    fade = min(int(.9 * SR), len(audio))
    audio[-fade:] *= np.cos(np.linspace(0, math.pi / 2, fade))[:, None] ** 2
    return master(audio, .145, .88)


LOOP_DEFS = [
    ("bgm_wutan_daily", "乌坦晨火", "乌坦城、萧家、坊市日常", town, ["wutan_city", "xiao_clan", "daily"]),
    ("bgm_ring_mystery", "戒中残魂", "药老、戒指、隐秘传承", mystery, ["yaolao", "ring", "mystery"]),
    ("bgm_alchemy", "炉心百炼", "炼药、控火、药材处理", alchemy, ["alchemy", "training", "fire_control"]),
    ("bgm_magic_beast_mountain", "魔兽山脉", "野外探索、采药、魔兽山脉", forest, ["wilderness", "magic_beast_mountain", "exploration"]),
    ("bgm_tension", "危机暗涌", "敌意、追踪、战前紧张", tension, ["danger", "pursuit", "prebattle"]),
    ("bgm_battle", "逆焰而战", "普通战斗、强度一至二", battle, ["battle", "combat", "intensity_2"]),
    ("bgm_yunlan", "云岚之上", "云岚宗、宗门威压、三年之约前奏", yunlan, ["yunlan_sect", "sect", "solemn"]),
    ("bgm_tager_desert", "塔戈尔风沙", "塔戈尔沙漠、蛇人族外围", desert, ["tager_desert", "snake_people", "desert"]),
    ("bgm_bond", "故人灯火", "师徒、亲情、友情与安静回忆", emotion, ["bond", "family", "warm", "memory"]),
]

STINGER_DEFS = [
    ("stinger_yaolao_appears", "一缕残魂", "mystery", ["yaolao_appears"], 90),
    ("stinger_heavenly_flame", "异火现世", "fire", ["heavenly_flame_appears", "devour_flame"], 100),
    ("stinger_breakthrough", "破境", "breakthrough", ["level_breakthrough", "cultivation_success"], 95),
    ("stinger_boss", "强敌压境", "boss", ["boss_appears", "elite_enemy"], 98),
    ("stinger_victory", "逆转", "victory", ["battle_victory", "counterattack_success"], 80),
    ("stinger_danger", "杀意骤起", "danger", ["ambush", "sudden_danger"], 92),
]


def encode_ogg(audio: np.ndarray, path: Path) -> None:
    temp = OUT / "_render_temp.wav"
    write_wav(temp, audio)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("未找到 ffmpeg，无法生成 OGG。")
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(temp),
                    "-codec:a", "libopus", "-b:a", "160k", str(path)], check=True)
    temp.unlink()


def encode_mp3(audio: np.ndarray, path: Path) -> None:
    temp = OUT / "_preview_temp.wav"
    write_wav(temp, audio)
    ffmpeg = shutil.which("ffmpeg")
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(temp),
                    "-codec:a", "libmp3lame", "-b:a", "256k", str(path)], check=True)
    temp.unlink()


def main() -> None:
    LOOPS.mkdir(parents=True, exist_ok=True)
    STINGERS.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "project": "斗破苍穹游戏动态音乐", "default_fade_seconds": 1.5,
                "minimum_hold_seconds": 20, "cues": []}
    previews = []

    for cue_id, title, use, recipe, tags in LOOP_DEFS:
        print(f"生成循环：{title}")
        audio, nominal, bpm, key = recipe()
        filename = f"{cue_id}_{title}.ogg"
        encode_ogg(audio, LOOPS / filename)
        previews.append(audio[:min(len(audio), int(10 * SR))])
        manifest["cues"].append({
            "id": cue_id, "name": title, "type": "loop", "file": f"loops/{filename}",
            "duration_seconds": round(len(audio) / SR, 3), "loop_start_seconds": 0,
            "loop_end_seconds": round(len(audio) / SR, 3), "bpm": bpm, "key": key,
            "use": use, "tags": tags, "priority": 40 if cue_id != "bgm_battle" else 60,
            "fade_in_seconds": .6 if cue_id == "bgm_battle" else 1.5,
            "fade_out_seconds": .8 if cue_id == "bgm_battle" else 1.5,
        })

    silence = np.zeros((int(.65 * SR), 2))
    for cue_id, title, kind, events, priority in STINGER_DEFS:
        print(f"生成短过场：{title}")
        audio = stinger(kind)
        filename = f"{cue_id}_{title}.ogg"
        encode_ogg(audio, STINGERS / filename)
        previews.extend((silence, audio[:min(len(audio), int(5 * SR))]))
        manifest["cues"].append({
            "id": cue_id, "name": title, "type": "stinger", "file": f"stingers/{filename}",
            "duration_seconds": round(len(audio) / SR, 3), "events": events, "priority": priority,
            "duck_bgm_db": -12, "resume_previous_bgm": kind not in ("boss", "danger"),
        })

    (OUT / "music_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    preview = master(np.concatenate(previews), .13, .87)
    encode_mp3(preview, OUT / "斗破苍穹_动态剧情BGM_整套试听.mp3")
    print(f"完成：{len(LOOP_DEFS)} 条循环音乐，{len(STINGER_DEFS)} 条短过场。")


if __name__ == "__main__":
    main()

