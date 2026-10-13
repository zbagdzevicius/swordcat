// src/characters/flatPatch.js  (owner: characters) — the ONE unlit "flat" program behind the outline hulls (ART §5.4)
// and the x-ray silhouette proxies (CONTROLS_SPEC §3). PERF_SPEC §1.2: they were two programs (a BackSide fogged
// Basic + a FrontSide unfogged, un-tonemapped Basic); now both are DoubleSide Basic materials with one patch and one
// key, and the per-material `uFlatMode` uniform picks the behaviour:
//   0 = outline hull: front faces discarded (= BackSide), fogged, vertices pushed along the screen-projected normal by
//       `uOutlinePx` × `uPxScale` px (capped at FLAT.maxPx);
//   1 = x-ray proxy: back faces discarded (= FrontSide), unfogged, vertices slid `uPull` m toward the lens (same
//       pixels, nearer depth) for the GreaterDepth "behind something" test.
import * as THREE from 'three';
import { uViewport } from '../core/uniforms.js';

/** Shared constants: the outline pixel cap (ART §5.4) and the program key. */
export const FLAT = Object.freeze({ maxPx: 3, key: 'sc-flat-v1' });
/** Shared outline uniforms: the live pixel ratio (runtime.characterFrame writes it from ctx.renderer). */
export const FLAT_U = Object.freeze({ uPxScale: { value: 1 } });

const PROJECT = /* glsl */`
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  if ( uFlatMode > 0.5 ) {
    mvPosition.xyz += normalize( - mvPosition.xyz ) * min( uPull, max( - mvPosition.z - 0.05, 0.0 ) );
    gl_Position = projectionMatrix * mvPosition;
  } else {
    vec4 clipO = projectionMatrix * mvPosition;
    #ifdef USE_SKINNING
      vec3 nO = normalize( normalMatrix * objectNormal );
    #else
      vec3 nO = normalize( normalMatrix * normal );
    #endif
    vec2 dirO = ( projectionMatrix * vec4( nO, 0.0 ) ).xy;
    dirO /= max( length( dirO ), 1e-5 );
    float pxO = min( uOutlinePx * uPxScale, ${FLAT.maxPx.toFixed(1)} * uPxScale );
    clipO.xy += dirO * ( pxO * 2.0 / max( uViewport, vec2( 1.0 ) ) ) * clipO.w;
    gl_Position = clipO;
  }`;

/**
 * Install the flat patch on a Basic material. `u` holds the per-material uniforms (uFlatMode, uOutlinePx, uPull,
 * uFogK); the shared ones (uPxScale, uViewport) are added here.
 * @param {THREE.MeshBasicMaterial} m @param {Record<string, {value: any}>} u
 * @returns {THREE.MeshBasicMaterial}
 */
export function flatPatch(m, u) {
  m.side = THREE.DoubleSide;
  m.forceSinglePass = true;
  m.fog = true;
  // three keys `opaque` (transparent false + NormalBlending): the opaque hulls draw with NoBlending (same pixels) so
  // they share the program with the transparent x-ray proxies
  if (!m.transparent && m.blending === THREE.NormalBlending) m.blending = THREE.NoBlending;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, FLAT_U, { uViewport });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlinePx, uPxScale, uPull, uFlatMode;\nuniform vec2 uViewport;')
      .replace('#include <project_vertex>', PROJECT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFlatMode, uFogK;')
      .replace('#include <clipping_planes_fragment>', 'if ( uFlatMode > 0.5 ? ! gl_FrontFacing : gl_FrontFacing ) discard;\n#include <clipping_planes_fragment>')
      .replace('#include <fog_fragment>', 'if ( uFogK > 0.5 ) {\n#include <fog_fragment>\n}');
  };
  m.customProgramCacheKey = () => FLAT.key;
  return m;
}
