// src/world/noise.js  (owner: world) — tiny seeded value-noise / fbm helpers and polyline maths for LevelKit,
// Terrain and scatter. Pure; node-safe; no allocations in the hot functions.

/** 2D integer hash → [0, 1). `seed` decorrelates levels. */
export function hash2(ix, iz, seed = 0) {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1) at (x, z) (lattice spacing 1). */
export function valueNoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = fade(x - ix), fz = fade(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/**
 * Fractal value noise in roughly [-1, 1]. `freq` = base frequency (1/m), `octaves`, gain 0.5, lacunarity 2.03.
 */
export function fbm(x, z, { freq = 0.02, octaves = 3, seed = 0, gain = 0.5, lac = 2.03 } = {}) {
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * (valueNoise(x * f + o * 17.31, z * f - o * 9.73, seed + o * 101) * 2 - 1);
    norm += amp; amp *= gain; f *= lac;
  }
  return sum / norm;
}

/** fbm with positional arguments (no option object: the terrain's hot loop). */
export function fbmP(x, z, freq, octaves, seed) {
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * (valueNoise(x * f + o * 17.31, z * f - o * 9.73, seed + o * 101) * 2 - 1);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

/** smoothstep(a, b, x) */
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Distance from (x, z) to a polyline [[x, z], ...]. Also writes the closest segment parameter into `out`
 * ({ i, t, along }) when given (`along` = metres from the polyline start).
 */
export function distToPolyline(x, z, pts, out = null) {
  let best = Infinity, bi = 0, bt = 0, acc = 0, bestAlong = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, len = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const dx = x - (ax + vx * t), dz = z - (az + vz * t), d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; bt = t; bestAlong = acc + len * t; }
    acc += len;
  }
  if (out) { out.i = bi; out.t = bt; out.along = bestAlong; }
  return Math.sqrt(best);
}

/** Total length of a polyline. */
export function polylineLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}

/** Point at `s` metres along a polyline → [x, z, yaw] (yaw = travel direction, models face +Z). */
export function pointAlong(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s || i === pts.length - 2) {
      const t = len > 0 ? Math.max(0, Math.min(1, (s - acc) / len)) : 0;
      return [ax + (bx - ax) * t, az + (bz - az) * t, Math.atan2(bx - ax, bz - az)];
    }
    acc += len;
  }
  const p = pts[pts.length - 1] ?? [0, 0];
  return [p[0], p[1], 0];
}

/**
 * Catmull-Rom resample of a polyline so carved paths bend smoothly: returns a denser [[x, z], ...].
 * @param {number[][]} pts @param {number} step metres between samples
 */
export function smoothPolyline(pts, step = 2) {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** Is (x, z) inside the oriented/axis box zone { at:[x,z], size:[w,d], yaw? }? `inset` shrinks it. */
export function inBox(x, z, at, size, inset = 0, yaw = 0) {
  let dx = x - at[0], dz = z - at[1];
  if (yaw) { const c = Math.cos(-yaw), s = Math.sin(-yaw); const rx = dx * c + dz * s, rz = -dx * s + dz * c; dx = rx; dz = rz; }
  return Math.abs(dx) <= size[0] / 2 - inset && Math.abs(dz) <= size[1] / 2 - inset;
}
