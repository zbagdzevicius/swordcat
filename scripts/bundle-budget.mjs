// scripts/bundle-budget.mjs  (owner: core) — PERF_SPEC §10.2 bundle guard (C17), run after `vite build`.
//   node scripts/bundle-budget.mjs [distDir=dist] [--report]   exit 1 when a gated chunk group is over its gzip budget
// Budgets (KB gzip): boot ≤ 140, three ≤ 215, three-addons ≤ 30, play ≤ 300, story ≤ 60, each cutscene ≤ 8,
// each enemy type ≤ 6 (boss ≤ 12), each level ≤ 15, LevelKit ≤ 40.
//
// Grouping (C16 lazy SYSTEMS): named chunks (three, levels, cutscenes, LevelKit, enemies) are matched by file name
// first. The rest is grouped from the Vite chunk graph (`dist/.vite/manifest.json`, `build.manifest: true`):
//   boot  = the entry's static closure + the `boot: true` systems' closures (ui, save, audio shell)
//   play  = the play systems' static closures minus boot (story excluded)
//   story = StoryManager's static closure minus boot and play
// Without a manifest the chunk names decide (`boot-*`, `index-*`, `UI-*`, … see NAME_GROUPS).
// Groups whose budget the current split cannot meet yet are report-only (`gate: false`, printed as "over").
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { SYSTEMS } from '../src/core/systems.js';

/** chunk-name pattern → { kb, gate } (gate false = report only until the owning area's diet lands). */
export const BUDGETS = [
  { name: 'three', test: /^three(-|\.)(?!addons)/, kb: 215, gate: true },
  { name: 'three-addons', test: /^three-addons(-|\.)/, kb: 30, gate: true },
  { name: 'cutscene', test: /^cs\d+/, kb: 8, gate: true, each: true },
  { name: 'boss', test: /^boss_/, kb: 12, gate: false, each: true },
  { name: 'enemy', test: /^(rat|crow|hyena|spider|jelly|pug|stealer)/, kb: 6, gate: false, each: true },
  { name: 'level', test: /^(meadow|forest|town|gate|bog|keep)(-|\.)/, kb: 15, gate: true, each: true },
  { name: 'LevelKit', test: /^LevelKit(-|\.)/, kb: 40, gate: true },
  // graph groups (or the NAME_GROUPS fallback). boot: ui's UI chunk alone is ≈ 100 KB gz today (requests/ui.md:
  // title shell split); the gate turns on when it lands. play: report until the characters / fx diets (S4–S7).
  { name: 'boot', graph: 'boot', kb: 140, gate: false },
  { name: 'play', graph: 'play', kb: 300, gate: false },
  { name: 'story', graph: 'story', kb: 60, gate: true },
];

/** Name fallback for the graph groups (no manifest). */
export const NAME_GROUPS = {
  boot: /^(boot|index|UI|SaveManager|AudioManager)(-|\.)/,
  play: /^(play|Physics|FollowCamera|Player|Combat|EnemyManager|CompanionManager|LevelManager|Env|Objectives|FX|characters)(-|\.)/,
  story: /^(story|StoryManager|tutorial)(-|\.)/,
};

/** gzip size (bytes) of a file. */
export const gzSize = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;

/**
 * Basenames per graph group from a Vite manifest ({ key: {file, imports?, isEntry?} }).
 * @param {Record<string, {file: string, imports?: string[], isEntry?: boolean}>} manifest
 * @param {{file: string, boot: boolean, key: string}[]} [systems]
 * @returns {{boot: Set<string>, play: Set<string>, story: Set<string>}}
 */
export function graphGroups(manifest, systems = SYSTEMS) {
  const closure = (keys, out = new Set()) => {
    const stack = [...keys];
    while (stack.length) {
      const k = stack.pop(), e = manifest[k];
      if (!e) continue;
      const f = path.basename(e.file);
      if (out.has(f)) continue;
      out.add(f);
      for (const i of e.imports ?? []) stack.push(i);
    }
    return out;
  };
  const src = (s) => `src/${s.file}`;
  const boot = closure([...Object.keys(manifest).filter((k) => manifest[k].isEntry),
    ...systems.filter((s) => s.boot).map(src)]);
  const minus = (set, ...others) => { for (const o of others) for (const f of o) set.delete(f); return set; };
  const play = minus(closure(systems.filter((s) => !s.boot && s.key !== 'story').map(src)), boot);
  const story = minus(closure(systems.filter((s) => s.key === 'story').map(src)), boot, play);
  return { boot, play, story };
}

/**
 * Check every JS chunk under `<dist>/bundle` against BUDGETS.
 * @param {string} dist
 * @returns {{rows: {group: string, file: string, kb: number, budget: number, ok: boolean, gate: boolean}[], fail: boolean, unmatched: {file: string, kb: number}[]}}
 */
export function checkBundle(dist) {
  const dir = path.join(dist, 'bundle');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
  const mf = path.join(dist, '.vite', 'manifest.json');
  const graph = fs.existsSync(mf) ? graphGroups(JSON.parse(fs.readFileSync(mf, 'utf8'))) : null;
  const inGraph = (g, f) => (graph ? graph[g].has(f) : NAME_GROUPS[g].test(f));
  const rows = [], unmatched = [], sums = new Map();
  for (const f of files) {
    const kb = gzSize(path.join(dir, f)) / 1024;
    const b = BUDGETS.find((x) => (x.test ? x.test.test(f) : inGraph(x.graph, f)));
    if (!b) { unmatched.push({ file: f, kb }); continue; }
    if (b.each) rows.push({ group: b.name, file: f, kb, budget: b.kb, ok: kb <= b.kb, gate: b.gate });
    else {
      const prev = sums.get(b.name);
      sums.set(b.name, { b, kb: (prev?.kb ?? 0) + kb, files: [...(prev?.files ?? []), f] });
    }
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
    const files = r.file.length > 90 ? r.file.slice(0, 87) + '...' : r.file;
    console.log(`${r.ok ? 'ok  ' : r.gate ? 'FAIL' : 'over'} ${r.group.padEnd(13)} ${r.kb.toFixed(1).padStart(7)} KB gz / ${r.budget} KB  ${files}`);
  }
  for (const u of unmatched.sort((a, b) => b.kb - a.kb)) console.log(`     (lazy/other) ${u.kb.toFixed(1).padStart(7)} KB gz  ${u.file}`);
  if (fail && !reportOnly) { console.error('[bundle-budget] over budget (PERF §10.2)'); process.exit(1); }
  console.log(fail ? '[bundle-budget] over budget (report only)' : '[bundle-budget] within the gated budgets');
}
