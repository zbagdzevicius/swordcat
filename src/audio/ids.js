// src/audio/ids.js  (owner: audio) — sound id → asset path resolution against the audio manifest. Pure; node-safe.
//
//   'pickup/bubble2'                 → 'audio/sfx/pickup/bubble2.ogg'
//   'audio/sfx/pickup/bubble2.ogg'   → itself (if listed)
//   'impact/chain_0x'                → a random existing chain_01..chain_09
//   'impact/impactSoft_heavy_00x'    → a random existing _000.._009
//   'sword/swish_01–13' / '01-13'    → a random one in the range
//   'creature/c80_scream_01/02'      → one of the two
//   'music/field_of_dreams'          → 'audio/music/field_of_dreams.mp3'

const SFX_PREFIX = 'audio/sfx/';

/** Map of every short id (and full path) → path, built from a manifest list. */
export function buildIndex(paths) {
  const map = new Map();
  for (const raw of paths ?? []) {
    const p = String(raw).replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^public\//, '').replace(/^assets\//, '');
    if (!p.startsWith('audio/')) continue;
    map.set(p, p);
    const noExt = p.replace(/\.(ogg|mp3|wav)$/i, '');
    map.set(noExt, p);
    if (noExt.startsWith(SFX_PREFIX)) map.set(noExt.slice(SFX_PREFIX.length), p);
    else map.set(noExt.slice('audio/'.length), p);               // 'music/field_of_dreams'
  }
  return map;
}

const _expandCache = new Map();

/**
 * Every existing path a (possibly patterned) id refers to. Cached per index.
 * @param {string} id @param {Map<string,string>} index @returns {string[]}
 */
export function expandId(id, index) {
  if (id == null) return [];
  const raw = String(id).trim().replace(/\\/g, '/');
  const direct = index.get(raw) ?? index.get(raw.replace(/^public\//, '').replace(/^assets\//, ''));
  if (direct) return [direct];
  let perIndex = _expandCache.get(index);
  if (!perIndex) { perIndex = new Map(); _expandCache.set(index, perIndex); }
  if (perIndex.has(raw)) return perIndex.get(raw);
  const s = raw.replace(/^audio\/sfx\//, '').replace(/\.(ogg|mp3|wav)$/i, '');
  const out = [];
  const add = (k) => { const p = index.get(k); if (p && !out.includes(p)) out.push(p); };
  let m;
  if ((m = /^(.*?)(0+)x$/i.exec(s))) {
    // '..._0x' → 2 digits, '..._00x' → 3 digits: any existing number with that width
    const width = m[2].length + 1;
    for (let i = 0; i < 10 ** width && i < 1000; i++) add(m[1] + String(i).padStart(width, '0'));
  }
  if (!out.length && (m = /^(.*?)(\d+)\s*[–-]\s*(\d+)$/.exec(s))) {
    const width = m[2].length, a = +m[2], b = +m[3];
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) add(m[1] + String(i).padStart(width, '0'));
  }
  if (!out.length && (m = /^(.*?)(\d+)((?:\/\d+)+)$/.exec(s))) {
    const width = m[2].length;
    for (const n of [m[2], ...m[3].split('/').filter(Boolean)]) add(m[1] + String(+n).padStart(width, '0'));
  }
  perIndex.set(raw, out);
  return out;
}

/**
 * One path for `id` (random pick among pattern matches), or null.
 * @param {string} id @param {Map<string,string>} index @param {() => number} [rand]
 */
export function resolveId(id, index, rand = Math.random) {
  const list = expandId(id, index);
  if (!list.length) return null;
  return list.length === 1 ? list[0] : list[Math.floor(rand() * list.length) % list.length];
}

/** true if `path` is a music file. */
export const isMusicPath = (p) => /^audio\/music\//.test(String(p));
