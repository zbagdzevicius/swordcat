// perf_2 measurements: startup phases, per-system CPU ms, allocation sampling. Run perf2_serve.mjs first.
//   node perf2_measure.mjs [startup|runtime|all] [--net=4g] [--cpu=4]
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const MODE = process.argv[2] ?? 'all';
const NET = process.argv.find((a) => a.startsWith('--net='))?.slice(6);
const CPU = +(process.argv.find((a) => a.startsWith('--cpu='))?.slice(6) ?? 1);
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const ARGS = ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];

const INIT = () => {
  performance.setResourceTimingBufferSize(10000);
  const marks = (window.__PERF2 = { t: {}, ev: [], init: {}, gltf: [], lv: [] });
  const mark = (k) => { if (marks.t[k] == null) marks.t[k] = Math.round(performance.now()); };
  document.addEventListener('DOMContentLoaded', () => mark('dcl'));
  let api;
  Object.defineProperty(window, '__GAME__', { configurable: true, get: () => api, set: (v) => {
    api = v; mark('debugInstalled'); const g = v.game, ctx = v.ctx;
    ctx.bus.tap((type) => { if (/^(game:|level:|cutscene:start)/.test(type)) marks.ev.push([type, Math.round(performance.now())]); });
    for (const [k, s] of g.systems) if (s.init) { const o = s.init.bind(s); s.init = async (...a) => { const t = performance.now(); try { return await o(...a); } finally { marks.init[k] = Math.round(performance.now() - t); } }; }
    const wrapA = (obj, name, key) => { const o = obj[name].bind(obj); obj[name] = async (...a) => { const t = performance.now(); try { return await o(...a); } finally { marks.lv.push([key, Math.round(t), Math.round(performance.now() - t)]); } }; };
    wrapA(ctx.assets, 'preloadLevel', 'preload'); wrapA(ctx.levels, '_prewarm', 'prewarm');
    const sl = ctx.physics.setLevel.bind(ctx.physics); ctx.physics.setLevel = (...a) => { const t = performance.now(); const r = sl(...a); marks.lv.push(['physics.setLevel', Math.round(t), Math.round(performance.now() - t)]); return r; };
    const gl = ctx.assets.gltfLoader; const la = gl.loadAsync.bind(gl); gl.loadAsync = async (u, ...r) => { const t = performance.now(); const x = await la(u, ...r); marks.gltf.push([u.replace(/.*assets\//, ''), Math.round(t), Math.round(performance.now() - t)]); return x; };
  } });
};

async function startup(browser, url, label) {
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctxB.newPage(); const cdp = await ctxB.newCDPSession(page);
  await cdp.send('Network.enable');
  if (NET === '4g') await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8, connectionType: 'cellular4g' }); // ~9 Mbps, 150 ms RTT
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.addInitScript(INIT);
  const t0 = Date.now();
  await page.goto(BASE + url, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 50 });
  const wall = Date.now() - t0;
  const r = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const by = {}; let total = 0;
    for (const e of res) { const k = e.name.split('?')[0].split('.').pop(); const b = e.transferSize || e.encodedBodySize; by[k] = (by[k] ?? 0) + b; total += b; }
    const nav = performance.getEntriesByType('navigation')[0];
    return { marks: window.__PERF2, ready: Math.round(performance.now()), nav: { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) },
      bytes: { total: Math.round(total / 1024) + 'K', ...Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1024) + 'K'])) }, nres: res.length,
      heap: Math.round(performance.memory?.usedJSHeapSize / 1048576) + 'MB' };
  });
  r.marks.gltf.sort((a, b) => b[2] - a[2]); r.marks.gltf = r.marks.gltf.slice(0, 10);
  console.log(`\n=== STARTUP ${label} (${url}) net=${NET ?? 'none'} cpu=${CPU}x wall=${wall}ms`);
  console.log(JSON.stringify(r, null, 0));
  await ctxB.close();
}

async function runtime(browser, level, spawn, label, setup) {
  const ctxB = await browser.newContext({ viewport: { width: +(process.env.VW ?? 1920), height: +(process.env.VH ?? 1080) } });
  const page = await ctxB.newPage(); const cdp = await ctxB.newCDPSession(page);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
  if (setup) await page.evaluate(setup);
  await page.evaluate(() => window.__GAME__.waitFrames(120));
  await page.evaluate(() => {
    const g = window.__GAME__.game, ctx = g.ctx; const acc = (window.__SYS = { u: {}, r: {}, frames: 0, steps: 0, post: 0, frame: [], step: 0 });
    for (const [k, s] of g.stepList) { const o = s.update.bind(s); s.update = (dt) => { const t = performance.now(); o(dt); acc.u[k] = (acc.u[k] ?? 0) + performance.now() - t; }; }
    for (const [k, s] of g.renderList) if (s.render) { const o = s.render.bind(s); s.render = (a, f) => { const t = performance.now(); o(a, f); acc.r[k] = (acc.r[k] ?? 0) + performance.now() - t; }; }
    const pr = ctx.postfx.render.bind(ctx.postfx); ctx.postfx.render = (f) => { const t = performance.now(); pr(f); acc.post += performance.now() - t; };
    const st = g.step.bind(g); g.step = (dt) => { const t = performance.now(); st(dt); acc.step += performance.now() - t; acc.steps++; };
    const fr = g.frame.bind(g); g.frame = (a, f) => { const t = performance.now(); fr(a, f); acc.frame.push(performance.now() - t); acc.frames++; };
    const lp = g.loop; const adv = lp.advance.bind(lp); acc.adv = []; lp.advance = (dt) => { const t = performance.now(); adv(dt); acc.adv.push(performance.now() - t); };
    const em = ctx.bus.emit.bind(ctx.bus); acc.emits = {}; ctx.bus.emit = (type, p) => { acc.emits[type] = (acc.emits[type] ?? 0) + 1; return em(type, p); };
  });
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send('Performance.enable'); const m0 = await cdp.send('Performance.getMetrics');
  const tW = Date.now();
  await page.evaluate(() => window.__GAME__.waitFrames(600));
  const secs = (Date.now() - tW) / 1000;
  const prof = await cdp.send('HeapProfiler.stopSampling');
  const m1 = await cdp.send('Performance.getMetrics');
  const met = (m, k) => m.metrics.find((x) => x.name === k)?.value ?? 0;
  const r = await page.evaluate(() => {
    const a = window.__SYS, f = a.frames, adv = a.adv.slice().sort((x, y) => x - y), n = adv.length;
    const per = (o, d) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, +(v / d).toFixed(3)]));
    const G = window.__GAME__, info = G.ctx.renderer.info;
    let objs = 0, vis = 0; G.ctx.scene.traverse(() => objs++); G.ctx.scene.traverseVisible(() => vis++);
    return { frames: f, steps: a.steps, stepMs: +(a.step / a.steps).toFixed(3), cpuFrameMs_avg: +(a.adv.reduce((s, v) => s + v, 0) / n).toFixed(2), cpuFrameMs_p95: +adv[Math.floor(n * 0.95)].toFixed(2), cpuFrameMs_p99: +adv[Math.floor(n * 0.99)].toFixed(2), cpuFrameMs_max: +adv[n - 1].toFixed(1),
      updatePerStep: per(a.u, a.steps), renderPerFrame: per(a.r, f), postfxRenderPerFrame: +(a.post / f).toFixed(2),
      emitsPerSec: Object.fromEntries(Object.entries(a.emits).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => [k, +(v / (f / 60)).toFixed(1)])),
      state: G.state(), mem: { geo: info.memory.geometries, tex: info.memory.textures, progs: info.programs?.length }, actors: G.ctx.actors.count, objs, vis };
  });
  const self = new Map(); let total = 0;
  const walk = (nd) => { const s = nd.selfSize; if (s) { const fr = nd.callFrame; const k = `${fr.functionName || '(anon)'} ${fr.url.replace(/.*\/(bundle)\//, '$1/').replace(/\?.*/, '')}:${fr.lineNumber + 1}:${fr.columnNumber + 1}`; self.set(k, (self.get(k) ?? 0) + s); total += s; } nd.children.forEach(walk); };
  walk(prof.profile.head);
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / secs / 1024).toFixed(1)}KB/s ${k}`);
  console.log(`\n=== RUNTIME ${label} (${level}/${spawn}) cpu=${CPU}x  ${secs.toFixed(1)}s wall for 600 frames`);
  console.log(JSON.stringify(r));
  console.log(`alloc ~${(total / secs / 1024).toFixed(0)} KB/s sampled. ScriptDuration ${(met(m1, 'ScriptDuration') - met(m0, 'ScriptDuration')).toFixed(2)}s TaskDuration ${(met(m1, 'TaskDuration') - met(m0, 'TaskDuration')).toFixed(2)}s over ${secs.toFixed(1)}s; heap ${(met(m1, 'JSHeapUsedSize') / 1048576).toFixed(0)}MB`);
  console.log(top.join('\n'));
  await ctxB.close();
}

const browser = await chromium.launch({ headless: true, args: ARGS });
try {
  if (MODE === 'startup' || MODE === 'all') await startup(browser, '?test&level=meadow&spawn=title', 'title-cold');
  if (MODE === 'runtime' || MODE === 'all') {
    const runs = [
      ['meadow', 'start', 'meadow-idle'],
      ['meadow', 'start', 'meadow-8rats', () => { const G = window.__GAME__; G.god(true); const p = G.ctx.player.pos; for (let i = 0; i < 8; i++) G.spawn(i % 2 ? 'rat_pike' : 'rat_xbow', p.x + Math.sin(i) * 6, p.z + Math.cos(i) * 6); }],
      ['town', 'start', 'town'],
      ['forest', 'start', 'forest'],
    ];
    for (const [l, s, lab, set] of runs) if (!ONLY || lab.includes(ONLY)) await runtime(browser, l, s, lab, set);
  }
} finally { await browser.close(); }
