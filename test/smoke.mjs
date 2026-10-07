// Smoke test: blueprint the fixture pages, check the drawing, the measuring tools and the PNG sheet,
// then press Esc and check the page comes back exactly as it was.  Run: npm install && npm test
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is missing. Run "npm install" first (and "npx playwright install chromium" if needed).');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff2': 'font/woff2' };
// a heavy page for the speed check, made on the fly: 1,200 cards, about 12,000 elements
const stress = () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cards = [];
  for (let i = 1; i <= 1200; i++) {
    const chips = Array.from({ length: 2 + Math.floor(rnd() * 4) }, (_, j) => `<span class="chip">tag ${j}</span>`).join('');
    cards.push(`<article class="card"><b>Card ${i}</b><p>Lorem ipsum dolor sit amet, card number ${i} with a few words of text.</p><div class="row">${chips}</div><div class="row"><button>Open</button><a href="#">Share</a></div></article>`);
  }
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stress test</title><style>body{margin:0;font:15px/1.5 system-ui,sans-serif}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px}.card{border:1px solid #ccd;border-radius:8px;padding:12px;background:#f7f7fb}.card b{display:block}.row{display:flex;gap:6px;margin-top:8px}.chip{background:#e3e8ff;border-radius:99px;padding:2px 8px;font-size:12px}header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:14px 24px;font-weight:700}</style></head><body><header>Stress test: 1,200 cards</header><main class="grid">' + cards.join('') + '</main></body></html>';
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/test/stress.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(stress()); return; }
    const p = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!p.startsWith(root + '/')) throw new Error('outside');
    const headers = { 'content-type': types[extname(p)] || 'application/octet-stream' };
    // ?csp=1 serves the page with a strict policy: no inline scripts, no inline styles, no data: images
    if (url.searchParams.get('csp')) headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'";
    res.writeHead(200, headers);
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// test what ships: the minified build if it exists, else the source
const built = join(root, 'blueprint.min.js');
let engine = join(root, 'src/blueprint.js');
try { await readFile(built); engine = built; } catch {}
const engineUrl = '/' + engine.replace(root + '/', '');
console.log('engine:', engineUrl.slice(1));

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`); };
const step = (page, seconds) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__blueprint && window.__blueprint.step(1 / 60); }, Math.round(seconds * 60));
const state = (page) => page.evaluate(() => window.__blueprint && window.__blueprint.state());
// the copier light waits until the browser has taken its snapshot for the view transition
const ready = async (page) => {
  for (let i = 0; i < 150; i++) {
    if (!(await page.evaluate(() => !!(window.__blueprint && window.__blueprint.state().holding)))) return;
    await page.waitForTimeout(20);
  }
};
const start = async (page) => {
  await page.evaluate(() => { window.__BP_MANUAL = true; });
  await page.addScriptTag({ url: engineUrl });
  const st = await state(page);
  await ready(page);
  await step(page, 2.2);
  return st;
};
const close = async (page) => {
  await page.keyboard.press('Escape');
  await ready(page);
  for (let i = 0; i < 40 && (await page.evaluate(() => !!window.__blueprint)); i++) await step(page, 0.1);
  await page.waitForTimeout(600);
};
const snapshot = (page) => page.evaluate(() => {
  const shadow = [...document.querySelectorAll('*')].filter((e) => e.shadowRoot).map((e) => e.shadowRoot.innerHTML + '|' + e.shadowRoot.adoptedStyleSheets.length);
  // the <script> tag the test itself adds to load the engine is not part of the comparison
  const html = document.documentElement.outerHTML.replace(/<script src="\/(src\/blueprint|blueprint\.min)\.js"><\/script>/g, '');
  return { html, text: document.body.innerText, sheets: document.adoptedStyleSheets.length, shadow: shadow.join('\n') };
});
const overlayText = (page) => page.evaluate(() => { const h = document.querySelector('blueprint-overlay'); return h && h.shadowRoot ? h.shadowRoot.textContent : ''; });
const sheet = (page) => page.evaluate(async () => {
  const r = await window.__blueprint.save(false);
  const head = new Uint8Array(await r.blob.slice(0, 8).arrayBuffer());
  return { type: r.blob.type, size: r.blob.size, width: r.width, height: r.height, png: head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 };
});

const browser = await chromium.launch();
// pixel comparison runs in a blank page: decode both screenshots and count the channels that differ
const cmp = await browser.newPage();
const diff = (a, b) => cmp.evaluate(async ([a, b]) => {
  const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { max: 255, count: -1 };
  const c = document.createElement('canvas');
  c.width = ia.width; c.height = ia.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(ia, 0, 0);
  const da = g.getImageData(0, 0, c.width, c.height).data;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(ib, 0, 0);
  const db = g.getImageData(0, 0, c.width, c.height).data;
  let max = 0, count = 0, loud = 0;
  for (let i = 0; i < da.length; i++) { const d = Math.abs(da[i] - db[i]); if (d > max) max = d; if (d > 3) count++; if (d > 40) loud++; }
  return { max, count, loud };
}, [a.toString('base64'), b.toString('base64')]);
// The page itself comes back to the byte: markup, styles and text are compared exactly. Pixels are allowed
// a small drift, because Chromium can keep a composited layer after a blend mode was on screen (antialiasing
// moves by a level or two) and re-samples a background photo once it has been switched off and on.
const samePixels = (d) => d.loud === 0 && d.max <= 40;

try {
  // 1. Magazine page: scan in, outlines, measuring, keys, PNG sheet, scan out
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/demo/index.html?auto=0`, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    const before = await page.screenshot();
    const snapBefore = await snapshot(page);
    const st0 = await start(page);
    check('starts with the copier light (view transition)', st0.phase === 'in' && st0.transition === true);
    const st = await state(page);
    check('draws the page', st.phase === 'on' && st.items >= 40 && st.keys >= 3 && st.headings >= 8, `${st.items} outlines, ${st.keys} dimensioned blocks, ${st.headings} headings, ${st.elements} elements`);
    const look = await page.evaluate(() => ({
      paper: getComputedStyle(document.documentElement).backgroundColor,
      ink: getComputedStyle(document.querySelector('h1')).color,
      fill: getComputedStyle(document.querySelector('.ad-box')).backgroundImage,
      img: getComputedStyle(document.querySelector('.hero img')).mixBlendMode,
      sheets: document.adoptedStyleSheets.length,
    }));
    check('turns the page into cyanotype paper', look.paper === 'rgb(27, 75, 143)' && /^rgba?\(238, 245, 255/.test(look.ink) && look.fill === 'none' && look.img === 'screen', `${look.paper}, ink ${look.ink}`);
    check('styles go through one adopted stylesheet', look.sheets === snapBefore.sheets + 2);
    const ui = await overlayText(page);
    check('title block and credit', /BLUEPRINT/.test(ui) && /127\.0\.0\.1/.test(ui) && /How a honeybee swarm/.test(ui) && /drawn by @shmidtqq/.test(ui));

    await page.mouse.move(400, 200);
    await step(page, 0.1);
    check('hover measures the element under the cursor', (await state(page)).hover === 'h1');
    await page.mouse.click(330, 63);
    const afterPin = await page.evaluate(() => ({ hash: location.hash, pins: window.__blueprint.state().pins }));
    check('click pins a measurement instead of following the link', afterPin.pins === 1 && afterPin.hash === '', `pins ${afterPin.pins}`);
    await page.mouse.move(1000, 330);
    await step(page, 0.1);
    check('hover with a pin shows the gap', (await state(page)).hover === 'div' && errors.length === 0);
    await page.keyboard.press('g');
    const g1 = await page.evaluate(() => [window.__blueprint.state().grid, getComputedStyle(document.documentElement).backgroundImage]);
    await page.keyboard.press('g');
    await page.keyboard.press('d');
    const d1 = (await state(page)).dims;
    await page.keyboard.press('d');
    await page.keyboard.press('p');
    const st2 = await state(page);
    check('G, D and P switch the grid, the dimensions and the pins', g1[0] === false && g1[1] === 'none' && d1 === false && st2.grid && st2.dims && st2.pins === 0);

    const sh = await sheet(page);
    check('draws the whole page as a PNG sheet', sh.png && sh.type === 'image/png' && sh.width >= 1200 && sh.height > sh.width, `${sh.width}x${sh.height}, ${Math.round(sh.size / 1024)} KB`);
    await page.evaluate(() => window.scrollTo(0, 900));
    await step(page, 0.2);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('s')]);
    const kept = await page.evaluate(() => [window.scrollY, window.__blueprint.state().pins]);
    check('S downloads it, and the page stays where it was', download.suggestedFilename() === '127.0.0.1-blueprint.png' && kept[0] === 900 && kept[1] === 0, download.suggestedFilename());
    await page.evaluate(() => window.scrollTo(0, 0));
    await step(page, 0.2);

    await close(page);
    const snapAfter = await snapshot(page);
    const after = await page.screenshot();
    const d = await diff(before, after);
    check('Esc scans the original back in and switches off', !(await page.evaluate(() => !!window.__blueprint)) && !(await page.$('blueprint-overlay')));
    check('markup, styles and text are exactly as before', snapAfter.html === snapBefore.html && snapAfter.text === snapBefore.text && snapAfter.sheets === snapBefore.sheets);
    check('pixels are back', samePixels(d), `max channel difference ${d.max}, ${d.count} channels over 3`);
    check('no page errors', errors.length === 0, errors.join('; '));
    await page.close();
  }

  // 2. Strict Content-Security-Policy
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/demo/index.html?auto=0&csp=1`, { waitUntil: 'load' });
    await page.evaluate(() => { window.__violations = []; document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await page.waitForTimeout(150);
    const before = await page.screenshot();
    const snapBefore = await snapshot(page);
    await start(page);
    const st = await state(page);
    const sh = await sheet(page);
    await close(page);
    const v = await page.evaluate(() => window.__violations);
    const snapAfter = await snapshot(page);
    const d = await diff(before, await page.screenshot());
    check('works under a strict CSP', st.phase === 'on' && st.items >= 40 && sh.png && v.length === 0 && errors.length === 0, v.concat(errors).join('; '));
    check('and restores the page there too', snapAfter.html === snapBefore.html && samePixels(d));
    await page.close();
  }

  // 3. Dashboard: open shadow roots, a scroll box, form fields and the page's own button
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/test/fixtures/app.html`, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    const before = await page.screenshot();
    const snapBefore = await snapshot(page);
    await start(page);
    const inShadow = await page.evaluate(() => {
      const host = document.querySelector('stat-card');
      const card = host.shadowRoot.querySelector('.card');
      return { sheets: host.shadowRoot.adoptedStyleSheets.length, bg: getComputedStyle(card).backgroundColor, shadow: getComputedStyle(card).boxShadow };
    });
    check('reaches into open shadow roots', inShadow.sheets === 2 && inShadow.bg === 'rgba(0, 0, 0, 0)' && inShadow.shadow === 'none');
    const r = await page.evaluate(() => { const v = document.querySelector('stat-card').shadowRoot.querySelector('.value').getBoundingClientRect(); return [v.left + 20, v.top + v.height / 2]; });
    await page.mouse.move(r[0], r[1]);
    await step(page, 0.1);
    check('measures elements inside a shadow root', (await state(page)).hover === 'div');
    await page.focus('#email');
    await page.keyboard.type('sgd');
    const typed = await page.evaluate(() => [document.querySelector('#email').value, window.__blueprint.state().grid]);
    check('typing in a field is left alone', typed[0] === 'sgd' && typed[1] === true);
    await page.evaluate(() => { document.querySelector('#email').value = ''; document.activeElement.blur(); });
    await page.click('#help');
    const own = await page.evaluate(() => [document.querySelector('#clicks').textContent, window.__blueprint.state().pins]);
    check('the page\'s own button (data-blueprint-ignore) still works', own[0] === '1' && own[1] === 0);
    await page.evaluate(() => { document.querySelector('#clicks').textContent = '0'; document.activeElement.blur(); document.querySelector('#scroller').scrollTop = 120; });
    await page.waitForTimeout(260);
    await step(page, 0.2);
    const sh = await sheet(page);
    check('scroll boxes and the sheet', sh.png && errors.length === 0, `${sh.width}x${sh.height}`);
    await page.evaluate(() => { document.querySelector('#scroller').scrollTop = 0; });
    await page.mouse.move(0, 0);
    await close(page);
    const snapAfter = await snapshot(page);
    const after = await page.screenshot();
    const d = await diff(before, after);
    if (process.env.KEEP) { const fs = await import('node:fs'); fs.writeFileSync(process.env.KEEP + '/app-before.png', before); fs.writeFileSync(process.env.KEEP + '/app-after.png', after); }
    check('shadow roots and the page are restored', snapAfter.html === snapBefore.html && snapAfter.shadow === snapBefore.shadow && samePixels(d), `max channel difference ${d.max}, inside the background photo`);
    await page.close();
  }

  // 4. The bookmarklet: runs as-is, and a second click switches it off
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/demo/index.html?auto=0`, { waitUntil: 'load' });
    const bm = (await readFile(join(root, 'bookmarklet.txt'), 'utf8')).trim();
    const code = decodeURIComponent(bm.slice('javascript:'.length));
    await page.evaluate(() => { window.__BP_MANUAL = true; });
    await page.evaluate((c) => (0, eval)(c), code);
    await ready(page);
    await step(page, 2.2);
    const on = (await state(page)).phase;
    await page.evaluate((c) => (0, eval)(c), code);
    const out = (await state(page)).phase;
    await ready(page);
    await step(page, 2);
    const gone = await page.evaluate(() => !window.__blueprint);
    check('bookmarklet runs and toggles', bm.length < 64500 && on === 'on' && out === 'out' && gone && errors.length === 0, `${bm.length} chars`);
    await page.close();
  }

  // 5. Reduced motion: no light, no pen, the drawing is simply there
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await page.goto(`${base}/demo/index.html?auto=0`, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const before = await page.screenshot();
    await page.evaluate(() => { window.__BP_MANUAL = true; });
    await page.addScriptTag({ url: engineUrl });
    const st = await state(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const gone = await page.evaluate(() => !window.__blueprint);
    const d = await diff(before, await page.screenshot());
    check('respects reduced motion', st.phase === 'on' && st.transition === false && gone && samePixels(d));
    await page.close();
  }

  // 6. Phone
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/demo/index.html?auto=0`, { waitUntil: 'load' });
    await start(page);
    const tb = await page.evaluate(() => { const r = document.querySelector('blueprint-overlay').shadowRoot.querySelector('.tb').getBoundingClientRect(); return [r.left, r.right]; });
    check('fits a phone screen', tb[0] >= 0 && tb[1] <= 390 && (await state(page)).phase === 'on' && errors.length === 0, `title block ${Math.round(tb[0])}-${Math.round(tb[1])}`);
    await close(page);
    await page.close();
  }

  // 7. A heavy page: 12,000 elements
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${base}/test/stress.html`, { waitUntil: 'load' });
    await page.evaluate(() => { window.__BP_MANUAL = true; });
    const t0 = Date.now();
    await page.addScriptTag({ url: engineUrl });
    const ms = Date.now() - t0;
    await ready(page);
    const frame = await page.evaluate(() => { const t = performance.now(); for (let i = 0; i < 120; i++) window.__blueprint.step(1 / 60); return (performance.now() - t) / 120; });
    const st = await state(page);
    check('stays fast on a heavy page', ms < 2500 && frame < 8, `${st.elements} elements, start ${ms} ms, ${frame.toFixed(2)} ms a frame`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
