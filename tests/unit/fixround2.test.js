// tests/unit/fixround2.test.js — TT2 fix round 2: the in-place lesson ring (§10.10 #3), the trail's path remainder near
// a fence, the edge coin kept off Clem, the barn-chest stand spot and the same-origin embed host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_TRAIL, GuideTrail, ringPrints, ringWanted, ringArrived } from '../../src/fx/GroundDecals.js';
import { clearOf, resolveGuide, BEACON } from '../../src/ui/beacon.js';
import { withSameOrigin, parseOrigins, DEFAULT_EMBED_ORIGINS } from '../../src/core/embed.js';
import { RING_R } from '../../src/story/tutorial.js';

test('ring mode: ringN prints round the object, toes in, the last one on her side', () => {
  const ring = { x: 0, z: 0, r: 1.3 };
  const out = ringPrints({ x: 0, z: 5 }, ring);
  assert.equal(out.length, GUIDE_TRAIL.ringN);
  for (const q of out) assert.ok(Math.abs(Math.hypot(q.x, q.z) - 1.3) < 1e-9, 'on the circle');
  const last = out[out.length - 1];
  assert.ok(Math.abs(last.x) < 1e-9 && Math.abs(last.z - 1.3) < 1e-9, 'her side last (the stand spot)');
  assert.ok(Math.abs(out[0].z + 1.3) < 1e-9, 'the far side first');
  // toes toward the centre: (sin yaw, cos yaw) points from the print to the ring centre
  for (const q of out) { const d = Math.hypot(q.x, q.z); assert.ok(Math.abs(Math.sin(q.yaw) + q.x / d) < 1e-9 && Math.abs(Math.cos(q.yaw) + q.z / d) < 1e-9); }
  assert.ok(RING_R.dummy > 0.5);
});

test('ring mode: on within arriveR + ringNear of a ring target, "arrived" only inside arriveR', () => {
  const g = { on: true, trail: true, x: 0, z: 1.3, arriveR: 0.3, ring: { x: 0, z: 0, r: 1.3 } };
  assert.equal(ringWanted(g, { x: 0, z: 1.3 }), true);
  assert.equal(ringArrived(g, { x: 0, z: 1.3 }), true);
  assert.equal(ringWanted(g, { x: 0, z: 2.5 }), true, 'close: the ring shows (a path this short draws no prints)');
  assert.equal(ringArrived(g, { x: 0, z: 2.5 }), false, 'not there yet: the ring print on her side is the spot');
  assert.equal(ringWanted(g, { x: 0, z: 1.3 + 0.3 + GUIDE_TRAIL.ringNear + 0.2 }), false, 'far: the path trail leads');
  assert.equal(ringWanted({ ...g, on: false }, { x: 0, z: 1 }), false);
  assert.equal(ringWanted({ ...g, trail: false }, { x: 0, z: 1 }), false);
  assert.equal(ringWanted({ ...g, ring: null }, { x: 0, z: 1 }), false);
});

test('GuideTrail: in ring mode the prints stay drawn and lit while she stands in arriveR', () => {
  const tr = new GuideTrail({ physics: null });
  tr.set({ on: true, hard: false, trail: true, id: 'tut.parry', x: 0, z: 1.3, arriveR: 0.3, ring: { x: 0, z: 0, r: 1.3 } });
  for (let i = 0; i < 20; i++) tr.update(1 / 30, { x: 0, y: 0, z: 1.3 }, true);
  const added = [];
  tr.draw({ _gy: () => 0, _add: (...a) => added.push(a) }, 1 / 30, 0);
  assert.equal(tr.drawn.length, GUIDE_TRAIL.ringN);
  assert.ok(tr.drawn.every((d) => d.lit), 'all lit');
});

test('GuideTrail: round a fence the nearest prints are not hidden as "passed" (path remainder, not straight distance)', () => {
  const tr = new GuideTrail({ physics: null });
  // the Q1 bot's barn-chest case: her at (-13.5, -84.3), the chest stand 4.5 m south past the practice fence's hop
  tr.set({ on: true, hard: false, trail: true, id: 'prologue.suit', x: -12.85, z: -88.75, arriveR: 1.6 });
  const P = [[-13.9, -85.444, 5.54], [-14.42, -86.518, 4.34], [-14.08, -87.718, 3.14], [-14.842, -88.602, 1.94]];
  tr._route = function () { this.prints.length = 0; for (const [x, z, rem] of P) this.prints.push({ x, z, yaw: 0, rem }); };
  for (let i = 0; i < 5; i++) tr.update(1 / 30, { x: -13.5, y: 0, z: -84.3 }, true);
  tr.draw({ _gy: () => 0, _add: () => {} }, 1 / 30, 0);
  assert.equal(tr.drawn.length, 4, 'every print of the detour is drawn');
});

test('the edge coin slides along its border until it is clear of Clem', () => {
  const W = 844, H = 390, m = BEACON.edgeMarginPhone;
  const p = clearOf({ x: 380, y: H - m }, 375, 300, BEACON.clemClear, W, H, m);
  assert.equal(p.y, H - m, 'stays on the bottom border');
  assert.ok(Math.hypot(p.x - 375, p.y - 300) >= BEACON.clemClear - 1e-6);
  const side = clearOf({ x: W - m, y: 200 }, W - m - 10, 210, BEACON.clemClear, W, H, m);
  assert.equal(side.x, W - m, 'stays on the right border');
  assert.ok(Math.hypot(side.x - (W - m - 10), side.y - 210) >= BEACON.clemClear - 1e-6);
  const far = clearOf({ x: 100, y: H - m }, 600, 100, BEACON.clemClear, W, H, m);
  assert.deepEqual(far, { x: 100, y: H - m }, 'already clear: untouched');
});

test('resolveGuide carries a lesson ring from story.guideTarget()', () => {
  const out = {};
  resolveGuide({ story: { guideTarget: () => ({ id: 'tut.bonk', x: 0, z: -76, arriveR: 1.6, textKey: 'tut.bonk', kind: 'lesson', ring: { x: 0, z: -76, r: 1 } }) } }, null, null, out);
  assert.deepEqual(out.ring, { x: 0, z: -76, r: 1 });
  resolveGuide({ story: { guideTarget: () => ({ id: 'meadow.mochi', x: -14, z: -41, arriveR: 1.4, kind: 'quest' }) } }, null, null, out);
  assert.equal(out.ring, null);
});

test('embed: a same-origin parent adds the page origin to the allowlist; a cross-origin one does not', () => {
  const allowed = parseOrigins(DEFAULT_EMBED_ORIGINS);
  const own = 'http://localhost:3021';
  const same = { location: { origin: own }, parent: { location: { origin: own } } };
  assert.ok(withSameOrigin(allowed, same).includes(own));
  assert.equal(withSameOrigin(allowed, same).length, allowed.length + 1);
  const cross = { location: { origin: own }, parent: { get location() { throw new Error('SecurityError'); } } };
  assert.deepEqual(withSameOrigin(allowed, cross), allowed);
  const other = { location: { origin: own }, parent: { location: { origin: 'https://evil.example' } } };
  assert.deepEqual(withSameOrigin(allowed, other), allowed);
  const opaque = { location: { origin: 'null' }, parent: { location: { origin: 'null' } } };
  assert.deepEqual(withSameOrigin(allowed, opaque), allowed);
});
