// Render-cost ablation: avg ms of postfx.render (CPU submit + any GPU back-pressure) and frame CPU under variants.
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const [level = 'meadow', spawn = 'start'] = process.argv.slice(2);
const VW = +(process.env.VW ?? 640), VH = +(process.env.VH ?? 360);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const G = window.__GAME__, ctx = G.ctx, g = G.game, R = ctx.renderer;
  const acc = { post: 0, n: 0, adv: 0, sim: 0, rend: 0 };
  const pr = ctx.postfx.render.bind(ctx.postfx); ctx.postfx.render = (f) => { const t = performance.now(); pr(f); acc.post += performance.now() - t; acc.n++; };
  const lp = g.loop, adv = lp.advance.bind(lp); lp.advance = (dt) => { const t = performance.now(); adv(dt); acc.adv += performance.now() - t; };
  const run = async (label, apply, undo) => { apply?.(); await G.waitFrames(30); acc.post = acc.adv = acc.n = 0; const t0 = performance.now(); await G.waitFrames(180); const wall = performance.now() - t0;
    const s = G.state(); const res = `${label.padEnd(26)} fps ${(acc.n / wall * 1000).toFixed(1).padStart(5)}  render ${(acc.post / acc.n).toFixed(2).padStart(6)} ms  cpuFrame ${(acc.adv / acc.n).toFixed(2).padStart(6)} ms  calls ${s.frameCalls}  tris ${s.frameTris}`; undo?.(); return res; };
  const lines = [];
  lines.push(await run('med (baseline)'));
  const pv = ctx.player.object3d; lines.push(await run('med, hero hidden', () => { pv.visible = false; }, () => { pv.visible = true; }));
  lines.push(await run('med, shadows off', () => { R.shadowMap.autoUpdate = false; }, () => { R.shadowMap.autoUpdate = true; }));
  const comp = ctx.postfx.composer; lines.push(await run('med, no composer', () => { ctx.postfx.composer = null; }, () => { ctx.postfx.composer = comp; }));
  lines.push(await run('low preset', () => G.quality('low'), () => G.quality('med')));
  lines.push(await run('high preset', () => G.quality('high'), () => G.quality('med')));
  // sim-only cost: steps per frame forced to 1 by measuring g.step directly
  return lines;
});
console.log(`${level}/${spawn} @${VW}x${VH}\n` + out.join('\n'));
await browser.close();
