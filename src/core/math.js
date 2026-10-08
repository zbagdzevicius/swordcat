// src/core/math.js  (owner: core) — small allocation-free helpers. Pure; node-safe.
// Conventions (tech.md §2): +Y up, model forward +Z, yaw = atan2(dir.x, dir.z), positive angles = left.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x, a0, a1, b0, b1, doClamp = true) => {
  const t = invLerp(a0, a1, x);
  return lerp(b0, b1, doClamp ? clamp01(t) : t);
};

/** Frame-rate independent exponential smoothing toward b (tech.md §8). */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/** Move `cur` toward `target` by at most `maxDelta`. */
export const approach = (cur, target, maxDelta) =>
  cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target);

/** Wrap an angle to (-PI, PI]. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Shortest signed difference b - a, in (-PI, PI]. */
export const angleDiff = (a, b) => wrapAngle(b - a);

/** Interpolate angles along the shortest arc. */
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

/** Exponentially smooth an angle toward b along the shortest arc. */
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

/** Yaw (facing) from a direction (x, z). */
export const yawOf = (x, z) => Math.atan2(x, z);

/** Yaw from actor/position `from` toward `to` (anything with .pos or .x/.z). */
export function yawTo(from, to) {
  const a = from.pos ?? from, b = to.pos ?? to;
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** XZ distance between two positions (or actors). */
export function distXZ(a, b) {
  const p = a.pos ?? a, q = b.pos ?? b;
  return Math.hypot(q.x - p.x, q.z - p.z);
}

/** Squared XZ distance. */
export function dist2XZ(a, b) {
  const p = a.pos ?? a, q = b.pos ?? b;
  const dx = q.x - p.x, dz = q.z - p.z;
  return dx * dx + dz * dz;
}

export const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
/** Swing curve: fast start, soft end (tech.md §9.1). */
export const easeSwing = (u) => 1 - Math.pow(1 - u, 3);

export const EASES = { linear: (t) => t, inQuad: easeInQuad, outQuad: easeOutQuad, inCubic: easeInCubic, outCubic: easeOutCubic,
  inOutCubic: easeInOutCubic, inOutSine: easeInOutSine, outBack: easeOutBack, swing: easeSwing };

/**
 * Uniform random point in a disc around `center` (XZ), written into `out` (y copied from center).
 * @param {{x:number,y:number,z:number}} center @param {number} r @param {() => number} rng @param {any} out
 */
export function randomPointNear(center, r, rng, out) {
  const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
  out.x = center.x + Math.sin(a) * d; out.y = center.y; out.z = center.z + Math.cos(a) * d;
  return out;
}

/** Tiny critically-damped spring for secondary motion (tech.md §11.2). */
export class Spring {
  x = 0; v = 0;
  constructor(k = 120, c = 2 * Math.sqrt(k)) { this.k = k; this.c = c; }
  step(target, dt) { this.v += (this.k * (target - this.x) - this.c * this.v) * dt; this.x += this.v * dt; return this.x; }
  reset(x = 0) { this.x = x; this.v = 0; }
}
