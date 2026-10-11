// List compiled programs per level: count by material type/name, and the first-use cost isn't visible here,
// but cacheKey variety shows where variants come from.  node perf2_programs.mjs <level> <spawn>
import { chromium } from 'playwright';
const BASE = process.env.URL ?? 'http://localhost:5803/';
const [level = 'meadow', spawn = 'title'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(`${BASE}?test&level=${level}&spawn=${spawn}`);
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
const r = await page.evaluate(() => {
  const R = window.__GAME__.ctx.renderer, gl = R.getContext();
  const progs = R.info.programs; const by = {};
  for (const p of progs) { const k = p.name || p.type; by[k] = (by[k] ?? 0) + 1; }
  // material count in scene by type + unique onBeforeCompile
  const mats = new Set(); window.__GAME__.ctx.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) mats.add(m); });
  const mt = {}; for (const m of mats) { const k = m.type + (m.onBeforeCompile && m.onBeforeCompile.toString() !== 'onBeforeCompile( /* shaderobject, renderer */ ) {}' ? '+obc' : ''); mt[k] = (mt[k] ?? 0) + 1; }
  return { programs: progs.length, byName: Object.entries(by).sort((a, b) => b[1] - a[1]), materials: mats.size, matTypes: mt,
    parallel: !!R.extensions.get('KHR_parallel_shader_compile'), checkShaderErrors: R.debug.checkShaderErrors };
});
console.log(level, spawn, JSON.stringify(r));
await browser.close();
