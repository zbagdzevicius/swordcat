// src/enemies/bake.js  (owner: enemies) — PERF_SPEC §9.4 / §5 draw budget for the rat horde: bake a dressed skinned
// enemy (GLB body parts + the rigid gear riding its bones: eyes, spear, buckler, crossbow, fuzz coat) into ONE skinned
// mesh drawn with ONE pooled per-actor WarmToon material (ART §5.1 `sc-toon`, vertex colours + the `rmse` attribute:
// eyes self-lit through rmse.w, painted metal through the rmse.y matcap, so the 4–6 draws of a rat become 1). The
// helmet (it spins off on defeat), beast heads, plates, toggled props and anything unreadable stay separate meshes.
//
// Transforms (three's attached bind mode; the baked mesh is bound with bindMatrix = identity, same as the outline hull
// in look.js and characters' merge.js): skinned part P → v' = B_P · v with its bones remapped to the main skeleton;
// rigid part R under bone b → v' = boneInverse_b⁻¹ · bone_b.matrixWorld⁻¹ · W_R · v (pose-independent).
// Colours: material colour × vertex colour × the map's texel at the vertex UV (flat-swatch atlases such as KayKit's;
// the 1×1 white map of toonified solid materials reads white). Double-sided parts get a mirrored back copy so the
// baked material stays FrontSide. The merged geometry is cached per type + parts signature: every rat of a type shares
// one geometry (built once, never disposed per instance). Never per frame.
import * as THREE from 'three';
import { getToonMaterial } from '../characters/materials.js';

/** rmse presets per part kind: [roughness, metalness (matcap mix), sheen, self-light]. */
export const BAKE_RMSE = Object.freeze({
  fur: [0.95, 0, 0.6, 0], eyes: [0.5, 0, 0, 0.55], metal: [0.35, 0.75, 0, 0], cloth: [0.9, 0, 0.6, 0],
  gear: [0.8, 0, 0, 0], cheese: [0.6, 0, 0, 0.1], crown: [0.7, 0, 0, 0.15], tex: [0.7, 0, 0, 0],
});

/** Mesh names that never bake (plates, bubbles, alert sprite, hulls, proxies, tells). */
const NO_BAKE = /plate|bubble|alert|outline|silhouette|shadow|blob|tell|ring|shell|tuft|card|enemy-baked/i;

/** Part kind of a material (prop materials are named `enemy-<kind>`; GLB bodies are fur; atlases `tex`). */
export function rmseKind(m) {
  const n = String(m?.name ?? '');
  if (m?.isMeshBasicMaterial || /eye/i.test(n)) return 'eyes';
  for (const k of ['metal', 'cloth', 'gear', 'cheese', 'crown']) if (n.includes('enemy-' + k)) return k;
  const map = m?.map;
  if (map && !(map.image?.width === 1 && map.image?.height === 1)) return 'tex';
  return 'fur';
}

/**
 * RGBA pixel reader for a texture (DataTexture-like `image.data`, or any drawable image through a 2D canvas).
 * Returns null when the pixels cannot be read (no canvas, tainted image). `cache` dedupes reads within one bake.
 * @param {THREE.Texture|null} tex @param {Map<any, any>} [cache]
 * @returns {{ w: number, h: number, data: ArrayLike<number> } | null}
 */
export function texelReader(tex, cache = null) {
  const img = tex?.image;
  if (!img) return null;
  if (cache?.has(tex)) return cache.get(tex);
  let out = null;
  try {
    const w = img.width, h = img.height;
    if (img.data && w && h && img.data.length >= w * h * 4) out = { w, h, data: img.data };
    else if (w && h) {
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
        : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
      const g = cv?.getContext('2d', { willReadFrequently: true });
      if (g) { g.drawImage(img, 0, 0); out = { w, h, data: g.getImageData(0, 0, w, h).data }; }
    }
  } catch { out = null; }
  cache?.set(tex, out);
  return out;
}

const _uv = new THREE.Vector2();
const _tc = new THREE.Color();
/** Linear colour of `tex` at `uv` (map transform, wrap and flipY applied) into `out`; false when unreadable. */
function sampleTexel(tex, px, u, v, out) {
  _uv.set(u, v);
  tex.transformUv(_uv);
  const x = Math.min(px.w - 1, Math.max(0, Math.floor(_uv.x * px.w)));
  const y = Math.min(px.h - 1, Math.max(0, Math.floor(_uv.y * px.h)));
  const i = (y * px.w + x) * 4, d = px.data;
  const k = d instanceof Float32Array ? 1 : 1 / 255;
  if (tex.colorSpace === THREE.SRGBColorSpace) out.setRGB(d[i] * k, d[i + 1] * k, d[i + 2] * k, THREE.SRGBColorSpace);
  else out.setRGB(d[i] * k, d[i + 1] * k, d[i + 2] * k);
  return true;
}

/** Bone (object or name) → index in `skeleton.bones`. */
function boneIndex(skeleton) {
  const m = new Map();
  skeleton.bones.forEach((b, i) => { m.set(b, i); if (b.name && !m.has(b.name)) m.set(b.name, i); });
  return m;
}

/** Same bones (by object or name) with equal boneInverses? */
function sameSkeleton(a, b, idx, eps = 1e-4) {
  if (a === b) return true;
  for (let i = 0; i < a.bones.length; i++) {
    const j = idx.get(a.bones[i]) ?? idx.get(a.bones[i].name);
    if (j === undefined) return false;
    const x = a.boneInverses[i].elements, y = b.boneInverses[j].elements;
    for (let k = 0; k < 16; k++) if (Math.abs(x[k] - y[k]) > eps) return false;
  }
  return true;
}

/** Is `o` (and every ancestor below `root`) visible, and outside every `skip` subtree? */
function eligibleChain(o, root, skip) {
  for (let p = o; p && p !== root; p = p.parent) {
    if (!p.visible || skip.has(p) || p.userData?.noBake) return false;
  }
  return !skip.has(root);
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

/**
 * The bake plan for `root`: the main skeleton (largest visible skinned mesh) and every part that can join it, each with
 * its bind-space matrix, its bone remap or rigid bone, its material and pixel reader. Pure apart from reading pixels.
 * @param {THREE.Object3D} root @param {Iterable<THREE.Object3D|null|undefined>} [skipList] subtrees to keep separate
 * @returns {{ main: THREE.SkinnedMesh, skeleton: THREE.Skeleton, parts: object[] } | null}
 */
export function planBake(root, skipList = []) {
  if (!root) return null;
  const skip = new Set();
  for (const o of skipList) if (o) skip.add(o);
  root.updateMatrixWorld(true);
  let main = null, best = -1;
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && o.geometry?.attributes?.position && eligibleChain(o, root, skip)) {
      const n = o.geometry.attributes.position.count;
      if (n > best) { best = n; main = o; }
    }
  });
  if (!main) return null;
  const skeleton = main.skeleton, idx = boneIndex(skeleton), px = new Map(), parts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.noBake || o.userData.outline || NO_BAKE.test(o.name ?? '')) return;
    if (!eligibleChain(o, root, skip)) return;
    const mat = o.material;
    if (!mat || Array.isArray(mat) || mat.transparent || mat.alphaTest > 0 || mat.emissiveMap) return;
    const g = o.geometry, P = g?.attributes?.position;
    if (!P || !g.attributes.normal || P.count === 0) return;
    if (!mat.userData?.toon && mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) * (mat.emissiveIntensity ?? 1) > 0.3) return;
    // a 1×1 map (toonify's white map on solid GLB colours) is a flat tint: no UVs needed
    const map = mat.map && !(mat.map.image?.width === 1 && mat.map.image?.height === 1) ? mat.map : null;
    let reader = null;
    if (map) {
      if (!g.attributes.uv) return;
      reader = texelReader(map, px);
      if (!reader) return;                                // unreadable atlas: the part keeps its own draw
      if (map.matrixAutoUpdate) map.updateMatrix();
    }
    const part = { mesh: o, mat, map, reader, kind: rmseKind(mat), double: mat.side === THREE.DoubleSide, matrix: new THREE.Matrix4(), bones: null, bone: 0 };
    if (o.isSkinnedMesh) {
      if (!o.skeleton || !g.attributes.skinIndex || !sameSkeleton(o.skeleton, skeleton, idx)) return;
      part.matrix.copy(o.bindMatrix);
      part.bones = o.skeleton.bones.map((b) => idx.get(b) ?? idx.get(b.name) ?? 0);
    } else {
      let b = o.parent;
      while (b && b !== root.parent && idx.get(b) === undefined) b = b.parent;
      const k = b ? idx.get(b) : undefined;
      if (k === undefined) return;
      part.matrix.copy(skeleton.boneInverses[k]).invert().multiply(_m2.copy(b.matrixWorld).invert()).multiply(o.matrixWorld);
      part.bone = k;
    }
    parts.push(part);
  });
  singleSideClosedSkins(parts);
  return { main, skeleton, parts };
}

const _wv = new THREE.Vector3();
/**
 * PERF §1.2 triangle budget: GLB creature skins are often authored double-sided although together they form a CLOSED
 * surface (Rat.glb: Rat_1 + Rat_2 meet along one 72-edge seam), whose back faces can never be seen. When every edge
 * of the double-sided skinned parts (welded by bind-space position) is shared by ≥ 2 faces, those parts bake
 * single-sided (no mirrored copy: −4k triangles a rat). Open skins (ear cards, capes) keep their back copy. Mutates
 * `part.double`; one-time per bake plan.
 * @param {object[]} parts planBake parts
 */
export function singleSideClosedSkins(parts) {
  const skins = parts.filter((p) => p.double && p.bones);
  if (!skins.length) return false;
  const ids = new Map(), edges = new Map();
  for (const p of skins) {
    const g = p.mesh.geometry, P = g.attributes.position, I = g.index, n = I ? I.count : P.count;
    const w = new Int32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      _wv.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
      const k = `${Math.round(_wv.x * 1e4)},${Math.round(_wv.y * 1e4)},${Math.round(_wv.z * 1e4)}`;
      let id = ids.get(k); if (id === undefined) { id = ids.size; ids.set(k, id); }
      w[i] = id;
    }
    for (let t = 0; t + 2 < n; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = w[I ? I.getX(t + e) : t + e], b = w[I ? I.getX(t + (e + 1) % 3) : t + (e + 1) % 3];
        if (a === b) continue;
        const key = a < b ? a * 1048576 + b : b * 1048576 + a;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }
  for (const c of edges.values()) if (c < 2) return false;
  for (const p of skins) p.double = false;
  return true;
}

/** Stable signature of a plan (cache key): part names, vertex counts, colours, kinds, sides, bones. */
export function planSignature(plan) {
  let s = '';
  for (const p of plan.parts) {
    const c = p.mat.color ? p.mat.color.getHexString() : 'fff';
    s += `${p.mesh.name}:${p.mesh.geometry.attributes.position.count}:${c}:${p.kind}:${p.double ? 2 : 1}:${p.bones ? 's' : p.bone}:${p.map ? p.map.uuid : '-'};`;
  }
  return s;
}

const _v = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _c = new THREE.Color(), _base = new THREE.Color();

/**
 * Build the merged geometry of a plan: position, normal, color, rmse, skinIndex, skinWeight (+ index).
 * @param {{ parts: object[] }} plan @returns {THREE.BufferGeometry}
 */
export function buildBakedGeometry(plan) {
  let nv = 0, ni = 0;
  for (const p of plan.parts) {
    const g = p.mesh.geometry, n = g.attributes.position.count, t = g.index ? g.index.count : n, k = p.double ? 2 : 1;
    nv += n * k; ni += t * k;
  }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), rmse = new Float32Array(nv * 4);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of plan.parts) {
    const g = p.mesh.geometry, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, C = g.attributes.color;
    const SI = p.bones ? g.attributes.skinIndex : null, SW = p.bones ? g.attributes.skinWeight : null;
    const n = P.count, R = BAKE_RMSE[p.kind] ?? BAKE_RMSE.fur;
    const useVC = !!(p.mat.vertexColors && C);
    _base.copy(p.mat.color ?? _c.setRGB(1, 1, 1));
    _n3.getNormalMatrix(p.matrix);
    const start = vo;
    for (let i = 0; i < n; i++, vo++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
      pos[vo * 3] = _v.x; pos[vo * 3 + 1] = _v.y; pos[vo * 3 + 2] = _v.z;
      _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
      nrm[vo * 3] = _v.x; nrm[vo * 3 + 1] = _v.y; nrm[vo * 3 + 2] = _v.z;
      _c.copy(_base);
      if (useVC) { _c.r *= C.getX(i); _c.g *= C.getY(i); _c.b *= C.getZ(i); }
      if (p.map && p.reader && UV) { sampleTexel(p.map, p.reader, UV.getX(i), UV.getY(i), _tc); _c.multiply(_tc); }
      col[vo * 3] = _c.r; col[vo * 3 + 1] = _c.g; col[vo * 3 + 2] = _c.b;
      rmse[vo * 4] = R[0]; rmse[vo * 4 + 1] = R[1]; rmse[vo * 4 + 2] = R[2]; rmse[vo * 4 + 3] = R[3];
      if (SI) {
        for (let k = 0; k < 4; k++) { si[vo * 4 + k] = p.bones[SI.getComponent(i, k)] ?? 0; sw[vo * 4 + k] = SW.getComponent(i, k); }
      } else { si[vo * 4] = p.bone; sw[vo * 4] = 1; }
    }
    const flip = p.matrix.determinant() < 0;
    const tri = (a, b, c, base) => { index[io++] = base + a; index[io++] = base + (flip ? c : b); index[io++] = base + (flip ? b : c); };
    const I = g.index, t = I ? I.count : n;
    for (let i = 0; i < t; i += 3) tri(I ? I.getX(i) : i, I ? I.getX(i + 1) : i + 1, I ? I.getX(i + 2) : i + 2, start);
    if (p.double) {                                       // mirrored back copy: reversed winding, flipped normals
      const back = vo;
      for (let i = 0; i < n; i++, vo++) {
        const s = start + i;
        for (let k = 0; k < 3; k++) { pos[vo * 3 + k] = pos[s * 3 + k]; nrm[vo * 3 + k] = -nrm[s * 3 + k]; col[vo * 3 + k] = col[s * 3 + k]; }
        for (let k = 0; k < 4; k++) { rmse[vo * 4 + k] = rmse[s * 4 + k]; si[vo * 4 + k] = si[s * 4 + k]; sw[vo * 4 + k] = sw[s * 4 + k]; }
      }
      for (let i = 0; i < t; i += 3) tri(I ? I.getX(i) : i, I ? I.getX(i + 2) : i + 2, I ? I.getX(i + 1) : i + 1, back);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('rmse', new THREE.BufferAttribute(rmse, 4));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.enemyBakedShared = true;
  // TT3: smoothed bodies (rig.smoothNormals) keep their normals in the LOD too (lod.js)
  if (plan.parts.some((p) => p.mesh.geometry?.userData?.smoothNormals)) g.userData.smoothNormals = true;
  return g;
}

/** Baked geometries per `typeKey|signature` (shared by every instance of a type; never disposed per enemy). */
const _geoCache = new Map();

/** Drop the geometry cache (tests, a full asset flush). */
export function clearBakeCache() { for (const g of _geoCache.values()) g.dispose(); _geoCache.clear(); }
/** Cached baked geometries (debug / tests). */
export function bakeCacheSize() { return _geoCache.size; }

/**
 * Bake `root` in place: one SkinnedMesh (`enemy-baked`) on the main skeleton with a pooled per-actor toon material
 * (`enemyOwned` + `enemyToon`: EnemyLook flashes / highlights it, disposeInstanceMaterials returns it to its pool),
 * added next to the main skinned mesh; every merged part is hidden (kept for the pool snapshot and the gear nodes such
 * as the spear's tell). Needs ≥ 2 parts to be worth a draw. Returns the mesh and the parts merged, or null.
 * @param {THREE.Object3D} root the dressed visual @param {string} typeKey e.g. 'rat_pike'
 * @param {{ skip?: Iterable<THREE.Object3D|null|undefined> }} [opts] subtrees that keep their own draw (the helmet)
 * @returns {{ mesh: THREE.SkinnedMesh, parts: THREE.Mesh[] } | null}
 */
export function bakeEnemyVisual(root, typeKey, opts = {}) {
  const plan = planBake(root, opts.skip ?? []);
  if (!plan || plan.parts.length < 2) return null;
  const key = `${typeKey}|${planSignature(plan)}`;
  let geo = _geoCache.get(key);
  if (!geo) { geo = buildBakedGeometry(plan); _geoCache.set(key, geo); }
  const mat = getToonMaterial(`${typeKey}:skinned:baked`, null);
  mat.name = 'enemy-toon:baked';
  mat.userData.enemyOwned = true;
  mat.userData.enemyToon = true;
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'enemy-baked';
  mesh.castShadow = plan.parts.some((p) => p.mesh.castShadow);   // rig.setCasting decides per tier / shadow stage
  mesh.receiveShadow = plan.main.receiveShadow;
  mesh.userData.baked = true;
  (plan.main.parent ?? root).add(mesh);
  mesh.bind(plan.skeleton, new THREE.Matrix4());
  for (const p of plan.parts) p.mesh.visible = false;
  return { mesh, parts: plan.parts.map((p) => p.mesh) };
}
