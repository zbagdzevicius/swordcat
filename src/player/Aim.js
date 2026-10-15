// src/player/Aim.js  (owner: player) — research/CONTROLS_SPEC.md §7.1 the one aim resolver, the magnet cones, the soft
// auto-target and the Stand's threat snap. Pure (duck-typed {x, z} positions, no three.js, no ctx): unit-tested.
//
// resolveAim(kind, s, out) → out { dir: {x, z} (unit), point: {x, z}|null, target: actor|null, source }
//   precedence: 1 riposte (attack kinds) · 2 explicit (touch drag / pad RS past 0.35) · 3 cursor (KBM, moved in the
//   last 3 s) · 4 selected target (alive, within range + 1.5) · 5 soft auto-target (touch / pad / keyboard-only)
//   · 6 movement (stick / WASD past 0.3) · 7 facing.
import { AIM } from '../core/config.js';
import { scoreCandidate, lowEnough } from '../combat/targeting.js';
import { wrapAngle } from '../core/math.js';

export const ATTACK_KINDS = Object.freeze(new Set(['attack', 'charge', 'pounce']));

/**
 * @param {string} kind 'attack' | 'charge' | 'pounce' | 'dodge' | 'guard' | 'ability'
 * @param {{ her:{x:number,z:number}, facing:number, riposte?:any, explicit?:{x:number,z:number}|null,
 *   cursor?:{x:number,z:number}|null, selected?:any, range?:number, auto?:any, move?:{x:number,z:number,mag:number}|null }} s
 * @param {{dir:{x:number,z:number}, point:any, target:any, source:string}} out
 */
export function resolveAim(kind, s, out) {
  out.point = null; out.target = null;
  const her = s.her, range = s.range ?? 2;
  const set = (x, z, src) => {
    const l = Math.hypot(x, z);
    if (l > 1e-6) { out.dir.x = x / l; out.dir.z = z / l; } else { out.dir.x = Math.sin(s.facing); out.dir.z = Math.cos(s.facing); }
    out.source = src;
    return out;
  };
  const toActor = (a, src) => { out.target = a; return set(a.pos.x - her.x, a.pos.z - her.z, src); };
  if (ATTACK_KINDS.has(kind) && s.riposte?.pos) return toActor(s.riposte, 'riposte');
  if (s.explicit) return set(s.explicit.x, s.explicit.z, 'explicit');
  if (s.cursor) {
    const dx = s.cursor.x - her.x, dz = s.cursor.z - her.z;
    if (Math.hypot(dx, dz) > 0.15) { out.point = s.cursor; return set(dx, dz, 'cursor'); }
  }
  const sel = s.selected;
  if (sel?.pos && sel.alive !== false && Math.hypot(sel.pos.x - her.x, sel.pos.z - her.z) - (sel.radius ?? 0) <= range + 1.5) return toActor(sel, 'selected');
  if (s.auto?.pos) return toActor(s.auto, 'auto');
  if (s.move && s.move.mag > 0.3) return set(s.move.x, s.move.z, 'move');
  return set(Math.sin(s.facing), Math.cos(s.facing), 'facing');
}

/**
 * §7.2 soft auto-target: the lowest-score hostile within `range` (edge distance), with stickiness (keep `prev` unless
 * a challenger beats it by AIM.sticky). `refYaw` = stick direction, else facing. `info(a)` → { windup, recentHit,
 * breakable } flags. Breakables only when no hostile is within AIM.breakableClear m.
 * @returns {any|null}
 */
export function autoTarget(her, refYaw, cands, range, info, selected = null, prev = null, groundY = 0) {
  let best = null, bs = Infinity, prevScore = Infinity, hostileNear = false;
  for (const a of cands) {
    if (!a?.pos || a.alive === false || a.hidden || a.hurtable === false) continue;
    if (!a.breakable && Math.hypot(a.pos.x - her.x, a.pos.z - her.z) <= AIM.breakableClear) hostileNear = true;
  }
  for (const a of cands) {
    if (!a?.pos || a.alive === false || a.hidden || a.hurtable === false || a.dormant) continue;
    if (a.breakable && hostileNear) continue;
    if (!lowEnough(a, groundY)) continue;
    const d = Math.hypot(a.pos.x - her.x, a.pos.z - her.z) - (a.radius ?? 0);
    if (d > range) continue;
    const f = info ? info(a) : {};
    const sc = scoreCandidate({ pos: her }, a, refYaw, { windup: !!f.windup, selected: a === selected, recentHit: !!f.recentHit, breakable: !!a.breakable });
    if (a === prev) prevScore = sc;
    if (sc < bs) { bs = sc; best = a; }
  }
  if (prev && prevScore < Infinity && best !== prev && bs > prevScore - AIM.sticky) return prev;
  return best;
}

/**
 * Magnet (§7.1, first active frame): the best hostile inside a cone of half-angle `cone` around `dir` within
 * `range` (+ its radius); nearest by distance + angle. null when the cone is empty.
 */
export function magnetPick(her, dir, cands, cone, range) {
  const yaw = Math.atan2(dir.x, dir.z);
  let best = null, bs = Infinity;
  for (const a of cands) {
    if (!a?.pos || a.alive === false || a.hidden || a.hurtable === false || a.breakable) continue;
    const dx = a.pos.x - her.x, dz = a.pos.z - her.z;
    const d = Math.hypot(dx, dz) - (a.radius ?? 0);
    if (d > range) continue;
    const ang = d <= 0.05 ? 0 : Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw));
    if (ang > cone) continue;
    const sc = Math.max(0, d) + ang;
    if (sc < bs) { bs = sc; best = a; }
  }
  return best;
}

/**
 * §8.1 threat snap: among live parryable threats `{ attacker, activeAt }` the one within AIM.standSnapRange m that
 * lands within AIM.standSnapLead s (soonest, then nearest). Range is measured to `t.pos` when given (an incoming
 * bolt: the bolt itself, not its shooter 6–9 m away). Returns the attacker (or null); `out.at` gets the point to face.
 */
export function threatSnap(her, threats, now, out) {
  let best = null, bt = Infinity, bd = Infinity, bp = null;
  for (const t of threats) {
    const a = t?.attacker;
    if (!a?.pos || a.alive === false) continue;
    const dt = (t.activeAt ?? Infinity) - now;
    if (dt < -0.05 || dt > AIM.standSnapLead) continue;
    const p = t.pos ?? a.pos;
    const d = Math.hypot(p.x - her.x, p.z - her.z) - (p === a.pos ? (a.radius ?? 0) : 0);
    if (d > AIM.standSnapRange) continue;
    if (dt < bt - 1e-6 || (Math.abs(dt - bt) <= 1e-6 && d < bd)) { best = a; bt = dt; bd = d; bp = p; }
  }
  if (out) out.at = bp;
  return best;
}

/**
 * Assisted hop over a nav link (§5.4): horizontal speed so a jump with vertical speed `v0` under gravity `g`
 * (× `fallMul` while falling) lands `dh` m higher (negative: lower) `dist` m away. ≤ `maxH`; null when even `maxH`
 * cannot make it (the caller falls back to a plain jump).
 */
export function hopSpeed(dist, dh, v0, g, maxH, fallMul = 1) {
  const tUp = v0 / g, apex = (v0 * v0) / (2 * g);
  if (dh > apex - 0.05) return null;
  const fall = apex - dh;
  const tDown = Math.sqrt((2 * fall) / (g * fallMul));
  const T = tUp + tDown;
  const v = dist / T;
  return v <= maxH ? v : null;
}

/**
 * §5.4 jump assist (direct control): a take-off toward a raised walkable top (a stump, a mushroom cap, a ledge) within
 * `o.range` m gets its horizontal velocity nudged — at most `o.dv` m/s faster or slower and `o.ang` rad off the run
 * heading — so she lands at least `o.inset` m inside its near edge (and, on a small top, inside its far edge too).
 * Pure: `probe(x, z)` → { top, walkable }.
 * @param {{x:number, y:number, z:number}} her
 * @param {{x:number, z:number}} vel her horizontal velocity at take-off
 * @param {(x:number, z:number) => {top:number, walkable:boolean}} probe
 * @param {{range:number, dv:number, ang:number, inset:number, v0:number, g:number, fallMul?:number, minRise?:number, maxRise?:number, step?:number}} o
 * @returns {{vx:number, vz:number, dist:number, rise:number, yaw:number}|null} the new horizontal velocity, or null
 */
export function jumpAssistPlan(her, vel, probe, o) {
  const sp = Math.hypot(vel.x, vel.z);
  if (sp < 0.5) return null;                                       // straight up: nothing to aim at
  const yaw0 = Math.atan2(vel.x, vel.z);
  const minRise = o.minRise ?? 0.3, maxRise = o.maxRise ?? 1.4, step = o.step ?? 0.15;
  const apex = (o.v0 * o.v0) / (2 * o.g);
  let best = null, bestScore = Infinity;
  for (let k = 0; k <= 8; k++) {
    const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (o.ang / 4);
    const yaw = yaw0 + off, ux = Math.sin(yaw), uz = Math.cos(yaw);
    for (let s = 0.3; s <= o.range + 1e-6; s += step) {
      const a = probe(her.x + ux * s, her.z + uz * s);
      const rise = a.top - her.y;
      if (rise > maxRise + 0.05) break;                             // a wall along this ray
      if (rise < minRise) continue;
      // the near edge is at ~s: the landing zone runs from s + inset to the far edge − inset, on the same top
      const L = s + o.inset;
      const b = probe(her.x + ux * L, her.z + uz * L);
      if (!b.walkable || Math.abs(b.top - a.top) > 0.25 || b.top - her.y > apex - 0.1) break;
      let far = L;
      while (far < L + 4) {
        const c = probe(her.x + ux * (far + step), her.z + uz * (far + step));
        if (!c.walkable || Math.abs(c.top - b.top) > 0.25) break;
        far += step;
      }
      const score = Math.abs(off) * 2 + s * 0.1;
      if (score < bestScore) { bestScore = score; best = { yaw, near: L, far: Math.max(L, far - o.inset + step * 0.5), rise: b.top - her.y }; }
      break;
    }
  }
  if (!best) return null;
  // air time to the top's height, then the speed that lands inside [near, far], as close to her own speed as it gets
  const T = airTime(best.rise, o.v0, o.g, o.fallMul ?? 1);
  if (T == null) return null;
  const vLo = best.near / T, vHi = best.far / T;
  const v = Math.min(Math.max(sp, vLo), Math.max(vLo, vHi));
  if (Math.abs(v - sp) > o.dv + 1e-9) return null;                 // out of the nudge's reach: a plain jump
  return { vx: Math.sin(best.yaw) * v, vz: Math.cos(best.yaw) * v, dist: v * T, rise: best.rise, yaw: best.yaw };
}

/** Air time of a jump (vertical speed v0, gravity g, × fallMul falling) that lands `dh` m higher; null above the apex. */
export function airTime(dh, v0, g, fallMul = 1) {
  const apex = (v0 * v0) / (2 * g);
  if (dh > apex - 0.05) return null;
  return v0 / g + Math.sqrt((2 * (apex - dh)) / (g * fallMul));
}
