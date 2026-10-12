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
import { CamPose, blendPose, blendPoseIso, applyPose, resolveEase } from '../../src/camera/pose.js';
import { CameraShake } from '../../src/camera/CameraShake.js';
import { relYaw, pickLockTarget, switchLockTarget, nearestLockTarget, handoverLockTarget, acquireLockTarget, LOCK_FALLBACK_RANGE, FlickDetector, StickFlick } from '../../src/camera/LockOn.js';
import { segmentHitsBox, distSqPointSegment, OccluderFader, SOLID_MIN_H } from '../../src/camera/Occluders.js';
import { ISO, isoProject, isoPosition, subjectOverflow, safeFitDist, isoFrame, isoPitch, pxAt, apparentH, camProfile, intentLead, LeadGate,
  herLimits, clampToLimits, footprintOf, inQuad, farPlane, fogRadius, BIGGER_PX } from '../../src/camera/IsoRig.js';
import { SafeFrame, fallbackOccluders } from '../../src/camera/SafeFrame.js';
import { makeView, setYaw, needDAt, dropOne, STRIDE, F_HARD, F_DROP, CLS } from '../../src/camera/framing/FramingSolver.js';
import { Subjects } from '../../src/camera/framing/Subjects.js';
import { beatEnvelope } from '../../src/camera/framing/beats.js';
import { CutsceneCamera, normalizeShot, bezier2, shotScale } from '../../src/camera/CutsceneCamera.js';
import { MemeCam } from '../../src/camera/MemeCam.js';
import { FollowCamera, aspectFov, DEFAULT_PITCH, camTransparent, THIN_RADIUS, ARM_GOOD, HANDOVER_RATE, FADE_MAX_DIST, FADE_COLLIDERS, LOCK_SEP, LOCK_BIAS_MAX, COMBAT_PITCH, COMBAT_LIFT, lockYawBias, lockScreenSep, lockSepGoal,
  bossBearing, bossFrameYaw, bossLift, BOSS_EDGE, BOSS_LOOK_GRACE, SOLID_COLLIDERS, BOSS_PASS } from '../../src/camera/FollowCamera.js';
import manifest from '../../src/camera/assets.manifest.js';

const { CAMERA, PLAYER } = config;
const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const nearV = (v, arr, eps = 1e-6, msg = '') => { near(v.x, arr[0], eps, msg + '.x'); near(v.y, arr[1], eps, msg + '.y'); near(v.z, arr[2], eps, msg + '.z'); };

/** Minimal ctx: bus, actors, input, state, a camera, a flat-ground physics (optional raycast hit). */
function makeCtx({ ground = 0, rayHit = null } = {}) {
  const ctx = {
    game: { mode: 'play', loop: { timeScale: 1 }, hitstopT: 0, setMode(m) { this.mode = m; } }, params: { cam: 'classic' },
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
  assert.equal(PRESET_NAMES.length, 17);
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
  near(tree.material.opacity, CAMERA.treeFadeOpacity, 0.02);
  assert.equal(tree.material.userData.camDither, true, 'dithered fade'); assert.equal(tree.material.transparent, false, 'no blending / sorting');
  assert.match(tree.material.customProgramCacheKey(), /camDither/);
  assert.equal(tree.material.depthWrite, true);
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
  frames(cam, 60);
  near(ctx.camera.position.distanceTo(new THREE.Vector3(0, CAMERA.pivotY, 0)), CAMERA.dist, 1e-3, 'back at follow after the 0.9 s blend (CONTROLS_SPEC C7)');
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

// ---------------------------------------------------------------- M2: presets, rails, boss framing, solid occluders
test('M2 presets: WIDE / MEDIUM / TWO_SHOT / LOW_BEHIND / PUSH_OUT / ECU_BLADE / BOSS_INTRO', () => {
  for (const n of ['WIDE', 'MEDIUM', 'TWO_SHOT', 'LOW_BEHIND', 'PUSH_OUT', 'ECU_BLADE', 'BOSS_INTRO']) {
    const P = PRESETS[n];
    assert.ok(P && Object.isFrozen(P), n);
    assert.ok(Array.isArray(P.pos) && Array.isArray(P.look) && (typeof P.fov === 'number' || Array.isArray(P.fov)), `${n} placement`);
  }
  assert.ok(PRESETS.LOW_BEHIND.pos[2] < 0 && PRESETS.LOW_BEHIND.pos[1] < 0.5, 'LOW_BEHIND: low, behind her');
  assert.ok(PRESETS.LOW_BEHIND.look[1] > 2, 'LOW_BEHIND looks up');
  assert.equal(PRESETS.PUSH_OUT.kind, 'rail');
  assert.ok(PRESETS.WIDE.pos[2] > 6, 'WIDE is wide');
  assert.equal(PRESETS.TWO_SHOT.lookMid, 0.8);
  assert.equal(PRESETS.BOSS_INTRO.scale, 'height');
  assert.equal(normalizeShot({ preset: 'PUSH_OUT' }).mode, 'rail');
  assert.equal(normalizeShot({ preset: 'WIDE' }).mode, 'cut');
});

test('PULLBACK (CS-08) rail: low dolly, then crane up through `via`; ends exactly at (0, 4, 14)', () => {
  const a = new THREE.Vector3(0, 0, 0), c = new THREE.Vector3(0, 1, 5), b = new THREE.Vector3(0, 4, 10), o = new THREE.Vector3();
  nearV(bezier2(a, c, b, 0, o), [0, 0, 0]); nearV(bezier2(a, c, b, 1, o), [0, 4, 10]); nearV(bezier2(a, c, b, 0.5, o), [0, 1.5, 5]);
  const n = normalizeShot({ preset: 'PULLBACK' });
  assert.deepEqual([...n.via], [...PRESETS.PULLBACK.via]); assert.equal(n.collide, true);
  assert.equal(normalizeShot({ preset: 'PULLBACK', to: [0, 2, 6] }).via, null, 'an overridden rail drops the preset control point');
  const ctx = makeCtx();
  const cc = new CutsceneCamera(ctx);
  cc.start({ preset: 'PULLBACK', anchor: 'swordcat' }, new CamPose());
  for (let i = 0; i < 180; i++) cc.update(1 / 60);                   // half way
  const linY = (0.68 + 4) / 2;
  assert.ok(cc.pose.pos.y < linY - 0.3, `mid-rail height ${cc.pose.pos.y.toFixed(2)} stays low (linear ${linY})`);
  assert.ok(cc.pose.pos.z > 5, `mid-rail distance ${cc.pose.pos.z.toFixed(2)}: the dolly leads`);
  for (let i = 0; i < 200; i++) cc.update(1 / 60);
  nearV(cc.pose.pos, [0, 4, 14], 1e-9); near(cc.pose.fov, 50);
});

test('collide shots: the lens is pulled to her side of a wall (castFn); scale: height scales placements', () => {
  const ctx = makeCtx();
  const cc = new CutsceneCamera(ctx);
  let calls = 0;
  cc.castFn = (o, d, max, r) => { calls++; assert.equal(r, 0.2); return 3; };
  cc.start({ anchor: 'swordcat', pos: [0, 0.75, 6], look: [0, 0.75, 0], collide: true, mode: 'cut' }, new CamPose());
  assert.ok(calls > 0);
  nearV(cc.pose.pos, [0, 0.75, 2.95], 1e-9, 'pulled in to hit - 0.05');
  cc.castFn = () => -1;
  cc.update(1 / 60);
  nearV(cc.pose.pos, [0, 0.75, 6], 1e-9, 'clear: authored placement');
  const boss = new Actor(ctx, { faction: 'enemy', height: 2.2 });
  boss.pos.set(10, 0, 0); boss.object3d.position.copy(boss.pos); boss.facing = 0;
  ctx.actors.register(boss, 'boss_cacklejaw');
  assert.equal(shotScale('height', { height: 2.2 }), 2.2); assert.equal(shotScale(null, { height: 2.2 }), 1); assert.equal(shotScale(1.5, null), 1.5);
  cc.start({ preset: 'BOSS_INTRO', anchor: 'boss_cacklejaw' }, new CamPose());
  const P = PRESETS.BOSS_INTRO;
  nearV(cc.pose.pos, [10 + P.pos[0] * 2.2, P.pos[1] * 2.2, P.pos[2] * 2.2], 1e-9);
  nearV(cc.pose.look, [10, P.look[1] * 2.2, 0], 1e-9);
});

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
test('Boss framing: bearing / assist yaw keep the boss within BOSS_EDGE; tall-boss lift', () => {
  const yaw = 0, d = 6;                          // yaw 0: the camera sits at +Z of her, looking toward -Z
  near(bossBearing(0, 0, 0, -10, yaw, d), 0, 1e-9, 'boss straight ahead');
  const off = bossBearing(0, 0, 10, 0, yaw, d);
  assert.ok(Math.abs(off) > BOSS_EDGE, `boss to the side is off-screen (${off.toFixed(2)})`);
  const g = bossFrameYaw(0, 0, 10, 0, yaw, d);
  assert.ok(Math.abs(bossBearing(0, 0, 10, 0, g, d)) <= BOSS_EDGE + 1e-3, 'goal puts him at the edge');
  assert.ok(Math.abs(wrapA(g - yaw)) < Math.abs(wrapA(Math.atan2(10, 0) + Math.PI - yaw)), 'only as far as needed');
  assert.equal(bossFrameYaw(0, 0, 0, -10, yaw, d), yaw, 'already framed: unchanged');
  const g2 = bossFrameYaw(0, 0, 0, 12, yaw, d);  // behind the camera
  assert.ok(Math.abs(bossBearing(0, 0, 0, 12, g2, d)) <= BOSS_EDGE + 1e-3);
  near(bossLift(1.6, 2), 0); near(bossLift(2.2, 2), 0.21, 1e-9); near(bossLift(3.0, 2), 0.3); near(bossLift(2.2, 8), 0);
});

test('FollowCamera boss assist: an off-screen boss is brought into frame after the look grace; arena walls pass', async () => {
  const { ctx, cam } = await makeCam();
  const boss = enemyAt(ctx, 9, 0, 2.2);
  boss.alive = true; boss.hp = 700;
  ctx.enemies.boss = boss;
  ctx.bus.emit(E.BOSS_START, { id: 'boss_cacklejaw' });
  assert.equal(cam.modeName, 'boss');
  ctx.input.lookIdleTime = 0;
  frames(cam, 2);
  const y0 = cam.yaw;
  ctx.input.lookIdleTime = BOSS_LOOK_GRACE + 1;
  frames(cam, 240);
  assert.notEqual(cam.yaw, y0);
  const b = bossBearing(ctx.player.pos.x, ctx.player.pos.z, 9, 0, cam.yaw, cam.distance);
  assert.ok(Math.abs(b) <= BOSS_EDGE + 0.03, `boss bearing ${b.toFixed(3)} after the assist`);
  assert.ok(Math.abs(cam.bossAssist) < 0.03, 'assist settled');
  assert.equal(camTransparent({ x: 0, z: 0, r: 12.4, kind: 'ring', arenaWall: 'mill' }), true, 'fog wall ring: arm passes');
  assert.equal(camTransparent({ x: 0, z: 0, r: 12.4, kind: 'ring' }), false, 'other rings still block');
});

function solidLevel() {
  const root = new THREE.Group(); root.name = 'props';
  const mat = new THREE.MeshStandardMaterial();
  const bm = new THREE.BatchedMesh(8, 4000, 12000, mat);
  const houseG = bm.addGeometry(new THREE.BoxGeometry(6, 7, 6).translate(0, 3.5, 0));
  const chimneyG = bm.addGeometry(new THREE.BoxGeometry(0.6, 1.5, 0.6).translate(0, 0.75, 0));
  const crateG = bm.addGeometry(new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0));
  const pillarG = bm.addGeometry(new THREE.CylinderGeometry(0.8, 0.8, 2.5, 12).translate(0, 1.25, 0));
  const house = bm.addInstance(houseG); bm.setMatrixAt(house, new THREE.Matrix4().makeTranslation(0, 0, 10));
  const chim = bm.addInstance(chimneyG); bm.setMatrixAt(chim, new THREE.Matrix4().makeTranslation(1.5, 5.4, 11));
  const crate = bm.addInstance(crateG); bm.setMatrixAt(crate, new THREE.Matrix4().makeTranslation(5, 0, 0));
  const pillar = bm.addInstance(pillarG); bm.setMatrixAt(pillar, new THREE.Matrix4().makeTranslation(-8, 0, 0));
  root.add(bm);
  const cols = {
    house: { x: 0, z: 10, hx: 2.55, hz: 2.55, y0: -0.6, y1: 7 },
    crate: { minX: 4.6, maxX: 5.4, minZ: -0.4, maxZ: 0.4, y0: -0.6, y1: 0.8 },
    pillar: { x: -8, z: 0, r: 0.8, y0: -0.6, y1: 2.5 },
  };
  return { root, bm, cols, ids: { house, chim, crate, pillar } };
}

test('Solid occluders (town houses, pillars): auto-registered from footprints; keep blocking; fade when they hide her', async () => {
  const { ctx, cam } = await makeCam();
  const { root, bm, cols, ids } = solidLevel();
  const level = { root: new THREE.Group(), groups: { props: root }, colliders: { boxes: [cols.house, cols.crate], circles: [cols.pillar], segments: [] }, actors: [] };
  level.root.add(root); ctx.scene.add(level.root);
  ctx.bus.emit(E.LEVEL_LOADED, { level });
  assert.equal(cam.solidOccluders, 2, 'house (+ chimney) and pillar; the crate is too low');
  assert.ok(SOLID_MIN_H >= 1.6);
  assert.ok(SOLID_COLLIDERS.has(cols.house) && SOLID_COLLIDERS.has(cols.pillar) && !SOLID_COLLIDERS.has(cols.crate));
  assert.ok(BOSS_PASS.has(cols.pillar) && !BOSS_PASS.has(cols.house), 'only slender solids pass in boss fights');
  assert.equal(camTransparent(cols.house), false, 'a house still stops the arm');
  assert.equal(cam._transparent(cols.pillar), false, 'pillar blocks outside boss fights');
  cam.bossActive = true;
  assert.equal(cam._transparent(cols.pillar), true, 'pillar passes in a boss fight');
  cam.bossActive = false;
  const house = cam._fader.units.find((u) => u.solid && u.parts.some((p) => p.index === ids.house));
  assert.ok(house && house.parts.some((p) => p.index === ids.chim), 'the chimney joins the house unit');
  const f = cam._fader, subj = [new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0)];
  for (let i = 0; i < 30; i++) f.update(1 / 30, new THREE.Vector3(0, 3, 16), subj, 2);
  assert.ok(house.f > 0.9 && f.fadedSolidCount >= 1, 'camera beyond the house, her in front: it fades');
  assert.equal(bm.getVisibleAt(ids.house), false, 'source hidden while the proxy draws it');
  const lens = [new THREE.Vector3(0, 3, 4.5)];
  for (let i = 0; i < 60; i++) f.update(1 / 30, new THREE.Vector3(0, 3, 6.95), subj, 2, lens, 1);
  assert.equal(house.f, 0, 'camera pressed against the near wall, facing her: stays solid');
  assert.equal(bm.getVisibleAt(ids.house), true);
  assert.equal(f.covers(-2.55, 2.55, 7.45, 12.55, 7), false, 'solid units never make their colliders transparent');
});

test('Solid occluders: explicit tags (camFade "solid", camFadeSolidIds) and camOccluder:false opt-out', () => {
  const f = new OccluderFader();
  const scene = new THREE.Scene();
  const { root, bm, ids } = solidLevel();
  bm.userData.camFadeSolidIds = [ids.house];
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 16, 3), new THREE.MeshStandardMaterial());
  tower.userData.camFade = 'solid'; root.add(tower);
  scene.add(root);
  assert.equal(f.scan(root, scene), 2);
  assert.equal(f.solidCount, 2);
  const f2 = new OccluderFader();
  const lvl = solidLevel();
  lvl.bm.userData.camOccluder = false;
  const res = f2.scanSolids(lvl.root, [{ minX: -2.55, maxX: 2.55, minZ: 7.45, maxZ: 12.55, y0: -0.6, y1: 7 }]);
  assert.equal(res.units, 0);
});

// ---------------------------------------------------------------------------------- iso occlusion rules (§3)
test('OccluderFader iso: capsule radius, linear 0.15 s in / 0.40 s out, crowns (trunks never fade), roofs', () => {
  const O = ISO.occl;
  const scene = new THREE.Scene();
  const mk = (geo, name) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); m.name = name; return m; };
  // a GLB-like tree group: separate trunk + leaves meshes, 3 m beside the sight line
  const tree = new THREE.Group(); tree.name = 'tree_oak';
  const trunk = mk(new THREE.CylinderGeometry(0.3, 0.3, 3).translate(0, 1.5, 0), 'Trunk');
  const leaves = mk(new THREE.IcosahedronGeometry(1.6, 1).translate(0, 4, 0), 'Leaves');
  tree.add(trunk, leaves); tree.position.set(2.2, 0, -3); scene.add(tree);
  // a merged tree (one mesh): only the crown part fades (shader cut)
  const merged = mk(new THREE.CylinderGeometry(1.2, 0.3, 5).translate(0, 2.5, 0), 'pine_merged'); merged.position.set(-30, 0, 0); scene.add(merged);
  // a roof (tagged) far from the sight line, a fence post 0.7 m off the line (inside her capsule only)
  const roof = mk(new THREE.BoxGeometry(6, 1, 6).translate(0, 3.5, 0), 'roof'); roof.userData.camFade = 'roof'; roof.position.set(20, 0, 20); scene.add(roof);
  const post = mk(new THREE.BoxGeometry(0.2, 1.2, 0.2).translate(0, 0.6, 0), 'post'); post.userData.camFade = true; post.position.set(0.75, 0, -0.7); scene.add(post);
  const fader = new OccluderFader({ minOpacity: O.opacity, fadeIn: O.fadeIn, fadeOut: O.fadeOut, crownR: O.crownR, roofPad: O.roofPad });
  fader.scan(scene, scene);
  assert.equal(fader.roofCount, 1); assert.ok(fader.crownCount >= 2, 'tree group + merged pine are crowns');
  const camPos = new THREE.Vector3(0, 9, -8), her = new THREE.Vector3(0, 0, 0), chest = [new THREE.Vector3(0, 0.4, 0)];
  const step = (s, opts) => { for (let t = 0; t < s * 60; t++) fader.update(1 / 60, camPos, chest, opts); };
  // line test only (no radius): the post 0.75 m off the line stays
  step(0.5, { n: 1, radii: [0], her, crowns: false });
  assert.equal(post.material.userData.camFadeClone, undefined, 'thin line misses the post');
  // her capsule (r 1.0) catches it; linear: ~0.15 s to full
  fader.update(1 / 20, camPos, chest, { n: 1, radii: [O.herR], her });   // a check tick
  step(0.12, { n: 1, radii: [O.herR], her });
  const u = fader.units.find((x) => x.root === post);
  assert.ok(u.f > 0.7 && u.f <= 1, `post fading in fast (${u.f.toFixed(2)})`);
  step(0.2, { n: 1, radii: [O.herR], her });
  assert.equal(u.f, 1); near(post.material.opacity, O.opacity, 1e-6);
  // crown proximity: the leaves fade, the trunk never does
  assert.notEqual(leaves.material.userData.camFadeClone, undefined, 'leaves faded (within crownR of her capsule)');
  assert.equal(trunk.material.userData.camFadeClone, undefined, 'trunk never fades');
  // fade out over ~0.4 s once she walks away
  camPos.set(40, 9, -8); her.set(40, 0, 0); chest[0].set(40, 0.4, 0);
  step(0.25, { n: 1, radii: [O.herR], her });
  assert.ok(u.f > 0 && u.f < 0.6, `post fading out slowly (${u.f.toFixed(2)})`);
  step(0.3, { n: 1, radii: [O.herR], her });
  assert.equal(u.f, 0); assert.equal(post.material.userData.camFadeClone, undefined, 'restored');
  // roof: she walks under its footprint (+1.5 m pad) → it fades although no capsule cuts it
  camPos.set(20 - 7.5, 9, 12); her.set(20 - 3 - 1.2, 0, 20); chest[0].set(her.x, 0.4, her.z);
  step(0.6, { n: 1, radii: [0], her, crowns: false });
  assert.notEqual(roof.material.userData.camFadeClone, undefined, 'roof faded with her under the eaves');
  her.set(20 - 3 - 2.5, 0, 20); chest[0].set(her.x, 0.4, her.z); camPos.set(her.x, 9, 12);
  step(0.8, { n: 1, radii: [0], her, crowns: false });
  assert.equal(roof.material.userData.camFadeClone, undefined, 'roof back beyond the pad');
  // merged tree: the clone carries the crown cut above crownFrac of its height
  camPos.set(-30, 9, -8); her.set(-30, 0, 0); chest[0].set(-30, 0.4, 0);
  step(0.6, { n: 1, radii: [O.herR], her });
  const cut = merged.material.userData.camCrownY;
  assert.ok(cut, 'crown cut uniform'); near(cut.value, 0.35 * 5, 1e-6, 'local y: the trunk third stays opaque');
  assert.match(merged.material.customProgramCacheKey(), /camDither/);
  fader.clear();
  assert.equal(merged.material.userData.camFadeClone, undefined);
});

test('OccluderFader: a lone trunk-named mesh never registers; positional (classic) update ignores the crown rule', () => {
  const scene = new THREE.Scene();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3), new THREE.MeshStandardMaterial()); t.name = 'trunk'; scene.add(t);
  const fader = new OccluderFader({ crownR: 3.5, fadeIn: 0.15, fadeOut: 0.4 });
  assert.equal(fader.scan(scene, scene), 0);
  const tree = new THREE.Mesh(new THREE.SphereGeometry(1).translate(0, 4, 0), new THREE.MeshStandardMaterial()); tree.name = 'tree'; tree.position.set(2.5, 0, -2);
  scene.add(tree); fader.add(tree, scene, { crown: true });
  const cam = new THREE.Vector3(0, 9, -8), subj = [new THREE.Vector3(0, 0.4, 0)];
  for (let i = 0; i < 30; i++) fader.update(1 / 60, cam, subj);
  assert.equal(fader.fadedCount, 0, 'classic: no crown proximity');
  for (let i = 0; i < 30; i++) fader.update(1 / 60, cam, subj, { n: 1, radii: [1] });
  assert.equal(fader.fadedCount, 1, 'iso: crown beside the capsule fades');
});

test('FollowCamera iso x-ray: the share of her capsule hidden (6 samples; > 30 % shows the silhouette)', async () => {
  const { cam } = await makeCam();
  const pos = new THREE.Vector3(0, 0, 0), lens = new THREE.Vector3(0, 9, -8);
  cam.yaw = Math.PI;
  cam._blocked = (a, b) => b.x < -0.1;                              // only her screen-right flank (−X at yaw π)
  near(cam._herOccludedFrac(lens, pos, 0.8), 1 / 6);
  assert.ok(cam._herOccludedFrac(lens, pos, 0.8) <= ISO.occl.xrayFrac, 'a post beside her: no x-ray');
  cam._blocked = (a, b) => b.y > 0.3;                               // a wall hiding her from the hips up
  near(cam._herOccludedFrac(lens, pos, 0.8), 4 / 6);
  assert.ok(cam._herOccludedFrac(lens, pos, 0.8) > ISO.occl.xrayFrac);
});

/** FollowCamera in iso mode on a tiny ctx (flat ground, no colliders). */
async function makeIsoCam() {
  const ctx = makeCtx();
  ctx.params = { cam: 'iso' }; ctx.player.onGround = true;
  ctx.physics.raycast = () => null;
  const cam = new FollowCamera(ctx);
  ctx.cam = cam;
  await cam.init();
  const step = (n) => { for (let i = 0; i < n; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); } };
  step(3);
  return { ctx, cam, step };
}

test('FollowCamera iso §2.4: Golden Hour dolly to 9 m at 46° in 0.25 s, held through the 0.8 s Oath, back over 0.6 s', async () => {
  const { ctx, cam, step } = await makeIsoCam();
  const G = ISO.golden, d0 = cam.iso().dist;
  assert.ok(d0 > 11, `explore distance ${d0}`);
  ctx.bus.emit(E.PLAYER_GOLDEN, { on: true });
  near(cam._goldenT, G.in + PLAYER.golden.activate + G.out, 1e-9, 'envelope length');
  step(Math.round((G.in + 0.5) * 60));                               // well inside the hold
  near(cam._goldenEnvelope(), 1, 1e-9, 'held through the Oath');
  near(cam.iso().dist, G.dist, 0.35, 'dollied to 9 m');
  near(cam.iso().pitch, G.pitch, 0.03, 'at 46°');
  step(Math.round((PLAYER.golden.activate - 0.5 + G.out * 0.5) * 60));
  const mid = cam._goldenEnvelope();
  assert.ok(mid > 0.2 && mid < 0.8, `easing back (${mid.toFixed(2)})`);
  step(60);
  assert.equal(cam._goldenEnvelope(), 0);
  near(cam.iso().dist, d0, 0.2, 'back to the explore distance');
});

test('FollowCamera iso §2.4: dialogue eases the focus to the speaker midpoint and d × 0.8 over 0.5 s, no cut', async () => {
  const { ctx, cam, step } = await makeIsoCam();
  const mochi = new Actor(ctx, { faction: 'neutral', height: 0.8 });
  mochi.pos.set(4, 0, 0); mochi.object3d.position.copy(mochi.pos); ctx.actors.register(mochi, 'mochi');
  const f0 = cam.focus.x, d0 = cam.iso().dist;
  ctx.game.mode = 'dialog';
  ctx.bus.emit(E.DIALOG_LINE, { speaker: 'mochi', text: 'Meow' });
  step(1);
  const pos1 = ctx.camera.position.clone();
  step(1);
  assert.ok(ctx.camera.position.distanceTo(pos1) < 0.3, 'no cut: one frame moves the lens only a little');
  step(60);
  near(cam.focus.x - f0, 2, 0.2, 'focus at the midpoint between her and Mochi');
  near(cam.iso().dist, d0 * ISO.dialog.mul, 0.3, 'd × 0.8');
  // a line of her own keeps the midpoint (no ping-pong); the end of the dialogue eases back
  ctx.bus.emit(E.DIALOG_LINE, { speaker: 'swordcat', text: 'Mrrp' });
  step(30);
  near(cam.focus.x - f0, 2, 0.2, 'her own line keeps the two-shot');
  ctx.bus.emit(E.DIALOG_END, {}); ctx.game.mode = 'play';
  step(90);
  near(cam.focus.x, f0, 0.1, 'focus back on her');
  near(cam.iso().dist, d0, 0.2);
});

test('FollowCamera iso §2.2: zone hints blend dist / pitch / yaw over 1.2 s and ease back when cleared', async () => {
  const { cam, step } = await makeIsoCam();
  const d0 = cam.iso().dist, p0 = cam.iso().pitch;
  cam.setHint({ dist: 17, pitch: 0.977, zone: 'line_view' }, 1.2);
  step(36);                                                           // half way: in between
  const mid = cam.iso();
  assert.ok(mid.dist > d0 + 0.5 && mid.dist < 16.8, `blending (${mid.dist.toFixed(2)})`);
  step(60);
  near(cam.iso().dist, 17, 0.25, 'the hinted distance');
  near(cam.iso().pitch, 0.977, 0.02, 'the hinted pitch');
  near(cam.yaw, Math.PI, 1e-9, 'a missing yaw = the level yaw (no turn)');
  assert.equal(cam.iso().hint.zone, 'line_view');
  // the player's zoom still applies on top of the hint (and every clamp)
  cam.zoom(0.8); step(90);
  near(cam.iso().dist, 17 * 0.8, 0.3, 'zoom × hint');
  cam.zoom(1);
  // leaving the zone: back to the rig's own distance and pitch curve
  cam.setHint({}, 1.2);
  step(110);
  near(cam.iso().dist, d0, 0.2); near(cam.iso().pitch, p0, 0.01);
  // a yaw hint turns the rig; blend 0 snaps
  cam.setHint({ yaw: Math.PI / 2, dist: 12 }, 0);
  step(2);
  near(cam.yaw, Math.PI / 2, 1e-6, 'snapped yaw');
  near(cam.iso().dist, 12, 0.3, 'snapped dist');
});

test('Meme Cam §2.7: within r of the level memeSpot the authored yaw frames her; elsewhere the clear-view search', async () => {
  const { ctx, cam } = await makeCam();
  ctx.player.facing = 0.4;
  ctx.levels.current = { memeSpot: { at: [1, 1], yaw: 2.0, r: 4 } };
  near(cam.memeYawOffset(ctx.player), 2.0 - 0.4, 1e-9, 'framing yaw = memeSpot.yaw');
  ctx.player.pos.set(10, 0, 10); ctx.player.object3d.position.copy(ctx.player.pos);
  assert.equal(cam.memeYawOffset(ctx.player), 0, 'far from the spot: straight in front of her face');
});

test('§2.4 boss safe fit: isoProject matches three.js (with the view offset); safeFitDist / subjectOverflow honour the HUD rect', () => {
  const W = 1280, H = 720, fov = 38, yaw = Math.PI, pitch = ISO.pitchBoss, d = 18, focus = { x: 1, y: 0.5, z: 2 }, offX = 12, offY = 40;
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.3, 90);
  const p = isoPosition(focus, yaw, pitch, d, {});
  cam.position.set(p.x, p.y, p.z); cam.lookAt(focus.x, focus.y, focus.z); cam.setViewOffset(W, H, offX, -offY, W, H); cam.updateMatrixWorld();
  for (const q of [[5, 0, 9], [-3, 1, -4], [1, 0.5, 2]]) {
    const v = new THREE.Vector3(...q).project(cam), o = isoProject(...q, focus, yaw, pitch, d, fov, W, H, offX, offY, {});
    assert.ok(Math.abs((v.x + 1) / 2 * W - o.x) < 0.01 && Math.abs((1 - v.y) / 2 * H - o.y) < 0.01, `projection of ${q}`);
  }
  // a boss 10.5 m straight down-screen (toward the lens) does not fit at any distance with the default 0.35 lerp …
  const S = { l: 8, t: 98, r: W - 8, b: 621 };
  const subs = [{ x: 0, z: 0, y0: 0, y1: 1, r: 0.5, inner: ISO.boss.herInner }, { x: 0, z: -10.5, y0: 0, y1: 2.2, r: 1.3, inner: ISO.boss.bossInner }];
  assert.equal(safeFitDist(subs, 2, { x: 0, y: 0.5, z: -3.7 }, yaw, pitch, fov, W, H, 0, offY, S, 14, 22), 23);
  const o = subjectOverflow(subs[1], { x: 0, y: 0.5, z: -3.7 }, yaw, pitch, 22, fov, W, H, 0, offY, S, ISO.boss.bossInner, {});
  assert.ok(o.over > 0 && o.dy < 0, 'he is below his rect: the push is up-screen');
  // … but leaning the focus 75 % of the way puts him inside the safe rect, her still inside it too
  const f2 = { x: 0, y: 0.5, z: -7.9 };
  assert.ok(subjectOverflow(subs[1], f2, yaw, pitch, 22, fov, W, H, 0, offY, S, ISO.boss.bossInner, {}).over < 30);
  assert.equal(subjectOverflow(subs[0], f2, yaw, pitch, 22, fov, W, H, 0, offY, S, 0.92, {}).over, 0);
  // a close boss beside her fits at the near clamp; the same gap toward the lens needs a wider frame
  subs[1].z = 0; subs[1].x = -4;
  assert.equal(safeFitDist(subs, 2, { x: -1.4, y: 0.5, z: 0 }, yaw, pitch, fov, W, H, 0, offY, S, 14, 22), 14);
  subs[1].x = 0; subs[1].z = -4;
  const dDown = safeFitDist(subs, 2, { x: 0, y: 0.5, z: -1.4 }, yaw, pitch, fov, W, H, 0, offY, S, 14, 22);
  assert.ok(dDown > 14 && dDown <= 22, 'toward the lens: ' + dDown);
});

test('OccluderFader: capsules only fade what is lens-side of the subject; roofs / solids fade to archOpacity', () => {
  const scene = new THREE.Scene();
  const stone = (z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.6).translate(0, 1.3, 0), new THREE.MeshStandardMaterial());
    m.name = name; m.userData.camFade = 'solid'; m.position.set(0, 0, z); scene.add(m); return m;
  };
  const behind = stone(1.3, 'stoneN'), front = stone(-1.6, 'stoneS');
  const fader = new OccluderFader({ minOpacity: 0.22, archOpacity: 0.1, checkHz: 0 });
  fader.scan(scene, scene);
  assert.equal(fader.solidCount, 2);
  const camPos = new THREE.Vector3(0, 9, -8), chest = [new THREE.Vector3(0, 0.5, 0)], her = new THREE.Vector3();
  for (let i = 0; i < 60; i++) fader.update(1 / 60, camPos, chest, { n: 1, radii: [1.0], her, crowns: false });
  const uB = fader.units.find((u) => u.root === behind), uF = fader.units.find((u) => u.root === front);
  assert.equal(uB.f, 0, 'a tall stone just behind her (screen-up) stays solid');
  assert.ok(uF.f > 0.95, `the stone between the lens and her fades (${uF.f.toFixed(2)})`);
  near(front.material.opacity, 0.1, 1e-6, 'solid units fade to archOpacity');
  fader.clear();
});

// ================================================================== AUTOCAM (research/next/AUTOCAM_SPEC.md §11.1)
const DEGR = Math.PI / 180;

/** Synthetic occluder sets for the §7.2 fixture profiles (CSS px): the geometry cam_2 measured the table from. */
function fixtureRects(profile, w, h) {
  const R = (x0, y0, x1, y1, kind) => ({ x: x0 * w, y: y0 * h, w: (x1 - x0) * w, h: (y1 - y0) * h, kind });
  switch (profile) {
    case 'desktop': return [R(0, 0, 0.30, 0.07, 'hud'), R(0.30, 0.93, 0.70, 1, 'bar')];
    case 'phone': return [R(0, 0, 0.42, 0.13, 'hud'), R(0, 0.13, 0.19, 1, 'stick'), R(0, 0.87, 0.62, 1, 'stick'), R(0.655, 0.32, 1, 1, 'cluster'), R(0.82, 0.13, 1, 0.32, 'cluster')];
    case 'lefty': return [R(0.58, 0, 1, 0.13, 'hud'), R(0.81, 0.13, 1, 1, 'stick'), R(0.38, 0.87, 1, 1, 'stick'), R(0, 0.32, 0.345, 1, 'cluster'), R(0, 0.13, 0.18, 0.32, 'cluster')];
    case 'portrait': return [R(0, 0, 1, 0.08, 'hud'), R(0, 0.655, 1, 1, 'cluster')];
    case 'tablet': return [R(0, 0, 0.40, 0.09, 'hud'), R(0, 0.09, 0.13, 1, 'stick'), R(0, 0.89, 0.75, 1, 'stick'), R(0.75, 0.25, 1, 1, 'cluster')];
    default: return [];
  }
}

test('AUTOCAM 11.1-7 SafeFrame: §7.2 core / anchor fixtures ±0.02; visible() false on the HUD and buttons; live holes never move core', () => {
  const T = {
    desktop: { w: 1920, h: 1080, core: [0.06, 0.94, 0.12, 0.88], a: [0.50, 0.54] },
    phone: { w: 844, h: 390, core: [0.24, 0.60, 0.20, 0.80], a: [0.46, 0.54] },
    lefty: { w: 844, h: 390, core: [0.40, 0.76, 0.20, 0.80], a: [0.54, 0.54] },
    portrait: { w: 390, h: 844, core: [0.08, 0.92, 0.13, 0.60], a: [0.50, 0.40] },
    tablet: { w: 1180, h: 820, core: [0.18, 0.70, 0.14, 0.84], a: [0.47, 0.53] },
  };
  const sf = new SafeFrame();
  for (const [k, f] of Object.entries(T)) {
    sf.rebuild(f.w, f.h, null, fixtureRects(k, f.w, f.h));
    const c = sf.core;
    near(c.x0, f.core[0], 0.021, `${k} core.x0`); near(c.x1, f.core[1], 0.021, `${k} core.x1`);
    near(c.y0, f.core[2], 0.021, `${k} core.y0`); near(c.y1, f.core[3], 0.021, `${k} core.y1`);
    // (the §7.2 tablet row's fx 0.47 contradicts its own rule: clamp(centre(core) 0.44, 0.5 ± 0.06) = 0.44)
    near(sf.ax, f.a[0], k === 'tablet' ? 0.031 : 0.021, `${k} anchor x`); near(sf.ay, f.a[1], 0.021, `${k} anchor y`);
    assert.ok(sf.herFrame.x0 >= c.x0 && sf.herFrame.x1 <= c.x1 && sf.herFrame.y0 >= 0.125 - 1e-9 && sf.herFrame.y1 <= 0.875 + 1e-9, `${k}: herFrame = core ∩ inner 75 %`);
  }
  // the real ui touch layout at touch size 0.8 / 1.0 / 1.4: buttons are holes, her core stays clear of them
  for (const ts of [0.8, 1.0, 1.4]) {
    const rects = fallbackOccluders({ w: 844, h: 390, touch: true, touchSize: ts });
    sf.rebuild(844, 390, null, rects);
    for (const r of rects.filter((q) => q.kind === 'cluster')) {
      const cx = (r.x + r.w / 2) / 844, cy = (r.y + r.h / 2) / 390;
      assert.equal(sf.visible(cx, cy), false, `ts ${ts}: a button centre is hidden`);
      assert.ok(!(cx > sf.core.x0 && cx < sf.core.x1 && cy > sf.core.y0 && cy < sf.core.y1), `ts ${ts}: no button inside core`);
    }
    assert.ok(sf.ax > 0.40 && sf.ax < 0.5 && sf.ay > 0.45 && sf.ay < 0.62, `ts ${ts}: anchor left of centre (${sf.ax.toFixed(2)}, ${sf.ay.toFixed(2)})`);
  }
  // mirrored (left-handed) layout: she moves right of centre
  sf.rebuild(844, 390, null, fallbackOccluders({ w: 844, h: 390, touch: true, leftHanded: true }));
  assert.ok(sf.ax > 0.5, `left-handed: anchor right of centre (${sf.ax.toFixed(2)})`);
  // desktop fallback: the ability bar and the HUD block are holes
  sf.rebuild(1280, 720, null, fallbackOccluders({ w: 1280, h: 720, barInset: 90 }));
  assert.equal(sf.visible(0.5, 0.97), false, 'under the ability bar = hidden');
  assert.equal(sf.visible(0.05, 0.03), false, 'under the HUD block = hidden');
  assert.equal(sf.visible(0.5, 0.5), true);
  // a live thumb hole changes visible(), never core or the anchor
  const core0 = { ...sf.core }, ax = sf.ax, ay = sf.ay, v0 = sf.version;
  sf.addLive(560, 300, 700, 420);
  assert.equal(sf.visible(630 / 1280, 360 / 720), false, 'under the thumb');
  assert.deepEqual(sf.core, core0); assert.equal(sf.ax, ax); assert.equal(sf.ay, ay); assert.equal(sf.version, v0);
  sf.clearLive();
  assert.equal(sf.visible(630 / 1280, 360 / 720), true);
});

test('AUTOCAM 11.1-2 lead: run down-screen → 2.31 m (desktop cap 2.4), 2.0 phone; up → 0.66; taps, tumbles and reversals never lead', () => {
  const v = {};
  intentLead(0, -5.5, 'run', Math.PI, 'desktop', v);                // yaw π: −Z = down-screen
  near(v.z, -2.31, 1e-6, 'desktop down'); near(v.x, 0, 1e-9);
  intentLead(0, -5.5, 'stick', Math.PI, 'phone', v); near(v.z, -2.0, 1e-6, 'phone down cap');
  intentLead(0, 5.5, 'order', Math.PI, 'desktop', v); near(v.z, 0.66, 1e-6, 'up-screen');
  intentLead(-5.5, 0, 'run', Math.PI, 'desktop', v); near(Math.hypot(v.x, v.z), 1.43, 1e-6, 'side 0.26 s × 5.5');
  intentLead(-7.2, -7.2, 'run', Math.PI, 'desktop', v); assert.ok(Math.hypot(v.x, v.z) <= ISO.lead.max + 1e-9, 'radial cap 2.5 m');
  intentLead(0, -2, 'walk', Math.PI, 'desktop', v); assert.ok(Math.abs(v.z) < 0.84 * 0.3, `a 2 m/s walk leads a little (${v.z.toFixed(2)})`);
  for (const k of ['other', 'idle']) { intentLead(0, -5.5, k, Math.PI, 'desktop', v); assert.equal(Math.hypot(v.x, v.z), 0, `${k} → 0`); }
  // debounce: a 0.15 s tap never passes; 0.25 s of steady intent does; a 130° reversal resets the timer
  const gate = new LeadGate(), cur = { x: 0, z: 0 }, t = { x: 0, z: 0 };
  let passed = false;
  for (let i = 0; i < 9; i++) { t.x = 0; t.z = -2.31; gate.step(t, cur, 1 / 60); passed ||= t.z !== 0; }
  assert.equal(passed, false, 'a 0.15 s tap → no lead');
  t.x = 0; t.z = 0; gate.step(t, cur, 1 / 60);
  for (let i = 0; i < 15; i++) { t.x = 0; t.z = -2.31; gate.step(t, cur, 1 / 60); }
  near(t.z, -2.31, 1e-9, 'steady intent passes after 0.20 s');
  cur.z = -2.0;                                                      // the lead is now down-screen
  const a = 130 * DEGR; t.x = Math.sin(a) * 2; t.z = -Math.cos(a) * 2;
  gate.step(t, cur, 1 / 60);
  assert.equal(Math.hypot(t.x, t.z), 0, 'a 130° reversal resets the debounce');
  assert.equal(gate.t, 0);
});

/** A THREE camera posed exactly as the iso rig poses it (focus, yaw, pitch, d, fov, anchor). */
function rigCamera(F, yaw, pitch, d, fov, W, H, fx, fy) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.3, 200);
  const p = isoPosition(F, yaw, pitch, d, {});
  cam.position.set(p.x, p.y, p.z); cam.up.set(0, 1, 0); cam.lookAt(F.x, F.y, F.z);
  const ox = Math.round((0.5 - fx) * W), oy = Math.round((0.5 - fy) * H);
  if (ox || oy) cam.setViewOffset(W, H, ox, oy, W, H); else cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}
const projN = (cam, x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; };

test('AUTOCAM 11.1-3 exhaustive core sweep: lead × combat lean × aim pan, clamped by herLimits, keeps her feet and head in herFrame', () => {
  const profiles = [[1920, 1080, 'kbm', false], [1180, 820, 'touch', false], [844, 390, 'touch', false], [844, 390, 'touch', true], [390, 844, 'touch', false]];
  const sf = new SafeFrame(), lim = {}, off = { x: 0, z: 0 };
  let n = 0;
  for (const [W, H, dev, lefty] of profiles) {
    sf.rebuild(W, H, null, fallbackOccluders({ w: W, h: H, touch: dev === 'touch', leftHanded: lefty, barInset: dev === 'touch' ? 0 : 90 }));
    const prof = camProfile(W, H, dev), caps = ISO.lead.caps[prof], fx = sf.ax, fy = sf.ay;
    for (const zoom of [0.7, 1.0, 1.4]) {
      const fr = isoFrame({ w: W, h: H, device: dev, zoom });
      const tanV = Math.tan((fr.fov * Math.PI) / 360), tanH = tanV * (W / H);
      herLimits(fr.pitch, fr.dist, tanV, tanH, fx, fy, sf.herFrame, lim);
      const cam = rigCamera({ x: 0, y: ISO.focusY, z: 0 }, Math.PI, fr.pitch, fr.dist, fr.fov, W, H, fx, fy);
      for (let li = 0; li < 8; li++) for (let ci = -1; ci < 8; ci++) for (const aimOn of [0, 1]) {
        const la = (li * Math.PI) / 4, ca = (ci * Math.PI) / 4;
        // full-cap lead (screen axes at yaw π: up = +Z, right = −X), full combat lean, max aim pan, + the bias
        const lu = Math.cos(la) >= 0 ? Math.cos(la) * caps[1] : Math.cos(la) * caps[2], lr = Math.sin(la) * caps[0];
        const cu = ci < 0 ? 0 : Math.cos(ca) * (Math.cos(ca) >= 0 ? ISO.framing.lean.capUp : ISO.framing.lean.capDown[prof]);
        const cr = ci < 0 ? 0 : Math.sin(ca) * ISO.framing.lean.capUp;
        const ap = aimOn ? ISO.aimPan.cap[prof] : 0;
        const u = lu + cu + ap * Math.cos(la) + (prof === 'portrait' ? 0 : ISO.lead.up), r = lr + cr + ap * Math.sin(la);
        off.x = -r; off.z = u;
        clampToLimits(off, Math.PI, lim);
        // her = focus − offset
        const hx = -off.x, hz = -off.z;
        const fs = projN(cam, hx, 0, hz), hs = projN(cam, hx, ISO.catHView ?? 1, hz);
        const F = sf.herFrame, inF = (s) => s[0] >= F.x0 - 1e-3 && s[0] <= F.x1 + 1e-3 && s[1] >= F.y0 - 1e-3 && s[1] <= F.y1 + 1e-3;
        assert.ok(inF(fs) && inF(hs), `${W}×${H}${lefty ? ' L' : ''} zoom ${zoom} lead ${li} lean ${ci} aim ${aimOn}: feet ${fs.map((q) => q.toFixed(3))} head ${hs.map((q) => q.toFixed(3))} herFrame ${JSON.stringify(F)}`);
        n++;
      }
    }
  }
  assert.equal(n, 5 * 3 * 8 * 9 * 2);
});

test('AUTOCAM 11.1-4 needD: the closed form matches a brute-force sweep (three.js projection + view offset) within ±0.05 m', () => {
  const W = 1920, H = 1080, fov = 38, yaw = Math.PI;
  const v = setYaw(makeView(), yaw);
  v.tanV = Math.tan((fov * Math.PI) / 360); v.tanH = v.tanV * W / H;
  const pool = new Float32Array(STRIDE * 2);
  for (const [fx, fy] of [[0.5, 0.54], [0.44, 0.5], [0.56, 0.4]]) {
    v.offX = 2 * fx - 1; v.offY = 1 - 2 * fy; v.xL = -0.85; v.xR = 0.85; v.yB = -0.78; v.yT = 0.86;
    for (const fixed of [isoPitch(13), NaN]) {
      v.pitchOf = (d) => (Number.isFinite(fixed) ? fixed : isoPitch(d));
      for (const [ex, ez, ey] of [[-7, 0, 0.4], [7, 0, 0.4], [0, 9, 0.4], [0, -6, 0.4], [3, -5, 1.2]]) {
        const F = { x: 0.5, y: 0.6, z: 0.2 }, rho = 0.9;
        pool[0] = F.x + ex; pool[1] = ey; pool[2] = F.z + ez; pool[3] = rho; pool[4] = 1; pool[5] = F_HARD;
        const closed = needDAt(pool, 1, F.x, F.y, F.z, 0, 0, v, v.pitchOf(14));
        // brute: smallest d (1 cm steps) where the sphere's conservative extremes sit inside the frame
        let brute = NaN;
        for (let d = 2; d < 60; d += 0.01) {
          const cam = rigCamera(F, yaw, v.pitchOf(14), d, fov, W, H, fx, fy);
          const q = new THREE.Vector3(pool[0], pool[1], pool[2]).applyMatrix4(cam.matrixWorldInverse);
          const P = cam.projectionMatrix.elements, z = -q.z - rho;
          if (z <= 0) continue;
          const nxR = P[0] * (q.x + rho) / z - P[8], nxL = P[0] * (q.x - rho) / z - P[8];
          const nyT = P[5] * (q.y + rho) / z - P[9], nyB = P[5] * (q.y - rho) / z - P[9];
          if (nxR <= v.xR && nxL >= v.xL && nyT <= v.yT && nyB >= v.yB) { brute = d; break; }
        }
        near(closed, brute, 0.05, `anchor (${fx}, ${fy}) subject (${ex}, ${ez})`);
      }
    }
  }
});

test('AUTOCAM 11.1-5 engage hysteresis: enters at 9.5 m, stays at 11 m, leaves at 12.6 m; 1.5 s not alerted drops it', async () => {
  const { ctx, cam } = await makeIsoCamA();
  const e = enemyAt(ctx, 0, 9.5); e.alerted = true;
  const feet = ctx.player.object3d.position;
  cam._engagedSet(feet, 1 / 60);
  assert.ok(cam.engaged.includes(e), 'enters at 9.5 m');
  e.pos.z = 11; e.object3d.position.z = 11;
  cam._engagedSet(feet, 1 / 60);
  assert.ok(cam.engaged.includes(e), 'stays at 11 m');
  e.pos.z = 12.6; e.object3d.position.z = 12.6;
  cam._engagedSet(feet, 1 / 60);
  assert.ok(!cam.engaged.includes(e), 'leaves at 12.6 m');
  e.pos.z = 11; e.object3d.position.z = 11;
  cam._engagedSet(feet, 1 / 60);
  assert.ok(!cam.engaged.includes(e), 'does not re-enter at 11 m (enter radius 10)');
  e.pos.z = 8; e.object3d.position.z = 8;
  cam._engagedSet(feet, 1 / 60);
  e.alerted = false; e.stateName = 'patrol';
  for (let i = 0; i < 80; i++) cam._engagedSet(feet, 1 / 60);
  assert.ok(cam.engaged.includes(e), 'kept for 1.33 s without the alert');
  for (let i = 0; i < 15; i++) cam._engagedSet(feet, 1 / 60);
  assert.ok(!cam.engaged.includes(e), 'dropped after 1.5 s not alerted');
});

test('AUTOCAM 11.1-6 applyAnchor: the focus projects to (fx, fy) ± 0.5 px for 5 anchors; whole pixels, only on change', async () => {
  const { ctx, cam } = await makeIsoCamA();
  const W = 1280, H = 720, c = ctx.camera;
  c.aspect = W / H;
  for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.54], [0.46, 0.54], [0.54, 0.54], [0.5, 0.4]]) {
    c.position.set(0, 10, -8); c.lookAt(0, 0.6, 0); c.updateMatrixWorld();
    cam._vo.x = NaN;
    assert.equal(cam._applyAnchor(c, W, H, fx, fy), true);
    assert.equal(cam._applyAnchor(c, W, H, fx, fy), false, 'no change → no projection rebuild');
    const v = new THREE.Vector3(0, 0.6, 0).project(c);
    near((v.x + 1) / 2 * W, fx * W, 0.5, `x at (${fx}, ${fy})`); near((1 - v.y) / 2 * H, fy * H, 0.5, `y at (${fx}, ${fy})`);
  }
});

test('AUTOCAM 11.1-8 cat clamp at every zoom (≥ 30 px landscape, ≥ 28 portrait, ≥ 26 boss); portrait d ∈ [16, 26]; Bigger hero caps the zoom-out', () => {
  for (const zoom of [0.7, 1.0, 1.4]) {
    const a = isoFrame({ w: 1920, h: 1080, device: 'kbm', zoom }), b = isoFrame({ w: 844, h: 390, device: 'touch', zoom });
    const p = isoFrame({ w: 390, h: 844, device: 'touch', zoom }), bo = isoFrame({ w: 844, h: 390, device: 'touch', zoom, boss: true });
    for (const [f, H, min] of [[a, 1080, 30], [b, 390, 30], [p, 844, 28], [bo, 390, 26]]) assert.ok(pxAt(apparentH(f.pitch), f.dist, f.fov, H) >= min - 0.05, `zoom ${zoom}: ${pxAt(apparentH(f.pitch), f.dist, f.fov, H).toFixed(1)} px ≥ ${min}`);
    assert.ok(p.dist >= 16 - 1e-9 && p.dist <= 26, `portrait d ${p.dist.toFixed(2)} in [16, 26] (cat clamp on top)`);
    const big = isoFrame({ w: 844, h: 390, device: 'touch', zoom, bigger: true });
    assert.ok(pxAt(apparentH(big.pitch), big.dist, big.fov, 390) >= BIGGER_PX - 0.05 || big.dist <= ISO.distMin + 1e-9, 'Bigger hero ≥ 40 px');
  }
});

test('AUTOCAM 11.1-9 footprint = the three.js unprojected corners; ahead / behind / halfW at the §3 case; far is a multiple of 5 in [45, 90]', () => {
  const W = 1920, H = 1080, fov = 38, d = 13, pitch = isoPitch(13), F = { x: 1, y: 0.6, z: 2 }, fx = 0.5, fy = 0.54;
  const cam = rigCamera(F, Math.PI, pitch, d, fov, W, H, fx, fy);
  const tanV = Math.tan((fov * Math.PI) / 360), out = { q: new Float32Array(8) };
  assert.equal(footprintOf(F, Math.PI, pitch, d, tanV, tanV * W / H, fx, fy, 0, out), true);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([nx, ny], i) => {
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    const t = -cam.position.y / v.y, hit = v.multiplyScalar(t).add(cam.position);
    near(out.q[i * 2], hit.x, 0.05, `corner ${i} x`); near(out.q[i * 2 + 1], hit.z, 0.05, `corner ${i} z`);
  });
  // the §3 desktop case (d 13, her 4 % low): ≈ 3.2 m below the focus row, ≈ 8.4 m half width
  assert.ok(out.behind > 3 && out.behind < 4.5 && out.ahead > 8.5 && out.ahead < 11.5, `ahead ${out.ahead.toFixed(2)} behind ${out.behind.toFixed(2)}`);
  near(out.halfW, 8.43, 0.15, 'half width');
  assert.equal(inQuad(out.q, F.x, F.z + 2), true); assert.equal(inQuad(out.q, F.x + 30, F.z), false); assert.equal(inQuad(out.q, out.q[0] - 0.5, out.q[1], 1), true, 'pad grows the quad');
  for (const [dd, rho] of [[9, 0.045], [13, 0.045], [22, 0.02], [13, 0.12]]) {
    const o = { q: new Float32Array(8) };
    footprintOf(F, Math.PI, isoPitch(dd), dd, tanV, tanV * W / H, fx, fy, 0, o);
    const f = farPlane(o.slantMax, dd, isoPitch(dd), fogRadius(rho, 5, 1.5));
    assert.ok(f % 5 === 0 && f >= 45 && f <= 90, `far ${f}`);
  }
  assert.equal(farPlane(24, 13, isoPitch(13), fogRadius(0.045, 5, 1.5)), 55, 'meadow day at d 13: ≈ 55 m (fogFar 48)');
});

test('AUTOCAM 11.1-10 zero allocation: 10 000 rig + solver steps grow the heap < 64 KB', async () => {
  const v8 = await import('node:v8'), vm = await import('node:vm');
  v8.setFlagsFromString('--expose_gc');
  const gc = vm.runInNewContext('gc');
  const { ctx, cam } = await makeIsoCamA();
  for (let i = 0; i < 4; i++) { const e = enemyAt(ctx, Math.sin(i) * 5, Math.cos(i) * 5); e.alerted = true; }
  const p = ctx.player;
  const step = (k) => { p.object3d.position.x = Math.sin(k * 0.01) * 3; p.pos.x = p.object3d.position.x; cam.update(1 / 60); cam.render(0, 1 / 60); };
  for (let i = 0; i < 15000; i++) step(i);                         // warm up (JIT code + feedback settle; pools)
  gc(); const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 10000; i++) step(i);
  gc(); const grow = process.memoryUsage().heapUsed - h0;
  assert.ok(grow < ISO.budget.heapKB * 1024, `heap grew ${(grow / 1024).toFixed(1)} KB`);
});

/** FollowCamera iso on the tiny ctx, with a 1280 × 720 view and Env-less physics. */
async function makeIsoCamA() {
  const ctx = makeCtx();
  ctx.params = { cam: 'iso' }; ctx.player.onGround = true; ctx.physics.raycast = () => null;
  ctx.game.time = 0; ctx.game.frameCount = 1;
  ctx.renderer = { domElement: { clientWidth: 1280, clientHeight: 720, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } };
  ctx.camera.aspect = 1280 / 720; ctx.camera.updateProjectionMatrix();
  ctx.player.pos.set(0, 0, 0); ctx.player.object3d.position.set(0, 0, 0);
  const cam = new FollowCamera(ctx);
  ctx.cam = cam;
  await cam.init();
  const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { ctx.game.time += dt; cam.update(dt); cam.render(0, dt); } };
  step(3);
  return { ctx, cam, step };
}

test('AUTOCAM D1 / §4.2: rigid XZ follow, the bias up-screen, the lead from intent (down-screen biggest), no overshoot on stop', async () => {
  const { ctx, cam, step } = await makeIsoCamA();
  const p = ctx.player;
  near(cam.focus.x, 0, 1e-6); near(cam.focus.z, ISO.lead.up, 0.02, 'the 0.8 m explore bias (screen-up = +Z)');
  // run down-screen (−Z) at 5.5 m/s for 2 s (WASD: move y −1)
  ctx.input.device = 'kbm'; ctx.input.move.x = 0; ctx.input.move.y = -1; p.stateName = 'move';
  let z = 0, maxLead = 0;
  for (let i = 0; i < 120; i++) {
    z -= 5.5 / 60; p.pos.z = z; p.object3d.position.z = z; p.vel.set(0, 0, -5.5);
    step(1);
    near(cam.focus.x - p.object3d.position.x, 0, 1e-6, 'rigid XZ: no lag sideways');
    maxLead = Math.max(maxLead, -(cam.focus.z - z));
  }
  assert.ok(maxLead > 1.2 && maxLead <= 2.4 + 1e-6, `down-screen lead builds toward 2.31 m (−bias), got ${maxLead.toFixed(2)}`);
  // stop: the lead releases over ≈ 0.8 s with no overshoot past the bias
  ctx.input.move.y = 0; p.vel.set(0, 0, 0); p.stateName = 'idle';
  let minOff = Infinity, prevOff = -Infinity, reversals = 0, dir = 0;
  for (let i = 0; i < 180; i++) {
    step(1);
    const o = cam.focus.z - z;
    minOff = Math.min(minOff, o);
    const d = Math.sign(o - prevOff); if (prevOff > -Infinity && d && dir && d !== dir) reversals++; if (d) dir = d; prevOff = o;
  }
  near(cam.focus.z - z, ISO.lead.up, 0.05, 'back to the bias');
  assert.ok(cam.focus.z - z <= ISO.lead.up + 1e-6, 'never past the bias (no overshoot)');
  assert.equal(reversals, 0, 'monotonic return');
});

test('AUTOCAM §6 solver: a THREAT winding up down-screen is framed (lean down / zoom out ≤ +3 m); hysteresis; out fast, in slow', async () => {
  const { ctx, cam, step } = await makeIsoCamA();
  ctx.ui = { bar: { insetBottom: 90 } }; cam.safeFrame.key = '';
  step(2);
  const d0 = cam.iso().dist;
  const e = enemyAt(ctx, 0, -6, 0.8); e.radius = 0.3;
  // a wind-up aimed at her (combat:telegraph with targetsPlayer, activeAt / windup)
  ctx.bus.emit(E.TELEGRAPH, { id: 't1', actor: e, kind: 'red', shape: 'lane', pos: e.pos.clone(), end: new THREE.Vector3(0, 0, -2), windup: 0.8, activeAt: ctx.game.time + 0.8, targetsPlayer: true });
  step(48);
  const fr = cam.framing();
  assert.ok(fr.subjects.some((s) => s.cls === 'threat' && s.hard), 'THREAT subject (hard)');
  const H = 720, chest = new THREE.Vector3(e.pos.x, e.pos.y + 0.4, e.pos.z), sy = () => (1 - chest.clone().project(ctx.camera).y) / 2 * H;
  assert.ok(sy() < H, `its chest is on screen within 0.8 s (${sy().toFixed(0)} px of ${H})`);
  step(24);
  assert.ok(cam.onScreen(chest, 0), `and clear of the ability bar within 1.2 s (${sy().toFixed(0)} px)`);
  assert.ok(cam.iso().dist <= d0 + 3 + 1e-6 && cam.iso().dist <= 16 + 1e-6, `d ${cam.iso().dist.toFixed(2)} ≤ dBase + 3`);
  assert.ok(cam._lean.z < -0.2 || cam.iso().dist > d0 + 0.3, 'it leans down-screen or zooms out');
  // hysteresis: a tiny move keeps the goal
  const g0 = { ...cam._goal };
  e.pos.x += 0.1; e.object3d.position.x = e.pos.x;
  step(6);
  assert.equal(cam._goal.d, g0.d, 'goal held for a 0.1 m nudge');
  // end: hold 1.5 s, then ease back in (≤ 1.5 m/s)
  ctx.bus.emit(E.TELEGRAPH_END, { id: 't1' });
  e.alive = false;
  step(30);
  const dHold = cam.iso().dist;
  step(50);
  assert.ok(Math.abs(cam.iso().dist - dHold) < 0.05, 'held ~1.5 s before zooming in');
  let prev = cam.iso().dist, maxRate = 0;
  for (let i = 0; i < 300; i++) { step(1); maxRate = Math.max(maxRate, (prev - cam.iso().dist) * 60); prev = cam.iso().dist; }
  near(cam.iso().dist, d0, 0.05, 'back to the rest distance');
  assert.ok(maxRate <= ISO.framing.dist.inVmax + 0.05, `zoom-in rate ${maxRate.toFixed(2)} m/s ≤ 1.5`);
});

test('AUTOCAM §6.2 subjects: weights fade in 0.35 s / out 0.5 s; hard only at w ≥ 0.5; the drop ladder keeps token holders', () => {
  const S = new Subjects(), a = { id: 'a' }, b = { id: 'b' };
  S.setHer(0, 0.4, 0, 0.6);
  for (let i = 0; i < 6; i++) { S.begin(); S.want(a, CLS.ENGAGED, 2, 0.5, 2, 0.9, 1, true); S.end(0.05); }
  const ia = S.indexOf(a);
  near(S.data[ia * STRIDE + 4], 0.3 / 0.35 > 1 ? 1 : 0.3 / 0.35, 1e-5, 'w after 0.3 s');
  assert.ok(S.data[ia * STRIDE + 5] & F_HARD, 'hard once w ≥ 0.5');
  for (let i = 0; i < 3; i++) { S.begin(); S.end(0.1); }
  assert.ok(S.data[S.indexOf(a) * STRIDE + 4] > 0.2, 'still fading out after 0.3 s (from 0.86 at 2 / s)');
  assert.ok(!(S.data[S.indexOf(a) * STRIDE + 5] & F_HARD) || S.data[S.indexOf(a) * STRIDE + 4] >= 0.5);
  for (let i = 0; i < 4; i++) { S.begin(); S.end(0.1); }
  assert.equal(S.indexOf(a), -1, 'freed after 0.5 s');
  // drop ladder: soft first, then the farthest tokenless ENGAGED
  S.begin(); S.want(a, CLS.ENGAGED, 9, 0.5, 0, 0.9, 1, true, true); S.want(b, CLS.ENGAGED, 12, 0.5, 0, 0.9, 1, true); S.want({ id: 'c' }, CLS.PRE, 3, 0.5, 0, 0.9, 1, false); S.end(0);
  const F = { x: 0, y: 0.6, z: 0 };
  assert.equal(dropOne(S.data, S.n, F), true);
  assert.ok(S.data[S.indexOf(S.keys.find((k) => k?.id === 'c')) * STRIDE + 5] & F_DROP, 'soft dropped first');
  assert.equal(dropOne(S.data, S.n, F), true);
  assert.ok(S.data[S.indexOf(b) * STRIDE + 5] & F_DROP, 'then the farthest without a token');
  assert.equal(dropOne(S.data, S.n, F), false, 'the token holder is never dropped');
});

test('AUTOCAM §8.1 beats: Peekaboo leans toward the kitten and comes back; no beat while a THREAT winds up; Reduce camera motion: none', async () => {
  const { ctx, cam, step } = await makeIsoCamA();
  const f0 = cam.focus.clone();
  ctx.bus.emit(E.KITTEN_REVEAL, { kittenId: 'k1', position: new THREE.Vector3(6, 0, 0) });
  step(60);
  assert.equal(cam.beat.id, 'peekaboo');
  assert.ok(cam.focus.x - f0.x > 1.5, `leans toward the kitten (${(cam.focus.x - f0.x).toFixed(2)} m)`);
  step(90);
  assert.equal(cam.beat.active, false, 'ends after in + hold + out');
  step(40);
  near(cam.focus.x, f0.x, 0.05, 'back on her');
  ctx.bus.emit(E.KITTEN_REVEAL, { kittenId: 'k1', position: new THREE.Vector3(6, 0, 0) });
  step(5);
  assert.equal(cam.beat.active, false, 'once per kitten');
  // a live THREAT blocks beats
  const e = enemyAt(ctx, 0, 5);
  ctx.bus.emit(E.TELEGRAPH, { id: 't2', actor: e, kind: 'red', shape: 'cone', pos: e.pos.clone(), windup: 1, activeAt: ctx.game.time + 1, targetsPlayer: true });
  step(2);
  ctx.bus.emit(E.KITTEN_RESCUED, { kittenId: 'k2', position: new THREE.Vector3(-3, 0, 0) });
  step(10);
  assert.equal(cam.beat.active, false, 'never during a live THREAT');
  ctx.bus.emit(E.TELEGRAPH_END, { id: 't2' }); e.alive = false;
  step(60);
  ctx.state.settings.reduceCameraMotion = true;
  step(30);
  assert.equal(cam.beat.active, false, 'Reduce camera motion fades a running beat out (0.3 s)');
  ctx.bus.emit(E.KITTEN_REVEAL, { kittenId: 'k3', position: new THREE.Vector3(6, 0, 0) });
  step(10);
  assert.equal(cam.beat.active, false, 'Reduce camera motion: no beats');
  near(beatEnvelope(0.3, 0.6, 1, 0.8), 0.5, 1e-9); assert.equal(beatEnvelope(1.0, 0.6, 1, 0.8), 1); assert.equal(beatEnvelope(9, 0.6, 1, 0.8), 0);
});

test('AUTOCAM §7.3 onScreen = SafeFrame-visible: a foe under the ability bar is hidden; inView / activityOf use the plain frustum', async () => {
  const { ctx, cam, step } = await makeIsoCamA();
  ctx.ui = { bar: { insetBottom: 110 }, safeInsets: { top: 0, bottom: 110, left: 0, right: 0, w: 1280, h: 720 } };
  cam.safeFrame.key = '';
  step(3);
  const c = ctx.camera, p = new THREE.Vector3();
  // the ground point drawn at screen (0.5, 0.95) → under the bar
  const v = new THREE.Vector3(0, -0.9, 0.5).unproject(c).sub(c.position).normalize();
  p.copy(c.position).addScaledVector(v, -c.position.y / v.y);
  assert.equal(cam.onScreen(p, 0), false, 'under the bar = not visible (no off-screen snipe)');
  assert.equal(cam.inView(p, 0.3), true, 'but drawn (perf: full rate)');
  const e = enemyAt(ctx, p.x, p.z);
  assert.equal(cam.activityOf(e), 0, 'tier 0 in view');
  const far = enemyAt(ctx, 0, -45), farther = enemyAt(ctx, 70, -60);
  assert.equal(cam.activityOf(far), 2, 'tier 2: off screen ≤ 60 m'); assert.equal(cam.activityOf(farther), 3);
  const near1 = enemyAt(ctx, 25, -14);
  assert.equal(cam.activityOf(near1), 1, 'tier 1: off screen ≤ 30 m');
  assert.equal(cam.onScreen(cam.focus, 0.5), true, 'her focus is visible');
  assert.ok(cam.footprint.valid && cam.footprint.version > 0, 'footprint published');
  assert.equal(cam.inFootprint(cam.focus.x, cam.focus.z), true);
  const U = { x: 0, z: 0 }, R = { x: 0, z: 0 }; cam.groundAxes(U, R);
  near(U.z, 1, 1e-9); near(R.x, -1, 1e-9);
});

test('AUTOCAM §10 comfort: Reduce camera motion = no lead, anchor y 0.50, discrete combat zoom; touch shake has no rotation', async () => {
  const { ctx, cam, step } = await makeIsoCamA();
  ctx.state.settings.reduceCameraMotion = true;
  cam._onSetting({ key: 'reduceCameraMotion' });
  step(300);                                                        // the 0.8 m bias releases (biasST 1 s)
  near(cam._anc.toY, ISO.reduce.anchorY, 1e-9, 'static compensation: her at y 0.50');
  const p = ctx.player;
  ctx.input.device = 'kbm'; ctx.input.move.y = -1; p.stateName = 'move';
  let z = 0;
  for (let i = 0; i < 90; i++) { z -= 5.5 / 60; p.pos.z = z; p.object3d.position.z = z; p.vel.set(0, 0, -5.5); step(1); }
  near(cam.focus.z - z, 0, 1e-3, 'no animated lead and no bias');
  ctx.input.move.y = 0; p.vel.set(0, 0, 0); p.stateName = 'idle';
  // touch: shake translation only
  ctx.input.device = 'touch';
  cam.shake(1); step(1);
  const q0 = ctx.camera.quaternion.clone();
  cam.shaker.reset(); step(1);
  near(q0.angleTo(ctx.camera.quaternion), 0, 1e-6, 'no rotation from the shake on touch');
});

test('AUTOCAM §10.4 lock modes: Y toggles locked ↔ the last unlocked mode; settings.camLockMode + camLock written', async () => {
  const { ctx, cam } = await makeIsoCamA();
  const seen = [];
  ctx.bus.on(E.SETTINGS_CHANGED, (p) => seen.push(p.key + ':' + p.value));
  assert.equal(cam.camLockMode, 'locked');
  assert.equal(cam.setCamLock(false, false), false);
  assert.equal(cam.camLockMode, 'free'); assert.equal(ctx.state.settings.camLockMode, 'free'); assert.equal(ctx.state.settings.camLock, false);
  cam.setCamLockMode('semi', false); cam.setCamLock(true, false);
  assert.equal(cam.camLockMode, 'locked');
  cam.setCamLock(false, false);
  assert.equal(cam.camLockMode, 'semi', 'Y returns to the last unlocked mode');
  ctx.state.settings.camLockMode = 'locked'; ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'camLockMode', value: 'locked' });
  assert.equal(cam.camLocked, true, 'settings drive the mode');
  assert.ok(seen.includes('camLockMode:free') && seen.includes('camLockMode:semi'));
});

test('WA camera.W2: framing reads her capsule, never the visual bbox (identical at playScale 1.0 and 1.12)', async () => {
  const run = async (scale) => {
    const { ctx, cam, step } = await makeIsoCamA();
    ctx.player.object3d.scale.setScalar(scale);
    const e = enemyAt(ctx, 3, -6); e.alerted = true;
    step(40);
    const f = cam.framing();
    return JSON.stringify({ need: f.need.toFixed(4), d: f.d.toFixed(4), lean: f.lean.map((q) => q.toFixed(4)), her: f.subjects[0] });
  };
  assert.equal(await run(1.12), await run(1.0));
});

test('AUTOCAM §8.3 / WA camera.W1: blendPoseIso eases distance in log space; blendTo(follow) from a shot lands on the gameplay frame', async () => {
  const a = new CamPose(), b = new CamPose();
  a.look.set(0, 1, 0); a.pos.set(0, 1 + 3.5 * Math.sin(0.2), 3.5 * Math.cos(0.2));
  b.look.set(0, 0.6, 0); b.pos.set(0, 0.6 + 13 * Math.sin(0.9), -13 * Math.cos(0.9));
  const m = blendPoseIso(a, b, 0.5, new CamPose());
  near(m.pos.distanceTo(m.look), Math.sqrt(3.5 * 13), 1e-6, 'geometric mean at k 0.5');
  for (let k = 0; k <= 1.0001; k += 0.1) assert.ok(blendPoseIso(a, b, k, new CamPose()).pos.y > 0.5, 'never through the ground');
  const { ctx, cam, step } = await makeIsoCamA();
  const calls = [];
  ctx.postfx = { setCinematic: (on) => calls.push(on) };
  cam.shot({ preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut', loop: true });
  step(5);
  cam.preset('HERO_LOW', 'swordcat', { mode: 'cut' });
  step(5);
  cam.blendTo('follow', 1.1, 'inOutSine');
  assert.equal(cam.modeName, 'follow');
  step(Math.round(1.1 * 60) + 2);
  const pose = cam._gamePose;
  near(ctx.camera.position.distanceTo(pose.pos), 0, 1e-3, 'the blend lands on the gameplay pose (no second move)');
  assert.deepEqual(calls, [true, false], 'setCinematic on the shot (not the looping title shot), off on the hand-back');
});

test('AUTOCAM ui ask: heroScreen() is the SafeFrame anchor in CSS px; mirrored for a left-handed touch layout', async () => {
  const { ctx, cam, step } = await makeIsoCamA();
  ctx.renderer.domElement.clientWidth = 844; ctx.renderer.domElement.clientHeight = 390;
  ctx.input.device = 'touch';
  step(3);
  const r = cam.heroScreen();
  assert.ok(r.x < 844 * 0.5 && r.x > 844 * 0.38, `right-handed: left of centre (${r.x.toFixed(0)})`);
  ctx.state.settings.leftHanded = true; cam._onSetting({ key: 'leftHanded' });
  step(3);
  assert.ok(cam.heroScreen().x > 844 * 0.5, `left-handed: right of centre (${cam.heroScreen().x.toFixed(0)})`);
});

test('ART §6.1 closeUp: on below 6.0 m, off above 6.3 m (hysteresis); the framed character view gets setCloseUp', async () => {
  const { ctx, cam, step } = await makeIsoCamA();
  const got = [];
  ctx.player.model = { setCloseUp: (on) => got.push(on) };
  step(2);
  assert.equal(cam.closeUp, false, 'iso play is never a close-up');
  cam.shot({ preset: 'ECU_EYES', anchor: 'swordcat', mode: 'cut' });
  step(2);
  assert.equal(cam.closeUp, true);
  cam.mode('follow', { blend: false });
  step(2);
  assert.equal(cam.closeUp, false);
  assert.deepEqual(got.filter((x, i) => i === 0 || got[i - 1] !== x), [true, false]);
});
