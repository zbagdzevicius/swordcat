// Capes (research/art.md §5; GAME_DESIGN §7.8, §13.5, §17):
// - Hero: CPU verlet cloth, 9 x 13 particles, pinned to 3 shoulder/neck anchors that follow the chest joint,
//   structural + shear constraints, 4 iterations, damping 0.985, gravity -20, wind + inertia, sphere colliders.
// - Meme Cam: cross-fade (0.3 s) to a seamlessly looping sway (3.8 s period, gust peak at 1.2 s), back on exit.
// - NPCs: static drape + vertex-shader sway (no CPU).
// The 9 x 13 particles drive a finer RENDER grid (Catmull-Rom, CAPE_DEFAULTS.resX/resY): the soft vertical folds,
// the gathered neckline and the wavy hem live on that grid, with a baked fold-shade (capeAO) so the cloth reads as
// cloth under flat overcast light (a 9-column grid alone aliased the folds into a flat board).
import * as THREE from 'three';
import { CAPES } from './palette.js';
import { own, TOP_VIEW, READABILITY } from './materials.js';
import { clamp, smoothstep } from './util.js';

export const CAPE_DEFAULTS = Object.freeze({ cols: 9, rows: 13, topW: 0.3, botW: 0.6, len: 0.47, iterations: 4, damping: 0.985, gravity: -20, anchorY: 0.61, anchorZ: -0.12,
  folds: 3.5, foldAmp: 0.05, hemCurve: 0.035, hemWave: 0.014, gather: 0.008, neckArc: 0.014, ao: 0.5, resX: 4, resY: 2 });
const TAU = Math.PI * 2;

/** Shared sway clock for NPC capes. */
export const CAPE_TIME = { value: 0 };

// ------------------------------------------------------------------ materials

const _mats = new Map();
/**
 * Wool/velvet cape material with a darker lining on back faces and a hem stripe (art.md §5).
 * @param {string} style  key of CAPES ('red', 'cream', ...) or a hex colour
 * @param {{ sway?: boolean }} [o] sway: NPC vertex-shader sway variant
 */
export function capeMaterial(style = 'red', o = {}) {
  const key = style + (o.sway ? ':sway' : '');
  if (_mats.has(key)) return _mats.get(key);
  const spec = CAPES[style] || { color: style, lining: style, sheen: '#ffffff', hem: '#D9B26A' };
  const m = new THREE.MeshPhysicalMaterial({
    color: spec.color, roughness: 0.88, sheen: 0.7, sheenColor: new THREE.Color(spec.sheen), sheenRoughness: 0.6, side: THREE.DoubleSide,
    // wool takes the soft ambient from the hemisphere light; the character env map (lifted for readable steel at
    // night) made pale capes glow like paper, so cloth takes only half of it (like the kit's fur / cloth damping)
    envMapIntensity: 0.5,
  });
  const uniforms = {
    uLining: { value: new THREE.Color(spec.lining) }, uHem: { value: new THREE.Color(spec.hem) },
    uTime: CAPE_TIME, uSpeed: { value: 0 }, uSwayAmp: { value: 1 }, uTopView: TOP_VIEW,
    uTrimV: { value: READABILITY.trimM / CAPE_DEFAULTS.len },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCapeUv;\nvarying float vCapeAO;\nattribute float capeAO;\nuniform float uTime, uSpeed, uSwayAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCapeUv = uv; vCapeAO = capeAO;
        #ifdef CAPE_SWAY
        {
          float k = pow(1.0 - uv.y, 2.0);
          transformed.z -= k * (0.06 + uSpeed * 0.18);
          transformed.x += k * sin(uTime * 2.0 + uv.y * 4.0) * 0.02 * uSwayAmp;
          transformed.z += k * sin(uTime * 2.6 + uv.x * 3.0) * 0.015 * uSwayAmp;
        }
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCapeUv;\nvarying float vCapeAO;\nuniform vec3 uLining, uHem;\nuniform float uTopView, uTrimV;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (!gl_FrontFacing) diffuseColor.rgb = uLining;
        float hemK = smoothstep(0.004, 0.012, vCapeUv.y) * (1.0 - smoothstep(0.03, 0.038, vCapeUv.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, uHem, hemK);
        diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.0, 0.25, vCapeUv.y)); // grimy hem / fold shade
        diffuseColor.rgb *= mix(1.0, 0.78, smoothstep(0.72, 1.0, vCapeUv.y));  // tucked under the collar / head
        // readability from above: a lighter trim on the cape tip (the bottom 2 cm), faded in by the top-view factor
        {
          vec3 trimC = min(max(diffuseColor.rgb, uHem) * 1.3 + 0.06, vec3(1.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, trimC, uTopView * ${READABILITY.trimLift.toFixed(2)} * (1.0 - smoothstep(uTrimV * 0.8, uTrimV, vCapeUv.y)));
        }`)
      // baked fold shade on ALL the light (diffuse + sheen + env): overcast light comes from above, so vertical folds
      // get almost no shading from their normals alone
      .replace('#include <opaque_fragment>', `outgoingLight *= vCapeAO;
        #include <opaque_fragment>`);
  };
  if (o.sway) m.defines = { CAPE_SWAY: '' };
  m.customProgramCacheKey = () => 'sc-cape-v5' + (o.sway ? '-sway' : '');
  _mats.set(key, own(m));
  return m;
}

// ------------------------------------------------------------------ geometry

/**
 * Cape plane (cols x rows vertices), v = 1 at the shoulders; winding flipped so the OUTSIDE (away from the back) is
 * the front face. Carries `capeAO` (baked fold shade, 1 = unshaded): `d` given → from the fold field, else all 1.
 */
export function capeGeometry(cols = 9, rows = 13, d = null) {
  const g = new THREE.PlaneGeometry(1, 1, cols - 1, rows - 1);
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const ao = new Float32Array(cols * rows).fill(1);
  if (d) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ao[r * cols + c] = capeShade(c / (cols - 1), r / (rows - 1), d);
  g.setAttribute('capeAO', new THREE.BufferAttribute(ao, 1));
  return g;
}

/** Rest drape position (kitten space) for particle (u, v). */
export function drapePoint(u, v, d = CAPE_DEFAULTS, out = new THREE.Vector3()) {
  const w = THREE.MathUtils.lerp(d.topW, d.botW, Math.pow(v, 0.8));
  const x = (u - 0.5) * w;
  const side = (2 * u - 1) ** 2;
  // the top corners sit on the shoulder blades just behind the pauldrons; lower down the sides wrap forward around them
  const wrap = 0.085 * THREE.MathUtils.lerp(0.25, 1, smoothstep(0, 0.35, v)) * (1 - v * 0.35);
  const z = d.anchorZ + side * wrap - v * 0.06 - Math.sin(v * Math.PI) * 0.02;
  // rounded hem: the middle hangs a little lower than the corners (reads as cloth, not a board)
  const hem = (d.hemCurve ?? 0) * (1 - side) * Math.pow(v, 3);
  // neckline: the middle rides up the nape, the corners settle on the shoulders
  const neck = (d.neckArc ?? 0) * (1 - side) * (1 - v) * (1 - v);
  return out.set(x, d.anchorY - v * d.len - hem + neck, z);
}

/** Fold field across the cape, about -1..1 (+ = a valley pressed toward her back). Two frequencies so it isn't regular. */
export function capeFoldPhase(u, d = CAPE_DEFAULTS) {
  const f = d.folds ?? 3;
  return 0.72 * Math.sin(u * TAU * f + 0.5) + 0.28 * Math.sin(u * TAU * f * 1.87 + 1.9);
}
/** Gathered pleats just under the neckline (fade out by a third of the length). */
function gatherK(v) { return smoothstep(0, 0.06, v) * (1 - smoothstep(0.06, 0.32, v)); }

/**
 * Soft vertical folds (kitten-space depth offset) opening toward the hem; added at write time, not simulated. Only
 * ever OUTWARD (<= 0, away from her back): valleys sit on the simulated surface, crests billow out, so the folds
 * never push the cloth into the armour under it.
 */
export function capeFold(u, v, d = CAPE_DEFAULTS) {
  const fold = (capeFoldPhase(u, d) - 1) * 0.5 * (d.foldAmp ?? 0) * Math.pow(v, 0.85);
  const gather = ((d.gather ?? 0) * (Math.sin(u * TAU * 7 + 0.3) - 1) * 0.5) * gatherK(v);
  return fold + gather;
}
/** Wavy hem (kitten-space height offset): crests hang a touch lower than the valleys. */
export function capeHem(u, v, d = CAPE_DEFAULTS) {
  return (d.hemWave ?? 0) * capeFoldPhase(u, d) * smoothstep(0.7, 1, v);
}
/** Baked fold shade 0..1 for (u, v): fold valleys and gathers darker, a slight lift on the crests. */
export function capeShade(u, v, d = CAPE_DEFAULTS) {
  const ph = capeFoldPhase(u, d), open = Math.pow(v, 0.7);
  const valley = Math.max(0, ph) * open, crest = Math.max(0, -ph) * open;
  const g = Math.max(0, Math.sin(u * TAU * 7 + 0.3)) * gatherK(v);
  return clamp(1 - (d.ao ?? 0.3) * valley + 0.05 * crest - 0.16 * g, 0, 1.1);
}

/** Catmull-Rom taps (4 indices + 4 weights per render sample) from a fine grid onto a coarse one. */
function crTaps(nCoarse, res) {
  const nFine = (nCoarse - 1) * res + 1;
  const ix = new Int16Array(nFine * 4), w = new Float32Array(nFine * 4);
  for (let f = 0; f < nFine; f++) {
    let i = Math.floor(f / res), t = f / res - i;
    if (i >= nCoarse - 1) { i = nCoarse - 2; t = 1; }
    const t2 = t * t, t3 = t2 * t;
    const ws = [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
    for (let k = 0; k < 4; k++) { ix[f * 4 + k] = clamp(i - 1 + k, 0, nCoarse - 1); w[f * 4 + k] = ws[k]; }
  }
  return { n: nFine, ix, w };
}

// ------------------------------------------------------------------ verlet sim (pure math; node-testable)

/** Position-based verlet cloth. All positions in world space. */
export class ClothSim {
  constructor(o = {}) {
    const d = { ...CAPE_DEFAULTS, ...o };
    this.d = d;
    const C = d.cols, R = d.rows, N = C * R;
    this.C = C; this.R = R; this.N = N;
    this.p = new Float32Array(N * 3); this.q = new Float32Array(N * 3);
    this.pinned = new Uint8Array(N);
    for (let c = 0; c < C; c++) this.pinned[c] = 1;
    const v = new THREE.Vector3();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      drapePoint(c / (C - 1), r / (R - 1), d, v);
      const i = (r * C + c) * 3; this.p[i] = v.x; this.p[i + 1] = v.y; this.p[i + 2] = v.z;
    }
    this.q.set(this.p);
    // constraints: structural (h, v) + shear (2 diagonals) + light bend (skip one, vertical)
    const cons = [];
    const add = (a, b, stiff) => {
      const dx = this.p[a * 3] - this.p[b * 3], dy = this.p[a * 3 + 1] - this.p[b * 3 + 1], dz = this.p[a * 3 + 2] - this.p[b * 3 + 2];
      cons.push(a, b, Math.hypot(dx, dy, dz), stiff);
    };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (c < C - 1) add(i, i + 1, 1);
      if (r < R - 1) add(i, i + C, 1);
      if (c < C - 1 && r < R - 1) { add(i, i + C + 1, 0.6); add(i + 1, i + C, 0.6); }
      if (r < R - 2) add(i, i + 2 * C, 0.25);
    }
    this.cons = new Float32Array(cons);
    // long-range tethers: each particle may not drift further from its column's pin than its rest distance
    this.tether = new Float32Array(N);
    for (let i = 0; i < N; i++) { const c = i % C; const dx = this.p[i * 3] - this.p[c * 3], dy = this.p[i * 3 + 1] - this.p[c * 3 + 1], dz = this.p[i * 3 + 2] - this.p[c * 3 + 2]; this.tether[i] = Math.hypot(dx, dy, dz) * 1.03; }
    this.pins = new Float32Array(C * 3);
    this.acc = 0; this.t = 0;
    this.spheres = []; // [{x,y,z,r}]
    this.groundY = -Infinity;
    // "behind her" half-space: a cape never wraps to the front of the body (fast turns, spins, spawn facing).
    // plane = { x, y, z (unit forward), d (= forward · root) }; planeMax[i] = how far forward particle i may go.
    this.plane = null;
    // "off her head" half-space (chest frame, CAPE_NECK): no particle above / in front of the neckline, so hunched,
    // tucked or upside-down poses (Tumble roll, flinch) never fold the cloth forward over her head.
    // neck = { x, y, z (unit up+forward), d (= normal · neckline point), s (scale) }
    this.neck = null;
    this.planeMax = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / C) / (R - 1);
      this.planeMax[i] = this.p[i * 3 + 2] + CAPE_FRONT.margin + CAPE_FRONT.marginLow * row;
    }
  }
  /** Teleport every particle by an offset (respawn / cutscene cut) to avoid a whip. */
  shift(dx, dy, dz) {
    for (let i = 0; i < this.N; i++) { this.p[i * 3] += dx; this.p[i * 3 + 1] += dy; this.p[i * 3 + 2] += dz; }
    this.q.set(this.p);
  }
  /** Reset to a transformed rest drape. `xf(v3)` maps kitten space → world. */
  reset(xf) {
    const v = new THREE.Vector3();
    for (let r = 0; r < this.R; r++) for (let c = 0; c < this.C; c++) {
      drapePoint(c / (this.C - 1), r / (this.R - 1), this.d, v); if (xf) xf(v);
      const i = (r * this.C + c) * 3; this.p[i] = v.x; this.p[i + 1] = v.y; this.p[i + 2] = v.z;
    }
    this.q.set(this.p);
  }
  /** One fixed step. wind: {x,y,z} world accel. */
  step(h, wind = null) {
    const d = this.d, p = this.p, q = this.q, N = this.N, C = this.C;
    const damp = Math.pow(d.damping, h * 60);
    const g = d.gravity * h * h;
    this.t += h;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      if (this.pinned[i]) { const c = i % C; p[k] = this.pins[c * 3]; p[k + 1] = this.pins[c * 3 + 1]; p[k + 2] = this.pins[c * 3 + 2]; q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2]; continue; }
      const vx = (p[k] - q[k]) * damp, vy = (p[k + 1] - q[k + 1]) * damp, vz = (p[k + 2] - q[k + 2]) * damp;
      q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
      let ax = 0, ay = g, az = 0;
      if (wind) {
        const row = Math.floor(i / C) / (this.R - 1);
        const f = (0.55 + 0.45 * Math.sin(this.t * 2.3 + i * 0.37) * Math.sin(this.t * 1.1 + row * 3.0)) * h * h * (0.4 + row);
        ax += wind.x * f; ay += wind.y * f; az += wind.z * f;
      }
      p[k] += vx + ax; p[k + 1] += vy + ay; p[k + 2] += vz + az;
    }
    const cons = this.cons, nc = cons.length;
    for (let it = 0; it < d.iterations; it++) {
      for (let j = 0; j < nc; j += 4) {
        const a = cons[j] * 3, b = cons[j + 1] * 3, rest = cons[j + 2], st = cons[j + 3];
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((len - rest) / len) * 0.5 * st;
        const pa = this.pinned[cons[j]], pb = this.pinned[cons[j + 1]];
        const wa = pa ? 0 : pb ? 2 : 1, wb = pb ? 0 : pa ? 2 : 1;
        p[a] += dx * diff * wa; p[a + 1] += dy * diff * wa; p[a + 2] += dz * diff * wa;
        p[b] -= dx * diff * wb; p[b + 1] -= dy * diff * wb; p[b + 2] -= dz * diff * wb;
      }
      this.applyTethers();
      this.collide();
    }
  }
  applyTethers() {
    const p = this.p, C = this.C;
    for (let i = C; i < this.N; i++) {
      const k = i * 3, c = (i % C) * 3, max = this.tether[i];
      const dx = p[k] - this.pins[c], dy = p[k + 1] - this.pins[c + 1], dz = p[k + 2] - this.pins[c + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > max) { const f = max / d; p[k] = this.pins[c] + dx * f; p[k + 1] = this.pins[c + 1] + dy * f; p[k + 2] = this.pins[c + 2] + dz * f; }
    }
  }
  collide() {
    const p = this.p, N = this.N, S = this.spheres, gy = this.groundY, pl = this.plane, nk = this.neck;
    for (let i = 0; i < N; i++) {
      if (this.pinned[i]) continue;
      const k = i * 3;
      if (pl) {
        const ahead = p[k] * pl.x + p[k + 1] * pl.y + p[k + 2] * pl.z - pl.d - this.planeMax[i] * pl.s;
        if (ahead > 0) { p[k] -= pl.x * ahead; p[k + 1] -= pl.y * ahead; p[k + 2] -= pl.z * ahead; }
      }
      if (nk) {
        const ahead = p[k] * nk.x + p[k + 1] * nk.y + p[k + 2] * nk.z - nk.d - CAPE_NECK.margin * nk.s;
        if (ahead > 0) { p[k] -= nk.x * ahead; p[k + 1] -= nk.y * ahead; p[k + 2] -= nk.z * ahead; }
      }
      for (let s = 0; s < S.length; s++) {
        const o = S[s];
        const dx = p[k] - o.x, dy = p[k + 1] - o.y, dz = p[k + 2] - o.z, rr = o.r * o.r, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rr) { const d = Math.sqrt(d2) || 1e-6, f = o.r / d; p[k] = o.x + dx * f; p[k + 1] = o.y + dy * f; p[k + 2] = o.z + dz * f; }
      }
      if (p[k + 1] < gy) { p[k + 1] = gy; this.q[k] = THREE.MathUtils.lerp(this.q[k], p[k], 0.5); this.q[k + 2] = THREE.MathUtils.lerp(this.q[k + 2], p[k + 2], 0.5); }
    }
  }
  /**
   * Advance with an accumulator at 60 Hz (max 4 sub-steps). `onSub(f)` runs before each sub-step with the fraction
   * f (0..1] of the frame it ends at, so callers can move pins / colliders smoothly through the frame: snapping the
   * pins a whole frame ahead in the first sub-step injects a burst of velocity at the neckline every frame, and at
   * 30-45 fps a running kitten's cape crumpled up against her back instead of trailing.
   */
  advance(dt, wind, onSub = null) {
    this.acc = Math.min(this.acc + dt, 4 / 60);
    const n = Math.min(4, Math.floor(this.acc * 60 + 1e-6));
    for (let s = 0; s < n; s++) { if (onSub) onSub((s + 1) / n); this.step(1 / 60, wind); this.acc -= 1 / 60; }
    if (this.acc < 0) this.acc = 0;
    return n;
  }
}

// ------------------------------------------------------------------ hero cape (verlet + sway cross-fade)

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _bodyM = new THREE.Matrix4();
/** Wind shelter (fractions of the wind magnitude, kitten frame): max forward push, constant backward trail. */
export const CAPE_WIND = Object.freeze({ front: 0.12, trail: 0.3 });
/**
 * Front limit (kitten units, kitten frame): a particle may sit at most `margin` (+ `marginLow` × row) in front of its
 * rest drape depth, so the cloth billows sideways and back but never wraps around her (spins, 180° turns, spawns).
 * `snapYaw`: a root rotation jump larger than this in one update re-drapes the cloth (teleports / cuts / spawns).
 */
export const CAPE_FRONT = Object.freeze({ margin: 0.07, marginLow: 0.05, snapYaw: 1.2 });
/**
 * Head guard (kitten bind space, follows the chest): the cloth stays on the back side of a plane through the
 * neckline (y = anchorY, z = anchorZ) whose normal points up and forward (0, 1, `tilt`), at most `margin` past it.
 * Billowing straight back or hanging down is untouched; folding up/forward over the head (hunched hit, Tumble roll
 * upside down) is not allowed, so from behind she never turns into a cloth sack (review r2/c00).
 */
export const CAPE_NECK = Object.freeze({ tilt: 1, margin: 0.02 });
/**
 * How much of the neckline's world motion the cloth feels as inertia (0 = carried rigidly, 1 = full world-space
 * physics), horizontal and vertical. The run cycle bobs the chest ~±3 cm at ~4 Hz, which is about 1 g of vertical
 * acceleration: with full inertia the cloth went weightless every stride and flapped up into a crumpled bag over
 * her back. Starts, stops and turns still swing it; constant running trails it through the air drag (`trail`).
 */
export const CAPE_INERTIA = Object.freeze({ h: 0.55, v: 0.15, trail: 0.9 });

/** Collision spheres in kitten space (art.md §5: torso, legs, tail root; plus pauldrons and tassets). */
export const CAPE_COLLIDERS = Object.freeze([
  { j: 'chest', p: [0, 0.03, -0.03], r: 0.165 }, { j: 'chest', p: [0.17, 0.13, -0.02], r: 0.11 }, { j: 'chest', p: [-0.17, 0.13, -0.02], r: 0.11 },
  { j: 'hips', p: [0, -0.04, -0.01], r: 0.18 }, { j: 'thighL', p: [0, -0.08, 0], r: 0.075 }, { j: 'thighR', p: [0, -0.08, 0], r: 0.075 },
  { j: 'tail0', p: [0, 0, 0], r: 0.07 }, { j: 'head', p: [0, 0.12, -0.02], r: 0.2 },
  // shins + feet (kneel, sit, faint: the cloth lies over the folded legs instead of through the sabatons)
  { j: 'kneeL', p: [0, -0.05, 0], r: 0.06 }, { j: 'kneeR', p: [0, -0.05, 0], r: 0.06 },
  { j: 'footL', p: [0, -0.02, 0.02], r: 0.085 }, { j: 'footR', p: [0, -0.02, 0.02], r: 0.085 },
  { j: 'footL', p: [0, -0.03, 0.075], r: 0.06 }, { j: 'footR', p: [0, -0.03, 0.075], r: 0.06 },
]);

/**
 * Hero cape. Lives under the kitten root; simulates in world space.
 * Usage: cape.update(dt, { wind, speed }) after the rig is posed for the frame (matrixWorld up to date).
 */
export class HeroCape {
  /**
   * @param {object} o { style, rig, root, mode: 'verlet'|'sway', dims }
   */
  constructor(o) {
    this.rig = o.rig; this.root = o.root;
    this.d = { ...CAPE_DEFAULTS, ...(o.dims || {}) };
    this.sim = new ClothSim(this.d);
    // render grid (finer than the sim): Catmull-Rom taps per render column / row
    this._tx = crTaps(this.d.cols, Math.max(1, this.d.resX | 0));
    this._ty = crTaps(this.d.rows, Math.max(1, this.d.resY | 0));
    /** render grid size (columns, rows) */
    this.rc = this._tx.n; this.rr = this._ty.n;
    this.geo = capeGeometry(this.rc, this.rr, this.d);
    this._loc = new Float32Array(this.sim.N * 3);   // sim particles in root-local space (per write)
    this._fold = new Float32Array(this.rc * this.rr * 2);
    for (let r = 0; r < this.rr; r++) for (let c = 0; c < this.rc; c++) {
      const u = c / (this.rc - 1), v = r / (this.rr - 1), i = (r * this.rc + c) * 2;
      this._fold[i] = capeFold(u, v, this.d); this._fold[i + 1] = capeHem(u, v, this.d);
    }
    this.mesh = new THREE.Mesh(this.geo, capeMaterial(o.style || 'red'));
    this.mesh.name = 'cape'; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.style = o.style || 'red';
    this.mode = o.mode || 'verlet';
    this.w = this.mode === 'sway' ? 1 : 0; this.wTarget = this.w; this.blendDur = 0.3;
    this.sway = { period: 3.8, gustPeak: 1.2, amp: 1, t: 0 };
    this.windMul = 1;
    this.restLocal = new Float32Array(this.sim.N * 3);
    this.colliders = (o.colliders || CAPE_COLLIDERS).map((c) => ({ ...c, w: { x: 0, y: 0, z: 0, r: c.r } }));
    this.sim.spheres = this.colliders.map((c) => c.w);
    this._initialised = false;
    this._lastRootPos = new THREE.Vector3();
    this.anchor = this.rig.capeAnchor;
    this._pinM = new THREE.Matrix4();
    this.pinLocal = [];
    for (let c = 0; c < this.d.cols; c++) this.pinLocal.push(drapePoint(c / (this.d.cols - 1), 0, this.d, new THREE.Vector3()));
  }
  setStyle(style) { this.style = style; this.mesh.material = capeMaterial(style); }
  /** Render-geometry vertex index of sim particle (column c, row r). */
  vertexIndex(c, r) { return r * Math.max(1, this.d.resY | 0) * this.rc + c * Math.max(1, this.d.resX | 0); }
  /** 'verlet' | 'sway'. blend seconds (Meme Cam: 0.3 in, 0.6 out). */
  setMode(mode, { blend = 0.3, period, gustPeak, amp } = {}) {
    this.mode = mode; this.wTarget = mode === 'sway' ? 1 : 0; this.blendDur = Math.max(1e-3, blend);
    if (period) this.sway.period = period; if (gustPeak !== undefined) this.sway.gustPeak = gustPeak; if (amp) this.sway.amp = amp;
  }
  /** Seamless sway clock (Meme Cam syncs this with the camera/grass loop). */
  setSwayTime(t) { this.sway.t = t; }
  /** Snap the cloth to the current pose (call after teleports / cutscene cuts). */
  snap() { this._initialised = false; }
  _updatePins() {
    const C = this.d.cols;
    this.root.updateWorldMatrix(true, false);
    // pins are defined in kitten (bind) space: world = chestWorld * inverse(chestBind) * p
    this._pinM.multiplyMatrices(this.rig.chest.matrixWorld, _inv.copy(this.rig.chestBind).invert());
    for (let c = 0; c < C; c++) { _v.copy(this.pinLocal[c]).applyMatrix4(this._pinM); this.sim.pins[c * 3] = _v.x; this.sim.pins[c * 3 + 1] = _v.y; this.sim.pins[c * 3 + 2] = _v.z; }
    for (const c of this.colliders) {
      const j = this.rig.joints[c.j]; if (!j) continue;
      _v.set(c.p[0], c.p[1], c.p[2]).applyMatrix4(j.matrixWorld);
      const s = j.matrixWorld.getMaxScaleOnAxis();
      c.w.x = _v.x; c.w.y = _v.y; c.w.z = _v.z; c.w.r = c.r * s;
    }
    this.sim.groundY = this.root.getWorldPosition(_w).y + 0.012 * this.root.scale.y;
    // "behind her" plane from the body joint (root facing + the body roll: the Tumble flips her back over, and a
    // root-only plane then held the cloth on the far side, over her head). Lying poses roll the body about Z, which
    // keeps their back to -Z.
    const bodyJ = this.rig.joints?.body;
    const e = (bodyJ && this.rig.bodyBind ? _bodyM.multiplyMatrices(bodyJ.matrixWorld, _inv.copy(this.rig.bodyBind).invert()) : this.root.matrixWorld).elements;
    const s = Math.hypot(e[8], e[9], e[10]) || 1;
    const pl = this.sim.plane || (this.sim.plane = { x: 0, y: 0, z: 1, d: 0, s: 1 });
    pl.x = e[8] / s; pl.y = e[9] / s; pl.z = e[10] / s; pl.s = s;
    pl.d = pl.x * e[12] + pl.y * e[13] + pl.z * e[14];
    // neckline head guard (chest frame)
    const nk = this.sim.neck || (this.sim.neck = { x: 0, y: 0, z: 0, d: 0, s: 1 });
    _v.set(0, 1, CAPE_NECK.tilt).transformDirection(this._pinM);
    nk.x = _v.x; nk.y = _v.y; nk.z = _v.z; nk.s = this._pinM.getMaxScaleOnAxis();
    _v.set(0, this.d.anchorY, this.d.anchorZ).applyMatrix4(this._pinM);
    nk.d = nk.x * _v.x + nk.y * _v.y + nk.z * _v.z;
  }
  /** Keep this frame's pin / collider / plane targets; `prev` too when there is nothing to interpolate from. */
  _captureTargets(resetPrev) {
    const sim = this.sim, S = sim.spheres, pl = sim.plane;
    if (!this._pinT) {
      this._pinT = new Float32Array(sim.pins.length); this._pinP = new Float32Array(sim.pins.length);
      this._sphT = new Float32Array(S.length * 3); this._sphP = new Float32Array(S.length * 3);
    }
    this._pinT.set(sim.pins);
    for (let i = 0; i < S.length; i++) { this._sphT[i * 3] = S[i].x; this._sphT[i * 3 + 1] = S[i].y; this._sphT[i * 3 + 2] = S[i].z; }
    this._plT = pl ? pl.d : 0; this._nkT = sim.neck ? sim.neck.d : 0;
    if (resetPrev) { this._pinP.set(this._pinT); this._sphP.set(this._sphT); this._plP = this._plT; this._nkP = this._nkT; this._pinCentre(this._pinT, this._cen || (this._cen = new THREE.Vector3())); }
  }
  _pinCentre(arr, out) {
    const C = this.sim.C; out.set(0, 0, 0);
    for (let c = 0; c < C; c++) { out.x += arr[c * 3]; out.y += arr[c * 3 + 1]; out.z += arr[c * 3 + 2]; }
    return out.multiplyScalar(1 / C);
  }
  /** Sub-step hook: pins, colliders and the "behind her" plane slide from the last simulated frame to this one. */
  _lerpTargets(f) {
    const sim = this.sim, S = sim.spheres, P = sim.pins, a = this._pinP, b = this._pinT;
    for (let i = 0; i < P.length; i++) P[i] = a[i] + (b[i] - a[i]) * f;
    const sa = this._sphP, sb = this._sphT;
    for (let i = 0; i < S.length; i++) {
      S[i].x = sa[i * 3] + (sb[i * 3] - sa[i * 3]) * f; S[i].y = sa[i * 3 + 1] + (sb[i * 3 + 1] - sa[i * 3 + 1]) * f; S[i].z = sa[i * 3 + 2] + (sb[i * 3 + 2] - sa[i * 3 + 2]) * f;
    }
    if (sim.plane) sim.plane.d = this._plP + (this._plT - this._plP) * f;
    if (sim.neck) sim.neck.d = this._nkP + (this._nkT - this._nkP) * f;
    // carry the free cloth along with the non-inertial share of the neckline's motion (CAPE_INERTIA)
    const c = this._pinCentre(P, _v), dx = c.x - this._cen.x, dy = c.y - this._cen.y, dz = c.z - this._cen.z;
    this._cen.copy(c);
    const kh = 1 - CAPE_INERTIA.h, kv = 1 - CAPE_INERTIA.v;
    if (dx * dx + dy * dy + dz * dz < 0.25) {
      const p = sim.p, q = sim.q, N = sim.N, cx = dx * kh, cy = dy * kv, cz = dz * kh;
      // the air drag the world-space damping would have put on the carried share of the motion (scaled by `trail`),
      // so a steady run still trails the cape behind her
      const dr = (1 - sim.d.damping) * CAPE_INERTIA.trail;
      for (let i = 0; i < N; i++) {
        if (sim.pinned[i]) continue;
        const k = i * 3;
        p[k] += cx; p[k + 1] += cy; p[k + 2] += cz;
        q[k] += cx * (1 + dr); q[k + 1] += cy; q[k + 2] += cz * (1 + dr);
      }
    }
  }
  update(dt, { wind = null, speed = 0 } = {}) {
    if (!this.rig.chestBind) return;
    this._updatePins();
    let resetPrev = false;
    if (!this._initialised) {
      this.sim.reset((v) => v.applyMatrix4(this._pinM));
      for (let i = 0; i < 90; i++) this.sim.step(1 / 60, null);
      this._initialised = true; resetPrev = true;
      this.root.getWorldPosition(this._lastRootPos);    // the reset already placed the cloth: no teleport shift
    }
    // detect teleports: large root jumps shift the cloth instead of whipping it; a facing snap re-drapes it
    const pl = this.sim.plane;
    const yaw = Math.atan2(pl.x, pl.z);
    if (this._lastYaw !== undefined && Math.abs(Math.atan2(Math.sin(yaw - this._lastYaw), Math.cos(yaw - this._lastYaw))) > CAPE_FRONT.snapYaw) {
      this.sim.reset((v) => v.applyMatrix4(this._pinM)); resetPrev = true;
    }
    this._lastYaw = yaw;
    const rp = this.root.getWorldPosition(_w);
    if (this._lastRootPos.distanceToSquared(rp) > 1.0) { this.sim.shift(rp.x - this._lastRootPos.x, rp.y - this._lastRootPos.y, rp.z - this._lastRootPos.z); resetPrev = true; }
    this._lastRootPos.copy(rp);
    this._captureTargets(resetPrev);
    // wind in world space, but the body shelters the front: in the kitten's frame the forward (+Z) part is cut to
    // CAPE_WIND.front of the magnitude and a small backward trail is added, so a tail wind never wraps the cape
    // over her face or legs (it billows sideways / behind like the refs instead).
    let wv = null;
    if (wind) {
      wv = _w.copy(wind).multiplyScalar(40 * this.windMul);
      const mag = wv.length();
      if (mag > 1e-4) {
        this.root.getWorldQuaternion(_q);
        wv.applyQuaternion(_q.invert());
        wv.z = Math.min(wv.z, mag * CAPE_WIND.front) - mag * CAPE_WIND.trail;
        wv.applyQuaternion(_q.invert());
      }
    }
    if (this.sim.advance(dt, wv, this._onSub || (this._onSub = (f) => this._lerpTargets(f))) > 0) { this._pinP.set(this._pinT); this._sphP.set(this._sphT); this._plP = this._plT; this._nkP = this._nkT; }
    else this._lerpTargets(1);
    // blend weight
    const sgn = Math.sign(this.wTarget - this.w);
    if (sgn) this.w = clamp(this.w + (sgn * dt) / this.blendDur, 0, 1);
    this.sway.t += dt;
    this._write(speed);
  }
  _write(speed) {
    const C = this.d.cols, R = this.d.rows, loc = this._loc;
    _inv.copy(this.root.matrixWorld).invert();
    _m.multiplyMatrices(_inv, this._pinM); // kitten bind space -> root local, following the chest
    const w = smoothstep(0, 1, this.w);
    const T = this.sway.period, om = (Math.PI * 2) / T;
    const t = this.sway.t % T;
    const gust = 0.5 + 0.5 * Math.cos(om * (t - this.sway.gustPeak));
    const amp = this.sway.amp * (0.6 + 0.8 * gust);
    // 1) sim particles → root local (cross-faded with the looping Meme Cam sway)
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const k = (r * C + c) * 3;
      const u = c / (C - 1), vv = r / (R - 1);
      _v.set(this.sim.p[k], this.sim.p[k + 1], this.sim.p[k + 2]).applyMatrix4(_inv);
      if (w > 0) {
        drapePoint(u, vv, this.d, _w).applyMatrix4(_m);
        const kk = vv * vv;
        _w.z -= kk * (0.05 + speed * 0.18) + kk * gust * 0.07 * amp;
        _w.x += kk * Math.sin(om * 2 * t + vv * 4.0) * 0.028 * amp;
        _w.z += kk * Math.sin(om * 3 * t + u * 3.0) * 0.022 * amp;
        _w.y += kk * gust * 0.025 * amp;
        _v.lerp(_w, w);
      }
      loc[k] = _v.x; loc[k + 1] = _v.y; loc[k + 2] = _v.z;
    }
    // 2) Catmull-Rom up to the render grid + folds / gathers / wavy hem
    const pos = this.geo.attributes.position, arr = pos.array, tx = this._tx, ty = this._ty, rc = this.rc, fold = this._fold;
    for (let r = 0; r < this.rr; r++) {
      for (let c = 0; c < rc; c++) {
        let x = 0, y = 0, z = 0;
        for (let b = 0; b < 4; b++) {
          const wy = ty.w[r * 4 + b]; if (wy === 0) continue;
          const row = ty.ix[r * 4 + b] * C;
          for (let a = 0; a < 4; a++) {
            const ww = wy * tx.w[c * 4 + a]; if (ww === 0) continue;
            const k = (row + tx.ix[c * 4 + a]) * 3;
            x += loc[k] * ww; y += loc[k + 1] * ww; z += loc[k + 2] * ww;
          }
        }
        const i = r * rc + c;
        arr[i * 3] = x; arr[i * 3 + 1] = y + fold[i * 2 + 1]; arr[i * 3 + 2] = z + fold[i * 2];
      }
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
  dispose() { this.geo.dispose(); }
}

/**
 * NPC cape: static drape geometry + vertex sway material. Attach to the chest joint; `pinOffset` is the chest-local
 * position of the kitten-space drape origin (builder passes inverse(chestBind)).
 */
export function buildSwayCape(style = 'cream', dims = {}, toChest = null) {
  const d = { ...CAPE_DEFAULTS, ...dims };
  const cols = (d.cols - 1) * Math.max(1, d.resX | 0) + 1, rows = (d.rows - 1) * Math.max(1, d.resY | 0) + 1;
  const g = capeGeometry(cols, rows, d);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = c / (cols - 1), vv = r / (rows - 1);
    drapePoint(u, vv, d, v);
    v.z += capeFold(u, vv, d); v.y += capeHem(u, vv, d);
    if (toChest) v.applyMatrix4(toChest);
    pos.setXYZ(r * cols + c, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, capeMaterial(style, { sway: true }));
  mesh.name = 'cape'; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
