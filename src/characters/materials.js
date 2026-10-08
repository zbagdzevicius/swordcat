// Shared materials for every procedural character. One "kit" material renders all non-fur geometry
// (armour, cloth, leather, noses, sheen-fur bodies, accessories) from vertex colours plus a per-vertex
// `rmse` attribute (roughness, metalness, sheen weight, emissive weight), so a whole kitten body is one draw call.
// No WebGL access at import; materials are created lazily.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { canvas2d } from './util.js';

/** Hooks other areas can register to patch every material characters create (e.g. world's height fog). */
const _patchers = new Set();
/** @param {(mat: THREE.Material) => void} fn  Called once per material we create (and for already-created ones). */
export function registerMaterialPatcher(fn) {
  _patchers.add(fn);
  for (const m of _all) fn(m);
  return () => _patchers.delete(fn);
}
const _all = new Set();
/** Track + patch a material we own. */
export function own(mat) { _all.add(mat); applyEnv(mat); for (const fn of _patchers) fn(mat); return mat; }

// ---- character environment map (art.md §4.1: the overcast PMREM is what makes the plate read as polished steel).
// runtime.js builds it from the live Env colours; every lit material we own uses it instead of scene.environment.
let _envMap = null;
function applyEnv(m) {
  if (!m.isMeshStandardMaterial || m.userData.noCharEnv) return;
  const had = !!m.envMap;
  m.envMap = _envMap;
  if (had !== !!_envMap) m.needsUpdate = true;
}
/** @param {THREE.Texture|null} tex PMREM texture (null = fall back to scene.environment) */
export function setCharacterEnvMap(tex) { _envMap = tex; for (const m of _all) applyEnv(m); }
export function getCharacterEnvMap() { return _envMap; }

/** Shared holy colour uniform object (fx can tween the hue globally). */
export const HOLY_COLOR = { value: new THREE.Color(PAL.holyRim) };

/**
 * The kit material. Per kitten that can glow (holy) we clone it so `uHoly` is per character;
 * clones share one GPU program (same customProgramCacheKey).
 * @param {{ holy?: boolean }} [o]
 */
export function makeKitMaterial(o = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.75,
    sheen: 1, sheenColor: new THREE.Color('#D9C7B0'), sheenRoughness: 0.5,
  });
  const uniforms = {
    uRim: { value: new THREE.Color('#FFF1DD').multiplyScalar(0.22) },
    uHoly: { value: 0 }, uHolyColor: HOLY_COLOR, uFlash: { value: 0 }, uMetalEnv: { value: o.metalEnv ?? 1.5 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rmse;\nvarying vec4 vRMSE;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRMSE = rmse;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vRMSE;\nuniform vec3 uRim; uniform float uHoly; uniform vec3 uHolyColor; uniform float uFlash; uniform float uMetalEnv;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRMSE.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRMSE.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float ndv = saturate( dot( normal, normalize( vViewPosition ) ) );
          float rimK = pow( 1.0 - ndv, 3.0 );
          totalEmissiveRadiance += diffuseColor.rgb * vRMSE.w;
          totalEmissiveRadiance += uRim * rimK * vRMSE.z;
          totalEmissiveRadiance += uHolyColor * uHoly * ( rimK * ( 0.45 + 0.6 * vRMSE.z ) + 0.05 * vRMSE.y + 0.015 );
          totalEmissiveRadiance += vec3( uFlash );
        }`)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_SHEEN\nmaterial.sheenColor *= vRMSE.z;\n#endif')
      // fur / cloth: the hemisphere light already gives the soft ambient; damp the env-map diffuse so white coats don't bloom
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\niblIrradiance *= mix(1.0, 0.45, vRMSE.z);\n#if defined( RE_IndirectSpecular )\nradiance *= mix(1.0, uMetalEnv, vRMSE.y);\n#endif');
  };
  mat.customProgramCacheKey = () => 'sc-kit-v2';
  return own(mat);
}

let _kitShared = null;
/** Shared kit material (no holy) for NPCs, villagers and props. */
export function kitMaterial() { return _kitShared || (_kitShared = makeKitMaterial()); }

/** rmse presets: [roughness, metalness, sheen, emissive]. */
export const RM = Object.freeze({
  fur: [0.95, 0, 0.6, 0], furShort: [0.85, 0, 0.5, 0], skin: [0.6, 0, 0.2, 0], nose: [0.62, 0, 0, 0], mouth: [0.7, 0, 0, 0],
  steel: [0.22, 1, 0, 0], steelDark: [0.42, 1, 0, 0], mail: [0.6, 0.9, 0, 0], brass: [0.33, 1, 0, 0],
  leather: [0.78, 0, 0.1, 0], cloth: [0.9, 0, 0.6, 0], velvet: [0.85, 0, 1, 0], wood: [0.8, 0, 0, 0], paper: [0.9, 0, 0.2, 0],
  rust: [0.75, 0.6, 0, 0], iron: [0.55, 0.85, 0, 0], ceramic: [0.3, 0, 0, 0], glass: [0.08, 0, 0, 0.15], eye: [0.12, 0, 0, 0.12],
  eyeLine: [0.5, 0, 0, 0], gem: [0.1, 0.2, 0, 0.4], glow: [0.6, 0, 0, 1.2], milk: [0.35, 0, 0.1, 0], satin: [0.35, 0, 1, 0],
  plastic: [0.18, 0, 0, 0], straw: [0.85, 0, 0.3, 0], bone: [0.6, 0, 0.1, 0], bread: [0.75, 0, 0.4, 0], leaf: [0.7, 0, 0.3, 0],
  gold: [0.25, 1, 0, 0.05], whisker: [0.5, 0, 0, 0.3],
});

/** Radial blob-shadow texture (art.md §9.1 contact shadows). */
let _blobTex = null;
export function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = canvas2d(64, 64);
  if (!c) return null;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _blobTex = new THREE.CanvasTexture(c);
  return _blobTex;
}
let _blobMat = null;
export function blobMaterial() {
  if (_blobMat) return _blobMat;
  _blobMat = own(new THREE.MeshBasicMaterial({ color: '#1D2410', transparent: true, opacity: 0.5, depthWrite: false, map: blobTexture(), alphaMap: null }));
  _blobMat.polygonOffset = true; _blobMat.polygonOffsetFactor = -2;
  return _blobMat;
}
let _blobGeo = null;
export function blobGeometry() { return _blobGeo || (_blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)); }

/** Tuft/wisp card texture: tapered strands with alpha (art.md §3.4). Cached. */
let _tuftTex = null;
export function tuftTexture() {
  if (_tuftTex) return _tuftTex;
  const W = 64, H = 128, c = canvas2d(W, H);
  if (!c) return null;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const x0 = 6 + rnd() * (W - 12), len = H * (0.55 + rnd() * 0.45), bend = (rnd() - 0.5) * 18, w = 1.5 + rnd() * 2.8;
    const grd = g.createLinearGradient(0, H, 0, H - len);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.85)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grd; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, H); g.quadraticCurveTo(x0 + bend * 0.3, H - len * 0.5, x0 + bend, H - len); g.stroke();
  }
  _tuftTex = new THREE.CanvasTexture(c);
  _tuftTex.colorSpace = THREE.SRGBColorSpace;
  return _tuftTex;
}
let _tuftMat = null;
/** Wisp material for ear tufts, cheek fluff, tail tips (vertex colours root→tip, alpha-tested, double sided). */
export function tuftMaterial() {
  if (_tuftMat) return _tuftMat;
  const t = tuftTexture();
  _tuftMat = own(new THREE.MeshStandardMaterial({
    vertexColors: true, map: t, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, transparent: false,
  }));
  _tuftMat.alphaToCoverage = true;
  return _tuftMat;
}
