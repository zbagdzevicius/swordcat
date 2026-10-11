// Per-level preload subset sizes from every src/<area>/assets.manifest.js (levels map), by extension and area.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const areas = fs.readdirSync(path.join(ROOT, 'src')).filter((d) => fs.existsSync(path.join(ROOT, 'src', d, 'assets.manifest.js')));
const lv = {}; const all = new Set();
for (const a of areas) {
  const m = await import(pathToFileURL(path.join(ROOT, 'src', a, 'assets.manifest.js')).href);
  for (const p of m.default ?? []) all.add(p);
  for (const [k, v] of Object.entries(m.levels ?? {})) for (const p of v) (lv[k] ??= new Map()).set(p, a);
}
const sz = (p) => { try { return fs.statSync(path.join(ROOT, 'public/assets', p.replace(/^\.?\/?(public\/)?assets\//, ''))).size; } catch { return 0; } };
const mb = (b) => (b / 1e6).toFixed(2);
let allB = 0, allExt = {}; for (const p of all) { const b = sz(p); allB += b; const e = p.split('.').pop(); allExt[e] = (allExt[e] ?? 0) + b; }
console.log(`ALL manifests: ${all.size} files ${mb(allB)} MB`, JSON.stringify(Object.fromEntries(Object.entries(allExt).map(([e, b]) => [e, mb(b)]))));
const star = lv['*'] ?? new Map();
for (const [k, s] of Object.entries(lv)) {
  const merged = new Map([...(k === '*' ? [] : star), ...s]);
  let tot = 0; const byExt = {}, byArea = {}, big = [];
  for (const [p, a] of merged) { const b = sz(p); tot += b; const e = p.split('.').pop(); byExt[e] = (byExt[e] ?? 0) + b; byArea[a] = (byArea[a] ?? 0) + b; big.push([b, p]); }
  big.sort((x, y) => y[0] - x[0]);
  console.log(`\n[${k}] ${merged.size} files ${mb(tot)} MB  ext ${JSON.stringify(Object.fromEntries(Object.entries(byExt).map(([e, b]) => [e, mb(b)])))}  area ${JSON.stringify(Object.fromEntries(Object.entries(byArea).map(([e, b]) => [e, mb(b)])))}`);
  console.log('  biggest:', big.slice(0, 8).map(([b, p]) => `${mb(b)} ${p}`).join(' | '));
}
