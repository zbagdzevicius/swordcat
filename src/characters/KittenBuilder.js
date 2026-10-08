// buildKitten(cfg): the ONE procedural cat builder (GAME_DESIGN §1.1 rule 1, §3, §18.3; research/art.md §2–§7).
// Every cat (Swordcat, companions, family, court, villagers, lost kittens) comes from here.
//
// Returns { root, rig, setPose, setHoly, setExpression, ... }:
//   root  THREE.Group, origin at the feet, facing +Z, 1 unit = H (scale via cfg.scale)
//   rig   named joints the player / companion animators drive (THREE.Bone instances):
//         body (squash pivot at the feet), hips, chest, head, mouth, earL, earR, eyeL, eyeR,
//         shoulderL/elbowL/pawL, shoulderR/elbowR/pawR (= swordHand), thighL/kneeL/footL, thighR/kneeR/footR,
//         tail[0..5], plus swordSocket, capeAnchor, bowAnchor; aliases armL/armR/legL/legR.
//   Per frame: kitten.update(dt, opts)  (= animate() then simulate()). Animators that add their own joint offsets
//   call kitten.animate(dt, opts) → write joint offsets → kitten.simulate(dt, opts) (cape, fur drag, matrices).
//
// Tiers: 'hero' (16 fur shells, verlet cape, full face), 'kitten' (10 shells), 'npc' (sheen), 'lite'
// (everything in ONE skinned mesh, vertex-coloured eyes: villagers, hub residents, riders, spoon brigade).
import * as THREE from 'three';
import { PAL } from './palette.js';
import { GeoBuilder, mat, rgb, mixRgb, smoothstep, clamp, Spring, damp, roundedCone, hashString, mulberry32 } from './util.js';
import { makeKitMaterial, kitMaterial, RM, own, tuftMaterial, blobMaterial, blobGeometry, HOLY_COLOR } from './materials.js';
import { FACE, coatColor, headFurMask, makeFurMaterial, FurPart, shellsFor, MAX_SHELLS, FUR_WIND, tickFurTime, FUR_RENDER_ORDER } from './Fur.js';
import { EyePair, EXPRESSIONS, eyePivotMatrix, ringGeometry } from './Eyes.js';
import { buildBow } from './Bow.js';
import { HeroCape, buildSwayCape, capeMaterial, CAPE_TIME } from './Cape.js';
import { buildSword } from './Sword.js';
import { addPlateArmour, addGauntlet } from './Armour.js';
import { ACCESSORIES } from './Accessories.js';
import { POSES, solveTwoBone, swordMatrix } from './Poses.js';
import { buildProp, PROP_MOUNTS } from './Props/ProcProps.js';
import { noteRender, envTick } from './runtime.js';

// ------------------------------------------------------------------ skeleton definition

export const BONE_NAMES = Object.freeze(['body', 'hips', 'chest', 'head', 'mouth', 'earL', 'earR', 'eyeL', 'eyeR',
  'shoulderL', 'elbowL', 'pawL', 'shoulderR', 'elbowR', 'pawR', 'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR',
  'tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5']);
const PARENT = { body: null, hips: 'body', chest: 'hips', head: 'chest', mouth: 'head', earL: 'head', earR: 'head', eyeL: 'head', eyeR: 'head',
  shoulderL: 'chest', elbowL: 'shoulderL', pawL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR', pawR: 'elbowR',
  thighL: 'hips', kneeL: 'thighL', footL: 'kneeL', thighR: 'hips', kneeR: 'thighR', footR: 'kneeR',
  tail0: 'hips', tail1: 'tail0', tail2: 'tail1', tail3: 'tail2', tail4: 'tail3', tail5: 'tail4' };
export const ARM = Object.freeze({ upper: 0.115, fore: 0.11, pawCentre: [0, -0.038, 0.004] });
/** Rest tail curve (art.md §2.4), in root space. */
export const TAIL_CURVE = [[0, 0.2, -0.13], [0.05, 0.1, -0.28], [0.18, 0.05, -0.36], [0.32, 0.06, -0.30]];

const E = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

/** Rest (local) transforms for a kitten of width w. */
function restPose(w, earsLow = 0) {
  const P = {
    body: [0, 0, 0], hips: [0, 0.30, 0], chest: [0, 0.10, 0], head: [0, 0.22, 0], mouth: [...FACE.mouth],
    earL: [0.128, 0.246, -0.012], earR: [-0.128, 0.246, -0.012], eyeL: [...FACE.eyeL], eyeR: [...FACE.eyeR],
    shoulderL: [0.135 * w, 0.15, 0.0], elbowL: [0, -ARM.upper, 0], pawL: [0, -ARM.fore, 0],
    shoulderR: [-0.135 * w, 0.15, 0.0], elbowR: [0, -ARM.upper, 0], pawR: [0, -ARM.fore, 0],
    thighL: [0.085 * w, -0.06, 0], kneeL: [0, -0.10, 0], footL: [0, -0.11, 0],
    thighR: [-0.085 * w, -0.06, 0], kneeR: [0, -0.10, 0], footR: [0, -0.11, 0],
  };
  const R = {
    earL: [-0.1, -0.08, -0.52 - earsLow * 0.6], earR: [-0.1, 0.08, 0.52 + earsLow * 0.6],
    shoulderL: [0, 0, 0.12], shoulderR: [0, 0, -0.12],
  };
  // tail joints along the rest curve
  const curve = new THREE.CatmullRomCurve3(TAIL_CURVE.map((p) => new THREE.Vector3(...p)));
  let prev = new THREE.Vector3(0, 0.30, 0);
  for (let i = 0; i < 6; i++) {
    const pt = curve.getPointAt(i / 5);
    P['tail' + i] = [pt.x - prev.x, pt.y - prev.y, pt.z - prev.z];
    prev = pt;
  }
  return { P, R, curve };
}

// ------------------------------------------------------------------ main builder

/**
 * Build a kitten.
 * @param {object} cfg see configs.js (id, tier, scale, width, headScale, coat, eyes, fur, ears, bow, outfit, accessories, cape, sword, expression)
 * @returns {Kitten}
 */
export function buildKitten(cfg = {}) {
  return new Kitten(cfg);
}

export class Kitten {
  constructor(cfg) {
    this.cfg = cfg;
    const tier = cfg.tier || 'kitten';
    this.tier = tier;
    this.lite = tier === 'lite';
    const w = cfg.width ?? 1;
    this.w = w;
    const root = new THREE.Group();
    root.name = 'kitten:' + (cfg.id || 'anon');
    root.scale.setScalar(cfg.scale ?? 1);
    this.root = root;
    this.coat = cfg.coat || { pattern: 'mackerel', base: PAL.furGinger, deep: PAL.furGingerDeep, light: PAL.furGingerLight, cream: PAL.furCream };

    // ---- accessories pre-pass (flags like earsLow need to be known before the rest pose)
    const flags = {};
    const acc = (cfg.accessories || []).map((a) => (typeof a === 'string' ? { id: a } : a));
    const earsLowHint = acc.some((a) => ['potHelm', 'plumedHelm', 'bucketHelm', 'jesterHat', 'bakerHat'].includes(a.id)) ? 0.9
      : acc.some((a) => ['wizardHat', 'strawHat', 'nightcap', 'sergeantCap'].includes(a.id)) ? 0.6
        : acc.some((a) => ['coif'].includes(a.id)) ? 0.5 : acc.some((a) => a.id === 'hood') ? 0.35 : 0;

    // ---- skeleton
    const { P, R, curve } = restPose(w, earsLowHint);
    this.tailCurve = curve;
    const joints = {}, bones = [];
    for (const n of BONE_NAMES) {
      const b = new THREE.Bone(); b.name = n;
      b.position.fromArray(P[n]);
      if (R[n]) b.quaternion.copy(E(...R[n]));
      joints[n] = b; bones.push(b);
    }
    for (const n of BONE_NAMES) (PARENT[n] ? joints[PARENT[n]] : root).add(joints[n]);
    if (cfg.headScale) joints.head.scale.setScalar(cfg.headScale);
    const bodyScale = cfg.bodyScale ?? 1;
    if (bodyScale !== 1) joints.hips.scale.set(bodyScale, bodyScale, bodyScale);
    const saveScale = root.scale.clone(); root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);
    const bind = {}; const boneIndex = {};
    BONE_NAMES.forEach((n, i) => { bind[n] = joints[n].matrixWorld.clone(); boneIndex[n] = i; });
    this.rest = {};
    for (const n of BONE_NAMES) this.rest[n] = { p: joints[n].position.clone(), q: joints[n].quaternion.clone(), s: joints[n].scale.clone() };

    const rig = {
      root, joints, bones,
      ...joints,
      tail: [0, 1, 2, 3, 4, 5].map((i) => joints['tail' + i]),
      armL: joints.shoulderL, armR: joints.shoulderR, legL: joints.thighL, legR: joints.thighR,
      swordHand: joints.pawR, chestBind: bind.chest.clone(),
    };
    rig.swordSocket = new THREE.Object3D(); rig.swordSocket.name = 'swordSocket'; joints.pawR.add(rig.swordSocket);
    rig.capeAnchor = new THREE.Object3D(); rig.capeAnchor.name = 'capeAnchor'; rig.capeAnchor.position.set(0, 0.2, -0.12); joints.chest.add(rig.capeAnchor);
    this.rig = rig;
    this.bind = bind;

    // ---- materials
    const holyCapable = tier === 'hero' || cfg.holy;
    this.kitMat = holyCapable ? makeKitMaterial() : kitMaterial();
    const furTier = tier === 'hero' ? 'hero' : tier === 'kitten' ? 'kitten' : 'npc';
    this.furTier = furTier;
    this.furMat = null; this.furMatBaked = null;
    if (!this.lite) {
      const fo = { len: cfg.fur?.len ?? 0.045, tiling: cfg.fur?.tiling ?? 4.8, rim: cfg.fur?.rim ?? 0.3, tipTint: this.coat.light || this.coat.base, density: cfg.fur?.density ?? 1.25 };
      this.furMat = makeFurMaterial(fo);
      this.furMatBaked = makeFurMaterial({ ...fo, baked: true });
    }

    // ---- assembly context
    const kit = new GeoBuilder({ skinned: true });
    const tufts = new GeoBuilder({ skinned: true });
    const updaters = [];
    const A = {
      cfg, w, flags, lite: this.lite,
      /** Segment count scaled down for the lite tier (villagers, old knights, riders). */
      seg: (n) => (this.lite ? Math.max(5, Math.round(n * 0.55)) : n),
      add: (bone, geo, o = {}) => {
        const m = o.m ? _m.multiplyMatrices(bind[bone], o.m) : bind[bone];
        kit.add(geo, { matrix: m.clone(), color: o.color, rmse: o.rmse, bone: boneIndex[bone], keepColors: o.keepColors });
      },
      attach: (bone, obj) => { joints[bone].add(obj); if (obj.userData.update) updaters.push(obj.userData.update); },
      attachRoot: (obj) => { root.add(obj); if (obj.userData.update) updaters.push(obj.userData.update); },
    };
    this.A = A;
    this.updaters = updaters;

    const coat = this.coat;
    const coatAt = (region, o) => (v, n, lp) => coatColor(coat, region, lp, o);
    const coatRoot = (region, o) => (v) => coatColor(coat, region, v, o);

    // ---- head fur surfaces (head space)
    const eyeScale = cfg.eyes?.size ?? 1;
    const headPieces = this._headFurPieces(cfg);
    if (this.lite) {
      for (const hp of headPieces) A.add('head', hp.geo, { color: coatAt(hp.region), rmse: RM.fur });
    } else {
      const gb = new GeoBuilder({ fur: true });
      const combFor = (region) => (v, n, lp) => (region === 'cheek' ? [Math.sign(lp.x) * 0.55, -0.85, -0.25]
        : region === 'muzzle' ? [Math.sign(lp.x) * 0.9, -0.35, 0.1] : [lp.x * 2.0, -0.45, -1]);
      for (const hp of headPieces) gb.add(hp.geo, { color: coatAt(hp.region), rmse: RM.fur, fur: (v, n, lp) => headFurMask(lp, hp.region, eyeScale), comb: combFor(hp.region) });
      this.headFur = new FurPart(gb.build(), { furMat: this.furMat, sheenMat: this.kitMat, tier: furTier, name: 'furHead' });
      joints.head.add(this.headFur.mesh);
    }

    // ---- face details (kit, head bone)
    const nose = rgb(cfg.nose ?? PAL.nose);
    A.add('head', new THREE.SphereGeometry(0.0175, 16, 12).scale(1.35, 0.8, 0.75), { m: mat([FACE.nose[0], FACE.nose[1] + 0.002, Math.max(this._padZ(0, FACE.nose[1]), this._eyeZ(0, FACE.nose[1], 1) + 0.012) + 0.007]), color: nose, rmse: RM.nose });
    {
      // mouth "ω" + philtrum, projected onto the whisker pads
      const my = FACE.mouth[1];
      const mouthPts = [[-0.026, my - 0.001], [-0.013, my - 0.008], [0, my], [0.013, my - 0.008], [0.026, my - 0.001]].map(([x, y]) => new THREE.Vector3(x, y, this._padZ(x, y) + 0.004));
      const mc = rgb(PAL.mouth);
      A.add('head', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPts), 20, 0.0034, 5, false), { color: mc, rmse: RM.mouth });
      const ph = [new THREE.Vector3(0, FACE.nose[1] - 0.008, this._padZ(0, FACE.nose[1] - 0.008) + 0.006), new THREE.Vector3(0, my, this._padZ(0, my) + 0.004)];
      A.add('head', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ph), 4, 0.0028, 5, false), { color: mc, rmse: RM.mouth });
    }
    // open-mouth oval (meow): on the mouth bone, closed via bone scale
    A.add('mouth', new THREE.SphereGeometry(0.02, 14, 10).scale(1.15, 1, 0.5), { m: mat([0, -0.012, -0.004]), color: rgb('#6B2F35'), rmse: RM.mouth });
    A.add('mouth', new THREE.SphereGeometry(0.011, 10, 8).scale(1.2, 0.6, 0.6), { m: mat([0, -0.02, 0.002]), color: rgb('#E58A93'), rmse: RM.mouth });

    // ---- eyes
    const eyeCfg = cfg.eyes || {};
    const eyeR = 0.045 * eyeScale;
    const eyeColors = eyeCfg.L || eyeCfg.R ? { L: { ...eyeCfg, ...(eyeCfg.L || {}) }, R: { ...eyeCfg, ...(eyeCfg.R || {}) } } : eyeCfg;
    const posL = [FACE.eyeL[0] * (0.97 + 0.03 * eyeScale), FACE.eyeL[1], this._eyeZ(FACE.eyeL[0], FACE.eyeL[1], eyeScale)];
    const posR = [-posL[0], posL[1], posL[2]];
    if (this.lite) {
      this._liteEyes(A, posL, posR, eyeR, eyeColors);
    } else {
      const lidC = coatColor(coat, 'head', new THREE.Vector3(FACE.eyeL[0], FACE.eyeL[1] + 0.07, FACE.eyeL[2] - 0.02));
      const lidMat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(lidC[0], lidC[1], lidC[2]).multiplyScalar(0.78), roughness: 0.95 }));
      this.eyes = new EyePair({ r: eyeR, posL, posR, yaw: 0.3, colors: eyeColors, lidMat, slit: eyeCfg.slit, lash: eyeCfg.lash ?? 1, seed: (cfg.id || 'kitten') + ':eyes' });
      joints.head.add(this.eyes.group);
      for (const [pos, side] of [[posL, 1], [posR, -1]]) A.add('head', ringGeometry(eyeR), { m: eyePivotMatrix(pos, side, 0.3), color: rgb(PAL.eyeLine), rmse: RM.eyeLine });
      if (flags.hideEye) { /* set after accessories */ }
    }

    // ---- ears (kit) + tufts
    const earS = (cfg.ears?.size ?? 1) * 1.22;
    for (const s of ['L', 'R']) {
      // art.md §2.2: tall rounded cones, flattened front-to-back, tilted out ~30°; pink inner ear faces forward
      const outer = roundedCone(0.07 * earS, 0.118 * earS, 20, 0.18, 0.84).scale(1, 1, 0.58);
      A.add('ear' + s, outer, { m: mat([0, -0.02, 0]), color: (v, n, lp) => mixRgb(coatColor(coat, 'ear', lp), rgb(coat.light || coat.base), smoothstep(0.02, 0.12, lp.y) * 0.25), rmse: RM.furShort });
      const inner = roundedCone(0.054 * earS, 0.094 * earS, 16, 0.18, 0.84).scale(1, 1, 0.36);
      A.add('ear' + s, inner, { m: mat([0, -0.01, 0.024]), color: (v, n, lp) => mixRgb(rgb(cfg.earInner ?? PAL.earInner), rgb(coat.cream || coat.base), smoothstep(0.03, 0.11, lp.y) * 0.4), rmse: RM.skin });
    }
    if (!this.lite && cfg.ears?.tufts !== false) this._tufts(tufts, bind, boneIndex, earS);

    // ---- bib, torso, limbs
    const armour = cfg.outfit?.armour || null;
    const clothed = !!(armour || cfg.outfit?.gown || acc.some((a) => ['tunic', 'tabard', 'gown', 'apron'].includes(a.id)));
    this._body(A, { armour, clothed, bind, boneIndex, coatRoot });

    // ---- tail
    this._tail(A, kit, bind, boneIndex);

    // ---- armour + accessories
    if (armour) addPlateArmour(A, { style: armour, pouch: cfg.outfit?.pouch !== false });
    for (const a of acc) {
      const fn = ACCESSORIES[a.id];
      if (fn) fn(A, a);
    }

    // ---- whiskers
    if (cfg.whiskers !== false) joints.head.add(this._whiskers(cfg.whiskers || {}));

    // ---- build the skinned kit mesh
    const skeleton = new THREE.Skeleton(bones);
    this.skeleton = skeleton;
    const kitGeo = kit.build();
    const kitMesh = new THREE.SkinnedMesh(kitGeo, this.kitMat);
    kitMesh.name = 'kitBody'; kitMesh.castShadow = true; kitMesh.receiveShadow = true; kitMesh.frustumCulled = false;
    root.add(kitMesh);
    kitMesh.bind(skeleton, new THREE.Matrix4());
    // report who draws characters: the character env map follows that scene's lights (runtime.envTick)
    kitMesh.onBeforeRender = noteRender;
    this.kitMesh = kitMesh;
    if (!tufts.empty) {
      const tm = new THREE.SkinnedMesh(tufts.build(), tuftMaterial());
      tm.name = 'tufts'; tm.castShadow = false; tm.frustumCulled = false; tm.renderOrder = FUR_RENDER_ORDER + 1;
      root.add(tm); tm.bind(skeleton, new THREE.Matrix4());
      this.tuftMesh = tm;
    }
    if (this.tailFurGeo) {
      this.tailFur = new FurPart(this.tailFurGeo, { bakedMat: this.furMatBaked, sheenMat: this.kitMat, tier: furTier, skeleton, name: 'furTail' });
      this.tailFur.mesh.renderOrder = FUR_RENDER_ORDER - 0.3;
      root.add(this.tailFur.mesh);
    }
    // shadow proxy for the shell-fur surfaces (shells don't cast): head, bib and tail as low-poly shapes
    if (!this.lite) {
      const sp = new GeoBuilder({ skinned: true });
      const head = new THREE.SphereGeometry(0.19, 14, 10).scale(1.22, 1.0, 1.0).translate(0, 0.16, 0);
      sp.add(head, { matrix: bind.head, bone: boneIndex.head });
      sp.add(new THREE.SphereGeometry(0.11, 10, 8).scale(1.05 * w, 0.8, 0.8).translate(0, 0.215, 0.05), { matrix: bind.chest, bone: boneIndex.chest });
      const tc = new THREE.TubeGeometry(this.tailCurve, 10, 0.07, 6, false), tpos = tc.attributes.position;
      const tT = new Float32Array(tpos.count); for (let i = 0; i < tpos.count; i++) tT[i] = Math.floor(i / 7) / 10;
      sp.add(tc, { skin: (v, lp, i) => { const s = Math.min(1, tT[i]) * 5, i0 = Math.min(4, Math.floor(s)), f = s - i0; return [boneIndex['tail' + i0], boneIndex['tail' + (i0 + 1)], 0, 0, 1 - f, f, 0, 0]; } });
      const proxy = new THREE.SkinnedMesh(sp.build(), shadowOnlyMaterial());
      proxy.name = 'shadowProxy'; proxy.castShadow = true; proxy.receiveShadow = false; proxy.frustumCulled = false;
      root.add(proxy); proxy.bind(skeleton, new THREE.Matrix4());
      this.shadowProxy = proxy;
    }

    // ---- bow (HARD RULE: left ear)
    this.bow = null;
    if (cfg.bow) {
      const bow = buildBow(cfg.bow);
      // target in head space (art.md §2.2: (+0.10, 0.955, 0.06) world → head-local (0.10, 0.335, 0.06))
      const headPos = new THREE.Vector3(...(cfg.bow.at || [0.115, 0.285, 0.08]));
      const toEar = _m2.copy(bind.earL).invert().multiply(bind.head);
      bow.position.copy(headPos.applyMatrix4(toEar));
      const earQ = new THREE.Quaternion(); bind.earL.decompose(_v, earQ, _v2);
      const headQ = new THREE.Quaternion(); bind.head.decompose(_v, headQ, _v2);
      bow.quaternion.copy(earQ.invert().multiply(headQ).multiply(E(0.25, -0.25, -(cfg.bow.tilt ?? 0.32))));
      if (cfg.bow.scale2) bow.scale.setScalar(cfg.bow.scale2);
      joints.earL.add(bow);
      this.bow = bow; rig.bowAnchor = bow;
      updaters.push(bow.userData.update);
    }

    // ---- sword
    this.sword = null;
    if (cfg.sword) this.setSword(cfg.sword);

    // ---- cape
    this.cape = null; this.swayCape = null;
    if (cfg.cape) this.setCape(cfg.cape.style ?? cfg.cape, cfg.cape.sim);

    // ---- eyes hidden by an eyepatch
    if (flags.hideEye && this.eyes) { const e = this.eyes.eyes.find((x) => x.side === flags.hideEye); if (e) e.pivot.visible = false; }

    // ---- aura hull (holy) + blob shadow
    if (holyCapable) this._aura();
    if (cfg.blob !== false) {
      const blob = new THREE.Mesh(blobGeometry(), blobMaterial());
      blob.position.y = 0.004; blob.scale.setScalar(0.62 * w); blob.renderOrder = -1; blob.name = 'blob';
      root.add(blob); this.blob = blob;
    }

    root.scale.copy(saveScale);

    // ---- runtime state
    this.props = {};
    // visual-only randomness, seeded per cat id (deterministic screenshots; never Math.random)
    this.rnd = mulberry32(hashString((cfg.id || 'kitten') + ':life'));
    this.time = this.rnd() * 10;
    this.holy = 0;
    this.expr = cfg.expression || 'neutral';
    this.emotes = { earsFlat: 0, tailPuff: 0, nod: 0, shake: 0, meow: 0, sneeze: 0 };
    this.earTwitch = { L: 0, R: 0, next: 2 + this.rnd() * 4 };
    this.springs = { head: new Spring(90, 12), tail: new Spring(40, 6) };
    this.idleLife = true;
    this._snapshots = new Map();
    this._from = null; this._to = null; this._blendT = 1; this._blendDur = 0.25;
    this.poseName = null;
    this.drag = new THREE.Vector3();
    this.setExpression(this.expr, true);
    this.setPose(cfg.pose || 'idle', { blend: 0 });
    for (const pr of cfg.props || []) this.setProp(pr, true);
    this.animate(0);
    this.root.updateMatrixWorld(true);
    root.userData.kitten = this;
  }

  // ------------------------------------------------------------------ geometry helpers

  /** z of the whisker pads' front surface at (x, y) in head space. */
  _padZ(x, y) {
    let best = 0.13;
    for (const s of [1, -1]) {
      const dx = x - s * FACE.pad[0], dy = y - FACE.pad[1], r = 0.042;
      const q = r * r - dx * dx - dy * dy;
      if (q > 0) best = Math.max(best, FACE.pad[2] + Math.sqrt(q));
    }
    return best;
  }
  /** Eye centre z so the eye's equator sits at the skull surface (eyes protrude like the refs). */
  _eyeZ(x, y, scale) {
    const sx = x / FACE.skullScale[0], sy = (y - FACE.skull[1]) / FACE.skullScale[1], r = FACE.skullR;
    const z = Math.sqrt(Math.max(0, r * r - sx * sx - sy * sy));
    return z - 0.012 + 0.006 * (scale - 1);
  }

  /** Skull, cheek ruffs, whisker pads and chin (art.md §2.2), in head space. */
  _headFurPieces(cfg) {
    const out = [];
    const seg = this.lite ? [28, 20] : [46, 34];
    const skull = new THREE.SphereGeometry(FACE.skullR, seg[0], seg[1]).scale(...FACE.skullScale).translate(...FACE.skull);
    out.push({ geo: skull, region: 'head' });
    const cheekR = FACE.cheekR * (cfg.fur?.cheek ?? 1);
    for (const s of [1, -1]) out.push({ geo: new THREE.SphereGeometry(cheekR, this.lite ? 14 : 26, this.lite ? 10 : 18).translate(s * FACE.cheek[0], FACE.cheek[1], FACE.cheek[2]), region: 'cheek' });
    for (const s of [1, -1]) out.push({ geo: new THREE.SphereGeometry(0.042, this.lite ? 10 : 18, this.lite ? 8 : 12).translate(s * FACE.pad[0], FACE.pad[1], FACE.pad[2]), region: 'muzzle' });
    out.push({ geo: new THREE.SphereGeometry(0.034, 14, 10).translate(...FACE.chin), region: 'muzzle' });
    return out;
  }

  /** Vertex-coloured eyes for the lite tier, skinned to eyeL / eyeR (blink = bone scale). */
  _liteEyes(A, posL, posR, r, colors) {
    for (const [pos, side, bone] of [[posL, 1, 'eyeL'], [posR, -1, 'eyeR']]) {
      const c = side > 0 ? (colors.L || colors) : (colors.R || colors);
      const inner = rgb(c.inner ?? PAL.irisInner), outer = rgb(c.outer ?? PAL.irisOuter), ring = rgb(c.ring ?? PAL.irisRing), pupil = rgb(c.pupil ?? PAL.pupil);
      const g = new THREE.SphereGeometry(r, 24, 18);
      const pm = eyePivotMatrix([0, 0, 0], side, 0.3);
      const toBone = new THREE.Matrix4().makeTranslation(pos[0] - FACE[bone][0], pos[1] - FACE[bone][1], pos[2] - FACE[bone][2]).multiply(pm).multiply(mat([0, 0, 0], [0, 0, 0], [1, 1, 0.55]));
      this.A.add(bone, g, {
        m: toBone,
        color: (v, n, lp) => {
          const x = lp.x / r, y = lp.y / r;
          if (lp.z < 0) return ring;
          const d = Math.hypot(x, y + 0.05);
          if (Math.hypot(x + 0.33, y - 0.36) < 0.24) return [1, 1, 1];
          if (d < 0.5) return pupil;
          if (d < 0.92) return mixRgb(inner, outer, smoothstep(0.5, 0.92, d));
          return ring;
        },
        rmse: RM.eye,
      });
    }
  }

  /** Ear tufts, cheek wisps, crown and bib fluff, tail-tip wisp (art.md §3.4). */
  _tufts(gb, bind, idx, earS) {
    const root = rgb(this.coat.cream ?? PAL.tuftRoot), tip = rgb(this.cfg.tuftTip ?? PAL.tuftTip);
    const baseC = rgb(this.coat.base);
    const rnd = mulberry32(hashString(this.cfg.id || 'kitten'));
    // cards face mostly forward (+Z, where the camera usually is) with a random twist, so they read broad-side
    const card = (bone, at, dir, len, wid, color0 = root, color1 = tip, twist = 0.6) => {
      const g = new THREE.PlaneGeometry(wid, len, 1, 3).translate(0, len / 2, 0);
      const up = new THREE.Vector3(...dir).normalize();
      const face = new THREE.Vector3((rnd() - 0.5) * twist, (rnd() - 0.5) * twist * 0.5, 1);
      const side = new THREE.Vector3().crossVectors(up, face);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const nrm = new THREE.Vector3().crossVectors(side, up).normalize();
      const m = new THREE.Matrix4().makeBasis(side, up, nrm).setPosition(at[0], at[1], at[2]);
      const pm = _m.multiplyMatrices(bind[bone], m).clone();
      gb.add(g, { matrix: pm, bone: idx[bone], color: (v, n, lp) => mixRgb(color0, color1, smoothstep(0, len, lp.y)), rmse: RM.fur });
    };
    // ears: long cream tufts from the inner ear (the ref2 signature)
    for (const [s, bone] of [[1, 'earL'], [-1, 'earR']]) {
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.01 * earS;
        card(bone, [x, 0.01 + rnd() * 0.02, 0.022], [x * 3.2 - s * 0.05, 1, 0.35 + rnd() * 0.25], (0.06 + rnd() * 0.035) * earS, 0.024);
      }
    }
    // cheek wisps: long fur sticking out sideways past the cheek ruff
    for (const s of [1, -1]) {
      for (let i = 0; i < 6; i++) {
        const a = -0.85 + i * 0.26 + (rnd() - 0.5) * 0.1; // angle down the cheek
        const dir = [s * Math.cos(a) * 1.0, Math.sin(a) * 0.9 - 0.15, 0.12 + rnd() * 0.25];
        const at = [s * (0.11 + 0.06 * Math.cos(a)), 0.08 + 0.06 * Math.sin(a), 0.045 + rnd() * 0.03];
        const col0 = mixRgb(baseC, root, 0.3 + 0.5 * (i / 6));
        card('head', at, dir, 0.08 + rnd() * 0.04, 0.05, col0, mixRgb(baseC, tip, 0.45));
      }
    }
    // crown fluff
    for (let i = 0; i < 2; i++) card('head', [(i - 0.5) * 0.05, 0.285, 0.0], [(i - 0.5) * 0.8, 1, -0.5], 0.045, 0.035, baseC, mixRgb(baseC, tip, 0.35));
    // bib fluff spilling over the breastplate / chest
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.03;
      card('chest', [x, 0.2 + rnd() * 0.02, 0.1 + Math.abs(x) * -0.2], [x * 2, -1, 0.7], 0.05 + rnd() * 0.02, 0.035);
    }
  }

  /** Torso, bib, arms, paws, legs, feet: fur where exposed, simple shapes under armour/clothes. */
  _body(A, { armour, clothed, bind, boneIndex, coatRoot }) {
    const w = this.w, lite = this.lite;
    // bib (chest space): the cream ruff between the pauldrons
    const bibGeo = new THREE.SphereGeometry(0.1, lite ? 16 : 28, lite ? 12 : 20).scale(1.05 * w, 0.75, 0.8).translate(0, 0.215, 0.045);
    const bodyGeo = new THREE.SphereGeometry(0.16, lite ? 20 : 36, lite ? 14 : 24).scale(1.0 * w, 1.25, 0.92).translate(0, 0.0, 0.0);
    const bellyColor = (v, n, lp) => coatColor(this.coat, 'body', _v.copy(lp).applyMatrix4(bind.chest));
    if (lite) {
      A.add('chest', bibGeo, { color: (v, n, lp) => coatColor(this.coat, 'bib', lp), rmse: RM.fur });
      if (!armour) A.add('chest', bodyGeo, { color: bellyColor, rmse: RM.fur });
    } else {
      const gb = new GeoBuilder({ fur: true });
      gb.add(bibGeo, { color: (v, n, lp) => coatColor(this.coat, 'bib', lp), rmse: RM.fur, fur: (v, n, lp) => [smoothstep(-0.02, 0.06, lp.z) * smoothstep(0.15, 0.2, lp.y), 0.8], comb: [0, -0.45, 0.85] });
      if (!armour && !clothed) gb.add(bodyGeo, { color: bellyColor, rmse: RM.fur, fur: [1, 0.9], comb: [0, -1, -0.3] });
      this.bibFur = new FurPart(gb.build(), { furMat: this.furMat, sheenMat: this.kitMat, tier: this.furTier, name: 'furBib' });
      this.bibFur.mesh.renderOrder = FUR_RENDER_ORDER - 0.4; // under the chin: draw before the head shells blend over it
      this.rig.chest.add(this.bibFur.mesh);
      if (!armour && clothed) A.add('chest', bodyGeo, { color: bellyColor, rmse: RM.fur });
    }
    // lower torso / belly on the hips
    A.add('hips', new THREE.SphereGeometry(0.15, 24, 16).scale(1.0 * w, 0.9, 0.95), { m: mat([0, 0.02, 0]), color: coatRoot('body'), rmse: RM.fur });
    // arms and paws
    for (const s of ['L', 'R']) {
      A.add('shoulder' + s, new THREE.CapsuleGeometry(0.045, 0.07, 4, 12), { m: mat([0, -0.055, 0]), color: coatRoot('leg'), rmse: RM.fur });
      A.add('elbow' + s, new THREE.CapsuleGeometry(0.042, 0.07, 4, 12), { m: mat([0, -0.05, 0]), color: coatRoot('leg'), rmse: RM.fur });
      if (!armour) {
        A.add('paw' + s, new THREE.SphereGeometry(0.047, 18, 14).scale(1, 0.85, 1.05), { m: mat([0, -0.035, 0.006]), color: coatRoot('paw'), rmse: RM.fur });
        for (let t = 0; t < 3; t++) A.add('paw' + s, new THREE.SphereGeometry(0.0085, 8, 6), { m: mat([(t - 1) * 0.017, -0.068, 0.03]), color: rgb('#E7A3A8'), rmse: RM.skin });
      }
    }
    // legs and feet
    for (const s of ['L', 'R']) {
      A.add('thigh' + s, new THREE.CapsuleGeometry(0.052, 0.05, 4, 12), { m: mat([0, -0.04, 0]), color: coatRoot('leg'), rmse: RM.fur });
      A.add('knee' + s, new THREE.CapsuleGeometry(0.045, 0.06, 4, 12), { m: mat([0, -0.05, 0]), color: coatRoot('leg'), rmse: RM.fur });
      if (!armour) {
        A.add('foot' + s, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.052, 0.05, 0.07), { m: mat([0, -0.03, 0.025]), color: coatRoot('paw'), rmse: RM.fur });
        A.add('foot' + s, new THREE.CircleGeometry(0.045, 16).rotateX(Math.PI / 2).scale(1, 1, 1.35), { m: mat([0, -0.0295, 0.025]), color: rgb('#C98A90'), rmse: RM.skin });
      }
    }
  }

  /** Tail: tapered tube along the rest curve (art.md §2.4), smooth-skinned to the 6 tail joints. */
  _tail(A, kit, bind, boneIndex) {
    const curve = this.tailCurve, tub = this.lite ? 20 : 30, rad = this.lite ? 8 : 12;
    const thick = this.cfg.tail?.thick ?? 1;
    const tg = new THREE.TubeGeometry(curve, tub, 1, rad, false);
    const pos = tg.attributes.position, c = new THREE.Vector3(), tmp = new THREE.Vector3();
    const tArr = new Float32Array(pos.count), under = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / (rad + 1)), t = ring / tub;
      const r = (0.04 + 0.027 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * thick;
      curve.getPointAt(t, c);
      tmp.fromBufferAttribute(pos, i).sub(c);
      under[i] = tmp.y;
      tmp.multiplyScalar(r).add(c);
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z); tArr[i] = t;
    }
    tg.computeVertexNormals();
    // tip cap
    const tipP = curve.getPointAt(1), tipR = 0.04 * thick * 0.95;
    const cap = new THREE.SphereGeometry(tipR, rad, 8).translate(tipP.x, tipP.y, tipP.z);
    const skinFor = (t) => {
      const s = clamp(t, 0, 1) * 5, i0 = Math.min(4, Math.floor(s)), f = s - i0;
      return [boneIndex['tail' + i0], boneIndex['tail' + (i0 + 1)], 0, 0, 1 - f, f, 0, 0];
    };
    // tail joints are rest-rotation-free and positioned on the curve; vertex data is in root space
    const colorT = (lp, t, u) => coatColor(this.coat, 'tail', lp, { t, under: u });
    if (this.lite) {
      kit.add(tg, { color: (v, n, lp, i) => colorT(lp, tArr[i], under[i]), rmse: RM.fur, skin: (v, lp, i) => skinFor(tArr[i]) });
      kit.add(cap, { color: (v, n, lp) => colorT(lp, 1, 0), rmse: RM.fur, skin: () => skinFor(1) });
    } else {
      const gb = new GeoBuilder({ skinned: true, fur: true });
      gb.add(tg, { color: (v, n, lp, i) => colorT(lp, tArr[i], under[i]), rmse: RM.fur, fur: (v, n, lp, i) => [1, 1.75 * (1 - 0.3 * tArr[i])], skin: (v, lp, i) => skinFor(tArr[i]), comb: [0.3, -0.6, -0.6] });
      gb.add(cap, { color: (v, n, lp) => colorT(lp, 1, 0), rmse: RM.fur, fur: [1, 1.3], skin: () => skinFor(1), comb: [0.6, 0, 0.2] });
      this.tailFurGeo = gb.build();
    }
  }

  /** LineSegments whiskers (art.md §2.2): 3 per side from the pads + 2 brow whiskers each side. */
  _whiskers(o) {
    const pts = [];
    const len = o.len ?? 0.2, droop = o.droop ?? 0.03;
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const y0 = FACE.pad[1] - i * 0.008, z0 = this._padZ(s * 0.04, y0) - 0.006;
        const dir = new THREE.Vector3(s * 1, 0.12 - i * 0.12, -0.12).normalize();
        let p = new THREE.Vector3(s * 0.045, y0, z0);
        for (let k = 0; k < 3; k++) {
          const q = p.clone().addScaledVector(dir, len / 3); q.y -= droop * (k + 1) / 3 * (k / 2);
          pts.push(p.x, p.y, p.z, q.x, q.y, q.z); p = q;
        }
      }
      {
        const p = new THREE.Vector3(s * 0.06, 0.215, 0.115);
        const q = p.clone().add(new THREE.Vector3(s * 0.045, 0.06, 0.015));
        pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = whiskerMaterial(o.color ?? PAL.whisker);
    const ls = new THREE.LineSegments(g, m); ls.name = 'whiskers'; ls.renderOrder = 2;
    return ls;
  }

  /** Holy aura hull (art.md §10.2): back-faced additive shells around head and torso; visible only when holy > 0. */
  _aura() {
    const m = auraMaterial();
    this.auraMat = m.clone(); own(this.auraMat);
    this.auraMat.uniforms.uColor = HOLY_COLOR;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 20).scale(1.2, 0.98, 1.0).translate(0, 0.15, 0.0), this.auraMat);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.16, 6, 20).scale(1.25 * this.w, 1, 0.9).translate(0, 0.0, 0), this.auraMat);
    head.name = body.name = 'aura';
    head.visible = body.visible = false; head.renderOrder = body.renderOrder = 4;
    head.castShadow = body.castShadow = false;
    this.rig.head.add(head); this.rig.chest.add(body);
    this.auraMeshes = [head, body];
  }

  // ------------------------------------------------------------------ poses

  /** Compute (and cache) the joint snapshot for a pose name. */
  poseSnapshot(name) {
    if (this._snapshots.has(name)) return this._snapshots.get(name);
    const P = POSES[name] || POSES.idle;
    const q = {}, p = {};
    for (const n of BONE_NAMES) { q[n] = this.rest[n].q.clone(); p[n] = this.rest[n].p.clone(); }
    if (P.body) {
      if (P.body.p) p.body.add(_v.fromArray(P.body.p));
      if (P.body.r) q.body.multiply(E(...P.body.r));
    }
    for (const [n, e] of Object.entries(P.joints || {})) if (q[n]) q[n].multiply(E(...e));
    if (P.tail) P.tail.forEach((e, i) => q['tail' + i].multiply(E(...e)));
    // root-space matrices along body → hips → chest
    const TR = (n) => new THREE.Matrix4().compose(p[n], q[n], this.rest[n].s);
    const Mbody = TR('body'), Mhips = Mbody.clone().multiply(TR('hips')), Mchest = Mhips.clone().multiply(TR('chest'));
    const chestInv = Mchest.clone().invert();
    const chestRot = new THREE.Quaternion(); Mchest.decompose(_v, chestRot, _v2);
    const chestRotInv = chestRot.clone().invert();
    const SW = swordMatrix(P.sword);
    const centreLocal = new THREE.Vector3(...ARM.pawCentre);
    for (const s of ['L', 'R']) {
      const arm = P.arms?.[s];
      const sh = 'shoulder' + s, el = 'elbow' + s, pw = 'paw' + s;
      if (!arm) continue;
      if (arm.fk) {
        if (arm.fk.shoulder) q[sh].multiply(E(...arm.fk.shoulder));
        if (arm.fk.elbow) q[el].multiply(E(...arm.fk.elbow));
        if (arm.fk.paw) q[pw].multiply(E(...arm.fk.paw));
        continue;
      }
      const target = new THREE.Vector3();
      if (arm.paw) target.fromArray(arm.paw);
      else if (SW && arm.grip !== undefined) target.set(0, arm.grip, 0).applyMatrix4(SW);
      if (arm.off) target.add(_v.fromArray(arm.off));
      const Tc = target.clone().applyMatrix4(chestInv);
      const pole = new THREE.Vector3(...(arm.pole || [s === 'L' ? 1 : -1, -0.3, -0.5])).applyQuaternion(chestRotInv);
      const qS = new THREE.Quaternion(), qE = new THREE.Quaternion(), qP = arm.twist ? E(...arm.twist) : new THREE.Quaternion();
      const S = p[sh].clone(), wrist = Tc.clone();
      for (let it = 0; it < 4; it++) {
        solveTwoBone(S, wrist, ARM.upper, ARM.fore, pole, qS, qE);
        const rot = qS.clone().multiply(qE).multiply(qP);
        wrist.copy(Tc).sub(_v.copy(centreLocal).applyQuaternion(rot));
      }
      q[sh].copy(qS); q[el].copy(qE); q[pw].copy(qP);
    }
    let sword = null;
    if (SW) {
      if (P.sword.mode === 'hand') {
        const Mhand = Mchest.clone().multiply(TR('shoulderR')).multiply(TR('elbowR')).multiply(TR('pawR'));
        const L = Mhand.invert().multiply(SW);
        const sp = new THREE.Vector3(), sq = new THREE.Quaternion(), ss = new THREE.Vector3();
        L.decompose(sp, sq, ss);
        sword = { mode: 'hand', p: sp, q: sq };
      } else {
        const sp = new THREE.Vector3(), sq = new THREE.Quaternion(), ss = new THREE.Vector3();
        SW.decompose(sp, sq, ss);
        sword = { mode: 'root', p: sp, q: sq };
      }
    } else sword = { mode: 'hidden' };
    const snap = { name, q, p, sword, expr: P.expr || 'neutral' };
    this._snapshots.set(name, snap);
    return snap;
  }

  /**
   * Blend to a pose ('vigil','oath','sip','selfie','faint','kneel','sit','sleep','idle' + extras 'ready','guard','cheer','hug','selfie_sit').
   * @param {string} name
   * @param {{blend?: number, expression?: boolean}} [o] blend seconds (0 = snap); expression: also apply the pose's default face
   */
  setPose(name, { blend = 0.25, expression = true } = {}) {
    const to = this.poseSnapshot(name);
    const from = { q: {}, p: {} };
    for (const n of BONE_NAMES) { from.q[n] = this.rig.joints[n].quaternion.clone(); from.p[n] = this.rig.joints[n].position.clone(); }
    if (this._to) { for (const n of BONE_NAMES) { from.q[n].copy(this._baseQ?.[n] ?? from.q[n]); from.p[n].copy(this._baseP?.[n] ?? from.p[n]); } }
    this._from = from; this._to = to; this._blendT = 0; this._blendDur = Math.max(0, blend);
    this.poseName = name;
    // sword parent switch: keep the current world placement, then blend toward the new local transform
    if (this.sword) this._swordPose(to.sword, blend);
    if (expression && to.expr) this.setExpression(to.expr);
    if (blend === 0) this._blendT = 1;
    return this;
  }

  _swordPose(spec, blend) {
    const g = this.sword.group;
    const parent = spec.mode === 'hand' ? this.rig.swordSocket : spec.mode === 'root' ? this.root : null;
    g.visible = !!parent;
    if (!parent) return;
    if (g.parent !== parent) {
      if (g.parent && blend > 0) {
        this.root.updateMatrixWorld(true);
        const world = g.matrixWorld.clone();
        parent.add(g);
        parent.updateMatrixWorld(true);
        _m.copy(parent.matrixWorld).invert().multiply(world).decompose(g.position, g.quaternion, _v);
      } else parent.add(g);
    }
    this._swordFrom = { p: g.position.clone(), q: g.quaternion.clone() };
    this._swordTo = spec;
    if (blend === 0) { g.position.copy(spec.p); g.quaternion.copy(spec.q); }
  }

  // ------------------------------------------------------------------ appearance controls

  /** Holy state 0..1 (ref1): fur gold rim, armour glow, aura hull, blade emissive + streak. */
  setHoly(v, { sword = true } = {}) {
    this.holy = clamp(v, 0, 1);
    if (this.furMat) { this.furMat.uniforms.uHoly.value = this.holy; this.furMatBaked.uniforms.uHoly.value = this.holy; }
    if (this.kitMat.userData.uniforms) this.kitMat.userData.uniforms.uHoly.value = this.holy * 0.7;
    if (this.auraMat) { this.auraMat.uniforms.uI.value = this.holy; for (const m of this.auraMeshes) m.visible = this.holy > 0.01; }
    if (sword && this.sword) this.sword.setCharge(this.holy);
    return this;
  }
  /** Face expression (Eyes.js EXPRESSIONS: neutral, worried, determined, happy, surprised, sad, glisten, sleepy, sleep, faint, grumpy, angry, smug). */
  setExpression(name, instant = false) {
    this.expr = name;
    if (this.eyes) this.eyes.setExpression(name, instant);
    const e = EXPRESSIONS[name] || EXPRESSIONS.neutral;
    this._liteLid = e.up;
    this._earMood = name === 'sad' || name === 'faint' ? -0.35 : name === 'angry' ? -0.25 : name === 'surprised' ? 0.15 : name === 'sleep' ? -0.15 : 0;
    return this;
  }
  /** Emotes (GAME_DESIGN §19.4): 'earsFlat' | 'tailPuff' | 'blink' | 'nod' | 'shake' | 'meow' | 'sneeze' | 'bowBounce'. */
  emote(name) {
    switch (name) {
      case 'earsFlat': this.emotes.earsFlat = 0.45; break;
      case 'tailPuff': this.emotes.tailPuff = 1.0; break;
      case 'blink': this.eyes?.blink(); this._liteBlink = 0.14; break;
      case 'nod': this.emotes.nod = 0.6; break;
      case 'shake': this.emotes.shake = 0.7; break;
      case 'meow': this.emotes.meow = 0.6; break;
      case 'sneeze': this.emotes.sneeze = 0.5; break;
      case 'bowBounce': this.bow?.userData.bounce(1); break;
      default: break;
    }
    return this;
  }
  /** Bow visibility (Clementine has no bow until CS-01 shot 5). Never call with false after that: hard rule. */
  setBowVisible(on) { if (this.bow) this.bow.visible = on; return this; }

  /** Equip a sword skin (or null). `o.model` for GLB skins (diamond / toobig). */
  setSword(skin, o = {}) {
    if (this.sword) { this.sword.group.removeFromParent(); this.sword.dispose(); this.sword = null; }
    if (!skin) return this;
    this.sword = buildSword(typeof skin === 'string' ? skin : skin.skin, typeof skin === 'object' ? { ...skin, ...o } : o);
    if (this.cfg.swordScale) this.sword.group.scale.setScalar(this.cfg.swordScale);
    this.rig.sword = this.sword.group;
    if (this._to) this._swordPose(this._to.sword, 0);
    else this.rig.swordSocket.add(this.sword.group);
    if (this.holy) this.sword.setCharge(this.holy);
    return this;
  }

  /**
   * Cape style id (palette CAPES: cream, red, memeWhite, blue, green, midnight, gold, pilgrim...) or null to remove.
   * sim: 'verlet' (hero) | 'sway' (NPC, GPU). Defaults: hero → verlet, others → sway.
   */
  setCape(style, sim) {
    sim = sim || (this.tier === 'hero' ? 'verlet' : 'sway');
    if (!style) {
      this.capeStyle = null;
      if (this.cape) { this.cape.mesh.removeFromParent(); this.cape.dispose(); this.cape = null; }
      if (this.swayCape) { this.swayCape.removeFromParent(); this.swayCape.geometry.dispose(); this.swayCape = null; }
      return this;
    }
    if (sim === 'verlet') {
      if (this.cape) { this.cape.setStyle(style); this.capeStyle = style; return this; }
      if (this.swayCape) this.setCape(null);
      this.cape = new HeroCape({ style, rig: this.rig, root: this.root, dims: this.cfg.capeDims });
      this.root.add(this.cape.mesh);
    } else {
      if (this.swayCape) { this.swayCape.material = capeMaterial(style, { sway: true }); this.capeStyle = style; return this; }
      if (this.cape) this.setCape(null);
      const toChest = new THREE.Matrix4().copy(this.rig.chestBind).invert();
      this.swayCape = buildSwayCape(style, this.cfg.capeDims, toChest);
      this.rig.chest.add(this.swayCape);
    }
    this.capeStyle = style;
    return this;
  }
  /** Meme Cam: cross-fade the hero cape to the looping sway (GAME_DESIGN §7.8) and back. */
  setCapeMode(mode, o) { this.cape?.setMode(mode, o); return this; }

  /** Show / hide a procedural prop ('milk_cup', 'lantern', 'spoon', 'letter', 'pot_helm', ...). opts.at overrides the mount joint. */
  setProp(name, on = true, opts = {}) {
    let p = this.props[name];
    if (on) {
      if (!p) {
        p = buildProp(name, opts);
        if (!p) return this;
        this.props[name] = p;
        if (p.userData.update) this.updaters.push(p.userData.update);
      }
      const mount = (opts.at && PROP_MOUNTS[name + '@' + opts.at]) || PROP_MOUNTS[name] || { joint: 'pawL', p: [0, -0.05, 0.04], r: [0, 0, 0] };
      const j = this.rig.joints[mount.joint] || this.rig.joints.pawL;
      j.add(p);
      p.position.fromArray(mount.p); p.rotation.set(...mount.r); if (mount.s) p.scale.setScalar(mount.s);
      p.visible = true;
    } else if (p) {
      p.visible = false; p.removeFromParent();
    }
    return this;
  }
  /** Fur quality for this kitten only (0 = sheen). Global switch: Fur.setFurQuality. */
  setFurShells(n) { this.headFur?.setShells(n); this.bibFur?.setShells(n); this.tailFur?.setShells(n); return this; }
  /** Mesh-wide flash (hurt blink / poof) 0..1. */
  setFlash(v) {
    if (this.kitMat.userData.uniforms && this.kitMat !== kitMaterial()) this.kitMat.userData.uniforms.uFlash.value = v * 0.6;
    if (this.furMat) { this.furMat.uniforms.uFlash.value = v * 0.6; this.furMatBaked.uniforms.uFlash.value = v * 0.6; }
    return this;
  }

  // ------------------------------------------------------------------ per-frame

  /**
   * Pose blend + idle life + emotes. Writes joint transforms.
   * @param {number} dt
   * @param {{ idle?: boolean, speed?: number }} [o]
   */
  animate(dt, o = {}) {
    this.time += dt;
    const J = this.rig.joints;
    // base pose
    if (this._to) {
      if (this._blendT < 1) this._blendT = this._blendDur > 0 ? Math.min(1, this._blendT + dt / this._blendDur) : 1;
      const k = smoothstep(0, 1, this._blendT);
      for (const n of BONE_NAMES) {
        J[n].quaternion.slerpQuaternions(this._from.q[n], this._to.q[n], k);
        J[n].position.lerpVectors(this._from.p[n], this._to.p[n], k);
      }
      if (!this._baseQ) { this._baseQ = {}; this._baseP = {}; for (const n of BONE_NAMES) { this._baseQ[n] = new THREE.Quaternion(); this._baseP[n] = new THREE.Vector3(); } }
      for (const n of BONE_NAMES) { this._baseQ[n].copy(J[n].quaternion); this._baseP[n].copy(J[n].position); }
      if (this.sword && this._swordTo && this._swordTo.mode !== 'hidden' && this._swordFrom) {
        const g = this.sword.group;
        g.position.lerpVectors(this._swordFrom.p, this._swordTo.p, k);
        g.quaternion.slerpQuaternions(this._swordFrom.q, this._swordTo.q, k);
      }
    }
    const t = this.time, idle = o.idle ?? this.idleLife;
    const em = this.emotes;
    for (const key in em) if (em[key] > 0) em[key] = Math.max(0, em[key] - dt);
    // idle life: breathing, head drift, tail sway, ear twitches
    if (idle) {
      const lying = this.poseName === 'faint' || this.poseName === 'sleep';
      const br = Math.sin(t * (lying ? 1.4 : 2.1));
      J.chest.quaternion.multiply(E(br * 0.012, 0, 0));
      J.head.quaternion.multiply(E(-br * 0.008 + Math.sin(t * 0.7) * 0.01, Math.sin(t * 0.43) * 0.02, Math.sin(t * 0.37) * 0.015));
      for (let i = 0; i < 6; i++) J['tail' + i].quaternion.multiply(E(0, Math.sin(t * 1.3 - i * 0.55) * (lying ? 0.03 : 0.07) * (0.5 + i * 0.12), 0));
      this.earTwitch.next -= dt;
      if (this.earTwitch.next <= 0) { this.earTwitch[this.rnd() < 0.5 ? 'L' : 'R'] = 0.18; this.earTwitch.next = 2.5 + this.rnd() * 5; }
    }
    for (const s of ['L', 'R']) {
      if (this.earTwitch[s] > 0) this.earTwitch[s] = Math.max(0, this.earTwitch[s] - dt);
      const tw = this.earTwitch[s] > 0 ? Math.sin((this.earTwitch[s] / 0.18) * Math.PI) * 0.35 : 0;
      const flat = em.earsFlat > 0 ? Math.min(1, em.earsFlat / 0.1) : 0;
      const sign = s === 'L' ? -1 : 1;
      J['ear' + s].quaternion.multiply(E(-0.7 * flat + this._earMood * 0.8 - tw * 0.3, 0, sign * (0.6 * flat - this._earMood * 0.6 + tw)));
    }
    // emotes
    if (em.nod > 0) J.head.quaternion.multiply(E(Math.sin((1 - em.nod / 0.6) * Math.PI * 2) * 0.22, 0, 0));
    if (em.shake > 0) J.head.quaternion.multiply(E(0, Math.sin((1 - em.shake / 0.7) * Math.PI * 4) * 0.25, 0));
    if (em.sneeze > 0) { const k = Math.sin((1 - em.sneeze / 0.5) * Math.PI); J.head.quaternion.multiply(E(k * 0.35, 0, 0)); }
    const mouthOpen = em.meow > 0 ? Math.sin((1 - em.meow / 0.6) * Math.PI) : em.sneeze > 0 ? 0.6 : 0;
    J.mouth.scale.set(0.3 + 0.7 * mouthOpen, 0.05 + 0.95 * mouthOpen, 1);
    J.mouth.position.z = this.rest.mouth.p.z + 0.004 * mouthOpen;
    const puff = em.tailPuff > 0 ? 1 + 0.4 * Math.min(1, em.tailPuff * 4) : 1;
    if (this.tailFur) this.tailFur.mesh.material.uniforms && (this.tailFur.mesh.material.uniforms.uFurLen.value = (this.cfg.fur?.len ?? 0.045) * puff);
    // lite tier blink via eye-bone scale
    if (this.lite) {
      this._liteNext = (this._liteNext ?? 2) - dt;
      if (this._liteNext <= 0) { this._liteBlink = 0.14; this._liteNext = 2.5 + this.rnd() * 4; }
      if (this._liteBlink > 0) this._liteBlink = Math.max(0, this._liteBlink - dt);
      const b = this._liteBlink > 0 ? Math.sin((1 - this._liteBlink / 0.14) * Math.PI) : 0;
      const open = 1 - Math.max(b, this._liteLid ?? 0) * 0.92;
      J.eyeL.scale.set(1, open, 1); J.eyeR.scale.set(1, open, 1);
    }
    return this;
  }

  /**
   * Secondary motion after joints are final for the frame: matrices, cape, fur drag, eyes, bow, prop updates.
   * @param {number} dt
   * @param {{ velocity?: THREE.Vector3, wind?: THREE.Vector3, frameId?: number }} [o]
   */
  simulate(dt, o = {}) {
    this.root.updateMatrixWorld(true);
    if (tickFurTime(dt, o.frameId)) { CAPE_TIME.value += dt; envTick(); }
    if (this.furMat) {
      const vel = o.velocity;
      this.drag.set(vel ? -vel.x * 0.15 : 0, vel ? -vel.y * 0.08 : 0, vel ? -vel.z * 0.15 : 0);
      this.furMat.uniforms.uDrag.value.copy(this.drag); this.furMatBaked.uniforms.uDrag.value.copy(this.drag);
    }
    this.eyes?.update(dt);
    for (const u of this.updaters) u(dt);
    if (this.cape) {
      const speed = o.velocity ? Math.hypot(o.velocity.x, o.velocity.z) : 0;
      this.cape.update(dt, { wind: o.wind || FUR_WIND.value, speed });
    }
    if (this.blob) {
      const lying = this.poseName === 'faint' || this.poseName === 'sleep';
      this.blob.scale.setScalar(this.w * (lying ? 0.95 : 0.62) * (o.airborne ? 0.7 : 1));
      if (lying) this.blob.position.x = (this.poseName === 'faint' ? 0.1 : 0) ; else this.blob.position.x = 0;
    }
    return this;
  }

  /** animate + simulate. */
  update(dt, o = {}) { this.animate(dt, o); return this.simulate(dt, o); }

  /** Snap secondary motion (cape) after a teleport / cut. */
  snap() { this.cape?.snap(); return this; }

  /** Draw-call estimate for budgets (meshes that render). */
  drawCalls() { let n = 0; this.root.traverseVisible((c) => { if (c.isMesh || c.isLine) n++; }); return n; }

  dispose() {
    this.headFur?.dispose(); this.bibFur?.dispose(); this.tailFur?.dispose();
    this.kitMesh.geometry.dispose(); this.tuftMesh?.geometry.dispose();
    this.cape?.dispose(); this.sword?.dispose(); this.eyes?.dispose();
    this.furMat?.dispose(); this.furMatBaked?.dispose();
    if (this.kitMat !== kitMaterial()) this.kitMat.dispose();
    this.root.removeFromParent();
  }
}

// ------------------------------------------------------------------ shared small materials

const _whiskerMats = new Map();
function whiskerMaterial(color) {
  if (!_whiskerMats.has(color)) _whiskerMats.set(color, own(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false })));
  return _whiskerMats.get(color);
}
let _shadowOnly = null;
/** Invisible in the colour pass, still rendered into shadow maps (three uses its depth material there). */
function shadowOnlyMaterial() { return _shadowOnly || (_shadowOnly = own(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))); }
let _auraMat = null;
function auraMaterial() {
  if (_auraMat) return _auraMat;
  _auraMat = own(new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new THREE.Color(PAL.holyRim) }, uI: { value: 0 }, uExpand: { value: 0.0 } },
    vertexShader: /* glsl */`uniform float uExpand; varying vec3 vN, vV;
      void main(){ vec4 wp = modelMatrix * vec4(position + normal * uExpand, 1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uI; varying vec3 vN, vV;
      void main(){ float f = pow(abs(dot(normalize(vN), vV)), 3.0); gl_FragColor = vec4(uColor * f * uI * 0.55, 1.0); }`,
  }));
  return _auraMat;
}
