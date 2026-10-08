// src/core/assets.manifest.js  (owner: core) — every asset path that appears literally in core files
// (config.js: MODEL_FIT, ENEMIES, BOSS_MODELS, PLACEHOLDER). Paths are relative to public/assets/.
// Areas still list what THEY load in their own manifests (duplicates are fine; prune uses the union).
import { MODEL_FIT, ENEMIES, BOSS_MODELS, PLACEHOLDER } from './config.js';

const ASSET_RE = /^(models|audio|textures|fonts)\/.+\.(glb|gltf|ogg|mp3|wav|png|jpe?g|webp|hdr|ttf|otf|woff2?)$/i;

function collect(value, out) {
  if (typeof value === 'string') { if (ASSET_RE.test(value)) out.add(value); return; }
  if (Array.isArray(value)) { for (const v of value) collect(v, out); return; }
  if (value && typeof value === 'object') for (const v of Object.values(value)) collect(v, out);
}

const paths = new Set(Object.keys(MODEL_FIT));
collect(ENEMIES, paths);
collect(BOSS_MODELS, paths);
collect(PLACEHOLDER, paths);

export default [...paths].sort();
