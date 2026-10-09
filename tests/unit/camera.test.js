// tests/unit/camera.test.js  (owner: camera) — presets (§5.2), blends, shake, lock-on selection, tree-fade
// geometry, CutsceneCamera modes, MemeCam loop and FollowCamera modes/events with a minimal hand-made ctx
// (no DOM, no WebGL; independent of other areas' systems).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as config from '../../src/core/config.js';
import { E } from '../../src/core/events.js';
import { EventBus } from '../../src/core/EventBus.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { Input } from '../../src/core/Input.js';
import { GameState } from '../../src/core/GameState.js';
import { Actor } from '../../src/core/Actor.js';
import { PRESETS, PRESET_NAMES, localToWorld, worldToLocal, memeSway, handheld, MEME_PERIOD, DEG } from '../../src/camera/presets.js';
import { CamPose, blendPose, applyPose, resolveEase } from '../../src/camera/pose.js';
import { CameraShake } from '../../src/camera/CameraShake.js';
import { relYaw, pickLockTarget, switchLockTarget, nearestLockTarget, handoverLockTarget, acquireLockTarget, LOCK_FALLBACK_RANGE, FlickDetector, StickFlick } from '../../src/camera/LockOn.js';
import { segmentHitsBox, distSqPointSegment, OccluderFader } from '../../src/camera/Occluders.js';
import { CutsceneCamera, normalizeShot } from '../../src/camera/CutsceneCamera.js';
import { MemeCam } from '../../src/camera/MemeCam.js';
import { FollowCamera, aspectFov, DEFAULT_PITCH, camTransparent, THIN_RADIUS, ARM_GOOD, HANDOVER_RATE, FADE_MAX_DIST, FADE_COLLIDERS, LOCK_SEP, LOCK_BIAS_MAX, COMBAT_PITCH, COMBAT_LIFT, lockYawBias, lockScreenSep, lockSepGoal } from '../../src/camera/FollowCamera.js';
import manifest from '../../src/camera/assets.manifest.js';

const { CAMERA, PLAYER } = config;
const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const nearV = (v, arr, eps = 1e-6, msg = '') => { near(v.x, arr[0], eps, msg + '.x'); near(v.y, arr[1], eps, msg + '.y'); near(v.z, arr[2], eps, msg + '.z'); };

/** Minimal ctx: bus, actors, input, state, a camera, a flat-ground physics (optional raycast hit). */
function makeCtx({ ground = 0, rayHit = null } = {}) {
  const ctx = {
    game: { mode: 'play', loop: { timeScale: 1 }, hitstopT: 0, setMode(m) { this.mode = m; } },
    bus: new EventBus(), config, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 600),
    actors: new ActorRegistry(), state: new GameState(), enemies: { list: [], boss: null }, levels: { loading: false, anchor: (n) => anchors[n] ?? null },
    physics: {
      heightAt: () => ground,
      raycast: (ray, max) => {
        if (rayHit != null && rayHit <= max) return { distance: rayHit, point: ray.at(rayHit, new THREE.Vector3()), normal: new THREE.Vector3(0, 1, 0), object: null };
        // flat ground plane at y = ground
        const d = ray.direction, o = ray.origin;
        if (d.y >= -1e-6) return null;
        const t = (ground - o.y) / d.y;
        return t >= 0 && t <= max ? { distance: t, point: ray.at(t, new THREE.Vector3()), normal: new THREE.Vector3(0, 1, 0), object: null } : null;
      },
    },
  };
  const anchors = { crane_a: { pos: new THREE.Vector3(-20, 20, -10), facing: 0 }, crane_b: { pos: new THREE.Vector3(0, 3, 0), facing: 0 }, statue: { pos: new THREE.Vector3(5, 0, 5), facing: Math.PI } };
  ctx.input = new Input(ctx);
  const p = new Actor(ctx, { faction: 'player', height: 1 });
  p.stateName = 'idle'; p.charge = 0;
  ctx.player = p; ctx.actors.register(p, 'swordcat');
  return ctx;
}

function enemyAt(ctx, x, z, h = 1) {
  const e = new Actor(ctx, { faction: 'enemy', height: h });
  e.pos.set(x, 0, z); e.object3d.position.copy(e.pos);
  ctx.actors.register(e);
  return e;
}

async function makeCam(opts) {
  const ctx = makeCtx(opts);
  const cam = new FollowCamera(ctx);
  ctx.cam = cam;
  await cam.init();
  return { ctx, cam };
}

const frames = (cam, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) cam.render(0, dt); };

// ---------------------------------------------------------------- presets
test('§5.2 presets: every preset exists with the spec placements', () => {
  for (const n of ['MEME_LOOP', 'REVERSE_HORDE', 'PULLBACK', 'SELFIE', 'WHIP_FALL', 'CRANE_DOWN', 'ECU_EYES', 'TWO_SHOT_LOW', 'HERO_LOW', 'FLIGHT_ORBIT'])
    assert.ok(PRESETS[n], `preset ${n}`);
  assert.equal(PRESET_NAMES.length, 10);
  const M = PRESETS.MEME_LOOP;
  assert.deepEqual([...M.pos], [0.06, 0.68, 1.9]); assert.deepEqual([...M.look], [0.03, 0.9, 0]);
  assert.equal(M.fov, 38); assert.equal(M.sway, 0.005); assert.equal(M.loop, 3.8); assert.equal(MEME_PERIOD, PLAYER.memeCam.loop);
  assert.deepEqual([...PRESETS.REVERSE_HORDE.pos], [0.35, 0.55, -1.4]); assert.equal(PRESETS.REVERSE_HORDE.look[2], 25); assert.equal(PRESETS.REVERSE_HORDE.fov, 38);
  assert.deepEqual([...PRESETS.PULLBACK.to], [0, 4.0, 14]); assert.equal(PRESETS.PULLBACK.dur, 6.0); assert.deepEqual([...PRESETS.PULLBACK.fov], [38, 50]);
  assert.deepEqual([...PRESETS.PULLBACK.pos], [...M.pos]);
  assert.deepEqual([...PRESETS.SELFIE.pos], [0.25, 0.92, 0.45]); assert.equal(PRESETS.SELFIE.fov, 50); near(PRESETS.SELFIE.roll, 6 * DEG); assert.equal(PRESETS.SELFIE.noise, 0.015);
  const W = PRESETS.WHIP_FALL;
  near(W.whip.yaw, 120 * DEG); assert.equal(W.whip.dur, 0.18); assert.equal(W.whip.fovAdd, 15); near(W.fall.roll, 90 * DEG); assert.equal(W.fall.y, 0.12); assert.equal(W.fall.dur, 0.35);
  assert.deepEqual([...W.fov], [50, 65]);
  assert.equal(PRESETS.CRANE_DOWN.fov, 40);
  assert.deepEqual([...PRESETS.ECU_EYES.pos], [0, 0.79, 0.35]); assert.deepEqual([...PRESETS.ECU_EYES.look], [0, 0.79, 0]); assert.equal(PRESETS.ECU_EYES.fov, 25);
  assert.deepEqual([...PRESETS.TWO_SHOT_LOW.pos], [1.6, 0.75, 1.6]); assert.equal(PRESETS.TWO_SHOT_LOW.fov, 35);
  assert.deepEqual([...PRESETS.HERO_LOW.pos], [0.8, 0.35, 2.2]); assert.deepEqual([...PRESETS.HERO_LOW.look], [0, 0.9, 0]); assert.equal(PRESETS.HERO_LOW.fov, 40);
  assert.deepEqual({ ...PRESETS.FLIGHT_ORBIT.orbit }, { r: 9, h: 2, degPerSec: 8 }); assert.equal(PRESETS.FLIGHT_ORBIT.fov, 45);
  assert.ok(Object.isFrozen(PRESETS) && Object.isFrozen(M));
});

test('anchor-local frame: +Z = forward, +X = her left; worldToLocal inverts', () => {
  const o = new THREE.Vector3(10, 2, -5), out = new THREE.Vector3();
  nearV(localToWorld([0, 1, 1], o, 0, out), [10, 3, -4]);
  nearV(localToWorld([1, 0, 0], o, 0, out), [11, 2, -5]);
  // facing +X (yaw π/2): forward → +X, her left → −Z
  nearV(localToWorld([0, 0, 1], o, Math.PI / 2, out), [11, 2, -5], 1e-9);
  nearV(localToWorld([1, 0, 0], o, Math.PI / 2, out), [10, 2, -6], 1e-9);
  // matches three's rotation about +Y
  const v = new THREE.Vector3(0.3, 0.7, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1).add(o);
  nearV(localToWorld([0.3, 0.7, 1.2], o, 1.1, out), v.toArray(), 1e-9);
  const back = worldToLocal(out, o, 1.1, {});
  near(back.x, 0.3, 1e-9); near(back.y, 0.7, 1e-9); near(back.z, 1.2, 1e-9);
});

test('Meme sway loops exactly every 3.8 s and stays within ~0.005 m', () => {
  const a = {}, b = {};
  let max = 0;
  for (let t = 0; t < 3.8; t += 0.01) {
    memeSway(t, 3.8, 0.005, a); memeSway(t + 3.8, 3.8, 0.005, b);
    near(a.x, b.x, 1e-12); near(a.y, b.y, 1e-12); near(a.z, b.z, 1e-12);
    max = Math.max(max, Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));
  }
  assert.ok(max > 0.002 && max <= 0.0051, `sway amplitude ${max}`);
  const h = handheld(1.3, 0.015, {});
  assert.ok(Math.abs(h.x) <= 0.015 && Math.abs(h.y) <= 0.015 && Math.abs(h.z) <= 0.015);
});

// ---------------------------------------------------------------- pose
test('blendPose: endpoints, cylindrical arc around the pivot, never through her', () => {
  const a = new CamPose(), b = new CamPose(), out = new CamPose(), pivot = new THREE.Vector3(0, 0.8, 0);
  a.set(new THREE.Vector3(0, 1.6, -3.6), new THREE.Vector3(0, 1, 0), 45);
  b.set(new THREE.Vector3(0.06, 0.7, 1.15), new THREE.Vector3(0.03, 0.82, 0), 32);
  nearV(blendPose(a, b, 0, pivot, out).pos, [0, 1.6, -3.6]);
  nearV(blendPose(a, b, 1, pivot, out).pos, [0.06, 0.7, 1.15]);
  for (let k = 0.05; k < 1; k += 0.05) {
    blendPose(a, b, k, pivot, out);
    const r = Math.hypot(out.pos.x, out.pos.z);
    assert.ok(r > 1.0, `k=${k.toFixed(2)}: camera ${r.toFixed(2)} m from her (went through her)`);
  }
  near(blendPose(a, b, 0.5, null, out).fov, 38.5);
  // aliasing out === from is safe
  const c = new CamPose().copy(a);
  blendPose(c, b, 0.5, pivot, c);
  assert.ok(Number.isFinite(c.pos.x) && c.fov === 38.5);
});

test('applyPose: looks at the look point; roll rotates about the view axis', () => {
  const cam = new THREE.PerspectiveCamera(), p = new CamPose(), dir = new THREE.Vector3();
  p.set(new THREE.Vector3(0, 1, 5), new THREE.Vector3(0, 1, 0), 45, 0);
  applyPose(cam, p);
  cam.getWorldDirection(dir); nearV(dir, [0, 0, -1], 1e-9);
  p.roll = Math.PI / 2; applyPose(cam, p);
  cam.getWorldDirection(dir); nearV(dir, [0, 0, -1], 1e-9);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  near(Math.abs(up.x), 1, 1e-9, 'rolled 90° → camera up is horizontal');
  near(resolveEase('easeInOutSine')(0.5), 0.5, 1e-12); assert.equal(resolveEase('linear')(0.25), 0.25); assert.equal(typeof resolveEase('nope'), 'function');
});

// ---------------------------------------------------------------- shake
test('CameraShake: trauma adds (clamped), decays linearly, offsets ∝ trauma^1.5, settings scale, visible jolts', () => {
  const s = new CameraShake();
  s.add(0.7).add(0.7); assert.equal(s.trauma, 1);
  s.add(-1); s.add(NaN); assert.equal(s.trauma, 1);
  s.step(0.25); near(s.trauma, 1 - s.decay * 0.25, 1e-9);
  const o = s.step(0.01);
  assert.ok(Math.abs(o.roll) <= s.max.roll * s.intensity + 1e-12);
  s.step(2); assert.equal(s.trauma, 0); assert.deepEqual({ ...s.offset }, { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0 });
  s.add(1); const z = s.step(0.01, 0); assert.deepEqual({ ...z }, { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0 }, 'shake setting 0 → no shake');
  const cam = new THREE.PerspectiveCamera(); const q0 = cam.quaternion.clone();
  s.reset(); s.add(0.8); s.apply(cam, 0.016);
  assert.ok(cam.quaternion.angleTo(q0) > 0, 'apply rotates the camera');
  // §8.2 values must read on screen: peak view displacement (angle + thump at a 3.6 m arm) over the shake
  const peak = (trauma) => {
    const k = new CameraShake(); k.add(trauma); let m = 0;
    for (let i = 0; i < 30; i++) { const q = k.step(1 / 60); m = Math.max(m, Math.hypot(q.pitch, q.yaw) + Math.hypot(q.x, q.y) / 3.6); }
    return m * 180 / Math.PI;
  };
  const light = peak(0.15), heavy = peak(0.35);
  assert.ok(light > 0.5 && light < 2, `light hit is a small jolt (${light.toFixed(2)}°)`);
  assert.ok(heavy > 1.2 && heavy < 4, `heavy hit is a clear thump (${heavy.toFixed(2)}°)`);
  assert.ok(peak(0.6) > heavy, 'holy > heavy');
});

// ---------------------------------------------------------------- lock-on
test('lock-on: nearest in 12 m inside the 100° cone of camera forward; switching left/right; hand-over', () => {
  const ctx = makeCtx();
  const yaw = Math.PI;                          // camera behind a player facing +Z → looks along +Z
  const origin = new THREE.Vector3();
  const ahead = enemyAt(ctx, 0, 6), farAhead = enemyAt(ctx, 0, 11), behind = enemyAt(ctx, 0, -3), wide = enemyAt(ctx, 6, 3), tooFar = enemyAt(ctx, 0, 13);
  const left = enemyAt(ctx, 3, 8), right = enemyAt(ctx, -3, 8);
  const all = [ahead, farAhead, behind, wide, tooFar, left, right];
  near(relYaw(yaw, origin, { x: 0, z: 5 }), 0, 1e-9);
  assert.ok(relYaw(yaw, origin, { x: 1, z: 5 }) > 0, '+X (her left) is screen-left = positive');
  assert.equal(pickLockTarget(all, origin, yaw, PLAYER.lockOn), ahead);
  assert.equal(pickLockTarget([behind, tooFar], origin, yaw, PLAYER.lockOn), null, 'behind / beyond 12 m are not acquired');
  assert.equal(pickLockTarget([wide], origin, yaw, PLAYER.lockOn), null, 'wide (63°) is outside the ±50° cone');
  assert.equal(switchLockTarget(all, origin, yaw, ahead, 1, 12), right, 'right of centre = −X');
  assert.equal(switchLockTarget(all, origin, yaw, ahead, -1, 12), left);
  assert.equal(switchLockTarget([ahead, right], origin, yaw, right, 1, 12), null, 'flick: no wrap');
  assert.equal(switchLockTarget([ahead, right, left], origin, yaw, right, 1, 12, true), left, 'wheel wraps');
  ahead.alive = false;
  assert.equal(nearestLockTarget(all, origin, 12, null), behind, 'hand-over ignores the cone');
});

test('lock-on fallback: cone first; else her recent attacker; else the nearest hostile within 6 m', () => {
  const ctx = makeCtx();
  const yaw = Math.PI, origin = new THREE.Vector3();
  const side = enemyAt(ctx, 1.2, 0), behind = enemyAt(ctx, 0, -2.7), ahead = enemyAt(ctx, 0, 9), far = enemyAt(ctx, -7, -7);
  assert.equal(LOCK_FALLBACK_RANGE, 6);
  assert.equal(acquireLockTarget([side, behind, ahead], origin, yaw, PLAYER.lockOn), ahead, 'the cone wins even when farther');
  assert.equal(acquireLockTarget([side, behind], origin, yaw, PLAYER.lockOn), side, 'empty cone → nearest beside her');
  assert.equal(acquireLockTarget([side, behind], origin, yaw, PLAYER.lockOn, behind), behind, 'empty cone → the one hitting her');
  assert.equal(acquireLockTarget([side, far], origin, yaw, PLAYER.lockOn, far), far, 'recent attacker within 12 m, beyond 6 m');
  assert.equal(acquireLockTarget([far], origin, yaw, PLAYER.lockOn), null, 'nothing near and no attacker → null (recentre)');
  side.alive = false;
  assert.equal(acquireLockTarget([side], origin, yaw, PLAYER.lockOn, side), null, 'dead attacker is not acquired');
});

test('flick detectors: 40 px within 0.15 s; stick past 0.7 fires once', () => {
  const f = new FlickDetector(40, 0.15);
  assert.equal(f.push(15, 1 / 60), 0); assert.equal(f.push(15, 1 / 60), 0); assert.equal(f.push(15, 1 / 60), 1);
  assert.equal(f.push(-60, 1 / 60), 0, 'cooldown');
  const g = new FlickDetector(40, 0.15);
  for (let i = 0; i < 30; i++) assert.equal(g.push(3, 1 / 60), 0, 'slow drag is not a flick');
  const s = new StickFlick(0.7, 0.35);
  assert.equal(s.push(0.5), 0); assert.equal(s.push(-0.8), -1); assert.equal(s.push(-0.9), 0); assert.equal(s.push(0.1), 0); assert.equal(s.push(0.75), 1);
});

// ---------------------------------------------------------------- tree fade
test('tree fade geometry: segment vs box, point-segment distance', () => {
  const box = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 3, 1));
  assert.equal(segmentHitsBox({ x: -5, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, box), true);
  assert.equal(segmentHitsBox({ x: -5, y: 4, z: 0 }, { x: 5, y: 4, z: 0 }, box), false);
  assert.equal(segmentHitsBox({ x: -5, y: 1, z: 0 }, { x: -2, y: 1, z: 0 }, box), false, 'stops short');
  assert.equal(segmentHitsBox({ x: 0, y: 1, z: 0 }, { x: 0.2, y: 1, z: 0 }, box), true, 'inside');
  near(distSqPointSegment({ x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 1);
});

test('OccluderFader: a tree between the camera and her fades to CAMERA.treeFadeOpacity and restores', () => {
  const scene = new THREE.Scene();
  const fader = new OccluderFader({ minOpacity: CAMERA.treeFadeOpacity });
  const mat = new THREE.MeshStandardMaterial({ color: '#4D5C2E' });
  const tree = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4).translate(0, 2, 0), mat);
  tree.position.set(0, 0, -2); tree.userData.camFade = true; scene.add(tree);
  const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial(), 2);
  inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 1, 10)); inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 1, 2));
  inst.name = 'leaves'; scene.add(inst);
  const n = fader.scan(scene, scene);
  assert.equal(n, 3, 'tagged mesh + 2 named instances');
  const camPos = new THREE.Vector3(0, 1.5, -4), subj = [new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1.05, 0)];
  for (let i = 0; i < 90; i++) fader.update(1 / 60, camPos, subj);
  assert.notEqual(tree.material, mat, 'faded clone in place');
  near(tree.material.opacity, CAMERA.treeFadeOpacity, 0.02); assert.equal(tree.material.transparent, true);
  // move the camera to the other side: the instance at z=2 now occludes, the tree restores
  camPos.set(0, 1.2, 4);
  for (let i = 0; i < 120; i++) fader.update(1 / 60, camPos, subj);
  assert.equal(tree.material, mat, 'original material restored');
  const m = new THREE.Matrix4(); inst.getMatrixAt(1, m);
  assert.equal(m.elements[0], 0, 'occluding instance hidden (zero scale)');
  const px = scene.children.find((c) => c.name === 'cam:fadeProxy' && c.visible);
  assert.ok(px, 'proxy drawn instead');
  assert.equal(px.isInstancedMesh, true, 'instanced source → single-instance InstancedMesh proxy (same shader path)');
  px.getMatrixAt(0, m); near(m.elements[14], 2, 1e-9, 'proxy instance matrix = the hidden instance');
  fader.clear();
  inst.getMatrixAt(1, m); assert.equal(m.elements[0], 1, 'instance matrix restored on clear');
  assert.equal(fader.count, 0);
});

test('FollowCamera: Tab locks the enemy beside / behind her when the cone is empty; recent attacker preferred', async () => {
  const { ctx, cam } = await makeCam();
  const tab = () => { ctx.input._press('lockon', 'k:Tab'); cam.update(1 / 60); ctx.input.endStep(); ctx.input._release('lockon', 'k:Tab'); };
  const pike = enemyAt(ctx, 1.2, 0.2), pike2 = enemyAt(ctx, -2.0, -1.8);
  frames(cam, 2);
  tab();
  assert.equal(cam.lockTarget, pike, 'nearest within 6 m (beside her)'); assert.equal(cam.modeName, 'lock');
  tab(); assert.equal(cam.lockTarget, null);
  ctx.bus.emit(E.HIT, { attacker: pike2, target: ctx.player, damage: 1, blocked: true });
  tab();
  assert.equal(cam.lockTarget, pike2, 'the one that just hit her');
  tab();
  for (let i = 0; i < 200; i++) cam.update(1 / 60);          // > 3 s: forgotten
  tab();
  assert.equal(cam.lockTarget, pike, 'attacker memory expires after 3 s');
});

test('Fade-prop colliders (fade:true sets, e.g. the practice-field fence) do not pull the camera in', async () => {
  const { ctx, cam } = await makeCam();
  const root = new THREE.Group();
  const geo = new THREE.BoxGeometry(2, 1.1, 0.12).translate(0, 0.55, 0);          // a 2 m fence rail piece
  const fence = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(), 2);
  fence.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -2));
  fence.setMatrixAt(1, new THREE.Matrix4().makeRotationY(0.6).setPosition(4, 0, -2));
  fence.name = 'fade:fence'; fence.userData.camFade = true; root.add(fence);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshStandardMaterial());
  canopy.position.set(10, 4, 10); canopy.userData.camFade = true; root.add(canopy);
  const railCol = { x: 0, z: -2, hx: 0.85, hz: 0.05, y0: -0.6, y1: 1.1 };
  const yawCol = { x: 4, z: -2, hx: 0.85, hz: 0.05, yaw: 0.6, y0: -0.6, y1: 1.1 };
  const crate = { minX: 9.5, maxX: 10.5, minZ: 9.5, maxZ: 10.5, y0: -0.6, y1: 1 };   // under the wide canopy
  const house = { x: 0, z: -2, hx: 3, hz: 3, y0: -0.6, y1: 5 };
  const pinned = { x: 0, z: -2, hx: 0.85, hz: 0.05, y1: 1.1, cam: true };
  const level = { root, colliders: { circles: [], boxes: [railCol, yawCol, crate, house, pinned], segments: [], rings: [] } };
  ctx.scene.add(root);
  ctx.bus.emit(E.LEVEL_LOADED, { level });
  assert.ok(cam._fader.count >= 3);
  assert.equal(camTransparent(railCol), true, 'rail footprint → camera passes, the rail fades');
  assert.equal(camTransparent(yawCol), true, 'yawed piece too');
  assert.equal(FADE_COLLIDERS.has(crate), false, 'a crate under a wide canopy still blocks');
  assert.equal(camTransparent(house), false, 'bigger / taller than the prop: blocks');
  assert.equal(camTransparent(pinned), false, 'cam: true always blocks');
});

// ---------------------------------------------------------------- cutscene camera
test('normalizeShot: preset defaults, modes, overrides, unknown preset falls back', () => {
  assert.equal(normalizeShot({ preset: 'HERO_LOW' }).mode, 'cut');
  assert.equal(normalizeShot({ preset: 'WHIP_FALL', dur: 0.53 }).mode, 'whipfall');
  const pb = normalizeShot({ preset: 'PULLBACK' });
  assert.equal(pb.mode, 'rail'); assert.equal(pb.dur, 6);
  assert.equal(normalizeShot({ preset: 'FLIGHT_ORBIT' }).mode, 'orbit');
  assert.equal(normalizeShot({ preset: 'CRANE_DOWN', path: ['a', 'b'] }).mode, 'rail');
  const h = normalizeShot({ mode: 'handheld' });
  assert.equal(h.noise, 0.02);
  assert.equal(normalizeShot({ preset: 'SELFIE', fov: 60 }).fov, 60);
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual(normalizeShot({ preset: 'NOPE_X' }).pos, PRESETS.HERO_LOW.pos); } finally { console.warn = warn; }
});

test('CutsceneCamera: cut places the preset in the anchor frame; promises resolve after dur', async () => {
  const ctx = makeCtx();
  ctx.player.pos.set(3, 0, 4); ctx.player.object3d.position.copy(ctx.player.pos); ctx.player.facing = Math.PI / 2;
  const cc = new CutsceneCamera(ctx), from = new CamPose();
  await cc.start({ preset: 'HERO_LOW', anchor: 'swordcat', mode: 'cut' }, from);
  const want = localToWorld(PRESETS.HERO_LOW.pos, ctx.player.pos, Math.PI / 2, new THREE.Vector3());
  nearV(cc.pose.pos, want.toArray(), 1e-9); near(cc.pose.fov, 40);
  let resolved = false;
  cc.start({ preset: 'ECU_EYES', anchor: 'swordcat', mode: 'blend', dur: 1 }, cc.pose).then(() => { resolved = true; });
  for (let i = 0; i < 30; i++) cc.update(1 / 60);
  await Promise.resolve(); assert.equal(resolved, false);
  for (let i = 0; i < 40; i++) cc.update(1 / 60);
  await Promise.resolve(); assert.equal(resolved, true);
  let stopped = false;
  cc.start({ mode: 'handheld', dur: 5 }, cc.pose).then(() => { stopped = true; });
  cc.stop(); await Promise.resolve(); assert.equal(stopped, true, 'stop() settles the promise');
});

test('CutsceneCamera: TWO_SHOT_LOW looks at the midpoint of anchor and target at y 0.75', () => {
  const ctx = makeCtx();
  const pud = new Actor(ctx, { height: 6 }); pud.pos.set(0, 0, 4); pud.object3d.position.copy(pud.pos); ctx.actors.register(pud, 'pudding');
  const cc = new CutsceneCamera(ctx);
  cc.start({ preset: 'TWO_SHOT_LOW', anchor: 'swordcat', target: 'pudding', mode: 'cut' }, new CamPose());
  nearV(cc.pose.look, [0, 0.75, 2], 1e-9);
  nearV(cc.pose.pos, [1.6, 0.75, 1.6], 1e-9);
});

test('CutsceneCamera: WHIP_FALL = yaw +120° with FOV +15 in 0.18 s, then roll 90° down to ground + 0.12', () => {
  const ctx = makeCtx({ ground: 0.5 });
  const cc = new CutsceneCamera(ctx), from = new CamPose();
  from.set(new THREE.Vector3(0.25, 1.42, 0.45), new THREE.Vector3(0.25, 1.42, -0.55), 50, 6 * DEG);   // looking −Z
  cc.start({ preset: 'WHIP_FALL', anchor: 'swordcat', dur: 0.53 }, from);
  for (let i = 0; i < 11; i++) cc.update(0.18 / 11);
  const d = new THREE.Vector3().subVectors(cc.pose.look, cc.pose.pos).normalize();
  const expect = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 120 * DEG);
  nearV(d, expect.toArray(), 1e-6, 'whip direction'); near(cc.pose.fov, 65, 1e-6); near(cc.pose.roll, 0, 1e-9);
  for (let i = 0; i < 30; i++) cc.update(0.35 / 25);
  near(cc.pose.pos.y, 0.5 + 0.12, 1e-9, 'landed'); near(cc.pose.roll, 90 * DEG, 1e-9); assert.equal(cc.landed, true);
  near(cc.pose.look.y, cc.pose.pos.y, 1e-6, 'view levelled out on the grass');
});

test('CutsceneCamera: PULLBACK dollies MEME_LOOP → (0, 4, 14) over 6 s with FOV 38 → 50', () => {
  const ctx = makeCtx();
  const cc = new CutsceneCamera(ctx);
  cc.start({ preset: 'PULLBACK', anchor: 'swordcat' }, new CamPose());
  nearV(cc.pose.pos, [0.06, 0.68, 1.9], 1e-9); near(cc.pose.fov, 38);
  for (let i = 0; i < 180; i++) cc.update(1 / 60);
  near(cc.pose.fov, 44, 0.01, 'half way (in-out sine)');
  for (let i = 0; i < 200; i++) cc.update(1 / 60);
  nearV(cc.pose.pos, [0, 4, 14], 1e-9); near(cc.pose.fov, 50);
});

test('CutsceneCamera: rail along level anchors, orbit at 8°/s, handheld noise, string look', () => {
  const ctx = makeCtx();
  const cc = new CutsceneCamera(ctx);
  cc.start({ preset: 'CRANE_DOWN', path: ['crane_a', 'crane_b'], dur: 4 }, new CamPose());
  nearV(cc.pose.pos, [-20, 20, -10], 1e-6);
  for (let i = 0; i < 260; i++) cc.update(1 / 60);
  nearV(cc.pose.pos, [0, 3, 0], 1e-6);
  near(cc.pose.fov, 40);
  cc.start({ preset: 'FLIGHT_ORBIT', anchor: 'swordcat' }, new CamPose());
  const r0 = Math.atan2(cc.pose.pos.x, cc.pose.pos.z);
  near(Math.hypot(cc.pose.pos.x, cc.pose.pos.z), 9, 1e-9); near(cc.pose.pos.y, 2, 1e-9);
  for (let i = 0; i < 60; i++) cc.update(1 / 60);
  near(Math.atan2(cc.pose.pos.x, cc.pose.pos.z) - r0, 8 * DEG, 1e-6);
  cc.start({ mode: 'handheld', pos: [0, 1, 3], look: 'statue', noise: 0.02 }, new CamPose());
  const a = cc.pose.pos.clone(); cc.update(0.3);
  assert.ok(a.distanceTo(cc.pose.pos) > 0 && cc.pose.pos.distanceTo(new THREE.Vector3(0, 1, 3)) < 0.05);
  assert.ok(cc.pose.look.distanceTo(new THREE.Vector3(5, 0, 5)) < 0.05, 'look at a level anchor by name');
});

// ---------------------------------------------------------------- meme cam
test('MemeCam: MEME_LOOP framing in her frame; sample(t) === sample(t + 3.8)', () => {
  const ctx = makeCtx();
  ctx.player.pos.set(-4, 0, -58); ctx.player.object3d.position.copy(ctx.player.pos); ctx.player.facing = 0.4;
  const m = new MemeCam(ctx);
  m.enter(ctx.player);
  const a = m.sample(1.1, new CamPose()), b = m.sample(1.1 + 3.8, new CamPose());
  nearV(a.pos, b.pos.toArray(), 1e-12); nearV(a.look, b.look.toArray(), 1e-12);
  const ideal = localToWorld(PRESETS.MEME_LOOP.pos, ctx.player.pos, 0.4, new THREE.Vector3());
  assert.ok(a.pos.distanceTo(ideal) < 0.01, 'within the sway of the exact MEME_LOOP position');
  assert.equal(a.fov, 38);
  for (let i = 0; i < 240; i++) m.update(1 / 60);
  near(m.t, 4 - 3.8, 1e-6); assert.ok(m.phase >= 0 && m.phase < 1);
});

// ---------------------------------------------------------------- follow camera
test('FollowCamera: contract fields; follow framing at 3.6 m behind her at the head pivot', async () => {
  const { ctx, cam } = await makeCam();
  for (const k of ['mode', 'preset', 'shake', 'shot', 'lock', 'unlock', 'addFadeable']) assert.equal(typeof cam[k], 'function', k);
  assert.ok('yaw' in cam && 'pitch' in cam && 'lockTarget' in cam);
  frames(cam, 2);
  const piv = new THREE.Vector3(0, CAMERA.pivotY, 0);
  near(ctx.camera.position.distanceTo(piv), CAMERA.dist, 1e-6, 'arm length');
  assert.ok(ctx.camera.position.z < 0, 'behind her (she faces +Z)');
  near(ctx.camera.fov, CAMERA.fov, 1e-6);
  near(cam.pitch, DEFAULT_PITCH);
  // a wall at 2 m pulls the arm in fast
  const w = await makeCam({ rayHit: 2 });
  frames(w.cam, 30);
  near(w.ctx.camera.position.distanceTo(piv), 2 - 0.3, 0.02, 'spring arm');
});

test('FollowCamera: never below the terrain; boss distance eases to 6.0 m over 0.6 s', async () => {
  const { ctx, cam } = await makeCam();
  cam.pitch = CAMERA.pitch[0];
  frames(cam, 20);
  assert.ok(ctx.camera.position.y >= 0.3 - 1e-6, `camera y ${ctx.camera.position.y}`);
  cam.pitch = DEFAULT_PITCH;
  ctx.enemies.boss = { alive: true };
  ctx.bus.emit(E.BOSS_START, { id: 'boss_x' });
  assert.equal(cam.modeName, 'boss');
  frames(cam, 18);                                   // 0.3 s: half way
  assert.ok(cam.distance > CAMERA.dist && cam.distance < CAMERA.bossDist);
  frames(cam, 30);
  near(cam.distance, CAMERA.bossDist, 1e-9);
  ctx.bus.emit(E.BOSS_DEFEATED, { id: 'boss_x' });
  assert.equal(cam.modeName, 'follow');
});

test('FollowCamera: lock-on via input; camera yaws to face the target at 4.5 m; breaks beyond 16 m', async () => {
  const { ctx, cam } = await makeCam();
  const e = enemyAt(ctx, 2, 6);
  frames(cam, 2);
  ctx.input._press('lockon', 'k:Tab'); cam.update(1 / 60); ctx.input.endStep(); ctx.input._release('lockon', 'k:Tab');
  assert.equal(cam.lockTarget, e); assert.equal(cam.modeName, 'lock');
  frames(cam, 90);
  near(cam.distance, CAMERA.lockDist, 1e-9);
  const want = Math.atan2(2, 6) + Math.PI + cam.lockBias;
  assert.ok(cam.lockBias >= 0 && cam.lockBias <= LOCK_BIAS_MAX);
  assert.ok(Math.abs(Math.atan2(Math.sin(cam.yaw - want), Math.cos(cam.yaw - want))) < 0.01, 'yaw faces the target (+ framing bias)');
  // the target stands clear of her on screen (right of her), never behind her head
  const proj = (v) => v.clone().project(ctx.camera);
  const sep = proj(new THREE.Vector3(2, 0.6, 6)).x - proj(new THREE.Vector3(0, CAMERA.pivotY - 0.3, 0)).x;
  assert.ok(sep >= lockSepGoal(Math.hypot(2, 6)) - 0.02, `target ${sep.toFixed(3)} NDC right of her`);
  e.pos.set(0, 0, 17);
  cam.update(1 / 60);
  assert.equal(cam.lockTarget, null, 'broke at 16 m'); assert.equal(cam.modeName, 'follow');
  // nothing to lock → recenter
  cam.yaw = 0.5;
  ctx.input._press('lockon', 'k:Tab'); cam.update(1 / 60); ctx.input.endStep(); ctx.input._release('lockon', 'k:Tab');
  frames(cam, 60);
  near(cam.yaw, Math.PI, 0.03, 'recentred behind her');
});

test('FollowCamera: meme mode emits camera:meme on/off and glides into MEME_LOOP over 2.0 s', async () => {
  const { ctx, cam } = await makeCam();
  const got = [];
  ctx.bus.on(E.MEME_CAM, (p) => got.push(p.on));
  frames(cam, 2);
  cam.mode('meme');
  cam.mode('meme');
  assert.deepEqual(got, [true], 'entering twice emits once');
  frames(cam, 30);
  const mid = ctx.camera.position.clone();
  assert.ok(Math.hypot(mid.x, mid.z) > 0.9, 'arcs around her, not through her');
  frames(cam, 100);
  const ideal = localToWorld(PRESETS.MEME_LOOP.pos, ctx.player.pos, 0, new THREE.Vector3());
  assert.ok(ctx.camera.position.distanceTo(ideal) < 0.01, 'held at MEME_LOOP');
  near(ctx.camera.fov, 38, 1e-6);
  assert.ok(cam.memeT > 0 && cam.memeT < 3.8);
  cam.mode('follow');
  assert.deepEqual(got, [true, false]);
  frames(cam, 40);
  near(ctx.camera.position.distanceTo(new THREE.Vector3(0, CAMERA.pivotY, 0)), CAMERA.dist, 1e-3, 'back at follow after the 0.6 s blend');
});

test('FollowCamera: preset() / shot() / camera:mode, handback with a 0.6 s blend on cutscene:end', async () => {
  const { ctx, cam } = await makeCam();
  frames(cam, 2);
  ctx.game.mode = 'cutscene';
  assert.equal(cam.preset('HERO_LOW', 'swordcat', { mode: 'cut' }), cam, 'chainable');
  frames(cam, 1);
  nearV(ctx.camera.position, [0.8, 0.35, 2.2], 1e-6); near(ctx.camera.fov, 40, 1e-6);
  ctx.bus.emit(E.CAM_MODE, { mode: 'preset', preset: 'ECU_EYES', anchor: 'swordcat' });
  frames(cam, 1);
  nearV(ctx.camera.position, [0, 0.79, 0.35], 1e-6);
  const done = cam.shot({ preset: 'SELFIE', mode: 'blend', dur: 0.5 });
  frames(cam, 10);
  assert.ok(ctx.camera.position.distanceTo(new THREE.Vector3(0.25, 0.92, 0.45)) > 0.03, 'still blending');
  frames(cam, 30);
  await done;
  ctx.game.mode = 'play';
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs03', skipped: false });
  assert.equal(cam.modeName, 'preset', 'handback waits a frame (a chained scene may take over)');
  frames(cam, 1);
  assert.equal(cam.modeName, 'follow');
  frames(cam, 19);
  const d = ctx.camera.position.distanceTo(new THREE.Vector3(0, CAMERA.pivotY, 0));
  assert.ok(Math.abs(d - CAMERA.dist) > 0.05, 'mid-blend');
  frames(cam, 30);
  near(ctx.camera.position.distanceTo(new THREE.Vector3(0, CAMERA.pivotY, 0)), CAMERA.dist, 1e-6, 'handed back');
  // a chained scene (end.cam: false, the next one starts right away) keeps its camera
  ctx.game.mode = 'cutscene';
  cam.mode('cutscene');
  cam.shot({ preset: 'HERO_LOW', mode: 'cut' });
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs09', skipped: false });
  ctx.bus.emit(E.CUTSCENE_START, { id: 'cs10' });
  frames(cam, 3);
  assert.equal(cam.modeName, 'preset', 'the next scene holds the shot');
  nearV(ctx.camera.position, [0.8, 0.35, 2.2], 1e-6);
  // a skipped scene that left the shot held cuts straight back
  ctx.bus.emit(E.CUTSCENE_END, { id: 'cs10', skipped: true });
  frames(cam, 1);
  assert.equal(cam.modeName, 'follow');
  assert.equal(cam._blend.active, false, 'skip = cut');
});

test('FollowCamera: handback blends even when the cutscene moved her; a teleport during a blend cuts', async () => {
  const { ctx, cam } = await makeCam();
  frames(cam, 2);
  ctx.game.mode = 'cutscene';
  cam.mode('cutscene');
  cam.shot({ preset: 'HERO_LOW', mode: 'cut' });
  frames(cam, 2);
  // the scene walks her 20 m away (scripted moveTo), the camera shot tracks her
  const p = ctx.player;
  p.pos.set(0, 0, 20); p.object3d.position.copy(p.pos);
  frames(cam, 2);
  ctx.game.mode = 'play';
  cam.mode('follow', { blend: 0.6 });
  frames(cam, 10);
  assert.equal(cam._blend.active, true, 'handback still blending (not mistaken for a teleport)');
  // respawn at a checkpoint far away mid-blend: cut straight to the new framing
  p.pos.set(40, 0, -30); p.object3d.position.copy(p.pos);
  frames(cam, 1);
  assert.equal(cam._blend.active, false, 'teleport ends the blend');
  near(ctx.camera.position.distanceTo(new THREE.Vector3(40, CAMERA.pivotY, -30)), CAMERA.dist, 1e-3, 'cut to the follow framing');
});

test('CutsceneCamera: authored low shots never dip into the terrain', async () => {
  const ctx = makeCtx({ ground: 0 });
  ctx.physics.heightAt = (x, z) => (z > 1 ? 0.6 : 0);                     // a bank rises in front of her
  const cc = new CutsceneCamera(ctx);
  cc.start({ preset: 'HERO_LOW', mode: 'cut' }, new CamPose());
  near(cc.pose.pos.y, 0.6 + 0.1, 1e-9, 'lifted to 0.1 m above the bank');
  nearV(cc.pose.look, [0, 0.9, 0], 1e-9, 'still looking at her');
  ctx.physics.heightAt = () => 0;
  cc.start({ preset: 'HERO_LOW', mode: 'cut' }, new CamPose());
  near(cc.pose.pos.y, 0.35, 1e-9, 'flat ground: the spec height');
});

test('FollowCamera: E.SHAKE adds trauma (combat owns hit/parry/block shakes: no double); dizzy shakes once; Holy punches the FOV +5°', async () => {
  const { ctx, cam } = await makeCam();
  ctx.bus.emit(E.SHAKE, { trauma: 0.3 }); near(cam.shaker.trauma, 0.3, 1e-9);
  ctx.bus.emit(E.PLAYER_PARRY, {}); near(cam.shaker.trauma, 0.3, 1e-9, 'parry shake comes from combat via E.SHAKE');
  ctx.bus.emit(E.HIT, { target: ctx.player, blocked: true }); near(cam.shaker.trauma, 0.3, 1e-9, 'block shake comes from combat');
  ctx.bus.emit(E.BOSS_DIZZY, { dizzy: true }); near(cam.shaker.trauma, 0.3 + config.JUICE.dizzy.shake, 1e-9);
  ctx.bus.emit(E.BOSS_DIZZY, { dizzy: true }); near(cam.shaker.trauma, 0.3 + config.JUICE.dizzy.shake, 1e-9, 'once per dizzy');
  ctx.bus.emit(E.PLAYER_HOLY, {});
  frames(cam, 5);
  assert.ok(ctx.camera.fov > CAMERA.fov + 2, `fov punch ${ctx.camera.fov}`);
  frames(cam, 20);
  near(ctx.camera.fov, CAMERA.fov, 1e-3);
});

/** Static obstacles as spheres around a collider description (`src`, what physics returns as hit.object). */
function staticPhysics(ctx, obstacles) {
  const cast = (ray, radius, max) => {
    let best = null;
    for (const o of obstacles) {
      const oc = ray.origin.clone().sub(o.c), b = oc.dot(ray.direction), c = oc.lengthSq() - (o.r + radius) ** 2;
      const disc = b * b - c;
      if (disc < 0) continue;
      let t = -b - Math.sqrt(disc);
      if (t < 0) { if (c < 0) t = 0; else continue; }
      if (t <= max && (!best || t < best.distance)) best = { distance: t, kind: 'static', object: o.src, point: ray.at(t, new THREE.Vector3()), normal: new THREE.Vector3(0, 1, 0) };
    }
    return best;
  };
  ctx.physics.sphereCast = (ray, radius, max) => cast(ray, radius, max);
  ctx.physics.raycast = (ray, max) => cast(ray, 0, max);
}

test('camTransparent: thin circles / segments / cam:false skip; boxes, big circles, cam:true block', () => {
  assert.equal(camTransparent({ x: 0, z: 0, r: 0.3 }), true, 'trunk');
  assert.equal(camTransparent({ x: 0, z: 0, r: THIN_RADIUS + 0.1 }), false, 'big rock');
  assert.equal(camTransparent({ ax: 0, az: 0, bx: 4, bz: 0 }), true, 'fence segment');
  assert.equal(camTransparent({ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }), false, 'house box');
  assert.equal(camTransparent({ x: 0, z: 0, hx: 3, hz: 3 }), false, 'centre-form box');
  assert.equal(camTransparent({ minX: -1, maxX: 1, minZ: -1, maxZ: 1, cam: false }), true, 'tagged cam:false');
  assert.equal(camTransparent({ x: 0, z: 0, r: 0.2, cam: true }), false, 'tagged cam:true');
  assert.equal(camTransparent(null), false);
});

test('FollowCamera: spring arm collides with solid statics and skips thin ones (they fade instead)', async () => {
  const { ctx, cam } = await makeCam();
  cam.avoid = false;                                   // raw spring-arm behaviour (boom avoidance tested below)
  const obstacles = [];
  staticPhysics(ctx, obstacles);
  frames(cam, 2);
  const piv = cam.pivot.clone(), dir = ctx.camera.position.clone().sub(piv).normalize();
  const along = (d) => piv.clone().addScaledVector(dir, d);
  const t = along(1.5);
  obstacles.push({ c: t, r: 0.3, src: { x: t.x, z: t.z, r: 0.3 } });                     // a trunk right on the arm
  frames(cam, 60);
  near(ctx.camera.position.distanceTo(cam.pivot), CAMERA.dist, 0.02, 'trunk ignored');
  const house = { minX: -2, maxX: 2, minZ: -5, maxZ: -3 };
  obstacles.push({ c: along(3.0), r: 0.5, src: house });                                   // a wall behind the trunk
  frames(cam, 60);
  near(ctx.camera.position.distanceTo(cam.pivot), 3.0 - 0.5 - 0.2 - 0.05, 0.03, 'pulled in to the wall');
  house.cam = false;
  frames(cam, 150);
  near(ctx.camera.position.distanceTo(cam.pivot), CAMERA.dist, 0.03, 'cam:false wall ignored, eased back out');
  // a wall hugging the trunk (the restart lands inside it): stop at the trunk, never inside the wall
  house.cam = undefined;
  obstacles[1].c = along(2.2);
  frames(cam, 60);
  const d = ctx.camera.position.distanceTo(cam.pivot);
  assert.ok(d <= 2.2 - 0.5 - 0.2 + 1e-6 && d >= ARM_MIN_T, `conservative stop ${d.toFixed(3)}`);
});
const ARM_MIN_T = 0.8;

test('FollowCamera: Meme Cam rotates the MEME_LOOP framing around her when a wall blocks the lens', async () => {
  const { ctx, cam } = await makeCam();
  const obstacles = [];
  staticPhysics(ctx, obstacles);
  assert.equal(cam.memeYawOffset(ctx.player), 0, 'clear view: straight in front of her face');
  // a fence post 0.8 m in front of her face (she faces +Z), slightly to her left
  obstacles.push({ c: new THREE.Vector3(0.1, 0.75, 0.8), r: 0.25, src: { x: 0.1, z: 0.8, r: 0.25 } });
  const off = cam.memeYawOffset(ctx.player);
  assert.ok(off !== 0 && Math.abs(off) <= 1.05 + 1e-9, `rotated framing (${off})`);
  cam.mode('meme');
  frames(cam, 160);
  const ideal = localToWorld(PRESETS.MEME_LOOP.pos, ctx.player.pos, off, new THREE.Vector3());
  assert.ok(ctx.camera.position.distanceTo(ideal) < 0.01, 'held at the rotated MEME_LOOP');
  const eyes = new THREE.Vector3(0, PRESETS.ECU_EYES.look[1], 0);
  const dir = ctx.camera.position.clone().sub(eyes), len = dir.length();
  assert.equal(ctx.physics.sphereCast(new THREE.Ray(eyes, dir.normalize()), 0.12, len), null, 'the lens sees her face');
  near(ctx.camera.fov, 38, 1e-6);
  // boxed in on every side: fall back to the spec framing
  obstacles.push({ c: new THREE.Vector3(0, 0.75, 0), r: 1.3, src: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 } });
  assert.equal(cam.memeYawOffset(ctx.player), 0);
  cam.mode('follow');
});

test('FollowCamera: lock line of sight ignores trunks, breaks after 1.5 s behind a wall', async () => {
  const { ctx, cam } = await makeCam();
  const obstacles = [];
  staticPhysics(ctx, obstacles);
  const e = enemyAt(ctx, 0, 6);
  assert.equal(cam.lock(e), e);
  obstacles.push({ c: new THREE.Vector3(0, 1, 3), r: 0.3, src: { x: 0, z: 3, r: 0.3 } });
  for (let i = 0; i < 150; i++) cam.update(1 / 60);
  assert.equal(cam.lockTarget, e, 'a trunk does not break the lock');
  obstacles.push({ c: new THREE.Vector3(0, 1, 4), r: 0.8, src: { minX: -3, maxX: 3, minZ: 3.5, maxZ: 4.5 } });
  for (let i = 0; i < 60; i++) cam.update(1 / 60);
  assert.equal(cam.lockTarget, e, 'still locked after 1 s');
  for (let i = 0; i < 40; i++) cam.update(1 / 60);
  assert.equal(cam.lockTarget, null, 'broken after > 1.5 s without line of sight');
});

test('OccluderFader: BatchedMesh instances (camFadeIds) hide and draw through a proxy; untagged batches are ignored', () => {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const bm = new THREE.BatchedMesh(4, 4000, 12000, mat);
  const gT = bm.addGeometry(new THREE.CylinderGeometry(0.4, 0.4, 3).translate(0, 1.5, 0)), gR = bm.addGeometry(new THREE.BoxGeometry(1, 1, 1));
  const a = bm.addInstance(gT); bm.setMatrixAt(a, new THREE.Matrix4().makeTranslation(0, 0, -2));
  const b = bm.addInstance(gR); bm.setMatrixAt(b, new THREE.Matrix4().makeTranslation(0, 0.5, -3));
  const c = bm.addInstance(gT); bm.setMatrixAt(c, new THREE.Matrix4().makeTranslation(8, 0, 8));
  bm.setColorAt(a, new THREE.Color(0.5, 0.5, 0.5));
  bm.userData.camFadeIds = [a, c];
  scene.add(bm);
  const untagged = new THREE.BatchedMesh(2, 400, 1200, new THREE.MeshStandardMaterial());
  untagged.name = 'trees';
  untagged.addInstance(untagged.addGeometry(new THREE.BoxGeometry(1, 1, 1)));
  scene.add(untagged);
  const fader = new OccluderFader({ minOpacity: CAMERA.treeFadeOpacity });
  assert.equal(fader.scan(scene, scene), 2, 'the two tagged trunks only');
  const camPos = new THREE.Vector3(0, 1.5, -4.5), subj = [new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1.05, 0)];
  for (let i = 0; i < 90; i++) fader.update(1 / 60, camPos, subj);
  assert.equal(bm.getVisibleAt(a), false, 'occluding trunk instance hidden');
  assert.equal(bm.getVisibleAt(b), true, 'untagged rock instance untouched');
  assert.equal(bm.getVisibleAt(c), true, 'far trunk untouched');
  const proxy = scene.children.find((o) => o.name === 'cam:fadeProxy' && o.visible);
  assert.ok(proxy, 'proxy drawn instead');
  const range = bm.getGeometryRangeAt(gT);
  assert.equal(proxy.geometry.index, bm.geometry.index, 'proxy shares the batch buffers');
  assert.deepEqual([proxy.geometry.drawRange.start, proxy.geometry.drawRange.count], [range.start, range.count]);
  near(proxy.material.opacity, CAMERA.treeFadeOpacity, 0.02);
  near(proxy.material.color.r, 0.5, 1e-6, 'instance colour carried over');
  camPos.set(0, 1.5, 4);
  for (let i = 0; i < 120; i++) fader.update(1 / 60, camPos, subj);
  assert.equal(bm.getVisibleAt(a), true, 'restored');
  assert.equal(proxy.visible, false, 'proxy released');
  // an instance the world has culled is never faded (and never re-shown by the camera)
  bm.setVisibleAt(a, false);
  camPos.set(0, 1.5, -4.5);
  for (let i = 0; i < 90; i++) fader.update(1 / 60, camPos, subj);
  fader.clear();
  assert.equal(bm.getVisibleAt(a), false, 'world-hidden instance stays hidden');
});

test('OccluderFader: big merged trees are refined against triangles (passing under the canopy does not fade)', () => {
  const scene = new THREE.Scene();
  const trunk = new THREE.CylinderGeometry(0.3, 0.3, 3, 8).translate(0, 1.5, 0).toNonIndexed();
  const crown = new THREE.IcosahedronGeometry(2.5, 1).translate(0, 4.5, 0).toNonIndexed();
  const merged = new THREE.BufferGeometry();
  const pos = new Float32Array(trunk.attributes.position.array.length + crown.attributes.position.array.length);
  pos.set(trunk.attributes.position.array, 0); pos.set(crown.attributes.position.array, trunk.attributes.position.array.length);
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tree = new THREE.Mesh(merged, new THREE.MeshStandardMaterial());
  tree.position.set(0, 0, -2); tree.userData.camFade = true; scene.add(tree);
  const fader = new OccluderFader({ minOpacity: CAMERA.treeFadeOpacity });
  assert.equal(fader.scan(scene, scene), 1);
  assert.equal(fader.units[0].precise, true, 'radius > PRECISE_RADIUS → triangle refinement');
  // under the crown, 1.2 m beside the trunk: the merged box is hit, the triangles are not
  const camPos = new THREE.Vector3(1.2, 1.2, -4.5), subj = [new THREE.Vector3(1.2, 0.5, 0), new THREE.Vector3(1.2, 1.05, 0)];
  for (let i = 0; i < 60; i++) fader.update(1 / 60, camPos, subj);
  assert.equal(fader.fadedCount, 0, 'no fade under the canopy');
  camPos.x = 0; subj[0].x = 0; subj[1].x = 0;
  for (let i = 0; i < 60; i++) fader.update(1 / 60, camPos, subj);
  assert.equal(fader.fadedCount, 1, 'the trunk itself fades');
  fader.clear();
});

test('FollowCamera: memeT follows a MEME_LOOP cutscene shot (title loop sync) and resets on the next shot', async () => {
  const { ctx, cam } = await makeCam();
  ctx.game.mode = 'cutscene';
  cam.shot({ preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' });
  frames(cam, 60);
  assert.equal(cam.memeLooping, true);
  near(cam.memeT, 1.0, 0.02);
  frames(cam, 180);                                   // 4.0 s in → wrapped at 3.8
  near(cam.memeT, 4.0 - PLAYER.memeCam.loop, 0.02);
  near(cam.memePhase, cam.memeT / PLAYER.memeCam.loop, 1e-9);
  cam.shot({ preset: 'HERO_LOW', anchor: 'swordcat', mode: 'cut' });
  frames(cam, 2);
  assert.equal(cam.memeLooping, false); assert.equal(cam.memeT, 0);
});

test('FollowCamera: tree fade works in close shots, never in far establishing shots', async () => {
  const { ctx, cam } = await makeCam();
  ctx.game.mode = 'cutscene';
  const bush = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial());
  bush.position.set(0.4, 0.42, 1.1); ctx.scene.add(bush);
  assert.equal(cam.addFadeable(bush), 1);
  cam.shot({ preset: 'HERO_LOW', anchor: 'swordcat', mode: 'cut' });       // camera (0.8, 0.35, 2.2) → her: the bush is in between
  frames(cam, 60);
  assert.equal(cam._fader.fadedCount, 1, 'close shot fades the occluder');
  cam.shot({ pos: [0, 12, -14], look: [0, 0.5, 0], anchor: 'swordcat', mode: 'cut' });   // ~18 m away
  frames(cam, 90);
  assert.ok(ctx.camera.position.distanceTo(ctx.player.pos) > FADE_MAX_DIST, "far shot");
  assert.equal(cam._fader.fadedCount, 0, 'far shot keeps foreground props solid');
});

test('aspectFov keeps a 4:3 horizontal field on portrait screens', () => {
  assert.equal(aspectFov(45, 16 / 9), 45);
  const v = aspectFov(45, 9 / 16);
  assert.ok(v > 45 && v <= 80);
});

test('camera manifest: loads no files', () => { assert.deepEqual(manifest, []); });

test('lock framing: lockYawBias puts close and far targets >= lockSepGoal (> 120 px at 1280) right of her body', () => {
  const pivot = new THREE.Vector3(0, CAMERA.pivotY, 0), body = new THREE.Vector3(0, CAMERA.pivotY - 0.3, 0);
  const tanH = Math.tan(22.5 * Math.PI / 180) * 16 / 9;
  for (const d of [1.2, 1.6, 4, 8, 12]) {
    const tgt = new THREE.Vector3(0, 0.5, d), yaw0 = Math.PI;
    const goal = lockSepGoal(d);
    const b = lockYawBias(pivot, body, tgt, yaw0, COMBAT_PITCH, CAMERA.lockDist, 0.9, COMBAT_LIFT, tanH, goal);
    const sep = lockScreenSep(pivot, body, tgt, yaw0 + b, COMBAT_PITCH, CAMERA.lockDist, 0.9, COMBAT_LIFT, tanH);
    assert.ok(sep >= goal - 1e-3 && goal * 640 > 120, `d ${d}: sep ${sep.toFixed(3)} (bias ${b.toFixed(3)})`);
    assert.ok(b < LOCK_BIAS_MAX, `d ${d}: reachable`);
  }
});

test('FollowCamera: an alerted hostile in melee range raises the pitch and lifts the look point', async () => {
  const { ctx, cam } = await makeCam();
  frames(cam, 30);
  const y0 = ctx.camera.position.y;
  const e = enemyAt(ctx, 0, 2);
  e.alerted = true;
  for (let i = 0; i < 120; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  const dy = ctx.camera.position.y - CAMERA.pivotY, h = Math.hypot(ctx.camera.position.x, ctx.camera.position.z);
  assert.ok(Math.atan2(dy, h) > COMBAT_PITCH - 0.03, 'pitch raised toward COMBAT_PITCH');
  assert.ok(ctx.camera.position.y > y0 + 0.5);
  // the sight line to the rat's chest passes above her head
  const c = ctx.camera.position, k = (0 - c.z) / (2 - c.z), yAtHer = c.y + (0.5 - c.y) * k;
  assert.ok(yAtHer > 1.1, `sight line over her (${yAtHer.toFixed(2)} m)`);
  e.alerted = false; e.pos.set(0, 0, 30);
  for (let i = 0; i < 300; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  near(ctx.camera.position.y, y0, 0.05, 'eases back after the fight');
});

test('OccluderFader: a fadeable right in front of the lens fades even when the line to her misses it', () => {
  const scene = new THREE.Scene();
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.08), new THREE.MeshStandardMaterial());
  rail.position.set(0, 2.0, -1.5); rail.userData.camFade = true; scene.add(rail);   // above the sight line, 1.5 m from the lens
  const f = new OccluderFader({ checkHz: 0 });
  f.scan(scene, scene);
  const camPos = new THREE.Vector3(0, 1.5, 0), her = [new THREE.Vector3(0, 0.5, -3.6)];
  f.update(0.1, camPos, her, 1);
  assert.equal(f.active.size, 0, 'not in the way of the sight line');
  const lens = [new THREE.Vector3(0, 2.0, -2), new THREE.Vector3(1, 2.4, -2)];
  for (let i = 0; i < 20; i++) f.update(0.05, camPos, her, 1, lens, 2);
  assert.equal(f.active.size, 1, 'faded by the lens test');
});

/** Vertical cylinders { x, z, r, y1, src } (walls / standing stones / carts): sphere cast by marching the ray. */
function pillarPhysics(ctx, pillars) {
  const cast = (ray, radius, max) => {
    const o = ray.origin, d = ray.direction, pt = new THREE.Vector3();
    for (let t = 0; t <= max; t += 0.01) {
      pt.copy(o).addScaledVector(d, t);
      if (pt.y < radius) return { distance: t, kind: 'terrain', object: null, point: pt.clone(), normal: new THREE.Vector3(0, 1, 0) };
      for (const c of pillars) {
        if (Math.hypot(pt.x - c.x, pt.z - c.z) <= c.r + radius && pt.y <= c.y1 + radius)
          return { distance: t, kind: 'static', object: c.src ?? c, point: pt.clone(), normal: new THREE.Vector3(0, 1, 0) };
      }
    }
    return null;
  };
  ctx.physics.sphereCast = (ray, radius, max) => cast(ray, radius, max);
  ctx.physics.raycast = (ray, max) => cast(ray, 0, max);
}

test('FollowCamera boom avoidance: a low wall right behind her lifts the boom over it (no collapse onto her head)', async () => {
  const { ctx, cam } = await makeCam();
  // a 1.1 m drystone wall 0.9 m behind her (she faces +Z, the camera sits at -Z)
  pillarPhysics(ctx, [{ x: 0, z: -1.2, r: 0.4, y1: 1.1, src: { minX: -3, maxX: 3, minZ: -1.6, maxZ: -0.8 } }]);
  cam.snapBehind();
  for (let i = 0; i < 120; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  const d = ctx.camera.position.distanceTo(cam.pivot);
  assert.ok(d >= ARM_GOOD - 0.05, `boom ${d.toFixed(2)} m`);
  assert.ok(ctx.camera.position.y > 1.1 + 0.2, 'over the wall top');
  assert.ok(ctx.camera.position.z < -1.6, 'still behind her');
  near(cam.yaw, Math.PI, 0.05, 'no swing needed for a low wall');
  // walking away from the wall: the lift eases back off
  ctx.player.pos.z += 5; ctx.player.object3d.position.copy(ctx.player.pos);
  for (let i = 0; i < 240; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  near(cam._avoidPitch, 0, 0.01, 'lift released');
  near(ctx.camera.position.distanceTo(cam.pivot), CAMERA.dist, 0.03);
});

test('FollowCamera boom avoidance: a standing stone behind her swings the orbit to the clear side (>= 1.8 m)', async () => {
  const { ctx, cam } = await makeCam();
  // the stone-ring stone: r 0.94, 2.84 m tall, its face 0.9 m behind her
  pillarPhysics(ctx, [{ x: 0, z: -1.84, r: 0.94, y1: 2.84 }]);
  ctx.input.lookIdleTime = 5;
  cam.snapBehind();
  for (let i = 0; i < 150; i++) { cam.update(1 / 60); ctx.input.lookIdleTime += 1 / 60; cam.render(0, 1 / 60); }
  const d = ctx.camera.position.distanceTo(cam.pivot);
  assert.ok(d >= ARM_GOOD - 0.05, `boom ${d.toFixed(2)} m`);
  const off = Math.abs(Math.atan2(Math.sin(cam.yaw - Math.PI), Math.cos(cam.yaw - Math.PI)));
  assert.ok(off > 0.3 && off < 1.4, `swung ${off.toFixed(2)} rad to a side`);
  // the player steering the view is never fought by the swing
  const { ctx: c2, cam: k2 } = await makeCam();
  pillarPhysics(c2, [{ x: 0, z: -1.84, r: 0.94, y1: 2.84 }]);
  k2.snapBehind();
  for (let i = 0; i < 60; i++) { c2.input.lookIdleTime = 0; k2.update(1 / 60); k2.render(0, 1 / 60); }
  near(k2.yaw, Math.PI, 1e-6, 'no swing under look input');
  assert.ok(c2.camera.position.distanceTo(k2.pivot) >= 0.8 - 1e-6);
});

test('Lock hand-over: prefers a target in front of the camera; the orbit turn is rate-limited (no snap behind her)', async () => {
  assert.equal(handoverLockTarget([], { x: 0, z: 0 }, Math.PI, 12), null);
  const { ctx, cam } = await makeCam();
  const a = enemyAt(ctx, 0, 3);            // in front
  const behind = enemyAt(ctx, 0.3, -2.5);   // nearer, but behind her
  const side = enemyAt(ctx, 3, 5);          // in the forward cone, farther
  frames(cam, 2);
  cam.lock(a);
  for (let i = 0; i < 90; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  a.alive = false;
  cam.update(1 / 60);
  assert.equal(cam.lockTarget, side, 'in-cone target preferred over the nearer one behind her');
  side.alive = false;
  const y0 = cam.yaw;
  cam.update(1 / 60);
  assert.equal(cam.lockTarget, behind, 'nothing in the cone: the nearest anywhere');
  for (let i = 0; i < 6; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  let prev = cam.yaw, maxStep = 0;
  const turned6 = Math.abs(Math.atan2(Math.sin(cam.yaw - y0), Math.cos(cam.yaw - y0)));
  assert.ok(turned6 < 0.35, `first 100 ms turn ${turned6.toFixed(2)} rad`);
  for (let i = 0; i < 240; i++) {
    cam.update(1 / 60); cam.render(0, 1 / 60);
    const st = Math.abs(Math.atan2(Math.sin(cam.yaw - prev), Math.cos(cam.yaw - prev)));
    maxStep = Math.max(maxStep, st); prev = cam.yaw;
  }
  assert.ok(maxStep <= HANDOVER_RATE / 60 + 1e-6, `max ${(maxStep * 60).toFixed(2)} rad/s`);
  const want = Math.atan2(0.3, -2.5) + Math.PI + cam.lockBias;
  assert.ok(Math.abs(Math.atan2(Math.sin(cam.yaw - want), Math.cos(cam.yaw - want))) < 0.05, 'arrives on the new target');
});
