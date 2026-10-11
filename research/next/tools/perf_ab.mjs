// research/next/tools/perf_ab.mjs — observer-effect check + clean fps: frame counter over 3 s with no instrumentation,
// then with each probe ingredient added (precise performance.memory per frame, CDP Performance domain, timer queries).
// Usage: node research/next/tools/perf_ab.mjs [--preset=med] [--level=meadow] [--spawn=start] [--mobile] [--vsync]
import { chromium, devices } from 'playwright';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:5801/'), PRESET = arg('preset', 'med'), LEVEL = arg('level', 'meadow'), SPAWN = arg('spawn', 'start');
const MOBILE = process.argv.includes('--mobile'), VSYNC = process.argv.includes('--vsync');
const args = [`--use-angle=${arg('gpu', 'gl')}`, '--enable-gpu', '--ignore-gpu-blocklist', ...(VSYNC ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']), ...(process.argv.includes('--precise') ? ['--enable-precise-memory-info'] : [])];
const browser = await chromium.launch({ headless: true, args });
const bctx = await browser.newContext(MOBILE ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await bctx.newPage();
const cdp = await bctx.newCDPSession(page);
if (MOBILE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +arg('throttle', 4) });
await page.goto(`${BASE}?test=1&seed=1&mute=1&quality=${PRESET}&level=${LEVEL}&spawn=${SPAWN}`, { timeout: 180000, waitUntil: 'commit' });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
await page.evaluate((hub) => { const g = window.__GAME__; if (hub) g.story.flag('town.free', true); g.story.skip(); g.skipDialog?.(); g.setMode('play'); g.god(true); }, SPAWN === 'hub');
await page.waitForTimeout(3000);
const fps = async (label) => {
  const out = await page.evaluate(async () => {
    const g = window.__GAME__.game, ft = [];
    let last = 0;
    const off = g.addFrameHook(() => { const t = performance.now(); if (last) ft.push(t - last); last = t; });
    await new Promise((r) => setTimeout(r, 3000));
    off();
    ft.sort((a, b) => a - b);
    const q = (p) => +ft[Math.min(ft.length - 1, Math.floor(p * ft.length))].toFixed(1);
    return { fps: +(ft.length / 3).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), calls: g.ctx.renderer.info.render.calls, dpr: g.ctx.renderer.getPixelRatio(), buf: [g.ctx.renderer.domElement.width, g.ctx.renderer.domElement.height] };
  });
  console.log(label.padEnd(34), JSON.stringify(out));
  return out;
};
await fps('clean');
await page.evaluate(() => { const g = window.__GAME__.game; g.__memOff = g.addFrameHook(() => { window.__m = performance.memory?.usedJSHeapSize; }); });
await fps('+ performance.memory per frame');
await page.evaluate(() => window.__GAME__.game.__memOff());
await cdp.send('Performance.enable');
await fps('+ CDP Performance.enable');
await cdp.send('Performance.disable');
await page.evaluate(() => {
  const g = window.__GAME__.game, gl = g.ctx.renderer.getContext(), tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!tq) return;
  const pend = [];
  g.__tqOff = g.addFrameHook(() => {
    for (let i = pend.length - 1; i >= 0; i--) if (gl.getQueryParameter(pend[i], gl.QUERY_RESULT_AVAILABLE)) { gl.getQueryParameter(pend[i], gl.QUERY_RESULT); gl.deleteQuery(pend[i]); pend.splice(i, 1); }
    gl.getParameter(tq.GPU_DISJOINT_EXT);
    const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); gl.endQuery(tq.TIME_ELAPSED_EXT); pend.push(q);
  });
});
await fps('+ timer query per frame');
await page.evaluate(() => window.__GAME__.game.__tqOff?.());
await fps('clean again');
await browser.close();
