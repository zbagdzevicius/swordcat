// tests/unit/embed.test.js  (owner: core) — Token Tails embed bridge v1 (docs/TOKENTAILS-PLAN.md §5.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBED_NS, EMBED_VERSION, DEFAULT_EMBED_ORIGINS, HOST_TYPES, isFramed, wantsEmbed, embedActive, markEmbed, parseOrigins,
  embedOrigins, acceptMessage, envelope, levelCompletePayload, createBridge, installEmbedBridge,
  parseTreatState, parseTreatResult, catSavedPayload, treatRequestPayload, cleanExplorerUrl, cleanReceiptPath, cleanAmount, EV_CAT_SAVED,
} from '../../src/core/embed.js';
import { EventBus } from '../../src/core/EventBus.js';
import { E } from '../../src/core/events.js';

const HOST = 'https://tokentails.com';
const ALLOWED = parseOrigins(DEFAULT_EMBED_ORIGINS);
const msg = (type, extra = {}) => ({ ns: EMBED_NS, v: EMBED_VERSION, type, ...extra });

function fakeParent() {
  const sent = [];
  return { sent, postMessage(data, origin) { sent.push({ data, origin }); } };
}

test('embed: allowlist parsing normalises origins and falls back to the default', () => {
  assert.deepEqual(ALLOWED, ['https://tokentails.com', 'https://www.tokentails.com', 'http://localhost:3000']);
  assert.deepEqual(parseOrigins(' https://a.example/path/ , not a url,http://localhost:3000/ ,https://a.example'), ['https://a.example', 'http://localhost:3000']);
  assert.deepEqual(parseOrigins(''), ALLOWED); assert.deepEqual(parseOrigins(undefined), ALLOWED);
  assert.deepEqual(embedOrigins({ VITE_EMBED_ORIGINS: 'https://swordcat.tokentails.com' }), ['https://swordcat.tokentails.com']);
  assert.deepEqual(embedOrigins({}), ALLOWED);
});

test('embed: mode = framed + ?embed=1; markEmbed sets <html data-embed="1">', () => {
  assert.equal(wantsEmbed('?embed=1'), true); assert.equal(wantsEmbed('?embed=0'), false); assert.equal(wantsEmbed(''), false);
  const top = {}; top.parent = top;
  const framed = { parent: {} };
  assert.equal(isFramed(top), false); assert.equal(isFramed(framed), true); assert.equal(isFramed(undefined), false);
  assert.equal(embedActive('?embed=1', framed), true);
  assert.equal(embedActive('?embed=1', top), false, 'top-level ?embed=1 is not embed mode');
  assert.equal(embedActive('', framed), false);
  const doc = { documentElement: { dataset: {} } };
  markEmbed(doc); assert.equal(doc.documentElement.dataset.embed, '1');
});

test('embed: acceptMessage ignores a wrong source, a wrong origin, unknown types and foreign envelopes', () => {
  const parent = {};
  const ok = acceptMessage({ source: parent, origin: HOST, data: msg('hello') }, { parent, allowed: ALLOWED });
  assert.equal(ok?.type, 'hello');
  assert.equal(acceptMessage({ source: {}, origin: HOST, data: msg('hello') }, { parent, allowed: ALLOWED }), null, 'wrong source');
  assert.equal(acceptMessage({ source: parent, origin: 'https://evil.example', data: msg('hello') }, { parent, allowed: ALLOWED }), null, 'wrong origin');
  assert.equal(acceptMessage({ source: parent, origin: HOST, data: msg('launch-missiles') }, { parent, allowed: ALLOWED }), null, 'unknown type');
  assert.equal(acceptMessage({ source: parent, origin: HOST, data: { ...msg('hello'), ns: 'other' } }, { parent, allowed: ALLOWED }), null, 'other namespace');
  assert.equal(acceptMessage({ source: parent, origin: HOST, data: { ...msg('hello'), v: 2 } }, { parent, allowed: ALLOWED }), null, 'other version');
  assert.equal(acceptMessage({ source: parent, origin: HOST, data: 'hello' }, { parent, allowed: ALLOWED }), null, 'non-object');
  assert.equal(acceptMessage({ source: parent, origin: HOST, data: msg('pause') }, { parent, allowed: ALLOWED }), null, 'nothing but hello before the handshake');
  assert.equal(acceptMessage({ source: parent, origin: 'http://localhost:3000', data: msg('pause') }, { parent, allowed: ALLOWED, hostOrigin: HOST }), null, 'after the handshake only the host origin');
  assert.equal(acceptMessage({ source: parent, origin: HOST, data: msg('pause') }, { parent, allowed: ALLOWED, hostOrigin: HOST })?.type, 'pause');
  assert.deepEqual(HOST_TYPES, ['hello', 'session', 'audio', 'pause', 'resume', 'treat-state', 'treat-result']);
});

test('embed: hello → ready posted to the exact host origin (never "*"); nothing posts before the handshake', () => {
  const parent = fakeParent();
  const b = createBridge({ parent, allowed: ALLOWED, actions: { isReady: () => true } });
  assert.equal(b.post('paused', { paused: true }), false, 'no host origin yet');
  assert.equal(parent.sent.length, 0);
  assert.equal(b.handle({ source: {}, origin: HOST, data: msg('hello') }), null, 'wrong source ignored');
  assert.equal(b.handle({ source: parent, origin: 'https://evil.example', data: msg('hello') }), null, 'wrong origin ignored');
  assert.equal(parent.sent.length, 0);
  assert.equal(b.handle({ source: parent, origin: HOST, data: msg('hello') }), 'hello');
  assert.equal(parent.sent.length, 1);
  assert.deepEqual(parent.sent[0], { data: { version: 1, ns: EMBED_NS, v: 1, type: 'ready' }, origin: HOST });
  b.post('kitten-rescued', { kittenId: 'k1' });
  assert.ok(parent.sent.every((s) => s.origin === HOST && s.origin !== '*'));
  assert.equal(b.handle({ source: parent, origin: HOST, data: msg('teleport') }), null, 'unknown type ignored');
});

test('embed: a hello before game:ready is answered on game:ready', () => {
  const parent = fakeParent();
  let ready = false;
  const b = createBridge({ parent, allowed: ALLOWED, actions: { isReady: () => ready } });
  b.handle({ source: parent, origin: HOST, data: msg('hello') });
  assert.equal(parent.sent.length, 0); assert.equal(b.readyPending, true);
  ready = true; b.onGameReady();
  assert.equal(parent.sent[0].data.type, 'ready'); assert.equal(b.readyPending, false);
});

test('embed: a slow boot under a host that keeps saying hello: one ready on game:ready, every later hello answered', () => {
  // the tokentails host says hello every 0.5 s, then every 2 s, until it hears ready (no hard stop since the fix for
  // slow phones); after a frame reload (or the host's Reload) it starts saying hello again
  const parent = fakeParent();
  let ready = false;
  const b = createBridge({ parent, allowed: ALLOWED, actions: { isReady: () => ready } });
  for (let i = 0; i < 40; i++) b.handle({ source: parent, origin: HOST, data: msg('hello') });
  assert.equal(parent.sent.length, 0, 'nothing before game:ready');
  ready = true; b.onGameReady(); b.onGameReady();
  assert.deepEqual(parent.sent.map((s) => s.data.type), ['ready'], 'exactly one ready for the pending hellos');
  b.handle({ source: parent, origin: HOST, data: msg('hello') });
  assert.deepEqual(parent.sent.map((s) => s.data.type), ['ready', 'ready'], 'a hello after ready (host reconnect) is answered');
  assert.ok(parent.sent.every((s) => s.origin === HOST));
});

test('embed: session is stored only, audio mutes, pause / resume drive the game actions', () => {
  const parent = fakeParent(), calls = [];
  let paused = false;
  const b = createBridge({ parent, allowed: ALLOWED, actions: {
    isReady: () => true, isPaused: () => paused,
    pause: () => { calls.push('pause'); paused = true; }, resume: () => { calls.push('resume'); paused = false; },
    mute: (m) => calls.push(`mute:${m}`),
  } });
  const ev = (type, extra) => ({ source: parent, origin: HOST, data: msg(type, extra) });
  b.handle(ev('hello'));
  b.handle(ev('session', { signedIn: true, token: 'never-stored' }));
  assert.deepEqual(b.session, { signedIn: true }, 'no token kept');
  b.handle(ev('session', { signedIn: 'yes' })); assert.equal(b.session.signedIn, false, 'only boolean true counts');
  b.handle(ev('audio', { muted: true })); b.handle(ev('pause')); b.handle(ev('resume'));
  assert.deepEqual(calls, ['mute:true', 'pause', 'resume']);
  // pause while already paused: the host is told, the game is not paused twice
  paused = true; b.handle(ev('pause'));
  assert.deepEqual(calls, ['mute:true', 'pause', 'resume']);
  assert.deepEqual(parent.sent.at(-1).data, envelope('paused', { paused: true }));
});

test('embed: level:results → level-complete (fish → catnip); installEmbedBridge wires the bus and the window', () => {
  assert.deepEqual(levelCompletePayload({ levelId: 'meadow', time: 312.5, kittens: 3, kittensTotal: 4, letter: true, fish: 41, lives: 7, livesLost: 2, rank: 'purrfect' }),
    { levelId: 'meadow', time: 312.5, kittens: 3, catnip: 41, lives: 7, rank: 'purrfect' });
  assert.deepEqual(levelCompletePayload({}), { levelId: null, time: 0, kittens: 0, catnip: 0, lives: null, rank: null });

  const parent = fakeParent(), listeners = new Map();
  const win = { parent, addEventListener: (t, f) => listeners.set(t, f), removeEventListener: (t) => listeners.delete(t) };
  const bus = new EventBus();
  const modes = [];
  const game = {
    mode: 'play', ctx: { bus, params: { mute: false }, audio: { setVolumes: () => modes.push('vol') }, ui: null },
    pause(on) { this.mode = on ? 'menu' : 'play'; modes.push(this.mode); bus.emit(E.GAME_PAUSE, { paused: on }); },
  };
  const bridge = installEmbedBridge(game, { win, allowed: ALLOWED });
  assert.ok(bridge && listeners.has('message'));
  const send = (type, extra, origin = HOST, source = parent) => listeners.get('message')({ source, origin, data: msg(type, extra) });
  send('hello');
  assert.equal(parent.sent.length, 0, 'ready waits for game:ready');
  bus.emit(E.GAME_READY, {});
  assert.equal(parent.sent[0].data.type, 'ready');
  send('pause');
  assert.equal(game.mode, 'menu');
  assert.deepEqual(parent.sent.at(-1).data, envelope('paused', { paused: true }));
  send('resume', {}, 'https://evil.example');
  assert.equal(game.mode, 'menu', 'wrong origin cannot resume');
  send('resume');
  assert.equal(game.mode, 'play');
  send('audio', { muted: true });
  assert.equal(game.ctx.params.mute, true); assert.ok(modes.includes('vol'));
  bus.emit(E.LEVEL_RESULTS, { levelId: 'forest', time: 10, kittens: 2, fish: 5, lives: 9, rank: 'pawsome' });
  assert.deepEqual(parent.sent.at(-1).data, envelope('level-complete', { levelId: 'forest', time: 10, kittens: 2, catnip: 5, lives: 9, rank: 'pawsome' }));
  bus.emit(E.KITTEN_RESCUED, { kittenId: 'mittens', position: { x: 1 } });
  assert.deepEqual(parent.sent.at(-1).data, envelope('kitten-rescued', { kittenId: 'mittens' }));
  assert.ok(parent.sent.every((s) => s.origin === HOST));
  bridge.dispose();
  assert.equal(listeners.has('message'), false);
  // not framed → no bridge
  const top = { addEventListener() {} }; top.parent = top;
  assert.equal(installEmbedBridge(game, { win: top, allowed: ALLOWED }), null);
});

// ------------------------------------------------------------------ TT4 §12.2 treat messages
test('embed TT4: treat-state / treat-result parsing drops wrong types, long fields and non-https links', () => {
  assert.deepEqual(parseTreatState({ rail: 'live', sentToday: false, amountLabel: '0.01 USDC' }), { rail: 'live', sentToday: false, amountLabel: '0.01 USDC' });
  assert.deepEqual(parseTreatState({ rail: 'soon', sentToday: true, amountLabel: '<b>free</b>' }), { rail: 'soon', sentToday: true });
  assert.equal(parseTreatState({ rail: 'open', sentToday: false }), null);
  assert.equal(parseTreatState({ rail: 'live', sentToday: 'yes' }), null);
  assert.equal(cleanAmount('$0.01'), '$0.01'); assert.equal(cleanAmount('0.01 USDC.e'), '0.01 USDC.e');
  assert.equal(cleanAmount('Send money now to ...'), null); assert.equal(cleanAmount('x'.repeat(30)), null);
  assert.equal(cleanExplorerUrl('https://explorer.arc.io/tx/0xabc'), 'https://explorer.arc.io/tx/0xabc');
  assert.equal(cleanExplorerUrl('http://explorer.arc.io/tx/0xabc'), null);
  assert.equal(cleanExplorerUrl('javascript:alert(1)'), null);
  assert.equal(cleanExplorerUrl('https://u:p@evil.example/'), null);
  assert.equal(cleanExplorerUrl('https://e.io/' + 'a'.repeat(400)), null);
  assert.equal(cleanReceiptPath('/shelter-payouts/receipt?chain=5042&tx=0xabc'), '/shelter-payouts/receipt?chain=5042&tx=0xabc');
  assert.equal(cleanReceiptPath('//evil.example/shelter-payouts/receipt?'), null);
  assert.equal(cleanReceiptPath('https://evil.example/shelter-payouts/receipt?x'), null);
  const ok = { requestId: 't-abc-1', kind: 'sent', explorerUrl: 'https://explorer.arc.io/tx/0x1', receiptPath: '/shelter-payouts/receipt?chain=5042&tx=0x1', amountLabel: '0.01 USDC' };
  assert.deepEqual(parseTreatResult(ok), ok);
  assert.deepEqual(parseTreatResult({ ...ok, explorerUrl: 'http://x.io', receiptPath: '/elsewhere', message: 'free text' }), { requestId: 't-abc-1', kind: 'sent', amountLabel: '0.01 USDC' });
  assert.equal(parseTreatResult({ ...ok, kind: 'adopted' }), null);
  assert.equal(parseTreatResult({ ...ok, requestId: 'x'.repeat(41) }), null);
  assert.equal(parseTreatResult({ ...ok, requestId: 'a b' }), null);
});

test('embed TT4: cat-saved / treat-request payloads keep only bounded fields', () => {
  assert.deepEqual(catSavedPayload({ slot: 'pickles', kind: 'lost', cat: { id: '6a3055e21d6649b19b03688a', name: 'Judas', photo: 'https://x' } }),
    { slot: 'pickles', kind: 'lost', catId: '6a3055e21d6649b19b03688a', catName: 'Judas' });
  assert.deepEqual(catSavedPayload({ slot: 'mochi', kind: 'squire' }), { slot: 'mochi', kind: 'squire' });
  assert.equal(catSavedPayload({ slot: 'mochi', kind: 'boss' }), null);
  assert.equal(catSavedPayload({ slot: 'x'.repeat(65), kind: 'lost' }), null);
  assert.deepEqual(catSavedPayload({ slot: 's', kind: 'lost', catName: 'n'.repeat(33) }), { slot: 's', kind: 'lost' });
  assert.deepEqual(treatRequestPayload({ requestId: 't-1', slot: 'pickles', catId: 'id1', catName: 'Judas', token: 'fbSECRET' }),
    { requestId: 't-1', slot: 'pickles', catId: 'id1', catName: 'Judas' });
  assert.equal(treatRequestPayload({ requestId: 't-1', slot: 'pickles', catName: '' }), null);
  assert.equal(treatRequestPayload({ requestId: 'bad id', slot: 'pickles', catName: 'Judas' }), null);
});

test('embed TT4: the bridge relays treat-state / treat-result to subscribers and posts cat-saved, never to *', () => {
  const parent = fakeParent();
  const b = createBridge({ parent, allowed: ALLOWED });
  const ev = (type, extra = {}, origin = HOST) => ({ source: parent, origin, data: msg(type, extra) });
  assert.equal(b.post('treat-request', { requestId: 't-1', slot: 'a', catName: 'Judas' }), false, 'nothing before hello');
  assert.equal(b.handle(ev('treat-state', { rail: 'live', sentToday: false })), null, 'nothing but hello before the handshake');
  b.handle(ev('hello'));
  const got = { states: [], results: [] };
  const off = b.onTreat({ state: (s) => got.states.push(s), result: (r) => got.results.push(r) });
  assert.equal(b.handle(ev('treat-state', { rail: 'live', sentToday: false, amountLabel: '0.01 USDC' })), 'treat-state');
  assert.equal(b.handle(ev('treat-state', { rail: 'bogus', sentToday: false })), null);
  assert.equal(b.handle(ev('treat-result', { requestId: 't-1', kind: 'sent' }, 'https://evil.example')), null);
  assert.equal(b.handle(ev('treat-result', { requestId: 't-1', kind: 'sent' })), 'treat-result');
  assert.deepEqual(got.states, [{ rail: 'live', sentToday: false, amountLabel: '0.01 USDC' }]);
  assert.deepEqual(got.results, [{ requestId: 't-1', kind: 'sent' }]);
  // a late subscriber gets the last state replayed
  const late = []; b.onTreat({ state: (s) => late.push(s) });
  assert.equal(late.length, 1);
  off();
  assert.equal(b.post('treat-request', { requestId: 't-2', slot: 'a', catName: 'Judas', accesstoken: 'fbX' }), true);
  assert.deepEqual(parent.sent.at(-1).data, envelope('treat-request', { requestId: 't-2', slot: 'a', catName: 'Judas' }));
  assert.equal(b.post('cat-saved', { slot: 'a', kind: 'nope' }), false);
  assert.ok(parent.sent.every((s) => s.origin === HOST));

  // installEmbedBridge forwards CAT_SAVED
  const p2 = fakeParent(), listeners = new Map();
  const win = { parent: p2, addEventListener: (t, f) => listeners.set(t, f), removeEventListener: (t) => listeners.delete(t) };
  const bus = new EventBus();
  const bridge = installEmbedBridge({ mode: 'play', ctx: { bus } }, { win, allowed: ALLOWED });
  listeners.get('message')({ source: p2, origin: HOST, data: msg('hello') });
  bus.emit(E.GAME_READY, {});
  bus.emit(EV_CAT_SAVED, { slot: 'pebble', kind: 'lost', cat: { id: '6a304e8f1d6649b19b036500', name: 'Simas' } });
  assert.deepEqual(p2.sent.at(-1).data, envelope('cat-saved', { slot: 'pebble', kind: 'lost', catId: '6a304e8f1d6649b19b036500', catName: 'Simas' }));
  bridge.dispose();
});
