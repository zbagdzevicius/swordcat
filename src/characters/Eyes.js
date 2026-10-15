// Big shiny eyes (research/art.md §2.5; research/next/ART_WARM_SPEC.md §5.3): an UNLIT iris CanvasTexture (big round
// pupil, three catchlights, optional cream sclera ring), planar front UVs. The pair is ONE instanced draw; the upper
// lids + lash lines are a second (coat-coloured, the cat's own instanced WarmToon: no extra program), brows a third,
// lower lids a fourth only while an expression closes them. Expressions read 1.4× stronger from the far iso lens.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { canvas2d, Spring, damp, mulberry32, hashString, charDetail, segScale, GeoBuilder, rgb } from './util.js';
import { own } from './materials.js';
import { fxBasicMaterial } from '../fx/shaders.js';

/**
 * Eye look (ART §5.3): pupil radius (of 256) per kind, catchlights (upper-left ellipse, lower-right dot, top sparkle),
 * sclera ring colour + width, lash line radius (H) + outer wing, brow capsule (H), the far-lens expression gain.
 */
export const EYE = Object.freeze({
  pupil: { hero: 80, kitten: 92, enemy: 54, default: 80 },
  catch: { a: [90, 86, 34, 26], b: [162, 172, 14], sparkle: [150, 70, 7] },
  sclera: '#F6EFE4', scleraW: 30,
  lashR: 0.008, lashWing: 0.012,
  brow: { len: 0.05, thick: 0.012, gap: 0.42, rise: 1.45 },
  gain: 1.4, gainFrom: 8,
  /** Cat eyes (TT3): lens depth (× r) and the extra sink under the skull surface (H), so no eye passes the head outline in profile. */
  flat: 0.45, seat: 0.004,
});

const _texCache = new Map();
/**
 * Iris texture (cached by its options). Enemies use `slit: true` and an amber/red iris; `sclera: true` adds the cream
 * ring (enemies and grown-ups; kittens keep the all-iris button eye).
 * `catchlights: 2` keeps the two big catchlights only (no top sparkle: the Token Tails mascot's eye).
 * @param {{inner?:string, outer?:string, ring?:string, pupil?:string, slit?:boolean, pupilR?:number, sclera?:boolean|string, catchlights?:number}} o
 */
export function makeEyeTexture(o = {}) {
  const inner = o.inner ?? PAL.irisInner, outer = o.outer ?? PAL.irisOuter, ring = o.ring ?? PAL.irisRing, pupil = o.pupil ?? PAL.pupil;
  const pr = o.pupilR ?? EYE.pupil.default;
  const sclera = o.sclera ? (typeof o.sclera === 'string' ? o.sclera : EYE.sclera) : null;
  const nCatch = o.catchlights === 2 ? 2 : 3;
  const key = [inner, outer, ring, pupil, o.slit ? 1 : 0, pr, sclera ?? '-', nCatch].join('|');
  if (_texCache.has(key)) return _texCache.get(key);
  const c = canvas2d(256, 256);
  if (!c) { _texCache.set(key, null); return null; }
  const g = c.getContext('2d');
  const R = sclera ? 120 - EYE.scleraW : 120, k = R / 120;
  g.fillStyle = sclera ?? ring; g.fillRect(0, 0, 256, 256);
  if (sclera) { g.fillStyle = ring; g.beginPath(); g.arc(128, 128, R + 4, 0, Math.PI * 2); g.fill(); }
  const grd = g.createRadialGradient(128, 128 + 12 * k, 16 * k, 128, 128, R);
  grd.addColorStop(0, inner); grd.addColorStop(0.7, outer); grd.addColorStop(1, ring);
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, R, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.15; g.strokeStyle = '#fff';
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2; g.beginPath();
    g.moveTo(128 + Math.cos(a) * 60 * k, 128 + Math.sin(a) * 60 * k); g.lineTo(128 + Math.cos(a) * 112 * k, 128 + Math.sin(a) * 112 * k); g.stroke();
  }
  g.globalAlpha = 1; g.fillStyle = pupil; g.beginPath();
  if (o.slit) g.ellipse(128, 128, 16 * k, 92 * k, 0, 0, Math.PI * 2);
  else g.arc(128, 128 + 6 * k, pr * k, 0, Math.PI * 2);
  g.fill();
  // lower iris glow (the "lively" bounce light in the refs)
  const low = g.createRadialGradient(128, 128 + 77 * k, 4, 128, 128 + 77 * k, 60 * k);
  low.addColorStop(0, 'rgba(255,255,255,0.24)'); low.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = low; g.beginPath(); g.arc(128, 128, R, 0, Math.PI * 2); g.fill();
  // three catchlights (ART §5.3): the big upper-left ellipse, a lower-right dot, a small top sparkle (two: no sparkle)
  const C = EYE.catch, at = (x) => 128 + (x - 128) * k;
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(at(C.a[0]), at(C.a[1]), C.a[2] * k, C.a[3] * k, -0.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(at(C.b[0]), at(C.b[1]), C.b[2] * k, 0, Math.PI * 2); g.fill();
  if (nCatch === 3) { g.beginPath(); g.arc(at(C.sparkle[0]), at(C.sparkle[1]), C.sparkle[2] * k, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.userData.catchlights = nCatch;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _texCache.set(key, t);
  return t;
}

/** Eye sphere with planar front UVs; flattened in z. Radius r; `detail` scales the tessellation (Low: charDetail). */
export function eyeGeometry(r = 0.045, flat = 0.55, detail = 1) {
  const g = new THREE.SphereGeometry(r, segScale(32, detail, 14), segScale(24, detail, 10));
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * r) + 0.5, p.getY(i) / (2 * r) + 0.5);
  g.scale(1, 1, flat);
  return g;
}

const _matCache = new Map();
/**
 * Unlit eye material (ART §5.3: unlit, the iris texture carries all the shading; the fx basic module), cached per texture and
 * mesh kind (a material is never shared between plain and instanced meshes: PERF H3).
 * @param {object} [o] makeEyeTexture options @param {'plain'|'instanced'} [kind]
 */
export function eyeMaterial(o = {}, kind = 'plain') {
  const tex = makeEyeTexture(o);
  const key = (tex ? tex.uuid : 'none:' + (o.outer ?? '')) + ':' + kind;
  if (_matCache.has(key)) return _matCache.get(key);
  // PERF §1.2: the unlit fx basic module (one program for every unlit card / eye / blob), not a Basic program
  const m = own(fxBasicMaterial({ map: tex, color: tex ? '#ffffff' : (o.outer ?? PAL.irisOuter) }));
  m.userData.kind = kind;
  _matCache.set(key, m);
  return m;
}

/** Eye pivot transform in head space (shared by EyePair and the builder's eye-line ring). */
export function eyePivotMatrix(pos, side, yaw = 0.32) {
  const o = new THREE.Object3D();
  o.position.set(pos[0], pos[1], pos[2]);
  o.rotation.set(-0.06, side * yaw, 0, 'YXZ');
  o.updateMatrix();
  return o.matrix.clone();
}
const _ringGeo = new Map();
/** Thin dark ring around the eye outline (art.md §2.2 eye-line); merged into the head kit mesh by the builder. */
export function ringGeometry(r, detail = 1) {
  const n = segScale(36, detail, 20), key = r + ':' + n;
  if (!_ringGeo.has(key)) _ringGeo.set(key, new THREE.TorusGeometry(r * 1.02, r * 0.05, detail < 1 ? 4 : 5, n));
  return _ringGeo.get(key);
}

let _glintMat = null;
function glintMaterial() {
  return _glintMat || (_glintMat = own(fxBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false })));
}

/**
 * Expression presets: upper lid closure, lower lid closure, worry tilt (rad, + = inner corner up), glisten, and the
 * brow [angle (deg; − = angry inner-down, + = worried inner-up), lift (H)] (ART §5.3).
 */
export const EXPRESSIONS = Object.freeze({
  neutral:    { up: 0.06, low: 0.0, tilt: 0.0, glisten: 0, brow: [0, 0] },
  worried:    { up: 0.14, low: 0.0, tilt: 0.38, glisten: 0, brow: [30, 0.008] },
  earnest:    { up: 0.07, low: 0.03, tilt: 0.22, glisten: 0, brow: [16, 0.006] },
  // TT3: lighter lids (the 0.30 lid × the far-lens gain hid half the seated eye: it read bored, not brave)
  determined: { up: 0.15, low: 0.05, tilt: -0.24, glisten: 0, brow: [-18, -0.006] },
  // TT3: open and bright (the old 0.75 lower lid read as a tired under-eye crescent); the ^^ squint is `joy`
  happy:      { up: 0.04, low: 0.0, tilt: 0.06, glisten: 0, brow: [6, 0.012] },
  joy:        { up: 0.3, low: 0.75, tilt: 0.1, glisten: 0, brow: [8, 0.01] },
  // TT3 ">_<": squeezed shut, the lash lines slanted toward the nose (hurt)
  wince:      { up: 0.95, low: 0.7, tilt: -0.9, glisten: 0, brow: [-12, -0.004] },
  surprised:  { up: 0.0, low: 0.0, tilt: 0.12, glisten: 0, brow: [6, 0.01] },
  sad:        { up: 0.30, low: 0.04, tilt: 0.5, glisten: 0.8, brow: [28, 0.002] },
  glisten:    { up: 0.12, low: 0.06, tilt: 0.42, glisten: 1, brow: [24, 0.006] },
  sleepy:     { up: 0.62, low: 0.1, tilt: 0.1, glisten: 0, brow: [4, -0.004] },
  sleep:      { up: 1.0, low: 0.12, tilt: 0.0, glisten: 0, brow: [2, -0.004] },
  faint:      { up: 1.0, low: 0.2, tilt: 0.3, glisten: 0, brow: [20, 0] },
  grumpy:     { up: 0.42, low: 0.06, tilt: -0.22, glisten: 0, brow: [-16, -0.008] },
  angry:      { up: 0.32, low: 0.12, tilt: -0.5, glisten: 0, brow: [-25, -0.01] },
  smug:       { up: 0.45, low: 0.2, tilt: -0.1, glisten: 0, brow: [-8, 0.004] },
});

const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const DEG = Math.PI / 180;

/** Lid (+ lash) geometries with baked vertex colours (rmse attribute: the cat's instanced WarmToon draws them). */
function lidGeometries(r, flat, detail, lidRgb, lashK) {
  const lid = new THREE.SphereGeometry(r * 1.07, segScale(28, detail, 12), segScale(14, detail, 6), 0, Math.PI, 0, Math.PI).scale(1, 1, Math.max(flat * 1.25, 0.5));
  const lash = rgb(PAL.eyeLine);
  const up = new GeoBuilder();
  up.add(lid, { color: lidRgb, rmse: [0.95, 0, 0.6, 0] });
  // lash arc on the upper lid rim (r 0.008 H + a 0.012 H outer wing): an upper lash line when open, the lid edge when
  // half closed, a "‿" when closed (art.md §2.2 eye-line)
  const t = new THREE.TorusGeometry(r * 1.06, EYE.lashR * lashK, 6, segScale(28, detail, 14), Math.PI).rotateZ(Math.PI);
  const p = t.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1 - 0.06 * (x / r) ** 2)); }
  t.computeVertexNormals();
  up.add(t, { color: lash, rmse: [0.5, 0, 0, 0] });
  const wing = new THREE.CapsuleGeometry(EYE.lashWing * 0.35 * lashK, EYE.lashWing, 2, 6).rotateZ(Math.PI / 2 + 0.5).translate(-r * 1.1, -r * 0.12, 0);
  up.add(wing, { color: lash, rmse: [0.5, 0, 0, 0] });
  const low = new GeoBuilder();
  low.add(lid, { color: lidRgb, rmse: [0.95, 0, 0.6, 0] });
  lid.dispose(); t.dispose(); wing.dispose();
  return { up: up.build(), low: low.build() };
}

/**
 * A pair of eyes with lids and brows, built in HEAD space and parented to the head joint. Draws: eyes 1 (instanced;
 * 2 meshes only for odd-eyed cats), upper lids + lashes 1, brows 1, lower lids 1 while closed. The per-eye Object3D
 * slots (`eyes[i].pivot / eye / upPivot / up / loPivot / lo / brow`) keep the old scene-graph API for tools / tests.
 * @param {object} o { r, flat, detail, posL, posR, yaw, colors:{inner,outer,ring,pupil}|{L:{},R:{}}, lidColor:[r,g,b]
 *   linear, lidMat (an INSTANCED vertex-colour WarmToon: the cat's kitMatInst), slit, sclera, pupilR, lash, brows, seed }
 */
export class EyePair {
  constructor(o) {
    this.group = new THREE.Group(); this.group.name = 'eyes';
    this.r = o.r ?? 0.045;
    const r = this.r, flat = o.flat ?? 0.55;
    const detail = o.detail ?? charDetail();
    const geo = eyeGeometry(r, flat, detail);
    this._geo = geo;
    const colorsL = { ...(o.colors?.L || o.colors || {}), slit: o.slit, sclera: o.sclera, pupilR: o.pupilR };
    const colorsR = { ...(o.colors?.R || o.colors || {}), slit: o.slit, sclera: o.sclera, pupilR: o.pupilR };
    const lidRgb = o.lidColor ?? [0.8, 0.55, 0.35];
    const lids = lidGeometries(r, flat, detail, lidRgb, o.lash ?? 1);
    this._lidGeo = lids;
    const lidMat = o.lidMat;
    // one instanced draw for both eyes (two meshes only when the irises differ: odd-eyed cats)
    const matL = eyeMaterial(colorsL, 'instanced'), matR = eyeMaterial(colorsR, 'instanced');
    const inst = (g, m, name, n = 2) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.name = name; im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im); return im;
    };
    this.eyeMeshes = matL === matR ? [inst(geo, matL, 'eyePair')] : [inst(geo, matL, 'eyeL', 1), inst(geo, matR, 'eyeR', 1)];
    this.upMesh = inst(lids.up, lidMat, 'lidUp');
    this.loMesh = inst(lids.low, lidMat, 'lidLow');
    this.browMesh = null;
    if (o.brows !== false) {
      const B = EYE.brow, bg = new GeoBuilder();
      const cap = new THREE.CapsuleGeometry(B.thick / 2, B.len - B.thick, 2, segScale(8, detail, 5)).rotateZ(Math.PI / 2).scale(1, 1, 0.6);
      bg.add(cap, { color: lidRgb.map((c) => c * 0.62), rmse: [0.9, 0, 0.3, 0] });
      cap.dispose();
      this._browGeo = bg.build();
      this.browMesh = inst(this._browGeo, lidMat, 'brows');
    }
    this.eyes = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      const pos = side > 0 ? o.posL : o.posR;
      pivot.matrix.copy(eyePivotMatrix(pos, side, o.yaw));
      pivot.matrix.decompose(pivot.position, pivot.quaternion, pivot.scale);
      const eye = new THREE.Object3D(); eye.name = side > 0 ? 'eyeL' : 'eyeR';
      eye.geometry = geo;   // slot keeps a geometry handle (bounds in tools / tests)
      pivot.add(eye);
      const up = new THREE.Object3D(), lo = new THREE.Object3D(), upPivot = new THREE.Object3D(), loPivot = new THREE.Object3D();
      upPivot.add(up); loPivot.add(lo); pivot.add(upPivot, loPivot);
      const brow = new THREE.Object3D(); pivot.add(brow);
      // wet glint (glisten): a thin crescent along the lower iris (hidden unless an expression glistens)
      const glint = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, r * 0.05, 4, 20, Math.PI * 0.7), glintMaterial().clone());
      glint.rotation.z = Math.PI + Math.PI * 0.15; glint.position.z = r * flat * 1.02; glint.renderOrder = 2;
      glint.castShadow = false; glint.visible = false;
      own(glint.material);
      pivot.add(glint);
      this.group.add(pivot);
      this.eyes.push({ side, pivot, eye, up, lo, upPivot, loPivot, brow, glint });
    }
    this.state = { up: 0, low: 0, tilt: 0, glisten: 0, brow: 0, lift: 0 };
    this.target = { ...EXPRESSIONS.neutral, brow: 0, lift: 0 };
    this.gain = 1;
    this.rnd = mulberry32(hashString(String(o.seed ?? 'eyes')));
    this.blinkT = 0; this.nextBlink = 1.5 + this.rnd() * 3; this.blinkDur = 0.14;
    this.autoBlink = o.autoBlink ?? true;
    this.look = new THREE.Vector2(); this.lookTarget = new THREE.Vector2();
    this.squash = new Spring(220, 18);
    this.setExpression('neutral', true);
    this.apply(0);
  }
  /** @param {string|object} expr name in EXPRESSIONS or explicit {up, low, tilt, glisten, brow} */
  setExpression(expr, instant = false) {
    const e = typeof expr === 'string' ? (EXPRESSIONS[expr] || EXPRESSIONS.neutral) : { ...EXPRESSIONS.neutral, ...expr };
    const t = this.target;
    t.up = e.up; t.low = e.low; t.tilt = e.tilt; t.glisten = e.glisten;
    t.brow = (e.brow?.[0] ?? 0) * DEG; t.lift = e.brow?.[1] ?? 0;
    if (instant) Object.assign(this.state, t);
  }
  /** Far-lens readability (ART §5.3): lid and brow deltas × `g` (1.4 past 8 m). */
  setGain(g) { this.gain = g; }
  /** Show or hide the brows (TT3: the heroine shows them only in story beats). No-op without brows. @param {boolean} on */
  showBrows(on) { if (this.browMesh) this.browMesh.visible = !!on; }
  /** Hide one eye (eyepatch). @param {1|-1} side */
  hideEye(side) { const e = this.eyes.find((x) => x.side === side); if (e) e.pivot.visible = false; }
  blink() { this.blinkT = this.blinkDur; }
  /** Pupils look toward a direction in head space (x right(+left of cat), y up), -1..1. */
  lookAt(x, y) { this.lookTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)); }
  update(dt) {
    const s = this.state, t = this.target;
    s.up = damp(s.up, t.up, 14, dt); s.low = damp(s.low, t.low, 14, dt); s.tilt = damp(s.tilt, t.tilt, 10, dt);
    s.glisten = damp(s.glisten, t.glisten, 4, dt); s.brow = damp(s.brow, t.brow, 10, dt); s.lift = damp(s.lift, t.lift, 10, dt);
    if (this.autoBlink && t.up < 0.9) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blink(); this.nextBlink = 2.5 + this.rnd() * 3.5; if (this.rnd() < 0.2) this.nextBlink = 0.22; }
    }
    this.look.x = damp(this.look.x, this.lookTarget.x, 8, dt); this.look.y = damp(this.look.y, this.lookTarget.y, 8, dt);
    if (this.blinkT > 0) this.blinkT = Math.max(0, this.blinkT - dt);
    this.apply(dt);
  }
  apply() {
    const s = this.state, G = this.gain, n0 = EXPRESSIONS.neutral;
    const b = this.blinkT > 0 ? Math.sin((1 - this.blinkT / this.blinkDur) * Math.PI) : 0;
    const sUp = Math.min(1, n0.up + (s.up - n0.up) * G), sLow = Math.min(1, s.low * G), tilt = s.tilt * G;
    // lids meet on a low curved line when closed (a sleepy "‿"), not at the eye's bottom edge
    const up = Math.min(1, Math.max(sUp, b)), low = Math.min(1, Math.max(sLow, up > 0.85 ? (up - 0.85) / 0.15 : 0));
    const B = EYE.brow, r = this.r;
    let anyLow = false;
    for (let i = 0; i < this.eyes.length; i++) {
      const e = this.eyes[i];
      // upper lid: rotation.x from -PI (open, behind) to 0 (closed, in front); top half = -PI/2
      // order ZXY: swing about x first, then tilt about the eye's forward axis (worry / anger)
      e.upPivot.rotation.set(-Math.PI * (0.98 - up * 0.7), 0, -e.side * tilt * (1 - up * 0.7), 'ZXY');
      e.loPivot.rotation.set(Math.PI * (0.98 - low * 0.36), 0, e.side * tilt * 0.25, 'ZXY');
      e.eye.rotation.set(-this.look.y * 0.25, this.look.x * 0.3, 0);
      e.brow.position.set(e.side * r * 0.08, r * B.rise + s.lift * G - up * r * 0.12, r * 0.35);
      e.brow.rotation.set(-0.25, 0, -e.side * s.brow * G);
      e.glint.material.opacity = s.glisten * 0.85 * (1 - up);
      e.glint.visible = s.glisten > 0.02;
      const shown = e.pivot.visible;
      e.upPivot.updateMatrix(); e.loPivot.updateMatrix(); e.eye.updateMatrix(); e.brow.updateMatrix();
      // instance matrices in group space: pivot · (upPivot · up) etc.
      const eyeMesh = this.eyeMeshes.length === 1 ? this.eyeMeshes[0] : this.eyeMeshes[i];
      const ei = this.eyeMeshes.length === 1 ? i : 0;
      eyeMesh.setMatrixAt(ei, shown ? _mA.multiplyMatrices(e.pivot.matrix, e.eye.matrix) : _ZERO);
      this.upMesh.setMatrixAt(i, shown && up > 0.015 ? _mA.multiplyMatrices(e.pivot.matrix, e.upPivot.matrix) : _ZERO);
      const lowOn = shown && low > 0.015;
      anyLow ||= lowOn;
      this.loMesh.setMatrixAt(i, lowOn ? _mB.multiplyMatrices(e.pivot.matrix, e.loPivot.matrix) : _ZERO);
      if (this.browMesh) this.browMesh.setMatrixAt(i, shown ? _mB.multiplyMatrices(e.pivot.matrix, e.brow.matrix) : _ZERO);
    }
    for (const m of this.eyeMeshes) m.instanceMatrix.needsUpdate = true;
    this.upMesh.instanceMatrix.needsUpdate = true;
    this.loMesh.instanceMatrix.needsUpdate = true;
    this.loMesh.visible = anyLow;                       // usually hidden: 0 draws for the lower lids
    if (this.browMesh) this.browMesh.instanceMatrix.needsUpdate = true;
  }
  /** The geometry set this pair draws ({ eye, up, low, brow }): the kitten swaps play / close-up sets (ART §6.4). */
  geometries() { return { eye: this._geo, up: this._lidGeo.up, low: this._lidGeo.low, brow: this._browGeo ?? null }; }
  /** Draw another geometry set (same layout, another tessellation). @param {{eye, up, low, brow}} s */
  useGeometries(s) {
    if (!s || s.eye === this._geo) return;
    this._geo = s.eye; this._lidGeo = { up: s.up, low: s.low }; this._browGeo = s.brow ?? this._browGeo;
    for (const m of this.eyeMeshes) m.geometry = s.eye;
    this.upMesh.geometry = s.up; this.loMesh.geometry = s.low;
    if (this.browMesh && s.brow) this.browMesh.geometry = s.brow;
    for (const e of this.eyes) e.eye.geometry = s.eye;
  }
  /** Hand the geometries to someone else: dispose() will not free them. */
  releaseGeometries() { this._released = true; }
  /** Draw calls this pair issues right now. */
  drawCalls() { return this.eyeMeshes.length + 1 + (this.loMesh.visible ? 1 : 0) + (this.browMesh ? 1 : 0); }
  dispose() {
    if (!this._released) { this._geo.dispose(); this._lidGeo.up.dispose(); this._lidGeo.low.dispose(); this._browGeo?.dispose(); }
    for (const e of this.eyes) { e.glint.geometry.dispose(); e.glint.material.dispose(); }
  }
}
