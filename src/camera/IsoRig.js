// src/camera/IsoRig.js  (owner: camera) — the three-quarter top-down play camera maths (research/CONTROLS_SPEC.md §2.1,
// §2.4). Pure functions on plain numbers / {x, y, z} objects: node-safe, unit-tested, allocation-free. FollowCamera
// runs them for the gameplay modes (`follow` / `lock` / `boss`); `?cam=classic` keeps the old orbit.
//
// Conventions (tech.md §8): the camera sits at focus + (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch) · d and
// looks at the focus; screen-up on the ground = (−sin yaw, 0, −cos yaw); screen-right = (cos yaw, 0, −sin yaw).
// The default yaw π puts the camera south of her looking +Z (W walks +Z).
import { CAMERA } from '../core/config.js';
import { clamp, lerp } from '../core/math.js';

const ISO = CAMERA.iso;
const DEG = Math.PI / 180;

/** Pitch (rad, down from horizontal) for lens → focus distance `d` (§2.1: 9 m → 46°, 18 m → 58°). */
export function isoPitch(d, I = ISO) {
  return lerp(I.pitchNear, I.pitchFar, clamp((d - I.distMin) / (I.distMax - I.distMin), 0, 1));
}

/**
 * Cat-size clamp (§2.1): the largest distance at which a `catH` m cat is still `minPx` CSS px tall on a viewport
 * `hCss` CSS px high with vertical FOV `fovDeg`.
 */
export function catClampDist(fovDeg, hCss, minPx, catH = ISO.catH) {
  const t = Math.tan((fovDeg * DEG) / 2);
  if (!(t > 0) || !(hCss > 0) || !(minPx > 0)) return Infinity;
  return (catH * hCss) / (2 * t * minPx);
}

/** Her apparent height (m) seen from `pitch` rad above the horizon: feet → ear tips (CAMERA.iso.catHView) × cos(pitch). */
export function apparentH(pitch, I = ISO) { return (I.catHView ?? 1.03) * Math.cos(pitch); }

/** On-screen height (CSS px) of an `h` m object at distance `d` (vertical FOV `fovDeg`, viewport `hCss` px high). */
export function pxAt(h, d, fovDeg, hCss) {
  return (h * hCss) / (2 * Math.max(1e-3, d) * Math.tan((fovDeg * DEG) / 2));
}

/** Distance at which the ground width across the focus is `width` m (portrait width fit, §2.1). */
export function widthFitDist(fovDeg, aspect, width = ISO.portraitWidth) {
  const tanH = Math.tan((fovDeg * DEG) / 2) * Math.max(0.1, aspect);
  return width / (2 * tanH);
}

/**
 * Device class for the rig (§1): phone = touch and min(w, h) ≤ 500 CSS px; portrait = h > 1.05 w.
 * @param {number} w @param {number} h @param {string} device
 */
export function deviceClass(w, h, device) {
  const portrait = h > w * 1.05;
  const phone = device === 'touch' && Math.min(w, h) <= 500;
  return { portrait, phone };
}

/**
 * The resting rig for a viewport (§2.1): FOV, base distance (desktop 13 / phone 12 / portrait width fit) × zoom,
 * clamped to [distMin, distMax] and to the cat-size clamp; pitch from the distance (portrait: fixed 58°).
 * @param {{w:number, h:number, device?:string, zoom?:number, boss?:boolean, extra?:number}} v
 *   extra: metres added after the zoom (combat zoom-out, boss fit) but still under the clamps
 * @param {object} [out]
 */
export function isoFrame(v, out = {}, I = ISO) {
  const { portrait, phone } = deviceClass(v.w, v.h, v.device);
  const fov = portrait ? I.fovPortrait : I.fov;
  const aspect = v.w / Math.max(1, v.h);
  let base = phone ? I.distPhone : I.dist;
  if (portrait) base = Math.max(base, widthFitDist(fov, aspect, I.portraitWidth));
  const zoom = clamp(v.zoom ?? 1, I.zoom[0], I.zoom[1]);
  // zoom first, clamped to [9, 18] (a portrait width fit may sit above 18), then the combat / boss extra on top
  let d = base * zoom;
  d = portrait ? Math.max(I.distMin, d) : clamp(d, I.distMin, I.distMax);
  const extra = Math.max(0, v.extra ?? 0);
  if (extra > 0) d = Math.min(d + extra, Math.max(d, v.boss ? I.boss.dist[1] : I.distMax + I.combat.zoomOut));
  if (v.boss) d = clamp(d, I.boss.dist[0], I.boss.dist[1]);
  const minPx = portrait ? I.minCatPxPortrait : v.boss ? I.minCatPxBoss : I.minCatPx;
  // the cat-size clamp on her APPARENT height from above (feet → ear tips × cos pitch: she is foreshortened as the
  // camera tilts down); the pitch depends on the distance, so two passes settle it
  let dMax = Infinity;
  for (let k = 0; k < 3; k++) {
    const pitch = portrait ? I.pitchPortrait : v.boss ? I.pitchBoss : isoPitch(Math.min(d, dMax), I);
    dMax = catClampDist(fov, v.h, minPx, apparentH(pitch, I));
  }
  d = Math.max(Math.min(d, dMax), Math.min(I.distMin, dMax));
  out.fov = fov; out.dist = d; out.dMax = dMax; out.portrait = portrait; out.phone = phone; out.aspect = aspect;
  out.pitch = portrait ? I.pitchPortrait : v.boss ? I.pitchBoss : isoPitch(d, I);
  out.frameOffset = portrait ? I.frameOffsetPortrait : I.frameOffset;
  return out;
}

/** Camera position for a focus / yaw / pitch / distance (writes `out` {x, y, z}). */
export function isoPosition(focus, yaw, pitch, d, out) {
  const cp = Math.cos(pitch);
  out.x = focus.x + Math.sin(yaw) * cp * d;
  out.y = focus.y + Math.sin(pitch) * d;
  out.z = focus.z + Math.cos(yaw) * cp * d;
  return out;
}

/** Screen-up direction on the ground for a camera yaw → `out` {x, z}. */
export function screenUp(yaw, out) { out.x = -Math.sin(yaw); out.z = -Math.cos(yaw); return out; }
/** Screen-right direction on the ground for a camera yaw → `out` {x, z}. */
export function screenRight(yaw, out) { out.x = Math.cos(yaw); out.z = -Math.sin(yaw); return out; }

/**
 * World direction (x, z) of a screen-space vector (sx right, sy up) under camera yaw `yaw` (stick / drag mapping).
 * Returns the unnormalised world vector in `out`.
 */
export function screenToWorldDir(sx, sy, yaw, out) {
  out.x = -Math.sin(yaw) * sy + Math.cos(yaw) * sx;
  out.z = -Math.cos(yaw) * sy - Math.sin(yaw) * sx;
  return out;
}

/** Clamp the length of (x, z) to `max` (in place on `v`). */
export function capXZ(v, max) {
  const l = Math.hypot(v.x, v.z);
  if (l > max && l > 1e-9) { v.x *= max / l; v.z *= max / l; }
  return v;
}

/**
 * Follow lead (§2.1): velocity × lead.vel (≤ velMax) + cursor × lead.cursor of (cursor − her) (≤ cursorMax), total
 * ≤ lead.max, plus the screen-up bias (landscape only). Writes the target lead into `out` {x, z}.
 * @param {{x:number,z:number}} vel her horizontal velocity @param {{x:number,z:number}|null} cursorRel cursor ground − her
 * @param {number} yaw @param {{portrait?:boolean, still?:boolean}} o  still = Stand / charge held (no lead)
 */
export function isoLead(vel, cursorRel, yaw, o, out, I = ISO) {
  const L = I.lead;
  out.x = 0; out.z = 0;
  if (o.still) return out;
  let vx = vel.x * L.vel, vz = vel.z * L.vel;
  const vl = Math.hypot(vx, vz);
  if (vl > L.velMax) { vx *= L.velMax / vl; vz *= L.velMax / vl; }
  out.x += vx; out.z += vz;
  if (cursorRel && !o.portrait) {
    let cx = cursorRel.x * L.cursor, cz = cursorRel.z * L.cursor;
    const cl = Math.hypot(cx, cz);
    if (cl > L.cursorMax) { cx *= L.cursorMax / cl; cz *= L.cursorMax / cl; }
    out.x += cx; out.z += cz;
  }
  capXZ(out, L.max);
  if (!o.portrait) { out.x += -Math.sin(yaw) * L.up; out.z += -Math.cos(yaw) * L.up; }
  return out;
}

/**
 * Distance needed so every point of `pts` (ground {x, z}) sits inside the inner `inner` fraction of the frame around
 * `focus` (§2.4 combat auto zoom-out / boss fit). Screen axes from the yaw; the vertical extent is foreshortened by
 * sin(pitch). `margin` m is added around each point.
 */
export function fitDist(pts, n, focus, yaw, pitch, fovDeg, aspect, inner, margin) {
  const tanV = Math.tan((fovDeg * DEG) / 2), tanH = tanV * aspect, sp = Math.max(0.2, Math.sin(pitch));
  const rx = Math.cos(yaw), rz = -Math.sin(yaw), ux = -Math.sin(yaw), uz = -Math.cos(yaw);
  let need = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], dx = p.x - focus.x, dz = p.z - focus.z;
    const sx = Math.abs(dx * rx + dz * rz) + margin, sy = Math.abs(dx * ux + dz * uz) + margin;
    need = Math.max(need, sx / (inner * tanH), (sy * sp) / (inner * tanV));
  }
  return need;
}

/** Spherical (around `pivot`) "crane arc" between two camera positions: k 0 → a, 1 → b. Writes `out`. */
export function craneArc(a, b, pivot, k, out) {
  const ax = a.x - pivot.x, ay = a.y - pivot.y, az = a.z - pivot.z, bx = b.x - pivot.x, by = b.y - pivot.y, bz = b.z - pivot.z;
  const ra = Math.hypot(ax, ay, az), rb = Math.hypot(bx, by, bz);
  if (ra < 1e-3 || rb < 1e-3) { out.x = lerp(a.x, b.x, k); out.y = lerp(a.y, b.y, k); out.z = lerp(a.z, b.z, k); return out; }
  const ea = Math.asin(clamp(ay / ra, -1, 1)), eb = Math.asin(clamp(by / rb, -1, 1));
  const ya = Math.atan2(ax, az), yb = Math.atan2(bx, bz);
  let dy = yb - ya; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const r = lerp(ra, rb, k), e = lerp(ea, eb, k), y = ya + dy * k, ce = Math.cos(e);
  out.x = pivot.x + Math.sin(y) * ce * r; out.y = pivot.y + Math.sin(e) * r; out.z = pivot.z + Math.cos(y) * ce * r;
  return out;
}

export { ISO };
