/* =====================================================================
   ROOFTOP STRIKE — 2D anime scene built from the character reference sheet
   ---------------------------------------------------------------------
   The character is never redrawn with shapes: every frame uses the
   artwork cut out of the reference sheet (see tools/slice_sheet.py).
   Motion comes from cutout / limited-animation techniques:
     • pose swaps between the drawn views (front, side, back, action)
     • expression swaps between the four drawn heads
     • strip warping of the bitmap (breathing, body sway, hair in wind)
     • a painted blink drawn over the eyes of the close-up heads
     • camera moves, cuts, speed lines, impact frames, particles
   File layout:
     1. CONFIG      – canvas size, sprite list, eye positions, palette
     2. UTILITIES   – easing, seeded random
     3. SPRITES     – loading, tint caches, drawSprite (with warp), blink
     4. BACKGROUNDS – sky, skyline layers, rooftop, bokeh
     5. FX          – speed lines, focus lines, embers, debris, flashes
     6. SHOTS       – the timeline: one function per shot
     7. PLAYER      – render loop and controls
   ===================================================================== */
'use strict';

/* ---------- 1. CONFIG ---------- */
const W = 1280, H = 720;          // logical stage size
const RES = 1.5;                  // backing-store multiplier (1920×1080)
const DURATION = 14.5;            // loop length in seconds

const SPRITE_FILES = {
  front: 'sprites/front.png',
  side: 'sprites/side.png',
  back: 'sprites/back.png',
  action: 'sprites/action.png',
  head_calm: 'sprites/head_calm.png',
  head_angry: 'sprites/head_angry.png',
  head_surprised: 'sprites/head_surprised.png',
  head_grin: 'sprites/head_grin.png',
};

// eye centres in sprite pixels (measured on the cut-out heads)
const EYES = {
  head_calm: [[103, 180], [189, 180]],
  head_grin: [[104, 181], [191, 181]],
};
const EYE_RX = 23, EYE_RY = 10;
const SKIN = '#c48663';           // sampled from the sheet, under the eyes
const LID = '#2a150d';

// anchor points in sprite pixels
const ANCHOR = {
  action_fist: [365, 80],
  angry_eyes: [146, 180],
};

const COL = {
  skyTop: '#0a0920', skyMid: '#24173f', horizon: '#c4573a',
  far: '#1d1936', near: '#100e22', roof: '#0b0a18',
  glow: '#ff5a2a', rim: '#ff8a55', night: '#151a45',
};

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 2. UTILITIES ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = {
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};
function rng(seed) {                         // mulberry32
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// effects "boil" on twos (12 fps) like hand-drawn anime effects
const boil = (t, fps = 12) => Math.floor(t * fps);
function mixHex(a, b, k) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], k))).join(',')})`;
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* ---------- 3. SPRITES ---------- */
const IMG = {};
function loadSprites() {
  return Promise.all(Object.entries(SPRITE_FILES).map(([k, src]) =>
    new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { IMG[k] = im; res(); };
      im.onerror = () => rej(new Error('Could not load ' + src));
      im.src = src;
    })));
}

const tintCache = new Map();
/* mode 'fill'  -> flat silhouette in `color`
   mode 'grade' -> artwork with `color` laid over at `alpha` (lighting grade) */
function tint(name, color, mode = 'fill', alpha = 1) {
  const key = name + color + mode + alpha;
  if (tintCache.has(key)) return tintCache.get(key);
  const im = IMG[name];
  const c = makeCanvas(im.width, im.height);
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = mode === 'fill' ? 'source-in' : 'source-atop';
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}

/* Draw a sprite.
   o = { x, y, s, ax, ay, rot, alpha, sy, warp(v)->dx, after(ctx, ox, oy) }
   (x, y) is where the anchor (ax, ay — fractions of the sprite) lands. */
function drawSprite(ctx, src, o) {
  const w = src.width, h = src.height;
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(o.s, o.s * (o.sy || 1));
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const ox = -w * (o.ax ?? 0.5), oy = -h * (o.ay ?? 1);
  if (!o.warp) {
    ctx.drawImage(src, ox, oy);
  } else {
    const step = 3;
    for (let y = 0; y < h; y += step) {
      const sh = Math.min(step, h - y);
      ctx.drawImage(src, 0, y, w, sh, ox + o.warp(y / h), oy + y, w, sh + 0.6);
    }
  }
  if (o.after) o.after(ctx, ox, oy);
  ctx.restore();
}

// warps (input v = 0 at top of sprite … 1 at bottom; output = x offset in sprite px)
const warp = {
  bodySway: (T, amp = 3) => v => amp * Math.pow(1 - v, 2) * Math.sin(T * 1.7),
  hairWind: (T, amp = 3.2, limit = 0.42) => v =>
    v > limit ? 0 : amp * Math.pow(1 - v / limit, 1.6) * Math.sin(T * 7 + v * 20),
  breathe: T => 1 + 0.006 * Math.sin(T * 2.4),
};

// blink: 0 open → 1 closed, painted over the drawn eyes
function blinkAmount(t, at) {
  const d = t - at;
  if (d < 0 || d > 0.17) return 0;
  if (d < 0.05) return d / 0.05;
  if (d < 0.09) return 1;
  return 1 - (d - 0.09) / 0.08;
}
// grade = the same night-grade strength used on the sprite, so the lid matches the skin
function drawBlink(ctx, name, ox, oy, c, grade = 0) {
  if (c <= 0 || !EYES[name]) return;
  const skin = mixHex(SKIN, COL.night, grade);
  for (const [ex, ey] of EYES[name]) {
    const x = ox + ex, y = oy + ey;
    const top = y - EYE_RY - 3;
    const lidY = top + (EYE_RY * 2 + 4) * c;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, EYE_RX + 2, EYE_RY + 3, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = skin;
    ctx.fillRect(x - EYE_RX - 3, top, EYE_RX * 2 + 6, lidY - top);
    ctx.restore();
    // lash line follows the lid down and curves when shut
    ctx.strokeStyle = LID;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.2;
    const ly = Math.min(lidY, y + EYE_RY - 2);
    ctx.beginPath();
    ctx.moveTo(x - EYE_RX + 1, ly - 3 * (1 - c));
    ctx.quadraticCurveTo(x, ly + 5 * c - 2 * (1 - c), x + EYE_RX, ly - 4 * (1 - c) - 1);
    ctx.stroke();
  }
}

// character with a rim light from behind and a night grade on top
function drawLitCharacter(ctx, name, o, { rim = COL.rim, rimAlpha = 0.6, grade = 0.25, rimOffset = 2.5 } = {}) {
  const rimSrc = tint(name, rim, 'fill');
  for (const dx of [-rimOffset, rimOffset]) {
    drawSprite(ctx, rimSrc, { ...o, x: o.x + dx, alpha: (o.alpha ?? 1) * rimAlpha, after: null });
  }
  drawSprite(ctx, grade > 0 ? tint(name, COL.night, 'grade', grade) : IMG[name], o);
}

/* ---------- 4. BACKGROUNDS ---------- */
let LAYERS = {};
function makeSkyline(seed, { height, minH, maxH, color, win, winChance, width = 1700 }) {
  const c = makeCanvas(width, height);
  const g = c.getContext('2d');
  const r = rng(seed);
  let x = 0;
  while (x < width) {
    const bw = 40 + r() * 110, bh = minH + r() * (maxH - minH);
    g.fillStyle = color;
    g.fillRect(x, height - bh, bw + 1, bh);
    if (r() < 0.25) g.fillRect(x + bw * 0.5, height - bh - 30, 3, 30);
    for (let wy = height - bh + 10; wy < height - 8; wy += 15) {
      for (let wx = 7; wx < bw - 8; wx += 12) {
        if (r() < winChance) {
          g.fillStyle = r() < 0.15 ? '#ffd27a' : win;
          g.globalAlpha = 0.35 + r() * 0.6;
          g.fillRect(x + wx, wy, 5, 7);
          g.globalAlpha = 1;
        }
      }
    }
    x += bw + (r() < 0.3 ? r() * 12 : 0);
  }
  return c;
}
function buildLayers() {
  LAYERS.far = makeSkyline(11, { height: 300, minH: 70, maxH: 230, color: COL.far, win: '#6f5fa8', winChance: 0.12 });
  LAYERS.near = makeSkyline(29, { height: 380, minH: 120, maxH: 340, color: COL.near, win: '#ffb36b', winChance: 0.18 });
  // film grain tile
  const n = makeCanvas(256, 256), g = n.getContext('2d'), d = g.createImageData(256, 256), r = rng(5);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = r() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  LAYERS.grain = n;
}
function tiled(ctx, layer, offset, y, alpha = 1) {
  const w = layer.width;
  let x = -((offset % w) + w) % w - w;
  ctx.globalAlpha = alpha;
  for (; x < W + 400; x += w) ctx.drawImage(layer, x - 200, y);
  ctx.globalAlpha = 1;
}
function sky(ctx, { top = COL.skyTop, mid = COL.skyMid, horizon = COL.horizon, horizonY = 600, stars = true, t = 0 } = {}) {
  const g = ctx.createLinearGradient(0, -200, 0, horizonY);
  g.addColorStop(0, top); g.addColorStop(0.6, mid); g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(-400, -300, W + 800, H + 600);
  if (stars) {
    const r = rng(77);
    for (let i = 0; i < 90; i++) {
      const x = r() * (W + 400) - 200, y = r() * 380 - 150, s = r() * 1.6 + 0.4;
      ctx.globalAlpha = (0.3 + 0.7 * r()) * (0.6 + 0.4 * Math.sin(t * 3 + i));
      ctx.fillStyle = '#fff3e0';
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
function moon(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 4);
  g.addColorStop(0, 'rgba(255,235,210,0.35)');
  g.addColorStop(1, 'rgba(255,235,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  ctx.fillStyle = '#fff0dc';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,170,160,0.35)';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.3, r * 0.15, 0, Math.PI * 2); ctx.fill();
}
function rooftop(ctx, y = 615) {
  // water tower + vents (scenery silhouettes)
  ctx.fillStyle = '#0d0b1d';
  ctx.fillRect(70, y - 190, 120, 110);
  ctx.beginPath(); ctx.moveTo(60, y - 190); ctx.lineTo(130, y - 235); ctx.lineTo(200, y - 190); ctx.fill();
  ctx.fillRect(85, y - 80, 8, 80); ctx.fillRect(167, y - 80, 8, 80);
  ctx.fillRect(1080, y - 55, 110, 55);
  ctx.fillRect(1110, y - 85, 22, 30);
  // floor
  const g = ctx.createLinearGradient(0, y, 0, H + 200);
  g.addColorStop(0, '#1a1530'); g.addColorStop(1, COL.roof);
  ctx.fillStyle = g;
  ctx.fillRect(-400, y, W + 800, H + 300);
  ctx.fillStyle = 'rgba(255,138,85,0.55)';
  ctx.fillRect(-400, y, W + 800, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = -6; i < 16; i++) {
    ctx.beginPath();
    ctx.moveTo(640 + i * 60, y); ctx.lineTo(640 + i * 160, H + 200);
    ctx.lineTo(640 + i * 160 + 3, H + 200); ctx.lineTo(640 + i * 60 + 1, y); ctx.fill();
  }
}
function bokeh(ctx, t, { seed = 3, count = 26, colors = ['#ff8a55', '#ffd27a', '#8f7ae0'], drift = 8 } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const x = r() * W + Math.sin(t * 0.5 + i) * drift, y = r() * H * 0.8;
    const rad = 18 + r() * 60, col = colors[i % colors.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col); g.addColorStop(0.7, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.08 + r() * 0.12;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* ---------- 5. FX ---------- */
function camera(ctx, { x = W / 2, y = H / 2, zoom = 1, rot = 0, shake = 0 }, t) {
  const r = rng(boil(t, 30) + 1);
  const k = REDUCED ? 0.2 : 1;
  ctx.translate(W / 2 + (r() - 0.5) * 2 * shake * k, H / 2 + (r() - 0.5) * 2 * shake * k);
  ctx.rotate(rot);
  ctx.scale(zoom, zoom);
  ctx.translate(-x, -y);
}
// radial "focus lines" pointing at (cx, cy)
function focusLines(ctx, cx, cy, { count = 110, inner = 260, color = '#fff', alpha = 0.6, seed = 1 } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, r0 = inner * (0.8 + r() * 0.7), R = 1600, da = 0.003 + r() * 0.011;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a - da) * R, cy + Math.sin(a - da) * R);
    ctx.lineTo(cx + Math.cos(a + da) * R, cy + Math.sin(a + da) * R);
    ctx.fill();
  }
  ctx.restore();
}
// horizontal speed streaks travelling right
function streaks(ctx, t, { count = 45, speed = 2600, color = '#fff', alpha = 0.5, seed = 9 } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const y = r() * H, len = 120 + r() * 420, th = 1 + r() * 3.5, ph = r() * 3000, sp = speed * (0.6 + r() * 0.8);
    const x = ((ph + t * sp) % (W + len * 2)) - len;
    ctx.globalAlpha = alpha * (0.4 + r() * 0.6);
    ctx.fillRect(x, y, len, th);
  }
  ctx.restore();
}
function embers(ctx, t, { count = 40, seed = 4, color = '#ffb070', vx = -40, vy = -22, size = 2.4, fall = false } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const sx = vx * (0.5 + r()), sy = (fall ? 1 : 1) * vy * (0.5 + r());
    const x = (((r() * W + sx * t) % W) + W) % W;
    const y = (((r() * H + sy * t + Math.sin(t * 2 + i) * 8) % H) + H) % H;
    const s = size * (0.5 + r());
    ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * 5 + i * 1.7));
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}
function energyOrb(ctx, x, y, r, t, trail) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (trail) {
    const [tx, ty] = trail;
    const g = ctx.createLinearGradient(tx, ty, x, y);
    g.addColorStop(0, 'rgba(255,90,42,0)'); g.addColorStop(1, 'rgba(255,120,60,0.8)');
    ctx.strokeStyle = g; ctx.lineWidth = r * 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
  }
  const pulse = 1 + 0.12 * Math.sin(t * 30);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2 * pulse);
  g.addColorStop(0, '#fff6e8'); g.addColorStop(0.25, '#ff9a5a'); g.addColorStop(0.55, 'rgba(255,60,30,0.45)'); g.addColorStop(1, 'rgba(255,40,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 3.2 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function shockwave(ctx, cx, cy, tau, { maxR = 1100, width = 26, color = '255,240,220' } = {}) {
  if (tau < 0 || tau > 1) return;
  const rr = 30 + maxR * ease.outExpo(tau);
  ctx.save();
  ctx.strokeStyle = `rgba(${color},${(1 - tau) * 0.9})`;
  ctx.lineWidth = width * (1 - tau) + 1;
  ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function debris(ctx, cx, cy, tau, { count = 46, seed = 12 } = {}) {
  if (tau < 0) return;
  const r = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, sp = 500 + r() * 1300, sz = 4 + r() * 16, spin = (r() - 0.5) * 20, hot = r() < 0.5;
    const d = sp * (1 - Math.exp(-2.2 * tau)) / 2.2;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d + 140 * tau * tau;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(spin * tau + a);
    ctx.globalAlpha = clamp(1.4 - tau);
    ctx.fillStyle = hot ? '#ffb070' : '#1b1730';
    ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.4); ctx.lineTo(sz, 0); ctx.lineTo(-sz * 0.3, sz * 0.5); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
// jagged impact burst star
function burst(ctx, cx, cy, R, { points = 14, color = '#fff', seed = 2, rot = 0 } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    const rad = i % 2 ? R * (0.35 + r() * 0.15) : R * (0.8 + r() * 0.5);
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function sparkle(ctx, x, y, s, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s * 0.3, y);
  ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s * 0.3, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.moveTo(x - s * 0.7, y); ctx.quadraticCurveTo(x, y, x, y - s * 0.22);
  ctx.quadraticCurveTo(x, y, x + s * 0.7, y); ctx.quadraticCurveTo(x, y, x, y + s * 0.22);
  ctx.quadraticCurveTo(x, y, x - s * 0.7, y);
  ctx.fill();
  ctx.restore();
}
function glowLight(ctx, x, y, rad, color, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  ctx.restore();
}

/* ---------- 6. SHOTS ---------- */
/* Each shot: { name, start, end, draw(ctx, lt, p, t) }
   lt = seconds into the shot, p = 0..1 progress, t = global time */
const SHOTS = [
  {
    name: 'Wide — rooftop at dusk',
    start: 0, end: 3.0,
    draw(ctx, lt, p, t) {
      const z = lerp(1.0, 1.14, ease.inOut(p));
      ctx.save();
      camera(ctx, { x: lerp(640, 770, ease.inOut(p)), y: lerp(360, 330, ease.inOut(p)), zoom: z }, t);
      sky(ctx, { t });
      moon(ctx, 330, 150, 34);
      tiled(ctx, LAYERS.far, t * 6, 615 - 300);
      tiled(ctx, LAYERS.near, 300 + t * 12, 615 - 380 + 120);
      // incoming energy orb
      const op = seg(lt, 1.5, 3.0);
      if (op > 0) {
        const e = ease.in(op);
        const ox = lerp(-60, 470, e), oy = lerp(80, 330, e);
        energyOrb(ctx, ox, oy, lerp(5, 24, e), t, [ox - 160 * (0.4 + e), oy - 75 * (0.4 + e)]);
        glowLight(ctx, 800, 350, 420, 'rgba(255,90,40,0.6)', op * 0.5);
      }
      rooftop(ctx);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(800, 642, 130, 16, 0, 0, Math.PI * 2); ctx.fill();
      drawLitCharacter(ctx, 'front', {
        x: 800, y: 645, s: 0.5, sy: warp.breathe(t), warp: warp.bodySway(t, 3.5),
      }, { grade: 0.22 });
      ctx.restore();
      embers(ctx, t, { count: 30, seed: 4 });
      streaks(ctx, t, { count: 10, speed: -500, alpha: 0.12, seed: 31 });
    },
  },
  {
    name: 'Close-up — calm, then surprise',
    start: 3.0, end: 4.6,
    draw(ctx, lt, p, t) {
      const surprised = lt >= 1.0;
      const snap = surprised ? ease.out(seg(lt, 1.0, 1.1)) : 0;
      const shake = surprised ? 9 * (1 - seg(lt, 1.0, 1.4)) : 0;
      ctx.save();
      camera(ctx, { x: 640 - lt * 6, y: 360, zoom: 1 + lt * 0.025 + snap * 0.09, shake }, t);
      sky(ctx, { stars: false, horizonY: 900 });
      bokeh(ctx, t, { seed: 3 });
      if (surprised) focusLines(ctx, 640, 330, { count: 80, inner: 330, alpha: 0.35 * (1 - seg(lt, 1.1, 1.6)) + 0.12, seed: boil(t) });
      const name = surprised ? 'head_surprised' : 'head_calm';
      const lean = surprised ? -0.04 * snap : Math.sin(t * 1.3) * 0.01;
      drawLitCharacter(ctx, name, {
        x: 640, y: 790, s: 1.75, rot: lean, warp: warp.hairWind(t, 3),
        after: (c, ox, oy) => drawBlink(c, name, ox, oy, blinkAmount(lt, 0.35), 0.12),
      }, { grade: 0.12, rimAlpha: 0.5, rimOffset: 3 });
      ctx.restore();
      // red light of the incoming orb grows from the left
      const red = seg(lt, 0.4, 1.6);
      glowLight(ctx, -80, 260, 900, 'rgba(255,70,30,0.9)', red * 0.55);
      if (surprised) { // shock marks
        ctx.save();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.globalAlpha = 1 - seg(lt, 1.3, 1.6);
        const k = ease.out(seg(lt, 1.0, 1.15));
        for (let i = 0; i < 3; i++) {
          const a = -1.2 + i * 0.4, r0 = 330, r1 = 330 + 60 * k;
          ctx.beginPath();
          ctx.moveTo(900 + Math.cos(a) * r0 * 0.5, 230 + Math.sin(a) * r0 * 0.5);
          ctx.lineTo(900 + Math.cos(a) * r1 * 0.5, 230 + Math.sin(a) * r1 * 0.5);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
  },
  {
    name: 'Extreme close-up — resolve',
    start: 4.6, end: 5.8,
    draw(ctx, lt, p, t) {
      ctx.save();
      const g = ctx.createRadialGradient(640, 340, 50, 640, 340, 900);
      g.addColorStop(0, '#6a1424'); g.addColorStop(1, '#12040a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      focusLines(ctx, 640, 330, { count: 130, inner: 300, alpha: 0.55, color: '#ffd9c8', seed: boil(t) + 50 });
      camera(ctx, { zoom: 1 + ease.inOut(p) * 0.14, shake: 1.8 }, t);
      const [ax, ay] = ANCHOR.angry_eyes;
      const src = IMG.head_angry;
      drawLitCharacter(ctx, 'head_angry', {
        x: 640, y: 335, s: 2.9, ax: ax / src.width, ay: ay / src.height, warp: warp.hairWind(t, 2.5),
      }, { rim: '#ff3b22', rimAlpha: 0.85, rimOffset: 4, grade: 0.1 });
      ctx.restore();
      // eye glint
      const gl = seg(lt, 0.45, 0.7) * (1 - seg(lt, 0.8, 1.0));
      if (gl > 0) sparkle(ctx, 640 + 50 * 2.9 * (1 + p * 0.14), 322, 46 * gl, gl);
      // top / bottom shadow bands for intensity
      const sh = ctx.createLinearGradient(0, 0, 0, H);
      sh.addColorStop(0, 'rgba(10,0,6,0.75)'); sh.addColorStop(0.28, 'rgba(10,0,6,0)');
      sh.addColorStop(0.72, 'rgba(10,0,6,0)'); sh.addColorStop(1, 'rgba(10,0,6,0.8)');
      ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
    },
  },
  {
    name: 'Tracking — the dash',
    start: 5.8, end: 7.4,
    draw(ctx, lt, p, t) {
      sky(ctx, { stars: false, horizonY: 820 });
      tiled(ctx, LAYERS.far, -lt * 1400, 380, 0.9);
      tiled(ctx, LAYERS.near, -lt * 3600, 470, 1);
      ctx.fillStyle = 'rgba(16,14,34,0.35)'; ctx.fillRect(0, 0, W, H);
      streaks(ctx, t, { count: 55, speed: 3200, alpha: 0.45, seed: 9 });
      // enter from right, hold, accelerate out to the left
      const enter = ease.out(seg(lt, 0, 0.3));
      const exit = ease.in(seg(lt, 1.15, 1.6));
      const x = lerp(1250, 640, enter) - exit * 1250;
      const bob = -Math.abs(Math.sin(lt * 15)) * 14;
      const o = { x, y: 60 + bob, s: 1.3, ax: 0.5, ay: 0, rot: -0.17, warp: warp.hairWind(t * 2, 4, 0.12) };
      const ghost = tint('side', '#ff5a2a', 'fill');
      for (let k = 3; k >= 1; k--) {
        drawSprite(ctx, ghost, { ...o, warp: null, x: x + k * (60 + exit * 120), alpha: 0.28 / k });
      }
      drawLitCharacter(ctx, 'side', o, { grade: 0.18, rimAlpha: 0.7 });
      streaks(ctx, t, { count: 14, speed: 4200, alpha: 0.7, seed: 19 });
    },
  },
  {
    name: 'Leap and punch — impact',
    start: 7.4, end: 10.0,
    draw(ctx, lt, p, t) {
      const src = IMG.action;
      const [fx, fy] = ANCHOR.action_fist;
      const base = { ax: fx / src.width, ay: fy / src.height };
      const impactAt = 1.0, impactEnd = 1.25;
      if (lt < impactAt) {                       // --- the leap
        const k = ease.in(seg(lt, 0, impactAt));
        sky(ctx, { top: '#060514', mid: '#2a1238', horizon: '#9a3a34', horizonY: 900, stars: false });
        focusLines(ctx, 640, 330, { count: 120, inner: lerp(420, 160, k), alpha: 0.45, seed: boil(t) + 7 });
        ctx.save();
        camera(ctx, { zoom: 1 + k * 0.1, shake: k * 5 }, t);
        // the orb is right in front of the lens
        energyOrb(ctx, 640, 330, lerp(30, 60, k), t);
        drawLitCharacter(ctx, 'action', {
          ...base, x: lerp(560, 640, k), y: lerp(420, 330, k), s: lerp(0.28, 0.95, k), rot: lerp(-0.12, 0.04, k),
        }, { rim: '#ff6a3a', rimAlpha: 0.7, grade: 0.15 });
        ctx.restore();
        return;
      }
      if (lt < impactEnd) {                      // --- impact frames
        const frame = boil(lt - impactAt, 24);
        const o = { ...base, x: 640, y: 330, s: 1.0, rot: 0.04 };
        if (REDUCED) {
          ctx.fillStyle = '#3a0d14'; ctx.fillRect(0, 0, W, H);
          drawSprite(ctx, tint('action', '#ffcbb0', 'fill'), o);
          return;
        }
        const inverted = frame % 2 === 1;
        ctx.fillStyle = inverted ? '#0b0710' : '#fff8f0';
        ctx.fillRect(0, 0, W, H);
        focusLines(ctx, 640, 330, { count: 70, inner: 80, alpha: 1, color: inverted ? '#ff4a2a' : '#0b0710', seed: frame + 90 });
        burst(ctx, 640, 330, 190 + frame * 30, { color: inverted ? '#fff8f0' : '#0b0710', seed: frame + 3 });
        drawSprite(ctx, tint('action', inverted ? '#fff8f0' : '#0b0710', 'fill'), { ...o, s: 1.0 + frame * 0.03 });
        return;
      }
      // --- aftermath, slow motion
      const tau = (lt - impactEnd) / (2.6 - impactEnd);
      ctx.save();
      camera(ctx, { zoom: 1.02 - tau * 0.04, shake: 16 * Math.pow(1 - tau, 3) }, t);
      sky(ctx, { top: '#120617', mid: '#4a1424', horizon: '#ff8a4a', horizonY: 900, stars: false });
      glowLight(ctx, 640, 330, 900, 'rgba(255,200,150,1)', 0.9 * Math.pow(1 - tau, 1.5) + 0.15);
      focusLines(ctx, 640, 330, { count: 90, inner: 260, alpha: 0.3 * (1 - tau) + 0.08, seed: boil(t) + 20 });
      burst(ctx, 640, 330, 260 * (1 - ease.out(clamp(tau * 2.4))), { color: '#fff4e6', seed: 6, rot: tau });
      shockwave(ctx, 640, 330, tau * 1.6);
      shockwave(ctx, 640, 330, tau * 1.6 - 0.25, { width: 12, color: '255,120,70' });
      debris(ctx, 640, 330, tau * 1.4);
      const pulse = 0.55 + 0.35 * Math.sin(lt * 9);
      const glow = tint('action', '#ff4a22', 'fill');
      const o = { ...base, x: 640 - tau * 20, y: 330 + tau * 18, s: 1.0 - tau * 0.06, rot: 0.04 + tau * 0.02 };
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        drawSprite(ctx, glow, { ...o, x: o.x + Math.cos(a) * 7, y: o.y + Math.sin(a) * 7, alpha: 0.18 * pulse });
      }
      ctx.restore();
      drawLitCharacter(ctx, 'action', o, { rim: '#ffd0a0', rimAlpha: 0.9, grade: 0.05, rimOffset: 3 });
      ctx.restore();
      embers(ctx, t, { count: 50, seed: 8, vx: 0, vy: -80, size: 3 });
    },
  },
  {
    name: 'Wide — the city exhales',
    start: 10.0, end: 12.0,
    draw(ctx, lt, p, t) {
      ctx.save();
      camera(ctx, { x: 640, y: lerp(330, 360, p), zoom: lerp(1.2, 1.0, ease.out(p)) }, t);
      sky(ctx, { t, mid: '#2e1a42' });
      // smoke from the blast, lit from within
      const r = rng(41);
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2, d = 40 + r() * 120 + lt * 30;
        const x = 520 + Math.cos(a) * d * 1.4, y = 170 + Math.sin(a) * d * 0.6 - lt * 12;
        const rad = 60 + r() * 70 + lt * 20;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(255,140,90,${0.32 * (1 - p * 0.6)})`);
        g.addColorStop(0.5, `rgba(90,60,110,${0.35 * (1 - p * 0.4)})`);
        g.addColorStop(1, 'rgba(60,40,90,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      glowLight(ctx, 520, 170, 260, 'rgba(255,150,90,1)', 0.35 * (1 - p));
      tiled(ctx, LAYERS.far, 500 + t * 6, 615 - 300);
      tiled(ctx, LAYERS.near, 900 + t * 12, 615 - 380 + 120);
      rooftop(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(640, 647, 120, 15, 0, 0, Math.PI * 2); ctx.fill();
      drawLitCharacter(ctx, 'back', {
        x: 640, y: 650, s: 0.47, sy: warp.breathe(t), warp: warp.bodySway(t, 4),
      }, { grade: 0.28, rimAlpha: 0.75 });
      ctx.restore();
      embers(ctx, t, { count: 45, seed: 13, vx: 15, vy: 55, color: '#ffc48a' });
    },
  },
  {
    name: 'Close-up — the grin',
    start: 12.0, end: DURATION,
    draw(ctx, lt, p, t) {
      ctx.save();
      camera(ctx, { x: 640 + lt * 8, y: 360, zoom: 1.04 - lt * 0.015 }, t);
      sky(ctx, { top: '#1c1240', mid: '#5a2a4a', horizon: '#f08a5a', horizonY: 760, stars: false });
      bokeh(ctx, t, { seed: 17, colors: ['#ffd27a', '#ff9a6a', '#ffeedd'] });
      const tilt = Math.sin(lt * 1.6) * 0.018;
      drawLitCharacter(ctx, 'head_grin', {
        x: 640, y: 795, s: 1.75, rot: tilt, warp: warp.hairWind(t, 3.4),
        after: (c, ox, oy) => drawBlink(c, 'head_grin', ox, oy, blinkAmount(lt, 0.75), 0.04),
      }, { rim: '#ffc08a', rimAlpha: 0.65, grade: 0.04, rimOffset: 3 });
      ctx.restore();
      // twinkles
      const tw = [[880, 190, 0.3], [400, 240, 0.55], [960, 420, 0.9]];
      for (const [x, y, at] of tw) {
        const k = seg(lt, at, at + 0.25) * (1 - seg(lt, at + 0.35, at + 0.6));
        if (k > 0) sparkle(ctx, x, y, 26 * k, k);
      }
      // "to be continued" banner
      const b = ease.out(seg(lt, 1.3, 1.7));
      if (b > 0) {
        ctx.save();
        ctx.translate(lerp(-520, 0, b), 0);
        ctx.fillStyle = 'rgba(8,8,24,0.86)';
        ctx.beginPath();
        ctx.moveTo(40, 600); ctx.lineTo(520, 600); ctx.lineTo(560, 627); ctx.lineTo(520, 654); ctx.lineTo(40, 654); ctx.closePath(); ctx.fill();
        ctx.fillStyle = COL.glow; ctx.fillRect(40, 600, 6, 54);
        ctx.fillStyle = '#fff3e6';
        ctx.font = '700 30px "Chakra Petch", "Arial Narrow", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('TO BE CONTINUED', 64, 628);
        ctx.restore();
      }
      const fade = seg(lt, 2.15, 2.5);
      if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
    },
  },
];

// white flash on selected cuts (time, duration, strength)
const CUT_FLASHES = [[4.6, 0.1, 0.5], [5.8, 0.12, 0.85], [7.4, 0.1, 0.7], [10.0, 0.3, 0.9]];

function overlays(ctx, t) {
  for (const [at, dur, str] of CUT_FLASHES) {
    const k = seg(t, at, at + dur);
    if (t >= at && k < 1) {
      ctx.fillStyle = `rgba(255,248,240,${(1 - k) * str * (REDUCED ? 0.4 : 1)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  // fade in from black at loop start
  const fin = seg(t, 0, 0.35);
  if (fin < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fin})`; ctx.fillRect(0, 0, W, H); }
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // grain
  const r = rng(boil(t, 24) + 3);
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.globalCompositeOperation = 'overlay';
  const g = LAYERS.grain;
  const gx = -r() * 256, gy = -r() * 256;
  for (let x = gx; x < W; x += 256) for (let y = gy; y < H; y += 256) ctx.drawImage(g, x, y);
  ctx.restore();
  // letterbox
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, 34); ctx.fillRect(0, H - 34, W, 34);
}

function shotAt(t) {
  return SHOTS.find(s => t >= s.start && t < s.end) || SHOTS[SHOTS.length - 1];
}
function renderFrame(ctx, t) {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const s = shotAt(t);
  const lt = t - s.start;
  ctx.save();
  s.draw(ctx, lt, clamp(lt / (s.end - s.start)), t);
  ctx.restore();
  overlays(ctx, t);
}

/* ---------- 7. PLAYER ---------- */
function startPlayer() {
  const canvas = document.getElementById('stage');
  canvas.width = W * RES; canvas.height = H * RES;
  const ctx = canvas.getContext('2d');
  const btnPlay = document.getElementById('btn-play');
  const btnRestart = document.getElementById('btn-restart');
  const scrub = document.getElementById('scrub');
  const clock = document.getElementById('clock');
  const shotLabel = document.getElementById('shot');
  scrub.max = DURATION;

  let t = 0, playing = true, last = performance.now(), scrubbing = false;

  function setPlaying(v) {
    playing = v;
    btnPlay.textContent = v ? 'Pause' : 'Play';
    btnPlay.setAttribute('aria-pressed', String(!v));
  }
  btnPlay.addEventListener('click', () => setPlaying(!playing));
  btnRestart.addEventListener('click', () => { t = 0; setPlaying(true); });
  scrub.addEventListener('input', () => { t = parseFloat(scrub.value); scrubbing = true; });
  scrub.addEventListener('change', () => { scrubbing = false; });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.code !== 'Space') return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    if (e.key === 'r' || e.key === 'R') { t = 0; setPlaying(true); }
  });

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing && !scrubbing) t = (t + dt) % DURATION;
    renderFrame(ctx, t);
    if (!scrubbing) scrub.value = t.toFixed(2);
    clock.textContent = `${t.toFixed(1).padStart(4, '0')}s / ${DURATION.toFixed(1)}s`;
    shotLabel.textContent = shotAt(t).name;
    requestAnimationFrame(frame);
  }
  setPlaying(true);
  requestAnimationFrame(frame);
}

async function boot() {
  try {
    await loadSprites();
    try { await document.fonts.load('700 30px "Chakra Petch"'); } catch (_) { /* fallback font is fine */ }
    buildLayers();
    startPlayer();
  } catch (err) {
    document.getElementById('shot').textContent = err.message;
  }
}
boot();
