// src/world/Objectives.js  (owner: world) — the ctx.objectives system (§19.3):
//   start(id, cfg) → objective;  progress(id) → value;  freeze(id, on);  complete(id)
//   + add(id, n), set(id, value), get(id), list (active objectives), clear(id)
// cfg: { max = 1, value = 0, textKey, rate (units per second, e.g. The Line 100/240), needClear (arena id: the
// objective reaches max but is only `done` once that arena is cleared, e.g. the glade's net_ropes, §12.3) }.
// Every change emits objective:progress { id, value, max, textKey, frozen, done } (rate-driven ones at most 4×/s).
// Objectives are level-scoped: cleared on level unload. Pure logic (no three), node-safe.
import { E } from '../core/events.js';

export class Objectives {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Map<string, {id:string, value:number, max:number, textKey:string|null, rate:number, frozen:boolean, done:boolean, needClear:string|null, _emitT:number}>} */
    this.map = new Map();
    /** arena ids cleared in the current level */
    this.cleared = new Set();
    this._offs = [];
  }

  async init() {
    const bus = this.ctx.bus;
    this._offs.push(
      bus.on(E.LEVEL_UNLOAD, () => { this.map.clear(); this.cleared.clear(); }),
      bus.on(E.ARENA_CLEAR, (p) => this.onArenaClear(p?.id)),
    );
  }

  /** Active objectives (not done). */
  get list() { return [...this.map.values()].filter((o) => !o.done); }

  /** Start (or restart) an objective. */
  start(id, cfg = {}) {
    const o = { id, value: Math.max(0, cfg.value ?? 0), max: cfg.max ?? 1, textKey: cfg.textKey ?? null, rate: cfg.rate ?? 0,
      frozen: !!cfg.frozen, done: false, needClear: cfg.needClear ?? null, _emitT: 0 };
    this.map.set(id, o);
    this._emit(o);
    if (o.value >= o.max) this._reached(o);
    return o;
  }

  get(id) { return this.map.get(id) ?? null; }

  /** Current value (0 if the objective does not exist). */
  progress(id) { return this.map.get(id)?.value ?? 0; }

  /** Add `n` (ignored while frozen or done). */
  add(id, n = 1) {
    const o = this.map.get(id);
    if (!o || o.done || o.frozen) return;
    this.set(id, o.value + n);
  }

  /** Set the value (clamped to 0..max). */
  set(id, value) {
    const o = this.map.get(id);
    if (!o || o.done) return;
    const v = Math.max(0, Math.min(o.max, value));
    if (v === o.value) return;
    o.value = v;
    if (v >= o.max) this._reached(o); else this._emit(o);
  }

  freeze(id, on = true) { const o = this.map.get(id); if (!o || o.done || o.frozen === !!on) return; o.frozen = !!on; this._emit(o); }

  /** Mark done now (value = max). */
  complete(id) { const o = this.map.get(id); if (!o || o.done) return; o.value = o.max; o.done = true; o.frozen = false; this._emit(o); }

  /** Drop an objective without completing it. */
  clear(id) { this.map.delete(id); }

  _reached(o) {
    if (o.needClear && !this.cleared.has(o.needClear)) { this._emit(o); return; }   // waits for the arena (§12.3 glade)
    this.complete(o.id);
  }

  onArenaClear(id) {
    if (!id) return;
    this.cleared.add(id);
    for (const o of this.map.values()) if (!o.done && o.needClear === id && o.value >= o.max) this.complete(o.id);
  }

  _emit(o) { this.ctx.bus.emit(E.OBJECTIVE, { id: o.id, value: o.value, max: o.max, textKey: o.textKey, frozen: o.frozen, done: o.done }); }

  update(dt) {
    for (const o of this.map.values()) {
      if (o.done || o.frozen || !(o.rate > 0) || o.value >= o.max) continue;
      o.value = Math.min(o.max, o.value + o.rate * dt);
      if (o.value >= o.max) { this._reached(o); continue; }
      if ((o._emitT += dt) >= 0.25) { o._emitT = 0; this._emit(o); }
    }
  }

  dispose() { for (const off of this._offs) off(); this._offs.length = 0; this.map.clear(); this.cleared.clear(); }
}
