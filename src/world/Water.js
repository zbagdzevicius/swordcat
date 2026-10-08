// src/world/Water.js  (owner: world) — GAME_DESIGN §18.3 water: MeshStandardMaterial #2F3B33, roughness 0.12, with a
// procedural scrolling normal (no texture), so the overcast PMREM sky and the fog colour reflect in it. One mesh per
// water entry of a level (`water: [{ kind: 'stream' | 'rect' | 'disc' | 'plane', ... }]`, Appendix B.1):
//   stream { from, to (or pts), width, y, deep, flow? }   a strip along the polyline, 3 m wider each side (the banks
//                                                         hide the edges)
//   rect { at, size, yaw?, y } · disc { at, r, y } · plane { y } (covers the level)
// Visual only; physics / player read Level.waterLevelAt / isDeepWater. No DOM at import.
import * as THREE from 'three';

const WATER_VERT_PARS = /* glsl */`
varying vec3 vWWorld;
`;
const WATER_FRAG_PARS = /* glsl */`
uniform float uWTime, uWWind;
uniform vec2 uWFlow;
varying vec3 vWWorld;
float wH(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float wN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wH(i), wH(i + vec2(1.0, 0.0)), f.x), mix(wH(i + vec2(0.0, 1.0)), wH(i + vec2(1.0, 1.0)), f.x), f.y); }
float wF(vec2 p) { return wN(p) * 0.55 + wN(p * 2.13 + 3.7) * 0.3 + wN(p * 4.7 - 1.3) * 0.15; }
`;
const WATER_FRAG_NORMAL = /* glsl */`
#include <normal_fragment_maps>
{
  vec2 wp = vWWorld.xz * 0.9;
  vec2 fl = uWFlow * uWTime * 0.35;
  float e = 0.08;
  vec2 q = wp + fl, r = wp * 1.7 - fl * 1.3 + vec2(uWTime * 0.05, 0.0);
  float h0 = wF(q) + 0.5 * wF(r);
  float hx = wF(q + vec2(e, 0.0)) + 0.5 * wF(r + vec2(e * 1.7, 0.0));
  float hz = wF(q + vec2(0.0, e)) + 0.5 * wF(r + vec2(0.0, e * 1.7));
  float k = 0.55 * (0.6 + 0.4 * uWWind);
  vec3 wn = normalize(vec3(-(hx - h0) / e * k, 1.0, -(hz - h0) / e * k));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;

/** Shared water material (one program for every water mesh of a level). */
export function makeWaterMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: '#2F3B33', roughness: 0.12, metalness: 0.0, envMapIntensity: 1.1 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + WATER_VERT_PARS)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WATER_FRAG_PARS)
      .replace('#include <normal_fragment_maps>', WATER_FRAG_NORMAL);
  };
  m.customProgramCacheKey = () => 'world-water-v1';
  m.userData.owned = true;
  return m;
}

/** Strip geometry along a polyline [[x, z], ...] of width `w` (y = 0). */
export function stripGeometry(pts, w) {
  const pos = [], idx = [], hw = w / 2;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    pos.push(pts[i][0] + nx * hw, 0, pts[i][1] + nz * hw, pts[i][0] - nx * hw, 0, pts[i][1] - nz * hw);
    if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // force the normals up (winding-independent)
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export class WaterSet {
  /** @param {any[]} entries level water entries @param {number} levelSize */
  constructor(entries, levelSize = 200) {
    this.group = new THREE.Group(); this.group.name = 'water';
    this.uniforms = { uWTime: { value: 0 }, uWWind: { value: 0.6 }, uWFlow: { value: new THREE.Vector2(1, 0) } };
    this.material = makeWaterMaterial(this.uniforms);
    this.meshes = [];
    for (const w of entries ?? []) {
      let g = null;
      const y = Number.isFinite(w.y) ? w.y : 0;
      if (w.kind === 'stream') {
        const pts = w.pts ?? [w.from, w.to];
        g = stripGeometry(pts, (w.width ?? 6) + 6);
        const a = pts[0], b = pts[pts.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        this.uniforms.uWFlow.value.set((b[0] - a[0]) / l * (w.flow ?? 1), (b[1] - a[1]) / l * (w.flow ?? 1));
      } else if (w.kind === 'rect') {
        g = new THREE.PlaneGeometry(w.size[0], w.size[1]).rotateX(-Math.PI / 2);
        if (w.yaw) g.rotateY(w.yaw);
        g.translate(w.at[0], 0, w.at[1]);
      } else if (w.kind === 'disc') {
        g = new THREE.CircleGeometry(w.r, 40).rotateX(-Math.PI / 2).translate(w.at[0], 0, w.at[1]);
      } else {
        g = new THREE.PlaneGeometry(levelSize * 1.6, levelSize * 1.6).rotateX(-Math.PI / 2);
      }
      const mesh = new THREE.Mesh(g, this.material);
      mesh.position.y = y;
      mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.name = 'water:' + (w.kind ?? 'plane');
      mesh.userData.owned = true; mesh.userData.camFade = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  get count() { return this.meshes.length; }

  update(time, env) {
    this.uniforms.uWTime.value = time;
    this.uniforms.uWWind.value = env?.wind ?? 0.6;
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
