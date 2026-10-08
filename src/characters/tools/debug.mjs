// Dev helper: load a preview view and print console output + canvas state. Usage: node src/characters/tools/debug.mjs <view>
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('X4122') && !t.includes('useProgram')) console.log(m.type(), t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5201/src/characters/preview.html?view=' + (process.argv[2] || 'vigil') + '&w=600&h=1000&fixed');
await page.waitForTimeout(8000);
console.log(await page.evaluate(() => { const c = document.querySelector('canvas'); return { w: c?.width, h: c?.height, cw: c?.clientWidth, st: JSON.stringify(window.__PREVIEW__ ? { r: window.__PREVIEW__.ready, f: window.__PREVIEW__.frame, e: window.__PREVIEW__.error } : null), hud: document.getElementById('hud').textContent }; }));
await browser.close();
