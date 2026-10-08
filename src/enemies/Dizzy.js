// src/enemies/Dizzy.js  (owner: enemies) — the boss Dizzy meter (GAME_DESIGN §11.1; Appendix A DIZZY). Pure; U5.
//   fills by attack poise × perPoise per hit, +perParry per parry, to full on a gold-glint parry or a lesson event;
//   after decayDelay s without gain it decays at decayPerSec; full → dizzy for `dur` s (every hit crits ×critMul),
//   then it resets to 0. Each boss has its own maximum.
import { DIZZY } from '../core/config.js';

export class Dizzy {
  /** @param {number} [max] @param {typeof DIZZY} [cfg] */
  constructor(max = 100, cfg = DIZZY) {
    this.cfg = cfg;
    this.max = max;
    this.value = 0;
    this.dizzy = false;
    /** seconds of dizzy left */
    this.t = 0;
    /** seconds since the last gain */
    this.idleT = 0;
  }

  /** Multiplier on incoming damage crits (×2 while dizzy). */
  get critMul() { return this.dizzy ? this.cfg.critMul : 1; }

  get frac() { return this.max > 0 ? this.value / this.max : 0; }

  /**
   * Add `n` (ignored while dizzy). Returns 'dizzy' when this gain fills the meter, 'gain' on a gain, '' otherwise.
   * @param {number} n
   */
  add(n) {
    if (this.dizzy || !(n > 0)) return '';
    this.value = Math.min(this.max, this.value + n);
    this.idleT = 0;
    if (this.value >= this.max) { this.dizzy = true; this.t = this.cfg.dur; return 'dizzy'; }
    return 'gain';
  }

  /** A landed hit with this attack poise. */
  addPoise(poise = 1) { return this.add(poise * this.cfg.perPoise); }

  /** A parry: +perParry, or straight to full on a gold-glint parry. */
  addParry(gold = false) { return gold ? this.fill() : this.add(this.cfg.perParry); }

  /** Lesson events (the wheel hits a pillar, a choke) fill it. */
  fill() { return this.add(this.max - this.value + 1e-9); }

  /**
   * Advance. Returns 'recovered' when the dizzy window ends (meter back to 0), 'decay' when it decayed this step,
   * '' otherwise.
   * @param {number} dt
   */
  update(dt) {
    if (this.dizzy) {
      this.t -= dt;
      if (this.t <= 0) { this.dizzy = false; this.t = 0; this.value = 0; this.idleT = 0; return 'recovered'; }
      return '';
    }
    this.idleT += dt;
    if (this.value > 0 && this.idleT >= this.cfg.decayDelay) {
      // only the part of this step past the delay decays (exact at the boundary)
      const over = Math.min(dt, this.idleT - this.cfg.decayDelay);
      this.value = Math.max(0, this.value - this.cfg.decayPerSec * over);
      return 'decay';
    }
    return '';
  }

  reset() { this.value = 0; this.dizzy = false; this.t = 0; this.idleT = 0; }
}
