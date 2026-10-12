// Shared materials for every procedural character (research/next/ART_WARM_SPEC.md §5, PERF_SPEC H3/H5 "WarmToon").
// One toon program (`sc-toon-v2`) renders all non-fur geometry (armour, cloth, leather, noses, coat bodies, props)
// from vertex colours plus a per-vertex `rmse` attribute: [unused, metal mask, rim/sheen mask, unlit weight]. Metal
// parts sample a warm 256² steel matcap inside the same program, so a whole kitten body (coat + plate) is ONE draw.
// No PBR, no PMREM in play (K6); `dithering` on every tier (X3). No WebGL access at import; materials are lazy.
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
/** Stop tracking + dispose a per-character material (shared materials must never be passed here). */
export function disown(mat) { if (!mat) return; _all.delete(mat); mat.dispose(); }

// ---- character environment map (legacy: only a High close-up Standard material would still use it; ART §5.2 X27).
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
/** Does any live material still read the character env map? (runtime skips the PMREM rebuild when none does.) */
export function envMapUsers() { let n = 0; for (const m of _all) if (m.isMeshStandardMaterial && !m.userData.noCharEnv) n++; return n; }

/**
 * Readability from above (research/CONTROLS_SPEC.md §12 characters 3; WARM_ADVENTURE_SPEC §3.3 hero pop-out): past
 * `from` m between the lens and the focus the top-view factor ramps to 1 by `to` m. At 1: the bow ×`bowScale` with
 * `bowGlow` extra self-light (always pink, always on the LEFT ear), ears ×`earScale`, a `trimM` m lighter cape trim.
 * Past `bowFarFrom` the bow keeps growing to ×`bowScaleFar` at `bowFarAt` m (WA: ×1.4 at lens ≥ 12 m).
 * `playScale` / `playScaleCompanion`: visual root scale in the iso gameplay modes (hitboxes, MODEL_FIT unchanged),
 * blended over `scaleBlend` s on the cutscene hand-off. Close-ups (cutscenes, Meme Cam, `?cam=classic`) stay at 0 / 1.
 */
export const READABILITY = Object.freeze({
  from: 9, to: 10.5, bowScale: 1.25, bowGlow: 0.08, earScale: 1.1, trimM: 0.02, trimLift: 0.55, bladeGlow: 0.22,
  bowScaleFar: 1.4, bowFarFrom: 10.5, bowFarAt: 12, playScale: 1.12, playScaleCompanion: 1.08, scaleBlend: 0.3,
});
/** Shared top-view factor 0..1 (a uniform object: bow and cape shaders read it). runtime.characterFrame writes it. */
export const TOP_VIEW = { value: 0, far: 0 };

/** Shared holy colour uniform object (fx can tween the hue globally). */
export const HOLY_COLOR = { value: new THREE.Color(PAL.holyRim) };

// ------------------------------------------------------------------ WarmToon (ART §5.1)

/** Program cache keys (patchers may compose them, e.g. 'sc-toon-v2|hfog3'). */
export const TOON_KEY = 'sc-toon-v2';
export const METAL_KEY = 'sc-metal-v2';
/**
 * Toon look constants (ART §5.1): coat gradient (shade side / lit side multipliers), rim falloff + top weighting,
 * rim strength split by the rmse.z mask, holy rim gain, metal: matcap share and how much toon light still reaches it.
 */
export const TOON = Object.freeze({
  coatLow: 0.92, coatHigh: 1.08, rimPow: 2.5, rimTop: 0.65, rimBase: 0.4, holyRim: 1.2, holyBase: 0.03,
  metalLit: 0.25, flashGain: 0.6, highlightRim: 1.4, highlightBase: 0.08,
  rim: '#FFE7CF', rimK: 0.32, ramp: [150, 178, 255, 255],
});
/**
 * Shared toon environment uniforms (ART §2.4 `ENV_U.uRim / uRimK`): world's Env writes them per preset through
 * `setToonRim()` (requests/world.md); the defaults are the warm day rim.
 */
export const TOON_ENV = Object.freeze({ uRim: { value: new THREE.Color(TOON.rim) }, uRimK: { value: TOON.rimK } });
/** @param {THREE.ColorRepresentation} color @param {number} [k] */
export function setToonRim(color, k) { if (color != null) TOON_ENV.uRim.value.set(color); if (Number.isFinite(k)) TOON_ENV.uRimK.value = k; }

let _ramp = null;
/** 4-texel linear ramp (deep shade, shade, lit, lit): the soft two-band toon falloff (ART §5.1). */
export function softRamp() {
  if (_ramp) return _ramp;
  const r = TOON.ramp, d = new Uint8Array(16);
  for (let i = 0; i < 4; i++) d.set([r[i], r[i], r[i], 255], i * 4);
  _ramp = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  _ramp.magFilter = _ramp.minFilter = THREE.LinearFilter; _ramp.generateMipmaps = false; _ramp.needsUpdate = true;
  return _ramp;
}

let _matcap = null;
/**
 * The warm 256² steel matcap (ART §5.2): white top, cool silver mid, a warm cream horizon band, a plum bottom, a soft
 * hot spot; never black. Generated once (a 1×1 silver DataTexture in node / without a canvas).
 */
export function makeSteelMatcap() {
  const c = canvas2d(256, 256);
  if (!c) {
    const t = new THREE.DataTexture(new Uint8Array([201, 208, 216, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const g = c.getContext('2d');
  g.fillStyle = '#B9C2CC'; g.fillRect(0, 0, 256, 256);
  const base = g.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0.00, '#FFFFFF'); base.addColorStop(0.30, '#E6ECF2');
  base.addColorStop(0.55, '#B9C2CC'); base.addColorStop(0.62, '#F6E7D2');
  base.addColorStop(1.00, '#7D7488');
  g.fillStyle = base; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  const hot = g.createRadialGradient(86, 70, 0, 86, 70, 46);
  hot.addColorStop(0, 'rgba(255,255,255,0.95)'); hot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hot; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** The one shared steel matcap texture. */
export function steelMatcap() { return _matcap || (_matcap = makeSteelMatcap()); }

/** GLSL: warm rim + unlit + holy + flash + hover highlight, added to `totalEmissiveRadiance` (toon) or `outgoingLight` (matcap). */
const RIM_GLSL = (target) => /* glsl */`
  {
    float ndvR = saturate( dot( normal, normalize( vViewPosition ) ) );
    float rimR = pow( 1.0 - ndvR, ${TOON.rimPow.toFixed(2)} ) * ( ${(1 - TOON.rimTop).toFixed(2)} + ${TOON.rimTop.toFixed(2)} * saturate( vWN.y + 0.4 ) );
    ${target} += uRim * rimR * uRimK * ( ${TOON.rimBase.toFixed(2)} + ${(1 - TOON.rimBase).toFixed(2)} * vRMSE.z );
    ${target} += uHolyColor * uHoly * ( rimR * ${TOON.holyRim.toFixed(2)} + ${TOON.holyBase.toFixed(3)} );
    ${target} += vec3( uFlash );
    ${target} += uHighlight * ( pow( 1.0 - ndvR, 2.0 ) * ${TOON.highlightRim.toFixed(2)} + ${TOON.highlightBase.toFixed(2)} );
  }`;
const PARS_V = '#include <common>\nattribute vec4 rmse;\nvarying vec4 vRMSE;\nvarying vec3 vWN;';
const PARS_F = '#include <common>\nvarying vec4 vRMSE;\nvarying vec3 vWN;\nuniform vec3 uRim, uHolyColor, uHighlight; uniform float uRimK, uHoly, uFlash;';

/**
 * Per-material uniforms (holy / flash / hover highlight). `uHighlight` is a premultiplied rgb (colour × strength;
 * ART's vec4 rgb + amount, folded): the enemy wind-up and hover rims write it.
 */
export function toonUniforms() {
  return { uHoly: { value: 0 }, uHolyColor: HOLY_COLOR, uFlash: { value: 0 }, uHighlight: { value: new THREE.Color(0, 0, 0) } };
}

/**
 * The WarmToon material (ART §5.1, cache key `sc-toon-v2`): MeshToonMaterial + softRamp, vertex colours (or `map` /
 * a flat `color`), coat gradient (lighter on top), warm top-weighted rim, unlit parts via rmse.w, metal parts (rmse.y)
 * shaded by the steel matcap in the same draw, holy / flash / highlight. `dithering` on.
 * @param {{ map?: THREE.Texture|null, uniforms?: object, kind?: string, side?: THREE.Side, alphaTest?: number,
 *           transparent?: boolean, color?: THREE.ColorRepresentation, topGlow?: number }} [o] `uniforms`: share one
 *           uniform set between the per-kind variants of one character (skinned body + instanced fur base: one holy
 *           value). `topGlow`: extra self-light × the shared top-view factor (readability from the iso lens).
 * @returns {THREE.MeshToonMaterial}
 */
export function makeToonMaterial(o = {}) {
  const m = new THREE.MeshToonMaterial({
    vertexColors: !o.map && o.color === undefined, map: o.map ?? null, gradientMap: softRamp(),
    side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0, transparent: !!o.transparent,
  });
  if (o.color !== undefined) m.color.set(o.color);
  const u = o.uniforms ?? toonUniforms();
  const mc = { uMatcap: { value: steelMatcap() }, uTopView: TOP_VIEW };
  m.userData.uniforms = u;
  m.userData.toon = true;
  m.userData.kind = o.kind ?? 'plain';
  const rmseAttr = o.map == null && o.color === undefined;
  const topGlow = o.topGlow ? `\ntotalEmissiveRadiance += diffuseColor.rgb * ${o.topGlow.toFixed(3)} * uTopView;` : '';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TOON_ENV, u, mc);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', PARS_V)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRMSE = ${rmseAttr ? 'rmse' : 'vec4(0.0, 0.0, 1.0, 0.0)'};`)
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWN = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', PARS_F + '\nuniform sampler2D uMatcap;\nuniform float uTopView;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix( ${TOON.coatLow.toFixed(2)}, ${TOON.coatHigh.toFixed(2)}, clamp( vWN.y * 0.5 + 0.5, 0.0, 1.0 ) );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vRMSE.w;${topGlow}${RIM_GLSL('totalEmissiveRadiance')}`)
      .replace('#include <opaque_fragment>', `
        if ( vRMSE.y > 0.001 ) {
          vec3 vdM = normalize( vViewPosition );
          vec3 xM = normalize( vec3( vdM.z, 0.0, - vdM.x ) );
          vec3 yM = cross( vdM, xM );
          vec3 mcM = texture2D( uMatcap, vec2( dot( xM, normal ), dot( yM, normal ) ) * 0.495 + 0.5 ).rgb;
          float litM = clamp( dot( outgoingLight, vec3( 0.3333 ) ) / max( dot( diffuseColor.rgb, vec3( 0.3333 ) ), 1e-3 ), 0.0, 1.5 );
          vec3 metal = diffuseColor.rgb * mcM * ( ${(1 - TOON.metalLit).toFixed(2)} + ${TOON.metalLit.toFixed(2)} * litM ) + totalEmissiveRadiance;
          outgoingLight = mix( outgoingLight, metal, saturate( vRMSE.y ) );
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => TOON_KEY + (rmseAttr ? '' : ':flat') + (o.topGlow ? ':g' + o.topGlow : '');
  m.dithering = true;
  return own(m);
}

/**
 * Metal material (ART §5.2, `sc-metal-v2`): MeshMatcapMaterial with the warm steel matcap, vertex colour = tint
 * (steel #C9D0D8, brass #E8C27A, dark steel #8E96A2), plus the same rim / holy / flash / highlight block.
 * @param {{ uniforms?: object, kind?: string, emissive?: boolean, topGlow?: number }} [o] `emissive`: a `uEmissive`
 *   uniform (colour × intensity: Valor / holy charge on a blade); `topGlow`: self-light × the top-view factor.
 */
export function makeMetalMaterial(o = {}) {
  const m = new THREE.MeshMatcapMaterial({ matcap: steelMatcap(), vertexColors: true, fog: true });
  const u = o.uniforms ?? toonUniforms();
  if (o.emissive && !u.uEmissive) u.uEmissive = { value: new THREE.Color(0, 0, 0) };
  const extra = { uTopView: TOP_VIEW };
  m.userData.uniforms = u;
  m.userData.metal = true;
  m.userData.kind = o.kind ?? 'plain';
  const add = (o.emissive ? '\noutgoingLight += uEmissive;' : '') + (o.topGlow ? `\noutgoingLight += diffuseColor.rgb * ${o.topGlow.toFixed(3)} * uTopView;` : '');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TOON_ENV, u, extra);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', PARS_V)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRMSE = rmse;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWN = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', PARS_F + '\nuniform float uTopView;' + (o.emissive ? '\nuniform vec3 uEmissive;' : ''))
      .replace('#include <opaque_fragment>', `${RIM_GLSL('outgoingLight')}
        outgoingLight += diffuseColor.rgb * vRMSE.w;${add}
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => METAL_KEY + (o.emissive ? ':e' : '') + (o.topGlow ? ':g' + o.topGlow : '');
  m.dithering = true;
  return own(m);
}

/** Mesh kinds that get their own material instance (a material shared across kinds re-resolves its program, H3). */
export const MESH_KINDS = Object.freeze(['plain', 'instanced', 'skinned', 'batched']);
/** Kind of a mesh for `toonLib`. @param {THREE.Object3D} o */
export function meshKind(o) { return o?.isSkinnedMesh ? 'skinned' : o?.isInstancedMesh ? 'instanced' : o?.isBatchedMesh ? 'batched' : 'plain'; }

const _lib = new Map();
/**
 * Shared non-holy toon material per mesh kind (PERF H5 `toonLib` per-kind dedupe): props, villagers, beast heads.
 * @param {'plain'|'instanced'|'skinned'|'batched'} [kind]
 */
export function toonLib(kind = 'plain') {
  if (!MESH_KINDS.includes(kind)) kind = 'plain';
  let m = _lib.get(kind);
  if (!m) { m = makeToonMaterial({ kind }); m.userData.shared = true; _lib.set(kind, m); }
  return m;
}

const _pools = new Map();
/**
 * Pooled per-actor toon material (ART §5.1 D17): one per live actor of a type, same program (no compile), so per-actor
 * flash / highlight never clones on hit. Return it with `releaseToonMaterial` on despawn.
 * @param {string} typeKey e.g. 'kitten:skinned', 'rat_pike' @param {THREE.Texture|null} [map]
 */
export function getToonMaterial(typeKey, map = null) {
  const key = typeKey + '|' + (map?.uuid ?? '-');
  const pool = _pools.get(key);
  const m = pool?.length ? pool.pop() : makeToonMaterial({ map, kind: String(typeKey).split(':')[1] ?? 'plain' });
  m.userData.poolKey = key;
  const u = m.userData.uniforms; u.uFlash.value = 0; u.uHoly.value = 0; u.uHighlight.value.setRGB(0, 0, 0);
  return m;
}
/** Give a pooled toon material back (no dispose: the next actor of the type reuses it). */
export function releaseToonMaterial(m) {
  const key = m?.userData?.poolKey;
  if (!key) return;
  if (!_pools.has(key)) _pools.set(key, []);
  const p = _pools.get(key);
  if (!p.includes(m)) p.push(m);
}
/** Pool sizes (debug / tests). */
export function toonPoolStats() { const o = {}; for (const [k, p] of _pools) o[k] = p.length; return o; }

/**
 * The kit material (compat name): a per-character WarmToon (holy-capable cats clone so `uHoly` is per character).
 * @param {{ kind?: string, uniforms?: object }} [o]
 */
export function makeKitMaterial(o = {}) { return makeToonMaterial({ kind: o.kind ?? 'skinned', uniforms: o.uniforms }); }

/** Shared kit material (no holy) for NPCs, villagers and props, per mesh kind (default: plain meshes). */
export function kitMaterial(kind = 'plain') { return toonLib(kind); }
/** Is this one of the shared per-kind kit materials? */
export function isSharedKit(m) { return !!m?.userData?.shared; }

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
/** Contact blob (ART TONE.blob: a soft plum, never near-black). */
export const BLOB = Object.freeze({ color: '#5A4E7A', opacity: 0.42 });
let _blobMat = null;
export function blobMaterial() {
  if (_blobMat) return _blobMat;
  _blobMat = own(new THREE.MeshBasicMaterial({ color: BLOB.color, transparent: true, opacity: BLOB.opacity, depthWrite: false, map: blobTexture(), alphaMap: null }));
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
  // tapered, curved strands whose alpha falls off toward the tip (a wisp, not a comb of straight lines)
  g.lineCap = 'round';
  for (let i = 0; i < 30; i++) {
    const x0 = 8 + rnd() * (W - 16), len = H * (0.5 + rnd() * 0.48), bend = (rnd() - 0.5) * 30, w = 1.6 + rnd() * 3.0;
    const P = (u) => { const a = 1 - u; return [a * a * x0 + 2 * a * u * (x0 + bend * 0.15) + u * u * (x0 + bend), H - len * u]; };
    const N = 14;
    for (let k = 0; k < N; k++) {
      const u0 = k / N, u1 = (k + 1) / N, [ax, ay] = P(u0), [bx, by] = P(u1);
      g.strokeStyle = `rgba(255,255,255,${(Math.pow(1 - u0, 1.4) * (0.75 + 0.25 * rnd())).toFixed(3)})`;
      g.lineWidth = Math.max(0.6, w * Math.pow(1 - u0, 0.85));
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  _tuftTex = new THREE.CanvasTexture(c);
  _tuftTex.colorSpace = THREE.SRGBColorSpace;
  return _tuftTex;
}
/** Tuft card look (ART §6.2): alpha-test cut-out (no sorting, depth-writing), self-light so back-lit wisps stay cream. */
export const TUFT = Object.freeze({ alphaTest: 0.35, selfLight: 0.16 });
const _tuftMats = new Map();
/**
 * Wisp material for tuft cards (ear tufts, cheek ruff, crown, bib, tail tip): toon-lit (softRamp), vertex colours
 * root → tip, procedural alpha texture, alpha-tested at TUFT.alphaTest, double-sided, single pass. One per mesh kind.
 * @param {'skinned'|'plain'|'instanced'} [kind]
 */
export function tuftMaterial(kind = 'skinned') {
  let m = _tuftMats.get(kind);
  if (m) return m;
  m = new THREE.MeshToonMaterial({ vertexColors: true, map: tuftTexture(), alphaTest: TUFT.alphaTest, side: THREE.DoubleSide, gradientMap: softRamp() });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * ${TUFT.selfLight.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => 'sc-tuft-v3';
  // DoubleSide never splits into two passes (that flagged needsUpdate before each pass: a re-resolve every draw)
  m.forceSinglePass = true;
  m.dithering = true;
  m.userData.kind = kind;
  // own() after the hook: registered patchers (world's height / focus fog, CONTROLS_SPEC C4) wrap it, not lose it
  own(m);
  _tuftMats.set(kind, m);
  return m;
}
