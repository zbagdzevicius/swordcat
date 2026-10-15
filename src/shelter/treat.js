// src/shelter/treat.js  (owner: T, TT4 §12.2 / §12.3) — the "send Pink Paw a treat" panel inside the rescued cat card.
//
// R's card emits SHELTER_CARD_OPEN { slot, kind, cat, actionsEl }; this module mounts its button and panel into
// `actionsEl`. The game never calls the treat API itself:
//   - embedded (the Token Tails frame): the panel posts `treat-request` over the embed bridge; the host page calls the
//     sponsored treat endpoint with the player's own session and answers `treat-result`. Tokens never enter the frame.
//   - not embedded: the panel shows a new-tab link to the Token Tails give page. No postMessage, no fetch.
// The state machine (createTreatController) and the view model (treatView) are pure and unit-tested
// (tests/unit/treat.test.js); renderTreat / installTreatPanel are the DOM glue (smoke tests/smoke/treat.mjs).
import { E } from '../core/events.js';
import { TREAT_COPY as T, giveHref } from './treatCopy.js';
import css from './treat.css?inline';

export const EV_CARD_OPEN = E.SHELTER_CARD_OPEN ?? 'shelter:card-open';
export const EV_CARD_CLOSE = E.SHELTER_CARD_CLOSE ?? 'shelter:card-close';
/** A request with no answer after this long shows the error state with "Try again". */
export const TREAT_TIMEOUT_MS = 15000;
/** DOM event the panel dispatches (bubbling) on `actionsEl` after each render, so the card rebuilds its nav items. */
export const ACTIONS_CHANGED = 'shelter:actions-changed';

const RAILS = ['checking', 'live', 'exhausted', 'soon'];
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
 * @param {{embedded: boolean}} opts
 * @returns {{phase: string, message: string|null, button: {id: string, label: string, disabled?: boolean}|null,
 *   links: {href: string, label: string}[], free: string, custody: string}}
 */
export function treatView(card, state, { embedded }) {
  const name = card?.cat?.name ?? '';
  const base = { free: T.free, custody: T.custody, links: [], message: null, button: null };
  if (!embedded) {
    return { ...base, phase: 'link', message: T.linkNote, links: [{ href: giveHref(name), label: T.link }] };
  }
  switch (card?.phase) {
    case 'sending': return { ...base, phase: 'sending', message: T.sending, button: { id: 'send', label: T.sending, disabled: true } };
    case 'sent': {
      const links = [];
      if (card.explorerUrl) links.push({ href: card.explorerUrl, label: T.explorer });
      if (card.receiptPath) links.push({ href: card.receiptPath, label: T.receipt });
      return { ...base, phase: 'sent', message: T.sent(card.amountLabel ?? state?.amountLabel ?? null), links };
    }
    case 'already': return { ...base, phase: 'already', message: T.already };
    case 'exhausted': return { ...base, phase: 'exhausted', message: T.exhausted };
    case 'soon': return { ...base, phase: 'soon', message: T.soon };
    case 'error': return { ...base, phase: 'error', message: T.error, button: card.retry ? { id: 'send', label: T.retry } : null };
    default: break;
  }
  // idle card: the shared rail decides
  if (state?.sentToday) return { ...base, phase: 'already', message: T.already };
  if (state?.rail === 'exhausted') return { ...base, phase: 'exhausted', message: T.exhausted };
  if (state?.rail === 'soon') return { ...base, phase: 'soon', message: T.soon };
  return { ...base, phase: 'open', button: { id: 'send', label: name ? T.send(name) : T.sendPlain } };
}

/** treat-result kind → card phase (+ retry). Unknown kinds → null (ignored). Pure. */
export function phaseForResult(kind) {
  switch (kind) {
    case 'sent': return { phase: 'sent', retry: false };
    case 'already-today': return { phase: 'already', retry: false };
    case 'paused': return { phase: 'soon', retry: false };
    case 'budget-spent': return { phase: 'exhausted', retry: false };
    case 'failed': case 'retry': return { phase: 'error', retry: true };
    case 'not-eligible': case 'signed-out': return { phase: 'error', retry: false };
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
 * @param {{embedded: boolean, post?: (type: string, payload: object) => boolean, timers?: {set: Function, clear: Function},
 *   timeoutMs?: number, idFn?: () => string, onChange?: (card: object) => void}} opts
 */
export function createTreatController({ embedded, post = () => false, timers, timeoutMs = TREAT_TIMEOUT_MS, idFn = newRequestId, onChange = () => {} } = {}) {
  const tm = timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
  /** @type {Map<string, object>} requestId → card */
  const pending = new Map();
  /** slots whose treat went out (one treat per save) */
  const sentSlots = new Set();
  const c = {
    embedded: !!embedded,
    state: { rail: 'checking', sentToday: false, amountLabel: null },
    card: null,
    pending,
    sentSlots,
    /** A card opened: returns the card model, or null when this card gets no panel. */
    open(p) {
      const card = { slot: p?.slot ?? null, kind: p?.kind ?? null, cat: p?.cat ?? null, alreadySaved: !!p?.alreadySaved,
        phase: null, retry: false, requestId: null, explorerUrl: null, receiptPath: null, amountLabel: null };
      if (!treatEligible(card)) { c.card = null; return null; }
      if (card.slot != null && sentSlots.has(card.slot)) card.phase = 'sent';
      c.card = card;
      return card;
    },
    close() { c.card = null; },
    view(card = c.card) { return card ? treatView(card, c.state, { embedded: c.embedded }) : null; },
    /** The player pressed send (or Try again). Returns the requestId, or null when nothing was sent. */
    send(card = c.card) {
      if (!c.embedded || !card) return null;
      const v = c.view(card);
      if (!v?.button || v.button.disabled) return null;
      const requestId = idFn();
      const payload = { requestId, slot: card.slot ?? '', catName: card.cat.name };
      if (card.cat.id) payload.catId = card.cat.id;
      if (!post('treat-request', payload)) {
        Object.assign(card, { phase: 'error', retry: true });
        onChange(card);
        return null;
      }
      Object.assign(card, { phase: 'sending', retry: false, requestId });
      const entry = { card, timer: null };
      entry.timer = tm.set(() => {
        if (pending.get(requestId) !== entry) return;
        pending.delete(requestId);
        if (card.requestId === requestId && card.phase === 'sending') { Object.assign(card, { phase: 'error', retry: true }); onChange(card); }
      }, timeoutMs);
      pending.set(requestId, entry);
      onChange(card);
      return requestId;
    },
    /** Host → game `treat-state` (already validated). */
    setState(s) {
      if (!s || !RAILS.includes(s.rail)) return;
      c.state = { rail: s.rail, sentToday: s.sentToday === true, amountLabel: s.amountLabel ?? null };
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
      if (r.kind === 'paused') c.state = { ...c.state, rail: 'soon' };
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
 * Render `view` into `root` (replaces its children). `onSend` runs on the send / Try again button.
 * @param {HTMLElement} root @param {ReturnType<typeof treatView>} view @param {() => void} onSend
 */
export function renderTreat(root, view, onSend) {
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
  if (view.button) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--candy tt-treat-btn';
    b.dataset.treat = 'send';
    b.disabled = !!view.button.disabled;
    if (b.disabled) b.classList.add('is-disabled');
    const l = doc.createElement('span'); l.className = 'btn-lbl'; l.textContent = view.button.label; b.appendChild(l);
    b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) onSend(); });
    root.appendChild(b);
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
  for (const [cls, text] of [['tt-treat-free', view.free], ['tt-treat-custody', view.custody]]) {
    const p = doc.createElement('p'); p.className = `tt-treat-note ${cls}`; p.textContent = text; root.appendChild(p);
  }
  if (hadFocus) (root.querySelector('button:not([disabled]), a[href]') ?? null)?.focus?.();
  try { root.dispatchEvent(new (doc.defaultView?.CustomEvent ?? CustomEvent)(ACTIONS_CHANGED, { bubbles: true })); } catch { /* */ }
}

/**
 * Wire the panel to the game bus. `bridge` is the embed bridge (null when not embedded).
 * @param {any} game @param {{bridge?: any, doc?: Document}} [opts]
 * @returns {ReturnType<typeof createTreatController> & {uninstall: () => void}} | null
 */
export function installTreatPanel(game, { bridge = null, doc = typeof document !== 'undefined' ? document : undefined } = {}) {
  const bus = game?.ctx?.bus;
  if (!bus || !doc) return null;
  let root = null;
  const ctl = createTreatController({
    embedded: !!bridge,
    post: (type, payload) => bridge?.post?.(type, payload) ?? false,
    onChange: (card) => { if (card === ctl.card) draw(); },
  });
  const draw = () => { if (root && ctl.card) renderTreat(root, ctl.view(), () => ctl.send()); };
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
    }),
    bus.on(EV_CARD_CLOSE, () => { ctl.close(); root?.remove(); root = null; }),
  ];
  const offBridge = bridge?.onTreat?.({ state: (s) => ctl.setState(s), result: (r) => ctl.result(r) });
  ctl.uninstall = () => { for (const o of offs) { try { o(); } catch { /* */ } } try { offBridge?.(); } catch { /* */ } ctl.dispose(); root?.remove(); root = null; };
  // test builds only (dist-test, VITE_SWORDCAT_DEBUG): the smoke drives the panel, also inside the embed frame where
  // window.__GAME__ is never installed. Production bundles drop this branch.
  if (import.meta.env?.VITE_SWORDCAT_DEBUG && typeof window !== 'undefined') {
    const api = { ctl, openCard: (p) => bus.emit(EV_CARD_OPEN, p), closeCard: (p) => bus.emit(EV_CARD_CLOSE, p ?? {}) };
    window.__SWORDCAT_TREAT__ = api;
    if (window.__GAME__ && typeof window.__GAME__ === 'object') window.__GAME__.treat = api;
  }
  return ctl;
}
