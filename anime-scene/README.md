# Rooftop Strike — version 2

A 15-second 2D anime action sequence built from the original character
reference sheet, plus a library of individual moves. Version 2 replaces whole-image
swaps with a jointed cutout puppet, so the body actually moves.

## Open and play

1. Unzip the folder anywhere.
2. Double-click `index.html`. No server, API key or install needed; it works offline
   (the two web fonts are optional and fall back to system fonts).
3. Controls: **Play/Pause**, **Restart**, the clip menu and the timeline.
   Keyboard: `Space` play/pause, `R` restart, `,` and `.` step one animation frame.
4. Choose a clip from the menu, or open `index.html#run`, `#jump`, `#punch`, etc.

Version 1 is preserved in `v1/index.html`.

## Export the MP4 (1920 × 1080, 30 fps)

`rooftop-strike.mp4` is already rendered. To render again or render another clip:

```bash
npm install playwright
npx playwright install chromium
node tools/render-mp4.cjs                              # the 15 s sequence → rooftop-strike.mp4
node tools/render-mp4.cjs --clip run --out run.mp4     # any clip id from the menu
node tools/render-mp4.cjs --fps 60 --out smooth.mp4
```

It needs `ffmpeg` on your PATH. The script draws every frame through
`window.SCENE.renderAt(clip, time)`, so the video is frame-exact on any machine.
Browsers can't read pixels back from a page opened as a file, so the script
serves the folder from a local server while it renders.

Without Node, you can screen-record the page instead: set the browser window to
1920 × 1080, press Restart, record 15 s with OBS or the system recorder at 30 fps,
then trim.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html` | Player page |
| `js/world.js` | Sky, skyline, rooftop, anime effects (speed lines, impact burst, shockwave, embers) |
| `rig-data.js` | Joint data for the puppet (generated) |
| `js/rig.js` | Cutout puppet: IK, joint caps, hand and head swaps, eyelids, gaze, secondary motion, rim light |
| `js/anim.js` | Keyframe tracks (eased or Catmull-Rom arcs), walk/run gait generator, stance helpers |
| `js/clips.js` | Choreography: the 15 s sequence and the move library |
| `js/player.js` | Render loop, controls, clip menu, export hook |
| `sprites/` | The eight original cut-outs from the reference sheet |
| `sprites/rig/` | 22 body parts cut from the front, side and action drawings |
| `tools/slice_sheet.py` | Cuts the reference sheet into the eight sprites |
| `tools/rig_cut.py` | Cuts the sprites into body parts; writes `rig-data.js` and debug overlays |
| `tools/pose-inspector.html` | Shows the puppet in test poses for checking cuts and joints |
| `tools/render-mp4.cjs` | MP4 exporter |

## What improved over version 1

* **A real rig instead of picture swaps.** The front and side drawings are cut
  into head, torso, upper arms, forearms, fists, thighs, shins and (side view) feet.
  Every part ends on its joint line with a round cap of the original pixels, so
  elbows, knees and ankles bend without gaps.
* **Inverse kinematics.** Two-bone IK on every limb. Feet are pinned to world
  positions, so the body can shift, crouch and rotate while the feet stay planted.
  The solver always picks the anatomical elbow and knee direction.
* **Foreshortening for the front view.** Bent knees and a raised guard point toward
  the camera, so those limbs shorten instead of bowing sideways.
* **Hand swaps.** Open hands become fists taken from the action pose, fitted at the wrist.
  The IK always aims the full hand, so a swap never makes the arm jump.
* **24 fps animation timing.** The character is animated on 24 fps frames. The
  camera and effects run smoothly at display rate.
* **Arcs, overshoot and settle.** Hands, head and torso use Catmull-Rom curves
  through the key poses. Feet and the pelvis use eased segments that never overshoot.
* **Secondary motion with a physical cause.** Hair drag comes from body and
  head velocity, sampled from earlier frames, with overshoot when the body stops,
  plus wind. The head lags behind torso lean. The punch has smear frames.
* **The punch.** Weight shifts to the rear leg, the arm draws back and the hips and
  shoulders coil. Then the hips and shoulders rotate, the rear heel pivots on the ball
  of the foot, and the fist travels a curved path with stretch and smear frames.
  Contact comes with a 6-frame hit-stop and two inverted impact frames.
  After the follow-through, the arm retracts along an arc and a balance step settles the weight.
* **Weight.** Breathing lifts the shoulders. In stance the weight rocks front and back
  with the rear heel answering. Every landing and step compresses the knees and recovers.
* **Expression system.** Eleven presets: neutral, focused, determined, angry,
  surprised, fear, smirk, pain, shouting, exhausted and grin. A preset combines a
  drawing with eyelid level, head tilt, push and tremble. The numeric parts blend,
  and a drawing swap happens behind a blink. Eyelids, blinks and gaze are painted
  onto the original drawings.
* **Move library:** idle, head movement (look left, right, up and down, to camera,
  snap reaction, slow threatening turn, confused tilt, recoil, slip), expressions,
  walk cycle, run with acceleration and stop, five-stage jump, eight-stage punch,
  block, lean-back dodge, duck, and hit with recoil.

## Quality checks that were run

* `node --check` on every script; no browser console errors in any clip.
* Opened directly from `file://` in Chromium. Every asset loads with no server.
* An automated pass over every 24 fps frame of every clip measured planted-foot drift,
  IK target misses and frame-to-frame jumps of the head, hands and feet:
  * The 15 s sequence has **0 px** planted-foot drift and **0 px** IK misses.
  * Library clips stay within 3.6 px. That's a heel roll in the dodge, and the
    landing reach in the jump, where the feet stretch for the floor on the frame before contact.
* Key poses were checked visually in contact sheets and in a frame strip of the punch.
* The exported MP4 was checked for size, frame rate, frame count and duration,
  and frames pulled from it were inspected.

## Limitations, and the artwork that would remove them

The puppet is built from **one front drawing, one side drawing and two fists**. It
can bend, rotate and foreshorten those drawings, but it can't invent new views.
Here's where that shows, and what would fix it:

| Limitation now | Artwork that fixes it |
| --- | --- |
| Turning between the front and side views is a squash-and-swap smear, not a real turn | 3/4 front and 3/4 back turnaround views |
| The torso can't twist; hip and shoulder rotation is suggested by shifting the shoulder and hip joints and widening the torso | Torso drawn at 3/4 for punch wind-up and extension |
| The side view has one expression; only the eyelids change | Side-view heads: angry, shouting (open mouth), pain, smirk |
| Shouting, exhaustion (open mouth) and fear are approximations | Front heads: shouting (open jaw), exhausted (open mouth), fear, smirk at full size |
| Mouths don't animate | Mouth set: closed, slightly open, open, shout |
| Profile fist only; the front fist is a scaled-down foreshortened fist | Side and front fists, open hand, and a fully extended punch fist |
| The far arm and leg are mirrored copies of the near ones, darkened | Separate far-side arm and leg drawings |
| Front-view feet can't roll heel to toe (the boot is one piece with the shin) | Front boots as separate parts |
| Running, jumping and landing reuse standing limb drawings | Run key poses (contact, passing), jump crouch, flight tuck, landing |
| The suit is skin-tight, so cloth secondary motion is limited to breathing and squash | Any loose element (a scarf or jacket) would give the wind and impacts something to move |

To request more Nano Banana reference images, keep the same character sheet as
the reference and ask for each pose on a flat beige background, front or side
view at the same scale. Ask for: front fighting stance, side fighting stance, punch
preparation, fully extended punch, punch recovery, run contact and passing
poses, jump crouch, flight tuck, landing, defensive block, side dodge, and the
3/4 turnarounds. Each new drawing can be cut with `tools/rig_cut.py` the same way.

The YouTube reference couldn't be watched from this environment, because it has no
video playback or frame analysis. The choreography follows the written brief and
standard animation principles instead.
