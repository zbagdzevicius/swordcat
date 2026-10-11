// research/next/tools/perf_probe.mjs — design-only perf measurement (not part of the game or the smoke).
// Usage: node research/next/tools/perf_probe.mjs [--profiles=desktop,mobile] [--presets=med,low] [--scen=a,b] [--out=file.json]
// Needs a dev server: SMOKE_NOHMR=1 npx vite --port 5801 --strictPort
// Measures per scenario: frame interval (uncapped: vsync + frame-rate limit off), CPU ms per system (wrapped
// update/render), renderer submit ms (scene / shadow / bloom / output passes), GPU-synced frame ms (1-px readPixels),
// renderer.info (calls, tris, programs, geometries, textures), draw-call breakdown by owner, JS heap churn, CDP
// Performance metrics (script / style / layout), long tasks, and GPU-ablation deltas (shadows, bloom, grass, dpr).
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:5801/');
const PROFILES = arg('profiles', 'desktop,mobile').split(',');
const PRESETS = arg('presets', 'med,low').split(',');
const SCEN = arg('scen', 'meadow_idle,meadow_walk,meadow_combat,forest,town_hub,gate').split(',');
const OUT = arg('out', path.join(HERE, 'perf_results.json'));
const SAMPLE_MS = +arg('ms', 4000);
const ABLATE = arg('ablate', '1') === '1';

const GPU_ARGS = ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit',
  '--enable-precise-memory-info', '--js-flags=--expose-gc'];

const ISO = arg('iso', '0') === '1';
const SCENARIOS = {
  meadow_idle:   { level: 'meadow', spawn: 'start' },
  meadow_walk:   { level: 'meadow', spawn: 'start', walk: true },
  meadow_combat: { level: 'meadow', spawn: 'start', combat: [['rat_pike', 3], ['rat_xbow', 2], ['crow', 2]] },
  forest:        { level: 'forest', spawn: 'start' },
  town_hub:      { level: 'town', spawn: 'hub', flags: { 'town.free': true } },
  gate:          { level: 'gate', spawn: 'start' },
};

// ------------------------------------------------------------------ in-page instrumentation
function install() {
  if (window.__PERF__) return true;
  const g = window.__GAME__.game, ctx = g.ctx, r = ctx.renderer, gl = r.getContext();
  const acc = new Map();
  const add = (k, ms) => acc.set(k, (acc.get(k) ?? 0) + ms);
  // GPU timer queries (EXT_disjoint_timer_query_webgl2): one query per frame, rotating over GPU_KEYS.
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const GPU_KEYS = ['gpu.frame', 'gpu.gl.shadowMap', 'gpu.pass.0', 'gpu.pass.1', 'gpu.pass.2', 'gpu.pass.3'];
  let gpuTarget = null, gpuOpen = null, rot = 0;
  const pend = [], gpuAcc = new Map();
  const gBegin = (k) => { if (!tq || gpuTarget !== k || gpuOpen) return; const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); gpuOpen = { q, k }; };
  const gEnd = (k) => { if (!gpuOpen || gpuOpen.k !== k) return; gl.endQuery(tq.TIME_ELAPSED_EXT); pend.push(gpuOpen); gpuOpen = null; };
  const gPoll = () => {
    if (!tq) return;
    const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT);
    for (let i = pend.length - 1; i >= 0; i--) {
      const { q, k } = pend[i];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!disjoint) { const a = gpuAcc.get(k) ?? []; a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gpuAcc.set(k, a); }
      gl.deleteQuery(q); pend.splice(i, 1);
    }
  };
  const wrap = (obj, name, key) => {
    if (!obj || typeof obj[name] !== 'function' || obj[name].__perf) return;
    const f = obj[name], gk = 'gpu.' + key.replace(/^(pass\.\d+)\..*$/, '$1');
    const w = function (...a) { gBegin(gk); const t = performance.now(); try { return f.apply(this, a); } finally { add(key, performance.now() - t); gEnd(gk); } };
    w.__perf = true; obj[name] = w;
  };
  for (const [k, s] of g.stepList) wrap(s, 'update', 'step.' + k);
  for (const [k, s] of g.renderList) if (s.render) wrap(s, 'render', 'frame.' + k);
  wrap(ctx.postfx, 'update', 'post.update');
  wrap(ctx.postfx, 'render', 'post.render');
  wrap(r.shadowMap, 'render', 'gl.shadowMap');
  wrap(ctx.input, 'poll', 'input.poll');
  let hookPasses = () => {
    const c = ctx.postfx.composer;
    if (!c) return;
    c.passes.forEach((p, i) => wrap(p, 'render', `pass.${i}.${p.constructor.name}`));
  };
  // frame timing
  const ft = [], heap = [];
  let lastT = 0, frames = 0, steps = 0, sync = false, syncMs = [];
  const px = new Uint8Array(4);
  const tick0 = g.loop.tick.bind(g.loop);
  g.loop.tick = (t) => {
    gPoll();
    gpuTarget = GPU_KEYS[rot++ % GPU_KEYS.length];
    const a = performance.now();
    if (gpuTarget === 'gpu.frame') gBegin('gpu.frame');
    tick0(t);
    gEnd('gpu.frame');
    if (sync) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); syncMs.push(performance.now() - a); }
    add('tick.cpu', performance.now() - a);
    if (lastT) ft.push(t - lastT);
    lastT = t; frames++; steps += g.loop.stepsLastFrame;
    if (performance.memory) heap.push(performance.memory.usedJSHeapSize);
  };
  // long tasks
  const longT = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longT.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch { /* */ }
  // draw-call breakdown (only while armed; it costs CPU)
  const rbd = r.renderBufferDirect;
  let bd = null, bdFrames = 0;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (bd) {
      const names = [];
      for (let o = object; o && !o.isScene && names.length < 4; o = o.parent) if (o.name) names.push(o.name);
      const label = (scene === null ? 'SHADOW ' : '') + (names.slice(0, 3).reverse().join('/') || `(${object.type})`);
      const e = bd.get(label) ?? { calls: 0, inst: 0, tris: 0, mat: new Set(), dbl: 0 };
      const idx = geometry.index, cnt = idx ? idx.count : (geometry.attributes.position?.count ?? 0);
      const inst = object.isInstancedMesh ? object.count : (geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
      e.calls++; e.inst += inst; e.tris += (object.isMesh ? cnt / 3 : 0) * inst;
      e.mat.add(material.type + (material.name ? ':' + material.name : ''));
      if (material.transparent && material.side === 2 && !material.forceSinglePass) e.dbl++;
      bd.set(label, e);
    }
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
  const sceneCensus = () => {
    let meshes = 0, vis = 0, inst = 0, instances = 0, skinned = 0, pts = 0, lights = 0, plights = 0, casters = 0, transp = 0, dblTransp = 0;
    const mats = new Set();
    ctx.scene.traverseVisible((o) => {
      if (o.isLight) { lights++; if (o.isPointLight && o.intensity > 0) plights++; if (o.isPointLight) plights += 0; }
      if (!(o.isMesh || o.isPoints || o.isLine)) return;
      meshes++; vis++;
      if (o.isInstancedMesh) { inst++; instances += o.count; }
      if (o.isSkinnedMesh) skinned++;
      if (o.isPoints) pts++;
      if (o.castShadow) casters++;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        mats.add(m);
        if (m.transparent) transp++;
        if (m.transparent && m.side === 2 && !m.forceSinglePass) dblTransp++;
      }
    });
    let pAll = 0; ctx.scene.traverse((o) => { if (o.isPointLight) pAll++; });
    let objs = 0; ctx.scene.traverse(() => { objs++; });
    return { objects: objs, visibleDrawables: vis, instancedMeshes: inst, instances, skinned, points: pts, lightsVisible: lights,
      pointLightsOn: plights, pointLightsTotal: pAll, shadowCasters: casters, transparentDrawables: transp, dblSidedTransparent: dblTransp, materials: mats.size };
  };
  window.__PERF__ = {
    hookPasses,
    reset() { gpuAcc.clear(); acc.clear(); ft.length = 0; heap.length = 0; frames = 0; steps = 0; lastT = 0; longT.length = 0; syncMs.length = 0; },
    setSync(v) { sync = v; },
    armBreakdown() { bd = new Map(); bdFrames = frames; },
    takeBreakdown() {
      const nf = Math.max(1, frames - bdFrames);
      const out = [...(bd ?? new Map())].map(([k, e]) => ({ label: k, calls: +(e.calls / nf).toFixed(1), inst: Math.round(e.inst / nf), tris: Math.round(e.tris / nf), mats: [...e.mat].slice(0, 3).join(','), dbl: +(e.dbl / nf).toFixed(1) }));
      bd = null; return out.sort((a, b) => b.calls - a.calls);
    },
    report() {
      const q = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
      const mean = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
      const per = {};
      for (const [k, v] of acc) per[k] = +(v / Math.max(1, frames)).toFixed(3);
      const gpu = {};
      for (const [k, v] of gpuAcc) gpu[k] = { p50: +q(v, 0.5).toFixed(2), p95: +q(v, 0.95).toFixed(2), n: v.length };
      let alloc = 0, gcs = 0, gcFreed = 0;
      for (let i = 1; i < heap.length; i++) { const d = heap[i] - heap[i - 1]; if (d > 0) alloc += d; else if (d < -65536) { gcs++; gcFreed -= d; } }
      const dur = ft.reduce((a, b) => a + b, 0) / 1000;
      const info = r.info;
      return {
        frames, steps, seconds: +dur.toFixed(2), fps: +(frames / Math.max(1e-3, dur)).toFixed(1),
        frameMs: { mean: +mean(ft).toFixed(2), p50: +q(ft, 0.5).toFixed(2), p95: +q(ft, 0.95).toFixed(2), p99: +q(ft, 0.99).toFixed(2), max: +Math.max(0, ...ft).toFixed(1) },
        syncMs: syncMs.length ? { mean: +mean(syncMs).toFixed(2), p50: +q(syncMs, 0.5).toFixed(2), p95: +q(syncMs, 0.95).toFixed(2) } : null,
        perFrameMs: per, gpuMs: gpu, timerQuery: !!tq,
        heap: { MBperSec: +(alloc / 1048576 / Math.max(1e-3, dur)).toFixed(2), minorGCs: gcs, usedMB: heap.length ? +(heap[heap.length - 1] / 1048576).toFixed(1) : null },
        longTasks: { n: longT.length, maxMs: Math.round(Math.max(0, ...longT)) },
        info: { calls: info.render.calls, tris: info.render.triangles, sceneCalls: ctx.postfx.sceneStats.calls, sceneTris: ctx.postfx.sceneStats.tris,
          programs: info.programs?.length ?? null, geometries: info.memory.geometries, textures: info.memory.textures },
        dpr: r.getPixelRatio(), buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], quality: ctx.postfx.qualityName,
        census: sceneCensus(), actors: ctx.actors.count, enemies: ctx.enemies?.list?.length ?? 0, mode: g.mode,
      };
    },
  };
  return true;
}

// ------------------------------------------------------------------ driver
async function setupScenario(page, sc) {
  await page.evaluate(async (sc) => {
    const g = window.__GAME__, c = g.ctx;
    g.story.skip(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
    for (const e of [...(c.enemies?.list ?? [])]) c.enemies.despawn?.(e);
    if (sc.flags) for (const [k, v] of Object.entries(sc.flags)) { try { g.story.flag(k, v); } catch { /* */ } }
    await g.loadLevel(sc.level, sc.spawn);
    g.story.skip(); g.skipDialog?.(); g.setMode('play'); g.god(true);
  }, sc);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__GAME__; g.story.skip(); g.skipDialog?.(); if (g.mode !== 'play') g.setMode('play'); });
  if (ISO) await applyIso(page);
  if (sc.combat) {
    await page.evaluate((list) => {
      const g = window.__GAME__, p = g.ctx.player.pos; let i = 0;
      for (const [type, n] of list) for (let k = 0; k < n; k++) { const a = (i++ / 7) * Math.PI * 2; g.spawn(type, p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6); }
    }, sc.combat);
    await page.waitForTimeout(1500);
  }
}

// CONTROLS_SPEC §2.1 emulation: fixed yaw π (camera south, looking +Z), fov 38 (50 portrait), d 13 (12 phone),
// pitch lerp(46°,58°,(d-9)/9), focus = feet + 0.6 m, far 90; far group (sky dome, skyline) hidden in play (§4.1).
async function applyIso(page) {
  await page.evaluate(() => {
    const c = window.__GAME__.ctx, cam = c.camera, T = window.__GAME__.THREE;
    const portrait = innerHeight > innerWidth * 1.05, phone = Math.min(innerWidth, innerHeight) <= 500;
    const d = phone ? 12 : 13, pitch = portrait ? 58 * Math.PI / 180 : (46 + (58 - 46) * (d - 9) / 9) * Math.PI / 180;
    if (!c.cam.__isoWrapped) {
      c.cam.__isoWrapped = true;
      c.cam.render = function () {
        const p = c.player.pos; const f = new T.Vector3(p.x, p.y + 0.6, p.z + 0.8);
        cam.fov = portrait ? 50 : 38; cam.near = 0.3; cam.far = 90;
        cam.position.set(f.x, f.y + d * Math.sin(pitch), f.z - d * Math.cos(pitch));
        cam.lookAt(f); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      };
    }
    for (const o of c.scene.children) if (/^(sky|skyline|horizon|far)/i.test(o.name)) o.visible = false;
    c.scene.traverse((o) => { if (/^(skyline|horizon)$/.test(o.name)) o.visible = false; });
  });
}

async function drive(page, sc, ms) {
  const end = Date.now() + ms;
  if (sc.walk) {
    const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
    let i = 0;
    while (Date.now() < end) { const k = keys[i++ % 4]; await page.keyboard.down(k); await page.waitForTimeout(Math.min(1000, end - Date.now())); await page.keyboard.up(k); }
  } else if (sc.combat) {
    while (Date.now() < end) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(220); }
  } else await page.waitForTimeout(ms);
}

async function measure(page, cdp, sc, ms, { sync = false } = {}) {
  await page.evaluate((s) => { window.__PERF__.hookPasses(); window.__PERF__.reset(); window.__PERF__.setSync(s); }, sync);
  const m0 = await cdp.send('Performance.getMetrics');
  await drive(page, sc, ms);
  const m1 = await cdp.send('Performance.getMetrics');
  const rep = await page.evaluate(() => { window.__PERF__.setSync(false); return window.__PERF__.report(); });
  const mv = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
  const secs = rep.seconds || ms / 1000;
  rep.cdp = {};
  for (const n of ['ScriptDuration', 'TaskDuration', 'RecalcStyleDuration', 'LayoutDuration']) rep.cdp[n + 'PerSec_ms'] = +(((mv(m1, n) - mv(m0, n)) * 1000) / secs).toFixed(1);
  for (const n of ['RecalcStyleCount', 'LayoutCount']) rep.cdp[n + 'PerSec'] = +((mv(m1, n) - mv(m0, n)) / secs).toFixed(1);
  rep.cdp.Nodes = mv(m1, 'Nodes'); rep.cdp.JSEventListeners = mv(m1, 'JSEventListeners');
  return rep;
}

async function ablations(page, cdp, sc) {
  const out = {};
  const run = async (name, on, off) => {
    await page.evaluate(on); await page.waitForTimeout(400);
    const r = await measure(page, cdp, sc, 2500);
    await page.evaluate(off); await page.waitForTimeout(200);
    out[name] = { gpu: r.gpuMs['gpu.frame']?.p50 ?? null, sync: r.syncMs?.p50, cpu: r.perFrameMs['tick.cpu'], frame: r.frameMs.p50, calls: r.info.calls, tris: r.info.tris };
  };
  const ident = () => {};
  await run('baseline', ident, ident);
  await run('noShadows', () => { const c = window.__GAME__.ctx; c.__sm = c.renderer.shadowMap.autoUpdate; c.renderer.shadowMap.autoUpdate = false; },
    () => { const c = window.__GAME__.ctx; c.renderer.shadowMap.autoUpdate = c.__sm; });
  await run('noBloom', () => { const b = window.__GAME__.ctx.postfx.bloomPass; if (b) b.enabled = false; }, () => { const b = window.__GAME__.ctx.postfx.bloomPass; if (b) b.enabled = true; });
  await run('noGrass', () => { const s = window.__GAME__.ctx.scene; s.traverse((o) => { if (o.name === 'grass') { o.__v = o.visible; o.visible = false; } }); },
    () => { const s = window.__GAME__.ctx.scene; s.traverse((o) => { if (o.name === 'grass') o.visible = o.__v ?? true; }); });
  await run('noFur', () => { const s = window.__GAME__.ctx.scene; s.traverse((o) => { if (/fur/i.test(o.name) && o.isMesh) { o.__v = o.visible; o.visible = false; } }); },
    () => { const s = window.__GAME__.ctx.scene; s.traverse((o) => { if (/fur/i.test(o.name) && o.isMesh) o.visible = o.__v ?? true; }); });
  await run('noTransparent', () => { const s = window.__GAME__.ctx.scene; s.traverse((o) => { const m = o.material; if (o.isMesh && m && !Array.isArray(m) && m.transparent && o.visible) { o.__tv = true; o.visible = false; } }); },
    () => { const s = window.__GAME__.ctx.scene; s.traverse((o) => { if (o.__tv) { o.visible = true; o.__tv = false; } }); });
  await run('dpr0.75x', () => { const p = window.__GAME__.ctx.postfx; p.__d = p.dpr; p.dpr = p.dpr * 0.75; p.setSize(p.width, p.height); },
    () => { const p = window.__GAME__.ctx.postfx; p.dpr = p.__d; p.setSize(p.width, p.height); });
  return out;
}

const results = { when: new Date().toISOString(), base: BASE, runs: [] };
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
try {
  for (const prof of PROFILES) for (const preset of PRESETS) {
    const ctxOpts = prof === 'mobile' ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
    const bctx = await browser.newContext(ctxOpts);
    const page = await bctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const cdp = await bctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (prof === 'mobile') await cdp.send('Emulation.setCPUThrottlingRate', { rate: +arg('throttle', 4) });
    const bootT = Date.now();
    await page.goto(`${BASE}?test=1&seed=1&mute=1&quality=${preset}&level=meadow&spawn=start`);
    await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
    const bootMs = Date.now() - bootT;
    const gpu = await page.evaluate(() => { const gl = window.__GAME__.ctx.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
    await page.evaluate(install);
    console.log(`== ${prof}/${preset} boot ${bootMs} ms, gpu ${gpu}`);
    for (const sid of SCEN) {
      const sc = SCENARIOS[sid];
      if (!sc) continue;
      try {
        const lt = Date.now();
        await setupScenario(page, sc);
        const loadMs = Date.now() - lt - 2500 - (sc.combat ? 1500 : 0);
        const rep = await measure(page, cdp, sc, SAMPLE_MS);
        const syncRep = await measure(page, cdp, sc, 2000, { sync: true });
        await page.evaluate(() => window.__PERF__.armBreakdown());
        await page.waitForTimeout(300);
        const breakdown = await page.evaluate(() => window.__PERF__.takeBreakdown());
        const abl = ABLATE ? await ablations(page, cdp, sc) : null;
        const shot = path.join(HERE, 'shots', `${prof}_${preset}_${sid}${ISO ? '_iso' : ''}.png`);
        fs.mkdirSync(path.dirname(shot), { recursive: true });
        await page.screenshot({ path: shot });
        results.runs.push({ profile: prof, preset, scenario: sid + (ISO ? '+iso' : ''), gpu, bootMs, loadMs, ...rep, sync: syncRep.syncMs, syncCpu: syncRep.perFrameMs['tick.cpu'], breakdown: breakdown.slice(0, 40), breakdownTotal: breakdown.reduce((a, b) => a + b.calls, 0), ablations: abl, errors: errs.slice(-5) });
        console.log(`  ${sid}: fps ${rep.fps} p50 ${rep.frameMs.p50} p95 ${rep.frameMs.p95} cpu ${rep.perFrameMs['tick.cpu']} gpu ${rep.gpuMs['gpu.frame']?.p50} sync ${syncRep.syncMs?.p50} calls ${rep.info.calls} tris ${rep.info.tris} prog ${rep.info.programs} heap ${rep.heap.MBperSec}MB/s`);
        fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
      } catch (e) { console.log(`  ${sid}: FAILED ${e.message}`); results.runs.push({ profile: prof, preset, scenario: sid + (ISO ? '+iso' : ''), error: e.message }); }
    }
    await bctx.close();
  }
} finally { await browser.close(); fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); }
console.log('wrote', OUT);
