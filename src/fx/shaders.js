// src/fx/shaders.js  (owner: fx) — GLSL snippets shared by the fx materials (particles, telegraph marks, decals,
// mist, horde, trails). Every custom fx material:
//   - is built with `fxShaderMaterial(params)` (or patched with `withFxFog(mat)` after a clone). With `fog: true` it
//     gets world's height / focus fog (CONTROLS_SPEC §4.1, contract C4: `vFogW` + `HFOG_GLSL` + the shared HFOG
//     uniforms), so in the iso camera fx fog is measured from her exactly like the level geometry (the stage is clear,
//     the screen edges misty); additive materials fade to black in fog instead of tinting toward the fog colour;
//   - ends with <tonemapping_fragment> + <colorspace_fragment> so the Low preset (no composer) matches Med/High;
//   - clamps every pow() base and guards every normalize() (requests/characters.md: one NaN pixel + MSAA + bloom).
import * as THREE from 'three';
import { HFOG, patchFogVarying } from '../world/HeightFog.js';

/** Uniform set for a fogged ShaderMaterial (merge with your own). */
export const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/**
 * CONTROLS_SPEC §4.1 / C4: give a fogged fx ShaderMaterial the world's fog maths (vFogW + HFOG_GLSL + the SHARED
 * HFOG uniform objects). Idempotent. Call it again after `material.clone()`: a clone deep-copies its uniforms, which
 * would detach the shared focus / clear / mode values. Env's scene patcher skips the material afterwards (`userData.hfog`).
 * @template {THREE.ShaderMaterial} M @param {M} mat @returns {M}
 */
export function withFxFog(mat) {
  if (!mat?.fog || typeof mat.fragmentShader !== 'string') return mat;
  if (!mat.fragmentShader.includes('varying vec3 vFogW')) {
    // patchFogVarying treats any source that mentions `hfogFactor` as already patched, and FOG_FACTOR calls it:
    // hide the calls while it patches, then put them back
    mat.fragmentShader = mat.fragmentShader.replace(/\bhfog(Factor|Color)\b/g, '__fxHfog$1');
    patchFogVarying(mat);
    mat.fragmentShader = mat.fragmentShader.replace(/__fxHfog(Factor|Color)/g, 'hfog$1');
  }
  mat.uniforms ??= {};
  Object.assign(mat.uniforms, HFOG);
  mat.userData.hfog = true;
  return mat;
}

/** `new THREE.ShaderMaterial(params)` + `withFxFog` (every fogged fx shader material is built through this). */
export const fxShaderMaterial = (params) => withFxFog(new THREE.ShaderMaterial(params));

/**
 * Fragment helpers: the fog factor 0..1 and the fog colour at this fragment, the same values the level geometry gets
 * here (lens fog in cutscenes / Meme Cam / `?cam=classic`, focus fog in the iso play camera). Needs
 * <fog_pars_fragment> and <fog_vertex>, patched by `withFxFog` (`hfogFactor` / `hfogColor` are world's HFOG_GLSL).
 */
export const FOG_FACTOR = /* glsl */`
float fxFog() {
#ifdef USE_FOG
  return hfogFactor( vFogW, vFogDepth );
#else
  return 0.0;
#endif
}
vec3 fxFogColor() {
#ifdef USE_FOG
  return hfogColor( vFogW );
#else
  return vec3( 0.0 );
#endif
}`;

/** Shared 2D shape library (uv in [-1, 1]). Returns vec2(coverage, shade). Shape ids: see SHAPE in Particles.js. */
export const SHAPES = /* glsl */`
float fxDot2( vec2 v ) { return dot( v, v ); }
// iq: n-point star, m in [2, n] controls the point sharpness
float fxStar( vec2 p, float r, float n, float m ) {
  float an = 3.141593 / n, en = 3.141593 / m;
  vec2 acs = vec2( cos( an ), sin( an ) ), ecs = vec2( cos( en ), sin( en ) );
  float bn = mod( atan( p.x, p.y ), 2.0 * an ) - an;
  p = length( p ) * vec2( cos( bn ), abs( sin( bn ) ) );
  p -= r * acs;
  p += ecs * clamp( - dot( p, ecs ), 0.0, r * acs.y / ecs.y );
  return length( p ) * sign( p.x );
}
// iq: heart (p.y from 0 at the tip to ~1 at the lobes)
float fxHeart( vec2 p ) {
  p.x = abs( p.x );
  if ( p.y + p.x > 1.0 ) return sqrt( fxDot2( p - vec2( 0.25, 0.75 ) ) ) - 0.3535534;
  return sqrt( min( fxDot2( p - vec2( 0.0, 1.0 ) ), fxDot2( p - 0.5 * max( p.x + p.y, 0.0 ) ) ) ) * sign( p.x - p.y );
}
float fxAA( float d, float w ) { return 1.0 - smoothstep( -w, w, d ); }

vec2 fxShape( float shape, vec2 uv ) {
  float d = length( uv );
  int s = int( shape + 0.5 );
  if ( s == 0 ) {                                   // SOFT: round glow
    float g = exp( -d * d * 4.5 ) * ( 1.0 - smoothstep( 0.8, 1.0, d ) );
    return vec2( g, 1.0 );
  } else if ( s == 1 ) {                            // PUFF: cotton ball, lit from the upper left
    float a = 1.0 - smoothstep( 0.72, 1.0, d );
    vec3 n = vec3( uv, sqrt( max( 1.0 - d * d, 0.0 ) ) );
    float l = clamp( dot( n, normalize( vec3( -0.45, 0.75, 0.55 ) ) ), 0.0, 1.0 );
    return vec2( a, 0.7 + 0.38 * l );
  } else if ( s == 2 ) {                            // STAR4: twinkle (art.md §8)
    vec2 c = uv * 0.5;
    float core = pow( max( 1.0 - smoothstep( 0.0, 0.5, d * 0.5 ), 0.0 ), 3.0 );
    float star = max( 0.0, 1.0 - abs( c.x ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.y ) ) )
               + max( 0.0, 1.0 - abs( c.y ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.x ) ) );
    return vec2( clamp( core + star * 0.8, 0.0, 1.0 ), 1.0 );
  } else if ( s == 3 ) {                            // STAR5: chunky cartoon hit-star
    float sd = fxStar( uv, 0.9, 5.0, 2.6 );
    float a = fxAA( sd, 0.06 );
    return vec2( a, 1.0 - 0.25 * smoothstep( -0.35, 0.0, sd ) );
  } else if ( s == 4 ) {                            // RING
    float a = 1.0 - smoothstep( 0.06, 0.16, abs( d - 0.82 ) );
    return vec2( a, 1.0 );
  } else if ( s == 5 ) {                            // SPARK: tapered streak along uv.y
    float w = 1.0 - smoothstep( 0.0, 1.0, abs( uv.x ) * ( 1.6 + 1.4 * abs( uv.y ) ) );
    float a = w * ( 1.0 - smoothstep( 0.55, 1.0, abs( uv.y ) ) );
    return vec2( a, 1.0 );
  } else if ( s == 6 ) {                            // HEART
    float sd = fxHeart( uv * vec2( 0.62, 0.62 ) + vec2( 0.0, 0.48 ) );
    return vec2( fxAA( sd, 0.03 ), 1.0 - 0.2 * smoothstep( -0.2, 0.0, sd ) );
  } else if ( s == 7 ) {                            // FEATHER: leaf with a spine
    float e = fxDot2( vec2( uv.x * 2.6, uv.y ) );
    float a = 1.0 - smoothstep( 0.75, 1.0, e );
    float spine = 1.0 - smoothstep( 0.0, 0.08, abs( uv.x ) );
    return vec2( a, 0.85 + 0.25 * spine - 0.15 * uv.y );
  } else if ( s == 8 ) {                            // DROPLET: teardrop pointing up
    vec2 p = uv; p.y += 0.25;
    float r = 0.62 - 0.38 * clamp( p.y, 0.0, 1.0 );
    float a = 1.0 - smoothstep( r - 0.08, r, length( vec2( p.x, max( p.y, 0.0 ) * 0.55 + min( p.y, 0.0 ) ) ) );
    vec3 n = vec3( uv, sqrt( max( 1.0 - d * d, 0.0 ) ) );
    return vec2( a, 0.75 + 0.5 * clamp( dot( n, vec3( -0.5, 0.6, 0.6 ) ), 0.0, 1.0 ) );
  } else if ( s == 9 ) {                            // SHARD: kite / chip
    float sd = abs( uv.x ) * 1.7 + abs( uv.y ) - 0.9;
    return vec2( fxAA( sd, 0.05 ), 0.8 + 0.3 * step( 0.0, uv.x ) );
  } else if ( s == 10 ) {                           // STAR8: thin 8-point star with a soft core
    float sd = fxStar( uv, 0.95, 8.0, 5.5 );
    float a = max( fxAA( sd, 0.05 ), exp( -d * d * 10.0 ) );
    return vec2( a, 1.0 );
  } else if ( s == 11 ) {                           // FISH (silhouette)
    float body = fxDot2( vec2( uv.x * 1.6 + 0.15, uv.y * 3.2 ) ) - 1.0;
    vec2 t = vec2( uv.x - 0.62, abs( uv.y ) );
    float tail = max( t.y - 0.05 - t.x * 1.2, -t.x ) ;
    float a = max( fxAA( body, 0.12 ), fxAA( max( tail, t.x - 0.32 ), 0.04 ) );
    return vec2( a, 0.85 + 0.25 * step( uv.y, 0.0 ) );
  } else if ( s == 12 ) {                           // CONFETTI: rounded paper rect (the flip squashes the quad's width)
    vec2 q = abs( uv ) - vec2( 0.5, 0.82 );
    float sd = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - 0.14;
    return vec2( fxAA( sd, 0.06 ), 0.82 + 0.3 * step( 0.0, uv.x * uv.y ) );
  }
  return vec2( 0.0, 1.0 );
}`;

/** Value noise + 2-octave fbm (mist cards, cloud). */
export const NOISE = /* glsl */`
float fxHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float fxNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( fxHash( i ), fxHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fxHash( i + vec2( 0.0, 1.0 ) ), fxHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float fxFbm2( vec2 p ) { return fxNoise( p ) * 0.65 + fxNoise( p * 2.13 + 17.1 ) * 0.35; }`;

/** Close a fragment shader: tone mapping + output colour space (no-ops inside the composer's linear RT). */
export const OUTPUT = /* glsl */`
#include <tonemapping_fragment>
#include <colorspace_fragment>`;
