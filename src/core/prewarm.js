// src/core/prewarm.js  (owner: core) — batched shader warm-up under the veil (PERF_SPEC §3.3, ART §3.6, X37).
// LevelManager calls it after a build, before the veil drops; the title calls it too. Never call it during play.

const nextFrame = () => new Promise((res) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => res()) : setTimeout(res, 0)));

/**
 * Compile the programs of `roots` in batches so the veil / title keeps animating. `compile` walks visible objects
 * only, so warm stand-ins must be visible and placed out of view (y −50 or behind the camera), never hidden. Every
 * root that was visible is visible again afterwards. Ends with one real frame so textures and bone textures upload.
 * @param {import('three').WebGLRenderer} renderer @param {import('three').Scene} scene @param {import('three').Camera} camera
 * @param {import('three').Object3D[]} roots  top-level groups to warm (level chunks, enemy stand-ins, fx pools)
 * @param {{batch?: number}} [opts]  roots per yield (without KHR_parallel_shader_compile keep it to ≤ 4 new programs)
 * @returns {Promise<void>}
 */
export async function prewarm(renderer, scene, camera, roots, { batch = 12 } = {}) {
  const hidden = [];
  for (const r of roots) { if (r?.visible) { r.visible = false; hidden.push(r); } }
  try {
    const parallel = !!renderer.extensions?.has?.('KHR_parallel_shader_compile');
    for (let i = 0; i < hidden.length; i += batch) {
      for (let j = i; j < Math.min(i + batch, hidden.length); j++) hidden[j].visible = true;
      if (parallel && renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
      await nextFrame();
    }
  } finally {
    for (const r of hidden) r.visible = true;
  }
  if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}
