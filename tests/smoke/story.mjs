// tests/smoke/story.mjs  (owner: story) — smoke blocks for src/story. Phase W prologue (WA §6–§8): the title → new
// adventure hand-off (no fade, no reload, control ≤ 5 s, first sticker ≤ 60 s), Morning Practice (7 lessons, desktop and
// touch), the chart → The Giggling Mist → Suit Up chain, G-01, CS-03, D-01 at Mochi's cart, hold-to-skip and barks;
// M2: forest (D-02, CS-04, CS-05), town (D-03, CS-06, D-04 ×3, CS-07) and gate (yard, D-06, CS-08, G-02, CS-09, CS-10).
// Screenshots go to tests/shots/story/. Run against your own dev server:
//   SMOKE_URL=http://localhost:5321/ SMOKE_ONLY=story node tests/smoke.mjs
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
const tutStep = () => { const tu = window.__GAME__.ctx.story.tutorial; return { step: tu.step, active: tu.active, id: tu.log.step?.id ?? null, pending: tu.pending, done: !!window.__GAME__.ctx.state.getFlag('prologue.practice') }; };
const atStep = (t, n, timeout = 8000) => until(t, (k) => { const tu = window.__GAME__.ctx.story.tutorial; return tu.step >= k && !tu.pending && !window.__GAME__.ctx.story.isPlaying; }, n, { timeout });
const nearestDummy = () => { const g = window.__GAME__, p = g.ctx.player.pos; return g.ctx.actors.list.filter((x) => x.kind === 'dummy').sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0]?.pos.toArray() ?? [0, 0, -76]; };

/** Skip whatever scene runs (the runner applies its end) until none is left. */
async function skipScenes(t, max = 6) {
  for (let k = 0; k < max && await t.G(() => window.__GAME__.ctx.story.isPlaying); k++) { await t.G(() => window.__GAME__.story.skip()); await t.wait(500); }
}

/** Play the 7 WA §7.1 lessons with the desktop keyboard (+ a real right-click order for the move lesson). */
async function playPractice(t, { shots = true } = {}) {
  const s1 = await until(t, () => window.__GAME__.ctx.story.tutorial.active, null, { timeout: 10000 });
  t.assert(!!s1, 'Morning Practice is active');
  // 1 move: a real right-click order toward the middle dummy
  await atStep(t, 1, 6000);
  await t.wait(2600);                                                 // Pearl's "Knighting Day…" intro bubble
  if (shots) await shot(t, '02a-practice-move');
  const m1 = await t.G(() => window.__GAME__.screen(0, -77.6));
  await t.page.mouse.move(m1.x, m1.y); await t.wait(80);
  await t.page.mouse.click(m1.x, m1.y, { button: 'right' });
  let s = await atStep(t, 2, 15000);
  if (!s) { t.warn('the click walk did not finish the move lesson: teleport'); await tp(t, 0, -77.6, 0); s = await atStep(t, 2, 8000); }
  t.assert(!!s, 'lesson 2 (bonk) after moving');
  // 2 bonk: Snip–Snap–Swoosh on the dummy → `tutbow` (Pearl ties the Pink Bow)
  await tp(t, 0, -77.4, 0);
  const dum = await t.G(() => window.__GAME__.screen(0, -76, 0.6));
  if (dum) { await t.page.mouse.move(dum.x, dum.y); await t.wait(100); }
  for (let k = 0; k < 4 && !(await t.G(() => window.__GAME__.ctx.story.tutorial.step >= 3 || window.__GAME__.ctx.story.playingId === 'tutbow')); k++) { await t.tap('KeyJ', 3, 230); await t.wait(800); }
  const bow = await until(t, () => window.__GAME__.ctx.story.playingId === 'tutbow' || window.__GAME__.ctx.story.seen('tutbow'), null, { timeout: 8000 });
  t.assert(!!bow, 'the bonk lesson plays tutbow');
  if (shots && await until(t, lineIs, 'tutbow.1', { timeout: 8000 })) { await t.wait(700); await shot(t, '02b-practice-bow'); }
  s = await atStep(t, 3, 30000);
  t.assert(!!s, 'lesson 3 (jump) after the bow');
  // 3 jump the inner fence (z −87)
  await tp(t, -10, -88.6, 0);
  await t.page.keyboard.down('KeyW'); await t.wait(120); await t.page.keyboard.down('KeyF'); await t.wait(420); await t.page.keyboard.up('KeyF'); await t.wait(500); await t.page.keyboard.up('KeyW');
  s = await atStep(t, 4, 5000);
  if (!s) { t.warn('fence jump missed: placing her across it'); await tp(t, -10, -85, 0); s = await atStep(t, 4, 5000); }
  t.assert(!!s, 'lesson 4 (roll) after the fence');
  t.assert(await t.G(() => window.__GAME__.ctx.state.getFlag('tut.jump.done') === true), 'flag tut.jump.done');
  // 4 roll past Sir Sacky (8, −84)
  await tp(t, 6.2, -84, Math.PI / 2);
  await t.page.keyboard.press('ShiftLeft');
  s = await atStep(t, 5, 5000);
  if (!s) { await tp(t, 7.0, -84, Math.PI / 2); await t.page.keyboard.press('ShiftLeft'); s = await atStep(t, 5, 5000); }
  t.assert(!!s, 'lesson 5 (stand) after the roll');
  // 5 block Sir Wobble once (Space = the Stand)
  await tp(t, 0, -84.9, Math.PI);
  await t.page.keyboard.down('Space');
  s = await atStep(t, 6, 15000);
  await t.page.keyboard.up('Space');
  t.assert(!!s, 'lesson 6 (parry) after a block');
  if (shots) await shot(t, '02c-practice-parry');
  // 6 parry: raise the Stand just before the strike (in-page timing); fall back to an emitted parry
  for (let k = 0; k < 4 && !(await t.G(() => window.__GAME__.ctx.story.tutorial.step >= 7)); k++) {
    await t.page.evaluate(() => new Promise((resolve) => {
      const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'), inp = g.ctx.input, t0 = performance.now();
      const tick = () => {
        if (!wk || performance.now() - t0 > 8000) { resolve(false); return; }
        if (wk.phase === 'windup' && wk.phaseT >= wk.atk.windup - 0.07) { inp.setVirtual('guard', true); setTimeout(() => { inp.setVirtual('guard', false); resolve(true); }, 350); return; }
        requestAnimationFrame(tick);
      };
      tick();
    }));
    await t.wait(900);
  }
  s = await atStep(t, 7, 3000);
  if (!s) {
    t.warn('no timed parry landed: emitting one from Sir Wobble');
    await t.G(() => { const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'); g.ctx.bus.emit(g.E.PLAYER_PARRY, { attacker: wk, gold: false, position: g.ctx.player.pos.clone() }); });
    s = await atStep(t, 7, 5000);
  }
  t.assert(!!s, 'lesson 7 (meow) after the parry');
  // 7 hide and seek: Meow next to the Very Suspicious Cow (12, −72) → `tutpearl`
  await t.wait(1600);                                                 // the cream wipe while Pearl hides
  await tp(t, 9.5, -72.5, Math.PI / 2);
  await t.wait(400);
  if (shots) await shot(t, '02d-practice-cow');
  await t.page.keyboard.press('KeyC');
  let pearl = await until(t, () => window.__GAME__.ctx.story.playingId === 'tutpearl' || window.__GAME__.ctx.state.getFlag('prologue.practice'), null, { timeout: 6000 });
  if (!pearl) { await t.wait(1200); await t.page.keyboard.press('KeyC'); pearl = await until(t, () => window.__GAME__.ctx.story.playingId === 'tutpearl' || window.__GAME__.ctx.state.getFlag('prologue.practice'), null, { timeout: 6000 }); }
  t.assert(!!pearl, 'Meow at the cow → Pearl pops out (tutpearl)');
  const done = await until(t, () => window.__GAME__.ctx.state.getFlag('prologue.practice') === true && !window.__GAME__.ctx.story.isPlaying, null, { timeout: 25000 });
  t.assert(!!done, 'flag prologue.practice when practice is over');
}

/**
 * Morning Practice through the touch path, on its own hasTouch / isMobile page (`w`×`h`): the hint copy is the touch
 * variant, the ⚔ / Jump / Tumble / 🛡 / Meow buttons drive the lessons; Pearl's guide bubble is the prompt.
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
  const tpM = (x, z, yaw = 0) => G(([px, pz, f]) => { const g = window.__GAME__, p = g.ctx.player; p.teleport({ pos: new g.THREE.Vector3(px, g.ctx.physics.heightAt(px, pz), pz), facing: f }); return true; }, [x, z, yaw]);
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
    await stepAt(1, 6000); await pg.waitForTimeout(2800);
    await mshot(`02t-${tag}-1-move`);
    // 1 move: a ground tap next to the middle dummy
    const tg = await G(() => window.__GAME__.screen(0, -77.6));
    await pg.touchscreen.tap(Math.round(tg.x), Math.round(tg.y));
    let s = await stepAt(2, 15000);
    if (!s) { await tpM(0, -77.6, 0); s = await stepAt(2, 6000); }
    t.assert(!!s, `${tag}: lesson 2 (bonk) after a ground tap`);
    // 2 bonk: ⚔ ×3 next to the dummy
    await tpM(0, -77.4, 0); await pg.waitForTimeout(800);
    for (let k = 0; k < 4 && !(await G(() => window.__GAME__.ctx.story.tutorial.step >= 3 || window.__GAME__.ctx.story.isPlaying)); k++) {
      for (let i = 0; i < 3; i++) { await tapBtn('attack'); await pg.waitForTimeout(240); }
      await pg.waitForTimeout(800);
    }
    for (let k = 0; k < 40 && await G(() => window.__GAME__.ctx.story.isPlaying); k++) { await pg.touchscreen.tap(Math.round(w * 0.5), Math.round(h * 0.82)); await pg.waitForTimeout(500); }
    s = await stepAt(3, 20000);
    if (!s) t.log(`${tag}: tutorial after ⚔ ×3: ${JSON.stringify(await G(() => { const g = window.__GAME__, c = g.ctx, tu = c.story.tutorial; return { step: tu.step, pending: tu.pending, id: tu.cur?.id ?? tu.steps?.[tu.step]?.id, playing: c.story.playingId, mode: g.mode, hits: tu.hits ?? tu.count, line: c.story.line?.key, dev: c.input.device, ev: [...g.events].filter((e) => /swing|hit|tut|cutscene|dialog/.test(e)).slice(-12) }; }))}`);
    t.assert(!!s, `${tag}: lesson 3 (jump) after ⚔ ×3 and the bow`);
    // 3 jump: run at the fence with the stick, hold Jump
    await tpM(-10, -88.9, 0); await pg.waitForTimeout(600);
    t.assert(!!(await btn('jump')), `${tag}: the Jump button shows`);
    await G(() => window.__GAME__.ctx.input.setVirtualMove(0, 1));
    await pg.waitForTimeout(300); await press('jump', 450); await pg.waitForTimeout(900);
    await G(() => window.__GAME__.ctx.input.setVirtualMove(0, 0));
    s = await stepAt(4, 3000);
    if (!s) { t.warn(`${tag}: fence jump missed: placing her across it`); await tpM(-10, -85, 0); s = await stepAt(4, 5000); }
    t.assert(!!s, `${tag}: lesson 4 (roll) after the fence`);
    // 4 roll by the sack: the Tumble button
    await tpM(6.2, -84, Math.PI / 2); await pg.waitForTimeout(500);
    await tapBtn('dodge');
    s = await stepAt(5, 5000);
    t.assert(!!s, `${tag}: lesson 5 (stand) after the tumble`);
    // 5 stand: hold 🛡 in front of Sir Wobble
    await tpM(0, -84.9, Math.PI); await pg.waitForTimeout(400);
    await press('guard', 4000);
    s = await stepAt(6, 12000);
    t.assert(!!s, `${tag}: lesson 6 (parry) after a block`);
    await mshot(`02t-${tag}-6-parry`);
    // 6 parry: emitted (the timing path is covered on desktop)
    await G(() => { const g = window.__GAME__, wk = g.ctx.actors.get('wobble_knight'); g.ctx.bus.emit(g.E.PLAYER_PARRY, { attacker: wk, gold: false, position: g.ctx.player.pos.clone() }); });
    s = await stepAt(7, 6000);
    t.assert(!!s, `${tag}: lesson 7 (meow)`);
    // 7 meow: the cat-face button by the cow
    await pg.waitForTimeout(1600);
    await tpM(9.5, -72.5, Math.PI / 2); await pg.waitForTimeout(600);
    // the Meow lesson (and its button reveal, WA §7.5) starts after Pearl's parry praise: wait for the button
    await untilM(() => { const b = document.querySelector('.tbtn[data-action="meow"]'); return !!b && !b.classList.contains('is-veiled'); }, null, 8000);
    const mb = await G(() => { const b = document.querySelector('.tbtn[data-action="meow"]'); const r = b?.getBoundingClientRect(); const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null; return { cls: b?.className, r: r && [Math.round(r.x), Math.round(r.y), Math.round(r.width)], hit: hit?.className ?? hit?.tagName ?? null, hitId: hit?.id ?? null }; });
    t.log(`${tag}: meow button ${JSON.stringify(mb)}`);
    t.assert(await tapBtn('meow'), `${tag}: the Meow button shows`);
    const popped = await untilM(() => window.__GAME__.ctx.story.playingId === 'tutpearl' || window.__GAME__.ctx.state.getFlag('prologue.practice'), null, 8000);
    if (!popped) t.log(`${tag}: after the meow: ${JSON.stringify(await G(() => { const g = window.__GAME__, c = g.ctx, tu = c.story.tutorial, cow = c.actors.get?.('cow_practice') ?? c.levels.current.critters?.[0]; return { step: tu.step, i: tu.log?.i, pending: tu.pending, active: tu.active, playing: c.story.playingId, mode: g.mode, pos: c.player.pos.toArray().map((v) => +v.toFixed(1)), cow: cow?.pos?.toArray?.().map((v) => +v.toFixed(1)), ev: [...g.events].filter((e) => /meow|tut|story|cutscene|prompt/.test(e)).slice(-10) }; }))}`);
    t.assert(!!popped, `${tag}: Pearl pops out`);
    for (let k = 0; k < 30 && await G(() => window.__GAME__.ctx.story.isPlaying); k++) { await pg.touchscreen.tap(Math.round(w * 0.5), Math.round(h * 0.82)); await pg.waitForTimeout(500); }
    t.assert(!!(await untilM(() => window.__GAME__.ctx.state.getFlag('prologue.practice') === true, null, 20000)), `${tag}: practice over`);
    await pg.waitForTimeout(1200);
    await mshot(`02t-${tag}-7-done`);
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
      const st = await t.G(() => { const g = window.__GAME__; return { start: g.ctx.state.getFlag('prologue.start'), level: g.ctx.levels.current?.id, outfit: g.ctx.player.model?.outfit ?? null, fade: Math.max(0, ...[...document.querySelectorAll('.st-fade, .cin-fade')].map((e) => +getComputedStyle(e).opacity || 0)) }; });
      t.assert(st.start === true && st.level === 'meadow', 'prologue.start on the meadow');
      t.assert(st.fade < 0.05, `no fade over the hand-off (${st.fade})`);
      // first reward ≤ 60 s: the move lesson (walk to the dummy)
      await until(t, () => window.__GAME__.ctx.story.tutorial.active, null, { timeout: 8000 });
      await t.wait(2600);
      await shot(t, '00b-practice-intro');
      const m1 = await t.G(() => window.__GAME__.screen(0, -77.6));
      await t.page.mouse.move(m1.x, m1.y); await t.wait(60);
      await t.page.mouse.click(m1.x, m1.y, { button: 'right' });
      await until(t, () => window.__GAME__.ctx.story.tutorial.step >= 2 && !window.__GAME__.ctx.story.tutorial.pending, null, { timeout: 15000 });
      await tp(t, 0, -77.4, 0);                                       // first sticker: "First Bonk!" (ON P2)
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

  // ------------------------------------------------------------------ Morning Practice (desktop), then the bell → chart
  {
    name: 'story:tutorial', order: 71, level: 'meadow', spawn: 'practice', timeout: 300000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.start': true }, 'meadow', 'practice');
      await playPractice(t);
      await t.wait(1500);
      await shot(t, '02e-practice-bell');
      const st = await t.G(() => window.__GAME__.ctx.story.stage);
      t.assert(st === 'chart', `stage chart after practice (${st})`);
    },
  },

  // ------------------------------------------------------------------ CS-01 chart → CS-02 Giggling Mist → CS-01b Suit Up
  {
    name: 'story:cs01', order: 72, level: 'meadow', spawn: 'practice', timeout: 300000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.start': true, 'prologue.practice': true, 'tut.jump.done': true }, 'meadow', 'practice');
      await tp(t, -6, -69.5, Math.PI);
      let ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01', null, { timeout: 6000 });
      if (!ok) { await tp(t, -6, -67.8, Math.PI); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01', null, { timeout: 6000 }); }
      t.assert(!!ok, 'CS-01 plays at the height chart');
      await atLine(t, 'cs01.3', '01a-cs01-chart');
      await atLine(t, 'cs01.8', '01b-cs01-sunbeam');
      const c2 = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 40000 });
      t.assert(!!c2, 'CS-02 follows the chart at once');
      const t2 = Date.now();
      await atLine(t, 'cs02.1', '04a-cs02-horde');
      if (await until(t, () => window.__GAME__.ctx.cam.currentShot?.preset === 'MEME_LOOP' && window.__GAME__.ctx.story.playingId === 'cs02', null, { timeout: 25000 })) { await t.wait(1600); await shot(t, '04b-cs02-meme'); }
      await atLine(t, 'cs02.6', '04c-cs02-sunbreak', 60000);
      const sceneLen = await until(t, () => { const s = window.__GAME__.ctx.story; return s.playingId !== 'cs02' ? 1 : 0; }, null, { timeout: 60000 });
      t.assert(!!sceneLen, 'CS-02 finished');
      t.log(`CS-02 wall time ${((Date.now() - t2) / 1000).toFixed(1)} s (incl. frozen shots)`);
      await until(t, () => !window.__GAME__.ctx.story.isPlaying && window.__GAME__.mode === 'play' && !window.__GAME__.ctx.levels.loading, null, { timeout: 20000 });
      checkHandback(t, await t.G(afterScene), 'CS-02');
      const s2 = await t.G(() => ({ stage: window.__GAME__.ctx.story.stage, env: window.__GAME__.ctx.env.presetName }));
      t.assert(s2.stage === 'suit', `stage suit after the mist (${s2.stage})`);
      t.log('env after CS-02', s2.env);
      await shot(t, '04d-cs02-evening');
      // Suit Up: walk into the barn chest's sunbeam (world's interactable, else the director's proximity)
      await tp(t, -13.0, -87.6, Math.PI);
      await t.G(() => { const g = window.__GAME__, L = g.ctx.levels; const c = (L.current?.interactables ?? []).find((i) => i?.play === 'cs01b' || i?.id === 'barn_chest' || i?.id === 'chest'); if (c) L.interact?.(c.id); });
      ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01b', null, { timeout: 8000 });
      if (!ok) { await t.G(() => { window.__GAME__.ctx.story.play('cs01b'); }); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'cs01b', null, { timeout: 6000 }); }
      t.assert(!!ok, 'CS-01b plays at the barn chest');
      await atLine(t, 'cs01.helm', '01c-cs01b-helm');
      await atLine(t, 'cs01.10', '01d-cs01b-mirror');
      const done = await until(t, () => window.__GAME__.ctx.state.getFlag('prologue.done') === true && !window.__GAME__.ctx.story.isPlaying && !window.__GAME__.ctx.levels.loading, null, { timeout: 60000 });
      t.assert(!!done, 'flags prologue.armour / tutorial / done after Suit Up');
      await t.wait(500);
      checkHandback(t, await t.G(afterScene), 'CS-01b');
      const o = await t.G(() => window.__GAME__.ctx.player.model?.outfit ?? null);
      t.assert(!o || o === 'armour', `armour on (${o})`);
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

  // ------------------------------------------------------------------ G-01 Sir Tallbert (armed on prologue.done)
  {
    name: 'story:g01', order: 73, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, PROLOGUE_DONE, 'meadow', 'practice');
      await tp(t, 0, -64.5, 0);
      await t.click(0, -59.5);
      let ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'g01', null, { timeout: 8000 });
      if (!ok) { t.warn('walk did not reach the tallbert trigger: teleporting into it'); await tp(t, 0, -61, 0); ok = await until(t, () => window.__GAME__.ctx.story.playingId === 'g01', null, { timeout: 5000 }); }
      t.assert(!!ok, 'G-01 plays at the north gate');
      if (await until(t, lineIs, 'g01.1', { timeout: 12000 })) { await t.wait(500); await shot(t, '03a-g01-hello'); }
      const done = await until(t, ended, 'g01', { timeout: 20000 });
      t.assert(!!done, 'G-01 ends by itself');
      checkHandback(t, await t.G(afterScene), 'G-01');
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

  // ------------------------------------------------------------------ D-01 Mochi joins at his cart (WA16)
  {
    name: 'story:d01', order: 76, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { ...PROLOGUE_DONE, 'meadow.pudding': true }, 'meadow', 'start');
      await tp(t, -14, -39.2, Math.PI);
      await t.G(() => { const g = window.__GAME__; if (!g.ctx.actors.get('mochi')) g.ctx.companions.spawnNpc('mochi', [-14.4, -40.4], 0); });
      await t.frames(20);
      await t.G(() => { window.__GAME__.ctx.story.play('d01'); });
      await atLine(t, 'd01.3', '06a-d01-almost-knights', 15000);
      const done = await until(t, ended, 'd01', { timeout: 25000 });
      t.assert(!!done, 'D-01 finished');
      const st = await t.G(() => ({ flag: window.__GAME__.ctx.state.getFlag('meadow.mochi'), reward: window.__GAME__.events.includes('reward') || window.__GAME__.events.includes('ui:toast') }));
      t.assert(st.flag === true, 'flag meadow.mochi');
      t.assert(st.reward, 'the friend card "Mochi joined the party!"');
      checkHandback(t, await t.G(afterScene), 'D-01');
    },
  },

  // ------------------------------------------------------------------ hold-to-skip + placeholders + barks
  {
    name: 'story:skip', order: 77, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      ensureDir(t);
      await fresh(t, { 'prologue.start': true, 'prologue.practice': true }, 'meadow', 'practice');
      await t.G(() => { window.__GAME__.story.play('cs01'); });
      await until(t, sceneT, ['cs01', 2.0], { timeout: 8000 });
      await t.page.keyboard.down('Escape');
      await t.wait(500);
      await shot(t, '07a-skip-ring');
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
