// research/next/tools/perf_trace.mjs — Chrome trace (renderer + GPU process) for 3 s of play: busy time per thread and the
// top events on the renderer main thread and the GPU main thread (is the main thread waiting on the GPU process?).
// Usage: node research/next/tools/perf_trace.mjs --level=meadow --spawn=start [--preset=med] [--gpu=gl|d3d11] [--mobile]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:5801/'), LEVEL = arg('level', 'meadow'), SPAWN = arg('spawn', 'start'), PRESET = arg('preset', 'med');
const ANGLE = arg('gpu', 'gl');
const MOBILE = process.argv.includes('--mobile');
const browser = await chromium.launch({ headless: true, args: [`--use-angle=${ANGLE}`, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const ctx = await browser.newContext(MOBILE ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${BASE}?test=1&seed=1&mute=1&quality=${PRESET}&level=${LEVEL}&spawn=${SPAWN}`, { timeout: 180000, waitUntil: 'commit' });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
await page.evaluate(() => { const g = window.__GAME__; g.story.skip(); g.skipDialog?.(); g.setMode('play'); g.god(true); });
await page.waitForTimeout(3000);
const f0 = await page.evaluate(() => window.__GAME__.frame);
const tracePath = path.join(HERE, `trace_${LEVEL}_${PRESET}_${ANGLE}.json`);
await browser.startTracing(page, { path: tracePath, categories: ['toplevel', 'v8', 'blink', 'gpu', 'cc', 'viz', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-gpu.service', 'gpu.angle'] });
await page.waitForTimeout(3000);
await browser.stopTracing();
const frames = (await page.evaluate(() => window.__GAME__.frame)) - f0;
await browser.close();

const tr = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const ev = tr.traceEvents ?? tr;
const tname = new Map(), pname = new Map();
for (const e of ev) if (e.ph === 'M') { if (e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args.name); if (e.name === 'process_name') pname.set(e.pid, e.args.name); }
// complete events per thread; compute self time with a stack per thread
const byThread = new Map();
for (const e of ev) if (e.ph === 'X' && e.dur != null) { const k = `${e.pid}:${e.tid}`; (byThread.get(k) ?? byThread.set(k, []).get(k)).push(e); }
const report = { frames, fps: +(frames / 3).toFixed(1), threads: [] };
for (const [k, list] of byThread) {
  list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = new Map(), stack = [];
  let busy = 0;
  for (const e of list) {
    while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop();
    if (!stack.length) busy += e.dur;
    else stack[stack.length - 1].self -= Math.min(e.dur, stack[stack.length - 1].end - e.ts);
    const node = { e, end: e.ts + e.dur, self: e.dur };
    stack.push(node);
    node.commit = () => {};
    e.__node = node;
  }
  for (const e of list) self.set(e.name, (self.get(e.name) ?? 0) + Math.max(0, e.__node.self));
  const pid = +k.split(':')[0];
  report.threads.push({ thread: `${pname.get(pid) ?? pid} / ${tname.get(k) ?? k}`, busyMsPerSec: +(busy / 1000 / 3).toFixed(1),
    topSelf: [...self].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, v]) => [n, +(v / 1000 / 3).toFixed(1)]) });
}
report.threads.sort((a, b) => b.busyMsPerSec - a.busyMsPerSec);
report.threads = report.threads.slice(0, 6);
fs.writeFileSync(tracePath.replace('.json', '.summary.json'), JSON.stringify(report, null, 1));
fs.unlinkSync(tracePath);
console.log(JSON.stringify(report, null, 1));
