// tests/smoke/treat.mjs  (owner: T, TT4 §12.3) — the treat panel in a real browser, no real treat ever:
//   treat:panel   a fake Token Tails host (http://localhost:3000, served by page.route) frames ?embed=1 and answers
//                 treat-request with a canned treat-result. The panel is opened with a fake SHELTER_CARD_OPEN through
//                 window.__SWORDCAT_TREAT__ (dist-test only). Every state is rendered and shot at 1280×720 and 390×844;
//                 Enter sends; every **/shelter/donate** request is intercepted and counted (must stay 0).
//   treat:link    not embedded: the panel is a new-tab link to the give page and nothing is posted (needs the main.js
//                 call from requests/shelter-integrator.md; warns when it is missing).
// Screenshots → tests/shots/treat/*.png (and SMOKE_TREAT_SHOTS when set)
import fs from 'node:fs';
import path from 'node:path';

const NS = 'tt-swordcat';
const HOST = 'http://localhost:3000';
const BOOT = 240000;
const JUDAS = { id: '6a3055e21d6649b19b03688a', name: 'Judas', status: 'WAITING', photo: null, art: null };

function hostHtml(src, gameOrigin) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>host</title>
<style>html,body{margin:0;height:100%;background:#0B0820}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="game" src="${src}" allow="autoplay; fullscreen; gamepad" title="Pink Paw Knight"></iframe>
<script>
  window.__msgs = []; window.__reply = null;
  const f = document.getElementById('game');
  window.__send = (m) => f.contentWindow.postMessage(Object.assign({ ns: '${NS}', v: 1 }, m), '${gameOrigin}');
  addEventListener('message', (e) => {
    if (e.source !== f.contentWindow) return;
    window.__msgs.push({ origin: e.origin, data: e.data });
    if (e.data && e.data.type === 'treat-request' && window.__reply) {
      const r = Object.assign({ type: 'treat-result', requestId: e.data.requestId }, window.__reply);
      if (r.kind !== 'none') setTimeout(() => window.__send(r), 300);
    }
  });
</script></body></html>`;
}

/** a stand-in card (R's card.js owns the real one): a parchment panel with an actions container */
async function openFakeCard(frame, cat = JUDAS, slot = 'pickles') {
  return frame.evaluate(({ cat, slot }) => {
    document.getElementById('fake-card')?.remove();
    const card = document.createElement('div');
    card.id = 'fake-card';
    card.className = 'ui-root';
    card.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:9999;background:#0B082099';
    card.innerHTML = `<div class="panel" style="width:min(92vw,420px);padding:18px;border-radius:24px;border:3px solid;display:flex;flex-direction:column;align-items:center;gap:8px">
      <div style="font-weight:900;font-size:1.3em">${cat.name}</div><div>Waiting for a home</div><div>Meet them at Pink Paw, Kaunas.</div>
      <div id="fake-actions" style="width:100%"></div><button class="btn btn--candy" id="fake-continue"><span class="btn-lbl">Continue</span></button></div>`;
    document.body.appendChild(card);
    window.__SWORDCAT_TREAT__.openCard({ slot, kind: 'lost', cat, actionsEl: document.getElementById('fake-actions') });
    return document.querySelector('.tt-treat')?.dataset.treatPhase ?? null;
  }, { cat, slot });
}
const phase = (frame) => frame.evaluate(() => document.querySelector('.tt-treat')?.dataset.treatPhase ?? null);
const panelText = (frame) => frame.evaluate(() => document.querySelector('.tt-treat')?.innerText ?? '');

function shotPaths(t, name) {
  const out = [path.join(t.shotsDir, 'treat', `${name}.png`)];
  if (process.env.SMOKE_TREAT_SHOTS) out.push(path.join(process.env.SMOKE_TREAT_SHOTS, `${name}.png`));
  for (const p of out) fs.mkdirSync(path.dirname(p), { recursive: true });
  return out;
}
async function shoot(t, page, name) {
  const [p, ...copies] = shotPaths(t, name);
  await page.screenshot({ path: p });
  for (const c of copies) fs.copyFileSync(p, c);
}

export default [
  {
    name: 'treat:panel', order: 4, level: null, timeout: 420000,
    async run(t) {
      for (const vp of [{ width: 1280, height: 720, tag: 'desk' }, { width: 390, height: 844, tag: 'phone' }]) {
        const context = await t.browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.tag === 'phone' });
        const page = await context.newPage();
        const errors = [];
        let donateHits = 0;
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        await context.route('**/shelter/donate**', (r) => { donateHits++; return r.abort(); });
        const gameOrigin = new URL(t.base).origin;
        await page.route(`${HOST}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: hostHtml(`${t.base}?embed=1`, gameOrigin) }));
        try {
          await page.goto(`${HOST}/host`, { timeout: BOOT });
          let frame = null;
          const t0 = Date.now();
          while (!frame && Date.now() - t0 < 30000) { frame = page.frames().find((f) => f.url().includes('embed=1')) ?? null; if (!frame) await page.waitForTimeout(100); }
          if (!frame) throw new Error('the game frame never appeared');
          await frame.waitForFunction(() => !document.getElementById('splash'), null, { timeout: BOOT, polling: 250 });
          const hook = await frame.evaluate(() => typeof window.__SWORDCAT_TREAT__);
          if (hook !== 'object') { t.fail(`__SWORDCAT_TREAT__ missing in the frame (${hook}): run npm run build:test`); continue; }
          await page.evaluate(() => window.__send({ type: 'hello' }));
          await page.waitForFunction(() => window.__msgs.some((m) => m.data?.type === 'ready'), null, { timeout: 10000 });
          await page.evaluate(() => window.__send({ type: 'treat-state', rail: 'live', sentToday: false, amountLabel: '0.01 USDC' }));

          // open → Enter sends → sent
          t.assert(await openFakeCard(frame) === 'open', `[${vp.tag}] the card opens on the open state`);
          const txt = await panelText(frame);
          t.assert(/Send Judas a treat/.test(txt) && /It is free for you\./.test(txt) && /until handover\./.test(txt), `[${vp.tag}] open: button, free line, custody line`);
          t.assert(!/adopt/i.test(txt), `[${vp.tag}] no "adopt"`);
          await shoot(t, page, `${vp.tag}-1-open`);
          await page.evaluate(() => { window.__reply = { kind: 'sent', amountLabel: '0.01 USDC', explorerUrl: 'https://explorer.arc.io/tx/0xfeed', receiptPath: '/shelter-payouts/receipt?chain=5042&tx=0xfeed' }; });
          if (vp.tag === 'desk') {
            const focused = await frame.evaluate(() => document.activeElement?.dataset?.treat ?? null);
            if (focused !== 'send') await frame.focus('[data-treat="send"]');
            await frame.press('[data-treat="send"]', 'Enter');
          } else await frame.tap('[data-treat="send"]');
          await frame.waitForFunction(() => document.querySelector('.tt-treat')?.dataset.treatPhase === 'sending', null, { timeout: 3000 }).catch(() => {});
          await shoot(t, page, `${vp.tag}-2-sending`);
          await frame.waitForFunction(() => document.querySelector('.tt-treat')?.dataset.treatPhase === 'sent', null, { timeout: 5000 }).catch(() => {});
          t.assert(await phase(frame) === 'sent', `[${vp.tag}] the host's treat-result shows the sent state`);
          const sent = await frame.evaluate(() => ({ text: document.querySelector('.tt-treat').innerText, links: [...document.querySelectorAll('.tt-treat a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel })), btn: !!document.querySelector('.tt-treat button') }));
          t.assert(/Treat sent! 0\.01 USDC is on its way to Pink Paw/.test(sent.text) && !sent.btn, `[${vp.tag}] sent copy, no button (${sent.text.replace(/\n/g, ' | ')})`);
          t.assert(sent.links.length === 2 && sent.links.every((l) => l.target === '_blank' && l.rel === 'noopener noreferrer'), `[${vp.tag}] explorer + receipt links open a new tab ${JSON.stringify(sent.links)}`);
          await shoot(t, page, `${vp.tag}-3-sent`);
          const reqs = await page.evaluate(() => window.__msgs.filter((m) => m.data?.type === 'treat-request').map((m) => ({ origin: m.origin, data: m.data })));
          t.assert(reqs.length === 1 && reqs[0].data.catName === 'Judas' && reqs[0].data.catId === JUDAS.id, `[${vp.tag}] exactly one treat-request ${JSON.stringify(reqs.map((r) => r.data))}`);
          t.assert(!JSON.stringify(reqs).match(/token|accesstoken|fb[A-Za-z0-9]{10}/i), `[${vp.tag}] no token in the request`);

          // already: the next cat (sentToday after the send)
          const simas = { id: '6a304e8f1d6649b19b036500', name: 'Simas', status: 'RECOVERING' };
          t.assert(await openFakeCard(frame, simas, 'pebble') === 'already', `[${vp.tag}] the next card shows "already"`);
          await shoot(t, page, `${vp.tag}-4-already`);

          // rail states on a fresh day
          await page.evaluate(() => window.__send({ type: 'treat-state', rail: 'exhausted', sentToday: false }));
          t.assert(await openFakeCard(frame, simas, 'pebble') === 'exhausted', `[${vp.tag}] exhausted`);
          await shoot(t, page, `${vp.tag}-5-exhausted`);
          await page.evaluate(() => window.__send({ type: 'treat-state', rail: 'soon', sentToday: false }));
          t.assert(await openFakeCard(frame, simas, 'pebble') === 'soon', `[${vp.tag}] soon`);
          await shoot(t, page, `${vp.tag}-6-soon`);

          // error with Try again, then a forged result for another request is ignored
          await page.evaluate(() => { window.__send({ type: 'treat-state', rail: 'live', sentToday: false }); window.__reply = { kind: 'failed' }; });
          await openFakeCard(frame, simas, 'pebble');
          await frame.click('[data-treat="send"]');
          await frame.waitForFunction(() => document.querySelector('.tt-treat')?.dataset.treatPhase === 'error', null, { timeout: 5000 }).catch(() => {});
          const err = await panelText(frame);
          t.assert(/could not be sent/.test(err) && /Try again/.test(err), `[${vp.tag}] error + Try again`);
          await shoot(t, page, `${vp.tag}-7-error`);
          await page.evaluate(() => { window.__reply = { kind: 'none' }; window.__send({ type: 'treat-result', requestId: 'forged-1', kind: 'sent' }); });
          await page.waitForTimeout(300);
          t.assert(await phase(frame) === 'error', `[${vp.tag}] an unknown requestId is ignored`);

          if (vp.tag === 'desk') {
            // no answer in 15 s → error with Try again
            await frame.click('[data-treat="send"]');
            t.assert(await phase(frame) === 'sending', 'sending while the host is silent');
            await frame.waitForFunction(() => document.querySelector('.tt-treat')?.dataset.treatPhase === 'error', null, { timeout: 17000, polling: 250 }).catch(() => {});
            t.assert(await phase(frame) === 'error', 'no answer in 15 s → error state');
          }
          // Continue always closes the card, also mid-send
          await frame.evaluate(() => { window.__SWORDCAT_TREAT__.closeCard({ slot: 'pebble' }); document.getElementById('fake-card')?.remove(); });
          t.assert(await frame.evaluate(() => !document.querySelector('.tt-treat')), `[${vp.tag}] the panel goes with the card`);
          const all = await page.evaluate(() => window.__msgs);
          t.assert(all.every((m) => m.origin === gameOrigin && m.data?.ns === NS), `[${vp.tag}] every message is an envelope from the game origin`);
          t.assert(donateHits === 0, `[${vp.tag}] no request to **/shelter/donate** (${donateHits})`);
          for (const e of errors) t.fail(`[treat ${vp.tag}] ${e}`);
        } finally { await context.close().catch(() => {}); }
      }
    },
  },
  {
    name: 'treat:link', order: 4, level: null, timeout: 240000,
    async run(t) {
      const page = t.page;
      let donateHits = 0;
      await page.route('**/shelter/donate**', (r) => { donateHits++; return r.abort(); });
      const hook = await page.evaluate(() => typeof window.__SWORDCAT_TREAT__);
      if (hook !== 'object') { t.warn('not embedded: no treat panel installed (main.js call from requests/shelter-integrator.md not applied yet)'); return; }
      const ph = await openFakeCard(page.mainFrame());
      t.assert(ph === 'link', `not embedded → link state (${ph})`);
      const a = await page.evaluate(() => { const el = document.querySelector('.tt-treat a'); return el && { href: el.href, target: el.target, rel: el.rel, text: el.textContent }; });
      t.assert(a?.href === 'https://tokentails.com/shelter-payouts/give?cat=Judas' && a.target === '_blank' && a.rel === 'noopener noreferrer', `new-tab link ${JSON.stringify(a)}`);
      t.assert(!(await page.evaluate(() => !!document.querySelector('.tt-treat button'))), 'no send button outside Token Tails');
      await shoot(t, page, 'link');
      await page.evaluate(() => { window.__SWORDCAT_TREAT__.closeCard({}); document.getElementById('fake-card')?.remove(); });
      t.assert(donateHits === 0, 'no donate request');
    },
  },
];
