// tests/unit/world.test.js  (owner: world) — pure-module tests for src/world: Env fog maths and presets, Objectives,
// the Arena template, Level water / surface / triggers, Terrain carving, VigilStone checkpoints, Pickups, the level
// definitions (U12 for the M1 scope: meadow complete, the other five bootable), the manifest sync, and a full
// headless build of the meadow with stub GLBs (zones → arenas, vigils, triggers, spawns, anchors, colliders).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { fakeCtx } from './_fakeCtx.mjs';
import { E } from '../../src/core/events.js';
import { ENEMIES, BOSSES, KITTENS_BY_LEVEL, KITTEN_IDS, LEVEL_IDS, ATTACKS } from '../../src/core/config.js';
import { ENV_PRESETS, finalFog, toState } from '../../src/world/Env.js';
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

test('Env: every §5.3 / §12.2 preset exists with the art.md values', () => {
  const need = ['meadow_day', 'meadow_evening', 'meadow_night', 'forest_day', 'forest_night', 'town_occupied', 'hub_gold', 'hub_grey', 'ending_gold',
    'gate_dusk', 'bog', 'keep_storm', 'keep_cellar', 'sky_night', 'sky_sunrise'];
  for (const n of need) assert.ok(ENV_PRESETS[n], `preset ${n}`);
  const d = ENV_PRESETS.meadow_day;
  assert.equal(d.fogColor, '#B7C0C3'); assert.equal(d.fogDensity, 0.045); assert.equal(d.skyTop, '#C3CCD3');
  assert.equal(d.hemiSky, '#D5DDE3'); assert.equal(d.hemiGround, '#4A5230'); assert.equal(d.sunColor, '#FFF2E0'); assert.equal(d.sun, 1.4);
  assert.equal(ENV_PRESETS.meadow_night.fogColor, '#8C97A6'); assert.equal(ENV_PRESETS.meadow_night.grade, 'night');
  assert.equal(ENV_PRESETS.meadow_evening.fogDensity, 0.020);
  assert.equal(ENV_PRESETS.bog.fogFalloff, 1.2);
  assert.equal(ENV_PRESETS.hub_grey.grade, 'grey');
  assert.equal(ENV_PRESETS.ending_gold.grade, 'gold');
  const s = toState(d);
  assert.ok(s.fogColor.isColor && near(s.fogDensity, 0.045));
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
  a.lock(); enemies.killAll();
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
const CUTSCENES = new Set(['cs00', 'cs01', 'cs02', 'cs03', 'cs04', 'cs05', 'cs06', 'cs07', 'cs08', 'cs09', 'cs10', 'cs11', 'cs12', 'cs13', 'cs14', 'cs15', 'cs16',
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
  assert.deepEqual(def.spawns.title.slice(0, 2), [0, -64]); assert.deepEqual(def.spawns.practice, [-10, -90, 0]); assert.deepEqual(def.spawns.start, [-1.5, -54.5, -0.4]);
  const z = Object.fromEntries(def.zones.map((x) => [x.id, x]));
  const kittens = def.zones.filter((x) => x.kind === 'kitten');
  assert.deepEqual(kittens.map((k) => k.kittenId).sort(), [...KITTENS_BY_LEVEL.meadow].sort());
  assert.deepEqual([z.noodle.hide, z.button.hide, z.biscuit.hide], ['meow', 'stand', 'meow']);
  assert.equal(z.button.needClear, 'stones');
  assert.deepEqual(z.letter_1.at, [-18, -24]); assert.equal(z.letter_1.letterId, 'l1');
  assert.deepEqual([z.tallbert.play, z.tallbert.at, z.tallbert.r], ['g01', [0, -61], 2.5]);
  assert.deepEqual([z.lane.play, z.lane.at, z.lane.r], ['cs02', [-6, -52], 3]);
  for (const id of ['vigil_1', 'vigil_2', 'vigil_3']) assert.equal(z[id].kind, 'checkpoint');
  assert.deepEqual([z.stones.r, z.stones.waves.length], [12, 2]);
  assert.deepEqual([z.glade.r, z.glade.lockOn, z.glade.interact.play, z.glade.waves.length], [14, 'cs03:end', 'cs03', 2]);
  assert.deepEqual([z.bridge.r, z.bridge.waves.length, z.bridge.rescue.companion, z.bridge.rescue.play], [12, 3, 'mochi', 'd01']);
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
  assert.deepEqual(tally, { rat_pike: 27, rat_xbow: 8, crow: 6 });
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
  assert.deepEqual(L.arenas.map((a) => a.id).sort(), ['bridge', 'glade', 'stones']);
  assert.equal(L.arena('glade').canAutoLock(), false, 'glade waits for CS-03');
  assert.deepEqual(L.vigils.map((v) => v.id), ['vigil_1', 'vigil_2', 'vigil_3']);
  for (const id of ['title', 'practice', 'start', 'boss', 'vigil_1', 'vigil_2', 'vigil_3']) assert.ok(L.spawns[id], `spawn ${id}`);
  assert.ok(near(L.spawns.start.pos.x, -1.5) && near(L.spawns.start.pos.z, -54.5));
  assert.deepEqual(L.triggers.map((t) => t.id).sort(), ['exit', 'exit:blocked', 'lane', 'tallbert']);
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
  assert.ok(L.grass && L.grass.count > 10000);
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
  a.lock();
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

test('Env: the warm hero key light is on in the night presets only (art.md mood rule)', () => {
  for (const [name, p] of Object.entries(ENV_PRESETS)) {
    const night = p.grade === 'night';
    assert.equal((toState(p).hero ?? 0) > 0, night, `${name}: hero light ${night ? 'on' : 'off'}`);
  }
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
  assert.equal(d.env.default, 'forest_day'); assert.deepEqual(d.env.byFlag[0], ['forest.camp', 'forest_night']);
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
  assert.deepEqual(d.env.byFlag.map((r) => r[1]), ['ending_gold', 'hub_grey', 'hub_gold']); assert.equal(d.env.default, 'town_occupied');
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

test('Dressing: paved ribbons follow the ground; world-UV boxes; the light pool follows the nearest lit sources', () => {
  const g = paveGeometry({ lines: [{ pts: [[0, 0], [10, 0], [20, 5]], width: 4 }], discs: [[0, 20, 5]], heightAt: (x, z) => x * 0.1 + z * 0.05, lift: 0.03, rng: () => 0.5 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) assert.ok(near(p.getY(i), p.getX(i) * 0.1 + p.getZ(i) * 0.05 + 0.03, 1e-5));
  for (let i = 0; i < g.attributes.normal.count; i++) assert.ok(g.attributes.normal.getY(i) > 0, 'normals up');
  const b = worldBoxesGeometry([{ x0: 0, x1: 4, y0: -1, y1: 0, z0: 0, z1: 2 }], { tile: 2 });
  const uv = b.attributes.uv, pp = b.attributes.position, n = b.attributes.normal;
  for (let i = 0; i < uv.count; i++) if (n.getY(i) > 0.5) { assert.ok(near(uv.getX(i), pp.getX(i) / 2)); assert.ok(near(uv.getY(i), pp.getZ(i) / 2)); }
  const parent = new THREE.Group(), pool = new LightPool(parent, 2);
  const s = [pool.add({ pos: new THREE.Vector3(0, 1, 0) }), pool.add({ pos: new THREE.Vector3(5, 1, 0) }), pool.add({ pos: new THREE.Vector3(50, 1, 0), on: true })];
  pool.update(new THREE.Vector3(40, 0, 0), 0);
  assert.deepEqual(pool.lights.map((L) => L.position.x).sort((a, c) => a - c), [5, 50]);
  s[2].on = false; pool.update(new THREE.Vector3(40, 0, 0), 0);
  assert.deepEqual(pool.lights.map((L) => L.position.x).sort((a, c) => a - c), [0, 5]);
  assert.equal(parent.children.length, 2, 'a fixed number of lights');
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
  assert.ok(L.lightPool?.lights.length === 2, 'the light pool (campfire + rat-camp torches)');
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
  a.lock();
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
  L.arena('square').lock();
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
