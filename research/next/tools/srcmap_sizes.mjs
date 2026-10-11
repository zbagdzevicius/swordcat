// Attribute minified bytes of a chunk to source files via its sourcemap (approx: bytes between mapping segments).
import fs from 'node:fs';
const file = process.argv[2];
const code = fs.readFileSync(file, 'utf8'); const map = JSON.parse(fs.readFileSync(file + '.map', 'utf8'));
const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const dec = (s) => { const out = []; let v = 0, sh = 0; for (const ch of s) { let d = B.indexOf(ch); const c = d & 32; d &= 31; v += d << sh; if (c) sh += 5; else { const neg = v & 1; v >>= 1; out.push(neg ? -v : v); v = 0; sh = 0; } } return out; };
const lines = code.split('\n'); const sizes = new Map(); let src = 0;
map.mappings.split(';').forEach((ln, li) => {
  const segs = ln ? ln.split(',').map(dec) : []; let col = 0; const pts = [];
  for (const s of segs) { col += s[0]; if (s.length > 1) src += s[1]; pts.push([col, s.length > 1 ? src : -1]); }
  for (let i = 0; i < pts.length; i++) { const end = i + 1 < pts.length ? pts[i + 1][0] : (lines[li]?.length ?? 0); const k = pts[i][1] < 0 ? '?' : map.sources[pts[i][1]]; sizes.set(k, (sizes.get(k) ?? 0) + end - pts[i][0]); }
});
const area = new Map(); for (const [k, v] of sizes) { const m = k.match(/src\/([^/]+)\//) ; const a = m ? m[1] : (k.includes('node_modules') ? 'node_modules' : k); area.set(a, (area.get(a) ?? 0) + v); }
console.log('AREA', [...area].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}K`).join(' | '));
console.log('TOP', [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k.replace(/.*src\//, '')} ${(v / 1024).toFixed(1)}K`).join('\n'));
