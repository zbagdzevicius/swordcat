// Beast heads for the KayKit humanoid rig (GAME_DESIGN §18.3, §11; research/art.md §11):
//   hyena   tawny #A88A5E, spots #4A3A2A, round ears, mane tuft cards, amber slit eyes (Snickerpack, Cacklejaw, Pilfer)
//   pug     fawn #C9A27A, black mask #2A2522, wrinkles, folded ears (Pug Shieldbearers, Sir Brutus)
//   bulldog brindle #6B4E3A, jowls, underbite with 2 fangs, eyepatch, horned helm (Lord Barkus)
// buildBeastHead(preset, opts) builds a head ~opts.size tall (default 1) centred at its root, facing +Z.
// attachBeastHead(model, preset, opts) measures the KayKit head mesh, hides it, and parents the beast head to bone `head`.
import * as THREE from 'three';
import { GeoBuilder, mat, rgb, mixRgb, fbm3, smoothstep, mulberry32, hashString, damp } from './util.js';
import { kitMaterial, makeToonMaterial, RM, tuftMaterial, own } from './materials.js';
import { eyeGeometry, eyeMaterial } from './Eyes.js';
import { TOP_TINT } from './Readability.js';

export const BEAST_PRESETS = Object.freeze({
  hyena: { fur: '#C99A5E', furDark: '#9C7448', spots: '#6E5A86', muzzle: '#7A6890', belly: '#E8D2A8', ear: '#5D4A6E', earInner: '#D9A494', nose: '#4A3A5E', mouth: '#9A4A5A', tooth: '#F6EFE4', maneRoot: '#5D4A6E', eye: { inner: '#F6D27A', outer: '#D9962E', ring: '#5A3A22', pupilR: 54, sclera: true }, scale: 1.3 },
  pug: { fur: '#D9B48A', furDark: '#B89064', mask: '#5D4A6E', ear: '#5D4A6E', nose: '#4A3A5E', eye: { inner: '#C99A6A', outer: '#7A5A3A', ring: '#4A3424', pupilR: 54, sclera: true }, scale: 1.15 },
  bulldog: { fur: '#9A7458', furDark: '#7A5A44', stripe: '#6A4E3E', muzzle: '#D8C8AE', mask: '#5D4A6E', ear: '#6A4E3E', nose: '#4A3A5E', eye: { inner: '#F2B65A', outer: '#C9702E', ring: '#5A3020', pupilR: 54, sclera: true }, helm: '#5A6E9C', trim: '#F2D06B', horn: '#F6EFE4', patch: '#4A3A5E', scale: 1.3 },
});

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * @param {'hyena'|'pug'|'bulldog'} preset
 * @param {{size?: number, mane?: boolean, chippedEar?: 'left'|'right'|null, scar?: boolean, jowls?: boolean, underbite?: boolean,
 *          eyepatch?: boolean, hornedHelm?: boolean, seed?: number}} [opts]
 * @returns {{ root: THREE.Group, preset: string, jaw: THREE.Object3D, setExpression(name: string): void, update(dt: number): void,
 *             setHelm?(on: boolean): void, dispose(): void, parts: object }}
 */
export function buildBeastHead(preset = 'hyena', opts = {}) {
  const P = BEAST_PRESETS[preset] || BEAST_PRESETS.hyena;
  const root = new THREE.Group(); root.name = 'beastHead:' + preset;
  const inner = new THREE.Group(); root.add(inner);
  const size = opts.size ?? 1;
  inner.scale.setScalar(size);
  const rnd = mulberry32(opts.seed ?? hashString(preset));
  const gb = new GeoBuilder(), jawGb = new GeoBuilder(), tuftGb = new GeoBuilder();
  const jaw = new THREE.Group(); jaw.name = 'jaw';
  const browL = new THREE.Group(), browR = new THREE.Group();
  const furC = rgb(P.fur), darkC = rgb(P.furDark);
  const parts = {};
  let eyeY = 0.06, eyeX = 0.15, eyeZ = 0.3, eyeR = 0.07;
  let helm = null;

  if (preset === 'hyena') {
    // Spotted hyena (TREND V2 frame): sloping skull, long dark snout, high round ears, scruffy mane, grinning jaw.
    const spots = rgb(P.spots), muzzle = rgb(P.muzzle), belly = rgb(P.belly);
    const skinCol = (v) => {
      let c = mixRgb(furC, darkC, smoothstep(0.05, 0.3, v.y) * smoothstep(0.1, -0.25, v.z) * 0.7);
      c = mixRgb(c, belly, smoothstep(-0.08, -0.3, v.y) * 0.55);
      const n = fbm3(v.x * 10 + 3, v.y * 10, v.z * 10, 2);
      if (n > 0.52 && v.z < 0.3) c = mixRgb(c, spots, smoothstep(0.52, 0.58, n) * 0.95);
      // dark face mask running from the eyes down the snout
      c = mixRgb(c, muzzle, smoothstep(0.16, 0.36, v.z) * smoothstep(0.12, -0.02, Math.abs(v.x) - 0.02) * 0.65);
      return c;
    };
    gb.add(new THREE.SphereGeometry(0.31, 36, 26).scale(0.98, 0.9, 1.08), { matrix: mat([0, 0.02, -0.02]), color: skinCol, rmse: RM.fur });
    // brow ridge + snout bridge + long tapered snout
    gb.add(new THREE.SphereGeometry(0.18, 24, 16).scale(1.1, 0.5, 0.9), { matrix: mat([0, 0.15, 0.1]), color: skinCol, rmse: RM.fur });
    gb.add(new THREE.SphereGeometry(0.18, 24, 16).scale(0.85, 0.75, 1.25), { matrix: mat([0, -0.04, 0.26]), color: (v) => mixRgb(skinCol(v), muzzle, smoothstep(0.25, 0.45, v.z)), rmse: RM.fur });
    const snout = new THREE.SphereGeometry(0.15, 28, 20).scale(0.78, 0.66, 1.75);
    gb.add(snout, { matrix: mat([0, -0.1, 0.42]), color: (v) => mixRgb(muzzle, rgb(P.nose), smoothstep(0.5, 0.66, v.z)), rmse: RM.furShort });
    gb.add(new THREE.SphereGeometry(0.06, 18, 12).scale(1.35, 0.85, 0.85), { matrix: mat([0, -0.055, 0.67]), color: rgb(P.nose), rmse: RM.nose });
    // scruffy cheeks + throat
    for (const s of [1, -1]) gb.add(new THREE.SphereGeometry(0.14, 20, 14).scale(1, 1.1, 1), { matrix: mat([s * 0.2, -0.12, 0.08]), color: skinCol, rmse: RM.fur });
    gb.add(new THREE.SphereGeometry(0.18, 20, 14), { matrix: mat([0, -0.22, 0.02]), color: (v) => mixRgb(skinCol(v), belly, 0.4), rmse: RM.fur });
    // ears: big, round, set high and back, dark rims
    for (const s of [1, -1]) {
      const chipped = (opts.chippedEar === 'left' && s > 0) || (opts.chippedEar === 'right' && s < 0);
      const ear = new THREE.SphereGeometry(0.15, 24, 16).scale(1, 1.2, 0.3);
      if (chipped) {
        const p = ear.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); if (x * s > 0.02 && y > 0.07 && Math.hypot(x - s * 0.1, y - 0.14) < 0.07) p.setXYZ(i, x * 0.6, y * 0.75, p.getZ(i)); }
        ear.computeVertexNormals();
      }
      const em = mat([s * 0.21, 0.33, -0.1], [-0.35, s * 0.3, s * -0.3]);
      gb.add(ear, { matrix: em, color: (v, n, lp) => (lp.z > 0.01 && Math.hypot(lp.x, lp.y / 1.2) < 0.11 ? rgb(P.earInner) : (Math.hypot(lp.x, lp.y / 1.2) > 0.125 ? rgb(P.ear) : mixRgb(furC, darkC, 0.4))), rmse: RM.furShort });
    }
    // grinning lower jaw with teeth (hinged under the snout)
    jaw.position.set(0, -0.17, 0.2);
    jawGb.add(new THREE.SphereGeometry(0.13, 20, 14).scale(0.78, 0.42, 1.75), { matrix: mat([0, -0.02, 0.18]), color: (v) => mixRgb(rgb(P.furDark), muzzle, smoothstep(0.1, 0.3, v.z)), rmse: RM.furShort });
    jawGb.add(new THREE.SphereGeometry(0.1, 16, 10).scale(0.75, 0.28, 1.6), { matrix: mat([0, 0.012, 0.18]), color: rgb(P.mouth), rmse: RM.mouth });
    // four rounded toy teeth (ART §7.2: cute-menacing; no rows of fangs)
    for (const s of [1, -1]) {
      jawGb.add(new THREE.CapsuleGeometry(0.016, 0.018, 3, 8), { matrix: mat([s * 0.05, 0.035, 0.31]), color: rgb(P.tooth), rmse: RM.bone });
      gb.add(new THREE.CapsuleGeometry(0.016, 0.016, 3, 8), { matrix: mat([s * 0.055, -0.175, 0.505], [Math.PI, 0, 0]), color: rgb(P.tooth), rmse: RM.bone });
    }
    // mane: dark tuft cards along the crown, nape and down the neck, plus scruffy cheek tufts
    const mane = opts.mane !== false;
    const nCards = mane ? 34 : 14;
    for (let i = 0; i < nCards; i++) {
      const t = i / nCards, a = -0.3 + t * 2.4;
      const at = V((rnd() - 0.5) * 0.16, Math.cos(a) * 0.27 + 0.02, Math.sin(-a) * 0.28 - 0.04);
      const dir = V((rnd() - 0.5) * 0.7, 0.7 + Math.cos(a) * 0.4, -0.7 - rnd() * 0.4);
      card(tuftGb, at, dir, (mane ? 0.2 : 0.11) + rnd() * 0.1, 0.13, rgb(P.maneRoot), rgb(P.furDark), rnd);
    }
    for (const s of [1, -1]) for (let i = 0; i < 6; i++) card(tuftGb, V(s * 0.28, -0.16 + i * 0.05, 0.02), V(s, -0.4 + rnd() * 0.3, 0.1), 0.11 + rnd() * 0.05, 0.09, furC, rgb(P.belly), rnd);
    eyeY = 0.07; eyeX = 0.128; eyeZ = 0.285; eyeR = 0.06;
  } else if (preset === 'pug') {
    const mask = rgb(P.mask);
    const faceCol = (v) => {
      const m = smoothstep(0.12, 0.3, v.z) * smoothstep(0.25, 0.05, v.y);
      return mixRgb(mixRgb(furC, darkC, smoothstep(0.2, 0.36, v.y) * 0.4), mask, m);
    };
    gb.add(new THREE.SphereGeometry(0.35, 36, 26).scale(1.1, 0.95, 0.95), { color: faceCol, rmse: RM.fur });
    gb.add(new THREE.SphereGeometry(0.2, 28, 18).scale(1.35, 0.85, 0.7), { matrix: mat([0, -0.1, 0.27]), color: (v) => mixRgb(mask, rgb(P.nose), smoothstep(-0.2, -0.3, v.y)), rmse: RM.furShort });
    gb.add(new THREE.SphereGeometry(0.06, 16, 10).scale(1.4, 0.8, 0.7), { matrix: mat([0, -0.03, 0.4]), color: rgb(P.nose), rmse: RM.nose });
    // wrinkles: dark arcs on the forehead
    for (let i = 0; i < 3; i++) gb.add(new THREE.TorusGeometry(0.1 - i * 0.02, 0.009, 6, 20, Math.PI * 0.8), { matrix: mat([0, 0.17 + i * 0.045, 0.3 - i * 0.02], [0.35 + i * 0.12, 0, Math.PI * 0.1]), color: rgb('#6E5236'), rmse: RM.furShort });
    gb.add(new THREE.TorusGeometry(0.16, 0.012, 6, 24, Math.PI * 0.9), { matrix: mat([0, 0.0, 0.31], [0.2, 0, Math.PI * 1.05]), color: rgb(P.mask), rmse: RM.furShort });
    // folded ears
    for (const s of [1, -1]) gb.add(new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 0.45), { matrix: mat([s * 0.3, 0.2, 0.02], [0.4, s * 0.4, s * -1.9]), color: rgb(P.ear), rmse: RM.furShort });
    // lower lip / jaw
    jaw.position.set(0, -0.22, 0.2);
    jawGb.add(new THREE.SphereGeometry(0.13, 18, 12).scale(1.2, 0.45, 0.8), { matrix: mat([0, 0.0, 0.05]), color: mask, rmse: RM.furShort });
    jawGb.add(new THREE.SphereGeometry(0.035, 10, 8).scale(1.2, 0.6, 0.8), { matrix: mat([0, 0.02, 0.15]), color: rgb('#E58A93'), rmse: RM.mouth });
    if (opts.scar) gb.add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), { matrix: mat([-0.17, 0.08, 0.31], [0.2, 0, 0.6]), color: rgb('#E8D6C0'), rmse: RM.skin });
    eyeY = 0.04; eyeX = 0.175; eyeZ = 0.25; eyeR = 0.085;
  } else { // bulldog
    const stripe = rgb(P.stripe), muzzle = rgb(P.muzzle);
    const brindle = (v) => mixRgb(furC, stripe, smoothstep(0.55, 0.75, 0.5 + 0.5 * Math.sin(v.y * 40 + fbm3(v.x * 5, v.y * 5, v.z * 5, 2) * 8)) * 0.7);
    gb.add(new THREE.SphereGeometry(0.37, 36, 26).scale(1.18, 0.92, 1.0), { color: brindle, rmse: RM.fur });
    gb.add(new THREE.SphereGeometry(0.2, 24, 16).scale(1.35, 0.85, 0.85), { matrix: mat([0, -0.07, 0.3]), color: (v) => mixRgb(brindle(v), muzzle, smoothstep(0.32, 0.45, v.z) * 0.8), rmse: RM.fur });
    gb.add(new THREE.SphereGeometry(0.07, 16, 10).scale(1.5, 0.8, 0.8), { matrix: mat([0, 0.0, 0.46]), color: rgb(P.nose), rmse: RM.nose });
    if (opts.jowls !== false) for (const s of [1, -1]) gb.add(new THREE.SphereGeometry(0.16, 20, 14).scale(0.9, 1.15, 0.8), { matrix: mat([s * 0.17, -0.2, 0.3], [0, 0, s * 0.15]), color: (v) => mixRgb(brindle(v), muzzle, 0.55), rmse: RM.fur });
    // underbite jaw + 2 fangs
    jaw.position.set(0, -0.26, 0.22);
    jawGb.add(new THREE.SphereGeometry(0.16, 20, 12).scale(1.3, 0.55, 1.0), { matrix: mat([0, -0.02, 0.1]), color: muzzle, rmse: RM.fur });
    jawGb.add(new THREE.SphereGeometry(0.12, 16, 10).scale(1.2, 0.3, 0.9), { matrix: mat([0, 0.02, 0.12]), color: rgb('#9A4A5A'), rmse: RM.mouth });
    if (opts.underbite !== false) for (const s of [1, -1]) jawGb.add(new THREE.CapsuleGeometry(0.026, 0.04, 3, 8), { matrix: mat([s * 0.11, 0.07, 0.2]), color: rgb('#F6EFE4'), rmse: RM.bone });
    for (const s of [1, -1]) gb.add(new THREE.SphereGeometry(0.09, 14, 10).scale(1, 0.6, 0.5), { matrix: mat([s * 0.36, 0.2, -0.02], [0, 0, s * -0.6]), color: rgb(P.ear), rmse: RM.furShort });
    if (opts.eyepatch) {
      gb.add(new THREE.SphereGeometry(0.1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), { matrix: mat([0.16, 0.08, 0.31], [Math.PI / 2 - 0.15, 0, -0.35]), color: rgb(P.patch), rmse: RM.leather });
      gb.add(new THREE.TorusGeometry(0.42, 0.012, 6, 40), { matrix: mat([0, 0.12, 0.0], [0.15, 0, 0.5], [1.12, 1, 1.02]), color: rgb(P.patch), rmse: RM.leather });
    }
    if (opts.hornedHelm !== false) {
      const hg = new GeoBuilder(), iron = rgb(P.helm), trim = rgb(P.trim), horn = rgb(P.horn);
      // readability from above (CONTROLS_SPEC §12 characters 3): the crown of the helm takes a contrasting top colour
      const crown = rgb(P.helmTop ?? TOP_TINT.color);
      hg.add(new THREE.SphereGeometry(0.43, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1.15, 0.9, 1.05), { matrix: mat([0, 0.08, -0.02], [-0.12, 0, 0]), color: (v, n) => mixRgb(iron, crown, smoothstep(TOP_TINT.from + 0.2, TOP_TINT.to + 0.1, n.y) * 0.55), rmse: [0.4, 0.9, 0, 0] });
      hg.add(new THREE.TorusGeometry(0.42, 0.03, 8, 40), { matrix: mat([0, 0.2, 0.02], [Math.PI / 2 - 0.12, 0, 0], [1.15, 1.05, 1]), color: trim, rmse: [0.5, 0.6, 0, 0] });
      for (const s of [1, -1]) {
        const curve = new THREE.CatmullRomCurve3([V(s * 0.38, 0.3, 0), V(s * 0.58, 0.38, 0.05), V(s * 0.68, 0.58, 0.12), V(s * 0.62, 0.78, 0.18)]);
        const tube = new THREE.TubeGeometry(curve, 20, 1, 10, false);
        const tp = tube.attributes.position, c = new THREE.Vector3();
        for (let i = 0; i < tp.count; i++) { const t = Math.floor(i / 11) / 20; curve.getPointAt(t, c); const r = 0.075 * (1 - t * 0.85) + 0.006; tp.setXYZ(i, c.x + (tp.getX(i) - c.x) * r, c.y + (tp.getY(i) - c.y) * r, c.z + (tp.getZ(i) - c.z) * r); }
        tube.computeVertexNormals();
        hg.add(tube, { color: (v) => mixRgb(horn, rgb('#C9B48E'), smoothstep(0.7, 0.4, v.y)), rmse: RM.bone });
        const tipP = curve.getPointAt(1);
        hg.add(new THREE.SphereGeometry(0.03, 10, 8), { matrix: mat([tipP.x, tipP.y, tipP.z]), color: horn, rmse: RM.bone });   // round horn tips
      }
      for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; hg.add(new THREE.SphereGeometry(0.025, 8, 6), { matrix: mat([Math.sin(a) * 0.47, 0.2, Math.cos(a) * 0.43]), color: rgb(P.trim), rmse: [0.4, 0.9, 0, 0] }); }
      helm = new THREE.Mesh(hg.build(), kitMaterial()); helm.name = 'hornedHelm'; helm.castShadow = true;
      inner.add(helm);
    }
    eyeY = 0.07; eyeX = 0.16; eyeZ = 0.3; eyeR = 0.06;
  }

  const headMesh = new THREE.Mesh(gb.build(), kitMaterial()); headMesh.castShadow = true; headMesh.name = 'beastSkull';
  inner.add(headMesh);
  const jawMesh = new THREE.Mesh(jawGb.build(), kitMaterial()); jawMesh.castShadow = true; jawMesh.name = 'beastJaw';
  jaw.add(jawMesh); inner.add(jaw);
  if (!tuftGb.empty) { const tm = new THREE.Mesh(tuftGb.build(), tuftMaterial('plain')); tm.name = 'beastMane'; tm.renderOrder = 2; inner.add(tm); parts.mane = tm; }

  // eyes (art.md §2.5 texture with slit / beady pupils) + angry brows
  const eGeo = eyeGeometry(eyeR, 0.6), eMat = eyeMaterial(P.eye);
  const eyes = [];
  for (const s of [1, -1]) {
    if (opts.eyepatch && preset === 'bulldog' && s > 0) continue;
    const e = new THREE.Mesh(eGeo, eMat);
    e.position.set(s * eyeX, eyeY, eyeZ); e.rotation.set(0, s * 0.35, 0);
    e.name = 'beastEye'; inner.add(e); eyes.push(e);
  }
  const browGeo = browGeometry(preset === 'hyena' ? '#5D4A6E' : preset === 'pug' ? '#4A3A5E' : '#5A4050');
  for (const [s, g] of [[1, browL], [-1, browR]]) {
    // PERF §1.2: vertex-coloured on the shared kit material (was a colour-only toon program of its own)
    const b = new THREE.Mesh(browGeo, kitMaterial('plain'));
    b.castShadow = false; g.add(b);
    g.position.set(s * eyeX, eyeY + eyeR * 1.35, eyeZ + 0.015); g.rotation.y = s * 0.3;
    inner.add(g);
  }
  parts.eyes = eyes; parts.skull = headMesh; parts.jaw = jaw; parts.helm = helm;

  // expression state
  let expr = 'neutral', laughT = 0, jawOpen = 0, jawTarget = 0, browTilt = 0.35, browTarget = 0.35, squint = 1, squintTarget = 1;
  const head = {
    root, preset, jaw, parts,
    /** 'neutral' | 'sneer' | 'angry' | 'laugh' | 'sad' | 'surprised' | 'kneel' */
    setExpression(name) {
      expr = name;
      jawTarget = { neutral: 0.05, sneer: 0.15, angry: 0.12, laugh: 0.35, sad: 0.02, surprised: 0.4, kneel: 0.02 }[name] ?? 0.05;
      browTarget = { neutral: 0.25, sneer: 0.45, angry: 0.6, laugh: 0.2, sad: -0.45, surprised: -0.2, kneel: -0.1 }[name] ?? 0.25;
      squintTarget = { laugh: 0.45, sneer: 0.75, angry: 0.8, sad: 0.8, surprised: 1.15 }[name] ?? 1;
    },
    update(dt) {
      laughT += dt;
      let j = jawTarget;
      if (expr === 'laugh') j = jawTarget + Math.abs(Math.sin(laughT * 11)) * 0.25;
      jawOpen = damp(jawOpen, j, 18, dt);
      jaw.rotation.x = jawOpen;
      browTilt = damp(browTilt, browTarget, 10, dt);
      browL.rotation.z = browTilt; browR.rotation.z = -browTilt;
      squint = damp(squint, squintTarget, 10, dt);
      for (const e of eyes) e.scale.y = squint;
      if (expr === 'laugh') inner.rotation.x = Math.sin(laughT * 11) * 0.03 - 0.08; else inner.rotation.x = damp(inner.rotation.x, 0, 8, dt);
    },
    /** Barkus phase 2: the helm shatters (enemies spawn the debris fx). */
    setHelm(on) { if (helm) helm.visible = on; },
    dispose() { root.traverse((o) => { if (o.isMesh && !o.geometry.userData.sharedBrow) o.geometry.dispose(); }); },
    size,
  };
  head.setExpression(preset === 'hyena' ? 'sneer' : 'angry');
  head.update(1);
  return head;
}

function card(gb, at, dir, len, wid, c0, c1, rnd) {
  const g = new THREE.PlaneGeometry(wid, len, 1, 3).translate(0, len / 2, 0);
  const up = dir.clone().normalize();
  const side = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(up).normalize();
  const nrm = new THREE.Vector3().crossVectors(side, up).normalize();
  const m = new THREE.Matrix4().makeBasis(side, up, nrm).setPosition(at);
  gb.add(g, { matrix: m, color: (v, n, lp) => mixRgb(c0, c1, smoothstep(0, len, lp.y)), rmse: RM.fur });
}

const _browGeos = new Map();
/** A brow capsule coloured `c` (vertex colour + fur rmse; shared per colour, never disposed per head). */
function browGeometry(c) {
  if (!_browGeos.has(c)) {
    const gb = new GeoBuilder();
    gb.add(new THREE.CapsuleGeometry(0.016, 0.085, 4, 8).rotateZ(Math.PI / 2), { color: rgb(c), rmse: RM.fur });
    const g = gb.build(); g.userData.sharedBrow = true;
    _browGeos.set(c, g);
  }
  return _browGeos.get(c);
}

/** Known KayKit head nodes and the hat / hood nodes that hide the seam. */
export const KAYKIT_HEADS = Object.freeze({ Barbarian: 'Barbarian_Head', Knight: 'Knight_Head', Rogue_Hooded: 'Rogue_Head_Hooded', Rogue: 'Rogue_Head', Mage: 'Mage_Head' });

/**
 * Replace a KayKit model's head with a beast head.
 * @param {THREE.Object3D} model a fitted SkeletonUtils clone in bind pose
 * @param {'hyena'|'pug'|'bulldog'} preset
 * @param {{headNode?: string, bone?: string, scale?: number, lift?: number, forward?: number} & object} [opts]
 * @returns {ReturnType<typeof buildBeastHead>|null}
 */
export function attachBeastHead(model, preset, opts = {}) {
  model.updateMatrixWorld(true);
  const bone = model.getObjectByName(opts.bone || 'head');
  if (!bone) return null;
  let headMesh = opts.headNode ? model.getObjectByName(opts.headNode) : null;
  if (!headMesh) for (const n of Object.values(KAYKIT_HEADS)) { headMesh = model.getObjectByName(n); if (headMesh) break; }
  const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
  const box = new THREE.Box3();
  if (headMesh && headMesh.geometry) {
    headMesh.geometry.computeBoundingBox();
    const bb = headMesh.geometry.boundingBox, m = new THREE.Matrix4().multiplyMatrices(inv, headMesh.matrixWorld);
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(m));
    headMesh.visible = false;
  } else {
    box.setFromCenterAndSize(new THREE.Vector3(0, 0.42, 0.03), new THREE.Vector3(1.08, 1.05, 1.0));
  }
  const h0 = box.max.y - box.min.y;
  const scale = opts.scale ?? BEAST_PRESETS[preset]?.scale ?? 1.3;
  const head = buildBeastHead(preset, { ...opts, size: h0 * scale });
  const c = box.getCenter(new THREE.Vector3());
  head.root.position.set(c.x, c.y + (opts.lift ?? 0.3) * (h0 * scale - h0), c.z + (opts.forward ?? 0) * h0);
  bone.add(head.root);
  head.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return head;
}
