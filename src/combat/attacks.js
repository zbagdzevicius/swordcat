// src/combat/attacks.js  (owner: combat) — the attack table and the pure helpers around it.
//
// The table itself is Appendix A `ATTACKS` (core/config.js; every row carries its `id`). Boss moves live in the
// boss type files (Appendix B.4) and use the same fields. This module adds:
//   - `attack(id)`            lookup that throws on typos (data bugs surface in tests)
//   - `COMBAT`                combat tuning that is not in Appendix A (cited from tech.md §9 / GAME_DESIGN §7–§8)
//   - `ATTACK_EXTRAS`         per-attack numbers from the GAME_DESIGN §7.2 table missing from Appendix A
//   - swing curve helpers     `swingProgress`, `swingAngle`, `isFullCircle` (visuals follow the hit curve, §9.2)
//   - juice classification   `juiceKind`, `juiceFor` (GAME_DESIGN §8.2 rows)
//   - derived defs            `reflectedDef`, `ringDef`, `variantDef` (cached; HIT events keep the base `id`)
// Pure and node-safe (no three.js, no DOM).
import { ATTACKS, PLAYER, JUICE, ECONOMY, COMBAT } from '../core/config.js';
import { clamp01, lerp, easeSwing } from '../core/math.js';

export { ATTACKS, easeSwing };

/**
 * Combat tuning not covered by Appendix A (tech.md §9 / GAME_DESIGN §7–§8). Lives in `config.COMBAT` since M2
 * (requests/combat.md); re-exported here so every existing `import { COMBAT }` keeps working.
 */
export { COMBAT };

/**
 * GAME_DESIGN §7.2 numbers that Appendix A leaves out (hitstop / shake of the projectile attacks).
 * `gleam` has "—" in the table: no hitstop, no shake.
 */
export const ATTACK_EXTRAS = Object.freeze({
  holyWave: Object.freeze({ hitstop: 0.06, shake: 0.20 }),
  gleam: Object.freeze({ hitstop: 0, shake: 0 }),
});

/** Projectile look by attack id (Projectiles.js). Anything else: `wave` if it has a `width`, else `orb`. */
export const PROJECTILE_KIND = Object.freeze({ rat_bolt: 'bolt', bone_bolt: 'orb', spider_web: 'glob', holyWave: 'wave', gleam: 'gleam' });

/** Player swings that fire a `gleam` crescent during Golden Hour ("every slash", §7.5). */
export const GLEAM_FROM = Object.freeze(new Set(['slash1', 'slash2', 'slash3', 'bright', 'riposte']));

/** Projectile attacks that combat may auto-spawn from a swing (deduplicated if a caller spawns them too). */
export const AUTO_PROJECTILES = Object.freeze(new Set(['holyWave', 'gleam']));

/** Attack def by id (throws on typos so data bugs surface in tests). */
export function attack(id) {
  const d = ATTACKS[id];
  if (!d) throw new Error(`[combat] unknown attack "${id}"`);
  return d;
}

/** True if the arc covers the full circle (holy, sunburst). */
export function isFullCircle(arc) {
  return !!arc && Math.abs(arc.from - arc.to) >= 2 * Math.PI - 1e-3;
}

/**
 * Eased swing progress 0..1 at time `t` (seconds since the swing began), tech.md §9.2.
 * Before the active window → 0, after → 1. Defs without `active` are active from 0 to `dur` (or forever).
 */
export function swingProgress(def, t, active = def?.active) {
  const t0 = active ? active[0] : 0, t1 = active ? active[1] : (def?.dur ?? Infinity);
  if (!(t1 > t0) || t1 === Infinity) return t >= t0 ? 1 : 0;
  return easeSwing(clamp01((t - t0) / (t1 - t0)));
}

/** Blade angle (radians, relative to the attacker's facing, positive = her left) at time `t`. */
export function swingAngle(def, t, arc = def?.arc, active = def?.active) {
  if (!arc) return 0;
  return lerp(arc.from, arc.to, swingProgress(def, t, active));
}

/** Is `t` inside the def's active window? */
export function isActive(def, t, active = def?.active) {
  const t0 = active ? active[0] : 0, t1 = active ? active[1] : (def?.dur ?? Infinity);
  return t >= t0 && t <= t1;
}

/**
 * GAME_DESIGN §8.2 row for a hit: 'hurt' (the player takes it), 'holy' (holy / sunburst), 'heavy' or 'light'.
 * `targetFaction === 'bump'` marks a harmless 0-damage hit on the player (tutorial dummy / sack, web glob): the
 * light row's hitstop and shake, no rumble.
 * @param {any} def @param {string} [targetFaction]
 */
export function juiceKind(def, targetFaction) {
  if (targetFaction === 'bump') return 'bump';
  if (targetFaction === 'player') return 'hurt';
  if (def?.id === 'holy' || def?.id === 'sunburst') return 'holy';
  return def?.heavy ? 'heavy' : 'light';
}

/**
 * Hitstop, shake trauma and rumble for a landed hit (before the kill bonus).
 * Player-taken: hitstop `PLAYER.hurt.hitstop`, shake `(def.shake ?? PLAYER.hurt.shake) × JUICE.hurt.shakeMul`.
 * Player-dealt: the def's own numbers, then §7.2 extras, then the §8.2 row.
 * @returns {{ kind: string, hitstop: number, shake: number, rumble: number[]|null }}
 */
export function juiceFor(def, targetFaction, attackerFaction) {
  const kind = juiceKind(def, targetFaction);
  const extra = ATTACK_EXTRAS[def?.id];
  if (kind === 'hurt') {
    return { kind, hitstop: PLAYER.hurt.hitstop, shake: (def?.shake ?? PLAYER.hurt.shake) * JUICE.hurt.shakeMul, rumble: JUICE.hurt.rumble };
  }
  if (kind === 'bump') return { kind, hitstop: JUICE.light.hitstop, shake: JUICE.light.shake, rumble: null };
  const row = JUICE[kind];
  const playerSide = attackerFaction === 'player';
  return {
    kind,
    hitstop: def?.hitstop ?? extra?.hitstop ?? row.hitstop,
    shake: def?.shake ?? extra?.shake ?? row.shake,
    rumble: playerSide ? row.rumble : null,
  };
}

/** Sharpness shop multiplier (ECONOMY.shops.sharp.mul by level; level 0 → 1). */
export function sharpMul(level) {
  const n = level | 0;
  return n > 0 ? (ECONOMY.shops.sharp.mul[Math.min(n, ECONOMY.shops.sharp.mul.length) - 1] ?? 1) : 1;
}

// ------------------------------------------------------------------ derived defs (cached, frozen)
const _variants = new Map();

/**
 * A cached variant of `def` with `overrides` merged in. The variant keeps the base `id` (so audio / fx maps still
 * match) and records `base` (the original def) and `part` (the variant key).
 */
export function variantDef(def, part, overrides) {
  let byPart = _variants.get(def);
  if (!byPart) _variants.set(def, (byPart = new Map()));
  let v = byPart.get(part);
  if (!v) {
    v = Object.freeze({ ...def, ...overrides, id: def.id, base: def.base ?? def, part });
    byPart.set(part, v);
  }
  return v;
}

/**
 * The def a parried projectile flies with (§7.3: reflected at 1.5× speed for `reflectDmg`, default 25).
 * Heavy juice, unblockable telegraph cleared, owned by the reflector from then on.
 */
export function reflectedDef(def) {
  return variantDef(def, 'reflected', {
    dmg: def.reflectDmg ?? PLAYER.guard.reflectDmg, reflected: true, telegraph: undefined, unblockable: false,
    hitstop: JUICE.heavy.hitstop, shake: JUICE.heavy.shake,
  });
}

/** Pounce landing ring (Appendix A `pounce.ring`): r 1.3, 10 dmg, full circle around her feet. */
export function ringDef(def) {
  const ring = def.ring ?? { r: def.arc?.range ?? 1, dmg: def.dmg };
  return variantDef(def, 'ring', {
    dmg: ring.dmg, arc: { range: ring.r, from: Math.PI, to: -Math.PI, y0: def.arc?.y0 ?? 0, y1: def.arc?.y1 ?? 1 },
  });
}
