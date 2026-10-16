// src/shelter/treat.js  (owner: T, TT4 §12.2 / §12.3) — the "send Pink Paw a treat" panel inside the rescued cat card.
//
// R's card emits SHELTER_CARD_OPEN { slot, kind, cat, actionsEl }; this module mounts its button and panel into
// `actionsEl`. Three modes (TT5 §13.1 item 3); the game tab never navigates in any of them:
//   - embedded (the Token Tails frame): the panel posts `treat-request` over the embed bridge; the host page calls the
//     sponsored treat endpoint with the player's own session and answers `treat-result`. Tokens never enter the frame.
//   - direct (standalone on https://tokentails.com, CORS allows it): the panel reads the rail and today's row and sends
//     the guest treat itself through src/shelter/treatApi.js. This file never calls fetch.
//   - link (any other host): a new-tab link to tokentails.com/swordcat plus a Copy link button. No request at all.
// The state machine (createTreatController) and the view model (treatView) are pure and unit-tested
// (tests/unit/treat.test.js); renderTreat / installTreatPanel are the DOM glue (smoke tests/smoke/treat.mjs).
import { E } from '../core/events.js';
import { TREAT_COPY as T, PLAY_URL } from './treatCopy.js';
import { createDirectTransport, directAllowed } from './treatApi.js';
import css from './treat.css?inline';

export const EV_CARD_OPEN = E.SHELTER_CARD_OPEN ?? 'shelter:card-open';
export const EV_CARD_CLOSE = E.SHELTER_CARD_CLOSE ?? 'shelter:card-close';
export const MODES = Object.freeze(['embedded', 'direct', 'link']);
/** A direct-mode rail read older than this is read again when the next card opens. */
export const RAIL_TTL_MS = 60000;
/** A request with no answer after this long shows the error state with "Try again". */
export const TREAT_TIMEOUT_MS = 15000;
// After the timeout the request stays pending: a late answer for the card's latest request still applies.
/** DOM event the panel dispatches (bubbling) on `actionsEl` after each render, so the card rebuilds its nav items. */
export const ACTIONS_CHANGED = 'shelter:actions-changed';

const RAILS = ['checking', 'live', 'exhausted', 'paused', 'soon'];
const AT_SHELTER = ['WAITING', 'RECOVERING'];

/** Does this card get a treat panel? A real cat at the shelter (or a bundled snapshot cat, status null). Pure. */
export function treatEligible(card) {
  const cat = card?.cat;
  if (!cat || typeof cat.name !== 'string' || !cat.name) return false;
  if (card.alreadySaved) return false;
  return cat.status == null || AT_SHELTER.includes(cat.status);
}

/**
 * The panel's view for one card. Pure.
 * @param {{phase?: string, retry?: boolean, explorerUrl?: string|null, receiptPath?: string|null, amountLabel?: string|null, cat?: any}} card
 * @param {{rail: string, sentToday: boolean, amountLabel?: string|null}} state
 * @param {{embedded?: boolean, mode?: 'embedded'|'direct'|'link'}} opts  (`embedded` is the TT4 spelling)
 * @returns {{phase: string, message: string|null, button: {id: string, label: string, disabled?: boolean}|null,
 *   links: {href: string, label: string}[], free: string, custody: string}}
 */
export function treatView(card, state, { embedded, mode } = {}) {
  const m = MODES.includes(mode) ? mode : embedded ? 'embedded' : 'link';
  const name = card?.cat?.name ?? '';
  const base = { free: T.free, custody: T.custody, links: [], message: null, button: null };
  if (m === 'link') {
    const message = card?.copied === 'ok' ? T.copied : card?.copied === 'fail' ? T.copyFailed : T.linkNote;
    return { ...base, phase: 'link', message, links: [{ href: PLAY_URL, label: T.link }], button: { id: 'copy', label: T.copy } };
  }
  switch (card?.phase) {
    case 'sending': return { ...base, phase: 'sending', message: null, button: { id: 'send', label: T.sending, disabled: true } };
    case 'sent': {
      const links = [];
      if (card.explorerUrl) links.push({ href: card.explorerUrl, label: T.explorer });
      if (card.receiptPath) links.push({ href: card.receiptPath, label: T.receipt });
      return { ...base, phase: 'sent', message: T.sent(card.amountLabel ?? state?.amountLabel ?? null), links };
    }
    case 'already': return { ...base, phase: 'already', message: T.already };
    case 'exhausted': return { ...base, phase: 'exhausted', message: T.exhausted };
    case 'soon': return { ...base, phase: 'soon', message: T.soon };
    case 'paused': return { ...base, phase: 'paused', message: T.paused };
    case 'signed-out': return { ...base, phase: 'signed-out', message: T.signedOut };
    case 'not-eligible': return { ...base, phase: 'not-eligible', message: T.notEligible };
    case 'error': return { ...base, phase: 'error', message: T.error, button: card.retry ? { id: 'send', label: T.retry } : null };
    default: break;
  }
  // idle card: the shared rail decides. Direct mode waits for its own reads (the host does that for the frame).
  if (m === 'direct' && (!state || state.rail === 'checking')) {
    return { ...base, phase: 'checking', message: null, button: { id: 'send', label: T.checking, disabled: true } };
  }
  if (state?.sentToday) return { ...base, phase: 'already', message: T.already };
  if (state?.rail === 'exhausted') return { ...base, phase: 'exhausted', message: T.exhausted };
  if (state?.rail === 'paused') return { ...base, phase: 'paused', message: T.paused };
  if (state?.rail === 'soon') return { ...base, phase: 'soon', message: T.soon };
  return { ...base, phase: 'open', button: { id: 'send', label: name ? T.send(name) : T.sendPlain } };
}

/** treat-result kind → card phase (+ retry). Unknown kinds → null (ignored). Pure. */
export function phaseForResult(kind) {
  switch (kind) {
    case 'sent': return { phase: 'sent', retry: false };
    case 'already-today': return { phase: 'already', retry: false };
    case 'paused': return { phase: 'paused', retry: false };
    case 'budget-spent': return { phase: 'exhausted', retry: false };
    case 'failed': case 'retry': return { phase: 'error', retry: true };
    case 'not-eligible': return { phase: 'not-eligible', retry: false };
    case 'signed-out': return { phase: 'signed-out', retry: false };
    default: return null;
  }
}

let reqSeq = 0;
/** A short request id (≤ 40 chars, [A-Za-z0-9-]). */
export function newRequestId(now = Date.now()) {
  reqSeq = (reqSeq + 1) % 1e6;
  return `t-${now.toString(36)}-${reqSeq.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`.slice(0, 40);
}

/**
 * The treat state machine, without DOM. One controller per game.
 * `mode` 'embedded' posts `treat-request` with `post`; 'direct' calls `direct.send({chainId})` (treatApi transport) and
 * feeds its answer through the same `result()`; 'link' never sends. `embedded: true|false` is the TT4 spelling.
 * @param {{embedded?: boolean, mode?: string, post?: (type: string, payload: object) => boolean,
 *   direct?: {send: Function, readRail?: Function, readMe?: Function}|null, timers?: {set: Function, clear: Function},
 *   timeoutMs?: number, idFn?: () => string, onChange?: (card: object) => void, now?: () => number}} opts
 */
export function createTreatController({ embedded, mode, post = () => false, direct = null, timers, timeoutMs = TREAT_TIMEOUT_MS, idFn = newRequestId, onChange = () => {}, now = () => Date.now() } = {}) {
  const tm = timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
  /** @type {Map<string, object>} requestId → card */
  const pending = new Map();
  /** slots whose treat went out (one treat per save) */
  const sentSlots = new Set();
  const m0 = MODES.includes(mode) ? mode : embedded ? 'embedded' : 'link';
  const c = {
    mode: m0,
    embedded: m0 === 'embedded',
    direct,
    state: { rail: 'checking', sentToday: false, amountLabel: null, chainId: null },
    /** direct mode: when the rail was last read (0 = never), and the read in flight */
    readAt: 0,
    reading: null,
    card: null,
    pending,
    sentSlots,
    /** A card opened: returns the card model, or null when this card gets no panel. */
    open(p) {
      const card = { slot: p?.slot ?? null, kind: p?.kind ?? null, cat: p?.cat ?? null, alreadySaved: !!p?.alreadySaved,
        phase: null, retry: false, requestId: null, explorerUrl: null, receiptPath: null, amountLabel: null, copied: null };
      if (!treatEligible(card)) { c.card = null; return null; }
      if (card.slot != null && sentSlots.has(card.slot)) card.phase = 'sent';
      c.card = card;
      return card;
    },
    close() { c.card = null; },
    view(card = c.card) { return card ? treatView(card, c.state, { mode: c.mode }) : null; },
    /** Switch mode (test builds only, and at boot). Resets the rail so direct mode reads it again. */
    setMode(next, transport) {
      if (!MODES.includes(next)) return;
      c.mode = next; c.embedded = next === 'embedded';
      if (transport !== undefined) c.direct = transport;
      c.state = { rail: 'checking', sentToday: false, amountLabel: null, chainId: null };
      c.readAt = 0;
      if (c.card) { c.card.phase = c.card.phase === 'sent' ? 'sent' : null; c.card.copied = null; onChange(c.card); }
    },
    /** direct mode: read the rail and today's row (both GETs), at most once per RAIL_TTL_MS. Resolves when done. */
    refresh(force = false) {
      if (c.mode !== 'direct' || !c.direct?.readRail) return Promise.resolve(false);
      if (c.reading) return c.reading;
      if (!force && c.readAt && now() - c.readAt < RAIL_TTL_MS) return Promise.resolve(false);
      const modeAt = c.mode;
      c.reading = Promise.all([
        Promise.resolve().then(() => c.direct.readRail()).catch(() => ({ rail: 'soon' })),
        Promise.resolve().then(() => c.direct.readMe?.() ?? { sentToday: false }).catch(() => ({ sentToday: false })),
      ]).then(([rail, me]) => {
        c.reading = null;
        if (c.mode !== modeAt) return false;
        c.readAt = now();
        c.setState({
          rail: RAILS.includes(rail?.rail) && rail.rail !== 'checking' ? rail.rail : 'soon',
          sentToday: c.state.sentToday || me?.sentToday === true,
          amountLabel: rail?.amountLabel ?? null,
          chainId: Number.isSafeInteger(rail?.chainId) ? rail.chainId : null,
        });
        return true;
      });
      return c.reading;
    },
    /** link mode: remember how Copy link went ('ok' | 'fail'). */
    copied(ok, card = c.card) { if (!card) return; card.copied = ok ? 'ok' : 'fail'; onChange(card); },
    /** The player pressed send (or Try again). Returns the requestId, or null when nothing was sent. */
    send(card = c.card) {
      if (c.mode === 'link' || !card) return null;
      const v = c.view(card);
      if (!v?.button || v.button.disabled || v.button.id !== 'send') return null;
      const live = [...pending.values()].some((e) => !e.timedOut);
      if (c.mode === 'direct' && (live || !c.direct?.send)) return null; // one send in flight per game
      const requestId = idFn();
      if (c.mode === 'embedded') {
        const payload = { requestId, slot: card.slot ?? '', catName: card.cat.name };
        if (card.cat.id) payload.catId = card.cat.id;
        if (!post('treat-request', payload)) {
          Object.assign(card, { phase: 'error', retry: true });
          onChange(card);
          return null;
        }
      }
      Object.assign(card, { phase: 'sending', retry: false, requestId });
      const entry = { card, timer: null };
      entry.timer = tm.set(() => {
        if (pending.get(requestId) !== entry) return;
        // keep the entry: a slow send can still land, and its late answer must still reach this card
        entry.timedOut = true;
        if (card.requestId === requestId && card.phase === 'sending') { Object.assign(card, { phase: 'error', retry: true }); onChange(card); }
      }, timeoutMs);
      pending.set(requestId, entry);
      onChange(card);
      if (c.mode === 'direct') {
        const chainId = c.state.chainId ?? undefined;
        Promise.resolve()
          .then(() => c.direct.send(chainId ? { chainId } : {}))
          .catch(() => ({ kind: 'retry' }))
          .then((r) => { c.result({ ...(r && typeof r === 'object' ? r : { kind: 'retry' }), requestId }); });
      }
      return requestId;
    },
    /** Host → game `treat-state` (already validated). */
    setState(s) {
      if (!s || !RAILS.includes(s.rail)) return;
      c.state = { rail: s.rail, sentToday: s.sentToday === true, amountLabel: s.amountLabel ?? null, chainId: Number.isSafeInteger(s.chainId) ? s.chainId : null };
      if (c.card && !c.card.phase) onChange(c.card);
    },
    /** Host → game `treat-result` (already validated). Unknown requestIds are ignored. Returns true when applied. */
    result(r) {
      const entry = r ? pending.get(r.requestId) : null;
      if (!entry) return false;
      const next = phaseForResult(r.kind);
      if (!next) return false;
      pending.delete(r.requestId);
      tm.clear(entry.timer);
      const card = entry.card;
      if (card.requestId !== r.requestId) return false;
      Object.assign(card, next);
      if (r.kind === 'sent') {
        Object.assign(card, { explorerUrl: r.explorerUrl ?? null, receiptPath: r.receiptPath ?? null, amountLabel: r.amountLabel ?? null });
        if (card.slot != null) sentSlots.add(card.slot);
      }
      if (r.kind === 'sent' || r.kind === 'already-today') c.state = { ...c.state, sentToday: true };
      if (r.kind === 'budget-spent') c.state = { ...c.state, rail: 'exhausted' };
      if (r.kind === 'paused') c.state = { ...c.state, rail: 'paused' };
      onChange(card);
      return true;
    },
    dispose() { for (const e of pending.values()) tm.clear(e.timer); pending.clear(); c.card = null; },
  };
  return c;
}

// ------------------------------------------------------------------ DOM glue

let cssDone = false;
function injectCss(doc) {
  if (cssDone || !doc?.head || !css) return;
  const st = doc.createElement('style');
  st.dataset.owner = 'shelter-treat';
  st.textContent = css;
  doc.head.appendChild(st);
  cssDone = true;
}

/**
 * Render `view` into `root` (replaces its children). `onAction(id)` runs on the button: 'send' (send / Try again) or
 * 'copy' (link mode).
 * @param {HTMLElement} root @param {ReturnType<typeof treatView>} view @param {(id: string) => void} onAction
 */
export function renderTreat(root, view, onAction) {
  const doc = root.ownerDocument;
  const hadFocus = root.contains(doc.activeElement);
  root.replaceChildren();
  root.dataset.treatPhase = view.phase;
  const h = doc.createElement('div'); h.className = 'tt-treat-head'; h.textContent = T.heading; root.appendChild(h);
  if (view.message) {
    const m = doc.createElement('p');
    m.className = `tt-treat-msg tt-treat-msg--${view.phase}`;
    m.setAttribute('role', 'status');
    m.textContent = view.message;
    root.appendChild(m);
  }
  let btn = null;
  if (view.button) {
    const b = btn = doc.createElement('button');
    b.type = 'button';
    b.className = view.button.id === 'copy' ? 'btn tt-treat-btn tt-treat-copy' : 'btn btn--candy tt-treat-btn';
    b.dataset.treat = view.button.id;
    b.disabled = !!view.button.disabled;
    if (b.disabled) { b.classList.add('is-disabled'); b.setAttribute('aria-busy', 'true'); }
    const l = doc.createElement('span'); l.className = 'btn-lbl'; l.textContent = view.button.label; b.appendChild(l);
    b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) onAction(view.button.id); });
    if (view.button.id !== 'copy') root.appendChild(b); // Copy link goes under the link row
  }
  if (view.links.length) {
    const row = doc.createElement('div'); row.className = 'tt-treat-links';
    for (const lk of view.links) {
      const a = doc.createElement('a');
      a.className = 'tt-treat-link';
      a.href = lk.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = lk.label;
      a.addEventListener('click', (e) => e.stopPropagation());
      row.appendChild(a);
    }
    root.appendChild(row);
  }
  if (btn && view.button.id === 'copy') root.appendChild(btn);
  for (const [cls, text] of [['tt-treat-free', view.free], ['tt-treat-custody', view.custody]]) {
    const p = doc.createElement('p'); p.className = `tt-treat-note ${cls}`; p.textContent = text; root.appendChild(p);
  }
  if (hadFocus) (root.querySelector(`[data-treat="${view.button?.id ?? ''}"]:not([disabled])`) ?? root.querySelector('button:not([disabled]), a[href]') ?? null)?.focus?.();
  try { root.dispatchEvent(new (doc.defaultView?.CustomEvent ?? CustomEvent)(ACTIONS_CHANGED, { bubbles: true })); } catch { /* */ }
}

/** Copy `text` to the clipboard; resolves true on success. Falls back to a hidden textarea + execCommand. */
export async function copyText(text, doc = typeof document !== 'undefined' ? document : undefined) {
  const nav = doc?.defaultView?.navigator;
  try { if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return true; } } catch { /* fall back */ }
  try {
    const ta = doc.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    doc.body.appendChild(ta); ta.select();
    const ok = doc.execCommand?.('copy') === true;
    ta.remove();
    return ok;
  } catch { return false; }
}

/** The standalone mode for this page: 'direct' on https://tokentails.com (unframed or same-origin frame), else 'link'. */
export function standaloneMode(loc = typeof location !== 'undefined' ? location : null, win = typeof window !== 'undefined' ? window : undefined) {
  return directAllowed(loc, win) ? 'direct' : 'link';
}

/**
 * Wire the panel to the game bus. `bridge` is the embed bridge (null when not embedded). Without a bridge, `mode`
 * ('direct' | 'link', default from the page location) decides; `direct` is the treatApi transport (injected in tests).
 * @param {any} game @param {{bridge?: any, doc?: Document, mode?: string, direct?: any}} [opts]
 * @returns {ReturnType<typeof createTreatController> & {uninstall: () => void}} | null
 */
export function installTreatPanel(game, { bridge = null, doc = typeof document !== 'undefined' ? document : undefined, mode, direct } = {}) {
  const bus = game?.ctx?.bus;
  if (!bus || !doc) return null;
  let root = null;
  const m = bridge ? 'embedded' : mode === 'direct' || mode === 'link' ? mode : standaloneMode(doc.defaultView?.location ?? null);
  const ctl = createTreatController({
    mode: m,
    post: (type, payload) => bridge?.post?.(type, payload) ?? false,
    direct: m === 'direct' ? (direct ?? createDirectTransport()) : (direct ?? null),
    onChange: (card) => { if (card === ctl.card) draw(); },
  });
  const onAction = (id) => {
    if (id === 'copy') { const card = ctl.card; void copyText(PLAY_URL, doc).then((ok) => ctl.copied(ok, card)); return; }
    ctl.send();
  };
  const draw = () => { if (root && ctl.card) renderTreat(root, ctl.view(), onAction); };
  const offs = [
    bus.on(EV_CARD_OPEN, (p) => {
      if (root) { root.remove(); root = null; }
      const card = ctl.open(p);
      const host = p?.actionsEl;
      if (!card || !host?.appendChild) return;
      injectCss(doc);
      root = doc.createElement('div');
      root.className = 'tt-treat';
      root.dataset.testid = 'treat-panel';
      host.appendChild(root);
      draw();
      root.querySelector('[data-treat="send"]:not([disabled])')?.focus?.({ preventScroll: true });
      if (ctl.mode === 'direct') void ctl.refresh();
    }),
    bus.on(EV_CARD_CLOSE, () => { ctl.close(); root?.remove(); root = null; }),
  ];
  const offBridge = bridge?.onTreat?.({ state: (s) => ctl.setState(s), result: (r) => ctl.result(r) });
  ctl.uninstall = () => { for (const o of offs) { try { o(); } catch { /* */ } } try { offBridge?.(); } catch { /* */ } ctl.dispose(); root?.remove(); root = null; };
  // test builds only (dist-test, VITE_SWORDCAT_DEBUG): the smoke drives the panel, also inside the embed frame where
  // window.__GAME__ is never installed. Production bundles drop this branch.
  if (import.meta.env?.VITE_SWORDCAT_DEBUG && typeof window !== 'undefined') {
    const api = {
      ctl, openCard: (p) => bus.emit(EV_CARD_OPEN, p), closeCard: (p) => bus.emit(EV_CARD_CLOSE, p ?? {}),
      // the TT5 smoke forces the standalone mode (directAllowed is false on localhost); never in production bundles
      setMode: (next) => { if (!bridge && (next === 'direct' || next === 'link')) ctl.setMode(next, next === 'direct' ? (direct ?? createDirectTransport()) : null); return ctl.mode; },
    };
    window.__SWORDCAT_TREAT__ = api;
    if (window.__GAME__ && typeof window.__GAME__ === 'object') window.__GAME__.treat = api;
  }
  return ctl;
}
