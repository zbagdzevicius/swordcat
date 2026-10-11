// research/next/tools/perf_alloc.mjs — allocation sampling (CDP HeapProfiler.startSampling) for 5 s of play: which
// functions allocate the per-frame garbage (tech.md §18: "no allocations in update/render").
// Usage: node research/next/tools/perf_alloc.mjs --level=meadow --spawn=start [--combat] [--walk]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:5801/'), LEVEL = arg('level', 'meadow'), SPAWN = arg('spawn', 'start');
const COMBAT = process.argv.includes('--combat'), WALK = process.argv.includes('--walk');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await page.goto(`${BASE}?test=1&seed=1&mute=1&quality=${arg('preset', 'med')}&level=${LEVEL}&spawn=${SPAWN}`, { timeout: 180000, waitUntil: 'commit' });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
await page.evaluate((hub) => { const g = window.__GAME__; if (hub) g.story.flag('town.free', true); g.story.skip(); g.skipDialog?.(); g.setMode('play'); g.god(true); }, SPAWN === 'hub');
await page.waitForTimeout(3000);
if (COMBAT) {
  await page.evaluate(() => { const g = window.__GAME__, p = g.ctx.player.pos; const L = [['rat_pike', 3], ['rat_xbow', 2], ['crow', 2]]; let i = 0;
    for (const [t, n] of L) for (let k = 0; k < n; k++) { const a = (i++ / 7) * Math.PI * 2; g.spawn(t, p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6); } });
  await page.waitForTimeout(1500);
}
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.collectGarbage');
const f0 = await page.evaluate(() => window.__GAME__.frame);
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const end = Date.now() + 5000;
let k = 0;
while (Date.now() < end) {
  if (COMBAT) await page.keyboard.press('KeyJ');
  else if (WALK) { const key = ['KeyW', 'KeyD', 'KeyS', 'KeyA'][k++ % 4]; await page.keyboard.down(key); await page.waitForTimeout(600); await page.keyboard.up(key); continue; }
  await page.waitForTimeout(220);
}
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const frames = (await page.evaluate(() => window.__GAME__.frame)) - f0;
const self = new Map(), files = new Map();
let total = 0;
const walk = (n) => {
  const cf = n.callFrame, file = (cf.url || '').replace(/^.*?\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '');
  const key = `${cf.functionName || '(anon)'} @ ${file}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + n.selfSize); total += n.selfSize;
  files.set(file || cf.functionName, (files.get(file || cf.functionName) ?? 0) + n.selfSize);
  for (const c of n.children ?? []) walk(c);
};
walk(profile.head);
const MB = (b) => +(b / 1048576).toFixed(2);
const out = { frames, seconds: 5, totalMB: MB(total), MBperSec: MB(total / 5), KBperFrame: +(total / 1024 / Math.max(1, frames)).toFixed(1),
  top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, MB(v), +(100 * v / total).toFixed(1)]),
  files: [...files].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, MB(v), +(100 * v / total).toFixed(1)]) };
fs.writeFileSync(path.join(HERE, `alloc_${LEVEL}_${SPAWN}${COMBAT ? '_combat' : ''}${WALK ? '_walk' : ''}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await browser.close();
