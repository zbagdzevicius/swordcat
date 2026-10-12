// src/core/manifests.js  (owner: core) — collects every `src/<area>/assets.manifest.js` (GAME_DESIGN §18.4, §19.6).
//
// Manifest format (each area owns its own file; paths are relative to public/assets/):
//   export default [ ...paths ];        // REQUIRED: everything the area may load, e.g. models/creatures/polypizza/Rat.glb
//   export const levels = { meadow: [...], forest: [...], '*': [...] };   // OPTIONAL: per-level preload subsets ('*' = every level)
//   PERF §10.3 manifest tiers (additive; the array form still means p0):
//   export const levels = { title: [...], meadow: { p0: [...], p1: [...], p2: [...] }, '*': { p0: [...], p2: [...] } };
//   p0 = needed before the veil drops (≤ 4 MB per level, '*' p0 ≤ 0.4 MB), p1 = right after load (not awaited),
//   p2 = on zone approach / prefetch. `title` = the title backdrop (≤ 1.2 MB).
// The default list drives `scripts/prune-assets.mjs` (dist keeps only listed files) and the U15 unit test.
// `levels` drives `ctx.assets.preloadLevel(id)` (LevelManager calls it before building a level).

/** Normalise a manifest path: strip leading './', '/', 'assets/', 'public/assets/'. */
export function normalizeAssetPath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^public\//, '').replace(/^assets\//, '');
}

/**
 * Normalise one imported manifest module.
 * @param {string} area @param {{default?: string[], levels?: Record<string, string[]>}} mod
 */
export function normalizeManifest(area, mod) {
  const all = Array.isArray(mod?.default) ? mod.default.map(normalizeAssetPath) : [];
  /** @type {Record<string, string[]>} */
  const levels = {};
  /** @type {Record<string, Record<string, string[]>>} level id → tier → paths */
  const tiers = {};
  for (const [k, v] of Object.entries(mod?.levels ?? {})) {
    if (Array.isArray(v)) { levels[k] = v.map(normalizeAssetPath); tiers[k] = { p0: levels[k] }; continue; }
    if (!v || typeof v !== 'object') continue;
    tiers[k] = {};
    for (const t of TIERS) if (Array.isArray(v[t])) tiers[k][t] = v[t].map(normalizeAssetPath);
    levels[k] = tiers[k].p0 ?? [];
  }
  return { area, all, levels, tiers };
}

/** Manifest tiers in load order (PERF §10.3). */
export const TIERS = ['p0', 'p1', 'p2'];

let _cache = null;

/**
 * Every area's manifest (browser / Vite only; returns [] under plain node).
 * @returns {{area: string, all: string[], levels: Record<string, string[]>}[]}
 */
export function loadManifests() {
  if (_cache) return _cache;
  /** @type {Record<string, any>} */
  let mods = {};
  try { mods = import.meta.glob('../*/assets.manifest.js', { eager: true }) ?? {}; } catch { mods = {}; }
  _cache = Object.entries(mods).map(([file, mod]) => normalizeManifest(file.split('/').at(-2), mod));
  return _cache;
}

/**
 * Union of every manifest's per-level subset for `levelId` (plus '*') at `tier` ('p0' default = the old array form;
 * 'all' = every tier). `levelId` 'title' gives the title backdrop set (no '*').
 * @param {string} levelId @param {any[]} [manifests] @param {'p0'|'p1'|'p2'|'all'} [tier]
 */
export function levelAssets(levelId, manifests = loadManifests(), tier = 'p0') {
  const out = new Set();
  const want = tier === 'all' ? TIERS : [tier];
  const keys = levelId === 'title' ? ['title'] : [levelId, '*'];
  for (const m of manifests) {
    for (const k of keys) {
      const t = m.tiers?.[k] ?? (m.levels?.[k] ? { p0: m.levels[k] } : null);
      if (!t) continue;
      for (const w of want) for (const p of t[w] ?? []) out.add(p);
    }
  }
  return [...out];
}

/** Union of every manifest's default list. */
export function allAssets(manifests = loadManifests()) {
  const out = new Set();
  for (const m of manifests) for (const p of m.all) out.add(p);
  return [...out];
}
