/* =====================================================================
   player.js — render loop, controls, clip picker, export hook
   ===================================================================== */
'use strict';

function overlays(ctx, t, clip) {
  // fade in at the start of every loop, fade out where the clip asks for it
  const fin = seg(t, 0, 0.3);
  if (fin < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fin})`; ctx.fillRect(0, 0, W, H); }
  if (clip.fadeOut) {
    const k = seg(t, clip.fadeOut[0], clip.fadeOut[1]);
    if (k > 0) { ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fillRect(0, 0, W, H); }
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const r = rng(boil(t, 24) + 3);
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.globalCompositeOperation = 'overlay';
  const g = LAYERS.grain, gx = -r() * 256, gy = -r() * 256;
  for (let x = gx; x < W; x += 256) for (let y = gy; y < H; y += 256) ctx.drawImage(g, x, y);
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, 30); ctx.fillRect(0, H - 30, W, 30);
}

/* draw one frame of a clip at time t (seconds) — deterministic, so it can be exported */
function renderClip(ctx, clip, t) {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const tc = onFrame(t);                       // character animation lands on 24 fps frames
  const pose = clip.poseAt(tc);
  const cm = clip.camAt(t);
  clip.drawBack(ctx, t, cm, clip);
  if (clip.custom) {
    clip.custom(ctx, tc);
  } else {
    ctx.save();
    camera(ctx, cm, t);
    const sec = secondary(clip.poseAt, tc);
    drawCharacter(ctx, pose, sec, clip.light || {}, clip.ghosts ? clip.ghosts(tc) : []);
    ctx.restore();
  }
  if (clip.drawFront) clip.drawFront(ctx, t, cm, pose);
  overlays(ctx, t, clip);
}
function chapterAt(clip, t) {
  if (!clip.chapters) return '';
  let name = '';
  for (const [at, n] of clip.chapters) if (t >= at) name = n;
  return name;
}

function startPlayer() {
  const canvas = document.getElementById('stage');
  canvas.width = W * RES; canvas.height = H * RES;
  const ctx = canvas.getContext('2d');
  const btnPlay = document.getElementById('btn-play');
  const btnRestart = document.getElementById('btn-restart');
  const scrub = document.getElementById('scrub');
  const clock = document.getElementById('clock');
  const label = document.getElementById('shot');
  const picker = document.getElementById('clip');

  for (const c of CLIPS) {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = `${c.label} (${c.duration.toFixed(1)}s)`;
    picker.appendChild(o);
  }
  let clip = CLIPS[0], t = 0, playing = true, last = performance.now(), scrubbing = false;
  function setClip(id) {
    clip = CLIPS.find(c => c.id === id) || CLIPS[0];
    picker.value = clip.id;
    scrub.max = clip.duration;
    t = 0;
  }
  function setPlaying(v) {
    playing = v;
    btnPlay.textContent = v ? 'Pause' : 'Play';
    btnPlay.setAttribute('aria-pressed', String(!v));
  }
  const fromHash = () => setClip(location.hash.slice(1) || 'sequence');
  picker.addEventListener('change', () => { setClip(picker.value); try { history.replaceState(null, '', '#' + clip.id); } catch (_) { /* file:// */ } });
  window.addEventListener('hashchange', fromHash);
  btnPlay.addEventListener('click', () => setPlaying(!playing));
  btnRestart.addEventListener('click', () => { t = 0; setPlaying(true); });
  scrub.addEventListener('input', () => { t = parseFloat(scrub.value); scrubbing = true; });
  scrub.addEventListener('change', () => { scrubbing = false; });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    if (e.target.tagName === 'INPUT' && e.code !== 'Space') return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    if (e.key === 'r' || e.key === 'R') { t = 0; setPlaying(true); }
    if (e.key === ',' ) { setPlaying(false); t = Math.max(0, onFrame(t) - 1 / 24); }   // step one animation frame
    if (e.key === '.') { setPlaying(false); t = Math.min(clip.duration - 0.001, onFrame(t) + 1 / 24 + 1e-4); }
  });

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing && !scrubbing) t = (t + dt) % clip.duration;
    renderClip(ctx, clip, t);
    if (!scrubbing) scrub.value = t.toFixed(3);
    clock.textContent = `${t.toFixed(2).padStart(5, '0')}s / ${clip.duration.toFixed(1)}s · frame ${Math.floor(t * 24) + 1}`;
    label.textContent = chapterAt(clip, t) || clip.label;
    requestAnimationFrame(frame);
  }
  fromHash();
  setPlaying(true);
  requestAnimationFrame(frame);

  // export hook used by tools/render-mp4.js: draws an exact frame without the live loop
  window.SCENE = {
    clips: CLIPS.map(c => ({ id: c.id, duration: c.duration })),
    pause: () => setPlaying(false),
    renderAt: (id, time) => { const c = CLIPS.find(x => x.id === id); renderClip(ctx, c, time); },
  };
}

async function boot() {
  try {
    await loadAllImages();
    try { await document.fonts.load('700 30px "Chakra Petch"'); } catch (_) { /* fallback font is fine */ }
    buildLayers();
    startPlayer();
    document.documentElement.dataset.ready = '1';
  } catch (err) {
    document.getElementById('shot').textContent = 'Could not start: ' + err.message;
    console.error(err);
  }
}
boot();
