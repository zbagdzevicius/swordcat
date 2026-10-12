// src/enemies/palette.js  (owner: enemies) — ART_WARM_SPEC §7.2 / §7.3 data: the palette maps that turn the CC0 GLB
// atlases into the warm "mischief family" (§2.6), and the static bone scales that give every foe a big, readable head.
// PALETTE_MAPS sits beside MODEL_FIT in spirit (keyed by the same asset paths); it lives here because enemies own it.
//
// Swatch lists come from a one-off dump of each atlas, sampled at the meshes' UVs (Pigeon: 4 swatches used out of 50).
// KayKit atlases are painted gradients, so they use hue bands (rig.recolorBands) instead of exact swatches.
// Rules (§2.6 / WA §3.1): enemy bodies sit at hue 200–290° (plum, slate) with one bright top colour (mustard, teal);
// never pink or ginger; nothing darker than luma 0.12 except pupils.
import { ENEMY_PAL as P } from './props.js';

/** Asset path → palette map ({ pairs, tol } nearest swatch and / or { bands } hue bands) + its cache key. */
export const PALETTE_MAPS = Object.freeze({
  // crow (§7.2): body slate, wings / neck slateLight, beak + feet mustard, eyes plum ink (cream-sclera eyes are a prop)
  'models/creatures/monsters-flying/Pigeon.glb': Object.freeze({ key: 'crow', tol: 28,
    pairs: [['#8f92a0', P.slate], ['#5c458b', P.slateLight], ['#cc9129', P.mustard], ['#1e1f22', P.pupil]] }),
  // hyena / Cacklejaw bodies (Barbarian): bare arms → tawny (spots live on the beast head), cloth → plum, leather →
  // slate, near-black boots / belts → plum ink (never black)
  'models/characters/kaykit/Barbarian.glb': Object.freeze({ key: 'hyena', bands: [
    { h: [0, 360], s: [0, 1], v: [0, 0.16], ref: '#151c1e', to: '#3E3550' },
    { h: [8, 42], s: [0.12, 0.5], v: [0.82, 1], ref: '#f7c4a1', to: P.hyenaTawny },
    { h: [185, 240], s: [0.15, 1], v: [0.16, 1], ref: '#4b6a7f', to: P.mischiefPlum },
    { h: [0, 32], s: [0.3, 0.9], v: [0.16, 0.82], ref: '#93523e', to: P.slate },
  ] }),
  // stealer / Pilfer (Rogue_Hooded): the green cloak → Snickerpack teal (top colour), leather → slate, skin → tawny
  'models/characters/kaykit/Rogue_Hooded.glb': Object.freeze({ key: 'stealer', bands: [
    { h: [0, 360], s: [0, 1], v: [0, 0.16], ref: '#151c1e', to: '#3E3550' },
    { h: [8, 42], s: [0.12, 0.5], v: [0.82, 1], ref: '#f2a87e', to: P.hyenaTawny },
    { h: [135, 180], s: [0.45, 1], v: [0.16, 1], ref: '#008c55', to: P.teal },
    { h: [0, 32], s: [0.3, 0.9], v: [0.16, 0.82], ref: '#965541', to: P.mischiefPlum },
  ] }),
  // pug / Sir Brutus / Lord Barkus (Knight): armour and shield → slate, the red stripe → mustard, leather → plum
  'models/characters/kaykit/Knight.glb': Object.freeze({ key: 'pug', bands: [
    { h: [0, 360], s: [0, 1], v: [0, 0.16], ref: '#151c1e', to: '#3E3550' },
    { h: [330, 12], s: [0.55, 1], v: [0.3, 1], ref: '#c7212a', to: P.mustard },
    { h: [180, 235], s: [0.04, 0.35], v: [0.2, 0.85], ref: '#7c868b', to: P.slateLight },
    { h: [0, 32], s: [0.3, 0.9], v: [0.16, 0.8], ref: '#9b5a45', to: P.mischiefPlum },
  ] }),
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
