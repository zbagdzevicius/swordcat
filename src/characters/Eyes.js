// Big glossy eyes (research/art.md §2.5): CanvasTexture iris with a big round pupil and two catchlights,
// planar front UVs, clearcoat. Coat-coloured eyelids give blinks and expressions; a wet glint for "glisten".
import * as THREE from 'three';
import { PAL } from './palette.js';
import { canvas2d, Spring, damp } from './util.js';
import { own } from './materials.js';

const _texCache = new Map();
/**
 * Iris texture (cached by colours). Enemies use `slit: true` and an amber/red iris (art.md §2.5 last line).
 * @param {{inner?:string, outer?:string, ring?:string, pupil?:string, slit?:boolean, pupilR?:number}} o
 */
export function makeEyeTexture(o = {}) {
  const inner = o.inner ?? PAL.irisInner, outer = o.outer ?? PAL.irisOuter, ring = o.ring ?? PAL.irisRing, pupil = o.pupil ?? PAL.pupil;
  const key = [inner, outer, ring, pupil, o.slit ? 1 : 0, o.pupilR ?? 66].join('|');
  if (_texCache.has(key)) return _texCache.get(key);
  const c = canvas2d(256, 256);
  if (!c) { _texCache.set(key, null); return null; }
  const g = c.getContext('2d');
  g.fillStyle = ring; g.fillRect(0, 0, 256, 256);
  const grd = g.createRadialGradient(128, 140, 16, 128, 128, 120);
  grd.addColorStop(0, inner); grd.addColorStop(0.7, outer); grd.addColorStop(1, ring);
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.15; g.strokeStyle = '#fff';
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2; g.beginPath();
    g.moveTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke();
  }
  g.globalAlpha = 1; g.fillStyle = pupil; g.beginPath();
  if (o.slit) g.ellipse(128, 128, 16, 92, 0, 0, Math.PI * 2);
  else g.arc(128, 134, o.pupilR ?? 66, 0, Math.PI * 2);
  g.fill();
  // lower iris glow (the "lively" bounce light in the refs)
  const low = g.createRadialGradient(128, 205, 4, 128, 205, 60);
  low.addColorStop(0, 'rgba(255,255,255,0.22)'); low.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = low; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(90, 86, 28, 21, -0.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(162, 172, 11, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _texCache.set(key, t);
  return t;
}

/** Eye sphere with planar front UVs; flattened in z. Radius r. */
export function eyeGeometry(r = 0.045, flat = 0.55) {
  const g = new THREE.SphereGeometry(r, 32, 24);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * r) + 0.5, p.getY(i) / (2 * r) + 0.5);
  g.scale(1, 1, flat);
  return g;
}

const _matCache = new Map();
export function eyeMaterial(o = {}) {
  const tex = makeEyeTexture(o);
  const key = tex ? tex.uuid : 'none:' + (o.outer ?? '');
  if (_matCache.has(key)) return _matCache.get(key);
  const m = own(new THREE.MeshPhysicalMaterial({
    map: tex, color: tex ? '#ffffff' : (o.outer ?? PAL.irisOuter), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03,
    emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: tex ? 0.12 : 0, envMapIntensity: 1.2,
  }));
  _matCache.set(key, m);
  return m;
}

const _lashGeo = new Map();
function lashGeometry(r, k) {
  const key = r + ':' + k;
  if (!_lashGeo.has(key)) {
    // lower half arc in lid space (y < 0), slightly thicker at the outer corners
    const g = new THREE.TorusGeometry(r * 1.06, r * 0.085 * k, 6, 28, Math.PI).rotateZ(Math.PI);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1 - 0.06 * (x / r) ** 2)); }
    g.computeVertexNormals();
    _lashGeo.set(key, g);
  }
  return _lashGeo.get(key);
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
export function ringGeometry(r) {
  if (!_ringGeo.has(r)) _ringGeo.set(r, new THREE.TorusGeometry(r * 1.02, r * 0.05, 5, 36));
  return _ringGeo.get(r);
}
let _lashMat = null;
function lashMaterial() { return _lashMat || (_lashMat = own(new THREE.MeshStandardMaterial({ color: PAL.eyeLine, roughness: 0.55 }))); }

let _glintMat = null;
function glintMaterial() {
  return _glintMat || (_glintMat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false })));
}

/** Expression presets: upper lid closure, lower lid closure, worry tilt (rad, + = inner corner up), pupil look. */
export const EXPRESSIONS = Object.freeze({
  neutral:    { up: 0.06, low: 0.0, tilt: 0.0, glisten: 0 },
  worried:    { up: 0.14, low: 0.0, tilt: 0.38, glisten: 0 },
  earnest:    { up: 0.07, low: 0.03, tilt: 0.22, glisten: 0 },
  determined: { up: 0.30, low: 0.08, tilt: -0.30, glisten: 0 },
  happy:      { up: 0.3, low: 0.75, tilt: 0.1, glisten: 0 },
  surprised:  { up: 0.0, low: 0.0, tilt: 0.12, glisten: 0 },
  sad:        { up: 0.30, low: 0.04, tilt: 0.5, glisten: 0.8 },
  glisten:    { up: 0.12, low: 0.06, tilt: 0.42, glisten: 1 },
  sleepy:     { up: 0.62, low: 0.1, tilt: 0.1, glisten: 0 },
  sleep:      { up: 1.0, low: 0.12, tilt: 0.0, glisten: 0 },
  faint:      { up: 1.0, low: 0.2, tilt: 0.3, glisten: 0 },
  grumpy:     { up: 0.42, low: 0.06, tilt: -0.22, glisten: 0 },
  angry:      { up: 0.32, low: 0.12, tilt: -0.5, glisten: 0 },
  smug:       { up: 0.45, low: 0.2, tilt: -0.1, glisten: 0 },
});

/**
 * A pair of eyes with lids, built in HEAD space and parented to the head joint.
 * @param {object} o { r, flat, posL:[x,y,z], posR, yaw, colors:{inner,outer,ring,pupil}|{L:{},R:{}}, lidColor:[r,g,b] linear, kitMat, slit }
 */
export class EyePair {
  constructor(o) {
    this.group = new THREE.Group(); this.group.name = 'eyes';
    this.r = o.r ?? 0.045;
    const flat = o.flat ?? 0.55;
    const geo = eyeGeometry(this.r, flat);
    const colorsL = o.colors?.L || o.colors || {}, colorsR = o.colors?.R || o.colors || {};
    const lidGeo = new THREE.SphereGeometry(this.r * 1.07, 28, 14, 0, Math.PI, 0, Math.PI).scale(1, 1, Math.max(flat * 1.25, 0.72));
    const lidMat = o.lidMat;
    this.eyes = []; this.upper = []; this.lower = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      const pos = side > 0 ? o.posL : o.posR;
      pivot.matrix.copy(eyePivotMatrix(pos, side, o.yaw));
      pivot.matrix.decompose(pivot.position, pivot.quaternion, pivot.scale);
      const eye = new THREE.Mesh(geo, eyeMaterial({ ...(side > 0 ? colorsL : colorsR), slit: o.slit }));
      eye.name = side > 0 ? 'eyeL' : 'eyeR';
      eye.castShadow = false;
      pivot.add(eye);
      // lids: half spheres that rotate from behind the eye (open) to the front (closed)
      const up = new THREE.Mesh(lidGeo, lidMat); up.castShadow = false; up.name = 'lidUp';
      const lo = new THREE.Mesh(lidGeo, lidMat); lo.castShadow = false; lo.name = 'lidLow';
      const upPivot = new THREE.Group(), loPivot = new THREE.Group();
      upPivot.add(up); loPivot.add(lo); pivot.add(upPivot, loPivot);
      // lash arc on the upper lid rim: reads as an upper lash line when open (lid parked behind the eye),
      // the lid edge when half closed, and a "‿" when closed (art.md §2.2 eye-line).
      const lash = new THREE.Mesh(lashGeometry(this.r, (o.lash ?? 1) * 0.7), lashMaterial());
      lash.castShadow = false; upPivot.add(lash);
      // wet glint (glisten): a thin crescent along the lower iris
      const glint = new THREE.Mesh(new THREE.TorusGeometry(this.r * 0.62, this.r * 0.05, 4, 20, Math.PI * 0.7), glintMaterial().clone());
      glint.rotation.z = Math.PI + Math.PI * 0.15; glint.position.z = this.r * flat * 1.02; glint.renderOrder = 2;
      own(glint.material);
      pivot.add(glint);
      this.group.add(pivot);
      this.eyes.push({ side, pivot, eye, up, lo, upPivot, loPivot, glint });
    }
    this.state = { up: 0, low: 0, tilt: 0, glisten: 0 };
    this.target = { ...EXPRESSIONS.neutral };
    this.blinkT = 0; this.nextBlink = 1.5 + Math.random() * 3; this.blinkDur = 0.14;
    this.autoBlink = o.autoBlink ?? true;
    this.look = new THREE.Vector2(); this.lookTarget = new THREE.Vector2();
    this.squash = new Spring(220, 18);
    this.apply(0);
  }
  /** @param {string|object} expr name in EXPRESSIONS or explicit {up, low, tilt, glisten} */
  setExpression(expr, instant = false) {
    const e = typeof expr === 'string' ? (EXPRESSIONS[expr] || EXPRESSIONS.neutral) : { ...EXPRESSIONS.neutral, ...expr };
    Object.assign(this.target, e);
    if (instant) Object.assign(this.state, e);
  }
  blink() { this.blinkT = this.blinkDur; }
  /** Pupils look toward a direction in head space (x right(+left of cat), y up), -1..1. */
  lookAt(x, y) { this.lookTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)); }
  update(dt) {
    const s = this.state, t = this.target;
    s.up = damp(s.up, t.up, 14, dt); s.low = damp(s.low, t.low, 14, dt); s.tilt = damp(s.tilt, t.tilt, 10, dt);
    s.glisten = damp(s.glisten, t.glisten, 4, dt);
    if (this.autoBlink && t.up < 0.9) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blink(); this.nextBlink = 2.5 + Math.random() * 3.5; if (Math.random() < 0.2) this.nextBlink = 0.22; }
    }
    this.look.x = damp(this.look.x, this.lookTarget.x, 8, dt); this.look.y = damp(this.look.y, this.lookTarget.y, 8, dt);
    if (this.blinkT > 0) this.blinkT = Math.max(0, this.blinkT - dt);
    this.apply(dt);
  }
  apply() {
    const s = this.state;
    const b = this.blinkT > 0 ? Math.sin((1 - this.blinkT / this.blinkDur) * Math.PI) : 0;
    // lids meet on a low curved line when closed (a sleepy "‿"), not at the eye's bottom edge
    const up = Math.min(1, Math.max(s.up, b)), low = Math.min(1, Math.max(s.low, up > 0.85 ? (up - 0.85) / 0.15 : 0));
    for (const e of this.eyes) {
      // upper lid: rotation.x from -PI (open, behind) to 0 (closed, in front); top half = -PI/2
      // order ZXY: swing about x first, then tilt about the eye's forward axis (worry / anger)
      e.upPivot.rotation.set(-Math.PI * (0.98 - up * 0.7), 0, -e.side * s.tilt * (1 - up * 0.7), 'ZXY');
      e.up.visible = up > 0.015;
      e.loPivot.rotation.set(Math.PI * (0.98 - low * 0.36), 0, e.side * s.tilt * 0.25, 'ZXY');
      e.lo.visible = low > 0.015;
      e.eye.rotation.set(-this.look.y * 0.25, this.look.x * 0.3, 0);
      e.glint.material.opacity = s.glisten * 0.85 * (1 - up);
      e.glint.visible = s.glisten > 0.02;
    }
  }
  dispose() { this.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
}
