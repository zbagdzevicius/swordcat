// src/fx/ScreenFX.js  (owner: fx) — full-frame juice that goes through core's PostFX, the camera and one DOM overlay:
//  - bloom director: base (PostFX.bloomBase) ⊕ holy charge (→ 1.2 / threshold 0.75, art.md §10.1) ⊕ Golden Hour
//    (PLAYER.golden.bloom) ⊕ spikes (JUICE.holy.bloom: 0.55 → 1.2 → 0.55 over 0.4 s) ⊕ cutscene requests. The strongest
//    wins; PostFX caps it at 0.8 with settings.reduceFlashes. When nothing is active it hands bloom back with resetBloom()
//    once, so core's debug slider and quality switches keep working.
//  - FOV punch (`fovPunch()`, explicit only: the camera already punches +5° on player:holy): added after the camera's
//    render and removed again in a frame hook after the frame is drawn, so the camera's own FOV damping never sees it.
//  - the §8.2 red hurt vignette (0.3 s) and the low-HP (≤ 2 HP) vignette pulse at 1 Hz: a pointer-events-none DOM layer
//    (created in init, never at import). settings.reduceFlashes halves both.
import { JUICE, PLAYER } from '../core/config.js';
import { spikeEnvelope } from './util.js';

const MAX_SPIKES = 4;
/** Low-HP threshold (§8.2 "Low HP (≤ 2 HP)"). */
export const LOW_HP = 2;

/** Bloom strength / threshold for the given sources (pure; unit-tested). */
export function bloomTarget(base, { holy = 0, golden = false, spike = 0 } = {}) {
  let s = base.strength, th = base.threshold;
  if (holy > 0) { s = Math.max(s, base.strength + (1.2 - base.strength) * holy); th = Math.min(th, base.threshold - 0.1 * holy); }
  if (golden) s = Math.max(s, PLAYER.golden.bloom ?? 1.2);
  if (spike > 0) s = Math.max(s, spike);
  return { strength: s, threshold: th };
}

/**
 * Vignette opacity for a hurt flash at `t` seconds after the hit plus the low-HP pulse (pure; unit-tested).
 * @param {number} hurtT seconds since the last hurt (Infinity = none) @param {number} hp @param {number} time seconds
 * @param {{reduce?: boolean, alive?: boolean}} [o]
 */
export function vignetteOpacity(hurtT, hp, time, { reduce = false, alive = true } = {}) {
  const dur = PLAYER.hurt.vignette ?? 0.3;
  let a = 0;
  if (hurtT >= 0 && hurtT < dur) { const u = hurtT / dur; a = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85; a *= 0.85; }
  if (alive && hp > 0 && hp <= LOW_HP) a = Math.max(a, 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(time * Math.PI * 2)));
  return reduce ? a * 0.5 : a;
}

const CSS = `
.fx-vignette{position:fixed;inset:0;pointer-events:none;z-index:7;opacity:0;
  background:radial-gradient(ellipse at 50% 50%,rgba(255,59,48,0) 52%,rgba(214,32,40,.55) 82%,rgba(150,10,24,.92) 100%)}`;

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
    this.vignette = 0;          // current overlay opacity (tests/smoke)
    this.peakBloom = 0;         // strongest bloom written since the last read (smoke)
    this.el = null; this._style = null; this._shownA = -1;
  }

  /** Build the DOM overlay (browser only). */
  init() {
    if (typeof document === 'undefined') return;
    this._style = document.createElement('style');
    this._style.textContent = CSS;
    document.head.appendChild(this._style);
    this.el = document.createElement('div');
    this.el.className = 'fx-vignette';
    (document.getElementById('app') ?? document.body).appendChild(this.el);
  }

  /** Bloom spike: base → peak → base over `dur` real seconds. */
  spike(peak = JUICE.holy.bloom[1], dur = JUICE.holy.bloom[2]) {
    let s = this.spikes.find((x) => !x.on) ?? this.spikes.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    s.t = 0; s.dur = Math.max(0.05, dur); s.peak = peak; s.on = true;
  }

  /** FOV punch of `deg` degrees for `dur` real seconds. */
  fovPunch(deg = JUICE.holy.fovPunch, dur = 0.15) {
    if (this.ctx.state?.settings?.reduceFlashes) deg *= 0.5;
    Object.assign(this.punch, { t: 0, dur, deg, on: true });
  }

  /** The player was hurt: restart the red vignette. */
  hurt() { this.hurtT = 0; }

  /** Per frame (real dt; spikes keep running through hitstop so the flash lands on the impact frame). */
  render(realDt) {
    const ctx = this.ctx, pf = ctx.postfx;
    // ---- bloom
    let spike = 0;
    for (const s of this.spikes) {
      if (!s.on) continue;
      s.t += realDt;
      if (s.t >= s.dur) { s.on = false; continue; }
      const base = pf?.bloomBase?.strength ?? 0.6;
      spike = Math.max(spike, base + (s.peak - base) * spikeEnvelope(s.t, s.dur, 0.25));
    }
    if (pf?.bloomBase) {
      const busy = spike > 0 || this.holy > 0.001 || this.golden || this.extra > 0;
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
    // ---- hurt / low-HP vignette (frozen in the pause menu)
    const menu = ctx.game?.mode === 'menu';
    if (!menu) this.hurtT += realDt;
    const pl = ctx.player;
    const playing = ctx.game?.mode === 'play' || ctx.game?.mode === 'memecam' || ctx.game?.mode === 'menu';
    const a = vignetteOpacity(this.hurtT, playing ? (pl?.hp ?? 99) : 99, ctx.game?.realTime ?? 0,
      { reduce: !!ctx.state?.settings?.reduceFlashes, alive: pl?.alive !== false });
    this.vignette = a;
    if (this.el && Math.abs(a - this._shownA) > 0.004) { this._shownA = a; this.el.style.opacity = a.toFixed(3); }
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
    this.afterFrame();
  }

  dispose() {
    this.clear();
    if (this._last !== null) { this.ctx.postfx?.resetBloom?.(); this._last = null; }
    this.el?.remove(); this._style?.remove();
    this.el = null; this._style = null;
  }
}
