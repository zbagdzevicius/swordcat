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

/**
 * Landscape framing (camera-owned; supersedes CAMERA.iso.frameOffset 0.04 and lead.up 0.8, see requests/core.md).
 * Playtest: with her 4 % low plus a 0.8 m screen-up bias she stood at 66 % of a 720p frame and the ability bar hid
 * most of the 2.5 m of ground below her, so down-screen click-moves were short and blind. Now her focus sits at `herY`
 * of the band ABOVE the bottom safe inset (the desktop / pad ability bar), her feet ≈ 45 % from the top on 720p,
 * leaving ≈ 4 m of clickable ground below her above the bar (≈ 5 m to the screen edge) and ≈ 6 m ahead.
 *   herY: focus height within the usable band (0 top, 1 the inset's top edge)
 *   insetMax: the inset never takes more than this fraction of the height
 *   upBias: landscape screen-up lead (m); 0 = symmetric
 *   cursorDownMul: the KBM cursor lead's down-screen part is scaled up by this, because the foreshortened ground
 *     below her is shorter (≈ 4–5 m to the edge vs ≈ 6–7 m ahead): pointing at the bottom edge leads about as far as
 *     pointing at the top edge
 */
export const FRAME = { herY: 0.48, insetMax: 0.25, upBias: 0, cursorDownMul: 1.5 };

/**
 * Vertical frame offset (fraction of the view height; + = she sits below centre) for setViewOffset.
 * Landscape: her focus at FRAME.herY of the band above the bottom safe inset; portrait: CAMERA.iso.frameOffsetPortrait.
 * @param {number} vh view height (CSS px) @param {number} insetBottom bottom safe inset (CSS px) @param {boolean} portrait
 */
export function isoFrameOffset(vh, insetBottom, portrait, I = ISO, F = FRAME) {
  if (portrait) return I.frameOffsetPortrait;
  if (!(vh > 0)) return 0;
  const inset = clamp(Number.isFinite(insetBottom) ? insetBottom : 0, 0, F.insetMax * vh);
  return (F.herY * (vh - inset) - vh / 2) / vh;
}

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
 * @param {{w:number, h:number, device?:string, zoom?:number, boss?:boolean, extra?:number, hintDist?:number,
 *   hintDistW?:number, hintPitch?:number, hintPitchW?:number, insetBottom?:number}} v
 *   insetBottom: CSS px of the view's bottom covered by the ability bar (framing only, see isoFrameOffset)
 *   extra: metres added after the zoom (combat zoom-out, boss fit) but still under the clamps;
 *   hintDist / hintPitch: a §2.2 zone hint (base distance before the zoom; pitch in rad) blended in by its weight
 * @param {object} [out]
 */
export function isoFrame(v, out = {}, I = ISO) {
  const { portrait, phone } = deviceClass(v.w, v.h, v.device);
  const fov = portrait ? I.fovPortrait : I.fov;
  const aspect = v.w / Math.max(1, v.h);
  let base = phone ? I.distPhone : I.dist;
  // §2.2 zone hint distance (authored for the 13 m desktop baseline; phones scale it), blended in by hintDistW
  const hdW = Number.isFinite(v.hintDist) ? clamp(v.hintDistW ?? 1, 0, 1) : 0;
  if (hdW > 0) base += (v.hintDist * (phone ? I.distPhone / I.dist : 1) - base) * hdW;
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
  // §2.2 zone hint pitch (landscape, not in boss fights), blended over the distance curve by hintPitchW
  const hpW = !portrait && !v.boss && Number.isFinite(v.hintPitch) ? clamp(v.hintPitchW ?? 1, 0, 1) : 0;
  const pitchAt = (dd) => (portrait ? I.pitchPortrait : v.boss ? I.pitchBoss : hpW > 0 ? isoPitch(dd, I) + (v.hintPitch - isoPitch(dd, I)) * hpW : isoPitch(dd, I));
  let dMax = Infinity;
  for (let k = 0; k < 3; k++) {
    const pitch = pitchAt(Math.min(d, dMax));
    dMax = catClampDist(fov, v.h, minPx, apparentH(pitch, I));
  }
  d = Math.max(Math.min(d, dMax), Math.min(I.distMin, dMax));
  out.fov = fov; out.dist = d; out.dMax = dMax; out.portrait = portrait; out.phone = phone; out.aspect = aspect;
  out.pitch = pitchAt(d);
  out.frameOffset = isoFrameOffset(v.h, v.insetBottom ?? 0, portrait, I);
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
 * ≤ lead.max, plus the FRAME.upBias screen-up bias (landscape only; 0 now). The cursor's down-screen part is scaled
 * by FRAME.cursorDownMul (the ground below her is foreshortened) so the lead is symmetric in screen terms.
 * Writes the target lead into `out` {x, z}.
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
    // down-screen part (negative along screen-up) scaled up: symmetric reach on screen
    const ux = -Math.sin(yaw), uz = -Math.cos(yaw), u = cx * ux + cz * uz;
    if (u < 0) { const k = (FRAME.cursorDownMul - 1) * u; cx += ux * k; cz += uz * k; }
    const cl = Math.hypot(cx, cz);
    if (cl > L.cursorMax) { cx *= L.cursorMax / cl; cz *= L.cursorMax / cl; }
    out.x += cx; out.z += cz;
  }
  capXZ(out, L.max);
  if (!o.portrait && FRAME.upBias) { out.x += -Math.sin(yaw) * FRAME.upBias; out.z += -Math.cos(yaw) * FRAME.upBias; }
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

/**
 * Exact perspective projection of a world point under the iso rig (focus / yaw / pitch / d, vertical FOV, a W × H CSS
 * px viewport, the setViewOffset shift: the focus lands `offX` px left of and `offY` px below the centre). Writes
 * `out` {x, y} (CSS px from the top left) and `out.z` (depth along the view axis, m; ≤ 0 = behind the lens).
 */
export function isoProject(px, py, pz, focus, yaw, pitch, d, fovDeg, W, H, offX, offY, out) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  // lens → point; forward = −(sy·cp, sp, cy·cp), right = (cy, 0, −sy), up = (−sy·sp, cp, −cy·sp)
  const vx = px - (focus.x + sy * cp * d), vy = py - (focus.y + sp * d), vz = pz - (focus.z + cy * cp * d);
  const z = -(vx * sy * cp + vy * sp + vz * cy * cp);
  const x = vx * cy - vz * sy, y = -vx * sy * sp + vy * cp - vz * cy * sp;
  const tanV = Math.tan((fovDeg * DEG) / 2), tanH = tanV * (W / Math.max(1, H)), zz = Math.max(1e-3, z);
  out.x = W * 0.5 * (1 + x / (zz * tanH)) - offX;
  out.y = H * 0.5 * (1 - y / (zz * tanV)) + offY;
  out.z = z;
  return out;
}

const _pp = { x: 0, y: 0, z: 0 };
/**
 * Worst overflow (px, ≥ 0 = outside) of a subject out of its inner rect, and the screen push that would bring it in.
 * The subject is a ground disc (x, z, radius m) from y0 up to y1 (feet → head); the inner rect is `inner` of the safe
 * rect `S` {l, t, r, b} (CSS px), around its centre. Writes out.over (max px outside), out.dx / out.dy (signed px
 * the subject would have to move on screen to sit inside; + right / + down).
 */
export function subjectOverflow(s, focus, yaw, pitch, d, fovDeg, W, H, offX, offY, S, inner, out) {
  const hw = (S.r - S.l) * inner * 0.5, hh = (S.b - S.t) * inner * 0.5, cx = (S.l + S.r) * 0.5, cyc = (S.t + S.b) * 0.5;
  const L = cx - hw, R = cx + hw, T = cyc - hh, B = cyc + hh;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw), ux = -Math.sin(yaw), uz = -Math.cos(yaw), m = s.r ?? 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, behind = false;
  for (let k = 0; k < 6; k++) {
    // feet ring ±right / ±up and the head; k 4 = the feet centre, 5 = the head
    const ox = k === 0 ? rx * m : k === 1 ? -rx * m : k === 2 ? ux * m : k === 3 ? -ux * m : 0;
    const oz = k === 0 ? rz * m : k === 1 ? -rz * m : k === 2 ? uz * m : k === 3 ? -uz * m : 0;
    isoProject(s.x + ox, k === 5 ? s.y1 : s.y0, s.z + oz, focus, yaw, pitch, d, fovDeg, W, H, offX, offY, _pp);
    if (_pp.z <= 0.05) behind = true;
    if (_pp.x < minX) minX = _pp.x; if (_pp.x > maxX) maxX = _pp.x;
    if (_pp.y < minY) minY = _pp.y; if (_pp.y > maxY) maxY = _pp.y;
  }
  // a subject bigger than the rect is centred on it (no push can fit it; the distance has to)
  const dx = maxX - minX > R - L ? cx - (minX + maxX) * 0.5 : minX < L ? L - minX : maxX > R ? R - maxX : 0;
  const dy = maxY - minY > B - T ? cyc - (minY + maxY) * 0.5 : minY < T ? T - minY : maxY > B ? B - maxY : 0;
  out.dx = dx; out.dy = dy;
  out.over = behind ? Infinity : Math.max(L - minX, maxX - R, T - minY, maxY - B, 0);
  return out;
}

const _so = { over: 0, dx: 0, dy: 0 };
/**
 * Smallest lens distance in [dLo, dHi] at which every subject sits inside its inner share of the safe rect (exact
 * perspective; §2.4 boss fit: the boss in `bossInner`, her in `herInner`; the combat fit). Returns dHi + 1 when even
 * dHi fails. `pitchOf(d)` (optional): the pitch at lens distance d when it follows the distance (the combat zoom-out).
 * @param {Array<{x:number,z:number,y0:number,y1:number,r:number,inner:number}>} subs
 */
export function safeFitDist(subs, n, focus, yaw, pitch, fovDeg, W, H, offX, offY, S, dLo, dHi, pitchOf = null) {
  const fits = (d) => {
    const pt = pitchOf ? pitchOf(d) : pitch;
    for (let i = 0; i < n; i++) if (subjectOverflow(subs[i], focus, yaw, pt, d, fovDeg, W, H, offX, offY, S, subs[i].inner, _so).over > 0.5) return false;
    return true;
  };
  if (fits(dLo)) return dLo;
  if (!fits(dHi)) return dHi + 1;
  let lo = dLo, hi = dHi;
  for (let i = 0; i < 14 && hi - lo > 0.02; i++) { const mid = (lo + hi) * 0.5; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
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
