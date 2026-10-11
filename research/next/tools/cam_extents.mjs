// Ground extents seen around her feet for the CONTROLS_SPEC iso rig (pure math, no three).
// node research/next/tools/cam_extents.mjs
const R = Math.PI / 180;
function view({ w, h, d, pitchDeg, fovDeg, bias = 0.8, focusY = 0.6, offNdcY = -0.08 }) {
  const p = pitchDeg * R, t = Math.tan(fovDeg * R / 2), a = w / h;
  const F = [0, focusY, bias];
  const C = [F[0], F[1] + d * Math.sin(p), F[2] - d * Math.cos(p)];
  const fwd = [0, -Math.sin(p), Math.cos(p)], up = [0, Math.cos(p), Math.sin(p)], right = [-1, 0, 0];
  const hit = (x, y) => { y -= offNdcY; // setViewOffset: focus drawn at offNdcY
    const r = [0, 1, 2].map(i => fwd[i] + x * t * a * right[i] + y * t * up[i]);
    if (r[1] >= 0) return null; const k = -C[1] / r[1]; return [C[0] + k * r[0], C[2] + k * r[2]]; };
  const top = hit(0, 1), bot = hit(0, -1), side = hit(1, offNdcY);
  // px per metre near her: lateral & depth
  const pxPerM = (h / 2) / (t * d); // approx at focus distance
  const catPx = 0.8 * pxPerM;
  return { ahead: +top[1].toFixed(2), behind: +(-bot[1]).toFixed(2), half: +Math.abs(side[0]).toFixed(2),
    pxPerM_lat: +pxPerM.toFixed(1), pxPerM_depth: +(pxPerM * Math.sin(p)).toFixed(1), catPx: +catPx.toFixed(0) };
}
const cases = {
  desk_1080_d13: { w: 1920, h: 1080, d: 13, pitchDeg: 51.3, fovDeg: 38 },
  desk_1080_d16_combat: { w: 1920, h: 1080, d: 16, pitchDeg: 55.3, fovDeg: 38 },
  phone_844x390_d12: { w: 844, h: 390, d: 12, pitchDeg: 50, fovDeg: 38 },
  phone_844x390_d15: { w: 844, h: 390, d: 15, pitchDeg: 54, fovDeg: 38 },
  portrait_390x844_d21: { w: 390, h: 844, d: 21, pitchDeg: 58, fovDeg: 50, bias: 0, offNdcY: 0.2 },
};
export { view };
if (!process.env.NOMAIN) for (const [k, v] of Object.entries(cases)) console.log(k, JSON.stringify(view(v)));
