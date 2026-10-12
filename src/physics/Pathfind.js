// src/physics/Pathfind.js  (owner: physics) — research/CONTROLS_SPEC.md §5.3 path queries on a NavGrid.
//
// findPath(grid, from, to, opts?) → { points: [{ x, y, z, link?, to? }], links, partial, expansions, goal, cost, ok }
//   A* (octile heuristic, a binary heap on typed arrays, ≤ NAV.maxExpand expansions; on overflow a partial path to
//   the best node), 8-connected walking steps (|Δh| ≤ NAV.stepUp), and automatic JUMP LINKS where a straight step is
//   impossible: up to NAV.hop.horiz m away, rising ≤ hop.upMax or dropping ≤ NAV.drop, over cells whose obstacles are
//   ≤ NAV.fence.top above the take-off / landing (fences, low walls, gaps, stream banks). Link cost = length +
//   NAV.linkCost. Kinds: `hop` (up NAV.hop.upMin..upMax), `drop` (down, one-way), `gap` (over low blocked cells:
//   streams, deep water; ≤ NAV.gap wide), `fence` (over a raised obstacle ≤ NAV.fence.top tall and ≤ fence.thick
//   thick), `bounce` (EVERY link taking off from a bounce cap, up to NAV.bounce: she never stands on a cap, so a
//   ground take-off from one could never fire). Cells under a CLOSED gate (NavGrid.setLinks)
//   are never jumped. Authored links (NavGrid.linkFrom) are extra graph edges, kept exactly (no run-up shift).
//   Then string pulling with the grid line test, ≤ NAV.maxPoints points; a link point is kept as
//   { x, z of the take-off, link, to: { x, y, z } of the landing }.
// A goal inside a collider / deep water snaps to the nearest walkable cell within NAV.snap m; otherwise the path is
// `partial` (to the reachable cell nearest the goal: the A* best node, never an empty path while she stands on the nav;
// when that is her own cell the path is that one cell). A start off the nav snaps the same way.
// Once the island audit is done (markTraps + buildIslands, a few frames after nav:ready and after each invalidation),
// a goal on an island she cannot reach (a roof, a walled yard, a lake) snaps at once to the nearest reachable cell
// within REACH_SNAP m (`partial`, `snapped`) instead of flooding A* to its expansion cap, and the automatic jump links
// come from a per-cell cache instead of a scan per expansion.
// Pure: unit-tested with synthetic grids.
import { NAV } from '../core/config.js';
import { WALK, LINK_KINDS } from './NavGrid.js';

/** Per-grid scratch (typed arrays sized to the grid, reused across queries; a stamp avoids clearing them). */
const SCRATCH = new WeakMap();
function scratch(grid) {
  let s = SCRATCH.get(grid);
  if (!s || s.size !== grid.size) {
    s = { size: grid.size, g: new Float32Array(grid.size), from: new Int32Array(grid.size), link: new Uint8Array(grid.size),
      stamp: new Uint32Array(grid.size), closed: new Uint32Array(grid.size), heap: new Int32Array(Math.min(grid.size, 65536)),
      hf: new Float32Array(Math.min(grid.size, 65536)), n: 0, cur: 1, reach: null };
    SCRATCH.set(grid, s);
  }
  return s;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** link codes (Uint8 per node): 1 + LINK_KINDS index; AUTHORED bit for designer links */
const LINK_NAMES = ['', ...LINK_KINDS];
const CODE = Object.fromEntries(LINK_KINDS.map((k, i) => [k, i + 1]));
const AUTHORED = 0x40;
/** an obstacle up to this far above the landing is its own lip (a ledge's eroded rim, a stair's next step) */
const LIP = 0.25;
/** the agent's own footprint in blocked cells either side of a thin obstacle (cells are eroded by agentR + margin) */
const PAD = 2 * (NAV.agentR + NAV.margin);

function heapPush(s, k, f) {
  if (s.n >= s.heap.length) {
    // never drop an open node (a big opts.maxExpand): grow ×2 (a cell is pushed at most once per improving neighbour)
    const heap = new Int32Array(s.heap.length * 2), hf = new Float32Array(s.hf.length * 2);
    heap.set(s.heap); hf.set(s.hf); s.heap = heap; s.hf = hf;
  }
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

/**
 * Jump link from cell a in direction (di, dj) when the straight step is impossible: the first cell 2..max cells away
 * that is walkable, within the hop / drop / bounce limits, with every crossed obstacle low and thin enough and no
 * closed gate in between. Writes [cell, code] into `out` and returns it, or null.
 */
function jumpTarget(grid, a, di, dj, out) {
  const ha = grid.h[a], ai = grid.ix(a), aj = grid.iz(a);
  const diag = di !== 0 && dj !== 0, stepLen = grid.cell * (diag ? Math.SQRT2 : 1);
  const fromBounce = grid.bounce ? grid.bounce[a] === 1 : false;
  const upMax = fromBounce ? Math.max(NAV.hop.upMax, NAV.bounce) : NAV.hop.upMax;
  const maxK = Math.floor((Math.max(NAV.hop.horiz, NAV.gap + grid.cell * 1.5) + 1e-6) / stepLen);
  const gate = grid.gate;
  let obstacle = -Infinity, sawBlock = false, raisedRun = 0, lowRun = 0, fb = -1, fbCode = 0;
  for (let k = 1; k <= maxK; k++) {
    const i = ai + di * k, j = aj + dj * k;
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) break;
    const c = j * grid.nx + i;
    const f = grid.probe(c), hc = grid.h[c];
    if (f !== WALK) {
      if (gate && gate[c]) break;                                  // a closed gate (the lesson fence)
      sawBlock = true;
      const t = grid.top ? grid.top[c] : hc;
      obstacle = Math.max(obstacle, t);
      if (t > Math.max(ha, hc) + NAV.stepUp) raisedRun++; else lowRun++;
      if (raisedRun * stepLen > NAV.fence.thick + PAD + grid.cell) break;    // a wall, not a fence
      if (lowRun * stepLen > NAV.gap + grid.cell) break;                     // too wide to jump
      continue;
    }
    const dh = hc - ha;
    if (k === 1 && Math.abs(dh) <= NAV.stepUp) return null;            // a plain step: no link
    // off a bounce cap, lower ground is flown over (a drop there is only the fallback): look for a higher landing
    if (fromBounce && dh < -NAV.stepUp) {
      if (fb < 0 && -dh <= NAV.drop && (sawBlock || k === 1)) { fb = c; fbCode = CODE.bounce; }
      lowRun++; sawBlock = true;
      if (lowRun * stepLen > NAV.gap + grid.cell + 1.5) break;
      continue;
    }
    if (dh > upMax || -dh > NAV.drop) { obstacle = Math.max(obstacle, hc); sawBlock = true; raisedRun += dh > 0 ? 1 : 0; continue; }
    // a walkable landing: worth a link only if something is in the way (a blocked cell or a step too tall to walk)
    if (!sawBlock && Math.abs(dh) <= NAV.stepUp) return null;
    const lim = raisedRun === 0 && lowRun > 0 ? Math.max(NAV.hop.horiz, NAV.gap + grid.cell * 1.5) : NAV.hop.horiz;
    if (k * stepLen > lim + 1e-6) break;
    // what is crossed must clear the take-off by a fence's height (her arc rises from HER feet), or be the landing's own
    // lip: a hop up a 1 m rise across the side of a stair flight whose steps climb 1.5 m in between is not a hop
    if (obstacle > Math.max(ha + NAV.fence.top, hc + LIP)) break;
    let code;
    if (fromBounce) code = CODE.bounce;                               // no ground take-off from a cap: always a bounce
    else if (dh >= NAV.hop.upMin) code = CODE.hop;
    else if (-dh > NAV.stepUp) code = CODE.drop;
    else code = raisedRun > 0 ? CODE.fence : CODE.gap;
    // land with room around her: a rim cell (a stump's or a ledge's edge) is only the fallback when no cell further in
    // along the jump is walkable all round
    if (!interior(grid, c, hc)) { if (fb < 0) { fb = c; fbCode = code; } continue; }
    out[0] = c; out[1] = code;
    return out;
  }
  if (fb >= 0) { out[0] = fb; out[1] = fbCode; return out; }
  return null;
}

/** Are the 4 orthogonal neighbours of cell c walkable and level with it (|dh| ≤ stepUp)? */
function interior(grid, c, hc) {
  const i = c % grid.nx, j = (c / grid.nx) | 0;
  if (i < 1 || j < 1 || i >= grid.nx - 1 || j >= grid.nz - 1) return false;
  const ok = (n) => grid.walkable(n) && Math.abs(grid.h[n] - hc) <= NAV.stepUp;
  return ok(c - 1) && ok(c + 1) && ok(c - grid.nx) && ok(c + grid.nx);
}

const _jt = [0, 0];
/** findPath: the cached jump link of cell a in direction d (buildIslands) into _jt, or null */
function jumpCached(G, a, d) {
  const base = G.jumpBase[a];
  if (base < 0) return null;
  const v = G.jumps[base + d];
  if (v < 0) return null;
  _jt[0] = v >> 4; _jt[1] = v & 15;
  return _jt;
}
const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * @param {import('./NavGrid.js').NavGrid} grid
 * @param {{x:number, z:number}} from @param {{x:number, z:number}} to
 * @param {{maxExpand?: number, snap?: number, links?: boolean, toward?: {x:number, z:number}}} [opts]
 */
export function findPath(grid, from, to, opts = {}) {
  const res = { points: [], links: [], partial: false, expansions: 0, goal: null, ok: false, unstuck: false };
  if (!grid) return res;
  grid.checkLinks?.();
  // off the nav (knocked into a stream, a bush edge): start from the nearest walkable cell within the snap radius
  let start = grid.nearestWalkable(from.x, from.z, 1.5);
  if (start < 0) start = grid.nearestWalkable(from.x, from.z, opts.snap ?? NAV.snap);
  if (start < 0) return res;
  let goal = grid.nearestWalkable(to.x, to.z, opts.snap ?? NAV.snap);
  // trap pockets (markTraps): never route INTO one unless the goal is in it; started in one (walked / knocked in), the
  // way out is the nearest cell outside it (she walks over to it; the stuck detector handles a real wall)
  const trap = grid.trap && grid.comp && grid.comp.length === grid.size ? grid.trap : null, comp = trap ? grid.comp : null;
  const outside = trap ? (k) => trap[k] === 0 : null;
  if (trap && trap[start] && (goal < 0 || comp[goal] !== comp[start])) {
    const alt = grid.nearestWalkable(from.x, from.z, 2.5, outside);
    if (alt >= 0) { start = alt; res.unstuck = true; }
  }
  if (trap && goal >= 0 && trap[goal] && comp[goal] !== comp[start]) goal = grid.nearestWalkable(to.x, to.z, opts.snap ?? NAV.snap, outside);
  // islands the start cannot reach (a roof, a wall-ringed yard, the far side of a lake): snap the goal to the nearest
  // cell of a reachable island at once instead of letting A* flood the whole reachable area to its expansion cap
  let snapped = false, farCap = false;
  const reach = reachableIslands(grid, start);
  if (reach && (goal < 0 || !reach[grid.comp[goal]])) {
    const C = grid.comp, T = grid.trap, sc = C[start];
    const okCell = (k) => reach[C[k]] === 1 && (T[k] === 0 || C[k] === sc);
    const alt = grid.nearestWalkable(to.x, to.z, Math.max(REACH_SNAP, opts.snap ?? NAV.snap), okCell);
    if (alt >= 0) { goal = alt; snapped = true; }
    else farCap = true;                                              // nothing reachable near it: a short search only
  }
  res.snapped = snapped;
  const s = scratch(grid);
  const links = opts.links !== false;
  const nx = grid.nx, cell = grid.cell, TIE = 1.001;
  const flag = grid.flag, H = grid.h, nz = grid.nz, stepUp = NAV.stepUp, stepDiag = NAV.stepUp * Math.SQRT2;
  const walk = (k) => { const f = flag[k]; return f === WALK || (f === 0 && grid.probe(k) === WALK); };
  /** the jump links cached by buildIslands (this grid version + link set), else jumpTarget scans per query */
  const J = links ? freshIslands(grid) : null;
  const maxExp = farCap ? Math.min(opts.maxExpand ?? NAV.maxExpand, FAR_EXPAND) : opts.maxExpand ?? NAV.maxExpand;
  // without a walkable goal: search toward the raw point and keep the closest node
  const gx = to.x, gz = to.z;

  /** One A* run from `start` to cell `goal` (-1: toward the raw point). The node chain is read from the scratch. */
  let lastRun = null;
  const search = (goal) => {
    /** a link landing in a trap pocket is only taken when the goal is in that pocket */
    const goalComp = trap && goal >= 0 ? comp[goal] : -2;
    const stamp = ++s.cur;
    if (stamp >= 0xfffffff0) { s.stamp.fill(0); s.closed.fill(0); s.cur = 1; }
    s.n = 0;
    // octile heuristic in metres, nudged up 0.1 % to break ties toward the goal (far fewer expansions on open ground;
    // the path stays within 0.1 % of optimal)
    const gi = goal >= 0 ? goal % nx : 0, gj = goal >= 0 ? (goal / nx) | 0 : 0;
    const hgoal = goal >= 0
      ? (k) => { const dx = Math.abs((k % nx) - gi), dz = Math.abs(((k / nx) | 0) - gj); return cell * TIE * (dx > dz ? dx + 0.41421356 * dz : dz + 0.41421356 * dx); }
      : (k) => Math.hypot(grid.cx(k) - gx, grid.cz(k) - gz) * TIE;
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
      const ai = a % nx, aj = (a / nx) | 0, ga = s.g[a], ha0 = H[a];
      for (let d = 0; d < 8; d++) {
        const di = DIRS[d][0], dj = DIRS[d][1], i = ai + di, j = aj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const b = j * nx + i;
        let nb = -1, cost = 0, lk = 0;
        // the walking step (inlined NavGrid.step): |dh| ≤ stepUp; diagonals need both orthogonal cells
        let ok = walk(b);
        if (ok) {
          const dh = Math.abs(H[b] - ha0);
          if (d < 4) ok = dh <= stepUp;
          else {
            const c1 = aj * nx + i, c2 = j * nx + ai;
            ok = dh <= stepDiag && walk(c1) && walk(c2) && Math.abs(H[c1] - ha0) <= stepUp && Math.abs(H[c2] - ha0) <= stepUp;
          }
        }
        if (ok) { nb = b; cost = cell * (d < 4 ? 1 : Math.SQRT2); }
        else if (links && (J ? jumpCached(J, a, d) : jumpTarget(grid, a, di, dj, _jt)) && !(trap && trap[_jt[0]] && comp[_jt[0]] !== goalComp)) {
          nb = _jt[0]; lk = _jt[1];
          cost = Math.hypot(grid.cx(nb) - grid.cx(a), grid.cz(nb) - grid.cz(a)) + NAV.linkCost;
        }
        if (nb < 0 || s.closed[nb] === s.cur) continue;
        const g = ga + cost;
        if (s.stamp[nb] === s.cur && s.g[nb] <= g) continue;
        s.stamp[nb] = s.cur; s.g[nb] = g; s.from[nb] = a; s.link[nb] = lk;
        heapPush(s, nb, g + hgoal(nb));
      }
      // authored links (open ones only)
      const al = links && grid.linkFrom ? grid.linkFrom.get(a) : undefined;
      if (al) {
        for (let q = 0; q < al.length; q++) {
          const L = al[q], nb = L.to;
          if (s.closed[nb] === s.cur || !grid.walkable(nb)) continue;
          if (trap && trap[nb] && comp[nb] !== goalComp) continue;
          const g = ga + L.cost;
          if (s.stamp[nb] === s.cur && s.g[nb] <= g) continue;
          s.stamp[nb] = s.cur; s.g[nb] = g; s.from[nb] = a; s.link[nb] = (CODE[L.kind] ?? CODE.hop) | AUTHORED;
          heapPush(s, nb, g + hgoal(nb));
        }
      }
    }
    const end = found ? goal : best;
    return (lastRun = { goal, found, end, exp, cost: s.g[end] });
  };

  let run = search(goal), expTotal = run.exp;
  // a click on a blocked cell (the face of a wall, a house) snapped to its nearest walkable cell — which may be the far
  // side, a long walk round through a gate. A detour far longer than the straight line instead takes the first walkable
  // cell back along the line toward her (or toward `opts.toward`, the camera side of the pick ray) when that is clearly
  // the shorter way to roughly the same spot.
  const k0 = grid.index(to.x, to.z);
  if (run.found && !snapped && (k0 < 0 || !grid.walkable(k0))) {
    const straight = Math.hypot(grid.cx(goal) - grid.cx(start), grid.cz(goal) - grid.cz(start));
    if (run.cost > straight * DETOUR.ratio + DETOUR.slack) {
      const okCell = (k) => k !== goal && (!reach || reach[grid.comp[k]] === 1) && (!trap || trap[k] === 0 || comp[k] === comp[start]);
      const score = (r) => r.cost + DETOUR.offWeight * Math.hypot(grid.cx(r.goal) - to.x, grid.cz(r.goal) - to.z);
      let bestRun = run, bestScore = score(run);
      const tried = new Set();
      for (const p of [opts.toward, from]) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
        const alt = firstWalkableToward(grid, to, p, okCell);
        if (alt < 0 || tried.has(alt)) continue;
        tried.add(alt);
        const r = search(alt);
        expTotal += r.exp;
        if (r.found && score(r) < bestScore) { bestRun = r; bestScore = score(r); }
      }
      if (bestRun !== run) { res.redirected = true; goal = bestRun.goal; }
      // the scratch holds the last run's chain: re-run the winner when another run came after it
      run = bestRun;
      if (run !== lastRun) { run = search(run.goal); expTotal += run.exp; }
    }
  }
  const { found, end } = run;
  res.expansions = expTotal;
  res.partial = !found || snapped;
  res.goal = { x: grid.cx(end), y: grid.h[end], z: grid.cz(end) };
  res.cost = run.cost;                                               // the grid path cost (m, + link costs)
  // walk back
  const chain = [];
  for (let k = end; k >= 0 && chain.length < 20000; k = s.from[k]) { chain.push(k); if (k === start) break; }
  chain.reverse();
  res.points = smooth(grid, chain, s, from, found && !snapped ? to : null);
  // out of a trap pocket: the first leg is the step out to the cell outside it
  if (res.unstuck && !(res.points.length && Math.hypot(res.points[0].x - grid.cx(start), res.points[0].z - grid.cz(start)) < 0.3)) {
    res.points.unshift({ x: grid.cx(start), y: grid.h[start], z: grid.cz(start) });
  }
  // the goal (or the best reachable node) is her own cell: one point there (never an empty, `ok: false` answer for a
  // reachable cell), so the caller can tell "already as close as she can get" from "nothing reachable"
  if (!res.points.length) res.points.push({ x: grid.cx(end), y: grid.h[end], z: grid.cz(end) });
  for (const q of res.points) if (q.link) res.links.push(q);
  res.ok = res.points.length > 0;
  return res;
}

/**
 * A blocked goal (a click on a wall / house face) snapped to a cell whose path costs more than ratio × the straight
 * line + slack m is re-tried from the first walkable cell back along the line toward her (or toward `opts.toward`);
 * the cheaper of path cost + offWeight × (end point → click) wins.
 */
export const DETOUR = { ratio: 2.5, slack: 4, offWeight: 2 };

/** The first walkable cell (passing `ok`) marching from `a` toward `b` in half-cell steps, or -1. */
export function firstWalkableToward(grid, a, b, ok) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  if (!(L > 0)) return -1;
  const step = grid.cell * 0.5, n = Math.ceil(L / step);
  let prev = -1;
  for (let i = 1; i <= n; i++) {
    const t = Math.min(1, (i * step) / L), k = grid.index(a.x + dx * t, a.z + dz * t);
    if (k < 0 || k === prev) continue;
    prev = k;
    if (grid.walkable(k) && (!ok || ok(k))) return k;
  }
  return -1;
}

/** a goal on an island the start cannot reach snaps to the nearest reachable cell within this many metres */
export const REACH_SNAP = 24;
/** ... and with no reachable cell that near, the partial search toward the raw point stops after this many expansions */
export const FAR_EXPAND = 1500;

/**
 * The islands reachable from cell `start` (walking + automatic and open authored links, directed: a drop is one-way), as
 * a Uint8Array over island ids, or null while the island audit (markTraps) is missing or stale (grid invalidated, links
 * changed, or the graph still building; findPath then runs plain A*). Cached per start island until the next audit.
 */
export function reachableIslands(grid, start) {
  const G = freshIslands(grid);
  if (!G || !grid.comp) return null;
  const from = grid.comp[start];
  if (from < 0) return null;
  if (G.reachFrom === from && G.reach) return G.reach;
  const mark = G.reach && G.reach.length === G.count ? G.reach : new Uint8Array(G.count);
  mark.fill(0);
  const queue = G.queue ??= new Int32Array(G.count);
  let head = 0, tail = 0;
  queue[tail++] = from; mark[from] = 1;
  while (head < tail) {
    const a = queue[head++];
    for (let e = G.start[a], e1 = G.start[a + 1]; e < e1; e++) {
      const b = G.to[e];
      if (!mark[b]) { mark[b] = 1; queue[tail++] = b; }
    }
  }
  G.reach = mark; G.reachFrom = from;
  return mark;
}

/** a fresh island graph (built for this grid version and link set), else null */
function freshIslands(grid) {
  const G = grid.islands;
  return G && G.version === grid.version && G.links === grid.linkVersion && grid.trapVersion === grid.version ? G : null;
}

/**
 * Directed island graph for reachableIslands (CSR): an edge i -> j for every automatic jump link (jumpTarget, tried
 * exactly where findPath tries it: a neighbour the plain walking step cannot reach) and every open authored link from
 * island i to island j. The same pass caches every jump link (`jumpBase[cell]` -> 8 slots of `to << 4 | code`, -1 none),
 * which findPath reads instead of re-scanning while the graph is fresh. markTraps starts the build; this advances it
 * for up to `budgetMs` (Physics.render: a slice per frame) and returns true once `grid.islands` is ready. A grid
 * invalidation or a link change mid-build drops it (the next audit starts over).
 * @param {import('./NavGrid.js').NavGrid} grid
 */
export function buildIslands(grid, budgetMs = Infinity, now = defaultNow) {
  const B = grid.islandBuild;
  if (!B) return !!freshIslands(grid);
  if (B.version !== grid.version || B.links !== grid.linkVersion || grid.comp !== B.comp || grid.trapVersion !== grid.version) { grid.islandBuild = null; return false; }
  const t0 = now(), N = grid.size, nx = grid.nx, nz = grid.nz, flag = grid.flag, H = grid.h, comp = B.comp;
  const stepUp = NAV.stepUp, stepDiag = NAV.stepUp * Math.SQRT2;
  let a = B.at, n = 0;
  for (; a < N; a++) {
    if ((++n & 255) === 0 && now() - t0 >= budgetMs) break;
    const ca = comp[a];
    if (ca < 0) continue;
    const ai = a % nx, aj = (a / nx) | 0, ha = H[a];
    let base = -1;
    for (let d = 0; d < 8; d++) {
      const i = ai + DIRS[d][0], j = aj + DIRS[d][1];
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const b = j * nx + i;
      // the plain walking step (findPath's test): a link is only looked for where it fails
      let ok = flag[b] === WALK;
      if (ok) {
        const dh = Math.abs(H[b] - ha);
        if (d < 4) ok = dh <= stepUp;
        else {
          const c1 = aj * nx + i, c2 = j * nx + ai;
          ok = dh <= stepDiag && flag[c1] === WALK && flag[c2] === WALK && Math.abs(H[c1] - ha) <= stepUp && Math.abs(H[c2] - ha) <= stepUp;
        }
      }
      if (ok) continue;
      if (base < 0) {
        if (B.nj + 8 > B.jumps.length) { const g = new Int32Array(B.jumps.length * 2); g.set(B.jumps); B.jumps = g; }
        base = B.nj; B.nj += 8;
        B.jumps.fill(-1, base, base + 8);
        B.jumpBase[a] = base;
      }
      if (jumpTarget(grid, a, DIRS[d][0], DIRS[d][1], _jt)) {
        B.jumps[base + d] = (_jt[0] << 4) | _jt[1];
        const cb = comp[_jt[0]];
        if (cb >= 0 && cb !== ca) B.edge(ca, cb);
      }
    }
  }
  B.at = a;
  if (a < N) return false;
  if (grid.linkFrom) for (const [from, list] of grid.linkFrom) for (const L of list) if (comp[from] >= 0 && comp[L.to] >= 0 && comp[from] !== comp[L.to]) B.edge(comp[from], comp[L.to]);
  const count = B.count, start = new Int32Array(count + 1), to = new Int32Array(B.ea.length);
  for (let e = 0; e < B.ea.length; e++) start[B.ea[e] + 1]++;
  for (let i = 0; i < count; i++) start[i + 1] += start[i];
  const at = start.slice(0, count);
  for (let e = 0; e < B.ea.length; e++) to[at[B.ea[e]]++] = B.eb[e];
  grid.islands = { count, start, to, edges: B.ea.length, version: B.version, links: B.links, jumpBase: B.jumpBase, jumps: B.jumps.slice(0, B.nj),
    reach: null, reachFrom: -1, queue: null };
  grid.islandBuild = null;
  return true;
}

/** Start (restart) the island-graph build for the labels markTraps just wrote. */
function startIslands(grid, comp, count) {
  const seen = new Set(), ea = [], eb = [];
  grid.islandBuild = {
    at: 0, comp, count, version: grid.version, links: grid.linkVersion,
    jumpBase: new Int32Array(grid.size).fill(-1), jumps: new Int32Array(8 * 4096), nj: 0, ea, eb,
    edge(x, y) { const key = x * count + y; if (!seen.has(key)) { seen.add(key); ea.push(x); eb.push(y); } },
  };
}

/** islands up to this many cells (0.25 m² each) are checked for a way out; bigger ones are never traps */
export const TRAP_CELLS = 64;

/**
 * Island audit (after the grid is filled, and again after invalidations / link changes): labels the walk-connected
 * islands (NavGrid.step) into `grid.comp`, and marks in `grid.trap` the cells of every small island (≤ maxCells) that
 * has NO way out: no automatic jump link (jumpTarget) and no open authored link landing in another island. Such a
 * pocket is a sink (a drop lands her there and nothing gets her out): findPath never links into one unless the goal
 * is in it, and a start inside one steps out to the nearest cell outside. Returns the number of trap islands.
 * @param {import('./NavGrid.js').NavGrid} grid
 */
export function markTraps(grid, maxCells = TRAP_CELLS) {
  const N = grid.size, nx = grid.nx, nz = grid.nz;
  const comp = grid.comp && grid.comp.length === N ? grid.comp : new Int32Array(N);
  const trap = grid.trap && grid.trap.length === N ? grid.trap : new Uint8Array(N);
  comp.fill(-1); trap.fill(0);
  const queue = new Int32Array(N), small = [];
  const flag = grid.flag, H = grid.h, stepUp = NAV.stepUp, stepDiag = NAV.stepUp * Math.SQRT2;
  const walk = (k) => { const f = flag[k]; return f === WALK || (f === 0 && grid.probe(k) === WALK); };
  let id = 0;
  for (let k0 = 0; k0 < N; k0++) {
    if (comp[k0] >= 0 || !walk(k0)) continue;
    let head = 0, tail = 0;
    queue[tail++] = k0; comp[k0] = id;
    while (head < tail) {
      const a = queue[head++], ai = a % nx, aj = (a / nx) | 0, ha = H[a];
      for (let d = 0; d < 8; d++) {
        const i = ai + DIRS[d][0], j = aj + DIRS[d][1];
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const b = j * nx + i;
        if (comp[b] >= 0 || !walk(b)) continue;
        // the walking step (as in findPath / NavGrid.step)
        const dh = Math.abs(H[b] - ha);
        if (d < 4) { if (dh > stepUp) continue; }
        else {
          const c1 = aj * nx + i, c2 = j * nx + ai;
          if (dh > stepDiag || !walk(c1) || !walk(c2) || Math.abs(H[c1] - ha) > stepUp || Math.abs(H[c2] - ha) > stepUp) continue;
        }
        comp[b] = id; queue[tail++] = b;
      }
    }
    if (tail <= maxCells) small.push(queue.slice(0, tail));
    id++;
  }
  let traps = 0;
  for (const cells of small) {
    const me = comp[cells[0]];
    let exit = false;
    for (let q = 0; q < cells.length && !exit; q++) {
      const a = cells[q];
      for (let d = 0; d < 8 && !exit; d++) if (jumpTarget(grid, a, DIRS[d][0], DIRS[d][1], _jt) && comp[_jt[0]] !== me) exit = true;
      const al = grid.linkFrom ? grid.linkFrom.get(a) : undefined;
      if (al) for (const L of al) if (comp[L.to] !== me) { exit = true; break; }
    }
    if (exit) continue;
    for (let q = 0; q < cells.length; q++) trap[cells[q]] = 1;
    traps++;
  }
  grid.comp = comp; grid.trap = trap; grid.traps = traps;
  // the directed island graph (findPath's reachability snap) only on a complete grid: lazy cells would label wrong
  // the directed island graph + jump cache (findPath's reachability snap): built in slices by buildIslands, and only on
  // a complete grid (lazy cells would label wrong)
  grid.islands = null; grid.islandBuild = null;
  if (grid.filled) startIslands(grid, comp, id);
  grid.trapVersion = grid.version; grid.trapLinks = grid.linkVersion;
  return traps;
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
      // the farthest cell in a straight walkable line: the segment end if visible (open ground), else a binary search
      // (visibility along a grid path is nearly monotone; only tested-visible cells are accepted)
      const vis = (q) => grid.losWalkable(ax, az, grid.cx(chain[q]), grid.cz(chain[q]));
      let j = segEnd;
      if (j > cur + 1 && !vis(j)) {
        let lo = cur + 1, hi = j - 1;                                    // lo: known-acceptable (adjacent cell)
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (vis(mid)) lo = mid; else hi = mid - 1; }
        j = lo;
      }
      pts.push(P(chain[j])); ax = grid.cx(chain[j]); az = grid.cz(chain[j]);
      cur = j;
    }
    if (cur === segEnd && m < chain.length) {
      const t = chain[cur], l = chain[m], code = s.link[l];
      // she never stands on a bounce cap (physics springs her off it), so she can never take a ground take-off (hop /
      // drop / gap / fence) from one: every link off a cap is a `bounce` (the follower steers the spring onto it)
      const kind = grid.bounce?.[t] === 1 ? 'bounce' : LINK_NAMES[code & 0x3f] || 'hop';
      let tp = pts[pts.length - 1];
      if (!tp || Math.hypot(tp.x - grid.cx(t), tp.z - grid.cz(t)) > 1e-3) { tp = P(t); pts.push(tp); }
      if (code & AUTHORED || kind === 'bounce' || kind === 'drop') {
        // authored take-offs are exact; a bounce takes off from the cap; a drop just walks off the edge
        tp.link = kind; tp.to = P(l); if (code & AUTHORED) tp.authored = true;
        pts.push(P(l)); ax = grid.cx(l); az = grid.cz(l);
        cur = m;
        continue;
      }
      // a jump over an obstacle needs a run-up: move the take-off back along the link (≤ 1 m) while the ground there is
      // walkable, level with it and in a straight line from the previous point
      const ux = grid.cx(l) - grid.cx(t), uz = grid.cz(l) - grid.cz(t), ul = Math.hypot(ux, uz) || 1;
      const prev = pts.length > 1 ? pts[pts.length - 2] : from;
      for (const back of [1.0, 0.75, 0.5]) {
        const qx = tp.x - (ux / ul) * back, qz = tp.z - (uz / ul) * back, qk = grid.index(qx, qz);
        if (qk < 0 || !grid.walkable(qk) || Math.abs(grid.h[qk] - tp.y) > NAV.stepUp) continue;
        if (!grid.losWalkable(qx, qz, tp.x, tp.z) || (prev && !grid.losWalkable(prev.x, prev.z, qx, qz))) continue;
        tp.x = qx; tp.z = qz; tp.y = grid.h[qk];
        break;
      }
      tp.link = kind;
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
