// Micro-benchmark: ClothSim.step and HeroCape-style normal recompute, in node (no GPU). node perf2_capebench.mjs
import * as THREE from 'three';
import { ClothSim, CAPE_DEFAULTS, capeGeometry } from '../../../src/characters/Cape.js';
const sim = new ClothSim(CAPE_DEFAULTS);
sim.spheres = sim.spheres?.length ? sim.spheres : Array.from({ length: 6 }, (_, i) => ({ x: 0, y: 0.3 + i * 0.05, z: 0.05, r: 0.12 }));
const wind = { x: 0.3, y: 0, z: 0.1 };
for (let i = 0; i < 2000; i++) sim.step(1 / 60, wind);
let t = performance.now(); const N = 20000; for (let i = 0; i < N; i++) sim.step(1 / 60, wind);
console.log(`ClothSim.step: ${((performance.now() - t) / N * 1000).toFixed(1)} us/step (N=${sim.N}, cons=${sim.cons.length / 4}, spheres=${sim.spheres.length})`);
const d = CAPE_DEFAULTS; const cols = (d.cols - 1) * d.resX + 1, rows = (d.rows - 1) * d.resY + 1;
const g = capeGeometry(cols, rows, d);
for (let i = 0; i < 200; i++) g.computeVertexNormals();
t = performance.now(); for (let i = 0; i < 5000; i++) g.computeVertexNormals();
console.log(`computeVertexNormals on render grid ${cols}x${rows} (${g.attributes.position.count} verts, ${g.index ? g.index.count / 3 : 0} tris): ${((performance.now() - t) / 5000 * 1000).toFixed(1)} us`);
