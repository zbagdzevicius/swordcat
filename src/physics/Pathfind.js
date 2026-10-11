// src/physics/Pathfind.js  (owner: physics) — research/CONTROLS_SPEC.md §5.3 path queries on a NavGrid.
//
// findPath(grid, from, to, opts?) → { points: [{ x, y, z, link?: 'hop'|'drop'|'gap' }], partial, expansions, goal }
//   A* (octile heuristic, a binary heap on typed arrays, ≤ NAV.maxExpand expansions; on overflow a partial path to
//   the best node), 8-connected walking steps (|Δh| ≤ NAV.stepUp), and automatic JUMP LINKS where a straight step is
//   impossible: up to NAV.hop.horiz m away, rising ≤ hop.upMax or dropping ≤ NAV.drop, over cells whose obstacles are
//   ≤ NAV.fence.top above the take-off / landing (fences, low walls, gaps, stream banks). Link cost = length +
//   NAV.linkCost. Then string pulling with the grid line test, ≤ NAV.maxPoints points; a link point is kept as
//   { x, z of the take-off, link, to: { x, y, z } of the landing }.
// A goal inside a collider / deep water snaps to the nearest walkable cell within NAV.snap m; otherwise the path is
// `partial` (to the reachable cell nearest the goal).
// Pure: unit-tested with synthetic grids.
import { NAV } from '../core/config.js';
import { WALK } from './NavGrid.js';

/** Per-grid scratch (typed arrays sized to the grid, reused across queries; a stamp avoids clearing them). */
const SCRATCH = new WeakMap();
function scratch(grid) {
  let s = SCRATCH.get(grid);
  if (!s || s.size !== grid.size) {
    s = { size: grid.size, g: new Float32Array(grid.size), from: new Int32Array(grid.size), link: new Uint8Array(grid.size),
      stamp: new Uint32Array(grid.size), closed: new Uint32Array(grid.size), heap: new Int32Array(Math.min(grid.size, 65536)),
      hf: new Float32Array(Math.min(grid.size, 65536)), n: 0, cur: 1 };
    SCRATCH.set(grid, s);
  }
  return s;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const LINK_NAMES = ['', 'hop', 'drop', 'gap'];

function heapPush(s, k, f) {
  if (s.n >= s.heap.length) return;
  let i = s.n++;
  s.heap[i] = k; s.hf[i] = f;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (s.hf[p] <= s.hf[i]) break;
    const tk = s.heap[p], tf = s.hf[p];
    s.heap[p] = s.heap[i]; s.hf[p] = s.hf[i]; s.heap[i] = tk; s.hf[i] = tf;
    i = p;
  }
}
function heapPop(s) {
  const top = s.heap[0];
  const last = --s.n;
  if (last > 0) {
    s.heap[0] = s.heap[last]; s.hf[0] = s.hf[last];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < last && s.hf[l] < s.hf[m]) m = l;
      if (r < last && s.hf[r] < s.hf[m]) m = r;
      if (m === i) break;
      const tk = s.heap[m], tf = s.hf[m];
      s.heap[m] = s.heap[i]; s.hf[m] = s.hf[i]; s.heap[i] = tk; s.hf[i] = tf;
      i = m;
    }
  }
  return top;
}

/** Octile distance between cells (m). */
function octile(grid, a, b) {
  const dx = Math.abs(grid.ix(a) - grid.ix(b)), dz = Math.abs(grid.iz(a) - grid.iz(b));
  return grid.cell * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz));
}

/**
 * Jump link from cell a in direction (di, dj) when the straight step is impossible: the first cell 2..max cells away
 * that is walkable, within the hop / drop limits, with every crossed obstacle low enough. Returns [cell, kind] or null.
 */
function jumpTarget(grid, a, di, dj, out) {
  const ha = grid.h[a], ai = grid.ix(a), aj = grid.iz(a);
  const diag = di !== 0 && dj !== 0;
  const maxK = Math.floor(NAV.hop.horiz / (grid.cell * (diag ? Math.SQRT2 : 1)));
  let obstacle = -Infinity, sawBlock = false;
  for (let k = 1; k <= maxK; k++) {
    const i = ai + di * k, j = aj + dj * k;
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) return null;
    const c = j * grid.nx + i;
    const f = grid.probe(c), hc = grid.h[c];
    if (f !== WALK) { sawBlock = true; obstacle = Math.max(obstacle, grid.top?.[c] ?? hc); continue; }
    const dh = hc - ha;
    if (k === 1 && Math.abs(dh) <= NAV.stepUp) return null;            // a plain step: no link
    if (dh > NAV.hop.upMax || -dh > NAV.drop) { obstacle = Math.max(obstacle, hc); sawBlock = true; continue; }
    // a walkable landing: worth a link only if something is in the way (a blocked cell or a step too tall to walk)
    if (!sawBlock && Math.abs(dh) <= NAV.stepUp) return null;
    if (k < 2 && !(dh >= NAV.hop.upMin || -dh > NAV.stepUp)) return null;
    const ref = Math.max(ha, hc);
    if (obstacle > ref + NAV.fence.top) return null;
    // the landing needs room: its own neighbours along the jump must be walkable (no landing on a 1-cell sliver)
    const ni = i + di, nj = j + dj;
    if (ni >= 0 && nj >= 0 && ni < grid.nx && nj < grid.nz) {
      const n2 = nj * grid.nx + ni;
      if (!grid.walkable(n2) && !(grid.walkable(c))) return null;
    }
    out[0] = c; out[1] = dh >= NAV.hop.upMin ? 1 : -dh > NAV.stepUp ? 2 : 3;
    return out;
  }
  return null;
}

const _jt = [0, 0];

/**
 * @param {import('./NavGrid.js').NavGrid} grid
 * @param {{x:number, z:number}} from @param {{x:number, z:number}} to
 * @param {{maxExpand?: number, snap?: number, links?: boolean}} [opts]
 */
export function findPath(grid, from, to, opts = {}) {
  const res = { points: [], partial: false, expansions: 0, goal: null, ok: false };
  if (!grid) return res;
  const start = grid.nearestWalkable(from.x, from.z, 1.5);
  if (start < 0) return res;
  let goal = grid.nearestWalkable(to.x, to.z, opts.snap ?? NAV.snap);
  const s = scratch(grid);
  const stamp = ++s.cur;
  if (stamp >= 0xfffffff0) { s.stamp.fill(0); s.closed.fill(0); s.cur = 1; }
  s.n = 0;
  const maxExp = opts.maxExpand ?? NAV.maxExpand;
  const links = opts.links !== false;
  // without a walkable goal: search toward the raw point and keep the closest node
  const gx = to.x, gz = to.z;
  const hgoal = (k) => (goal >= 0 ? octile(grid, k, goal) : Math.hypot(grid.cx(k) - gx, grid.cz(k) - gz));
  s.g[start] = 0; s.from[start] = -1; s.link[start] = 0; s.stamp[start] = s.cur;
  heapPush(s, start, hgoal(start));
  let best = start, bestH = hgoal(start), found = false, exp = 0;
  while (s.n > 0) {
    const a = heapPop(s);
    if (s.closed[a] === s.cur) continue;
    s.closed[a] = s.cur;
    if (a === goal) { found = true; break; }
    const ha = hgoal(a);
    if (ha < bestH) { bestH = ha; best = a; }
    if (++exp > maxExp) break;
    const ai = grid.ix(a), aj = grid.iz(a), ga = s.g[a];
    for (let d = 0; d < 8; d++) {
      const di = DIRS[d][0], dj = DIRS[d][1], i = ai + di, j = aj + dj;
      if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
      const b = j * grid.nx + i;
      let nb = -1, cost = 0, lk = 0;
      if (grid.step(a, b)) { nb = b; cost = grid.cell * (d < 4 ? 1 : Math.SQRT2); }
      else if (links && jumpTarget(grid, a, di, dj, _jt)) {
        nb = _jt[0]; lk = _jt[1];
        cost = Math.hypot(grid.cx(nb) - grid.cx(a), grid.cz(nb) - grid.cz(a)) + NAV.linkCost;
      }
      if (nb < 0 || s.closed[nb] === s.cur) continue;
      const g = ga + cost;
      if (s.stamp[nb] === s.cur && s.g[nb] <= g) continue;
      s.stamp[nb] = s.cur; s.g[nb] = g; s.from[nb] = a; s.link[nb] = lk;
      heapPush(s, nb, g + hgoal(nb));
    }
  }
  res.expansions = exp;
  const end = found ? goal : best;
  res.partial = !found;
  res.goal = { x: grid.cx(end), y: grid.h[end], z: grid.cz(end) };
  // walk back
  const chain = [];
  for (let k = end; k >= 0 && chain.length < 20000; k = s.from[k]) { chain.push(k); if (k === start) break; }
  chain.reverse();
  res.points = smooth(grid, chain, s, from, found ? to : null);
  res.ok = res.points.length > 0;
  return res;
}

/**
 * String pulling: from each anchor jump to the farthest later cell with a straight walkable line (never across a
 * link). Link landings become `{ x, z, link, to }` take-off points. ≤ NAV.maxPoints.
 */
function smooth(grid, chain, s, from, to) {
  const pts = [];
  if (!chain.length) return pts;
  const P = (k) => ({ x: grid.cx(k), y: grid.h[k], z: grid.cz(k) });
  let cur = 0, ax = from.x, az = from.z;
  while (cur < chain.length - 1 && pts.length < NAV.maxPoints) {
    let m = cur + 1;
    while (m < chain.length && !s.link[chain[m]]) m++;
    const segEnd = m < chain.length ? m - 1 : chain.length - 1;
    if (segEnd > cur) {
      let j = segEnd;
      while (j > cur + 1 && !grid.losWalkable(ax, az, grid.cx(chain[j]), grid.cz(chain[j]))) j--;
      pts.push(P(chain[j])); ax = grid.cx(chain[j]); az = grid.cz(chain[j]);
      cur = j;
    }
    if (cur === segEnd && m < chain.length) {
      const t = chain[cur], l = chain[m];
      let tp = pts[pts.length - 1];
      if (!tp || Math.hypot(tp.x - grid.cx(t), tp.z - grid.cz(t)) > 1e-3) { tp = P(t); pts.push(tp); }
      tp.link = LINK_NAMES[s.link[l]] || 'hop';
      tp.to = P(l);
      pts.push(P(l)); ax = grid.cx(l); az = grid.cz(l);
      cur = m;
    }
  }
  // the exact goal point when it is walkable and in sight of the last cell
  if (to && pts.length) {
    const last = pts[pts.length - 1];
    const k = grid.index(to.x, to.z);
    if (k >= 0 && grid.walkable(k) && !last.link && grid.losWalkable(last.x, last.z, to.x, to.z)) { last.x = to.x; last.z = to.z; last.y = grid.h[k]; }
  } else if (to && !pts.length) {
    const k = grid.index(to.x, to.z);
    if (k >= 0 && grid.walkable(k)) pts.push({ x: to.x, y: grid.h[k], z: to.z });
  }
  return pts;
}
