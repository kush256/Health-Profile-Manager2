#!/usr/bin/env python3
"""Mix the scratch soundtrack: fitted dialogue lines at their scene times + procedural footsteps
(from output/events.json, written by the renderer so foley lands on the animated foot contacts)."""
import json, os, wave
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR, DUR = 22050, 10.0

def read(p):
    with wave.open(p) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

mix = np.zeros(int(SR * DUR))
lines = {'stomu': 4.10, 'brainu': 6.30, 'intestino': 8.42}
for k, t in lines.items():
    a = read(os.path.join(ROOT, 'audio', f'{k}.wav')) * 0.9
    i = int(t * SR); mix[i:i + len(a)] += a[:len(mix) - i]
rng = np.random.default_rng(3)
for e in json.load(open(os.path.join(ROOT, 'output', 'events.json'))):
    n = int(0.09 * SR); tt = np.arange(n) / SR
    f0 = 95 if e['who'] == 'stomu' else 130
    thump = np.sin(2 * np.pi * f0 * tt * (1 - tt * 3)) * np.exp(-tt * 45) + rng.normal(0, 0.25, n) * np.exp(-tt * 90)
    i = int(e['t'] * SR); mix[i:i + n] += 0.22 * e['v'] * thump[:len(mix) - i]
mix /= max(1.0, np.abs(mix).max() / 0.95)
with wave.open(os.path.join(ROOT, 'output', 'mix.wav'), 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('mix.wav written')
