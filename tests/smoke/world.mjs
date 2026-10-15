// tests/smoke/world.mjs  (owner: world) — smoke blocks for src/world (levels, LevelKit, Env, arenas, vigils, pickups,
// exits). Screenshots go to tests/shots/world/. Run against your own dev server:
//   SMOKE_URL=http://localhost:5508/ SMOKE_ONLY=world node tests/smoke.mjs
// CONTROLS_SPEC blocks (iso camera): world:fog-audit, world:zone-shots, world:iso-data (desktop mouse), world:touch
// (phone landscape 844×390 + portrait 390×844, hasTouch / isMobile).
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

/**
 * Phase W prologue order (practice → chart → CS-02 → barn → cs01b): `prologue.tutorial` alone no longer means
 * "Chapter 1" (the prologue director would play CS-02 on load), so a block that sets it gets every prologue stage
 * flag + prologue.done, exactly as SaveManager.newGame({ skipPrologue }) does, unless it sets prologue.done itself.
 */
const PROLOGUE_FLAGS = ['prologue.start', 'prologue.practice', 'prologue.chart', 'prologue.raid', 'prologue.armour', 'prologue.tutorial', 'prologue.done', 'tut.done'];
const chapterFlags = (flags) => (flags['prologue.tutorial'] && !('prologue.done' in flags)
  ? { ...Object.fromEntries(PROLOGUE_FLAGS.map((k) => [k, true])), ...flags } : flags);

async function setFlags(t, flags) {
  await t.G((f) => { const s = window.__GAME__.ctx.state; for (const [k, v] of Object.entries(f)) s.setFlag(k, v); }, chapterFlags(flags));
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

/**
 * A phone session (hasTouch + isMobile, w × h CSS px) at `?test=1&seed=1`, booted with a generous navigation timeout
 * (a cold context loads every dev module), the prologue done and `level` / `spawn` loaded. Errors are collected.
 */
async function phone(t, w, h, level, spawn, flags = {}) {
  const errors = [];
  const context = await t.browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await context.newPage();
  pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  const G = async (fn, arg) => { const hd = await pg.evaluateHandle(fn, arg); try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); } };
  const s = {
    page: pg, errors, G,
    frames: (n = 1) => G((k) => window.__GAME__.waitFrames(k), n),
    async shot(name) {
      const p = path.join(t.shotsDir, `${name}.png`);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      try { await pg.screenshot({ path: p }); } catch (e) { t.warn(`phone shot ${name}: ${String(e?.message ?? e).slice(0, 120)}`); }
    },
    async tapAt(x, z) {
      const p = await G(([a, b]) => window.__GAME__.screen(a, b), [x, z]);
      if (!p || !Number.isFinite(p.x)) return null;
      await pg.touchscreen.tap(Math.round(p.x), Math.round(p.y));
      return p;
    },
    close: () => context.close().catch(() => {}),
  };
  await pg.goto(`${t.base}?test=1&seed=1`, { timeout: 240000 });
  await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 240000 });
  await G(async ([id, sp, fl]) => {
    const g = window.__GAME__, c = g.ctx;
    g.story.skip?.(); g.setMode('play');
    for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag?.(k, true);
    for (const [k, v] of Object.entries(fl)) c.state.setFlag?.(k, v);
    await g.loadLevel(id, sp);
    g.story.skip?.(); g.setMode('play');
    return true;
  }, [level, spawn, flags]);
  await s.frames(10);
  return s;
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
      t.assert(info.preset === 'meadow_morning', `WA §2.3: prologue env is meadow_morning (${info.preset})`);
      t.assert(info.grass > 2000 && info.batch > 250 && info.trees >= 3, `grass (PERF W tufts, one draw), batched props and trees (${info.grass} / ${info.batch} / ${info.trees})`);
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
      // PERF §1.2 / IMPLEMENTATION_PLAN §5 triangle budgets at 'meadow day' (config PERF.budgets.End.tris: Low 80k, Med
      // 150k, High 260k) and the I1 frame calls (Low 70, Med 120): the whole frame (hero, enemies, companions, fx) is
      // asserted against them, and the level's own share against world's slice (70 % of the triangles, half the calls)
      const q0 = await t.G(() => window.__GAME__.ctx.postfx?.qualityName ?? 'auto');
      for (const [q, lim, mine] of [['med', { calls: 120, tris: 150000 }, { calls: 60, tris: 105000 }], ['low', { calls: 70, tris: 80000 }, { calls: 35, tris: 56000 }]]) {
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
        t.log(`budget ${q}: frame ${all.calls} calls / ${all.tris} tris (PERF ≤ ${lim.calls} / ${lim.tris}); level ${own.calls} / ${own.tris}`);
        t.assert(own.calls <= mine.calls && own.tris <= mine.tris, `${q}: the meadow itself stays within ${mine.calls} calls / ${mine.tris} tris (${own.calls} / ${own.tris})`);
        t.assert(all.tris <= lim.tris, `${q}: meadow day frame ${all.tris} tris ≤ the PERF §1.2 budget ${lim.tris}`);
        if (all.calls > lim.calls) t.warn(`${q}: meadow day frame ${all.calls} calls is over the I1 budget (${lim.calls})`);
      }
      await t.G((n) => window.__GAME__.quality(n), q0);
      await t.loadLevel('meadow', 'start');
      await t.frames(20);
      await t.G(() => { window.__GAME__.god(true); });
      for (const [name, x, z, yaw] of [['start', -1.5, -50.5, -0.4], ['lane', -3, -54, -0.45], ['practice', 9, -64, 2.5], ['tallbert', 3, -51, 3.0],
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
      // ON §6.1: Letter #1 sleeps under the Crow Fields cow (40, 30); a Meow wakes her and she ambles to (40, 36)
      await tp(t, 41.5, 27.4, 0);
      await t.tap('KeyC');
      await t.wait(3500);
      await t.hold('KeyW', 700);
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
      // bridge (WA16: Mochi moved to the cart; the bridge now guards Biscuit's carrier): cleared once → never locks again
      await t.G(() => { window.__GAME__.ctx.state.setFlag('meadow.mochi', true); window.__GAME__.ctx.levels.current.arena('bridge').clear(); });
      await t.loadLevel('meadow', 'vigil_3');
      await tp(t, 30, 66, 0);
      await t.hold('KeyW', 600);
      await t.frames(30);
      const b = await t.G(() => { const A = window.__GAME__.ctx.levels.current.arena('bridge'); return { cleared: A.cleared, locked: A.locked, alive: A.aliveCount() }; });
      t.assert(b.cleared && !b.locked && b.alive === 0, `bridge stays open once cleared (${JSON.stringify(b)})`);
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
      t.assert(info.trees >= 3 && info.batch > 300 && info.grass > 2000, `trees, props, grass (PERF W tufts) (${info.trees} / ${info.batch} / ${info.grass})`);
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
      t.assert(night.preset === 'forest_twilight' || night.preset === 'forest_night', `WA §2.3 forest_twilight after CS-04 (${night.preset})`);
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
      t.assert(grey.preset === 'hub_hush' && grey.lookout === true, `WA §2.3 hub_hush + lookout after gate.done (${JSON.stringify(grey)})`);
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
    // TT2 §10.4 / §10.5: the Rescue House landmark by the fountain behind the Token Tails cat, the night banner beside it,
    // the love-pink barracks pennant and the Token Tails bunting over the free town; the house adds at most 2 draws
    name: 'world:rescue-house', order: 42.5, level: 'town', spawn: 'hub', timeout: 200000,
    async run(t) {
      const pre = shotDir(t);
      await freshAt(t, 'town', 'hub', { 'prologue.done': true, 'meadow.done': true, 'forest.done': true, 'town.marmalade': true, 'town.clover': true, 'town.free': true });
      await t.G(() => { const g = window.__GAME__; g.god(true); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
      const info = await t.G(() => {
        const g = window.__GAME__, L = g.ctx.levels.current, a = L.anchors.rescue_house, k = L.anchors.hub_tokentails_cat;
        const keys = new Set((L.kit?.templates ?? L.templates ?? []).map((tp) => tp.key));
        return { anchor: a ? [+a.pos.x.toFixed(2), +a.pos.z.toFixed(2)] : null, keeper: k ? [+k.pos.x.toFixed(2), +k.pos.z.toFixed(2)] : null,
          house: keys.has('rescue_house') || null, banner: keys.has('tt_banner') || null, wallBanner: keys.has('tt_wall_banner') || null, redBanner: [...keys].some((k) => /banner-red/.test(k)), keyCount: keys.size,
          bunting: L.bunting ? { n: L.bunting.mesh?.count ?? null } : null };
      });
      t.log('rescue house', JSON.stringify(info));
      t.assert(info.wallBanner && !info.redBanner, `TT3 R2: the square hangs Token Tails wall banners, no KayKit banner-red (${JSON.stringify(info)})`);
      t.assert(info.anchor && info.keeper && Math.hypot(info.anchor[0] - info.keeper[0], info.anchor[1] - info.keeper[1]) < 4, `the Rescue House stands by the keeper (${JSON.stringify(info)})`);
      // draw budget: the level's share with the house shown vs. its batch entries hidden (the house is batch geometry)
      const calls = await t.G(async () => {
        const g = window.__GAME__, L = g.ctx.levels.current, sc = g.ctx.scene, root = L.root, hidden = [];
        g.ctx.player.teleport({ pos: new g.THREE.Vector3(2.5, g.ctx.physics.heightAt(2.5, 7), 7), facing: 0.8 }); g.ctx.cam?.snapBehind?.();
        await g.waitFrames(20);
        for (const c of sc.children) if (c !== root && !c.isLight && c.name !== 'sky' && c.visible) { c.visible = false; hidden.push(c); }
        await g.waitFrames(3);
        const on = g.state().calls;
        const tpl = (L.kit?.templates ?? L.templates ?? []).filter((tp) => ['rescue_house', 'sign_paw', 'tt_banner'].includes(tp.key));
        const batch = L.kit?.batch ?? L.batch;
        let off = on;
        if (batch?.setVisible && L.rescueHouseHandles?.length) {
          for (const h of L.rescueHouseHandles) batch.setVisible(h, false);
          await g.waitFrames(3); off = g.state().calls;
          for (const h of L.rescueHouseHandles) batch.setVisible(h, true);
        }
        for (const c of hidden) c.visible = true;
        return { on, off, templates: tpl.length, handles: L.rescueHouseHandles?.length ?? 0 };
      });
      t.log('rescue house draws', JSON.stringify(calls));
      t.assert(calls.on - calls.off <= 2, `the Rescue House costs ≤ 2 draws (${JSON.stringify(calls)})`);
      await t.frames(10);
      await t.shot(pre + 'hub-rescue-house-iso', { freeze: true });
      // static shots: her (hidden) frame as the anchor (+Z her facing, +X her left), she stands at `at` facing `yaw`
      const frame = async (name, at, yaw, pos, lk, fov = 50) => {
        await t.G(async ([a, f, ps, l, fv]) => {
          const g = window.__GAME__, p = g.ctx.player;
          p.teleport({ pos: new g.THREE.Vector3(a[0], g.ctx.physics.heightAt(a[0], a[1]), a[1]), facing: f });
          await g.waitFrames(3);
          p.object3d.visible = false;
          g.ctx.cam.shot({ pos: ps, look: l, fov: fv, anchor: 'swordcat' });
          await g.waitFrames(30);
        }, [at, yaw, pos, lk, fov]);
        await t.shot(pre + name, { freeze: true });
      };
      const toHouse = Math.atan2(7.36 - 3.0, 15.06 - 10.9);
      await frame('hub-rescue-house', [3.0, 10.9], toHouse, [0, 1.6, -0.5], [0, 2.2, 6.0], 55);
      await frame('hub-rescue-house-wide', [0.5, 6.0], toHouse, [0, 4.5, -3.0], [0, 1.5, 10.0], 55);
      // the barracks pennant (love pink on cream) and the bunting over the streets
      await frame('hub-barracks-pennant', [7.6, 2.6], Math.atan2(1.3, -4.0), [0, 1.8, -0.5], [0, 2.4, 4.0], 50);
      await frame('hub-bunting', [0, 14.0], 0, [0, 2.0, -1.0], [0, 5.2, 9.0], 60);
      await t.G(() => { window.__GAME__.ctx.player.object3d.visible = true; });
      await t.blankCheck('rescue house');
      await t.G(() => { const g = window.__GAME__; g.ctx.cam.mode('follow', { blend: false }); });
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
  // ============================================================================================ CONTROLS_SPEC (iso camera)
  {
    // §12 world 4: every level, from the iso camera: fog on her < 3 %, the top screen edge 15–30 % (asserted 8–45 %, the
    // spec band is reported), a foe 8 m away < 12 %; the far group (sky dome, skyline) hidden in play
    name: 'world:fog-audit', order: 45, level: null, timeout: 400000,
    async run(t) {
      const pre = shotDir(t);
      const DAY = { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true, 'meadow.mochi': true, 'meadow.done': true, 'forest.done': true, 'forest.boss': true };
      for (const [id, spawn, flags] of [['meadow', 'start', DAY], ['forest', 'start', DAY], ['forest', 'vigil_3', { ...DAY, 'forest.sage': true, 'forest.camp': true }],
        ['town', 'start', DAY], ['town', 'hub', { ...DAY, 'town.free': true }], ['gate', 'start', DAY], ['bog', 'start', DAY], ['keep', 'start', DAY]]) {
        await t.G(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); });
        await freshAt(t, id, spawn, flags);
        await t.G(() => { const g = window.__GAME__; g.god(true); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
        await t.frames(50);
        const r = await t.G(() => {
          const g = window.__GAME__, c = g.ctx, p = c.player.pos, cv = c.renderer.domElement.getBoundingClientRect();
          const fog = (x, z) => g.fogAt?.(x, z) ?? c.env.fogAt(x, z);
          const top = [];
          for (const fx of [0.5, 0.15, 0.85]) {
            const q = c.cam.screenToGround?.(cv.left + cv.width * fx, cv.top + 6);
            if (q && Number.isFinite(q.x)) top.push({ f: +fog(q.x, q.z).toFixed(3), d: +Math.hypot(q.x - p.x, q.z - p.z).toFixed(1) });
          }
          const yaw = c.cam.isoYaw ?? c.levels.current.camYaw ?? Math.PI, up = [-Math.sin(yaw), -Math.cos(yaw)];
          return { preset: c.env.presetName, her: +fog(p.x, p.z).toFixed(4), at8: +fog(p.x + up[0] * 8, p.z + up[1] * 8).toFixed(3), at12: +fog(p.x + up[0] * 12, p.z + up[1] * 12).toFixed(3),
            top, mode: c.env._focusMode, sky: c.env.sky?.mesh?.visible, skyline: c.levels.current.groups.skyline.visible, iso: c.cam.iso?.() };
        });
        t.log(`fog ${id}/${spawn} (${r.preset}): her ${r.her}, 8 m ${r.at8}, 12 m ${r.at12}, top ${JSON.stringify(r.top)}, dist ${r.iso?.dist?.toFixed?.(1)}`);
        t.assert(r.her < 0.03, `${id}: fog on her < 3 % (${r.her})`);
        t.assert(r.at8 < 0.12, `${id}: a foe 8 m up-screen reads (${r.at8} < 0.12)`);
        // §4.2 table: the fog 12 m up-screen per preset (the top screen edge sits ~10–13 m from her at 12.4 m)
        const at12 = { meadow_day: 0.18, forest_day: 0.24, forest_night: 0.26, town_occupied: 0.11, gate_dusk: 0.14, bog: 0.30, keep_storm: 0.19 }[r.preset];
        // TT3 K triage: forest_day and gate_dusk were lifted for readability after the §4.2 table (Env.js: the world:art
        // luma audit), so the table is a ceiling (never hazier than it, +0.06) with a floor that still reads as haze (≥ 30 %)
        if (at12 != null) {
          t.assert(r.at12 <= at12 + 0.06, `${id}: fog at 12 m ${r.at12} no denser than the §4.2 table ${at12} (+0.06)`);
          t.assert(r.at12 >= at12 * 0.3, `${id}: fog at 12 m ${r.at12} still reads as haze (≥ 30 % of the table ${at12})`);
          if (Math.abs(r.at12 - at12) > 0.06) t.log(`${id}: fog at 12 m ${r.at12} is lighter than the §4.2 table ${at12} (lifted preset)`);
        }
        const topC = r.top[0]?.f ?? null, topMax = Math.max(0, ...r.top.map((q) => q.f));
        if (topC != null) {
          t.assert(topMax <= 0.55, `${id}: the top edge is misty, not a wall (${topMax})`);
          if (topMax < 0.15 || topC > 0.30) t.warn(`${id}/${spawn}: top-edge fog ${topC} (corners ${topMax}) vs the §4.2 band 0.15–0.30 (at ${r.top[0].d} m)`);
        }
        if (r.mode > 0.5) t.assert(r.sky === false && r.skyline === false, `${id}: the far group is hidden in iso play (sky ${r.sky}, skyline ${r.skyline})`);
        await t.shot(pre + `fog-${id}-${spawn}`, { freeze: true });
      }
    },
  },
  {
    // §12 world 4: each zone from its hint (the hint is applied out of combat; yaw hints swing the camera), plus the
    // x-ray rate along the spine (props camera-side of the path fade, so she is rarely silhouetted)
    name: 'world:zone-shots', order: 46, level: null, timeout: 500000,
    async run(t) {
      const pre = shotDir(t);
      const DAY = { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true, 'meadow.mochi': true, 'meadow.done': true, 'forest.done': true, 'forest.boss': true };
      const extra = { town: { 'town.free': true }, gate: { 'gate.back': true } };
      for (const id of ['meadow', 'forest', 'town', 'gate']) {
        await t.G(() => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); });
        await freshAt(t, id, 'start', { ...DAY, ...(extra[id] ?? {}) });
        const zones = await t.G(() => (window.__GAME__.ctx.levels.current.def.zones ?? []).filter((z) => z.cam).map((z) => ({ id: z.id, at: z.at, cam: z.cam })));
        const STAND = { hub_view: [-28, -22], mushroom_climb: [-22.9, -57.1] };
        for (const z of zones) {
          await t.G(() => { const g = window.__GAME__; g.god(true); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
          // stand at the zone centre (on the ground beside a set piece: 1.5 m toward the camera side when it is a cap ring)
          const at = STAND[z.id] ?? z.at;
          await tp(t, at[0], at[1], Math.PI);
          await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
          await t.wait(2600);                                   // calm 2 s, then the 1.2 s blend
          const s = await t.G(() => { const c = window.__GAME__.ctx, L = c.levels.current; return { zone: L.camZone?.id ?? null, iso: c.cam.iso?.() }; });
          t.log(`${id}:${z.id} → zone ${s.zone}, iso yaw ${s.iso?.yaw?.toFixed?.(2)} pitch ${s.iso?.pitch?.toFixed?.(2)} dist ${s.iso?.dist?.toFixed?.(1)} (hint ${JSON.stringify(z.cam)})`);
          t.assert(s.zone === z.id, `${id}: the ${z.id} hint is in effect (${s.zone})`);
          if (Number.isFinite(z.cam.yaw) && s.iso && Math.abs(Math.atan2(Math.sin(s.iso.yaw - z.cam.yaw), Math.cos(s.iso.yaw - z.cam.yaw))) > 0.15) t.warn(`${id}:${z.id}: camera yaw ${s.iso.yaw.toFixed(2)} ≠ hint ${z.cam.yaw}`);
          if (Number.isFinite(z.cam.dist) && s.iso && Math.abs(s.iso.dist - z.cam.dist) > 1.5) t.warn(`${id}:${z.id}: camera dist ${s.iso.dist.toFixed(1)} ≠ hint ${z.cam.dist} (camera may not honour dist hints yet)`);
          await t.shot(pre + `zone-${id}-${z.id}`, { freeze: true });
        }
        // x-ray along the spine: she stands on the path every ~12 m; count the stops where the camera silhouettes her
        const pts = await t.G(() => { const sp = window.__GAME__.ctx.levels.current.spine ?? [], out = [];
          for (let i = 0; i < sp.length - 1; i++) { const [ax, az] = sp[i], [bx, bz] = sp[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 12)); for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
          return out; });
        let xr = 0;
        for (const [x, z] of pts) {
          await tp(t, x, z, Math.PI);
          await t.frames(12);
          if (await t.G(() => !!window.__GAME__.ctx.cam._xrayOn)) xr++;
        }
        t.log(`${id}: x-ray at ${xr}/${pts.length} spine stops`);
        t.assert(xr <= Math.ceil(pts.length * 0.25), `${id}: she is rarely hidden on the spine (${xr}/${pts.length})`);
      }
    },
  },
  {
    // §11 / §12 world 2–3: the iso data in the running game: zone lookup, memeSpot, nav links (the fence lesson gate),
    // roof / crown / solid fade registration, the wheat trample, and a click on a Vigil Stone (the use order)
    name: 'world:iso-data', order: 47, level: 'meadow', spawn: 'start', timeout: 300000,
    async run(t) {
      const pre = shotDir(t);
      await fresh(t, 'start', { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true });
      await t.G(() => window.__GAME__.god(true));
      const m = await t.G(() => { const L = window.__GAME__.ctx.levels.current; return { meme: L.memeSpot, links: L.navLinks.length, yaw: L.camYaw, zone: L.zoneAt({ x: -20, z: -4 })?.id, it: L.interactables.slice(0, 3).map((i) => ({ id: i.id, kind: i.kind, r: i.r, pos: [i.pos.x, i.pos.z] })) }; });
      t.log('meadow iso data', JSON.stringify(m));
      // TT2 §10.3: two fence entries, the open barn-door hop link (x −14.5) and the gate line that never opens
      t.assert(m.meme?.at && m.links === 2 && Math.abs(m.yaw - Math.PI) < 1e-6 && /^stones/.test(m.zone ?? ''), `memeSpot, the fence links, yaw π, zoneAt (${m.zone})`);
      // the fence (TT2): a path near the barn door hops it there; away from the door no path hops the inner fence
      // (z −87, x −20…−2) except at the door (x −14.5 ± 1.2), whatever `tut.jump.done` says
      const crossX = (r) => { const out = []; const P = r?.points ?? []; for (let i = 1; i < P.length; i++) { const [ax, , az] = P[i - 1], [bx, , bz] = P[i]; if ((az + 87) * (bz + 87) < 0) { const x = ax + (bx - ax) * ((-87 - az) / (bz - az)); if (x > -20 && x < -2) out.push(+x.toFixed(2)); } } return out; };
      const navInfo = await t.G(() => { const n = window.__GAME__.ctx.physics.nav; return { authored: n?.authored?.length ?? null, gates: n?.gatesClosed ?? null }; });
      const paths = {};
      for (const done of [false, true]) {
        await t.G((v) => window.__GAME__.ctx.state.setFlag('tut.jump.done', v), done);
        paths[done ? 'after' : 'before'] = {
          door: crossX(await t.G(() => window.__GAME__.nav?.path?.(-14.5, -90, -14.5, -84) ?? null)),
          away: crossX(await t.G(() => window.__GAME__.nav?.path?.(-6, -90, -6, -84) ?? null)),
        };
      }
      t.log(`fence: nav ${JSON.stringify(navInfo)}, crossings ${JSON.stringify(paths)}`);
      if (navInfo.authored == null) t.warn('physics nav does not read level.navLinks yet (the fence gate is data only)');
      else for (const [k, v] of Object.entries(paths)) {
        t.assert(v.door.length >= 1 && v.door.every((x) => Math.abs(x + 14.5) < 1.2), `${k} the jump lesson: the barn-door path hops the fence there (${v.door})`);
        t.assert(v.away.every((x) => Math.abs(x + 14.5) < 1.2), `${k} the jump lesson: away from the door no automatic hop (${v.away})`);
      }
      // occluder registration from the level tags (camera's fader): crowns, solids (the clutter audit), roofs in town
      const occ = await t.G(() => { const f = window.__GAME__.ctx.cam._fader; return f ? { crowns: f.crownCount, solids: f.solidCount, roofs: f.roofCount } : null; });
      const clutter = await t.G(() => window.__GAME__.ctx.levels.current.audit?.clutter ?? []);
      t.log(`meadow occluders ${JSON.stringify(occ)}; camera-side clutter tagged solid: ${clutter.length} ${JSON.stringify(clutter.slice(0, 6))}`);
      if (occ) t.assert(occ.crowns > 0, 'tree crowns registered');
      const crowns = await t.G(() => window.__GAME__.ctx.levels.current.trees.map((m) => `${m.name}:${m.userData.camFade}:${(m.userData.crownFrac ?? 0).toFixed(2)}`));
      t.log('tree crown fractions', crowns.join(', '));
      // the wheat trample: she flattens the stalks round her in the Crow Fields
      await tp(t, 12, 34, Math.PI);
      await t.frames(20);
      const tr = await t.G(() => { const w = window.__GAME__.ctx.levels.current.wheat; return w ? w.uniforms.uTrample.value.map((v) => +v.w) : null; });
      t.assert(tr && tr[0] === 1, `the trample slot follows her (${JSON.stringify(tr)})`);
      await t.shot(pre + 'iso-wheat-trample', { freeze: true });
      // desktop: a left click on Vigil Stone 2 walks her there and lights it (the use order through the real pick; TT3
      // §11.2: `hybrid` LMB uses a friend / object when no foe is alerted, RMB is the Stand)
      await t.loadLevel('meadow', 'start'); await t.frames(10);
      await tp(t, -8, 2, Math.PI);
      await t.clearEvents();
      await t.click(-12, 8, 'left');
      const lit = await t.waitForEvent('checkpoint', 12000);
      const sp = await t.G(() => window.__GAME__.ctx.state.spawnId);
      t.assert(lit && sp === 'vigil_2', `a click on the Vigil Stone lights it (${sp})`);
      await t.shot(pre + 'iso-click-vigil', { freeze: true });
      // town: roofs registered, a roof fades while she walks beside its house (roof-only: the walls stay)
      await freshAt(t, 'town', 'start', { 'prologue.done': true, 'meadow.done': true, 'forest.done': true, 'forest.boss': true, 'town.free': true });
      await t.G(() => window.__GAME__.god(true));
      const town = await t.G(() => { const c = window.__GAME__.ctx, f = c.cam._fader, ud = c.levels.current.batch.mesh.userData; return { roofs: f?.roofCount ?? null, roofIds: ud.camFadeRoofIds?.size ?? 0, solidIds: ud.camFadeSolidIds?.size ?? 0 }; });
      t.log('town occluders', JSON.stringify(town));
      t.assert(town.roofIds >= 27 && town.solidIds >= 10, `roof / solid instances tagged (${JSON.stringify(town)})`);
      if (town.roofs != null) t.assert(town.roofs >= 27, `camera registered the roofs (${town.roofs})`);
      await tp(t, -5.6, -41, Math.PI);
      await t.wait(900);
      const faded = await t.G(() => window.__GAME__.ctx.cam._fader?.fadedCount ?? null);
      t.log(`beside a house: ${faded} faded units`);
      await t.shot(pre + 'iso-town-roof-fade', { freeze: true });
      await tp(t, 0, 3.2, Math.PI);
      await t.frames(30);
      await t.shot(pre + 'iso-town-fountain', { freeze: true });
    },
  },
  {
    // §16: phone landscape + portrait (hasTouch, isMobile): the level reads from the iso camera, a tap on a Vigil Stone
    // lights it (tap → use order), and the zone hint applies on a phone too
    name: 'world:touch', order: 48, level: null, timeout: 900000,
    async run(t) {
      for (const [w, h] of [[844, 390], [390, 844]]) {
        const s = await phone(t, w, h, 'meadow', 'vigil_1', { 'meadow.cleared.stones': true });   // a calm ring: the hint is not held by a fight
        try {
          await s.G(() => { const g = window.__GAME__; g.god(true); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
          await s.frames(30);
          const v = await s.G(() => { const c = window.__GAME__.ctx; return { dev: c.input.device, iso: c.cam.iso?.(), vig: c.levels.current.vigils.map((x) => [x.id, x.pos?.x ?? x.at?.[0], x.pos?.z ?? x.at?.[1]]) }; });
          t.log(`${w}×${h}: device ${v.dev}, iso ${JSON.stringify(v.iso)}`);
          await s.shot(`world/touch-${w}x${h}-vigil1`);
          // tap Vigil Stone 2 from 3.4 m away (screen-left of her, clear of the HUD strip and the right-hand cluster): she walks there and lights it
          await s.G(() => { const g = window.__GAME__, p = g.ctx.player; p.teleport({ pos: new g.THREE.Vector3(-15, g.ctx.physics.heightAt(-15, 6.5), 6.5), facing: Math.PI }); });
          await s.frames(20);
          await s.G(() => window.__GAME__.clearEvents?.());
          const tap = await s.tapAt(-12, 8);
          let lit = false;
          for (let i = 0; i < 30 && !lit; i++) { await s.frames(15); lit = await s.G(() => window.__GAME__.ctx.state.spawnId === 'vigil_2'); }
          if (!lit) t.log(`${w}×${h}: after the tap ${JSON.stringify(await s.G(() => ({ order: window.__GAME__.orders?.(), pos: window.__GAME__.ctx.player.pos.toArray().map((v) => +v.toFixed(2)) })))}`);
          t.log(`${w}×${h}: tap at ${JSON.stringify(tap)}`);
          t.assert(!!tap, `${w}×${h}: the stone projects on screen (${JSON.stringify(tap)})`);
          t.assert(lit, `${w}×${h}: a tap on the Vigil Stone lights it`);
          await s.shot(`world/touch-${w}x${h}-vigil2`);
          // the Standing Stones hint on a phone (dist 15, clamped by the cat-size rule)
          await s.G(() => { const g = window.__GAME__, p = g.ctx.player; p.teleport({ pos: new g.THREE.Vector3(-20, g.ctx.physics.heightAt(-20, -9), -9), facing: Math.PI }); });
          await s.frames(200);                                         // 2 s calm + the 1.2 s blend (sim frames: the phone page may be slow)
          const z = await s.G(() => { const c = window.__GAME__.ctx; return { zone: c.levels.current.camZone?.id, iso: c.cam.iso?.() }; });
          t.log(`${w}×${h} stones: ${JSON.stringify(z)}`);
          t.assert(/^stones/.test(z.zone ?? ''), `${w}×${h}: the stones hint applies on a phone (${z.zone})`);
          if (z.iso) t.assert(z.iso.catPx >= 26, `${w}×${h}: she stays ≥ 26 px tall (${z.iso.catPx})`);
          await s.shot(`world/touch-${w}x${h}-stones`);
          t.assert(!s.errors.length, `${w}×${h}: no page errors (${s.errors.slice(0, 3).join(' | ')})`);
        } finally { await s.close(); }
      }
    },
  },
  {
    // CONTROLS_SPEC §5 click-to-move: a click on the Lantern Camp fire / the Square fountain walks to the ground beside
    // it (level navBlock discs), never hops into the stone ring or up onto the fountain rim / statue base
    name: 'world:nav-props', order: 96, level: null, timeout: 240000,
    async run(t) {
      const TOWN_FREE = { 'prologue.done': true, 'meadow.done': true, 'forest.done': true, 'forest.boss': true, 'town.marmalade': true, 'town.clover': true, 'town.free': true };
      const cases = [
        { level: 'forest', flags: { 'prologue.done': true, 'meadow.mochi': true, 'meadow.done': true, 'forest.sage': true, 'forest.camp': true }, from: [6, 34], click: [6, 40], centre: [6, 40], keep: 1.3, maxY: 0.35 },
        { level: 'town', flags: TOWN_FREE, from: [0, -2], click: [0, 8], centre: [0, 8], keep: 3.1, maxY: 0.35 },
        { level: 'town', flags: TOWN_FREE, from: [9, 8], click: [-9, 8], centre: [0, 8], keep: 3.1, maxY: 0.35, through: true },
      ];
      for (const c of cases) {
        await freshAt(t, c.level, 'start', c.flags);
        await t.G(() => { const g = window.__GAME__; g.story?.skip?.(); g.setMode?.('play'); });
        await tp(t, c.from[0], c.from[1], 0);
        const ground = await t.G(([x, z]) => window.__GAME__.ctx.physics.heightAt(x, z), c.click);
        const ok = await t.G(([x, z]) => window.__GAME__.ctx.player.orders.order('move', { x, z }, { source: 'api' }), c.click);
        const o = await t.G(() => window.__GAME__.orders());
        const hops = o.path.filter((q) => q[2]).length;
        t.log(`${c.level} click ${c.click}: ok ${ok} path ${o.path.length} pts, ${hops} links, partial ${o.partial}`);
        if (!ok) throw new Error(`${c.level}: the move order was rejected ${JSON.stringify(await t.G(() => { const g = window.__GAME__, p = g.ctx.player; return { mode: g.ctx.game?.mode, scripted: p.scripted, alive: p.alive, pos: p.pos.toArray(), nav: !!g.ctx.physics.nav }; }))}`);
        if (hops) throw new Error(`${c.level}: the path to ${c.click} uses ${hops} hop links`);
        for (const q of o.path) if (Math.hypot(q[0] - c.centre[0], q[1] - c.centre[1]) < c.keep - 0.05) throw new Error(`${c.level}: path point ${q[0].toFixed(2)},${q[1].toFixed(2)} inside the no-go disc`);
        let st;
        for (let i = 0; i < 60; i++) { await t.frames(10); st = await t.G(() => ({ o: window.__GAME__.orders(), pos: window.__GAME__.ctx.player.pos.toArray() })); if (!st.o.kind) break; }
        const [px, py, pz] = st.pos, d = Math.hypot(px - c.centre[0], pz - c.centre[1]);
        t.log(`${c.level}: stopped at ${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)} (r ${d.toFixed(2)}, ground ${ground.toFixed(2)}) order ${st.o.kind}`);
        if (py - ground > c.maxY && !c.through) throw new Error(`${c.level}: she ended ${(py - ground).toFixed(2)} m above the ground`);
        if (d < c.keep - 0.3) throw new Error(`${c.level}: she ended ${d.toFixed(2)} m from the centre`);
        if (c.through && px > -6) throw new Error(`${c.level}: she never got round the fountain (x ${px.toFixed(2)})`);
        await t.shot(`${shotDir(t)}nav-props-${c.level}-${c.through ? 'round' : 'centre'}`);
      }
    },
  },
  {
    // world.W5 / WA §10 (ART G1–G5): every day level is bright in iso play (mean luma ≥ 0.48, actors excluded); PERF
    // W7 flames cost 2 draws per level; AUTOCAM §9.3 farKeep landmarks and the ART G6 shadow probe are present
    name: 'world:art', order: 49, level: null, timeout: 400000,
    async run(t) {
      const pre = shotDir(t);
      const rows = [
        { level: 'meadow', spawn: 'start', flags: { 'prologue.done': true } },
        { level: 'forest', spawn: 'start', flags: { 'prologue.done': true, 'meadow.done': true } },
        { level: 'town', spawn: 'square', flags: { 'prologue.done': true, 'meadow.done': true, 'forest.done': true, 'town.free': true } },
        { level: 'gate', spawn: 'start', flags: { 'prologue.done': true, 'town.free': true, 'town.done': true } },
      ];
      for (const r of rows) {
        await freshAt(t, r.level, r.spawn, r.flags);
        await t.G(() => { const g = window.__GAME__; g.story?.skip?.(); g.skipDialog?.(); g.setMode?.('play'); g.god(true); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
        await t.frames(40);
        const s = await t.G(() => {
          const g = window.__GAME__, L = g.ctx.levels.current, st = g.art?.frameStats?.({ exclude: 'actors' }) ?? null;
          return { st, preset: g.ctx.env.presetName, flames: L.flames?.items?.length ?? 0, flameDraws: L.flames?.draws ?? 0, farKeep: L.farKeep?.length ?? 0,
            probe: L.art?.shadowProbe ?? null, ratio: g.art?.shadowRatio?.() ?? null, calls: g.ctx.renderer.info.render.calls };
        });
        const luma = s.st?.luma ?? NaN;
        if (!(luma >= 0.48)) t.log('  diag', JSON.stringify(await t.G(() => { const g = window.__GAME__, el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
          return { top: el ? `${el.tagName}#${el.id}.${el.className}` : null, mode: g.ctx.game?.mode, loading: g.ctx.levels.loading, cam: g.ctx.cam?.modeName ?? g.ctx.cam?.mode?.name ?? null,
            camPos: g.ctx.camera.position.toArray().map((v) => +v.toFixed(1)), pl: g.ctx.player.pos.toArray().map((v) => +v.toFixed(1)), story: g.story?.active ?? g.ctx.story?.active ?? null }; })));
        t.log(`${r.level} (${s.preset}): luma ${luma.toFixed(3)} dark ${((s.st?.dark ?? 0) * 100).toFixed(1)}% calls ${s.calls} flames ${s.flames} → ${s.flameDraws} draws, farKeep ${s.farKeep}, probe ${JSON.stringify(s.probe)} ratio ${JSON.stringify(s.ratio)}`);
        await t.shot(pre + 'art-' + r.level);
        t.assert(luma >= 0.48, `${r.level}: mean luma ${luma.toFixed(3)} ≥ 0.48`);
        t.assert(s.flameDraws <= 2, `${r.level}: flames are ≤ 2 draws (${s.flameDraws})`);
        if (r.level === 'town' || r.level === 'gate') t.assert(s.farKeep > 0, `${r.level}: farKeep landmarks`);
      }
      await t.loadLevel('meadow', 'start');
    },
  },
];
