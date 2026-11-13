#!/usr/bin/env python3
"""Build the SCRATCH dialogue track and per-frame lip-sync data.

espeak-ng (Hindi voice) synthesises each line, the line is trimmed and
time-fitted to its slot in the scene, and the loudness envelope of the final
audio drives mouth openness. Mouth *shapes* come from a hand-authored viseme
track (one entry per phoneme group) spread over the voiced audio.

Outputs:
  audio/<id>.wav          fitted line audio (22.05 kHz mono)
  src/lipsync.js          window.LIPSYNC = {...} consumed by the renderer
"""
import json, os, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
SR = 22050

# Viseme codes: M closed lips | A wide open | E spread | O round | U small round
#               L tongue/half open | S teeth together | K mid open
LINES = [
    dict(id='stomu', speaker='STOMU', start=4.10, end=5.86,
         text='बस कर भाई! गोडाउन नहीं है मैं!',
         sub='BAS KAR BHAI! GODOWN NAHI HAI MAIN!',
         voice='hi+m3', pitch=30, speed=185, amp=190,
         phrases=['M A S K A L M A E', 'K O L O L L A K E K E M A E L']),
    dict(id='brainu', speaker='BRAINU', start=6.30, end=7.62,
         text='अरे, मैंने क्या किया?',
         sub='Arre, maine kya kiya?',
         voice='hi+m4', pitch=78, speed=170, amp=170,
         phrases=['A L E', 'M A E L E K E A K E A']),
    dict(id='intestino', speaker='INTESTINO', start=8.42, end=9.86,
         text='तुम दोनों से तो मैं थक गया!',
         sub='Tum dono se toh main thak gaya!',
         voice='hi+m7', pitch=22, speed=180, amp=170,
         phrases=['L U M L O L O S E L O M A E L A K K A E A']),
]


def read_wav(p):
    with wave.open(p) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return a, sr


def write_wav(p, a, sr=SR):
    a = np.clip(a, -1, 1)
    with wave.open(p, 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


def trim(a, thr=0.01):
    idx = np.where(np.abs(a) > thr)[0]
    return a[idx[0]:idx[-1] + 1] if len(idx) else a


def envelope(a, sr):
    hop = sr // FPS
    n = int(np.ceil(len(a) / hop))
    env = np.array([np.sqrt(np.mean(a[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(n)])
    env = env / (np.percentile(env, 92) + 1e-9)
    return np.clip(env, 0, 1.2)


def voiced_chunks(env, thr=0.18, min_gap=3):
    on = env > thr
    chunks, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            chunks.append([i, j])
            i = j
        else:
            i += 1
    merged = []
    for c in chunks:
        if merged and c[0] - merged[-1][1] < min_gap:
            merged[-1][1] = c[1]
        else:
            merged.append(c)
    return merged


def assign_visemes(phrases, chunks, nframes):
    """Return per-frame [viseme, nextViseme, blend] lists."""
    groups = [p.split() for p in phrases]
    if len(groups) != len(chunks):  # fall back: whole line as one group across total voiced span
        groups = [sum(groups, [])]
        chunks = [[chunks[0][0], chunks[-1][1]]] if chunks else [[0, nframes]]
    track = [['X', 'X', 0.0] for _ in range(nframes)]
    for g, (a, b) in zip(groups, chunks):
        w = np.array([2.0 if v in 'AEOU' else 1.0 for v in g])
        edges = a + np.concatenate([[0], np.cumsum(w) / w.sum()]) * (b - a)
        for f in range(a, min(b, nframes)):
            tc = f + 0.5
            k = int(np.clip(np.searchsorted(edges, tc) - 1, 0, len(g) - 1))
            u = (tc - edges[k]) / max(edges[k + 1] - edges[k], 1e-6)
            nxt = g[k + 1] if k + 1 < len(g) else 'X'
            track[f] = [g[k], nxt, float(np.clip((u - 0.6) / 0.4, 0, 1))]
    return track


def main():
    out = {}
    for L in LINES:
        raw = os.path.join(ROOT, 'audio', f"{L['id']}_raw.wav")
        subprocess.run(['espeak-ng', '-v', L['voice'], '-p', str(L['pitch']), '-s', str(L['speed']),
                        '-a', str(L['amp']), '-w', raw, L['text']], check=True)
        a, sr = read_wav(raw)
        a = trim(a)
        target = L['end'] - L['start']
        tempo = (len(a) / sr) / target
        tmp = raw.replace('_raw', '_trim')
        write_wav(tmp, a, sr)
        fit = os.path.join(ROOT, 'audio', f"{L['id']}.wav")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-filter:a',
                        f'atempo={tempo:.4f}', '-ar', str(SR), '-ac', '1', fit], check=True)
        os.remove(raw); os.remove(tmp)
        a, sr = read_wav(fit)
        env = envelope(a, sr)
        chunks = voiced_chunks(env)
        track = assign_visemes(L['phrases'], chunks, len(env))
        out[L['id']] = dict(start=L['start'], end=L['end'], speaker=L['speaker'], sub=L['sub'],
                            env=[round(float(e), 3) for e in env], vis=track)
        print(f"{L['id']}: tempo x{tempo:.2f}, {len(env)} frames, voiced chunks {chunks}")
    with open(os.path.join(ROOT, 'src', 'lipsync.js'), 'w') as f:
        f.write('// generated by tools/make_dialogue.py\nwindow.LIPSYNC = ' + json.dumps(out) + ';\n')


if __name__ == '__main__':
    main()
