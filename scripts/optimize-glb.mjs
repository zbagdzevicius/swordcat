// scripts/optimize-glb.mjs  (owner: core) — PERF_SPEC §10.3 GLB pipeline (C18), from research/next/tools/perf2_glbopt.mjs.
//   node scripts/optimize-glb.mjs <in.glb> <out.glb> [clipA,clipB,...] [--anim-only] [--no-anim]
//   node scripts/optimize-glb.mjs --batch <listFile.json>     [{ "in": "...", "out": "...", "keep": ["Idle", ...], "mode": "anim-only"|"no-anim" }]
// Steps: prune unused clips (channels + samplers too, or prune() keeps their accessors) → resample → dedup → weld →
// prune → quantize (position 14, normal 10, uv 12 bits) → meshopt (medium). No Draco (meshopt decodes faster).
//   --anim-only : skeleton + clips only (a shared clip library per rig family, e.g. anims/kaykit_humanoid.glb)
//   --no-anim   : strip every clip (a mesh that binds to a shared library by bone name; Assets.animLib)
// Needs (dev only, not installed by default):
//   npm i -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
// Outputs land where you point them; the shared public/assets library is never rewritten in place by this script.
import fs from 'node:fs';
import path from 'node:path';

const DEPS = ['@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions', 'meshoptimizer'];

async function loadDeps() {
  try {
    const [core, ext, fn, mo] = await Promise.all(DEPS.map((d) => import(d)));
    return { NodeIO: core.NodeIO, ALL_EXTENSIONS: ext.ALL_EXTENSIONS, ...fn, MeshoptEncoder: mo.MeshoptEncoder, MeshoptDecoder: mo.MeshoptDecoder };
  } catch (e) {
    console.error(`[optimize-glb] missing dev dependencies (${e?.message ?? e}).\n  npm i -D ${DEPS.join(' ')}`);
    process.exit(2);
  }
}

/**
 * Optimise one GLB.
 * @param {any} D deps @param {{in: string, out: string, keep?: string[]|null, mode?: 'anim-only'|'no-anim'|null}} job
 */
export async function optimizeOne(D, job) {
  const io = new D.NodeIO().registerExtensions(D.ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': D.MeshoptEncoder, 'meshopt.decoder': D.MeshoptDecoder });
  const doc = await io.read(job.in);
  const root = doc.getRoot();
  const keep = job.keep?.length ? new Set(job.keep) : null;
  const noAnim = job.mode === 'no-anim', animOnly = job.mode === 'anim-only';
  let dropped = 0;
  for (const a of root.listAnimations()) {
    if (noAnim || (keep && !keep.has(a.getName()))) {
      for (const c of a.listChannels()) c.dispose();
      for (const s of a.listSamplers()) s.dispose();
      a.dispose(); dropped++;
    }
  }
  if (animOnly) for (const m of root.listMeshes()) m.dispose();
  await doc.transform(
    D.resample({ tolerance: 1e-4 }),
    D.dedup(), D.weld(), D.prune({ keepAttributes: false }),
    D.quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    D.meshopt({ encoder: D.MeshoptEncoder, level: 'medium' }),
  );
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  await io.write(job.out, doc);
  const a = fs.statSync(job.in).size, b = fs.statSync(job.out).size;
  console.log(`${path.basename(job.in)} → ${path.basename(job.out)}: ${(a / 1048576).toFixed(2)} → ${(b / 1048576).toFixed(2)} MB, clips kept ${root.listAnimations().length}, dropped ${dropped}`);
  return { in: a, out: b, dropped };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const pos = args.filter((a) => !a.startsWith('--'));
  let jobs;
  if (flags.has('--batch')) jobs = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
  else if (pos.length >= 2) jobs = [{ in: pos[0], out: pos[1], keep: pos[2] ? pos[2].split(',') : null, mode: flags.has('--anim-only') ? 'anim-only' : flags.has('--no-anim') ? 'no-anim' : null }];
  else { console.error('usage: node scripts/optimize-glb.mjs <in.glb> <out.glb> [clips] [--anim-only|--no-anim] | --batch <jobs.json>'); process.exit(1); }
  const D = await loadDeps();
  await D.MeshoptEncoder.ready; await D.MeshoptDecoder.ready;
  for (const j of jobs) await optimizeOne(D, j);
}
