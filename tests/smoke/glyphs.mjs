// tests/smoke/glyphs.mjs  (owner: ui + fx, TT6) — no player has to decode "RMB":
//   glyphs:shield   holding the Shield (Q) shows the Pink Paw shield in the world (fx sprite + bubble visible), the bar
//                   slot goes "active"; the parry lesson line draws a mouse with the right button lit + "Shield" + the
//                   pink shield cue, then the touch Shield button icon on touch and the left bumper on a pad; a parry-able
//                   wind-up shows the shield cue over the foe; the Controls card on touch shows icon rows and no
//                   keyboard-only lines, at 1280 × 720, 844 × 390 and 390 × 844. Shots → tests/shots/glyphs/*.png.
export default [
  {
    name: 'glyphs:shield', order: 96, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      const page = t.page;
      await t.G(() => { const g = window.__GAME__; g.god(true); g.ctx.input.setDevice('kbm'); });
      await t.wait(400);
      // ---- hold the Shield: the paw shield shows in the world and on the bar
      await page.keyboard.down('KeyQ');
      await t.wait(450);
      const on = await t.G(() => { const f = window.__GAME__.ctx.fx.shieldFx; return { shown: { ...f.shown }, sprite: !!f.sprite?.visible, bubble: !!f.bubble?.visible, slot: document.querySelector('.ab-guard')?.dataset.shield, ups: f.counts.ups }; });
      t.log(`guarding ${JSON.stringify(on)}`);
      t.assert(on.shown.visible && on.sprite && on.bubble && on.ups >= 1, `the Pink Paw shield is visible while guarding (${JSON.stringify(on)})`);
      t.assert(on.slot === 'active', `the bar's Shield icon is active (${on.slot})`);
      await t.shot('glyphs/shield-held-1280');
      await page.keyboard.up('KeyQ');
      await t.wait(300);
      const off = await t.G(() => ({ v: window.__GAME__.ctx.fx.shieldFx.shown.visible, slot: document.querySelector('.ab-guard')?.dataset.shield }));
      t.assert(!off.v && off.slot === 'ready', `let go: the shield is gone, the icon is ready (${JSON.stringify(off)})`);
      // ---- the parry lesson line per device: icons + plain words, never "RMB" / "LB"
      const line = async (dev) => {
        await t.G((d) => { const g = window.__GAME__; g.ctx.input.setDevice(d); g.ctx.bus.emit(g.E.PROMPT, { kind: 'tutorial', id: 'smoke-glyph', speaker: 'pearl', textKey: 'tut.parry', step: 1, action: 'guard' }); }, dev);
        await t.wait(500);
        return t.G(() => {
          const els = [...document.querySelectorAll('.hud-guide, .ui-guide, .ui-hint')].filter((e) => e.querySelector('[data-glyph]'));
          const e = els[0];
          return e ? { glyphs: [...e.querySelectorAll('[data-glyph]')].map((x) => x.dataset.glyph), aria: [...e.querySelectorAll('[aria-label]')].map((x) => x.getAttribute('aria-label')), text: e.innerText } : null;
        });
      };
      const kbm = await line('kbm');
      t.log(`kbm line ${JSON.stringify(kbm)}`);
      t.assert(kbm && kbm.glyphs.includes('mouse-right') && kbm.glyphs.includes('shield-cue') && /Shield/.test(kbm.text), `kbm: mouse with the right button lit + Shield + the pink shield (${JSON.stringify(kbm)})`);
      t.assert(kbm && !/\bRMB\b|\bLMB\b/.test(kbm.text), 'kbm: no RMB / LMB text');
      const pad = await line('pad');
      t.assert(pad && pad.glyphs.includes('pad-lb') && pad.aria.includes('Left bumper'), `pad: the left bumper icon (${JSON.stringify(pad)})`);
      const touch = await line('touch');
      t.assert(touch && touch.glyphs.includes('touch-guard') && touch.aria.includes('Shield button'), `touch: the Shield button icon (${JSON.stringify(touch)})`);
      await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PROMPT, { kind: 'tutorial', id: 'smoke-glyph', textKey: 'tut.parry', step: 1, done: true }); g.ctx.input.setDevice('kbm'); });
      // ---- a parry-able wind-up: the pink shield cue pops over the foe (no "!")
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.ctx.fx.telegraph({ kind: 'parry', position: [p.x + 2, p.y, p.z + 2], duration: 1.2 }); });
      await t.wait(300);
      const cue = await t.G(() => ({ cues: window.__GAME__.ctx.fx.shieldFx.shown.cues, vis: window.__GAME__.ctx.fx.shieldFx.cueSprites.filter((s) => s.visible).length }));
      t.log(`cue ${JSON.stringify(cue)}`);
      t.assert(cue.cues >= 1, `the parry cue is pushed (${JSON.stringify(cue)})`);
      // ---- the Controls card on touch, three sizes: icon rows, no keyboard-only lines, nothing spills out of a cell
      await t.G(() => { const g = window.__GAME__; g.ctx.input.setDevice('touch'); g.ctx.ui.pause(); g.ctx.ui.menus.openControls(); });
      for (const [w, h] of [[1280, 720], [844, 390], [390, 844]]) {
        await t.viewport(w, h); await t.wait(500);
        const c = await t.G(() => {
          const rows = [...document.querySelectorAll('.menu--controls .ctl-row:not(.ctl-head)')];
          const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
          return { rows: rows.length, h: document.querySelector('.ctl-table')?.getBoundingClientRect().height ?? 0, firstRowH: rows[0]?.getBoundingClientRect().height ?? 0,
            touchFirst: rows[0]?.querySelector(':scope > span:nth-child(2) [data-glyph]')?.dataset.glyph ?? null,
            preset: vis('.ctl-preset'), note: vis('.ctl-note'), spill: [...document.querySelectorAll('.ctl-row > span')].filter((s) => s.scrollWidth > s.clientWidth + 2).length,
            jargon: (() => { const c = document.querySelector('.ctl-table')?.cloneNode(true); c?.querySelectorAll('svg').forEach((x) => x.remove()); return /\b(RMB|LMB|LB|RB|LT|RT)\b/.test(c?.textContent ?? ''); })() };
        });
        t.log(`controls ${w}x${h} ${JSON.stringify(c)}`);
        t.assert(c.rows >= 20 && c.firstRowH > 20 && c.h > 60, `${w}x${h}: the card shows its rows (${JSON.stringify(c)})`);
        t.assert(c.touchFirst === 'gesture-stick', `${w}x${h}: the touch column comes first (${c.touchFirst})`);
        t.assert(!c.preset && !c.note, `${w}x${h}: no keyboard-only lines on touch`);
        t.assert(c.spill === 0, `${w}x${h}: no icon spills out of its cell (${c.spill})`);
        t.assert(!c.jargon, `${w}x${h}: icons, not RMB / LB text (screen readers get words)`);
        await t.shot(`glyphs/controls-touch-${w}x${h}`);
      }
      await t.viewport(1280, 720);
      await t.G(() => { const g = window.__GAME__; g.ctx.ui.menus.pop?.(); g.ctx.ui.resume(); g.ctx.input.setDevice('kbm'); });
    },
  },
];
