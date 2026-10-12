// src/fx/Ambient.js  (owner: fx) — art.md §8 ambient motes, one Points draw call recycled around the camera entirely in
// the vertex shader (no per-frame CPU work): meadow dandelion fluff (60 over 30 × 30 m, larger and slower), forest /
// night fireflies, keep embers (rise faster), bog spores, town dust, gate ash. HDR additive so bloom catches the
// bright ones; faded by fog (additive → black) and near the recycling box edge so nothing pops.
import * as THREE from 'three';
import { FOG_FACTOR, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { hash01 } from './util.js';

/** Mote presets (art.md §8 table). `rise` m/s (negative falls), `drift` × wind, `blink` 0 steady … 1 firefly. */
export const MOTES = Object.freeze({
  fluff:     { color: '#F4F1E6', count: 60, size: 1.6, intensity: 0.35, rise: 0.04, drift: 0.55, blink: 0.15, wobble: 0.6 },
  fireflies: { color: '#E8FF9A', count: 46, size: 1.1, intensity: 2.2, rise: 0.05, drift: 0.12, blink: 1.0, wobble: 1.2 },
  embers:    { color: '#FF7A3D', count: 50, size: 0.9, intensity: 2.0, rise: 0.75, drift: 0.35, blink: 0.4, wobble: 0.8 },
  spores:    { color: '#C8E8A0', count: 55, size: 1.2, intensity: 0.6, rise: 0.08, drift: 0.2, blink: 0.3, wobble: 0.9 },
  dust:      { color: '#FFE9C9', count: 40, size: 0.9, intensity: 0.45, rise: 0.02, drift: 0.3, blink: 0.2, wobble: 0.5 },
  ash:       { color: '#D9CFC4', count: 45, size: 1.0, intensity: 0.4, rise: -0.12, drift: 0.6, blink: 0.1, wobble: 0.7 },
});

/** Mote preset for a level id + env grade (pure; unit-tested). Null = none. */
export function motesFor(levelId, grade) {
  if (levelId === 'sky') return null;
  if (grade === 'night') return levelId === 'keep' ? 'embers' : 'fireflies';
  switch (levelId) {
    case 'meadow': return 'fluff';
    case 'forest': return 'fireflies';
    case 'town': return 'dust';
    case 'gate': return 'ash';
    case 'bog': return 'spores';
    case 'keep': return 'embers';
    default: return null;
  }
}

const BOX = 30, HEIGHT = 7, MAX = 64;

const VERT = /* glsl */`
uniform float uTime, uPx, uRise, uWobble, uBox, uHeight, uBlink;
uniform vec3 uCam;
uniform vec2 uDrift;
attribute vec4 aSeed;     // x, y, z in 0..1, phase
varying float vA;
#include <fog_pars_vertex>
void main() {
  float ph = aSeed.w * 6.2831853;
  vec3 p = vec3( aSeed.x * uBox, aSeed.y * uHeight, aSeed.z * uBox );
  p.xz += uDrift + vec2( sin( uTime * 0.31 + ph ), cos( uTime * 0.27 + ph * 1.3 ) ) * uWobble;
  p.y += uTime * uRise + sin( uTime * 0.5 + ph ) * 0.25 * uWobble;
  // recycle inside a box around the camera (x/z) and a slab from 1.5 m below to uHeight above it
  vec2 rel = mod( p.xz - uCam.xz + uBox * 0.5, uBox ) - uBox * 0.5;
  float y = mod( p.y - ( uCam.y - 1.5 ), uHeight ) + uCam.y - 1.5;
  vec3 wp = vec3( uCam.x + rel.x, y, uCam.z + rel.y );
  float edge = ( 1.0 - smoothstep( uBox * 0.5 - 4.0, uBox * 0.5, max( abs( rel.x ), abs( rel.y ) ) ) )
             * smoothstep( 0.0, 1.0, y - ( uCam.y - 1.5 ) ) * ( 1.0 - smoothstep( uHeight - 1.0, uHeight, y - ( uCam.y - 1.5 ) ) );
  float tw = mix( 1.0, max( 0.0, sin( uTime * ( 1.3 + aSeed.w * 1.7 ) + ph * 3.0 ) ), uBlink );
  vA = edge * tw;
  vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
  float dz = max( -mvPosition.z, 0.3 );
  vA *= smoothstep( 0.6, 2.0, dz );
  gl_PointSize = min( 48.0, uPx * ( 0.6 + 0.8 * aSeed.y ) / dz );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uI;
varying float vA;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length( c );
  float a = exp( -d * d * 18.0 ) * ( 1.0 - smoothstep( 0.4, 0.5, d ) ) * vA * uI;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor * a * ( 1.0 - fxFog() * 0.85 ), 1.0 );
  ${OUTPUT}
}`;

export class Ambient {
  constructor(ctx) {
    this.ctx = ctx;
    this.preset = null;
    this.points = null;
    this.budget = 1;            // quality multiplier
    this._drift = new THREE.Vector2();
  }

  init(scene) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 3), seed = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) {
      seed[i * 4] = hash01(i * 4 + 101); seed[i * 4 + 1] = hash01(i * 4 + 102); seed[i * 4 + 2] = hash01(i * 4 + 103); seed[i * 4 + 3] = hash01(i * 4 + 104);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: 'fx.ambient', vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uTime: { value: 0 }, uPx: { value: 30 }, uRise: { value: 0 }, uWobble: { value: 0.5 }, uBox: { value: BOX },
        uHeight: { value: HEIGHT }, uBlink: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color() }, uI: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.name = 'fx.ambient';
    this.points.frustumCulled = false; this.points.matrixAutoUpdate = false; this.points.renderOrder = 6; this.points.visible = false;
    scene.add(this.points);
  }

  /** Switch preset by name (null = off). */
  set(name) {
    const p = name ? MOTES[name] : null;
    this.preset = p ? name : null;
    if (!this.points) return;
    if (!p) { this.points.visible = false; return; }
    const u = this.material.uniforms;
    u.uColor.value.set(p.color); u.uRise.value = p.rise; u.uWobble.value = p.wobble; u.uBlink.value = p.blink; u.uI.value = p.intensity;
    this._apply();
  }

  /** Quality budget (particles / 2000). */
  setBudget(mul) { this.budget = Math.max(0.25, Math.min(1, mul)); this._apply(); }

  _apply() {
    const p = this.preset ? MOTES[this.preset] : null;
    if (!p || !this.points) return;
    this.count = Math.min(MAX, Math.round(p.count * this.budget));
    this.geometry.setDrawRange(0, this.count);
    this.points.visible = this.count > 0;
  }

  render(dt) {
    if (!this.points?.visible) return;
    const ctx = this.ctx, u = this.material.uniforms, p = MOTES[this.preset];
    const wind = Math.max(0.1, ctx.env?.wind ?? 0.6);
    this._drift.x += dt * wind * p.drift; this._drift.y += dt * wind * p.drift * 0.4;
    u.uDrift.value.copy(this._drift);
    u.uTime.value = ctx.game?.realTime ?? 0;
    u.uCam.value.copy(ctx.camera.position);
    const r = ctx.renderer;
    const h = r?.getContext ? r.getContext().drawingBufferHeight : 1080;
    u.uPx.value = 30 * p.size * Math.max(0.5, h / 1080);
  }

  dispose() { this.points?.removeFromParent(); this.geometry?.dispose(); this.material?.dispose(); this.points = null; }
}
