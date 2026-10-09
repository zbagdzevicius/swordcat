// src/camera/LockOn.js  (owner: camera) — lock-on targeting (GAME_DESIGN §8.3, config PLAYER.lockOn):
//   acquire: nearest hostile within `range` (12 m) and inside `cone` (100°) of camera forward; if the cone is empty,
//            the hostile that hit her in the last 3 s, else the nearest hostile within 6 m in any direction;
//   switch:  mouse flick > `flickPx` (40 px) within `flickTime` (0.15 s), the wheel (lockNext/lockPrev),
//            or a right-stick flick past 0.7;
//   break:   beyond `breakRange` (16 m) or `losTimeout` (1.5 s) without line of sight; a dead target hands
//            over to the next one in range (preferring one within ±60° of the view; FollowCamera rate-limits the turn).
// Pure selection helpers are exported for unit tests. The marker is a small gold gem over the target's head.
import * as THREE from 'three';
import { wrapAngle } from '../core/math.js';

/**
 * Signed angle of `to` relative to the camera's forward, seen from `from` (positive = to the LEFT on screen).
 * The orbit camera sits at pivot + dir(yaw), so it looks along yaw + π.
 * @param {number} camYaw @param {{x:number,z:number}} from @param {{x:number,z:number}} to
 */
export function relYaw(camYaw, from, to) {
  return wrapAngle(Math.atan2(to.x - from.x, to.z - from.z) - (camYaw + Math.PI));
}

/** Is this actor a valid lock target? */
export function lockable(a) {
  return !!a && a.alive !== false && a.hurtable !== false && a.object3d?.visible !== false && !a.hidden && !a.attachedTo;
}

/**
 * Best target: within `range` and inside `cone` (full angle) of camera forward; scored by distance with a
 * penalty for being off-centre. Returns the actor or null.
 * @param {any[]} candidates @param {{x:number,z:number}} origin @param {number} camYaw
 * @param {{range:number, cone:number}} cfg @param {any} [exclude]
 */
export function pickLockTarget(candidates, origin, camYaw, cfg, exclude = null) {
  let best = null, bestScore = Infinity;
  const half = cfg.cone / 2;
  for (const a of candidates) {
    if (a === exclude || !lockable(a)) continue;
    const d = Math.hypot(a.pos.x - origin.x, a.pos.z - origin.z);
    if (d > cfg.range) continue;
    const ang = Math.abs(relYaw(camYaw, origin, a.pos));
    if (ang > half) continue;
    const score = d * (1 + 1.5 * (ang / half));
    if (score < bestScore) { bestScore = score; best = a; }
  }
  return best;
}

/** Nearest valid target within `range` in any direction (hand-over when the current target dies). */
export function nearestLockTarget(candidates, origin, range, exclude = null) {
  let best = null, bd = range;
  for (const a of candidates) {
    if (a === exclude || !lockable(a)) continue;
    const d = Math.hypot(a.pos.x - origin.x, a.pos.z - origin.z);
    if (d <= bd) { bd = d; best = a; }
  }
  return best;
}

/** Dead-target hand-over prefers targets within this half-angle (rad, ±60°) of camera forward. */
export const HANDOVER_HALF_CONE = Math.PI / 3;

/**
 * Hand-over when the locked target dies: the nearest valid target within `range` inside ±`halfCone` of camera
 * forward (no orbit swing needed), else the nearest in any direction (the camera turns to it rate-limited).
 * @param {any[]} candidates @param {{x:number,z:number}} origin @param {number} camYaw @param {number} range
 * @param {any} [exclude] @param {number} [halfCone]
 */
export function handoverLockTarget(candidates, origin, camYaw, range, exclude = null, halfCone = HANDOVER_HALF_CONE) {
  let best = null, bd = range;
  for (const a of candidates) {
    if (a === exclude || !lockable(a)) continue;
    const d = Math.hypot(a.pos.x - origin.x, a.pos.z - origin.z);
    if (d <= bd && Math.abs(relYaw(camYaw, origin, a.pos)) <= halfCone) { bd = d; best = a; }
  }
  return best ?? nearestLockTarget(candidates, origin, range, exclude);
}

/** Lock-on fallback when nothing is inside the cone: the nearest hostile within this radius (m), in any direction. */
export const LOCK_FALLBACK_RANGE = 6;
/** ...or the hostile that hit her within this many seconds (it is beside or behind her, hitting her). */
export const RECENT_ATTACKER_TIME = 3;

/**
 * Acquire with a fallback (GAME_DESIGN §8.3 + review): the cone pick first; when the cone is empty, the hostile that
 * attacked her recently (`recent`, if it is still a lockable candidate within `cfg.range`), else the nearest
 * candidate within `fallbackRange` in any direction. Null when there is nothing (the caller recentres).
 * @param {any[]} candidates @param {{x:number,z:number}} origin @param {number} camYaw
 * @param {{range:number, cone:number}} cfg @param {any} [recent] @param {number} [fallbackRange]
 */
export function acquireLockTarget(candidates, origin, camYaw, cfg, recent = null, fallbackRange = LOCK_FALLBACK_RANGE) {
  const inCone = pickLockTarget(candidates, origin, camYaw, cfg);
  if (inCone) return inCone;
  if (recent && lockable(recent) && candidates.includes(recent)
    && Math.hypot(recent.pos.x - origin.x, recent.pos.z - origin.z) <= cfg.range) return recent;
  return nearestLockTarget(candidates, origin, Math.min(fallbackRange, cfg.range));
}

/**
 * Next target to the right (dir = +1) or left (dir = −1) of `current` on screen, within `range`.
 * With `wrap`, running off one edge continues from the other (wheel); flicks don't wrap.
 * @param {any[]} candidates @param {{x:number,z:number}} origin @param {number} camYaw @param {any} current
 * @param {1|-1} dir @param {number} range @param {boolean} [wrap]
 */
export function switchLockTarget(candidates, origin, camYaw, current, dir, range, wrap = false) {
  const ac = current ? relYaw(camYaw, origin, current.pos) : 0;
  let best = null, bestDelta = Infinity, edge = null, edgeVal = dir > 0 ? -Infinity : Infinity;
  for (const a of candidates) {
    if (a === current || !lockable(a)) continue;
    if (Math.hypot(a.pos.x - origin.x, a.pos.z - origin.z) > range) continue;
    const ang = relYaw(camYaw, origin, a.pos);
    // screen right = smaller (more negative) angle
    const delta = dir > 0 ? ac - ang : ang - ac;
    if (delta > 1e-4 && delta < bestDelta) { bestDelta = delta; best = a; }
    if (dir > 0 ? ang > edgeVal : ang < edgeVal) { edgeVal = ang; edge = a; }   // the far opposite edge
  }
  return best ?? (wrap ? edge : null);
}

/**
 * Mouse flick detector: the sum of horizontal pixels within a sliding `time` window crossing `px`.
 * Returns +1 (flick right), −1 (left) or 0. Allocation-free ring buffer.
 */
export class FlickDetector {
  constructor(px = 40, time = 0.15, cooldown = 0.25) {
    this.px = px; this.time = time; this.cooldown = cooldown;
    this.n = 32; this.dx = new Float32Array(this.n); this.ts = new Float64Array(this.n);
    this.head = 0; this.count = 0; this.now = 0; this.coolT = 0;
  }

  reset() { this.count = 0; this.head = 0; }

  /** @param {number} dx pixels this frame @param {number} dt seconds */
  push(dx, dt) {
    this.now += dt;
    if (this.coolT > 0) { this.coolT -= dt; if (dx) this.reset(); return 0; }
    if (dx) {
      this.dx[this.head] = dx; this.ts[this.head] = this.now;
      this.head = (this.head + 1) % this.n; this.count = Math.min(this.n, this.count + 1);
    }
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      const j = (this.head - 1 - i + this.n) % this.n;
      if (this.now - this.ts[j] > this.time) break;
      sum += this.dx[j];
    }
    if (Math.abs(sum) >= this.px) { this.reset(); this.coolT = this.cooldown; return sum > 0 ? 1 : -1; }
    return 0;
  }
}

/** Right-stick flick: an edge past `on` (0.7) fires once; re-arms below `off`. */
export class StickFlick {
  constructor(on = 0.7, off = 0.35) { this.on = on; this.off = off; this.armed = true; }
  /** @param {number} x stick deflection (−1..1, + = right) */
  push(x) {
    const a = Math.abs(x);
    if (this.armed && a >= this.on) { this.armed = false; return x > 0 ? 1 : -1; }
    if (!this.armed && a < this.off) this.armed = true;
    return 0;
  }
}

const MARKER_COLOR = '#FFD34D';      // the gold telegraph colour (TELEGRAPH.colors.gold)

/** Small gold gem that floats over the locked target (camera-owned; hide via `cam.showLockMarker = false`). */
export class LockMarker {
  constructor() {
    this.object = null;
    this.t = 0;
  }

  /** @param {THREE.Object3D} parent */
  build(parent) {
    if (this.object) return this.object;
    const g = new THREE.Group();
    g.name = 'cam:lockMarker';
    const mat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat);
    gem.scale.set(0.7, 1.25, 0.7);
    gem.position.y = 0.6;                             // the point sits at the group origin (just above the head)
    const ringMat = mat.clone(); ringMat.opacity = 0.75;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 24), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.6;
    g.add(gem, ring);
    g.traverse((o) => { o.renderOrder = 999; o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; });
    g.visible = false;
    g.userData.cameraOwned = true;
    parent.add(g);
    this.object = g; this.gem = gem; this.ring = ring;
    return g;
  }

  /**
   * @param {any} target actor or null @param {THREE.Camera} camera @param {number} dt @param {boolean} show
   */
  update(target, camera, dt, show) {
    const g = this.object;
    if (!g) return;
    if (!target || !show) { g.visible = false; return; }
    this.t += dt;
    const p = target.object3d?.position ?? target.pos;
    g.position.set(p.x, p.y + (target.height ?? 1) + 0.25 + Math.sin(this.t * 3.2) * 0.04, p.z);
    const d = Math.max(1, camera.position.distanceTo(g.position));
    g.scale.setScalar(0.022 * d);                    // ~constant size on screen
    this.gem.rotation.y = this.t * 2.4;
    g.visible = true;
  }

  dispose() {
    const g = this.object;
    if (!g) return;
    g.removeFromParent();
    g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    this.object = null;
  }
}
