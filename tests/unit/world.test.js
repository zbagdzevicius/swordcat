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
import { Level, condOk, waterEntryLevel, colliderList, levelRun, endLevelRun } from '../../src/world/Level.js';
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
