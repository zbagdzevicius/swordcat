// src/core/pacing.js  (owner: core) — dynamic resolution, frame cap, refresh detection and the thermal ladder
// (PERF_SPEC §5.1–§5.4, X4). Pure: no DOM, no renderer. PostFX feeds it once per rendered frame and applies the
// render scale it asks for (`renderer.setPixelRatio(min(dpr, maxDpr) × scale)`); Loop asks `gate()` per rAF.
import { PERF } from './config.js';

const SCALE_EPS = 1e-4;

/**
 * Frame-cap divisor: render every `k`-th rAF. `cap` 0 = uncapped. A 60 cap on displays below `highHz` renders every
 * rAF (90 Hz renders 90 fps, dyn-res handles it); at ≥ `highHz` every round(refresh / 60)-th (120 → 60, 144 → 72).
 * @param {number} refreshHz @param {number} cap  0 | 30 | 60 | any fps @param {number} [highHz]
 */
export function capDivisor(refreshHz, cap, highHz = PERF.pacing.highRefreshHz) {
  if (!(cap > 0) || !(refreshHz > 0)) return 1;
  if (cap >= PERF.pacing.baseFps) return refreshHz >= highHz ? Math.max(1, Math.round(refreshHz / cap)) : 1;
  return Math.max(1, Math.round(refreshHz / cap));
}

/** Median of the first `n` entries of a typed array (copies into `scratch`). */
function median(arr, n, scratch) {
  for (let i = 0; i < n; i++) scratch[i] = arr[i];
  const s = scratch.subarray(0, n).sort();
  return n ? s[n >> 1] : 0;
}

/**
 * The PERF §5 controller. Units: seconds for holds, ms for frame times. Never touches camera, FOV, framing or fog.
 * Feed `sample()` once per rendered frame; read `scale`, `divisor`, `thermalRung`, `particleScale`, `grassScale`.
 */
export class Pacing {
  /** @param {{min?: number, max?: number, step?: number}} [dynRes]  the active QUALITY preset's `dynRes` */
  constructor(dynRes = { min: 0.7, max: 1, step: 0.05 }) {
    this.cfg = PERF.dynRes; this.th = PERF.thermal;
    this.enabled = true;            // false = frozen at `scale` (?test, `perf.setScale`)
    this.scale = 1;
    this.setRange(dynRes);
    this.gpuEma = null; this.rafEma = null; this.workEma = null;
    this._downT = 0; this._upT = 0; this._sinceChange = Infinity;
    this.probeInterval = this.cfg.probeEvery; this._probeT = 0; this._probe = null;   // { from, t }
    // refresh detection (§5.3): median of the first N rAF intervals
    this._rafN = 0; this._rafBuf = new Float32Array(PERF.pacing.refreshSamples); this._rafScratch = new Float32Array(PERF.pacing.refreshSamples);
    this.refreshHz = 60;
    /** settings.fpsCap: 'auto' | 30 | 60 | 'off'; `presetCap` = QUALITY[q].fpsCap (0 = uncapped) */
    this.capSetting = 'auto'; this.presetCap = 60; this.batterySaver = false;
    this.divisor = 1; this._rafCount = 0;
    // thermal ladder (§5.4)
    this.thermalRung = 0; this._floorT = 0; this.lock30 = false; this._lockHotT = 0; this._lockedT = 0; this._coolT = 0;
    this.changes = 0;               // scale changes so far (perf().scaleChanges)
  }

  /** New preset range (QUALITY[q].dynRes); clamps the current scale into it. */
  setRange({ min = 0.7, max = 1, step = 0.05 } = {}) {
    this.min = min; this.max = max; this.step = step;
    this.scale = Math.min(max, Math.max(min, this.scale));
  }

  /** After a level load: reset the probe back-off and the hold timers (§5.2). */
  resetProbe() { this.probeInterval = this.cfg.probeEvery; this._probeT = 0; this._probe = null; this._downT = this._upT = 0; }

  /** The fps cap in force: battery saver / thermal lock 30, else the setting, else the preset (0 = uncapped). */
  get cap() {
    if (this.batterySaver || this.lock30) return 30;
    const s = this.capSetting;
    if (s === 'off') return 0;
    if (s === 30 || s === '30') return 30;
    if (s === 60 || s === '60') return 60;
    return this.presetCap;
  }

  /** Recompute the rAF divisor (after refresh detection or a cap change). */
  _updateDivisor() { this.divisor = capDivisor(this.refreshHz, this.cap); }

  /** Set the cap inputs (settings + preset); returns the new divisor. */
  setCap({ setting = this.capSetting, presetCap = this.presetCap, batterySaver = this.batterySaver } = {}) {
    this.capSetting = setting; this.presetCap = presetCap; this.batterySaver = !!batterySaver;
    this._updateDivisor();
    return this.divisor;
  }

  /**
   * Per rAF: record the interval (refresh detection) and say whether this rAF renders (frame cap).
   * @param {number} rafDtMs  ms since the previous rAF (not the previous rendered frame)
   */
  gate(rafDtMs) {
    if (this._rafN < this._rafBuf.length && rafDtMs > 0 && rafDtMs < 100) {
      this._rafBuf[this._rafN++] = rafDtMs;
      if (this._rafN === this._rafBuf.length) {
        const m = median(this._rafBuf, this._rafN, this._rafScratch);
        this.refreshHz = m > 0 ? Math.round(1000 / m) : 60;
        this._updateDivisor();
      }
    }
    if (this.divisor <= 1) return true;
    return (++this._rafCount % this.divisor) === 0;
  }

  /**
   * Per rendered frame. Returns the new render scale when it changed this frame, else null.
   * @param {number} dt  seconds since the previous rendered frame
   * @param {number} frameMs  the rendered-frame interval in ms
   * @param {number|null} gpuMs  GPU ms (timer query, 2–3 frames late) or null when unavailable
   * @param {number} [workMs]  CPU work this frame (sim + render + submit), for the 30 fps retry
   */
  sample(dt, frameMs, gpuMs = null, workMs = 0) {
    if (!(dt > 0)) return null;
    const a = this.cfg.ema;
    const raf = frameMs / Math.max(1, this.divisor);      // per-rAF interval: a 30 cap must not read as "slow"
    this.rafEma = this.rafEma == null ? raf : this.rafEma + (raf - this.rafEma) * a;
    if (gpuMs != null && Number.isFinite(gpuMs)) this.gpuEma = this.gpuEma == null ? gpuMs : this.gpuEma + (gpuMs - this.gpuEma) * a;
    const work = workMs + (gpuMs ?? 0);
    this.workEma = this.workEma == null ? work : this.workEma + (work - this.workEma) * a;
    this._sinceChange += dt;
    this._thermal(dt);
    if (!this.enabled) return null;
    return this._controller(dt);
  }

  _controller(dt) {
    const c = this.cfg, hasGpu = this.gpuEma != null;
    const slow = hasGpu ? this.gpuEma > c.gpuDownMs : this.rafEma > c.rafDownMs;
    // a running probe: step back if the frame got slow inside the window, else keep it and reset the back-off
    if (this._probe) {
      this._probe.t += dt;
      if (this.rafEma > c.rafDownMs) {
        const back = this._probe.from; this._probe = null;
        this.probeInterval = Math.min(c.probeMax, this.probeInterval * 2);
        this._probeT = 0;
        return this._set(back, true);
      }
      if (this._probe.t >= c.probeWindow) this._probe = null;
      return null;
    }
    if (slow) { this._downT += dt; this._upT = 0; } else this._downT = 0;
    if (this._downT >= c.downHold && this.scale > this.min + SCALE_EPS) {
      this._downT = 0;
      return this._set(this.scale - this.step);
    }
    if (hasGpu) {
      if (this.gpuEma < c.gpuUpMs) this._upT += dt; else this._upT = 0;
      if (this._upT >= c.upHold && this.scale < this.max - SCALE_EPS) { this._upT = 0; return this._set(this.scale + this.step); }
      return null;
    }
    // no timer query: rAF cannot show headroom under vsync, so probe one step up every `probeInterval` s
    if (this.scale < this.max - SCALE_EPS && !slow) {
      this._probeT += dt;
      if (this._probeT >= this.probeInterval) {
        this._probeT = 0;
        const from = this.scale, to = this._set(this.scale + this.step);
        if (to != null) this._probe = { from, t: 0 };
        return to;
      }
    } else this._probeT = 0;
    return null;
  }

  /** Apply a scale (rounded to the step grid, clamped); honours the ≤ 1 change / `minInterval` s rule. */
  _set(s, force = false) {
    const v = Math.min(this.max, Math.max(this.min, +(Math.round(s / this.step) * this.step).toFixed(4)));
    if (Math.abs(v - this.scale) < SCALE_EPS) return null;
    if (!force && this._sinceChange < this.cfg.minInterval) return null;
    this.scale = v; this._sinceChange = 0; this.changes++;
    return v;
  }

  /** Force a scale (debug `perf.setScale`, smoke `perf:dynres-step`); bypasses the interval rule. */
  force(s) {
    const v = Math.min(this.max, Math.max(this.min, s));
    if (Math.abs(v - this.scale) < SCALE_EPS) return null;
    this.scale = v; this._sinceChange = 0; this.changes++;
    return v;
  }

  /** §5.4: rungs at the floor every `floorHold` s; then the 30 fps lock and its retry. */
  _thermal(dt) {
    const th = this.th, atFloor = this.enabled && this.scale <= this.min + SCALE_EPS;
    if (atFloor) {
      this._floorT += dt;
      if (this._floorT >= th.floorHold && this.thermalRung < 3) { this._floorT = 0; this.thermalRung++; this._thermalChanged = true; }
    } else this._floorT = 0;
    if (this.capSetting !== 'auto' || this.batterySaver) { this._lockHotT = 0; return; }
    if (!this.lock30) {
      if (this.thermalRung >= 3 && this.rafEma > th.lock30Ms) this._lockHotT += dt; else this._lockHotT = 0;
      if (this._lockHotT >= th.lock30Hold) { this.lock30 = true; this._lockedT = 0; this._coolT = 0; this._lockHotT = 0; this._updateDivisor(); this._thermalChanged = true; }
    } else {
      this._lockedT += dt;
      if (this.workEma != null && this.workEma < th.retryWorkMs) this._coolT += dt; else this._coolT = 0;
      if (this._lockedT >= th.retryAfter && this._coolT >= th.retryHold) { this.lock30 = false; this._updateDivisor(); this._thermalChanged = true; }
    }
  }

  /** True once after any rung / lock change (the caller emits E.PERF_THERMAL). */
  takeThermalChange() { const c = !!this._thermalChanged; this._thermalChanged = false; return c; }

  /** Rung 1: grass tufts −50 %. */
  get grassScale() { return this.thermalRung >= 1 ? this.th.grassScale : 1; }
  /** Rung 2: particles ×0.5 (fx pools respect it). */
  get particleScale() { return this.thermalRung >= 2 ? this.th.particleScale : 1; }
  /** Rung 3: outlines only on the hero and a boss (X9). null = the preset's own rule. */
  get outlineCap() { return this.thermalRung >= 3 ? 'hero' : null; }
}
