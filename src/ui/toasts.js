// src/ui/toasts.js  (owner: ui) — GAME_DESIGN §14.3 Toasts: "Kitten found, letter, Heart Bell, skin unlocked,
// objective done. Queue of 3; 2.5 s each." `ToastQueue` is the pure timing model (node-tested); `Toasts` renders it as
// cream candy pills under the objective line (top-centre) with an icon per kind; gameplay tips go one at a time.
import { el, flag } from './dom.js';
import { glyphify } from './text.js';
import * as I from './icons.js';

export const TOAST = Object.freeze({ visible: 3, life: 2.5, fadeIn: 0.25, fadeOut: 0.35, dedupe: 0.6, maxQueue: 12 });

/**
 * Is this toast a gameplay tip (a `tut.*` hint, icon 'hint')? Tips go one at a time (WA §6.1 rule 6: one instruction
 * on screen), wait while the guide bubble talks, and never show in a scene. Pure.
 */
export function isTip(key, icon) { return icon === 'hint' || String(key ?? '').startsWith('tut.'); }

/**
 * Pure toast queue: at most `visible` on screen, each lives `life` s; extras wait their turn. Tips (`tip: true`): at
 * most one shown at a time, and none promoted while `tipHold` is set (they keep their place in the queue).
 */
export class ToastQueue {
  constructor(o = {}) {
    this.cfg = { ...TOAST, ...o };
    /** tips wait (the guide bubble is up, a scene is playing) */
    this.tipHold = false;
    /** @type {{id:number, text:string, icon:string|null, t:number, life:number}[]} */
    this.shown = [];
    /** @type {{text:string, icon:string|null}[]} */
    this.waiting = [];
    this._id = 0;
    this._recent = new Map();     // text → seconds since shown (dedupe)
  }

  /** Queue a toast. Returns false when it was a duplicate of one shown in the last `dedupe` s. */
  push(text, icon = null, tip = false) {
    const s = String(text ?? '').trim();
    if (!s) return false;
    if (this._recent.has(s) && this._recent.get(s) < this.cfg.dedupe) return false;
    if (this.shown.some((t) => t.text === s && t.t < t.life - this.cfg.fadeOut) || this.waiting.some((t) => t.text === s)) return false;
    this._recent.set(s, 0);
    this.waiting.push({ text: s, icon, tip: !!tip });
    if (this.waiting.length > this.cfg.maxQueue) this.waiting.shift();
    this._promote();
    return true;
  }

  _promote() {
    let tipUp = this.tipHold || this.shown.some((t) => t.tip);
    for (let i = 0; i < this.waiting.length && this.shown.length < this.cfg.visible;) {
      const w = this.waiting[i];
      if (w.tip && tipUp) { i++; continue; }          // one tip at a time: the next waits its turn
      this.waiting.splice(i, 1);
      if (w.tip) tipUp = true;
      this.shown.push({ id: ++this._id, text: w.text, icon: w.icon, tip: !!w.tip, t: 0, life: this.cfg.life });
    }
  }

  /** Advance (seconds). Returns the toasts removed this tick. */
  update(dt) {
    for (const [k, v] of this._recent) { const n = v + dt; if (n > 5) this._recent.delete(k); else this._recent.set(k, n); }
    const gone = [];
    for (let i = this.shown.length - 1; i >= 0; i--) {
      const t = this.shown[i];
      t.t += dt;
      if (t.t >= t.life) { gone.push(t); this.shown.splice(i, 1); }
    }
    if (gone.length || this.waiting.length) this._promote();
    return gone;
  }

  /** 0..1 opacity of a shown toast (fade in / out). */
  alpha(t) {
    const a = Math.min(1, t.t / this.cfg.fadeIn), b = Math.min(1, (t.life - t.t) / this.cfg.fadeOut);
    return Math.max(0, Math.min(a, b));
  }

  /**
   * TT3 R3: when `visible` drops below what is shown (a portrait phone's stack must stop above Clem), the newest shown
   * toasts go back to the front of the queue (their clock restarts there). Returns the toasts taken off screen.
   */
  shed() {
    const out = [];
    while (this.shown.length > Math.max(1, this.cfg.visible)) {
      const t = this.shown.pop();
      out.push(t);
      this.waiting.unshift({ text: t.text, icon: t.icon, tip: t.tip });
    }
    return out;
  }

  clear() { this.shown.length = 0; this.waiting.length = 0; }
}

/** Icon id → SVG. */
const ICONS = {
  kitten: () => I.catHead({ fur: '#E3C9A2', deep: '#C9A47A', bow: false, eyes: '#5E8FA8' }),
  letter: () => I.letter(true), bell: () => I.bell(), cape: () => I.cape(), sword: () => I.sword(), shard: () => I.shard(),
  flag: () => I.flag(), seal: () => I.waxSeal(I.PINK_DEEP, 'check'), fish: () => I.fish(), milk: () => I.milkBottle(true), heart: () => I.heart('full'),
};

/** Strings key → icon id (toasts emitted by other areas carry `key`). */
export function iconFor(key, icon) {
  if (icon && ICONS[icon]) return icon;
  const k = String(key ?? '');
  if (k.startsWith('toast.kitten')) return 'kitten';
  if (k.startsWith('toast.letter')) return 'letter';
  if (k.startsWith('toast.heartbell')) return 'bell';
  if (k.startsWith('toast.memecam') || k.startsWith('toast.cape')) return 'cape';
  if (k.startsWith('toast.skin')) return 'sword';
  if (k.startsWith('toast.shard')) return 'shard';
  if (k.startsWith('toast.objective') || k.startsWith('obj.')) return 'flag';
  if (k.startsWith('toast.stolen') || k.startsWith('toast.returned')) return 'fish';
  if (k.startsWith('toast.checkpoint') || k.startsWith('toast.saved')) return 'seal';
  return icon && typeof icon === 'string' && ICONS[icon] ? icon : null;
}

/** Toasts shown at once on a phone (hud.js TOAST_PHONE.visible; kept here so toasts.js stays free of hud.js). */
export const TOAST_PHONE_VISIBLE = 2;

/** Is this a phone layout (touch, or a short / narrow viewport: beacon.js `isPhone`)? Reads the window size. */
export function phoneToasts(device, W = typeof innerWidth === 'number' ? innerWidth : 1280, H = typeof innerHeight === 'number' ? innerHeight : 720) {
  return device === 'touch' || Math.min(W, H) < 500;
}

export class Toasts {
  /** @param {HTMLElement} parent @param {() => string} [device] current input device ('kbm' | 'pad' | 'touch') */
  constructor(parent, device = () => 'kbm', input = () => null) {
    this.device = device;
    this.input = input;
    this.q = new ToastQueue();
    this.root = el('div', 'ui-toasts', { parent });
    /** @type {Map<number, HTMLElement>} */
    this.els = new Map();
    /** TT3 R3: at most this many at once (hud.js sets it on portrait phones so the stack stops above Clem), or null */
    this.cap = null;
  }

  /** TT3 R3 (§10.2.10): a phone shows 2 at a time in its side slot (hud.js phoneToastBox), fewer when `cap` says so. */
  _cap() {
    const base = phoneToasts(this.device()) ? TOAST_PHONE_VISIBLE : TOAST.visible;
    this.q.cfg.visible = Number.isFinite(this.cap) ? Math.max(1, Math.min(base, this.cap)) : base;
  }

  push(text, { icon = null, key = null } = {}) {
    this._cap();
    return this.q.push(text, iconFor(key, icon), isTip(key, icon));
  }

  /**
   * Real seconds (toasts keep their pace during hitstop / slow motion).
   * @param {number} dt @param {{ tips?: boolean, tipHold?: boolean }} [o] `tips`: the hint layers may show (live play);
   *   `tipHold`: the guide bubble is up. A shown tip hides (and its clock pauses) while `tips` is false.
   */
  render(dt, o = {}) {
    const tips = o.tips !== false;
    this._cap();
    this.q.tipHold = !tips || !!o.tipHold;
    for (const t of this.q.shown) if (t.tip && !tips) t.t = Math.max(0, t.t - dt);   // a tip's clock waits out a scene
    const gone = this.q.update(dt);
    gone.push(...this.q.shed());
    for (const t of gone) { const e = this.els.get(t.id); e?.remove(); this.els.delete(t.id); }
    for (const t of this.q.shown) {
      let e = this.els.get(t.id);
      if (!e) {
        const ic = t.icon && ICONS[t.icon] ? `<span class="toast-ico">${ICONS[t.icon]()}</span>` : '';
        e = el('div', 'ui-toast', { html: `${ic}<span class="toast-txt">${glyphify(t.text, this.device(), this.input())}</span>`, parent: this.root });
        this.els.set(t.id, e);
      }
      if (t.t > t.life - this.q.cfg.fadeOut) flag(e, 'is-out', true);
      if (t.tip) flag(e, 'is-hid', !tips);
    }
  }

  clear() { this.q.clear(); for (const e of this.els.values()) e.remove(); this.els.clear(); }
}
