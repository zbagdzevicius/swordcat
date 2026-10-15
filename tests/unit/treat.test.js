// tests/unit/treat.test.js  (owner: T, TT4 §12.3) — the treat panel state machine and view, with a fake card event and a
// stubbed postMessage. No fetch, no network: the game never calls the treat API (the host does).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  treatView, treatEligible, phaseForResult, createTreatController, newRequestId, installTreatPanel, TREAT_TIMEOUT_MS,
  EV_CARD_OPEN, EV_CARD_CLOSE,
} from '../../src/shelter/treat.js';
import { TREAT_COPY, giveHref, GIVE_URL } from '../../src/shelter/treatCopy.js';
import { createBridge, EMBED_NS, EMBED_VERSION } from '../../src/core/embed.js';
import { EventBus } from '../../src/core/EventBus.js';

const JUDAS = { id: '6a3055e21d6649b19b03688a', name: 'Judas', status: 'WAITING' };
const card = (over = {}) => ({ slot: 'pickles', kind: 'lost', cat: JUDAS, ...over });

function fakeTimers() {
  const list = [];
  return { list, set: (fn, ms) => { const h = { fn, ms, done: false }; list.push(h); return h; }, clear: (h) => { if (h) h.done = true; },
    fire() { for (const h of list) if (!h.done) { h.done = true; h.fn(); } } };
}
function ctlWith(opts = {}) {
  const posts = [], changes = [], timers = fakeTimers();
  let n = 0;
  const ctl = createTreatController({ embedded: true, post: (t, p) => { posts.push({ t, p }); return true; }, timers, idFn: () => `t-${++n}`, onChange: (c) => changes.push(c.phase), ...opts });
  return { ctl, posts, changes, timers };
}

test('treat: copy has the free line and the custody line, no adopt, no em dash, no token', () => {
  const all = JSON.stringify(Object.values(TREAT_COPY).map((v) => (typeof v === 'function' ? `${v('Judas')} ${v(null)}` : v)));
  assert.doesNotMatch(all, /adopt/i);
  assert.doesNotMatch(all, /—/);
  assert.doesNotMatch(all, /\btoken\b(?! tails)/i);
  assert.equal(TREAT_COPY.free, 'Token Tails sends the treat. It is free for you.');
  assert.equal(TREAT_COPY.custody, 'Held by Token Tails for the shelter until handover.');
  const src = fs.readFileSync(new URL('../../src/shelter/treat.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(/, 'the game never fetches the treat API');
  assert.doesNotMatch(src, /'\*'/, 'never posts to *');
});

test('treat: only real cats at the shelter (or bundled cats) get a panel', () => {
  assert.equal(treatEligible(card()), true);
  assert.equal(treatEligible(card({ cat: { ...JUDAS, status: 'RECOVERING' } })), true);
  assert.equal(treatEligible(card({ cat: { ...JUDAS, status: null } })), true);
  assert.equal(treatEligible(card({ cat: { ...JUDAS, status: 'ADOPTED' } })), false);
  assert.equal(treatEligible(card({ cat: null })), false);
  assert.equal(treatEligible(card({ alreadySaved: true })), false);
});

test('treat: every panel state renders with both lines; buttons only where they belong', () => {
  const live = { rail: 'live', sentToday: false, amountLabel: '0.01 USDC' };
  const views = {
    open: treatView(card(), live, { embedded: true }),
    sending: treatView(card({ phase: 'sending' }), live, { embedded: true }),
    sent: treatView(card({ phase: 'sent', explorerUrl: 'https://explorer.arc.io/tx/0x1', receiptPath: '/shelter-payouts/receipt?chain=5042&tx=0x1' }), live, { embedded: true }),
    already: treatView(card(), { ...live, sentToday: true }, { embedded: true }),
    exhausted: treatView(card(), { ...live, rail: 'exhausted' }, { embedded: true }),
    soon: treatView(card(), { ...live, rail: 'soon' }, { embedded: true }),
    error: treatView(card({ phase: 'error', retry: true }), live, { embedded: true }),
    link: treatView(card(), live, { embedded: false }),
  };
  for (const [k, v] of Object.entries(views)) {
    assert.equal(v.phase, k, k);
    assert.equal(v.free, TREAT_COPY.free, `${k} free line`); assert.equal(v.custody, TREAT_COPY.custody, `${k} custody line`);
  }
  assert.equal(views.open.button.label, 'Send Judas a treat');
  assert.equal(views.sending.button.disabled, true);
  assert.equal(views.sent.button, null);
  assert.equal(views.sent.message, 'Treat sent! 0.01 USDC is on its way to Pink Paw (Rožinė pėdutė).');
  assert.deepEqual(views.sent.links.map((l) => l.label), ['View on explorer', 'Receipt']);
  assert.equal(views.already.button, null); assert.equal(views.already.message, TREAT_COPY.already);
  assert.equal(views.exhausted.button, null); assert.equal(views.soon.button, null);
  assert.equal(views.error.button.label, 'Try again'); assert.equal(views.error.message, TREAT_COPY.error);
  assert.equal(treatView(card({ phase: 'error', retry: false }), live, { embedded: true }).button, null, 'signed-out / not-eligible: no retry');
  // checking (no treat-state yet) still lets the player try: the host answers with the real outcome
  assert.equal(treatView(card(), { rail: 'checking', sentToday: false }, { embedded: true }).phase, 'open');
  // not embedded: only a new-tab link, no button
  assert.equal(views.link.button, null);
  assert.deepEqual(views.link.links, [{ href: `${GIVE_URL}?cat=Judas`, label: 'Send a treat on Token Tails' }]);
  assert.equal(giveHref('Ankštė'), `${GIVE_URL}?cat=Ank%C5%A1t%C4%97`);
  assert.equal(giveHref(''), GIVE_URL);
});

test('treat: result kinds map to phases; unknown kinds are null', () => {
  assert.deepEqual(phaseForResult('sent'), { phase: 'sent', retry: false });
  assert.deepEqual(phaseForResult('already-today'), { phase: 'already', retry: false });
  assert.deepEqual(phaseForResult('paused'), { phase: 'soon', retry: false });
  assert.deepEqual(phaseForResult('budget-spent'), { phase: 'exhausted', retry: false });
  assert.deepEqual(phaseForResult('failed'), { phase: 'error', retry: true });
  assert.deepEqual(phaseForResult('retry'), { phase: 'error', retry: true });
  assert.deepEqual(phaseForResult('signed-out'), { phase: 'error', retry: false });
  assert.deepEqual(phaseForResult('not-eligible'), { phase: 'error', retry: false });
  assert.equal(phaseForResult('whatever'), null);
  const id = newRequestId();
  assert.match(id, /^[A-Za-z0-9_-]{1,40}$/);
});

test('treat: one treat per save; sentToday hides the button on every later card', () => {
  const { ctl, posts } = ctlWith();
  ctl.setState({ rail: 'live', sentToday: false, amountLabel: '0.01 USDC' });
  const c = ctl.open(card());
  assert.equal(ctl.view().phase, 'open');
  const rid = ctl.send();
  assert.equal(rid, 't-1');
  assert.deepEqual(posts, [{ t: 'treat-request', p: { requestId: 't-1', slot: 'pickles', catName: 'Judas', catId: JUDAS.id } }]);
  assert.equal(ctl.view().phase, 'sending');
  assert.equal(ctl.send(), null, 'no double send while sending');
  assert.equal(ctl.result({ requestId: 't-1', kind: 'sent', explorerUrl: 'https://explorer.arc.io/tx/0x1' }), true);
  assert.equal(c.phase, 'sent');
  assert.equal(ctl.view().button, null, 'after sent, the button is gone');
  assert.equal(ctl.send(), null);
  assert.equal(posts.length, 1);
  ctl.close();
  // reopening the same slot keeps it sent; a new cat shows "already"
  assert.equal(ctl.open(card()).phase, 'sent');
  ctl.open(card({ slot: 'pebble', cat: { id: '6a304e8f1d6649b19b036500', name: 'Simas', status: 'WAITING' } }));
  assert.equal(ctl.view().phase, 'already');
  assert.equal(ctl.view().button, null);
});

test('treat: unknown requestIds are ignored; no answer in 15 s shows Try again', () => {
  const { ctl, timers } = ctlWith();
  ctl.open(card());
  ctl.send();
  assert.equal(ctl.result({ requestId: 'someone-else', kind: 'sent' }), false);
  assert.equal(ctl.view().phase, 'sending');
  assert.equal(timers.list[0].ms, TREAT_TIMEOUT_MS);
  assert.equal(TREAT_TIMEOUT_MS, 15000);
  timers.fire();
  assert.equal(ctl.view().phase, 'error');
  assert.equal(ctl.view().button.label, 'Try again');
  // a late answer to the timed-out request is ignored
  assert.equal(ctl.result({ requestId: 't-1', kind: 'sent' }), false);
  // Try again sends a fresh request
  assert.equal(ctl.send(), 't-2');
  assert.equal(ctl.result({ requestId: 't-2', kind: 'already-today' }), true);
  assert.equal(ctl.view().phase, 'already');
  assert.equal(ctl.state.sentToday, true);
});

test('treat: rail results update the shared state; a failed post shows Try again; not embedded never posts', () => {
  const { ctl } = ctlWith();
  ctl.open(card()); ctl.send();
  ctl.result({ requestId: 't-1', kind: 'budget-spent' });
  assert.equal(ctl.view().phase, 'exhausted'); assert.equal(ctl.state.rail, 'exhausted');
  const b = ctlWith({ post: () => false });
  b.ctl.open(card());
  assert.equal(b.ctl.send(), null);
  assert.equal(b.ctl.view().phase, 'error'); assert.equal(b.ctl.view().button.label, 'Try again');
  const posts = [];
  const off = createTreatController({ embedded: false, post: (...a) => { posts.push(a); return true; } });
  off.open(card());
  assert.equal(off.view().phase, 'link');
  assert.equal(off.send(), null);
  assert.equal(posts.length, 0);
  // the card can always close, also while sending
  const s = ctlWith(); s.ctl.open(card()); s.ctl.send(); s.ctl.close();
  assert.equal(s.ctl.card, null);
  assert.equal(s.ctl.result({ requestId: 't-1', kind: 'sent' }), true, 'a result after Continue still counts');
  assert.equal(s.ctl.state.sentToday, true);
});

test('treat: installTreatPanel wires the card events and the bridge end to end (fake card, stubbed postMessage)', () => {
  // a tiny DOM stand-in: just enough for renderTreat
  const mk = (tag) => {
    const el = { tag, children: [], dataset: {}, className: '', textContent: '', listeners: {}, disabled: false, parent: null,
      classList: { add: (c) => { el.className += ` ${c}`; } },
      ownerDocument: null,
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      replaceChildren() { el.children = []; },
      remove() { if (el.parent) el.parent.children = el.parent.children.filter((x) => x !== el); },
      contains: () => false, setAttribute() {}, addEventListener(t, f) { el.listeners[t] = f; }, dispatchEvent() { return true; },
      focus() {}, querySelector(sel) { return find(el, (n) => sel.includes('[data-treat="send"]') ? n.dataset.treat === 'send' && !n.disabled : n.tag === 'button' && !n.disabled); },
    };
    el.ownerDocument = doc;
    return el;
  };
  const find = (n, pred) => { for (const c of n.children) { if (pred(c)) return c; const f = find(c, pred); if (f) return f; } return null; };
  const doc = { head: null, activeElement: null, createElement: (t) => mk(t), defaultView: { CustomEvent: class { constructor(t) { this.type = t; } } } };
  const text = (n) => [n.textContent, ...n.children.map(text)].join(' ');

  const parent = { sent: [], postMessage(d, o) { this.sent.push({ d, o }); } };
  const bridge = createBridge({ parent, allowed: ['https://tokentails.com'] });
  bridge.handle({ source: parent, origin: 'https://tokentails.com', data: { ns: EMBED_NS, v: EMBED_VERSION, type: 'hello' } });
  const bus = new EventBus();
  const ctl = installTreatPanel({ ctx: { bus } }, { bridge, doc });
  assert.ok(ctl);
  const actionsEl = mk('div');
  bus.emit(EV_CARD_OPEN, { slot: 'pickles', kind: 'lost', cat: JUDAS, actionsEl });
  const panel = actionsEl.children[0];
  assert.equal(panel.dataset.treatPhase, 'open');
  assert.match(text(panel), /Send Judas a treat/);
  assert.match(text(panel), /It is free for you\./); assert.match(text(panel), /until handover\./);
  find(panel, (n) => n.dataset.treat === 'send').listeners.click({ stopPropagation() {} });
  const req = parent.sent.at(-1);
  assert.equal(req.o, 'https://tokentails.com');
  assert.equal(req.d.type, 'treat-request');
  assert.equal(panel.dataset.treatPhase, 'sending');
  bridge.handle({ source: parent, origin: 'https://tokentails.com', data: { ns: EMBED_NS, v: EMBED_VERSION, type: 'treat-result', requestId: req.d.requestId, kind: 'sent', amountLabel: '0.01 USDC', explorerUrl: 'https://explorer.arc.io/tx/0x1' } });
  assert.equal(panel.dataset.treatPhase, 'sent');
  assert.match(text(panel), /Treat sent! 0\.01 USDC is on its way/);
  const link = find(panel, (n) => n.tag === 'a');
  assert.equal(link.href, 'https://explorer.arc.io/tx/0x1'); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
  bus.emit(EV_CARD_CLOSE, { slot: 'pickles' });
  assert.equal(actionsEl.children.length, 0);
  // an adopted / missing cat gets nothing mounted
  const a2 = mk('div');
  bus.emit(EV_CARD_OPEN, { slot: 'x', kind: 'lost', cat: null, actionsEl: a2 });
  assert.equal(a2.children.length, 0);
  ctl.uninstall();
});
