// src/fx/LightPools.js  (owner: fx, with world) — ART_WARM_SPEC §8.1: in the iso play camera the sun-ray cones are
// replaced by GROUND LIGHT POOLS: 24 soft additive ellipses #FFF0B8 at α 0.16 (Low 12) lying on the ground like sun
// through gaps in the leaves, ONE instanced draw, meadow and forest only, by day only. They wrap in a tile around the
// camera footprint (so they always dapple the visible ground) and breathe slowly. Also home of the cloud shadows
// (`CloudShadows`, the second A:fx.5 draw, off on Low): soft plum shapes drifting with the wind over the ground.
import * as THREE from 'three';
import { FOG_FACTOR, NOISE, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { FX_COLORS } from './palette.js';
import { hash01, groundY } from './util.js';

export const POOLS = Object.freeze({ count: 24, countLow: 12, color: FX_COLORS.light, alpha: 0.16, tile: 30, size: [2.2, 4.2], aspect: [0.45, 0.8],
  levels: Object.freeze(['meadow', 'forest']), drift: 0.12 });
export const CLOUDS = Object.freeze({ color: FX_COLORS.blob, alpha: 0.1, scale: 0.035, speed: 0.6, half: 28, grid: 24, snap: 2,
  levels: Object.freeze(['meadow', 'forest', 'town', 'gate', 'bog']) });

/** Are light pools on for this level / grade / camera (pure; unit-tested)? */
export function poolsOn(levelId, grade, iso) { return !!iso && POOLS.levels.includes(levelId) && (grade ?? 'none') !== 'night' && grade !== 'grey'; }
/** Are cloud shadows on for this level / grade / tier (pure; unit-tested)? Off on Low, at night and indoors. */
export function cloudsOn(levelId, grade, low) { return !low && CLOUDS.levels.includes(levelId) && (grade ?? 'none') !== 'night' && grade !== 'grey'; }

const POOL_VERT = /* glsl */`
attribute vec4 iPos;      // x, y, z, rotation
attribute vec4 iSize;     // sx, sz, phase, alpha
uniform float uTime;
varying vec2 vUv;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vUv = position.xz * 2.0;
  float c = cos( iPos.w ), s = sin( iPos.w );
  vec3 p = vec3( position.x * iSize.x, 0.0, position.z * iSize.y );
  p = vec3( c * p.x + s * p.z, 0.0, -s * p.x + c * p.z ) + iPos.xyz;
  vA = iSize.w * ( 0.8 + 0.2 * sin( uTime * 0.6 + iSize.z * 6.28 ) );
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const POOL_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
varying float vA;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  float r = length( vUv );
  float a = ( 1.0 - smoothstep( 0.35, 1.0, r ) ) * vA * uAlpha;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor * a * ( 1.0 - fxFog() ), 1.0 );
  ${OUTPUT}
}`;

export class LightPools {
  /** @param {any} ctx */
  constructor(ctx) { this.ctx = ctx; this.mesh = null; this.count = 0; this.on = false; this.alpha = 0; this.levelId = null; this.low = false; }

  init(scene) {
    const g = new THREE.InstancedBufferGeometry(), plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.index = plane.index; g.setAttribute('position', plane.getAttribute('position'));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(POOLS.count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iSize = new THREE.InstancedBufferAttribute(new Float32Array(POOLS.count * 4), 4);
    for (let i = 0; i < POOLS.count; i++) {
      const s = POOLS.size[0] + (POOLS.size[1] - POOLS.size[0]) * hash01(i * 5 + 1);
      this.iSize.array.set([s, s * (POOLS.aspect[0] + (POOLS.aspect[1] - POOLS.aspect[0]) * hash01(i * 5 + 2)), hash01(i * 5 + 3), 0.7 + 0.3 * hash01(i * 5 + 4)], i * 4);
    }
    g.setAttribute('iPos', this.iPos); g.setAttribute('iSize', this.iSize);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: 'fx.lightPools', vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uTime: { value: 0 }, uColor: { value: new THREE.Color(POOLS.color) }, uAlpha: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.lightPools';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 1; this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setLevel(levelId, low) { this.levelId = levelId; this.low = !!low; this.count = low ? POOLS.countLow : POOLS.count; if (this.geometry) this.geometry.instanceCount = this.count; }

  render(dt) {
    if (!this.mesh) return;
    const ctx = this.ctx, cam = ctx.cam;
    const iso = !!cam?.isIso && ctx.params?.cam !== 'classic' && ctx.game?.mode !== 'cutscene';
    this.on = poolsOn(this.levelId, ctx.env?.grade, iso);
    this.alpha += ((this.on ? 1 : 0) - this.alpha) * (dt > 0 ? 1 - Math.exp(-2 * dt) : 0);
    if (!this.on && this.alpha < 0.01) this.alpha = 0;
    this.mesh.visible = this.alpha > 0.01 && this.count > 0;
    if (!this.mesh.visible) return;
    const time = ctx.game?.realTime ?? 0, f = cam?.footprint, foc = cam?.focus ?? ctx.player?.pos;
    const cx = Number.isFinite(f?.cx) ? f.cx : foc?.x ?? 0, cz = Number.isFinite(f?.cz) ? f.cz : foc?.z ?? 0, cy = foc?.y ?? 0;
    const T = POOLS.tile, P = this.iPos.array;
    for (let i = 0; i < this.count; i++) {
      const hx = hash01(i * 13 + 7) * T + time * POOLS.drift, hz = hash01(i * 13 + 8) * T + time * POOLS.drift * 0.4;
      const x = cx + (((hx - cx) % T) + T * 1.5) % T - T / 2, z = cz + (((hz - cz) % T) + T * 1.5) % T - T / 2;
      P[i * 4] = x; P[i * 4 + 1] = groundY(ctx, x, z, cy) + 0.04; P[i * 4 + 2] = z; P[i * 4 + 3] = hash01(i * 13 + 9) * Math.PI;
    }
    this.iPos.needsUpdate = true;
    const u = this.material.uniforms;
    u.uTime.value = time; u.uAlpha.value = POOLS.alpha * this.alpha;
  }

  dispose() { this.mesh?.removeFromParent(); this.geometry?.dispose(); this.material?.dispose(); this.mesh = null; }
}

const CLOUD_VERT = /* glsl */`
varying vec3 vW;
varying float vEdge;
attribute float aEdge;
#include <fog_pars_vertex>
void main() {
  vW = position; vEdge = aEdge;
  vec4 mvPosition = viewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const CLOUD_FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec2 uDrift;
uniform float uAlpha, uScale;
varying vec3 vW;
varying float vEdge;
#include <fog_pars_fragment>
${FOG_FACTOR}
${NOISE}
void main() {
  float n = fxFbm2( vW.xz * uScale + uDrift );
  float a = smoothstep( 0.52, 0.72, n ) * vEdge * uAlpha * ( 1.0 - fxFog() );
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor, a );
  ${OUTPUT}
}`;

/** Cloud shadows: one ground-hugging grid around the footprint (re-fit when it moves a snap step), noise blobs. */
export class CloudShadows {
  /** @param {any} ctx */
  constructor(ctx) { this.ctx = ctx; this.mesh = null; this.levelId = null; this.low = false; this.alpha = 0; this._cx = NaN; this._cz = NaN; this._drift = new THREE.Vector2(); }

  init(scene) {
    const N = CLOUDS.grid, g = new THREE.BufferGeometry(), V = (N + 1) * (N + 1);
    this.pos = new Float32Array(V * 3);
    const edge = new Float32Array(V), idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
      edge[j * (N + 1) + i] = 1 - Math.max(0, Math.min(1, (Math.max(Math.abs(u), Math.abs(v)) - 0.6) / 0.4));
      if (i < N && j < N) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    g.setIndex(idx);
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: 'fx.cloudShadows', vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: new THREE.Color(CLOUDS.color) }, uDrift: { value: this._drift }, uAlpha: { value: 0 }, uScale: { value: CLOUDS.scale } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.cloudShadows';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 1; this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setLevel(levelId, low) { this.levelId = levelId; this.low = !!low; this._cx = NaN; }

  _fit(cx, cz, cy) {
    const N = CLOUDS.grid, H = CLOUDS.half, P = this.pos;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = cx + ((i / N) * 2 - 1) * H, z = cz + ((j / N) * 2 - 1) * H, v = (j * (N + 1) + i) * 3;
      P[v] = x; P[v + 1] = groundY(this.ctx, x, z, cy) + 0.03; P[v + 2] = z;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this._cx = cx; this._cz = cz;
  }

  render(dt) {
    if (!this.mesh) return;
    const ctx = this.ctx, on = cloudsOn(this.levelId, ctx.env?.grade, this.low) && ctx.game?.mode !== 'menu';
    this.alpha += ((on ? 1 : 0) - this.alpha) * (dt > 0 ? 1 - Math.exp(-1.5 * dt) : 0);
    if (!on && this.alpha < 0.01) this.alpha = 0;
    this.mesh.visible = this.alpha > 0.01;
    if (!this.mesh.visible) return;
    const f = ctx.cam?.footprint, foc = ctx.cam?.focus ?? ctx.player?.pos ?? ctx.camera?.position;
    const S = CLOUDS.snap, cx = Math.round((Number.isFinite(f?.cx) ? f.cx : foc?.x ?? 0) / S) * S, cz = Math.round((Number.isFinite(f?.cz) ? f.cz : foc?.z ?? 0) / S) * S;
    if (cx !== this._cx || cz !== this._cz) this._fit(cx, cz, foc?.y ?? 0);
    const wind = Math.max(0.2, ctx.env?.wind ?? 0.6), wd = ctx.env?.windDir, k = (dt || 0) * CLOUDS.speed * wind * CLOUDS.scale;
    this._drift.x -= (wd?.x ?? 0.8) * k; this._drift.y -= (wd?.y ?? 0.6) * k;
    this.material.uniforms.uAlpha.value = CLOUDS.alpha * this.alpha;
  }

  dispose() { this.mesh?.removeFromParent(); this.geometry?.dispose(); this.material?.dispose(); this.mesh = null; }
}
