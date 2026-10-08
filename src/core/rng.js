// src/core/rng.js  (owner: core) — seeded PRNG (mulberry32). tech.md §2: no Math.random() in gameplay.
// ctx.rng is a callable `() => number` in [0, 1) with helper methods attached. Pure; node-safe.

/** Raw mulberry32 generator. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string (or number) to a 32-bit seed (FNV-1a). */
export function hashSeed(s) {
  const str = String(s);
  let h = 0x811C9DC5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * @typedef {(() => number) & {
 *   seed: number, range(a:number,b:number):number, int(a:number,b:number):number, pick<T>(arr:T[]):T,
 *   chance(p:number):boolean, sign():number, angle():number, shuffle<T>(arr:T[]):T[], fork(salt:string|number):Rng,
 *   reseed(seed:number):void }} Rng
 */

/** Create a seeded rng. `fork(salt)` derives an independent stream (e.g. per level) without consuming this one. */
export function createRng(seed = 1) {
  let next = mulberry32(seed);
  /** @type {Rng} */
  const rng = /** @type {any} */ (() => next());
  rng.seed = seed >>> 0;
  rng.range = (a, b) => a + (b - a) * next();
  rng.int = (a, b) => a + Math.floor(next() * (b - a + 1));          // inclusive
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  rng.sign = () => (next() < 0.5 ? -1 : 1);
  rng.angle = () => next() * Math.PI * 2;
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  rng.fork = (salt) => createRng((hashSeed(salt) ^ Math.imul(rng.seed, 0x9E3779B1)) >>> 0);
  rng.reseed = (s) => { rng.seed = s >>> 0; next = mulberry32(rng.seed); };
  return rng;
}
