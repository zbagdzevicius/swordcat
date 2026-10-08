// src/physics/MeshCollider.js  (owner: physics) — architecture collision (castle walls, bridges, stairs, ramps, decks):
// triangles from tagged meshes in a three `Octree` (tech.md §5 item 3), queried without allocations.
//
// Sources: Object3Ds whose meshes become collision (Mesh and InstancedMesh; SkinnedMesh is ignored). Per object
// `userData`: `collide: false` skips a mesh, `bounce: vy` makes its top a bounce pad (mushroom caps), and
// `oneWay: true` / a DoubleSide material control sidedness (default: one-sided, front faces only; double-sided
// materials collide from both sides). Invisible proxy meshes (visible = false) are fine and recommended for stairs.
//
// Queries (all results land in fields of this object; read them before the next query):
//   resolveCapsule(actor, r, walkY, skin, zeroVel)   push a vertical capsule out → floor/wall/ceiling contact info
//   penetrates(x, y, z, r, h, tol)                  is a capsule at feet (x, y, z) overlapping anything?
//   sweepSphere(cx, cy, cz, dx, dy, dz, r, maxDist)  first time of impact of a moving sphere (continuous)
//   raycast(ox, oy, oz, dx, dy, dz, maxDist)         nearest triangle hit (double-sided)
import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';

const MAX_TRIS = 250000;

// ---------------------------------------------------------------------- scalar geometry helpers (no allocations)
let _qx = 0, _qy = 0, _qz = 0;            // closest point on a triangle / second segment
let _px = 0, _py = 0, _pz = 0;            // closest point on the first segment

/** Closest point on triangle t to p (Ericson, RTCD 5.1.5). Writes _q*, returns the squared distance. */
function closestPtPointTri(px, py, pz, t) {
  const a = t.a, b = t.b, c = t.c;
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { _qx = a.x; _qy = a.y; _qz = a.z; }
  else {
    const bpx = px - b.x, bpy = py - b.y, bpz = pz - b.z;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { _qx = b.x; _qy = b.y; _qz = b.z; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); _qx = a.x + abx * v; _qy = a.y + aby * v; _qz = a.z + abz * v; }
      else {
        const cpx = px - c.x, cpy = py - c.y, cpz = pz - c.z;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { _qx = c.x; _qy = c.y; _qz = c.z; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); _qx = a.x + acx * w; _qy = a.y + acy * w; _qz = a.z + acz * w; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
              _qx = b.x + (c.x - b.x) * w; _qy = b.y + (c.y - b.y) * w; _qz = b.z + (c.z - b.z) * w;
            } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              _qx = a.x + abx * v + acx * w; _qy = a.y + aby * v + acy * w; _qz = a.z + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - _qx, dy = py - _qy, dz = pz - _qz;
  return dx * dx + dy * dy + dz * dz;
}

/** Closest points between segments p1q1 and p2q2 (Ericson 5.1.9). Writes _p* (seg 1) and _q* (seg 2); returns d². */
function closestSegSeg(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z, d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  _px = p1x + d1x * s; _py = p1y + d1y * s; _pz = p1z + d1z * s;
  _qx = p2x + d2x * t; _qy = p2y + d2y * t; _qz = p2z + d2z * t;
  const dx = _px - _qx, dy = _py - _qy, dz = _pz - _qz;
  return dx * dx + dy * dy + dz * dz;
}

/** Is p (on the plane of t) inside triangle t? (edge tests against the face normal) */
function inTri(t, px, py, pz) {
  const a = t.a, b = t.b, c = t.c, nx = t.nx, ny = t.ny, nz = t.nz, e = -1e-9;
  let ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = px - a.x, vy = py - a.y, vz = pz - a.z;
  if (nx * (uy * vz - uz * vy) + ny * (uz * vx - ux * vz) + nz * (ux * vy - uy * vx) < e) return false;
  ux = c.x - b.x; uy = c.y - b.y; uz = c.z - b.z; vx = px - b.x; vy = py - b.y; vz = pz - b.z;
  if (nx * (uy * vz - uz * vy) + ny * (uz * vx - ux * vz) + nz * (ux * vy - uy * vx) < e) return false;
  ux = a.x - c.x; uy = a.y - c.y; uz = a.z - c.z; vx = px - c.x; vy = py - c.y; vz = pz - c.z;
  if (nx * (uy * vz - uz * vy) + ny * (uz * vx - ux * vz) + nz * (ux * vy - uy * vx) < e) return false;
  return true;
}

let _cnx = 0, _cny = 1, _cnz = 0;          // contact normal of the last capsuleTri (triangle → capsule)

/**
 * Distance from the capsule axis AB to triangle t (≤ reach), with the push-out normal in _cn*. Returns Infinity when
 * farther than `reach` or not applicable (behind a one-sided face). A negative value means the axis pierces the
 * triangle (the push along _cn* needed is r - value).
 */
function capsuleTri(t, ax, ay, az, bx, by, bz, reach) {
  const sA = t.nx * ax + t.ny * ay + t.nz * az - t.w, sB = t.nx * bx + t.ny * by + t.nz * bz - t.w;
  if ((sA > reach && sB > reach) || (sA < -reach && sB < -reach)) return Infinity;
  const mid = sA + sB;
  if (!t.ds && sA < 0 && sB < 0) return Infinity;
  if ((sA > 0 && sB < 0) || (sA < 0 && sB > 0)) {                      // the axis crosses the plane
    const k = sA / (sA - sB), ix = ax + (bx - ax) * k, iy = ay + (by - ay) * k, iz = az + (bz - az) * k;
    if (inTri(t, ix, iy, iz)) {
      if (mid >= 0) { _cnx = t.nx; _cny = t.ny; _cnz = t.nz; return Math.min(sA, sB); }
      if (!t.ds) return Infinity;                                       // mostly behind a one-sided face: pass through
      _cnx = -t.nx; _cny = -t.ny; _cnz = -t.nz; return -Math.max(sA, sB);
    }
  }
  let best = closestPtPointTri(ax, ay, az, t), spx = ax, spy = ay, spz = az, tpx = _qx, tpy = _qy, tpz = _qz;
  let d2 = closestPtPointTri(bx, by, bz, t);
  if (d2 < best) { best = d2; spx = bx; spy = by; spz = bz; tpx = _qx; tpy = _qy; tpz = _qz; }
  const A = t.a, B = t.b, C = t.c;
  d2 = closestSegSeg(ax, ay, az, bx, by, bz, A.x, A.y, A.z, B.x, B.y, B.z);
  if (d2 < best) { best = d2; spx = _px; spy = _py; spz = _pz; tpx = _qx; tpy = _qy; tpz = _qz; }
  d2 = closestSegSeg(ax, ay, az, bx, by, bz, B.x, B.y, B.z, C.x, C.y, C.z);
  if (d2 < best) { best = d2; spx = _px; spy = _py; spz = _pz; tpx = _qx; tpy = _qy; tpz = _qz; }
  d2 = closestSegSeg(ax, ay, az, bx, by, bz, C.x, C.y, C.z, A.x, A.y, A.z);
  if (d2 < best) { best = d2; spx = _px; spy = _py; spz = _pz; tpx = _qx; tpy = _qy; tpz = _qz; }
  if (best >= reach * reach) return Infinity;
  const d = Math.sqrt(best);
  if (d > 1e-7) { _cnx = (spx - tpx) / d; _cny = (spy - tpy) / d; _cnz = (spz - tpz) / d; }
  else if (mid >= 0 || !t.ds) { _cnx = t.nx; _cny = t.ny; _cnz = t.nz; }
  else { _cnx = -t.nx; _cny = -t.ny; _cnz = -t.nz; }
  if (!t.ds && _cnx * t.nx + _cny * t.ny + _cnz * t.nz < -0.01) return Infinity;   // touching from behind
  return d;
}

// ---------------------------------------------------------------------- build scratch
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();

export class MeshCollider {
  constructor() {
    /** @type {Octree|null} three Octree (tech.md §5); null when the level has no architecture */
    this.octree = null;
    /** @type {THREE.Triangle[]} every collision triangle (with extra fields nx,ny,nz,w,minX..maxZ,ds,bounce,obj,stamp) */
    this.triangles = [];
    /** @type {THREE.Object3D[]} */
    this.sources = [];
    this._stamp = 0;
    this._cand = []; this._cand2 = [];
    this._q = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    // ray traversal state
    this._ro = [0, 0, 0]; this._rd = [0, 0, 0]; this._rbest = 0; this._rtri = null;
    // outputs
    this.floor = false; this.floorNx = 0; this.floorNy = 1; this.floorNz = 0; this.floorBounce = 0; this.floorObj = null;
    this.wall = false; this.wallNx = 0; this.wallNy = 0; this.wallNz = 0;
    this.ceiling = false; this.pushed = false;
    this.sweepNx = 0; this.sweepNy = 1; this.sweepNz = 0; this.sweepTri = null;
    this.rayNx = 0; this.rayNy = 1; this.rayNz = 0; this.rayTri = null;
  }

  get empty() { return !this.octree; }

  clear() { this.octree = null; this.triangles = []; this.sources = []; }

  /** Rebuild from a list of source Object3Ds (every eligible mesh below each one collides). */
  build(objects = []) {
    this.clear();
    const seen = new Set();
    for (const root of objects) {
      if (!root?.isObject3D || seen.has(root)) continue;
      seen.add(root);
      this.sources.push(root);
    }
    this._rebuild();
    return this;
  }

  /** Add a source object and rebuild (call once per change, not per frame). */
  add(obj) { if (obj?.isObject3D && !this.sources.includes(obj)) { this.sources.push(obj); this._rebuild(); } return obj; }

  /** Remove a source object and rebuild. */
  remove(obj) { const i = this.sources.indexOf(obj); if (i < 0) return false; this.sources.splice(i, 1); this._rebuild(); return true; }

  /** Rebuild from the current sources (e.g. after moving a collision mesh). */
  rebuild() { this._rebuild(); }

  _rebuild() {
    this.triangles = [];
    this.octree = null;
    for (const root of this.sources) {
      root.updateWorldMatrix(true, true);
      this._collect(root, 0, false);
    }
    if (!this.triangles.length) return;
    const oct = new Octree();
    for (const t of this.triangles) oct.addTriangle(t);
    oct.build();
    this.octree = oct;
  }

  _collect(o, bounce, oneWay) {
    const ud = o.userData ?? {};
    if (ud.collide === false) return;
    if (ud.bounce != null) bounce = +ud.bounce || 0;
    if (ud.oneWay != null) oneWay = !!ud.oneWay;
    if (o.isMesh && !o.isSkinnedMesh && o.geometry?.attributes?.position) this._addMesh(o, bounce, oneWay);
    for (const c of o.children) this._collect(c, bounce, oneWay);
  }

  _addMesh(o, bounce, oneWay) {
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const mat = Array.isArray(o.material) ? o.material : [o.material];
    const ds = !oneWay && mat.some((m) => m && m.side === THREE.DoubleSide);
    const total = idx ? idx.count : pos.count;
    const start = Math.max(0, g.drawRange?.start ?? 0), end = Math.min(total, start + (Number.isFinite(g.drawRange?.count) ? g.drawRange.count : total));
    const instances = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < instances; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, _mi); _m.multiplyMatrices(o.matrixWorld, _mi); } else _m.copy(o.matrixWorld);
      const flip = _m.determinant() < 0;
      for (let i = start; i + 2 < end; i += 3) {
        if (this.triangles.length >= MAX_TRIS) { console.warn(`[physics] collision mesh capped at ${MAX_TRIS} triangles`); return; }
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        _va.fromBufferAttribute(pos, i0).applyMatrix4(_m);
        _vb.fromBufferAttribute(pos, flip ? i2 : i1).applyMatrix4(_m);
        _vc.fromBufferAttribute(pos, flip ? i1 : i2).applyMatrix4(_m);
        this._addTri(_va, _vb, _vc, ds, bounce, o);
      }
    }
  }

  /** Add one world-space triangle (copied). */
  _addTri(a, b, c, ds, bounce, obj) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 1e-10)) return null;                                   // degenerate (or NaN)
    nx /= len; ny /= len; nz /= len;
    const t = new THREE.Triangle(a.clone(), b.clone(), c.clone());
    Object.assign(t, {
      nx, ny, nz, w: nx * a.x + ny * a.y + nz * a.z, ds, bounce, obj, stamp: 0,
      minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minY: Math.min(a.y, b.y, c.y),
      maxY: Math.max(a.y, b.y, c.y), minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z),
    });
    this.triangles.push(t);
    return t;
  }

  // -------------------------------------------------------------------- broad phase
  /** Triangles whose AABB touches the box (deduplicated). Writes into `out` (default scratch). */
  gather(minX, minY, minZ, maxX, maxY, maxZ, out = this._cand) {
    out.length = 0;
    if (!this.octree) return out;
    const q = this._q;
    q.minX = minX; q.minY = minY; q.minZ = minZ; q.maxX = maxX; q.maxY = maxY; q.maxZ = maxZ;
    this._gatherNode(this.octree, out, ++this._stamp);
    return out;
  }

  _gatherLeaf(tris, out, stamp) {
    const q = this._q;
    for (let j = 0; j < tris.length; j++) {
      const t = tris[j];
      if (t.stamp === stamp) continue;
      t.stamp = stamp;
      if (t.maxX >= q.minX && t.minX <= q.maxX && t.maxY >= q.minY && t.minY <= q.maxY && t.maxZ >= q.minZ && t.minZ <= q.maxZ) out.push(t);
    }
  }

  _gatherNode(node, out, stamp) {
    if (node.triangles.length) this._gatherLeaf(node.triangles, out, stamp);
    const subs = node.subTrees, q = this._q;
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i], b = s.box;
      if (b.min.x > q.maxX || b.max.x < q.minX || b.min.y > q.maxY || b.max.y < q.minY || b.min.z > q.maxZ || b.max.z < q.minZ) continue;
      if (s.triangles.length) this._gatherLeaf(s.triangles, out, stamp);
      else this._gatherNode(s, out, stamp);
    }
  }

  // -------------------------------------------------------------------- capsule
  /**
   * Push the actor's vertical capsule (feet at a.pos, radius r, height a.height) out of the mesh.
   * Walkable contacts (normal.y ≥ walkY) push straight up (no sliding back down ramps); walls and steep faces push
   * sideways only (no climbing); ceilings push along their normal. Contacts within `skin` count as touching.
   * Outputs: floor (+ floorN*, floorBounce, floorObj), wall (+ wallN*), ceiling, pushed.
   * @param {boolean} zeroVel cancel the velocity into each contact (false for probes / settling)
   */
  resolveCapsule(a, r, walkY, skin, zeroVel = true) {
    this.floor = false; this.wall = false; this.ceiling = false; this.pushed = false; this.floorBounce = 0; this.floorObj = null;
    if (!this.octree) return false;
    const p = a.pos, v = a.vel, h = Math.max(a.height ?? 1, 2 * r), lo = r, hi = h - r, reach = r + skin, m = reach + 0.05;
    const cand = this.gather(p.x - m, p.y - m + lo, p.z - m, p.x + m, p.y + hi + m, p.z + m, this._cand2);
    if (!cand.length) return false;
    let bestFloorY = -1;
    for (let iter = 0; iter < 4; iter++) {
      let any = false;
      for (let i = 0; i < cand.length; i++) {
        const t = cand[i];
        const d = capsuleTri(t, p.x, p.y + lo, p.z, p.x, p.y + hi, p.z, reach);
        if (d === Infinity) continue;
        const nx = _cnx, ny = _cny, nz = _cnz, depth = r - d;
        if (ny >= walkY) {                                               // floor (walkable)
          if (depth > 1e-5) { p.y += depth / ny; any = true; }
          this.floor = true;
          if (ny > bestFloorY) { bestFloorY = ny; this.floorNx = nx; this.floorNy = ny; this.floorNz = nz; this.floorBounce = t.bounce || 0; this.floorObj = t.obj; }
          if (zeroVel && v && v.y < 0) v.y = 0;
        } else if (ny <= -0.2) {                                         // ceiling / overhang
          if (depth <= 1e-5) continue;
          p.x += nx * depth; p.y += ny * depth; p.z += nz * depth; any = true; this.ceiling = true;
          if (zeroVel && v) { const vn = v.x * nx + v.y * ny + v.z * nz; if (vn < 0) { v.x -= nx * vn; v.y -= ny * vn; v.z -= nz * vn; } }
        } else {                                                         // wall or too-steep slope: sideways only
          if (depth <= 1e-5) continue;
          const hl2 = nx * nx + nz * nz, k = depth / hl2;
          p.x += nx * k; p.z += nz * k; any = true;
          this.wall = true; this.wallNx = nx; this.wallNy = ny; this.wallNz = nz;
          if (zeroVel && v) {
            const vn = v.x * nx + v.y * ny + v.z * nz;
            if (vn < 0) {
              const ty = v.y - ny * vn;
              if (ty > 0 && ny > 0) {                                    // don't gain height from pushing into a slope
                const hl = Math.sqrt(hl2), hx = nx / hl, hz = nz / hl, vh = v.x * hx + v.z * hz;
                if (vh < 0) { v.x -= hx * vh; v.z -= hz * vh; }
              } else { v.x -= nx * vn; v.y = ty; v.z -= nz * vn; }
            }
          }
        }
      }
      if (any) this.pushed = true; else break;
    }
    return this.pushed;
  }

  /** Is a capsule with feet at (x, y, z) overlapping the mesh by more than `tol`? */
  penetrates(x, y, z, r, h, tol = 1e-3) {
    if (!this.octree) return false;
    h = Math.max(h, 2 * r);
    const m = r + 0.05, cand = this.gather(x - m, y - 0.05, z - m, x + m, y + h + 0.05, z + m, this._cand2);
    for (let i = 0; i < cand.length; i++) {
      const d = capsuleTri(cand[i], x, y + r, z, x, y + h - r, z, r);
      if (d !== Infinity && r - d > tol) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------- swept sphere (continuous)
  /**
   * Time of impact of a sphere (centre c, radius r) moving along unit direction d for up to maxDist.
   * Starting overlaps count only when the contact opposes the motion (returns 0). Returns -1 for no hit.
   * Outputs: sweepN* (contact normal, triangle → sphere), sweepTri.
   */
  sweepSphere(cx, cy, cz, dx, dy, dz, r, maxDist) {
    this.sweepTri = null;
    if (!this.octree || !(maxDist >= 0)) return -1;
    const ex = cx + dx * maxDist, ey = cy + dy * maxDist, ez = cz + dz * maxDist, m = r + 0.01;
    const cand = this.gather(Math.min(cx, ex) - m, Math.min(cy, ey) - m, Math.min(cz, ez) - m, Math.max(cx, ex) + m, Math.max(cy, ey) + m, Math.max(cz, ez) + m);
    let best = maxDist, found = false;
    for (let i = 0; i < cand.length; i++) {
      const t = this._sweepTri(cand[i], cx, cy, cz, dx, dy, dz, r, best);
      if (t >= 0 && t <= best) { best = t; found = true; this.sweepTri = cand[i]; this.sweepNx = this._snx; this.sweepNy = this._sny; this.sweepNz = this._snz; }
    }
    return found ? best : -1;
  }

  _sweepTri(t, cx, cy, cz, dx, dy, dz, r, maxT) {
    let nx = t.nx, ny = t.ny, nz = t.nz, s0 = nx * cx + ny * cy + nz * cz - t.w;
    if (s0 < 0) { if (!t.ds) return -1; nx = -nx; ny = -ny; nz = -nz; s0 = -s0; }
    const nd = nx * dx + ny * dy + nz * dz;
    if (s0 > r && nd >= 0) return -1;                                   // in front and moving away / parallel
    if (s0 - r > -nd * maxT + 1e-9 && s0 > r) return -1;                // can't reach the plane in time
    // starting overlap?
    const d2 = closestPtPointTri(cx, cy, cz, t);
    if (d2 < r * r - 1e-9) {
      const d = Math.sqrt(d2);
      let ox, oy, oz;
      if (d > 1e-7) { ox = (cx - _qx) / d; oy = (cy - _qy) / d; oz = (cz - _qz) / d; } else { ox = nx; oy = ny; oz = nz; }
      if (ox * dx + oy * dy + oz * dz < -1e-6) { this._snx = ox; this._sny = oy; this._snz = oz; return 0; }
      return -1;
    }
    let best = Infinity;
    // face
    if (nd < -1e-12) {
      const tf = (s0 - r) / -nd;
      if (tf >= 0 && tf <= maxT) {
        const px = cx + dx * tf - nx * r, py = cy + dy * tf - ny * r, pz = cz + dz * tf - nz * r;
        if (inTri(t, px, py, pz)) { this._snx = nx; this._sny = ny; this._snz = nz; return tf; }
      }
    }
    // edges
    const A = t.a, B = t.b, C = t.c;
    best = this._sweepEdge(A, B, cx, cy, cz, dx, dy, dz, r, Math.min(best, maxT), best);
    best = this._sweepEdge(B, C, cx, cy, cz, dx, dy, dz, r, Math.min(best, maxT), best);
    best = this._sweepEdge(C, A, cx, cy, cz, dx, dy, dz, r, Math.min(best, maxT), best);
    // vertices
    best = this._sweepVert(A, cx, cy, cz, dx, dy, dz, r, Math.min(best, maxT), best);
    best = this._sweepVert(B, cx, cy, cz, dx, dy, dz, r, Math.min(best, maxT), best);
    best = this._sweepVert(C, cx, cy, cz, dx, dy, dz, r, Math.min(best, maxT), best);
    if (best === Infinity) return -1;
    if (!t.ds && this._snx * t.nx + this._sny * t.ny + this._snz * t.nz < -0.01) return -1;
    return best;
  }

  _sweepEdge(P, Q, cx, cy, cz, dx, dy, dz, r, maxT, best) {
    const ex = Q.x - P.x, ey = Q.y - P.y, ez = Q.z - P.z, ee = ex * ex + ey * ey + ez * ez;
    if (ee < 1e-12) return best;
    const mx = cx - P.x, my = cy - P.y, mz = cz - P.z, me = (mx * ex + my * ey + mz * ez) / ee, de = (dx * ex + dy * ey + dz * ez) / ee;
    // perpendicular parts: M = m - me*e, D = d - de*e
    const Mx = mx - me * ex, My = my - me * ey, Mz = mz - me * ez, Dx = dx - de * ex, Dy = dy - de * ey, Dz = dz - de * ez;
    const a = Dx * Dx + Dy * Dy + Dz * Dz;
    if (a < 1e-12) return best;
    const b = Mx * Dx + My * Dy + Mz * Dz, c = Mx * Mx + My * My + Mz * Mz - r * r;
    if (c < 0) return best;                                              // already inside the infinite cylinder
    const disc = b * b - a * c;
    if (disc < 0) return best;
    const tt = (-b - Math.sqrt(disc)) / a;
    if (tt < 0 || tt > maxT || tt >= best) return best;
    const s = me + de * tt;
    if (s < 0 || s > 1) return best;
    const hx = cx + dx * tt, hy = cy + dy * tt, hz = cz + dz * tt, px = P.x + ex * s, py = P.y + ey * s, pz = P.z + ez * s;
    this._snx = (hx - px) / r; this._sny = (hy - py) / r; this._snz = (hz - pz) / r;
    return tt;
  }

  _sweepVert(V, cx, cy, cz, dx, dy, dz, r, maxT, best) {
    const mx = cx - V.x, my = cy - V.y, mz = cz - V.z;
    const b = mx * dx + my * dy + mz * dz, c = mx * mx + my * my + mz * mz - r * r;
    if (c < 0 || b >= 0) return best;
    const disc = b * b - c;
    if (disc < 0) return best;
    const tt = -b - Math.sqrt(disc);
    if (tt < 0 || tt > maxT || tt >= best) return best;
    this._snx = (mx + dx * tt) / r; this._sny = (my + dy * tt) / r; this._snz = (mz + dz * tt) / r;
    return tt;
  }

  // -------------------------------------------------------------------- ray
  /**
   * Nearest triangle hit (double-sided) along a unit-direction ray within maxDist; -1 if none.
   * Outputs: rayN* (facing the ray origin), rayTri (with .obj = the source mesh).
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    this.rayTri = null;
    if (!this.octree || !(maxDist > 0)) return -1;
    const o = this._ro, d = this._rd;
    o[0] = ox; o[1] = oy; o[2] = oz; d[0] = dx; d[1] = dy; d[2] = dz;
    this._rbest = maxDist; this._rtri = null;
    this._rayNode(this.octree, ++this._stamp);
    const t = this._rtri;
    if (!t) return -1;
    let nx = t.nx, ny = t.ny, nz = t.nz;
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    this.rayTri = t; this.rayNx = nx; this.rayNy = ny; this.rayNz = nz;
    return this._rbest;
  }

  _rayBoxT(b) {
    const o = this._ro, d = this._rd;
    let t0 = 0, t1 = this._rbest;
    for (let k = 0; k < 3; k++) {
      const mn = k === 0 ? b.min.x : k === 1 ? b.min.y : b.min.z, mx = k === 0 ? b.max.x : k === 1 ? b.max.y : b.max.z;
      if (Math.abs(d[k]) < 1e-12) { if (o[k] < mn || o[k] > mx) return false; continue; }
      let a = (mn - o[k]) / d[k], c = (mx - o[k]) / d[k];
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) return false;
    }
    return true;
  }

  _rayTris(tris, stamp) {
    const o = this._ro, d = this._rd;
    for (let j = 0; j < tris.length; j++) {
      const t = tris[j];
      if (t.stamp === stamp) continue;
      t.stamp = stamp;
      // Möller–Trumbore, double-sided
      const A = t.a, e1x = t.b.x - A.x, e1y = t.b.y - A.y, e1z = t.b.z - A.z, e2x = t.c.x - A.x, e2y = t.c.y - A.y, e2z = t.c.z - A.z;
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, sx = o[0] - A.x, sy = o[1] - A.y, sz = o[2] - A.z;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt >= 0 && tt < this._rbest) { this._rbest = tt; this._rtri = t; }
    }
  }

  _rayNode(node, stamp) {
    if (node.triangles.length) this._rayTris(node.triangles, stamp);
    const subs = node.subTrees;
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      if (!this._rayBoxT(s.box)) continue;
      if (s.triangles.length) this._rayTris(s.triangles, stamp);
      else this._rayNode(s, stamp);
    }
  }

  /** Flat world-space line list of every triangle edge (debug drawing). */
  edgePositions() {
    const out = new Float32Array(this.triangles.length * 18);
    let k = 0;
    for (const t of this.triangles) {
      for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { out[k++] = p.x; out[k++] = p.y; out[k++] = p.z; out[k++] = q.x; out[k++] = q.y; out[k++] = q.z; }
    }
    return out;
  }
}

/** Test helpers (pure math) — exported for unit tests. */
export const _internal = { closestPtPointTri, closestSegSeg, capsuleTri, inTri, get contactNormal() { return [_cnx, _cny, _cnz]; } };
