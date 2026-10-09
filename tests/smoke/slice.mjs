// tests/smoke/slice.mjs  (owner: core) — the M1 exit criterion (GAME_DESIGN §19.10): one continuous run through the
// meadow vertical slice, driven by hooks. Midnight Practice (from spawn `practice`) → gate → G-01 at Sir Tallbert →
// CS-02 on the lane (level reloads by day) → crossroads rats + Noodle + Letter #1 → vigil_1 → Standing Stones arena +
// Button → vigil_2 → CS-03 at the picnic bale → glade arena + the 3 net ropes → the Pudding follow beat → Crow Fields
// (crows, crossbows) + Biscuit → vigil_3 → Old Bridge arena (3 waves) → Mochi's cage → D-01 → exit → results → forest.
// The area blocks test each piece in depth; this one checks that they chain with no softlock, runtime error or stuck
// mode, and that progress (flags, kittens, letter, fish, party) adds up on the results card.
// Fights use the real combat path (combat.applyHit from her, so enemy:died drops, Valor, arena waves all run).
// Screenshots → tests/shots/slice/*.png
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'slice';

/** Poll a page function until truthy, `sim` s of game time pass, or `real` ms of wall clock pass. → last value. */
async function until(t, fn, arg = null, { sim = 10, real = 60000, every = 150 } = {}) {
  const now = () => t.G(() => window.__GAME__.game.time);
  const t0 = await now(), r0 = Date.now();
  let v = await t.G(fn, arg);
  while (!v && Date.now() - r0 < real && (await now()) - t0 < sim) {
    await t.wait(every);
    v = await t.G(fn, arg);
  }
  return v;
}

/** Freeze the sim, take the shot (one retry under GPU load), thaw. */
async function shot(t, name) {
  await t.G(() => window.__GAME__.game.setTimeScale(0));
  try {
    await t.frames(2);
    try { await t.shot(`${DIR}/${name}`); } catch (e) { t.warn(`shot ${name} retry: ${String(e?.message ?? e).split('\n')[0]}`); await t.wait(1500); await t.shot(`${DIR}/${name}`); }
  } catch (e) { t.warn(`shot ${name}: ${e.message}`); }
  finally { await t.G(() => window.__GAME__.game.setTimeScale(1)); }
}

/** Teleport her onto the ground at (x, z) facing `yaw`, camera behind her. */
async function tp(t, x, z, yaw = 0) {
  await t.G(([px, pz, f]) => {
    const g = window.__GAME__, c = g.ctx;
    // over deep water (the Old Bridge) stand on the deck, not on the stream bed below it
    const y = c.levels.current?.isDeepWater?.(px, pz) ? c.physics.topAt(px, pz) : c.physics.heightAt(px, pz);
    c.player.teleport({ pos: new g.THREE.Vector3(px, y, pz), facing: f });
    try { if (c.cam.modeName !== 'follow') c.cam.mode('follow'); c.cam.snapBehind?.(); } catch { /* */ }
  }, [x, z, yaw]);
  await t.frames(6);
}

/** Small status for diagnostics. */
const status = () => {
  const g = window.__GAME__, c = g.ctx, p = c.player, L = c.levels.current;
  return { level: L?.id, mode: g.mode, playing: c.story.playingId, queue: c.story.queue?.length ?? 0, loading: !!c.levels.loading,
    pos: p.pos.toArray().map((v) => +v.toFixed(2)), hp: p.hp, lives: p.lives, state: p.stateName,
    enemies: c.enemies.list.filter((e) => e.alive).map((e) => `${e.def?.id}@${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)}`),
    arenas: L?.arenas?.map((a) => `${a.id}:${a.locked ? 'L' : ''}${a.cleared ? 'C' : ''}w${a.wave}`),
    flags: Object.fromEntries(Object.entries(c.state.flags).filter(([k]) => /^(prologue|meadow)\./.test(k))),
    kittens: [...c.state.kittens], party: c.companions.active.map((m) => m.kittenId), ev: g.events.slice(-12) };
};

const idle = () => { const g = window.__GAME__; return g.mode === 'play' && !g.ctx.story.isPlaying && !g.ctx.levels.loading; };

/**
 * Defeat every live enemy within `r` m of her with her own slashes (combat.applyHit, the real resolve path:
 * stagger, death, drops, arena bookkeeping). Projectiles in flight are left alone. → enemies hit.
 */
const smite = (t, r = 40, at = null) => t.G(([rad, o]) => {
  const g = window.__GAME__, c = g.ctx, p = c.player, A = c.config.ATTACKS;
  const cx = o ? o[0] : p.pos.x, cz = o ? o[1] : p.pos.z;
  let n = 0;
  for (const e of [...c.enemies.list]) {
    if (!e.alive || e.scripted || Math.hypot(e.pos.x - cx, e.pos.z - cz) > rad) continue;
    for (let i = 0; i < 40 && e.alive; i++) { e.invulnT = 0; c.combat.applyHit(p, e, i % 3 === 2 ? A.slash3 : A.slash1); }
    if (e.alive) c.enemies.despawn(e);          // e.g. a crow out of reach in the air: the fight must still end
    n++;
  }
  return n;
}, [r, at]);

/** Fight an arena to its end: smite each wave as it arrives. → { cleared, waves } */
async function clearArena(t, id, sim = 40) {
  const t0 = Date.now();
  let waves = 0;
  for (;;) {
    const a = await t.G((x) => { const A = window.__GAME__.ctx.levels.current.arena(x); return A ? { locked: A.locked, cleared: A.cleared, wave: A.wave, alive: A.aliveCount(), at: [A.center?.x ?? A.zone?.at?.[0], A.center?.z ?? A.zone?.at?.[1]], r: A.radius ?? A.zone?.r ?? 12 } : null; }, id);
    if (!a) return { cleared: false, waves };
    if (a.cleared) return { cleared: true, waves: Math.max(waves, a.wave) };
    if (Date.now() - t0 > sim * 3000) return { cleared: false, waves };
    if (a.alive > 0) { await smite(t, a.r + 6, a.at[0] != null ? a.at : null); waves = Math.max(waves, a.wave); }
    await t.wait(300);
  }
}

/** Walk (W held) until `cond` or `ms`. */
async function walkUntil(t, fn, arg, ms = 4000) {
  await t.page.keyboard.down('KeyW');
  try { return await until(t, fn, arg, { sim: ms / 1000, real: ms * 4, every: 100 }); } finally { await t.page.keyboard.up('KeyW'); }
}

const meow = (t) => t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_MEOW, { position: g.ctx.player.pos.clone() }); });

/** Step onto a revealed lost kitten (rescue on contact). → rescued? */
async function touchKitten(t, id) {
  const ok = await until(t, (k) => {
    const g = window.__GAME__, c = g.ctx, n = c.companions.kittens.find((x) => x.kittenId === k);
    if (!n) return false;
    if (n.rescued) return true;
    if (!n.hidden) c.player.teleport({ pos: new g.THREE.Vector3(n.pos.x + 0.6, c.physics.heightAt(n.pos.x + 0.6, n.pos.z - 0.5), n.pos.z - 0.5), facing: Math.atan2(-0.6, 0.5) });
    return false;
  }, id, { sim: 8 });
  if (!ok) t.log(`kitten ${id}`, JSON.stringify(await t.G((k) => { const c = window.__GAME__.ctx, n = c.companions.kittens.find((x) => x.kittenId === k); return n ? { st: n.stateName, hidden: n.hidden, pos: n.pos.toArray(), me: c.player.pos.toArray(), mode: window.__GAME__.mode } : null; }, id)));
  return !!ok;
}

export default [
  {
    name: 'slice:meadow', order: 95, level: null, reload: true, timeout: 900000,
    async run(t) {
      fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });
      const step = (s) => t.log(`· ${s}`);
      const diag = async (label) => t.log(`${label} ${JSON.stringify(await t.G(status))}`);
      const must = async (cond, msg) => { if (!t.assert(cond, msg)) { await diag('state'); throw new Error(`slice stopped: ${msg}`); } };

      // ---------------------------------------------------------------- new game, CS-01 already seen (story:cs01 covers it)
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, s = c.state;
        g.story.skip(); c.story.queue.length = 0;
        s.flags = {}; s.kittens = []; s.letters = []; s.heartBells = []; s.fish = 0; s.shards = 0;
        s.companions = { unlocked: [], active: [] };
        c.companions.setActive([]);
        s.setFlag('prologue.armour', true);
        g.setMode('play'); g.god(true);
      });
      await t.loadLevel('meadow', 'practice');
      await t.clearEvents();

      // ---------------------------------------------------------------- Midnight Practice (story:tutorial plays every step)
      step('Midnight Practice');
      const tut = await until(t, () => window.__GAME__.ctx.story.tutorial.active, null, { sim: 6 });
      await must(!!tut, 'Midnight Practice starts at spawn practice');
      await t.hold('KeyW', 900);
      await t.tap('KeyJ', 3, 230);
      await t.wait(400);
      await shot(t, '01-practice');
      await t.G(() => window.__GAME__.ctx.story.tutorial.skip());
      const gate = await until(t, () => {
        const g = window.__GAME__, c = g.ctx;
        return c.state.getFlag('prologue.tutorial') === true && !c.story.isPlaying && !c.levels.current.colliders.segments.some((s) => s.gate === 'practice');
      }, null, { sim: 12 });
      await must(!!gate, 'practice over: prologue.tutorial set and the gate open');

      // ---------------------------------------------------------------- G-01 at the north gate (walk through it)
      step('G-01');
      await tp(t, 0, -66, 0);
      const g01 = await walkUntil(t, () => window.__GAME__.ctx.story.playingId === 'g01', null, 6000);
      await must(!!g01, 'walking out of the gate plays G-01');
      if (await until(t, () => (window.__GAME__.ctx.story.current?.t ?? 0) > 1.6, null, { sim: 5 })) await shot(t, '02-g01-meme');
      const g01done = await until(t, idle, null, { sim: 25 });
      await must(!!g01done, 'G-01 hands back to play');

      // ---------------------------------------------------------------- CS-02 on the lane
      step('CS-02');
      await tp(t, -4.5, -55, -0.4);
      let cs02 = await walkUntil(t, () => window.__GAME__.ctx.story.playingId === 'cs02', null, 3000);
      if (!cs02) { t.warn('lane trigger missed by walking: stepping into it'); await tp(t, -6, -52, -0.4); cs02 = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs02', null, { sim: 4 }); }
      await must(!!cs02, 'CS-02 plays on the lane');
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'MEME_LOOP', null, { sim: 45, real: 120000 })) { await t.wait(1500); await shot(t, '03-cs02-meme'); }
      else t.warn('CS-02 Meme Cam beat not seen');
      if (await until(t, () => window.__GAME__.ctx.story.line?.key === 'cs02.2', null, { sim: 25 })) { await t.wait(600); await shot(t, '04-cs02-laugh'); }
      await t.G(() => window.__GAME__.story.skip());                 // the rest is covered by story:cs02
      const day = await until(t, () => {
        const g = window.__GAME__, c = g.ctx;
        return c.state.getFlag('prologue.done') === true && c.env.presetName === 'meadow_day' && g.mode === 'play' && !c.story.isPlaying && !c.levels.loading;
      }, null, { sim: 40, real: 120000 });
      await must(!!day, 'after CS-02: prologue.done, meadow by day, back in play');
      await t.G(() => window.__GAME__.god(true));
      await t.wait(800);
      await shot(t, '05-day-start');

      // ---------------------------------------------------------------- crossroads: rats, Noodle, Letter #1, vigil_1
      step('crossroads');
      await tp(t, -12, -44, -0.6);
      const rats = await until(t, () => window.__GAME__.ctx.enemies.list.filter((e) => e.alive && e.def?.id?.startsWith('rat')).length >= 3, null, { sim: 6 });
      await must(!!rats, 'crossroads rats are out');
      await t.wait(800);
      await shot(t, '06-crossroads');
      const fish0 = await t.G(() => window.__GAME__.ctx.state.fish);
      await t.clearEvents();
      const n1 = await smite(t, 25);
      t.assert(n1 >= 4, `crossroads: ${n1} enemies defeated (5 placed)`);
      t.assert(await t.waitForEvent('enemy:died', 2000), 'enemy:died emitted');
      await meow(t);
      await tp(t, -26.5, -28.5, Math.atan2(-3.5, 2.5));
      await meow(t);
      t.assert(await touchKitten(t, 'noodle'), 'Noodle rescued (barrel, Meow)');
      await tp(t, -18, -25.6, 0);
      await t.hold('KeyW', 500);
      t.assert(await until(t, () => window.__GAME__.ctx.state.letters.includes('l1'), null, { sim: 3 }), 'Letter #1 picked up');
      await tp(t, -16, -34.8, Math.PI);
      await t.clearEvents();
      await t.tap('KeyE');
      t.assert(await t.waitForEvent('checkpoint', 3000), 'vigil_1 lit (E)');

      // ---------------------------------------------------------------- Standing Stones arena + Button
      step('stones');
      await tp(t, -20, -12, 0);                                     // inside the trigger disc (r − 2)
      const locked = await walkUntil(t, () => !!window.__GAME__.ctx.levels.current.arena('stones')?.locked, null, 3000);
      await must(!!locked, 'Standing Stones arena locks on entry');
      await until(t, () => window.__GAME__.ctx.levels.current.arena('stones').aliveCount() > 0, null, { sim: 4 });
      await t.wait(600);
      await shot(t, '07-stones-fight');
      const st = await clearArena(t, 'stones');
      await must(st.cleared, `stones arena cleared (${st.waves} waves)`);
      await tp(t, -20, -3.7, 0);
      await t.page.keyboard.down('KeyL');
      const button = await until(t, () => !window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'button')?.hidden, null, { sim: 6 }).finally(() => t.page.keyboard.up('KeyL'));
      t.assert(!!button, 'a 3 s Stand in the ring reveals Button');
      await until(t, idle, null, { sim: 3 });
      t.assert(await touchKitten(t, 'button'), 'Button rescued');
      await tp(t, -12, 9.2, Math.PI);
      await t.clearEvents();
      await t.tap('KeyE');
      t.assert(await t.waitForEvent('checkpoint', 3000), 'vigil_2 lit');

      // ---------------------------------------------------------------- CS-03 Milk Break + the glade fight + ropes
      step('CS-03');
      await tp(t, 0.6, 14.4, 0);
      await t.G(() => window.__GAME__.ctx.levels.interact('picnic'));
      const cs03 = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs03', null, { sim: 4 });
      await must(!!cs03, 'the picnic bale plays CS-03');
      if (await until(t, () => window.__GAME__.ctx.story.line?.key === 'cs03.1', null, { sim: 12 })) { await t.wait(900); await shot(t, '08-cs03-selfie'); }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'HERO_LOW', null, { sim: 20 })) { await t.wait(1600); await shot(t, '09-cs03-hero'); }
      await t.G(() => window.__GAME__.story.skip());
      const net = await until(t, () => { const g = window.__GAME__; return g.mode === 'play' && !g.ctx.story.isPlaying && g.ctx.state.getFlag('meadow.pudding') === 'netted'; }, null, { sim: 15 });
      await must(!!net, "after CS-03: meadow.pudding = 'netted', back in play");
      const glade = await until(t, () => !!window.__GAME__.ctx.levels.current.arena('glade')?.locked, null, { sim: 5 });
      await must(!!glade, 'glade arena locks after CS-03');
      await until(t, () => window.__GAME__.ctx.levels.current.arena('glade').aliveCount() > 0, null, { sim: 4 });
      await t.wait(500);
      await shot(t, '10-glade-fight');
      const posts = await t.G(() => {
        const c = window.__GAME__.ctx, p = c.player, out = [];
        for (const a of c.levels.current.actors.filter((x) => x.kind === 'rope_post')) {
          for (let i = 0; i < 12 && a.alive; i++) { a.invulnT = 0; c.combat.applyHit(p, a, c.config.ATTACKS.slash3); }
          out.push(a.alive);
        }
        return out;
      });
      t.assert(posts.length === 3 && posts.every((x) => !x), `the 3 rope posts break under her slashes (${JSON.stringify(posts)})`);
      const gl = await clearArena(t, 'glade');
      await must(gl.cleared, `glade arena cleared (${gl.waves} waves)`);
      const follow = await until(t, () => window.__GAME__.ctx.state.getFlag('meadow.pudding') === true, null, { sim: 10 });
      t.assert(!!follow, 'ropes cut + glade clear → Pudding is free (meadow.pudding = true)');
      await until(t, idle, null, { sim: 10 });

      // ---------------------------------------------------------------- Crow Fields + Biscuit + vigil_3
      step('Crow Fields');
      await tp(t, 18, 30, 0.6);
      await until(t, () => window.__GAME__.ctx.enemies.list.some((e) => e.alive && e.def?.id === 'crow'), null, { sim: 5 });
      await t.wait(1200);
      await shot(t, '11-crowfields');
      const n2 = await smite(t, 40);
      t.assert(n2 >= 4, `Crow Fields: ${n2} enemies defeated`);
      await tp(t, 36.5, 28.5, Math.atan2(5, 1.5));
      await meow(t);
      t.assert(!!(await until(t, () => !window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'biscuit')?.hidden, null, { sim: 6 })), 'Meow wakes the cow and reveals Biscuit');
      t.assert(await touchKitten(t, 'biscuit'), 'Biscuit rescued');
      await tp(t, 28, 53.2, Math.PI);
      await t.clearEvents();
      await t.tap('KeyE');
      t.assert(await t.waitForEvent('checkpoint', 3000), 'vigil_3 lit');

      // ---------------------------------------------------------------- Old Bridge arena, Mochi's cage, D-01
      step('Old Bridge');
      await tp(t, 30, 58, 0);
      await walkUntil(t, () => window.__GAME__.ctx.player.pos.z > 61.5, null, 4000);
      await tp(t, 30, 62, 0);                                       // on the deck, inside the trigger disc
      const bl = await walkUntil(t, () => !!window.__GAME__.ctx.levels.current.arena('bridge')?.locked, null, 7000);
      await must(!!bl, 'crossing the Old Bridge locks its arena');
      await until(t, () => window.__GAME__.ctx.levels.current.arena('bridge').aliveCount() > 0, null, { sim: 4 });
      await t.wait(700);
      await shot(t, '12-bridge-fight');
      const br = await clearArena(t, 'bridge', 60);
      await must(br.cleared, `bridge arena cleared (${br.waves} waves)`);
      await tp(t, 28.2, 70.2, Math.atan2(1.8, 4.3));
      const opened = await t.G(() => {
        const c = window.__GAME__.ctx, m = c.companions.kittens.find((x) => x.kittenId === 'mochi');
        if (!m?.lock) return false;
        for (let i = 0; i < 8 && !m.lock.opened; i++) { m.lock.invulnT = 0; c.combat.applyHit(c.player, m.lock, c.config.ATTACKS.slash1); }
        return !!m.lock.opened;
      });
      await must(opened, 'her slashes open Mochi\'s cage');
      const d01 = await until(t, () => window.__GAME__.ctx.story.playingId === 'd01', null, { sim: 8 });
      t.assert(!!d01, 'D-01 plays when the cage opens');
      if (d01 && await until(t, () => window.__GAME__.ctx.story.line?.key === 'd01.1', null, { sim: 8 })) { await t.wait(1000); await shot(t, '13-d01-mochi'); }
      const joined = await until(t, () => window.__GAME__.mode === 'play' && !window.__GAME__.ctx.story.isPlaying && window.__GAME__.ctx.companions.active[0]?.kittenId === 'mochi', null, { sim: 40, real: 120000 });
      await must(!!joined, 'D-01 ends with Mochi in the party');
      await t.wait(1200);
      await shot(t, '14-mochi-joined');

      // ---------------------------------------------------------------- the exit → results → forest
      step('exit');
      await t.G(() => { const r = window.__GAME__.ctx.ui?.results; if (r) r.autoContinue = false; });
      await tp(t, 30, 87.5, 0);
      await t.clearEvents();
      const ex = await walkUntil(t, () => window.__GAME__.events.includes('level:results'), null, 5000);
      await must(!!ex, 'the exit box → level:exit + level:results');
      const res = await t.lastEvent('level:results');
      t.log('results', JSON.stringify(res));
      t.assert(res?.kittens === 3 && res?.kittensTotal === 3, `results: kittens ${res?.kittens}/${res?.kittensTotal}`);
      t.assert(res?.letter === true, 'results: Letter #1');
      t.assert((res?.fish ?? 0) > 0, `results: fish ${res?.fish}`);
      t.assert(['pawsome', 'purrfect', 'mewtiful'].includes(res?.rank), `results: rank ${res?.rank}`);
      const card = await until(t, () => !!window.__GAME__.ctx.ui?.results?.open && window.__GAME__.ctx.ui.results.t > 2.4, null, { sim: 1e9, real: 15000 });
      t.assert(!!card, 'results card shown');
      await t.wait(200);
      try { await t.shot(`${DIR}/15-results`); } catch (e) { t.warn(`results shot: ${e.message}`); }
      await t.G(() => { const r = window.__GAME__.ctx.ui.results; r.autoContinue = true; r.close(); });
      const forest = await until(t, () => window.__GAME__.ctx.levels.current?.id === 'forest' && !window.__GAME__.ctx.levels.loading && window.__GAME__.mode === 'play', null, { sim: 1e9, real: 90000 });
      await must(!!forest, 'Onward → the forest loads');
      const fin = await t.G(() => {
        const s = window.__GAME__.ctx.state;
        return { done: s.getFlag('meadow.done'), mochi: s.companions.unlocked.includes('mochi'), kittens: [...s.kittens], fish: s.fish, level: s.levels?.meadow };
      });
      t.log('final', JSON.stringify(fin), `fish +${fin.fish - fish0}`);
      t.assert(fin.done === true && fin.mochi, 'meadow.done and Mochi unlocked');
      await t.wait(800);
      await shot(t, '16-forest');
      await t.G(() => window.__GAME__.god(false));
    },
  },
];
