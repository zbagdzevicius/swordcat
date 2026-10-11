// GLB pipeline recipe (perf_2 §5): keep only the clips the game uses, resample, dedup, prune, quantize, meshopt.
// Needs: npm i -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
//   node perf2_glbopt.mjs <in.glb> <out.glb> [clipA,clipB,...]   (no clip list = keep all clips)
// Optional: --anim-only (write only skeleton + clips: a shared animation library for same-rig characters)
//           --no-anim   (strip every clip: a mesh that binds to a shared library by bone name)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
const [inp, out, keepArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const NO_ANIM = process.argv.includes('--no-anim'), ANIM_ONLY = process.argv.includes('--anim-only');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const root = doc.getRoot();
const keep = keepArg ? new Set(keepArg.split(',')) : null;
let dropped = 0;
for (const a of root.listAnimations()) if (NO_ANIM || (keep && !keep.has(a.getName()))) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); dropped++; }
if (ANIM_ONLY) for (const m of root.listMeshes()) m.dispose();
await doc.transform(
  resample({ tolerance: 1e-4 }),     // drop redundant linear keys (lossless within tolerance)
  dedup(), weld(), prune({ keepAttributes: false }),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),   // KHR_mesh_quantization
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),                          // EXT_meshopt_compression
);
await io.write(out, doc);
console.log(`${inp.replace(/.*[\\/]/, '')}: clips kept ${root.listAnimations().length}, dropped ${dropped}`);
