// src/world/Grass.js  (owner: world) — instanced wind grass (tech.md §12.2, art.md §9.3), as wrapping tiles that
// follow the player: every blade's root is `base + mod(offset − base, tile)`, so blades stay fixed in the world and
// recycle at the tile edge (faded out). Heights, density (paths, water, props), height multiplier and dryness come
// from Terrain's ground-data texture. Wind = rolling gust waves (Env wind + gust) and flutter; blades part around
// the player. Lit by the scene (MeshLambert + onBeforeCompile) so presets/night/shadows/height fog all apply.
// Layers: `near` (dense, quality.grass blades), `far` (sparse wide clumps to ~45 m), `flowers` (thistle, clover,
// buttercup). One draw call per layer. No DOM at import.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

/** Biome grass colours (art.md §6.2 / §12). */
export const GRASS_COLORS = {
  meadow: { root: '#252D10', tip: '#6E7A40', dry: '#9A9558' },
  forest: { root: '#1E2A14', tip: '#5F7A3C', dry: '#7E8A4A' },
  town:   { root: '#2E3418', tip: '#7A8248', dry: '#A39C64' },
  gate:   { root: '#2A2E1C', tip: '#6A7048', dry: '#8E8A62' },
  bog:    { root: '#1E2614', tip: '#5C6A3A', dry: '#8C8A4E' },
  keep:   { root: '#24221E', tip: '#4E4C3E', dry: '#6A665A' },
};

const FLOWER_COLORS = ['#C77DA8', '#EDEFE6', '#E8C547', '#EDEFE6', '#B98BC9'];

/** Blade: 7 verts / 5 tris, base at y 0, height 1, width 1, slight forward curve (scaled per instance in the shader). */
export function makeBladeGeometry() {
  const P = [], idx = [];
  const rows = [[0, 0.5], [0.3, 0.42], [0.62, 0.28], [1, 0]];
  for (let r = 0; r < rows.length; r++) {
    const [y, w] = rows[r], z = y * y * 0.18;
    if (w > 0) P.push(-w, y, z, w, y, z); else P.push(0, y, z);
  }
  // rows 0-2 have 2 verts (0..5), tip = 6
  idx.push(0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

/** Flower: a stem quad plus two crossed head quads; attribute aHead marks head verts. */
export function makeFlowerGeometry() {
  const P = [], H = [], idx = [];
  const quad = (pts, head) => { const b = P.length / 3; for (const p of pts) { P.push(...p); H.push(head); } idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); };
  quad([[-0.03, 0, 0], [0.03, 0, 0], [-0.02, 0.82, 0], [0.02, 0.82, 0]], 0);
  quad([[-0.5, 0.78, 0], [0.5, 0.78, 0], [-0.5, 1.12, 0], [0.5, 1.12, 0]], 1);
  quad([[0, 0.78, -0.5], [0, 0.78, 0.5], [0, 1.12, -0.5], [0, 1.12, 0.5]], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(H, 1));
  g.setIndex(idx);
  return g;
}

const VERT_PARS = /* glsl */`
attribute vec3 aOff;      // tile-local x, z in [0, tile), r = density threshold
attribute vec4 aP;        // yaw, height factor, lean, tint rand
#ifdef GRASS_FLOWER
attribute float aHead;
varying float vHead;
#endif
uniform float uTime, uWind, uGust, uTile, uBladeH, uBladeW;
uniform vec2 uWindDir, uCenter;
uniform vec4 uFade;       // fade-in start/end, fade-out start/end (m from centre)
uniform vec3 uPlayer;
uniform sampler2D uGround;
uniform vec2 uGroundUV;   // uv = xz * x + y
varying float vH, vTint, vDry;
float gh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh21(i), gh21(i + vec2(1.0, 0.0)), f.x), mix(gh21(i + vec2(0.0, 1.0)), gh21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

const VERT_NORMAL = /* glsl */`
vec3 objectNormal = normalize(vec3(sin(aP.x) * 0.35, 1.0, cos(aP.x) * 0.35));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif
`;

const VERT_BEGIN = /* glsl */`
vec3 transformed;
{
  float S = uTile;
  vec2 base = uCenter - 0.5 * S;
  vec2 root = base + mod(aOff.xy - base, S);
  vec4 g = texture2D(uGround, root * uGroundUV.x + uGroundUV.y);
  float keep = step(aOff.z, g.g);
  float d = length(root - uCenter);
  float fade = smoothstep(uFade.x, uFade.y, d) * (1.0 - smoothstep(uFade.z, uFade.w, d));
  float hgt = uBladeH * aP.y * max(g.b, 0.0) * keep * (0.35 + 0.65 * fade) * step(0.001, fade);
  float wid = uBladeW * (0.75 + 0.5 * aP.w) * keep * (0.4 + 0.6 * fade);
  float cy = cos(aP.x), sy = sin(aP.x);
  vec3 lp = position;
  float tip = clamp(lp.y, 0.0, 1.0);
  #ifdef GRASS_FLOWER
    vHead = aHead;
    vec3 p = vec3(lp.x * wid, lp.y * hgt, lp.z * wid);
  #else
    vec3 p = vec3(lp.x * wid, lp.y * hgt, lp.z * hgt);
  #endif
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  float t2 = tip * tip;
  float gust = gvn(root * 0.11 - uWindDir * uTime * 0.85);
  float flutter = sin(uTime * 3.7 + root.x * 3.1 + root.y * 2.3 + aP.w * 6.0) * 0.14;
  float bend = (gust * 1.15 + 0.2 + flutter) * uWind * (0.65 + 0.5 * uGust) + aP.z;
  p.xz += uWindDir * bend * hgt * t2 * 0.85;
  p.y -= bend * bend * 0.18 * hgt * t2;
  vec2 away = root - uPlayer.xz; float pd = length(away);
  float push = (1.0 - smoothstep(0.12, 0.62, pd)) * t2 * step(abs(uPlayer.y - g.r), 1.2);
  p.xz += (pd > 1e-3 ? away / pd : vec2(0.0)) * push * hgt * 0.9;
  p.y -= push * hgt * 0.5;
  transformed = vec3(root.x, g.r - 0.02, root.y) + p;
  vH = tip; vTint = aP.w; vDry = g.a;
}
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uRoot, uTip, uDry;
varying float vH, vTint, vDry;
#ifdef GRASS_FLOWER
varying float vHead;
uniform vec3 uF0, uF1, uF2;
#endif
`;

const FRAG_COLOR = /* glsl */`
{
  float h = clamp(vH, 0.0, 1.0);
  vec3 tipC = mix(uTip, uDry, clamp(vDry + step(0.86, vTint) * 0.55, 0.0, 1.0));
  vec3 c = mix(uRoot, tipC, pow(h, 1.15)) * mix(0.8, 1.12, fract(vTint * 7.31));
  #ifdef GRASS_FLOWER
    float k = fract(vTint * 3.17);
    vec3 fc = k < 0.4 ? uF0 : (k < 0.75 ? uF1 : uF2);
    c = mix(mix(uRoot, uTip, 0.6), fc, step(0.5, vHead));
  #endif
  diffuseColor.rgb = c;
}
`;

const FRAG_NORMAL = /* glsl */`
float faceDirection = 1.0;
vec3 normal = normalize( vNormal );
vec3 nonPerturbedNormal = normal;
`;

/**
 * Build the grass material (MeshLambert + patches). `uniforms` is shared per layer; add `flower` for flowers.
 * @param {object} uniforms @param {{flower?: boolean}} [opts]
 */
export function makeGrassMaterial(uniforms, { flower = false } = {}) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  if (flower) m.defines = { GRASS_FLOWER: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', VERT_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_begin>', FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vH * vH * 0.12;');
  };
  m.customProgramCacheKey = () => (flower ? 'world-flower-v2' : 'world-grass-v2');
  m.userData.owned = true;
  return m;
}

/**
 * One wrapping layer.
 * @param {{count:number, tile:number, bladeH:number, bladeW:number, fade:[number,number,number,number], seed:number,
 *          flower?:boolean, colors:{root:string,tip:string,dry:string}, ground: THREE.Texture, groundUV: THREE.Vector2, lean?:number}} o
 */
export function makeGrassLayer(o) {
  const n = Math.max(1, o.count | 0), rnd = mulberry32(o.seed >>> 0);
  const base = o.flower ? makeFlowerGeometry() : makeBladeGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
  const off = new Float32Array(n * 3), prm = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    off[i * 3] = rnd() * o.tile; off[i * 3 + 1] = rnd() * o.tile; off[i * 3 + 2] = rnd() * 0.999;
    prm[i * 4] = rnd() * Math.PI * 2;
    prm[i * 4 + 1] = o.flower ? 0.7 + rnd() * 0.6 : 0.55 + rnd() * rnd() * 1.1;
    prm[i * 4 + 2] = (rnd() - 0.5) * (o.lean ?? 0.35);
    prm[i * 4 + 3] = rnd();
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(prm, 4));
  geo.instanceCount = n;
  const u = {
    uTime: { value: 0 }, uWind: { value: 0.6 }, uGust: { value: 0.5 }, uTile: { value: o.tile },
    uBladeH: { value: o.bladeH }, uBladeW: { value: o.bladeW },
    uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() }, uCenter: { value: new THREE.Vector2() },
    uFade: { value: new THREE.Vector4(...o.fade) }, uPlayer: { value: new THREE.Vector3(0, -999, 0) },
    uGround: { value: o.ground }, uGroundUV: { value: o.groundUV },
    uRoot: { value: new THREE.Color(o.colors.root) }, uTip: { value: new THREE.Color(o.colors.tip) }, uDry: { value: new THREE.Color(o.colors.dry) },
    uF0: { value: new THREE.Color(FLOWER_COLORS[0]) }, uF1: { value: new THREE.Color(FLOWER_COLORS[1]) }, uF2: { value: new THREE.Color(FLOWER_COLORS[2]) },
  };
  const mat = makeGrassMaterial(u, { flower: !!o.flower });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.name = o.flower ? 'flowers' : 'grass';
  mesh.userData.owned = true;
  base.dispose();
  return { mesh, uniforms: u, geometry: geo, material: mat };
}

/**
 * The level's grass: near + far + flowers, driven per frame by `update(time, env, center, player)`.
 */
export class Grass {
  /**
   * @param {{ground: THREE.Texture, size:number, res:number, quality?: any, colors?: object, seed?: number,
   *          height?: number, near?: number, far?: number, flowers?: number}} o
   */
  constructor(o) {
    const q = o.quality ?? {}, low = q.id === 'low';
    const W = o.res + 1, scale = (W - 1) / (W * o.size);
    const groundUV = new THREE.Vector2(scale, (o.size / 2) * scale + 0.5 / W);
    const colors = o.colors ?? GRASS_COLORS.meadow;
    const H = o.height ?? 0.26, seed = o.seed ?? 7;
    const nearCount = Math.round((q.grass ?? 30000) * (o.near ?? 1));
    this.group = new THREE.Group(); this.group.name = 'grass';
    this.layers = [];
    const nearTile = low ? 22 : 36;
    if (nearCount > 0) this.layers.push(makeGrassLayer({ count: nearCount, tile: nearTile, bladeH: H, bladeW: 0.065, fade: [-1, 0, nearTile * 0.36, nearTile * 0.49], seed, colors, ground: o.ground, groundUV }));
    const farCount = low ? 0 : Math.round(nearCount * 0.33 * (o.far ?? 1));
    if (farCount > 0) this.layers.push(makeGrassLayer({ count: farCount, tile: 96, bladeH: H * 1.35, bladeW: 0.2, fade: [nearTile * 0.3, nearTile * 0.44, 38, 47], seed: seed + 1, colors, ground: o.ground, groundUV, lean: 0.5 }));
    const fl = Math.round((low ? 150 : q.id === 'high' ? 1100 : 750) * (o.flowers ?? 1));
    if (fl > 0) this.layers.push(makeGrassLayer({ count: fl, tile: 40, bladeH: H * 1.25, bladeW: 0.11, fade: [-1, 0, 14, 19.5], seed: seed + 2, colors, ground: o.ground, groundUV, flower: true, lean: 0.2 }));
    for (const l of this.layers) this.group.add(l.mesh);
    this._dir = new THREE.Vector2();
  }

  /** Per frame. `center` = where the tiles follow (player feet), `player` = trample position (or null). */
  update(time, env, center, player) {
    const wind = env?.wind ?? 0.6, gust = env?.gust ?? 0.5;
    if (env?.windDir) this._dir.copy(env.windDir); else this._dir.set(0.8, 0.6).normalize();
    for (const l of this.layers) {
      const u = l.uniforms;
      u.uTime.value = time; u.uWind.value = wind; u.uGust.value = gust; u.uWindDir.value.copy(this._dir);
      if (center) u.uCenter.value.set(center.x, center.z);
      if (player) u.uPlayer.value.copy(player); else u.uPlayer.value.set(0, -999, 0);
    }
  }

  /** Total blade instances (all layers). */
  get count() { return this.layers.reduce((s, l) => s + l.geometry.instanceCount, 0); }

  dispose() {
    for (const l of this.layers) { l.geometry.dispose(); l.material.dispose(); }
    this.layers.length = 0;
    this.group.removeFromParent();
  }
}
