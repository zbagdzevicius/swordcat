// src/world/HeightFog.js  (owner: world) — art.md §9.2 height fog / ground mist: FogExp2 distance fog that is
// greener and thicker near the ground. Shared uniforms (`HFOG`) are written by Env every frame; every material
// with fog gets the same 4 chunk replacements through `withHeightFog(mat)` (Env patches the whole scene, and
// registers itself as a characters material patcher). Node-safe (three maths only).
import * as THREE from 'three';

/** Shared uniforms (same objects in every patched program, so one write updates all). */
export const HFOG = {
  uFogLow: { value: new THREE.Color('#9AA196') },
  uFogBase: { value: 0 },
  uFogFalloff: { value: 0.6 },
  uFogLowMix: { value: 0.6 },
};

const V_PARS = '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying float vFogH;\n#endif';
const V_MAIN = '#include <fog_vertex>\n#ifdef USE_FOG\nvFogH = (vec4(mvPosition.xyz - viewMatrix[3].xyz, 0.0) * viewMatrix).y;\n#endif';
const F_PARS = '#include <fog_pars_fragment>\n#ifdef USE_FOG\nvarying float vFogH; uniform vec3 uFogLow; uniform float uFogBase, uFogFalloff, uFogLowMix;\n#endif';
const F_MAIN = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float hfDist = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float hfDist = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float hfH = exp( - max( vFogH - uFogBase, 0.0 ) * uFogFalloff );
  float hfFactor = clamp( hfDist * mix( 0.7, 1.15, hfH ), 0.0, 1.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uFogLow, hfH * uFogLowMix ), hfFactor );
#endif`;

/** Apply the height-fog chunk replacements to shader sources (for custom ShaderMaterials). */
export function patchHeightFogShader(shader) {
  Object.assign(shader.uniforms, HFOG);
  shader.vertexShader = shader.vertexShader.replace('#include <fog_pars_vertex>', V_PARS).replace('#include <fog_vertex>', V_MAIN);
  shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>', F_PARS).replace('#include <fog_fragment>', F_MAIN);
  return shader;
}

/**
 * Patch a material in place (idempotent). Keeps any existing onBeforeCompile and composes the program cache key,
 * so differently-patched materials never share a program. Opt out with `mat.userData.noHeightFog = true`.
 * @template {THREE.Material} M @param {M} mat @returns {M}
 */
export function withHeightFog(mat) {
  if (!mat || mat.userData?.hfog || mat.userData?.noHeightFog || mat.fog === false) return mat;
  const prev = mat.onBeforeCompile;
  const hadCustom = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') || mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
  const prevKey = hadCustom ? String(mat.customProgramCacheKey()) : '';
  mat.onBeforeCompile = function (shader, renderer) {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(this, shader, renderer);
    patchHeightFogShader(shader);
  };
  mat.customProgramCacheKey = () => prevKey + '|hfog1';
  mat.userData.hfog = true;
  mat.needsUpdate = true;          // recompiles if it was already compiled; harmless otherwise
  return mat;
}
