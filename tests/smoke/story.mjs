// tests/smoke/story.mjs  (owner: story) — smoke blocks for src/story: the title loop, CS-01, Midnight Practice, G-01,
// CS-02 (never cut), CS-03 (never cut) + the Pudding follow beat, D-01, hold-to-skip and barks; M2: forest (D-02, CS-04,
// CS-05), town (D-03, CS-06, D-04 ×3, CS-07) and gate (yard, D-06, CS-08 never cut, G-02, CS-09, CS-10 → the grey hub). Screenshots go to
// tests/shots/story/. Run against your own dev server:
//   SMOKE_URL=http://localhost:5211/ SMOKE_ONLY=story node tests/smoke.mjs
// Scenes are watched at real speed and photographed at their beats (dialogue keys / scene time); the sim is frozen
// (time scale 0) while a screenshot is taken so slow GPU readbacks never skip a beat.
import fs from 'node:fs';
import path from 'node:path';

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
      t.assert(s4.env === 'forest_night', `env forest_night (${s4.env})`);
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
      t.assert(s3.chase, 'objective "Catch the Post Stealer"');
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
      if (await until(t, () => window.__GAME__.ctx.env.presetName === 'hub_grey' && window.__GAME__.ctx.story.playingId === 'cs10', null, { timeout: 20000 })) { await t.wait(3000); await shot(t, '12p-cs10-gloom'); }
      t.assert(!!(await sceneOver(t, 'cs10', 60000)), 'CS-10 finished');
      await t.wait(1000);
      const s10 = await t.G(() => { const g = window.__GAME__; return { done: g.ctx.state.getFlag('gate.done'), gd: g.ctx.state.getFlag('gate.done'), level: g.ctx.levels.current?.id, env: g.ctx.env.presetName, results: g.events.includes('level:results') }; });
      t.assert(s10.done === true, 'flag gate.done');
      t.assert(s10.level === 'town', `back in Pawsbury (${s10.level})`);
      t.assert(s10.env === 'hub_grey', `the hub is grey (${s10.env})`);
      checkHandback(t, await t.G(afterScene), 'CS-10');
      await shot(t, '12q-hub-grey');
      const q = await t.G(() => window.__GAME__.ctx.story.quest?.id);
      t.assert(q === 'hub-bog', `quest: north to the Bogmire (${q})`);
    },
  },
];

export default [
  // ------------------------------------------------------------------ CS-00 title loop, then New Game → CS-01
  {
    name: 'story:title', order: 70, level: null, reload: true, timeout: 120000,
    async run(t) {
      ensureDir(t);
      const s0 = await until(t, story, null, { timeout: 20000 });
      t.log('boot', JSON.stringify(s0));
      t.assert(s0?.id === 'cs00', `CS-00 plays at boot (playing ${s0?.id})`);
      await until(t, () => window.__GAME__.ctx.story.cinema.titleOn, null, { timeout: 8000 });
      await t.wait(1800);
      await shot(t, '00-title');
      await t.blankCheck('title');
      const pulse = await until(t, () => (window.__GAME__.ctx.story.current?.t ?? 0) > 4.2, null, { timeout: 8000 });
      t.assert(!!pulse, 'title keeps looping');
      await shot(t, '00b-title-pulse');
      // "Press any key": a real key press → (no ui main menu yet) a new game starts: fade, meadow practice, CS-01
      const hasMenu = await t.G(() => typeof window.__GAME__.ctx.ui?.openMainMenu === 'function');
      if (hasMenu) { t.log('ui has a main menu: starting the new game through story.newGame()'); await t.G(() => { window.__GAME__.ctx.story.newGame(); }); }
      else await t.page.keyboard.press('KeyX');
      const cs01 = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01', null, { timeout: 30000 });
      t.assert(!!cs01, 'new game → CS-01');
      const st = await t.G(() => ({ armour: window.__GAME__.ctx.state.getFlag('prologue.armour'), level: window.__GAME__.levelId }));
      t.assert(!st.armour && st.level === 'meadow', 'fresh progress in the meadow');
    },
  },

  // ------------------------------------------------------------------ CS-01 Knighting Eve (continues from story:title)
  {
    name: 'story:cs01', order: 71, level: null, timeout: 200000,
    async run(t) {
      ensureDir(t);
      if ((await t.G(() => window.__GAME__.ctx.story.playingId)) !== 'cs01') {
        await fresh(t, {}, 'meadow', 'practice');
        await t.G(() => { window.__GAME__.story.play('cs01'); });
      }
      if (await until(t, sceneT, ['cs01', 1.2], { timeout: 10000 })) await shot(t, '01a-cs01-caption');
      if (await until(t, sceneT, ['cs01', 7.5], { timeout: 15000 })) await shot(t, '01b-cs01-crane');
      if (await until(t, lineIs, 'cs01.1', { timeout: 20000 })) { await t.wait(500); await shot(t, '01c-cs01-measure'); }
      if (await until(t, lineIs, 'cs01.3', { timeout: 30000 })) { await t.wait(700); await shot(t, '01d-cs01-chart'); }
      if (await until(t, sceneT, ['cs01', 0], { timeout: 1000 })) { /* keep going */ }
      const sunT = await until(t, () => window.__GAME__.ctx.story.current?.spawned?.some((r) => r.id === 'sunpatch') ? window.__GAME__.ctx.story.current.t : 0, null, { timeout: 30000 });
      if (sunT && await until(t, sceneT, ['cs01', sunT + 3.6], { timeout: 15000 })) await shot(t, '01e-cs01-sunbeam');   // scene time: wall time drifts under load
      if (await until(t, lineIs, 'cs01.6', { timeout: 30000 })) { await t.wait(400); await shot(t, '01f-cs01-bow'); }
      if (await until(t, lineIs, 'cs01.9', { timeout: 30000 })) { await t.wait(1500); await shot(t, '01g-cs01-pearl'); }
      const chest = await until(t, () => (window.__GAME__.ctx.story.cinema.captionText ?? '').startsWith('M.'), null, { timeout: 30000 });
      if (chest) { await t.wait(600); await shot(t, '01h-cs01-chest'); }
      const helm = await until(t, () => !!window.__GAME__.ctx.player.model?._props?.has?.('helmet'), null, { timeout: 30000 });
      if (helm) { await t.wait(300); await shot(t, '01i-cs01-helmet'); }
      if (await until(t, lineIs, 'cs01.10', { timeout: 30000 })) { await t.wait(900); await shot(t, '01j-cs01-mirror'); }
      const done = await until(t, () => window.__GAME__.ctx.story.playingId !== 'cs01', null, { timeout: 40000 });
      t.assert(!!done, 'CS-01 finished');
      await t.wait(600);
      const a = await t.G(afterScene);
      checkHandback(t, a, 'CS-01');
      const st = await t.G(() => { const g = window.__GAME__; return { armour: g.ctx.state.getFlag('prologue.armour'), pos: g.ctx.player.pos.toArray(), outfit: g.ctx.player.model?.outfit }; });
      t.assert(st.armour === true, 'flag prologue.armour');
      t.assert(Math.hypot(st.pos[0] + 10, st.pos[2] + 90) < 1.5, `at spawn practice (${st.pos.map((v) => v.toFixed(1))})`);
      t.assert(!st.outfit || st.outfit === 'armour', `armour on (${st.outfit})`);
      await t.wait(400);
      await shot(t, '01k-prologue-card');
    },
  },

  // ------------------------------------------------------------------ Midnight Practice
  {
    name: 'story:tutorial', order: 72, level: 'meadow', spawn: 'practice', timeout: 200000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.armour': true }, 'meadow', 'practice');
      await t.G(() => { window.__GAME__.god(true); });
      const step = () => { const tu = window.__GAME__.ctx.story.tutorial; return { active: tu.active, step: tu.step, key: tu.textKey, pending: tu.pending }; };
      const s1 = await until(t, () => window.__GAME__.ctx.story.tutorial.active && window.__GAME__.ctx.story.tutorial.step, null, { timeout: 8000 });
      t.assert(s1 === 1, `tutorial starts at step 1 (${s1})`);
      await t.wait(900);
      await shot(t, '02a-tutorial-move');
      // 1 move + look
      await t.hold('KeyW', 1400);
      await t.hold('KeyD', 1200);                                  // the fence stops her ~2.5 m north: strafe along it
      const s2 = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 2, { timeout: 8000 });   // C6: moving is enough
      if (!s2) t.log('tutorial diag ' + JSON.stringify(await t.G(() => { const g = window.__GAME__, tu = g.ctx.story.tutorial, p = g.ctx.player; return { i: tu.log.i, moved: tu.log.moved, looked: tu.log.looked, active: tu.active, wait: tu.waitT, pend: tu.pending, pos: [p.pos.x, p.pos.z], mode: g.mode, playing: g.ctx.story.playingId, yaw: g.ctx.cam.yaw }; })));
      t.assert(!!s2, 'step 2 (jump) after moving');
      // 2 jump the inner fence (z −87): walk at it and jump
      await tp(t, -10, -88.6, 0);
      await t.page.keyboard.down('KeyW'); await t.wait(120); await t.page.keyboard.down('KeyF'); await t.wait(420); await t.page.keyboard.up('KeyF'); await t.wait(500); await t.page.keyboard.up('KeyW');   // a full (held) jump: a tap is cut short (CONTROLS_SPEC C1: F = jump)
      let s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 3, { timeout: 5000 });
      if (!s) { t.warn('fence jump missed: placing her north of it'); await tp(t, -10, -85, 0); s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 3, { timeout: 5000 }); }
      t.assert(!!s, 'step 3 (combo) after crossing the fence');
      await shot(t, '02b-tutorial-combo');
      // 3 Snip–Snap–Swoosh on a dummy (0, −76)
      await tp(t, 0, -77.4, 0);
      for (let k = 0; k < 3 && !(await t.G((n) => window.__GAME__.ctx.story.tutorial.step >= n, 4)); k++) { await t.tap('KeyJ', 3, 230); await t.wait(700); }
      s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 4, { timeout: 5000 });
      t.assert(!!s, 'step 4 (roll) after the combo');
      // 4 roll past the sack (8, −84)
      await tp(t, 6.2, -84, Math.PI / 2);
      await t.page.keyboard.press('ShiftLeft');
      s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 5, { timeout: 5000 });
      t.assert(!!s, 'step 5 (Stand) after the roll');
      // 5 block the Wobble Knight twice (0, −86, it faces +Z): stand in front, hold guard
      await tp(t, 0, -84.9, Math.PI);
      await t.page.keyboard.down('KeyL');
      s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 6, { timeout: 15000 });
      await t.page.keyboard.up('KeyL');
      t.assert(!!s, 'step 6 (parry) after two blocks');
      await shot(t, '02c-tutorial-parry');
      // 6 parry: raise the Stand on the white glint (poll the wobble knight's telegraph), retry a few swings
      // in-page timing (a round trip is too coarse for the 0.15 s window): raise the Stand ~0.07 s before the strike
      for (let k = 0; k < 4 && !(await t.G((n) => window.__GAME__.ctx.story.tutorial.step >= n, 7)); k++) {
        await t.page.evaluate(() => new Promise((resolve) => {
          const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'), inp = g.ctx.input, t0 = performance.now();
          const tick = () => {
            if (!wk || performance.now() - t0 > 6000) { resolve(false); return; }
            if (wk.phase === 'windup' && wk.phaseT >= wk.atk.windup - 0.07) {
              inp.setVirtual('guard', true);
              setTimeout(() => { inp.setVirtual('guard', false); resolve(true); }, 350);
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        }));
        await t.wait(700);
      }
      s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 7, { timeout: 2000 });
      if (!s) {
        t.warn('no timed parry landed: emitting one from the Wobble Knight');
        await t.G(() => { const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'); g.ctx.bus.emit(g.E.PLAYER_PARRY, { attacker: wk, gold: false, position: g.ctx.player.pos.clone() }); });
        s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 7, { timeout: 4000 });
      }
      t.assert(!!s, 'step 7 (Bright Slash) after the parry');
      // 7 Bright Slash the cracked boulder (−10, −84)
      await tp(t, -10, -85.6, 0);
      for (let k = 0; k < 3 && !(await t.G((n) => window.__GAME__.ctx.story.tutorial.step >= n, 8)); k++) { await t.hold('KeyJ', 900); await t.wait(1200); }
      s = await until(t, (n) => window.__GAME__.ctx.story.tutorial.step >= n, 8, { timeout: 4000 });
      t.assert(!!s, 'step 8 (Meow) after the boulder breaks');
      await shot(t, '02d-tutorial-meow');
      // 8 Meow at the cow (12, −72) → Pearl
      await tp(t, 9.5, -72.5, Math.PI / 2);
      await t.page.keyboard.press('KeyC');
      const pearl = await until(t, () => window.__GAME__.ctx.story.playingId === 'tutpearl', null, { timeout: 8000 });
      t.assert(!!pearl, 'Pearl pops out from behind the cow (tutpearl)');
      if (await until(t, lineIs, 'tut.pearl1', { timeout: 8000 })) { await t.wait(500); await shot(t, '02e-tutorial-pearl'); }
      const done = await until(t, () => window.__GAME__.ctx.state.getFlag('prologue.tutorial') === true && !window.__GAME__.ctx.story.isPlaying, null, { timeout: 20000 });
      t.assert(!!done, 'flag prologue.tutorial set when practice is over');
      t.assert((await t.events()).includes('story:flag'), 'story:flag emitted');
      await t.wait(800);
      await tp(t, 0, -63.5, 0);
      await t.wait(1200);
      await shot(t, '02f-tutorial-gate-open');
    },
  },

  // ------------------------------------------------------------------ G-01 Sir Tallbert
  {
    name: 'story:g01', order: 73, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.armour': true, 'prologue.tutorial': true }, 'meadow', 'practice');
      await tp(t, 0, -64.5, 0);
      await t.hold('KeyW', 1500);
      let ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'g01', null, { timeout: 5000 });
      if (!ok) { t.warn('walk did not reach the tallbert trigger: teleporting into it'); await tp(t, 0, -61, 0); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'g01', null, { timeout: 5000 }); }
      if (!ok) t.log('g01 diag ' + JSON.stringify(await t.G(() => { const g = window.__GAME__, p = g.ctx.player, L = g.ctx.levels.current; return { pos: [p.pos.x, p.pos.z], mode: g.mode, playing: g.ctx.story.playingId, q: g.ctx.story.queue.length, flags: g.ctx.state.flags, trig: L.triggers.map((x) => [x.id, x.fired, x.inside]), loading: g.ctx.levels.loading, ev: g.events.slice(-25) }; })));
      t.assert(!!ok, 'G-01 plays at the north gate');
      if (await until(t, sceneT, ['g01', 1.4], { timeout: 6000 })) {
        await shot(t, '03a-g01-meme');
        t.log('g01 meme lens', JSON.stringify(await t.G(() => { const g = window.__GAME__, c = g.ctx.camera ?? g.ctx.cam?.camera; return { cam: c?.position?.toArray().map((v) => +v.toFixed(2)), her: g.ctx.player.pos.toArray().map((v) => +v.toFixed(2)) }; })));
      }
      if (await until(t, sceneT, ['g01', 7.6], { timeout: 12000 })) await shot(t, '03b-g01-pullback');
      if (await until(t, lineIs, 'g01.1', { timeout: 8000 })) { await t.wait(500); await shot(t, '03c-g01-hello'); }
      const done = await until(t, ended, 'g01', { timeout: 15000 });
      t.assert(!!done, 'G-01 ends by itself');
      checkHandback(t, await t.G(afterScene), 'G-01');
      // any input after 1.0 s skips it (replay it to check)
      await t.G(() => { window.__GAME__.story.play('g01'); });
      await until(t, sceneT, ['g01', 1.3], { timeout: 5000 });
      await t.page.keyboard.press('KeyJ');
      const skipped = await until(t, ended, 'g01', { timeout: 4000 });
      t.assert(!!skipped, 'any input after 1.0 s skips G-01');
    },
  },

  // ------------------------------------------------------------------ CS-02 The Laughing Fog (never cut)
  {
    name: 'story:cs02', order: 74, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.armour': true, 'prologue.tutorial': true }, 'meadow', 'practice');
      await tp(t, -4.5, -55, -0.4);
      await t.hold('KeyW', 1200);
      let ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 4000 });
      if (!ok) { await tp(t, -6, -52, -0.4); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 5000 }); }
      t.assert(!!ok, 'CS-02 plays on the lane');
      const beats = [
        ['04a-cs02-orbit', sceneT, ['cs02', 3.0]],
        ['04b-cs02-bell', sceneT, ['cs02', 8.6]],
        ['04c-cs02-bell-out', sceneT, ['cs02', 11.0]],
        ['04d-cs02-cackle', sceneT, ['cs02', 15.0]],
        ['04e-cs02-horde', 'line', 'cs02.1'],
        ['04f-cs02-trip', sceneT, ['cs02', 0]],
      ];
      for (const [name, fn, arg] of beats.slice(0, 5)) {
        const ok2 = fn === 'line' ? await freezeOnLine(t, arg) : await until(t, fn, arg, { timeout: 30000 });
        if (ok2) await shot(t, name); else t.warn(`missed beat ${name}`);
      }
      const plantT = await until(t, () => { const p = window.__GAME__.ctx.player; return p.model?.scriptPose === 'faint' ? 1 : 0; }, null, { timeout: 15000 });
      if (plantT) { await t.wait(250); await shot(t, '04f-cs02-trip'); }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'MEME_LOOP' && window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 25000 })) { await t.wait(1600); await shot(t, '04g-cs02-meme'); }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'REVERSE_HORDE', null, { timeout: 15000 })) { await t.wait(3800); await shot(t, '04h-cs02-reverse-horde'); }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'TWO_SHOT_LOW' && window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 15000 })) { await t.wait(1300); await shot(t, '04h2-cs02-two-shot'); }
      if (await until(t, lineIs, 'cs02.2', { timeout: 20000 })) { await t.wait(700); await shot(t, '04i-cs02-laugh'); }
      if (await until(t, lineIs, 'cs02.4', { timeout: 30000 })) { await t.wait(300); await shot(t, '04j-cs02-mine'); }
      if (await until(t, lineIs, 'cs02.5', { timeout: 15000 })) { await t.wait(600); await shot(t, '04k-cs02-crane'); }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'ECU_EYES', null, { timeout: 20000 })) { await t.wait(1800); await shot(t, '04l-cs02-eyes'); }
      if (await until(t, lineIs, 'cs02.6', { timeout: 30000 })) { await t.wait(600); await shot(t, '04m-cs02-okay'); }
      if (await until(t, () => window.__GAME__.ctx.story.cinema.titleOn && window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 20000 })) { await t.wait(1500); await shot(t, '04n-cs02-title'); }
      const done = await until(t, () => !window.__GAME__.ctx.story.isPlaying && !window.__GAME__.ctx.levels.loading && window.__GAME__.mode === 'play', null, { timeout: 60000 });
      t.assert(!!done, 'CS-02 finished (meadow reloaded at start)');
      await t.wait(500);
      checkHandback(t, await t.G(afterScene), 'CS-02');
      const st = await t.G(() => { const g = window.__GAME__; return { done: g.ctx.state.getFlag('prologue.done'), env: g.ctx.env.presetName, pos: g.ctx.player.pos.toArray(), start: (() => { const sp = g.ctx.levels.current?.spawns?.start; return sp ? [sp.pos?.x ?? sp[0], sp.pos?.z ?? sp[1]] : [-4, -58]; })(), cast: g.ctx.enemies.list.filter((e) => e.tags?.has('cutscene') || e.spawnOpts?.scripted).length }; });
      t.assert(st.done === true, 'flag prologue.done');
      t.assert(st.env === 'meadow_day', `env meadow_day (${st.env})`);
      t.assert(Math.hypot(st.pos[0] - st.start[0], st.pos[2] - st.start[1]) < 2, `at spawn start (${st.pos.map((v) => v.toFixed(1))} vs ${st.start})`);
      t.assert(st.cast === 0, `CS-02 cast despawned (${st.cast} left)`);
      await shot(t, '04o-chapter1-card');
    },
  },

  // ------------------------------------------------------------------ CS-03 Milk Break (never cut) + the Pudding beat
  {
    name: 'story:cs03', order: 75, level: 'meadow', spawn: 'start', timeout: 200000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true }, 'meadow', 'vigil_2');
      await tp(t, 0.6, 14.4, 0);
      await t.G(() => { window.__GAME__.ctx.levels.interact('picnic'); });
      let ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs03', null, { timeout: 5000 });
      if (!ok) { t.warn('picnic interact did not start CS-03: playing it'); await t.G(() => { window.__GAME__.story.play('cs03'); }); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs03', null, { timeout: 5000 }); }
      t.assert(!!ok, 'CS-03 plays at the picnic bale');
      if (await until(t, lineIs, 'cs03.1', { timeout: 10000 })) { await t.wait(1000); await shot(t, '05a-cs03-selfie'); }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'WHIP_FALL', null, { timeout: 15000 })) {
        await until(t, () => window.__GAME__.ctx.story.current?.spawned?.find((r) => r.id === 'pudding')?.obj?.object3d?.visible, null, { timeout: 6000 });
        await t.wait(900); await shot(t, '05b-cs03-roar');
      }
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'HERO_LOW', null, { timeout: 15000 })) { await t.wait(1800); await shot(t, '05c-cs03-hero'); }
      if (await until(t, lineIs, 'cs03.3', { timeout: 20000 })) { await t.wait(900); await shot(t, '05d-cs03-milk'); }
      if (await until(t, lineIs, 'cs03.8', { timeout: 40000 })) { await t.wait(1100); await shot(t, '05e-cs03-sip'); }
      if (await until(t, lineIs, 'cs03.12', { timeout: 30000 })) { await t.wait(900); await shot(t, '05f-cs03-sorry'); }
      const done = await until(t, ended, 'cs03', { timeout: 30000 });
      t.assert(!!done, 'CS-03 finished');
      await t.wait(400);
      checkHandback(t, await t.G(afterScene), 'CS-03');
      const st = await t.G(() => {
        const g = window.__GAME__, a = g.ctx.levels.arena('glade'), ob = g.ctx.objectives.get?.('net_ropes');
        return { flag: g.ctx.state.getFlag('meadow.pudding'), locked: !!a?.locked, ob: ob ? { value: ob.value, max: ob.max } : null, pud: !!g.ctx.companions.pudding, netted: !!g.ctx.companions.pudding?.netted };
      });
      t.log('after CS-03', JSON.stringify(st));
      t.assert(st.flag === 'netted', "meadow.pudding = 'netted'");
      t.assert(st.locked, 'glade arena locked');
      t.assert(st.ob?.max === 3, 'objective net_ropes 0/3');
      t.assert(st.pud && st.netted, 'Pudding stays, netted');
      await shot(t, '05g-cs03-net-fight');
      // ropes cut + arena clear → the follow beat (ambient line, Pudding flies off)
      await t.G(() => {
        const g = window.__GAME__;
        for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e);
        g.ctx.levels.arena('glade')?.clear?.();
        g.ctx.objectives.add('net_ropes', 3);
      });
      const beat = await until(t, () => window.__GAME__.ctx.story.line?.key === 'cs03b.1', null, { timeout: 10000 });
      t.assert(!!beat, 'Pudding: "(I\'ll... follow. From a distance.)"');
      if (beat) await shot(t, '05h-cs03b-follow');
      const free = await t.G(() => window.__GAME__.ctx.state.getFlag('meadow.pudding'));
      t.assert(free === true, 'meadow.pudding = true');
      t.assert((await t.G(() => window.__GAME__.mode)) === 'play', 'the follow beat keeps gameplay running');
    },
  },

  // ------------------------------------------------------------------ D-01 Mochi joins
  {
    name: 'story:d01', order: 76, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true, 'meadow.pudding': true }, 'meadow', 'vigil_3');
      await tp(t, 28, 66, 0);
      await t.G(() => { const g = window.__GAME__; g.ctx.companions.spawnNpc('mochi', [28.6, 67.4], Math.PI); });
      await t.frames(20);
      await t.G(() => { window.__GAME__.ctx.story.play('d01'); });
      if (await until(t, lineIs, 'd01.1', { timeout: 8000 })) { await t.wait(1200); await shot(t, '06a-d01-mochi'); }
      if (await until(t, lineIs, 'd01.3', { timeout: 15000 })) { await t.wait(700); await shot(t, '06b-d01-team'); }
      const done = await until(t, ended, 'd01', { timeout: 20000 });
      t.assert(!!done, 'D-01 finished');
      const st = await t.G(() => ({ flag: window.__GAME__.ctx.state.getFlag('meadow.mochi'), toast: window.__GAME__.events.includes('ui:toast') }));
      t.assert(st.flag === true, 'flag meadow.mochi');
      t.assert(st.toast, '"Mochi joined!" toast');
      checkHandback(t, await t.G(afterScene), 'D-01');
    },
  },

  // ------------------------------------------------------------------ hold-to-skip + placeholders + barks
  {
    name: 'story:skip', order: 77, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, {}, 'meadow', 'practice');
      await t.G(() => { window.__GAME__.story.play('cs01'); });
      await until(t, sceneT, ['cs01', 2.0], { timeout: 8000 });
      await t.page.keyboard.down('Escape');
      await t.wait(500);
      await shot(t, '07a-skip-ring');
      const skipped = await until(t, ended, 'cs01', { timeout: 4000 });
      await t.page.keyboard.up('Escape');
      t.assert(!!skipped, 'holding Pause 1 s skips the prologue scene');
      await t.wait(700);
      const st = await t.G(() => ({ armour: window.__GAME__.ctx.state.getFlag('prologue.armour'), last: window.__GAME__.lastEvent('cutscene:end'),
        fade: Math.max(0, ...[...document.querySelectorAll('.st-fade, .cin-fade')].map((e) => +getComputedStyle(e).opacity || 0)) }));
      t.assert(st.armour === true, 'the skipped scene still applied its end (prologue.armour)');
      t.assert(st.last?.skipped === true, 'cutscene:end {skipped: true}');
      t.assert(+st.fade < 0.05, `no black left on screen (fade ${st.fade})`);
      checkHandback(t, await t.G(afterScene), 'skip');
      // a later-milestone scene runs as a placeholder that applies its end state
      await t.G(() => { window.__GAME__.story.play('cs13'); });
      const ph = await until(t, () => window.__GAME__.ctx.state.getFlag('keep.gate') === true && !window.__GAME__.ctx.story.isPlaying, null, { timeout: 5000 });
      t.assert(!!ph, 'placeholder CS-13 applies keep.gate');
      // barks: Still Standing always speaks; a bubble shows over her
      await t.G(() => { const g = window.__GAME__; g.ctx.state.shards = 0; g.ctx.bus.emit(g.E.PLAYER_STILL_STANDING, {}); });
      const bark = await until(t, () => [...window.__GAME__.ctx.story.barks.bubbles.values()].some((b) => b.sprite.visible), null, { timeout: 3000 });
      t.assert(!!bark, 'Still Standing bark bubble');
      if (bark) await shot(t, '07b-bark');
    },
  },
  ...M2_BLOCKS,
];
