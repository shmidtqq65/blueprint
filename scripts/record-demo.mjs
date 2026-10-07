// Renders the README demo frame by frame (deterministic, so it is smooth on any machine),
// then encodes demo.mp4, assets/demo.webp and assets/demo.gif with ffmpeg.  Needs: npm install, ffmpeg on PATH.
// Usage: node scripts/record-demo.mjs [--fps 30] [--out demo]
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = +arg('fps', 30), OUT = arg('out', 'demo'), DPR = +arg('dpr', 1);
const W = 1280, H = 800;
const frames = join(root, '.demo-frames');
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root + '/')) throw new Error('outside');
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// serve the fictional magazine under a reserved example domain, so the title block shows a realistic address
const HOST = 'understory.example';
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, locale: 'en-US' });
await page.goto(`http://${HOST}:${port}/demo/index.html?auto=0`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
// a clean page for the recording: no cookie bar, no demo button
await page.addStyleTag({ content: '.cookie,.bp-run{display:none!important}' });
// a visible cursor, kept in a closed shadow root so the blueprint styles and outlines leave it alone
await page.evaluate(() => {
  window.__BP_MANUAL = true;
  const host = document.createElement('demo-cursor');
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)';
  const sr = host.attachShadow({ mode: 'closed' });
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '34'); svg.setAttribute('height', '34'); svg.setAttribute('viewBox', '0 0 34 34');
  svg.style.cssText = 'position:absolute;left:-3px;top:-2px;overflow:visible';
  const arrow = document.createElementNS(ns, 'path');
  arrow.setAttribute('d', 'M3 2 L3 24 L9 18.5 L13 27 L17 25.2 L13 17 L21 17 Z');
  arrow.setAttribute('fill', '#fff'); arrow.setAttribute('stroke', '#111'); arrow.setAttribute('stroke-width', '1.6'); arrow.setAttribute('stroke-linejoin', 'round');
  const cross = document.createElementNS(ns, 'path');
  cross.setAttribute('d', 'M3 -9 V-1 M3 5 V13 M-9 2 H-1 M7 2 H15');
  cross.setAttribute('stroke', '#fff'); cross.setAttribute('stroke-width', '1.6'); cross.setAttribute('stroke-linecap', 'square');
  cross.style.display = 'none';
  svg.append(arrow, cross);
  const ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;left:-15px;top:-15px;width:30px;height:30px;border-radius:50%;border:2px solid #ffd35c;opacity:0';
  sr.append(svg, ring);
  document.documentElement.appendChild(host);
  window.__demoCursor = (x, y, crosshair, r) => {
    host.style.transform = `translate(${x}px, ${y}px)`;
    arrow.style.display = crosshair ? 'none' : '';
    cross.style.display = crosshair ? '' : 'none';
    ring.style.opacity = String(r);
    ring.style.transform = `scale(${1.8 - r * 0.9})`;
  };
});

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// cursor keyframes [time, x, y]
const keys = [
  [0, 960, 640], [0.65, 700, 470], [2.9, 700, 470],
  [3.5, 470, 205], [4.2, 470, 205],            // the headline
  [4.7, 430, 306], [5.15, 430, 306],           // the standfirst, pinned
  [6.0, 1048, 300], [6.9, 1048, 300],          // the advert: the gap to the pin
  [7.5, 520, 640], [8.0, 520, 640],            // the photo
  [10.4, 560, 340], [11.0, 560, 340],
  [11.8, 980, 520],
];
const events = [
  { t: 0.7, what: 'start' },
  { t: 5.15, what: 'click' },
  { t: 8.1, what: 'key', key: 'p' },
  { t: 13.1, what: 'esc' },
];
// smooth scroll [from, to, y0, y1]
const scrolls = [[8.2, 10.2, 0, 1180], [11.4, 12.7, 1180, 0]];
const SECONDS = 15.4;

function cursorAt(t) {
  let a = keys[0], b = keys[keys.length - 1];
  if (t >= b[0]) return { x: b[1], y: b[2] };
  for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i][0] && t <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
  const u = b[0] === a[0] ? 1 : ease((t - a[0]) / (b[0] - a[0]));
  return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u };
}
const ready = async () => {
  for (let i = 0; i < 200; i++) {
    if (!(await page.evaluate(() => !!(window.__blueprint && window.__blueprint.state().holding)))) return;
    await page.waitForTimeout(15);
  }
};

const engine = await readFile(join(root, 'src/blueprint.js'), 'utf8');
let ring = 0;
const total = Math.round(SECONDS * FPS);
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  const c = cursorAt(t);
  await page.mouse.move(c.x, c.y);
  for (const e of events) {
    if (e.done || t < e.t) continue;
    e.done = true;
    if (e.what === 'start') { await page.evaluate((code) => (0, eval)(code), engine); await ready(); }
    else if (e.what === 'esc') { await page.keyboard.press('Escape'); await ready(); }
    else if (e.what === 'key') await page.keyboard.press(e.key);
    else if (e.what === 'click') { ring = 1; await page.mouse.click(c.x, c.y); }
  }
  for (const [a, b, y0, y1] of scrolls) {
    if (t < a || t > b + 1 / FPS) continue;
    const u = ease(Math.min(1, (t - a) / (b - a)));
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(y0 + (y1 - y0) * u));
  }
  ring = Math.max(0, ring - 1 / (FPS * 0.4));
  await page.evaluate(({ x, y, ring, dt }) => {
    const B = window.__blueprint;
    if (B && B.alive) B.step(dt);
    window.__demoCursor(x, y, !!(B && B.alive), ring);
  }, { x: c.x, y: c.y, ring, dt: 1 / FPS });
  // JPEG frames at top quality: several times faster to capture than PNG, and the video is lossy anyway
  await page.screenshot({ path: join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95 });
  if (f % 30 === 0) process.stdout.write(`frame ${f}/${total}\r`);
}
await browser.close();
server.close();
console.log('\nencoding...');
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
ff(['-framerate', String(FPS), '-i', join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', join(root, OUT + '.mp4')]);
ff(['-framerate', String(FPS), '-i', join(frames, 'f%04d.jpg'), '-vf', 'fps=20,scale=960:-1:flags=lanczos', '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '72', '-compression_level', '5', '-loop', '0', join(root, 'assets', OUT + '.webp')]);
ff(['-framerate', String(FPS), '-i', join(frames, 'f%04d.jpg'), '-vf', 'fps=10,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', join(root, 'assets', OUT + '.gif')]);
console.log(`done: ${OUT}.mp4, assets/${OUT}.webp, assets/${OUT}.gif`);
