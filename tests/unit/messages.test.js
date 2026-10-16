// tests/unit/messages.test.js — TT5 package M (TOKENTAILS-PLAN §13.1 decision 1, §13.3): one message system. The board
// (priority, wait, P0 hides lower), the card placement (off the touch buttons, the HUD and Clem), line dedupe, the
// toast hold, the card-only skip, the shelter card that waits out a fight, the offer that waits for a card, the damage
// word cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { MSG, MessageBoard, Messages, cardPlace, overlapFrac, sameLine, viewportKind } from '../../src/ui/messages.js';
import { ToastQueue, TOAST, TOAST_PHONE_VISIBLE, phoneToasts } from '../../src/ui/toasts.js';
import { CelebrateQueue, pollSkip, skipPressed, SKIP_ACTIONS, rewardToastIcon, rewardInfo } from '../../src/ui/celebrate.js';
import { ShelterCard } from '../../src/shelter/card.js';
import { KittenOffer } from '../../src/ui/offer.js';
import { DamageNumbers, DAMAGE_FX } from '../../src/fx/DamageNumbers.js';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('TT5 board: a P0 hides every lower level; the older modal shows, the newer waits', () => {
  const b = new MessageBoard();
  b.set('toast', MSG.P2, 'toast');
  b.set('card', MSG.P1, 'card');
  assert.equal(b.allows('toast', MSG.P2, 'toast'), true);
  assert.equal(b.allows('card', MSG.P1, 'card'), true);
  b.set('shelter', MSG.P0, 'modal');
  assert.equal(b.top(), MSG.P0);
  for (const [id, lv, slot] of [['toast', MSG.P2, 'toast'], ['card', MSG.P1, 'card'], ['hint', MSG.P3, 'toast']]) {
    assert.equal(b.allows(id, lv, slot), false, `${id} hides under the shelter card`);
  }
  assert.equal(b.allows('shelter', MSG.P0, 'modal'), true, 'the modal itself shows');
  assert.equal(b.allows('offer', MSG.P0, 'modal'), false, 'a second modal waits for the first');
  b.set('offer', MSG.P0, 'modal');
  assert.equal(b.allows('offer', MSG.P0, 'modal'), false, 'still waits once declared (newer)');
  b.set('shelter', MSG.P0, 'modal', false);
  assert.equal(b.allows('offer', MSG.P0, 'modal'), true, 'then it shows');
});

test('TT5 board: one card at a time (the older wins); on phones a toast or tip waits while a card is up', () => {
  const b = new MessageBoard();
  b.set('card', MSG.P1, 'card');
  assert.equal(b.allows('card2', MSG.P1, 'card'), false, 'a new card waits');
  assert.equal(b.allows('toast', MSG.P2, 'toast'), true, 'desktop: toasts keep their own slot');
  assert.equal(b.allows('toast', MSG.P2, 'toast', { phone: true }), false, 'phone: one box at a time');
  assert.equal(b.allows('hint', MSG.P3, 'toast', { phone: true }), false);
  b.set('card', 0, 'card', false);
  assert.equal(b.allows('toast', MSG.P2, 'toast', { phone: true }), true);
  b.clear();
  assert.equal(b.top(), Infinity);
});

test('TT5 dedupe: the same line in two places is caught (glyphs, case, punctuation, a clipped objective)', () => {
  assert.equal(sameLine('Follow the trail of letters', 'follow the trail of letters!'), true);
  assert.equal(sameLine('Press [attack] to bonk the dummy', 'Press to bonk the dummy'), true, 'glyph tokens ignored');
  assert.equal(sameLine('Find the three kittens hiding in the meadow', 'Find the three kittens hiding…'), true, 'a clipped line');
  assert.equal(sameLine('Find the barn', 'Fin…'), false, 'too short to call a clip');
  assert.equal(sameLine('Chase off the rats!', 'Someone is in that barrel…'), false);
  assert.equal(sameLine('', ''), false);
  // the toast queue itself drops a repeat that is on screen or waiting
  const q = new ToastQueue();
  assert.equal(q.push('Checkpoint! Progress saved.'), true);
  assert.equal(q.push('Checkpoint! Progress saved.'), false);
});

test('TT5 viewport classes and the per-class toast count (1 on phones, 2 on tablet / desktop)', () => {
  assert.equal(viewportKind(390, 844, true), 'phone-portrait');
  assert.equal(viewportKind(844, 390, true), 'phone-land');
  assert.equal(viewportKind(667, 375, true), 'phone-land');
  assert.equal(viewportKind(1024, 768, true), 'tablet');
  assert.equal(viewportKind(1280, 720, false), 'desktop');
  assert.equal(viewportKind(1920, 1080, false), 'desktop');
  assert.equal(TOAST_PHONE_VISIBLE, 1);
  assert.equal(TOAST.visible, 2);
  assert.equal(phoneToasts('touch', 1024, 768), false);
  assert.equal(phoneToasts('kbm', 667, 375), true);
});

test('TT5 cardPlace: the card stays off the touch buttons, the HUD and Clem (≤ 4 %), else docks smaller', () => {
  assert.equal(overlapFrac({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 100, h: 100 }), 0.25);
  assert.equal(overlapFrac({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }), 0);
  // 844 × 390 phone landscape: HUD top-left, the touch cluster on the right, Clem under the centre
  const W = 844, H = 390;
  const avoid = [{ x: 16, y: 14, w: 226, h: 80 }, { x: 394, y: 10, w: 56, h: 56 }, { x: 600, y: 120, w: 230, h: 260 }];
  const clem = { x: 400, y: 170, w: 50, h: 62 };
  const at = cardPlace({ W, H, top: 72, w: 360, h: 90, avoid, clem, leftTop: 102 });
  assert.ok(at.score <= MSG.overlapMax, `a free spot (${JSON.stringify(at)})`);
  const box = { x: at.x, y: at.y, w: at.w, h: at.h };
  for (const r of [...avoid, clem]) assert.ok(overlapFrac(box, r) <= MSG.overlapMax, `off ${JSON.stringify(r)}`);
  assert.ok(at.x >= MSG.gutter && at.x + at.w <= W - MSG.gutter && at.y + at.h <= H - MSG.gutter, 'inside the screen');
  // centre is free: centred under the top
  const c = cardPlace({ W: 1280, H: 720, top: 120, w: 400, h: 200, avoid: [], clem: { x: 620, y: 420, w: 60, h: 80 } });
  assert.equal(c.spot, 'centre'); assert.equal(c.x, 440); assert.equal(c.y, 120); assert.equal(c.scale, 1);
  // no room anywhere at full size: it docks smaller
  const tight = cardPlace({ W: 667, H: 375, top: 60, w: 330, h: 220, avoid: [{ x: 0, y: 0, w: 220, h: 375 }, { x: 460, y: 0, w: 207, h: 375 }], clem: { x: 300, y: 250, w: 60, h: 70 } });
  assert.ok(tight.scale < 1, `docked (${tight.scale})`);
});

test('TT5 Messages: P0 holds the toasts and new cards; a card holds phone toasts; modals wait for cards', () => {
  const ui = { celebrations: { q: { cur: null, items: [] }, busy: false }, toasts: { q: { shown: [] } }, shelterCard: { open: false, queue: [] }, results: { open: false }, offer: { open: false } };
  const m = new Messages({}, ui);
  m.update(0.016);
  assert.equal(m.p0, false); assert.equal(m.holdToasts(), false); assert.equal(m.holdCards(), false);
  assert.equal(m.modalMayOpen('shelter'), true);
  ui.shelterCard.open = true; m.update(0.016);
  assert.equal(m.p0, true); assert.equal(m.holdToasts(), true); assert.equal(m.holdCards(), true);
  assert.equal(m.modalMayOpen('offer'), false, 'no offer over the shelter card');
  ui.shelterCard.open = false; ui.celebrations.q.cur = { started: true }; ui.celebrations.busy = true; m.update(0.016);
  assert.equal(m.card, true);
  assert.equal(m.modalMayOpen('offer'), false, 'the offer waits for the card');
  assert.equal(m.modalMayOpen('shelter'), false, 'the shelter card waits for the card');
  m.phone = true;
  assert.equal(m.holdToasts(), true, 'phone: toasts wait while a card is up');
  ui.celebrations.q.cur = null; ui.celebrations.busy = false; ui.shelterCard.queue = [{ slot: 'pickles' }]; m.update(0.016);
  assert.equal(m.modalMayOpen('offer'), false, 'a queued rescued cat card goes first');
  // the hint waits a little after the last toast leaves (no fade back over it)
  ui.shelterCard.queue = []; ui.toasts.q.shown = [{ t: 0 }]; m.update(0.016);
  assert.equal(m.toast, true);
  ui.toasts.q.shown = []; m.update(MSG.toastLinger / 2);
  assert.equal(m.toast, true, 'lingers');
  m.update(MSG.toastLinger);
  assert.equal(m.toast, false);
});

test('TT5 celebrate: attack never skips; a new card waits under a modal; stickers / combat cards become icon toasts', () => {
  assert.deepEqual([...SKIP_ACTIONS], ['confirm']);
  const acts = new Map([['attack', { pressed: true }], ['confirm', { pressed: false }]]);
  assert.equal(skipPressed({ actions: acts, device: 'touch' }), false);
  assert.equal(skipPressed({ actions: acts }), false);
  const q = new CelebrateQueue();
  q.push('card', 'holy');
  assert.equal(q.update(0.016, false, true).started, null, 'held while a modal is up');
  assert.equal(q.items.length, 1);
  assert.equal(q.update(0.016, false, false).started?.id, 'holy');
  q.update(1, false);
  assert.equal(pollSkip(q, { actions: acts, device: 'kbm' }), null, 'an attack tap under the card does not skip it');
  const ctx = { strings: { t: (k) => k, has: () => false }, state: null };
  const svg = rewardToastIcon(rewardInfo(ctx, 'sticker', 'hop'), 'sticker', 'hop');
  assert.match(svg, /<svg/);
  // the source: no window-wide pointer skip any more, the card listens on its own box
  const src = read('src/ui/celebrate.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/window\.addEventListener\('pointerdown'/.test(src), 'no window pointerdown skip');
  assert.match(src, /this\.pop\.addEventListener\('pointerdown'/);
  assert.match(src, /c\.kind === 'sticker' \|\| c\.docked\) \{ this\._toast\(c\)/);
  const ui = read('src/ui/UI.js');
  assert.ok(!/anyActivity\?\.\(\) && cel\.q\.skip/.test(ui), 'UI.update no longer skips on any input');
});

test('TT5 shelter card: waits while an alerted foe is near, while the offer or a card is up', () => {
  const foe = { alive: true, alerted: true, pos: { x: 3, z: 0 } };
  const ctx = { game: { mode: 'play' }, player: { pos: { x: 0, y: 0, z: 0 } }, enemies: { list: [foe] }, levels: {}, story: {} };
  const self = { ctx, ui: { busy: false, celebrations: { busy: false }, offer: { open: false }, menus: {}, messages: null } };
  const canOpen = () => ShelterCard.prototype.canOpen.call(self);
  assert.equal(canOpen(), false, 'mid-fight: waits');
  foe.alerted = false;
  assert.equal(canOpen(), true);
  self.ui.offer.open = true;
  assert.equal(canOpen(), false, 'never over the Kitten-mode offer');
  self.ui.offer.open = false; self.ui.celebrations.busy = true;
  assert.equal(canOpen(), false, 'after the celebration');
});

test('TT5 offer: waits for a card instead of covering it, then shows; gives up after waitMax', async () => {
  const o = Object.create(KittenOffer.prototype);
  let shown = 0;
  const flags = {};
  Object.assign(o, { open: false, kos: [], _pending: null, ctx: { state: { difficulty: 'normal', getFlag: (k) => flags[k], setFlag: (k, v) => { flags[k] = v; } }, game: { time: 0 } } });
  let may = false;
  o.ui = { busy: false, messages: { modalMayOpen: () => may } };
  o._show = function () { shown++; this.open = true; return new Promise((r) => { this._resolve = r; }); };
  const p = o.offer();
  assert.equal(shown, 0, 'waits while the card shows');
  assert.ok(o._pending);
  o.render(0.5, true);
  assert.equal(shown, 0);
  may = true;
  o.render(0.016, true);
  assert.equal(shown, 1, 'shows once the card is gone');
  o._resolve(true);
  assert.equal(await p, true);
  // a waiting offer gives up
  const o2 = Object.create(KittenOffer.prototype);
  Object.assign(o2, { open: false, kos: [], _pending: null, ctx: o.ctx, ui: { busy: false, messages: { modalMayOpen: () => false } } });
  flags['seen.offer.kitten'] = false;
  const p2 = o2.offer();
  o2.render(31, true);
  assert.equal(await p2, null);
});

test('TT5 damage words: at most 2 words / pops on screen; her words take alternating lanes', () => {
  let now = 0;
  const cam = new THREE.PerspectiveCamera(); cam.updateMatrixWorld();
  const d = new DamageNumbers({ game: { get realTime() { return now; } }, state: { settings: {} }, camera: cam });
  const at = new THREE.Vector3(0, 1, 0);
  d.word('slash1', at); now += 0.3;
  d.word('slash2', at); now += 0.3;
  d.pop('bonk', at); d.pop('parry', at);
  assert.equal(d.texts, DAMAGE_FX.wordCap, `capped (${d.texts})`);
  assert.equal(DAMAGE_FX.wordCap, 2);
  d.show(at, '12', 'crit');
  assert.equal(d.texts, 2, 'numbers do not count');
  const d2 = new DamageNumbers({ game: { get realTime() { return now; } }, state: { settings: {} }, camera: cam });
  now += 1; const a = d2.word('slash1', at, { force: true }); now += 1; d2.word('slash2', at, { force: true });
  assert.equal(a, true);
  const xs = d2.pool.filter((n) => n.active && n.kind === 'word').map((n) => n.pos.x);
  assert.equal(xs.length, 2);
  assert.ok(Math.abs(xs[0] - xs[1]) > 0.5, `two lanes (${xs})`);
});

test('TT5 CSS: lower layers hide under a modal; the hint waits for toasts; Continue sticks at 667×375; pad keys wrap', () => {
  const css = read('src/ui/ui.css');
  assert.match(css, /\.ui-root\.msg-p0 :is\(\.ui-toasts, \.ui-hint, \.ui-guide, \.ui-celebrate/);
  assert.match(css, /\.ui-root\.msg-shelter \.ui-offer/);
  assert.match(css, /\.ui-root\.msg-card \.ui-guide \.gd-bubble/);
  assert.match(css, /msg-toast \.ui-hint \{ opacity: 0 !important; \}/);
  assert.ok(!/:has\(\.ui-toast:not\(\.is-out\)/.test(css), 'the old rule that let the hint fade back over a leaving toast is gone');
  assert.match(css, /:has\(\.hud-boss\.is-on\) \.ui-hint \{ opacity: 0 !important/);
  assert.match(css, /\.cel-confetti \{ inset: auto;/);
  assert.match(css, /\.ability-bar\.is-pad \.ab-key \{[^}]*white-space: normal/);
  const sh = read('src/shelter/card.css');
  assert.match(sh, /max-height: 420px\) and \(orientation: landscape\)[\s\S]*\.sh-continue \{ position: sticky; bottom: 0;/);
});

test('TT5 verify: world bubbles wait under a modal, and on phones under a centre card; bigger screens keep them up', () => {
  const ui = { celebrations: { q: { cur: null, items: [] }, busy: false }, toasts: { q: { shown: [] } }, shelterCard: { open: false, queue: [] }, results: { open: false }, offer: { open: false } };
  const m = new Messages({}, ui);
  m.update(0.016);
  assert.equal(m.bubbleHold(), false);
  ui.shelterCard.open = true; m.update(0.016);
  assert.equal(m.bubbleHold(), true, 'a modal hushes them');
  ui.shelterCard.open = false; ui.celebrations.q.cur = { started: true }; m.update(0.016);
  m.phone = false;
  assert.equal(m.bubbleHold(), false, 'desktop: a card leaves them up (they step off it instead)');
  m.phone = true;
  assert.equal(m.bubbleHold(), true, 'phone: they wait while the card is up');
  ui.celebrations.q.cur = null; m.update(0.016); m.phone = true;
  assert.equal(m.bubbleHold(), false, 'and come back when it goes');
  assert.deepEqual(m.bubbleBlocks().rects, [], 'nothing to keep off with no card and no toast');
});

test('TT5 verify: a phone card never docks below MSG.phoneMinScale (its line stays readable)', () => {
  // only a two-thirds card fits above the bottom band: without a floor it docks that small, a phone stops at 0.8
  const avoid = [{ x: 0, y: 200, w: 844, h: 190 }];
  const any = cardPlace({ W: 844, H: 390, top: 60, w: 360, h: 200, avoid });
  assert.equal(any.scale, MSG.dockScales[MSG.dockScales.length - 1], 'without a floor it docks to the smallest');
  const phone = cardPlace({ W: 844, H: 390, top: 60, w: 360, h: 200, avoid, minScale: MSG.phoneMinScale });
  assert.equal(phone.scale, MSG.phoneMinScale, `phone floor (${phone.scale})`);
  // a free spot still wins at full size
  const free = cardPlace({ W: 844, H: 390, top: 60, w: 360, h: 200, avoid: [], minScale: MSG.phoneMinScale });
  assert.equal(free.scale, 1);
});

test('TT5 verify: phone bubbles also wait in the frame between two queued cards; the pop-in stays on screen', () => {
  const ui = { celebrations: { q: { cur: null, items: [{ kind: 'card' }] }, busy: true }, toasts: { q: { shown: [] } }, shelterCard: { open: false, queue: [] }, results: { open: false }, offer: { open: false } };
  const m = new Messages({}, ui);
  m.update(0.016); m.phone = true;
  assert.equal(m.bubbleHold(), true, 'a card is next: still waiting');
  ui.celebrations.q.items = []; m.update(0.016); m.phone = true;
  assert.equal(m.bubbleHold(), false);
  // the right column keeps the 108 % pop inside the screen
  const at = cardPlace({ W: 1024, H: 768, top: 90, w: 300, h: 180, avoid: [{ x: 0, y: 0, w: 700, h: 768 }] });
  assert.equal(at.spot, 'right');
  assert.ok(at.x + at.w + at.w * MSG.popOver <= 1024 - MSG.gutter + 1e-9, `right edge with the overshoot (${JSON.stringify(at)})`);
});

test('TT5 verify: a re-placed card keeps its spot while it is free, and moves when Clem walks under it', () => {
  const base = { W: 1024, H: 768, top: 90, w: 300, h: 200 };
  const first = cardPlace({ ...base, avoid: [{ x: 362, y: 90, w: 300, h: 200 }] });
  assert.notEqual(first.spot, 'centre');
  // the centre is free again, but the card stays where it is
  const again = cardPlace({ ...base, avoid: [], keep: first });
  assert.deepEqual([again.x, again.y, again.spot], [first.x, first.y, first.spot]);
  // Clem under it now: it moves
  const clem = { x: first.x + 100, y: first.y + 60, w: 60, h: 80 };
  const moved = cardPlace({ ...base, avoid: [], clem, keep: first });
  assert.ok(overlapFrac(moved, clem) <= MSG.overlapMax, `off Clem (${JSON.stringify(moved)})`);
  // a different size (new content) is placed afresh
  const fresh = cardPlace({ ...base, h: 260, avoid: [], keep: first });
  assert.equal(fresh.spot, 'centre');
});

test('TT5 verify: with every named spot taken the card finds a free one at full size before it docks', () => {
  // 844 × 390: the top band (HUD, pause) and the right touch column are taken; Clem is low on the left
  const avoid = [{ x: 0, y: 0, w: 844, h: 140 }, { x: 600, y: 0, w: 244, h: 390 }];
  const clem = { x: 240, y: 280, w: 40, h: 60 };
  const at = cardPlace({ W: 844, H: 390, top: 60, w: 290, h: 90, avoid, clem, minScale: MSG.phoneMinScale });
  assert.equal(at.scale, 1, JSON.stringify(at));
  assert.ok(at.score <= MSG.overlapMax, JSON.stringify(at));
  for (const r of [...avoid, clem]) assert.ok(overlapFrac(at, r) <= MSG.overlapMax, `off ${JSON.stringify(r)}: ${JSON.stringify(at)}`);
});
