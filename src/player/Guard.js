// src/player/Guard.js  (owner: player) — the Stand, parry, block, guard break, whiff lockout, Grit and the
// Tumble i-frame windows (GAME_DESIGN §7.3, §19.4 `Guard.resolve`). Pure: no THREE, no ctx; node-safe (U1).
import { PLAYER } from '../core/config.js';

/**
 * §19.4 resolve (the player's `resolveIncoming` calls it). Mutates `g.grit` on a block.
 * @param {{dodgeT:number, dodging:boolean, guarding:boolean, guardT:number, parryT?:number, grit:number, lockoutT:number, parryWindow?:number}} g
 * @param {{telegraph?:string, unblockable?:boolean, poise?:number}} def incoming attack def
 * @param {{x:number, z:number}} hitDirIntoTarget unit XZ direction from the attacker INTO her
 * @param {number} facing her yaw (atan2(dir.x, dir.z))
 * @param {typeof PLAYER} [cfg]
 * @returns {'perfectDodge'|'graze'|'hit'|'break'|'parry'|'block'}
 */
export function resolveGuard(g, def, hitDirIntoTarget, facing, cfg = PLAYER) {
  if (g.dodging && g.dodgeT >= cfg.dodge.iframes[0] && g.dodgeT <= cfg.dodge.iframes[1])
    return g.dodgeT <= cfg.dodge.perfect[1] ? 'perfectDodge' : 'graze';        // both → 'immune' for Combat
  if (!g.guarding) return 'hit';
  const fx = Math.sin(facing), fz = Math.cos(facing);
  const frontal = -(hitDirIntoTarget.x * fx + hitDirIntoTarget.z * fz) >= Math.cos(cfg.guard.arc);
  if (!frontal) return 'hit';
  if (def.telegraph === 'red' || def.unblockable) return 'break';
  // parry timing counts from the Stand PRESS (parryT), not from (re-)entering the Stand: a Stand re-entered with the
  // button still held (after a swing, Tumble or stagger) is a plain block (§7.3).
  if (Math.max(g.guardT, g.parryT ?? 0) <= (g.parryWindow ?? cfg.guard.parryWindow) && g.lockoutT <= 0) return 'parry';
  g.grit -= (def.poise ?? 1) >= cfg.guard.heavyPoise ? 2 : 1;
  return g.grit <= 0 ? 'break' : 'block';
}

/**
 * Guard bookkeeping for one actor: Stand timer, whiff lockout, Grit regen and the dodge window flags that
 * `resolveGuard` reads. The owner calls `start()` / `stop()` on Stand edges, `update(dt)` every step and
 * `resolve(def, dir, facing)` for each incoming hit.
 */
export class GuardState {
  /** @param {typeof PLAYER} [cfg] */
  constructor(cfg = PLAYER) {
    this.cfg = cfg;
    this.guarding = false;
    /** seconds since the Stand started (0 while not guarding) */
    this.guardT = 0;
    /** seconds since the Stand press that opened this Stand (≥ guardT; parry window and whiff rule read it) */
    this.parryT = 0;
    this.grit = cfg.guard.grit;
    this.gritMax = cfg.guard.grit;
    /** parry disabled while > 0 (whiff lockout) */
    this.lockoutT = 0;
    /** parry window in seconds (difficulty row + touch bonus; set by the owner) */
    this.parryWindow = cfg.guard.parryWindow;
    this.dodging = false;
    this.dodgeT = 0;
    /** did this Stand block or parry anything? (whiff rule) */
    this.touched = false;
    /** seconds since the last block / parry / break (Grit regen delay) */
    this.sinceBlock = Infinity;
    this._regen = 0;
    /** was the last 'break' a Grit-exhaustion break (not a red / unblockable attack)? */
    this.lastBreakExhaust = false;
    /** > 0: Grit refills to max when this runs out (after the break stagger), so a broken guard is punished once */
    this.refillT = 0;
  }

  /**
   * Stand entered. `sincePress` = seconds since the Stand button was actually pressed: 0 for a fresh press, larger
   * (or Infinity) when the Stand is re-entered with the button still held, which then cannot parry.
   * @param {number} [sincePress]
   */
  start(sincePress = 0) {
    this.guarding = true; this.guardT = 0; this.touched = false;
    this.parryT = Math.max(0, Number.isNaN(sincePress) ? Infinity : sincePress);
  }

  /**
   * Stand released. Returns true if this was a whiff (pressed and released within `whiffWindow` with nothing
   * blocked or parried), which starts the parry lockout.
   */
  stop() {
    if (!this.guarding) return false;
    const g = this.cfg.guard;
    const whiff = Math.max(this.guardT, this.parryT) < g.whiffWindow && !this.touched;
    if (whiff) this.lockoutT = g.whiffLockout;
    this.guarding = false; this.guardT = 0; this.parryT = 0;
    return whiff;
  }

  /**
   * Advance timers and Grit regen. Returns true when Grit changed (regen).
   * @param {number} dt
   */
  update(dt) {
    const g = this.cfg.guard;
    if (this.guarding) { this.guardT += dt; this.parryT += dt; }
    if (this.lockoutT > 0) this.lockoutT = Math.max(0, this.lockoutT - dt);
    this.sinceBlock += dt;
    if (this.refillT > 0) {
      this.refillT = Math.max(0, this.refillT - dt);
      if (this.refillT <= 0) {
        const was = this.grit;
        this.grit = this.gritMax; this._regen = 0;
        return was !== this.grit;
      }
      return false;
    }
    if (this.grit >= this.gritMax) { this._regen = 0; return false; }
    if (this.sinceBlock < g.gritRegenDelay) return false;
    this._regen += dt;
    let changed = false;
    while (this._regen >= g.gritRegenEvery && this.grit < this.gritMax) {
      this._regen -= g.gritRegenEvery;
      this.grit = Math.min(this.gritMax, Math.max(0, this.grit) + 1);
      changed = true;
    }
    return changed;
  }

  /**
   * Resolve one incoming hit against the current Stand / Tumble state.
   * @param {object} def @param {{x:number,z:number}} dir @param {number} facing
   */
  resolve(def, dir, facing) {
    const r = resolveGuard(this, def, dir, facing, this.cfg);
    if (r === 'parry' || r === 'block' || (r === 'break' && this.guarding)) {
      this.touched = true; this.sinceBlock = 0; this._regen = 0;
    }
    if (r === 'break') {
      // Grit exhaustion clamps at 0 and refills after the break stagger (one break per exhaustion, never a chain);
      // red / unblockable attacks keep the Grit they had.
      this.lastBreakExhaust = !(def?.telegraph === 'red' || def?.unblockable);
      this.grit = Math.max(0, this.grit);
      if (this.lastBreakExhaust) this.refillT = this.cfg.guard.breakStagger;
    }
    return r;
  }

  /** Full Grit (checkpoint / respawn / level load). */
  refill() { this.grit = this.gritMax; this._regen = 0; this.sinceBlock = Infinity; this.refillT = 0; }

  reset() {
    this.guarding = false; this.guardT = 0; this.parryT = 0; this.lockoutT = 0; this.dodging = false; this.dodgeT = 0; this.touched = false;
    this.refill();
  }
}

/**
 * Parry window for a difficulty row (§7.9) plus the touch bonus (§7.3: touch +0.05 s).
 * @param {{parry?:number}|null|undefined} diff @param {boolean} touch @param {typeof PLAYER} [cfg]
 */
export function parryWindowFor(diff, touch, cfg = PLAYER) {
  return (diff?.parry ?? cfg.guard.parryWindow) + (touch ? cfg.guard.touchParryBonus : 0);
}
