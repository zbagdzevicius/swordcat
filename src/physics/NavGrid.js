// src/physics/NavGrid.js  (owner: physics) — research/CONTROLS_SPEC.md §5.3 nav grid for click / tap to move.
//
// A 0.5 m grid over the level bounds. Each cell holds the walkable surface height (terrain, walkable collider tops,
// architecture: bridge decks, ledges, stairs) and a flag: walkable or blocked (steep, deep water, out of bounds, or a
// static collider spanning [surface + spanLo, surface + spanHi] within the agent radius + margin, or a wall).
// Cells are sampled through a `sampler(x, z) → { h, ok }` (Physics provides it), LAZILY on first use, and the whole
// grid is also filled in the background in time slices (`fill(budgetMs)`), so the first click after a level load
// already works and later ones are cheap. `invalidate(minX, minZ, maxX, maxZ)` forgets a region (dynamic colliders:
// arena fog walls, the portcullis, Shield Wall, broken boulders).
// The sampler may also report `top` (the obstacle top over a blocked cell: fences vs walls for jump links) and
// `bounce` (the cell's surface is a bounce cap: links from it rise up to NAV.bounce).
// Authored links (`setLinks`, level `navLinks`): point-to-point hop / drop / bounce / fence links, optionally gated by
// a flag expression (`when`, evaluated through `cond`; `refreshLinks()` re-evaluates). A CLOSED gated fence link also
// shuts the automatic jump links across its gate line (the meadow practice-field fence before `tut.jump.done`).
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
    /** obstacle top over blocked cells (else the surface height) */
    this.top = new Float32Array(this.size);
    /** 1 where the surface is a bounce cap */
    this.bounce = new Uint8Array(this.size);
    /** 1 where a CLOSED gate line runs (automatic jump links may not cross these cells) */
    this.gate = new Uint8Array(this.size);
    /** authored links: from-cell -> [{ to, kind, cost, src }] (open ones only; see refreshLinks) */
    this.linkFrom = new Map();
    /** @type {Array<{a:number[], b:number[], kind:string, when?:any, oneWay?:boolean, gate?:number[][], open:boolean}>} */
    this.authored = [];
    this.gatesClosed = 0;
    this.linkVersion = 0;
    this.sampler = sampler;
    /** background fill cursor (cell index) and the count of sampled cells */
    this.fillAt = 0;
    this.sampled = 0;
    this.version = 0;
    /** walk-connected islands (Pathfind.markTraps): island id per cell, 1 on cells of a small island with no way out */
    this.comp = null;
    this.trap = null;
    this.traps = 0;
    this.trapVersion = -1;
    this.trapLinks = -1;
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
    this.top[k] = Number.isFinite(s?.top) ? s.top : this.h[k];
    this.bounce[k] = ok && s.bounce ? 1 : 0;
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

  /**
   * Nearest walkable cell to world (x, z) within `maxR` m (ring search), or -1. `accept(k)` (optional) filters the
   * candidates (findPath: not a trap pocket).
   */
  nearestWalkable(x, z, maxR = NAV.snap, accept = null) {
    const k0 = this.index(x, z);
    if (k0 >= 0 && this.walkable(k0) && (!accept || accept(k0))) return k0;
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
          if (!this.walkable(k) || (accept && !accept(k))) continue;
          const d = Math.hypot(this.cx(k) - x, this.cz(k) - z);
          if (d < bd && d <= maxR) { bd = d; best = k; }
        }
      }
      if (best >= 0 && bd <= r * this.cell) break;
    }
    return best;
  }

  // ------------------------------------------------------------------ authored links + gates
  /**
   * Set the authored links (level `navLinks`): `{ a: [x, z], b: [x, z], kind: 'hop'|'drop'|'bounce'|'fence', when?,
   * oneWay?, gate?: [[x, z], [x, z]] }`. `hop` and `fence` links work both ways (the way back down a hop is a drop)
   * unless `oneWay`; `drop` and `bounce` are one-way. A `fence` link with `when` gates the automatic links across its
   * gate line while closed: `gate` if given, else a 3 m segment through the link's midpoint, across the link.
   * @param {object[]} list @param {(expr:any) => boolean} [cond]
   */
  setLinks(list, cond) {
    this.authored = [];
    for (const l of list ?? []) {
      const a = pt(l?.a), b = pt(l?.b);
      if (!a || !b) continue;
      const kind = LINK_KINDS.includes(l.kind) ? l.kind : 'hop';
      let gate = null;
      if (kind === 'fence' && l.when != null) {
        if (Array.isArray(l.gate) && pt(l.gate[0]) && pt(l.gate[1])) gate = [pt(l.gate[0]), pt(l.gate[1])];
        else {
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
          const px = (-dz / L) * 1.5, pz = (dx / L) * 1.5;
          gate = [[mx - px, mz - pz], [mx + px, mz + pz]];
        }
      }
      this.authored.push({ a, b, kind, when: l.when ?? null, oneWay: l.oneWay ?? (kind === 'drop' || kind === 'bounce'), gate, open: true });
    }
    this.refreshLinks(cond);
  }

  /** Re-evaluate the links' `when` (after a flag change): rebuilds the link table and the closed-gate mask. */
  refreshLinks(cond = this._cond) {
    if (cond) this._cond = cond;
    const c = this._cond;
    this.linkFrom.clear();
    this.gate.fill(0);
    this.gatesClosed = 0;
    let key = '';
    for (const l of this.authored) {
      let open = true;
      if (l.when != null) { try { open = c ? !!c(l.when) : true; } catch { open = false; } }
      l.open = open;
      key += open ? '1' : '0';
      if (!open) { if (l.gate) { this._markGate(l.gate[0], l.gate[1]); this.gatesClosed++; } continue; }
      // endpoints snap to the nearest walkable cell within 0.75 m (authored on a prop's eroded rim, say)
      const ka = this._snapEnd(l.a, l.b), kb = this._snapEnd(l.b, l.a);
      if (ka < 0 || kb < 0 || ka === kb) { l.broken = true; continue; }
      l.broken = false;
      const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
      this._addLink(ka, kb, l.kind, len, l);
      if (!l.oneWay) this._addLink(kb, ka, l.kind === 'hop' ? 'drop' : l.kind, len, l);
    }
    this._linkKey = key;
    this.linkVersion++;
    return this.openLinks;
  }
  /** Cheap re-check of the gated links (every path query): refreshes only when a `when` changed. */
  checkLinks() {
    const c = this._cond;
    if (!c || !this.authored.length) return false;
    let key = '';
    for (const l of this.authored) {
      let open = true;
      if (l.when != null) { try { open = !!c(l.when); } catch { open = false; } }
      key += open ? '1' : '0';
    }
    if (key === this._linkKey) return false;
    this.refreshLinks();
    return true;
  }
  /**
   * An authored endpoint `p` (the other end `q`) → its cell: itself when walkable, else the walkable cell within 0.75 m
   * that is nearest, preferring cells on the far side of `p` from `q` (a landing goes on past a lip rather than back
   * before it; a take-off stays back from it).
   */
  _snapEnd(p, q) {
    const k0 = this.index(p[0], p[1]);
    if (k0 >= 0 && this.walkable(k0)) return k0;
    let ux = p[0] - q[0], uz = p[1] - q[1];
    const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
    const R = 0.75, n = Math.ceil(R / this.cell);
    const ci = Math.floor((p[0] - this.minX) / this.cell), cj = Math.floor((p[1] - this.minZ) / this.cell);
    let best = -1, bs = Infinity;
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      const k = j * this.nx + i, dx = this.cx(k) - p[0], dz = this.cz(k) - p[1], d = Math.hypot(dx, dz);
      if (d > R || !this.walkable(k)) continue;
      const score = d - 0.5 * (dx * ux + dz * uz);
      if (score < bs) { bs = score; best = k; }
    }
    return best;
  }
  _addLink(from, to, kind, len, src) {
    let arr = this.linkFrom.get(from);
    if (!arr) this.linkFrom.set(from, (arr = []));
    arr.push({ to, kind, cost: len + NAV.linkCost * AUTHORED_COST, src });
  }
  /** Mark the cells along a gate segment (and one cell to each side). */
  _markGate(a, b) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let s = 0; s <= n; s++) {
      const x = a[0] + (b[0] - a[0]) * (s / n), z = a[1] + (b[1] - a[1]) * (s / n);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const k = this.index(x + di * this.cell, z + dj * this.cell);
        if (k >= 0) this.gate[k] = 1;
      }
    }
  }
  /** Number of authored links currently open. */
  get openLinks() { let n = 0; for (const l of this.authored) if (l.open) n++; return n; }

  // ------------------------------------------------------------------ audits
  /**
   * Corridor audit (§5.3): walkable passages narrower than `minClear` m of clear width between two raised obstacles
   * (across x or z), clustered 3 m apart. Clear width = walkable run + 2 x (agentR + margin) (the cells are already
   * eroded by the agent). Samples unknown cells, so call it once the grid is filled. Returns [{ x, z, width }].
   */
  corridors(minClear = NAV.minCorridor, max = 40) {
    const out = [], pad = 2 * (NAV.agentR + NAV.margin), c = this.cell;
    const raised = (k) => this.probe(k) !== WALK && this.top[k] > this.h[k] + NAV.fence.top;
    // walkable run through (i, j) along (di, dj): [cells, both ends are raised obstacles]
    const runAt = (i, j, di, dj) => {
      let n = 1, ends = 0;
      for (const sgn of [1, -1]) {
        let ii = i + di * sgn, jj = j + dj * sgn;
        for (;;) {
          if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) break;
          const k = jj * this.nx + ii;
          if (this.probe(k) !== WALK) { if (raised(k)) ends++; break; }
          if (++n * c + pad >= minClear) return [n, false];
          ii += di * sgn; jj += dj * sgn;
        }
      }
      return [n, ends === 2];
    };
    const seen = [];
    for (let j = 0; j < this.nz && out.length < max; j++) {
      for (let i = 0; i < this.nx && out.length < max; i++) {
        const k = j * this.nx + i;
        if (this.probe(k) !== WALK) continue;
        for (const [di, dj] of [[1, 0], [0, 1]]) {
          const [n, closed] = runAt(i, j, di, dj);
          if (!closed || n * c + pad >= minClear) continue;
          // a passage, not a pocket: it must run on along the other axis
          const [m] = runAt(i, j, dj, di);
          if (m * c + pad < minClear) continue;
          const x = this.cx(k), z = this.cz(k);
          if (seen.some((q) => Math.abs(q[0] - x) < 3 && Math.abs(q[1] - z) < 3)) break;
          seen.push([x, z]);
          out.push({ x: +x.toFixed(1), z: +z.toFixed(1), width: +(n * c + pad).toFixed(2) });
          break;
        }
      }
    }
    return out;
  }

  /**
   * Straight walkable line between world points (grid DDA): every crossed cell walkable and no step between
   * consecutive cells above stepUp. Used for string pulling and hold-to-follow steering.
   */
  losWalkable(ax, az, bx, bz) {
    const k = this.index(ax, az);
    const kb = this.index(bx, bz);
    if (k < 0 || kb < 0 || !this.walkable(k) || !this.walkable(kb)) return false;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) return true;
    // sample along the segment every quarter cell, and the agent's half-width to both sides (no corner cutting)
    const n = Math.ceil(len / (this.cell * 0.25));
    const ux = (bx - ax) / len, uz = (bz - az) / len, side = NAV.agentR * 0.6, ox = -uz * side, oz = ux * side;
    const h = this.h, step = NAV.stepUp;
    let prev = k, pl = -2, pr = -2;
    for (let s = 1; s <= n; s++) {
      const t = (s / n) * len;
      const x = ax + ux * t, z = az + uz * t;
      const c = this.index(x, z);
      if (c < 0 || !this.walkable(c)) return false;
      if (c !== prev) {
        if (Math.abs(h[c] - h[prev]) > step) return false;
        prev = c;
      }
      const l = this.index(x + ox, z + oz), r = this.index(x - ox, z - oz);
      if (l !== pl) { if (l < 0 || !this.walkable(l) || Math.abs(h[l] - h[c]) > step) return false; pl = l; }
      if (r !== pr) { if (r < 0 || !this.walkable(r) || Math.abs(h[r] - h[c]) > step) return false; pr = r; }
    }
    return true;
  }

}

export const LINK_KINDS = ['hop', 'drop', 'gap', 'bounce', 'fence'];
/** authored links are designer-placed (centred landings, tested arcs): they cost half an automatic link's penalty */
const AUTHORED_COST = 0.5;
const pt = (v) => (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? [+v[0], +v[1]] : (v && Number.isFinite(v.x) && Number.isFinite(v.z) ? [v.x, v.z] : null));

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
