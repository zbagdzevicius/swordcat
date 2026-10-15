// Outfits and silhouette props for every kitten (research/art.md §7; GAME_DESIGN §3).
// Each accessory adds pieces to the kitten's merged kit mesh through the assembly context `A`
// (A.add(bone, geometry, { m: localMatrix, color, rmse })), or attaches separate animated objects (A.attach).
import * as THREE from 'three';
import { PAL } from './palette.js';
import { mat, rgb, mixRgb, smoothstep, GeoBuilder } from './util.js';
import { RM, kitMaterial } from './materials.js';
import { capeMaterial, capeGeometry } from './Cape.js';
import { buildSword } from './Sword.js';

const C = (c) => rgb(c);
/** Segment count through the assembly context's detail (lite tier / Low quality: KittenBuilder's A.seg). */
const sg = (A, n) => (A.seg ? A.seg(n) : n);
export const flipShell = (geo) => {
  const g2 = geo.clone(); const idx = g2.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const n = g2.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g2;
};
/** Two-sided add for open shells. */
function both(A, bone, geo, m, color, rmse, innerColor) {
  A.add(bone, geo, { m, color, rmse });
  A.add(bone, flipShell(geo), { m, color: innerColor ?? (typeof color === 'function' ? color : mixRgb(C(color), [0, 0, 0], 0.35)), rmse });
}

// ------------------------------------------------------------------ the Token Tails gold ':3' coin

/**
 * The gold ':3' coin (Token Tails brand prop, docs/TOKENTAILS-PLAN.md §2.1), procedural: a thick gold disc with a
 * raised rim and a ':3' face in deep crimson, centred at the origin and facing +Z. Returns the pieces so both the
 * kit assembly (`A.add(bone, geo, { m, color, rmse })`: Clementine's chest crest) and a GeoBuilder (`gb.add(geo,
 * { matrix, color, rmse })`: the `tt_coin` prop) can use them. Every piece owns its geometry (caller adds it once).
 * @param {number} [r] coin radius @param {{ seg?: (n:number)=>number }} [o]
 * @returns {{ geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: number[], rmse: number[] }[]}
 */
export function coinPieces(r = 0.03, o = {}) {
  const seg = o.seg ?? ((n) => n);
  const gold = C(PAL.coinGold), deep = C(PAL.coinGoldDeep), hi = C(PAL.goldHi), ink = C(PAL.coinInk);
  const th = r * 0.22, out = [];
  // the disc (faces ±Z), a brighter raised rim on the front, and a pale gold boss behind the face
  out.push({ geo: new THREE.CylinderGeometry(r, r, th, seg(28), 1), matrix: mat([0, 0, 0], [Math.PI / 2, 0, 0]), color: deep, rmse: RM.brass });
  out.push({ geo: new THREE.TorusGeometry(r * 0.9, r * 0.1, seg(6), seg(28)), matrix: mat([0, 0, th * 0.5]), color: hi, rmse: RM.brass });
  out.push({ geo: new THREE.CylinderGeometry(r * 0.8, r * 0.8, th * 0.3, seg(24), 1), matrix: mat([0, 0, th * 0.55], [Math.PI / 2, 0, 0]), color: gold, rmse: RM.brass });
  const z = th * 0.75;
  // ':' (two dots) then '3' (one tube), read left to right from the front
  for (const y of [0.2, -0.2]) {
    out.push({ geo: new THREE.SphereGeometry(r * 0.1, seg(8), seg(6)).scale(1, 1, 0.5), matrix: mat([-r * 0.34, y * r, z]), color: ink, rmse: RM.nose });
  }
  const pts = [[-0.04, 0.36], [0.16, 0.42], [0.32, 0.28], [0.26, 0.1], [0.08, 0.02], [0.28, -0.08], [0.34, -0.26], [0.18, -0.4], [-0.04, -0.36]]
    .map(([x, y]) => new THREE.Vector3(x * r + r * 0.06, y * r, z));
  out.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg(24), r * 0.065, seg(5), false), matrix: new THREE.Matrix4(), color: ink, rmse: RM.nose });
  return out;
}

/**
 * Clementine's chest crest (docs/TOKENTAILS-PLAN.md §2.2): a small gold ':3' coin on the front of the breastplate.
 * Kit pieces on the chest bone (no extra draw). `z` = the plate's front surface at the crest height.
 */
export function coinCrest(A, { r = 0.03, y = 0.03, z = 0.155 } = {}) {
  const base = mat([0, y, z + r * 0.12]);
  for (const p of coinPieces(r, { seg: (n) => sg(A, n) })) A.add('chest', p.geo, { m: base.clone().multiply(p.matrix), color: p.color, rmse: p.rmse });
}

// ------------------------------------------------------------------ clothing

/** Simple tunic (prologue Clementine, squires, villagers): body sleeve + skirt + sleeves. */
export function tunic(A, { color = PAL.tunic, trim = '#6E5638', belt = true } = {}) {
  const w = A.w;
  const prof = [[0.13, 0.17], [0.175, 0.22], [0.172, 0.32], [0.165, 0.42], [0.155, 0.52], [0.11, 0.6], [0.085, 0.625]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - 0.30)), 40).scale(1.06 * w, 1, 1.04);
  const c = C(color), t = C(trim);
  both(A, 'hips', geo, null, (v, n, lp) => mixRgb(c, t, Math.min(1, smoothstep(-0.112, -0.122, lp.y) + smoothstep(0.305, 0.315, lp.y))), RM.cloth);
  for (const s of ['L', 'R']) A.add('shoulder' + s, new THREE.CylinderGeometry(0.052, 0.058, 0.08, sg(A, 16), 1), { m: mat([0, -0.035, 0]), color: c, rmse: RM.cloth });
  if (belt) {
    A.add('hips', new THREE.TorusGeometry(0.16, 0.011, 6, sg(A, 40)), { m: mat([0, 0.04, 0], [Math.PI / 2, 0, 0], [1.08 * w, 1.05, 1]), color: C(PAL.leather), rmse: RM.leather });
    A.add('hips', new THREE.BoxGeometry(0.03, 0.026, 0.01), { m: mat([0, 0.04, 0.172]), color: C(PAL.brass), rmse: RM.brass });
  }
}

/** Tabard (Mochi): front + back panels with a silver paw crest. */
export function tabard(A, { color = '#3F6FB5', crest = '#D8DCE2', trim = '#2C5290' } = {}) {
  const c = C(color), cr = C(crest), tr = C(trim);
  for (const side of [1, -1]) {
    const g = new THREE.CylinderGeometry(0.18 * A.w, 0.196 * A.w, 0.34, sg(A, 40), sg(A, 24), true, side > 0 ? -0.58 : Math.PI - 0.58, 1.16);
    const col = (v, n, lp) => mixRgb(c, tr, Math.min(1, smoothstep(0.1, 0.12, Math.abs(lp.x)) + smoothstep(-0.15, -0.165, lp.y)));
    both(A, 'chest', g, mat([0, -0.07, 0.004]), col, RM.cloth, mixRgb(c, [0, 0, 0], 0.4));
    if (side > 0) { // silver paw crest: a pad + 4 toe beans sewn on the front panel
      const zf = 0.19 * A.w + 0.006, y0 = -0.075;
      A.add('chest', new THREE.CircleGeometry(0.036, 20).scale(1.1, 0.95, 1), { m: mat([0, y0, zf]), color: cr, rmse: RM.steel });
      for (const [x, y] of [[-0.036, 0.048], [-0.013, 0.062], [0.013, 0.062], [0.036, 0.048]]) A.add('chest', new THREE.CircleGeometry(0.014, 14), { m: mat([x, y0 + y, zf - Math.abs(x) * 0.08]), color: cr, rmse: RM.steel });
    }
  }
}

/** Apron (Tofu's oversized smith's apron with a bib, neck strap and tool pocket; plain villager aprons). */
export function apron(A, { color = '#8A6A4A', big = false, strap = '#5A3E2B' } = {}) {
  const c = C(color), edge = mixRgb(c, [0, 0, 0], 0.3), st = C(strap);
  const h = big ? 0.44 : 0.3, r = big ? 0.19 : 0.18;
  const g = new THREE.CylinderGeometry(r * A.w, (r + (big ? 0.06 : 0.03)) * A.w, h, sg(A, 20), 6, true, -0.8, 1.6);
  const yc = 0.1 - h / 2 + (big ? 0.12 : 0.08);
  both(A, 'hips', g, mat([0, yc, 0.01]), (v, n, lp) => mixRgb(c, edge, smoothstep(-h / 2 + 0.03, -h / 2, lp.y) * 0.8 + smoothstep(0.62, 0.78, Math.abs(Math.atan2(lp.x, lp.z))) * 0.5), RM.leather);
  if (!big) {
    A.add('chest', new THREE.TorusGeometry(0.1, 0.008, 6, 24, Math.PI), { m: mat([0, 0.2, 0.03], [0.4, 0, 0]), color: st, rmse: RM.leather });
    return;
  }
  // bib up the chest, sagging a little because it is far too big for her
  const bib = new THREE.CylinderGeometry(0.168 * A.w, 0.182 * A.w, 0.19, sg(A, 16), 4, true, -0.62, 1.24);
  both(A, 'chest', bib, mat([0, 0.045, 0.012]), (v, n, lp) => mixRgb(c, edge, smoothstep(0.08, 0.095, lp.y) * 0.8), RM.leather);
  // neck strap and waist ties
  A.add('chest', new THREE.TorusGeometry(0.098, 0.009, 6, 28, Math.PI * 1.1), { m: mat([0, 0.18, -0.005], [0.15, 0, -0.05 * Math.PI]), color: st, rmse: RM.leather });
  A.add('hips', new THREE.TorusGeometry(0.19, 0.008, 6, 40), { m: mat([0, 0.06, 0], [Math.PI / 2, 0, 0], [1.06 * A.w, 1.04, 1]), color: st, rmse: RM.leather });
  // tool pocket with a hammer handle sticking out (she can barely lift it)
  A.add('hips', new THREE.BoxGeometry(0.09, 0.07, 0.012), { m: mat([0.065, -0.02, 0.224], [0, 0.28, 0]), color: edge, rmse: RM.leather });
  A.add('hips', new THREE.CylinderGeometry(0.008, 0.008, 0.11, 8), { m: mat([0.085, 0.03, 0.222], [0, 0, -0.25]), color: C('#8A6440'), rmse: RM.wood });
  A.add('hips', new THREE.BoxGeometry(0.05, 0.022, 0.022), { m: mat([0.1, 0.085, 0.222], [0, 0, -0.25]), color: C(PAL.steelDark), rmse: RM.steel });
}

/** Gown (Princess Snowpaw): bodice + long bell skirt to the ground. */
export function gown(A, { color = '#B9A3D6', trim = '#E8DFF5' } = {}) {
  const c = C(color), t = C(trim);
  const prof = [[0.12, 0.62], [0.15, 0.55], [0.155, 0.45], [0.14, 0.36], [0.2, 0.25], [0.26, 0.12], [0.3, 0.015]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - 0.30)).reverse(), 40);
  both(A, 'hips', g, null, (v, n, lp) => mixRgb(c, t, Math.min(1, smoothstep(-0.26, -0.28, lp.y) + smoothstep(0.30, 0.31, lp.y) * 0.8)), RM.velvet);
  for (const s of ['L', 'R']) A.add('shoulder' + s, new THREE.SphereGeometry(0.06, sg(A, 16), sg(A, 12)).scale(1, 0.8, 1), { m: mat([0, -0.02, 0]), color: t, rmse: RM.cloth });
}

/**
 * Cloth shell over the skull with an oval face opening (head space; the skull is centred at (0, 0.165, 0)).
 * The sphere is cut by a cone around `face` (half-angle `open`); vertices on kept triangles that fall inside the cone
 * are slid onto its rim, so the opening edge is a clean oval rather than a grid staircase.
 * @returns {{ geo: THREE.BufferGeometry, rim: THREE.Vector3[] }} geometry (indexed, outward normals) + rim points
 */
export function hoodShellGeometry({ radii = [0.215, 0.19, 0.2], center = [0, 0.175, -0.012], face = [0, -0.3, 1], open = 1.05, thetaEnd = Math.PI * 0.8, segs = [40, 28] } = {}) {
  const g = new THREE.SphereGeometry(1, segs[0], segs[1], 0, Math.PI * 2, 0, thetaEnd);
  const d = new THREE.Vector3(...face).normalize(), cosO = Math.cos(open), sinO = Math.sin(open);
  const pos = g.attributes.position, idx = g.index.array, n = pos.count;
  const u = new THREE.Vector3(), perp = new THREE.Vector3();
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) { u.fromBufferAttribute(pos, i); inside[i] = u.dot(d) > cosO ? 1 : 0; }
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (inside[a] && inside[b] && inside[c]) continue;
    keep.push(a, b, c);
  }
  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    u.fromBufferAttribute(pos, i);
    perp.copy(u).addScaledVector(d, -u.dot(d));
    if (perp.lengthSq() < 1e-8) continue;
    perp.normalize();
    u.copy(d).multiplyScalar(cosO).addScaledVector(perp, sinO);
    pos.setXYZ(i, u.x, u.y, u.z);
  }
  g.setIndex(keep);
  g.scale(...radii).translate(...center);
  g.computeVertexNormals();
  // rim: the cut circle, restricted to the part above the shell's bottom edge
  const e1 = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize(), e2 = new THREE.Vector3().crossVectors(d, e1);
  const rim = [], yMin = Math.cos(thetaEnd) + 0.02;
  for (let k = 0; k <= 64; k++) {
    const t = (k / 64) * Math.PI * 2;
    u.copy(d).multiplyScalar(cosO).addScaledVector(e1, sinO * Math.cos(t)).addScaledVector(e2, sinO * Math.sin(t));
    if (u.y < yMin) continue;
    rim.push(new THREE.Vector3(u.x * radii[0] + center[0], u.y * radii[1] + center[1], u.z * radii[2] + center[2]));
  }
  return { geo: g, rim };
}

/** Rolled hem along a hood rim (TubeGeometry; open arc when the rim is cut by the shell's bottom edge). */
function rimTube(rim, r = 0.012) {
  if (rim.length < 4) return null;
  const closed = rim[0].distanceTo(rim[rim.length - 1]) < 0.03;
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, closed), Math.max(24, rim.length * 2), r, 8, closed);
}

/** Drooping pointed tip (Sage's hood): a cone bent back and down, base at the origin, axis +Y before bending. */
export function hoodTipGeometry({ r = 0.085, h = 0.3, bend = 0.16, droop = 0.05 } = {}) {
  const tip = new THREE.ConeGeometry(r, h, 18, 10, true).translate(0, h / 2, 0);
  const p = tip.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h; p.setZ(i, p.getZ(i) - t * t * bend); p.setY(i, p.getY(i) - t * t * t * droop); }
  tip.computeVertexNormals();
  return tip;
}

/** Short capelet over the shoulders (chest space) with a leaf-cut (zigzag) hem. */
function capeletGeometry(w, { leaves = 9, depth = 0.03, prof = [[0.095, 0.24], [0.15, 0.218], [0.2, 0.175], [0.226, 0.12], [0.238, 0.07]] } = {}) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  const p = g.attributes.position, yMin = prof[prof.length - 1][1];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (Math.abs(y - yMin) > 1e-4) continue;
    const a = Math.atan2(p.getX(i), p.getZ(i));
    const k = Math.abs(Math.sin(a * leaves * 0.5));
    p.setY(i, y - depth * (1 - k) - (Math.cos(a) > 0 ? 0 : 0.015));     // points of the leaves; a little longer at the back
  }
  g.scale(1.04 * w, 1, 1.02);
  g.computeVertexNormals();
  return g;
}

/** Pointed leaf-green hood (Sage, art.md §7): face-framing hood with ears poking through, a drooping tip, leaf capelet. */
export function hood(A, { color = '#5E7F3E', lining = null } = {}) {
  const c = C(color), dark = mixRgb(c, [0, 0, 0], 0.35), inner = lining ? C(lining) : mixRgb(c, [0, 0, 0], 0.5);
  const { geo, rim } = hoodShellGeometry({ radii: [0.212, 0.188, 0.198], center: [0, 0.172, -0.014], face: [0, -0.32, 1], open: 1.08, thetaEnd: Math.PI * 0.74 });
  // the fold shade deepens toward the opening so the face reads framed
  A.add('head', geo, { color: (v, nn) => mixRgb(c, dark, smoothstep(0.2, 0.9, nn.z) * 0.35), rmse: RM.cloth });
  A.add('head', flipShell(geo), { color: inner, rmse: RM.cloth });
  const tube = rimTube(rim, 0.013);
  if (tube) A.add('head', tube, { color: dark, rmse: RM.cloth });
  const tip = hoodTipGeometry();
  both(A, 'head', tip, mat([0, 0.33, -0.06], [-0.38, 0, 0]), (v) => mixRgb(c, dark, smoothstep(0.05, 0.3, v.y) * 0.3), RM.cloth);
  const cap = capeletGeometry(A.w);
  both(A, 'chest', cap, mat([0, -0.005, -0.004]), (v, nn, lp) => mixRgb(c, dark, smoothstep(0.1, 0.05, lp.y) * 0.6), RM.cloth);
  A.flags.earsLow = 0.2;
}

/** White coif (Clover): a soft cap framing the face, ears out, a short veil down the back, collar left visible. */
export function coif(A, { color = '#EDE6DA' } = {}) {
  const c = C(color), shade = mixRgb(c, [0.35, 0.3, 0.28], 0.25);
  const { geo, rim } = hoodShellGeometry({ radii: [0.208, 0.186, 0.194], center: [0, 0.168, -0.01], face: [0, -0.38, 1], open: 1.12, thetaEnd: Math.PI * 0.72 });
  A.add('head', geo, { color: (v, nn) => mixRgb(c, shade, smoothstep(0.0, -0.8, nn.y) * 0.4), rmse: RM.cloth });
  A.add('head', flipShell(geo), { color: shade, rmse: RM.cloth });
  const tube = rimTube(rim, 0.011);
  if (tube) A.add('head', tube, { color: C('#F7C6D9'), rmse: RM.cloth });   // pink-ribbon trim (her blossom colour)
  // veil: back half of a flared skirt hanging from the nape over the shoulder blades
  const veil = new THREE.CylinderGeometry(0.13, 0.215, 0.19, sg(A, 32), 4, true, Math.PI - 1.75, 3.5);
  const vp = veil.attributes.position;
  for (let i = 0; i < vp.count; i++) { const y = vp.getY(i); if (y < -0.09) vp.setY(i, y - 0.012 * Math.sin(Math.atan2(vp.getX(i), vp.getZ(i)) * 6) ** 2); }
  veil.computeVertexNormals();
  both(A, 'chest', veil, mat([0, 0.16, -0.012]), (v, nn, lp) => mixRgb(c, shade, smoothstep(0.0, -0.09, lp.y) * 0.5), RM.cloth);
  A.flags.earsLow = 0.25;
}

/** Scarf (Pip): neck wrap + two long trailing ribbons that sway. */
export function scarf(A, { color = '#C2353B', length = 0.5 } = {}) {
  const c = C(color);
  A.add('chest', new THREE.TorusGeometry(0.1, 0.035, sg(A, 10), sg(A, 28)), { m: mat([0, 0.2, 0.01], [Math.PI / 2 + 0.15, 0, 0], [1.1, 1, 0.8]), color: c, rmse: RM.cloth });
  for (const s of [1, -1]) {
    const g = capeGeometry(3, 9);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * 0.06); p.setY(i, (p.getY(i) - 0.5) * length); p.setZ(i, -Math.abs(p.getY(i)) * 0.25); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, capeMaterial(color, { sway: true }));
    m.position.set(s * 0.05, 0.2, -0.09); m.rotation.set(0.25, 0, s * 0.15);
    m.castShadow = true; m.name = 'scarfTail';
    A.attach('chest', m);
  }
}

/** Brass bell collar (Clover). */
export function bellCollar(A, { color = '#B0503C' } = {}) {
  A.add('chest', new THREE.TorusGeometry(0.098, 0.012, sg(A, 8), sg(A, 32)), { m: mat([0, 0.19, 0.012], [Math.PI / 2 + 0.2, 0, 0], [1.1, 1, 0.85]), color: C(color), rmse: RM.leather });
  A.add('chest', new THREE.SphereGeometry(0.034, sg(A, 16), sg(A, 12)), { m: mat([0, 0.148, 0.122]), color: C(PAL.brass), rmse: RM.brass });
  A.add('chest', new THREE.BoxGeometry(0.04, 0.005, 0.005), { m: mat([0, 0.138, 0.154]), color: C('#4A3418'), rmse: RM.nose });
}

/** Herb / mail satchel on a cross strap. */
export function satchel(A, { color = '#7A5A3A', side = -1 } = {}) {
  A.add('hips', new THREE.BoxGeometry(0.09, 0.08, 0.04, 2, 2, 2), { m: mat([side * 0.17 * A.w, 0.0, 0.03], [0, side * 0.9, 0]), color: C(color), rmse: RM.leather });
  A.add('chest', new THREE.TorusGeometry(0.19, 0.008, 6, sg(A, 40)), { m: mat([0, 0.0, 0], [0, 0, side * 0.75], [1, 1.25, 0.9]), color: C(PAL.leatherDark), rmse: RM.leather });
  A.add('hips', new THREE.SphereGeometry(0.02, 8, 6), { m: mat([side * 0.17 * A.w, 0.05, 0.06]), color: C('#6E9A3C'), rmse: RM.leaf });
}

// ------------------------------------------------------------------ headgear

/** Oversized pot helm (Mochi), also the spoon brigade's `pot_helm`. */
export function potHelmGeometry(scale = 1, seg = (n) => n) {
  const gb = new GeoBuilder();
  const prof = [[0.0001, 0.16], [0.08, 0.158], [0.15, 0.14], [0.19, 0.1], [0.205, 0.04], [0.205, 0.0], [0.22, -0.005], [0.22, -0.018], [0.2, -0.02]].reverse();
  const bowl = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg(36));
  const metal = C(PAL.potMetal);
  gb.add(bowl, { color: (v, n) => mixRgb(metal, C('#5E605C'), smoothstep(0.0, -0.6, n.y)), rmse: [0.42, 0.85, 0, 0] });
  gb.add(flipShell(bowl), { color: C('#3A3B38'), rmse: [0.7, 0.6, 0, 0] });
  gb.add(new THREE.CapsuleGeometry(0.018, 0.16, 4, 8), { matrix: mat([0.27, 0.05, 0], [0, 0, Math.PI / 2 - 0.25]), color: C('#4A4C48'), rmse: [0.5, 0.8, 0, 0] });
  gb.add(new THREE.TorusGeometry(0.205, 0.008, 6, seg(40)), { matrix: mat([0, 0.065, 0], [Math.PI / 2, 0, 0]), color: C('#7A7D78'), rmse: [0.35, 0.9, 0, 0] });
  const g = gb.build(); if (scale !== 1) g.scale(scale, scale, scale); return g;
}
export function potHelm(A, { scale = 1.05, tilt = [0.12, 0.15, 0.14] } = {}) {
  A.add('head', potHelmGeometry(scale, (n) => sg(A, n)), { m: mat([0, 0.285, -0.005], tilt), keepColors: true });
  A.flags.earsLow = 0.9;
}

/** Giant floppy wizard hat with stars (Earl Grey). */
export function wizardHat(A, { color = '#5C4A9C', star = '#F2D16B' } = {}) {
  const c = C(color), st = C(star);
  const brim = new THREE.CylinderGeometry(0.29, 0.3, 0.012, 40, 1);
  const bp = brim.attributes.position; for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); bp.setY(i, bp.getY(i) - Math.max(0, Math.hypot(x, z) - 0.17) * 0.35 * (1 + 0.5 * Math.sin(Math.atan2(z, x) * 3))); }
  brim.computeVertexNormals();
  A.add('head', brim, { m: mat([0, 0.3, -0.01], [0.1, 0, 0.05]), color: c, rmse: RM.cloth });
  const cone = new THREE.ConeGeometry(0.18, 0.5, 28, 12, true);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 0.25) / 0.5; p.setX(i, p.getX(i) - t * t * t * 0.22); p.setY(i, p.getY(i) - t * t * t * 0.12); }
  cone.computeVertexNormals();
  const starCol = (v) => {
    const k = Math.sin(v.x * 70) * Math.sin(v.y * 60) * Math.sin(v.z * 75);
    return k > 0.82 ? st : c;
  };
  both(A, 'head', cone, mat([0.0, 0.54, -0.02], [0.08, 0, 0.1]), starCol, RM.cloth);
  A.add('head', new THREE.TorusGeometry(0.17, 0.016, 6, 32), { m: mat([0, 0.31, -0.01], [Math.PI / 2 + 0.1, 0, 0.05]), color: st, rmse: RM.cloth });
  A.flags.earsLow = 0.6;
}

/** Round glasses (Earl Grey). */
export function glasses(A, { color = '#C9A24A' } = {}) {
  const c = C(color);
  for (const s of [1, -1]) A.add('head', new THREE.TorusGeometry(0.05, 0.0045, 6, 28), { m: mat([s * 0.072, 0.168, 0.168], [0, s * 0.3, 0]), color: c, rmse: RM.gold });
  A.add('head', new THREE.CylinderGeometry(0.0035, 0.0035, 0.045, 6), { m: mat([0, 0.172, 0.18], [0, 0, Math.PI / 2]), color: c, rmse: RM.gold });
  for (const s of [1, -1]) A.add('head', new THREE.CylinderGeometry(0.003, 0.003, 0.12, 6), { m: mat([s * 0.125, 0.172, 0.105], [Math.PI / 2, 0, 0], [1, 1, 1]), color: c, rmse: RM.gold });
}

/** Simple helmet with a drooping plume (Marmalade, old knights). Optional nightcap peeking out (Snoozalot). */
export function plumedHelm(A, { plume = '#A3202C', style = 'rusty', nightcap = false } = {}) {
  const steel = C(style === 'rusty' ? PAL.rustyPlate : PAL.steel), rust = C(PAL.rust);
  const g = new THREE.SphereGeometry(0.2, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.48).scale(1.1, 0.95, 1.05);
  both(A, 'head', g, mat([0, 0.2, -0.01], [-0.15, 0, 0.06]), (v) => mixRgb(steel, rust, smoothstep(0.45, 0.8, Math.sin(v.x * 40) * Math.sin(v.z * 37) * 0.5 + 0.5) * 0.7), [0.55, 0.85, 0, 0]);
  A.add('head', new THREE.TorusGeometry(0.218, 0.01, 6, 36), { m: mat([0, 0.205, -0.01], [Math.PI / 2 - 0.15, 0, 0.06], [1.1, 1.05, 1]), color: steel, rmse: [0.5, 0.85, 0, 0] });
  // drooping plume: a curved tube that flops forward-down
  const curve = new THREE.CatmullRomCurve3([[0, 0.38, -0.05], [0.02, 0.47, 0.0], [0.06, 0.48, 0.08], [0.1, 0.42, 0.14], [0.12, 0.34, 0.15]].map((q) => new THREE.Vector3(...q)));
  const tube = new THREE.TubeGeometry(curve, 24, 1, 8, false);
  const tp = tube.attributes.position, cc = new THREE.Vector3();
  for (let i = 0; i < tp.count; i++) {
    const ring = Math.floor(i / 9), t = ring / 24; curve.getPointAt(t, cc);
    const r = 0.012 + 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.1));
    tp.setXYZ(i, cc.x + (tp.getX(i) - cc.x) * r, cc.y + (tp.getY(i) - cc.y) * r, cc.z + (tp.getZ(i) - cc.z) * r);
  }
  tube.computeVertexNormals();
  A.add('head', tube, { m: null, color: C(plume), rmse: RM.velvet });
  if (nightcap) {
    const cap = new THREE.ConeGeometry(0.08, 0.22, 16, 4);
    const cp = cap.attributes.position; for (let i = 0; i < cp.count; i++) { const t = (cp.getY(i) + 0.11) / 0.22; cp.setX(i, cp.getX(i) - t * t * 0.1); }
    cap.computeVertexNormals();
    A.add('head', cap, { m: mat([-0.16, 0.3, -0.06], [0, 0, 1.3]), color: (v) => (Math.sin(v.y * 90) > 0 ? C('#E9E2D2') : C('#7A9CC6')), rmse: RM.cloth });
    A.add('head', new THREE.SphereGeometry(0.03, 10, 8), { m: mat([-0.33, 0.31, -0.06]), color: C('#F5F2EC'), rmse: RM.fur });
  }
  A.flags.earsLow = 0.9;
}

export function tiara(A, { gem = '#F2A2B8' } = {}) {
  A.add('head', new THREE.TorusGeometry(0.1, 0.008, 6, 30, Math.PI), { m: mat([0, 0.29, 0.06], [-0.35, 0, 0]), color: C(PAL.brass), rmse: RM.gold });
  for (let i = -2; i <= 2; i++) A.add('head', new THREE.ConeGeometry(0.012, 0.035 + (i === 0 ? 0.02 : 0), 6), { m: mat([i * 0.04, 0.315 + (i === 0 ? 0.01 : 0) - Math.abs(i) * 0.006, 0.075 - Math.abs(i) * 0.012], [-0.35, 0, 0]), color: C(PAL.brass), rmse: RM.gold });
  A.add('head', new THREE.OctahedronGeometry(0.018), { m: mat([0, 0.315, 0.09], [-0.35, 0, 0], [1, 1.3, 0.7]), color: C(gem), rmse: RM.gem });
}

export function strawHat(A, { color = '#D9BC6A', band = '#B0503C' } = {}) {
  A.add('head', new THREE.CylinderGeometry(0.3, 0.3, 0.012, 36), { m: mat([0, 0.3, 0], [0.12, 0, 0.06]), color: C(color), rmse: RM.straw });
  A.add('head', new THREE.CylinderGeometry(0.13, 0.15, 0.1, 28, 1), { m: mat([0, 0.35, -0.005], [0.12, 0, 0.06]), color: C(color), rmse: RM.straw });
  A.add('head', new THREE.CylinderGeometry(0.152, 0.152, 0.022, 28, 1, true), { m: mat([0, 0.315, -0.002], [0.12, 0, 0.06]), color: C(band), rmse: RM.cloth });
  A.flags.earsLow = 0.7;
}
export function bakerHat(A) {
  A.add('head', new THREE.CylinderGeometry(0.15, 0.13, 0.08, 24), { m: mat([0, 0.32, 0], [0.1, 0, 0]), color: C('#E2DCD0'), rmse: RM.cloth });
  for (let i = 0; i < 5; i++) A.add('head', new THREE.SphereGeometry(0.075, 14, 10), { m: mat([Math.cos(i * 1.26) * 0.07, 0.4, Math.sin(i * 1.26) * 0.07 - 0.0]), color: C('#E2DCD0'), rmse: RM.cloth });
  A.flags.earsLow = 0.8;
}
export function flowerCrown(A, { colors = ['#F7C6D9', '#F2D16B', '#FFFFFF', '#C77DA8'] } = {}) {
  A.add('head', new THREE.TorusGeometry(0.15, 0.01, 6, 30), { m: mat([0, 0.29, 0.0], [Math.PI / 2 - 0.25, 0, 0]), color: C('#5E7F3E'), rmse: RM.leaf });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    A.add('head', new THREE.SphereGeometry(0.022, 8, 6), { m: mat([Math.cos(a) * 0.15, 0.29 + Math.sin(a) * 0.15 * Math.sin(0.25) + 0.01, Math.sin(a) * 0.15 * Math.cos(0.25)]), color: C(colors[i % colors.length]), rmse: RM.cloth });
  }
}
export function bucketHelm(A, { color = '#8C8F88' } = {}) {
  // TT3 (Simas): a smaller pail perched on the crown between the ears, tipped back, so both ears stand clear of it
  const g = new THREE.CylinderGeometry(0.105, 0.125, 0.13, 24, 1, true);
  both(A, 'head', g, mat([0, 0.37, -0.02], [-0.22, 0, -0.1]), C(color), [0.45, 0.8, 0, 0]);
  A.add('head', new THREE.CylinderGeometry(0.105, 0.105, 0.01, 24), { m: mat([0, 0.433, -0.005], [-0.22, 0, -0.1]), color: C(color), rmse: [0.45, 0.8, 0, 0] });
  A.add('head', new THREE.TorusGeometry(0.125, 0.008, 6, 28), { m: mat([0, 0.307, -0.034], [Math.PI / 2 - 0.22, 0, -0.1]), color: C('#6E716B'), rmse: [0.45, 0.8, 0, 0] });
  A.flags.earsLow = 0.15;
}
export function nightcap(A, { color = '#7A9CC6' } = {}) {
  const cap = new THREE.ConeGeometry(0.16, 0.3, 20, 6, true);
  const cp = cap.attributes.position; for (let i = 0; i < cp.count; i++) { const t = (cp.getY(i) + 0.15) / 0.3; cp.setX(i, cp.getX(i) - t * t * 0.16); cp.setY(i, cp.getY(i) - t * t * 0.06); }
  cap.computeVertexNormals();
  both(A, 'head', cap, mat([0, 0.4, -0.02], [0.1, 0, 0.2]), (v) => (Math.sin(v.y * 70) > 0 ? C('#E9E2D2') : C(color)), RM.cloth);
  A.add('head', new THREE.SphereGeometry(0.035, 10, 8), { m: mat([-0.2, 0.42, -0.02]), color: C('#F5F2EC'), rmse: RM.fur });
  A.flags.earsLow = 0.7;
}
export function eyepatch(A, { side = -1, color = '#1E1C1C' } = {}) {
  A.add('head', new THREE.SphereGeometry(0.056, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), { m: mat([side * 0.074, 0.168, 0.128], [Math.PI / 2 - 0.05, 0, side * -0.32]), color: C(color), rmse: RM.leather });
  A.add('head', new THREE.TorusGeometry(0.19, 0.005, 5, 40), { m: mat([0, 0.2, 0.0], [0.2, 0, side * 0.55], [1.08, 1, 1]), color: C(color), rmse: RM.leather });
  A.flags.hideEye = side;
}
export function whistle(A) {
  A.add('chest', new THREE.TorusGeometry(0.1, 0.004, 5, 30), { m: mat([0, 0.19, 0.01], [Math.PI / 2 + 0.25, 0, 0], [1.1, 1, 0.9]), color: C('#2A2624'), rmse: RM.cloth });
  A.add('chest', new THREE.CylinderGeometry(0.009, 0.012, 0.04, 10), { m: mat([0.02, 0.12, 0.165], [0, 0, 1.4]), color: C(PAL.brass), rmse: RM.brass });
  A.add('chest', new THREE.SphereGeometry(0.014, 10, 8), { m: mat([0.0, 0.125, 0.165]), color: C(PAL.brass), rmse: RM.brass });
}
/** Sergeant's peaked cap (Whiskerbottom). */
export function sergeantCap(A, { color = '#3E4A5A' } = {}) {
  A.add('head', new THREE.CylinderGeometry(0.15, 0.16, 0.07, 24), { m: mat([0, 0.33, -0.01], [0.15, 0, 0]), color: C(color), rmse: RM.cloth });
  A.add('head', new THREE.CylinderGeometry(0.11, 0.11, 0.01, 20, 1, false, -0.9, 1.8), { m: mat([0, 0.305, 0.08], [0.35, 0, 0]), color: C('#1E2228'), rmse: RM.leather });
  A.add('head', new THREE.CylinderGeometry(0.162, 0.162, 0.015, 24, 1, true), { m: mat([0, 0.31, -0.008], [0.15, 0, 0]), color: C(PAL.brass), rmse: RM.brass });
  A.flags.earsLow = 0.6;
}
/** Jester hat (Cacklejaw's epilogue gag is on a beast head; this kitten version is for villagers/fun). */
export function jesterHat(A) {
  const cols = [C('#A3202C'), C('#D9B26A')];
  for (const s of [1, -1]) {
    const cone = new THREE.ConeGeometry(0.07, 0.24, 14, 6);
    const p = cone.attributes.position; for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 0.12) / 0.24; p.setX(i, p.getX(i) + t * t * 0.12); p.setY(i, p.getY(i) - t * t * 0.08); }
    cone.computeVertexNormals();
    A.add('head', cone, { m: mat([s * 0.09, 0.38, -0.01], [0, s > 0 ? 0 : Math.PI, s * -0.5]), color: cols[s > 0 ? 0 : 1], rmse: RM.cloth });
    A.add('head', new THREE.SphereGeometry(0.025, 10, 8), { m: mat([s * 0.26, 0.34, -0.01]), color: C(PAL.brass), rmse: RM.brass });
  }
  A.add('head', new THREE.SphereGeometry(0.19, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), { m: mat([0, 0.2, -0.01], [-0.1, 0, 0]), color: (v) => (v.x > 0 ? cols[0] : cols[1]), rmse: RM.cloth });
  A.flags.earsLow = 0.9;
}

// ------------------------------------------------------------------ held / worn props

/** Huge round tower shield (Mochi): Cylinder r 0.35 + brass boss, held on the left paw. */
export function towerShield(A, { color = '#3F6FB5', rim = '#8C6A4A', crest = '#D8DCE2' } = {}) {
  const r = 0.32;
  const m = new THREE.Matrix4().makeTranslation(0.05, -0.06, 0.06).multiply(mat([0, 0, 0], [0, -0.35, 0])).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0]));
  const c = C(color), cr = C(crest);
  const face = (v, n) => {
    const d = Math.hypot(v.x, v.z);
    if (n.y > 0.5) {
      const ring = Math.abs(d - r * 0.72) < 0.012;
      return ring ? cr : c;
    }
    return mixRgb(c, [0, 0, 0], 0.3);
  };
  A.add('pawL', new THREE.CylinderGeometry(r, r, 0.03, sg(A, 40), 1), { m, color: face, rmse: [0.6, 0.1, 0.2, 0] });
  A.add('pawL', new THREE.TorusGeometry(r, 0.018, sg(A, 8), sg(A, 48)), { m: m.clone().multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0])), color: C(rim), rmse: RM.wood });
  A.add('pawL', new THREE.SphereGeometry(0.07, sg(A, 20), sg(A, 12), 0, Math.PI * 2, 0, Math.PI / 2), { m: m.clone().multiply(mat([0, 0.012, 0])), color: C(PAL.brass), rmse: RM.brass });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    A.add('pawL', new THREE.SphereGeometry(0.011, 8, 6), { m: m.clone().multiply(mat([Math.cos(a) * r * 0.88, 0.016, Math.sin(a) * r * 0.88])), color: C(PAL.brass), rmse: RM.brass });
  }
}

/** Short recurve bow held upright in the left paw (Sage): two limbs, a leather grip wrap and a taut string. */
export function shortBow(A, { wood = '#7A5230', grip = '#4A2E1F' } = {}) {
  const half = 0.2, belly = 0.05, curl = 0.025;
  const pts = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16 * 2 - 1, y = t * half;                                   // -1..1 along the bow
    const z = belly * (1 - t * t) - curl * Math.max(0, Math.abs(t) - 0.75) / 0.25;   // limbs bow forward, tips recurve
    pts.push(new THREE.Vector3(0, y, z));
  }
  const m = mat([0, -0.035, 0.03], [0.12, 0, 0]);
  A.add('pawL', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.0105, 7, false), { m, color: C(wood), rmse: RM.wood });
  A.add('pawL', new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10), { m: m.clone().multiply(mat([0, 0, belly])), color: C(grip), rmse: RM.leather });
  for (const s of [1, -1]) A.add('pawL', new THREE.SphereGeometry(0.009, 8, 6), { m: m.clone().multiply(mat([0, s * half, -curl])), color: C(PAL.brass), rmse: RM.brass });
  A.add('pawL', new THREE.CylinderGeometry(0.0018, 0.0018, half * 2, 4), { m: m.clone().multiply(mat([0, 0, -curl])), color: C('#E9E2D2'), rmse: RM.cloth });
}
export function quiver(A, { color = '#6B4429' } = {}) {
  A.add('chest', new THREE.CylinderGeometry(0.04, 0.035, 0.24, 14), { m: mat([0.06, 0.08, -0.17], [0.35, 0, -0.4]), color: C(color), rmse: RM.leather });
  for (let i = 0; i < 4; i++) A.add('chest', new THREE.ConeGeometry(0.014, 0.05, 4), { m: mat([0.1 + i * 0.012, 0.22 + (i % 2) * 0.01, -0.21 + i * 0.008], [0.35, 0, -0.4]), color: C(i % 2 ? '#E9E2D2' : '#C2353B'), rmse: RM.cloth });
}
/** Flower staff (Clover), right paw. */
export function flowerStaff(A, { blossom = '#F7C6D9' } = {}) {
  A.add('pawR', new THREE.CylinderGeometry(0.01, 0.012, 0.75, 8), { m: mat([0, -0.03, 0.04], [0.1, 0, 0]), color: C('#7A5230'), rmse: RM.wood });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    A.add('pawR', new THREE.SphereGeometry(0.025, 10, 8).scale(1, 0.6, 1), { m: mat([Math.cos(a) * 0.03, 0.34, 0.07 + Math.sin(a) * 0.03], [0.1, 0, 0]), color: C(blossom), rmse: RM.cloth });
  }
  A.add('pawR', new THREE.SphereGeometry(0.02, 10, 8), { m: mat([0, 0.345, 0.075]), color: C('#F2D16B'), rmse: RM.cloth });
  A.add('pawR', new THREE.SphereGeometry(0.02, 8, 6).scale(1.8, 0.4, 0.9), { m: mat([0.035, 0.27, 0.06], [0, 0, 0.5]), color: C('#6E9A3C'), rmse: RM.leaf });
}
export function dagger(A) {
  A.add('pawR', new THREE.BoxGeometry(0.018, 0.13, 0.005), { m: mat([0, 0.04, 0.04], [0.2, 0, 0]), color: C(PAL.blade), rmse: RM.steel });
  A.add('pawR', new THREE.BoxGeometry(0.06, 0.01, 0.012), { m: mat([0, -0.03, 0.03], [0.2, 0, 0]), color: C(PAL.brass), rmse: RM.brass });
}
/** Practice sword (CS-01 squires): gripped in the right paw, blade lowered down-forward past the paw. */
export function woodenSword(A) {
  const tilt = 0.5, dy = -Math.cos(tilt), dz = Math.sin(tilt), g = [0, -0.035, 0.012];
  const at = (k) => [g[0], g[1] + dy * k, g[2] + dz * k];
  A.add('pawR', new THREE.BoxGeometry(0.03, 0.36, 0.012), { m: mat(at(0.21), [-tilt, 0, 0]), color: C('#B08A55'), rmse: RM.wood });
  A.add('pawR', new THREE.ConeGeometry(0.0155, 0.035, 4).rotateY(Math.PI / 4).scale(1, 1, 0.4).rotateX(Math.PI), { m: mat(at(0.405), [-tilt, 0, 0]), color: C('#B08A55'), rmse: RM.wood });
  A.add('pawR', new THREE.BoxGeometry(0.1, 0.016, 0.022), { m: mat(at(0.02), [-tilt, 0, 0]), color: C('#8A6440'), rmse: RM.wood });
  A.add('pawR', new THREE.CylinderGeometry(0.011, 0.011, 0.06, 8), { m: mat(at(-0.02), [-tilt, 0, 0]), color: C('#6B4429'), rmse: RM.leather });
}

/** Floating book (Earl Grey): separate object bobbing beside him. */
export function floatingBook(A, { color = '#7A2E3A' } = {}) {
  const gb = new GeoBuilder();
  gb.add(new THREE.BoxGeometry(0.16, 0.012, 0.12), { matrix: mat([0, 0, 0]), color: C(color), rmse: RM.leather });
  for (const s of [1, -1]) gb.add(new THREE.BoxGeometry(0.075, 0.016, 0.11), { matrix: mat([s * 0.04, 0.014, 0], [0, 0, -s * 0.12]), color: C(PAL.paper), rmse: RM.paper });
  const mesh = new THREE.Mesh(gb.build(), kitMaterial());
  mesh.castShadow = true; mesh.name = 'floatingBook';
  const holder = new THREE.Group(); holder.position.set(0.32, 0.62, 0.12); holder.add(mesh);
  let t = 2.4; // fixed phase (visual only)
  holder.userData.update = (dt) => { t += dt; mesh.position.y = Math.sin(t * 1.7) * 0.03; mesh.rotation.set(0.5 + Math.sin(t * 1.1) * 0.08, -0.5 + Math.sin(t * 0.7) * 0.15, 0.1); };
  A.attachRoot(holder);
}

/** Marmalade's walking-stick greatsword: a dull, longer Borrowed Blade (the kitten holds it like a cane). */
export function walkingStickSword() { return buildSword('borrowed'); }

/** Accessory registry used by configs (id → builder). */
export const ACCESSORIES = Object.freeze({
  tunic, tabard, apron, gown, hood, coif, scarf, bellCollar, satchel,
  potHelm, wizardHat, glasses, plumedHelm, tiara, strawHat, bakerHat, flowerCrown, bucketHelm, nightcap, eyepatch, whistle, sergeantCap, jesterHat,
  towerShield, shortBow, quiver, flowerStaff, dagger, woodenSword, floatingBook,
});
