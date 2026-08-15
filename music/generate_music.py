#!/usr/bin/env python3
"""生成《斗破苍穹》原创主主题 Demo、探索循环和 MIDI 草案。"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parent
SAMPLE_RATE = 44_100
BPM = 84.0  # 6/8 拍中的附点四分音符速度
PULSE_SECONDS = 60.0 / BPM
BAR_SECONDS = PULSE_SECONDS * 2.0
TOTAL_BARS = 64
TAIL_SECONDS = 3.5
TOTAL_SECONDS = TOTAL_BARS * BAR_SECONDS + TAIL_SECONDS
RNG = np.random.default_rng(20260815)


NOTE_TO_SEMITONE = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


def midi_note(name: str) -> int:
    if len(name) >= 3 and name[1] in "#b":
        pitch, octave = name[:2], int(name[2:])
    else:
        pitch, octave = name[0], int(name[1:])
    return 12 * (octave + 1) + NOTE_TO_SEMITONE[pitch]


def frequency(note: str | int) -> float:
    midi = midi_note(note) if isinstance(note, str) else note
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def smooth_noise(count: int, width: int = 90) -> np.ndarray:
    noise = RNG.normal(0.0, 1.0, count + width)
    kernel = np.ones(width, dtype=np.float64) / width
    return np.convolve(noise, kernel, mode="valid")[:count]


def envelope(count: int, attack: float, release: float, sustain: float = 1.0) -> np.ndarray:
    env = np.full(count, sustain, dtype=np.float64)
    a = min(count, max(1, int(attack * SAMPLE_RATE)))
    r = min(count, max(1, int(release * SAMPLE_RATE)))
    env[:a] *= np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    env[-r:] *= np.cos(np.linspace(0, math.pi / 2, r)) ** 2
    return env


def synth_note(note: str | int, duration: float, kind: str, velocity: float = 1.0) -> np.ndarray:
    count = max(1, int(duration * SAMPLE_RATE))
    t = np.arange(count, dtype=np.float64) / SAMPLE_RATE
    f = frequency(note)

    if kind == "flute":
        vibrato = 0.0042 * np.sin(2 * math.pi * 5.2 * t)
        phase = 2 * math.pi * f * (t + vibrato / (2 * math.pi * 5.2))
        tone = np.sin(phase) + 0.18 * np.sin(2 * phase + 0.2) + 0.055 * np.sin(3 * phase)
        breath = smooth_noise(count, 120) * 0.09
        sig = (tone + breath) * envelope(count, 0.075, 0.24)
    elif kind == "erhu":
        vibrato = 0.006 * np.sin(2 * math.pi * 5.6 * t) * np.minimum(1.0, t / 0.35)
        phase = 2 * math.pi * f * (t + vibrato / (2 * math.pi * 5.6))
        tone = sum((0.78 / h) * np.sin(h * phase + 0.15 * h) for h in range(1, 8))
        bow = smooth_noise(count, 45) * 0.035
        sig = (tone + bow) * envelope(count, 0.16, 0.3)
    elif kind == "pluck":
        phase = 2 * math.pi * f * t
        sig = np.zeros(count)
        for h, amp in enumerate((1.0, 0.62, 0.38, 0.22, 0.12, 0.07), start=1):
            sig += amp * np.sin(h * phase + h * 0.21) * np.exp(-t * (2.0 + h * 1.25))
        sig += RNG.normal(0, 0.08, count) * np.exp(-t * 30)
        sig *= envelope(count, 0.006, min(0.18, duration * 0.45))
    elif kind == "strings":
        phase = 2 * math.pi * f * t
        sig = sum((0.72 / h) * np.sin(h * phase + 0.4 * h) for h in range(1, 7))
        sig += 0.32 * np.sin(2 * math.pi * f * 1.006 * t)
        sig *= envelope(count, min(0.55, duration * 0.3), min(0.65, duration * 0.35), 0.88)
    elif kind == "horn":
        phase = 2 * math.pi * f * t
        sig = 0.95 * np.sin(phase) + 0.45 * np.sin(2 * phase) + 0.18 * np.sin(3 * phase)
        sig *= envelope(count, 0.22, 0.32, 0.92)
    elif kind == "choir":
        phase = 2 * math.pi * f * t
        sig = 0.8 * np.sin(phase) + 0.34 * np.sin(2 * phase + 0.3) + 0.14 * np.sin(3 * phase)
        sig += 0.16 * np.sin(2 * math.pi * f * 1.003 * t + 0.7)
        sig *= envelope(count, 0.65, 0.75, 0.8)
    elif kind == "bass":
        phase = 2 * math.pi * f * t
        sig = np.sin(phase) + 0.28 * np.sin(2 * phase) + 0.11 * np.sin(3 * phase)
        sig *= envelope(count, 0.035, 0.22, 0.9)
    elif kind == "bell":
        phase = 2 * math.pi * f * t
        sig = (
            np.sin(phase) * np.exp(-t * 1.5)
            + 0.52 * np.sin(2.71 * phase) * np.exp(-t * 2.2)
            + 0.25 * np.sin(4.08 * phase) * np.exp(-t * 3.0)
        )
        sig *= envelope(count, 0.004, min(0.4, duration * 0.6))
    else:
        sig = np.sin(2 * math.pi * f * t) * envelope(count, 0.02, 0.15)

    peak = max(1e-9, float(np.max(np.abs(sig))))
    return (sig / peak) * velocity


def pan_stereo(signal: np.ndarray, pan: float) -> np.ndarray:
    pan = max(-1.0, min(1.0, pan))
    angle = (pan + 1.0) * math.pi / 4.0
    return np.column_stack((signal * math.cos(angle), signal * math.sin(angle)))


def add_signal(bus: np.ndarray, signal: np.ndarray, start: float, gain: float, pan: float = 0.0) -> None:
    index = max(0, int(start * SAMPLE_RATE))
    if index >= len(bus):
        return
    end = min(len(bus), index + len(signal))
    bus[index:end] += pan_stereo(signal[: end - index], pan) * gain


def bar_time(bar: float) -> float:
    return bar * BAR_SECONDS


def pulse_time(pulse: float) -> float:
    return pulse * PULSE_SECONDS


def add_note(bus: np.ndarray, note: str, start_pulse: float, duration_pulse: float, kind: str,
             gain: float, pan: float = 0.0, velocity: float = 1.0) -> None:
    sig = synth_note(note, pulse_time(duration_pulse) + 0.2, kind, velocity)
    add_signal(bus, sig, pulse_time(start_pulse), gain, pan)


def taiko(duration: float = 1.15, accent: float = 1.0) -> np.ndarray:
    count = int(duration * SAMPLE_RATE)
    t = np.arange(count) / SAMPLE_RATE
    f0, f1 = 92.0, 42.0
    phase = 2 * math.pi * (f1 * t + (f0 - f1) * (1 - np.exp(-t * 9.0)) / 9.0)
    body = np.sin(phase) + 0.42 * np.sin(phase * 1.51 + 0.2)
    skin = RNG.normal(0, 1, count) * np.exp(-t * 20.0) * 0.28
    return (body * np.exp(-t * 3.5) + skin) * accent


def shaker(duration: float = 0.12) -> np.ndarray:
    count = int(duration * SAMPLE_RATE)
    t = np.arange(count) / SAMPLE_RATE
    noise = RNG.normal(0, 1, count)
    filtered = np.concatenate(([0.0], np.diff(noise)))
    return filtered * np.exp(-t * 32.0) * 0.35


def fire_texture(seconds: float) -> np.ndarray:
    count = int(seconds * SAMPLE_RATE)
    raw = RNG.normal(0, 1, count)
    low = np.convolve(raw, np.ones(35) / 35, mode="same")
    texture = (raw - low) * 0.018
    for _ in range(int(seconds * 2.2)):
        pos = int(RNG.uniform(0, count - 900))
        length = int(RNG.uniform(140, 800))
        t = np.arange(length) / SAMPLE_RATE
        pop = RNG.normal(0, 1, length) * np.exp(-t * RNG.uniform(60, 140))
        texture[pos:pos + length] += pop * RNG.uniform(0.04, 0.12)
    return texture


# 每小节和声：主调坚实，间或用降二级制造“异火”危险感。
CHORDS = [
    ("D3", "F3", "A3"), ("D3", "F3", "A3"), ("Bb2", "D3", "F3"), ("C3", "E3", "G3"),
    ("D3", "F3", "A3"), ("G2", "D3", "G3"), ("Bb2", "F3", "A3"), ("A2", "E3", "A3"),
]


PHRASE_A = [
    (0.00, "D4", 0.55), (0.62, "F4", 0.38), (1.00, "G4", 0.48), (1.52, "A4", 0.44),
    (2.00, "C5", 0.70), (2.82, "A4", 0.45), (3.35, "G4", 0.55),
    (4.00, "F4", 0.48), (4.55, "G4", 0.42), (5.02, "A4", 0.92),
    (6.00, "D5", 0.82), (6.92, "C5", 0.36), (7.38, "A4", 0.58),
    (8.00, "G4", 0.54), (8.60, "F4", 0.36), (9.02, "D4", 0.90),
    (10.00, "F4", 0.46), (10.52, "G4", 0.42), (11.00, "A4", 0.88),
    (12.00, "C5", 0.45), (12.52, "D5", 0.42), (13.00, "F5", 0.75),
    (14.00, "E5", 0.34), (14.44, "C5", 0.40), (15.00, "A4", 0.92),
]


PHRASE_B = [
    (0.00, "D5", 0.42), (0.48, "Eb5", 0.18), (0.74, "D5", 0.28), (1.08, "A4", 0.70),
    (2.00, "C5", 0.42), (2.50, "D5", 0.40), (3.00, "F5", 0.82),
    (4.00, "G5", 0.44), (4.52, "F5", 0.40), (5.02, "D5", 0.82),
    (6.00, "C#5", 0.22), (6.30, "D5", 0.32), (6.70, "A5", 0.82),
    (8.00, "G5", 0.42), (8.48, "F5", 0.42), (9.00, "D5", 0.88),
    (10.00, "C5", 0.38), (10.44, "D5", 0.38), (10.90, "F5", 0.82),
    (12.00, "A5", 0.65), (12.75, "G5", 0.38), (13.22, "F5", 0.50),
    (14.00, "E5", 0.28), (14.36, "C#5", 0.28), (14.72, "D5", 1.04),
]


def render_composition() -> tuple[np.ndarray, list[tuple[str, int, float, float, int]]]:
    mix = np.zeros((int(TOTAL_SECONDS * SAMPLE_RATE), 2), dtype=np.float64)
    midi_events: list[tuple[str, int, float, float, int]] = []

    # 荒域风与火星，极轻地铺在全曲底部。
    fire = fire_texture(TOTAL_SECONDS)
    slow = smooth_noise(len(fire), 1400)
    ambience = fire + slow * 0.022
    add_signal(mix, ambience, 0.0, 0.42, -0.18)
    add_signal(mix, ambience[::-1], 0.0, 0.30, 0.2)

    # 和声与低音。
    for bar in range(TOTAL_BARS):
        chord = CHORDS[bar % len(CHORDS)]
        section_gain = 0.10 if bar < 8 else (0.15 if bar < 40 else 0.19)
        if bar >= 56:
            section_gain *= 0.72
        for i, note in enumerate(chord):
            add_note(mix, note, bar * 2, 2.15, "strings", section_gain, (-0.35, 0.0, 0.35)[i])
            midi_events.append(("和声", midi_note(note), bar * 2, 2.0, 52))
        root = chord[0]
        bass_note = root[0:-1] + str(int(root[-1]) - 1)
        add_note(mix, bass_note, bar * 2, 1.72, "bass", 0.13 if bar < 24 else 0.19, -0.05)
        midi_events.append(("低音", midi_note(bass_note), bar * 2, 1.7, 62))

    # 开场：药老动机，以钟与低箫的距离感出现。
    intro = [(0.0, "D4", 1.5), (2.0, "A3", 1.3), (4.0, "G3", 1.2), (6.0, "D3", 1.8),
             (8.0, "F4", 0.8), (9.0, "G4", 0.7), (10.0, "A4", 1.7), (13.0, "D5", 1.8)]
    for start, note, dur in intro:
        add_note(mix, note, start, dur, "flute", 0.20, -0.12)
        add_note(mix, note, start, dur + 0.6, "bell", 0.055, 0.25)
        midi_events.append(("主题", midi_note(note), start, dur, 68))

    # A 段：萧炎上行动机；第二遍由拨弦回应。
    for offset in (16.0, 32.0):
        for start, note, dur in PHRASE_A:
            add_note(mix, note, offset + start, dur, "flute", 0.25 if offset == 16 else 0.28, -0.12)
            midi_events.append(("主题", midi_note(note), offset + start, dur, 78))
            if offset == 32.0 and start % 2 < 0.1:
                add_note(mix, note, offset + start + 0.5, min(0.45, dur), "pluck", 0.11, 0.35)

    # 固定的琵琶感节奏，从少年启程逐渐变密。
    arp_pattern = (0.0, 0.5, 1.0, 1.5)
    for bar in range(8, 56):
        chord = CHORDS[bar % 8]
        for step, local in enumerate(arp_pattern):
            if bar < 16 and step in (1, 3):
                continue
            note = chord[(step + bar) % 3]
            add_note(mix, note, bar * 2 + local, 0.42, "pluck", 0.075 if bar < 40 else 0.10,
                     0.28 if step % 2 else -0.25)
            midi_events.append(("拨弦", midi_note(note), bar * 2 + local, 0.38, 58))

    # 战鼓：荒域行进感，高潮加入第二击。
    for bar in range(16, 56):
        gain = 0.12 if bar < 24 else (0.18 if bar < 40 else 0.26)
        add_signal(mix, taiko(accent=1.0), bar_time(bar), gain, -0.12)
        midi_events.append(("打击乐", 36, bar * 2, 0.2, int(70 + gain * 120)))
        if bar >= 40:
            add_signal(mix, taiko(0.8, 0.72), bar_time(bar) + PULSE_SECONDS, gain * 0.72, 0.18)
            midi_events.append(("打击乐", 41, bar * 2 + 1, 0.18, 82))
        for k in range(4):
            add_signal(mix, shaker(), bar_time(bar) + k * BAR_SECONDS / 4, 0.028 if bar < 40 else 0.042,
                       0.45 if k % 2 else -0.45)

    # 高潮：异火动机由二胡感领奏，圆号与合唱支撑。
    for phrase_offset in (80.0, 96.0):  # 第 40、48 小节
        for start, note, dur in PHRASE_B:
            add_note(mix, note, phrase_offset + start, dur, "erhu", 0.31, 0.08)
            midi_events.append(("主题", midi_note(note), phrase_offset + start, dur, 92))
    for bar in range(40, 56):
        chord = CHORDS[bar % 8]
        add_note(mix, chord[0], bar * 2, 1.82, "horn", 0.12, -0.23)
        add_note(mix, chord[2], bar * 2, 1.82, "choir", 0.10, 0.2)

    # 结尾：力量退去，留下药老动机与主音，方便形成余韵。
    outro = [(112.0, "A4", 0.8), (113.0, "G4", 0.7), (114.0, "F4", 1.5),
             (116.0, "D4", 1.3), (118.0, "A3", 1.2), (120.0, "D4", 3.3)]
    for start, note, dur in outro:
        add_note(mix, note, start, dur, "flute", 0.22, -0.08)
        add_note(mix, note, start, dur + 0.8, "bell", 0.04, 0.3)
        midi_events.append(("主题", midi_note(note), start, dur, 66))

    # 多抽头混响：保留荒域的宽度，同时不把战鼓糊成一片。
    dry = mix.copy()
    for delay, gain, cross in ((0.19, 0.14, False), (0.37, 0.10, True), (0.61, 0.075, False), (0.93, 0.045, True)):
        shift = int(delay * SAMPLE_RATE)
        source = dry[:-shift, ::-1] if cross else dry[:-shift]
        mix[shift:] += source * gain

    # 温和母带：削除偶发尖峰并留出游戏混音余量。
    mix = np.tanh(mix * 1.22)
    peak = float(np.max(np.abs(mix)))
    mix *= 0.91 / max(peak, 1e-9)
    return mix, midi_events


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm = np.clip(audio, -1, 1)
    pcm16 = (pcm * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(pcm16.tobytes())


def variable_length(value: int) -> bytes:
    buffer = value & 0x7F
    result = bytearray([buffer])
    while value >> 7:
        value >>= 7
        buffer = (value & 0x7F) | 0x80
        result.insert(0, buffer)
    return bytes(result)


def midi_track(name: str, events: list[tuple[int, bytes]]) -> bytes:
    data = bytearray()
    title = name.encode("utf-8")
    data += b"\x00\xff\x03" + variable_length(len(title)) + title
    last_tick = 0
    for tick, payload in sorted(events, key=lambda item: (item[0], 0 if (item[1][0] & 0xF0) == 0x80 else 1)):
        data += variable_length(max(0, tick - last_tick)) + payload
        last_tick = tick
    data += b"\x00\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def write_midi(path: Path, notes: list[tuple[str, int, float, float, int]]) -> None:
    ticks_per_pulse = 480  # 一个 pulse 是附点四分音符；MIDI 中按四分音符组织即可编辑
    tracks = []
    tempo = int(60_000_000 / BPM)
    meta = [
        (0, b"\xff\x51\x03" + tempo.to_bytes(3, "big")),
        (0, b"\xff\x58\x04\x06\x03\x18\x08"),
    ]
    tracks.append(midi_track("速度与拍号", meta))
    programs = {"主题": (0, 73), "和声": (1, 48), "低音": (2, 43), "拨弦": (3, 45), "打击乐": (9, 0)}
    for track_name, (channel, program) in programs.items():
        ev: list[tuple[int, bytes]] = []
        if channel != 9:
            ev.append((0, bytes([0xC0 | channel, program])))
        for name, pitch, start, duration, velocity in notes:
            if name != track_name:
                continue
            on = int(round(start * ticks_per_pulse))
            off = int(round((start + duration) * ticks_per_pulse))
            ev.append((on, bytes([0x90 | channel, pitch, min(127, velocity)])))
            ev.append((off, bytes([0x80 | channel, pitch, 0])))
        tracks.append(midi_track(track_name, ev))
    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), ticks_per_pulse)
    path.write_bytes(header + b"".join(tracks))


def main() -> None:
    audio, midi_events = render_composition()
    wav_path = ROOT / "斗破苍穹_焚天少年_主主题Demo.wav"
    write_wav(wav_path, audio)
    write_midi(ROOT / "斗破苍穹_焚天少年_主题旋律.mid", midi_events)

    # 探索循环取自 A 段到发展段，首尾做 2 秒等功率交叉淡化。
    start = int(bar_time(8) * SAMPLE_RATE)
    end = int(bar_time(40) * SAMPLE_RATE)
    loop = audio[start:end].copy()
    fade_count = int(2.0 * SAMPLE_RATE)
    angle = np.linspace(0, math.pi / 2, fade_count)
    loop[:fade_count] = loop[:fade_count] * np.sin(angle)[:, None] + loop[-fade_count:] * np.cos(angle)[:, None]
    loop = loop[:-fade_count]
    write_wav(ROOT / "_exploration_loop_temp.wav", loop)
    print(f"生成完成：{wav_path.name}（{len(audio) / SAMPLE_RATE:.1f} 秒）")


if __name__ == "__main__":
    main()

