/* BLUEPRINT: turn any website into a blueprint. One file, no dependencies, nothing leaves your browser.
   https://github.com/shmidtqq65/blueprint  (MIT)

   How it works, in short:
   - Before anything changes, every element is measured and classified with its original styles:
     boxes with a fill, a border or a shadow, form fields, media, rules and big type.
   - One constructed stylesheet turns the page into cyanotype paper: transparent fills, white ink,
     a drawing grid on the root, media printed like a cyanotype. Nothing in the DOM is rewritten.
   - A canvas overlay draws the outlines with a plotter pen as a copier light scans down the sheet,
     then the dimension lines, the type callouts, the rulers and a title block.
   - Hover measures any element, click pins the measurement, S saves the whole page as a PNG sheet.
   - Esc scans the original back in. The stylesheet comes off and the page is exactly as it was. */
(() => {
  'use strict';
  const W = window, D = document, DE = D.documentElement;
  const prior = W.__blueprint;
  if (prior && prior.alive) { prior.toggle(); return; }
  if (!DE || !D.body || !(D.body instanceof HTMLElement)) return;

  const VERSION = '1.0.0';
  const OPT = Object.assign({ motion: true, credit: true, ui: true, grid: true, dims: true }, W.__BP_OPTIONS || {});
  const MANUAL = !!W.__BP_MANUAL;
  const mq = (q) => !!(W.matchMedia && W.matchMedia(q).matches);
  const MOTION = OPT.motion !== false && !mq('(prefers-reduced-motion: reduce)');
  const now = () => performance.now();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const round = Math.round;

  // ---------------------------------------------------------------- palette and type
  const PAPER = '#1b4b8f';
  const INK = (a) => 'rgba(238,245,255,' + a + ')';
  const CHALK = '#ffd35c', CHALK_A = (a) => 'rgba(255,211,92,' + a + ')';
  const MONO = 'ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace';
  const SCAN = 1.15;                       // seconds the copier light takes to cross the screen
  const MAX_ITEMS = 12000;
  const X = '\u00d7', DOT = '\u00b7';

  // ---------------------------------------------------------------- helpers
  const alphaOf = (c) => {
    if (!c || c === 'transparent') return 0;
    const m = c.match(/\/\s*([\d.]+)(%?)\s*\)$/) || c.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)(%?)\s*\)$/);
    if (!m) return 1;
    return m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  };
  const px = (v) => parseFloat(v) || 0;
  const host = (location.hostname || 'this page').replace(/^www\./, '');
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '\u2026' : s);
  const titleOf = () => (D.title || (D.querySelector('h1') || {}).textContent || host).replace(/\s+/g, ' ').trim();
  const fmtDate = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); };
  const famOf = (f) => (f.split(',')[0] || '').replace(/["']/g, '').trim();

  // ---------------------------------------------------------------- the blueprint stylesheet
  const sheetCss = (grid) => `
html{background-color:${PAPER}!important;${grid ? `background-image:linear-gradient(${INK(0.13)} 1px,transparent 1px),linear-gradient(90deg,${INK(0.13)} 1px,transparent 1px),linear-gradient(${INK(0.05)} 1px,transparent 1px),linear-gradient(90deg,${INK(0.05)} 1px,transparent 1px)!important;background-size:100px 100px,100px 100px,20px 20px,20px 20px!important;background-position:-1px -1px!important;` : 'background-image:none!important;'}color-scheme:dark!important}
body{background-color:transparent!important;background-image:none!important}
*,*::before,*::after{background-color:transparent!important;background-image:none!important;border-color:${INK(0.5)}!important;color:${INK(0.93)}!important;-webkit-text-fill-color:currentcolor!important;text-shadow:none!important;box-shadow:none!important;outline-color:${INK(0.5)}!important;text-decoration-color:${INK(0.55)}!important;caret-color:${CHALK}!important;filter:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;mix-blend-mode:normal!important;cursor:crosshair!important}
::selection{background-color:${CHALK_A(0.35)}!important;color:#fff!important}
::placeholder{color:${INK(0.45)}!important}
:is(p,li,dd,td,blockquote,figcaption) a{text-decoration-line:underline!important;text-decoration-style:dotted!important}
img,picture,video,canvas,iframe,embed,object,image{filter:grayscale(1) contrast(1.15) brightness(.82)!important;mix-blend-mode:screen!important}
svg{color:${INK(0.9)}!important}
svg :is(path,circle,rect,ellipse,line,polyline,polygon){fill:none!important;stroke:${INK(0.85)}!important;stroke-width:1px!important;vector-effect:non-scaling-stroke!important}
svg text{fill:${INK(0.9)}!important;stroke:none!important}
`;
  // the copier light: the new state is revealed from the top down (view transitions, where supported)
  const VT_CSS = `::view-transition-group(root),::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}
::view-transition-new(root){animation:bp-scan ${SCAN}s cubic-bezier(.65,0,.35,1) both}
@keyframes bp-scan{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}`;
  const newSheet = (css) => { const s = new CSSStyleSheet(); s.replaceSync(css); return s; };
  const canAdopt = 'adoptedStyleSheets' in D && typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype;
  if (!canAdopt) { console.warn('BLUEPRINT needs constructable stylesheets (Chrome 73+, Firefox 101+, Safari 16.4+).'); return; }
  let grid = OPT.grid !== false, dims = OPT.dims !== false;
  const BP = newSheet(sheetCss(grid));
  const LIVE = newSheet('');               // paper behind sticky headers and fixed bars that had a fill
  let applied = false;
  const VT = newSheet(VT_CSS);
  const roots = new Set();                 // open shadow roots we styled, with their original sheet lists
  const adopted = new Map();
  const adopt = (root, sheet) => {
    if (!adopted.has(root)) adopted.set(root, root.adoptedStyleSheets.slice());
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  };
  const unadopt = (root, sheet) => {
    try { root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== sheet); } catch (e) {}
  };

  // ---------------------------------------------------------------- measuring the page
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'br', 'wbr', 'source', 'track', 'param', 'area', 'map', 'datalist', 'option', 'optgroup', 'blueprint-overlay']);
  const MEDIA = new Set(['img', 'video', 'canvas', 'iframe', 'embed', 'object', 'svg']);
  const FIELD = new Set(['input', 'textarea', 'select', 'button', 'progress', 'meter']);
  const SEM = new Set(['header', 'nav', 'main', 'aside', 'footer', 'article', 'section', 'form', 'figure', 'table', 'dialog']);
  const memo = new WeakMap();               // element -> classification made with the original styles
  let items = [], keys = [], guides = [], typeNotes = [], docW = 0, docH = 0, count = 0;
  let firstPass = true, liveEls = new WeakMap();   // element -> 'fixed' or 'sticky' (also for their insides)

  function classify(el, cs, r, parentBg) {
    const tag = el.localName;
    if (MEDIA.has(tag)) {
      if (tag === 'svg' && (r.width < 32 || r.height < 32)) return null;   // icons stay line drawings
      return { kind: 'media', label: tag === 'img' ? 'IMG' : tag === 'svg' ? 'SVG' : tag.toUpperCase() };
    }
    if (tag === 'hr') return { kind: 'rule' };
    const bw = [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)];
    const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
    const bs = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    let sides = 0;
    for (let i = 0; i < 4; i++) if (bw[i] >= 0.5 && bs[i] !== 'none' && bs[i] !== 'hidden' && alphaOf(bc[i]) > 0.08) sides |= 1 << i;
    const bg = cs.backgroundColor, bgA = alphaOf(bg);
    const bi = firstPass ? cs.backgroundImage || 'none' : 'none';
    const url = bi !== 'none' && /url\(/.test(bi);
    const fill = firstPass && ((bgA > 0.06 && bg !== parentBg) || (bi !== 'none' && !url));
    const shadow = firstPass && cs.boxShadow && cs.boxShadow !== 'none';
    const field = FIELD.has(tag) || el.getAttribute('role') === 'button';
    const sem = SEM.has(tag) && r.width >= 120 && r.height >= 40 ? tag.toUpperCase() : '';
    if (url && r.width >= 32 && r.height >= 32) return { kind: 'media', label: 'BG' };
    if (field && r.width >= 6 && r.height >= 6) return { kind: 'field', sides: 15, solid: fill };
    if ((fill || shadow) && r.width >= 10 && r.height >= 10) return { kind: 'box', sides: 15, label: sem, solid: fill };
    if (sides && r.width >= 4 && r.height >= 4) return { kind: 'box', sides, label: sem };
    if (!firstPass && px(cs.borderTopLeftRadius) > 2 && px(cs.paddingTop) > 2 && r.width >= 40 && r.height >= 24 && /block|flex|grid/.test(cs.display)) return { kind: 'box', sides: 15 };
    if (sem) return { kind: 'frame', sides: 15, label: sem };
    return null;
  }

  // a CSS path to an element (no attributes are added to the page); null inside shadow roots
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e !== DE; e = e.parentNode) {
      if (!e || e.nodeType !== 1) return null;
      let i = 1;
      for (let q = e.previousElementSibling; q; q = q.previousElementSibling) i++;
      parts.unshift(CSS.escape(e.localName) + ':nth-child(' + i + ')');
    }
    return ':root>' + parts.join('>');
  };
  let collectMs = 0, clipOf = new WeakMap();
  const meets = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const meet = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y), live: a.live };
  };
  function collect() {
    const t0 = now();
    const sx = W.scrollX, sy = W.scrollY, vw = DE.clientWidth || W.innerWidth;
    const out = [], heads = [];
    const prevBorn = new Map();
    for (const it of items) prevBorn.set(it.el, it.born);
    let n = 0;
    liveEls = new WeakMap();
    clipOf = new WeakMap();
    const visit = (parent, live, fixed, parentBg, depth, clip) => {
      for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
        const tag = el.localName;
        if (SKIP.has(tag) || el === hostEl) continue;
        let cs;
        try { cs = getComputedStyle(el); } catch (e) { continue; }
        if (cs.display === 'none') continue;
        n++;
        if (cs.display === 'contents') { visit(el, live, fixed, parentBg, depth + 1, clip); continue; }
        const pos = cs.position;
        const isLive = live || pos === 'fixed' || pos === 'sticky';
        const isFixed = fixed || pos === 'fixed';
        if (isLive) liveEls.set(el, isFixed ? 'fixed' : 'sticky');
        const r = el.getBoundingClientRect();
        const hidden = cs.visibility !== 'visible' || +cs.opacity < 0.05;
        const box = { x: r.left + (isLive ? 0 : sx), y: r.top + (isLive ? 0 : sy), w: r.width, h: r.height, live: isLive };
        if (clip) clipOf.set(el, clip);
        const cut = clip && clip.live === isLive && !meets(box, clip);   // scrolled out of its box
        let c = memo.get(el);
        if (c === undefined && !hidden && r.width > 0 && r.height > 0) {
          c = classify(el, cs, r, parentBg);
          memo.set(el, c);
        }
        if (c && !hidden && !cut && r.width > 0 && r.height > 0 && out.length < MAX_ITEMS) {
          const rad = [px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomRightRadius), px(cs.borderBottomLeftRadius)];
          out.push({
            el, kind: c.kind, label: c.label || '', sides: c.sides || 15, solid: !!c.solid, rad: rad.map((v) => Math.min(v, r.width / 2, r.height / 2)),
            x: box.x, y: box.y, w: r.width, h: r.height, live: isLive, fixed: isFixed, clip: clip && clip.live === isLive ? clip : null,
            depth, lx: 0, born: prevBorn.has(el) ? prevBorn.get(el) : -1,
          });
        }
        if (!hidden && !cut && /^h[1-3]$/.test(tag) && r.width > 0 && r.height > 0 && heads.length < 40) {
          heads.push({ el, tag: tag.toUpperCase(), x: r.left + (isLive ? 0 : sx), y: r.top + (isLive ? 0 : sy), w: r.width, h: r.height, live: isLive, fixed: isFixed, note: famOf(cs.fontFamily) + ' ' + cs.fontWeight + ' ' + round(px(cs.fontSize)) + '/' + (cs.lineHeight === 'normal' ? 'n' : round(px(cs.lineHeight))), born: -1 });
        }
        if (MEDIA.has(tag)) continue;
        const bg = alphaOf(cs.backgroundColor) > 0.06 ? cs.backgroundColor : parentBg;
        let inner = clip;
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') inner = clip && clip.live === isLive ? meet(clip, box) : box;
        visit(el, isLive, isFixed, bg, depth + 1, inner);
        if (el.shadowRoot && el.shadowRoot.mode === 'open') {
          if (!roots.has(el.shadowRoot)) {
            roots.add(el.shadowRoot);
            if (applied) { try { adopt(el.shadowRoot, BP); } catch (e) {} }
          }
          visit(el.shadowRoot, isLive, isFixed, bg, depth + 1, inner);
        }
      }
    };
    visit(D.body, false, false, getComputedStyle(D.body).backgroundColor, 0, null);
    firstPass = false;
    count = n;
    items = tidy(out);
    typeNotes = heads;
    docW = Math.max(DE.scrollWidth, D.body.scrollWidth, vw);
    docH = Math.max(DE.scrollHeight, D.body.scrollHeight, W.innerHeight);
    pickKeys(vw);
    const paper = [];
    for (const it of liveItems) {
      if (!it.solid) continue;
      const sel = pathOf(it.el);
      if (sel) paper.push(sel + '{background-color:rgba(27,75,143,.94)!important}');
    }
    try { LIVE.replaceSync(paper.join('\n')); } catch (e) {}
    collectMs = now() - t0;
  }

  // a frame that repeats an outline adds nothing; labels that share a corner are spread out
  function tidy(list) {
    const same = (a, b) => Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3 && Math.abs(a.w - b.w) < 3 && Math.abs(a.h - b.h) < 3;
    const solid = list.filter((it) => it.kind !== 'frame');
    const kept = [];
    const out = list.filter((it) => {
      if (it.kind !== 'frame') return true;
      if (solid.some((o) => same(o, it)) || kept.some((o) => same(o, it))) return false;
      kept.push(it);
      return true;
    });
    const placed = [];
    for (const it of out) {
      if (!it.label || it.kind === 'media' || it.fixed) continue;
      const len = it.label.length * 6 + 14;
      let y0 = it.y + 8;
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find((q) => Math.abs(q.x - it.x) < 8 && y0 < q.y1 && y0 + len > q.y0);
        if (!hit) break;
        y0 = hit.y1;
      }
      if (y0 + len > it.y + it.h) { it.label = ''; continue; }
      it.lx = y0 - it.y;
      placed.push({ x: it.x, y0, y1: y0 + len });
    }
    return out;
  }

  // a dimension line never goes under a sticky header or a fixed bar
  let liveItems = [];
  const underLive = (x, y, self) => liveItems.some((o) => o !== self && x >= o.x && x <= o.x + o.w && y >= o.y - 4 && y <= o.y + o.h + 4);

  // dimension lines go on a few big, distinct blocks: the frame of the page, not every div
  function pickKeys(vw) {
    const cand = items.filter((it) => it.kind !== 'rule' && !it.live && it.w >= Math.min(260, vw * 0.22) && it.w <= vw * 0.92 && it.h >= 56)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    const chosen = [];
    for (const it of cand) {
      if (chosen.length >= 9) break;
      if (it.w > vw * 0.985 && it.h > W.innerHeight * 1.5) continue;     // the page itself
      // a block repeats another when it shares its top edge and width, or covers about the same area
      let dup = false;
      for (const c of chosen) {
        if (Math.abs(it.x - c.x) < 4 && Math.abs(it.y - c.y) < 4 && Math.abs(it.w - c.w) < 4) { dup = true; break; }
        const ix = Math.max(0, Math.min(it.x + it.w, c.x + c.w) - Math.max(it.x, c.x));
        const iy = Math.max(0, Math.min(it.y + it.h, c.y + c.h) - Math.max(it.y, c.y));
        const a = it.w * it.h, b = c.w * c.h;
        if (ix * iy > 0.55 * Math.min(a, b) && Math.min(a, b) > 0.5 * Math.max(a, b)) { dup = true; break; }
      }
      if (!dup) chosen.push(it);
    }
    keys = chosen;
    liveItems = items.filter((it) => it.live && it.kind !== 'frame');
    const gs = [];
    for (const it of chosen.slice(0, 4)) {
      if (it.live) continue;
      for (const x of [it.x, it.x + it.w]) if (!gs.some((q) => Math.abs(q - x) < 6)) gs.push(x);
    }
    guides = gs;
  }

  // ---------------------------------------------------------------- overlay: canvas + title block
  let hostEl, shadow, cv, cx, block, toastEl;
  let vw = 0, vh = 0, dpr = 1, paper = null;
  const css = `
:host{all:initial}
.w{position:fixed;inset:0;pointer-events:none;z-index:2147483646;font:11px/1.35 ${MONO};color:${INK(0.92)};-webkit-font-smoothing:antialiased;text-align:left;direction:ltr}
canvas{position:absolute;inset:0;width:100%;height:100%}
.tb{position:absolute;right:16px;bottom:16px;width:360px;max-width:calc(100vw - 32px);pointer-events:auto;cursor:default;background:rgba(20,62,122,.82);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);border:1.5px solid ${INK(0.85)};box-shadow:0 0 0 4px rgba(20,62,122,.55),0 0 0 5px ${INK(0.35)};opacity:0;transform:translateY(8px);transition:opacity .45s ease,transform .45s ease}
.tb.on{opacity:1;transform:none}
.row{display:grid;grid-template-columns:96px 1fr;border-top:1px solid ${INK(0.55)}}
.row:first-child{border-top:0}
.k,.v{padding:5px 8px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.k{border-right:1px solid ${INK(0.55)};color:${INK(0.6)};font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;padding-top:6.5px}
.v{font-size:11.5px}
.hd{display:flex;align-items:baseline;justify-content:space-between;padding:7px 8px 6px}
.hd b{font:700 15px/1 ${MONO};letter-spacing:.14em}
.hd span{color:${INK(0.6)};font-size:9.5px;letter-spacing:.06em}
.bar{display:flex;border-top:1px solid ${INK(0.55)}}
.bar button{all:unset;flex:1;text-align:center;padding:7px 0;font:600 10px/1 ${MONO};letter-spacing:.08em;color:${INK(0.9)};cursor:pointer;border-left:1px solid ${INK(0.55)}}
.bar button:first-child{border-left:0}
.bar button:hover{background:${INK(0.1)}}
.bar button:focus-visible{outline:2px solid ${CHALK};outline-offset:-2px}
.bar button[aria-pressed=false]{color:${INK(0.45)}}
.ft{border-top:1px solid ${INK(0.55)};padding:5px 8px;display:flex;justify-content:space-between;color:${INK(0.6)};font-size:9.5px}
.ft a{color:${CHALK};text-decoration:none;pointer-events:auto}
.toast{position:absolute;left:50%;top:22px;transform:translateX(-50%);background:rgba(20,62,122,.92);border:1px solid ${INK(0.7)};padding:6px 12px;font-size:11px;opacity:0;transition:opacity .3s}
.toast.on{opacity:1}
@media (max-width:640px){.tb{left:8px;right:8px;bottom:8px;width:auto}.row{grid-template-columns:78px 1fr}.hide-s{display:none}}
`;
  function buildOverlay() {
    hostEl = D.createElement('blueprint-overlay');
    hostEl.setAttribute('data-blueprint', '');
    hostEl.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;display:none!important;background:none!important;border:0!important;margin:0!important;padding:0!important';
    shadow = hostEl.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [newSheet(css)];
    const w = D.createElement('div');
    w.className = 'w';
    // the paper texture is painted once per size on its own layer; the drawing canvas sits on top
    paper = D.createElement('canvas');
    w.appendChild(paper);
    cv = D.createElement('canvas');
    w.appendChild(cv);
    cx = cv.getContext('2d');
    if (OPT.ui !== false) w.appendChild(buildBlock());
    toastEl = D.createElement('div');
    toastEl.className = 'toast';
    w.appendChild(toastEl);
    shadow.appendChild(w);
    D.documentElement.appendChild(hostEl);
    resize();
  }
  const btns = {};
  function buildBlock() {
    block = D.createElement('div');
    block.className = 'tb';
    const el = (tag, cls, parent, text) => { const e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    const hd = el('div', 'hd', block);
    el('b', '', hd, 'BLUEPRINT');
    el('span', '', hd, 'SHEET 1 OF 1');
    const row = (k, v) => { const r = el('div', 'row', block); el('div', 'k', r, k); return el('div', 'v', r, v); };
    row('Project', host);
    row('Drawing', short(titleOf(), 60));
    block.__scale = row('Scale', '1:1');
    block.__els = row('Elements', '');
    row('Date', fmtDate());
    const bar = el('div', 'bar', block);
    const mk = (name, label, act, pressed) => {
      const b = el('button', name === 'grid' || name === 'dims' ? 'hide-s' : '', bar, label);
      b.type = 'button';
      b.dataset.act = act;
      if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
      btns[name] = b;
    };
    mk('save', 'SAVE PNG', 'save');
    mk('grid', 'GRID', 'grid', grid);
    mk('dims', 'DIMS', 'dims', dims);
    mk('close', 'CLOSE', 'close');
    const ft = el('div', 'ft', block);
    el('span', 'hide-s', ft, 'hover to measure ' + DOT + ' click to pin ' + DOT + ' S save');
    if (OPT.credit !== false) {
      const a = el('a', '', ft, 'drawn by @shmidtqq');
      a.href = 'https://github.com/shmidtqq65/blueprint';
      a.target = '_blank';
      a.rel = 'noopener';
    }
    block.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      action(b.dataset.act);
    });
    return block;
  }
  let toastT = 0;
  const toast = (msg) => { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl && toastEl.classList.remove('on'), 2200); };

  function resize() {
    vw = DE.clientWidth || W.innerWidth;
    vh = W.innerHeight;
    dpr = Math.min(2, W.devicePixelRatio || 1);
    if (cv) { cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); }
    if (paper) paintPaper();
  }
  // paper grain and a soft vignette, like an old print
  function paintPaper() {
    const s = Math.min(dpr, 1.5);
    paper.width = Math.round(vw * s); paper.height = Math.round(vh * s);
    const g = paper.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = g.createPattern(makeNoise(), 'repeat');
    g.fillRect(0, 0, vw, vh);
    const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.62);
    vg.addColorStop(0, 'rgba(8,24,56,0)');
    vg.addColorStop(1, 'rgba(8,24,56,.32)');
    g.fillStyle = vg;
    g.fillRect(0, 0, vw, vh);
  }
  function makeNoise() {
    const c = D.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    const im = g.createImageData(160, 160);
    let s = 1234567;
    for (let i = 0; i < im.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = s & 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v > 128 ? 255 : 0;
      im.data[i + 3] = (s >> 8) % 23;
    }
    g.putImageData(im, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- drawing
  let clock = 0, scanT = 0, holdAt = 0, scanning = false, scanHold = false, phase = 'in';
  let mouse = { x: -1, y: -1, on: false }, hover = null, pins = [];
  const perim = (it) => 2 * (it.w + it.h);

  function pathRect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect && (r[0] || r[1] || r[2] || r[3])) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }
  function view(it, sx, sy) { return it.live ? { x: it.x, y: it.y } : { x: it.x - sx, y: it.y - sy }; }
  function liveRect(it) {
    if (!it.live) return;
    const r = it.el.getBoundingClientRect();
    it.x = r.left; it.y = r.top; it.w = r.width; it.h = r.height;
  }

  // dimension line with arrow heads, extension lines and a number in a gap
  function dimH(g, x1, x2, y, ext, label, col) {
    if (x2 - x1 < 26) return;
    g.strokeStyle = col; g.fillStyle = col;
    g.lineWidth = 1;
    g.beginPath();
    const o = ext > 0 ? -4 : 4;
    g.moveTo(x1 + 0.5, y + ext); g.lineTo(x1 + 0.5, y + o);
    g.moveTo(x2 - 0.5, y + ext); g.lineTo(x2 - 0.5, y + o);
    g.stroke();
    const tw = g.measureText(label).width + 10, mid = (x1 + x2) / 2;
    g.beginPath();
    if (tw < x2 - x1 - 18) { g.moveTo(x1, y + 0.5); g.lineTo(mid - tw / 2, y + 0.5); g.moveTo(mid + tw / 2, y + 0.5); g.lineTo(x2, y + 0.5); }
    else { g.moveTo(x1, y + 0.5); g.lineTo(x2, y + 0.5); }
    g.stroke();
    arrow(g, x1, y + 0.5, 1, 0); arrow(g, x2, y + 0.5, -1, 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, mid, tw < x2 - x1 - 18 ? y + 0.5 : y - 8);
  }
  function dimV(g, y1, y2, x, ext, label, col) {
    if (y2 - y1 < 26) return;
    g.strokeStyle = col; g.fillStyle = col;
    g.lineWidth = 1;
    g.beginPath();
    const o = ext > 0 ? -4 : 4;
    g.moveTo(x + ext, y1 + 0.5); g.lineTo(x + o, y1 + 0.5);
    g.moveTo(x + ext, y2 - 0.5); g.lineTo(x + o, y2 - 0.5);
    g.stroke();
    const tw = g.measureText(label).width + 10, mid = (y1 + y2) / 2;
    g.beginPath();
    if (tw < y2 - y1 - 18) { g.moveTo(x + 0.5, y1); g.lineTo(x + 0.5, mid - tw / 2); g.moveTo(x + 0.5, mid + tw / 2); g.lineTo(x + 0.5, y2); }
    else { g.moveTo(x + 0.5, y1); g.lineTo(x + 0.5, y2); }
    g.stroke();
    arrow(g, x + 0.5, y1, 0, 1); arrow(g, x + 0.5, y2, 0, -1);
    g.save();
    g.translate(x + 0.5, mid);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 0, 0);
    g.restore();
  }
  function arrow(g, x, y, dx, dy) {
    const L = 6, S = 2.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dx * L - dy * S, y + dy * L + dx * S);
    g.lineTo(x + dx * L + dy * S, y + dy * L - dx * S);
    g.closePath();
    g.fill();
  }

  function frame(dt) {
    clock += dt;
    if (!cx) return;
    const sx = W.scrollX, sy = W.scrollY;
    const g = cx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, vw, vh);

    // scan line position (0..1 down the screen) while the copier light runs
    let scanY = vh + 999;
    if (scanning) {
      // the light waits for the browser to take its snapshot of the page, so the two stay in step
      if (scanHold && Date.now() - holdAt > 1500) scanHold = false;
      if (!scanHold) scanT += dt;
      const p = clamp(scanT / SCAN, 0, 1);
      scanY = (MOTION ? cubicScan(p) : 1) * vh;
      if (p >= 1) { scanning = false; onScanned(); }
    }
    const drawing = phase === 'in' || phase === 'on';

    if (drawing) {
      // Sticky headers and fixed bars keep their paper, so whatever scrolls under them is clipped away
      const cover = [];
      for (const it of liveItems) { liveRect(it); if (it.solid && it.born >= 0) cover.push(it); }
      g.save();
      // one clip per cover: nested or overlapping covers would flip back in with a single winding path
      for (const o of cover) {
        g.beginPath();
        g.rect(0, 0, vw, vh);
        g.rect(o.x + o.w, o.y, -o.w, o.h);
        g.clip();
      }
      // center lines along the edges of the main columns, the way a drafter sets up a sheet
      if (dims && guides.length) {
        g.strokeStyle = INK(0.13);
        g.lineWidth = 1;
        g.setLineDash([22, 5, 3, 5]);
        g.beginPath();
        for (const gx of guides) {
          const x = Math.round(gx - sx) + 0.5;
          if (x < 0 || x > vw) continue;
          g.moveTo(x, 0); g.lineTo(x, scanning && phase === 'in' ? scanY : vh);
        }
        g.stroke();
        g.setLineDash([]);
      }
      // outlines, drawn by a pen that follows the scan line
      g.lineJoin = 'round';
      for (const it of items) if (!it.live) pen(g, it, sx, sy, scanY);
      for (const hd of typeNotes) if (!hd.live) note(g, hd, sx, sy, scanY);
      // dimension lines on the key blocks
      if (dims) {
        g.font = '10.5px ' + MONO;
        for (const it of keys) {
          const v = view(it, sx, sy);
          if (v.y > vh || v.y + it.h < 0 || it.born < 0) continue;
          const a = MOTION ? clamp((clock - it.born - 0.55) / 0.45, 0, 1) : 1;
          if (a <= 0) continue;
          g.globalAlpha = a;
          const R = vw > 700 ? 28 : 8, mid = v.x + it.w / 2;
          const above = v.y - 14, below = v.y + it.h + 14;
          const top = above > R && !underLive(mid, above, it) ? above
            : below < vh - 10 && it.h < vh * 0.7 && !underLive(mid, below, it) ? below
            : Math.max(v.y + 16, R + 4);
          const left = v.x - 14 > R ? v.x - 14 : v.x + it.w + 14 < vw - 10 ? v.x + it.w + 14 : v.x + 16;
          dimH(g, v.x, v.x + it.w, top, top < v.y ? 10 : -10, String(round(it.w)), INK(0.8));
          if (it.h < vh * 1.6) dimV(g, Math.max(v.y, -it.h), v.y + it.h, left, left < v.x || left > v.x + it.w ? (left < v.x ? 10 : -10) : -10, String(round(it.h)), INK(0.8));
          g.globalAlpha = 1;
        }
      }
      g.restore();
      for (const it of items) if (it.live) pen(g, it, sx, sy, scanY);
      for (const hd of typeNotes) if (hd.live) note(g, hd, sx, sy, scanY);
      // pinned measurements and the live one under the cursor
      for (const pn of pins) inspect(g, pn, sx, sy, true);
      if (hover && phase === 'on') {
        inspect(g, hover, sx, sy, false);
        // with something pinned, the gaps between it and the element under the cursor
        const pn = pins[pins.length - 1];
        if (pn && pn !== hover && pn.isConnected) gaps(g, pn.getBoundingClientRect(), hover.getBoundingClientRect());
      }
      if (vw > 700 && phase === 'on') rulers(g, sx, sy);
    }

    // the copier light
    if (scanning && MOTION) {
      const y = Math.min(scanY, vh - 1);
      const glow = g.createLinearGradient(0, y - 90, 0, y + 2);
      glow.addColorStop(0, 'rgba(160,210,255,0)');
      glow.addColorStop(0.8, 'rgba(190,225,255,.16)');
      glow.addColorStop(1, 'rgba(235,248,255,.55)');
      g.fillStyle = glow;
      g.fillRect(0, y - 90, vw, 92);
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.fillRect(0, y - 1.5, vw, 2);
    }
  }
  const cubicScan = (p) => ease(p);

  function pen(g, it, sx, sy, scanY) {
    liveRect(it);
    const v = view(it, sx, sy);
    if (v.y > vh + 40 || v.y + it.h < -40 || v.x > vw + 40 || v.x + it.w < -40) return;
    if (it.born < 0) {
      if (scanning && v.y > scanY) return;
      it.born = clock + (MOTION ? (scanning || phase === 'in' ? 0.02 : 0.06 + Math.random() * 0.25) + Math.random() * 0.08 : -9);
    }
    const p = MOTION ? clamp((clock - it.born) / (0.3 + Math.min(0.55, perim(it) / 5000)), 0, 1) : 1;
    if (p <= 0) return;
    if (it.clip) {
      const c = it.clip;
      g.save();
      g.beginPath();
      g.rect(c.live ? c.x : c.x - sx, c.live ? c.y : c.y - sy, c.w, c.h);
      g.clip();
      drawItem(g, it, v, easeOut(p), p);
      g.restore();
    } else drawItem(g, it, v, easeOut(p), p);
  }
  // type callouts on the big headings
  function note(g, hd, sx, sy, scanY) {
    liveRect(hd);
    const v = view(hd, sx, sy);
    if (v.y > vh || v.y + hd.h < 0) return;
    if (hd.born < 0) { if (scanning && v.y > scanY) return; hd.born = clock + (MOTION ? 0.5 : -9); }
    const a = MOTION ? clamp((clock - hd.born) / 0.5, 0, 1) : 1;
    if (a <= 0 || v.y < (vw > 700 ? 34 : 14)) return;
    g.globalAlpha = a * 0.85;
    g.font = '10px ' + MONO;
    g.fillStyle = INK(0.75);
    g.strokeStyle = INK(0.5);
    g.lineWidth = 1;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.beginPath(); g.moveTo(v.x, v.y - 3.5); g.lineTo(v.x + 6, v.y - 3.5); g.stroke();
    g.fillText(hd.tag + ' ' + DOT + ' ' + hd.note, v.x + 9, v.y - 1);
    g.globalAlpha = 1;
  }

  function drawItem(g, it, v, e, p) {
    const x = Math.round(v.x) + 0.5, y = Math.round(v.y) + 0.5, w = Math.max(1, Math.round(it.w) - 1), h = Math.max(1, Math.round(it.h) - 1);
    if (it.kind === 'frame') {
      // layout containers: construction lines, dashed and faint, with the tag on the top edge
      g.globalAlpha = e;
      g.strokeStyle = INK(0.3);
      g.lineWidth = 1;
      g.setLineDash([6, 4]);
      g.strokeRect(x, y, w, h);
      g.setLineDash([]);
      tag(g, it, x, y);
      g.globalAlpha = 1;
      return;
    }
    g.lineWidth = it.kind === 'field' ? 1.25 : 1;
    g.strokeStyle = INK(it.kind === 'media' ? 0.7 : 0.82);
    if (it.kind === 'rule') {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * e, y); g.stroke();
      return;
    }
    const L = perim(it);
    if (it.sides === 15) {
      pathRect(g, x, y, w, h, it.rad);
      if (e < 1) { g.setLineDash([L * e, L + 10]); g.lineDashOffset = 0; }
      g.stroke();
      g.setLineDash([]);
    } else {
      g.beginPath();
      if (it.sides & 1) { g.moveTo(x, y); g.lineTo(x + w * e, y); }
      if (it.sides & 2) { g.moveTo(x + w, y); g.lineTo(x + w, y + h * e); }
      if (it.sides & 4) { g.moveTo(x + w, y + h); g.lineTo(x + w - w * e, y + h); }
      if (it.sides & 8) { g.moveTo(x, y + h); g.lineTo(x, y + h - h * e); }
      g.stroke();
    }
    // crop marks on the corners of big boxes
    if (it.w >= 140 && it.h >= 60 && it.sides === 15 && e > 0.9) {
      const m = 7, o = 4;
      g.strokeStyle = INK(0.45 * (e - 0.9) * 10);
      g.beginPath();
      g.moveTo(x - o - m, y); g.lineTo(x - o, y); g.moveTo(x, y - o - m); g.lineTo(x, y - o);
      g.moveTo(x + w + o, y); g.lineTo(x + w + o + m, y); g.moveTo(x + w, y - o - m); g.lineTo(x + w, y - o);
      g.moveTo(x - o - m, y + h); g.lineTo(x - o, y + h); g.moveTo(x, y + h + o); g.lineTo(x, y + h + o + m);
      g.moveTo(x + w + o, y + h); g.lineTo(x + w + o + m, y + h); g.moveTo(x + w, y + h + o); g.lineTo(x + w, y + h + o + m);
      g.stroke();
    }
    if (it.label && it.kind === 'box' && e > 0.6) { g.globalAlpha = (e - 0.6) / 0.4; tag(g, it, x, y); g.globalAlpha = 1; }
    if (it.kind === 'media' && p > 0.55 && it.w >= 28 && it.h >= 28) {
      const a = clamp((p - 0.55) / 0.45, 0, 1);
      g.strokeStyle = INK(0.38 * a);
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x + w * a, y + h * a);
      g.moveTo(x + w, y); g.lineTo(x + w - w * a, y + h * a);
      g.stroke();
      if (it.w >= 70 && it.h >= 36) {
        g.font = '10px ' + MONO;
        const t = it.label + ' ' + round(it.w) + X + round(it.h);
        const tw = g.measureText(t).width;
        g.fillStyle = 'rgba(20,62,122,' + (0.85 * a) + ')';
        g.fillRect(x + 4, y + 4, tw + 8, 15);
        g.fillStyle = INK(0.9 * a);
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(t, x + 8, y + 12);
      }
    }
  }

  // HEADER, NAV, MAIN... written down the left edge, in the margin, like the notes on a drawing
  function tag(g, it, x, y) {
    if (!it.label) return;
    g.font = '9px ' + MONO;
    g.save();
    g.translate(x < 18 ? x + (vw > 700 ? 27 : 9) : x - 8, y + it.lx);
    g.rotate(Math.PI / 2);
    g.fillStyle = INK(0.62);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(it.label, 0, 0);
    g.restore();
  }

  // the inspector: box model, size and type of the element under the cursor
  function inspect(g, el, sx, sy, pinned) {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh) return;
    let cs;
    try { cs = getComputedStyle(el); } catch (e) { return; }
    const m = [px(cs.marginTop), px(cs.marginRight), px(cs.marginBottom), px(cs.marginLeft)];
    const pd = [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
    const x = r.left, y = r.top, w = r.width, h = r.height;
    g.save();
    // margin: hatching outside, padding: hatching inside
    hatch(g, x - m[3], y - m[0], w + m[1] + m[3], h + m[0] + m[2], x, y, w, h, CHALK_A(pinned ? 0.22 : 0.3));
    const bl = px(cs.borderLeftWidth), bt = px(cs.borderTopWidth), br = px(cs.borderRightWidth), bb = px(cs.borderBottomWidth);
    hatch(g, x + bl, y + bt, w - bl - br, h - bt - bb, x + bl + pd[3], y + bt + pd[0], w - bl - br - pd[1] - pd[3], h - bt - bb - pd[0] - pd[2], INK(pinned ? 0.16 : 0.22));
    g.strokeStyle = CHALK;
    g.lineWidth = 1.5;
    g.strokeRect(round(x) + 0.5, round(y) + 0.5, round(w) - 1, round(h) - 1);
    g.font = '10.5px ' + MONO;
    const top = y - 16 > 24 ? y - 16 : y + h + 16;
    dimH(g, x, x + w, top, top < y ? 12 : -12, String(round(w)), CHALK);
    const left = x - 16 > 24 ? x - 16 : x + w + 16;
    dimV(g, y, y + h, left, left < x ? 12 : -12, String(round(h)), CHALK);
    if (!pinned) {
      // a leader to a label card
      const tag = el.localName + (el.id ? '#' + el.id : el.classList && el.classList.length ? '.' + el.classList[0] : '');
      const lines = [short(tag, 34), round(w) + ' ' + X + ' ' + round(h)];
      const pad = pd.map(round).join(' '), mar = m.map(round).join(' ');
      if (pad !== '0 0 0 0') lines.push('padding ' + pad);
      if (mar !== '0 0 0 0') lines.push('margin ' + mar);
      if (el.firstChild && /\S/.test(el.textContent || '') && el.children.length < 3) lines.push(short(famOf(cs.fontFamily), 18) + ' ' + cs.fontWeight + ' ' + round(px(cs.fontSize)) + '/' + (cs.lineHeight === 'normal' ? 'normal' : round(px(cs.lineHeight))));
      const lw = Math.max(...lines.map((s) => g.measureText(s).width)) + 16, lh = lines.length * 15 + 10;
      let lx = mouse.x + 22, ly = mouse.y + 22;
      if (lx + lw > vw - 8) lx = mouse.x - 22 - lw;
      if (ly + lh > vh - 8) ly = mouse.y - 22 - lh;
      g.strokeStyle = CHALK_A(0.8);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(mouse.x, mouse.y); g.lineTo(lx < mouse.x ? lx + lw : lx, ly < mouse.y ? ly + lh : ly); g.stroke();
      g.fillStyle = 'rgba(16,52,104,.94)';
      g.fillRect(lx, ly, lw, lh);
      g.strokeStyle = CHALK;
      g.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      lines.forEach((s, i) => { g.fillStyle = i === 0 ? CHALK : INK(0.92); g.fillText(s, lx + 8, ly + 12 + i * 15); });
    }
    g.restore();
  }
  // spacing between two elements, the way design tools show it
  function gaps(g, a, b) {
    g.save();
    g.lineWidth = 1;
    g.font = '600 10.5px ' + MONO;
    const inA = b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
    const inB = a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
    if (inA || inB) {
      const o = inA ? a : b, i = inA ? b : a;
      const cx = (i.left + i.right) / 2, cy = (i.top + i.bottom) / 2;
      gapLine(g, o.left, cy, i.left, cy);
      gapLine(g, i.right, cy, o.right, cy);
      gapLine(g, cx, o.top, cx, i.top);
      gapLine(g, cx, i.bottom, cx, o.bottom);
    } else {
      if (b.left >= a.right || a.left >= b.right) {
        const l = b.left >= a.right ? a : b, r = l === a ? b : a;
        const t = Math.max(a.top, b.top), d = Math.min(a.bottom, b.bottom);
        const y = t < d ? (t + d) / 2 : (r.top + r.bottom) / 2;
        if (y < l.top || y > l.bottom) leader(g, l.right, y < l.top ? l.top : l.bottom, l.right, y);
        gapLine(g, l.right, y, r.left, y);
      }
      if (b.top >= a.bottom || a.top >= b.bottom) {
        const t = b.top >= a.bottom ? a : b, d = t === a ? b : a;
        const l = Math.max(a.left, b.left), r = Math.min(a.right, b.right);
        const x = l < r ? (l + r) / 2 : (d.left + d.right) / 2;
        if (x < t.left || x > t.right) leader(g, x < t.left ? t.left : t.right, t.bottom, x, t.bottom);
        gapLine(g, x, t.bottom, x, d.top);
      }
    }
    g.restore();
  }
  function leader(g, x1, y1, x2, y2) {
    g.strokeStyle = CHALK_A(0.7);
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(x1 + 0.5, y1 + 0.5); g.lineTo(x2 + 0.5, y2 + 0.5); g.stroke();
    g.setLineDash([]);
  }
  function gapLine(g, x1, y1, x2, y2) {
    const d = Math.round(Math.abs(x2 - x1) + Math.abs(y2 - y1));
    if (d < 1) return;
    const hz = y1 === y2;
    g.strokeStyle = CHALK; g.fillStyle = CHALK;
    g.beginPath();
    g.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5); g.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
    if (hz) { g.moveTo(Math.round(x1) + 0.5, y1 - 4); g.lineTo(Math.round(x1) + 0.5, y1 + 5); g.moveTo(Math.round(x2) + 0.5, y2 - 4); g.lineTo(Math.round(x2) + 0.5, y2 + 5); }
    else { g.moveTo(x1 - 4, Math.round(y1) + 0.5); g.lineTo(x1 + 5, Math.round(y1) + 0.5); g.moveTo(x2 - 4, Math.round(y2) + 0.5); g.lineTo(x2 + 5, Math.round(y2) + 0.5); }
    g.stroke();
    const t = String(d), tw = g.measureText(t).width + 8, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const bx = hz ? mx - tw / 2 : mx + 6, by = hz ? my + 5 : my - 7;
    g.fillRect(bx, by, tw, 14);
    g.fillStyle = PAPER;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(t, bx + 4, by + 7.5);
  }

  // diagonal hatching in the ring between an outer and an inner rectangle
  function hatch(g, ox, oy, ow, oh, ix, iy, iw, ih, col) {
    if (ow <= 0 || oh <= 0) return;
    if (ix <= ox + 0.5 && iy <= oy + 0.5 && ix + iw >= ox + ow - 0.5 && iy + ih >= oy + oh - 0.5) return;
    g.save();
    g.beginPath();
    g.rect(ox, oy, ow, oh);
    if (iw > 0 && ih > 0) g.rect(ix + iw, iy, -iw, ih);
    g.clip('evenodd');
    g.strokeStyle = col;
    g.lineWidth = 1;
    g.beginPath();
    for (let d = -oh; d < ow; d += 6) { g.moveTo(ox + d, oy + oh); g.lineTo(ox + d + oh, oy); }
    g.stroke();
    g.restore();
  }

  // rulers along the top and left edge, in document pixels
  function rulers(g, sx, sy) {
    const T = 18;
    g.fillStyle = 'rgba(18,56,110,.5)';
    g.fillRect(0, 0, vw, T);
    g.fillRect(0, T, T, vh - T);
    g.strokeStyle = INK(0.55);
    g.fillStyle = INK(0.7);
    g.lineWidth = 1;
    g.font = '9px ' + MONO;
    g.textBaseline = 'top'; g.textAlign = 'left';
    g.beginPath();
    g.moveTo(0, T + 0.5); g.lineTo(vw, T + 0.5);
    g.moveTo(T + 0.5, T); g.lineTo(T + 0.5, vh);
    const x0 = Math.floor(sx / 10) * 10;
    for (let X0 = x0; X0 < sx + vw; X0 += 10) {
      const x = X0 - sx + 0.5;
      if (x < T) continue;
      const L = X0 % 100 === 0 ? 10 : X0 % 50 === 0 ? 6 : 3;
      g.moveTo(x, T - L); g.lineTo(x, T);
    }
    const y0 = Math.floor(sy / 10) * 10;
    for (let Y0 = y0; Y0 < sy + vh; Y0 += 10) {
      const y = Y0 - sy + 0.5;
      if (y < T) continue;
      const L = Y0 % 100 === 0 ? 10 : Y0 % 50 === 0 ? 6 : 3;
      g.moveTo(T - L, y); g.lineTo(T, y);
    }
    g.stroke();
    for (let X0 = Math.ceil(sx / 100) * 100; X0 < sx + vw; X0 += 100) { const x = X0 - sx; if (x > T + 4) g.fillText(String(X0), x + 3, 2); }
    g.save();
    g.rotate(-Math.PI / 2);
    for (let Y0 = Math.ceil(sy / 100) * 100; Y0 < sy + vh; Y0 += 100) { const y = Y0 - sy; if (y > T + 4) g.fillText(String(Y0), -y + 3, 2); }
    g.restore();
    // the cursor on the rulers
    if (mouse.on) {
      g.fillStyle = CHALK;
      g.fillRect(mouse.x - 0.5, 0, 1, T);
      g.fillRect(0, mouse.y - 0.5, T, 1);
    }
    g.fillStyle = 'rgba(18,56,110,.8)';
    g.fillRect(0, 0, T, T);
  }

  // ---------------------------------------------------------------- the PNG sheet
  async function save(download = true) {
    if (download) { toast('Drawing the sheet\u2026'); await new Promise((r) => setTimeout(r, 30)); }
    const pageW = Math.max(docW, 320), pageH = Math.max(docH, 200);
    const scale = Math.min(1, 1600 / pageW);
    const maxDocH = Math.min(pageH, Math.floor(12000 / scale / 1.5));
    const M = 40, FOOT = 190;
    const SW = Math.round(pageW * scale) + M * 2, SH = Math.round(maxDocH * scale) + M * 2 + FOOT;
    const k = Math.min(1.5, Math.sqrt(26e6 / (SW * SH)));
    const c = D.createElement('canvas');
    c.width = Math.round(SW * k); c.height = Math.round(SH * k);
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    // Sticky headers and sidebars are measured where they sit in the page: the window goes to the top while
    // the sheet is drawn and comes back before anything is painted, so nothing on screen moves.
    const sx = W.scrollX, sy = W.scrollY, moved = sx !== 0 || sy !== 0;
    const jump = (x, y) => { try { W.scrollTo({ left: x, top: y, behavior: 'instant' }); } catch (e) { W.scrollTo(x, y); } };
    const relive = () => { for (const it of items) liveRect(it); for (const hd of typeNotes) liveRect(hd); };
    if (moved) jump(0, 0);
    try {
      relive();
      drawSheet(g, SW, SH, M, FOOT, scale, pageW, pageH, maxDocH);
    } finally {
      if (moved) jump(sx, sy);
      relive();
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (download && blob) {
      // the link lives in BLUEPRINT's own shadow root, so the click that starts the download isn't taken for a pin
      const a = D.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = host.replace(/[^\w.-]+/g, '-') + '-blueprint.png';
      a.style.display = 'none';
      (shadow || D.body).appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Saved ' + a.download);
    }
    return { blob, width: c.width, height: c.height };
  }
  function drawSheet(g, SW, SH, M, FOOT, scale, pageW, pageH, maxDocH) {
    // paper and grid
    g.fillStyle = PAPER;
    g.fillRect(0, 0, SW, SH);
    g.lineWidth = 1;
    for (let gx = 0; gx <= SW; gx += 20) { g.strokeStyle = INK(gx % 100 === 0 ? 0.12 : 0.05); g.beginPath(); g.moveTo(gx + 0.5, 0); g.lineTo(gx + 0.5, SH); g.stroke(); }
    for (let gy = 0; gy <= SH; gy += 20) { g.strokeStyle = INK(gy % 100 === 0 ? 0.12 : 0.05); g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(SW, gy + 0.5); g.stroke(); }
    // sheet border
    g.strokeStyle = INK(0.9);
    g.lineWidth = 2;
    g.strokeRect(14, 14, SW - 28, SH - 28);
    g.lineWidth = 1;
    g.strokeRect(20, 20, SW - 40, SH - 40);
    g.save();
    g.beginPath();
    g.rect(M, M, pageW * scale, maxDocH * scale);
    g.clip();
    g.translate(M, M);
    g.scale(scale, scale);
    // fixed parts (cookie bars, chat buttons) are left out
    for (const it of items) {
      if (it.fixed || it.y > maxDocH) continue;
      if (it.clip) {
        g.save();
        g.beginPath(); g.rect(it.clip.x, it.clip.y, it.clip.w, it.clip.h); g.clip();
        sheetItem(g, it, scale);
        g.restore();
      } else sheetItem(g, it, scale);
    }
    // center lines, tags and type notes, as on screen
    g.strokeStyle = INK(0.13);
    g.setLineDash([22 / scale, 5 / scale, 3 / scale, 5 / scale]);
    g.beginPath();
    for (const gx of guides) { g.moveTo(gx, 0); g.lineTo(gx, maxDocH); }
    g.stroke();
    g.setLineDash([]);
    g.font = 9 / scale + 'px ' + MONO;
    g.fillStyle = INK(0.62);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    for (const it of items) {
      if (!it.label || it.fixed || it.kind === 'media' || it.y > maxDocH) continue;
      g.save();
      g.translate(it.x < 18 ? it.x + 9 / scale : it.x - 8 / scale, it.y + it.lx);
      g.rotate(Math.PI / 2);
      g.fillText(it.label, 0, 0);
      g.restore();
    }
    g.font = 10 / scale + 'px ' + MONO;
    g.fillStyle = INK(0.7);
    g.strokeStyle = INK(0.5);
    g.textBaseline = 'alphabetic';
    for (const hd of typeNotes) {
      if (hd.fixed || hd.y > maxDocH || hd.y < 14) continue;
      g.fillText(hd.tag + ' ' + DOT + ' ' + hd.note, hd.x + 9 / scale, hd.y - 1 / scale);
      g.beginPath(); g.moveTo(hd.x, hd.y - 3.5 / scale); g.lineTo(hd.x + 6 / scale, hd.y - 3.5 / scale); g.stroke();
    }
    // the words themselves, in the page's own fonts
    drawWords(g, W.scrollX, W.scrollY, maxDocH);
    drawFields(g, maxDocH);
    // dimensions on the key blocks
    g.font = 10 / scale + 'px ' + MONO;
    g.lineWidth = 1 / scale;
    for (const it of keys) {
      const v = { x: it.x, y: it.y };
      if (v.y > maxDocH || it.fixed) continue;
      const top = v.y - 14 / scale > 0 && !underLive(v.x + it.w / 2, v.y - 14 / scale, it) ? v.y - 14 / scale : v.y + 16 / scale;
      dimHScaled(g, v.x, v.x + it.w, top, String(round(it.w)), scale);
    }
    g.restore();
    // the title block, in the strip under the drawing
    const by = SH - FOOT - 6 + 24, bx = SW - 20 - 470, bw = 450, bh = FOOT - 44;
    g.strokeStyle = INK(0.9); g.lineWidth = 1.5;
    g.strokeRect(bx, by, bw, bh);
    g.lineWidth = 1;
    const rows = [['PROJECT', host], ['DRAWING', titleOf()], ['SCALE', '1:' + (1 / scale).toFixed(2).replace(/\.?0+$/, '')], ['ELEMENTS', String(items.length)], ['DATE', fmtDate()]];
    g.font = '700 18px ' + MONO;
    g.fillStyle = INK(0.95);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('BLUEPRINT', bx + 12, by + 20);
    g.font = '10px ' + MONO;
    g.textAlign = 'right';
    g.fillStyle = INK(0.65);
    g.fillText(maxDocH < pageH ? 'SHEET 1 OF ' + Math.ceil(pageH / maxDocH) : 'SHEET 1 OF 1', bx + bw - 12, by + 20);
    const rh = (bh - 40) / rows.length;
    rows.forEach(([kk, vv], i) => {
      const ry = by + 40 + i * rh;
      g.strokeStyle = INK(0.55);
      g.beginPath(); g.moveTo(bx, ry + 0.5); g.lineTo(bx + bw, ry + 0.5); g.stroke();
      g.beginPath(); g.moveTo(bx + 100.5, ry); g.lineTo(bx + 100.5, ry + rh); g.stroke();
      g.textAlign = 'left';
      g.fillStyle = INK(0.62);
      g.font = '10px ' + MONO;
      g.fillText(kk, bx + 10, ry + rh / 2);
      g.fillStyle = INK(0.95);
      g.font = '13px ' + MONO;
      g.fillText(fit(g, vv, bw - 124), bx + 112, ry + rh / 2);
    });
    // the legend on the left of the strip
    g.textAlign = 'left';
    g.fillStyle = INK(0.92);
    g.font = '700 30px ' + MONO;
    g.fillText(fit(g, host.toUpperCase(), bx - 80), 40, by + 28);
    g.font = '12px ' + MONO;
    g.fillStyle = INK(0.65);
    g.fillText(round(pageW) + ' ' + X + ' ' + round(pageH) + ' px ' + DOT + ' ' + items.length + ' outlined elements ' + DOT + ' drawn ' + fmtDate(), 40, by + 62);
    if (OPT.credit !== false) {
      g.fillStyle = CHALK;
      g.fillText('drawn with BLUEPRINT ' + DOT + ' github.com/shmidtqq65/blueprint ' + DOT + ' @shmidtqq', 40, by + 86);
    }
  }
  function sheetItem(g, it, scale) {
    const v = { x: it.x, y: it.y };
    g.lineWidth = 1 / scale;
    g.strokeStyle = INK(it.kind === 'media' ? 0.7 : 0.85);
    if (it.kind === 'rule') { g.beginPath(); g.moveTo(v.x, v.y); g.lineTo(v.x + it.w, v.y); g.stroke(); return; }
    if (it.kind === 'frame') {
      g.strokeStyle = INK(0.32);
      g.setLineDash([6 / scale, 4 / scale]);
      g.strokeRect(v.x, v.y, it.w, it.h);
      g.setLineDash([]);
      return;
    }
    if (it.sides === 15) { pathRect(g, v.x, v.y, it.w, it.h, it.rad); g.stroke(); }
    else {
      g.beginPath();
      if (it.sides & 1) { g.moveTo(v.x, v.y); g.lineTo(v.x + it.w, v.y); }
      if (it.sides & 2) { g.moveTo(v.x + it.w, v.y); g.lineTo(v.x + it.w, v.y + it.h); }
      if (it.sides & 4) { g.moveTo(v.x, v.y + it.h); g.lineTo(v.x + it.w, v.y + it.h); }
      if (it.sides & 8) { g.moveTo(v.x, v.y); g.lineTo(v.x, v.y + it.h); }
      g.stroke();
    }
    if (it.kind === 'media' && it.w >= 28 && it.h >= 28) {
      g.strokeStyle = INK(0.35);
      g.beginPath(); g.moveTo(v.x, v.y); g.lineTo(v.x + it.w, v.y + it.h); g.moveTo(v.x + it.w, v.y); g.lineTo(v.x, v.y + it.h); g.stroke();
      if (it.w * scale > 70) {
        g.font = 10 / scale + 'px ' + MONO;
        g.fillStyle = INK(0.85);
        g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(it.label + ' ' + round(it.w) + X + round(it.h), v.x + 5 / scale, v.y + 5 / scale);
      }
    }
  }
  // form fields: the placeholder, the chosen option or the button label (never what someone typed)
  function drawFields(g, maxDocH) {
    for (const it of items) {
      if (it.kind !== 'field' || it.fixed || it.y > maxDocH) continue;
      const el = it.el, tag = el.localName, type = String(el.type || '').toLowerCase();
      let t = '', faint = false;
      if (tag === 'select') t = el.options && el.selectedIndex >= 0 && el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
      else if (tag === 'input' && /^(button|submit|reset)$/.test(type)) t = el.value || '';
      else if ((tag === 'input' && /^(text|search|email|url|tel|number|password)$/.test(type)) || tag === 'textarea') { t = el.placeholder || ''; faint = true; }
      if (!t || !/\S/.test(t)) continue;
      const cs = getComputedStyle(el);
      const pl = px(cs.paddingLeft) + px(cs.borderLeftWidth), pr = px(cs.paddingRight) + px(cs.borderRightWidth);
      g.save();
      g.beginPath(); g.rect(it.x, it.y, it.w, it.h); g.clip();
      g.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      g.fillStyle = INK(faint ? 0.45 : 0.92);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const y = tag === 'textarea' ? it.y + px(cs.paddingTop) + px(cs.borderTopWidth) + px(cs.fontSize) * 0.65 : it.y + it.h / 2;
      g.fillText(fit(g, t.replace(/\s+/g, ' ').trim(), it.w - pl - pr), it.x + pl, y);
      g.restore();
    }
  }
  const fit = (g, t, w) => {
    if (g.measureText(t).width <= w) return t;
    while (t.length > 1 && g.measureText(t + '\u2026').width > w) t = t.slice(0, -1);
    return t.trimEnd() + '\u2026';
  };
  function dimHScaled(g, x1, x2, y, label, s) {
    if ((x2 - x1) * s < 30) return;
    g.strokeStyle = INK(0.75); g.fillStyle = INK(0.85);
    g.beginPath();
    g.moveTo(x1, y); g.lineTo(x2, y);
    g.moveTo(x1, y - 4 / s); g.lineTo(x1, y + 8 / s);
    g.moveTo(x2, y - 4 / s); g.lineTo(x2, y + 8 / s);
    g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(label, (x1 + x2) / 2, y - 2 / s);
  }
  // every word of the page, placed where the browser laid it out
  function drawWords(g, sx, sy, maxDocH) {
    const range = D.createRange();
    let words = 0, lastP = null, font = '', cur = '', ox = sx, oy = sy, skip = false, clip = null;
    g.fillStyle = INK(0.92);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const walk = (root) => {
      const tw = D.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const p = n.parentElement;
          if (!p || !/\S/.test(n.data) || SKIP.has(p.localName) || p.closest('blueprint-overlay,svg')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      for (let n = tw.nextNode(); n && words < 20000; n = tw.nextNode()) {
        const p = n.parentElement;
        if (p !== lastP) {
          lastP = p;
          const cs = getComputedStyle(p), lv = liveEls.get(p);
          skip = lv === 'fixed' || cs.visibility !== 'visible' || +cs.opacity < 0.05;
          ox = lv === 'sticky' ? 0 : sx; oy = lv === 'sticky' ? 0 : sy;
          font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
          clip = clipOf.get(p) || null;
          if (clip && clip.live !== (lv === 'sticky')) clip = null;
        }
        if (skip) continue;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(n.data)) && words < 20000) {
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          const rs = range.getClientRects();
          if (!rs.length) continue;
          const r = rs[0];
          if (r.width < 0.5) continue;
          const x = r.left + ox, y = r.top + oy;
          if (y > maxDocH) continue;
          if (clip) {
            const mx = x + r.width / 2, my = y + r.height / 2;
            if (mx < clip.x || mx > clip.x + clip.w || my < clip.y || my > clip.y + clip.h) continue;
          }
          if (font !== cur) { g.font = font; cur = font; }
          // canvas text ignores letter-spacing and font features, so each word is fitted to the box the page gave it
          const mt = g.measureText(m[0]);
          const k = mt.width > 0 ? r.width / mt.width : 1;
          const base = y + (r.height + (mt.fontBoundingBoxAscent || 0) - (mt.fontBoundingBoxDescent || 0)) / 2;
          if (k > 0.8 && k < 1.25 && Math.abs(k - 1) > 0.01) {
            g.save();
            g.translate(x, base);
            g.scale(k, 1);
            g.fillText(m[0], 0, 0);
            g.restore();
          } else g.fillText(m[0], x, base);
          words++;
        }
      }
    };
    walk(D.body);
    for (const root of roots) walk(root);
  }

  // ---------------------------------------------------------------- flow
  let alive = true, raf = 0, last = 0, vtRun = null, usedVt = false;
  const vtAnims = () => (D.getAnimations ? D.getAnimations().filter((a) => { const pe = a.effect && a.effect.pseudoElement; return pe && pe.indexOf('view-transition') >= 0; }) : []);

  // the copier light: a view transition reveals the new state of the page from the top down
  function transition(cb) {
    if (!MOTION || !D.startViewTransition || D.visibilityState !== 'visible') { cb(); return null; }
    if (D.adoptedStyleSheets.indexOf(VT) < 0) D.adoptedStyleSheets = [...D.adoptedStyleSheets, VT];
    let vt;
    try { vt = D.startViewTransition(cb); } catch (e) { unadopt(D, VT); cb(); return null; }
    vtRun = vt; usedVt = true;
    scanHold = true; holdAt = Date.now();
    const mine = () => vtRun === vt;
    vt.ready.then(() => { if (mine()) { scanHold = false; if (MANUAL) syncVt(); } }, () => { if (mine()) scanHold = false; });
    const done = () => { if (mine()) { vtRun = null; unadopt(D, VT); } };
    vt.finished.then(done, done);
    return vt;
  }
  function syncVt() {
    const t = Math.min(SCAN, scanT) * 1000;
    for (const a of vtAnims()) { try { a.pause(); a.currentTime = t; } catch (e) {} }
  }
  function endVt() {
    if (vtRun) { try { vtRun.skipTransition(); } catch (e) {} }
  }

  function applyBlueprint() {
    applied = true;
    adopt(D, BP);
    adopt(D, LIVE);
    for (const r of roots) { try { adopt(r, BP); } catch (e) {} }
    hostEl.style.setProperty('display', 'block', 'important');
  }
  function removeBlueprint() {
    applied = false;
    unadopt(D, BP);
    unadopt(D, LIVE);
    for (const r of roots) unadopt(r, BP);
  }

  function enter() {
    collect();
    buildOverlay();
    if (block && block.__els) block.__els.textContent = items.length + ' outlined ' + DOT + ' ' + count + ' total';
    phase = 'in';
    scanning = true; scanT = 0;
    transition(applyBlueprint);
    if (!MOTION) { scanning = false; onScanned(); }
    bind();
    if (!MANUAL) { last = now(); raf = requestAnimationFrame(loop); }
  }
  function onScanned() {
    endVt();
    if (phase === 'in') {
      phase = 'on';
      if (block) block.classList.add('on');
    } else if (phase === 'out') teardown();
  }
  function exit() {
    if (phase === 'out' || !alive) return;
    phase = 'out';
    hover = null; pins = [];
    if (block) block.classList.remove('on');
    if (paper) paper.style.display = 'none';
    scanning = true; scanT = 0;
    if (!transition(removeBlueprint)) teardown();
  }
  function teardown() {
    if (!alive) return;
    alive = false;
    endVt();
    unbind();
    cancelAnimationFrame(raf);
    removeBlueprint();
    unadopt(D, VT);
    if (hostEl) hostEl.remove();
    hostEl = shadow = cv = cx = paper = block = toastEl = null;
    if (W.__blueprint === api) delete W.__blueprint;
  }

  function loop(t) {
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    safeFrame(dt);
    raf = requestAnimationFrame(loop);
  }
  function safeFrame(dt) {
    try { frame(dt); } catch (err) { teardown(); throw err; }
  }
  // tests and the demo recorder drive time by hand
  function step(dt) {
    if (!alive) return;
    safeFrame(dt);
    if (MANUAL && vtRun && alive) syncVt();
  }

  // ---------------------------------------------------------------- input
  const pick = (x, y) => {
    let el = D.elementFromPoint(x, y);
    while (el && el.shadowRoot && el.shadowRoot.elementFromPoint) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    if (!el || el === DE || el === D.body || el === hostEl || (hostEl && hostEl.contains(el))) return null;
    return el;
  };
  const onMove = (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    if (phase === 'on') hover = pick(e.clientX, e.clientY);
  };
  const onLeave = () => { mouse.on = false; hover = null; };
  const inUi = (e) => hostEl && e.composedPath && e.composedPath().indexOf(hostEl) >= 0;
  // the page's own switch for BLUEPRINT (data-blueprint-ignore) keeps working while the page is drawn
  const passes = (e) => !!(e.target && e.target.closest && e.target.closest('[data-blueprint-ignore]'));
  const onClick = (e) => {
    if (phase !== 'on' || inUi(e) || e.button !== 0 || passes(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = pick(e.clientX, e.clientY);
    if (!el) return;
    const i = pins.indexOf(el);
    if (i >= 0) pins.splice(i, 1);
    else { pins.push(el); if (pins.length > 24) pins.shift(); }
  };
  const swallow = (e) => { if (phase === 'on' && !inUi(e) && !passes(e) && e.button === 0) { e.preventDefault(); e.stopPropagation(); } };
  const onKey = (e) => {
    if (!alive || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && e.key !== 'Escape') return;
    const k = e.key;
    let used = true;
    if (k === 'Escape') action('close');
    else if (k === 's' || k === 'S') action('save');
    else if (k === 'g' || k === 'G') action('grid');
    else if (k === 'd' || k === 'D') action('dims');
    else if (k === 'p' || k === 'P') pins = [];
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  };
  let rsT = 0, mo = null, moT = 0;
  const onResize = () => { resize(); clearTimeout(rsT); rsT = setTimeout(() => { if (alive && phase !== 'out') collect(); }, 220); };
  const onScroll = (e) => { if (e.target !== D && e.target !== DE) { clearTimeout(rsT); rsT = setTimeout(() => { if (alive && phase === 'on') collect(); }, 160); } };
  function bind() {
    W.addEventListener('mousemove', onMove, { passive: true, capture: true });
    D.addEventListener('mouseleave', onLeave, true);
    W.addEventListener('click', onClick, true);
    W.addEventListener('mousedown', swallow, true);
    W.addEventListener('mouseup', swallow, true);
    W.addEventListener('auxclick', swallow, true);
    W.addEventListener('keydown', onKey, true);
    W.addEventListener('resize', onResize);
    D.addEventListener('scroll', onScroll, true);
    if (W.MutationObserver) {
      mo = new MutationObserver((list) => {
        if (list.every((m) => hostEl && (m.target === hostEl || hostEl.contains(m.target) || [...m.addedNodes, ...m.removedNodes].every((n) => n === hostEl)))) return;
        clearTimeout(moT);
        moT = setTimeout(() => { if (alive && phase === 'on') collect(); }, Math.max(400, collectMs * 8));
      });
      mo.observe(D.body, { childList: true, subtree: true });
    }
  }
  function unbind() {
    W.removeEventListener('mousemove', onMove, { capture: true });
    D.removeEventListener('mouseleave', onLeave, true);
    W.removeEventListener('click', onClick, true);
    W.removeEventListener('mousedown', swallow, true);
    W.removeEventListener('mouseup', swallow, true);
    W.removeEventListener('auxclick', swallow, true);
    W.removeEventListener('keydown', onKey, true);
    W.removeEventListener('resize', onResize);
    D.removeEventListener('scroll', onScroll, true);
    if (mo) mo.disconnect();
    clearTimeout(rsT); clearTimeout(moT); clearTimeout(toastT);
  }

  function action(a) {
    if (!alive) return;
    if (a === 'close') exit();
    else if (a === 'save') save().catch((err) => toast('Could not draw the sheet: ' + (err && err.message)));
    else if (a === 'grid') {
      grid = !grid;
      BP.replaceSync(sheetCss(grid));
      if (btns.grid) btns.grid.setAttribute('aria-pressed', String(grid));
    } else if (a === 'dims') {
      dims = !dims;
      if (btns.dims) btns.dims.setAttribute('aria-pressed', String(dims));
    }
  }

  const api = {
    version: VERSION,
    get alive() { return alive; },
    toggle: exit,
    close: exit,
    stop: teardown,
    save: (download) => save(download),
    step,
    hover: (x, y) => { mouse.x = x; mouse.y = y; mouse.on = true; hover = phase === 'on' ? pick(x, y) : null; return hover ? hover.localName : null; },
    pin: (x, y) => { const el = pick(x, y); if (el && pins.indexOf(el) < 0) pins.push(el); return pins.length; },
    state: () => ({ phase, items: items.length, keys: keys.length, headings: typeNotes.length, elements: count, pins: pins.length, hover: hover ? hover.localName : null, grid, dims, transition: usedVt, holding: scanning && scanHold }),
  };
  W.__blueprint = api;
  enter();
})();
