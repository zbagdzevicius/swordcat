// src/companions/activity.js  (owner: companions) — activity LOD for this area's actors (PERF_SPEC §4.2–§4.3, P:M1 / M2;
// AUTOCAM §9.5, X13): the camera's activity tier and the NPC-kitten distance bands inside tier 0, plus the 10 Hz think
// gate. Pure helpers + one per-frame frustum fallback; no per-frame allocation.
//
//   tier   0 in view (bounding sphere + 2 m in the frame's frustum) | 1 ≤ 30 m from the focus | 2 ≤ 60 m | 3 beyond.
//          `ctx.cam.activityOf(actor)` when camera provides it (one frustum per frame), else our own frustum built once
//          per rendered frame from `ctx.camera` (the same rule), else a distance-only fallback (classic: 0 ≤ 40 m, 3).
//   band   inside tier 0, from the camera focus: 'full' (≤ 8 m, or in dialogue / scripted: every frame, full look),
//          'half' (> 8 m: animate at 30 Hz staggered (id + frame) & 1, simulate 15 Hz, sheen only, no shells),
//          'slow' (tier 1: animate at 10 Hz staggered, no simulate, not drawn), 'off' (tier ≥ 2: frozen, not drawn).
import * as THREE from 'three';
import { every } from '../core/schedule.js';
import { lodOrigin } from './steering.js';

/** PERF §4.3 numbers (m, Hz). `margin` pads the bounding sphere for tier 0; `fallbackR` is classic mode's tier-0 radius. */
export const ACTIVITY = Object.freeze({
  margin: 2, nearR: 30, farR: 60, fallbackR: 40, bandFullR: 8,
  /** rendered-frame cadence per band: animate every n-th frame (0 = never), simulate every n-th animated frame */
  animEvery: Object.freeze({ full: 1, half: 2, slow: 6, off: 0 }),
  simEvery: Object.freeze({ full: 1, half: 2, slow: 0, off: 0 }),
  /** companion AI think rate (PERF §4.2: "Companion think 10 Hz | steering 60 Hz") */
  thinkHz: 10,
});

const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sphere = new THREE.Sphere(), _o = { x: 0, z: 0 };
let _fFrame = -1, _fCam = null, _fOk = false;

/** Our frustum for this rendered frame (built once per rendered frame count; false when there is no usable camera). */
function frameFrustum(ctx) {
  const cam = ctx?.camera, f = ctx?.game?.frameCount;
  if (!cam?.isCamera || !Number.isFinite(f)) return false;
  if (f === _fFrame && cam === _fCam) return _fOk;
  _fFrame = f; _fCam = cam;
  cam.updateMatrixWorld?.();
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _fOk = Number.isFinite(_pv.elements[0]);
  if (_fOk) _frustum.setFromProjectionMatrix(_pv);
  return _fOk;
}

/**
 * Activity tier of `actor` this frame (0 = drawn and lively ... 3 = asleep). Cached per rendered frame on the actor
 * (`_tier`, `_tierFrame`, the PERF §4.3 fields) so every caller in the frame agrees.
 * @param {any} ctx @param {{ pos: THREE.Vector3, height?: number, radius?: number, _tier?: number, _tierFrame?: number }} actor
 * @returns {0|1|2|3}
 */
export function activityTier(ctx, actor) {
  if (!actor?.pos) return 0;
  const cam = ctx?.cam;
  if (typeof cam?.activityOf === 'function') {
    const t = cam.activityOf(actor);
    if (t === 0 || t === 1 || t === 2 || t === 3) return t;
  }
  const frame = ctx?.game?.frameCount;
  if (Number.isFinite(frame) && actor._tierFrame === frame && Number.isFinite(actor._tier)) return actor._tier;
  const o = lodOrigin(ctx, _o);
  const d = Math.hypot(o.x - actor.pos.x, o.z - actor.pos.z);
  let t;
  if (cam?.isIso === false || ctx?.params?.cam === 'classic') t = d <= ACTIVITY.fallbackR ? 0 : 3;
  else if (frameFrustum(ctx)) {
    const h = actor.height ?? 1;
    _sphere.center.set(actor.pos.x, actor.pos.y + h * 0.5, actor.pos.z);
    _sphere.radius = Math.max(h * 0.5, actor.radius ?? 0.3) + ACTIVITY.margin;
    t = _frustum.intersectsSphere(_sphere) ? 0 : d <= ACTIVITY.nearR ? 1 : d <= ACTIVITY.farR ? 2 : 3;
  } else t = d <= ACTIVITY.fallbackR ? 0 : 3;
  if (Number.isFinite(frame)) { actor._tier = t; actor._tierFrame = frame; }
  return t;
}

/**
 * PERF §4.3 NPC band for an actor of tier `tier`. `close` forces 'full' (in dialogue, scripted, the active party).
 * @param {any} ctx @param {{ pos: THREE.Vector3 }} actor @param {number} tier @param {boolean} [close]
 * @returns {'full'|'half'|'slow'|'off'}
 */
export function npcBand(ctx, actor, tier, close = false) {
  if (tier >= 2) return close ? 'full' : 'off';
  if (tier === 1) return close ? 'full' : 'slow';
  if (close) return 'full';
  const o = lodOrigin(ctx, _o);
  return Math.hypot(o.x - actor.pos.x, o.z - actor.pos.z) <= ACTIVITY.bandFullR ? 'full' : 'half';
}

/**
 * Does `band` animate on rendered frame `frame` for actor `id`? (30 Hz staggered by `(id + frame) & 1` for 'half'; every
 * 6th frame staggered by id for 'slow'; never for 'off'.)
 */
export function bandAnimates(band, id, frame) {
  const n = ACTIVITY.animEvery[band] ?? 1;
  if (n <= 0) return false;
  if (n === 1 || !Number.isFinite(frame)) return true;
  return ((id | 0) + frame) % n === 0;
}

/**
 * The 10 Hz think gate (PERF §4.2): deterministic on the game step counter (phase = actor id) when the game counts steps,
 * else a per-actor timer (`state.thinkT`, tools and unit fakes without a step counter).
 * @param {{ stepCount?: number }} game @param {number} id @param {{ thinkT: number }} state @param {number} dt
 * @param {number} [hz]
 */
export function thinkDue(game, id, state, dt, hz = ACTIVITY.thinkHz) {
  if (Number.isFinite(game?.stepCount)) return every(game, hz, id | 0);
  state.thinkT -= dt;
  if (state.thinkT > 0) return false;
  state.thinkT += 1 / hz;
  if (state.thinkT <= 0) state.thinkT = 1 / hz;
  return true;
}
