// src/ui/toasts.js  (owner: ui) — GAME_DESIGN §14.3 Toasts: "Kitten found, letter, Heart Bell, skin unlocked,
// objective done. Queue of 3; 2.5 s each." `ToastQueue` is the pure timing model (node-tested); `Toasts` renders it as
// parchment ribbons under the objective line (top-centre) with an icon per kind.
import { el, flag } from './dom.js';
import { glyphify } from './text.js';
import * as I from './icons.js';

export const TOAST = Object.freeze({ visible: 3, life: 2.5, fadeIn: 0.25, fadeOut: 0.35, dedupe: 0.6, maxQueue: 12 });

/** Pure toast queue: at most `visible` on screen, each lives `life` s; extras wait their turn. */
export class ToastQueue {
  constructor(o = {}) {
    this.cfg = { ...TOAST, ...o };
    /** @type {{id:number, text:string, icon:string|null, t:number, life:number}[]} */
    this.shown = [];
    /** @type {{text:string, icon:string|null}[]} */
    this.waiting = [];
    this._id = 0;
    this._recent = new Map();     // text → seconds since shown (dedupe)
  }

  /** Queue a toast. Returns false when it was a duplicate of one shown in the last `dedupe` s. */
  push(text, icon = null) {
    const s = String(text ?? '').trim();
    if (!s) return false;
    if (this._recent.has(s) && this._recent.get(s) < this.cfg.dedupe) return false;
    if (this.shown.some((t) => t.text === s && t.t < t.life - this.cfg.fadeOut) || this.waiting.some((t) => t.text === s)) return false;
    this._recent.set(s, 0);
    this.waiting.push({ text: s, icon });
    if (this.waiting.length > this.cfg.maxQueue) this.waiting.shift();
    this._promote();
    return true;
  }

  _promote() {
    while (this.shown.length < this.cfg.visible && this.waiting.length) {
      const w = this.waiting.shift();
      this.shown.push({ id: ++this._id, text: w.text, icon: w.icon, t: 0, life: this.cfg.life });
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
    if (gone.length) this._promote();
    return gone;
  }

  /** 0..1 opacity of a shown toast (fade in / out). */
  alpha(t) {
    const a = Math.min(1, t.t / this.cfg.fadeIn), b = Math.min(1, (t.life - t.t) / this.cfg.fadeOut);
    return Math.max(0, Math.min(a, b));
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

export class Toasts {
  /** @param {HTMLElement} parent @param {() => string} [device] current input device ('kbm' | 'pad' | 'touch') */
  constructor(parent, device = () => 'kbm') {
    this.device = device;
    this.q = new ToastQueue();
    this.root = el('div', 'ui-toasts', { parent });
    /** @type {Map<number, HTMLElement>} */
    this.els = new Map();
  }

  push(text, { icon = null, key = null } = {}) {
    return this.q.push(text, iconFor(key, icon));
  }

  /** Real seconds (toasts keep their pace during hitstop / slow motion). */
  render(dt) {
    const gone = this.q.update(dt);
    for (const t of gone) { const e = this.els.get(t.id); e?.remove(); this.els.delete(t.id); }
    for (const t of this.q.shown) {
      let e = this.els.get(t.id);
      if (!e) {
        const ic = t.icon && ICONS[t.icon] ? `<span class="toast-ico">${ICONS[t.icon]()}</span>` : '';
        e = el('div', 'ui-toast', { html: `${ic}<span class="toast-txt">${glyphify(t.text, this.device())}</span>`, parent: this.root });
        this.els.set(t.id, e);
      }
      if (t.t > t.life - this.q.cfg.fadeOut) flag(e, 'is-out', true);
    }
  }

  clear() { this.q.clear(); for (const e of this.els.values()) e.remove(); this.els.clear(); }
}
