// scripts/bundle-budget.mjs  (owner: core) — PERF_SPEC §10.2 bundle guard (C17), run after `vite build`.
//   node scripts/bundle-budget.mjs [distDir=dist] [--report]   exit 1 when a chunk group is over its gzip budget
// Budgets (KB gzip): boot ≤ 140, three ≤ 215, three-addons ≤ 30, play ≤ 300, story ≤ 60, each cutscene ≤ 8,
// each enemy type ≤ 6 (boss ≤ 12), each level ≤ 15, LevelKit ≤ 40. Groups this build does not split out yet are
// reported (not failed) until their split lands; `--report` never fails.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** chunk-name pattern → { kb, gate } (gate false = report only until the split exists). */
export const BUDGETS = [
  { name: 'boot', test: /^boot(-|\.)/, kb: 140, gate: true },
  // until C16 splits boot / play with lazy SYSTEMS, the entry chunk carries both (budget 140 + 300, report only)
  { name: 'entry (boot+play)', test: /^index(-|\.)/, kb: 440, gate: false },
  { name: 'three', test: /^three(-|\.)(?!addons)/, kb: 215, gate: true },
  { name: 'three-addons', test: /^three-addons(-|\.)/, kb: 30, gate: true },
  { name: 'play', test: /^play(-|\.)/, kb: 300, gate: true },
  { name: 'story', test: /^story(-|\.)/, kb: 60, gate: false },
  { name: 'cutscene', test: /^cs\d+/, kb: 8, gate: false, each: true },
  { name: 'boss', test: /^boss_/, kb: 12, gate: false, each: true },
  { name: 'enemy', test: /^(rat|crow|hyena|spider|jelly|pug|stealer)/, kb: 6, gate: false, each: true },
  { name: 'level', test: /^(meadow|forest|town|gate|bog|keep)(-|\.)/, kb: 15, gate: true, each: true },
  { name: 'LevelKit', test: /^LevelKit(-|\.)/, kb: 40, gate: false },
];

/** gzip size (bytes) of a file. */
export const gzSize = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;

/**
 * Check every JS chunk under `<dist>/bundle` against BUDGETS.
 * @param {string} dist @returns {{rows: {group: string, file: string, kb: number, budget: number, ok: boolean, gate: boolean}[], fail: boolean, unmatched: {file: string, kb: number}[]}}
 */
export function checkBundle(dist) {
  const dir = path.join(dist, 'bundle');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
  const rows = [], unmatched = [], sums = new Map();
  for (const f of files) {
    const kb = gzSize(path.join(dir, f)) / 1024;
    const b = BUDGETS.find((x) => x.test.test(f));
    if (!b) { unmatched.push({ file: f, kb }); continue; }
    if (b.each) rows.push({ group: b.name, file: f, kb, budget: b.kb, ok: kb <= b.kb, gate: b.gate });
    else sums.set(b.name, { b, kb: (sums.get(b.name)?.kb ?? 0) + kb, files: [...(sums.get(b.name)?.files ?? []), f] });
  }
  for (const { b, kb, files: fs2 } of sums.values()) rows.push({ group: b.name, file: fs2.join(', '), kb, budget: b.kb, ok: kb <= b.kb, gate: b.gate });
  const fail = rows.some((r) => r.gate && !r.ok);
  return { rows, fail, unmatched };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const args = process.argv.slice(2);
  const dist = args.find((a) => !a.startsWith('--')) ?? 'dist';
  const reportOnly = args.includes('--report');
  if (!fs.existsSync(path.join(dist, 'bundle'))) { console.error(`[bundle-budget] no ${dist}/bundle — run vite build first`); process.exit(1); }
  const { rows, fail, unmatched } = checkBundle(dist);
  for (const r of rows.sort((a, b) => b.kb - a.kb)) {
    console.log(`${r.ok ? 'ok  ' : r.gate ? 'FAIL' : 'over'} ${r.group.padEnd(13)} ${r.kb.toFixed(1).padStart(7)} KB gz / ${r.budget} KB  ${r.file}`);
  }
  for (const u of unmatched.sort((a, b) => b.kb - a.kb)) console.log(`     (entry/other) ${u.kb.toFixed(1).padStart(7)} KB gz  ${u.file}`);
  if (fail && !reportOnly) { console.error('[bundle-budget] over budget (PERF §10.2)'); process.exit(1); }
  console.log(fail ? '[bundle-budget] over budget (report only)' : '[bundle-budget] within budget');
}
