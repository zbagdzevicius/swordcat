// src/player/SafeGround.js  (owner: player) — ring buffer of recent safe grounded positions (GAME_DESIGN §7.1:
// "back to the last safe ground (a ring buffer of 8 grounded positions sampled every 0.5 s)"). Pure; node-safe.
import { PLAYER } from '../core/config.js';

export class SafeGround {
  /** @param {number} [size] samples kept @param {number} [every] seconds between samples */
  constructor(size = PLAYER.water.safeSamples, every = PLAYER.water.safeEvery) {
    this.size = size; this.every = every;
    /** @type {{x:number,y:number,z:number}[]} */
    this.buf = Array.from({ length: size }, () => ({ x: 0, y: 0, z: 0 }));
    this.head = 0;        // next write index
    this.count = 0;
    this.t = every;       // sample on the first safe step
  }

  /**
   * Call every fixed step. A sample is stored at most every `every` seconds while `safe` (grounded, not in
   * water, not mid-tumble).
   * @param {number} dt @param {{x:number,y:number,z:number}} pos @param {boolean} safe
   */
  update(dt, pos, safe) {
    this.t += dt;
    if (!safe || this.t < this.every) return false;
    this.t = 0;
    this.push(pos);
    return true;
  }

  push(pos) {
    const s = this.buf[this.head];
    s.x = pos.x; s.y = pos.y; s.z = pos.z;
    this.head = (this.head + 1) % this.size;
    this.count = Math.min(this.size, this.count + 1);
  }

  /** i-th most recent sample (0 = latest) or null. */
  recent(i = 0) {
    if (i >= this.count) return null;
    return this.buf[(this.head - 1 - i + this.size * 2) % this.size];
  }

  /**
   * Best position to return to: the most recent sample at least `minDist` (XZ) from `from` that passes `ok`
   * (e.g. "no deep water nearby"); else the most recent one >= `minDist`; else the farthest sample from `from`
   * that passes `ok` (or just the farthest). Without `from` it is the latest sample. Writes into `out`
   * ({x,y,z} or a Vector3) and returns true, or false when empty.
   * @param {{x:number,y:number,z:number}} out @param {{x:number,z:number}|null} [from] @param {number} [minDist]
   * @param {((s:{x:number,y:number,z:number}) => boolean)|null} [ok]
   */
  best(out, from = null, minDist = 0, ok = null) {
    if (!this.count) return false;
    let pick = this.recent(0);
    if (from) {
      const dist = (s) => Math.hypot(s.x - from.x, s.z - from.z);
      let found = null, far = null, farD = -1, okFar = null, okFarD = -1;
      for (let i = 0; i < this.count; i++) {
        const s = this.recent(i), d = dist(s), good = !ok || ok(s);
        if (!found && good && d >= minDist) found = s;
        if (d > farD) { far = s; farD = d; }
        if (good && d > okFarD) { okFar = s; okFarD = d; }
      }
      if (!found && ok) for (let i = 0; i < this.count && !found; i++) { const s = this.recent(i); if (dist(s) >= minDist) found = s; }
      pick = found ?? okFar ?? far ?? pick;
    }
    out.x = pick.x; out.y = pick.y; out.z = pick.z;
    return true;
  }

  clear() { this.count = 0; this.head = 0; this.t = this.every; }
}
