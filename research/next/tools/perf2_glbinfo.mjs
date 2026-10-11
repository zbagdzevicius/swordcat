// GLB breakdown: extensions, meshes/verts, animation clips, bytes in animation vs geometry vs images.
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f); const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bvBytes = (i) => j.bufferViews[i]?.byteLength ?? 0;
  const accBytes = (i) => { const a = j.accessors[i]; const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]; const c = { 5126: 4, 5123: 2, 5125: 4, 5121: 1, 5122: 2, 5120: 1 }[a.componentType]; return a.count * n * c; };
  const animAcc = new Set(); for (const an of j.animations ?? []) for (const s of an.samplers) { animAcc.add(s.input); animAcc.add(s.output); }
  let anim = 0; for (const i of animAcc) anim += accBytes(i);
  let verts = 0; for (const m of j.meshes ?? []) for (const p of m.primitives) verts += j.accessors[p.attributes.POSITION].count;
  let img = 0; for (const im of j.images ?? []) if (im.bufferView != null) img += bvBytes(im.bufferView);
  const chans = (j.animations ?? []).reduce((s, a) => s + a.channels.length, 0);
  console.log(`${f.replace(/.*assets\//, '')}: ${(b.length / 1e6).toFixed(2)}MB ext=[${j.extensionsUsed ?? ''}] meshes=${j.meshes?.length} verts=${verts} clips=${j.animations?.length ?? 0} channels=${chans} animBytes=${(anim / 1e6).toFixed(2)}MB imgBytes=${(img / 1e6).toFixed(2)}MB`);
}
