// tests/unit/guidance.test.js  (owner: ui, package G1) — TOKENTAILS-PLAN §10.2 / §10.10 (7): the Pink Paw guidance.
// beaconState in practice, the guide target sources, the trail routing round the practice fence (read-only NavGrid use),
// the arriveR auto-hide, scenes and the guideTrail setting, the objective line, the camera look-ahead constants and the
// Photo Cam block. Pure modules only (a synthetic Physics world, as tests/unit/nav.test.js builds it).
// TT3 R3: the edge coin tap is a move order toward the guide; phone toasts / objective line / guide bubble placement;
// the dead old-beacon CSS is gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { Heightfield } from '../../src/physics/Heightfield.js';
import { Physics } from '../../src/physics/Physics.js';
import * as config from '../../src/core/config.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { GameState } from '../../src/core/GameState.js';
import { EventBus } from '../../src/core/EventBus.js';
import { beaconState, resolveGuide, guideHidden, clipObjective, dodgeRects, isPhone, BEACON } from '../../src/ui/beacon.js';
import { GUIDE_TRAIL, GuideTrail, trailPrints, printLit, trailWanted } from '../../src/fx/GroundDecals.js';
import { GUIDE_LOOK, photoCamBlocked } from '../../src/camera/FollowCamera.js';

/** A flat 40 × 40 m synthetic world with box colliders (nav.test.js's `world`). */
function world(boxes) {
  const state = new GameState();
  const ctx = { config, actors: new ActorRegistry(), scene: new THREE.Scene(), bus: new EventBus(), state, params: { test: true }, game: { mode: 'play' } };
  const ph = new Physics(ctx);
  ctx.physics = ph;
  const level = { id: 'synthetic', heightfield: Heightfield.fromFunction(40, 40, () => 0), colliders: { circles: [], boxes }, octreeMeshes: [], root: new THREE.Group(),
    bounds: { min: { x: -20, y: -20 }, max: { x: 20, y: 20 } } };
  ph.init();
  ph.setLevel(level);
  let n = 0;
  while ((!ph.nav.filled || !ph.nav.islands || ph.nav.islandBuild) && n++ < 5000) ph.render();
  return { ctx, ph };
}

/** A spec as beacon.js feeds it to the trail. */
const spec = (o = {}) => ({ on: true, hard: false, dim: false, reduced: false, touch: false, trail: true, id: 'tut.move', x: 0, y: 0, z: 0, arriveR: 2.2, ...o });
/** Run the trail for `sec` seconds of 60 Hz frames with her at `her`. */
function run(tr, her, sec, live = true) { for (let i = 0; i < Math.round(sec * 60); i++) tr.update(1 / 60, her, live); }
/** A fake decal batch: records what draw() adds. */
const sink = () => ({ adds: [], _gy: () => 0, _add(...a) { this.adds.push(a); } });

test('G1 §10.10 7: beaconState with practice is not off; scenes, bosses and arrival hide it', () => {
  const base = { world: true, has: true, boss: false, practice: true, dist: 10, arriveR: 2.2 };
  assert.equal(beaconState(base), 'on', 'practice is guided');
  assert.equal(beaconState({ ...base, scene: true }), 'off');
  assert.equal(beaconState({ ...base, boss: true }), 'off');
  assert.equal(beaconState({ ...base, dist: 2.1 }), 'off', 'inside arriveR');
  assert.equal(beaconState({ ...base, dist: 2.3 }), 'on');
  assert.equal(beaconState({ ...base, arriveR: undefined, dist: BEACON.arriveR - 0.1 }), 'off', 'quest default radius');
});

test('G1 §10.7: the guide target comes from story.guideTarget(), else the practice lesson, else the quest step', () => {
  const out = {};
  const ctx = { player: { pos: { x: 0, y: 0, z: -66 } }, story: { guideTarget: () => ({ id: 'move', x: 0, z: -76, arriveR: 2.2, textKey: 'tut.move', kind: 'lesson', speaker: 'pearl' }) } };
  resolveGuide(ctx, null, null, out);
  assert.equal(out.src, 'story'); assert.ok(out.has && out.pos); assert.deepEqual([out.x, out.z, out.arriveR, out.kind, out.textKey], [0, -76, 2.2, 'lesson', 'tut.move']);
  // no guideTarget yet: the running lesson's demo point (practice target active)
  const step = { id: 'move', textKey: 'tut.move', guide: 'pearl' };
  const tut = { active: true, log: { step }, _demoTarget: () => [0, 0.2, -76] };
  resolveGuide({ player: ctx.player, story: { tutorial: tut } }, null, null, out);
  assert.equal(out.src, 'tutorial'); assert.ok(out.has && out.pos, 'practice lesson target'); assert.equal(out.id, 'tut.move'); assert.equal(out.kind, 'lesson');
  assert.deepEqual([out.x, out.y, out.z, out.arriveR], [0, 0.2, -76, GUIDE_TRAIL.arriveR]);
  // a lesson whose demo point is her own spot (Stand): an objective line, no place to go
  const at = { active: true, log: { step: { id: 'stand', textKey: 'tut.stand' } }, _demoTarget: () => [0, 0, -66] };
  resolveGuide({ player: ctx.player, story: { tutorial: at } }, null, null, out);
  assert.ok(out.has && !out.pos);
  // the quest step (a zone)
  const q = { levels: { current: { def: { zones: [{ id: 'cart', at: [-14, -41] }] } } } };
  resolveGuide(q, 'meadow.mochi', 'Help Mochi', out);
  assert.equal(out.src, 'quest'); assert.ok(out.pos); assert.equal(out.arriveR, BEACON.arriveR); assert.equal(out.text, 'Help Mochi');
  resolveGuide({}, null, null, out);
  assert.ok(!out.has && !out.pos, 'nothing to guide to');
  // a throwing owner API is ignored
  resolveGuide({ story: { guideTarget: () => { throw new Error('mid-load'); } } }, null, null, out);
  assert.ok(!out.has);
});

test('G1 §10.2.2: the paw prints alternate 1.2 m apart along the path, none on the goal, ≤ 14', () => {
  const pts = trailPrints({ x: 0, z: 0 }, [{ x: 0, z: 30 }]);
  assert.equal(pts.length, GUIDE_TRAIL.max);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.abs(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) - Math.hypot(2 * GUIDE_TRAIL.side, GUIDE_TRAIL.gap)) < 1e-6, 'gap');
    assert.ok(Math.sign(pts[i].x) === -Math.sign(pts[i - 1].x), 'left / right');
    assert.ok(pts[i].rem < pts[i - 1].rem);
  }
  const short = trailPrints({ x: 0, z: 0 }, [{ x: 0, z: 4 }]);
  assert.ok(short.every((q) => q.rem >= GUIDE_TRAIL.endGap), 'no print on the target');
  assert.equal(short.length, 2);
  // light-up: from her outward 0.12 s apart; closing in keeps the first 3 lit; reduced motion is static
  assert.ok(printLit(0, 0.01, false, false) && !printLit(1, 0.01, false, false) && printLit(1, 0.13, false, false));
  assert.ok(!printLit(0, GUIDE_TRAIL.cycle - 0.1, false, false), 'the cycle dims before it relights');
  assert.deepEqual([0, 1, 2, 3].map((k) => printLit(k, 0, true, false)), [true, true, true, false]);
  assert.ok([0, 5, 13].every((k) => printLit(k, 2.4, false, true)));
  assert.ok(GUIDE_TRAIL.max <= 14 && GUIDE_TRAIL.gap === 1.2 && GUIDE_TRAIL.arriveR === 2.2 && GUIDE_TRAIL.touchMul === 1.3);
  assert.deepEqual([GUIDE_TRAIL.pad, GUIDE_TRAIL.bean, GUIDE_TRAIL.rim], ['#F3EEE6', '#FF7AA2', '#4A1D08'], 'Token Tails paw colours');
});

/** Where the hops between consecutive prints (from her) cross the line z = fz inside x ∈ (x0, x1). */
function crossings(her, prints, fz, x0, x1) {
  const out = [];
  let px = her.x, pz = her.z;
  for (const q of prints) {
    if ((pz - fz) * (q.z - fz) < 0) { const x = px + ((fz - pz) / (q.z - pz)) * (q.x - px); if (x > x0 && x < x1) out.push(x); }
    px = q.x; pz = q.z;
  }
  return out;
}

test('G1 §10.10 7: the trail routes round the practice fence (z −87, x −20…−2), or over it only where the nav hops it', () => {
  // the practice field in local coordinates (z + 80): the inner fence at z −7 from the west border to x −2
  const her = { x: -10, y: 0, z: -3 };
  // a fence she cannot hop (2 m): the trail goes round its east end, never through it
  const wall = { x: -11, z: -7, hx: 9, hz: 0.1, y0: 0, y1: 2.0, walkable: false };
  const w = world([wall]);
  const navBefore = w.ph.nav.version ?? null;
  const tr = new GuideTrail(w.ctx);
  tr.set(spec({ x: -10, z: -11 }));
  run(tr, her, 0.1);
  assert.ok(tr.prints.length >= 6, `prints along the detour (${tr.prints.length})`);
  assert.deepEqual(crossings(her, tr.prints, wall.z, -20, -2 + 0.25), [], 'no print hop crosses the fence span');
  assert.ok(tr.prints.some((q) => q.x > -2), `round the east end (max x ${Math.max(...tr.prints.map((q) => q.x)).toFixed(2)})`);
  assert.equal(w.ph.nav.version ?? null, navBefore, 'the nav grid is read, not changed');
  // the real 1.0 m practice fence is a hop (an open nav link, TT2 §10.3): the trail crosses it only where the path hops
  const fence = { ...wall, y1: 1.0 };
  const f = world([fence]);
  const trf = new GuideTrail(f.ctx);
  trf.set(spec({ x: -10, z: -11 }));
  run(trf, her, 0.1);
  const hops = (f.ph.findPath(her, { x: -10, z: -11 }).points ?? []).filter((q) => q.link);
  const xs = crossings(her, trf.prints, fence.z, -20, -2 + 0.25);
  assert.ok(xs.every((x) => hops.some((h) => Math.abs(h.x - x) < 1.2)), `crossings ${xs.map((x) => x.toFixed(1))} at the hop links ${hops.map((h) => h.x.toFixed(1))}`);
});

test('G1 §10.2.4: inside arriveR the trail fades out within 0.5 s; scenes hide it at once; guideTrail off hides only the trail', () => {
  const tr = new GuideTrail({});
  const far = { x: 0, y: 0, z: 0 };
  tr.set(spec({ x: 0, z: 12 }));
  run(tr, far, 0.6);
  assert.equal(tr.vis, 1, 'shown');
  const d = sink();
  assert.ok(tr.draw(d, 1 / 60, 0) >= 3, 'prints drawn');
  assert.ok(d.adds.every((a) => a[0] === 6 && a[12] === 1 && a[6] === GUIDE_TRAIL.bean), 'DECAL.PAW with the Token Tails print flag');
  // she arrives (inside the default 2.2 m)
  run(tr, { x: 0, y: 0, z: 10.5 }, 0.45);
  assert.equal(tr.vis, 0, 'faded within 0.5 s');
  assert.equal(tr.draw(sink(), 1 / 60, 0), 0);
  // back out, then a cutscene / blocking dialogue: ui sends `hard` → gone this frame
  run(tr, far, 0.5);
  assert.equal(tr.vis, 1);
  tr.set(spec({ x: 0, z: 12, on: false, hard: true }));
  tr.update(1 / 60, far, true);
  assert.equal(tr.vis, 0, 'hidden at once');
  // not drawn outside play (cutscene mode: decals not live)
  tr.set(spec({ x: 0, z: 12 }));
  run(tr, far, 0.5);
  tr.update(1 / 60, far, false);
  assert.equal(tr.vis, 0);
  // settings.guideTrail === false: no trail
  assert.equal(trailWanted(spec({ trail: false }), 10), false);
  assert.equal(trailWanted(spec(), 10), true);
  assert.equal(trailWanted(spec(), 2.0), false);
  assert.equal(trailWanted(null, 10), false);
  tr.set(spec({ x: 0, z: 12, trail: false }));
  run(tr, far, 0.5);
  assert.equal(tr.vis, 0, 'guideTrail off');
  // an ordinary fight dims it to 35 %
  tr.set(spec({ x: 0, z: 12, dim: true }));
  run(tr, far, 2.4);
  const dd = sink();
  tr.draw(dd, 1 / 60, 0);
  assert.ok(dd.adds.length && dd.adds.every((a) => a[7] <= GUIDE_TRAIL.dim + 1e-6), 'dimmed');
  // touch: 1.3× prints
  tr.set(spec({ x: 0, z: 12, touch: true }));
  run(tr, far, 0.3);
  const dt = sink();
  tr.draw(dt, 1 / 60, 0);
  assert.ok(dt.adds.some((a) => a[4] > GUIDE_TRAIL.r * 1.2), 'bigger on touch');
});

test('G1: guideHidden reads scenes defensively; the objective line is ≤ 40 characters; phone layout', () => {
  assert.equal(guideHidden({ game: { mode: 'play' } }), false);
  assert.equal(guideHidden({ game: { mode: 'play' }, story: { sceneActive: true } }), true, 'story.sceneActive');
  assert.equal(guideHidden({ game: { mode: 'dialog' } }), true);
  assert.equal(guideHidden({ game: { mode: 'cutscene' } }), true);
  assert.equal(guideHidden({ game: { mode: 'play' }, ui: { overlay: { letterboxOn: true } } }), true, 'letterbox (G-01 close-up)');
  assert.equal(guideHidden({ game: { mode: 'play' }, ui: { results: { open: true } } }), true, 'results card');
  assert.equal(guideHidden(null), false);
  assert.equal(clipObjective('Race Pearl to the dummy!'), 'Race Pearl to the dummy!');
  const long = clipObjective('Follow the pink paw prints all the way to the old barn chest by the gate');
  assert.ok(long.length <= 40 && long.endsWith('…'), long);
  assert.equal(isPhone('touch', 1280, 720), true);
  assert.equal(isPhone('kbm', 844, 390), true);
  assert.equal(isPhone('kbm', 1280, 720), false);
  // the edge coin slides off the ability bar
  const bar = [{ x: 440, y: 640, w: 400, h: 70 }];
  const p = dodgeRects({ x: 640, y: 720 - BEACON.edgeMargin }, bar, 1280, 720);
  assert.ok(p.x < 440 - BEACON.edgePad + 1 || p.x > 840 + BEACON.edgePad - 1, `clear of the bar (${p.x})`);
});

test('G1 §10.2.7 / §10.2.12: look-ahead constants live in FollowCamera.js; the Photo Cam is held off through onboarding', () => {
  assert.deepEqual({ ...GUIDE_LOOK }, { max: 2.5, ease: 0.6, release: 6, near: 1.2 });
  const cfg = fs.readFileSync(new URL('../../src/core/config.js', import.meta.url), 'utf8');
  assert.ok(!/GUIDE_LOOK|guideLook/.test(cfg), 'not in core/config.js');
  const done = { prologueDone: true, onboardDone: true, practice: false, tutorial: false, guideKind: 'quest', guideHas: true, meadow: true };
  assert.equal(photoCamBlocked(done), false, 'after onboarding a quest target does not block it');
  assert.equal(photoCamBlocked({ ...done, tutorial: true }), true, 'practice');
  assert.equal(photoCamBlocked({ ...done, practice: true }), true);
  assert.equal(photoCamBlocked({ ...done, prologueDone: false }), true, 'the prologue');
  assert.equal(photoCamBlocked({ ...done, prologueDone: false, meadow: false }), false, 'not the prologue level');
  assert.equal(photoCamBlocked({ ...done, onboardDone: false, guideKind: 'lesson' }), true, 'an onboarding target');
  assert.equal(photoCamBlocked({ ...done, onboardDone: false, guideHas: false }), false);
});

test('G1 §10.4: speech bubbles draw in Nunito 700 / 800, never Fredoka', async () => {
  const B = await import('../../src/companions/Bubble.js');
  assert.match(B.BUBBLE_FONT, /^"Nunito"/);
  assert.ok(!/Fredoka/.test(B.BUBBLE_FONT));
  assert.deepEqual({ ...B.BUBBLE_WEIGHT }, { text: 700, zzz: 800 });
  const src = fs.readFileSync(new URL('../../src/companions/Bubble.js', import.meta.url), 'utf8');
  assert.ok(!/Fredoka/.test(src), 'no Fredoka in the canvas font strings');
});

// ------------------------------------------------------------------ TT3 R3: phone toasts, edge-coin taps, dead beacon CSS

/** A just-enough DOM element for Beacon's constructor (no window: dom.js hasDom() stays false, no style injection). */
function fakeEl(tag = 'div') {
  const e = {
    tagName: tag.toUpperCase(), className: '', children: [], listeners: {}, style: { setProperty() {}, removeProperty() {} }, innerHTML: '',
    classList: { set: new Set(), toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); }, contains(c) { return this.set.has(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } },
    setAttribute() {}, appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, remove() {},
    querySelector() { return fakeEl(); }, addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }, removeEventListener() {},
  };
  return e;
}

test('TT3 R3: a tap / click on the edge coin issues a move order toward beacon.guide (the ground order path)', async () => {
  const had = globalThis.document;
  globalThis.document = { createElement: (t) => fakeEl(t) };
  try {
    const { Beacon, edgeOrder } = await import('../../src/ui/beacon.js');
    const orders = [];
    const ctx = {
      bus: new EventBus(), game: { mode: 'play' }, story: {}, ui: {},
      physics: { topAt: () => 0.4, heightAt: () => 0.4 },
      player: { pos: { x: 0, y: 0, z: -70 }, orders: { order: (kind, pt, o) => { orders.push({ kind, pt: { ...pt }, o }); return true; } } },
    };
    const b = new Beacon(ctx, fakeEl());
    Object.assign(b.guide, { has: true, pos: true, id: 'tut.move', kind: 'lesson', x: 0, y: NaN, z: -76 });
    const down = (pointerType) => { let stopped = false, prevented = false; for (const fn of b.edge.listeners.pointerdown ?? []) fn({ pointerType, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }); return { stopped, prevented }; };
    // hidden coin: the tap is not the coin's
    down('touch');
    assert.equal(orders.length, 0, 'no order while the coin is not shown');
    b.root.classList.add('is-on'); b.edge.classList.add('is-on');
    const ev = down('touch');
    assert.equal(orders.length, 1, 'one order per tap');
    assert.equal(orders[0].kind, 'move');
    assert.deepEqual([orders[0].pt.x, orders[0].pt.z], [b.guide.x, b.guide.z], 'toward the guide target');
    assert.equal(orders[0].pt.y, 0.4, 'at the ground height there');
    assert.equal(orders[0].o.source, 'touch');
    assert.ok(ev.stopped && ev.prevented, 'the coin keeps its tap (no second order from the layers under it)');
    assert.equal(b.lastEdgeOrder, true);
    down('mouse');
    assert.equal(orders.at(-1).o.source, 'mouse', 'a click / right-click is a mouse order');
    // no order in a scene, without a positioned target, or outside play
    ctx.game.mode = 'dialog';
    assert.equal(edgeOrder(ctx, b.guide), false);
    ctx.game.mode = 'play'; ctx.story.sceneActive = true;
    assert.equal(edgeOrder(ctx, b.guide), false);
    ctx.story.sceneActive = false;
    assert.equal(edgeOrder(ctx, { ...b.guide, pos: false }), false);
    assert.equal(edgeOrder(ctx, b.guide), true);
    // without Orders the player's own order() is used
    const calls = [];
    assert.equal(edgeOrder({ ...ctx, player: { pos: ctx.player.pos, order: (k, pt, o) => { calls.push([k, pt.x, pt.z, o.source]); return true; } } }, b.guide, 'touch'), true);
    assert.deepEqual(calls, [['move', 0, -76, 'touch']]);
    b.dispose?.();
  } finally { if (had === undefined) delete globalThis.document; else globalThis.document = had; }
});

test('fix round 1: a tap / click on a tapMove badge (Sir Wobble\'s stand spot) is a plain move order to the guide point; other badges stay click-through', async () => {
  const had = globalThis.document;
  globalThis.document = { createElement: (t) => fakeEl(t) };
  try {
    const { Beacon } = await import('../../src/ui/beacon.js');
    const orders = [];
    const ctx = {
      bus: new EventBus(), game: { mode: 'play' }, story: {}, ui: {},
      physics: { topAt: () => 0.2, heightAt: () => 0.2 },
      player: { pos: { x: 0, y: 0, z: -80 }, orders: { order: (kind, pt, o) => { orders.push({ kind, pt: { ...pt }, o }); return true; } } },
    };
    const b = new Beacon(ctx, fakeEl());
    assert.ok(b.badge, 'the badge element is found');
    Object.assign(b.guide, { has: true, pos: true, tapMove: true, id: 'tut.stand', kind: 'lesson', x: 0, y: NaN, z: -84.7 });
    const down = (pointerType) => { let stopped = false; for (const fn of b.badge.listeners.pointerdown ?? []) fn({ pointerType, preventDefault() {}, stopPropagation() { stopped = true; } }); return stopped; };
    down('touch');
    assert.equal(orders.length, 0, 'no order while the badge is not shown');
    b.root.classList.add('is-on'); b.marker.classList.add('is-on');
    assert.ok(down('touch'), 'the badge keeps its tap (the canvas never picks the actor under it)');
    assert.equal(orders.length, 1);
    assert.equal(orders[0].kind, 'move', 'a move order, not attack / use');
    assert.deepEqual([orders[0].pt.x, orders[0].pt.z], [0, -84.7]);
    assert.equal(orders[0].o.source, 'touch');
    const css = fs.readFileSync(new URL('../../src/ui/guidance.css', import.meta.url), 'utf8');
    assert.match(css, /\.bc-marker\.is-on\.is-tap \.bc-badge \{ pointer-events: auto/);
    // a badge without tapMove (Mochi's cage, the dummy) never swallows the click: it reaches the thing under it
    b.guide.tapMove = false;
    assert.equal(down('mouse'), false, 'click-through');
    assert.equal(orders.length, 1);
    // resolveGuide carries the flag from story.guideTarget()
    const out = {};
    resolveGuide({ story: { guideTarget: () => ({ id: 'tut.stand', x: 0, z: -84.7, arriveR: 0.25, textKey: 'tut.stand', kind: 'lesson', tapMove: true }) } }, null, null, out);
    assert.equal(out.tapMove, true);
    resolveGuide({ story: { guideTarget: () => ({ id: 'meadow.mochi', x: -14, z: -41, arriveR: 1.4, textKey: 'onb.mochi', kind: 'quest' }) } }, null, null, out);
    assert.equal(out.tapMove, false);
    b.dispose?.();
  } finally { if (had === undefined) delete globalThis.document; else globalThis.document = had; }
});

test('TT3 R3: phone toasts sit clear of the middle third (landscape) and short of the Skip chip (portrait)', async () => {
  const { phoneToastBox, TOAST_PHONE } = await import('../../src/ui/hud.js');
  for (const [W, H] of [[844, 390], [568, 320], [932, 430], [667, 375]]) {
    const b = phoneToastBox({ W, H, top: 98 });
    assert.ok(b.x >= TOAST_PHONE.gutter, `${W}×${H}: inside the gutter`);
    assert.ok(b.x + b.w <= W / 3, `${W}×${H}: right edge ${b.x + b.w} short of the middle third (${W / 3})`);
    assert.equal(b.y, 98 + TOAST_PHONE.gap, 'under the HUD block');
    const l = phoneToastBox({ W, H, top: 98, lefty: true });
    assert.ok(l.x >= (2 * W) / 3 && l.x + l.w <= W - TOAST_PHONE.gutter + 0.5 && l.right, `${W}×${H}: mirrored for left-handed play`);
  }
  const chip = { x: 260, y: 92, w: 114, h: 44 };
  const p = phoneToastBox({ W: 390, H: 844, top: 124, chip });
  assert.equal(p.x, 16);
  assert.ok(p.x + p.w <= chip.x - TOAST_PHONE.gap, `portrait: short of the Skip chip (${p.x + p.w})`);
  assert.equal(phoneToastBox({ W: 390, H: 844, top: 124 }).w, 390 - 32, 'full width without the chip');
  assert.equal(phoneToastBox({ W: 390, H: 844, top: 300, chip }).w, 390 - 32, 'a chip above the band does not narrow it');
});

test('TT3 R3: the portrait guide bubble and toast stack keep off Clem; the objective line dodges the ❚❚ and the chip', async () => {
  const { bubbleTop, toastCap, pillPlace, TOAST_PHONE } = await import('../../src/ui/hud.js');
  // Clem at y 218 (the look-ahead lifts her): the bubble that would sit at 150 goes under her
  const t = bubbleTop({ base: 150, h: 71, clemTop: 178, clemBottom: 248, floor: 140, ceil: 454 });
  assert.ok(t >= 248, `under her (${t})`);
  assert.ok(t + 71 <= 454, 'above the touch clusters');
  // no overlap: unchanged
  assert.equal(bubbleTop({ base: 150, h: 71, clemTop: 284, clemBottom: 354, floor: 140, ceil: 454 }), 150);
  // room above her: above
  assert.equal(bubbleTop({ base: 300, h: 71, clemTop: 420, clemBottom: 490, floor: 120, ceil: 800 }), 300);
  const up = bubbleTop({ base: 380, h: 71, clemTop: 420, clemBottom: 490, floor: 120, ceil: 520 });
  assert.ok(up + 71 <= 420 && up >= 120, `above her when below does not fit (${up})`);
  // nowhere free: stays (never off screen)
  assert.equal(bubbleTop({ base: 150, h: 71, clemTop: 170, clemBottom: 240, floor: 160, ceil: 260 }), 150);
  assert.equal(bubbleTop({ base: 150, h: 71, clemTop: NaN, clemBottom: NaN, floor: 0, ceil: 800 }), 150, 'Clem off screen');
  // the toast stack: only as deep as fits above her, never fewer than one
  assert.equal(toastCap(NaN), TOAST_PHONE.visible);
  assert.equal(toastCap(20), 1);
  assert.equal(TOAST_PHONE.visible, 1, 'TT5: one toast at a time on a phone');
  assert.equal(toastCap(2 * TOAST_PHONE.toastH + TOAST_PHONE.pad), 1);
  assert.equal(toastCap(999), TOAST_PHONE.visible);
  // the objective line under the hearts (portrait 390×844): it sat over the ❚❚ and the Skip chip
  const rects = [{ x: 8, y: 8, w: 152, h: 60 }, { x: 166, y: 10, w: 58, h: 56 }, { x: 280, y: 734, w: 84, h: 84 }];
  const at = pillPlace({ x: 74, y: 36, pw: 263, ph: 33, H: 844, rects, chip: { x: 260, y: 92, w: 114, h: 44 }, left: 8, leftBottom: 68 });
  assert.ok(at.y >= 66, `below the ❚❚ (${at.y})`);
  assert.equal(at.x, 8, 'from the HUD block\'s left edge once below the portrait');
  assert.ok(at.maxW != null && at.x + at.maxW <= 260 - 6, `short of the chip (${at.maxW})`);
  // landscape 844×390: nothing in its way, unchanged
  const land = pillPlace({ x: 89, y: 49, pw: 263, ph: 33, H: 390, rects: [{ x: 16, y: 14, w: 226, h: 64 }, { x: 394, y: 10, w: 56, h: 56 }], chip: { x: 707, y: 64, w: 121, h: 44 }, left: 16, leftBottom: 98 });
  assert.deepEqual(land, { x: 89, y: 49, maxW: null });
});

test('TT5: a phone shows 1 toast at a time (a touch tablet 2); a lowered cap sends the newest back to the queue', async () => {
  const { ToastQueue, phoneToasts, TOAST_PHONE_VISIBLE } = await import('../../src/ui/toasts.js');
  const { TOAST_PHONE } = await import('../../src/ui/hud.js');
  assert.equal(TOAST_PHONE_VISIBLE, TOAST_PHONE.visible, 'one number in both files');
  assert.equal(TOAST_PHONE_VISIBLE, 1);
  assert.equal(phoneToasts('touch', 1280, 800), false, 'a touch tablet is not a phone (2 toasts)');
  assert.equal(phoneToasts('touch', 390, 844), true);
  assert.equal(phoneToasts('kbm', 844, 390), true);
  assert.equal(phoneToasts('kbm', 1280, 720), false);
  const q = new ToastQueue({ visible: 3 });
  q.push('a'); q.push('b'); q.push('c');
  assert.equal(q.shown.length, 3);
  q.cfg.visible = 1;
  const off = q.shed();
  assert.deepEqual(off.map((t) => t.text), ['c', 'b']);
  assert.deepEqual(q.shown.map((t) => t.text), ['a']);
  assert.deepEqual(q.waiting.map((t) => t.text), ['b', 'c'], 'they keep their order');
  q.update(q.cfg.life + 0.01);
  assert.deepEqual(q.shown.map((t) => t.text), ['b'], 'the next one comes up when the first goes');
});

test('TT3 R3: the old DOM paw-trail / gold-paw beacon CSS is gone; the shown edge coin takes taps; tucked HUD parts pass them', () => {
  const ui = fs.readFileSync(new URL('../../src/ui/ui.css', import.meta.url), 'utf8');
  const gd = fs.readFileSync(new URL('../../src/ui/guidance.css', import.meta.url), 'utf8');
  for (const dead of ['.bc-print', '.bc-edge-paw', 'is-trail', '.bc-edge-rot svg', 'bcPrint']) {
    assert.ok(!ui.includes(dead) && !gd.includes(dead), `no ${dead} rule`);
  }
  const beacon = fs.readFileSync(new URL('../../src/ui/beacon.js', import.meta.url), 'utf8');
  assert.ok(!/bc-print|bc-edge-paw|is-trail/.test(beacon), 'beacon.js creates none of those classes');
  assert.match(gd, /\.ui-beacon\.is-on \.bc-edge\.is-on \{[^}]*pointer-events: auto/);
  assert.match(ui, /\.hud\.hud\.hud\.tuck-grit \.hud-grit[^{]*\{ pointer-events: none; \}/);
  assert.match(gd, /\.hud-guide \{[^}]*pointer-events: none/, 'the objective line passes taps through');
  // the landscape toast rules that position: fixed inside the contained .hud-tc (they never escaped it) are gone
  assert.ok(!/hud-toast-slot \{ position: fixed/.test(ui));
});

// ====================================================================================================== TT3 bot inputs
test('TT3 onboarding bot: reads the new keycaps and walks on WASD toward the trail (mouse runs)', async () => {
  const bot = await import('../../scripts/dev/onboarding-bot.mjs');
  const n = (s, d = 'mouse') => [...bot.namedActions(s, d)].sort();
  assert.deepEqual(n('Hold RMB to block Sir Wobble!'), ['guard']);
  assert.deepEqual(n('Little fence? Hop it! Space'), ['jump']);
  assert.deepEqual(n('Race Pearl to the dummy! WASD'), ['move']);
  assert.deepEqual(n('F Toss the coin at that crow!'), ['trick']);
  assert.deepEqual(n('Tap Stand when you see the shield!', 'touch'), ['guard']);
  assert.deepEqual(n('Tap Stand when you see the shield!', 'mouse'), [], 'touch button names only on touch runs');
  assert.equal(bot.ACTION_CODE.guard, 'RMB');
  assert.equal(bot.ACTION_CODE.jump, 'Space');
  assert.equal(bot.ACTION_CODE.ability, 'KeyG');
  assert.deepEqual(bot.wasdToward({ x: 100, y: 100 }, { x: 100, y: 20 }), ['KeyW']);
  assert.deepEqual(bot.wasdToward({ x: 100, y: 100 }, { x: 200, y: 200 }), ['KeyS', 'KeyD']);
  assert.deepEqual(bot.wasdToward({ x: 100, y: 100 }, { x: 105, y: 100 }), [], 'arrived (dead zone)');
  assert.deepEqual(bot.wasdToward(null, { x: 1, y: 1 }), []);
  const g = { prints: [{ sx: 10, sy: 10, lit: true }, { sx: 20, sy: 20, lit: true }, { sx: 30, sy: 30, lit: true }, { sx: 40, sy: 40, lit: true }, { sx: 50, sy: 50, lit: true }] };
  assert.deepEqual(bot.walkTarget(g, 100, 100), { x: 40, y: 40, src: 'print' }, 'a few prints out, not the farthest');
  assert.equal(bot.walkTarget({ ...g, ring: { sx: 1, sy: 1 } }, 100, 100), null, 'a ring: she is there');
  assert.equal(bot.walkTarget({ prints: [], edge: { sx: 99, sy: 5 } }, 100, 100).src, 'edge');
});
