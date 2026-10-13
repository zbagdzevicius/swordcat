// src/enemies/palette.js  (owner: enemies) — ART_WARM_SPEC §7.2 / §7.3 data: the palette maps that turn the CC0 GLB
// atlases into the warm "mischief family" (§2.6), and the static bone scales that give every foe a big, readable head.
// PALETTE_MAPS sits beside MODEL_FIT in spirit (keyed by the same asset paths); it lives here because enemies own it.
//
// Swatch lists come from a one-off dump of each atlas, sampled at the meshes' UVs (Pigeon: 4 swatches used out of 50).
// KayKit atlases are painted gradients, so they use hue bands (rig.recolorBands) instead of exact swatches.
// Rules (§2.6 / WA §3.1): enemy bodies sit at hue 200–290° (plum, slate) with one bright top colour (mustard, teal);
// never pink or ginger; nothing darker than luma 0.12 except pupils.
import { ENEMY_PAL as P } from './props.js';

/** ART §7.2 Squeakybones: one palette for every KayKit skeleton (shared atlas; cached per texture). */
const BONEHEAD_MAP = Object.freeze({ key: 'bonehead', bands: [
  { h: [0, 360], s: [0, 1], v: [0, 0.16], ref: '#151c1e', to: '#3E3550' },
  { h: [15, 50], s: [0, 0.45], v: [0.62, 1], ref: '#efd8bd', to: P.biscuit },
  { h: [320, 12], s: [0.4, 1], v: [0.2, 1], ref: '#c22a40', to: P.mustard },
  { h: [170, 240], s: [0, 0.3], v: [0.16, 0.75], ref: '#59606a', to: P.slate },
] });

/** Asset path → palette map ({ pairs, tol } nearest swatch and / or { bands } hue bands) + its cache key. */
export const PALETTE_MAPS = Object.freeze({
  // crow (§7.2, WA §3.1): body slate-violet, wings / neck a lighter violet, beak + feet mustard, eyes plum ink (cream-sclera
  // eyes are a prop). The old low-chroma slate washed to pink-mauve under the warm fog, a hue reserved for her.
  'models/creatures/monsters-flying/Pigeon.glb': Object.freeze({ key: 'crow2', tol: 28,
    pairs: [['#8f92a0', P.crowBody], ['#5c458b', P.crowWing], ['#cc9129', P.mustard], ['#1e1f22', P.pupil]] }),
  // hyena / Cacklejaw bodies (Barbarian): bare arms → lilac fur (WA §3.1: never ginger; the mustard spots live on the
  // beast head), cloth → plum, leather → slate, near-black boots / belts → plum ink (never black)
  'models/characters/kaykit/Barbarian.glb': Object.freeze({ key: 'hyena2', bands: [
    { h: [0, 360], s: [0, 1], v: [0, 0.16], ref: '#151c1e', to: '#3E3550' },
    { h: [8, 42], s: [0.12, 0.5], v: [0.82, 1], ref: '#f7c4a1', to: P.hyenaFur },
    { h: [185, 240], s: [0.15, 1], v: [0.16, 1], ref: '#4b6a7f', to: P.mischiefPlum },
    { h: [0, 32], s: [0.3, 0.9], v: [0.16, 0.82], ref: '#93523e', to: P.slate },
  ] }),
  // stealer / Pilfer (Rogue_Hooded): the green cloak → Snickerpack teal (top colour), leather → slate, skin → tawny
  'models/characters/kaykit/Rogue_Hooded.glb': Object.freeze({ key: 'stealer2', bands: [
    { h: [0, 360], s: [0, 1], v: [0, 0.16], ref: '#151c1e', to: '#3E3550' },
    { h: [8, 42], s: [0.12, 0.5], v: [0.82, 1], ref: '#f2a87e', to: P.hyenaFur },
    { h: [135, 180], s: [0.45, 1], v: [0.16, 1], ref: '#008c55', to: P.teal },
    { h: [0, 32], s: [0.3, 0.9], v: [0.16, 0.82], ref: '#965541', to: P.mischiefPlum },
  ] }),
  // pug / Sir Brutus / Lord Barkus (Knight): WA §3.1 "no silver plate on any foe" (that is her read) — the steel plate
  // and shield → painted plum tin, the red stripe → mustard, leather → deep plum
  'models/characters/kaykit/Knight.glb': Object.freeze({ key: 'pug2', bands: [
    { h: [0, 360], s: [0, 1], v: [0, 0.16], ref: '#151c1e', to: '#3E3550' },
    { h: [330, 12], s: [0.55, 1], v: [0.3, 1], ref: '#c7212a', to: P.mustard },
    { h: [180, 235], s: [0, 0.35], v: [0.2, 1], ref: '#7c868b', to: P.mischiefPlumLight },
    { h: [0, 32], s: [0.3, 0.9], v: [0.16, 0.8], ref: '#9b5a45', to: P.mischiefPlum },
  ] }),
  // Boneheads → Squeakybones (ART §7.2, M3): biscuit-bone toy soldiers. The KayKit skeleton atlas: cream / ivory bone
  // tiles → biscuit #F3E2C4, crimson cloth → the mustard bandana top colour, cold greys → slate, near-black → plum ink
  ...Object.fromEntries(['Minion', 'Warrior', 'Rogue', 'Mage'].map((v) => [`models/creatures/skeletons/Skeleton_${v}.glb`, BONEHEAD_MAP])),
});

/** The palette map for a model path (null = keep its own colours). */
export function paletteFor(path) {
  if (!path) return null;
  const k = String(path).replace(/^\/?(assets\/)?/, '');
  return PALETTE_MAPS[k] ?? null;
}

/**
 * ART §7.2 static bone scales (net factors, rig.scaleBones). Rat.glb, Pigeon.glb and Spider.glb carry no scale tracks;
 * KayKit's constant scale tracks are stripped at load (rig.stripConstantScaleTracks) before any of its bones is scaled.
 */
export const BONE_SCALES = Object.freeze({
  // rat_pike / rat_xbow / Grizzlechop: head ≥ 35 % of the body height
  rat: Object.freeze({ Body: 1.1, Neck: 1.1, Head: 1.45, Tail1: 0.75, 'FrontLeg.L': 0.9, 'FrontLeg.R': 0.9, 'BackLeg.L': 0.9, 'BackLeg.R': 0.9 }),
  // crow: a big round head
  crow: Object.freeze({ Head: 1.35 }),
  // spider → Fuzzball: a round, fuzzy body on short legs
  spider: Object.freeze({ Abdomen: 1.5, Thorax: 1.2, Head: 1.4,
    'FrontLeg.L': 0.75, 'FrontLeg.R': 0.75, 'MidFrontLeg.L': 0.75, 'MidFrontLeg.R': 0.75,
    'MidBackLeg.L': 0.75, 'MidBackLeg.R': 0.75, 'BackLeg.L': 0.75, 'BackLeg.R': 0.75 }),
});

/** Solid-colour GLB materials by name (rig.recolor): the Fuzzball's olive coat with an oliveTop top. */
export const MATERIAL_COLORS = Object.freeze({
  rat: Object.freeze({ Grey: P.ratFur, Pink: P.peach }),
  spider: Object.freeze({ Material: P.olive, 'Material.001': '#6E7A38' }),
});

/** Model path → its BONE_SCALES / MATERIAL_COLORS key (the rig, not the type: Grizzlechop is a rat too). */
const RIG_OF = Object.freeze({
  'models/creatures/polypizza/Rat.glb': 'rat',
  'models/creatures/monsters-flying/Pigeon.glb': 'crow',
  'models/creatures/polypizza/Spider.glb': 'spider',
});

/** ART §7.2 bone scales for a model path (null = none). */
export function boneScalesFor(path) {
  const k = RIG_OF[String(path ?? '').replace(/^\/?(assets\/)?/, '')];
  return k ? BONE_SCALES[k] ?? null : null;
}

// ------------------------------------------------------------------ WA §3.1 foe hues (beast heads + the lint)

/**
 * Beast-head swatch remaps (characters' BEAST_PRESETS key → enemies colour), applied to the head's vertex colours at
 * dress time (recolorHeadGeometry). The characters preset paints a tawny hyena; WA §3.1 forbids ginger on a foe, so the
 * fur goes lilac-plum and the plum spots become small mustard accents (the top colour). Keys a preset lacks are skipped.
 */
export const HEAD_REMAPS = Object.freeze({
  hyena: Object.freeze({ fur: P.hyenaFur, furDark: P.hyenaFurDark, belly: P.hyenaBelly, spots: P.hyenaSpot }),
});

/** Foe body colours the WA §3.1 lint checks (hue 200–290°; never pink 335–350° or ginger 15–40°). */
export const FOE_BODY_COLORS = Object.freeze({
  hyenaFur: P.hyenaFur, hyenaFurDark: P.hyenaFurDark, mischiefPlum: P.mischiefPlum, slate: P.slate,
  crowBody: P.crowBody, crowWing: P.crowWing, jellyBody: P.jellyBody, jellyDeep: P.jellyDeep, cloneLilac: P.cloneLilac,
});

/** '#RRGGBB' → { h (deg), s, v } (sRGB, no colour management). Pure. */
export function hexHsv(hex) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s: mx > 0 ? d / mx : 0, v: mx };
}

/** WA §3.1: is `hex` a legal foe body colour (hue 200–290°, outside her pink 335–350° and ginger 15–40°)? Pure. */
export function isFoeBodyHue(hex) {
  const { h } = hexHsv(hex);
  return h >= 200 && h <= 290 && !(h >= 335 && h <= 350) && !(h >= 15 && h <= 40);
}

/**
 * Remap a vertex-coloured geometry's `color` attribute (linear rgb) from source swatches to targets. Each vertex is
 * projected onto the nearest segment between two source swatches (the builders paint 2-way mixes), takes the same mix
 * of the targets, and keeps its residual (noise, shading). Swatches without a target map to themselves, so a mix of
 * fur and nose stays a mix of lilac and nose. Runs once per dressed head (not per frame); marks the geometry done.
 * @param {{attributes: {color?: {count: number, array: ArrayLike<number>, needsUpdate?: boolean}}, userData?: object}} geo
 * @param {number[][]} src linear rgb sources @param {number[][]} dst linear rgb targets (same length)
 * @returns {number} vertices changed
 */
export function remapVertexColors(geo, src, dst) {
  const col = geo?.attributes?.color;
  if (!col || geo.userData?.foeRemapped) return 0;
  const a = col.array, n = src.length;
  let changed = 0;
  for (let i = 0; i < col.count; i++) {
    const o = i * 3, r = a[o], g = a[o + 1], b = a[o + 2];
    let best = Infinity, bi = 0, bj = 0, bt = 0;
    for (let p = 0; p < n; p++) {
      const s0 = src[p];
      for (let q = p; q < n; q++) {
        const s1 = src[q], dx = s1[0] - s0[0], dy = s1[1] - s0[1], dz = s1[2] - s0[2];
        const L = dx * dx + dy * dy + dz * dz;
        let t = L > 1e-9 ? ((r - s0[0]) * dx + (g - s0[1]) * dy + (b - s0[2]) * dz) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = r - s0[0] - dx * t, ey = g - s0[1] - dy * t, ez = b - s0[2] - dz * t, d = ex * ex + ey * ey + ez * ez;
        if (d < best) { best = d; bi = p; bj = q; bt = t; }
      }
    }
    const s0 = src[bi], s1 = src[bj], t0 = dst[bi], t1 = dst[bj];
    if ((t0 === s0 || bt >= 1) && (t1 === s1 || bt <= 0)) continue;   // only unmapped swatches in the mix
    for (let k = 0; k < 3; k++) {
      const proj = s0[k] + (s1[k] - s0[k]) * bt, to = t0[k] + (t1[k] - t0[k]) * bt;
      const v = to + (a[o + k] - proj);
      a[o + k] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    changed++;
  }
  if (col.needsUpdate !== undefined || 'needsUpdate' in col) col.needsUpdate = true;
  (geo.userData ??= {}).foeRemapped = true;
  return changed;
}
