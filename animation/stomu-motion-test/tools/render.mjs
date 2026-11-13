// Offline renderer: drives index.html in headless Chromium, grabs each canvas frame
// as PNG and pipes it straight into ffmpeg. Usage: node tools/render.mjs [--frames 0,60,120] [--out file]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const stills = get('--frames');
const slate = !args.includes('--clean');
const out = get('--out') || path.join(ROOT, 'output', 'video_silent.mp4');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
await page.goto('file://' + path.join(ROOT, 'index.html') + '?render');
await page.waitForFunction(() => window.SCENE && window.renderAt);
const grab = async f => Buffer.from(await page.evaluate(([f, s]) => { window.renderAt(f, s); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, [f, slate]), 'base64');

if (stills) {
  const dir = path.join(ROOT, 'output', 'stills'); mkdirSync(dir, { recursive: true });
  for (const f of stills.split(',').map(Number)) writeFileSync(path.join(dir, `f${String(f).padStart(3, '0')}.png`), await grab(f));
  console.log('stills written to', dir);
} else {
  const N = await page.evaluate(() => window.SCENE.DUR * window.SCENE.FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < N; f++) {
    const buf = await grab(f);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 30 === 0) process.stdout.write(`frame ${f}/${N}\n`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  const ev = await page.evaluate(() => window.SCENE.footsteps());
  writeFileSync(path.join(ROOT, 'output', 'events.json'), JSON.stringify(ev, null, 1));
  console.log('video written to', out);
}
await browser.close();
