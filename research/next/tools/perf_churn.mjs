// research/next/tools/perf_churn.mjs — who invalidates GPU state every frame: Material.needsUpdate (program re-resolve),
// Texture.needsUpdate (re-upload), BufferAttribute.needsUpdate (bufferSubData), counted per frame by owner name.
// Usage: node research/next/tools/perf_churn.mjs --level=meadow --spawn=start [--combat]
import { chromium } from 'playwright';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:5801/'), LEVEL = arg('level', 'meadow'), SPAWN = arg('spawn', 'start');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Instrument three's setProgram (served copy only, nothing on disk changes): every program re-resolve reports why.
await page.route(/three\.module-[^/]*\.js/, async (route) => {
  const resp = await route.fetch();
  let body = await resp.text();
  const a = body.indexOf('let needsProgramChange = false;'), b = body.indexOf('let program = materialProperties.currentProgram;', a);
  if (a > 0 && b > a) {
    let seg = body.slice(a, b);
    let n = 0;
    seg = seg.replace(/if \((.*?)\) needsProgramChange = true;/g, (m, cond) => `if (${cond}) needsProgramChange = ${JSON.stringify(cond.slice(0, 90))};`);
    seg = seg.replace(/needsProgramChange = true;\s*materialProperties.__version = material.version;/, 'needsProgramChange = "material.version changed (needsUpdate)"; materialProperties.__version = material.version;');
    body = body.slice(0, a) + seg + body.slice(b).replace('if (needsProgramChange === true) {', 'if (needsProgramChange) { window.__gpc?.(material, object, needsProgramChange);');
  }
  await route.fulfill({ response: resp, body, headers: { ...resp.headers(), 'content-length': String(Buffer.byteLength(body)) } });
});
await page.goto(`${BASE}?test=1&seed=1&mute=1&quality=${arg('preset', 'med')}&level=${LEVEL}&spawn=${SPAWN}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
await page.evaluate((flags) => { const g = window.__GAME__; if (flags) for (const [k, v] of Object.entries(flags)) g.story.flag(k, v); g.story.skip(); g.skipDialog?.(); g.setMode('play'); g.god(true); }, SPAWN === 'hub' ? { 'town.free': true } : null);
await page.waitForTimeout(3000);
if (process.argv.includes('--combat')) {
  await page.evaluate(() => { const g = window.__GAME__, p = g.ctx.player.pos; const L = [['rat_pike', 3], ['rat_xbow', 2], ['crow', 2]]; let i = 0;
    for (const [t, n] of L) for (let k = 0; k < n; k++) { const a = (i++ / 7) * Math.PI * 2; g.spawn(t, p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6); } });
  await page.waitForTimeout(1500);
}
const res = await page.evaluate(async () => {
  const T = window.__GAME__.THREE, g = window.__GAME__.game, ctx = g.ctx;
  const counts = { mat: new Map(), tex: new Map(), attr: new Map() };
  const stackOwner = () => {
    const s = new Error().stack.split('\n').slice(3, 7).map((l) => (/\/(src\/[^?:]+)[^:]*:(\d+)/.exec(l) || [])).filter((m) => m[1]).map((m) => `${m[1]}:${m[2]}`);
    return s[0] ?? '?';
  };
  const patch = (proto, bucket, nameOf) => {
    const d = Object.getOwnPropertyDescriptor(proto, 'needsUpdate');
    Object.defineProperty(proto, 'needsUpdate', { configurable: true, get: d.get, set(v) {
      if (v === true && window.__churnOn) { const k = `${nameOf(this)}  ←  ${stackOwner()}`; counts[bucket].set(k, (counts[bucket].get(k) ?? 0) + 1); }
      d.set.call(this, v);
    } });
  };
  patch(T.Material.prototype, 'mat', (m) => `${m.type}:${m.name || '-'}`);
  patch(T.Texture.prototype, 'tex', (t) => `${t.constructor.name}:${t.name || '-'}${t.image?.width ? ` ${t.image.width}x${t.image.height}` : ''}`);
  patch(T.BufferAttribute.prototype, 'attr', (a) => `${a.array.constructor.name}[${a.array.length}]`);
  if (T.InterleavedBuffer) patch(T.InterleavedBuffer.prototype, 'attr', (a) => `IB[${a.array.length}]`);
  counts.prog = new Map();
  window.__gpc = (m, o, why) => { if (!window.__churnOn) return; const names = []; for (let x = o; x && names.length < 2; x = x.parent) if (x.name) names.push(x.name);
    const k = `${m.type}:${m.name || '-'} on ${names.reverse().join('/') || o.type} — ${why}`; counts.prog.set(k, (counts.prog.get(k) ?? 0) + 1); };
  const f0 = g.frameCount;
  window.__churnOn = true;
  await new Promise((r) => setTimeout(r, 3000));
  window.__churnOn = false;
  const nf = g.frameCount - f0;
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, +(v / nf).toFixed(2)]);
  // texture/attr bytes estimate
  return { frames: nf, programReresolve: top(counts.prog), progTotalPerFrame: +([...counts.prog.values()].reduce((a, b) => a + b, 0) / nf).toFixed(1), mat: top(counts.mat), tex: top(counts.tex), attr: top(counts.attr) };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
