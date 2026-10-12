// src/core/perf.js  (owner: core) — instrumentation (PERF_SPEC §12; IMPLEMENTATION_PLAN §5, §7.2 core surface).
// - `PerfMonitor` (one per Game): frame-interval / CPU rings, per-system timers (only with ?test / ?debug / ?perf),
//   steps per frame, the GPU timer (EXT_disjoint_timer_query_webgl2; also feeds dynamic resolution), shadow-pass
//   draws, long tasks, the `?perf` overlay and `performance.mark('title' | 'play')`.
// - `__GAME__.perf()` = `monitor.report()`; `.snapshot()`, `.reset()`, `.setScale(s)` hang off it (debug.js).
// - Areas tag their root objects `userData.perfCat` ∈ PERF_CATS and call `countPoolMiss()` on a VisualPool miss.
import * as THREE from 'three';
import { PERF } from './config.js';

/** `userData.perfCat` values (PERF §12). */
export const PERF_CATS = ['hero', 'enemies', 'companions', 'grass', 'props', 'fx', 'ui3d'];

/** Process-wide counters areas bump (cheap; no events). */
export const counters = { poolMisses: 0 };

/** A VisualPool miss (enemies): a visual had to be built during play (`perf().poolMisses`, gate `perf:spawn`). */
export function countPoolMiss(n = 1) { counters.poolMisses += n; }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** `performance.mark(name)` once per name (T_title / T_play; PERF §12). */
const _marked = new Set();
export function markOnce(name) {
  if (_marked.has(name)) return;
  _marked.add(name);
  try { performance.mark(name); } catch { /* no performance API */ }
}

/** Percentile of the first `n` entries of a typed-array ring (copy + sort; report time only). */
export function percentile(ring, n, p) {
  if (!n) return 0;
  const a = Array.from(ring.subarray(0, n)).sort((x, y) => x - y);
  return a[Math.min(n - 1, Math.max(0, Math.round((n - 1) * p)))];
}

/** GPU frame time from EXT_disjoint_timer_query_webgl2: one query per frame, read 2–3 frames later. */
export class GpuTimer {
  /** @param {WebGL2RenderingContext|null} gl */
  constructor(gl) {
    this.gl = gl;
    this.ext = null;
    try { this.ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null; } catch { this.ext = null; }
    this._free = []; this._pending = []; this._active = null;
    /** last resolved GPU ms, or null (no extension / nothing resolved yet) */
    this.lastMs = null;
  }

  get available() { return !!this.ext; }

  begin() {
    if (!this.ext || this._active || this._pending.length >= 4) return;
    const gl = this.gl, q = this._free.pop() ?? gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this._active = q;
  }

  end() {
    if (!this._active) return;
    const gl = this.gl;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this._pending.push(this._active); this._active = null;
    this.poll();
  }

  poll() {
    const gl = this.gl, ext = this.ext;
    if (!ext || !this._pending.length) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this._pending.length) {
      const q = this._pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this._pending.shift();
      if (!disjoint) this.lastMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      this._free.push(q);
    }
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    for (const q of [...this._free, ...this._pending]) gl.deleteQuery?.(q);
    this._free.length = 0; this._pending.length = 0;
  }
}

/**
 * Frame / CPU / GPU instrumentation for one Game. `detailed` (?test / ?debug / ?perf) adds per-system timers, the
 * shadow-pass counter and long-task observation; the cheap frame timing (CPU work, GPU timer) always runs because
 * the dynamic-resolution controller needs it.
 */
export class PerfMonitor {
  /** @param {import('./Game.js').Game} game @param {{detailed?: boolean}} [opts] */
  constructor(game, { detailed = false } = {}) {
    this.game = game;
    this.detailed = detailed;
    const N = PERF.ring;
    this.n = 0; this.i = 0;
    this.frame = new Float32Array(N); this.sim = new Float32Array(N); this.render = new Float32Array(N);
    this.submit = new Float32Array(N); this.total = new Float32Array(N); this.steps = new Uint8Array(N);
    this.gpu = new Float32Array(N); this.gpuN = 0;
    /** per-system EMA ms (detailed only), keyed by the system key */
    this.bySystem = Object.create(null);
    this.longTasks = 0; this.shadowCalls = 0; this.shadowUpdates = 0;
    this._t0 = 0; this._simMs = 0; this._renderMs = 0; this._submitMs = 0; this._last = -1;
    this.lastWorkMs = 0;
    this.gpuTimer = null;
    this._overlay = null; this._overlayT = 0;
  }

  /** Wire to the renderer (after it exists): GPU timer, shadow-pass counter, long tasks. */
  attach(renderer) {
    this.renderer = renderer;
    try { this.gpuTimer = new GpuTimer(renderer.getContext()); } catch { this.gpuTimer = null; }
    if (!this.detailed) return;
    const sm = renderer.shadowMap, base = sm?.render?.bind(sm), self = this;
    if (base) {
      sm.render = function (...args) {
        const info = renderer.info.render, c0 = info.calls;
        base(...args);
        const d = info.calls - c0;
        self.shadowCalls = d;
        if (d > 0) self.shadowUpdates++;
      };
    }
    try {
      this._po = new PerformanceObserver((list) => { this.longTasks += list.getEntries().length; });
      this._po.observe({ entryTypes: ['longtask'] });
    } catch { this._po = null; }
  }

  /** Start of a rendered frame (before input poll and the fixed steps). */
  beginFrame() {
    const t = now();
    if (this._last >= 0) this._frameMs = t - this._last;
    this._last = t;
    this._t0 = t; this._simMs = 0;
    this.shadowCalls = 0;
  }

  /** Time one system call (detailed only): `perf.sys(key, ms)`. */
  sys(key, ms) {
    const b = this.bySystem, v = b[key];
    b[key] = v === undefined ? ms : v + (ms - v) * 0.05;
  }

  /** Called by Game at the end of the frame. */
  endFrame(simMs, renderMs, submitMs, steps) {
    const t = now(), total = t - this._t0;
    this.lastWorkMs = total;
    const i = this.i;
    this.frame[i] = this._frameMs ?? 0; this.sim[i] = simMs; this.render[i] = renderMs; this.submit[i] = submitMs;
    this.total[i] = total; this.steps[i] = steps;
    const g = this.gpuTimer?.lastMs;
    if (g != null) { this.gpu[i] = g; this.gpuN = Math.min(this.gpuN + 1, this.gpu.length); }
    this.i = (i + 1) % this.frame.length; this.n = Math.min(this.n + 1, this.frame.length);
    if (this._overlay) this._tickOverlay();
  }

  reset() { this.n = 0; this.i = 0; this.gpuN = 0; this.longTasks = 0; this.shadowUpdates = 0; counters.poolMisses = 0; this.bySystem = Object.create(null); }

  _avg(ring, n = this.n) { let s = 0; for (let k = 0; k < n; k++) s += ring[k]; return n ? s / n : 0; }

  /** The `__GAME__.perf()` report (allocates; call it from tests / tools, never per frame). */
  report() {
    const g = this.game, ctx = g.ctx, r = ctx?.renderer, info = r?.info, n = this.n;
    const stepsAvg = this._avg(this.steps);
    let stepsMax = 0; for (let k = 0; k < n; k++) stepsMax = Math.max(stepsMax, this.steps[k]);
    const pf = ctx?.postfx, p = pf?.pacing;
    const heap = typeof performance !== 'undefined' ? performance.memory?.usedJSHeapSize : undefined;
    const bySystem = {};
    for (const k of Object.keys(this.bySystem)) bySystem[k] = +this.bySystem[k].toFixed(3);
    return {
      frame: { p50: percentile(this.frame, n, 0.5), p95: percentile(this.frame, n, 0.95), p99: percentile(this.frame, n, 0.99), max: percentile(this.frame, n, 1), n },
      cpu: { sim: this._avg(this.sim), simPerStep: stepsAvg ? this._avg(this.sim) / stepsAvg : 0, render: this._avg(this.render), submit: this._avg(this.submit), total: this._avg(this.total), bySystem },
      gpuMs: this.gpuN ? this._avg(this.gpu, this.gpuN) : null,
      steps: { avg: stepsAvg, max: stepsMax, last: g.loop?.stepsLastFrame ?? 0, capHits: g.loop?.capHits ?? 0 },
      calls: info?.render.calls ?? 0, tris: info?.render.triangles ?? 0,
      sceneCalls: pf?.sceneStats.calls ?? 0, sceneTris: pf?.sceneStats.tris ?? 0,
      programs: info?.programs?.length ?? 0, geometries: info?.memory.geometries ?? 0, textures: info?.memory.textures ?? 0,
      texMB: this.detailed && ctx ? textureMB(ctx) : null,
      stage: PERF.stage,
      budget: budgetFor(pf?.qualityName ?? 'med'),
      shadowCalls: this.shadowCalls, shadowUpdates: this.shadowUpdates,
      scale: p?.scale ?? 1, dpr: r?.getPixelRatio?.() ?? 1, fpsCap: p?.cap ?? 0, divisor: p?.divisor ?? 1, refreshHz: p?.refreshHz ?? 60,
      thermalRung: p?.thermalRung ?? 0, lock30: !!p?.lock30, scaleChanges: p?.changes ?? 0,
      path: pf?.path ?? 'canvas', composerActive: !!pf?.composerActive,
      byCat: ctx ? drawsByCat(ctx) : {},
      poolMisses: counters.poolMisses, longTasks: this.longTasks,
      heapMB: heap ? heap / 1048576 : null,
      quality: pf?.qualityName ?? null,
    };
  }

  /** Averages and p95 only (cheap to log). */
  snapshot() {
    const n = this.n;
    return { n, frameAvg: this._avg(this.frame), frameP95: percentile(this.frame, n, 0.95), cpuAvg: this._avg(this.total),
      cpuP95: percentile(this.total, n, 0.95), gpuAvg: this.gpuN ? this._avg(this.gpu, this.gpuN) : null, stepsAvg: this._avg(this.steps) };
  }

  /** `?perf`: a 5-line DOM overlay (fps p50/p99, CPU, GPU, calls / tris / programs, render scale). */
  showOverlay() {
    if (this._overlay || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'perf-overlay';
    el.style.cssText = 'position:fixed;right:6px;top:6px;z-index:60;font:11px/1.35 ui-monospace,monospace;color:#3A2A1F;'
      + 'background:#FFF6E8E6;border-radius:8px;padding:4px 8px;pointer-events:none;white-space:pre;contain:layout paint;';
    document.body.appendChild(el);
    this._overlay = el;
  }

  _tickOverlay() {
    const dt = this.frame[(this.i + this.frame.length - 1) % this.frame.length] / 1000;
    this._overlayT += dt;
    if (this._overlayT < 1 / PERF.overlayHz) return;
    this._overlayT = 0;
    const n = this.n, p50 = percentile(this.frame, n, 0.5), p99 = percentile(this.frame, n, 0.99);
    const ctx = this.game.ctx, info = ctx.renderer.info, pf = ctx.postfx;
    const gpu = this.gpuN ? this._avg(this.gpu, this.gpuN).toFixed(2) + ' ms' : 'n/a';
    this._overlay.textContent =
      `fps ${(1000 / Math.max(1, p50)).toFixed(0)} p50 ${p50.toFixed(1)} p99 ${p99.toFixed(1)} ms\n`
      + `cpu sim ${this._avg(this.sim).toFixed(2)} render ${this._avg(this.render).toFixed(2)} submit ${this._avg(this.submit).toFixed(2)}\n`
      + `gpu ${gpu}\n`
      + `calls ${info.render.calls} tris ${(info.render.triangles / 1000).toFixed(1)}k prog ${info.programs?.length ?? 0}\n`
      + `s ${pf.scale.toFixed(2)} dpr ${ctx.renderer.getPixelRatio().toFixed(2)} ${pf.qualityName} cap ${pf.pacing.cap || 'off'} rung ${pf.pacing.thermalRung}`;
  }

  dispose() { this._po?.disconnect?.(); this.gpuTimer?.dispose(); this._overlay?.remove(); this._overlay = null; }
}

/** The IMPLEMENTATION_PLAN §5 budget row for this tier at the build's stage. */
export function budgetFor(q, stage = PERF.stage) {
  const B = PERF.budgets, col = B[stage] ?? B.I1;
  const out = { stage };
  for (const k of Object.keys(col)) out[k] = col[k][q] ?? col[k].med;
  return out;
}

/**
 * Draws per `userData.perfCat` this frame (estimate, report time only): visible meshes under each tagged root that
 * pass the camera frustum, × material groups.
 */
export function drawsByCat(ctx) {
  const out = {}; for (const c of PERF_CATS) out[c] = 0;
  const cam = ctx.camera, scene = ctx.scene;
  if (!cam || !scene) return out;
  const fr = typeof ctx.cam?.frustum?.intersectsObject === 'function' ? ctx.cam.frustum : frustumOf(cam);
  const visit = (o, cat) => {
    if (!o.visible) return;
    const c = o.userData?.perfCat ?? cat;
    if (c && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) {
      let inside = true;
      if (o.frustumCulled && fr) { try { inside = o.isSprite ? fr.intersectsSprite(o) : fr.intersectsObject(o); } catch { inside = true; } }
      if (inside) out[c] = (out[c] ?? 0) + (Array.isArray(o.material) ? Math.max(1, o.geometry?.groups?.length ?? 1) : 1);
    }
    for (const ch of o.children) visit(ch, c);
  };
  visit(scene, null);
  return out;
}

const _fr = new THREE.Frustum(), _m = new THREE.Matrix4();
/** The camera's frustum (scratch; report time only). */
function frustumOf(cam) {
  cam.updateMatrixWorld?.();
  _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return _fr.setFromProjectionMatrix(_m);
}

/**
 * Estimated GPU texture memory in MB (PERF §12 `texMB`): every unique texture reachable from scene materials and
 * the post chain, w × h × 4 bytes (× 2 for half float), × 4/3 with mipmaps. Report time only.
 */
export function textureMB(ctx) {
  const seen = new Set();
  let bytes = 0;
  const addTex = (t) => {
    if (!t || !t.isTexture || seen.has(t)) return;
    seen.add(t);
    const img = t.image, w = img?.width ?? img?.videoWidth ?? 0, h = img?.height ?? img?.videoHeight ?? 0;
    const d = img?.depth ?? 1;
    const bpp = t.type === 1016 /* HalfFloatType */ ? 8 : t.type === 1015 /* FloatType */ ? 16 : 4;
    let b = w * h * d * bpp;
    if (t.generateMipmaps !== false && t.minFilter !== 1006 && t.minFilter !== 1003) b *= 4 / 3;
    if (t.isCubeTexture) b *= 6;
    bytes += b;
  };
  ctx.scene?.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
    if (!mats) return;
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); }
      const u = m.uniforms;
      if (u) for (const k in u) { const v = u[k]?.value; if (v && v.isTexture) addTex(v); }
    }
  });
  const chain = ctx.postfx?.chain;
  if (chain) {
    const rtBytes = (rt, bpp) => rt.width * rt.height * bpp * Math.max(1, rt.samples || 1);
    bytes += rtBytes(chain.rt0, 8);
    for (const rt of chain.mipRT) bytes += rtBytes(rt, 8);
  }
  if (ctx.renderer?.shadowMap?.enabled) {
    const sz = ctx.quality?.shadowMap ?? 0;
    bytes += sz * sz * 4;
  }
  return +(bytes / 1048576).toFixed(2);
}
