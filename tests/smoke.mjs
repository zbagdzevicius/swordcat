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
// Before each block the harness skips any cutscene, sets mode 'play', turns god off, loads `level`/`spawn`
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
  /** Screenshot to tests/shots/<name>.png (returns the path; Read it to review). */
  async shot(name) { const p = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: p }); return p; },
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
};

async function boot() {
  current = 'boot';
  await page.goto(`${base}?test=1&seed=1`);
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: BOOT_TIMEOUT });
  await t.shot('00-boot');
  await t.blankCheck('boot');
}

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
      if (b.reload) { await page.reload(); await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: BOOT_TIMEOUT }); }
      if (b.level) {
        await G(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); g.god(false); });
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
