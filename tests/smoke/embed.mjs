// tests/smoke/embed.mjs  (owner: core) — Token Tails pass (docs/TOKENTAILS-PLAN.md §5.5, §7 items 5, 8, 9):
//   embed:bridge      a fake Token Tails host page (http://localhost:3000, an allowed origin, served by page.route) frames
//                     ?embed=1: hello → ready, pause → paused, resume, data-embed on <html>, no window.__GAME__ inside
//                     the frame; then WEBGL_lose_context shows the "Tap to continue" panel
//   embed:wrong-origin  the same host page on a non-allowed origin gets nothing back
//   embed:level-retry   a forced level-chunk failure keeps the old level and shows Retry (a failed import: Retry reloads)
//   embed:hud-corner    data-embed="1" at 1280×720, 390×844, 360×740 and 844×390: the host's exit-button corner stays
//                       free of HUD; there and at 390×844 / 360×740 without embed the base 4 hearts sit on one row on every
//                       4 Hz touch fit pass
//   embed:production    (preview runs only) dist/ opened with ?debug&test=1&level=gate: no __GAME__, no lil-gui, title
// Screenshots → tests/shots/embed/*.png
import fs from 'node:fs';
import path from 'node:path';

const NS = 'tt-swordcat';
const GOOD_HOST = 'http://localhost:3000';
const BAD_HOST = 'http://wrong-origin.test';
const BOOT = 240000;

function hostHtml(src, gameOrigin) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>host</title>
<style>html,body{margin:0;height:100%;background:#0B0820}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="game" src="${src}" allow="autoplay; fullscreen; gamepad" title="Pink Paw Knight"></iframe>
<script>
  window.__msgs = [];
  const f = document.getElementById('game');
  addEventListener('message', (e) => { if (e.source === f.contentWindow) window.__msgs.push({ origin: e.origin, data: e.data }); });
  window.__send = (m) => f.contentWindow.postMessage(Object.assign({ ns: '${NS}', v: 1 }, m), '${gameOrigin}');
</script></body></html>`;
}

/** Open the fake host at `hostOrigin` framing base?embed=1. Returns { page, frame, context, errors, close }. */
async function openHost(t, hostOrigin) {
  const context = await t.browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  const gameOrigin = new URL(t.base).origin;
  const src = `${t.base}?embed=1`;
  await page.route(`${hostOrigin}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: hostHtml(src, gameOrigin) }));
  await page.goto(`${hostOrigin}/host`, { timeout: BOOT });
  let frame = null;
  const t0 = Date.now();
  while (!frame && Date.now() - t0 < 30000) { frame = page.frames().find((f) => f.url().includes('embed=1')) ?? null; if (!frame) await page.waitForTimeout(100); }
  if (!frame) throw new Error('the game frame never appeared');
  // booted = the splash is gone (Game.boot drops it after the title level loads)
  await frame.waitForFunction(() => !document.getElementById('splash'), null, { timeout: BOOT, polling: 250 });
  return { page, frame, context, errors, gameOrigin, close: () => context.close().catch(() => {}) };
}

const msgs = (h) => h.page.evaluate(() => window.__msgs);
async function waitMsg(h, pred, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const m = (await msgs(h)).find(pred);
    if (m) return m;
    await h.page.waitForTimeout(100);
  }
  return null;
}

export default [
  {
    name: 'embed:bridge', order: 4, level: null, timeout: 360000,
    async run(t) {
      const h = await openHost(t, GOOD_HOST);
      try {
        const env = await h.frame.evaluate(() => ({ embed: document.documentElement.dataset.embed ?? null, hooks: typeof window.__GAME__, gui: !!document.querySelector('.lil-gui') }));
        t.assert(env.embed === '1', `<html data-embed="1"> in the frame (got ${env.embed})`);
        t.assert(env.hooks === 'undefined' && !env.gui, `embed mode never installs debug hooks (__GAME__ ${env.hooks}, lil-gui ${env.gui})`);
        await h.page.evaluate(() => window.__send({ type: 'hello' }));
        const ready = await waitMsg(h, (m) => m.data?.ns === NS && m.data.type === 'ready');
        t.assert(!!ready, 'hello → ready');
        if (ready) {
          t.assert(ready.data.version === 1 && ready.data.v === 1, `ready carries version 1 (${JSON.stringify(ready.data)})`);
          t.assert(ready.origin === h.gameOrigin, `posted from the game origin (${ready.origin})`);
        }
        await h.page.evaluate(() => window.__send({ type: 'session', signedIn: true }));
        await h.page.evaluate(() => window.__send({ type: 'audio', muted: true }));
        await h.page.evaluate(() => window.__send({ type: 'pause' }));
        const paused = await waitMsg(h, (m) => m.data?.type === 'paused' && m.data.paused === true);
        t.assert(!!paused, 'pause → paused { paused: true }');
        await t.wait(400);
        const shot = path.join(t.shotsDir, 'embed', 'paused.png');
        fs.mkdirSync(path.dirname(shot), { recursive: true });
        await h.page.screenshot({ path: shot });
        await h.page.evaluate(() => window.__send({ type: 'resume' }));
        const resumed = await waitMsg(h, (m) => m.data?.type === 'paused' && m.data.paused === false);
        t.assert(!!resumed, 'resume → paused { paused: false }');
        await h.page.evaluate(() => window.__send({ type: 'launch' }));   // unknown type: ignored, no error
        const all = await msgs(h);
        t.assert(all.every((m) => m.origin === h.gameOrigin && m.data?.ns === NS), 'every message is a v1 envelope from the game origin');
        t.log(`messages: ${all.map((m) => m.data.type + (m.data.type === 'paused' ? `:${m.data.paused}` : '')).join(', ')}`);
        // F5: lose the WebGL context → the "Tap to continue" panel
        const lost = await h.frame.evaluate(() => {
          const c = document.getElementById('game-canvas');
          const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
          const ext = gl?.getExtension('WEBGL_lose_context');
          if (!ext) return false;
          ext.loseContext();
          return true;
        });
        if (!lost) t.warn('WEBGL_lose_context unavailable: context-loss overlay not checked');
        else {
          const shown = await h.frame.waitForFunction(() => !!document.getElementById('recovery-context'), null, { timeout: 10000 }).then(() => true, () => false);
          t.assert(shown, 'context lost → recovery panel');
          if (shown) {
            const p = await h.frame.evaluate(() => { const el = document.getElementById('recovery-context'); const b = el.querySelector('button'); return { role: el.getAttribute('role'), btn: b?.textContent, focused: document.activeElement === b }; });
            t.assert(p.role === 'alertdialog' && !!p.btn && p.focused, `accessible panel ${JSON.stringify(p)}`);
            await h.page.screenshot({ path: path.join(t.shotsDir, 'embed', 'context-lost.png') });
          }
        }
        for (const e of h.errors) t.fail(`[embed frame] ${e}`);
      } finally { await h.close(); }
    },
  },
  {
    name: 'embed:wrong-origin', order: 4, level: null, timeout: 360000,
    async run(t) {
      const h = await openHost(t, BAD_HOST);
      try {
        for (let i = 0; i < 6; i++) { await h.page.evaluate(() => window.__send({ type: 'hello' })); await t.wait(250); }
        await h.page.evaluate(() => window.__send({ type: 'pause' }));
        await t.wait(1500);
        const all = await msgs(h);
        t.assert(all.length === 0, `a non-allowed origin gets nothing back (${all.length} messages)`);
        const hooks = await h.frame.evaluate(() => typeof window.__GAME__);
        t.assert(hooks === 'undefined', 'no hooks in the frame');
        for (const e of h.errors) t.fail(`[embed frame] ${e}`);
      } finally { await h.close(); }
    },
  },
  {
    name: 'embed:level-retry', order: 5, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      const page = t.page;
      // the vite:preloadError guard would reload once: pretend it just did, so the Retry path is what runs
      await page.evaluate(() => { try { sessionStorage.setItem('pawsbury.preloadReloadAt', String(Date.now())); } catch { /* */ } });
      const pattern = /\/(levels\/)?forest(-[\w-]+)?\.js(\?.*)?$/;
      const block = (r) => r.abort('aborted');
      await page.route(pattern, block);
      let res;
      try { res = await t.G(async () => { const r = await window.__GAME__.ctx.levels.load('forest', 'start'); return { ok: !!r, cur: window.__GAME__.ctx.levels.current?.id ?? null, err: window.__GAME__.ctx.levels.lastError ?? null }; }); }
      finally { await page.unroute(pattern, block); }
      t.assert(res && !res.ok && res.cur === 'meadow', `failed forest import keeps meadow (${JSON.stringify(res)})`);
      const panel = await page.evaluate(() => { const el = document.getElementById('recovery-level'); return el ? el.querySelector('button')?.textContent ?? '' : null; });
      t.assert(panel != null, 'Retry panel shown');
      const loading = await t.G(() => window.__GAME__.ctx.levels.loading);
      t.assert(loading === false, 'not stuck loading');
      await t.shot('embed/level-retry');
      if (panel != null) {
        // a failed module import is cached by the browser, so Retry saves and reloads the page (stubbed here)
        const err = await t.G(() => window.__GAME__.ctx.levels.lastError?.message ?? '');
        await t.G(() => { const L = window.__GAME__.ctx.levels; window.__reloads = 0; L.__origReload = L._reload; L._reload = () => { window.__reloads++; }; });
        await page.click('#recovery-level button');
        await t.wait(300);
        const r = await t.G(() => ({ reloads: window.__reloads, cur: window.__GAME__.ctx.levels.current?.id, panel: !!document.getElementById('recovery-level') }));
        if (/dynamically imported module|Importing a module script failed/i.test(err)) t.assert(r.reloads === 1 && !r.panel, `Retry after a failed import reloads (${JSON.stringify(r)})`);
        else t.log(`Retry re-queued the load (${JSON.stringify(r)})`);
        await t.G(() => { const L = window.__GAME__.ctx.levels; L._reload = L.__origReload; });
      }
      await t.G(() => document.getElementById('recovery-level')?.remove());
      // the browser caches the failed forest import for this page's lifetime: start the next blocks on a fresh page
      await page.reload({ timeout: BOOT });
      await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: BOOT });
    },
  },
  {
    // the host's "Back to games" button owns the frame's top-left corner (6 px in, 44 px: tokentails SwordcatHost), so in
    // embed mode no HUD element may sit there, at desktop and phone sizes; the base 4 hearts stay on one row
    name: 'embed:hud-corner', order: 5.5, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      const page = t.page, CORNER = 6 + 44;
      await t.G(() => { const g = window.__GAME__; document.documentElement.dataset.embed = '1'; g.setMode('play'); g.ctx.cam.mode('follow', { blend: 0 }); });
      try {
        // the last two: no embed (the hearts meet ❚❚ on a narrow phone: they shrink to one row instead of wrapping)
        for (const [w, h, touch, emb = true] of [[1280, 720, false], [390, 844, true], [360, 740, true], [844, 390, true], [390, 844, true, false], [360, 740, true, false]]) {
          await page.setViewportSize({ width: w, height: h });
          await t.G(([tc, em]) => { const c = window.__GAME__.ctx; if (em) document.documentElement.dataset.embed = '1'; else delete document.documentElement.dataset.embed; c.input?.setDevice?.(tc ? 'touch' : 'kbm'); }, [touch, emb]);
          await t.frames(40);
          const r = await page.evaluate(() => {
            const box = (el) => { const b = el?.getBoundingClientRect(); return b && b.width > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
            const hearts = [...document.querySelectorAll('.hud-hearts .heart')].map((e) => Math.round(e.getBoundingClientRect().top));
            const els = [...document.querySelectorAll('.hud-tl, .hud-tr, .hud-tc .is-on, .hud-portrait, .hud-hearts, .ui-hint.is-on, .tb-pause')].map((e) => ({ c: e.className.split(' ')[0], b: box(e) })).filter((x) => x.b);
            return { hearts, els, hidden: document.querySelector('.hud')?.classList.contains('is-hidden') };
          });
          const hit = r.els.filter((x) => x.b.l < CORNER && x.b.t < CORNER);
          t.log(`${w}×${h}${touch ? ' touch' : ''}${emb ? '' : ' (no embed)'}: hearts rows ${new Set(r.hearts).size}, corner hits ${hit.map((x) => x.c).join(',') || 'none'}`);
          if (emb) t.assert(!hit.length, `${w}×${h}: nothing in the host button's corner (${JSON.stringify(hit)})`);
          t.assert(r.hearts.length >= 4 && new Set(r.hearts).size === 1, `${w}×${h}: the hearts sit on one row (${r.hearts})`);
          // the touch fit runs at 4 Hz: it must stay put (a stale setVar cache dropped --heart-w every other pass)
          const rows = [];
          for (let i = 0; i < 6; i++) { await t.wait(260); rows.push(await page.evaluate(() => new Set([...document.querySelectorAll('.hud-hearts .heart')].map((e) => Math.round(e.getBoundingClientRect().top))).size)); }
          t.assert(rows.every((n) => n === 1), `${w}×${h}: one row on every fit pass (${rows})`);
          await t.shot(`embed/hud-corner-${w}x${h}${emb ? '' : '-plain'}`);
        }
      } finally {
        await t.G(() => { delete document.documentElement.dataset.embed; window.__GAME__.ctx.input?.setDevice?.('kbm'); });
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    },
  },
  {
    name: 'embed:production', order: 6, level: null, timeout: 300000,
    async run(t) {
      if (!t.preview) { t.log('skipped (dev server: hooks are on by design; runs against the dist/ preview)'); return; }
      const dist = path.join(t.root, 'dist', 'index.html');
      if (!fs.existsSync(dist)) { t.warn('dist/ missing (npm run build): production hook check skipped'); return; }
      const { preview } = await import('vite');
      const port = 4174;
      const server = await preview({ root: t.root, build: { outDir: 'dist' }, preview: { port, strictPort: true }, logLevel: 'warn' });
      const context = await t.browser.newContext({ viewport: { width: 1280, height: 720 } });
      try {
        const pg = await context.newPage();
        const errors = [];
        pg.on('pageerror', (e) => errors.push(e.message));
        await pg.goto(`http://localhost:${port}/?debug&test=1&perf&level=gate&spawn=boss`, { timeout: BOOT });
        await pg.waitForFunction(() => !document.getElementById('splash'), null, { timeout: BOOT, polling: 250 });
        await pg.waitForTimeout(1500);
        const r = await pg.evaluate(() => ({ hooks: typeof window.__GAME__, gui: !!document.querySelector('.lil-gui'), stats: !!document.querySelector('canvas[width="80"]') }));
        t.assert(r.hooks === 'undefined', `production ?debug&test: no window.__GAME__ (${r.hooks})`);
        t.assert(!r.gui, 'production ?debug: no lil-gui');
        const scripts = await pg.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/bundle\/debug[-.]/.test(n)));
        t.assert(scripts.length === 0, `no debug chunk requested (${scripts.join(', ')})`);
        const p = path.join(t.shotsDir, 'embed', 'production-debug-ignored.png');
        await pg.screenshot({ path: p });
        for (const e of errors) t.fail(`[production] pageerror: ${e}`);
      } finally {
        await context.close().catch(() => {});
        await new Promise((r) => server.httpServer.close(r));
      }
    },
  },
];
