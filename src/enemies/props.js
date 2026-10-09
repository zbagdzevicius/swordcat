// src/enemies/props.js  (owner: enemies) — procedural enemy gear (research/art.md §11 palette): the rat kettle helm,
// spear, cheese-sigil buckler, crossbowman hood, crow iron hood + red plume, glinting eyes. Each prop is ONE mesh
// (merged parts, vertex colours) sharing module-level geometry + materials, built lazily on first use (no GPU work
// at import). Sizes are metres in the enemy's local frame (+Z forward, +Y up, +X = its left).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** art.md §11 palette (enemies never use the heroes' pink). */
export const ENEMY_PAL = Object.freeze({
  ratFur: '#8C8079', ratBelly: '#B9ADA4', ratSkin: '#C2958C', helm: '#8A8D90', rust: '#8C5A3A', tunic: '#6E5B3A',
  sigil: '#B28B2E', wood: '#7A5A3E', woodDark: '#5A3E2B', steel: '#B8BCC2', hood: '#4D5A3A', hoodDark: '#36402A',
  ratEye: '#FF4A3A', crowEye: '#F2C94C', iron: '#5A5D63', ironDark: '#3B3D42', plume: '#A3202C', silhouette: '#15161A',
});

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Deterministic value noise in [0,1) from a position (rust patches, wood grain). */
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

const rusty = (base, rust, amt = 0.35, freq = 26) => (v) => (hash3(Math.floor(v.x * freq), Math.floor(v.y * freq), Math.floor(v.z * freq)) < amt ? rust : base);

/** @type {Record<string, THREE.BufferGeometry>} */
const GEO = {};
/** @type {Record<string, THREE.Material>} */
const MAT = {};

function mat(name) {
  if (MAT[name]) return MAT[name];
  switch (name) {
    case 'metal': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-metal', vertexColors: true, roughness: 0.55, metalness: 0.45 }); break;
    case 'cloth': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-cloth', vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }); break;
    case 'gear': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-gear', vertexColors: true, roughness: 0.75, metalness: 0.15 }); break;
    case 'cheese': MAT[name] = new THREE.MeshStandardMaterial({ name: 'enemy-cheese', vertexColors: true, roughness: 0.6, metalness: 0, emissive: '#2A1E08', emissiveIntensity: 0.25 }); break;
    case 'eyeRat': MAT[name] = new THREE.MeshBasicMaterial({ name: 'enemy-eye-rat', color: new THREE.Color(ENEMY_PAL.ratEye).multiplyScalar(1.6) }); break;
    case 'eyeCrow': MAT[name] = new THREE.MeshBasicMaterial({ name: 'enemy-eye-crow', color: new THREE.Color(ENEMY_PAL.crowEye).multiplyScalar(1.4) }); break;
    default: throw new Error(`[enemies] unknown prop material ${name}`);
  }
  return MAT[name];
}

const BUILD = {
  /** Oversized kettle helm (Lathe dome + wide brim), origin at the brim centre. */
  kettleHelm() {
    const prof = [[0, 0.175], [0.06, 0.17], [0.11, 0.15], [0.145, 0.11], [0.162, 0.06], [0.168, 0.012], [0.17, 0],
      [0.25, -0.012], [0.272, -0.03], [0.262, -0.045], [0.2, -0.032], [0.15, -0.02], [0.14, -0.01]].map(([x, y]) => new THREE.Vector2(x, y));
    const dome = part(new THREE.LatheGeometry(prof, 22), rusty(ENEMY_PAL.helm, ENEMY_PAL.rust, 0.28));
    const knob = part(new THREE.SphereGeometry(0.026, 10, 8), ENEMY_PAL.rust, { pos: [0, 0.18, 0] });
    const band = part(new THREE.TorusGeometry(0.168, 0.012, 6, 22), ENEMY_PAL.rust, { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] });
    return merged([dome, knob, band]);
  },
  /** Wooden spear along +Z (butt at z 0), steel leaf tip. */
  spear() {
    const L = 1.15;
    const shaft = part(new THREE.CylinderGeometry(0.016, 0.019, L, 8), (v) => (hash3(0, Math.floor(v.y * 40), 0) < 0.5 ? ENEMY_PAL.wood : ENEMY_PAL.woodDark), { pos: [0, 0, L / 2], rot: [Math.PI / 2, 0, 0] });
    const tip = part(new THREE.ConeGeometry(0.04, 0.16, 8), ENEMY_PAL.steel, { pos: [0, 0, L + 0.07], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.55] });
    const collar = part(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 8), ENEMY_PAL.ironDark, { pos: [0, 0, L - 0.01], rot: [Math.PI / 2, 0, 0] });
    const rag = part(new THREE.BoxGeometry(0.012, 0.09, 0.06), ENEMY_PAL.tunic, { pos: [0, -0.05, L - 0.08], rot: [0.25, 0, 0] });
    return merged([shaft, tip, collar, rag]);
  },
  /** Round wooden buckler facing +X with an iron rim, boss and a mustard cheese-wedge sigil. */
  buckler() {
    const disc = part(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20), (v) => (hash3(0, Math.floor(v.y * 30), Math.floor(v.z * 30)) < 0.5 ? ENEMY_PAL.wood : ENEMY_PAL.woodDark), { rot: [0, 0, Math.PI / 2] });
    const rim = part(new THREE.TorusGeometry(0.14, 0.013, 6, 24), ENEMY_PAL.ironDark, { rot: [0, Math.PI / 2, 0] });
    const wedge = part(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 3), ENEMY_PAL.sigil, { pos: [0.02, -0.005, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.8] });
    const holes = [[0.025, 0.02], [-0.02, -0.025], [0.0, -0.005]].map(([y, z]) => part(new THREE.SphereGeometry(0.012, 6, 5), '#7E6420', { pos: [0.032, y, z], scale: [0.4, 1, 1] }));
    return merged([disc, rim, wedge, ...holes]);
  },
  /** Crossbowman's hood: a cowl over the crown and the back of the head, open at the face (+Z), with a drooping tip. */
  hood() {
    const open = Math.PI * 0.62;                                  // face opening centred on +Z (phi = π/2 in SphereGeometry)
    const cowl = part(new THREE.SphereGeometry(0.16, 20, 12, Math.PI / 2 + open / 2, Math.PI * 2 - open, 0, Math.PI * 0.6),
      (v) => (v.y < 0.03 ? ENEMY_PAL.hoodDark : ENEMY_PAL.hood), { scale: [1.05, 0.85, 1.1] });
    const rim = part(new THREE.TorusGeometry(0.152, 0.014, 6, 20, Math.PI * 2 - open), ENEMY_PAL.hoodDark,
      { pos: [0, -0.042, 0], rot: [Math.PI / 2, 0, Math.PI / 2 + open / 2], scale: [1.05, 1.1, 1] });   // hem
    const tip = part(new THREE.ConeGeometry(0.055, 0.22, 8), ENEMY_PAL.hood, { pos: [0, 0.05, -0.2], rot: [-2.0, 0, 0] });
    return merged([cowl, rim, tip]);
  },
  /** Crow's tiny iron hood with a red plume. */
  crowHood() {
    const cap = part(new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), rusty(ENEMY_PAL.iron, ENEMY_PAL.ironDark, 0.25, 40), { scale: [1, 0.85, 1.2] });
    const nasal = part(new THREE.BoxGeometry(0.014, 0.05, 0.012), ENEMY_PAL.ironDark, { pos: [0, 0.0, 0.085] });
    const plumes = [-0.35, 0, 0.35].map((a, i) => part(new THREE.ConeGeometry(0.026, i === 1 ? 0.1 : 0.08, 6), ENEMY_PAL.plume, { pos: [Math.sin(a) * 0.025, 0.075, -0.045], rot: [-0.9, 0, a], scale: [1, 1, 0.4] }));
    return merged([cap, nasal, ...plumes]);
  },
  /** Pilfer's dropped crate (0.7 m wooden box with darker slats), origin at the bottom centre. */
  crate() {
    const S = 0.7, grain = (v) => (hash3(Math.floor(v.x * 18), Math.floor(v.y * 9), Math.floor(v.z * 18)) < 0.5 ? ENEMY_PAL.wood : '#8A684A');
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
    const seal = part(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10), '#A3202C', { pos: [0, 0.01, 0] });
    return merged([env, flap, seal]);
  },
  /** Grizzlechop's feathered captain's hat (§11.2: a cone plus 3 feather cards), origin at the brim centre. */
  featherHat() {
    const crown = part(new THREE.ConeGeometry(0.15, 0.26, 14, 1, true), (v) => (v.y < 0.03 ? '#B28B2E' : '#4A3828'), { pos: [0, 0.13, 0] });
    const cap = part(new THREE.SphereGeometry(0.03, 8, 6), '#B28B2E', { pos: [0, 0.27, 0] });
    const brim = part(new THREE.CylinderGeometry(0.27, 0.29, 0.025, 20), '#3E2E22', { pos: [0, 0.0, 0], scale: [1, 1, 0.82] });
    const band = part(new THREE.CylinderGeometry(0.152, 0.152, 0.04, 14, 1, true), '#B28B2E', { pos: [0, 0.03, 0] });
    const feather = (col, rx, rz, len) => part(new THREE.PlaneGeometry(0.07, len, 1, 4),
      (v) => (Math.abs(v.x) < 0.006 ? '#EDE6D2' : col), { pos: [0.08, 0.13 + len * 0.42, -0.06], rot: [rx, 0, rz] });
    return merged([crown, cap, brim, band, feather('#E8E2D0', -0.35, -0.35, 0.42), feather('#A3202C', -0.15, -0.6, 0.36), feather('#E8C35A', -0.55, -0.15, 0.32)]);
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
  /** Two eye glints (spheres ±x), origin between the eyes. */
  eyes() {
    return merged([-1, 1].map((s) => part(new THREE.SphereGeometry(0.018, 8, 6), '#FFFFFF', { pos: [s * 0.055, 0, 0] })));
  },
};

const PROP_MAT = { kettleHelm: 'metal', spear: 'gear', buckler: 'gear', hood: 'cloth', crowHood: 'metal', eyes: 'eyeRat', crate: 'gear', letter: 'cloth', featherHat: 'cloth', cheeseWheel: 'cheese', cheeseWedge: 'cheese' };

/**
 * A new mesh for prop `name` (shared geometry/material; never dispose them per instance).
 * @param {'kettleHelm'|'spear'|'buckler'|'hood'|'crowHood'|'eyes'|'crate'|'letter'|'featherHat'|'cheeseWheel'|'cheeseWedge'} name
 * @param {{material?: string, castShadow?: boolean}} [opts]
 */
export function makeProp(name, opts = {}) {
  if (!BUILD[name]) throw new Error(`[enemies] unknown prop ${name}`);
  GEO[name] ??= BUILD[name]();
  const mesh = new THREE.Mesh(GEO[name], mat(opts.material ?? PROP_MAT[name]));
  mesh.name = 'prop:' + name;
  mesh.castShadow = opts.castShadow ?? name !== 'eyes';
  mesh.userData.sharedProp = true;
  return mesh;
}

export const PROP_NAMES = Object.keys(BUILD);
