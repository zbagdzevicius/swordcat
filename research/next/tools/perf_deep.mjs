// research/next/tools/perf_deep.mjs — deep dive for one scenario: (1) CDP sampling CPU profile → top self-time functions
// and top files, (2) loop stopped, isolated renderer.render() CPU-submit vs GPU-drain microbench with toggles,
// (3) EXT_disjoint_timer_query_webgl2 GPU timing if exposed.
// Usage: node research/next/tools/perf_deep.mjs --level=meadow --spawn=start [--preset=med] [--mobile] [--combat]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg('base', 'http://localhost:5801/');
const LEVEL = arg('level', 'meadow'), SPAWN = arg('spawn', 'start'), PRESET = arg('preset', 'med');
const MOBILE = has('mobile'), COMBAT = has('combat');
const TAG = arg('tag', `${MOBILE ? 'mobile' : 'desktop'}_${PRESET}_${LEVEL}${COMBAT ? '_combat' : ''}`);
const OUT = path.join(HERE, `deep_${TAG}.json`);

const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info'] });
const bctx = await browser.newContext(MOBILE ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await bctx.newPage();
const cdp = await bctx.newCDPSession(page);
if (MOBILE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +arg('throttle', 4) });
await page.goto(`${BASE}?test=1&seed=1&mute=1&quality=${PRESET}&level=${LEVEL}&spawn=${SPAWN}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
await page.evaluate(async ([flags]) => {
  const g = window.__GAME__;
  if (flags) for (const [k, v] of Object.entries(flags)) g.story.flag(k, v);
  g.story.skip(); g.skipDialog?.(); g.setMode('play'); g.god(true);
}, [SPAWN === 'hub' ? { 'town.free': true } : null]);
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__GAME__; g.story.skip(); g.skipDialog?.(); if (g.mode !== 'play') g.setMode('play'); });
if (COMBAT) {
  await page.evaluate(() => { const g = window.__GAME__, p = g.ctx.player.pos; const L = [['rat_pike', 3], ['rat_xbow', 2], ['crow', 2]]; let i = 0;
    for (const [t, n] of L) for (let k = 0; k < n; k++) { const a = (i++ / 7) * Math.PI * 2; g.spawn(t, p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6); } });
  await page.waitForTimeout(1500);
}
const out = { tag: TAG };

// ---- (1) sampling profile, 5 s
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const endAt = Date.now() + 5000;
while (Date.now() < endAt) { if (COMBAT) await page.keyboard.press('KeyJ'); await page.waitForTimeout(220); }
const { profile } = await cdp.send('Profiler.stop');
{
  const self = new Map(), byFile = new Map(), byArea = new Map();
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  let total = 0;
  for (const n of profile.nodes) {
    const t = (dt.get(n.id) ?? 0) / 1000; total += t;
    const cf = n.callFrame, file = (cf.url || '').replace(/^.*?\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '');
    const key = `${cf.functionName || '(anon)'} @ ${file}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + t);
    byFile.set(file || cf.functionName, (byFile.get(file || cf.functionName) ?? 0) + t);
    const area = /^src\/([a-z]+)\//.exec(file)?.[1] ?? (file.includes('three') ? 'three' : (file ? 'other' : cf.functionName));
    byArea.set(area, (byArea.get(area) ?? 0) + t);
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1), +(100 * v / total).toFixed(1)]);
  out.profile = { totalMs: +total.toFixed(0), topSelf: top(self, 45), topFiles: top(byFile, 30), byArea: top(byArea, 20) };
}

// ---- (2) isolated render microbench (loop stopped; GPU drained before each measurement)
out.bench = await page.evaluate(async () => {
  const g = window.__GAME__.game, ctx = g.ctx, r = ctx.renderer, gl = r.getContext(), px = new Uint8Array(4);
  const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  g.loop.stop();
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(2); };
  const run = async (label, fn, n = 24) => {
    const cpu = [], gpu = [], tot = [], tqv = [];
    for (let i = 0; i < n; i++) {
      drain();
      let q = null;
      if (tq) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
      const a = performance.now(); fn(); const b = performance.now();
      if (q) gl.endQuery(tq.TIME_ELAPSED_EXT);
      drain(); const c = performance.now();
      cpu.push(b - a); gpu.push(c - b); tot.push(c - a);
      if (q) { await new Promise((res) => setTimeout(res, 30)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(tq.GPU_DISJOINT_EXT)) tqv.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
    }
    return { label, cpuSubmit: med(cpu), drainAfter: med(gpu), total: med(tot), timerQuery: tqv.length ? med(tqv) : null };
  };
  const res = { timerQuery: !!tq, rows: [] };
  const full = () => ctx.postfx.render(1 / 60);
  const sceneOnly = () => { r.setRenderTarget(null); r.render(ctx.scene, ctx.camera); };
  res.rows.push(await run('full frame (postfx.render)', full));
  res.rows.push(await run('scene only → canvas (no post)', sceneOnly));
  const sm = r.shadowMap.autoUpdate;
  r.shadowMap.autoUpdate = false;
  res.rows.push(await run('scene only, shadow map not re-rendered', sceneOnly));
  r.shadowMap.autoUpdate = sm;
  // a frame of game update without render
  res.rows.push(await run('systems: render() hooks only (no GL)', () => { for (const [, s] of g.renderList) s.render?.(1, 1 / 60); }));
  res.rows.push(await run('systems: 1 fixed step', () => g.step(1 / 60)));
  // per-category scene cost: hide one group at a time
  const groups = new Map();
  for (const c of ctx.scene.children) groups.set(c.name || c.type, c);
  for (const [name, obj] of groups) {
    if (!obj.visible || obj.isCamera || obj.isLight) continue;
    obj.visible = false;
    const row = await run(`scene minus top-level "${name}"`, sceneOnly, 12);
    obj.visible = true;
    res.rows.push(row);
  }
  // pixel cost: half resolution
  const pf = ctx.postfx, d0 = pf.dpr;
  pf.dpr = d0 * 0.5; pf.setSize(pf.width, pf.height);
  res.rows.push(await run('full frame @ 0.5× dpr', full));
  pf.dpr = d0; pf.setSize(pf.width, pf.height);
  // program/material state
  res.programs = r.info.programs.length;
  res.programNames = r.info.programs.map((p) => p.name).reduce((m, n) => { m[n] = (m[n] ?? 0) + 1; return m; }, {});
  res.topLevel = [...groups.keys()];
  let tris = 0, n = 0; const heavy = [];
  ctx.scene.traverse((o) => { if (o.isMesh && o.geometry) { const g2 = o.geometry; const t = (g2.index ? g2.index.count : g2.attributes.position.count) / 3; const inst = o.isInstancedMesh ? o.count : 1; tris += t * inst; n++; heavy.push([o.name || o.parent?.name || o.type, Math.round(t), inst, o.material?.type, o.castShadow ? 'cast' : '', o.frustumCulled ? '' : 'noCull']); } });
  res.meshTotal = n; res.trisTotalScene = Math.round(tris);
  res.heaviestGeom = heavy.sort((a, b) => b[1] * b[2] - a[1] * a[2]).slice(0, 25);
  g.loop.start();
  return res;
});
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.profile.byArea), '\n', out.bench.rows.map((r) => `${r.label}: cpu ${r.cpuSubmit} drain ${r.drainAfter} total ${r.total} tq ${r.timerQuery}`).join('\n'));
await browser.close();
