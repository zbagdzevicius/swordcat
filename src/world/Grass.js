// src/world/Grass.js  (owner: world) — instanced wind grass as iso toon tufts (PERF_SPEC §8.4, ART_WARM_SPEC §8.2,
// AUTOCAM §9.4; X11). ONE InstancedMesh (1 draw) holds the grass tufts and the flowers:
//   - a tuft = 3 tapered blades in a fan (0° / 60° / 120°), 2 triangles each (6 tris), plus a 2-tri petal cap that is
//     collapsed on non-flower instances; blades ×1.6 wide, 0.18–0.32 m tall, normals bent 70 % to world-up (they shade
//     like the ground: no dark backfaces, no noisy toon bands), opaque (no alphaTest), no shadow receive;
//   - a fixed count per quality (`QUALITY.grassTufts`: Low 1300, Med 4000, High 8000), so the boss zoom makes it
//     sparser, never more expensive;
//   - one wrapping tile of side T = 1.6 · d (camera distance), grown to cover the camera footprint + 3 m, centred on
//     the footprint centre (`cam.footprint` when camera publishes it, else the frustum ∩ ground), quantised so zoom
//     does not shimmer; the last 15 % fades out;
//   - colours root → tip (ART §2.6 per biome), per-tuft hue ±6° / lightness ±5 %, dry patches from the ground data
//     (Terrain's texture: R height, G density, B height mul, A dryness + 2 × near-spine), flowers 8 % near the spine and
//     3 % elsewhere in the ART palette (no pink / orange near the path, G19).
// Wind = rolling gust waves (Env wind + gust) and flutter; tufts part around her. No DOM at import.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { footprintCorners } from './StaticShadow.js';

/** Biome grass colours (ART §2.6: root ≈ ground root, tip = ground mid lifted, dry = ground dry). */
export const GRASS_COLORS = {
  meadow: { root: '#4F7A2E', tip: '#B8DA6A', dry: '#E8D27C' },
  forest: { root: '#2C6A3A', tip: '#86C65C', dry: '#C8C060' },
  town:   { root: '#4E9440', tip: '#B0DA6A', dry: '#E8CF7A' },
  gate:   { root: '#4E8040', tip: '#A8C860', dry: '#E0B868' },
  bog:    { root: '#2E7A5E', tip: '#9ED88E', dry: '#D6D88A' },
  keep:   { root: '#7A6A4E', tip: '#B8C47A', dry: '#D8C48A' },
};

/** ART §8.2 flower palette (butter, white, sky, cream, lilac) and shares (near the spine / elsewhere). */
export const FLOWER_COLORS = Object.freeze(['#FFD84A', '#FFFFFF', '#8EC8FF', '#FFF2B0', '#C9A8FF']);

/**
 * Tuft constants: blade half-width (×1.6 of the old 0.0625), height band (m), flower shares, the near-spine band
 * (m beyond the path edge), the tile rule (T = tileMul · d, ≥ footprint + pad, quantised), and the default count.
 */
export const GRASS = Object.freeze({
  bladeW: 0.1, hMin: 0.18, hMax: 0.32, upBend: 0.7, flowerNear: 0.08, flowerFar: 0.03, nearSpine: 4,
  tileMul: 1.6, tileMin: 14, tileMax: 48, tileQuant: 2, pad: 3, fade: 0.15, defaultD: 12.4, count: 4000,
  hueJitter: 6 / 360, lJitter: 0.05, capSize: 0.09,
});

/** Blade fan yaws (rad) of one tuft. */
const FAN = [0, Math.PI / 3, (Math.PI * 2) / 3];

/**
 * One tuft: 3 blades × (4 verts, 2 tris) + a petal cap (4 verts, 2 tris; aCap = 1). Base at y 0, height 1, blade
 * half-width 1 (scaled per instance in the shader). Attributes: position, normal (up-bent), aTip (0 base → 1 tip),
 * aCap.
 */
export function makeTuftGeometry() {
  const P = [], N = [], T = [], C = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const vert = (x, y, z, nx, nz, tip, cap) => {
    n.set(nx, 0, nz).lerp(up, GRASS.upBend).normalize();
    P.push(x, y, z); N.push(n.x, n.y, n.z); T.push(tip); C.push(cap);
    return P.length / 3 - 1;
  };
  for (const a of FAN) {
    const c = Math.cos(a), s = Math.sin(a), fx = -s, fz = c;           // blade plane along (c, s); forward (−s, c)
    const bl = vert(-c, 0, -s, fx, fz, 0, 0), br = vert(c, 0, s, fx, fz, 0, 0);
    const m = vert(fx * 0.12, 0.18, fz * 0.12, fx, fz, 0.18, 0);        // a slight crease
    const tip = vert(fx * 0.35, 1, fz * 0.35, fx, fz, 1, 0);
    idx.push(bl, m, tip, m, br, tip);
  }
  // petal cap (horizontal quad at the tuft top), collapsed on grass instances
  const k = 1;
  const a0 = vert(-k, 1.02, -k, 0, 0, 1, 1), a1 = vert(k, 1.02, -k, 0, 0, 1, 1), a2 = vert(k, 1.02, k, 0, 0, 1, 1), a3 = vert(-k, 1.02, k, 0, 0, 1, 1);
  idx.push(a0, a2, a1, a0, a3, a2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(T, 1));
  g.setAttribute('aCap', new THREE.Float32BufferAttribute(C, 1));
  g.setIndex(idx);
  return g;
}

/** @deprecated the pre-tuft single blade (kept for old callers); a tuft is `makeTuftGeometry()`. */
export function makeBladeGeometry(tris = 5) {
  const rows = tris === 3 ? [[0, 0.5], [0.45, 0.36], [1, 0]] : [[0, 0.5], [0.3, 0.42], [0.62, 0.28], [1, 0]];
  const P = [], idx = [];
  for (const [y, w] of rows) { const z = y * y * 0.18; if (w > 0) P.push(-w, y, z, w, y, z); else P.push(0, y, z); }
  const pairs = rows.length - 1;
  for (let r = 0; r < pairs - 1; r++) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const t = (pairs - 1) * 2; idx.push(t, t + 1, t + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

/**
 * Tile side (m) for a camera distance `d` and the footprint's axis-aligned extent (m, max of width / depth), quantised
 * (AUTOCAM §9.4: T = 1.6 · d and the tile covers the footprint + pad on every side). Pure.
 */
export function grassTile(d, extent = 0) {
  const G = GRASS;
  const t = Math.max(G.tileMul * (Number.isFinite(d) ? d : G.defaultD), (Number.isFinite(extent) ? extent : 0) + 2 * G.pad);
  return Math.min(G.tileMax, Math.max(G.tileMin, Math.ceil(t / G.tileQuant) * G.tileQuant));
}

const VERT_PARS = /* glsl */`
attribute float aTip, aCap;
attribute vec3 aOff;      // tile-unit x, z in [0, 1), r = density threshold
attribute vec4 aP;        // yaw, height rand, lean, tint rand
attribute vec2 aF;        // flower rand (share test), flower colour rand
uniform float uTime, uWind, uGust, uTile, uBladeW, uHMin, uHMax, uFade, uFlNear, uFlFar, uCap;
uniform vec2 uWindDir, uCenter;
uniform vec3 uPlayer;
uniform sampler2D uGround;
uniform vec2 uGroundUV;   // uv = xz * x + y
varying float vH, vTint, vDry, vFl, vFlK;
float gh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh21(i), gh21(i + vec2(1.0, 0.0)), f.x), mix(gh21(i + vec2(0.0, 1.0)), gh21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

const VERT_BEGIN = /* glsl */`
vec3 transformed;
{
  float S = uTile;
  vec2 base = uCenter - 0.5 * S;
  vec2 root = base + mod(aOff.xy * S - base, S);
  vec4 g = texture2D(uGround, root * uGroundUV.x + uGroundUV.y);
  float near = step(1.4, g.a);
  float dry = clamp(g.a - 2.0 * near, 0.0, 1.0);
  float keep = step(aOff.z, g.g);
  vec2 dc = abs(root - uCenter);
  float cheb = max(dc.x, dc.y);
  float fade = 1.0 - smoothstep(S * 0.5 * (1.0 - uFade), S * 0.5, cheb);
  float fl = step(aF.x, mix(uFlFar, uFlNear, near));
  float hgt = mix(uHMin, uHMax, aP.y) * max(g.b, 0.0) * keep * fade * (1.0 + fl * 0.25);
  float wid = uBladeW * (0.8 + 0.4 * aP.w) * keep * (0.5 + 0.5 * fade);
  float cy = cos(aP.x), sy = sin(aP.x);
  vec3 lp = position;
  float tip = aTip;
  vec3 p = vec3(lp.x * wid, lp.y * hgt, lp.z * wid);
  // the petal cap: flower instances only (collapsed otherwise), a little disc on top of the tuft
  p.xz = mix(p.xz, lp.xz * uCap * fl * keep * fade, aCap);
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
  vH = tip; vTint = aP.w; vDry = dry; vFl = fl * aCap; vFlK = aF.y;
}
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uRoot, uTip, uDry;
uniform vec3 uF0, uF1, uF2, uF3, uF4;
varying float vH, vTint, vDry, vFl, vFlK;
vec3 gHue(vec3 c, float h) { const vec3 k = vec3(0.57735); float co = cos(h); return c * co + cross(k, c) * sin(h) + k * dot(k, c) * (1.0 - co); }
`;

const FRAG_COLOR = /* glsl */`
{
  float h = clamp(vH, 0.0, 1.0);
  vec3 tipC = mix(uTip, uDry, clamp(vDry * 0.8 + step(0.9, vTint) * 0.45, 0.0, 1.0));
  vec3 c = mix(uRoot, tipC, pow(h, 0.9));
  c = gHue(c, (fract(vTint * 7.31) - 0.5) * 2.0 * ${GRASS.hueJitter.toFixed(4)} * 6.2832) * (1.0 + (fract(vTint * 3.71) - 0.5) * 2.0 * ${GRASS.lJitter.toFixed(3)});
  float k = vFlK * 5.0;
  vec3 fc = k < 1.0 ? uF0 : k < 2.0 ? uF1 : k < 3.0 ? uF2 : k < 4.0 ? uF3 : uF4;
  diffuseColor.rgb = mix(c, fc, step(0.5, vFl));
}
`;

/**
 * Build the tuft material (MeshLambert + the global toon patch + patches). Constant program cache key.
 * @param {object} uniforms
 */
export function makeGrassMaterial(uniforms) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.dithering = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', VERT_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', FRAG_COLOR)
      // both faces shade like the up-bent front face (no dark backfaces from above)
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
  };
  m.customProgramCacheKey = () => 'world-tuft-v1';
  m.userData.owned = true;
  return m;
}

/**
 * The level's grass: one tuft InstancedMesh, driven per frame by `update(time, env, center, player, camera, footprint)`.
 */
export class Grass {
  /**
   * @param {{ground: THREE.Texture, size:number, res:number, quality?: any, colors?: object, seed?: number,
   *          height?: number, near?: number, flowers?: number, count?: number}} o
   */
  constructor(o) {
    const q = o.quality ?? {};
    const W = o.res + 1, scale = (W - 1) / (W * o.size);
    const groundUV = new THREE.Vector2(scale, (o.size / 2) * scale + 0.5 / W);
    const colors = o.colors ?? GRASS_COLORS.meadow;
    const n = Math.max(1, Math.round((o.count ?? q.grassTufts ?? GRASS.count) * (o.near ?? 1)));
    const rnd = mulberry32(((o.seed ?? 7) >>> 0) + 101);
    const base = makeTuftGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
    const off = new Float32Array(n * 3), prm = new Float32Array(n * 4), fl = new Float32Array(n * 2);
    const flMul = o.flowers ?? 1;
    for (let i = 0; i < n; i++) {
      off[i * 3] = rnd(); off[i * 3 + 1] = rnd(); off[i * 3 + 2] = rnd() * 0.999;
      prm[i * 4] = rnd() * Math.PI * 2;
      prm[i * 4 + 1] = rnd();
      prm[i * 4 + 2] = (rnd() - 0.5) * 0.3;
      prm[i * 4 + 3] = rnd();
      fl[i * 2] = flMul > 0 ? rnd() / flMul : 2; fl[i * 2 + 1] = rnd() * 0.999;
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(prm, 4));
    geo.setAttribute('aF', new THREE.InstancedBufferAttribute(fl, 2));
    geo.instanceCount = n;
    const hMul = (o.height ?? 0.26) / 0.26;
    const tile = grassTile(GRASS.defaultD);
    this.uniforms = {
      uTime: { value: 0 }, uWind: { value: 0.6 }, uGust: { value: 0.5 }, uTile: { value: tile },
      uBladeW: { value: GRASS.bladeW }, uHMin: { value: GRASS.hMin * hMul }, uHMax: { value: GRASS.hMax * hMul }, uFade: { value: GRASS.fade },
      uFlNear: { value: GRASS.flowerNear }, uFlFar: { value: GRASS.flowerFar }, uCap: { value: GRASS.capSize },
      uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() }, uCenter: { value: new THREE.Vector2() },
      uPlayer: { value: new THREE.Vector3(0, -999, 0) },
      uGround: { value: o.ground }, uGroundUV: { value: groundUV },
      uRoot: { value: new THREE.Color(colors.root) }, uTip: { value: new THREE.Color(colors.tip) }, uDry: { value: new THREE.Color(colors.dry) },
      uF0: { value: new THREE.Color(FLOWER_COLORS[0]) }, uF1: { value: new THREE.Color(FLOWER_COLORS[1]) }, uF2: { value: new THREE.Color(FLOWER_COLORS[2]) },
      uF3: { value: new THREE.Color(FLOWER_COLORS[3]) }, uF4: { value: new THREE.Color(FLOWER_COLORS[4]) },
    };
    this.material = makeGrassMaterial(this.uniforms);
    this.geometry = geo;
    const mesh = this.mesh = new THREE.Mesh(geo, this.material);
    // PERF §8.4: a camera-following bounding sphere (centre = tile centre, r = T · 0.75); never frustumCulled = false
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), tile * 0.75);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.renderOrder = 1;                     // after terrain and props: depth rejects hidden tufts
    mesh.name = 'grass';
    mesh.userData.owned = true;
    base.dispose();
    this.group = new THREE.Group(); this.group.name = 'grass';
    this.group.add(mesh);
    /** kept for callers that iterate layers (one layer now) */
    this.layers = [{ mesh, uniforms: this.uniforms, geometry: geo, material: this.material }];
    this._dir = new THREE.Vector2();
    this._corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  /**
   * Per frame. `center` = the iso focus (her feet otherwise), `player` = the trample position (or null), `camera` /
   * `footprint` place and size the tile (footprint centre, T = 1.6 · d covering the footprint + 3 m).
   */
  update(time, env, center, player, camera = null, footprint = null) {
    const u = this.uniforms;
    u.uTime.value = time; u.uWind.value = env?.wind ?? 0.6; u.uGust.value = env?.gust ?? 0.5;
    if (env?.windDir) u.uWindDir.value.copy(env.windDir); else u.uWindDir.value.set(0.8, 0.6).normalize();
    if (player) u.uPlayer.value.copy(player); else u.uPlayer.value.set(0, -999, 0);
    if (!center) return;
    let cx = center.x, cz = center.z, d = GRASS.defaultD, extent = 0;
    if (Number.isFinite(footprint?.cx) && Number.isFinite(footprint?.cz)) { cx = footprint.cx; cz = footprint.cz; }
    if (Number.isFinite(footprint?.d)) d = footprint.d;
    else if (camera?.position) d = camera.position.distanceTo(center);
    const c = footprintCorners(footprint, camera, center.y, this._corners);
    if (c) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of c) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
      if (!Number.isFinite(footprint?.cx)) { cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; }
      extent = Math.max(x1 - x0, z1 - z0);
    }
    const T = grassTile(d, extent);
    u.uTile.value = T;
    u.uCenter.value.set(cx, cz);
    const bs = this.geometry.boundingSphere;
    bs.center.set(cx, center.y, cz); bs.radius = T * 0.75;
  }

  /** Tuft instances. */
  get count() { return this.geometry.instanceCount; }

  /** Triangles drawn per frame (6 per tuft + the 2-tri cap, collapsed on grass). */
  get tris() { return this.geometry.instanceCount * (this.geometry.index.count / 3); }

  dispose() {
    this.geometry.dispose(); this.material.dispose();
    this.layers.length = 0;
    this.group.removeFromParent();
  }
}
