// Which materialProperties fields change per frame (=> three r186 setProgram -> getProgram -> getParameters)?
// Proxies renderer.properties entries and records value changes for 60 frames.  node perf2_progwhy.mjs <level> <spawn>
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const [level = 'meadow', spawn = 'start'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__GAME__.waitFrames(30));
const r = await page.evaluate(async () => {
  const G = window.__GAME__, R = G.ctx.renderer, P = R.properties, orig = P.get.bind(P);
  const prox = new WeakMap(), changes = new Map(), names = new WeakMap(); let progSets = 0;
  const WATCH = new Set(['lightsStateVersion', 'outputColorSpace', 'batching', 'instancing', 'instancingColor', 'instancingMorph', 'skinning', 'envMap', 'fog', 'numClippingPlanes', 'vertexAlphas', 'vertexTangents', 'morphTargets', 'morphNormals', 'morphColors', 'toneMapping', 'morphTargetsCount', '__version', 'environment', 'currentProgram']);
  P.get = (o) => {
    const t = orig(o); if (!o?.isMaterial) return t;
    let p = prox.get(t); if (p) return p;
    p = new Proxy(t, { set(tg, k, v) { if (WATCH.has(k) && tg[k] !== undefined && tg[k] !== v) { const key = `${k} :: ${o.type}:${o.name || '#' + o.id}`; changes.set(key, (changes.get(key) ?? 0) + 1); } if (k === 'currentProgram') progSets++; tg[k] = v; return true; } });
    prox.set(t, p); return p;
  };
  // the internal code keeps references to the raw object only through properties.get, so the proxy sees every write
  await G.waitFrames(5); changes.clear(); progSets = 0;
  const f0 = G.frame; await G.waitFrames(60); const n = G.frame - f0;
  P.get = orig;
  const byField = {}; for (const [k, v] of changes) { const f = k.split(' :: ')[0]; byField[f] = (byField[f] ?? 0) + v; }
  return { frames: n, getProgramPerFrame: +(progSets / n).toFixed(1), byFieldPerFrame: Object.fromEntries(Object.entries(byField).map(([k, v]) => [k, +(v / n).toFixed(1)])), top: [...changes].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / n).toFixed(1)}/f ${k}`) };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
