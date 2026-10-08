// src/core/ActorRegistry.js  (owner: core) — tech.md §4 + §19.1 A5.
// Linear scans are fine for n < 40 (tech.md §5); the API hides that so a spatial hash can drop in later.

/** Factions hostile to `faction` (player/ally vs enemy). */
export function isHostile(a, b) {
  if (a === 'enemy') return b === 'player' || b === 'ally';
  if (a === 'player' || a === 'ally') return b === 'enemy';
  return false;
}

const _hostile = new Map();
/** Cached filter predicate: actors hostile to `faction` (tech.md §9.2 `hostileTo`). */
export function hostileTo(faction) {
  let f = _hostile.get(faction);
  if (!f) _hostile.set(faction, (f = (actor) => isHostile(faction, actor.faction)));
  return f;
}

export class ActorRegistry {
  constructor() {
    /** @type {import('./Actor.js').Actor[]} */
    this.list = [];
    /** @type {Map<string, any>} id (cutscene actor id, e.g. 'swordcat', 'pudding', 'mochi') → actor */
    this.byId = new Map();
    this._scratch = [];
  }

  get count() { return this.list.length; }

  /**
   * Add an actor. `id` (optional) is the cutscene actor id from §5 (unique; the latest registration wins)
   * and is also added to `actor.tags`.
   */
  register(actor, id) {
    if (!this.list.includes(actor)) this.list.push(actor);
    if (id) {
      this.byId.set(id, actor);
      actor.actorId = id;
      actor.tags?.add(id);
    }
    return actor;
  }

  unregister(actor) {
    const i = this.list.indexOf(actor);
    if (i >= 0) this.list.splice(i, 1);
    for (const [k, v] of this.byId) if (v === actor) this.byId.delete(k);
  }

  /** tech.md aliases */
  add(actor, id) { return this.register(actor, id); }
  remove(actor) { this.unregister(actor); }

  /** Actor by registration id (e.g. 'swordcat'). */
  get(id) { return this.byId.get(id); }

  /** All actors whose `tags` include `tag` (or registered under that id). Returns a new array. */
  byTag(tag) {
    const out = [];
    for (const a of this.list) if (a.tags?.has(tag)) out.push(a);
    const reg = this.byId.get(tag);
    if (reg && !out.includes(reg)) out.push(reg);
    return out;
  }

  has(actor) { return this.list.includes(actor); }

  forEach(fn) { for (let i = 0; i < this.list.length; i++) fn(this.list[i], i); }

  /** Called by Game at the start of every fixed step. */
  beginStep() { for (let i = 0; i < this.list.length; i++) this.list[i].beginStep(); }

  /**
   * Actors within `r` (XZ) of `pos`, optionally filtered. Writes into `out` (default: an internal scratch
   * array that is reused by the next call — copy it if you keep it).
   */
  queryRadius(pos, r, filter = null, out = this._scratch) {
    out.length = 0;
    for (const a of this.list) {
      const dx = a.pos.x - pos.x, dz = a.pos.z - pos.z, rr = r + (a.radius ?? 0);
      if (dx * dx + dz * dz > rr * rr) continue;
      if (filter && !filter(a)) continue;
      out.push(a);
    }
    return out;
  }

  /** Nearest actor within `r` passing `filter` (XZ distance), or null. */
  nearest(pos, r = Infinity, filter = null) {
    let best = null, bd = r * r;
    for (const a of this.list) {
      if (filter && !filter(a)) continue;
      const dx = a.pos.x - pos.x, dz = a.pos.z - pos.z, d = dx * dx + dz * dz;
      if (d <= bd) { bd = d; best = a; }
    }
    return best;
  }

  clear() { this.list.length = 0; this.byId.clear(); }
}
