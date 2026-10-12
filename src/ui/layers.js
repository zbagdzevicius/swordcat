// src/ui/layers.js  (owner: ui) — ART_WARM_SPEC §9.1 A0 screen layers, on every quality tier (no post-processing):
//
//  • `#ui-vignette`: a static warm rim (`radial-gradient(120% 95% at 50% 46%, transparent 62%, #B4664A2E 100%)`); it
//    replaces the old composer vignette pass (IMPLEMENTATION_PLAN K1: `postfx.setVignette` is a no-op in play);
//  • `#ui-flash`: a full-screen colour flash that animates **opacity only** (`ui.flash(color, alpha, dur)`; named
//    presets hurt / rescue / storm / card), plus a soft pink edge pulse at 1 Hz while her HP is low.
//
// Both are `pointer-events: none` and sit under the HUD; they are never screen occluders (AUTOCAM X22). With
// `settings.reduceFlashes` every flash alpha is ×0.3 (ART §11 / ART ui 1) and the low-HP pulse holds still.
import { el, flag, setVar, pulse } from './dom.js';

/** Named flashes (ART §9.1; WA §5.4 `card`): [colour, peak alpha, seconds]. */
export const FLASH = Object.freeze({
  hurt: Object.freeze(['#FF8FB1', 0.18, 0.25]),
  rescue: Object.freeze(['#FFF1C4', 0.22, 0.18]),
  card: Object.freeze(['#FFF1C4', 0.22, 0.18]),
  storm: Object.freeze(['#E8DCFF', 0.25, 0.12]),
});

/** Layer constants: the reduce-flashes factor, the low-HP pulse ceiling and the HP at which it runs. */
export const LAYERS = Object.freeze({ reduce: 0.3, lowMax: 0.12, lowHp: 2, maxDur: 3 });

/**
 * Resolve a flash request to { color, alpha, dur } (pure). `color` may be a preset name; alpha / dur override the
 * preset. The alpha is clamped to 0..1 and scaled by LAYERS.reduce when `reduce` is set.
 * @param {string} color @param {number} [alpha] @param {number} [dur] @param {boolean} [reduce]
 * @returns {{ color: string, alpha: number, dur: number }|null}
 */
export function flashSpec(color, alpha, dur, reduce = false) {
  const pre = typeof color === 'string' ? FLASH[color] : null;
  const c = pre ? pre[0] : typeof color === 'string' && color ? color : null;
  if (!c) return null;
  let a = Number.isFinite(alpha) ? alpha : pre ? pre[1] : 0.2;
  const d = Number.isFinite(dur) ? dur : pre ? pre[2] : 0.25;
  a = Math.max(0, Math.min(1, a)) * (reduce ? LAYERS.reduce : 1);
  if (!(a > 0)) return null;
  return { color: c, alpha: a, dur: Math.max(0.04, Math.min(LAYERS.maxDur, d)) };
}

export class ScreenLayers {
  /** @param {any} ctx @param {HTMLElement} parent the #ui root (the layers go first, so the HUD paints over them) */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.vignette = el('div', 'ui-vignette', { attrs: { id: 'ui-vignette', 'aria-hidden': 'true' } });
    this.flashEl = el('div', 'ui-flash', { attrs: { id: 'ui-flash', 'aria-hidden': 'true' } });
    this.lowEl = el('div', 'ui-flash-low', { parent: this.flashEl });
    this.hitEl = el('div', 'ui-flash-hit', { parent: this.flashEl });
    parent.insertBefore(this.flashEl, parent.firstChild);
    parent.insertBefore(this.vignette, parent.firstChild);
    this._color = '';
    this.last = null;            // last flash spec (tests / smoke read it)
    this.low = false;
  }

  /**
   * A full-screen flash (opacity only). `color`: a hex or a FLASH preset name. Returns the applied spec or null.
   * @param {string} color @param {number} [alpha] @param {number} [dur]
   */
  flash(color, alpha, dur) {
    const s = flashSpec(color, alpha, dur, !!this.ctx.state?.settings?.reduceFlashes);
    if (!s) return null;
    if (this._color !== s.color) { this._color = s.color; this.hitEl.style.background = s.color; }
    setVar(this.hitEl, '--fa', s.alpha.toFixed(3));
    setVar(this.hitEl, '--fd', `${s.dur.toFixed(3)}s`);
    pulse(this.hitEl, 'is-on');
    this.last = s;
    return s;
  }

  /** The low-HP soft pink edge pulse (1 Hz, ≤ LAYERS.lowMax; held still with reduceFlashes). */
  setLow(on) {
    on = !!on;
    if (on === this.low) return;
    this.low = on;
    flag(this.lowEl, 'is-on', on);
  }

  /** Per frame: low-HP state from the player, the vignette on every tier (QUALITY.cssVignette, default on). */
  render(play) {
    const ctx = this.ctx, p = ctx.player;
    const hp = p?.hp ?? 99;
    this.setLow(!!play && p?.alive !== false && hp > 0 && hp <= LAYERS.lowHp);
    flag(this.lowEl, 'is-calm', !!ctx.state?.settings?.reduceFlashes);
    flag(this.vignette, 'is-off', ctx.quality?.cssVignette === false);
  }

  dispose() { this.vignette.remove(); this.flashEl.remove(); }
}
