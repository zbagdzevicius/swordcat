// scripts/prune-assets.mjs  (owner: core) — GAME_DESIGN §18.4 step 3. Runs after `vite build`.
// Deletes from dist/assets/ every file that is not in the union of `src/*/assets.manifest.js` default lists,
// keeping each manifest GLB/GLTF's sibling `Textures/` folder and any external URIs it references, plus
// licence files (fonts are OFL: the licence must ship with them).
//
//   node scripts/prune-assets.mjs [--dry] [--dist <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Normalise a manifest path (relative to public/assets/, forward slashes). */
export function norm(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^public\//, '').replace(/^assets\//, '');
}

/** Import every src/<area>/assets.manifest.js → { area: string[] }. */
export async function collectManifests(srcDir = path.join(ROOT, 'src')) {
  const out = {};
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const f = path.join(srcDir, ent.name, 'assets.manifest.js');
    if (!fs.existsSync(f)) continue;
    const mod = await import(pathToFileURL(f).href);
    const list = Array.isArray(mod.default) ? mod.default : [];
    out[ent.name] = list.map(norm);
    for (const sub of Object.values(mod.levels ?? {})) if (Array.isArray(sub)) out[ent.name].push(...sub.map(norm));
  }
  return out;
}

/** External URIs referenced by a .glb / .gltf file (relative to the file). */
export function externalUris(file) {
  try {
    let json;
    if (file.toLowerCase().endsWith('.glb')) {
      const b = fs.readFileSync(file);
      if (b.toString('ascii', 0, 4) !== 'glTF') return [];
      const len = b.readUInt32LE(12);
      json = JSON.parse(b.toString('utf8', 20, 20 + len));
    } else json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const uris = [];
    for (const k of ['images', 'buffers']) for (const it of json[k] ?? []) if (it.uri && !it.uri.startsWith('data:')) uris.push(decodeURIComponent(it.uri));
    return uris;
  } catch { return []; }
}

const LICENCE = /(^|\/)(licen[cs]es?(\/|\.md$|\.txt$)|LICEN[CS]E[^/]*$|OFL[^/]*\.txt$|CREDITS\.md$)/i;

/**
 * Pure: which relative paths to keep. `files` are all paths under the assets dir (relative, '/' separated);
 * `wanted` are manifest paths; `uriOf(rel)` returns external URIs of a model (relative to it).
 */
export function computeKeep(files, wanted, uriOf = () => []) {
  const all = new Set(files), keep = new Set();
  for (const w of wanted) {
    const p = norm(w);
    if (!all.has(p)) continue;
    keep.add(p);
    if (/\.(glb|gltf)$/i.test(p)) {
      const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
      for (const f of files) if (f.startsWith(dir + 'Textures/')) keep.add(f);
      for (const u of uriOf(p)) { const r = path.posix.normalize(dir + u); if (all.has(r)) keep.add(r); }
    }
  }
  for (const f of files) if (LICENCE.test(f)) keep.add(f);
  return keep;
}

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

function removeEmptyDirs(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) if (ent.isDirectory()) removeEmptyDirs(path.join(dir, ent.name));
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const di = args.indexOf('--dist');
  const dist = path.resolve(ROOT, di >= 0 ? args[di + 1] : 'dist');
  const assetsDir = path.join(dist, 'assets');
  if (!fs.existsSync(assetsDir)) { console.log(`[prune] ${path.relative(ROOT, assetsDir)} not found — nothing to prune`); return; }
  const manifests = await collectManifests();
  const wanted = new Set(Object.values(manifests).flat());
  const files = walk(assetsDir);
  const keep = computeKeep(files, wanted, (rel) => externalUris(path.join(assetsDir, rel)));
  const missing = [...wanted].filter((w) => !files.includes(w));
  let removed = 0, removedBytes = 0, keptBytes = 0;
  for (const f of files) {
    const abs = path.join(assetsDir, f), size = fs.statSync(abs).size;
    if (keep.has(f)) { keptBytes += size; continue; }
    removed++; removedBytes += size;
    if (!dry) fs.unlinkSync(abs);
  }
  if (!dry) removeEmptyDirs(assetsDir);
  if (!dry && !fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  console.log(`[prune] manifests: ${Object.entries(manifests).map(([k, v]) => `${k}(${v.length})`).join(' ')}`);
  console.log(`[prune] kept ${keep.size} files (${mb(keptBytes)}), ${dry ? 'would remove' : 'removed'} ${removed} files (${mb(removedBytes)})`);
  if (missing.length) { console.error(`[prune] ${missing.length} manifest paths missing from dist/assets:\n  ${missing.join('\n  ')}`); process.exitCode = 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('[prune] failed', e); process.exit(1); });
}
