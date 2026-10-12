// src/fx/Butterflies.js  (owner: fx) — ART_WARM_SPEC §8.7 ambient life: butterflies (meadow 18, forest 12, town 10,
// hub 14), bog dragonflies (8) and gate swallows (6), ONE InstancedMesh (one draw; part of the A:fx.5 "+2 draws").
// Each instance is two wing quads flapped in the vertex shader; the wing outline is an SDF in the fragment shader
// (butterfly lobes, dragonfly blades, swallow sickle). Flight is a cheap CPU Lissajous around a home point that
// wraps in a tile around the camera focus (so they always fill the visible ground), lifted above the ground under
// it; they never come within 1.2 m of her head, hide in arenas (arena:lock → arena:clear) and at night (fireflies
// take over). Low tier ×0.5. No allocation per frame.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { FOG_FACTOR, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { hash01, groundY } from './util.js';

/** Per-kind look and flight (m, s). */
export const FLYERS = Object.freeze({
  butterfly: { kind: 0, size: 0.16, h: [0.5, 1.6], speed: 0.9, flap: 14, amp: 1.0, wander: 2.6,
    colors: ['#FFC2D6', '#FFE680', '#BDE8FF', '#E8D4FF', '#FFFFFF', '#FFD0A8'] },
  dragonfly: { kind: 1, size: 0.2, h: [0.6, 1.4], speed: 1.8, flap: 30, amp: 0.45, wander: 3.2, colors: ['#9FEBDD', '#BDE8FF', '#C9F2B8'] },
  swallow: { kind: 2, size: 0.3, h: [3.2, 5.0], speed: 4.2, flap: 9, amp: 0.7, wander: 7.0, colors: ['#5A6EA8', '#6A5A8A'] },
});
/** ART §8.7 counts per level (full tier; Low ×0.5). `hub` = town once `town.free` is set. */
export const FLYER_COUNTS = Object.freeze({ meadow: ['butterfly', 18], forest: ['butterfly', 12], town: ['butterfly', 10], hub: ['butterfly', 14],
  bog: ['dragonfly', 8], gate: ['swallow', 6] });
const MAX = 18, TILE = 36, HEAD_CLEAR = 1.2;

/** The flyer set for a level: { kind, count } or null (pure; unit-tested). */
export function flyersFor(levelId, { hub = false, low = false, night = false } = {}) {
  const key = levelId === 'town' && hub ? 'hub' : levelId;
  const row = FLYER_COUNTS[key];
  if (!row || (night && row[0] !== 'dragonfly')) return null;
  return { kind: row[0], count: Math.min(MAX, Math.max(0, Math.round(row[1] * (low ? 0.5 : 1)))) };
}

const VERT = /* glsl */`
attribute vec4 iPos;      // x, y, z, heading
attribute vec4 iLook;     // r, g, b, phase
attribute vec2 iSize;     // size, kind
uniform float uTime, uFlap, uAmp, uAlpha;
varying vec2 vUv;
varying vec3 vCol;
varying float vKind;
#include <fog_pars_vertex>
void main() {
  // position.x: 0..±1 along the wing span (sign = side), position.z: −1..1 along the body
  float side = sign( position.x + 1e-4 );
  float span = abs( position.x );
  float a = ( 0.35 + 0.65 * sin( uTime * uFlap + iLook.w * 6.2831 ) ) * uAmp;
  vec3 p = vec3( position.x * cos( a ), span * sin( a ), position.z );
  p *= iSize.x;
  float c = cos( iPos.w ), s = sin( iPos.w );
  p = vec3( c * p.x + s * p.z, p.y, -s * p.x + c * p.z ) + iPos.xyz;
  vUv = vec2( span, position.z );
  vCol = iLook.rgb;
  vKind = iSize.y;
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vCol;
varying float vKind;
#include <fog_pars_fragment>
${FOG_FACTOR}
float ell( vec2 p, vec2 c, vec2 r ) { return length( ( p - c ) / r ) - 1.0; }
void main() {
  vec2 p = vUv;            // x 0..1 out from the body, y −1..1 head → tail
  float d, shade = 1.0;
  if ( vKind < 0.5 ) {                            // butterfly: a big fore lobe and a smaller hind lobe + a body sliver
    d = min( ell( p, vec2( 0.52, 0.32 ), vec2( 0.5, 0.5 ) ), ell( p, vec2( 0.42, -0.42 ), vec2( 0.38, 0.36 ) ) );
    shade = 0.82 + 0.3 * smoothstep( 0.2, 0.75, p.x ) - 0.25 * ( 1.0 - smoothstep( 0.0, 0.12, p.x ) );
    float spot = 1.0 - smoothstep( 0.08, 0.13, length( p - vec2( 0.62, 0.36 ) ) );
    shade += 0.3 * spot;
  } else if ( vKind < 1.5 ) {                     // dragonfly: two long, thin glassy blades
    d = min( ell( p, vec2( 0.5, 0.22 ), vec2( 0.52, 0.12 ) ), ell( p, vec2( 0.48, -0.05 ), vec2( 0.48, 0.11 ) ) );
    shade = 0.9 + 0.2 * p.x;
  } else {                                        // swallow: a swept sickle wing
    d = ell( p, vec2( 0.5, 0.15 - 0.35 * p.x ), vec2( 0.55, 0.16 ) );
    shade = 0.85 + 0.25 * ( 1.0 - p.x );
  }
  float a = ( 1.0 - smoothstep( -0.08, 0.04, d ) ) * uAlpha * ( vKind > 0.5 && vKind < 1.5 ? 0.7 : 1.0 );
  if ( a < 0.02 ) discard;
  vec3 col = vCol * shade;
  gl_FragColor = vec4( mix( col, fxFogColor(), fxFog() ), a );
  ${OUTPUT}
}`;

const _p = new THREE.Vector3();

export class Butterflies {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = null;
    this.set = null;            // { kind, count }
    this.count = 0;
    this.alpha = 0;             // eased visibility (arena / night / mode)
    this.arena = false;
    this._offs = [];
    this._home = new Float32Array(MAX * 4);   // home x, z (tile offsets 0..1), height pick, speed jitter
  }

  init(scene) {
    // two wing quads per instance: right (x 0..1) and left (x 0..−1), z −1..1
    const g = new THREE.InstancedBufferGeometry();
    const pos = new Float32Array([0, 0, -1, 1, 0, -1, 1, 0, 1, 0, 0, 1, -0.0001, 0, -1, -1, 0, -1, -1, 0, 1, -0.0001, 0, 1]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iLook = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.iSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    g.setAttribute('iPos', this.iPos); g.setAttribute('iLook', this.iLook); g.setAttribute('iSize', this.iSize);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: 'fx.butterflies', vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uTime: { value: 0 }, uFlap: { value: 14 }, uAmp: { value: 1 }, uAlpha: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.butterflies';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 5; this.mesh.visible = false;
    scene.add(this.mesh);
    for (let i = 0; i < MAX; i++) {
      this._home[i * 4] = hash01(i * 11 + 3); this._home[i * 4 + 1] = hash01(i * 11 + 4);
      this._home[i * 4 + 2] = hash01(i * 11 + 5); this._home[i * 4 + 3] = 0.75 + 0.5 * hash01(i * 11 + 6);
    }
    const bus = this.ctx.bus;
    if (bus) this._offs.push(bus.on(E.ARENA_LOCK, () => { this.arena = true; }), bus.on(E.ARENA_CLEAR, () => { this.arena = false; }),
      bus.on(E.LEVEL_UNLOAD, () => { this.arena = false; }));
  }

  /** Choose the flyer set for a level (FX._onLevel / quality / env changes). */
  setLevel(levelId, opts = {}) {
    this.set = flyersFor(levelId, opts);
    this.count = this.set?.count ?? 0;
    if (!this.mesh) return;
    this.geometry.instanceCount = this.count;
    if (!this.set) { this.mesh.visible = false; return; }
    const F = FLYERS[this.set.kind], L = this.iLook.array, Sz = this.iSize.array, c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      c.set(F.colors[i % F.colors.length]);
      L[i * 4] = c.r; L[i * 4 + 1] = c.g; L[i * 4 + 2] = c.b; L[i * 4 + 3] = hash01(i * 7 + 1);
      Sz[i * 2] = F.size * (0.85 + 0.3 * hash01(i * 7 + 2)); Sz[i * 2 + 1] = F.kind;
    }
    this.iLook.needsUpdate = true; this.iSize.needsUpdate = true;
    const u = this.material.uniforms;
    u.uFlap.value = F.flap; u.uAmp.value = F.amp;
  }

  render(dt) {
    if (!this.mesh || !this.set || !this.count) return;
    const ctx = this.ctx, mode = ctx.game?.mode;
    const want = !this.arena && mode !== 'menu' ? 1 : 0;
    this.alpha += (want - this.alpha) * (dt > 0 ? 1 - Math.exp(-3 * dt) : 0);
    if (want === 0 && this.alpha < 0.01) this.alpha = 0;
    this.mesh.visible = this.alpha > 0.01;
    if (!this.mesh.visible) return;
    const F = FLYERS[this.set.kind], time = ctx.game?.realTime ?? 0;
    const f = ctx.cam?.footprint, foc = ctx.cam?.focus ?? ctx.player?.pos ?? ctx.camera?.position;
    const cx = Number.isFinite(f?.cx) ? f.cx : foc?.x ?? 0, cz = Number.isFinite(f?.cz) ? f.cz : foc?.z ?? 0, cy = foc?.y ?? 0;
    const pl = ctx.player?.object3d?.position ?? ctx.player?.pos ?? null, ph = (ctx.player?.height ?? 1) * 1.12;
    const P = this.iPos.array, H = this._home;
    for (let i = 0; i < this.count; i++) {
      // home: a point in a TILE-wide square that wraps around the focus (always over the visible ground)
      const hx = H[i * 4] * TILE, hz = H[i * 4 + 1] * TILE;
      const bx = cx + (((hx - cx) % TILE) + TILE * 1.5) % TILE - TILE / 2, bz = cz + (((hz - cz) % TILE) + TILE * 1.5) % TILE - TILE / 2;
      const sp = F.speed / F.wander * H[i * 4 + 3], ph0 = H[i * 4 + 2] * 6.28;
      let x = bx + Math.sin(time * sp + ph0) * F.wander, z = bz + Math.sin(time * sp * 0.73 + ph0 * 1.7) * F.wander * 0.8;
      // heading = the derivative of the Lissajous
      const vx = Math.cos(time * sp + ph0), vz = 0.73 * 0.8 * Math.cos(time * sp * 0.73 + ph0 * 1.7);
      const h = F.h[0] + (F.h[1] - F.h[0]) * H[i * 4 + 2] + 0.25 * Math.sin(time * 1.7 + ph0);
      let y = groundY(ctx, x, z, cy) + h;
      // never within 1.2 m of her head
      if (pl) {
        _p.set(x - pl.x, y - (pl.y + ph), z - pl.z);
        const d = _p.length();
        if (d < HEAD_CLEAR) { const k = (HEAD_CLEAR - d) / Math.max(d, 1e-3); x += _p.x * k; y += Math.max(0, _p.y * k) + 0.2; z += _p.z * k; }
      }
      P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = Math.atan2(vx, vz);
    }
    this.iPos.needsUpdate = true;
    const u = this.material.uniforms;
    u.uTime.value = time; u.uAlpha.value = this.alpha;
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
    this.mesh?.removeFromParent(); this.geometry?.dispose(); this.material?.dispose();
    this.mesh = null;
  }
}
