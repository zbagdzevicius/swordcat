// src/fx/ScreenFX.js  (owner: fx) — full-frame juice through core's PostFX, the camera and the ui flash layer:
//  - bloom director (K1 / ART §3.3): play renders straight to the canvas with NO bloom; the director only drives
//    `postfx.setBloom` while a High-tier cinematic composer is on (`postfx.cinematic`): base ⊕ holy charge ⊕ Golden
//    Hour ⊕ spikes ⊕ cutscene requests, the strongest wins. In play the glow cards (HolyFX) carry the glow instead.
//  - FOV punch (`fovPunch()`, explicit only: the camera already punches +5° on player:holy): added after the camera's
//    render and removed again in a frame hook after the frame is drawn, so the camera's own FOV damping never sees it.
//  - ART §9.1 flashes (`flash(color, alpha, dur)`): through ui's `#ui-flash` layer (`ctx.ui.flash`) when ui has it,
//    else fx's own pointer-events-none layer (opacity animation only). Hurt = soft pink #FF8FB1 0.18 / 0.25 s (never
//    a red vignette); low HP (≤ 2 HP) = a soft pink edge pulse at 1 Hz, ≤ 0.12; kitten rescue = white-gold 0.22 /
//    0.18 s. settings.reduceFlashes scales every flash ×0.3.
import { JUICE, PLAYER } from '../core/config.js';
import { spikeEnvelope } from './util.js';
import { FX_COLORS } from './palette.js';

const MAX_SPIKES = 4;
/** Low-HP threshold (§8.2 "Low HP (≤ 2 HP)"). */
export const LOW_HP = 2;
/** ART §9.1 flash numbers (colour, peak alpha, duration s) and the low-HP edge pulse; reduceFlashes multiplier. */
export const FLASH = Object.freeze({
  hurt: { color: FX_COLORS.pink, alpha: 0.18, dur: 0.25 },
  rescue: { color: '#FFF1C4', alpha: 0.22, dur: 0.18 },
  card: { color: '#FFF1C4', alpha: 0.22, dur: 0.18 },
  storm: { color: '#E8DCFF', alpha: 0.25, dur: 0.12 },
  lowHp: { color: FX_COLORS.pink, max: 0.12, hz: 1 },
  reduce: 0.3,
});

/** Bloom strength / threshold for the given sources (pure; unit-tested). */
export function bloomTarget(base, { holy = 0, golden = false, spike = 0 } = {}) {
  let s = base.strength, th = base.threshold;
  if (holy > 0) { s = Math.max(s, base.strength + (1.2 - base.strength) * holy); th = Math.min(th, base.threshold - 0.1 * holy); }
  if (golden) s = Math.max(s, PLAYER.golden.bloom ?? 1.2);
  if (spike > 0) s = Math.max(s, spike);
  return { strength: s, threshold: th };
}

/** Flash envelope 0..1 at `t` s of a `dur` s flash: a fast 15 % rise, then a smooth fall (pure). */
export function flashEnvelope(t, dur) {
  if (!(dur > 0) || t < 0 || t >= dur) return 0;
  const u = t / dur;
  return u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
}

/**
 * Edge-layer opacity for a hurt flash at `hurtT` s after the hit plus the low-HP pulse (pure; unit-tested). Pink and
 * soft: hurt peaks at FLASH.hurt.alpha, the low-HP pulse never above FLASH.lowHp.max; reduceFlashes ×0.3.
 * @param {number} hurtT seconds since the last hurt (Infinity = none) @param {number} hp @param {number} time seconds
 * @param {{reduce?: boolean, alive?: boolean}} [o]
 */
export function vignetteOpacity(hurtT, hp, time, { reduce = false, alive = true } = {}) {
  let a = FLASH.hurt.alpha * flashEnvelope(hurtT, FLASH.hurt.dur);
  if (alive && hp > 0 && hp <= LOW_HP) a = Math.max(a, FLASH.lowHp.max * (0.3 + 0.35 * (1 + Math.sin(time * Math.PI * 2 * FLASH.lowHp.hz))));
  return reduce ? a * FLASH.reduce : a;
}

const CSS = `
.fx-edge{position:fixed;inset:0;pointer-events:none;z-index:7;opacity:0;
  background:radial-gradient(ellipse at 50% 50%,rgba(255,143,177,0) 58%,rgba(255,143,177,.75) 88%,rgba(255,170,196,.95) 100%)}
.fx-flash{position:fixed;inset:0;pointer-events:none;z-index:7;opacity:0;background:#FFF1C4}`;

export class ScreenFX {
  constructor(ctx) {
    this.ctx = ctx;
    this.spikes = [];           // { t, dur, peak }
    for (let i = 0; i < MAX_SPIKES; i++) this.spikes.push({ t: 0, dur: 0, peak: 0, on: false });
    this.punch = { t: 0, dur: 0, deg: 0, on: false };
    this._applied = 0;
    this._last = null;          // last strength we wrote (null = untouched)
    this._lastTh = null;
    this.holy = 0; this.golden = false;
    this.extra = 0;             // cutscene / external bloom request (strength), 0 = none
    this.hurtT = Infinity;      // seconds since the last player hurt
    this.vignette = 0;          // current edge-layer opacity (tests/smoke; pink, never red)
    this.peakBloom = 0;         // strongest bloom written since the last read (smoke)
    this.flashes = 0;           // one-shot flashes started (tests)
    this.lastFlash = null;      // { color, alpha, dur } of the last flash (tests)
    this._fl = { t: 0, dur: 0, alpha: 0, on: false };
    this.el = null; this.flashEl = null; this._style = null; this._shownA = -1; this._shownF = -1;
  }

  /** Build the DOM layers (browser only). */
  init() {
    if (typeof document === 'undefined') return;
    this._style = document.createElement('style');
    this._style.textContent = CSS;
    document.head.appendChild(this._style);
    const host = document.getElementById('app') ?? document.body;
    this.el = document.createElement('div');
    this.el.className = 'fx-edge';
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'fx-flash';
    host.appendChild(this.el); host.appendChild(this.flashEl);
  }

  /** Bloom spike: base → peak → base over `dur` real seconds (only drawn in a High cinematic). */
  spike(peak = JUICE.holy.bloom[1], dur = JUICE.holy.bloom[2]) {
    let s = this.spikes.find((x) => !x.on) ?? this.spikes.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    s.t = 0; s.dur = Math.max(0.05, dur); s.peak = peak; s.on = true;
  }

  /** FOV punch of `deg` degrees for `dur` real seconds. */
  fovPunch(deg = JUICE.holy.fovPunch, dur = 0.15) {
    if (this.ctx.state?.settings?.reduceFlashes) deg *= 0.5;
    Object.assign(this.punch, { t: 0, dur, deg, on: true });
  }

  /**
   * A full-screen colour flash (ART §9.1): `ui.flash(color, alpha, dur)` when ui provides it (it applies
   * reduceFlashes), else fx's own layer. `kind` may be a FLASH key ('hurt', 'rescue', 'card', 'storm').
   */
  flash(color, alpha, dur) {
    if (typeof color === 'string' && FLASH[color]?.dur) ({ color, alpha, dur } = { ...FLASH[color], ...(alpha != null ? { alpha } : {}), ...(dur != null ? { dur } : {}) });
    alpha = Math.max(0, Math.min(1, alpha ?? 0.2)); dur = Math.max(0.05, dur ?? 0.2);
    this.flashes++;
    this.lastFlash = { color, alpha, dur };
    const ui = this.ctx.ui;
    if (typeof ui?.flash === 'function') { try { ui.flash(color, alpha, dur); return; } catch { /* fall back */ } }
    const reduce = !!this.ctx.state?.settings?.reduceFlashes;
    Object.assign(this._fl, { t: 0, dur, alpha: reduce ? alpha * FLASH.reduce : alpha, on: true });
    if (this.flashEl) this.flashEl.style.background = color;
  }

  /** The player was hurt: the soft pink flash + edge (no red vignette). */
  hurt() {
    this.hurtT = 0;
    if (typeof this.ctx.ui?.flash === 'function') this.flash('hurt');
  }

  /** Per frame (real dt; spikes keep running through hitstop so the flash lands on the impact frame). */
  render(realDt) {
    const ctx = this.ctx, pf = ctx.postfx;
    // ---- bloom: only a High cinematic composer (K1: play is direct to canvas, setBloom is a no-op there)
    let spike = 0;
    for (const s of this.spikes) {
      if (!s.on) continue;
      s.t += realDt;
      if (s.t >= s.dur) { s.on = false; continue; }
      const base = pf?.bloomBase?.strength ?? 0.6;
      spike = Math.max(spike, base + (s.peak - base) * spikeEnvelope(s.t, s.dur, 0.25));
    }
    if (pf?.bloomBase) {
      const busy = pf.cinematic === true && (spike > 0 || this.holy > 0.001 || this.golden || this.extra > 0);
      if (busy) {
        const tgt = bloomTarget(pf.bloomBase, { holy: this.holy, golden: this.golden, spike: Math.max(spike, this.extra) });
        if (this._last === null || Math.abs(this._last - tgt.strength) > 0.004 || Math.abs((this._lastTh ?? 0) - tgt.threshold) > 0.004) {
          pf.setBloom(tgt.strength, tgt.threshold);
          this._last = tgt.strength; this._lastTh = tgt.threshold;
          this.peakBloom = Math.max(this.peakBloom, tgt.strength);
        }
      } else if (this._last !== null) {
        pf.resetBloom();
        this._last = null; this._lastTh = null;
      }
    }
    // ---- FOV punch (added after the camera wrote its FOV this frame)
    const p = this.punch, cam = ctx.camera;
    if (p.on && cam) {
      p.t += realDt;
      if (p.t >= p.dur + 0.12) p.on = false;
      else {
        const u = p.t < p.dur * 0.3 ? p.t / (p.dur * 0.3) : Math.max(0, 1 - (p.t - p.dur * 0.3) / (p.dur * 0.7 + 0.12));
        const off = p.deg * u * u * (3 - 2 * u);
        if (off > 0.001) { cam.fov += off; cam.updateProjectionMatrix(); this._applied = off; }
      }
    }
    // ---- the pink edge: hurt (when ui has no flash layer) + the low-HP pulse (frozen in the pause menu)
    const menu = ctx.game?.mode === 'menu';
    if (!menu) this.hurtT += realDt;
    const pl = ctx.player;
    const playing = ctx.game?.mode === 'play' || ctx.game?.mode === 'memecam' || ctx.game?.mode === 'menu';
    const uiFlash = typeof ctx.ui?.flash === 'function';
    const a = vignetteOpacity(uiFlash ? Infinity : this.hurtT, playing ? (pl?.hp ?? 99) : 99, ctx.game?.realTime ?? 0,
      { reduce: !!ctx.state?.settings?.reduceFlashes, alive: pl?.alive !== false });
    this.vignette = Math.max(a, uiFlash ? FLASH.hurt.alpha * flashEnvelope(this.hurtT, FLASH.hurt.dur) : 0);
    if (this.el && Math.abs(a - this._shownA) > 0.004) { this._shownA = a; this.el.style.opacity = a.toFixed(3); }
    // ---- fx's own one-shot flash layer
    const F = this._fl;
    let fa = 0;
    if (F.on) { F.t += realDt; fa = F.alpha * flashEnvelope(F.t, F.dur); if (F.t >= F.dur) F.on = false; }
    if (this.flashEl && Math.abs(fa - this._shownF) > 0.004) { this._shownF = fa; this.flashEl.style.opacity = fa.toFixed(3); }
  }

  /** Frame hook (after the frame was drawn): remove the FOV offset again. */
  afterFrame() {
    if (this._applied && this.ctx.camera) {
      this.ctx.camera.fov -= this._applied;
      this.ctx.camera.updateProjectionMatrix();
      this._applied = 0;
    }
  }

  get bloomActive() { return this._last !== null; }

  clear() {
    for (const s of this.spikes) s.on = false;
    this.punch.on = false;
    this.hurtT = Infinity;
    this._fl.on = false;
    this.afterFrame();
  }

  dispose() {
    this.clear();
    if (this._last !== null) { this.ctx.postfx?.resetBloom?.(); this._last = null; }
    this.el?.remove(); this.flashEl?.remove(); this._style?.remove();
    this.el = null; this.flashEl = null; this._style = null;
  }
}
