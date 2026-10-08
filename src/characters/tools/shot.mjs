// Screenshot the characters preview page with the real GPU (tech.md §19.1 flags).
// Usage: node src/characters/tools/shot.mjs vigil "meme@1280x720" "lineup@1600x700?ids=pearl,mochi#lineup2" ...
//   spec = view[@WxH][?query][#outname]   (server: npx vite --port 5201 --strictPort)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.SHOT_PORT || 5201;
const OUT = process.env.SHOT_OUT || 'tests/shots/characters';
const GPU = process.argv.includes('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [process.env.SHOT_GPU === 'd3d11' ? '--use-angle=d3d11' : '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];
const specs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: GPU });
let failed = 0;
for (const spec of specs.length ? specs : ['vigil']) {
  let [main, outName] = spec.split('#');
  let [vw, query = ''] = main.split('?');
  let [view, size = '600x1000'] = vw.split('@');
  const [w, h] = size.split('x').map(Number);
  outName = outName || view;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  const url = `http://localhost:${PORT}/src/characters/preview.html?view=${view}&w=${w}&h=${h}&nohud&fixed&noblink${query ? '&' + query : ''}`;
  const t0 = Date.now();
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__PREVIEW__?.ready || window.__PREVIEW__?.error, null, { timeout: 60000 });
  } catch (e) { errors.push('timeout waiting for ready'); }
  const info = await page.evaluate(() => ({ calls: window.__PREVIEW__?.calls, tris: window.__PREVIEW__?.tris, err: window.__PREVIEW__?.error, frame: window.__PREVIEW__?.frame }));
  const file = path.join(OUT, outName + '.png');
  await page.screenshot({ path: file });
  const fps = await page.evaluate(async () => { if (!window.__PREVIEW__) return -1; const f0 = window.__PREVIEW__.frame; await new Promise((r) => setTimeout(r, 1000)); return window.__PREVIEW__.frame - f0; });
  console.log(`${outName}: ${file} calls=${info.calls} tris=${info.tris} fps~${fps} load=${Date.now() - t0}ms${info.err ? ' ERROR ' + info.err : ''}`);
  for (const e of errors) console.log('  ' + e);
  if (info.err || errors.some((e) => e.startsWith('pageerror') || e.startsWith('error'))) failed++;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
