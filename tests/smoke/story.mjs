// tests/smoke/story.mjs  (owner: story) — smoke blocks for src/story. Phase W prologue + TT2 §10.3 guided onboarding:
// the title → new adventure hand-off (no fade, no reload, control ≤ 5 s, first reward ≤ 60 s), Morning Practice
// (4 lessons, desktop and touch, every lesson with a guide target), the bell → CS-01 in place → The Giggling Mist →
// the first fight in the yard → Suit Up chain, G-01 (a bark), CS-03, D-01 at Mochi's cart, the Skip chip and barks;
// M2: forest (D-02, CS-04, CS-05), town (D-03, CS-06, D-04 ×3, CS-07) and gate (yard, D-06, CS-08, G-02, CS-09, CS-10).
// Screenshots go to tests/shots/story/. Run against your own dev server:
//   SMOKE_URL=http://localhost:5321/ SMOKE_ONLY=story node tests/smoke.mjs
// Scenes are watched at real speed and photographed at their beats (dialogue keys / scene time); the sim is frozen
// (time scale 0) while a screenshot is taken so slow GPU readbacks never skip a beat.
import fs from 'node:fs';
import path from 'node:path';
import { walkKeys, standRmb } from './_kbm.mjs';

const DIR = 'story';
const ensureDir = (t) => fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });

/** Poll `fn(arg)` in the page until it returns something truthy (or `timeout` ms pass). */
async function until(t, fn, arg = null, { timeout = 30000, every = 120 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await t.G(fn, arg);
    if (v) return v;
    await t.wait(every);
  }
  return null;
}

/** Wait in-page (every frame) until dialogue line `key` is on screen, then freeze the sim right there (short lines
 *  can come and go between two round-trip polls). The next `shot()` thaws it. */
async function freezeOnLine(t, key, timeout = 30000) {
  return t.page.evaluate(([k, ms]) => new Promise((resolve) => {
    const g = window.__GAME__, t0 = performance.now();
    const tick = () => {
      if (g.ctx.story.line?.key === k) { setTimeout(() => { g.game.setTimeScale(0); resolve(true); }, 450); return; }
      if (performance.now() - t0 > ms) { resolve(false); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }), [key, timeout]);
}

/** Freeze the sim, take the shot, thaw. */
async function shot(t, name) {
  await t.G(() => window.__GAME__.game.setTimeScale(0));
  try { await t.frames(2); await t.shot(`${DIR}/${name}`); } catch (e) { t.warn(`shot ${name}: ${e.message}`); }
  finally { await t.G(() => window.__GAME__.game.setTimeScale(1)); }
}

const story = () => {
  const g = window.__GAME__, s = g.ctx.story;
  return { id: s.playingId, t: s.current?.t ?? null, key: s.line?.key ?? null, mode: g.mode, kind: s.current?.kind ?? null,
    lb: !!s.cinema.letterboxOn, level: g.ctx.levels.current?.id ?? null, loading: !!g.ctx.levels.loading };
};
const lineIs = (k) => window.__GAME__.ctx.story.line?.key === k;
const sceneT = ([id, sec]) => { const s = window.__GAME__.ctx.story; return s.playingId === id && (s.current?.t ?? 0) >= sec; };
const ended = (id) => window.__GAME__.ctx.story.playingId !== id && window.__GAME__.mode === 'play';

/** Fresh progress + flags, then load `level` at `spawn` (story scenes and the tutorial read these flags). */
async function fresh(t, flags = {}, level = 'meadow', spawn = 'start') {
  await t.G((f) => {
    const g = window.__GAME__, s = g.ctx.state;
    g.story.skip(); g.ctx.story.queue.length = 0;
    s.flags = {}; s.kittens = []; s.letters = [];
    for (const [k, v] of Object.entries(f)) s.setFlag(k, v);
    g.setMode('play'); g.god(true);
  }, flags);
  await t.loadLevel(level, spawn);
  await t.frames(15);
  await t.clearEvents();
}

/** Put her at (x, z) facing `yaw` on the ground and snap the camera behind. */
async function tp(t, x, z, yaw = 0) {
  await t.G(([px, pz, f]) => {
    const g = window.__GAME__, p = g.ctx.player;
    p.teleport({ pos: new g.THREE.Vector3(px, g.ctx.physics.heightAt(px, pz), pz), facing: f });
    g.ctx.cam?.snapBehind?.();
  }, [x, z, yaw]);
  await t.frames(8);
}

/** Collect a few story facts after a scene (letterbox off, mode, scripted actors released, camera mode). */
const afterScene = () => {
  const g = window.__GAME__;
  return { mode: g.mode, lb: !!g.ctx.story.cinema.letterboxOn, scripted: !!g.ctx.player.scripted, cam: g.ctx.cam.modeName,
    playing: g.ctx.story.isPlaying, dlg: !!g.ctx.story.line };
};

function checkHandback(t, a, label) {
  t.assert(a.mode === 'play', `${label}: back to play (${a.mode})`);
  t.assert(!a.lb, `${label}: letterbox off`);
  t.assert(!a.scripted, `${label}: player released`);
  t.assert(!a.playing, `${label}: no scene running`);
  t.assert(!a.dlg, `${label}: dialogue box closed`);
}

// ====================================================================================================== M2: Acts I–II
/** Play `id` and wait for it to start (play() returns a promise we must not serialise). */
async function playScene(t, id) {
  await t.G((i) => { window.__GAME__.ctx.story.play(i); }, id);
  return until(t, (i) => window.__GAME__.ctx.story.playingId === i, id, { timeout: 8000 });
}

/** Shoot at a dialogue line (frozen on it), else warn. */
async function atLine(t, key, name, timeout = 40000) {
  if (await freezeOnLine(t, key, timeout)) await shot(t, name); else t.warn(`missed line ${key}`);
}

/** Wait until scene `id` is over and gameplay is back (`level` loaded when given). */
async function sceneOver(t, id, timeout = 90000) {
  return until(t, (i) => { const g = window.__GAME__; return g.ctx.story.playingId !== i && !g.ctx.story.queue.some((e) => e.id === i) && !g.ctx.levels.loading; }, id, { timeout });
}

const flagsOf = (keys) => { const s = window.__GAME__.ctx.state; return Object.fromEntries(keys.map((k) => [k, s.getFlag(k)])); };

const MEADOW_DONE = { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true, 'meadow.pudding': true, 'meadow.mochi': true, 'meadow.done': true };
const FOREST_DONE = { ...MEADOW_DONE, 'forest.sage': true, 'forest.camp': true, 'forest.boss': true, 'forest.done': true };
const TOWN_DONE = { ...FOREST_DONE, 'town.marmalade': true, 'town.letters': true, 'town.tofu': true, 'town.earlgrey': true, 'town.clover': true, 'town.free': true, 'town.done': true };

const M2_BLOCKS = [
  // ------------------------------------------------------------------ forest: D-02, CS-04 Lantern Night, CS-05 First Light
  {
    name: 'story:forest', order: 78, level: 'forest', spawn: 'start', timeout: 300000,
    async run(t) {
      ensureDir(t);
      await fresh(t, MEADOW_DONE, 'forest', 'start');
      await t.G(() => { const g = window.__GAME__; g.ctx.state.companions.unlocked = ['mochi']; g.ctx.companions.setActive?.(['mochi']); });
      // D-02: Sage at the treetop (spawned here: the cage is companions')
      await tp(t, 18, -11.5, 0);
      await t.G(() => { window.__GAME__.ctx.companions.spawnNpc('sage', [18.4, -9.6], Math.PI); });
      await t.frames(20);
      t.assert(!!(await playScene(t, 'd02')), 'D-02 plays');
      await atLine(t, 'd02.3', '10a-d02-sage');
      t.assert(!!(await sceneOver(t, 'd02', 30000)), 'D-02 finished');
      let f = await t.G(flagsOf, ['forest.sage']);
      t.assert(f['forest.sage'] === true, 'flag forest.sage');
      checkHandback(t, await t.G(afterScene), 'D-02');
      // CS-04 through the world trigger `camp` when it exists, else directly
      await tp(t, 6, 33, 0);
      await t.hold('KeyW', 900);
      let on = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs04', null, { timeout: 3000 });
      if (!on) { t.log('camp trigger not reached: playing cs04 directly'); on = await playScene(t, 'cs04'); }
      t.assert(!!on, 'CS-04 plays');
      if (await until(t, sceneT, ['cs04', 6.0], { timeout: 15000 })) await shot(t, '10b-cs04-crane');
      await atLine(t, 'cs04.1', '10c-cs04-sage');
      await atLine(t, 'cs04.3', '10d-cs04-here');
      await atLine(t, 'cs04.4', '10e-cs04-mochi');
      if (await until(t, () => (window.__GAME__.ctx.story.current?.t ?? 0) > 0 && window.__GAME__.ctx.cam.currentShot?.mode === 'rail' && !window.__GAME__.ctx.story.line, null, { timeout: 20000 })) { await t.wait(1500); await shot(t, '10f-cs04-pushout'); }
      t.assert(!!(await sceneOver(t, 'cs04', 40000)), 'CS-04 finished');
      await t.wait(800);
      const s4 = await t.G(() => { const g = window.__GAME__; return { camp: g.ctx.state.getFlag('forest.camp'), env: g.ctx.env.presetName, vigil: g.ctx.levels.current?.vigils?.find((v) => v.id === 'vigil_3')?.lit ?? null }; });
      t.assert(s4.camp === true, 'flag forest.camp');
      t.assert(['forest_twilight', 'forest_night'].includes(s4.env), `env forest_twilight (${s4.env})`);
      if (s4.vigil !== null) t.assert(s4.vigil === true, 'vigil_3 lit by CS-04');
      checkHandback(t, await t.G(afterScene), 'CS-04');
      await shot(t, '10g-cs04-after');
      // CS-05: the real B1 when enemies provide it (god, 1% HP, one hit), else the scene by id
      await t.G(() => window.__GAME__.god(true));
      await t.loadLevel('forest', 'boss');
      await t.frames(20);
      await t.clearEvents();
      const boss = await t.G(() => { const g = window.__GAME__; g.startBoss?.(); return !!g.ctx.enemies.boss; });
      let five = false;
      if (boss) {
        await t.wait(600);
        await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss, p = g.ctx.player; g.ctx.story.skipAll(); g.setMode('play');
          b.setHpFrac?.(0.01); p.teleport({ pos: b.pos.clone().add(new g.THREE.Vector3(0, 0, -1.6)), facing: 0 }); });
        for (let i = 0; i < 6 && !five; i++) { await t.tap('KeyJ', 1, 200); five = !!(await until(t, () => window.__GAME__.ctx.story.playingId === 'cs05', null, { timeout: 1500 })); }
        if (!five) t.warn('B1 did not fall to the test hit: playing cs05 directly');
      } else t.warn('no B1 boss yet: playing cs05 directly');
      if (!five) five = !!(await playScene(t, 'cs05'));
      t.assert(five, 'CS-05 plays');
      await atLine(t, 'cs05.1', '10h-cs05-yield');
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'HERO_LOW' && window.__GAME__.ctx.story.playingId === 'cs05', null, { timeout: 25000 })) { await t.wait(1900); await shot(t, '10i-cs05-shard'); }
      t.assert(!!(await sceneOver(t, 'cs05', 40000)), 'CS-05 finished');
      const s5 = await t.G(() => ({ shards: window.__GAME__.ctx.state.shards, boss: window.__GAME__.ctx.state.getFlag('forest.boss') }));
      t.assert(s5.shards >= 1 && s5.boss === true, `Shard 1 + forest.boss (${JSON.stringify(s5)})`);
      checkHandback(t, await t.G(afterScene), 'CS-05');
    },
  },

  // ------------------------------------------------------------------ town: D-03, CS-06 (letter card), D-04 ×3, CS-07 (red cape, results)
  {
    name: 'story:town', order: 79, level: 'town', spawn: 'start', timeout: 360000,
    async run(t) {
      ensureDir(t);
      await fresh(t, FOREST_DONE, 'town', 'start');
      await t.G(() => { const g = window.__GAME__; g.ctx.state.companions.unlocked = ['mochi', 'sage']; g.ctx.companions.setActive?.(['mochi']); });
      await tp(t, -19, -18, -Math.PI / 2);
      await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.ARENA_CLEAR, { id: 'bakery' }); });
      t.assert(!!(await until(t, () => window.__GAME__.ctx.story.playingId === 'd03', null, { timeout: 5000 })), 'Bakery Street clear → D-03');
      await atLine(t, 'd03.1', '11a-d03-armour');
      await atLine(t, 'd03.4', '11b-d03-loan');
      t.assert(!!(await sceneOver(t, 'd03', 40000)), 'D-03 finished');
      const s3 = await t.G(() => ({ f: window.__GAME__.ctx.state.getFlag('town.marmalade'), chase: !!window.__GAME__.ctx.objectives.get?.('chase') }));
      t.assert(s3.f === true, 'flag town.marmalade');
      t.assert(s3.chase, 'objective "Catch Pilfer!"');
      checkHandback(t, await t.G(afterScene), 'D-03');
      // the bag comes back → CS-06 at the Post Office
      await tp(t, -30, 1, -Math.PI / 2);
      await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.ITEM_RETURNED, { item: 'post_bag', amount: 1 }); });
      t.assert(!!(await until(t, () => window.__GAME__.ctx.story.playingId === 'cs06', null, { timeout: 5000 })), 'post bag returned → CS-06');
      await atLine(t, 'cs06.1', '11c-cs06-summons');
      await atLine(t, 'cs06.3', '11d-cs06-nobody');
      await atLine(t, 'cs06.6', '11e-cs06-coo');
      if (await until(t, () => !!window.__GAME__.ctx.story.cinema.letterOn, null, { timeout: 25000 })) { await t.wait(1600); await shot(t, '11f-cs06-letter'); }
      t.assert(!!(await sceneOver(t, 'cs06', 40000)), 'CS-06 finished');
      const s6 = await t.G(() => ({ f: window.__GAME__.ctx.state.getFlag('town.letters'), card: window.__GAME__.ctx.story.cinema.letterOn }));
      t.assert(s6.f === true, 'flag town.letters');
      t.assert(!s6.card, 'letter card closed');
      checkHandback(t, await t.G(afterScene), 'CS-06');
      await shot(t, '11g-cs06-belt');
      // D-04 ×3
      for (const [id, at, flag] of [['d04tofu', [18, -11], 'town.tofu'], ['d04earlgrey', [0, 2], 'town.earlgrey'], ['d04clover', [9, 11.5], 'town.clover']]) {
        await tp(t, at[0], at[1], 0);
        t.assert(!!(await playScene(t, id)), `${id} plays`);
        const key = { d04tofu: 'd04.tofu.1', d04earlgrey: 'd04.earlgrey.1', d04clover: 'd04.clover.1' }[id];
        await atLine(t, key, `11h-${id}`);
        t.assert(!!(await sceneOver(t, id, 30000)), `${id} finished`);
        t.assert((await t.G((k) => window.__GAME__.ctx.state.getFlag(k), flag)) === true, `flag ${flag}`);
      }
      t.assert((await t.G(() => window.__GAME__.ctx.state.companions.unlocked.includes('clover'))), 'Clover joined the roster');
      // CS-07: the steps trigger when world provides it, else directly
      await tp(t, 0, 29, 0);
      await t.hold('KeyW', 900);
      let on = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs07', null, { timeout: 3000 });
      if (!on) { t.log('steps trigger not reached: playing cs07 directly'); on = await playScene(t, 'cs07'); }
      t.assert(!!on, 'CS-07 plays');
      if (await until(t, sceneT, ['cs07', 3.5], { timeout: 15000 })) await shot(t, '11i-cs07-crane');
      await atLine(t, 'cs07.5', '11j-cs07-cape');
      await atLine(t, 'cs07.8', '11k-cs07-bell');
      if (await until(t, () => window.__GAME__.events.includes('ui:toast') && window.__GAME__.ctx.story.playingId === 'cs07' && (window.__GAME__.ctx.story.current?.t ?? 0) > 30, null, { timeout: 40000 })) { await t.wait(600); await shot(t, '11l-cs07-free'); }
      t.assert(!!(await sceneOver(t, 'cs07', 60000)), 'CS-07 finished');
      await until(t, () => window.__GAME__.events.includes('level:results'), null, { timeout: 10000 });
      const s7 = await t.G(() => { const g = window.__GAME__, s = g.ctx.state; return { free: s.getFlag('town.free'), done: s.getFlag('town.done'), cape: s.cosmetics.cape, capes: s.cosmetics.capes, results: g.events.includes('level:results'), level: g.ctx.levels.current?.id }; });
      t.assert(s7.free === true && s7.done === true, 'flags town.free + town.done');
      t.assert(s7.cape === 'red' && s7.capes.includes('red'), `red cape equipped (${s7.cape})`);
      t.assert(s7.results, 'Chapter 3 results card');
      t.assert(s7.level === 'town', 'town stays loaded (it becomes the hub)');
      await t.G(() => { const ui = window.__GAME__.ctx.ui; ui?.closeResults?.(); ui?.results?.close?.(); });
      await until(t, () => window.__GAME__.mode === 'play', null, { timeout: 8000 });
      await t.wait(800);
      await shot(t, '11m-cs07-red-cape');
      const board = await t.G(() => window.__GAME__.ctx.story.board());
      t.assert(board.next === 'gate', `Quest Board: next level gate (${board.next})`);
      const hub = await t.G(() => window.__GAME__.ctx.story.hubTalk('snowpaw'));
      t.assert(!!hub?.key?.startsWith('hub.snowpaw'), 'hub line');
    },
  },

  // ------------------------------------------------------------------ gate: yard, D-06, CS-08 (never cut), G-02, CS-09, CS-10 → hub
  {
    name: 'story:gate', order: 80, level: 'gate', spawn: 'start', timeout: 420000,
    async run(t) {
      ensureDir(t);
      await fresh(t, TOWN_DONE, 'gate', 'start');
      await t.G(() => { const g = window.__GAME__, s = g.ctx.state; s.companions.unlocked = ['mochi', 'sage', 'clover']; g.ctx.companions.setActive?.(['mochi']);
        s.kittens = ['biscuit', 'noodle', 'button', 'pickles', 'pebble', 'sprout', 'waffles']; });
      t.assert(!!(await playScene(t, 'gate_yard')), 'the yard dialogue plays');
      await atLine(t, 'gate.yard.2', '12a-gate-yard');
      t.assert(!!(await sceneOver(t, 'gate_yard', 40000)), 'yard dialogue finished');
      // D-06 at the war-wagon
      await tp(t, 3.2, -76.5, Math.PI * 0.8);
      t.assert(!!(await playScene(t, 'd06')), 'D-06 plays');
      await atLine(t, 'd06.1', '12b-d06-pip');
      t.assert(!!(await sceneOver(t, 'd06', 30000)), 'D-06 finished');
      t.assert((await t.G(() => window.__GAME__.ctx.state.getFlag('gate.pip'))) === true, 'flag gate.pip');
      // The Line: 70% → CS-08 (never cut) through the story's own listener
      await tp(t, 0, 10, Math.PI);
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e);
        const o = g.ctx.objectives; if (!o.get('line')) o.start('line', { max: 100, value: 0, textKey: 'obj.line' }); o.set('line', 70); });
      t.assert(!!(await until(t, () => window.__GAME__.ctx.story.playingId === 'cs08', null, { timeout: 12000 })), 'repair 70% → CS-08');
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'MEME_LOOP' && window.__GAME__.ctx.story.playingId === 'cs08', null, { timeout: 8000 })) { await t.wait(2000); await shot(t, '12c-cs08-meme'); }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'REVERSE_HORDE', null, { timeout: 10000 })) { await t.wait(3500); await shot(t, '12d-cs08-horde'); }
      await atLine(t, 'cs08.1', '12e-cs08-nobody');
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'PULLBACK', null, { timeout: 15000 })) { await t.wait(5200); await shot(t, '12f-cs08-pullback'); }
      const rows = await t.G(() => window.__GAME__.ctx.story.current?._rows?.length ?? 0);
      t.assert(rows === 7, `7 rescued kittens behind her (${rows})`);
      await atLine(t, 'cs08.4', '12g-cs08-spoon');
      t.assert(!!(await sceneOver(t, 'cs08', 40000)), 'CS-08 finished');
      t.assert((await t.G(() => window.__GAME__.ctx.state.getFlag('gate.spoons'))) === true, 'Spoon Brigade on');
      checkHandback(t, await t.G(afterScene), 'CS-08');
      // 85% → G-02 Marmalade's Leap
      await t.G(() => window.__GAME__.ctx.objectives.set('line', 86));
      t.assert(!!(await until(t, () => window.__GAME__.ctx.story.playingId === 'g02', null, { timeout: 6000 })), 'repair 85% → G-02');
      if (await until(t, () => window.__GAME__.ctx.story.current?._leaping, null, { timeout: 6000 })) { await t.wait(1500); await shot(t, '12h-g02-leap'); }
      t.assert(!!(await sceneOver(t, 'g02', 20000)), 'G-02 finished');
      const tsc = await t.G(() => window.__GAME__.game.loop?.timeScale ?? 1);
      t.assert(Math.abs(tsc - 1) < 1e-6, `time scale back to 1 (${tsc})`);
      checkHandback(t, await t.G(afterScene), 'G-02');
      // 100% → the gate test (ambient)
      await t.G(() => window.__GAME__.ctx.objectives.set('line', 100));
      await until(t, () => window.__GAME__.ctx.state.getFlag('gate.line') === true, null, { timeout: 12000 });
      t.assert((await t.G(() => window.__GAME__.ctx.state.getFlag('gate.line'))) === true, 'flag gate.line');
      // CS-09 → CS-10
      await tp(t, 0, 8, Math.PI);
      t.assert(!!(await playScene(t, 'cs09')), 'CS-09 plays');
      await atLine(t, 'cs09.1', '12i-cs09-charge');
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'HERO_LOW' && window.__GAME__.ctx.story.playingId === 'cs09', null, { timeout: 25000 })) { await t.wait(3300); await shot(t, '12j-cs09-gold-ref1'); }
      await atLine(t, 'cs09.2', '12k-cs09-pudding');
      await atLine(t, 'cs09.4', '12l-cs09-hold');
      t.assert(!!(await until(t, () => window.__GAME__.ctx.story.playingId === 'cs10', null, { timeout: 60000 })), 'CS-10 follows');
      const s9 = await t.G(() => ({ shards: window.__GAME__.ctx.state.shards, boss: window.__GAME__.ctx.state.getFlag('gate.boss') }));
      t.assert(s9.shards >= 2 && s9.boss === true, `Shard 2 + gate.boss (${JSON.stringify(s9)})`);
      await atLine(t, 'cs10.1', '12m-cs10-where');
      await t.G(() => { const ui = window.__GAME__.ctx.ui; setTimeout(() => { ui?.closeResults?.(); ui?.results?.close?.(); }, 1500); });
      await atLine(t, 'cs10.3', '12n-cs10-letter', 60000);
      await atLine(t, 'cs10.6', '12o-cs10-yet');
      if (await until(t, () => window.__GAME__.ctx.env.presetName?.startsWith?.('hub_') && window.__GAME__.ctx.story.playingId === 'cs10', null, { timeout: 20000 })) { await t.wait(3000); await shot(t, '12p-cs10-hush'); }
      t.assert(!!(await sceneOver(t, 'cs10', 60000)), 'CS-10 finished');
      await t.wait(1000);
      const s10 = await t.G(() => { const g = window.__GAME__; return { done: g.ctx.state.getFlag('gate.done'), gd: g.ctx.state.getFlag('gate.done'), level: g.ctx.levels.current?.id, env: g.ctx.env.presetName, results: g.events.includes('level:results') }; });
      t.assert(s10.done === true, 'flag gate.done');
      t.assert(s10.level === 'town', `back in Pawsbury (${s10.level})`);
      t.assert(['hub_hush', 'hub_grey'].includes(s10.env), `the hub hushes (${s10.env})`);
      checkHandback(t, await t.G(afterScene), 'CS-10');
      await shot(t, '12q-hub-grey');
      const q = await t.G(() => window.__GAME__.ctx.story.quest?.id);
      t.assert(q === 'hub-bog', `quest: north to the Bogmire (${q})`);
    },
  },
];

// ====================================================================================================== Phase W prologue
/** Tutorial lesson index (1-based) and whether practice is over. */
const atStep = (t, n, timeout = 8000) => until(t, (k) => { const tu = window.__GAME__.ctx.story.tutorial; return tu.step >= k && !tu.pending && !window.__GAME__.ctx.story.isPlaying; }, n, { timeout });
const target = () => { const tg = window.__GAME__.ctx.story.guideTarget?.(); return tg ? { id: tg.id, x: tg.x, z: tg.z, textKey: tg.textKey, kind: tg.kind, arriveR: tg.arriveR } : null; };
const chipOn = () => { const e = document.querySelector('.cin-skip-chip'); return !!e && e.classList.contains('is-on'); };

/** Skip whatever scene runs (the runner applies its end) until none is left. */
async function skipScenes(t, max = 6) {
  for (let k = 0; k < max && await t.G(() => window.__GAME__.ctx.story.isPlaying); k++) { await t.G(() => window.__GAME__.story.skip()); await t.wait(500); }
}

/**
 * Walk toward the ground at (x, z) on WASD for up to ~1.5 s (TT3 §11.2: the default `hybrid` preset walks on WASD; RMB
 * is the Stand). Callers loop on the guide target, so a short leg per call is enough.
 */
async function orderTo(t, x, z) { await walkKeys(t, x, z, { r: 0.45, ms: 1500 }); }

/** Walk to the current guide target on WASD only (what the Pink Paw trail invites), up to `ms`. */
async function followGuide(t, { ms = 15000, until: done = null, id = null } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const tg = await t.G(target);
    if (!tg || (id && tg.id !== id)) return tg;
    if (done && await t.G(done)) return tg;
    const p = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
    if (Math.hypot(p[0] - tg.x, p[2] - tg.z) <= Math.max(0.5, tg.arriveR * 0.6)) return tg;
    await orderTo(t, tg.x, tg.z);
    await t.wait(900);
  }
  return t.G(target);
}

/** In-page: press the Stand key just inside Sir Wobble's parry window (a timed player); resolves on the press. */
async function timedParry(t) {
  const ok = await t.page.evaluate(() => new Promise((resolve) => {
    const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'), t0 = performance.now();
    const tick = () => {
      if (!wk || performance.now() - t0 > 9000) { resolve(false); return; }
      if (wk.phase === 'windup' && wk.phaseT >= wk.atk.windup - 0.11) { resolve(true); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  if (ok) await standRmb(t, 250);                 // TT3 §11.2: the Stand is RMB (the prompt names it)
  return ok;
}

/** The 4 TT2 lessons with the desktop mouse + keyboard, guided by guideTarget() only (+ the Stand key timing). */
async function playPractice(t, { shots = true } = {}) {
  t.assert(!!(await until(t, () => window.__GAME__.ctx.story.tutorial.active, null, { timeout: 10000 })), 'Morning Practice is active');
  t.assert(await t.G(chipOn), 'the Skip chip shows during practice');
  // 1 move: WASD toward the dummy (the guide target)
  await atStep(t, 1, 6000);
  const t1 = await t.G(target);
  t.assert(t1?.id === 'tut.move' && t1.kind === 'lesson' && t1.x === 0 && t1.z === -76, `move target: the middle dummy (${JSON.stringify(t1)})`);
  if (shots) await shot(t, '02a-practice-move');
  await followGuide(t, { id: 'tut.move', ms: 15000 });
  let s = await atStep(t, 2, 6000);
  t.assert(!!s, 'lesson 2 (bonk) after walking to the dummy');
  // 2 bonk: Pearl's bow bark (no scene), J ×3 with the cursor on the dummy
  t.assert((await t.G(() => window.__GAME__.ctx.story.playingId)) == null, 'no tutbow scene');
  const dum = await t.G(() => window.__GAME__.screen(0, -76, 0.6));
  if (dum) { await t.page.mouse.move(dum.x, dum.y); await t.wait(100); }
  for (let k = 0; k < 10 && !(await t.G(() => window.__GAME__.ctx.story.tutorial.step >= 3)); k++) {
    // the move lesson also ends after 10 m: walk on to the dummy (its guide target) first
    const d = await t.G(() => { const p = window.__GAME__.ctx.player.pos; return Math.hypot(p.x, p.z + 76); });
    if (d > 1.8) { await orderTo(t, 0, -77.4); await t.wait(1000); continue; }
    const dm = await t.G(() => window.__GAME__.screen(0, -76, 0.6));
    if (dm) { await t.page.mouse.move(dm.x, dm.y); await t.wait(80); }
    // TT3 §11.2: LMB on the dummy (the taught key) gives the attack order, so she turns to it and steps into reach. J
    // swings where she faces: after a WASD walk that ended past the dummy she faced away and the 3 bonks missed (full run)
    if (dm && k % 2 === 0) { for (let i = 0; i < 3; i++) { await t.page.mouse.click(dm.x, dm.y); await t.wait(260); } }
    else await t.tap('KeyJ', 3, 260);
    await t.wait(700);
  }
  s = await atStep(t, 3, 8000);
  t.assert(!!s, 'lesson 3 (Sir Wobble: block) after 3 bonks');
  t.assert(await t.G(() => window.__GAME__.ctx.state.getFlag('sticker.bow') === true), 'the Pink Bow card (bow flag) without a scene');
  // 3 the drill: walk to the stand spot ("Get close to Sir Wobble!" while far), hold the Stand
  const far = await t.G(target);
  t.assert(far?.textKey === 'onb.wobble.close', `far from Sir Wobble: "Get close" (${far?.textKey})`);
  await followGuide(t, { ms: 15000, until: () => window.__GAME__.ctx.story.guideTarget?.()?.textKey !== 'onb.wobble.close' });
  const wkS = await t.G(() => { const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'); return wk ? g.screen(wk.pos.x, wk.pos.z, wk.pos.y + 0.5) : null; });
  if (wkS?.x != null) await t.page.mouse.move(wkS.x, wkS.y, { steps: 6 });
  if (shots) await shot(t, '02b-practice-wobble');
  await t.page.mouse.down({ button: 'right' });   // TT3 §11.2: hold RMB = hold the Stand
  s = await atStep(t, 4, 15000);
  await t.page.mouse.up({ button: 'right' });
  t.assert(!!s, 'lesson 4 (parry) after a block');
  // 4 parry: a timed Stand tap (the first swing runs in slow motion)
  for (let k = 0; k < 5 && !(await t.G(() => window.__GAME__.ctx.state.getFlag('prologue.practice'))); k++) { await timedParry(t); await t.wait(700); }
  if (!(await t.G(() => window.__GAME__.ctx.state.getFlag('prologue.practice')))) {
    t.warn('no timed parry landed: emitting one from Sir Wobble');
    await t.G(() => { const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'); g.ctx.bus.emit(g.E.PLAYER_PARRY, { attacker: wk, gold: false, position: g.ctx.player.pos.clone() }); });
  }
  const done = await until(t, () => window.__GAME__.ctx.state.getFlag('prologue.practice') === true, null, { timeout: 8000 });
  t.assert(!!done, 'flag prologue.practice when practice is over');
}

/**
 * Morning Practice through the touch path, on its own hasTouch / isMobile page (`w`×`h`): the guide target leads,
 * ground taps walk, the ⚔ and 🛡 buttons drive the lessons, the Skip chip shows (tap-and-hold skips).
 */
async function tutorialTouch(t, w, h, tag) {
  const errors = [];
  const ctxM = await t.browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctxM.newPage();
  pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  const G = async (fn, arg) => { const hd = await pg.evaluateHandle(fn, arg); try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); } };
  const untilM = async (fn, arg, ms = 8000) => { const t0 = Date.now(); let v = await G(fn, arg); while (!v && Date.now() - t0 < ms) { await pg.waitForTimeout(120); v = await G(fn, arg); } return v; };
  const stepAt = (n, ms = 8000) => untilM((k) => { const tu = window.__GAME__.ctx.story.tutorial; return tu.step >= k && !tu.pending && !window.__GAME__.ctx.story.isPlaying; }, n, ms);
  const mshot = async (name) => {
    await G(() => window.__GAME__.game.setTimeScale(0));
    try { await pg.waitForTimeout(60); await pg.screenshot({ path: path.join(t.shotsDir, DIR, `${name}.png`) }); } catch (e) { t.warn(`shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); }
    finally { await G(() => window.__GAME__.game.setTimeScale(1)); }
  };
  const btn = (a) => G((x) => { const b = document.querySelector(`.tbtn[data-action="${x}"]`); if (!b || b.classList.contains('is-hidden')) return null; const r = b.getBoundingClientRect(); return r.width > 0 ? [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] : null; }, a);
  const press = (a, ms) => G(([x, d]) => new Promise((resolve) => {
    const b = document.querySelector(`.tbtn[data-action="${x}"]`); if (!b) { resolve(false); return; }
    const r = b.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const ev = (tp) => b.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: 41, clientX: cx, clientY: cy, pointerType: 'touch' }));
    ev('pointerdown'); setTimeout(() => { ev('pointerup'); resolve(true); }, d);
  }), [a, ms]);
  const tapBtn = async (a) => { const c = await btn(a); if (!c) return false; await pg.touchscreen.tap(c[0], c[1]); return true; };
  // a ground tap toward (x, z): on it when it is on screen, else toward it inside the screen edge, never on a HUD
  // element (the edge arrow, the objective line, a bubble: those take their own taps)
  const tapToward = async (x, z) => {
    const p = await G(([a, b, W, H]) => {
      const g = window.__GAME__, q = g.ctx.player.pos, me = g.screen(q.x, q.z), tp = g.screen(a, b);
      const free = (px, py) => { const e = document.elementFromPoint(px, py); return !!e && (e.tagName === 'CANVAS' || e.classList?.contains('touch-root')); };
      if (tp && tp.x > 30 && tp.y > 60 && tp.x < W - 30 && tp.y < H - 30 && free(tp.x, tp.y)) return tp;
      const dx = tp.x - me.x, dy = tp.y - me.y; let k = 1;
      for (const [v, lo, hi, o] of [[dx, 90, W - 90, me.x], [dy, 90, H - 90, me.y]]) { if (o + v * k > hi) k = (hi - o) / v; if (o + v * k < lo) k = (lo - o) / v; }
      for (let f = 1; f > 0.15; f -= 0.1) { const px = me.x + dx * k * f, py = me.y + dy * k * f; if (free(px, py)) return { x: px, y: py }; }
      return { x: me.x + dx * k * 0.3, y: me.y + dy * k * 0.3 };
    }, [x, z, w, h]);
    await pg.touchscreen.tap(Math.round(p.x), Math.round(p.y));
  };
  const follow = async (until, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await G(until)) return true;
      const tg = await G(() => window.__GAME__.ctx.story.guideTarget?.());
      if (!tg) return false;
      await tapToward(tg.x, tg.z); await pg.waitForTimeout(900);
    }
    return !!(await G(until));
  };
  try {
    for (let k = 0; ; k++) {
      try { await pg.goto(`${t.base}?test=1&seed=1`, { timeout: 120000 }); break; } catch (e) { if (k >= 2) throw e; t.warn(`${tag}: page load retry ${k + 1}`); }
    }
    await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 200000 });
    await pg.touchscreen.tap(Math.round(w * 0.62), Math.round(h * 0.3));            // input device → touch
    await pg.waitForTimeout(300);
    await G(async () => {
      const g = window.__GAME__, c = g.ctx;
      g.story.skip?.(); c.story.queue.length = 0; c.player?.order?.('stop');
      c.state.flags = {}; c.state.setFlag('prologue.start', true);
      await g.loadLevel('meadow', 'practice');
      return true;
    });
    await pg.waitForTimeout(500);
    await G(() => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); g.god(true); g.ctx.ui.touch?.enable?.(true); });
    t.assert(!!(await untilM(() => window.__GAME__.ctx.story.tutorial.active, null, 30000)), `${tag}: practice starts`);
    t.assert((await G(() => window.__GAME__.ctx.input.device)) === 'touch', `${tag}: device touch`);
    t.assert(!!(await untilM(() => { const e = document.querySelector('.cin-skip-chip'); return !!e && e.classList.contains('is-on'); }, null, 2000)), `${tag}: the Skip chip shows`);
    await stepAt(1, 6000); await pg.waitForTimeout(600);
    await mshot(`02t-${tag}-1-move`);
    // 1 move + 2 bonk: ground taps toward the guide target (the dummy), then ⚔ ×3 once she is at it
    const near = (r) => G((rr) => { const g = window.__GAME__, tg = g.ctx.story.guideTarget?.(), p = g.ctx.player.pos; return !!tg && Math.hypot(p.x - tg.x, p.z - tg.z) <= rr; }, r);
    let s = await follow(() => window.__GAME__.ctx.story.tutorial.step >= 2, 20000);
    t.assert(!!s, `${tag}: lesson 2 (bonk) after ground taps`);
    for (let k = 0; k < 8 && !(await G(() => window.__GAME__.ctx.story.tutorial.step >= 3)); k++) {
      if (!(await near(1.7))) { const tg = await G(() => window.__GAME__.ctx.story.guideTarget?.()); if (tg) await tapToward(tg.x, tg.z - 1.2); await pg.waitForTimeout(900); continue; }
      for (let i = 0; i < 3; i++) { await tapBtn('attack'); await pg.waitForTimeout(260); }
      await pg.waitForTimeout(700);
    }
    s = await stepAt(3, 10000);
    t.assert(!!s, `${tag}: lesson 3 (Sir Wobble) after ⚔ ×3`);
    // 3 the drill: tap toward the stand spot, hold 🛡
    await follow(() => window.__GAME__.ctx.story.guideTarget?.()?.textKey !== 'onb.wobble.close', 15000);
    await mshot(`02t-${tag}-3-wobble`);
    await press('guard', 4000);
    s = await stepAt(4, 12000);
    t.assert(!!s, `${tag}: lesson 4 (parry) after a block`);
    // 4 parry: emitted (the timing path is covered on desktop)
    await G(() => { const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'); g.ctx.bus.emit(g.E.PLAYER_PARRY, { attacker: wk, gold: false, position: g.ctx.player.pos.clone() }); });
    t.assert(!!(await untilM(() => window.__GAME__.ctx.state.getFlag('prologue.practice') === true, null, 6000)), `${tag}: practice over`);
    // the bell → CS-01 in place; the chip shows from its first half second; tap-and-hold the chip skips it
    t.assert(!!(await untilM(() => window.__GAME__.ctx.story.playingId === 'cs01', null, 6000)), `${tag}: CS-01 right after the bell`);
    t.assert(!!(await untilM(() => { const e = document.querySelector('.cin-skip-chip'); return !!e && e.classList.contains('is-on'); }, null, 500)), `${tag}: Skip chip ≤ 0.5 s into CS-01`);
    await mshot(`02t-${tag}-4-cs01-chip`);
    const chip = await G(() => { const r = document.querySelector('.cin-skip-chip').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), Math.round(r.width), Math.round(r.height)]; });
    t.assert(chip[3] >= 40, `${tag}: chip ≥ 40 px tall (${chip[3]})`);
    await G(([x, y]) => { const e = document.querySelector('.cin-skip-chip'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y, pointerType: 'touch' })); }, chip);
    const skipped = await untilM(() => window.__GAME__.ctx.story.playingId !== 'cs01', null, 3000);
    await G(([x, y]) => { const e = document.querySelector('.cin-skip-chip'); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y, pointerType: 'touch' })); }, chip);
    t.assert(!!skipped, `${tag}: holding the Skip chip skips CS-01`);
  } catch (e) { t.fail(`${tag}: ${e?.message ?? e}`); }
  finally { await ctxM.close(); }
  for (const e of errors) t.fail(`${tag} page: ${e}`);
}

const PROLOGUE_DONE = { 'prologue.start': true, 'prologue.practice': true, 'prologue.chart': true, 'prologue.raid': true, 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true };

export default [
  // ------------------------------------------------------------------ CS-00 title → new adventure (WA §6.3, story.W2)
  {
    name: 'story:title', order: 70, level: null, reload: true, timeout: 180000,
    async run(t) {
      ensureDir(t);
      const s0 = await until(t, story, null, { timeout: 30000 });
      t.assert(s0?.id === 'cs00', `CS-00 plays at boot (playing ${s0?.id})`);
      await until(t, () => window.__GAME__.ctx.story.cinema.titleOn || window.__GAME__.ctx.story.current?.t > 3, null, { timeout: 15000 });
      await t.wait(1500);
      await shot(t, '00-title');
      await t.blankCheck('title');
      // the tap: story.newGame() on the title (ui's candy button calls the same) — no fade, no reload
      await t.clearEvents();
      const t0 = Date.now();
      await t.G(() => { window.__GAME__.ctx.story.newGame(); });
      const play = await until(t, () => { const g = window.__GAME__; return g.mode === 'play' && !g.ctx.story.isPlaying && !g.ctx.levels.loading; }, null, { timeout: 8000, every: 80 });
      t.assert(!!play, 'new adventure → play');
      const p0 = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
      await t.hold('KeyD', 450);
      const p1 = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
      const ctl = (Date.now() - t0) / 1000;
      t.log(`control after ${ctl.toFixed(2)} s (moved ${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2)} m)`);
      t.assert(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.3, 'a move is accepted right after the tap');
      t.assert(ctl <= 5 + 1.5, `control ≤ 5 s after the tap (+ harness round trips): ${ctl.toFixed(2)} s`);
      const ev = await t.events();
      t.assert(!ev.includes('level:loaded'), 'no reload on the title scene');
      const st = await t.G(() => { const g = window.__GAME__; return { start: g.ctx.state.getFlag('prologue.start'), level: g.ctx.levels.current?.id, fade: Math.max(0, ...[...document.querySelectorAll('.st-fade, .cin-fade')].map((e) => +getComputedStyle(e).opacity || 0)) }; });
      t.assert(st.start === true && st.level === 'meadow', 'prologue.start on the meadow');
      t.assert(st.fade < 0.05, `no fade over the hand-off (${st.fade})`);
      t.assert(!ev.includes('cutscene:start') || !(await t.G(() => window.__GAME__.ctx.story.seen('tutlook'))), 'no tutlook look shot');
      // first reward ≤ 60 s: walk to the dummy, bonk (the Pink Bow card / First Bonk sticker)
      await until(t, () => window.__GAME__.ctx.story.tutorial.active, null, { timeout: 8000 });
      await t.wait(600);
      await shot(t, '00b-practice-intro');
      await followGuide(t, { id: 'tut.move', ms: 15000 });
      await until(t, () => window.__GAME__.ctx.story.tutorial.step >= 2 && !window.__GAME__.ctx.story.tutorial.pending, null, { timeout: 10000 });
      const dum = await t.G(() => window.__GAME__.screen(0, -76, 0.6));
      if (dum) { await t.page.mouse.move(dum.x, dum.y); await t.wait(80); }
      for (let k = 0; k < 4 && !(await t.G(() => window.__GAME__.events.includes('reward'))); k++) { await t.tap('KeyJ', 3, 230); await t.wait(800); }
      const rw = await until(t, () => window.__GAME__.events.includes('reward'), null, { timeout: 15000 });
      const rt = (Date.now() - t0) / 1000;
      t.assert(!!rw && rt <= 60, `first reward ≤ 60 s after the tap (${rt.toFixed(1)} s)`);
      await t.wait(500);
      await shot(t, '00c-first-sticker');
    },
  },

  // ------------------------------------------------------------------ Morning Practice (desktop), then the bell → CS-01 in place
  {
    name: 'story:tutorial', order: 71, level: 'meadow', spawn: 'practice', timeout: 300000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.start': true }, 'meadow', 'practice');
      await playPractice(t);
      const st = await t.G(() => window.__GAME__.ctx.story.stage);
      t.assert(st === 'chart', `stage chart after practice (${st})`);
      const pos0 = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
      const c1 = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01', null, { timeout: 4000, every: 60 });
      t.assert(!!c1, 'CS-01 plays right after the bell, where she is (no walk)');
      const flags = await t.G(() => ['tut.jump.done', 'sticker.bonk', 'sticker.stand', 'sticker.parry'].map((k) => window.__GAME__.ctx.state.getFlag(k) ?? null));
      t.log('after practice', JSON.stringify({ pos0, flags }));
      t.assert(flags[1] && flags[2] && flags[3], 'the lesson stickers (bonk, stand, parry)');
      await skipScenes(t);
    },
  },

  // ------------------------------------------------------------------ CS-01 in place → CS-02 → the first fight → CS-01b
  {
    name: 'story:cs01', order: 72, level: 'meadow', spawn: 'practice', timeout: 300000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.start': true, 'prologue.practice': true }, 'meadow', 'practice');
      const c1t0 = Date.now();
      const ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01', null, { timeout: 6000, every: 60 });
      t.assert(!!ok, 'CS-01 plays at once (stage chart: no walk to the height chart)');
      t.assert(!!(await until(t, chipOn, null, { timeout: 500, every: 40 })), 'the Skip chip ≤ 0.5 s into CS-01');
      await atLine(t, 'cs01.3', '01a-cs01-chart');
      const c2 = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 20000 });
      t.assert(!!c2, 'CS-02 follows CS-01 at once');
      const len1 = (Date.now() - c1t0) / 1000;
      t.log(`CS-01 wall time ${len1.toFixed(1)} s (incl. a frozen shot)`);
      const t2 = await t.G(() => window.__GAME__.game.time);
      t.assert(!!(await until(t, chipOn, null, { timeout: 500, every: 40 })), 'the Skip chip ≤ 0.5 s into CS-02');
      await atLine(t, 'cs02.1', '04a-cs02-pearl');
      await atLine(t, 'cs02.6', '04c-cs02-sunbreak', 30000);
      const over = await until(t, () => window.__GAME__.ctx.story.playingId !== 'cs02', null, { timeout: 30000 });
      t.assert(!!over, 'CS-02 finished');
      const len2 = (await t.G(() => window.__GAME__.game.time)) - t2;
      t.log(`CS-02 game time ${len2.toFixed(1)} s`);
      t.assert(len2 <= 20 + 0.5, `CS-02 ≤ 20 s (${len2.toFixed(1)} s)`);
      await until(t, () => !window.__GAME__.ctx.story.isPlaying && window.__GAME__.mode === 'play' && !window.__GAME__.ctx.levels.loading, null, { timeout: 20000 });
      checkHandback(t, await t.G(afterScene), 'CS-02');
      const s2 = await t.G(() => ({ stage: window.__GAME__.ctx.story.stage, env: window.__GAME__.ctx.env.presetName }));
      t.assert(s2.stage === 'suit', `stage suit after the mist (${s2.stage})`);
      // the first fight: the yard locks at the end of CS-02 (rats spill in through the north gate)
      const ff = await until(t, () => window.__GAME__.ctx.state.getFlag('onboard.firstFight') === true, null, { timeout: 5000 });
      t.assert(!!ff, 'onboard.firstFight: the yard locks when CS-02 ends');
      await until(t, () => (window.__GAME__.ctx.levels.arena('yard')?.enemies ?? []).filter((e) => e.alive).length >= 3, null, { timeout: 6000 });
      const fight = await t.G(() => { const a = window.__GAME__.ctx.levels.arena('yard'); return { n: a.enemies.filter((e) => e.alive).length, idle: a.enemies.filter((e) => e.ai === false).length, tg: window.__GAME__.ctx.story.guideTarget()?.id }; });
      t.assert(fight.n === 3, `three rats in the yard (${fight.n})`);
      t.assert(fight.idle === 3, 'they wait for her first order');
      t.assert(fight.tg === 'onboard.fight', `the guide points at a rat (${fight.tg})`);
      await shot(t, '04d-first-fight');
      await t.page.evaluate(async () => {
        const g = window.__GAME__, a = g.ctx.levels.arena('yard'), t0 = performance.now();
        while (performance.now() - t0 < 15000 && a.enemies.some((e) => e.alive)) {
          for (const e of a.enemies) if (e.alive) { e.invulnT = 0; try { g.ctx.combat.applyHit(g.ctx.player, e, g.ctx.config.ATTACKS.slash3); } catch (err) { console.warn(err); } }
          await g.waitFrames(10);
        }
      });
      t.assert(!!(await until(t, () => window.__GAME__.ctx.levels.arena('yard')?.cleared === true, null, { timeout: 8000 })), 'the yard clears');
      t.assert((await t.G(target))?.id === 'prologue.suit', 'then the guide leads to the barn chest');
      // Suit Up: walk to the chest by the guide (the fence hop by the barn door), use it
      const tagText = () => { const e = document.querySelector('.ui-tag .tag-txt'); return e && getComputedStyle(e.closest('.ui-tag')).opacity > 0.1 ? e.textContent : null; };
      let tag = null;
      for (let k = 0; k < 20 && !tag; k++) {
        const tg = await t.G(target);
        if (!tg || tg.id !== 'prologue.suit') break;
        await orderTo(t, tg.x, tg.z); await t.wait(1500);   // fix round 2: the target is the stand spot in front of the chest
        tag = await t.G(tagText);
      }
      t.log(`at the chest: ${JSON.stringify(await t.G(() => window.__GAME__.ctx.player.pos.toArray().map((v) => +v.toFixed(2))))}`);
      t.assert(tag === 'Open', `the chest tag reads "Open" (${tag})`);
      await t.page.keyboard.press('KeyE');
      let s = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01b', null, { timeout: 6000, every: 60 });
      if (!s) { await t.G(() => { const g = window.__GAME__, L = g.ctx.levels; const c = (L.current?.interactables ?? []).find((i) => i?.play === 'cs01b' || i?.id === 'barn_chest'); if (c) L.interact?.(c.id); }); s = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01b', null, { timeout: 6000 }); }
      t.assert(!!s, 'CS-01b plays at the barn chest');
      const tb = await t.G(() => window.__GAME__.game.time);
      await atLine(t, 'cs01.10', '01d-cs01b-borrow', 8000);
      const done = await until(t, () => window.__GAME__.ctx.state.getFlag('prologue.done') === true && !window.__GAME__.ctx.story.isPlaying && !window.__GAME__.ctx.levels.loading, null, { timeout: 30000 });
      t.assert(!!done, 'flags prologue.armour / tutorial / done after Suit Up');
      const lenB = (await t.G(() => window.__GAME__.game.time)) - tb;
      t.log(`CS-01b game time ${lenB.toFixed(1)} s`);
      t.assert(lenB <= 6.5, `CS-01b ≤ 6 s (${lenB.toFixed(1)} s)`);
      await t.wait(500);
      checkHandback(t, await t.G(afterScene), 'CS-01b');
      const o = await t.G(() => window.__GAME__.ctx.player.model?.outfit ?? null);
      t.assert(!o || o === 'armour', `armour on (${o})`);
      t.assert(await t.G(() => window.__GAME__.ctx.state.getFlag('tut.jump.done') === true), 'the fence hop on the way taught Jump (tut.jump.done)');
      await shot(t, '01e-chapter1');
    },
  },

  // ------------------------------------------------------------------ Morning Practice on a phone (CONTROLS_SPEC §16.4)
  {
    name: 'story:tutorial-touch', order: 72.5, level: null, timeout: 900000,
    async run(t) {
      ensureDir(t);
      for (const [w, h, tag] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) await tutorialTouch(t, w, h, tag);
    },
  },

  // ------------------------------------------------------------------ G-01 Sir Tallbert: a bark (no letterbox, no input lock)
  {
    name: 'story:g01', order: 73, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, PROLOGUE_DONE, 'meadow', 'practice');
      await tp(t, 0, -64.5, 0);
      await t.click(0, -59.5);
      let ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'g01' || window.__GAME__.ctx.story.seen('g01'), null, { timeout: 8000 });
      if (!ok) { t.warn('walk did not reach the tallbert spot: teleporting into it'); await tp(t, 0, -61.5, 0); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'g01' || window.__GAME__.ctx.story.seen('g01'), null, { timeout: 5000 }); }
      t.assert(!!ok, 'G-01 plays at the north gate');
      const st = await t.G(() => ({ mode: window.__GAME__.mode, lb: !!window.__GAME__.ctx.story.cinema.letterboxOn, scripted: !!window.__GAME__.ctx.player.scripted, scene: window.__GAME__.ctx.story.sceneActive }));
      t.assert(st.mode === 'play' && !st.lb && !st.scripted && !st.scene, `G-01 locks nothing (${JSON.stringify(st)})`);
      const bark = await until(t, () => [...window.__GAME__.ctx.story.barks.bubbles.values()].some((b) => b.sprite.visible), null, { timeout: 3000 });
      if (bark) await shot(t, '03a-g01-hello');
      const p0 = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
      await t.hold('KeyS', 500);
      const p1 = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
      t.assert(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.3, 'she walks during the bark');
      const done = await until(t, () => window.__GAME__.ctx.story.seen('g01') && window.__GAME__.ctx.story.playingId !== 'g01', null, { timeout: 8000 });
      t.assert(!!done, 'G-01 ends by itself');
    },
  },

  // ------------------------------------------------------------------ CS-03 Milk Break (never cut) + the Pudding beat
  {
    name: 'story:cs03', order: 75, level: 'meadow', spawn: 'start', timeout: 200000,
    async run(t) {
      ensureDir(t);
      await fresh(t, PROLOGUE_DONE, 'meadow', 'vigil_2');
      await tp(t, 0.6, 14.4, 0);
      await t.G(() => { window.__GAME__.ctx.levels.interact('picnic'); });
      let ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs03', null, { timeout: 5000 });
      if (!ok) { t.warn('picnic interact did not start CS-03: playing it'); await t.G(() => { window.__GAME__.story.play('cs03'); }); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs03', null, { timeout: 5000 }); }
      t.assert(!!ok, 'CS-03 plays at the picnic bale');
      if (await until(t, lineIs, 'cs03.3', { timeout: 30000 })) { await t.wait(900); await shot(t, '05a-cs03-milk'); }
      const done = await until(t, ended, 'cs03', { timeout: 90000 });
      t.assert(!!done, 'CS-03 finished');
      await t.wait(400);
      checkHandback(t, await t.G(afterScene), 'CS-03');
      const st = await t.G(() => ({ flag: window.__GAME__.ctx.state.getFlag('meadow.pudding'), netted: !!window.__GAME__.ctx.companions.pudding?.netted }));
      t.assert(st.flag === 'netted', "meadow.pudding = 'netted'");
      await t.G(() => {
        const g = window.__GAME__;
        for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e);
        g.ctx.levels.arena('glade')?.clear?.();
        g.ctx.objectives.add('net_ropes', 3);
      });
      const beat = await until(t, () => window.__GAME__.ctx.story.line?.key === 'cs03b.1', null, { timeout: 10000 });
      t.assert(!!beat, 'Pudding: the follow beat');
      t.assert((await t.G(() => window.__GAME__.ctx.state.getFlag('meadow.pudding'))) === true, 'meadow.pudding = true');
    },
  },

  // ------------------------------------------------------------------ D-01 Mochi joins at his cart (WA16), ≤ 12 s
  {
    name: 'story:d01', order: 76, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { ...PROLOGUE_DONE, 'meadow.pudding': true }, 'meadow', 'start');
      await tp(t, -14, -39.2, Math.PI);
      await t.G(() => { const g = window.__GAME__; if (!g.ctx.actors.get('mochi')) g.ctx.companions.spawnNpc('mochi', [-14.4, -40.4], 0); });
      await t.frames(20);
      const d0 = await t.G(() => window.__GAME__.game.time);
      await t.G(() => { window.__GAME__.ctx.story.play('d01'); });
      t.assert(!!(await until(t, chipOn, null, { timeout: 500, every: 40 })) || !(await t.G(() => window.__GAME__.ctx.story.current?.canSkip)), 'the Skip chip shows when D-01 can be skipped');
      await atLine(t, 'd01.3', '06a-d01-almost-knights', 15000);
      const done = await until(t, ended, 'd01', { timeout: 25000 });
      t.assert(!!done, 'D-01 finished');
      const len = (await t.G(() => window.__GAME__.game.time)) - d0;
      t.log(`D-01 game time ${len.toFixed(1)} s`);
      t.assert(len <= 12.5, `D-01 ≤ 12 s (${len.toFixed(1)} s)`);
      const st = await t.G(() => ({ flag: window.__GAME__.ctx.state.getFlag('meadow.mochi'), reward: window.__GAME__.events.includes('reward') || window.__GAME__.events.includes('ui:toast') }));
      t.assert(st.flag === true, 'flag meadow.mochi');
      t.assert(st.reward, 'the friend card "Mochi joined the party!"');
      checkHandback(t, await t.G(afterScene), 'D-01');
    },
  },

  // ------------------------------------------------------------------ hold-to-skip (Esc) + the Skip chip + placeholders + barks
  {
    name: 'story:skip', order: 77, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.start': true, 'prologue.practice': true }, 'meadow', 'practice');
      await t.G(() => { window.__GAME__.story.play('cs01'); });
      const c0 = Date.now();
      t.assert(!!(await until(t, chipOn, null, { timeout: 500, every: 30 })), `the Skip chip ≤ 0.5 s after the scene starts (${Date.now() - c0} ms)`);
      const chipText = await t.G(() => document.querySelector('.cin-skip-chip')?.textContent ?? '');
      t.assert(/Skip/.test(chipText) && /Esc/.test(chipText), `the chip says Skip + hold Esc ("${chipText}")`);
      await until(t, sceneT, ['cs01', 1.0], { timeout: 8000 });
      await t.page.keyboard.down('Escape');
      await t.wait(500);
      await shot(t, '07a-skip-chip');
      const skipped = await until(t, ended, 'cs01', { timeout: 4000 });
      await t.page.keyboard.up('Escape');
      t.assert(!!skipped, 'holding Pause 1 s skips the prologue scene');
      await skipScenes(t);
      await t.wait(700);
      const st = await t.G(() => ({ chart: window.__GAME__.ctx.state.getFlag('prologue.chart'), last: window.__GAME__.lastEvent('cutscene:end'),
        fade: Math.max(0, ...[...document.querySelectorAll('.st-fade, .cin-fade')].map((e) => +getComputedStyle(e).opacity || 0)) }));
      t.assert(st.chart === true, 'the skipped scene still applied its end (prologue.chart)');
      t.assert(st.last?.skipped === true, 'cutscene:end {skipped: true}');
      t.assert(+st.fade < 0.05, `no fade left on screen (fade ${st.fade})`);
      checkHandback(t, await t.G(afterScene), 'skip');
      // the chip itself: a mouse hold on it skips like Esc
      await t.G(() => { window.__GAME__.story.play('cs01b'); });
      await until(t, chipOn, null, { timeout: 1000, every: 30 });
      const r = await t.G(() => { const b = document.querySelector('.cin-skip-chip').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
      await t.page.mouse.move(r[0], r[1]); await t.page.mouse.down();
      const sk2 = await until(t, () => window.__GAME__.ctx.story.playingId !== 'cs01b', null, { timeout: 3000 });
      await t.page.mouse.up();
      t.assert(!!sk2, 'holding the Skip chip (mouse) skips CS-01b');
      await skipScenes(t);
      await t.G(() => { window.__GAME__.story.play('cs13'); });
      const ph = await until(t, () => window.__GAME__.ctx.state.getFlag('keep.gate') === true && !window.__GAME__.ctx.story.isPlaying, null, { timeout: 5000 });
      t.assert(!!ph, 'placeholder CS-13 applies keep.gate');
      await t.G(() => { const g = window.__GAME__; g.ctx.state.shards = 0; g.ctx.bus.emit(g.E.PLAYER_STILL_STANDING, {}); });
      const bark = await until(t, () => [...window.__GAME__.ctx.story.barks.bubbles.values()].some((b) => b.sprite.visible), null, { timeout: 3000 });
      t.assert(!!bark, 'Still Standing bark bubble');
      if (bark) await shot(t, '07b-bark');
    },
  },
  ...M2_BLOCKS,
];
