// src/core/embed.js  (owner: core) — Token Tails embed bridge, version 1 (docs/TOKENTAILS-PLAN.md §5.5).
//
// Active only when the page runs inside a frame (window.parent !== window) AND the URL has ?embed=1. main.js marks
// <html data-embed="1"> before the game starts (ui hides Fullscreen / Quit on it) and installs the bridge; Game's
// parseParams never enables the debug hooks in embed mode.
//
// Envelope: { ns: 'tt-swordcat', v: 1, type, ...payload }. Unknown types are ignored.
//   host → game: hello (→ ready), session { signedIn } (stored only, never a token), audio { muted }, pause, resume
//   game → host: ready { version }, level-complete { levelId, time, kittens, catnip, lives, rank },
//                kitten-rescued { kittenId }, paused { paused }
// TT4 §12.2 (additive): game → host cat-saved { slot, kind, catId?, catName? }, treat-request { requestId, slot, catId?,
//   catName }; host → game treat-state { rail, sentToday, amountLabel? }, treat-result { requestId, kind, explorerUrl?,
//   receiptPath?, amountLabel? }. Both directions are length-checked; explorer links must be https, receipt paths must
//   start with /shelter-payouts/receipt?. No free text crosses. The treat panel (src/shelter/treat.js) is installed here.
// Security: a message is accepted only when event.source === window.parent and event.origin is in the allowlist
// (VITE_EMBED_ORIGINS, comma-separated; default below; plus the page's own origin when the parent is same-origin). The first valid `hello` fixes the host origin; after that only
// that origin is accepted and every post goes to it (never '*'). Nothing is posted before the first `hello`, so the
// host keeps saying hello until it hears `ready` (no hard stop: a slow phone may need well over 10 s to boot); a hello
// before game:ready is answered on game:ready, every later one at once (the host's reconnect after a frame reload).
// Layout contract: the host's 44 px exit button sits 6 px inside the frame's top-left corner; ui keeps that corner free
// (`--embed-gut` in src/ui/ui.css).
// The parsing / decision helpers are pure (tests/unit/embed.test.js); the DOM / game glue is installEmbedBridge().
import { E } from './events.js';
import { installTreatPanel } from '../shelter/treat.js';

export const EMBED_NS = 'tt-swordcat';
export const EMBED_VERSION = 1;
export const DEFAULT_EMBED_ORIGINS = 'https://tokentails.com,https://www.tokentails.com,http://localhost:3000';
/** host → game message types (anything else is ignored) */
export const HOST_TYPES = Object.freeze(['hello', 'session', 'audio', 'pause', 'resume', 'treat-state', 'treat-result']);
/** CAT_SAVED (R owns events.js; the literal is the §12.3 contract fallback) */
export const EV_CAT_SAVED = E.CAT_SAVED ?? 'cat:saved';

// ------------------------------------------------------------------ TT4 treat messages (§12.2), pure checks
export const TREAT_RAILS = Object.freeze(['checking', 'live', 'exhausted', 'soon']);
export const TREAT_KINDS = Object.freeze(['sent', 'already-today', 'paused', 'budget-spent', 'failed', 'retry', 'not-eligible', 'signed-out']);
export const SAVE_KINDS = Object.freeze(['lost', 'squire', 'service']);
const RECEIPT_PREFIX = '/shelter-payouts/receipt?';
const REQ_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** an amount like "0.01 USDC", "$0.01" or "€0.01" */
const AMOUNT = /^[$€]?[0-9]{1,6}(\.[0-9]{1,6})?( [A-Za-z.]{2,8})?$/;
const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/** `amountLabel` or null. Pure. */
export function cleanAmount(v) { const s = str(v, 24); return s && AMOUNT.test(s) ? s : null; }

/** An https URL (≤ 300 chars), else null. Pure. */
export function cleanExplorerUrl(v) {
  const s = str(v, 300);
  if (!s) return null;
  try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}

/** A same-site receipt path `/shelter-payouts/receipt?…` (≤ 200 chars), else null. Pure. */
export function cleanReceiptPath(v) {
  const s = str(v, 200);
  if (!s || !s.startsWith(RECEIPT_PREFIX) || /[\s\\]/.test(s)) return null;
  return s;
}

/** host `treat-state` → { rail, sentToday, amountLabel? } or null. Pure. */
export function parseTreatState(m) {
  if (!m || !TREAT_RAILS.includes(m.rail) || typeof m.sentToday !== 'boolean') return null;
  const out = { rail: m.rail, sentToday: m.sentToday };
  const a = cleanAmount(m.amountLabel);
  if (a) out.amountLabel = a;
  return out;
}

/** host `treat-result` → { requestId, kind, explorerUrl?, receiptPath?, amountLabel? } or null. Pure. */
export function parseTreatResult(m) {
  if (!m || typeof m.requestId !== 'string' || !REQ_ID.test(m.requestId) || !TREAT_KINDS.includes(m.kind)) return null;
  const out = { requestId: m.requestId, kind: m.kind };
  const x = cleanExplorerUrl(m.explorerUrl); if (x) out.explorerUrl = x;
  const r = cleanReceiptPath(m.receiptPath); if (r) out.receiptPath = r;
  const a = cleanAmount(m.amountLabel); if (a) out.amountLabel = a;
  return out;
}

/** CAT_SAVED payload → the `cat-saved` message, or null. Pure. */
export function catSavedPayload(p) {
  const slot = str(p?.slot, 64);
  if (!slot || !SAVE_KINDS.includes(p?.kind)) return null;
  const out = { slot, kind: p.kind };
  const id = str(p.catId ?? p.cat?.id, 64); if (id) out.catId = id;
  const name = str(p.catName ?? p.cat?.name, 32); if (name) out.catName = name;
  return out;
}

/** The panel's request → the `treat-request` message, or null. Pure. */
export function treatRequestPayload(p) {
  const requestId = typeof p?.requestId === 'string' && REQ_ID.test(p.requestId) ? p.requestId : null;
  const slot = typeof p?.slot === 'string' && p.slot.length <= 64 ? p.slot : null;
  const catName = str(p?.catName, 32);
  if (!requestId || slot === null || !catName) return null;
  const out = { requestId, slot, catName };
  const id = str(p.catId, 64); if (id) out.catId = id;
  return out;
}

/** Is `win` framed? (cross-origin safe: comparing window proxies never throws, but a stub might) */
export function isFramed(win = typeof window !== 'undefined' ? window : undefined) {
  try { return !!win && win.parent != null && win.parent !== win; } catch { return true; }
}

/** ?embed=1 (or any value but 0 / false) in `search`. Pure. */
export function wantsEmbed(search = '') {
  const q = new URLSearchParams(search);
  return q.has('embed') && q.get('embed') !== '0' && q.get('embed') !== 'false';
}

/** Embed mode = framed + ?embed. */
export function embedActive(search = '', win) { return wantsEmbed(search) && isFramed(win); }

/** Set <html data-embed="1"> (the contract key ui reads). */
export function markEmbed(doc = typeof document !== 'undefined' ? document : undefined) {
  if (doc?.documentElement?.dataset) doc.documentElement.dataset.embed = '1';
}

/**
 * Allowlist string → normalised origins (scheme://host[:port], no path / trailing slash). Invalid entries are dropped.
 * @param {string|undefined|null} raw @returns {string[]}
 */
export function parseOrigins(raw) {
  const src = typeof raw === 'string' && raw.trim() ? raw : DEFAULT_EMBED_ORIGINS;
  const out = [];
  for (const part of src.split(',')) {
    const s = part.trim();
    if (!s) continue;
    try { const o = new URL(s).origin; if (o && o !== 'null' && !out.includes(o)) out.push(o); } catch { /* not a URL */ }
  }
  return out;
}

/** The configured allowlist (VITE_EMBED_ORIGINS at build time, else the default). */
export function embedOrigins(env) {
  let e = env;
  if (e === undefined) { try { e = import.meta.env; } catch { e = {}; } }
  return parseOrigins(e?.VITE_EMBED_ORIGINS);
}

/**
 * The allowlist plus the page's own origin when the parent frame is same-origin (fix round 2, Q1 request §6: the game
 * is served same-origin under the host at tokentails.com/swordcat, so a Vercel preview or a dev port the build-time
 * list never named is still its own host). A cross-origin parent throws on `parent.location.origin`: the list stays as
 * it is. Pure apart from reading `win`.
 * @param {string[]} allowed @param {any} win @returns {string[]}
 */
export function withSameOrigin(allowed, win) {
  let own = null;
  try {
    const o = win?.location?.origin, po = win?.parent?.location?.origin;
    if (typeof o === 'string' && o && o !== 'null' && o === po) own = o;
  } catch { own = null; }
  return own && !allowed.includes(own) ? [...allowed, own] : allowed;
}

/**
 * Decide whether a MessageEvent is a valid host message. Pure.
 * @param {{source?: any, origin?: string, data?: any}} event
 * @param {{parent: any, allowed: string[], hostOrigin?: string|null}} opts
 * @returns {{type: string, [k: string]: any} | null}  the message, or null to ignore it
 */
export function acceptMessage(event, { parent, allowed, hostOrigin = null }) {
  if (!event || parent == null || event.source !== parent) return null;
  const origin = event.origin;
  if (typeof origin !== 'string' || !allowed.includes(origin)) return null;
  if (hostOrigin && origin !== hostOrigin) return null;
  const d = event.data;
  if (!d || typeof d !== 'object' || d.ns !== EMBED_NS || d.v !== EMBED_VERSION) return null;
  if (typeof d.type !== 'string' || !HOST_TYPES.includes(d.type)) return null;
  if (!hostOrigin && d.type !== 'hello') return null;          // nothing but hello before the handshake
  return d;
}

/** A game → host envelope. Pure. */
export function envelope(type, payload = {}) { return { ...payload, ns: EMBED_NS, v: EMBED_VERSION, type }; }

/** level:results payload → the level-complete payload (`fish` is sent as `catnip`). Pure. */
export function levelCompletePayload(p = {}) {
  return { levelId: p.levelId ?? null, time: num(p.time), kittens: num(p.kittens), catnip: num(p.fish), lives: p.lives ?? null, rank: p.rank ?? null };
}
const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * The bridge state machine without DOM / game coupling (unit-tested). `actions` carries the game side:
 * { pause(), resume(), mute(muted), isReady(), isPaused() }.
 * @param {{parent: any, allowed: string[], actions?: object}} opts
 */
export function createBridge({ parent, allowed, actions = {} }) {
  const b = {
    hostOrigin: null,
    session: { signedIn: false },
    muted: null,
    /** a hello arrived before GAME_READY: `ready` is sent on game:ready */
    readyPending: false,
    readySent: false,
    posted: 0,
    /** treat listeners ({ state(s), result(r) }); see onTreat */
    treatSubs: new Set(),
    /** the last valid treat-state (replayed to a panel that subscribes later) */
    treatState: null,
    /** Post `type` to the host (only after the handshake, only to the host origin). */
    post(type, payload) {
      if (type === 'treat-request') { payload = treatRequestPayload(payload); if (!payload) return false; }
      else if (type === 'cat-saved') { payload = catSavedPayload(payload); if (!payload) return false; }
      if (!b.hostOrigin || !parent?.postMessage) return false;
      try { parent.postMessage(envelope(type, payload), b.hostOrigin); b.posted++; return true; } catch { return false; }
    },
    sendReady() { b.readyPending = false; b.readySent = true; return b.post('ready', { version: EMBED_VERSION }); },
    /** Handle one MessageEvent. Returns the accepted type, or null when ignored. */
    handle(event) {
      const msg = acceptMessage(event, { parent, allowed, hostOrigin: b.hostOrigin });
      if (!msg) return null;
      switch (msg.type) {
        case 'hello':
          b.hostOrigin = event.origin;
          if (actions.isReady?.() ?? true) b.sendReady(); else b.readyPending = true;
          break;
        case 'session':
          b.session = { signedIn: msg.signedIn === true };
          break;
        case 'audio':
          b.muted = msg.muted === true;
          actions.mute?.(b.muted);
          break;
        case 'pause':
          // already paused (the player's own pause menu): the host still learns the state
          if (actions.isPaused?.()) b.post('paused', { paused: true }); else actions.pause?.();
          break;
        case 'resume':
          if (actions.isPaused?.()) actions.resume?.(); else b.post('paused', { paused: false });
          break;
        case 'treat-state': {
          const s = parseTreatState(msg);
          if (!s) return null;
          b.treatState = s;
          for (const sub of b.treatSubs) { try { sub.state?.(s); } catch (e) { console.warn('[embed] treat-state', e); } }
          break;
        }
        case 'treat-result': {
          const r = parseTreatResult(msg);
          if (!r) return null;
          for (const sub of b.treatSubs) { try { sub.result?.(r); } catch (e) { console.warn('[embed] treat-result', e); } }
          break;
        }
        default: return null;
      }
      return msg.type;
    },
    /** Subscribe to treat-state / treat-result ({ state, result }). The last state is replayed. Returns unsubscribe. */
    onTreat(sub) {
      b.treatSubs.add(sub);
      if (b.treatState) { try { sub.state?.(b.treatState); } catch { /* */ } }
      return () => b.treatSubs.delete(sub);
    },
    /** game:ready → answer a hello that came early. */
    onGameReady() { if (b.readyPending) b.sendReady(); },
  };
  return b;
}

/**
 * Wire the bridge to the window and the game. Call right after `game.start()` (ctx and its bus exist synchronously).
 * Returns the bridge (with `dispose()`), or null when not in embed mode.
 * @param {import('./Game.js').Game} game
 * @param {{win?: Window, allowed?: string[]}} [opts]
 */
export function installEmbedBridge(game, { win = typeof window !== 'undefined' ? window : undefined, allowed = embedOrigins() } = {}) {
  if (!win || !isFramed(win)) return null;
  const parent = win.parent;
  allowed = withSameOrigin(allowed, win);
  let ready = false, byHost = null, baseMute = null;
  const ctx = () => game?.ctx;
  const actions = {
    isReady: () => ready,
    isPaused: () => game?.mode === 'menu',
    pause() {
      const c = ctx();
      if (!c || game.mode === 'menu') return;
      try { c.ui?.pause?.(); } catch (e) { console.warn('[embed] ui.pause', e); }
      if (game.mode === 'menu') { byHost = 'ui'; return; }
      game.pause(true);                       // title / busy ui: freeze without a menu (GAME_PAUSE still fires)
      byHost = 'game';
    },
    resume() {
      const c = ctx();
      if (!c) return;
      if (byHost === 'ui') { try { c.ui?.resume?.(); } catch (e) { console.warn('[embed] ui.resume', e); } }
      else if (byHost === 'game') game.pause(false);
      else bridge.post('paused', { paused: game.mode === 'menu' });   // the player's own pause stays theirs
      if (game.mode !== 'menu') byHost = null;
    },
    mute(muted) {
      const c = ctx();
      if (!c?.params) return;
      if (baseMute === null) baseMute = !!c.params.mute;
      c.params.mute = baseMute || muted;
      try { c.audio?.setVolumes?.({}); } catch { /* audio not unlocked yet: applied on unlock */ }
    },
  };
  const bridge = createBridge({ parent, allowed, actions });
  const onMessage = (ev) => { try { bridge.handle(ev); } catch (e) { console.warn('[embed] message', e); } };
  win.addEventListener('message', onMessage);
  const offs = [];
  const bus = ctx()?.bus;
  if (bus) {
    offs.push(bus.on(E.GAME_READY, () => { ready = true; bridge.onGameReady(); }));
    offs.push(bus.on(E.LEVEL_RESULTS, (p) => bridge.post('level-complete', levelCompletePayload(p))));
    offs.push(bus.on(E.KITTEN_RESCUED, (p) => { if (p?.kittenId) bridge.post('kitten-rescued', { kittenId: p.kittenId }); }));
    offs.push(bus.on(EV_CAT_SAVED, (p) => bridge.post('cat-saved', p)));
    // one `paused` per real change (a ui resume can pass through mode 'menu' twice in one step)
    let lastPaused = null;
    offs.push(bus.on(E.GAME_PAUSE, (p) => {
      const paused = !!p?.paused;
      if (!paused) byHost = null;
      if (paused === lastPaused) return;
      if (bridge.post('paused', { paused })) lastPaused = paused;
    }));
    // a mute that arrived before the audio system existed is applied once it does
    offs.push(bus.on(E.GAME_READY, () => { if (bridge.muted !== null) actions.mute(bridge.muted); }));
  } else ready = true;
  let treat = null;
  try { treat = installTreatPanel(game, { bridge, doc: win.document }); } catch (e) { console.warn('[embed] treat panel', e); }
  bridge.treat = treat;
  bridge.dispose = () => {
    win.removeEventListener('message', onMessage);
    for (const off of offs) { try { off?.(); } catch { /* */ } }
    try { treat?.uninstall?.(); } catch { /* */ }
  };
  return bridge;
}
