// src/core/PostFX.js  (owner: core) — the render path, quality presets, resize and dynamic resolution.
// IMPLEMENTATION_PLAN X1/X2/X4 + K1, PERF_SPEC §5–§6, ART_WARM_SPEC §3:
// - Play, every tier: `renderer.render(scene, camera)` straight to the canvas (canvas MSAA, Neutral tone mapping and
//   sRGB in the materials, CSS `#ui-vignette`). 0 post passes, no render target.
// - High cinematic (cutscenes + ending only): the lazy `postfx/PostChain.js` (HalfFloat MSAA-4 RT, half-res
//   dual-Kawase bloom, one uber pass). `setCinematic(on, opts)` is the public, tier-agnostic API.
// - Med FXAA fallback (`RENDER.medAA === 'fxaa'`, build-time): Med renders through RGBA8 RT0 + the FXAA uber pass.
// - `setBloom` / `setVignette` / `setGrade` only record values in play; the cinematic chain reads them.
// - Dynamic resolution: core/pacing.js drives `renderer.setPixelRatio(min(dpr, maxDpr) × scale)` on every tier
//   (≤ 1 change / 2 s); the shared `uViewport` is rewritten in the same frame.
import * as THREE from 'three';
import { QUALITY, RENDER, qualityShadowsOn } from './config.js';
import { uViewport } from './uniforms.js';
import { E } from './events.js';
import { Pacing } from './pacing.js';
import { PostChain } from './postfx/PostChain.js';

/**
 * 'auto' quality (PERF §2): low on a phone-class device (coarse pointer and a short side ≤ 500 CSS px, or
 * deviceMemory ≤ 4), low on a software rasteriser, high on a recognisable discrete GPU, else med.
 * @param {THREE.WebGLRenderer|null} renderer
 * @param {{coarse?: boolean, minSide?: number, deviceMemory?: number}} [env]
 */
export function pickAutoQuality(renderer, { coarse = false, minSide = Infinity, deviceMemory = Infinity } = {}) {
  if ((coarse && minSide <= 500) || deviceMemory <= 4) return 'low';
  try {
    const gl = renderer?.getContext?.();
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    if (/swiftshader|llvmpipe|software/.test(name)) return 'low';
    if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|arc a\d|apple m\d (pro|max|ultra)/.test(name)) return 'high';
  } catch { /* ignore */ }
  return 'med';
}

/** Browser facts for pickAutoQuality (node-safe). */
export function deviceFacts() {
  const w = typeof window !== 'undefined' ? window : null;
  const coarse = !!w?.matchMedia?.('(pointer: coarse)').matches;
  const minSide = w ? Math.min(w.innerWidth || Infinity, w.innerHeight || Infinity) : Infinity;
  const deviceMemory = typeof navigator !== 'undefined' && Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory : Infinity;
  return { coarse, minSide, deviceMemory };
}

/**
 * Does this preset (with the build-time `RENDER.medAA`) play through the FXAA RT path instead of the canvas?
 * @param {{id?: string}} q @param {string} [medAA]
 */
export const usesFxaaPath = (q, medAA = RENDER.medAA) => q?.id === 'med' && medAA === 'fxaa';

const smooth = (t) => t * t * (3 - 2 * t);

export class PostFX {
  /** @param {object} ctx  needs ctx.renderer, ctx.scene, ctx.camera, ctx.bus */
  constructor(ctx) {
    this.ctx = ctx;
    this.renderer = ctx.renderer; this.scene = ctx.scene; this.camera = ctx.camera;
    /** always null in play (K1); kept so old readers (`postfx.composer?.…`) resolve to the canvas */
    this.composer = null;
    /** @type {PostChain|null} built lazily: High on the first cinematic request, Med only for the FXAA fallback */
    this.chain = null;
    this.qualityName = 'med';
    this.quality = QUALITY.med;
    this.width = 1; this.height = 1;
    this.dpr = 1;
    const cb = RENDER.cinematic.bloom;
    /** cinematic bloom base (strength, radius, threshold); `setBloom` overrides it until `resetBloom` */
    this.bloomBase = { strength: cb[0], radius: cb[1], threshold: cb[2] };
    this._bloomReq = { ...this.bloomBase };
    this.vignetteBase = { ...RENDER.vignette };
    this.vignette = { ...this.vignetteBase };     // recorded only (K1: the vignette is CSS)
    this.grade = 'none';
    // cinematic state: `cinematic` = requested; `_cine` 0..1 = the seamless fade (bloom strength multiplier)
    this.cinematic = false; this.cinematicOpts = null;
    this._cine = 0; this._cineDur = RENDER.cinematic.fade; this._cineOn = false;
    this.dynamicRes = true;              // Game disables it in ?test (stable screenshots)
    this.pacing = new Pacing(QUALITY.med.dynRes);
    /** draw calls / triangles of the last scene render (shadows included, post passes excluded) — the §5 budget */
    this.sceneStats = { calls: 0, tris: 0 };
    this._lastFrameMs = 0;
    this._gpuMs = null;
    this.workMs = 0;                     // Game writes the CPU work of the last frame (sim + render + submit)
  }

  get deviceDpr() { return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1; }

  /** The full-resolution device-pixel ratio of this preset: min(devicePixelRatio, maxDpr). */
  get baseDpr() { return Math.min(this.deviceDpr, this.quality.maxDpr ?? 1.25); }

  /** Dynamic-resolution fraction of baseDpr in use (1 = full). */
  get scale() { return this.pacing.scale; }

  /** True while a post chain renders the frame (G13 `composerActive`). */
  get composerActive() { return !!this.chain && (this._cineOn || usesFxaaPath(this.quality)); }

  /** Thermal-ladder shares other areas read (PERF §5.4): fx pools, world grass, characters outlines. */
  get particleScale() { return this.pacing.particleScale; }
  get grassScale() { return this.pacing.grassScale; }

  /**
   * Apply a preset ('low' | 'med' | 'high' | 'auto'). Updates pixel ratio, shadows and the dyn-res range, drops the
   * cinematic chain on tiers without it, and emits E.QUALITY { name, preset }. Change presets only behind a veil.
   */
  setQuality(name = 'auto') {
    const resolved = name === 'auto' || !QUALITY[name] ? pickAutoQuality(this.renderer, deviceFacts()) : name;
    const q = QUALITY[resolved];
    this.qualityName = resolved; this.quality = q;
    if (this.ctx) this.ctx.quality = q;
    const r = this.renderer;
    this.pacing.setRange(q.dynRes ?? { min: q.minDpr ?? 0.7, max: 1, step: 0.05 });
    this.pacing.setCap({ presetCap: q.fpsCap ?? 60 });
    this.dpr = this.baseDpr * this.pacing.scale;
    r.setPixelRatio(this.dpr);
    const shadowsOn = qualityShadowsOn(q);   // K3: 'sun' | 'none' (the retired boolean still works)
    const shadowsChanged = r.shadowMap.enabled !== shadowsOn;
    r.shadowMap.enabled = shadowsOn;
    r.shadowMap.type = THREE.PCFShadowMap;
    if (shadowsChanged) this.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
    // the chain exists only where the tier uses it (High cinematic, Med FXAA fallback)
    if (this.chain && !(q.cinematic || usesFxaaPath(q))) { this.chain.dispose(); this.chain = null; this._cineOn = false; this._cine = 0; }
    if (usesFxaaPath(q)) this._ensureChain();
    this.setSize(this.width, this.height);
    this.ctx?.bus?.emit(E.QUALITY, { name: resolved, preset: q });
    return q;
  }

  /** Build the chain for the active tier (idempotent). */
  _ensureChain() {
    if (this.chain) return this.chain;
    const q = this.quality, fxaa = usesFxaaPath(q);
    if (!fxaa && !q.cinematic) return null;
    this.chain = new PostChain(this.renderer, {
      bloom: !fxaa, fxaa, samples: fxaa ? 0 : (q.cinematicSamples ?? 4), hdr: !fxaa,
      bloomRes: q.bloomRes ?? 0.5, bloomMips: q.bloomMips ?? 3, knee: RENDER.cinematic.knee, nanClamp: RENDER.cinematic.nanClamp,
    });
    this._sizeChain();
    this._applyBloom();
    this.chain.setGrade(RENDER.cinematic.grades[this.grade] ?? RENDER.cinematic.grades.none);
    return this.chain;
  }

  _sizeChain() {
    if (!this.chain) return;
    const b = this.baseDpr;
    this.chain.setSize(this.width * b, this.height * b);
  }

  /** Resize everything to CSS size w × h. */
  setSize(w, h) {
    this.width = Math.max(1, w | 0); this.height = Math.max(1, h | 0);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this._sizeChain();
    this.renderer.getDrawingBufferSize?.(uViewport.value);   // shared uniform, same frame as the resize (§7.2)
  }

  /**
   * Set the device pixel ratio directly (dynamic resolution; clamped to [baseDpr × dynRes.min, baseDpr]). Rewrites
   * `uViewport` in the same call.
   */
  setPixelRatio(dpr) {
    const q = this.quality, b = this.baseDpr, min = b * (q.dynRes?.min ?? q.minDpr ?? 0.6);
    const d = Math.max(min, Math.min(dpr, b));
    if (Math.abs(d - this.dpr) < 1e-3) return;
    this.dpr = d;
    this.setSize(this.width, this.height);
  }

  /** Force a render scale (debug `perf.setScale`, smoke `perf:dynres-step`). Returns the scale in force. */
  setScale(s) {
    this.pacing.force(s);
    this.setPixelRatio(this.baseDpr * this.pacing.scale);
    return this.pacing.scale;
  }

  /**
   * Cinematic look on / off (ART §3.3; tier-agnostic). High: the chain turns on at once with bloom 0 and fades up over
   * `dur` (default RENDER.cinematic.fade); off fades down and turns the chain off at the end. Low / Med: recorded only
   * (fx glow cards and exposure carry the moment). Never call it from gameplay, the title or Meme Cam.
   * @param {boolean} on @param {{bloom?: number|number[], dur?: number, grade?: string}} [opts]
   * @returns {boolean} whether a post chain renders the cinematic
   */
  setCinematic(on, opts = {}) {
    this.cinematic = !!on; this.cinematicOpts = opts;
    this._cineDur = Math.max(0, opts.dur ?? RENDER.cinematic.fade);
    if (opts.grade) this.setGrade(opts.grade);
    if (opts.bloom != null) {
      const b = Array.isArray(opts.bloom) ? opts.bloom : [opts.bloom];
      this._bloomReq.strength = b[0] ?? this.bloomBase.strength;
      if (b[1] != null) this._bloomReq.radius = b[1];
      if (b[2] != null) this._bloomReq.threshold = b[2];
    } else if (on) this._bloomReq = { ...this.bloomBase };
    if (!this.quality.cinematic) return false;
    if (on) {
      this._ensureChain();
      this._cineOn = true;
      if (this._cineDur === 0) this._cine = 1;
    } else if (this._cineDur === 0) { this._cine = 0; this._cineOn = false; }
    this._applyBloom();
    return true;
  }

  /** Bloom request (cinematic chain only; in play this is recorded and has no effect, K1). reduceFlashes caps 0.8. */
  setBloom(strength, threshold = null, radius = null) {
    const cap = this.ctx?.state?.settings?.reduceFlashes ? 0.8 : RENDER.cinematic.maxBloom;
    this._bloomReq.strength = Math.min(strength, cap);
    if (threshold != null) this._bloomReq.threshold = threshold;
    if (radius != null) this._bloomReq.radius = radius;
    this._applyBloom();
  }

  resetBloom() { this._bloomReq = { ...this.bloomBase }; this._applyBloom(); }

  /** The requested bloom strength (what a cinematic would use); 0 effect in play. */
  get bloom() { return this._bloomReq.strength; }

  /** The bloom strength actually rendered this frame (0 in play). */
  get bloomRendered() { return this._cineOn && this.chain ? this._bloomReq.strength * smooth(this._cine) : 0; }

  _applyBloom() {
    if (!this.chain?.useBloom) return;
    this.chain.setBloom(this.bloomRendered, this._bloomReq.radius, this._bloomReq.threshold);
  }

  /** Recorded only (K1: the vignette is the CSS `#ui-vignette` layer). */
  setVignette(darkness = this.vignetteBase.darkness, offset = this.vignetteBase.offset) {
    this.vignette.darkness = darkness; this.vignette.offset = offset;
  }

  /** Cinematic grade ('none' | 'warm' | 'gold' | 'night' | 'hush'); Env may call it every frame (cheap, no-op in play). */
  setGrade(name) {
    if (name === this.grade) return;
    this.grade = name ?? 'none';
    this.chain?.setGrade(RENDER.cinematic.grades[this.grade] ?? RENDER.cinematic.grades.none);
  }

  /**
   * Per rendered frame: the cinematic fade and the dynamic-resolution controller (PERF §5.2). `gpuMs` comes from the
   * perf GPU timer when it exists.
   * @param {number} frameDt seconds @param {number|null} [gpuMs]
   */
  update(frameDt, gpuMs = null) {
    if (!(frameDt > 0)) return;
    if (this._cineOn) {
      const k = this._cineDur > 0 ? frameDt / this._cineDur : 1;
      this._cine = this.cinematic ? Math.min(1, this._cine + k) : Math.max(0, this._cine - k);
      if (!this.cinematic && this._cine <= 0) this._cineOn = false;
      this._applyBloom();
    }
    const p = this.pacing;
    p.enabled = this.dynamicRes && (this.quality.dynamicRes !== false);
    const loading = !!this.ctx?.levels?.loading;
    const s = loading ? null : p.sample(frameDt, frameDt * 1000, gpuMs, this.workMs);
    if (s != null) this.setPixelRatio(this.baseDpr * s);
    if (p.takeThermalChange()) {
      this.ctx?.bus?.emit(E.PERF_THERMAL, { rung: p.thermalRung, grassScale: p.grassScale, particleScale: p.particleScale, outline: p.outlineCap, lock30: p.lock30 });
    }
  }

  /** One frame: straight to the canvas in play; through the chain for the High cinematic / Med FXAA paths. */
  render() {
    const chain = this.chain;
    if (chain && (this._cineOn || usesFxaaPath(this.quality))) {
      chain.render(this.scene, this.camera, this.dpr / this.baseDpr);
      this.sceneStats.calls = chain.sceneStats.calls; this.sceneStats.tris = chain.sceneStats.tris;
      return;
    }
    const r = this.renderer, info = r.info.render, c0 = info.calls, t0 = info.triangles;
    r.render(this.scene, this.camera);
    this.sceneStats.calls = info.calls - c0; this.sceneStats.tris = info.triangles - t0;
  }

  /**
   * Render targets the scene must be compiled against so nothing compiles after the veil (ART §3.3, PERF §3.3):
   * `[null]` (the canvas) plus, on High, the cinematic RT (builds the chain; allowed only under a veil).
   * @returns {(THREE.WebGLRenderTarget|null)[]}
   */
  warmTargets() {
    const q = this.quality;
    if (usesFxaaPath(q)) return [this._ensureChain().rt0];
    if (q.cinematic) return [null, this._ensureChain().rt0];
    return [null];
  }

  /**
   * Compile the cinematic variants of `scene` and the chain's own pass programs (High; under the level veil only).
   * LevelManager calls it after its own warm-up. No-op on tiers without a chain.
   * @returns {Promise<void>}
   */
  async prewarmCinematic(scene = this.scene, camera = this.camera) {
    const q = this.quality;
    if (!q.cinematic && !usesFxaaPath(q)) return;
    const chain = this._ensureChain(), r = this.renderer, prev = r.getRenderTarget();
    try {
      r.setRenderTarget(chain.rt0);
      if (r.extensions?.has?.('KHR_parallel_shader_compile') && r.compileAsync) await r.compileAsync(scene, camera);
      else r.compile(scene, camera);
    } finally { r.setRenderTarget(prev); }
    chain.compile();
  }

  /** The ART §11.1 hook `art.programs()` and `perf()` read program counts from renderer.info; this names the path. */
  get path() { return this.composerActive ? (usesFxaaPath(this.quality) ? 'fxaa' : 'cinematic') : 'canvas'; }

  dispose() { this.chain?.dispose(); this.chain = null; }
}

