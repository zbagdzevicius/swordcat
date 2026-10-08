// Dev helper: open a preview view and evaluate a JS expression in the page. Usage: node src/characters/tools/eval.mjs <view> "<expr>"
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5201/src/characters/preview.html?view=' + process.argv[2] + '&w=600&h=600&fixed');
await page.waitForFunction(() => window.__PREVIEW__?.ready || window.__PREVIEW__?.error, null, { timeout: 60000 });
const r = await page.evaluate(process.argv[3]);
console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
await browser.close();
