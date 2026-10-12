// src/world/Dressing.js  (owner: world) — shared M2 level dressing (GAME_DESIGN §12.4–§12.6, art.md §9 / §12):
//   LightPool        the level's lit sources (torches, the campfire, lit lanterns, gate lamps) registered as lamp
//                    pools: Env writes the 4 nearest the iso focus into ENV_U.uLamps (K2 / PERF §8.2: no PointLights,
//                    so lighting a lantern or the forest day → night switch only changes uniforms, never a program)
//   addFlame         a flickering flame (emissive cone + additive glow sprites) registered as a light source
//   Fireflies        drifting additive points around the camera (forest `#E8FF9A`, brighter at night)
//   paveRibbons      textured street / deck ribbons that follow the terrain (town cobbles `pavingstones070`)
//   texturedMaterial a vertex-coloured Lambert (toon-patched) material with a world-UV colour map (awaited with a timeout)
//   ropeLine         a sagging rope between two points (a thin tube)
// Everything is `userData.owned` (LevelManager disposes it with the level); shared textures are never disposed.
import * as THREE from 'three';
import { makeGlowSprite } from './Sky.js';
import { LampSet } from './Env.js';

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
    const mix = mapMix.toFixed(3), jk = (joint > 0 ? `j${joint.toFixed(3)}_${jointLo.toFixed(3)}_${jointHi.toFixed(3)}` : '') + (contrast !== 1 ? 'c' + contrast.toFixed(3) : '');
    // LI §4.3 / ART §8.3 rule 5: kept textures read as soft pattern, not noise (contrast squeezed around the mid-grey)
    const squeeze = contrast !== 1 ? `
  sampledDiffuseColor.rgb = mix(vec3(0.5), sampledDiffuseColor.rgb, ${contrast.toFixed(3)});` : '';
    const lift = joint > 0 ? `\n  sampledDiffuseColor.rgb = mix(vec3(${joint.toFixed(3)}), sampledDiffuseColor.rgb, smoothstep(${jointLo.toFixed(3)}, ${jointHi.toFixed(3)}, lum));` : '';
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  sampledDiffuseColor.rgb = mix(vec3(lum), sampledDiffuseColor.rgb, ${mix});${lift}${squeeze}
  sampledDiffuseColor.rgb *= ${gain.toFixed(3)};
  diffuseColor *= sampledDiffuseColor;
#endif`);
    };
    m.customProgramCacheKey = () => 'world-tex-' + key + mix + gain.toFixed(3) + jk;
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

/** Flame cone geometry (one per level: LevelManager disposes everything under the level root). */
function flameGeometry(level) {
  if (level._flameGeo) return level._flameGeo;
  const outer = new THREE.ConeGeometry(0.11, 0.34, 7, 1, true).translate(0, 0.17, 0);
  const inner = new THREE.ConeGeometry(0.06, 0.2, 6, 1, true).translate(0, 0.1, 0);
  const pos = [], cols = [], a = new THREE.Color('#FF9A3D'), b = new THREE.Color('#FFEFB8');
  for (const [g, c] of [[outer, a], [inner, b]]) {
    const ng = g.toNonIndexed(), p = ng.attributes.position;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); cols.push(c.r, c.g, c.b); }
    g.dispose(); ng.dispose();
  }
  const g = level._flameGeo = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

/** Unlit additive flame material (one per level). */
function flameMaterial(level) {
  if (level._flameMat) return level._flameMat;
  const m = level._flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true });
  m.color.setScalar(2.2);
  return m;
}

/**
 * A flickering flame at (x, y, z) (torch heads, the campfire, braziers, lit lanterns): additive cone + two glow
 * sprites, animated by the level; registered with `pool` as a light source (if given). Returns { group, source, set(on) }.
 */
export function addFlame(level, pool, x, y, z, { size = 1, color = '#FFB060', glow = 1.6, light = 1.6, distance = 8, on = true, flicker = 0.25, halo = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'flame';
  g.position.set(x, y, z);
  const cone = new THREE.Mesh(flameGeometry(level), flameMaterial(level));
  cone.scale.setScalar(size); cone.castShadow = false; cone.receiveShadow = false; cone.userData.camFade = false;
  const s1 = makeGlowSprite({ color, size: 1.4 * size * halo, intensity: glow, fog: true });
  const s2 = makeGlowSprite({ color: '#FFE2A8', size: 0.55 * size, intensity: glow * 1.2, fog: true });
  s1.position.y = 0.15 * size; s2.position.y = 0.12 * size;
  g.add(cone, s1, s2);
  g.traverse((o) => { o.userData.owned = true; });
  level.groups.props.add(g);
  const src = pool ? pool.add({ pos: new THREE.Vector3(x, y + 0.25 * size, z), color, intensity: light, distance, on, flicker }) : null;
  const ph = x * 0.73 + z * 1.31;
  let lit = on;
  const set = (v) => { lit = !!v; g.visible = lit; if (src) src.on = lit; };
  set(on);
  level.animators.push({ render: (dt, t) => {
    if (!lit) return;
    const f = 0.85 + 0.15 * Math.sin(t * 17 + ph) * Math.sin(t * 9.1 + ph * 1.7);
    cone.scale.set(size * (0.95 + 0.1 * Math.sin(t * 11 + ph)), size * f * 1.05, size * (0.95 + 0.1 * Math.cos(t * 13 + ph)));
    s1.material.opacity = 0.8 + 0.2 * f;
  } });
  return { group: g, source: src, set, get on() { return lit; } };
}

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
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `uniform float uTime, uBright, uGround; uniform vec3 uCenter, uBox; attribute float aPh; varying float vA;
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
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(uColor * (1.4 - r * 4.0), vA * (1.0 - r * 4.0)); }`,
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
