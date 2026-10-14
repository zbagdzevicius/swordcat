// tests/smoke/guidance.mjs  (owner: ui, package G1) — TOKENTAILS-PLAN §10.2 / §10.10 (3, 4) the Pink Paw guidance:
// world-space Token Tails paw prints on the ground toward the guide target, the gold ":3" coin edge arrow when it is off
// screen, the objective line, all read through `__GAME__.guide()` (what a player can see, CSS px).
//   guidance:practice  new game at 1280×720: ≥ 3 lit prints or the edge arrow ≤ 1 s after practice step 1 starts, the
//                      edge arrow on the off-screen dummy, an objective line; the trail fades ≤ 0.5 s inside arriveR;
//                      none of it in a cutscene / blocking dialogue
//   guidance:phone     the same first second at 844×390 and 390×844 (touch), prints ≥ 18 px wide; with toasts up
//                      (TT3 R3) no toast in the middle third at 844×390, no toast / guide bubble / objective line over
//                      Clem, the line clear of the Skip chip, the edge coin clear of the bar / HUD / touch buttons and
//                      tappable: a tap on it is a move order toward the guide target
// Screenshots → tests/shots/guidance/*.png (read them).
const DIR = 'guidance';

async function until(G, fn, arg = null, { timeout = 30000, every = 100, wait } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await G(fn, arg);
    if (v) return v;
    await wait(every);
  }
  return null;
}

const guide = () => window.__GAME__.guide();
/** New game from the CS-00 title; resolves with the game-time the first lesson prompt went up (or null). */
const newGame = () => {
  const g = window.__GAME__;
  g.ctx.story.newGame?.();
  return true;
};
const stepUp = () => { const g = window.__GAME__, tut = g.ctx.story.tutorial; return g.mode === 'play' && !g.ctx.story.isPlaying && !!tut?.active && !tut.pending && (tut.step ?? 0) >= 1; };
const seen = (r) => r && ((r.prints?.filter((p) => p.lit).length ?? 0) >= 3 || !!r.edge);

/** Poll guide() for up to `ms` after the step went up; the first sample with ≥ 3 lit prints or the edge arrow wins. */
async function firstSeen(G, wait, ms = 1000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 <= ms) {
    last = await G(guide);
    if (seen(last)) return { ok: true, at: Date.now() - t0, r: last };
    await wait(60);
  }
  return { ok: false, at: Date.now() - t0, r: last };
}

/** Do two CSS-px rects overlap? */
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** TT3 R3: the phone layout a player sees (CSS px): shown toasts, Clem, the guide bubble, the objective line, the Skip
 *  chip, the edge coin and what it must stay clear of (the shown ability bar, the HUD blocks, the shown touch buttons). */
const phoneLayout = () => {
  const g = window.__GAME__, p = g.ctx.player.pos;
  const vis = (e) => { if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
  const R = (e) => { if (!e || !vis(e)) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null; };
  const s = g.ctx.cam.worldToScreen({ x: p.x, y: p.y + 0.5, z: p.z });
  const coinEl = document.querySelector('.ui-beacon.is-on .bc-edge.is-on .bc-coin'), coin = R(coinEl);
  let coinHit = null, coinTop = false;
  if (coin) { const e = document.elementFromPoint(coin.x + coin.w / 2, coin.y + coin.h / 2); coinHit = e ? `${e.tagName}.${e.className?.baseVal ?? e.className}` : null; coinTop = !!e?.closest?.('.bc-edge'); }
  const blockers = [...document.querySelectorAll('.ability-bar.is-on .ab-slot, .hud-tl, .hud-hearts, .touch-cluster .tbtn')].map(R).filter(Boolean);
  return {
    toasts: [...document.querySelectorAll('.ui-toast')].map(R).filter(Boolean),
    clem: s && s.y > 0 && s.y < innerHeight ? { x: Math.round(s.x), y: Math.round(s.y) } : null,
    bubble: R(document.querySelector('.ui-guide.is-on .gd-bubble')) ?? R(document.querySelector('.ui-guide.is-on')),
    pill: R(document.querySelector('.hud-guide.is-on')),
    skip: g.guide().skipChip,
    coin, coinHit, coinTop, blockers,
  };
};

export default [
  {
    name: 'guidance:practice', order: 46, level: null, reload: true, timeout: 240000,
    async run(t) {
      const wait = (ms) => t.wait(ms);
      await t.viewport(1280, 720);
      const title = await until(t.G, () => window.__GAME__.ctx.story.playingId === 'cs00', null, { timeout: 60000, wait });
      t.assert(!!title, 'CS-00 title at boot');
      await t.wait(800);
      await t.G(newGame);
      const up = await until(t.G, stepUp, null, { timeout: 30000, every: 50, wait });
      if (!t.assert(!!up, 'practice step 1 is up after a new game')) return;
      const s1 = await firstSeen(t.G, wait, 1000);
      t.log(`step 1: seen ${s1.ok} after ${s1.at} ms: ${JSON.stringify({ ...s1.r, prints: s1.r?.prints?.length })}`);
      t.assert(s1.ok, `≥ 3 lit prints or the edge arrow ≤ 1 s after step 1 (${JSON.stringify(s1.r)})`);
      t.assert(s1.r?.target?.id && s1.r.target.kind, `a guide target (${JSON.stringify(s1.r?.target)})`);
      t.assert((s1.r?.objective ?? '').length > 0 && s1.r.objective.length <= 40, `objective line ≤ 40 chars ("${s1.r?.objective}")`);
      t.assert(s1.r?.phase === 'practice', `phase practice (${s1.r?.phase})`);
      // the dummy starts off screen from the title spot: the gold coin edge arrow points at it
      await t.wait(900);
      const r1 = await t.G(guide);
      const dom = await t.G(() => { const e = document.querySelector('.bc-edge.is-on .bc-coin'), r = e?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; });
      t.log(`1280×720: ${r1.prints.length} prints (${r1.prints.filter((p) => p.lit).length} lit, w ${r1.prints.map((p) => p.w).join('/')}), edge ${JSON.stringify(r1.edge)}, badge ${JSON.stringify(r1.badge)}, coin ${JSON.stringify(dom)}`);
      t.assert(r1.prints.length >= 3, `prints on screen (${r1.prints.length})`);
      t.assert(!!r1.edge || !!r1.badge, 'the coin arrow (off screen) or the coin badge (on screen)');
      if (r1.edge) t.assert(dom && dom.w >= 52 && dom.w <= 60, `desktop edge coin ≈ 56 px (${JSON.stringify(dom)})`);
      if (r1.edge) {
        const lay = await t.G(phoneLayout);
        const under = lay.coin ? lay.blockers.filter((q) => hit(q, lay.coin)) : [];
        t.assert(!under.length, `1280×720: the edge coin is clear of the ability bar / HUD (${JSON.stringify({ coin: lay.coin, under })})`);
        t.assert(!lay.coin || lay.coinTop, `1280×720: the edge coin takes its own clicks (${lay.coinHit})`);
      }
      await t.shot(`${DIR}/practice-1280x720`);
      // ---- hidden in a blocking dialogue / cutscene mode
      await t.G(() => window.__GAME__.setMode('dialog'));
      await t.wait(250);
      const dlg = await t.G(guide);
      t.assert(!dlg.prints.length && !dlg.edge && !dlg.badge, `no trail / arrow / badge in dialogue (${JSON.stringify({ n: dlg.prints.length, e: dlg.edge, b: dlg.badge })})`);
      await t.G(() => window.__GAME__.setMode('cutscene'));
      await t.wait(250);
      const cs = await t.G(guide);
      t.assert(!cs.prints.length && !cs.edge && !cs.badge, 'none in a cutscene');
      await t.G(() => window.__GAME__.setMode('play'));
      await t.wait(400);
      // ---- walking the right way keeps the prints ahead lit; inside arriveR the trail fades in ≤ 0.5 s
      const tg = await t.G(() => { const b = window.__GAME__.ctx.ui.beacon.guide; return b.pos ? { x: b.x, z: b.z, r: b.arriveR } : null; });
      if (t.assert(!!tg, 'the step-1 target has a position')) {
        await t.G(([x, z]) => { const g = window.__GAME__; g.god(true); g.click(x, z, 'right'); }, [tg.x, tg.z]);
        await t.wait(700);
        const walk = await t.G(guide);
        t.log(`walking: ${walk.prints.length} prints, ${walk.prints.filter((p) => p.lit).length} lit, edge ${!!walk.edge}, badge ${!!walk.badge}`);
        await t.shot(`${DIR}/practice-walking`);
        // stand her just inside arriveR (no lesson completion: the dummy lesson checks its own radius later)
        await t.G(([x, z, r]) => { const g = window.__GAME__, ph = g.ctx.physics; g.ctx.player.orders?.clear?.('smoke'); const px = x + 0, pz = z + Math.min(1.6, r * 0.7); g.teleport(px, ph.topAt?.(px, pz) ?? ph.heightAt(px, pz), pz); }, [tg.x, tg.z, tg.r]);
        await t.wait(550);
        const at = await t.G(guide);
        // fix round 2: the path trail is gone; an in-place lesson that starts there (Bonk) rings its dummy instead, which
        // guide().ring reports (prints round the object, not a path)
        const pathPrints = at.ring && at.target?.id !== 'tut.move' ? 0 : at.prints.length;
        t.log(`inside arriveR: step ${at.target?.id}, ${at.prints.length} prints, ring ${JSON.stringify(at.ring)}`);
        t.assert(!pathPrints, `the trail is gone ≤ 0.55 s inside arriveR (${at.prints.length} prints, ring ${!!at.ring})`);
        await t.G(() => window.__GAME__.god(false));
      }
    },
  },
  {
    name: 'guidance:phone', order: 47, level: null, timeout: 420000,
    async run(t) {
      for (const [w, h] of [[844, 390], [390, 844]]) {
        const s = await t.viewport(w, h, { touch: true, level: null });
        try {
          const wait = (ms) => s.page.waitForTimeout(ms);
          const title = await until(s.G, () => window.__GAME__.ctx.story.playingId === 'cs00', null, { timeout: 90000, wait });
          t.assert(!!title, `${w}×${h}: CS-00 title`);
          await wait(800);
          await s.G(newGame);
          const up = await until(s.G, stepUp, null, { timeout: 40000, every: 50, wait });
          if (!t.assert(!!up, `${w}×${h}: practice step 1 up`)) continue;
          const s1 = await firstSeen(s.G, wait, 1000);
          t.assert(s1.ok, `${w}×${h}: ≥ 3 lit prints or the edge arrow ≤ 1 s after step 1 (${JSON.stringify(s1.r)})`);
          await wait(900);
          const r = await s.G(guide);
          const dom = await s.G(() => { const e = document.querySelector('.bc-edge.is-on .bc-coin'), q = e?.getBoundingClientRect(); return q ? Math.round(q.width) : null; });
          t.log(`${w}×${h}: ${r.prints.length} prints (${r.prints.filter((p) => p.lit).length} lit, w ${r.prints.map((p) => p.w).join('/')}), edge ${JSON.stringify(r.edge)}, coin ${dom}, objective "${r.objective}"`);
          t.assert(r.prints.length >= 2, `${w}×${h}: prints on screen (${r.prints.length})`);
          const thin = r.prints.filter((p) => p.w < 18);
          t.assert(!thin.length, `${w}×${h}: every print ≥ 18 px wide (${r.prints.map((p) => p.w).join('/')})`);
          if (dom != null) t.assert(dom >= 40 && dom <= 48, `${w}×${h}: phone edge coin ≈ 44 px (${dom})`);
          t.assert((r.objective ?? '').length > 0, `${w}×${h}: objective line`);
          // ---- TT3 R3: toasts up (a reward, a save, the skip tip): never over Clem, the bubble never pushed onto her
          await s.G(() => { const q = window.__GAME__.ctx.ui.toasts; q.push('Pink Bow found! Clementine looks dashing.', { icon: 'cape' }); q.push('Checkpoint saved', { key: 'toast.saved' }); q.push('Hold the Skip chip to skip practice', { key: 'tut.skip.hint' }); return true; });
          await wait(700);
          const lay = await s.G(phoneLayout);
          t.log(`${w}×${h} layout: ${JSON.stringify(lay)}`);
          t.assert(lay.toasts.length >= 1, `${w}×${h}: a toast is showing (${lay.toasts.length})`);
          if (w > h) {
            const bad = lay.toasts.filter((q) => q.x < (2 * w) / 3 && q.x + q.w > w / 3);
            t.assert(!bad.length, `${w}×${h}: no toast in the middle third (${JSON.stringify(bad)})`);
          }
          const clem = lay.clem;
          if (clem) {
            const box = { x: clem.x - 30, y: clem.y - 26, w: 60, h: 52 };
            const over = lay.toasts.filter((q) => hit(q, box));
            t.assert(!over.length, `${w}×${h}: no toast over Clem (${JSON.stringify({ clem, over })})`);
            if (lay.bubble) t.assert(!hit(lay.bubble, box), `${w}×${h}: the guide bubble is not over Clem (${JSON.stringify({ clem, bubble: lay.bubble })})`);
            if (lay.pill) t.assert(!hit(lay.pill, box), `${w}×${h}: the objective line is not over Clem`);
          }
          if (lay.pill && lay.skip) t.assert(!hit(lay.pill, lay.skip), `${w}×${h}: the objective line is not under the Skip chip (${JSON.stringify({ pill: lay.pill, skip: lay.skip })})`);
          if (lay.coin) {
            const under = lay.blockers.filter((q) => hit(q, lay.coin));
            t.assert(!under.length, `${w}×${h}: the edge coin is clear of the ability bar / HUD / touch buttons (${JSON.stringify({ coin: lay.coin, under })})`);
            t.assert(lay.coinTop, `${w}×${h}: the edge coin is the top element under its centre (tappable): ${lay.coinHit}`);
          }
          await s.shot(`${DIR}/practice-${w}x${h}`);
          // ---- TT3 R3: a tap on the edge coin walks her toward the guide target (a move order, not swallowed)
          if (r.edge) {
            await s.G(() => { window.__GAME__.ctx.player.orders?.clear?.('smoke'); return true; });
            await s.page.touchscreen.tap(r.edge.sx, r.edge.sy);
            await wait(250);
            const o = await s.G(() => { const g = window.__GAME__, o = g.ctx.player.orders, b = g.ctx.ui.beacon.guide; return { kind: o.kind, d: Math.hypot(o.point.x - b.x, o.point.z - b.z), last: g.ctx.ui.beacon.lastEdgeOrder }; });
            t.assert(o.kind === 'move' && o.d < 0.5 && o.last === true, `${w}×${h}: an edge-coin tap is a move order toward the target (${JSON.stringify(o)})`);
          }
        } finally { await s.close(); }
      }
    },
  },
];
