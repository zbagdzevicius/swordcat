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
//
// Iso camera (research/CONTROLS_SPEC.md §8.2; GroundDecals draws the melee strike wedges and the parry ring): glints
// and "!" / "!!" are a CONSTANT screen size (glint 28 px, gold 34 px, "!" 34 px at head + 0.5 m, the strike flash ×1.6)
// on an overlay batch (depthTest off, renderOrder 10), so they read through roofs and at any zoom; ranged aim lines lie
// flat on the ground (y + 0.05) along the whole projected path (≤ 12 m), dotted while tracking, solid white once they
// stop tracking 0.2 s before the shot; decal rims are ≥ 0.12 m wide; the jeer gets a faint purple ground disc.
import * as THREE from 'three';
import { TELEGRAPH } from '../core/config.js';
import { FOG_FACTOR, OUTPUT, fogUniforms, fxShaderMaterial, withFxFog } from './shaders.js';
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
uniform float uFill, uAlpha, uR, uW, uL, uAngle, uInner, uTime, uPattern, uDisc;
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
  float rimW = max( 0.12, 0.06 + 0.012 * uR );     // §8.2.5: rim ≥ 0.12 m
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
  } else if ( uShape == 4 ) {                        // shadow: grows and darkens; a faint pale rim keeps it readable on dark grass
    float R = uR * ( 0.35 + 0.65 * uFill );
    float a = ( 0.3 + 0.45 * uFill ) * ( 1.0 - smoothstep( R * 0.7, R, d ) );
    float rimM = ( 1.0 - smoothstep( 0.0, 0.05 + 0.04 * uR, abs( d - R * 0.97 ) ) ) * ( 0.25 + 0.2 * uFill );
    col = mix( col, vec3( 0.78, 0.8, 0.84 ), rimM / max( rimM + a, 1e-3 ) );
    a = max( a, rimM ) * uAlpha;
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
    a = max( a, max( 0.06, uDisc ) * step( 0.0, edge ) );   // §8.2.7 the jeer's faint ground disc
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
    _decalBase = fxShaderMaterial({
      name: 'fx.telegraph.decal', vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uShape: { value: 0 }, uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color('#FFFFFF') },
        uFill: { value: 0 }, uAlpha: { value: 0 }, uR: { value: 1 }, uW: { value: 1 }, uL: { value: 1 }, uAngle: { value: 1 },
        uInner: { value: 0 }, uTime: { value: 0 }, uPattern: { value: 0 }, uDisc: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
  }
  return withFxFog(_decalBase.clone());
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
uniform float uAlpha, uCrawl, uLock, uWidth, uLen, uSolid, uCap, uHole;
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
  if ( uSolid > 0.5 ) {                             // iso, locked: a solid white bar (it fires along this now)
    float bar = 1.0 - smoothstep( 0.5, 0.85, abs( vLine.y ) );
    col = mix( vec3( 0.04, 0.025, 0.02 ), uColor * 1.8, bar );
    a = max( bar, ( 1.0 - smoothstep( 0.85, 1.0, abs( vLine.y ) ) ) * 0.5 ) * ends * uAlpha;
  }
  // iso: kept under the bloom threshold (a flat ground strip must not bloom into a wide white bar), and faded
  // around her (uHole = metres along the line nearest her) so her silhouette stays readable on top of it
  col = min( col, vec3( uCap ) );
  a *= mix( 0.12, 1.0, smoothstep( 0.35, 1.05, abs( vLine.x - uHole ) ) );
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
    _lineBase ??= fxShaderMaterial({
      name: 'fx.telegraph.aim', vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: new THREE.Color('#FFFFFF') }, uAlpha: { value: 1 }, uCrawl: { value: 0 }, uLock: { value: 0 },
        uWidth: { value: 0.16 }, uLen: { value: 1 }, uSolid: { value: 0 }, uCap: { value: 100 }, uHole: { value: -1e4 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    this.material = withFxFog(_lineBase.clone());
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.telegraph.aim';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 8; this.mesh.visible = false;
    this.busy = false;
  }

  /** Billboard the strip around the segment a→b, facing the camera (`flat`: lying on the ground, iso). */
  set(a, b, camPos, width, flat = false) {
    _d.subVectors(b, a); const len = _d.length();
    if (len < 1e-4) return;
    _d.multiplyScalar(1 / len);
    _m.addVectors(a, b).multiplyScalar(0.5);
    if (flat) _s.set(_d.z, 0, -_d.x);
    else _s.subVectors(camPos, _m).cross(_d);
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

/** Iso readability constants (CONTROLS_SPEC §8.2.3–8.2.5, §8.2.7; CSS px and metres). */
export const TELE_ISO = Object.freeze({ glintPx: 28, goldPx: 34, exclPx: 34, exclLift: 0.5, flashMul: 1.6, aimMax: 12, aimLift: 0.05,
  aimWidth: 0.22, aimPx: 8, aimWMin: 0.06, aimWMax: 0.4, aimCap: 0.72, aimHoleLat: 1.2, rimMin: 0.12, jeerDisc: 0.12 });

/** Pure: how much of an actor's marks to keep given its camera distance `dA` vs the player's `dP` (unit-tested). */
export function occluderFactor(dA, dP) {
  if (!(dP > 0) || !(dA >= 0)) return 1;
  const t = Math.min(1, Math.max(0, (dA - (dP - 2.5)) / 2));   // full by 0.5 m nearer than her, 0 by 2.5 m nearer
  return t * t * (3 - 2 * t);
}

const _d = new THREE.Vector3(), _m = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const _col = new THREE.Color(), _white = new THREE.Color('#FFFFFF');
const _w0 = new THREE.Vector3(), _w1 = new THREE.Vector3();
const RED_GLOW = new THREE.Color(TELEGRAPH.colors.red);

/** One live telegraph. */
class Live {
  constructor() {
    this.n = null; this.id = null; this.t = 0; this.real = 0; this.out = -1; this.fadeIn = 0;
    this.origin = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 0, 1);
    this.aimTo = new THREE.Vector3(); this.color = new THREE.Color();
    this.livePos = null; this.liveDir = null; this.trackTarget = false;
    this.follow = false; this.decal = null; this.line = null; this.actor = null; this.target = null; this.frozen = false;
    this.bounds = null;
  }
}

/**
 * Where a telegraph's origin comes from each frame (pure; unit-tested):
 *  - 'live'   `pos` is a Vector3 the emitter keeps writing (Enemy.tellPos / the crow's diveTarget): read it every frame;
 *             the emitter decides when it stops tracking (the §8.1 aim / shadow rules live in the enemy);
 *  - 'actor'  no `pos` but an actor: centred on the actor's feet and following it (slams, barks, spins);
 *  - 'fixed'  anything else (arrays, anchors, plain objects).
 */
export function originMode(desc) {
  if (desc?.pos?.isVector3) return 'live';
  if (desc?.pos == null && isActor(desc?.actor)) return 'actor';
  return 'fixed';
}

export class Telegraphs {
  /**
   * @param {any} ctx @param {import('./Marks.js').Marks} marks
   * @param {import('./Marks.js').Marks|null} [top] overlay batch for the iso constant-size glints / "!"
   */
  constructor(ctx, marks, top = null) {
    this.ctx = ctx;
    this.marks = marks;
    this.top = top;
    this._isoNow = false;
    /** @type {Map<any, Live>} */
    this.active = new Map();
    this._free = [];
    this.decals = []; this.lines = [];
    this.scene = null;
    this.started = 0;          // total telegraphs started (tests/smoke)
    this.byKind = Object.fromEntries(KINDS.map((k) => [k, 0]));
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
    const mode = originMode(desc);
    L.livePos = mode === 'live' ? desc.pos : null;
    L.liveDir = desc.dir?.isVector3 ? desc.dir : null;
    if (mode === 'live') L.origin.copy(desc.pos);
    else if (!toVec3(desc.pos, L.origin)) { if (L.actor) actorWorldPos(L.actor, L.origin); else L.origin.set(0, 0, 0); }
    if (desc.dir && toVec3(desc.dir, L.dir) && (L.dir.x * L.dir.x + L.dir.z * L.dir.z) > 1e-8) { L.dir.y = 0; L.dir.normalize(); }
    else if (L.actor) L.dir.set(Math.sin(L.actor.facing), 0, Math.cos(L.actor.facing));
    else L.dir.set(0, 0, 1);
    // follow the actor when the shape is centred on it (slams, barks, spins); fixed when placed elsewhere (landing spots)
    L.follow = n.follow ?? (mode === 'actor' && n.shape !== 'shadow' && n.shape !== 'line');
    // a shadow with no position of its own hunts the target itself (§8.1: tracks the first 60%, then freezes)
    L.trackTarget = n.shape === 'shadow' && desc.pos == null;
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
    if (this.byKind[n.kind] !== undefined) this.byKind[n.kind]++;
    return id;
  }

  /** End a telegraph (fades out quickly). */
  end(id) {
    const L = this.active.get(id);
    if (L && L.out < 0) L.out = 0;
  }

  /** End every telegraph owned by `actor` (despawn, scripted, death). */
  endFor(actor) { for (const L of this.active.values()) if (L.actor === actor && L.out < 0) L.out = 0; }

  /** Remove everything immediately (level unload). */
  clear() { for (const L of [...this.active.values()]) this._release(L); }

  _release(L) {
    L.decal?.reset(); L.line?.reset();
    L.decal = null; L.line = null; L.actor = null; L.target = null; L.n = null; L.livePos = null; L.liveDir = null;
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

  /** The iso play camera is on (follow / lock / boss; not presets, cutscenes, the Meme Cam or `?cam=classic`). */
  get iso() {
    const c = this.ctx.cam;
    return !!c?.isIso && this.ctx.params?.cam !== 'classic' && (c.modeName === 'follow' || c.modeName === 'lock' || c.modeName === 'boss');
  }

  /** Per frame: place visuals and push marks. `dt` = visual dt. */
  render(dt) {
    const ctx = this.ctx, cam = ctx.camera;
    this._isoNow = this.iso;
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
      if (L.livePos) L.origin.copy(L.livePos);
      else if (L.follow && L.actor) actorWorldPos(L.actor, L.origin);
      else if (L.trackTarget && tracking && L.target) actorWorldPos(L.target, L.origin);
      if (L.liveDir && (L.liveDir.x * L.liveDir.x + L.liveDir.z * L.liveDir.z) > 1e-8) L.dir.set(L.liveDir.x, 0, L.liveDir.z).normalize();
      else if (L.follow && L.actor && n.shape === 'cone') { const f = L.actor.object3d.rotation.y; L.dir.set(Math.sin(f), 0, Math.cos(f)); }
      // ---- ground decal
      if (L.decal) {
        const d = L.decal;
        d.place(L.origin.x, L.origin.y, L.origin.z, L.dir.x, L.dir.z, L.bounds, this._ground);
        const u = d.material.uniforms;
        u.uFill.value = prog; u.uAlpha.value = alpha; u.uTime.value = L.real; u.uPattern.value = pattern;
        u.uDisc.value = this._isoNow && n.kind === 'jeer' ? TELE_ISO.jeerDisc : 0;
        d.mesh.visible = true;
      }
      // ---- aim line
      if (L.line) this._aim(L, cam, alpha, tracking);
      // ---- marks (glints, "!", "!!", swirls, rings)
      this._marks(L, alpha, pattern);
    }
  }

  _aim(L, cam, alpha, tracking) {
    const n = L.n, l = L.line, T = L.target;
    // start: the live muzzle point, else the shooter's weapon, else the origin
    if (L.livePos) _a.copy(L.livePos);
    else if (L.actor) weaponPoint(L.actor, _a);
    else _a.copy(L.origin).setY(L.origin.y + 0.6);
    if (L.liveDir) {
      // the shooter steers the aim and freezes it (rat_xbow aimLock); fx draws along it, ending just past the target
      _d.copy(L.liveDir);
      if (_d.lengthSq() < 1e-8) _d.copy(L.dir);
      _d.normalize();
      let len = n.l;
      if (T) {
        actorWorldPos(T, _q); _q.y += (T.height ?? 1) * 0.55;
        const along = _q.sub(_a).dot(_d);
        if (along > 0.5) len = Math.min(n.l, along - 0.1);           // ends at her chest (never between her and the camera)
      }
      _b.copy(_a).addScaledVector(_d, len);
      L.frozen = !tracking;
    } else {
      if (!L.frozen) {
        if (T) { actorWorldPos(T, L.aimTo); L.aimTo.y += (T.height ?? 1) * 0.55; }
        else L.aimTo.copy(_a).addScaledVector(L.dir, n.l);
        if (!tracking) L.frozen = true;
      }
      _b.subVectors(L.aimTo, _a);
      const d = _b.length();
      if (d > 1e-4) _b.multiplyScalar(Math.min(n.l, Math.max(0.3, d - 0.1)) / d);
      _b.add(_a);
    }
    const iso = this._isoNow;
    if (iso) {
      // §8.2.4 on the ground: from the shooter's feet along the aim, the full projected path (≤ 12 m)
      _d.subVectors(_b, _a); _d.y = 0;
      if (_d.lengthSq() < 1e-8) _d.copy(L.dir);
      _d.normalize();
      const len = Math.min(TELE_ISO.aimMax, Math.max(n.l, 0.5));
      if (L.actor) actorWorldPos(L.actor, _a);
      const gA = this._ground(_a.x, _a.z, _a.y);
      _a.y = gA + TELE_ISO.aimLift;
      _b.copy(_a).addScaledVector(_d, len);
      _b.y = Math.max(this._ground(_b.x, _b.z, gA), gA - 1) + TELE_ISO.aimLift;
    }
    const u = l.material.uniforms;
    let width = 0.16, hole = -1e4;
    if (iso) {
      width = this._aimWidth(_a, _b, cam);
      // her spot along the strip (when it runs within reach of her): the shader fades the beam there
      const pp = this.ctx.player?.object3d?.position ?? this.ctx.player?.pos;
      if (pp) {
        const dx = _b.x - _a.x, dz = _b.z - _a.z, L2 = Math.hypot(dx, dz) || 1;
        const rx = pp.x - _a.x, rz = pp.z - _a.z, along = (rx * dx + rz * dz) / L2;
        if (Math.abs(rx * dz - rz * dx) / L2 < TELE_ISO.aimHoleLat && along > -1 && along < L2 + 1) hole = along;
      }
    }
    l.set(_a, _b, cam.position, width, iso);
    l.material.depthTest = !iso;
    u.uCap.value = iso ? TELE_ISO.aimCap : 100;
    u.uHole.value = hole;
    u.uSolid.value = iso && L.frozen ? 1 : 0;
    u.uAlpha.value = alpha;
    u.uLock.value = L.frozen ? 0.6 + 0.4 * Math.sin(L.real * 40) : 0;
    if (!L.frozen) u.uCrawl.value = L.real * 1.4;
    l.mesh.visible = true;
  }

  /**
   * Iso aim strip width (m) for a constant ~`TELE_ISO.aimPx` CSS px across it on screen, whatever its screen
   * direction (a flat strip running up the screen is not foreshortened; one running across it is).
   */
  _aimWidth(a, b, cam) {
    const H = this.ctx.renderer?.domElement?.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 720);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    if (!cam || !(l > 1e-4) || !(H > 0)) return TELE_ISO.aimWidth;
    cam.updateMatrixWorld?.();
    _w0.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    _w1.set(_w0.x + dz / l, _w0.y, _w0.z - dx / l);
    _w0.project(cam); _w1.project(cam);
    if (!(_w0.z < 1 && _w1.z < 1)) return TELE_ISO.aimWidth;
    const pxPerM = Math.hypot((_w1.x - _w0.x) * (cam.aspect || 1), _w1.y - _w0.y) * H / 2;
    if (!(pxPerM > 1e-3)) return TELE_ISO.aimWidth;
    return Math.min(TELE_ISO.aimWMax, Math.max(TELE_ISO.aimWMin, TELE_ISO.aimPx / pxPerM));
  }

  /** Weapon / glint point for marks: the live tell point, else the actor's weapon, else the origin + 0.9 m. */
  _glintPoint(L, out) {
    if (L.livePos && L.n.shape === 'glint') return out.copy(L.livePos);
    if (L.actor) return weaponPoint(L.actor, out);
    return out.copy(L.origin).setY(L.origin.y + 0.9);
  }

  _headPoint(L, out, lift) {
    if (L.actor) return headPoint(L.actor, out, lift);
    return out.copy(L.origin).setY(L.origin.y + 1.2 + lift);
  }

  _marks(L, alpha, pattern) {
    if (this._isoNow) { this._marksIso(L, alpha, pattern); return; }
    const n = L.n, A = L.actor, M = this.marks, t = L.real;
    const pop = Math.min(1, t / 0.12), popS = pop < 1 ? 1 + 2.70158 * (pop - 1) ** 3 + 1.70158 * (pop - 1) ** 2 : 1;
    // the strike flash: a brighter, bigger glint 0.25 s before the active frame (the audio "ting" lands on it)
    const flashAt = n.duration - 0.25;
    const flash = L.t > flashAt && L.t < flashAt + 0.14 ? Math.sin(((L.t - flashAt) / 0.14) * Math.PI) : 0;
    const glint = n.shape === 'glint';
    // an attacker between the lens and Swordcat (flankers orbit wide): soften its marks so the glint's bloom
    // doesn't blot out the heroine and her swing (marks are also screen-capped in Marks' vertex shader)
    const occ = this._occluderFactor(A);
    alpha *= 0.45 + 0.55 * occ;
    const ki = 0.4 + 0.6 * occ;
    switch (n.kind) {
      case 'parry': {
        if (!glint && !A) break;
        this._glintPoint(L, _p);
        const tw = 0.85 + 0.15 * Math.sin(t * 18);
        M.push(_p.x, _p.y, _p.z, (0.62 + 0.5 * flash) * popS * tw, MARK.STAR4, _white, (3.2 + 3 * flash) * ki, alpha, t * 0.8, pattern);
        M.push(_p.x, _p.y, _p.z, 0.28 * popS, MARK.SOFT, _white, 2.0 * ki, alpha * 0.7);
        this._headPoint(L, _q, 0.32 + 0.04 * Math.sin(t * 9));
        M.push(_q.x, _q.y, _q.z, 0.34 * popS, MARK.EXCL, _white, 1.15, alpha, 0, pattern, 1.25);
        break;
      }
      case 'gold': {
        if (!glint && !A) break;
        this._glintPoint(L, _p);
        _col.copy(L.color);
        M.push(_p.x, _p.y, _p.z, (0.9 + 0.5 * flash) * popS, MARK.STAR8, _col, (2.8 + 2.5 * flash) * ki, alpha, t * 1.1, pattern);
        M.push(_p.x, _p.y, _p.z, 0.45 * popS, MARK.STAR4, _white, 2.4 * ki, alpha * 0.9, -t * 0.6, 0);
        break;
      }
      case 'red': {
        const pulse = 0.75 + 0.25 * Math.sin(t * 22);
        if (glint || A) {
          this._glintPoint(L, _p);
          M.push(_p.x, _p.y, _p.z, 0.95 * pulse * popS, MARK.SOFT, RED_GLOW, 2.6 * ki, alpha, 0, pattern);
        }
        if (A) {
          // body glow: a halo pushed behind the actor so its silhouette rims red
          this._behind(A, 0.4, _q);
          const h = (A.height ?? 1) * (A.object3d?.scale?.y ?? 1);
          M.push(_q.x, _q.y, _q.z, h * 1.25, MARK.HALO, RED_GLOW, 1.8, alpha * (0.45 + 0.15 * pulse), 0, 0, 1.35);
        }
        this._headPoint(L, _q, 0.34 + 0.05 * Math.abs(Math.sin(t * 12)));
        M.push(_q.x, _q.y, _q.z, 0.5 * popS, MARK.EXCL2, RED_GLOW, 1.3, alpha, 0, pattern, 0.95);
        break;
      }
      case 'grab': {
        this._glintPoint(L, _p);
        _col.copy(L.color);
        M.push(_p.x, _p.y, _p.z, 0.85 * popS, MARK.SWIRL, _col, 1.9, alpha, t * 2.4);
        M.push(_p.x, _p.y, _p.z, 0.4 * popS, MARK.SOFT, _col, 1.5, alpha * 0.6);
        break;
      }
      case 'jeer': {
        this._headPoint(L, _q, -0.25);
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

  /**
   * §8.2.3 iso marks: constant screen size on the overlay batch (no occluder softening: from above nothing stands
   * between the lens and her). Sizes are negative = CSS px (Marks.push).
   */
  _marksIso(L, alpha, pattern) {
    const n = L.n, A = L.actor, T = this.top ?? this.marks, M = this.marks, t = L.real, I = TELE_ISO;
    const pop = Math.min(1, t / 0.12), popS = pop < 1 ? 1 + 2.70158 * (pop - 1) ** 3 + 1.70158 * (pop - 1) ** 2 : 1;
    const flashAt = n.duration - 0.25;
    const flash = L.t > flashAt && L.t < flashAt + 0.14 ? Math.sin(((L.t - flashAt) / 0.14) * Math.PI) : 0;
    const fl = 1 + (I.flashMul - 1) * flash;
    const glint = n.shape === 'glint';
    switch (n.kind) {
      case 'parry': {
        if (!glint && !A) break;
        this._glintPoint(L, _p);
        const tw = 0.85 + 0.15 * Math.sin(t * 18);
        T.push(_p.x, _p.y, _p.z, -I.glintPx * popS * tw * fl, MARK.STAR4, _white, 3.2 + 3 * flash, alpha, t * 0.8, pattern);
        T.push(_p.x, _p.y, _p.z, -I.glintPx * 0.5 * popS, MARK.SOFT, _white, 2.0, alpha * 0.7);
        this._headPoint(L, _q, I.exclLift + 0.04 * Math.sin(t * 9));
        T.push(_q.x, _q.y, _q.z, -I.exclPx * popS, MARK.EXCL, _white, 1.15, alpha, 0, pattern, 1.25);
        break;
      }
      case 'gold': {
        if (!glint && !A) break;
        this._glintPoint(L, _p);
        _col.copy(L.color);
        T.push(_p.x, _p.y, _p.z, -I.goldPx * popS * fl, MARK.STAR8, _col, 2.8 + 2.5 * flash, alpha, t * 1.1, pattern);
        T.push(_p.x, _p.y, _p.z, -I.goldPx * 0.5 * popS, MARK.STAR4, _white, 2.4, alpha * 0.9, -t * 0.6, 0);
        break;
      }
      case 'red': {
        const pulse = 0.75 + 0.25 * Math.sin(t * 22);
        if (glint || A) {
          this._glintPoint(L, _p);
          T.push(_p.x, _p.y, _p.z, -I.goldPx * pulse * popS * fl, MARK.SOFT, RED_GLOW, 2.6, alpha, 0, pattern);
        }
        if (A) {        // the body glow stays world-sized and depth-tested (a rim around the silhouette)
          this._behind(A, 0.4, _q);
          const h = (A.height ?? 1) * (A.object3d?.scale?.y ?? 1);
          M.push(_q.x, _q.y, _q.z, h * 1.25, MARK.HALO, RED_GLOW, 1.8, alpha * (0.45 + 0.15 * pulse), 0, 0, 1.35);
        }
        this._headPoint(L, _q, I.exclLift + 0.05 * Math.abs(Math.sin(t * 12)));
        T.push(_q.x, _q.y, _q.z, -I.exclPx * popS, MARK.EXCL2, RED_GLOW, 1.3, alpha, 0, pattern, 0.95);
        break;
      }
      case 'grab': {
        this._glintPoint(L, _p);
        _col.copy(L.color);
        T.push(_p.x, _p.y, _p.z, -I.goldPx * popS, MARK.SWIRL, _col, 1.9, alpha, t * 2.4);
        T.push(_p.x, _p.y, _p.z, -I.glintPx * 0.5 * popS, MARK.SOFT, _col, 1.5, alpha * 0.6);
        break;
      }
      case 'jeer': {
        this._headPoint(L, _q, -0.25);
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

  /**
   * 1 = mark shown in full; → 0 as the actor sits nearer the camera than the player (it is between the lens and her).
   * @param {object|null} A
   */
  _occluderFactor(A) {
    const pl = this.ctx.player, cam = this.ctx.camera;
    if (!A?.object3d || !pl?.object3d || A === pl || !cam) return 1;
    const dA = actorWorldPos(A, _m).distanceTo(cam.position);
    const dP = actorWorldPos(pl, _s).distanceTo(cam.position);
    return occluderFactor(dA, dP);
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
