/* =====================================================================
   world.js — shared utilities, backgrounds and anime effects
   (carried over from version 1; used by every clip)
   ===================================================================== */
'use strict';
const W = 1280, H = 720;          // logical stage size
const RES = 1.5;                  // backing store 1920×1080
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
  let x = -(((offset % w) + w) % w) - 2 * w;
  ctx.globalAlpha = alpha;
  for (; x < W + 1600; x += w) ctx.drawImage(layer, x, y);
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

