// Rough static scan for per-frame allocation patterns inside hot methods (update/render/step/tick/simulate/animate/
// poll/advance/_tick*/_update*). Heuristic (brace matching on source text); use it as a to-do list, not as truth.
//   node perf2_allocscan.mjs [--list]
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '../../../src');
const HOT = /^\s*(?:async\s+)?(update|render|step|tick|simulate|animate|poll|advance|_tick\w*|_update\w*|_render\w*|_step\w*|_write|collide|separation|separateActors|moveActor|_substep|resolve\w*)\s*\([^)]*\)\s*\{/;
const PATS = [
  ['new THREE.*', /new THREE\.\w+\(/g], ['new Vector/Color/etc', /new (Vector[234]|Color|Quaternion|Matrix[34]|Euler|Box3|Sphere|Ray|Raycaster)\(/g],
  ['.clone()', /\.clone\(\)/g], ['spread [...]', /\[\.\.\./g], ['obj spread {...}', /\{\s*\.\.\./g],
  ['.filter/.map/.slice/.concat', /\.(filter|map|slice|concat|flatMap)\(/g], ['Object.entries/keys/values', /Object\.(entries|keys|values)\(/g],
  ['string key concat', /(\+\s*'[^']*'\s*\+|`[^`]*\$\{[^`]*`)/g], ['closure in loop/hot', /=>\s*[{(]?/g], ['emit({...})', /emit\([^,]+,\s*\{/g],
];
const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js') && !f.includes('manifest')) files.push(p); } }; walk(ROOT);
const byArea = {}; const rows = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').split('\n'); const area = path.relative(ROOT, f).split(path.sep)[0];
  for (let i = 0; i < src.length; i++) {
    const m = src[i].match(HOT); if (!m) continue;
    let depth = 0, j = i, body = [];
    for (; j < src.length; j++) { const l = src[j].replace(/\/\/.*$/, ''); for (const ch of l) { if (ch === '{') depth++; else if (ch === '}') depth--; } body.push([j, l]); if (depth <= 0 && j > i) break; if (depth <= 0 && j === i && l.includes('}')) break; }
    for (const [ln, l] of body) for (const [name, re] of PATS) { const c = (l.match(re) ?? []).length; if (!c) continue;
      byArea[area] ??= {}; byArea[area][name] = (byArea[area][name] ?? 0) + c; rows.push(`${path.relative(ROOT, f).replace(/\\/g, '/')}:${ln + 1} [${m[1]}] ${name}`); }
    i = j;
  }
}
const tot = Object.fromEntries(Object.entries(byArea).map(([a, o]) => [a, Object.values(o).reduce((s, v) => s + v, 0)]));
console.log('hits per area (hot methods):', JSON.stringify(Object.fromEntries(Object.entries(tot).sort((a, b) => b[1] - a[1]))));
for (const [a, o] of Object.entries(byArea).sort((x, y) => tot[y[0]] - tot[x[0]])) console.log(`  ${a}: ${Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (process.argv.includes('--list')) console.log(rows.join('\n'));
