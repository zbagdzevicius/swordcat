// src/world/StaticShadow.js  (owner: world) — the sun shadow box (X7, X20; AUTOCAM_SPEC §9.2, PERF_SPEC §7.1 / §7.3).
// Camera publishes `cam.footprint` (or nothing yet); world owns the light and its box:
//   footprintCorners(fp, camera, groundY, out)  the 4 ground corners of what the iso lens sees (from `fp.corners` /
//                                               `fp.q` when camera publishes them, else the camera frustum ∩ ground)
//   fitShadowBox(corners, r, u, casterH, pad)  light-space bounds of the corners + the same raised by casterH (+ pad)
//   stepShadowFit(fit, hx, hy, shrinkM, shrinkT, dt)  grow at once, shrink only when ≥ shrinkM smaller for shrinkT s
//   StaticShadow                               stage 2: a cached statics-only map (`shadowMap.autoUpdate = false`),
//                                               box = fit + 8 m margin snapped to 8 m; re-rendered only when the live
//                                               fit leaves it, its size class changes, the sun tweens (every 4th
//                                               frame) or `invalidate()` (caster visibility / quality / level change)
// Stage 2 renders STATIC casters only: the map pass sees just the meshes tagged on STATIC_CASTER_LAYER (the level's
// casting meshes outside its actors group, re-tagged on every invalidate), whatever any actor's castShadow says, so a
// moving actor can never leave a stale shadow in the cache. Actors are grounded by fx contact blobs (K5).
import * as THREE from 'three';
import { CAMERA } from '../core/config.js';

/** 1 = dynamic footprint-fitted map (S3); 2 = cached statics-only map (S5: fx blobs + the static-caster layer). */
export const SHADOW_STAGE = 2;

/** Object layer the stage 2 map pass renders (main and raycast cameras never enable it: no effect elsewhere). */
export const STATIC_CASTER_LAYER = 7;

/**
 * Tag every casting, non-skinned mesh under `root` (skipping the `skip` subtree, e.g. the level's actors group, and
 * anything marked `userData.dynamicShadow`) with `layer`, so the stage 2 pass draws it. Idempotent; returns the count.
 * @param {THREE.Object3D|null} root @param {THREE.Object3D|null} [skip] @param {number} [layer]
 */
export function tagStaticCasters(root, skip = null, layer = STATIC_CASTER_LAYER) {
  if (!root) return 0;
  let n = 0;
  const stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (o === skip || o.userData?.dynamicShadow) continue;
    if (o.isMesh && o.castShadow && !o.isSkinnedMesh) { o.layers.enable(layer); n++; }
    for (let i = 0; i < o.children.length; i++) stack.push(o.children[i]);
  }
  return n;
}

/** Farthest a top-of-screen ray may reach on the ground (m) when it grazes the horizon. */
export const FOOT_MAX_REACH = 60;

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const NDC = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * The 4 ground corners of the view (bottom-left, bottom-right, top-right, top-left) into `out` (4 Vector3s).
 * `fp.corners` / `fp.q` (4 points {x, z} or [x, z]) win when camera publishes them; else the perspective camera's
 * corner rays meet the plane y = `groundY` (rays that miss or graze reach at most FOOT_MAX_REACH m). Null when
 * neither is available.
 * @param {any} fp camera footprint (optional) @param {THREE.Camera|null} camera @param {number} groundY
 * @param {THREE.Vector3[]} out
 * @returns {THREE.Vector3[]|null}
 */
export function footprintCorners(fp, camera, groundY, out) {
  const q = fp?.corners ?? fp?.q;
  if (Array.isArray(q) && q.length >= 4) {
    for (let i = 0; i < 4; i++) {
      const c = q[i];
      const x = Array.isArray(c) ? c[0] : c?.x, z = Array.isArray(c) ? c[1] : c?.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      out[i].set(x, Number.isFinite(c?.y) ? c.y : groundY, z);
    }
    return out;
  }
  if (!camera?.isPerspectiveCamera) return null;
  for (let i = 0; i < 4; i++) {
    _a.set(NDC[i][0], NDC[i][1], -1).unproject(camera);
    _b.set(NDC[i][0], NDC[i][1], 1).unproject(camera).sub(_a).normalize();
    let t;
    if (_b.y < -1e-4) t = (groundY - _a.y) / _b.y;
    else t = Infinity;
    const hx = _b.x, hz = _b.z, hl = Math.hypot(hx, hz) || 1;
    // clamp the horizontal reach (a ray toward the horizon would otherwise land kilometres away)
    if (!(t > 0) || !Number.isFinite(t) || t * hl > FOOT_MAX_REACH) {
      const s = FOOT_MAX_REACH / hl;
      out[i].set(_a.x + hx * s, groundY, _a.z + hz * s);
    } else out[i].set(_a.x + _b.x * t, groundY, _a.z + _b.z * t);
  }
  return out;
}

/**
 * Light-space bounds of the footprint corners and the same corners raised by `casterH` (tall trees and towers cast
 * into view), grown by `pad`. `r`, `u` = the light camera's right / up axes (world). Pure.
 * @returns {{halfX:number, halfY:number, cx:number, cy:number}}
 */
export function fitShadowBox(corners, r, u, casterH = 6, pad = 1.5, out = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of corners) {
    for (let k = 0; k < 2; k++) {
      const h = k ? casterH : 0;
      const a = c.x * r.x + (c.y + h) * r.y + c.z * r.z, b = c.x * u.x + (c.y + h) * u.y + c.z * u.z;
      if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b;
    }
  }
  out.halfX = (x1 - x0) / 2 + pad; out.halfY = (y1 - y0) / 2 + pad;
  out.cx = (x0 + x1) / 2; out.cy = (y0 + y1) / 2;
  return out;
}

/**
 * Hysteresis on the box size: grow at once; shrink only after it has been ≥ `shrinkM` m smaller for `shrinkT` s.
 * Mutates `fit` ({ halfX, halfY, shrinkT, ok }). Pure apart from that.
 */
export function stepShadowFit(fit, hx, hy, shrinkM = 2, shrinkT = 1, dt = 1 / 60) {
  if (!fit.ok) { fit.halfX = hx; fit.halfY = hy; fit.shrinkT = 0; fit.ok = true; return fit; }
  if (hx > fit.halfX || hy > fit.halfY) {
    fit.halfX = Math.max(fit.halfX, hx); fit.halfY = Math.max(fit.halfY, hy); fit.shrinkT = 0;
  } else if (fit.halfX - hx >= shrinkM || fit.halfY - hy >= shrinkM) {
    fit.shrinkT += dt;
    if (fit.shrinkT >= shrinkT) { fit.halfX = hx; fit.halfY = hy; fit.shrinkT = 0; }
  } else fit.shrinkT = 0;
  return fit;
}

/**
 * Stage 2 cached box (PERF §7.3): the live fit + `margin` per side, centre snapped to a `snap` m light-space grid.
 * Pure: returns whether the cached `box` must be re-rendered for the live `fit`, and updates `box` when it must.
 * @param {{cx:number, cy:number, halfX:number, halfY:number}} fit
 * @param {{cx?:number, cy?:number, hx?:number, hy?:number, cls?:number}} box
 */
export function cacheBox(fit, box, margin = 8, snap = 8) {
  const cls = Math.ceil(Math.max(fit.halfX, fit.halfY) / snap);
  const inside = box.hx != null && Math.abs(fit.cx - box.cx) + fit.halfX <= box.hx && Math.abs(fit.cy - box.cy) + fit.halfY <= box.hy;
  if (inside && cls === box.cls) return false;
  box.hx = fit.halfX + margin; box.hy = fit.halfY + margin;
  box.cx = Math.round(fit.cx / snap) * snap; box.cy = Math.round(fit.cy / snap) * snap;
  box.cls = cls;
  return true;
}

export class StaticShadow {
  /** @param {import('./Env.js').Env} env */
  constructor(env) {
    this.env = env;
    this.box = {};
    this.dirty = true;
    /** re-renders so far (perf probes) */
    this.renders = 0;
    this._frame = 0;
    this._on = false;
    /** re-tag the level's static casters before the next re-render (level load, caster set change) */
    this._retag = true;
    /** static casters tagged at the last re-tag (perf probes / tests) */
    this.casters = 0;
    this._sm = null; this._prev = null; this._hookFn = null;
  }

  /** Force a re-render next frame (caster visibility, quality, level or preset change). */
  invalidate() { this.dirty = true; this._retag = true; }

  /**
   * Restrict the renderer's shadow pass to STATIC_CASTER_LAYER while stage 2 runs: three tests `object.layers` against
   * the camera handed to `shadowMap.render` (render lists are already built by then, so the main pass is untouched).
   * Wraps whatever `render` is installed (the perf probe's counter stays inside). Idempotent per renderer.
   */
  _hook(sm) {
    if (this._sm === sm) return;
    const prev = sm.render, self = this, mask = 1 << STATIC_CASTER_LAYER;
    const fn = function (lights, scene, camera) {
      if (!self._on || !camera?.layers) return prev.call(this, lights, scene, camera);
      const keep = camera.layers.mask;
      camera.layers.mask = mask;
      try { return prev.call(this, lights, scene, camera); } finally { camera.layers.mask = keep; }
    };
    sm.render = fn;
    this._sm = sm; this._prev = prev; this._hookFn = fn;
  }

  /**
   * Place the light for the cached box; returns false when stage 2 cannot run (no renderer shadow map).
   * @param {{cx:number, cy:number, halfX:number, halfY:number}} fit live stage-1 fit (light space)
   * @param {THREE.Vector3} r @param {THREE.Vector3} u @param {THREE.Vector3} f light axes @param {THREE.Vector3} dir toward the sun
   * @param {THREE.Vector3} p the focus (depth reference)
   */
  place(fit, r, u, f, dir, p) {
    const env = this.env, rd = env.ctx.renderer, L = env.sunLight;
    if (!rd?.shadowMap || !L) return false;
    if (!this._on) { rd.shadowMap.autoUpdate = false; this._on = true; this.dirty = true; this._hook(rd.shadowMap); }
    const F = CAMERA.iso?.foot ?? {};
    this._frame++;
    const tween = env.tweening && this._frame % 4 === 0;
    const moved = cacheBox(fit, this.box, F.shadowCacheMargin ?? 8, F.shadowCacheSnap ?? 8);
    if (!(moved || tween || this.dirty)) return true;
    this.dirty = false;
    if (this._retag) {
      const lv = env.ctx.levels?.current;
      this.casters = tagStaticCasters(lv?.root ?? null, lv?.groups?.actors ?? null);
      this._retag = false;
    }
    const b = this.box, sc = L.shadow.camera;
    if (sc.right !== b.hx || sc.top !== b.hy) { sc.left = -b.hx; sc.right = b.hx; sc.top = b.hy; sc.bottom = -b.hy; sc.updateProjectionMatrix(); }
    const tgt = L.target.position, d = p.dot(f);
    tgt.copy(r).multiplyScalar(b.cx).addScaledVector(u, b.cy).addScaledVector(f, d);
    L.position.copy(tgt).addScaledVector(dir, 45);
    L.target.updateMatrixWorld();
    rd.shadowMap.needsUpdate = true;
    this.renders++;
    return true;
  }

  dispose() {
    const rd = this.env?.ctx?.renderer;
    if (this._on && rd?.shadowMap) rd.shadowMap.autoUpdate = true;
    if (this._sm && this._sm.render === this._hookFn) this._sm.render = this._prev;
    this._sm = this._prev = this._hookFn = null;
    this._on = false;
  }
}
