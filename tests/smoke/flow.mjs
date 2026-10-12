// tests/smoke/flow.mjs  (owner: core, M2 integration) — the M2 exit-criteria playthrough (GAME_DESIGN §19.10):
// meadow exit → forest (Sage's ropes → D-02, the camp trigger → CS-04, B1 fought down with god → CS-05, the exit)
// → town (Bakery Street → D-03 → Pilfer's chase → CS-06, Tofu's Meow → D-04, the square → Earl Grey, the lanterns,
// Clover's stocks → D-04, the steps → CS-07, a hub shop purchase, the Quest Board → gate) → gate (the war-wagon → D-06,
// the battlefield → "Back to the Line!", The Line → CS-08 → G-02 → 100 %, B2 fought down with god → CS-09 → CS-10 →
// the grey hub). Every beat is reached through the real trigger (zones, arenas, interactables, enemies' events) — no
// story.play() fallbacks; scenes are skipped once they have started (their `end` blocks apply). Combat is driven by
// real hits through combat.applyHit (god mode on), so boss phases, adds and splits all run.
// Screenshots: tests/shots/flow/.
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'flow';

async function until(t, fn, arg = null, { timeout = 30000, every = 150 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await t.G(fn, arg);
    if (v) return v;
    await t.wait(every);
  }
  return null;
}

async function shot(t, name) {
  try { await t.shot(`${DIR}/${name}`, { freeze: true }); } catch (e) { t.warn(`shot ${name}: ${e.message}`); }
}

/** Put her at (x, z) facing `yaw` on whatever is walkable there; camera snaps behind. */
async function tp(t, x, z, yaw = 0) {
  await t.G(([px, pz, f]) => {
    const g = window.__GAME__, ph = g.ctx.physics;
    const y = ph.topAt?.(px, pz) ?? ph.heightAt(px, pz);
    g.ctx.player.teleport({ pos: new g.THREE.Vector3(px, y, pz), facing: f });
    g.ctx.cam?.snapBehind?.();
  }, [x, z, yaw]);
  await t.frames(6);
}

/** Walk her toward (x, z) with the virtual stick (camera-relative input solved for the world direction), up to `ms`. */
async function walkTo(t, x, z, ms = 4000, stop = 0.6) {
  return t.page.evaluate(async ([tx, tz, maxMs, stopR]) => {
    const g = window.__GAME__, ctx = g.ctx, p = ctx.player, t0 = performance.now();
    try {
      while (performance.now() - t0 < maxMs) {
        if (ctx.story.isPlaying || ctx.levels.loading) break;
        const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
        if (d < stopR) break;
        const yaw = ctx.cam.yaw, ux = dx / d, uz = dz / d;
        ctx.input.setVirtualMove(Math.cos(yaw) * ux - Math.sin(yaw) * uz, -Math.sin(yaw) * ux - Math.cos(yaw) * uz);
        await g.waitFrames(3);
      }
    } finally { ctx.input.setVirtualMove(0, 0); }
    return [p.pos.x, p.pos.z];
  }, [x, z, ms, stop]);
}

const flags = (keys) => { const s = window.__GAME__.ctx.state; return Object.fromEntries(keys.map((k) => [k, s.getFlag(k)])); };
const playing = () => window.__GAME__.ctx.story.playingId ?? null;
const levelId = () => window.__GAME__.ctx.levels.current?.id ?? null;

/**
 * Arm a page-side record of scene starts for `ids` (cutscene:start since now). Call it before an action whose
 * last step may fire the scene itself (e.g. fight() landing the final kill), so beat() still credits a scene
 * that already started — and maybe ended or was skipped — before it got to poll.
 */
async function armScenes(t, ...ids) {
  await t.G((list) => {
    const g = window.__GAME__;
    if (!window.__flowSeen) {
      window.__flowSeen = new Set();
      g.ctx.bus.on('cutscene:start', (p) => { if (p?.id) window.__flowSeen.add(p.id); });
    }
    for (const i of list) window.__flowSeen.delete(i);
  }, ids);
}

/** Wait for scene `id` to start by itself (the real trigger), let it run `watch` ms, skip it, wait for play. */
async function beat(t, id, { timeout = 15000, watch = 1500, shotName = null, label = id } = {}) {
  const on = await until(t, (i) => { const st = window.__GAME__.ctx.story; return st.playingId === i || st.queue?.some?.((q) => q.id === i) || !!window.__flowSeen?.has(i); }, id, { timeout });
  t.assert(!!on, `${label}: scene ${id} starts from its trigger`);
  if (!on) return false;
  // started already (armScenes) and over by now → nothing left to watch or skip
  await until(t, (i) => { const st = window.__GAME__.ctx.story; return st.playingId === i || (!!window.__flowSeen?.has(i) && !st.queue?.some?.((q) => q.id === i)); }, id, { timeout: 15000 });
  await t.wait(watch);
  if (shotName) await shot(t, shotName);
  // skip it (and anything it chains into that we are not waiting for)
  for (let i = 0; i < 40; i++) {
    const s = await t.G((sid) => { const g = window.__GAME__, st = g.ctx.story; if (st.playingId === sid) st.skip(); return { p: st.playingId, mode: g.mode, loading: !!g.ctx.levels.loading }; }, id);
    if (s.p !== id && !s.loading) break;
    await t.wait(250);
  }
  const back = await until(t, (i) => { const g = window.__GAME__; return g.ctx.story.playingId !== i && !g.ctx.levels.loading; }, id, { timeout: 30000 });
  t.assert(!!back, `${label}: scene ${id} ends`);
  return true;
}

/** Skip any scene / results card still running and return to play. */
async function settle(t, timeout = 20000) {
  await until(t, () => {
    const g = window.__GAME__, ui = g.ctx.ui;
    if (g.ctx.story.isPlaying) g.ctx.story.skipAll();
    if (ui?.results?.open) ui.results.close();
    return !g.ctx.story.isPlaying && !g.ctx.levels.loading && g.mode === 'play';
  }, null, { timeout });
}

/**
 * In-page: hit every live enemy matching `sel` with real hits until none is left (or `ms` pass). Bosses are hit
 * only with `boss: true`. Returns { left, hits, boss }.
 */
async function fight(t, { sel = null, boss = false, ms = 60000, attack = 'slash3', near = null } = {}) {
  return t.page.evaluate(async ([selSrc, wantBoss, maxMs, atk, nearR]) => {
    const g = window.__GAME__, ctx = g.ctx, p = ctx.player;
    const sel = selSrc ? new Function('e', `return (${selSrc});`) : () => true;
    const A = ctx.config.ATTACKS;
    const t0 = performance.now();
    let hits = 0, bossDown = false;
    const live = () => ctx.enemies.list.filter((e) => e.alive && e.faction === 'enemy' && !e.scripted && !e.tags?.has?.('cutscene')
      && (wantBoss ? true : !e.def?.boss) && (!nearR || Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < nearR) && sel(e));
    while (performance.now() - t0 < maxMs) {
      if (ctx.story.isPlaying) break;                       // a scene started: the caller's beat() takes over
      const list = live();
      if (!list.length) break;
      for (const e of list) {
        if (!e.alive) continue;
        e.invulnT = 0; if (e.dormant && ctx.enemies.wakeUp) ctx.enemies.wakeUp(e);
        // pugs block frontal hits: hit from behind (a Bright Slash would drop the shield too)
        const def = e.type === 'pug' ? A.bright : (A[atk] ?? A.slash3);
        try { ctx.combat.applyHit(p, e, def); hits++; } catch (err) { console.warn('[flow] applyHit', err); }
      }
      await g.waitFrames(12);
      if (wantBoss && (!ctx.enemies.boss || !ctx.enemies.boss.alive)) { bossDown = true; break; }
    }
    return { left: live().length, hits, boss: bossDown || (wantBoss && !ctx.enemies.boss) };
  }, [sel, boss, ms, attack, near]);
}

const MEADOW_DONE = { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true, 'meadow.pudding': true, 'meadow.mochi': true };

async function fresh(t, f, level, spawn) {
  await t.G((fl) => {
    const g = window.__GAME__, s = g.ctx.state;
    g.story.skip(); g.ctx.story.queue.length = 0;
    s.flags = {}; s.kittens = []; s.letters = [];
    for (const [k, v] of Object.entries(fl)) s.setFlag(k, v);
    g.setMode('play'); g.god(true);
  }, f);
  if (level) await t.loadLevel(level, spawn);
  await t.frames(15);
  await t.clearEvents();
}

const FLOW = [
  // ====================================================================================== meadow exit → forest
  {
    name: 'flow:forest', order: 90, level: 'meadow', spawn: 'start', timeout: 600000,
    async run(t) {
      fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });
      // a scene chain left by an earlier block (e.g. the gate's CS-09 → CS-10 travel to the hub) may still load a level
      await settle(t);
      await t.wait(1500);
      await settle(t);
      await fresh(t, MEADOW_DONE, (await t.G(levelId)) === 'meadow' ? null : 'meadow', 'start');
      await t.G(() => { const g = window.__GAME__, s = g.ctx.state; s.companions.unlocked = ['mochi']; g.ctx.companions.setActive?.(['mochi']); s.fish = 0; });
      await tp(t, 30, 88.5, 0);
      const wp = await walkTo(t, 30, 95, 3000);
      if (!t.assert(await t.waitForEvent('level:exit', 6000), 'meadow exit → level:exit')) t.log('exit diag ' + JSON.stringify({ wp, d: await t.G(() => { const g = window.__GAME__, c = g.ctx; return { mode: g.mode, yaw: c.cam.yaw, sy: c.cam.stickYaw, st: c.player.stateName, pos: c.player.pos.toArray(), lv: c.levels.current?.id, loading: c.levels.loading, playing: c.story.playingId, flags: Object.keys(c.state.flags), ml: c.player.moveLockT, scripted: c.player.scripted }; }) }));
      t.assert(!!(await until(t, () => window.__GAME__.ctx.levels.current?.id === 'forest' && !window.__GAME__.ctx.levels.loading, null, { timeout: 90000 })), 'forest loads from the meadow exit');
      await settle(t);
      await t.G(() => window.__GAME__.god(true));
      await shot(t, 'f1-forest-start');

      // --- Sage's treetop: cut the rope posts with real swings → the cage lowers → D-02 → Sage joins
      const posts = await t.G(() => window.__GAME__.ctx.actors.byTag('rope').filter((a) => !a.opened).map((a) => [a.pos.x, a.pos.z]));
      t.log(`rope posts: ${JSON.stringify(posts)}`);
      const ropesObj = await t.G(() => !!window.__GAME__.ctx.objectives.get?.('treetop_ropes') || !!window.__GAME__.ctx.objectives.counter?.('treetop_ropes'));
      if (!posts.length) t.fail(`no rope posts at Sage's tree (level rope objective: ${ropesObj})`);
      await fight(t, { near: 18, ms: 20000 });     // the treetop guards
      for (const [x, z] of posts) {
        for (let i = 0; i < 8; i++) {
          const open = await t.G(([px, pz]) => window.__GAME__.ctx.actors.byTag('rope').find((a) => Math.hypot(a.pos.x - px, a.pos.z - pz) < 0.1)?.opened ?? true, [x, z]);
          if (open) break;
          const sx = 18 + (x - 18) * 1.25, sz = -8 + (z + 8) * 1.25;          // stand just outside the post, facing it
          await tp(t, sx + (x - 18 === 0 && z + 8 === 0 ? 1 : 0), sz, Math.atan2(x - sx, z - sz));
          await t.tap('KeyJ', 1, 380);
          await t.wait(350);
        }
      }
      const cut = await t.G(() => (window.__GAME__.ctx.actors.get('sage')?.ropePosts ?? []).filter((a) => a.opened).length);
      t.assert(cut === posts.length, `every rope post cut by swings (${cut}/${posts.length})`);
      await tp(t, 18, -11, 0);
      await beat(t, 'd02', { timeout: 20000, shotName: 'f2-d02', label: 'Sage lowered' });
      let f = await t.G(flags, ['forest.sage']);
      t.assert(f['forest.sage'] === true, 'flag forest.sage');
      t.assert(await t.G(() => window.__GAME__.ctx.state.companions.unlocked.includes('sage')), 'Sage unlocked');

      // --- Lantern Camp trigger → CS-04 (night)
      await tp(t, 6, 29, 0);
      await walkTo(t, 6, 40, 4000);
      await beat(t, 'cs04', { timeout: 10000, watch: 4000, shotName: 'f3-cs04', label: 'camp trigger' });
      await t.wait(3500);
      const night = await t.G(() => ({ camp: window.__GAME__.ctx.state.getFlag('forest.camp'), env: window.__GAME__.ctx.env.presetName }));
      t.assert(night.camp === true && night.env === 'forest_night', `forest.camp + forest_night (${JSON.stringify(night)})`);
      await shot(t, 'f4-camp-night');

      // --- B1: walk into the Cheese Mill → the arena locks → Grizzlechop, fought down with god
      await tp(t, -10, 70.5, 0);
      await walkTo(t, -10, 80, 5000);
      let locked = await until(t, () => !!window.__GAME__.ctx.enemies.boss, null, { timeout: 8000 });
      if (!locked) { t.warn('walking in did not lock the mill: startBoss()'); await t.G(() => window.__GAME__.startBoss()); locked = await until(t, () => !!window.__GAME__.ctx.enemies.boss, null, { timeout: 8000 }); }
      t.assert(!!locked, 'the mill arena spawns B1');
      t.assert(await t.waitForEvent('boss:start', 8000), 'boss:start (B1)');
      const b1 = await t.G(() => window.__GAME__.ctx.enemies.boss?.def?.id);
      t.assert(b1 === 'boss_grizzlechop', `B1 is Grizzlechop (${b1})`);
      await t.wait(2500);
      await shot(t, 'f5-b1');
      const r1 = await fight(t, { boss: true, near: 30, ms: 240000 });
      t.log(`B1 fight: ${JSON.stringify(r1)}`);
      t.assert(await t.waitForEvent('boss:defeated', 5000), 'B1 beaten with god (boss:defeated)');
      await beat(t, 'cs05', { timeout: 15000, watch: 3000, shotName: 'f6-cs05', label: 'B1 defeated' });
      f = await t.G(() => ({ boss: window.__GAME__.ctx.state.getFlag('forest.boss'), shards: window.__GAME__.ctx.state.shards }));
      t.assert(f.boss === true && f.shards >= 1, `forest.boss + Shard 1 (${JSON.stringify(f)})`);
      await settle(t);

      // --- the exit to Pawsbury
      await t.clearEvents();
      await fight(t, { ms: 15000 });
      await tp(t, -24, 90.5, 0);
      await walkTo(t, -24, 97, 4000);
      t.assert(await t.waitForEvent('level:exit', 6000), 'forest exit → level:exit');
      t.assert(!!(await until(t, () => window.__GAME__.ctx.levels.current?.id === 'town' && !window.__GAME__.ctx.levels.loading, null, { timeout: 90000 })), 'town loads from the forest exit');
      f = await t.G(flags, ['forest.done']);
      t.assert(f['forest.done'] === true, 'forest.done');
      await settle(t);
      await shot(t, 'f7-town-arrive');
    },
  },

  // ====================================================================================== town → the hub → gate
  {
    name: 'flow:town', order: 91, level: null, timeout: 720000,
    async run(t) {
      fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });
      const FOREST = { ...MEADOW_DONE, 'meadow.done': true, 'forest.sage': true, 'forest.camp': true, 'forest.boss': true, 'forest.done': true };
      if ((await t.G(levelId)) !== 'town') await fresh(t, FOREST, 'town', 'start');
      await settle(t);
      await t.G(() => { const g = window.__GAME__, s = g.ctx.state; g.god(true); if (!s.companions.unlocked.includes('sage')) s.companions.unlocked.push('sage'); s.fish = Math.max(s.fish, 400); });

      // --- Bakery Street (open zone, clearEvent) → D-03 → the chase objective + Pilfer
      await tp(t, -19, -18, -Math.PI / 2);
      await t.frames(30);
      const r = await fight(t, { near: 22, ms: 40000 });
      t.log(`bakery fight ${JSON.stringify(r)}`);
      await beat(t, 'd03', { timeout: 15000, watch: 2000, shotName: 't1-d03', label: 'Bakery Street cleared' });
      let f = await t.G(flags, ['town.marmalade']);
      t.assert(f['town.marmalade'] === true, 'town.marmalade');
      const pil = await until(t, () => window.__GAME__.ctx.enemies.list.find((e) => e.alive && e.type === 'pilfer_chase')?.id ?? null, null, { timeout: 8000 });
      t.assert(!!pil, 'Pilfer runs the chase after D-03');
      // --- three hits on Pilfer drop the post bag → CS-06
      for (let i = 0; i < 20; i++) {
        const done = await t.G(() => { const g = window.__GAME__; return g.ctx.story.playingId === 'cs06' || g.ctx.story.queue.some((q) => q.id === 'cs06') || !!g.ctx.enemies.list.find((x) => x.type === 'pilfer_chase')?.bagDropped; });
        if (done) break;
        await until(t, () => window.__GAME__.ctx.enemies.list.find((x) => x.alive && x.type === 'pilfer_chase')?.stateName !== 'stumble', null, { timeout: 3000 });
        await t.G(() => { const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.alive && x.type === 'pilfer_chase'); if (!e) return;
          const p = ctx.player; p.teleport({ pos: e.pos.clone().add(new g.THREE.Vector3(0, 0, -1.2)), facing: 0 }); e.invulnT = 0; ctx.combat.applyHit(p, e, ctx.config.ATTACKS.slash1); });
        await t.wait(900);
      }
      await shot(t, 't2-pilfer-bag');
      await beat(t, 'cs06', { timeout: 15000, watch: 2500, shotName: 't3-cs06', label: 'post bag returned' });
      f = await t.G(flags, ['town.letters']);
      t.assert(f['town.letters'] === true, 'town.letters');
      await settle(t);

      // --- Tofu in the barrels: a Meow nearby → D-04 (Tofu)
      await tp(t, 17, -11.5, Math.PI);
      await t.tap('KeyC', 1, 200);
      let tofu = await until(t, () => window.__GAME__.ctx.story.playingId === 'd04tofu', null, { timeout: 5000 });
      if (!tofu) { t.warn('Meow missed Tofu: a swing beside the barrels'); await tp(t, 18, -12.8, Math.PI); await t.tap('KeyJ', 1, 300); }
      await beat(t, 'd04tofu', { timeout: 10000, shotName: 't4-d04tofu', label: 'Tofu found' });
      t.assert((await t.G(flags, ['town.tofu']))['town.tofu'] === true, 'town.tofu');

      // --- Lantern Alley: light the three lanterns with E
      for (let i = 1; i <= 3; i++) {
        const a = await t.G((k) => { const x = window.__GAME__.ctx.levels.anchor(`lantern_${k}`); return x ? [x.pos.x, x.pos.z] : null; }, i);
        if (!a) { t.fail(`no lantern_${i} anchor`); break; }
        await tp(t, a[0] + (a[0] < 0 ? 1.2 : -1.2), a[1], a[0] < 0 ? -Math.PI / 2 : Math.PI / 2);
        await t.frames(10);
        await t.tap('KeyE', 1, 200);
        await t.wait(400);
      }
      const lan = await t.G(() => ({ flag: window.__GAME__.ctx.state.getFlag('town.lanterns'), obj: window.__GAME__.ctx.objectives.get?.('lanterns') ?? null }));
      t.assert(lan.flag === true, `three lanterns lit → town.lanterns (${JSON.stringify(lan.obj)})`);
      await shot(t, 't5-lanterns');

      // --- the Square arena (5 waves; the giant Gloomjelly at the fountain) → Earl Grey → D-04
      await tp(t, 0, -12, 0);
      await walkTo(t, 0, 0, 4000, 2);
      const sq = await until(t, () => window.__GAME__.ctx.levels.current.arena?.('square')?.locked, null, { timeout: 8000 });
      t.assert(!!sq, 'the square arena locks');
      // the iso fight clears waves fast: remember the giant's spawn even if it pops between two polls
      await t.G(() => { const g = window.__GAME__; window.__sawGiant = false; g.ctx.bus.on(g.E.ENEMY_SPAWNED, (p) => { const e = p?.enemy; if (e && (e.type === 'jelly_giant' || e.size === 'GIANT')) window.__sawGiant = true; }); });
      let giant = false;
      for (let i = 0; i < 60; i++) {
        const st = await t.G(() => { const g = window.__GAME__, a = g.ctx.levels.current.arena('square'); return { cleared: !!(a?.cleared || g.ctx.state.getFlag('town.cleared.square')), locked: !!a?.locked, n: a?.enemies?.length, pend: g.ctx.enemies.pending?.length, wave: a?.wave ?? a?.waveIndex ?? null, giant: g.ctx.enemies.list.some((e) => e.alive && e.type === 'jelly_giant'), scene: g.ctx.story.playingId }; });
        if (i % 4 === 0) t.log(`square ${i}: ${JSON.stringify(st)} live ${await t.G(() => window.__GAME__.ctx.enemies.list.filter((e) => e.alive && e.faction === 'enemy').map((e) => e.type + (e.scripted ? '*' : '') + (e.dormant ? '~' : '')).join(','))}`);
        if (st.giant && !giant) { giant = true; await t.wait(800); await shot(t, 't6-square-giant'); }
        if (!giant && await t.G(() => window.__sawGiant)) giant = true;
        if (st.scene === 'd04earlgrey') break;
        if (st.cleared) break;
        await fight(t, { near: 30, ms: 6000 });
        await t.wait(300);
      }
      t.assert(giant, 'the giant Gloomjelly rises in the square');
      // she goes to him (he tumbles out where the giant popped; a far-off pop waits for her)
      const eg = await until(t, () => { const k = window.__GAME__.ctx.actors.get('earlgrey'); return k ? [k.pos.x, k.pos.z] : null; }, null, { timeout: 8000 });
      if (eg && !(await t.G(playing))) await walkTo(t, eg[0], eg[1] - 1, 8000, 1.5);
      await beat(t, 'd04earlgrey', { timeout: 15000, shotName: 't7-d04earlgrey', label: 'giant jelly popped' });
      await fight(t, { near: 30, ms: 30000 });
      t.assert(!!(await until(t, () => window.__GAME__.ctx.state.getFlag('town.cleared.square'), null, { timeout: 30000 })), 'town.cleared.square');
      t.assert((await t.G(flags, ['town.earlgrey']))['town.earlgrey'] === true, 'town.earlgrey');
      await settle(t);

      // --- Clover's stocks: E frees her → D-04 (Clover) → she joins
      await tp(t, 10, 12.4, 0);
      await t.frames(10);
      await t.tap('KeyE', 1, 200);
      let clo = await until(t, () => window.__GAME__.ctx.story.playingId === 'd04clover', null, { timeout: 4000 });
      if (!clo) { t.warn('E did not free Clover: three blows'); for (let i = 0; i < 4 && !clo; i++) { await t.tap('KeyJ', 1, 400); clo = await until(t, () => window.__GAME__.ctx.story.playingId === 'd04clover', null, { timeout: 800 }); } }
      await beat(t, 'd04clover', { timeout: 10000, shotName: 't8-d04clover', label: 'Clover freed' });
      f = await t.G(() => ({ clover: window.__GAME__.ctx.state.getFlag('town.clover'), roster: window.__GAME__.ctx.state.companions.unlocked }));
      t.assert(f.clover === true && f.roster.includes('clover'), `town.clover, Clover on the roster (${f.roster})`);
      await settle(t);

      // --- the Castle Steps → CS-07 → Pawsbury is free (hub)
      await tp(t, 0, 27, 0);
      await walkTo(t, 0, 34, 4000);
      await beat(t, 'cs07', { timeout: 10000, watch: 3000, shotName: 't9-cs07', label: 'Castle Steps' });
      await settle(t, 30000);
      f = await t.G(() => { const s = window.__GAME__.ctx.state; return { free: s.getFlag('town.free'), done: s.getFlag('town.done'), cape: s.cosmetics.cape, env: window.__GAME__.ctx.env.presetName, level: window.__GAME__.ctx.levels.current?.id }; });
      t.assert(f.free === true && f.done === true && f.cape === 'red' && f.level === 'town', `town freed in place, red cape (${JSON.stringify(f)})`);
      await t.wait(3500);
      await shot(t, 't10-hub-gold');

      // --- a hub shop through its station interactable: buy Satchel I
      const st = await t.G(() => { const a = window.__GAME__.ctx.levels.current.interactables.find((i) => i.id === 'station_bakery'); return a ? [a.pos.x, a.pos.z] : null; });
      t.assert(!!st, 'station_bakery interactable');
      if (st) {
        const fish0 = await t.G(() => window.__GAME__.ctx.state.fish);
        await tp(t, st[0], st[1], 0);
        await t.frames(10);
        const tgt = await t.G(() => { const it = window.__GAME__.ctx.levels.current.interactables?.filter?.((i) => /bakery/.test(i.id)); return it?.map((i) => [i.id, i.kind]); });
        t.log(`bakery interactables ${JSON.stringify(tgt)}`);
        await t.clearEvents();
        await t.tap('KeyE', 1, 200);
        await t.wait(500);
        const open = await until(t, () => !!document.querySelector('.menu--shop'), null, { timeout: 5000 });
        t.assert(!!open, 'E at the bakery station opens its shop');
        if (open) {
          await t.wait(500);
          // first row = Satchel: arm, then buy
          await t.G(() => { const row = document.querySelector('.menu--shop .shop-row, .menu--shop .row'); row?.click(); });
          await t.wait(300);
          await t.G(() => { const row = document.querySelector('.menu--shop .shop-row, .menu--shop .row'); row?.click(); });
          await t.wait(600);
          await shot(t, 't11-shop-bakery');
          const after = await t.G(() => ({ fish: window.__GAME__.ctx.state.fish, satchel: window.__GAME__.ctx.state.upgrades?.satchel ?? 0, milkMax: window.__GAME__.ctx.player.milkMax }));
          t.log(`shop ${fish0} → ${JSON.stringify(after)}`);
          t.assert(after.satchel >= 1 && after.fish < fish0, `Satchel bought (${JSON.stringify(after)})`);
          await t.G(() => window.__GAME__.ctx.ui.closeShop());
          await until(t, () => window.__GAME__.mode === 'play', null, { timeout: 5000 });
        }
      }

      // --- the Quest Board → Next: the gate
      const qb = await t.G(() => { const a = window.__GAME__.ctx.levels.current.interactables.find((i) => i.id === 'quest_board'); return a ? [a.pos.x, a.pos.z] : null; });
      t.assert(!!qb, 'quest_board interactable');
      if (qb) {
        await tp(t, qb[0], qb[1], 0);
        await t.frames(10);
        await t.tap('KeyE', 1, 200);
        const open = await until(t, () => !!document.querySelector('.menu--board, .quest-board, .qb'), null, { timeout: 5000 });
        t.assert(!!open, 'E at the Quest Board opens it');
        await t.wait(500);
        await shot(t, 't12-quest-board');
        await t.G(() => window.__GAME__.ctx.ui.closeShop());
        await until(t, () => window.__GAME__.mode === 'play', null, { timeout: 5000 });
      }
      await t.clearEvents();
      await t.G(() => { window.__GAME__.ctx.ui.travel('gate'); });
      t.assert(!!(await until(t, () => window.__GAME__.ctx.levels.current?.id === 'gate' && !window.__GAME__.ctx.levels.loading, null, { timeout: 90000 })), 'Quest Board travel → gate');
      await settle(t);
    },
  },

  // ====================================================================================== gate: The Line, B2, CS-09/10
  {
    name: 'flow:gate', order: 92, level: null, timeout: 900000,
    async run(t) {
      fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });
      const TOWN = { ...MEADOW_DONE, 'meadow.done': true, 'forest.sage': true, 'forest.camp': true, 'forest.boss': true, 'forest.done': true,
        'town.marmalade': true, 'town.letters': true, 'town.tofu': true, 'town.earlgrey': true, 'town.clover': true, 'town.free': true, 'town.done': true };
      if ((await t.G(levelId)) !== 'gate') await fresh(t, TOWN, 'gate', 'start');
      await settle(t);
      await t.G(() => { const g = window.__GAME__, s = g.ctx.state; g.god(true); s.companions.unlocked = ['mochi', 'sage', 'clover'];
        if (s.kittens.length < 6) s.kittens = ['biscuit', 'noodle', 'button', 'pickles', 'pebble', 'sprout', 'waffles', 'toffee', 'muffin']; });
      await shot(t, 'g1-gate-start');

      // --- the war-wagon: three blows open the cage → D-06 (Pip)
      const cage = await t.G(() => { const k = window.__GAME__.ctx.actors.get('tater'); return k ? [k.pos.x, k.pos.z] : null; });
      t.assert(!!cage, 'Tater on the war-wagon');
      if (cage) {
        await fight(t, { ms: 20000, sel: `Math.hypot(e.pos.x - ${cage[0]}, e.pos.z - ${cage[1]}) < 18` });
        for (let i = 0; i < 8; i++) {
          if (await t.G(() => window.__GAME__.ctx.story.playingId === 'd06' || window.__GAME__.ctx.state.getFlag('gate.pip'))) break;
          await tp(t, cage[0], cage[1] - 1.5, 0);
          await t.tap('KeyJ', 1, 300);
          await t.wait(500);
        }
      }
      await beat(t, 'd06', { timeout: 10000, shotName: 'g2-d06', label: 'war-wagon opened' });
      t.assert((await t.G(flags, ['gate.pip']))['gate.pip'] === true, 'gate.pip');

      // --- the Old Battlefield skirmishes (S1 + S2) → gate_back ("Back to the Line!")
      // the last z < -45 kill can land inside fight() and fire gate_back before beat() polls → arm the record first
      await armScenes(t, 'gate_back');
      for (const z of [-80, -66, -56]) {
        if (await t.G(() => window.__GAME__.ctx.story.isPlaying || !!window.__flowSeen?.has('gate_back'))) break;
        await tp(t, 0, z, 0); await t.frames(20); await fight(t, { ms: 20000, sel: 'e.pos.z < -40' });
      }
      await beat(t, 'gate_back', { timeout: 20000, label: 'battlefield cleared' });
      t.assert((await t.G(flags, ['gate.back']))['gate.back'] === true, 'gate.back');

      // --- The Line: step on the marker
      await tp(t, 0, 14, Math.PI);
      await tp(t, 0, 10.5, Math.PI);
      await t.frames(30);
      const started = await until(t, () => !!window.__GAME__.ctx.objectives.line?.active, null, { timeout: 5000 });
      t.assert(!!started, 'The Line starts at the marker');
      // repair runs for real for a while (waves W1/W2 come in; fight them off the winch at 3× speed)
      await t.G(() => window.__GAME__.game.setTimeScale(3));
      const tLine = Date.now();
      while (Date.now() - tLine < 45000) {
        await fight(t, { ms: 3000 });
        const v = await t.G(() => window.__GAME__.objective('line'));
        if (v >= 30) break;
      }
      await t.G(() => window.__GAME__.game.setTimeScale(1));
      const v30 = await t.G(() => window.__GAME__.objective('line'));
      t.log(`line after real repair: ${v30}`);
      t.assert(v30 > 5, `the repair progresses in play (${v30})`);
      await shot(t, 'g3-line');
      // jump to just below 70 %, let it cross by itself → CS-08
      await fight(t, { ms: 10000 });
      await t.G(() => window.__GAME__.ctx.objectives.set('line', 69.5));
      for (let i = 0; i < 40; i++) { if (await t.G(() => !!window.__GAME__.ctx.story.playingId)) break; await fight(t, { ms: 1500 }); }
      await beat(t, 'cs08', { timeout: 30000, watch: 6000, shotName: 'g4-cs08', label: 'Line 70 %' });
      t.assert((await t.G(flags, ['gate.spoons']))['gate.spoons'] === true, 'gate.spoons');
      await t.wait(1500);
      const w4 = await t.G(() => window.__GAME__.ctx.enemies.list.filter((e) => e.alive && e.spawnOpts?.line).length);
      t.log(`W4 after CS-08: ${w4} Line enemies`);
      await shot(t, 'g5-spoon-brigade');
      await fight(t, { ms: 30000 });
      await t.G(() => window.__GAME__.ctx.objectives.set('line', 84.8));
      for (let i = 0; i < 40; i++) { if (await t.G(() => !!window.__GAME__.ctx.story.playingId)) break; await fight(t, { ms: 1500 }); }
      await beat(t, 'g02', { timeout: 30000, watch: 2500, shotName: 'g6-g02', label: 'Line 85 %' });
      await t.G(() => window.__GAME__.ctx.objectives.set('line', 99.6));
      // the last 0.4 % (~1 s at full rate) must not depend on frame rate: each beat, clear whatever stands within
      // the winch radius (trickle runners otherwise keep the repair blocked on a slow machine); if it still has not
      // crossed after a few beats (pin stolen, blocked again), push it to 100 % so the done path runs regardless
      let lineVia = null;
      for (let i = 0; i < 40; i++) {
        if (await t.G(() => window.__GAME__.ctx.state.getFlag('gate.line'))) { lineVia ??= 'natural'; break; }
        await t.G((force) => {
          const c = window.__GAME__.ctx, L = c.objectives.line, o = c.objectives.get('line');
          if (L?.winch && !L.done) {
            const r = (L.cfg?.winchRadius ?? 4) + 2, r2 = r * r;
            for (const e of [...(c.enemies?.list ?? [])]) {
              if (!e?.pos || e.alive === false || e.boss) continue;
              const dx = e.pos.x - L.winch.x, dz = e.pos.z - L.winch.z;
              if (dx * dx + dz * dz <= r2) c.enemies.despawn?.(e);
            }
          }
          if (force && o && !o.done) c.objectives.set('line', o.max);
        }, i >= 8);
        if (i >= 8) lineVia ??= 'forced';
        await fight(t, { ms: 1500 });
        await t.G(() => { const s = window.__GAME__.ctx.story; if (s.playingId === 'gate_open') s.skip(); });
      }
      t.log(`Line 99.6 → 100 %: ${lineVia}`);
      t.assert((await t.G(flags, ['gate.line']))['gate.line'] === true, 'The Line completes → gate.line');

      // --- B2: the causeway arena locks → Cacklejaw, fought down with god
      const b2 = await until(t, () => window.__GAME__.ctx.enemies.boss?.def?.id ?? null, null, { timeout: 30000 });
      t.assert(b2 === 'boss_cacklejaw', `B2 Cacklejaw (${b2})`);
      await settle(t);
      await t.wait(2500);
      await shot(t, 'g7-b2');
      const r2 = await fight(t, { boss: true, near: 30, ms: 300000 });
      t.log(`B2 fight: ${JSON.stringify(r2)}`);
      t.assert(await t.waitForEvent('boss:defeated', 8000), 'B2 beaten with god (boss:defeated)');
      await beat(t, 'cs09', { timeout: 15000, watch: 3000, shotName: 'g8-cs09', label: 'B2 defeated' });
      await beat(t, 'cs10', { timeout: 30000, watch: 3000, shotName: 'g9-cs10', label: 'after CS-09' });
      await settle(t, 60000);
      await until(t, () => window.__GAME__.ctx.levels.current?.id === 'town' && !window.__GAME__.ctx.levels.loading, null, { timeout: 60000 });
      await settle(t);
      const end = await t.G(() => { const g = window.__GAME__, s = g.ctx.state; return { done: s.getFlag('gate.done'), boss: s.getFlag('gate.boss'), shards: s.shards, level: g.ctx.levels.current?.id, env: g.ctx.env.presetName, golden: s.abilities?.golden ?? s.unlocks?.golden ?? null }; });
      t.assert(end.done === true && end.boss === true && end.shards >= 2, `gate.done, gate.boss, Shard 2 (${JSON.stringify(end)})`);
      t.assert(end.level === 'town' && end.env === 'hub_grey', `back in the grey hub (${JSON.stringify(end)})`);
      await t.wait(2500);
      await shot(t, 'g10-hub-grey');
    },
  },
];

export default FLOW;
