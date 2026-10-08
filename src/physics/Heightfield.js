// src/physics/Heightfield.js  (owner: physics) — terrain height grid (tech.md §5).
// Public data class: world/LevelKit builds one per level; physics, camera and AI query it.
//
// Layout (frozen): `h` is a Float32Array((res+1)^2), row-major, row 0 at z = -size/2, column 0 at x = -size/2,
// centred on the origin. `toGeometry()` builds the matching render mesh (PlaneGeometry rotated -90° about X has the
// same vertex order), and `heightAt` interpolates **the same two triangles per cell that mesh draws** (diagonal from
// (ix, iz+1) to (ix+1, iz)), so feet, shadows and raycasts sit exactly on the rendered ground.
// Pure module (three math only): no DOM, node-safe, no allocations in queries.
import * as THREE from 'three';

export class Heightfield {
  /**
   * @param {number} size world metres per side (centred on the origin)
   * @param {number} res cells per side
   * @param {Float32Array} [h] (res+1)^2 heights, row-major, row 0 at z = -size/2
   */
  constructor(size, res, h = new Float32Array((res + 1) * (res + 1))) {
    Object.assign(this, { size, res, h, cell: size / res, half: size / 2 });
  }

  /** Build from a function (x, z) → height. */
  static fromFunction(size, res, fn) {
    const w = res + 1, h = new Float32Array(w * w), cell = size / res, half = size / 2;
    for (let iz = 0; iz < w; iz++) for (let ix = 0; ix < w; ix++) h[iz * w + ix] = fn(ix * cell - half, iz * cell - half);
    return new Heightfield(size, res, h);
  }

  /** Vertices per side (res + 1). */
  get width() { return this.res + 1; }

  /** Height of grid vertex (ix, iz) (indices clamped). */
  vertex(ix, iz) {
    const r = this.res;
    ix = ix < 0 ? 0 : ix > r ? r : ix | 0; iz = iz < 0 ? 0 : iz > r ? r : iz | 0;
    return this.h[iz * (r + 1) + ix];
  }

  /** Set grid vertex (ix, iz) (ignored outside the grid). Rebuild any render mesh yourself. */
  setVertex(ix, iz, y) {
    const r = this.res;
    if (ix < 0 || iz < 0 || ix > r || iz > r) return;
    this.h[iz * (r + 1) + ix] = y;
  }

  /** Is (x, z) on the grid? (Outside it, heights extend the border.) */
  contains(x, z, margin = 0) {
    const m = this.half - margin;
    return x >= -m && x <= m && z >= -m && z <= m;
  }

  /** Ground height at (x, z): exact on the rendered triangles; positions off the grid clamp to the border. */
  heightAt(x, z) {
    const r = this.res, w = r + 1, h = this.h;
    let gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    gx = gx > 0 ? (gx < r ? gx : r) : 0;                 // also maps NaN → 0
    gz = gz > 0 ? (gz < r ? gz : r) : 0;
    let ix = Math.floor(gx), iz = Math.floor(gz);
    if (ix > r - 1) ix = r - 1;
    if (iz > r - 1) iz = r - 1;
    const u = gx - ix, v = gz - iz, i = iz * w + ix;
    const h00 = h[i], h10 = h[i + 1], h01 = h[i + w], h11 = h[i + w + 1];
    return u + v <= 1
      ? h00 + (h10 - h00) * u + (h01 - h00) * v
      : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  /** Smooth surface normal (central differences over ±1 cell; tech.md §5). Use for slope tests. */
  normalAt(x, z, out) {
    const e = this.cell;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }

  /** Exact normal of the rendered triangle under (x, z). */
  faceNormalAt(x, z, out) {
    const r = this.res, w = r + 1, h = this.h, c = this.cell;
    let gx = (x + this.half) / c, gz = (z + this.half) / c;
    gx = gx > 0 ? (gx < r ? gx : r) : 0;
    gz = gz > 0 ? (gz < r ? gz : r) : 0;
    let ix = Math.floor(gx), iz = Math.floor(gz);
    if (ix > r - 1) ix = r - 1;
    if (iz > r - 1) iz = r - 1;
    const i = iz * w + ix, h00 = h[i], h10 = h[i + 1], h01 = h[i + w], h11 = h[i + w + 1];
    // slopes dh/dx, dh/dz of the active triangle
    const sx = (gx - ix) + (gz - iz) <= 1 ? (h10 - h00) / c : (h11 - h01) / c;
    const sz = (gx - ix) + (gz - iz) <= 1 ? (h01 - h00) / c : (h11 - h10) / c;
    return out.set(-sx, 1, -sz).normalize();
  }

  /** { min, max } height over the whole grid. */
  range() {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < this.h.length; i++) { const y = this.h[i]; if (y < min) min = y; if (y > max) max = y; }
    return { min, max };
  }

  /**
   * Exact ray vs the triangulated surface (2D DDA over cells; the height along the ray is piecewise linear
   * inside a cell, so no refinement is needed). Only the grid area is tested.
   * @param {number} ox @param {number} oy @param {number} oz origin
   * @param {number} dx @param {number} dy @param {number} dz direction (unit length; t is in metres)
   * @param {number} maxDist
   * @returns {number} distance to the first hit, 0 if the origin is under the ground, or -1
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const half = this.half, cell = this.cell, r = this.res;
    // clip [0, maxDist] to the grid rectangle (slabs on x and z)
    let t0 = 0, t1 = maxDist;
    if (Math.abs(dx) < 1e-12) { if (ox < -half || ox > half) return -1; }
    else {
      let a = (-half - ox) / dx, b = (half - ox) / dx;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
    }
    if (Math.abs(dz) < 1e-12) { if (oz < -half || oz > half) return -1; }
    else {
      let a = (-half - oz) / dz, b = (half - oz) / dz;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
    }
    if (t0 > t1) return -1;
    let fa = oy + dy * t0 - this.heightAt(ox + dx * t0, oz + dz * t0);
    if (fa <= 0) return t0 === 0 ? 0 : t0;

    // DDA in grid space
    const gx0 = (ox + dx * t0 + half) / cell, gz0 = (oz + dz * t0 + half) / cell;
    let ix = Math.min(r - 1, Math.max(0, Math.floor(gx0))), iz = Math.min(r - 1, Math.max(0, Math.floor(gz0)));
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) < 1e-12 ? Infinity : cell / Math.abs(dx);
    const tdz = Math.abs(dz) < 1e-12 ? Infinity : cell / Math.abs(dz);
    let tmx = Math.abs(dx) < 1e-12 ? Infinity : ((ix + (dx > 0 ? 1 : 0)) * cell - half - ox) / dx;
    let tmz = Math.abs(dz) < 1e-12 ? Infinity : ((iz + (dz > 0 ? 1 : 0)) * cell - half - oz) / dz;
    let ta = t0;
    for (let guard = 0; guard < 4 * (r + 2); guard++) {
      const tb = Math.min(tmx, tmz, t1);
      // the diagonal u + v = 1 of this cell: (gx - ix) + (gz - iz) = 1
      if (Math.abs(dx + dz) > 1e-12) {
        const td = ((ix + iz + 1) * cell - 2 * half - ox - oz) / (dx + dz);
        if (td > ta && td < tb) {
          const fd = oy + dy * td - this.heightAt(ox + dx * td, oz + dz * td);
          if (fd <= 0) return ta + (td - ta) * (fa / (fa - fd));
          ta = td; fa = fd;
        }
      }
      const fb = oy + dy * tb - this.heightAt(ox + dx * tb, oz + dz * tb);
      if (fb <= 0) return ta + (tb - ta) * (fa / (fa - fb));
      ta = tb; fa = fb;
      if (tb >= t1) return -1;
      if (tmx < tmz) { ix += stepX; tmx += tdx; } else { iz += stepZ; tmz += tdz; }
      if (ix < 0 || iz < 0 || ix >= r || iz >= r) return -1;
    }
    return -1;
  }

  /** Matching render mesh: PlaneGeometry vertex order == heightfield order after rotateX(-PI/2). */
  toGeometry() {
    const g = new THREE.PlaneGeometry(this.size, this.size, this.res, this.res); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, this.h[i]);
    g.computeVertexNormals(); return g;
  }
}
