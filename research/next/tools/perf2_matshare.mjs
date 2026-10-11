// Find materials shared across object kinds (instanced vs plain, skinned vs plain, instanceColor, vertex alpha,
// morph count): three r186 setProgram then recomputes getParameters + cache key on EVERY draw of that material.
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const [level = 'meadow', spawn = 'start'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__GAME__.waitFrames(30));
const r = await page.evaluate(() => {
  const ctx = window.__GAME__.ctx; const kinds = new Map(); const names = new Map();
  const kindOf = (o) => { const g = o.geometry; const c = g?.attributes?.color;
    return [o.isInstancedMesh ? 'inst' + (o.instanceColor ? '+col' : '') + (o.morphTexture ? '+morph' : '') : o.isSkinnedMesh ? 'skin' : o.isBatchedMesh ? 'batch' : o.isPoints ? 'pts' : o.isLine ? 'line' : o.isSprite ? 'sprite' : 'mesh',
      c && c.itemSize === 4 ? 'va4' : '', g?.attributes?.tangent ? 'tan' : '', (g?.morphAttributes?.position?.length ?? 0) ? 'morph' + g.morphAttributes.position.length : ''].filter(Boolean).join('.'); };
  ctx.scene.traverseVisible((o) => { if (!o.material) return; for (const m of [].concat(o.material)) {
    if (!kinds.has(m)) { kinds.set(m, new Map()); names.set(m, `${m.type}#${m.id}:${m.name || ''}`); }
    const k = kindOf(o), km = kinds.get(m); if (!km.has(k)) km.set(k, []); if (km.get(k).length < 3) km.get(k).push(o.name || o.parent?.name || '?'); } });
  const out = []; let draws = 0;
  for (const [m, km] of kinds) if (km.size > 1) out.push([names.get(m), Object.fromEntries(km)]);
  return { materials: kinds.size, conflicted: out.length, list: out.slice(0, 25) };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
