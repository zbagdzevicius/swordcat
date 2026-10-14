// Plate armour pieces (research/art.md §2.2 table, §4.2): breastplate lathe, 4-lame pauldrons with rivets,
// rerebraces, vambraces, gauntlets with brass cuff rings, leather belt + buckle + pouch, mail skirt, tassets,
// greaves, knee cops and 3-lame sabatons. Everything is merged into the kitten's single skinned kit mesh.
// `style`: 'plate' (polished, Swordcat), 'rusty' (Marmalade / old knights: dented, rust noise), 'iron' (dark).
import * as THREE from 'three';
import { PAL } from './palette.js';
import { mat, rgb, mixRgb, fbm3, smoothstep } from './util.js';
import { RM } from './materials.js';
import { coinCrest } from './Accessories.js';

/** Material looks per armour style: [colour fn, rmse] for steel / dark steel / brass / mail / leather. */
function looks(style) {
  const rustK = style === 'rusty' ? 1 : 0;
  const steelC = rgb(style === 'iron' ? '#5B5F66' : style === 'rusty' ? PAL.rustyPlate : PAL.steel);
  const darkC = rgb(style === 'iron' ? '#3A3D44' : PAL.steelDark);
  const rust = rgb(PAL.rust);
  const rusty = (base) => (v) => {
    if (!rustK) return base;
    const n = fbm3(v.x * 22 + 4, v.y * 22 + 9, v.z * 22 + 1, 3);
    return mixRgb(base, rust, smoothstep(0.52, 0.7, n) * 0.85);
  };
  return {
    steel: { color: rusty(steelC), rmse: rustK ? [0.5, 0.85, 0, 0] : RM.steel },
    dark: { color: rusty(darkC), rmse: rustK ? [0.62, 0.8, 0, 0] : RM.steelDark },
    inner: { color: rgb('#3B3E44'), rmse: [0.7, 0.6, 0, 0] },
    brass: { color: rgb(rustK ? '#A8874E' : PAL.brass), rmse: RM.brass },
    mail: { color: (v) => mixRgb(rgb(PAL.mail), rgb('#4E5258'), smoothstep(0.3, 0.7, 0.5 + 0.5 * Math.sin(v.y * 520) * Math.sin(Math.atan2(v.x, v.z) * 90))), rmse: RM.mail },
    leather: { color: rgb(PAL.leather), rmse: RM.leather },
    leatherDark: { color: rgb(PAL.leatherDark), rmse: RM.leather },
  };
}

/** Add an open shell twice: outside with `look`, inside (flipped) with a dark inner colour. */
function shell(A, bone, geo, m, look, inner) {
  A.add(bone, geo, { m, ...look });
  const g2 = geo.clone();
  const idx = g2.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const n = g2.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  A.add(bone, g2, { m, ...inner });
}

/** Dent noise for rusty armour (displace along normals). */
function dent(geo, amt, seed = 1) {
  if (!amt) return geo;
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const k = (fbm3(p.getX(i) * 18 + seed, p.getY(i) * 18, p.getZ(i) * 18, 2) - 0.5) * amt;
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Add the full plate set.
 * @param {object} A assembly context from KittenBuilder ({ add(bone, geo, {m, color, rmse}), w, cfg })
 * @param {{style?: string, gauntlets?: boolean, sabatons?: boolean, pauldrons?: boolean, belt?: boolean, pouch?: boolean, crest?: 'ttCoin'|null}} o
 */
export function addPlateArmour(A, o = {}) {
  if (!A.seg) A.seg = (n) => n;
  const L = looks(o.style || 'plate');
  const dentAmt = o.style === 'rusty' ? 0.006 : 0;
  const w = A.w;

  // ---- breastplate (lathe; chest bone at y 0.40) ------------------------------------------------
  const prof = [[0.085, 0.30], [0.125, 0.335], [0.14, 0.40], [0.138, 0.48], [0.118, 0.56], [0.082, 0.615]].map(([r, y]) => new THREE.Vector2(r, y - 0.40));
  const bp = dent(new THREE.LatheGeometry(prof, A.seg(48)).scale(1.08 * w, 1, 1.05 * (0.85 + 0.15 * w)), dentAmt, 3);
  // subtle centre ridge: push front vertices near x = 0 outward
  {
    const p = bp.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      if (z > 0) p.setZ(i, z + 0.006 * Math.exp(-((x / 0.025) ** 2)) * smoothstep(-0.1, 0.0, p.getY(i)));
    }
    bp.computeVertexNormals();
  }
  shell(A, 'chest', bp, null, L.steel, L.inner);
  // gorget rim (brass-trimmed collar line) + neckline roll
  A.add('chest', new THREE.TorusGeometry(0.084 * w, 0.009, A.seg(8), A.seg(40)), { m: mat([0, 0.212, 0], [Math.PI / 2, 0, 0], [1.08, 1.05, 1]), ...L.steel });
  A.add('chest', new THREE.TorusGeometry(0.13 * w, 0.006, A.seg(6), A.seg(48)), { m: mat([0, -0.06, 0], [Math.PI / 2, 0, 0], [1.08, 1.05, 1]), ...L.brass });
  // the gold ':3' coin crest (Clementine, docs/TOKENTAILS-PLAN.md §2.2): on the breastplate's front, below the gorget
  if (o.crest === 'ttCoin') coinCrest(A, { r: 0.03, y: 0.05, z: 0.14 * 1.05 * (0.85 + 0.15 * w) + 0.006 });
  // a few rivets along the plate bottom
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.32, r = 0.128 * w;
    A.add('chest', new THREE.SphereGeometry(0.0065, A.seg(8), A.seg(6)), { m: mat([Math.sin(a) * r * 1.08, -0.072, Math.cos(a) * r * 1.05]), ...L.brass });
  }

  // ---- pauldrons (ART_WARM §6.3): 2 chunky domes (outer r ×1.1) with a brass rim, no rivets: a toy-knight
  // shoulder line that reads from 50° above. `o.lames` keeps the M1 4-lame look (tools / comparisons).
  if (o.pauldrons !== false && !o.lames) for (const side of [1, -1]) {
    const gx = side * 0.148 * w, gy = 0.17;
    let lm = null;
    for (let i = 0; i < 2; i++) {
      const r = (0.078 + i * 0.012) * 1.1;
      const geo = dent(new THREE.SphereGeometry(r, A.seg(28), A.seg(12), 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.85, 1.08), dentAmt, 7 + i);
      lm = new THREE.Matrix4().makeTranslation(gx, gy, 0).multiply(mat([side * i * 0.012, -i * 0.045, 0], [0, 0, -side * (0.22 + i * 0.22)]));
      shell(A, 'chest', geo, lm, L.steel, L.inner);
    }
    // brass rim along the lower dome's edge (0.012 H)
    A.add('chest', new THREE.TorusGeometry(0.09 * 1.1, 0.012, A.seg(6), A.seg(28)), { m: lm.clone().multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0], [1, 1.08, 1])), ...L.brass });
  }
  if (o.pauldrons !== false && o.lames) for (const side of [1, -1]) {
    const gx = side * 0.148 * w, gy = 0.17;
    for (let i = 0; i < 4; i++) {
      const geo = dent(new THREE.SphereGeometry(0.078 + i * 0.006, A.seg(32), A.seg(13), 0, Math.PI * 2, 0, Math.PI * 0.46).scale(1, 0.8, 1.08), dentAmt, 7 + i);
      const lm = new THREE.Matrix4().makeTranslation(gx, gy, 0)
        .multiply(mat([side * i * 0.009, -i * 0.03, 0], [0, 0, -side * (0.2 + i * 0.13)]));
      shell(A, 'chest', geo, lm, L.steel, L.inner);
      // rivets on the lowest lame's rim
      if (i === 3) {
        const R = 0.096, th = Math.PI * 0.46;
        for (let k = 0; k < 6; k++) {
          const ph = Math.PI * 0.5 + side * (-0.9 + k * 0.36);
          const lp = new THREE.Vector3(-R * Math.cos(ph) * Math.sin(th) * 0.97, R * Math.cos(th) * 0.8, R * Math.sin(ph) * Math.sin(th) * 1.08 * 0.97);
          A.add('chest', new THREE.SphereGeometry(0.0062, A.seg(8), A.seg(6)), { m: lm.clone().multiply(mat([lp.x, lp.y, lp.z])), ...L.brass });
        }
      }
    }
  }

  // ---- arms: rerebrace + couter (shoulder bone), vambrace (elbow bone), gauntlet (paw bone) -----
  for (const s of ['L', 'R']) {
    const sh = 'shoulder' + s, el = 'elbow' + s, pw = 'paw' + s;
    A.add(sh, dent(new THREE.CylinderGeometry(0.054, 0.05, 0.08, A.seg(18), A.seg(1)), dentAmt, 11), { m: mat([0, -0.052, 0]), ...L.steel });
    A.add(sh, new THREE.CylinderGeometry(0.056, 0.056, 0.012, A.seg(18)), { m: mat([0, -0.03, 0]), ...L.dark });
    A.add(sh, new THREE.TorusGeometry(0.05, 0.005, A.seg(6), A.seg(24)), { m: mat([0, -0.092, 0], [Math.PI / 2, 0, 0]), ...L.dark });
    // couter (elbow cop): a small dome on the back of the elbow
    A.add(el, new THREE.SphereGeometry(0.053, A.seg(18), A.seg(12)), { m: mat([0, 0.0, 0]), ...L.dark });
    A.add(el, new THREE.SphereGeometry(0.056, A.seg(18), A.seg(10), 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1, 0.7, 1), { m: mat([0, 0.0, -0.012], [-Math.PI / 2, 0, 0]), ...L.steel });
    A.add(el, new THREE.CylinderGeometry(0.042, 0.042, 0.007, A.seg(20)), { m: mat([(s === 'L' ? 1 : -1) * 0.053, 0.0, -0.004], [0, 0, Math.PI / 2]), ...L.steel });
    A.add(el, dent(new THREE.CylinderGeometry(0.048, 0.052, 0.07, A.seg(18), A.seg(1)), dentAmt, 13), { m: mat([0, -0.048, 0]), ...L.steel });
    A.add(el, new THREE.CylinderGeometry(0.052, 0.064, 0.04, A.seg(24), A.seg(1), false), { m: mat([0, -0.098, 0.0]), ...L.steel });
    A.add(el, new THREE.CylinderGeometry(0.0655, 0.0655, 0.009, A.seg(24), A.seg(1), true), { m: mat([0, -0.114, 0.0]), ...L.brass });
    if (o.gauntlets !== false) addGauntlet(A, pw, L, { cuff: false });
  }

  // ---- hips: mail skirt, belt + buckle + pouch, tassets -------------------------------------------
  const sk = new THREE.CylinderGeometry(0.128 * w, 0.148 * w, 0.11, A.seg(40), A.seg(3), true);
  shell(A, 'hips', sk, mat([0, -0.03, 0]), L.mail, L.inner);
  if (o.belt !== false) {
    A.add('hips', new THREE.TorusGeometry(0.128, 0.015, A.seg(8), A.seg(48)), { m: mat([0, 0.04, 0], [Math.PI / 2, 0, 0], [1.08 * w, 1.05 * w, 1]), ...L.leather });
    A.add('hips', new THREE.BoxGeometry(0.044, 0.036, 0.012), { m: mat([0, 0.04, 0.142]), ...L.brass });
    A.add('hips', new THREE.BoxGeometry(0.026, 0.02, 0.014), { m: mat([0, 0.04, 0.145]), ...L.leatherDark });
    if (o.pouch !== false) {
      // pouch + strap on her right hip (ref2)
      A.add('hips', new THREE.BoxGeometry(0.055, 0.065, 0.03, 2, 2, 2), { m: mat([-0.13 * w, -0.01, 0.07], [0, -0.75, 0.05]), ...L.leather });
      A.add('hips', new THREE.BoxGeometry(0.057, 0.02, 0.034), { m: mat([-0.13 * w, 0.02, 0.072], [0.1, -0.75, 0.05]), ...L.leatherDark });
      A.add('hips', new THREE.BoxGeometry(0.014, 0.12, 0.008), { m: mat([-0.085 * w, -0.03, 0.125], [0, -0.5, 0.25]), ...L.leatherDark });
    }
  }
  // tassets: two lames per side covering the front of each thigh, flared out
  for (const side of [1, -1]) {
    for (let k = 0; k < 2; k++) {
      const r0 = (0.152 + k * 0.012) * w, r1 = (0.172 + k * 0.014) * w;
      const geo = dent(new THREE.CylinderGeometry(r0, r1, 0.075, A.seg(20), A.seg(1), true, side > 0 ? 0.22 : -1.42, 1.2), dentAmt, 17 + k);
      const y = -0.005 - k * 0.058;
      shell(A, 'hips', geo, mat([0, y, 0.005], [0.06 * k, 0, 0]), L.steel, L.inner);
      // rivets
      for (let q = 0; q < 3; q++) {
        const a = (side > 0 ? 0.22 : -1.42) + 0.3 + q * 0.3;
        A.add('hips', new THREE.SphereGeometry(0.0055, A.seg(8), A.seg(6)), { m: mat([Math.sin(a) * (r0 + 0.004), y + 0.028, Math.cos(a) * (r0 + 0.004) + 0.005]), ...L.brass });
      }
    }
  }
  // rear fauld (mostly hidden by the cape)
  shell(A, 'hips', new THREE.CylinderGeometry(0.152 * w, 0.168 * w, 0.07, A.seg(20), A.seg(1), true, Math.PI - 0.9, 1.8), mat([0, -0.02, 0]), L.steel, L.inner);

  // ---- legs: cuisse hint, knee cop + greave, sabatons --------------------------------------------
  for (const s of ['L', 'R']) {
    const kn = 'knee' + s, ft = 'foot' + s, th = 'thigh' + s;
    A.add(th, dent(new THREE.CylinderGeometry(0.057, 0.054, 0.085, A.seg(18), A.seg(1), true, -1.6, 3.2), dentAmt, 29), { m: mat([0, -0.05, 0.004]), ...L.steel });
    A.add(th, new THREE.CylinderGeometry(0.055, 0.055, 0.08, A.seg(14)), { m: mat([0, -0.05, -0.002]), ...L.dark });
    A.add(kn, dent(new THREE.CylinderGeometry(0.058, 0.052, 0.085, A.seg(20)), dentAmt, 23), { m: mat([0, -0.045, 0.004]), ...L.steel });
    A.add(kn, new THREE.SphereGeometry(0.048, A.seg(16), A.seg(10), 0, Math.PI * 2, 0, Math.PI * 0.5), { m: mat([0, 0.004, 0.024], [Math.PI / 2 - 0.2, 0, 0], [1, 1, 0.8]), ...L.steel });
    if (o.sabatons !== false) {
      // 3 half-ellipsoid lames, step-overlapped toward the toe
      for (let i = 0; i < 3; i++) {
        const sc = [[0.062, 0.05, 0.075], [0.058, 0.045, 0.07], [0.052, 0.038, 0.06]][i];
        const geo = new THREE.SphereGeometry(1, A.seg(20), A.seg(10), 0, Math.PI * 2, 0, Math.PI / 2).scale(sc[0], sc[1], sc[2]);
        A.add(ft, geo, { m: mat([0, -0.03, 0.005 + i * 0.03]), ...L.dark });
      }
      A.add(ft, new THREE.CylinderGeometry(0.064, 0.064, 0.006, A.seg(20)), { m: mat([0, -0.03, 0.035], [0, 0, 0], [1, 1, 1.45]), ...L.inner });
    }
  }
}

/** Gauntlet on a paw bone: mitten dome, 4 finger lames, flared cuff with a brass ring. */
export function addGauntlet(A, bone, L = looks('plate'), { cuff = true } = {}) {
  if (!A.seg) A.seg = (n) => n;
  // hand plate: a rounded mitten, with 3 overlapping finger lames curling forward (dark gaps read as articulation)
  A.add(bone, new THREE.SphereGeometry(0.057, A.seg(22), A.seg(16)).scale(1.05, 0.88, 1.08), { m: mat([0, -0.034, 0.004]), ...L.steel });
  for (let f = 0; f < 3; f++) {
    const g = new THREE.SphereGeometry(0.052 - f * 0.005, A.seg(18), A.seg(10), 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.08, 0.5, 1.0);
    A.add(bone, g, { m: mat([0, -0.064 - f * 0.013, 0.014 + f * 0.013], [0.5 + f * 0.45, 0, 0]), ...L.steel });
  }
  A.add(bone, new THREE.CapsuleGeometry(0.016, 0.022, 4, 8), { m: mat([0.048, -0.042, 0.032], [0.6, 0, -0.5]), ...L.steel }); // thumb
  if (cuff) { // flared cuff with a brass ring (standalone gauntlets)
    A.add(bone, new THREE.CylinderGeometry(0.056, 0.044, 0.045, A.seg(24), A.seg(1), false), { m: mat([0, 0.012, 0]), ...L.steel });
    A.add(bone, new THREE.TorusGeometry(0.055, 0.005, A.seg(6), A.seg(28)), { m: mat([0, 0.034, 0], [Math.PI / 2, 0, 0]), ...L.brass });
  }
  A.add(bone, new THREE.CylinderGeometry(0.046, 0.052, 0.03, A.seg(18)), { m: mat([0, -0.002, 0]), ...L.steel }); // wrist plate
}

export { looks as armourLooks };
