"""斗罗原创音乐生成器使用的轻量合成工具。"""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100
RNG = np.random.default_rng(20260816)
NOTE_TO_SEMITONE = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
    "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
    "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
}


def midi_note(name: str) -> int:
    pitch, octave = (name[:2], int(name[2:])) if len(name) >= 3 and name[1] in "#b" else (name[0], int(name[1:]))
    return 12 * (octave + 1) + NOTE_TO_SEMITONE[pitch]


def frequency(note: str | int) -> float:
    midi = midi_note(note) if isinstance(note, str) else note
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def smooth_noise(count: int, width: int = 90) -> np.ndarray:
    noise = RNG.normal(0.0, 1.0, count + width)
    return np.convolve(noise, np.ones(width) / width, mode="valid")[:count]


def envelope(count: int, attack: float, release: float, sustain: float = 1.0) -> np.ndarray:
    result = np.full(count, sustain, dtype=np.float64)
    attack_count = min(count, max(1, int(attack * SAMPLE_RATE)))
    release_count = min(count, max(1, int(release * SAMPLE_RATE)))
    result[:attack_count] *= np.sin(np.linspace(0, math.pi / 2, attack_count)) ** 2
    result[-release_count:] *= np.cos(np.linspace(0, math.pi / 2, release_count)) ** 2
    return result


def synth_note(note: str | int, duration: float, kind: str, velocity: float = 1.0) -> np.ndarray:
    count = max(1, int(duration * SAMPLE_RATE))
    time = np.arange(count, dtype=np.float64) / SAMPLE_RATE
    base_frequency = frequency(note)

    if kind == "flute":
        vibrato = 0.0042 * np.sin(2 * math.pi * 5.2 * time)
        phase = 2 * math.pi * base_frequency * (time + vibrato / (2 * math.pi * 5.2))
        tone = np.sin(phase) + 0.18 * np.sin(2 * phase + 0.2) + 0.055 * np.sin(3 * phase)
        signal = (tone + smooth_noise(count, 120) * 0.09) * envelope(count, 0.075, 0.24)
    elif kind == "erhu":
        vibrato = 0.006 * np.sin(2 * math.pi * 5.6 * time) * np.minimum(1.0, time / 0.35)
        phase = 2 * math.pi * base_frequency * (time + vibrato / (2 * math.pi * 5.6))
        tone = sum((0.78 / harmonic) * np.sin(harmonic * phase + 0.15 * harmonic) for harmonic in range(1, 8))
        signal = (tone + smooth_noise(count, 45) * 0.035) * envelope(count, 0.16, 0.3)
    elif kind == "pluck":
        phase = 2 * math.pi * base_frequency * time
        signal = np.zeros(count)
        for harmonic, amplitude in enumerate((1.0, 0.62, 0.38, 0.22, 0.12, 0.07), start=1):
            signal += amplitude * np.sin(harmonic * phase + harmonic * 0.21) * np.exp(-time * (2.0 + harmonic * 1.25))
        signal += RNG.normal(0, 0.08, count) * np.exp(-time * 30)
        signal *= envelope(count, 0.006, min(0.18, duration * 0.45))
    elif kind == "strings":
        phase = 2 * math.pi * base_frequency * time
        signal = sum((0.72 / harmonic) * np.sin(harmonic * phase + 0.4 * harmonic) for harmonic in range(1, 7))
        signal += 0.32 * np.sin(2 * math.pi * base_frequency * 1.006 * time)
        signal *= envelope(count, min(0.55, duration * 0.3), min(0.65, duration * 0.35), 0.88)
    elif kind == "horn":
        phase = 2 * math.pi * base_frequency * time
        signal = 0.95 * np.sin(phase) + 0.45 * np.sin(2 * phase) + 0.18 * np.sin(3 * phase)
        signal *= envelope(count, 0.22, 0.32, 0.92)
    elif kind == "choir":
        phase = 2 * math.pi * base_frequency * time
        signal = 0.8 * np.sin(phase) + 0.34 * np.sin(2 * phase + 0.3) + 0.14 * np.sin(3 * phase)
        signal += 0.16 * np.sin(2 * math.pi * base_frequency * 1.003 * time + 0.7)
        signal *= envelope(count, 0.65, 0.75, 0.8)
    elif kind == "bass":
        phase = 2 * math.pi * base_frequency * time
        signal = np.sin(phase) + 0.28 * np.sin(2 * phase) + 0.11 * np.sin(3 * phase)
        signal *= envelope(count, 0.035, 0.22, 0.9)
    elif kind == "bell":
        phase = 2 * math.pi * base_frequency * time
        signal = (np.sin(phase) * np.exp(-time * 1.5)
                  + 0.52 * np.sin(2.71 * phase) * np.exp(-time * 2.2)
                  + 0.25 * np.sin(4.08 * phase) * np.exp(-time * 3.0))
        signal *= envelope(count, 0.004, min(0.4, duration * 0.6))
    else:
        signal = np.sin(2 * math.pi * base_frequency * time) * envelope(count, 0.02, 0.15)

    return signal / max(1e-9, float(np.max(np.abs(signal)))) * velocity


def pan_stereo(signal: np.ndarray, pan: float) -> np.ndarray:
    angle = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi / 4.0
    return np.column_stack((signal * math.cos(angle), signal * math.sin(angle)))


def add_signal(bus: np.ndarray, signal: np.ndarray, start: float, gain: float, pan: float = 0.0) -> None:
    index = max(0, int(start * SAMPLE_RATE))
    if index >= len(bus):
        return
    end = min(len(bus), index + len(signal))
    bus[index:end] += pan_stereo(signal[:end - index], pan) * gain


def taiko(duration: float = 1.15, accent: float = 1.0) -> np.ndarray:
    count = int(duration * SAMPLE_RATE)
    time = np.arange(count) / SAMPLE_RATE
    phase = 2 * math.pi * (42.0 * time + 50.0 * (1 - np.exp(-time * 9.0)) / 9.0)
    body = np.sin(phase) + 0.42 * np.sin(phase * 1.51 + 0.2)
    skin = RNG.normal(0, 1, count) * np.exp(-time * 20.0) * 0.28
    return (body * np.exp(-time * 3.5) + skin) * accent


def shaker(duration: float = 0.12) -> np.ndarray:
    count = int(duration * SAMPLE_RATE)
    time = np.arange(count) / SAMPLE_RATE
    noise = RNG.normal(0, 1, count)
    return np.concatenate(([0.0], np.diff(noise))) * np.exp(-time * 32.0) * 0.35


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm16 = (np.clip(audio, -1, 1) * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm16.tobytes())
