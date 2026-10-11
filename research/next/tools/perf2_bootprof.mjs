// CPU profile of cold boot to title (main thread self time by function + by source area), plus long tasks.
//   node perf2_bootprof.mjs [url-suffix]
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const SUF = process.argv[2] ?? '?test&level=meadow&spawn=title';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctxB.newPage(); const cdp = await ctxB.newCDPSession(page);
await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await page.addInitScript(() => {
  window.__LT = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LT.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
});
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto(BASE + SUF, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 100 });
const wall = Date.now() - t0;
const { profile } = await cdp.send('Profiler.stop');
const lt = await page.evaluate(() => window.__LT);
await browser.close();
// self time per node
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas; let i = 0;
for (const s of profile.samples) { self.set(s, (self.get(s) ?? 0) + (dts[i++] ?? 0)); }
const fn = new Map(), area = new Map(); let total = 0;
for (const [id, us] of self) {
  const n = byId.get(id), f = n.callFrame; total += us;
  const url = f.url.replace(/.*\/bundle\//, '').replace(/\?.*/, '');
  const k = `${f.functionName || '(anon)'} ${url}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
  fn.set(k, (fn.get(k) ?? 0) + us);
  const a = f.url ? (url.match(/^([a-zA-Z]+)-/)?.[1] ?? url) : (f.functionName || '(native)');
  area.set(a, (area.get(a) ?? 0) + us);
}
const ms = (us) => (us / 1000).toFixed(0);
console.log(`boot wall ${wall} ms; profiled ${ms(total)} ms`);
console.log('BY CHUNK/NATIVE:', [...area].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${ms(v)}`).join(' | '));
console.log('TOP SELF:'); console.log([...fn].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${ms(v)}ms ${k}`).join('\n'));
const ltSum = lt.reduce((s, [, d]) => s + d, 0);
console.log(`long tasks: ${lt.length}, total ${ltSum} ms; >200ms: ${JSON.stringify(lt.filter(([, d]) => d > 200))}`);
