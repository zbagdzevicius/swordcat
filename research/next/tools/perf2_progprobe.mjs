// Why does three call getParameters every frame? Count material.needsUpdate=true callers, lights-state hash changes,
// per-material program switches, over N frames.   node perf2_progprobe.mjs <level> <spawn>
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const [level = 'meadow', spawn = 'start'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__GAME__.waitFrames(60));
const r = await page.evaluate(async () => {
  const G = window.__GAME__, THREE = G.THREE, ctx = G.ctx, R = ctx.renderer;
  const desc = Object.getOwnPropertyDescriptor(THREE.Material.prototype, 'needsUpdate');
  const callers = new Map();
  Object.defineProperty(THREE.Material.prototype, 'needsUpdate', { configurable: true, get: desc.get, set(v) {
    if (v === true) { const s = (new Error().stack.split('\n')[2] ?? '').trim().replace(/\(.*\/bundle\//, '(').replace(/\?[^:]*/, ''); callers.set(s, (callers.get(s) ?? 0) + 1); }
    desc.set.call(this, v);
  } });
  // program switches: per object, per frame, compare renderer.properties.get(material).currentProgram
  const progOf = new Map(); let switches = 0; const switchMats = new Map();
  const N = 120; const f0 = G.frame;
  const sample = () => { ctx.scene.traverseVisible((o) => { if (!o.material) return; for (const m of [].concat(o.material)) {
    const p = R.properties.get(m), cp = p.currentProgram; const prev = progOf.get(m);
    if (prev && cp && prev !== cp) { switches++; const k = (m.type + ':' + (m.name || o.name || '?')); switchMats.set(k, (switchMats.get(k) ?? 0) + 1); }
    if (cp) progOf.set(m, cp); } }); };
  const off = G.game.addFrameHook(sample);
  // light-state version
  let lsv = [], lights = [];
  const off2 = G.game.addFrameHook(() => { let n = 0, vis = 0, cast = 0; ctx.scene.traverse((o) => { if (o.isLight) { n++; if (o.visible) { vis++; if (o.castShadow) cast++; } } }); lights.push(`${n}/${vis}/${cast}`); });
  await G.waitFrames(N); off(); off2();
  Object.defineProperty(THREE.Material.prototype, 'needsUpdate', desc);
  const uniq = [...new Set(lights)];
  return { frames: G.frame - f0, needsUpdateCallers: [...callers].sort((a, b) => b[1] - a[1]).slice(0, 15), programSwitches: switches, switchMats: [...switchMats].sort((a, b) => b[1] - a[1]).slice(0, 15), lightCounts_total_visible_cast: uniq.slice(0, 10), programs: R.info.programs.length };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
