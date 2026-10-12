// src/core/depth.js  (owner: core) — one shared depth material per mesh kind (PERF_SPEC §3.5; IMPLEMENTATION_PLAN §7.2).
// Sharing one MeshDepthMaterial between a Mesh and an InstancedMesh / SkinnedMesh / BatchedMesh makes three re-resolve
// the shadow program every frame; one material per kind keeps re-resolves at 0 (gate `perf:reresolve`).
import * as THREE from 'three';

/** @type {Record<'plain'|'skinned'|'instanced'|'batched', THREE.MeshDepthMaterial|null>} */
const D = { plain: null, skinned: null, instanced: null, batched: null };

/**
 * The shared depth material for `o`'s kind. Use at build time: `if (o.castShadow) o.customDepthMaterial = depthFor(o);`
 * (alpha-tested casters need their own clone per alphaMap.)
 * @param {THREE.Object3D} o @returns {THREE.MeshDepthMaterial}
 */
export function depthFor(o) {
  const k = o.isSkinnedMesh ? 'skinned' : o.isInstancedMesh ? 'instanced' : o.isBatchedMesh ? 'batched' : 'plain';
  return (D[k] ??= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
}
