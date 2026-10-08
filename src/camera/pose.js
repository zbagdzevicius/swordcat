// src/camera/pose.js  (owner: camera) — the camera "pose" every camera mode produces (position, look point,
// roll, vertical FOV), plus the blend used for every transition (follow ⇄ meme ⇄ cutscene shots).
// Pure three.js math; node-safe; allocation-free per call (module temporaries).
import * as THREE from 'three';
import { lerp, wrapAngle, EASES, easeInOutSine } from '../core/math.js';

/** One camera placement. `look` is a world point (not a direction); `roll` is radians about the view axis. */
export class CamPose {
  constructor() {
    this.pos = new THREE.Vector3(0, 2, -4);
    this.look = new THREE.Vector3(0, 1, 0);
    this.roll = 0;
    this.fov = 45;
  }

  /** @param {CamPose} p */
  copy(p) { this.pos.copy(p.pos); this.look.copy(p.look); this.roll = p.roll; this.fov = p.fov; return this; }

  /** @param {THREE.Vector3} pos @param {THREE.Vector3} look @param {number} fov @param {number} [roll] */
  set(pos, look, fov, roll = 0) { this.pos.copy(pos); this.look.copy(look); this.fov = fov; this.roll = roll; return this; }

  /** Distance from the camera to its look point. */
  get lookDist() { return this.pos.distanceTo(this.look); }
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();

/**
 * Blend two poses: `k` 0 → `from`, 1 → `to`. With a `pivot`, positions travel on a cylindrical arc around it
 * (angle, radius and height interpolate separately), so a swing from behind her to the front of her (Meme Cam,
 * cutscene handback) goes AROUND her instead of through her. Look points, roll and FOV interpolate linearly.
 * `out` may be `from` or `to` (everything is computed into temporaries first).
 * @param {CamPose} from @param {CamPose} to @param {number} k @param {THREE.Vector3|null} pivot @param {CamPose} out
 */
export function blendPose(from, to, k, pivot, out) {
  if (k <= 0) return out === from ? out : out.copy(from);
  if (k >= 1) return out === to ? out : out.copy(to);
  _pa.lerpVectors(from.pos, to.pos, k);
  if (pivot) {
    const ax = from.pos.x - pivot.x, az = from.pos.z - pivot.z, bx = to.pos.x - pivot.x, bz = to.pos.z - pivot.z;
    const ra = Math.hypot(ax, az), rb = Math.hypot(bx, bz);
    if (ra > 0.35 && rb > 0.35) {
      const aa = Math.atan2(ax, az), ab = Math.atan2(bx, bz);
      const ang = aa + wrapAngle(ab - aa) * k, r = lerp(ra, rb, k);
      _pa.set(pivot.x + Math.sin(ang) * r, _pa.y, pivot.z + Math.cos(ang) * r);
    }
  }
  _pb.lerpVectors(from.look, to.look, k);
  const roll = lerp(from.roll, to.roll, k), fov = lerp(from.fov, to.fov, k);
  out.pos.copy(_pa); out.look.copy(_pb); out.roll = roll; out.fov = fov;
  return out;
}

/**
 * Write a pose's position + orientation into a camera (FOV is applied by the caller, which adds punches).
 * @param {THREE.Camera} camera @param {CamPose} pose
 */
export function applyPose(camera, pose) {
  camera.position.copy(pose.pos);
  camera.up.set(0, 1, 0);
  _pa.copy(pose.look);
  const dx = _pa.x - pose.pos.x, dz = _pa.z - pose.pos.z, dy = _pa.y - pose.pos.y;
  if (dx * dx + dz * dz < 1e-8) {                     // looking straight up/down (or at itself): keep lookAt stable
    if (Math.abs(dy) < 1e-4) _pa.z += 1;
    else _pa.z += 1e-3;
  }
  camera.lookAt(_pa);
  if (pose.roll) camera.rotateZ(pose.roll);
}

/** Resolve an ease (function, EASES name, 'easeInOutSine' style alias); default in-out sine. */
export function resolveEase(e) {
  if (typeof e === 'function') return e;
  if (typeof e !== 'string' || !e) return easeInOutSine;
  if (EASES[e]) return EASES[e];
  let k = e.replace(/^ease/i, '');
  k = k.charAt(0).toLowerCase() + k.slice(1);
  if (EASES[k]) return EASES[k];
  return ({ in: EASES.inQuad, out: EASES.outQuad, inOut: easeInOutSine, sine: easeInOutSine, linear: EASES.linear })[k] ?? easeInOutSine;
}
