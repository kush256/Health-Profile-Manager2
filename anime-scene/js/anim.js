/* =====================================================================
   anim.js — keyframes, gaits and reusable movement building blocks
   ===================================================================== */
'use strict';

const FPS_ANIM = 24;                                   // character animation is timed at 24 fps
const onFrame = t => Math.floor(t * FPS_ANIM + 1e-6) / FPS_ANIM;

const EASE = {
  lin: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in3: t => t * t * t,
  out3: t => 1 - Math.pow(1 - t, 3),
  out4: t => 1 - Math.pow(1 - t, 4),
  inOut3: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  hold: t => (t < 1 ? 0 : 1),
};
const mixV = (a, b, u) => (Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * u) : a + (b - a) * u);
function crV(p0, p1, p2, p3, u) {
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return Array.isArray(p1) ? p1.map((_, i) => f(p0[i], p1[i], p2[i], p3[i])) : f(p0, p1, p2, p3);
}
/* track(keys, mode)
   keys: [[time, value, easing?], ...]  value = number or [numbers]
   easing on a key = how we arrive at it (default inOut).
   mode 'ease'   – per-segment easing; never overshoots (feet, holds)
   mode 'smooth' – Catmull-Rom through the keys: curved arcs between key
                   poses and a natural overshoot-and-settle (hands, head) */
function track(keys, mode = 'ease') {
  const n = keys.length;
  return t => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (t >= keys[i + 1][0]) i++;
    const [t0, v0] = keys[i], [t1, v1, e] = keys[i + 1];
    const u = (EASE[e || 'inOut'])((t - t0) / (t1 - t0));
    if (mode === 'ease') return mixV(v0, v1, u);
    return crV(keys[Math.max(0, i - 1)][1], v0, v1, keys[Math.min(n - 1, i + 2)][1], u);
  };
}

/* ---------- stance geometry (local px) ---------- */
const SIDE_LEG = 463;      // pelvis joint above the sole, leg straight
const FRONT_LEG = 475;
const SIDE_BALL = 40 - 105;   // ball of foot relative to pelvis, rest pose
const FRONT_SOLE = { l: 84 - 166, r: 252 - 166 };

/* ---------- gait: walk / run with planted feet ---------- */
/* opts: { G (ground y), s (scale), x0, dur, speed(t) world px/s, cadence(t) cycles/s,
           duty (fraction of the cycle a foot is on the ground), lift, kick,
           drop (knee bend, local px), bob (local px), runBob (true = lowest at contact) }
   Body moves toward −x (the side rig faces left). */
function makeGait(o) {
  const N = Math.ceil(o.dur * 240) + 480, dt = 1 / 240;
  const xs = new Float64Array(N), ph = new Float64Array(N);
  let x = o.x0, c = 0;
  for (let i = 0; i < N; i++) {
    xs[i] = x; ph[i] = c;
    const t = (i - 240) * dt;                // table starts 1 s before t = 0
    x -= o.speed(t) * dt;
    c += o.cadence(t) * dt;
  }
  const idx = t => clamp((t + 1) * 240, 0, N - 1.001);
  const at = (arr, t) => { const f = idx(t), i = Math.floor(f), u = f - i; return arr[i] + (arr[i + 1] - arr[i]) * u; };
  const timeOfPhase = target => {               // invert the monotonic phase table
    let lo = 0, hi = N - 1;
    if (target <= ph[0]) return -1;
    if (target >= ph[N - 1]) return (N - 1) / 240 - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ph[m] < target) lo = m; else hi = m; }
    const u = (target - ph[lo]) / (ph[hi] - ph[lo] || 1);
    return (lo + u) / 240 - 1;
  };
  const plant = (k, off) => at(xs, timeOfPhase(k - off + o.duty / 2)) + o.s * (SIDE_BALL + 10);
  function foot(t, off) {
    const c = at(ph, t) + off, k = Math.floor(c), u = c - k;
    if (u < o.duty) {                             // stance: the foot does not move
      const a = u / o.duty;
      let roll = 0;
      if (a < 0.15) roll = lerp(-0.32, 0, a / 0.15) * o.heel;
      else if (a > 0.55) roll = lerp(0, 0.75, (a - 0.55) / 0.45) * o.toe;
      return { x: plant(k, off), y: o.G, roll, phase: 'stance', a };
    }
    const sw = (u - o.duty) / (1 - o.duty);       // swing: lift, carry forward, place
    const from = plant(k, off), to = plant(k + 1, off);
    const fx = lerp(from, to, EASE.inOut(Math.pow(sw, o.kick ? 1.35 : 1)));
    const kick = o.kick ? o.kick * o.s * Math.sin(Math.PI * Math.min(1, sw * 1.6)) : 0;
    const fy = o.G - o.lift * o.s * Math.pow(Math.sin(Math.PI * sw), 0.8);
    const roll = sw < 0.35 ? lerp(0.75 * o.toe, 0.15, sw / 0.35) : lerp(0.15, -0.3 * o.heel, (sw - 0.35) / 0.65);
    return { x: fx + kick, y: fy, roll, phase: 'swing', a: sw };
  }
  function armSwing(t, off) {                     // opposite to the leg on the same side
    const c = at(ph, t) + off, u = c - Math.floor(c);
    return u < o.duty ? -Math.cos(Math.PI * u / o.duty) : Math.cos(Math.PI * (u - o.duty) / (1 - o.duty));
  }
  function body(t) {
    const c = at(ph, t);
    const w = Math.cos(4 * Math.PI * (c - o.duty / 2));
    const bob = o.runBob ? -w : w;               // walk: highest when passing; run: lowest at contact
    return { x: at(xs, t), y: o.G - o.s * (SIDE_LEG - o.drop - o.bob * bob), phase: c };
  }
  return { foot, armSwing, body, speedAt: o.speed };
}

/* ---------- side-view building blocks ---------- */
// ground positions for a side stance: lead (far) foot forward, rear (near) foot back
function sideStance(gx, G, s, { width = 1, drop = 30, rearHeel = 0.12 } = {}) {
  return {
    pelvis: [gx, G - s * (SIDE_LEG - drop)],
    f: { x: gx + s * (SIDE_BALL - 70 * width), y: G, roll: 0 },
    n: { x: gx + s * (SIDE_BALL + 95 * width), y: G, roll: rearHeel },
  };
}
// fist targets relative to each shoulder (local px)
const GUARD_SIDE = { f: [-185, -78], n: [-74, -84] };
const GUARD_FRONT = { l: [52, -82], r: [-52, -82] };   // used with upper-arm foreshortening fs ≈ 0.55
