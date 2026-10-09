// src/world/Terrain.js  (owner: world) — GAME_DESIGN §12.1 / art.md §9.4: seeded fbm heightfield with the spine
// path carved (smoothed over 3 m), flat discs (spawns, arenas r + 2), stream beds and keep-height overrides
// (bridge decks); a paint layer (ground colour, grass density / height / dryness) that setpieces stamp into; and
// the outputs: physics/Heightfield, the vertex-coloured ground mesh (Lambert + world-space detail noise + height
// fog) and the RGBA half-float "ground data" texture the grass shader samples (R height, G density, B height mul,
// A dryness). Node-safe except finalize(), which only builds three objects (no DOM).
import * as THREE from 'three';
import { Heightfield } from '../physics/Heightfield.js';
import { fbmP, valueNoise, smooth, distToPolyline, smoothPolyline } from './noise.js';

/** Ground palette (art.md §6.2 misty meadow tokens, darkened under the grass so sparse blades read as full). */
export const GROUND = {
  meadow: { root: '#28311A', mid: '#36421F', dry: '#545335', path: '#625D44', pathDark: '#4C4835', soil: '#3A3220', mud: '#2F2A1E', field: '#4A4A2A' },
  forest: { root: '#22301C', mid: '#2F4A2A', dry: '#4E5232', path: '#5E4E38', pathDark: '#463A2A', soil: '#30281C', mud: '#262018', field: '#3A4226' },
  town:   { root: '#3E4228', mid: '#56583A', dry: '#7A7656', path: '#9C927C', pathDark: '#7A725E', soil: '#4A4030', mud: '#3A3226', field: '#5A5A3A' },
  gate:   { root: '#33372A', mid: '#4A4E3C', dry: '#6A6A52', path: '#7C786C', pathDark: '#5E5A50', soil: '#3E382C', mud: '#2E2A22', field: '#4A4A38' },
  bog:    { root: '#262E1C', mid: '#34402A', dry: '#505436', path: '#5A4C38', pathDark: '#43392A', soil: '#2C2618', mud: '#221E16', field: '#3A4028' },
  keep:   { root: '#2A2628', mid: '#3A3638', dry: '#4E4A4A', path: '#5A5658', pathDark: '#444042', soil: '#2E2A28', mud: '#221E1E', field: '#363234' },
};

const _a = new THREE.Color(), _c = new THREE.Color();

/**
 * Distance (m) from every grid vertex to a polyline, clamped to `maxD` (rasterised per segment inside its
 * bounding box + maxD: ~100× cheaper than a polyline query per vertex). Pure.
 * @returns {Float32Array} (res+1)² row-major, row 0 at z = −size/2
 */
export function polylineDistanceGrid(pts, size, res, maxD) {
  const W = res + 1, cell = size / res, half = size / 2, out = new Float32Array(W * W).fill(maxD * maxD);
  for (let s = 0; s < pts.length - 1; s++) {
    const ax = pts[s][0], az = pts[s][1], bx = pts[s + 1][0], bz = pts[s + 1][1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - maxD + half) / cell)), i1 = Math.min(res, Math.ceil((Math.max(ax, bx) + maxD + half) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - maxD + half) / cell)), j1 = Math.min(res, Math.ceil((Math.max(az, bz) + maxD + half) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = j * cell - half, row = j * W;
      for (let i = i0; i <= i1; i++) {
        const x = i * cell - half;
        let t = ((x - ax) * vx + (z - az) * vz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - vx * t, dz = z - az - vz * t, d2 = dx * dx + dz * dz;
        if (d2 < out[row + i]) out[row + i] = d2;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(out[i]);
  return out;
}

export class Terrain {
  /**
   * @param {object} def level definition (size, res, seed, hills, spine, pathWidth, paths, water, keep, rim, biome)
   * @param {{flats?: {x:number,z:number,r:number}[]}} [opts]
   */
  constructor(def, { flats = [] } = {}) {
    this.def = def;
    this.size = def.size ?? 200; this.res = def.res ?? 128;
    this.half = this.size / 2; this.cell = this.size / this.res; this.W = this.res + 1;
    this.seed = (def.seed ?? 1) | 0;
    this.amp = def.hills?.amp ?? 1;
    this.octaves = def.hills?.octaves ?? 3;
    this.freq = def.hills?.freq ?? 0.022;
    this.pathWidth = def.pathWidth ?? 6;
    this.spine = smoothPolyline(def.spine ?? [[0, -this.half + 10], [0, this.half - 10]], 2);
    /** extra paths: [{ pts, width }] (smoothed) */
    this.paths = (def.paths ?? []).map((p) => ({ pts: smoothPolyline(p.pts, 1.5), width: p.width ?? 3 }));
    this.flats = flats;
    this.water = (def.water ?? []).filter((w) => !w.kind || w.kind === 'stream');   // planes / rects don't carve
    this.keep = def.keep ?? [];          // [{ box:[x0,z0,x1,z1], h }] keep-height overrides (bridge decks)
    this.palette = GROUND[def.biome ?? def.id] ?? GROUND.meadow;
    const n = this.W * this.W;
    this.density = new Float32Array(n).fill(1);
    this.hmul = new Float32Array(n).fill(1);
    this.dry = new Float32Array(n);
    /** rgb + weight overrides painted by setpieces */
    this.paint = new Float32Array(n * 4);
    this.heightfield = null;
  }

  /** Low-frequency height the path follows (gentle rolls along the lane). */
  pathHeight(x, z) { return this.amp * 0.35 * fbmP(x, z, 0.012, 2, this.seed + 7); }

  /** Natural (uncarved) height. */
  rawHeight(x, z) {
    const n = fbmP(x, z, this.freq, this.octaves, this.seed);
    const ridge = 1 - Math.abs(fbmP(x + 311, z - 97, this.freq * 0.6, 2, this.seed + 3));
    let h = this.amp * (n * 1.1 + (ridge - 0.5) * 0.5);
    const rim = this.def.rim ?? 5;                          // the land rises toward the misty edge of the world
    if (rim) { const e = Math.max(Math.abs(x), Math.abs(z)); h += rim * smooth(this.half - (this.def.rimWidth ?? 22), this.half + 4, e) * (0.6 + 0.4 * valueNoise(x * 0.05, z * 0.05, this.seed + 11)); }
    return h;
  }

  /** Final carved height at (x, z): path, extra paths, flat discs, water beds, keep-height boxes. */
  heightFn(x, z, vi = -1) {
    let h = this.rawHeight(x, z);
    const pw = this.pathWidth * 0.5;
    const dp = vi >= 0 && this._dSpine ? this._dSpine[vi] : distToPolyline(x, z, this.spine);
    if (dp < pw + 3) h = h + (this.pathHeight(x, z) - h) * (1 - smooth(pw, pw + 3, dp));
    for (let k = 0; k < this.paths.length; k++) {
      const p = this.paths[k];
      const d = vi >= 0 && this._dPaths ? this._dPaths[k][vi] : distToPolyline(x, z, p.pts);
      if (d < p.width * 0.5 + 2.5) h = h + (this.pathHeight(x, z) - h) * (1 - smooth(p.width * 0.5, p.width * 0.5 + 2.5, d)) * 0.85;
    }
    for (const f of this.flats) {
      const dx = x - f.x, dz = z - f.z, R = f.r + 3;
      if (dx * dx + dz * dz > R * R) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      const fh = f.h ?? (f._h ??= this.pathHeight(f.x, f.z));
      h = h + (fh - h) * (1 - smooth(f.r, f.r + 3, d));
    }
    for (let k = 0; k < this.water.length; k++) {
      const w = this.water[k];
      const d = vi >= 0 && this._dWater ? this._dWater[k][vi] : distToPolyline(x, z, w.pts ?? [w.from, w.to]);
      const hw = (w.width ?? 6) / 2;
      const bed = (w.y ?? -0.4) - (w.deep ? 1.1 : 0.25);
      const bank = (w.y ?? -0.4) + 0.15;
      if (d < hw + 5) {
        const k = 1 - smooth(hw - 1.5, hw + 4, d);            // 1 in the channel → 0 past the bank
        const target = d < hw ? bed + (hw - d < 1.5 ? (1.5 - (hw - d)) / 1.5 * (bank - bed) : 0) : bank;
        h = Math.min(h, h + (target - h) * k);
      }
    }
    for (const k of this.keep) {
      const [x0, z0, x1, z1] = k.box, f = k.feather ?? 0.6;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1), d = Math.hypot(dx, dz);
      if (d < f) h = h + (k.h - h) * (1 - d / f);
    }
    return h;
  }

  /** Build the heightfield + default paint (grass density along paths / water, dry patches, tall clumps). */
  build() {
    const W = this.W, pw = this.pathWidth * 0.5, size = this.size, res = this.res;
    this._dSpine = polylineDistanceGrid(this.spine, size, res, pw + 8);
    this._dPaths = this.paths.map((p) => polylineDistanceGrid(p.pts, size, res, p.width * 0.5 + 6));
    this._dWater = this.water.map((w) => polylineDistanceGrid(w.pts ?? [w.from, w.to], size, res, (w.width ?? 6) / 2 + 8));
    const hgt = new Float32Array(W * W);
    for (let iz = 0; iz < W; iz++) for (let ix = 0; ix < W; ix++) {
      const i = iz * W + ix;
      hgt[i] = this.heightFn(ix * this.cell - this.half, iz * this.cell - this.half, i);
    }
    this.heightfield = new Heightfield(size, res, hgt);
    for (let iz = 0; iz < W; iz++) for (let ix = 0; ix < W; ix++) {
      const i = iz * W + ix, x = ix * this.cell - this.half, z = iz * this.cell - this.half;
      const dp = this._dSpine[i];
      const wob = (valueNoise(x * 0.4, z * 0.4, this.seed + 5) - 0.5) * 1.4;
      let dens = 0.08 + 0.92 * smooth(pw * 0.2, pw * 0.9, dp + wob);   // a trodden lane: sparse blades in the middle
      for (let k = 0; k < this.paths.length; k++) { const p = this.paths[k]; dens = Math.min(dens, smooth(p.width * 0.3, p.width * 0.5 + 0.8, this._dPaths[k][i] + wob * 0.6)); }
      for (let k = 0; k < this.water.length; k++) {
        const d = this._dWater[k][i], hw = (this.water[k].width ?? 6) / 2;
        dens = Math.min(dens, smooth(hw - 0.2, hw + 0.8, d));
      }
      const patch = valueNoise(x * 0.07, z * 0.07, this.seed + 21);
      dens *= 0.75 + 0.25 * smooth(0.18, 0.4, patch);          // a few thinner, mossy patches
      this.density[i] = dens;
      const tall = valueNoise(x * 0.11, z * 0.11, this.seed + 33);
      this.hmul[i] = 0.85 + 0.9 * smooth(0.62, 0.85, tall) + 0.25 * (valueNoise(x * 0.9, z * 0.9, this.seed + 34) - 0.5);
      this.dry[i] = smooth(0.55, 0.85, valueNoise(x * 0.045, z * 0.045, this.seed + 44)) * 0.8;
    }
    return this.heightfield;
  }

  heightAt(x, z) { return this.heightfield ? this.heightfield.heightAt(x, z) : this.heightFn(x, z); }

  /** Grid index range covering a disc. */
  _each(x, z, r, fn) {
    const c = this.cell, W = this.W;
    const i0 = Math.max(0, Math.floor((x - r + this.half) / c)), i1 = Math.min(W - 1, Math.ceil((x + r + this.half) / c));
    const j0 = Math.max(0, Math.floor((z - r + this.half) / c)), j1 = Math.min(W - 1, Math.ceil((z + r + this.half) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i * c - this.half, pz = j * c - this.half, d = Math.hypot(px - x, pz - z);
      if (d <= r) fn(j * W + i, d, px, pz);
    }
  }

  /** Thin/clear grass in a disc (props, footprints). `to` = density multiplier at the centre (0 = bare). */
  clearGrass(x, z, r, to = 0) {
    this._each(x, z, r + this.cell, (i, d) => { const k = smooth(r * 0.6, r + this.cell, d); this.density[i] *= to + (1 - to) * k; });
  }

  /** Multiply grass height in a disc (mown practice field = 0.6, tall wild grass = 1.6). */
  grassHeight(x, z, r, mul) {
    this._each(x, z, r + 2, (i, d) => { const k = 1 - smooth(r, r + 2, d); this.hmul[i] *= 1 + (mul - 1) * k; });
  }

  /** Paint ground colour in a disc with soft edges (weight 0..1). */
  paintDisc(x, z, r, color, weight = 1, soft = 1.5) {
    _a.set(color);
    this._each(x, z, r + soft, (i, d) => {
      const w = weight * (1 - smooth(r - soft * 0.5, r + soft, d)), o = i * 4;
      if (w <= this.paint[o + 3]) return;
      this.paint[o] = _a.r; this.paint[o + 1] = _a.g; this.paint[o + 2] = _a.b; this.paint[o + 3] = w;
    });
  }

  /** Paint + clear grass in an axis box (fields, yards). */
  paintBox(x0, z0, x1, z1, { color = null, weight = 1, density = null, hmul = null } = {}) {
    const c = this.cell, W = this.W;
    if (color) _a.set(color);
    const i0 = Math.max(0, Math.floor((x0 + this.half) / c)), i1 = Math.min(W - 1, Math.ceil((x1 + this.half) / c));
    const j0 = Math.max(0, Math.floor((z0 + this.half) / c)), j1 = Math.min(W - 1, Math.ceil((z1 + this.half) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * W + i;
      if (color) { const o = k * 4; if (weight > this.paint[o + 3]) { this.paint[o] = _a.r; this.paint[o + 1] = _a.g; this.paint[o + 2] = _a.b; this.paint[o + 3] = weight; } }
      if (density != null) this.density[k] *= density;
      if (hmul != null) this.hmul[k] *= hmul;
    }
  }

  /** Vertex colour at grid index i (x, z world). */
  _groundColor(i, x, z, out) {
    const P = this._pal ??= Object.fromEntries(Object.entries(this.palette).map(([k, v]) => [k, new THREE.Color(v)]));
    const pw = this.pathWidth * 0.5, s = this.seed;
    const n1 = valueNoise(x * 0.13, z * 0.13, s + 51), n2 = valueNoise(x * 0.6, z * 0.6, s + 52);
    out.copy(P.root).lerp(P.mid, 0.25 + 0.6 * n1);
    out.lerp(P.dry, this.dry[i] * 0.55);
    // worn path: two ruts and a grassy crown
    const dp = this._dSpine ? this._dSpine[i] : distToPolyline(x, z, this.spine);
    let pathW = 1 - smooth(pw * 0.3, pw * 0.85, dp + (n2 - 0.5) * 1.1);
    for (let k = 0; k < this.paths.length; k++) { const p = this.paths[k]; pathW = Math.max(pathW, (1 - smooth(p.width * 0.3, p.width * 0.5 + 0.3, (this._dPaths ? this._dPaths[k][i] : distToPolyline(x, z, p.pts)) + (n2 - 0.5) * 0.8)) * 0.9); }
    if (pathW > 0) {
      const rut = smooth(0.5, 0.0, Math.abs(Math.abs(dp) - pw * 0.42)) * 0.5;
      _c.copy(P.path).lerp(P.pathDark, rut + (n2 - 0.5) * 0.3);
      out.lerp(_c, pathW * 0.92);
    }
    for (let wi = 0; wi < this.water.length; wi++) {
      const w = this.water[wi];
      const d = this._dWater ? this._dWater[wi][i] : distToPolyline(x, z, w.pts ?? [w.from, w.to]), hw = (w.width ?? 6) / 2;
      const k = 1 - smooth(hw - 0.5, hw + 2.5, d);
      if (k > 0) out.lerp(d < hw ? P.mud : P.soil, k * 0.9);
    }
    const o = i * 4, pwgt = this.paint[o + 3];
    if (pwgt > 0) { _c.setRGB(this.paint[o], this.paint[o + 1], this.paint[o + 2]); out.lerp(_c, pwgt); }
    // very slight darkening in hollows (cheap AO)
    const h = this.heightfield.h[i];
    out.multiplyScalar(0.92 + 0.08 * smooth(-1.5, 1.5, h));
    return out;
  }

  /**
   * Build the render outputs. Returns { mesh, dataTexture, material }. Every created object is `userData.owned`.
   * `step` (1 | 2 | 4): render every step-th heightfield vertex (§18 budget: Low draws the ground at half resolution;
   * physics keeps the full grid). `chunks` (1 | 2 | 4 per side): split the ground into frustum-culled tiles (Med /
   * High); tiles share their edge vertices exactly, so there are no seams. `lod`: tiles carry userData.lod
   * { full, coarse, box } and Level swaps in the half-resolution geometry for tiles far from the camera
   * (updateGroundLod). `mesh` is the Mesh (chunks 1) or a Group.
   */
  finalize({ step = 1, chunks = 1, lod = false } = {}) {
    const hf = this.heightfield, W = this.W, res = this.res;
    step = Math.max(1, step | 0); while (step > 1 && res % step) step--;
    const cells = res / step;
    chunks = Math.max(1, chunks | 0); while (chunks > 1 && cells % chunks) chunks--;
    const per = cells / chunks;
    lod = lod && chunks > 1 && per % 2 === 0;
    const material = makeGroundMaterial();
    const tiles = [];
    for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
      const ix0 = cx * per * step, iz0 = cz * per * step;
      // `lod`: each tile also gets a half-resolution geometry for when the camera is far from it; the full one's
      // odd edge vertices sit on the coarse edge, so neighbours at different detail never crack
      const geo = this._groundGeometry(ix0, iz0, per, step, lod);
      const m = new THREE.Mesh(geo, material);
      m.name = 'ground'; m.receiveShadow = true; m.castShadow = false;
      m.userData.owned = true;
      if (lod) {
        const coarse = this._groundGeometry(ix0, iz0, per / 2, step * 2);
        m.userData.lod = { full: geo, coarse, box: geo.boundingBox.clone() };
      }
      tiles.push(m);
    }
    let mesh = tiles[0];
    if (tiles.length > 1) {
      mesh = new THREE.Group(); mesh.name = 'ground';
      for (const t of tiles) mesh.add(t);
    }

    // ground data texture for grass: R height, G density, B height multiplier, A dryness
    const data = new Uint16Array(W * W * 4), toHalf = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < W * W; i++) {
      data[i * 4] = toHalf(hf.h[i]);
      data[i * 4 + 1] = toHalf(Math.max(0, Math.min(1, this.density[i])));
      data[i * 4 + 2] = toHalf(Math.max(0, this.hmul[i]));
      data[i * 4 + 3] = toHalf(this.dry[i]);
    }
    const tex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false; tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    tex.userData.owned = true;
    return { mesh, material, dataTexture: tex };
  }

  /**
   * One ground tile: `n` × `n` cells of `step` heightfield cells each, starting at grid (ix0, iz0). Vertex order and
   * triangle diagonals match Heightfield.toGeometry (PlaneGeometry rotated −90° about X), normals come from the full
   * grid (central differences) so tiles and LODs shade identically, colours from the paint layer.
   */
  _groundGeometry(ix0, iz0, n, step, snapEdges = false) {
    const hf = this.heightfield, W = this.W, cell = this.cell, half = this.half, h = hf.h;
    const V = n + 1, pos = new Float32Array(V * V * 3), nor = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    const H = (ix, iz) => h[Math.max(0, Math.min(W - 1, iz)) * W + Math.max(0, Math.min(W - 1, ix))];
    for (let j = 0; j < V; j++) for (let k = 0; k < V; k++) {
      const ix = ix0 + k * step, iz = iz0 + j * step, i = iz * W + ix, o = (j * V + k) * 3;
      const x = ix * cell - half, z = iz * cell - half;
      pos[o] = x; pos[o + 1] = h[i]; pos[o + 2] = z;
      const dx = (H(ix + 1, iz) - H(ix - 1, iz)) / (2 * cell), dz = (H(ix, iz + 1) - H(ix, iz - 1)) / (2 * cell);
      const l = Math.hypot(dx, 1, dz); nor[o] = -dx / l; nor[o + 1] = 1 / l; nor[o + 2] = -dz / l;
      this._groundColor(i, x, z, _a);
      col[o] = _a.r; col[o + 1] = _a.g; col[o + 2] = _a.b;
    }
    if (snapEdges) {
      // odd vertices on the tile border → midpoint of their even neighbours (the half-resolution edge)
      const y = (j, k) => pos[(j * V + k) * 3 + 1];
      for (let k = 1; k < n; k += 2) for (const j of [0, n]) pos[(j * V + k) * 3 + 1] = (y(j, k - 1) + y(j, k + 1)) / 2;
      for (let j = 1; j < n; j += 2) for (const k of [0, n]) pos[(j * V + k) * 3 + 1] = (y(j - 1, k) + y(j + 1, k)) / 2;
    }
    const idx = new (V * V > 65535 ? Uint32Array : Uint16Array)(n * n * 6);
    let t = 0;
    for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const a = j * V + k, b = (j + 1) * V + k, c = (j + 1) * V + k + 1, d = j * V + k + 1;
      idx[t++] = a; idx[t++] = b; idx[t++] = d; idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    g.userData.owned = true;
    return g;
  }

  /**
   * Ground LOD (finalize `lod`): every tile within `near` m of the camera (box distance, xz) draws its full geometry,
   * the rest the coarse one. Returns the triangles drawn. Pure apart from swapping `mesh.geometry`.
   */
  static updateGroundLod(root, camPos, near = 30) {
    let tris = 0;
    root?.traverse?.((m) => {
      const L = m.userData?.lod;
      if (!L) return;
      const b = L.box, dx = Math.max(b.min.x - camPos.x, 0, camPos.x - b.max.x), dz = Math.max(b.min.z - camPos.z, 0, camPos.z - b.max.z);
      const g = Math.hypot(dx, dz) <= near ? L.full : L.coarse;
      if (m.geometry !== g) m.geometry = g;
      tris += g.index.count / 3;
    });
    return tris;
  }

  /** Grass density at (x, z) from the paint layer (nearest cell). */
  densityAt(x, z) {
    const i = Math.round((x + this.half) / this.cell), j = Math.round((z + this.half) / this.cell);
    if (i < 0 || j < 0 || i >= this.W || j >= this.W) return 0;
    return this.density[j * this.W + i];
  }
}

/** Lambert ground with vertex colours and world-space detail noise (art.md §9.4: no flat-looking terrain). */
export function makeGroundMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGWorld;
float gH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), f.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wp = vGWorld.xz;
  float n = gN(wp * 0.35) * 0.5 + gN(wp * 1.3) * 0.3 + gN(wp * 5.1) * 0.2;
  float speck = smoothstep(0.78, 0.95, gN(wp * 9.0));
  diffuseColor.rgb *= 0.82 + 0.36 * n;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.9), speck * 0.35);
}`);
  };
  m.customProgramCacheKey = () => 'world-ground-v1';
  m.userData.owned = true;
  return m;
}
