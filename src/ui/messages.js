// src/ui/messages.js  (owner: ui, TOKENTAILS-PLAN §13.1 decision 1, TT5 package M): one place that decides where and
// when every in-game message shows. The renderers stay (toasts.js, celebrate.js, guide.js, offer.js, prompts.js,
// shelter/card.js); each asks this board for its slot.
//
//  • Levels: P0 modal (the shelter card, the results card, the Kitten-mode offer chips), P1 moment (friend, kitten and
//    ability cards), P2 toast, P3 tip (`tut.*` toasts, the lesson / hint card). A P0 hides P1 to P3. A new message never
//    covers an older one: it waits.
//  • Two slots only: the toast slot at the top (1 toast on phones, 2 on tablet and desktop; the hint card is its bottom
//    row) and the centre card slot under the top-centre column. The card is sized per viewport (ui.css `vp-*`) and placed
//    off the touch buttons, the HUD and Clem (`cardPlace`); when there is no room it docks smaller.
//  • While a centre card shows, Pearl's guide bubble folds to its chip and the offer waits; on phones the toasts and the
//    hint wait too (one box at a time). In combat a card becomes an icon toast (celebrate.js).
//  • Root classes (written on change only): `msg-p0`, `msg-card`, `msg-toast` (a toast is up or just left), `msg-phone`,
//    `vp-<kind>`. ui.css hides the lower layers with them.
// DOM reads: one rect per placed card, plus Clem's screen point. No per-frame allocation in `update`.

/** Levels, timings and layout numbers (CSS px / seconds). */
export const MSG = Object.freeze({
  P0: 0, P1: 1, P2: 2, P3: 3,
  overlapMax: 0.04,           // a placed box may cover at most 4 % of itself or of the other box
  gutter: 12, gap: 8,
  cardTopVh: 0.12,            // the card slot starts at max(top-centre column bottom + gap, 12vh)
  toastLinger: 0.3,           // s the hint keeps waiting after the last toast has gone (no fade back over a leaving one)
  dockScales: Object.freeze([0.8, 0.66]),
  clemH: 1.3,                 // m: her height for the screen box
});

/** Viewport classes the CSS sizes the card for. Pure. */
export function viewportKind(W, H, touch = false) {
  if (Math.min(W, H) < 500) return W > H ? 'phone-land' : 'phone-portrait';
  return touch || W < 1000 ? 'tablet' : 'desktop';
}

/** Overlap of two rects ({x, y, w, h}) as the larger fraction of either box (0..1). Pure. */
export function overlapFrac(a, b) {
  if (!a || !b) return 0;
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const ov = ix * iy, aa = Math.max(1, a.w * a.h), ba = Math.max(1, b.w * b.h);
  return Math.max(ov / aa, ov / ba);
}

/**
 * Two lines say the same thing (case, glyph brackets, punctuation and spaces ignored; a line clipped with '…' matches
 * the full line it starts). Pure.
 */
export function sameLine(a, b) {
  const n = (s) => String(s ?? '').toLowerCase().replace(/\[[^\]]*\]|<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const x = n(a), y = n(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const clip = (s, t, u) => /…\s*$/.test(String(s ?? '')) && u.length >= 8 && t.startsWith(u);
  return clip(b, x, y) || clip(a, y, x);
}

/**
 * Where the centre card goes. Pure. Tries, in order: centred under `top`; the left column; the right column (both under
 * their HUD corner); centred under Clem; centred above her. The first spot whose box covers no `avoid` rect and not
 * Clem by more than MSG.overlapMax wins. With no free spot it docks smaller (MSG.dockScales) and takes the best one.
 * @param {{ W: number, H: number, top: number, w: number, h: number, avoid?: {x:number,y:number,w:number,h:number}[],
 *   clem?: {x:number,y:number,w:number,h:number}|null, leftTop?: number, rightTop?: number, gutter?: number }} s
 * @returns {{ x: number, y: number, w: number, h: number, scale: number, spot: string, score: number }}
 */
export function cardPlace(s) {
  const g = s.gutter ?? MSG.gutter, W = s.W, H = s.H, avoid = s.avoid ?? [], clem = s.clem ?? null;
  let best = null;
  for (const scale of s.full ? [1] : [1, ...MSG.dockScales]) {
    const w = Math.round(s.w * scale), h = Math.round(s.h * scale);
    const cx = Math.round((W - w) / 2);
    const spots = [
      ['centre', cx, s.top],
      ['left', g, Math.max(s.top, s.leftTop ?? s.top)],
      ['right', W - g - w, Math.max(s.top, s.rightTop ?? s.top)],
    ];
    if (clem) spots.push(['under', cx, clem.y + clem.h + MSG.gap], ['over', cx, clem.y - MSG.gap - h]);
    for (const [spot, x0, y0] of spots) {
      const x = Math.max(g, Math.min(W - g - w, x0)), y = Math.max(g, Math.min(H - g - h, y0));
      if (y < s.top - 0.5 && spot !== 'over') continue;
      const box = { x, y, w, h };
      let score = clem ? overlapFrac(box, clem) : 0;
      for (const r of avoid) { const f = overlapFrac(box, r); if (f > score) score = f; }
      const cand = { x, y, w, h, scale, spot, score };
      if (score <= MSG.overlapMax) return cand;
      if (!best || score < best.score - 1e-6) best = cand;
    }
  }
  return best;
}

/**
 * The pure arbiter. Each renderer declares its message (`set(id, level, slot, on)`); `allows` says whether one may
 * show now. Rules: a P0 hides every lower level; two P0s: the older one shows, the newer waits; the card slot holds one
 * card (the older wins); on phones a toast or tip waits while a card is up.
 */
export class MessageBoard {
  constructor() { this.items = new Map(); this._seq = 0; }

  /** Declare (on) or retract (off) a message. Keeps its age while it stays declared. */
  set(id, level, slot, on = true) {
    const m = this.items.get(id);
    if (!on) { if (m) this.items.delete(id); return; }
    if (m) { m.level = level; m.slot = slot; return; }
    this.items.set(id, { id, level, slot, seq: ++this._seq });
  }

  has(id) { return this.items.has(id); }

  /** The highest priority (lowest level) declared, or Infinity. */
  top() { let t = Infinity; for (const m of this.items.values()) if (m.level < t) t = m.level; return t; }

  /**
   * May message `id` (`level`, `slot`) show now? An undeclared id is treated as the newest.
   * @param {string} id @param {number} level @param {string} slot @param {{ phone?: boolean }} [o]
   */
  allows(id, level, slot, o = {}) {
    const me = this.items.get(id), seq = me ? me.seq : Infinity;
    for (const m of this.items.values()) {
      if (m.id === id) continue;
      if (m.level === MSG.P0) {
        if (level > MSG.P0) return false;                   // a modal hides everything below it
        if (m.seq < seq) return false;                       // two modals: the newer one waits
      }
      if (slot === 'card' && m.slot === 'card' && m.level <= level && m.seq < seq) return false;
      if (o.phone && (slot === 'toast') && m.slot === 'card' && m.level === MSG.P1) return false;
    }
    return true;
  }

  clear() { this.items.clear(); }
}

const hasDom = () => typeof document !== 'undefined' && typeof innerWidth === 'number';

/** The DOM side: declares what is up each frame, writes the root classes, places the centre card. */
export class Messages {
  /** @param {any} ctx @param {any} ui the UI facade */
  constructor(ctx, ui) {
    this.ctx = ctx; this.ui = ui;
    this.board = new MessageBoard();
    this.kind = 'desktop'; this.phone = false;
    this.p0 = false; this.card = false; this.toast = false;
    this._toastT = 0;
    this._cls = new Map();
    this.placed = null;            // last card placement (tests / smoke)
    this._clem = { x: 0, y: 0, w: 0, h: 0 };
    this._avoid = [];
  }

  /** Per frame, before the renderers draw (UI.render). */
  update(dt) {
    const ui = this.ui, b = this.board;
    if (hasDom()) {
      const touch = (this.ctx.input?.device ?? 'kbm') === 'touch' || !!document.body?.classList?.contains('ui-touch');
      this.kind = viewportKind(innerWidth, innerHeight, touch);
      this.phone = this.kind.startsWith('phone');
    }
    b.set('shelter', MSG.P0, 'modal', !!ui.shelterCard?.open);
    b.set('results', MSG.P0, 'modal', !!ui.results?.open);
    b.set('offer', MSG.P0, 'modal', !!ui.offer?.open);
    const cur = ui.celebrations?.q?.cur;
    b.set('card', MSG.P1, 'card', !!cur && cur.started !== false && !cur.toast);
    const shown = ui.toasts?.q?.shown?.length ?? 0;
    b.set('toast', MSG.P2, 'toast', shown > 0);
    this._toastT = shown > 0 ? MSG.toastLinger : Math.max(0, this._toastT - dt);
    this.p0 = b.top() === MSG.P0;
    this.card = b.has('card');
    this.toast = this._toastT > 0;
    const root = ui.root;
    if (root) {
      this._flag(root, 'msg-p0', this.p0);
      this._flag(root, 'msg-card', this.card);
      this._flag(root, 'msg-toast', this.toast);
      this._flag(root, 'msg-phone', this.phone);
      this._flag(root, 'msg-shelter', b.has('shelter'));
      this._flag(root, 'msg-results', b.has('results'));
      for (const k of ['phone-portrait', 'phone-land', 'tablet', 'desktop']) this._flag(root, `vp-${k}`, this.kind === k);
    }
  }

  _flag(e, c, on) {
    if (this._cls.get(c) === on) return;
    this._cls.set(c, on);
    e.classList.toggle(c, on);
  }

  /** Toasts wait (hidden, clocks held) under a modal, and on phones while a card is up. */
  holdToasts() { return this.p0 || (this.phone && this.card); }

  /** A new card waits while a modal is up. */
  holdCards() { return this.p0; }

  /** May the modal `id` ('shelter' | 'offer') open now? Not over another modal, a card on screen or a waiting card. */
  modalMayOpen(id) {
    const cel = this.ui.celebrations;
    if (cel?.busy) return false;
    if (id !== 'shelter' && this.ui.shelterCard?.queue?.length) return false;   // a rescued cat card is next
    return this.board.allows(id, MSG.P0, 'modal');
  }

  /** Clem's screen box (CSS px) or null. */
  clemRect() {
    const p = this.ctx.player?.pos, cam = this.ctx.cam;
    if (!p || !cam?.worldToScreen) return null;
    const f = cam.worldToScreen({ x: p.x, y: p.y, z: p.z }), h = cam.worldToScreen({ x: p.x, y: p.y + MSG.clemH, z: p.z });
    if (!f || !h || !Number.isFinite(f.y) || !Number.isFinite(h.y)) return null;
    const hh = Math.max(20, f.y - h.y), r = this._clem;
    r.x = Math.round(f.x - hh * 0.4); r.y = Math.round(h.y); r.w = Math.round(hh * 0.8); r.h = Math.round(hh);
    return r;
  }

  /**
   * Place the centre card (celebrate.js calls it once per card, after its content is set). Writes `--cx` / `--cy` /
   * `--cs` on the card and the confetti box. Returns the placement.
   * @param {HTMLElement} card the `.cel-card` @param {HTMLElement} pop its `.cel-pop` box
   */
  placeCard(card, pop) {
    if (!hasDom() || !card || !pop) return null;
    for (const k of ['phone-portrait', 'phone-land', 'tablet', 'desktop']) card.classList.toggle(`vp-${k}`, this.kind === k);
    card.style.setProperty('--cs', '1');
    const r = pop.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    const at = this._place(Math.ceil(r.width), Math.ceil(r.height));
    if (!at) return null;
    card.style.setProperty('--cx', `${Math.round(at.x + at.w / 2)}px`);
    card.style.setProperty('--cy', `${Math.round(at.y)}px`);
    card.style.setProperty('--cs', at.scale.toFixed(2));
    const conf = this.ui.celebrations?.confetti;
    if (conf) {
      conf.style.setProperty('--cfx', `${at.x}px`); conf.style.setProperty('--cfy', `${at.y}px`);
      conf.style.setProperty('--cfw', `${at.w}px`); conf.style.setProperty('--cfh', `${at.h}px`);
    }
    this.placed = at;
    return at;
  }

  /**
   * Place the Kitten-mode offer the same way (it sat over the HUD block on short landscape phones). Writes `--ofx` /
   * `--ofy` on its root (ui.css). Returns the placement.
   * @param {HTMLElement} root the `.ui-offer`
   */
  placeOffer(root) {
    if (!hasDom() || !root) return null;
    root.classList.remove('is-placed');
    const r = root.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    const at = this._place(Math.ceil(r.width), Math.ceil(r.height), true);
    if (!at || at.scale !== 1) return null;           // no free spot at full size: keep the CSS place (chips stay 44 px)
    root.style.setProperty('--ofx', `${at.x}px`); root.style.setProperty('--ofy', `${at.y}px`);
    root.classList.add('is-placed');
    return at;
  }

  /** cardPlace for a w × h box with the live HUD / touch / Clem rects. */
  _place(w, h, full = false) {
    const ui = this.ui, W = innerWidth, H = innerHeight;
    const rect = (e) => {
      if (!e || e.offsetParent === null) return null;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
      const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 ? q : null;
    };
    // the top: under the top-centre column (boss bar, objective), the objective line under the hearts on phones
    let top = Math.round(H * MSG.cardTopVh);
    const tc = rect(ui.hud?.tcEl);
    if (tc && tc.top < H * 0.4) top = Math.max(top, Math.ceil(tc.bottom + MSG.gap));
    const avoid = this._avoid; avoid.length = 0;
    // (the offer's `chip` rects are skipped: the offer is a modal and never shares the screen with a card, and the
    // occluder list is re-measured at 4 Hz, so a just-closed offer could still be in it)
    for (const q of ui.screenOccluders?.()?.rects ?? []) if (q.kind !== 'chip') avoid.push({ x: q.x, y: q.y, w: q.w, h: q.h });
    for (const e of [ui.hud?.guideEl, ui.hud?.bossEl, ui.prompts?.hintEl, ui.prompts?.guide?.root]) { const q = rect(e); if (q) avoid.push({ x: q.left, y: q.top, w: q.width, h: q.height }); }
    const chip = ui.skipChipRect?.();
    if (chip && chip.w > 0) avoid.push({ x: chip.x, y: chip.y, w: chip.w, h: chip.h });
    // phones keep the toasts back while the card shows; on bigger screens they stay in the top column, so stay off them
    // (a touch tablet keeps them in the left column: then they are a rect to stay off, not a floor)
    if (!this.phone) {
      const slot = ui.hud?.toastSlot, q = rect(slot);
      if (q && slot.classList.contains('is-phone')) avoid.push({ x: q.left, y: q.top, w: q.width, h: q.height });
      else if (q) top = Math.max(top, Math.ceil(q.bottom + MSG.gap));
    }
    const tl = rect(ui.hud?.tlEl), tr = rect(ui.hud?.trEl);
    return cardPlace({ W, H, top, w, h, avoid, clem: this.clemRect(), full,
      leftTop: tl ? Math.ceil(tl.bottom + MSG.gap) : top, rightTop: tr ? Math.ceil(tr.bottom + MSG.gap) : top });
  }

  dispose() { this.board.clear(); }
}
