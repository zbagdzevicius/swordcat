// src/fx/GroundMist.js  (owner: fx) — research/CONTROLS_SPEC.md §4.2 ground mist sheets for the iso camera.
// Seen from above, the vertical mist cards (MistCards) are thin slivers; the misty look of the screen edges comes from
// these instead: 8 horizontal 12 × 12 m sheets, 0.4–1.3 m above the ground, in a 4–16 m ring around the focus, with a
// 3.5 m clear disc around her and a hole over every enemy in a wind-up (a wedge is never veiled). The alpha is a
// two-octave noise sampled in WORLD space (it never swims when the sheets follow her), 0.10–0.22 per sheet × the
// preset's mist factor (GROUND_MIST.byPreset, or a level's `cam.fog.mist`), tinted by the fog colour. Drift follows `env.wind` / `env.windDir`;
// Standing Ground and the Meme Cam drift ×2 (FX sets `speedMul`). ONE instanced draw; play camera only (it fades with
// the focus-fog mode, so cutscenes, presets, the Meme Cam's eye-level start and `?cam=classic` never show it).
import * as THREE from 'three';
import { NOISE, OUTPUT, fxShaderMaterial } from './shaders.js';
import { HFOG } from '../world/HeightFog.js';
import { groundY, hash01 } from './util.js';

export const GROUND_MIST = Object.freeze({
  count: 8, countLow: 4, size: 12, hMin: 0.4, hMax: 1.3, aMin: 0.10, aMax: 0.14, sunLift: 0.06,
  ringIn: 4, ringOut: 16, ringR: 9.5, clear: 3.5, clearSoft: 1.6, hole: 1.6, holes: 4,
  scale: 0.11, drift: 0.55, edge: 0.32, lighten: 0.14,
  /**
   * mist factor per env preset (× the sheet alpha); unknown presets use `def`. WA §2.1 (LI W3): the spooky levels are
   * no longer the densest: bog 0.8, forest_twilight 0.7, gate_dusk 0.6, keep_* 0.5, meadow_night 0.6,
   * meadow_morning 0.7, bog_dusk 0.8, hub_hush 0.5 (legacy names alias their new rows).
   */
  byPreset: Object.freeze({
    meadow_day: 1, meadow_morning: 0.7, meadow_evening: 0.85, meadow_giggle: 0.7, meadow_night: 0.6, forest_day: 0.9, forest_twilight: 0.7,
    forest_night: 0.7, town_occupied: 0.55, hub_gold: 0.4, hub_hush: 0.5, hub_grey: 0.5, ending_gold: 0.3, gate_dusk: 0.6, bog: 0.8, bog_dusk: 0.8,
    keep_twilight: 0.5, keep_storm: 0.5, keep_cellar: 0.5, sky_night: 0, sky_sunrise: 0,
  }),
  def: 0.8,
});

/** Mist factor for an env preset name (pure; unit-tested). */
export function mistFactor(preset) {
  const v = GROUND_MIST.byPreset[preset];
  return Number.isFinite(v) ? v : GROUND_MIST.def;
}

/**
 * Sheet layout around the focus (pure; unit-tested): `n` sheets on a ring of GROUND_MIST.ringR, each `{ x, z, yaw,
 * h (m above the ground), a (alpha 0..1 before the preset factor), seed }`, written into `out`.
 */
export function mistLayout(fx, fz, n = GROUND_MIST.count, out = []) {
  const M = GROUND_MIST;
  out.length = n;
  for (let i = 0; i < n; i++) {
    const s = hash01(i * 13 + 5), ang = ((i + 0.5) / n) * Math.PI * 2 + (s - 0.5) * 0.3;
    const r = M.ringR * (0.9 + 0.2 * hash01(i * 7 + 2));
    const o = out[i] ?? (out[i] = {});
    o.x = fx + Math.sin(ang) * r; o.z = fz + Math.cos(ang) * r;
    o.yaw = ang + Math.PI / 4;
    o.h = M.hMin + (M.hMax - M.hMin) * hash01(i * 3 + 1);
    o.a = M.aMin + (M.aMax - M.aMin) * hash01(i * 5 + 9);
    o.seed = s;
  }
  return out;
}

/**
 * The shader's coverage mask at a world point (pure mirror for tests): 0 inside the clear disc, 1 in the ring, 0
 * beyond `ringOut`, 0 inside a wind-up hole. `holes` = [{ x, z, r }].
 */
export function mistMask(px, pz, fx, fz, holes = []) {
  const M = GROUND_MIST, d = Math.hypot(px - fx, pz - fz);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let m = ss(M.clear, M.clear + M.clearSoft, d) * (1 - ss(M.ringOut - 4, M.ringOut, d));
  for (const h of holes) m *= ss(h.r, h.r + 1, Math.hypot(px - h.x, pz - h.z));
  return m;
}

const VERT = /* glsl */`
attribute vec3 iPos;      // sheet centre (world)
attribute vec4 iSheet;    // size, yaw, alpha, seed
varying vec3 vW;
varying vec2 vLocal;
varying float vAlpha, vSeed;
void main() {
  float c = cos( iSheet.y ), s = sin( iSheet.y );
  vec2 q = position.xz * iSheet.x;
  vec3 w = iPos + vec3( c * q.x + s * q.y, 0.0, -s * q.x + c * q.y );
  vW = w; vLocal = position.xz * 2.0; vAlpha = iSheet.z; vSeed = iSheet.w;
  gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec2 uScroll;
uniform vec3 uFocus;
uniform vec4 uHoles[ ${GROUND_MIST.holes} ];
uniform float uAlpha, uScale;
varying vec3 vW;
varying vec2 vLocal;
varying float vAlpha, vSeed;
${NOISE}
void main() {
  // soft square sheet edge (overlapping neighbours blend without seams)
  vec2 e = abs( vLocal );
  float edge = ( 1.0 - smoothstep( 1.0 - ${GROUND_MIST.edge.toFixed(2)}, 1.0, e.x ) ) * ( 1.0 - smoothstep( 1.0 - ${GROUND_MIST.edge.toFixed(2)}, 1.0, e.y ) );
  float d = length( vW.xz - uFocus.xz );
  float ring = smoothstep( ${GROUND_MIST.clear.toFixed(2)}, ${(GROUND_MIST.clear + GROUND_MIST.clearSoft).toFixed(2)}, d )
             * ( 1.0 - smoothstep( ${(GROUND_MIST.ringOut - 4).toFixed(1)}, ${GROUND_MIST.ringOut.toFixed(1)}, d ) );
  for ( int i = 0; i < ${GROUND_MIST.holes}; i++ ) {
    vec4 h = uHoles[ i ];
    if ( h.z > 0.0 ) ring *= smoothstep( h.z, h.z + 1.0, length( vW.xz - h.xy ) );
  }
  vec2 p = vW.xz * uScale + uScroll + vSeed * 7.3;
  float n = fxFbm2( p ) * 0.7 + fxFbm2( p * 2.7 - uScroll * 0.6 + 3.1 ) * 0.3;
  float a = smoothstep( 0.32, 0.78, n ) * edge * ring * vAlpha * uAlpha;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor * ( 0.94 + 0.12 * n ), a );
  ${OUTPUT}
}`;

const _c = new THREE.Color(), _white = new THREE.Color('#FFFFFF');

/** Sheets per quality preset: `QUALITY.groundMist` (X35: Low 4, Med / High 8), else the Low / full counts. */
export function sheetCount(q) {
  if (Number.isFinite(q?.groundMist)) return Math.max(0, Math.min(GROUND_MIST.count, q.groundMist));
  return (q?.id === 'low' || (q?.particles ?? 2000) < 1000) ? GROUND_MIST.countLow : GROUND_MIST.count;
}

export class GroundMist {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = null;
    this.count = 0;
    this.speedMul = 1;
    this.alpha = 0;               // eased visibility (focus-fog mode × iso × level factor)
    this.holes = 0;               // wind-up holes cut this frame (tests)
    this.factor = 1;
    this._layout = [];
    this._scroll = new THREE.Vector2();
    this._speed = 1;
  }

  init(scene, quality) {
    const n = sheetCount(quality);
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index; g.setAttribute('position', plane.getAttribute('position'));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(GROUND_MIST.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iSheet = new THREE.InstancedBufferAttribute(new Float32Array(GROUND_MIST.count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.iPos); g.setAttribute('iSheet', this.iSheet);
    g.instanceCount = n;
    this.count = n;
    this.geometry = g;
    const holes = []; for (let i = 0; i < GROUND_MIST.holes; i++) holes.push(new THREE.Vector4());
    this.material = fxShaderMaterial({
      name: 'fx.groundMist', vertexShader: VERT, fragmentShader: FRAG, fog: false,
      uniforms: { uColor: { value: new THREE.Color('#F6E4C0') }, uScroll: { value: this._scroll }, uFocus: { value: new THREE.Vector3() },
        uHoles: { value: holes }, uAlpha: { value: 0 }, uScale: { value: GROUND_MIST.scale } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    this.material.userData.noHeightFog = true;
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'fx.groundMist';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 2;          // under the ground decals (3) and telegraphs: an indicator is never veiled
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setQuality(q) {
    if (!this.geometry) return;
    this.count = sheetCount(q);
    this.geometry.instanceCount = this.count;
  }

  /** Per frame (visual dt). */
  render(dt) {
    if (!this.mesh) return;
    const ctx = this.ctx, cam = ctx.cam, env = ctx.env;
    const iso = !!cam?.isIso && ctx.params?.cam !== 'classic' && ctx.game?.mode !== 'title';
    const lv = ctx.levels?.current?.cam?.fog?.mist;      // optional per-level override (requests/fx.md)
    this.factor = Number.isFinite(lv) ? lv : env ? mistFactor(env.presetName) : 1;
    const want = iso ? Math.max(0, Math.min(1, HFOG.uFogMode.value)) * this.factor : 0;
    const k = 1 - Math.exp(-4 * (dt || 0));
    this.alpha += (want - this.alpha) * (dt > 0 ? k : 1);
    if (want === 0 && this.alpha < 0.004) this.alpha = 0;
    this.mesh.visible = this.alpha > 0.004 && this.count > 0;
    if (!this.mesh.visible) return;
    const f = cam.focus ?? HFOG.uFogFocus.value;
    const u = this.material.uniforms;
    u.uFocus.value.set(f.x, f.y, f.z);
    u.uAlpha.value = this.alpha;
    // tint (ART §8.1): the fog colour lifted 6 % toward the sun, a touch lighter (a pale warm veil over the ground)
    const fog = ctx.scene?.fog?.color, sun = env?.sunLight?.color;
    if (fog) { _c.copy(fog); if (sun) _c.lerp(sun, GROUND_MIST.sunLift); u.uColor.value.copy(_c.lerp(_white, GROUND_MIST.lighten)); }
    // drift with the wind (×2 Standing Ground / Meme Cam)
    this._speed += (this.speedMul - this._speed) * k;
    const w = Math.max(0.15, env?.wind ?? 0.6), wd = env?.windDir;
    const sp = (dt || 0) * this._speed * w * GROUND_MIST.drift * GROUND_MIST.scale;
    this._scroll.x -= (wd?.x ?? 0.8) * sp; this._scroll.y -= (wd?.y ?? 0.6) * sp;
    // sheets on a ring around the focus, each at its own height above the ground under it
    const L = mistLayout(f.x, f.z, this.count, this._layout), P = this.iPos.array, S = this.iSheet.array;
    for (let i = 0; i < this.count; i++) {
      const s = L[i];
      const gy = groundY(ctx, s.x, s.z, f.y);
      const y = Math.min(f.y + 2.5, Math.max(f.y - 3, gy)) + s.h;
      P[i * 3] = s.x; P[i * 3 + 1] = y; P[i * 3 + 2] = s.z;
      S[i * 4] = GROUND_MIST.size; S[i * 4 + 1] = s.yaw; S[i * 4 + 2] = s.a; S[i * 4 + 3] = s.seed;
    }
    this.iPos.needsUpdate = true; this.iSheet.needsUpdate = true;
    // no mist over an enemy in a wind-up (its wedge must read)
    const H = u.uHoles.value, book = ctx.combat?.threats;
    let n = 0;
    if (book?.live?.size) {
      for (const e of book.live.values()) {
        if (n >= H.length) break;
        const a = e.actor;
        if (!a?.pos || a.alive === false || e.ended) continue;
        const r = GROUND_MIST.hole + (e.payload?.arc?.range ?? e.payload?.range ?? 1.5);
        H[n++].set(a.pos.x, a.pos.z, r, 1);
      }
    }
    this.holes = n;
    for (let i = n; i < H.length; i++) H[i].set(0, 0, 0, 0);
  }

  dispose() {
    this.mesh?.removeFromParent();
    this.geometry?.dispose();
    this.material?.dispose();
    this.mesh = null;
  }
}
