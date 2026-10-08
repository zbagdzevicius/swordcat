// src/fx/Horde.js  (owner: fx) — GAME_DESIGN §18.3 "Horde silhouettes": a low-poly bipedal hyena silhouette (the
// beast-head Barbarian read: hunched torso, snout, round ears, mane, tail; some carry spears or a cage on a shoulder
// pole) drawn as ONE instanced draw call (40 on Med/High, 24 on Low) with a vertex-shader walk cycle, unlit dark
// #2A2A2E, living inside the fog beyond 18 m (instances closer to the camera dissolve with a screen-door fade).
//
// Used by CS-02 (shot 4: the horde marches along the lane carrying cages; shot 8 REVERSE_HORDE; shot 10: it parts
// around her like a river around a stone), CS-08 / `gate` (the horde in the fog bank at z −58 … −75) and CS-09 (it
// skids, then scatters into the fog). API (ctx.fx.horde → Horde.set):
//   horde(on, anchor, opts)
//     on      true | 'march' (stream along a path) | 'mill' (a band that shuffles and laughs in place) |
//             'flee' (everyone turns away from opts.from / the anchor and runs off, fading) | false (fade out, then off)
//     anchor  level anchor name ('horde_a' pairs with 'horde_b' automatically), actor id, actor, Vector3, [x, z],
//             [x, y, z], {pos, facing}
//     opts    { to, dir, length, width, count, speed, laugh, cages, spears, avoid (actor | pos), avoidR, from,
//               near, face, fogMul, fade }
// Visual only: no colliders, no AI, never touches gameplay state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTPUT, fogUniforms } from './shaders.js';
import { resolveAnchor, resolveActor, toVec3, groundY, hash01, isActor } from './util.js';

export const HORDE = Object.freeze({
  count: 40, countLow: 24, color: '#2A2A2E', near: 18, speed: 1.6, width: 7, length: 64, laugh: 0.35,
  cageEvery: 5, spearEvery: 3, avoidR: 3.2, fadeIn: 1.2, fadeOut: 1.4, fleeSpeed: 4.2, fleeFade: 2.6, fogMul: 0.55,
});

/** Body-part ids (aPart). */
const PART = Object.freeze({ BODY: 0, LEG_L: 1, LEG_R: 2, ARM_L: 3, ARM_R: 4, HEAD: 5, CAGE: 6, SPEAR: 7, TAIL: 8 });

/** Normalise the `on` argument to a mode (pure; unit-tested). */
export function hordeMode(on) {
  if (on === true) return 'march';
  if (on === 'march' || on === 'mill' || on === 'flee') return on;
  if (on === 'idle' || on === 'laugh') return 'mill';
  if (on === 'part' || on === 'parade') return 'march';
  return on ? 'march' : 'off';
}

/**
 * Deterministic layout of `n` horde members (pure; unit-tested): `u` metres along the path (0..length), `lat` lateral
 * offset (±width/2, in loose files), plus per-member variety. Members are spread evenly along the path with jitter so
 * the stream never bunches; cages every `cageEvery`, spears every `spearEvery` (not both).
 */
export function hordeLayout(n, { length = HORDE.length, width = HORDE.width, cageEvery = HORDE.cageEvery, spearEvery = HORDE.spearEvery } = {}) {
  const out = [];
  const files = Math.max(2, Math.round(width / 1.6));
  for (let i = 0; i < n; i++) {
    const h0 = hash01(i * 7 + 1), h1 = hash01(i * 7 + 2), h2 = hash01(i * 7 + 3), h3 = hash01(i * 7 + 4);
    const file = i % files;
    const lat = (files > 1 ? (file / (files - 1) - 0.5) * width : 0) + (h0 - 0.5) * 0.9;
    const u = ((i + 0.5) / n) * length + (h1 - 0.5) * (length / n) * 0.8;
    const cage = cageEvery > 0 && i % cageEvery === 2;
    const spear = !cage && spearEvery > 0 && i % spearEvery === 0;
    out.push({ u, lat, scale: 1.25 + h2 * 0.3, speedMul: 0.9 + h3 * 0.2, phase: h1 * Math.PI * 2, variant: cage ? 2 : spear ? 1 : 0 });
  }
  return out;
}

/**
 * Lateral push that makes the stream part around a point (pure; unit-tested). `du`/`dl` = the member's offset from the
 * avoid point along / across the path; returns the extra lateral offset (same sign as dl; 0 far away).
 */
export function partOffset(du, dl, r) {
  if (!(r > 0)) return 0;
  const along = Math.abs(du) / (r * 1.8);
  if (along >= 1) return 0;
  const k = 1 - along * along * (3 - 2 * along);              // smooth bump along the path
  const need = r - Math.abs(dl);
  if (need <= 0) return 0;
  const s = dl === 0 ? 1 : Math.sign(dl);
  return s * need * k;
}

// ------------------------------------------------------------------ geometry
function part(geo, id, pivot, mat) {
  if (mat) geo.applyMatrix4(mat);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1));
  const pv = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pv[i * 3] = pivot[0]; pv[i * 3 + 1] = pivot[1]; pv[i * 3 + 2] = pivot[2]; }
  geo.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return geo.index ? geo.toNonIndexed() : geo;
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** The hyena silhouette (~1.35 m before the per-member scale; faces +Z; feet at y 0). */
export function buildHordeGeometry() {
  const parts = [];
  const P = PART;
  // torso: hunched, wider at the shoulders; belly sphere
  parts.push(part(new THREE.CylinderGeometry(0.25, 0.19, 0.58, 7, 1), P.BODY, [0, 0, 0], M(0, 0.98, 0.02, 0.28)));
  parts.push(part(new THREE.SphereGeometry(0.22, 7, 5), P.BODY, [0, 0, 0], M(0, 0.8, 0.02, 0, 0, 0, 1.05, 0.9, 1)));
  parts.push(part(new THREE.SphereGeometry(0.2, 7, 5), P.BODY, [0, 0, 0], M(0, 1.22, 0.1, 0, 0, 0, 1.45, 0.75, 1.0)));       // shoulders
  // mane tuft along the back of the neck
  parts.push(part(new THREE.ConeGeometry(0.09, 0.32, 5), P.HEAD, [0, 1.3, 0.12], M(0, 1.38, -0.02, -0.9)));
  // head: skull, snout, nose, round ears, jaw
  parts.push(part(new THREE.SphereGeometry(0.17, 8, 6), P.HEAD, [0, 1.3, 0.12], M(0, 1.43, 0.24, 0, 0, 0, 1, 0.92, 1.05)));
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.1, 0.26, 6), P.HEAD, [0, 1.3, 0.12], M(0, 1.38, 0.43, Math.PI / 2 + 0.18)));
  parts.push(part(new THREE.SphereGeometry(0.045, 5, 4), P.HEAD, [0, 1.3, 0.12], M(0, 1.36, 0.57)));
  parts.push(part(new THREE.SphereGeometry(0.075, 6, 4), P.HEAD, [0, 1.3, 0.12], M(0.12, 1.58, 0.2, 0, 0, -0.35, 1, 1, 0.45)));
  parts.push(part(new THREE.SphereGeometry(0.075, 6, 4), P.HEAD, [0, 1.3, 0.12], M(-0.12, 1.58, 0.2, 0, 0, 0.35, 1, 1, 0.45)));
  // legs (pivot at the hips): thigh + shin + big foot
  for (const [id, x] of [[P.LEG_L, 0.12], [P.LEG_R, -0.12]]) {
    parts.push(part(new THREE.CylinderGeometry(0.085, 0.07, 0.42, 6), id, [x, 0.72, 0], M(x, 0.52, 0.02)));
    parts.push(part(new THREE.CylinderGeometry(0.065, 0.055, 0.3, 6), id, [x, 0.72, 0], M(x, 0.2, -0.02, -0.12)));
    parts.push(part(new THREE.BoxGeometry(0.13, 0.07, 0.24), id, [x, 0.72, 0], M(x, 0.04, 0.05)));
  }
  // arms (pivot at the shoulders), long and dangly
  for (const [id, x] of [[P.ARM_L, 0.29], [P.ARM_R, -0.29]]) {
    parts.push(part(new THREE.CylinderGeometry(0.065, 0.05, 0.56, 6), id, [x, 1.24, 0.08], M(x * 1.05, 0.97, 0.12, 0.15, 0, x > 0 ? -0.12 : 0.12)));
    parts.push(part(new THREE.SphereGeometry(0.07, 5, 4), id, [x, 1.24, 0.08], M(x * 1.1, 0.68, 0.17)));
  }
  // tail
  parts.push(part(new THREE.ConeGeometry(0.06, 0.34, 5), P.TAIL, [0, 0.78, -0.16], M(0, 0.72, -0.3, -2.0)));
  // spear (right hand, upright, leaning forward)
  parts.push(part(new THREE.CylinderGeometry(0.018, 0.018, 1.9, 4), P.SPEAR, [-0.29, 1.24, 0.08], M(-0.33, 1.25, 0.24, 0.12)));
  parts.push(part(new THREE.ConeGeometry(0.045, 0.2, 4), P.SPEAR, [-0.29, 1.24, 0.08], M(-0.33, 2.27, 0.37, 0.12)));
  // cage on a shoulder pole: pole forward-back over the right shoulder, the cage hanging behind (pivot = pole end)
  parts.push(part(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 4), P.SPEAR, [-0.2, 1.38, 0], M(-0.2, 1.42, -0.15, Math.PI / 2 - 0.12)));
  const cx = -0.2, cy = 0.92, cz = -0.75, s = 0.26;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(new THREE.BoxGeometry(0.03, s * 2, 0.03), P.CAGE, [cx, 1.48, cz], M(cx + x * s, cy, cz + z * s)));
  for (const y of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(s * 2 + 0.03, 0.03, 0.03), P.CAGE, [cx, 1.48, cz], M(cx, cy + y * s, cz - s)));
    parts.push(part(new THREE.BoxGeometry(s * 2 + 0.03, 0.03, 0.03), P.CAGE, [cx, 1.48, cz], M(cx, cy + y * s, cz + s)));
    parts.push(part(new THREE.BoxGeometry(0.03, 0.03, s * 2 + 0.03), P.CAGE, [cx, 1.48, cz], M(cx - s, cy + y * s, cz)));
    parts.push(part(new THREE.BoxGeometry(0.03, 0.03, s * 2 + 0.03), P.CAGE, [cx, 1.48, cz], M(cx + s, cy + y * s, cz)));
  }
  for (const x of [-0.5, 0, 0.5]) parts.push(part(new THREE.BoxGeometry(0.018, s * 2, 0.018), P.CAGE, [cx, 1.48, cz], M(cx + x * s, cy, cz - s)));
  parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 3), P.CAGE, [cx, 1.48, cz], M(cx, cy + s + 0.15, cz)));   // hanger
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ material
const VERT = /* glsl */`
attribute float aPart;
attribute vec3 aPivot;
attribute vec4 iA;      // feet x, y, z, yaw
attribute vec4 iB;      // cycle phase (rad), scale, alpha, variant (0 plain, 1 spear, 2 cage)
attribute vec4 iC;      // gait (0 shuffle … 1 march, >1 run), laugh, sway seed, 0
uniform float uTime;
varying float vAlpha;
varying vec2 vDither;
#include <fog_pars_vertex>
mat3 rotX( float a ) { float c = cos( a ), s = sin( a ); return mat3( 1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c ); }
mat3 rotZ( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0 ); }
void main() {
  vec3 p = position;
  float ph = iB.x, gait = iC.x, laugh = iC.y, seed = iC.z;
  int part = int( aPart + 0.5 );
  float vr = iB.w;
  // hide props this member does not carry
  if ( part == 7 && vr < 0.5 ) p = aPivot;
  if ( part == 6 && vr < 1.5 ) p = aPivot;
  if ( part == 7 && vr > 1.5 && p.y > 1.6 ) p = aPivot;      // cage carriers keep only the pole, not the spear head
  float sw = sin( ph );
  float stride = clamp( gait, 0.0, 1.6 );
  if ( part == 1 || part == 2 ) {
    float a = ( part == 1 ? sw : -sw ) * 0.62 * stride + 0.06 * sin( uTime * 2.0 + seed * 7.0 ) * ( 1.0 - min( stride, 1.0 ) );
    p = rotX( a ) * ( p - aPivot ) + aPivot;
  } else if ( part == 3 || part == 4 ) {
    float carry = ( part == 4 && vr > 0.5 ) ? 0.25 : 1.0;
    float a = ( part == 3 ? -sw : sw ) * 0.5 * stride * carry - 0.25 * laugh * ( 0.5 + 0.5 * sin( uTime * 13.0 + seed * 5.0 ) );
    p = rotX( a ) * ( p - aPivot ) + aPivot;
  } else if ( part == 6 ) {
    float a = sin( ph * 0.5 + seed ) * 0.22 * stride + 0.05 * sin( uTime * 3.0 + seed );
    p = rotX( a ) * ( p - aPivot ) + aPivot;
  } else if ( part == 5 ) {
    // the laugh: head thrown back, shaking
    float a = -0.45 * laugh * ( 0.6 + 0.4 * sin( uTime * 14.0 + seed * 9.0 ) ) + 0.08 * sin( ph * 2.0 ) * stride;
    p = rotX( a ) * ( p - aPivot ) + aPivot;
  } else if ( part == 8 ) {
    p = rotZ( sin( uTime * 6.0 + seed * 3.0 ) * 0.4 ) * ( p - aPivot ) + aPivot;
  }
  // whole-body bob, lean and laugh shake
  float bob = abs( sin( ph ) ) * 0.06 * min( stride, 1.0 ) + laugh * 0.025 * sin( uTime * 26.0 + seed * 11.0 );
  if ( part != 1 && part != 2 ) {
    p.y += bob;
    p = rotX( 0.12 * min( stride, 1.0 ) + 0.18 * max( stride - 1.0, 0.0 ) ) * ( p - vec3( 0.0, 0.7, 0.0 ) ) + vec3( 0.0, 0.7, 0.0 );
  }
  p *= iB.y;
  float c = cos( iA.w ), s = sin( iA.w );
  p = vec3( c * p.x + s * p.z, p.y, -s * p.x + c * p.z ) + iA.xyz;
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = iB.z;
  vDither = vec2( seed * 13.1, seed * 7.7 );
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uFogMul;
#include <fog_pars_fragment>
varying float vAlpha;
varying vec2 vDither;
float fxBayer( vec2 p ) {
  vec2 q = mod( floor( p ), 4.0 );
  int i = int( q.x + q.y * 4.0 );
  float m[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  return ( m[i] + 0.5 ) / 16.0;
}
void main() {
  if ( vAlpha < 0.999 && vAlpha <= fxBayer( gl_FragCoord.xy + vDither ) ) discard;
  vec3 col = uColor;
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float d = fogDensity * uFogMul * vFogDepth;
    float f = 1.0 - exp( - d * d );
  #else
    float f = smoothstep( fogNear, fogFar / max( uFogMul, 0.05 ), vFogDepth );
  #endif
  col = mix( col, fogColor, clamp( f, 0.0, 1.0 ) );
#endif
  gl_FragColor = vec4( col, 1.0 );
  ${OUTPUT}
}`;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _av = new THREE.Vector3();

/** One horde member's runtime state. */
class Member {
  constructor(l) { Object.assign(this, l); this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.flee = 0; }
}

export class Horde {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.mode = 'off';
    this.count = 0;            // members drawn (instanceCount)
    this.visibleCount = 0;     // members not fully faded (smoke)
    this.mesh = null;
    this.members = [];
    this.A = new THREE.Vector3(); this.D = new THREE.Vector3(1, 0, 0); this.S = new THREE.Vector3(0, 0, 1);
    this.length = HORDE.length; this.width = HORDE.width; this.speed = HORDE.speed; this.laugh = HORDE.laugh;
    this.near = HORDE.near; this.master = 0; this.fadeDir = 0; this.t = 0;
    this.avoid = null; this.avoidR = HORDE.avoidR; this.from = new THREE.Vector3(); this.faceYaw = null;
  }

  /** Build the instanced mesh (call from FX.init). */
  init(scene, quality) {
    const n = (quality?.particles ?? 2000) < 1000 ? HORDE.countLow : HORDE.count;
    const base = buildHordeGeometry();
    const g = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'aPart', 'aPivot']) g.setAttribute(k, base.getAttribute(k));
    this._base = base;
    this.iA = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iB = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iC = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.iA); g.setAttribute('iB', this.iB); g.setAttribute('iC', this.iC);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      name: 'fx.horde', vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: new THREE.Color(HORDE.color) }, uTime: { value: 0 }, uFogMul: { value: HORDE.fogMul } },
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.horde';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.visible = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.capacity = n;
    this.members = hordeLayout(n).map((l) => new Member(l));
    scene.add(this.mesh);
  }

  get on() { return this.mode !== 'off'; }

  /**
   * Start / change / stop the horde (see the header). Returns the active mode.
   * @param {boolean|string} on @param {any} [anchor] @param {object} [o]
   */
  set(on, anchor, o = {}) {
    const mode = hordeMode(on);
    const ctx = this.ctx;
    if (mode === 'off') { if (this.mode !== 'off') this.fadeDir = -1; return this.mode; }
    if (!this.mesh) return 'off';
    if (mode === 'flee') return this._flee(anchor ?? o.from, o);
    // ---- path: anchor → to (or along dir / the anchor's facing)
    let facing = resolveAnchor(ctx, anchor ?? o.at ?? null, this.A);
    if (facing === null) {
      const p = ctx.player;
      if (p?.pos) { this.A.copy(p.pos); facing = (p.facing ?? 0) + Math.PI / 2; } else { this.A.set(0, 0, 0); facing = 0; }
    }
    let to = o.to ?? null;
    if (to == null && typeof anchor === 'string' && /_a$/.test(anchor)) {
      const b = anchor.replace(/_a$/, '_b');
      if (ctx.levels?.anchor?.(b)) to = b;
    }
    const length = o.length ?? null;
    if (to != null && resolveAnchor(ctx, to, _w) !== null) {
      this.D.set(_w.x - this.A.x, 0, _w.z - this.A.z);
      const L = this.D.length();
      if (L > 1e-3) this.D.multiplyScalar(1 / L); else this.D.set(Math.sin(facing), 0, Math.cos(facing));
      this.length = length ?? Math.max(20, L);
    } else {
      if (o.dir && toVec3(o.dir, this.D) && (this.D.x * this.D.x + this.D.z * this.D.z) > 1e-8) { this.D.y = 0; this.D.normalize(); }
      else this.D.set(Math.sin(facing), 0, Math.cos(facing));
      this.length = length ?? HORDE.length;
      if (mode === 'march') this.A.addScaledVector(this.D, -this.length / 2);         // centred on the anchor
    }
    this.S.set(this.D.z, 0, -this.D.x);                                                // side vector
    this.width = o.width ?? (mode === 'mill' ? 40 : HORDE.width);
    if (mode === 'mill') {
      this.length = o.depth ?? o.length ?? 14;
      if (to == null) this.A.addScaledVector(this.D, -this.length / 2);
    }
    this.speed = o.speed ?? HORDE.speed;
    this.laugh = o.laugh ?? (mode === 'mill' ? 0.7 : HORDE.laugh);
    this.near = o.near ?? HORDE.near;
    this.material.uniforms.uFogMul.value = o.fogMul ?? HORDE.fogMul;
    this.avoidR = o.avoidR ?? HORDE.avoidR;
    this.avoid = this._ref(o.avoid);
    this.faceYaw = typeof o.face === 'number' ? o.face : null;
    this._facePoint = o.face != null && typeof o.face !== 'number' ? this._ref(o.face) : null;
    // re-layout for this path (counts and props)
    const n = Math.max(1, Math.min(this.capacity, o.count ?? this.capacity));
    const lay = hordeLayout(n, { length: this.length, width: this.width, cageEvery: o.cages === false ? 0 : (o.cageEvery ?? HORDE.cageEvery),
      spearEvery: o.spears === false ? 0 : HORDE.spearEvery });
    this.members.length = 0;
    for (const l of lay) this.members.push(new Member(l));
    this.count = n;
    const fresh = this.mode === 'off';
    this.mode = mode;
    this.fadeDir = 1;
    if (fresh) { this.master = o.fade === false ? 1 : 0; this.t = 0; }
    this.mesh.visible = true;
    this.geometry.instanceCount = n;
    return mode;
  }

  /** An actor (or cutscene actor id) stays live; a level anchor name / vector / array becomes a fixed point. */
  _ref(r) {
    if (r == null) return null;
    if (typeof r === 'string') {
      const a = resolveActor(this.ctx, r);
      if (a) return a;
      const v = new THREE.Vector3();
      return resolveAnchor(this.ctx, r, v) !== null ? v : null;
    }
    if (isActor(r)) return r;
    const v = new THREE.Vector3();
    return toVec3(r, v) ? v : null;
  }

  /** CS-09: everyone turns away from `from` and runs into the fog, fading; then the horde switches off. */
  _flee(from, o) {
    if (this.mode === 'off') return 'off';
    if (from == null || resolveAnchor(this.ctx, from, this.from) === null) { const p = this.ctx.player?.pos; if (p) this.from.copy(p); else this.from.copy(this.A); }
    this.mode = 'flee';
    this.fleeT = 0;
    this.fleeDur = o.dur ?? HORDE.fleeFade;
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      m.flee = 0.15 + 0.35 * hash01(i * 13 + 7);                                       // staggered "skid" before running
      m.yaw = Math.atan2(m.x - this.from.x, m.z - this.from.z) + (hash01(i + 5) - 0.5) * 0.9;
    }
    return 'flee';
  }

  clear() {
    this.mode = 'off'; this.master = 0; this.fadeDir = 0; this.count = 0; this.visibleCount = 0;
    if (this.mesh) { this.mesh.visible = false; this.geometry.instanceCount = 0; }
  }

  /** Per frame (visual dt). */
  render(dt) {
    if (this.mode === 'off' || !this.mesh) return;
    const ctx = this.ctx, cam = ctx.camera.position, time = ctx.game?.realTime ?? 0;
    this.t += dt;
    this.material.uniforms.uTime.value = time;
    // master fade
    if (this.fadeDir > 0) this.master = Math.min(1, this.master + dt / HORDE.fadeIn);
    else if (this.fadeDir < 0) { this.master = Math.max(0, this.master - dt / HORDE.fadeOut); if (this.master <= 0) { this.clear(); return; } }
    let avoid = null;
    if (this.avoid) { avoid = toVec3(isActor(this.avoid) ? this.avoid.object3d : this.avoid, _av); }
    let face = this.faceYaw;
    if (this._facePoint && toVec3(isActor(this._facePoint) ? this._facePoint.object3d : this._facePoint, _w)) face = null;
    const A = this.A, D = this.D, S = this.S, L = this.length, n = this.count;
    const ia = this.iA.array, ib = this.iB.array, ic = this.iC.array;
    let vis = 0;
    if (this.mode === 'flee') this.fleeT += dt;
    for (let i = 0; i < n; i++) {
      const m = this.members[i];
      let gait = 1, laugh = this.laugh, alpha = 1, yaw;
      if (this.mode === 'march') {
        m.u += this.speed * m.speedMul * dt;
        if (m.u > L) m.u -= L;
        let lat = m.lat;
        yaw = Math.atan2(D.x, D.z);
        if (avoid) {
          // part around the avoid point like a river around a stone, turning along the detour
          const du = (avoid.x - A.x) * D.x + (avoid.z - A.z) * D.z, dl = (avoid.x - A.x) * S.x + (avoid.z - A.z) * S.z;
          const o0 = partOffset(m.u - du, m.lat - dl, this.avoidR), o1 = partOffset(m.u + 0.8 - du, m.lat - dl, this.avoidR);
          lat += o0;
          yaw += Math.atan2(o1 - o0, 0.8);
        }
        m.x = A.x + D.x * m.u + S.x * lat; m.z = A.z + D.z * m.u + S.z * lat;
        // the stream wraps: fade in / out over the first / last 5 m of the path
        alpha = Math.min(1, m.u / 5, (L - m.u) / 5);
        m.phase += this.speed * m.speedMul * dt * 4.2;
      } else if (this.mode === 'mill') {
        m.x = A.x + D.x * (m.u % L) + S.x * m.lat; m.z = A.z + D.z * (m.u % L) + S.z * m.lat;
        gait = 0.12; laugh = this.laugh * (0.6 + 0.4 * hash01(i + 99));
        yaw = face ?? (this._facePoint ? Math.atan2(_w.x - m.x, _w.z - m.z) : Math.atan2(-D.x, -D.z));
        yaw += Math.sin(time * 0.7 + m.phase) * 0.25;
        m.phase += dt * 1.6;
      } else {                                                                        // flee
        const run = this.fleeT > m.flee ? 1 : 0;
        const sp = HORDE.fleeSpeed * m.speedMul * run;
        m.x += Math.sin(m.yaw) * sp * dt; m.z += Math.cos(m.yaw) * sp * dt;
        yaw = this.fleeT > m.flee * 0.5 ? m.yaw : m.yaw + Math.PI;                    // skid (still facing her), then turn and run
        gait = run ? 1.5 : 0.2; laugh = run ? 0.25 : 0;
        alpha = 1 - Math.max(0, (this.fleeT - m.flee) / this.fleeDur);
        m.phase += sp * dt * 3.2;
      }
      m.y = groundY(ctx, m.x, m.z, A.y);
      // keep out of the camera's face: dissolve inside `near` metres
      const dc = Math.hypot(m.x - cam.x, m.y + 0.8 - cam.y, m.z - cam.z);
      if (this.near > 0) alpha *= Math.min(1, Math.max(0, (dc - this.near + 4) / 4));
      alpha *= this.master;
      if (alpha > 0.01) vis++;
      ia[i * 4] = m.x; ia[i * 4 + 1] = m.y; ia[i * 4 + 2] = m.z; ia[i * 4 + 3] = yaw;
      ib[i * 4] = m.phase; ib[i * 4 + 1] = m.scale; ib[i * 4 + 2] = Math.max(0, Math.min(1, alpha)); ib[i * 4 + 3] = m.variant;
      ic[i * 4] = gait; ic[i * 4 + 1] = laugh; ic[i * 4 + 2] = hash01(i * 3 + 17); ic[i * 4 + 3] = 0;
    }
    this.visibleCount = vis;
    this.iA.needsUpdate = true; this.iB.needsUpdate = true; this.iC.needsUpdate = true;
    if (this.mode === 'flee' && this.fleeT > 0.5 + this.fleeDur + 0.5) this.clear();
  }

  dispose() {
    this.clear();
    this.mesh?.removeFromParent();
    this.geometry?.dispose(); this._base?.dispose(); this.material?.dispose();
    this.mesh = null;
  }
}
