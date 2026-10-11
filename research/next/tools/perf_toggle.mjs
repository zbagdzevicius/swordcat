// research/next/tools/perf_toggle.mjs — interleaved A/B cost attribution (robust to slow drift from other processes):
// loop stopped; for each toggle, R rounds of [K baseline frames, K toggled frames]; every frame is one postfx.render()
// bracketed by a GPU drain, timed on the CPU (submit) and with EXT_disjoint_timer_query_webgl2 (GPU execution).
// Reports Δ = toggled − baseline (median of per-round medians) for CPU submit and GPU.
// Usage: node research/next/tools/perf_toggle.mjs --level=meadow --spawn=start [--preset=med] [--iso] [--mobile] [--combat]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg('base', 'http://localhost:5801/'), LEVEL = arg('level', 'meadow'), SPAWN = arg('spawn', 'start'), PRESET = arg('preset', 'med');
const ISO = has('iso'), MOBILE = has('mobile'), COMBAT = has('combat');
const TAG = `${arg("gpu", "gl")}_${MOBILE ? 'mobile' : 'desktop'}_${PRESET}_${LEVEL}_${SPAWN}${COMBAT ? '_combat' : ''}${ISO ? '_iso' : ''}`;
const browser = await chromium.launch({ headless: true, args: [`--use-angle=${arg('gpu', 'gl')}`, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const bctx = await browser.newContext(MOBILE ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await bctx.newPage();
await page.goto(`${BASE}?test=1&seed=1&mute=1&quality=${PRESET}&level=${LEVEL}&spawn=${SPAWN}`, { timeout: 180000, waitUntil: 'commit' });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
await page.evaluate((hub) => { const g = window.__GAME__; if (hub) g.story.flag('town.free', true); g.story.skip(); g.skipDialog?.(); g.setMode('play'); g.god(true); }, SPAWN === 'hub');
await page.waitForTimeout(3000);
if (ISO) await page.evaluate(() => {
  const c = window.__GAME__.ctx, cam = c.camera, T = window.__GAME__.THREE;
  const portrait = innerHeight > innerWidth * 1.05, phone = Math.min(innerWidth, innerHeight) <= 500;
  const d = phone ? 12 : 13, pitch = portrait ? 58 * Math.PI / 180 : (46 + 12 * (d - 9) / 9) * Math.PI / 180;
  c.cam.render = function () { const p = c.player.pos; const f = new T.Vector3(p.x, p.y + 0.6, p.z + 0.8);
    cam.fov = portrait ? 50 : 38; cam.near = 0.3; cam.far = 90; cam.position.set(f.x, f.y + d * Math.sin(pitch), f.z - d * Math.cos(pitch));
    cam.lookAt(f); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
  c.scene.traverse((o) => { if (/^(sky|skyline|horizon)$/.test(o.name)) o.visible = false; });
});
if (COMBAT) {
  await page.evaluate(() => { const g = window.__GAME__, p = g.ctx.player.pos; const L = [['rat_pike', 3], ['rat_xbow', 2], ['crow', 2]]; let i = 0;
    for (const [t, n] of L) for (let k = 0; k < n; k++) { const a = (i++ / 7) * Math.PI * 2; g.spawn(t, p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6); } });
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(800);
const res = await page.evaluate(async ({ R, K }) => {
  const W = window.__GAME__, g = W.game, ctx = g.ctx, r = ctx.renderer, gl = r.getContext(), T = W.THREE, px = new Uint8Array(4);
  const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  // one last full update so the frame is current, then freeze
  g.loop.stop();
  for (const [, s] of g.renderList) s.render?.(1, 1 / 60);
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const frame = async () => {
    drain();
    const q = tq ? gl.createQuery() : null;
    if (q) gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
    r.info.reset();
    const a = performance.now(); ctx.postfx.render(1 / 60); const b = performance.now();
    if (q) gl.endQuery(tq.TIME_ELAPSED_EXT);
    drain();
    let gpu = null;
    if (q) { for (let k = 0; k < 40 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await new Promise((s) => setTimeout(s, 1));
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(tq.GPU_DISJOINT_EXT)) gpu = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q); }
    return { cpu: b - a, gpu, calls: r.info.render.calls, tris: r.info.render.triangles };
  };
  const block = async () => { const c = [], gp = []; let last; for (let i = 0; i < K; i++) { last = await frame(); c.push(last.cpu); gp.push(last.gpu); } return { cpu: med(c), gpu: med(gp), calls: last.calls, tris: last.tris }; };
  const hideBy = (pred) => { const hid = []; ctx.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; hid.push(o); } }); return () => hid.forEach((o) => { o.visible = true; }); };
  let undo = null;
  const H = (label, pred) => [label, () => { undo = hideBy(pred); }, () => undo?.()];
  const swapMats = (make) => { const saved = []; ctx.scene.traverse((o) => { if (!o.isMesh || Array.isArray(o.material)) return; const m = o.material; const n = make(m); if (n) { saved.push([o, m]); o.material = n; } }); return () => saved.forEach(([o, m]) => { o.material = m; }); };
  const cache = new Map();
  const toLambert = (m) => { if (!(m.isMeshStandardMaterial)) return null; if (!cache.has(m)) cache.set(m, new T.MeshLambertMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors })); return cache.get(m); };
  const toToon = (m) => { if (!(m.isMeshStandardMaterial)) return null; const k = 't' + m.id; if (!cache.has(k)) cache.set(k, new T.MeshToonMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors })); return cache.get(k); };
  const lv = ctx.scene.children.find((c) => /^level:/.test(c.name));
  const pf = ctx.postfx, d0 = pf.dpr, q0 = pf.quality;
  const lightsOff = [];
  const toggles = [
    ['shadow pass skipped (map kept)', () => { r.shadowMap.autoUpdate = false; }, () => { r.shadowMap.autoUpdate = true; }],
    ['bloom pass off', () => { if (pf.bloomPass) pf.bloomPass.enabled = false; }, () => { if (pf.bloomPass) pf.bloomPass.enabled = true; }],
    ['composer MSAA 4 → 0', () => { pf.quality = { ...q0, msaa: 0 }; pf._buildComposer(); pf.setSize(pf.width, pf.height); }, () => { pf.quality = q0; pf._buildComposer(); pf.setSize(pf.width, pf.height); }],
    ['pixels ×0.5625 (dpr ×0.75)', () => { pf.dpr = d0 * 0.75; pf.setSize(pf.width, pf.height); }, () => { pf.dpr = d0; pf.setSize(pf.width, pf.height); }],
    ['pixels ×0.25 (dpr ×0.5)', () => { pf.dpr = d0 * 0.5; pf.setSize(pf.width, pf.height); }, () => { pf.dpr = d0; pf.setSize(pf.width, pf.height); }],
    H('grass/flowers/wheat hidden', (o) => /^(grass|flowers|wheat)/.test(o.name)),
    H('fur shells hidden (all kittens)', (o) => o.isMesh && /^fur/i.test(o.name)),
    H('all kittens hidden (hero, NPCs)', (o) => /^kitten:/.test(o.name)),
    H('terrain ground hidden', (o) => o.isMesh && o.name === 'ground'),
    H('transparent meshes hidden', (o) => o.isMesh && !Array.isArray(o.material) && o.material?.transparent),
    H('fx.* groups hidden', (o) => /^fx\./.test(o.name)),
    H('sky/skyline/horizon hidden', (o) => /^(sky|skyline|horizon)$/.test(o.name)),
    ...(lv ? [[`${lv.name} hidden`, () => { lv.visible = false; }, () => { lv.visible = true; }]] : []),
    ['point lights off (count kept 0)', () => { ctx.scene.traverse((o) => { if (o.isPointLight && o.visible) { o.visible = false; lightsOff.push(o); } }); }, () => { lightsOff.splice(0).forEach((o) => { o.visible = true; }); }],
    ['Standard/Physical → Lambert', () => { undo = swapMats(toLambert); }, () => undo?.()],
    ['Standard/Physical → Toon', () => { undo = swapMats(toToon); }, () => undo?.()],
  ];
  const out = [];
  const base0 = await block();
  for (const [label, on, off] of toggles) {
    on(); for (let i = 0; i < 3; i++) await frame(); off(); for (let i = 0; i < 2; i++) await frame();   // warm both (compiles)
    const dC = [], dG = [], bC = [], bG = [], tC = [], tG = [];
    let tb = null, bb = null;
    for (let k = 0; k < R; k++) {
      bb = await block(); on(); tb = await block(); off();
      bC.push(bb.cpu); bG.push(bb.gpu); tC.push(tb.cpu); tG.push(tb.gpu);
      dC.push(tb.cpu - bb.cpu); if (tb.gpu != null && bb.gpu != null) dG.push(tb.gpu - bb.gpu);
    }
    const f = (x) => x == null ? null : +x.toFixed(2);
    out.push({ label, baseCpu: f(med(bC)), baseGpu: f(med(bG)), cpu: f(med(tC)), gpu: f(med(tG)), dCpu: f(med(dC)), dGpu: f(med(dG)), calls: [bb.calls, tb.calls], tris: [bb.tris, tb.tris] });
  }
  g.loop.start();
  return { base: base0, rows: out, buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], programs: r.info.programs.length };
}, { R: +arg('rounds', 6), K: +arg('k', 5) });
fs.writeFileSync(path.join(HERE, `toggle_${TAG}.json`), JSON.stringify(res, null, 1));
console.log(TAG, 'buffer', res.buffer.join('x'), 'base', JSON.stringify(res.base));
for (const r of res.rows) console.log(`${r.label.padEnd(36)} base cpu ${r.baseCpu} gpu ${r.baseGpu} | Δcpu ${r.dCpu} Δgpu ${r.dGpu} | calls ${r.calls.join('→')} tris ${r.tris.join('→')}`);
await browser.close();
