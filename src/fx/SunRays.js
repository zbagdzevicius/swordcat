// src/fx/SunRays.js  (owner: fx) — the Golden Hour sunburst look (GAME_DESIGN §7.5, art.md ref1: "the whole silhouette
// has an intense golden glow / halo"). A camera-facing radial god-ray disc placed just BEHIND her (relative to the lens),
// so her body occludes the centre and the rays fan out around the silhouette, like the sun setting behind a little knight.
//   'open'   Golden Hour activation (0.8 s): the rays bloom open to 2.4 m (4x her height), then settle
//   'hold'   while Golden Hour lasts: a calm, slowly turning halo (1.7 m) that breathes
//   'burst'  the end-of-Golden-Hour Sunburst: rays flare out to 7 m and fade in 0.6 s
// Kept subtle on purpose: it is additive over bright fog, and the bloom (1.2 in Golden Hour) does the rest.
// Two pooled billboards (one follows her, one stays where the Sunburst went off). Each visible one is one draw call.
import * as THREE from 'three';
import { FOG_FACTOR, NOISE, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';

/** Size (m) and intensity of the rays for a mode at time t (pure, unit-tested). null = finished. */
export function sunRayEnvelope(mode, t) {
  if (t < 0) return { size: 0, intensity: 0 };
  switch (mode) {
    case 'open': {
      if (t >= 1.2) return sunRayEnvelope('hold', t - 1.2 + 0.6);
      const u = Math.min(1, t / 0.8), e = 1 - (1 - u) ** 3;
      const settle = t > 0.8 ? (t - 0.8) / 0.4 : 0;
      return { size: 2.4 * e + (1.7 - 2.4) * settle, intensity: 0.5 * Math.min(1, t / 0.12) * (1 - settle) + 0.3 * settle };
    }
    case 'hold': {
      const fadeIn = Math.min(1, t / 0.6);
      return { size: 1.7 + 0.08 * Math.sin(t * 2.2), intensity: (0.3 + 0.05 * Math.sin(t * 3.1)) * Math.max(fadeIn, 0.5) };
    }
    case 'burst': {
      if (t >= 0.6) return null;
      const u = t / 0.6, e = 1 - (1 - u) ** 2;
      return { size: 1.6 + 5.4 * e, intensity: 0.55 * Math.min(1, t / 0.05) * (1 - u) ** 1.5 };
    }
    case 'close': {
      if (t >= 0.4) return null;
      return { size: 1.7 * (1 - t / 0.4 * 0.3), intensity: 0.3 * (1 - t / 0.4) };
    }
    default: return null;
  }
}

const VERT = /* glsl */`
uniform float uSize;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = position.xy * 2.0;
  vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  mvPosition.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uI, uTime, uSeed;
varying vec2 vUv;
#include <fog_pars_fragment>
${FOG_FACTOR}
${NOISE}
void main() {
  float r = length( vUv );
  if ( r > 1.0 ) discard;
  float ang = atan( vUv.y, vUv.x ) / 6.2831853 + 0.5;
  // two layers of rays turning in opposite directions; broad + fine
  float a1 = fxNoise( vec2( ang * 18.0 + uTime * 0.25 + uSeed, 0.5 ) );
  float a2 = fxNoise( vec2( ang * 41.0 - uTime * 0.4 + uSeed * 2.0, 3.5 ) );
  float rays = pow( clamp( a1 * 0.65 + a2 * 0.45, 0.0, 1.0 ), 3.0 ) * 1.2;
  float fall = ( 1.0 - smoothstep( 0.15, 1.0, r ) );
  fall *= fall;
  float core = exp( -r * r * 14.0 );
  float a = ( rays * fall * smoothstep( 0.04, 0.2, r ) + core * 0.45 ) * uI;
  if ( a < 0.003 ) discard;
  vec3 col = mix( uColor, vec3( 1.0, 0.97, 0.88 ), core * 0.7 + rays * fall * 0.2 );
  gl_FragColor = vec4( col * a * ( 1.0 - fxFog() * 0.7 ), 1.0 );
  ${OUTPUT}
}`;

const _p = new THREE.Vector3(), _d = new THREE.Vector3();

class RayDisc {
  constructor(name) {
    this.material = fxShaderMaterial({
      name, vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uSize: { value: 1 }, uColor: { value: new THREE.Color('#FFC85A') }, uI: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.visible = false;
    this.mode = null; this.t = 0; this.actor = null;
  }
}

export class SunRays {
  constructor(ctx, rng = Math.random) {
    this.ctx = ctx; this.rng = rng;
    this.follow = new RayDisc('fx.sunrays');
    this.fixed = new RayDisc('fx.sunrays.burst');
    this.opened = 0; this.bursts = 0;
  }

  attach(scene) { scene.add(this.follow.mesh, this.fixed.mesh); }

  get mode() { return this.follow.mesh.visible ? this.follow.mode : null; }

  /** Golden Hour on: open the halo behind `actor`. */
  open(actor) {
    const f = this.follow;
    f.actor = actor; f.mode = 'open'; f.t = 0; f.mesh.visible = true;
    f.material.uniforms.uSeed.value = this.rng() * 20;
    this.opened++;
  }

  /** Golden Hour off without a Sunburst (hit by a cutscene, death): close softly. */
  close() { const f = this.follow; if (f.mesh.visible && f.mode !== 'close') { f.mode = 'close'; f.t = 0; } }

  /** The Sunburst flare at a world position (her feet). */
  burst(pos) {
    const b = this.fixed;
    b.mode = 'burst'; b.t = 0; b.mesh.visible = true;
    b.mesh.position.set(pos.x, pos.y + 0.9, pos.z);
    b.material.uniforms.uSeed.value = this.rng() * 20;
    this.close();
    this.bursts++;
  }

  render(dt, time) {
    const cam = this.ctx.camera;
    for (const d of [this.follow, this.fixed]) {
      if (!d.mesh.visible) continue;
      d.t += dt;
      const env = sunRayEnvelope(d.mode, d.t);
      if (!env || (d === this.follow && (!d.actor?.object3d?.parent || d.actor.alive === false))) { d.mesh.visible = false; d.mode = null; continue; }
      const u = d.material.uniforms;
      u.uI.value = env.intensity; u.uTime.value = time;
      if (d === this.follow) {
        const a = d.actor, o = a.object3d;
        if (o.parent && !o.parent.isScene) { o.updateWorldMatrix(true, false); _p.setFromMatrixPosition(o.matrixWorld); } else _p.copy(o.position);
        _p.y += (a.height ?? 1) * 0.6;
        // just behind her as seen from the lens: her silhouette occludes the core
        if (cam) { _d.subVectors(_p, cam.position); _d.y = 0; const l = _d.length(); if (l > 1e-3) _p.addScaledVector(_d, 0.6 / l); }
        d.mesh.position.copy(_p);
      }
      // never fill the lens (the Golden Hour camera punches in close): cap the disc to ~the visible frame height
      let size = env.size;
      if (cam?.isPerspectiveCamera) {
        const dist = Math.max(0.5, cam.position.distanceTo(d.mesh.position));
        size = Math.min(size, 2 * dist * Math.tan((cam.fov * Math.PI) / 360) * 0.6);
      }
      u.uSize.value = size;
    }
  }

  clear() { for (const d of [this.follow, this.fixed]) { d.mesh.visible = false; d.mode = null; d.actor = null; } }

  dispose() { for (const d of [this.follow, this.fixed]) { d.mesh.removeFromParent(); d.mesh.geometry.dispose(); d.material.dispose(); } }
}
