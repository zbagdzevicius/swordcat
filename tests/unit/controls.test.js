// tests/unit/controls.test.js  (owner: core, integration) — research/CONTROLS_SPEC.md: the pure pieces of the iso
// controls: the camera rig maths (IsoRig), the nav grid + A* (NavGrid / Pathfind), the aim resolver (player/Aim.js),
// the touch layout + gesture classifier (ui/touchLayout.js), and the FollowCamera iso rig end to end with a tiny ctx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as config from '../../src/core/config.js';
import { EventBus } from '../../src/core/EventBus.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { Input } from '../../src/core/Input.js';
import { GameState } from '../../src/core/GameState.js';
import { Actor } from '../../src/core/Actor.js';
import { isoPitch, catClampDist, pxAt, widthFitDist, isoFrame, isoFrameOffset, isoPosition, isoLead, fitDist, screenToWorldDir, craneArc, deviceClass, FRAME } from '../../src/camera/IsoRig.js';
import { FollowCamera } from '../../src/camera/FollowCamera.js';
import { NavGrid } from '../../src/physics/NavGrid.js';
import { findPath } from '../../src/physics/Pathfind.js';
import { resolveAim, autoTarget, magnetPick, threatSnap, hopSpeed } from '../../src/player/Aim.js';
import { computeLayout, minGap, buttonAt, inDeadRing, inStickZone, classifyGesture, stickVector } from '../../src/ui/touchLayout.js';

const { CAMERA, NAV, AIM, TOUCH } = config;
const I = CAMERA.iso;
const DEG = Math.PI / 180;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b}, got ${a}`);

// ------------------------------------------------------------------ IsoRig (§2.1, §2.4)
test('iso rig: pitch curve 9 → 46°, 12 → 50°, 13 → 51.3°, 18 → 58°; clamped outside', () => {
  near(isoPitch(9) / DEG, 46, 0.05);
  near(isoPitch(12) / DEG, 50, 0.1);
  near(isoPitch(13) / DEG, 51.3, 0.1);
  near(isoPitch(18) / DEG, 58, 0.05);
  near(isoPitch(30) / DEG, 58, 0.05); near(isoPitch(2) / DEG, 46, 0.05);
});

test('iso rig: cat-size clamp (§2.1: 390 px tall phone → dMax ≈ 15.1 m; boss 17.4 m) and px at distance', () => {
  near(catClampDist(38, 390, 30), 15.1, 0.1, 'phone landscape');
  near(catClampDist(38, 390, 26), 17.4, 0.1, 'boss');
  near(pxAt(0.8, 13, 38, 1080), 96, 1.5, '1080p at 13 m: ≈ 96 px');
  near(pxAt(0.8, 12, 38, 390), 37.8, 0.6, '844×390 at 12 m: ≈ 38 px');
  assert.ok(widthFitDist(50, 390 / 844, 9) > 19, 'portrait width fit ≈ 21 m on 390×844');
});

test('iso rig: frames per device (desktop 12.4 m 38°, phone 12 m, portrait 50° / 58°, zoom and clamps)', () => {
  const d = isoFrame({ w: 1280, h: 720, device: 'kbm' });
  assert.equal(d.fov, 38); near(d.dist, I.dist, 1e-9); assert.equal(d.portrait, false);
  const ph = isoFrame({ w: 844, h: 390, device: 'touch' });
  assert.ok(ph.phone); assert.ok(ph.dist <= 12 + 1e-9 && ph.dist > 11.5, `phone ${ph.dist}`);   // 12 m, or the cat clamp just under it
  assert.ok(pxAt(I.catH, ph.dist, ph.fov, 390) >= 30, 'cat ≥ 30 px on a landscape phone');
  const pt = isoFrame({ w: 390, h: 844, device: 'touch' });
  assert.ok(pt.portrait); assert.equal(pt.fov, 50); near(pt.pitch, I.pitchPortrait, 1e-9);
  assert.ok(pxAt(I.catH, pt.dist, pt.fov, 844) >= 28 - 1e-6, 'cat ≥ 28 px in portrait');
  // zoom × [0.7, 1.4], then [9, 18]; the cat clamp beats zoom
  near(isoFrame({ w: 1280, h: 720, zoom: 0.5 }).dist, Math.max(9, I.dist * 0.7), 1e-9);
  near(isoFrame({ w: 1920, h: 1080, zoom: 1.4 }).dist, Math.min(18, I.dist * 1.4), 1e-9);
  assert.ok(isoFrame({ w: 844, h: 390, device: 'touch', zoom: 1.4 }).dist <= catClampDist(38, 390, 30) + 1e-9, 'cat clamp wins');
  // combat extra capped at +3 over 18; boss clamped [14, 22]
  near(isoFrame({ w: 1920, h: 1080, zoom: 1.4, extra: 10 }).dist, 21, 1e-9, 'extra capped at distMax + 3');
  const b = isoFrame({ w: 1920, h: 1080, boss: true, extra: 0 });
  assert.ok(b.dist >= 14 && b.dist <= 22); near(b.pitch, I.pitchBoss, 1e-9);
  assert.deepEqual(deviceClass(390, 844, 'touch'), { portrait: true, phone: true });
});

test('iso rig: position (yaw π = south of her, looking +Z), screen → world dirs, lead caps, fit, crane arc', () => {
  const p = isoPosition({ x: 0, y: 0.6, z: 0 }, Math.PI, isoPitch(13), 13, {});
  assert.ok(p.z < -7 && Math.abs(p.x) < 1e-9 && p.y > 9, 'south and above');
  const w = screenToWorldDir(0, 1, Math.PI, {});
  near(w.x, 0, 1e-9); near(w.z, 1, 1e-9, 'screen up = +Z at yaw π');
  const r = screenToWorldDir(1, 0, Math.PI, {});
  near(r.x, -1, 1e-9, 'screen right = −X at yaw π (the camera looks +Z)');
  const L = isoLead({ x: 20, z: 0 }, { x: 0, z: 40 }, Math.PI, { portrait: true }, {});
  assert.ok(Math.hypot(L.x, L.z) <= I.lead.max + 1e-9, 'lead capped');
  // the KBM cursor lead is symmetric on screen: 4 m down-screen leads like 6 m up-screen (cursorDownMul 1.5)
  const up = isoLead({ x: 0, z: 0 }, { x: 0, z: 6 }, Math.PI, {}, {}), dn = isoLead({ x: 0, z: 0 }, { x: 0, z: -4 }, Math.PI, {}, {});
  near(up.z, 0.9 + FRAME.upBias, 1e-9); near(dn.z, -0.9 + FRAME.upBias, 1e-9, 'down-screen cursor lead scaled');
  // framing: her focus at FRAME.herY of the band above the bottom inset (the ability bar); portrait unchanged
  near(isoFrameOffset(720, 0, false), FRAME.herY - 0.5, 1e-9);
  near(isoFrameOffset(720, 100, false), (FRAME.herY * 620 - 360) / 720, 1e-9, 'bar inset lifts her');
  near(isoFrameOffset(720, 1e4, false), (FRAME.herY * 720 * (1 - FRAME.insetMax) - 360) / 720, 1e-9, 'inset capped');
  near(isoFrameOffset(844, 100, true), I.frameOffsetPortrait, 1e-9);
  near(isoFrame({ w: 1280, h: 720, insetBottom: 100 }).frameOffset, isoFrameOffset(720, 100, false), 1e-9);
  const still = isoLead({ x: 5, z: 5 }, null, Math.PI, { still: true }, {});
  assert.equal(still.x, 0); assert.equal(still.z, 0);
  const need = fitDist([{ x: 0, z: 0 }, { x: 6, z: 0 }], 2, { x: 0, z: 0 }, Math.PI, isoPitch(13), 38, 16 / 9, 0.8, 1.2);
  assert.ok(need > 10 && need < 20, `fit ${need}`);
  const a = { x: 0, y: 10, z: -8 }, b = { x: 3, y: 1.5, z: 2 }, piv = { x: 0, y: 0.8, z: 0 }, o = {};
  for (let k = 0; k <= 1.0001; k += 0.1) { craneArc(a, b, piv, k, o); assert.ok(o.y > 0.5, 'the crane arc never dips into the ground'); }
});

/** A minimal ctx for FollowCamera in iso mode. */
function isoCtx() {
  const ctx = {
    game: { mode: 'play', loop: { timeScale: 1 }, hitstopT: 0, frameCount: 0 }, params: { cam: 'iso' },
    bus: new EventBus(), config, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 600),
    actors: new ActorRegistry(), state: new GameState(), enemies: { list: [], boss: null }, levels: { loading: false },
    physics: { heightAt: () => 0, raycast: () => null },
  };
  ctx.input = new Input(ctx);
  const p = new Actor(ctx, { faction: 'player', height: 1 });
  p.stateName = 'idle'; p.charge = 0; p.onGround = true;
  ctx.player = p; ctx.actors.register(p, 'swordcat');
  return ctx;
}

test('FollowCamera (iso): fixed yaw π, 13 m at 51°, follows her focus; zoom clamps; select emits target:changed', async () => {
  const ctx = isoCtx();
  const cam = new FollowCamera(ctx);
  await cam.init();
  for (let i = 0; i < 3; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  const s = cam.iso();
  near(s.yaw, Math.PI, 1e-9); near(s.dist, I.dist, 1e-6); near(s.pitch, isoPitch(I.dist), 1e-3);
  assert.equal(cam.isIso, true);
  near(ctx.camera.near, I.near, 1e-9); near(ctx.camera.far, I.foot?.farFallback ?? I.far, 1e-9);   // X12: no fog model → the 60 m fallback
  // she walks +Z: the camera follows without turning
  ctx.player.pos.set(0, 0, 10); ctx.player.object3d.position.copy(ctx.player.pos);
  for (let i = 0; i < 120; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  near(cam.yaw, Math.PI, 1e-9, 'never rotates');
  near(cam.focus.z, 10 + FRAME.upBias, 0.15, 'focus = her (+ the screen-up bias, 0 since the framing playtest)');
  assert.equal(cam.zoom(9), I.zoom[1]); assert.equal(cam.zoom(0.1), I.zoom[0]);
  const got = [];
  ctx.bus.on('target:changed', (p) => got.push(p.source));
  const e = new Actor(ctx, { faction: 'enemy', height: 1 }); e.pos.set(1, 0, 11); ctx.actors.register(e);
  assert.equal(cam.select(e, 'click'), e);
  assert.equal(cam.lockTarget, e);
  for (let i = 0; i < 10; i++) { cam.update(1 / 60); cam.render(0, 1 / 60); }
  near(cam.yaw, Math.PI, 1e-9, 'a selection never moves the camera (§7.4)');
  cam.select(null, 'tap');
  assert.deepEqual(got, ['click', 'tap']);
});

// ------------------------------------------------------------------ Nav grid + A* (§5.3)
function gridFrom(sample, size = 20) {
  const g = new NavGrid({ minX: 0, minZ: 0, maxX: size, maxZ: size }, (x, z) => { const s = sample(x, z); top.v = s.top ?? s.h; return s; });
  const top = { v: 0 };
  g.top = new Float32Array(g.size);
  const probe = g.probe.bind(g);
  g.probe = (k) => { if (g.flag[k]) return g.flag[k]; const f = probe(k); g.top[k] = top.v; return f; };
  return g;
}

test('nav: a wall with a gap is walked around; optimal within 5 %; the path is string-pulled', () => {
  const g = gridFrom((x, z) => (z > 9.5 && z < 10.5 && x < 15 ? { h: 0, ok: false, top: 5 } : { h: 0, ok: true }));
  const r = findPath(g, { x: 2, z: 2 }, { x: 2, z: 18 });
  assert.ok(r.ok && !r.partial);
  let len = 0, px = 2, pz = 2;
  for (const q of r.points) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
  const ideal = Math.hypot(15.3 - 2, 9.5 - 2) + 1 + Math.hypot(15.3 - 2, 18 - 10.5);
  assert.ok(len <= ideal * 1.05 + 0.5, `length ${len.toFixed(2)} vs ≈ ${ideal.toFixed(2)}`);
  assert.ok(r.points.length <= 6, `${r.points.length} points (pulled)`);
  assert.ok(r.points.every((q) => !q.link));
});

test('nav: a 1 m fence gets a jump link; a 5 m wall does not; a stream gap ≤ 2 m is jumped', () => {
  const fence = gridFrom((x, z) => (x > 4.6 && x < 5.4 ? { h: 0, ok: false, top: 1.0 } : { h: 0, ok: true }));
  const r = findPath(fence, { x: 2, z: 10 }, { x: 9, z: 10 });
  assert.ok(r.ok && !r.partial && r.points.some((q) => q.link), 'hop over the fence');
  const wall = gridFrom((x, z) => (x > 4.6 && x < 5.4 ? { h: 0, ok: false, top: 5 } : { h: 0, ok: true }));
  const w = findPath(wall, { x: 2, z: 10 }, { x: 9, z: 10 }, { maxExpand: 3000 });
  assert.ok(w.partial, 'an unbroken 5 m wall: partial');
  const stream = gridFrom((x, z) => (x > 4 && x < 5.5 ? { h: -1.5, ok: false, top: -1.5 } : { h: 0, ok: true }));
  const s = findPath(stream, { x: 2, z: 10 }, { x: 9, z: 10 });
  assert.ok(s.ok && !s.partial && s.points.some((q) => q.link), 'the 1.5 m stream is jumped');
});

test('nav: unreachable goals snap within 4 m, else partial; steps ≤ 0.3 m walk, a 0.8 m ledge is a hop', () => {
  const g = gridFrom((x, z) => (Math.hypot(x - 10, z - 10) < 1.5 ? { h: 0, ok: false, top: 3 } : { h: 0, ok: true }));
  const r = findPath(g, { x: 2, z: 2 }, { x: 10, z: 10 });
  assert.ok(r.ok && !r.partial, 'a goal inside a rock snaps to its edge');
  assert.ok(Math.hypot(r.goal.x - 10, r.goal.z - 10) <= 2.2);
  const ledge = gridFrom((x, z) => ({ h: x > 10 ? 0.8 : (x > 6 ? (x - 6) * 0.05 : 0), ok: true }));
  const l = findPath(ledge, { x: 2, z: 5 }, { x: 14, z: 5 });
  assert.ok(l.ok && l.points.some((q) => q.link === 'hop'), 'the 0.6 m step up is a hop link');
  assert.equal(g.nearestWalkable(10, 10, 0.5), -1, 'nothing within 0.5 m of the rock centre');
});

test('nav: invalidate re-samples a region (dynamic colliders)', () => {
  let blocked = false;
  const g = gridFrom((x, z) => (blocked && x > 9 && x < 11 ? { h: 0, ok: false, top: 2 } : { h: 0, ok: true }));
  assert.ok(g.walkableAt(10, 10));
  blocked = true;
  assert.ok(g.walkableAt(10, 10), 'cached');
  g.invalidate(9, 0, 11, 20);
  assert.ok(!g.walkableAt(10, 10), 're-sampled after invalidate');
  g.fill(1000);
  assert.ok(g.filled);
});

// ------------------------------------------------------------------ Aim (§7.1, §7.2, §8.1)
const A = (x, z, o = {}) => ({ pos: { x, z }, radius: 0.3, alive: true, hp: 30, maxHp: 30, ...o });
test('aim resolver precedence: riposte > explicit > cursor > selected > auto > move > facing', () => {
  const out = { dir: { x: 0, z: 0 } };
  const base = { her: { x: 0, z: 0 }, facing: 0, range: 2 };
  const rip = A(3, 0), sel = A(-2, 0), auto = A(0, -2);
  assert.equal(resolveAim('attack', { ...base, riposte: rip, explicit: { x: 0, z: 1 }, cursor: { x: 0, z: 5 } }, out).source, 'riposte');
  assert.equal(resolveAim('dodge', { ...base, riposte: rip, explicit: { x: 0, z: 1 } }, out).source, 'explicit', 'riposte only for attack kinds');
  assert.equal(resolveAim('attack', { ...base, cursor: { x: 0, z: 5 }, selected: sel }, out).source, 'cursor');
  near(out.dir.z, 1, 1e-9);
  assert.equal(resolveAim('attack', { ...base, selected: sel, auto }, out).source, 'selected');
  assert.equal(resolveAim('attack', { ...base, selected: A(-20, 0), auto }, out).source, 'auto', 'a far selection is skipped');
  assert.equal(resolveAim('attack', { ...base, move: { x: 1, z: 0, mag: 1 } }, out).source, 'move');
  assert.equal(resolveAim('attack', base, out).source, 'facing');
});

test('auto-target (§7.2): wind-up on her beats nearer; sticky by 0.75; breakables only when no hostile within 6 m', () => {
  const her = { x: 0, z: 0 };
  const near1 = A(0, 1.5), windup = A(0, 3);
  const info = (a) => ({ windup: a === windup });
  assert.equal(autoTarget(her, 0, [near1, windup], 4.5, info), windup);
  const a = A(0, 2), b = A(0, 1.6);
  assert.equal(autoTarget(her, 0, [a, b], 4.5, null, null, a), a, 'keeps the current one (sticky)');
  const crate = A(0, 1, { breakable: true }), rat = A(0, 4);
  assert.equal(autoTarget(her, 0, [crate, rat], 4.5, null), rat, 'crates wait while a hostile is within 6 m');
  assert.equal(autoTarget(her, 0, [crate], 4.5, null), crate, 'with no hostile near, the crate');
  const m = magnetPick(her, { x: 0, z: 1 }, [A(2, 0), A(0.3, 2)], AIM.kbmCone, 3);
  assert.ok(m && m.pos.z === 2, 'the magnet cone around the aim');
  assert.equal(threatSnap(her, [{ attacker: A(0, 3), activeAt: 10.5 }, { attacker: A(2, 0), activeAt: 10.3 }], 10).pos.x, 2, 'soonest wins');
  assert.equal(threatSnap(her, [{ attacker: A(0, 3), activeAt: 12 }], 10), null, 'beyond 0.7 s: no snap');
  // a bolt: the range is measured to the bolt (`pos`), not the shooter 8 m away, and out.at is the bolt
  const shooter = A(0, 8), out = {};
  assert.equal(threatSnap(her, [{ attacker: shooter, activeAt: 10.4, pos: { x: 1, z: 2 } }], 10, out), shooter, 'snaps to an incoming bolt');
  assert.deepEqual([out.at.x, out.at.z], [1, 2], 'faces the bolt');
  assert.equal(threatSnap(her, [{ attacker: shooter, activeAt: 10.4 }], 10), null, 'the shooter alone is out of range');
  const v = hopSpeed(2.4, 0, config.PLAYER.jumpV, config.GRAVITY, NAV.hopMaxH, config.PLAYER.fallGravityMul);
  assert.ok(v > 2 && v < 5.5, `hop ${v}`);
  assert.equal(hopSpeed(2, 2, config.PLAYER.jumpV, config.GRAVITY, 5.5), null, 'too high');
});

// ------------------------------------------------------------------ touch layout (§9)
test('touch layout: every button ≥ 56 px, ≥ 8 px apart at touchSize 0.8–1.4 in both orientations', () => {
  for (const [w, h] of [[844, 390], [390, 844], [1180, 820]]) {
    for (const ts of [0.8, 1, 1.2, 1.4]) {
      const L = computeLayout(w, h, { touchSize: ts });
      for (const b of Object.values(L.buttons)) assert.ok(b.size >= TOUCH.minBtn - 1e-9, `${w}×${h} ${ts}: size ${b.size}`);
      assert.ok(minGap(L) >= TOUCH.gap - 1e-6, `${w}×${h} ts ${ts}: gap ${minGap(L).toFixed(1)}`);
      for (const b of Object.values(L.buttons)) assert.ok(b.x - b.r >= 0 && b.x + b.r <= w && b.y + b.r <= h, 'inside the viewport');
    }
  }
  const L = computeLayout(844, 390);
  near(L.buttons.attack.x, 844 - 68, 1e-9); near(L.buttons.attack.y, 390 - 68, 1e-9);
  assert.equal(buttonAt(L, 844 - 68, 390 - 68), 'attack');
  assert.ok(inDeadRing(L, 844 - 68 - 48 - 10, 390 - 68 - 30));
  assert.ok(inStickZone(L, 100, 300) && !inStickZone(L, 600, 300));
  const M = computeLayout(844, 390, { leftHanded: true });
  near(M.buttons.attack.x, 68, 1e-9, 'mirrored');
});

test('touch gestures: tap ≤ 250 ms / 12 px (not right after a button), long-press 0.35 s, swipe 48 px in 150 ms', () => {
  assert.equal(classifyGesture({ dt: 0.12, dist: 5, up: true, sinceButton: 2 }), 'tap');
  assert.equal(classifyGesture({ dt: 0.12, dist: 5, up: true, sinceButton: 0.1 }), 'none', 'too soon after a cluster release');
  assert.equal(classifyGesture({ dt: 0.4, dist: 5, up: false, sinceButton: 2 }), 'long');
  assert.equal(classifyGesture({ dt: 0.1, dist: 60, up: false, sinceButton: 2 }), 'swipe');
  assert.equal(classifyGesture({ dt: 0.3, dist: 60, up: true, sinceButton: 2 }), 'none', 'a slow drag is nothing');
  const s = stickVector(0, -60, 60);
  near(s.y, 1, 1e-9); assert.equal(stickVector(1, 1, 60).x, 0, 'dead zone');
  assert.ok(stickVector(200, 0, 60).follow > 0, 'the base follows past 1.6 R');
});

// ------------------------------------------------------------------ touch tutorial (TT2 §10.3): 4 lessons + the Skip chip
test('touch tutorial (TT2 §10.3): the 4 lessons show the touch copy; holding the Skip chip ends practice and rings the bell', async () => {
  const { Tutorial, TUTORIAL_STEPS } = await import('../../src/story/tutorial.js');
  const handlers = new Map(), emitted = [], f = { 'prologue.start': true };
  const bus = { on: (ev, fn) => { (handlers.get(ev) ?? handlers.set(ev, []).get(ev)).push(fn); return () => {}; }, emit: (ev, p) => { emitted.push([ev, p]); for (const fn of handlers.get(ev) ?? []) fn(p); } };
  const pos = { x: 0, z: -70, y: 0, clone() { return { ...this, copy(o) { this.x = o.x; this.z = o.z; return this; } }; }, copy(o) { this.x = o.x; this.z = o.z; return this; } };
  const ctx = {
    bus, emitted,
    state: { getFlag: (k) => f[k], setFlag: (k, v) => { f[k] = v; }, settings: {}, difficulty: 'knight' },
    input: { device: 'touch', preset: 'hybrid', down: () => false },
    cam: { isIso: true },
    game: { mode: 'play' },
    levels: { current: { id: 'meadow', interactables: [], actor: () => null, critter: () => null } },
    companions: { active: [], actors: [] },
    player: { pos, onGround: true, facing: 0 },
    strings: { t: (k) => k, has: () => true },
  };
  let chip = false;
  const story = { isPlaying: false, cinema: { skip() {}, apply() {} }, flag: (k, v) => { f[k] = v; }, toChart() { this.charted = true; }, skipPressed: () => chip };
  const tu = new Tutorial(ctx, story);
  tu.init();
  assert.deepEqual(TUTORIAL_STEPS.map((s) => s.id), ['move', 'bonk', 'stand', 'parry']);
  tu.update(0.05);
  for (let k = 0; k < 8; k++) tu.update(0.05);
  const p = emitted.filter(([e]) => e === 'story:prompt').map(([, x]) => x).at(-1);
  assert.equal(p.textKey, 'tut.move'); assert.equal(p.action, null, 'the move lesson demonstrates on the ground');
  chip = true;                                            // tap-and-hold the Skip chip
  for (let k = 0; k < 25; k++) tu.update(0.05);
  assert.equal(f['prologue.practice'], true, 'practice skipped');
  assert.equal(story.charted, true, 'the bell (CS-01 next, in place)');
  assert.ok(emitted.some(([e, x]) => e === 'ui:toast' && x.key === 'tut.skipped'));
});

test('touch layout: buttons clear her chest where AUTOCAM draws it, up to heroDrop below the rest point (ui:touch-cluster)', async () => {
  const { heroPoint, heroClearR, heroDrop, heroGap } = await import('../../src/ui/touchLayout.js');
  for (const [w, h] of [[844, 390], [932, 430], [390, 844], [667, 375]]) {
    const hero = heroPoint(w, h), cr = heroClearR(w, h), drop = heroDrop(w, h);
    const L = computeLayout(w, h);
    assert.deepEqual(L.dropped, [], `${w}×${h}: every button still fits`);
    for (const dy of [0, drop * 0.5, drop]) {
      const chest = { x: hero.x, y: hero.y + dy };
      for (const [n, b] of Object.entries(L.buttons)) assert.ok(heroGap(b, chest, cr) >= -0.5, `${w}×${h}: ${n} ${heroGap(b, chest, cr).toFixed(1)} px into her disc with her ${dy.toFixed(0)} px low`);
    }
  }
  // the measured case: the camera's rest point (368, 240) and her chest at rest (370, 267) on an 844 × 390 phone
  const L = computeLayout(844, 390, { hero: { x: 368, y: 240 } });
  for (const [n, b] of Object.entries(L.buttons)) assert.ok(heroGap(b, { x: 370, y: 267 }, heroClearR(844, 390)) >= -0.5, `${n} clears her chest`);
});

// ====================================================================================================== TT3 §11.5 K8 rebinding
import { REBIND_ACTIONS, rebindAction, rebindRefusal, shownCode, CONTROL_ROWS } from '../../src/ui/settings.js';
import { cleanBindings } from '../../src/save/SaveManager.js';

test('TT3 rebind model: the shown code is replaced, a conflict swaps, peek drags ranges along, Esc stays on pause', () => {
  const table = JSON.parse(JSON.stringify(config.INPUT.keys));
  assert.equal(REBIND_ACTIONS.length, 13);
  for (const a of REBIND_ACTIONS) assert.ok(CONTROL_ROWS.some(([r]) => r === a), `card row ${a}`);
  // Stand: RMB (shown) → N; Q and L stay
  let r = rebindAction(table, null, 'guard', 'KeyN');
  assert.deepEqual(r.bindings.guard, ['KeyN', 'KeyQ', 'KeyL']);
  assert.deepEqual(r.swapped, []);
  // jump → F: F was the Paw Trick, which now takes Space (a swap)
  r = rebindAction(table, null, 'jump', 'KeyF');
  assert.deepEqual(r.bindings.jump, ['KeyF']);
  assert.deepEqual(r.bindings.trick, ['Space']);
  assert.deepEqual(r.swapped, ['trick']);
  // ability → Q: Q leaves the Stand; the Stand gets G (the replaced key) in its place
  r = rebindAction(table, { milk: ['KeyR'] }, 'ability', 'KeyQ');
  assert.deepEqual(r.bindings.ability, ['KeyQ']);
  assert.deepEqual(r.bindings.guard, ['Mouse2', 'KeyG', 'KeyL']);
  assert.deepEqual(r.bindings.milk, ['KeyR'], 'earlier bindings are kept');
  // peek → B: ranges follow (one hold)
  r = rebindAction(table, null, 'peek', 'KeyB');
  assert.deepEqual(r.bindings.peek, ['KeyB', 'Mouse1']);
  assert.deepEqual(r.bindings.ranges, ['KeyB', 'Mouse1']);
  // pause → O: Esc is never the replaced one
  assert.equal(shownCode('pause', table.pause), 'KeyP');
  r = rebindAction(table, null, 'pause', 'KeyO');
  assert.deepEqual(r.bindings.pause, ['KeyO', 'Escape']);
  // a key that only menus use (W = navUp) is never swapped into
  r = rebindAction(table, null, 'attack', 'KeyJ');
  assert.ok(!('navUp' in r.bindings));
});

test('TT3 rebind model: Ctrl, Alt, Meta, F-keys and Esc are refused; walking keys too while WASD walks', () => {
  for (const c of ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'F1', 'F5', 'F12', 'Escape', '', null]) assert.equal(rebindRefusal(c), 'browser', String(c));
  for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp']) assert.equal(rebindRefusal(c), 'walk', c);
  assert.equal(rebindRefusal('KeyW', { wasd: false }), null, 'moba does not walk on WASD');
  for (const c of ['KeyF', 'KeyN', 'Space', 'Mouse2', 'Mouse4', 'Digit4', 'Tab', 'ShiftLeft']) assert.equal(rebindRefusal(c), null, c);
});

test('TT3 cleanBindings drops modifier and F-key codes from a save', () => {
  const out = cleanBindings({ jump: ['ControlLeft', 'KeyN', 'AltLeft', 'F1', 'MetaLeft'], guard: ['Mouse2', 'KeyQ'], 'bad key!': ['KeyX'], trick: 'KeyF' });
  assert.deepEqual(out, { jump: ['KeyN'], guard: ['Mouse2', 'KeyQ'] });
});

test('TT3 Input + rebinding: a rebound Stand drives `guard`; the old key no longer does', () => {
  const st = { settings: { controlPreset: 'hybrid', bindings: {} } };
  const inp = new Input({ state: st, params: {}, bus: { emit() {}, on: () => () => {} } });
  const r = rebindAction(inp.keyTable, st.settings.bindings, 'guard', 'KeyN');
  st.settings.bindings = r.bindings; inp.rebind();
  const key = (code) => ({ code, repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {} });
  inp._keyDown(key('KeyN'));
  assert.ok(inp.pressed('guard') && inp.down('guard'));
  inp._keyUp(key('KeyN')); inp.endStep();
  assert.ok(!(inp._bind.get('Mouse2') ?? []).includes('guard'), 'RMB was the shown code: replaced');
  inp._keyDown(key('KeyQ'));
  assert.ok(inp.down('guard'), 'Q still stands');
});
