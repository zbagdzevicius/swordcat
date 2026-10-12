// src/world/Wheat.js  (owner: world) — the Crow Fields wheat (§12.3, art.md §9.3): one InstancedMesh of procedural
// wheat clumps instead of rigid crop models. A clump is 10 tapered stalks (each with a slight curve), a spindle seed
// head (two crossed diamond cards) and an awn fan on top, vertex-coloured green-gold → straw → pale awns. Per
// instance: height, yaw, lean and a colour jitter (instanceColor). The vertex shader sways the clumps with the same
// rolling gust waves as the grass (Env wind / gust / windDir) and parts them around the player. One draw call.
// CONTROLS_SPEC §4.2 trample field: up to TRAMPLE.slots trampling actors (her + the nearest enemies): within `r` m the
// stalks bend outward, within `flat` m they flatten to `minH` of their height (readable from the iso camera).
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

/** §4.2 trample: slots (her + 4 enemies), bend radius, flatten radius, flattened height share. */
export const TRAMPLE = Object.freeze({ slots: 5, r: 1.4, flat: 0.9, minH: 0.4 });

/**
 * Trample response at horizontal distance `d` (m) from a trampler: { bend 0..1 (outward lean), squash 0..1 (1 =
 * flattened to TRAMPLE.minH) }. Pure; mirrors the shader.
 */
export function trampleAt(d, T = TRAMPLE) {
  const bend = 1 - smooth01(T.flat * 0.35, T.r, d);
  const squash = 1 - smooth01(T.flat * 0.5, T.flat, d);
  return { bend, squash };
}
function smooth01(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** Wheat look + build knobs. */
export const WHEAT = Object.freeze({
  stalks: 10, spread: 0.3, height: [0.82, 1.06], head: 0.2, headW: 0.03, stalkW: [0.018, 0.008], awn: 0.11,
  colors: { base: '#8CA848', stalk: '#E8CC78', head: '#F6DA88', headDark: '#D8B060', awn: '#FFE8A8' },
});

/**
 * One clump (unit scale, base at y 0, height ≈ 1): `stalks` tapered stalks with seed heads + awns. Pure (three only).
 * Attributes: position, normal, color, aH (0 at the root → 1 at the tip, drives the sway).
 * @param {number} [seed]
 */
export function makeWheatClumpGeometry(seed = 1, o = WHEAT) {
  const rnd = mulberry32(seed >>> 0);
  const P = [], N = [], C = [], H = [], I = [];
  const col = (hex) => new THREE.Color(hex);
  const cBase = col(o.colors.base), cStalk = col(o.colors.stalk), cHead = col(o.colors.head), cDark = col(o.colors.headDark), cAwn = col(o.colors.awn);
  const tmp = new THREE.Color();
  const vert = (x, y, z, c, nx = 0, nz = 0) => {
    P.push(x, y, z); const l = Math.hypot(nx, 1, nz); N.push(nx / l, 1 / l, nz / l); C.push(c.r, c.g, c.b); H.push(y);
    return P.length / 3 - 1;
  };
  for (let s = 0; s < o.stalks; s++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * o.spread;
    const bx = Math.sin(a) * r, bz = Math.cos(a) * r;
    const h = 0.82 + rnd() * 0.18;                         // per-stalk height (the instance scales the clump)
    const la = a + (rnd() - 0.5) * 0.8, lean = 0.05 + rnd() * 0.1; // lean outward a little
    const lx = Math.sin(la) * lean, lz = Math.cos(la) * lean;
    const fy = rnd() * Math.PI;                             // stalk card facing
    const fx = Math.cos(fy), fz = -Math.sin(fy);
    // stalk: 3 rows (base, mid, top), curving with the lean (t²)
    const rows = 3, ids = [];
    for (let k = 0; k < rows; k++) {
      const t = k / (rows - 1), y = t * (h - o.head * 0.6);
      const w = o.stalkW[0] + (o.stalkW[1] - o.stalkW[0]) * t;
      const cx = bx + lx * t * t, cz = bz + lz * t * t;
      tmp.copy(cBase).lerp(cStalk, Math.min(1, t * 1.3));
      ids.push(vert(cx - fx * w, y, cz - fz * w, tmp, lx * 0.5, lz * 0.5), vert(cx + fx * w, y, cz + fz * w, tmp, lx * 0.5, lz * 0.5));
    }
    for (let k = 0; k < rows - 1; k++) { const q = k * 2; I.push(ids[q], ids[q + 1], ids[q + 2], ids[q + 2], ids[q + 1], ids[q + 3]); }
    // seed head: a spindle (two crossed diamond cards) at the top of the stalk, nodding with the lean
    const hx = bx + lx, hz = bz + lz, y0 = h - o.head * 0.75, y1 = h + o.head * 0.25, ym = y0 + (y1 - y0) * 0.45;
    const tip = [hx + lx * 0.5, y1, hz + lz * 0.5];
    for (const ang of [fy, fy + Math.PI / 2]) {
      const dx = Math.cos(ang) * o.headW, dz = -Math.sin(ang) * o.headW;
      const b = vert(hx, y0, hz, cDark, lx, lz);
      const l = vert(hx - dx + lx * 0.2, ym, hz - dz + lz * 0.2, cHead, lx, lz);
      const rr = vert(hx + dx + lx * 0.2, ym, hz + dz + lz * 0.2, cHead, lx, lz);
      const t = vert(tip[0], tip[1], tip[2], cHead, lx, lz);
      I.push(b, rr, l, l, rr, t);
    }
    // awns: a thin pale fan above the head
    const aw = o.awn, ax = Math.cos(fy + 0.8) * aw * 0.14, az = -Math.sin(fy + 0.8) * aw * 0.14;
    const a0 = vert(tip[0], tip[1] - 0.02, tip[2], cAwn, lx, lz);
    const a1 = vert(tip[0] - ax + lx * 0.4, tip[1] + aw, tip[2] - az + lz * 0.4, cAwn, lx, lz);
    const a2 = vert(tip[0] + ax + lx * 0.4, tip[1] + aw, tip[2] + az + lz * 0.4, cAwn, lx, lz);
    I.push(a0, a2, a1);
  }
  const g = new THREE.BufferGeometry();
  const maxY = Math.max(...H) || 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(H.map((y) => Math.max(0, y / maxY)), 1));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

const WHEAT_VERT = /* glsl */`
{
  #ifdef USE_INSTANCING
    vec3 wOrg = instanceMatrix[3].xyz;
    mat3 wInv = inverse(mat3(instanceMatrix));
    float wS = length(instanceMatrix[1].xyz);
  #else
    vec3 wOrg = vec3(0.0); mat3 wInv = mat3(1.0); float wS = 1.0;
  #endif
  float t2 = aH * aH;
  vec2 q = wOrg.xz * 0.11 - uWindDir * uTime * 0.85;
  vec2 qi = floor(q), qf = fract(q); qf = qf * qf * (3.0 - 2.0 * qf);
  float gust = mix(mix(wh21(qi), wh21(qi + vec2(1.0, 0.0)), qf.x), mix(wh21(qi + vec2(0.0, 1.0)), wh21(qi + vec2(1.0, 1.0)), qf.x), qf.y);
  float flutter = sin(uTime * 2.6 + wOrg.x * 1.7 + wOrg.z * 1.3) * 0.12;
  float bend = (gust * 1.0 + 0.25 + flutter) * uWind * (0.6 + 0.5 * uGust);
  vec3 off = vec3(uWindDir.x, 0.0, uWindDir.y) * bend * 0.28 * t2 * wS;
  off.y -= bend * bend * 0.05 * t2 * wS;
  // trample field: the strongest trampler wins (bend outward within r, flatten within flat)
  vec2 tDir = vec2(0.0); float tBend = 0.0, tSquash = 0.0;
  for (int i = 0; i < ${TRAMPLE.slots}; i++) {
    vec4 tp = uTrample[i];
    if (tp.w < 0.5 || abs(tp.y - wOrg.y) > 1.5) continue;
    vec2 away = wOrg.xz - tp.xz; float pd = length(away);
    float b = 1.0 - smoothstep(${(TRAMPLE.flat * 0.35).toFixed(3)}, ${TRAMPLE.r.toFixed(3)}, pd);
    float sq = 1.0 - smoothstep(${(TRAMPLE.flat * 0.5).toFixed(3)}, ${TRAMPLE.flat.toFixed(3)}, pd);
    if (b > tBend) { tBend = b; tDir = pd > 1e-3 ? away / pd : vec2(0.0); }
    tSquash = max(tSquash, sq);
  }
  off.xz += tDir * tBend * 0.6 * t2 * wS;
  // flatten: pull every vertex down toward TRAMPLE.minH of its height (in clump space, before the instance scale)
  vec3 flatOff = vec3(0.0, -transformed.y * (1.0 - ${TRAMPLE.minH.toFixed(3)}) * tSquash, 0.0);
  transformed += wInv * off + flatOff;
}
`;

/** The swaying wheat material (MeshLambert + vertex colours + instance colour, lit by the scene). */
export function makeWheatMaterial(uniforms) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aH;
uniform float uTime, uWind, uGust;
uniform vec2 uWindDir;
uniform vec4 uTrample[${TRAMPLE.slots}];
float wh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WHEAT_VERT);
    // thin double-sided cards: light both faces like the front (no dark backs)
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
  };
  m.customProgramCacheKey = () => 'world-wheat-v3';
  m.userData.owned = true;
  return m;
}

/**
 * A field of wheat clumps. `add(x, y, z, {h, yaw, tiltX, tiltZ, tint})` before `build()`; `update(time, env, player)`
 * per frame. The mesh is level-owned (userData.owned).
 */
export class WheatField {
  constructor({ seed = 5, name = 'wheat' } = {}) {
    this.seed = seed; this.name = name;
    this.items = [];
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.6 }, uGust: { value: 0.5 },
      uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
      uTrample: { value: Array.from({ length: TRAMPLE.slots }, () => new THREE.Vector4(0, -999, 0, 0)) } };
    this.mesh = null;
  }

  add(x, y, z, o = {}) { this.items.push({ x, y, z, h: o.h ?? 1, yaw: o.yaw ?? 0, tiltX: o.tiltX ?? 0, tiltZ: o.tiltZ ?? 0, tint: o.tint ?? 0 }); }

  get count() { return this.items.length; }

  /** Build the InstancedMesh (null when empty). */
  build() {
    if (!this.items.length) return null;
    const geo = makeWheatClumpGeometry(this.seed);
    geo.userData.owned = true;
    const mat = makeWheatMaterial(this.uniforms);
    const mesh = new THREE.InstancedMesh(geo, mat, this.items.length);
    mesh.name = this.name; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.userData.owned = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color(), warm = new THREE.Color('#FFE2A0'), cool = new THREE.Color('#D8D89A');
    this.items.forEach((it, i) => {
      e.set(it.tiltX, it.yaw, it.tiltZ, 'YXZ'); q.setFromEuler(e);
      mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q, s.setScalar(it.h)));
      // colour jitter: warmer / greener clumps and a little brightness spread
      c.setRGB(1, 1, 1).lerp(it.tint >= 0 ? warm : cool, Math.abs(it.tint)).multiplyScalar(0.88 + 0.24 * ((i * 0.6180339) % 1));
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.mesh = mesh;
    return mesh;
  }

  /**
   * Per frame: wind from Env; the trample field from `player` (Vector3 or null) and up to TRAMPLE.slots − 1 more
   * positions in `others` (enemies nearest her; objects with `x, y, z`).
   */
  update(time, env, player, others = null) {
    const u = this.uniforms;
    u.uTime.value = time; u.uWind.value = env?.wind ?? 0.6; u.uGust.value = env?.gust ?? 0.5;
    if (env?.windDir) u.uWindDir.value.copy(env.windDir);
    const T = u.uTrample.value;
    let k = 0;
    if (player) T[k++].set(player.x, player.y, player.z, 1);
    if (others) for (let i = 0; i < others.length && k < T.length; i++) { const o = others[i]; if (o) T[k++].set(o.x, o.y, o.z, 1); }
    for (; k < T.length; k++) T[k].w = 0;
  }

  dispose() {
    this.mesh?.geometry.dispose(); this.mesh?.material.dispose(); this.mesh?.dispose?.();
    this.mesh?.removeFromParent(); this.mesh = null;
  }
}
