// src/core/EventBus.js  (owner: core) — tech.md §4.4. Pure; safe to import in node.
import { KNOWN } from './events.js';

/**
 * Synchronous pub/sub. Handlers run in subscription order; a throwing handler is logged and the
 * remaining handlers still run. `on` returns an unsubscribe function.
 */
export class EventBus {
  #m = new Map();
  #taps = new Set();

  /** @param {string} type @param {(payload:any)=>void} fn @returns {() => boolean} unsubscribe */
  on(type, fn) {
    let s = this.#m.get(type);
    if (!s) this.#m.set(type, (s = new Set()));
    s.add(fn);
    return () => s.delete(fn);
  }

  /** Subscribe for one emission only. */
  once(type, fn) {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }

  off(type, fn) { this.#m.get(type)?.delete(fn); }

  /** Resolves with the next payload of `type` (optionally matching `filter`). */
  wait(type, filter = null) {
    return new Promise((resolve) => {
      const off = this.on(type, (p) => { if (!filter || filter(p)) { off(); resolve(p); } });
    });
  }

  /**
   * Observe every emission (debug ring buffer, logging). `fn(type, payload)`.
   * @returns {() => boolean} unsubscribe
   */
  tap(fn) { this.#taps.add(fn); return () => this.#taps.delete(fn); }

  emit(type, payload) {
    if (!KNOWN.has(type)) console.warn(`[bus] unknown event "${type}"`);
    for (const t of this.#taps) { try { t(type, payload); } catch (e) { console.error('[bus] tap threw', e); } }
    const s = this.#m.get(type);
    if (!s || s.size === 0) return;
    for (const fn of [...s]) {
      try { fn(payload); } catch (e) { console.error(`[bus] handler for ${type} threw`, e); }
    }
  }

  /** Number of listeners for `type` (tests / debug). */
  count(type) { return this.#m.get(type)?.size ?? 0; }

  clear() { this.#m.clear(); this.#taps.clear(); }
}
