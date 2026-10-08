// tests/unit/physics.test.js  (owner: physics) — Heightfield, StaticColliders, MeshCollider and Physics.moveActor:
// exact terrain, no tunnelling, step-up, slopes, ground snap, architecture (Octree), separation, rays, water, bounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Heightfield } from '../../src/physics/Heightfield.js';
import { StaticColliders } from '../../src/physics/StaticColliders.js';
import { MeshCollider, _internal } from '../../src/physics/MeshCollider.js';
import { Physics, PHYSICS_DEFAULTS } from '../../src/physics/Physics.js';
import * as config from '../../src/core/config.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';

const { PLAYER, GRAVITY } = config;

/** Core services physics reads (config, actors, scene); physics-only, so other areas' work in progress can't break it. */
const fakeCtx = () => ({ config, actors: new ActorRegistry(), scene: new THREE.Scene(), bus: null, game: { mode: 'play' } });

const DT = 1 / 60;
let nextId = 1;

/** Minimal duck-typed actor (the Actor fields physics reads). */
function actor(x, y, z, o = {}) {
  return { id: nextId++, pos: new THREE.Vector3(x, y, z), prevPos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(),
    radius: PLAYER.radius, height: PLAYER.height, mass: 1, onGround: false, alive: true, faction: 'player', ...o };
}

function world({ hf = null, colliders = null, meshes = [], bounds = null, water, isDeepWater } = {}) {
  const ctx = fakeCtx();
  const ph = new Physics(ctx);
  ctx.physics = ph;
  const level = { heightfield: hf, colliders, octreeMeshes: meshes, bounds, root: new THREE.Group() };
  if (water) level.water = water;
  if (isDeepWater) level.isDeepWater = isDeepWater;
  ph.setLevel(level);
  return { ctx, ph, level };
}

const flat = (y = 0, size = 64, res = 32) => Heightfield.fromFunction(size, res, () => y);

/** Step `a` for `sec`; `ctl(a, i)` sets the horizontal velocity each step like an actor's update would. */
function run(ph, a, sec, ctl = null, onStep = null) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) {
    a.prevPos.copy(a.pos);
    if (ctl) ctl(a, i);
    ph.moveActor(a, DT);
    if (onStep) onStep(a, i);
  }
  return a;
}
const walk = (vx, vz) => (a) => { a.vel.x = vx; a.vel.z = vz; };

function boxMesh(w, h, d, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ side: opts.side ?? THREE.FrontSide }));
  m.position.set(x, y, z);
  if (opts.rotX) m.rotation.x = opts.rotX;
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotZ) m.rotation.z = opts.rotZ;
  Object.assign(m.userData, opts.userData ?? {});
  return m;
}

/** Stairs climbing +Z from z0: `n` steps of `rise` × `tread`, 3 m wide, centred on x. */
function stairs(n, rise, tread, x = 0, z0 = 2) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(boxMesh(3, rise * (i + 1), tread, x, rise * (i + 1) / 2, z0 + tread * (i + 0.5)));
  g.add(boxMesh(3, rise * n, 4, x, rise * n / 2, z0 + tread * n + 2));                   // landing
  return g;
}

/** A ramp rising along +Z at `deg` degrees, starting at z0 (thick slab rotated about X), with a landing on top. */
function ramp(deg, length, z0 = 2) {
  const a = deg * Math.PI / 180, g = new THREE.Group();
  const slab = boxMesh(3, 0.4, length, 0, 0, 0);
  // rotate so the top surface rises toward +Z; place the slab's top-front edge at (z0, y=0)
  slab.rotation.x = -a;
  const cy = Math.sin(a) * length / 2 - Math.cos(a) * 0.2, cz = z0 + Math.cos(a) * length / 2 + Math.sin(a) * 0.2;
  slab.position.set(0, cy, cz);
  g.add(slab);
  return { group: g, top: Math.sin(a) * length, end: z0 + Math.cos(a) * length };
}

// ------------------------------------------------------------------ Heightfield
test('Heightfield.heightAt is exact on the rendered triangles (toGeometry)', () => {
  const hf = Heightfield.fromFunction(40, 16, (x, z) => Math.sin(x * 0.4) * 2 + Math.cos(z * 0.3) * 1.5 + x * 0.05);
  const mesh = new THREE.Mesh(hf.toGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 300; i++) {
    const x = (rng() - 0.5) * 39, z = (rng() - 0.5) * 39;
    rc.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
    const hit = rc.intersectObject(mesh)[0];
    assert.ok(hit, 'ray hits terrain mesh');
    assert.ok(Math.abs(hit.point.y - hf.heightAt(x, z)) < 1e-4, `heightAt(${x.toFixed(2)}, ${z.toFixed(2)}) ${hf.heightAt(x, z)} vs mesh ${hit.point.y}`);
  }
  // off-grid positions clamp to the border, NaN is safe
  assert.equal(hf.heightAt(1000, 0), hf.heightAt(20, 0));
  assert.ok(Number.isFinite(hf.heightAt(NaN, 3)));
  // normals point up and tilt away from the slope
  const n = hf.normalAt(0, 0, new THREE.Vector3());
  assert.ok(n.y > 0 && Math.abs(n.length() - 1) < 1e-6);
  const fn = hf.faceNormalAt(0.3, 0.2, new THREE.Vector3());
  assert.ok(fn.y > 0 && Math.abs(fn.length() - 1) < 1e-6);
});

test('Heightfield.raycast matches a ray vs the render mesh (DDA, exact)', () => {
  const hf = Heightfield.fromFunction(60, 30, (x, z) => Math.sin(x * 0.25) * 3 + Math.cos(z * 0.2 + 1) * 2);
  const mesh = new THREE.Mesh(hf.toGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  let s = 3; const rng = () => (s = (s * 48271) % 2147483647) / 2147483647;
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    const o = new THREE.Vector3((rng() - 0.5) * 50, 6 + rng() * 8, (rng() - 0.5) * 50);
    const d = new THREE.Vector3(rng() - 0.5, -rng() * 0.8 - 0.05, rng() - 0.5).normalize();
    rc.set(o, d); rc.far = 40;
    const ref = rc.intersectObject(mesh)[0];
    const t = hf.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 40);
    const inGrid = (p) => Math.abs(p.x) < 30 && Math.abs(p.z) < 30;
    if (ref && inGrid(ref.point)) { hits++; assert.ok(Math.abs(t - ref.distance) < 1e-3, `ray ${i}: ${t} vs ${ref.distance}`); }
    else if (!ref) assert.equal(t, -1, `ray ${i}: false hit at ${t}`);
  }
  assert.ok(hits > 200, `enough hits (${hits})`);
  assert.equal(hf.raycast(0, -50, 0, 0, 1, 0, 10), 0, 'origin under the ground → 0');
  assert.equal(hf.raycast(0, 50, 0, 0, 1, 0, 10), -1, 'pointing up → miss');
});

// ------------------------------------------------------------------ gravity, landing, ground snap, slopes
test('falls under GRAVITY, lands with landImpact, then rests', () => {
  const { ph } = world({ hf: flat(1) });
  const a = actor(0, 6, 0);
  let landedAt = -1, impact = 0;
  run(ph, a, 2, null, (x, i) => { if (x.landImpact > 0 && landedAt < 0) { landedAt = i; impact = x.landImpact; } });
  assert.ok(a.onGround && Math.abs(a.pos.y - 1) < 1e-9, `rests on y 1 (y ${a.pos.y})`);
  assert.equal(a.vel.y, 0);
  assert.equal(a.groundKind, 'terrain');
  const expectV = Math.min(Math.sqrt(2 * GRAVITY * 5), PLAYER.terminalFall);
  assert.ok(Math.abs(impact - expectV) < 1.0, `impact ${impact.toFixed(2)} ≈ ${expectV.toFixed(2)}`);
  assert.equal(a.landImpact, 0, 'landImpact is per step');
  // terminal fall is respected (actor override, else PLAYER.terminalFall), and gravityMul scales the fall
  const b = actor(0, 200, 0); b.terminalFall = 9;
  let minVy = 0;
  run(ph, b, 2, null, (x) => { minVy = Math.min(minVy, x.vel.y); });
  assert.ok(minVy >= -9 - 1e-9 && Math.abs(b.vel.y + 9) < 1e-9 && !b.onGround, `actor terminalFall (vy ${b.vel.y})`);
  const c = actor(0, 200, 0);
  run(ph, c, 2.0);
  assert.ok(Math.abs(c.vel.y + PLAYER.terminalFall) < 1e-9, `config terminalFall (vy ${c.vel.y})`);
  const heavy = actor(0, 200, 0, { gravityMul: 1.35 }), light = actor(0, 200, 0);
  run(ph, heavy, 0.25); run(ph, light, 0.25);
  assert.ok(Math.abs(heavy.vel.y / light.vel.y - 1.35) < 1e-9, 'gravityMul (player fall gravity ×1.35)');
});

test('jumping leaves the ground; apex is exactly v²/2g (constant-acceleration integration)', () => {
  const { ph } = world({ hf: flat(0) });
  for (const [v0, name] of [[PLAYER.jumpV, 'jump 1.245 m'], [PLAYER.mushroomBounceV, 'mushroom ≈ 1.8 m']]) {
    const a = actor(0, 0, 0);
    a.vel.y = v0; a.onGround = false;
    let apex = 0, steps = 0;
    run(ph, a, 1.6, null, (x) => { apex = Math.max(apex, x.pos.y); if (!x.onGround) steps++; });
    const want = v0 ** 2 / (2 * GRAVITY);
    assert.ok(Math.abs(apex - want) < 0.005, `${name}: apex ${apex.toFixed(4)} vs ${want.toFixed(4)}`);
    assert.ok(Math.abs(steps / 60 - (2 * v0) / GRAVITY) < 2 / 60, `${name}: airtime ${(steps / 60).toFixed(3)} s`);
    assert.ok(a.onGround && a.pos.y === 0);
  }
});

test('ground snap keeps a runner grounded down a walkable slope; steep terrain cannot be climbed and slides', () => {
  // gentle: 25° (normal.y 0.906)
  const k = Math.tan(25 * Math.PI / 180);
  const { ph } = world({ hf: Heightfield.fromFunction(80, 80, (x) => -x * k) });
  const a = actor(-20, 20 * k, 0); a.onGround = true;
  let air = 0;
  run(ph, a, 3, walk(PLAYER.zoomies, 0), (x) => { if (!x.onGround) air++; });
  assert.equal(air, 0, 'never airborne running downhill at zoomies speed');
  assert.ok(Math.abs(a.pos.y - ph.heightAt(a.pos.x, a.pos.z)) < 1e-6);

  // steep wall of terrain: 60° rising toward +x from x = 0
  const k2 = Math.tan(60 * Math.PI / 180);
  const w2 = world({ hf: Heightfield.fromFunction(80, 160, (x) => (x > 0 ? x * k2 : 0)) });
  const b = actor(-3, 0, 0); b.onGround = true;
  run(w2.ph, b, 3, walk(PLAYER.run, 0));
  assert.ok(b.pos.y < 0.01, `did not climb the 60° slope (y ${b.pos.y.toFixed(3)})`);
  assert.ok(b.pos.x <= -b.radius + 0.1, `held at the foot without the body clipping into it (x ${b.pos.x.toFixed(3)})`);
  // capsule vs heightfield on a coarse grid (2 m cells: the smoothed normal alone would let her creep up), and
  // running at it diagonally slides along its foot
  const w3 = world({ hf: Heightfield.fromFunction(80, 40, (x) => (x > 0 ? x * k2 : 0)) });
  const b2 = actor(-3, 0, 0); b2.onGround = true;
  run(w3.ph, b2, 3, walk(PLAYER.run, 0));
  assert.ok(b2.pos.y < 0.01 && b2.pos.x <= -b2.radius + 0.1, `coarse grid: held at the foot (x ${b2.pos.x.toFixed(3)}, y ${b2.pos.y.toFixed(3)})`);
  const b3 = actor(-3, 0, 0); b3.onGround = true;
  run(w3.ph, b3, 2, walk(4, 4));
  assert.ok(b3.pos.y < 0.01 && b3.pos.x <= 0 && b3.pos.z > 7, `slides along the foot (x ${b3.pos.x.toFixed(2)}, z ${b3.pos.z.toFixed(2)})`);

  // dropped onto the steep face: slides down (x decreases), never rests on it
  const c = actor(3, 3 * k2 + 0.5, 0);
  run(w2.ph, c, 2);
  assert.ok(c.pos.x < 0.5, `slid down (x ${c.pos.x.toFixed(2)})`);
  assert.ok(c.onGround, 'lands at the foot');
});

test('cliff banks: no bunny-hopping up the smoothed foot; steering into a bank still slides down it', () => {
  for (const deg of [50, 60, 75]) for (const res of [80, 40]) {                  // 1 m and 2 m cells
    const k = Math.tan(deg * Math.PI / 180);
    const { ph } = world({ hf: Heightfield.fromFunction(80, res, (x) => Math.max(0, x + 6) * k) });
    // run at it and jump every time she touches ground: never higher than one jump
    const j = actor(-10, 0, 0); let maxY = 0;
    run(ph, j, 5, (x) => { x.vel.x = PLAYER.run; x.vel.z = 0; if (x.onGround) { x.vel.y = PLAYER.jumpV; x.onGround = false; } },
      (x) => { maxY = Math.max(maxY, x.pos.y); });
    assert.ok(maxY < PLAYER.jumpV ** 2 / (2 * GRAVITY) + 0.02, `${deg}° (${80 / res} m cells): climbed to ${maxY.toFixed(2)} m by hopping`);
    // dropped high on the bank while a controller sets its velocity straight into it every step: slides to the foot
    const s = actor(-2, 4 * k, 0);
    let slid = 0;
    run(ph, s, 4, (x) => { x.vel.x = PLAYER.run; x.vel.z = 0; }, (x) => { if (x.sliding) { slid++; assert.ok(!x.onGround && x.slideSpeed > 0); } });
    assert.ok(slid > 5 && s.onGround && s.pos.y < 0.01 && s.pos.x <= -6 + 1e-6, `${deg}° (${80 / res} m cells): ended at x ${s.pos.x.toFixed(2)} y ${s.pos.y.toFixed(2)}`);
    assert.equal(s.slideSpeed, 0, 'slideSpeed resets on the ground');
  }
  // a lone steepish triangle (normal.y 0.65..0.7) on walkable ground is no trap: the smoothed slope decides there
  const { ph } = world({ hf: Heightfield.fromFunction(20, 20, (x, z) => (x === 1 && z === 0 ? 0.78 : 0)) });
  const tri = ph.heightfield.faceNormalAt(0.8, -0.1, new THREE.Vector3()).y;
  assert.ok(tri < PHYSICS_DEFAULTS.walkableNormalY && tri > PHYSICS_DEFAULTS.walkableNormalY - PHYSICS_DEFAULTS.steepFaceTol, `setup: triangle ${tri.toFixed(3)}`);
  assert.equal(ph._terrainSteep(0.8, -0.1), false);
  const w = actor(0.8, 0.5, -0.1); run(ph, w, 0.5);
  assert.ok(w.onGround && !w.sliding, 'stands on it');
});

test('without a level: flat ground at 0; flying ignores gravity but stays above ground; noClip integrates only', () => {
  const ctx = fakeCtx();
  const ph = new Physics(ctx);
  const a = actor(0, 3, 0);
  run(ph, a, 2);
  assert.ok(a.onGround && Math.abs(a.pos.y) < 1e-9);
  const { ph: p2 } = world({ hf: flat(2) });
  const f = actor(0, 5, 0, { flying: true });
  run(p2, f, 1);
  assert.equal(f.pos.y, 5, 'hovers');
  f.vel.y = -10; run(p2, f, 1);
  assert.ok(f.pos.y >= 2 && !f.onGround, 'never below ground');
  const g = actor(0, 1, 0, { noClip: true }); g.vel.set(0, -5, 0);
  run(p2, g, 1);
  assert.ok(g.pos.y < -3.9, 'noClip passes through');
});

// ------------------------------------------------------------------ static props
test('StaticColliders: hash queries, circle / box / yawed box / segment push-out, rings keep sides', () => {
  const st = new StaticColliders();
  const c = st.add({ x: 0, z: 0, r: 1 });
  const b = st.add({ minX: 10, maxX: 12, minZ: -1, maxZ: 1 });
  const ob = st.add({ x: 20, z: 0, hx: 2, hz: 0.25, yaw: Math.PI / 2 });     // long along world Z after the yaw
  const seg = st.add({ ax: 30, az: -5, bx: 30, bz: 5, r: 0.1 });
  const ring = st.add({ x: 50, z: 0, r: 10, kind: 'ring' });
  assert.equal(st.count, 5);
  assert.deepEqual(st.query(-0.5, -0.5, 0.5, 0.5).map((r) => r.src), [c]);
  assert.equal(st.query(100, 100, 101, 101).length, 0);

  const a = actor(0.5, 0, 0.2); a.vel.set(-3, 0, 0);
  st.resolve(a, 0, 0.3);
  const dist = Math.hypot(a.pos.x, a.pos.z);
  assert.ok(dist >= 1 + a.radius - 1e-9 && st.wall);
  assert.ok((a.vel.x * a.pos.x + a.vel.z * a.pos.z) / dist >= -1e-9, 'inward velocity removed');
  assert.ok(Math.abs(a.vel.x * -a.pos.z + a.vel.z * a.pos.x) > 0.1, 'tangential velocity kept (slides around)');

  const a2 = actor(11, 0, 0.9);                                                // centre inside the box: shallowest face
  st.resolve(a2, 0, 0.3);
  assert.ok(Math.abs(a2.pos.z - (1 + a2.radius)) < 1e-9, `box exit +z (${a2.pos.z})`);

  const a3 = actor(20.3, 0, 1.5);                                              // yawed box: half extents 0.25 in x, 2 in z
  st.resolve(a3, 0, 0.3);
  assert.ok(a3.pos.x >= 20.25 + a3.radius - 1e-6, `yawed box pushes along x (${a3.pos.x})`);

  const a4 = actor(30.2, 0, 0);
  st.resolve(a4, 0, 0.3);
  assert.ok(a4.pos.x >= 30.1 + a4.radius - 1e-6, 'segment wall');

  const inside = actor(59.8, 0, 0), outside = actor(60.2, 0, 0);
  st.resolve(inside, 0, 0.3); st.resolve(outside, 0, 0.3);
  assert.ok(inside.pos.x < 60 - inside.radius && outside.pos.x > 60 + outside.radius, 'ring keeps each on its side');

  assert.equal(st.overlaps(0.9, 0, 0), c);
  assert.equal(st.overlaps(5, 5, 0.3), null);
  assert.ok(st.remove(c) && !st.has(c) && st.overlaps(0.9, 0, 0) === null);
  st.update(b);
  assert.equal(st.count, 4);
  assert.ok(ob && seg && ring);
});

test('props: no tunnelling at 60 m/s through a 10 cm wall; step onto 0.25 m crate; 0.45 m blocks; jump onto 1 m bale', () => {
  const wall = { minX: 4.95, maxX: 5.05, minZ: -5, maxZ: 5, y0: -1, y1: 3 };
  const crate = { minX: -1, maxX: 1, minZ: 4, maxZ: 6, y0: -1, y1: 0.25 };
  const tall = { minX: -1, maxX: 1, minZ: -6, maxZ: -4, y0: -1, y1: 0.45 };
  const bale = { x: -6, z: 0, r: 0.8, y0: -1, y1: 1.0 };
  const { ph } = world({ hf: flat(0), colliders: { circles: [bale], boxes: [wall, crate, tall] } });

  for (const speed of [5.5, 20, 60]) {
    const a = actor(0, 0, 0); a.onGround = true;
    run(ph, a, 1, walk(speed, 0));
    assert.ok(a.pos.x <= 4.95 - a.radius + 1e-6, `${speed} m/s: stopped at the wall (x ${a.pos.x.toFixed(3)})`);
    assert.ok(a.wallHit);
  }
  const s = actor(0, 0, 2); s.onGround = true;
  let stepY = 0;
  run(ph, s, 0.6, walk(0, PLAYER.run), (x) => { stepY += x.stepY; });           // z 2 → 5.3: on top of the crate
  assert.ok(Math.abs(s.pos.y - 0.25) < 1e-9 && s.onGround && s.groundKind === 'static', `stepped up onto the crate (y ${s.pos.y})`);
  assert.ok(s.groundObject === crate && Math.abs(stepY - 0.25) < 1e-9, `stepY reports the 0.25 m step (${stepY})`);
  run(ph, s, 1.5, walk(0, PLAYER.run));                                        // walks off the far side
  assert.ok(s.pos.z > 6.3 && Math.abs(s.pos.y) < 1e-9 && s.onGround, 'steps back down');

  const t = actor(0, 0, -2); t.onGround = true;
  run(ph, t, 1.5, walk(0, -PLAYER.run));
  assert.ok(t.pos.z >= -4 + t.radius - 1e-6 && t.pos.y === 0, `0.45 m blocks (z ${t.pos.z})`);

  const j = actor(-4.5, 0, 0); j.onGround = true;                               // the bale's side is at x -5.2
  j.vel.y = PLAYER.jumpV; j.onGround = false;
  run(ph, j, 1.2, (x) => { x.vel.x = x.pos.x > -6 ? -3 : 0; });
  assert.ok(Math.abs(j.pos.y - 1) < 1e-9 && j.onGround, `landed on the bale top (y ${j.pos.y.toFixed(3)})`);
});

test('props: a gap narrower than the actor (post beside a crate) is never squeezed into', () => {
  // the meadow layout that wedged the smoke soak: a fence post 0.6 m from a yawed crate (gap < 0.64 m)
  const post = { x: 0, z: 0, r: 0.15, y0: -1, y1: 2 };
  const crate = { x: -0.213, z: -1.089, hx: 0.342, hz: 0.342, yaw: -0.142, y0: -1, y1: 0.62 };
  const { ph } = world({ hf: flat(0), colliders: { circles: [post], boxes: [crate] } });
  let inside = 0, where = '';
  for (let k = 0; k < 8; k++) {
    const an = (k / 8) * Math.PI * 2, a = actor(Math.sin(an) * 3, 0, -0.45 + Math.cos(an) * 3); a.onGround = true;
    run(ph, a, 4, (x, i) => {                                              // steer into the gap, weaving
      const dx = -x.pos.x, dz = -0.45 - x.pos.z, l = Math.hypot(dx, dz) || 1, w = Math.sin(i * 0.05 + k) * 0.6;
      x.vel.x = (dx / l + Math.cos(i * 0.03 + k) * w) * PLAYER.run; x.vel.z = (dz / l + Math.sin(i * 0.03 + k) * w) * PLAYER.run;
    }, (x) => {
      if (ph.statics.overlaps(x.pos.x, x.pos.z, x.radius - 0.02, 0.31, 0.95, null, true)) { inside++; where ||= `${x.pos.x.toFixed(3)}, ${x.pos.z.toFixed(3)}`; }
    });
    assert.ok(Number.isFinite(a.pos.x + a.pos.z) && a.pos.y === 0);
  }
  assert.equal(inside, 0, `${inside} steps squeezed > 2 cm into the post or crate (first at ${where})`);
});

test('props: factions filter, bounce pads, dynamic add/remove through Physics', () => {
  const fog = { x: 0, z: 0, r: 5, kind: 'ring', factions: ['player'] };
  const pad = { x: 10, z: 0, r: 1, y0: -1, y1: 0.2, bounce: PLAYER.mushroomBounceV };
  const { ph } = world({ hf: flat(0), colliders: { circles: [pad], rings: [fog] } });
  const p = actor(0, 0, 0); p.onGround = true;
  run(ph, p, 2, walk(PLAYER.run, 0));
  assert.ok(p.pos.x <= 5 - p.radius, 'player held inside the fog wall');
  const e = actor(0, 0, 0, { faction: 'enemy' }); e.onGround = true;
  run(ph, e, 2, walk(PLAYER.run, 0));
  assert.ok(e.pos.x > 6, 'enemy passes (filter)');

  const b = actor(10, 2, 0);
  let bounced = 0;
  run(ph, b, 0.6, null, (x) => { if (x.bounced) bounced = x.bounced; });
  assert.equal(bounced, PLAYER.mushroomBounceV, 'bounce pad');

  const door = ph.addCollider({ minX: 20, maxX: 21, minZ: -3, maxZ: 3, y0: -1, y1: 4 });
  const d = actor(18, 0, 0); d.onGround = true;
  run(ph, d, 1, walk(PLAYER.run, 0));
  assert.ok(d.pos.x <= 20 - d.radius + 1e-6, 'door blocks');
  ph.removeCollider(door);
  run(ph, d, 1, walk(PLAYER.run, 0));
  assert.ok(d.pos.x > 21, 'open door passes');
  assert.ok(ph.blockedAt(10, 0, 0.1) === pad && ph.blockedAt(30, 0, 0.1) === null);
});

// ------------------------------------------------------------------ architecture (Octree)
test('MeshCollider internals: closest points and capsule contact', () => {
  const { closestPtPointTri, closestSegSeg, capsuleTri } = _internal;
  const mc = new MeshCollider();
  const t = mc._addTri(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), false, 0, null);   // faces +y
  assert.ok(t.ny > 0.99, 'winding gives +y');
  assert.ok(Math.abs(closestPtPointTri(0.2, 1, 0.2, t) - 1) < 1e-12);
  assert.ok(Math.abs(closestPtPointTri(-1, 0, -1, t) - 2) < 1e-12);
  assert.ok(Math.abs(closestSegSeg(0, 0, 0, 1, 0, 0, 0.5, 1, -1, 0.5, 1, 1) - 1) < 1e-12);
  const d = capsuleTri(t, 0.2, 0.3, 0.2, 0.2, 0.7, 0.2, 0.32);
  assert.ok(Math.abs(d - 0.3) < 1e-9 && _internal.contactNormal[1] > 0.99, 'capsule above the face');
  assert.equal(capsuleTri(t, 0.2, -0.5, 0.2, 0.2, -0.1, 0.2, 0.32), Infinity, 'one-sided: behind is ignored');
});

test('architecture: walls stop at any speed; ceilings stop jumps; thin floors catch terminal falls', () => {
  const wallM = boxMesh(8, 4, 0.1, 0, 2, 5);
  const ceil = boxMesh(4, 0.2, 4, -10, 1.7, 0);
  const floor = boxMesh(4, 0.05, 4, 10, 3, 0);
  const g = new THREE.Group(); g.add(wallM, ceil, floor);
  const { ph } = world({ hf: flat(0), meshes: [g] });
  assert.ok(ph.octree && ph.mesh.triangles.length === 36);
  for (const speed of [5.5, 30, 80]) {
    const a = actor(0, 0, 0); a.onGround = true;
    run(ph, a, 1, walk(0, speed));
    assert.ok(a.pos.z <= 4.95 - a.radius + 0.02, `${speed} m/s: blocked by the 10 cm wall (z ${a.pos.z.toFixed(3)})`);
    assert.ok(a.pos.y < 0.01, 'did not climb the wall');
  }
  const j = actor(-10, 0, 0); j.onGround = true; j.vel.y = PLAYER.jumpV; j.onGround = false;
  let maxY = 0, hitCeil = false;
  run(ph, j, 1, null, (x) => { maxY = Math.max(maxY, x.pos.y); hitCeil ||= x.ceilingHit; });
  assert.ok(hitCeil && maxY + j.height <= 1.6 + 0.02, `head stopped by the ceiling (top ${(maxY + j.height).toFixed(3)})`);
  const f = actor(10, 40, 0); f.terminalFall = 30;
  run(ph, f, 3);
  assert.ok(Math.abs(f.pos.y - 3.025) < 0.01 && f.onGround && f.groundKind === 'mesh', `caught by the 5 cm floor (y ${f.pos.y.toFixed(3)})`);
});

test('architecture: ramps ≤ 45° climb, 55° does not; stairs with 0.25 m rise climb, 0.45 m rise block', () => {
  for (const [deg, ok] of [[20, true], [35, true], [55, false]]) {
    const r = ramp(deg, 6);
    const { ph } = world({ hf: flat(0), meshes: [r.group] });
    const a = actor(0, 0, 0); a.onGround = true;
    let air = 0;
    // run up to just short of the ramp's top edge, then stop
    run(ph, a, 4, (x) => { x.vel.z = x.pos.z < r.end - 0.4 ? PLAYER.run : 0; }, (x) => { if (!x.onGround) air++; });
    if (ok) {
      const want = (r.end - 0.4 - 2) * Math.tan(deg * Math.PI / 180);
      assert.ok(Math.abs(a.pos.y - want) < 0.15 && a.onGround && a.groundKind === 'mesh', `${deg}° ramp climbed (y ${a.pos.y.toFixed(2)}, want ≈ ${want.toFixed(2)})`);
      assert.ok(air < 4, `${deg}° ramp: grounded all the way (${air} airborne steps)`);
      run(ph, a, 2);                                                               // standing still on the ramp: no creep
      assert.ok(Math.abs(a.pos.y - want) < 0.15 && Math.abs(a.pos.z - (r.end - 0.4)) < 0.15, `${deg}° ramp: rests without sliding`);
    } else assert.ok(a.pos.y < 0.6, `${deg}° ramp not climbed (y ${a.pos.y.toFixed(2)})`);
  }
  {
    const { ph } = world({ hf: flat(0), meshes: [stairs(6, 0.25, 0.4)] });   // steps z 2..4.4, landing to 8.4
    const a = actor(0, 0, 0); a.onGround = true;
    let stepped = 0;
    run(ph, a, 3, (x) => { x.vel.z = x.pos.z < 6 ? PLAYER.run : 0; }, (x) => { stepped += x.stepY; });
    assert.ok(Math.abs(a.pos.y - 1.5) < 0.02 && a.onGround && a.pos.z > 5.5, `climbed 0.25 m stairs (y ${a.pos.y.toFixed(3)}, z ${a.pos.z.toFixed(2)})`);
    assert.ok(stepped > 0.5, `step-ups reported in stepY (${stepped.toFixed(2)})`);
    // and back down (walking and running) without ever leaving the ground or sinking into a step
    for (const speed of [PLAYER.walk, PLAYER.run]) {
      if (speed === PLAYER.run) { a.pos.set(0, 1.5, 5.5); a.onGround = true; }
      let air = 0, sunk = 0;
      run(ph, a, 4, (x) => { x.vel.z = x.pos.z > 0 ? -speed : 0; }, (x) => {
        if (!x.onGround) air++;
        if (ph.mesh.penetrates(x.pos.x, x.pos.y, x.pos.z, x.radius, x.height, 0.03)) sunk++;
      });
      assert.ok(Math.abs(a.pos.y) < 0.02, `walked back down at ${speed} m/s (y ${a.pos.y.toFixed(3)})`);
      assert.equal(air, 0, `grounded all the way down at ${speed} m/s`);
      assert.equal(sunk, 0, 'never inside a step');
    }
  }
  {
    // ledges: a platform 2 m up — standing with the centre past the edge slips off and falls; 0.25 m up — steps down
    const g = new THREE.Group();
    g.add(boxMesh(4, 2, 4, 0, 1, 10), boxMesh(4, 0.25, 4, 10, 0.125, 10));
    const { ph } = world({ hf: flat(0), meshes: [g] });
    // the rim holds her while the contact is walkable (centre ≤ r·0.71 past the edge); further out she slips off
    const ok = actor(0, 2, 12.15); ok.onGround = true;
    run(ph, ok, 0.5);
    assert.ok(ok.onGround && ok.pos.y > 1.9, `rests on the rim (y ${ok.pos.y.toFixed(2)})`);
    const hi = actor(0, 2, 12.28); hi.onGround = true;
    let fell = false;
    run(ph, hi, 1.5, null, (x) => { if (!x.onGround) fell = true; });
    assert.ok(fell && hi.onGround && Math.abs(hi.pos.y) < 1e-6 && hi.pos.z > 12.3, `slipped off the ledge (y ${hi.pos.y.toFixed(2)}, z ${hi.pos.z.toFixed(2)})`);
    const lo = actor(10, 0.25, 11); lo.onGround = true;
    let air = 0;
    run(ph, lo, 0.8, walk(0, PLAYER.walk), (x) => { if (!x.onGround) air++; });
    assert.ok(lo.pos.z > 12.3 && Math.abs(lo.pos.y) < 1e-6 && air === 0, `stepped down 0.25 m without falling (air ${air})`);
  }
  {
    const { ph } = world({ hf: flat(0), meshes: [stairs(3, 0.45, 0.5)] });
    const a = actor(0, 0, 0); a.onGround = true;
    run(ph, a, 3, walk(0, PLAYER.run));
    assert.ok(a.pos.y < 0.05 && a.pos.z < 2, `0.45 m step blocks (y ${a.pos.y.toFixed(3)}, z ${a.pos.z.toFixed(2)})`);
  }
});

test('architecture: bridge deck over water, walking off the end, groundAt(fromY), bounce mesh', () => {
  const deck = boxMesh(4, 0.3, 10, 0, 1.85, 0);                                   // top at y 2.0
  const cap = boxMesh(2, 0.2, 2, 8, 0.9, 0, { userData: { bounce: 9 } });
  const g = new THREE.Group(); g.add(deck, cap);
  const { ph } = world({ hf: flat(0), meshes: [g], water: [{ kind: 'stream', from: [-20, 0], to: [20, 0], width: 8, y: -0.4, deep: true }] });
  const a = actor(0, 6, -2);
  run(ph, a, 1.5);
  assert.ok(Math.abs(a.pos.y - 2) < 0.01 && a.onGround && a.groundKind === 'mesh', `stands on the deck (y ${a.pos.y.toFixed(3)})`);
  assert.ok(Math.abs(ph.groundAt(0, 0, 10) - 2.0) < 1e-6, 'groundAt(fromY) finds the deck');
  assert.ok(Math.abs(ph.topAt(0, 0) - 2.0) < 1e-6 && Math.abs(ph.topAt(0, 30)) < 1e-9, 'topAt: deck, else terrain');
  {
    const deck2 = boxMesh(4, 0.3, 10, 0, 1.85, 0);
    const w = world({ hf: Heightfield.fromFunction(64, 64, (x, z) => (Math.abs(z) < 4 ? -1.5 : 0)), meshes: [deck2],
      water: [{ kind: 'stream', from: [-20, 0], to: [20, 0], width: 8, y: -0.4, deep: true }] });
    assert.equal(w.ph.isDeepWater(0, 0), false, 'the deck over the stream is dry (top surface)');
    assert.equal(w.ph.isDeepWater(0, 0, 2), false, 'feet on the deck: dry');
    assert.equal(w.ph.isDeepWater(0, 0, -1.5), true, 'feet on the bed under the deck: deep');
    assert.equal(w.ph.isDeepWater(6, 0), true, 'open stream beside the deck: deep');
    assert.equal(w.ph.isDeepWater(6, 10), false, 'dry bank');
  }
  assert.equal(ph.groundAt(0, 0), 0, 'without fromY: terrain');
  assert.ok(Math.abs(ph.groundAt(0, 0, 1) - 0) < 1e-9, 'below the deck: terrain');
  run(ph, a, 2.5, walk(0, PLAYER.run));
  assert.ok(a.pos.z > 5.5 && Math.abs(a.pos.y) < 1e-6 && a.onGround, 'walked off the end onto the ground');
  const b = actor(8, 4, 0);
  let bounced = 0;
  run(ph, b, 0.8, null, (x) => { if (x.bounced) bounced = x.bounced; });
  assert.equal(bounced, 9, 'bounce mesh (userData.bounce)');
});

test('architecture: InstancedMesh, collide:false, addMesh/removeMesh, double-sided planes', () => {
  const geo = new THREE.BoxGeometry(1, 2, 1);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 3);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 3; i++) inst.setMatrixAt(i, m.makeTranslation(i * 5, 1, 0));
  const skip = boxMesh(10, 10, 10, 0, 0, 40); skip.userData.collide = false;
  const g = new THREE.Group(); g.add(inst, skip);
  const { ph } = world({ hf: flat(0), meshes: [g] });
  assert.equal(ph.mesh.triangles.length, 36, '3 instances × 12, collide:false skipped');
  const a = actor(10, 0, -3); a.onGround = true;
  run(ph, a, 2, walk(0, PLAYER.run));
  assert.ok(a.pos.z <= -0.5 - a.radius + 0.02, 'instance 3 blocks');

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  plane.position.set(0, 1.5, 20);                                               // vertical, facing +z; double-sided
  ph.addMesh(plane);
  const from = actor(0, 0, 24); from.onGround = true;
  run(ph, from, 2, walk(0, -PLAYER.run));
  assert.ok(from.pos.z >= 20 + from.radius - 0.02, 'front side blocks');
  const back = actor(1, 0, 16); back.onGround = true;
  run(ph, back, 2, walk(0, PLAYER.run));
  assert.ok(back.pos.z <= 20 - back.radius + 0.02, 'back side of a double-sided plane blocks too');
  ph.removeMesh(plane);
  run(ph, back, 2, walk(0, PLAYER.run));
  assert.ok(back.pos.z > 22, 'removed mesh no longer blocks');
});

// ------------------------------------------------------------------ separation
test('separateActors: mass-weighted, fixed, vertical gaps ignored, stacked actors split, walls respected', () => {
  const { ctx, ph } = world({ hf: flat(0), colliders: { boxes: [{ minX: 1, maxX: 3, minZ: -3, maxZ: 3, y0: -1, y1: 3 }] } });
  const a = actor(0, 0, 0, { mass: 1 }), b = actor(0.2, 0, 0, { mass: 3 });
  ctx.actors.register(a); ctx.actors.register(b);
  ph.separateActors();
  const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
  assert.ok(Math.abs(d - (a.radius + b.radius)) < 1e-9, 'separated to the sum of radii');
  assert.ok(Math.abs(a.pos.x) > Math.abs(b.pos.x - 0.2) * 2.9, 'lighter actor moves more');

  const big = actor(-10, 0, 0, { fixed: true, radius: 2.5, height: 3.5 }), small = actor(-9, 0, 0);
  ctx.actors.register(big); ctx.actors.register(small);
  ph.separateActors();
  assert.equal(big.pos.x, -10, 'fixed actor does not move');
  assert.ok(small.pos.x >= -10 + 2.5 + small.radius - 1e-9);

  const up = actor(-20, 3, 0), down = actor(-20, 0, 0);
  ctx.actors.register(up); ctx.actors.register(down);
  ph.separateActors();
  assert.equal(up.pos.x, -20, 'no vertical overlap → no push');

  const s1 = actor(-30, 0, 0), s2 = actor(-30, 0, 0);
  ctx.actors.register(s1); ctx.actors.register(s2);
  for (let i = 0; i < 3; i++) ph.separateActors();
  assert.ok(Math.hypot(s1.pos.x - s2.pos.x, s1.pos.z - s2.pos.z) >= s1.radius + s2.radius - 1e-6, 'stacked actors split');

  const w1 = actor(0.6, 0, 0, { mass: 1 }), w2 = actor(0.3, 0, 0, { mass: 100 });   // heavy pushes light into the box wall
  ctx.actors.register(w1); ctx.actors.register(w2);
  ph.separateActors();
  assert.ok(w1.pos.x <= 1 - w1.radius + 1e-6, `settled out of the wall (x ${w1.pos.x})`);
  const dead = actor(5, 0, 5, { alive: false }), liv = actor(5.1, 0, 5);
  ctx.actors.register(dead); ctx.actors.register(liv);
  ph.separateActors();
  assert.equal(liv.pos.x, 5.1, 'dead actors do not push');
});

test('separation shoves never tunnel through thin walls; extreme speeds are clamped, not tunnelled', () => {
  const thin = { minX: 0.95, maxX: 1.05, minZ: -5, maxZ: 5, y0: -1, y1: 3 };
  const wallM = boxMesh(0.1, 3, 10, -5, 1.5, 0);
  const { ctx, ph } = world({ hf: flat(0), colliders: { boxes: [thin] }, meshes: [wallM] });
  // a fixed giant overlapping a small actor right next to the 10 cm prop wall: pushed along, never across
  const big = actor(0.2, 0, 0, { fixed: true, radius: 2.0 }), small = actor(0.6, 0, 0);
  ctx.actors.register(big); ctx.actors.register(small);
  for (let i = 0; i < 5; i++) ph.separateActors();
  assert.ok(small.pos.x <= 0.95 - small.radius + 1e-6, `stayed on its side of the prop wall (x ${small.pos.x.toFixed(3)})`);
  // same against an architecture wall
  const big2 = actor(-6.6, 0, 3, { fixed: true, radius: 2.0 }), small2 = actor(-5.5, 0, 3);
  ctx.actors.register(big2); ctx.actors.register(small2);
  for (let i = 0; i < 5; i++) ph.separateActors();
  assert.ok(small2.pos.x <= -5.05 - small2.radius + 0.02, `stayed on its side of the mesh wall (x ${small2.pos.x.toFixed(3)})`);
  // 500 m/s (a broken knockback) still stops at the wall
  const f = actor(-2, 0, -3); f.onGround = true;
  run(ph, f, 0.2, walk(500, 0));
  assert.ok(f.pos.x <= 0.95 - f.radius + 1e-6, `500 m/s stopped (x ${f.pos.x.toFixed(3)})`);
  const g = actor(-2, 0, 2); g.onGround = true;
  run(ph, g, 0.2, walk(-500, 0));
  assert.ok(g.pos.x >= -4.95 + g.radius - 0.02, `500 m/s stopped by the mesh wall (x ${g.pos.x.toFixed(3)})`);
});

test('services: refreshColliders keeps addCollider extras, overlapsStatic, bounceAt, isShallowWater, topAt, groundAt', () => {
  const circles = [{ x: 0, z: 0, r: 1, y0: -1, y1: 2 }];
  const pad = { x: 10, z: 0, r: 1, y0: -1, y1: 0.3, bounce: 9 };
  const hf = Heightfield.fromFunction(64, 32, (x) => (x > 15 ? -0.3 : 0));
  const shelf = boxMesh(4, 0.2, 4, -10, 0.9, 0, { userData: { bounce: 12 } });
  const { ph, level } = world({ hf, colliders: { circles: [...circles, pad], boxes: [] }, meshes: [shelf],
    water: [{ kind: 'rect', minX: 15, maxX: 30, minZ: -10, maxZ: 10, y: 0 }] });
  const door = ph.addCollider({ minX: 4, maxX: 5, minZ: -1, maxZ: 1, y0: -1, y1: 3 });
  level.colliders.circles.push({ x: 0, z: 6, r: 0.5, y0: -1, y1: 2 });       // edited in place (arena fog wall)
  ph.refreshColliders();
  assert.ok(ph.statics.has(door), 'addCollider extra survives refreshColliders');
  assert.equal(ph.statics.count, 4);
  assert.ok(ph.overlapsStatic(new THREE.Vector3(0, 6.4, 0), 0.2) === false, 'above the trunk');
  assert.ok(ph.overlapsStatic(new THREE.Vector3(0, 1, 6.4), 0.2), 'the new circle');
  assert.ok(ph.overlapsStatic(new THREE.Vector3(4.5, 1, 0), 0.1), 'the door');
  assert.ok(ph.overlapsStatic(new THREE.Vector3(-10, 0.95, 0), 0.1), 'architecture');
  assert.ok(!ph.overlapsStatic(new THREE.Vector3(-10, 0.95, 0), 0.1, { mesh: false }));
  ph.addCollider({ x: 20, z: -20, r: 4, kind: 'ring' });
  assert.ok(!ph.overlapsStatic(new THREE.Vector3(24, 1, -20), 0.3), 'fog-wall rings do not stop projectiles');
  assert.equal(ph.bounceAt(10, 0, 0.3), 9, 'prop bounce');
  assert.equal(ph.bounceAt(-10, 0, 1.0), 12, 'mesh bounce');
  assert.equal(ph.bounceAt(5, 5, 0), 0);
  assert.ok(Math.abs(ph.topAt(-10, 0) - 1.0) < 1e-6 && ph.topAt(0, 0) === 2 && ph.topAt(5, 8) === 0);
  assert.ok(Math.abs(ph.groundAt(-10, 0, 0.5)) < 1e-9, 'under the shelf: terrain');
  assert.equal(ph.isShallowWater(20, 0), true, '0.3 m: wading');
  assert.equal(ph.isDeepWater(20, 0), false);
  assert.equal(ph.isShallowWater(5, 0), false, 'dry');
  ph.removeCollider(door);
  ph.refreshColliders();
  assert.ok(!ph.statics.has(door), 'removed extras stay removed');
  ph.setLevel(null);
  assert.equal(ph.statics.count, 0, 'setLevel drops extras');
});

// ------------------------------------------------------------------ rays, water, bounds, robustness
test('raycast / sphereCast / lineOfSight: terrain, architecture, props; shared hit object', () => {
  const hf = Heightfield.fromFunction(64, 32, (x, z) => 0.5 + 0.1 * x);
  const wallM = boxMesh(6, 4, 0.2, 0, 2, 10);
  const rock = { x: -10, z: 0, r: 1, y0: -1, y1: 2 };
  const { ph } = world({ hf, meshes: [wallM], colliders: { circles: [rock] } });
  const down = new THREE.Ray(new THREE.Vector3(3, 20, 3), new THREE.Vector3(0, -1, 0));
  const h1 = ph.raycast(down, 100);
  assert.ok(h1 && h1.kind === 'terrain' && Math.abs(h1.point.y - ph.heightAt(3, 3)) < 1e-6);
  const fwd = new THREE.Ray(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 0, 1));
  const h2 = ph.raycast(fwd, 30);
  assert.ok(h2 && h2.kind === 'mesh' && Math.abs(h2.distance - 9.9) < 1e-6 && h2.normal.z < -0.99 && h2.object === wallM);
  assert.equal(ph.raycast(fwd, 5), null, 'short ray misses');
  const side = new THREE.Ray(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
  assert.equal(ph.raycast(side, 30)?.kind ?? null, null, 'props are ignored by default (camera)');
  const hs = ph.raycast(side, 30, { statics: true });
  assert.ok(hs && hs.kind === 'static' && Math.abs(hs.distance - 9) < 1e-6 && hs.object === rock);
  assert.ok(ph.castIgnore === true && ph.raycast(side, 30, { statics: true, ignore: (src) => src === rock }) === null, 'opts.ignore skips a prop');
  assert.equal(ph.lineOfSight(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-20, 1, 0), { terrain: true, mesh: true, statics: true, ignore: (src) => src === rock }), true);
  const sc = ph.sphereCast(fwd, 0.3, 30);
  assert.ok(sc && Math.abs(sc.distance - 9.6) < 1e-3, `sphere stops a radius early (${sc?.distance})`);
  assert.equal(ph.lineOfSight(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 1.5, 20)), false);
  assert.equal(ph.lineOfSight(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(5, 1.5, 0)), true);
  assert.equal(ph.lineOfSight(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-20, 1, 0)), false, 'rock blocks sight');
  assert.equal(ph.raycast(down, 100), ph.raycast(down, 100), 'shared hit object');
});

test('isDeepWater: level function wins, else level.water; feet above the surface are dry; bounds clamp', () => {
  const hf = Heightfield.fromFunction(100, 50, (x, z) => (Math.abs(z) < 4 ? -1.5 : 0));
  const { ph } = world({ hf, water: [{ kind: 'stream', from: [-50, 0], to: [50, 0], width: 8, y: -0.4, deep: true }],
    bounds: { min: new THREE.Vector2(-40, -40), max: new THREE.Vector2(40, 40) } });
  assert.equal(ph.isDeepWater(0, 0), true);
  assert.equal(ph.isDeepWater(0, 0, 2.0), false, 'on a bridge above the stream');
  assert.equal(ph.isDeepWater(0, 10), false);
  assert.equal(ph.waterLevelAt(0, 1), -0.4);
  assert.equal(ph.waterLevelAt(0, 20), null);
  const w2 = world({ hf: flat(0), isDeepWater: (x, z, y) => x > 5 && !(y > 1) });
  assert.equal(w2.ph.isDeepWater(6, 0), true);
  assert.equal(w2.ph.isDeepWater(4, 0), false);
  w2.ph.addMesh(boxMesh(4, 0.2, 4, 8, 1.9, 0));                                // a deck at y 2 over the level's water
  assert.equal(w2.ph.isDeepWater(8, 0), false, 'level function is asked about the top surface (the deck) without y');
  assert.equal(w2.ph.isDeepWater(8, 0, 0), true, 'and about the feet when given');
  // polyline streams (world's `pts`) and yawed rects
  const w4 = world({ hf: flat(-2), water: [{ kind: 'stream', pts: [[-40, 0], [0, 0], [0, 40]], width: 4, y: 0, deep: true },
    { kind: 'rect', at: [20, -20], size: [10, 2], yaw: Math.PI / 2, y: 0 }] });
  assert.ok(w4.ph.isDeepWater(-20, 1) && w4.ph.isDeepWater(1, 20) && !w4.ph.isDeepWater(20, 20), 'polyline stream');
  assert.ok(w4.ph.isDeepWater(20, -24) && !w4.ph.isDeepWater(24, -20), 'yawed rect: long along z after a 90° yaw');
  const w3 = world({ hf: Heightfield.fromFunction(100, 50, (x) => (x > 0 ? -0.2 : -2)), water: [{ y: 0 }] });
  assert.equal(w3.ph.isDeepWater(10, 0), false, 'shallow plane water');
  assert.equal(w3.ph.isDeepWater(-10, 0), true, 'deep plane water');

  const a = actor(39.9, 0, -45); a.vel.set(5, 0, -5);
  ph.clampToBounds(a);
  assert.equal(a.pos.x, 40 - a.radius); assert.equal(a.pos.z, -40 + a.radius);
  assert.ok(a.vel.x === 0 && a.vel.z === 0);
  assert.ok(ph.inBounds(0, 0) && !ph.inBounds(45, 0));
});

test('robustness: NaN positions recover, attachedTo is skipped, setLevel(null) is safe, many actors are cheap', () => {
  const g = new THREE.Group();
  for (let i = 0; i < 40; i++) g.add(boxMesh(2, 1 + (i % 3), 2, (i % 8) * 6 - 21, 0.5, Math.floor(i / 8) * 6 - 12));
  const circles = Array.from({ length: 60 }, (_, i) => ({ x: (i % 10) * 4 - 18, z: Math.floor(i / 10) * 4 - 10 + 2, r: 0.5, y0: -1, y1: 2 }));
  const { ctx, ph } = world({ hf: Heightfield.fromFunction(80, 80, (x, z) => Math.sin(x * 0.2) * 0.5), meshes: [g], colliders: { circles } });
  const n = actor(1, 1, 1); n.pos.set(NaN, 0, 0); n.prevPos.set(2, 3, 4);
  ph.moveActor(n, DT);
  assert.ok(Number.isFinite(n.pos.x) && Number.isFinite(n.pos.y));
  const att = actor(0, 5, 0, { attachedTo: {} });
  ph.moveActor(att, DT);
  assert.equal(att.pos.y, 5);

  const list = [];
  for (let i = 0; i < 30; i++) { const a = actor((i % 6) * 3 - 9, 3, Math.floor(i / 6) * 3 - 6); ctx.actors.register(a); list.push(a); }
  const t0 = performance.now();
  for (let s = 0; s < 600; s++) {
    for (const a of list) { a.prevPos.copy(a.pos); const k = (s + a.id) * 0.01; a.vel.x = Math.sin(k) * 5.5; a.vel.z = Math.cos(k * 1.3) * 5.5; ph.moveActor(a, DT); }
    ph.separateActors();
  }
  const ms = performance.now() - t0;
  // a sanity bound against accidental O(n²)/O(tris) blow-ups, loose enough for a machine busy with other agents'
  // smoke runs (≈130 ms when idle); the smoke block physics:soak reports µs per actor-step on the real level
  assert.ok(ms < 15000, `30 actors × 10 s of steps took ${ms.toFixed(0)} ms`);
  for (const a of list) {
    assert.ok(Number.isFinite(a.pos.x + a.pos.y + a.pos.z));
    assert.ok(a.pos.y >= ph.heightAt(a.pos.x, a.pos.z) - 1e-6, 'never below the terrain');
    assert.ok(!ph.mesh.penetrates(a.pos.x, a.pos.y, a.pos.z, a.radius - 0.05, a.height, 0.01), `actor ${a.id} not stuck inside architecture`);
  }
  ph.setLevel(null);
  assert.equal(ph.octree, null);
  assert.equal(ph.heightAt(3, 3), 0);
  ph.dispose();
});
