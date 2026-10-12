// src/enemies/props.js  (owner: enemies) — procedural enemy gear in the warm "mischief family" palette (ART_WARM_SPEC
// §2.6 / §7): the rat kettle helm (mustard top colour), a cork-tipped wooden spear, the cheese buckler, the crossbowman
// hood, the crow's 3-tuft mustard crest, friendly cream-sclera eyes with angry brows (never red glints), Grizzlechop's
// tricorn hat with a crown-gold plume, his monocle and moustache. Each prop is ONE mesh (merged parts, vertex colours)
// sharing module-level geometry + materials, built lazily on first use (no GPU work at import). Sizes are metres in
// the enemy's local frame (+Z forward, +Y up, +X = its left). Nothing here is darker than luma 0.12 except pupils.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * ART §2.6 mischief family (mirrored in characters/palette.js for beast heads). Enemies never use the heroes' pink or
 * ginger: body hues sit at 200–290° with one bright top colour (mustard helms / crests, teal bandanas). The legacy
 * art.md §11 keys stay, with warm values, so every reader keeps working.
 */
export const ENEMY_PAL = Object.freeze({
  // §2.6 tokens
  mischiefPlum: '#6E5A86', mischiefPlumLight: '#9C88B4', slate: '#5D6C88', slateLight: '#8E9CB8', mustard: '#E0B043',
  teal: '#3FA59A', olive: '#8C9A48', oliveTop: '#B7C46A', cork: '#C99A6A', bossCrown: '#F2D06B', cream: '#F6EFE4',
  peach: '#D9A494', hyenaTawny: '#C9A46C', barkusCape: '#4A3A5E', jellyCrown: '#F2D06B',
  // eyes (ART §5.3 / §7.2): cream sclera, plum-ink pupil (the one allowed dark), white catchlight, coat-darker brow
  sclera: '#F6EFE4', pupil: '#2A2236', catchlight: '#FFFFFF', brow: '#4A3A5E',
  // legacy art.md §11 keys, warm values (rat fur plum, ears / paws peach, gear mustard + cork, never iron-black)
  ratFur: '#6E5A86', ratBelly: '#9C88B4', ratSkin: '#D9A494', helm: '#E0B043', rust: '#C98A2E', tunic: '#C99A6A',
  sigil: '#E8C35A', wood: '#C99A6A', woodDark: '#A97A4E', steel: '#C9D0D8', hood: '#E0B043', hoodDark: '#B8892E',
  ratEye: '#F6EFE4', crowEye: '#F6EFE4', iron: '#8E9CB8', ironDark: '#5D6C88', plume: '#E0B043', silhouette: '#4A3A5E',
});

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Deterministic value noise in [0,1) from a position (patches, wood grain). */
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Bake a primitive: transform + per-vertex colour. `color` is a hex string or (pos) => hex.
 * @param {THREE.BufferGeometry} g @param {string|((p: THREE.Vector3) => string)} color
 * @param {{pos?: number[], rot?: number[], scale?: number[]|number}} [t]
 */
function part(g, color, t = {}) {
  const sc = t.scale ?? 1;
  _s.set(...(Array.isArray(sc) ? sc : [sc, sc, sc]));
  _q.setFromEuler(_e.set(...(t.rot ?? [0, 0, 0])));
  _m.compose(_p.set(...(t.pos ?? [0, 0, 0])), _q, _s);
  g.applyMatrix4(_m);
  if (g.attributes.uv) g.deleteAttribute('uv');                // vertex-coloured: keeps every part mergeable
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    _c.set(typeof color === 'function' ? color(v) : color);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.index) g.setIndex([...Array(pos.count).keys()]);
  return g;
}

function merged(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** Two-tone patches (a lighter / darker fleck of the same hue family: toy paint, never rust). */
const flecked = (base, fleck, amt = 0.3, freq = 26) => (v) => (hash3(Math.floor(v.x * freq), Math.floor(v.y * freq), Math.floor(v.z * freq)) < amt ? fleck : base);

/** @type {Record<string, THREE.BufferGeometry>} */
const GEO = {};
/** @type {Record<string, THREE.Material>} */
const MAT = {};

function mat(name) {
  if (MAT[name]) return MAT[name];
  switch (name) {
    // painted toy metal (ART §7.1 oversized props): matte, a little sheen, no dark reflections
    case 'metal': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-metal', vertexColors: true, roughness: 0.62, metalness: 0.12 }); break;
    case 'cloth': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-cloth', vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }); break;
    case 'gear': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-gear', vertexColors: true, roughness: 0.8, metalness: 0.05 }); break;
    case 'cheese': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-cheese', vertexColors: true, roughness: 0.6, metalness: 0, emissive: '#2A1E08', emissiveIntensity: 0.25 }); break;
    // ART §5.3 eyes are unlit (Basic): sclera, pupil, catchlight and brow in one vertex-coloured draw
    case 'eyes': MAT[name] = new THREE.MeshBasicMaterial({ name: 'enemy-eyes', vertexColors: true }); break;
    // crown-gold plume: emissive 0.15 so it reads at 22 m (ART §2.6 bossCrown)
    case 'crown': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-crown', vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, emissive: ENEMY_PAL.bossCrown, emissiveIntensity: 0.15 }); break;
    // legacy names (old callers): both now draw the friendly eye set
    case 'eyeRat': case 'eyeCrow': return mat('eyes');
    default: throw new Error(`[enemies] unknown prop material ${name}`);
  }
  return MAT[name];
}

/** One friendly eye (sclera + pupil + catchlight + brow) at x = `sx` × spacing; `brow` rad (− = angry). */
function eyeParts(sx, { r = 0.048, spacing = 0.062, brow = -0.44, pupil = 0.54 } = {}) {
  const x = sx * spacing;
  const sclera = part(new THREE.SphereGeometry(r, 14, 10), ENEMY_PAL.sclera, { pos: [x, 0, 0], scale: [1, 1.08, 0.62] });
  const pr = r * pupil;                                    // ART §5.3 enemy pupil 54 / 128 of the eye (inside a sclera)
  const pup = part(new THREE.SphereGeometry(pr, 12, 8), ENEMY_PAL.pupil, { pos: [x - sx * r * 0.08, -r * 0.06, r * 0.5], scale: [1, 1.1, 0.4] });
  const glint = part(new THREE.SphereGeometry(pr * 0.34, 8, 6), ENEMY_PAL.catchlight, { pos: [x - sx * r * 0.08 + pr * 0.35, -r * 0.06 + pr * 0.42, r * 0.5 + pr * 0.4], scale: [1, 1, 0.5] });
  // angry brow: a short capsule over the eye, inner end down (rotation about z, mirrored per side)
  const bw = part(new THREE.CapsuleGeometry(r * 0.2, r * 1.2, 3, 8), ENEMY_PAL.brow,
    { pos: [x + sx * r * 0.05, r * 1.18, r * 0.25], rot: [0, 0, Math.PI / 2 - sx * brow], scale: [1, 1, 0.7] });
  return [sclera, pup, glint, bw];
}

const BUILD = {
  /** Oversized kettle helm (Lathe dome + wide brim) in the Rat Militia's mustard top colour, origin at the brim centre. */
  kettleHelm() {
    const prof = [[0, 0.175], [0.06, 0.17], [0.11, 0.15], [0.145, 0.11], [0.162, 0.06], [0.168, 0.012], [0.17, 0],
      [0.25, -0.012], [0.272, -0.03], [0.262, -0.045], [0.2, -0.032], [0.15, -0.02], [0.14, -0.01]].map(([x, y]) => new THREE.Vector2(x, y));
    const dome = part(new THREE.LatheGeometry(prof, 22), flecked(ENEMY_PAL.helm, '#EAC266', 0.22));
    const knob = part(new THREE.SphereGeometry(0.03, 10, 8), ENEMY_PAL.cream, { pos: [0, 0.18, 0] });
    const band = part(new THREE.TorusGeometry(0.168, 0.013, 6, 22), ENEMY_PAL.rust, { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] });
    return merged([dome, knob, band]);
  },
  /** Wooden spear along +Z (butt at z 0) with a round cork tip (ART §7.2: no blade). */
  spear() {
    const L = 1.15;
    const shaft = part(new THREE.CylinderGeometry(0.018, 0.02, L, 8), (v) => (hash3(0, Math.floor(v.y * 40), 0) < 0.5 ? ENEMY_PAL.wood : ENEMY_PAL.woodDark), { pos: [0, 0, L / 2], rot: [Math.PI / 2, 0, 0] });
    const cork = part(new THREE.SphereGeometry(0.046, 12, 9), flecked(ENEMY_PAL.cork, '#B88A5C', 0.35, 60), { pos: [0, 0, L + 0.04], scale: [1, 1, 1.25] });
    const collar = part(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 8), ENEMY_PAL.mustard, { pos: [0, 0, L - 0.01], rot: [Math.PI / 2, 0, 0] });
    const ribbon = part(new THREE.BoxGeometry(0.012, 0.09, 0.06), ENEMY_PAL.teal, { pos: [0, -0.05, L - 0.08], rot: [0.25, 0, 0] });
    return merged([shaft, cork, collar, ribbon]);
  },
  /** Round wooden buckler facing +X with a mustard rim, a cream boss and a cheese-wedge sigil. */
  buckler() {
    const disc = part(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20), (v) => (hash3(0, Math.floor(v.y * 30), Math.floor(v.z * 30)) < 0.5 ? ENEMY_PAL.wood : ENEMY_PAL.woodDark), { rot: [0, 0, Math.PI / 2] });
    const rim = part(new THREE.TorusGeometry(0.14, 0.014, 6, 24), ENEMY_PAL.mustard, { rot: [0, Math.PI / 2, 0] });
    const wedge = part(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 3), ENEMY_PAL.sigil, { pos: [0.02, -0.005, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.8] });
    const holes = [[0.025, 0.02], [-0.02, -0.025], [0.0, -0.005]].map(([y, z]) => part(new THREE.SphereGeometry(0.012, 6, 5), '#C99B3A', { pos: [0.032, y, z], scale: [0.4, 1, 1] }));
    return merged([disc, rim, wedge, ...holes]);
  },
  /** Crossbowman's hood (mustard top colour): a cowl over the crown and the back of the head, open at the face (+Z). */
  hood() {
    const open = Math.PI * 0.62;                                  // face opening centred on +Z (phi = π/2 in SphereGeometry)
    const cowl = part(new THREE.SphereGeometry(0.16, 20, 12, Math.PI / 2 + open / 2, Math.PI * 2 - open, 0, Math.PI * 0.6),
      (v) => (v.y < 0.03 ? ENEMY_PAL.hoodDark : ENEMY_PAL.hood), { scale: [1.05, 0.85, 1.1] });
    const rim = part(new THREE.TorusGeometry(0.152, 0.015, 6, 20, Math.PI * 2 - open), ENEMY_PAL.cream,
      { pos: [0, -0.042, 0], rot: [Math.PI / 2, 0, Math.PI / 2 + open / 2], scale: [1.05, 1.1, 1] });   // hem
    const tip = part(new THREE.ConeGeometry(0.055, 0.22, 8), ENEMY_PAL.hood, { pos: [0, 0.05, -0.2], rot: [-2.0, 0, 0] });
    const pom = part(new THREE.SphereGeometry(0.035, 8, 6), ENEMY_PAL.cream, { pos: [0, -0.04, -0.29] });
    return merged([cowl, rim, tip, pom]);
  },
  /** Crow's 3-tuft mustard crest on a little slate cap (ART §7.2 top colour), origin at the cap centre. */
  crowHood() {
    const cap = part(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), ENEMY_PAL.slateLight, { scale: [1, 0.6, 1.15] });
    const tufts = [-0.45, 0, 0.45].map((a, i) => part(new THREE.CapsuleGeometry(0.018, i === 1 ? 0.12 : 0.09, 3, 8), ENEMY_PAL.mustard,
      { pos: [Math.sin(a) * 0.03, 0.08, -0.02], rot: [-0.55, 0, a * 0.9] }));
    return merged([cap, ...tufts]);
  },
  /** Pilfer's dropped crate (0.7 m wooden box with darker slats), origin at the bottom centre. */
  crate() {
    const S = 0.7, grain = (v) => (hash3(Math.floor(v.x * 18), Math.floor(v.y * 9), Math.floor(v.z * 18)) < 0.5 ? ENEMY_PAL.wood : '#D8AE80');
    const box = part(new THREE.BoxGeometry(S, S, S), grain, { pos: [0, S / 2, 0] });
    const slats = [];
    for (const y of [0.08, S - 0.08]) for (const [x, z, w, d] of [[0, S / 2, S + 0.02, 0.04], [0, -S / 2, S + 0.02, 0.04], [S / 2, 0, 0.04, S + 0.02], [-S / 2, 0, 0.04, S + 0.02]]) {
      slats.push(part(new THREE.BoxGeometry(w, 0.1, d), ENEMY_PAL.woodDark, { pos: [x, y, z] }));
    }
    const cross = part(new THREE.BoxGeometry(0.06, S * 1.3, 0.03), ENEMY_PAL.woodDark, { pos: [0, S / 2, S / 2 + 0.01], rot: [0, 0, 0.78] });
    return merged([box, ...slats, cross]);
  },
  /** A cosmetic letter (cream envelope with a red wax seal), flat in XZ. */
  letter() {
    const env = part(new THREE.BoxGeometry(0.2, 0.008, 0.13), '#F2E8D2');
    const flap = part(new THREE.ConeGeometry(0.1, 0.07, 3), '#E6D9BC', { pos: [0, 0.006, 0.02], rot: [-Math.PI / 2, 0, Math.PI], scale: [1, 1, 0.08] });
    const seal = part(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10), '#D9323F', { pos: [0, 0.01, 0] });
    return merged([env, flap, seal]);
  },
  /** Grizzlechop's tricorn (§11.2, ART §7.2): a plum crown, a crown-gold band and plume (reads at 22 m). */
  featherHat() {
    const crown = part(new THREE.ConeGeometry(0.15, 0.26, 14, 1, true), (v) => (v.y < 0.03 ? ENEMY_PAL.bossCrown : ENEMY_PAL.mischiefPlum), { pos: [0, 0.13, 0] });
    const cap = part(new THREE.SphereGeometry(0.03, 8, 6), ENEMY_PAL.bossCrown, { pos: [0, 0.27, 0] });
    const brim = part(new THREE.CylinderGeometry(0.27, 0.29, 0.025, 3), ENEMY_PAL.mischiefPlum, { pos: [0, 0.0, 0], rot: [0, Math.PI, 0], scale: [1, 1, 0.9] });
    const band = part(new THREE.CylinderGeometry(0.152, 0.152, 0.04, 14, 1, true), ENEMY_PAL.bossCrown, { pos: [0, 0.03, 0] });
    const feather = (col, rx, rz, len) => part(new THREE.PlaneGeometry(0.07, len, 1, 4),
      (v) => (Math.abs(v.x) < 0.006 ? ENEMY_PAL.cream : col), { pos: [0.08, 0.13 + len * 0.42, -0.06], rot: [rx, 0, rz] });
    return merged([crown, cap, brim, band, feather(ENEMY_PAL.bossCrown, -0.35, -0.35, 0.42), feather(ENEMY_PAL.cream, -0.15, -0.6, 0.36), feather(ENEMY_PAL.mustard, -0.55, -0.15, 0.32)]);
  },
  /** Grizzlechop's monocle (ART §7.2): a crown-gold ring + chain bead over the right eye, facing +Z. */
  monocle() {
    const ring = part(new THREE.TorusGeometry(0.04, 0.007, 6, 18), ENEMY_PAL.bossCrown);
    const lens = part(new THREE.CircleGeometry(0.036, 14), '#E8F4FF', { pos: [0, 0, -0.002] });
    const chain = part(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4), ENEMY_PAL.bossCrown, { pos: [0.03, -0.06, -0.01], rot: [0, 0, 0.6] });
    return merged([ring, lens, chain]);
  },
  /** Grizzlechop's moustache card: two curled cream-plum flaps either side of the snout, facing +Z. */
  moustache() {
    const flap = (sx) => part(new THREE.CapsuleGeometry(0.022, 0.09, 3, 8), ENEMY_PAL.mischiefPlumLight,
      { pos: [sx * 0.06, 0, 0], rot: [0, 0, Math.PI / 2 + sx * 0.35], scale: [1, 1, 0.6] });
    const curl = (sx) => part(new THREE.TorusGeometry(0.022, 0.009, 5, 10, Math.PI * 1.3), ENEMY_PAL.mischiefPlumLight,
      { pos: [sx * 0.115, 0.02, 0], rot: [0, 0, sx > 0 ? -0.6 : Math.PI + 0.6] });
    return merged([flap(1), flap(-1), curl(1), curl(-1)]);
  },
  /** Cheese wheel (§11.2 #E8C35A with holes), rolling axis +X, radius 1 / width 1 (scale it), origin at the centre. */
  cheeseWheel() {
    const holes = (v) => {
      const side = Math.abs(v.x) > 0.49;
      const h = hash3(Math.floor(v.y * 5 + 7), Math.floor(v.z * 5 + 7), side ? 1 : Math.floor(v.x * 4));
      if (!side) return h < 0.18 ? '#C99B3A' : '#DDB24A';
      return h < 0.22 ? '#C99B3A' : '#E8C35A';
    };
    const body = part(new THREE.CylinderGeometry(1, 1, 1, 30, 2), holes, { rot: [0, 0, Math.PI / 2] });
    const hub = [-1, 1].map((s) => part(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), '#B98A30', { pos: [s * 0.5, 0, 0], rot: [0, 0, Math.PI / 2] }));
    return merged([body, ...hub]);
  },
  /** A cheese wedge (snack / cheese bomb), ~0.18 m. */
  cheeseWedge() {
    const w = part(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 3, 1, false, 0, 1.0),
      (v) => (hash3(Math.floor(v.x * 30), Math.floor(v.y * 30), Math.floor(v.z * 30)) < 0.2 ? '#C99B3A' : '#E8C35A'), { pos: [0, 0.05, 0] });
    return merged([w]);
  },
  /** The Fuzzball's leaf hat (ART §7.2 top colour): an oliveTop leaf with a midrib and a curly stem, origin at its base. */
  leafHat() {
    const leaf = part(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), (v) => (Math.abs(v.x) < 0.012 ? ENEMY_PAL.olive : ENEMY_PAL.oliveTop),
      { scale: [0.75, 0.32, 1.25], rot: [0.12, 0, 0] });
    const stem = part(new THREE.TorusGeometry(0.03, 0.008, 5, 10, Math.PI * 1.4), ENEMY_PAL.olive, { pos: [0, 0.045, -0.1], rot: [0, Math.PI / 2, 0] });
    return merged([leaf, stem]);
  },
  /**
   * Two friendly eyes (ART §5.3 / §7.2): cream sclera r 0.048 (≈ 0.07 m once the rat head bone is ×1.45), a plum-ink
   * pupil at 54 % with a white catchlight, and an angry brow (−25°) above each. Origin between the eyes, facing +Z.
   */
  eyes() {
    return merged([...eyeParts(1), ...eyeParts(-1)]);
  },
};

const PROP_MAT = {
  kettleHelm: 'metal', spear: 'gear', buckler: 'gear', hood: 'cloth', crowHood: 'cloth', eyes: 'eyes', crate: 'gear', letter: 'cloth',
  featherHat: 'crown', cheeseWheel: 'cheese', cheeseWedge: 'cheese', monocle: 'metal', moustache: 'cloth', leafHat: 'cloth',
};

/** A shared prop material by name ('eyes', 'metal', 'cloth', 'gear', 'cheese', 'crown'): procedural faces reuse it. */
export function propMaterial(name) { return mat(name); }

/**
 * Vertex-coloured face parts for procedural foes (the Wobblejelly): `eyeParts` + a smile arc + a crown, merged into
 * ONE geometry by the caller (ART §7.2 "2 catchlights + small smile; the giant gets a gold crown glint").
 */
export const FACE_PARTS = Object.freeze({
  /** A friendly eye at (x, y, z) of radius r: a plum-ink pupil with 2 catchlights (no sclera: the jelly is the white). */
  jellyEye(x, y, z, r) {
    const pup = part(new THREE.SphereGeometry(r, 12, 9), ENEMY_PAL.pupil, { pos: [x, y, z], scale: [0.8, 1.15, 0.5] });
    const g1 = part(new THREE.SphereGeometry(r * 0.32, 8, 6), ENEMY_PAL.catchlight, { pos: [x + r * 0.28, y + r * 0.42, z + r * 0.42] });
    const g2 = part(new THREE.SphereGeometry(r * 0.16, 6, 5), ENEMY_PAL.catchlight, { pos: [x - r * 0.25, y - r * 0.38, z + r * 0.44] });
    return [pup, g1, g2];
  },
  /** A small smile arc centred at (x, y, z), width w. */
  smile(x, y, z, w) {
    return [part(new THREE.TorusGeometry(w * 0.5, w * 0.07, 5, 14, Math.PI * 0.8), ENEMY_PAL.pupil, { pos: [x, y, z], rot: [0, 0, Math.PI + Math.PI * 0.1] })];
  },
  /** A little gold crown of radius r at (x, y, z) (5 rounded points on a band). */
  crown(x, y, z, r) {
    const out = [part(new THREE.CylinderGeometry(r, r * 1.06, r * 0.45, 16, 1, true), ENEMY_PAL.bossCrown, { pos: [x, y, z] })];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      out.push(part(new THREE.SphereGeometry(r * 0.2, 6, 5), i % 2 ? ENEMY_PAL.cream : ENEMY_PAL.bossCrown, { pos: [x + Math.sin(a) * r, y + r * 0.42, z + Math.cos(a) * r] }));
    }
    return out;
  },
  merge: merged,
});
/** PERF §3.5 / E3: actors cast only through their body (the proxy); small gear never casts on its own. */
const CASTS = new Set(['crate', 'cheeseWheel', 'cheeseWedge']);

/**
 * A new mesh for prop `name` (shared geometry/material; never dispose them per instance).
 * @param {'kettleHelm'|'spear'|'buckler'|'hood'|'crowHood'|'eyes'|'crate'|'letter'|'featherHat'|'monocle'|'moustache'|'cheeseWheel'|'cheeseWedge'} name
 * @param {{material?: string, castShadow?: boolean}} [opts]
 */
export function makeProp(name, opts = {}) {
  if (!BUILD[name]) throw new Error(`[enemies] unknown prop ${name}`);
  GEO[name] ??= BUILD[name]();
  const mesh = new THREE.Mesh(GEO[name], mat(opts.material ?? PROP_MAT[name]));
  mesh.name = 'prop:' + name;
  mesh.castShadow = opts.castShadow ?? CASTS.has(name);
  mesh.userData.sharedProp = true;
  return mesh;
}

export const PROP_NAMES = Object.keys(BUILD);
