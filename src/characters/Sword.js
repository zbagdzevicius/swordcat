// The Borrowed Blade and cosmetic sword skins (research/art.md §4.3; GAME_DESIGN §13.4).
// Sword space: origin at the crossguard centre, +Y toward the tip, blade flat facing ±Z. Total ≈ 1.0 H.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { GeoBuilder, mat, rgb, mixRgb, smoothstep } from './util.js';
import { own, kitMaterial, RM } from './materials.js';
import { FUR_TIME } from './Fur.js';

export const SWORD = Object.freeze({ blade: 0.85, gripLen: 0.11, guardW: 0.21, pommelY: -0.132, gripY: -0.055 });
export const SWORD_SKINS = Object.freeze(['borrowed', 'twig', 'fishbone', 'baguette', 'diamond', 'toobig', 'dawnblade']);

const easeIn = (t) => t * t;

/** Blade outline (art.md §4.3). */
function bladeShape(len = 0.85, w0 = 0.033, w1 = 0.025, point = 0.1) {
  const s = new THREE.Shape();
  s.moveTo(-w0, 0); s.lineTo(-w1, len - point); s.lineTo(0, len); s.lineTo(w1, len - point); s.lineTo(w0, 0); s.closePath();
  return s;
}

/** Holy streak look: a narrow white-gold core with a soft golden falloff (ref1), bloom does the rest. */
export const STREAK = Object.freeze({ width: 0.16, gain: 1.05, color: '#FFD98A', bladeGlow: 1.9 });

/** Holy streak: cylindrical billboard along the blade (art.md §4.3). */
export function makeStreak(len = 1.0, width = STREAK.width) {
  const m = own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new THREE.Color(STREAK.color) }, uI: { value: 0 }, uWidth: { value: width }, uGain: { value: STREAK.gain } },
    vertexShader: /* glsl */`uniform float uWidth; varying vec2 vUv;
      void main(){ vUv = uv;
        vec3 base = (modelMatrix * vec4(0.0, position.y, 0.0, 1.0)).xyz;
        vec3 axis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        vec3 side = normalize(cross(axis, normalize(cameraPosition - base)));
        float sc = length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * viewMatrix * vec4(base + side * position.x * uWidth * sc, 1.0); }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uI, uGain; varying vec2 vUv;
      void main(){ float x = abs(vUv.x - 0.5) * 2.0;
        float a = (exp(-x * 9.0) * 0.75 + exp(-x * 3.0) * 0.25) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        gl_FragColor = vec4(uColor * a * uI * uGain, 1.0); }`,
  }));
  const g = new THREE.PlaneGeometry(1, len, 1, 8).translate(0, len / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'holyStreak'; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
  return mesh;
}

/** Dawnblade sparkles (GAME_DESIGN §13.4: 20 sparkles, ref1): additive twinkling points drifting up the blade. */
export const DAWN_SPARKLES = Object.freeze({ count: 20, color: '#FFE7A6', size: 0.05 });
let _sparkMat = null;
function sparkleMaterial() {
  if (_sparkMat) return _sparkMat;
  _sparkMat = own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: FUR_TIME, uColor: { value: new THREE.Color(DAWN_SPARKLES.color) }, uSize: { value: DAWN_SPARKLES.size }, uPR: { value: 1 } },
    vertexShader: /* glsl */`uniform float uTime, uSize, uPR; attribute float aPhase; varying float vA;
      void main(){ vec3 p = position;
        float life = fract(uTime * 0.22 + aPhase);
        p.y += life * 0.12; p.x += sin(uTime * 1.3 + aPhase * 17.0) * 0.012; p.z += cos(uTime * 1.1 + aPhase * 11.0) * 0.012;
        float tw = 0.5 + 0.5 * sin(uTime * (4.0 + aPhase * 5.0) + aPhase * 40.0);
        vA = sin(life * 3.14159) * (0.35 + 0.65 * tw);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float sc = length(modelMatrix[0].xyz);
        gl_PointSize = clamp(uSize * sc * 900.0 / max(-mv.z, 0.05), 1.0, 48.0) * (0.6 + 0.4 * tw);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float core = pow(max(smoothstep(0.5, 0.0, d), 0.0), 3.0);
        float star = max(0.0, 1.0 - abs(c.x) * 14.0) * smoothstep(0.5, 0.0, abs(c.y)) + max(0.0, 1.0 - abs(c.y) * 14.0) * smoothstep(0.5, 0.0, abs(c.x));
        gl_FragColor = vec4(uColor * (core + star * 0.6) * vA * 2.2, 1.0); }`,
  }));
  return _sparkMat;
}
/** 20 sparkle points along a blade of length `len` (sword space), seeded so every Dawnblade twinkles the same. */
export function makeBladeSparkles(len = 0.85, count = DAWN_SPARKLES.count) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), ph = new Float32Array(count);
  let a = 0x2F6B;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * 0.08; pos[i * 3 + 1] = 0.04 + rnd() * (len - 0.1); pos[i * 3 + 2] = (rnd() - 0.5) * 0.05;
    ph[i] = rnd();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, len / 2, 0), len);
  const pts = new THREE.Points(g, sparkleMaterial());
  pts.name = 'dawnSparkles'; pts.renderOrder = 5;
  return pts;
}

/** Blade material per sword instance (emissive tracks Valor and the holy charge). */
function bladeMaterial(kind) {
  const base = {
    metal: { color: '#ffffff', metalness: 1, roughness: 0.17, envMapIntensity: 0.85 },
    wood: { color: '#ffffff', metalness: 0, roughness: 0.82 },
    bone: { color: '#ffffff', metalness: 0, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#FFFFFF') },
    bread: { color: '#ffffff', metalness: 0, roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color('#FFE2B0') },
  }[kind] || {};
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, emissive: new THREE.Color(PAL.holy), emissiveIntensity: 0, ...base });
  if (kind === 'metal') { m.clearcoat = 0.2; m.clearcoatRoughness = 0.15; }
  return own(m);
}

/** Borrowed Blade geometry pieces → { blade: BufferGeometry, hilt: GeoBuilder pieces }. */
function borrowedBlade(gbBlade, gbHilt, o = {}) {
  const len = o.len ?? SWORD.blade;
  // (a touch wider than art.md's first pass, with a wide bevel: from the gameplay follow camera, 3-4 m behind her,
  // the blade must read as a bright line, not a hairline)
  const ex = new THREE.ExtrudeGeometry(bladeShape(len), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.0075, bevelSegments: 1, curveSegments: 1 });
  ex.computeBoundingBox(); const cz = (ex.boundingBox.max.z + ex.boundingBox.min.z) / 2; ex.translate(0, 0, -cz);
  // the honed edge is over-bright (linear > 1): the metal reflects the overcast sky ~1.5x, so the bevel glints even
  // edge-on and from behind
  const bladeC = rgb(PAL.blade), edge = rgb('#F2F5F8').map((c) => c * 1.5);
  gbBlade.add(ex, { color: (v, n) => (Math.abs(n.z) < 0.9 ? edge : bladeC), rmse: RM.steel });
  // fullers (dark inset), front and back, 60% of the blade from the guard
  for (const s of [1, -1]) gbBlade.add(new THREE.BoxGeometry(0.012, len * 0.6, 0.002), { matrix: mat([0, len * 0.3 + 0.02, s * 0.0085]), color: rgb('#6E747E'), rmse: RM.steelDark });
  hilt(gbHilt, o);
}

/** Crossguard, grip, pommel (brass + leather) into a kit GeoBuilder. */
function hilt(gb, o = {}) {
  const brass = o.brass ?? PAL.brass;
  const w = (o.guardW ?? SWORD.guardW) / 2 - 0.016;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-w, -0.012, 0), new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(w, -0.012, 0)]);
  gb.add(new THREE.TubeGeometry(curve, 16, 0.011, 8, false), { color: brass, rmse: RM.brass });
  for (const s of [1, -1]) gb.add(new THREE.SphereGeometry(0.016, 12, 10), { matrix: mat([s * (w + 0.008), -0.014, 0]), color: brass, rmse: RM.brass });
  gb.add(new THREE.SphereGeometry(0.018, 12, 8).scale(1.2, 0.7, 0.9), { matrix: mat([0, -0.002, 0]), color: brass, rmse: RM.brass }); // guard block
  const leather = rgb(o.grip ?? PAL.leatherDark), lightL = rgb(PAL.leather);
  gb.add(new THREE.CylinderGeometry(0.014, 0.016, SWORD.gripLen, 12, 8), {
    matrix: mat([0, SWORD.gripY, 0]),
    color: (v) => mixRgb(leather, lightL, smoothstep(0.3, 0.9, 0.5 + 0.5 * Math.sin(v.y * 260 + Math.atan2(v.z, v.x) * 1.0))),
    rmse: RM.leather,
  });
  gb.add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), { matrix: mat([0, -0.006, 0]), color: brass, rmse: RM.brass }); // ferrule
  gb.add(new THREE.SphereGeometry(0.026, 16, 12).scale(1, 0.85, 0.7), { matrix: mat([0, SWORD.pommelY, 0]), color: brass, rmse: RM.brass });
}

function twigBlade(gbBlade, gbHilt) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(Math.sin(t * 7) * 0.012, -0.13 + t * 1.0, Math.cos(t * 5) * 0.006)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 40, 0.014, 8, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 0.13) / 1.0; const c = curve.getPointAt(Math.min(1, Math.max(0, t))); p.setX(i, c.x + (p.getX(i) - c.x) * (1.15 - t * 0.6)); p.setZ(i, c.z + (p.getZ(i) - c.z) * (1.15 - t * 0.6)); }
  g.computeVertexNormals();
  const bark = rgb('#6B4A30'), barkL = rgb('#8F6A47');
  gbBlade.add(g, { color: (v) => mixRgb(bark, barkL, smoothstep(0.4, 0.8, Math.sin(v.y * 90) * 0.5 + 0.5)), rmse: RM.wood });
  // side twig + leaf near the tip
  gbBlade.add(new THREE.CylinderGeometry(0.004, 0.007, 0.12, 6), { matrix: mat([0.03, 0.55, 0], [0, 0, -0.7]), color: bark, rmse: RM.wood });
  const leaf = new THREE.SphereGeometry(0.03, 10, 6).scale(1.6, 0.35, 0.8);
  gbBlade.add(leaf, { matrix: mat([0.075, 0.6, 0], [0.2, 0, 0.4]), color: rgb('#6E9A3C'), rmse: RM.leaf });
  gbBlade.add(leaf, { matrix: mat([-0.02, 0.86, 0.01], [0, 0.6, -0.5], 0.8), color: rgb('#7FA84A'), rmse: RM.leaf });
}

function fishboneBlade(gbBlade, gbHilt) {
  const bone = rgb('#EFE8D8'), boneD = rgb('#CFC5AE');
  gbBlade.add(new THREE.CylinderGeometry(0.008, 0.012, 0.78, 8), { matrix: mat([0, 0.39, 0]), color: bone, rmse: RM.bone });
  for (let i = 0; i < 9; i++) {
    const y = 0.08 + i * 0.075, l = 0.07 * (1 - i / 12);
    for (const s of [1, -1]) gbBlade.add(new THREE.ConeGeometry(0.006, l, 6), { matrix: mat([s * l * 0.45, y, 0], [0, 0, s * -1.25]), color: boneD, rmse: RM.bone });
  }
  // tail fin at the tip
  const fin = new THREE.ConeGeometry(0.045, 0.07, 3).scale(1, 1, 0.25);
  gbBlade.add(fin, { matrix: mat([0, 0.83, 0], [0, 0, Math.PI]), color: bone, rmse: RM.bone });
  // fish skull as the guard
  gbHilt.add(new THREE.SphereGeometry(0.05, 14, 10).scale(1.1, 0.75, 0.5), { matrix: mat([0, 0.005, 0]), color: bone, rmse: RM.bone });
  gbHilt.add(new THREE.SphereGeometry(0.01, 8, 6), { matrix: mat([0.03, 0.012, 0.022]), color: rgb('#2A2624'), rmse: RM.nose });
  gbHilt.add(new THREE.CylinderGeometry(0.014, 0.016, SWORD.gripLen, 10), { matrix: mat([0, SWORD.gripY, 0]), color: rgb('#B8A98A'), rmse: RM.cloth });
  gbHilt.add(new THREE.SphereGeometry(0.022, 10, 8), { matrix: mat([0, SWORD.pommelY + 0.005, 0]), color: bone, rmse: RM.bone });
}

function baguetteBlade(gbBlade, gbHilt) {
  const crust = rgb('#C98B45'), dark = rgb('#9C5F2A'), light = rgb('#E8C27E');
  const g = new THREE.CapsuleGeometry(0.036, 0.78, 8, 14).scale(1, 1, 0.85);
  gbBlade.add(g, {
    matrix: mat([0, 0.43, 0]),
    color: (v, n) => {
      const score = smoothstep(0.82, 0.95, Math.sin((v.y - v.x * 1.4) * 38)) * smoothstep(0, 0.5, n.z);
      return mixRgb(mixRgb(crust, dark, Math.max(0, -n.z) * 0.3), light, score);
    },
    rmse: RM.bread,
  });
  gbHilt.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), { matrix: mat([0, 0.005, 0]), color: rgb('#E9E2D2'), rmse: RM.cloth });
  gbHilt.add(new THREE.CylinderGeometry(0.016, 0.018, SWORD.gripLen, 10), { matrix: mat([0, SWORD.gripY, 0]), color: rgb('#D9CCB0'), rmse: RM.cloth });
  gbHilt.add(new THREE.SphereGeometry(0.024, 10, 8), { matrix: mat([0, SWORD.pommelY + 0.004, 0]), color: crust, rmse: RM.bread });
}

/**
 * Build a sword.
 * @param {string} [skin] one of SWORD_SKINS ('diamond' / 'toobig' need `o.model`, a loaded + fitted Object3D)
 * @param {{ model?: THREE.Object3D, modelLength?: number, flip?: boolean, dragTip?: boolean }} [o]
 * @returns {{ group: THREE.Group, blade: THREE.Mesh, bladeMat: THREE.Material, hilt: THREE.Mesh, streak: THREE.Mesh,
 *   tip: THREE.Object3D, mid: THREE.Object3D, grip: THREE.Object3D, pommel: THREE.Object3D, length: number, skin: string,
 *   setCharge(c:number):void, setValorGlow(v:number):void, dispose():void }}
 */
export function buildSword(skin = 'borrowed', o = {}) {
  const group = new THREE.Group(); group.name = 'sword:' + skin;
  const gbBlade = new GeoBuilder(), gbHilt = new GeoBuilder();
  let kind = 'metal', length = 1.0, baseGlow = 0, modelTop = null;
  switch (skin) {
    case 'twig': twigBlade(gbBlade, gbHilt); kind = 'wood'; break;
    case 'fishbone': fishboneBlade(gbBlade, gbHilt); kind = 'bone'; break;
    case 'baguette': baguetteBlade(gbBlade, gbHilt); kind = 'bread'; break;
    case 'dawnblade': borrowedBlade(gbBlade, gbHilt, { brass: '#F0CF7A' }); baseGlow = 1.1; break;
    case 'diamond': case 'toobig': if (!o.model) borrowedBlade(gbBlade, gbHilt); break;
    default: borrowedBlade(gbBlade, gbHilt);
  }
  const bladeMat = bladeMaterial(kind);
  const blade = new THREE.Mesh(gbBlade.empty ? new THREE.BufferGeometry() : gbBlade.build(), bladeMat);
  blade.name = 'blade'; blade.castShadow = true; blade.visible = !gbBlade.empty;
  const hiltMesh = new THREE.Mesh(gbHilt.empty ? new THREE.BufferGeometry() : gbHilt.build(), kitMaterial());
  hiltMesh.name = 'hilt'; hiltMesh.castShadow = true; hiltMesh.visible = !gbHilt.empty;
  group.add(blade, hiltMesh);
  if (o.model) {
    const m = mountModel(o.model, { length: o.modelLength ?? (skin === 'toobig' ? 1.6 : 1.0), flip: o.flip ?? 'auto' });
    if (skin === 'toobig') restyleClaymore(m);
    group.add(m); length = o.modelLength ?? (skin === 'toobig' ? 1.6 : 1.0);
    modelTop = m.userData.top - 0.01;
  }
  const streak = makeStreak(Math.max(1.0, length * 0.95));
  group.add(streak);
  const sparkles = skin === 'dawnblade' ? makeBladeSparkles(SWORD.blade) : null;
  if (sparkles) group.add(sparkles);
  const top = modelTop ?? length - 0.15 + (skin === 'twig' ? 0.02 : 0);
  const tip = new THREE.Object3D(); tip.name = 'swordTip'; tip.position.set(0, top, 0);
  const mid = new THREE.Object3D(); mid.name = 'swordMid'; mid.position.set(0, top * 0.5, 0);
  const grip = new THREE.Object3D(); grip.name = 'swordGrip'; grip.position.set(0, SWORD.gripY, 0);
  const pommel = new THREE.Object3D(); pommel.name = 'swordPommel'; pommel.position.set(0, SWORD.pommelY, 0);
  group.add(tip, mid, grip, pommel);
  let charge = 0, valor = 0;
  const apply = () => {
    bladeMat.emissiveIntensity = Math.max(baseGlow, valor * 0.6, STREAK.bladeGlow * easeIn(charge));
    streak.material.uniforms.uI.value = Math.max(charge, baseGlow > 0 ? 0.25 : 0);
    streak.visible = streak.material.uniforms.uI.value > 0.01;
  };
  apply();
  return {
    group, blade, bladeMat, hilt: hiltMesh, streak, sparkles, tip, mid, grip, pommel, length, skin,
    /** Holy charge 0..1 (art.md §4.3 ramp: emissive 0 → 4, streak). */
    setCharge(c) { charge = Math.max(0, Math.min(1, c)); apply(); },
    /** Valor glow 0..1 (GAME_DESIGN §7.4: emissive 0 → 0.6). */
    setValorGlow(v) { valor = Math.max(0, Math.min(1, v)); apply(); },
    dispose() { blade.geometry.dispose(); hiltMesh.geometry.dispose(); streak.geometry.dispose(); sparkles?.geometry.dispose(); bladeMat.dispose(); },
  };
}

/**
 * True when a sword model (long axis already +Y) has its crossguard in the upper half, i.e. the tip points down.
 * The guard is the widest cross-section and always sits near the grip end.
 */
export function guardInUpperHalf(obj) { return guardHeight(obj).frac >= 0.5; }

/**
 * Height of the crossguard (widest cross-section) of a sword model whose long axis is +Y, in the parent's space.
 * @returns {{ y: number, frac: number, min: number, max: number }}
 */
export function guardHeight(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), y0 = box.min.y, h = Math.max(1e-6, box.max.y - box.min.y);
  const bins = new Float32Array(24), v = new THREE.Vector3();
  obj.traverse((c) => {
    if (!c.isMesh || !c.geometry?.attributes?.position) return;
    const p = c.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(c.matrixWorld);
      const b = Math.min(23, Math.max(0, Math.floor(((v.y - y0) / h) * 24)));
      bins[b] = Math.max(bins[b], Math.hypot(v.x - (box.max.x + box.min.x) / 2, v.z - (box.max.z + box.min.z) / 2));
    }
  });
  let best = 0; for (let i = 1; i < 24; i++) if (bins[i] > bins[best]) best = i;
  const frac = (best + 0.5) / 24;
  return { y: y0 + frac * h, frac, min: box.min.y, max: box.max.y };
}

/**
 * "Even More Too Big" is Sir Brutus's claymore in her paws: the Quaternius model's red-lacquered parts become polished
 * steel and the dark steel a touch lighter, so it reads as a (comically huge) knight's sword, not Barkus's cleaver.
 * Materials are cloned and tagged `userData.assetOwned` (core disposeInstance frees them; shared GLTF data untouched).
 */
export function restyleClaymore(obj) {
  const map = new Map();
  obj.traverse((c) => {
    if (!c.isMesh) return;
    const swap = (m) => {
      if (map.has(m)) return map.get(m);
      const n = m.clone(); n.userData.assetOwned = true;
      if (/red/i.test(m.name)) { n.color?.set(PAL.blade); n.metalness = 0.95; n.roughness = 0.22; }
      else if (/steel/i.test(m.name)) { n.color?.set(PAL.steelDark); n.metalness = 0.8; n.roughness = 0.35; }
      map.set(m, n); return n;
    };
    c.material = Array.isArray(c.material) ? c.material.map(swap) : swap(c.material);
  });
  return obj;
}

/** Align a GLB sword (Sword_Diamond, Claymore) to sword space: long axis → +Y, grip end at the pommel. */
export function mountModel(model, { length = 1.0, flip = 'auto' } = {}) {
  const holder = new THREE.Group(); holder.name = 'swordModel';
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.z >= size.y ? 'z' : 'y';
  const inner = new THREE.Group(); inner.add(model);
  if (axis === 'x') inner.rotation.z = Math.PI / 2; else if (axis === 'z') inner.rotation.x = -Math.PI / 2;
  holder.add(inner); holder.updateMatrixWorld(true);
  if (flip === 'auto') flip = guardHeight(holder).frac >= 0.5;
  if (flip) { inner.rotation.z += Math.PI; holder.updateMatrixWorld(true); }
  const b2 = new THREE.Box3().setFromObject(inner);
  const s = length / Math.max(1e-6, b2.max.y - b2.min.y);
  inner.scale.multiplyScalar(s); holder.updateMatrixWorld(true);
  const b3 = new THREE.Box3().setFromObject(inner);
  // the model's own crossguard goes on the sword origin (her paws grip just below it, like the Borrowed Blade);
  // a guard that would leave less than the Borrowed Blade's grip below it falls back to pommel alignment
  const gd = guardHeight(holder);
  const dy = gd.y - b3.min.y >= -SWORD.pommelY * 0.8 && gd.frac < 0.5 ? -gd.y : SWORD.pommelY - b3.min.y;
  inner.position.y += dy;
  inner.position.x -= (b3.max.x + b3.min.x) / 2; inner.position.z -= (b3.max.z + b3.min.z) / 2;
  holder.updateMatrixWorld(true);
  holder.userData.top = b3.max.y + dy;
  model.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return holder;
}
