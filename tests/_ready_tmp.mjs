import { chromium } from 'playwright';
const b = await chromium.launch();
const pg = await b.newPage();
let err = null;
pg.on('pageerror', (e) => { err ??= String(e.message); });
await pg.goto('http://localhost:5314/?test=1&seed=1', { waitUntil: 'domcontentloaded', timeout: 240000 });
let ready = false;
for (let i = 0; i < 60 && !ready; i++) { await pg.waitForTimeout(1000); ready = await pg.evaluate(() => window.__GAME__?.ready === true).catch(() => false); }
console.log('READY', ready, 'ERR', err);
await b.close();
