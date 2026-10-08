// src/physics/Physics.js  (owner: physics) — custom kinematic collision (tech.md §5; GAME_DESIGN §7.1, §19.2).
//
// Frozen API (§19.2): setLevel, moveActor, separateActors, raycast, heightAt, isDeepWater(x, z), clampToBounds.
// Additive API: groundAt, normalAt, sphereCast, lineOfSight, waterLevelAt, inBounds, blockedAt, addCollider,
//   removeCollider, updateCollider, addMesh, removeMesh, rebuildMeshes, setDebug.
//
// World model, per level (LevelData from world/LevelKit):
//   1. ground    `heightfield` — exact on the rendered terrain triangles (physics/Heightfield.js)
//   2. props     `colliders` {circles, boxes, segments?, rings?} — vertical prisms in a 4 m spatial hash
//                (physics/StaticColliders.js); their tops are walkable (step onto crates, stand on hay bales)
//   3. architecture  `octreeMeshes` (Object3D[]) + any mesh under `root` with `userData.collide === true` — triangles
//                in a three Octree (physics/MeshCollider.js); actors collide as vertical capsules
//   4. actors    mass-weighted XZ separation (fixed step, after combat)
//   5. bounds    `bounds` {min: Vector2(x, z), max: Vector2(x, z)}; water via `level.isDeepWater(x, z)` or `level.water`
//
// moveActor(actor, dt) — duck-typed actor fields:
//   in:  pos (feet), vel, radius, height, onGround, mass, id
//        flying (no gravity, never below ground), gravityMul, terminalFall, stepUp, noClip (integrate only)
//   out: onGround, landImpact (m/s on the landing step, else 0), groundNormal (Vector3), groundY, groundKind
//        ('terrain' | 'static' | 'mesh' | null), groundObject, sliding (on a too-steep slope), wallHit, ceilingHit,
//        stepY (height gained by a step-up this step; smooth visuals with it), bounced (vy from a bounce surface)
// Robustness: motion is split into sub-steps of at most half the collision radius (no tunnelling through thin
// walls at dodge, knockback or terminal-fall speeds); walkable contacts push straight up (no creeping down ramps);
// walls and steep faces push sideways only (no climbing); step-up 0.3 m (PLAYER.stepUp) onto props and meshes;
// downhill ground snap 0.3 m; slopes with normal.y < 0.7 can't be walked up and slide (GAME_DESIGN §7.1).
import * as THREE from 'three';
import { StaticColliders } from './StaticColliders.js';
import { MeshCollider } from './MeshCollider.js';
import { PhysicsDebug } from './PhysicsDebug.js';

/**
 * Engine tunables. GAME_DESIGN §7.1 / tech.md §5 numbers; `config.PHYSICS` (if core adds it) overrides these,
 * `config.PLAYER.stepUp` / `terminalFall` are the actor defaults.
 */
export const PHYSICS_DEFAULTS = Object.freeze({
  walkableNormalY: 0.7,    // §7.1: slopes steeper than normal.y 0.7 slide
  groundSnap: 0.3,         // tech.md §5: stick to downhill slopes / step down
  skin: 0.02,              // resting-contact tolerance (m)
  substep: 0.5,            // max motion per sub-step as a fraction of the collision radius
  maxSubsteps: 16,
  deepWater: 0.5,          // water deeper than this (m) is "deep" unless the water entry says deep: true/false
  ceilingNormalY: -0.2,
});

const _n = new THREE.Vector3();
const _dir = new THREE.Vector3();
const RAY_DEFAULTS = Object.freeze({ terrain: true, mesh: true, statics: false });
const LOS_DEFAULTS = Object.freeze({ terrain: true, mesh: true, statics: true });
const KIND_NAMES = ['terrain', 'static', 'mesh'];
const TERRAIN = 0, STATIC = 1, MESH = 2;

export class Physics {
  constructor(ctx) {
    this.ctx = ctx;
    const cfg = ctx?.config ?? {};
    /** Resolved tunables (PHYSICS_DEFAULTS < config.PHYSICS). */
    this.cfg = {
      ...PHYSICS_DEFAULTS,
      gravity: cfg.GRAVITY ?? 22,
      stepUp: cfg.PLAYER?.stepUp ?? 0.3,
      terminalFall: cfg.PLAYER?.terminalFall ?? 14,
      ...(cfg.PHYSICS ?? {}),
    };
    /** @type {any} current LevelData or null */
    this.level = null;
    /** @type {import('./Heightfield.js').Heightfield|null} */
    this.heightfield = null;
    this.statics = new StaticColliders();
    this.mesh = new MeshCollider();
    /** @type {import('three/addons/math/Octree.js').Octree|null} three Octree of the level architecture (or null) */
    this.octree = null;
    /** @type {{min:{x:number,y:number}, max:{x:number,y:number}}|null} */
    this.bounds = null;
    this._hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), object: null, kind: null };
    this._debug = null;
    this._sepStamp = 0;
    this._moved = [];
    this._warnedNaN = false;
    // per-substep scratch (avoids allocations)
    this._g = { onGround: false, kind: -1, nx: 0, ny: 1, nz: 0, obj: null, bounce: 0, sliding: false };
  }

  async init() {}

  /** Fixed step (after combat): actor-vs-actor separation (tech.md §5 item 4). */
  update(dt) { this.separateActors(); }

  /** Visual only: the collider debug overlay (setDebug(true)). */
  render() { if (this._debug) this._debug.update(); }

  dispose() {
    this.setDebug(false);
    this.setLevel(null);
  }

  // ==================================================================== level
  /** @param {any} level LevelData ({heightfield, colliders, octreeMeshes, root, bounds, water, isDeepWater}) or null */
  setLevel(level) {
    this.level = level ?? null;
    this.heightfield = level?.heightfield ?? null;
    this.statics.set(level?.colliders ?? null);
    this.bounds = level?.bounds ?? null;
    const sources = [];
    for (const o of level?.octreeMeshes ?? []) if (o?.isObject3D) sources.push(o);
    if (level?.root?.isObject3D) {
      level.root.traverse((o) => {
        if (o.userData?.collide === true && !sources.includes(o)) {
          for (let p = o.parent; p; p = p.parent) if (sources.includes(p)) return;   // already covered by an ancestor
          sources.push(o);
        }
      });
    }
    this.mesh.build(sources);
    this.octree = this.mesh.octree;
    this._debug?.rebuild();
  }

  // ---- dynamic colliders (arena fog walls, nets, doors, cages) ----
  /** Add a static collider (any StaticColliders shape). Returns it; remove with removeCollider(sameObject). */
  addCollider(c, hint = null) { const r = this.statics.add(c, hint); this._debug?.rebuild(); return r; }
  removeCollider(c) { const r = this.statics.remove(c); this._debug?.rebuild(); return r; }
  /** Re-index a collider whose fields you changed (moved door). */
  updateCollider(c) { this.statics.update(c); this._debug?.rebuild(); }
  /** Add an Object3D's meshes to the architecture (rebuilds the Octree: once per change, not per frame). */
  addMesh(obj) { this.mesh.add(obj); this.octree = this.mesh.octree; this._debug?.rebuild(); return obj; }
  removeMesh(obj) { const r = this.mesh.remove(obj); this.octree = this.mesh.octree; this._debug?.rebuild(); return r; }
  /** Rebuild the architecture after moving collision meshes. */
  rebuildMeshes() { this.mesh.rebuild(); this.octree = this.mesh.octree; this._debug?.rebuild(); }

  // ==================================================================== queries
  /** Terrain height at (x, z) (0 without a level). */
  heightAt(x, z) { return this.heightfield ? this.heightfield.heightAt(x, z) : 0; }

  /**
   * Ground height. Without `fromY`: the terrain (tech.md alias of heightAt). With `fromY`: the highest walkable
   * surface at or below fromY — terrain, prop tops and architecture (bridge decks, ledges, stairs).
   */
  groundAt(x, z, fromY) {
    const t = this.heightAt(x, z);
    if (fromY === undefined || fromY === null || !Number.isFinite(fromY)) return t;
    let g = t;
    if (this.octree) {
      const d = this.mesh.raycast(x, fromY + 1e-3, z, 0, -1, 0, fromY + 1e-3 - g);
      if (d >= 0 && this.mesh.rayNy > 0) g = Math.max(g, fromY + 1e-3 - d);
    }
    const s = this.statics.supportAt(x, z, 0, fromY + 1e-3);
    return s > g ? s : g;
  }

  /** Smooth terrain normal (tech.md §5). */
  normalAt(x, z, out = new THREE.Vector3()) { return this.heightfield ? this.heightfield.normalAt(x, z, out) : out.set(0, 1, 0); }

  /**
   * Water surface height at (x, z) or null. From `level.water` entries (Appendix B.1): { kind: 'stream', from, to,
   * width, y, deep }, { kind: 'rect', at, size } | { minX, maxX, minZ, maxZ }, { kind: 'disc', at, r },
   * { kind: 'poly', points }, or a plain { y } plane (covers the level wherever the terrain is lower).
   */
  waterLevelAt(x, z) {
    const lvl = this.level;
    if (typeof lvl?.waterLevelAt === 'function') { const y = lvl.waterLevelAt(x, z); return Number.isFinite(y) ? y : null; }
    const list = Array.isArray(lvl?.water) ? lvl.water : null;
    if (!list) return null;
    let best = null;
    this._waterDeep = undefined;
    for (const w of list) {
      if (!w || !inWater(w, x, z)) continue;
      const y = Number.isFinite(w.y) ? w.y : 0;
      if (best === null || y > best) { best = y; this._waterDeep = w.deep; }
    }
    return best;
  }

  /**
   * Deep water (or a pit) at (x, z)? Delegates to `level.isDeepWater(x, z, y)` when the level provides it; else
   * uses `level.water`. With `y` (feet height), anything standing above the surface (a bridge deck) is dry.
   */
  isDeepWater(x, z, y) {
    const lvl = this.level;
    if (typeof lvl?.isDeepWater === 'function') return !!lvl.isDeepWater(x, z, y);
    const wy = this.waterLevelAt(x, z);
    if (wy === null) return false;
    if (Number.isFinite(y) && y >= wy - 0.05) return false;
    const depth = wy - this.heightAt(x, z);
    if (depth <= 0.05) return false;
    const deep = this._waterDeep;
    return deep === true ? true : deep === false ? false : depth > this.cfg.deepWater;
  }

  /** Inside the level bounds (inset by margin)? */
  inBounds(x, z, margin = 0) {
    const b = this.bounds;
    if (!b) return true;
    return x >= b.min.x + margin && x <= b.max.x - margin && z >= b.min.y + margin && z <= b.max.y - margin;
  }

  /**
   * Static collider (source object) overlapping the circle (x, z, r) between heights y0..y1, or null.
   * Used to skip spawn points inside props (§12.1 arena rule 4).
   */
  blockedAt(x, z, r = 0, y0 = -Infinity, y1 = Infinity, actor = null) { return this.statics.overlaps(x, z, r, y0, y1, actor); }

  /**
   * Ray vs terrain + architecture (+ static props with opts.statics). Returns a shared hit object
   * { distance, point, normal, object, kind: 'terrain'|'mesh'|'static' } or null. Copy what you keep.
   * @param {THREE.Ray} ray @param {number} [maxDist] @param {{terrain?:boolean, mesh?:boolean, statics?:boolean, actor?:any}} [opts]
   */
  raycast(ray, maxDist = 100, opts = RAY_DEFAULTS) {
    const o = ray.origin;
    let dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-12) || !(maxDist > 0)) return null;
    dx /= len; dy /= len; dz /= len;
    return this._ray(o.x, o.y, o.z, dx, dy, dz, maxDist, opts, 0);
  }

  /**
   * Sphere sweep (camera spring arm, projectiles with size): like raycast but for a sphere of `radius` whose centre
   * starts at ray.origin. `distance` is how far the centre travels; `point` is the centre at impact.
   */
  sphereCast(ray, radius, maxDist = 100, opts = RAY_DEFAULTS) {
    const o = ray.origin;
    let dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-12) || !(maxDist > 0)) return null;
    dx /= len; dy /= len; dz /= len;
    if (!(radius > 0)) return this._ray(o.x, o.y, o.z, dx, dy, dz, maxDist, opts, 0);
    return this._ray(o.x, o.y, o.z, dx, dy, dz, maxDist, opts, radius);
  }

  _ray(ox, oy, oz, dx, dy, dz, maxDist, opts, radius) {
    const h = this._hit;
    let best = maxDist, kind = -1, obj = null;
    if (opts.terrain !== false && this.heightfield) {
      const t = this.heightfield.raycast(ox, oy - radius, oz, dx, dy, dz, best);
      if (t >= 0 && t <= best) { best = t; kind = TERRAIN; }
    }
    if (opts.mesh !== false && this.octree) {
      const t = radius > 0 ? this.mesh.sweepSphere(ox, oy, oz, dx, dy, dz, radius, best) : this.mesh.raycast(ox, oy, oz, dx, dy, dz, best);
      if (t >= 0 && t <= best) {
        best = t; kind = MESH;
        if (radius > 0) { obj = this.mesh.sweepTri?.obj ?? null; h.normal.set(this.mesh.sweepNx, this.mesh.sweepNy, this.mesh.sweepNz); }
        else { obj = this.mesh.rayTri?.obj ?? null; h.normal.set(this.mesh.rayNx, this.mesh.rayNy, this.mesh.rayNz); }
      }
    }
    if (opts.statics && this.statics.count) {
      const t = this.statics.raycast(ox, oy, oz, dx, dy, dz, best, radius, opts.actor ?? null);
      if (t >= 0 && t <= best) { best = t; kind = STATIC; obj = this.statics.hitSrc; h.normal.set(this.statics.hitNx, this.statics.hitNy, this.statics.hitNz); }
    }
    if (kind < 0) return null;
    h.distance = best; h.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
    if (kind === TERRAIN) { this.normalAt(h.point.x, h.point.z, h.normal); obj = null; }
    h.object = obj; h.kind = KIND_NAMES[kind];
    return h;
  }

  /** Clear line between two points (terrain, architecture and props block). `opts` as raycast (statics default on). */
  lineOfSight(from, to, opts = LOS_DEFAULTS) {
    _dir.subVectors(to, from);
    const d = _dir.length();
    if (d < 1e-6) return true;
    _dir.divideScalar(d);
    return !this._ray(from.x, from.y, from.z, _dir.x, _dir.y, _dir.z, d - 1e-3, opts, 0);
  }

  // ==================================================================== movement
  /**
   * Integrate one kinematic actor for `dt`: gravity, sub-stepped collision against props, architecture and terrain,
   * step-up, slopes, ground snap, bounds. See the header for the actor fields read and written.
   */
  moveActor(a, dt) {
    if (!a?.pos || !a.vel || !(dt > 0) || a.attachedTo) return;
    const C = this.cfg, p = a.pos, v = a.vel;
    if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) this._recoverNaN(a);
    if (!(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) v.set(0, 0, 0);
    const wasGround = !!a.onGround;
    a.landImpact = 0; a.wallHit = false; a.ceilingHit = false; a.stepY = 0; a.bounced = 0;
    if (!a.groundNormal) a.groundNormal = new THREE.Vector3(0, 1, 0);         // once per actor
    if (a.noClip) { p.addScaledVector(v, dt); a.onGround = false; a.sliding = false; a.groundKind = null; return; }

    const flying = !!a.flying;
    if (!flying) {
      if (!wasGround || v.y > 0) {
        v.y -= C.gravity * (a.gravityMul ?? 1) * dt;
        const tf = a.terminalFall ?? C.terminalFall;
        if (v.y < -tf) v.y = -tf;
      } else if (v.y < 0) v.y = 0;
    }

    const r = a.radius ?? 0.35, h = a.height ?? 1, capR = Math.max(0.01, Math.min(r, h * 0.5));
    const maxStep = Math.max(0.02, capR * C.substep);
    const len = Math.max(Math.hypot(v.x, v.z), Math.abs(v.y)) * dt;
    const n = Math.min(C.maxSubsteps, Math.max(1, Math.ceil(len / maxStep)));
    const sdt = dt / n;
    const g = this._g;
    let grounded = wasGround && v.y <= 0 && !flying;
    a.sliding = false;
    g.onGround = grounded; g.kind = grounded ? (a.groundKind === 'mesh' ? MESH : a.groundKind === 'static' ? STATIC : TERRAIN) : -1;
    g.nx = a.groundNormal.x; g.ny = a.groundNormal.y; g.nz = a.groundNormal.z; g.obj = a.groundObject ?? null;
    let impact = 0;
    for (let i = 0; i < n; i++) {
      const vyBefore = v.y;
      const now = this._substep(a, v.x * sdt, v.y * sdt, v.z * sdt, grounded, flying, capR);
      if (now && !grounded && -vyBefore > impact) impact = -vyBefore;
      grounded = now;
    }

    a.onGround = grounded;
    if (grounded) {
      a.groundNormal.set(g.nx, g.ny, g.nz);
      a.groundY = p.y; a.groundKind = KIND_NAMES[g.kind] ?? null; a.groundObject = g.obj;
    } else {
      if (!a.sliding) a.groundNormal.set(0, 1, 0);
      a.groundY = NaN; a.groundKind = null; a.groundObject = null;
    }
    if (!wasGround && grounded) a.landImpact = impact;
    this.clampToBounds(a);
  }

  /** One sub-step. Returns whether the actor ends it on walkable ground; ground details in this._g. */
  _substep(a, sx, sy, sz, grounded, flying, capR) {
    const C = this.cfg, p = a.pos, v = a.vel, hf = this.heightfield, mesh = this.mesh, g = this._g;
    const x0 = p.x, y0 = p.y, z0 = p.z;
    const stepUp = flying ? 0 : (a.stepUp ?? C.stepUp);
    const canSnap = grounded && !flying;
    p.x += sx; p.y += sy; p.z += sz;

    // 1. too-steep terrain can't be walked (or slid) up
    if (hf && !flying) this._blockSteepTerrain(a, x0, z0, y0);

    // 2. props: sideways push-out; tops within reach are support
    const support = this.statics.resolve(a, y0, grounded ? stepUp : C.skin);
    if (this.statics.wall) a.wallHit = true;
    const supportBounce = this.statics.supportBounce, supportSrc = this.statics.supportSrc;

    // 3. architecture: capsule push-out (+ step-up when a wall blocks a grounded actor)
    let meshFloor = false, mfnx = 0, mfny = 1, mfnz = 0, mfBounce = 0, mfObj = null;
    if (this.octree) {
      const vx0 = v.x, vz0 = v.z;
      mesh.resolveCapsule(a, capR, C.walkableNormalY, C.skin, true);
      if (mesh.ceiling) a.ceilingHit = true;
      if (mesh.floor && v.y <= 1e-4) { meshFloor = true; mfnx = mesh.floorNx; mfny = mesh.floorNy; mfnz = mesh.floorNz; mfBounce = mesh.floorBounce; mfObj = mesh.floorObj; }
      if (mesh.wall) {
        a.wallHit = true;
        if (canSnap && stepUp > 0 && this._tryStepUp(a, x0, y0, z0, sx, sz, vx0, vz0, capR, stepUp)) {
          meshFloor = this._stepKind === MESH;
          if (meshFloor) { mfnx = this._stepNx; mfny = this._stepNy; mfnz = this._stepNz; mfBounce = 0; mfObj = this._stepObj; }
        }
      }
    }

    // 4. ground: terrain and prop tops (never below either), then architecture floors / snap
    let gy = -Infinity, gKind = -1, gBounce = 0, gObj = null;
    if (hf) { gy = hf.heightAt(p.x, p.z); gKind = TERRAIN; }
    if (support > gy) { gy = support; gKind = STATIC; gBounce = supportBounce; gObj = supportSrc; }
    if (flying) { if (p.y < gy) p.y = gy; return false; }

    let on = false, kind = -1, nx = 0, ny = 1, nz = 0, bounce = 0, obj = null;
    if (p.y < gy) p.y = gy;
    if (meshFloor) {
      on = true; kind = MESH; nx = mfnx; ny = mfny; nz = mfnz; bounce = mfBounce; obj = mfObj;
    } else if (p.y <= gy + (canSnap ? C.groundSnap : C.skin)) {
      // an architecture floor between us and that ground wins (walking off a low deck onto terrain)
      if (canSnap && this.octree && p.y - gy > C.skin && this._snapMesh(a, capR, p.y - gy)) {
        on = true; kind = MESH; nx = mesh.sweepNx; ny = mesh.sweepNy; nz = mesh.sweepNz; obj = mesh.sweepTri?.obj ?? null;
      } else {
        if (gKind === TERRAIN) hf.normalAt(p.x, p.z, _n); else _n.set(0, 1, 0);
        if (_n.y >= C.walkableNormalY) {
          p.y = gy; on = true; kind = gKind; nx = _n.x; ny = _n.y; nz = _n.z; bounce = gBounce; obj = gObj;
        } else if (p.y <= gy + C.skin) {                                  // too steep: slide down it
          p.y = gy; a.sliding = true; a.groundNormal.copy(_n);
          const vn = v.x * _n.x + v.y * _n.y + v.z * _n.z;
          if (vn < 0) {
            const ty = v.y - _n.y * vn;
            if (ty <= 0) { v.x -= _n.x * vn; v.y = ty; v.z -= _n.z * vn; }
            else { const hl = Math.hypot(_n.x, _n.z) || 1, hx = _n.x / hl, hz = _n.z / hl, vh = v.x * hx + v.z * hz; if (vh < 0) { v.x -= hx * vh; v.z -= hz * vh; } if (v.y < 0) v.y = 0; }
          }
        }
      }
    } else if (canSnap && this.octree && this._snapMesh(a, capR, C.groundSnap)) {
      on = true; kind = MESH; nx = mesh.sweepNx; ny = mesh.sweepNy; nz = mesh.sweepNz; obj = mesh.sweepTri?.obj ?? null;
    }

    if (on) {
      a.sliding = false;
      if (v.y < 0) v.y = 0;
      if (bounce > 0 && !grounded) {                                     // mushroom caps: land → spring up
        v.y = bounce; a.bounced = bounce; on = false;
      }
    }
    if (on) { g.kind = kind; g.nx = nx; g.ny = ny; g.nz = nz; g.obj = obj; }
    return on;
  }

  /** Sweep the capsule's bottom sphere down by up to `maxDown`; on a walkable hit, move the actor there. */
  _snapMesh(a, capR, maxDown) {
    const p = a.pos, mesh = this.mesh;
    const t = mesh.sweepSphere(p.x, p.y + capR, p.z, 0, -1, 0, capR, maxDown);
    if (t < 0 || mesh.sweepNy < this.cfg.walkableNormalY) return false;
    p.y -= t;
    return true;
  }

  /** Remove the uphill part of this sub-step's motion where the terrain ahead is steeper than walkable. */
  _blockSteepTerrain(a, x0, z0, y0) {
    const p = a.pos, hf = this.heightfield;
    if (p.x === x0 && p.z === z0) return;
    hf.normalAt(p.x, p.z, _n);
    if (_n.y >= this.cfg.walkableNormalY) return;
    if (hf.heightAt(p.x, p.z) <= y0 + 1e-4) return;                      // airborne above it, or going down
    const hl = Math.hypot(_n.x, _n.z);
    if (hl < 1e-9) return;
    const ux = -_n.x / hl, uz = -_n.z / hl;                              // uphill
    const m = (p.x - x0) * ux + (p.z - z0) * uz;
    if (m <= 0) return;
    p.x -= ux * m; p.z -= uz * m;
    const v = a.vel, vu = v.x * ux + v.z * uz;
    if (vu > 0) { v.x -= ux * vu; v.z -= uz * vu; }
    a.wallHit = true;
  }

  /**
   * Step-up against architecture: blocked while grounded → try the same horizontal move stepUp higher, then sweep
   * down onto the step. Accepted only if it lands on walkable ground no higher than stepUp and gets further.
   */
  _tryStepUp(a, x0, y0, z0, sx, sz, vx0, vz0, capR, stepUp) {
    const C = this.cfg, p = a.pos, v = a.vel, mesh = this.mesh, hf = this.heightfield;
    const want = sx * sx + sz * sz;
    if (want < 1e-10) return false;
    const bx = p.x, by = p.y, bz = p.z, bvx = v.x, bvy = v.y, bvz = v.z;
    const got = (bx - x0) * sx + (bz - z0) * sz;
    if (got >= 0.9 * want) return false;                                 // not really blocked
    const h = a.height ?? 1;
    if (mesh.penetrates(x0, y0 + stepUp, z0, capR, h, 2e-3)) return false;   // no headroom
    p.set(x0 + sx, y0 + stepUp, z0 + sz);
    mesh.resolveCapsule(a, capR, C.walkableNormalY, 0, false);
    const maxDown = stepUp + C.groundSnap;
    let land = -Infinity, kind = -1;
    const t = mesh.sweepSphere(p.x, p.y + capR, p.z, 0, -1, 0, capR, maxDown);
    if (t >= 0 && mesh.sweepNy >= C.walkableNormalY) {
      land = p.y - t; kind = MESH;
      this._stepNx = mesh.sweepNx; this._stepNy = mesh.sweepNy; this._stepNz = mesh.sweepNz; this._stepObj = mesh.sweepTri?.obj ?? null;
    }
    if (hf) { const gy = hf.heightAt(p.x, p.z); if (gy <= p.y + 1e-4 && gy > land) { land = gy; kind = TERRAIN; } }
    const s = this.statics.supportAt(p.x, p.z, a.radius ?? capR, p.y + 1e-4, a);
    if (s > land) { land = s; kind = STATIC; }
    const progress = (p.x - x0) * sx + (p.z - z0) * sz;
    if (kind < 0 || land > y0 + stepUp + 1e-3 || land < y0 - C.groundSnap || progress <= got + 1e-6) {
      p.set(bx, by, bz); v.set(bvx, bvy, bvz);
      return false;
    }
    p.y = land;
    v.x = vx0; v.z = vz0; if (v.y < 0) v.y = 0;
    a.stepY += land - y0;
    this._stepKind = kind;
    return true;
  }

  _recoverNaN(a) {
    if (!this._warnedNaN) { console.warn('[physics] actor position was NaN; restored', a?.constructor?.name, a?.id); this._warnedNaN = true; }
    const pp = a.prevPos;
    if (pp && Number.isFinite(pp.x) && Number.isFinite(pp.y) && Number.isFinite(pp.z)) a.pos.copy(pp);
    else a.pos.set(0, 0, 0);
    if (!Number.isFinite(a.pos.y)) a.pos.y = this.heightAt(a.pos.x, a.pos.z);
    a.vel.set(0, 0, 0);
  }

  /** Can this actor take part in actor-vs-actor separation? */
  _solid(a) {
    return a && a.pos && a.alive !== false && !a.ghost && !a.attachedTo && !a.noClip && a.collideActors !== false && (a.radius ?? 0) > 0;
  }

  /** Mass-weighted XZ circle separation between live, solid actors (O(n²), n < 40); then props/walls/bounds again. */
  separateActors() {
    const list = this.ctx.actors?.list;
    if (!list || list.length < 2) return;
    const stamp = ++this._sepStamp, moved = this._moved;
    moved.length = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!this._solid(a)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!this._solid(b)) continue;
        if (a.fixed && b.fixed) continue;
        if (a.pos.y >= b.pos.y + (b.height ?? 1) || b.pos.y >= a.pos.y + (a.height ?? 1)) continue;   // no vertical overlap
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        let d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        if (d2 < 1e-10) {                                                // stacked: split along a deterministic direction
          const an = (((a.id ?? i) * 7919 + (b.id ?? j) * 104729) % 360) * (Math.PI / 180);
          dx = Math.sin(an) * 1e-3; dz = Math.cos(an) * 1e-3; d2 = 1e-6;
        }
        const d = Math.sqrt(d2), push = min - d, nx = dx / d, nz = dz / d;
        const ma = a.fixed ? 1e9 : Math.max(1e-3, a.mass ?? 1), mb = b.fixed ? 1e9 : Math.max(1e-3, b.mass ?? 1);
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
        if (a._physSep !== stamp && wa > 1e-6) { a._physSep = stamp; moved.push(a); }
        if (b._physSep !== stamp && wb > 1e-6) { b._physSep = stamp; moved.push(b); }
      }
    }
    for (let i = 0; i < moved.length; i++) this._settle(moved[i]);
    moved.length = 0;
  }

  /** Re-resolve props, architecture walls and bounds after a positional nudge (no velocity changes). */
  _settle(a) {
    if (a.fixed) return;
    const C = this.cfg;
    this.statics.resolve(a, a.pos.y, a.onGround ? (a.stepUp ?? C.stepUp) : C.skin, false);
    if (this.octree) {
      const r = a.radius ?? 0.35, capR = Math.max(0.01, Math.min(r, (a.height ?? 1) * 0.5));
      this.mesh.resolveCapsule(a, capR, C.walkableNormalY, 0, false);
    }
    this.clampToBounds(a);
  }

  /** Keep `a` inside the level bounds ({min: Vector2, max: Vector2}, inset by its radius). */
  clampToBounds(a) {
    const b = this.bounds;
    if (!b || !a?.pos) return;
    const r = a.radius ?? 0, v = a.vel;
    if (a.pos.x < b.min.x + r) { a.pos.x = b.min.x + r; if (v && v.x < 0) v.x = 0; }
    if (a.pos.x > b.max.x - r) { a.pos.x = b.max.x - r; if (v && v.x > 0) v.x = 0; }
    if (a.pos.z < b.min.y + r) { a.pos.z = b.min.y + r; if (v && v.z < 0) v.z = 0; }
    if (a.pos.z > b.max.y - r) { a.pos.z = b.max.y - r; if (v && v.z > 0) v.z = 0; }
  }

  // ==================================================================== debug
  /** Show / hide the collider overlay (props, architecture wireframe, actor cylinders). Visual only. */
  setDebug(on = true) {
    if (on && !this._debug && this.ctx?.scene) { this._debug = new PhysicsDebug(this); this._debug.rebuild(); }
    else if (!on && this._debug) { this._debug.dispose(); this._debug = null; }
    return !!this._debug;
  }

  get debug() { return !!this._debug; }
}

/** Is (x, z) inside the area of a `level.water` entry? */
function inWater(w, x, z) {
  const kind = w.kind;
  if (kind === 'stream' || (w.from && w.to)) {
    const [ax, az] = w.from, [bx, bz] = w.to, vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const dx = x - (ax + vx * t), dz = z - (az + vz * t);
    const hw = (w.width ?? 4) / 2;
    return dx * dx + dz * dz <= hw * hw;
  }
  if (w.minX !== undefined) return x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ;
  if ((kind === 'rect' || kind === 'box') && w.at && w.size) return Math.abs(x - w.at[0]) <= w.size[0] / 2 && Math.abs(z - w.at[1]) <= w.size[1] / 2;
  if ((kind === 'disc' || kind === 'pool' || w.r) && w.at) return Math.hypot(x - w.at[0], z - w.at[1]) <= w.r;
  if ((kind === 'poly' || w.points) && Array.isArray(w.points)) {
    let inside = false;
    const pts = w.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  return true;                                                           // a plain plane: everywhere
}
