// src/player/tricks/RibbonTwirl.js  (owner: player, TT3 package A) — the Ribbon Twirl glide (docs/TOKENTAILS-PLAN.md
// §11.3 #2). Press Jump again in the air and hold it: the pink bow spins like a propeller, the fall is capped at
// TRICKS.twirl.fallMax, she steers at TRICKS.twirl.speed for up to TRICKS.twirl.maxTime s, once per jump. The start
// spins a 1.0 m hit (6 damage, crows knocked back). After a Pounce pogo it carries further. The fixed-step state is
// `twirl` in PlayerStates.js; the rules here are pure so they are unit-tested.
import { TRICKS } from './tuning.js';
import { damp } from '../../core/math.js';

const T = TRICKS.twirl;

/** The spin hit (combat.areaHit): every foe within spinR of her, all around, from her feet to over her head. */
export const TWIRL_SPIN = Object.freeze({ id: 'trickTwirl', dmg: T.spinDmg, knock: 3, poise: 1, telegraph: null,
  arc: Object.freeze({ range: T.spinR, from: Math.PI, to: -Math.PI, y0: -1.2, y1: 1.8 }) });

/** The glide's gravity while she falls (× GRAVITY). Never while she rises: TT5 removed the twirl super-jump. */
export const TWIRL_FALL_GRAVITY = 0.55;

/**
 * The twirl's gravity multiplier for a vertical speed (TT5 §13.1 #2): the low glide gravity only while she falls,
 * normal gravity while she still rises, so a twirl started on the way up never lifts her above a plain jump. Pure.
 * @param {number} vy
 */
export function twirlGravityMul(vy) { return vy < 0 ? TWIRL_FALL_GRAVITY : 1; }

/**
 * Can a twirl start now? Pure on a plain snapshot:
 *   owned, airborne, a FRESH Jump press (holding Jump from take-off never twirls), past the take-off grace, not used
 *   this jump, no coyote jump pending, and a state that allows it ('move' only: not in a swing, a Pounce or a Tumble).
 * @param {{ owned: boolean, onGround: boolean, pressed: boolean, airT: number, used: boolean, coyoteT?: number, state: string, alive?: boolean }} s
 */
export function canTwirl(s) {
  return !!s.owned && !s.onGround && !!s.pressed && s.airT >= T.minAir && !s.used && !((s.coyoteT ?? 0) > 0)
    && s.state === 'move' && s.alive !== false;
}

/** The twirl's limits for this jump: { speed, maxTime, fallMax }, carried further after a Pounce pogo. Pure. */
export function twirlLimits(pogo = false) {
  const k = pogo ? T.pogoMul : 1;
  return { speed: T.speed * k, maxTime: T.maxTime * k, fallMax: T.fallMax };
}

/**
 * One fixed step of the glide on a velocity (mutates `vel`): the fall is capped at `fallMax` (rising is left alone),
 * the horizontal speed eases toward `wish` × `speed` (wish = unit stick direction scaled by the stick, may be 0).
 * Returns the fall speed after the cap. Pure (no ctx).
 * @param {{x:number,y:number,z:number}} vel @param {{x:number,z:number}} wish @param {number} mag 0..1
 * @param {{speed:number, fallMax:number}} lim @param {number} dt
 */
export function glideStep(vel, wish, mag, lim, dt) {
  const tx = wish.x * lim.speed * mag, tz = wish.z * lim.speed * mag;
  const lambda = mag > 0.05 ? 6 : 2.5;
  vel.x = damp(vel.x, tx, lambda, dt);
  vel.z = damp(vel.z, tz, lambda, dt);
  const h = Math.hypot(vel.x, vel.z);
  if (h > lim.speed) { vel.x *= lim.speed / h; vel.z *= lim.speed / h; }
  if (vel.y < -lim.fallMax) vel.y = -lim.fallMax;
  return -vel.y;
}

/**
 * The start spin: 6 damage to every foe within spinR (combat.areaHit), crows within reach knocked back and grounded
 * briefly. Returns the number of foes hit.
 * @param {any} ctx @param {any} p the player
 */
export function twirlSpin(ctx, p) {
  const combat = ctx.combat;
  if (!combat?.areaHit) return 0;
  let n = 0;
  try { n = combat.areaHit(p, TWIRL_SPIN, { r: T.spinR, dmg: T.spinDmg, y0: TWIRL_SPIN.arc.y0, y1: TWIRL_SPIN.arc.y1 }); } catch (e) { console.warn('[tricks] twirl spin', e); }
  // crows: knocked back out of the spin (they are often just above her reach)
  const q = ctx.actors?.queryRadius?.(p.pos, T.spinR + 2.5, combat.targetFilter?.('player') ?? null, _q) ?? [];
  for (let i = 0; i < q.length; i++) {
    const e = q[i];
    if (!e?.alive || !(e.def?.fly || e.tags?.has?.('flyer'))) continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d > T.spinR + (e.radius ?? 0.35) + 1.0 || Math.abs(e.pos.y - p.pos.y) > 2.5) continue;
    if (e.vel) { e.vel.x += (dx / d) * T.crowKnock; e.vel.z += (dz / d) * T.crowKnock; }
    try { e.stagger?.(0.35); } catch { /* optional */ }
    n++;
  }
  _q.length = 0;
  return n;
}
const _q = [];
