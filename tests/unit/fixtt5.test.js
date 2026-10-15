// tests/unit/fixtt5.test.js — TT5 package B (TOKENTAILS-PLAN §13.2): the sticker's inner icon stays on its disc, and
// the guide's edge coin never sits on a touch button, the ability bar or a HUD block (667x375 cluster, rotation, desktop).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sticker, stickerInner, star4, paw, glyph } from '../../src/ui/icons.js';
import { placeEdge, dodgeRects, clearOf, BEACON, keepOuts } from '../../src/ui/beacon.js';
import { setBubbleHush, bubblesHushed } from '../../src/companions/Bubble.js';

// ── sticker ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The nested <svg> tag of a sticker (its opening tag), or null. */
function innerTag(s) {
  const i = s.indexOf('<svg', 1);
  return i < 0 ? null : s.slice(i, s.indexOf('>', i) + 1);
}
const num = (tag, a) => Number(new RegExp(`\\s${a}="([^"]+)"`).exec(tag)?.[1]);

test('sticker: a nested icon <svg> gets an explicit 40 x 40 box centred on the disc', () => {
  for (const inner of [star4('#FFF8EE'), paw('#5A3B2E'), glyph('star8', '#FFF8EE')]) {
    const tag = innerTag(sticker('#FFD86B', inner));
    assert.ok(tag, 'the icon is nested');
    const x = num(tag, 'x'), y = num(tag, 'y'), w = num(tag, 'width'), h = num(tag, 'height');
    assert.deepEqual([x, y, w, h], [24, 24, 40, 40]);
    // the box sits inside the coloured disc (centre 44, r 34.5): every corner within the radius
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) assert.ok(Math.hypot(cx - 44, cy - 44) < 34.5);
    assert.match(tag, /style="width:40px;height:40px/, 'inline size beats class width rules');
    assert.match(tag, /viewBox="0 0 \d+ \d+"/, 'keeps its own viewBox');
    assert.equal((tag.match(/\swidth="/g) ?? []).length, 1, 'one width attribute');
  }
});

test('sticker: the old unsized group is gone; plain shapes are centred; empty stays empty', () => {
  assert.ok(!sticker('#fff', star4()).includes('translate(24 24) scale(1.25)'));
  assert.equal(stickerInner(''), '');
  assert.equal(stickerInner(null), '');
  const g = stickerInner('<circle cx="12" cy="12" r="5"/>');
  assert.match(g, /^<g transform="translate\(29 29\) scale\(1\.25\)">/);   // 24 units * 1.25 = 30, centred on 44
  // an icon that already carries a size or style is re-sized, not doubled
  const t = stickerInner('<svg class="x" width="9" height="9" style="color:red" viewBox="0 0 24 24"><path d="M0 0"/></svg>');
  assert.equal((t.match(/\swidth="/g) ?? []).length, 1);
  assert.equal((t.match(/\sstyle="/g) ?? []).length, 1);
  assert.ok(t.endsWith('<path d="M0 0"/></svg>'));
});

// ── edge coin ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A touch button rect (centre, radius) like occluders.js pushes for the cluster. */
const btn = (x, y, r, kind = 'cluster') => ({ x: x - r, y: y - r, w: 2 * r, h: 2 * r, kind });
const PAD_PHONE = BEACON.coinPxPhone / 2 + 8, PAD_DESK = BEACON.coinPx / 2 + 8;

/** The coin box (centre p, size px) overlaps no rect. */
function clearOfRects(p, rects, size) {
  const h = size / 2;
  return rects.every((r) => p.x + h <= r.x || p.x - h >= r.x + r.w || p.y + h <= r.y || p.y - h >= r.y + r.h);
}

// the 667x375 cluster measured by the TT5 audit (touch-fight-667x375): Milk over Jump on the right border, the
// Meow, Dodge, Guard and Attack buttons below, pause and the HUD at the top
const W5 = 667, H5 = 375, M5 = BEACON.edgeMarginPhone;
const CLUSTER_667 = [
  btn(599, 359 - 52, 48), btn(494, 318, 38), btn(499, 215, 32), btn(599, 183, 32), btn(615, 100, 28), btn(552, 132, 28),
  { x: 306, y: 10, w: 56, h: 56, kind: 'hud' }, { x: 10, y: 10, w: 230, h: 90, kind: 'hud' }, { x: 405, y: 14, w: 250, h: 36, kind: 'hud' },
];

test('placeEdge: the old slides can leave the coin on a 667x375 touch button; placeEdge never does', () => {
  // the audit spot: on the right border between Milk and Jump
  const old = { x: W5 - M5, y: 157 };
  dodgeRects(old, CLUSTER_667, W5, H5, M5);
  assert.ok(!clearOfRects(old, CLUSTER_667, BEACON.coinPxPhone), 'the bug: the one-way slides end on a button');
  const p = { x: W5 - M5, y: 157 };
  assert.equal(placeEdge(p, CLUSTER_667, null, W5, H5, M5, PAD_PHONE), true);
  assert.ok(clearOfRects(p, CLUSTER_667, BEACON.coinPxPhone), `coin at ${p.x},${p.y} is clear of every button`);
  // on the band: one coordinate is the margin
  assert.ok(Math.abs(p.x - M5) < 1e-6 || Math.abs(p.x - (W5 - M5)) < 1e-6 || Math.abs(p.y - M5) < 1e-6 || Math.abs(p.y - (H5 - M5)) < 1e-6);
});

test('placeEdge: every start spot on the 667x375 border ends clear of the cluster and the HUD', () => {
  for (let y = M5; y <= H5 - M5; y += 7) {
    for (const x of [M5, W5 - M5]) {
      const p = { x, y };
      assert.ok(placeEdge(p, CLUSTER_667, null, W5, H5, M5, PAD_PHONE));
      assert.ok(clearOfRects(p, CLUSTER_667, BEACON.coinPxPhone), `start ${x},${y} → ${p.x},${p.y}`);
    }
  }
  for (let x = M5; x <= W5 - M5; x += 9) {
    for (const y of [M5, H5 - M5]) {
      const p = { x, y };
      assert.ok(placeEdge(p, CLUSTER_667, null, W5, H5, M5, PAD_PHONE));
      assert.ok(clearOfRects(p, CLUSTER_667, BEACON.coinPxPhone), `start ${x},${y} → ${p.x},${p.y}`);
    }
  }
});

test('placeEdge: after rotating to 375x667 (cluster bottom right) the coin is still clear', () => {
  const W = 375, H = 667, m = BEACON.edgeMarginPhone;
  const rects = [btn(320, 610, 48), btn(230, 625, 38), btn(240, 525, 32), btn(330, 495, 32), btn(340, 420, 28), btn(260, 440, 28),
    { x: 160, y: 10, w: 56, h: 56, kind: 'hud' }, { x: 10, y: 10, w: 140, h: 90, kind: 'hud' }];
  for (let y = m; y <= H - m; y += 11) {
    const p = { x: W - m, y };
    placeEdge(p, rects, null, W, H, m, PAD_PHONE);
    assert.ok(clearOfRects(p, rects, BEACON.coinPxPhone), `start ${W - m},${y} → ${p.x},${p.y}`);
  }
});

test('placeEdge: on desktop the coin keeps clear of the ability bar (not just next to it)', () => {
  const W = 1280, H = 720, m = BEACON.edgeMargin;
  const bar = [{ x: 380, y: 640, w: 520, h: 64, kind: 'bar' }];
  const p = { x: 640, y: H - m };
  placeEdge(p, bar, null, W, H, m, PAD_DESK);
  assert.ok(clearOfRects(p, bar, BEACON.coinPx));
  assert.ok(p.x <= 380 - PAD_DESK || p.x >= 900 + PAD_DESK, 'slid along the bottom border past the bar end');
  assert.equal(p.y, H - m, 'stays on its border');
});

test('placeEdge: keeps Clem clear when it can, and drops that rule only when nothing else fits', () => {
  const W = 844, H = 390, m = BEACON.edgeMarginPhone;
  const clem = { x: 420, y: H - m - 10, r: BEACON.clemClear };
  const p = { x: 420, y: H - m };
  placeEdge(p, [], clem, W, H, m, PAD_PHONE);
  assert.ok(Math.hypot(p.x - clem.x, p.y - clem.y) >= clem.r - 1e-6);
  // the same answer as the old clearOf when there are no rects
  const q = clearOf({ x: 420, y: H - m }, clem.x, clem.y, clem.r, W, H, m);
  assert.ok(Math.abs(Math.abs(q.x - 420) - Math.abs(p.x - 420)) <= 4, 'within one step of clearOf');
  // a screen full of rects: nothing is free, p is left alone and false comes back
  const r = { x: 300, y: m };
  assert.equal(placeEdge(r, [{ x: 0, y: 0, w: W, h: H }], clem, W, H, m, PAD_PHONE), false);
  assert.deepEqual(r, { x: 300, y: m });
});

test('placeEdge: a free spot is left where it is; tiny screens do not loop', () => {
  const p = { x: 500, y: BEACON.edgeMargin };
  assert.equal(placeEdge(p, [{ x: 0, y: 600, w: 100, h: 100 }], null, 1280, 720, BEACON.edgeMargin), true);
  assert.deepEqual(p, { x: 500, y: BEACON.edgeMargin });
  const t = { x: 10, y: 10 };
  assert.equal(typeof placeEdge(t, [], null, 20, 20, 46), 'boolean');
});

test('TT5 integration: world bubbles hush while a modal is up and come back after', () => {
  let p0 = false;
  setBubbleHush(() => p0);
  assert.equal(bubblesHushed(), false);
  p0 = true; assert.equal(bubblesHushed(), true);
  p0 = false; assert.equal(bubblesHushed(), false);
  setBubbleHush(() => { throw new Error('no ui'); });
  assert.equal(bubblesHushed(), false, 'a throwing predicate never hides bubbles');
  setBubbleHush(null);
  assert.equal(bubblesHushed(), false);
});

test('TT5 integration: the objective pill joins the edge keep-outs and the coin avoids it', () => {
  const pill = { left: 260, top: 8, width: 150, height: 30 };
  const on = { guideEl: { classList: { contains: (c) => c === 'is-on' }, getBoundingClientRect: () => pill } };
  const off = { guideEl: { classList: { contains: () => false }, getBoundingClientRect: () => pill } };
  const base = [{ x: 600, y: 300, w: 60, h: 60 }];
  const k = keepOuts(base, on, 100);
  assert.equal(k.length, 2);
  assert.deepEqual({ x: k[1].x, y: k[1].y, w: k[1].w, h: k[1].h }, { x: 260, y: 8, w: 150, h: 30 });
  assert.equal(base.length, 1, 'the occluder snapshot is not mutated');
  assert.equal(keepOuts(base, off, 100.1).length, 2, 'cached for 0.25 s');
  assert.equal(keepOuts(base, off, 100.5), base, 'pill hidden: the occluders as they were');
  const kk = keepOuts(base, on, 101);
  const p = { x: 330, y: 20, angle: -Math.PI / 2 };
  placeEdge(p, kk, null, 667, 375, 20, 30);
  const inPill = p.x > 260 - 30 && p.x < 410 + 30 && p.y > 8 - 30 && p.y < 38 + 30;
  assert.equal(inPill, false, `coin at ${p.x},${p.y} sits on the pill`);
});

test('TT5 integration: a queued shelter card waits on a nearby fight, but at most CARD_FIGHT_WAIT_MAX', async () => {
  const { ShelterCard, CARD_FIGHT_WAIT_MAX, CARD_DELAY } = await import('../../src/shelter/card.js');
  const foe = { alive: true, alerted: true, pos: { x: 3, y: 0, z: 0 } };
  const ctx = { game: { mode: 'play' }, player: { pos: { x: 0, y: 0, z: 0 } }, enemies: { list: [foe] } };
  const fake = { ctx, ui: {}, open: false, queue: [{ slot: 'pickles' }], waitT: 0, fightWaitT: 0, shown: 0 };
  fake.canOpen = ShelterCard.prototype.canOpen.bind(fake);
  fake._show = () => { fake.shown++; fake.queue.shift(); };
  const step = (dt) => ShelterCard.prototype.update.call(fake, dt, null);
  let t = 0;
  while (t < CARD_DELAY + 5) { step(0.1); t += 0.1; }
  assert.equal(fake.shown, 0, 'waits while an alerted foe is near');
  foe.alerted = false; step(0.1);
  assert.equal(fake.shown, 1, 'opens once the fight is over');
  foe.alerted = true; fake.queue.push({ slot: 'pebble' }); fake.waitT = 0;
  t = 0;
  while (t < CARD_DELAY + CARD_FIGHT_WAIT_MAX + 1 && fake.shown === 1) { step(0.1); t += 0.1; }
  assert.equal(fake.shown, 2, 'a foe that never leaves does not hold the card forever');
  assert.ok(t > CARD_FIGHT_WAIT_MAX, `waited ${t.toFixed(1)} s`);
});
