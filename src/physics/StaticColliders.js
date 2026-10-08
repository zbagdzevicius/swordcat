// src/physics/StaticColliders.js  (owner: physics) — static props as vertical prisms in a 4 m spatial hash (tech.md §5).
//
// Accepted collider shapes (plain objects; LevelData.colliders = { circles, boxes, segments?, rings? }, or add() one):
//   circle   { x, z, r, y0?, y1? }                                   trees, rocks, pillars, posts
//   box      { minX, maxX, minZ, maxZ, y0?, y1?, yaw? }              crates, houses, walls (yaw rotates about the centre)
//            { x, z, hx, hz, y0?, y1?, yaw? }  or  { x, z, w, d, ... } centre form
//   segment  { ax, az, bx, bz, r?, y0?, y1? }  or { a:[x,z], b:[x,z] } fences / thin walls (r = half thickness, 0.1)
//   ring     { x, z, r, kind:'ring' | ring:true | inside:true, thickness? }  arena fog walls: a thin circular wall that
//            keeps actors on the side they are on (inside stays inside).
// Optional on every shape: `walkable` (default true: the top at y1 is ground you can stand or step onto; rings never),
//   `bounce` (vy given to an actor landing on the top: mushroom caps), `filter(actor) → bool` / `factions: [...]`
//   (only block those), `ray: false` (raycasts ignore it). y0 / y1 default to ±Infinity.
// Actors are vertical cylinders (radius, height). A collider blocks an actor sideways when their height ranges overlap
// and its top is above what the actor can step onto; otherwise its top supports the actor (cylinder footprint).
// Pure module, no allocations in queries.

const EPS = 1e-4;
const MIN_DEPTH = 1e-6;              // contacts shallower than this are resting, not penetrating
const MAX_PASSES = 4;
const CIRCLE = 0, BOX = 1, RING = 2;
const BIG_CELLS = 4096;              // colliders spanning more hash cells than this live in an always-checked list

/** @typedef {{src:any, kind:number, cx:number, cz:number, r:number, t:number, hx:number, hz:number, c:number, s:number,
 *   y0:number, y1:number, walk:boolean, bounce:number, filter:Function|null, factions:string[]|null, ray:boolean,
 *   minX:number, maxX:number, minZ:number, maxZ:number, stamp:number, hint:'ring'|null}} Rec */

/** Normalise a collider description into an internal record (or null if it has no usable shape). */
export function toRecord(c, hint = null) {
  if (!c || typeof c !== 'object') return null;
  const rec = {
    src: c, kind: CIRCLE, cx: 0, cz: 0, r: 0, t: 0, hx: 0, hz: 0, c: 1, s: 0,
    y0: Number.isFinite(c.y0) ? c.y0 : -Infinity, y1: Number.isFinite(c.y1) ? c.y1 : Infinity,
    walk: c.walkable !== false && c.top !== false, bounce: +c.bounce || 0,
    filter: typeof c.filter === 'function' ? c.filter : null, factions: Array.isArray(c.factions) ? c.factions : null,
    ray: c.ray !== false, minX: 0, maxX: 0, minZ: 0, maxZ: 0, stamp: 0, hint,
  };
  const yaw = +c.yaw || 0;
  if (hint === 'ring' || c.kind === 'ring' || c.ring === true || c.inside === true) {
    if (!(c.r > 0)) return null;
    rec.kind = RING; rec.cx = +c.x || 0; rec.cz = +c.z || 0; rec.r = c.r; rec.t = (c.thickness ?? 0.2) / 2;
    rec.walk = false; rec.ray = c.ray === true;
  } else if (c.ax !== undefined || Array.isArray(c.a)) {
    const ax = c.a ? c.a[0] : c.ax, az = c.a ? c.a[1] : c.az, bx = c.b ? c.b[0] : c.bx, bz = c.b ? c.b[1] : c.bz;
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    rec.kind = BOX; rec.cx = (ax + bx) / 2; rec.cz = (az + bz) / 2;
    rec.hx = c.r ?? (c.width != null ? c.width / 2 : 0.1); rec.hz = len / 2;
    rec.s = len > 1e-9 ? dx / len : 0; rec.c = len > 1e-9 ? dz / len : 1;          // local +Z runs a → b
  } else if (c.minX !== undefined) {
    rec.kind = BOX; rec.cx = (c.minX + c.maxX) / 2; rec.cz = (c.minZ + c.maxZ) / 2;
    rec.hx = Math.abs(c.maxX - c.minX) / 2; rec.hz = Math.abs(c.maxZ - c.minZ) / 2;
    rec.c = Math.cos(yaw); rec.s = Math.sin(yaw);
  } else if (c.hx !== undefined || c.w !== undefined) {
    rec.kind = BOX; rec.cx = +c.x || 0; rec.cz = +c.z || 0;
    rec.hx = c.hx ?? c.w / 2; rec.hz = c.hz ?? (c.d ?? c.w) / 2;
    rec.c = Math.cos(yaw); rec.s = Math.sin(yaw);
  } else if (c.r > 0) {
    rec.kind = CIRCLE; rec.cx = +c.x || 0; rec.cz = +c.z || 0; rec.r = c.r;
  } else return null;
  if (rec.kind === BOX) {
    const ex = Math.abs(rec.c) * rec.hx + Math.abs(rec.s) * rec.hz, ez = Math.abs(rec.s) * rec.hx + Math.abs(rec.c) * rec.hz;
    rec.minX = rec.cx - ex; rec.maxX = rec.cx + ex; rec.minZ = rec.cz - ez; rec.maxZ = rec.cz + ez;
  } else {
    const e = rec.r + rec.t;
    rec.minX = rec.cx - e; rec.maxX = rec.cx + e; rec.minZ = rec.cz - e; rec.maxZ = rec.cz + e;
  }
  return rec;
}

/** Does `rec` apply to actor `a`? */
function applies(rec, a) {
  if (rec.filter && !rec.filter(a)) return false;
  if (rec.factions && !rec.factions.includes(a?.faction)) return false;
  return true;
}

/** XZ overlap of a circle (x, z, r) with a non-ring record (r = 0: point inside). */
function overlapXZ(rec, x, z, r) {
  const dx = x - rec.cx, dz = z - rec.cz;
  if (rec.kind === CIRCLE) { const m = rec.r + r; return dx * dx + dz * dz < m * m; }
  if (rec.kind === BOX) {
    const lx = dx * rec.c - dz * rec.s, lz = dx * rec.s + dz * rec.c;
    const qx = lx < -rec.hx ? -rec.hx : lx > rec.hx ? rec.hx : lx, qz = lz < -rec.hz ? -rec.hz : lz > rec.hz ? rec.hz : lz;
    const ex = lx - qx, ez = lz - qz;
    return r > 0 ? ex * ex + ez * ez < r * r : ex === 0 && ez === 0;
  }
  const d = Math.sqrt(dx * dx + dz * dz);               // ring: within the wall band
  return Math.abs(d - rec.r) < rec.t + r;
}

export class StaticColliders {
  /** @param {number} [cellSize] spatial hash cell (tech.md §5: 4 m) */
  constructor(cellSize = 4) {
    this.cell = cellSize;
    /** Source objects by shape (read-only views; use add/remove to change). */
    this.circles = []; this.boxes = []; this.segments = []; this.rings = [];
    /** @type {Rec[]} */
    this.records = [];
    /** @type {Map<number, Rec[]>} */
    this._grid = new Map();
    /** @type {Rec[]} */
    this._big = [];
    /** @type {Map<any, Rec>} */
    this._bySrc = new Map();
    this._stamp = 0;
    /** @type {Rec[]} */ this._cand = [];
    /** @type {Rec[]} */ this._cand2 = [];
    // outputs of the last resolve()/supportAt()/raycast() (shared; read immediately)
    this.wall = false; this.wallNx = 0; this.wallNz = 0; this.stuck = false;
    this.support = -Infinity; this.supportSrc = null; this.supportBounce = 0;
    this.hitSrc = null; this.hitNx = 0; this.hitNy = 0; this.hitNz = 0;
  }

  get count() { return this.records.length; }

  /** Replace everything with LevelData.colliders ({ circles, boxes, segments?, rings? }) or clear (null). */
  set(colliders) {
    this.clear();
    if (!colliders) return;
    for (const c of colliders.circles ?? []) this.add(c);
    for (const c of colliders.boxes ?? []) this.add(c);
    for (const c of colliders.segments ?? []) this.add(c);
    for (const c of colliders.rings ?? []) this.add(c, 'ring');
  }

  clear() {
    this.circles = []; this.boxes = []; this.segments = []; this.rings = [];
    this.records = []; this._grid.clear(); this._big = []; this._bySrc.clear();
  }

  /**
   * Add one collider (any shape above). Returns the same object (keep it to remove it later), or null if unusable.
   * @param {object} c @param {'ring'|null} [hint]
   */
  add(c, hint = null) {
    if (this._bySrc.has(c)) this.remove(c);
    const rec = toRecord(c, hint);
    if (!rec) return null;
    this.records.push(rec);
    this._bySrc.set(c, rec);
    (rec.kind === RING ? this.rings : rec.kind === CIRCLE ? this.circles : (c.ax !== undefined || c.a ? this.segments : this.boxes)).push(c);
    this._insert(rec);
    return c;
  }

  /** Remove a collider previously added (by the same object). Returns true if it was there. */
  remove(c) {
    const rec = this._bySrc.get(c);
    if (!rec) return false;
    this._bySrc.delete(c);
    const del = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };
    del(this.records, rec);
    for (const arr of [this.circles, this.boxes, this.segments, this.rings]) del(arr, c);
    const bi = this._big.indexOf(rec);
    if (bi >= 0) this._big.splice(bi, 1);
    else this._cells(rec, (key) => { const l = this._grid.get(key); if (l) { del(l, rec); if (!l.length) this._grid.delete(key); } });
    return true;
  }

  /** Re-index a collider whose fields changed (moved door, resized wall). */
  update(c) { const rec = this._bySrc.get(c); if (rec) { this.remove(c); this.add(c, rec.hint); } }

  has(c) { return this._bySrc.has(c); }

  _key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }

  _cells(rec, fn) {
    const k = this.cell;
    const x0 = Math.floor(rec.minX / k), x1 = Math.floor(rec.maxX / k), z0 = Math.floor(rec.minZ / k), z1 = Math.floor(rec.maxZ / k);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(this._key(ix, iz));
  }

  _insert(rec) {
    const k = this.cell;
    const nx = Math.floor(rec.maxX / k) - Math.floor(rec.minX / k) + 1, nz = Math.floor(rec.maxZ / k) - Math.floor(rec.minZ / k) + 1;
    if (!(nx * nz <= BIG_CELLS)) { this._big.push(rec); return; }
    this._cells(rec, (key) => { let l = this._grid.get(key); if (!l) this._grid.set(key, (l = [])); l.push(rec); });
  }

  /**
   * Records whose hash cells touch the XZ rectangle (deduplicated; may include near misses).
   * Writes into `out` (default: a scratch array reused by the next call).
   */
  query(minX, minZ, maxX, maxZ, out = this._cand) {
    out.length = 0;
    const stamp = ++this._stamp, k = this.cell;
    for (let i = 0; i < this._big.length; i++) { const r = this._big[i]; r.stamp = stamp; out.push(r); }
    if (!this._grid.size) return out;
    const x0 = Math.floor(minX / k), x1 = Math.floor(maxX / k), z0 = Math.floor(minZ / k), z1 = Math.floor(maxZ / k);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > this._grid.size) {          // huge query: scan the records instead
      for (const r of this.records) if (r.stamp !== stamp && r.maxX >= minX && r.minX <= maxX && r.maxZ >= minZ && r.minZ <= maxZ) { r.stamp = stamp; out.push(r); }
      return out;
    }
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const l = this._grid.get(this._key(ix, iz));
      if (!l) continue;
      for (let i = 0; i < l.length; i++) { const r = l[i]; if (r.stamp !== stamp) { r.stamp = stamp; out.push(r); } }
    }
    return out;
  }

  /**
   * Push actor `a` (pos = feet, radius, height) sideways out of every blocking collider; remove its inward velocity.
   * Colliders whose walkable top is at or below `max(feetPrev, pos.y) + allowance` don't block: they are support
   * candidates instead (`this.support` = the highest such top under the footprint, `this.supportSrc`, `supportBounce`).
   * Sets `this.wall` (+ `wallNx/Nz`) when something pushed, and `this.stuck` when the push-out did not converge
   * (wedged between props closer together than the actor is wide: the caller cancels the move). Returns `this.support`.
   * @param {any} a actor @param {number} feetPrev feet height before this sub-step's vertical move
   * @param {number} allowance step-up height (grounded) or a small epsilon (airborne)
   * @param {boolean} [zeroVel] also cancel velocity into the contact (default true)
   */
  resolve(a, feetPrev, allowance, zeroVel = true) {
    this.wall = false; this.support = -Infinity; this.supportSrc = null; this.supportBounce = 0;
    if (!this.records.length) return this.support;
    const p = a.pos, r = a.radius ?? 0.35, h = a.height ?? 1;
    const bottom = Math.max(feetPrev, p.y) + allowance;
    const cand = this.query(p.x - r - 0.3, p.z - r - 0.3, p.x + r + 0.3, p.z + r + 0.3);
    let moved = false;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      moved = false;
      for (let i = 0; i < cand.length; i++) {
        const rec = cand[i];
        if (rec.y0 >= p.y + h || !applies(rec, a)) continue;
        if (rec.kind === RING) { if (rec.y1 > p.y && this._pushRing(rec, a, r, zeroVel)) moved = true; continue; }
        if (rec.walk && rec.y1 <= bottom) continue;                 // support, not a wall
        if (rec.y1 <= p.y + EPS) continue;
        if (this._push(rec, a, r, zeroVel)) moved = true;
      }
      if (!moved) break;
    }
    this.stuck = moved;                                             // wedged in a gap narrower than the actor
    this._supportFrom(cand, a, p.x, p.z, r, bottom);
    return this.support;
  }

  _supportFrom(cand, a, x, z, r, maxY) {
    let best = -Infinity, src = null, bounce = 0;
    for (let i = 0; i < cand.length; i++) {
      const rec = cand[i];
      if (!rec.walk || rec.kind === RING || rec.y1 > maxY || rec.y1 <= best || (a && !applies(rec, a))) continue;
      if (overlapXZ(rec, x, z, r)) { best = rec.y1; src = rec.src; bounce = rec.bounce; }
    }
    this.support = best; this.supportSrc = src; this.supportBounce = bounce;
    return best;
  }

  /** Highest walkable top ≤ maxY overlapping the circle (x, z, r); -Infinity if none. Sets `supportSrc`. */
  supportAt(x, z, r = 0, maxY = Infinity, actor = null) {
    if (!this.records.length) { this.support = -Infinity; this.supportSrc = null; this.supportBounce = 0; return -Infinity; }
    const cand = this.query(x - r - 0.05, z - r - 0.05, x + r + 0.05, z + r + 0.05);
    return this._supportFrom(cand, actor, x, z, r, maxY);
  }

  /**
   * First collider (source object) overlapping the circle (x, z, r) within heights [y0, y1], or null.
   * @param {any} [actor] apply per-collider filters for this actor
   * @param {boolean} [solidOnly] skip colliders rays ignore (`ray: false`, fog-wall rings): projectile tests
   */
  overlaps(x, z, r = 0, y0 = -Infinity, y1 = Infinity, actor = null, solidOnly = false) {
    if (!this.records.length) return null;
    const cand = this.query(x - r - 0.05, z - r - 0.05, x + r + 0.05, z + r + 0.05);
    for (let i = 0; i < cand.length; i++) {
      const rec = cand[i];
      if (rec.y0 >= y1 || rec.y1 <= y0 || (actor && !applies(rec, actor)) || (solidOnly && !rec.ray)) continue;
      if (overlapXZ(rec, x, z, r)) return rec.src;
    }
    return null;
  }

  _pushCircleOut(a, nx, nz, depth, zeroVel) {
    const p = a.pos, v = a.vel;
    p.x += nx * depth; p.z += nz * depth;
    if (zeroVel && v) { const vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; } }
    this.wall = true; this.wallNx = nx; this.wallNz = nz;
  }

  _push(rec, a, r, zeroVel) {
    const p = a.pos, dx = p.x - rec.cx, dz = p.z - rec.cz;
    if (rec.kind === CIRCLE) {
      const min = rec.r + r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) return false;
      const d = Math.sqrt(d2);
      if (min - d <= MIN_DEPTH) return false;
      let nx = 1, nz = 0;
      if (d > 1e-6) { nx = dx / d; nz = dz / d; }
      else { const an = ((a.id ?? 0) * 2.399963) % 6.2831853; nx = Math.sin(an); nz = Math.cos(an); }
      this._pushCircleOut(a, nx, nz, min - d, zeroVel);
      return true;
    }
    // oriented box
    const c = rec.c, s = rec.s, hx = rec.hx, hz = rec.hz;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const qx = lx < -hx ? -hx : lx > hx ? hx : lx, qz = lz < -hz ? -hz : lz > hz ? hz : lz;
    let ex = lx - qx, ez = lz - qz;
    const d2 = ex * ex + ez * ez;
    let lnx, lnz, depth;
    if (d2 > 1e-12) {
      if (d2 >= r * r) return false;
      const d = Math.sqrt(d2);
      if (r - d <= MIN_DEPTH) return false;
      lnx = ex / d; lnz = ez / d; depth = r - d;
    } else {                                                       // centre inside: leave by the shallowest face
      const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
      if (px < pz) { lnx = lx >= 0 ? 1 : -1; lnz = 0; depth = px + r; }
      else { lnx = 0; lnz = lz >= 0 ? 1 : -1; depth = pz + r; }
    }
    // local → world: dx = lx*c + lz*s, dz = -lx*s + lz*c
    this._pushCircleOut(a, lnx * c + lnz * s, -lnx * s + lnz * c, depth, zeroVel);
    return true;
  }

  _pushRing(rec, a, r, zeroVel) {
    const p = a.pos, dx = p.x - rec.cx, dz = p.z - rec.cz, d = Math.sqrt(dx * dx + dz * dz);
    const band = r + rec.t;
    if (Math.abs(d - rec.r) >= band || d < 1e-6) return false;
    const nx = dx / d, nz = dz / d;
    if (d < rec.r) {                                               // inside: stay inside
      const target = Math.max(0, rec.r - band);
      if (d - target <= MIN_DEPTH) return false;
      this._pushCircleOut(a, -nx, -nz, d - target, zeroVel);
    } else {
      if (rec.r + band - d <= MIN_DEPTH) return false;
      this._pushCircleOut(a, nx, nz, rec.r + band - d, zeroVel);
    }
    return true;
  }

  /**
   * Ray vs the colliders as solids (circles = vertical cylinders, boxes = oriented boxes; rings only with ray:true).
   * @param {number} inflate grow every shape by this (sphere casts)
   * @param {any} [actor] apply per-collider filters for this actor
   * @param {((src:any) => boolean)|null} [ignore] skip colliders for which this returns true (camera: thin props fade)
   * @returns {number} distance or -1. Sets `hitSrc`, `hitNx/Ny/Nz`.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, inflate = 0, actor = null, ignore = null) {
    this.hitSrc = null;
    if (!this.records.length || !(maxDist > 0)) return -1;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist, m = inflate + 0.01;
    const cand = this.query(Math.min(ox, ex) - m, Math.min(oz, ez) - m, Math.max(ox, ex) + m, Math.max(oz, ez) + m, this._cand2);
    let best = maxDist, found = false;
    for (let i = 0; i < cand.length; i++) {
      const rec = cand[i];
      if (!rec.ray || (actor && !applies(rec, actor)) || (ignore && ignore(rec.src))) continue;
      const t = rec.kind === BOX ? this._rayBox(rec, ox, oy, oz, dx, dy, dz, best, inflate)
        : rec.kind === CIRCLE ? this._rayCyl(rec, ox, oy, oz, dx, dy, dz, best, inflate) : this._rayRing(rec, ox, oy, oz, dx, dy, dz, best);
      if (t >= 0 && t <= best) { best = t; found = true; this.hitSrc = rec.src; this.hitNx = this._nx; this.hitNy = this._ny; this.hitNz = this._nz; }
    }
    return found ? best : -1;
  }

  _rayCyl(rec, ox, oy, oz, dx, dy, dz, maxT, inf) {
    const R = rec.r + inf, y0 = rec.y0 - inf, y1 = rec.y1 + inf, fx = ox - rec.cx, fz = oz - rec.cz;
    const cc = fx * fx + fz * fz - R * R;
    if (cc <= 0 && oy >= y0 && oy <= y1) { this._nx = 0; this._ny = 0; this._nz = 0; return 0; }   // origin inside
    let best = -1;
    const a = dx * dx + dz * dz;
    if (a > 1e-12 && cc > 0) {
      const b = fx * dx + fz * dz, disc = b * b - a * cc;
      if (disc >= 0 && b < 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        if (t >= 0 && t <= maxT) {
          const y = oy + dy * t;
          if (y >= y0 && y <= y1) { best = t; this._nx = (fx + dx * t) / R; this._ny = 0; this._nz = (fz + dz * t) / R; }
        }
      }
    }
    if (Number.isFinite(y1) && dy < -1e-9 && oy > y1) {            // top cap from above
      const t = (y1 - oy) / dy;
      if (t >= 0 && t <= maxT && (best < 0 || t < best)) {
        const px = fx + dx * t, pz = fz + dz * t;
        if (px * px + pz * pz <= R * R) { best = t; this._nx = 0; this._ny = 1; this._nz = 0; }
      }
    }
    return best;
  }

  _rayBox(rec, ox, oy, oz, dx, dy, dz, maxT, inf) {
    const c = rec.c, s = rec.s, fx = ox - rec.cx, fz = oz - rec.cz;
    const lox = fx * c - fz * s, loz = fx * s + fz * c, ldx = dx * c - dz * s, ldz = dx * s + dz * c;
    const hx = rec.hx + inf, hz = rec.hz + inf, y0 = rec.y0 - inf, y1 = rec.y1 + inf;
    let tmin = 0, tmax = maxT, axis = -1, sign = 0;
    // x slab
    if (Math.abs(ldx) < 1e-12) { if (lox < -hx || lox > hx) return -1; }
    else {
      let t1 = (-hx - lox) / ldx, t2 = (hx - lox) / ldx, sg = -1;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dy) < 1e-12) { if (oy < y0 || oy > y1) return -1; }
    else {
      let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy, sg = -1;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(ldz) < 1e-12) { if (loz < -hz || loz > hz) return -1; }
    else {
      let t1 = (-hz - loz) / ldz, t2 = (hz - loz) / ldz, sg = -1;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (axis < 0) { this._nx = 0; this._ny = 0; this._nz = 0; return 0; }   // origin inside
    // normal: sign = -1 means we entered through the min face (normal points -axis)
    let lnx = 0, lnz = 0; this._ny = 0;
    if (axis === 0) lnx = sign; else if (axis === 2) lnz = sign; else this._ny = sign;
    this._nx = lnx * c + lnz * s; this._nz = -lnx * s + lnz * c;
    return tmin;
  }

  _rayRing(rec, ox, oy, oz, dx, dy, dz, maxT) {
    // thin vertical cylinder wall at radius r, hit from either side
    const fx = ox - rec.cx, fz = oz - rec.cz, a = dx * dx + dz * dz;
    if (a < 1e-12) return -1;
    const b = fx * dx + fz * dz, cc = fx * fx + fz * fz - rec.r * rec.r, disc = b * b - a * cc;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    for (const t of [(-b - sq) / a, (-b + sq) / a]) {
      if (t < 0 || t > maxT) continue;
      const y = oy + dy * t;
      if (y < rec.y0 || y > rec.y1) continue;
      const px = fx + dx * t, pz = fz + dz * t, sgn = cc < 0 ? -1 : 1;
      this._nx = (px / rec.r) * sgn; this._ny = 0; this._nz = (pz / rec.r) * sgn;
      return t;
    }
    return -1;
  }
}

export const COLLIDER_KIND = { CIRCLE, BOX, RING };
export { overlapXZ };
