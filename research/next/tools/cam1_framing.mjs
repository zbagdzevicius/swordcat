// cam_1 prototype: weighted bounding framing solver for the CONTROLS_SPEC iso rig (pure math, allocation-free).
// node research/next/tools/cam1_framing.mjs          -> scenarios + micro-benchmark
// Conventions match src/core/math.js / FollowCamera: yaw psi, screen-up ground dir u = (-sin psi, 0, -cos psi),
// screen-right r = (cos psi, 0, -sin psi); pitch theta down from horizontal; focus F; lens C = F - fwd*d.
const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;

export const RIG = {
  fov: 38 * DEG, aspect: 16 / 9, yaw: Math.PI, offNdcY: -0.08,      // she is drawn 4 % below centre
  dMin: 9, dMax: 22, pitchNear: 46 * DEG, pitchFar: 58 * DEG,
  // safe frames in rendered NDC (half extents); 'hard' subjects must be inside, 'soft' inside 'outer'
  hard: { x: 0.80, yTop: 0.80, yBot: -0.72 },   // bottom is 10 % tighter: the camera-side (down-screen) is where threats hide
  her: { x: 0.60, y: 0.60 },
};
export const pitchOf = (d, R = RIG) => lerp(R.pitchNear, R.pitchFar, clamp((d - 9) / 9, 0, 1));

/** subjects: Float32Array stride 6 [x, y, z, radius, weight, flags]; flags bit0 = hard, bit1 = boss. her = [x,y,z].
 *  out = { fx, fz, d, n } ; returns out. Zero allocation. */
function needD(her, subj, n, opts, lr, lu, R) {
  const tanV = Math.tan(R.fov / 2), tanH = tanV * R.aspect;
  const sy = Math.sin(R.yaw), cy = Math.cos(R.yaw);
  const ux = -sy, uz = -cy, rx = cy, rz = -sy;
  let d = Math.max(opts.dBase, R.dMin), th;
  for (let it = 0; it < 3; it++) {
    th = pitchOf(d, R);
    const st = Math.sin(th), ct = Math.cos(th);
    let need = opts.dBase;
    const fx = her[0] + lr * rx + lu * ux, fz = her[2] + lr * rz + lu * uz, fy = her[1] + 0.6;
    for (let i = -1; i < n; i++) {
      let px, py, pz, rr, hard;
      if (i < 0) { px = her[0]; py = her[1] + 0.4; pz = her[2]; rr = 0.6; hard = 2; }
      else { const o = i * 6; if (subj[o + 4] <= 0) continue; px = subj[o]; py = subj[o + 1]; pz = subj[o + 2]; rr = subj[o + 3]; hard = subj[o + 5] & 1; }
      const ex = px - fx, ey = py - fy, ez = pz - fz;
      const xc = ex * rx + ez * rz;                         // screen right
      const g = ex * ux + ez * uz;                          // ground forward
      const yc = g * st + ey * ct;                          // camera up = u sin + Y cos
      const a = g * ct - ey * st;                           // along view dir (fwd = u cos - Y sin)
      const fr = hard === 2 ? R.her : null;
      const sx = fr ? fr.x : hard ? R.hard.x : R.hard.x * 1.12;
      const yT = (fr ? fr.y : hard ? R.hard.yTop : 0.9) - R.offNdcY;
      const yB = R.offNdcY - (fr ? -fr.y : hard ? R.hard.yBot : -0.85);
      need = Math.max(need,
        (Math.abs(xc) + rr) / (sx * tanH) - a + rr,
        (yc + rr) / (yT * tanV) - a + rr,
        (rr - yc) / (yB * tanV) - a + rr);
    }
    d = clamp(need, R.dMin, opts.dCap);
    if (need > opts.dCap) d = need;                         // report the true need (caller clamps + drops subjects)
  }
  return d;
}

export function solveFrame(her, subj, n, opts, out, R = RIG) {
  const tanV = Math.tan(R.fov / 2), tanH = tanV * R.aspect;
  const sy = Math.sin(R.yaw), cy = Math.cos(R.yaw);
  const ux = -sy, uz = -cy, rx = cy, rz = -sy;
  // 1) weighted bounding box in the (r, u) ground axes, her always included with weight 1
  let minR = 0, maxR = 0, minU = 0, maxU = 0, wsum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 6, w = subj[o + 4]; if (w <= 0) continue;
    const dx = subj[o] - her[0], dz = subj[o + 2] - her[2], rr = subj[o + 3];
    const pr = dx * rx + dz * rz, pu = dx * ux + dz * uz;
    // weight < 1 shrinks the subject toward her for the purpose of the CENTRE (it still gets fully framed below)
    const k = Math.min(w, 1);
    minR = Math.min(minR, k * (pr - rr)); maxR = Math.max(maxR, k * (pr + rr));
    minU = Math.min(minU, k * (pu - rr)); maxU = Math.max(maxU, k * (pu + rr));
    wsum += w;
  }
  // 2) horizontal lean = bias * bbox centre on the screen-right axis (symmetric in perspective)
  let lr = (minR + maxR) * 0.5 * opts.bias;
  lr = clamp(lr, -opts.maxLean, opts.maxLean);
  // 3) vertical lean: perspective makes the frame asymmetric (≈ 10.6 m ahead vs 3.2 m behind at d 13), so a ground
  //    bbox centre is wrong. Ternary-search lu in [-maxLean, maxLean] for the smallest required d (+ a centring penalty).
  const cap = Math.sqrt(Math.max(0, opts.maxLean * opts.maxLean - lr * lr));
  let lo = -cap, hi = cap;
  for (let it = 0; it < 10; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const c1 = needD(her, subj, n, opts, lr, m1, R) + opts.centre * Math.abs(m1);
    const c2 = needD(her, subj, n, opts, lr, m2, R) + opts.centre * Math.abs(m2);
    if (c1 <= c2) hi = m2; else lo = m1;
  }
  let lu = (lo + hi) * 0.5;
  if (wsum === 0) lu = 0;
  const d = needD(her, subj, n, opts, lr, lu, R);
  out.fx = her[0] + lr * rx + lu * ux; out.fz = her[2] + lr * rz + lu * uz; out.need = d; out.d = Math.min(d, opts.dCap); out.pitch = pitchOf(out.d, R) / DEG; out.n = wsum;
  return out;
}

/** Unity-style SmoothDamp (critically damped, GPG4 ch. 1.10), state = {v}; maxSpeed caps comfort. */
export function smoothDamp(cur, goal, st, smoothTime, maxSpeed, dt) {
  const w = 2 / Math.max(1e-4, smoothTime), x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let ch = cur - goal; const maxCh = maxSpeed * smoothTime; ch = clamp(ch, -maxCh, maxCh);
  const tgt = cur - ch, tmp = (st.v + w * ch) * dt; st.v = (st.v - w * tmp) * e;
  let o = tgt + (ch + tmp) * e; if ((goal - cur > 0) === (o > goal)) { o = goal; st.v = (o - goal) / dt; }
  return o;
}

// ---------------------------------------------------------------- scenarios
if (!process.env.NOMAIN) main();
function main() {
const her = [0, 0, 0];
const S = new Float32Array(16 * 6);
const put = (i, x, z, r, w, flags = 1, y = 0.5) => S.set([x, y, z, r, w, flags], i * 6);
const out = {};
const COMBAT = { bias: 0.5, maxLean: 2.5, dBase: 13, dCap: 16, centre: 0.15 };       // +3 m auto zoom-out cap
const BOSS = { bias: 0.7, maxLean: 5, dBase: 14, dCap: 22, centre: 0.1 };
const rows = [];
function run(name, n, opts) { solveFrame(her, S, n, opts, out); rows.push([name, out.need.toFixed(2), out.d.toFixed(2), out.pitch.toFixed(1), out.fx.toFixed(2), out.fz.toFixed(2)]); }

run('explore (no subjects)', 0, COMBAT);
put(0, 2, 3, 0.6, 1); put(1, -2, 3.5, 0.6, 1); put(2, 0, 4.5, 0.6, 1);
run('3 rats ahead 3-4.5 m', 3, COMBAT);
put(0, 5, -3, 0.6, 1); put(1, -5, -3, 0.6, 1); put(2, 0, 6, 0.6, 1); put(3, 6, 4, 0.6, 1); put(4, -6, 5, 0.6, 1); put(5, 0, -6, 0.6, 1);
run('6 enemies ring 6 m (2 down-screen)', 6, COMBAT);
put(0, 0, -7, 0.6, 2); run('wind-up 7 m DOWN-screen (camera side)', 1, COMBAT);
put(0, 0, 8, 2.4, 1, 3, 1.4); run('B1 boss 8 m ahead (r 0.9+1.5)', 1, BOSS);
put(0, 10, 6, 2.4, 1, 3, 1.4); run('B1 boss 11.7 m diagonal', 1, BOSS);
put(0, 0, -11, 2.4, 1, 3, 1.4); run('B1 boss 11 m DOWN-screen', 1, BOSS);
put(0, 0, 8, 2.4, 1, 3, 1.4); put(1, 0, 18, 1.0, 1, 1, 0); run('B1 + Wheel Ride lane end 18 m', 2, BOSS);
put(0, 3, 5, 0.5, 0.6, 0); run('lost kitten 5.8 m (soft w0.6)', 1, { bias: 0.5, maxLean: 2.0, dBase: 13, dCap: 13, centre: 0.3 });
console.log('scenario | need d | d (m) | pitch (deg) | focus x | focus z');
for (const r of rows) console.log(r.join(' | '));

// ---------------------------------------------------------------- micro-benchmark (16 subjects, 2e4 solves)
for (let i = 0; i < 16; i++) put(i, Math.sin(i) * 8, Math.cos(i * 1.3) * 8, 0.6, 1, i & 1);
let t0 = performance.now(), acc = 0;
for (let k = 0; k < 2e4; k++) { her[0] = (k & 7) * 0.01; solveFrame(her, S, 16, COMBAT, out); acc += out.d; }
const per = (performance.now() - t0) / 2e4 * 1000;
const st = { v: 0 }; let x = 13; t0 = performance.now();
for (let k = 0; k < 1e6; k++) x = smoothDamp(x, 16 + (k & 1), st, 0.35, 6, 1 / 60);
const per2 = (performance.now() - t0) / 1e6 * 1000;
console.log(`solveFrame(16 subjects): ${per.toFixed(3)} us/call ; smoothDamp: ${per2.toFixed(4)} us/call ; (chk ${acc.toFixed(0)} ${x.toFixed(1)})`);
// SmoothDamp step response: 13 -> 16 m at 60 Hz, smoothTime 0.35, maxSpeed 6
{ const s = { v: 0 }; let v = 13, t = 0, t90 = 0, peak = 0; while (t < 3) { v = smoothDamp(v, 16, s, 0.35, 6, 1 / 60); t += 1 / 60; peak = Math.max(peak, v); if (!t90 && v >= 15.7) t90 = t; }
  console.log(`zoom-out 13->16: t90 ${t90.toFixed(2)} s, overshoot ${(peak - 16).toFixed(3)} m`); }
{ const s = { v: 0 }; let v = 16, t = 0, t90 = 0; while (t < 5) { v = smoothDamp(v, 13, s, 1.2, 2, 1 / 60); t += 1 / 60; if (!t90 && v <= 13.3) t90 = t; }
  console.log(`zoom-in 16->13 (after 1.5 s hold): t90 ${t90.toFixed(2)} s`); }
}
