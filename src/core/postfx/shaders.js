// src/core/postfx/shaders.js  (owner: core) — GLSL for the cinematic / FXAA-fallback chain (PERF_SPEC §6.1).
// The scene arrives in linear HDR (three tone-maps only when the target is the canvas), so the uber pass owns tone
// mapping (Neutral, toneMappingExposure), the sRGB transfer and dither. Function names are prefixed `sc` so they never
// collide with three's own prefix chunks (colorspace_pars_fragment is always injected into ShaderMaterials).

/** Full-screen triangle (3 vertices, clip-space positions in `position`; uv derived). */
export const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Bloom prefilter (full → ½): a 4-tap box over the dynamic-res sub-rect, the NaN / Inf guard (one bad pixel never
 * smears over the frame), then the soft-knee threshold.
 */
export const PREFILTER_FRAG = /* glsl */`
uniform sampler2D tScene; uniform vec2 uScale, uTexel, uMaxUv; uniform float uThreshold, uKnee, uClamp;
varying vec2 vUv;
vec3 scTap(vec2 uv) {
  vec3 c = texture2D(tScene, min(uv, uMaxUv)).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  return min(max(c, vec3(0.0)), vec3(uClamp));
}
void main() {
  vec2 uv = vUv * uScale;
  vec3 c = 0.25 * (scTap(uv + vec2(-0.5, -0.5) * uTexel) + scTap(uv + vec2(0.5, -0.5) * uTexel)
                 + scTap(uv + vec2(-0.5, 0.5) * uTexel) + scTap(uv + vec2(0.5, 0.5) * uTexel));
  float br = max(c.r, max(c.g, c.b));
  float k = uThreshold * uKnee + 1e-5;
  float soft = clamp(br - uThreshold + k, 0.0, 2.0 * k);
  soft = soft * soft / (4.0 * k);
  float w = max(soft, br - uThreshold) / max(br, 1e-5);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

/** Dual-Kawase down: 4 diagonal taps at ±1 source texel + the centre ×4, / 8 (at the target mip's resolution). */
export const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
  gl_FragColor = vec4(s * 0.125, 1.0);
}
`;

/** Dual-Kawase up: 4 edge taps ×1 + 4 diagonal taps ×2, / 12; `uRadius` widens the kernel (bloom radius). */
export const UP_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * (1.0 + uRadius);
  vec3 s = texture2D(tSrc, vUv + vec2(-2.0, 0.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2( 2.0, 0.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, -2.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0,  2.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * o).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2( 1.0, -1.0) * o).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-1.0,  1.0) * o).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2( 1.0,  1.0) * o).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0, 1.0);
}
`;

/**
 * The uber pass to the canvas. Order: FXAA (Med fallback) → bloom add → Neutral → grade (identity in play paths) →
 * sRGB → dither. Defines: USE_FXAA, USE_BLOOM.
 */
export const UBER_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom; uniform vec2 uScale, uTexel, uMaxUv;
uniform float uBloom, uSat, toneMappingExposure; uniform vec3 uGain;
varying vec2 vUv;
vec3 scNeutral(vec3 color) {                       // Khronos PBR Neutral (= three's NeutralToneMapping)
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  color *= toneMappingExposure;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < StartCompression) return color;
  float d = 1.0 - StartCompression;
  float newPeak = 1.0 - d * d / (peak + d - StartCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 scSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
vec3 scTap(vec2 uv) { return texture2D(tScene, min(uv, uMaxUv)).rgb; }
#ifdef USE_FXAA
float scLuma(vec3 c) { return dot(scNeutral(c), vec3(0.299, 0.587, 0.114)); }
vec3 scFxaa(vec2 uv) {                             // FXAA 3.11 "console": 7 taps, 1 on flat areas
  vec3 cM = scTap(uv);
  float lM = scLuma(cM),
        lNW = scLuma(scTap(uv + vec2(-0.5, -0.5) * uTexel)), lNE = scLuma(scTap(uv + vec2(0.5, -0.5) * uTexel)),
        lSW = scLuma(scTap(uv + vec2(-0.5,  0.5) * uTexel)), lSE = scLuma(scTap(uv + vec2(0.5,  0.5) * uTexel));
  float lMax = max(max(lNW, lNE), max(lSW, lSE)), lMin = min(min(lNW, lNE), min(lSW, lSE));
  if (max(lM, lMax) - min(lM, lMin) < max(0.0625, max(lM, lMax) * 0.125)) return cM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uTexel;
  return 0.5 * (scTap(uv - dir * (1.0 / 6.0)) + scTap(uv + dir * (1.0 / 6.0)));
}
#endif
void main() {
  vec2 uv = vUv * uScale;
#ifdef USE_FXAA
  vec3 c = scFxaa(uv);
#else
  vec3 c = scTap(uv);
#endif
#ifdef USE_BLOOM
  c += texture2D(tBloom, vUv).rgb * uBloom;
#endif
  c = scNeutral(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat) * uGain;
  c = scSRGB(c);
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;
