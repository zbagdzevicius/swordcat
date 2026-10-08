// src/player/Valor.js  (owner: player) — the sword-shaped Valor meter, 0–100 (GAME_DESIGN §7.4, §7.3 Standing
// Ground, §7.5 Golden Hour lock). Pure: no THREE, no ctx; node-safe (U2). The Player emits `player:valor`.
import { PLAYER } from '../core/config.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Flat gains by reason (§7.4 table). Hits go through `hit()` (per-swing light cap). */
export function valorGain(reason, cfg = PLAYER) {
  const v = cfg.valor, d = cfg.dodge;
  switch (reason) {
    case 'light': return v.light;
    case 'heavy': return v.heavy;
    case 'parry': return v.parry;
    case 'riposte': return v.riposte;
    case 'perfectDodge': return d.perfectValor;
    case 'graze': return d.grazeValor;
    case 'choke': return v.choke;
    case 'kitten': return v.kitten;
    case 'stillStanding': return cfg.stillStanding.valor;
    case 'hurt': return v.onHurt;
    default: return 0;
  }
}

export class Valor {
  /** @param {typeof PLAYER} [cfg] */
  constructor(cfg = PLAYER) {
    this.cfg = cfg;
    this.value = 0;
    this.max = cfg.valor.max;
    /** gains are ignored while > 0 (Golden Hour aftermath: "locked at 0 for 3 s") */
    this.lockT = 0;
    /** multiplier on gains (the Library's valorGain upgrade) */
    this.gainMul = 1;
    // per-swing light-hit cap
    this.swingKey = null; this.swingLight = 0;
    // Standing Ground (per Stand)
    this.standGained = 0; this.plantedT = 0; this.releasedT = Infinity;
    /** true while Standing Ground is paying out (visuals: cape billow, mist) */
    this.standing = false;
  }

  /**
   * Add `n` (negative = drain). Positive gains are scaled by `gainMul` and ignored while locked.
   * @returns {number} the delta actually applied
   */
  add(n, reason = '') {
    if (!Number.isFinite(n) || n === 0) return 0;
    if (n > 0) {
      if (this.lockT > 0) return 0;
      n *= this.gainMul;
    }
    const before = this.value;
    this.value = clamp(before + n, 0, this.max);
    return this.value - before;
  }

  /** Flat gain by reason (`valorGain`). */
  gain(reason) { return this.add(valorGain(reason, this.cfg), reason); }

  /** Set an absolute value (test hook / spends). Ignores the lock. Returns the delta. */
  set(n) {
    const before = this.value;
    this.value = clamp(Number.isFinite(n) ? n : 0, 0, this.max);
    return this.value - before;
  }

  /**
   * A landed hit. `kind`: 'light' (+4, at most +8 per swing) | 'heavy' (+6). `swingKey` identifies the swing
   * (any value that changes per swing). Returns the delta.
   */
  hit(kind, swingKey) {
    const v = this.cfg.valor;
    if (kind === 'light') {
      if (swingKey !== this.swingKey) { this.swingKey = swingKey; this.swingLight = 0; }
      const room = v.lightPerSwingCap - this.swingLight;
      if (room <= 0) return 0;
      const g = Math.min(v.light, room);
      this.swingLight += g;
      return this.add(g, 'light');
    }
    if (kind === 'heavy') return this.add(v.heavy, 'heavy');
    return 0;
  }

  /**
   * Standing Ground and the Jeer drain, once per fixed step (§7.3, §7.4).
   * @param {number} dt
   * @param {{guarding:boolean, speed:number, threatened:boolean, inJeer:boolean}} s
   * @returns {number} delta applied this step
   */
  standTick(dt, { guarding, speed, threatened, inJeer }) {
    const sg = this.cfg.standingGround;
    let delta = 0;
    this.standing = false;
    if (guarding) {
      this.releasedT = 0;
      this.plantedT = speed < sg.maxSpeed ? this.plantedT + dt : 0;
      if (this.plantedT >= sg.minHold && threatened) {
        const room = sg.capPerStand - this.standGained;
        if (room > 1e-9) {
          this.standing = true;
          const g = Math.min((inJeer ? sg.jeerPerSec : sg.perSec) * dt, room);
          const applied = this.add(g, 'stand');
          if (applied > 0) this.standGained += applied / this.gainMul;
          delta += applied;
        }
      }
    } else {
      this.plantedT = 0;
      this.releasedT += dt;
      if (this.releasedT >= sg.resetAfter) this.standGained = 0;
      if (inJeer) delta += this.add(-this.cfg.valor.jeerDrainPerSec * dt, 'jeer');
    }
    return delta;
  }

  /** Taking damage: −10. */
  hurt() { return this.add(this.cfg.valor.onHurt, 'hurt'); }

  canSpend(n) { return this.value + 1e-6 >= n; }

  /** Spend `n` (Holy −50, Golden Hour −100). Returns the delta (≤ 0). */
  spend(n) { return this.set(this.value - n); }

  /** Golden Hour ended: Valor is locked at 0 for `sec`. */
  lock(sec = this.cfg.golden.valorLockAfter) { const d = this.set(0); this.lockT = sec; return d; }

  /** Respawn after a lost life: halved (rounded down). */
  respawn() { return this.set(Math.floor(this.value * this.cfg.valor.respawnMul)); }

  /** Level load: back to 0, no lock, fresh Stand bookkeeping. */
  reset() {
    const d = this.set(0);
    this.lockT = 0; this.swingKey = null; this.swingLight = 0;
    this.standGained = 0; this.plantedT = 0; this.releasedT = Infinity; this.standing = false;
    return d;
  }

  update(dt) { if (this.lockT > 0) this.lockT = Math.max(0, this.lockT - dt); }

  get full() { return this.value >= this.max - 1e-6; }
  get frac() { return this.value / this.max; }
}
