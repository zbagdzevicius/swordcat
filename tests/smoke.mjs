// tests/smoke.mjs  (owner: core) — Playwright smoke harness (tech.md §19.4 + GAME_DESIGN §19.9).
//
//   npm run build && npm run smoke                       # vite preview on :4173 (dist/ must exist)
//   SMOKE_URL=http://localhost:5301/ node tests/smoke.mjs   # against your own dev server (no preview started)
//   SMOKE_ONLY=core node tests/smoke.mjs                 # one area's blocks (file name), or a block name,
//   SMOKE_ONLY=core:levels,player node tests/smoke.mjs   #   comma-separated
//   flags: --headed  --swiftshader (software GL fallback)  --verbose (echo page warnings/logs); env SMOKE_GPU=gl|d3d11|swiftshader
//
// Blocks live in tests/smoke/<area>.mjs (one file per area; areas never edit this file):
//   export default [
//     { name: 'player:combo', order: 20, level: 'meadow', spawn: 'start', timeout: 60000, async run(t) { ... } },
//   ];
// Before each block with a `level` the harness skips any cutscene, resets progress to the boot defaults (settings
// kept), empties the party, despawns enemies, sets mode 'play', turns god off, loads `level`/`spawn`
// (skip with `level: null`) and clears __GAME__.events. `reload: true` reloads the page first.
// Any pageerror, console.error, failed request or HTTP ≥ 400 fails the run (attributed to the running block).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots');
const BLOCK_DIR = path.join(ROOT, 'tests', 'smoke');
const ARGS = process.argv.slice(2);
const VERBOSE = ARGS.includes('--verbose') || !!process.env.SMOKE_VERBOSE;
const ONLY = (process.env.SMOKE_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT = 4173;
const BOOT_TIMEOUT = +(process.env.SMOKE_BOOT_TIMEOUT ?? 60000);

// GPU flags (tech.md §19.1 measured d3d11; on this Iris Xe, d3d11 + the MSAA HalfFloat composer target makes
// page.screenshot progressively slower (1 s → 20 s) and can stall rAF, so ANGLE-on-OpenGL is the default:
// same real GPU, ~60 fps, ~0.5 s screenshots). Override: SMOKE_GPU=d3d11 | gl | swiftshader, or --swiftshader.
const GPU = ARGS.includes('--swiftshader') ? 'swiftshader' : (process.env.SMOKE_GPU ?? (process.platform === 'win32' ? 'gl' : 'default'));
const GPU_ARGS = {
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  d3d11: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  gl: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'],
  default: ['--enable-gpu', '--ignore-gpu-blocklist'],
}[GPU] ?? ['--enable-gpu', '--ignore-gpu-blocklist'];

// ------------------------------------------------------------------ blocks
async function loadBlocks() {
  const out = [];
  if (!fs.existsSync(BLOCK_DIR)) return out;
  for (const f of fs.readdirSync(BLOCK_DIR).filter((f) => f.endsWith('.mjs')).sort()) {
    const area = f.replace(/\.mjs$/, '');
    let mod;
    try { mod = await import(pathToFileURL(path.join(BLOCK_DIR, f)).href); } catch (e) {
      out.push({ name: `${area}:load`, area, order: -1, level: null, run: () => { throw new Error(`could not import tests/smoke/${f}: ${e.message}`); } });
      continue;
    }
    const list = Array.isArray(mod.default) ? mod.default : mod.default ? [mod.default] : [];
    for (const b of list) {
      if (!b || typeof b.run !== 'function') continue;
      out.push({ order: 100, level: 'meadow', spawn: 'start', timeout: 60000, reload: false, ...b, name: b.name ?? `${area}:${out.length}`, area, file: f });
    }
  }
  out.sort((a, b) => a.order - b.order || a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  return out;
}

const matches = (b) => ONLY.some((o) => o === b.area || o === b.name || b.name.startsWith(o + ':'));

// ------------------------------------------------------------------ run
const errors = [];
let current = 'boot';
const fail = (msg) => { errors.push(`[${current}] ${msg}`); console.error(`   ✗ ${msg}`); };

const blocks = await loadBlocks();
const selected = ONLY.length ? blocks.filter(matches) : blocks;
if (ONLY.length && !selected.length) {
  console.error(`SMOKE FAIL: SMOKE_ONLY=${ONLY.join(',')} matches no block. Known: ${blocks.map((b) => b.name).join(', ')}`);
  process.exit(1);
}

let server = null;
let base = process.env.SMOKE_URL;
if (base) { if (!base.endsWith('/')) base += '/'; }
else {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) { console.error('SMOKE FAIL: dist/ missing — run `npm run build` first (or set SMOKE_URL)'); process.exit(1); }
  const { preview } = await import('vite');
  server = await preview({ root: ROOT, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
  base = `http://localhost:${PORT}/`;
}

fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: !ARGS.includes('--headed'), args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const type = m.type();
  if (type === 'error') fail(`console.error: ${m.text()}`);
  else if (VERBOSE && (type === 'warning' || type === 'log' || type === 'info')) console.log(`   [page ${type}] ${m.text()}`);
});
page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (!f.includes('ERR_ABORTED')) fail(`requestfailed: ${r.url()} ${f}`); });
page.on('response', (r) => { if (r.status() >= 400) fail(`HTTP ${r.status()}: ${r.url()}`); });

/**
 * page.evaluate, but the result goes through __GAME__.plain() in the page first: hooks that return live objects
 * (loadLevel → LevelData, spawn → Enemy, startBoss → Arena, cam.mode → camera) would otherwise serialise the whole
 * ctx graph over the protocol (~1 s per call, stalling the game's frames). Plain data comes back unchanged.
 */
const G = async (fn, arg) => {
  const h = await page.evaluateHandle(fn, arg);
  try { return await h.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); }
  finally { h.dispose().catch(() => {}); }
};

/** The harness object every block receives. */
const t = {
  page, browser, base, args: ARGS, shotsDir: SHOTS, G,
  /**
   * Screenshot to tests/shots/<name>.png (returns the path; Read it to review). `{ freeze: true }` holds the sim
   * (time scale 0) while the screenshot is taken under GPU load, then restores the previous scale.
   */
  async shot(name, { freeze = false } = {}) {
    const p = path.join(SHOTS, `${name}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!freeze) { await page.screenshot({ path: p }); return p; }
    const prev = await G(() => { const g = window.__GAME__?.game; const s = g?.baseTimeScale ?? 1; g?.setTimeScale?.(0); return s; }).catch(() => 1);
    try { await page.screenshot({ path: p }); } finally { await G((s) => window.__GAME__?.game?.setTimeScale?.(s), prev).catch(() => {}); }
    return p;
  },
  fail,
  assert(cond, msg) { if (!cond) fail(msg); return !!cond; },
  log: (...a) => console.log('   ', ...a),
  warn: (...a) => console.warn('    WARN', ...a),
  wait: (ms) => page.waitForTimeout(ms),
  /** Wait for n rendered game frames. */
  frames: (n = 1) => G((k) => window.__GAME__.waitFrames(k), n),
  state: () => G(() => window.__GAME__.state()),
  events: () => G(() => [...window.__GAME__.events]),
  clearEvents: () => G(() => window.__GAME__.clearEvents()),
  lastEvent: (name) => G((n) => window.__GAME__.lastEvent(n), name),
  /** Resolves true when `name` is in __GAME__.events within `timeout` ms, else false. */
  async waitForEvent(name, timeout = 5000) {
    try { await page.waitForFunction((n) => window.__GAME__.events.includes(n), name, { timeout, polling: 50 }); return true; } catch { return false; }
  },
  async loadLevel(id, spawn = 'start') { await G(([i, s]) => window.__GAME__.loadLevel(i, s), [id, spawn]); await t.frames(5); },
  setMode: (m) => G((x) => window.__GAME__.setMode(x), m),
  /** Hold a key (KeyboardEvent.code) for `ms`. */
  async hold(code, ms) { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); },
  /** Tap a key `n` times, `gap` ms apart. */
  async tap(code, n = 1, gap = 120) { for (let i = 0; i < n; i++) { await page.keyboard.press(code); if (i < n - 1) await page.waitForTimeout(gap); } },
  async blankCheck(label) { const n = await G(() => window.__GAME__.sampleCanvas()); if (n < 4) fail(`${label}: canvas looks blank (${n} colours)`); return n; },
  // ---- CONTROLS_SPEC §12 core 6: iso-control helpers (world points go through the real pick path)
  /** A mouse click at world (x, z): 'right' = a move / attack / use order, 'left' = swing toward it / use. */
  click: (x, z, button = 'right', mods = {}) => G(([a, b, c, d]) => window.__GAME__.click(a, b, c, d), [x, z, button, mods]),
  /** A touch tap at world (x, z) (the player's tap orders). */
  tapAt: (x, z, kind = 'tap') => G(([a, b, c]) => window.__GAME__.tapAt(a, b, c), [x, z, kind]),
  /** Point the mouse at world (x, z) (cursor aim). */
  aimAt: (x, z) => G(([a, b]) => window.__GAME__.aimAt(a, b), [x, z]),
  /**
   * Resize the page (the iso rig re-fits). With `{ touch: true }` the main page is left alone and a separate phone
   * session is booted instead (Playwright cannot add touch to a live page): a `hasTouch` + `isMobile` context at
   * w × h, at `?test=1&seed=1`, with the same error policy as the main page. Returns that session:
   *   { page, G, shot(name), frames(n), screen(x, z, y?) → CSS px, tapAt(x, z) (a real touchscreen tap at the
   *     projected world point), touch(type, x, y, id) (a synthetic touch PointerEvent on the touch layer, for
   *     drags), close() }
   * Always `close()` it (try / finally).
   */
  async viewport(w, h, { touch = false, scale = 2, level = 'meadow', spawn = 'start' } = {}) {
    if (!touch) { await page.setViewportSize({ width: w, height: h }); await t.frames(10); return null; }
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: scale });
    const pg = await context.newPage();
    pg.on('pageerror', (e) => fail(`[${w}×${h} touch] pageerror: ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error') fail(`[${w}×${h} touch] console.error: ${m.text()}`); });
    pg.on('response', (r) => { if (r.status() >= 400) fail(`[${w}×${h} touch] HTTP ${r.status()}: ${r.url()}`); });
    const MG = async (fn, arg) => {
      const hd = await pg.evaluateHandle(fn, arg);
      try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); }
    };
    const s = {
      page: pg, context, G: MG, w, h,
      frames: (n = 1) => MG((k) => window.__GAME__.waitFrames(k), n),
      async shot(name) {
        const p = path.join(SHOTS, `${name}.png`);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        try { await pg.screenshot({ path: p }); } catch (e) { t.warn(`touch shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); }
        return p;
      },
      screen: (x, z, y) => MG(([a, b, c]) => window.__GAME__.screen(a, b, c), [x, z, y]),
      async tapAt(x, z) {
        const p = await s.screen(x, z);
        if (!p) return null;
        await pg.touchscreen.tap(Math.round(p.x), Math.round(p.y));
        return p;
      },
      touch: (type, x, y, id = 11) => MG(([tp, px, py, pid]) => {
        const caps = (window.__ptrCap ??= {});
        const el = tp === 'pointerdown'
          ? (document.elementFromPoint(px, py)?.closest?.('.tbtn, .touch-root') ?? document.querySelector('.touch-root'))
          : (caps[pid] ?? document.querySelector('.touch-root'));
        if (!el) return null;
        if (tp === 'pointerdown') caps[pid] = el;
        el.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: pid, clientX: px, clientY: py, pointerType: 'touch', isPrimary: pid === 11 }));
        if (tp === 'pointerup' || tp === 'pointercancel') delete caps[pid];
        return el.className;
      }, [type, x, y, id]),
      close: () => context.close().catch(() => {}),
    };
    await pg.goto(`${base}?test=1&seed=1`, { timeout: Math.max(BOOT_TIMEOUT, 200000) });
    await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: Math.max(BOOT_TIMEOUT, 200000) });
    if (level) {
      await MG(async ([id, sp]) => {
        const g = window.__GAME__, c = g.ctx;
        g.story.skip?.(); g.setMode('play');
        for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag?.(k, true);
        await g.loadLevel(id, sp);
        g.story.skip?.(); g.setMode('play');
        return true;
      }, [level, spawn]);
      await s.frames(10);
    }
    return s;
  },
};

async function boot() {
  current = 'boot';
  await page.goto(`${base}?test=1&seed=1`, { timeout: BOOT_TIMEOUT });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: BOOT_TIMEOUT });
  await t.shot('00-boot');
  await t.blankCheck('boot');
}

/** Keys a block may still hold down if it failed mid-way (released before the next block). */
const HELD_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL', 'KeyE', 'KeyC', 'KeyQ', 'KeyF', 'Space', 'ShiftLeft', 'AltLeft', 'Escape'];

const withTimeout = (p, ms) => {
  let id;
  return Promise.race([p, new Promise((_, rej) => { id = setTimeout(() => rej(new Error(`timed out after ${ms} ms`)), ms); })]).finally(() => clearTimeout(id));
};

const t0 = Date.now();
try {
  console.log(`smoke → ${base}  gpu=${GPU}  (${selected.length}/${blocks.length} blocks${ONLY.length ? `, SMOKE_ONLY=${ONLY.join(',')}` : ''})`);
  await boot();
  for (const b of selected) {
    current = b.name;
    const bt = Date.now();
    console.log(`▶ ${b.name}`);
    try {
      if (b.reload) { await page.reload({ timeout: BOOT_TIMEOUT }); await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: BOOT_TIMEOUT }); }
      if (b.level) {
        // hermetic blocks: every block with a `level` starts from boot-like progress (default §19.7 state, settings
        // kept, no party, no stray enemies, real-time sim, no held input), exactly as when it runs alone. Blocks
        // that chain on purpose (story:title → story:cs01) use `level: null` and keep what the previous block left.
        for (const k of HELD_KEYS) await page.keyboard.up(k).catch(() => {});
        for (const button of ['left', 'right', 'middle']) await page.mouse.up({ button }).catch(() => {});
        await G(() => {
          const g = window.__GAME__, c = g.ctx;
          g.story.skip();
          if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
          g.game.setTimeScale?.(1);
          const settings = c.state.settings;
          c.state.reset({ settings });
          c.companions?.setActive?.([]);
          for (const e of [...(c.enemies?.list ?? [])]) c.enemies.despawn?.(e);
          c.input?.setVirtualMove?.(0, 0);
          for (const a of ['guard', 'attack', 'jump', 'dodge', 'ability']) { try { c.input?._release?.(a, 'v'); } catch { /* */ } }
          // iso controls: no stale order / selection / click / zoom / drag-aim carries into the next block
          c.player?.orders?.clear?.('smoke'); c.cam?.select?.(null); c.input?.clearClicks?.(); c.input?.setVirtualAim?.(0, 0, false);
          c.input?.consumeZoom?.(); c.cam?.zoom?.(1); c.cam?.setCamLock?.(true, false); c.input?.setDevice?.('kbm');
          g.setMode('play'); g.god(false);
        });
        await t.loadLevel(b.level, b.spawn ?? 'start');
        await t.clearEvents();
      }
      await withTimeout(b.run(t), b.timeout);
    } catch (e) { fail(e?.message ?? String(e)); }
    console.log(`  ${b.name} ${((Date.now() - bt) / 1000).toFixed(1)}s`);
  }
  current = 'fps';
  const f0 = await G(() => window.__GAME__.frame); await page.waitForTimeout(1000);
  console.log('fps ~', (await G(() => window.__GAME__.frame)) - f0);
} catch (e) { fail(`smoke: ${e?.message ?? e}`); }

await browser.close();
if (server) await new Promise((r) => server.httpServer.close(r));
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s, screenshots in tests/shots/)`);
if (errors.length) { console.error('SMOKE FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('SMOKE OK');
