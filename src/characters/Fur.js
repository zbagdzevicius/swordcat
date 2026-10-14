// Fur rendering (research/art.md §3): shell texturing on exposed fur (head, cheek ruff, bib, tail) with a
// per-vertex coat colour + fur mask, wrap-diffuse + rim lighting from the scene's real lights, and a sheen
// fallback quality switch (GAME_DESIGN §17: 16 shells hero, 10 kittens, sheen for villagers / far / mobile).
import * as THREE from 'three';
import { PAL } from './palette.js';
import { rgb, mixRgb, fbm3, smoothstep, clamp, lerp } from './util.js';
import { own, HOLY_COLOR } from './materials.js';

// ---------------------------------------------------------------- quality

/** Shell counts per tier and quality. 0 = sheen fallback. */
export const FUR_QUALITY = Object.freeze({
  ultra: { hero: 24, kitten: 12, npc: 8 },
  high: { hero: 16, kitten: 10, npc: 0 },
  med: { hero: 16, kitten: 10, npc: 0 },
  low: { hero: 8, kitten: 0, npc: 0 },
  off: { hero: 0, kitten: 0, npc: 0 },
});
let _quality = 'med';
/** Shell counts when the quality was set from a core preset (runtime.furShellsForPreset). */
let _custom = { hero: 16, kitten: 10, npc: 0 };
const _parts = new Set();
/** Max shells a part is allocated for (so quality can be raised later without rebuilding). */
export const MAX_SHELLS = 24;
/**
 * Distance LOD (art.md §3 far LOD; §18 budget, requests/world.md M2): full shells inside `near` (close-ups, Photo Cam),
 * a linear ramp down to `min` shells, then the base layer only beyond `far` (shells off past ~8 m). The follow camera
 * (CAMERA.dist 3.6 m) draws ~13 of 16 hero shells, lock-on (4.5 m) ~10, boss framing (6 m) ~6.
 */
export const FUR_LOD = { near: 2.6, far: 8, min: 4 };
/**
 * Fur LOD under the iso camera (research/CONTROLS_SPEC.md §2.8): distances are measured from `cam.focus`, not the
 * lens (the lens sits 9–18 m away, so the lens rule would strip every shell). The hero keeps her full shells within
 * `heroLens` m of the lens; every other cat ramps from full (≤ `near` m from the focus) to the base layer (≥ `far`),
 * and drops one furShells tier (kitten → npc counts) while the camera is farther than `dropAt` m from the focus.
 */
export const FUR_LOD_ISO = Object.freeze({ near: 5, far: 14, min: 3, heroLens: 0, dropAt: 12 });   // heroLens 0: ART §6.1 / X8
/**
 * Which rule the per-draw LOD uses this frame. runtime.characterFrame() writes it from ctx.cam every frame: `focus`
 * on (iso gameplay camera) or off (cutscenes, Photo Cam, `?cam=classic`, tools: the lens rule above).
 */
export const FUR_VIEW = { focusOn: false, focus: new THREE.Vector3(), camDist: 0 };
const _lodV = new THREE.Vector3();
const LOWER_TIER = Object.freeze({ hero: 'kitten', kitten: 'npc', npc: 'npc' });

/** Current fur quality name. */
export function getFurQuality() { return _quality; }
/** Shell count for a tier at the current quality. */
export function shellsFor(tier) { return (_quality === 'custom' ? _custom : FUR_QUALITY[_quality] || FUR_QUALITY.med)[tier] ?? 0; }
/**
 * Switch fur quality for every live kitten: a name ('ultra' | 'high' | 'med' | 'low' | 'off') or explicit
 * counts `{ hero, kitten, npc }` (runtime.initCharacters maps core's QUALITY.furShells / kittenShells this way).
 * @param {string | {hero?: number, kitten?: number, npc?: number}} q
 */
export function setFurQuality(q) {
  if (q && typeof q === 'object') {
    _custom = { hero: q.hero ?? 16, kitten: q.kitten ?? 10, npc: q.npc ?? 0 };
    _quality = 'custom';
  } else if (FUR_QUALITY[q]) _quality = q;
  else return;
  for (const p of _parts) (p.owner ? p.owner._applyLod() : p.setShells(shellsFor(p.tier)));
}

/**
 * Shells drawn in iso PLAY (ART §6.1, X8: QUALITY.furShellsIso / kittenShellsIso, 0 on every tier today; High hero 4
 * only if PERF S2 passes). `shellsFor` / `setFurQuality` above are the CLOSE-UP counts (cam.closeUp, cutscenes,
 * Photo Cam, tools). Kittens built for play (`lod: 'play'`) switch between the two on `setCloseUp`.
 */
let _iso = { hero: 0, kitten: 0, npc: 0 };
/** @param {{hero?: number, kitten?: number, npc?: number}} o */
export function setFurIsoShells(o = {}) {
  _iso = { hero: Math.max(0, o.hero ?? 0), kitten: Math.max(0, o.kitten ?? 0), npc: Math.max(0, o.npc ?? 0) };
  for (const p of _parts) if (p.owner) p.owner._applyLod();
}
/** Iso play shell count for a tier. */
export function isoShellsFor(tier) { return _iso[tier] ?? 0; }

// ---------------------------------------------------------------- shared uniforms

/** World-space wind for all fur (Env can write into `.value`). */
export const FUR_WIND = { value: new THREE.Vector3(0.12, 0, 0.06) };
/** Global fur time (advanced by kittens' update; any one call per frame is enough). */
export const FUR_TIME = { value: 0 };
let _timeFrame = -1, _timeStamp = -1e9;
const _now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/**
 * Advance shared fur time once per rendered frame. Every kitten calls this from simulate(); with a frameId the
 * first call per frame wins, without one calls closer than 3 ms (same frame) are ignored.
 * @returns {boolean} true when time advanced
 */
export function tickFurTime(dt, frameId) {
  if (frameId !== undefined) { if (frameId === _timeFrame) return false; _timeFrame = frameId; }
  else { const t = _now(); if (t - _timeStamp < 3) return false; _timeStamp = t; }
  FUR_TIME.value += dt;
  return true;
}

// ---------------------------------------------------------------- strand texture (art.md §3.1)

let _strandTex = null;
/** Strand texture defaults: 512² with 96 strands per side (≈2–3 px per strand in the Photo Cam close-up). */
export const STRANDS = Object.freeze({ size: 512, cells: 96, seed: 7 });
/**
 * Strand height field (art.md §3.1), generated once:
 * R = strand height (a tapered cone per jittered cell: thick root, fine tip), G = coverage at the root (1 inside any
 * strand), B = per-STRAND random (colour streaks: neighbouring texels of one strand share it), A = 1.
 */
export function makeStrandTexture(size = STRANDS.size, cells = STRANDS.cells, seed = STRANDS.seed) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = cells * cells, cx = [], cy = [], ch = [], cr = [], cv = [];
  for (let i = 0; i < n; i++) { cx[i] = 0.15 + rnd() * 0.7; cy[i] = 0.15 + rnd() * 0.7; ch[i] = 0.45 + rnd() * 0.55; cr[i] = 0.42 + rnd() * 0.2; cv[i] = rnd(); }
  const cs = size / cells, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
    // tallest strand among the 3x3 neighbouring cells (jittered centres overlap cell borders)
    let best = 0, id = -1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = (gx + ox + cells) % cells, ny = (gy + oy + cells) % cells, i = ny * cells + nx;
      const d = Math.hypot((x + 0.5) / cs - (gx + ox) - cx[i], (y + 0.5) / cs - (gy + oy) - cy[i]) / cr[i];
      if (d < 1) { const h = ch[i] * (1 - d) * (1 - d * 0.35); if (h > best) { best = h; id = i; } }
    }
    const o = (y * size + x) * 4;
    data[o] = 255 * best; data[o + 1] = best > 0 ? 255 : 0; data[o + 2] = 255 * (id >= 0 ? cv[id] : 0.5); data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
export function strandTexture() { return _strandTex || (_strandTex = makeStrandTexture()); }

// ---------------------------------------------------------------- coat painting (art.md §2.3, §3.2, §7)

/** Face feature anchors in HEAD space (head bone at the neck, y = 0.62 H). */
export const FACE = Object.freeze({
  skull: [0, 0.165, 0], skullScale: [1.18, 0.96, 1.0], skullR: 0.145,
  // ART_WARM §6.3 / §5.3: bigger, a touch wider-set, slightly lower eyes (with the ×1.17 head: ≈ 0.12 H across)
  eyeL: [0.081, 0.15, 0.118], eyeR: [-0.081, 0.15, 0.118], nose: [0, 0.12, 0.158],
  mouth: [0, 0.1, 0.15], muzzle: [0, 0.097, 0.135], chin: [0, 0.064, 0.108], pad: [0.028, 0.097, 0.125], eyeR0: 0.051,
  cheek: [0.118, 0.08, 0.022], cheekR: 0.093, cheekScale: [1, 0.9, 0.82],
});
const _d3 = (p, a) => Math.hypot(p.x - a[0], p.y - a[1], p.z - a[2]);

/**
 * Coat colour (linear rgb) at a point.
 * @param {object} coat  { pattern, base, deep, light, cream, white?, patches?, points?, stripe?, muzzle?, smudge? }
 * @param {'head'|'cheek'|'muzzle'|'bib'|'tail'|'body'|'leg'|'paw'|'ear'} region
 * @param {THREE.Vector3} p  position in the region's space (head space for head parts; root space otherwise)
 * @param {object} [o] { t: tail parameter 0..1, side: ±1 }
 */
export function coatColor(coat, region, p, o = {}) {
  const base = rgb(coat.base), deep = rgb(coat.deep || coat.base), cream = rgb(coat.cream || coat.base);
  const white = coat.white ? rgb(coat.white) : cream;
  const pat = coat.pattern || 'solid';
  let c = base;
  const n = fbm3(p.x * 9 + 3.1, p.y * 9 + 1.7, p.z * 9 + 5.3, 3);
  const stripeK = coat.stripe ?? 0.3;
  const stripe = (v) => smoothstep(0.55, 0.85, 0.5 + 0.5 * Math.sin(v)) * stripeK;

  // ---- tabby stripes
  if (pat === 'mackerel' || pat === 'tabby' || pat === 'dilute') {
    if (region === 'head') {
      const fore = smoothstep(0.19, 0.25, p.y) * smoothstep(-0.02, 0.06, p.z) * smoothstep(0.1, 0.03, Math.abs(p.x) - 0.02);
      const cheek = smoothstep(0.08, 0.13, Math.abs(p.x)) * smoothstep(0.2, 0.12, p.y);
      let s = stripe(p.x * 75 + n * 2.0) * fore * 1.6 + stripe(p.y * 70 + n * 3.0 + Math.abs(p.x) * 20) * cheek * 0.8;
      s += stripe(p.x * 40 + p.z * 25 + n * 4) * smoothstep(0.0, -0.08, p.z) * 0.7; // back of head
      c = mixRgb(c, deep, s);
    } else if (region === 'tail') {
      c = mixRgb(c, deep, stripe((o.t ?? 0) * 46 + n * 2.0) * 1.1);
    } else if (region === 'body' || region === 'leg') {
      c = mixRgb(c, deep, stripe(p.y * 60 + n * 3.0) * 0.9);
    } else if (region === 'ear') {
      c = mixRgb(c, deep, 0.15);
    }
  }
  // ---- calico / tortie patches
  if (pat === 'calico') {
    const cols = (coat.patches || ['#E09A4E', '#2A2624']).map(rgb);
    const ps = coat.patchScale ?? 1;
    const a = fbm3(p.x * 6 * ps + 11, p.y * 6 * ps + 2, p.z * 6 * ps + 7, 3), b = fbm3(p.x * 7 * ps + 31, p.y * 7 * ps + 13, p.z * 7 * ps + 3, 3);
    if (a > 0.52) c = mixRgb(c, cols[0], smoothstep(0.52, 0.56, a));
    if (b > 0.56) c = mixRgb(c, cols[1] || cols[0], smoothstep(0.56, 0.6, b));
  }
  // ---- cream / white zones (muzzle, chin, bib, belly, paws, tail tip & underside)
  let creamK = 0;
  const bibC = coat.bib ? rgb(coat.bib) : null;
  if (region === 'head' || region === 'cheek' || region === 'muzzle') {
    const dm = _d3(p, FACE.muzzle);
    creamK = Math.max(creamK, smoothstep(0.07, 0.035, dm));
    creamK = Math.max(creamK, smoothstep(0.09, 0.05, p.y) * smoothstep(0.03, 0.1, p.z)); // chin / throat
    if (region === 'cheek') creamK = Math.max(creamK, smoothstep(0.06, 0.13, p.z) * smoothstep(0.07, 0.02, p.y) * 0.55);
    if (region === 'muzzle') creamK = 0.9;
    // pale ring around the eyes (ref2)
    const de = Math.min(_d3(p, FACE.eyeL), _d3(p, FACE.eyeR));
    creamK = Math.max(creamK, smoothstep(0.07, 0.05, de) * 0.3);
  } else if (region === 'bib') creamK = 1;
  else if (region === 'paw') creamK = coat.pawsCream === false ? 0 : 0.85;
  else if (region === 'tail') {
    const t = o.t ?? 0;
    creamK = Math.max(smoothstep(0.78, 0.95, t), smoothstep(0.2, -0.6, o.under ?? 0) * 0.65);
  } else if (region === 'body') creamK = smoothstep(0.05, 0.14, p.z) * smoothstep(0.42, 0.3, p.y) * 0.6;
  if (pat === 'tuxedo' || pat === 'bicolour') {
    if (region === 'head') {
      const blaze = smoothstep(0.018, 0.008, Math.abs(p.x)) * smoothstep(0.24, 0.2, p.y) * smoothstep(0.08, 0.14, p.z);
      creamK = Math.max(creamK, blaze);
      creamK = creamK > 0.5 ? 1 : creamK * 1.4;
    }
    if (region === 'paw' || region === 'bib') creamK = 1;
    if (region === 'tail') creamK = 0;
    c = mixRgb(c, white, clamp(creamK, 0, 1));
  } else if (pat === 'solid') {
    c = mixRgb(c, cream, clamp(creamK, 0, 1) * 0.6);
  } else if (pat === 'siamese') {
    c = mixRgb(c, cream, clamp(creamK, 0, 1) * 0.5);
  } else {
    const cr = region === 'bib' && bibC ? bibC : (region === 'head' || region === 'cheek' || region === 'muzzle') && coat.face ? mixRgb(cream, rgb(coat.face), smoothstep(0.12, 0.06, p.y)) : cream;
    c = mixRgb(c, cr, clamp(creamK, 0, 1));
  }
  // ---- siamese points
  if (pat === 'siamese' && coat.points) {
    const pc = rgb(coat.points);
    let k = 0;
    if (region === 'head' || region === 'muzzle' || region === 'cheek') k = smoothstep(0.1, 0.04, _d3(p, FACE.nose)) * 0.95 + smoothstep(0.13, 0.09, _d3(p, FACE.nose)) * 0.25;
    if (region === 'ear') k = 0.95;
    if (region === 'tail') k = smoothstep(0.1, 0.5, o.t ?? 0);
    if (region === 'paw') k = 0.9;
    if (region === 'leg') k = smoothstep(0.22, 0.06, p.y) * 0.8;
    c = mixRgb(c, pc, clamp(k, 0, 1));
  }
  // ---- age (grey muzzle) and soot smudge
  if (coat.muzzle && (region === 'head' || region === 'muzzle')) c = mixRgb(c, rgb(coat.muzzle), smoothstep(0.09, 0.05, _d3(p, FACE.muzzle)) * 0.85);
  if (coat.smudge && (region === 'head' || region === 'cheek' || region === 'muzzle')) {
    const s = coat.smudge; c = mixRgb(c, rgb(s.color || '#3A3634'), smoothstep(s.r || 0.03, (s.r || 0.03) * 0.4, _d3(p, s.at)) * 0.85);
  }
  // gentle large-scale value variation so flat coats read as fur
  const v = lerp(0.92, 1.06, fbm3(p.x * 4 + 9, p.y * 4 + 4, p.z * 4 + 1, 2));
  return [c[0] * v, c[1] * v, c[2] * v];
}

/**
 * Fur mask [density, lengthMul] in head space: 0 around eyes, nose and mouth (art.md §3.2), short on the muzzle,
 * long on the cheek ruff.
 */
export function headFurMask(p, region, eyeScale = 1) {
  const er = FACE.eyeR0 * eyeScale;
  const de = Math.min(_d3(p, FACE.eyeL), _d3(p, FACE.eyeR));
  let m = smoothstep(er * 1.02, er * 1.55, de);
  m *= smoothstep(0.018, 0.034, _d3(p, FACE.nose));
  m *= smoothstep(0.012, 0.03, _d3(p, FACE.mouth));
  let len = 1;
  if (region === 'cheek') len = 1.2;   // 1.38 stacked visible shell rings over the face in close-ups (story 10c)
  else if (region === 'muzzle') len = 0.32;
  else {
    len = lerp(0.35, 1.0, smoothstep(0.03, 0.075, _d3(p, FACE.muzzle)));
    len *= lerp(1.0, 1.15, smoothstep(0.1, 0.0, p.z)); // fuller at the back / sides
  }
  return [m, len];
}

// ---------------------------------------------------------------- shell material (art.md §3.3)

const FUR_VERT = /* glsl */`
uniform float uFurLen, uShells, uTime, uDensityBoost, uComb;
uniform vec3 uGravity, uWind, uDrag;
attribute vec2 fur;
attribute vec3 comb;
#ifdef FUR_BAKED
attribute float aShell;
#endif
varying vec3 vObjPos, vObjN, vWN, vWPos, vCoat;
varying float vH, vMask;
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>
void main() {
#ifdef FUR_BAKED
  float h = aShell / max(uShells, 1.0);
#else
  float h = float(gl_InstanceID) / max(uShells, 1.0);
#endif
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  float len = uFurLen * fur.y * smoothstep(0.0, 0.35, fur.x);
  vec3 nn = normalize(normal);
  vec3 cd = comb - nn * dot(nn, comb);            // comb direction projected onto the surface
  vec3 transformed = position + nn * len * h + cd * len * h * h * uComb;
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  float sc = length(modelMatrix[0].xyz);
  float k = h * h;
  float flutter = 0.6 + 0.4 * sin(uTime * 3.1 + dot(position, vec3(23.0, 17.0, 11.0)));
  wp.xyz += (uGravity * 0.35 + (uWind + uDrag) * flutter) * len * sc * k;
  vWPos = wp.xyz; vObjPos = position; vObjN = normalize(normal); vH = h; vMask = fur.x; vCoat = color;
  vWN = normalize(mat3(modelMatrix) * objectNormal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FUR_FRAG = /* glsl */`
uniform sampler2D uStrands;
uniform float uSheen;
uniform float uTiling, uRimStrength, uHoly, uAmbMul, uSunMul, uRootDark, uFlash, uDensityBoost, uStretch, uCells, uStreak, uEdgeFade, uEdgeStart, uFringe, uCloseEdge, uCloseThin;
uniform vec2 uCloseRange;
uniform vec3 uTipTint, uRimColor, uHolyColor, uHighlight, uWarmFill;
uniform float uWarmFillK;
varying vec3 vObjPos, vObjN, vWN, vWPos, vCoat;
varying float vH, vMask;
#include <common>
#include <lights_pars_begin>
#include <fog_pars_fragment>
vec3 strands(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x + w.y + w.z);
  // strands are elongated along the (mostly downward / backward) comb so they read as streaks, not dots
  return texture2D(uStrands, vec2(p.y * uStretch, p.z)).rgb * w.x + texture2D(uStrands, vec2(p.z * uStretch, p.x)).rgb * w.y + texture2D(uStrands, vec2(p.x, p.y * uStretch)).rgb * w.z;
}
void main() {
  float alpha = 1.0;
  float streak = 0.5;
  if (vH > 0.0) {
    vec3 tp = vObjPos * uTiling;
    vec3 st = strands(tp, vObjN);
    float dens = min(vMask * uDensityBoost, 1.0);
    float s = st.r * dens;
    streak = st.b;
    // strand edge softness follows the pixel footprint: crisp strands up close, a soft volume when they go sub-pixel
    float fw = fwidth(s);
    float sharp = smoothstep(vH - 0.05 - fw, vH + 0.02 + fw, s);
    // expected coverage of a tapered strand field at this height (what a pixel covering many strands sees)
    float foot = length(fwidth(tp)) * uCells;
    // dense body for the inner half of the length, then a quick fade: a soft but defined fluffy edge (not a blur)
    // (uFringe < 1 pulls that edge in: dark coats against the pale fog otherwise read as a smudgy dark halo)
    float vol = (1.0 - smoothstep(0.42 * uFringe, 0.86 * uFringe, vH)) * dens;
    alpha = mix(sharp, vol, smoothstep(0.35, 1.25, foot)) * mix(1.0, 0.5, vH * vH);
    // edge-on, each outer shell's silhouette shows as a ring ("onion layers"): fade the outer shells there so the
    // silhouette turns into a soft fringe instead
    float ndv = abs(dot(normalize(vWN), normalize(cameraPosition - vWPos)));
    // close-ups (dialogue cameras ~1-2.5 m): the shells' screen spacing grows and the combed outer shells of the
    // cheek ruff / muzzle stack into rings, a blurry halo smudge over the face (story 10c / 11c). Near the lens the
    // edge fade reaches further in and starts lower, so the face keeps a crisp silhouette with a soft fringe
    float nearK = 1.0 - smoothstep(uCloseRange.x, uCloseRange.y, length(cameraPosition - vWPos));
    float eFade = mix(uEdgeFade, max(uEdgeFade, uCloseEdge), nearK), eStart = mix(uEdgeStart, min(uEdgeStart, 0.1), nearK);
    alpha *= mix(1.0, smoothstep(0.02, eFade, ndv), smoothstep(eStart, eStart + 0.5, vH));
    // ...and the outer shells thin out: their intersections with the skull / cheek shells are the concentric rings
    alpha *= 1.0 - nearK * uCloseThin * smoothstep(0.4, 1.0, vH);
    if (alpha < 0.06) discard;   // nearly invisible tips must not write depth over what is behind them
  }
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 albedo = (vCoat * mix(uRootDark, 1.0, vH) + uTipTint * vH * vH) * mix(1.0 - uStreak, 1.0 + uStreak, streak);
  vec3 nView = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec3 irr = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) irr += getHemisphereLightIrradiance(hemisphereLights[i], nView);
  #endif
  // warm fill (WARM_ADVENTURE WA4): the fur's strong ambient term took the blue / plum sky colour of twilight presets,
  // a blue-grey haze over cream muzzles and grey coats in close-ups; keep its brightness, pull its hue to warm cream
  irr = mix(irr, uWarmFill * dot(irr, vec3(0.2126, 0.7152, 0.0722)), uWarmFillK);
  vec3 direct = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    float wrap = saturate((dot(nView, directionalLights[i].direction) + 0.5) / 1.5);
    direct += directionalLights[i].color * wrap;
  }
  #endif
  #if NUM_POINT_LIGHTS > 0
  vec3 vPosView = (viewMatrix * vec4(vWPos, 1.0)).xyz;
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
    IncidentLight pl; getPointLightInfo(pointLights[i], vPosView, pl);
    float wrap = saturate((dot(nView, pl.direction) + 0.4) / 1.4);
    direct += pl.color * wrap;
  }
  #endif
  float rim = pow(1.0 - saturate(dot(N, V)), 3.0) * (0.35 + 0.65 * vH);
  vec3 rimCol = mix(uRimColor * uRimStrength, uHolyColor * 1.05, uHoly);
  vec3 col = albedo * (irr * uAmbMul + direct * uSunMul) * RECIPROCAL_PI + rim * rimCol;
  // sky sheen (dark coats only, uSheen > 0): black fur reflects the overcast sky as a soft grey-blue gloss that keeps
  // its form readable under day fog (Mochi read as a black hole, STATUS M1); stronger toward the strand tips
  col += irr * (uSheen * (0.45 + 0.55 * vH)) * RECIPROCAL_PI;
  col += albedo * uHolyColor * uHoly * 0.07 + vec3(uFlash);   // stays ginger under the glow (ref1)
  // hover / selection rim (characters.setHighlight; CONTROLS_SPEC §7.4)
  col += uHighlight * (pow(1.0 - saturate(dot(N, V)), 2.0) * 1.4 + 0.08);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * Close-up fringe (story close-ups): within `near` m of the lens the edge-on fade reaches `edgeFade` (n·v) and starts
 * at shell 0.1, and the outer shells thin out by `thin`; it blends back to the material's own edge fade by `far` m (gameplay / Photo Cam distances unchanged).
 */
export const FUR_CLOSE = Object.freeze({ near: 2.0, far: 4.0, edgeFade: 0.7, thin: 0.85 });

/**
 * Warm fill (WARM_ADVENTURE WA4): the fur's ambient / hemisphere irradiance keeps its luminance but takes this warm
 * cream hue by `k` (0 = the raw sky colour). The rim is the same warm cream (#FFE9D2).
 */
export const FUR_WARM_FILL = Object.freeze({ color: '#FFE9D2', k: 0.6 });
/** Linear colour of `hex` scaled to luminance 1 (the fill multiplies it by the irradiance luminance). */
function warmFillColor(hex) {
  const c = new THREE.Color(hex), l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar(1 / Math.max(l, 1e-3));
}

/**
 * Shell fur material. One per kitten (uniforms: shells, holy, drag). Programs are shared.
 * @param {{ baked?: boolean, len?: number, tiling?: number, shells?: number, rim?: number }} o
 */
export function makeFurMaterial(o = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexColors: true, fog: true, lights: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, {
      uStrands: { value: null }, uTiling: { value: o.tiling ?? 3.0 }, uShells: { value: o.shells ?? 16 }, uFurLen: { value: o.len ?? 0.045 },
      uGravity: { value: new THREE.Vector3(0, -1, 0) }, uDrag: { value: new THREE.Vector3() },
      uTipTint: { value: new THREE.Color(o.tipTint ?? PAL.furGingerLight).multiplyScalar(0.18) },
      uRimColor: { value: new THREE.Color('#FFE9D2') }, uRimStrength: { value: o.rim ?? 0.3 },
      uHoly: { value: 0 }, uSheen: { value: o.sheen ?? 0 }, uAmbMul: { value: o.ambMul ?? 1.55 }, uSunMul: { value: o.sunMul ?? 1.0 },
      uRootDark: { value: o.rootDark ?? 0.82 }, uDensityBoost: { value: o.density ?? 1.5 }, uFlash: { value: 0 }, uHighlight: { value: new THREE.Color(0, 0, 0) },
      uComb: { value: o.comb ?? 1.6 }, uStretch: { value: o.stretch ?? 0.65 },
      uCells: { value: STRANDS.cells }, uStreak: { value: o.streak ?? 0.09 }, uEdgeFade: { value: o.edgeFade ?? 0.35 },
      uEdgeStart: { value: o.edgeStart ?? 0.35 }, uFringe: { value: o.fringe ?? 1 },
      uCloseEdge: { value: o.closeEdge ?? FUR_CLOSE.edgeFade }, uCloseThin: { value: o.closeThin ?? FUR_CLOSE.thin },
      uWarmFill: { value: warmFillColor(FUR_WARM_FILL.color) }, uWarmFillK: { value: o.warmFill ?? FUR_WARM_FILL.k }, uCloseRange: { value: new THREE.Vector2(FUR_CLOSE.near, FUR_CLOSE.far) },
    }]),
    vertexShader: FUR_VERT, fragmentShader: FUR_FRAG,
  });
  // shared objects (not cloned by merge)
  mat.uniforms.uStrands.value = strandTexture();
  mat.uniforms.uWind = FUR_WIND;
  mat.uniforms.uTime = FUR_TIME;
  mat.uniforms.uHolyColor = HOLY_COLOR;
  if (o.baked) mat.defines = { FUR_BAKED: '' };
  // Soft shells: alpha-blended, drawn in instance order (skin → tip), which is back-to-front on the visible side.
  // Depth writes stay on so the outer shells of one part never get overdrawn by its inner shells.
  // (Alpha-to-coverage dithered the strand tips into salt-and-pepper speckles against the bright fog.)
  mat.transparent = true;
  mat.depthWrite = true;
  return own(mat);
}

/** Render order for shell fur (after the opaque pass; whiskers draw after it). */
export const FUR_RENDER_ORDER = 1;

// ---------------------------------------------------------------- fur parts

/**
 * A fur surface: base skin layer + N shells.
 * Rigid parts use an InstancedMesh (instance i = shell i; instance 0 = skin).
 * Skinned parts (tail) bake their shell copies into the geometry with an `aShell` attribute and use drawRange.
 */
export class FurPart {
  /**
   * @param {THREE.BufferGeometry} geo  must carry position, normal, color, fur, rmse (+ skinIndex/skinWeight if skinned)
   * @param {object} o { furMat, bakedMat, sheenMat, tier, skeleton?, maxShells?, shells?, bake? }: `bake` (skinned
   *   parts) = shell copies baked at build (default: the shell count). A play-LOD kitten bakes its iso count (0) and
   *   reserve()s the close-up copies in idle time (PERF H4: no hidden shell geometry built at spawn).
   */
  constructor(geo, o) {
    this.tier = o.tier || 'kitten';
    /** The kitten that owns this part (its LOD decides the shell count on quality changes), or null. */
    this.owner = o.owner ?? null;
    this.furMat = o.furMat; this.sheenMat = o.sheenMat;
    this.maxShells = o.maxShells ?? MAX_SHELLS;
    if (o.skeleton) {
      this.furMat = o.bakedMat;
      this.idxPerShell = geo.index.count;
      // bake only the shells the current quality draws (Low: the base layer alone, not 25 copies on the GPU);
      // setShells() re-bakes (to the current close-up count, or more) the first time more are asked for
      this._src = geo;
      this.baked = true;
      this.bakedShells = clamp(Math.round(o.bake ?? o.shells ?? shellsFor(this.tier)), 0, this.maxShells);
      const g = bakeShells(geo, this.bakedShells);
      this.mesh = new THREE.SkinnedMesh(g, this.furMat);
      this.mesh.bind(o.skeleton, o.bindMatrix || new THREE.Matrix4());
    } else {
      this.baked = false;
      this.mesh = new THREE.InstancedMesh(geo, this.furMat, this.maxShells + 1);
    }
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = FUR_RENDER_ORDER;
    // shells never render into shadow maps (17x cost); the kitten adds a low-poly shadow proxy instead
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.name = o.name || 'fur';
    this.shells = -1;
    this._lodN = -1;
    this.setShells(o.shells ?? shellsFor(this.tier));
    // per-draw distance LOD: fewer shells far away (cheaper, and no shimmering strand tips)
    this.mesh.onBeforeRender = (renderer, scene, camera) => this._lod(camera);
    _parts.add(this);
  }
  _lod(camera) {
    const n0 = this.shells;
    if (n0 <= 0) return;
    _lodV.setFromMatrixPosition(this.mesh.matrixWorld);
    const n = furLodShells(this.tier, n0, _lodV, camera.position);
    if (n === this._lodN) return;
    this._lodN = n;
    if (this.baked) this.mesh.geometry.setDrawRange(0, this.idxPerShell * (n + 1));
    else this.mesh.count = n + 1;
    this.furMat.uniforms.uShells.value = Math.max(n, 1);
    this.furMat.uniformsNeedUpdate = true;
  }
  /** @param {number} n 0 = sheen fallback */
  setShells(n) {
    n = clamp(Math.round(n), 0, this.maxShells);
    if (n === this.shells) return;
    this.shells = n; this._lodN = -1;
    if (this.baked && n > this.bakedShells) this._rebake(Math.min(this.maxShells, Math.max(n, shellsFor(this.tier))));
    const mat = n > 0 ? this.furMat : this.sheenMat;
    this.mesh.material = mat;
    if (n > 0) mat.uniforms.uShells.value = n;
    if (this.baked) this.mesh.geometry.setDrawRange(0, this.idxPerShell * (n + 1));
    else this.mesh.count = n + 1;
  }
  /**
   * Make sure a baked part holds at least `n` shell copies (idle-time pre-bake, so the close-up frame never re-bakes).
   * No-op for instanced parts or when enough copies are baked already.
   * @param {number} n
   * @returns {boolean} true when it re-baked
   */
  reserve(n) {
    n = clamp(Math.round(n), 0, this.maxShells);
    if (!this.baked || n <= this.bakedShells) return false;
    this._rebake(n);
    this._lodN = -1;
    if (this.shells >= 0) this.mesh.geometry.setDrawRange(0, this.idxPerShell * (this.shells + 1));
    return true;
  }
  /** Re-bake the skinned shell copies for up to `n` shells (the old GPU buffers are released). */
  _rebake(n) {
    const old = this.mesh.geometry;
    this.mesh.geometry = bakeShells(this._src, n);
    this.bakedShells = n;
    old.dispose();
  }
  /**
   * Swap the surface geometry (the close-up set replaces the play-detail one, ART §6.4). Baked parts re-bake the copies
   * they hold; instanced parts just point at the new base geometry. The old geometry is disposed.
   * @param {THREE.BufferGeometry} geo
   * @param {number} [bake] baked parts: shell copies to bake from the new source (never fewer than held now)
   */
  setSource(geo, bake = 0) {
    if (this.baked) {
      const oldSrc = this._src; this._src = geo; this.idxPerShell = geo.index.count;
      this._rebake(clamp(Math.round(Math.max(bake, this.bakedShells)), 0, this.maxShells));
      if (oldSrc && oldSrc !== geo) oldSrc.dispose();
    } else {
      const old = this.mesh.geometry; this.mesh.geometry = geo;
      if (old !== geo) old.dispose();
    }
    this._lodN = -1;
    const n = this.shells; this.shells = -1; this.setShells(n);
  }
  /** Shells allocated on the GPU (baked parts; instanced parts allocate instances only). */
  get allocatedShells() { return this.baked ? this.bakedShells : this.maxShells; }
  dispose() { _parts.delete(this); this.mesh.geometry.dispose(); this._src = null; }
}

/**
 * Shell count to draw for a fur part of `tier` allocated `n0` shells, at world position `pos`, seen from `lens`
 * (pure; FurPart._lod and the unit tests use it). Reads FUR_VIEW for the focus rule.
 * @param {string} tier @param {number} n0 @param {THREE.Vector3} pos @param {THREE.Vector3} lens
 */
export function furLodShells(tier, n0, pos, lens) {
  if (n0 <= 0) return 0;
  if (FUR_VIEW.focusOn) {
    const L = FUR_LOD_ISO;
    if (tier === 'hero') return pos.distanceTo(lens) <= L.heroLens ? n0 : 0;
    let base = n0;
    if (FUR_VIEW.camDist > L.dropAt) base = Math.min(n0, shellsFor(LOWER_TIER[tier] ?? 'npc'));
    if (base <= 0) return 0;
    const df = Math.hypot(pos.x - FUR_VIEW.focus.x, pos.z - FUR_VIEW.focus.z);
    const k = clamp((L.far - df) / (L.far - L.near), 0, 1);
    return k <= 0 ? 0 : Math.max(Math.min(L.min, base), Math.round(base * k));
  }
  const d = pos.distanceTo(lens);
  const k = clamp((FUR_LOD.far - d) / (FUR_LOD.far - FUR_LOD.near), 0, 1);
  return k <= 0 ? 0 : Math.max(Math.min(FUR_LOD.min, n0), Math.round(n0 * k));
}

/** Duplicate an indexed geometry (shells 0..n) with an `aShell` attribute; shell-major order for drawRange. */
export function bakeShells(geo, n) {
  const out = new THREE.BufferGeometry();
  const vc = geo.attributes.position.count, copies = n + 1;
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const Arr = attr.array.constructor, src = attr.array, dst = new Arr(src.length * copies);
    for (let c = 0; c < copies; c++) dst.set(src, c * src.length);
    out.setAttribute(name, new THREE.BufferAttribute(dst, attr.itemSize, attr.normalized));
  }
  const sh = new Float32Array(vc * copies);
  for (let c = 0; c < copies; c++) sh.fill(c, c * vc, (c + 1) * vc);
  out.setAttribute('aShell', new THREE.BufferAttribute(sh, 1));
  const I = geo.index.array, ic = I.length, total = vc * copies;
  const idx = total > 65535 ? new Uint32Array(ic * copies) : new Uint16Array(ic * copies);
  for (let c = 0; c < copies; c++) for (let i = 0; i < ic; i++) idx[c * ic + i] = I[i] + c * vc;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Live fur part count (debug / tests). */
export function liveFurParts() { return _parts.size; }
