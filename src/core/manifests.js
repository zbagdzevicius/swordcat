// src/core/manifests.js  (owner: core) — collects every `src/<area>/assets.manifest.js` (GAME_DESIGN §18.4, §19.6).
//
// Manifest format (each area owns its own file; paths are relative to public/assets/):
//   export default [ ...paths ];        // REQUIRED: everything the area may load, e.g. models/creatures/polypizza/Rat.glb
//   export const levels = { meadow: [...], forest: [...], '*': [...] };   // OPTIONAL: per-level preload subsets ('*' = every level)
//
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
  for (const [k, v] of Object.entries(mod?.levels ?? {})) if (Array.isArray(v)) levels[k] = v.map(normalizeAssetPath);
  return { area, all, levels };
}

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

/** Union of every manifest's per-level subset for `levelId` (plus '*'). */
export function levelAssets(levelId, manifests = loadManifests()) {
  const out = new Set();
  for (const m of manifests) for (const p of [...(m.levels[levelId] ?? []), ...(m.levels['*'] ?? [])]) out.add(p);
  return [...out];
}

/** Union of every manifest's default list. */
export function allAssets(manifests = loadManifests()) {
  const out = new Set();
  for (const m of manifests) for (const p of m.all) out.add(p);
  return [...out];
}
