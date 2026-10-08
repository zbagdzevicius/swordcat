// Dev tool: boot the real game on the characters dev server (5201), run an in-page script (async function body; may return { shots: [...] } and set window.__shotPrep), screenshot. Usage: node src/characters/tools/ingame.mjs <page-script.js>
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = process.env.OUT || 'C:/Users/simsu_kompas/projects/swordcat/tests/shots/characters';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
await page.goto('http://localhost:5201/?test=1&seed=1');
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 60000 });
const script = process.argv[2];
const r = await page.evaluate(async (src) => { const fn = new Function('return (async () => {' + src + '})()'); try { return await fn(); } catch (e) { return 'ERR ' + e.stack; } }, fs.readFileSync(script, 'utf8'));
console.log(JSON.stringify(r));
for (const s of (r && r.shots) || []) {
  await page.evaluate(async (s) => { await window.__shotPrep?.(s); }, s);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s}.png` });
  console.log('shot', s);
}
await browser.close();
