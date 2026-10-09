// src/enemies/status.js  (owner: enemies) — status effects enemies put on her (GAME_DESIGN §10.3 spider_web: "slows
// 50% for 2.0 s; a roll clears it"). Duck-typed so the player area can own the real effect:
//   - if the target has `applySlow(mul, sec, source)` it is called (the player's own implementation, requested in
//     requests/enemies.md), and nothing else happens here;
//   - otherwise the fields Clover's mend cleanses (`slow`, `slowT`; companions/abilities.js) are set and
//     `tickSlow` (called once per fixed step by EnemyManager, after the player moved) scales her planar velocity, so
//     the slow works before the player adopts it. A tumble (`stateName === 'dodge'`) clears it.
import { PLAYER } from '../core/config.js';

/**
 * Slow `t` to `mul` × speed for `sec` seconds (the strongest / longest wins).
 * @param {any} t @param {number} mul @param {number} sec @param {any} [source]
 * @returns {boolean} true when applied
 */
export function applySlow(t, mul, sec, source = null) {
  if (!t || t.alive === false || !(sec > 0)) return false;
  if (typeof t.applySlow === 'function') { t.applySlow(mul, sec, source); return true; }
  if (isRolling(t)) return false;
  t.slowT = Math.max(t.slowT ?? 0, sec);
  t.slow = Math.max(t.slow ?? 0, 1 - mul);           // `slow` = fraction of speed removed (Clover zeroes it)
  return true;
}

/** Is she tumbling (a roll clears webs)? */
export function isRolling(t) {
  const s = t?.stateName;
  return s === 'dodge' || s === 'tumble' || s === 'roll';
}

/**
 * Fallback slow (players without `applySlow`): count `slowT` down, clear it on a roll, and scale her planar velocity
 * by (1 − slow) while it runs. Returns the multiplier applied (1 = none).
 * @param {any} p @param {number} dt
 */
export function tickSlow(p, dt) {
  if (!p || typeof p.applySlow === 'function' || !(p.slowT > 0)) return 1;
  if (isRolling(p) || p.alive === false || p.scripted) { p.slowT = 0; p.slow = 0; return 1; }
  p.slowT = Math.max(0, p.slowT - dt);
  if (p.slowT <= 0) { p.slow = 0; return 1; }
  const k = stepFactor(1 - Math.min(0.9, Math.max(0, p.slow ?? 0)), dt);
  if (p.vel) { p.vel.x *= k; p.vel.z *= k; }
  return k;
}

/**
 * Per-step velocity factor that settles her damped locomotion (v += (target − v)·a each step, a = 1 − e^(−damp·dt))
 * at `m` × the target speed: k = m / (a + (1 − a)·m). Pure; exported for tests.
 * @param {number} m wanted speed multiplier @param {number} dt @param {number} [damp] PLAYER.accelDamp
 */
export function stepFactor(m, dt, damp = PLAYER.accelDamp ?? 14) {
  const a = 1 - Math.exp(-damp * dt);
  return m / (a + (1 - a) * m);
}

/** Is `t` currently slowed (either implementation)? */
export function isSlowed(t) {
  if (!t) return false;
  if (typeof t.isSlowed === 'function') return !!t.isSlowed();
  return (t.slowT ?? 0) > 0 && (t.slow ?? 0) > 0;
}
