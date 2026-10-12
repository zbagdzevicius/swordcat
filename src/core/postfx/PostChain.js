// src/core/postfx/PostChain.js  (owner: core) — the ~7-draw chain used ONLY by the High cinematic path (X2) and the
// Med FXAA fallback (X1, `RENDER.medAA === 'fxaa'`). Play on every other path renders straight to the canvas.
//   scene → RT0 (HalfFloat, MSAA `samples`; or RGBA8 samples 0 for the FXAA fallback; allocated once, dyn-res sub-rect)
//         → bloom (½ prefilter → ¼ → ⅛ down, ⅛ → ¼ → ½ up; dual Kawase; High only)
//         → uber pass to the canvas (1 full-screen triangle).
import * as THREE from 'three';
import { FS_VERT, PREFILTER_FRAG, DOWN_FRAG, UP_FRAG, UBER_FRAG } from './shaders.js';

const rtOpts = (type, samples = 0, depth = false) => ({
  type, samples, depthBuffer: depth, stencilBuffer: false, generateMipmaps: false,
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace,
});

export class PostChain {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{bloom?: boolean, fxaa?: boolean, samples?: number, bloomRes?: number, bloomMips?: number,
   *          hdr?: boolean, knee?: number, nanClamp?: number}} [opts]
   */
  constructor(renderer, { bloom = true, fxaa = false, samples = 4, bloomRes = 0.5, bloomMips = 3, hdr = true, knee = 0.5, nanClamp = 64 } = {}) {
    this.renderer = renderer;
    this.useBloom = bloom; this.useFxaa = fxaa;
    this.bloomRes = bloomRes; this.mips = Math.max(1, bloomMips | 0);
    this.rt0 = new THREE.WebGLRenderTarget(1, 1, rtOpts(hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples, true));
    this.rt0.scissorTest = true;
    /** bloom mips: [½, ¼, ⅛] (each reused by the up pass) */
    this.mipRT = [];
    if (bloom) for (let i = 0; i < this.mips; i++) this.mipRT.push(new THREE.WebGLRenderTarget(1, 1, rtOpts(THREE.HalfFloatType)));
    this.width = 1; this.height = 1; this.scale = 1;
    /** draw calls of the last scene render (shadows included, chain passes excluded) */
    this.sceneStats = { calls: 0, tris: 0 };

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this._quad = new THREE.Mesh(geo);
    this._quad.frustumCulled = false;
    this._scene = new THREE.Scene(); this._scene.add(this._quad);
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mat = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: frag, uniforms, defines,
      depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
    });
    this.prefilter = bloom ? mat(PREFILTER_FRAG, {
      tScene: { value: null }, uScale: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2() },
      uMaxUv: { value: new THREE.Vector2(1, 1) }, uThreshold: { value: 0.9 }, uKnee: { value: knee }, uClamp: { value: nanClamp },
    }) : null;
    this.down = bloom ? mat(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }) : null;
    this.up = bloom ? mat(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.4 } }) : null;
    const defines = {};
    if (fxaa) defines.USE_FXAA = '';
    if (bloom) defines.USE_BLOOM = '';
    this.uber = mat(UBER_FRAG, {
      tScene: { value: this.rt0.texture }, tBloom: { value: bloom ? this.mipRT[0].texture : null },
      uScale: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2() }, uMaxUv: { value: new THREE.Vector2(1, 1) },
      uBloom: { value: 0 }, uSat: { value: 1 }, uGain: { value: new THREE.Vector3(1, 1, 1) }, toneMappingExposure: { value: 1 },
    }, defines);
  }

  /** Every pass material (prewarm compiles them under the veil). */
  get materials() { return [this.prefilter, this.down, this.up, this.uber].filter(Boolean); }

  /**
   * Allocate for the full-resolution drawing buffer `w × h` (CSS × min(dpr, maxDpr)); dyn-res renders a sub-rect.
   * Re-allocates only when the size changes.
   */
  setSize(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.rt0.setSize(w, h);
    let mw = Math.max(1, Math.round(w * this.bloomRes)), mh = Math.max(1, Math.round(h * this.bloomRes));
    for (const rt of this.mipRT) { rt.setSize(mw, mh); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
  }

  /** Bloom strength / radius / threshold (uniform writes only). */
  setBloom(strength, radius, threshold) {
    this.uber.uniforms.uBloom.value = Math.max(0, strength);
    if (this.up && radius != null) this.up.uniforms.uRadius.value = radius;
    if (this.prefilter && threshold != null) this.prefilter.uniforms.uThreshold.value = threshold;
  }

  /** Grade (sat, gain r g b); identity = [1, 1, 1, 1]. */
  setGrade(g) {
    if (!g) return;
    this.uber.uniforms.uSat.value = g[0];
    this.uber.uniforms.uGain.value.set(g[1], g[2], g[3]);
  }

  _pass(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._scene, this._cam);
  }

  /**
   * Render `scene` through the chain to the canvas. `scale` (0–1] = dynamic-res fraction of the RT used.
   * @param {THREE.Scene} scene @param {THREE.Camera} camera @param {number} [scale]
   */
  render(scene, camera, scale = 1) {
    const r = this.renderer, s = Math.min(1, Math.max(0.05, scale));
    this.scale = s;
    const W = this.width, H = this.height, vw = Math.max(1, Math.round(W * s)), vh = Math.max(1, Math.round(H * s));
    const sx = vw / W, sy = vh / H;
    this.rt0.viewport.set(0, 0, vw, vh); this.rt0.scissor.set(0, 0, vw, vh);
    const prevTarget = r.getRenderTarget(), prevAutoClear = r.autoClear;
    const info = r.info.render, c0 = info.calls, t0 = info.triangles;
    r.setRenderTarget(this.rt0);
    r.autoClear = true;
    r.render(scene, camera);
    this.sceneStats.calls = info.calls - c0; this.sceneStats.tris = info.triangles - t0;
    const tx = 1 / W, ty = 1 / H;
    if (this.useBloom) {
      const p = this.prefilter.uniforms;
      p.tScene.value = this.rt0.texture; p.uScale.value.set(sx, sy); p.uTexel.value.set(tx, ty); p.uMaxUv.value.set(sx - tx, sy - ty);
      this._pass(this.prefilter, this.mipRT[0]);
      const d = this.down.uniforms, u = this.up.uniforms;
      for (let i = 1; i < this.mipRT.length; i++) {
        const src = this.mipRT[i - 1];
        d.tSrc.value = src.texture; d.uTexel.value.set(1 / src.width, 1 / src.height);
        this._pass(this.down, this.mipRT[i]);
      }
      for (let i = this.mipRT.length - 1; i > 0; i--) {
        const src = this.mipRT[i];
        u.tSrc.value = src.texture; u.uTexel.value.set(1 / src.width, 1 / src.height);
        this._pass(this.up, this.mipRT[i - 1]);
      }
    }
    const U = this.uber.uniforms;
    U.uScale.value.set(sx, sy); U.uTexel.value.set(tx, ty); U.uMaxUv.value.set(sx - tx, sy - ty);
    U.toneMappingExposure.value = r.toneMappingExposure;
    this._pass(this.uber, null);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAutoClear;
  }

  /** Compile the pass programs (under a veil; never in play). */
  compile() {
    for (const m of this.materials) { this._quad.material = m; this.renderer.compile(this._scene, this._cam); }
  }

  dispose() {
    this.rt0.dispose();
    for (const rt of this.mipRT) rt.dispose();
    for (const m of this.materials) m.dispose();
    this._quad.geometry.dispose();
  }
}
