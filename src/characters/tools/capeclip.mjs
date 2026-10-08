// Dev tool: which kit vertices (armour, tail, body) poke through the hero cape in a pose, per bone.
// Usage: node --import ./tests/unit/_setup.mjs src/characters/tools/capeclip.mjs [pose ...]
import * as THREE from 'three';
import * as C from '../index.js';

for (const pose of process.argv.slice(2).length ? process.argv.slice(2) : ['vigil', 'idle', 'oath', 'ready']) {
  const k = C.buildKitten(C.swordcatConfig());
  const holder = new THREE.Group(); holder.add(k.root);
  k.setPose(pose, { blend: 0 });
  for (let i = 0; i < 120; i++) k.update(1 / 60);
  k.root.updateMatrixWorld(true);
  const cp = k.cape.geo.attributes.position;
  const km = k.kitMesh, kp = km.geometry.attributes.position, si = km.geometry.attributes.skinIndex;
  const v = new THREE.Vector3(), hits = new Map();
  for (let i = 0; i < kp.count; i++) {
    km.getVertexPosition(i, v);
    if (v.z > -0.04) continue;
    let best = 1e9, bz = 0;
    for (let j = 0; j < cp.count; j++) { const dx = cp.getX(j) - v.x, dy = cp.getY(j) - v.y, d = dx * dx + dy * dy; if (d < best) { best = d; bz = cp.getZ(j); } }
    if (best > 0.012 * 0.012 || v.z >= bz - 0.002) continue;
    const b = C.BONE_NAMES[si.getX(i)] ?? si.getX(i);
    const h = hits.get(b) || { n: 0, worst: 0, at: null };
    h.n++; if (bz - v.z > h.worst) { h.worst = +(bz - v.z).toFixed(3); h.at = v.toArray().map((x) => +x.toFixed(3)); }
    hits.set(b, h);
  }
  console.log(pose.padEnd(6), hits.size ? JSON.stringify(Object.fromEntries(hits)) : 'clean');
  k.dispose();
}
