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
import { GeoBuilder, mat, rgb, mixRgb, smoothstep, clamp, Spring, damp, earGeometry, hashString, mulberry32, charDetail, segScale, CHAR_Q } from './util.js';
import { makeKitMaterial, kitMaterial, makeToonMaterial, isSharedKit, RM, own, disown, tuftMaterial, blobMaterial, blobGeometry, HOLY_COLOR, TOP_VIEW, READABILITY } from './materials.js';
import { buildSilhouetteProxy, HIGHLIGHT, setHullFur } from './Readability.js';
import { buildOutline, OUTLINE } from './Outline.js';
import { FACE, coatColor, headFurMask, makeFurMaterial, FurPart, shellsFor, isoShellsFor, MAX_SHELLS, FUR_WIND, tickFurTime, FUR_RENDER_ORDER } from './Fur.js';
import { EyePair, EXPRESSIONS, EYE, eyePivotMatrix, ringGeometry } from './Eyes.js';
import { buildBow } from './Bow.js';
import { HeroCape, buildSwayCape, capeMaterial, CAPE_TIME, CAPE_DEFAULTS } from './Cape.js';
import { buildSword } from './Sword.js';
import { addPlateArmour, addGauntlet } from './Armour.js';
import { ACCESSORIES } from './Accessories.js';
import { POSES, solveTwoBone, swordMatrix } from './Poses.js';
import { buildProp, PROP_MOUNTS } from './Props/ProcProps.js';
import { noteRender, envTick } from './runtime.js';
import { fxBasicMaterial, fxModule, fxShaderMaterial } from '../fx/shaders.js';
import { shadowOnly } from '../core/depth.js';

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
/** TT3: an upright question-mark curl (was a drag along the grass, ending at 0.05 H); sit / lie poses tip it down (Poses TAIL_LAY). */
export const TAIL_CURVE = [[0, 0.26, -0.12], [0.04, 0.3, -0.26], [0.06, 0.47, -0.29], [0, 0.57, -0.2]];

/** Quaternion from XYZ euler. Pose snapshots are cached per kitten, so this builds only at build / first pose use. */
const E = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
/** Scratch-writing variant for per-frame code (H2: no allocation in animate): returns a shared quaternion. */
const _eq = new THREE.Quaternion(), _ee = new THREE.Euler();
const Es = (x = 0, y = 0, z = 0) => _eq.setFromEuler(_ee.set(x, y, z, 'XYZ'));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

/**
 * Proportions (ART_WARM_SPEC §6.3, D15; total height ~1.0 H unchanged, physics / hitboxes / MODEL_FIT untouched):
 * a bigger head (×`head[tier]`, kids ×`head.kid`), a shorter body (hips / chest heights, legs ×`leg`). `legacy`
 * keeps the M1/M2 rest pose (cfg.proportions === 'legacy'). Root-space pose targets shift with the torso (`drop`).
 */
export const PROPORTIONS = Object.freeze({
  head: Object.freeze({ hero: 1.17, kitten: 1.17, npc: 1.12, lite: 1.05, kid: 1.22 }),
  hipsY: 0.27, chestY: 0.085, leg: 0.85, kidScale: 0.75, neckMin: 0.15,
  /** M1/M2 rest pose; `headTop` = head pivot → ear tip at head scale 1 (H). */
  legacy: Object.freeze({ hipsY: 0.30, chestY: 0.10, neckY: 0.22, leg: 1, headTop: 0.38 }),
});
/**
 * Play-LOD (ART §6.4): in-game cats are built at `detail` (× the preset's charDetail) with the fur base layers merged
 * into the body draw; the full-detail close-up set (`setCloseUp`) is built in idle slices after `idleAfter` frames.
 * `closeOn` / `closeOff`: the close-up hysteresis (lens → her focus, m) used when camera publishes no `cam.closeUp`.
 */
export const PLAY_LOD = Object.freeze({ detail: 0.4, idleAfter: 60, closeOn: 6.0, closeOff: 6.3, sliceMs: 2 });
/** Swords at least this long (H) keep the cane idle instead of `cfg.idlePose` (player DRAG.minLength: tip drag). */
export const IDLE_REST_MAX_LEN = 1.4;

/** Rest (local) transforms for a kitten of width w. @param {{hipsY:number, chestY:number, leg:number}} [pr] */
function restPose(w, earsLow = 0, pr = PROPORTIONS) {
  const L = pr.leg ?? 1;
  const P = {
    body: [0, 0, 0], hips: [0, pr.hipsY, 0], chest: [0, pr.chestY, 0], head: [0, pr.neckY ?? 0.22, 0], mouth: [...FACE.mouth],
    earL: [0.132, 0.256, -0.014], earR: [-0.132, 0.256, -0.014], eyeL: [...FACE.eyeL], eyeR: [...FACE.eyeR],
    shoulderL: [0.135 * w, 0.15, 0.0], elbowL: [0, -ARM.upper, 0], pawL: [0, -ARM.fore, 0],
    shoulderR: [-0.135 * w, 0.15, 0.0], elbowR: [0, -ARM.upper, 0], pawR: [0, -ARM.fore, 0],
    thighL: [0.085 * w, -0.06 * L, 0], kneeL: [0, -0.10 * L, 0], footL: [0, -0.11 * L, 0],
    thighR: [-0.085 * w, -0.06 * L, 0], kneeR: [0, -0.10 * L, 0], footR: [0, -0.11 * L, 0],
  };
  const R = {
    earL: [-0.1, -0.08, -0.45 - earsLow * 0.6], earR: [-0.1, 0.08, 0.45 + earsLow * 0.6],
    shoulderL: [0, 0, 0.12], shoulderR: [0, 0, -0.12],
  };
  // tail joints along the rest curve
  const dy = pr.hipsY - PROPORTIONS.legacy.hipsY;
  const curve = new THREE.CatmullRomCurve3(TAIL_CURVE.map((p) => new THREE.Vector3(p[0], p[1] + dy, p[2])));
  let prev = new THREE.Vector3(0, pr.hipsY, 0);
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
export function buildKitten(cfg = {}, o = {}) {
  return new Kitten(cfg, o);
}

/** TT3 cheek blush: centre (|x|, y) in head space, radii, strength, colour. */
export const BLUSH = Object.freeze({ at: [0.094, 0.084], r: [0.03, 0.019], k: 0.5, color: '#F49AB0' });
/** Face-framing head wear that hides the head contour (the cheek ruffs shrink under it). */
const HOODED = Object.freeze(['hood', 'coif']);
/** Cheek ruff under a hood: radius / fur length / sideways offset factors. */
const HOOD_CHEEK = Object.freeze({ r: 0.86, len: 0.6, x: 0.9 });

export class Kitten {
  /**
   * @param {object} cfg see buildKitten
   * @param {{ lod?: 'play'|'full', detail?: number, tailBake?: number }} [o] lod 'play' (in game: KittenView) = the play-LOD set + merged
   *   fur base, close-up set built later; 'full' (default in tools / tests) = the full set, always "close".
   */
  constructor(cfg, o = {}) {
    this.cfg = cfg;
    const tier = cfg.tier || 'kitten';
    this.tier = tier;
    this.lite = tier === 'lite';
    this.lod = this.lite ? 'full' : (o.lod ?? cfg.lod ?? 'full');
    // tessellation factor: the lite tier's fixed 0.55, else the quality preset's charDetail (Low ~0.55, Med/High 1);
    // play LOD scales it down (ART §6.4: the iso set; the close-up set is rebuilt at the full factor)
    this.detail = this.lite ? 0.55 : (o.detail ?? (this.lod === 'play' ? Math.min(charDetail(), PLAY_LOD.detail) : charDetail()));
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
    const earsLowHint = acc.some((a) => ['potHelm', 'plumedHelm', 'jesterHat', 'bakerHat'].includes(a.id)) ? 0.9
      : acc.some((a) => a.id === 'bucketHelm') ? 0.15   // TT3: the smaller pail sits between upright ears
      : acc.some((a) => ['wizardHat', 'strawHat', 'nightcap', 'sergeantCap'].includes(a.id)) ? 0.6
        : acc.some((a) => ['coif'].includes(a.id)) ? 0.25 : acc.some((a) => a.id === 'hood') ? 0.2 : 0;

    // ---- skeleton
    const legacy = cfg.proportions === 'legacy';
    const kid = cfg.kid === true;   // lost kittens, squires (configs mark them)
    const headK = legacy ? 1 : (kid ? PROPORTIONS.head.kid : PROPORTIONS.head[tier] ?? 1);
    this.headScale = (cfg.headScale ?? 1) * headK;
    // the neck shortens so the ear tips stay at the M1/M2 height (total height unchanged, ART §6.3): the bigger head
    // sits lower on the shoulders instead of growing her taller (cages, doors, camera catH keep working)
    const L0 = PROPORTIONS.legacy, prop = legacy ? L0
      : { ...PROPORTIONS, neckY: Math.max(PROPORTIONS.neckMin, L0.hipsY + L0.chestY + L0.neckY + L0.headTop * (cfg.headScale ?? 1) - PROPORTIONS.hipsY - PROPORTIONS.chestY - L0.headTop * this.headScale) };
    const { P, R, curve } = restPose(w, earsLowHint, prop);
    /** Torso height change vs the M1/M2 rest pose (root-space pose targets and the cape neckline follow it). */
    this.bodyDrop = (prop.hipsY + prop.chestY) - (PROPORTIONS.legacy.hipsY + PROPORTIONS.legacy.chestY);
    this.tailCurve = curve;
    const joints = {}, bones = [];
    for (const n of BONE_NAMES) {
      const b = new THREE.Bone(); b.name = n;
      b.position.fromArray(P[n]);
      if (R[n]) b.quaternion.copy(E(...R[n]));
      joints[n] = b; bones.push(b);
    }
    for (const n of BONE_NAMES) (PARENT[n] ? joints[PARENT[n]] : root).add(joints[n]);
    if (this.headScale !== 1) joints.head.scale.setScalar(this.headScale);
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
      swordHand: joints.pawR, chestBind: bind.chest.clone(), bodyBind: bind.body.clone(),
    };
    rig.swordSocket = new THREE.Object3D(); rig.swordSocket.name = 'swordSocket'; joints.pawR.add(rig.swordSocket);
    rig.capeAnchor = new THREE.Object3D(); rig.capeAnchor.name = 'capeAnchor'; rig.capeAnchor.position.set(0, 0.2, -0.12); joints.chest.add(rig.capeAnchor);
    this.rig = rig;
    this.bind = bind;

    // ---- materials
    const holyCapable = tier === 'hero' || cfg.holy;
    // WarmToon per mesh kind (H3): the skinned body and the instanced fur base layer never share one material object;
    // a holy-capable cat's two variants share ONE uniform set (one holy / flash / highlight value)
    this.kitMat = holyCapable ? makeKitMaterial({ kind: 'skinned' }) : kitMaterial('skinned');
    this.kitMatInst = holyCapable ? makeToonMaterial({ kind: 'instanced', uniforms: this.kitMat.userData.uniforms }) : kitMaterial('instanced');
    const furTier = tier === 'hero' ? 'hero' : tier === 'kitten' ? 'kitten' : 'npc';
    this.furTier = furTier;
    this.furMat = null; this.furMatBaked = null;
    if (!this.lite) {
      const fo = { len: cfg.fur?.len ?? 0.045, tiling: cfg.fur?.tiling ?? 4.8, rim: cfg.fur?.rim ?? 0.3, tipTint: this.coat.light || this.coat.base, density: cfg.fur?.density ?? 1.25 };
      // dark coats (Mochi, Midnight cats): the soft outer shells read as a dark ghost halo against the bright fog
      // close to the camera, so their silhouette fringe is pulled in and the outer shells fade earlier edge-on
      const bc = rgb(this.coat.base), dark = 0.2126 * bc[0] + 0.7152 * bc[1] + 0.0722 * bc[2] < 0.05;
      // (and a softer rim: on the outermost shells it drew a pale ring around the dark fringe, a "doubled" outline)
      if (dark) Object.assign(fo, { len: fo.len * 0.75, fringe: 0.55, edgeStart: 0.0, edgeFade: 0.85, rim: fo.rim * 0.5 });
      // ...and more fill (M2: Mochi's face and body read almost black in D-01 under day fog): a stronger ambient /
      // hemisphere term and lighter roots so the tuxedo keeps its form; `cfg.fur.ambMul` overrides
      if (dark) Object.assign(fo, { ambMul: 2.4, rootDark: 0.92, sheen: 0.09 });
      for (const key of ['ambMul', 'sheen']) if (cfg.fur?.[key] !== undefined) fo[key] = cfg.fur[key];
      for (const key of ['fringe', 'edgeStart', 'edgeFade']) if (cfg.fur?.[key] !== undefined) fo[key] = cfg.fur[key];
      this.furMat = makeFurMaterial(fo);
      this.furMatBaked = makeFurMaterial({ ...fo, baked: true });
    }

    // ---- assembly context
    const kit = new GeoBuilder({ skinned: true });
    const tufts = new GeoBuilder({ skinned: true });
    const updaters = [];
    const A = {
      cfg, w, flags, lite: this.lite,
      /** Segment count scaled down for the lite tier (villagers, old knights, riders) and on Low (charDetail). */
      seg: (n) => segScale(n, this.detail),
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
    // TT3 cuteness: a soft pink blush painted into the face fur under each eye (every cat; `cfg.blush` 0 turns it off)
    const blushK = cfg.blush ?? BLUSH.k, blushC = rgb(cfg.blushColor ?? BLUSH.color);
    const faceAt = (region) => (v, n, lp) => {
      const c = coatColor(coat, region, lp);
      if (!(blushK > 0) || lp.z < 0.04) return c;
      const dx = Math.abs(lp.x) - BLUSH.at[0], dy = lp.y - BLUSH.at[1];
      const w = Math.exp(-(dx * dx) / (BLUSH.r[0] * BLUSH.r[0]) - (dy * dy) / (BLUSH.r[1] * BLUSH.r[1])) * smoothstep(0.04, 0.09, lp.z);
      return w > 0.01 ? mixRgb(c, blushC, w * blushK) : c;
    };
    const coatRoot = (region, o) => (v) => coatColor(coat, region, v, o);

    // ---- head fur surfaces (head space)
    const eyeScale = cfg.eyes?.size ?? 1;
    const headPieces = this._headFurPieces(cfg, acc);
    if (this.lite) {
      for (const hp of headPieces) A.add('head', hp.geo, { color: faceAt(hp.region), rmse: RM.fur });
    } else {
      const gb = new GeoBuilder({ fur: true });
      const combFor = (region) => (v, n, lp) => (region === 'cheek' ? [Math.sign(lp.x) * 0.55, -0.85, -0.25]
        : region === 'muzzle' ? [Math.sign(lp.x) * 0.9, -0.35, 0.1] : [lp.x * 2.0, -0.45, -1]);
      for (const hp of headPieces) gb.add(hp.geo, { color: faceAt(hp.region), rmse: RM.fur, fur: (v, n, lp) => { const f = headFurMask(lp, hp.region, eyeScale); f[1] *= hp.len ?? 1; return f; }, comb: combFor(hp.region) });
      this.headFur = new FurPart(gb.build(), { furMat: this.furMat, sheenMat: this.kitMatInst, tier: furTier, name: 'furHead', owner: this });
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
    const eyeR = FACE.eyeR0 * eyeScale;
    const eyeColors = eyeCfg.L || eyeCfg.R ? { L: { ...eyeCfg, ...(eyeCfg.L || {}) }, R: { ...eyeCfg, ...(eyeCfg.R || {}) } } : eyeCfg;
    const posL = [FACE.eyeL[0] * (0.97 + 0.03 * eyeScale), FACE.eyeL[1], this._eyeZ(FACE.eyeL[0], FACE.eyeL[1], eyeScale) - EYE.seat];
    const posR = [-posL[0], posL[1], posL[2]];
    /** TT3: where the eyes sit (head space; tests check no eye passes the head outline in profile). */
    this.eyeFit = Object.freeze({ posL, posR, r: eyeR, flat: EYE.flat, yaw: 0.3 });
    if (this.lite) {
      this._liteEyes(A, posL, posR, eyeR, eyeColors);
    } else {
      const lidC = coatColor(coat, 'head', new THREE.Vector3(FACE.eyeL[0], FACE.eyeL[1] + 0.07, FACE.eyeL[2] - 0.02));
      // lids, lashes and brows: vertex-coloured, drawn by the cat's own instanced WarmToon (no extra program)
      const pupilR = eyeCfg.pupilR ?? (tier === 'hero' ? EYE.pupil.hero : tier === 'kitten' ? EYE.pupil.kitten : EYE.pupil.default);
      this.eyes = new EyePair({
        r: eyeR, flat: EYE.flat, posL, posR, yaw: 0.3, colors: eyeColors, lidMat: this.kitMatInst, lidColor: lidC.map((c) => c * 0.86), detail: this.detail,
        slit: eyeCfg.slit, sclera: eyeCfg.sclera, pupilR, lash: eyeCfg.lash ?? 1, brows: eyeCfg.brows, seed: (cfg.id || 'kitten') + ':eyes',
      });
      joints.head.add(this.eyes.group);
      for (const [pos, side] of [[posL, 1], [posR, -1]]) A.add('head', ringGeometry(eyeR, this.detail), { m: eyePivotMatrix(pos, side, 0.3), color: rgb(PAL.eyeLine), rmse: RM.eyeLine });
      if (flags.hideEye) { /* set after accessories */ }
    }

    // ---- ears (kit) + tufts
    const earS = (cfg.ears?.size ?? 1) * 1.28;   // ref2: big, wide-set ears that clear the head fluff by ~0.08 H
    // skinned shell-fur surfaces (ear backs + tail) share one FurPart / draw call
    this._skinFurGB = this.lite ? null : new GeoBuilder({ skinned: true, fur: true });
    this._ears(A, cfg, bind, boneIndex, earS);
    // tuft cards (ART §6.2): Med / High only (QUALITY.charTufts), never on villagers (lite)
    if (!this.lite && cfg.ears?.tufts !== false && CHAR_Q.tufts) this[cfg.tuftsLegacy ? '_tuftsLegacy' : '_tufts'](tufts, bind, boneIndex, earS);

    // ---- bib, torso, limbs
    const armour = cfg.outfit?.armour || null;
    const clothed = !!(armour || cfg.outfit?.gown || acc.some((a) => ['tunic', 'tabard', 'gown', 'apron'].includes(a.id)));
    this._body(A, { armour, clothed, bind, boneIndex, coatRoot });

    // ---- tail
    this._tail(A, kit, bind, boneIndex);

    // ---- armour + accessories
    if (armour) addPlateArmour(A, { style: armour, pouch: cfg.outfit?.pouch !== false, crest: cfg.outfit?.crest ?? null });
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
      tm.userData.cards = this._tuftCards ?? 0;
      root.add(tm); tm.bind(skeleton, new THREE.Matrix4());
      this.tuftMesh = tm;
    }
    if (this.tailFurGeo) {
      // play LOD bakes only the iso shells (0 today: the base surface alone); the close-up copies are reserved in idle
      // time by prepareCloseUp (PERF H4), never ~20 ms of hidden skinned geometry per cat spawn. `o.tailBake`: internal
      const bake = o.tailBake ?? (this.lod === 'play' ? isoShellsFor(furTier) : undefined);
      this._tailStub = o.tailBake === 0 && this.lod !== 'play';   // prepareCloseUp's temp cat: its tail is never drawn
      this.tailFur = new FurPart(this.tailFurGeo, { bakedMat: this.furMatBaked, sheenMat: this.kitMat, tier: furTier, skeleton, name: 'furTail', owner: this, bake, shells: bake });
      this.tailFur.mesh.renderOrder = FUR_RENDER_ORDER - 0.3;
      root.add(this.tailFur.mesh);
    }
    // shadow proxy for the shell-fur surfaces (shells don't cast): head, bib and tail as low-poly shapes
    if (!this.lite) {
      const sp = new GeoBuilder({ skinned: true });
      const head = new THREE.SphereGeometry(0.19, 14, 10).scale(1.22, 1.0, 1.0).translate(0, 0.16, 0);
      sp.add(head, { matrix: bind.head, bone: boneIndex.head });
      // fur ears no longer cast from the kit mesh
      for (const s of ['L', 'R']) sp.add(new THREE.ConeGeometry(0.06 * earS, 0.11 * earS, 6).scale(1, 1, 0.6).translate(0, 0.055 * earS - 0.02, -0.01), { matrix: bind['ear' + s], bone: boneIndex['ear' + s] });
      sp.add(new THREE.SphereGeometry(0.11, 10, 8).scale(1.05 * w, 0.8, 0.8).translate(0, 0.215, 0.05), { matrix: bind.chest, bone: boneIndex.chest });
      const tc = new THREE.TubeGeometry(this.tailCurve, 10, 0.07, 6, false), tpos = tc.attributes.position;
      const tT = new Float32Array(tpos.count); for (let i = 0; i < tpos.count; i++) tT[i] = Math.floor(i / 7) / 10;
      sp.add(tc, { skin: (v, lp, i) => { const s = Math.min(1, tT[i]) * 5, i0 = Math.min(4, Math.floor(s)), f = s - i0; return [boneIndex['tail' + i0], boneIndex['tail' + (i0 + 1)], 0, 0, 1 - f, f, 0, 0]; } });
      const proxy = new THREE.SkinnedMesh(sp.build(), shadowOnlyMaterial());
      proxy.name = 'shadowProxy'; proxy.castShadow = true; proxy.receiveShadow = false; proxy.frustumCulled = false;
      shadowOnly(proxy);   // drawn into the sun's shadow map only: no colour-pass program (PERF §1.2)
      root.add(proxy); proxy.bind(skeleton, new THREE.Matrix4());
      this.shadowProxy = proxy;
    }

    // ---- bow (HARD RULE: left ear)
    this.bow = null;
    if (cfg.bow) {
      const bow = buildBow({ detail: this.detail, ...cfg.bow });
      // target in head space (art.md §2.2: (+0.10, 0.955, 0.06) world → head-local (0.10, 0.335, 0.06))
      const headPos = new THREE.Vector3(...(cfg.bow.at || [0.118, 0.292, 0.08]));
      const toEar = _m2.copy(bind.earL).invert().multiply(bind.head);
      bow.position.copy(headPos.applyMatrix4(toEar));
      const earQ = new THREE.Quaternion(); bind.earL.decompose(_v, earQ, _v2);
      const headQ = new THREE.Quaternion(); bind.head.decompose(_v, headQ, _v2);
      bow.quaternion.copy(earQ.invert().multiply(headQ).multiply(E(cfg.bow.pitch ?? 0.25, -0.25, -(cfg.bow.tilt ?? 0.32))));
      if (cfg.bow.scale2) bow.scale.setScalar(cfg.bow.scale2);
      bow.traverse((c) => { if (c.isMesh) c.castShadow = false; });   // H3: the bow never casts
      this._bowBase = bow.scale.x;
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
    if (flags.hideEye && this.eyes) this.eyes.hideEye(flags.hideEye);

    // ---- aura hull (holy) + blob shadow
    if (holyCapable) this._aura();
    if (cfg.blob !== false) {
      const blob = new THREE.Mesh(blobGeometry(), blobMaterial());
      blob.position.y = 0.004; blob.scale.setScalar(0.62 * w); blob.renderOrder = -1; blob.name = 'blob';
      root.add(blob); this.blob = blob;
    }

    root.scale.copy(saveScale);

    // ---- play LOD (ART §6.4): the fur base layers merge into the body draw while no shells are drawn
    this._kitGeo = kitGeo;
    this._playGeo = this.lod === 'play' ? this._mergePlayGeometry(kitGeo, bind, boneIndex) : null;
    this._closeSet = null;
    this._playEyes = null;
    /** Close-up state (camera's cam.closeUp: shells, whiskers, full-detail set). Tools / tests ('full' LOD) stay close. */
    this.closeUp = this.lod !== 'play';
    this.cape?.setDetail(this.closeUp);   // built above before the LOD flag: iso play takes the coarse cape grid
    /** Activity tier (PERF §4.3, X13): 0 full, 1 no cape verlet / secondary motion, 2 every 4th frame, 3 frozen. */
    this.activity = 0;
    this._actAcc = 0; this._actN = 0;
    /** Volume-preserving squash on the body joint (ART §6.5; the player drives kicks and targets). */
    this.squash = new Squash();
    this.squashTarget = 0;
    this.squashScale = 1;
    /** Breathing squash target amplitude (ART §6.5 idle row; 0 turns it off). */
    this.breathe = this.lite ? 0 : SQUASH.breathe;
    this.outline = null;

    // ---- runtime state
    this.props = {};
    // visual-only randomness, seeded per cat id (deterministic screenshots; never Math.random)
    this.rnd = mulberry32(hashString((cfg.id || 'kitten') + ':life'));
    this.time = this.rnd() * 10;
    this.holy = 0;
    this.expr = cfg.expression || 'neutral';
    this.emotes = { earsFlat: 0, tailPuff: 0, nod: 0, shake: 0, meow: 0, sneeze: 0, wave: 0, throw: 0, groom: 0, twirl: 0, boop: 0, pawBump: 0, cheer: 0 };
    this.earTwitch = { L: 0, R: 0, next: 2 + this.rnd() * 4 };
    this.springs = { head: new Spring(90, 12), tail: new Spring(40, 6) };
    this.idleLife = true;
    this._snapshots = new Map();
    this._from = null; this._to = null; this._blendT = 1; this._blendDur = 0.25;
    this.poseName = null;
    this.drag = new THREE.Vector3();
    this.setExpression(this.expr, true);
    this.setPose(cfg.pose || 'idle', { blend: 0, expression: !cfg.expression });   // the config's own expression wins at build
    for (const pr of cfg.props || []) this.setProp(pr, true);
    this.animate(0);
    this.root.updateMatrixWorld(true);
    root.userData.kitten = this;
    /** KittenView driving this kitten (set by the view), x-ray proxy (lazy), highlight state, top-view factor. */
    this.view = null;
    this.silhouetteProxy = null;
    this._proxyDirty = false;
    this.highlight = null;
    this._topK = 0;
    /** Warm-rim floor on her own toon / metal / fur materials (READABILITY.heroRim for the hero, 0 = env rim only). */
    this.rimFloor = 0;
    if (this.tier === 'hero') this.setRimFloor(READABILITY.heroRim);
    this._applyLod();
  }

  /**
   * Per-actor warm-rim floor (WARM_ADVENTURE_SPEC WA4 `hero 0.40`): her toon / metal rim strength becomes
   * max(env uRimK, k) and the fur rim ≥ k. Shared (per-kind library) materials are never touched; 0 draws, no compile.
   * @param {number} k 0..1
   */
  setRimFloor(k) {
    this.rimFloor = Math.max(0, +k || 0);
    this.root.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) this._rimFloorOn(m);
    });
    for (const m of [this.kitMat, this.kitMatInst]) this._rimFloorOn(m);
    for (const fm of [this.furMat, this.furMatBaked]) {
      const u = fm?.uniforms?.uRimStrength;
      if (!u) continue;
      if (fm.userData.rimBase === undefined) fm.userData.rimBase = u.value;
      u.value = Math.max(fm.userData.rimBase, this.rimFloor);
    }
    return this;
  }
  /** @param {THREE.Material|null|undefined} m */
  _rimFloorOn(m) {
    const u = m?.userData?.uniforms?.uRimMin;
    if (u && !isSharedKit(m)) u.value = this.rimFloor;
  }

  // ------------------------------------------------------------------ play LOD / close-up (ART §6.1, §6.4)

  /**
   * One skinned geometry = kit + the fur base layers (head + bib rigid on their bones, tail + ear backs already
   * skinned). Drawn while no shells are (iso play on every tier): head / bib / tail fur cost 0 extra draws.
   */
  _mergePlayGeometry(kitGeo, bind, boneIndex) {
    const parts = [{ g: kitGeo }];
    if (this.headFur) parts.push({ g: this.headFur.mesh.geometry, m: bind.head, bone: boneIndex.head });
    if (this.bibFur) parts.push({ g: this.bibFur.mesh.geometry, m: bind.chest, bone: boneIndex.chest });
    if (this.tailFur) parts.push({ g: this.tailFur._src });
    return mergeSkinnedParts(parts);
  }

  /** Shells this kitten draws right now (close-up count or the iso play count). */
  shellTarget() {
    const ft = this.furTier;
    return this.closeUp ? shellsFor(ft) : isoShellsFor(ft);
  }

  /** Apply the close-up / play state: body geometry, fur shells, whiskers. Cheap: pointer swaps only. */
  _applyLod() {
    if (this.lite || !this.kitMesh) return this;
    const n = this.shellTarget();
    const merged = !!this._playGeo && !this.closeUp && n === 0;
    const close = this.closeUp && this._closeSet;
    this.kitMesh.geometry = merged ? this._playGeo : close ? this._closeSet.kit : this._kitGeo;
    // the merged play body already carries the fur base surfaces and casts: the shell-fur shadow proxy would be a
    // duplicate caster plus a colour-masked main-pass draw (PERF §9.4 / ART §6.4: no shadow-proxy draw in play)
    if (this.shadowProxy) this.shadowProxy.visible = !merged;
    for (const f of [this.headFur, this.bibFur, this.tailFur]) {
      if (!f || (f === this.tailFur && this._tailStub)) continue;
      f.mesh.visible = !merged;
      if (!merged) f.setShells(n);
    }
    if (this.eyes && this._closeSet?.eyes && this._playEyes) this.eyes.useGeometries(this.closeUp ? this._closeSet.eyes : this._playEyes);
    if (this.whiskerMesh) this.whiskerMesh.visible = this.closeUp;   // close-up LOD only (ART §6.3)
    return this;
  }

  /**
   * Build the full-detail close-up set (body, fur surfaces, eyes) for a play-LOD kitten. KittenView calls it in an idle
   * slice after the level's first frames (ART §6.1: never on the close-up frame); setCloseUp(true) falls back to it.
   * @returns {boolean} true when it built something
   */
  prepareCloseUp() {
    if (this._closeSet || this.lod !== 'play' || this.lite) return false;
    // the temp cat bakes no tail shells (its tail source is stolen below; the copies are baked once, here)
    const t = new Kitten({ ...this.cfg, sword: null, cape: null, props: [], blob: false, whiskers: false, pose: 'idle' }, { lod: 'full', tailBake: 0 });
    const set = { kit: t.kitMesh.geometry, eyes: t.eyes?.geometries() ?? null };
    // steal the geometries the close-up shows; the temp kitten disposes what is left (dummies stand in)
    t.kitMesh.geometry = _DUMMY; t._kitGeo = _DUMMY;
    if (this.headFur && t.headFur) { this.headFur.setSource(t.headFur.mesh.geometry); t.headFur.mesh.geometry = _DUMMY; }
    if (this.bibFur && t.bibFur) { this.bibFur.setSource(t.bibFur.mesh.geometry); t.bibFur.mesh.geometry = _DUMMY; }
    if (this.tailFur && t.tailFur) { this.tailFur.setSource(t.tailFur._src, Math.max(shellsFor(this.furTier), isoShellsFor(this.furTier))); t.tailFur._src = null; }
    if (t.eyes) t.eyes.releaseGeometries();
    t.dispose();
    this._playEyes = this.eyes?.geometries() ?? null;
    this._closeSet = set;
    this._applyLod();
    return true;
  }

  /**
   * Close-up on / off (camera's cam.closeUp, ART §6.1): shells (QUALITY.furShellsClose), whiskers, the full-detail
   * geometry set. Off = the play set (fur base merged into the body draw, no shells unless furShellsIso > 0).
   * @param {boolean} on
   */
  setCloseUp(on) {
    on = !!on;
    if (on === this.closeUp) return this;
    if (on && this.lod === 'play' && !this._closeSet) this.prepareCloseUp();
    this.closeUp = on;
    // TT2 §10.6 d: no hull round the instanced head / bib fur in close-ups (it showed as a maroon band behind her head)
    setHullFur(this.outline, !on);
    this.cape?.setDetail(on);   // full cape grid only in close-ups (PERF §9.1)
    this._applyLod();
    return this;
  }

  /**
   * Activity tier (PERF §4.3, X13; replaces the draft setOffscreen): 0 = full; ≥ 1 = the cape sways in the shader (no
   * verlet) and secondary motion (fur drag, blinks, bow bounce) pauses; 2 = animated every 4th frame with the summed
   * dt; 3 = frozen. Coming back to 0 restores everything the same frame (the cloth re-seeds from the current pose).
   * @param {0|1|2|3} tier
   */
  setActivity(tier) {
    tier = Math.max(0, Math.min(3, tier | 0));
    if (tier === this.activity) return this;
    const was = this.activity;
    this.activity = tier;
    if (this.cape) {
      if (tier >= 1 && was === 0) { this.cape.setMode('sway', { blend: 1e-3 }); this.cape.pauseSim(true); }
      else if (tier === 0) { this.cape.pauseSim(false); this.cape.snap(); this.cape.setMode(this._capeMode ?? 'verlet', { blend: 1e-3 }); }
    }
    if (tier === 0) { this._actAcc = 0; this._actN = 0; }
    return this;
  }

  /**
   * Activity gate for a frame: how much dt to advance now (0 = skip this frame). Tier 2 runs every 4th frame with the
   * accumulated dt, tier 3 never.
   * @param {number} dt @returns {number}
   */
  activityDt(dt) {
    if (this.activity <= 1) return dt;
    this._actAcc += dt;
    if (this.activity >= 3) return 0;
    if (++this._actN % 4 !== 0) return 0;
    const d = this._actAcc; this._actAcc = 0; return d;
  }

  /** Squash kick (ART §6.5): negative = squash, positive = stretch (jump +3.5, land −2.5, hit −2.0, meow +2.0). */
  squashKick(dv) { this.squash.kick(dv); return this; }

  /**
   * Which features this cat has right now (ART §11 / smoke `characters:*`): draws, triangles, shells, tufts, outline,
   * LOD, activity, squash. Cheap enough for a debug hook; never call per frame.
   */
  debugFeatures() {
    let draws = 0, tris = 0;
    this.root.traverseVisible((o) => {
      if (!(o.isMesh || o.isLine || o.isPoints)) return;
      draws++;
      const g = o.geometry; if (!g || o.isLine || o.isPoints || o.material?.colorWrite === false) return;
      let n = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
      if (g.drawRange && Number.isFinite(g.drawRange.count)) n = Math.min(n, g.drawRange.count / 3);
      if (o.isInstancedMesh) n *= o.count;
      tris += n;
    });
    return {
      id: this.cfg.id ?? null, tier: this.tier, lod: this.lod, closeUp: this.closeUp, closeSetBuilt: !!this._closeSet,
      merged: this.kitMesh.geometry === this._playGeo, detail: this.detail, draws, tris: Math.round(tris),
      shells: this.headFur?.mesh.visible ? this.headFur.shells : 0, tufts: !!this.tuftMesh, tuftCards: this.tuftMesh?.userData.cards ?? 0,
      whiskers: !!this.whiskerMesh?.visible, outline: !!this.outline?.visible, activity: this.activity,
      squash: this.squashScale, headScale: this.headScale, bodyDrop: this.bodyDrop,
      materials: { body: this.kitMat.customProgramCacheKey?.() ?? this.kitMat.type, eyes: this.eyes?.eyeMeshes[0].material.type ?? null },
    };
  }

  /** Duck-typing flag for characters' resolvers (Readability.resolveTarget). */
  get isKitten() { return true; }

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
  /**
   * Head fur surfaces (head space): skull, cheek ruffs, whisker pads, chin. Under a face-framing hood / coif the cheek
   * ruffs are smaller and shorter: full ones stuck out past the hood's sides and, with the head contour hidden, read as
   * a featureless grey disc over the muzzle in dialogue close-ups (story 10c / 11c, Sage).
   * @param {object} cfg @param {{id: string}[]} [acc] normalised accessories
   */
  _headFurPieces(cfg, acc = []) {
    const out = [];
    // segment counts per tier (every head-fur triangle is drawn once per shell: hero 17x, companions 11x)
    const fd = this.lite ? (cfg.faceDetail ?? 1) : 1;   // TT3: named kittens' finer face (crisp markings)
    const S = this.lite ? { skull: [Math.round(28 * fd), Math.round(20 * fd)], cheek: [14, 10], pad: [10, 8], chin: [10, 8] }
      : this.tier === 'hero' ? { skull: [46, 34], cheek: [22, 16], pad: [14, 10], chin: [12, 9] }
        : { skull: [38, 28], cheek: [20, 14], pad: [12, 9], chin: [10, 8] };
    if (!this.lite && this.detail < 1) for (const k in S) S[k] = S[k].map((n) => segScale(n, this.detail, 8));
    const skull = new THREE.SphereGeometry(FACE.skullR, S.skull[0], S.skull[1]).scale(...FACE.skullScale).translate(...FACE.skull);
    out.push({ geo: skull, region: 'head' });
    const hooded = acc.some((a) => HOODED.includes(a.id));
    const cheekR = FACE.cheekR * (cfg.fur?.cheek ?? (hooded ? HOOD_CHEEK.r : 1)), cheekLen = hooded ? HOOD_CHEEK.len : 1;
    const cx = FACE.cheek[0] * (hooded ? HOOD_CHEEK.x : 1);
    for (const s of [1, -1]) out.push({ geo: new THREE.SphereGeometry(cheekR, S.cheek[0], S.cheek[1]).scale(...FACE.cheekScale).translate(s * cx, FACE.cheek[1], FACE.cheek[2]), region: 'cheek', len: cheekLen });
    for (const s of [1, -1]) out.push({ geo: new THREE.SphereGeometry(0.042, S.pad[0], S.pad[1]).translate(s * FACE.pad[0], FACE.pad[1], FACE.pad[2]), region: 'muzzle' });
    out.push({ geo: new THREE.SphereGeometry(0.034, S.chin[0], S.chin[1]).translate(...FACE.chin), region: 'muzzle' });
    return out;
  }

  /** Vertex-coloured eyes for the lite tier, skinned to eyeL / eyeR (blink = bone scale). */
  _liteEyes(A, posL, posR, r, colors) {
    for (const [pos, side, bone] of [[posL, 1, 'eyeL'], [posR, -1, 'eyeR']]) {
      const c = side > 0 ? (colors.L || colors) : (colors.R || colors);
      const inner = rgb(c.inner ?? PAL.irisInner), outer = rgb(c.outer ?? PAL.irisOuter), ring = rgb(c.ring ?? PAL.irisRing), pupil = rgb(c.pupil ?? PAL.pupil);
      // TT3: the named kittens' finer face also rounds their vertex-coloured catchlights (they read blocky)
      const ed = Math.min(1.3, this.cfg.faceDetail ?? 1);
      const g = new THREE.SphereGeometry(r, Math.round(24 * ed), Math.round(18 * ed));
      const pm = eyePivotMatrix([0, 0, 0], side, 0.3);
      const toBone = new THREE.Matrix4().makeTranslation(pos[0] - FACE[bone][0], pos[1] - FACE[bone][1], pos[2] - FACE[bone][2]).multiply(pm).multiply(mat([0, 0, 0], [0, 0, 0], [1, 1, EYE.flat]));
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

  /**
   * Ears (art.md §2.2): cupped cones with a thick rounded rim. The pink inner bowl fades into a cream fringe and the
   * coat colour by vertex gradient (no separate inner panel, so no hard edge), and on full-detail kittens the backs
   * and rims are shell fur (skinned to the ear joints, so twitches carry the fur) that softens the silhouette.
   */
  _ears(A, cfg, bind, boneIndex, earS) {
    const coat = this.coat, lite = this.lite;
    const pink = rgb(cfg.earInner ?? PAL.earInner), cream = rgb(coat.cream || coat.light || coat.base), light = rgb(coat.light || coat.base);
    const { geo, front, t, cup } = earGeometry(0.07 * earS, 0.118 * earS, { depth: 0.6, cup: 0.78, radial: lite ? 16 : segScale(28, this.detail, 16), rows: lite ? 9 : segScale(14, this.detail, 9) });
    const color = (v, n, lp, i) => {
      let c = mixRgb(coatColor(coat, 'ear', lp), light, smoothstep(0.02, 0.12, lp.y) * 0.25);
      // cream furnishings on the front rim, fading back into the coat around the sides
      c = mixRgb(c, cream, smoothstep(-0.05, 0.45, front[i]) * 0.55 * (1 - smoothstep(0.8, 1.0, t[i])));
      // pink skin deep in the bowl, paling toward the tip and the rim
      const pk = smoothstep(0.18, 0.62, cup[i]) * (1 - smoothstep(0.55, 0.9, t[i]));
      return mixRgb(c, mixRgb(pink, cream, smoothstep(0.35, 0.8, t[i]) * 0.5), pk);
    };
    const rm = (v, n, lp, i) => (cup[i] > 0.4 ? RM.skin : RM.furShort);
    for (const s of ['L', 'R']) {
      const bone = 'ear' + s, m = _m.multiplyMatrices(bind[bone], mat([0, -0.02, 0])).clone();
      if (lite || !this._skinFurGB) { A.add(bone, geo, { m: mat([0, -0.02, 0]), color, rmse: rm }); continue; }
      // comb toward the ear tip (bind space), with a lean out of the bowl on the rim
      const up = new THREE.Vector3(0, 1, 0).transformDirection(bind[bone]), fwd = new THREE.Vector3(0, 0, 1).transformDirection(bind[bone]);
      this._skinFurGB.add(geo, {
        matrix: m, bone: boneIndex[bone], color, rmse: rm,
        // short fur on the back, a slightly longer fringe on the rim, none in the bowl; thinning at the very tip
        fur: (v, n, lp, i) => [(1 - smoothstep(0.12, 0.45, cup[i])) * (1 - 0.5 * smoothstep(0.85, 1.0, t[i])), 0.42 + 0.22 * smoothstep(-0.1, 0.4, front[i])],
        comb: (v, n, lp, i) => { const k = smoothstep(0, 0.5, front[i]) * 0.35; return [up.x - fwd.x * k, up.y - fwd.y * k, up.z - fwd.z * k]; },
      });
    }
  }

  /**
   * Tuft cards (ART_WARM_SPEC §6.2, D16: the fluffy silhouette from above): each tuft is a CROSSED PAIR of quads (4 tris),
   * rigid on one bone, tilted `TUFTS.tilt` toward world-up so it reads from 50° above. Hero 32 tufts (cheek ruff 2×6,
   * crown 3, inner ear 2×3, bib 5, tail tip 6), other cats 20; one skinned draw, zero CPU per frame.
   */
  _tufts(gb, bind, idx, earS) {
    const root = rgb(this.coat.cream ?? PAL.tuftRoot), tip = rgb(this.cfg.tuftTip ?? PAL.tuftTip);
    const baseC = rgb(this.coat.base);
    const rnd = mulberry32(hashString(this.cfg.id || 'kitten'));
    const T = TUFTS, N = this.tier === 'hero' ? T.hero : T.other;
    const up = new THREE.Vector3(0, 1, 0);
    let cards = 0;
    const tuft = (bone, at, dir, [w, h], c0, c1) => {
      // direction in bone space → bind space, tilted toward world up by T.tilt, back to bone space
      const bq = _q.setFromRotationMatrix(_m2.extractRotation(bind[bone]));
      const d = _v.set(dir[0], dir[1], dir[2]).normalize().applyQuaternion(bq);
      const ang = d.angleTo(up), tilt = Math.min(T.tilt, ang);
      if (ang > 1e-4) d.applyAxisAngle(_v2.crossVectors(d, up).normalize(), tilt);
      d.applyQuaternion(bq.invert());
      const yAx = d.clone(), side = new THREE.Vector3(1, 0, 0);
      if (Math.abs(yAx.dot(side)) > 0.9) side.set(0, 0, 1);
      const zAx = new THREE.Vector3().crossVectors(side, yAx).normalize(), xAx = new THREE.Vector3().crossVectors(yAx, zAx);
      for (const twist of [0, Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(w, h, 1, 1).translate(0, h / 2, 0).rotateY(twist + (rnd() - 0.5) * 0.4);
        const m = new THREE.Matrix4().makeBasis(xAx, yAx, zAx).setPosition(at[0], at[1], at[2]);
        gb.add(g, { matrix: _m.multiplyMatrices(bind[bone], m).clone(), bone: idx[bone], color: (v, n, lp) => mixRgb(c0, c1, smoothstep(0, h, lp.y)), rmse: RM.fur });
        g.dispose();
      }
      cards++;
    };
    const S = T.size;
    // cheek ruff edge: the wide face from above
    for (const s of [1, -1]) for (let i = 0; i < N.cheek; i++) {
      const a = -0.85 + (i / Math.max(1, N.cheek - 1)) * 1.3 + (rnd() - 0.5) * 0.1;
      tuft('head', [s * (0.11 + 0.06 * Math.cos(a)), 0.08 + 0.06 * Math.sin(a), 0.04 + rnd() * 0.02], [s * Math.cos(a), Math.sin(a) * 0.9 - 0.1, 0.2],
        S.cheek, mixRgb(baseC, root, 0.3 + 0.5 * (i / N.cheek)), mixRgb(baseC, tip, 0.45));
    }
    // crown cowlick
    for (let i = 0; i < N.crown; i++) tuft('head', [(i - (N.crown - 1) / 2) * 0.035, 0.29, 0.01], [(i - (N.crown - 1) / 2) * 0.5, 1, -0.35], S.crown, baseC, mixRgb(baseC, tip, 0.35));
    // inner ear (cream)
    for (const bone of ['earL', 'earR']) for (let i = 0; i < N.ear; i++) {
      const x = (i - (N.ear - 1) / 2) * 0.014 * earS;
      tuft(bone, [x, 0.012 + rnd() * 0.012, 0.014], [x * 4, 1, 0.5], S.ear.map((v) => v * earS), root, tip);
    }
    // bib spilling over the breastplate
    for (let i = 0; i < N.bib; i++) {
      const x = (i - (N.bib - 1) / 2) * 0.028;
      tuft('chest', [x, 0.2 + rnd() * 0.02, 0.1 - Math.abs(x) * 0.2], [x * 2, -0.6, 1], S.bib, root, tip);
    }
    // tail tip (cream), in tail5's frame
    const tipP = this.tailCurve.getPointAt(1), inv = _m2.copy(bind.tail5).invert();
    const tl = tipP.clone().applyMatrix4(inv);
    for (let i = 0; i < N.tail; i++) {
      const a = (i / N.tail) * TAU;
      tuft('tail5', [tl.x, tl.y, tl.z], [Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6 - 0.3], S.tail, mixRgb(baseC, root, 0.6), tip);
    }
    this._tuftCards = cards;
  }
  /** (M1 wisp cards, kept for reference tools: `cfg.tuftsLegacy`.) */
  _tuftsLegacy(gb, bind, idx, earS) {
    const root = rgb(this.coat.cream ?? PAL.tuftRoot), tip = rgb(this.cfg.tuftTip ?? PAL.tuftTip);
    const baseC = rgb(this.coat.base);
    const rnd = mulberry32(hashString(this.cfg.id || 'kitten'));
    // cards face mostly forward (+Z, where the camera usually is) with a random twist, so they read broad-side
    // cards are tapered toward the tip and bend along their length (curl: sideways, bend: out of the card plane),
    // so a few of them read as soft curved wisps rather than straight comb teeth
    const card = (bone, at, dir, len, wid, color0 = root, color1 = tip, twist = 0.6, curl = (rnd() - 0.5) * 0.5, bend = 0.25 + rnd() * 0.25) => {
      const g = new THREE.PlaneGeometry(wid, len, 1, 6).translate(0, len / 2, 0);
      const gp = g.attributes.position;
      for (let i = 0; i < gp.count; i++) {
        const u = clamp(gp.getY(i) / len, 0, 1);   // (the bottom row can come out as -1e-17: pow() would NaN)
        gp.setX(i, gp.getX(i) * (1 - 0.6 * Math.pow(u, 1.3)) + curl * len * u * u);
        gp.setZ(i, bend * len * u * u);
      }
      g.computeVertexNormals();
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
    // (soft wisps fanning out of the inner ear; short enough that the ear's outline and pink inner still read)
    const earTip = mixRgb(tip, root, 0.25);
    for (const [s, bone] of [[1, 'earL'], [-1, 'earR']]) {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 0.012 * earS;
        // fan out of the bowl and curl outward over the rim
        card(bone, [x, 0.008 + rnd() * 0.016, 0.012], [x * 4.5 - s * 0.06, 1, 0.45 + rnd() * 0.25], (0.045 + rnd() * 0.03) * earS, 0.03, root, earTip, 0.6, (i - 1.5) * 0.35 + (rnd() - 0.5) * 0.2, 0.35 + rnd() * 0.25);
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
    const w = this.w, lite = this.lite, sg = (n) => segScale(n, this.detail, 6);
    // bib (chest space): the cream ruff between the pauldrons
    const bibGeo = new THREE.SphereGeometry(0.1, lite ? 16 : sg(28), lite ? 12 : sg(20)).scale(1.05 * w, 0.75, 0.8).translate(0, 0.215, 0.045);
    const bodyGeo = new THREE.SphereGeometry(0.16, lite ? 20 : sg(36), lite ? 14 : sg(24)).scale(1.0 * w, 1.25, 0.92).translate(0, 0.0, 0.0);
    const bellyColor = (v, n, lp) => coatColor(this.coat, 'body', _v.copy(lp).applyMatrix4(bind.chest));
    if (lite) {
      A.add('chest', bibGeo, { color: (v, n, lp) => coatColor(this.coat, 'bib', lp), rmse: RM.fur });
      if (!armour) A.add('chest', bodyGeo, { color: bellyColor, rmse: RM.fur });
    } else {
      const gb = new GeoBuilder({ fur: true });
      gb.add(bibGeo, { color: (v, n, lp) => coatColor(this.coat, 'bib', lp), rmse: RM.fur, fur: (v, n, lp) => [smoothstep(-0.02, 0.06, lp.z) * smoothstep(0.15, 0.2, lp.y), 0.8], comb: [0, -0.45, 0.85] });
      if (!armour && !clothed) gb.add(bodyGeo, { color: bellyColor, rmse: RM.fur, fur: [1, 0.9], comb: [0, -1, -0.3] });
      this.bibFur = new FurPart(gb.build(), { furMat: this.furMat, sheenMat: this.kitMatInst, tier: this.furTier, name: 'furBib', owner: this });
      this.bibFur.mesh.renderOrder = FUR_RENDER_ORDER - 0.4; // under the chin: draw before the head shells blend over it
      this.rig.chest.add(this.bibFur.mesh);
      if (!armour && clothed) A.add('chest', bodyGeo, { color: bellyColor, rmse: RM.fur });
    }
    // TT3 `softBelly` (the Token Tails Cat, no clothes): a soft rounded tummy over the chest / hips / thigh seams
    if (this.cfg.softBelly && !armour && !clothed) A.add('hips', new THREE.SphereGeometry(0.16, sg(26), sg(18)).scale(1.04 * w, 1.12, 1.0), { m: mat([0, 0.05, 0.012]), color: coatRoot('body'), rmse: RM.fur });
    // lower torso / belly on the hips
    A.add('hips', new THREE.SphereGeometry(0.15, sg(24), sg(16)).scale(1.0 * w, 0.9, 0.95), { m: mat([0, 0.02, 0]), color: coatRoot('body'), rmse: RM.fur });
    // arms and paws
    for (const s of ['L', 'R']) {
      A.add('shoulder' + s, new THREE.CapsuleGeometry(0.045, 0.07, 4, sg(12)), { m: mat([0, -0.055, 0]), color: coatRoot('leg'), rmse: RM.fur });
      A.add('elbow' + s, new THREE.CapsuleGeometry(0.042, 0.07, 4, sg(12)), { m: mat([0, -0.05, 0]), color: coatRoot('leg'), rmse: RM.fur });
      if (!armour) {
        A.add('paw' + s, new THREE.SphereGeometry(0.047, sg(18), sg(14)).scale(1, 0.85, 1.05), { m: mat([0, -0.035, 0.006]), color: coatRoot('paw'), rmse: RM.fur });
        for (let t = 0; t < 3; t++) A.add('paw' + s, new THREE.SphereGeometry(0.0085, 8, 6), { m: mat([(t - 1) * 0.017, -0.068, 0.03]), color: rgb('#E7A3A8'), rmse: RM.skin });
      }
    }
    // legs and feet
    for (const s of ['L', 'R']) {
      A.add('thigh' + s, new THREE.CapsuleGeometry(0.052, 0.05, 4, sg(12)), { m: mat([0, -0.04, 0]), color: coatRoot('leg'), rmse: RM.fur });
      A.add('knee' + s, new THREE.CapsuleGeometry(0.045, 0.06, 4, sg(12)), { m: mat([0, -0.05, 0]), color: coatRoot('leg'), rmse: RM.fur });
      if (!armour) {
        A.add('foot' + s, new THREE.SphereGeometry(1, sg(18), sg(10), 0, Math.PI * 2, 0, Math.PI / 2).scale(0.052, 0.05, 0.07), { m: mat([0, -0.03, 0.025]), color: coatRoot('paw'), rmse: RM.fur });
        A.add('foot' + s, new THREE.CircleGeometry(0.045, 16).rotateX(Math.PI / 2).scale(1, 1, 1.35), { m: mat([0, -0.0295, 0.025]), color: rgb('#C98A90'), rmse: RM.skin });
      }
    }
  }

  /** Tail: tapered tube along the rest curve (art.md §2.4), smooth-skinned to the 6 tail joints. */
  _tail(A, kit, bind, boneIndex) {
    const curve = this.tailCurve, tub = this.lite ? 20 : segScale(24, this.detail, 14), rad = this.lite ? 8 : segScale(10, this.detail, 7);
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
      const gb = this._skinFurGB;
      gb.add(tg, { color: (v, n, lp, i) => colorT(lp, tArr[i], under[i]), rmse: RM.fur, fur: (v, n, lp, i) => [1, 1.75 * (1 - 0.3 * tArr[i])], skin: (v, lp, i) => skinFor(tArr[i]), comb: [0.3, -0.6, -0.6] });
      gb.add(cap, { color: (v, n, lp) => colorT(lp, 1, 0), rmse: RM.fur, fur: [1, 1.3], skin: () => skinFor(1), comb: [0.6, 0, 0.2] });
      this.tailFurGeo = gb.build(); this._skinFurGB = null;
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
    this.whiskerMesh = ls;
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

  /**
   * The pose actually shown for `name`: 'idle' becomes `cfg.idlePose` (Swordcat: 'restUp', the blade upright at her
   * side for iso readability) while the sword is shorter than IDLE_REST_MAX_LEN (long skins keep the cane idle: the
   * player drags their tip on the ground).
   * @param {string} name
   */
  poseKey(name) {
    const alt = this.cfg.idlePose;
    if (name === 'idle' && alt && POSES[alt] && (this.sword?.length ?? 1) < IDLE_REST_MAX_LEN) return alt;
    return name;
  }

  /** Compute (and cache) the joint snapshot for a pose name. */
  poseSnapshot(name) {
    name = this.poseKey(name);
    if (this._snapshots.has(name)) return this._snapshots.get(name);
    const P = POSES[name] || POSES.idle;
    const q = {}, p = {};
    const drop = this.bodyDrop || 0;   // root-space targets follow the shorter torso (PROPORTIONS)
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
    if (SW && drop) SW.elements[13] += drop;   // (a fresh matrix per call: swordMatrix allocates its default out)
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
      if (arm.paw) target.y += drop;
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
  /**
   * Emotes (GAME_DESIGN §19.4): 'earsFlat' | 'tailPuff' | 'blink' | 'nod' | 'shake' | 'meow' | 'sneeze' | 'bowBounce',
   * plus M2 'wave' (1.2 s paw wave; the 'wave' pose waves continuously) and 'throw' (0.5 s overarm lob for the Spoon
   * Brigade, §9.3; the spoon leaves the paw at EMOTE_RELEASE.throw of the way through).
   */
  emote(name) {
    switch (name) {
      case 'earsFlat': this.emotes.earsFlat = 0.45; break;
      case 'tailPuff': this.emotes.tailPuff = 1.0; break;
      case 'blink': this.eyes?.blink(); this._liteBlink = 0.14; break;
      case 'nod': this.emotes.nod = 0.6; break;
      case 'shake': this.emotes.shake = 0.7; break;
      case 'meow': this.emotes.meow = 0.6; this.squash.kick(SQUASH.happyKick); break;
      case 'sneeze': this.emotes.sneeze = 0.5; break;
      case 'bowBounce': this.bow?.userData.bounce(1); break;
      case 'wave': this.emotes.wave = EMOTE_DUR.wave; break;
      case 'throw': this.emotes.throw = EMOTE_DUR.throw; break;
      case 'groom': this.emotes.groom = EMOTE_DUR.groom; break;
      case 'twirl': this.emotes.twirl = EMOTE_DUR.twirl; break;
      case 'boop': this.emotes.boop = EMOTE_DUR.boop; break;
      case 'pawBump': this.emotes.pawBump = EMOTE_DUR.pawBump; break;
      case 'cheer': this.emotes.cheer = EMOTE_DUR.cheer; this.squash.kick(SQUASH.happyKick); break;
      default: break;
    }
    return this;
  }
  /** Bow visibility (Clementine has no bow until CS-01 shot 5). Never call with false after that: hard rule. */
  setBowVisible(on) { if (this.bow) this.bow.visible = on; this._proxyDirty = true; return this; }

  /** Equip a sword skin (or null). `o.model` for GLB skins (diamond / toobig). */
  setSword(skin, o = {}) {
    if (this.sword) { this.sword.group.removeFromParent(); this.sword.dispose(); this.sword = null; }
    this._proxyDirty = true;
    if (!skin) return this;
    this.sword = buildSword(typeof skin === 'string' ? skin : skin.skin, { detail: this.detail, ...(typeof skin === 'object' ? { ...skin, ...o } : o) });
    if (this.cfg.swordScale) this.sword.group.scale.setScalar(this.cfg.swordScale);
    this.rig.sword = this.sword.group;
    if (this._to) this._swordPose(this._to.sword, 0);
    else this.rig.swordSocket.add(this.sword.group);
    if (this.holy) this.sword.setCharge(this.holy);
    if (this.rimFloor) this.sword.group.traverse((o) => { if (o.material) this._rimFloorOn(o.material); });
    // a longer / shorter skin can switch the idle variant (poseKey): re-apply the held idle
    if (this.poseName === 'idle' && this.cfg.idlePose && this._to?.name !== this.poseKey('idle')) this.setPose('idle', { blend: 0, expression: false });
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
      this.cape = new HeroCape({ style, rig: this.rig, root: this.root, dims: this._capeDims(), closeUp: this.closeUp });
      this.cape.mesh.castShadow = false;   // H3: the cape never casts
      this.root.add(this.cape.mesh);
      if (this.activity >= 1) { this.cape.setMode('sway', { blend: 1e-3 }); this.cape.pauseSim(true); }
    } else {
      if (this.swayCape) { this.swayCape.material = capeMaterial(style, { sway: true }); this.capeStyle = style; return this; }
      if (this.cape) this.setCape(null);
      const toChest = new THREE.Matrix4().copy(this.rig.chestBind).invert();
      this.swayCape = buildSwayCape(style, this._capeDims(), toChest);
      this.swayCape.castShadow = false;
      this.rig.chest.add(this.swayCape);
    }
    this.capeStyle = style;
    return this;
  }
  /** Cape dims with the neckline following the torso height (PROPORTIONS: the shorter body lowers the shoulders). */
  _capeDims() {
    const d = this.cfg.capeDims || {};
    return this.bodyDrop ? { ...d, anchorY: (d.anchorY ?? CAPE_DEFAULTS.anchorY) + this.bodyDrop } : d;
  }
  /** Photo Cam: cross-fade the hero cape to the looping sway (GAME_DESIGN §7.8) and back. */
  setCapeMode(mode, o) {
    this._capeMode = mode;
    // an off-screen cat (activity ≥ 1) keeps the shader sway; the requested mode applies when it comes back
    if (this.activity === 0 || mode === 'sway') this.cape?.setMode(mode, o);
    return this;
  }

  /**
   * Show / hide a procedural prop ('milk_cup', 'lantern', 'spoon', 'letter', 'pot_helm', 'helmet', ...). The mount
   * variant comes from opts.at or a 'name@at' suffix, so the plain ScriptedActor `prop(name, on)` reaches it too:
   * 'letter@belt' (CS-06), 'helmet@paw' (CS-01: she takes the helm off and looks at it). One object per base name.
   */
  setProp(name, on = true, opts = {}) {
    const cut = name.indexOf('@');
    if (cut > 0) { opts = { ...opts, at: opts.at ?? name.slice(cut + 1) }; name = name.slice(0, cut); }
    this._proxyDirty = true;
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
  /**
   * A cat on the shared per-kind kit materials gets its own pair first (same GPU program: no compile), so a hover rim
   * or a hurt flash on one villager never lights every villager.
   */
  _ownKitMaterials() {
    if (!isSharedKit(this.kitMat)) return;
    const m = makeKitMaterial({ kind: 'skinned' });
    const mi = makeToonMaterial({ kind: 'instanced', uniforms: m.userData.uniforms });
    this.kitMat = m; this.kitMatInst = mi; this.kitMesh.material = m;
    if (this.eyes) for (const em of [this.eyes.upMesh, this.eyes.loMesh, this.eyes.browMesh]) if (em) em.material = mi;
    for (const f of [this.headFur, this.bibFur, this.tailFur]) {
      if (!f) continue;
      const nm = f.mesh.isInstancedMesh ? mi : m;
      if (f.mesh.material === f.sheenMat) f.mesh.material = nm;
      f.sheenMat = nm;
    }
  }
  /**
   * Hover / selection rim (research/CONTROLS_SPEC.md §7.4): `color` (null clears) x `strength`, on the kit body and the
   * shell fur. A cat on the shared kit material gets its own clone first (same GPU program, no compile).
   * @param {THREE.ColorRepresentation|null} color @param {number} [strength=1]
   */
  setHighlight(color, strength = 1) {
    const on = color !== null && color !== undefined && strength > 0;
    if (!on && !this.highlight) return this;
    if (on) this._ownKitMaterials();
    const c = this.kitMat.userData.uniforms?.uHighlight?.value;
    if (c) { if (on) c.set(color).multiplyScalar(HIGHLIGHT.gain * strength); else c.setRGB(0, 0, 0); }
    for (const fm of [this.furMat, this.furMatBaked]) {
      const u = fm?.uniforms?.uHighlight;
      if (u && c) { u.value.copy(c); fm.uniformsNeedUpdate = true; }
    }
    this.highlight = on ? { color, strength } : null;
    return this;
  }

  /**
   * The x-ray silhouette proxy (research/CONTROLS_SPEC.md §3): one merged skinned mesh (body ellipsoids per bone, ears,
   * bow, sword, props; no fur, no cape) parented to the root, hidden until the camera shows it. Built on first use and
   * rebuilt in place after a sword / prop / bow change.
   * @returns {THREE.SkinnedMesh | null}
   */
  getSilhouetteProxy() {
    if (this.silhouetteProxy && !this._proxyDirty) return this.silhouetteProxy;
    this._proxyDirty = false;
    this.silhouetteProxy = buildSilhouetteProxy(this.root, { skeleton: this.skeleton, into: this.silhouetteProxy }) ?? this.silhouetteProxy;
    return this.silhouetteProxy;
  }

  /**
   * Warm ink outline hull (ART §5.4, PERF H8): a back-faced skinned hull built from a tight silhouette proxy, extruded a
   * constant `px` in screen space. On / off; built on first use, rebuilt in place after a sword / prop / bow change.
   * @param {boolean} on @param {{ px?: number, color?: THREE.ColorRepresentation }} [o]
   */
  setOutline(on, o = {}) {
    if (on && !this.outline) {
      this.outline = buildOutline(this, { px: o.px ?? OUTLINE.px.hero, color: o.color ?? OUTLINE.hero, skeleton: this.skeleton });
      setHullFur(this.outline, !this.closeUp);
    }
    if (this.outline) {
      this.outline.visible = !!on;
      if (o.px !== undefined) this.outline.material.userData.uniforms.uOutlinePx.value = o.px;
      if (o.color !== undefined) this.outline.material.color.set(o.color);
    }
    return this;
  }
  _rebuildOutline() {
    if (this.outline) { buildOutline(this, { into: this.outline, skeleton: this.skeleton }); setHullFur(this.outline, !this.closeUp); }
  }

  /**
   * Readability from above (CONTROLS_SPEC §12 characters 3): bow x1.25 (its extra self-light is in the bow shader),
   * ears x1.1, at top-view factor `k` (0 = the close-up look). Kitten.simulate applies TOP_VIEW.value every frame.
   * @param {number} k 0..1
   */
  setTopView(k, far = 0) {
    k = clamp(k, 0, 1); far = clamp(far, 0, 1);
    if (k === this._topK && far === this._topFar) return this;
    this._topK = k; this._topFar = far;
    const ear = 1 + (READABILITY.earScale - 1) * k;
    this.rig.joints.earL.scale.setScalar(ear); this.rig.joints.earR.scale.setScalar(ear);
    // ×1.25 from above, growing to ×1.4 past 12 m (WARM_ADVENTURE_SPEC §3.3)
    const bowK = (1 + (READABILITY.bowScale - 1) * k) * (1 + (READABILITY.bowScaleFar / READABILITY.bowScale - 1) * far);
    if (this.bow) this.bow.scale.setScalar((this._bowBase ?? 1) * bowK / ear);
    return this;
  }

  /** Mesh-wide flash (hurt blink / poof) 0..1. */
  setFlash(v) {
    if (v > 0) this._ownKitMaterials();
    if (!isSharedKit(this.kitMat)) this.kitMat.userData.uniforms.uFlash.value = v * 0.6;
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
      J.chest.quaternion.multiply(Es(br * 0.012, 0, 0));
      J.head.quaternion.multiply(Es(-br * 0.008 + Math.sin(t * 0.7) * 0.01, Math.sin(t * 0.43) * 0.02, Math.sin(t * 0.37) * 0.015));
      for (let i = 0; i < 6; i++) J[TAIL_NAMES[i]].quaternion.multiply(Es(0, Math.sin(t * 1.3 - i * 0.55) * (lying ? 0.03 : 0.07) * (0.5 + i * 0.12), 0));
      this.earTwitch.next -= dt;
      if (this.earTwitch.next <= 0) { this.earTwitch[this.rnd() < 0.5 ? 'L' : 'R'] = 0.18; this.earTwitch.next = 2.5 + this.rnd() * 5; }
    }
    for (const s of ['L', 'R']) {
      if (this.earTwitch[s] > 0) this.earTwitch[s] = Math.max(0, this.earTwitch[s] - dt);
      const tw = this.earTwitch[s] > 0 ? Math.sin((this.earTwitch[s] / 0.18) * Math.PI) * 0.35 : 0;
      const flat = em.earsFlat > 0 ? Math.min(1, em.earsFlat / 0.1) : 0;
      const sign = s === 'L' ? -1 : 1;
      J[s === 'L' ? 'earL' : 'earR'].quaternion.multiply(Es(-0.7 * flat + this._earMood * 0.8 - tw * 0.3, 0, sign * (0.6 * flat - this._earMood * 0.6 + tw)));
    }
    // waving: the 'wave' pose waves on its own; the emote raises the paw and waves whatever the pose
    if (this.poseName === 'wave' || em.wave > 0) {
      const w = Math.sin(t * 9) * 0.35;
      if (this.poseName !== 'wave') {
        const up = Math.min(1, em.wave / 0.15, (EMOTE_DUR.wave - em.wave) / 0.15);
        J.shoulderR.quaternion.multiply(Es(-0.25 * up, 0, -2.3 * up));
      }
      J.shoulderR.quaternion.multiply(Es(0, 0, w * 0.3));
      J.elbowR.quaternion.multiply(Es(w * 0.5, 0, 0));
    }
    // overarm throw: wind up behind the head, snap forward at the release, follow through
    if (em.throw > 0) {
      const k = 1 - em.throw / EMOTE_DUR.throw, rel = EMOTE_RELEASE.throw;
      const back = smoothstep(0, rel, k), fwd = smoothstep(rel, rel + 0.2, k), settle = smoothstep(0.75, 1, k);
      J.shoulderR.quaternion.multiply(Es((-2.8 * back + 2.0 * fwd) * (1 - settle), 0, -0.3 * back * (1 - settle)));
      J.elbowR.quaternion.multiply(Es(-1.2 * back * (1 - fwd), 0, 0));
      J.chest.quaternion.multiply(Es(0.12 * fwd * (1 - settle), (0.35 * back - 0.6 * fwd) * (1 - settle), 0));
    }
    // Phase W procedural emotes (WARM_ADVENTURE_SPEC §5.6): groom, twirl, boop, pawBump, cheer
    this._warmEmotes(J, em);
    // emotes
    if (em.nod > 0) J.head.quaternion.multiply(Es(Math.sin((1 - em.nod / 0.6) * Math.PI * 2) * 0.22, 0, 0));
    if (em.shake > 0) J.head.quaternion.multiply(Es(0, Math.sin((1 - em.shake / 0.7) * Math.PI * 4) * 0.25, 0));
    if (em.sneeze > 0) { const k = Math.sin((1 - em.sneeze / 0.5) * Math.PI); J.head.quaternion.multiply(Es(k * 0.35, 0, 0)); }
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
    // squash & stretch on the body joint, pivot at the feet (ART §6.5): volume-preserving
    const lyingSq = this.poseName === 'faint' || this.poseName === 'sleep';
    const breathe = idle && !lyingSq ? this.breathe * Math.sin(TAU * SQUASH.breatheHz * t) : 0;
    const s = dt > 0 ? this.squash.update(dt, this.squashTarget + breathe) : 1 + this.squash.x;
    this.squashScale = s;
    const xz = 1 / Math.sqrt(s);
    J.body.scale.set(xz, s, xz);
    return this;
  }

  /**
   * Phase W procedural emotes on the existing rig (WARM_ADVENTURE_SPEC §5.6; no clips, no draws): `groom` (paw lick,
   * 1.4 s), `twirl` (sword spin, 0.6 s), `boop` (nose-boop head tilt 12°, 0.4 s), `pawBump` (0.8 s), `cheer` (0.9 s
   * paws up). Additive on the final joints; scratch math only.
   */
  _warmEmotes(J, em) {
    const D = EMOTE_DUR;
    if (em.groom > 0) {
      const k = 1 - em.groom / D.groom, inOut = Math.min(1, k / 0.15, (1 - k) / 0.15), lick = Math.sin(k * Math.PI * 7) * 0.5 + 0.5;
      J.shoulderL.quaternion.multiply(Es(-1.55 * inOut, 0.2 * inOut, -0.55 * inOut));
      J.elbowL.quaternion.multiply(Es(-1.9 * inOut, 0, 0));
      J.pawL.quaternion.multiply(Es(-0.35 * inOut * lick, 0, 0));
      J.head.quaternion.multiply(Es(0.22 * inOut + 0.06 * lick * inOut, 0.28 * inOut, 0.14 * inOut));
    }
    if (em.twirl > 0) {
      const k = 1 - em.twirl / D.twirl, inOut = Math.min(1, k / 0.12, (1 - k) / 0.12);
      J.shoulderR.quaternion.multiply(Es(-0.9 * inOut, 0, -0.5 * inOut));
      J.pawR.quaternion.multiply(Es(0, k * TAU, 0));                       // the blade spins once around the grip
      J.chest.quaternion.multiply(Es(0, Math.sin(k * Math.PI) * 0.25, 0));
    }
    if (em.boop > 0) {
      const k = 1 - em.boop / D.boop, b = Math.sin(k * Math.PI);
      J.head.quaternion.multiply(Es(0.12 * b, 0, 0.21 * b));                // 12° head tilt into the boop
      J.chest.quaternion.multiply(Es(0.1 * b, 0, 0));
    }
    if (em.pawBump > 0) {
      const k = 1 - em.pawBump / D.pawBump, up = Math.min(1, k / 0.25, (1 - k) / 0.2), tap = k > 0.45 && k < 0.6 ? 1 : 0;
      J.shoulderR.quaternion.multiply(Es(-1.35 * up - 0.12 * tap, 0, -0.25 * up));
      J.elbowR.quaternion.multiply(Es(-0.35 * up, 0, 0));
      J.chest.quaternion.multiply(Es(0.06 * tap, 0, 0));
    }
    if (em.cheer > 0) {
      const k = 1 - em.cheer / D.cheer, up = Math.min(1, k / 0.15, (1 - k) / 0.2), bob = Math.sin(k * Math.PI * 4) * 0.12;
      J.shoulderL.quaternion.multiply(Es(0, 0, (2.4 + bob) * up));
      J.shoulderR.quaternion.multiply(Es(0, 0, -(2.4 + bob) * up));
      J.head.quaternion.multiply(Es(-0.2 * up, 0, 0));
    }
  }

  /**
   * Secondary motion after joints are final for the frame: matrices, cape, fur drag, eyes, bow, prop updates.
   * @param {number} dt
   * @param {{ velocity?: THREE.Vector3, wind?: THREE.Vector3, frameId?: number }} [o]
   */
  simulate(dt, o = {}) {
    // parents first: the actor root may have been teleported / turned this frame (level load, respawn), and the cape
    // pins + colliders read the joints' matrixWorld (requests/player.md: the cloth re-initialised on the wrong side)
    this.setTopView(TOP_VIEW.value, TOP_VIEW.far);
    this.root.updateWorldMatrix(true, true);
    if (this._proxyDirty && (this.silhouetteProxy?.visible || this.outline?.visible)) { this.getSilhouetteProxy(); this._rebuildOutline(); }
    const lite = this.activity >= 1;                  // off-screen: no secondary motion (PERF §4.3)
    if (this.sword && this.sword.skin === 'toobig' && this.sword.group.parent) this._dragTip();
    if (tickFurTime(dt, o.frameId)) { CAPE_TIME.value += dt; envTick(); }
    if (this.furMat && !lite) {
      const vel = o.velocity;
      this.drag.set(vel ? -vel.x * 0.15 : 0, vel ? -vel.y * 0.08 : 0, vel ? -vel.z * 0.15 : 0);
      this.furMat.uniforms.uDrag.value.copy(this.drag); this.furMatBaked.uniforms.uDrag.value.copy(this.drag);
    }
    if (this.eyes) {
      // expressions read stronger from the far iso lens (ART §5.3 `expressionGain`)
      this.eyes.setGain((TOP_VIEW.dist ?? 0) > EYE.gainFrom ? EYE.gain : 1);
      if (!lite) this.eyes.update(dt);
      else if (this.eyes.blinkT > 0) { this.eyes.blinkT = 0; this.eyes.apply(0); }   // TT3: never freeze mid-blink (half-lidded) when animation pauses
    }
    if (!lite) for (const u of this.updaters) u(dt);
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

  /**
   * "Even More Too Big" (GAME_DESIGN §13.4): the 1.6 m claymore's tip drags on the ground (visual only). When a pose
   * would push the tip below her feet, the blade pivots about the crossguard until the tip rests on the ground plane.
   */
  _dragTip(floor = DRAG_TIP_FLOOR) {
    const g = this.sword.group, root = this.root;
    this.sword.tip.getWorldPosition(_dtA); root.worldToLocal(_dtA);
    if (_dtA.y >= floor) return false;
    g.getWorldPosition(_dtO); root.worldToLocal(_dtO);
    if (_dtO.y <= floor + 0.02) return false;                             // lying poses: the guard itself is low
    _dtD.subVectors(_dtA, _dtO);
    const L = _dtD.length(); if (L < 1e-4) return false;
    _dtD.divideScalar(L);
    const want = Math.max(-1, Math.min(1, (floor - _dtO.y) / L));
    const ang = Math.asin(want) - Math.asin(Math.max(-1, Math.min(1, _dtD.y)));
    _dtK.crossVectors(_dtD, _UP);
    if (_dtK.lengthSq() < 1e-8) return false;
    _dtK.transformDirection(root.matrixWorld);                             // root-local axis → world (normalised)
    _dtQ.setFromAxisAngle(_dtK, ang);
    g.parent.getWorldQuaternion(_dtP);
    // local' = P⁻¹ · R · P · local
    g.quaternion.premultiply(_dtP).premultiply(_dtQ).premultiply(_dtP.invert());
    g.updateMatrixWorld(true);
    return true;
  }

  /** animate + simulate. */
  update(dt, o = {}) { this.animate(dt, o); return this.simulate(dt, o); }

  /** Snap secondary motion (cape) after a teleport / cut. */
  snap() { this.cape?.snap(); return this; }

  /**
   * Objects whose shader programs are first needed mid-fight (requests/fx.md + player.md: the first Holy charge /
   * Golden Hour compiled the aura hull, the blade streak and the Dawnblade sparkles on the spot).
   */
  warmObjects() {
    const out = [...(this.auraMeshes || [])];
    if (this.sword) { out.push(this.sword.streak); if (this.sword.sparkles) out.push(this.sword.sparkles); }
    if (this.silhouetteProxy) out.push(this.silhouetteProxy);   // the x-ray program (first occlusion behind a roof)
    return out.filter((o) => o && o.geometry);
  }
  /**
   * Shader warm-up, part 1 (call right before the frame renders): every hidden warm object is shown for this one
   * frame with an empty draw range, so the real renderer (level fog + lights, the composer's render target) builds
   * its program now while nothing is drawn. `warmEnd()` (after the frame) restores them. Returns the count.
   */
  warmBegin() {
    const S = (this._warmSaved ??= []);
    if (S.length) return 0;
    let n = 0;
    for (const o of this.warmObjects()) {
      if (o.visible) continue;
      const g = o.geometry;
      S.push(o, g.drawRange.start, g.drawRange.count, o.frustumCulled);
      g.setDrawRange(0, 0); o.frustumCulled = false; o.visible = true; n++;
    }
    if (n) this.warmups = (this.warmups ?? 0) + 1;
    return n;
  }
  /** Shader warm-up, part 2: restore what warmBegin() changed (idempotent). */
  warmEnd() {
    const S = this._warmSaved;
    if (!S?.length) return;
    for (let i = 0; i < S.length; i += 4) {
      const o = S[i];
      o.geometry.setDrawRange(S[i + 1], S[i + 2]); o.frustumCulled = S[i + 3];
      o.visible = false;
    }
    S.length = 0;
    // the real state may have changed in between (setHoly during the warm frame): re-apply it
    if (this.auraMeshes) for (const m of this.auraMeshes) m.visible = this.holy > 0.01;
    const st = this.sword?.streak;
    if (st) st.visible = st.material.uniforms.uI.value > 0.01;
  }

  /** Draw-call estimate for budgets (meshes that render). */
  drawCalls() { let n = 0; this.root.traverseVisible((c) => { if (c.isMesh || c.isLine) n++; }); return n; }

  dispose() {
    this.warmEnd();
    this.headFur?.dispose(); this.bibFur?.dispose(); this.tailFur?.dispose();
    for (const g of new Set([this.kitMesh.geometry, this._kitGeo, this._playGeo, this._closeSet?.kit])) if (g && g !== _DUMMY) g.dispose();
    if (this.eyes && this._closeSet?.eyes && this._playEyes) {
      const cur = this.eyes.geometries(), other = cur.eye === this._playEyes.eye ? this._closeSet.eyes : this._playEyes;
      for (const g of Object.values(other)) g?.dispose();
    }
    this.tuftMesh?.geometry.dispose();
    this.outline?.userData.dispose?.(); this.outline = null;
    this.cape?.dispose(); this.sword?.dispose(); this.eyes?.dispose();
    this.swayCape?.geometry.dispose();
    this.whiskerMesh?.geometry.dispose();
    this.shadowProxy?.geometry.dispose();
    for (const m of this.auraMeshes || []) m.geometry.dispose();
    disown(this.auraMat); this.auraMat = null;
    disown(this.furMat); disown(this.furMatBaked);
    if (!isSharedKit(this.kitMat)) { disown(this.kitMat); disown(this.kitMatInst); }
    this.silhouetteProxy?.userData.dispose?.(); this.silhouetteProxy = null;
    this.skeleton?.dispose();
    this.root.removeFromParent();
  }
}

const DRAG_TIP_FLOOR = 0.012;
/** Tuft cards (ART §6.2): counts per cluster (hero 32, others 20), sizes [w, h] in H, tilt toward world-up (rad). */
export const TUFTS = Object.freeze({
  tilt: 35 * Math.PI / 180,
  // TT3: no crown or inner-ear cards (they read as stray strands and white hash marks in the ears)
  hero: Object.freeze({ cheek: 6, crown: 0, ear: 0, bib: 5, tail: 6 }),
  other: Object.freeze({ cheek: 4, crown: 0, ear: 0, bib: 3, tail: 3 }),
  size: Object.freeze({ cheek: [0.05, 0.09], crown: [0.04, 0.07], ear: [0.03, 0.08], bib: [0.05, 0.08], tail: [0.05, 0.10] }),
});
/**
 * Emote lengths (s): M2 `wave` / `throw`; Phase W `groom` (paw lick 1.4 s), `twirl` (sword spin 0.6 s), `boop` (0.4 s),
 * `pawBump` (0.8 s), `cheer` (0.9 s) (WARM_ADVENTURE_SPEC §5.6). The throw's release point is a fraction of its length.
 */
export const EMOTE_DUR = Object.freeze({ wave: 1.2, throw: 0.5, groom: 1.4, twirl: 0.6, boop: 0.4, pawBump: 0.8, cheer: 0.9 });
const TAU = Math.PI * 2;
const TAIL_NAMES = Object.freeze(['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5']);
/** Placeholder geometry handed to a temp kitten whose real geometries were stolen (dispose() is a no-op on it). */
const _DUMMY = new THREE.BufferGeometry();

/**
 * Squash & stretch tuning (ART §6.5): spring stiffness / damping, the clamp on x, the idle breathing (amplitude 0.025 at
 * 0.45 Hz), and the event table the player drives (targets and kicks; hero gait 0.04, kittens 0.06).
 */
export const SQUASH = Object.freeze({
  k: 320, c: 16, clamp: 0.35, breathe: 0.025, breatheHz: 0.45,
  gait: 0.04, gaitKitten: 0.06, jumpPre: -0.15, jumpPreT: 0.06, jumpKick: 3.5, landKick: -2.5, landRef: 6,
  windup: -0.08, release: 1.5, holy: -0.10, holyShiver: 0.01, holyHz: 9, hitKick: -2.0, tumble: -0.2, happyKick: 2.0,
});

/**
 * Volume-preserving squash spring (ART §6.5): `x` around a target; the body joint gets scale.y = 1 + x and
 * scale.x = scale.z = 1/√(1 + x). Plain numbers, no allocation.
 */
export class Squash {
  constructor(k = SQUASH.k, c = SQUASH.c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  /** @param {number} dv velocity kick: negative = squash, positive = stretch */
  kick(dv) { this.v += dv; }
  /** @param {number} dt @param {number} [target] @returns {number} the y scale (1 + x) */
  update(dt, target = 0) {
    // semi-implicit Euler in ≤ 1/120 s sub-steps: stable for long frames (a 0.3 s hitch never explodes the spring)
    const n = Math.min(64, Math.max(1, Math.ceil(dt * 120))), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h; this.x += this.v * h;
      if (this.x > SQUASH.clamp) { this.x = SQUASH.clamp; if (this.v > 0) this.v = 0; }
      else if (this.x < -SQUASH.clamp) { this.x = -SQUASH.clamp; if (this.v < 0) this.v = 0; }
    }
    return 1 + this.x;
  }
  reset() { this.x = 0; this.v = 0; }
}

/**
 * Merge skinned / rigid geometries into one skinned geometry (position, normal, uv, color, rmse, skinIndex, skinWeight).
 * Rigid parts give `m` (bind matrix of their bone) + `bone` (index); skinned parts carry their own skin attributes.
 * @param {{ g: THREE.BufferGeometry, m?: THREE.Matrix4, bone?: number }[]} parts
 */
export function mergeSkinnedParts(parts) {
  let vc = 0, ic = 0;
  for (const p of parts) { vc += p.g.attributes.position.count; ic += p.g.index ? p.g.index.count : p.g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), col = new Float32Array(vc * 3);
  const rm = new Float32Array(vc * 4), si = new Uint16Array(vc * 4), sw = new Float32Array(vc * 4);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  const nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const p of parts) {
    const A = p.g.attributes, n = A.position.count;
    if (p.m) nm.getNormalMatrix(p.m);
    for (let i = 0; i < n; i++) {
      const o3 = (vo + i) * 3, o4 = (vo + i) * 4;
      v.fromBufferAttribute(A.position, i); if (p.m) v.applyMatrix4(p.m); pos[o3] = v.x; pos[o3 + 1] = v.y; pos[o3 + 2] = v.z;
      if (A.normal) { v.fromBufferAttribute(A.normal, i); if (p.m) v.applyMatrix3(nm).normalize(); nrm[o3] = v.x; nrm[o3 + 1] = v.y; nrm[o3 + 2] = v.z; }
      if (A.uv) { uv[(vo + i) * 2] = A.uv.getX(i); uv[(vo + i) * 2 + 1] = A.uv.getY(i); }
      if (A.color) { col[o3] = A.color.getX(i); col[o3 + 1] = A.color.getY(i); col[o3 + 2] = A.color.getZ(i); } else col.fill(1, o3, o3 + 3);
      if (A.rmse) { rm[o4] = A.rmse.getX(i); rm[o4 + 1] = A.rmse.getY(i); rm[o4 + 2] = A.rmse.getZ(i); rm[o4 + 3] = A.rmse.getW(i); } else rm[o4] = 0.8;
      if (p.m || !A.skinIndex) { si[o4] = p.bone ?? 0; sw[o4] = 1; }
      else for (let k = 0; k < 4; k++) { si[o4 + k] = A.skinIndex.getComponent(i, k); sw[o4 + k] = A.skinWeight.getComponent(i, k); }
    }
    if (p.g.index) { const I = p.g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('rmse', new THREE.BufferAttribute(rm, 4));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
export const EMOTE_RELEASE = Object.freeze({ throw: 0.42 });
const _dtA = new THREE.Vector3(), _dtO = new THREE.Vector3(), _dtD = new THREE.Vector3(), _dtK = new THREE.Vector3();
const _dtQ = new THREE.Quaternion(), _dtP = new THREE.Quaternion(), _UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ shared small materials

const _whiskerMats = new Map();
function whiskerMaterial(color) {
  // PERF §1.2: the unlit fx basic module (lines too), not a LineBasic program
  if (!_whiskerMats.has(color)) _whiskerMats.set(color, own(fxBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false })));
  return _whiskerMats.get(color);
}
let _shadowOnly = null;
/** Invisible in the colour pass, still rendered into shadow maps (three uses its depth material there). */
/**
 * The shadow proxy's material. The proxy lives on core's SHADOW_ONLY_LAYER (never drawn in a colour pass), but
 * `renderer.compile` still links a program for every material in the scene: so it borrows the shared skinned kit
 * toon material, whose program the body already uses (PERF §1.2: 0 extra programs; was a Basic program of its own).
 */
function shadowOnlyMaterial() { return _shadowOnly || (_shadowOnly = kitMaterial('skinned')); }
let _auraMat = null;
const AURA_VERT = /* glsl */`uniform float uExpand; varying vec3 vN, vV;
      void main(){ vec4 wp = modelMatrix * vec4(position + normal * uExpand, 1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`;
const AURA_FRAG = /* glsl */`uniform vec3 uColor; uniform float uI; varying vec3 vN, vV;
      void main(){ float f = pow(abs(dot(normalize(vN), vV)), 3.0); gl_FragColor = vec4(uColor * f * uI * 0.55, 1.0); }`;
// linked into the one fx program at import, before anything compiles (PERF §1.2)
fxModule({ name: 'aura', side: THREE.BackSide, fog: false, vertexShader: AURA_VERT, fragmentShader: AURA_FRAG });
function auraMaterial() {
  if (_auraMat) return _auraMat;
  // one module of the linked fx program (PERF §1.2): BackSide is a front-face discard inside it
  _auraMat = own(fxShaderMaterial({
    name: 'aura', side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new THREE.Color(PAL.holyRim) }, uI: { value: 0 }, uExpand: { value: 0.0 } },
    vertexShader: AURA_VERT, fragmentShader: AURA_FRAG,
  }));
  return _auraMat;
}
