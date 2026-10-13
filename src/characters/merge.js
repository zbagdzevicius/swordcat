// src/characters/merge.js  (owner: characters) — PERF_SPEC §9.4 / P:H7: bake a skinned character (a KayKit template,
// later the hero / kittens) into ONE skinned mesh per material, once per template. Spawns then clone the baked
// template (SkeletonUtils.clone through the enemies' VisualPool), so a hyena drops from ~16 draws to 1.
//
// Transforms (three's attached bind mode recomputes bindMatrixInverse = matrixWorld⁻¹ each frame, so a skinned vertex
// lands in world at Σ wₖ · Mₖ · B · v with Mₖ = boneₖ.matrixWorld · boneInverseₖ). The baked mesh is bound with
// B_T = identity:
//  - skinned part P (same skeleton bones AND equal boneInverses, ≤ 1e-4 per element): v' = B_P · v, skin indices
//    remapped to the target skeleton;
//  - rigid part R under bone b (100 % skinned to b): v' = boneInverse_b⁻¹ · bone_b.matrixWorld⁻¹ · W_R · v, which holds
//    at any current pose (NOT perf_1's `inverse(mesh.matrixWorld) · W_R`, wrong under every MODEL_FIT scale).
// Parts that cannot merge (different inverses, hidden, `userData.noBake`, a different material key) are reported in
// `separate` and stay as they are. Node-safe (no DOM); never per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bake tolerances (PERF §9.4, risk 7). */
export const BAKE = Object.freeze({ inverseEps: 1e-4 });

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _n3 = new THREE.Matrix3();

/**
 * Do two skeletons share bones (by identity or by name) with equal boneInverses (≤ `eps` per element)?
 * @param {THREE.Skeleton} a part skeleton @param {THREE.Skeleton} b target skeleton @param {number} [eps]
 */
export function sameInverses(a, b, eps = BAKE.inverseEps) {
  if (!a || !b) return false;
  if (a === b) return true;
  const idx = boneIndexMap(b);
  for (let i = 0; i < a.bones.length; i++) {
    const j = idx.get(a.bones[i]) ?? idx.get(a.bones[i].name);
    if (j === undefined) return false;
    const x = a.boneInverses[i].elements, y = b.boneInverses[j].elements;
    for (let k = 0; k < 16; k++) if (Math.abs(x[k] - y[k]) > eps) return false;
  }
  return true;
}

/** bone (object and name) → index in `skeleton.bones`. */
function boneIndexMap(skeleton) {
  const m = new Map();
  skeleton.bones.forEach((b, i) => { m.set(b, i); if (b.name && !m.has(b.name)) m.set(b.name, i); });
  return m;
}

/**
 * Fresh, non-interleaved attribute set for the merge: position, normal, uv, color (white when the part is textured),
 * aTexMix (1 = sample the map, 0 = vertex colour; ART "diffuse = mix(vColor, texel, aTexMix)"), skinIndex, skinWeight.
 * @param {THREE.BufferGeometry} src
 * @param {{ matrix: THREE.Matrix4, skin?: { map: number[] } | null, bone?: number, textured: boolean, color?: THREE.Color | null, useVC?: boolean }} o
 */
function normalisedGeometry(src, o) {
  const P = src.attributes.position, N = src.attributes.normal, UV = src.attributes.uv, C = src.attributes.color;
  const n = P.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const mix = new Float32Array(n), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  _n3.getNormalMatrix(o.matrix);
  const SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
  const base = o.color ?? null;
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(P, i).applyMatrix4(o.matrix); pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    if (N) { _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); nrm[i * 3] = _v.x; nrm[i * 3 + 1] = _v.y; nrm[i * 3 + 2] = _v.z; }
    else nrm[i * 3 + 1] = 1;
    if (UV) { uv[i * 2] = UV.getX(i); uv[i * 2 + 1] = UV.getY(i); }
    if (o.textured) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1; mix[i] = 1; }
    else {
      const vc = o.useVC && C, r = vc ? C.getX(i) : 1, g = vc ? C.getY(i) : 1, b = vc ? C.getZ(i) : 1;
      col[i * 3] = r * (base ? base.r : 1); col[i * 3 + 1] = g * (base ? base.g : 1); col[i * 3 + 2] = b * (base ? base.b : 1);
    }
    if (o.skin && SI && SW) {
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = o.skin.map[SI.getComponent(i, k)] ?? 0; sw[i * 4 + k] = SW.getComponent(i, k); }
    } else { si[i * 4] = o.bone ?? 0; sw[i * 4] = 1; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTexMix', new THREE.BufferAttribute(mix, 1));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (src.index) g.setIndex(Array.from(src.index.array));
  else { const I = new Array(n); for (let i = 0; i < n; i++) I[i] = i; g.setIndex(I); }
  if (o.matrix.determinant() < 0) {   // mirrored part: keep the winding front-facing
    const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  }
  return g;
}

/**
 * Bake every visible mesh under `root` that can share `skeleton` into ONE SkinnedMesh with `material`.
 * @param {THREE.Object3D} root template root (posed or in bind pose: the math is pose-independent)
 * @param {THREE.Skeleton} skeleton the target skeleton (usually the template's main SkinnedMesh's)
 * @param {THREE.Material} material WarmToon with the pack atlas as `map` (procedural parts use vertex colour)
 * @param {{ filter?: (o: THREE.Mesh) => boolean, name?: string }} [opts] filter: extra per-mesh test (e.g. steel vs body)
 * @returns {{ mesh: THREE.SkinnedMesh | null, baked: THREE.Mesh[], separate: THREE.Mesh[] }}
 */
export function bakeSkinned(root, skeleton, material, opts = {}) {
  root.updateMatrixWorld(true);
  const bi = boneIndexMap(skeleton), geos = [], baked = [], separate = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.noBake) return;
    if (!visibleChain(o, root)) return;
    if (opts.filter && !opts.filter(o)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m0 = mats[0];
    const textured = !!m0?.map;
    // three draws vertex colours only with `vertexColors`; the material colour tints either way
    const color = textured ? null : m0?.color ?? null, useVC = !!m0?.vertexColors;
    let g;
    if (o.isSkinnedMesh) {
      if (!sameInverses(o.skeleton, skeleton)) { separate.push(o); return; }
      const map = o.skeleton.bones.map((b) => bi.get(b) ?? bi.get(b.name) ?? 0);
      g = normalisedGeometry(o.geometry, { matrix: o.bindMatrix, skin: { map }, textured, color, useVC });
    } else {
      let b = o.parent; while (b && !b.isBone) b = b.parent;
      const k = b ? bi.get(b) ?? bi.get(b.name) : undefined;
      if (k === undefined) { separate.push(o); return; }
      // v' = boneInverse_k⁻¹ · bone_k.matrixWorld⁻¹ · W_R · v
      _m.copy(skeleton.boneInverses[k]).invert().multiply(_m2.copy(skeleton.bones[k].matrixWorld).invert()).multiply(o.matrixWorld);
      g = normalisedGeometry(o.geometry, { matrix: _m.clone(), bone: k, textured, color, useVC });
    }
    geos.push(g); baked.push(o);
  });
  if (!geos.length) return { mesh: null, baked, separate };
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  merged.computeBoundingSphere(); merged.computeBoundingBox();
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = opts.name ?? 'baked';
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = false;   // K5: actors never cast sun shadows (blobs instead)
  mesh.userData.baked = true;
  return { mesh, baked, separate };
}

/**
 * Bake `root` in place: the baked mesh joins the main skinned mesh's parent and every merged part is hidden (kept for
 * toggles / swaps until the owner disposes it). Returns the bake result.
 * @param {THREE.Object3D} root @param {THREE.Material} material @param {{ filter?: (o: THREE.Mesh) => boolean, name?: string }} [opts]
 */
export function bakeInPlace(root, material, opts = {}) {
  let main = null;
  root.traverse((o) => { if (!main && o.isSkinnedMesh && o.visible) main = o; });
  if (!main) return { mesh: null, baked: [], separate: [] };
  const res = bakeSkinned(root, main.skeleton, material, opts);
  if (res.mesh) {
    (main.parent ?? root).add(res.mesh);
    for (const o of res.baked) o.visible = false;
  }
  return res;
}

/** Is `o` and every ancestor below `root` visible? */
function visibleChain(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }
