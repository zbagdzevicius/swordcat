// Phase W props (WARM_ADVENTURE_SPEC §2.5 / §8, characters.W5): the "Big Squeaky Bone" mallet look for Barkus, the
// Squeakybone bone, and the painted faces of the practice props (Sir Sacky's stitched face, Sir Wobble's smile).
// One mesh each on the shared kit WarmToon (vertex colours + rmse): one draw, no new program. Kitten-scale units
// (1 = Swordcat's height); world / enemies parent and scale them.
import * as THREE from 'three';
import { WARM_LOOKS } from '../palette.js';
import { GeoBuilder, mat, rgb, mixRgb, smoothstep } from '../util.js';
import { kitMaterial, RM } from '../materials.js';

const one = (gb, name) => {
  const m = new THREE.Mesh(gb.build(), kitMaterial('plain'));
  m.name = name; m.castShadow = false; m.receiveShadow = false;
  return m;
};

/** Bone colour with a soft cream highlight on top (toon reads it as a chunky toy). */
const boneCol = (base) => (v, n) => mixRgb(base, [1, 0.98, 0.92], Math.max(0, n.y) * 0.25);

/**
 * A cartoon bone along +Y: shaft + two double knobs per end; `knob` paints the rubber end caps (squeaky toy).
 * @param {{ len?: number, r?: number, color?: string, knob?: string|null }} [o]
 */
export function squeakyBone(o = {}) {
  const len = o.len ?? 0.6, r = o.r ?? 0.045, gb = new GeoBuilder();
  const bone = rgb(o.color ?? WARM_LOOKS.squeakyBone), knob = o.knob === null ? null : rgb(o.knob ?? WARM_LOOKS.squeakyKnob);
  gb.add(new THREE.CylinderGeometry(r, r, len, 14, 1), { matrix: mat([0, len / 2, 0]), color: boneCol(bone), rmse: RM.bone });
  for (const y of [0, len]) for (const s of [1, -1]) {
    gb.add(new THREE.SphereGeometry(r * 1.55, 16, 12), { matrix: mat([s * r * 1.15, y + (y ? r * 0.6 : -r * 0.6), 0]), color: knob ?? boneCol(bone), rmse: knob ? RM.plastic : RM.bone });
  }
  return one(gb, 'squeaky_bone');
}

/**
 * The Big Squeaky Bone mallet (Barkus, WA §2.5): same reach and hitbox as the old weapon (enemies keep it), a
 * chunky bone head with red rubber caps on a short honey-wood grip. Origin at the grip end, along +Y.
 * @param {{ len?: number, head?: number }} [o] len: total length (m-ish, kitten units), head: bone head length
 */
export function bigSqueakyBone(o = {}) {
  const len = o.len ?? 1.1, headL = o.head ?? 0.5, gb = new GeoBuilder();
  const grip = rgb('#B7773F'), wrap = rgb('#E8B87A');
  gb.add(new THREE.CylinderGeometry(0.03, 0.035, len - 0.12, 10, 6), {
    matrix: mat([0, (len - 0.12) / 2, 0]),
    color: (v) => mixRgb(grip, wrap, smoothstep(0.3, 0.7, 0.5 + 0.5 * Math.sin(v.y * 90))), rmse: RM.wood,
  });
  // the bone head lies across the top of the handle
  const r = 0.07, bone = rgb(WARM_LOOKS.squeakyBone), knob = rgb(WARM_LOOKS.squeakyKnob);
  gb.add(new THREE.CylinderGeometry(r, r, headL, 16, 1), { matrix: mat([0, len, 0], [0, 0, Math.PI / 2]), color: boneCol(bone), rmse: RM.bone });
  for (const x of [-headL / 2, headL / 2]) for (const s of [1, -1]) {
    gb.add(new THREE.SphereGeometry(r * 1.5, 18, 12), { matrix: mat([x + Math.sign(x) * r * 0.5, len + s * r * 1.1, 0]), color: knob, rmse: RM.plastic });
  }
  return one(gb, 'big_squeaky_bone');
}

/**
 * Sir Sacky's face (ON §4.2): a stitched smile, two button eyes and rosy cheeks, built flat on +Z (stick it on the sack).
 * @param {{ size?: number }} [o] size: face width
 */
export function sackyFace(o = {}) {
  const w = o.size ?? 0.3, gb = new GeoBuilder(), ink = rgb(WARM_LOOKS.sirSackyStitch), cheek = rgb('#F2A08E');
  for (const s of [1, -1]) {
    gb.add(new THREE.CircleGeometry(w * 0.07, 14), { matrix: mat([s * w * 0.2, w * 0.08, 0]), color: ink, rmse: RM.cloth });
    gb.add(new THREE.CircleGeometry(w * 0.09, 14), { matrix: mat([s * w * 0.34, -w * 0.06, -0.001]), color: cheek, rmse: RM.cloth });
  }
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w * 0.2, -w * 0.08, 0), new THREE.Vector3(0, -w * 0.26, 0), new THREE.Vector3(w * 0.2, -w * 0.08, 0));
  gb.add(new THREE.TubeGeometry(curve, 12, w * 0.018, 5, false), { color: ink, rmse: RM.cloth });
  for (let i = 0; i < 5; i++) {   // stitches across the smile
    const p = curve.getPoint((i + 0.5) / 5);
    gb.add(new THREE.BoxGeometry(w * 0.012, w * 0.07, w * 0.012), { matrix: mat([p.x, p.y, p.z]), color: ink, rmse: RM.cloth });
  }
  return one(gb, 'sacky_face');
}

/**
 * Sir Wobble's painted smile (ON §4.2): a wide cocoa smile + two dot eyes, flat on +Z.
 * @param {{ size?: number }} [o]
 */
export function wobbleSmile(o = {}) {
  const w = o.size ?? 0.3, gb = new GeoBuilder(), ink = rgb(WARM_LOOKS.wobbleSmile);
  for (const s of [1, -1]) gb.add(new THREE.CircleGeometry(w * 0.06, 14), { matrix: mat([s * w * 0.18, w * 0.1, 0]), color: ink, rmse: RM.paper });
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w * 0.26, -w * 0.02, 0), new THREE.Vector3(0, -w * 0.3, 0), new THREE.Vector3(w * 0.26, -w * 0.02, 0));
  gb.add(new THREE.TubeGeometry(curve, 16, w * 0.025, 5, false), { color: ink, rmse: RM.paper });
  return one(gb, 'wobble_smile');
}

/** Phase W prop builders, merged into ProcProps' factory (`buildProp(name)`). */
export const WARM_BUILDERS = Object.freeze({
  squeaky_bone: squeakyBone, big_squeaky_bone: bigSqueakyBone, sacky_face: sackyFace, wobble_smile: wobbleSmile,
});
export const WARM_PROP_NAMES = Object.freeze(Object.keys(WARM_BUILDERS));
