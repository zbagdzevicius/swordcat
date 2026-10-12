// Warm ink outline hull (research/next/ART_WARM_SPEC.md §5.4, PERF_SPEC H8, IMPLEMENTATION_PLAN X9): a second skinned
// mesh that shares the actor's skeleton through a tight silhouette proxy (Readability.buildSilhouetteProxy with a small
// margin; never fur shells, tufts or the cape), drawn back-faced in a warm cocoa ink and pushed out a CONSTANT number of
// screen pixels in clip space, so the line stays ~2 px at every zoom (9–18 m). One draw, two programs total (skinned +
// static). Width × the live pixel ratio (dynamic resolution included: OUTLINE_U.uPxScale, written by runtime per frame).
// node-safe (no DOM / WebGL at import).
import * as THREE from 'three';
import { uViewport } from '../core/uniforms.js';
import { own } from './materials.js';
import { buildSilhouetteProxy, resolveTarget } from './Readability.js';

/**
 * Outline look and tiers (ART §5.4): widths at dpr 1 (hero 2.0, companions / enemies 1.6, bosses 2.4), the cap, the
 * ink (`TONE.ink`) and its 40 % mix with the actor's key hue × 0.3 (hero → #5A2A1A, never #000), the hull margins
 * (m) over the proxy fit, and the engaged fade-in (s).
 */
export const OUTLINE = Object.freeze({
  px: Object.freeze({ hero: 2.0, companion: 1.6, enemy: 1.6, boss: 2.4 }), maxPx: 3,
  ink: '#4A2A1E', hero: '#5A2A1A', mix: 0.4, keyK: 0.3,
  margin: 0.002, furMargin: 0.01, fade: 0.2,
  /** QUALITY.outline → which actors get a hull (X9). */
  tiers: Object.freeze({
    hero: Object.freeze(['hero', 'boss']),
    heroCompanionsEngaged: Object.freeze(['hero', 'boss', 'companion', 'engaged']),
    all: Object.freeze(['hero', 'boss', 'companion', 'engaged', 'enemy', 'npc']),
  }),
  maxEngaged: 4,
});

/** Shared outline uniforms: the live pixel ratio (runtime.characterFrame writes it from ctx.renderer). */
export const OUTLINE_U = Object.freeze({ uPxScale: { value: 1 } });

/**
 * Should an actor of `role` get a hull under the QUALITY.outline tier?
 * @param {string} tier QUALITY.outline ('hero' | 'heroCompanionsEngaged' | 'all') @param {string} role
 */
export function outlineAllowed(tier, role) { return (OUTLINE.tiers[tier] ?? OUTLINE.tiers.hero).includes(role); }

/**
 * Ink colour for an actor (ART §5.4): TONE.ink mixed `mix` with the actor's key hue × `keyK`.
 * @param {THREE.ColorRepresentation} key @returns {THREE.Color}
 */
export function inkFor(key) {
  const k = new THREE.Color(key).multiplyScalar(OUTLINE.keyK);
  return new THREE.Color(OUTLINE.ink).lerp(k, OUTLINE.mix);
}

/**
 * The hull material: unlit, back faces, fog on, a clip-space push along the screen-projected normal by `uOutlinePx`
 * (× the pixel ratio) pixels. `userData.uniforms.uPull` exists only because the proxy builder writes it.
 * @param {THREE.ColorRepresentation} color @param {number} px
 */
export function outlineMaterial(color = OUTLINE.hero, px = OUTLINE.px.hero) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  const u = { uOutlinePx: { value: px }, uPull: { value: 0 } };
  m.userData.uniforms = u;
  m.userData.outline = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, OUTLINE_U, { uViewport });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlinePx, uPxScale;\nuniform vec2 uViewport;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        vec4 clipO = projectionMatrix * mvPosition;
        #ifdef USE_SKINNING
          vec3 nO = normalize( normalMatrix * objectNormal );
        #else
          vec3 nO = normalize( normalMatrix * normal );
        #endif
        vec2 dirO = ( projectionMatrix * vec4( nO, 0.0 ) ).xy;
        dirO /= max( length( dirO ), 1e-5 );
        float pxO = min( uOutlinePx * uPxScale, ${OUTLINE.maxPx.toFixed(1)} * uPxScale );
        clipO.xy += dirO * ( pxO * 2.0 / max( uViewport, vec2( 1.0 ) ) ) * clipO.w;
        gl_Position = clipO;`);
  };
  m.customProgramCacheKey = () => 'sc-outline-v1';
  return own(m);
}

/**
 * Build (or rebuild in place) the outline hull of a kitten, KittenView, dressed beast or any model root.
 * @param {any} target Kitten | KittenView | actor | THREE.Object3D
 * @param {{ px?: number, color?: THREE.ColorRepresentation, skeleton?: THREE.Skeleton, into?: THREE.SkinnedMesh }} [o]
 * @returns {THREE.SkinnedMesh | null}
 */
export function buildOutline(target, o = {}) {
  const r = resolveTarget(target);
  const root = r?.root ?? (target?.isObject3D ? target : null);
  if (!root) return null;
  const into = o.into ?? null;
  const visible = into ? into.visible : true;
  const mesh = buildSilhouetteProxy(root, {
    skeleton: o.skeleton ?? r?.kitten?.skeleton, margin: OUTLINE.margin, furMargin: OUTLINE.furMargin, into, normals: true,
  });
  if (!mesh) return into;
  if (!into) {
    const xr = mesh.material;
    mesh.material = outlineMaterial(o.color ?? OUTLINE.hero, o.px ?? OUTLINE.px.hero);
    xr.dispose();
    const dispose = mesh.userData.dispose;
    mesh.userData.dispose = () => { dispose?.(); };
  }
  mesh.name = 'outline';
  mesh.renderOrder = 0;
  mesh.castShadow = false;
  mesh.visible = visible;
  return mesh;
}

/**
 * Fade a hull in / out (engaged enemies: 0.2 s, ART §5.4). Alpha < 1 draws it transparent; 0 hides it.
 * @param {THREE.Mesh} mesh @param {number} a 0..1
 */
export function setOutlineAlpha(mesh, a) {
  if (!mesh) return;
  const m = mesh.material;
  m.opacity = a; m.transparent = a < 0.999; m.depthWrite = a >= 0.999;
  mesh.visible = a > 0.001;
}
