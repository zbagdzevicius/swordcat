// src/fx/Ambient.js  (owner: fx) — ambient motes (art.md §8, WARM_ADVENTURE_SPEC §2.4 profiles), ONE Points draw call
// recycled around the camera entirely in the vertex shader (no per-frame CPU work beyond a few uniforms). A profile
// mixes up to two mote layers in the same draw (the first `uSplit` points use layer 0, the rest layer 1):
//   meadow → fluff + petals · forest day → golden dust · forest twilight → fireflies 64 · town / hub → dust + 20 petals ·
//   gate → warm dust #FFE0C0 (+ 6 swallows in Butterflies.js; WA24: no ash) · bog dusk → fireflies 56 + spores 30 ·
//   keep → lantern sparks #FFC46B 40 + fireflies 24 (ART §8.4: no embers / ash). Low tier ×0.5 (ART §8.6).
// HDR additive; faded by fog and near the recycling box edge so nothing pops.
import * as THREE from 'three';
import { FOG_FACTOR, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { hash01 } from './util.js';

/** Mote layers. `rise` m/s (negative falls), `drift` × wind, `blink` 0 steady … 1 firefly, `wobble` m. */
export const MOTES = Object.freeze({
  fluff:      { color: '#F4F1E6', count: 60, size: 1.6, intensity: 0.35, rise: 0.04, drift: 0.55, blink: 0.15, wobble: 0.6 },
  petals:     { color: '#FFC2D6', count: 16, size: 1.4, intensity: 0.45, rise: -0.18, drift: 0.7, blink: 0.25, wobble: 1.0 },
  fireflies:  { color: '#E8FF9A', count: 46, size: 1.1, intensity: 2.2, rise: 0.05, drift: 0.12, blink: 1.0, wobble: 1.2 },
  dust:       { color: '#FFE9C9', count: 40, size: 0.9, intensity: 0.45, rise: 0.02, drift: 0.3, blink: 0.2, wobble: 0.5 },
  goldenDust: { color: '#FFE9C9', count: 44, size: 1.0, intensity: 0.6, rise: 0.03, drift: 0.25, blink: 0.25, wobble: 0.55 },
  gateDust:   { color: '#FFE0C0', count: 40, size: 1.0, intensity: 0.5, rise: 0.02, drift: 0.5, blink: 0.15, wobble: 0.6 },
  spores:     { color: '#B8F0D8', count: 30, size: 1.2, intensity: 0.6, rise: 0.08, drift: 0.2, blink: 0.3, wobble: 0.9 },
  sparks:     { color: '#FFC46B', count: 40, size: 0.9, intensity: 1.8, rise: 0.5, drift: 0.3, blink: 0.4, wobble: 0.7 },
  // legacy names kept for setAmbient callers (cutscenes): now warm, never grey ash or angry embers
  embers:     { color: '#FFC46B', count: 40, size: 0.9, intensity: 1.8, rise: 0.5, drift: 0.3, blink: 0.4, wobble: 0.7 },
  ash:        { color: '#FFE0C0', count: 40, size: 1.0, intensity: 0.5, rise: 0.02, drift: 0.5, blink: 0.15, wobble: 0.6 },
});

/** WA §2.4 profiles: [layer, count][] (counts are full-tier; Low halves them). */
export const AMBIENT_PROFILES = Object.freeze({
  meadow: [['fluff', 60], ['petals', 16]],
  meadow_night: [['fireflies', 46]],
  forest_day: [['goldenDust', 44]],
  forest_twilight: [['fireflies', 64]],
  town: [['dust', 40], ['petals', 20]],
  gate: [['gateDust', 40]],
  bog: [['spores', 55]],
  bog_dusk: [['fireflies', 56], ['spores', 30]],
  keep: [['sparks', 40], ['fireflies', 24]],
  night: [['fireflies', 46]],
  // single-layer profiles under the old preset names (setAmbient('fireflies') etc.)
  ...Object.fromEntries(['fluff', 'petals', 'fireflies', 'dust', 'goldenDust', 'gateDust', 'spores', 'sparks', 'embers', 'ash'].map((k) => [k, [[k, null]]])),
});

/**
 * The ambient profile for a level id + env grade / preset name (pure; unit-tested). Null = none. Night / twilight
 * grades give fireflies (keep: lantern sparks + fireflies, bog: the dusk mix).
 */
export function motesFor(levelId, grade, preset = null) {
  if (levelId === 'sky') return null;
  const night = grade === 'night' || /_(night|twilight|dusk)$/.test(String(preset ?? ''));
  switch (levelId) {
    case 'meadow': return night ? 'meadow_night' : 'meadow';
    case 'forest': return night ? 'forest_twilight' : 'forest_day';
    case 'town': case 'hub': return night ? 'night' : 'town';
    case 'gate': return 'gate';
    case 'bog': return preset === 'bog' ? 'bog' : 'bog_dusk';
    case 'keep': return 'keep';
    default: return night ? 'night' : null;
  }
}

/** Resolved layers of a profile at a budget multiplier (pure): [{ name, count }] (≤ 2 layers, total ≤ MAX). */
export function profileLayers(name, budget = 1) {
  const P = AMBIENT_PROFILES[name];
  if (!P) return [];
  const out = [];
  let total = 0;
  for (const [layer, n] of P.slice(0, 2)) {
    const m = MOTES[layer];
    if (!m) continue;
    const c = Math.min(MAX - total, Math.max(0, Math.round((n ?? m.count) * budget)));
    out.push({ name: layer, count: c });
    total += c;
  }
  return out;
}

const BOX = 30, HEIGHT = 7, MAX = 128;

const VERT = /* glsl */`
uniform float uTime, uPx, uBox, uHeight, uSplit;
uniform vec4 uA0, uA1;    // per layer: rise, drift, blink, wobble
uniform vec2 uB0, uB1;    // per layer: size, intensity
uniform vec3 uC0, uC1;    // per layer colour
uniform vec3 uCam;
uniform vec2 uDrift;
attribute vec4 aSeed;     // x, y, z in 0..1, phase
attribute float aIdx;
varying float vA;
varying vec3 vCol;
#include <fog_pars_vertex>
void main() {
  bool l0 = aIdx < uSplit;
  vec4 A = l0 ? uA0 : uA1;
  vec2 B = l0 ? uB0 : uB1;
  vCol = ( l0 ? uC0 : uC1 ) * B.y;
  float ph = aSeed.w * 6.2831853;
  vec3 p = vec3( aSeed.x * uBox, aSeed.y * uHeight, aSeed.z * uBox );
  p.xz += uDrift * A.y + vec2( sin( uTime * 0.31 + ph ), cos( uTime * 0.27 + ph * 1.3 ) ) * A.w;
  p.y += uTime * A.x + sin( uTime * 0.5 + ph ) * 0.25 * A.w;
  // recycle inside a box around the camera (x/z) and a slab from 1.5 m below to uHeight above it
  vec2 rel = mod( p.xz - uCam.xz + uBox * 0.5, uBox ) - uBox * 0.5;
  float y = mod( p.y - ( uCam.y - 1.5 ), uHeight ) + uCam.y - 1.5;
  vec3 wp = vec3( uCam.x + rel.x, y, uCam.z + rel.y );
  float edge = ( 1.0 - smoothstep( uBox * 0.5 - 4.0, uBox * 0.5, max( abs( rel.x ), abs( rel.y ) ) ) )
             * smoothstep( 0.0, 1.0, y - ( uCam.y - 1.5 ) ) * ( 1.0 - smoothstep( uHeight - 1.0, uHeight, y - ( uCam.y - 1.5 ) ) );
  float tw = mix( 1.0, max( 0.0, sin( uTime * ( 1.3 + aSeed.w * 1.7 ) + ph * 3.0 ) ), A.z );
  vA = edge * tw;
  vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
  float dz = max( -mvPosition.z, 0.3 );
  vA *= smoothstep( 0.6, 2.0, dz );
  gl_PointSize = min( 48.0, uPx * B.x * ( 0.6 + 0.8 * aSeed.y ) / dz );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
varying float vA;
varying vec3 vCol;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length( c );
  float a = exp( -d * d * 18.0 ) * ( 1.0 - smoothstep( 0.4, 0.5, d ) ) * vA;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( vCol * a * ( 1.0 - fxFog() * 0.85 ), 1.0 );
  ${OUTPUT}
}`;

export class Ambient {
  constructor(ctx) {
    this.ctx = ctx;
    this.preset = null;          // the active profile name
    this.layers = [];            // [{ name, count }]
    this.points = null;
    this.budget = 1;             // quality multiplier (Low 0.5)
    this.count = 0;
    this._drift = new THREE.Vector2();
  }

  init(scene) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 3), seed = new Float32Array(MAX * 4), idx = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      seed[i * 4] = hash01(i * 4 + 101); seed[i * 4 + 1] = hash01(i * 4 + 102); seed[i * 4 + 2] = hash01(i * 4 + 103); seed[i * 4 + 3] = hash01(i * 4 + 104);
      idx[i] = i;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: 'fx.ambient', vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uTime: { value: 0 }, uPx: { value: 30 }, uBox: { value: BOX }, uHeight: { value: HEIGHT }, uSplit: { value: 0 },
        uA0: { value: new THREE.Vector4() }, uA1: { value: new THREE.Vector4() }, uB0: { value: new THREE.Vector2(1, 0) }, uB1: { value: new THREE.Vector2(1, 0) },
        uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector2() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.name = 'fx.ambient';
    this.points.frustumCulled = false; this.points.matrixAutoUpdate = false; this.points.renderOrder = 6; this.points.visible = false;
    scene.add(this.points);
  }

  /** Switch profile (or single mote layer) by name; null = off. */
  set(name) {
    this.preset = name && AMBIENT_PROFILES[name] ? name : null;
    this._apply();
  }

  /** Quality budget multiplier (Low 0.5, ART §8.6). */
  setBudget(mul) { this.budget = Math.max(0.25, Math.min(1, mul)); this._apply(); }

  _apply() {
    this.layers = this.preset ? profileLayers(this.preset, this.budget) : [];
    this.count = this.layers.reduce((s, l) => s + l.count, 0);
    if (!this.points) return;
    const u = this.material.uniforms;
    for (let k = 0; k < 2; k++) {
      const L = this.layers[k] ?? this.layers[0], m = L ? MOTES[L.name] : null;
      if (!m) continue;
      u[`uA${k}`].value.set(m.rise, m.drift, m.blink, m.wobble);
      u[`uB${k}`].value.set(m.size, m.intensity);
      u[`uC${k}`].value.set(m.color);
    }
    u.uSplit.value = this.layers[0]?.count ?? 0;
    this.geometry.setDrawRange(0, this.count);
    this.points.visible = this.count > 0;
  }

  render(dt = 1 / 60) {
    if (!this.points?.visible) return;
    const ctx = this.ctx, u = this.material.uniforms;
    const wind = Math.max(0.1, ctx.env?.wind ?? 0.6);
    this._drift.x += dt * wind; this._drift.y += dt * wind * 0.4;
    u.uDrift.value.copy(this._drift);
    u.uTime.value = ctx.game?.realTime ?? 0;
    u.uCam.value.copy(ctx.camera.position);
    const r = ctx.renderer;
    const h = r?.getContext ? r.getContext().drawingBufferHeight : 1080;
    u.uPx.value = 30 * Math.max(0.5, h / 1080);
  }

  dispose() { this.points?.removeFromParent(); this.geometry?.dispose(); this.material?.dispose(); this.points = null; }
}
