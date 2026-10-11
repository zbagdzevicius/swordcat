// Spawn hitch: worst frame after spawning N enemies of a type at once (after the level's prewarm).
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const [level = 'meadow', spawn = 'start', type = 'rat_pike', n = '4'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
const r = await page.evaluate(async ([type, n]) => {
  const G = window.__GAME__, g = G.game; G.god(true);
  const fr = []; const lp = g.loop, adv = lp.advance.bind(lp); lp.advance = (dt) => { const t = performance.now(); adv(dt); fr.push(performance.now() - t); };
  await G.waitFrames(60); const base = fr.slice(-60).sort((a, b) => a - b)[30]; fr.length = 0;
  const p = G.ctx.player.pos; const out = [];
  for (let round = 0; round < 3; round++) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) G.spawn(type, p.x + Math.sin(i + round) * 7, p.z + Math.cos(i + round) * 7);
    const sync = performance.now() - t0; fr.length = 0;
    await G.waitFrames(45);
    out.push({ round, syncSpawnMs: +sync.toFixed(1), worstFrameMs: +Math.max(...fr).toFixed(1), framesOver33: fr.filter((x) => x > 33).length });
    for (const e of [...G.ctx.enemies.list]) G.ctx.enemies.despawn(e);
    await G.waitFrames(30);
  }
  return { medianFrameMs: +base.toFixed(1), rounds: out };
}, [type, +n]);
console.log(level, type, 'x' + n, JSON.stringify(r));
await browser.close();
