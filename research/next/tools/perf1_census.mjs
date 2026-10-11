// perf_1 census: draws per actor (visible meshes × material groups) for the hero, companions and enemies in town/gate.
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5802/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${URL}?test=1&seed=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
for (const id of ['meadow', 'gate']) {
  await page.evaluate(async (id) => { await window.__GAME__.loadLevel(id); }, id);
  await page.evaluate(() => window.__GAME__.waitFrames(60));
  const r = await page.evaluate(() => {
    const { ctx } = window.__GAME__;
    const count = (root) => { let draws = 0, tris = 0, skinned = 0, casters = 0; const types = {};
      root?.traverseVisible?.((o) => { if (!o.isMesh) return; const n = Array.isArray(o.material) ? o.material.length : 1; draws += n; if (o.isSkinnedMesh) skinned += n; if (o.castShadow) casters++;
        const g = o.geometry; const ic = o.isInstancedMesh ? o.count : (g.instanceCount !== Infinity && g.instanceCount ? g.instanceCount : 1); tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * ic;
        for (const m of [].concat(o.material)) types[m.type] = (types[m.type] ?? 0) + 1; });
      return { draws, skinned, casters, tris: Math.round(tris), types }; };
    const out = { level: ctx.levels.current.id, hero: count(ctx.player.object3d) };
    const en = ctx.enemies?.list ?? []; out.enemies = en.slice(0, 6).map((e) => ({ id: e.def?.id ?? e.type, ...count(e.object3d) }));
    const comp = ctx.companions?.list ?? ctx.companions?.active ? [].concat(ctx.companions.list ?? ctx.companions.active) : [];
    out.companions = comp.slice(0, 3).map((c) => ({ id: c.id, ...count(c.object3d) }));
    return out;
  });
  console.log(JSON.stringify(r));
}
await browser.close();
