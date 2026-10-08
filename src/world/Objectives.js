// src/world/Objectives.js  (owner: world) — M0 STUB satisfying the ctx.objectives contract (§19.3):
//   start(id, cfg);  progress(id) → value;  freeze(id, on);  complete(id)   (+ add(id, n), get(id))
// cfg: { max = 1, value = 0, textKey, rate (per second, e.g. The Line 100/240) }. Emits objective:progress.
import { E } from '../core/events.js';

export class Objectives {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Map<string, {id:string, value:number, max:number, textKey:string|null, rate:number, frozen:boolean, done:boolean, _emitT:number}>} */
    this.map = new Map();
    this._offs = [];
  }

  async init() { this._offs.push(this.ctx.bus.on(E.LEVEL_UNLOAD, () => this.map.clear())); }

  start(id, cfg = {}) {
    const o = { id, value: cfg.value ?? 0, max: cfg.max ?? 1, textKey: cfg.textKey ?? null, rate: cfg.rate ?? 0, frozen: false, done: false, _emitT: 0 };
    this.map.set(id, o);
    this._emit(o);
    return o;
  }

  get(id) { return this.map.get(id) ?? null; }

  /** Current value (0 if the objective does not exist). */
  progress(id) { return this.map.get(id)?.value ?? 0; }

  add(id, n = 1) {
    const o = this.map.get(id); if (!o || o.done || o.frozen) return;
    o.value = Math.min(o.max, o.value + n);
    if (o.value >= o.max) this.complete(id); else this._emit(o);
  }

  freeze(id, on = true) { const o = this.map.get(id); if (!o || o.frozen === on) return; o.frozen = on; this._emit(o); }

  complete(id) { const o = this.map.get(id); if (!o || o.done) return; o.value = o.max; o.done = true; this._emit(o); }

  _emit(o) { this.ctx.bus.emit(E.OBJECTIVE, { id: o.id, value: o.value, max: o.max, textKey: o.textKey, frozen: o.frozen, done: o.done }); }

  update(dt) {
    for (const o of this.map.values()) {
      if (o.done || o.frozen || !(o.rate > 0)) continue;
      o.value = Math.min(o.max, o.value + o.rate * dt);
      if (o.value >= o.max) { this.complete(o.id); continue; }
      if ((o._emitT += dt) >= 0.25) { o._emitT = 0; this._emit(o); }
    }
  }

  dispose() { for (const off of this._offs) off(); this._offs.length = 0; this.map.clear(); }
}
