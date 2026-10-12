// tests/unit/nav.test.js  (owner: physics) — CONTROLS_SPEC §5.3 nav grid + A*: synthetic grids (wall with a gap,
// a stream with stumps, a 1 m fence, thick walls), optimality, partial paths, the expansion cap, link kinds (hop,
// drop, gap, fence, bounce), authored + gated links, invalidation, the corridor audit; and the Physics integration
// (collider rasterisation, `nav: false`, `navBlock`, `navLinks` gated by state flags, dynamic colliders).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NavGrid, WALK, BLOCKED } from '../../src/physics/NavGrid.js';
import { findPath, markTraps, reachableIslands, buildIslands } from '../../src/physics/Pathfind.js';
import { Heightfield } from '../../src/physics/Heightfield.js';
import { Physics } from '../../src/physics/Physics.js';
import * as config from '../../src/core/config.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { GameState } from '../../src/core/GameState.js';
import { EventBus } from '../../src/core/EventBus.js';

const { NAV } = config;

/** A synthetic grid: `sample(x, z)` → { h, ok, top?, bounce? }. */
const grid = (sample, w = 20, d = w) => new NavGrid({ minX: 0, minZ: 0, maxX: w, maxZ: d }, sample);
const flat = () => ({ h: 0, ok: true });
const len = (from, pts) => { let L = 0, px = from.x, pz = from.z; for (const q of pts) { L += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; if (q.to) { L += Math.hypot(q.to.x - px, q.to.z - pz); px = q.to.x; pz = q.to.z; } } return L; };
/** Every consecutive non-link segment is walkable in a straight line. */
function assertWalkable(g, from, pts) {
  let px = from.x, pz = from.z;
  for (const q of pts) {
    if (Math.hypot(q.x - px, q.z - pz) > 1e-3) assert.ok(g.losWalkable(px, pz, q.x, q.z), `segment (${px.toFixed(1)}, ${pz.toFixed(1)}) → (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) walkable`);
    if (q.link && q.to) { px = q.to.x; pz = q.to.z; } else { px = q.x; pz = q.z; }
  }
}

// ------------------------------------------------------------------ grid basics
test('NavGrid: index / centres, lazy probe, fill in slices, top + bounce from the sampler', () => {
  let n = 0;
  const g = grid((x, z) => { n++; return x > 10 ? { h: 1, ok: true, bounce: true } : { h: 0, ok: false, top: 2 }; }, 20);
  assert.equal(g.nx, 40); assert.equal(g.nz, 40);
  assert.equal(g.index(-0.1, 1), -1);
  const k = g.index(12.2, 3.3);
  assert.equal(g.cx(k), 12.25); assert.equal(g.cz(k), 3.25);
  assert.equal(n, 0, 'nothing sampled before use');
  assert.ok(g.walkable(k)); assert.equal(g.bounce[k], 1); assert.equal(g.h[k], 1);
  const b = g.index(2, 2);
  assert.equal(g.probe(b), BLOCKED); assert.equal(g.top[b], 2);
  assert.equal(n, 2);
  let t = 0;
  const done = g.fill(5, () => (t += 1));          // fake clock: 1 ms per check
  assert.ok(!done && g.fillAt > 0 && g.fillAt < g.size, 'the fill stops at its time budget');
  while (!g.fill(1000)) { /* finish */ }
  assert.ok(g.filled); assert.equal(g.sampled, g.size);
});

test('NavGrid: steps ≤ 0.3 m walk; diagonals need both orthogonal cells; nearestWalkable ring search', () => {
  const g = grid((x, z) => ({ h: x > 10 ? 0.25 : 0, ok: !(x > 5 && x < 5.5 && z > 5 && z < 5.5) }));
  assert.ok(g.step(g.index(9.75, 1), g.index(10.25, 1)), '0.25 m step');
  const h = grid((x) => ({ h: x > 10 ? 0.35 : 0, ok: true }));
  assert.ok(!h.step(h.index(9.75, 1), h.index(10.25, 1)), '0.35 m is too tall to walk');
  // diagonal past the blocked cell (5.25, 5.25): from (4.75, 5.25) to (5.25, 5.75)? the corner cell (5.25, 5.25) blocks
  assert.ok(!g.step(g.index(4.75, 4.75), g.index(5.25, 5.25)));
  assert.ok(!g.step(g.index(4.75, 5.25), g.index(5.25, 5.75)), 'no corner cutting');
  const k = g.nearestWalkable(5.25, 5.25, 1);
  assert.ok(k >= 0 && k !== g.index(5.25, 5.25));
  assert.ok(Math.hypot(g.cx(k) - 5.25, g.cz(k) - 5.25) <= 0.51);
});

// ------------------------------------------------------------------ A*
test('A*: a wall with a gap — walked around, within 5 % of optimal, string-pulled, every segment walkable', () => {
  const g = grid((x, z) => (z > 9.5 && z < 10.5 && x < 15 ? { h: 0, ok: false, top: 5 } : flat()));
  const from = { x: 2, z: 2 }, to = { x: 2, z: 18 };
  const r = findPath(g, from, to);
  assert.ok(r.ok && !r.partial);
  const ideal = Math.hypot(15.25 - 2, 9.5 - 2) + 1 + Math.hypot(15.25 - 2, 18 - 10.5);
  const L = len(from, r.points);
  assert.ok(L <= ideal * 1.05, `length ${L.toFixed(2)} vs ideal ≈ ${ideal.toFixed(2)}`);
  assert.ok(r.points.length <= 5, `${r.points.length} points (pulled)`);
  assert.equal(r.links.length, 0);
  assertWalkable(g, from, r.points);
  const last = r.points[r.points.length - 1];
  assert.ok(Math.hypot(last.x - to.x, last.z - to.z) < 1e-6, 'ends exactly on the clicked point');
});

test('A*: open field paths are a single straight segment; a pillar forest is threaded close to the straight line', () => {
  const g = grid(flat);
  const r = findPath(g, { x: 1, z: 1 }, { x: 18.3, z: 12.7 });
  assert.equal(r.points.length, 1);
  // pillars every 3 m: the octile grid path is pulled close to the Euclidean optimum
  const p = grid((x, z) => ((Math.abs(((x % 3) + 3) % 3 - 1.5) < 0.5 && Math.abs(((z % 3) + 3) % 3 - 1.5) < 0.5) ? { h: 0, ok: false, top: 3 } : flat()), 30);
  const from = { x: 0.3, z: 0.3 }, to = { x: 29.6, z: 21.2 };
  const q = findPath(p, from, to);
  assert.ok(q.ok && !q.partial);
  assertWalkable(p, from, q.points);
  const L = len(from, q.points), straight = Math.hypot(to.x - from.x, to.z - from.z);
  assert.ok(L <= q.cost + 1e-6, `string pulling never lengthens the grid path (${L.toFixed(2)} vs ${q.cost.toFixed(2)})`);
  assert.ok(L <= straight * 1.08, `${L.toFixed(2)} vs the (blocked) straight line ${straight.toFixed(2)}`);
});

test('A*: a 1 m fence is a `fence` link; a 5 m wall and a 1 m × 2.5 m thick wall are not', () => {
  const fence = grid((x) => (x > 4.6 && x < 5.4 ? { h: 0, ok: false, top: 1.0 } : flat()));
  const r = findPath(fence, { x: 2, z: 10 }, { x: 9, z: 10 });
  assert.ok(r.ok && !r.partial);
  assert.equal(r.links.length, 1);
  assert.equal(r.links[0].link, 'fence');
  assert.ok(r.links[0].to.x > 5.4, 'lands past the fence');
  assert.ok(r.links[0].x < 4.6 - 0.3, 'takes off with a run-up before the fence');
  const wall = grid((x) => (x > 4.6 && x < 5.4 ? { h: 0, ok: false, top: 5 } : flat()));
  const w = findPath(wall, { x: 2, z: 10 }, { x: 9, z: 10 }, { maxExpand: 3000 });
  assert.ok(w.partial && w.links.length === 0, 'an unbroken 5 m wall: partial, no link');
  const thick = grid((x) => (x > 4 && x < 6.5 ? { h: 0, ok: false, top: 1.0 } : flat()));
  const t = findPath(thick, { x: 2, z: 10 }, { x: 9, z: 10 }, { maxExpand: 3000 });
  assert.ok(t.partial, 'a 2.5 m thick low wall is no fence');
});

test('A*: a stream ≤ 2 m is a `gap` link; a 3.5 m river is not; stumps make a stepping-stone path', () => {
  const stream = grid((x) => (x > 4 && x < 5.5 ? { h: -1.5, ok: false, top: -1.5 } : flat()));
  const s = findPath(stream, { x: 2, z: 10 }, { x: 9, z: 10 });
  assert.ok(s.ok && !s.partial);
  assert.equal(s.links[0]?.link, 'gap');
  const river = (x, z, stumps) => {
    if (x > 4 && x < 7.5) {
      if (stumps && (Math.hypot(x - 5.0, z - 10) < 0.45 || Math.hypot(x - 6.5, z - 10) < 0.45)) return { h: 0.2, ok: true };
      return { h: -1.5, ok: false, top: -1.5 };
    }
    return flat();
  };
  const r = findPath(grid((x, z) => river(x, z, false)), { x: 2, z: 10 }, { x: 10, z: 10 }, { maxExpand: 4000 });
  assert.ok(r.partial, 'a 3.5 m river can not be jumped');
  const st = findPath(grid((x, z) => river(x, z, true)), { x: 2, z: 10 }, { x: 10, z: 10 });
  assert.ok(st.ok && !st.partial, 'stumps bridge it');
  assert.ok(st.links.length >= 2, `${st.links.length} jumps (stump to stump)`);
});

test('A*: hop (0.3–1.1 m up), drop (down ≤ 3 m, one-way), too tall (1.5 m) needs an authored link', () => {
  const ledge = (hh) => grid((x) => ({ h: x > 10 ? hh : 0, ok: true }));
  const up = findPath(ledge(0.8), { x: 2, z: 5 }, { x: 14, z: 5 });
  assert.ok(up.ok && !up.partial && up.links.some((q) => q.link === 'hop'));
  const down = findPath(ledge(0.8), { x: 14, z: 5 }, { x: 2, z: 5 });
  assert.ok(down.ok && !down.partial && down.links.some((q) => q.link === 'drop'));
  const cliff = findPath(ledge(2.5), { x: 14, z: 5 }, { x: 2, z: 5 });
  assert.ok(cliff.ok && !cliff.partial && cliff.links[0].link === 'drop', 'a 2.5 m drop is fine one way');
  const g = ledge(1.5);
  const no = findPath(g, { x: 2, z: 5 }, { x: 14, z: 5 }, { maxExpand: 3000 });
  assert.ok(no.partial, '1.5 m is beyond a hop');
  g.setLinks([{ a: [9.6, 5], b: [10.6, 5], kind: 'hop' }]);
  const yes = findPath(g, { x: 2, z: 5 }, { x: 14, z: 5 });
  assert.ok(yes.ok && !yes.partial, 'the authored hop link climbs it');
  const L = yes.links.find((q) => q.authored);
  assert.ok(L && L.link === 'hop' && Math.abs(L.x - 9.75) < 0.01 && Math.abs(L.to.x - 10.75) < 0.01, 'authored take-off / landing are kept exactly (cell centres)');
  const back = findPath(g, { x: 14, z: 5 }, { x: 2, z: 5 });
  assert.ok(back.ok && !back.partial, 'and back down');
});

test('A*: a bounce cap launches up to 1.8 m (a `bounce` link); the same rise from plain ground is unreachable', () => {
  // ground 0; a cap at 1.0 (x 6..8, bounce or not); a ledge at 2.6 (x > 9.5)
  const mk = (bounce) => grid((x) => (x > 9.5 ? { h: 2.6, ok: true } : x > 6 && x < 8 ? { h: 1.0, ok: true, bounce } : flat()));
  const b = findPath(mk(true), { x: 2, z: 5 }, { x: 13, z: 5 });
  assert.ok(b.ok && !b.partial, 'reached via the bounce cap');
  assert.deepEqual(b.links.map((q) => q.link), ['hop', 'bounce']);
  const n = findPath(mk(false), { x: 2, z: 5 }, { x: 13, z: 5 }, { maxExpand: 3000 });
  assert.ok(n.partial, 'a plain cap does not reach 1.6 m higher');
});

test('A*: every link off a bounce cap is a `bounce` (never a ground drop / hop she could not take off for)', () => {
  // a bounce cap at 2.5 (x 6..8, z 3.5..6.5), ground 0 all round, a ledge at 3.2 east (x > 9.5): starting ON the cap
  const g = grid((x, z) => (x > 6 && x < 8 && z > 3.5 && z < 6.5 ? { h: 2.5, ok: true, bounce: true } : x > 9.5 ? { h: 3.2, ok: true } : flat()));
  for (const goal of [{ x: 2, z: 5 }, { x: 13, z: 5 }, { x: 7, z: 15 }]) {
    const r = findPath(g, { x: 7, z: 5 }, goal);
    assert.ok(r.ok && !r.partial, `off the cap to (${goal.x}, ${goal.z})`);
    assert.ok(r.links.length >= 1, 'it leaves the cap by a link');
    assert.equal(r.links[0].link, 'bounce', `the first link off the cap is a bounce (${r.links.map((q) => q.link)})`);
  }
  // authored drop links from a cap are flown as bounces too
  const a = grid((x, z) => (x > 6 && x < 8 && z > 3.5 && z < 6.5 ? { h: 2.5, ok: true, bounce: true } : flat()));
  a.setLinks([{ a: [7.5, 5], b: [10, 5], kind: 'drop' }]);
  const r = findPath(a, { x: 7, z: 5 }, { x: 12, z: 5 });
  assert.ok(r.ok && r.links.length && r.links.every((q) => q.link === 'bounce'), `authored link off a cap → bounce (${r.links.map((q) => q.link)})`);
});

test('A*: unreachable goals snap ≤ 4 m, else partial to the nearest reachable cell; the expansion cap', () => {
  const g = grid((x, z) => (Math.hypot(x - 10, z - 10) < 1.5 ? { h: 0, ok: false, top: 3 } : flat()));
  const r = findPath(g, { x: 2, z: 2 }, { x: 10, z: 10 });
  assert.ok(r.ok && !r.partial, 'a goal inside a rock snaps to its edge');
  assert.ok(Math.hypot(r.goal.x - 10, r.goal.z - 10) <= 2.2);
  // a closed box: the goal inside is out of reach (the box walls are 5 m tall)
  const box = grid((x, z) => {
    const inX = x > 12 && x < 18, inZ = z > 12 && z < 18, wall = inX && inZ && !(x > 12.8 && x < 17.2 && z > 12.8 && z < 17.2);
    return wall ? { h: 0, ok: false, top: 5 } : flat();
  });
  const p = findPath(box, { x: 2, z: 2 }, { x: 15, z: 15 });
  assert.ok(p.ok && p.partial, 'partial');
  assert.ok(Math.hypot(p.goal.x - 15, p.goal.z - 15) < 3.5, 'ends next to the box');
  // the cap: a big open grid with a far, unreachable goal stops at maxExpand and still returns the best node
  const big = grid((x, z) => (x > 95 ? { h: 0, ok: false, top: 9 } : flat()), 100);
  const c = findPath(big, { x: 1, z: 50 }, { x: 99, z: 50 }, { maxExpand: 500 });
  assert.ok(c.partial && c.expansions <= 501 && c.ok);
  assert.ok(c.goal.x > 5, 'progress toward the goal');
  const full = findPath(big, { x: 1, z: 50 }, { x: 60, z: 50 });
  assert.ok(!full.partial && full.expansions <= NAV.maxExpand, `straight run: ${full.expansions} expansions`);
});

test('A*: speed — 50 queries across a 100 m cluttered field stay fast (typed arrays, reused scratch)', () => {
  const rocks = [];
  for (let i = 0; i < 160; i++) rocks.push([(i * 37.7) % 100, (i * 61.3) % 100, 0.6 + (i % 4) * 0.4]);
  const g = grid((x, z) => (rocks.some(([rx, rz, rr]) => (x - rx) ** 2 + (z - rz) ** 2 < rr * rr) ? { h: 0, ok: false, top: 2 } : flat()), 100);
  while (!g.fill(1000)) { /* prebuild */ }
  const t0 = performance.now();
  let ok = 0;
  for (let i = 0; i < 50; i++) {
    const r = findPath(g, { x: 2 + (i % 5), z: 2 + i }, { x: 95 - (i % 7), z: 97 - i });
    if (r.ok) ok++;
  }
  const ms = (performance.now() - t0) / 50;
  assert.equal(ok, 50);
  assert.ok(ms < 15, `${ms.toFixed(2)} ms per query`);
});

// ------------------------------------------------------------------ authored + gated links
test('gated fence link: closed → no automatic jump across its gate line; open → the fence is hopped', () => {
  // a 1 m fence along z = 10 from x 0..16 (walk-around past x 16)
  const g = grid((x, z) => (z > 9.6 && z < 10.4 && x < 16 ? { h: 0, ok: false, top: 1.0 } : flat()));
  const flags = {};
  g.setLinks([{ a: [8, 8.5], b: [8, 11.5], kind: 'fence', when: 'tut.jump.done', gate: [[0, 10], [16, 10]] }], (e) => !!flags[e]);
  assert.equal(g.gatesClosed, 1);
  const from = { x: 8, z: 6 }, to = { x: 8, z: 14 };
  const closed = findPath(g, from, to);
  assert.ok(closed.ok && !closed.partial && closed.links.length === 0, 'walks around the fence');
  assert.ok(len(from, closed.points) > 15);
  flags['tut.jump.done'] = true;                       // the query re-checks the gate (no refresh call needed)
  const open = findPath(g, from, to);
  assert.equal(g.gatesClosed, 0);
  assert.ok(open.ok && open.links.length === 1, 'hops the fence once the lesson is done');
  assert.ok(len(from, open.points) < 11);
  // without a walk-around, a closed gate leaves the far side unreachable (partial: she walks to the fence and stops)
  const shut = grid((x, z) => (z > 9.6 && z < 10.4 ? { h: 0, ok: false, top: 1.0 } : flat()));
  const f2 = {};
  shut.setLinks([{ a: [8, 8.5], b: [8, 11.5], kind: 'fence', when: 'tut.jump.done', gate: [[0, 10], [20, 10]] }], (e) => !!f2[e]);
  const p = findPath(shut, from, to);
  assert.ok(p.partial && p.goal.z < 10 && p.goal.z > 8.5, `stops at the fence (z ${p.goal.z})`);
  f2['tut.jump.done'] = true;
  shut.refreshLinks();
  assert.ok(!findPath(shut, from, to).partial);
});

test('authored links: one-way drop / bounce, two-way hop, `when` gating, bad entries ignored', () => {
  const g = grid((x) => ({ h: x > 10 ? 3 : 0, ok: true }));          // a 3 m wall-ledge: no auto hop up
  const flags = { open: false };
  g.setLinks([
    { a: [9, 5], b: [11, 5], kind: 'bounce' },                           // one-way up
    { a: [9, 15], b: [11, 15], kind: 'hop', when: 'open' },
    { a: 'nope' }, null,
  ], (e) => flags[e]);
  assert.equal(g.authored.length, 2);
  assert.equal(g.openLinks, 1);
  const up = findPath(g, { x: 2, z: 5 }, { x: 14, z: 5 });
  assert.ok(!up.partial && up.links.some((q) => q.link === 'bounce'));
  const down = findPath(g, { x: 14, z: 15 }, { x: 2, z: 15 });
  assert.ok(!down.partial && down.links[0].link === 'drop' && !down.links[0].authored, 'down: the automatic drop');
  flags.open = true; g.checkLinks();
  assert.equal(g.openLinks, 2);
  const hop = findPath(g, { x: 2, z: 15 }, { x: 14, z: 15 });
  assert.ok(!hop.partial && hop.links.some((q) => q.authored && q.link === 'hop'));
});

// ------------------------------------------------------------------ invalidation + audit
test('invalidate: a dynamic collider re-samples its region (and only that region)', () => {
  let blocked = false;
  const g = grid((x, z) => (blocked && x > 9 && x < 11 ? { h: 0, ok: false, top: 2 } : flat()));
  while (!g.fill(1000)) { /* */ }
  assert.ok(findPath(g, { x: 2, z: 10 }, { x: 18, z: 10 }).points.length === 1);
  blocked = true;
  assert.ok(g.walkableAt(10, 10), 'cached');
  const v = g.version;
  g.invalidate(9, 0, 11, 20);
  assert.ok(g.version > v);
  assert.ok(g.walkableAt(5, 10) && g.flag[g.index(5, 10)] !== 0, 'outside the box: untouched');
  assert.ok(!g.walkableAt(10, 10), 're-sampled after invalidate');
  const r = findPath(g, { x: 2, z: 10 }, { x: 18, z: 10 }, { maxExpand: 3000 });
  assert.ok(r.partial, 'the new 2 m tall wall cuts the field');
  blocked = false; g.invalidate(9, 0, 11, 20);
  assert.ok(!findPath(g, { x: 2, z: 10 }, { x: 18, z: 10 }).partial, 'removed again');
});

test('corridor audit: a 1.2 m alley between walls is reported, a 3 m street is not', () => {
  // two walls along z with a 1.2 m clear gap at x 9.65..10.85 (cells eroded by the agent: walkable 10.05..10.45)
  const pad = NAV.agentR + NAV.margin;
  const g = grid((x, z) => {
    const inWall = (x < 9.65 + pad || x > 10.85 - pad) && z > 4 && z < 16 && x > 5 && x < 15;
    const street = x > 25 && x < 28;                                 // never bounded
    return inWall && !street ? { h: 0, ok: false, top: 4 } : flat();
  }, 30);
  while (!g.fill(1000)) { /* */ }
  const c = g.corridors();
  assert.ok(c.length >= 1, 'found');
  assert.ok(c.every((q) => q.x > 9 && q.x < 11 && q.width < NAV.minCorridor), JSON.stringify(c));
  const w = grid((x, z) => ((x < 8 || x > 11) && x > 4 && x < 15 && z > 4 && z < 16 ? { h: 0, ok: false, top: 4 } : flat()), 20);
  while (!w.fill(1000)) { /* */ }
  assert.equal(w.corridors().length, 0, 'a 3 m street');
});

// ------------------------------------------------------------------ Physics integration
function world({ colliders = { circles: [], boxes: [] }, navLinks, navBlock, flags = {} } = {}) {
  const state = new GameState();
  Object.assign(state.flags, flags);
  const ctx = { config, actors: new ActorRegistry(), scene: new THREE.Scene(), bus: new EventBus(), state, params: { test: true }, game: { mode: 'play' } };
  const ph = new Physics(ctx);
  ctx.physics = ph;
  const level = { id: 'synthetic', heightfield: Heightfield.fromFunction(40, 40, () => 0), colliders, octreeMeshes: [], root: new THREE.Group(),
    bounds: { min: { x: -20, y: -20 }, max: { x: 20, y: 20 } }, navLinks, navBlock };
  ph.init();
  ph.setLevel(level);
  return { ctx, ph, level, state };
}

test('Physics nav: colliders rasterise with the agent radius; `nav: false` is skipped; navBlock; low props are walkable', () => {
  const rock = { x: 0, z: 0, r: 1, y0: 0, y1: 3, walkable: false };
  const ghost = { x: 6, z: 0, r: 1, y0: 0, y1: 3, walkable: false, nav: false };
  const crate = { x: -6, z: 0, hx: 1, hz: 1, y0: 0, y1: 0.25 };      // a 0.25 m slab: below spanLo, a walkable top
  const { ph } = world({ colliders: { circles: [rock, ghost], boxes: [crate] }, navBlock: [[8, 8, 10, 10], { at: [-10, 10], r: 1 }] });
  assert.ok(ph.nav);
  assert.ok(!ph.navWalkable(0, 0));
  assert.ok(!ph.navWalkable(1.25, 0), 'inside r + agentR + margin');
  assert.ok(ph.navWalkable(1.75, 0), 'outside it');
  assert.ok(ph.navWalkable(6, 0), '`nav: false` collider ignored');
  assert.ok(ph.navWalkable(-6, 0), 'a low slab is walked over');
  assert.ok(Math.abs(ph.nav.h[ph.nav.index(-6, 0)] - 0.25) < 1e-6, 'its top is the surface');
  assert.ok(!ph.navWalkable(9, 9) && !ph.navWalkable(-10, 10), 'navBlock rect + disc');
  assert.ok(ph.navWalkable(11, 11));
  const r = ph.findPath({ x: -3, z: 0 }, { x: 3, z: 0 });
  assert.ok(r.ok && !r.partial && r.points.length >= 2, 'around the rock');
  const near = ph.nearestWalkable(0, 0, 4);
  assert.ok(near && Math.hypot(near.x, near.z) >= 1.4);
  assert.ok(ph.losWalkable({ x: -3, z: 5 }, { x: 3, z: 5 }));
  assert.ok(!ph.losWalkable({ x: -3, z: 0 }, { x: 3, z: 0 }));
});

test('Physics nav: addCollider / updateCollider / removeCollider / refreshColliders invalidate the grid', () => {
  const { ph, level } = world();
  while (!ph.nav.fill(1000)) { /* */ }
  assert.ok(ph.navWalkable(5, 5));
  const door = { minX: 4, maxX: 6, minZ: 4, maxZ: 6, y0: 0, y1: 3, walkable: false };
  ph.addCollider(door);
  assert.ok(!ph.navWalkable(5, 5), 'added');
  door.minX = 10; door.maxX = 12;
  ph.updateCollider(door);
  assert.ok(ph.navWalkable(5, 5) && !ph.navWalkable(11, 5), 'moved');
  ph.removeCollider(door);
  assert.ok(ph.navWalkable(11, 5), 'removed');
  // in-place edits of level.colliders (opened gates, fog walls) are diffed by refreshColliders
  const gateBar = { x: -5, z: -5, r: 1, y0: 0, y1: 4, walkable: false };
  level.colliders.circles.push(gateBar);
  ph.refreshColliders();
  assert.ok(!ph.navWalkable(-5, -5), 'appeared');
  level.colliders.circles.length = 0;
  ph.refreshColliders();
  assert.ok(ph.navWalkable(-5, -5), 'went away');
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) { ph.addCollider(door); ph.removeCollider(door); }
  assert.ok((performance.now() - t0) / 40 < 2, 'invalidation < 2 ms');
});

test('Physics nav: level navLinks gated by state flags (story:flag re-evaluates); nav:ready stats; runtime links', () => {
  const fence = { ax: -20, az: 0, bx: 20, bz: 0, width: 0.2, y0: 0, y1: 1.0, walkable: false };   // a 1 m fence across the level
  const { ph, ctx, state } = world({ colliders: { circles: [], boxes: [], segments: [fence] },
    navLinks: [{ a: [0, -1.5], b: [0, 1.5], kind: 'fence', when: 'tut.jump.done', gate: [[-20, 0], [20, 0]] }] });
  let ready = null;
  ctx.bus.on('nav:ready', (p) => { ready = p; });
  const before = ph.findPath({ x: 0, z: -6 }, { x: 0, z: 6 });
  assert.ok(before.partial, 'gated: she walks to the fence and stops');
  assert.ok(before.goal.z < 0 && before.goal.z > -1.5);
  state.setFlag('tut.jump.done', true);
  ctx.bus.emit('story:flag', { key: 'tut.jump.done', value: true });
  assert.equal(ph.nav.gatesClosed, 0);
  const after = ph.findPath({ x: 0, z: -6 }, { x: 0, z: 6 });
  assert.ok(!after.partial && after.links.length === 1 && after.links[0].link === 'fence', 'the fence is hopped after the lesson');
  for (let i = 0; i < 200 && !ready; i++) ph.render();
  assert.ok(ready && ready.level === 'synthetic' && ready.cells === ph.nav.size && ready.links === 1);
  assert.ok(ph.navStats.walk > 0);
  assert.ok(ph.addNavLink({ a: [10, 5], b: [12, 5], kind: 'hop' }));
  assert.equal(ph.nav.openLinks, 2);
  assert.equal(ph.refreshLinks(), 2);
  // runtime links belong to their level: a new level (or the same one reloaded) starts without them
  ph.setLevel(ph.level);
  assert.equal(ph.nav.openLinks, 1, 'the runtime link does not survive setLevel');
  assert.ok(ph.addNavLink({ a: [-10, 5], b: [-12, 5], kind: 'hop' }));
  assert.equal(ph.nav.openLinks, 2, 'only the new runtime link is added (the old level’s one is gone)');
});

test('Physics nav: no level → straight-line fallback', () => {
  const ph = new Physics({ config, actors: new ActorRegistry(), scene: new THREE.Scene(), bus: null });
  ph.setLevel(null);
  const r = ph.findPath({ x: 0, z: 0 }, { x: 3, z: 4 });
  assert.ok(r.ok && r.points.length === 1 && r.links.length === 0);
  assert.ok(ph.navWalkable(1, 1));
});

test('raycast `tops`: the click pick lands on walkable prop tops, never on trunks / walls', () => {
  const ledge = { x: 0, z: 0, hx: 1, hz: 1, y0: -0.5, y1: 1.5 };                 // walkable top at 1.5
  const trunk = { x: 0, z: -4, r: 1, y0: -0.5, y1: 8, walkable: false };          // in front of the camera
  const { ph } = world({ colliders: { circles: [trunk], boxes: [ledge] } });
  // a camera ray from the south-up toward the ledge top centre
  const o = new THREE.Vector3(0, 12, -10), to = new THREE.Vector3(0, 1.5, 0);
  const ray = new THREE.Ray(o, to.clone().sub(o).normalize());
  const plain = ph.raycast(ray, 100, { terrain: true, mesh: true, statics: false });
  assert.ok(plain && plain.kind === 'terrain' && plain.point.y < 0.1, 'without tops the ray passes through to the terrain');
  const hit = ph.raycast(ray, 100, { terrain: true, mesh: true, tops: true });
  assert.ok(hit && hit.kind === 'static' && Math.abs(hit.point.y - 1.5) < 1e-6 && Math.hypot(hit.point.x, hit.point.z) < 1e-6, 'the ledge top');
  // aimed at the trunk's top half: tops ignore the (non-walkable) trunk
  const r2 = new THREE.Ray(o, new THREE.Vector3(0, 4, -4).sub(o).normalize());
  const h2 = ph.raycast(r2, 100, { terrain: true, mesh: true, tops: true });
  assert.ok(h2 && h2.kind !== 'static', 'trunks are not picked');
  assert.ok(ph.findPath({ x: 0, z: -7 }, { x: 0, z: 0 }).points.length > 0);
});

test('authored link endpoints snap to walkable cells; jump landings prefer cells with room all round', () => {
  // a 1.5 m ledge x > 10 whose first cell column is a rim (blocked by a thin lip), an authored hop aimed at the lip
  const g = grid((x) => (x > 10 && x < 10.5 ? { h: 0, ok: false, top: 1.5 } : { h: x > 10 ? 1.5 : 0, ok: true }));
  g.setLinks([{ a: [9.4, 5], b: [10.25, 5], kind: 'hop' }]);
  assert.equal(g.openLinks, 1);
  assert.ok(!g.authored[0].broken, 'b snapped off the blocked lip');
  const r = findPath(g, { x: 2, z: 5 }, { x: 14, z: 5 });
  assert.ok(!r.partial && r.links[0].authored && r.links[0].to.x > 10.5);
  // a 1.0 m wide pad (2 cells) beyond a fence: the auto link lands on its far cell only if it is interior, else the rim
  const pad = grid((x, z) => {
    if (x > 4.6 && x < 5.4) return { h: 0, ok: false, top: 1.0 };
    return flat();
  });
  const p = findPath(pad, { x: 2, z: 10 }, { x: 9, z: 10 });
  const L = p.links[0];
  assert.ok(L && pad.walkable(pad.index(L.to.x - 0.5, L.to.z)) && pad.walkable(pad.index(L.to.x + 0.5, L.to.z)), 'lands with walkable cells either side');
});

test('findPath: she is already the closest she can get → one point, never an empty answer', () => {
  // a 9 m wide river (deep water, too wide to jump) along z 8..17: from the near bank, click mid-river
  const g = grid((x, z) => (z > 8 && z < 17 ? { h: -1, ok: false } : flat()));
  // the click snaps to the near bank (within NAV.snap): her own cell → found, one point
  const own = findPath(g, { x: 5.25, z: 7.75 }, { x: 5.25, z: 9.5 });
  assert.ok(own.ok && own.points.length === 1, `own cell: ${own.points.length} points`);
  assert.ok(Math.hypot(own.points[0].x - 5.25, own.points[0].z - 7.75) < 0.3);
  // no walkable cell within NAV.snap of the click: partial to the A* best node, which is her own cell here
  const mid = findPath(g, { x: 5.25, z: 7.75 }, { x: 5.25, z: 12.5 });
  assert.ok(mid.ok && mid.partial && mid.points.length === 1, `mid-river: ok ${mid.ok} partial ${mid.partial} n ${mid.points.length}`);
  // from farther back she walks to the bank (the best node), not nowhere
  const back = findPath(g, { x: 5.25, z: 2 }, { x: 5.25, z: 12.5 });
  const e = back.points[back.points.length - 1];
  assert.ok(back.partial && back.points.length >= 1 && e.z > 7 && Math.abs(e.x - 5.25) < 0.6, `walks to the bank: ${JSON.stringify(e)}`);
  // a start just off the nav (knocked into the shallows) still paths
  const off = findPath(g, { x: 5.25, z: 10.5 }, { x: 5.25, z: 2 });
  assert.ok(off.ok && !off.partial, 'a start 2.5 m into the water snaps to the bank');
});

// ------------------------------------------------------------------ trap pockets (island audit)
/** Ground at 2 m; a 2 × 2 m pocket at 0 m behind tall walls, its south lip a low ledge she can drop over but not climb. */
function pocketGrid() {
  return grid((x, z) => {
    const inX = x >= 9.5 && x < 11.5, inZ = z >= 9.5 && z < 11.5;
    if (x >= 10 && x < 11 && z >= 10 && z < 11) return { h: 0, ok: true };
    if (inX && inZ) return z < 10 && x >= 10 && x < 11 ? { h: 2, ok: false, top: 2 } : { h: 0, ok: false, top: 10 };
    return { h: 2, ok: true };
  }, 20);
}

test('island audit: a pocket a drop leads into and nothing leads out of is a trap; paths never drop into it', () => {
  const g0 = pocketGrid();
  while (!g0.fill(1000)) { /* */ }
  const into = findPath(g0, { x: 5, z: 5 }, { x: 10.5, z: 10.5 });
  assert.ok(into.links.some((q) => q.link === 'drop'), 'without the audit the path drops into the pocket');
  const g = pocketGrid();
  while (!g.fill(1000)) { /* */ }
  assert.equal(markTraps(g), 1, 'one trap island');
  assert.equal(g.trap[g.index(10.25, 10.25)], 1);
  assert.equal(g.trap[g.index(5, 5)], 0, 'the open ground is not a trap');
  // a click into the pocket: the goal snaps outside it, no drop link
  const r = findPath(g, { x: 5, z: 5 }, { x: 10.5, z: 10.5 });
  assert.ok(r.ok && r.links.every((q) => q.link !== 'drop'), JSON.stringify(r.links));
  assert.ok(g.trap[g.index(r.goal.x, r.goal.z)] === 0, 'the goal is outside the pocket');
  // already in it (walked / knocked in): the path steps out to the nearest cell outside, never an empty answer
  const out = findPath(g, { x: 10.5, z: 10.5 }, { x: 5, z: 5 });
  assert.ok(out.ok && out.unstuck && out.points.length >= 1, JSON.stringify({ ok: out.ok, unstuck: out.unstuck, n: out.points.length }));
  assert.equal(g.trap[g.index(out.points[0].x, out.points[0].z)], 0, 'the first point is outside the pocket');
  // a goal inside the pocket from inside it is still a normal path
  const inside = findPath(g, { x: 10.25, z: 10.25 }, { x: 10.75, z: 10.75 });
  assert.ok(inside.ok && !inside.partial && !inside.unstuck);
});

test('island audit: small islands WITH a way out (a stump, an authored hop) are not traps', () => {
  // a 1 × 1 m stump 0.8 m up: hop on, drop off
  const g = grid((x, z) => (x >= 5 && x < 6 && z >= 5 && z < 6 ? { h: 0.8, ok: true } : flat()), 12);
  while (!g.fill(1000)) { /* */ }
  assert.equal(markTraps(g), 0);
  // a pocket 2 m down whose only way out is an authored hop
  const p = pocketGrid();
  while (!p.fill(1000)) { /* */ }
  p.setLinks([{ a: [10.5, 10.25], b: [10.5, 9.0], kind: 'hop', oneWay: true }]);
  assert.equal(markTraps(p), 0, 'the authored link is a way out');
});

test('Physics nav: a platform ≥ 7 m above clear ground is overhead (the ground is the nav layer); a 6 m ledge and a solid tower stay', () => {
  const bell = { x: 0, z: 0, r: 2.5, y0: 13.5, y1: 14 };              // the bell platform, 14 m up on its own
  const ledge = { x: 8, z: 0, hx: 1.5, hz: 1.5, y0: 5.5, y1: 6 };     // a loft ledge 6 m up
  const tower = { x: -9, z: 0, hx: 1.5, hz: 1.5, y0: 0, y1: 16 };     // a solid 16 m box (walkable top)
  const { ph } = world({ colliders: { circles: [bell], boxes: [ledge, tower] } });
  const at = (x, z) => { const k = ph.nav.index(x, z); return { ok: ph.nav.walkable(k), h: ph.nav.h[k] }; };
  assert.deepEqual(at(0.25, 0.25), { ok: true, h: 0 }, 'under the bell platform: the ground');
  assert.equal(at(8.25, 0.25).h, 6, 'the 6 m ledge keeps its top');
  assert.ok(!at(-9.25, 0.25).ok || at(-9.25, 0.25).h === 16, 'inside the solid tower: never its floor');
  const r = ph.findPath({ x: 0, z: -6 }, { x: 0, z: 6 });
  assert.ok(r.ok && !r.partial && r.links.length === 0, 'walks straight under the platform');
});

test('A*: no hop across an obstacle higher than a fence above HER feet (the side of a stair flight), a ledge lip is fine', () => {
  // ground 0; z 10..10.5 a wall whose top is 1.5 m; beyond it a 1.0 m platform: 1.5 m over her feet is not hoppable
  const side = grid((x, z) => (z >= 10 && z < 10.5 ? { h: 0, ok: false, top: 1.5 } : z >= 10.5 && z < 14 ? { h: 1.0, ok: true } : flat()), 20);
  const r = findPath(side, { x: 5, z: 8 }, { x: 5, z: 12 });
  assert.ok(!r.ok || r.partial || r.links.length === 0 || r.links.every((q) => q.link !== 'hop'), JSON.stringify(r.links));
  // the same 1.0 m platform behind its own 1.1 m lip: a hop
  const lip = grid((x, z) => (z >= 10 && z < 10.5 ? { h: 0, ok: false, top: 1.1 } : z >= 10.5 && z < 14 ? { h: 1.0, ok: true } : flat()), 20);
  const q = findPath(lip, { x: 5, z: 8 }, { x: 5, z: 12 });
  assert.ok(q.ok && !q.partial && q.links.some((l) => l.link === 'hop'), JSON.stringify(q.links));
});

// ------------------------------------------------------------------ unreachable goals (no A* flood to the cap)
test('findPath: a goal on an island she cannot reach snaps to the nearest reachable cell without flooding the grid', () => {
  // 60 × 60 m flat field; a walled yard (3 m walls, 1 m thick) at x, z ∈ [40, 50] and a roof (h 4) at x, z ∈ [10, 16]
  const wall = (x, z) => (x >= 40 && x <= 50 && z >= 40 && z <= 50) && (x < 41 || x > 49 || z < 41 || z > 49);
  const g = grid((x, z) => {
    if (wall(x, z)) return { h: 0, ok: false, top: 3 };
    if (x >= 10 && x <= 16 && z >= 10 && z <= 16) return { h: 4, ok: true };
    return { h: 0, ok: true };
  }, 60);
  while (!g.fill(1000)) { /* */ }
  const from = { x: 2, z: 2 };
  // before the audit: plain A* (floods to the cap on an unreachable goal)
  const raw = findPath(g, from, { x: 45, z: 45 }, { maxExpand: 3000 });
  assert.ok(raw.partial && raw.expansions > 3000, `no audit: plain A* (${raw.expansions})`);
  markTraps(g);
  assert.equal(reachableIslands(g, g.index(from.x, from.z)), null, 'not before the island graph is built');
  let slices = 0;
  while (!buildIslands(g, 0.01)) slices++;
  assert.ok(slices > 1, 'built in slices');
  assert.ok(g.islands && g.islands.count >= 3, 'island graph built');
  const reach = reachableIslands(g, g.index(from.x, from.z));
  assert.ok(reach && reach[g.comp[g.index(from.x, from.z)]] === 1 && reach[g.comp[g.index(45, 45)]] === 0, 'the yard is unreachable');
  for (const goal of [{ x: 45, z: 45 }, { x: 13, z: 13 }]) {
    const r = findPath(g, from, goal, { maxExpand: 3000 });
    assert.ok(r.ok && r.partial && r.snapped, 'partial + snapped');
    assert.ok(r.expansions < 3000, `goal (${goal.x}, ${goal.z}): ${r.expansions} expansions`);
    assert.ok(Math.hypot(r.goal.x - goal.x, r.goal.z - goal.z) < 6, 'ends next to the clicked spot');
    assertWalkable(g, from, r.points);
  }
  // reachable goals are unchanged (not partial, the exact point)
  const ok = findPath(g, from, { x: 30, z: 30 });
  assert.ok(!ok.partial && !ok.snapped && Math.abs(ok.points.at(-1).x - 30) < 1e-6);
  // a stale audit (invalidated grid) is never trusted: plain A* again until the next markTraps
  g.invalidate(20, 20, 21, 21);
  assert.equal(reachableIslands(g, g.index(from.x, from.z)), null);
  markTraps(g); buildIslands(g);
  assert.ok(reachableIslands(g, g.index(from.x, from.z)));
  // the jump-link cache gives the same paths as the per-query scan
  for (let i = 0; i < 30; i++) {
    const goal = { x: 1 + ((i * 37) % 58), z: 1 + ((i * 53) % 58) };
    const cached = findPath(g, from, goal), G = g.islands;
    g.islands = null;
    const scanned = findPath(g, from, goal);
    g.islands = G;
    assert.deepEqual(cached.points.at(-1), scanned.points.at(-1), `goal (${goal.x}, ${goal.z}): same end`);
    if (!cached.snapped) assert.deepEqual(cached.points, scanned.points, `goal (${goal.x}, ${goal.z}): same path`);
  }
  // an open authored link into the yard makes it reachable (directed: hop links work both ways)
  g.setLinks([{ a: [38, 45], b: [45, 45], kind: 'hop' }]);
  assert.equal(reachableIslands(g, g.index(from.x, from.z)), null, 'a link change makes the graph stale');
  markTraps(g); buildIslands(g);
  const inYard = findPath(g, from, { x: 45, z: 45 });
  assert.ok(!inYard.partial && inYard.links.length === 1, 'through the authored link');
});

test('findPath: a big opts.maxExpand never silently drops open nodes (the heap grows)', () => {
  const g = grid(flat, 200);
  const r = findPath(g, { x: 1, z: 1 }, { x: 199, z: 150 }, { maxExpand: 200000, links: false });
  assert.ok(r.ok && !r.partial, 'found across a 400 × 400 cell grid');
});

test('findPath: a click on the near face of a thick wall stays on her side, not a detour round through the gate', () => {
  // a 2.5 m thick, 5 m tall wall along z 10..12.5 with a gate at x 36..40; she stands just south of it at x 4
  const g = grid((x, z) => (z > 10 && z < 12.5 && x < 36 ? { h: 0, ok: false, top: 5 } : flat()), 40);
  const from = { x: 4, z: 8.5 };
  // the pick lands deep in the footprint, nearer its far face: the nearest walkable cell is the far side (a ~70 m walk)
  const to = { x: 5, z: 12 };
  const plain = findPath(g, from, to, { maxExpand: 20000, links: false });
  assert.ok(plain.redirected && plain.goal.z < 10, `redirected to her side (goal z ${plain.goal.z})`);
  assert.ok(len(from, plain.points) < 6, `short path (${len(from, plain.points).toFixed(1)} m)`);
  assertWalkable(g, from, plain.points);
  // with a camera-side hint (the pick ray back toward the lens) it lands on the near face too
  const hinted = findPath(g, from, to, { maxExpand: 20000, toward: { x: 5, z: 2 } });
  assert.ok(hinted.redirected && hinted.goal.z < 10 && Math.abs(hinted.goal.x - 5) < 1);
  // standing on the far side, the same click keeps the (short) nearest snap
  const far = findPath(g, { x: 4, z: 15 }, to, { maxExpand: 20000 });
  assert.ok(!far.redirected && far.goal.z > 12.5);
  // a click well past the wall on open ground is a real destination: the long way round is kept
  const real = findPath(g, from, { x: 5, z: 16 }, { maxExpand: 20000 });
  assert.ok(!real.redirected && !real.partial && real.goal.z > 12.5);
});
