// src/fx/Telegraphs.js  (owner: fx) — GAME_DESIGN §8.1: one telegraph language for every enemy and boss.
// Colour + shape (+ the sound, which audio plays off the same `combat:telegraph` event), so colour-blind players can read
// it; with settings.patterns, red gets stripes and gold gets dots (§14.4).
//
//   kind     visual (this file)                                                  shape(s)
//   parry    white 4-point glint on the weapon + white "!" over the head          glint
//   gold     gold #FFD34D slowly rotating 8-point star on the weapon              glint
//   red      red-orange #FF3B30 glow on the weapon and body + jagged "!!"         glint (or any decal shape, tinted red)
//   aoe      ground decal filling from the centre outward, #FF6A3D @ 0.45, white rim; full = it hits   circle | lane | cone | ring
//   aim      dotted white line from the shooter; stops tracking 0.2 s before the shot               line
//   grab     purple #9B5CFF swirl around the hands                                 swirl
//   jeer     purple #B07CFF expanding sound-wave rings around the hyena            rings
//   shadow   dark circle decal that grows; tracks for the first 60%, then freezes  shadow
//
// Descriptor (combat:telegraph payload, §19.5): { id, actor, kind, shape, pos, dir, size, duration } plus optional
// { r, w|width, l|length|range, angle, inner, target, follow }. `size` may be a number, [a, b] or an object (see
// normalizeTelegraph). Timers run in SIM time (update), so hitstop / slow motion keep them in sync with enemy windups.
import * as THREE from 'three';
import { TELEGRAPH } from '../core/config.js';
import { FOG_FACTOR, OUTPUT, fogUniforms } from './shaders.js';
import { MARK } from './Marks.js';
import { toVec3, actorWorldPos, weaponPoint, headPoint, groundY, isActor } from './util.js';

export const SHAPES = Object.freeze(['glint', 'circle', 'lane', 'cone', 'ring', 'line', 'swirl', 'rings', 'shadow']);
export const KINDS = Object.freeze(['parry', 'gold', 'red', 'aoe', 'aim', 'grab', 'jeer', 'shadow']);
const DECAL_SHAPE = { circle: 0, ring: 1, lane: 2, cone: 3, shadow: 4, rings: 5 };

/** Default shape per kind (when the descriptor has none). */
export function defaultShape(kind) {
  switch (kind) {
    case 'parry': case 'gold': case 'red': return 'glint';
    case 'aim': return 'line';
    case 'grab': return 'swirl';
    case 'jeer': return 'rings';
    case 'shadow': return 'shadow';
    default: return 'circle';
  }
}

const num = (v, d) => (Number.isFinite(v) ? v : d);

/**
 * Normalise a telegraph descriptor into explicit dimensions (pure; unit-tested).
 *  - circle / shadow / rings: `r` (size number = r)
 *  - ring: `r` outer, `inner` (size [inner, r]; default inner = r − max(0.35, 0.2 r))
 *  - lane: `w` × `l` from the origin along `dir` (size number = length, width default 1.5; size [w, l])
 *  - cone: `r`, full `angle` rad (size number = r, angle default 60°; size [r, angle])
 *  - line: `l` (range; size number = length, default 18)
 * @param {object} d
 */
export function normalizeTelegraph(d = {}) {
  const kind = KINDS.includes(d.kind) ? d.kind : (d.kind ?? 'aoe');
  const shape = SHAPES.includes(d.shape) ? d.shape : defaultShape(kind);
  const s = d.size;
  const o = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  const a = Array.isArray(s) ? s : null;
  const n = typeof s === 'number' ? s : null;
  let r = num(d.r ?? o.r, null), w = num(d.w ?? d.width ?? o.w ?? o.width, null), l = num(d.l ?? d.length ?? d.range ?? o.l ?? o.length ?? o.range, null);
  let angle = num(d.angle ?? o.angle, null), inner = num(d.inner ?? o.inner, null);
  switch (shape) {
    case 'lane':
      if (a) { w ??= a[0]; l ??= a[1]; }
      l ??= n ?? 6; w ??= 1.5; break;
    case 'cone':
      if (a) { r ??= a[0]; angle ??= a[1]; }
      r ??= n ?? 3; angle ??= Math.PI / 3; break;
    case 'ring':
      if (a) { inner ??= a[0]; r ??= a[1]; }
      r ??= n ?? 2.5; inner ??= r - Math.max(0.35, r * 0.2); break;
    case 'line':
      l ??= n ?? (a ? a[0] : 18); break;
    default:
      if (a) r ??= a[0];
      r ??= n ?? 1.2;
  }
  r = Math.max(0.25, r ?? 1); w = Math.max(0.3, w ?? 1); l = Math.max(0.3, l ?? 1);
  angle = Math.min(Math.PI * 2, Math.max(0.1, angle ?? Math.PI / 3));
  inner = Math.max(0, Math.min(r - 0.1, inner ?? 0));
  const duration = Math.max(0.05, num(d.duration, TELEGRAPH.minLead[kind] ?? 0.5));
  const color = TELEGRAPH.colors[kind] ?? TELEGRAPH.colors.aoe;
  return { id: d.id, kind, shape, color, duration, r, w, l, angle, inner, follow: d.follow, actor: d.actor ?? null, target: d.target ?? null };
}

/**
 * Is the telegraph still tracking its target at time t? (§8.1: `aim` stops 0.2 s before the shot; `shadow` tracks for
 * the first 60% of its time, then freezes.) Pure.
 */
export function isTracking(shape, kind, t, duration) {
  if (shape === 'line' || kind === 'aim') return t < duration - 0.2;
  if (shape === 'shadow' || kind === 'shadow') return t < duration * 0.6;
  return true;
}

/** Fill progress 0..1 (full = it hits). */
export const fillProgress = (t, duration) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 1);

/** Local-space bounds [x0, x1, z0, z1] of a decal shape (metres; origin = telegraph pos, +z = dir). Pure. */
export function decalBounds(n) {
  const m = 0.12;
  switch (n.shape) {
    case 'lane': return [-n.w / 2 - m, n.w / 2 + m, -m, n.l + m];
    case 'cone': { const ha = n.angle / 2; const back = ha > Math.PI / 2 ? -n.r : 0; const side = ha >= Math.PI / 2 ? n.r : n.r * Math.sin(ha);
      return [-side - m, side + m, back - m, n.r + m]; }
    default: return [-n.r - m, n.r + m, -n.r - m, n.r + m];
  }
}

// ------------------------------------------------------------------ ground decal
const DECAL_VERT = /* glsl */`
attribute vec2 aLocal;
varying vec2 vLocal;
#include <fog_pars_vertex>
void main() {
  vLocal = aLocal;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const DECAL_FRAG = /* glsl */`
uniform int uShape;
uniform vec3 uColor;
uniform vec3 uRim;
uniform float uFill, uAlpha, uR, uW, uL, uAngle, uInner, uTime, uPattern;
varying vec2 vLocal;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  vec2 p = vLocal;
  float d = length( p );
  float aa = 0.035;
  float edge;              // signed distance to the shape edge, + inside (m)
  float fillM;             // 1 where the fill has reached
  float baseA = 0.12, fillA = 0.45;
  vec3 col = uColor;
  float rimW = 0.06 + 0.012 * uR;
  if ( uShape == 0 ) {
    edge = uR - d;
    fillM = smoothstep( -aa, aa, uR * uFill - d );
  } else if ( uShape == 1 ) {                        // ring wave: annulus inner..r fills outward, a front sweeps 0 → r
    edge = uR - d;
    float band = smoothstep( -aa, aa, d - uInner );
    fillM = band * smoothstep( -aa, aa, mix( uInner, uR, uFill ) - d );
    fillM = max( fillM, 1.0 - smoothstep( 0.0, 0.08, abs( d - uR * uFill ) ) );
    fillM = max( fillM, ( 1.0 - smoothstep( 0.0, rimW * 0.7, abs( d - uInner ) ) ) * 0.8 );
    baseA = 0.03 + 0.09 * band;
  } else if ( uShape == 2 ) {
    edge = min( uW * 0.5 - abs( p.x ), min( p.y, uL - p.y ) );
    fillM = smoothstep( -aa, aa, uL * uFill - p.y );
  } else if ( uShape == 3 ) {
    float ang = abs( atan( p.x, p.y ) );
    float ha = uAngle * 0.5;
    edge = min( uR - d, ( ha - ang ) * max( d, 0.25 ) );
    fillM = smoothstep( -aa, aa, uR * uFill - d );
  } else if ( uShape == 4 ) {                        // shadow: grows, darkens, soft edge, no rim
    float R = uR * ( 0.35 + 0.65 * uFill );
    float a = ( 0.22 + 0.46 * uFill ) * ( 1.0 - smoothstep( R * 0.72, R, d ) );
    a *= uAlpha;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( col, a );
    ${OUTPUT}
    return;
  } else {                                           // rings: jeer sound waves
    edge = uR - d;
    float a = 0.0;
    for ( int i = 0; i < 3; i++ ) {
      float rr = fract( uTime * 0.6 + float( i ) / 3.0 ) * uR;
      a += ( 1.0 - smoothstep( 0.04, 0.16, abs( d - rr ) ) ) * ( 1.0 - rr / uR ) * 0.85;
    }
    a = max( a, 0.06 * step( 0.0, edge ) );
    a = max( a, ( 1.0 - smoothstep( 0.0, rimW, abs( edge ) ) ) * 0.5 );
    a *= step( -aa, edge ) * uAlpha;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( mix( col, fxFogColor(), fxFog() * 0.5 ), min( a, 1.0 ) );
    ${OUTPUT}
    return;
  }
  float inside = smoothstep( -aa, aa, edge );
  if ( inside < 0.002 ) discard;
  float a = mix( baseA, fillA, fillM );
  if ( uPattern > 0.5 && uPattern < 1.5 ) a *= 0.6 + 0.4 * step( 0.5, fract( ( p.x + p.y ) * 1.6 ) );
  else if ( uPattern > 1.5 ) { vec2 g = fract( p * 2.2 ) - 0.5; a = max( a * 0.75, ( 1.0 - smoothstep( 0.14, 0.2, length( g ) ) ) * 0.6 ); }
  float rim = 1.0 - smoothstep( rimW * 0.55, rimW, edge );
  col = mix( col, uRim, rim );
  a = max( a, rim * 0.95 );
  a *= inside * uAlpha;
  col = mix( col, fxFogColor(), fxFog() * 0.5 );
  gl_FragColor = vec4( col, a );
  ${OUTPUT}
}`;

let _decalBase = null;
function decalMaterial() {
  if (!_decalBase) {
    _decalBase = new THREE.ShaderMaterial({
      name: 'fx.telegraph.decal', vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uShape: { value: 0 }, uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color('#FFFFFF') },
        uFill: { value: 0 }, uAlpha: { value: 0 }, uR: { value: 1 }, uW: { value: 1 }, uL: { value: 1 }, uAngle: { value: 1 },
        uInner: { value: 0 }, uTime: { value: 0 }, uPattern: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
  }
  return _decalBase.clone();
}

const GRID = 17;
const LIFT = 0.035;

/** A pooled ground decal conformed to the terrain (grid of GRID × GRID vertices). */
class Decal {
  constructor() {
    const g = new THREE.BufferGeometry();
    const n = GRID * GRID;
    this.pos = new Float32Array(n * 3); this.loc = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLocal', new THREE.BufferAttribute(this.loc, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let j = 0; j < GRID - 1; j++) for (let i = 0; i < GRID - 1; i++) {
      const a = j * GRID + i, b = a + 1, c = a + GRID, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    this.geometry = g;
    this.material = decalMaterial();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.telegraph.decal';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.busy = false;
    this._key = [NaN, NaN, NaN, NaN];
  }

  /** Lay the decal at origin (ox, oz) facing (fx, fz); `bounds` from decalBounds; heights from `ground`. */
  place(ox, oy, oz, fx, fz, bounds, ground) {
    const k = this._key;
    if (Math.abs(k[0] - ox) < 0.01 && Math.abs(k[1] - oz) < 0.01 && Math.abs(k[2] - fx) < 0.005 && Math.abs(k[3] - fz) < 0.005) return;
    k[0] = ox; k[1] = oz; k[2] = fx; k[3] = fz;
    const x0 = bounds[0], x1 = bounds[1], z0 = bounds[2], z1 = bounds[3], sx = fz, sz = -fx;     // side vector ⟂ dir
    const P = this.pos, L = this.loc;
    for (let j = 0; j < GRID; j++) {
      const lz = z0 + (z1 - z0) * (j / (GRID - 1));
      for (let i = 0; i < GRID; i++) {
        const lx = x0 + (x1 - x0) * (i / (GRID - 1)), v = j * GRID + i;
        const wx = ox + sx * lx + fx * lz, wz = oz + sz * lx + fz * lz;
        P[v * 3] = wx; P[v * 3 + 1] = ground(wx, wz, oy) + LIFT; P[v * 3 + 2] = wz;
        L[v * 2] = lx; L[v * 2 + 1] = lz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLocal.needsUpdate = true;
  }

  reset() { this._key[0] = NaN; this.busy = false; this.mesh.visible = false; }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

// ------------------------------------------------------------------ aim line (dotted)
const LINE_VERT = /* glsl */`
attribute vec2 aLine;     // x = metres along, y = across (−1..1)
varying vec2 vLine;
#include <fog_pars_vertex>
void main() {
  vLine = aLine;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const LINE_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha, uCrawl, uLock, uWidth, uLen;
varying vec2 vLine;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  float spacing = 0.32;
  float s = fract( ( vLine.x - uCrawl ) / spacing ) - 0.5;
  vec2 q = vec2( s * spacing, vLine.y * uWidth * 0.5 );
  float dd = length( q );
  float dotR = 0.045 + 0.012 * uLock;
  float dotM = 1.0 - smoothstep( dotR - 0.012, dotR, dd );
  float halo = 1.0 - smoothstep( dotR, dotR + 0.03, dd );
  float core = ( 1.0 - smoothstep( 0.0, 0.3, abs( vLine.y ) ) ) * 0.18;
  float ends = smoothstep( 0.0, 0.3, vLine.x ) * ( 1.0 - smoothstep( uLen - 0.4, uLen, vLine.x ) );
  vec3 col = mix( vec3( 0.04, 0.025, 0.02 ), uColor * ( 1.4 + 1.2 * uLock ), max( dotM, core / 0.18 * 0.6 ) );
  float a = max( max( dotM, halo * 0.45 ), core ) * ends * uAlpha;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( mix( col, fxFogColor(), fxFog() * 0.4 ), a );
  ${OUTPUT}
}`;

let _lineBase = null;
class AimLine {
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(12); this.uv = new Float32Array(8);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLine', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    this.geometry = g;
    _lineBase ??= new THREE.ShaderMaterial({
      name: 'fx.telegraph.aim', vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: new THREE.Color('#FFFFFF') }, uAlpha: { value: 1 }, uCrawl: { value: 0 }, uLock: { value: 0 },
        uWidth: { value: 0.16 }, uLen: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    this.material = _lineBase.clone();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.telegraph.aim';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 8; this.mesh.visible = false;
    this.busy = false;
  }

  /** Billboard the strip around the segment a→b, facing the camera. */
  set(a, b, camPos, width) {
    _d.subVectors(b, a); const len = _d.length();
    if (len < 1e-4) return;
    _d.multiplyScalar(1 / len);
    _m.addVectors(a, b).multiplyScalar(0.5);
    _s.subVectors(camPos, _m).cross(_d);
    if (_s.lengthSq() < 1e-8) _s.set(0, 1, 0); else _s.normalize();
    _s.multiplyScalar(width * 0.5);
    const P = this.pos, U = this.uv;
    P[0] = a.x - _s.x; P[1] = a.y - _s.y; P[2] = a.z - _s.z;
    P[3] = a.x + _s.x; P[4] = a.y + _s.y; P[5] = a.z + _s.z;
    P[6] = b.x - _s.x; P[7] = b.y - _s.y; P[8] = b.z - _s.z;
    P[9] = b.x + _s.x; P[10] = b.y + _s.y; P[11] = b.z + _s.z;
    U[0] = 0; U[1] = -1; U[2] = 0; U[3] = 1; U[4] = len; U[5] = -1; U[6] = len; U[7] = 1;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLine.needsUpdate = true;
    this.material.uniforms.uLen.value = len;
    this.material.uniforms.uWidth.value = width;
  }

  reset() { this.busy = false; this.mesh.visible = false; }
  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

const _d = new THREE.Vector3(), _m = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const _col = new THREE.Color(), _white = new THREE.Color('#FFFFFF');
const RED_GLOW = new THREE.Color(TELEGRAPH.colors.red);

/** One live telegraph. */
class Live {
  constructor() {
    this.n = null; this.id = null; this.t = 0; this.real = 0; this.out = -1; this.fadeIn = 0;
    this.origin = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 0, 1);
    this.aimTo = new THREE.Vector3(); this.color = new THREE.Color();
    this.follow = false; this.decal = null; this.line = null; this.actor = null; this.target = null; this.frozen = false;
    this.bounds = null;
  }
}

export class Telegraphs {
  /** @param {any} ctx @param {import('./Marks.js').Marks} marks */
  constructor(ctx, marks) {
    this.ctx = ctx;
    this.marks = marks;
    /** @type {Map<any, Live>} */
    this.active = new Map();
    this._free = [];
    this.decals = []; this.lines = [];
    this.scene = null;
    this.started = 0;          // total telegraphs started (tests/smoke)
    this._ground = (x, z, fb) => groundY(ctx, x, z, fb);
  }

  /** Build the pools (call from FX.init). */
  init(scene) {
    this.scene = scene;
    const nDecals = TELEGRAPH.decalPool ?? 32;
    for (let i = 0; i < nDecals; i++) { const d = new Decal(); this.decals.push(d); scene.add(d.mesh); }
    for (let i = 0; i < 8; i++) { const l = new AimLine(); this.lines.push(l); scene.add(l.mesh); }
  }

  get count() { return this.active.size; }

  /** Start (or restart) a telegraph from a §19.5 descriptor; returns its id. */
  start(desc, id) {
    const n = normalizeTelegraph(desc);
    if (this.active.has(id)) this._release(this.active.get(id));
    const L = this._free.pop() ?? new Live();
    L.n = n; L.id = id; L.t = 0; L.real = 0; L.out = -1; L.fadeIn = 0; L.frozen = false;
    L.actor = isActor(n.actor) ? n.actor : null;
    L.target = isActor(n.target) ? n.target : (n.shape === 'line' || n.shape === 'shadow' ? this.ctx.player ?? null : null);
    L.color.set(n.color);
    if (!toVec3(desc.pos, L.origin)) { if (L.actor) actorWorldPos(L.actor, L.origin); else L.origin.set(0, 0, 0); }
    if (desc.dir && toVec3(desc.dir, L.dir) && (L.dir.x * L.dir.x + L.dir.z * L.dir.z) > 1e-8) { L.dir.y = 0; L.dir.normalize(); }
    else if (L.actor) L.dir.set(Math.sin(L.actor.facing), 0, Math.cos(L.actor.facing));
    else L.dir.set(0, 0, 1);
    // follow the actor when the shape is centred on it (slams, barks, spins); fixed when placed elsewhere (landing spots)
    L.follow = n.follow ?? (!!L.actor && n.shape !== 'shadow' && n.shape !== 'line'
      && Math.hypot(L.origin.x - L.actor.pos.x, L.origin.z - L.actor.pos.z) < 0.75);
    L.decal = null; L.line = null;
    L.bounds = decalBounds(n);
    if (DECAL_SHAPE[n.shape] !== undefined) {
      const d = this.decals.find((x) => !x.busy);
      if (d) {
        d.busy = true; d._key[0] = NaN; L.decal = d;
        const u = d.material.uniforms;
        u.uShape.value = DECAL_SHAPE[n.shape];
        u.uColor.value.set(n.kind === 'shadow' || n.shape === 'shadow' ? '#05070A' : n.color);
        u.uR.value = n.r; u.uW.value = n.w; u.uL.value = n.l; u.uAngle.value = n.angle; u.uInner.value = n.inner;
        u.uFill.value = 0; u.uAlpha.value = 0; u.uTime.value = 0;
      }
    } else if (n.shape === 'line') {
      const l = this.lines.find((x) => !x.busy);
      if (l) { l.busy = true; L.line = l; l.material.uniforms.uColor.value.set(n.color); }
    }
    this.active.set(id, L);
    this.started++;
    return id;
  }

  /** End a telegraph (fades out quickly). */
  end(id) {
    const L = this.active.get(id);
    if (L && L.out < 0) L.out = 0;
  }

  /** Remove everything immediately (level unload). */
  clear() { for (const L of [...this.active.values()]) this._release(L); }

  _release(L) {
    L.decal?.reset(); L.line?.reset();
    L.decal = null; L.line = null; L.actor = null; L.target = null; L.n = null;
    this.active.delete(L.id);
    this._free.push(L);
  }

  /** Sim step: advance timers (keeps in sync with enemy windups under hitstop / slow-mo). */
  update(dt) {
    for (const L of this.active.values()) {
      L.t += dt;
      if (L.out < 0 && L.t > L.n.duration + 0.6) L.out = 0;      // safety: an END that never came
      if (L.out < 0 && L.actor && L.actor.alive === false) L.out = 0;
    }
  }

  /** Per frame: place visuals and push marks. `dt` = visual dt. */
  render(dt) {
    const ctx = this.ctx, cam = ctx.camera, time = ctx.game?.realTime ?? 0;
    const patterns = !!ctx.state?.settings?.patterns;
    for (const L of this.active.values()) {
      const n = L.n;
      L.real += dt;
      L.fadeIn = Math.min(1, L.fadeIn + dt / 0.08);
      if (L.out >= 0) { L.out += dt; if (L.out >= 0.15) { this._release(L); continue; } }
      const alpha = L.fadeIn * (L.out >= 0 ? 1 - L.out / 0.15 : 1);
      const prog = fillProgress(L.t, n.duration);
      const tracking = isTracking(n.shape, n.kind, L.t, n.duration);
      const pattern = patterns ? (n.kind === 'red' ? 1 : n.kind === 'gold' ? 2 : 0) : 0;
      // ---- origin / direction
      if (L.follow && L.actor) {
        actorWorldPos(L.actor, L.origin);
        if (n.shape === 'cone') { const f = L.actor.object3d.rotation.y; L.dir.set(Math.sin(f), 0, Math.cos(f)); }
      }
      if (n.shape === 'shadow' && tracking && L.target) actorWorldPos(L.target, L.origin);
      // ---- ground decal
      if (L.decal) {
        const d = L.decal;
        d.place(L.origin.x, L.origin.y, L.origin.z, L.dir.x, L.dir.z, L.bounds, this._ground);
        const u = d.material.uniforms;
        u.uFill.value = prog; u.uAlpha.value = alpha; u.uTime.value = L.real; u.uPattern.value = pattern;
        d.mesh.visible = true;
      }
      // ---- aim line
      if (L.line) this._aim(L, cam, alpha, tracking);
      // ---- marks
      if (L.actor) this._marks(L, alpha, prog, pattern, time);
    }
  }

  _aim(L, cam, alpha, tracking) {
    const n = L.n, l = L.line;
    if (L.actor) weaponPoint(L.actor, _a); else _a.copy(L.origin).setY(L.origin.y + 0.6);
    if (tracking || !L.frozen) {
      if (tracking && L.target) { actorWorldPos(L.target, L.aimTo); L.aimTo.y += (L.target.height ?? 1) * 0.55; }
      else if (!L.target) L.aimTo.copy(_a).addScaledVector(L.dir, n.l);
      if (!tracking) L.frozen = true;
    }
    _b.subVectors(L.aimTo, _a);
    const len = _b.length();
    if (len > n.l) _b.multiplyScalar(n.l / len);
    _b.add(_a);
    l.set(_a, _b, cam.position, 0.16);
    const u = l.material.uniforms;
    u.uAlpha.value = alpha;
    u.uLock.value = L.frozen ? 0.6 + 0.4 * Math.sin(L.real * 40) : 0;
    if (!L.frozen) u.uCrawl.value = L.real * 1.4;
    l.mesh.visible = true;
  }

  _marks(L, alpha, prog, pattern, time) {
    const n = L.n, A = L.actor, M = this.marks, t = L.real;
    const pop = Math.min(1, t / 0.12), popS = pop < 1 ? 1 + 2.70158 * (pop - 1) ** 3 + 1.70158 * (pop - 1) ** 2 : 1;
    const flashAt = n.duration - 0.25;
    const flash = L.t > flashAt && L.t < flashAt + 0.14 ? Math.sin(((L.t - flashAt) / 0.14) * Math.PI) : 0;
    switch (n.kind) {
      case 'parry': {
        weaponPoint(A, _p);
        const tw = 0.85 + 0.15 * Math.sin(t * 18);
        M.push(_p.x, _p.y, _p.z, (0.62 + 0.5 * flash) * popS * tw, MARK.STAR4, _white, 3.2 + 3 * flash, alpha, t * 0.8, pattern);
        M.push(_p.x, _p.y, _p.z, 0.28 * popS, MARK.SOFT, _white, 2.0, alpha * 0.7);
        headPoint(A, _q, 0.32 + 0.04 * Math.sin(t * 9));
        M.push(_q.x, _q.y, _q.z, 0.34 * popS, MARK.EXCL, _white, 1.15, alpha, 0, pattern, 1.25);
        break;
      }
      case 'gold': {
        weaponPoint(A, _p);
        _col.copy(L.color);
        M.push(_p.x, _p.y, _p.z, (0.9 + 0.5 * flash) * popS, MARK.STAR8, _col, 2.8 + 2.5 * flash, alpha, t * 1.1, pattern);
        M.push(_p.x, _p.y, _p.z, 0.45 * popS, MARK.STAR4, _white, 2.4, alpha * 0.9, -t * 0.6, 0);
        break;
      }
      case 'red': {
        weaponPoint(A, _p);
        const pulse = 0.75 + 0.25 * Math.sin(t * 22);
        M.push(_p.x, _p.y, _p.z, 0.95 * pulse * popS, MARK.SOFT, RED_GLOW, 2.6, alpha, 0, pattern);
        // body glow: a halo pushed behind the actor so its silhouette rims red
        this._behind(A, 0.4, _q);
        const h = (A.height ?? 1) * (A.object3d?.scale?.y ?? 1);
        M.push(_q.x, _q.y, _q.z, h * 1.25, MARK.HALO, RED_GLOW, 1.8, alpha * (0.45 + 0.15 * pulse), 0, 0, 1.35);
        headPoint(A, _q, 0.34 + 0.05 * Math.abs(Math.sin(t * 12)));
        M.push(_q.x, _q.y, _q.z, 0.5 * popS, MARK.EXCL2, RED_GLOW, 1.3, alpha, 0, pattern, 0.95);
        break;
      }
      case 'grab': {
        weaponPoint(A, _p);
        _col.copy(L.color);
        M.push(_p.x, _p.y, _p.z, 0.85 * popS, MARK.SWIRL, _col, 1.9, alpha, t * 2.4);
        break;
      }
      case 'jeer': {
        headPoint(A, _q, -0.25);
        _col.copy(L.color);
        for (let k = 0; k < 2; k++) {
          const f = (t * 1.1 + k * 0.5) % 1;
          M.push(_q.x, _q.y, _q.z, 0.5 + f * 1.6, MARK.RING, _col, 1.6, alpha * (1 - f) * 0.9);
        }
        break;
      }
      default: break;
    }
  }

  /** A point at the actor's chest pushed `back` metres away from the camera (for silhouette halos). */
  _behind(A, back, out) {
    actorWorldPos(A, out);
    out.y += (A.height ?? 1) * 0.5 * (A.object3d?.scale?.y ?? 1);
    _d.subVectors(out, this.ctx.camera.position); _d.y = 0;
    const l = _d.length();
    if (l > 1e-4) out.addScaledVector(_d, back / l);
    return out;
  }

  dispose() {
    this.clear();
    for (const d of this.decals) d.dispose();
    for (const l of this.lines) l.dispose();
    this.decals.length = 0; this.lines.length = 0;
  }
}
