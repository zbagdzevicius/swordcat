// tests/smoke/treat.mjs  (owner: T, TT4 §12.3) — the treat panel in a real browser, no real treat ever:
//   treat:panel   a fake Token Tails host (http://localhost:3000, served by page.route) frames ?embed=1 and answers
//                 treat-request with a canned treat-result. The panel is opened with a fake SHELTER_CARD_OPEN through
//                 window.__SWORDCAT_TREAT__ (dist-test only). Every state is rendered and shot at 1280×720 and 390×844;
//                 Enter sends; every **/shelter/donate** request is intercepted and counted (must stay 0).
//   treat:link    not embedded, not tokentails.com: a new-tab link to tokentails.com/swordcat plus Copy link; nothing is
//                 requested and the old /shelter-payouts/give link is gone.
//   treat:direct  TT5 §13.3: standalone on tokentails.com (forced with __SWORDCAT_TREAT__.setMode('direct') in the test
//                 build, since localhost is not allowed). The REAL rescued cat card opens after a save; page.route answers
//                 GET /shelter/donate/status, GET /shelter/donate/guest/me and the POST with canned bodies (no request
//                 ever reaches the API). Every state at 1280×720 and 390×844 (checking, ready, sending, sent with
//                 new-tab links, already, used up, paused, retry), ready + sent at the other four viewports (844×390 and
//                 667×375 with touch, 1024×768, 1920×1080). page.url() never changes.
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
          t.assert(/Send Pink Paw a treat for Judas/.test(txt) && /Token Tails sends a free treat\./.test(txt) && /The treat goes to Pink Paw's wallet\./.test(txt), `[${vp.tag}] open: button, free line, custody line`);
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
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(t.base).origin }).catch(() => {});
      const hook = await page.evaluate(() => typeof window.__SWORDCAT_TREAT__);
      if (hook !== 'object') { t.fail('not embedded: no treat panel installed'); return; }
      const url0 = page.url();
      t.assert(await page.evaluate(() => window.__SWORDCAT_TREAT__.ctl.mode) === 'link', 'localhost → link mode');
      const ph = await openFakeCard(page.mainFrame());
      t.assert(ph === 'link', `not embedded → link state (${ph})`);
      const a = await page.evaluate(() => [...document.querySelectorAll('.tt-treat a')].map((el) => ({ href: el.href, target: el.target, rel: el.rel, text: el.textContent })));
      t.assert(a.length === 1 && a[0].href === 'https://tokentails.com/swordcat' && a[0].target === '_blank' && a[0].rel === 'noopener noreferrer', `new-tab link to /swordcat ${JSON.stringify(a)}`);
      const html = await page.evaluate(() => document.querySelector('.tt-treat').innerHTML);
      t.assert(!/shelter-payouts\/give/.test(html), 'no /shelter-payouts/give link');
      const txt = await panelText(page.mainFrame());
      t.assert(/Play on tokentails\.com\/swordcat to send a free treat\. Opens in a new tab\./.test(txt) && /The treat goes to Pink Paw's wallet\./.test(txt), `link copy (${txt.replace(/\n/g, ' | ')})`);
      t.assert(!(await page.evaluate(() => !!document.querySelector('.tt-treat [data-treat="send"]'))), 'no send button outside tokentails.com');
      await shoot(t, page, 'link');
      await page.click('.tt-treat [data-treat="copy"]');
      await page.waitForFunction(() => /Link copied|Copy did not work/.test(document.querySelector('.tt-treat')?.innerText ?? ''), null, { timeout: 3000 }).catch(() => {});
      const after = await panelText(page.mainFrame());
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
      t.assert(/Link copied\./.test(after) && clip === 'https://tokentails.com/swordcat', `Copy link copies /swordcat (${clip}; ${after.replace(/\n/g, ' | ')})`);
      await shoot(t, page, 'link-copied');
      t.assert(page.url() === url0, 'the game tab never navigates');
      await page.evaluate(() => { window.__SWORDCAT_TREAT__.closeCard({}); document.getElementById('fake-card')?.remove(); });
      t.assert(donateHits === 0, 'no donate request');
      await page.unroute('**/shelter/donate**');
    },
  },
  {
    name: 'treat:direct', order: 4, level: null, timeout: 900000,
    async run(t) {
      const HASH = `0x${'ab'.repeat(32)}`;
      const LIVE = { enabled: true, railState: 'live', treatsLeftToday: 40, amountWei: '10000000000000000', chainId: 5042,
        chains: [{ chainId: 5042, main: true, enabled: true, railState: 'live', treatsLeftToday: 40, amountWei: '10000000000000000', coin: 'USDC' }] };
      const SENT = { txHash: HASH, chainId: 5042, amountWei: '10000000000000000', explorerUrl: `https://testnet.arcscan.app/tx/${HASH}` };
      const VPS = [
        { w: 1280, h: 720, tag: 'desk', all: true },
        { w: 390, h: 844, tag: 'phone', touch: true, all: true },
        { w: 844, h: 390, tag: 'phone-land', touch: true },
        { w: 667, h: 375, tag: 'phone-small', touch: true },
        { w: 1024, h: 768, tag: 'tablet' },
        { w: 1920, h: 1080, tag: 'hd' },
      ];
      const slots = ['pickles', 'pebble', 'muffin', 'socks', 'biscuit', 'noodle', 'button', 'sprout', 'waffles', 'toffee', 'tater', 'mittens'];
      for (const vp of VPS) {
        const context = await t.browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: !!vp.touch, isMobile: !!vp.touch, deviceScaleFactor: vp.touch ? 2 : 1 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() !== 'error') return;
          // the browser logs every 4xx answer as a console error; the canned donate errors are expected here
          if (/\/shelter\/donate\//.test(m.location()?.url ?? '') || /status of (409|424|429|503)/.test(m.text())) return;
          errors.push(`console.error: ${m.text()}`);
        });
        // canned API: `cfg` is changed between states; every request is recorded; nothing leaves the machine
        const cfg = { status: { status: 200, body: LIVE }, me: { status: 200, body: { today: null } }, post: { status: 200, body: SENT }, getDelay: 0, postDelay: 0 };
        const hits = [];
        await page.route('https://api.tokentails.com/shelter/donate/**', async (route) => {
          const req = route.request();
          const u = new URL(req.url());
          const origin = req.headers().origin ?? new URL(t.base).origin;
          const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'accept,content-type', vary: 'Origin' };
          hits.push({ method: req.method(), path: u.pathname, body: req.postData(), headers: req.headers() });
          if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
          let r = null, delay = cfg.getDelay;
          if (req.method() === 'GET' && u.pathname === '/shelter/donate/status') r = cfg.status;
          else if (req.method() === 'GET' && u.pathname === '/shelter/donate/guest/me') r = cfg.me;
          else if (req.method() === 'POST' && u.pathname === '/shelter/donate/guest') { r = cfg.post; delay = cfg.postDelay; }
          if (delay) await new Promise((res) => setTimeout(res, delay));
          if (!r) return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
          return route.fulfill({ status: r.status, headers: cors, contentType: 'application/json', body: r.body == null ? '' : JSON.stringify(r.body) });
        });
        const G = async (fn, arg) => { const h = await page.evaluateHandle(fn, arg); try { return await h.evaluate((x) => (window.__GAME__?.plain ? window.__GAME__.plain(x) : x)); } finally { h.dispose().catch(() => {}); } };
        const ph = () => page.evaluate(() => document.querySelector('.sh-card .tt-treat, .tt-treat')?.dataset.treatPhase ?? null);
        const waitPhase = (want, timeout = 6000) => page.waitForFunction((w) => document.querySelector('.tt-treat')?.dataset.treatPhase === w, want, { timeout, polling: 50 }).then(() => true, () => false);
        const press = async (sel) => { if (vp.touch) await page.tap(sel); else await page.click(sel); };
        let slotI = 0;
        /** reset the rail (fresh reads with the current cfg), save the next slot, wait for the real card + panel */
        const openCard = async (mode = 'direct') => {
          await page.evaluate((m) => { window.__SWORDCAT_TREAT__.setMode(m); }, mode);
          const slot = slots[slotI++];
          await G((s) => window.__GAME__.shelter.save(s), slot);
          const ok = await page.waitForFunction((s) => window.__GAME__.shelter.card()?.open && window.__GAME__.shelter.card().slot === s && !!document.querySelector('.tt-treat'), slot, { timeout: 20000, polling: 100 }).then(() => true, () => false);
          t.assert(ok, `[${vp.tag}] ${slot}: the real card opened with the treat panel`);
          await page.waitForTimeout(450); // card entrance
          return ok;
        };
        const closeCard = async () => { await G(() => window.__GAME__.shelter.close()); await page.waitForTimeout(300); };
        const linksOk = async (label) => {
          const ls = await page.evaluate(() => [...document.querySelectorAll('.tt-treat a')].map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
          t.assert(ls.length === 2 && ls.every((l) => l.target === '_blank' && l.rel === 'noopener noreferrer') && ls[1].href === `https://tokentails.com/shelter-payouts/receipt?chain=5042&tx=${HASH}`, `[${vp.tag}] ${label}: explorer + receipt open a new tab ${JSON.stringify(ls)}`);
        };
        const custody = async (label) => {
          const txt = await page.evaluate(() => document.querySelector('.tt-treat')?.innerText ?? '');
          t.assert(/The treat goes to Pink Paw's wallet\./.test(txt) && /Token Tails sends a free treat\./.test(txt) && !/adopt/i.test(txt) && !/—/.test(txt), `[${vp.tag}] ${label}: free + custody lines, no adopt (${txt.replace(/\n/g, ' | ')})`);
          return txt;
        };
        try {
          await page.goto(`${t.base}?test=1&seed=1&shelterCard=1`, { timeout: 240000 });
          await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 240000 });
          await G(async () => {
            const g = window.__GAME__, c = g.ctx;
            g.story.skip?.(); g.setMode('play');
            for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag?.(k, true);
            await g.loadLevel('meadow', 'start');
            g.story.skip?.(); g.setMode('play');
            g.setGod?.(true);
            // the start's pike rats patrol 11 to 13 m away; an alerted one holds the card (TT5 M), so they go
            for (const e of [...(c.enemies?.list ?? [])]) { try { c.enemies.despawn(e); } catch { /* */ } }
            return true;
          });
          await G(() => window.__GAME__.waitFrames(10));
          if (await page.evaluate(() => typeof window.__SWORDCAT_TREAT__?.setMode) !== 'function') { t.fail(`[${vp.tag}] __SWORDCAT_TREAT__.setMode missing: run a VITE_SWORDCAT_DEBUG build`); continue; }
          const url0 = page.url();

          // checking → ready
          cfg.getDelay = vp.all ? 1500 : 0;
          if (!(await openCard())) continue;
          if (vp.all) {
            const p0 = await ph();
            t.assert(p0 === 'checking', `[${vp.tag}] checking first (${p0})`);
            t.assert(await page.evaluate(() => document.querySelector('.tt-treat [data-treat="send"]')?.disabled === true), `[${vp.tag}] the checking button is disabled`);
            await custody('checking');
            await shoot(t, page, `direct-${vp.tag}-1-checking`);
          }
          t.assert(await waitPhase('open'), `[${vp.tag}] ready after both reads (${await ph()})`);
          cfg.getDelay = 0;
          const ready = await custody('ready');
          t.assert(/Send Pink Paw a treat for /.test(ready), `[${vp.tag}] the send button names the cat`);
          await shoot(t, page, `direct-${vp.tag}-2-ready`);

          // sending → sent
          cfg.postDelay = 1200;
          await press('.tt-treat [data-treat="send"]');
          t.assert(await waitPhase('sending', 3000), `[${vp.tag}] sending`);
          if (vp.all) await shoot(t, page, `direct-${vp.tag}-3-sending`);
          t.assert(await waitPhase('sent', 6000), `[${vp.tag}] sent (${await ph()})`);
          cfg.postDelay = 0;
          const sentTxt = await custody('sent');
          t.assert(/Treat sent! 0\.01 USDC is on its way to Pink Paw/.test(sentTxt), `[${vp.tag}] sent copy`);
          await linksOk('sent');
          await shoot(t, page, `direct-${vp.tag}-4-sent`);
          const posts = hits.filter((h) => h.method === 'POST');
          t.assert(posts.length === 1 && posts[0].path === '/shelter/donate/guest' && JSON.parse(posts[0].body).source === 'page' && /application\/json/.test(posts[0].headers['content-type'] ?? '') && !posts[0].headers.accesstoken, `[${vp.tag}] one JSON POST to the guest route, no token ${JSON.stringify(posts.map((p) => p.body))}`);
          t.assert(hits.some((h) => h.path === '/shelter/donate/status') && hits.some((h) => h.path === '/shelter/donate/guest/me'), `[${vp.tag}] both GETs before the send`);
          await closeCard();

          if (vp.all) {
            const state = async (label, setup, want, extra) => {
              setup();
              if (!(await openCard())) return;
              if (extra) await extra();
              t.assert(await waitPhase(want), `[${vp.tag}] ${label} → ${want} (${await ph()})`);
              await custody(label);
              await shoot(t, page, `direct-${vp.tag}-${label}`);
              await closeCard();
            };
            await state('5-already', () => { cfg.me = { status: 200, body: { today: { status: 'CONFIRMED' } } }; }, 'already');
            cfg.me = { status: 200, body: { today: null } };
            await state('6-used-up', () => { cfg.status = { status: 200, body: { ...LIVE, railState: 'exhausted', treatsLeftToday: 0, chains: [] } }; }, 'exhausted');
            await state('7-paused', () => { cfg.status = { status: 200, body: { enabled: false, railState: 'paused' } }; }, 'paused');
            cfg.status = { status: 200, body: LIVE };
            // a bare 429 (the limiter) → Try again → 429 DONATE_ALREADY_TODAY → already
            cfg.post = { status: 429, body: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' } };
            if (await openCard()) {
              await waitPhase('open'); await press('.tt-treat [data-treat="send"]');
              t.assert(await waitPhase('error'), `[${vp.tag}] a bare 429 → Try again (${await ph()})`);
              await custody('retry');
              await shoot(t, page, `direct-${vp.tag}-8-retry`);
              cfg.post = { status: 200, body: SENT };
              await press('.tt-treat [data-treat="send"]');
              t.assert(await waitPhase('sent'), `[${vp.tag}] Try again sends and shows sent (${await ph()})`);
              await linksOk('retry → sent');
              await closeCard();
            }
            cfg.post = { status: 429, body: { statusCode: 429, code: 'DONATE_ALREADY_TODAY' } };
            await state('9-already-from-post', () => {}, 'already', async () => {
              await waitPhase('open'); await press('.tt-treat [data-treat="send"]');
            });
            cfg.post = { status: 424, body: { statusCode: 424, code: 'DONATE_SEND_FAILED' } };
            await state('10-failed', () => {}, 'error', async () => { await waitPhase('open'); await press('.tt-treat [data-treat="send"]'); });
            cfg.post = { status: 409, body: { statusCode: 409, code: 'DONATE_BUDGET_SPENT' } };
            await state('11-used-up-from-post', () => {}, 'exhausted', async () => { await waitPhase('open'); await press('.tt-treat [data-treat="send"]'); });
            cfg.post = { status: 200, body: SENT };
            // link mode inside the real card (any host but tokentails.com): no request, new-tab link + Copy link
            const before = hits.length;
            if (await openCard('link')) {
              const lk = await page.evaluate(() => ({ phase: document.querySelector('.tt-treat')?.dataset.treatPhase, a: [...document.querySelectorAll('.tt-treat a')].map((a) => [a.href, a.target]), send: !!document.querySelector('.tt-treat [data-treat="send"]'), copy: !!document.querySelector('.tt-treat [data-treat="copy"]') }));
              t.assert(lk.phase === 'link' && lk.a.length === 1 && lk.a[0][0] === 'https://tokentails.com/swordcat' && lk.a[0][1] === '_blank' && !lk.send && lk.copy, `[${vp.tag}] link mode in the real card ${JSON.stringify(lk)}`);
              await custody('link');
              await shoot(t, page, `direct-${vp.tag}-12-link`);
              await closeCard();
            }
            t.assert(hits.length === before, `[${vp.tag}] link mode makes no request (${hits.length - before})`);
          }
          t.assert(page.url() === url0, `[${vp.tag}] the game tab never navigated (${page.url()})`);
          t.assert(await page.evaluate(() => !!window.__GAME__?.ready), `[${vp.tag}] the game is still running`);
          for (const e of errors) t.fail(`[treat:direct ${vp.tag}] ${e}`);
        } finally { await context.close().catch(() => {}); }
      }
    },
  },
];
