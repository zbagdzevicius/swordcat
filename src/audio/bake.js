// src/audio/bake.js  (owner: audio) — PERF §3.1 (P:U1): every synthesized sample (zzfx defs, the glock note, the wind's
// pink noise, the cricket and campfire beds) is built as a plain Float32Array BEFORE the first gesture, on the title /
// loading screen, in idle slices of ≤ 2 ms. The unlock then only copies PCM into AudioBuffers (≈ a memcpy per def), so
// the first key press in the meadow allocates < 1 MB and never stalls a frame. Pure and node-safe (no WebAudio).
import { ZZFX_DEFS, zzfxSamples, PCM_RATE } from './sfxDefs.js';
import { glockGen, windGen } from './procedural.js';
import { cricketGen, crackleGen } from './nature.js';

/** Idle-slice budget (ms) and the requestIdleCallback timeout (PERF §3.1). */
export const BAKE = { sliceMs: 2, idleTimeout: 200 };

/**
 * The bake list, in play-likelihood order (the wind and the hit fallbacks first). Each task makes one PCM: either
 * directly (the short zzfx defs) or as a generator that yields every few thousand samples, so a long bed spreads over
 * several slices and no slice runs past the budget by more than one chunk.
 * @param {() => number} rand  audio rng (deterministic per seed)
 * @returns {{key: string, make: () => (Float32Array|Iterator<any, Float32Array>)}[]}
 */
export function bakeTasks(rand) {
  const tasks = [
    { key: 'gen:wind', make: () => windGen(PCM_RATE, rand) },
    { key: 'gen:glock', make: () => glockGen(PCM_RATE, rand) },
  ];
  for (const [name, params] of Object.entries(ZZFX_DEFS)) tasks.push({ key: 'zz:' + name, make: () => zzfxSamples(params, PCM_RATE) });
  tasks.push({ key: 'gen:crickets', make: () => cricketGen(PCM_RATE, rand) });
  tasks.push({ key: 'gen:crackle', make: () => crackleGen(PCM_RATE, rand) });
  return tasks;
}

/**
 * Runs the bake list in budgeted slices. `step(ms)` bakes tasks until the budget is spent (at least one); `get(key)`
 * returns a baked PCM, baking it right now if it was not reached yet (rare: only before the idle slices finished).
 */
export class Prebaker {
  /** @param {() => number} rand @param {() => number} [now]  ms clock (performance.now) */
  constructor(rand, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.tasks = bakeTasks(rand);
    /** @type {Map<string, Float32Array>} */
    this.pcm = new Map();
    this.i = 0;
    this.now = now;
    this.rate = PCM_RATE;
    this._handle = null;
    this._idle = null;
    this._cancelled = false;
  }

  get done() { return this.i >= this.tasks.length; }

  /**
   * Bake for up to `budgetMs`: finished tasks count, a generator task advances chunk by chunk and resumes in the next
   * slice. Returns the number of tasks finished.
   */
  step(budgetMs = BAKE.sliceMs) {
    const t0 = this.now();
    let n = 0;
    while (!this.done) {
      const task = this.tasks[this.i];
      if (this.pcm.has(task.key)) { this.i++; n++; continue; }
      try {
        if (!task.it) {
          const r = task.make();
          if (r instanceof Float32Array) { this.pcm.set(task.key, r); this.i++; n++; if (this.now() - t0 >= budgetMs) break; continue; }
          task.it = r;
        }
        let r = task.it.next();
        while (!r.done && this.now() - t0 < budgetMs) r = task.it.next();
        if (r.done) { this.pcm.set(task.key, r.value); task.it = null; this.i++; n++; }
      } catch (e) { console.warn(`[audio] bake failed: ${task.key}`, e?.message ?? e); task.it = null; this.i++; }
      if (this.now() - t0 >= budgetMs) break;
    }
    return n;
  }

  /** Finish one task now (resuming its generator if a slice started it). */
  _run(task) {
    if (this.pcm.has(task.key)) return;
    try {
      let r = task.it ?? task.make();
      if (!(r instanceof Float32Array)) { let x = r.next(); while (!x.done) x = r.next(); r = x.value; }
      task.it = null;
      this.pcm.set(task.key, r);
    } catch (e) { console.warn(`[audio] bake failed: ${task.key}`, e?.message ?? e); }
  }

  /** Baked PCM for `key` ('zz:heartThump', 'gen:wind', …); bakes it now when the slices have not reached it yet. */
  get(key) {
    let p = this.pcm.get(key);
    if (p) return p;
    const task = this.tasks.find((t) => t.key === key);
    if (!task) return null;
    this._run(task);
    return this.pcm.get(key) ?? null;
  }

  /** Bake everything left now (tests; the unlock never calls it). */
  finish() { while (!this.done) this._run(this.tasks[this.i++]); }

  /** Baked so far, 0..1 (debug). */
  get progress() { return this.tasks.length ? this.pcm.size / this.tasks.length : 1; }

  /**
   * Schedule the slices on requestIdleCallback (timeout BAKE.idleTimeout), else setTimeout. Stops when done.
   * @param {{request: (fn: Function) => any, cancel: (h: any) => void}} [idle]
   */
  schedule(idle = defaultIdle()) {
    if (this.done || this._handle) return;
    const tick = () => {
      this._handle = null;
      if (this._cancelled) return;
      this.step(BAKE.sliceMs);
      if (!this.done) this._handle = idle.request(tick);
    };
    this._idle = idle;
    this._cancelled = false;
    this._handle = idle.request(tick);
  }

  /** Stop the scheduled slices (dispose). */
  cancel() {
    this._cancelled = true;
    if (this._handle != null && this._idle) { try { this._idle.cancel(this._handle); } catch { /* gone */ } }
    this._handle = null;
  }
}

/** requestIdleCallback (timeout BAKE.idleTimeout) where it exists, else a 16 ms timer. */
function defaultIdle() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (typeof g.requestIdleCallback === 'function') {
    return { request: (fn) => g.requestIdleCallback(fn, { timeout: BAKE.idleTimeout }), cancel: (h) => g.cancelIdleCallback?.(h) };
  }
  return { request: (fn) => setTimeout(fn, 16), cancel: (h) => clearTimeout(h) };
}
