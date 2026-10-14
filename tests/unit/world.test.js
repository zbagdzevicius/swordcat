// tests/unit/world.test.js  (owner: world) — pure-module tests for src/world: Env fog maths and presets, Objectives,
// the Arena template, Level water / surface / triggers, Terrain carving, VigilStone checkpoints, Pickups, the level
// definitions (U12 for the M1 scope: meadow complete, the other five bootable), the manifest sync, and a full
// headless build of the meadow with stub GLBs (zones → arenas, vigils, triggers, spawns, anchors, colliders).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fxFogged } from '../../src/fx/shaders.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { E } from '../../src/core/events.js';
import { ENEMIES, BOSSES, KITTENS_BY_LEVEL, KITTEN_IDS, LEVEL_IDS, ATTACKS } from '../../src/core/config.js';
import { ENV_PRESETS, finalFog, toState, resolvePreset } from '../../src/world/Env.js';
import { Objectives } from '../../src/world/Objectives.js';
import { Arena, arenaRingPoints, ARENA, arenaFlag } from '../../src/world/Arena.js';
import { Level, condOk, waterEntryLevel, colliderList, levelRun, endLevelRun, arenaAwareFog, ARENA_MIST } from '../../src/world/Level.js';
import { Terrain, polylineDistanceGrid } from '../../src/world/Terrain.js';
import { VigilStone } from '../../src/world/VigilStone.js';
import { Pickups, placedFishFlag } from '../../src/world/Pickups.js';
import { PropActor, SwingingSack, WobbleKnight, WOBBLE_REACH, plainAttribute } from '../../src/world/PropActor.js';
import { defineLevel, buildLevel, levelModelPaths, procTemplate, openZoneFlag, OPEN_ZONE } from '../../src/world/LevelKit.js';
import { makeBladeGeometry } from '../../src/world/Grass.js';
import { makeWheatClumpGeometry, WheatField } from '../../src/world/Wheat.js';
import { LEVELS, rankFor, LevelManager, levelEnemyTypes } from '../../src/world/LevelManager.js';
import { distToPolyline, fbm, fbmP, smoothPolyline, pointAlong, polylineLength } from '../../src/world/noise.js';
import manifest, { levels as manifestLevels } from '../../src/world/assets.manifest.js';
import { LINE_RULES, COUNTERS } from '../../src/world/Objectives.js';
import { STATIONS, stationOpen, nextLevel, questBoard, HUB_KITTEN_SPOTS, SOUTH_GATE_EXIT } from '../../src/world/Hub.js';
import { paveGeometry, worldBoxesGeometry, LightPool } from '../../src/world/Dressing.js';
import { LampSet } from '../../src/world/Env.js';
import { LINE } from '../../src/core/config.js';
import forestDef, { MUSHROOM_CAPS, CAP_R, STUMPS, STUMP, MILL_PILLARS, TREETOP } from '../../src/world/levels/forest.js';
import townDef, { LANTERNS, BALCONY, CRATE_STEPS, SQUARE, TOWER, CHASE } from '../../src/world/levels/town.js';
import gateDef, { GATE, gateShape, PARAPETS } from '../../src/world/levels/gate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const loadDef = async (id) => (await LEVELS[id]()).default;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** Bus spy: every emitted (name, payload). */
function spy(ctx) {
  const seen = [];
  ctx.bus.tap?.((type, payload) => seen.push([type, payload]));
  return { seen, count: (t) => seen.filter(([n]) => n === t).length, last: (t) => [...seen].reverse().find(([n]) => n === t)?.[1] };
}

/** A fake enemies service: spawn() returns live dummies; kill() clears them. */
function fakeEnemies() {
  const svc = { list: [], spawned: [], spawn(type, pos, opts) { const e = { type, pos: pos.clone(), opts, alive: true, tags: new Set(), vel: new THREE.Vector3() }; this.list.push(e); this.spawned.push(e); return e; },
    despawn(e) { e.alive = false; this.list.splice(this.list.indexOf(e), 1); }, killAll() { for (const e of [...this.list]) this.despawn(e); } };
  return svc;
}

// ---------------------------------------------------------------------------------------------- Env
test('Env: §12.2 fog = (base × story) + Σ adds, × muls, fogSet override, clamped 0.005–0.12', () => {
  assert.ok(near(finalFog(0.045, []), 0.045));
  assert.ok(near(finalFog(0.045, [{ fogAdd: 0.01 }, { fogAdd: 0.01 }]), 0.065));            // two jeer auras
  assert.ok(near(finalFog(0.04, [{ fogAdd: -0.005 }, { fogAdd: -0.005 }, { fogAdd: -0.005 }]), 0.025));   // 3 town lanterns
  assert.ok(near(finalFog(0.05, [{ fogMul: 0.5 }]), 0.025));                                 // Golden Hour
  assert.ok(near(finalFog(0.05, [{ fogSet: 0.09 }]), 0.09));                                 // Cacklejaw P3 override
  assert.ok(near(finalFog(0.05, [{ fogSet: 0.09 }, { fogMul: 0.5 }]), 0.045));
  assert.equal(finalFog(0.5, []), 0.12);
  assert.equal(finalFog(0.001, []), 0.005);
});

test('Env: every preset exists with the ART §2.5 / WA §2.3 warm values (aliases resolve)', () => {
  const need = ['meadow_day', 'meadow_morning', 'meadow_evening', 'meadow_giggle', 'meadow_night', 'forest_day', 'forest_twilight', 'forest_night', 'town_occupied',
    'hub_gold', 'hub_hush', 'hub_grey', 'ending_gold', 'gate_dusk', 'bog', 'bog_dusk', 'keep_twilight', 'keep_storm', 'keep_cellar', 'sky_night', 'sky_sunrise'];
  for (const n of need) assert.ok(ENV_PRESETS[n], `preset ${n}`);
  const d = ENV_PRESETS.meadow_day;
  assert.equal(d.fogColor, '#F6E4C0'); assert.equal(d.fogDensity, 0.045); assert.equal(d.skyTop, '#8FCBF2');
  assert.equal(d.hemiSky, '#C4D9FF'); assert.equal(d.hemiGround, '#C9A46A'); assert.equal(d.sunColor, '#FFE7C2'); assert.equal(d.sun, 2.4);
  assert.deepEqual([d.shadowI, d.exposure, d.rim, d.hero], [0.60, 0.95, 'day', 0.40]);   // integrator art:warm: exposure 1.00 → 0.95 (luma band top)
  assert.equal(ENV_PRESETS.meadow_night.fogColor, '#5A64A8'); assert.equal(ENV_PRESETS.meadow_night.grade, 'night');
  assert.equal(ENV_PRESETS.meadow_evening.fogDensity, 0.020);
  assert.equal(ENV_PRESETS.bog.fogFalloff, 1.2);
  assert.equal(ENV_PRESETS.hub_grey, ENV_PRESETS.hub_hush, 'hub_grey → hub_hush');
  assert.equal(ENV_PRESETS.forest_night, ENV_PRESETS.forest_twilight, 'forest_night → forest_twilight');
  assert.equal(resolvePreset('hub_grey'), 'hub_hush'); assert.equal(resolvePreset('forest_night'), 'forest_twilight'); assert.equal(resolvePreset('gate_dusk'), 'gate_dusk');
  assert.ok(!Object.keys(ENV_PRESETS).includes('hub_grey'), 'aliases are not listed as their own rows');
  assert.equal(ENV_PRESETS.ending_gold.grade, 'gold');
  // X16 / D13 gameplay densities: keep 0.042, bog 0.058
  assert.equal(ENV_PRESETS.keep_twilight.fogDensity, 0.042); assert.equal(ENV_PRESETS.bog_dusk.fogDensity, 0.058);
  const s = toState(d);
  assert.ok(s.fogColor.isColor && s.rim.isColor && near(s.fogDensity, 0.045));
});

test('Env: contributions and presets tween, env:changed is emitted', async () => {
  const ctx = fakeCtx();
  const env = ctx.env, bus = spy(ctx);
  env.preset('meadow_day', 0);
  env.contribute('jeer:1', { fogAdd: 0.01 });
  for (let i = 0; i < 120; i++) env.update(1 / 60);
  assert.ok(near(env.fogDensity, 0.055, 1e-4), `fog ${env.fogDensity}`);
  env.clear('jeer:1');
  for (let i = 0; i < 120; i++) env.update(1 / 60);
  assert.ok(near(env.fogDensity, 0.045, 1e-4));
  env.preset('meadow_night', 2);
  for (let i = 0; i < 60; i++) env.update(1 / 60);
  assert.ok(env.fogDensity > 0.045 && env.fogDensity < 0.05, 'half way');
  for (let i = 0; i < 90; i++) env.update(1 / 60);
  assert.ok(near(env.fogDensity, 0.05, 1e-4));
  assert.equal(env.grade, 'night');
  assert.ok(bus.count(E.ENV_CHANGED) >= 3);
  env.set({ wind: 3.0 }, 0);
  assert.equal(env.wind, 3.0);
});

// ---------------------------------------------------------------------------------------------- Objectives
test('Objectives: start / add / freeze / complete emit objective:progress; needClear waits for the arena', async () => {
  const ctx = fakeCtx({ systems: false });
  const ob = new Objectives(ctx); await ob.init();
  const bus = spy(ctx);
  ob.start('net_ropes', { max: 3, textKey: 'obj.ropes', needClear: 'glade' });
  ob.add('net_ropes'); ob.add('net_ropes');
  assert.equal(ob.progress('net_ropes'), 2);
  ob.freeze('net_ropes', true); ob.add('net_ropes');
  assert.equal(ob.progress('net_ropes'), 2, 'frozen');
  ob.freeze('net_ropes', false); ob.add('net_ropes');
  assert.equal(ob.progress('net_ropes'), 3);
  assert.equal(ob.get('net_ropes').done, false, 'waits for the glade to clear');
  ctx.bus.emit(E.ARENA_CLEAR, { id: 'glade' });
  assert.equal(ob.get('net_ropes').done, true);
  const last = bus.last(E.OBJECTIVE);
  assert.deepEqual({ id: last.id, value: last.value, max: last.max, done: last.done, textKey: last.textKey }, { id: 'net_ropes', value: 3, max: 3, done: true, textKey: 'obj.ropes' });
  assert.equal(ob.progress('nope'), 0);
  ctx.bus.emit(E.LEVEL_UNLOAD, { id: 'meadow' });
  assert.equal(ob.get('net_ropes'), null);
});

test('Objectives: rate-driven progress (The Line 100/240 per s), throttled events, pause by freeze', async () => {
  const ctx = fakeCtx({ systems: false });
  const ob = new Objectives(ctx); await ob.init();
  const bus = spy(ctx);
  ob.start('line', { max: 100, rate: 100 / 240 });
  for (let i = 0; i < 60 * 12; i++) ob.update(1 / 60);
  assert.ok(near(ob.progress('line'), 5, 1e-3), `12 s → 5% (${ob.progress('line')})`);
  ob.freeze('line', true);
  for (let i = 0; i < 600; i++) ob.update(1 / 60);
  assert.ok(near(ob.progress('line'), 5, 1e-3), 'paused while frozen');
  const n = bus.count(E.OBJECTIVE);
  assert.ok(n < 60, `throttled (${n} events)`);
  ob.freeze('line', false);
  ob.set('line', 99.99);
  for (let i = 0; i < 10; i++) ob.update(1 / 60);
  assert.equal(ob.get('line').done, true);
});

// ---------------------------------------------------------------------------------------------- Arena
test('Arena: §12.1 ring points (r − 1.5 at 60° steps; rectangles: corners + long-side midpoints, inset 1.5)', () => {
  const pts = arenaRingPoints({ at: [10, 20], r: 12 });
  assert.equal(pts.length, 6);
  for (const [x, z] of pts) assert.ok(near(Math.hypot(x - 10, z - 20), 12 - ARENA.ringInset, 1e-9));
  const rect = arenaRingPoints({ at: [0, -25], size: [40, 30] });
  assert.deepEqual(rect.map(([x, z]) => [x, z + 25]), [[-18.5, -13.5], [18.5, -13.5], [18.5, 13.5], [-18.5, 13.5], [0, -13.5], [0, 13.5]]);
});

test('Arena: lock → waves at the 3 farthest points, next wave 1.5 s after alive ≤ 1, clear, reset on death', async () => {
  const ctx = fakeCtx();
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  ctx.player = { pos: new THREE.Vector3(0, 0, -11), alive: true, vel: new THREE.Vector3(), teleport() {} };
  const bus = spy(ctx);
  const a = new Arena(ctx, { id: 'stones', at: [0, 0], r: 12, waves: [[['rat_pike', 3]], [['rat_pike', 3], ['rat_xbow', 1]]] }, () => 0, null);
  assert.equal(a.canAutoLock(), true);
  assert.ok(a.contains(new THREE.Vector3(0, 0, -9.9), 2) && !a.contains(new THREE.Vector3(0, 0, -10.1), 2), 'trigger disc r − 2');
  a.lock();
  assert.equal(bus.count(E.ARENA_LOCK), 1);
  // IMPLEMENTATION_PLAN §7.1: the lock carries { center, r } for the camera's room read; wave 1 waits >= 1.2 s
  const lk = bus.last(E.ARENA_LOCK);
  assert.ok(lk.center?.isVector3 && near(lk.center.x, 0) && lk.r === 12);
  assert.equal(enemies.list.length, 0, 'the room read first');
  for (let i = 0; i < 70; i++) a.update(1 / 60);
  assert.equal(enemies.list.length, 0, 'not before 1.2 s');
  for (let i = 0; i < 4; i++) a.update(1 / 60);
  assert.equal(enemies.list.length, 3);
  for (const e of enemies.list) assert.ok(e.pos.z > 0, 'spawned on the far side from her');
  enemies.despawn(enemies.list[0]); enemies.despawn(enemies.list[0]);       // 1 alive → wave 2 after 1.5 s
  for (let i = 0; i < 80; i++) a.update(1 / 60);
  assert.equal(a.wave, 1, 'not before 1.5 s');
  for (let i = 0; i < 20; i++) a.update(1 / 60);
  assert.equal(a.wave, 2);
  assert.equal(enemies.list.length, 5);
  assert.deepEqual(bus.last(E.ARENA_WAVE), { id: 'stones', wave: 2, total: 2 });
  // death inside → wave 1 again, enemies gone, re-entering locks again
  a.reset();
  assert.equal(a.wave, 0); assert.equal(a.locked, false); assert.equal(enemies.list.length, 0);
  a.lock({ now: true }); enemies.killAll();
  for (let i = 0; i < 100; i++) a.update(1 / 60);
  enemies.killAll();
  for (let i = 0; i < 100; i++) a.update(1 / 60);
  assert.equal(a.cleared, true);
  assert.equal(bus.count(E.ARENA_CLEAR), 1);
});

test('Arena: lockOn cutscene arenas lock when the cutscene ends; boss arenas keep the boss on reset', async () => {
  const ctx = fakeCtx();
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  ctx.player = { pos: new THREE.Vector3(30, 0, 0), alive: true, vel: new THREE.Vector3(), teleport({ pos }) { this.pos.copy(pos); } };
  const glade = new Arena(ctx, { id: 'glade', at: [0, 0], r: 14, lockOn: 'cs03:end', waves: [[['rat_pike', 4]]] }, () => 0, null);
  assert.equal(glade.canAutoLock(), false);
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs02' });
  assert.equal(glade.locked, false);
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs03' });
  assert.equal(glade.locked, true);
  assert.ok(glade.contains(ctx.player.pos, 0.5), 'pulled inside the wall');
  const boss = new Arena(ctx, { id: 'mill', at: [100, 0], r: 12, boss: 'boss_grizzlechop' }, () => 0, null);
  boss.lock();
  assert.equal(enemies.list.filter((e) => e.type === 'boss_grizzlechop').length, 1);
  boss.reset();
  assert.equal(boss.locked, false);
  boss.lock();
  assert.equal(enemies.spawned.filter((e) => e.type === 'boss_grizzlechop').length, 1, 'the same boss is kept');
  glade.dispose(); boss.dispose();
});

test('Arena: teleported far out of a locked fight resets it; a forced pull-in skips deep water (core)', async () => {
  const ctx = fakeCtx();
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  ctx.player = { pos: new THREE.Vector3(0, 0, -11), alive: true, vel: new THREE.Vector3(), teleport({ pos }) { this.pos.copy(pos); } };
  const a = new Arena(ctx, { id: 'bridge', at: [0, 0], r: 12, waves: [[['rat_pike', 3]]] }, () => 0, null);
  a.lock();
  ctx.player.pos.set(0, 0, -12.5); a.update(1 / 60);
  assert.equal(a.locked, true, 'a step past the edge is kept inside');
  assert.ok(Math.hypot(ctx.player.pos.x, ctx.player.pos.z) <= 12.2 + 1e-6);
  ctx.player.pos.set(0, 0, -60); a.update(1 / 60);
  assert.equal(a.locked, false, 'a teleport far away leaves the fight');
  assert.equal(a.wave, 0); assert.equal(enemies.list.length, 0);
  assert.equal(ctx.player.pos.z, -60, 'she is not dragged back');
  // the nearest edge is in a stream: the pull-in walks toward the centre to dry ground
  const level = { isDeepWater: (x, z) => z < -5 && z > -20, bounds: null, colliders: { circles: [] } };
  const b = new Arena(ctx, { id: 'b2', at: [0, 0], r: 12, waves: [[['rat_pike', 1]]] }, () => 0, level);
  ctx.player.pos.set(0, 0, -30);
  b.lock();
  assert.ok(!level.isDeepWater(ctx.player.pos.x, ctx.player.pos.z), `pulled onto dry ground (${ctx.player.pos.toArray()})`);
  a.dispose(); b.dispose();
});

// ---------------------------------------------------------------------------------------------- Level helpers
test('Level: water entries, deep water (bridge decks are dry), colliderList, conditions', () => {
  const ctx = fakeCtx({ systems: false });
  ctx.state.setFlag('prologue.done', true);
  assert.equal(condOk(ctx, 'prologue.done'), true);
  assert.equal(condOk(ctx, '!prologue.done'), false);
  assert.equal(condOk(ctx, (s) => s.getFlag('prologue.done') === true), true);
  assert.equal(condOk(ctx, undefined), true);
  const stream = { kind: 'stream', from: [-100, 62], to: [100, 62], width: 8, y: -0.4, deep: true };
  assert.equal(waterEntryLevel(stream, 30, 65), -0.4);
  assert.equal(waterEntryLevel(stream, 30, 67), null);
  assert.equal(waterEntryLevel({ kind: 'rect', at: [0, 0], size: [4, 4], y: 1 }, 1, 1), 1);
  assert.equal(waterEntryLevel({ kind: 'disc', at: [0, 0], r: 2, y: 0.2 }, 3, 0), null);
  const L = new Level(ctx, { id: 't', size: 200, water: [stream], spine: [[0, -50], [0, 50]], pathWidth: 6 });
  L.heightfield = { heightAt: () => -1.5 };
  assert.equal(L.isDeepWater(30, 62), true);
  assert.equal(L.isDeepWater(30, 62, 0.32), false, 'standing on the bridge deck');
  assert.equal(L.surfaceAt(30, 62), 'water');
  L.heightfield = { heightAt: () => 0 };
  assert.equal(L.surfaceAt(1, 10), 'dirt');
  assert.equal(L.surfaceAt(20, 10), 'grass');
  assert.equal(colliderList({ x: 0, z: 0, r: 1 }), 'circles');
  assert.equal(colliderList({ x: 0, z: 0, r: 13, kind: 'ring' }), 'rings');
  assert.equal(colliderList({ ax: 0, az: 0, bx: 1, bz: 1 }), 'segments');
  assert.equal(colliderList({ x: 0, z: 0, hx: 1, hz: 2, yaw: 0.3 }), 'boxes');
  assert.equal(rankFor(0), 'pawsome'); assert.equal(rankFor(1), 'pawsome'); assert.equal(rankFor(2), 'purrfect'); assert.equal(rankFor(4), 'purrfect'); assert.equal(rankFor(5), 'mewtiful');
});

test('Level: triggers fire once on entry when their condition holds; interact prompts and use()', () => {
  const ctx = fakeCtx({ systems: false });
  const L = new Level(ctx, { id: 't', size: 100, spine: [] });
  L.heightfield = { heightAt: () => 0 };
  const p = { pos: new THREE.Vector3(50, 0, 50), alive: true };
  ctx.player = p;
  let fired = 0;
  L.triggers.push({ id: 'lane', at: [0, 0], r: 3, when: 'prologue.tutorial', once: true, fired: false, inside: false, fire: () => fired++ });
  L.update(1 / 60);
  p.pos.set(0, 0, 1); L.update(1 / 60);
  assert.equal(fired, 0, 'condition false');
  p.pos.set(50, 0, 50); L.update(1 / 60);
  ctx.state.setFlag('prologue.tutorial', true);
  p.pos.set(0, 0, 1); L.update(1 / 60);
  assert.equal(fired, 1);
  p.pos.set(50, 0, 50); L.update(1 / 60); p.pos.set(0, 0, 1); L.update(1 / 60);
  assert.equal(fired, 1, 'once');
  const bus = spy(ctx);
  let used = 0;
  L.interactables.push({ id: 'picnic', kind: 'interact', pos: new THREE.Vector3(10, 0, 10), r: 1.8, prompt: 'prompt.picnic', use: () => used++ });
  p.pos.set(10.5, 0, 10); L.update(1 / 60);
  assert.equal(bus.last(E.INTERACT_AVAILABLE)?.target.id, 'picnic');
  assert.equal(L.interact('picnic'), true);
  assert.equal(used, 1);
  p.pos.set(30, 0, 30); L.update(1 / 60);
  assert.equal(bus.count(E.INTERACT_CLEAR), 1);
});

// ---------------------------------------------------------------------------------------------- Terrain
test('Terrain: distance grids match polyline distances; spine carved to the path height; arena flats; stream bed', () => {
  const spine = [[0, -18], [4, 0], [-2, 18]];
  const g = polylineDistanceGrid(spine, 40, 40, 6);
  for (const [x, z] of [[0, 0], [3, -5], [-10, 12], [8, 8]]) {
    const i = (z + 20) * 41 + (x + 20);
    assert.ok(near(g[i], Math.min(6, distToPolyline(x, z, spine)), 1e-4), `grid ${x},${z}`);
  }
  const def = { id: 'meadow', size: 60, res: 60, seed: 3, hills: { amp: 3 }, pathWidth: 6, spine: [[0, -25], [0, 25]],
    water: [{ kind: 'stream', from: [-30, 15], to: [30, 15], width: 6, y: -0.4, deep: true }] };
  const T = new Terrain(def, { flats: [{ x: -15, z: -10, r: 5 }] });
  T.build();
  for (const z of [-20, -10, 0]) assert.ok(near(T.heightAt(0, z), T.pathHeight(0, z), 0.05), `path at z ${z}`);
  const fh = T.pathHeight(-15, -10);
  for (const [x, z] of [[-15, -10], [-12, -8], [-18, -12]]) assert.ok(near(T.heightAt(x, z), fh, 0.05), 'flat disc');
  assert.ok(T.heightAt(-20, 15) < -1.2, `stream bed ${T.heightAt(-20, 15)}`);
  assert.ok(T.densityAt(-20, 15) < 0.05, 'no grass in the water');
  assert.ok(T.densityAt(0, -5) < 0.3 && T.densityAt(-12, -20) > 0.5, 'sparse on the lane, full in the field');
  const out = T.finalize();
  assert.equal(out.mesh.geometry.attributes.position.count, 61 * 61);
  assert.equal(out.dataTexture.image.width, 61);
});

test('noise helpers: fbm / fbmP agree, Catmull-Rom smoothing keeps the endpoints, pointAlong walks the polyline', () => {
  for (const [x, z] of [[1.2, 3.4], [-40, 12]]) assert.ok(near(fbm(x, z, { freq: 0.02, octaves: 3, seed: 7 }), fbmP(x, z, 0.02, 3, 7), 1e-12));
  const s = smoothPolyline([[0, 0], [10, 0], [10, 10]], 2);
  assert.deepEqual(s[0], [0, 0]); assert.deepEqual(s.at(-1), [10, 10]);
  assert.ok(near(polylineLength([[0, 0], [3, 4]]), 5));
  const [x, z, yaw] = pointAlong([[0, 0], [0, 10], [10, 10]], 15);
  assert.ok(near(x, 5) && near(z, 10) && near(yaw, Math.PI / 2));
});

// ---------------------------------------------------------------------------------------------- VigilStone + Pickups
test('VigilStone: E lights it, emits checkpoint {levelId, spawnId, position, facing}, one lit stone per level', () => {
  const ctx = fakeCtx({ systems: false });
  const bus = spy(ctx);
  const level = { id: 'meadow', vigils: [], groups: { props: new THREE.Group() } };
  const v1 = new VigilStone(ctx, level, { id: 'vigil_1', at: [-16, -36], facing: 0, heightAt: () => 0.5 });
  const v2 = new VigilStone(ctx, level, { id: 'vigil_2', at: [-12, 8], facing: Math.PI, heightAt: () => 0 });
  level.vigils.push(v1, v2);
  v1.interactable.use();
  const cp = bus.last(E.CHECKPOINT);
  assert.equal(cp.levelId, 'meadow'); assert.equal(cp.spawnId, 'vigil_1');
  assert.ok(near(cp.position.z, -36 + 1.4) && near(cp.position.y, 0.5), 'stands 1.4 m in front of the stone');
  assert.equal(ctx.state.spawnId, 'vigil_1');
  v2.activate();
  assert.equal(v1.lit, false); assert.equal(v2.lit, true);
  assert.ok(near(v2.spawn.pos.z, 8 - 1.4, 1e-9) && near(v2.spawn.facing, Math.PI));
  v1.dispose(); v2.dispose();
});

test('Pickups: enemy:died drops exactly the rolled fish / small heart (enemies roll them); boss rows drop gold fish', () => {
  const ctx = fakeCtx({ systems: false });
  ctx.player = null;
  const pk = new Pickups(ctx, { heightAt: () => 0, levelId: 'meadow', root: new THREE.Group() });
  const at = new THREE.Vector3(5, 0, 5);
  ctx.bus.emit(E.ENEMY_DIED, { enemy: { def: { id: 'rat_pike', fish: [2, 3] } }, type: 'rat_pike', position: at, fish: 3, smallHeart: true });
  assert.equal(pk.count('fish'), 3); assert.equal(pk.count('heart'), 1);
  ctx.bus.emit(E.ENEMY_DIED, { enemy: { def: { id: 'crow', fish: [2, 2] } }, type: 'crow', position: at, fish: 0, smallHeart: false });
  assert.equal(pk.count('fish'), 3); assert.equal(pk.count('heart'), 1);
  ctx.bus.emit(E.ENEMY_DIED, { enemy: { def: { id: 'boss_grizzlechop', fish: 100, boss: true } }, type: 'boss_grizzlechop', position: at, fish: 100, smallHeart: false });
  const gold = pk.items.filter((i) => i.alive && i.kind === 'fish' && i.gold);
  assert.equal(gold.length, 10); assert.ok(gold.every((g) => g.value === 10));
  pk.dispose();
});

test('PropActor: hit-sound materials per kind; the tutorial swingers keep their attack row off def (audio reads def.id)', () => {
  const ctx = fakeCtx({ systems: false });
  const dummy = new PropActor(ctx, { kind: 'dummy' }), crate = new PropActor(ctx, { kind: 'crate' }), rock = new PropActor(ctx, { kind: 'boulder', breaks: 'cracked' });
  assert.deepEqual([dummy.material, crate.material, rock.material], ['straw', 'wood', 'stone']);
  assert.ok(dummy.tags.has('prop') && dummy.tags.has('dummy') && dummy.breakable && dummy.faction === 'neutral');
  assert.equal(rock.resolveIncoming({ faction: 'player' }, { breaks: [] }), 'block');
  assert.equal(rock.resolveIncoming({ faction: 'player' }, { breaks: ['cracked'] }), 'hit');
  assert.equal(rock.resolveIncoming({ faction: 'enemy' }, { breaks: ['cracked'] }), 'immune', 'player hits only');
  const wk = new WobbleKnight(ctx, { id: 'wobble_knight', pos: new THREE.Vector3(), mesh: null });
  assert.equal(wk.def, undefined); assert.equal(wk.atk, ATTACKS.dummy_swing); assert.equal(wk.material, 'armour');
  const sack = new SwingingSack(ctx, { id: 'sack', pivot: new THREE.Vector3(0, 2.6, 0) });
  assert.equal(sack.atk, ATTACKS.sack_swing); assert.equal(sack.hurtable, false);
});

test('PropActor: interleaved (meshopt) attributes are copied plainly', () => {
  const ib = new THREE.InterleavedBuffer(new Float32Array([0, 1, 2, 9, 3, 4, 5, 9]), 4);
  const a = new THREE.InterleavedBufferAttribute(ib, 3, 0);
  const p = plainAttribute(a);
  assert.ok(!p.isInterleavedBufferAttribute);
  assert.deepEqual([...p.array], [0, 1, 2, 3, 4, 5]);
});

test('Pickups: fish magnet + collect, letters / Heart Bells update the save state once', () => {
  const ctx = fakeCtx({ systems: false });
  const bus = spy(ctx);
  ctx.player = { pos: new THREE.Vector3(0, 0, 0), alive: true, radius: 0.32, hp: 6, maxHp: 8, milk: 1, milkMax: 2, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } };
  const root = new THREE.Group();
  const pk = new Pickups(ctx, { heightAt: () => 0, levelId: 'meadow', root });
  pk.fishLine([1, 0], [1.6, 0], 3);
  assert.equal(pk.count('fish'), 3);
  for (let i = 0; i < 90; i++) pk.update(1 / 60);
  assert.equal(pk.count('fish'), 0, 'magnetised and collected');
  assert.equal(ctx.state.fish, 3);
  pk.placeLetter('l1', 0.2, 0);
  pk.update(1 / 60);
  assert.deepEqual(ctx.state.letters, ['l1']);
  assert.equal(pk.placeLetter('l1', 0.2, 0), null, 'collected letters never respawn');
  pk.placeHeartBell('hb1', 0.3, 0);
  pk.update(1 / 60);
  assert.equal(ctx.player.maxHp, 10);
  assert.ok(bus.seen.some(([t, p]) => t === E.ITEM_PICKUP && p.item === 'heartBell'));
  pk.dispose();
});

// ---------------------------------------------------------------------------------------------- level definitions (U12, M1 scope)
const VALID_TYPE = (t) => !!ENEMIES[t] || /^bonehead:(minion|warrior|rogue|mage)$/.test(t) || /^jelly(_[lms]|_giant)?$/.test(t) || (t.startsWith('boss_') && !!BOSSES[t.slice(5)]);
const CUTSCENES = new Set(['cs00', 'cs01', 'cs01b', 'tutbow', 'cs02', 'cs03', 'cs04', 'cs05', 'cs06', 'cs07', 'cs08', 'cs09', 'cs10', 'cs11', 'cs12', 'cs13', 'cs14', 'cs15', 'cs16',
  'd01', 'd02', 'd03', 'd04', 'd05', 'd06', 'g01', 'g02']);

test('U12 (M1): every level defines start, boss levels define boss; enemy types exist; positions in bounds; cutscene ids exist', async () => {
  for (const id of LEVEL_IDS) {
    const def = await loadDef(id);
    assert.equal(def.id, id);
    assert.equal(typeof def.build, 'function');
    assert.ok(def.spawns.start, `${id}: spawn start`);
    if (['forest', 'gate', 'bog', 'keep'].includes(id)) assert.ok(def.spawns.boss, `${id}: spawn boss`);
    const half = def.size / 2;
    const inside = ([x, z], m = 2) => Math.abs(x) <= half - m && Math.abs(z) <= half - m;
    for (const [k, s] of Object.entries(def.spawns)) assert.ok(inside(s), `${id}: spawn ${k} in bounds`);
    for (const z of def.zones) {
      assert.ok(inside(z.at, 1), `${id}: zone ${z.id} in bounds`);
      for (const [t, , at] of z.spawns ?? []) { assert.ok(VALID_TYPE(t), `${id}/${z.id}: enemy type ${t}`); if (at) assert.ok(inside(at), `${id}/${z.id}: spawn point`); }
      for (const w of z.waves ?? []) for (const [t] of w) assert.ok(VALID_TYPE(t), `${id}/${z.id}: wave type ${t}`);
      if (z.boss) assert.ok(VALID_TYPE(z.boss), `${id}: boss ${z.boss}`);
      for (const cs of [z.play, z.interact?.play, z.rescue?.play].filter(Boolean)) assert.ok(CUTSCENES.has(cs), `${id}/${z.id}: cutscene ${cs}`);
      if (z.kind === 'kitten') assert.ok(KITTENS_BY_LEVEL[id].includes(z.kittenId), `${id}: kitten ${z.kittenId} belongs to this level`);
      if (z.kind === 'exit') assert.ok(LEVEL_IDS.includes(z.to), `${id}: exit to ${z.to}`);
    }
    const letters = def.zones.filter((z) => z.kind === 'letter');
    assert.equal(letters.length, 1, `${id}: one Lost Letter`);
    const ids = def.zones.map((z) => z.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: unique zone ids`);
  }
});

test('U12 (meadow, complete in M1): §12.3 layout — 3 kittens + letter l1, practice field, triggers, arenas, Old Bridge, exit', async () => {
  const def = await loadDef('meadow');
  assert.deepEqual([def.size, def.res, def.seed, def.hills.amp, def.pathWidth], [200, 200, 11, 1.5, 6]);
  assert.deepEqual(def.spine, [[0, -80], [0, -62], [-6, -50], [-22, -30], [-20, -4], [2, 18], [24, 40], [30, 62], [30, 90]]);
  assert.deepEqual(def.spawns.title.slice(0, 2), [0, -64]); assert.deepEqual(def.spawns.practice, [-10, -90, 0]); assert.deepEqual(def.spawns.start, [-1.5, -50.5, -0.4]);
  const z = Object.fromEntries(def.zones.map((x) => [x.id, x]));
  const kittens = def.zones.filter((x) => x.kind === 'kitten');
  assert.deepEqual(kittens.map((k) => k.kittenId).sort(), [...KITTENS_BY_LEVEL.meadow].sort());
  // WA16 (companions.W2): Biscuit waits in the Old Bridge carrier (after the bridge fight)
  assert.deepEqual([z.noodle.hide, z.button.hide, z.biscuit.hide], ['meow', 'stand', 'cage']);
  assert.deepEqual([z.biscuit.at, z.biscuit.needClear], [[30, 74], 'bridge']);
  assert.equal(z.button.needClear, 'stones');
  assert.deepEqual(z.letter_1.at, [41.5, 30]); assert.equal(z.letter_1.letterId, 'l1');      // ON §6.1: by the Crow Fields cow
  assert.deepEqual([z.tallbert.play, z.tallbert.at, z.tallbert.r], ['g01', [0, -61], 2.5]);
  assert.deepEqual([z.lane.play, z.lane.at, z.lane.r], ['cs02', [-6, -52], 3]);
  for (const id of ['vigil_1', 'vigil_2', 'vigil_3']) assert.equal(z[id].kind, 'checkpoint');
  assert.deepEqual([z.stones.r, z.stones.waves.length], [12, 2]);
  assert.deepEqual([z.glade.r, z.glade.lockOn, z.glade.interact.play, z.glade.waves.length], [14, 'cs03:end', 'cs03', 2]);
  assert.deepEqual([z.bridge.r, z.bridge.waves.length, z.bridge.rescue ?? null], [12, 3, null]);
  // WA16: Mochi's tipped cart on the lane at STORY.mochiCage, its soft `cart` arena (3 rats) → D-01
  assert.deepEqual([z.cart.at, z.cart.r, z.cart.rescue.companion, z.cart.rescue.play, z.cart.rescue.cage], [[-14, -41], 9, 'mochi', 'd01', [-14, -41]]);
  assert.deepEqual([z.exit.to, z.exit.spawnId, z.exit.at], ['forest', 'start', [30, 92]]);
  assert.deepEqual(def.anchors.bell_far, [-130, -20, 30]);
  for (const a of ['pud_1', 'pud_2', 'pud_3', 'pud_4', 'crane_bell', 'crane_field', 'horde_a', 'horde_b']) assert.ok(def.anchors[a], `anchor ${a}`);
  assert.equal(def.water[0].deep, true); assert.equal(def.water[0].y, -0.4);
  // enemy totals (§12.3: 27 rat_pike, 8 rat_xbow, 6 crow)
  const tally = {};
  for (const zz of def.zones) {
    for (const [t, n = 1] of zz.spawns ?? []) tally[t] = (tally[t] ?? 0) + n;
    for (const w of zz.waves ?? []) for (const [t, n = 1] of w) tally[t] = (tally[t] ?? 0) + n;
  }
  assert.deepEqual(tally, { rat_pike: 30, rat_xbow: 8, crow: 6 });   // §12.3 + WA16's 3 cart rats
  const fish = def.fishLines.reduce((s, l) => s + l[2], 0);
  assert.ok(fish >= 60 && fish <= 75, `about 66 fish in lines (${fish})`);
  assert.equal(def.crates.n, 12); assert.equal(def.crates.milk, 2);
});

test('lost kittens: meadow places exactly its 3; no level places another level\'s kitten', async () => {
  const placed = [];
  for (const id of LEVEL_IDS) for (const z of (await loadDef(id)).zones) if (z.kind === 'kitten') placed.push(z.kittenId);
  assert.equal(new Set(placed).size, placed.length);
  for (const k of placed) assert.ok(KITTEN_IDS.includes(k));
});

test('manifest: every model a level references is listed (and in its per-level preload list) and exists on disk', async () => {
  const all = new Set(manifest);
  for (const p of manifest) assert.ok(fs.existsSync(path.join(ROOT, 'public', 'assets', p)), `${p} exists`);
  for (const id of LEVEL_IDS) {
    const paths = levelModelPaths(await loadDef(id));
    for (const p of paths) assert.ok(all.has(p), `${id}: ${p} in the world manifest`);
    assert.deepEqual([...(manifestLevels[id] ?? [])].sort(), [...paths].sort(), `${id}: per-level preload list in sync`);
  }
});

/** Distance from [x, z] to a segment collider { ax, az, bx, bz }. */
function distToSegment([x, z], sg) {
  const vx = sg.bx - sg.ax, vz = sg.bz - sg.az, l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x - sg.ax) * vx + (z - sg.az) * vz) / l2));
  return Math.hypot(x - sg.ax - vx * t, z - sg.az - vz * t);
}

// ---------------------------------------------------------------------------------------------- headless meadow build
/** Stub glTF: a 1 m box (or a 1 × 0.35 × 0.07 fence-like plank) with Kenney-style material names. */
function stubGltf(p) {
  const scene = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, p.includes('fence') ? 0.35 : 1, p.includes('fence') ? 0.07 : 1).translate(0, p.includes('fence') ? 0.175 : 0.5, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: p.includes('tree') ? 'leafsGreen' : 'stone' }));
  mesh.name = 'stub';
  scene.add(mesh);
  if (p.includes('windmill')) { const fan = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), mesh.material); fan.name = 'building_windmill_top_fan_red'; fan.position.y = 1.2; scene.add(fan); }
  return { scene, animations: [] };
}

test('meadow builds headless: groups, colliders, arenas, vigils (also spawns), triggers, interacts, anchors, fog_edge, props', async () => {
  const ctx = fakeCtx();
  ctx.assets.gltf = async (p) => stubGltf(p);
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  const kittens = [];
  ctx.companions = { spawnKitten: (id, pos, hide, opts) => { kittens.push({ id, pos, hide, opts }); return {}; }, clearLevel() {} };
  ctx.state.setFlag('prologue.done', true);
  const def = await loadDef('meadow');
  const L = await buildLevel(ctx, def);
  assert.ok(L instanceof Level);
  for (const g of ['terrain', 'props', 'grass', 'water', 'skyline', 'dawnstone', 'pickups', 'actors']) assert.ok(L.groups[g]?.isObject3D, `group ${g}`);
  assert.equal(L.heightfield.res, 200);
  assert.deepEqual(L.arenas.map((a) => a.id).sort(), ['bridge', 'cart', 'glade', 'stones']);
  assert.equal(L.arena('glade').canAutoLock(), false, 'glade waits for CS-03');
  assert.equal(L.arena('cart').soft, true, 'WA16: the cart fight has no fog wall');
  // WA §3.5 arena stage floors: one bright paint per arena zone
  assert.deepEqual(L.stages.map((s) => s.id).sort(), ['bridge', 'cart', 'glade', 'stones']);
  assert.deepEqual(L.vigils.map((v) => v.id), ['vigil_1', 'vigil_2', 'vigil_3']);
  for (const id of ['title', 'practice', 'start', 'boss', 'vigil_1', 'vigil_2', 'vigil_3']) assert.ok(L.spawns[id], `spawn ${id}`);
  assert.ok(near(L.spawns.start.pos.x, -1.5) && near(L.spawns.start.pos.z, -50.5));
  assert.deepEqual(L.triggers.map((t) => t.id).sort(), ['chart', 'exit', 'exit:blocked', 'lane', 'tallbert']);
  assert.ok(L.interactables.some((i) => i.id === 'barn_chest'), 'ON §5.4: the Suit Up chest is an interactable');
  assert.ok(L.anchor('chest'));
  assert.ok(L.bunting?.mesh?.isInstancedMesh && L.bunting.mesh.castShadow === false, 'WA §2.6 barn → gate bunting, no shadow');
  assert.ok(L.wheat && L.wheat.count > 200 && L.wheat.mesh?.isInstancedMesh, `swaying wheat clumps (${L.wheat?.count})`);
  assert.ok(L.interactables.some((i) => i.id === 'picnic'));
  for (let i = 0; i < 8; i++) { const a = L.anchor('fog_edge_' + i); assert.ok(a && Math.max(Math.abs(a.pos.x), Math.abs(a.pos.z)) <= 94.01, `fog_edge_${i}`); }
  assert.ok(near(L.anchor('bell_far').pos.y, 30));
  assert.ok(L.anchor('practice_gate') && L.anchor('chart') && L.anchor('tallbert') && L.anchor('g01_mark'));
  const nC = L.colliders.circles.length + L.colliders.boxes.length + L.colliders.segments.length;
  assert.ok(nC > 150, `colliders (${nC})`);
  assert.ok(L.colliders.segments.some((s) => s.gate === 'practice'), 'the practice gate blocks the north gap');
  assert.ok(L.batch.count > 300, `batched props (${L.batch.count})`);
  assert.ok(L.trees.length >= 2 && L.trees.some((t) => t.name.startsWith('fade:')), 'trees + fadeable fences');
  assert.ok(L.octreeMeshes.some((m) => m.name === 'oldBridge'), 'the Old Bridge deck collides');
  // the crossroads drystone walls (0.22 m segments) keep off every road and out of the Standing Stones arena
  const walls = L.colliders.segments.filter((sg) => sg.r === 0.22);
  assert.ok(walls.length >= 4, `crossroads walls (${walls.length})`);
  for (const sg of walls) for (const [x, z] of [[sg.ax, sg.az], [sg.bx, sg.bz], [(sg.ax + sg.bx) / 2, (sg.az + sg.bz) / 2]]) {
    assert.ok(distToPolyline(x, z, L.terrain.spine) > def.pathWidth / 2 + 0.5, `wall point ${x.toFixed(1)},${z.toFixed(1)} off the lane`);
    for (const p of L.terrain.paths) assert.ok(distToPolyline(x, z, p.pts) > p.width / 2 + 0.5, 'off the side roads');
    assert.ok(Math.hypot(x + 20, z + 4) > 14, 'outside the Standing Stones arena');
  }
  const perch = def.zones.find((zz) => zz.id === 'crossroads').spawns.find(([t]) => t === 'rat_xbow');
  assert.ok(walls.some((sg) => distToSegment(perch[2], sg) < 0.25), 'the crossbow perch is on a wall top');
  assert.ok(L.grass && L.grass.count >= 1000 && L.grass.mesh.isMesh, 'PERF §8.4: one tuft mesh with the quality count');
  assert.ok(L.waterMeshes?.count === 1);
  assert.equal(L.isDeepWater(10, 62), true);
  assert.equal(L.surfaceAt(30, 62), 'stone', 'bridge deck');
  // after load: kittens, enemies, crates and props join
  L.activate('start');
  assert.deepEqual(kittens.map((k) => k.id).sort(), ['biscuit', 'button', 'mochi', 'noodle']);
  assert.equal(kittens.find((k) => k.id === 'mochi').hide, 'cage');
  assert.equal(kittens.find((k) => k.id === 'noodle').opts.prop, 'barrel');
  assert.equal(enemies.list.length, 5 + 6, 'crossroads 2 + 2 pikes + 1 xbow, crow fields 4 crows + 2 xbows');
  assert.equal(L.actors.filter((a) => a.tags.has('crate')).length, 12);
  assert.ok(L.actors.filter((a) => a.tags.has('crate')).every((a) => a.kind === 'crate' || a.kind === 'barrel'), 'crate / barrel kinds (audio)');
  // Mochi still caged: companions build the cage cart, so our cart-high (and its collider) are gone
  assert.equal(kittens.find((k) => k.id === 'mochi').opts.y, undefined, 'no perch height: companions build their cart');
  assert.ok(!L.colliders.boxes.some((b) => Math.hypot(b.x - 30, b.z - 74) < 1.5), 'our cart collider removed while Mochi is caged');
  assert.ok(L.anchor('bridge_cage'));
  assert.ok(L.actors.some((a) => a.kind === 'wobble_knight') && L.actors.filter((a) => a.kind === 'dummy').length === 3);
  assert.ok(L.critters.length === 2, 'two sleeping cows');
  assert.equal(L.pickups.count('fish'), def.fishLines.reduce((s, l) => s + l[2], 0));
  assert.equal(L.pickups.count('letter'), 1);
  // Crow Fields hints: tut.pounce on the first crow alert, once per save
  const toasts = spy(ctx);
  ctx.bus.emit(E.ENEMY_ALERTED, { enemy: { def: { id: 'rat_pike' } } });
  ctx.bus.emit(E.ENEMY_ALERTED, { enemy: { def: { id: 'crow' } } });
  ctx.bus.emit(E.ENEMY_ALERTED, { enemy: { def: { id: 'crow' } } });
  assert.equal(toasts.count(E.TOAST), 1);
  assert.equal(ctx.state.getFlag('seen.tut.pounce'), true);
  ctx.bus.emit(E.TELEGRAPH, { id: 1, actor: { def: { id: 'rat_xbow' } }, kind: 'aim' });
  assert.equal(toasts.count(E.TOAST), 2);
  // the exit waits for Mochi: early -> a toast (every entry), never level:exit; rescued -> the exit fires
  const exitT = L.triggers.find((t) => t.id === 'exit');
  let exits = 0;
  ctx.levels = { exit: () => { exits++; } };
  ctx.player = { pos: new THREE.Vector3(0, 0, -60), alive: true, radius: 0.32, height: 1 };
  const atExit = () => { ctx.player.pos.set(30, 0, 92); L.update(1 / 60); ctx.player.pos.set(30, 0, 80); L.update(1 / 60); };
  const t0 = toasts.count(E.TOAST);
  atExit(); atExit();
  assert.equal(exits, 0, 'no exit with Mochi caged');
  assert.equal(toasts.count(E.TOAST), t0 + 2, 'a "Mochi is still caged" toast per visit');
  assert.ok(String(toasts.last(E.TOAST).text).length > 0);
  ctx.state.setFlag('meadow.mochi', true);
  atExit();
  assert.equal(exits, 1, 'exit after the rescue'); assert.equal(exitT.fired, true);
  // open zones: every Crow Fields enemy down -> meadow.cleared.crowfields (saved flag)
  const crows = enemies.list.filter((e) => e.opts?.zone === 'crowfields');
  assert.equal(crows.length, 6);
  for (const e of crows.slice(0, 5)) { e.alive = false; ctx.bus.emit(E.ENEMY_DIED, { enemy: e }); }
  assert.ok(!ctx.state.getFlag(openZoneFlag('meadow', 'crowfields')), 'not while one is left');
  crows[5].alive = false; ctx.bus.emit(E.ENEMY_DIED, { enemy: crows[5] });
  assert.equal(ctx.state.getFlag('meadow.cleared.crowfields'), true);
  // the practice gate opens with prologue.tutorial (collider removed)
  ctx.state.setFlag('prologue.tutorial', true);
  ctx.bus.emit(E.FLAG_SET, { key: 'prologue.tutorial', value: true });
  assert.ok(!L.colliders.segments.some((s) => s.gate === 'practice'), 'gate open');
  // rope posts appear with the net
  ctx.bus.emit(E.FLAG_SET, { key: 'meadow.pudding', value: 'netted' });
  assert.equal(L.actors.filter((a) => a.kind === 'rope_post').length, 3);
  L.dispose();
  assert.equal(L.actors.length, 0);
});

test('meadow reload: cleared open zones stay empty; a Vigil Stone load keeps nearby groups away (Continue at vigil_3)', async () => {
  const ctx = fakeCtx();
  ctx.assets.gltf = async (p) => stubGltf(p);
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  ctx.companions = { spawnKitten: () => ({}), clearLevel() {} };
  ctx.state.setFlag('prologue.done', true);
  const def = await loadDef('meadow');
  let L = await buildLevel(ctx, def);
  L.activate('vigil_3');
  const sp = L.spawns.vigil_3.pos;
  assert.equal(enemies.list.filter((e) => Math.hypot(e.pos.x - sp.x, e.pos.z - sp.z) < 15).length, 0, 'nothing spawns within 15 m of vigil_3');
  assert.ok(enemies.list.some((e) => e.opts?.zone === 'crossroads'), 'far zones still populate');
  assert.ok(enemies.list.filter((e) => e.opts?.zone === 'crowfields').every((e) => Math.hypot(e.opts.home.x - sp.x, e.opts.home.z - sp.z) >= OPEN_ZONE.safeLoadR));
  L.dispose();
  // vigil_1 sits at the crossroads: none of its rats wake up on top of her
  enemies.list.length = 0;
  L = await buildLevel(ctx, def); L.activate('vigil_1');
  const v1 = L.spawns.vigil_1.pos;
  assert.ok(enemies.list.every((e) => Math.hypot(e.pos.x - v1.x, e.pos.z - v1.z) >= 14), 'no rats beside vigil_1');
  L.dispose();
  // a cleared zone (saved flag) never respawns, from any spawn
  enemies.list.length = 0;
  ctx.state.setFlag(openZoneFlag('meadow', 'crossroads'), true);
  L = await buildLevel(ctx, def); L.activate('start');
  assert.equal(enemies.list.filter((e) => e.opts?.zone === 'crossroads').length, 0);
  assert.equal(enemies.list.filter((e) => e.opts?.zone === 'crowfields').length, 6, 'the start spawn is not a safe-load point');
  L.dispose();
});

test('Arena waves spawn already alerted (ring points sit beyond sight range)', () => {
  const ctx = fakeCtx({ systems: false });
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  ctx.player = { pos: new THREE.Vector3(0, 0, 0), alive: true };
  const a = new Arena(ctx, { id: 'x', at: [0, 0], r: 12, waves: [[['rat_pike', 3]]] });
  a.lock({ now: true });
  assert.equal(enemies.list.length, 3);
  assert.ok(enemies.list.every((e) => e.opts.alerted === true && e.opts.arena === 'x'));
});

test('Wobble Knight: glints only within reach, the strike still lands after a block pushback, parry hint only when allowed', () => {
  const ctx = fakeCtx({ systems: false });
  const hits = [], teles = [];
  let slow = 0, hintOk = false;
  ctx.combat = { applyHit: (a, t, d) => { hits.push(d); t.pos.z += 0.33; } };   // a blocked hit pushes her back
  ctx.game = { slowMo: () => { slow++; } };
  ctx.bus.on(E.TELEGRAPH, (p) => teles.push(Math.hypot(ctx.player.pos.x - p.actor.pos.x, ctx.player.pos.z - p.actor.pos.z)));
  ctx.player = { pos: new THREE.Vector3(0, 0, 6), alive: true, radius: 0.32 };
  const wk = new WobbleKnight(ctx, { id: 'wk', pos: new THREE.Vector3(), facing: 0, mesh: null, delay: 0.2, hint: () => hintOk });
  const run = (sec) => { for (let t = 0; t < sec; t += 1 / 60) wk.update(1 / 60); };
  run(3);
  assert.equal(teles.length, 0, 'idle while she is away (6 m)');
  assert.ok(wk.pos.length() < 1e-6, 'stays home');
  ctx.player.pos.z = 1.78;
  run(8.2);
  assert.ok(hits.length >= 3, `keeps connecting after block pushbacks: it hops after her (${hits.length} hits, she is at ${ctx.player.pos.z.toFixed(2)} m)`);
  const xz = () => Math.hypot(wk.pos.x - wk.home.x, wk.pos.z - wk.home.z);
  assert.ok(wk.pos.z > 0 && xz() <= WOBBLE_REACH.roam + 1e-6, `hopped toward her, within its roam (${wk.pos.z.toFixed(2)}, she ${ctx.player.pos.z.toFixed(2)}, hits ${hits.length}, ${wk.phase})`);
  assert.ok(teles.every((d) => d <= WOBBLE_REACH.swing + 1e-6), `every glint within reach (${teles.map((d) => d.toFixed(2))})`);
  assert.equal(slow, 0, 'no slow-mo hint outside the Parry step');
  ctx.player.pos.z = 30; run(4);
  assert.ok(xz() < 0.06, 'hops home when she leaves');
  hintOk = true; ctx.player.pos.z = 1.6;
  run(2.5);
  assert.equal(slow, 1, 'the hint fires on the first glint of the Parry step'); run(4); assert.equal(slow, 1, 'once');
  assert.ok(WOBBLE_REACH.hit > WOBBLE_REACH.swing && WOBBLE_REACH.swing > ATTACKS.dummy_swing.arc.range + 0.32);
});

test('Grass: the 3-tri budget blade; Wheat: tapered stalks with heads + awns, one instanced draw', () => {
  const b5 = makeBladeGeometry(5), b3 = makeBladeGeometry(3);
  assert.equal(b5.index.count / 3, 5); assert.equal(b3.index.count / 3, 3);
  assert.equal(b3.attributes.position.count, 5);
  const g = makeWheatClumpGeometry(3);
  assert.ok(g.attributes.aH && g.attributes.color && g.attributes.normal);
  assert.ok(g.index.count / 3 <= 10 * 9, `clump tris (${g.index.count / 3})`);
  const ys = g.attributes.position.array.filter((_, i) => i % 3 === 1);
  assert.ok(Math.max(...ys) > 0.9 && Math.min(...ys) === 0, 'base at 0, heads near 1 m');
  const f = new WheatField({ seed: 2 });
  f.add(0, 0, 0, { h: 1 }); f.add(1, 0, 0, { h: 1.2, yaw: 1, tint: -0.5 });
  const m = f.build();
  assert.ok(m.isInstancedMesh && m.count === 2 && m.instanceColor);
  f.update(1.5, { wind: 0.8, gust: 0.4, windDir: new THREE.Vector2(1, 0) }, new THREE.Vector3(1, 0, 0));
  assert.equal(f.uniforms.uWind.value, 0.8);
  f.dispose();
});

test('Terrain.finalize: tiled / half-res ground sits exactly on the heightfield (no seams)', () => {
  const def = { id: 't', size: 40, res: 20, seed: 3, hills: { amp: 1.5 }, spine: [[0, -20], [0, 20]] };
  for (const [step, chunks, tiles, tris] of [[1, 1, 1, 800], [1, 2, 4, 800], [2, 1, 1, 200]]) {
    const tr = new Terrain(def, {}); tr.build();
    const out = tr.finalize({ step, chunks });
    const meshes = []; out.mesh.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.equal(meshes.length, tiles);
    assert.equal(meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0), tris);
    for (const m of meshes) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 7) assert.ok(Math.abs(p.getY(i) - tr.heightfield.heightAt(p.getX(i), p.getZ(i))) < 1e-4);
    }
  }
});

test('Terrain ground LOD: far tiles swap to half resolution; full tiles keep crack-free (snapped) edges', () => {
  const def = { id: 't', size: 40, res: 20, seed: 3, hills: { amp: 1.5 }, spine: [[0, -20], [0, 20]] };
  const tr = new Terrain(def, {}); tr.build();
  const out = tr.finalize({ chunks: 2, lod: true });
  assert.equal(out.mesh.children.length, 4);
  const t0 = out.mesh.children[0], { full, coarse } = t0.userData.lod;
  assert.equal(full.index.count / 3, 200); assert.equal(coarse.index.count / 3, 50);
  // every full-res edge vertex lies on the coarse edge (linear between the coarse vertices)
  const fp = full.attributes.position, cp = coarse.attributes.position, V = 11, Vc = 6;
  for (let k = 0; k < V; k++) {
    const y = fp.getY(k), kc = k / 2;
    const yc = Number.isInteger(kc) ? cp.getY(kc) : (cp.getY(Math.floor(kc)) + cp.getY(Math.ceil(kc))) / 2;
    assert.ok(Math.abs(y - yc) < 1e-5, `edge vertex ${k}`);
  }
  assert.equal(Vc, Math.sqrt(cp.count));
  const tris = Terrain.updateGroundLod(out.mesh, new THREE.Vector3(-15, 0, -15), 8);
  assert.equal(t0.geometry, full, 'the tile under the camera is full');
  assert.equal(out.mesh.children[3].geometry, out.mesh.children[3].userData.lod.coarse, 'the far tile is coarse');
  assert.ok(tris < 800);
});

test('LevelManager: env preset + music by flags (Appendix B byFlag), anchor / arena lookups without a level', async () => {
  const ctx = fakeCtx({ systems: false });
  const lm = new LevelManager(ctx);
  const env = { default: 'meadow_day', byFlag: [['!prologue.done', 'meadow_night']] };
  const music = (await loadDef('meadow')).music;
  assert.equal(lm.pickEnv(env), 'meadow_night');
  assert.equal(lm.pickMusic(music), 'village_bards_tale', 'prologue music');
  ctx.state.setFlag('prologue.done', true);
  assert.equal(lm.pickEnv(env), 'meadow_day');
  assert.equal(lm.pickMusic(music), 'field_of_dreams');
  assert.equal(lm.pickMusic(null), null);
  assert.equal(lm.pickEnv('bog'), 'bog');
  assert.equal(lm.anchor('start'), null);
  assert.equal(lm.arenaNear(new THREE.Vector3()), null);
  assert.equal(lm.loading, false); assert.equal(lm.current, null);
});

test('LevelKit: defineLevel keeps the data and adds build(); procTemplate merges coloured parts into one indexed geometry', () => {
  const d = defineLevel({ id: 'x', spine: [[0, 0], [1, 1]], zones: [] });
  assert.equal(d.id, 'x'); assert.equal(typeof d.build, 'function'); assert.deepEqual(d.spine, [[0, 0], [1, 1]]);
  const t = procTemplate('k', [[new THREE.BoxGeometry(1, 1, 1), '#FF0000'], [new THREE.SphereGeometry(0.5, 6, 4), '#00FF00']]);
  assert.ok(t.geometry.index && t.geometry.attributes.color && t.geometry.attributes.normal && !t.geometry.attributes.uv);
  assert.ok(t.box.max.y >= 0.5);
});

// ------------------------------------------------------------------ M1 review: saved clears, placed fish, run stats, warm-up
test('Arena: a clear is saved as <level>.cleared.<id>; restore() starts it cleared silently (bridge: also once Mochi is free)', () => {
  const ctx = fakeCtx();
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  ctx.player = { pos: new THREE.Vector3(0, 0, 0), alive: true, vel: new THREE.Vector3(), teleport() {} };
  const level = { id: 'meadow' };
  const bus = spy(ctx);
  const a = new Arena(ctx, { id: 'stones', at: [0, 0], r: 12, waves: [[['rat_pike', 1]]] }, () => 0, level);
  assert.equal(arenaFlag('meadow', 'stones'), 'meadow.cleared.stones');
  a.clear();
  assert.equal(ctx.state.getFlag('meadow.cleared.stones'), true);
  // a reload: the new arena starts cleared, no lock / waves / events, and companions + objectives know it
  ctx.objectives = { cleared: new Set() }; ctx.companions = { cleared: new Set() };
  const n = bus.count(E.ARENA_CLEAR);
  const b = new Arena(ctx, { id: 'stones', at: [0, 0], r: 12, waves: [[['rat_pike', 1]]] }, () => 0, level);
  assert.equal(b.restore(), true);
  assert.equal(b.cleared, true); assert.equal(bus.count(E.ARENA_CLEAR), n);
  assert.ok(ctx.objectives.cleared.has('stones') && ctx.companions.cleared.has('stones'));
  b.lock(); assert.equal(b.locked, false); assert.equal(enemies.list.length, 0);
  // bridge: the rescue flag counts as cleared; restoreUnless keeps the glade fight armed while Pudding is netted
  const bridge = new Arena(ctx, { id: 'bridge', at: [0, 0], r: 12, waves: [[['rat_pike', 1]]], rescue: { companion: 'mochi', flag: 'meadow.mochi' } }, () => 0, level);
  assert.equal(bridge.restore(), false);
  ctx.state.setFlag('meadow.mochi', true);
  assert.equal(new Arena(ctx, bridge.zone, () => 0, level).restore(), true);
  ctx.state.setFlag('meadow.cleared.glade', true); ctx.state.setFlag('meadow.pudding', 'netted');
  const gz = { id: 'glade', at: [0, 0], r: 14, restoreUnless: (st) => st.getFlag('meadow.pudding') === 'netted', waves: [] };
  assert.equal(new Arena(ctx, gz, () => 0, level).restore(), false);
  ctx.state.setFlag('meadow.pudding', true);
  assert.equal(new Arena(ctx, gz, () => 0, level).restore(), true);
});

test('Pickups: placed fish lines save what she collected (bitmask flag) and skip it on the next load', () => {
  const ctx = fakeCtx();
  const mk = () => new Pickups(ctx, { heightAt: () => 0, levelId: 'meadow', root: new THREE.Group() });
  const p1 = mk();
  p1.fishLine([0, 0], [4, 0], 5, 3);
  assert.equal(p1.count('fish'), 5);
  const player = { pos: new THREE.Vector3(0, 0, 0), alive: true, radius: 0.3, hp: 8, maxHp: 8, milk: 0, milkMax: 2 };
  ctx.player = player;
  p1.update(1 / 60);
  assert.equal(p1.count('fish'), 4);
  assert.equal(ctx.state.getFlag(placedFishFlag('meadow', 3)), 1);
  p1.dispose();
  const p2 = mk();
  ctx.player = null;
  p2.fishLine([0, 0], [4, 0], 5, 3);
  assert.equal(p2.count('fish'), 4, 'the collected fish stays gone after a reload');
  assert.ok(p2.items.every((it) => it.pos.x > 0.5));
  p2.dispose();
});

test('Level run stats live in state.levels[id] (Continue / Retry continue the run; exit ends it)', () => {
  const ctx = fakeCtx();
  const st = ctx.state;
  st.playtime = 100; st.fish = 7;
  const r = levelRun(st, 'meadow');
  assert.deepEqual({ t: r.runT0, l: r.runLost, f: r.runFish0 }, { t: 100, l: 0, f: 7 });
  r.runLost = 2;
  st.playtime = 160; st.fish = 20;
  const again = levelRun(new (st.constructor)(JSON.parse(JSON.stringify(st.toJSON()))), 'meadow');   // a Continue (saved + reloaded)
  assert.deepEqual({ t: again.runT0, l: again.runLost, f: again.runFish0 }, { t: 100, l: 2, f: 7 });
  const scratch = levelRun(st, 'meadow', true);
  assert.equal(scratch.runT0, 160, 'the title backdrop never touches the run');
  endLevelRun(st, 'meadow');
  assert.equal(levelRun(st, 'meadow').runT0, 160, 'a normal entry after the exit starts a fresh run');
});

test('LevelManager: warm-up enemy types cover arena waves, open zones and the level warm rows', async () => {
  const def = await loadDef('meadow');
  const night = levelEnemyTypes(def, () => true), day = levelEnemyTypes(def, () => false);
  for (const t of ['rat_pike', 'rat_xbow', 'crow']) assert.ok(day.includes(t), t);
  assert.ok(night.includes('hyena') && !day.includes('hyena'));
});

test('Env: her warm pool (uGlow) is on in every preset, full at twilight / night; lamps glow only at dusk / night (WA4, §2.3a)', () => {
  for (const [name, p] of Object.entries(ENV_PRESETS)) {
    const st = toState(p);
    assert.ok(st.hero > 0, `${name}: hero glow on`);
    if (p.grade === 'night') assert.equal(st.hero, 1, `${name}: full glow at night`);
  }
  const LAMP_ON = { meadow_night: 1, forest_twilight: 1, bog_dusk: 1, keep_twilight: 1, keep_storm: 1, keep_cellar: 1, gate_dusk: 0.35 };
  for (const [name, p] of Object.entries(ENV_PRESETS)) assert.equal(p.lamps, LAMP_ON[name] ?? 0, `${name}: uLampStr`);
});

// ============================================================================================== M2: Acts I–II
/** A Line test rig: Objectives + LineController with fake enemies / story; `step(sec)` runs fixed steps. */
async function lineRig() {
  const ctx = fakeCtx({ systems: false });
  ctx.enemies = fakeEnemies();
  ctx.physics = { heightAt: () => 0 };
  const played = [];
  ctx.story = { isPlaying: false, play(id) { played.push(id); return Promise.resolve(); }, flag(k, v) { ctx.state.setFlag(k, v); ctx.bus.emit(E.FLAG_SET, { key: k, value: v }); } };
  const ob = new Objectives(ctx); await ob.init();
  const done = [];
  const bus = spy(ctx);
  const line = ob.startLine({ vec: (p) => new THREE.Vector3(p.x, p.y, p.z), onDone: () => done.push(1) });
  const step = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) ob.update(1 / 60); };
  return { ctx, ob, line, played, done, step, bus };
}
const lineEnemies = (ctx) => ctx.enemies.list.filter((e) => e.opts?.line);

test('U10 The Line: repair runs at 100/240 % per second with nobody at the winch', async () => {
  const { ctx, ob, step } = await lineRig();
  ctx.enemies.killAll();                                         // W1 (0 %) spawned at the start: clear it out
  assert.equal(LINE_RULES.rate, 100 / 240);
  const v0 = ob.progress('line');
  step(12);
  assert.ok(near(ob.progress('line') - v0, 5, 1e-3), `12 s → +5 % (${ob.progress('line') - v0})`);
  step(24);
  assert.ok(near(ob.progress('line') - v0, 15, 1e-3), '36 s → +15 %');
});

test('U10 The Line: an enemy within 4 m (horizontal) of the winch pauses it; 4.5 m away does not', async () => {
  const { ctx, ob, step } = await lineRig();
  ctx.enemies.killAll();
  const e = ctx.enemies.spawn('hyena', new THREE.Vector3(LINE.winch[0] + 2.4, 3, LINE.winch[1] + 2.4), {});   // 3.39 m away, 3 m up
  const a = ob.progress('line'); step(2);
  assert.equal(ob.progress('line'), a, 'paused');
  assert.equal(ob.get('line').paused, true);
  e.pos.set(LINE.winch[0] + 4.5, 0, LINE.winch[1]);
  step(2);
  assert.ok(ob.progress('line') > a + 0.8, 'resumes once it steps back');
  ctx.enemies.despawn(e);
});

test('U10 The Line: every wave threshold fires once, in order, even when one step crosses several', async () => {
  const { ctx, ob, line, step, played } = await lineRig();
  assert.deepEqual([...line.fired], [0], 'W1 at 0 %');
  const w1 = lineEnemies(ctx);
  assert.equal(w1.length, 4, 'W1: 4 hyena');
  assert.equal(w1.filter((e) => e.opts.objectiveRunner).length, 1, 'W1: 1 runner');
  ctx.enemies.killAll();
  ob.set('line', 50);                                            // crosses 20 % and 45 % in one jump
  step(1 / 60);
  assert.deepEqual([...line.fired], [0, 1, 2]);
  const w2 = line.byWave[1], w3 = line.byWave[2];
  assert.equal(w2.length, 5);
  assert.equal(w2.filter((e) => e.type === 'stealer' && e.opts.objectiveRunner && e.opts.pinThief).length, 2, 'W2: both stealers run (pin thieves)');
  assert.equal(w3.length, 8); assert.equal(w3.filter((e) => e.opts.objectiveRunner).length, 1);
  for (const e of [...w2, ...w3]) assert.ok(LINE.lanes.some(([x]) => Math.abs(e.pos.x - x) < 1.3) && e.pos.z <= LINE.lanes[0][1] + 0.01, 'spawned on the lanes');
  step(5);
  assert.deepEqual([...line.fired], [0, 1, 2], 'no re-fire');
  // 70 %: CS-08 waits for ≤ 2 alive and no live telegraph (≤ 10 s), despawns the leftovers, then W4 + the trickle
  ctx.enemies.killAll();
  for (let i = 0; i < 3; i++) ctx.enemies.spawn('hyena', new THREE.Vector3(0, 0, -50), { line: true });
  line.byWave[2].push(...ctx.enemies.list);
  ob.set('line', 70);
  step(1 / 60);
  assert.ok(line.fired.has(3) && !played.includes('cs08'), 'CS-08 waits while 3 are alive');
  ctx.bus.emit(E.TELEGRAPH, { id: 77 });
  ctx.enemies.despawn(ctx.enemies.list[0]);
  step(2);
  assert.ok(!played.includes('cs08'), 'and while a telegraph is live');
  ctx.bus.emit(E.TELEGRAPH_END, { id: 77 });
  step(1 / 60);
  assert.ok(played.includes('cs08'), 'CS-08 plays once ≤ 2 are alive');
  assert.equal(ctx.enemies.list.length, 0, 'leftovers despawned');
  await Promise.resolve(); await Promise.resolve();
  const w4 = line.byWave[3];
  assert.deepEqual(w4.map((e) => e.type).sort(), ['hyena', 'hyena', 'hyena', 'hyena', 'hyena', 'hyena', 'pug']);
  assert.equal(w4.filter((e) => e.opts.objectiveRunner).length, 2);
  assert.equal(ctx.state.runtime.spoons, true, 'Spoon Brigade on');
  ctx.enemies.killAll();
  step(LINE.trickle.every + 0.1);
  assert.equal(line.trickled.length, 2, 'the trickle: 2 hyena every 15 s');
  ctx.enemies.killAll();
  ob.set('line', 86); step(1 / 60);
  assert.ok(played.includes('g02'), 'G-02 at 85 %');
  assert.equal(played.filter((p) => p === 'cs08').length, 1);
});

test('U10 The Line: Pilfer takes the pin (freeze), a hit makes him drop it (resume, gate.pin)', async () => {
  const { ctx, ob, line, step, bus } = await lineRig();
  ctx.enemies.killAll();
  ob.set('line', 21); step(1 / 60);
  const thief = line.byWave[1].find((e) => e.opts.pinThief);
  for (const e of [...ctx.enemies.list]) if (e !== thief) ctx.enemies.despawn(e);
  thief.pos.set(LINE.winch[0] + 1, 0, LINE.winch[1] - 2);
  step(1 / 60);
  assert.equal(line.pin.state, 'stolen');
  assert.equal(ob.get('line').frozen, true);
  assert.equal(bus.last(E.ITEM_STOLEN)?.item, 'pin');
  thief.pos.set(0, 0, 0);                                           // he runs off
  const a = ob.progress('line'); step(1);
  assert.equal(ob.progress('line'), a, 'frozen while he has it');
  ctx.bus.emit(E.HIT, { attacker: {}, target: thief, damage: 10 });
  assert.equal(line.pin.state, 'returned');
  assert.equal(ob.get('line').frozen, false);
  assert.equal(ctx.state.getFlag('gate.pin'), true);
  assert.equal(bus.last(E.ITEM_RETURNED)?.item, 'pin');
  step(1);
  assert.ok(ob.progress('line') > a + 0.3, 'repair resumes');
});

test('U10 The Line: if Pilfer escapes (8 s), Pip brings the pin back 5 s after W2 is clear', async () => {
  const { ctx, ob, line, step } = await lineRig();
  ctx.enemies.killAll();
  ob.set('line', 21); step(1 / 60);
  const thief = line.byWave[1].find((e) => e.opts.pinThief);
  thief.pos.set(LINE.winch[0], 0, LINE.winch[1] - 3);
  step(1 / 60);
  thief.pos.set(0, 0, -40);
  step(LINE_RULES.pinEscape + 0.1);
  assert.equal(line.pin.state, 'lost');
  assert.ok(!ctx.enemies.list.includes(thief), 'he vanished into the fog');
  assert.equal(ob.get('line').frozen, true);
  step(3);
  assert.equal(line.pin.state, 'lost', 'not while W2 still fights');
  for (const e of line.byWave[1]) if (ctx.enemies.list.includes(e)) ctx.enemies.despawn(e);
  step(LINE_RULES.pipReturn - 0.2);
  assert.equal(line.pin.state, 'lost');
  step(0.4);
  assert.equal(line.pin.state, 'returned');
  assert.equal(ob.get('line').frozen, false);
});

test('U10 The Line: dying keeps the progress and re-spawns only the current wave; 100 % → gate.line + onDone', async () => {
  const { ctx, ob, line, step, done } = await lineRig();
  ctx.enemies.killAll();
  ob.set('line', 46); step(1 / 60);
  for (const e of line.byWave[1]) if (ctx.enemies.list.includes(e)) ctx.enemies.despawn(e);     // W2 is beaten; W3 is the current wave
  const n3 = line.byWave[2].length;
  const v = ob.progress('line');
  ctx.bus.emit(E.PLAYER_DIED, {});
  assert.equal(ob.progress('line'), v, 'progress kept');
  assert.equal(lineEnemies(ctx).length, 0, 'the current wave is cleared away');
  ctx.bus.emit(E.PLAYER_SPAWNED, {});
  step(LINE_RULES.respawnDelay + 0.1);
  assert.equal(line.byWave[2].length, n3, 'the same wave comes back');
  assert.equal(lineEnemies(ctx).length, n3);
  assert.deepEqual([...line.fired], [0, 1, 2], 'no threshold fired again');
  ctx.enemies.killAll();
  ob.set('line', 100);
  assert.equal(ob.get('line').done, true);
  assert.equal(ctx.state.getFlag('gate.line'), true);
  assert.equal(done.length, 1);
});

test('Objectives: counters (ropes, lanterns, keys) fill in max / text and set their flag when done', async () => {
  const ctx = fakeCtx({ systems: false });
  const ob = new Objectives(ctx); await ob.init();
  for (const [id, row] of Object.entries(COUNTERS)) {
    const o = ob.counter(id);
    assert.equal(o.max, row.max); assert.equal(o.textKey, row.textKey);
    ob.add(id, row.max);
    assert.equal(ob.get(id).done, true);
    if (row.flag) assert.equal(ctx.state.getFlag(row.flag), true, `${id} → ${row.flag}`);
  }
  assert.equal(ob.counter('lanterns'), ob.get('lanterns'), 'counter() does not restart a running objective');
  ob.start('x', { max: 10, rate: 1 }); ob.block('x', true); for (let i = 0; i < 60; i++) ob.update(1 / 60);
  assert.equal(ob.progress('x'), 0, 'blocked rate objective holds');
});

// ---------------------------------------------------------------------------------------------- U12 (M2): the three levels
function tally(def) {
  const t = {};
  for (const z of def.zones) {
    for (const [ty, n = 1] of z.spawns ?? []) t[ty] = (t[ty] ?? 0) + n;
    for (const w of z.waves ?? []) for (const [ty, n = 1] of w) t[ty] = (t[ty] ?? 0) + n;
  }
  return t;
}
const Z = (def) => Object.fromEntries(def.zones.map((z) => [z.id, z]));

test('U12 forest (§12.4): layout, caps, stumps, Treetop, Cheese Mill, 3 kittens + letter, enemy totals', () => {
  const d = forestDef, z = Z(d);
  assert.deepEqual([d.size, d.res, d.seed, d.hills.amp, d.pathWidth], [200, 200, 23, 3.0, 5]);
  assert.equal(d.env.default, 'forest_day'); assert.deepEqual(d.env.byFlag[0], ['forest.camp', 'forest_twilight']);   // WA §2.2
  for (const p of [[0, -85], [-20, -58], [-10, -30], [18, -8], [24, 18], [6, 40], [-10, 84]]) assert.ok(d.spine.some((q) => q[0] === p[0] && q[1] === p[1]), `spine ${p}`);
  assert.deepEqual(d.spawns.start.slice(0, 2), [0, -92]); assert.ok(Math.hypot(d.spawns.boss[0] + 10, d.spawns.boss[1] - 70) < 1.2, 'boss spawn at the boss door');
  // mushroom caps: heights, bounce, spacing; Heart Bell #1 on cap 5
  assert.deepEqual(MUSHROOM_CAPS.map((c) => c.y), [1, 2, 3, 4, 5.2]);
  assert.deepEqual(MUSHROOM_CAPS.map((c) => !!c.bounce), [false, true, false, true, false]);
  for (let i = 1; i < 5; i++) { const g = Math.hypot(MUSHROOM_CAPS[i].at[0] - MUSHROOM_CAPS[i - 1].at[0], MUSHROOM_CAPS[i].at[1] - MUSHROOM_CAPS[i - 1].at[1]); assert.ok(g > 2.2 && g < 2.8, `cap gap ${g}`); }
  assert.deepEqual(MUSHROOM_CAPS[4].at, [-24, -62]); assert.equal(CAP_R, 1.2);
  assert.deepEqual([z.bell_1.kind, z.bell_1.at, z.bell_1.y], ['heartBell', [-24, -62], 5.2]);
  // stumps: 6, gaps (edge to edge) ≤ 3.0 m and every hop within the 3.7 m jump reach; Letter #2 on stump 4
  assert.equal(STUMPS.length, 6);
  for (let i = 1; i < 6; i++) { const d = Math.hypot(STUMPS[i][0] - STUMPS[i - 1][0], STUMPS[i][1] - STUMPS[i - 1][1]); assert.ok(d - 2 * STUMP.r <= 3.0 && d <= 3.7, `stump hop ${d}`); }
  assert.deepEqual([z.letter_2.letterId, z.letter_2.at], ['l2', [23, 19]]);
  assert.ok(z.letter_2.yAbs >= STUMP.top);
  // zones
  assert.deepEqual([z.hollow.r, z.hollow.waves.length], [12, 2]);
  assert.deepEqual([z.ratcamp.waves.length, z.mill.r, z.mill.boss, z.mill.at], [3, 12, 'boss_grizzlechop', [-10, 84]]);
  assert.equal(MILL_PILLARS.length, 6);
  for (const [x, zz] of MILL_PILLARS) assert.ok(near(Math.hypot(x + 10, zz - 84), BOSSES.grizzlechop.pillars.r, 0.02));
  assert.deepEqual([z.camp.play, z.camp.r], ['cs04', 6]);
  assert.deepEqual([z.exit.to, z.exit.spawnId, z.exit.at, z.exit.when], ['town', 'start', [-24, 94], 'forest.boss']);
  assert.deepEqual(TREETOP.cage, [18, -8]);
  const kittens = d.zones.filter((x) => x.kind === 'kitten');
  assert.deepEqual(kittens.map((k) => [k.kittenId, k.hide]), [['pickles', 'meow'], ['pebble', 'break'], ['sprout', 'cage']]);
  assert.equal(z.sprout.needClear, 'ratcamp');
  assert.deepEqual(tally(d), { rat_pike: 19, rat_xbow: 5, crow: 4, spider: 8 });
  for (const v of ['vigil_1', 'vigil_2', 'vigil_3', 'vigil_4']) assert.equal(z[v].kind, 'checkpoint');
});

test('U12 town (§12.5): streets, Lantern Alley, balcony, square, steps, tower ledge, hub spawns, enemy totals', () => {
  const d = townDef, z = Z(d);
  assert.deepEqual([d.size, d.res, d.seed, d.hills.amp, d.pathWidth, d.pathSurface], [140, 140, 31, 0.4, 6, 'stone']);
  assert.deepEqual(d.env.byFlag.map((r) => r[1]), ['ending_gold', 'hub_hush', 'hub_gold']); assert.equal(d.env.default, 'town_occupied');   // WA §2.2
  assert.deepEqual(d.spawns.start.slice(0, 2), [0, -66]); assert.deepEqual(d.spawns.hub.slice(0, 2), [0, -46]);
  assert.deepEqual(d.spawns.bakery_cot, [-22, -20, -Math.PI / 2]); assert.deepEqual(d.spawns.belltower.slice(0, 2), [0, 50.5]);
  assert.deepEqual(LANTERNS, [[-3, -40], [3, -34], [-3, -28]]);
  assert.deepEqual([BALCONY.at, BALCONY.y], [[5, -30], 3]);
  assert.deepEqual(CRATE_STEPS.map((c) => c[2]), [1, 2, 3]);
  assert.deepEqual([SQUARE.at, SQUARE.r, SQUARE.rim, SQUARE.base, SQUARE.top], [[0, 8], 15, 0.6, 1.6, 2.5]);
  assert.deepEqual([TOWER.ledge.at, TOWER.ledge.y], [[0, 50.5], 6]);
  assert.equal(CHASE.length, 6); assert.deepEqual(CHASE[5], [-36, 4]);
  assert.deepEqual(z.square.waves.at(-1), [['jelly_giant', 1, { at: 'center' }]]);
  assert.equal(z.square.waves.length, 5);
  assert.deepEqual([z.steps.play, z.steps.at, z.steps.r], ['cs07', [0, 34], 5]);
  assert.deepEqual([z.letter_3.letterId, z.letter_3.at], ['l3', [28, -2]]);
  const kittens = d.zones.filter((x) => x.kind === 'kitten');
  assert.deepEqual(kittens.map((k) => [k.kittenId, k.hide]), [['waffles', 'climb'], ['toffee', 'climb'], ['muffin', 'climb']]);
  assert.deepEqual(tally(d), { rat_pike: 17, pug: 6, stealer: 6, rat_xbow: 2, crow: 2, jelly_giant: 1 });
  for (const zz of d.zones) if (zz.kind === 'open') assert.equal(zz.onlyIf, '!town.free', `${zz.id}: no enemies in hub mode`);
  for (const zz of d.zones) if (zz.kind === 'arena') assert.equal(zz.clearedWhen, 'town.free', `${zz.id}: cleared in hub mode`);
});

test('U12 gate (§12.6): tidal shape, causeway, towers, Line marker, battlefield, 3 kittens + letter, B2 arena', () => {
  const d = gateDef, z = Z(d);
  assert.deepEqual([d.size, d.res, d.seed], [180, 120, 41]);
  assert.equal(d.env.default, 'gate_dusk');
  assert.deepEqual([d.water[0].kind, d.water[0].y, d.water[0].deep], ['plane', -1.2, true]);
  assert.equal(gateShape(0, 0, 0.3), 0, 'deck');
  assert.equal(gateShape(-5.9, -40, 0.3), 0);
  assert.ok(gateShape(14, 0, 0.3) < -2, 'tidal water beyond the deck');
  assert.equal(gateShape(8, -52, 0), -0.8, 'the stair ledge');
  assert.ok(Math.abs(gateShape(0, 70, 0.2)) < 0.4 && Math.abs(gateShape(20, -80, 0.2)) < 0.4, 'shores at y ≈ 0');
  assert.deepEqual([GATE.deck.z0 <= -60, GATE.deck.z1 >= 45, GATE.deck.x], [true, true, 6]);
  assert.deepEqual(GATE.towers, [[-8.6, 8], [8.6, 8]]);
  assert.deepEqual([GATE.winch, GATE.winchR, GATE.line], [[0, 41], 4, 10]);
  for (const [a, b] of PARAPETS) assert.ok(b - a <= 18.0001, 'parapet runs ≤ 18 m (gaps every 20 m)');
  assert.deepEqual([z.causeway.size, z.causeway.at, z.causeway.boss], [[12, 40], [0, 10], 'boss_cacklejaw']);
  assert.ok(z.causeway.at[1] - z.causeway.size[1] / 2 === -10 && z.causeway.at[1] + z.causeway.size[1] / 2 === 30, 'fog walls at z −10 and +30');
  assert.deepEqual(d.spawns.start.slice(0, 2), [0, 58]); assert.ok(near(d.spawns.start[2], Math.PI));
  assert.deepEqual([z.vigil_1.at, z.vigil_3.at], [[-4, 56], [-4, -56]]);
  assert.deepEqual([z.letter_4.letterId, z.letter_4.at], ['l4', [-14, -80]]);
  assert.equal(z.bell_2.kind, 'heartBell');
  const kittens = d.zones.filter((x) => x.kind === 'kitten');
  assert.deepEqual(kittens.map((k) => [k.kittenId, k.hide]), [['tater', 'cage'], ['mittens', 'cage'], ['socks', 'climb']]);
  assert.equal(z.mittens.opts.cageWith, 'tater');
  assert.deepEqual(tally(d), { hyena: 5, rat_xbow: 2 }, 'S1 + S2 (the Line spawns the rest)');
  assert.deepEqual([z.s1.at, z.s2.at], [[-8, -66], [10, -78]]);
});

test('Hub (§12.5): stations open by flag, Quest Board next chapter, kitten spots, South Gate exit', () => {
  const st = fakeCtx({ systems: false }).state;
  const open = () => STATIONS.filter((s) => stationOpen(s, st)).map((s) => s.id);
  assert.deepEqual(open(), ['vigil']);
  st.setFlag('town.free', true);
  assert.deepEqual(open().sort(), ['bakery', 'barracks', 'forge', 'library', 'questboard', 'snowpaw', 'vigil']);
  assert.equal(nextLevel(st), 'gate');
  st.setFlag('gate.done', true);
  assert.ok(open().includes('lookout') && !open().includes('wardrobe'));
  assert.equal(nextLevel(st), 'bog');
  st.setFlag('bog.done', true); st.setFlag('ending.seen', true);
  assert.ok(open().includes('wardrobe') && open().includes('coo'));
  st.setFlag('keep.done', true);
  assert.equal(nextLevel(st), null);
  assert.deepEqual(questBoard(st).map((r) => r.id), LEVEL_IDS);
  st.flags = {}; st.setFlag('meadow.done', true); st.setFlag('forest.done', true); st.setFlag('town.done', true); st.kittens = ['biscuit', 'pickles', 'pebble'];
  const b = questBoard(st);
  assert.deepEqual(b.filter((r) => r.unlocked).map((r) => r.id), ['meadow', 'forest', 'town', 'gate']);
  assert.equal(b.find((r) => r.next).id, 'gate');
  assert.equal(b.find((r) => r.id === 'forest').kittens, 2);
  assert.deepEqual(Object.keys(HUB_KITTEN_SPOTS).sort(), [...KITTEN_IDS].sort());
  assert.deepEqual(SOUTH_GATE_EXIT, { at: [0, -63], size: [8, 2] });
  assert.equal(STATIONS.find((s) => s.id === 'questboard').opens, 'town.free');
});

test('Dressing: paved ribbons follow the ground; world-UV boxes; lamp pools follow the nearest lit sources (no PointLights)', () => {
  const g = paveGeometry({ lines: [{ pts: [[0, 0], [10, 0], [20, 5]], width: 4 }], discs: [[0, 20, 5]], heightAt: (x, z) => x * 0.1 + z * 0.05, lift: 0.03, rng: () => 0.5 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) assert.ok(near(p.getY(i), p.getX(i) * 0.1 + p.getZ(i) * 0.05 + 0.03, 1e-5));
  for (let i = 0; i < g.attributes.normal.count; i++) assert.ok(g.attributes.normal.getY(i) > 0, 'normals up');
  const b = worldBoxesGeometry([{ x0: 0, x1: 4, y0: -1, y1: 0, z0: 0, z1: 2 }], { tile: 2 });
  const uv = b.attributes.uv, pp = b.attributes.position, n = b.attributes.normal;
  for (let i = 0; i < uv.count; i++) if (n.getY(i) > 0.5) { assert.ok(near(uv.getX(i), pp.getX(i) / 2)); assert.ok(near(uv.getY(i), pp.getZ(i) / 2)); }
  // K2 / PERF §8.2: sources become ENV_U lamp slots (4 nearest the focus, radius 0 = off); no light is ever added
  const parent = new THREE.Group(), lamps = new LampSet(), pool = new LightPool(parent, 2, { lamps });
  const s = [pool.add({ pos: new THREE.Vector3(0, 1, 0) }), pool.add({ pos: new THREE.Vector3(5, 1, 0) }), pool.add({ pos: new THREE.Vector3(50, 1, 0), on: true })];
  const slots = Array.from({ length: 2 }, () => new THREE.Vector4());
  lamps.pick(new THREE.Vector3(40, 0, 0), slots, 0);
  assert.deepEqual(slots.map((v) => v.x).sort((a, c) => a - c), [5, 50]);
  assert.ok(slots.every((v) => v.w > 0), 'lit slots have a radius');
  s[2].on = false; lamps.pick(new THREE.Vector3(40, 0, 0), slots, 0);
  assert.deepEqual(slots.map((v) => v.x).sort((a, c) => a - c), [0, 5]);
  s[0].on = false; s[1].on = false; lamps.pick(null, slots, 0);
  assert.ok(slots.every((v) => v.w === 0), 'nothing lit: every slot off');
  assert.equal(parent.children.length, 0, 'no PointLights');
  pool.dispose();
  assert.equal(lamps.sources.length, 0, 'the level unload unregisters its lamps');
});

// ---------------------------------------------------------------------------------------------- headless M2 builds
async function buildM2(id, flags = {}, spawn = 'start') {
  const ctx = fakeCtx();
  ctx.assets.gltf = async (p) => stubGltf(p);
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  const kittens = [];
  ctx.companions = { spawnKitten: (kid, pos, hide, opts) => { kittens.push({ id: kid, pos, hide, opts }); return {}; }, clearLevel() {}, markCleared() {} };
  for (const [k, v] of Object.entries(flags)) ctx.state.setFlag(k, v);
  await ctx.objectives.init();
  const L = await buildLevel(ctx, (await loadDef(id)));
  ctx.levels = { current: L, pickEnv: () => null, anchor: (n) => L.anchor(n) };
  L.activate(spawn);
  return { ctx, L, enemies, kittens };
}

test('forest builds headless: arenas, vigils, caps (bounce colliders), stumps, the mill pillars, kittens, crates', async () => {
  const { L, enemies, kittens } = await buildM2('forest');
  assert.deepEqual(L.arenas.map((a) => a.id).sort(), ['hollow', 'mill', 'ratcamp']);
  assert.deepEqual(L.vigils.map((v) => v.id), ['vigil_1', 'vigil_2', 'vigil_3', 'vigil_4']);
  for (let i = 1; i <= 5; i++) assert.ok(L.anchor('cap_' + i), `cap_${i}`);
  const caps = L.colliders.circles.filter((c) => c.cap);
  assert.equal(caps.length, 5); assert.deepEqual(caps.filter((c) => c.bounce > 0).map((c) => c.cap), [2, 4]);
  for (const c of caps) assert.ok(near(c.y1 - L.heightAt(c.x, c.z), MUSHROOM_CAPS[c.cap - 1].y, 0.25), `cap ${c.cap} top`);
  assert.equal(L.colliders.circles.filter((c) => c.stump).length, 6);
  assert.equal(L.bossPillars.length, 6);
  assert.ok(L.isDeepWater(15, 18), 'the stream is deep');
  assert.ok(!L.isDeepWater(STUMPS[0][0], STUMPS[0][1], STUMP.top), 'a stump top is dry');
  assert.deepEqual(kittens.map((k) => k.id).sort(), ['pebble', 'pickles', 'sprout']);
  assert.equal(enemies.list.length, 2 + 2 + 6, 'gate + mushroom patrols + treetop guards');
  assert.ok(L.actors.some((a) => a.propId === 'hollow_boulder' && a.breaks === 'cracked'), 'the cracked boulder');
  assert.ok(L.lightPool?.sources.length >= 7, 'lamp sources: the campfire + the rat-camp pumpkin lanterns');
  assert.ok(!L.root.getObjectsByProperty('isPointLight', true).length, 'K2: no PointLights in the level');
  assert.ok(L.bunting?.layout.lanterns > 0 && L.bunting.layout.pennants === 0, 'Lantern Night paper lanterns (one draw)');
  assert.ok(L.trees.length >= 3);
  assert.ok(L.triggers.some((t) => t.id === 'camp'));
  L.dispose();
});

test('town builds headless: lanterns light the alley (objective, fog), hub mode drops the occupation', async () => {
  let { ctx, L, enemies, kittens } = await buildM2('town');
  assert.deepEqual(L.arenas.map((a) => a.id).sort(), ['forge', 'square']);
  assert.ok(enemies.list.length >= 9, 'occupied: patrols in the streets');
  assert.deepEqual(kittens.map((k) => k.id).sort(), ['muffin', 'toffee', 'waffles']);
  assert.ok(L.pave?.isMesh, 'cobbled streets');
  const ledge = L.colliders.boxes.find((b) => b.ledge), bal = L.colliders.boxes.find((b) => b.balcony);
  assert.ok(near(ledge.y1 - L.heightAt(0, 50.5), TOWER.ledge.y, 0.3) && near(bal.y1 - L.heightAt(5, -30), BALCONY.y, 0.05));
  const fog0 = ctx.env.contrib.size;
  for (let i = 1; i <= 3; i++) assert.equal(L.interact('lantern_' + i), true);
  assert.equal(ctx.objectives.get('lanterns')?.done, true);
  assert.equal(ctx.state.getFlag('town.lanterns'), true);
  assert.equal(ctx.env.contrib.size, fog0 + 3, 'each lantern thins the fog (−0.005)');
  assert.equal(L.interact('lantern_1'), false, 'lit once');
  assert.equal(L.interact('station_forge'), false, 'stations closed while occupied');
  L.dispose();
  ({ ctx, L, enemies } = await buildM2('town', { 'town.free': true, 'town.lantern.1': true }, 'hub'));
  assert.equal(enemies.list.length, 0, 'hub: no enemies');
  assert.ok(L.arenas.every((a) => a.cleared && !a.canAutoLock()));
  assert.equal(L.interact('station_forge'), true);
  assert.equal(L.interact('quest_board'), true);
  assert.ok(L.triggers.some((t) => t.id === 'south_gate'));
  assert.ok(ctx.env.contrib.has('lantern_1'), 'a lantern lit on an earlier visit stays lit');
  L.dispose();
});

test('gate builds headless: the Line starts at the marker after S1 + S2, re-arms vigil_2; the B2 arena waits for gate.line', async () => {
  const { ctx, L, kittens } = await buildM2('gate', { 'gate.cleared.s1': true, 'gate.cleared.s2': true });
  assert.deepEqual(L.arenas.map((a) => a.id), ['causeway']);
  assert.equal(L.arena('causeway').canAutoLock(), false);
  assert.deepEqual(kittens.map((k) => k.id).sort(), ['mittens', 'socks', 'tater']);
  assert.equal(kittens.find((k) => k.id === 'mittens').opts.cageWith, 'tater');
  assert.ok(L.portcullis && L.raft, 'portcullis + raft');
  assert.ok(L.colliders.boxes.filter((b) => b.parapet).length >= PARAPETS.length * 2);
  assert.equal(L.heightAt(0, 0), 0); assert.ok(L.isDeepWater(20, 0));
  ctx.player = { pos: new THREE.Vector3(0, 0, 20), alive: true, radius: 0.32, height: 1 };
  L.update(1 / 60);
  ctx.player.pos.set(0, 0, GATE.line);
  L.update(1 / 60);
  assert.equal(ctx.objectives.line?.active, true, 'the Line runs');
  ctx.state.setFlag('gate.line', true);
  assert.equal(L.arena('causeway').canAutoLock(), true);
  ctx.objectives.dispose();
  L.dispose();
});

test('U10 The Line: enemies may run the theft (item:stolen / item:returned) and story may start CS-08 itself', async () => {
  const { ctx, ob, line, step, played } = await lineRig();
  ctx.enemies.pinThief = null;                                   // enemies' stealer AI owns the theft
  ctx.enemies.killAll();
  ob.set('line', 21); step(1 / 60);
  const thief = line.byWave[1].find((e) => e.opts.pinThief);
  assert.deepEqual([thief.opts.look, thief.opts.id], ['pilfer', 'pilfer'], 'the first W2 stealer is Pilfer');
  assert.equal(line.byWave[1].filter((e) => e.opts.id === 'pilfer').length, 1);
  thief.pos.set(LINE.winch[0], 0, LINE.winch[1]);
  step(1);
  assert.equal(line.pin.state, 'home', 'no proximity theft when enemies own it');
  ctx.bus.emit(E.ITEM_STOLEN, { thief, item: 'pin', amount: 1 });
  assert.equal(line.pin.state, 'stolen'); assert.equal(ob.get('line').frozen, true);
  ctx.bus.emit(E.ITEM_RETURNED, { item: 'pin', amount: 1 });
  assert.equal(line.pin.state, 'returned'); assert.equal(ob.get('line').frozen, false);
  // story starts CS-08 on its own: adopted (never played twice), W4 when it ends
  ctx.enemies.killAll();
  ob.set('line', 70); step(1 / 60);
  ctx.bus.emit(E.CUTSCENE_START, { id: 'cs08' });
  step(12);
  assert.ok(!played.includes('cs08'), 'world does not replay a running CS-08');
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs08' });
  assert.equal(line.byWave[3].length, 7, 'W4 after the scene');
  ctx.bus.emit(E.CUTSCENE_START, { id: 'g02' });
  ob.set('line', 90); step(1);
  assert.ok(!played.includes('g02'), 'G-02 already seen');
});

test('gate: the Line disc arms on gate.back (story) or both skirmish flags; never after gate.line', async () => {
  const { LINE_WHEN } = await import('../../src/world/levels/gate.js');
  const st = fakeCtx({ systems: false }).state;
  assert.equal(st.cond(LINE_WHEN), false);
  st.setFlag('gate.cleared.s1', true); assert.equal(st.cond(LINE_WHEN), false);
  st.setFlag('gate.cleared.s2', true); assert.equal(st.cond(LINE_WHEN), true);
  st.flags = {}; st.setFlag('gate.back', true); assert.equal(st.cond(LINE_WHEN), true);
  st.setFlag('gate.line', true); assert.equal(st.cond(LINE_WHEN), false);
});

test('Arena: a wave row with `at: center` spawns at the arena centre (the town fountain jelly)', () => {
  const ctx = fakeCtx({ systems: false });
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  ctx.player = { pos: new THREE.Vector3(0, 0, -10), alive: true };
  const a = new Arena(ctx, { id: 'sq', at: [3, 8], r: 15, waves: [[['jelly_giant', 1, { at: 'center' }]]] });
  a.lock({ now: true });
  assert.equal(enemies.list.length, 1);
  const e = enemies.list[0];
  assert.ok(near(e.pos.x, 3) && near(e.pos.z, 8), 'at the centre');
  assert.equal(e.opts.at, undefined, 'the `at` option is not passed on');
  assert.ok(e.opts.arena === 'sq' && e.opts.alerted === true);
});

test('town: CS-07 frees the town in place (occupiers leave, arenas count as cleared)', async () => {
  const { ctx, L, enemies } = await buildM2('town');
  const n = enemies.list.length;
  assert.ok(n > 0);
  L.arena('square').lock({ now: true });
  assert.ok(enemies.list.length > n, 'square wave 1 up');
  ctx.state.setFlag('town.free', true);
  ctx.bus.emit(E.FLAG_SET, { key: 'town.free', value: true });
  assert.equal(enemies.list.length, 0, 'everyone left');
  assert.ok(L.arenas.every((a) => a.cleared && !a.locked));
  L.dispose();
});

test('LevelManager.activateVigil lights a Vigil Stone by id', () => {
  const ctx = fakeCtx();
  const lm = new LevelManager(ctx);
  const lit = [];
  lm.current = { vigils: [{ id: 'vigil_3', activate: (o) => lit.push(o) }] };
  assert.equal(lm.activateVigil('vigil_3', { silent: true }), true);
  assert.deepEqual(lit, [{ silent: true }]);
  assert.equal(lm.activateVigil('nope'), false);
});

// ============================================================================================ CONTROLS_SPEC (iso camera)
import { ISO_RULES, cameraSide, zoneContains, pickZone, hintStats, onCameraSide, isClutter, clutterAnchors, spawnAudit } from '../../src/world/isoView.js';
import { crownFraction, isRoofTriangle, splitRoofTemplate, splitGeometry } from '../../src/world/Props.js';
import { TRAMPLE, trampleAt } from '../../src/world/Wheat.js';
import { Env } from '../../src/world/Env.js';
import { HFOG } from '../../src/world/HeightFog.js';
import { CAMERA as CAM_CFG } from '../../src/core/config.js';

const allDefs = async () => Object.fromEntries(await Promise.all(Object.entries(LEVELS).map(async ([id, f]) => [id, (await f()).default])));

test('iso: camera side of a level yaw (pi: the lens sits at -Z; the gate yaw 0: at +Z)', () => {
  const [sx, sz] = cameraSide(Math.PI); assert.ok(near(sx, 0, 1e-9) && near(sz, -1, 1e-9));
  const [gx, gz] = cameraSide(0); assert.ok(near(gx, 0) && near(gz, 1));
  assert.ok(onCameraSide(0, -4, 0.5, 0, 0, Math.PI), '4 m south of the anchor at yaw pi is between the lens and it');
  assert.ok(!onCameraSide(0, 4, 0.5, 0, 0, Math.PI), 'north of it is not');
  assert.ok(!onCameraSide(0, -8, 0.5, 0, 0, Math.PI), 'beyond 6 m it is not');
  assert.ok(!onCameraSide(5, -3, 0.5, 0, 0, Math.PI), 'well to the side it is not');
  assert.ok(onCameraSide(0, 4, 0.5, 0, 0, 0), 'at yaw 0 the camera side is +Z');
});

test('iso: zoneAt picks hint zones first, then the smallest; hysteresis on leaving; ok() filters (camIf)', () => {
  const big = { id: 'big', at: [0, 0], r: 20 }, hint = { id: 'hint', at: [5, 0], r: 4, cam: { dist: 15 } }, box = { id: 'box', at: [0, 0], size: [4, 4], cam: { dist: 12 } };
  const zones = [big, hint, box];
  assert.equal(pickZone(zones, -10, 0), big);
  assert.equal(pickZone(zones, 6, 0), hint, 'a hint zone wins over a bigger plain one');
  assert.equal(pickZone(zones, 1, 0), box, 'the smaller hint zone wins');
  assert.equal(pickZone(zones, 9.5, 0), big, 'outside the hint disc');
  assert.equal(pickZone(zones, 9.5, 0, hint), hint, 'the current hint zone holds within its 1.5 m pad');
  assert.equal(pickZone(zones, 10.6, 0, hint), big, 'and lets go beyond it');
  assert.equal(pickZone(zones, 6, 0, null, undefined, (z) => z !== hint), big, 'filtered out');
  assert.ok(zoneContains({ at: [0, 0], size: [2, 10], yaw: Math.PI / 2 }, 4, 0), 'a rotated box');
});

test('iso: every level authors <= 3 camera hints (<= 3 yaw hints); a > 45 deg swing only for the Mushroom Ring set piece; one memeSpot outdoors', async () => {
  const defs = await allDefs();
  for (const [id, def] of Object.entries(defs)) {
    const h = hintStats(def);
    assert.ok(h.yawHints <= ISO_RULES.maxYawHints, `${id}: ${h.yawHints} yaw hints`);
    assert.ok(h.hints <= ISO_RULES.maxHints, `${id}: ${h.hints} camera hints (${h.ids})`);
    assert.deepEqual(h.bigYaw.filter((z) => z !== 'mushroom_climb'), [], `${id}: big yaw swings ${h.bigYaw}`);
    assert.ok(Number.isFinite(def.cam?.yaw), `${id}: cam.yaw`);
    for (const z of def.zones ?? []) if (z.cam) {
      for (const k of Object.keys(z.cam)) assert.ok(['yaw', 'pitch', 'dist', 'clear'].includes(k), `${id}:${z.id} cam.${k}`);
      if (z.cam.dist != null) assert.ok(z.cam.dist >= CAM_CFG.iso.distMin && z.cam.dist <= CAM_CFG.iso.distMax, `${id}:${z.id} dist ${z.cam.dist}`);
    }
  }
  for (const id of ['meadow', 'forest', 'town', 'gate']) assert.ok(Array.isArray(defs[id].memeSpot?.at) && Number.isFinite(defs[id].memeSpot.yaw), `${id} memeSpot`);
  assert.equal(defs.gate.cam.yaw, 0, 'the gate looks north (screen-up = onward)');
  assert.deepEqual(hintStats(defs.meadow).ids.sort(), ['fields_view', 'practice', 'stones_glade_view']);
});

test('iso 8.5 spawn audit: no open-zone spawn group 6 m down-screen of a trigger, checkpoint or arena entry', async () => {
  const defs = await allDefs();
  for (const [id, def] of Object.entries(defs)) assert.deepEqual(spawnAudit(def), [], `${id}: ${JSON.stringify(spawnAudit(def))}`);
  // the rule itself: a group 3 m south of a checkpoint at yaw pi is flagged
  const bad = spawnAudit({ cam: { yaw: Math.PI }, zones: [{ id: 'v', kind: 'checkpoint', at: [0, 0] }, { id: 'o', kind: 'open', at: [0, -3], spawns: [['rat_pike', 2, [0, -3], 2]] }] });
  assert.equal(bad.length, 1);
});

test('iso 11 clutter rule: a prop taller than 2.2 m within 6 m camera-side of the spine is clutter', () => {
  const def = { spine: [[0, 0], [0, 20]], zones: [{ kind: 'arena', at: [10, 10], r: 8 }] };
  const A = clutterAnchors(def);
  assert.ok(isClutter(0.5, -3, 1, 3, A, Math.PI), 'south of the spine start');
  assert.ok(!isClutter(0.5, -3, 1, 2.0, A, Math.PI), 'short props are fine');
  assert.ok(isClutter(10, 6, 1, 3, A, Math.PI), 'south of the arena centre');
  assert.ok(!isClutter(4, 10, 0.5, 5, A, Math.PI), 'beside the spine (lateral)');
});

test('Props: crown fraction from the leafy vertices; roof triangles; a building splits into body + roof', () => {
  // a trunk box (brown, 0..2) and a crown box (green, 2..5)
  const trunk = new THREE.BoxGeometry(0.4, 2, 0.4).translate(0, 1, 0), crown = new THREE.BoxGeometry(2, 3, 2).translate(0, 3.5, 0);
  const t = procTemplate('tree_t', [[trunk, '#5A4632'], [crown, '#4F5C2A']]);
  assert.ok(near(crownFraction(t.geometry), 2 / 5, 0.02), `crownFrac ${crownFraction(t.geometry)}`);
  assert.equal(crownFraction(procTemplate('rock', [[new THREE.BoxGeometry(1, 1, 1), '#8C8F88']]).geometry), 0.35, 'no leaves: fallback');
  const box = { minY: 0, maxY: 6 };
  assert.ok(isRoofTriangle([0, 5, 0], [1, 5, 0], [0, 5.5, -1], box), 'an up-facing slope high on the house');
  assert.ok(!isRoofTriangle([0, 1, 0], [1, 1, 0], [0, 4, 0], box), 'a wall');
  assert.ok(!isRoofTriangle([0, 0.5, 0], [1, 0.5, 0], [0, 0.5, -1], box), 'a porch step low down');
  const house = procTemplate('house_t', [[new THREE.BoxGeometry(4, 3, 4).translate(0, 1.5, 0), '#C9C4B6'], [new THREE.ConeGeometry(3.2, 2.5, 4).translate(0, 4.25, 0), '#B05A54']]);
  const sp = splitRoofTemplate(house);
  assert.ok(sp.roof && sp.body !== house, 'split');
  const nb = house.geometry.index.count, nr = sp.roof.geometry.index.count, nw = sp.body.geometry.index.count;
  assert.equal(nr + nw, nb, 'every triangle lands in one part');
  const ry = sp.roof.geometry.boundingBox;
  assert.ok(ry.min.y >= 2.9, `the roof starts at the eaves (${ry.min.y.toFixed(2)})`);
  assert.deepEqual(sp.roof.box, house.box, 'same placement box');
  const [a, b] = splitGeometry(house.geometry, () => false);
  assert.ok(a && b === null);
});

test('Wheat trample: bend within 1.4 m, flattened to 40 % within 0.9 m; 5 trample slots fed from her + enemies', () => {
  assert.deepEqual([TRAMPLE.slots, TRAMPLE.r, TRAMPLE.flat, TRAMPLE.minH], [5, 1.4, 0.9, 0.4]);
  assert.ok(trampleAt(0.2).squash > 0.99 && trampleAt(0.2).bend > 0.99);
  assert.ok(trampleAt(1.2).bend > 0 && trampleAt(1.2).squash === 0, 'bent, not flattened, at 1.2 m');
  assert.equal(trampleAt(1.5).bend, 0);
  const f = new WheatField();
  f.update(1, null, new THREE.Vector3(1, 0, 2), [{ x: 3, y: 0, z: 3 }, { x: 4, y: 0, z: 4 }]);
  const T = f.uniforms.uTrample.value;
  assert.equal(T.length, 5);
  assert.deepEqual(T.map((v) => v.w), [1, 1, 1, 0, 0]);
  assert.deepEqual([T[0].x, T[0].z, T[2].x], [1, 2, 4]);
  f.update(1, null, null, null);
  assert.ok(T.every((v) => v.w === 0));
});

test('Level: zone hints go to cam.setHint on entry (snap at load), wait while she is engaged, restore on leaving', () => {
  const ctx = fakeCtx({ systems: false });
  const hints = [];
  ctx.cam = { setHint: (h, blend) => hints.push({ ...h, blend }) };
  const foe = { pos: new THREE.Vector3(30, 0, 3), alerted: true, alive: true };
  ctx.enemies = { list: [foe] };
  const def = { id: 'h', cam: { yaw: Math.PI }, zones: [{ id: 'z', at: [30, 0], r: 5, cam: { dist: 15, clear: 7 } }] };
  const L = new Level(ctx, def);
  const p = { pos: new THREE.Vector3(0, 0, 0), alive: true };
  L._updateCamHint(1 / 60, p);
  assert.equal(hints.length, 1); assert.equal(hints[0].blend, 0, 'the level framing snaps at load'); assert.equal(hints[0].yaw, Math.PI);
  p.pos.set(30, 0, 0);
  for (let i = 0; i < 60; i++) L._updateCamHint(1 / 60, p);
  assert.equal(hints.length, 1, 'an alerted foe within 10 m: the hint waits');
  foe.alerted = false;
  for (let i = 0; i < 100; i++) L._updateCamHint(1 / 60, p);
  assert.equal(hints.length, 1, 'still < 2 s calm');
  for (let i = 0; i < 30; i++) L._updateCamHint(1 / 60, p);
  assert.equal(hints.length, 2); assert.equal(hints[1].dist, 15); assert.equal(hints[1].zone, 'z'); assert.ok(near(hints[1].blend, CAM_CFG.iso.hint.blend));
  assert.equal(L.camZone.id, 'z');
  p.pos.set(36, 0, 0);
  for (let i = 0; i < 5; i++) L._updateCamHint(1 / 60, p);
  assert.equal(hints.length, 2, 'inside the pad');
  p.pos.set(40, 0, 0);
  L._updateCamHint(1 / 60, p);
  assert.equal(hints.length, 3); assert.equal(hints[2].dist, undefined); assert.equal(L.camZone, null);
  ctx.cam.zoneHints = true;                       // a camera that reads zoneAt itself
  p.pos.set(30, 0, 0);
  L._updateCamHint(1 / 60, p);
  assert.equal(hints.length, 3); assert.equal(L.camZone.id, 'z');
});

test('Level: E prefers the hovered interactable when two are in reach', () => {
  const ctx = fakeCtx({ systems: false });
  const used = [];
  ctx.game = { mode: 'play' };
  ctx.input = { pressed: (a) => a === 'interact' };
  const L = new Level(ctx, { id: 'e' });
  const mk = (id, x) => ({ id, kind: 'interact', r: 2, pos: new THREE.Vector3(x, 0, 0), use: () => used.push(id) });
  L.interactables.push(mk('near', 0.5), mk('far', 1.5));
  const p = { pos: new THREE.Vector3(0, 0, 0), hover: null };
  L._updateInteract(p);
  assert.deepEqual(used, ['near']);
  p.hover = { kind: 'interact', id: 'far' };
  L._interact = null;
  L._updateInteract(p);
  assert.deepEqual(used, ['near', 'far'], 'the hovered one wins');
});

test('Env: per-level focus fog (cam.fog, per-preset rows), the zone clear, the iso hemisphere', () => {
  const ctx = fakeCtx({ systems: false });
  ctx.scene = new THREE.Scene();
  const env = new Env(ctx);
  env.sunLight = new THREE.DirectionalLight(); env.hemiLight = new THREE.HemisphereLight();
  ctx.levels = { current: { cam: { yaw: Math.PI, fog: { clear: 5.5, clearCombat: 7, topMul: 1.35, forest_night: { clear: 4.5, clearCombat: 6, topMul: 1.2 } },
    light: { forest_night: { hemiMul: 1.15 } } }, camZone: null } };
  env.presetName = 'forest_day';
  env.setFocusFog({ focus: new THREE.Vector3(), mode: 1 });
  assert.ok(near(HFOG.uFogClear.value, 5.5) && near(HFOG.uFogTopMul.value, 1.35));
  env.presetName = 'forest_night'; env._clear = null;
  env.setFocusFog({ focus: new THREE.Vector3(), mode: 1 });
  assert.ok(near(HFOG.uFogClear.value, 4.5) && near(HFOG.uFogTopMul.value, 1.2), 'the night row');
  ctx.levels.current.camZone = { cam: { clear: 7 } }; env._clear = null;
  env.setFocusFog({ focus: new THREE.Vector3(), mode: 1 });
  assert.ok(near(HFOG.uFogClear.value, 7), 'a zone hint clear (Mushroom Ring 7 m)');
  env.cur.hemi = 1; env._focusMode = 1; env._apply(false);
  assert.ok(near(env.hemiLight.intensity, 1.15), `iso hemi x1.15 (${env.hemiLight.intensity})`);
  env._focusMode = 0; env._apply(false);
  assert.ok(near(env.hemiLight.intensity, 1), 'eye-level shots keep the authored look');
  HFOG.uFogMode.value = 0; HFOG.uFogClear.value = 5; HFOG.uFogTopMul.value = 1.5;
});

test('iso level data: the meadow fence link is gated on tut.jump.done (gate line along the fence); forest / town hop links', async () => {
  const defs = await allDefs();
  const fence = defs.meadow.navLinks.find((l) => l.kind === 'fence');
  assert.equal(fence.when, 'tut.jump.done');
  assert.ok(fence.a[1] < -87 && fence.b[1] > -87, 'the link crosses the inner fence (z -87)');
  assert.deepEqual(fence.gate, [[-20, -87], [-2, -87]]);
  const f = defs.forest.navLinks;
  assert.equal(f.filter((l) => l.kind === 'hop').length, 4 + 7, '2 ledges x 2 hops + 7 stump hops');
  for (const l of f) assert.ok(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) <= 3.2, `link length ${JSON.stringify(l)}`);
  assert.equal(defs.town.navLinks.length, 4, 'street, 3 crates, balcony');
});

test('iso builds headless: roof faces and solids tagged on the batch, tree crowns (crownFrac), memeSpot / navLinks on the Level', async () => {
  let { L } = await buildM2('town');
  const ud = L.batch.mesh.userData;
  assert.ok(ud.camFadeRoofIds?.size >= 27, `roof instances ${ud.camFadeRoofIds?.size}`);
  assert.ok(ud.camFadeSolidIds?.size >= 10, `solid instances ${ud.camFadeSolidIds?.size}`);
  for (const id of ud.camFadeRoofIds) assert.ok(!ud.camFadeSolidIds.has(id), 'a roof is never a solid');
  assert.equal(L.navLinks.length, 4); assert.deepEqual(L.memeSpot.at, [0, 3.2]);
  assert.ok(L.zoneAt({ x: 0, z: 8 })?.id === 'square');
  assert.ok(L.zoneAt({ x: -30, z: 0 })?.id !== 'hub_view', 'the hub view waits for town.free');
  L.dispose();
  ({ L } = await buildM2('forest'));
  assert.ok(L.trees.filter((t) => t.userData.camFade === 'crown').every((t) => t.userData.crownFrac > 0.1 && t.userData.crownFrac <= 0.8));
  assert.ok(L.trees.some((t) => t.userData.camFade === 'crown'));
  assert.ok(L.batch.mesh.userData.camFadeSolidIds?.size >= 6, 'the 6 millstone pillars');
  assert.equal(L.zoneAt({ x: -26.4, z: -58.6 })?.id, 'mushroom_climb');
  L.dispose();
  ({ L } = await buildM2('gate'));
  assert.ok(L.root.getObjectByName('merged:gatehouse')?.userData.camFade === 'solid', 'the gatehouse fades as a solid');
  assert.ok(L.root.getObjectByName('merged:gate_towers')?.userData.camFade === 'solid');
  L.dispose();
});

test('LevelManager.setVisible("far") forces the far group; null returns it to automatic (hidden in iso play)', () => {
  const ctx = fakeCtx({ systems: false });
  ctx.scene = new THREE.Scene();
  ctx.env = { _focusMode: 1, sky: { mesh: new THREE.Object3D() } };
  const L = new Level(ctx, { id: 'f' });
  L._applyFar();
  assert.equal(L.groups.skyline.visible, false); assert.equal(ctx.env.sky.mesh.visible, false);
  const lm = new LevelManager(ctx); lm.current = L;
  lm.setVisible('far', true);
  assert.equal(L.groups.skyline.visible, true); assert.equal(L.groups.dawnstone.visible, true);
  lm.setVisible('far', null);
  assert.equal(ctx.env.sky.mesh.visible, false, 'automatic: hidden in iso');
  ctx.env._focusMode = 0; L._applyFar();
  assert.equal(ctx.env.sky.mesh.visible, true, 'a cutscene shows it');
  L.setDawnstone(false); assert.equal(L.groups.dawnstone.visible, false);
});

test('PropActor: breakables are assistable (the 7.2 soft auto-target / picker), the swinging sack is not', () => {
  const ctx = fakeCtx({ systems: false });
  assert.equal(new PropActor(ctx, { kind: 'crate', hp: 1 }).assistable, true);
  assert.equal(new PropActor(ctx, { kind: 'x', breakable: false }).assistable, false);
});

test('arenaAwareFog: cam.fog.mist drops to ARENA_MIST while an arena is locked; the def is not mutated', () => {
  const def = { clear: 5, forest_night: { clear: 4.5 } }, lv = { arenas: [{ locked: false, cleared: false }] };
  const f = arenaAwareFog(def, lv);
  assert.equal(f.mist, undefined, 'no authored value, no fight: the preset factor (fx) applies');
  assert.equal(f.clear, 5); assert.deepEqual(f.forest_night, { clear: 4.5 });
  lv.arenas[0].locked = true;
  assert.equal(f.mist, ARENA_MIST);
  lv.arenas[0].cleared = true;
  assert.equal(f.mist, undefined);
  const g = arenaAwareFog({ mist: 0.2 }, { arenas: [{ locked: true }] });
  assert.equal(g.mist, 0.2, 'an authored value below the arena factor wins');
  assert.equal('mist' in def, false);
  assert.equal(arenaAwareFog(undefined, { arenas: [] }).mist, undefined);
});

test('ARENA.wall: the fog wall is lighter and narrower than the fx defaults (iso readability)', () => {
  assert.ok(ARENA.wall.alpha <= 0.4 && ARENA.wall.width <= 4 && ARENA.wall.bandW <= 1.2 && ARENA.wall.bandA <= 0.15);
});

// ============================================================================================ warm look + perf + auto-camera
// IMPLEMENTATION_PLAN §6 world (A:world.1–8, P:W1–W10, M:world.1–5) and Phase W (world.W1–W10)
import { TONE, ENV_U, isoSunAz, fogRadius, ISO_SUN, rimColor, presetNames } from '../../src/world/Env.js';
import { footprintCorners, fitShadowBox, stepShadowFit, cacheBox, StaticShadow, SHADOW_STAGE, STATIC_CASTER_LAYER, tagStaticCasters } from '../../src/world/StaticShadow.js';
import { withHeightFog, patchGlow } from '../../src/world/HeightFog.js';
import { Grass, GRASS, GRASS_COLORS, FLOWER_COLORS, FLOWER_MUTE, mutedFlowers, makeTuftGeometry, grassTile } from '../../src/world/Grass.js';
import { Bunting, layoutBunting, makeBuntingGeometry, BUNTING_SHAPE } from '../../src/world/Bunting.js';
import { GROUND } from '../../src/world/Terrain.js';
import { matFor, worldMaterial, applyInkRim, PROP_PAL, RECOLOR, remapReds } from '../../src/world/Props.js';
import { magnetHop, POP_G, PICKUP_MOTION } from '../../src/world/Pickups.js';
import { WAYSTONE, STAGE, freezeStatics } from '../../src/world/LevelKit.js';
import { BUNTING, QUALITY, FADE_COLOR } from '../../src/core/config.js';

/** HSV saturation / value and Rec.709 luma (sRGB components) of a hex colour. */
const hsv = (hex) => {
  const n = parseInt(hex.slice(1), 16), R = ((n >> 16) & 255) / 255, G = ((n >> 8) & 255) / 255, B = (n & 255) / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  return { s: mx > 0 ? (mx - mn) / mx : 0, v: mx, luma: 0.2126 * R + 0.7152 * G + 0.0722 * B };
};
/** WA §2.3a fog HSV saturation minimum per preset (ART floor 0.12 for the rest). */
const FOG_SAT = { meadow_morning: 0.15, meadow_day: 0.15, meadow_evening: 0.18, meadow_giggle: 0.15, forest_day: 0.12, forest_twilight: 0.25, town_occupied: 0.15,
  hub_gold: 0.15, hub_hush: 0.12, gate_dusk: 0.18, bog_dusk: 0.15, keep_twilight: 0.20, keep_cellar: 0.20, keep_storm: 0.12, meadow_night: 0.25, sky_night: 0.25, ending_gold: 0.18 };
const SRC = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const listJs = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));

test('world.W1 / ART §11.3: every preset has shadowI, exposure, rim; warm haze (fog sat per WA §2.3a); no dark hemiGround; no near-black colour', () => {
  for (const [name, p] of Object.entries(ENV_PRESETS)) {
    for (const k of ['shadowI', 'exposure', 'rim', 'hero', 'lamps']) assert.ok(p[k] != null, `${name}: ${k}`);
    const f = hsv(p.fogColor);
    assert.ok(f.s >= (FOG_SAT[name] ?? 0.12) - 1e-3, `${name}: fog HSV sat ${f.s.toFixed(3)} ≥ ${FOG_SAT[name] ?? 0.12}`);
    assert.ok(hsv(p.hemiGround).v >= 0.25, `${name}: hemiGround V ${hsv(p.hemiGround).v.toFixed(2)} ≥ 0.25`);
    for (const k of ['fogColor', 'fogLow', 'skyTop', 'hemiSky', 'hemiGround', 'sunColor']) assert.ok(hsv(p[k]).luma >= 0.08, `${name}.${k} not near-black`);
    assert.ok(p.exposure >= 0.95 && p.exposure <= 1.15, `${name}: exposure`);
  }
  assert.deepEqual(presetNames('hub_hush').sort(), ['hub_grey', 'hub_hush']);
  assert.equal(rimColor('night'), TONE.rimNight); assert.equal(rimColor('#FFD8A0'), '#FFD8A0'); assert.equal(rimColor('day'), TONE.rimDay);
  assert.ok(Object.isFrozen(TONE) && TONE.ink === '#4A2A1E' && TONE.blob === '#5A4E7A');
  assert.equal(ENV_U.uLamps.value.length, 4);
});

test('world.W2: the mood timeline — no playable level default or byFlag pick is night (meadow_night / sky_night)', async () => {
  const NIGHT = new Set(['meadow_night', 'sky_night']);
  for (const id of LEVEL_IDS) {
    const env = (await loadDef(id)).env ?? {};
    const picks = [env.default, ...(env.byFlag ?? []).map((r) => r[1])].filter(Boolean).map(resolvePreset);
    for (const p of picks) { assert.ok(ENV_PRESETS[p], `${id}: ${p} exists`); assert.ok(!NIGHT.has(p), `${id}: ${p} is a callback-only night`); }
  }
  const d = await loadDef('meadow');
  assert.deepEqual(d.env.byFlag, [['!prologue.done', 'meadow_morning']]);
  assert.equal((await loadDef('bog')).env.default, 'bog_dusk'); assert.equal((await loadDef('keep')).env.default, 'keep_twilight');
  const lm = new LevelManager(fakeCtx({ systems: false }));
  assert.equal(lm.pickEnv('forest_night'), 'forest_twilight', 'pickEnv returns canonical names');
  assert.ok(!SRC('src/world/levels/forest.js').includes("'dark_forest_creepy'"), 'WA §9: Lantern Night music is not creepy');
});

test('world.W3 / LI W1: no grey defaults left in src/world (#B7C0C3 / #9AA196)', () => {
  const files = [...listJs('src/world'), ...listJs('src/world/levels')];
  for (const f of files) { const t = SRC(f); assert.ok(!/#B7C0C3|#9AA196/i.test(t), `${f} has a grey default`); }
});

test('world.W4 lints: kit.tpl never sat < 0.5 / mul < 0.8 without a // mood: note; kit.paint luma ≥ 0.30', () => {
  for (const f of listJs('src/world/levels')) {
    const lines = SRC(f).split('\n');
    lines.forEach((ln, i) => {
      for (const m of ln.matchAll(/\b(sat|mul):\s*([0-9.]+)/g)) {
        const v = Number(m[2]), bad = m[1] === 'sat' ? v < 0.5 : v < 0.8;
        if (bad) assert.ok(/\/\/\s*mood:/.test(ln), `${f}:${i + 1}: ${m[0]} without a // mood: note`);
      }
      for (const m of ln.matchAll(/kit\.paint\([^)]*'(#[0-9A-Fa-f]{6})'/g)) assert.ok(hsv(m[1]).luma >= 0.30, `${f}:${i + 1}: paint ${m[1]} luma ${hsv(m[1]).luma.toFixed(2)} < 0.30`);
    });
  }
});

test('ART §2.6 palettes: warm grounds, grass, flowers (no pink / orange near the path), shared prop tokens', () => {
  for (const [biome, g] of Object.entries(GROUND)) {
    assert.ok(hsv(g.path).luma >= 0.45, `${biome} path is bright (${hsv(g.path).luma.toFixed(2)})`);
    assert.ok(hsv(g.mid).luma >= 0.3 && hsv(g.root).luma >= 0.2, `${biome} grass ground is not near-black`);
  }
  for (const [biome, c] of Object.entries(GRASS_COLORS)) assert.ok(hsv(c.tip).luma > hsv(c.root).luma, `${biome}: tips lighter than roots`);
  for (const f of FLOWER_COLORS) { const hs = new THREE.Color(f).getHSL({}, THREE.SRGBColorSpace), h = hs.h * 360, s = hs.s; assert.ok(!(s > 0.35 && (h < 40 || h > 320)), `flower ${f} is not pink / orange (G19)`); }
  for (const k of ['wood', 'straw', 'iron', 'stone', 'hyena']) assert.ok(hsv(PROP_PAL[k]).luma >= 0.2, `PROP_PAL.${k}`);
  for (const [k, v] of Object.entries(RECOLOR)) assert.ok(hsv(v).luma >= 0.12, `RECOLOR.${k} ${v} not near-black`);
});

test('Env: iso sun from the level yaw (+1.75 day / +1.20 night, never a zone hint), background = fog, exposure eased, Low has no shadow map', async () => {
  assert.ok(near(isoSunAz(Math.PI), Math.PI + ISO_SUN.day) && near(isoSunAz(0, true), ISO_SUN.night));
  const ctx = fakeCtx({ systems: false });
  ctx.renderer = { toneMappingExposure: 1, shadowMap: { autoUpdate: true, needsUpdate: false } };
  ctx.quality = QUALITY.low;
  const env = new Env(ctx); await env.init();
  assert.equal(env.sunLight.castShadow, false, 'K3: Low (shadows none, map 0) never casts');
  assert.equal(ctx.scene.environment, null, 'no PMREM in play');
  assert.ok(!ctx.scene.getObjectsByProperty('isPointLight', true).length, 'K2: no PointLights');
  env.applyQuality(QUALITY.med);
  assert.equal(env.sunLight.castShadow, true); assert.equal(env.sunLight.shadow.mapSize.x, 1024);
  ctx.levels = { current: { cam: { yaw: Math.PI }, camYaw: Math.PI, camZone: { cam: { yaw: 0.3 } } } };
  env.preset('gate_dusk', 0); env._focusMode = 1;
  const d = env.sunDir(new THREE.Vector3()), az = Math.atan2(d.x, d.z);
  assert.ok(near(Math.cos(az), Math.cos(Math.PI + ISO_SUN.day), 1e-6) && near(Math.sin(az), Math.sin(Math.PI + ISO_SUN.day), 1e-6), 'level yaw + 1.75, the zone hint ignored');
  assert.equal(ctx.scene.background.getHexString(), ENV_PRESETS.gate_dusk.fogColor.slice(1).toLowerCase(), 'clear colour = fog colour');
  env.preset('forest_night', 0);
  assert.equal(env.presetName, 'forest_twilight');
  assert.ok(near(ctx.renderer.toneMappingExposure, ENV_PRESETS.forest_twilight.exposure, 1e-6), 'exposure from the preset');
  assert.ok(near(ENV_U.uLampStr.value, 1) && near(ENV_U.uGlow.value.w, 3.5), 'twilight: lamps on, full-radius glow');
  env.preset('meadow_day', 0);
  assert.ok(near(ENV_U.uLampStr.value, 0) && near(ENV_U.uGlow.value.w, 2.6), 'day: no lamp pools, the 2.6 m sun spot (WA4)');
  assert.ok(near(env.sunLight.shadow.intensity, 0.6), 'shadowI → shadow.intensity');
  assert.ok(near(fogRadius(0.045, 5, 1.5), 5 + 1.978 / (0.045 * 1.5)), 'PERF §8.3 fog radius');
  env.dispose();
});

test('HeightFog `hfog3`: ENV_U delivered, glow + lamp pools only in lit programs; constant cache key', () => {
  const lam = withHeightFog(new THREE.MeshLambertMaterial());
  assert.ok(lam.customProgramCacheKey().endsWith('|hfog3'));
  const lit = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  lam.onBeforeCompile(lit);
  assert.ok(lit.fragmentShader.includes('hfogPool(') && lit.uniforms.uLamps === ENV_U.uLamps && lit.uniforms.uGlow === ENV_U.uGlow);
  assert.ok(lit.fragmentShader.indexOf('hfogPool(vFogW, uGlow)') < lit.fragmentShader.indexOf('#include <opaque_fragment>'), 'added before opaque_fragment');
  const basic = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  withHeightFog(new THREE.MeshBasicMaterial()).onBeforeCompile(basic);
  assert.ok(!basic.fragmentShader.includes('hfogPool('), 'unlit programs keep their exact colours');
  const twice = patchGlow(patchGlow({ ...lit }));
  assert.equal(twice.fragmentShader.split('hfogPool(vFogW, uGlow)').length, 2, 'idempotent');
});

test('M:world.1 shadow stage 1: footprint corners from the camera, light-space fit + pad, grow at once / shrink with hysteresis; stage 2 cache box', () => {
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
  cam.position.set(0, 9.5, -8); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const c = footprintCorners(null, cam, 0, [0, 1, 2, 3].map(() => new THREE.Vector3()));
  assert.ok(c && c.every((p) => near(p.y, 0)), 'on the ground plane');
  assert.ok(c[2].z > c[1].z && Math.abs(c[2].x - c[3].x) > Math.abs(c[1].x - c[0].x), 'a trapezoid: wider at the top');
  const fp = { corners: [[-5, -4], [5, -4], [7, 9], [-7, 9]] };
  const q = footprintCorners(fp, null, 1, [0, 1, 2, 3].map(() => new THREE.Vector3()));
  assert.deepEqual(q.map((p) => [p.x, p.y, p.z]), [[-5, 1, -4], [5, 1, -4], [7, 1, 9], [-7, 1, 9]], 'camera-published corners win');
  const r = new THREE.Vector3(1, 0, 0), u = new THREE.Vector3(0, 0, 1);
  const box = fitShadowBox(q, r, u, 6, 1.5);
  assert.ok(near(box.halfX, 7 + 1.5) && near(box.halfY, 6.5 + 1.5) && near(box.cy, 2.5));
  const fit = { ok: false };
  stepShadowFit(fit, 10, 10); assert.deepEqual([fit.halfX, fit.halfY], [10, 10]);
  stepShadowFit(fit, 12, 10); assert.equal(fit.halfX, 12, 'grows at once');
  stepShadowFit(fit, 11, 10, 2, 1, 0.5); assert.equal(fit.halfX, 12, 'a 1 m shrink is ignored');
  stepShadowFit(fit, 9, 9, 2, 1, 0.5); assert.equal(fit.halfX, 12, 'a 3 m shrink waits');
  stepShadowFit(fit, 9, 9, 2, 1, 0.6); assert.equal(fit.halfX, 9, 'then shrinks after 1 s');
  const cb = {};
  assert.equal(cacheBox({ cx: 3, cy: 0, halfX: 10, halfY: 10 }, cb, 8, 8), true);
  assert.deepEqual([cb.hx, cb.cx], [18, 0], 'fit + 8 m margin, centre snapped to 8 m');
  assert.equal(cacheBox({ cx: 6, cy: 1, halfX: 10, halfY: 10 }, cb, 8, 8), false, 'inside the cached box: no re-render');
  assert.equal(cacheBox({ cx: 12, cy: 1, halfX: 10, halfY: 10 }, cb, 8, 8), true, 'leaves it: re-render');
  const st = new StaticShadow({ ctx: {} }); assert.equal(st.place({}, r, u, r, u, new THREE.Vector3()), false, 'no renderer: stage 1 keeps going');
});

test('PERF §7.3 shadow stage 2: static casters only, cached map re-renders only when the fit leaves its box', () => {
  assert.equal(SHADOW_STAGE, 2, 'stage 2 ships (cached statics-only sun map)');
  // tagging: level casters yes; skinned, non-casting, actors-group and dynamicShadow meshes no
  const geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial();
  const root = new THREE.Group(), actors = new THREE.Group(); root.add(actors);
  const wall = new THREE.Mesh(geo, mat); wall.castShadow = true; root.add(wall);
  const grass = new THREE.Mesh(geo, mat); grass.castShadow = false; root.add(grass);
  const npc = new THREE.Mesh(geo, mat); npc.castShadow = true; actors.add(npc);
  const gate = new THREE.Mesh(geo, mat); gate.castShadow = true; gate.userData.dynamicShadow = true; root.add(gate);
  assert.equal(tagStaticCasters(root, actors), 1);
  assert.ok(wall.layers.isEnabled(STATIC_CASTER_LAYER) && wall.layers.isEnabled(0), 'still drawn by the main camera');
  for (const o of [grass, npc, gate]) assert.ok(!o.layers.isEnabled(STATIC_CASTER_LAYER));
  // the shadow pass sees only the static layer; the main camera's mask is restored after it
  const seen = [];
  const sm = { autoUpdate: true, needsUpdate: false, render(lights, scene, cam) { seen.push(cam.layers.mask); } };
  const L = new THREE.DirectionalLight(); L.shadow.camera.updateProjectionMatrix();
  const env = { ctx: { renderer: { shadowMap: sm }, levels: { current: { root, groups: { actors } } } }, sunLight: L, tweening: false };
  const st = new StaticShadow(env);
  const r = new THREE.Vector3(1, 0, 0), u = new THREE.Vector3(0, 0, 1), f = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3(0, 1, 0);
  const fit = { cx: 0, cy: 0, halfX: 10, halfY: 10 }, p = new THREE.Vector3();
  assert.equal(st.place(fit, r, u, f, dir, p), true);
  assert.equal(sm.autoUpdate, false, 'autoUpdate off: three skips the pass unless needsUpdate');
  assert.equal(sm.needsUpdate, true); assert.equal(st.renders, 1); assert.equal(st.casters, 1);
  const cam = new THREE.PerspectiveCamera();
  sm.render([], null, cam);
  assert.deepEqual(seen, [1 << STATIC_CASTER_LAYER]); assert.equal(cam.layers.mask, 1, 'main camera mask restored');
  sm.needsUpdate = false;
  for (let i = 0; i < 30; i++) { fit.cx = i * 0.1; st.place(fit, r, u, f, dir, p); }
  assert.equal(sm.needsUpdate, false, 'walking inside the cached box: 0 shadow draws'); assert.equal(st.renders, 1);
  fit.cx = 20; st.place(fit, r, u, f, dir, p);
  assert.equal(sm.needsUpdate, true, 'left the box: one re-render'); assert.equal(st.renders, 2);
  st.dispose();
  assert.equal(sm.autoUpdate, true); sm.render([], null, cam);
  assert.equal(seen.at(-1), 1, 'unhooked after dispose');
});

test('WA §3.2 flowers: sparse (−60 %), off the path ±2 m, muted accent tints below the cream / gold pickup band', async () => {
  assert.ok(GRASS.flowerNear <= 0.033 && GRASS.flowerFar <= 0.013, 'shares cut ~60 % (8 % / 3 % → 3.2 % / 1.2 %)');
  assert.ok(GRASS.offPath >= 2);
  const { BUNTING_ACCENT } = await import('../../src/world/Bunting.js');
  for (const [k, set] of Object.entries(BUNTING_ACCENT)) {
    const fl = mutedFlowers(set);
    assert.equal(fl.length, FLOWER_MUTE.n);
    for (const f of fl) {
      const hs = new THREE.Color(f).getHSL({}, THREE.SRGBColorSpace);
      assert.ok(hs.s <= FLOWER_MUTE.satMax + 0.01, `${k} ${f}: muted (s ${hs.s.toFixed(2)})`);
      assert.ok(hs.l <= FLOWER_MUTE.lMax + 0.01, `${k} ${f}: never cream / white (l ${hs.l.toFixed(2)})`);
    }
  }
  // the terrain's ground data marks the path ±2 m (A ≥ 4: no flowers) and the near band (A in [2, 3])
  const { Terrain } = await import('../../src/world/Terrain.js');
  const T = new Terrain({ size: 60, res: 30, seed: 3, spine: [[0, -25], [0, 25]], pathWidth: 4 });
  T.build(); const out = T.finalize();
  {
    const W = 31, d = out.dataTexture.image.data, fromHalf = THREE.DataUtils.fromHalfFloat;
    const at = (x, z) => { const i = Math.round((z / 60 + 0.5) * (W - 1)) * W + Math.round((x / 60 + 0.5) * (W - 1)); return fromHalf(d[i * 4 + 3]); };
    assert.ok(at(0, 0) >= 3.4, 'on the spine: no flowers');
    assert.ok(at(2, 0) >= 3.4, 'path edge: no flowers'); assert.ok(at(-2, 0) >= 3.4, 'other edge: no flowers');
    assert.ok(at(4.6, 0) >= 1.4 && at(4.6, 0) < 3.4, 'path edge + 2 m: the near-spine band begins');
    assert.ok(at(20, 0) < 1.4, 'far field');
  }
});

test('PERF §8.4 / AUTOCAM §9.4 grass: one tuft mesh (6 tris + a collapsed 2-tri petal cap), quality counts, tile ⊇ footprint + 3 m', () => {
  const g = makeTuftGeometry();
  assert.equal(g.index.count / 3, 8, 'PERF §8.4: 6 blade tris + a 2-tri petal cap'); assert.equal(g.attributes.aCap.array.filter((v) => v > 0).length, 4, '2-tri petal quad');
  for (let i = 0; i < g.attributes.normal.count; i++) assert.ok(g.attributes.normal.getY(i) > 0.6, 'normals bent toward up');
  const tex = new THREE.DataTexture(new Uint16Array(4 * 4), 2, 2, THREE.RGBAFormat, THREE.HalfFloatType);
  for (const q of ['low', 'med', 'high']) {
    const gr = new Grass({ ground: tex, size: 100, res: 1, quality: QUALITY[q] });
    assert.equal(gr.count, QUALITY[q].grassTufts, `${q}: fixed count`);
    assert.equal(gr.group.children.length, 1, '1 draw for grass + flowers');
    assert.equal(gr.mesh.receiveShadow, false); assert.equal(gr.mesh.castShadow, false);
    gr.dispose();
  }
  // the tile covers the camera footprint + pad for desktop / phone / boss distances
  for (const d of [9, 12.4, 18, 22]) {
    const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
    cam.position.set(0, d * Math.sin(0.87), -d * Math.cos(0.87)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const gr = new Grass({ ground: tex, size: 200, res: 1, quality: QUALITY.med });
    gr.update(0, null, new THREE.Vector3(), null, cam, null);
    const T = gr.uniforms.uTile.value, c = gr.uniforms.uCenter.value;
    const cs = footprintCorners(null, cam, 0, [0, 1, 2, 3].map(() => new THREE.Vector3()));
    for (const p of cs) assert.ok(Math.abs(p.x - c.x) <= T / 2 - GRASS.pad + 1e-6 || T === GRASS.tileMax, `d ${d}: corner x inside the tile`);
    for (const p of cs) assert.ok(Math.abs(p.z - c.y) <= T / 2 - GRASS.pad + 1e-6 || T === GRASS.tileMax, `d ${d}: corner z inside the tile`);
    assert.ok(T >= GRASS.tileMul * d - 1e-6 || T === GRASS.tileMax, 'T ≥ 1.6 · d');
    gr.dispose();
  }
  assert.ok(grassTile(12.4) >= 19.84 && grassTile(12.4) % GRASS.tileQuant === 0, 'quantised');
});

test('world.W7 Bunting: one draw, caps (240 / Low 120 pennants, 60 / 30 lanterns), ≤ 480 / 240 tris, no shadow', () => {
  const long = [{ a: [0, 4, 0], b: [0, 4, 400] }];
  const hi = layoutBunting(long), lo = layoutBunting(long, { low: true });
  assert.equal(hi.pennants, BUNTING.max); assert.equal(lo.pennants, BUNTING.maxLow);
  assert.ok(hi.tris <= BUNTING_SHAPE.maxTris && lo.tris <= BUNTING_SHAPE.maxTrisLow);
  assert.equal(hi.tris, hi.pennants * 2);
  const lan = layoutBunting([{ a: [0, 4, 0], b: [0, 4, 400], kind: 'lantern' }]), lanLo = layoutBunting([{ a: [0, 4, 0], b: [0, 4, 400], kind: 'lantern' }], { low: true });
  assert.equal(lan.lanterns, BUNTING.lanternMax); assert.equal(lanLo.lanterns, BUNTING.lanternMaxLow);
  assert.equal(lan.tris, lan.lanterns * 8); assert.ok(lan.tris <= 480 && lanLo.tris <= 240);
  const mixed = layoutBunting([{ a: [0, 4, 0], b: [0, 4, 200] }, { a: [5, 4, 0], b: [5, 4, 200], kind: 'lantern' }]);
  assert.ok(mixed.tris <= 480, `mixed tri cap (${mixed.tris})`);
  // the catenary: sags 12 % of the span, never below minH above the ground, 0.55 m spacing
  const one = layoutBunting([{ a: [0, 6, 0], b: [0, 6, 11] }], { heightAt: () => 1 });
  const ys = one.items.map((i) => i.y);
  assert.ok(Math.min(...ys) >= 1 + BUNTING.minH - 1e-9 && Math.min(...ys) < 7, 'sags but stays above minH');
  assert.equal(one.items.length, Math.floor(11 / BUNTING.spacing) + 1);
  const b = new Bunting([{ a: [0, 4, 0], b: [0, 4, 10] }]);
  assert.ok(b.mesh.isInstancedMesh && b.mesh.castShadow === false && b.mesh.receiveShadow === false);
  assert.equal(makeBuntingGeometry({ pennant: true }).attributes.position.count / 3, BUNTING_SHAPE.triPennant, 'pennant + its string tent');
  assert.ok(makeBuntingGeometry({ pennant: false, lantern: true }).attributes.position.count / 3 <= BUNTING_SHAPE.triLantern, 'lantern + string ≤ 8 tris');
  b.update(1, { wind: 0.8 }); assert.equal(b.uniforms.uWind.value, 0.8);
  b.dispose();
  assert.equal(new Bunting([]).mesh, null, 'no strings, no draw');
});

test('world.W8 arena stage floors: every arena zone gets a lighter calm paint (+8 % L) and thinner grass', async () => {
  const def = { id: 'stagetest', size: 60, res: 30, seed: 3, spine: [[0, -25], [0, 25]], biome: 'meadow', horizon: false, grass: false,
    zones: [{ id: 'a1', kind: 'arena', at: [10, 0], r: 6, waves: [] }, { id: 'a2', kind: 'arena', at: [-10, 5], size: [8, 6], waves: [] }] };
  const ctx = fakeCtx(); ctx.assets.gltf = async (p) => stubGltf(p);
  const L = await buildLevel(ctx, def);
  assert.deepEqual(L.stages.map((s) => s.id), ['a1', 'a2']);
  const path = new THREE.Color(GROUND.meadow.path).getHSL({}, THREE.SRGBColorSpace).l;
  for (const s of L.stages) assert.ok(new THREE.Color(s.color).getHSL({}, THREE.SRGBColorSpace).l > path + STAGE.lift - 4e-3, 'lifted path colour (sRGB L)');
  assert.ok(L.terrain.densityAt(10, 0) <= STAGE.grass + 1e-6, 'grass thinned to ≤ 0.4 inside');
  assert.ok(freezeStatics(L) > 0, 'static render outputs stop updating matrices');
  assert.equal(L.batch.mesh.matrixAutoUpdate, false);
  L.dispose();
});

test('world.W9 pickups: the magnet pull hops (y above the straight pull mid-flight), kill drops pop to 0.9 m and bounce twice', () => {
  assert.ok(magnetHop(0.5) > 0 && near(magnetHop(0.5), 0.35) && magnetHop(0) === 0 && magnetHop(1) === 0);
  assert.ok(near(POP_G * PICKUP_MOTION.popT * PICKUP_MOTION.popT / 8, PICKUP_MOTION.popApex));
  const ctx = fakeCtx({ systems: false });
  ctx.player = { pos: new THREE.Vector3(0, 0, 0), alive: true, radius: 0.32, hp: 3, maxHp: 6 };
  const pk = new Pickups(ctx, { heightAt: () => 0, levelId: 'test', root: new THREE.Group() });
  pk.spawnFish(new THREE.Vector3(2.4, 0, 0), 1, { pop: false });
  const it = pk.items[0];
  let maxLift = 0;
  for (let i = 0; i < 30 && it.alive; i++) { pk.update(1 / 60); maxLift = Math.max(maxLift, it.pos.y - 0.4); }
  assert.ok(maxLift > 0.05, `the magnet pull hops (${maxLift.toFixed(3)} m)`);
  // a kill drop: apex ≈ 0.9 m, then two bounces before it rests
  ctx.player.pos.set(100, 0, 100);
  pk.spawnFish(new THREE.Vector3(0, 0, 0), 1);
  const f = pk.items[pk.items.length - 1]; f.delay = 0;
  let apex = 0, landed = 0, wasAir = true;
  for (let i = 0; i < 240; i++) { pk.update(1 / 60); apex = Math.max(apex, f.pos.y - PICKUP_MOTION.rest); if (wasAir && f.vel.y > 0 && i > 2) { /* bounce */ } wasAir = f.air; }
  assert.ok(apex > 0.7 && apex < 1.1, `pop apex ${apex.toFixed(2)} ≈ 0.9 m`);
  assert.equal(f.air, false); assert.equal(f.bounces, 2, 'two bounces'); void landed;
  pk.render(1, 1 / 60);
  assert.ok(pk.twinkles.includes(f), 'resting pickups are listed for the fx twinkles');
  pk.dispose();
});

test('PERF §3.5 / ART §4.2 materials: Lambert + dithering, one clone per mesh kind (no re-resolves), ink rim composes', () => {
  const base = worldMaterial();
  assert.ok(base.isMeshLambertMaterial && base.dithering && base.vertexColors);
  const inst = matFor(base, 'instanced'), bat = matFor(base, 'batched');
  assert.ok(inst !== base && bat !== base && inst !== bat);
  assert.equal(matFor(base, 'instanced'), inst, 'cached per kind');
  assert.equal(matFor(base, 'plain'), base);
  const ink = applyInkRim(worldMaterial(), 0.68);
  // PERF §1.2: the ink rim is a uniform of the one world-static program (no '|ink' key variant)
  assert.equal(ink.customProgramCacheKey(), 'world-static-v1');
  assert.equal(ink.userData.wsU.uWInk.value, 0.68);
  assert.equal(worldMaterial().customProgramCacheKey(), 'world-static-v1', 'plain world materials share it');
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  ink.onBeforeCompile(sh);
  assert.ok(sh.fragmentShader.includes('inkE'));
  assert.equal(applyInkRim(ink), ink, 'idempotent');
});

test('Arena: a soft arena (Mochi cart) has no wall, never pulls her in; the lock payload carries center / r', () => {
  const ctx = fakeCtx({ systems: false });
  const enemies = fakeEnemies(); ctx.enemies = enemies;
  let mist = 0; ctx.fx = { mistRing: () => { mist++; return { dispose() {} }; } };
  ctx.player = { pos: new THREE.Vector3(0, 0, -20), alive: true, vel: new THREE.Vector3(), teleport() { throw new Error('pulled'); } };
  const bus = spy(ctx);
  const a = new Arena(ctx, { id: 'cart', at: [0, 0], r: 9, soft: true, waves: [[['rat_pike', 3]]] }, () => 0, null);
  a.lock();
  assert.equal(mist, 0, 'no fog wall'); assert.equal(a._wallColliders.length, 0);
  const p = bus.last(E.ARENA_LOCK); assert.deepEqual([p.id, p.r, p.soft], ['cart', 9, true]);
  ctx.player.pos.set(0, 0, -9.6);
  for (let i = 0; i < 90; i++) a.update(1 / 60);
  assert.equal(enemies.list.length, 3, 'wave 1 after the room read');
  assert.ok(near(ctx.player.pos.z, -9.6), 'never kept inside');
});

test('Level.refresh: zones that wait for a flag (Chapter 1) switch on live, once', () => {
  const ctx = fakeCtx({ systems: false });
  const L = new Level(ctx, { id: 't', size: 50, spine: [[0, -20], [0, 20]] });
  let ran = 0, flag = false;
  L.onCond(() => flag, () => { ran++; });
  L.activate('start');
  assert.equal(ran, 0);
  flag = true; assert.equal(L.refresh(), 1); assert.equal(ran, 1);
  assert.equal(L.refresh(), 0, 'once'); assert.equal(ran, 1);
});

test('LI W10 waystones, meadow warm data (bunting, skyline, chest), cream load veil, clouds in the far group only', async () => {
  assert.ok(!SRC('src/world/LevelKit.js').includes('statue_obelisk'), 'no graveyard obelisk');
  assert.equal(WAYSTONE.ribbon, '#FF8FB1');
  const d = await loadDef('meadow');
  assert.ok(d.bunting.length >= 1 && d.skyline.every((s) => !/castle/.test(s.model)), 'LI W7: no castle skyline');
  assert.ok(levelModelPaths(d).some((p) => p.includes('cloud_big')), 'WA §2.8 clouds');
  assert.equal(FADE_COLOR, '#FFF1DE');
  assert.ok(SRC('src/world/LevelManager.js').includes('FADE_COLOR'), 'core.W3: LevelManager veils in cream');
  const ctx = fakeCtx(); ctx.assets.gltf = async (p) => stubGltf(p);
  const L = await buildLevel(ctx, { id: 'cl', size: 60, res: 20, seed: 2, spine: [[0, -25], [0, 25]], biome: 'meadow', grass: false, skyline: [] });
  const clouds = L.groups.skyline.getObjectByName('clouds');
  assert.ok(clouds?.isMesh, 'one merged cloud mesh'); assert.ok(fxFogged(clouds.material) === false);
  L.dispose();
});

// ------------------------------------------------------------------ Phase W / PERF follow-ups (flames, tiers, probes)

test('PERF W7 flames: every flame of a level shares 2 instanced draws; lighting / dousing only rewrites a matrix', async () => {
  const { FlameSet, addFlame, FLAME } = await import('../../src/world/Dressing.js');
  const level = { groups: { props: new THREE.Group() }, animators: [] };
  const lamps = new LampSet();
  const pool = new LightPool(level.groups.props, 2, { lamps });
  const handles = [];
  for (let i = 0; i < FLAME.cap + 5; i++) handles.push(addFlame(level, pool, i, 1, -i, { size: 0.5, on: i % 2 === 0 }));
  const fs = level.flames;
  assert.ok(fs instanceof FlameSet);
  const meshes = level.groups.props.children.filter((o) => o.isInstancedMesh);
  assert.equal(meshes.length, 2, 'cones + halos, grown in place past the initial cap');
  assert.equal(fs.cones.count, FLAME.cap + 5); assert.equal(fs.glows.count, (FLAME.cap + 5) * 2);
  assert.equal(level.animators.length, 1, 'one flicker clock per level');
  for (const m of meshes) { assert.equal(m.castShadow, false); assert.equal(m.material.userData.noHeightFog, true); }
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3();
  fs.cones.getMatrixAt(1, m4); s.setFromMatrixScale(m4); assert.equal(s.x, 0, 'an unlit flame is a zero-scale instance');
  const prog = fs.coneMat.customProgramCacheKey();
  handles[1].set(true);
  fs.cones.getMatrixAt(1, m4); s.setFromMatrixScale(m4); assert.ok(near(s.x, 0.5));
  assert.equal(handles[1].on, true); assert.equal(handles[1].source.on, true, 'the lamp pool follows');
  assert.equal(fs.coneMat.customProgramCacheKey(), prog, 'no program change');
  level.animators[0].render(0.016, 3.5); assert.equal(fs.uniforms.uTime.value, 3.5);
  assert.equal(fs.draws, 2);
  fs.dispose();
});

test('PERF §5.4 grass thermal scale: a prefix of the tufts, clamped, idempotent; level groups carry perfCat', async () => {
  const { Grass } = await import('../../src/world/Grass.js');
  const tex = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
  const g = new Grass({ ground: tex, size: 40, res: 3, count: 1000 });
  assert.equal(g.count, 1000);
  g.setScale(0.5); assert.equal(g.count, 500);
  g.setScale(0.5); assert.equal(g.count, 500);
  g.setScale(7); assert.equal(g.count, 1000);
  g.setScale(NaN); assert.equal(g.count, 1000);
  g.dispose();
  const { GROUP_PERF_CAT } = await import('../../src/world/Level.js');
  const L = new Level(fakeCtx({ systems: false }), { id: 't', size: 20 });
  assert.equal(L.groups.grass.userData.perfCat, 'grass');
  for (const k of Object.keys(GROUP_PERF_CAT)) assert.ok(L.groups[k]?.userData.perfCat, k);
});

test('PERF §10.3 / §3.3 LevelManager: next-level order, warm roots (level groups + visible scene children)', async () => {
  const { nextLevelId, warmRoots, PREFETCH, PREWARM } = await import('../../src/world/LevelManager.js');
  assert.equal(nextLevelId('meadow'), 'forest'); assert.equal(nextLevelId('bog'), 'keep');
  assert.equal(nextLevelId('keep'), null); assert.equal(nextLevelId('nope'), null);
  assert.ok(PREFETCH.delay === 5 && PREWARM.batch > 0 && PREWARM.frames === undefined, 'no culling-off real frames any more');
  const scene = new THREE.Scene(), root = new THREE.Group(), a = new THREE.Group(), b = new THREE.Group(), hidden = new THREE.Group();
  hidden.visible = false;
  root.add(a, b, hidden);
  const enemy = new THREE.Group(), light = new THREE.DirectionalLight();
  scene.add(root, enemy, light);
  assert.deepEqual(warmRoots(scene, root), [a, b, enemy]);
});

test('ART G6 shadow probe: the nearest tall solid by the start spawn; shade down-sun, lit beside it', async () => {
  const { autoShadowProbe, levelSunAz, SHADOW_PROBE } = await import('../../src/world/LevelKit.js');
  const cols = { circles: [{ x: 4, z: 0, r: 1, y0: -0.6, y1: 4.0 }, { x: 1, z: 0, r: 0.3, y0: -0.6, y1: 8, camFade: true }, { x: 2, z: 0, r: 1, y0: -0.6, y1: 1 }], boxes: [] };
  const az = 0;                     // sun toward +Z → shadows fall toward −Z
  const p = autoShadowProbe(cols, { x: 0, z: 0 }, az, Math.PI / 4);   // 45°: shadow length = h (4.6 − 0.6 = 4 m)
  const off = Math.max(SHADOW_PROBE.gap, SHADOW_PROBE.mid * 4);
  assert.deepEqual(p.shade, [4, -(1 + off)], 'mid-shadow, down-sun');
  assert.deepEqual(p.lit, [4 + 1 + SHADOW_PROBE.litOff, -(1 + off)], 'beside the shade point, out of the shadow width');
  assert.equal(autoShadowProbe(cols, { x: 100, z: 0 }, az), null, 'nothing near');
  assert.ok(Number.isFinite(levelSunAz({ cam: { yaw: Math.PI } })));
  const def = await loadDef('town');
  assert.ok(Array.isArray(def.farKeep) && def.farKeep.length >= 1, 'town keeps the Bell Tower inside far');
  assert.ok(def.spawns.square, 'a Square spawn for the iso smoke');
  const sq = def.spawns.square;
  assert.ok(near(Math.hypot(sq[0] - SQUARE.at[0], sq[1] - SQUARE.at[1]), SQUARE.r - 1), 'on the south rim of the Square');
  for (const id of ['meadow', 'gate']) assert.ok((await loadDef(id)).farKeep?.length, `${id} farKeep`);
});

test('PERF §3.3 Env.prewarmShadows: one shadow render over the whole level, the sun box restored afterwards', async () => {
  const { Env } = await import('../../src/world/Env.js');
  const ctx = fakeCtx({ systems: false });
  ctx.renderer = { toneMappingExposure: 1, shadowMap: { autoUpdate: true, needsUpdate: false } };
  ctx.quality = QUALITY.med;
  const env = new Env(ctx); await env.init();
  const sc = env.sunLight.shadow.camera, before = [sc.left, sc.right, sc.top, sc.bottom, sc.far];
  let seen = null;
  const r = { shadowMap: { needsUpdate: false }, render: () => { seen = [sc.left, sc.right, sc.far]; } };
  assert.equal(env.prewarmShadows(r, new THREE.PerspectiveCamera(), 80), true);
  assert.ok(seen && seen[0] <= -80 && seen[1] >= 80 && seen[2] >= 240, 'rendered with the whole-level box');
  assert.deepEqual([sc.left, sc.right, sc.top, sc.bottom, sc.far], before, 'box restored');
  assert.equal(r.shadowMap.needsUpdate, true, 'the real map re-renders next frame');
  env.applyQuality(QUALITY.low);
  assert.equal(env.prewarmShadows(r, new THREE.PerspectiveCamera(), 80), false, 'Low has no shadow map: nothing to warm');
});

test('WA §2.5 / LI W11 candy-row reds: maroon / crimson bake onto candy coral, other hues untouched, shading order kept', () => {
  const target = new THREE.Color('#E06A6A'), hsl = {};
  const maroon = remapReds(new THREE.Color('#6A2A2A'), target).getHSL({}, THREE.SRGBColorSpace);
  const crimson = remapReds(new THREE.Color('#A8283A'), target).getHSL({}, THREE.SRGBColorSpace);
  target.getHSL(hsl, THREE.SRGBColorSpace);
  assert.ok(Math.abs(maroon.h - hsl.h) < 0.01 && maroon.l >= hsl.l * 0.5, `maroon lifted (l ${maroon.l.toFixed(2)})`);
  assert.ok(crimson.l > maroon.l, 'light / dark order kept');
  for (const hex of ['#B7773F', '#58A84A', '#6F8FC4', '#E8D8BC']) assert.equal(remapReds(new THREE.Color(hex), target).getHexString(), new THREE.Color(hex).getHexString(), `${hex} untouched`);
});

test('WA §2.5 practice dummies are straw dummies (no bullseye target model); forest twilight has path lanterns', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../src/world/levels/meadow.js', import.meta.url), 'utf8');
  assert.ok(!/decoration\/target\.glb/.test(src), 'the archery target is gone');
  assert.ok(/kit\.proc\('straw_dummy'/.test(src));
  const { PATH_LANTERNS } = await import('../../src/world/levels/forest.js');
  assert.ok(PATH_LANTERNS.n >= 10, 'lamp pools along the whole walk');
});

test('PERF §1.2 triangle budget: ground tiles ≈ 40 m (frustum-culled), per-tier wheat clumps', async () => {
  const { groundChunks } = await import('../../src/world/Terrain.js');
  // meadow / forest (200 cells × 1 m): 5 tiles a side, 40 cells each (even → half-res LOD fits)
  assert.equal(groundChunks(200, 1), 5);
  // Low (100 cells × 2 m): 5 a side (40 m tiles)
  assert.equal(groundChunks(100, 2), 5);
  // gate (120 × 1.5 m) and town (140 × 1 m)
  assert.equal(groundChunks(120, 1.5), 5);
  assert.equal(groundChunks(140, 1), 4, 'town: 35 m tiles (not the old 70 m halves)');
  assert.equal(groundChunks(20, 2), 1, 'a small ground stays one tile');
  const { WHEAT } = await import('../../src/world/Wheat.js');
  const tris = (q) => makeWheatClumpGeometry(3, WHEAT, WHEAT.tiers[q]).index.count / 3;
  assert.equal(tris('high'), 90); assert.equal(tris('med'), 49); assert.equal(tris('low'), 42);
  const f = new WheatField({ seed: 2, quality: 'low' }); f.add(0, 0, 0);
  assert.equal(f.build().geometry.index.count / 3, 42); f.dispose();
});

test('world review: bunting strings read as strings (cocoa tent to both neighbours, per string, in the same draw)', async () => {
  const { BUNTING_CORD } = await import('../../src/world/Bunting.js');
  const L = layoutBunting([{ a: [0, 5, 0], b: [0, 5, 4] }, { a: [3, 5, 0], b: [3, 5, 4], kind: 'lantern' }]);
  const s0 = L.items.filter((i) => i.s === 0), s1 = L.items.filter((i) => i.s === 1);
  assert.ok(s0.length > 2 && s1.length > 2);
  assert.deepEqual(s0[0].cord.slice(0, 2), [0, 0], 'first item: no previous chord');
  assert.deepEqual(s0.at(-1).cord.slice(2), [0, 0], 'last item: no next chord (never bridges to the next string)');
  for (let i = 1; i < s0.length; i++) {
    assert.ok(near(s0[i].cord[0], s0[i - 1].cord[2], 1e-9) && near(s0[i].cord[1], -s0[i - 1].cord[3], 1e-9), 'shared chord');
    assert.ok(near(s0[i].cord[0], Math.hypot(s0[i].x - s0[i - 1].x, s0[i].z - s0[i - 1].z), 1e-9));
  }
  const b = new Bunting([{ a: [0, 4, 0], b: [0, 4, 6] }]);
  assert.equal(b.geometry.attributes.aCord.itemSize, 4);
  assert.equal(b.geometry.attributes.aCord.count, b.layout.items.length);
  const sh = { uniforms: {}, vertexShader: ['#include <common>', '#include <begin_vertex>'].join('\n'),
    fragmentShader: ['#include <common>', '#include <color_fragment>', '#include <emissivemap_fragment>'].join('\n') };
  b.material.onBeforeCompile(sh);
  assert.match(sh.vertexShader, /aCord/); assert.match(sh.fragmentShader, /vCord/);
  assert.ok(/^#6B4A3A$/i.test(BUNTING_CORD));
  b.dispose();
});

test('world review: gate toy gate (wood, rounded teeth, pennants), rope winch, deck paint + parapet bunting / shields', async () => {
  const gate = await import('../../src/world/levels/gate.js');
  const cols = (parts) => parts.map(([, c]) => String(c).toUpperCase());
  const tg = gate.toyGateParts(6.4, 4.9);
  assert.ok(!cols(tg).includes('#6E7A8E') && !cols(tg).includes('#8E96A2'), 'no iron grey on the gate');
  assert.ok(tg.some(([g]) => g.type === 'SphereGeometry'), 'rounded teeth');
  assert.ok(tg.filter(([g]) => g.type === 'ConeGeometry').length >= 9, 'a pennant row under the beam');
  const tpl = procTemplate('tg', tg);
  assert.ok(near(tpl.box.min.y, 0, 1e-6) && near(tpl.box.max.x - tpl.box.min.x, 6.6, 1e-6), 'built to the passage');
  const rope = gate.winchRopeParts(4.8, 6);
  assert.ok(rope.every(([g, c]) => g.type === 'CylinderGeometry' && String(c).toUpperCase() !== '#6E7A8E'), 'rope, not chain');
  const paint = gate.deckPaintParts(gate.DECK_PAINT.z0, gate.DECK_PAINT.z1);
  const band = new THREE.Box3().setFromBufferAttribute(paint[0][0].attributes.position);
  assert.ok(band.min.z <= -10 && band.max.z >= 30 && band.max.y < 0.012, 'sand band under the chalk across the Line + B2 arena');
  for (const [z0, z1] of gate.DECK_DRESS.runs) assert.ok(gate.onParapet(z0) && gate.onParapet(z1), `poles stand on parapets (${z0}, ${z1})`);
  const runs = gateDef.bunting.slice(0, gate.DECK_DRESS.runs.length * 2);
  assert.ok(runs.every((r) => Math.abs(r.a[0]) === gate.DECK_DRESS.x), 'parapet strings first (Low keeps them)');
  const low = layoutBunting(gateDef.bunting, { low: true });
  assert.ok(low.items.some((i) => i.z > -10 && i.z < 30), 'Low keeps bunting over the arena');
  assert.ok(layoutBunting(gateDef.bunting).dropped === 0, 'High draws every pennant');
  assert.ok(!gateDef.models.some((m) => /metal-gate/.test(m)), 'iron portcullis model no longer loaded');
});

test('world review: the prologue practice field lifts the low morning sun and softens shadows from above only', async () => {
  const ctx = fakeCtx({ systems: false });
  ctx.renderer = { toneMappingExposure: 1, shadowMap: { autoUpdate: true, needsUpdate: false } };
  ctx.quality = QUALITY.med;
  const env = new Env(ctx); await env.init();
  const { default: meadowDef } = await import('../../src/world/levels/meadow.js');
  ctx.levels = { current: { cam: meadowDef.cam, camYaw: Math.PI } };
  env.preset('meadow_morning', 0);
  env._focusMode = 0; env._apply?.(false);
  const eye = env.sunDir(new THREE.Vector3());
  assert.ok(near(Math.asin(eye.y), ENV_PRESETS.meadow_morning.sunElev, 1e-6), 'cutscenes keep the golden low sun');
  env._focusMode = 1; env._apply?.(false);
  const iso = env.sunDir(new THREE.Vector3());
  assert.ok(near(Math.asin(iso.y), 0.75, 1e-6), 'from above: 43° sun, off-screen shadows ~1.1× height');
  assert.ok(near(env.sunLight.shadow.intensity, 0.45, 1e-6), 'softer shadow (ART §3.4 floor 0.45)');
  env.preset('meadow_day', 0); env._apply?.(false);
  assert.ok(near(Math.asin(env.sunDir(new THREE.Vector3()).y), ENV_PRESETS.meadow_day.sunElev, 1e-6), 'a higher preset sun is never lowered');
});

test('Token Tails: the Rescue House keeper stands by the fountain; only line keys strings has are spoken', async () => {
  const { RESCUE_KEEPER, keeperLines, HUB_KITTEN_SPOTS, STATIONS } = await import('../../src/world/Hub.js');
  assert.equal(RESCUE_KEEPER.id, 'tokentails_cat');
  assert.equal(RESCUE_KEEPER.speaker, 'name.ttcat');
  assert.deepEqual([...RESCUE_KEEPER.lines], ['npc.ttcat.1', 'npc.ttcat.2', 'npc.ttcat.3']);
  const [x, z] = RESCUE_KEEPER.at;
  assert.ok(Math.hypot(x - 0, z - 8) < 8, 'near the fountain where the rescued kittens gather');
  for (const s of Object.values(HUB_KITTEN_SPOTS)) assert.ok(Math.hypot(s.at[0] - x, s.at[1] - z) > 1.5, 'clear of the kitten spots');
  for (const s of STATIONS) assert.ok(Math.hypot(s.use[0] - x, s.use[1] - z) > 3.5, `clear of station ${s.id}`);
  assert.deepEqual(keeperLines(null), []);
  assert.deepEqual(keeperLines({ has: () => false }), [], 'a missing key is never shown');
  assert.deepEqual(keeperLines({ has: (k) => k !== 'npc.ttcat.2' }), ['npc.ttcat.1', 'npc.ttcat.3']);
});
