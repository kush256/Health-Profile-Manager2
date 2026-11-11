/* =====================================================================
   rig.js — the cutout puppet
   ---------------------------------------------------------------------
   The front and side drawings from the reference sheet are cut into
   body parts (tools/rig_cut.py → rig-data.js). This file:
     • loads the parts and the expression heads
     • solves arms and legs with two-bone inverse kinematics, so feet stay
       planted and fists travel along real arcs
     • swaps hands (open ↔ fist) and heads (expressions)
     • paints eyelids (blinks, narrowed eyes) and shifts the irises (gaze)
     • adds secondary motion: hair drag, head lag, smears
     • composites the figure with rim light and night grading
   Coordinates: "local" space = source-sprite pixels with the origin on the
   pelvis joint. A pose places the pelvis in world space and scales it.
   ===================================================================== */
'use strict';

/* ---------- images ---------- */
const SPR = {};
const BASE_SPRITES = {
  head_calm: 'sprites/head_calm.png',
  head_angry: 'sprites/head_angry.png',
  head_surprised: 'sprites/head_surprised.png',
  head_grin: 'sprites/head_grin.png',
};
function loadAllImages() {
  const list = Object.entries(BASE_SPRITES);
  for (const [rig, r] of Object.entries(RIG_DATA)) {
    for (const [name, p] of Object.entries(r.pieces)) list.push([`${rig}_${name}`, p.src]);
  }
  return Promise.all(list.map(([k, src]) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { SPR[k] = im; res(); };
    im.onerror = () => rej(new Error('Could not load ' + src));
    im.src = src;
  })));
}
const pieceTint = new Map();
function darkPiece(key, alpha) {           // far-side limbs are drawn darker (in shadow)
  const k = key + alpha;
  if (pieceTint.has(k)) return pieceTint.get(k);
  const im = SPR[key], c = makeCanvas(im.width, im.height), g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha;
  g.fillStyle = '#0a0c20';
  g.fillRect(0, 0, c.width, c.height);
  pieceTint.set(k, c);
  return c;
}

/* ---------- rig definitions (source-sprite pixels) ---------- */
const RIGS = {
  side: {
    pelvis: [105, 505], neck: [100, 180],
    shoulder: { n: [128, 240], f: [134, 244] },
    hip: { n: [105, 505], f: [112, 505] },
    armBend: { n: -1, f: -1 }, legBend: { n: 1, f: 1 },
    ball: [40, 966], heel: [160, 968], ankle: [135, 905],
    soleY: 968,
  },
  front: {
    pelvis: [166, 500], neck: [166, 178],
    shoulder: { l: [64, 256], r: [270, 256] },
    hip: { l: [118, 500], r: [214, 500] },
    armBend: { l: 1, r: -1 }, legBend: { l: 1, r: -1 },
    soleY: 975,
  },
};
const P = (rig, piece) => RIG_DATA[rig].pieces[piece];
const vecLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const vecAng = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
function boneInfo(rig, piece) {
  const d = P(rig, piece);
  return { len: vecLen(d.pivot, d.end), rest: vecAng(d.pivot, d.end) };
}

/* ---------- two-bone IK ---------- */
function ik2(hx, hy, tx, ty, L1, L2, bend) {
  const dx = tx - hx, dy = ty - hy;
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1, (L1 + L2) * 0.9995);
  const th = Math.atan2(dy, dx);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const a1 = th + bend * a;
  const kx = hx + Math.cos(a1) * L1, ky = hy + Math.sin(a1) * L1;
  const ex = hx + Math.cos(th) * d, ey = hy + Math.sin(th) * d;
  return { a1, a2: Math.atan2(ey - ky, ex - kx), kx, ky, ex, ey };
}

/* ---------- heads & expressions ---------- */
// eyes: [cx, cy, rx, ry] in each drawing's own pixels; hairY: rows above this sway with the hair
const HEADS = {
  smirk: { key: 'front_head', piece: ['front', 'head'], eyes: [[142, 103, 13, 6], [186, 103, 12, 6]], skin: '#c68c68', hairY: 80 },
  side: { key: 'side_head', piece: ['side', 'head'], eyes: [[57, 97, 9, 6]], skin: '#c48c67', hairY: 82 },
  calm: { key: 'head_calm', eyes: [[103, 180, 23, 10], [189, 180, 23, 10]], mid: [146, 180], skin: '#c48663', hairY: 150 },
  grin: { key: 'head_grin', eyes: [[104, 181, 23, 10], [191, 181, 23, 10]], mid: [147.5, 181], skin: '#c48663', hairY: 150 },
  angry: { key: 'head_angry', eyes: [[100, 185, 20, 9], [185, 184, 21, 9]], mid: [142.5, 184.5], skin: '#c38562', hairY: 150 },
  surprised: { key: 'head_surprised', eyes: [[104, 182, 23, 15], [193, 182, 23, 15]], mid: [148.5, 182], skin: '#c48663', hairY: 150 },
};
const EXPR_SCALE = 44 / 86;           // big expression heads → puppet head size (eye spacing)
const NECK_CUT = 318;                 // expression heads are clipped above their collar

// The reusable expression system. Each preset = drawing + eyelid + head attitude.
// Expressions without a matching drawing are built from the closest one (see README).
const EXPRESSIONS = {
  neutral:    { head: 'calm', lid: 0.0, tilt: 0.0, push: 0, tremble: 0 },
  focused:    { head: 'calm', lid: 0.34, tilt: -0.03, push: 3, tremble: 0 },
  determined: { head: 'calm', lid: 0.24, tilt: -0.05, push: 1, tremble: 0 },
  angry:      { head: 'angry', lid: 0.06, tilt: -0.02, push: 3, tremble: 0 },
  surprised:  { head: 'surprised', lid: 0.0, tilt: 0.03, push: -6, tremble: 0 },
  fear:       { head: 'surprised', lid: 0.0, tilt: -0.02, push: -9, tremble: 1 },
  smirk:      { head: 'smirk', lid: 0.12, tilt: 0.06, push: 0, tremble: 0 },
  pain:       { head: 'angry', lid: 0.66, tilt: -0.1, push: -5, tremble: 0.5 },
  shouting:   { head: 'angry', lid: 0.0, tilt: 0.06, push: 5, tremble: 0.7 },
  exhausted:  { head: 'calm', lid: 0.52, tilt: 0.09, push: 2, tremble: 0 },
  grin:       { head: 'grin', lid: 0.0, tilt: 0.03, push: 0, tremble: 0 },
};
/* Expression track: keys [[time, name, transitionSeconds]].
   Numbers blend; the drawing swaps at the midpoint of the transition, hidden
   under a quick blink — the standard way to change a head drawing. */
function exprTrack(keys) {
  return t => {
    let i = 0;
    while (i + 1 < keys.length && t >= keys[i + 1][0]) i++;
    const [t0, name, dur = 0.22] = keys[i];
    const cur = EXPRESSIONS[name];
    const prev = i > 0 ? EXPRESSIONS[keys[i - 1][1]] : cur;
    const u = dur > 0 ? ease.inOut(seg(t, t0, t0 + dur)) : 1;
    const out = {};
    for (const k of ['lid', 'tilt', 'push', 'tremble']) out[k] = lerp(prev[k], cur[k], u);
    out.head = u < 0.5 ? prev.head : cur.head;
    out.name = name;
    if (prev.head !== cur.head && dur > 0) {             // cover the swap with a blink
      const b = 1 - Math.abs(seg(t, t0, t0 + dur) - 0.5) * 2;
      out.lid = Math.max(out.lid, clamp(b * 1.6));
    }
    return out;
  };
}
function blinkAt(t, times) {           // natural blink shape: fast close, slower open
  let c = 0;
  for (const at of times) {
    const d = t - at;
    if (d < 0 || d > 0.2) continue;
    c = Math.max(c, d < 0.05 ? d / 0.05 : d < 0.09 ? 1 : 1 - (d - 0.09) / 0.11);
  }
  return c;
}

// draw a head drawing in its own pixel space
function drawHeadDrawing(g, h, st) {
  const img = SPR[h.key];
  const off = h.piece ? RIG_DATA[h.piece[0]].pieces[h.piece[1]].offset : [0, 0];
  g.save();
  if (!h.piece) { g.beginPath(); g.rect(-40, -40, img.width + 80, NECK_CUT + 40); g.clip(); }
  const hairAmp = st.hair || 0;
  const hairY = h.hairY - off[1];
  if (Math.abs(hairAmp) > 0.05 && hairY > 0) {
    const step = 3;
    for (let y = 0; y < img.height; y += step) {
      const sh = Math.min(step, img.height - y);
      const v = clamp(1 - (y + 1) / hairY);
      const dx = hairAmp * Math.pow(v, 1.5) * (1 + 0.25 * Math.sin(st.time * 9 + y * 0.08));
      g.drawImage(img, 0, y, img.width, sh, off[0] + dx, off[1] + y, img.width, sh + 0.6);
    }
  } else {
    g.drawImage(img, off[0], off[1]);
  }
  // gaze: slide the iris inside the eye opening
  const [gx, gy] = st.gaze || [0, 0];
  if (Math.abs(gx) + Math.abs(gy) > 0.02) {
    for (const [cx, cy, rx, ry] of h.eyes) {
      g.save();
      g.beginPath(); g.ellipse(cx, cy, rx * 0.62, ry * 0.55, 0, 0, Math.PI * 2); g.clip();
      g.drawImage(img, off[0] - gx * rx * 0.26, off[1] - gy * ry * 0.18, img.width, img.height);
      g.restore();
    }
  }
  drawLids(g, h, st.lid || 0);
  g.restore();
}
function drawLids(g, h, amt) {
  if (amt <= 0.01) return;
  for (const [cx, cy, rx, ry] of h.eyes) {
    const top = cy - ry - 3, lidY = top + (ry * 2 + 4) * clamp(amt);
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx + 2, ry + 3, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = h.skin;
    g.fillRect(cx - rx - 3, top, rx * 2 + 6, lidY - top);
    g.restore();
    const c = clamp(amt);
    g.strokeStyle = '#26130b';
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.4, rx / 7);
    const ly = Math.min(lidY, cy + ry - 2);
    g.beginPath();
    g.moveTo(cx - rx + 1, ly - 3 * (1 - c));
    g.quadraticCurveTo(cx, ly + (ry * 0.45) * c - 2 * (1 - c), cx + rx, ly - 4 * (1 - c) - 1);
    g.stroke();
  }
}
// standalone big head (for close-ups)
function drawBigHead(g, name, st) {
  const h = HEADS[name];
  g.save();
  if (h.piece) {                       // the puppet's own head, scaled to match the big heads
    g.scale(1 / EXPR_SCALE, 1 / EXPR_SCALE);
    g.translate(-164, -103);
  } else {
    g.translate(-h.mid[0], -h.mid[1]);
  }
  drawHeadDrawing(g, h, st);
  g.restore();
}

/* ---------- pose defaults ---------- */
function basePose(rig) {
  return {
    rig, x: 640, y: 400, s: 0.5, rot: 0, sq: [1, 1], twist: 0, breath: 0, flipX: 1,
    head: { rot: 0, dx: 0, dy: 0, turn: 0, gaze: [0, 0] },
    expr: { head: rig === 'side' ? 'side' : 'calm', lid: 0, tilt: 0, push: 0, tremble: 0 },
    blink: 0, arms: {}, legs: {}, hands: {}, smear: 0, stretch: 0, alpha: 1,
  };
}

/* ---------- world ↔ local ---------- */
function toLocal(p, wx, wy) {
  const dx = (wx - p.x) / (p.s * p.flipX), dy = (wy - p.y) / p.s;
  const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
  return [dx * c - dy * s, dx * s + dy * c];
}
function toWorld(p, lx, ly) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [p.x + (lx * c - ly * s) * p.s * p.flipX, p.y + (lx * s + ly * c) * p.s];
}

/* ---------- solve the skeleton for a pose ---------- */
function solve(p) {
  const R = RIGS[p.rig], pel = R.pelvis;
  const [sx, sy] = p.sq;
  const J = (pt) => [(pt[0] - pel[0]) * sx, (pt[1] - pel[1]) * sy];
  const out = { torso: { x: 0, y: 0 }, arms: {}, legs: {} };
  const sides = p.rig === 'side' ? ['n', 'f'] : ['l', 'r'];
  const breathLift = -p.breath * 3;
  for (const k of sides) {
    // shoulders
    let sh = J(R.shoulder[k]);
    sh[1] += breathLift;
    if (p.rig === 'side') sh[0] += (k === 'n' ? -22 : 12) * p.twist;
    else sh[0] += 7 * p.twist;
    const arm = p.arms[k] || { fk: [0, 0] };
    const fist = !!(p.hands[k]);
    const upName = p.rig === 'side' ? 'upperarm' : `upperarm_${k}`;
    // IK always aims the full forearm (hand centre); a fist is fitted at the wrist,
    // so swapping open hand <-> fist never makes the arm jump
    const foOpen = p.rig === 'side' ? 'forearm' : `forearm_${k}`;
    const foName = fist ? (p.rig === 'side' ? 'forearm_cut' : `forearm_${k}_cut`) : foOpen;
    const up = boneInfo(p.rig, upName), fo = boneInfo(p.rig, foOpen);
    // fs = foreshortening of the upper arm when it points toward / away from the camera
    const fs = arm.fs || 0, L1 = up.len * (1 - fs);
    let a1, a2, ex, ey;
    if (arm.ik) {
      // two IK solutions exist; keep the anatomically natural one:
      // elbow down and toward the back (side view) or down and outward (front view)
      const tx = sh[0] + arm.ik[0], ty = sh[1] + arm.ik[1];
      const ra = ik2(sh[0], sh[1], tx, ty, L1, fo.len, 1), rb = ik2(sh[0], sh[1], tx, ty, L1, fo.len, -1);
      const out = p.rig === 'side' ? 1 : (k === 'l' ? -1 : 1);
      const score = r => r.ky + 0.35 * out * r.kx;
      const r = arm.flip ? (score(ra) > score(rb) ? rb : ra) : (score(ra) >= score(rb) ? ra : rb);
      a1 = r.a1; a2 = r.a2;
    } else {
      a1 = up.rest + arm.fk[0];
      a2 = a1 - up.rest + fo.rest + arm.fk[1];
    }
    const elb = [sh[0] + Math.cos(a1) * L1, sh[1] + Math.sin(a1) * L1];
    ex = elb[0] + Math.cos(a2) * fo.len; ey = elb[1] + Math.sin(a2) * fo.len;
    const foRot = a2 - fo.rest;
    let wristPt = null, cutAng = 0;
    if (fist) {
      const dc = P(p.rig, foName);
      const vx = dc.end[0] - dc.pivot[0], vy = dc.end[1] - dc.pivot[1];
      const c = Math.cos(foRot), sn = Math.sin(foRot);
      wristPt = [elb[0] + vx * c - vy * sn, elb[1] + vx * sn + vy * c];
      cutAng = Math.atan2(vy, vx) + foRot;
    }
    out.arms[k] = { sh, elb, hand: [ex, ey], upRot: a1 - up.rest, upS: -fs, foRot, foAng: cutAng, wristPt, upName, foName, fist, wrist: arm.wrist || 0 };
  }
  for (const k of sides) {
    const hip = J(R.hip[k]);
    if (p.rig === 'side') hip[0] += (k === 'n' ? -7 : 4) * p.twist;
    const foot = p.legs[k];
    const thName = p.rig === 'side' ? 'thigh' : `thigh_${k}`;
    const shName = p.rig === 'side' ? 'shin' : `shin_${k}`;
    const th = boneInfo(p.rig, thName), sn = boneInfo(p.rig, shName);
    let target, footRot = 0;
    if (p.rig === 'side') {
      // foot = {x, y, roll}: (x, y) = world position of the ball of the foot when flat
      const roll = foot.roll || 0;
      const ball = toLocal(p, foot.x, foot.y);
      footRot = -roll - p.rot;               // world angle → local
      const restBall = R.ball, restHeel = R.heel, ank = R.ankle;
      let pivot, pivRest;
      if (roll >= 0) { pivot = ball; pivRest = restBall; }
      else { pivot = [ball[0] + (restHeel[0] - restBall[0]), ball[1] + (restHeel[1] - restBall[1])]; pivRest = restHeel; }
      const vx = ank[0] - pivRest[0], vy = ank[1] - pivRest[1];
      const c = Math.cos(footRot), s = Math.sin(footRot);
      target = [pivot[0] + vx * c - vy * s, pivot[1] + vx * s + vy * c];
    } else {
      target = toLocal(p, foot.x, foot.y);
    }
    const r = ik2(hip[0], hip[1], target[0], target[1], th.len, sn.len, R.legBend[k]);
    if (p.rig === 'front') {
      // Front view: a bending knee travels toward the camera, so most of the bend is
      // shown as foreshortening (thigh and shin get shorter) instead of bowing sideways.
      const f = th.len / (th.len + sn.len);
      const kx = lerp(hip[0] + (r.ex - hip[0]) * f, r.kx, 0.3), ky = lerp(hip[1] + (r.ey - hip[1]) * f, r.ky, 0.3);
      const l1 = Math.hypot(kx - hip[0], ky - hip[1]), l2 = Math.hypot(r.ex - kx, r.ey - ky);
      const a1 = Math.atan2(ky - hip[1], kx - hip[0]), a2 = Math.atan2(r.ey - ky, r.ex - kx);
      out.legs[k] = { hip, knee: [kx, ky], end: [r.ex, r.ey], thRot: a1 - th.rest, snRot: a2 - sn.rest, footRot,
        thName, shName, thS: l1 / th.len - 1, snS: l2 / sn.len - 1 };
      continue;
    }
    out.legs[k] = { hip, knee: [r.kx, r.ky], end: [r.ex, r.ey], thRot: r.a1 - th.rest, snRot: r.a2 - sn.rest, footRot, thName, shName };
  }
  let neck = J(R.neck);
  neck[1] += breathLift * 0.7;
  if (p.rig === 'side') neck[0] += -6 * p.twist;
  else neck[0] += 6 * p.twist;
  out.neck = neck;
  return out;
}

/* ---------- drawing ---------- */
function drawPiece(g, img, d, jx, jy, rot, stretch = 0, keepWidth = false) {
  g.save();
  g.translate(jx, jy);
  g.rotate(rot);
  if (stretch) {                                   // squash & stretch along the bone
    const a = vecAng(d.pivot, d.end);
    g.rotate(a); g.scale(1 + stretch, keepWidth ? 1 : 1 - stretch * 0.35); g.rotate(-a);
  }
  g.drawImage(img, d.offset[0] - d.pivot[0], d.offset[1] - d.pivot[1]);
  g.restore();
}
function drawArm(g, p, A, far, alpha = 1) {
  const rig = p.rig;
  const key = n => `${rig}_${n}`;
  const img = n => (far ? darkPiece(key(n), 0.42) : SPR[key(n)]);
  g.save();
  g.globalAlpha *= alpha;
  drawPiece(g, img(A.upName), P(rig, A.upName), A.sh[0], A.sh[1], A.upRot, A.upS, true);
  drawPiece(g, img(A.foName), P(rig, A.foName), A.elb[0], A.elb[1], A.foRot, far ? 0 : p.stretch);
  if (A.fist) {
    const fd = rig === 'side' ? P('action', 'fist_side') : P('action', 'fist_front');
    const fk = rig === 'side' ? 'action_fist_side' : 'action_fist_front';
    const fimg = far ? darkPiece(fk, 0.42) : SPR[fk];
    const fistRest = vecAng(fd.pivot, fd.end);
    const sc = rig === 'side' ? 0.95 : 0.46;
    g.save();
    g.translate(A.wristPt[0], A.wristPt[1]);
    g.rotate(A.foAng - fistRest + A.wrist);
    g.scale(sc, sc);
    g.drawImage(fimg, fd.offset[0] - fd.pivot[0], fd.offset[1] - fd.pivot[1]);
    g.restore();
  }
  g.restore();
}
function drawLeg(g, p, L, far) {
  const rig = p.rig;
  const img = n => (far ? darkPiece(`${rig}_${n}`, 0.42) : SPR[`${rig}_${n}`]);
  drawPiece(g, img(L.thName), P(rig, L.thName), L.hip[0], L.hip[1], L.thRot, L.thS || 0, true);
  drawPiece(g, img(L.shName), P(rig, L.shName), L.knee[0], L.knee[1], L.snRot, L.snS || 0, true);
  if (rig === 'side') drawPiece(g, img('foot'), P('side', 'foot'), L.end[0], L.end[1], L.footRot);
}
function drawHeadOnRig(g, p, S, sec) {
  const e = p.expr;
  const trem = e.tremble ? Math.sin(sec.time * 70) * 0.9 * e.tremble : 0;
  const d = p.rig === 'side' ? -1 : 0;           // side view: "push" moves the head forward (−x)
  g.save();
  g.translate(S.neck[0] + p.head.dx + (d ? -e.push : 0) + trem, S.neck[1] + p.head.dy + (d ? 0 : -e.push * 0.4));
  g.rotate(p.head.rot + e.tilt + sec.headLag);
  if (p.rig === 'front') {
    const turn = p.head.turn;
    g.translate(turn * 7, 0);
    g.scale(1 - Math.abs(turn) * 0.07, 1 + (e.push > 0 ? e.push * 0.002 : 0));
  }
  const st = {
    lid: Math.max(e.lid, p.blink), gaze: p.head.gaze, hair: sec.hair, time: sec.time,
  };
  const h = HEADS[p.rig === 'side' ? 'side' : e.head];
  if (h.piece) {
    const pv = P(h.piece[0], 'head').pivot;
    g.translate(-pv[0], -pv[1]);
    drawHeadDrawing(g, h, st);
  } else {
    g.translate(164 - 166, 103 - 178);
    g.scale(EXPR_SCALE, EXPR_SCALE);
    g.translate(-h.mid[0], -h.mid[1]);
    st.hair = st.hair / EXPR_SCALE;
    drawHeadDrawing(g, h, st);
  }
  g.restore();
}
function drawRigPieces(g, p, sec, ghosts = []) {
  const S = solve(p);
  const base = g.getTransform();
  g.save();
  g.globalAlpha = p.alpha;
  g.translate(p.x, p.y);
  g.scale(p.s * p.flipX, p.s);
  g.rotate(p.rot);
  const R = RIGS[p.rig];
  if (p.rig === 'side') {
    drawArm(g, p, S.arms.f, true);
    drawLeg(g, p, S.legs.f, true);
    g.save(); g.scale(p.sq[0] * (1 + 0.03 * p.twist), p.sq[1] * (1 + p.breath * 0.006));
    drawPiece(g, SPR.side_torso, P('side', 'torso'), 0, 0, 0); g.restore();
    drawLeg(g, p, S.legs.n, false);
    drawHeadOnRig(g, p, S, sec);
    for (const gh of ghosts) {                    // smear frames: earlier positions of the punching arm
      const q = gh.pose;
      g.save(); g.setTransform(base);
      g.translate(q.x, q.y); g.scale(q.s * q.flipX, q.s); g.rotate(q.rot);
      drawArm(g, q, solve(q).arms.n, false, gh.alpha);
      g.restore();
    }
    drawArm(g, p, S.arms.n, false);
  } else {
    drawLeg(g, p, S.legs.l, false);
    drawLeg(g, p, S.legs.r, false);
    for (const k of ['l', 'r']) {
      const A = S.arms[k];
      drawPiece(g, SPR[`front_${A.upName}`], P('front', A.upName), A.sh[0], A.sh[1], A.upRot, A.upS, true);
    }
    g.save(); g.scale(p.sq[0] * (1 - Math.abs(p.twist) * 0.04), p.sq[1] * (1 + p.breath * 0.006));
    drawPiece(g, SPR.front_torso, P('front', 'torso'), 0, 0, 0); g.restore();
    drawHeadOnRig(g, p, S, sec);
    for (const k of ['l', 'r']) {
      const A = S.arms[k];
      // forearm + hand in front of the torso (guard crosses the chest)
      drawPiece(g, SPR[`front_${A.foName}`], P('front', A.foName), A.elb[0], A.elb[1], A.foRot);
      if (A.fist) {
        const fd = P('action', 'fist_front');
        g.save();
        g.translate(A.wristPt[0], A.wristPt[1]);
        g.rotate(A.foAng - vecAng(fd.pivot, fd.end) + A.wrist);
        g.scale(k === 'l' ? -0.46 : 0.46, 0.46);
        g.drawImage(SPR.action_fist_front, fd.offset[0] - fd.pivot[0], fd.offset[1] - fd.pivot[1]);
        g.restore();
      }
    }
  }
  g.restore();
  return S;
}

/* ---------- secondary motion from the pose history ---------- */
// Pose functions are pure functions of time, so the past is just poseAt(t - dt).
function secondary(poseAt, t, wind = 1) {
  const dt = 1 / 24;
  const p0 = poseAt(t), p1 = poseAt(t - dt), p2 = poseAt(t - 3 * dt), p3 = poseAt(t - 6 * dt);
  const same = (a, b) => a.rig === b.rig;
  const vx = (a, b, n) => (same(a, b) ? (a.x - b.x) / (n * dt) : 0);
  const vNow = vx(p0, p1, 1), vLag = vx(p1, p2, 2), vLate = vx(p2, p3, 3);
  const headVel = same(p0, p1) ? (p0.head.rot + p0.rot - p1.head.rot - p1.rot) / dt : 0;
  const turnVel = same(p0, p1) ? (p0.head.turn - p1.head.turn) / dt : 0;
  const dir = p0.rig === 'side' ? 1 : 1;
  // hair trails behind the motion, overshoots when the body stops, plus wind
  let hair = -0.017 * vLag * dir + 0.008 * (vLag - vLate) - headVel * 4 - turnVel * 3;
  hair += wind * (1.6 * Math.sin(t * 2.3) + 0.8 * Math.sin(t * 5.1));
  hair = clamp(hair, -14, 14);
  // head follows torso lean with a delay (overlapping action)
  const headLag = same(p0, p2) ? clamp((p2.rot - p0.rot) * 0.45, -0.15, 0.15) : 0;
  return { hair, headLag, time: t, vx: vNow };
}

/* ---------- figure layer: rim light + grade ---------- */
let FIG = null;
function ensureFig() {
  if (FIG) return FIG;
  const c = makeCanvas(W * RES, H * RES), s = makeCanvas(W * RES, H * RES);
  FIG = { c, g: c.getContext('2d'), s, sg: s.getContext('2d') };
  return FIG;
}
function drawCharacter(ctx, p, sec, light = {}, ghosts = []) {
  const { rim = COL.rim, rimAlpha = 0.6, grade = 0.22, rimOffset = 2.5 } = light;
  const F = ensureFig();
  const m = ctx.getTransform();
  F.g.setTransform(1, 0, 0, 1, 0, 0);
  F.g.clearRect(0, 0, F.c.width, F.c.height);
  F.g.setTransform(m);
  const S = drawRigPieces(F.g, p, sec, ghosts);
  F.g.setTransform(1, 0, 0, 1, 0, 0);
  if (grade > 0) {
    F.g.globalCompositeOperation = 'source-atop';
    F.g.globalAlpha = grade;
    F.g.fillStyle = COL.night;
    F.g.fillRect(0, 0, F.c.width, F.c.height);
    F.g.globalAlpha = 1;
    F.g.globalCompositeOperation = 'source-over';
  }
  F.sg.setTransform(1, 0, 0, 1, 0, 0);
  F.sg.clearRect(0, 0, F.s.width, F.s.height);
  F.sg.drawImage(F.c, 0, 0);
  F.sg.globalCompositeOperation = 'source-in';
  F.sg.fillStyle = rim;
  F.sg.fillRect(0, 0, F.s.width, F.s.height);
  F.sg.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const o = rimOffset * RES;
  ctx.globalAlpha = rimAlpha;
  ctx.drawImage(F.s, -o, 0);
  ctx.drawImage(F.s, o, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(F.c, 0, 0);
  ctx.restore();
  return S;
}
// world position of a hand (for effects that must touch the fist)
function handWorld(p, k) {
  const S = solve(p);
  return toWorld(p, S.arms[k].hand[0], S.arms[k].hand[1]);
}
