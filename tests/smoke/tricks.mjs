// tests/smoke/tricks.mjs  (owner: player, TT3 package A) — the Paw Tricks in the running game (docs/TOKENTAILS-PLAN.md
// §11.3, §11.5 A). Screenshots go to tests/shots/tricks/.
//   tricks:coin    meadow: no trick (and no slot) before the first fight; walking into the Crow Fields hands the ":3"
//                  coin over (trick:unlocked); F at a low crow under the cursor throws the coin and grounds the crow
//   tricks:twirl   forest: the entry hands the Ribbon Twirl over; Space, then Space again in the air and held: the bow
//                  spins, the fall stays ≤ 1.8 m/s and the glide lasts its 1.5 s (no forest gap was added)
//   tricks:cloud   town: the entry hands the Catnip Cloud over; 2 equips it, F on a GRUMP pack: every hyena goes giddy
//                  (no attacks) and its plate shows the friend word; they get up after 2.5 s
//   tricks:inputs  the same slot on touch (844 × 390: the ":3" button casts, a long press opens the picker) and on a
//                  stubbed standard gamepad (RT casts, RT + D-pad right picks the cloud)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

fs.mkdirSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'tricks'), { recursive: true });

/** Page side: the save past the first fight (the hand-overs wait for it), god mode, KBM. */
const PAST_FIRST_FIGHT = () => {
  const g = window.__GAME__, c = g.ctx;
  for (const k of ['onboard.firstFight', 'prologue.armour', 'prologue.tutorial', 'prologue.raid', 'prologue.done']) c.state.setFlag(k, true);
  g.god(true);
  c.input.setDevice?.('kbm');
  return true;
};

/** Page side: despawn every enemy, then spawn `type` at (x, z) (y = ground + `alt`), optionally AI-less. */
const SPAWN_AT = ([type, x, z, alt, ai]) => {
  const g = window.__GAME__, c = g.ctx, THREE = g.THREE;
  const pos = new THREE.Vector3(x, c.physics.heightAt(x, z) + (alt ?? 0), z);
  const e = c.enemies.spawn(type, pos, { facing: Math.atan2(c.player.pos.x - x, c.player.pos.z - z) });
  if (ai === false) e.ai = false;
  if (alt) { e.pos.y = pos.y; e.home.y = pos.y; }
  return e.id;
};
const CLEAR = () => { const c = window.__GAME__.ctx; for (const e of [...(c.enemies?.list ?? [])]) c.enemies.despawn?.(e); return true; };
/** Teleport her to (x, z) facing `f`. */
const TP = ([x, z, f]) => { const g = window.__GAME__, c = g.ctx; c.player.teleport({ pos: new g.THREE.Vector3(x, c.physics.heightAt(x, z), z), facing: f ?? 0 }); return true; };

async function waitFor(t, fn, arg, ms = 4000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    const v = await t.G(fn, arg);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await t.wait(step);
  }
}

export default [
  {
    name: 'tricks:coin', order: 82, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      // 1) before the first fight: nothing owned, no slot on the bar, F does nothing
      const pre = await t.G(() => {
        const c = window.__GAME__.ctx, tr = c.player.tricks;
        return { any: tr.anyOwned(), grant: tr.grant('coin'), slot: !!document.querySelector('.ab-trick:not(.is-hidden)'), tb: document.querySelector('.tb-trick')?.className ?? '' };
      });
      t.assert(!pre.any && pre.grant === false, `no Paw Trick before onboard.firstFight (${JSON.stringify(pre)})`);
      t.assert(!pre.slot, 'no trick slot on the bar before the first fight');
      await t.tap('KeyF');
      await t.frames(10);
      t.assert(!(await t.events()).includes('trick:used'), 'F does nothing before a trick is owned');
      await t.shot('tricks/coin-0-before');
      // 2) past the first fight, into the Crow Fields: the Token Tails Cat hands the coin over
      await t.G(PAST_FIRST_FIGHT);
      await t.G(CLEAR);
      await t.G(TP, [30, 30, 0]);
      const got = await waitFor(t, () => window.__GAME__.ctx.player.tricks.owns('coin'), null, 3000);
      t.assert(got, 'walking into the Crow Fields hands the ":3" coin over');
      t.assert(await t.waitForEvent('trick:unlocked', 1000), 'trick:unlocked {coin}');
      await t.wait(400);
      await t.shot('tricks/coin-1-unlock');
      const bar = await t.G(() => { const s = document.querySelector('.ab-trick'); return s ? { on: !s.classList.contains('is-hidden'), key: s.querySelector('.ab-key')?.textContent ?? '' } : null; });
      t.assert(bar?.on, 'the trick slot appears on the bar once a trick is owned');
      t.log(`bar slot ${JSON.stringify(bar)}`);
      // 3) a crow low over the wheat (2 m): the cursor on it, F throws the coin, the crow is grounded
      await t.G(TP, [30, 30, 0]);
      await t.G(CLEAR);
      await t.G(() => { window.__GAME__.ctx.cam?.zoom?.(0.7); return true; });
      await t.frames(40);
      // a spot 4.5 m away that sits right of her on screen (the camera's yaw is fixed: pick by projection)
      const spot = await t.G(() => {
        const g = window.__GAME__, p = g.ctx.player, W = innerWidth, H = innerHeight;
        let best = null;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, x = p.pos.x + Math.sin(a) * 4.5, z = p.pos.z + Math.cos(a) * 4.5, s = g.screen(x, z, p.pos.y + 2);
          if (!s) continue;
          const sc = Math.abs(s.x - W * 0.72) + Math.abs(s.y - H * 0.42);
          if (!best || sc < best.sc) best = { x, z, sc };
        }
        return best;
      });
      const crowId = await t.G(SPAWN_AT, ['crow', spot.x, spot.z, 2.0, false]);
      await t.frames(30);
      await t.G(() => { const c = window.__GAME__.ctx; c.player.tricks.cd.coin = 0; return true; });
      await t.G(([x, z]) => window.__GAME__.aimAt(x, z), [spot.x, spot.z]);
      await t.frames(3);
      await t.page.keyboard.down('KeyF');
      await t.frames(2);
      await t.page.keyboard.up('KeyF');
      // the coin mid-flight (frozen frames, read for the look)
      const flight = await waitFor(t, () => { const c = window.__GAME__.ctx.player.tricks.coin; return c.active && c.t > 0.12 ? c.t : null; }, null, 1500, 16);
      t.log(`coin in flight at ${flight}`);
      await t.shot('tricks/coin-2-throw', { freeze: true });
      const r = await waitFor(t, (id) => {
        const c = window.__GAME__.ctx, e = c.enemies.list.find((x) => x.id === id), tr = c.player.tricks;
        return e && (e.grounded || e.stateName === 'peck') ? { st: e.stateName, grounded: !!e.grounded, rules: tr.coin.stats.rules, hp: e.hp, max: e.maxHp } : null;
      }, crowId, 3000, 50);
      t.assert(r, 'the coin grounds the low crow');
      t.log(`crow ${JSON.stringify(r)}`);
      t.assert((await t.events()).includes('trick:used'), 'trick:used {coin}');
      await t.shot('tricks/coin-3-grounded');
      const back = await waitFor(t, () => !window.__GAME__.ctx.player.tricks.coin.active, null, 2000, 50);
      t.assert(back, 'the coin comes back to her paw');
      // hold F: the aim line shows; Esc calls it off (no throw)
      await t.G(() => { const c = window.__GAME__.ctx; c.player.tricks.cd.coin = 0; return true; });
      const n0 = await t.G(() => window.__GAME__.ctx.player.tricks.stats.casts.coin);
      await t.G(() => window.__GAME__.aimAt(26, 36));
      await t.page.keyboard.down('KeyF');
      await t.wait(400);
      const aim = await t.G(() => window.__GAME__.ctx.player.tricks.aim.on);
      await t.shot('tricks/coin-4-aim', { freeze: true });
      await t.page.keyboard.down('Escape'); await t.frames(2); await t.page.keyboard.up('Escape');
      await t.page.keyboard.up('KeyF');
      await t.frames(6);
      const n1 = await t.G(() => window.__GAME__.ctx.player.tricks.stats.casts.coin);
      t.assert(aim, 'holding F shows the aim line');
      t.assert(n1 === n0, 'Esc while aiming calls the throw off');
      await t.G(() => { window.__GAME__.ctx.cam?.zoom?.(1); if (window.__GAME__.ctx.game.mode !== 'play') window.__GAME__.setMode('play'); return true; });
    },
  },
  {
    name: 'tricks:twirl', order: 83, level: 'forest', spawn: 'start', timeout: 120000,
    async run(t) {
      await t.G(PAST_FIRST_FIGHT);
      await t.loadLevel('forest', 'start');                        // the entry hand-over needs the flags at load
      await t.G(CLEAR);
      const got = await waitFor(t, () => window.__GAME__.ctx.player.tricks.owns('twirl'), null, 4000);
      t.assert(got, 'entering the forest hands the Ribbon Twirl over');
      t.assert(await t.waitForEvent('trick:unlocked', 1000), 'trick:unlocked {twirl}');
      await t.wait(300);
      await t.shot('tricks/twirl-0-unlock');
      // a high take-off (4 m up) so the glide can run its whole 1.5 s
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, p = c.player;
        p.pos.y += 4; p.prevPos.copy(p.pos); p.vel.set(0, 0, 0); p.onGround = false;
        p.coyoteT = 0; p.jumpBuf = 0;   // TT5: PLAYER.coyote is 0.15 s (9 frames), so the press below is an air press
        c.input.setDevice?.('kbm');
        window.__twirlLog = { states: [], minVy: 0, t0: 0, t1: 0, maxT: 0 };
        const off = c.bus.on('player:jump', () => {});
        off();
        return true;
      });
      await t.frames(8);
      await t.page.keyboard.down('Space');
      const t0 = Date.now();
      let maxStateT = 0, minVy = 0, seen = false, shot = false;
      while (Date.now() - t0 < 2600) {
        const s = await t.G(() => { const p = window.__GAME__.ctx.player; return { st: p.state, t: p.stateT, vy: p.vel.y, ground: p.onGround }; });
        if (s.st === 'twirl') { seen = true; maxStateT = Math.max(maxStateT, s.t); minVy = Math.min(minVy, s.vy); }
        if (seen && !shot && s.t > 0.4) { shot = true; await t.shot('tricks/twirl-1-glide', { freeze: true }); }
        if (seen && s.st !== 'twirl') break;
        await t.wait(50);
      }
      await t.page.keyboard.up('Space');
      t.log(`twirl ${maxStateT.toFixed(2)} s, fastest fall ${(-minVy).toFixed(2)} m/s`);
      t.assert(seen, 'a second Jump press in the air starts the twirl');
      t.assert(-minVy <= 1.8 + 0.45, `the fall is capped near 1.8 m/s (${(-minVy).toFixed(2)})`);
      t.assert(maxStateT >= 1.3, `the glide lasts its 1.5 s (${maxStateT.toFixed(2)} s)`);
      // holding Jump from take-off on the ground never twirls
      await t.frames(30);
      await t.G(() => { const p = window.__GAME__.ctx.player; return p.onGround; });
      await t.page.keyboard.down('Space');
      let twirled = false;
      for (let i = 0; i < 14; i++) { if ((await t.G(() => window.__GAME__.ctx.player.state)) === 'twirl') twirled = true; await t.wait(50); }
      await t.page.keyboard.up('Space');
      t.assert(!twirled, 'holding Jump from the take-off is a plain jump');
    },
  },
  {
    name: 'tricks:cloud', order: 84, level: 'town', spawn: 'start', timeout: 120000,
    async run(t) {
      await t.G(PAST_FIRST_FIGHT);
      await t.loadLevel('town', 'start');
      await t.G(CLEAR);
      const got = await waitFor(t, () => window.__GAME__.ctx.player.tricks.owns('cloud'), null, 4000);
      t.assert(got, 'entering the town hands the Catnip Cloud over');
      const own = await t.G(() => window.__GAME__.ctx.player.tricks.ownedList());
      t.assert(own.includes('coin'), `a save past the meadow owns the coin too (${own})`);
      await t.wait(300);
      await t.shot('tricks/cloud-0-unlock');
      // a GRUMP pack 5 m ahead
      const me = await t.G(() => { const p = window.__GAME__.ctx.player; return { x: p.pos.x, z: p.pos.z, f: p.facing }; });
      const ax = me.x + Math.sin(me.f) * 5, az = me.z + Math.cos(me.f) * 5;
      const ids = [];
      for (const [dx, dz] of [[0, 0], [1.1, 0.6], [-1.0, 0.7]]) ids.push(await t.G(SPAWN_AT, ['hyena', ax + dx, az + dz, 0, true]));
      await t.wait(1200);                                            // the plates dress in
      await t.tap('Digit2');
      await t.frames(3);
      const eq = await t.G(() => window.__GAME__.ctx.player.tricks.equipped);
      t.assert(eq === 'cloud', `2 equips the Catnip Cloud (${eq})`);
      await t.G(() => { window.__GAME__.ctx.player.tricks.cd.cloud = 0; return true; });
      // the pack closes in on her; the pouch goes to where they bunch up
      await waitFor(t, (list) => {
        const c = window.__GAME__.ctx, p = c.player, es = list.map((id) => c.enemies.list.find((x) => x.id === id)).filter(Boolean);
        return es.filter((e) => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 3.2).length >= 2;
      }, ids, 4000, 50);
      const mid = await t.G((list) => {
        const c = window.__GAME__.ctx, es = list.map((id) => c.enemies.list.find((x) => x.id === id)).filter(Boolean);
        let x = 0, z = 0; for (const e of es) { x += e.pos.x; z += e.pos.z; }
        return { x: x / es.length, z: z / es.length };
      }, ids);
      await t.G(([x, z]) => window.__GAME__.aimAt(x, z), [mid.x, mid.z]);
      await t.frames(3);
      await t.page.keyboard.down('KeyF');
      await t.frames(2);
      await t.page.keyboard.up('KeyF');
      const r = await waitFor(t, (list) => {
        const c = window.__GAME__.ctx, es = list.map((id) => c.enemies.list.find((x) => x.id === id)).filter(Boolean);
        const giddy = es.filter((e) => e.stateName === 'giddy');
        return giddy.length >= 2 ? es.map((e) => ({ st: e.stateName, word: e.plateWord, shown: e.plateWordShown, flipped: e.plateFlipped })) : null;
      }, ids, 2500, 50);
      t.assert(r, 'the cloud makes the GRUMP pack giddy');
      t.log(`pack ${JSON.stringify(r)}`);
      await t.wait(350);
      await t.shot('tricks/cloud-1-giddy', { freeze: true });
      const roll = await t.G((list) => { const c = window.__GAME__.ctx; return list.map((id) => { const e = c.enemies.list.find((x) => x.id === id); return e?.visual ? +e.visual.rotation.x.toFixed(2) : null; }); }, ids);
      t.log(`roll ${JSON.stringify(roll)}`);
      t.assert(roll.some((r) => r != null && r < -1.2), `a giddy foe lies on its back (${JSON.stringify(roll)})`);
      await t.G(() => { window.__GAME__.ctx.cam?.zoom?.(0.7); return true; });
      await t.wait(500);
      await t.shot('tricks/cloud-2-giddy-close', { freeze: true });
      await t.G(() => { window.__GAME__.ctx.cam?.zoom?.(1); return true; });
      const plates = (r ?? []).filter((x) => x.st === 'giddy' && x.word);
      t.assert(plates.length > 0 && plates.every((x) => x.flipped && x.shown && x.shown !== x.word), `giddy plates show the friend word (${JSON.stringify(plates)})`);
      // no attacks while giddy (sampled over 1.5 s), and they get up after 2.5 s
      const giddyIds = await t.G((list) => { const c = window.__GAME__.ctx; return list.filter((id) => c.enemies.list.find((x) => x.id === id)?.stateName === 'giddy'); }, ids);
      // Sampled in the page on game frames. A foe counts only while it lies there: once its giddy time ran out it may
      // wind up at once (legit). TT3 integration: sampling 1.5 s of wall time after two screenshots overran the 2.5 s
      // under a long full run, so a foe that got up on time read as "attacking while giddy".
      const smp = await t.page.evaluate(async (list) => {
        const g = window.__GAME__, c = g.ctx, seen = new Set(), early = [], up = new Set(), lastT = {};
        for (let i = 0; i < 30; i++) {
          for (const id of list) {
            if (up.has(id)) continue;
            const e = c.enemies.list.find((x) => x.id === id);
            if (!e) continue;
            if (e.stateName === 'giddy') { seen.add('giddy'); lastT[id] = e.giddyT; continue; }
            up.add(id); seen.add(e.stateName);
            if (lastT[id] == null || lastT[id] > 0.35) early.push({ id, st: e.stateName, giddyT: lastT[id] ?? null });
          }
          await g.waitFrames(3);
        }
        return { seen: [...seen], early };
      }, giddyIds);
      t.assert(smp.early.length === 0, `no attacks while giddy: none got up early (${JSON.stringify(smp)})`);
      await t.wait(1500);
      const after = await t.G((list) => { const c = window.__GAME__.ctx; return list.map((id) => c.enemies.list.find((x) => x.id === id)?.stateName); }, ids);
      t.assert(!after.includes('giddy'), `back on their feet after 2.5 s (${after})`);
    },
  },
  {
    name: 'tricks:inputs', order: 85, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      // ---- the gamepad (standard layout): RT taps cast the coin, RT + D-pad right picks the cloud
      await t.G(PAST_FIRST_FIGHT);
      await t.G(CLEAR);
      const c0 = await t.G(() => { const tr = window.__GAME__.ctx.player.tricks; tr.grant('coin', { bark: false }); tr.grant('cloud', { bark: false }); tr.equip('coin', { quiet: true }); tr.cd.coin = 0; tr.cd.cloud = 0; return { ...tr.stats.casts }; });
      await t.G(() => {
        const pad = { id: 'stub', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
        window.__pad = pad;
        navigator.getGamepads = () => [pad];
        return true;
      });
      const press = (i, on) => t.G(([b, v]) => { window.__pad.buttons[b].pressed = v; window.__pad.buttons[b].value = v ? 1 : 0; return true; }, [i, on]);
      await t.frames(40);                                             // Input probes for a pad every few frames until one is live
      await press(7, true); await t.frames(8); await press(7, false); await t.frames(30);
      const padCast = await t.G(() => { const c = window.__GAME__.ctx; return { dev: c.input.device, casts: c.player.tricks.stats.casts.coin }; });
      t.assert(padCast.casts - c0.coin >= 1, `RT throws the coin on a pad (${JSON.stringify(padCast)})`);
      await press(7, true); await t.frames(4);
      await press(15, true); await t.frames(4);
      await press(15, false); await t.frames(2);
      await press(7, false); await t.frames(8);
      const padPick = await t.G(() => { const tr = window.__GAME__.ctx.player.tricks; return { eq: tr.equipped, casts: tr.stats.casts }; });
      t.assert(padPick.eq === 'cloud', `RT + D-pad right picks the cloud (${JSON.stringify(padPick)})`);
      t.assert(padPick.casts.cloud === c0.cloud, 'the RT used as a picker does not cast');
      await t.G(() => { navigator.getGamepads = () => []; window.__GAME__.ctx.input.setDevice?.('kbm'); return true; });
      // ---- touch 844 × 390: the ":3" button casts on a tap, a long press opens the 3-way picker
      const s = await t.viewport(844, 390, { touch: true, level: 'meadow', spawn: 'start' });
      try {
        await s.G(PAST_FIRST_FIGHT);
        const s0 = await s.G(() => { const c = window.__GAME__.ctx; for (const e of [...(c.enemies?.list ?? [])]) c.enemies.despawn?.(e); const tr = c.player.tricks; tr.grant('coin', { bark: false }); tr.grant('cloud', { bark: false }); tr.equip('coin', { quiet: true }); tr.cd.coin = 0; c.input.setDevice('touch'); return { ...tr.stats.casts }; });
        await s.frames(20);
        const b = await s.G(() => { const e = document.querySelector('.tb-trick'); const r = e?.getBoundingClientRect(); return e ? { hidden: e.classList.contains('is-hidden') || e.classList.contains('is-dropped'), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width } : null; });
        t.assert(b && !b.hidden && b.w >= 52, `the ":3" button shows on touch (${JSON.stringify(b)})`);
        await s.shot('tricks/touch-0-button');
        await s.touch('pointerdown', b.x, b.y); await s.frames(3); await s.touch('pointerup', b.x, b.y); await s.frames(12);
        const tap = await s.G(() => window.__GAME__.ctx.player.tricks.stats.casts.coin);
        t.assert(tap - s0.coin >= 1, `a tap on ":3" throws the coin (${tap})`);
        await s.shot('tricks/touch-1-throw');
        await s.touch('pointerdown', b.x, b.y);
        await s.page.waitForTimeout(650);
        await s.frames(4);
        const open = await s.G(() => document.querySelector('.tb-trick-picker')?.classList.contains('is-open'));
        t.assert(open, 'a long press opens the Paw Trick picker');
        await s.shot('tricks/touch-2-picker');
        const pick = await s.G(() => { const e = document.querySelector('.tb-pick-cloud'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await s.touch('pointermove', pick.x, pick.y); await s.touch('pointerup', pick.x, pick.y); await s.frames(6);
        const after = await s.G(() => { const tr = window.__GAME__.ctx.player.tricks; return { eq: tr.equipped, casts: tr.stats.casts.cloud }; });
        t.assert(after.eq === 'cloud' && after.casts === s0.cloud, `sliding onto the pouch picks the cloud, no cast (${JSON.stringify(after)})`);
        await s.frames(10);
        await s.shot('tricks/touch-3-cloud-equipped');
      } finally { await s.close(); }
    },
  },
];
