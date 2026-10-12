// src/enemies/onscreen.js  (owner: enemies) — CONTROLS_SPEC §8.5 "no off-screen snipes".
//   A ranged wind-up (a projectile attack, a `ranged` token) may start only while the shooter is inside the camera
//   frustum shrunk by AIM.onScreenMargin (0.5 m) OR within AIM.rangedNear (9 m) of her. Crows (`onScreenOnly`) dive
//   only on screen (no near exemption). Bosses are framed by the boss fit and are exempt.
// Uses `ctx.cam.onScreen(p, margin)` when camera ships it (§12 camera API); until then (and in classic) it tests the
// live THREE camera's frustum itself. No camera at all (node tests, headless) = allowed.
import * as THREE from 'three';
import * as CONFIG from '../core/config.js';

/** §13 AIM fallbacks until core lands the table (values binding). */
export const ONSCREEN_FALLBACK = Object.freeze({ onScreenMargin: 0.5, rangedNear: 9 });
const aim = () => CONFIG.AIM ?? ONSCREEN_FALLBACK;

const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
let _cacheCam = null, _cacheKey = -1;

/**
 * True when world point `p` lies inside `frustum` shrunk by `margin` metres (every plane distance ≥ margin).
 * Pure; exported for tests.
 * @param {THREE.Frustum} frustum @param {{x:number,y:number,z:number}} p @param {number} [margin]
 */
export function insideFrustum(frustum, p, margin = 0) {
  _p.set(p.x, p.y, p.z);
  for (const pl of frustum.planes) if (pl.distanceToPoint(_p) < margin) return false;
  return true;
}

/**
 * The camera's frustum: the rig's own once-per-frame `cam.frustum` when it ships one (AUTOCAM §9.6: one frustum per
 * frame, reused by everyone), else ours, rebuilt at most once per sim step / rendered frame.
 */
function frustumOf(ctx, cam) {
  const shared = ctx?.cam?.frustum;
  if (shared?.planes?.length === 6 && ctx.cam.frameId !== undefined) return shared;
  const key = (ctx.game?.stepCount ?? 0) * 4096 + ((ctx.game?.frameCount ?? 0) & 4095);
  if (cam !== _cacheCam || key !== _cacheKey) {
    cam.updateMatrixWorld?.();
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    _cacheCam = cam; _cacheKey = key;
  }
  return _frustum;
}

/**
 * Is `p` on screen (frustum shrunk by `margin`)? ctx.cam.onScreen when present, else the THREE camera; null = unknown
 * (no camera: callers treat it as on screen).
 * @returns {boolean|null}
 */
export function pointOnScreen(ctx, p, margin = aim().onScreenMargin) {
  const rig = ctx?.cam;
  if (typeof rig?.onScreen === 'function') {
    try { const r = rig.onScreen(p, margin); if (typeof r === 'boolean') return r; } catch { /* fall through */ }
  }
  const cam = ctx?.camera;
  // before the first rendered frame (boot, node tests) the camera has no meaningful pose: unknown
  if (!cam?.projectionMatrix || !cam.matrixWorld || !(ctx.game?.frameCount > 0)) return null;
  return insideFrustum(frustumOf(ctx, cam), p, margin);
}

/** Aim point used for the test: the chest of the actor (a shooter on a wall reads by its body, not its feet). */
const _c = new THREE.Vector3();
function chest(e) { return _c.set(e.pos.x, e.pos.y + (e.height ?? 1) * 0.5, e.pos.z); }

/**
 * May enemy `e` start the wind-up of attack choice `atk` ({ def, kind })? Melee is always allowed; ranged needs the
 * on-screen-or-near rule; `e.def.onScreenOnly` (crows) needs on screen. Bosses / their adds in a boss arena are exempt.
 * @returns {boolean}
 */
export function rangedStartAllowed(e, atk) {
  if (!atk || e.def?.boss || e.isBoss) return true;
  const ranged = !!atk.def?.projectile || atk.kind === 'ranged';
  const strict = !!e.def?.onScreenOnly;
  if (!ranged && !strict) return true;
  const A = aim();
  if (!strict && e.distToPlayer() <= A.rangedNear) return true;
  const on = pointOnScreen(e.ctx, chest(e), A.onScreenMargin);
  return on !== false;
}
