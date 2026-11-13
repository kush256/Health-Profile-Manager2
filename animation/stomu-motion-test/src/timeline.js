// =====================================================================
//  timeline.js — scene choreography (the "dope sheet")
//  poseAt(t) builds a full puppet pose for every character at time t (s).
//  All acting is keyed here; nothing is a camera move over a still.
// =====================================================================
(function () {
  const R = window.RIG, C = window.CHARS;
  const { K, E, lerp, clamp, smooth, noise, blink } = R;
  const W = 1080, H = 1920, FPS = 30, DUR = 10;
  const GROUND = 1560, GROUND_BACK = 1275, S1 = 1.2, S2 = 1.0;

  // ---------------- Stomu walk (Scene 1) ----------------
  const SX0 = -300, SX1 = 262, TA = 1.12, TB = 1.62;          // cruise until TA, decelerate to stop at TB
  const V0 = (SX1 - SX0) / (TA + (TB - TA) / 2);
  const stomuX = t => {
    if (t <= TA) return SX0 + V0 * t;
    if (t <= TB) { const u = t - TA, D = TB - TA; return SX0 + V0 * TA + V0 * (u - u * u / (2 * D)); }
    return SX1;
  };
  const stomuSpeed = t => (t <= TA ? 1 : t <= TB ? 1 - (t - TA) / (TB - TA) : 0);
  const WP = 0.64;                                             // walk cycle period (2 steps)
  const sideOff = (sg, tc) => sg * S1 * lerp(10, 40, smooth(1.2, 1.62, tc));
  // Feet are placed from the root path at each stance mid-point, so planted feet never slide.
  function walkFoot(t, off, sg) {
    const c = t / WP + off, n = Math.floor(c), f = c - n;
    const tc = k => (k - off + 0.25) * WP;
    const xs = k => stomuX(tc(k)) + sideOff(sg, tc(k));
    if (f < 0.5) {
      const mv0 = clamp(Math.abs(xs(n) - xs(n - 1)) / 40, 0, 1), mv1 = clamp(Math.abs(xs(n + 1) - xs(n)) / 40, 0, 1);
      let ang = 0;
      if (f < 0.1) ang = -0.28 * (1 - E.o(f / 0.1)) * mv0;            // heel strike, toe up
      if (f > 0.36) ang = 0.38 * E.i((f - 0.36) / 0.14) * mv1;        // heel off
      return { x: xs(n), y: GROUND, ang, contact: tc(n) - 0.25 * WP };
    }
    const u = (f - 0.5) / 0.5, x0 = xs(n), x1 = xs(n + 1), mv = clamp(Math.abs(x1 - x0) / 40, 0, 1);
    return { x: lerp(x0, x1, E.io(u)), y: GROUND - Math.sin(Math.PI * u) * 48 * mv, ang: lerp(0.38, -0.28, E.io(u)) * mv };
  }

  // footstep events (for the scratch foley track)
  function footsteps() {
    const ev = [];
    for (let n = 0; n < 6; n++) for (const off of [0, 0.5]) {
      const tc = n * WP - off * WP;
      if (tc < 0.02 || tc > 1.9) continue;
      const a = stomuX(tc + 0.25 * WP) - stomuX(tc + 0.25 * WP - WP);
      if (Math.abs(a) > 30) ev.push({ t: +tc.toFixed(3), who: 'stomu', v: 0.9 });
    }
    ev.push({ t: 1.66, who: 'stomu', v: 0.7 }, { t: 2.6, who: 'stomu', v: 0.5 }, { t: 6.2, who: 'brainu', v: 0.6 }, { t: 6.44, who: 'brainu', v: 0.55 });
    return ev.sort((a, b) => a.t - b.t);
  }

  // helpers ---------------------------------------------------------
  const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const kv = (t, keys) => K(t, keys);
  const pt = (t, keysX, keysY) => [K(t, keysX), K(t, keysY)];

  // ======================= STOMU =======================
  function stomu(t) {
    const D = C.STOMU, sp = stomuSpeed(t);
    const walking = t < 1.95;
    const x = stomuX(t);
    const phase = t / (WP / 2) - Math.floor(t / (WP / 2));

    // --- line / lip-sync
    const lip = R.lipAt('stomu', t);
    const env = lip ? lip.amp : 0;
    const shoutW = smooth(4.0, 4.12, t) * (1 - smooth(5.85, 6.05, t));
    const shake = shoutW * (0.45 + 0.55 * clamp(env, 0, 1));

    // --- body
    const turn = K(t, [[0, 0.35], [1.6, 0.35], [1.95, 0.06], [2.22, 0.06], [2.72, 0.62, 'ob'], [3.0, 0.58], [7.9, 0.58], [8.4, 0.4]]);
    let lean = K(t, [[0, 0.07], [1.45, 0.07], [1.64, 0.17, 'o'], [1.8, -0.06], [1.96, 0.02], [2.1, 0], [2.35, 0], [2.7, 0.05],
      [3.62, 0.04], [3.98, -0.1, 'io'], [4.1, 0.21, 'o'], [4.28, 0.15], [5.86, 0.15], [6.3, 0.08], [7.8, 0.04], [8.5, 0.0]]);
    let dx = K(t, [[3.95, -6], [4.1, 30, 'o'], [5.9, 28], [6.6, 12], [8.4, 0]]);
    let sy = K(t, [[1.5, 1], [1.64, 0.91, 'o'], [1.78, 1.05], [1.94, 1.0], [3.6, 1], [3.98, 1.06], [4.1, 0.93, 'o'], [4.3, 1.0]]);
    sy += walking ? -0.035 * Math.sin(2 * Math.PI * phase) * sp : 0;
    // breathing: calm → heavy panting after the shout
    const pant = smooth(5.8, 6.0, t) * (1 - smooth(7.6, 8.4, t));
    sy += 0.012 * Math.sin(2 * Math.PI * t / 1.6) * (1 - pant) + 0.03 * Math.sin(2 * Math.PI * t / 0.55) * pant;
    sy += K(t, [[1.72, 0], [1.85, 0.035, 'o'], [2.05, 0]]);          // huff
    let bob = walking ? 13 * Math.sin(2 * Math.PI * phase) * sp : 0;
    bob += K(t, [[1.6, 0], [1.66, 8, 'o'], [1.82, -3], [1.98, 0]]);
    dx += noise(t * 28, 1) * 6 * shake; bob += noise(t * 31, 2) * 3.5 * shake; lean += noise(t * 26, 3) * 0.014 * shake;

    // --- face
    const headLead = K(t, [[2.0, 0], [2.28, 34, 'o'], [2.72, 0, 'io']]);   // face (head) turns before the body
    const faceBob = walking ? -5 * Math.sin(2 * Math.PI * (phase - 0.12)) * sp : 0; // overlapping follow-through
    const look = [
      K(t, [[0, 0.55], [1.62, 0.55], [1.78, 0.0], [2.0, 0.0], [2.12, 0.95, 'o'], [7.9, 0.95], [8.4, 0.55]]),
      K(t, [[0, 0.05], [1.7, 0.05], [1.8, -0.15], [2.0, 0.0], [8.0, 0.05], [8.4, -0.6]]),
    ];
    const anger = K(t, [[0, 0.65], [2.8, 0.65], [3.5, 0.9], [4.05, 1.1, 'o'], [5.9, 1.1], [6.4, 0.85], [8.4, 0.7]]);
    const bl = blink(t, [0.85, 1.98, 3.12, 6.5, 8.62]);
    let mouth;
    if (lip) mouth = Object.assign(lip, { smile: -0.35, teethLines: true });
    else if (t < 1.72) mouth = { smile: -0.55 };
    else if (t < 2.1) mouth = Object.assign(R.mixVis(R.VIS.X, R.VIS.U, Math.sin(Math.PI * smooth(1.72, 2.08, t))), { smile: -0.4 });  // huff
    else if (t < 4.1) {
      const g = smooth(3.45, 3.8, t), inh = smooth(3.8, 4.0, t);
      mouth = R.mixVis(R.mixVis(R.VIS.X, R.VIS.S, g), R.VIS.K, inh * 0.8); mouth.smile = -0.55; mouth.teethLines = true;
    } else {
      mouth = Object.assign({}, R.VIS.S); mouth.o = 0.22 + 0.12 * Math.sin(2 * Math.PI * t / 0.55) * pant; mouth.smile = -0.5; mouth.teethLines = true;
      mouth = R.mixVis(R.VIS.X, mouth, 1 - smooth(7.9, 8.4, t)); mouth.smile = -0.5; mouth.teethLines = true;
    }
    const face = {
      dx: headLead + noise(t * 30, 9) * 3 * shake, dy: faceBob,
      lx: look[0], ly: look[1], blink: bl,
      lidT: 0.18 + 0.1 * anger, tilt: 0.28 + 0.2 * anger, pupil: 1 - 0.15 * shoutW,
      browIn: 8 + 14 * anger + 4 * shoutW * clamp(env, 0, 1), browOut: -8 - 4 * anger, browUp: -2 * anger + K(t, [[3.95, 0], [4.02, 8], [4.15, -4]]),
      mouth, mouthScale: 1 + 0.38 * shoutW, flush: K(t, [[3.9, 0], [4.3, 0.9], [6.2, 0.8], [8.4, 0.15]]),
    };

    // --- arms (body space). R = near arm (in front once he turns), L = far arm
    const sw = walking ? Math.cos(2 * Math.PI * t / WP) * sp : 0;
    const restR = [-180 + 42 * sw, -146 - 6 * Math.abs(sw)], restL = [180 - 42 * sw, -146 - 6 * Math.abs(sw)];
    const hR = [
      K(t, [[2.7, restR[0]], [3.05, -160, 'io'], [3.62, 70, 'io'], [3.98, 20, 'io'], [4.1, 228, 'ob'], [5.9, 220], [6.5, 206], [7.4, 200], [7.95, 150, 'io'], [8.4, -178, 'io']]),
      K(t, [[2.7, restR[1]], [3.05, -186, 'io'], [3.62, -214, 'io'], [3.98, -222, 'io'], [4.1, -236, 'ob'], [5.9, -232], [6.5, -222], [7.4, -214], [7.95, -180, 'io'], [8.4, -146, 'io']]),
    ];
    const jab = lip ? clamp(env, 0, 1.2) * 14 : 0;                   // finger jabs on loud syllables
    hR[0] += jab + noise(t * 24, 5) * 5 * shake; hR[1] += noise(t * 27, 6) * 4 * shake;
    const pointW = smooth(3.4, 3.75, t) * (1 - smooth(7.3, 7.7, t));
    const armRang = t < 2.7 ? Math.PI / 2 + 0.35 * sw : lerp(Math.PI / 2, -0.32, smooth(2.95, 3.7, t)) * (1 - smooth(7.4, 8.3, t)) + Math.PI / 2 * smooth(7.4, 8.3, t);
    const armR = {
      x: t < 2.7 ? restR[0] : hR[0], y: t < 2.7 ? restR[1] : hR[1], ang: armRang,
      curl: K(t, [[2.75, 0.35], [3.05, 0.95], [7.8, 0.95], [8.3, 0.4]]), index: pointW, spread: 0.3,
      front: turn > 0.2, bend: -1,
      side: 1,
    };
    // reach: when the arm is up and across the body, let it stretch rubber-hose style and arc *under* the mouth
    const reach = smooth(3.0, 3.6, t) * (1 - smooth(7.6, 8.3, t));
    if (reach > 0) { armR.len = lerp(D.armLen, 300, reach); armR.via = [lerp(-140, 70, reach), lerp(-150, -128, reach)]; }
    const fistL = smooth(3.0, 3.3, t);
    const armL = {
      x: t < 2.7 ? restL[0] : lerp(restL[0], 178, fistL) + noise(t * 22, 7) * 6 * shoutW,
      y: t < 2.7 ? restL[1] : lerp(restL[1], -150, fistL) + noise(t * 25, 8) * 5 * shoutW,
      ang: Math.PI / 2 - 0.35 * sw - 0.25 * fistL, curl: lerp(0.35, 1, fistL), spread: 0.3, front: false, bend: 1,
    };

    // --- feet
    let fR, fL;
    if (t < 1.95) {
      fL = walkFoot(t, 0, 1); fR = walkFoot(t, 0.5, -1);
      const front = smooth(1.62, 1.9, t);
      fL.yaw = lerp(0.85, 0.42, front); fR.yaw = lerp(0.85, -0.32, front);
    } else {
      const sh = smooth(2.35, 2.62, t);
      fL = { x: SX1 + 48, y: GROUND, ang: 0, yaw: K(t, [[2.3, 0.42], [2.62, 0.8]]) };
      fR = { x: lerp(SX1 - 48, SX1 - 32, sh), y: GROUND - Math.sin(Math.PI * sh) * 18, ang: -0.15 * Math.sin(Math.PI * sh), yaw: lerp(-0.32, 0.75, sh) };
      fR.ang += K(t, [[3.98, 0], [4.12, 0.22, 'o'], [5.9, 0.18], [6.6, 0]]);    // back heel lifts on the lunge
    }
    return { def: D, x, y: GROUND, s: S1, dx, bob, lean, sy, sx: 1 + (1 - sy) * 0.7, turn, face, arms: { R: armR, L: armL }, feet: { R: fR, L: fL } };
  }

  // ======================= BRAINU =======================
  function brainu(t) {
    const D = C.BRAINU;
    const lip = R.lipAt('brainu', t);
    const x = K(t, [[6.0, 768], [6.16, 778], [6.44, 800, 'o']]);
    const turn = K(t, [[0, 0.22], [1.05, 0.22], [1.3, -0.12, 'o'], [2.35, -0.12], [2.7, -0.36], [8.3, -0.36], [8.7, -0.18]]);
    const flinch = K(t, [[4.02, 0], [4.12, 1, 'o'], [4.5, 0.55], [5.9, 0.5], [6.05, 0]]);
    const back = smooth(6.0, 6.35, t);
    let lean = 0.035 * Math.sin(2 * Math.PI * t / 1.3) * (1 - smooth(1.0, 1.4, t))          // innocent sway while whistling
      + 0.02 * Math.sin(2 * Math.PI * (t - 2) / 1.1) * smooth(2.6, 3.0, t) * (1 - smooth(3.9, 4.05, t)) // smug heel rock
      + 0.07 * flinch
      + K(t, [[6.0, 0], [6.22, 0.13, 'o'], [6.5, 0.07], [6.95, 0.07], [7.2, -0.1, 'io'], [7.75, -0.08], [8.3, 0.0]]);
    let sy = 1 + 0.012 * Math.sin(2 * Math.PI * t / 1.7) - 0.07 * K(t, [[4.02, 0], [4.12, 1, 'o'], [4.35, 0.2], [4.6, 0]])
      + K(t, [[6.0, 0], [6.1, 0.05, 'o'], [6.32, -0.03], [6.5, 0], [7.15, 0], [7.35, 0.04, 'o'], [7.7, 0]]);  // shrug
    const bob = K(t, [[6.0, 0], [6.1, -10, 'o'], [6.24, 4], [6.4, 0]]) + 2 * Math.sin(2 * Math.PI * t / 1.3) * (1 - smooth(1.0, 1.4, t));

    // eyes / brows
    const look = [
      K(t, [[0, 0.55], [1.0, 0.55], [1.18, -0.9, 'o'], [8.35, -0.9], [8.6, -0.6, 'o']]),
      K(t, [[0, -0.65], [1.0, -0.65], [1.18, 0.05, 'o'], [8.35, 0.05], [8.6, -0.75, 'o']]),
    ];
    const shock = K(t, [[5.98, 0], [6.12, 1, 'ob'], [7.7, 0.85], [8.3, 0.25]]);
    const bl = Math.max(blink(t, [1.55, 3.35, 5.25, 7.8, 8.95]), K(t, [[4.02, 0], [4.08, 1, 'o'], [4.3, 0.75], [4.5, 0.3], [4.7, 0]]));
    let mouth;
    if (lip) mouth = Object.assign(lip, { smile: 0.05, skew: 0.1 });
    else if (t < 1.1) { mouth = Object.assign({}, R.VIS.U); mouth.o = 0.3 + 0.08 * Math.sin(t * 40); mouth.smile = 0.2; }   // whistling
    else if (t < 4.02) { mouth = { smile: 0.75, skew: 0.45 * smooth(1.1, 1.4, t) }; }                                // smirk
    else if (t < 6.0) { mouth = Object.assign({}, R.VIS.S); mouth.o = 0.25; mouth.smile = -0.3; mouth.teethLines = true; } // grimace in the blast
    else if (t < 6.3) { mouth = Object.assign({}, R.VIS.O); mouth.o = 0.6; mouth.smile = 0; }                       // gasp
    else { mouth = Object.assign({}, R.VIS.E); mouth.o = 0.32; mouth.smile = 0.55; mouth.teethLines = true; }        // sheepish grin
    const face = {
      lx: look[0], ly: look[1], blink: bl, eyeS: 1 + 0.2 * shock, pupil: 1 - 0.25 * shock,
      lidT: 0.05 * (1 - shock), browUp: 4 + 16 * shock + 4 * (1 - smooth(1.0, 1.3, t)), browIn: -10 * shock + 4 * flinch, browOut: 2 * shock,
      browR: -8 * smooth(1.1, 1.35, t) * (1 - smooth(3.95, 4.05, t)), // mischievous raised brow
      dx: 0, mouth,
    };
    // arms: hands behind back → defensive palms-out → slowly lowered
    const def = smooth(6.03, 6.38, t) * (1 - smooth(8.6, 9.35, t));
    const lower = smooth(8.6, 9.35, t);
    const wig = Math.sin(2 * Math.PI * 3 * (t - 6.4)) * 9 * smooth(6.35, 6.5, t) * (1 - smooth(7.45, 7.7, t));
    const shrug = K(t, [[7.15, 0], [7.35, 1, 'o'], [7.7, 0]]);
    const ovs = K(t, [[6.03, 0], [6.38, 1, 'ob']]);
    const hand = sg => {
      const behind = [sg * 112, -205], up = [sg * 190 + wig * sg, -372 - 18 * shrug + (1 - ovs) * 30], rest = [sg * 176, -160];
      const bx = lower > 0 ? lerp(up[0], rest[0], lower) : lerp(behind[0], up[0], def);
      const by = lower > 0 ? lerp(up[1], rest[1], lower) : lerp(behind[1], up[1], def);
      return {
        x: bx, y: by, ang: lower > 0 ? lerp(-Math.PI / 2 + sg * 0.3, Math.PI / 2, lower) : lerp(Math.PI / 2, -Math.PI / 2 + sg * 0.32, def),
        curl: lower > 0 ? lerp(0.05, 0.35, lower) : lerp(0.5, 0.05, def), spread: lerp(0.3, 0.95, def), front: false, bend: sg, side: sg < 0 ? -1 : 1,
      };
    };
    // feet: L (screen-right, back foot) steps back first, then R follows — weight transfer
    const s1 = smooth(6.0, 6.2, t), s2 = smooth(6.2, 6.44, t);
    const fL = { x: lerp(816, 850, E.io(s1)), y: GROUND - Math.sin(Math.PI * s1) * 26, ang: -0.2 * Math.sin(Math.PI * s1), yaw: K(t, [[1.0, 0.35], [1.3, 0.3], [2.7, -0.4]]) };
    const fR = { x: lerp(720, 752, E.io(s2)), y: GROUND - Math.sin(Math.PI * s2) * 22, ang: 0.15 * Math.sin(Math.PI * s2), yaw: K(t, [[1.0, -0.35], [2.7, -0.75]]) };
    fL.ang += 0.2 * smooth(6.0, 6.08, t) * (1 - s1);                       // push-off
    return { def: D, x, y: GROUND, s: S1, dx: 0, bob, lean, sy, sx: 1 + (1 - sy) * 0.6, turn, face, arms: { R: hand(-1), L: hand(1) }, feet: { R: fR, L: fL } };
  }

  // ======================= INTESTINO =======================
  function intestino(t) {
    const D = C.INTESTINO;
    const lip = R.lipAt('intestino', t);
    const X = 540;
    const turn = K(t, [[7.95, 0], [8.25, -0.2, 'io'], [8.55, 0.2, 'io'], [8.85, 0, 'io']]);
    const shakeA = Math.sin(2 * Math.PI * 3.2 * (t - 9.12)) * smooth(9.1, 9.2, t) * (1 - smooth(9.5, 9.8, t));
    const lean = 0.012 * Math.sin(2 * Math.PI * t / 2.4) + 0.03 * shakeA - 0.04 * smooth(8.75, 9.05, t) + 0.03 * smooth(9.55, 9.9, t);
    const sy = 1 + 0.015 * Math.sin(2 * Math.PI * t / 2.4) - K(t, [[9.5, 0], [9.9, 0.035, 'io']]) + K(t, [[4.02, 0], [4.1, 0.03, 'o'], [4.4, 0]]);

    // eyes: idle tracking → slow look at both → eye roll → deadpan
    const roll = smooth(8.58, 9.02, t);
    const ra = lerp(0, -Math.PI, E.io(roll));                       // pupils travel right → top → left
    let lx = K(t, [[0, -0.95], [1.6, -0.6], [2.4, -0.35], [3.9, -0.6], [5.95, -0.6], [6.15, 0.7, 'o'], [7.95, 0.7], [8.28, -0.85, 'io'], [8.58, 0.85, 'io']]);
    let ly = K(t, [[0, 0.1], [8.0, 0.1], [8.3, 0.05]]);
    if (roll > 0) { lx = lerp(lx, Math.cos(ra) * 0.9, smooth(8.58, 8.7, t)); ly = Math.sin(ra) * 1.05 * Math.sin(Math.PI * roll) + 0.1 * (1 - roll); }
    if (t > 9.02) { lx = lerp(-0.9, -0.1, smooth(9.02, 9.25, t)); ly = lerp(0.1, 0.15, smooth(9.02, 9.25, t)); }
    const bl = blink(t, [0.5, 2.7, 5.2, 7.3, 9.8], 0.26);
    const startle = K(t, [[4.02, 0], [4.1, 1, 'o'], [4.4, 0]]);
    let mouth;
    if (lip) mouth = Object.assign(lip, { smile: -0.05, skew: 0.32 });
    else if (t > 9.86) { mouth = Object.assign({}, R.VIS.U); mouth.o = 0.2 * Math.sin(Math.PI * smooth(9.86, 10, t)); mouth.smile = -0.2; mouth.skew = 0.3; } // tired exhale
    else mouth = { smile: -0.08, skew: 0.38 };
    const face = {
      lx, ly, blink: bl, lidT: 0.42 - 0.3 * startle + 0.12 * Math.sin(Math.PI * roll) + 0.08 * smooth(9.05, 9.3, t), lidB: 0.1, tilt: -0.05,
      browUp: 6 * startle + 6 * Math.sin(Math.PI * roll), browIn: 2, browOut: 0,
      browR: -12 * (1 - smooth(8.7, 8.9, t)) + -10 * smooth(9.2, 9.4, t),   // sarcastic one-brow raise
      browL: 4,
      dx: 8 * shakeA, mouthDx: 3 * shakeA, mouth,
    };
    // arms: crossed → R to hip, L to forehead
    const un = smooth(8.55, 8.8, t), fh = smooth(8.72, 9.08, t), hip = smooth(8.6, 8.95, t);
    const ovs = K(t, [[8.72, 0], [9.08, 1, 'ob']]);
    const armR = {   // screen-left arm: crossed → hand on hip
      x: lerp(78, -176, hip), y: lerp(-302, -262, hip), ang: lerp(0.15, -0.1, hip) + Math.PI * 0 , curl: lerp(0.8, 0.75, hip), spread: 0.3, front: true, bend: 1,
      via: hip < 1 ? [lerp(-185, -215, hip), lerp(-255, -330, hip)] : [-215, -330], len: 300, side: 1,
    };
    const fhX = lerp(78, 92, ovs), fhY = lerp(-488, -512, ovs);
    const armL = {   // screen-right arm: crossed → open hand to forehead
      x: fh > 0 ? lerp(lerp(-74, 150, un), fhX, fh) : lerp(-74, 150, un), y: fh > 0 ? lerp(lerp(-292, -330, un), fhY, fh) : lerp(-292, -330, un),
      ang: fh > 0 ? lerp(Math.PI - 0.15, -2.8, fh) : Math.PI - 0.15, curl: lerp(0.8, 0.12, fh), spread: lerp(0.3, 0.55, fh), front: true, bend: -1,
      via: [lerp(190, 225, Math.max(un, fh)), lerp(-262, -420, fh)], len: 300, side: fh > 0.5 ? 1 : -1,
    };
    const feet = { R: { x: X - 44, y: GROUND_BACK, yaw: -0.35 }, L: { x: X + 44, y: GROUND_BACK, yaw: 0.35 } };
    return { def: D, x: X, y: GROUND_BACK, s: S2, dx: 0, bob: 0, lean, sy, sx: 1 + (1 - sy) * 0.6, turn, face, arms: { R: armR, L: armL }, feet };
  }

  // ======================= background (static, drawn once) =======================
  let BG = null;
  function background() {
    if (BG) return BG;
    BG = document.createElement('canvas'); BG.width = W; BG.height = H;
    const g = BG.getContext('2d');
    const wall = g.createLinearGradient(0, 0, 0, 1180);
    wall.addColorStop(0, '#f8dcd5'); wall.addColorStop(1, '#fdeee9');
    g.fillStyle = wall; g.fillRect(0, 0, W, 1180);
    // soft "cell" shapes on the wall
    const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let i = 0; i < 22; i++) {
      const x = rnd() * W, y = 80 + rnd() * 980, r = 40 + rnd() * 110;
      g.beginPath(); g.ellipse(x, y, r, r * (0.8 + rnd() * 0.3), rnd() * 3, 0, Math.PI * 2);
      g.fillStyle = 'rgba(244,190,182,0.28)'; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(226,150,145,0.28)'; g.stroke();
      g.beginPath(); g.arc(x + r * 0.2, y - r * 0.1, r * 0.22, 0, Math.PI * 2); g.fillStyle = 'rgba(226,150,145,0.22)'; g.fill();
    }
    // backdrop arch
    g.beginPath(); g.moveTo(90, 1180); g.lineTo(90, 520); g.bezierCurveTo(90, 240, 990, 240, 990, 520); g.lineTo(990, 1180);
    g.fillStyle = 'rgba(255,246,242,0.55)'; g.fill(); g.lineWidth = 10; g.strokeStyle = 'rgba(214,130,128,0.35)'; g.stroke();
    // floor
    const fl = g.createLinearGradient(0, 1150, 0, H);
    fl.addColorStop(0, '#e9b2a6'); fl.addColorStop(1, '#d7968a');
    g.fillStyle = fl; g.fillRect(0, 1160, W, H - 1160);
    g.fillStyle = '#c98679'; g.fillRect(0, 1156, W, 10);
    g.strokeStyle = 'rgba(160,90,80,0.18)'; g.lineWidth = 3;
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(540 + i * 70, 1166); g.lineTo(540 + i * 260, H); g.stroke(); }
    // stage pool of light
    const pool = g.createRadialGradient(540, 1420, 40, 540, 1420, 620);
    pool.addColorStop(0, 'rgba(255,240,230,0.55)'); pool.addColorStop(1, 'rgba(255,240,230,0)');
    g.fillStyle = pool; g.fillRect(0, 1000, W, 920);
    // vignette
    const vg = g.createRadialGradient(540, 900, 500, 540, 960, 1300);
    vg.addColorStop(0, 'rgba(80,20,20,0)'); vg.addColorStop(1, 'rgba(80,20,20,0.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return BG;
  }

  const SCENES = [[0, 'SC1 · STOMU ENTERS'], [2, 'SC2 · STOMU TURNS'], [4, 'SC3 · STOMU SHOUTS'], [6, 'SC4 · BRAINU REACTS'], [8, 'SC5 · INTESTINO REACTS']];
  const SPK = { stomu: '#ff9aa0', brainu: '#ffc3cf', intestino: '#ffb39c' };
  function overlay(ctx, t, opts) {
    // subtitles
    for (const id in (window.LIPSYNC || {})) {
      const L = window.LIPSYNC[id];
      const a = smooth(L.start - 0.15, L.start - 0.02, t) * (1 - smooth(L.end + 0.25, L.end + 0.4, t));
      if (a <= 0) continue;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
      const fs = L.sub.length > 30 ? 40 : 48;
      ctx.font = `bold ${fs}px "DejaVu Sans", sans-serif`;
      const tw = Math.min(1040, ctx.measureText(L.sub).width + 64);
      ctx.fillStyle = 'rgba(30,12,12,0.82)'; ctx.beginPath(); ctx.roundRect(540 - tw / 2, 1680, tw, 140, 28); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(L.sub, 540, 1790);
      ctx.font = 'bold 30px "DejaVu Sans", sans-serif'; ctx.fillStyle = SPK[id];
      ctx.fillText(L.speaker, 540, 1728);
      ctx.restore();
    }
    if (opts.slate) {
      let s = SCENES[0][1]; for (const [ts, n] of SCENES) if (t >= ts) s = n;
      ctx.save(); ctx.font = 'bold 26px "DejaVu Sans Mono", monospace'; ctx.fillStyle = 'rgba(60,20,20,0.55)';
      ctx.fillText('STOMU · MOTION TEST 01   ' + s, 40, 60);
      ctx.textAlign = 'right'; ctx.fillText(`${t.toFixed(2)}s  f${String(Math.round(t * FPS)).padStart(3, '0')}`, W - 40, 60);
      ctx.restore();
    }
  }

  function renderFrame(ctx, t, opts = { slate: true }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(), 0, 0);
    const ps = [intestino(t), brainu(t), stomu(t)];                 // back to front
    for (const P of ps) C.drawPuppet(ctx, P.def, P, t);
    overlay(ctx, t, opts);
  }

  window.SCENE = { W, H, FPS, DUR, renderFrame, footsteps, poses: t => ({ stomu: stomu(t), brainu: brainu(t), intestino: intestino(t) }) };
})();
