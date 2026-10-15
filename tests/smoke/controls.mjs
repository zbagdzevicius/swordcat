// tests/smoke/controls.mjs  (owner: core, integration) — research/CONTROLS_SPEC.md end to end in a real browser:
//   controls:desktop   1280×720 KBM, TOKENTAILS-PLAN §11.2 `hybrid`: the iso frame (cat size, fog on her), W walks, RMB
//                      makes no move order, `moba` RMB click-to-move (a real mouse click; arrives), WASD cancels an order,
//                      hover pick + cursor, LMB on a rat = attack order (paths, combo, kills), LMB swings toward the
//                      cursor, wheel zoom, RMB and Q = the Stand, Space = jump, Shift = Tumble (held = sprint), G =
//                      kitten ability, Tab select (Shift+Tab back), the ability bar, H stop, Z peek, P pauses
//   controls:browser-keys  Ctrl+W, Ctrl+D, Meta+W (and Ctrl / Meta with any game key) during play: no game action
//   controls:rebind    the Controls card in the pause menu: rebind the Stand to N ("Press a key"), Ctrl / F5 / Esc are
//                      refused, a conflict swaps, then the parry lesson passes with N; "Reset keys to default"
//   controls:pad-lessons  a stubbed standard-layout pad drives the four practice lessons (L-stick, X, LB hold, LB tap)
//   controls:nav       `moba` click past the practice-field fence by the barn door: the nav path hops it and arrives
//   controls:levels    every M2 level from the iso camera (screenshots; catPx, fogAt(her) < 0.03, draw calls)
//   controls:touch     844×390 and 390×844 hasTouch / isMobile: floating joystick, tap-to-move, tap a foe = attack,
//                      ⚔ tap swings, 🛡 hold guards, swipe tumbles, ability drag aims and ✕ cancels, pinch zooms,
//                      long-press follows, no blocking rotate card in portrait
//   controls:classic   ?cam=classic still runs the orbit camera (W walks camera-forward, RMB guards)
//   controls:pad       a stubbed gamepad: the right stick puts the §6.3 ground reticle down (lingers 1 s), View (8)
//                      zooms, Start (9) pauses and the pause book's Controls button opens the card
import fs from 'node:fs';
import path from 'node:path';
import { setPreset, walkKeys, standRmb } from './_kbm.mjs';

const DIR = 'controls';
const shot = (t, name) => t.shot(`${DIR}/${name}`);

/** Poll a page function until truthy (sim seconds via game time, with a real-time cap). */
async function until(t, fn, arg, { sim = 6, real = 30000, every = 100 } = {}) {
  const t0 = Date.now();
  const g0 = await t.G(() => window.__GAME__.game.time);
  for (;;) {
    const v = await t.G(fn, arg);
    if (v) return v;
    const g = await t.G(() => window.__GAME__.game.time);
    if (g - g0 > sim || Date.now() - t0 > real) return null;
    await t.wait(every);
  }
}

/** Day meadow with the prologue done, at `spawn`; god on; party empty. */
async function dayMeadow(t, spawn = 'start') {
  await t.G(async ([s]) => {
    const g = window.__GAME__, c = g.ctx;
    g.story.skip(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
    for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
    await g.loadLevel('meadow', s);
    g.story.skip(); g.setMode('play'); g.god(true);
    c.input.setDevice('kbm');
    return true;
  }, [spawn]);
  await t.frames(20);
  await t.G(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); });
}

const pos = (t) => t.G(() => window.__GAME__.ctx.player.pos.toArray());



/** A stub gamepad (navigator.getGamepads): `axes` [lx, ly, rx, ry], `down` = pressed button indices. null removes it. */
const stubPad = (t, pad) => t.G((p) => {
  window.__PAD__ = p;
  if (!window.__PAD_STUB__) {
    window.__PAD_STUB__ = true;
    navigator.getGamepads = () => {
      const s = window.__PAD__;
      if (!s) return [];
      return [{ connected: true, id: 'smoke pad', index: 0, mapping: 'standard', axes: s.axes,
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: s.down.includes(i), value: s.down.includes(i) ? 1 : 0 })) }];
    };
  }
  return true;
}, pad);

export default [
  {
    name: 'controls:desktop', order: 30, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });
      const page = t.page;
      await dayMeadow(t, 'start');
      // ---- the frame (§2.1, §16.2) and the fog on her (§4.1)
      const iso = await t.G(() => window.__GAME__.cam.iso());
      t.log(`iso ${JSON.stringify({ d: +iso.dist.toFixed(2), pitch: +(iso.pitch * 57.3).toFixed(1), fov: iso.fov, catPx: +iso.catPx.toFixed(1) })}`);
      t.assert(Math.abs(iso.yaw - Math.PI) < 1e-6, 'meadow yaw π');
      t.assert(iso.dist > 11 && iso.dist < 15 && iso.fov === 38, `desktop distance ${iso.dist} / fov ${iso.fov}`);
      t.assert(iso.catPx >= 30, `cat ≥ 30 px at 1280×720 (${iso.catPx.toFixed(1)})`);
      const fog = await t.G(() => { const p = window.__GAME__.ctx.player.pos; return window.__GAME__.fogAt(p.x, p.z); });
      t.assert(fog < 0.03, `fog on her < 3 % (${fog?.toFixed(3)})`);
      const pointerLocked = await t.G(() => !!document.pointerLockElement);
      t.assert(!pointerLocked, 'no pointer lock in play (C2)');
      await shot(t, 'desktop-01-frame');

      // ---- TT3 §11.2 hybrid: W walks; an RMB click on the ground is the Stand, never a move order
      const w0 = await pos(t);
      await t.hold('KeyW', 700);
      const w1 = await pos(t);
      t.assert(Math.hypot(w1[0] - w0[0], w1[2] - w0[2]) > 1, `hybrid: W walks (${Math.hypot(w1[0] - w0[0], w1[2] - w0[2]).toFixed(2)} m)`);
      await t.wait(300);
      await t.clearEvents();
      const g0 = await pos(t);
      const gsp = await t.G(([x, z]) => window.__GAME__.screen(x, z), [g0[0] + 2, g0[2] + 7]);
      await page.mouse.move(gsp.x, gsp.y);
      await page.mouse.down({ button: 'right' });
      const rg = await until(t, () => window.__GAME__.ctx.player.stateName === 'guard', null, { sim: 1 });
      await page.mouse.up({ button: 'right' });
      t.assert(!!rg, 'hybrid: RMB = the Stand');
      t.assert(!(await t.events()).includes('player:order'), 'hybrid: RMB gives no move order');
      await t.wait(300);
      // ---- `moba`: RMB click-to-move with a real mouse (screen point of a world spot 7 m up-screen)
      t.assert((await setPreset(t, 'moba')) === 'moba', 'moba preset');
      const start = await pos(t);
      const goal = [start[0] + 2, start[2] + 7];
      const sp = await t.G(([x, z]) => window.__GAME__.screen(x, z), goal);
      await page.mouse.move(sp.x, sp.y);
      await page.mouse.click(sp.x, sp.y, { button: 'right' });
      const ord = await t.waitForEvent('player:order', 2000);
      t.assert(ord, 'moba: RMB issues a move order (player:order)');
      await t.wait(250);
      await shot(t, 'desktop-02-move-order');
      const arrived = await until(t, ([x, z]) => { const p = window.__GAME__.ctx.player.pos; return Math.hypot(p.x - x, p.z - z) < 0.6 && !window.__GAME__.ctx.player.orders.kind; }, goal, { sim: 6 });
      t.assert(!!arrived, `click-to-move arrives (${JSON.stringify(await pos(t))} vs ${goal})`);

      // ---- WASD overrides an order at once (§5.1), back on the default hybrid
      await setPreset(t, 'hybrid');
      const far = await t.G(() => { const p = window.__GAME__.ctx.player.pos; return window.__GAME__.order('move', [p.x, p.z + 12]); });
      t.assert(far, 'api move order');
      await t.wait(200);
      await t.hold('KeyD', 350);
      const o2 = await t.G(() => window.__GAME__.orders());
      t.assert(!o2.kind && o2.last === 'direct', `WASD cancels the order (${o2.last})`);

      // ---- hover a rat: red ring + sword cursor; LMB on it = attack order (TT3): she paths, swings, and it dies (god)
      const me = await pos(t);
      await t.G(([x, z]) => { window.__ctlRat = window.__GAME__.spawn('rat_pike', x, z); return true; }, [me[0] + 1.5, me[2] + 6]);
      await t.frames(30);
      const rs = await t.G(() => { const g = window.__GAME__, e = window.__ctlRat; return e?.alive ? g.screen(e.pos.x, e.pos.z, e.pos.y + 0.4) : null; });
      t.assert(!!rs, 'the rat is on screen');
      if (rs) {
        let hov = null;
        for (let k = 0; k < 6; k++) {                       // it may be walking toward her: follow it with the mouse
          const q = await t.G(() => { const g = window.__GAME__, e = window.__ctlRat; return g.screen(e.pos.x, e.pos.z, e.pos.y + 0.4); });
          await page.mouse.move(q.x, q.y);
          await t.frames(3);
          hov = await t.G(() => ({ kind: window.__GAME__.ctx.cam.hover.kind, cursor: window.__GAME__.ctx.renderer.domElement.style.cursor.slice(0, 20) }));
          if (hov.kind === 'enemy') break;
        }
        t.assert(hov.kind === 'enemy', `hover pick = enemy (${hov.kind})`);
        await shot(t, 'desktop-03-hover-rat');
        await t.clearEvents();
        // KBM 'auto' = one Snip–Snap–Swoosh string (§8.3), which a whiff/knockback can leave short of 30 hp: loop until it falls
        await t.G(() => { window.__GAME__.ctx.state.settings.autoAttack = 'loop'; return true; });
        // the rat may have stepped since (it saw her): click where it stands now
        const rn = await t.G(() => { const g = window.__GAME__, e = window.__ctlRat; return g.screen(e.pos.x, e.pos.z, e.pos.y + 0.4); });
        await page.mouse.move(rn.x, rn.y);
        await page.mouse.click(rn.x, rn.y, { button: 'left' });
        await t.waitForEvent('player:order', 2000);
        t.assert((await t.lastEvent('player:order'))?.kind === 'attack', 'LMB on the rat = an attack order');
        const killed = await until(t, () => !window.__ctlRat?.alive, null, { sim: 12 });
        const ev = await t.events();
        t.assert(ev.includes('player:swing') && ev.includes('combat:hit'), 'the attack order swings and hits');
        t.assert(!!killed, 'the attack order (loop) keeps chaining until the rat is down (god, rat 30 hp)');
        if (!killed) t.log(JSON.stringify(await t.G(() => window.__GAME__.orders())));
        await t.G(() => { window.__GAME__.ctx.state.settings.autoAttack = 'auto'; return true; });
      }
      await t.wait(400);

      // ---- LMB swings toward the cursor (§6.2): point east of her, click (nobody around: no magnet, no order)
      await t.G(() => { const c = window.__GAME__.ctx; for (const e of [...c.enemies.list]) c.enemies.despawn(e); c.player.orders.clear('smoke'); c.cam.select(null); });
      await t.wait(500);
      await t.clearEvents();
      const p2 = await pos(t);
      const east = await t.G(([x, z]) => window.__GAME__.screen(x - 3, z), [p2[0], p2[2]]);     // screen-right at yaw π = −X
      await page.mouse.move(east.x, east.y);
      await t.frames(3);
      await page.mouse.click(east.x, east.y, { button: 'left' });
      await t.waitForEvent('player:swing', 2000);
      const facing = await t.G(() => window.__GAME__.ctx.player.facing);
      const want = Math.atan2(-1, 0);
      t.assert(Math.abs(Math.atan2(Math.sin(facing - want), Math.cos(facing - want))) < 0.35, `LMB swings toward the cursor (facing ${facing.toFixed(2)} vs ${want.toFixed(2)})`);
      await t.wait(700);

      // ---- wheel zoom (§2.3), RMB / Q = the Stand, Space = jump, Shift = Tumble (held: sprint), Tab = select
      const z0 = (await t.G(() => window.__GAME__.cam.iso())).zoom;
      await page.mouse.wheel(0, 240);
      await t.frames(10);
      const z1 = (await t.G(() => window.__GAME__.cam.iso())).zoom;
      t.assert(z1 > z0, `wheel down zooms out (${z0} → ${z1.toFixed(3)})`);
      await page.mouse.wheel(0, -240);
      await t.frames(5);
      await page.keyboard.down('KeyQ');
      const guard = await until(t, () => window.__GAME__.ctx.player.stateName === 'guard', null, { sim: 1 });
      await shot(t, 'desktop-04-stand');
      await page.keyboard.up('KeyQ');
      t.assert(!!guard, 'Q = the Stand (TT3)');
      await t.clearEvents();
      await page.keyboard.down('Space'); await t.wait(250); await page.keyboard.up('Space');
      t.assert(await t.waitForEvent('player:jump', 1500), 'Space = jump (TT3)');
      await t.wait(900);
      await t.clearEvents();
      await t.tap('ShiftLeft');
      t.assert(await t.waitForEvent('player:dodge', 1500), 'Shift = Tumble');
      await t.wait(600);
      // Shift held past 0.18 s = sprint (the virtual action; package A makes it Zoomies speed)
      await page.keyboard.down('ShiftLeft');
      const spr = await until(t, () => window.__GAME__.ctx.input.down('sprint'), null, { sim: 1.5 });
      await page.keyboard.up('ShiftLeft');
      t.assert(!!spr, 'Shift held = sprint');
      await t.frames(3);
      t.assert(!(await t.G(() => window.__GAME__.ctx.input.down('sprint'))), 'sprint ends with Shift');
      await t.wait(600);
      // ---- G kitten ability (Mochi's Shield Wall, smart cast) and the ability bar
      await t.G(() => { const c = window.__GAME__.ctx; c.state.companions.unlocked = ['mochi']; c.companions.setActive(['mochi']); });
      await t.frames(30);
      await t.clearEvents();
      await t.tap('KeyG');
      t.assert(await t.waitForEvent('companion:ability', 3000), 'G casts the kitten ability (TT3)');
      await t.wait(300);
      const bar = await t.G(() => { const b = document.querySelector('.ability-bar'); return { on: b?.classList.contains('is-on'), slots: b?.querySelectorAll('.ab-slot').length, cd: !!document.querySelector('.ab-ability.is-cd') }; });
      t.assert(bar.on && bar.slots >= 8, `the ability bar shows its slots (${JSON.stringify(bar)})`);
      t.assert(bar.cd, 'the kitten slot shows its cooldown sweep');
      await shot(t, 'desktop-05-ability-bar');
      // ---- Tab selects the nearest hostile (gold ring); the camera never moves for it
      const me3 = await pos(t);
      await t.G(([x, z]) => window.__GAME__.spawn('rat_pike', x, z), [me3[0] - 2, me3[2] + 5]);
      await t.frames(20);
      const yaw0 = (await t.G(() => window.__GAME__.cam.iso())).yaw;
      await t.tap('Tab');
      await t.frames(5);
      const sel = await t.G(() => ({ t: !!window.__GAME__.ctx.cam.lockTarget, yaw: window.__GAME__.cam.iso().yaw }));
      t.assert(sel.t && Math.abs(sel.yaw - yaw0) < 1e-6, 'Tab selects without turning the camera');
      await shot(t, 'desktop-06-selected');
      // Shift+Tab cycles back (lockPrev; no hardcoded Shift in the camera)
      await t.clearEvents();
      await page.keyboard.down('ShiftLeft'); await page.keyboard.press('Tab'); await page.keyboard.up('ShiftLeft');
      await t.frames(3);
      t.assert(await t.G(() => !!window.__GAME__.ctx.cam.lockTarget), 'Shift+Tab keeps a selection');
      // Z = peek and the ranges overlay (one hold; Alt and Ctrl are gone)
      await page.keyboard.down('KeyZ');
      await t.frames(6);
      const pk = await t.G(() => ({ peek: window.__GAME__.ctx.input.down('peek'), ranges: (window.__GAME__.ctx.fx.decals?.stats?.()?.counts?.ranges ?? 0) > 0 }));
      await shot(t, 'desktop-07-peek-ranges');
      await page.keyboard.up('KeyZ');
      t.assert(pk.peek && pk.ranges, `Z = peek + the ranges overlay (${JSON.stringify(pk)})`);
      await t.tap('KeyH');
      await t.G(() => { const c = window.__GAME__.ctx; c.cam.select(null); c.companions.setActive([]); for (const e of [...c.enemies.list]) c.enemies.despawn(e); });
    },
  },
  {
    // TT3 §11.2: browser shortcuts stay the browser's: a key pressed with Ctrl or Meta held sets no game action
    name: 'controls:browser-keys', order: 30.5, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await dayMeadow(t, 'start');
      await t.frames(10);
      await t.clearEvents();
      const p0 = await pos(t);
      // synthetic keydowns (a real Ctrl+W would close the test tab in a headed run): every game key with Ctrl / Meta
      const r = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx, inp = c.input;
        const seen = new Set();
        const off = g.game.addFrameHook(() => { for (const [a, st] of inp.actions) if (st.down || st.pressed) seen.add(a); });
        const fire = (code, mods) => {
          window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true, cancelable: true, ...mods }));
        };
        const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
        const combos = [['KeyW', { ctrlKey: true }], ['KeyD', { ctrlKey: true }], ['KeyW', { metaKey: true }], ['KeyS', { ctrlKey: true }], ['KeyA', { metaKey: true }],
          ['Space', { ctrlKey: true }], ['KeyF', { ctrlKey: true }], ['KeyQ', { metaKey: true }], ['KeyE', { ctrlKey: true }], ['KeyR', { ctrlKey: true }], ['Tab', { ctrlKey: true }],
          ['KeyP', { metaKey: true }], ['KeyZ', { ctrlKey: true }], ['KeyG', { ctrlKey: true }], ['Digit1', { ctrlKey: true }]];
        for (const [code, mods] of combos) { fire(code, mods); await g.waitFrames(3); up(code); await g.waitFrames(1); }
        fire('ControlLeft', { ctrlKey: true }); await g.waitFrames(3); up('ControlLeft');
        fire('MetaLeft', { metaKey: true }); await g.waitFrames(3); up('MetaLeft');
        fire('AltLeft', { altKey: true }); await g.waitFrames(3); up('AltLeft');
        await g.waitFrames(10);
        off();
        return { seen: [...seen], keys: [...inp.keys], mode: g.mode, move: [inp.move.x, inp.move.y], state: c.player.stateName };
      });
      const p1 = await pos(t);
      t.log(`Ctrl / Meta combos: ${JSON.stringify(r)}`);
      t.assert(r.seen.length === 0, `no game action from Ctrl+W, Ctrl+D, Meta+W and the rest (${r.seen.join(', ')})`);
      t.assert(r.mode === 'play', `no pause / menu (${r.mode})`);
      t.assert(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) < 0.05, 'she never moved');
      const ev = await t.events();
      for (const e of ['player:jump', 'player:dodge', 'player:swing', 'companion:ability', 'player:order']) t.assert(!ev.includes(e), `no ${e}`);
      // the plain key still works right after
      await t.hold('KeyW', 500);
      const p2 = await pos(t);
      t.assert(Math.hypot(p2[0] - p1[0], p2[2] - p1[2]) > 0.5, 'plain W walks right after');
    },
  },
  {
    // TT3 §11.5 K8 + acceptance: rebind the Stand from the pause menu's Controls card, then pass the parry lesson with it
    name: 'controls:rebind', order: 36, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      const page = t.page;
      // practice at the parry lesson (the earlier lesson stickers resume it there)
      await t.G(async () => {
        const g = window.__GAME__, c = g.ctx, s = c.state;
        g.story.skip(); c.story.queue.length = 0;
        s.flags = {};
        for (const k of ['prologue.start', 'sticker.bonk', 'sticker.bow', 'sticker.stand']) s.setFlag(k, true);
        await g.loadLevel('meadow', 'practice');
        g.story.skip(); g.setMode('play'); g.god(true); c.input.setDevice('kbm');
        return true;
      });
      await t.frames(20);
      const act = await until(t, () => (window.__GAME__.ctx.story.tutorial.active ? window.__GAME__.ctx.story.tutorial.log.step?.id : null), null, { sim: 8, real: 20000 });
      t.assert(act === 'parry', `practice resumes at the parry lesson (${act})`);
      // ---- pause → Controls → the Stand button
      await t.G(() => window.__GAME__.ctx.ui.pause());
      await until(t, () => (window.__GAME__.ctx.ui?.menus?.paused ? true : null), null, { sim: 2, real: 6000 });
      const cb = await t.G(() => { const b = [...document.querySelectorAll('.menu--pause .btn')].find((x) => /Controls/.test(x.textContent)); const r = b?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; });
      t.assert(!!cb, 'the pause book has a Controls button');
      if (!cb) return;
      await page.mouse.click(cb[0], cb[1]);
      await until(t, () => (window.__GAME__.ctx.ui.menus.has('controls') ? true : null), null, { sim: 2, real: 6000 });
      const box = (a) => t.G((x) => { const b = document.querySelector(`.ctl-bind[data-act="${x}"]`); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, txt: b.textContent, dis: b.disabled }; }, a);
      const g0 = await box('guard');
      t.assert(g0 && g0.txt === 'RMB' && !g0.dis, `the Stand button shows RMB (${JSON.stringify(g0)})`);
      await shot(t, 'rebind-01-card');
      const msg = () => t.G(() => document.querySelector('.ctl-msg')?.textContent ?? '');
      await page.mouse.click(g0.x, g0.y);
      await t.wait(150);
      t.assert(/Press a key/.test(await msg()), `"Press a key" shows (${await msg()})`);
      t.assert(await t.G(() => !!document.querySelector('.ctl-bind.is-capturing')), 'the button blinks while it listens');
      await shot(t, 'rebind-02-press-a-key');
      // refused: Ctrl (a real key), F5 and Ctrl+W (synthetic: a real F5 would reload the page), Esc cancels
      await page.keyboard.down('ControlLeft'); await page.keyboard.up('ControlLeft');
      t.assert(/browser/.test(await msg()), `Ctrl is refused (${await msg()})`);
      await t.G(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F5', key: 'F5', bubbles: true, cancelable: true })); });
      t.assert(/F5 belongs to the browser/.test(await msg()), `F5 is refused (${await msg()})`);
      await t.G(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, bubbles: true, cancelable: true })); });
      t.assert(/Ctrl\+W/.test(await msg()), `Ctrl+W is refused (${await msg()})`);
      await page.keyboard.press('KeyW');
      t.assert(/walks/.test(await msg()), `W (walking) is refused (${await msg()})`);
      await page.keyboard.press('Escape');
      await t.wait(100);
      t.assert(await t.G(() => !document.querySelector('.ctl-bind.is-capturing') && window.__GAME__.ctx.ui.menus.has('controls')), 'Esc cancels the capture (the card stays)');
      t.assert((await t.G(() => window.__GAME__.ctx.input.codesFor('guard'))).includes('Mouse2'), 'nothing changed yet');
      // N: bound
      await page.mouse.click(g0.x, g0.y);
      await t.wait(150);
      await page.keyboard.press('KeyN');
      await t.wait(150);
      const b1 = await t.G(() => ({ st: window.__GAME__.ctx.state.settings.bindings, codes: window.__GAME__.ctx.input.codesFor('guard'), txt: document.querySelector('.ctl-bind[data-act="guard"]')?.textContent }));
      t.log(`after N: ${JSON.stringify(b1)} msg "${await msg()}"`);
      t.assert(b1.codes[0] === 'KeyN' && !b1.codes.includes('Mouse2') && b1.codes.includes('KeyQ'), `the Stand is N (+ Q, L) now (${b1.codes})`);
      t.assert(b1.txt === 'N', `the card shows N (${b1.txt})`);
      await shot(t, 'rebind-03-bound');
      // conflict swap: Jump → F (the Paw Trick's key): the Paw Trick takes Space
      const j0 = await box('jump');
      await page.mouse.click(j0.x, j0.y); await t.wait(150);
      await page.keyboard.press('KeyF'); await t.wait(150);
      const sw = await t.G(() => ({ jump: window.__GAME__.ctx.input.codesFor('jump'), trick: window.__GAME__.ctx.input.codesFor('trick'), msg: document.querySelector('.ctl-msg')?.textContent }));
      t.assert(sw.jump[0] === 'KeyF' && sw.trick.includes('Space') && /Swapped/.test(sw.msg), `a conflict swaps (${JSON.stringify(sw)})`);
      // put Jump back (Space again: the Paw Trick takes F back)
      await page.mouse.click(j0.x, j0.y); await t.wait(150);
      await page.keyboard.press('Space'); await t.wait(150);
      t.assert((await t.G(() => window.__GAME__.ctx.input.codesFor('trick')))[0] === 'KeyF', 'swapped back');
      // close: Back, then resume
      await t.G(() => { const u = window.__GAME__.ctx.ui; u.menus.closeAll(); if (u.menus.paused) u.resume?.(); window.__GAME__.setMode('play'); });
      await t.frames(20);
      // ---- the parry lesson with N: the prompt names N; walk to the stand spot (WASD), tap N on the shield
      const prompt = await t.G(() => document.querySelector('.ui-guide')?.innerHTML ?? '');
      t.log(`parry prompt: ${prompt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120)}`);
      const tg = await t.G(() => { const g = window.__GAME__.ctx.story.guideTarget?.(); return g ? [g.x, g.z, g.textKey] : null; });
      if (tg) await walkKeys(t, tg[0], tg[1], { r: 0.35, ms: 10000 });
      for (let k = 0; k < 6; k++) {
        const s0 = await t.G(() => ({ tk: window.__GAME__.ctx.story.guideTarget?.()?.textKey, d: (() => { const g = window.__GAME__, w = g.ctx.actors.get('wobble_knight'), p = g.ctx.player.pos; return w ? Math.hypot(w.pos.x - p.x, w.pos.z - p.z) : null; })() }));
        if (s0.tk !== 'onb.wobble.close') break;
        const tg2 = await t.G(() => { const g = window.__GAME__.ctx.story.guideTarget?.(); return g ? [g.x, g.z] : null; });
        if (tg2) await walkKeys(t, tg2[0], tg2[1], { r: 0.25, ms: 4000 });
      }
      const html = await t.G(() => [...document.querySelectorAll('.ui-guide kbd, .ui-hint kbd, .hud-obj kbd')].map((e) => e.textContent));
      t.assert(html.includes('N'), `the parry prompt names N (${JSON.stringify(html)})`);
      await shot(t, 'rebind-04-parry-prompt');
      let done = false;
      for (let k = 0; k < 6 && !done; k++) {
        const ok = await page.evaluate(() => new Promise((resolve) => {
          const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'), t0 = performance.now();
          const tick = () => { if (!wk || performance.now() - t0 > 9000) { resolve(false); return; } if (wk.phase === 'windup' && wk.phaseT >= wk.atk.windup - 0.11) { resolve(true); return; } requestAnimationFrame(tick); };
          tick();
        }));
        if (ok) { await page.keyboard.down('KeyN'); await t.wait(220); await page.keyboard.up('KeyN'); }
        await t.wait(700);
        done = await t.G(() => window.__GAME__.ctx.state.getFlag('prologue.practice') === true);
      }
      t.assert(done, 'the parry lesson passes with the rebound Stand (N)');
      // ---- reset keys to default (the bell starts CS-01 right after practice: let it go first)
      for (let k = 0; k < 8 && await t.G(() => window.__GAME__.ctx.story.isPlaying); k++) { await t.G(() => window.__GAME__.story.skip?.()); await t.wait(400); }
      await until(t, () => (window.__GAME__.mode === 'play' && !window.__GAME__.ctx.levels.loading ? true : null), null, { sim: 4, real: 15000 });
      await t.G(() => window.__GAME__.ctx.ui.pause());
      await until(t, () => (window.__GAME__.ctx.ui?.menus?.paused ? true : null), null, { sim: 2, real: 6000 });
      await t.G(() => window.__GAME__.ctx.ui.menus.openControls());
      await until(t, () => (window.__GAME__.ctx.ui.menus.has('controls') ? true : null), null, { sim: 2, real: 6000 });
      const rs = await t.G(() => { const b = document.querySelector('.ctl-reset'); b?.scrollIntoView({ block: 'center' }); const r = b?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2, b.classList.contains('is-disabled')] : null; });
      t.assert(rs && !rs[2], `the reset button is live while keys are rebound (${JSON.stringify(rs)})`);
      if (rs) { await page.mouse.move(rs[0], rs[1]); await t.wait(80); await page.mouse.click(rs[0], rs[1]); }
      await until(t, () => (Object.keys(window.__GAME__.ctx.state.settings.bindings ?? {}).length === 0 ? true : null), null, { sim: 2, real: 3000 });
      const after = await t.G(() => ({ b: window.__GAME__.ctx.state.settings.bindings, g: window.__GAME__.ctx.input.codesFor('guard') }));
      t.assert(Object.keys(after.b ?? {}).length === 0 && after.g[0] === 'Mouse2', `Reset keys to default (${JSON.stringify(after)})`);
      await t.G(() => { const u = window.__GAME__.ctx.ui; u.menus.closeAll(); if (u.menus.paused) u.resume?.(); window.__GAME__.setMode('play'); });
    },
  },
  {
    // TT3 §11.2 acceptance: a standard-layout gamepad alone drives the four practice lessons
    name: 'controls:pad-lessons', order: 36.5, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      await t.G(async () => {
        const g = window.__GAME__, c = g.ctx, s = c.state;
        g.story.skip(); c.story.queue.length = 0;
        s.flags = {}; s.setFlag('prologue.start', true);
        await g.loadLevel('meadow', 'practice');
        g.story.skip(); g.setMode('play'); g.god(true);
        return true;
      });
      await t.frames(20);
      const pad = (axes, down = []) => stubPad(t, { axes, down });
      const stick = async (x, z) => {             // the left stick toward world (x, z): screen direction from her
        const v = await t.G(([a, b]) => {
          const g = window.__GAME__, p = g.ctx.player.pos, dx = a - p.x, dz = b - p.z, L = Math.hypot(dx, dz) || 1, k = Math.min(1.5, L) / L;
          const me = g.screen(p.x, p.z), ah = g.screen(p.x + dx * k, p.z + dz * k);
          const sx = ah.x - me.x, sy = ah.y - me.y, l = Math.hypot(sx, sy) || 1;
          return { d: L, x: sx / l, y: sy / l };
        }, [x, z]);
        return v;
      };
      const walkPad = async (x, z, r = 0.4, ms = 12000) => {
        const t0 = Date.now(); let v = null;
        while (Date.now() - t0 < ms) {
          v = await stick(x, z);
          if (v.d <= r) break;
          const m = v.d < 1.2 ? 0.55 : 1;
          await pad([v.x * m, v.y * m, 0, 0]);
          await t.wait(80);
        }
        await pad([0, 0, 0, 0]);
        return v?.d;
      };
      const tap = async (btn, ms = 120) => { await pad([0, 0, 0, 0], [btn]); await t.wait(ms); await pad([0, 0, 0, 0]); await t.wait(60); };
      try {
        await pad([0, 0, 0, 0]);
        const act = await until(t, () => window.__GAME__.ctx.story.tutorial.active, null, { sim: 8, real: 20000 });
        t.assert(!!act, 'practice is active');
        // 1 move: the left stick
        // the pad is found by the next probe (every 15 frames while none is live): wait for it, then push the stick
        await pad([0, -0.6, 0, 0]);
        const isPad = await until(t, () => (window.__GAME__.ctx.input.device === 'pad' ? true : null), null, { sim: 3, real: 8000, every: 50 });
        t.assert(!!isPad, 'device pad');
        const txt = await t.G(() => document.querySelector('.ui-guide')?.textContent ?? '');
        t.log(`pad move prompt: ${txt.replace(/\s+/g, ' ').slice(0, 80)}`);
        await shot(t, 'pad-lesson-1-move');
        let tg = await t.G(() => { const g = window.__GAME__.ctx.story.guideTarget?.(); return g ? [g.x, g.z] : null; });
        if (tg) await walkPad(tg[0], tg[1], 1.2);
        const s2 = await until(t, () => window.__GAME__.ctx.story.tutorial.step >= 2 && !window.__GAME__.ctx.story.tutorial.pending, null, { sim: 8, real: 15000 });
        t.assert(!!s2, 'pad: lesson 2 (bonk) after walking with the L-stick');
        // 2 bonk: X (2) ×3 next to the dummy
        await shot(t, 'pad-lesson-2-bonk');
        for (let k = 0; k < 10 && !(await t.G(() => window.__GAME__.ctx.story.tutorial.step >= 3)); k++) {
          const d = await t.G(() => { const p = window.__GAME__.ctx.player.pos; return Math.hypot(p.x, p.z + 76); });
          if (d > 1.8) { await walkPad(0, -77.4, 0.6, 4000); continue; }
          for (let i = 0; i < 3; i++) { await tap(2); await t.wait(200); }
          await t.wait(600);
        }
        const s3 = await until(t, () => window.__GAME__.ctx.story.tutorial.step >= 3 && !window.__GAME__.ctx.story.tutorial.pending, null, { sim: 8, real: 15000 });
        t.assert(!!s3, 'pad: lesson 3 (the Stand) after X ×3');
        // 3 the drill: walk to the stand spot, hold LB (4)
        for (let k = 0; k < 6; k++) {
          const g3 = await t.G(() => { const g = window.__GAME__.ctx.story.guideTarget?.(); return g ? [g.x, g.z, g.textKey] : null; });
          if (!g3 || g3[2] !== 'onb.wobble.close') break;
          await walkPad(g3[0], g3[1], 0.25, 5000);
        }
        await shot(t, 'pad-lesson-3-stand');
        await pad([0, 0, 0, 0], [4]);
        const s4 = await until(t, () => window.__GAME__.ctx.story.tutorial.step >= 4 && !window.__GAME__.ctx.story.tutorial.pending, null, { sim: 15, real: 25000 });
        await pad([0, 0, 0, 0]);
        t.assert(!!s4, 'pad: lesson 4 (parry) after holding LB');
        // 4 parry: tap RB (5) on the shield (the other bumper)
        await shot(t, 'pad-lesson-4-parry');
        let done = false;
        for (let k = 0; k < 6 && !done; k++) {
          const ok = await t.page.evaluate(() => new Promise((resolve) => {
            const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'), t0 = performance.now();
            const tick = () => { if (!wk || performance.now() - t0 > 9000) { resolve(false); return; } if (wk.phase === 'windup' && wk.phaseT >= wk.atk.windup - 0.11) { resolve(true); return; } requestAnimationFrame(tick); };
            tick();
          }));
          if (ok) await tap(5, 200);
          await t.wait(700);
          done = await t.G(() => window.__GAME__.ctx.state.getFlag('prologue.practice') === true);
        }
        t.assert(done, 'pad: the parry lesson passes with a bumper tap');
      } finally {
        await stubPad(t, null);
        await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.ctx.input.setDevice('kbm'); g.setMode('play'); });
      }
    },
  },
  {
    name: 'controls:nav', order: 31, level: 'meadow', spawn: 'start', timeout: 300000,
    async run(t) {
      await dayMeadow(t, 'practice');
      // click-to-move is the `moba` / `diablo` / `mouseOnly` presets' (TT3 §11.2); RMB moves in `moba`
      t.assert((await setPreset(t, 'moba')) === 'moba', 'moba preset on');
      // TT2 §10.3: the practice field's inner fence (z −87, x −20…−2) has ONE open hop link, by the barn door at x −14.5
      // (the rest of the fence keeps its automatic hop off: `onboard.fenceAuto` is never set). From the barn side (south,
      // the camera side at yaw π), click into the field past it: the goal is up-screen, so the click lands on it.
      await t.G(() => { const g = window.__GAME__; g.teleport(-14.5, g.ctx.physics.topAt(-14.5, -90.5), -90.5); });
      await t.frames(60);
      const path0 = await t.G(() => window.__GAME__.nav.path(-14.5, -90.5, -14.5, -83));
      t.log(`nav path ${JSON.stringify(path0?.points?.map((p) => [+p[0].toFixed(1), +p[2].toFixed(1), p[3]]))} partial ${path0?.partial}`);
      t.assert(path0?.ok && !path0.partial, 'a path past the fence');
      t.assert(path0?.points?.some((p) => p[3]), 'it uses the barn-door jump link over the 1 m fence');
      const shut = await t.G(() => window.__GAME__.nav.path(-8, -83, -8, -91.5));
      t.assert(!shut?.points?.some((p) => p[3] && Math.abs(p[0] + 8) < 1), 'no automatic hop on the rest of the fence (TT2)');
      const gsp = await t.G(() => window.__GAME__.screen(-14.5, -83));
      t.assert(gsp?.on, `the goal inside the field is on screen (${JSON.stringify(gsp)})`);
      await t.G(() => window.__GAME__.click(-14.5, -83));
      const done = await until(t, () => { const g = window.__GAME__, p = g.ctx.player.pos; return Math.hypot(p.x + 14.5, p.z + 83) < 0.8 && !g.ctx.player.orders.kind; }, null, { sim: 10 });
      const o = await t.G(() => window.__GAME__.orders());
      t.assert(!!done, `arrives past the fence (${JSON.stringify(await pos(t))})`);
      t.assert(o.hops >= 1, `auto-jumped (${o.hops} hops)`);
      await shot(t, 'nav-01-past-fence');
      // an unreachable click (deep in a big rock / off the map): a partial path or a grey ✕, never a hang
      await t.G(() => window.__GAME__.click(0, -200));
      await t.wait(400);
      const ev = await t.lastEvent('player:order');
      t.assert(ev != null, 'an off-map click still answers (order event)');

      // ---- off a bounce cap (Mushroom Ring cap 4, forest): she never stands on it, so every way off is a steered
      // bounce — a click (real RMB) and then a tap while she springs there both get her down (no endless bouncing)
      await t.G(async () => {
        const g = window.__GAME__, c = g.ctx;
        await g.loadLevel('forest', 'start');
        g.story.skip(); g.setMode('play'); g.god(true); c.input.setDevice('kbm');
        return true;
      });
      await t.frames(30);
      await t.G(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); });
      const CAP4 = [-26.4, -61.3];
      const onCap4 = async () => {
        await t.G(([x, z]) => { const g = window.__GAME__; g.ctx.player.orders.clear('smoke'); g.teleport(x, g.ctx.physics.topAt(x, z) + 0.6, z); }, CAP4);
        // wait for her to spring off it at least once
        return until(t, () => { const g = window.__GAME__, p = g.ctx.player; return g.game.time - (p.lastBounceT ?? -1e9) < 0.3; }, null, { sim: 4 });
      };
      const offCap = (goal) => until(t, ([gx, gz, cx, cz]) => {
        const g = window.__GAME__, p = g.ctx.player;
        return p.onGround && Math.hypot(p.pos.x - cx, p.pos.z - cz) > 1.6 && (Math.hypot(p.pos.x - gx, p.pos.z - gz) < 1.0 || !p.orders.kind);
      }, [goal[0], goal[1], CAP4[0], CAP4[1]], { sim: 12, real: 60000 });
      const fp = await t.G(([x, z]) => window.__GAME__.nav.path(x, z, -20.5, -60), CAP4);
      t.log(`cap 4 → ground: ${JSON.stringify(fp?.points?.map((p) => [+p[0].toFixed(1), +p[2].toFixed(1), p[3]]))}`);
      t.assert(fp?.ok && fp.points.filter((p) => p[3]).length >= 1 && fp.points.find((p) => p[3])[3] === 'bounce', 'the first link off a bounce cap is a bounce (never a drop)');
      for (const via of ['mouse', 'tap']) {
        t.assert(!!(await onCap4()), `${via}: she bounces on cap 4`);
        await t.wait(600);                                               // the camera settles on her up there
        // an on-screen open-ground spot near the ring (the ring's camera hint turns the view)
        const pick = await t.G(() => {
          const g = window.__GAME__, ph = g.ctx.physics, W = innerWidth, H = innerHeight;
          for (const [x, z] of [[-21.5, -60], [-22, -58], [-23, -64.5], [-24, -58.5], [-21, -63], [-29.5, -63], [-30, -60], [-24.5, -66]]) {
            const s = g.screen(x, z, ph.topAt(x, z));
            if (s && s.x > 40 && s.x < W - 40 && s.y > 60 && s.y < H - 120 && ph.navWalkable?.(x, z) !== false && Math.abs(ph.topAt(x, z) - ph.heightAt(x, z)) < 0.3) return { goal: [x, z], sp: s };
          }
          return null;
        });
        if (!t.assert(!!pick, `${via}: an on-screen ground spot near cap 4`)) continue;
        const { goal, sp } = pick;
        if (via === 'mouse') {
          await t.page.mouse.move(sp.x, sp.y); await t.wait(120);
          await t.page.mouse.click(sp.x, sp.y, { button: 'right' });
          const ord = await t.waitForEvent('player:order', 3000);
          if (!ord) {
            t.log(`mouse: no order; at px ${JSON.stringify(sp)} el ${await t.G(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}` : null; }, [sp.x, sp.y])} mode ${await t.G(() => window.__GAME__.mode)} ev ${JSON.stringify(await t.G(() => window.__GAME__.events.slice(-8)))}`);
            await shot(t, 'nav-02-cap4-noclick');
          }
        }
        else await t.G(([x, y]) => window.__GAME__.ctx.input.addTap(x, y, 'tap'), [sp.x, sp.y]);
        const off = await offCap(goal);
        const st = await t.G(() => { const g = window.__GAME__, p = g.ctx.player; return { pos: p.pos.toArray().map((v) => +v.toFixed(2)), o: p.orders.kind, clr: p.orders.lastClear, hops: p.orders.hops }; });
        t.log(`${via} off cap 4: ${JSON.stringify(st)} at px ${JSON.stringify(sp)}`);
        if (!t.assert(!!off, `${via}: a click / tap on the ground gets her off the bounce cap (${JSON.stringify(st)})`)) await shot(t, `nav-02-cap4-${via}-stuck`);
        await t.G(() => { window.__GAME__.ctx.player.orders.clear('smoke'); window.__GAME__.ctx.input.setDevice('kbm'); });
      }
      await shot(t, 'nav-02-off-cap');
      // a far order from the cap (the reported trap: the path starts with a link off it) leaves the ring
      await onCap4();
      await t.G(() => window.__GAME__.order('move', [-22, -50]));
      const far = await until(t, ([cx, cz]) => { const p = window.__GAME__.ctx.player; return p.onGround && Math.hypot(p.pos.x - cx, p.pos.z - cz) > 3; }, CAP4, { sim: 10, real: 60000 });
      t.assert(!!far, `a far order from cap 4 leaves the cap (${JSON.stringify(await pos(t))})`);
    },
  },
  {
    name: 'controls:levels', order: 32, level: null, timeout: 300000,
    async run(t) {
      const rows = [
        ['meadow', 'start'], ['forest', 'start'], ['forest', 'camp'], ['town', 'start'], ['town', 'hub'], ['gate', 'start'], ['gate', 'line'],
      ];
      for (const [id, spawn] of rows) {
        const ok = await t.G(async ([i, s]) => {
          const g = window.__GAME__, c = g.ctx;
          g.story.skip(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
          for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
          let lv; try { lv = await g.loadLevel(i, s); } catch { return false; }
          g.story.skip(); g.setMode('play'); g.god(true);
          return !!lv?.spawns?.[s];               // LevelManager silently falls back to 'start' on an unknown spawn
        }, [id, spawn]);
        t.assert(ok, `${id}/${spawn}: the spawn exists (no silent fallback to start)`);
        if (!ok) continue;
        await t.frames(40);
        await t.G(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); });
        await t.frames(30);
        const st = await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos, s = g.state(); return { iso: g.cam.iso(), fog: g.fogAt(p.x, p.z), calls: s.calls, mode: g.mode }; });
        t.log(`${id}/${spawn}: d ${st.iso.dist.toFixed(1)} yaw ${st.iso.yaw.toFixed(2)} catPx ${st.iso.catPx.toFixed(0)} fog(her) ${st.fog?.toFixed(3)} calls ${st.calls}`);
        t.assert(st.fog < 0.03, `${id}: fog on her < 3 % (${st.fog?.toFixed(3)})`);
        t.assert(st.iso.catPx >= 30, `${id}: cat ≥ 30 px`);
        await shot(t, `level-${id}-${spawn}`);
      }
      const gate = await t.G(() => window.__GAME__.cam.iso().yaw);
      t.assert(Math.abs(gate) < 1e-6, 'the gate looks north (yaw 0): onward is screen-up');
    },
  },
  {
    name: 'controls:touch', order: 33, level: null, timeout: 900000,
    async run(t) {
      for (const [w, h, tag] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
        const errors = [];
        const ctxM = await t.browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        const pg = await ctxM.newPage();
        pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
        const G = async (fn, arg) => { const hd = await pg.evaluateHandle(fn, arg); try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); } };
        const mshot = async (name) => { try { await pg.screenshot({ path: path.join(t.shotsDir, DIR, `${name}.png`) }); } catch (e) { t.warn(`touch shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); } };
        const untilM = async (fn, arg, ms = 8000) => { const t0 = Date.now(); let v = await G(fn, arg); while (!v && Date.now() - t0 < ms) { await pg.waitForTimeout(120); v = await G(fn, arg); } return v; };
        /**
         * Synthetic touch pointer on the touch layer (drag gestures Playwright's touchscreen can't do). Like a real
         * pointer with capture, moves and the release go to the element the pointer went down on.
         */
        const ptr = (type, x, y, id = 11) => G(([tp, px, py, pid]) => {
          const caps = (window.__ptrCap ??= {});
          let el = tp === 'pointerdown' ? (document.elementFromPoint(px, py)?.closest?.('.tbtn, .touch-root') ?? document.querySelector('.touch-root')) : (caps[pid] ?? document.querySelector('.touch-root'));
          if (tp === 'pointerdown') caps[pid] = el;
          el.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: pid, clientX: px, clientY: py, pointerType: 'touch', isPrimary: pid === 11 }));
          if (tp === 'pointerup' || tp === 'pointercancel') delete caps[pid];
          return el.className;
        }, [type, x, y, id]);
        try {
          // generous load wait: a fresh context on a loaded machine can take well past the default 30 s
          await pg.goto(`${t.base}?test=1&seed=1`, { timeout: 200000, waitUntil: 'domcontentloaded' });
          await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 200000 });
          await G(async () => {
            const g = window.__GAME__, c = g.ctx;
            g.story.skip?.(); g.setMode('play');
            for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
            await g.loadLevel('meadow', 'start');
            return true;
          });
          await pg.waitForTimeout(600);
          await pg.touchscreen.tap(Math.round(w * 0.6), Math.round(h * 0.4));     // first touch: device 'touch'
          await G(() => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); g.god(true); g.ctx.ui.touch.enable(true); });
          await pg.waitForTimeout(500);
          const s0 = await G(() => ({ dev: window.__GAME__.ctx.input.device, iso: window.__GAME__.cam.iso(), rot: !!document.querySelector('.ui-rotate.is-on'), btns: document.querySelectorAll('.touch-cluster .tbtn:not(.is-hidden)').length }));
          t.log(`${tag}: device ${s0.dev}, d ${s0.iso.dist.toFixed(1)}, fov ${s0.iso.fov}, catPx ${s0.iso.catPx.toFixed(1)}, buttons ${s0.btns}`);
          t.assert(s0.dev === 'touch', `${tag}: device touch`);
          t.assert(!s0.rot, `${tag}: no blocking rotate card (C8)`);
          t.assert(s0.iso.catPx >= (tag === 'portrait' ? 28 : 30) - 0.5, `${tag}: cat size ${s0.iso.catPx.toFixed(1)} px`);
          t.assert(s0.btns >= 6, `${tag}: the cluster shows (${s0.btns})`);
          await mshot(`touch-${tag}-01`);
          // ---- floating joystick: drag up in the left zone → she walks screen-up (+Z)
          const sx = Math.round(w * 0.2), sy = Math.round(h * 0.85);
          const p0 = await G(() => window.__GAME__.ctx.player.pos.toArray());
          await ptr('pointerdown', sx, sy);
          for (let k = 1; k <= 6; k++) await ptr('pointermove', sx, sy - k * 12);
          await pg.waitForTimeout(900);
          await mshot(`touch-${tag}-02-stick`);
          await ptr('pointerup', sx, sy - 72);
          const p1 = await G(() => window.__GAME__.ctx.player.pos.toArray());
          t.assert(p1[2] - p0[2] > 1.5, `${tag}: the joystick walks her up-screen (Δz ${(p1[2] - p0[2]).toFixed(2)})`);
          // ---- tap the ground ahead: a move order (real touch tap)
          const tgt = await G(() => { const g = window.__GAME__, p = g.ctx.player.pos; return { s: g.screen(p.x - 1.2, p.z + 3), w: [p.x - 1.2, p.z + 3] }; });
          await pg.waitForTimeout(400);
          await pg.touchscreen.tap(Math.round(tgt.s.x), Math.round(tgt.s.y));
          // the pick is the surface under the finger: when a crate / stump stands in front of the target point along the
          // lens ray, the tap lands on its top (a hop up), so arriving at the order's own point counts too
          const moved = await untilM((wz) => {
            const g = window.__GAME__, p = g.ctx.player.pos, o = g.lastEvent('player:order')?.point;
            return Math.hypot(p.x - wz[0], p.z - wz[1]) < 1.0 || (o && !g.ctx.player.orders.kind && Math.hypot(p.x - o[0], p.z - o[2]) < 1.0);
          }, tgt.w, 8000);
          if (!t.assert(!!moved, `${tag}: tap-to-move arrives`)) t.log(JSON.stringify(await G(() => ({ o: window.__GAME__.orders(), p: window.__GAME__.ctx.player.pos.toArray(), ev: window.__GAME__.events.slice(-12), ord: window.__GAME__.lastEvent('player:order'), tc: { stick: window.__GAME__.ctx.ui.touch.stick.id, free: window.__GAME__.ctx.ui.touch.free.size }, mv: window.__GAME__.ctx.input.move }))) + ' target ' + JSON.stringify(tgt));
          // back on open ground (the tap may have put her on a crate top) for the rat tap
          await G(() => { const g = window.__GAME__, p = g.ctx.player.pos, h = g.ctx.physics.heightAt(p.x, p.z); if (p.y - h > 0.3) { const q = g.ctx.physics.nearestWalkable?.(p.x - 2, p.z - 2, 3) ?? { x: p.x - 2, z: p.z - 2 }; g.teleport(q.x, g.ctx.physics.heightAt(q.x, q.z), q.z); } });
          await pg.waitForTimeout(300);
          // ---- tap a rat: select + attack order; it falls
          const rat = await G(() => { const g = window.__GAME__, p = g.ctx.player.pos; const e = g.spawn('rat_pike', p.x - 2.5, p.z + 2); window.__tRat = e; return [e.pos.x, e.pos.z]; });
          await pg.waitForTimeout(700);
          const rsp = await G(() => { const e = window.__tRat; return window.__GAME__.screen(e.pos.x, e.pos.z, e.pos.y + 0.4); });
          await G(() => window.__GAME__.clearEvents());
          await pg.touchscreen.tap(Math.round(rsp.x), Math.round(rsp.y));
          const died = await untilM(() => !window.__tRat?.alive, null, 14000);
          const ord = await G(() => window.__GAME__.lastEvent('player:order'));
          t.assert(ord?.kind === 'attack', `${tag}: tapping a rat orders an attack (${ord?.kind})`);
          t.assert(!!died, `${tag}: the auto-attack (loop on touch) takes it down`);
          await mshot(`touch-${tag}-03-attack`);
          // ---- ⚔ tap swings; 🛡 hold guards; Jump; Tumble button
          const btn = (a) => G((x) => { const r = document.querySelector(`.tbtn[data-action="${x}"]`).getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; }, a);
          await G(() => window.__GAME__.clearEvents());
          const [ax, ay] = await btn('attack');
          // diagnostics for the first-tap check (review: a fresh ⚔ tap after an auto-attack kill was once dropped): the
          // button's pointer events, the element under the button centre, and every sim step that saw a press or a buffer
          await G(([x, y]) => { const g = window.__GAME__, p = g.ctx.player, inp = g.ctx.input; window.__atkTrace = []; window.__atkHit = document.elementFromPoint(x, y)?.className ?? null;
            if (!p.__ri) { p.__ri = p._readInput; p._readInput = function (dt) { const pr = inp.pressed('attack'), sup = this.orders.suppressAttack; const r = p.__ri.call(this, dt); if (window.__atkTrace && window.__atkTrace.length < 200 && (pr || this.attackBuf > 0)) window.__atkTrace.push({ t: +g.ctx.game.time.toFixed(2), pr, sup, buf: +this.attackBuf.toFixed(2), st: this.state, sw: this.swing?.def?.id ?? null, o: this.orders.kind }); return r; }; }
            const b = document.querySelector('.tbtn[data-action="attack"]'); window.__atkPtr = []; for (const k of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(k, (e) => window.__atkPtr.push(`${k}:${e.pointerId}`), { capture: true, once: true }); }, [ax, ay]);
          await pg.touchscreen.tap(ax, ay);
          let swung = await untilM(() => window.__GAME__.events.includes('player:swing'), null, 3000);
          if (!swung) t.log(`${tag}: first ⚔ tap gave no swing ${JSON.stringify(await G(() => ({ st: window.__GAME__.ctx.player.state, o: window.__GAME__.orders().kind, mode: window.__GAME__.ctx.game.mode, hit: window.__atkHit, ptr: window.__atkPtr, steps: window.__atkTrace })))}`);
          await G(() => { const p = window.__GAME__.ctx.player; if (p.__ri) { p._readInput = p.__ri; delete p.__ri; } window.__atkTrace = null; });
          t.assert(swung, `${tag}: the first ⚔ tap swings (no retry)`);
          const [gx, gy] = await btn('guard');
          await ptr('pointerdown', gx, gy, 21);
          const gd = await untilM(() => window.__GAME__.ctx.player.stateName === 'guard', null, 2000);
          await mshot(`touch-${tag}-04-guard`);
          await ptr('pointerup', gx, gy, 21);
          t.assert(!!gd, `${tag}: 🛡 hold = the Stand`);
          await pg.waitForTimeout(300);
          // ---- swipe on the free area = Tumble
          await G(() => window.__GAME__.clearEvents());
          const fx = Math.round(w * 0.62), fy = Math.round(h * 0.45);
          await pg.waitForTimeout(400);
          await G(([x, y]) => {                                  // one synchronous gesture: a swipe is ≤ 150 ms
            const el = document.querySelector('.touch-root');
            const ev = (tp, px) => el.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: 31, clientX: px, clientY: y, pointerType: 'touch' }));
            ev('pointerdown', x); ev('pointermove', x + 30); ev('pointermove', x + 70); ev('pointerup', x + 70);
          }, [fx, fy]);
          t.assert(await untilM(() => window.__GAME__.events.includes('player:dodge'), null, 2000), `${tag}: a swipe tumbles`);
          await pg.waitForTimeout(500);
          // ---- the kitten portrait: drag = aim (indicator), onto ✕ = cancel
          await G(() => { const c = window.__GAME__.ctx; c.state.companions.unlocked = ['mochi']; c.companions.setActive(['mochi']); c.state.settings.castMode = 'smart'; });
          await pg.waitForTimeout(800);
          const [bx, by] = await btn('ability');
          await G(() => window.__GAME__.clearEvents());
          await ptr('pointerdown', bx, by, 41);
          for (let k = 1; k <= 5; k++) await ptr('pointermove', bx - k * 14, by - k * 10, 41);
          // poll (not one read after a fixed wait): under load the aim can arm a few frames late
          const aimQ = () => ({ active: !!window.__GAME__.ctx.companions.aim?.active, chip: !!document.querySelector('.tb-cancel.is-on') });
          await untilM(() => !!window.__GAME__.ctx.companions.aim?.active && !!document.querySelector('.tb-cancel.is-on'), null, 4000);
          const aim = await G(aimQ);
          await mshot(`touch-${tag}-05-ability-aim`);
          t.assert(aim.active, `${tag}: dragging the portrait aims the ability (indicator)`);
          t.assert(aim.chip, `${tag}: the ✕ chip shows while aiming`);
          const chip = await G(() => { const r = document.querySelector('.tb-cancel').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; });
          await G(([x, y]) => { const el = document.querySelector('.tbtn[data-action="ability"]'); el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 41, clientX: x, clientY: y, pointerType: 'touch' })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, clientX: x, clientY: y, pointerType: 'touch' })); }, chip);
          await pg.waitForTimeout(500);
          const cast = await G(() => window.__GAME__.events.includes('companion:ability'));
          t.assert(!cast, `${tag}: releasing on ✕ cancels (no cast)`);
          // a plain tap on the portrait = smart cast
          await pg.touchscreen.tap(bx, by);
          t.assert(await untilM(() => window.__GAME__.events.includes('companion:ability'), null, 3000), `${tag}: a portrait tap smart-casts`);
          // ---- pinch zooms (two synthetic pointers on the free area)
          const z0 = (await G(() => window.__GAME__.cam.iso())).zoom;
          const cx = Math.round(w * 0.5), cy = Math.round(h * (tag === 'portrait' ? 0.42 : 0.32));
          await ptr('pointerdown', cx - 20, cy, 51); await ptr('pointerdown', cx + 20, cy, 52);
          for (let k = 1; k <= 6; k++) { await ptr('pointermove', cx - 20 - k * 10, cy, 51); await ptr('pointermove', cx + 20 + k * 10, cy, 52); }
          await ptr('pointerup', cx - 80, cy, 51); await ptr('pointerup', cx + 80, cy, 52);
          await pg.waitForTimeout(300);
          const z1 = (await G(() => window.__GAME__.cam.iso())).zoom;
          t.assert(z1 < z0, `${tag}: pinch out zooms in (${z0} → ${z1.toFixed(3)})`);
          await mshot(`touch-${tag}-06-end`);
          await G(() => { const c = window.__GAME__.ctx; c.companions.setActive([]); });
        } catch (e) { t.fail(`${tag}: ${e?.message ?? e}`); }
        finally { await ctxM.close(); }
        for (const e of errors) t.fail(`${tag} page: ${e}`);
      }
    },
  },
  {
    name: 'controls:classic', order: 34, level: null, timeout: 200000,
    async run(t) {
      const errors = [];
      const ctxC = await t.browser.newContext({ viewport: { width: 1280, height: 720 } });
      const pg = await ctxC.newPage();
      pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
      const G = (fn, arg) => pg.evaluate(fn, arg);
      try {
        await pg.goto(`${t.base}?test=1&seed=1&cam=classic&level=meadow&spawn=start`);
        await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 200000 });
        await G(() => { const g = window.__GAME__, c = g.ctx; g.story.skip(); g.setMode('play'); for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true); g.god(true); });
        await pg.waitForTimeout(800);
        const s = await G(() => ({ iso: window.__GAME__.ctx.cam.isIso, dist: window.__GAME__.ctx.cam.distance, bind: window.__GAME__.ctx.input.codesFor('guard') }));
        t.assert(s.iso === false, '?cam=classic runs the orbit camera');
        t.assert(s.dist < 6, `classic arm ${s.dist}`);
        t.assert(s.bind.includes('Mouse2'), 'classic: RMB guards');
        const p0 = await G(() => window.__GAME__.ctx.player.pos.toArray());
        // hold W until she has walked 1.5 m (a loaded machine runs fewer sim steps per wall-clock second), at most 5 s
        await pg.keyboard.down('KeyW');
        let p1 = p0;
        for (let i = 0; i < 25; i++) {
          await pg.waitForTimeout(200);
          p1 = await G(() => window.__GAME__.ctx.player.pos.toArray());
          if (Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1.5) break;
        }
        await pg.keyboard.up('KeyW');
        t.assert(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1.5, 'classic: W walks');
        await pg.screenshot({ path: path.join(t.shotsDir, DIR, 'classic.png') });
      } catch (e) { t.fail(`classic: ${e?.message ?? e}`); } finally { await ctxC.close(); }
      for (const e of errors) t.fail(`classic page: ${e}`);
    },
  },
  {
    name: 'controls:pad', order: 35, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      await dayMeadow(t, 'start');
      try {
        // right stick pushed right: the device turns to pad and the ground reticle shows ~6 m out
        await stubPad(t, { axes: [0, 0, 0.95, 0], down: [] });
        const on = await until(t, () => { const g = window.__GAME__, s = g.ctx.fx.decals?.stats?.(); return g.ctx.input.device === 'pad' && (s?.counts?.reticle ?? 0) > 0 ? { dev: g.ctx.input.device, aim: g.ctx.player.aim?.source } : null; }, null, { sim: 4 });
        t.assert(!!on, `pad RS: device pad + the ground reticle (${JSON.stringify(on)})`);
        if (on) t.assert(on.aim === 'explicit', `pad RS is the explicit aim (${on.aim})`);
        await t.frames(20);
        await shot(t, 'pad-01-reticle');
        // released: it lingers ~1 s, then goes
        await stubPad(t, { axes: [0, 0, 0, 0], down: [] });
        await t.frames(6);
        const linger = await t.G(() => window.__GAME__.ctx.fx.decals.stats().counts.reticle ?? 0);
        t.assert(linger > 0, 'the reticle lingers after release');
        const gone = await until(t, () => !(window.__GAME__.ctx.fx.decals.stats().counts.reticle > 0), null, { sim: 3 });
        t.assert(!!gone, 'the reticle is gone ~1 s after release');
        // TT3 §11.2: View (8) cycles the zoom now
        const zA = (await t.G(() => window.__GAME__.cam.iso())).zoom;
        await stubPad(t, { axes: [0, 0, 0, 0], down: [8] });
        await t.frames(4);
        await stubPad(t, { axes: [0, 0, 0, 0], down: [] });
        await t.frames(20);
        const zB = (await t.G(() => window.__GAME__.cam.iso())).zoom;
        t.assert(Math.abs(zB - zA) > 1e-3, `pad View cycles the zoom (${zA} → ${zB})`);
        // Start (9): the pause book; its Controls button opens the card (the card left the View button)
        await stubPad(t, { axes: [0, 0, 0, 0], down: [9] });
        await t.frames(4);
        await stubPad(t, { axes: [0, 0, 0, 0], down: [] });
        const paused = await until(t, () => (window.__GAME__.ctx.ui?.menus?.paused ? true : null), null, { sim: 2, real: 8000 });
        t.assert(!!paused, 'pad Start pauses');
        const btn = await t.G(() => { const b = [...document.querySelectorAll('.menu--pause .btn')].find((x) => /Controls/.test(x.textContent)); if (!b) return false; b.click(); return true; });
        t.assert(btn, 'the pause book has a Controls button');
        const card = await until(t, () => { const u = window.__GAME__.ctx.ui; return u?.menus?.has?.('controls') ? true : null; }, null, { sim: 2, real: 8000 });
        t.assert(!!card, 'pause → Controls opens the controls card');
        await shot(t, 'pad-02-controls-card');
      } finally {
        await stubPad(t, null);
        await t.G(() => { const g = window.__GAME__, u = g.ctx.ui; u?.menus?.closeAll?.(); if (u?.menus?.paused) u.resume?.(); g.ctx.input.setDevice('kbm'); g.setMode('play'); });
      }
    },
  },
];
