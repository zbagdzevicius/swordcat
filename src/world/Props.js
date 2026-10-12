// src/world/Props.js  (owner: world) — real CC0 GLB props for the levels (GAME_DESIGN §12.1, §18.1).
// Every static prop template is baked once into ONE indexed geometry with position / normal / colour: material
// colours, Kenney recolours (art.md palette: misty, desaturated) and texture atlases (KayKit hexagon atlas,
// Kenney colormaps) sampled per vertex on the CPU. All placed props then live in a single BatchedMesh (one draw
// call + one shadow pass) with per-instance colour jitter, per-instance frustum culling and fog-distance culling.
// Dynamic parts (windmill fan, wobbling dummies, crates that break) are batch instances whose matrix/visibility we
// update. `fitToHeight` rules (§18.1) apply: templates are measured in bind pose and scaled to the requested fit.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { resolveFit } from '../core/Assets.js';

/** Kenney Nature Kit material recolours (their unlit teal-greens → art.md misty meadow palette). */
export const RECOLOR = {
  grass: '#55622F', leafsGreen: '#4F5C2A', leafsDark: '#3B4724', leafsFall: '#9A6E3A', dirt: '#5B4A36', dirtDark: '#45382A',
  stone: '#8C8F88', stoneDark: '#6C6F69', _defaultMat: '#9A9C8E', woodBark: '#5A4632', woodBarkDark: '#46382B', wood: '#8A6B4A',
  woodDark: '#5E4634', woodInner: '#C2AE7A', woodBirch: '#D8D2C2', water: '#2F3B33', colorRed: '#B05A54', colorRedDark: '#8A3E3C',
  colorPurple: '#C77DA8', colorYellow: '#E8C547', colorWhite: '#EDEFE6', colorTan: '#C9A27A', corn: '#D9B860',
};

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _nm = new THREE.Matrix3();
const _col = new THREE.Color(), _c2 = new THREE.Color(), _uv = new THREE.Vector2();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _box = new THREE.Box3(), _sph = new THREE.Sphere();

// ------------------------------------------------------------------ texture sampling (CPU)
const _pixels = new WeakMap();
/** RGBA pixels of a texture image (cached per image). Needs a canvas (browser only); null in node. */
function pixelsOf(tex) {
  const img = tex?.image;
  if (!img) return null;
  let px = _pixels.get(img);
  if (px !== undefined) return px;
  px = null;
  try {
    const w = img.width, h = img.height;
    let canvas = null;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h);
    else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; }
    if (canvas) {
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      px = { w, h, data: g.getImageData(0, 0, w, h).data };
    }
  } catch (e) { console.warn('[props] cannot read texture pixels', e); px = null; }
  _pixels.set(img, px);
  return px;
}

function sampleTexture(px, tex, u, v, out) {
  _uv.set(u, v);
  if (tex.matrixAutoUpdate) tex.updateMatrix();
  _uv.applyMatrix3(tex.matrix);
  let x = _uv.x - Math.floor(_uv.x), y = _uv.y - Math.floor(_uv.y);
  if (tex.flipY) y = 1 - y;
  const ix = Math.min(px.w - 1, Math.max(0, Math.floor(x * px.w))), iy = Math.min(px.h - 1, Math.max(0, Math.floor(y * px.h)));
  const o = (iy * px.w + ix) * 4, d = px.data;
  return out.setRGB(d[o] / 255, d[o + 1] / 255, d[o + 2] / 255, THREE.SRGBColorSpace);
}

/** Desaturate / scale a linear colour (grade textured packs toward the misty palette). */
function gradeColor(c, sat = 1, mul = 1) {
  if (sat !== 1) { const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; c.r = l + (c.r - l) * sat; c.g = l + (c.g - l) * sat; c.b = l + (c.b - l) * sat; }
  if (mul !== 1) c.multiplyScalar(mul);
  return c;
}

/**
 * Bake one mesh (posed / skinned allowed) into a plain geometry in `root` space with a colour attribute.
 * @returns {THREE.BufferGeometry|null}
 */
function bakeMesh(mesh, rootInv, o) {
  const src = mesh.geometry;
  if (!src?.attributes?.position) return null;
  const n = src.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  _m.multiplyMatrices(rootInv, mesh.matrixWorld);
  _nm.getNormalMatrix(_m);
  const nAttr = src.attributes.normal, uvAttr = src.attributes.uv, cAttr = src.attributes.color;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  // per-vertex material: geometry groups map index ranges to materials
  const vMat = new Int16Array(n);
  if (Array.isArray(mesh.material) && src.groups.length) {
    const idx = src.index;
    for (const g of src.groups) for (let k = g.start; k < g.start + g.count; k++) vMat[idx ? idx.getX(k) : k] = g.materialIndex ?? 0;
  }
  const flat = o.flatColor ? new THREE.Color(o.flatColor) : null;
  const tint = o.tint ? new THREE.Color(o.tint) : null;
  for (let i = 0; i < n; i++) {
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, _v); else _v.fromBufferAttribute(src.attributes.position, i);
    _v.applyMatrix4(_m);
    pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    if (nAttr && !mesh.isSkinnedMesh) { _n.fromBufferAttribute(nAttr, i).applyMatrix3(_nm).normalize(); nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z; }
    const mat = mats[vMat[i]] ?? mats[0];
    if (flat) _col.copy(flat);
    else {
      const re = o.recolor !== false ? (o.recolorMap?.[mat?.name] ?? RECOLOR[mat?.name]) : null;
      if (re && !mat?.map) _col.set(re);
      else _col.copy(mat?.color ?? _c2.setRGB(1, 1, 1));
      if (mat?.map && uvAttr) { const px = pixelsOf(mat.map); if (px) _col.multiply(sampleTexture(px, mat.map, uvAttr.getX(i), uvAttr.getY(i), _c2)); }
      if (cAttr) _col.multiply(_c2.fromBufferAttribute(cAttr, i));
      gradeColor(_col, o.sat ?? (mat?.map ? 0.78 : 1), o.mul ?? 1);
      if (tint) _col.multiply(tint);
    }
    col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  else g.setIndex([...Array(n).keys()]);
  if (mesh.isSkinnedMesh || !nAttr || o.flatNormals) {
    const ni = g.toNonIndexed(); ni.computeVertexNormals();
    ni.setIndex([...Array(ni.attributes.position.count).keys()]);
    g.dispose();
    return ni;
  }
  return g;
}

/**
 * @typedef {object} PropTemplate
 * @property {string} key
 * @property {THREE.BufferGeometry} geometry     merged static geometry (raw units, model space)
 * @property {THREE.Box3} box                    raw bounds (bind pose)
 * @property {{name:string, geometry:THREE.BufferGeometry, pivot:THREE.Vector3}[]} parts  dynamic parts (pivot = node origin)
 */

/**
 * Bake an Object3D (a cached glTF scene or a posed clone) into a PropTemplate.
 * @param {THREE.Object3D} root
 * @param {{key?:string, hide?:string[], dynamic?:string[], recolor?:boolean, recolorMap?:object, sat?:number, mul?:number, tint?:string, flatColor?:string, flatNormals?:boolean}} [o]
 * @returns {PropTemplate}
 */
export function templateFromObject(root, o = {}) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const hide = new Set(o.hide ?? []), dyn = new Set(o.dynamic ?? []);
  const statics = [], parts = [];
  const visit = (obj, dynName) => {
    if (!obj.visible || hide.has(obj.name)) return;
    const dn = dyn.has(obj.name) ? obj.name : dynName;
    if (obj.isMesh && !obj.isInstancedMesh) {
      const g = bakeMesh(obj, rootInv, o);
      if (g) (dn ? (parts.find((p) => p.name === dn) ?? parts[parts.push({ name: dn, list: [], pivot: null }) - 1]).list : statics).push(g);
    }
    for (const c of obj.children) visit(c, dn);
  };
  visit(root, null);
  const dynParts = parts.map((p) => {
    const node = root.getObjectByName(p.name);
    const pivot = node ? node.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv) : new THREE.Vector3();
    const geo = mergeGeometries(p.list, false); for (const g of p.list) g.dispose();
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    return { name: p.name, geometry: geo, pivot };
  });
  const geometry = statics.length ? mergeGeometries(statics, false) : emptyGeometry();
  for (const g of statics) g.dispose();
  const box = new THREE.Box3();
  if (geometry.attributes.position.count) { geometry.computeBoundingBox(); box.copy(geometry.boundingBox); }
  for (const p of dynParts) { p.geometry.computeBoundingBox(); _box.copy(p.geometry.boundingBox).translate(p.pivot); box.union(_box); }
  return { key: o.key ?? root.name ?? 'object', geometry, box, parts: dynParts };
}

function emptyGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setIndex([0, 1, 2]);
  return g;
}

/** Merge coloured primitive geometries into one vertex-coloured, indexed template: parts = [[geometry, colour, {flat}], ...]. */
export function procTemplate(key, parts) {
  const geos = [];
  for (const [geo, color, o] of parts) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal || o?.flat) g.computeVertexNormals();
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _col.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
    geo.dispose();
  }
  const geometry = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const n = geometry.attributes.position.count, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeBoundingBox();
  return { key, geometry, box: geometry.boundingBox.clone(), parts: [] };
}

/** Simple procedural geometry → template (vertex-coloured), e.g. posts, planks, gate boards. */
export function templateFromGeometry(key, geometry, color) {
  const g = geometry.index ? geometry : mergeVertices(geometry);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _col.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(g.index);
  out.computeBoundingBox();
  return { key, geometry: out, box: out.boundingBox.clone(), parts: [] };
}

// ------------------------------------------------------------------ materials
const NOISE_GLSL = /* glsl */`
float wdH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float wdN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wdH(i), wdH(i + vec2(1.0, 0.0)), f.x), mix(wdH(i + vec2(0.0, 1.0)), wdH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

/** Shared world-position varyings for the patches below (instancing / batching aware via worldpos_vertex). */
function patchWorldPos(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWdPos;\nvarying vec3 vWdNrm;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{
  vec4 wdp = vec4(transformed, 1.0);
  vec3 wdn = objectNormal;
  #ifdef USE_BATCHING
    wdp = batchingMatrix * wdp; wdn = mat3(batchingMatrix) * wdn;
  #endif
  #ifdef USE_INSTANCING
    wdp = instanceMatrix * wdp; wdn = mat3(instanceMatrix) * wdn;
  #endif
  vWdPos = (modelMatrix * wdp).xyz;
  vWdNrm = mat3(modelMatrix) * wdn;
}`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWdPos;\nvarying vec3 vWdNrm;\n' + NOISE_GLSL);
}

/**
 * Subtle world-space value noise on a vertex-coloured material (art.md §9.4: no flat-looking surfaces): breaks up the
 * flat Kenney / procedural colours of batched props without textures. `amount` = ± brightness.
 */
export function withDetailNoise(m, amount = 0.15) {
  m.onBeforeCompile = (sh) => {
    patchWorldPos(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 q = vWdPos * 1.7 + vWdNrm * 0.37;
  float n = wdN(q.xz + q.y * 0.71) * 0.6 + wdN(q.zy * 2.3 + q.x * 0.3) * 0.4;
  diffuseColor.rgb *= 1.0 + ${amount.toFixed(3)} * (n * 2.0 - 1.0);
}`);
  };
  m.customProgramCacheKey = () => 'world-detail-' + amount.toFixed(3);
  return m;
}

/**
 * Dressed-stone material for architecture meshes (the Old Bridge): vertex colours × staggered flagstone blocks
 * (grooves + per-block tint) on top faces and coursed blocks on the sides, plus weathering noise. World-space, so
 * any scale reads right.
 */
export function makeStoneMaterial({ block = [0.62, 0.45], course = 0.3 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    patchWorldPos(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 wp = vWdPos, wn = vWdNrm / max(length(vWdNrm), 1e-4);
  float top = smoothstep(0.55, 0.85, abs(wn.y));
  // top faces: flagstones (staggered rows across X); sides: coursed blocks along the face
  vec2 bt = vec2(wp.x / ${block[0].toFixed(3)}, wp.z / ${block[1].toFixed(3)});
  bt.x += step(1.0, mod(floor(bt.y), 2.0)) * 0.5;
  float along = abs(wn.x) > abs(wn.z) ? wp.z : wp.x;
  vec2 bs = vec2(along / ${(block[0] * 1.2).toFixed(3)}, wp.y / ${course.toFixed(3)});
  bs.x += step(1.0, mod(floor(bs.y), 2.0)) * 0.5;
  vec2 b = mix(bs, bt, top);
  vec2 f = fract(b), id = floor(b);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 1.3);
  float groove = 1.0 - smoothstep(0.015, 0.06, e);
  float tint = 0.88 + 0.22 * wdH(id + 17.0);
  float n = wdN(wp.xz * 1.3 + wp.y) * 0.5 + wdN(wp.xz * 4.7 - wp.y * 2.0) * 0.3 + wdN(wp.xz * 13.0) * 0.2;
  float moss = smoothstep(0.62, 0.8, wdN(wp.xz * 0.6 + 3.0)) * (0.35 + 0.65 * top);
  vec3 c = diffuseColor.rgb * tint * (0.78 + 0.4 * n) * (1.0 - groove * 0.5);
  c = mix(c, c * vec3(0.78, 0.92, 0.62), moss * 0.55);
  diffuseColor.rgb = c;
}`);
  };
  m.customProgramCacheKey = () => 'world-stone-v1';
  m.userData.owned = true;
  return m;
}

/**
 * Compute the uniform scale for a template + fit option (MODEL_FIT fallback via core resolveFit).
 * @returns {{scale:number, axis:string}}
 */
export function fitScale(path, tpl, fit, rng = Math.random) {
  const f = resolveFit(path, fit, rng);
  const s = tpl.box.getSize(_v);
  const ext = f.axis === 'max' ? Math.max(s.x, s.y, s.z) : s[f.axis === 'h' ? 'y' : f.axis];
  if (f.target == null || !(ext > 1e-9)) return { scale: 1, axis: f.axis };
  return { scale: f.target / ext, axis: f.axis };
}

/**
 * One BatchedMesh for every static / dynamic prop of a level. Usage: `add()` instances (before or after
 * `build()`; after build only with geometries that fit the spare capacity), then `build(scene parent)`.
 */
export class PropBatch {
  constructor({ name = 'props', castShadow = true, roughness = 0.9 } = {}) {
    this.name = name;
    this.castShadow = castShadow;
    /** @type {Map<THREE.BufferGeometry, {geo: THREE.BufferGeometry, id: number}>} */
    this.geos = new Map();
    /** @type {{geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color|null, id: number, cull: boolean, radius: number, center: THREE.Vector3, hidden: boolean, culled: boolean}[]} */
    this.items = [];
    this.material = withDetailNoise(new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, envMapIntensity: 0.6 }), 0.16);
    this.material.userData.owned = true;
    this.mesh = null;
    this._cullT = 0;
  }

  /**
   * Add an instance. Returns a handle { index } to move / hide it later.
   * @param {THREE.BufferGeometry} geo @param {THREE.Matrix4} matrix @param {{color?: THREE.Color|string, cull?: boolean}} [o]
   */
  add(geo, matrix, o = {}) {
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const item = { geo, matrix: matrix.clone(), color: o.color != null ? new THREE.Color(o.color) : null, id: -1, cull: o.cull !== false,
      radius: 0, center: new THREE.Vector3(), hidden: false, culled: false };
    this._bounds(item);
    this.items.push(item);
    if (this.mesh) this._instantiate(item);
    return { index: this.items.length - 1 };
  }

  _bounds(item) {
    _sph.copy(item.geo.boundingSphere).applyMatrix4(item.matrix);
    item.center.copy(_sph.center); item.radius = _sph.radius;
  }

  _geoId(geo) {
    let e = this.geos.get(geo);
    if (!e) { e = { geo, id: this.mesh.addGeometry(geo) }; this.geos.set(geo, e); }
    return e.id;
  }

  _instantiate(item) {
    item.id = this.mesh.addInstance(this._geoId(item.geo));
    this.mesh.setMatrixAt(item.id, item.matrix);
    this.mesh.setColorAt(item.id, item.color ?? _col.setRGB(1, 1, 1));
    if (item.hidden) this.mesh.setVisibleAt(item.id, false);     // hidden before the batch was built (broken crates)
  }

  /** Create the BatchedMesh (sized for everything added so far plus spare room). */
  build(parent, { spareInstances = 96, spareVertices = 12000 } = {}) {
    const uniq = new Set(this.items.map((i) => i.geo));
    let verts = spareVertices, idx = spareVertices * 3;
    for (const g of uniq) { verts += g.attributes.position.count; idx += g.index ? g.index.count : g.attributes.position.count; }
    const mesh = new THREE.BatchedMesh(Math.max(1, this.items.length + spareInstances), Math.max(3, verts), Math.max(3, idx), this.material);
    mesh.name = this.name; mesh.castShadow = this.castShadow; mesh.receiveShadow = true;
    mesh.userData.owned = true;
    this.mesh = mesh;
    for (const it of this.items) this._instantiate(it);
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    parent?.add(mesh);
    return mesh;
  }

  /** Move a dynamic instance (world matrix). */
  setMatrix(h, matrix) {
    const it = this.items[h.index]; if (!it) return;
    it.matrix.copy(matrix);
    if (it.id >= 0) this.mesh.setMatrixAt(it.id, matrix);
  }

  /** Hide / show an instance permanently (breakables, prologue-only props). */
  setVisible(h, on) {
    const it = this.items[h.index]; if (!it) return;
    it.hidden = !on;
    if (it.id >= 0) this.mesh.setVisibleAt(it.id, on && !it.culled);
  }

  setColor(h, color) {
    const it = this.items[h.index]; if (!it) return;
    (it.color ??= new THREE.Color()).set(color);
    if (it.id >= 0) this.mesh.setColorAt(it.id, it.color);
  }

  /** Fog-distance culling (every few frames): instances whose sphere lies beyond `maxDist` of `pos` are hidden. */
  cull(pos, maxDist, frameDt = 0.016) {
    if (!this.mesh) return;
    if ((this._cullT -= frameDt) > 0) return;
    this._cullT = 0.2;
    for (const it of this.items) {
      if (it.id < 0 || !it.cull) continue;
      const d = it.center.distanceTo(pos) - it.radius;
      const culled = d > maxDist;
      if (culled !== it.culled) { it.culled = culled; this.mesh.setVisibleAt(it.id, !culled && !it.hidden); }
    }
  }

  get count() { return this.items.length; }

  dispose() {
    this.mesh?.removeFromParent();
    this.mesh?.dispose();
    this.material.dispose();
    this.items.length = 0;
    this.geos.clear();
  }
}

/** Compose a TRS matrix (yaw about Y, optional tilt) into `out`. scale may be a number or [x, y, z]. */
export function trs(out, x, y, z, yaw = 0, scale = 1, tiltX = 0, tiltZ = 0) {
  _e.set(tiltX, yaw, tiltZ, 'YXZ');
  _q.setFromEuler(_e);
  if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]); else _s.setScalar(scale);
  return out.compose(_p.set(x, y, z), _q, _s);
}

/**
 * Footprint collider for a placed template: circle (round things) or box/circle-chain (long things).
 * Returns { circles: [], boxes: [] } in world space.
 */
export function footprint(tpl, x, y, z, yaw, sx, sy, sz, { kind = 'auto', shrink = 0.85, minR = 0.15, height = null } = {}) {
  const b = tpl.box, out = { circles: [], boxes: [] };
  const w = (b.max.x - b.min.x) * sx * shrink, d = (b.max.z - b.min.z) * sz * shrink;
  const cx0 = (b.max.x + b.min.x) / 2 * sx, cz0 = (b.max.z + b.min.z) / 2 * sz;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const cx = x + cx0 * c + cz0 * s, cz = z - cx0 * s + cz0 * c;
  const y0 = y - 0.5, y1 = y + (height ?? (b.max.y - Math.min(0, b.min.y)) * sy);
  const long = Math.max(w, d) / Math.max(0.01, Math.min(w, d));
  const k = kind === 'auto' ? (long > 1.6 ? 'box' : 'circle') : kind;
  if (k === 'circle') { out.circles.push({ x: cx, z: cz, r: Math.max(minR, Math.min(w, d) * 0.5 + (Math.max(w, d) - Math.min(w, d)) * 0.25), y0, y1 }); return out; }
  const axisAligned = Math.abs(Math.sin(yaw * 2)) < 1e-3;
  if (axisAligned) {
    const hw = (Math.abs(c) > 0.5 ? w : d) / 2, hd = (Math.abs(c) > 0.5 ? d : w) / 2;
    out.boxes.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, y0, y1 });
    return out;
  }
  // rotated long prop → chain of circles along its long axis
  const along = w >= d, len = along ? w : d, r = Math.max(minR, (along ? d : w) / 2);
  const n = Math.max(2, Math.ceil(len / (r * 1.5)));
  const ax = along ? c : s, az = along ? -s : c;
  for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * (len - r * 2); out.circles.push({ x: cx + ax * t, z: cz + az * t, r, y0, y1 }); }
  return out;
}

// ------------------------------------------------------------------ CONTROLS_SPEC §3: occlusion from above
/**
 * Fraction of a tree template's height where its crown starts (the lowest "leafy" vertex: green dominates red), for
 * the camera's crown-only fade (trunks never fade). Pure. Returns `fallback` when no leafy vertex exists.
 * @param {THREE.BufferGeometry} geo vertex-coloured template geometry @param {number} [fallback]
 */
export function crownFraction(geo, fallback = 0.35) {
  const p = geo?.attributes?.position, c = geo?.attributes?.color;
  if (!p || !c) return fallback;
  let y0 = Infinity, y1 = -Infinity, low = Infinity;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (let i = 0; i < p.count; i++) {
    const r = c.getX(i), g = c.getY(i);
    if (g > r * 1.08 && g > c.getZ(i)) { const y = p.getY(i); if (y < low) low = y; }
  }
  if (!(y1 > y0) || !Number.isFinite(low)) return fallback;
  return Math.min(0.8, Math.max(0.12, (low - y0) / (y1 - y0)));
}

/**
 * Is triangle (a, b, c) of a building a roof face? Up-facing (normal y > `ny`) and above `eave` of the height. Pure.
 * @param {number[]} a @param {number[]} b @param {number[]} c [x, y, z] @param {{minY:number, maxY:number}} box
 */
export function isRoofTriangle(a, b, c, box, { ny = 0.3, eave = 0.42 } = {}) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, nyy, nz);
  if (!(l > 1e-12)) return false;
  const cy = (a[1] + b[1] + c[1]) / 3;
  return Math.abs(nyy / l) > ny && cy > box.minY + eave * (box.maxY - box.minY);
}

/**
 * Split an indexed template geometry by a triangle predicate into [rest, picked] (both indexed, sharing nothing).
 * Either may be null when empty. Pure (three only).
 * @param {THREE.BufferGeometry} geo @param {(a:number[], b:number[], c:number[]) => boolean} pick
 */
export function splitGeometry(geo, pick) {
  const ni = geo.index ? geo.toNonIndexed() : geo.clone();
  const P = ni.attributes.position, names = Object.keys(ni.attributes);
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  const sel = [[], []];
  for (let t = 0; t < P.count / 3; t++) {
    const i = t * 3;
    a[0] = P.getX(i); a[1] = P.getY(i); a[2] = P.getZ(i);
    b[0] = P.getX(i + 1); b[1] = P.getY(i + 1); b[2] = P.getZ(i + 1);
    c[0] = P.getX(i + 2); c[1] = P.getY(i + 2); c[2] = P.getZ(i + 2);
    sel[pick(a, b, c) ? 1 : 0].push(t);
  }
  const out = sel.map((tris) => {
    if (!tris.length) return null;
    const g = new THREE.BufferGeometry();
    for (const name of names) {
      const src = ni.attributes[name], k = src.itemSize, arr = new Float32Array(tris.length * 3 * k);
      tris.forEach((t, j) => { for (let q = 0; q < 3 * k; q++) arr[j * 3 * k + q] = src.array[t * 3 * k + q]; });
      g.setAttribute(name, new THREE.BufferAttribute(arr, k));
    }
    const n = tris.length * 3, idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  });
  if (ni !== geo) ni.dispose();
  return out;
}

/**
 * A building template split into its body (walls, eaves, chimneys) and its roof faces (`isRoofTriangle`), so the
 * iso camera can fade the roof only (`camFade: 'roof'`). Both keep the source's box (same placement maths).
 * @returns {{body: any, roof: any|null}}
 */
export function splitRoofTemplate(tpl, opts) {
  if (!tpl?.geometry?.attributes?.position) return { body: tpl, roof: null };
  const box = { minY: tpl.box.min.y, maxY: tpl.box.max.y };
  const [rest, roof] = splitGeometry(tpl.geometry, (a, b, c) => isRoofTriangle(a, b, c, box, opts));
  if (!roof || !rest) { rest?.dispose(); roof?.dispose(); return { body: tpl, roof: null }; }
  return { body: { ...tpl, key: tpl.key + '|body', geometry: rest }, roof: { ...tpl, key: tpl.key + '|roof', geometry: roof, parts: [], roofOf: tpl.key } };
}
