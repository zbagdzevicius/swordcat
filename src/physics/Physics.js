// src/physics/Physics.js  (owner: physics) — custom kinematic collision (tech.md §5; GAME_DESIGN §7.1, §19.2).
//
// Frozen API (§19.2): setLevel, moveActor, separateActors, raycast, heightAt, isDeepWater(x, z), clampToBounds.
// Additive API: groundAt, normalAt, sphereCast, lineOfSight, waterLevelAt, isShallowWater, inBounds, blockedAt,
//   overlapsStatic, bounceAt, addCollider, removeCollider, updateCollider, refreshColliders, addMesh, removeMesh,
//   rebuildMeshes, setDebug.
// Without a level (or a level without a heightfield) the terrain is the plane y = 0 (heightAt → 0).
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
//        stepY (height gained / lost stepping onto or off a prop or stair this step; ease visuals with it),
//        bounced (vy given by a bounce surface on the landing step; onGround stays false),
//        slideSpeed (m/s down a too-steep terrain slope while sliding, else 0)
// Robustness: motion is split into sub-steps of at most half the collision radius (no tunnelling through thin
// walls at dodge, knockback or terminal-fall speeds; beyond 24 sub-steps the motion is shortened, never skipped);
// walkable contacts push straight up (no creeping down ramps); walls and steep faces push sideways only (no
// climbing); step-up 0.3 m (PLAYER.stepUp) onto props and meshes, never onto a taller riser's rim; downhill ground
// snap 0.3 m that never snaps through architecture (a grounded capsule follows step edges down and slips off ledges);
// slopes with normal.y < 0.7 can't be walked up and slide (GAME_DESIGN §7.1) — the slide is physics-owned
// (`slideSpeed`), so an actor steering into a bank can't hang on it; separation shoves are swept too. Gravity is
// integrated exactly for constant acceleration (jump apex = v²/2g: 1.245 m for the player, §7.1).
import * as THREE from 'three';
import { PHYSICS } from '../core/config.js';
import { StaticColliders } from './StaticColliders.js';
import { MeshCollider } from './MeshCollider.js';
import { PhysicsDebug } from './PhysicsDebug.js';

/**
 * Engine tunables. GAME_DESIGN §7.1 / tech.md §5 numbers; `config.PHYSICS` (if core adds it) overrides these,
 * `config.PLAYER.stepUp` / `terminalFall` are the actor defaults.
 */
export const PHYSICS_DEFAULTS = PHYSICS;   // config.PHYSICS (core, M2); ctx.config.PHYSICS still overrides per ctx


const _n = new THREE.Vector3();
const _n2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const RAY_DEFAULTS = Object.freeze({ terrain: true, mesh: true, statics: false });
const LOS_DEFAULTS = Object.freeze({ terrain: true, mesh: true, statics: true });
const KIND_NAMES = ['terrain', 'static', 'mesh'];
const TERRAIN = 0, STATIC = 1, MESH = 2;
const SNAP_NONE = 0, SNAP_FLOOR = 1, SNAP_EDGE = 2;
const RIM_RISE = 0.05;           // terrain this far above the feet at the capsule's leading rim counts as "in the way"
/** 16 horizontal unit directions (x, z pairs) for the capsule-rim probes */
const RIM_DIRS = Array.from({ length: 32 }, (_, i) => (i & 1 ? Math.sin : Math.cos)((i >> 1) * Math.PI / 8));

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
    /** raycast / sphereCast / lineOfSight honour `opts.ignore(src)` for static props (requests/camera.md) */
    this.castIgnore = true;
    this._debug = null;
    this._sepStamp = 0;
    this._moved = [];
    this._warnedNaN = false;
    this._waterDeep = undefined;
    /** @type {Map<object, 'ring'|null>} colliders added with addCollider (kept across refreshColliders; dropped by setLevel) */
    this._extra = new Map();
    // per-substep scratch (avoids allocations)
    this._g = { onGround: false, kind: -1, nx: 0, ny: 1, nz: 0, obj: null, bounce: 0, sliding: false };
    this._snNx = 0; this._snNy = 1; this._snNz = 0;
    this._stepNx = 0; this._stepNy = 1; this._stepNz = 0; this._stepObj = null; this._stepKind = -1;
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
    this._extra.clear();
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
  addCollider(c, hint = null) {
    const r = this.statics.add(c, hint);
    if (r) this._extra.set(c, hint);
    this._debug?.rebuild();
    return r;
  }
  removeCollider(c) { this._extra.delete(c); const r = this.statics.remove(c); this._debug?.rebuild(); return r; }
  /** Re-index a collider whose fields you changed (moved door). */
  updateCollider(c) { this.statics.update(c); this._debug?.rebuild(); }
  /**
   * Re-read `level.colliders` after editing its arrays in place (arena fog walls, opened gates). Colliders added with
   * addCollider stay.
   */
  refreshColliders() {
    this.statics.set(this.level?.colliders ?? null);
    for (const [c, hint] of this._extra) if (!this.statics.has(c)) this.statics.add(c, hint);
    this._debug?.rebuild();
  }
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
      const mesh = this.mesh, walk = this.cfg.walkableNormalY;
      let y = fromY + 1e-3;
      for (let k = 0; k < 6 && y > g; k++) {                             // skip steep / downward faces (roofs, undersides)
        const d = mesh.raycast(x, y, z, 0, -1, 0, y - g);
        if (d < 0) break;
        const tri = mesh.rayTri, ny = tri.ds ? Math.abs(tri.ny) : tri.ny;
        if (ny >= walk) { g = Math.max(g, y - d); break; }
        y -= d + 1e-3;
      }
    }
    const s = this.statics.supportAt(x, z, 0, fromY + 1e-3);
    return s > g ? s : g;
  }

  /** Highest walkable surface at (x, z): terrain, prop tops or architecture (bridge decks, causeways). */
  topAt(x, z) {
    let from = this.heightAt(x, z) + 50;
    const ob = this.octree?.bounds;
    if (ob && Number.isFinite(ob.max.y)) from = Math.max(from, ob.max.y + 1);
    return this.groundAt(x, z, from);
  }

  /** Smooth terrain normal (tech.md §5). */
  normalAt(x, z, out = new THREE.Vector3()) { return this.heightfield ? this.heightfield.normalAt(x, z, out) : out.set(0, 1, 0); }

  /**
   * Water surface height at (x, z) or null. From `level.waterLevelAt(x, z)` when the level provides it, else the
   * `level.water` entries (Appendix B.1): { kind: 'stream', from, to | pts, width, y, deep }, { kind: 'rect', at, size } |
   * { minX, maxX, minZ, maxZ }, { kind: 'disc', at, r }, { kind: 'poly', points }, or a plain { y } plane (the whole
   * level wherever the ground is lower). The highest surface wins.
   */
  waterLevelAt(x, z) {
    const lvl = this.level;
    this._waterDeep = undefined;
    if (typeof lvl?.waterLevelAt === 'function') { const y = lvl.waterLevelAt(x, z); return Number.isFinite(y) ? y : null; }
    const list = Array.isArray(lvl?.water) ? lvl.water : null;
    if (!list) return null;
    let best = null;
    for (const w of list) {
      if (!w || !inWater(w, x, z)) continue;
      const y = Number.isFinite(w.y) ? w.y : 0;
      if (best === null || y > best) { best = y; this._waterDeep = w.deep; }
    }
    return best;
  }

  /** Depth of water over the standing surface (feet `y`, or the top surface at x, z); 0 when dry. Sets _waterDeep. */
  _waterDepth(x, z, y) {
    const wy = this.waterLevelAt(x, z);
    if (wy === null) return 0;
    const deepFlag = this._waterDeep;
    const top = Number.isFinite(y) ? y : this.topAt(x, z);
    this._waterDeep = deepFlag;
    const depth = wy - top;
    return depth > 0.05 ? depth : 0;
  }

  /**
   * Deep water (or a pit) at (x, z)? Delegates to `level.isDeepWater(x, z, y)` when the level provides it; else uses
   * `level.water`. With `y` (feet height) the depth is measured from the feet (on a bridge deck or a stepping stone
   * above the surface: dry). Without `y`, from the highest walkable surface there (`topAt`, also what a level function
   * is passed), so bridge decks and causeways over water are dry and the stream bed under open water is deep. A water
   * entry's `deep: true / false` overrides the depth test (config `PHYSICS.deepWater`, 0.5 m).
   */
  isDeepWater(x, z, y) {
    const lvl = this.level;
    // the level's own water test, asked about the surface one would stand on when no feet height is given
    if (typeof lvl?.isDeepWater === 'function') return !!lvl.isDeepWater(x, z, Number.isFinite(y) ? y : this.topAt(x, z));
    const depth = this._waterDepth(x, z, y);
    if (depth <= 0) return false;
    const deep = this._waterDeep;
    return deep === true ? true : deep === false ? false : depth > this.cfg.deepWater;
  }

  /** Wading water (footstep splashes, slow-down): water over the standing surface that isn't deep. */
  isShallowWater(x, z, y) {
    const lvl = this.level;
    if (typeof lvl?.isShallowWater === 'function') return !!lvl.isShallowWater(x, z, Number.isFinite(y) ? y : this.topAt(x, z));
    if (typeof lvl?.isDeepWater === 'function' && typeof lvl?.waterLevelAt !== 'function' && !Array.isArray(lvl?.water)) return false;
    const depth = this._waterDepth(x, z, y);
    if (depth <= 0) return false;
    return !this.isDeepWater(x, z, y);
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
   * Does a sphere (centre `pos`, radius r) touch a solid prop or the architecture? (projectiles: stop on walls and
   * trees; arena fog-wall rings and `ray: false` colliders don't count.)
   * @param {{x:number,y:number,z:number}} pos @param {number} [r] @param {{statics?:boolean, mesh?:boolean}} [opts]
   */
  overlapsStatic(pos, r = 0, opts = LOS_DEFAULTS) {
    if (!pos) return false;
    const x = pos.x, y = pos.y, z = pos.z;
    if (opts.statics !== false && this.statics.overlaps(x, z, r, y - r, y + r, null, true)) return true;
    if (opts.mesh !== false && this.octree && this.mesh.overlapsSphere(x, y, z, r)) return true;
    return false;
  }

  /**
   * Bounce velocity of the surface right under feet (x, y, z) — a prop or mesh with `bounce` (mushroom caps) — or 0.
   * moveActor already applies bounces on landing (sets `actor.bounced`); this is the query form.
   */
  bounceAt(x, z, y) {
    const C = this.cfg;
    const yy = Number.isFinite(y) ? y : this.topAt(x, z);
    const s = this.statics.supportAt(x, z, 0, yy + C.skin);
    let best = s > yy - C.skin - 0.05 ? this.statics.supportBounce : 0;
    if (this.octree) {
      const d = this.mesh.raycast(x, yy + C.skin, z, 0, -1, 0, 2 * C.skin + 0.05);
      if (d >= 0 && this.mesh.rayTri?.bounce > best) best = this.mesh.rayTri.bounce;
    }
    return best;
  }

  /**
   * Ray vs terrain + architecture (+ static props with opts.statics). Returns a shared hit object
   * { distance, point, normal, object, kind: 'terrain'|'mesh'|'static' } or null. Copy what you keep. For props,
   * `object` is the collider description itself (its own fields, e.g. `cam`, come back). `opts.ignore(src) → true`
   * skips a prop (announced by `castIgnore`); `opts.actor` applies per-collider faction filters.
   * @param {THREE.Ray} ray @param {number} [maxDist]
   * @param {{terrain?:boolean, mesh?:boolean, statics?:boolean, actor?:any, ignore?:(src:any)=>boolean}} [opts]
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
      const t = this.statics.raycast(ox, oy, oz, dx, dy, dz, best, radius, opts.actor ?? null, typeof opts.ignore === 'function' ? opts.ignore : null);
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
    if (a.noClip) { p.addScaledVector(v, dt); a.onGround = false; a.sliding = false; a.slideSpeed = 0; a.groundKind = null; return; }

    const flying = !!a.flying;
    // exact for constant acceleration: the step moves by the mean of the vertical velocity before and after gravity
    // (semi-implicit Euler would lose v·dt/2 of every jump: 6 cm of the player's 1.245 m apex)
    let vyBias = 0;
    if (!flying) {
      if (!wasGround || v.y > 0) {
        const vy0 = v.y;
        v.y -= C.gravity * (a.gravityMul ?? 1) * dt;
        const tf = a.terminalFall ?? C.terminalFall;
        if (v.y < -tf) v.y = -tf;
        if (vy0 > v.y) vyBias = (vy0 - v.y) / 2;
      } else if (v.y < 0) v.y = 0;
    }
    const vyG = v.y;

    const r = a.radius ?? 0.35, h = a.height ?? 1, capR = Math.max(0.01, Math.min(r, h * 0.5));
    const maxStep = Math.max(0.02, capR * C.substep);
    const len = Math.hypot(v.x, v.y, v.z) * dt;
    const n = Math.min(C.maxSubsteps, Math.max(1, Math.ceil(len / maxStep)));
    // beyond maxSubsteps × maxStep per step the motion is shortened (never the velocity): no tunnelling at any speed
    const sdt = (dt / n) * (len > n * maxStep ? (n * maxStep) / len : 1);
    const g = this._g;
    let grounded = wasGround && v.y <= 0 && !flying;
    a.sliding = false;
    g.onGround = grounded; g.kind = grounded ? (a.groundKind === 'mesh' ? MESH : a.groundKind === 'static' ? STATIC : TERRAIN) : -1;
    g.nx = a.groundNormal.x; g.ny = a.groundNormal.y; g.nz = a.groundNormal.z; g.obj = a.groundObject ?? null;
    let impact = 0;
    for (let i = 0; i < n; i++) {
      const vyBefore = v.y;
      const vyMove = v.y === vyG ? v.y + vyBias : v.y;                    // (until a contact changes v.y)
      const now = this._substep(a, v.x * sdt, vyMove * sdt, v.z * sdt, grounded, flying, capR, sdt);
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
    if (!a.sliding) a.slideSpeed = 0;
    this.clampToBounds(a);
  }

  /** One sub-step. Returns whether the actor ends it on walkable ground; ground details in this._g. */
  _substep(a, sx, sy, sz, grounded, flying, capR, sdt) {
    const C = this.cfg, p = a.pos, v = a.vel, hf = this.heightfield, mesh = this.mesh, g = this._g;
    const x0 = p.x, y0 = p.y, z0 = p.z;
    const stepUp = flying ? 0 : (a.stepUp ?? C.stepUp);
    const canSnap = grounded && !flying;
    p.x += sx; p.y += sy; p.z += sz;

    // 1. too-steep terrain can't be walked (or slid) up
    //    and a body resting against a cliff face (feet on a walkable facet at its foot) is pushed off it down-slope
    if (hf && !flying) { this._blockSteepTerrain(a, x0, z0, y0); this._pushOffSteep(a, capR); }

    // 2. props: sideways push-out; tops within reach are support. Wedged between props closer together than the
    //    actor is wide (a post beside a crate): cancel this sub-step's sideways move instead of ending up inside one.
    let support = this.statics.resolve(a, y0, grounded ? stepUp : C.skin);
    if (this.statics.stuck) {
      p.x = x0; p.z = z0;
      support = this.statics.resolve(a, y0, grounded ? stepUp : C.skin);
      a.wallHit = true;
    }
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
    let gy = hf ? hf.heightAt(p.x, p.z) : 0, gKind = TERRAIN, gBounce = 0, gObj = null;   // no heightfield: plane y 0
    if (support > gy) { gy = support; gKind = STATIC; gBounce = supportBounce; gObj = supportSrc; }
    if (flying) { if (p.y < gy) p.y = gy; return false; }

    let on = false, kind = -1, nx = 0, ny = 1, nz = 0, bounce = 0, obj = null;
    if (p.y < gy) p.y = gy;
    if (meshFloor) {
      on = true; kind = MESH; nx = mfnx; ny = mfny; nz = mfnz; bounce = mfBounce; obj = mfObj;
    } else if (p.y <= gy + (canSnap ? C.groundSnap : C.skin)) {
      // architecture between us and that ground wins: a floor (walking off a low deck onto terrain) is stood on, and
      // a ledge edge is never snapped through (we roll off it instead)
      // (only while grounded: airborne actors reach here at most `skin` above the ground)
      const snap = this.octree && p.y - gy > C.skin ? this._snapMesh(a, capR, p.y - gy, sdt) : SNAP_NONE;
      if (snap !== SNAP_NONE) {
        on = true; kind = MESH; nx = this._snNx; ny = this._snNy; nz = this._snNz; obj = mesh.sweepTri?.obj ?? null;
      } else {
        const steep = gKind === TERRAIN && hf ? this._terrainSteep(p.x, p.z) : false;
        if (!steep) {
          if (gKind === TERRAIN && hf) hf.normalAt(p.x, p.z, _n); else _n.set(0, 1, 0);   // (smooth: for visuals)
          p.y = gy; on = true; kind = gKind; nx = _n.x; ny = _n.y; nz = _n.z; bounce = gBounce; obj = gObj;
        } else if (p.y <= gy + C.skin) {                                  // too steep: slide down it
          p.y = gy; a.sliding = true; a.groundNormal.copy(_n);
          this._slide(a, sdt);
        }
      }
    } else if (canSnap && this.octree && this._snapMesh(a, capR, C.groundSnap, sdt) !== SNAP_NONE) {
      on = true; kind = MESH; nx = this._snNx; ny = this._snNy; nz = this._snNz; obj = mesh.sweepTri?.obj ?? null;
    }

    if (on) {
      a.sliding = false;
      if (v.y < 0) v.y = 0;
      if (bounce > 0 && !grounded) {                                     // mushroom caps: land → spring up
        v.y = bounce; a.bounced = bounce; on = false;
      }
    }
    if (on) {
      // a step onto / off a prop top or between surfaces: report the height jump so visuals can smooth it
      if (grounded && (kind !== g.kind || obj !== g.obj) && kind !== MESH) { const d = p.y - (y0 + sy); if (d > C.skin || d < -C.skin) a.stepY += d; }
      g.kind = kind; g.nx = nx; g.ny = ny; g.nz = nz; g.obj = obj;
    }
    return on;
  }

  /**
   * Keep a grounded actor on architecture: sweep the capsule's bottom sphere down by up to `maxDown` and move it onto
   * the first thing below. SNAP_FLOOR: a walkable face. SNAP_EDGE: a ledge or step edge under the capsule's rim — it
   * rests on the edge (so it follows the rounded profile down stairs and is never snapped through architecture to the
   * terrain under it) and slips off it at `edgeSlip`. SNAP_NONE: nothing within reach. Normal in _snN*.
   */
  _snapMesh(a, capR, maxDown, sdt) {
    const p = a.pos, mesh = this.mesh;
    const t = mesh.sweepSphere(p.x, p.y + capR, p.z, 0, -1, 0, capR, maxDown);
    if (t < 0 || mesh.sweepNy <= 0.05) return SNAP_NONE;
    p.y -= t;
    if (mesh.sweepNy >= this.cfg.walkableNormalY) {
      this._snNx = mesh.sweepNx; this._snNy = mesh.sweepNy; this._snNz = mesh.sweepNz;
      return SNAP_FLOOR;
    }
    const hl = Math.hypot(mesh.sweepNx, mesh.sweepNz);
    if (hl > 1e-6 && sdt > 0) {
      const k = (this.cfg.edgeSlip * sdt) / hl;
      p.x += mesh.sweepNx * k; p.z += mesh.sweepNz * k;
    }
    this._snNx = 0; this._snNy = 1; this._snNz = 0;
    return SNAP_EDGE;
  }

  /**
   * Capsule vs heightfield: the feet ride the terrain (exact triangles), and the body may not push into terrain steeper
   * than walkable. Two probes remove the uphill part of this sub-step's motion: the smoothed slope under the centre
   * (no walking up a steep hillside) and the exact triangle under the capsule's leading rim when it rises above the
   * feet (no clipping the body into a cliff or bank before the centre reaches it, on any grid resolution).
   */
  _blockSteepTerrain(a, x0, z0, y0) {
    const p = a.pos, hf = this.heightfield;
    const dx = p.x - x0, dz = p.z - z0, dl = Math.hypot(dx, dz);
    if (dl < 1e-9) return;
    // 1. the slope under the centre
    if (hf.heightAt(p.x, p.z) > y0 + 1e-4 && this._terrainSteep(p.x, p.z)) this._removeUphill(a, x0, z0);   // (else airborne / going down)
    // 2. the leading rim
    const r = a.radius ?? 0.35, ex = p.x + (dx / dl) * r, ez = p.z + (dz / dl) * r;
    if (hf.heightAt(ex, ez) - y0 <= RIM_RISE) return;
    if (this._terrainSteep(ex, ez)) this._removeUphill(a, x0, z0);
  }

  /**
   * Capsule rim vs too-steep terrain, for an actor whose feet are not on a too-steep face (those slide instead): the
   * terrain at the capsule's rim may not rise more than RIM_RISE above the feet onto a too-steep face. Otherwise the
   * body would rest against the face and the feet hang on whatever walkable facet the grid leaves at its foot (a 60°
   * bank on a 1 m grid leaves ramps up to ~0.35 m) — a perch to jump from. Pushed off down-slope, horizontally, until
   * the rim clears it: the feet end at the face's foot, as the capsule-shaped body would.
   */
  _pushOffSteep(a, capR) {
    const p = a.pos, hf = this.heightfield, r = Math.max(capR, a.radius ?? capR);
    for (let it = 0; it < 4; it++) {
      const feet = Math.max(p.y, hf.heightAt(p.x, p.z));
      if (this._terrainSteep(p.x, p.z)) return;                          // on the face itself: the slide handles it
      let best = 0, bx = 0, bz = 0;
      for (let i = 0; i < RIM_DIRS.length; i += 2) {
        const qx = p.x + RIM_DIRS[i] * r, qz = p.z + RIM_DIRS[i + 1] * r;
        const ex = hf.heightAt(qx, qz) - feet - RIM_RISE;
        if (ex <= 1e-4 || !this._terrainSteep(qx, qz)) continue;
        const hl = Math.hypot(_n.x, _n.z);
        if (hl < 1e-6) continue;
        const ux = _n.x / hl, uz = _n.z / hl;                            // down-slope (horizontal)
        // the face rises tan(slope) per metre toward the rim sample; pushing s down-slope lowers it by s·tan
        const rate = (-(RIM_DIRS[i] * ux + RIM_DIRS[i + 1] * uz)) * (hl / Math.max(0.05, _n.y));
        if (rate <= 1e-3) continue;
        const s = Math.min(r, ex / rate + 1e-3);
        if (s > best) { best = s; bx = ux; bz = uz; }
      }
      if (best <= 0) return;
      p.x += bx * best; p.z += bz * best;
      const v = a.vel, vin = v.x * bx + v.z * bz;
      if (vin < 0) { v.x -= bx * vin; v.z -= bz * vin; }                 // no velocity into the face
      a.wallHit = true;
    }
  }

  /**
   * Is the terrain at (x, z) too steep to stand on or walk up? The rendered triangle there decides when it is clearly
   * walkable or clearly a cliff (normal.y < walkableNormalY - steepFaceTol); in between, the smoothed slope does (so a
   * lone steepish triangle on walkable ground is no trap, and the smoothed foot of a cliff is no ladder).
   * When steep, `_n` holds the triangle's normal (the slide / push direction).
   */
  _terrainSteep(x, z) {
    const hf = this.heightfield, C = this.cfg;
    hf.faceNormalAt(x, z, _n);
    if (_n.y >= C.walkableNormalY) return false;
    if (_n.y < C.walkableNormalY - C.steepFaceTol) return true;
    return hf.normalAt(x, z, _n2).y < C.walkableNormalY;
  }

  /**
   * On too-steep terrain (normal _n): the velocity into the surface and up the slope is removed, and the actor slides
   * down it at no less than `slideSpeed`, which gravity along the slope builds up. Physics owns that speed, so a
   * controller that sets its velocity straight into the bank every step still slides down (no hanging on a cliff).
   */
  _slide(a, sdt) {
    const C = this.cfg, v = a.vel, nx = _n.x, ny = _n.y, nz = _n.z;
    const vn = v.x * nx + v.y * ny + v.z * nz;
    if (vn < 0) { v.x -= nx * vn; v.y -= ny * vn; v.z -= nz * vn; }
    const s = Math.sqrt(Math.max(1e-9, 1 - ny * ny));                    // sin(slope)
    const dx = (nx * ny) / s, dy = -s, dz = (nz * ny) / s;               // downhill, in the plane
    const vd = v.x * dx + v.y * dy + v.z * dz;
    const tf = a.terminalFall ?? C.terminalFall;
    const want = Math.min(tf, Math.max(0, a.slideSpeed || 0) + C.gravity * (a.gravityMul ?? 1) * s * sdt);
    a.slideSpeed = want;
    if (vd < want) { const k = want - vd; v.x += dx * k; v.y += dy * k; v.z += dz * k; }
    // and it moves down-slope now: a controller that resets its velocity into the bank every step (so the velocity
    // above never gets to act) still loses ground, faster each step, instead of hanging on the face
    const hd = want * sdt * ny;                                          // horizontal share of the slide this sub-step
    const hl = Math.hypot(nx, nz);
    if (hl > 1e-6) { a.pos.x += (nx / hl) * hd; a.pos.z += (nz / hl) * hd; }
  }

  /** Cancel the part of this sub-step's move (and of the velocity) that goes up the slope with normal _n. */
  _removeUphill(a, x0, z0) {
    const hl = Math.hypot(_n.x, _n.z);
    if (hl < 1e-9) return;
    const p = a.pos, ux = -_n.x / hl, uz = -_n.z / hl;                    // uphill
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
    if (t >= 0) {
      // the first thing below: a floor, or the edge of the next step (rest on it and roll over it as we move on);
      // either way nothing below it (terrain under a stair box) may be chosen instead
      // (the contact point itself must be within stepUp: resting on the rim of a taller riser is not a step)
      if (mesh.sweepNy <= 0.05 || p.y - t + capR * (1 - mesh.sweepNy) > y0 + stepUp + 1e-3) { p.set(bx, by, bz); v.set(bvx, bvy, bvz); return false; }
      land = p.y - t; kind = MESH; this._stepObj = mesh.sweepTri?.obj ?? null;
      if (mesh.sweepNy >= C.walkableNormalY) { this._stepNx = mesh.sweepNx; this._stepNy = mesh.sweepNy; this._stepNz = mesh.sweepNz; }
      else { this._stepNx = 0; this._stepNy = 1; this._stepNz = 0; }
    }
    if (hf) { const gy = hf.heightAt(p.x, p.z); if (gy <= p.y + 1e-4 && gy > land) { land = gy; kind = TERRAIN; } }
    const s = this.statics.supportAt(p.x, p.z, a.radius ?? capR, p.y + 1e-4, a);
    if (s > land) { land = s; kind = STATIC; }
    const progress = (p.x - x0) * sx + (p.z - z0) * sz;
    if (kind < 0 || land > y0 + stepUp + 1e-3 || land < y0 - C.groundSnap || progress <= got + 1e-6
        || mesh.penetrates(p.x, land, p.z, capR, h, 0.02)) {
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

  /**
   * Mass-weighted XZ circle separation between live, solid actors (O(n²), n < 40; tech.md §5 item 4). `fixed` actors
   * (Pudding, shield posts, props) never move and push others fully; actors whose height ranges don't overlap (a crow
   * overhead, a kitten on a balcony) are ignored. Every pushed actor is then swept from where it stood through props,
   * architecture and bounds, so a shove never tunnels through a thin wall, and is lifted onto the ground it lands on.
   */
  separateActors() {
    const list = this.ctx?.actors?.list;
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
        let wa, wb;
        if (a.fixed) { wa = 0; wb = 1; }
        else if (b.fixed) { wa = 1; wb = 0; }
        else { const ma = Math.max(1e-3, a.mass ?? 1), mb = Math.max(1e-3, b.mass ?? 1); wa = mb / (ma + mb); wb = ma / (ma + mb); }
        if (wa > 0) {
          if (a._physSep !== stamp) { a._physSep = stamp; a._sepX = a.pos.x; a._sepZ = a.pos.z; moved.push(a); }
          a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
        }
        if (wb > 0) {
          if (b._physSep !== stamp) { b._physSep = stamp; b._sepX = b.pos.x; b._sepZ = b.pos.z; moved.push(b); }
          b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
        }
      }
    }
    for (let i = 0; i < moved.length; i++) this._settle(moved[i]);
    moved.length = 0;
  }

  /**
   * After a separation shove: sweep the actor from its pre-shove spot to where the shove put it, resolving props and
   * architecture each sub-step (no velocity changes), lift it onto the ground there, keep it in bounds.
   */
  _settle(a) {
    const C = this.cfg, p = a.pos;
    const r = a.radius ?? 0.35, capR = Math.max(0.01, Math.min(r, (a.height ?? 1) * 0.5));
    const tx = p.x, tz = p.z, sx = Number.isFinite(a._sepX) ? a._sepX : tx, sz = Number.isFinite(a._sepZ) ? a._sepZ : tz;
    const dx = tx - sx, dz = tz - sz, len = Math.hypot(dx, dz);
    const n = Math.min(C.maxSubsteps, Math.max(1, Math.ceil(len / Math.max(0.02, capR * C.substep))));
    const allowance = a.onGround && !a.flying ? (a.stepUp ?? C.stepUp) : C.skin;
    p.x = sx; p.z = sz;
    let support = -Infinity;
    for (let i = 0; i < n; i++) {
      const px = p.x, pz = p.z;
      p.x += dx / n; p.z += dz / n;
      support = this.statics.resolve(a, p.y, allowance, false);
      if (this.statics.stuck) { p.x = px; p.z = pz; support = this.statics.resolve(a, p.y, allowance, false); break; }
      if (this.octree) this.mesh.resolveCapsule(a, capR, C.walkableNormalY, 0, false);
    }
    const t = this.heightAt(p.x, p.z), ground = support > t ? support : t;
    if (p.y < ground) p.y = ground;
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
  if (kind === 'stream' || (w.from && w.to) || (Array.isArray(w.pts) && w.pts.length > 1)) {
    const pts = Array.isArray(w.pts) && w.pts.length > 1 ? w.pts : null, hw = (w.width ?? 6) / 2;
    const n = pts ? pts.length - 1 : 1;
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts ? pts[i] : w.from, [bx, bz] = pts ? pts[i + 1] : w.to;
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      const dx = x - (ax + vx * t), dz = z - (az + vz * t);
      if (dx * dx + dz * dz <= hw * hw) return true;
    }
    return false;
  }
  if (w.minX !== undefined) return x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ;
  if ((kind === 'rect' || kind === 'box') && w.at && w.size) {
    let dx = x - w.at[0], dz = z - w.at[1];
    if (w.yaw) { const c = Math.cos(w.yaw), s = Math.sin(w.yaw), lx = dx * c - dz * s; dz = dx * s + dz * c; dx = lx; }   // as StaticColliders boxes
    return Math.abs(dx) <= w.size[0] / 2 && Math.abs(dz) <= w.size[1] / 2;
  }
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
