// tests/smoke/brand.mjs  (owner: G3 brand) — docs/TOKENTAILS-PLAN.md §10.4 / §10.5 / §10.10 item 12: the Token Tails
// + Pink Paw surfaces in a real browser, with screenshots under tests/shots/brand/ at 1280×720, 844×390 and 390×844:
//   title (logo, tagline, wordmark on wide screens, "Skip practice", co-brand footer), loading (the index.html splash
//   paw and the loading veil with a tip), results (gold ":3" coin behind the rank stamp, the co-brand pill, the catnip
//   note), pause (the co-brand pill at the foot, no link out) and credits (team, Pink Paw lines, the tokentails.com link).
//   SMOKE_URL=http://localhost:5333/ SMOKE_ONLY=brand node tests/smoke.mjs
const inPage = (t, fn, arg) => t.G(fn, arg);
// 390×844: portrait phone (§10.10 #12 asks for credits in both orientations; Q1 added it with the rescue-card bio check)
const SIZES = [[1280, 720], [844, 390], [390, 844]];

async function shot(t, name) {
  await t.frames(2);
  return t.shot(`brand/${name}`);
}

/** Close every ui screen and leave the game in play mode. */
async function reset(t) {
  await inPage(t, () => {
    const g = window.__GAME__, ui = g.ctx.ui;
    try { ui.results?.close?.(); } catch { /* not open */ }
    ui.overlay?.loading?.(false);
    ui.menus.closeAll();
    document.querySelector('#splash-copy')?.remove();
    if (ui._hasSaveReal) ui.hasSave = ui._hasSaveReal;
    g.story.skip?.(); g.setMode('play');
  });
  await t.wait(300);
}

async function screens(t, w, h) {
  const tag = `${w}x${h}`, wide = w >= 1000 && h >= 560;
  await t.viewport(w, h);

  // ---- title (no save: one CTA + the Skip practice link)
  await inPage(t, () => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); const ui = g.ctx.ui; ui._hasSaveReal ??= ui.hasSave; ui.hasSave = () => false; ui.menus.closeAll(); ui.showTitle(); });
  await t.wait(2400);
  const ti = await inPage(t, () => {
    const q = (s) => document.querySelector(s), vis = (e) => !!e && getComputedStyle(e).display !== 'none' && +getComputedStyle(e).opacity > 0.5 && e.getBoundingClientRect().width > 0;
    const rect = (e) => { const r = e?.getBoundingClientRect(); return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
    const mark = q('.title-wordmark');
    return {
      word: q('.ui-title .logo-word')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      sub: q('.ui-title .logo-sub')?.textContent ?? '', tagline: q('.ui-title .title-tagline')?.textContent ?? '', taglineVis: vis(q('.ui-title .title-tagline')),
      mark: vis(mark), markLoaded: !!mark && mark.complete && mark.naturalWidth > 0,
      skip: q('.title-skip')?.textContent ?? '', skipVis: vis(q('.title-skip')), skipR: rect(q('.title-skip')),
      play: rect(q('.btn--play')), foot: rect(q('.title-foot')), footTxt: q('.title-foot')?.textContent ?? '',
      docTitle: document.title, ogAlt: q('meta[property="og:image:alt"]')?.content ?? '',
      vw: innerWidth, vh: innerHeight,
    };
  });
  t.log(`${tag} title: "${ti.word}" / "${ti.sub}" / "${ti.tagline}" · wordmark ${ti.mark} · skip "${ti.skip}" · <title> ${ti.docTitle}`);
  t.assert(/PINK PAW KNIGHT|[A-Z]/.test(ti.word) && ti.word.length > 3, `${tag}: title wordmark text "${ti.word}"`);
  t.assert(/Token Tails/.test(ti.sub), `${tag}: subtitle "${ti.sub}"`);
  t.assert(ti.taglineVis && /Rescue House/.test(ti.tagline), `${tag}: tagline shown "${ti.tagline}"`);
  t.assert(ti.mark === wide, `${tag}: Token Tails wordmark ${wide ? 'shown' : 'hidden'} (${ti.mark})`);
  if (wide) t.assert(ti.markLoaded, `${tag}: wordmark image loads`);
  t.assert(ti.skipVis && /Skip practice/.test(ti.skip), `${tag}: Skip practice link "${ti.skip}"`);
  t.assert(/Token Tails/.test(ti.footTxt), `${tag}: co-brand footer`);
  t.assert(/ · Token Tails$/.test(ti.docTitle) && !/%/.test(ti.docTitle), `${tag}: <title> filled from BRAND (${ti.docTitle})`);
  t.assert(/Clementine/.test(ti.ogAlt), `${tag}: og:image:alt from BRAND`);
  const inside = (r) => r && r.l >= 0 && r.t >= 0 && r.r <= ti.vw + 1 && r.b <= ti.vh + 1;
  t.assert(inside(ti.skipR), `${tag}: skip link inside the viewport ${JSON.stringify(ti.skipR)}`);
  const over = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  t.assert(!over(ti.skipR, ti.play) && !over(ti.skipR, ti.foot), `${tag}: skip link clear of the play button and footer`);
  await shot(t, `title-${tag}`);

  // ---- loading: the index.html splash (re-inserted from the served, brand-filled page) and the loading veil
  const splash = await inPage(t, async () => {
    const html = await (await fetch(location.pathname)).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const s = doc.querySelector('#splash');
    if (!s) return { ok: false };
    s.id = 'splash-copy';
    const style = doc.querySelector('head style')?.textContent.replace(/#splash\b/g, '#splash-copy') ?? '';
    const st = document.createElement('style'); st.textContent = style; s.prepend(st);
    document.body.append(document.importNode(s, true));
    const fills = [...document.querySelectorAll('#splash-copy [fill]')].map((e) => e.getAttribute('fill').toUpperCase());
    return { ok: true, label: s.getAttribute('aria-label'), fills: [...new Set(fills)] };
  });
  t.assert(splash.ok && /is loading$/.test(splash.label ?? '') && !/%/.test(splash.label ?? ''), `${tag}: splash label "${splash.label}"`);
  t.assert(['#F3EEE6', '#FF7AA2', '#FFB3C7'].every((c) => splash.fills?.includes(c)) && !splash.fills?.includes('#F4A462'), `${tag}: ivory paw, pink beans (${splash.fills?.join(' ')})`);
  await shot(t, `loading-splash-${tag}`);
  await inPage(t, () => { document.querySelector('#splash-copy')?.remove(); window.__GAME__.ctx.ui.menus.closeAll(); window.__GAME__.ctx.ui.overlay.loading(true); });
  await t.wait(700);
  const tip = await inPage(t, () => document.querySelector('.ui-loading .load-tip')?.textContent ?? '');
  t.assert(tip.length > 5, `${tag}: loading tip "${tip}"`);
  await shot(t, `loading-${tag}`);
  await inPage(t, () => window.__GAME__.ctx.ui.overlay.loading(false));
  await t.wait(400);
  await reset(t);

  // ---- results
  await inPage(t, () => { const ui = window.__GAME__.ctx.ui; ui.results.autoContinue = false; ui.showResults({ levelId: 'meadow', time: 512, kittens: 3, kittensTotal: 3, letter: true, fish: 64, lives: 9, livesLost: 0, rank: 'pawsome' }); });
  await t.wait(2600);
  const res = await inPage(t, () => {
    const q = (s) => document.querySelector(s), r = (e) => e?.getBoundingClientRect();
    const coin = r(q('.res-stamp .res-coin')), word = r(q('.res-stamp .res-word')), panel = r(q('.res-panel'));
    return {
      // the coin overlaps the stamp's word and is drawn under it
      coin: !!coin && coin.width > 30,
      coinBehind: !!coin && !!word && coin.left < word.right && word.left < coin.right && coin.top < word.bottom && word.top < coin.bottom
        && +getComputedStyle(q('.res-stamp .res-coin')).zIndex < +getComputedStyle(q('.res-stamp .res-word')).zIndex,
      pill: q('.res-brand .tt-pill')?.textContent ?? '', note: q('.res-brand .tt-note')?.textContent ?? '', link: !!q('.res-panel a'),
      fits: !!panel && panel.top >= -1 && panel.bottom <= innerHeight + 1,
    };
  });
  t.assert(res.coin && res.coinBehind, `${tag}: gold coin behind the rank stamp`);
  t.assert(/A Token Tails game/.test(res.pill), `${tag}: results pill "${res.pill}"`);
  t.assert(/Catnip here stays in this game for now\./.test(res.note), `${tag}: results catnip note "${res.note}"`);
  t.assert(!res.link, `${tag}: no link on the results card`);
  t.assert(res.fits, `${tag}: the results card fits the viewport`);
  await shot(t, `results-${tag}`);
  await reset(t);

  // ---- pause
  await inPage(t, () => window.__GAME__.ctx.ui.pause());
  await t.wait(700);
  const pa = await inPage(t, () => {
    const b = document.querySelector('.menu--pause .pause-brand'), r = b?.getBoundingClientRect();
    return { pill: b?.querySelector('.tt-pill')?.textContent ?? '', note: b?.textContent ?? '', link: !!document.querySelector('.menu--pause a'),
      inView: !!r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1 };
  });
  t.assert(/A Token Tails game/.test(pa.pill) && /Catnip here stays/.test(pa.note), `${tag}: pause co-brand pill "${pa.pill}"`);
  t.assert(!pa.link, `${tag}: no link out from the pause menu`);
  t.assert(pa.inView, `${tag}: the pause co-brand pill is on screen`);
  await shot(t, `pause-${tag}`);
  await inPage(t, () => window.__GAME__.ctx.ui.resume());
  await reset(t);

  // ---- credits (from the title's Settings, as players reach it)
  await inPage(t, () => { const ui = window.__GAME__.ctx.ui; ui._hasSaveReal ??= ui.hasSave; ui.hasSave = () => false; ui.menus.closeAll(); ui.showTitle({ fromStory: true }); });
  await t.wait(900);
  await inPage(t, () => window.__GAME__.ctx.ui.menus.openCredits());
  await t.wait(500);
  const cr = await inPage(t, () => {
    const roll = document.querySelector('.menu--credits .credits-roll');
    const a = roll?.querySelector('.cr-pinkpaw-about a');
    return {
      team: !!roll?.querySelector('.cr-team'), pinkpaw: roll?.querySelector('.cr-pinkpaw')?.textContent ?? '',
      about: roll?.querySelector('.cr-pinkpaw-about')?.textContent ?? '', fiction: roll?.querySelector('.cr-fiction')?.textContent ?? '',
      href: a?.getAttribute('href') ?? '', target: a?.getAttribute('target') ?? '', rel: a?.getAttribute('rel') ?? '',
    };
  });
  t.assert(cr.team && /real cats at Pink Paw/.test(cr.pinkpaw), `${tag}: credits team + Pink Paw names line`);
  t.assert(/real cat shelter in Lithuania/.test(cr.about) && /made up/.test(cr.fiction), `${tag}: credits Pink Paw about + fiction`);
  t.assert(cr.href === 'https://tokentails.com' && cr.target === '_blank' && /noopener/.test(cr.rel), `${tag}: tokentails.com link (${cr.href} ${cr.target} ${cr.rel})`);
  await shot(t, `credits-${tag}`);
  // the Pink Paw block scrolled into view (the roll auto-scrolls; phones show only its top at first)
  await inPage(t, () => { const r = document.querySelector('.menu--credits .credits-roll'), a = r?.querySelector('.cr-pinkpaw'); if (r && a) r.scrollTop = Math.max(0, a.offsetTop - 12); });
  await t.wait(200);
  await shot(t, `credits-pinkpaw-${tag}`);
  await reset(t);
}

/** The kitten rescue card shows the fictional bio (`.kit-bio`) inside its line for a Pink Paw-named kitten, none otherwise. */
async function rescueBio(t) {
  const card = (id) => inPage(t, (kid) => new Promise((done) => {
    const g = window.__GAME__, t0 = performance.now();
    g.ctx.ui.celebrations?.q?.clear?.(); g.ctx.ui.celebrations?._end?.();
    g.ctx.bus.emit('kitten:rescued', { kittenId: kid });
    const tick = () => {
      const c = document.querySelector('.ui-celebrate .cel-card'), line = c?.querySelector('.cel-line');
      // the card's line was filled for this rescue (the card animates in, so opacity is not a reliable signal)
      const txt = line?.textContent ?? '', shown = !!c && txt.length > 0 && (kid !== 'biscuit' || !/Raudvis/.test(txt));
      if (shown || performance.now() - t0 > 4000) return done({ shown, lineOn: !!line?.classList.contains('is-on'), bio: line?.querySelector('.kit-bio')?.textContent ?? null });
      requestAnimationFrame(tick);
    };
    tick();
  }), id);
  const a = await card('muffin');
  t.log(`rescue card muffin: ${JSON.stringify(a)}`);
  t.assert(a.shown && a.lineOn && /Raudvis/.test(a.bio ?? '') && /Bell Tower/.test(a.bio ?? ''), `rescue card: Raudvis bio inside the line (${a.bio})`);
  await shot(t, 'rescue-bio-1280x720');
  await t.wait(400);
  const b = await card('biscuit');
  t.assert(b.shown && b.bio == null, `rescue card: no bio for a kitten without one (${b.bio})`);
  await inPage(t, () => { const c = window.__GAME__.ctx.ui.celebrations; c?.q?.clear?.(); c?._end?.(); });
}

export default [
  {
    name: 'brand:surfaces', order: 46, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      try { for (const [w, h] of SIZES) await screens(t, w, h); } finally { await t.viewport(1280, 720); await reset(t).catch(() => {}); }
    },
  },
  {
    name: 'brand:rescue-bio', order: 47, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) { try { await rescueBio(t); } finally { await reset(t).catch(() => {}); } },
  },
];
