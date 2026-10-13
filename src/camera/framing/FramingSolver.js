// src/camera/framing/FramingSolver.js  (owner: camera) — research/next/AUTOCAM_SPEC.md §6.3–§6.4: the combat / boss
// framing as a closed-form fit. Pure, node-tested, zero allocation (module scratch only).
//
// Conventions (three.js r186, the iso rig): fixed yaw ψ, pitch θ = pitch(d) down from the horizon; U = screen-up on the
// ground, R = screen-right on the ground; tanV = tan(fov/2), tanH = tanV · aspect. The anchor (where the focus F is
// drawn) in NDC: offX = 2·fx − 1, offY = 1 − 2·fy. The frame (NDC, y up): [xL, xR] × [yB, yT].
// A subject p (sphere radius ρ) relative to the focus: e = p − F;
//   xc = e·R;  yc = (e·U)·sinθ + e.y·cosθ;  a = (e·U)·cosθ − e.y·sinθ;  view depth z = d + a.
// Closed-form minimum lens distance per frame edge (the sphere's near side keeps the margin):
//   right : d ≥ ( xc + ρ) / ((xR − offX)·tanH) − a + ρ        left  : d ≥ (−xc + ρ) / ((offX − xL)·tanH) − a + ρ
//   top   : d ≥ ( yc + ρ) / ((yT − offY)·tanV) − a + ρ        bottom: d ≥ (−yc + ρ) / ((offY − yB)·tanV) − a + ρ
//
// Subject pool (Subjects.js): Float32Array stride 8 = [x, y, z, ρ, w, flags, class, ttl].
import { CAMERA } from '../../core/config.js';

export const STRIDE = 8;
export const SX = 0, SY = 1, SZ = 2, SR = 3, SW = 4, SF = 5, SC = 6, ST = 7;
/** flags */
export const F_HARD = 1, F_DROP = 2, F_TOKEN = 4, F_SOFT = 8;
/** F_FADE: not wanted this gather (fading out) — the drop ladder may drop it whatever its class */
export const F_FADE = 16;
/** subject classes (AUTOCAM D17; priority order) */
export const CLS = Object.freeze({ HER: 0, THREAT: 1, BOSS: 2, LANE: 3, SELECTED: 4, ENGAGED: 5, PRE: 6, BEAT: 7 });
export const CLS_NAMES = Object.freeze(['her', 'threat', 'boss', 'lane', 'selected', 'engaged', 'preAttend', 'beat']);

const FR = CAMERA.iso.framing;

/**
 * The per-solve view: everything needD needs besides the subjects. Build once (makeView) and refresh per solve.
 * @returns {{ Ux:number, Uz:number, Rx:number, Rz:number, tanV:number, tanH:number, offX:number, offY:number,
 *   xL:number, xR:number, yB:number, yT:number, pitchOf:(d:number)=>number }}
 */
export function makeView() {
  return { Ux: 0, Uz: 1, Rx: -1, Rz: 0, tanV: Math.tan((38 * Math.PI) / 360), tanH: 0, offX: 0, offY: 0,
    xL: -0.86, xR: 0.86, yB: -0.78, yT: 0.86, pitchOf: () => 0.9 };
}

/** Set the yaw-dependent ground axes of a view (U = (−sin ψ, 0, −cos ψ), R = (cos ψ, 0, −sin ψ)). */
export function setYaw(view, yaw) {
  view.Ux = -Math.sin(yaw); view.Uz = -Math.cos(yaw); view.Rx = Math.cos(yaw); view.Rz = -Math.sin(yaw);
  return view;
}

/**
 * Minimum lens distance (single pitch θ) so every counted subject fits the frame around focus F + lean.
 * Counted: hard subjects (`hardOnly`) or every non-dropped one with w > 0.
 * @param {Float32Array} pool @param {number} n @param {number} Fx @param {number} Fy @param {number} Fz
 * @param {number} leanR @param {number} leanU lean of the focus along R / U (m) @param {object} v view @param {number} theta
 * @param {boolean} [hardOnly]
 */
export function needDAt(pool, n, Fx, Fy, Fz, leanR, leanU, v, theta, hardOnly = false) {
  const s = Math.sin(theta), c = Math.cos(theta);
  const fx = Fx + leanR * v.Rx + leanU * v.Ux, fz = Fz + leanR * v.Rz + leanU * v.Uz;
  const kR = (v.xR - v.offX) * v.tanH, kL = (v.offX - v.xL) * v.tanH, kT = (v.yT - v.offY) * v.tanV, kB = (v.offY - v.yB) * v.tanV;
  let need = 0;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE, fl = pool[o + SF];
    if (fl & F_DROP || !(pool[o + SW] > 0)) continue;
    if (hardOnly && !(fl & F_HARD)) continue;
    const ex = pool[o + SX] - fx, ey = pool[o + SY] - Fy, ez = pool[o + SZ] - fz, r = pool[o + SR];
    const eu = ex * v.Ux + ez * v.Uz, xc = ex * v.Rx + ez * v.Rz;
    const yc = eu * s + ey * c, a = eu * c - ey * s;
    let d = 0;
    if (kR > 1e-6) d = Math.max(d, (xc + r) / kR - a + r);
    if (kL > 1e-6) d = Math.max(d, (-xc + r) / kL - a + r);
    if (kT > 1e-6) d = Math.max(d, (yc + r) / kT - a + r);
    if (kB > 1e-6) d = Math.max(d, (-yc + r) / kB - a + r);
    if (d > need) need = d;
  }
  return need;
}

/**
 * needD with the pitch following the distance (AUTOCAM §6.3 "two pitch passes"): θ = pitchOf(dBase), then
 * θ = pitchOf(d₁). Never below `dMin`.
 */
export function needD(pool, n, Fx, Fy, Fz, leanR, leanU, v, dBase, passes = FR.pitchPasses, hardOnly = false) {
  let d = dBase;
  for (let k = 0; k < Math.max(1, passes); k++) d = Math.max(dBase, needDAt(pool, n, Fx, Fy, Fz, leanR, leanU, v, v.pitchOf(d), hardOnly));
  return d;
}

/** Does every hard subject fit the vertical band (top and bottom edges only) at distance d, lean (leanR, 0)? */
export function verticalFits(pool, n, Fx, Fy, Fz, leanR, v, d) {
  const theta = v.pitchOf(d), s = Math.sin(theta), c = Math.cos(theta);
  const fx = Fx + leanR * v.Rx, fz = Fz + leanR * v.Rz;
  const kT = (v.yT - v.offY) * v.tanV, kB = (v.offY - v.yB) * v.tanV;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE, fl = pool[o + SF];
    if (fl & F_DROP || !(fl & F_HARD) || !(pool[o + SW] > 0)) continue;
    const ex = pool[o + SX] - fx, ey = pool[o + SY] - Fy, ez = pool[o + SZ] - fz, r = pool[o + SR];
    const eu = ex * v.Ux + ez * v.Uz, yc = eu * s + ey * c, a = eu * c - ey * s;
    if (kT > 1e-6 && (yc + r) / kT - a + r > d + 1e-6) return false;
    if (kB > 1e-6 && (-yc + r) / kB - a + r > d + 1e-6) return false;
  }
  return true;
}

/**
 * Normalised screen point (0..1, y down) of world (x, y, z) for focus F + lean at distance d → out {x, y, z (depth)}.
 * The iso rig projection with the anchor; exact for the pose the rig builds from (F + lean, yaw, pitchOf(d), d).
 */
export function projectAt(px, py, pz, Fx, Fy, Fz, leanR, leanU, v, d, out) {
  const theta = v.pitchOf(d), s = Math.sin(theta), c = Math.cos(theta);
  const ex = px - (Fx + leanR * v.Rx + leanU * v.Ux), ey = py - Fy, ez = pz - (Fz + leanR * v.Rz + leanU * v.Uz);
  const eu = ex * v.Ux + ez * v.Uz, xc = ex * v.Rx + ez * v.Rz, yc = eu * s + ey * c, z = d + eu * c - ey * s;
  const zz = Math.max(1e-3, z);
  out.x = (1 + v.offX + xc / (zz * v.tanH)) / 2;
  out.y = (1 - (v.offY + yc / (zz * v.tanV))) / 2;
  out.z = z;
  return out;
}

const _pp = { x: 0, y: 0, z: 0 };

/**
 * The full solve (AUTOCAM §6.3): horizontal lean (half the centre of the weight-scaled R-extent of the hard subjects),
 * vertical lean (10-step ternary search, only when a hard subject fails the vertical band at dBase), crowd term, caps,
 * the drop ladder (soft subjects, then the farthest tokenless ENGAGED; ≤ 3 re-solves) and hole repair.
 * @param {Float32Array} pool subject pool (index 0 = her) @param {number} n
 * @param {{x:number,y:number,z:number}} F her focus (feet + focusY)
 * @param {object} v view (makeView)
 * @param {{ dBase:number, cap:number, dMin?:number, capUp:number, capDown:number, limR:number, limL:number,
 *   limUp:number, limDown:number, nEngaged:number, crowd?:boolean, capMax?:number,
 *   visible?:(sx:number, sy:number)=>boolean, holeRepair?:boolean }} o
 *   limR / limL / limUp / limDown: the herFrame offset limits (m, ≥ 0) the lean may never pass
 *   capMax: the hard ceiling (cat clamp / range) — when given, the crowd term (D8) extends `cap` up to it (cap + ≤ 1.5 m)
 * @param {{ d:number, need:number, leanR:number, leanU:number, dropped:number, holes:number, capped:boolean, cap?:number }} out
 */
export function solveFrame(pool, n, F, v, o, out, cfg = FR) {
  const L = cfg.lean;
  // crowd term (D8) on top of the +3 m combat budget: the cap grows by it, up to the hard ceiling `capMax`
  const crowd = o.crowd !== false ? Math.min(cfg.crowd.max, cfg.crowd.per * Math.max(0, o.nEngaged - cfg.crowd.after)) : 0;
  const cap = o.capMax != null ? Math.max(o.cap, Math.min(o.capMax, o.cap + crowd)) : o.cap;
  let dropped = 0;
  for (let i = 0; i < n; i++) pool[i * STRIDE + SF] &= ~F_DROP;
  let leanR = 0, leanU = 0, need = o.dBase;
  for (let attempt = 0; attempt <= 3; attempt++) {
    leanR = horizontalLean(pool, n, F, v, L.bias, o.limR, o.limL);
    leanU = 0;
    if (!verticalFits(pool, n, F.x, F.y, F.z, leanR, v, o.dBase)) leanU = verticalLean(pool, n, F, v, leanR, o, L.kappa, cfg.ternarySteps);
    need = needD(pool, n, F.x, F.y, F.z, leanR, leanU, v, o.dBase, cfg.pitchPasses);
    if (need <= cap + 1e-6 || attempt === 3) break;
    if (!dropOne(pool, n, F)) break;
    dropped++;
  }
  let d = need;
  if (crowd > 0) d = Math.max(d, o.dBase + crowd);
  d = Math.max(o.dMin ?? o.dBase, Math.min(cap, d));
  // hole repair: a hard subject drawn under a HUD / thumb hole → +0.5 m (≤ 4 times, within the cap)
  let holes = 0;
  if (o.visible && o.holeRepair !== false) {
    const step = cfg.holeRepair[0], tries = cfg.holeRepair[1];
    for (let k = 0; k < tries; k++) {
      let hidden = false;
      for (let i = 1; i < n && !hidden; i++) {
        const q = i * STRIDE, fl = pool[q + SF];
        if (fl & F_DROP || !(fl & F_HARD)) continue;
        projectAt(pool[q + SX], pool[q + SY], pool[q + SZ], F.x, F.y, F.z, leanR, leanU, v, d, _pp);
        if (!o.visible(_pp.x, _pp.y)) hidden = true;
      }
      if (!hidden || d >= cap - 1e-6) break;
      d = Math.min(cap, d + step); holes++;
    }
  }
  out.d = d; out.need = need; out.leanR = leanR; out.leanU = leanU; out.dropped = dropped; out.holes = holes;
  out.capped = need > cap + 1e-6; out.cap = cap;
  return out;
}

/** leanR = bias × the centre of the weight-scaled R-extent of the hard subjects (her included), clamped. */
export function horizontalLean(pool, n, F, v, bias, limR, limL) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE, fl = pool[o + SF];
    if (fl & F_DROP || !(fl & F_HARD) || !(pool[o + SW] > 0)) continue;
    const w = Math.min(1, pool[o + SW]), r = pool[o + SR];
    const er = ((pool[o + SX] - F.x) * v.Rx + (pool[o + SZ] - F.z) * v.Rz) * (i === 0 ? 1 : w);
    if (er - r < lo) lo = er - r;
    if (er + r > hi) hi = er + r;
  }
  if (!(hi > lo)) return 0;
  const c = bias * (lo + hi) / 2;
  return Math.max(-limL, Math.min(limR, c));
}

/**
 * Ternary search over leanU ∈ [−capDown, capUp] ∩ the herFrame limits, minimising needD + κ·|leanU|. The bounds keep
 * the COMBINED lean |(leanR, leanU)| inside the D7 cap (capDown down-screen, max(capUp, capDown) up-screen).
 */
export function verticalLean(pool, n, F, v, leanR, o, kappa, steps) {
  const r2 = leanR * leanR, up = Math.max(o.capUp, o.capDown);
  let a = -Math.min(o.capDown, o.limDown, Math.sqrt(Math.max(0, o.capDown * o.capDown - r2)));
  let b = Math.min(o.capUp, o.limUp, Math.sqrt(Math.max(0, up * up - r2)));
  if (!(b > a)) return 0;
  for (let k = 0; k < steps; k++) {
    const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
    if (vCost(pool, n, F, v, leanR, m1, o.dBase, kappa) <= vCost(pool, n, F, v, leanR, m2, o.dBase, kappa)) b = m2; else a = m1;
  }
  const u = (a + b) / 2;
  return vCost(pool, n, F, v, leanR, u, o.dBase, kappa) <= vCost(pool, n, F, v, leanR, 0, o.dBase, kappa) ? u : 0;
}

/** The vertical-lean cost: needD (two pitch passes) + κ·|leanU|. */
function vCost(pool, n, F, v, leanR, u, dBase, kappa) {
  return needD(pool, n, F.x, F.y, F.z, leanR, u, v, dBase, 2) + kappa * Math.abs(u);
}

/**
 * Classes the ladder never drops once hard (AUTOCAM §6.3): HER, THREAT (a live wind-up on her), BOSS, BOSS_LANE and
 * SELECTED.
 * @param {number} c CLS.*
 */
export function undroppable(c) { return c <= CLS.SELECTED; }

/**
 * Drop ladder step (AUTOCAM §6.3), lowest priority first:
 *  1. a soft subject of a low class (fading-out subjects of any class first, then BEAT, pre-attend, soft ENGAGED);
 *  2. the ENGAGED subject farthest from her without a token;
 *  3. only then a THREAT / LANE / BOSS / SELECTED subject still easing in (not hard yet, ≤ ~0.2 s) — so a wind-up on her
 *     always outranks every ENGAGED foe, and a subject that is not hard yet (the lean ignores it) cannot force a
 *     distance-only zoom-out that the lean then takes back.
 * A hard THREAT / BOSS / LANE / SELECTED subject is never dropped; d clamps at the cap and ui arrows cover the rest.
 * @returns {boolean} whether a subject was dropped
 */
export function dropOne(pool, n, F) {
  let soft = -1, sk = -1, late = -1, lk = -1;
  for (let i = 1; i < n; i++) {
    const o = i * STRIDE, fl = pool[o + SF], c = pool[o + SC];
    if (fl & F_DROP || !(pool[o + SW] > 0) || fl & F_HARD) continue;
    if (undroppable(c) && !(fl & F_FADE)) { if (c > lk) { lk = c; late = i; } continue; }
    const k = fl & F_FADE ? 100 : c;                          // fading first, then the lowest priority class
    if (k > sk) { sk = k; soft = i; }
  }
  if (soft >= 0) { pool[soft * STRIDE + SF] |= F_DROP; return true; }
  let best = -1, bd = -1;
  for (let i = 1; i < n; i++) {
    const o = i * STRIDE, fl = pool[o + SF];
    if (fl & F_DROP || fl & F_TOKEN || pool[o + SC] !== CLS.ENGAGED) continue;
    const dx = pool[o + SX] - F.x, dz = pool[o + SZ] - F.z, d = dx * dx + dz * dz;
    if (d > bd) { bd = d; best = i; }
  }
  if (best < 0) best = late;
  if (best < 0) return false;
  pool[best * STRIDE + SF] |= F_DROP;
  return true;
}

/**
 * Goal hysteresis (AUTOCAM R5 / §6.4): keep the current goal when |Δd| < 0.35 m and |Δlean| < 0.30 m and every hard
 * subject is still inside the hysteresisFrame (92 %) frame. `forced` (a hard-subject add, a punch, a beat) never holds.
 */
export function holdGoal(cur, next, allInside, forced = false, cfg = FR) {
  if (forced || !allInside) return false;
  return Math.abs(next.d - cur.d) < cfg.hysteresis.d && Math.hypot(next.leanR - cur.leanR, next.leanU - cur.leanU) < cfg.hysteresis.lean;
}

/**
 * Are all hard subjects inside the frame scaled by `k` (NDC) at (d, lean)? Used by the hysteresis and the Dizzy punch.
 */
export function allHardInside(pool, n, F, v, d, leanR, leanU, k) {
  const xL = v.offX + (v.xL - v.offX) * k, xR = v.offX + (v.xR - v.offX) * k, yB = v.offY + (v.yB - v.offY) * k, yT = v.offY + (v.yT - v.offY) * k;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE, fl = pool[o + SF];
    if (fl & F_DROP || !(fl & F_HARD) || !(pool[o + SW] > 0)) continue;
    projectAt(pool[o + SX], pool[o + SY], pool[o + SZ], F.x, F.y, F.z, leanR, leanU, v, d, _pp);
    const nx = 2 * _pp.x - 1, ny = 1 - 2 * _pp.y;
    if (_pp.z <= 0 || nx < xL || nx > xR || ny < yB || ny > yT) return false;
  }
  return true;
}
