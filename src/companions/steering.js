// src/companions/steering.js  (owner: companions) — pure helpers for companion AI (GAME_DESIGN §9.1, tech.md §10):
// follow slots, seek/arrive + separation steering, the "engaging her" rule, target picking, damage estimates and
// XZ segment tests (Shield Wall occlusion). No DOM, no ctx: unit-tested in tests/unit/companions.test.js.
import { COMPANIONS } from '../core/config.js';

/** Enemy FSM states that count as "engaging Swordcat" (§9.1: companions only engage those). */
export const ENGAGED_STATES = new Set(['alert', 'chase', 'windup', 'strike', 'recover', 'attack', 'orbit', 'gloat', 'jeer',
  'lunge', 'aim', 'reload', 'dive', 'stagger', 'circle']);

/** The companion ids that fight beside her (§3.3); everything else spawned through the manager is an NPC. */
export const COMPANION_IDS = Object.freeze(['mochi', 'sage', 'clover']);

/** Flag set by each join scene (§19.7: `meadow.mochi` D-01, `forest.sage` D-02, `town.clover` D-04). */
export const JOIN_FLAGS = Object.freeze({ 'meadow.mochi': 'mochi', 'forest.sage': 'sage', 'town.clover': 'clover' });

/**
 * Service kittens rescued in M2 (§3.4: D-03 Marmalade, D-04 Tofu / Earl Grey, D-06 Pip): rescued like lost kittens
 * (hide, cage, contact) but they play their scene instead of joining the kitten count. Flag each scene's end sets.
 */
export const SERVICE_FLAGS = Object.freeze({ marmalade: 'town.marmalade', tofu: 'town.tofu', earlgrey: 'town.earlgrey', pip: 'gate.pip' });
export const SERVICE_IDS = Object.freeze(Object.keys(SERVICE_FLAGS));
/** The scene each service rescue plays (story's cutscene ids; placeholders until story authors them). */
export const SERVICE_SCENES = Object.freeze({ marmalade: 'd03', tofu: 'd04tofu', earlgrey: 'd04earlgrey', pip: 'd06' });
/** The scene each caged squire plays when freed (§5.4 D-01, D-02, D-04 Clover). */
export const JOIN_SCENES = Object.freeze({ mochi: 'd01', sage: 'd02', clover: 'd04clover' });

/**
 * Next companion in the swap cycle (§9.1: swap at any Vigil Stone or the hub Barracks banner): the unlocked ids in
 * COMPANION_IDS order, starting after `current`. Returns null when there is nothing to swap to. Pure.
 * @param {string[]} unlocked @param {string|null} current @param {number} [dir] +1 next, −1 previous
 */
export function nextCompanion(unlocked, current, dir = 1) {
  const ids = COMPANION_IDS.filter((id) => unlocked?.includes?.(id));
  if (!ids.length) return null;
  const i = ids.indexOf(current);
  if (i < 0) return ids[0];
  if (ids.length < 2) return null;
  return ids[(i + (dir < 0 ? ids.length - 1 : 1)) % ids.length];
}

/** Side of the player each companion prefers (+1 = her left, −1 = her right). */
export const FOLLOW_SIDE = Object.freeze({ mochi: 1, sage: -1, clover: 1 });

/** Follow-slot geometry (metres): the slot sits COMPANIONS.follow (2.5 m) from her, behind and to the side. */
export const SLOT = Object.freeze({
  angle: 0.6,                    // the moving slot: 0.6 rad off straight behind (≈ 2.06 m back, 1.41 m aside)
  regroupDist: 1.35, regroupAngle: 1.3,   // beside her (after her Meow, or once she stands still): in the camera's view
  besideAfter: 0.8,              // seconds she must stand still before we come up beside her
  settleRadius: 1.2,             // once settled beside her, stay put until the slot drifts this far
  deadZone: 0.35, idleBand: [1.0, 3.4],
});

/**
 * Walkable ground height at (x, z) for an actor arriving from about `fromY` (bridge decks, prop tops, terrain),
 * through physics' `groundAt` when present, else the heightfield, else `fromY`.
 */
export function groundY(ctx, x, z, fromY = 0) {
  const ph = ctx?.physics;
  if (typeof ph?.groundAt === 'function') { const g = ph.groundAt(x, z, fromY + 1.2); if (Number.isFinite(g)) return g; }
  if (typeof ph?.heightAt === 'function') { const g = ph.heightAt(x, z); if (Number.isFinite(g)) return g; }
  return fromY;
}

/**
 * World XZ of the follow slot for a player heading `yaw` (radians, facing = atan2(x, z); +X is her left when facing +Z).
 * @param {{x:number,z:number}} p player position @param {number} yaw @param {number} side +1 left / −1 right
 * @param {{x:number,z:number}} out @param {{dist?:number, angle?:number}} [o]
 */
export function followSlot(p, yaw, side, out, { dist = COMPANIONS.follow, angle = SLOT.angle } = {}) {
  // behind = yaw + PI; rotate toward her left (+) or right (−) by `angle`
  const a = yaw + Math.PI - side * angle;
  out.x = p.x + Math.sin(a) * dist;
  out.z = p.z + Math.cos(a) * dist;
  return out;
}

/**
 * Seek + arrive: desired XZ velocity toward (tx, tz) capped at `maxSpeed`, easing off inside `slowRadius`.
 * Returns the distance to the target. Writes `out.x`, `out.z`.
 */
export function arrive(px, pz, tx, tz, maxSpeed, slowRadius, out, deadZone = 0) {
  const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz);
  if (d <= deadZone || d < 1e-6) { out.x = 0; out.z = 0; return d; }
  const s = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
  out.x = (dx / d) * s; out.z = (dz / d) * s;
  return d;
}

/**
 * Separation: push away from neighbours closer than `radius` (linear falloff). Adds into `out`.
 * @param {{x:number,z:number}} pos @param {Array<{pos:{x:number,z:number}}>} others @param {number} radius @param {number} strength
 */
export function separation(pos, others, radius, strength, out, self = null) {
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    if (!o || o === self) continue;
    const dx = pos.x - o.pos.x, dz = pos.z - o.pos.z, d = Math.hypot(dx, dz);
    if (d >= radius || d < 1e-5) continue;
    const k = (1 - d / radius) * strength / d;
    out.x += dx * k; out.z += dz * k;
  }
  return out;
}

/** Flying enemy (crows, bats): tagged `flyer`, or its type flies (ENEMIES[*].fly). */
export function isFlyer(e) { return !!(e?.tags?.has?.('flyer') || e?.def?.fly); }

/** True when `e` is a live, hurtable enemy currently engaging the player (§9.1). */
export function isEngaged(e) {
  if (!e || !e.alive || e.hurtable === false || e.faction !== 'enemy') return false;
  if (e.scripted) return false;
  return e.alerted === true || ENGAGED_STATES.has(e.stateName);
}

/**
 * Pick the enemy a companion should fight: engaging her, within `engage` m of HER, reachable from the ground
 * (flyers higher than `maxLift` above the companion are skipped). Prefers the one nearest to the player,
 * keeping the current target when it is still valid (no target flapping).
 * @returns {any|null}
 */
export function pickTarget(companionPos, playerPos, enemies, { engage = COMPANIONS.engage, current = null, maxLift = 1.2, groundAt = null } = {}) {
  const ok = (e) => {
    if (!isEngaged(e)) return false;
    if (Math.hypot(e.pos.x - playerPos.x, e.pos.z - playerPos.z) > engage) return false;
    const g = groundAt ? groundAt(e.pos.x, e.pos.z) : companionPos.y;
    return e.pos.y - g <= maxLift;
  };
  if (current && ok(current)) return current;
  let best = null, bd = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!ok(e)) continue;
    const d = Math.hypot(e.pos.x - playerPos.x, e.pos.z - playerPos.z) + 0.35 * Math.hypot(e.pos.x - companionPos.x, e.pos.z - companionPos.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/**
 * Damage `def` would deal (mirrors Combat.applyHit): `ally` targets (companions) take player-scale damage with the
 * difficulty rounding (`roundTaken`); others take × `playerDmgMul`, at least 1.
 */
export function estimateDamage(def, diff, { dmgMul = 1, crit = 1, ally = false } = {}) {
  const base = (def?.dmg ?? 0) * dmgMul * Math.max(crit, def?.crit ?? 1);
  if (!(base > 0)) return 0;
  if (ally) return Math.max(0, Math.round(typeof diff?.roundTaken === 'function' ? diff.roundTaken(Math.round(base)) : base));
  return Math.max(1, Math.round(base * (diff?.playerDmgMul ?? 1)));
}

/**
 * Do XZ segments AB and CD intersect? Returns the parameter t along AB (0..1) or −1.
 */
export function segmentHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return -1;                       // parallel
  const qx = cx - ax, qz = cz - az;
  const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/** Signed distance of (x, z) from a wall line through (cx, cz) with unit normal (nx, nz). */
export function wallSide(x, z, cx, cz, nx, nz) { return (x - cx) * nx + (z - cz) * nz; }

/** Camera-forward on the ground plane from FollowCamera's yaw (forward = (−sin yaw, 0, −cos yaw)), as a facing yaw. */
export function camForwardYaw(camYaw) { return Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw)); }

/**
 * Bark bookkeeping (§6 rules): at most one bark per `gap` s across the party, `chance` per trigger,
 * no repeat of the same line within `noRepeat` s. Pure; time is passed in.
 */
export class BarkGate {
  constructor({ gap = 6, noRepeat = 60 } = {}) { this.gap = gap; this.noRepeat = noRepeat; this.lastAt = -Infinity; this.used = new Map(); }
  /** @param {string[]} keys candidate lines @param {number} now @param {() => number} rng @param {{chance?:number, force?:boolean}} [o] → key | null */
  pick(keys, now, rng, { chance = 0.25, force = false } = {}) {
    if (!keys?.length) return null;
    if (!force && now - this.lastAt < this.gap) return null;
    if (!force && rng() >= chance) return null;
    const fresh = keys.filter((k) => !(now - (this.used.get(k) ?? -Infinity) < this.noRepeat));
    const pool = fresh.length ? fresh : (force ? keys : []);
    if (!pool.length) return null;
    const key = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    this.used.set(key, now); this.lastAt = now;
    return key;
  }
}
