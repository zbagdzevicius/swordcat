// cam_1: sensitivity of the framing need to safe-frame / lean / subject size. node research/next/tools/cam1_variants.mjs
import { solveFrame, RIG } from './cam1_framing.mjs';
const her = [0, 0, 0], S = new Float32Array(96), out = {};
const put = (i, x, z, r, w, f = 1, y = 0.5) => S.set([x, y, z, r, w, f], i * 6);
const cases = [
  ['wind-up rat 7 m down-screen', () => { put(0, 0, -7, 0.6, 2); return 1; }],
  ['wind-up rat 5 m down-screen', () => { put(0, 0, -5, 0.6, 2); return 1; }],
  ['rat 7 m right', () => { put(0, 7, 0, 0.6, 1); return 1; }],
  ['6 ring 6 m', () => { [[5,-3],[-5,-3],[0,6],[6,4],[-6,5],[0,-6]].forEach(([x,z],i)=>put(i,x,z,0.6,1)); return 6; }],
  ['B1 8 m ahead r1.9 y1.0', () => { put(0, 0, 8, 1.9, 1, 3, 1.0); return 1; }],
  ['B1 8 m down-screen r1.9', () => { put(0, 0, -8, 1.9, 1, 3, 1.0); return 1; }],
  ['B1 8 m right r1.9', () => { put(0, 8, 0, 1.9, 1, 3, 1.0); return 1; }],
];
const variants = [
  ['spec-ish: her 0.6, lean 2.5', { x: 0.6, y: 0.6 }, 2.5],
  ['her 0.75, lean 2.5', { x: 0.75, y: 0.75 }, 2.5],
  ['her 0.75, lean 4.0', { x: 0.75, y: 0.75 }, 4.0],
  ['her 0.75, lean 5.0', { x: 0.75, y: 0.75 }, 5.0],
];
console.log('case | ' + variants.map(v => v[0]).join(' | '));
for (const [name, mk] of cases) {
  const cells = [];
  for (const [, herF, lean] of variants) {
    const n = mk(); const R = { ...RIG, her: herF };
    solveFrame(her, S, n, { bias: 0.6, maxLean: lean, dBase: 13, dCap: 40, centre: 0.1 }, out, R);
    cells.push(`${out.need.toFixed(1)} m (lean ${Math.hypot(out.fx, out.fz).toFixed(1)})`);
  }
  console.log(name + ' | ' + cells.join(' | '));
}
