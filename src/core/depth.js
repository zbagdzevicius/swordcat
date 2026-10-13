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
  // BasicDepthPacking = three's own shadow depth material (r186 shadow maps write a DepthTexture, the colour output
  // is unused): custom and default casters then share one program per kind instead of two (PERF §1.2)
  return (D[k] ??= new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking }));
}

/**
 * PERF §1.2 / §7: the layer of shadow-only casters (the kittens' low-poly shadow proxies). The sun's shadow camera
 * enables it (world Env) and the view cameras never do, so a proxy is drawn into the shadow map only: it needs no
 * colour-pass program at all (and costs nothing on a tier without shadows).
 */
export const SHADOW_ONLY_LAYER = 9;

/** Make `o` a shadow-only caster (layer SHADOW_ONLY_LAYER only). @param {THREE.Object3D} o @returns {THREE.Object3D} */
export function shadowOnly(o) { o.layers.set(SHADOW_ONLY_LAYER); return o; }
