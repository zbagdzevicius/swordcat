// src/combat/AttackTokens.js  (owner: combat) — at most N enemies attack at once (tech.md §10, GAME_DESIGN §8.3).
// Limits come from the difficulty row: Appendix A DIFFICULTY.<id>.tokens = [melee, ranged]
// (Kitten 1/1, Knight 2/2, Nine Lives 3/2), read live so a difficulty change applies at once.
//
// Fairness ("kung-fu circle"): an enemy that asked and was refused waits in line. When a token frees up, the
// longest-waiting enemy that is still asking gets it first; a request goes stale after `COMBAT.tokenStale` s
// without being repeated (the enemy wandered off), so a stale waiter never blocks the others.
// Robustness: holders that died, were unregistered or held a token longer than `COMBAT.tokenMaxHold` are reclaimed.
// Pure (no three.js): `orbitPoint` writes into any {x, y, z}.
import { COMBAT } from './attacks.js';

/** @typedef {'melee'|'ranged'} TokenKind */

export class AttackTokens {
  /**
   * @param {() => [number, number]} [limits] current [melee, ranged] limits
   * @param {() => number} [clock] current sim time in seconds (fairness, max hold)
   */
  constructor(limits = () => [2, 2], clock = () => 0) {
    this.limits = limits;
    this.clock = clock;
    /** @type {Set<any>} */ this.melee = new Set();
    /** @type {Set<any>} */ this.ranged = new Set();
    /** actor → { kind, since, last } for refused requests */
    this.waiting = new Map();
    /** actor → time the token was granted */
    this._since = new Map();
  }

  /** Current limit for `kind`. */
  limit(kind = 'melee') {
    const l = this.limits() ?? [2, 2];
    return Math.max(0, kind === 'ranged' ? (l[1] ?? 0) : (l[0] ?? 0));
  }

  /** Holders of `kind`. */
  holders(kind = 'melee') { return kind === 'ranged' ? this.ranged : this.melee; }

  /** Tokens of `kind` in use. */
  count(kind = 'melee') { return this.holders(kind).size; }

  /**
   * Try to take a token. Re-acquiring a held token returns true.
   * @param {any} actor @param {TokenKind} [kind]
   */
  acquire(actor, kind = 'melee') {
    if (!actor) return false;
    const set = this.holders(kind);
    if (set.has(actor)) return true;
    const now = this.clock();
    this._reclaim(set, now);
    const w = this.waiting.get(actor);
    if (set.size < this.limit(kind) && !this._someoneAhead(actor, kind, w ? w.since : now, now)) {
      set.add(actor);
      this._since.set(actor, now);
      this.waiting.delete(actor);
      return true;
    }
    if (w && w.kind === kind) w.last = now;
    else this.waiting.set(actor, { kind, since: now, last: now });
    return false;
  }

  /** Give back every token `actor` holds (and leave the line). Safe to call at any time. */
  release(actor) {
    this.melee.delete(actor); this.ranged.delete(actor);
    this._since.delete(actor); this.waiting.delete(actor);
  }

  /** Does `actor` hold a token (of `kind`, or of any kind)? */
  has(actor, kind) { return kind ? this.holders(kind).has(actor) : (this.melee.has(actor) || this.ranged.has(actor)); }

  /** Is `actor` waiting for a token? */
  isWaiting(actor) {
    const w = this.waiting.get(actor);
    return !!w && this.clock() - w.last <= COMBAT.tokenStale;
  }

  /**
   * Drop holders and waiters for which `keep(actor)` is false (dead, despawned). Called by Combat every step.
   * @param {(actor:any) => boolean} keep
   */
  prune(keep) {
    for (const set of [this.melee, this.ranged]) for (const a of set) if (!keep(a)) { set.delete(a); this._since.delete(a); }
    const now = this.clock();
    for (const [a, w] of this.waiting) if (!keep(a) || now - w.last > COMBAT.tokenStale * 4) this.waiting.delete(a);
  }

  /**
   * Orbit slot for a tokenless enemy ("kung-fu circle"): the enemies waiting in line spread evenly around `target`
   * at `radius`, ordered by actor id. Slot 0 sits in front of the target's facing, then the slots fan out
   * alternately to her left and right (+1, −1, +2, −2 ...), so later arrivals end up at her flanks and back.
   * Writes into `out` ({x, y, z}); returns it.
   */
  orbitPoint(actor, target, radius, out) {
    const tp = target.pos ?? target;
    let n = 0, idx = 0;
    for (const [a] of this.waiting) {
      if (a !== actor && !this.isWaiting(a)) continue;
      if (a !== actor && (a.id ?? 0) < (actor.id ?? 0)) idx++;
      n++;
    }
    if (!this.waiting.has(actor)) n++;
    n = Math.max(1, n);
    const spread = (2 * Math.PI) / n;
    const k = idx === 0 ? 0 : Math.ceil(idx / 2) * (idx % 2 ? 1 : -1);
    const ang = (target.facing ?? 0) + k * spread;
    out.x = tp.x + Math.sin(ang) * radius; out.y = tp.y ?? 0; out.z = tp.z + Math.cos(ang) * radius;
    return out;
  }

  clear() { this.melee.clear(); this.ranged.clear(); this.waiting.clear(); this._since.clear(); }

  // ---------------------------------------------------------------- internals
  /** Someone else of the same kind has been waiting longer and is still asking? */
  _someoneAhead(actor, kind, since, now) {
    for (const [a, w] of this.waiting) {
      if (a === actor || w.kind !== kind) continue;
      if (now - w.last > COMBAT.tokenStale) continue;
      if (a.alive === false) continue;
      if (w.since < since) return true;
    }
    return false;
  }

  _reclaim(set, now) {
    for (const a of set) {
      const t = this._since.get(a) ?? now;
      if (a.alive === false || now - t > COMBAT.tokenMaxHold) { set.delete(a); this._since.delete(a); }
    }
  }
}
