// tests/unit/treat.test.js  (owner: T, TT4 §12.3, TT5 §13.3) — the treat panel state machine and view, with a fake card
// event and a stubbed postMessage; TT5 adds the standalone direct mode (treatApi.js) with a FAKE fetch only. No test here
// ever reaches the network, and no real treat is ever sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  treatView, treatEligible, phaseForResult, createTreatController, newRequestId, installTreatPanel, TREAT_TIMEOUT_MS,
  EV_CARD_OPEN, EV_CARD_CLOSE,
} from '../../src/shelter/treat.js';
import { TREAT_COPY, PLAY_URL } from '../../src/shelter/treatCopy.js';
import * as api from '../../src/shelter/treatApi.js';
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
  assert.equal(TREAT_COPY.free, 'Token Tails sends a free treat. You pay nothing.');
  assert.equal(TREAT_COPY.custody, 'Held by Token Tails for the shelter until handover.');
  const src = fs.readFileSync(new URL('../../src/shelter/treat.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(/, 'treat.js never fetches; treatApi.js does, only in direct mode');
  assert.doesNotMatch(src, /shelter-payouts\/give/, 'the old give-page link is gone');
  assert.doesNotMatch(src, /location\.(assign|replace|href\s*=)|window\.open\(/, 'the game tab never navigates');
  const apiSrc = fs.readFileSync(new URL('../../src/shelter/treatApi.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(apiSrc, /accesstoken|firebase|text\/plain/i, 'guest route only, JSON only, no token');
  assert.doesNotMatch(apiSrc, /location\.(assign|replace|href\s*=)|window\.open\(/);
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
    paused: treatView(card(), { ...live, rail: 'paused' }, { embedded: true }),
    error: treatView(card({ phase: 'error', retry: true }), live, { embedded: true }),
    link: treatView(card(), live, { embedded: false }),
  };
  for (const [k, v] of Object.entries(views)) {
    assert.equal(v.phase, k, k);
    assert.equal(v.free, TREAT_COPY.free, `${k} free line`); assert.equal(v.custody, TREAT_COPY.custody, `${k} custody line`);
  }
  assert.equal(views.open.button.label, 'Send Pink Paw a treat for Judas');
  assert.equal(views.sending.button.disabled, true);
  assert.equal(views.sending.message, null, 'sending shows once, on the button only');
  assert.equal(views.sending.button.label, TREAT_COPY.sending);
  assert.equal(views.sent.button, null);
  assert.equal(views.sent.message, 'Treat sent! 0.01 USDC is on its way to Pink Paw (Rožinė pėdutė).');
  assert.deepEqual(views.sent.links.map((l) => l.label), ['View on explorer', 'Receipt']);
  assert.equal(views.already.button, null); assert.equal(views.already.message, TREAT_COPY.already);
  assert.equal(views.exhausted.button, null); assert.equal(views.soon.button, null);
  assert.equal(views.paused.button, null); assert.equal(views.paused.message, 'Treats are paused right now.');
  assert.equal(views.soon.message, 'Real shelter treats open soon.');
  assert.equal(views.error.button.label, 'Try again'); assert.equal(views.error.message, TREAT_COPY.error);
  assert.equal(treatView(card({ phase: 'error', retry: false }), live, { embedded: true }).button, null, 'signed-out / not-eligible: no retry');
  // checking (no treat-state yet) still lets the player try: the host answers with the real outcome
  assert.equal(treatView(card(), { rail: 'checking', sentToday: false }, { embedded: true }).phase, 'open');
  // link mode (another host): a new-tab link to /swordcat and a Copy link button, never a send button
  assert.equal(PLAY_URL, 'https://tokentails.com/swordcat');
  assert.deepEqual(views.link.button, { id: 'copy', label: 'Copy link' });
  assert.deepEqual(views.link.links, [{ href: PLAY_URL, label: 'Open tokentails.com/swordcat' }]);
  assert.equal(views.link.message, 'Play on tokentails.com/swordcat to send a free treat. Opens in a new tab.');
  assert.equal(treatView(card({ copied: 'ok' }), live, { mode: 'link' }).message, TREAT_COPY.copied);
  assert.equal(treatView(card({ copied: 'fail' }), live, { mode: 'link' }).message, TREAT_COPY.copyFailed);
  // direct mode: checking disables the button until both reads are back
  const chk = treatView(card(), { rail: 'checking', sentToday: false }, { mode: 'direct' });
  assert.equal(chk.phase, 'checking'); assert.equal(chk.button.disabled, true); assert.equal(chk.button.label, "Checking today's treat…");
  assert.equal(chk.custody, TREAT_COPY.custody);
  assert.equal(treatView(card(), live, { mode: 'direct' }).phase, 'open');
});

test('treat: result kinds map to phases; unknown kinds are null', () => {
  assert.deepEqual(phaseForResult('sent'), { phase: 'sent', retry: false });
  assert.deepEqual(phaseForResult('already-today'), { phase: 'already', retry: false });
  assert.deepEqual(phaseForResult('paused'), { phase: 'paused', retry: false });
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
  assert.match(text(panel), /Send Pink Paw a treat for Judas/);
  assert.match(text(panel), /Token Tails sends a free treat\./); assert.match(text(panel), /until handover\./);
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

// ------------------------------------------------------------------ TT5: standalone direct mode (fake fetch only)
const HASH = `0x${'ab'.repeat(32)}`;
/** A fake fetch: `routes[path]` is `{ status, body }` or a function(init) → that, or 'throw'. Records every call. */
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url, path: u.pathname, init });
    assert.equal(u.origin, 'https://api.tokentails.com', 'only the API origin');
    let r = routes[u.pathname];
    if (typeof r === 'function') r = await r(init);
    if (r === 'throw' || r === undefined) throw new TypeError('Failed to fetch');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => { if (r.body === undefined) throw new SyntaxError('no json'); return r.body; } };
  };
  f.calls = calls;
  return f;
}
const STATUS_LIVE = { enabled: true, railState: 'live', treatsLeftToday: 40, amountWei: '10000000000000000', chainId: 5042,
  chains: [{ chainId: 5042, main: true, enabled: true, railState: 'live', treatsLeftToday: 40, amountWei: '10000000000000000', coin: 'USDC' }] };

test('treat TT5: directAllowed only on https://tokentails.com', () => {
  assert.equal(api.directAllowed({ protocol: 'https:', hostname: 'tokentails.com' }), true);
  assert.equal(api.directAllowed({ protocol: 'https:', hostname: 'TokenTails.com' }), true);
  assert.equal(api.directAllowed({ protocol: 'https:', hostname: 'www.tokentails.com' }), false);
  assert.equal(api.directAllowed({ protocol: 'http:', hostname: 'tokentails.com' }), false);
  assert.equal(api.directAllowed({ protocol: 'http:', hostname: 'localhost' }), false);
  assert.equal(api.directAllowed({ protocol: 'https:', hostname: 'tokentails.com.evil.io' }), false);
  assert.equal(api.directAllowed(null), false);
});

test('treat TT5: rail and today row reads map like the /swordcat host', () => {
  assert.deepEqual(api.railOf(STATUS_LIVE), { rail: 'live', amountLabel: '0.01 USDC' });
  assert.deepEqual(api.railOf({ ...STATUS_LIVE, railState: 'exhausted', treatsLeftToday: 0, chains: [] }), { rail: 'exhausted' });
  assert.deepEqual(api.railOf({ ...STATUS_LIVE, treatsLeftToday: 0, chains: [] }), { rail: 'exhausted' });
  assert.deepEqual(api.railOf({ enabled: false, railState: 'paused' }), { rail: 'paused' });
  assert.deepEqual(api.railOf({ enabled: true, railState: 'paused' }), { rail: 'paused' });
  assert.deepEqual(api.railOf({ enabled: false, railState: 'not-deployed' }), { rail: 'soon' });
  assert.deepEqual(api.railOf({ enabled: false }), { rail: 'soon' });
  assert.deepEqual(api.railOf(null), { rail: 'soon' });
  // main chain spent, another chain open: send on that chain
  const other = { ...STATUS_LIVE, railState: 'exhausted', treatsLeftToday: 0, chains: [STATUS_LIVE.chains[0], { chainId: 4217, enabled: true, railState: 'live', treatsLeftToday: 5, amountWei: '10000000000000000', coin: 'USDC.e' }] };
  assert.deepEqual(api.railOf(other), { rail: 'live', chainId: 4217, amountLabel: '0.01 USDC.e' });
  for (const s of ['PENDING', 'SENT', 'CONFIRMED']) assert.equal(api.sentTodayOf({ today: { status: s } }), true, s);
  assert.equal(api.sentTodayOf({ today: { status: 'FAILED' } }), false, 'a failed row gives the day back');
  assert.equal(api.sentTodayOf({ today: null }), false);
  assert.equal(api.sentTodayOf('junk'), false);
  assert.equal(api.formatWei('5000000000000000'), '0.01', 'half up');
  assert.equal(api.formatWei('0'), null);
  assert.equal(api.amountLabel('10000000000000000', 'a very long coin name'), null, 'labels that would fail the bridge check are dropped');
});

test('treat TT5: every POST answer maps to the host kinds', () => {
  const k = api.kindOf;
  assert.equal(k(200, {}), 'sent');
  assert.equal(k(201, null), 'sent');
  assert.equal(k(429, { statusCode: 429, code: 'DONATE_ALREADY_TODAY' }), 'already-today');
  assert.equal(k(429, { message: { code: 'DONATE_ALREADY_TODAY' } }), 'already-today', 'nested code');
  assert.equal(k(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' }), 'retry', 'a bare 429 is the limiter');
  assert.equal(k(429, null), 'retry');
  assert.equal(k(409, { code: 'DONATE_PAUSED' }), 'paused');
  assert.equal(k(409, { code: 'DONATE_BUDGET_SPENT' }), 'budget-spent');
  assert.equal(k(409, {}), 'paused', 'an older backend');
  assert.equal(k(424, { code: 'DONATE_SEND_FAILED' }), 'failed');
  assert.equal(k(424, null), 'failed');
  assert.equal(k(503, null), 'paused', 'no visitor address');
  assert.equal(k(401, null), 'signed-out');
  assert.equal(k(403, { code: 'GUEST_FORBIDDEN' }), 'signed-out');
  assert.equal(k(400, { code: 'DONATE_NOT_ELIGIBLE' }), 'not-eligible');
  assert.equal(k(500, null), 'retry');
});

test('treat TT5: receipt links are https and built only from a real tx hash', () => {
  const ok = api.receiptOf({ txHash: HASH, chainId: 5042, amountWei: '10000000000000000', explorerUrl: `https://testnet.arcscan.app/tx/${HASH}` });
  assert.deepEqual(ok, { explorerUrl: `https://testnet.arcscan.app/tx/${HASH}`, receiptPath: `https://tokentails.com/shelter-payouts/receipt?chain=5042&tx=${HASH}`, amountLabel: '0.01 USDC' });
  assert.deepEqual(api.receiptOf({ txHash: '0xfeed', chainId: 5042, explorerUrl: 'http://x.io/tx/1' }), {}, 'short hash and http explorer dropped');
  assert.deepEqual(api.receiptOf({ txHash: HASH, chainId: 0 }), {}, 'no chain, no receipt');
  assert.equal(api.receiptOf({ txHash: HASH, chainId: 1, explorerUrl: 'https://u:p@x.io/' }).explorerUrl, undefined, 'no credentials in links');
  assert.equal(api.httpsUrl('javascript:alert(1)'), null);
  assert.deepEqual(api.receiptOf(null), {});
});

test('treat TT5: sendGuestTreat posts JSON to the guest route, credentials omitted, never throws', async () => {
  const f = fakeFetch({ '/shelter/donate/guest': { status: 200, body: { txHash: HASH, chainId: 5042, amountWei: '10000000000000000', explorerUrl: 'https://arcscan.app/tx/1' } } });
  const r = await api.sendGuestTreat({ fetchImpl: f, chainId: 4217 });
  assert.equal(r.kind, 'sent'); assert.equal(r.receiptPath, `https://tokentails.com/shelter-payouts/receipt?chain=5042&tx=${HASH}`);
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.tokentails.com/shelter/donate/guest');
  assert.equal(c.init.method, 'POST'); assert.equal(c.init.credentials, 'omit');
  assert.equal(c.init.headers['content-type'], 'application/json');
  assert.equal(c.init.headers.accesstoken, undefined);
  assert.deepEqual(JSON.parse(c.init.body), { source: 'page', chainId: 4217 });
  const r0 = await api.sendGuestTreat({ fetchImpl: fakeFetch({ '/shelter/donate/guest': { status: 200, body: {} } }) });
  assert.deepEqual(r0, { kind: 'sent' });
  assert.deepEqual(await api.sendGuestTreat({ fetchImpl: fakeFetch({ '/shelter/donate/guest': { status: 429, body: { code: 'DONATE_ALREADY_TODAY' } } }) }), { kind: 'already-today' });
  assert.deepEqual(await api.sendGuestTreat({ fetchImpl: fakeFetch({ '/shelter/donate/guest': { status: 424 } }) }), { kind: 'failed' }, 'no JSON body');
  assert.deepEqual(await api.sendGuestTreat({ fetchImpl: fakeFetch({ '/shelter/donate/guest': 'throw' }) }), { kind: 'retry' }, 'a thrown TypeError (offline or CORS)');
  // the send timeout aborts the request
  const hang = async (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  const t0 = Date.now();
  assert.deepEqual(await api.sendGuestTreat({ fetchImpl: hang, timeoutMs: 30 }), { kind: 'retry' });
  assert.ok(Date.now() - t0 < 2000);
});

test('treat TT5: readRail / readMe use GET only and fail soft', async () => {
  const f = fakeFetch({ '/shelter/donate/status': { status: 200, body: STATUS_LIVE }, '/shelter/donate/guest/me': { status: 200, body: { today: { status: 'CONFIRMED' } } } });
  assert.deepEqual(await api.readRail({ fetchImpl: f }), { rail: 'live', amountLabel: '0.01 USDC' });
  assert.deepEqual(await api.readMe({ fetchImpl: f }), { sentToday: true });
  assert.ok(f.calls.every((c) => c.init.method === 'GET' && c.init.credentials === 'omit'));
  const bad = fakeFetch({ '/shelter/donate/status': 'throw', '/shelter/donate/guest/me': { status: 503 } });
  assert.deepEqual(await api.readRail({ fetchImpl: bad }), { rail: 'soon' });
  assert.deepEqual(await api.readMe({ fetchImpl: bad }), { sentToday: false });
});

/** A direct controller with a fake transport; `answers` is the queue of send results. */
function directCtl({ rail = { rail: 'live', amountLabel: '0.01 USDC' }, me = { sentToday: false }, answers = [] } = {}) {
  const sends = [], changes = [], timers = fakeTimers();
  let n = 0;
  const transport = {
    readRail: async () => rail,
    readMe: async () => me,
    send: (o) => { sends.push(o); const a = answers.shift(); return a instanceof Promise ? a : Promise.resolve(a); },
  };
  const ctl = createTreatController({ mode: 'direct', direct: transport, timers, idFn: () => `d-${++n}`, onChange: (c) => changes.push(c.phase) });
  return { ctl, sends, changes, timers };
}
const tick = () => new Promise((r) => setImmediate(r));

test('treat TT5: direct mode checks first, then sends through the transport and shows the receipt', async () => {
  const { ctl, sends } = directCtl({ answers: [{ kind: 'sent', explorerUrl: 'https://arcscan.app/tx/1', receiptPath: `https://tokentails.com/shelter-payouts/receipt?chain=5042&tx=${HASH}`, amountLabel: '0.01 USDC' }] });
  assert.equal(ctl.mode, 'direct'); assert.equal(ctl.embedded, false);
  ctl.open(card());
  assert.equal(ctl.view().phase, 'checking');
  assert.equal(ctl.send(), null, 'the checking button does nothing');
  await ctl.refresh();
  assert.equal(ctl.view().phase, 'open');
  assert.equal(ctl.send(), 'd-1');
  assert.equal(ctl.view().phase, 'sending');
  assert.equal(ctl.send(), null, 'one send in flight');
  await tick();
  assert.deepEqual(sends, [{}]);
  const v = ctl.view();
  assert.equal(v.phase, 'sent');
  assert.equal(v.message, 'Treat sent! 0.01 USDC is on its way to Pink Paw (Rožinė pėdutė).');
  assert.deepEqual(v.links.map((l) => l.href), ['https://arcscan.app/tx/1', `https://tokentails.com/shelter-payouts/receipt?chain=5042&tx=${HASH}`]);
  assert.equal(ctl.state.sentToday, true);
  // the next card shows "already", and a fresh read cannot undo it
  ctl.open(card({ slot: 'pebble', cat: { name: 'Simas', status: 'WAITING' } }));
  await ctl.refresh(true);
  assert.equal(ctl.view().phase, 'already');
});

test('treat TT5: direct mode states: already from the read, used up, paused, retry, timeout', async () => {
  const a = directCtl({ me: { sentToday: true } }); a.ctl.open(card()); await a.ctl.refresh();
  assert.equal(a.ctl.view().phase, 'already');
  const b = directCtl({ rail: { rail: 'exhausted' } }); b.ctl.open(card()); await b.ctl.refresh();
  assert.equal(b.ctl.view().phase, 'exhausted'); assert.equal(b.ctl.view().button, null);
  const c = directCtl({ rail: { rail: 'soon' } }); c.ctl.open(card()); await c.ctl.refresh();
  assert.equal(c.ctl.view().phase, 'soon');
  // send on another chain when only that one is open
  const d = directCtl({ rail: { rail: 'live', chainId: 4217 }, answers: [{ kind: 'budget-spent' }] }); d.ctl.open(card()); await d.ctl.refresh();
  d.ctl.send(); await tick();
  assert.deepEqual(d.sends, [{ chainId: 4217 }]);
  assert.equal(d.ctl.view().phase, 'exhausted');
  // paused answer, then retry answer shows Try again, which sends again
  const e = directCtl({ answers: [{ kind: 'retry' }, { kind: 'paused' }] }); e.ctl.open(card()); await e.ctl.refresh();
  e.ctl.send(); await tick();
  assert.equal(e.ctl.view().phase, 'error'); assert.equal(e.ctl.view().button.label, 'Try again');
  e.ctl.send(); await tick();
  assert.equal(e.ctl.view().phase, 'paused');
  // a transport that throws is a retry
  const f = directCtl({ answers: [Promise.reject(new Error('boom'))] }); f.ctl.open(card()); await f.ctl.refresh();
  f.ctl.send(); await tick();
  assert.equal(f.ctl.view().phase, 'error');
  // no answer: the 15 s timer shows Try again, the late answer is ignored
  let late;
  const g = directCtl({ answers: [new Promise((r) => { late = r; })] }); g.ctl.open(card()); await g.ctl.refresh();
  g.ctl.send();
  assert.equal(g.timers.list[0].ms, TREAT_TIMEOUT_MS);
  g.timers.fire();
  assert.equal(g.ctl.view().phase, 'error'); assert.equal(g.ctl.view().button.label, 'Try again');
  late({ kind: 'sent' }); await tick();
  assert.equal(g.ctl.view().phase, 'error', 'a late answer after the timeout is ignored');
  // reads are cached for RAIL_TTL_MS
  let reads = 0;
  const h = createTreatController({ mode: 'direct', direct: { readRail: async () => { reads++; return { rail: 'live' }; }, readMe: async () => ({ sentToday: false }), send: async () => ({ kind: 'sent' }) } });
  h.open(card()); await h.refresh(); await h.refresh();
  assert.equal(reads, 1);
});

test('treat TT5: link mode never sends; Copy link reports back; installTreatPanel picks the mode', async () => {
  const off = createTreatController({ mode: 'link', direct: { send: () => { throw new Error('never'); } } });
  off.open(card());
  assert.equal(off.view().phase, 'link');
  assert.equal(off.send(), null);
  off.copied(true); assert.equal(off.view().message, TREAT_COPY.copied);
  const bus = new EventBus();
  const doc = { head: null, createElement: () => ({}), defaultView: { location: { protocol: 'http:', hostname: 'localhost' } } };
  const l = installTreatPanel({ ctx: { bus } }, { doc });
  assert.equal(l.mode, 'link'); l.uninstall();
  const docTT = { ...doc, defaultView: { location: { protocol: 'https:', hostname: 'tokentails.com' } } };
  const d = installTreatPanel({ ctx: { bus } }, { doc: docTT, direct: { send: async () => ({ kind: 'sent' }) } });
  assert.equal(d.mode, 'direct'); d.uninstall();
  const parent = { postMessage() {} };
  const e = installTreatPanel({ ctx: { bus } }, { doc: docTT, bridge: createBridge({ parent, allowed: ['https://tokentails.com'] }) });
  assert.equal(e.mode, 'embedded', 'the frame always uses the bridge'); e.uninstall();
});
