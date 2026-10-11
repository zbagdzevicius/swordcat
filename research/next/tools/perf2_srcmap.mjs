import fs from 'node:fs'; import path from 'node:path';
const DIST = path.join(import.meta.dirname, 'dist_perf2', 'bundle');
// --- sourcemap lookup
const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const maps = new Map();
function loadMap(file) {
  if (maps.has(file)) return maps.get(file);
  let m = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DIST, file + '.map'), 'utf8'));
    const lines = []; let src = 0, sl = 0, sc = 0, nm = 0;
    for (const ln of j.mappings.split(';')) {
      const segs = []; let col = 0;
      if (ln) for (const s of ln.split(',')) {
        const v = []; let x = 0, sh = 0;
        for (const ch of s) { let d = B.indexOf(ch); const c = d & 32; d &= 31; x += d << sh; if (c) sh += 5; else { v.push(x & 1 ? -(x >> 1) : x >> 1); x = 0; sh = 0; } }
        col += v[0]; if (v.length > 1) { src += v[1]; sl += v[2]; sc += v[3]; if (v.length > 4) nm += v[4]; segs.push([col, src, sl, v.length > 4 ? nm : -1]); }
      }
      lines.push(segs);
    }
    m = { lines, sources: j.sources, names: j.names ?? [] };
  } catch { m = null; }
  maps.set(file, m); return m;
}
export function orig(url, line, col) {
  const file = url.replace(/.*\/bundle\//, '').replace(/\?.*/, '');
  const m = loadMap(file); if (!m) return null;
  const segs = m.lines[line]; if (!segs) return null;
  let lo = 0, hi = segs.length - 1, best = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (segs[mid][0] <= col) { best = segs[mid]; lo = mid + 1; } else hi = mid - 1; }
  if (!best) return null;
  return `${m.sources[best[1]].replace(/.*\/(src|node_modules)\//, '$1/')}:${best[2] + 1}`;
}

