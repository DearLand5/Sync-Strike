#!/usr/bin/env python3
"""Сборка встроенных звуков: python3 -I tools/build-sounds.py <папка_с_распакованными_паками_kenney>
Каждый пак распакован в <папка>/<pack>/x/Audio/*.ogg (impact, scifi, ui, rpg, digital).
OGG → моно 22050 Гц → обрезка тишины в начале и конце → нормализация пика → затухание хвоста → WAV 16 бит
→ base64 в src/js/02b_sounddata.js (const SOUND_DATA). Нужен ffmpeg."""
import base64, io, json, os, subprocess, sys, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 22050

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def process(x, max_len):
    thr = 10 ** (-48 / 20) * max(1e-6, np.abs(x).max())
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx): x = x[max(0, idx[0] - 22): idx[-1] + 1]      # 1 мс запаса до атаки
    x = x[: int(max_len * SR)]
    peak = np.abs(x).max() or 1
    x = x / peak * 0.89
    fade = min(len(x) // 3, int(0.03 * SR))
    if fade > 0: x[-fade:] *= np.linspace(1, 0, fade)
    return x

def to_wav(x):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()

def main():
    src = sys.argv[1]
    manifest = json.load(open(os.path.join(ROOT, "tools", "sounds.json"), encoding="utf-8"))
    out, total, used = {}, 0, []
    for name, spec in manifest.items():
        if name.startswith("_"): continue
        arr = []
        for f in spec["files"]:
            pack, file = f.split("/", 1)
            path = os.path.join(src, pack, "x", "Audio", file + ".ogg")
            data = to_wav(process(load(path), spec["max"]))
            total += len(data); used.append(f)
            arr.append(base64.b64encode(data).decode())
        out[name] = arr
    lines = ["/* Сгенерировано tools/build-sounds.py из tools/sounds.json — руками не править.",
             "   Звуки: Kenney.nl, лицензия CC0 (public domain). См. CREDITS.md. */",
             "const SOUND_DATA = {"]
    for k, arr in out.items():
        lines.append(f'  {k}: [' + ", ".join(f'"{b}"' for b in arr) + "],")
    lines.append("};")
    js = "\n".join(lines) + "\n"
    open(os.path.join(ROOT, "src", "js", "02b_sounddata.js"), "w", encoding="utf-8").write(js)
    print(f"{len(out)} событий, {len(used)} файлов, WAV {total/1024:.0f} КБ, модуль {len(js)/1024:.0f} КБ")

main()
