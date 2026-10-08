// src/core/PostFX.js  (owner: core) — composer, bloom, vignette, quality presets, resize, dynamic resolution.
// tech.md §13 + art.md §10.1 + GAME_DESIGN §17: RenderPass → UnrealBloom (0.6/0.4/0.85) → OutputPass
// (tone mapping + sRGB) → Vignette. MSAA 4 lives in the composer's render target (Med/High). Low skips
// the composer entirely (renderer created with antialias). fx tweens bloom via setBloom()/resetBloom().
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { QUALITY, RENDER } from './config.js';
import { E } from './events.js';

/**
 * 'auto' quality: low on coarse pointers (phones/tablets), high on a recognisable discrete GPU, else med.
 * @param {THREE.WebGLRenderer|null} renderer @param {{coarse?: boolean}} [env]
 */
export function pickAutoQuality(renderer, { coarse = false } = {}) {
  if (coarse) return 'low';
  try {
    const gl = renderer?.getContext?.();
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    if (/swiftshader|llvmpipe|software/.test(name)) return 'low';
    if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|arc a\d/.test(name)) return 'high';
  } catch { /* ignore */ }
  return 'med';
}

export class PostFX {
  /** @param {object} ctx  needs ctx.renderer, ctx.scene, ctx.camera, ctx.bus */
  constructor(ctx) {
    this.ctx = ctx;
    this.renderer = ctx.renderer; this.scene = ctx.scene; this.camera = ctx.camera;
    this.composer = null; this.bloomPass = null; this.vignettePass = null; this.outputPass = null;
    this.qualityName = 'med';
    this.quality = QUALITY.med;
    this.width = 1; this.height = 1;
    this.dpr = 1;
    this.bloomBase = { ...RENDER.bloom };
    this.vignetteBase = { ...RENDER.vignette };
    this.dynamicRes = true;              // Game disables in ?test (stable screenshots)
    /** draw calls / triangles of the last scene render (shadows included, post passes excluded) — the §18 budget */
    this.sceneStats = { calls: 0, tris: 0 };
    this._ft = 1 / 60; this._win = 0; this._slowT = 0; this._fastT = 0;
  }

  get deviceDpr() { return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1; }

  /**
   * Apply a preset ('low' | 'med' | 'high' | 'auto'). Rebuilds the composer if needed, updates pixel
   * ratio and shadows, and emits E.QUALITY { name, preset }.
   */
  setQuality(name = 'auto') {
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const resolved = name === 'auto' || !QUALITY[name] ? pickAutoQuality(this.renderer, { coarse }) : name;
    const q = QUALITY[resolved];
    this.qualityName = resolved; this.quality = q;
    if (this.ctx) this.ctx.quality = q;
    const r = this.renderer;
    this.dpr = Math.min(this.deviceDpr, q.maxDpr);
    r.setPixelRatio(this.dpr);
    const shadowsChanged = r.shadowMap.enabled !== q.shadows;
    r.shadowMap.enabled = q.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    if (shadowsChanged) this.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
    this._buildComposer();
    this.setSize(this.width, this.height);
    this.ctx?.bus?.emit(E.QUALITY, { name: resolved, preset: q });
    return q;
  }

  _buildComposer() {
    this._disposeComposer();
    const q = this.quality;
    if (!q.composer) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: q.msaa });
    const composer = new EffectComposer(r, rt);
    const rp = new RenderPass(this.scene, this.camera), base = rp.render.bind(rp);
    rp.render = (...args) => {
      const info = r.info.render, c0 = info.calls, t0 = info.triangles;
      base(...args);
      this.sceneStats.calls = info.calls - c0; this.sceneStats.tris = info.triangles - t0;
    };
    composer.addPass(rp);
    if (q.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), this.bloomBase.strength, this.bloomBase.radius, this.bloomBase.threshold);
      // NaN guard (requests/characters.md): one NaN/Inf pixel from any shader (e.g. pow(negative) at MSAA sample
      // positions on D3D11) would be blurred over the whole frame by bloom. Sanitise the bloom input; free.
      const hp = this.bloomPass.materialHighPassFilter;
      if (hp?.fragmentShader?.includes('vec4 texel = texture2D( tDiffuse, vUv );')) {
        hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );',
          'vec4 texel = texture2D( tDiffuse, vUv ); texel = min( max( texel, vec4( 0.0 ) ), vec4( 65000.0 ) ); if ( any( notEqual( texel, texel ) ) ) texel = vec4( 0.0 );');
        hp.needsUpdate = true;
      }
      composer.addPass(this.bloomPass);
    }
    this.outputPass = new OutputPass();
    composer.addPass(this.outputPass);
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.offset.value = this.vignetteBase.offset;
    this.vignettePass.uniforms.darkness.value = this.vignetteBase.darkness;
    composer.addPass(this.vignettePass);
    this.composer = composer;
  }

  _disposeComposer() {
    if (!this.composer) return;
    this.composer.renderTarget1?.dispose(); this.composer.renderTarget2?.dispose();
    for (const p of this.composer.passes) p.dispose?.();
    this.composer = null; this.bloomPass = null; this.vignettePass = null; this.outputPass = null;
  }

  /** Resize everything to CSS size w × h. */
  setSize(w, h) {
    this.width = Math.max(1, w | 0); this.height = Math.max(1, h | 0);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    if (this.composer) { this.composer.setPixelRatio(this.dpr); this.composer.setSize(this.width, this.height); }
  }

  /** Set the pixel ratio directly (dynamic resolution). */
  setPixelRatio(dpr) {
    const q = this.quality;
    const d = Math.max(q.minDpr ?? 0.5, Math.min(dpr, Math.min(this.deviceDpr, q.maxDpr)));
    if (Math.abs(d - this.dpr) < 1e-3) return;
    this.dpr = d;
    this.setSize(this.width, this.height);
  }

  /** Bloom override (fx tweens it for Holy / Golden Hour). Honours settings.reduceFlashes (cap 0.8). */
  setBloom(strength, threshold = null, radius = null) {
    if (!this.bloomPass) return;
    const cap = this.ctx?.state?.settings?.reduceFlashes ? 0.8 : Infinity;
    this.bloomPass.strength = Math.min(strength, cap);
    if (threshold != null) this.bloomPass.threshold = threshold;
    if (radius != null) this.bloomPass.radius = radius;
  }

  resetBloom() { this.setBloom(this.bloomBase.strength, this.bloomBase.threshold, this.bloomBase.radius); }

  get bloom() { return this.bloomPass ? this.bloomPass.strength : 0; }

  setVignette(darkness = this.vignetteBase.darkness, offset = this.vignetteBase.offset) {
    if (!this.vignettePass) return;
    this.vignettePass.uniforms.darkness.value = darkness;
    this.vignettePass.uniforms.offset.value = offset;
  }

  /** Per rendered frame: dynamic resolution (tech.md §18). */
  update(frameDt) {
    const cfg = RENDER.dynamicRes;
    if (!this.dynamicRes || !this.quality.dynamicRes || !(frameDt > 0)) return;
    this._ft += (frameDt - this._ft) * 0.05;
    const ms = this._ft * 1000;
    if (ms > cfg.slowMs) { this._slowT += frameDt; this._fastT = 0; } else if (ms < cfg.fastMs) { this._fastT += frameDt; this._slowT = 0; } else { this._slowT = this._fastT = 0; }
    if (this._slowT > cfg.window) { this._slowT = 0; this.setPixelRatio(this.dpr - cfg.step); }
    if (this._fastT > cfg.window) { this._fastT = 0; this.setPixelRatio(this.dpr + cfg.step); }
  }

  render(frameDt) {
    if (this.composer) { this.composer.render(frameDt); return; }
    const info = this.renderer.info.render, c0 = info.calls, t0 = info.triangles;
    this.renderer.render(this.scene, this.camera);
    this.sceneStats.calls = info.calls - c0; this.sceneStats.tris = info.triangles - t0;
  }

  dispose() { this._disposeComposer(); }
}
