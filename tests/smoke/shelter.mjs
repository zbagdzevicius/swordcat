// tests/smoke/shelter.mjs  (owner: R, TOKENTAILS-PLAN §12.3 R acceptance 6) — the rescued cat card in a real browser:
//   shelter:card   a lost kitten (biscuit), a squire (sage), a service kitten (tofu) and the war-wagon burst (tater,
//                  mittens, pip) are saved through __GAME__.shelter.save; each opens the card after the celebration
//                  with the real cat's name and photo, "Meet them at Pink Paw, Kaunas.", no status (localhost = the
//                  snapshot) and Continue (Esc). CAT_SAVED fires once per save; the game pauses while the card is up;
//                  no request goes to the API (localhost); the CDN photos are served from a local file (no outside
//                  request). Then the Kittens grid. Shots → tests/shots/shelter/*.png at 1280×720 and 390×844.
import fs from 'node:fs';
import path from 'node:path';

const CDN = 'https://tokentails.fra1.cdn.digitaloceanspaces.com/**';
const API = 'https://api.tokentails.com/**';

async function waitCard(t, slot, timeout = 12000) {
  try {
    await t.page.waitForFunction((s) => window.__GAME__.shelter.card()?.open && window.__GAME__.shelter.card().slot === s, slot, { timeout, polling: 100 });
    return true;
  } catch { return false; }
}

export default [
  {
    name: 'shelter:card', order: 95, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      const img = fs.readFileSync(path.join(t.root, 'public', 'pink-paw', 'judas-photo.webp'));
      let cdn = 0, api = 0;
      const onCdn = (route) => { cdn++; route.fulfill({ status: 200, contentType: 'image/webp', body: img, headers: { 'access-control-allow-origin': '*' } }); };
      const onApi = (route) => { api++; route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); };
      await t.page.route(CDN, onCdn);
      await t.page.route(API, onApi);
      try {
        const pre = await t.G(() => ({ on: window.__GAME__.shelter.cards(true), live: window.__GAME__.shelter.live(), fetches: window.__GAME__.shelter.fetches(), roster: window.__GAME__.shelter.roster() }));
        t.assert(pre.on, 'the ui has a shelter card');
        t.assert(!pre.live && pre.fetches === 0, `no gallery GET off tokentails.com (fetches ${pre.fetches})`);
        const R = pre.roster;
        const all = Object.values(R).filter(Boolean);
        t.assert(all.length === 25, `25 slots filled (${all.length})`);
        t.assert(new Set(all.map((c) => c.name.toLowerCase())).size === 25, 'no repeated names');
        t.assert(R.pickles?.name === 'Judas' && R.pebble?.name === 'Simas' && R.muffin?.name === 'Raudvis' && R.socks?.name === 'Zare', 'the four named cats keep their slots');
        await t.clearEvents();

        const check = async (slot, tag, sizes) => {
          const ok = await waitCard(t, slot);
          t.assert(ok, `${slot}: the card opened`);
          if (!ok) return;
          await t.wait(500);
          const c = await t.G(() => ({ ...window.__GAME__.shelter.card(), mode: window.__GAME__.mode,
            imgOk: (() => { const i = document.querySelector('.sh-card img'); return !!i && i.complete && i.naturalWidth > 0; })(),
            cont: document.querySelector('.sh-continue')?.textContent ?? '', actions: !!document.querySelector('.sh-actions') }));
          t.assert(c.name === R[slot].name, `${slot}: real name ${c.name} (want ${R[slot].name})`);
          t.assert(c.meet === 'Meet them at Pink Paw, Kaunas.', `${slot}: meet line "${c.meet}"`);
          t.assert(c.status === '', `${slot}: no status for a snapshot cat ("${c.status}")`);
          t.assert(c.imgOk, `${slot}: the photo shows (${c.img})`);
          t.assert(c.mode === 'menu', `${slot}: the game is paused (mode ${c.mode})`);
          t.assert(c.cont === 'Continue' && c.actions, `${slot}: Continue and the actions slot`);
          t.assert(!/adopt/i.test(c.text) && !/—/.test(c.text), `${slot}: no adopt, no em dash`);
          for (const [w, h] of sizes) {
            await t.viewport(w, h); await t.wait(400);
            const p = await t.shot(`shelter/${tag}-${w}x${h}`);
            t.log(`shot ${p}`);
          }
          await t.viewport(1280, 720);
          await t.page.keyboard.press('Escape');
          await t.wait(400);
          const after = await t.G(() => ({ open: window.__GAME__.shelter.card().open, mode: window.__GAME__.mode }));
          t.assert(!after.open && after.mode === 'play', `${slot}: Continue closes the card and play resumes (${after.mode})`);
        };

        const both = [[1280, 720], [390, 844]];
        await t.G(() => window.__GAME__.shelter.save('biscuit'));
        await check('biscuit', 'lost-biscuit', both);
        await t.G(() => window.__GAME__.shelter.save('sage'));
        await check('sage', 'squire-sage', both);
        await t.G(() => window.__GAME__.shelter.save('tofu'));
        await check('tofu', 'service-tofu', both);
        // the war-wagon cage: three saves in one burst show one after another
        await t.G(() => { const s = window.__GAME__.shelter; s.save('tater'); s.save('mittens'); s.save('pip'); });
        await check('tater', 'burst-1-tater', [[1280, 720]]);
        await check('mittens', 'burst-2-mittens', []);
        await check('pip', 'burst-3-pip', [[390, 844]]);

        const ev = await t.events();
        const saved = ev.filter((e) => e === 'cat:saved').length;
        t.assert(saved === 6, `CAT_SAVED once per save (${saved} for 6 saves)`);
        t.assert(ev.filter((e) => e === 'shelter:card-open').length === 6 && ev.filter((e) => e === 'shelter:card-close').length === 6, 'six cards opened and closed');

        // the Kittens grid: real names and photos for the found kittens
        await t.G(() => { const g = window.__GAME__; g.ctx.ui.pause(); g.ctx.ui.menus.openKittens(); });
        await t.wait(800);
        const grid = await t.G(() => [...document.querySelectorAll('.kit-cell.is-found')].map((c) => ({ name: c.querySelector('.kit-name')?.textContent, photo: !!c.querySelector('img.kit-photo') })));
        t.assert(grid.length >= 3, `found kittens in the grid (${grid.length})`);
        for (const id of ['biscuit', 'tater', 'mittens']) t.assert(grid.some((g) => g.name === R[id].name && g.photo), `grid shows ${R[id].name} with a photo`);
        await t.shot('shelter/kittens-grid-1280x720');
        await t.viewport(390, 844); await t.wait(400);
        await t.shot('shelter/kittens-grid-390x844');
        await t.viewport(1280, 720);
        await t.G(() => { const ui = window.__GAME__.ctx.ui; ui.menus.closeAll(); ui._unfreeze?.(); window.__GAME__.setMode('play'); });
        const fin = await t.G(() => window.__GAME__.shelter.fetches());
        t.assert(fin === 0 && api === 0, `no API request (fetches ${fin}, routed ${api})`);
        t.log(`cdn photo requests served locally: ${cdn}`);
      } finally {
        await t.G(() => window.__GAME__.shelter.cards(false)).catch(() => {});
        await t.page.unroute(CDN, onCdn).catch(() => {});
        await t.page.unroute(API, onApi).catch(() => {});
      }
    },
  },
];
