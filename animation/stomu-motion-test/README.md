# Stomu Animated Series — Motion Test 01

10 s · 1080×1920 (9:16) · 30 fps · H.264 + AAC → `output/stomu_motion_test_01.mp4`

## How it's built
The characters are **rigged vector cut-out puppets**, rebuilt from the reference sheets in `reference/`. Every frame is drawn fresh: no still images are moved around, and there are no camera moves.

| Layer | File | What it does |
|---|---|---|
| Rig primitives | `src/rig.js` | Rubber-hose limbs bend automatically to reach hand and foot targets. Gloves have continuous finger-curl, index-extend and spread controls, so open hand → fist → point morphs smoothly. Also: sneakers; eyes with lids, look direction and blinks; brows; a mouth with 9 shapes plus smile/skew controls. |
| Characters | `src/characters.js` | Stomu, Brainu and Intestino: body shapes, shading (light from upper left on everyone), face layout and limb anchors. A body-turn control shifts the face, the limb anchors and the brain folds and intestine coils for a 3/4-view effect. |
| Choreography | `src/timeline.js` | The per-scene dope sheet: keyframed channels with easing, overshoot, anticipation and follow-through, plus the walk cycle, background and subtitles. |
| Lip-sync | `tools/make_dialogue.py` → `src/lipsync.js` | espeak-ng (Hindi voice) speaks each line and the clip is fitted to its slot. The audio loudness envelope drives how far the mouth opens; hand-written mouth shapes per line set the shape. |
| Render | `tools/render.mjs` | Headless Chromium draws each frame and pipes the PNGs to ffmpeg. |
| Audio | `tools/mix_audio.py` | Mixes dialogue with synthesized footsteps placed on the animated foot contacts. |

Rebuild everything: `./build.sh` (needs ffmpeg, espeak-ng, Node with Playwright, Python with numpy).
Preview and scrub: open `index.html` in a browser.

### Acting notes per scene
1. **0–2 s:** walk cycle with feet planted at stance mid-points (no foot sliding). Legs alternate, arms swing opposite the legs, the body bobs (contact/down/passing/up) and the face lags behind the body. Stomu stops with a forward overshoot, a squash and a recoil, then huffs. Blinks throughout. Brainu whistles innocently and glances over; Intestino follows Stomu with his eyes.
2. **2–4 s:** eyes lead, then the face/head turns, then the body follows with an overshoot and a small foot shuffle. The right arm lifts and clenches, then the index finger extends into a point. Brows lower and teeth grit. He leans back and inhales as anticipation.
3. **4–6 s:** he lunges into the point. The arm stretches rubber-hose style and arcs under the mouth. Lip-sync uses an enlarged shouting mouth. Brows pump and the finger jabs on loud syllables, the left fist trembles, the body shakes in proportion to loudness, cheeks flush, the back heel lifts. Brainu flinches and Intestino startles.
4. **6–8 s:** Brainu steps back one foot at a time (weight shift, lean back). Eyes widen with overshoot, brows rise, both palms come up with a "whoa" wiggle, his head tilts and shrugs on "kya kiya?". Stomu pants.
5. **8–10 s:** Intestino looks slowly at Stomu, then at Brainu, then rolls his eyes (pupils arc over the top under drooping lids). He uncrosses his arms (one to the hip, one hand to the forehead), raises one sarcastic brow, shakes his head slightly, speaks his line and slumps.

## Known limitations (honest list)
- **Characters are vector rebuilds, not traced from the sheets.** Silhouettes, palette, gloves, sneakers and outlines follow the references, and they are 100% consistent from frame to frame. They are still a stylized rebuild, not a pixel match. For an exact match, send layered artwork (PSD/SVG/AI parts: body, eyes, brows, mouth set, arms, gloves, shoes) and the rig can use it.
- **The 3/4 turn is a 2.5D cheat.** Faces and features slide across the body. There are no hand-drawn side or back views, so the turnaround drawings are not reproduced.
- **The dialogue audio is a scratch track** from a robotic text-to-speech voice (espeak-ng), useful only for timing. No voice-acting model is available here. Replace `audio/<id>.wav` with recorded voices and re-run `./build.sh`; the lip-sync follows the new audio automatically.
- **Lip-sync shapes are approximate.** Mouth opening follows the real audio; the shape of each sound is spread evenly over the voiced audio, with no phoneme alignment.
