// src/fx/DamageNumbers.js  (owner: fx) — GAME_DESIGN §8.3 / art.md §13: Fredoka 700, white with an ink outline;
// crits gold with a sparkle; heals green #7FD38A. DOM pool, max 20, projected from world space every frame.
// The DOM layer is created in init() (never at import) and is pointer-events: none.
import * as THREE from 'three';

export const DAMAGE_STYLE = Object.freeze({
  normal: { color: '#FFFFFF', size: 26 },
  heavy: { color: '#FFFFFF', size: 32 },
  crit: { color: '#FFD34D', size: 36 },
  heal: { color: '#7FD38A', size: 28 },
  hurt: { color: '#FFB3B3', size: 24 },
  info: { color: '#F4E7C9', size: 22 },
});

const MAX = 20;
const LIFE = 0.95;
const _p = new THREE.Vector3();

/**
 * Text and style for a hit (pure; unit-tested). Damage is shown rounded on the ×10 scale; nothing for blocked or 0 damage.
 * @param {{damage?: number, crit?: boolean, blocked?: boolean, heavy?: boolean}} h
 * @returns {{text: string, style: keyof DAMAGE_STYLE} | null}
 */
export function formatDamage(h) {
  if (!h || h.blocked) return null;
  const d = Math.round(h.damage ?? 0);
  if (!(d > 0)) return null;
  return { text: String(d), style: h.crit ? 'crit' : h.heavy ? 'heavy' : 'normal' };
}

/** Heal text ("+4"). */
export function formatHeal(amount) {
  const a = Math.round(amount ?? 0);
  return a > 0 ? { text: '+' + a, style: 'heal' } : null;
}

const CSS = `
.fx-dmg-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:8;contain:strict}
.fx-dmg{position:absolute;left:0;top:0;will-change:transform,opacity;white-space:nowrap;
  font-family:'Fredoka','SwordcatFredoka',system-ui,sans-serif;font-weight:700;line-height:1;letter-spacing:.01em;
  color:#fff;-webkit-text-stroke:5px #3A2A1F;paint-order:stroke fill;text-shadow:0 3px 0 #3A2A1F;opacity:0}
.fx-dmg.crit::after{content:'\\2726';position:absolute;right:-.62em;top:-.42em;font-size:.62em;color:#FFF1C4;
  -webkit-text-stroke:3px #A87C32;animation:fxdmgtw .3s ease-in-out infinite alternate}
@keyframes fxdmgtw{from{transform:scale(.7) rotate(-12deg)}to{transform:scale(1.15) rotate(12deg)}}`;

export class DamageNumbers {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.layer = null;
    /** @type {{el: HTMLElement|null, t: number, life: number, pos: THREE.Vector3, dx: number, rise: number, scale: number, active: boolean}[]} */
    this.pool = [];
    this._next = 0;
    this.shown = 0;          // total numbers shown (smoke/tests)
    this._style = null;
  }

  init() {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('app') ?? document.body;
    this._style = document.createElement('style');
    this._style.textContent = CSS;
    document.head.appendChild(this._style);
    this.layer = document.createElement('div');
    this.layer.className = 'fx-dmg-layer';
    host.appendChild(this.layer);
    for (let i = 0; i < MAX; i++) {
      const el = document.createElement('div');
      el.className = 'fx-dmg';
      this.layer.appendChild(el);
      this.pool.push({ el, t: 0, life: LIFE, pos: new THREE.Vector3(), dx: 0, rise: 0.9, scale: 1, active: false });
    }
    this._loadFont();
  }

  /** Make sure Fredoka is available even if the ui area's stylesheet has not declared it yet. */
  _loadFont() {
    try {
      if (typeof FontFace === 'undefined' || !document.fonts) return;
      for (const f of document.fonts) if (/fredoka/i.test(f.family)) return;
      const url = this.ctx.assets?.url?.('fonts/Fredoka-Variable.ttf');
      if (!url) return;
      const face = new FontFace('SwordcatFredoka', `url(${url})`, { weight: '300 700' });
      face.load().then((f) => document.fonts.add(f)).catch((e) => console.warn('[fx] damage-number font', e?.message ?? e));
    } catch (e) { console.warn('[fx] damage-number font', e?.message ?? e); }
  }

  /**
   * Show a number at a world position. `style` ∈ DAMAGE_STYLE keys.
   * @param {THREE.Vector3} pos @param {string} text @param {keyof DAMAGE_STYLE} [style]
   */
  show(pos, text, style = 'normal') {
    this.shown++;
    if (!this.pool.length) return;
    const n = this.pool[this._next++ % this.pool.length];
    const st = DAMAGE_STYLE[style] ?? DAMAGE_STYLE.normal;
    n.pos.copy(pos); n.t = 0; n.life = style === 'crit' ? LIFE * 1.25 : LIFE; n.active = true;
    n.dx = ((this._next * 37) % 11 - 5) * 4;            // deterministic small sideways offset (px) so stacked hits fan out
    n.rise = style === 'heal' ? 0.7 : 0.9;
    n.scale = 1;
    const el = n.el;
    el.textContent = text;
    el.className = style === 'crit' ? 'fx-dmg crit' : 'fx-dmg';
    el.style.color = st.color;
    el.style.fontSize = st.size + 'px';
  }

  get active() { let k = 0; for (const n of this.pool) if (n.active) k++; return k; }

  _any() { for (const n of this.pool) if (n.active) return true; return false; }

  /** Per frame: project and animate (dt = visual dt; frozen in the pause menu). */
  render(dt) {
    if (!this.layer || !this._any()) return;
    // window size, not layer.clientWidth: reading layout after last frame's transform writes would force a reflow
    const cam = this.ctx.camera, w = window.innerWidth, h = window.innerHeight;
    for (const n of this.pool) {
      if (!n.active) continue;
      n.t += dt;
      const u = n.t / n.life;
      if (u >= 1) { n.active = false; n.el.style.opacity = '0'; continue; }
      const rise = n.rise * (1 - (1 - u) * (1 - u));
      _p.copy(n.pos); _p.y += rise;
      _p.project(cam);
      if (_p.z > 1 || _p.z < -1) { n.el.style.opacity = '0'; continue; }
      const x = (_p.x * 0.5 + 0.5) * w + n.dx, y = (-_p.y * 0.5 + 0.5) * h;
      const pop = u < 0.12 ? 1.45 - 0.45 * (u / 0.12) : 1;
      const a = u > 0.68 ? 1 - (u - 0.68) / 0.32 : 1;
      n.el.style.opacity = a.toFixed(3);
      n.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
    }
  }

  clear() { for (const n of this.pool) { n.active = false; if (n.el) n.el.style.opacity = '0'; } }

  dispose() {
    this.layer?.remove(); this._style?.remove();
    this.layer = null; this.pool.length = 0;
  }
}
