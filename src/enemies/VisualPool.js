// src/enemies/VisualPool.js  (owner: enemies) — PERF_SPEC §3.4 enemy visual pool. A spawn takes an already dressed,
// already compiled visual (model clone + mixer + beast head + gear + its own materials and EnemyLook) instead of
// cloning, dressing and recolouring a GLB in the spawn frame; a despawn gives it back. One pool per
// `type + dressingKey`. The level prefills max(waveSize) per type under the loading veil (EnemyManager.prewarm).
//
// `Enemy` actors stay `new` per spawn (small); ids stay monotonic. Bosses, cutscene casts and one-off dressings
// (cages, a fixed plate word, Pilfer's look) are never pooled. Pool misses are counted for perf() (gate `perf:spawn`:
// `poolMisses === 0` after the prefill).
import { WARM } from './tuning.js';
import { disposeInstanceMaterials } from './rig.js';

/** Types whose dressing is fully described by `type + dressingKey` (their builds wire only VISUAL_FIELDS). */
export const POOLED_TYPES = Object.freeze(new Set(['rat_pike', 'rat_xbow', 'crow', 'hyena', 'stealer', 'spider', 'pug']));

/**
 * The pool key for a spawn of `def` with spawn `opts`, or null when it is never pooled (pure; exported for tests).
 * The key carries the dressing: hub hyenas after `gate.done` wear their friend words (`friend: true`).
 * @param {any} def resolved type def @param {any} [opts] spawn options @param {{friend?: boolean}} [dress]
 * @returns {string|null}
 */
export function dressingKey(def, opts = {}, dress = {}) {
  if (!def || !POOLED_TYPES.has(def.id) || def.boss || def.procedural || def.unknown) return null;
  const o = opts ?? {};
  if (o.scripted || o.ai === false || o.cage || o.word !== undefined || o.look || o.id === 'pilfer') return null;
  return dress.friend ? `${def.id}|friend` : def.id;
}

/** A finished visual record (Enemy.detachVisual): `{ key, fields, extraProps, vis }`. */
export class VisualPool {
  constructor() {
    /** @type {Map<string, object[]>} */
    this.free = new Map();
    /** spawns that wanted a pooled visual and found none (perf `poolMisses`) */
    this.misses = 0;
    /** spawns served from the pool */
    this.hits = 0;
  }

  /** Free visuals waiting under `key`. */
  count(key) { return this.free.get(key)?.length ?? 0; }

  /** Total free visuals. */
  get size() { let n = 0; for (const l of this.free.values()) n += l.length; return n; }

  /**
   * A free visual for `key`, or null (a miss: the caller builds one; it joins the pool on despawn).
   * @param {string|null} key
   */
  take(key) {
    if (!key) return null;
    const l = this.free.get(key);
    const rec = l?.pop() ?? null;
    if (rec) this.hits++; else this.misses++;
    return rec;
  }

  /**
   * Give a visual back. Over WARM.pool.maxPerType for its key it is disposed instead. Returns true when kept.
   * @param {object|null} rec
   */
  put(rec) {
    if (!rec?.key) return false;
    let l = this.free.get(rec.key);
    if (!l) { l = []; this.free.set(rec.key, l); }
    if (l.length >= WARM.pool.maxPerType) { disposeRecord(rec); return false; }
    l.push(rec);
    return true;
  }

  /** Dispose every pooled visual (level unload). */
  clear() {
    for (const l of this.free.values()) for (const rec of l) disposeRecord(rec);
    this.free.clear();
  }

  /** perf() counters. */
  stats() { return { size: this.size, hits: this.hits, misses: this.misses }; }
}

/** Free the GPU resources of a pooled visual nobody will take again. */
export function disposeRecord(rec) {
  const f = rec?.fields;
  if (!f) return;
  try { f.anim?.dispose?.(); } catch { /* already gone */ }
  try { f.head?.dispose?.(); } catch { /* characters' dress */ }
  try { f._plateSwap?.friend?.dispose?.(); } catch { /* texture */ }
  if (f.visual) { f.visual.removeFromParent(); disposeInstanceMaterials(f.visual); }
  rec.fields = null;
}

/**
 * PERF §3.4: the largest number of each type a level puts on the field at once (arena waves: per wave; open zones: per
 * zone), for the prefill. Pure; exported for tests. `{ zones: [{ kind: 'arena', waves: [[[type, n], ...], ...] },
 * { kind: 'open', spawns: [[type, n, ...], ...] }] }` → `{ rat_pike: 4, rat_xbow: 2, crow: 4 }`.
 */
export function waveSizes(levelDef) {
  const out = {};
  const bump = (t, n) => { if (typeof t === 'string' && t) out[t] = Math.max(out[t] ?? 0, n); };
  for (const z of levelDef?.zones ?? []) {
    if (z.kind === 'arena') {
      for (const w of z.waves ?? []) {
        const per = {};
        for (const [t, n = 1] of w) per[t] = (per[t] ?? 0) + (Number(n) || 1);
        for (const [t, n] of Object.entries(per)) bump(t, n);
      }
    } else if (z.kind === 'open') {
      const per = {};
      for (const [t, n = 1] of z.spawns ?? []) per[t] = (per[t] ?? 0) + (Number(n) || 1);
      for (const [t, n] of Object.entries(per)) bump(t, n);
    }
  }
  return out;
}
