// src/fx/GroundDecals.js  (owner: fx) — research/CONTROLS_SPEC.md §3, §5.4, §7.3, §7.4, §8.2, §10.3 ground indicators
// for the iso controls, all in ONE instanced draw:
//   her       the hero / aim ring (pink, a notch along the aim), the Stand fan (silver, 3 Grit notches, gold through
//             the parry window, grey through the whiff lockout, dim at 0 Grit), the charge reach (slash3 → Bright →
//             Holy circle + the 10 × 2.4 m holyWave lane with Shard 2; grey when the Holy would fizzle), the gold
//             parry spark ring, the landing ring + Pounce dive circle while airborne, the Riposte arrow (0.8 s), the
//             Golden Hour gleam lanes, the slash smear (0.15 s, 0.25 alpha);
//   threats   strike wedges under every melee wind-up (rim + outward fill, freeze 0.15 s before the strike, the rim
//             flashes and thickens at parry-window open; gold = gold rim + an 8-point star at the tip, red = filled with
//             a jagged rim, purple = grab), the shrinking parry ring (+ a tick toward the attacker; red attacks get a
//             pulsing dodge chevron instead), bolt ground-shadow dots (gold once reflected), aggro rings;
//   targets   the selection ring (gold, rotating 0.5 rev/s; red during its wind-up), hover rings (red enemy / gold
//             interactable / white NPC + `characters.setHighlight` on the actor), contact blobs under enemies;
//   orders    the move paw ripple, attack (red-orange) / use (gold) rings, the grey ✕ paw when unreachable, queued
//             waypoints (dots + dotted lines), 3 dots along the next path segment while RMB is held, faint paws every
//             1.2 m along the whole path with `settings.pathPreview`, the goal ring;
//   overlays  the companion ability indicator (`ctx.companions.aim`; then `fx.drawsAbilityAim` is true and companions
//             hide their fallback), the ranges overlay while Ctrl (`ranges`) is held: AA reach 1.9 m, the Stand fan,
//             the kitten's ability range.
//
// Each decal is a flat quad hugging the ground (tilted to the terrain normal, lifted a few cm, polygon offset) with a
// per-instance colour and shape parameters; the fragment shader draws rings, discs, fans, paws, stars, chevrons, arrows
// and lanes. Her own indicators are pulled 0.45 m toward the lens in view space (`aExtra.w`): they read over grass,
// wheat and ground bumps (the spec's "depthTest: false" intent) but still tuck behind her body and real occluders.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { PLAYER, ATTACKS, TELEGRAPH, AIM, CAMERA } from '../core/config.js';
import { setHighlight } from '../characters/Readability.js';

const MAX = 160;
/** decal shapes (aParams.x) */
export const DECAL = Object.freeze({ RING: 0, DISC: 1, FAN: 2, CROSS: 3, DASH: 4, RECT: 5, PAW: 6, STAR: 7, CHEVRON: 8, ARROW: 9, LANE: 10, FAN_RED: 11, TICKS: 12 });
export const DECAL_COLORS = Object.freeze({
  hero: '#F7A8C4', silver: '#E8EEF4', gold: '#FFD34D', red: '#FF6A3D', white: '#E6ECF4', grey: '#9AA0A6', green: '#9BE38B',
  // orders / path: cream (pink is hers alone: the hero ring)
  move: '#FFF1D0', aggro: '#FF3B30', blob: '#1A1410', purple: '#9B5CFF',
});
/** Tunables (CONTROLS_SPEC §7.3, §8.2, §10.3; metres / seconds). */
export const DECAL_CFG = Object.freeze({
  heroR: 0.75, heroAlpha: 0.5, heroOutline: { w: 0.035, alpha: 0.45 }, heroNotch: 0.25, heroNotchLen: 0.3, pull: 0.45, fanR: 1.05,
  parryRing: { r0: 2.2, lead: 0.6, range: 6 }, freezeLead: 0.15, wedgeMax: 8, rimMin: 0.12,
  marker: { grow: 0.12, move: 0.6, other: 0.7, paw: 0.3, ticks: { r0: 1.0, r1: 0.55, collapse: 0.3, inner: 0.6, hw: 0.11 }, goal: 0.4 }, queueDot: 0.07, dashEvery: 0.6,
  rmbDots: 3, previewEvery: 1.2, previewMax: 24, riposte: 0.8, gleam: { l: 8, w: 1.2, dur: 0.2 },
  smear: { dur: 0.15, alpha: 0.25 }, fadeIn: 0.3, dive: 0.9, blob: { mul: 1.1, alpha: 0.35, range: 20, max: 16 },
  bolt: { r: 0.15, max: 12 }, aaReach: 1.9,
  reachEdge: { margin: 0.6, arc: 3.6, dots: 9, dot: 0.11 },
});
const LIFT = 0.05;

const VERT = /* glsl */`
attribute vec4 aColor;
attribute vec4 aParams;
attribute vec4 aExtra;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;
varying vec4 vExtra;
void main() {
  vUv = uv * 2.0 - 1.0;
  vColor = aColor; vParams = aParams; vExtra = aExtra;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  // her indicators: pulled toward the lens (along the view ray: same pixel, nearer depth) so grass / ground bumps
  // never cut them, while her body and real occluders still do
  if ( aExtra.w > 0.0 ) mv.xyz -= normalize( mv.xyz ) * aExtra.w;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;   // x shape, y inner radius (0..1), z aa width, w notch / half-angle (rad)
varying vec4 vExtra;    // x dashes / notches / rect half-w, y rotation / rect half-l, z fill alpha, w depth pull
uniform float uTime;
const float PI = 3.14159265;
float band( float r, float a, float b, float w ) { return smoothstep( a - w, a + w, r ) * ( 1.0 - smoothstep( b - w, b + w, r ) ); }
float sdEll( vec2 p, vec2 c, vec2 r ) { return ( length( ( p - c ) / r ) - 1.0 ) * min( r.x, r.y ); }
float fxStar( vec2 p, float r, float n, float m ) {
  float an = PI / n, en = PI / m;
  vec2 acs = vec2( cos( an ), sin( an ) ), ecs = vec2( cos( en ), sin( en ) );
  float bn = mod( atan( p.x, p.y ), 2.0 * an ) - an;
  p = length( p ) * vec2( cos( bn ), abs( sin( bn ) ) );
  p -= r * acs;
  p += ecs * clamp( - dot( p, ecs ), 0.0, r * acs.y / ecs.y );
  return length( p ) * sign( p.x );
}
void main() {
  float r = length( vUv );
  float ang = atan( vUv.x, -vUv.y );           // 0 = local forward (+Z of the quad), counter-clockwise positive
  float shape = vParams.x, inner = vParams.y, aa = max( 0.004, vParams.z );
  float a = 0.0;
  vec3 col = vColor.rgb;
  if ( shape < 0.5 ) {                         // ring (+ optional notch: a solid arrow tick pointing along the aim)
    if ( r > 1.42 ) discard;
    // x > 0: the ring's outer radius in uv (a larger quad leaves room for the notch tip); y > 0: the tip length (uv)
    float outer = vExtra.x > 0.0 ? vExtra.x : 1.0;
    a = band( r, inner, outer, aa );
    if ( vParams.w > 0.0 ) {
      float tipLen = vExtra.y > 0.0 ? vExtra.y : ( outer - inner ) * 2.6;
      float f = -vUv.y, s = abs( vUv.x ), f1 = outer + tipLen;
      // a solid triangle: its base spans the notch angle at the outer radius, its tip tipLen beyond the ring
      float hw = outer * sin( vParams.w * 0.5 ) * ( f1 - f ) / tipLen;
      float tri = ( 1.0 - smoothstep( -aa, aa, s - hw ) ) * smoothstep( inner - aa, inner + aa, f ) * ( 1.0 - smoothstep( f1 - aa, f1, f ) );
      a = max( a, tri * 1.25 );               // a touch brighter than the ring
      col = mix( col, vec3( 1.0 ), 0.2 * tri );
    }
    a = max( a, vExtra.z * ( 1.0 - smoothstep( inner - aa, inner, r ) ) );
  } else if ( shape > 11.5 ) {                 // ticks: 4 solid triangles pointing at the centre (the order marker)
    float an = mod( ang + PI * 0.25, PI * 0.5 ) - PI * 0.25;
    vec2 q = r * vec2( cos( an ), sin( an ) ); // x radial, y tangential (nearest axis)
    float hw = vParams.w * clamp( ( q.x - inner ) / max( 0.01, 1.0 - inner ), 0.0, 1.0 );
    a = ( 1.0 - smoothstep( -aa, aa, abs( q.y ) - hw ) ) * smoothstep( inner - aa, inner + aa, q.x ) * ( 1.0 - smoothstep( 1.0 - aa * 2.0, 1.0, q.x ) );
    if ( vExtra.z > 0.0 ) a = max( a, 1.0 - smoothstep( vExtra.z - aa, vExtra.z + aa, r ) );   // centre dot
  } else if ( shape < 1.5 ) {                  // soft disc
    a = 1.0 - smoothstep( inner, 1.0, r );
  } else if ( shape < 2.5 || ( shape > 10.5 && shape < 11.5 ) ) {   // fan: a rim arc ±w plus a fill (FAN_RED: jagged rim)
    if ( r > 1.35 ) discard;
    float rr = r;
    if ( shape > 10.5 ) rr = r * ( 1.0 + 0.035 * sin( ang * 22.0 ) );
    float inside = 1.0 - smoothstep( vParams.w - 0.03, vParams.w + 0.03, abs( ang ) );
    float rim = band( rr, inner, 1.0, aa );
    // the straight sides of a wedge (not for full circles)
    if ( vParams.w < PI - 0.05 ) rim = max( rim, ( 1.0 - smoothstep( 0.0, ( 1.0 - inner ) * 0.9, abs( abs( ang ) - vParams.w ) * max( r, 0.2 ) ) ) * step( r, 1.0 ) * step( abs( ang ), vParams.w + 0.03 ) );
    a = inside * max( rim, vExtra.z * ( 1.0 - smoothstep( 1.0 - aa, 1.0, rr ) ) );
    if ( vExtra.x > 0.5 ) {                    // Grit notches
      float k = fract( ( ang + vParams.w ) / ( 2.0 * vParams.w ) * vExtra.x );
      a *= 0.55 + 0.45 * step( 0.08, k );
    }
  } else if ( shape < 3.5 ) {                  // cross
    vec2 q = abs( mat2( 0.7071, -0.7071, 0.7071, 0.7071 ) * vUv );
    float bar = min( q.x, q.y );
    a = ( 1.0 - smoothstep( 0.16, 0.16 + aa * 4.0, bar ) ) * ( 1.0 - smoothstep( 0.85, 0.95, max( q.x, q.y ) ) );
  } else if ( shape < 4.5 ) {                  // dashed rotating ring
    if ( r > 1.35 ) discard;
    float k = fract( ( ang + vExtra.y ) / ( 2.0 * PI ) * vExtra.x );
    a = band( r, inner, 1.0, aa ) * smoothstep( 0.0, 0.08, k ) * ( 1.0 - smoothstep( 0.55, 0.63, k ) );
  } else if ( shape < 5.5 ) {                  // rect outline (x: half width in uv, y half length): ability wall
    vec2 q = abs( vUv );
    float edge = max( q.x / vExtra.x, q.y / vExtra.y );
    a = band( edge, 0.86, 1.0, 0.02 ) + 0.25 * ( 1.0 - step( 1.0, edge ) );
  } else if ( shape < 6.5 ) {                  // paw print (forward = toes): main pad + 4 beans
    vec2 p = vec2( vUv.x, -vUv.y );
    float d = sdEll( p, vec2( 0.0, -0.28 ), vec2( 0.44, 0.36 ) );
    d = min( d, sdEll( p, vec2( -0.56, 0.18 ), vec2( 0.17, 0.21 ) ) );
    d = min( d, sdEll( p, vec2( -0.21, 0.52 ), vec2( 0.17, 0.22 ) ) );
    d = min( d, sdEll( p, vec2( 0.21, 0.52 ), vec2( 0.17, 0.22 ) ) );
    d = min( d, sdEll( p, vec2( 0.56, 0.18 ), vec2( 0.17, 0.21 ) ) );
    a = 1.0 - smoothstep( -aa, aa, d );
    if ( vExtra.z > 0.0 ) a = max( a * 0.55, band( r, 0.86, 1.0, aa ) * vExtra.z );   // ripple ring
  } else if ( shape < 7.5 ) {                  // 8-point star (gold wedge tip)
    float sd = fxStar( vUv, 0.95, 8.0, 3.2 );
    a = 1.0 - smoothstep( -aa, aa, sd );
    col = mix( vec3( 1.0 ), col, smoothstep( 0.0, 0.5, r ) );
  } else if ( shape < 8.5 ) {                  // chevron "!!" (two nested chevrons pointing forward, pulsing)
    vec2 p = vec2( abs( vUv.x ), -vUv.y );
    float c1 = abs( p.y - 0.15 + p.x * 0.9 ) - 0.12;
    float c2 = abs( p.y + 0.45 + p.x * 0.9 ) - 0.12;
    float d = min( c1, c2 );
    a = ( 1.0 - smoothstep( -aa, aa, d ) ) * ( 1.0 - smoothstep( 0.78, 0.86, p.x ) );
    a *= 0.7 + 0.3 * sin( uTime * 18.0 );
  } else if ( shape < 9.5 ) {                  // arrow along forward (non-uniform quad: shaft + head)
    vec2 p = vec2( vUv.x, -vUv.y );
    float head = step( 0.35, p.y ) * ( 1.0 - smoothstep( ( 1.0 - p.y ) * 1.4 - aa * 6.0, ( 1.0 - p.y ) * 1.4, abs( p.x ) ) );
    float shaft = step( p.y, 0.4 ) * step( -1.0, p.y ) * ( 1.0 - smoothstep( 0.28, 0.36, abs( p.x ) ) );
    a = max( head, shaft * ( 0.45 + 0.55 * smoothstep( -1.0, 0.3, p.y ) ) );
  } else {                                     // lane: filled rect + rim (holy wave preview, Golden Hour gleam)
    vec2 q = abs( vUv );
    float edge = max( q.x, q.y );
    a = max( vExtra.z, band( edge, 0.9, 1.0, 0.012 ) ) * ( 1.0 - step( 1.0, edge ) );
  }
  a *= vColor.a;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( col, a );
  #include <colorspace_fragment>
}`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _s = new THREE.Vector3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * §8.2.1 strike-wedge state at `now` for a ThreatBook entry (pure; unit-tested): `{ left, prog, frozen, open, flash }`.
 * `frozen` 0.15 s before `activeAt`; `open` from the parry window's start (activeAt − window) to just after the
 * strike; `flash` 1 → 0 over the first 0.12 s of the open window (the rim's "ting").
 */
export function wedgeState(activeAt, windup, now, window = PLAYER.guard.parryWindow, freezeLead = DECAL_CFG.freezeLead) {
  const left = activeAt - now;
  const prog = windup > 0 ? clamp01(1 - left / windup) : 1;
  const open = left <= window && left >= -0.05;
  const flash = open ? clamp01(1 - (window - left) / 0.12) : 0;
  return { left, prog, frozen: left <= freezeLead, open, flash };
}

/**
 * §8.2.2 parry ring radius at `left` seconds before the strike (pure; unit-tested): r0 at `lead` s before (or the
 * wind-up start if later), shrinking linearly to her radius `r1` exactly at the strike. null outside [−0.05, lead].
 */
export function parryRingRadius(left, r1 = 0.45, r0 = DECAL_CFG.parryRing.r0, lead = DECAL_CFG.parryRing.lead) {
  if (!(left <= lead) || left < -0.05) return null;
  const k = clamp01(left / lead);
  return r1 + (r0 - r1) * k;
}

/** Is the parry ring on for this setting / device / difficulty? (§8.2.2; pure) */
export function parryRingOn(setting, device, difficulty) {
  return setting === 'on' || ((setting ?? 'auto') === 'auto' && (device === 'touch' || difficulty === 'kitten'));
}

/**
 * Points every `step` m along a polyline (from `from`, through `pts[start..]`), at most `max` (pure; unit-tested).
 * With a `pool` array, the {x, z, yaw} objects are reused from it (no per-frame allocation).
 */
export function pointsAlong(from, pts, step, max, out = [], start = 0, pool = null) {
  let n = 0, px = from.x, pz = from.z, carry = step;
  for (let i = start; i < pts.length && n < max; i++) {
    const w = pts[i], dx = w.x - px, dz = w.z - pz, d = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    let s = carry;
    while (s <= d && n < max) {
      const t = s / d, q = pool ? (pool[n] ??= { x: 0, z: 0, yaw: 0 }) : { x: 0, z: 0, yaw: 0 };
      q.x = px + dx * t; q.z = pz + dz * t; q.yaw = yaw;
      out[n++] = q;
      s += step;
    }
    carry = s - d;
    px = w.x; pz = w.z;
  }
  out.length = n;
  return out;
}

export class GroundDecals {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = null;
    this.n = 0;
    /** transient markers: { kind, x, y, z, t, dur, actor, yaw, delay, half, r, l, w } */
    this.markers = [];
    this.enabled = ctx?.params?.cam !== 'classic';
    this._offs = [];
    this._parryFlashT = 0;
    /** §6.3 pad right-stick ground reticle: smoothed point and the 1.0 s linger after release */
    this._padRet = { x: 0, z: 0, t: 0, on: false };
    this._blockFlashT = 0;
    this._time = 0;
    this._frozen = new Map();
    this._hl = { actor: null, color: null };
    this._pts = [];
    /** per-frame counts (smoke / debug): what was drawn this frame */
    this.counts = {};
    /** the wedges drawn this frame: [{ kind, activeAt, frozen, open, range, half, yaw }] (smoke) */
    this.wedgeList = [];
    this.parryRingR = null;
    /** her decals' visibility (0 outside play → 1 over the last 0.3 s of the hand-back blend) */
    this._vis = 1;
    this._mul = 1;
    this._fadeSt = { hidden: false, back: 0, settled: 0, ox: NaN, oy: NaN, oz: NaN };
    this._ptPool = [];
  }

  init(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      name: 'fx.groundDecals', vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false, uniforms: { uTime: { value: 0 } },
    });
    mat.userData.noHeightFog = true;
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.extra = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.colors);
    geo.setAttribute('aParams', this.params);
    geo.setAttribute('aExtra', this.extra);
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'fx:groundDecals';
    this.mesh.count = 0;
    scene.add(this.mesh);
    const bus = this.ctx.bus;
    if (!bus) return;
    this._offs.push(
      bus.on(E.PLAYER_ORDER, (p) => this._onOrder(p)),
      bus.on(E.PLAYER_PARRY, () => { this._parryFlashT = 0.35; }),
      bus.on(E.PLAYER_SWING, (p) => this._onSwing(p)),
      bus.on(E.LEVEL_UNLOAD, () => { this.markers.length = 0; this._frozen.clear(); this._unhighlight(); }),
    );
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._unhighlight();
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
  }

  /** Smoke / debug summary of the last frame. */
  stats() {
    return { n: this.n, counts: { ...this.counts }, wedges: this.wedgeList.map((w) => ({ ...w })), parryRing: this.parryRingR, fanHalf: this.fanHalf,
      markers: this.markers.map((m) => m.kind), highlight: this._hl.actor ? (this._hl.actor.id ?? true) : null };
  }

  /** §8.2.8 her feedback on the ground: 'block' = a white spark ring (the parry's gold ring rides player:parry). */
  flash(kind) { if (kind === 'block') this._blockFlashT = 0.3; else if (kind === 'parry') this._parryFlashT = 0.35; }

  _count(k) { this.counts[k] = (this.counts[k] ?? 0) + 1; }

  _onOrder(p) {
    if (!p) return;
    const pt = p.point, t = p.target;
    let kind = p.kind;
    if (p.valid === false || p.partial) kind = 'bad';
    if (kind === 'stop' || (!pt && !t?.pos)) return;
    const at = pt ?? t.pos, pl = this.ctx.player?.pos;
    if (this.markers.length > 16) this.markers.shift();
    const yaw = pl ? Math.atan2(at.x - pl.x, at.z - pl.z) : 0;
    const M = DECAL_CFG.marker;
    this.markers.push({ kind, x: at.x, y: at.y ?? 0, z: at.z, t: 0, dur: kind === 'move' || kind === 'follow' ? M.move : M.other,
      actor: t?.object3d ? t : null, queued: !!p.queued, yaw, delay: 0 });
  }

  /** Golden Hour gleam lanes and the slash smear (§7.3) ride her swings. */
  _onSwing(p) {
    const pl = this.ctx.player;
    if (!pl || !p?.attackId || !this.enabled) return;
    const def = ATTACKS[p.attackId];
    const pos = pl.object3d?.position ?? pl.pos, yaw = pl.facing ?? 0;
    const slash = /^slash|^bright$|^riposte$/.test(p.attackId);
    if (slash && def?.arc) {
      const half = Math.min(Math.PI, Math.abs(def.arc.from - def.arc.to) / 2);
      this.markers.push({ kind: 'smear', x: pos.x, y: pos.y, z: pos.z, t: 0, dur: DECAL_CFG.smear.dur, yaw, half, r: def.arc.range, delay: def.active?.[0] ?? 0, follow: true });
    }
    if (slash && pl.golden) {
      const G = DECAL_CFG.gleam;
      this.markers.push({ kind: 'gleam', x: pos.x, y: pos.y, z: pos.z, t: 0, dur: G.dur, yaw, l: G.l, w: G.w, delay: def?.active?.[0] ?? 0 });
    }
  }

  /**
   * Add one decal: shape, centre (x, y, z), radius (m), yaw (rad, local forward), colour, alpha, params; `sx`, `sz`
   * stretch the quad (lanes, arrows), `pull` lifts it toward the lens (her indicators).
   */
  _add(shape, x, y, z, radius, yaw, color, alpha, inner, aa, w = 0, ex = 0, ey = 0, ez = 0, sx = 1, sz = 1, pull = 0) {
    alpha *= this._mul;
    if (this.n >= MAX || !(alpha > 0.003)) return;
    const i = this.n++;
    // tilt to the ground normal (terrain) so the quad hugs slopes
    const ph = this.ctx.physics;
    if (ph?.normalAt && radius * Math.max(sx, sz) < 4) ph.normalAt(x, z, _n); else _n.copy(_UP);
    if (!(_n.y >= 0.5)) _n.copy(_UP);
    _q.setFromUnitVectors(_UP, _n);
    _qy.setFromAxisAngle(_UP, yaw);
    _q.multiply(_qy);
    _p.set(x, y + LIFT, z);
    _s.set(radius * 2 * sx, 1, radius * 2 * sz);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    _c.set(color);
    this.colors.setXYZW(i, _c.r, _c.g, _c.b, Math.min(1, alpha));
    this.params.setXYZW(i, shape, inner, aa, w);
    this.extra.setXYZW(i, ex, ey, ez, pull);
  }

  /** Ground height under (x, z) near `y` (top surfaces, then the terrain). */
  _gy(x, z, y) {
    const ph = this.ctx.physics;
    const v = ph?.groundAt?.(x, z, y + 0.6) ?? ph?.topAt?.(x, z) ?? ph?.heightAt?.(x, z);
    return Number.isFinite(v) ? v : y;
  }

  /** Per rendered frame (visual dt). */
  render(dt) {
    if (!this.mesh) return;
    this.n = 0;
    for (const k in this.counts) this.counts[k] = 0;
    this.wedgeList.length = 0;
    this.parryRingR = null; this.reachEdgeAt = null;
    this.fanHalf = null;
    this._time += dt;
    this.mesh.material.uniforms.uTime.value = this._time;
    const ctx = this.ctx, p = ctx.player, cam = ctx.cam, mode = ctx.game?.mode;
    const play = this.enabled && !!cam?.isIso && mode === 'play' && cam.modeName !== 'preset' && cam.modeName !== 'meme' && cam.modeName !== 'cutscene';
    this._fade(play, cam, dt);
    const heroOn = play && p && p.alive !== false && !p.scripted && this._vis > 0;
    this._mul = this._vis;
    if (heroOn) this._hero(p, dt);
    if (play) {
      this._wedges();
      if (heroOn) { this._parryRing(p); this._riposte(p); this._ranges(p); }
      this._selection(cam);
      this._hover(cam);
      this._aggro(p);
      this._blobs(p);
      this._bolts();
      if (heroOn) { this._path(p); this._queue(p); }
      this._ability();
    } else this._unhighlight();
    this._mul = 1;
    this._markers(dt, play);
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true; this.params.needsUpdate = true; this.extra.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  /**
   * Her gameplay decals (hero / aim ring, selection) hide outside play — letterboxed dialogue, cutscenes, Meme Cam —
   * and fade back in over the last 0.3 s of the camera's hand-back blend (`cam.blendLeft` when camera exposes it;
   * otherwise the default iso hand-back time since play resumed).
   */
  _fade(play, cam, dt) {
    const F = DECAL_CFG.fadeIn, V = this._fadeSt;
    if (!play) { this._vis = 0; V.hidden = true; V.back = 0; V.settled = 0; V.ox = NaN; return; }
    if (!V.hidden) { this._vis = 1; return; }
    V.back += dt;
    let left = cam?.blendLeft, settled = false;
    if (!Number.isFinite(left)) {
      // no public blend clock: the default hand-back time, cut short once the lens holds still relative to her
      left = Math.max(0, (CAMERA.iso?.cut?.handback ?? 1) - V.back);
      const c = this.ctx.camera?.position, pp = this.ctx.player?.pos;
      if (c && pp) {
        const ox = c.x - pp.x, oy = c.y - pp.y, oz = c.z - pp.z;
        V.settled = Math.hypot(ox - V.ox, oy - V.oy, oz - V.oz) < 0.004 ? V.settled + 1 : 0;   // NaN start: not still
        V.ox = ox; V.oy = oy; V.oz = oz;
        settled = V.settled >= 3;
      }
    }
    this._vis = settled ? Math.min(1, this._vis + (dt > 0 ? dt / F : 0)) : Math.max(this._vis, clamp01(1 - left / F));
    if (this._vis >= 1) V.hidden = false;
  }

  /**
   * CONTROLS_SPEC §6.3 pad aim: the right stick (past the 0.25 dead zone) puts a ground reticle up to 6 m from her
   * (distance ∝ deflection, eased λ 12); it lingers 1.0 s after release.
   */
  _padReticle(pos, gy, dt) {
    const input = this.ctx.input, R = this._padRet;
    if (input?.device !== 'pad' || this.ctx.cam?.isIso === false) { R.t = 0; R.on = false; return; }
    const as = input.aimStick, m = Math.min(1, Math.hypot(as?.x ?? 0, as?.y ?? 0));
    if (m > 0.02) {                                   // Input already applied the 0.25 dead zone
      const yaw = this.ctx.cam?.stickYaw ?? this.ctx.cam?.yaw ?? Math.PI;
      const dx = -Math.sin(yaw) * as.y + Math.cos(yaw) * as.x, dz = -Math.cos(yaw) * as.y - Math.sin(yaw) * as.x, l = Math.hypot(dx, dz) || 1;
      const d = Math.max(0.8, m * (AIM.padAimMax ?? 6));
      const tx = pos.x + (dx / l) * d, tz = pos.z + (dz / l) * d;
      if (!R.on) { R.x = tx; R.z = tz; }
      const k = dt > 0 ? 1 - Math.exp(-12 * dt) : 1;
      R.x += (tx - R.x) * k; R.z += (tz - R.z) * k;
      R.t = 1.0; R.on = true;
    } else if (R.t > 0) R.t -= dt;
    if (R.t <= 0) { R.on = false; return; }
    const a = Math.min(1, R.t / 0.3), y = this._gy(R.x, R.z, gy);
    this._add(DECAL.RING, R.x, y, R.z, 0.42, 0, DECAL_COLORS.white, 0.8 * a, 0.78, 0.012, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
    this._add(DECAL.CROSS, R.x, y, R.z, 0.22, Math.PI / 4, DECAL_COLORS.white, 0.7 * a, 0, 0.012);
    this._count('reticle');
  }

  /** The hero / aim ring, the Stand fan, the charge reach, the landing ring and the Pounce dive circle. */
  _hero(p, dt) {
    const C = DECAL_CFG, pull = C.pull;
    const pos = p.object3d?.position ?? p.pos;
    const gy = p.onGround ? pos.y : this._gy(pos.x, pos.z, pos.y);
    // the notch follows the live aim (player.aim is refreshed every step) for a deliberate source, else her facing
    const aimSrc = aim => aim && aim.dir && (aim.source === 'cursor' || aim.source === 'explicit' || ((aim.source === 'auto' || aim.source === 'selected') && aim.active));
    const aim = p.aim, yaw = aimSrc(aim) && (p.state !== 'move' || aim.active) ? Math.atan2(aim.dir.x, aim.dir.z) : p.facing;
    const ringYaw = this._cursorYaw(p) ?? yaw;
    // aim ring: pink, a solid arrow tick (0.3 m, 0.25 rad) along the aim; the quad is grown so the tip fits inside it
    const Rq = C.heroR + C.heroNotchLen + 0.04, O = C.heroR / Rq;
    // a thin dark outline under it (same hue on top): reads on pale paving / sand as well as on grass
    const ol = C.heroOutline, r0 = C.heroR * 0.9 - ol.w, r1 = C.heroR + ol.w;
    this._add(DECAL.RING, pos.x, gy, pos.z, r1, 0, DECAL_COLORS.blob, ol.alpha, r0 / r1, 0.012, 0, 0, 0, 0, 1, 1, pull);
    this._add(DECAL.RING, pos.x, gy, pos.z, Rq, ringYaw, DECAL_COLORS.hero, C.heroAlpha, O * 0.9, 0.012 * O, C.heroNotch, O, C.heroNotchLen / Rq, 0, 1, 1, pull);
    this._count('hero');
    this._padReticle(pos, gy, dt);
    // Stand fan (±70°, touch ±90°): silver, flashes gold through the parry window, grey through the whiff lockout
    if (p.state === 'guard') {
      const touch = this.ctx.input?.device === 'touch';
      const gs = p.guardState ?? {};
      // §8.1 the guard arc: ±90° on touch, ±70° on KBM / pad (Guard's own `arc` is only refreshed on an incoming hit)
      const half = touch ? (PLAYER.guard.touchArc ?? Math.PI / 2) : PLAYER.guard.arc;
      this.fanHalf = half;
      const win = gs.parryWindow ?? (PLAYER.guard.parryWindow + (touch ? PLAYER.guard.touchParryBonus ?? 0 : 0));
      const since = Math.max(gs.guardT ?? 0, gs.parryT ?? 0);
      const lockout = (gs.lockoutT ?? 0) > 0;
      const parryWin = !lockout && since <= win;
      const broke = (p.grit ?? 1) <= 0;
      const col = lockout ? DECAL_COLORS.grey : this._parryFlashT > 0 || parryWin ? DECAL_COLORS.gold : broke ? DECAL_COLORS.grey : DECAL_COLORS.silver;
      const a = parryWin ? 0.9 : broke ? 0.35 : 0.6;
      this._add(broke ? DECAL.FAN_RED : DECAL.FAN, pos.x, gy, pos.z, C.fanR, p.facing, col, a, 0.78, 0.015, half, p.gritMax ?? 3, 0, 0.12, 1, 1, pull);
      this._count('fan');
    }
    if (this._parryFlashT > 0) {
      this._parryFlashT -= dt;
      const k = Math.max(0, this._parryFlashT / 0.35);
      this._add(DECAL.RING, pos.x, gy, pos.z, C.heroR + (1 - k) * 1.2, 0, DECAL_COLORS.gold, 0.85 * k, 0.88, 0.02, 0, 0, 0, 0, 1, 1, pull);
      this._count('parrySpark');
    }
    if (this._blockFlashT > 0) {
      this._blockFlashT -= dt;
      const k = Math.max(0, this._blockFlashT / 0.3);
      this._add(DECAL.RING, pos.x, gy, pos.z, C.heroR + (1 - k) * 0.7, p.facing, DECAL_COLORS.white, 0.7 * k, 0.9, 0.02, 0, 0, 0, 0, 1, 1, pull);
      this._count('blockSpark');
    }
    // charge reach: slash3 2.3 m ±97° → Bright 2.6 m (silver) → Holy 3.6 m circle (gold) + the holyWave lane (Shard 2)
    if (p.state === 'charge' && (p.chargeT ?? 0) > PLAYER.charge.start) {
      const tier = p.chargeTier ?? 0;
      const def = tier >= 2 ? ATTACKS.holy : tier >= 1 ? ATTACKS.bright : ATTACKS.slash3;
      const half = tier >= 2 ? Math.PI : Math.abs(def.arc.from - def.arc.to) / 2;
      const shards = p.shards ?? 0;
      const holyOk = shards >= (ATTACKS.holy.minShards ?? 1) && (p.valor ?? 0) >= (PLAYER.charge.holyMinValor ?? 0) && !p.chargeFizzled;
      const col = tier >= 2 ? (holyOk ? DECAL_COLORS.gold : DECAL_COLORS.grey) : DECAL_COLORS.silver;
      if (tier >= 2) {
        this._add(DECAL.RING, pos.x, gy, pos.z, def.arc.range, 0, col, 0.55, 0.95, 0.006, 0, 0, 0, 0.1, 1, 1, pull);
        if (holyOk && shards >= (ATTACKS.holy.projectileMinShards ?? 2)) {
          const W = ATTACKS.holyWave, f = p.facing;
          this._add(DECAL.LANE, pos.x + Math.sin(f) * W.range / 2, gy, pos.z + Math.cos(f) * W.range / 2, 1, f, col, 0.5, 0, 0.01, 0, 0, 0, 0.14, W.width / 2, W.range / 2, pull);
          this._count('holyLane');
        }
      } else this._add(DECAL.FAN, pos.x, gy, pos.z, def.arc.range, p.facing, col, 0.5, 0.94, 0.006, half, 0, 0, 0.1, 1, 1, pull);
      this._count('charge');
    }
    // airborne: the landing ring under her (above 0.4 m); with Pounce ready, the dive circle at the predicted point
    const h = pos.y - gy;
    if (!p.onGround && h > 0.4) {
      const k = Math.min(1, h / 2);
      this._add(DECAL.RING, pos.x, gy, pos.z, 0.45 + 0.25 * (1 - k), 0, DECAL_COLORS.white, 0.5, 0.8, 0.02, 0, 0, 0, 0, 1, 1, pull);
      this._add(DECAL.DISC, pos.x, gy, pos.z, 0.5, 0, '#000000', 0.25 + 0.2 * (1 - k), 0.2, 0.02);
      this._count('landing');
      if (p.pounceReady && p.state !== 'pounce') {
        // the player's own dive point when it has one (player.diveAt: the cursor ≤ 3.5 m / the magnetised crow), else a guess
        let x, z;
        const da = p.diveAt;
        if (da?.valid && Number.isFinite(da.x)) { x = da.x; z = da.z; }
        else {
          const d = p.aim?.dir, f = p.facing ?? 0, dx = d && aim.source === 'cursor' ? d.x : Math.sin(f), dz = d && aim.source === 'cursor' ? d.z : Math.cos(f);
          const off = Math.min(1.5, (ATTACKS.pounce.hang ?? 0.12) * 2 + (h / (ATTACKS.pounce.diveSpeed ?? 14)) * 2);
          x = pos.x + dx * off; z = pos.z + dz * off;
        }
        this._add(DECAL.DASH, x, this._gy(x, z, gy), z, C.dive, 0, DECAL_COLORS.white, 0.7, 0.86, 0.015, 0, 10, this._time * 2, 0, 1, 1, pull);
        this._count('dive');
      }
    }
  }

  /** KBM: the ring's notch follows the cursor (the direction LMB swings). */
  _cursorYaw(p) {
    const cam = this.ctx.cam, input = this.ctx.input;
    if (input?.device !== 'kbm' || !cam?.cursorValid || (input.pointerIdle?.() ?? 99) > AIM.cursorIdle) return null;
    const c = cam.cursorGround;
    if (!c || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 0.3) return null;
    return Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
  }

  /**
   * §8.2.1 strike wedges: every live melee wind-up (white parry / gold / red / purple grab) draws its attack's own arc
   * from the attacker: a rim plus a fill sweeping outward over the wind-up. It tracks the attacker's facing until 0.15 s
   * before the strike, then freezes (a fair dodge read); at parry-window open the rim flashes and thickens.
   */
  _wedges() {
    const ctx = this.ctx, book = ctx.combat?.threats, now = ctx.game?.time ?? 0;
    if (!book?.live?.size) { this._frozen.clear(); return; }
    const touch = ctx.input?.device === 'touch';
    const win = (ctx.state?.difficultyCfg?.parry ?? PLAYER.guard.parryWindow) + (touch ? PLAYER.guard.touchParryBonus ?? 0 : 0);
    let n = 0;
    for (const e of book.live.values()) {
      if (n >= DECAL_CFG.wedgeMax) break;
      const a = e.actor, pay = e.payload, arc = pay?.arc;
      if (!a?.pos || a.alive === false || !arc || e.ended && e.activeAt < now - 0.05) continue;
      const st = wedgeState(e.activeAt, e.windup, now, win);
      if (st.left < -0.05) continue;
      const range = Math.max(0.6, arc.range ?? pay?.range ?? 1.5);
      const half = Math.max(0.25, Math.min(Math.PI, Math.abs((arc.from ?? 0.5) - (arc.to ?? -0.5)) / 2 + 0.12));
      // freeze the facing 0.15 s before the strike
      let yaw = a.facing ?? 0;
      if (st.frozen) { if (!this._frozen.has(e.id)) this._frozen.set(e.id, yaw); yaw = this._frozen.get(e.id); } else this._frozen.delete(e.id);
      const k = e.kind;
      const col = k === 'gold' ? DECAL_COLORS.gold : k === 'red' ? TELEGRAPH.colors.red : k === 'grab' ? TELEGRAPH.colors.grab ?? DECAL_COLORS.purple : DECAL_COLORS.white;
      const pos = a.object3d?.position ?? a.pos, R = range + (a.radius ?? 0.3);
      // rim: ≥ 0.12 m wide (0.86 → thicker at the parry window); red = filled ("don't be here") with a jagged rim
      const rimIn = Math.min(1 - DECAL_CFG.rimMin / R, 0.93), rimOpen = Math.min(1 - (DECAL_CFG.rimMin * 2) / R, 0.86);
      const shape = k === 'red' ? DECAL.FAN_RED : DECAL.FAN;
      const rimCol = st.flash > 0 ? _c.set(col).lerp(_white, st.flash * 0.5).getStyle() : col;
      this._add(shape, pos.x, pos.y, pos.z, R, yaw, rimCol, st.open ? 0.92 : 0.72, st.open ? rimOpen : rimIn, 0.01, half, 0, 0, k === 'red' ? 0.38 : 0.08);
      if (st.prog > 0.02) this._add(DECAL.FAN, pos.x, pos.y, pos.z, Math.max(0.2, R * st.prog), yaw, col, k === 'red' ? 0.3 : 0.16, 0, 0.02, half, 0, 0, 0.9);
      if (k === 'gold') {      // an 8-point star at the tip
        const tx = pos.x + Math.sin(yaw) * R, tz = pos.z + Math.cos(yaw) * R;
        this._add(DECAL.STAR, tx, this._gy(tx, tz, pos.y), tz, 0.32 + 0.08 * st.flash, this._time * 1.5, DECAL_COLORS.gold, 0.95, 0, 0.03);
      }
      this.wedgeList.push({ id: e.id, kind: k, activeAt: e.activeAt, frozen: st.frozen, open: st.open, range: R, half, yaw });
      this._count('wedge');
      n++;
    }
    if (this._frozen.size > 32) this._frozen.clear();
  }

  /**
   * §8.2.2 the parry ring (settings.parryRing: auto = touch and Kitten difficulty): for the single most imminent
   * parryable attack on her, a ring shrinking from 2.2 m to her radius exactly at the strike, the parry window drawn
   * as a brighter band, a tick toward the attacker; gold for gold kinds. Red attacks: a pulsing dodge chevron instead.
   */
  _parryRing(p) {
    const ctx = this.ctx, st = ctx.state;
    if (!parryRingOn(st?.settings?.parryRing, ctx.input?.device, st?.difficulty)) return;
    const pos = p.object3d?.position ?? p.pos, now = ctx.game?.time ?? 0, r1 = p.radius ?? 0.45;
    const nx = ctx.combat?.nextParryable?.(p, DECAL_CFG.parryRing.range);
    if (nx) {
      const left = nx.activeAt - now, r = parryRingRadius(left, r1);
      if (r != null) {
        const win = nx.window ?? PLAYER.guard.parryWindow, inWin = left <= win;
        const col = nx.kind === 'gold' ? DECAL_COLORS.gold : DECAL_COLORS.white;
        const att = nx.attacker?.pos ?? nx.projectile?.pos;
        const yaw = att ? Math.atan2(att.x - pos.x, att.z - pos.z) : 0;
        this._add(DECAL.RING, pos.x, pos.y, pos.z, Math.max(r, r1 + 0.02), yaw, col, inWin ? 0.8 : 0.6, inWin ? 0.82 : 0.9, 0.015, att ? 0.35 : 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
        // the target band: where the ring must be when she raises the Stand (brighter through the window)
        this._add(DECAL.RING, pos.x, pos.y, pos.z, r1 + 0.18, 0, col, inWin ? 0.5 : 0.25, 0.72, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
        this.parryRingR = r;
        this._count('parryRing');
      }
    }
    // red (unblockable) wind-ups on her: a pulsing chevron pointing away from the attacker (dodge!)
    const book = ctx.combat?.threats;
    if (!book?.live?.size) return;
    let best = null, bestLeft = Infinity;
    for (const e of book.live.values()) {
      if (e.kind !== 'red' || e.targetsPlayer === false || !e.actor?.pos || e.actor.alive === false) continue;
      const left = e.activeAt - now;
      if (left > DECAL_CFG.parryRing.lead || left < -0.05 || left >= bestLeft) continue;
      if (Math.hypot(e.actor.pos.x - pos.x, e.actor.pos.z - pos.z) > DECAL_CFG.parryRing.range) continue;
      best = e; bestLeft = left;
    }
    if (best) {
      const yaw = Math.atan2(pos.x - best.actor.pos.x, pos.z - best.actor.pos.z);
      const x = pos.x + Math.sin(yaw) * 0.9, z = pos.z + Math.cos(yaw) * 0.9;
      this._add(DECAL.CHEVRON, x, pos.y, z, 0.55, yaw, TELEGRAPH.colors.red, 1, 0, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
      this._count('chevron');
    }
  }

  /** §7.3 Riposte ready: a gold arrow from her to the parried enemy (0.8 s). */
  _riposte(p) {
    const t = p.riposteTarget;
    if (!t?.pos || !(p.riposteT > 0) || t.alive === false) return;
    const a = p.object3d?.position ?? p.pos, b = t.object3d?.position ?? t.pos;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.9) return;
    const r0 = 0.8, r1 = Math.max(r0 + 0.3, d - (t.radius ?? 0.4) - 0.1), L = r1 - r0, yaw = Math.atan2(dx, dz);
    const mx = a.x + (dx / d) * (r0 + L / 2), mz = a.z + (dz / d) * (r0 + L / 2);
    const k = Math.min(1, p.riposteT / 0.2);
    this._add(DECAL.ARROW, mx, a.y, mz, 1, yaw, DECAL_COLORS.gold, 0.85 * k, 0, 0.01, 0, 0, 0, 0, 0.32, L / 2, DECAL_CFG.pull);
    this._count('riposte');
  }

  /** §7.3 the ranges overlay while Ctrl (`ranges`) is held: AA reach, the Stand fan, the kitten's ability range. */
  _ranges(p) {
    const input = this.ctx.input;
    if (!input?.down?.('ranges')) return;
    const pos = p.object3d?.position ?? p.pos, pull = DECAL_CFG.pull;
    this._add(DECAL.DASH, pos.x, pos.y, pos.z, DECAL_CFG.aaReach, 0, DECAL_COLORS.white, 0.6, 0.94, 0.01, 0, 24, 0, 0, 1, 1, pull);
    if (p.state !== 'guard') this._add(DECAL.FAN, pos.x, pos.y, pos.z, DECAL_CFG.fanR, p.facing, DECAL_COLORS.silver, 0.35, 0.86, 0.015, p.guardState?.arc ?? PLAYER.guard.arc, 0, 0, 0.05, 1, 1, pull);
    const sh = this.ctx.companions?.abilityShape?.();
    const R = sh ? (sh.shape === 'self' ? sh.width / 2 : sh.range) : 0;
    if (R > 0.5) this._add(DECAL.DASH, pos.x, pos.y, pos.z, R, 0, sh.shape === 'self' ? DECAL_COLORS.green : DECAL_COLORS.gold, 0.45, 1 - 0.06 / Math.max(1, R / 2), 0.004, 0, Math.round(R * 6), 0);
    this._count('ranges');
  }

  /** §7.4 the selection: a gold dashed ring rotating 0.5 rev/s, red during its wind-up. */
  _selection(cam) {
    const t = cam.lockTarget;
    if (!t?.pos || t.alive === false) return;
    const pos = t.object3d?.position ?? t.pos;
    const windup = t.stateName === 'windup' || t.telegraph != null;
    const r = Math.max(0.6, (t.radius ?? 0.4) * 1.2 + 0.25);
    this._add(DECAL.DASH, pos.x, pos.y, pos.z, r, 0, windup ? TELEGRAPH.colors.red : DECAL_COLORS.gold, 0.85, 0.86, 0.012, 0, 12, this._time * Math.PI);
    this._count('selection');
  }

  /** §7.4 hover (desktop): a thin ring under what the cursor is over + the actor's rim highlight. */
  _hover(cam) {
    const h = cam.hover, input = this.ctx.input;
    // (a pointer that left the canvas keeps the camera's last pick: no hover then)
    if (!h || input?.device !== 'kbm' || h.kind === 'ground' || h.actor?.alive === false || input.pointer?.inside === false) { this._unhighlight(); return; }
    let pos = null, r = 0.6, col = DECAL_COLORS.white;
    if (h.actor?.pos) { pos = h.actor.object3d?.position ?? h.actor.pos; r = Math.max(0.5, (h.actor.radius ?? 0.4) + 0.25); }
    else if (h.interact?.pos) { pos = h.interact.pos; r = Math.min(1.4, Math.max(0.6, (h.interact.r ?? 1.2) * 0.5)); }
    if (!pos) { this._unhighlight(); return; }
    if (h.kind === 'enemy') col = DECAL_COLORS.red;
    else if (h.kind === 'interact' || h.kind === 'breakable' || h.kind === 'pickup') col = DECAL_COLORS.gold;
    this._highlight(h.actor ?? h.interact?.object3d ?? null, col);
    if (h.actor && h.actor === cam.lockTarget) return;
    this._add(DECAL.RING, pos.x, pos.y ?? 0, pos.z, r, 0, col, 0.75, 0.9, 0.012);
    this._count('hover');
  }

  _highlight(target, color) {
    const H = this._hl;
    if (H.actor === target && H.color === color) return;
    this._unhighlight();
    if (!target || target === this.ctx.player) return;
    try { if (setHighlight(target, color, 1)) { H.actor = target; H.color = color; } } catch { /* no model yet */ }
  }

  _unhighlight() {
    const H = this._hl;
    if (!H.actor) return;
    try { setHighlight(H.actor, null); } catch { /* disposed */ }
    H.actor = null; H.color = null;
  }

  /** §8.2.6 thin red ground rings under alerted enemies near her. */
  _aggro(p) {
    if (!p) return;
    const list = this.ctx.enemies?.list;
    if (!list) return;
    let n = 0;
    for (const e of list) {
      if (n >= 10) break;
      if (!e?.alerted || e.alive === false || e.hidden || e === this.ctx.cam?.lockTarget) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 16) continue;
      const pos = e.object3d?.position ?? e.pos, R = Math.max(0.45, (e.radius ?? 0.4) + 0.15);
      this._add(DECAL.RING, pos.x, pos.y, pos.z, R, 0, DECAL_COLORS.aggro, 0.4, 1 - 0.08 / R, 0.01);
      n++;
    }
    if (n) this.counts.aggro = n;
  }

  /** §7.3 contact blobs under enemies (r = radius × 1.1, 0.35 alpha; Low: alerted ones only). */
  _blobs(p) {
    const list = this.ctx.enemies?.list, B = DECAL_CFG.blob;
    if (!list || !p) return;
    const low = (this.ctx.quality?.particles ?? 2000) < 1000;
    let n = 0;
    for (const e of list) {
      if (n >= B.max) break;
      if (!e?.pos || e.alive === false || e.hidden || e.object3d?.visible === false || (low && !e.alerted)) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > B.range) continue;
      const pos = e.object3d?.position ?? e.pos;
      const gy = e.onGround === false ? this._gy(pos.x, pos.z, pos.y) : pos.y;
      const lift = Math.max(0, pos.y - gy);
      this._add(DECAL.DISC, pos.x, gy, pos.z, Math.max(0.25, (e.radius ?? 0.4) * B.mul) * (1 + Math.min(0.5, lift * 0.1)), 0, DECAL_COLORS.blob, B.alpha / (1 + lift * 0.4), 0.35, 0.02);
      n++;
    }
    if (n) this.counts.blobs = n;
  }

  /** §8.2.4 bolts get a 0.15 m ground shadow dot; reflected ones a gold one. */
  _bolts() {
    const list = this.ctx.combat?.projectiles?.list;
    if (!list?.length) return;
    let n = 0;
    for (const q of list) {
      if (n >= DECAL_CFG.bolt.max) break;
      if (!q?.alive || q.wave || !q.pos) continue;
      const gy = this._gy(q.pos.x, q.pos.z, q.pos.y);
      if (q.pos.y - gy > 6) continue;
      this._add(DECAL.DISC, q.pos.x, gy, q.pos.z, DECAL_CFG.bolt.r, 0, q.reflected ? DECAL_COLORS.gold : DECAL_COLORS.blob, q.reflected ? 0.8 : 0.5, 0.3, 0.02);
      n++;
    }
    if (n) this.counts.bolts = n;
  }

  /**
   * §10.3 the path she is walking: 3 dots along the next segment while RMB is held; with `settings.pathPreview`,
   * faint paws every 1.2 m along the whole path; always a small goal ring on a move / attack-move.
   */
  _path(p) {
    const o = p?.orders;
    if (!o?.kind || !o.path?.length || o.engaged || o.wp >= o.path.length) return;
    const input = this.ctx.input, from = p.object3d?.position ?? p.pos;
    const rmb = !!input?.down?.('move');
    const preview = !!this.ctx.state?.settings?.pathPreview;
    if (preview) {
      const pts = pointsAlong(from, o.path, DECAL_CFG.previewEvery, DECAL_CFG.previewMax, this._pts, o.wp, this._ptPool);
      for (const q of pts) this._add(DECAL.PAW, q.x, this._gy(q.x, q.z, from.y), q.z, 0.16, q.yaw, DECAL_COLORS.move, 0.4, 0, 0.03);
      if (pts.length) this.counts.path = pts.length;
    } else if (rmb) {
      const w = o.path[o.wp], d = Math.hypot(w.x - from.x, w.z - from.z);
      const step = Math.max(0.35, Math.min(1.2, d / (DECAL_CFG.rmbDots + 1)));
      const pts = pointsAlong(from, o.path, step, DECAL_CFG.rmbDots, this._pts, o.wp, this._ptPool);
      for (const q of pts) this._add(DECAL.DISC, q.x, this._gy(q.x, q.z, from.y), q.z, 0.09, 0, DECAL_COLORS.move, 0.6, 0.3, 0.02);
      if (pts.length) this.counts.path = pts.length;
    }
    if (o.kind === 'move' || o.kind === 'attackMove') {
      const g = o.path[o.path.length - 1], T = DECAL_CFG.marker.ticks;
      if (o.kind === 'attackMove') this._add(DECAL.RING, g.x, g.y, g.z, 0.3, 0, DECAL_COLORS.red, 0.45, 0.7, 0.02);
      else this._add(DECAL.TICKS, g.x, g.y, g.z, DECAL_CFG.marker.goal, Math.PI / 4, DECAL_COLORS.move, 0.75, T.inner, 0.03, T.hw, 0, 0, 0.1);
      this._count('goal');
    }
  }

  /** §10.3 queued waypoints (Ctrl + RMB): small dots joined by dotted lines from the current goal. */
  _queue(p) {
    const o = p?.orders, Q = o?.queue;
    if (!Q?.length) return;
    const last = o.path?.length ? o.path[o.path.length - 1] : p.pos;
    let px = last.x, pz = last.z, n = 0;
    for (const q of Q) {
      const dx = q.x - px, dz = q.z - pz, d = Math.hypot(dx, dz);
      const steps = Math.min(16, Math.floor(d / DECAL_CFG.dashEvery));
      for (let k = 1; k < steps; k++) {
        const t = k / steps, x = px + dx * t, z = pz + dz * t;
        this._add(DECAL.DISC, x, this._gy(x, z, q.y ?? p.pos.y), z, DECAL_CFG.queueDot, 0, DECAL_COLORS.move, 0.45, 0.3, 0.02);
      }
      this._add(DECAL.TICKS, q.x, q.y ?? this._gy(q.x, q.z, p.pos.y), q.z, 0.24, Math.PI / 4, DECAL_COLORS.move, 0.75, DECAL_CFG.marker.ticks.inner, 0.03, DECAL_CFG.marker.ticks.hw, 0, 0, 0.12);
      px = q.x; pz = q.z; n++;
    }
    this.counts.queued = n;
  }

  /** Companion ability indicator (§7.5) from ctx.companions.aim. */
  _ability() {
    const fx = this.ctx.fx, aim = this.ctx.companions?.aim;
    if (fx) fx.drawsAbilityAim = this.enabled && !!this.ctx.cam?.isIso;
    if (!aim?.active || !aim.plan) return;
    const pl = aim.plan, col = aim.valid === false ? DECAL_COLORS.grey : aim.shape === 'self' ? DECAL_COLORS.green : DECAL_COLORS.white;
    if (aim.shape === 'rect' && pl.center) {
      const L = Math.max(pl.width ?? 3, pl.length ?? 0.4), W = Math.min(pl.width ?? 3, pl.length ?? 0.4);
      const R = L / 2 + 0.1;
      this._add(DECAL.RECT, pl.center.x, pl.center.y ?? this.ctx.player.pos.y, pl.center.z, R, (pl.yaw ?? 0) + Math.PI / 2, col, 0.75, 0, 0.01, 0, (L / 2) / R, (W / 2 + 0.05) / R);
    } else if (aim.shape === 'targets') {
      const o = pl.origin ?? this.ctx.player.pos;
      const oy = o.y ?? this.ctx.player.pos.y, range = pl.range ?? 14, none = !(pl.targets?.length);
      this._add(DECAL.RING, o.x, oy, o.z, range, 0, col, 0.45, 0.985, 0.002);
      this._reachEdge(o, oy, range, pl);
      for (const t of pl.targets ?? []) if (t?.pos) this._add(DECAL.RING, t.pos.x, t.pos.y, t.pos.z, 0.55, 0, DECAL_COLORS.gold, 0.85, 0.75, 0.02);
      // the aim point chip (cursor / drag / stick): white over a hit, grey ring + cross = "no target here"
      if (pl.aimed && pl.point) {
        let px = pl.point.x, pz = pl.point.z;
        const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz);
        if (d > range) { px = o.x + dx / d * range; pz = o.z + dz / d * range; }
        const py = this._gy(px, pz, pl.point.y ?? oy), c2 = none ? DECAL_COLORS.grey : DECAL_COLORS.white;
        this._add(DECAL.RING, px, py, pz, 0.5, 0, c2, 0.85, 0.8, 0.02, 0, 0, 0, none ? 0.12 : 0, 1, 1, DECAL_CFG.pull);
        if (none) this._add(DECAL.CROSS, px, py, pz, 0.3, 0, DECAL_COLORS.grey, 0.9, 0, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
        this._count('abilityChip');
      }
    } else if (aim.shape === 'self') {
      const o = this.ctx.player.pos;
      this._add(DECAL.RING, o.x, o.y, o.z, pl.radius ?? 2, 0, col, 0.6, 0.9, 0.01, 0, 0, 0, 0.12);
    }
    this._count('ability');
  }

  /**
   * A reach ring wider than the view (Volley's 14 m vs ±7.7 m of iso frame) is never seen: where the ring leaves the
   * screen along the aim, a dotted arc of it is drawn just inside the frame edge, with a chevron pointing on out
   * ("reach continues"). Nothing extra when the ring point itself is on screen.
   */
  _reachEdge(o, oy, range, pl) {
    const cam = this.ctx.cam, R = DECAL_CFG.reachEdge;
    if (!cam?.onScreen) return;
    let dx = 0, dz = 0;
    if (pl.aimed && pl.dir) { dx = pl.dir.x; dz = pl.dir.z; }
    else if (pl.targets?.[0]?.pos) { dx = pl.targets[0].pos.x - o.x; dz = pl.targets[0].pos.z - o.z; }
    else { const f = this.ctx.player?.facing ?? 0; dx = Math.sin(f); dz = Math.cos(f); }
    const l = Math.hypot(dx, dz);
    if (!(l > 1e-4)) return;
    dx /= l; dz /= l;
    const P = _p, on = (d) => cam.onScreen(P.set(o.x + dx * d, this._gy(o.x + dx * d, o.z + dz * d, oy), o.z + dz * d), R.margin);
    if (on(range)) return;
    let lo = 0.5, hi = range;
    if (!on(lo)) return;
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (on(m)) lo = m; else hi = m; }
    // the reach mark stays white (the reach is real either way; the aim chip carries "no target"), over a dark halo
    const d = lo, yaw0 = Math.atan2(dx, dz), half = Math.min(0.6, R.arc / 2 / d), n = R.dots, c = DECAL_COLORS.white, k = DECAL_COLORS.blob;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1, a = yaw0 + u * half, x = o.x + Math.sin(a) * d, z = o.z + Math.cos(a) * d, y = this._gy(x, z, oy);
      if (i !== (n - 1) / 2 && !cam.onScreen(P.set(x, y, z), 0.15)) continue;   // the arc may run off a frame corner
      const f = 1 - 0.55 * Math.abs(u);
      this._add(DECAL.DISC, x, y, z, R.dot * 1.7, 0, k, 0.35 * f, 0.35, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
      this._add(DECAL.DISC, x, y, z, R.dot, 0, c, 0.95 * f, 0.55, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
    }
    const cx = o.x + dx * (d - 0.5), cz = o.z + dz * (d - 0.5), cy = this._gy(cx, cz, oy);
    this._add(DECAL.ARROW, cx, cy, cz, 0.36, yaw0, k, 0.3, 0, 0.04, 0, 0, 0, 0, 0.8, 1.1, DECAL_CFG.pull);
    this._add(DECAL.ARROW, cx, cy, cz, 0.32, yaw0, c, 0.9, 0, 0.02, 0, 0, 0, 0, 0.7, 1, DECAL_CFG.pull);
    this.reachEdgeAt = d;
    this._count('reachEdge');
  }

  /**
   * Order markers: a cream paw + 4 collapsing ticks (move: scale-in pulse 0.12 s, gone in 0.6 s), red (attack) / gold (use) rings,
   * a grey ✕ paw (unreachable); plus the slash smear and the Golden Hour gleam lanes.
   */
  _markers(dt, play) {
    const M = DECAL_CFG.marker, pl = this.ctx.player;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      if (m.delay > 0) { m.delay -= dt; if (play) continue; }
      m.t += dt;
      if (m.t >= m.dur || !play) { this.markers.splice(i, 1); continue; }
      const k = m.t / m.dur, grow = Math.min(1, m.t / M.grow), fade = 1 - k;
      if (m.actor?.pos) { const ap = m.actor.object3d?.position ?? m.actor.pos; m.x = ap.x; m.y = ap.y; m.z = ap.z; }
      switch (m.kind) {
        case 'move': case 'follow': {
          // cream: a paw that scales in with a small overshoot pulse, and 4 ticks collapsing onto the spot
          const T = M.ticks, c = 1 - Math.min(1, m.t / T.collapse), pulse = grow < 1 ? grow * 1.2 : 1 + 0.2 * Math.max(0, 1 - (m.t - M.grow) / 0.12);
          this._add(DECAL.PAW, m.x, m.y, m.z, M.paw * pulse, m.yaw, DECAL_COLORS.move, 0.95 * fade, 0, 0.03, 0, 0, 0, 0);
          this._add(DECAL.TICKS, m.x, m.y, m.z, T.r1 + (T.r0 - T.r1) * c * c, Math.PI / 4, DECAL_COLORS.move, 0.95 * Math.min(1, fade * 1.6), T.inner, 0.025, T.hw, 0, 0, 0);
          break;
        }
        case 'attackMove':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.25 + 0.5 * grow, 0, DECAL_COLORS.red, 0.9 * fade, 0.78, 0.02);
          this._add(DECAL.CROSS, m.x, m.y, m.z, 0.22 * grow, 0, DECAL_COLORS.red, 0.8 * fade, 0, 0.02);
          break;
        case 'attack':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.9 - 0.3 * grow, 0, DECAL_COLORS.red, 0.95 * fade, 0.82, 0.02);
          break;
        case 'use':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.9 - 0.3 * grow, 0, DECAL_COLORS.gold, 0.95 * fade, 0.82, 0.02);
          break;
        case 'smear': {
          if (m.follow && pl) { const pp = pl.object3d?.position ?? pl.pos; m.x = pp.x; m.y = pp.y; m.z = pp.z; }
          this._add(DECAL.FAN, m.x, m.y, m.z, m.r, m.yaw, DECAL_COLORS.white, DECAL_CFG.smear.alpha * fade, 0.55, 0.03, m.half, 0, 0, 0.5);
          this._count('smear');
          break;
        }
        case 'gleam': {
          const x = m.x + Math.sin(m.yaw) * m.l / 2, z = m.z + Math.cos(m.yaw) * m.l / 2;
          this._add(DECAL.LANE, x, m.y, z, 1, m.yaw, DECAL_COLORS.gold, 0.8 * fade, 0, 0.01, 0, 0, 0, 0.3, m.w / 2, m.l / 2, DECAL_CFG.pull);
          this._count('gleam');
          break;
        }
        default:
          this._add(DECAL.PAW, m.x, m.y, m.z, 0.4, m.yaw, DECAL_COLORS.grey, 0.75 * fade, 0, 0.03);
          this._add(DECAL.CROSS, m.x, m.y, m.z, 0.42, 0, DECAL_COLORS.grey, 0.95 * fade, 0, 0.02);
      }
      if (m.kind !== 'smear' && m.kind !== 'gleam') this._count('marker');
    }
  }
}

const _white = new THREE.Color('#FFFFFF');
