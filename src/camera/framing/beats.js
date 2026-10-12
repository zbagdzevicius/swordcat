// src/camera/framing/beats.js  (owner: camera) — research/next/AUTOCAM_SPEC.md §8.1 the four warm beats (Peekaboo,
// Cosy two-shot, Room read, Exhale) and the §8.2 boss moments that share the envelope (establishing read, phase breath,
// Dizzy punch). Data + a pure envelope; FollowCamera owns the triggers and the guards. A beat is
// { id, lean target (world XZ offset from her), Δd, Δfov, in, hold, out }, blended with easeInOutSine ON TOP of the
// solver goal (R8: lean ≤ beats.maxLean, |Δd| ≤ beats.maxDd, never an overshoot). One beat at a time.
import { CAMERA } from '../../core/config.js';
import { easeInOutSine } from '../../core/math.js';

const B = CAMERA.iso.beats, BOSS = CAMERA.iso.boss;

/**
 * The beat table: timing [in, hold, out] (s) and the numbers each trigger needs. `establish` / `breath` / `dizzy` are
 * the §8.2 boss moments (punch envelopes on the same runner).
 */
export const BEATS = Object.freeze({
  peekaboo: Object.freeze({ t: B.peekaboo.t, dd: B.peekaboo.dd, dfov: 0, frac: B.peekaboo.frac, lean: B.peekaboo.lean }),
  cosy: Object.freeze({ t: B.cosy.t, dd: B.cosy.dd, dfov: B.cosy.dfov, dMin: B.cosy.dMin, calmR: B.cosy.calmR }),
  roomRead: Object.freeze({ t: B.roomRead.t, lean: B.roomRead.lean, ddMax: B.roomRead.ddMax, dfov: 0 }),
  exhale: Object.freeze({ t: B.exhale.t, dd: B.exhale.dd, dfov: 0 }),
  establish: Object.freeze({ t: [BOSS.establish.in, BOSS.establish.hold, BOSS.establish.in], dfov: 0 }),
});

/**
 * Envelope 0 → 1 → 0 over in / hold / out (easeInOutSine on both ramps). t < 0 or past the end → 0.
 * @param {number} t elapsed (s) @param {number} tin @param {number} hold @param {number} tout
 */
export function beatEnvelope(t, tin, hold, tout) {
  if (!(t >= 0)) return 0;
  if (t < tin) return easeInOutSine(t / Math.max(1e-4, tin));
  if (t < tin + hold) return 1;
  if (t < tin + hold + tout) return easeInOutSine(1 - (t - tin - hold) / Math.max(1e-4, tout));
  return 0;
}

/** One running beat (FollowCamera keeps a single instance; zero allocation). */
export class BeatRunner {
  constructor() {
    this.id = null;
    this.t = 0;
    this.tin = 0; this.hold = 0; this.tout = 0;
    /** lean target (world XZ, metres from her) and the Δd / Δfov at full weight */
    this.lx = 0; this.lz = 0; this.dd = 0; this.dfov = 0;
    /** current envelope weight (0..1) and, while cancelling, the fade-out speed (1/s) */
    this.w = 0; this._cancel = 0; this._cw = 0;
    /** beats fired per key (once per kitten / per arena) */
    this.fired = new Set();
  }

  get active() { return this.id !== null; }
  get total() { return this.tin + this.hold + this.tout; }

  /**
   * Start a beat (replaces any running one without an exit blend, AUTOCAM §8.1).
   * @param {string} id @param {number[]} t [in, hold, out] @param {number} lx @param {number} lz lean (world, from her)
   * @param {number} dd @param {number} dfov
   */
  start(id, t, lx, lz, dd, dfov = 0) {
    const L = Math.hypot(lx, lz), cap = B.maxLean;
    const k = L > cap ? cap / L : 1;
    this.id = id; this.t = 0; this.tin = t[0]; this.hold = t[1]; this.tout = t[2];
    this.lx = lx * k; this.lz = lz * k;
    this.dd = Math.max(-B.maxDd, Math.min(B.maxDd, dd)); this.dfov = dfov;
    this.w = 0; this._cancel = 0; this._cw = 0;
    return this;
  }

  /** Fade the running beat out over `fade` s (opposing input, a live THREAT); a cut (`fade` 0) ends it now. */
  cancel(fade = B.cancelFade) {
    if (!this.id) return this;
    if (!(fade > 0)) { this.stop(); return this; }
    if (!this._cancel) { this._cancel = 1 / fade; this._cw = this.w; }
    return this;
  }

  stop() { this.id = null; this.w = 0; this._cancel = 0; return this; }

  /** Advance by dt (real s). Returns the weight. */
  step(dt) {
    if (!this.id) return 0;
    this.t += dt;
    if (this._cancel) {
      this._cw = Math.max(0, this._cw - dt * this._cancel);
      this.w = this._cw;
      if (this._cw <= 0) this.stop();
      return this.w;
    }
    this.w = beatEnvelope(this.t, this.tin, this.hold, this.tout);
    if (this.t >= this.total) this.stop();
    return this.w;
  }
}
