// src/fx/ScreenFX.js  (owner: fx) — full-frame juice that goes through core's PostFX and the camera:
//  - bloom director: base (PostFX.bloomBase) ⊕ holy charge (→ 1.2 / threshold 0.75, art.md §10.1) ⊕ Golden Hour
//    (PLAYER.golden.bloom) ⊕ spikes (JUICE.holy.bloom: 0.55 → 1.2 → 0.55 over 0.4 s). The strongest wins; PostFX caps it
//    at 0.8 with settings.reduceFlashes. When nothing is active it hands bloom back with resetBloom() once.
//  - FOV punch (JUICE.holy.fovPunch +5° for 0.15 s): added after the camera's render and removed again in a frame
//    hook after the frame is drawn, so the camera's own FOV damping never sees (or fights) the offset.
import { JUICE, PLAYER } from '../core/config.js';
import { spikeEnvelope } from './util.js';

const MAX_SPIKES = 4;

/** Bloom strength / threshold for the given sources (pure; unit-tested). */
export function bloomTarget(base, { holy = 0, golden = false, spike = 0 } = {}) {
  let s = base.strength, th = base.threshold;
  if (holy > 0) { s = Math.max(s, base.strength + (1.2 - base.strength) * holy); th = Math.min(th, base.threshold - 0.1 * holy); }
  if (golden) s = Math.max(s, PLAYER.golden.bloom ?? 1.2);
  if (spike > 0) s = Math.max(s, spike);
  return { strength: s, threshold: th };
}

export class ScreenFX {
  constructor(ctx) {
    this.ctx = ctx;
    this.spikes = [];           // { t, dur, peak }
    for (let i = 0; i < MAX_SPIKES; i++) this.spikes.push({ t: 0, dur: 0, peak: 0, on: false });
    this.punch = { t: 0, dur: 0, deg: 0, on: false };
    this._applied = 0;
    this._last = null;          // last strength we wrote (null = untouched)
    this.holy = 0; this.golden = false;
    this.extra = 0;             // cutscene / external bloom request (strength), 0 = none
  }

  /** Bloom spike: base → peak → base over `dur` real seconds. */
  spike(peak = JUICE.holy.bloom[1], dur = JUICE.holy.bloom[2]) {
    let s = this.spikes.find((x) => !x.on) ?? this.spikes.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    s.t = 0; s.dur = Math.max(0.05, dur); s.peak = peak; s.on = true;
  }

  /** FOV punch of `deg` degrees for `dur` real seconds (holy). */
  fovPunch(deg = JUICE.holy.fovPunch, dur = 0.15) {
    if (this.ctx.state?.settings?.reduceFlashes) deg *= 0.5;
    Object.assign(this.punch, { t: 0, dur, deg, on: true });
  }

  /** Per frame (real dt; spikes keep running through hitstop so the flash lands on the impact frame). */
  render(realDt) {
    const pf = this.ctx.postfx;
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
        }
      } else if (this._last !== null) {
        pf.resetBloom();
        this._last = null; this._lastTh = null;
      }
    }
    // ---- FOV punch (added after the camera wrote its FOV this frame)
    const p = this.punch, cam = this.ctx.camera;
    if (p.on && cam) {
      p.t += realDt;
      if (p.t >= p.dur + 0.12) p.on = false;
      else {
        const u = p.t < p.dur * 0.3 ? p.t / (p.dur * 0.3) : Math.max(0, 1 - (p.t - p.dur * 0.3) / (p.dur * 0.7 + 0.12));
        const off = p.deg * u * u * (3 - 2 * u);
        if (off > 0.001) { cam.fov += off; cam.updateProjectionMatrix(); this._applied = off; }
      }
    }
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
    this.afterFrame();
  }
}
