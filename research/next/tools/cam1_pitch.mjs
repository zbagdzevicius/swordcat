// cam_1: how much a pitch bump buys on the down-screen (camera-side) blind zone. node research/next/tools/cam1_pitch.mjs
import { solveFrame, RIG } from './cam1_framing.mjs';
const DEG = Math.PI / 180, her = [0, 0, 0], S = new Float32Array(96), out = {};
const put = (i, x, z, r, w, f = 1, y = 0.5) => S.set([x, y, z, r, w, f], i * 6);
const cases = [['rat 5 m down', () => { put(0, 0, -5, 0.6, 2); return 1; }], ['rat 7 m down', () => { put(0, 0, -7, 0.6, 2); return 1; }],
  ['6 ring 6 m', () => { [[5,-3],[-5,-3],[0,6],[6,4],[-6,5],[0,-6]].forEach(([x,z],i)=>put(i,x,z,0.6,1)); return 6; }],
  ['B1 8 m down r1.9', () => { put(0, 0, -8, 1.9, 1, 3, 1.0); return 1; }]];
console.log('case | +0 deg | +4 deg | +8 deg   (lean cap 4 m; need d)');
for (const [name, mk] of cases) {
  const c = [];
  for (const bump of [0, 4, 8]) { const n = mk(); const R = { ...RIG, her: { x: 0.75, y: 0.75 }, pitchNear: (46 + bump) * DEG, pitchFar: (58 + bump) * DEG };
    solveFrame(her, S, n, { bias: 0.6, maxLean: 4, dBase: 13, dCap: 40, centre: 0.1 }, out, R); c.push(out.need.toFixed(1)); }
  console.log(name + ' | ' + c.join(' | '));
}
