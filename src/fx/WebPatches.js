// src/fx/WebPatches.js  (owner: fx) — Bramble Spider web patches (GAME_DESIGN §10.3 `spider_web`: "Leaves a web patch
// r 1.0 for 8 s with the same slow; one slash cuts a patch"; forest `hollow`: 6 web patch decals r 1.0).
// Visuals only: enemies / world own the slow and the cut test; they call `ctx.fx.webPatch(pos, {r, life})` and keep the
// handle (`cut()` when slashed, `remove()` when the level drops it). One instanced draw call for every patch (≤ 32).
import * as THREE from 'three';
import { FOG_FACTOR, NOISE, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { SHAPE, FADE } from './Particles.js';

export const WEB = Object.freeze({ max: 32, r: 1.0, life: 8, fadeIn: 0.25, fadeOut: 0.6, cutFade: 0.3, color: '#E9EEF2' });

/**
 * Patch opacity at age t (pure, unit-tested): fades in over 0.25 s, holds, fades out over the last 0.6 s of `life`
 * (Infinity = permanent decal), and over 0.3 s after a cut at `cutT` (≥ 0).
 */
export function webAlpha(t, life = WEB.life, cutT = -1) {
  if (t < 0) return 0;
  let a = Math.min(1, t / WEB.fadeIn);
  if (Number.isFinite(life)) a = Math.min(a, Math.max(0, (life - t) / WEB.fadeOut));
  if (cutT >= 0) a = Math.min(a, Math.max(0, 1 - (t - cutT) / WEB.cutFade));
  return a;
}

const VERT = /* glsl */`
attribute vec4 iPos;     // xyz centre, r
attribute vec4 iPar;     // rotation, alpha, seed, cut (0..1 tear)
varying vec2 vUv;
varying vec3 vPar;
#include <fog_pars_vertex>
void main() {
  vUv = position.xy * 2.0;
  float cs = cos( iPar.x ), sn = sin( iPar.x );
  vec2 q = vec2( cs * position.x - sn * position.y, sn * position.x + cs * position.y ) * 2.0 * iPos.w;
  vec4 mvPosition = modelViewMatrix * vec4( iPos.x + q.x, iPos.y, iPos.z + q.y, 1.0 );
  vPar = iPar.yzw;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vPar;
#include <fog_pars_fragment>
${FOG_FACTOR}
${NOISE}
void main() {
  float r = length( vUv );
  if ( r > 1.0 ) discard;
  float seed = vPar.y, cut = vPar.z;
  float ang = atan( vUv.y, vUv.x );
  float N = 9.0;
  // spokes, slightly irregular
  float sector = ang / 6.2831853 * N + seed;
  float sid = floor( sector );
  float jit = ( fxHash( vec2( sid, seed ) ) - 0.5 ) * 0.25;
  float fs = fract( sector ) - 0.5 - jit;
  float spokeD = abs( fs ) * r * 6.2831853 / N;
  float spoke = 1.0 - smoothstep( 0.012, 0.03, spokeD );
  // the spiral: rings that sag between spokes
  float sag = 0.06 * ( 1.0 - cos( fract( sector ) * 6.2831853 ) ) * 0.5;
  float rr = ( r + sag ) * 7.0 + ang / 6.2831853;
  float ringD = abs( fract( rr ) - 0.5 ) / 7.0;
  float ring = ( 1.0 - smoothstep( 0.009, 0.022, ringD ) ) * smoothstep( 0.12, 0.2, r );
  // dew beads on the threads
  float bead = ( 1.0 - smoothstep( 0.0, 0.03, length( vec2( spokeD, ringD * 3.0 ) ) ) ) * step( 0.6, fxHash( vec2( sid, floor( rr ) ) ) );
  float web = max( max( spoke, ring ), bead );
  // torn: a cut shreds the web from a random chord outward
  float tear = step( cut * 1.4, fxNoise( vUv * 4.0 + seed ) + 0.1 );
  float edge = 1.0 - smoothstep( 0.82, 1.0, r );
  float a = web * edge * vPar.x * tear * ( 0.55 + 0.45 * fxNoise( vUv * 9.0 + seed * 3.0 ) );
  if ( a < 0.01 ) discard;
  vec3 col = uColor * ( 1.0 + bead * 0.8 );
  col = mix( col, fxFogColor(), fxFog() * 0.5 );
  gl_FragColor = vec4( col, min( 1.0, a * 1.1 ) );
  ${OUTPUT}
}`;

const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class WebPatches {
  /** @param {any} ctx @param {{ particles: any, groundY: (x:number, z:number, fb:number) => number, rng: () => number }} o */
  constructor(ctx, { particles, groundY, rng }) {
    this.ctx = ctx; this.particles = particles; this.groundY = groundY; this.rng = rng;
    this.list = [];
    this.made = 0; this.cuts = 0;
    const n = WEB.max;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iPar', this.aPar);
    g.instanceCount = 0;
    this.material = fxShaderMaterial({
      name: 'fx.web', vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: new THREE.Color(WEB.color) } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.web';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
  }

  attach(scene) { scene.add(this.mesh); }

  get count() { return this.list.length; }

  /**
   * Lay a web patch on the ground at `pos`. Options: r (1.0), life (8 s; Infinity for level dressing), rot.
   * → handle { alive, pos, r, cut(), remove() }.
   */
  add(pos, o = {}) {
    if (this.list.length >= WEB.max) this.list[0].handle.remove();
    const p = new THREE.Vector3(pos.x, 0, pos.z);
    p.y = this.groundY(p.x, p.z, pos.y) + 0.07;
    const e = { pos: p, r: Math.max(0.2, o.r ?? WEB.r), life: o.life ?? WEB.life, t: 0, cutT: -1, rot: o.rot ?? this.rng() * Math.PI * 2, seed: this.rng() * 30, handle: null };
    const self = this;
    e.handle = {
      pos: p, r: e.r,
      get alive() { return self.list.includes(e) && e.cutT < 0; },
      cut() { if (e.cutT < 0 && self.list.includes(e)) { e.cutT = e.t; self.cuts++; self.shreds(p, e.r); } },
      remove() { const i = self.list.indexOf(e); if (i >= 0) self.list.splice(i, 1); },
    };
    this.list.push(e);
    this.made++;
    return e.handle;
  }

  /** Strands torn loose when a patch is cut (also burst 'webCut'). */
  shreds(pos, r = 1) {
    _p.copy(pos); _p.y += 0.15;
    this.particles.burst(_p, { n: Math.round(10 * r), shape: SHAPE.FEATHER, color: WEB.color, alpha: 0.85, size: [0.12, 0.22], life: [0.6, 1.0],
      speed: [1.0, 2.4], up: 1.2, spread: Math.PI, gravity: 1.5, drag: 2.6, spin: 7, fade: FADE.HOLD, jitter: 0.5 * r });
    this.particles.burst(_p, { additive: true, n: 6, shape: SHAPE.STAR4, color: '#FFFFFF', intensity: 1.4, size: [0.08, 0.14], sizeEnd: 0.3,
      life: [0.3, 0.5], speed: [0.8, 1.6], spread: Math.PI, drag: 2.5, fade: FADE.TWINKLE, jitter: 0.4 * r });
  }

  /** The web glob splat where a spider_web projectile lands / hits her (also burst 'web'). */
  splat(pos, S = 1) {
    this.particles.burst(pos, { n: Math.round(9 * S), shape: SHAPE.SPARK, color: WEB.color, alpha: 0.9, size: [0.05, 0.08], life: [0.25, 0.4],
      speed: [2.5, 4.5], spread: Math.PI, gravity: 3, drag: 4, stretch: 4, fade: FADE.LINEAR });
    this.particles.burst(pos, { n: Math.round(5 * S), shape: SHAPE.PUFF, color: '#DDE3E0', alpha: 0.6, size: [0.12, 0.2], sizeEnd: 1.8, life: [0.35, 0.5],
      speed: [0.3, 0.8], dir: _up, spread: 1.2, drag: 3, fade: FADE.HOLD });
  }

  render(dt) {
    const L = this.list, P = this.aPos.array, R = this.aPar.array;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      e.t += dt;
      if ((Number.isFinite(e.life) && e.t >= e.life) || (e.cutT >= 0 && e.t - e.cutT >= WEB.cutFade)) { L.splice(i, 1); continue; }
    }
    for (const e of L) {
      const a = webAlpha(e.t, e.life, e.cutT);
      const i4 = n * 4;
      P[i4] = e.pos.x; P[i4 + 1] = e.pos.y; P[i4 + 2] = e.pos.z; P[i4 + 3] = e.r;
      R[i4] = e.rot; R[i4 + 1] = a; R[i4 + 2] = e.seed; R[i4 + 3] = e.cutT >= 0 ? Math.min(1, (e.t - e.cutT) / WEB.cutFade) : 0;
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      for (const A of [this.aPos, this.aPar]) { A.clearUpdateRanges(); A.addUpdateRange(0, n * 4); A.needsUpdate = true; }
    }
  }

  clear() { this.list.length = 0; this.mesh.geometry.instanceCount = 0; this.mesh.visible = false; }

  dispose() { this.clear(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); }
}
