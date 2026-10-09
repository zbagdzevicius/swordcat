// tests/smoke/world.mjs  (owner: world) — smoke blocks for src/world (levels, LevelKit, Env, arenas, vigils, pickups,
// exits). Screenshots go to tests/shots/world/. Run against your own dev server:
//   SMOKE_URL=http://localhost:5208/ SMOKE_ONLY=world node tests/smoke.mjs
import fs from 'node:fs';
import path from 'node:path';

const shotDir = (t) => { const d = path.join(t.shotsDir, 'world'); fs.mkdirSync(d, { recursive: true }); return 'world/'; };

/** Teleport her (x, z on the ground + dy) facing `yaw`, snap the camera behind her, wait a few frames. */
async function tp(t, x, z, yaw = 0, dy = 0) {
  await t.G(([px, pz, f, h]) => {
    const g = window.__GAME__, p = g.ctx.player;
    p.teleport({ pos: new g.THREE.Vector3(px, g.ctx.physics.heightAt(px, pz) + h, pz), facing: f });
    g.ctx.cam?.snapBehind?.();
  }, [x, z, yaw, dy]);
  await t.frames(20);
}

async function setFlags(t, flags) {
  await t.G((f) => { const s = window.__GAME__.ctx.state; for (const [k, v] of Object.entries(f)) s.setFlag(k, v); }, flags);
}

/** A clean M2 save state (flags, kittens, letters...), then `flags`, then load `level` at `spawn`. */
async function freshAt(t, level, spawn = 'start', flags = {}) {
  await t.G(() => { const s = window.__GAME__.ctx.state; s.flags = {}; s.kittens = []; s.letters = []; s.heartBells = []; s.fish = 0; s.levels = {}; s.companions.unlocked = []; s.companions.active = []; });
  await setFlags(t, flags);
  await t.loadLevel(level, spawn);
  await t.frames(20);
}

/** Snap the camera to look at (x, y, z) from (cx, cy, cz) (screenshots of setpieces without the follow camera). */
async function look(t, from, at) {
  await t.G(([f, a]) => {
    const g = window.__GAME__, cam = g.ctx.camera;
    g.ctx.cam?.mode?.('cutscene');
    cam.position.set(f[0], f[1], f[2]); cam.lookAt(a[0], a[1], a[2]); cam.updateMatrixWorld();
  }, [from, at]);
  await t.frames(6);
}

/** The level's own draw calls / triangles (everything else hidden for 3 frames). */
async function levelShare(t) {
  return t.G(async () => {
    const g = window.__GAME__, sc = g.ctx.scene, root = g.ctx.levels.current.root, hidden = [];
    for (const c of sc.children) if (c !== root && !c.isLight && c.name !== 'sky' && c.visible) { c.visible = false; hidden.push(c); }
    await g.waitFrames(3);
    const s = g.state();
    for (const c of hidden) c.visible = true;
    return { calls: s.calls, tris: s.tris };
  });
}

async function fresh(t, spawn = 'start', flags = {}) {
  await t.G(() => { const s = window.__GAME__.ctx.state; s.flags = {}; s.kittens = []; s.letters = []; s.heartBells = []; s.fish = 0; });
  await setFlags(t, flags);
  await t.loadLevel('meadow', spawn);
  await t.frames(20);
}

const levelInfo = () => {
  const L = window.__GAME__.ctx.levels.current;
  return {
    id: L?.id, arenas: L?.arenas.map((a) => a.id), vigils: L?.vigils.map((v) => v.id), triggers: L?.triggers.map((x) => x.id),
    spawns: Object.keys(L?.spawns ?? {}), anchors: Object.keys(L?.anchors ?? {}).length, batch: L?.batch?.count, grass: L?.grass?.count ?? 0,
    trees: L?.trees.length, actors: L?.actors.length, critters: L?.critters.length, prof: L?.buildProfile, fog: window.__GAME__.ctx.env.fogDensity,
    preset: window.__GAME__.ctx.env.presetName, interact: L?.interactables.map((i) => i.id),
  };
};

export default [
  {
    name: 'world:meadow', order: 30, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      const pre = shotDir(t);
      await fresh(t, 'start');
      const info = await t.G(levelInfo);
      t.log('meadow', JSON.stringify(info));
      t.assert(info.id === 'meadow', 'meadow loaded');
      t.assert(['bridge', 'glade', 'stones'].every((a) => info.arenas.includes(a)), 'arenas stones / glade / bridge');
      t.assert(info.vigils.length === 3, 'three Vigil Stones');
      t.assert(['tallbert', 'lane', 'exit'].every((x) => info.triggers.includes(x)), 'triggers tallbert / lane / exit');
      t.assert(['title', 'practice', 'start', 'boss', 'vigil_1'].every((s) => info.spawns.includes(s)), 'spawns');
      t.assert(info.preset === 'meadow_night', `prologue env is meadow_night (${info.preset})`);
      t.assert(info.grass > 10000 && info.batch > 250 && info.trees >= 3, 'grass, batched props and trees');
      t.assert(info.critters === 2, 'two sleeping cows');
      await t.blankCheck('meadow night');
      await t.shot(pre + 'meadow-night-start');
      await tp(t, -2, -67, 2.9); await t.shot(pre + 'meadow-night-practice');
      // the day look (after CS-02)
      await fresh(t, 'start', { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true });
      const day = await t.G(levelInfo);
      t.assert(day.preset === 'meadow_day', 'meadow_day after the prologue');
      t.assert(Math.abs(day.fog - 0.045) < 0.004, `fog ≈ 0.045 (${day.fog})`);
      const st = await t.state();
      t.log(`meadow day: calls ${st.calls}, tris ${st.tris} (frame ${st.frameCalls}/${st.frameTris})`);
      if (st.calls > 300) t.warn(`meadow draws ${st.calls} calls (> 300 desktop budget, art.md §14)`);
      // the level's own share (everything else hidden for 3 frames): one prop batch, instanced trees, grass layers...
      const lv = await t.G(async () => {
        const g = window.__GAME__, sc = g.ctx.scene, root = g.ctx.levels.current.root, hidden = [];
        for (const c of sc.children) if (c !== root && !c.isLight && c.name !== 'sky' && c.visible) { c.visible = false; hidden.push(c); }
        await g.waitFrames(3);
        const s = g.state();
        for (const c of hidden) c.visible = true;
        return { calls: s.calls, tris: s.tris };
      });
      t.log(`meadow level only: calls ${lv.calls}, tris ${lv.tris}`);
      t.assert(lv.calls <= 60, `the level draws ${lv.calls} calls (≤ 60)`);
      // tech.md §18 budgets at 'meadow day' on Med and Low: the level's own share is asserted (world's slice: half the
      // §18 calls / tris),
      // the whole frame (player fur, enemies, companions...) is reported against §18 and warned when over
      const q0 = await t.G(() => window.__GAME__.ctx.postfx?.qualityName ?? 'auto');
      for (const [q, lim, mine] of [['med', { calls: 150, tris: 600000 }, { calls: 60, tris: 300000 }], ['low', { calls: 80, tris: 200000 }, { calls: 40, tris: 100000 }]]) {
        await t.G((n) => window.__GAME__.quality(n), q);
        await t.loadLevel('meadow', 'start');
        await t.frames(30);
        const all = await t.state();
        const own = await t.G(async () => {
          const g = window.__GAME__, sc = g.ctx.scene, root = g.ctx.levels.current.root, hidden = [];
          for (const c of sc.children) if (c !== root && !c.isLight && c.name !== 'sky' && c.visible) { c.visible = false; hidden.push(c); }
          await g.waitFrames(3);
          const s = g.state();
          for (const c of hidden) c.visible = true;
          return { calls: s.calls, tris: s.tris };
        });
        t.log(`budget ${q}: frame ${all.calls} calls / ${all.tris} tris (§18 ≤ ${lim.calls} / ${lim.tris}); level ${own.calls} / ${own.tris}`);
        t.assert(own.calls <= mine.calls && own.tris <= mine.tris, `${q}: the meadow itself stays within ${mine.calls} calls / ${mine.tris} tris (${own.calls} / ${own.tris})`);
        if (all.calls > lim.calls || all.tris > lim.tris) t.warn(`${q}: meadow day frame ${all.calls} calls / ${all.tris} tris is over the §18 budget (${lim.calls} / ${lim.tris})`);
      }
      await t.G((n) => window.__GAME__.quality(n), q0);
      await t.loadLevel('meadow', 'start');
      await t.frames(20);
      await t.G(() => { window.__GAME__.god(true); });
      for (const [name, x, z, yaw] of [['start', -1.5, -54.5, -0.4], ['lane', -3, -54, -0.45], ['practice', 9, -64, 2.5], ['tallbert', 3, -51, 3.0],
        ['crossroads', -12, -44, -0.6], ['stones', -27, -12, 0.65], ['glade', -6, 6, 0.75], ['crowfields', 14, 30, 0.6], ['bridge', 21.5, 56.5, 1.0], ['cart', 30, 57.5, 0]]) {
        await tp(t, x, z, yaw);
        await t.shot(pre + 'meadow-day-' + name);
      }
      const st2 = await t.state();
      t.log(`bridge view: calls ${st2.calls}, tris ${st2.tris}`);
    },
  },
  {
    name: 'world:vigil', order: 31, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await fresh(t, 'start', { 'prologue.tutorial': true });
      await tp(t, -16, -34.8, Math.PI);
      await t.clearEvents();
      await t.tap('KeyE');
      t.assert(await t.waitForEvent('checkpoint', 3000), 'E at vigil_1 → checkpoint');
      const s = await t.G(() => ({ spawnId: window.__GAME__.ctx.state.spawnId, lit: window.__GAME__.ctx.levels.current.vigils.map((v) => v.lit) }));
      t.assert(s.spawnId === 'vigil_1', `respawn point vigil_1 (${s.spawnId})`);
      t.assert(s.lit[0] === true && !s.lit[1], 'the lantern of vigil_1 is lit');
      await t.frames(30);
      await t.shot(shotDir(t) + 'vigil-lit');
      // continue from the stone
      await t.loadLevel('meadow', 'vigil_1');
      const p = await t.state();
      t.assert(Math.hypot(p.player.pos[0] + 16, p.player.pos[2] + 34.6) < 1.5, 'spawn vigil_1 stands in front of the stone');
    },
  },
  {
    name: 'world:practice', order: 32, level: 'meadow', spawn: 'practice', timeout: 120000,
    async run(t) {
      await fresh(t, 'practice', { 'prologue.armour': true });
      const gate = () => t.G(() => window.__GAME__.ctx.levels.current.colliders.segments.some((s) => s.gate === 'practice'));
      t.assert(await gate(), 'the practice gate is closed before the tutorial');
      // the straw dummies take hits (and never break)
      await tp(t, 0, -77.4, 0);
      await t.clearEvents();
      await t.tap('KeyJ', 3, 260);
      await t.frames(30);
      const hits = (await t.events()).filter((e) => e === 'combat:hit').length;
      t.assert(hits >= 1, `swings hit the dummy (${hits} hits)`);
      const dummies = await t.G(() => window.__GAME__.ctx.levels.current.actors.filter((a) => a.kind === 'dummy').map((a) => a.alive));
      t.assert(dummies.length === 3 && dummies.every(Boolean), 'dummies stay up');
      await t.shot(shotDir(t) + 'practice-dummies');
      // finishing (or skipping) the tutorial opens the gate
      await t.G(() => window.__GAME__.story.flag('prologue.tutorial', true));
      await t.frames(90);
      t.assert(!(await gate()), 'gate collider removed on prologue.tutorial');
      await tp(t, 1.5, -64, 0);
      await t.shot(shotDir(t) + 'practice-gate-open');
    },
  },
  {
    name: 'world:arena', order: 33, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await fresh(t, 'start', { 'prologue.tutorial': true, 'prologue.done': true });
      await t.G(() => window.__GAME__.god(true));
      await t.clearEvents();
      await tp(t, -20, -12.5, 0);            // walk into the Standing Stones trigger disc (r − 2)
      await t.hold('KeyW', 700);
      t.assert(await t.waitForEvent('arena:lock', 4000), 'stones arena locks on entry');
      t.assert(await t.waitForEvent('arena:wave', 2000), 'wave 1 spawns');
      await t.frames(40);
      const a = await t.G(() => { const A = window.__GAME__.ctx.levels.current.arena('stones'); return { locked: A.locked, wave: A.wave, alive: A.aliveCount() }; });
      t.assert(a.locked && a.wave === 1 && a.alive === 3, `wave 1 = 3 rat_pike (${JSON.stringify(a)})`);
      await t.shot(shotDir(t) + 'arena-stones-locked');
      // defeat the waves (despawn) → wave 2 → clear
      for (let i = 0; i < 2; i++) {
        await t.G(() => { const g = window.__GAME__, A = g.ctx.levels.current.arena('stones'); for (const e of [...A.enemies]) if (g.ctx.enemies.list.includes(e)) g.ctx.enemies.despawn(e); });
        await t.wait(1900);
      }
      t.assert(await t.waitForEvent('arena:clear', 6000), 'stones arena clears after its 2 waves');
      const done = await t.G(() => window.__GAME__.ctx.levels.current.arena('stones').cleared);
      t.assert(done, 'arena.cleared');
    },
  },
  {
    name: 'world:pickups', order: 34, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await fresh(t, 'start', { 'prologue.tutorial': true });
      const f0 = (await t.G(() => window.__GAME__.ctx.state.fish)) ?? 0;
      await tp(t, -6.5, -46.6, -0.65);        // on the first fish line (0, −55) → (−10, −42), before its 4th fish (clear of the lane trigger)
      await t.hold('KeyW', 900);
      await t.frames(30);
      const f1 = await t.G(() => window.__GAME__.ctx.state.fish);
      t.assert(f1 > f0, `fish collected (${f0} → ${f1})`);
      await tp(t, -18, -24.6, 0);
      await t.hold('KeyW', 400);
      await t.frames(20);
      const letters = await t.G(() => window.__GAME__.ctx.state.letters);
      t.assert(letters.includes('l1'), `Letter #1 collected (${JSON.stringify(letters)})`);
      // a crate breaks into fish
      const crate = await t.G(() => { const c = window.__GAME__.ctx.levels.current.actors.find((a) => a.tags.has('crate')); return c ? [c.pos.x, c.pos.z, c.propId] : null; });
      if (crate) {
        await tp(t, crate[0], crate[1] - 1.3, 0);
        await t.tap('KeyJ', 2, 300);
        await t.frames(40);
        const gone = await t.G((id) => !window.__GAME__.ctx.levels.current.actors.some((a) => a.propId === id), crate[2]);
        t.assert(gone, 'the crate broke');
      }
    },
  },
  {
    name: 'world:bridge', order: 35, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await fresh(t, 'start', { 'prologue.tutorial': true });
      await t.G(() => window.__GAME__.god(true));
      await tp(t, 30, 54.5, 0);
      await t.hold('KeyW', 4600);
      await t.frames(10);
      const p = (await t.state()).player.pos;
      t.assert(p[2] > 67.5, `crossed the Old Bridge (z ${p[2].toFixed(1)})`);
      t.assert(p[1] > -0.5, `stayed on the deck (y ${p[1].toFixed(2)})`);
      await t.shot(shotDir(t) + 'bridge-crossed');
    },
  },
  {
    name: 'world:exit', order: 36, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await fresh(t, 'start', { 'prologue.tutorial': true });
      // the exit waits for Mochi (§12.3): early → the "still caged" toast, no exit
      await t.clearEvents();
      await tp(t, 30, 88.5, 0);
      await t.hold('KeyW', 1200);
      t.assert(await t.waitForEvent('ui:toast', 2000), 'Mochi still caged → toast at the exit');
      t.assert(!(await t.waitForEvent('level:exit', 1500)), 'no level:exit before the rescue');
      await t.G(() => window.__GAME__.ctx.state.setFlag('meadow.mochi', true));
      await t.clearEvents();
      await tp(t, 30, 88.5, 0);
      await t.hold('KeyW', 1200);
      t.assert(await t.waitForEvent('level:exit', 4000), 'exit box → level:exit');
      t.assert(await t.waitForEvent('level:results', 1000), 'level:results');
      const res = await t.lastEvent('level:results');
      t.log('results', JSON.stringify(res));
      t.assert(await t.waitForEvent('level:loaded', 60000), 'the next level loads');
      await t.frames(20);
      const s = await t.G(() => ({ id: window.__GAME__.ctx.levels.current?.id, done: window.__GAME__.ctx.state.getFlag('meadow.done') }));
      t.assert(s.id === 'forest' && s.done === true, `forest loaded, meadow.done set (${JSON.stringify(s)})`);
    },
  },
  {
    name: 'world:levels', order: 37, level: null, timeout: 300000,
    async run(t) {
      const pre = shotDir(t);
      for (const id of ['meadow', 'forest', 'town', 'gate', 'bog', 'keep']) {
        await t.G(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); });
        const t0 = Date.now();
        await t.loadLevel(id, 'start');
        await t.frames(30);
        const info = await t.G(levelInfo);
        const st = await t.state();
        t.log(`${id}: load ${Date.now() - t0} ms, calls ${st.calls}, tris ${st.tris}, preset ${info.preset}, props ${info.batch}, grass ${info.grass}, build ${JSON.stringify(info.prof)}`);
        t.assert(info.id === id, `${id} loaded`);
        await t.blankCheck(id);
        await t.shot(pre + 'lvl-' + id);
      }
    },
  },
  {
    name: 'world:persist', order: 38, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      // M1 review: arena clears, placed fish and the results run survive a reload (Continue / Retry)
      await fresh(t, 'start', { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true });
      await t.G(() => { const s = window.__GAME__.ctx.state; s.levels = {}; s.companions.unlocked = []; s.companions.active = []; });
      await t.loadLevel('meadow', 'start');
      await t.frames(10);
      await t.G(() => { const L = window.__GAME__.ctx.levels.current; L.arena('stones').clear(); });
      const f1 = await t.G(() => window.__GAME__.ctx.state.getFlag('meadow.cleared.stones'));
      t.assert(f1 === true, 'arena clear saved as meadow.cleared.stones');
      await t.loadLevel('meadow', 'vigil_2');
      await t.frames(10);
      await tp(t, -20, -8, Math.PI);
      await t.frames(30);
      const a = await t.G(() => { const A = window.__GAME__.ctx.levels.current.arena('stones'); return { cleared: A.cleared, locked: A.locked, wave: A.wave, alive: A.aliveCount() }; });
      t.assert(a.cleared && !a.locked && a.alive === 0, `stones stay cleared after a reload (${JSON.stringify(a)})`);
      // bridge: Mochi rescued → never locks again
      await t.G(() => window.__GAME__.ctx.state.setFlag('meadow.mochi', true));
      await t.loadLevel('meadow', 'vigil_3');
      await tp(t, 30, 66, 0);
      await t.hold('KeyW', 600);
      await t.frames(30);
      const b = await t.G(() => { const A = window.__GAME__.ctx.levels.current.arena('bridge'); return { cleared: A.cleared, locked: A.locked, alive: A.aliveCount() }; });
      t.assert(b.cleared && !b.locked && b.alive === 0, `bridge stays open once Mochi is free (${JSON.stringify(b)})`);
      // placed fish: collected ones stay gone; no fish is collected by just loading at a Vigil Stone
      for (const v of ['vigil_1', 'vigil_2', 'vigil_3']) {
        await t.loadLevel('meadow', v);
        await t.clearEvents();
        await t.frames(40);
        const ev = (await t.events()).filter((e) => e === 'item:pickup').length;
        t.assert(ev === 0, `loading at ${v} picks nothing up (${ev})`);
      }
      const fish0 = await t.G(() => window.__GAME__.ctx.levels.current.pickups.count('fish'));
      await tp(t, -6.5, -46.6, -0.65);
      await t.hold('KeyW', 900);
      await t.frames(20);
      const got = await t.G(() => window.__GAME__.ctx.state.fish);
      await t.loadLevel('meadow', 'vigil_3');
      await t.frames(5);
      const fish1 = await t.G(() => window.__GAME__.ctx.levels.current.pickups.count('fish'));
      t.assert(fish1 < fish0, `collected placed fish do not come back (${fish0} → ${fish1}, fish ${got})`);
      // results run: lives lost before a Retry still count; time keeps running from the first entry
      const r = await t.G(async () => {
        const g = window.__GAME__, st = g.ctx.state;
        const rec = st.levels.meadow, t0 = rec.runT0;
        g.ctx.bus.emit('player:lifeLost', { lives: 8 });
        g.ctx.bus.emit('player:lifeLost', { lives: 7 });
        await g.loadLevel('meadow', 'vigil_3');
        await g.waitFrames(10);
        const res = g.ctx.levels.results();
        return { t0, t0b: st.levels.meadow.runT0, lost: res.livesLost, rank: res.rank, time: res.time, play: st.playtime };
      });
      t.log('run', JSON.stringify(r));
      t.assert(r.t0 === r.t0b && r.lost === 2, `the run survives a reload (${JSON.stringify(r)})`);
    },
  },
  {
    name: 'world:warm', order: 39, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      // M1 review: no shader program is built mid-fight (arena lock, waves, alert "!", fog wall)
      await fresh(t, 'start', { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true });
      await t.G(() => { const s = window.__GAME__.ctx.state; s.levels = {}; s.companions.unlocked = []; s.companions.active = []; });
      await t.loadLevel('meadow', 'vigil_1');
      await t.frames(20);
      await t.G(() => window.__GAME__.god(true));
      const p0 = await t.G(() => window.__GAME__.ctx.renderer.info.programs.length);
      const res = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, r = ctx.renderer, L = ctx.levels.current, out = [];
        const step = async (label, fn) => {
          const before = new Set(r.info.programs), t0 = performance.now();
          let last = performance.now(), worst = 0, on = true;
          const tick = () => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; if (on) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          fn();
          await g.waitFrames(30);
          on = false;
          const fresh = r.info.programs.filter((x) => !before.has(x)).map((x) => x.name + ':' + String(x.cacheKey).slice(0, 60));
          out.push({ label, built: fresh.length, worstFrame: Math.round(worst), names: fresh });
        };
        for (const id of ['stones', 'bridge']) {
          const A = L.arena(id);
          await step(id + ':lock', () => { ctx.player.teleport({ pos: A.center.clone(), facing: 0 }); A.lock(); });
          for (const e of A.enemies) { e.bangT = 0.4; }
          await step(id + ':wave2', () => { for (const e of [...A.enemies]) ctx.enemies.despawn(e); });
          await g.waitFrames(120);
          A.reset();
        }
        return out;
      });
      const p1 = await t.G(() => window.__GAME__.ctx.renderer.info.programs.length);
      t.log('warm', JSON.stringify(res), `programs ${p0} → ${p1}`);
      const built = res.reduce((n, x) => n + x.built, 0);
      if (built > 0) t.warn(`${built} shader programs built during arena fights (${JSON.stringify(res)})`);
      t.assert(built <= 2, `at most 2 programs built mid-fight (${built})`);
    },
  },
  // ============================================================================================ M2: forest, town, gate
  {
    name: 'world:forest', order: 40, level: 'forest', spawn: 'start', timeout: 240000,
    async run(t) {
      const pre = shotDir(t);
      await freshAt(t, 'forest', 'start', { 'prologue.done': true, 'meadow.mochi': true, 'meadow.done': true });
      const info = await t.G(levelInfo);
      t.log('forest', JSON.stringify(info));
      t.assert(info.id === 'forest' && info.preset === 'forest_day', `forest loaded in forest_day (${info.preset})`);
      t.assert(['hollow', 'ratcamp', 'mill'].every((a) => info.arenas.includes(a)), 'arenas hollow / ratcamp / mill');
      t.assert(info.vigils.length === 4, 'four Vigil Stones');
      t.assert(['camp', 'exit'].every((x) => info.triggers.includes(x)), 'camp + exit triggers');
      t.assert(info.trees >= 3 && info.batch > 300 && info.grass > 5000, 'trees, props, grass');
      const st = await t.state();
      const own = await levelShare(t);
      t.log(`forest: frame ${st.calls} calls / ${st.tris} tris; level ${own.calls} / ${own.tris}`);
      t.assert(own.calls <= 70, `the forest itself draws ≤ 70 calls (${own.calls})`);
      await t.blankCheck('forest');
      await t.G(() => { window.__GAME__.god(true); for (const e of [...window.__GAME__.ctx.enemies.list]) window.__GAME__.ctx.enemies.despawn(e); });
      for (const [name, x, z, yaw] of [['gate', 0, -92, 0], ['mushrooms', -18, -50, -2.4], ['hollow', -4, -22, -2.5], ['treetop', 22, -16, -0.4], ['stream', 22, 6, 0.1],
        ['camp', 1, 32, 0.6], ['ratcamp', -4, 46, -0.7], ['mill', -9, 72, 0]]) {
        await tp(t, x, z, yaw);
        await t.shot(pre + 'forest-' + name, { freeze: true });
      }
      // the mushroom caps: a walkable top on cap 1, a bounce on cap 2
      const caps = await t.G(() => { const ph = window.__GAME__.ctx.physics; const L = window.__GAME__.ctx.levels.current; return [1, 2, 3, 4, 5].map((i) => { const a = L.anchor('cap_' + i).pos; return { top: +(ph.topAt(a.x, a.z) - ph.heightAt(a.x, a.z)).toFixed(2), bounce: ph.bounceAt?.(a.x, a.z, a.y) ?? 0 }; }); });
      t.log('caps', JSON.stringify(caps));
      t.assert(Math.abs(caps[0].top - 1.0) < 0.15 && Math.abs(caps[4].top - 5.2) < 0.15, 'cap tops at 1.0 … 5.2 m');
      t.assert(caps[1].bounce > 0 && caps[3].bounce > 0 && caps[0].bounce === 0, 'caps 2 and 4 bounce');
      // night (CS-04 onwards): forest_night with fireflies and the campfire
      await freshAt(t, 'forest', 'vigil_3', { 'prologue.done': true, 'meadow.mochi': true, 'forest.sage': true, 'forest.camp': true });
      const night = await t.G(levelInfo);
      t.assert(night.preset === 'forest_night', `forest_night after CS-04 (${night.preset})`);
      await tp(t, 2, 32.5, 0.5);
      await t.frames(30);
      await t.shot(pre + 'forest-night-camp', { freeze: true });
      await tp(t, -6, 47, -0.8);
      await t.shot(pre + 'forest-night-ratcamp', { freeze: true });
    },
  },
  {
    name: 'world:town', order: 41, level: 'town', spawn: 'start', timeout: 240000,
    async run(t) {
      const pre = shotDir(t);
      await freshAt(t, 'town', 'start', { 'prologue.done': true, 'meadow.done': true, 'forest.done': true, 'forest.boss': true });
      const info = await t.G(levelInfo);
      t.log('town', JSON.stringify(info));
      t.assert(info.id === 'town' && info.preset === 'town_occupied', `town occupied (${info.preset})`);
      t.assert(['forge', 'square'].every((a) => info.arenas.includes(a)), 'arenas forge / square');
      t.assert(['lantern_1', 'lantern_2', 'lantern_3', 'quest_board'].every((i) => info.interact.includes(i)), 'lanterns + quest board interactables');
      t.assert(['start', 'hub', 'bakery_cot', 'belltower'].every((s) => info.spawns.includes(s)), 'town spawns');
      const st = await t.state();
      const own = await levelShare(t);
      t.log(`town: frame ${st.calls} calls / ${st.tris} tris; level ${own.calls} / ${own.tris}`);
      t.assert(own.calls <= 70, `the town itself draws ≤ 70 calls (${own.calls})`);
      await t.blankCheck('town');
      // climbs: balcony 3.0, statue top 2.5, loft ledge 6 above the terrace, the bell platform
      const tops = await t.G(() => {
        const ph = window.__GAME__.ctx.physics, h = (x, z) => ph.heightAt(x, z);
        return { balcony: +(ph.topAt(5, -30) - h(5, -30)).toFixed(2), statue: +(ph.topAt(0, 8) - h(0, 8)).toFixed(2), rim: +(ph.topAt(2.4, 8) - h(2.4, 8)).toFixed(2),
          ledge: +(ph.topAt(-2.7, 50.5) - h(-2.7, 50.5)).toFixed(2), crate3: +(ph.topAt(5.1, -33.2) - h(5.1, -33.2)).toFixed(2) };
      });
      t.log('tops', JSON.stringify(tops));
      t.assert(Math.abs(tops.balcony - 3) < 0.15 && Math.abs(tops.statue - 2.5) < 0.15 && Math.abs(tops.rim - 0.6) < 0.15 && Math.abs(tops.crate3 - 3) < 0.15, 'balcony / statue / rim / crate steps');
      t.assert(tops.ledge > 5.5, `the loft ledge is up the tower (${tops.ledge})`);
      // the climb kittens sit on their perches (companions place them on our surfaces)
      const perch = await t.G(() => {
        const g = window.__GAME__, ph = g.ctx.physics, out = {};
        for (const id of ['waffles', 'toffee', 'muffin']) { const k = g.ctx.actors.get(id); if (k) out[id] = { y: +k.pos.y.toFixed(2), x: +k.pos.x.toFixed(1), z: +k.pos.z.toFixed(1), top: +ph.groundAt(k.pos.x, k.pos.z, k.pos.y + 0.5).toFixed(2) }; }
        return out;
      });
      t.log('perches', JSON.stringify(perch));
      for (const [id, p] of Object.entries(perch)) if (Math.abs(p.y - p.top) > 0.35) t.warn(`${id} is not on its perch (${JSON.stringify(p)})`);
      // Lantern Alley: E on each lantern → obj.lanterns 3/3, fog thins, flag town.lanterns
      const fog0 = await t.G(() => window.__GAME__.ctx.env.fogDensity);
      await tp(t, 0, -46, 0);
      await t.frames(10);
      const lan = await t.G(async () => {
        const g = window.__GAME__, L = g.ctx.levels;
        const out = [];
        for (const id of ['lantern_1', 'lantern_2', 'lantern_3']) { out.push(L.interact(id)); await g.waitFrames(4); }
        await g.waitFrames(40);
        return { used: out, value: g.ctx.objectives.progress('lanterns'), done: g.ctx.objectives.get('lanterns')?.done, flag: g.ctx.state.getFlag('town.lanterns'), fog: g.ctx.env.fogDensity };
      });
      t.log('lanterns', JSON.stringify(lan), 'fog', fog0);
      t.assert(lan.used.every(Boolean) && lan.value === 3 && lan.done && lan.flag === true, 'three lanterns lit → objective done, town.lanterns');
      t.assert(lan.fog < fog0 - 0.01, `lit lanterns thin the fog (${fog0} → ${lan.fog})`);
      await t.G(() => { window.__GAME__.god(true); for (const e of [...window.__GAME__.ctx.enemies.list]) window.__GAME__.ctx.enemies.despawn(e); });
      for (const [name, x, z, yaw] of [['gate', 0, -68, 0], ['alley', 0, -44, 0.05], ['balcony', -1, -36, 0.6], ['bakery', -12, -14, -2.2], ['postoffice', -28, 10, -1.9],
        ['forge', 12, -2, 1.7], ['square', 0, -8, 0], ['fountain', 6, 3, -0.6], ['steps', 0, 28, 0], ['tower', 6, 40, -0.5]]) {
        await tp(t, x, z, yaw);
        await t.shot(pre + 'town-' + name, { freeze: true });
      }
    },
  },
  {
    name: 'world:hub', order: 42, level: 'town', spawn: 'hub', timeout: 200000,
    async run(t) {
      const pre = shotDir(t);
      await freshAt(t, 'town', 'hub', { 'prologue.done': true, 'meadow.done': true, 'forest.done': true, 'town.marmalade': true, 'town.clover': true, 'town.free': true });
      const info = await t.G(levelInfo);
      t.assert(info.preset === 'hub_gold', `hub_gold once the town is free (${info.preset})`);
      const hub = await t.G(() => {
        const g = window.__GAME__, L = g.ctx.levels.current;
        const open = L.interactables.filter((i) => (i.kind === 'station' || i.kind === 'questboard' || i.kind === 'talk') && (!i.enabled || i.enabled())).map((i) => i.id);
        const enemies = g.ctx.enemies.list.filter((e) => e.alive).length;
        const arenas = L.arenas.map((a) => ({ id: a.id, cleared: a.cleared }));
        return { open, enemies, arenas, next: L.hub?.next?.(), board: L.hub?.board?.().map((r) => r.id + (r.next ? '*' : '')).join(',') };
      });
      t.log('hub', JSON.stringify(hub));
      t.assert(['station_bakery', 'station_forge', 'station_library', 'station_barracks', 'quest_board', 'npc_snowpaw'].every((i) => hub.open.includes(i)), 'stations open');
      t.assert(!hub.open.includes('station_lookout') && !hub.open.includes('station_wardrobe'), 'lookout / wardrobe still closed');
      t.assert(hub.enemies === 0 && hub.arenas.every((a) => a.cleared), 'hub mode: no enemies, arenas cleared');
      t.assert(hub.next === 'gate', `the Quest Board points to the gate (${hub.next})`);
      // the Quest Board and a shop open through ui on `interact`
      await t.clearEvents();
      const used = await t.G(async () => {
        const g = window.__GAME__; const ok = g.ctx.levels.interact('quest_board'); await g.waitFrames(10); const m = g.ctx.game.mode;
        g.ctx.ui?.closeShop?.(); g.ctx.ui?.resume?.(); await g.waitFrames(5);
        const ok2 = g.ctx.levels.interact('station_forge'); await g.waitFrames(10); const m2 = g.ctx.game.mode;
        g.ctx.ui?.closeShop?.(); g.ctx.ui?.resume?.(); await g.waitFrames(5);
        return { ok, mode: m, ok2, mode2: m2 };
      });
      t.log('board', JSON.stringify(used));
      t.assert(used.ok && used.ok2 && (await t.events()).includes('interact'), 'quest board + forge interact');
      await t.G(() => { const g = window.__GAME__; g.setMode('play'); });
      // gate.done → hub_grey, lookout opens
      await setFlags(t, { 'gate.done': true });
      await t.loadLevel('town', 'hub');
      await t.frames(20);
      const grey = await t.G(() => { const g = window.__GAME__, L = g.ctx.levels.current; return { preset: g.ctx.env.presetName, lookout: L.interactables.find((i) => i.id === 'station_lookout')?.enabled?.() }; });
      t.assert(grey.preset === 'hub_grey' && grey.lookout === true, `hub_grey + lookout after gate.done (${JSON.stringify(grey)})`);
      await setFlags(t, { 'gate.done': false });
      await t.loadLevel('town', 'hub');
      await t.frames(20);
      await t.G(() => { window.__GAME__.god(true); });
      for (const [name, x, z, yaw] of [['board', 1, -55, -0.6], ['square', 0, -6, 0], ['steps', 0, 26, 0], ['belltower', 0, 50.5, Math.PI]]) {
        if (name === 'belltower') await t.G(() => { const g = window.__GAME__, sp = g.ctx.levels.current.spawns.belltower; g.ctx.player.teleport({ pos: sp.pos.clone(), facing: Math.PI }); g.ctx.cam?.snapBehind?.(); });
        else await tp(t, x, z, yaw);
        await t.frames(10);
        await t.shot(pre + 'hub-' + name, { freeze: true });
      }
    },
  },
  {
    name: 'world:gate', order: 43, level: 'gate', spawn: 'start', timeout: 240000,
    async run(t) {
      const pre = shotDir(t);
      await freshAt(t, 'gate', 'start', { 'prologue.done': true, 'town.free': true, 'town.done': true });
      const info = await t.G(levelInfo);
      t.log('gate', JSON.stringify(info));
      t.assert(info.id === 'gate' && info.preset === 'gate_dusk', `gate in gate_dusk (${info.preset})`);
      t.assert(info.arenas.includes('causeway') && info.triggers.includes('line'), 'causeway arena + Line trigger');
      const geo = await t.G(() => {
        const g = window.__GAME__, ph = g.ctx.physics;
        return { deck: +ph.heightAt(0, 0).toFixed(2), sea: +ph.heightAt(14, 0).toFixed(2), deep: ph.isDeepWater(14, 0), dryDeck: !ph.isDeepWater(0, 0, 0), ledge: +ph.heightAt(9, -52).toFixed(2),
          tower: +(ph.topAt(8.6, 8)).toFixed(2), parapet: +(ph.topAt(5.8, 30)).toFixed(2), shore: +ph.heightAt(0, 70).toFixed(2), south: +ph.heightAt(0, -75).toFixed(2) };
      });
      t.log('geo', JSON.stringify(geo));
      t.assert(geo.deck === 0 && geo.sea < -1.6 && geo.deep && geo.dryDeck, 'deck at 0 over deep tidal water');
      t.assert(Math.abs(geo.ledge + 0.8) < 0.1 && Math.abs(geo.parapet - 0.6) < 0.1, 'ledge −0.8, parapet 0.6');
      t.assert(Math.abs(geo.shore) < 0.8 && Math.abs(geo.south) < 0.8, 'shores near y 0');
      const st = await t.state();
      const own = await levelShare(t);
      t.log(`gate: frame ${st.calls} calls / ${st.tris} tris; level ${own.calls} / ${own.tris}`);
      t.assert(own.calls <= 70, `the gate itself draws ≤ 70 calls (${own.calls})`);
      await t.blankCheck('gate');
      await t.G(() => { window.__GAME__.god(true); for (const e of [...window.__GAME__.ctx.enemies.list]) window.__GAME__.ctx.enemies.despawn(e); });
      for (const [name, x, z, yaw] of [['yard', 0, 62, Math.PI], ['gatehouse', 0, 32, 0], ['causeway', 0, 46, Math.PI], ['towers', 0, -4, 0], ['line', 2, 16, Math.PI],
        ['battlefield', 0, -56, Math.PI], ['wagon', 0, -72, 2.3], ['ledge', 3, -46, 2.6], ['raft', -4, 4, -2.3]]) {
        await tp(t, x, z, yaw);
        await t.shot(pre + 'gate-' + name, { freeze: true });
      }
    },
  },
  {
    name: 'world:line', order: 44, level: 'gate', spawn: 'start', timeout: 240000,
    async run(t) {
      const pre = shotDir(t);
      await freshAt(t, 'gate', 'vigil_3', { 'prologue.done': true, 'town.free': true, 'gate.cleared.s1': true, 'gate.cleared.s2': true, 'gate.pip': true });
      await t.G(() => { window.__GAME__.god(true); });
      await tp(t, 0, 14, Math.PI);
      await tp(t, 0, 10.5, Math.PI);
      await t.frames(20);
      const started = await t.G(() => !!window.__GAME__.ctx.objectives.line?.active);
      t.assert(started, 'the Line starts at the marker');
      // §19.9 smoke 7: objective('line') increases over 3 s with no enemies
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
      const v0 = await t.G(() => window.__GAME__.objective('line'));
      await t.wait(3000);
      const v1 = await t.G(() => window.__GAME__.objective('line'));
      t.log(`line ${v0} → ${v1}`);
      t.assert(v1 > v0 + 0.3, `repair rises with no enemies (${v0} → ${v1})`);
      // an enemy at the winch pauses it
      const paused = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx;
        for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e);
        const e = ctx.enemies.spawn('rat_pike', new g.THREE.Vector3(1.5, 0, 41), { ai: false, noCap: true });
        await g.waitFrames(30);
        const a = g.objective('line'); await g.waitFrames(60); const b = g.objective('line');
        ctx.enemies.despawn(e);
        return { a, b, blocked: ctx.objectives.get('line')?.paused };
      });
      t.log('paused', JSON.stringify(paused));
      t.assert(Math.abs(paused.b - paused.a) < 1e-6, 'an enemy within 4 m of the winch pauses the repair');
      await t.shot(pre + 'line-start', { freeze: true });
      // thresholds: jump to 99.9 %; the W2 … G-02 rows fire (CS-08 / G-02 placeholders), then 100 % → gate.line, the boss arena locks
      const end = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, line = ctx.objectives.line;
        ctx.objectives.set('line', 99.9);
        for (let i = 0; i < 40 && !line.cs08?.done; i++) { for (const e of [...ctx.enemies.list]) if (!e.tags?.has?.('boss')) ctx.enemies.despawn(e); await g.waitFrames(15); if (ctx.story?.isPlaying) ctx.story.skip?.(); }
        for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e);
        for (let i = 0; i < 60 && !ctx.state.getFlag('gate.line'); i++) { await g.waitFrames(10); if (ctx.story?.isPlaying) ctx.story.skip?.(); }
        const fired = [...line.fired];
        for (let i = 0; i < 60 && !ctx.levels.current.arena('causeway').locked; i++) await g.waitFrames(10);
        return { fired, line: ctx.state.getFlag('gate.line'), locked: ctx.levels.current.arena('causeway').locked, boss: !!ctx.enemies.boss };
      });
      t.log('end', JSON.stringify(end));
      t.assert(end.fired.length === 5 && end.line === true, `every threshold fired once, gate.line set (${JSON.stringify(end)})`);
      t.assert(end.locked, 'the causeway boss arena locks after the portcullis test');
      await t.shot(pre + 'line-boss', { freeze: true });
    },
  },
];
