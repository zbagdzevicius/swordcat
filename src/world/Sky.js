// src/world/Sky.js  (owner: world) — gradient sky dome (art.md §9.1: horizon colour == fog colour so the meadow
// melts into the sky), a soft sun glow, slow low-contrast cloud banks, and "far dressing" helpers: fog-proof flat
// silhouettes (§12.3 Pawsbury skyline: fog:false, a flat colour 70% of the way to the current fog colour) and
// warm emissive glow sprites (the Dawnstone). Env owns the colours and drives `update()`. No DOM at import.
import * as THREE from 'three';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;            // always at the far plane
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uTop, uHorizon, uGround, uSunColor;
uniform vec3 uSunDir;
uniform float uSunGlow, uTime, uClouds, uExposure;
varying vec3 vDir;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // top → horizon (the horizon band is exactly the fog colour), below the horizon stay at the fog colour
  float t = smoothstep(0.0, 0.55, h);
  vec3 col = mix(uHorizon, uTop, pow(t, 0.8));
  // slow cloud banks (low contrast, only above the horizon)
  vec2 uv = d.xz / max(0.12, h + 0.25);
  float c = fbm(uv * 1.6 + vec2(uTime * 0.004, uTime * 0.0025));
  float band = smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.55, 0.95, h));
  col = mix(col, col * 1.06 + 0.015, smoothstep(0.45, 0.8, c) * band * uClouds);
  col = mix(col, col * 0.93, smoothstep(0.55, 0.3, c) * band * uClouds * 0.6);
  // soft sun glow
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 8.0) * 0.18 + pow(sd, 64.0) * 0.35) * uSunGlow * smoothstep(-0.05, 0.1, h);
  gl_FragColor = vec4(col * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The sky dome (BackSide sphere that follows the camera; rendered first; never fogged). */
export class SkyDome {
  constructor(radius = 450) {
    this.uniforms = {
      uTop: { value: new THREE.Color('#C3CCD3') }, uHorizon: { value: new THREE.Color('#B7C0C3') }, uGround: { value: new THREE.Color('#4A5230') },
      uSunColor: { value: new THREE.Color('#FFF2E0') }, uSunDir: { value: new THREE.Vector3(-0.5, 0.6, 0.6) },
      uSunGlow: { value: 1 }, uTime: { value: 0 }, uClouds: { value: 1 }, uExposure: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: true,
    });
    this.material.userData.noHeightFog = true;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.userData.owned = true;
  }

  /** Follow the camera (call per frame). */
  update(camera, time) {
    this.mesh.position.copy(camera.position);
    this.uniforms.uTime.value = time;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); }
}

/**
 * Far silhouettes that stay readable at any fog density: `fog: false`, unlit, colour = mix(base, fogColor, k).
 * Add meshes with `add(object)`; call `update(fogColor)` per frame.
 */
export class Silhouettes {
  constructor({ base = '#3D454C', toFog = 0.7 } = {}) {
    this.base = new THREE.Color(base);
    this.toFog = toFog;
    this.material = new THREE.MeshBasicMaterial({ color: base, fog: false });
    this.material.userData.noHeightFog = true;
    this.group = new THREE.Group(); this.group.name = 'skyline';
  }

  /** Re-material every mesh under `obj` with the shared silhouette material (casts no shadow). */
  add(obj) {
    obj.traverse((o) => { if (o.isMesh) { o.material = this.material; o.castShadow = false; o.receiveShadow = false; o.renderOrder = -10; } });
    this.group.add(obj);
    return obj;
  }

  update(fogColor) { this.material.color.copy(this.base).lerp(fogColor, this.toFog); }

  dispose() { this.material.dispose(); }
}

let _glowTex = null;
/** Radial glow texture (lazy; needs a canvas). */
export function glowTexture() {
  if (_glowTex) return _glowTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

/**
 * A warm emissive glow sprite that ignores fog (the Dawnstone at `bell_far`, lantern halos).
 * `intensity` > 1 pushes it into bloom.
 */
export function makeGlowSprite({ color = '#FFC46B', size = 6, intensity = 2.5, fog = false } = {}) {
  const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, fog });
  mat.userData.noHeightFog = true;
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = 5;
  s.userData.owned = true;
  return s;
}
