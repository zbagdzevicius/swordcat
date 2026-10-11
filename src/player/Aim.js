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
 * lands within AIM.standSnapLead s (soonest, then nearest). Returns the attacker (or null).
 */
export function threatSnap(her, threats, now) {
  let best = null, bt = Infinity, bd = Infinity;
  for (const t of threats) {
    const a = t?.attacker;
    if (!a?.pos || a.alive === false) continue;
    const dt = (t.activeAt ?? Infinity) - now;
    if (dt < -0.05 || dt > AIM.standSnapLead) continue;
    const d = Math.hypot(a.pos.x - her.x, a.pos.z - her.z) - (a.radius ?? 0);
    if (d > AIM.standSnapRange) continue;
    if (dt < bt - 1e-6 || (Math.abs(dt - bt) <= 1e-6 && d < bd)) { best = a; bt = dt; bd = d; }
  }
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
