// src/world/Dressing.js  (owner: world) — shared M2 level dressing (GAME_DESIGN §12.4–§12.6, art.md §9 / §12):
//   LightPool        the level's lit sources (torches, the campfire, lit lanterns, gate lamps) registered as lamp
//                    pools: Env writes the 4 nearest the iso focus into ENV_U.uLamps (K2 / PERF §8.2: no PointLights,
//                    so lighting a lantern or the forest day → night switch only changes uniforms, never a program)
//   FlameSet/addFlame every flame of a level in 2 instanced draws (additive cones + billboard halos, shader flicker),
//                    each registered as a lamp source
//   Fireflies        drifting additive points around the camera (forest `#E8FF9A`, brighter at night)
//   paveRibbons      textured street / deck ribbons that follow the terrain (town cobbles `pavingstones070`)
//   texturedMaterial a vertex-coloured Lambert (toon-patched) material with a world-UV colour map (awaited with a timeout)
//   ropeLine         a sagging rope between two points (a thin tube)
// Everything is `userData.owned` (LevelManager disposes it with the level); shared textures are never disposed.
import * as THREE from 'three';
import { LampSet } from './Env.js';
import { FOG_FACTOR, OUTPUT, fxModule, fxShaderMaterial } from '../fx/shaders.js';

const _v = new THREE.Vector3(), _c = new THREE.Color();

/** Await a promise for at most `ms` (textures in node reject fast; a stalled fetch never blocks a level build). */
export function within(p, ms = 4000) {
  return Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
}

/**
 * A vertex-coloured standard material with a repeating colour map (world-UV geometry). `tint` multiplies the map;
 * `mapMix` (0..1) blends the photo map toward its luminance × tint so it sits in the soft palette; `joint` (> 0)
 * lifts the map's darkest values (mortar joints, cracks) toward that pale level (linear, before `gain`) over the map
 * luminance band `jointLo`..`jointHi`, so a dark-jointed photo texture reads as pale-mortared blocks from the iso camera.
 */
export async function texturedMaterial(ctx, path, { tint = '#FFFFFF', mapMix = 0.65, roughness = 0.95, key = 'tex', gain = 1.15, joint = 0, jointLo = 0.03, jointHi = 0.1, contrast = 1 } = {}) {
  // ART §4.2: Lambert + the global toon patch (no Standard in play); `roughness` is accepted for old callers and ignored
  void roughness;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(tint) });
  m.dithering = true;
  m.userData.owned = true;
  const tex = path && ctx?.assets?.texture ? await within(ctx.assets.texture(path, { srgb: true, repeat: true })) : null;
  if (tex) {
    m.map = tex;
    // LI §4.3 / ART §8.3 rule 5: kept textures read as soft pattern, not noise (contrast squeezed around the mid-grey).
    // PERF §1.2: mix / joint lift / contrast / gain are uniforms of ONE textured-world program (were key variants).
    const u = {
      uTexMix: { value: mapMix }, uTexGain: { value: gain }, uTexContrast: { value: contrast },
      uTexJoint: { value: new THREE.Vector3(joint > 0 ? joint : -1, jointLo, jointHi) },
    };
    m.userData.texU = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTexMix, uTexGain, uTexContrast;\nuniform vec3 uTexJoint;')
        .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  sampledDiffuseColor.rgb = mix(vec3(lum), sampledDiffuseColor.rgb, uTexMix);
  if ( uTexJoint.x >= 0.0 ) sampledDiffuseColor.rgb = mix(vec3(uTexJoint.x), sampledDiffuseColor.rgb, smoothstep(uTexJoint.y, uTexJoint.z, lum));
  sampledDiffuseColor.rgb = mix(vec3(0.5), sampledDiffuseColor.rgb, uTexContrast);
  sampledDiffuseColor.rgb *= uTexGain;
  diffuseColor *= sampledDiffuseColor;
#endif`);
    };
    m.customProgramCacheKey = () => 'world-tex-v2';
    void key;
  }
  return m;
}

/**
 * Textured ribbons along polylines that follow the ground (`heightAt`), plus flat discs (plazas). Returns a Mesh
 * (null when there is nothing to pave). UVs are world metres / `tile`. Edge vertices are jittered and darkened so the
 * ribbon melts into the verge instead of ending on a ruler line.
 * @param {{ lines?: {pts:number[][], width:number}[], discs?: number[][], heightAt:(x:number,z:number)=>number, tile?:number,
 *   lift?:number, cols?:number, color?:string, edge?:string, rng?:()=>number }} o
 */
export function paveGeometry(o) {
  const { heightAt, tile = 3, lift = 0.035, cols = 6 } = o;
  const rng = o.rng ?? Math.random;
  const base = new THREE.Color(o.color ?? '#FFFFFF'), edge = new THREE.Color(o.edge ?? '#8A8070');
  const pos = [], uv = [], col = [], idx = [];
  const push = (x, z, k) => {
    pos.push(x, heightAt(x, z) + lift, z); uv.push(x / tile, z / tile);
    _c.copy(base).lerp(edge, k); col.push(_c.r, _c.g, _c.b);
    return pos.length / 3 - 1;
  };
  for (const line of o.lines ?? []) {
    const pts = line.pts, w = line.width, n = pts.length;
    if (n < 2) continue;
    let prev = null;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz, nz = tx, row = [];
      for (let c = 0; c <= cols; c++) {
        const s = c / cols - 0.5, outer = c === 0 || c === cols;
        const off = s * w + (outer ? (rng() - 0.5) * 0.35 : 0);
        row.push(push(pts[i][0] + nx * off, pts[i][1] + nz * off, outer ? 0.55 : Math.abs(s) > 0.4 ? 0.2 : 0));
      }
      if (prev) for (let c = 0; c < cols; c++) idx.push(prev[c], row[c], prev[c + 1], prev[c + 1], row[c], row[c + 1]);
      prev = row;
    }
  }
  for (const [x, z, r] of o.discs ?? []) {
    const rings = Math.max(3, Math.ceil(r / 1.5)), seg = Math.max(16, Math.ceil(r * 5));
    const c0 = push(x, z, 0);
    let prev = null;
    for (let k = 1; k <= rings; k++) {
      const rr = (k / rings) * r, row = [];
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2, outer = k === rings, jr = outer ? (rng() - 0.5) * 0.4 : 0;
        row.push(push(x + Math.sin(a) * (rr + jr), z + Math.cos(a) * (rr + jr), outer ? 0.55 : 0));
      }
      for (let j = 0; j < seg; j++) {
        const j1 = (j + 1) % seg;
        if (!prev) idx.push(c0, row[j1], row[j]);
        else idx.push(prev[j], prev[j1], row[j], row[j], prev[j1], row[j1]);
      }
      prev = row;
    }
  }
  if (!idx.length) return null;
  // wind every triangle counter-clockwise seen from above (front faces up), whatever the ribbon's direction
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
    if (uz * vx - ux * vz < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // keep normals up (ribbons are almost flat; windings differ between ribbons and discs)
  const nr = g.attributes.normal;
  for (let i = 0; i < nr.count; i++) if (nr.getY(i) < 0) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
  g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.owned = true;
  return g;
}

/** paveGeometry → a receive-shadow mesh with a textured material (polygon offset over the ground). */
export async function paveRibbons(ctx, o) {
  const g = paveGeometry(o);
  if (!g) return null;
  const mat = await texturedMaterial(ctx, o.texture, { tint: o.tint ?? '#FFFFFF', mapMix: o.mapMix ?? 0.55, key: 'pave', contrast: o.contrast ?? 1, gain: o.gain ?? 1.15 });
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
  if (!o.texture || !mat.map) mat.color.set(o.tint ?? '#9C927C');
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = o.name ?? 'pave'; mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.userData.owned = true; mesh.userData.camFade = false;
  return mesh;
}

/**
 * The level's lamp sources (K2: no PointLights). Every source is a lamp pool in `ENV_U.uLamps`: Env picks the
 * `LAMPS.max` lit ones nearest the iso focus at 4 Hz (`lamps` = ctx.env.lamps; a private LampSet without an Env).
 * `n` / `distance` are kept for old level data (`def.lights`) and only set the default pool radius.
 */
export class LightPool {
  constructor(parent, n = 2, { distance = 9, lamps = null } = {}) {
    void parent;
    this.n = n;
    this.distance = distance;
    this.lamps = lamps ?? new LampSet();
    this.sources = [];
  }

  /** Register a source { pos: Vector3, color, intensity, distance?, on: bool, flicker?: 0..1 } and return it. */
  add(src) {
    const s = { on: true, flicker: 0.25, intensity: 1.6, color: '#FF9A4A', distance: this.distance, ...src };
    this.sources.push(s);
    this.lamps.add(s);
    return s;
  }

  /** Kept for old callers: Env updates the lamp uniforms itself. */
  update() {}

  /** Unregister every source (level unload). */
  dispose() { for (const s of this.sources) this.lamps.remove(s); this.sources.length = 0; }
}

/**
 * PERF §8.6 / W7 flames: every flame of a level lives in two InstancedMeshes (2 draws per level instead of 3 per
 * flame): the additive cone and the camera-facing glow halos (2 per flame). Flicker runs in the vertex shaders
 * from a per-instance phase (`uTime` is the only per-frame write); lighting / dousing writes one instance matrix.
 * `cap` is the initial capacity (doubles at build time if a level needs more); `glowHi` is the inner halo colour.
 */
export const FLAME = Object.freeze({ cap: 32, glowHi: '#FFE2A8', outer: 1.4, inner: 0.55, outerY: 0.15, innerY: 0.12, innerMul: 1.2,
  coneA: '#FF9A3D', coneB: '#FFEFB8', coneGain: 2.2, coneOpacity: 0.92 });

/** Radial halo profile (the old glow texture's stops: 0 → 1, 0.18 → 0.75, 0.45 → 0.22, 1 → 0), in the shader. */
const GLOW_VS = /* glsl */`
attribute vec2 aFl;
attribute vec3 aGlowCol;
uniform float uTime;
varying vec3 vCol;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  float sz = length(instanceMatrix[0].xyz);
  vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  mvPosition.xy += position.xy * sz;
  float f = 0.85 + 0.15 * sin(uTime * 17.0 + aFl.x) * sin(uTime * 9.1 + aFl.x * 1.7);
  vCol = aGlowCol * mix(1.0, 0.8 + 0.2 * f, aFl.y);
  vUv = uv;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GLOW_FS = /* glsl */`
varying vec3 vCol;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = r < 0.18 ? mix(1.0, 0.75, r / 0.18) : r < 0.45 ? mix(0.75, 0.22, (r - 0.18) / 0.27) : mix(0.22, 0.0, clamp((r - 0.45) / 0.55, 0.0, 1.0));
  vec3 col = vCol;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float ff = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float ff = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    col *= 1.0 - ff;                       // additive: fog fades the halo out instead of tinting it
  #endif
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Flame cones: vertex-coloured open cones with a per-flame flicker (`aPh`), additive, fogged. */
const CONE_VS = /* glsl */`
attribute vec3 color;
attribute float aPh;
uniform float uTime;
varying vec3 vCol;
#include <fog_pars_vertex>
void main() {
  vec3 transformed = position;
  float flk = 0.85 + 0.15 * sin(uTime * 17.0 + aPh) * sin(uTime * 9.1 + aPh * 1.7);
  transformed *= vec3(0.95 + 0.1 * sin(uTime * 11.0 + aPh), flk * 1.05, 0.95 + 0.1 * cos(uTime * 13.0 + aPh));
  vCol = color;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const CONE_FS = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vCol;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  gl_FragColor = vec4( mix( vCol * uColor, fxFogColor(), fxFog() ), uOpacity );
  ${OUTPUT}
}`;
// PERF §1.2: linked into the one fx program at import (flames are built per level, after it compiled)
fxModule({ name: 'flames', vertexShader: CONE_VS, fragmentShader: CONE_FS, side: THREE.DoubleSide, fog: true });
fxModule({ name: 'flameGlow', vertexShader: GLOW_VS, fragmentShader: GLOW_FS, fog: true });

/** Flame cone geometry: an outer orange and an inner cream open cone, vertex-coloured (one per FlameSet). */
function flameGeometry() {
  const outer = new THREE.ConeGeometry(0.11, 0.34, 7, 1, true).translate(0, 0.17, 0);
  const inner = new THREE.ConeGeometry(0.06, 0.2, 6, 1, true).translate(0, 0.1, 0);
  const pos = [], cols = [], a = new THREE.Color(FLAME.coneA), b = new THREE.Color(FLAME.coneB);
  for (const [g, c] of [[outer, a], [inner, b]]) {
    const ng = g.toNonIndexed(), p = ng.attributes.position;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); cols.push(c.r, c.g, c.b); }
    g.dispose(); ng.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

/**
 * A level's flames (see FLAME). `add(x, y, z, o)` → instance index; `set(i, on)` lights / douses one; the level
 * animator calls `update(t)`. Both meshes are fog-aware and cast / receive no shadow.
 */
export class FlameSet {
  /** @param {THREE.Object3D} parent  the level's props group */
  constructor(parent) {
    this.parent = parent;
    this.uniforms = { uTime: { value: 0 } };
    /** @type {{x:number,y:number,z:number,size:number,halo:number,color:THREE.Color,glow:number,ph:number,on:boolean}[]} */
    this.items = [];
    const u = this.uniforms;
    // PERF §1.2: cones and halos are modules of the linked fx program (were a patched Basic, drawn in two passes,
    // plus a ShaderMaterial: three programs); the cones keep their flicker, vertex colours and fog
    this.coneMat = fxShaderMaterial({
      name: 'flames', vertexShader: CONE_VS, fragmentShader: CONE_FS, side: THREE.DoubleSide, fog: true,
      uniforms: { uTime: u.uTime, uColor: { value: new THREE.Color().setScalar(FLAME.coneGain) }, uOpacity: { value: FLAME.coneOpacity } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.glowMat = fxShaderMaterial({
      name: 'flameGlow', vertexShader: GLOW_VS, fragmentShader: GLOW_FS, fog: true,
      uniforms: { uTime: u.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.coneMat.userData.noHeightFog = this.glowMat.userData.noHeightFog = true;   // fog lives in the modules
    this.coneGeo = flameGeometry();
    this.glowGeo = new THREE.PlaneGeometry(1, 1);
    this.cones = null; this.glows = null;
    this._alloc(FLAME.cap);
  }

  /** (Re)allocate both meshes with `cap` flames (copies the instances already added). */
  _alloc(cap) {
    const old = [this.cones, this.glows];
    this.cap = cap;
    const ph = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    const fl = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 2);
    this.coneGeo.setAttribute('aPh', ph);
    this.glowGeo.setAttribute('aFl', fl);
    this.cones = new THREE.InstancedMesh(this.coneGeo, this.coneMat, cap);
    this.glows = new THREE.InstancedMesh(this.glowGeo, this.glowMat, cap * 2);
    // the halo colour is a plain instanced attribute, not `instanceColor` (that would key a second fx program)
    this.glowCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 6), 3);
    this.glowGeo.setAttribute('aGlowCol', this.glowCol);
    for (const [m, name] of [[this.cones, 'flames'], [this.glows, 'flameGlow']]) {
      m.name = name; m.count = 0; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 5;
      m.userData.owned = true; m.userData.camFade = false; m.userData.perfCat = 'props';
      m.matrixAutoUpdate = false;
    }
    for (const m of old) if (m) { m.removeFromParent(); m.dispose?.(); }
    this.items.forEach((_, i) => this._write(i));
    this.parent.add(this.cones, this.glows);
  }

  /**
   * Add a flame. @returns {number} its index
   * @param {{size?:number, color?:string, glow?:number, halo?:number, on?:boolean}} [o]
   */
  add(x, y, z, { size = 1, color = '#FFB060', glow = 1.6, halo = 1, on = true } = {}) {
    if (this.items.length >= this.cap) this._alloc(this.cap * 2);
    const i = this.items.length;
    this.items.push({ x, y, z, size, halo, color: new THREE.Color(color), glow, ph: x * 0.73 + z * 1.31, on: !!on });
    this._write(i);
    this.cones.count = this.items.length; this.glows.count = this.items.length * 2;
    this.cones.computeBoundingSphere(); this.glows.computeBoundingSphere();
    return i;
  }

  /** Light (true) or douse (false) flame `i`: one matrix write per mesh, no program change. */
  set(i, on) {
    const it = this.items[i];
    if (!it || it.on === !!on) return;
    it.on = !!on;
    this._write(i);
  }

  /** Is flame `i` lit? */
  isOn(i) { return !!this.items[i]?.on; }

  _write(i) {
    const it = this.items[i], s = it.on ? it.size : 0, M = _m4;
    M.makeScale(s, s, s).setPosition(it.x, it.y, it.z);
    this.cones.setMatrixAt(i, M);
    const so = it.on ? FLAME.outer * it.size * it.halo : 0, si = it.on ? FLAME.inner * it.size : 0;
    M.makeScale(so, so, so).setPosition(it.x, it.y + FLAME.outerY * it.size, it.z);
    this.glows.setMatrixAt(i * 2, M);
    M.makeScale(si, si, si).setPosition(it.x, it.y + FLAME.innerY * it.size, it.z);
    this.glows.setMatrixAt(i * 2 + 1, M);
    _c.copy(it.color).multiplyScalar(it.glow); this.glowCol.setXYZ(i * 2, _c.r, _c.g, _c.b);
    _c.set(FLAME.glowHi).multiplyScalar(it.glow * FLAME.innerMul); this.glowCol.setXYZ(i * 2 + 1, _c.r, _c.g, _c.b);
    this.coneGeo.attributes.aPh.setX(i, it.ph); this.coneGeo.attributes.aPh.needsUpdate = true;
    const fl = this.glowGeo.attributes.aFl;
    fl.setXY(i * 2, it.ph, 1); fl.setXY(i * 2 + 1, it.ph, 0); fl.needsUpdate = true;
    this.cones.instanceMatrix.needsUpdate = true; this.glows.instanceMatrix.needsUpdate = true;
    this.glowCol.needsUpdate = true;
  }

  /** Per rendered frame: the flicker clock (one uniform write). */
  update(t) { this.uniforms.uTime.value = t; }

  /** Draw calls this set costs (0 when empty). */
  get draws() { return this.items.length ? 2 : 0; }

  dispose() {
    this.cones?.removeFromParent(); this.glows?.removeFromParent();
    this.cones?.dispose?.(); this.glows?.dispose?.();
    this.coneGeo.dispose(); this.glowGeo.dispose(); this.coneMat.dispose(); this.glowMat.dispose();
    this.items.length = 0;
  }
}
const _m4 = new THREE.Matrix4();

/** The level's FlameSet (created on the first flame; its animator drives the flicker clock). */
export function flameSet(level) {
  if (level.flames) return level.flames;
  const fs = level.flames = new FlameSet(level.groups.props);
  level.animators.push({ render: (dt, t) => fs.update(t) });
  return fs;
}

/**
 * A flickering flame at (x, y, z) (lantern heads, the campfire, lamp posts, jack-o'-lanterns): one instance of the
 * level's FlameSet (0 extra draws), registered with `pool` as a lamp source (if given).
 * Returns { index, source, set(on), on }.
 */
export function addFlame(level, pool, x, y, z, { size = 1, color = '#FFB060', glow = 1.6, light = 1.6, distance = 8, on = true, flicker = 0.25, halo = 1 } = {}) {
  const fs = flameSet(level);
  const index = fs.add(x, y, z, { size, color, glow, halo, on });
  const src = pool ? pool.add({ pos: new THREE.Vector3(x, y + 0.25 * size, z), color, intensity: light, distance, on, flicker }) : null;
  const set = (v) => { fs.set(index, v); if (src) src.on = !!v; };
  return { index, source: src, set, get on() { return fs.isOn(index); } };
}

const FIREFLY_VS = /* glsl */`uniform float uTime, uBright, uGround; uniform vec3 uCenter, uBox; attribute float aPh; varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.31 + aPh) * 1.6 + sin(uTime * 0.87 + aPh * 2.0) * 0.4;
    p.z += cos(uTime * 0.27 + aPh * 1.3) * 1.6;
    p.y += sin(uTime * 0.6 + aPh * 0.7) * 0.5;
    // wrap around the camera box so the swarm always surrounds her
    vec3 w = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;
    w.y = uGround + p.y;
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    float blink = smoothstep(0.2, 1.0, sin(uTime * 1.7 + aPh * 3.1) * 0.5 + 0.5);
    vA = blink * uBright * smoothstep(60.0, 8.0, -mv.z);
    gl_PointSize = (2.0 + 3.0 * blink) * clamp(48.0 / max(1.0, -mv.z), 0.8, 5.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FIREFLY_FS = /* glsl */`uniform vec3 uColor; varying float vA;
  void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(uColor * (1.4 - r * 4.0), vA * (1.0 - r * 4.0)); }`;
fxModule({ name: 'fireflies', fog: false, vertexShader: FIREFLY_VS, fragmentShader: FIREFLY_FS });   // linked at import (PERF §1.2)

/**
 * Fireflies (art.md forest extra `#E8FF9A`): `n` additive points drifting in a box that follows the camera, brighter
 * at night (`env.grade === 'night'`). One draw call.
 */
export class Fireflies {
  constructor({ n = 70, color = '#E8FF9A', box = [36, 4, 36], seed = 5 } = {}) {
    this.n = n; this.box = box;
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * box[0]; pos[i * 3 + 1] = 0.4 + rnd() * box[1]; pos[i * 3 + 2] = (rnd() - 0.5) * box[2]; ph[i] = rnd() * 100; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uBright: { value: 0.5 },
      uColor: { value: new THREE.Color(color) }, uGround: { value: 0 } };
    // PERF §1.2: one module of the linked fx program (no program of its own)
    const mat = fxShaderMaterial({
      name: 'fireflies', uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: FIREFLY_VS, fragmentShader: FIREFLY_FS,
    });
    mat.userData.owned = true; mat.userData.noHeightFog = true;
    this.points = new THREE.Points(g, mat);
    this.points.name = 'fireflies'; this.points.frustumCulled = false; this.points.userData.owned = true; this.points.userData.camFade = false;
    g.userData.owned = true;
  }

  update(t, center, env, groundY = 0) {
    const u = this.uniforms;
    u.uTime.value = t;
    if (center) u.uCenter.value.copy(center);
    u.uGround.value = groundY;
    const night = env?.grade === 'night';
    u.uBright.value += ((night ? 1.0 : 0.35) - u.uBright.value) * 0.05;
  }
}

/** A sagging rope (thin tube) from a to b (Vector3s), `sag` metres at the middle. Vertex-coloured for the batch-free mesh. */
export function ropeGeometry(a, b, { sag = 0.3, r = 0.03, seg = 10 } = {}) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    _v.copy(a).lerp(b, t);
    _v.y -= Math.sin(t * Math.PI) * sag;
    pts.push(_v.clone());
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg * 2, r, 5, false);
}

/**
 * Axis-aligned (or yawed) boxes merged into one geometry with world-space UVs (u, v in metres / `tile`, planar per
 * face: tops use x / z, sides use the horizontal run and y) and a per-box vertex colour: textured architecture
 * (the gate causeway deck, its parapets, piers and the stair ledge) in one draw call.
 * boxes: [{ x0, x1, y0, y1, z0, z1, color?, yaw? }]
 */
export function worldBoxesGeometry(boxes, { tile = 2, color = '#FFFFFF' } = {}) {
  const geos = [];
  const col = new THREE.Color();
  for (const b of boxes) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
    if (!(w > 0 && h > 0 && d > 0)) continue;
    const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 6)), 1, Math.max(1, Math.round(d / 6)));
    if (b.yaw) g.rotateY(b.yaw);
    g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, c = new Float32Array(p.count * 3);
    col.set(b.color ?? color);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
      else if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
      else uv.setXY(i, x / tile, y / tile);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
  }
  if (!geos.length) return null;
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uvs = new Float32Array(n * 2), cols = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uvs.set(g.attributes.uv.array, o * 2); cols.set(g.attributes.color.array, o * 3);
    o += k; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  out.computeBoundingSphere(); out.computeBoundingBox();
  out.userData.owned = true;
  return out;
}
