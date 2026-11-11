/* =====================================================================
   clips.js — choreography
   ---------------------------------------------------------------------
   Every clip is { id, label, duration, poseAt(t), camAt(t), drawBack,
   drawFront }. poseAt is a pure function of time, sampled on 24 fps
   frames, so secondary motion can read the past (see rig.js secondary()).
   ===================================================================== */
'use strict';

const GROUND = 645, SC = 0.5;
const sideY = drop => GROUND - SC * (SIDE_LEG - drop);
const frontY = drop => GROUND - SC * (FRONT_LEG - drop);
const F24 = n => n / 24;                       // frame number → seconds

/* breathing: returns 0..1 chest expansion */
const breathe = (t, period = 3.2, amp = 1) => amp * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period));

/* ---------- shared environment drawing ---------- */
function backdrop(ctx, cam, t, opts = {}) {
  // sky and far layers move less than the camera → parallax
  ctx.save();
  const far = { x: 640 + (cam.x - 640) * 0.25, y: 360 + (cam.y - 360) * 0.25, zoom: 1 + (cam.zoom - 1) * 0.3 };
  camera(ctx, far, t);
  sky(ctx, { t, mid: opts.mid || COL.skyMid, horizon: opts.horizon || COL.horizon });
  moon(ctx, 300, 140, 32);
  tiled(ctx, LAYERS.far, t * 4, 615 - 300);
  ctx.restore();
  ctx.save();
  const mid = { x: 640 + (cam.x - 640) * 0.6, y: 360 + (cam.y - 360) * 0.6, zoom: 1 + (cam.zoom - 1) * 0.65 };
  camera(ctx, mid, t);
  tiled(ctx, LAYERS.near, 300 + t * 8, 615 - 380 + 120);
  ctx.restore();
}
function roofLayer(ctx, cam, t) {
  // the rooftop repeats every 1400 px so tracking shots never run out of floor
  ctx.save();
  camera(ctx, cam, t);
  const k0 = Math.floor((cam.x - 1400) / 1400);
  for (let k = k0; k <= k0 + 3; k++) { ctx.save(); ctx.translate(k * 1400, 0); rooftop(ctx, 615); ctx.restore(); }
  ctx.restore();
}
function footShadow(ctx, p) {
  const S = solve(p);
  const ks = p.rig === 'side' ? ['n', 'f'] : ['l', 'r'];
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  const xs = ks.map(k => toWorld(p, S.legs[k].end[0], S.legs[k].end[1]));
  const cx = (xs[0][0] + xs[1][0]) / 2, w = Math.abs(xs[0][0] - xs[1][0]) / 2 + 55 * p.s * 2;
  const lift = Math.max(0, GROUND - p.y - 260 * p.s);
  ctx.globalAlpha = clamp(1 - lift / 200);
  ctx.beginPath(); ctx.ellipse(cx, GROUND + 2, w, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
function dust(ctx, x, y, tau, { count = 14, seed = 5, spread = 70 } = {}) {
  if (tau <= 0 || tau >= 1) return;
  const r = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const dir = (r() - 0.5) * 2, sp = spread * (0.5 + r());
    const px = x + dir * sp * ease.out(tau), py = y - (10 + r() * 30) * ease.out(tau) + 12 * tau * tau;
    const rad = (5 + r() * 9) * (0.6 + tau);
    ctx.globalAlpha = 0.35 * (1 - tau);
    ctx.fillStyle = r() < 0.5 ? '#7f7390' : '#5f5672';
    ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* =====================================================================
   1. THE 15-SECOND SEQUENCE
   ===================================================================== */
const SEQ = (() => {
  const GX = 700;
  const T_TURN1 = F24(71);          // front → side
  const T_HIT = F24(215);           // fist meets the orb (8.958 s)
  const T_RESUME = F24(221);        // hit-stop ends
  const T_TURN2 = F24(297);         // side → front (12.375 s)
  const END = 15;

  /* ---- front: idle + reaction (0 – 2.96 s) ---- */
  const fr = {
    turn: track([[0, 0], [1.2, 0], [1.9, -0.12], [2.03, -0.1], [2.08, 0.07, 'out'], [2.2, -0.92, 'out'], [2.32, -0.78], [2.55, -0.84], [3, -0.82]], 'smooth'),
    gaze: track([[0, [0.15, 0]], [1.0, [0.15, 0]], [1.55, [-0.95, 0.1]], [2.06, [-0.6, 0]], [2.2, [-1, 0]], [2.6, [-0.8, 0]]], 'ease'),
    nod: track([[0, 0], [2.0, 0], [2.07, 4, 'out'], [2.2, -1], [2.4, 0]], 'smooth'),
    drop: track([[0, 6], [2.12, 6], [2.35, 30, 'out'], [2.55, 24], [2.75, 27]], 'ease'),
    px: track([[0, 0], [2.12, 0], [2.4, 7, 'out'], [2.7, 5]], 'ease'),
    twist: track([[0, 0], [2.1, 0], [2.35, -0.65, 'out'], [2.6, -0.5]], 'smooth'),
    footR: track([[0, [747, GROUND]], [2.2, [747, GROUND]], [2.32, [758, GROUND - 16], 'out'], [2.46, [772, GROUND - 4], 'inOut']], 'ease'),
    armL: track([[0, [-28, 286]], [2.15, [-28, 286]], [2.3, [10, 190], 'in'], [2.42, [44, 20]], [2.54, [58, -92], 'out'], [2.74, [52, -82]]], 'smooth'),
    armR: track([[0, [28, 286]], [2.17, [28, 286]], [2.32, [-10, 190], 'in'], [2.44, [-44, 20]], [2.56, [-58, -92], 'out'], [2.76, [-52, -82]]], 'smooth'),
    fs: track([[0, 0], [2.25, 0], [2.54, 0.55]], 'ease'),
    expr: exprTrack([[0, 'neutral', 0], [1.45, 'focused', 0.5], [2.12, 'angry', 0.16]]),
  };
  function frontStart(t) {
    const p = basePose('front');
    p.s = SC;
    const b = breathe(t, 3.2, t < 2.1 ? 1 : 1.4);
    const sway = Math.sin((2 * Math.PI * t) / 4);               // slow weight shift
    p.x = GX + 3.5 * sway + fr.px(t);
    p.y = frontY(fr.drop(t)) - b * 1.2;
    p.rot = -0.012 * sway;
    p.breath = b;
    p.twist = fr.twist(t);
    p.legs = { l: { x: 655, y: GROUND }, r: { x: fr.footR(t)[0], y: fr.footR(t)[1] } };
    const micro = (k, ph) => [Math.sin(t * 1.3 + ph) * 3, Math.sin(t * 1.7 + ph) * 2];   // fingers / hands settle
    const mL = micro('l', 0), mR = micro('r', 2);
    const aL = fr.armL(t), aR = fr.armR(t);
    p.arms = { l: { ik: [aL[0] + mL[0], aL[1] + mL[1]], fs: fr.fs(t) }, r: { ik: [aR[0] + mR[0], aR[1] + mR[1]], fs: fr.fs(t) } };
    p.hands = t > 2.36 ? { l: 1, r: 1 } : {};
    p.head.turn = fr.turn(t);
    p.head.gaze = fr.gaze(t);
    const nod = fr.nod(t);
    p.head.dy = nod;
    p.head.rot = 0.015 * Math.sin(t * 1.1) - 0.02 * fr.turn(t);
    p.expr = fr.expr(t);
    p.blink = blinkAt(t, [0.55, 1.4]);
    if (t >= F24(69)) p.flipX = lerp(1, 0.7, seg(t, F24(69), T_TURN1));   // turning: squash toward profile
    return p;
  }

  /* ---- side: stance, punch, recovery (2.96 – 12.37 s) ---- */
  const G = GROUND;
  const sd = {
    pel: track([
      [T_TURN1, [694, 18]], [3.15, [703, 36], 'out'], [3.45, [699, 30]], [4.0, [700, 32]],
      [4.5, [694, 36]], [5.0, [705, 30]], [5.5, [694, 36]], [6.0, [700, 32]],
      [6.9, [712, 46]], [7.5, [714, 50], 'lin'], [7.85, [717, 58]], [8.45, [715, 57]],
      [T_HIT, [676, 50], 'in3'], [T_RESUME, [676, 50], 'hold'],
      [9.6, [667, 56], 'out'], [10.2, [670, 52]], [10.8, [697, 34]], [11.1, [702, 29], 'out'], [11.45, [699, 33]], [12.4, [700, 32]],
    ], 'ease'),
    rot: track([
      [T_TURN1, 0.02], [3.2, -0.05], [3.5, -0.02], [4.0, -0.03], [4.5, -0.05], [5.0, -0.01], [5.5, -0.05], [6.0, -0.03],
      [6.9, 0.05], [7.85, 0.08], [8.45, 0.08], [T_HIT, -0.12, 'in3'], [T_RESUME, -0.12, 'hold'],
      [9.6, -0.15, 'out'], [10.2, -0.1], [10.8, -0.02], [11.3, -0.04], [12.4, -0.03],
    ], 'smooth'),
    twist: track([
      [T_TURN1, -0.3], [3.4, 0], [6.0, 0], [6.9, -0.75], [7.5, -0.85], [7.85, -1.0], [8.45, -0.95],
      [T_HIT, 1.0, 'in3'], [T_RESUME, 1.0, 'hold'], [9.6, 1.15, 'out'], [10.2, 1.05], [10.8, 0], [12.4, 0],
    ], 'smooth'),
    sq: track([
      [T_TURN1, [1, 1]], [7.5, [1, 1]], [7.85, [1.025, 0.975]], [8.45, [1.02, 0.98]], [8.85, [0.97, 1.04], 'in'],
      [T_HIT, [1.05, 0.95], 'out'], [T_RESUME, [1.04, 0.96], 'hold'], [9.45, [1, 1]], [12.4, [1, 1]],
    ], 'ease'),
    armN: track([
      [T_TURN1, [-20, 40]], [3.25, [-84, -96]], [3.5, [-74, -84]], [4.0, [-74, -84]],
      [4.5, [-78, -80]], [5.0, [-70, -88]], [5.5, [-78, -80]], [6.0, [-74, -84]],
      [6.9, [-12, -46]], [7.5, [-2, -40]], [7.85, [14, -30]], [8.45, [12, -32]],
      [8.72, [-110, -62], 'in'], [T_HIT, [-302, -28], 'out'], [T_RESUME, [-302, -28], 'hold'],
      [9.6, [-310, -14], 'out'], [10.2, [-298, -20]], [10.55, [-170, -72]], [10.85, [-80, -92]], [11.2, [-74, -84]], [12.4, [-74, -84]],
    ], 'smooth'),
    armF: track([
      [T_TURN1, [-60, 30]], [3.3, [-196, -88]], [3.55, [-185, -78]], [4.0, [-185, -78]],
      [4.5, [-190, -74]], [5.0, [-180, -82]], [5.5, [-190, -74]], [6.0, [-185, -78]],
      [6.9, [-212, -70]], [8.45, [-216, -68]], [T_HIT, [-72, -112], 'out'], [T_RESUME, [-72, -112], 'hold'],
      [9.6, [-78, -106]], [10.6, [-150, -90]], [11.0, [-188, -80]], [11.3, [-185, -78]], [12.4, [-185, -78]],
    ], 'smooth'),
    footN: track([
      [T_TURN1, [700, G, 0]], [3.08, [705, G - 10, 0.35], 'out'], [3.26, [715, G, 0.12], 'inOut'],
      [4.0, [715, G, 0.12]], [4.5, [715, G, 0.26]], [5.0, [715, G, 0.05]], [5.5, [715, G, 0.26]], [6.0, [715, G, 0.12]],
      [6.9, [715, G, 0]], [8.6, [715, G, 0]], [8.88, [715, G, 0.62], 'out'], [T_RESUME, [715, G, 0.65]],
      [9.6, [715, G, 0.8]], [10.3, [715, G, 0.7]], [10.75, [715, G, 0.12], 'inOut'], [12.4, [715, G, 0.12]],
    ], 'ease'),
    footF: track([
      [T_TURN1, [640, G, 0]], [10.85, [640, G, 0]], [10.97, [645, G - 10, 0.25], 'out'], [11.12, [648, G, 0], 'inOut'], [12.4, [648, G, 0]],
    ], 'ease'),
    head: track([
      [T_TURN1, 0.05], [3.2, -0.06], [3.5, -0.03], [6.0, -0.03], [6.9, -0.07], [8.45, -0.08], [T_HIT, -0.04],
      [T_RESUME, -0.04, 'hold'], [9.5, -0.1], [10.4, -0.05], [12.4, -0.03],
    ], 'smooth'),
    stretch: track([[T_TURN1, 0], [8.6, 0], [8.85, 0.09, 'in'], [T_HIT, 0.12], [T_RESUME, 0.1, 'hold'], [9.45, 0]], 'ease'),
    expr: exprTrack([[T_TURN1, 'angry', 0], [3.6, 'focused', 0.4], [7.6, 'angry', 0.25], [10.6, 'determined', 0.5]]),
    flip: track([[T_TURN1, 0.78], [F24(73), 1, 'out'], [F24(295), 1], [T_TURN2, 0.72, 'in']], 'ease'),
  };
  function sideMid(t) {
    // hit-stop: the character freezes for 6 frames on contact
    const tt = t > T_HIT && t < T_RESUME ? T_HIT : t;
    const p = basePose('side');
    p.s = SC;
    const [x, drop] = sd.pel(tt);
    const exert = seg(tt, 9.3, 10.2) * (1 - seg(tt, 11.0, 12.4));
    const b = breathe(tt, lerp(3.2, 1.4, exert), 1 + exert);
    p.x = x; p.y = sideY(drop) - b * 1.2;
    p.rot = sd.rot(tt); p.twist = sd.twist(tt); p.sq = sd.sq(tt); p.breath = b;
    const fN = sd.footN(tt), fF = sd.footF(tt);
    p.legs = { n: { x: fN[0], y: fN[1], roll: fN[2] }, f: { x: fF[0], y: fF[1], roll: fF[2] } };
    const fist = (ph) => [Math.sin(tt * 2.1 + ph) * 3, Math.cos(tt * 1.7 + ph) * 2.5];   // fists breathe with the stance
    const calm = 1 - seg(tt, 6.5, 6.9) + seg(tt, 11.0, 11.6);
    const aN = sd.armN(tt), aF = sd.armF(tt), mN = fist(0), mF = fist(1.3);
    p.arms = { n: { ik: [aN[0] + mN[0] * calm, aN[1] + mN[1] * calm] }, f: { ik: [aF[0] + mF[0] * calm, aF[1] + mF[1] * calm] } };
    p.hands = { n: 1, f: 1 };
    p.head.rot = sd.head(tt);
    p.expr = sd.expr(tt);
    p.blink = blinkAt(tt, [4.7, 6.2, 11.6]);
    p.stretch = sd.stretch(tt);
    p.flipX = sd.flip(tt);
    return p;
  }

  /* ---- front: final stance (12.37 – 15 s) ---- */
  const fe = {
    drop: track([[T_TURN2, 22], [12.6, 31, 'out'], [12.9, 26], [13.3, 28]], 'ease'),
    turn: track([[T_TURN2, -0.72], [12.9, -0.62], [13.7, -0.1, 'inOut'], [13.95, -0.14], [15, -0.12]], 'smooth'),
    gaze: track([[T_TURN2, [-0.8, 0]], [13.3, [-0.6, 0]], [13.75, [0.05, 0]], [15, [0.05, 0]]], 'ease'),
    twist: track([[T_TURN2, -0.45], [13.3, -0.3], [13.9, -0.1], [15, -0.1]], 'smooth'),
    expr: exprTrack([[T_TURN2, 'angry', 0], [13.3, 'smirk', 0.26]]),
    flip: track([[T_TURN2, 0.78], [F24(299), 1, 'out']], 'ease'),
  };
  function frontEnd(t) {
    const p = basePose('front');
    p.s = SC;
    const settle = seg(t, T_TURN2, 14.5);
    const b = breathe(t, lerp(1.6, 3.0, settle), lerp(1.6, 0.8, settle));
    const sway = Math.sin((2 * Math.PI * t) / 2.6) * (0.5 + 0.5 * settle);
    p.x = GX + 3 * sway; p.y = frontY(fe.drop(t)) - b * 1.4;
    p.rot = -0.01 * sway; p.breath = b; p.twist = fe.twist(t);
    p.legs = { l: { x: 650, y: GROUND }, r: { x: 754, y: GROUND - 4 } };
    const g = GUARD_FRONT, m = Math.sin(t * 1.8) * 3;
    p.arms = { l: { ik: [g.l[0], g.l[1] + m], fs: 0.55 }, r: { ik: [g.r[0], g.r[1] - m], fs: 0.55 } };
    p.hands = { l: 1, r: 1 };
    p.head.turn = fe.turn(t); p.head.gaze = fe.gaze(t);
    p.head.rot = 0.01 * Math.sin(t * 1.3);
    p.expr = fe.expr(t);
    p.blink = blinkAt(t, [14.25]);
    p.flipX = fe.flip(t);
    return p;
  }

  function poseAt(t) {
    if (t < T_TURN1) return frontStart(t);
    if (t < T_TURN2) return sideMid(t);
    return frontEnd(t);
  }

  /* ---- camera ---- */
  // Full-body framing (zoom ≈ 1.2) whenever the feet carry the story; push in only for the coil and the end.
  const cam = {
    zoom: track([[0, 1.12], [1.9, 1.18], [2.15, 1.2], [2.5, 1.24, 'out'], [4.0, 1.22], [6.0, 1.24], [7.3, 1.3], [7.9, 1.58],
      [8.6, 1.62], [T_HIT, 1.6], [9.25, 1.62, 'out'], [10.0, 1.24, 'inOut'], [12.3, 1.22], [12.6, 1.24], [14.0, 1.85, 'inOut'], [15, 1.9]], 'ease'),
    x: track([[0, 700], [2.5, 705], [4.0, 690], [6.0, 690], [7.9, 680], [8.6, 670], [T_HIT, 650], [10.0, 680], [12.3, 690], [14, 702]], 'ease'),
    y: track([[0, 404], [2.5, 404], [7.3, 402], [7.9, 352], [8.6, 350], [T_HIT, 350], [9.25, 350], [10.0, 402, 'inOut'], [12.4, 402], [14, 318, 'inOut'], [15, 314]], 'ease'),
  };
  function camAt(t) {
    const shakeT = t - T_HIT;
    const shake = shakeT > 0 && shakeT < 0.4 ? 9 * Math.pow(1 - shakeT / 0.4, 2) : 0;
    return { x: cam.x(t), y: cam.y(t), zoom: cam.zoom(t), shake };
  }

  /* ---- the threat: an energy orb that the punch destroys ---- */
  let contact = null;
  const contactPt = () => contact || (contact = handWorld(sideMid(T_HIT), 'n'));
  function orbAt(t) {
    if (t < 0.9 || t > T_HIT) return null;
    const c = contactPt();
    // slow and distant at first, then a steady final approach the eye can follow into the fist
    const u = seg(t, 0.9, T_HIT), e = u < 0.7 ? 0.55 * Math.pow(u / 0.7, 2) : 0.55 + 0.45 * ((u - 0.7) / 0.3);
    const sx = -80, sy = 150;
    const x = lerp(sx, c[0] - 8, e), y = lerp(sy, c[1], e) - Math.sin(Math.PI * e) * 40;
    return { x, y, r: lerp(3, 17, e), u };
  }

  function drawBack(ctx, t, cm) {
    backdrop(ctx, cm, t);
    const o = orbAt(t);
    ctx.save(); camera(ctx, cm, t);
    if (o) {
      const tr = orbAt(Math.max(0.9, t - 0.12));
      energyOrb(ctx, o.x, o.y, o.r, t, tr ? [tr.x, tr.y] : null);
      glowLight(ctx, o.x, o.y, 220 + 200 * o.u, 'rgba(255,90,40,0.7)', 0.25 + 0.35 * o.u);
    }
    ctx.restore();
    roofLayer(ctx, cm, t);
    ctx.save(); camera(ctx, cm, t);
    footShadow(ctx, poseAt(onFrame(t)));
    // rear foot pivot dust on the drive, and the balance step
    dust(ctx, 728, GROUND, seg(t, 8.82, 9.6), { seed: 3 });
    dust(ctx, 650, GROUND, seg(t, 11.1, 11.7), { count: 8, seed: 8, spread: 40 });
    dust(ctx, 770, GROUND, seg(t, 2.46, 3.0), { count: 8, seed: 9, spread: 40 });
    dust(ctx, 712, GROUND, seg(t, 3.26, 3.8), { count: 8, seed: 10, spread: 40 });
    ctx.restore();
  }
  function ghosts(t) {                       // smear frames of the punching arm
    if (t < 8.79 || t >= T_HIT) return [];
    return [{ pose: sideMid(t - F24(2)), alpha: 0.22 }, { pose: sideMid(t - F24(1)), alpha: 0.4 }];
  }
  function drawFront(ctx, t, cm, pose) {
    const c = contactPt();
    ctx.save(); camera(ctx, cm, t);
    // fist trail on the drive
    if (t > 8.72 && t < T_HIT + 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 7; k++) {
        const a = handWorld(sideMid(onFrame(t) - k * 0.02), 'n');
        const b = handWorld(sideMid(onFrame(t) - (k + 1) * 0.02), 'n');
        ctx.strokeStyle = `rgba(255,170,120,${0.5 - k * 0.06})`;
        ctx.lineWidth = 10 - k;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.restore();
    }
    // impact
    const tau = (t - T_HIT) / 1.1;
    if (tau >= 0 && tau < 1) {
      glowLight(ctx, c[0], c[1], 520, 'rgba(255,200,150,1)', 0.85 * Math.pow(1 - tau, 1.6));
      burst(ctx, c[0], c[1], 120 * (1 - ease.out(clamp(tau * 2.2))), { color: '#fff4e6', seed: 6, rot: tau });
      shockwave(ctx, c[0], c[1], tau * 1.4, { maxR: 520, width: 16 });
      shockwave(ctx, c[0], c[1], tau * 1.4 - 0.2, { maxR: 520, width: 8, color: '255,120,70' });
      debris(ctx, c[0], c[1], tau * 1.2, { count: 30 });
    }
    ctx.restore();
    // two manga impact frames (inverted silhouettes) on contact
    const f = Math.floor((t - T_HIT) * 24 + 1e-6);
    if (t >= T_HIT && f < 2) impactFrame(ctx, t, cm, pose, f, c);
    else if (tau >= 0 && tau < 0.4) {
      const sc = worldToScreen(cm, c, t);
      focusLines(ctx, sc[0], sc[1], { count: 80, inner: 220, alpha: 0.4 * (1 - tau / 0.4), seed: boil(t) + 4 });
    }
    // turn smears
    for (const tt of [T_TURN1, T_TURN2]) {
      const k = seg(t, tt - F24(2), tt + F24(3));
      if (k > 0 && k < 1) {
        ctx.save(); camera(ctx, cm, t);
        ctx.globalAlpha = Math.sin(Math.PI * k) * 0.55;
        streaks(ctx, t, { count: 12, speed: 0, alpha: 0.8, seed: 40 });
        ctx.restore();
      }
    }
    embers(ctx, t, { count: 26, seed: 4 });
    streaks(ctx, t, { count: 8, speed: -420, alpha: 0.1, seed: 31 });
  }
  return {
    id: 'sequence', label: 'Rooftop Strike — full sequence', duration: END,
    poseAt, camAt, drawBack, drawFront, ghosts, contactPt,
    light: { grade: 0.2, rimAlpha: 0.6 },
    chapters: [[0, 'Idle'], [2, 'Reaction'], [4, 'Fighting stance'], [6, 'Punch preparation'], [8, 'Punch'], [9, 'Impact'], [10, 'Follow-through & recovery'], [12, 'Final pose']],
    fadeOut: [14.65, 15],
  };
})();

function worldToScreen(cm, pt, t) {
  return [W / 2 + (pt[0] - cm.x) * cm.zoom, H / 2 + (pt[1] - cm.y) * cm.zoom];
}
function impactFrame(ctx, t, cm, pose, f, c) {
  if (REDUCED) {                                   // no strobing for reduced-motion viewers
    ctx.fillStyle = 'rgba(255,220,190,0.35)'; ctx.fillRect(0, 0, W, H);
    return;
  }
  const inverted = f === 1;
  const sc = worldToScreen(cm, c, t);
  ctx.fillStyle = inverted ? '#0b0710' : '#fff8f0';
  ctx.fillRect(0, 0, W, H);
  focusLines(ctx, sc[0], sc[1], { count: 70, inner: 60, alpha: 1, color: inverted ? '#ff4a2a' : '#0b0710', seed: f + 90 });
  burst(ctx, sc[0], sc[1], 150 + f * 40, { color: inverted ? '#fff8f0' : '#0b0710', seed: f + 3 });
  // character as a solid silhouette
  const F = ensureFig();
  ctx.save(); camera(ctx, cm, t);
  const m = ctx.getTransform();
  ctx.restore();
  F.g.setTransform(1, 0, 0, 1, 0, 0); F.g.clearRect(0, 0, F.c.width, F.c.height);
  F.g.setTransform(m);
  drawRigPieces(F.g, pose, { hair: 0, headLag: 0, time: t });
  F.g.setTransform(1, 0, 0, 1, 0, 0);
  F.g.globalCompositeOperation = 'source-in';
  F.g.fillStyle = inverted ? '#fff8f0' : '#0b0710';
  F.g.fillRect(0, 0, F.c.width, F.c.height);
  F.g.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(F.c, 0, 0); ctx.restore();
}

/* =====================================================================
   2. MOVE LIBRARY — each body mechanic on its own
   ===================================================================== */
function sideStandPose(x, drop = 6) {
  const p = basePose('side');
  p.s = SC; p.x = x; p.y = sideY(drop);
  p.legs = { n: { x: x + SC * (SIDE_BALL + 22), y: GROUND, roll: 0 }, f: { x: x + SC * (SIDE_BALL - 8), y: GROUND, roll: 0 } };
  p.arms = { n: { fk: [0.02, 0.12] }, f: { fk: [0.05, 0.15] } };
  return p;
}
function trackingCam(poseAt, zoom = 1.2) {
  return t => { const p = poseAt(onFrame(t)); return { x: p.x - 30, y: 402, zoom }; };
}
function stageBack() {
  return (ctx, t, cm, clip) => {
    backdrop(ctx, cm, t);
    roofLayer(ctx, cm, t);
    ctx.save(); camera(ctx, cm, t); footShadow(ctx, clip.poseAt(onFrame(t))); ctx.restore();
  };
}

/* ---- walk ---- */
const WALK = (() => {
  const D = 4.6, x0 = 900;
  const ramp = t => EASE.inOut(seg(t, 0.25, 0.85)) * (1 - EASE.inOut(seg(t, 3.75, 4.35)));
  const g = makeGait({ G: GROUND, s: SC, x0, dur: D, speed: t => 168 * ramp(t), cadence: t => 1.05 * ramp(t),
    duty: 0.62, lift: 34, drop: 16, bob: 5, heel: 1, toe: 1, kick: 0 });
  function poseAt(t) {
    const p = basePose('side'); p.s = SC;
    const r = ramp(t), b = g.body(t);
    p.x = b.x; p.y = lerp(sideY(16), b.y, r) - breathe(t) * 1;
    p.rot = -0.04 * r;
    const fn = g.foot(t, 0), ff = g.foot(t, 0.5);
    p.legs = { n: { x: fn.x, y: fn.y, roll: fn.roll * r }, f: { x: ff.x, y: ff.y, roll: ff.roll * r } };
    const an = g.armSwing(t, 0.5) * r, af = g.armSwing(t, 0);   // arm swings opposite its own leg
    p.arms = { n: { fk: [0.38 * an + 0.03, 0.22 + 0.12 * Math.max(0, an)] }, f: { fk: [0.38 * af * r + 0.03, 0.22 + 0.12 * Math.max(0, af * r)] } };
    p.twist = 0.22 * an;
    p.head.rot = -p.rot * 0.6 + 0.02 * Math.sin(t * 2);
    p.expr = { head: 'side', lid: 0.08, tilt: 0, push: 0, tremble: 0 };
    p.blink = blinkAt(t, [1.3, 3.9]);
    return p;
  }
  return { id: 'walk', label: 'Walk cycle', duration: D, poseAt, camAt: trackingCam(poseAt), drawBack: stageBack(),
    drawFront: (ctx, t) => embers(ctx, t, { count: 16 }), light: { grade: 0.2 } };
})();

/* ---- run (accelerate, run, decelerate) ---- */
const RUN = (() => {
  const D = 4.4, x0 = 1000;
  const ramp = t => EASE.inOut(seg(t, 0.2, 1.0)) * (1 - EASE.inOut(seg(t, 3.4, 4.1)));
  const g = makeGait({ G: GROUND, s: SC, x0, dur: D, speed: t => 390 * ramp(t), cadence: t => (0.15 + 1.45 * ramp(t)) * (t > 0.2 && t < 4.1 ? 1 : 0),
    duty: 0.38, lift: 120, drop: 48, bob: 12, runBob: true, heel: 0.4, toe: 1, kick: 60 });
  function poseAt(t) {
    const p = basePose('side'); p.s = SC;
    const r = ramp(t), b = g.body(t);
    const settle = seg(t, 4.05, 4.4);
    p.x = b.x; p.y = lerp(sideY(10), b.y, Math.max(r, 0.25 * (1 - settle)));
    // lean into acceleration, lean back while braking
    const braking = seg(t, 3.4, 3.9) * (1 - seg(t, 4.0, 4.3));
    p.rot = -0.2 * r - 0.07 * seg(t, 0.2, 0.5) * (1 - r) + 0.12 * braking;
    const fn = g.foot(t, 0), ff = g.foot(t, 0.5);
    p.legs = { n: { x: fn.x, y: fn.y, roll: fn.roll * Math.max(r, 0.2) }, f: { x: ff.x, y: ff.y, roll: ff.roll * Math.max(r, 0.2) } };
    const an = g.armSwing(t, 0.5), af = g.armSwing(t, 0), k = Math.max(r, 0.15);
    // arms pump hard with the elbows bent ~90°
    p.arms = { n: { fk: [0.95 * an * k - 0.1, 1.5 * k + 0.15] }, f: { fk: [0.95 * af * k - 0.1, 1.5 * k + 0.15] } };
    p.hands = { n: 1, f: 1 };
    p.twist = 0.45 * an * k;
    p.head.rot = -p.rot * 0.55;
    p.sq = [1, 1 + 0.02 * Math.sin(b.phase * 4 * Math.PI) * r];
    p.expr = { head: 'side', lid: 0.22 * r, tilt: 0, push: 3 * r, tremble: 0 };
    p.breath = breathe(t, 0.8, 1.5);
    return p;
  }
  return { id: 'run', label: 'Run — accelerate, run, stop', duration: D, poseAt, camAt: trackingCam(poseAt, 1.15),
    drawBack: stageBack(),
    drawFront: (ctx, t, cm) => {
      const r = ramp(t);
      if (r > 0.4) streaks(ctx, t, { count: 22, speed: 2200, alpha: 0.28 * r, seed: 12 });
    }, light: { grade: 0.2 } };
})();

/* ---- jump: preparation, take-off, flight, landing, recovery ---- */
const JUMP = (() => {
  const D = 3.0, X = 790, LAND = 600;
  const T0 = 0.62, T1 = 1.34;                         // take-off and touch-down
  const drop = track([[0, 6], [0.15, 6], [0.5, 125, 'inOut'], [0.6, -8, 'out3'], [T0, -10], [T1, 40], [1.52, 132, 'out'], [1.85, 0, 'inOut'], [2.05, 12], [2.3, 6]], 'ease');
  const px = track([[0, X], [0.15, X], [0.5, X + 18], [T0, X - 20, 'in'], [T1, LAND + 10, 'lin'], [1.52, LAND + 24, 'out'], [2.3, LAND + 14]], 'ease');
  const rot = track([[0, 0], [0.15, 0], [0.5, -0.38], [T0, -0.15], [0.95, -0.08], [T1, 0.05], [1.52, -0.32, 'out'], [1.9, -0.02], [2.1, 0.02], [2.4, 0]], 'smooth');
  const sq = track([[0, [1, 1]], [0.45, [1.03, 0.97]], [0.6, [0.96, 1.05]], [0.8, [1, 1]], [T1, [1, 1.02]], [1.42, [1.05, 0.94]], [1.7, [1, 1]]], 'ease');
  const armUp = track([[0, 0.02], [0.12, 0.02], [0.46, -1.1], [0.56, 0.4, 'in'], [0.7, 2.3, 'out'], [0.95, 2.2], [T1, 1.1], [1.52, 0.85], [1.9, 0.15], [2.2, 0.0], [2.5, 0.03]], 'smooth');
  const armEl = track([[0, 0.12], [0.5, 0.25], [0.62, 0.2], [T1, 0.5], [1.52, 0.6], [2.2, 0.15]], 'smooth');
  const apex = 150;
  function poseAt(t) {
    const p = basePose('side'); p.s = SC;
    p.x = px(t);
    let y = sideY(drop(t));
    if (t > T0 && t < T1) {                            // ballistic flight
      const u = (t - T0) / (T1 - T0);
      y = lerp(sideY(-10), sideY(40), u) - apex * 4 * u * (1 - u);
    }
    p.y = y; p.rot = rot(t); p.sq = sq(t);
    const standN = { x: X + SC * (SIDE_BALL + 22), y: GROUND }, standF = { x: X + SC * (SIDE_BALL - 8), y: GROUND };
    const landN = { x: LAND + SC * (SIDE_BALL + 40), y: GROUND }, landF = { x: LAND + SC * (SIDE_BALL - 30), y: GROUND };
    // feet: planted, then tucked under the body in the air, then planted again
    const tuck = (ox, oy) => ({ x: p.x + SC * ox, y: p.y + SC * oy });
    function foot(stand, land, tuckOff, lead) {
      if (t <= T0 - 0.04) return { ...stand, roll: lerp(0, 0.9, seg(t, 0.5, T0 - 0.04)) };
      if (t >= T1) return { ...land, roll: lerp(lead ? -0.25 : 0.1, 0, seg(t, T1, T1 + 0.08)) };
      const u = (t - (T0 - 0.04)) / (T1 - T0 + 0.04);
      const air = tuck(tuckOff[0] + (lead ? -40 : -10) * u, tuckOff[1] + 70 * Math.pow(u, 3));
      const a = EASE.inOut(clamp(u * 3)), b = EASE.inOut(clamp((u - 0.82) / 0.18));
      const from = { x: lerp(stand.x, air.x, a), y: lerp(stand.y, air.y, a) };
      return { x: lerp(from.x, land.x, b), y: lerp(from.y, land.y, b), roll: lerp(0.9, lead ? -0.25 : 0.1, u) };
    }
    p.legs = { n: foot(standN, landN, [20, 330], false), f: foot(standF, landF, [-60, 300], true) };
    const a = armUp(t), e = armEl(t);
    p.arms = { n: { fk: [a, e] }, f: { fk: [a + 0.12, e] } };
    p.hands = t > 0.45 && t < 1.9 ? { n: 1, f: 1 } : {};
    p.twist = 0;
    p.head.rot = -p.rot * 0.5 + (t > T1 ? -0.06 * Math.sin(Math.PI * seg(t, T1, 1.7)) : 0);
    p.expr = { head: 'side', lid: t > 0.3 && t < 1.6 ? 0.28 : 0.05, tilt: 0, push: 0, tremble: 0 };
    return p;
  }
  return { id: 'jump', label: 'Jump — 5 stages', duration: D, poseAt, camAt: t => ({ x: 690, y: 330, zoom: 0.95 }),
    drawBack: (ctx, t, cm, clip) => {
      backdrop(ctx, cm, t); roofLayer(ctx, cm, t);
      ctx.save(); camera(ctx, cm, t); footShadow(ctx, poseAt(onFrame(t)));
      dust(ctx, X - 30, GROUND, seg(t, T0 - 0.04, T0 + 0.5), { seed: 2 });
      dust(ctx, LAND - 10, GROUND, seg(t, T1, T1 + 0.6), { seed: 7, count: 18, spread: 90 });
      ctx.restore();
    },
    drawFront: (ctx, t) => embers(ctx, t, { count: 16 }),
    chapters: [[0, 'Stand'], [0.15, '1 Preparation'], [0.5, '2 Take-off'], [T0, '3 Flight'], [T1, '4 Landing'], [1.6, '5 Recovery']],
    light: { grade: 0.2 } };
})();

/* ---- stance-based reactions: block, dodge back, duck, hit & recoil ---- */
function stanceClip(id, label, D, keys, extra = {}) {
  const GX = 690, st = sideStance(GX, GROUND, SC, { drop: 32 });
  const tr = {};
  for (const [k, v] of Object.entries(keys)) if (k !== 'expr' && k !== 'fx') tr[k] = track(v, k === 'feetN' || k === 'feetF' || k === 'pel' ? 'ease' : 'smooth');
  const ex = keys.expr ? exprTrack(keys.expr) : null;
  function poseAt(t) {
    const p = basePose('side'); p.s = SC;
    const pel = tr.pel ? tr.pel(t) : [0, 32];
    const b = breathe(t, 2.6);
    p.x = GX + pel[0]; p.y = sideY(pel[1]) - b;
    p.rot = tr.rot ? tr.rot(t) : -0.03;
    p.twist = tr.twist ? tr.twist(t) : 0;
    p.sq = tr.sq ? tr.sq(t) : [1, 1];
    const fn = tr.feetN ? tr.feetN(t) : [0, 0, 0.12], ff = tr.feetF ? tr.feetF(t) : [0, 0, 0];
    p.legs = { n: { x: st.n.x + fn[0], y: GROUND + fn[1], roll: fn[2] }, f: { x: st.f.x + ff[0], y: GROUND + ff[1], roll: ff[2] } };
    const aN = tr.armN ? tr.armN(t) : GUARD_SIDE.n, aF = tr.armF ? tr.armF(t) : GUARD_SIDE.f;
    p.arms = { n: { ik: aN }, f: { ik: aF } };
    p.hands = { n: 1, f: 1 };
    p.head.rot = tr.head ? tr.head(t) : -0.03;
    p.head.dx = tr.headX ? tr.headX(t) : 0;
    p.expr = ex ? ex(t) : { head: 'side', lid: 0.3, tilt: 0, push: 0, tremble: 0 };
    p.breath = b;
    return p;
  }
  const clip = { id, label, duration: D, poseAt, camAt: () => ({ x: 680, y: 402, zoom: 1.22 }),
    drawBack: (ctx, t, cm) => { backdrop(ctx, cm, t); roofLayer(ctx, cm, t); ctx.save(); camera(ctx, cm, t); footShadow(ctx, poseAt(onFrame(t))); ctx.restore(); },
    drawFront: (ctx, t, cm) => { if (keys.fx) keys.fx(ctx, t, cm, poseAt); embers(ctx, t, { count: 14 }); },
    light: { grade: 0.2 }, ...extra };
  return clip;
}
// an incoming strike from the left, drawn as a red energy streak
function incoming(ctx, t, cm, t0, t1, y, endX) {
  if (t < t0 || t > t1 + 0.15) return;
  ctx.save(); camera(ctx, cm, t);
  const u = clamp((t - t0) / (t1 - t0)), x = lerp(cm.x - 700, endX, EASE.in(u));
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x - 260, y, x, y);
  g.addColorStop(0, 'rgba(255,80,40,0)'); g.addColorStop(1, 'rgba(255,190,140,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 260, y - 9, 260, 18);
  glowLight(ctx, x, y, 60, 'rgba(255,140,90,1)', 0.8);
  ctx.restore();
}
function hitFlash(ctx, t, cm, at, pt) {
  const k = seg(t, at, at + 0.35);
  if (t < at || k >= 1) return;
  ctx.save(); camera(ctx, cm, t);
  glowLight(ctx, pt[0], pt[1], 160, 'rgba(255,220,180,1)', 0.9 * (1 - k));
  burst(ctx, pt[0], pt[1], 60 * (1 - k), { color: '#fff4e6', seed: 4 });
  shockwave(ctx, pt[0], pt[1], k, { maxR: 160, width: 8 });
  ctx.restore();
}

const BLOCK = stanceClip('block', 'Block — brace and absorb', 2.4, {
  pel: [[0, [0, 32]], [0.4, [0, 32]], [0.5, [2, 38]], [0.66, [-4, 50], 'out'], [0.78, [-4, 50]], [0.9, [12, 58], 'out'], [1.25, [2, 36]], [1.5, [0, 31]], [1.7, [0, 33]]],
  rot: [[0, -0.03], [0.5, -0.02], [0.66, -0.14], [0.78, -0.14], [0.9, -0.02], [1.25, -0.08], [1.6, -0.03]],
  armN: [[0, GUARD_SIDE.n], [0.5, GUARD_SIDE.n], [0.66, [-92, -186], 'out'], [0.78, [-92, -186]], [0.9, [-70, -176]], [1.3, [-90, -180]], [1.6, GUARD_SIDE.n]],
  armF: [[0, GUARD_SIDE.f], [0.52, GUARD_SIDE.f], [0.68, [-140, -178], 'out'], [0.78, [-140, -178]], [0.9, [-118, -168]], [1.3, [-140, -172]], [1.65, GUARD_SIDE.f]],
  head: [[0, -0.03], [0.5, -0.03], [0.66, -0.14], [0.8, -0.14], [0.92, -0.02], [1.3, -0.08], [1.6, -0.03]],
  feetN: [[0, [0, 0, 0.12]], [0.6, [0, 0, 0.02]], [1.4, [0, 0, 0.02]], [1.7, [0, 0, 0.12]]],
  expr: [[0, 'focused', 0], [0.6, 'angry', 0.15], [1.1, 'pain', 0.15], [1.5, 'determined', 0.3]],
  fx: (ctx, t, cm, poseAt) => { incoming(ctx, t, cm, 0.45, 0.78, 302, 610); hitFlash(ctx, t, cm, 0.78, [612, 300]); },
}, { chapters: [[0, 'Stance'], [0.5, 'Raise block'], [0.78, 'Impact — brace'], [0.9, 'Absorb'], [1.25, 'Recover']] });

const DODGE = stanceClip('dodge', 'Dodge — lean back', 2.2, {
  pel: [[0, [0, 32]], [0.35, [0, 32]], [0.42, [-3, 34]], [0.6, [20, 54], 'out'], [0.85, [20, 54]], [1.2, [-2, 30], 'inOut'], [1.4, [1, 33]], [1.6, [0, 32]]],
  rot: [[0, -0.03], [0.35, -0.03], [0.42, -0.07], [0.6, 0.32], [0.85, 0.3], [1.2, -0.06], [1.45, -0.02]],
  head: [[0, -0.03], [0.42, -0.06], [0.62, 0.16], [0.85, 0.14], [1.25, -0.06], [1.5, -0.03]],
  armN: [[0, GUARD_SIDE.n], [0.4, GUARD_SIDE.n], [0.6, [-55, -70]], [0.9, [-55, -70]], [1.3, GUARD_SIDE.n]],
  armF: [[0, GUARD_SIDE.f], [0.42, GUARD_SIDE.f], [0.62, [-150, -60]], [0.9, [-150, -60]], [1.3, GUARD_SIDE.f]],
  feetN: [[0, [0, 0, 0.12]], [0.5, [0, 0, 0]], [1.0, [0, 0, 0]], [1.3, [0, 0, 0.12]]],
  feetF: [[0, [0, 0, 0]], [0.55, [0, 0, -0.18]], [0.95, [0, 0, -0.18]], [1.2, [0, 0, 0]]],
  expr: [[0, 'focused', 0], [0.45, 'surprised', 0.12], [1.05, 'determined', 0.3]],
  fx: (ctx, t, cm) => incoming(ctx, t, cm, 0.4, 0.66, 288, 900),
}, { chapters: [[0, 'Stance'], [0.35, 'Anticipation'], [0.45, 'Lean back'], [0.85, 'Return']] });

const DUCK = stanceClip('duck', 'Duck — under a punch', 2.2, {
  pel: [[0, [0, 32]], [0.3, [0, 32]], [0.38, [0, 26]], [0.56, [-8, 150], 'out'], [0.82, [-8, 150]], [1.15, [0, 28], 'inOut'], [1.35, [0, 35]], [1.55, [0, 32]]],
  rot: [[0, -0.03], [0.38, 0.0], [0.56, -0.42], [0.82, -0.4], [1.15, -0.02], [1.4, -0.05], [1.6, -0.03]],
  head: [[0, -0.03], [0.4, 0], [0.58, -0.2], [0.82, -0.18], [1.2, -0.02], [1.5, -0.03]],
  armN: [[0, GUARD_SIDE.n], [0.38, GUARD_SIDE.n], [0.56, [-110, -120]], [0.82, [-110, -120]], [1.2, GUARD_SIDE.n]],
  armF: [[0, GUARD_SIDE.f], [0.38, GUARD_SIDE.f], [0.56, [-170, -110]], [0.82, [-170, -110]], [1.2, GUARD_SIDE.f]],
  feetN: [[0, [0, 0, 0.12]], [0.5, [0, 0, 0.3]], [0.9, [0, 0, 0.3]], [1.2, [0, 0, 0.12]]],
  expr: [[0, 'focused', 0], [0.45, 'angry', 0.12], [1.1, 'focused', 0.3]],
  fx: (ctx, t, cm) => incoming(ctx, t, cm, 0.48, 0.74, 300, 900),
}, { chapters: [[0, 'Stance'], [0.3, 'Anticipation'], [0.4, 'Duck'], [0.82, 'Rise']] });

const RECOIL = stanceClip('recoil', 'Hit & recoil — regain balance', 2.6, {
  pel: [[0, [0, 32]], [0.3, [0, 32]], [0.36, [6, 34]], [0.5, [26, 42], 'out'], [0.68, [42, 56], 'out'], [0.95, [36, 50]], [1.5, [14, 38], 'inOut'], [1.75, [12, 42]], [2.0, [12, 40]]],
  rot: [[0, -0.03], [0.3, -0.03], [0.36, 0.08], [0.48, 0.3], [0.68, 0.2], [0.95, 0.04], [1.5, -0.06], [1.8, -0.02]],
  head: [[0, -0.03], [0.3, -0.03], [0.34, 0.25], [0.44, 0.42, 'out'], [0.62, 0.18], [0.9, -0.04], [1.4, -0.06], [1.8, -0.03]],
  sq: [[0, [1, 1]], [0.34, [0.95, 1.04]], [0.5, [1.03, 0.97]], [0.8, [1, 1]]],
  armN: [[0, GUARD_SIDE.n], [0.3, GUARD_SIDE.n], [0.45, [-140, -150]], [0.62, [-160, -110]], [0.95, [-110, -60]], [1.4, [-80, -90]], [1.7, GUARD_SIDE.n]],
  armF: [[0, GUARD_SIDE.f], [0.3, GUARD_SIDE.f], [0.46, [-230, -150]], [0.64, [-240, -90]], [0.95, [-200, -50]], [1.45, [-190, -80]], [1.75, GUARD_SIDE.f]],
  feetN: [[0, [0, 0, 0.12]], [0.42, [0, 0, 0.12]], [0.52, [20, -16, 0.3], 'out'], [0.66, [38, 0, -0.1], 'inOut'], [0.8, [38, 0, 0]], [1.5, [38, 0, 0.12]]],
  feetF: [[0, [0, 0, 0]], [0.5, [0, 0, -0.2]], [0.8, [0, 0, 0]], [1.2, [0, 0, 0]], [1.32, [16, -10, 0.2], 'out'], [1.48, [24, 0, 0], 'inOut']],
  expr: [[0, 'focused', 0], [0.32, 'pain', 0.1], [1.35, 'angry', 0.25]],
  fx: (ctx, t, cm, poseAt) => { incoming(ctx, t, cm, 0.12, 0.32, 222, 640); hitFlash(ctx, t, cm, 0.32, [640, 222]); },
}, { chapters: [[0, 'Stance'], [0.32, 'Hit'], [0.36, 'Head & torso recoil'], [0.5, 'Catch step'], [0.95, 'Regain balance']] });

/* ---- punch alone (taken from the sequence, 6 s – 11.5 s) ---- */
const PUNCH = {
  id: 'punch', label: 'Punch — 8 stages', duration: 5.5,
  poseAt: t => SEQ.poseAt(6 + t), camAt: t => ({ x: 670, y: 402, zoom: 1.22 }),
  drawBack: (ctx, t, cm) => { backdrop(ctx, cm, t); roofLayer(ctx, cm, t); ctx.save(); camera(ctx, cm, t); footShadow(ctx, SEQ.poseAt(onFrame(6 + t))); dust(ctx, 728, GROUND, seg(6 + t, 8.82, 9.6), { seed: 3 }); ctx.restore(); },
  drawFront: (ctx, t, cm, pose) => {
    const T = 6 + t, c = SEQ.contactPt();
    if (T >= F24(215) && T < F24(215) + 0.5) hitFlash(ctx, T, cm, F24(215), c);
  },
  ghosts: t => SEQ.ghosts(6 + t), light: { grade: 0.2 },
  chapters: [[0, '1 Weight to rear leg'], [0.9, '2 Pull arm back'], [1.85, 'Coil'], [2.45, '3–4 Rotate & accelerate'], [2.96, '5–6 Extend & impact'], [3.21, '7 Follow-through'], [4.2, '8 Recover to stance']],
};

/* ---- front view: idle and head movement ---- */
const IDLE = (() => {
  const D = 8;
  function poseAt(t) {
    const p = basePose('front'); p.s = SC;
    const b = breathe(t, 4), sway = Math.sin((2 * Math.PI * t) / 8);
    p.x = 690 + 4 * sway; p.y = frontY(6) - b * 1.2; p.rot = -0.014 * sway; p.breath = b;
    p.legs = { l: { x: 649, y: GROUND }, r: { x: 733, y: GROUND } };
    p.arms = { l: { ik: [-28 + 3 * Math.sin(t * 1.3), 286 - 4 * b] }, r: { ik: [28 + 3 * Math.sin(t * 1.1 + 2), 286 - 4 * b] } };
    p.head.rot = 0.02 * Math.sin((2 * Math.PI * t) / 8 + 1);
    p.head.turn = 0.12 * Math.sin((2 * Math.PI * t) / 8);
    const gx = t < 2 ? 0.1 : t < 3.2 ? -0.7 : t < 4.6 ? 0.1 : t < 6 ? 0.6 : 0.1;
    p.head.gaze = [gx, 0];
    p.expr = { ...EXPRESSIONS.neutral, head: 'calm' };
    p.blink = blinkAt(t, [1.1, 3.9, 6.6]);
    return p;
  }
  return { id: 'idle', label: 'Idle — breathing & weight shift', duration: D, poseAt, camAt: () => ({ x: 690, y: 402, zoom: 1.22 }),
    drawBack: (ctx, t, cm) => { backdrop(ctx, cm, t); roofLayer(ctx, cm, t); ctx.save(); camera(ctx, cm, t); footShadow(ctx, poseAt(onFrame(t))); ctx.restore(); },
    drawFront: (ctx, t) => embers(ctx, t, { count: 14 }), light: { grade: 0.2 } };
})();

const HEADMOVES = (() => {
  const D = 10;
  const turn = track([[0, 0], [0.4, 0], [0.75, -0.8], [1.2, -0.8], [1.6, 0.8], [2.1, 0.8], [2.5, 0], [3.9, 0], [3.98, -0.12], [4.1, 0.95, 'out'], [4.3, 0.8], [4.75, 0.8], [6.0, -0.85, 'inOut'], [6.6, -0.8], [7.0, 0], [10, 0]], 'smooth');
  const nod = track([[0, 0], [2.5, 0], [2.85, -1], [3.2, -1], [3.5, 1], [3.75, 0.9], [3.95, 0], [8.4, 0], [8.5, 0.3], [9.0, 0]], 'smooth');
  const tilt = track([[0, 0], [6.9, 0], [7.25, 0.17], [7.7, 0.15], [8.0, 0], [10, 0]], 'smooth');
  const push = track([[0, 0], [8.25, 0], [8.32, -9, 'out'], [8.6, -5], [9.0, 0]], 'smooth');
  const slip = track([[0, 0], [9.1, 0], [9.25, -16, 'out'], [9.5, -14], [9.85, 0, 'inOut']], 'smooth');
  const ex = exprTrack([[0, 'neutral', 0], [3.9, 'surprised', 0.12], [4.75, 'angry', 0.3], [6.9, 'neutral', 0.3], [8.28, 'pain', 0.1], [9.0, 'focused', 0.25]]);
  function poseAt(t) {
    const p = basePose('front'); p.s = SC;
    const b = breathe(t, 3.4), tn = turn(t), sl = slip(t);
    p.x = 690 + sl * 0.4; p.y = frontY(8) - b; p.breath = b;
    p.rot = -0.01 * tn - sl * 0.004;
    p.twist = 0.35 * tn;                                    // shoulders follow the head
    p.legs = { l: { x: 649, y: GROUND }, r: { x: 733, y: GROUND } };
    p.arms = { l: { ik: [-28, 286] }, r: { ik: [28, 286] } };
    p.head.turn = tn;
    p.head.gaze = [clamp(tn * 1.1, -1, 1), -nod(t) * 0.8];
    p.head.dy = -nod(t) * 5;
    p.head.dx = sl;
    p.head.rot = tilt(t) + sl * 0.006;
    const e = ex(t);
    p.expr = { ...e, push: e.push + push(t) };
    p.blink = blinkAt(t, [2.3, 5.3, 7.0]);
    return p;
  }
  return { id: 'head', label: 'Head movement', duration: D, poseAt, camAt: () => ({ x: 690, y: 262, zoom: 2.25 }),
    drawBack: (ctx, t, cm) => { backdrop(ctx, cm, t); roofLayer(ctx, cm, t); },
    drawFront: (ctx, t) => embers(ctx, t, { count: 12 }), light: { grade: 0.15 },
    chapters: [[0.4, 'Look left'], [1.2, 'Look right'], [2.5, 'Look up'], [3.2, 'Look down'], [3.6, 'To camera'], [3.95, 'Snap reaction'], [4.75, 'Slow threatening turn'], [6.9, 'Confused tilt'], [8.25, 'Recoil'], [9.1, 'Slip sideways']] };
})();

/* ---- expression sheet (close-up) ---- */
const EXPRESSION_ORDER = ['neutral', 'focused', 'determined', 'angry', 'surprised', 'fear', 'smirk', 'pain', 'shouting', 'exhausted', 'grin'];
const EXPRS = (() => {
  const step = 1.2, D = EXPRESSION_ORDER.length * step;
  const ex = exprTrack(EXPRESSION_ORDER.map((n, i) => [i * step, n, i ? 0.28 : 0]));
  const NOTE = { shouting: 'approximation — needs an open-mouth drawing', exhausted: 'mouth stays closed — needs a drawing', fear: 'built from the surprised drawing', pain: 'built from the angry drawing', determined: 'built from the calm drawing', focused: 'built from the calm drawing' };
  return {
    id: 'expressions', label: 'Expression system', duration: D,
    poseAt: t => basePose('front'), camAt: () => ({ x: 640, y: 360, zoom: 1 }),
    drawBack: (ctx, t) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1c1538'); g.addColorStop(1, '#4a2238');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      bokeh(ctx, t, { seed: 21 });
    },
    custom: (ctx, t) => {
      const e = ex(t);
      const tired = e.name === 'exhausted' ? 1 : 0;
      const b = Math.sin(t * (tired ? 7 : 2.2));
      ctx.save();
      ctx.translate(640 + Math.sin(t * 70) * 1.6 * e.tremble, 400 - e.push * 2.5 + b * (1.5 + tired * 5));
      ctx.rotate(e.tilt + Math.sin(t * 1.3) * 0.01);
      const s = 1.25 * (1 + e.push * 0.004);
      ctx.scale(s, s);
      const gz = e.name === 'fear' ? [Math.sin(t * 9) * 0.7, 0] : [Math.sin(t * 0.9) * 0.25, 0];
      drawBigHead(ctx, e.head, { lid: Math.max(e.lid, blinkAt(t % step, [0.62])), gaze: gz, hair: 2 * Math.sin(t * 2), time: t });
      ctx.restore();
      ctx.fillStyle = '#fff3e6';
      ctx.font = '700 30px "Chakra Petch", "Arial Narrow", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(e.name.toUpperCase(), 70, 60);
      if (NOTE[e.name]) {
        ctx.font = '500 17px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#d9cbe6';
        ctx.fillText(NOTE[e.name], 70, 100);
      }
    },
    light: { grade: 0 },
  };
})();

const CLIPS = [SEQ, IDLE, HEADMOVES, EXPRS, WALK, RUN, JUMP, PUNCH, BLOCK, DODGE, DUCK, RECOIL];
