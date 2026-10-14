// scripts/copy-to-tokentails.mjs  (owner: core) — copy the production build into the Token Tails client, same-origin at
// tokentails.com/swordcat-game/ (the /swordcat page frames /swordcat-game/index.html), like Catnip Heist's
// `npm run build:client` → client/public/heist-game/. `base: './'` keeps every URL in dist/ relative, so the build works
// under that folder unchanged.
//
//   npm run build:tokentails                     # npm run build, then this copy
//   node scripts/copy-to-tokentails.mjs [--dest <dir>] [--dry-run]
//   TT_SWORDCAT_DEST=<dir> node scripts/copy-to-tokentails.mjs
//
// Default dest: ../tokentails-swordcat/client/public/swordcat-game (the worktree next to this repo). The folder is
// replaced (a stale hashed bundle never lingers). dist/.vite (the chunk manifest for scripts/bundle-budget.mjs) and
// source maps are left out. Prints the file count, total size and the largest files; refuses (exit 2) when a single
// file is over MAX_FILE_MB (GitHub's 50 MB warning; 100 MB is a hard limit) unless --force.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
export const MAX_FILE_MB = 50;
const SRC = path.join(ROOT, 'dist');
const DEST = path.resolve(opt('--dest') ?? process.env.TT_SWORDCAT_DEST ?? path.join(ROOT, '..', 'tokentails-swordcat', 'client', 'public', 'swordcat-game'));
const DRY = args.includes('--dry-run'), FORCE = args.includes('--force');

/** Should `rel` (a path inside dist/) be copied? Pure. */
export function shipped(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.includes('.vite')) return false;
  if (rel.endsWith('.map')) return false;
  if (parts.some((p) => p === '.DS_Store')) return false;
  return true;
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push({ abs: p, rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(path.join(SRC, 'index.html'))) { console.error('[copy] dist/index.html missing: run `npm run build` first'); process.exit(1); }
  if (!fs.existsSync(path.dirname(DEST))) { console.error(`[copy] ${path.dirname(DEST)} does not exist (pass --dest or TT_SWORDCAT_DEST)`); process.exit(1); }
  const files = walk(SRC).filter((f) => shipped(f.rel));
  const total = files.reduce((s, f) => s + f.size, 0), MB = (n) => (n / 1048576).toFixed(1);
  const big = [...files].sort((a, b) => b.size - a.size);
  console.log(`[copy] ${files.length} files, ${MB(total)} MB → ${DEST}`);
  for (const f of big.slice(0, 5)) console.log(`   ${MB(f.size).padStart(6)} MB  ${f.rel}`);
  const over = big.filter((f) => f.size > MAX_FILE_MB * 1048576);
  if (over.length && !FORCE) { console.error(`[copy] ${over.length} file(s) over ${MAX_FILE_MB} MB: not copied (--force to copy anyway)`); process.exit(2); }
  if (DRY) process.exit(0);
  fs.rmSync(DEST, { recursive: true, force: true });
  for (const f of files) {
    const to = path.join(DEST, f.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f.abs, to);
  }
  console.log('[copy] done');
}
