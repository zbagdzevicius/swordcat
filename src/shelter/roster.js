// src/shelter/roster.js  (owner: R, TOKENTAILS-PLAN §12.1 / §12.3): which real Pink Paw cat fills each save slot.
//
// 25 slots: 18 lost kittens, 3 squires, 4 service kittens. pickles, pebble, muffin and socks keep Judas, Simas, Raudvis
// and Zare (their 3D coats match). Every other slot takes the next cat from a shuffle seeded once per install, skipping
// names already used, names that repeat in the gallery, odd names and a small blocklist. The picks live in localStorage
// (`swordcat.shelter.v1`) and are re-checked against the live gallery at boot: an unsaved slot whose cat left the
// shelter gets a new cat; a saved slot keeps its name but shows no status (and no treat button).
//
// The gallery is fetched ONLY on tokentails.com (same-origin frame, CORS allows it), once per boot, credentials
// omitted. Any other host uses the bundled snapshot (src/shelter/snapshot.js) and makes no request. Snapshot cats
// carry no status. Only `atShelter` cats (WAITING / RECOVERING) are ever used; the `adopted` list is never read.
// Pure logic + a thin browser shell; node-safe (fetch and storage are injected in tests).
import { SNAPSHOT } from './snapshot.js';
import { E } from '../core/events.js';

export const CAT_SAVED = E.CAT_SAVED ?? 'cat:saved';

export const STORE_KEY = 'swordcat.shelter.v1';
export const GALLERY_URL = 'https://api.tokentails.com/shelter/rozine-pedute/gallery';
/** Hosts that may GET the gallery (CORS on the API allows tokentails.com only). */
export const API_HOSTS = Object.freeze(['tokentails.com']);

export const LOST_SLOTS = Object.freeze(['biscuit', 'noodle', 'button', 'pickles', 'pebble', 'sprout', 'waffles', 'toffee', 'muffin',
  'tater', 'mittens', 'socks', 'juniper', 'bramble', 'fennel', 'bean', 'crumpet', 'dumpling']);
export const SQUIRE_SLOTS = Object.freeze(['mochi', 'sage', 'clover']);
export const SERVICE_SLOTS = Object.freeze(['marmalade', 'tofu', 'earlgrey', 'pip']);
/** Every slot, in pick order (reachable slots first so they get the first cats of the shuffle). */
export const SLOTS = Object.freeze([...SQUIRE_SLOTS, ...SERVICE_SLOTS, ...LOST_SLOTS]);
/** Bog and keep kittens: mapped to a cat but never promised (their levels are stubs). */
export const UNREACHABLE = Object.freeze(['juniper', 'bramble', 'fennel', 'bean', 'crumpet', 'dumpling']);
export const REACHABLE = Object.freeze(SLOTS.filter((s) => !UNREACHABLE.includes(s)));

/** The four licensed named cats, kept in their slots (§2.5). Local images in public/pink-paw/. */
export const FIXED = Object.freeze({
  pickles: Object.freeze({ id: '6a3055e21d6649b19b03688a', name: 'Judas' }),
  pebble: Object.freeze({ id: '6a304e8f1d6649b19b036500', name: 'Simas' }),
  muffin: Object.freeze({ id: '6a3050201d6649b19b0365ec', name: 'Raudvis' }),
  socks: Object.freeze({ id: '6a304f0e1d6649b19b036534', name: 'Zare' }),
});

/** Names never used (case-insensitive substring), plus every in-game character name (no confusing double names). */
export const BLOCKLIST = Object.freeze(['viagra', 'casino', 'crypto', 'adopt', 'test']);
export const GAME_NAMES = Object.freeze(['clem', 'clementine', 'pearl', 'snowpaw', 'whiskerbottom', 'pudding', 'coo', 'pilfer',
  'grizzlechop', 'brutus', 'barkus', 'cacklejaw', 'snoozalot', 'wobble', 'sacky', ...LOST_SLOTS, ...SQUIRE_SLOTS,
  'marmalade', 'tofu', 'earl grey', 'earlgrey', 'pip']);

const NAME_RE = /^\p{L}[\p{L} '-]{1,15}$/u;
const ID_RE = /^[a-f0-9]{24}$/;
const STATUSES = new Set(['WAITING', 'RECOVERING']);

/** Slot kind. */
export function slotKind(slot) {
  return SQUIRE_SLOTS.includes(slot) ? 'squire' : SERVICE_SLOTS.includes(slot) ? 'service' : LOST_SLOTS.includes(slot) ? 'lost' : null;
}

/** Fold a name for duplicate checks: lowercase, no diacritics ("Dolė" and "Dole" are the same cat to a player). */
export function foldName(name) {
  return String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Can this name stand in the game? (letters, 2..16 chars, not blocklisted, not an in-game character name). */
export function nameOk(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) return false;
  const f = foldName(name);
  if (BLOCKLIST.some((b) => f.includes(b))) return false;
  return !GAME_NAMES.includes(f);
}

function httpsUrl(u) {
  if (typeof u !== 'string' || u.length > 300) return null;
  try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; }
}

/**
 * Parse a gallery body (GET /shelter/rozine-pedute/gallery) to clean at-shelter cats. Never reads `adopted`. Bad rows
 * are dropped. Returns null when the body is not a gallery at all.
 * @returns {{ id: string, name: string, status: 'WAITING'|'RECOVERING', photo: string|null, art: string|null }[]|null}
 */
export function parseGallery(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.atShelter)) return null;
  const out = [];
  for (const c of body.atShelter.slice(0, 500)) {
    if (!c || typeof c !== 'object' || !ID_RE.test(String(c.id)) || !STATUSES.has(c.status)) continue;
    const name = typeof c.name === 'string' ? c.name.trim().slice(0, 32) : '';
    if (!name) continue;
    out.push({ id: c.id, name, status: c.status, photo: httpsUrl(c.photo), art: httpsUrl(c.art) });
  }
  return out;
}

/** The usable pool: valid names, a name that appears twice (folded) is dropped entirely. Order kept. Pure. */
export function usablePool(cats) {
  const count = new Map();
  for (const c of cats) { const f = foldName(c.name); count.set(f, (count.get(f) ?? 0) + 1); }
  return cats.filter((c) => nameOk(c.name) && count.get(foldName(c.name)) === 1);
}

/** mulberry32: a tiny seeded PRNG (same seed, same roster). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates over the pool sorted by id (so the gallery's own order does not matter). Pure. */
export function shuffled(pool, seed) {
  const a = [...pool].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Assign a cat to every slot. Pure.
 * @param {{ seed: number, cats: object[], live: boolean, prev?: Record<string, {id,name,photo?,art?}>, saved?: Set<string>|string[] }} o
 *   cats: at-shelter cats (live gallery or snapshot); live: true when `cats` is the live gallery (then a kept cat
 *   that is not in it is "gone"); prev: the stored picks; saved: slots already saved (they keep their cat).
 * @returns {Record<string, { id: string, name: string, status: string|null, photo: string|null, art: string|null, gone?: boolean }>}
 */
export function assign({ seed, cats, live, prev = {}, saved = [] }) {
  const savedSet = saved instanceof Set ? saved : new Set(saved);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const pool = usablePool(cats);
  const out = {};
  const usedIds = new Set(), usedNames = new Set();
  const take = (slot, c, extra = {}) => {
    out[slot] = { id: c.id, name: c.name, status: live && byId.has(c.id) ? byId.get(c.id).status : null,
      photo: byId.get(c.id)?.photo ?? c.photo ?? null, art: byId.get(c.id)?.art ?? c.art ?? null, ...extra };
    usedIds.add(c.id); usedNames.add(foldName(c.name));
  };
  // 1. saved slots keep their cat no matter what (status only while still at the shelter)
  for (const slot of SLOTS) {
    const p = prev[slot];
    if (savedSet.has(slot) && p && ID_RE.test(String(p.id)) && typeof p.name === 'string') {
      const gone = live && !byId.has(p.id);
      take(slot, p, gone ? { gone: true, status: null } : {});
    }
  }
  // 2. the four named cats, while they are at the shelter (or when there is no live data)
  for (const [slot, f] of Object.entries(FIXED)) {
    if (out[slot] || usedIds.has(f.id)) continue;
    if (live && !byId.has(f.id)) continue;
    take(slot, byId.get(f.id) ?? { ...f, ...snapshotImages(f.id) });
  }
  // 3. unsaved slots keep a previous pick that is still usable
  const usable = new Set(pool.map((c) => c.id));
  for (const slot of SLOTS) {
    const p = prev[slot];
    if (out[slot] || !p || usedIds.has(p.id) || usedNames.has(foldName(p.name))) continue;
    if (live ? usable.has(p.id) : (usable.has(p.id) || nameOk(p.name))) take(slot, byId.get(p.id) ?? p);
  }
  // 4. everyone else takes the next cat from the seeded shuffle
  const order = shuffled(pool, seed);
  let i = 0;
  for (const slot of SLOTS) {
    if (out[slot]) continue;
    while (i < order.length && (usedIds.has(order[i].id) || usedNames.has(foldName(order[i].name)))) i++;
    if (i >= order.length) { out[slot] = null; continue; }
    take(slot, order[i++]);
  }
  return out;
}

function snapshotImages(id) {
  const s = SNAPSHOT.cats.find((c) => c.id === id);
  return s ? { photo: s.photo ?? null, art: s.art ?? null } : {};
}

/** Status copy (§12.1 item 4). Snapshot cats (status null) show nothing. Never "adopt". */
export function statusLabel(status) {
  return status === 'WAITING' ? 'Waiting for a home' : status === 'RECOVERING' ? 'Recovering' : '';
}

/** A local asset path (public/pink-paw/...) resolved against the page; CDN URLs pass through. */
export function imageUrl(u, base = null) {
  if (!u) return null;
  if (/^https:\/\//.test(u)) return u;
  const b = base ?? (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ?? './';
  return `${b.endsWith('/') ? b : b + '/'}${u.replace(/^\.?\//, '')}`;
}

function readStore(storage) {
  try {
    const raw = storage?.getItem?.(STORE_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && d.v === 1 && Number.isFinite(d.seed) && d.slots && typeof d.slots === 'object') {
      return { v: 1, seed: d.seed >>> 0, slots: d.slots, saved: Array.isArray(d.saved) ? d.saved.filter((s) => SLOTS.includes(s)) : [] };
    }
  } catch { /* storage blocked or bad JSON */ }
  return null;
}

function newSeed() {
  try { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0]; } catch { return (Math.random() * 4294967296) >>> 0; }
}

/**
 * The roster service (ctx.shelter). Boots synchronously from the stored picks (or the snapshot) and, on tokentails.com
 * only, refreshes once from the live gallery.
 */
export class Roster {
  /**
   * @param {{ host?: string, storage?: Storage|null, fetchImpl?: typeof fetch|null, seed?: number, onChange?: (r: Roster) => void, snapshot?: object }} [o]
   */
  constructor({ host = typeof location !== 'undefined' ? location.hostname : '', storage = safeStorage(), fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
    seed = null, onChange = null, snapshot = SNAPSHOT } = {}) {
    this.host = String(host ?? '').toLowerCase();
    this.storage = storage; this.fetchImpl = fetchImpl; this.onChange = onChange;
    this.snapshot = snapshot;
    const st = readStore(storage);
    this.seed = seed != null ? seed >>> 0 : st?.seed ?? newSeed();
    this.saved = new Set(st?.saved ?? []);
    this.live = false;
    this.fetches = 0;
    this.slots = assign({ seed: this.seed, cats: snapshot.cats, live: false, prev: st?.slots ?? {}, saved: this.saved });
    this._persist();
    this.ready = Promise.resolve(this);
  }

  /** Is this host allowed to call the API? */
  get apiAllowed() { return API_HOSTS.includes(this.host); }

  /** GET the live gallery once (tokentails.com only). Resolves true when live data was applied. */
  refresh() {
    if (this._refresh) return this._refresh;
    if (!this.apiAllowed || !this.fetchImpl) return (this._refresh = Promise.resolve(false));
    this.fetches++;
    this._refresh = (async () => {
      try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const to = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
        const res = await this.fetchImpl(GALLERY_URL, { method: 'GET', credentials: 'omit', headers: { accept: 'application/json' }, signal: ctl?.signal });
        if (to) clearTimeout(to);
        if (!res?.ok) return false;
        const cats = parseGallery(await res.json());
        if (!cats || cats.length < 4) return false;
        this.live = true;
        this.slots = assign({ seed: this.seed, cats, live: true, prev: this.slots, saved: this.saved });
        this._persist();
        try { this.onChange?.(this); } catch (e) { console.warn('[shelter] onChange failed', e); }
        return true;
      } catch { return false; }
    })();
    return this._refresh;
  }

  /** The cat in a slot ({ id, name, status, photo, art } or null). A saved slot whose cat left shows no status. */
  getCat(slot) {
    const c = this.slots[slot];
    return c ? { ...c } : null;
  }

  /** Slot id → real name (for strings.setRealNames). */
  names() {
    const o = {};
    for (const s of SLOTS) if (this.slots[s]?.name) o[s] = this.slots[s].name;
    return o;
  }

  isSaved(slot) { return this.saved.has(slot); }

  /** A save happened: the slot keeps its cat from now on. */
  markSaved(slot) {
    if (!SLOTS.includes(slot) || this.saved.has(slot)) return;
    this.saved.add(slot);
    this._persist();
  }

  /** Sync saved slots from the save file (a load or new game). */
  syncSaved(slots) {
    let changed = false;
    for (const s of slots ?? []) if (SLOTS.includes(s) && !this.saved.has(s)) { this.saved.add(s); changed = true; }
    if (changed) this._persist();
  }

  _persist() {
    try {
      const slots = {};
      for (const s of SLOTS) { const c = this.slots[s]; if (c) slots[s] = { id: c.id, name: c.name, photo: c.photo ?? null, art: c.art ?? null }; }
      this.storage?.setItem?.(STORE_KEY, JSON.stringify({ v: 1, seed: this.seed, slots, saved: [...this.saved] }));
    } catch { /* storage blocked: picks last for this session */ }
  }
}

/** The CAT_SAVED payload for a slot (pure): { slot, kind, catId?, catName? }. */
export function catSavedPayload(shelter, slot, kind = slotKind(slot)) {
  const c = shelter?.getCat?.(slot) ?? null;
  return { slot, kind, ...(c ? { catId: c.id, catName: c.name } : {}) };
}

/** Emit CAT_SAVED for a slot (LostKitten / CompanionManager call this once per save). */
export function emitCatSaved(ctx, slot, kind = slotKind(slot)) {
  if (!SLOTS.includes(slot)) return false;
  ctx?.bus?.emit?.(CAT_SAVED, catSavedPayload(ctx.shelter, slot, kind));
  return true;
}

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
