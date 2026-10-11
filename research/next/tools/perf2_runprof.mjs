// Gameplay CPU profile (self + inclusive time by ORIGINAL source function via the build's sourcemaps).
//   node perf2_runprof.mjs <level> <spawn> [secs] [--rats=N] [--cpu=4]
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const [level = 'meadow', spawn = 'start', secsArg = '6'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const RATS = +(process.argv.find((a) => a.startsWith('--rats='))?.slice(7) ?? 0);
const CPU = +(process.argv.find((a) => a.startsWith('--cpu='))?.slice(6) ?? 1);
const DIST = path.join(import.meta.dirname, 'dist_perf2', 'bundle');

// --- sourcemap lookup
const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const maps = new Map();
function loadMap(file) {
  if (maps.has(file)) return maps.get(file);
  let m = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DIST, file + '.map'), 'utf8'));
    const lines = []; let src = 0, sl = 0, sc = 0, nm = 0;
    for (const ln of j.mappings.split(';')) {
      const segs = []; let col = 0;
      if (ln) for (const s of ln.split(',')) {
        const v = []; let x = 0, sh = 0;
        for (const ch of s) { let d = B.indexOf(ch); const c = d & 32; d &= 31; x += d << sh; if (c) sh += 5; else { v.push(x & 1 ? -(x >> 1) : x >> 1); x = 0; sh = 0; } }
        col += v[0]; if (v.length > 1) { src += v[1]; sl += v[2]; sc += v[3]; if (v.length > 4) nm += v[4]; segs.push([col, src, sl, v.length > 4 ? nm : -1]); }
      }
      lines.push(segs);
    }
    m = { lines, sources: j.sources, names: j.names ?? [] };
  } catch { m = null; }
  maps.set(file, m); return m;
}
function orig(url, line, col) {
  const file = url.replace(/.*\/bundle\//, '').replace(/\?.*/, '');
  const m = loadMap(file); if (!m) return null;
  const segs = m.lines[line]; if (!segs) return null;
  let lo = 0, hi = segs.length - 1, best = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (segs[mid][0] <= col) { best = segs[mid]; lo = mid + 1; } else hi = mid - 1; }
  if (!best) return null;
  return `${m.sources[best[1]].replace(/.*\/(src|node_modules)\//, '$1/')}:${best[2] + 1}`;
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctxB = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctxB.newPage(); const cdp = await ctxB.newCDPSession(page);
await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
if (RATS) await page.evaluate((n) => { const G = window.__GAME__; G.god(true); const p = G.ctx.player.pos; for (let i = 0; i < n; i++) G.spawn(i % 2 ? 'rat_pike' : 'rat_xbow', p.x + Math.sin(i) * 6, p.z + Math.cos(i) * 6); }, RATS);
await page.evaluate(() => window.__GAME__.waitFrames(120));
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
const f0 = await page.evaluate(() => window.__GAME__.frame);
await page.waitForTimeout(+secsArg * 1000);
const f1 = await page.evaluate(() => window.__GAME__.frame);
const { profile } = await cdp.send('Profiler.stop');
await browser.close();

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const selfT = new Map(); let i = 0, total = 0;
for (const s of profile.samples) { const d = profile.timeDeltas[i++] ?? 0; selfT.set(s, (selfT.get(s) ?? 0) + d); total += d; }
const key = (n) => { const f = n.callFrame; if (!f.url) return f.functionName || '(native)'; return `${f.functionName || '(anon)'} @ ${orig(f.url, f.lineNumber, f.columnNumber) ?? f.url.replace(/.*\//, '') + ':' + (f.lineNumber + 1)}`; };
const self = new Map(), incl = new Map();
for (const [id, us] of selfT) {
  const n = byId.get(id); const k = key(n); self.set(k, (self.get(k) ?? 0) + us);
  const seen = new Set(); let cur = id;
  while (cur != null) { const kk = key(byId.get(cur)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + us); } cur = parent.get(cur); }
}
const frames = f1 - f0, perF = (us) => (us / 1000 / frames).toFixed(2);
console.log(`${level}/${spawn} rats=${RATS} cpu=${CPU}x: ${frames} frames in ${secsArg}s (${(frames / +secsArg).toFixed(1)} fps); profiled ${(total / 1000).toFixed(0)} ms. Values = ms per rendered frame.`);
console.log('--- TOP SELF'); console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => `${perF(v)}  ${k}`).join('\n'));
console.log('--- TOP INCLUSIVE (game code)'); console.log([...incl].filter(([k]) => /@ src\//.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => `${perF(v)}  ${k}`).join('\n'));
