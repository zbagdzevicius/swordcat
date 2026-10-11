// src/physics/NavGrid.js  (owner: physics) — research/CONTROLS_SPEC.md §5.3 nav grid for click / tap to move.
//
// A 0.5 m grid over the level bounds. Each cell holds the walkable surface height (terrain, walkable collider tops,
// architecture: bridge decks, ledges, stairs) and a flag: walkable or blocked (steep, deep water, out of bounds, or a
// static collider spanning [surface + spanLo, surface + spanHi] within the agent radius + margin, or a wall).
// Cells are sampled through a `sampler(x, z) → { h, ok }` (Physics provides it), LAZILY on first use, and the whole
// grid is also filled in the background in time slices (`fill(budgetMs)`), so the first click after a level load
// already works and later ones are cheap. `invalidate(minX, minZ, maxX, maxZ)` forgets a region (dynamic colliders:
// arena fog walls, the portcullis, Shield Wall, broken boulders).
//
// Pure (no three.js, no DOM): unit-tested with synthetic samplers.
import { NAV } from '../core/config.js';

export const UNKNOWN = 0, WALK = 1, BLOCKED = 2;

export class NavGrid {
  /**
   * @param {{minX:number, minZ:number, maxX:number, maxZ:number}} bounds
   * @param {(x:number, z:number) => {h:number, ok:boolean}} sampler
   * @param {number} [cell]
   */
  constructor(bounds, sampler, cell = NAV.cell) {
    this.cell = cell;
    this.minX = bounds.minX; this.minZ = bounds.minZ;
    this.nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    this.size = this.nx * this.nz;
    this.h = new Float32Array(this.size);
    this.flag = new Uint8Array(this.size);
    this.sampler = sampler;
    /** background fill cursor (cell index) and the count of sampled cells */
    this.fillAt = 0;
    this.sampled = 0;
    this.version = 0;
  }

  get filled() { return this.fillAt >= this.size; }

  /** Cell index of world (x, z), or -1 outside the grid. */
  index(x, z) {
    const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  ix(k) { return k % this.nx; }
  iz(k) { return (k / this.nx) | 0; }
  /** World centre of cell k. */
  cx(k) { return this.minX + (this.ix(k) + 0.5) * this.cell; }
  cz(k) { return this.minZ + (this.iz(k) + 0.5) * this.cell; }

  /** Sample cell k now (if not known yet). Returns its flag. */
  probe(k) {
    if (k < 0 || k >= this.size) return BLOCKED;
    const f = this.flag[k];
    if (f !== UNKNOWN) return f;
    let s;
    try { s = this.sampler(this.cx(k), this.cz(k)); } catch { s = null; }
    const ok = !!s && s.ok && Number.isFinite(s.h);
    this.h[k] = ok ? s.h : (Number.isFinite(s?.h) ? s.h : -1e4);
    this.flag[k] = ok ? WALK : BLOCKED;
    this.sampled++;
    return this.flag[k];
  }

  walkable(k) { return this.probe(k) === WALK; }
  height(k) { this.probe(k); return this.h[k]; }

  /** Is world (x, z) on a walkable cell? */
  walkableAt(x, z) { const k = this.index(x, z); return k >= 0 && this.walkable(k); }

  /** Sample unknown cells for up to `budgetMs` (performance.now / Date.now). Returns true when the grid is complete. */
  fill(budgetMs = NAV.sliceMs, now = defaultNow) {
    const t0 = now();
    let n = 0;
    while (this.fillAt < this.size) {
      this.probe(this.fillAt++);
      if ((++n & 63) === 0 && now() - t0 >= budgetMs) break;
    }
    return this.filled;
  }

  /** Forget the cells overlapping the box (world metres, expanded by the agent radius); they re-sample on use. */
  invalidate(minX, minZ, maxX, maxZ) {
    const pad = NAV.agentR + NAV.margin + this.cell;
    const i0 = Math.max(0, Math.floor((minX - pad - this.minX) / this.cell)), i1 = Math.min(this.nx - 1, Math.floor((maxX + pad - this.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((minZ - pad - this.minZ) / this.cell)), j1 = Math.min(this.nz - 1, Math.floor((maxZ + pad - this.minZ) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.flag[j * this.nx + i] = UNKNOWN;
    this.version++;
  }

  /**
   * Can an agent walk from cell a to its neighbour b (8-connected)? Both walkable, |Δh| ≤ stepUp (diagonals ≤ stepUp·√2
   * and both orthogonal cells walkable).
   */
  step(a, b) {
    if (!this.walkable(b)) return false;
    const dh = Math.abs(this.h[b] - this.h[a]);
    const ax = this.ix(a), az = this.iz(a), bx = this.ix(b), bz = this.iz(b);
    if (ax !== bx && az !== bz) {
      if (dh > NAV.stepUp * Math.SQRT2) return false;
      const c1 = az * this.nx + bx, c2 = bz * this.nx + ax;
      if (!this.walkable(c1) || !this.walkable(c2)) return false;
      if (Math.abs(this.h[c1] - this.h[a]) > NAV.stepUp || Math.abs(this.h[c2] - this.h[a]) > NAV.stepUp) return false;
      return true;
    }
    return dh <= NAV.stepUp;
  }

  /** Nearest walkable cell to world (x, z) within `maxR` m (ring search), or -1. */
  nearestWalkable(x, z, maxR = NAV.snap) {
    const k0 = this.index(x, z);
    if (k0 >= 0 && this.walkable(k0)) return k0;
    const ci = Math.floor((x - this.minX) / this.cell), cj = Math.floor((z - this.minZ) / this.cell);
    const R = Math.ceil(maxR / this.cell);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= R; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const k = j * this.nx + i;
          if (!this.walkable(k)) continue;
          const d = Math.hypot(this.cx(k) - x, this.cz(k) - z);
          if (d < bd && d <= maxR) { bd = d; best = k; }
        }
      }
      if (best >= 0 && bd <= r * this.cell) break;
    }
    return best;
  }

  /**
   * Straight walkable line between world points (grid DDA): every crossed cell walkable and no step between
   * consecutive cells above stepUp. Used for string pulling and hold-to-follow steering.
   */
  losWalkable(ax, az, bx, bz) {
    let k = this.index(ax, az);
    const kb = this.index(bx, bz);
    if (k < 0 || kb < 0 || !this.walkable(k) || !this.walkable(kb)) return false;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) return true;
    // sample along the segment every quarter cell, and the agent's half-width to both sides (no corner cutting)
    const n = Math.ceil(len / (this.cell * 0.25));
    const ux = (bx - ax) / len, uz = (bz - az) / len, side = NAV.agentR * 0.6;
    let prev = k;
    for (let s = 1; s <= n; s++) {
      const t = (s / n) * len;
      const x = ax + ux * t, z = az + uz * t;
      const c = this.index(x, z);
      if (c < 0 || !this.walkable(c)) return false;
      if (c !== prev) {
        if (Math.abs(this.h[c] - this.h[prev]) > NAV.stepUp) return false;
        prev = c;
      }
      for (const sd of [side, -side]) {
        const q = this.index(x - uz * sd, z + ux * sd);
        if (q < 0 || !this.walkable(q) || Math.abs(this.h[q] - this.h[c]) > NAV.stepUp) return false;
      }
    }
    return true;
  }
}

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
