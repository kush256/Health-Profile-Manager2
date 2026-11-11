#!/usr/bin/env node
/* Render a clip to MP4 (1920×1080, 30 fps by default), frame-exact.
 *
 *   npm install playwright        (once; or use any machine with Playwright + Chromium)
 *   node tools/render-mp4.cjs                       → rooftop-strike.mp4 (the 15 s sequence)
 *   node tools/render-mp4.cjs --clip run --out run.mp4
 *   node tools/render-mp4.cjs --fps 60 --out smooth.mp4
 *
 * Needs ffmpeg on the PATH. The page is served from a tiny local server only while
 * rendering, because browsers refuse to read pixels back from a file:// page.
 * Every frame is drawn by window.SCENE.renderAt(), so the result never depends on
 * the speed of the machine.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const clipId = args.clip || 'sequence';
const fps = +(args.fps || 30);
const out = path.resolve(args.out || 'rooftop-strike.mp4');
const root = path.resolve(__dirname, '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    console.error('Playwright is not installed. Run: npm install playwright && npx playwright install chromium');
    process.exit(1);
  }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
  await page.evaluate(() => { window.SCENE.pause(); window.requestAnimationFrame = () => 0; });

  const duration = await page.evaluate(id => window.SCENE.clips.find(c => c.id === id).duration, clipId);
  const frames = Math.round(duration * fps);
  console.log(`Rendering "${clipId}": ${frames} frames at ${fps} fps → ${out}`);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  ff.on('error', () => { console.error('ffmpeg was not found on the PATH.'); process.exit(1); });

  const BATCH = 8;
  for (let i = 0; i < frames; i += BATCH) {
    const shots = await page.evaluate(([id, i, n, fps]) => {
      const c = document.getElementById('stage'), res = [];
      for (let k = i; k < Math.min(i + 8, n); k++) { window.SCENE.renderAt(id, k / fps); res.push(c.toDataURL('image/png')); }
      return res;
    }, [clipId, i, frames, fps]);
    for (const d of shots) {
      if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, frames)}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  server.close();
  console.log(`\nDone${errors.length ? ' (page errors: ' + errors.join('; ') + ')' : ''}.`);
})();
