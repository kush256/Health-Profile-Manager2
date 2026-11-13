// =====================================================================
//  rig.js — shared cut-out puppet primitives (Canvas 2D)
//  Every body part is a parametric vector shape, so it can bend, curl,
//  squash and blink frame by frame (no baked raster poses).
// =====================================================================
(function () {
  const INK = '#24130f';
  const LW = 6;                       // outline width, character units
  const COL = {
    ink: INK, eyeWhite: '#fbf1dc', pupil: '#1d1210', glove: '#ffffff', gloveShade: '#d6dbe6',
    shoe: '#5874a8', shoeDark: '#3f5b8f', sole: '#f6f6f4', mouth: '#6b2030', tongue: '#e66f80', teeth: '#ffffff',
  };

  // ---------- math / timing ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, t) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const E = {
    lin: t => t,
    io: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    o: t => 1 - Math.pow(1 - t, 3),
    i: t => t * t * t,
    ob: t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    ib: t => { const c1 = 1.7, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  };
  // K(t, [[t0,v0],[t1,v1,'ease'],...]) – ease belongs to the segment arriving at that key
  function K(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return lerp(v0, v1, (E[e || 'io'])((t - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  }
  // smooth 1D value noise for living holds / tremor
  function noise(x, seed = 0) {
    const h = n => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(h(i), h(i + 1), u) * 2 - 1;
  }
  // blink: list of blink start times → lid closure 0..1 (fast close, slower open)
  function blink(t, times, dur = 0.16) {
    let v = 0;
    for (const b of times) {
      const u = (t - b) / dur;
      if (u > 0 && u < 1) v = Math.max(v, u < 0.35 ? E.o(u / 0.35) : 1 - E.io((u - 0.35) / 0.65));
    }
    return v;
  }

  // ---------- outline helpers ----------
  function inkFill(ctx, pathFn, fill, lw = LW) {
    ctx.beginPath(); pathFn(ctx);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function tube(ctx, pathFn, w, col, lw = LW) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pathFn(ctx); ctx.strokeStyle = INK; ctx.lineWidth = w + lw * 2; ctx.stroke();
    ctx.beginPath(); pathFn(ctx); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }

  // ---------- rubber-hose limb (auto elbow/knee bend) ----------
  // a: root, b: end, len: rest length, bend: +1/-1 bend side
  function limb(ctx, a, b, len, bend, w, col, shade, via) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const sag = d < len ? Math.sqrt(len * len - d * d) * 0.55 : 0;
    const nx = -dy / d * bend, ny = dx / d * bend;
    const c = via || { x: (a.x + b.x) / 2 + nx * sag, y: (a.y + b.y) / 2 + ny * sag };
    const p = g => { g.moveTo(a.x, a.y); g.quadraticCurveTo(c.x, c.y, b.x, b.y); };
    tube(ctx, p, w, col);
    if (shade) { // thin shade line on the underside for volume
      ctx.save(); ctx.translate(-nx * w * 0.22, -ny * w * 0.22 + w * 0.12);
      ctx.beginPath(); p(ctx); ctx.strokeStyle = shade; ctx.globalAlpha = 0.5; ctx.lineWidth = w * 0.3; ctx.stroke();
      ctx.restore();
    }
    return c;
  }

  // ---------- glove ----------
  // p: {curl 0 open..1 fist, index 0..1 (extends index finger), spread 0..1, side ±1 (thumb side), s scale}
  function glove(ctx, x, y, ang, p) {
    const s = p.s || 1, curl = p.curl ?? 0.3, idx = p.index ?? 0, spread = p.spread ?? 0.4, side = p.side ?? 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s * side);
    const palmR = lerp(21, 19, curl);
    const pc = { x: 31, y: 0 };
    const caps = [];                                         // [x1,y1,x2,y2,r]
    const fa = [-0.5, -0.17, 0.16, 0.48];
    for (let i = 0; i < 4; i++) {
      const a = fa[i] * lerp(0.75, 1.5, spread) * lerp(1, 0.55, curl * (i === 0 ? 1 - idx : 1));
      const isIdx = i === 0;
      const c = isIdx ? curl * (1 - idx) : curl;
      const L = isIdx ? lerp(lerp(27, 4, c), 36, idx) : lerp(i === 3 ? 22 : 27, 4, c);
      const r = lerp(8.6, 9.4, c);
      const bx = pc.x + Math.cos(a) * 12, by = pc.y + Math.sin(a) * 12;
      const aa = isIdx && idx > 0 ? lerp(a, -0.08, idx) : a;
      caps.push([bx, by, bx + Math.cos(aa) * L, by + Math.sin(aa) * L, r]);
    }
    // thumb (on -y side)
    const ta = lerp(-1.15, -0.35, curl) - spread * 0.25;
    const tb = { x: pc.x - 6, y: pc.y - 12 };
    const tL = lerp(20, 12, curl);
    caps.push([tb.x, tb.y, tb.x + Math.cos(ta) * tL, tb.y + Math.sin(ta) * tL, 8.4]);
    const cuff = g => g.roundRect(-8, -17, 18, 34, 7);
    const palm = g => g.ellipse(pc.x, pc.y, palmR, palmR * 0.95, 0, 0, Math.PI * 2);
    // pass 1: ink silhouette
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    ctx.lineWidth = LW * 2;
    for (const sh of [cuff, palm]) { ctx.beginPath(); sh(ctx); ctx.fill(); ctx.stroke(); }
    for (const c of caps) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineWidth = c[4] * 2 + LW * 2; ctx.stroke(); }
    // pass 2: shade then white (gives a soft underside)
    for (const [col, off, shrink] of [[COL.gloveShade, 0, 0], [COL.glove, -2.2, 2.2]]) {
      ctx.fillStyle = col; ctx.strokeStyle = col;
      ctx.save(); ctx.translate(0, off);
      ctx.beginPath(); palm(ctx); ctx.fill();
      for (const c of caps) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineWidth = Math.max(2, c[4] * 2 - shrink); ctx.stroke(); }
      ctx.restore();
    }
    // cuff on top (wrist end), with rib lines
    ctx.beginPath(); cuff(ctx); ctx.fillStyle = COL.glove; ctx.fill(); ctx.lineWidth = LW * 0.8; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-1, -13); ctx.lineTo(-1, 13); ctx.moveTo(4, -13); ctx.lineTo(4, 13); ctx.stroke();
    // finger separation / knuckle lines
    ctx.lineWidth = 2.6; ctx.strokeStyle = INK;
    for (let i = 0; i < 3; i++) {
      const c1 = caps[i], c2 = caps[i + 1];
      const mx = (c1[2] + c2[2]) / 2, my = (c1[3] + c2[3]) / 2, bx = (c1[0] + c2[0]) / 2, by = (c1[1] + c2[1]) / 2;
      ctx.beginPath(); ctx.moveTo(lerp(bx, mx, 0.35), lerp(by, my, 0.35)); ctx.lineTo(lerp(bx, mx, 0.95), lerp(by, my, 0.95)); ctx.stroke();
    }
    if (curl < 0.5) { // three back-of-glove stitches
      ctx.globalAlpha = 1 - curl * 2; ctx.lineWidth = 2.2;
      for (const yy of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(pc.x - 9, pc.y + yy); ctx.lineTo(pc.x + 3, pc.y + yy * 1.25); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---------- sneaker ----------
  // ankle point at (x,y) (y = ground when planted). yaw: -1 points left .. +1 right, |yaw| small = facing camera
  function shoe(ctx, x, y, ang, yaw, s = 1) {
    const dir = yaw >= 0 ? 1 : -1, lf = 0.5 + 0.5 * Math.min(1, Math.abs(yaw));
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang * dir); ctx.scale(dir * lf * s, s);
    const upper = g => {
      g.moveTo(-22, -8); g.bezierCurveTo(-26, -24, -22, -36, -14, -38);
      g.lineTo(6, -38); g.bezierCurveTo(14, -30, 24, -26, 36, -22);
      g.bezierCurveTo(50, -19, 56, -12, 54, -6); g.lineTo(-22, -6); g.closePath();
    };
    const sole = g => g.roundRect(-27, -10, 86, 13, 6.5);
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = LW * 2; ctx.lineJoin = 'round';
    for (const sh of [upper, sole]) { ctx.beginPath(); sh(ctx); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); upper(ctx); ctx.fillStyle = COL.shoe; ctx.fill();
    ctx.save(); ctx.beginPath(); upper(ctx); ctx.clip();
    ctx.fillStyle = COL.shoeDark; ctx.fillRect(-30, -16, 90, 12);           // lower shade
    ctx.beginPath(); ctx.ellipse(56, -8, 22, 18, 0, 0, Math.PI * 2); ctx.fillStyle = COL.sole; ctx.fill(); // toe cap
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); sole(ctx); ctx.fillStyle = COL.sole; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-22, -3); ctx.lineTo(54, -3); ctx.stroke();
    // laces
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (const [a, b] of [[8, -34], [15, -30], [22, -26]]) { ctx.beginPath(); ctx.moveTo(a - 6, b + 2); ctx.lineTo(a + 6, b - 4); ctx.stroke(); }
    // collar opening
    ctx.beginPath(); ctx.ellipse(-5, -37, 11, 3.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#2b3a5c'; ctx.fill();
    ctx.restore();
  }

  // ---------- eye ----------
  // o: {lx,ly (-1..1 look), lidT 0..1, lidB 0..1, tilt (lid slant, + = angry for right eye), pupil scale, skin}
  function eye(ctx, x, y, rx, ry, o) {
    ctx.save();
    const path = g => g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.beginPath(); path(ctx); ctx.fillStyle = COL.eyeWhite; ctx.fill();
    ctx.save(); ctx.beginPath(); path(ctx); ctx.clip();
    const pr = rx * 0.5 * (o.pupil || 1), pry = ry * 0.46 * (o.pupil || 1);
    const px = x + clamp(o.lx || 0, -1.2, 1.2) * rx * 0.42, py = y + clamp(o.ly || 0, -1.2, 1.2) * ry * 0.42;
    ctx.beginPath(); ctx.ellipse(px, py, pr, pry, 0, 0, Math.PI * 2); ctx.fillStyle = '#4a2a1e'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(px, py, pr * 0.72, pry * 0.74, 0, 0, Math.PI * 2); ctx.fillStyle = COL.pupil; ctx.fill();
    ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pry * 0.4, pr * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    // lids
    const lidT = clamp(o.lidT || 0, 0, 1), lidB = clamp(o.lidB || 0, 0, 1), tilt = o.tilt || 0;
    const lidLine = (yy, sgn) => {
      ctx.beginPath();
      ctx.moveTo(x - rx * 1.4, yy - tilt * rx * 1.4 + sgn * 0);
      ctx.quadraticCurveTo(x, yy + sgn * ry * 0.12, x + rx * 1.4, yy + tilt * rx * 1.4);
    };
    if (lidT > 0.001) {
      const yy = y - ry + lidT * ry * 2.05;
      lidLine(yy, 1); ctx.lineTo(x + rx * 1.4, y - ry * 3); ctx.lineTo(x - rx * 1.4, y - ry * 3); ctx.closePath();
      ctx.fillStyle = o.skin; ctx.fill();
      lidLine(yy, 1); ctx.strokeStyle = INK; ctx.lineWidth = LW * 1.3; ctx.stroke();
    }
    if (lidB > 0.001) {
      const yy = y + ry - lidB * ry * 2;
      lidLine(yy, -1); ctx.lineTo(x + rx * 1.4, y + ry * 3); ctx.lineTo(x - rx * 1.4, y + ry * 3); ctx.closePath();
      ctx.fillStyle = o.skin; ctx.fill();
      lidLine(yy, -1); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); path(ctx); ctx.lineWidth = LW * 0.85; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }

  // ---------- brow ----------  inner/outer: y offsets; dir: +1 if inner end is to the right
  function brow(ctx, x, y, len, inner, outer, arch, th, col, dir) {
    const xo = x - dir * len / 2, xi = x + dir * len / 2;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(xo, y + outer);
    ctx.quadraticCurveTo(x, y + (inner + outer) / 2 - arch, xi, y + inner);
    ctx.lineWidth = th; ctx.stroke();
    // thicker inner head
    ctx.beginPath(); ctx.arc(xi - dir * th * 0.2, y + inner, th * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- mouth ----------
  const VIS = {
    X: { w: 1.0, o: 0.0, r: 0.0, tt: 0.0, tb: 0.0, tg: 0.0 },
    M: { w: 0.82, o: 0.0, r: 0.1, tt: 0, tb: 0, tg: 0 },
    A: { w: 1.0, o: 1.0, r: 0.25, tt: 0.3, tb: 0.0, tg: 0.55 },
    E: { w: 1.18, o: 0.5, r: 0.0, tt: 0.5, tb: 0.3, tg: 0.2 },
    O: { w: 0.62, o: 0.85, r: 1.0, tt: 0.12, tb: 0, tg: 0.35 },
    U: { w: 0.48, o: 0.42, r: 1.0, tt: 0, tb: 0, tg: 0.1 },
    L: { w: 0.9, o: 0.42, r: 0.2, tt: 0.35, tb: 0, tg: 0.85 },
    S: { w: 1.08, o: 0.24, r: 0.0, tt: 0.62, tb: 0.55, tg: 0 },
    K: { w: 0.95, o: 0.58, r: 0.3, tt: 0.25, tb: 0, tg: 0.45 },
  };
  function mixVis(a, b, t) { const o = {}; for (const k in VIS.X) o[k] = lerp(a[k], b[k], t); return o; }
  // p: viseme params + smile (-1..1), skew (-1..1), W width px, H max-open px
  function mouth(ctx, x, y, p) {
    const W = p.W, w = W * p.w, h = p.H * p.o, sm = p.smile || 0, sk = p.skew || 0;
    const yL = -sm * W * 0.13 + sk * W * 0.12, yR = -sm * W * 0.13 - sk * W * 0.12;
    const xL = -w / 2, xR = w / 2;
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (h < 3) {
      ctx.beginPath(); ctx.moveTo(xL, yL);
      ctx.quadraticCurveTo(0, sm * W * 0.2 - (h * 0.5), xR, yR);
      ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
      // corner ticks
      ctx.lineWidth = LW * 0.6;
      for (const [cx, cy, s] of [[xL, yL, -1], [xR, yR, 1]]) {
        ctx.beginPath(); ctx.moveTo(cx + s * 2, cy - 7 * Math.sign(sm || 1) * 0.0 - 6); ctx.lineTo(cx + s * 1, cy + 6); ctx.stroke();
      }
      ctx.restore(); return;
    }
    const r = p.r;
    const yTop = Math.min(yL, yR) - h * (0.22 + 0.15 * r) + sm * W * 0.02;
    const yBot = Math.max(yL, yR) + h * (0.78 - 0.1 * r) + sm * W * 0.06;
    const hx = (1 - r) * w * 0.32;
    const path = g => {
      g.moveTo(xL, yL);
      g.bezierCurveTo(xL + hx, lerp(yTop, yTop * 1.0 - h * 0.12, r), xR - hx, lerp(yTop, yTop - h * 0.12, r), xR, yR);
      g.bezierCurveTo(xR - hx * 0.6, lerp(yBot, yBot + h * 0.3, r), xL + hx * 0.6, lerp(yBot, yBot + h * 0.3, r), xL, yL);
      g.closePath();
    };
    ctx.beginPath(); path(ctx); ctx.fillStyle = COL.mouth; ctx.fill();
    ctx.save(); ctx.beginPath(); path(ctx); ctx.clip();
    if (p.tg > 0.01) { ctx.beginPath(); ctx.ellipse(w * 0.06, yBot + h * 0.05, w * 0.32, h * 0.45 * p.tg + 3, 0, 0, Math.PI * 2); ctx.fillStyle = COL.tongue; ctx.fill(); }
    if (p.tt > 0.01) {
      const ty = yTop + h * 0.42 * p.tt + 2;
      ctx.beginPath(); ctx.moveTo(-W, yTop - 60); ctx.lineTo(W, yTop - 60); ctx.lineTo(W, ty); ctx.quadraticCurveTo(0, ty + h * 0.08, -W, ty); ctx.closePath();
      ctx.fillStyle = COL.teeth; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      if (p.teethLines) for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.16, yTop - 5); ctx.lineTo(i * w * 0.16, ty + 1); ctx.stroke(); }
    }
    if (p.tb > 0.01) {
      const ty = yBot - h * 0.4 * p.tb - 2;
      ctx.beginPath(); ctx.moveTo(-W, yBot + 60); ctx.lineTo(W, yBot + 60); ctx.lineTo(W, ty); ctx.quadraticCurveTo(0, ty - h * 0.06, -W, ty); ctx.closePath();
      ctx.fillStyle = COL.teeth; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      if (p.teethLines) for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.16, yBot + 5); ctx.lineTo(i * w * 0.16, ty - 1); ctx.stroke(); }
    }
    ctx.restore();
    ctx.beginPath(); path(ctx); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    ctx.restore();
  }

  // ---------- lip-sync lookup ----------
  // returns viseme params for a speaker at time t (or null if not speaking)
  function lipAt(id, t) {
    const L = window.LIPSYNC && window.LIPSYNC[id];
    if (!L) return null;
    const f = (t - L.start) * 30;
    if (f < -1 || f > L.env.length + 1) return null;
    const i = clamp(Math.floor(f), 0, L.env.length - 1), j = clamp(i + 1, 0, L.env.length - 1), u = clamp(f - i, 0, 1);
    const at = k => {
      const [a, b, w] = L.vis[k];
      const v = mixVis(VIS[a], VIS[b], w);
      // loudness drives openness; closed consonants stay closed
      const env = L.env[k];
      const amp = clamp(env * 1.15, 0, 1);
      v.o = (a === 'M' && w < 0.5) ? 0 : v.o * (0.3 + 0.7 * amp) * (env < 0.12 ? env / 0.12 : 1);
      return v;
    };
    const v = mixVis(at(i), at(j), u);
    v.amp = lerp(L.env[i], L.env[j], u);
    return v;
  }

  window.RIG = { INK, LW, COL, clamp, lerp, smooth, E, K, noise, blink, inkFill, tube, limb, glove, shoe, eye, brow, mouth, VIS, mixVis, lipAt };
})();
