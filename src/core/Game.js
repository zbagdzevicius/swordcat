// src/core/Game.js  (owner: core) — creates renderer/scene/camera/ctx, owns the system order, modes,
// hitstop, slow motion, pause and boot. tech.md §4, §6 + GAME_DESIGN §19.1 A4/A7.
import * as THREE from 'three';
import * as config from './config.js';
import { E } from './events.js';
import { EventBus } from './EventBus.js';
import { Loop } from './Loop.js';
import { Input } from './Input.js';
import { Assets } from './Assets.js';
import { ActorRegistry } from './ActorRegistry.js';
import { GameState, OS_SETTINGS, applyOsSettings, osReducedMotion } from './GameState.js';
import { PostFX, usesFxaaPath } from './PostFX.js';
import { installToon } from './toon.js';
import { PerfMonitor, markOnce } from './perf.js';
import { createRng } from './rng.js';
import { SYSTEMS, loadSystems, STEP_ORDER, RENDER_ORDER, INIT_ORDER, MODE_GATES, GAMEPLAY_SYSTEMS } from './systems.js';
import { S as STRINGS, t as translate, has as hasString } from '../story/strings.js';
import { isFramed } from './embed.js';
import { showRecovery } from './recovery.js';

/**
 * Debug switches allowed in this build? The Vite dev server, or a build made with VITE_SWORDCAT_DEBUG=1
 * (`npm run build:test` → dist-test/, the smoke bundle). A production build (`npm run build`) never is (F4). Pure.
 * @param {{DEV?: boolean, VITE_SWORDCAT_DEBUG?: string}|null|undefined} env  import.meta.env
 */
export function debugAllowed(env) {
  return !!env && (env.DEV === true || env.VITE_SWORDCAT_DEBUG === '1' || env.VITE_SWORDCAT_DEBUG === 1);
}

/**
 * Compile-time twin of debugAllowed(import.meta.env): Vite inlines both operands, so in a production build this is
 * `false` and the debug.js chunk (window.__GAME__, lil-gui, stats) is dropped from the bundle entirely.
 */
const HOOKS_BUILD = !!(import.meta.env.DEV || import.meta.env.VITE_SWORDCAT_DEBUG === '1');

/** import.meta.env, or {} where it does not exist. */
function viteEnv() { try { return import.meta.env ?? {}; } catch { return {}; } }

/**
 * URL switches. Debug ones, only where debugAllowed(env) and never in embed mode: ?test (hooks, auto-start, fixed seed
 * 1, no save load, no pointer lock, no dynamic res), ?debug (hooks + Stats/lil-gui), ?perf (`__GAME__.perf()` + the
 * PERF §12 overlay), ?level=<id>&spawn=<id>. Everywhere: ?seed=N, ?quality=low|med|high|auto, ?mute, ?cam=classic.
 * `embed` = ?embed=1 inside a frame (core/embed.js; `framed` comes from the caller so this stays pure).
 * @param {string} search
 * @param {{DEV?: boolean, VITE_SWORDCAT_DEBUG?: string}} [env]  defaults to import.meta.env
 * @param {{framed?: boolean}} [opts]
 */
export function parseParams(search = '', env = viteEnv(), { framed = false } = {}) {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const embed = framed && flag('embed');
  const hooks = debugAllowed(env) && !embed;
  const test = hooks && flag('test'), debug = hooks && flag('debug'), perf = hooks && flag('perf');
  const seedRaw = q.get('seed');
  const seed = seedRaw != null && seedRaw !== '' && Number.isFinite(+seedRaw) ? (+seedRaw >>> 0) : (test ? 1 : (Date.now() >>> 0));
  // CONTROLS_SPEC §15.3: ?cam=classic keeps the M1/M2 orbit camera, lens fog, pointer lock and bindings
  const cam = q.get('cam') === 'classic' ? 'classic' : 'iso';
  return {
    test, debug, seed, level: hooks ? q.get('level') || null : null, spawn: hooks ? q.get('spawn') || null : null,
    quality: q.get('quality') || null, mute: flag('mute'), cam, perf, embed, hooks,
  };
}

/**
 * @typedef {object} Ctx  FROZEN shape (tech.md §4.1 + §19.1 A4 + core additions marked +)
 * @property {Game} game
 * @property {EventBus} bus
 * @property {typeof config} config           core/config.js (module namespace)
 * @property {THREE.WebGLRenderer} renderer
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {Input} input
 * @property {Assets} assets
 * @property {ActorRegistry} actors
 * @property {GameState} state
 * @property {import('./rng.js').Rng} rng   seeded () => [0,1) with helpers
 * @property {any} physics      physics/Physics.js
 * @property {any} combat       combat/Combat.js
 * @property {any} cam          camera/FollowCamera.js
 * @property {any} player       player/Player.js (created at boot; null only before construction)
 * @property {any} enemies      enemies/EnemyManager.js
 * @property {any} companions   companions/CompanionManager.js
 * @property {any} levels       world/LevelManager.js
 * @property {any} env          world/Env.js                 (A4)
 * @property {any} objectives   world/Objectives.js          (A4)
 * @property {{t:(key:string, vars?:object)=>string, has:(key:string)=>boolean, S:object}} strings   story/strings.js (A4)
 * @property {any} fx           fx/FX.js
 * @property {any} audio        audio/AudioManager.js
 * @property {any} story        story/StoryManager.js
 * @property {any} ui           ui/UI.js
 * @property {any} save         save/SaveManager.js
 * @property {PostFX} postfx    + render path (direct to canvas in play, K1), setCinematic(on, opts) (High PostChain), quality, pacing (dyn-res, fps cap, thermal: particleScale / grassScale), setScale(s), warmTargets() / prewarmCinematic(); setBloom / setVignette / setGrade record only in play
 * @property {object} quality   + active QUALITY preset (config.QUALITY.*; `shadows` is 'sun'|'none': use config.qualityShadowsOn)
 * @property {ReturnType<typeof parseParams>} params  + URL switches
 *
 * IMPLEMENTATION_PLAN §7.2 surface (additive; code defensively with `?.` until each owner lands it):
 * - core modules: math.js `smoothDamp` / `smoothDamp2`, schedule.js `every(game, hz, phase)`, depth.js `depthFor(o)`,
 *   prewarm.js `prewarm(renderer, scene, camera, roots, {batch})`, toon.js `installToon()`, uniforms.js `uViewport`
 *   (drawing-buffer px, written by PostFX on every resize), perf.js `PerfMonitor` (`game.perf`; `__GAME__.perf()`), `countPoolMiss()`, `PERF_CATS` (`userData.perfCat`).
 * - cam: footprint {q, cx, cz, ahead, behind, halfW, halfWTop, slantMax, d, version}, inFootprint(x, z, pad), frustum,
 *   frameId, inView(p, r), activityOf(actor), onScreen(p, margin) (= SafeFrame-visible, K4), safeFrame,
 *   groundAxes(outU, outR), closeUp, probe(), framing().
 * - player: moveIntent {x, z, speed, kind}, groundY, orders.lookAhead(d, out), aim.range. combat: tokens.holdersInto(kind, out).
 * - ui: screenOccluders() → {version, rects}, ui.flash(color, alpha, dur). fx: fx.blobs.add(object3d, r) / remove.
 * - world (modules): Env `TONE`, `ENV_U`, HeightFog `withHeightFog`, `StaticShadow`; characters (modules):
 *   makeToonMaterial, getToonMaterial, makeMetalMaterial, softRamp, toonLib, setCloseUp, setActivity(tier),
 *   debugFeatures(), buildOutline, Squash.
 */

export class Game {
  /** @param {HTMLElement} root  canvas host @param {{params?: ReturnType<typeof parseParams>}} [opts] */
  constructor(root, { params } = {}) {
    this.root = root;
    this.params = params ?? parseParams(typeof location !== 'undefined' ? location.search : '', viteEnv(), { framed: isFramed() });
    /** 'play' | 'dialog' | 'cutscene' | 'menu' | 'memecam' */
    this.mode = 'play';
    this._modeBeforeMenu = 'play';
    this.hitstopT = 0;
    this.time = 0;            // simulation seconds
    this.realTime = 0;        // rendered seconds
    this.frameCount = 0; this.stepCount = 0;
    this.started = false; this.bootedFrame = -1;
    this.baseTimeScale = 1;
    this._slow = [];          // [{ scale, t }] real-time slow-motion requests
    this._frameHooks = new Set();
    this._errAt = new Map();
    /** @type {Ctx} */
    this.ctx = /** @type {any} */ (null);
  }

  get paused() { return this.mode === 'menu'; }

  // ------------------------------------------------------------------ boot
  async start() {
    if (this.started) return;
    this.started = true;
    const params = this.params;
    // PERF §10.2 / C16: both system sets download while the context and the shell boot (two promises, one per set)
    const bootReady = loadSystems('boot'), playReady = loadSystems('play');

    // S1 (PERF C3 + C11, ART §3.1): toon chunks patched before the first compile; canvas MSAA on every tier (X1:
    // play renders straight to the canvas; `antialias` is a context flag, so only the build-time Med FXAA fallback
    // turns it off); Neutral tone mapping (K1); no synchronous shader checks outside dev / ?debug / ?test.
    installToon();
    const renderer = new THREE.WebGLRenderer({ antialias: wantsCanvasAA(params.quality), powerPreference: 'high-performance', stencil: false });
    renderer.debug.checkShaderErrors = devBuild() || params.debug || params.test;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = toneMappingOf(config.RENDER.toneMapping);
    renderer.toneMappingExposure = config.RENDER.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false;          // Game resets once per frame: info = the whole frame (incl. post)
    renderer.domElement.tabIndex = 0;
    renderer.domElement.id = 'game-canvas';
    this.root.appendChild(renderer.domElement);
    this._bindContextLoss(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.RENDER.background);   // warm until Env sets the level's (WA §2.1)
    // PERF §8.5 (submit): the scene root never moves. With matrixAutoUpdate on, its per-frame updateMatrix() flags
    // matrixWorldNeedsUpdate and `force`s a matrixWorld multiply on EVERY descendant each render, so the frozen
    // statics (world freezeStatics) only skipped the compose. Off, only subtrees that actually changed recompute.
    scene.matrixAutoUpdate = false;
    const camera = new THREE.PerspectiveCamera(config.RENDER.fov, 16 / 9, config.RENDER.near, config.RENDER.far);
    camera.position.set(0, 2, -4);
    scene.add(camera);   // audio listener / camera-attached fx live under it

    const bus = new EventBus();
    const ctx = this.ctx = /** @type {Ctx} */ ({
      game: this, bus, config, renderer, scene, camera,
      input: null, assets: null, actors: new ActorRegistry(), state: new GameState(), rng: createRng(params.seed),
      physics: null, combat: null, cam: null, player: null, enemies: null, companions: null, levels: null,
      env: null, objectives: null, strings: null, fx: null, audio: null, story: null, ui: null, save: null,
      postfx: null, quality: config.QUALITY.med, params,
    });
    // strings (A4) + CONTROLS_SPEC §12 ui 3: device-aware copy (`key.touch` / `key.pad` before the base KBM text)
    ctx.strings = {
      t: (key, vars) => {
        const d = ctx.input?.device;
        return translate((d === 'touch' || d === 'pad') && typeof key === 'string' && hasString(`${key}.${d}`) ? `${key}.${d}` : key, vars);
      },
      has: hasString, S: STRINGS,
    };
    ctx.input = new Input(ctx);
    ctx.input.pointerLockEnabled = !params.test && !ctx.input.iso;
    ctx.assets = new Assets(ctx);
    ctx.postfx = new PostFX(ctx);
    ctx.postfx.dynamicRes = !params.test;
    /** PERF §12 instrumentation; per-system timers only with ?test / ?debug / ?perf */
    this.perf = new PerfMonitor(this, { detailed: params.test || params.debug || params.perf });
    this.perf.attach(renderer);

    /** @type {Map<string, any>} */
    this.systems = new Map([['input', ctx.input]]);
    // C16: both sets have been downloading since the top of start(). Every system is constructed in SYSTEMS order once
    // both land: building the boot set first (staged) blanked every core:levels / art:warm frame in the smoke, so the
    // construction order stays as it is; and the title backdrop is a world level (CS-00 on `meadow`), so the title
    // cannot come up on the boot set alone yet.
    await Promise.all([bootReady, playReady]);
    for (const s of SYSTEMS) {
      const inst = new s.Class(ctx);
      ctx[s.key] = inst;
      this.systems.set(s.key, inst);
    }
    this.stepList = STEP_ORDER.filter((k) => this.systems.has(k)).map((k) => [k, this.systems.get(k)]);
    this.renderList = RENDER_ORDER.filter((k) => this.systems.has(k)).map((k) => [k, this.systems.get(k)]);

    // debug.js is its own lazy chunk (PERF §10.2): only ?test / ?debug / ?perf download it, and only in a dev / build:test
    // bundle (F4: HOOKS_BUILD is false in a production build, so the import is dropped there)
    this.debugApi = null;
    if (HOOKS_BUILD && params.hooks && (params.test || params.debug || params.perf)) {
      const { installDebug, installPerfOnly } = await import('./debug.js');
      this.debugApi = params.test || params.debug ? installDebug(this) : installPerfOnly(this);
    }
    if (params.perf) this.perf.showOverlay();

    // persistence (never in ?test: runs must be reproducible)
    if (!params.test) {
      const saved = safe(() => ctx.save.load?.(), null);
      if (saved) { ctx.state.reset(saved); bus.emit(E.SAVE_LOADED, { data: saved }); }
    }

    ctx.input.attach(renderer.domElement);
    ctx.postfx.setQuality(this._qualityName());
    this._applyCap();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    bus.on(E.HITSTOP, (p) => this.requestHitstop(p?.seconds ?? 0));
    bus.on(E.SETTINGS_CHANGED, (p) => {
      if (p?.key === 'quality' || p?.key === 'batterySaver') ctx.postfx.setQuality(this._qualityName());
      if (p?.key == null || p.key === 'fpsCap' || p.key === 'batterySaver') this._applyCap();
    });
    bus.on(E.QUALITY, (p) => { if (this.loop) this.loop.maxSteps = loopStepsFor(p?.name); this._applyCap?.(); });
    bus.on(E.LEVEL_LOADED, () => ctx.postfx.pacing.resetProbe());
    ctx.assets.init();                     // level-change cache release (PERF §5 heap)
    if (!params.test) this._bindOsSettings();

    for (const key of INIT_ORDER) {
      const sys = this.systems.get(key);
      if (sys?.init) await sys.init();
    }
    // the first setQuality() above ran before any system subscribed: announce the boot preset once more
    bus.emit(E.QUALITY, { name: ctx.postfx.qualityName, preset: ctx.quality });

    this.loop = new Loop(renderer, {
      maxSteps: loopStepsFor(ctx.postfx.qualityName),
      update: (dt) => this.step(dt),
      render: (alpha, frameDt) => this.frame(alpha, frameDt),
      before: (frameDt) => this.beforeFrame(frameDt),
      gate: (rafDt) => ctx.postfx.pacing.gate(rafDt),
    });
    bus.emit(E.GAME_READY, {});
    this.loop.start();
    await this.boot();
  }

  /**
   * F5: WebGL context loss. `webglcontextlost` → preventDefault (allows a restore), stop the loop, save, show the
   * "Tap to continue" panel; `webglcontextrestored` or the tap → reload the page (every GPU resource is gone; a full
   * reload is the one path that rebuilds them all correctly). No-op without addEventListener (node tests).
   * @param {HTMLCanvasElement} canvas
   */
  _bindContextLoss(canvas) {
    if (typeof canvas?.addEventListener !== 'function') return;
    const reload = () => { try { location.reload(); } catch { /* */ } };
    this._onContextLost = (ev) => {
      ev?.preventDefault?.();
      if (this.contextLost) return;
      this.contextLost = true;
      console.warn('[game] WebGL context lost');
      safe(() => this.loop?.stop());
      safe(() => this.ctx?.save?.save?.('contextlost'));
      safe(() => showRecovery('context', { strings: this.ctx?.strings, onAction: reload }));
    };
    this._onContextRestored = () => { console.warn('[game] WebGL context restored; reloading'); reload(); };
    canvas.addEventListener('webglcontextlost', this._onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
  }

  /** Load the first level: ?level/&spawn, else `meadow` spawn `title` (the CS-00 backdrop; story takes over). */
  async boot() {
    const p = this.params;
    const level = p.level ?? 'meadow';
    const spawn = p.spawn ?? (p.level ? 'start' : 'title');
    try {
      await this.ctx.levels.load(level, spawn);
    } finally {
      dropSplash();
    }
    this.bootedFrame = this.frameCount;
    markOnce(spawn === 'title' ? 'title' : 'play');   // T_title / T_play (PERF §12; the smoke reads them)
  }

  /** The preset to run: ?quality, else battery saver → low, else settings.quality ('auto' by default). */
  _qualityName() {
    const p = this.params, st = this.ctx?.state?.settings;
    if (p.quality) return p.quality;
    if (st?.batterySaver) return 'low';
    return st?.quality ?? 'auto';
  }

  /** settings.fpsCap / batterySaver + the preset's cap → the pacing frame cap (PERF §5.3, §5.4). ?test is uncapped. */
  _applyCap() {
    const st = this.ctx.state.settings, pf = this.ctx.postfx;
    pf.pacing.setCap({ setting: this.params.test ? 'off' : (st.fpsCap ?? 'auto'), presetCap: pf.quality.fpsCap ?? 60, batterySaver: !this.params.test && !!st.batterySaver });
  }

  /**
   * IMPLEMENTATION_PLAN §7.4 (AUTOCAM §10.1, ART §11): `reduceCameraMotion` / `reduceFlashes` follow the OS
   * `prefers-reduced-motion` (first run and on its `change` event) until the player edits them; an edit (any
   * SETTINGS_CHANGED without `source: 'os'`) clears `<key>Auto`. Never in ?test (runs must be reproducible).
   */
  _bindOsSettings() {
    const { bus, state } = this.ctx;
    const sync = () => {
      for (const key of applyOsSettings(state.settings, osReducedMotion())) bus.emit(E.SETTINGS_CHANGED, { key, value: state.settings[key], source: 'os' });
    };
    sync();
    bus.on(E.SAVE_LOADED, sync);
    bus.on(E.SETTINGS_CHANGED, (p) => { if (p?.source !== 'os' && OS_SETTINGS.includes(p?.key)) state.settings[`${p.key}Auto`] = false; });
    try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', sync); } catch { /* no matchMedia */ }
  }

  resize() {
    const w = this.root?.clientWidth || window.innerWidth, h = this.root?.clientHeight || window.innerHeight;
    this.ctx.camera.aspect = w / Math.max(1, h);
    this.ctx.camera.updateProjectionMatrix();
    this.ctx.postfx.setSize(w, h);
  }

  // ------------------------------------------------------------------ modes, time
  /** §19.1 A7. In 'dialog'/'cutscene' only story, scripted actors, camera, fx, ui, audio (and env) update. */
  setMode(mode) {
    if (!config.MODES.includes(mode)) { console.warn(`[game] unknown mode "${mode}"`); return; }
    if (mode === this.mode) return;
    const prev = this.mode;
    if (mode === 'menu') this._modeBeforeMenu = prev;
    this.mode = mode;
    if (mode === 'menu') this.ctx.input.exitPointerLock();
    else if (prev === 'menu' && (mode === 'play' || mode === 'memecam')) this.ctx.input.relock?.();
    if (mode === 'menu' || prev === 'menu') this.ctx.bus.emit(E.GAME_PAUSE, { paused: mode === 'menu' });
    this.ctx.bus.emit(E.GAME_MODE, { mode, prev });
  }

  /** Pause = mode 'menu'; unpause returns to the mode active before the menu. */
  pause(on = true) { this.setMode(on ? 'menu' : (this._modeBeforeMenu === 'menu' ? 'play' : this._modeBeforeMenu)); }

  /** True if `actor` should simulate this step (always in play/memecam; only scripted actors in dialog/cutscene). */
  simActive(actor) {
    const m = this.mode;
    if (m === 'play' || m === 'memecam') return true;
    if (m === 'menu') return false;
    return actor?.scripted === true;
  }

  /** True while ordinary gameplay runs (play/memecam, no level loading). */
  get gameplay() { return (this.mode === 'play' || this.mode === 'memecam') && !this.ctx?.levels?.loading; }

  /** Freeze the world for `sec` sim seconds (rendering continues; input edges stay latched). */
  requestHitstop(sec) { if (sec > 0) this.hitstopT = Math.max(this.hitstopT, sec); }

  /** Slow motion: `scale` for `realSec` real seconds (parry 0.5/0.15, Holy 0.35/0.25, Still Standing 0.4/0.8). Overlaps take the slowest. */
  slowMo(scale, realSec) {
    if (!(realSec > 0)) return;
    this._slow.push({ scale: Math.max(0.01, scale), t: realSec });
    this._applyTimeScale();
  }

  /** Persistent base time scale (cutscene `time` steps without dur; debug). */
  setTimeScale(scale) { this.baseTimeScale = Math.max(0, scale); this._applyTimeScale(); }

  _applyTimeScale() {
    let s = 1;
    for (const e of this._slow) s = Math.min(s, e.scale);
    if (this.loop) this.loop.timeScale = this.baseTimeScale * s;
  }

  /** Register a per-rendered-frame callback `fn(frameDt)`; returns an unsubscribe function. */
  addFrameHook(fn) { this._frameHooks.add(fn); return () => this._frameHooks.delete(fn); }

  // ------------------------------------------------------------------ loop
  beforeFrame(frameDt) {
    this.perf.beginFrame();
    this._simMs = 0;
    this.ctx.input.poll(frameDt);
    if (this._slow.length) {
      for (let i = this._slow.length - 1; i >= 0; i--) if ((this._slow[i].t -= frameDt) <= 0) this._slow.splice(i, 1);
      this._applyTimeScale();
    }
  }

  /** One fixed simulation step (tech.md §6). */
  step(dt) {
    const ctx = this.ctx;
    ctx.actors.beginStep();
    if (this.hitstopT > 0) { this.hitstopT = Math.max(0, this.hitstopT - dt); return; }   // world frozen; edges stay latched
    const gate = MODE_GATES[this.mode];
    const loading = !!ctx.levels?.loading;
    const t0 = now(), timed = this.perf?.detailed;
    for (const [key, sys] of this.stepList) {
      if (gate && !gate.has(key)) continue;
      if (loading && GAMEPLAY_SYSTEMS.has(key)) continue;
      const ts = timed ? now() : 0;
      try { sys.update(dt); } catch (e) { this._error(key, 'update', e); }
      if (timed) this.perf.sys(key, now() - ts);
    }
    this._simMs = (this._simMs ?? 0) + now() - t0;
    ctx.input.endStep();
    this.time += dt; this.stepCount++;
    if (!loading && this.mode !== 'menu') ctx.state.playtime += dt;
  }

  /** One rendered frame: systems render (actors → camera → fx → ui → audio), then post. */
  frame(alpha, frameDt) {
    this.realTime += frameDt;
    const perf = this.perf, timed = perf?.detailed, pf = this.ctx.postfx;
    const t0 = now();
    for (const [key, sys] of this.renderList) {
      if (!sys.render) continue;
      const ts = timed ? now() : 0;
      try { sys.render(alpha, frameDt); } catch (e) { this._error(key, 'render', e); }
      if (timed) perf.sys(key + ':render', now() - ts);
    }
    const t1 = now();
    pf.workMs = perf?.lastWorkMs ?? 0;
    pf.update(frameDt, perf?.gpuTimer?.lastMs ?? null);
    this.ctx.renderer.info.reset();
    perf?.gpuTimer?.begin();
    pf.render(frameDt);
    perf?.gpuTimer?.end();
    perf?.endFrame(this._simMs ?? 0, t1 - t0, now() - t1, this.loop?.stepsLastFrame ?? 0);
    this._simMs = 0;
    this.frameCount++;
    for (const fn of this._frameHooks) { try { fn(frameDt); } catch (e) { this._error('hook', 'frame', e); } }
    if (this.debugApi && !this.debugApi.ready && this.bootedFrame >= 0 && this.frameCount - this.bootedFrame >= 10) this.debugApi.ready = true;
  }

  _error(key, phase, e) {
    const k = key + ':' + phase, now = this.realTime;
    const last = this._errAt.get(k);
    if (last !== undefined && now - last < 2) return;      // rate-limit repeats
    this._errAt.set(k, now);
    console.error(`[game] ${key}.${phase} threw`, e);
  }

  dispose() {
    this.loop?.stop();
    const cv = this.ctx?.renderer?.domElement;
    if (cv && this._onContextLost) { cv.removeEventListener('webglcontextlost', this._onContextLost); cv.removeEventListener('webglcontextrestored', this._onContextRestored); }
    for (const key of [...INIT_ORDER].reverse()) safe(() => this.systems.get(key)?.dispose?.());
    window.removeEventListener('resize', this._onResize);
    this.ctx.postfx.dispose();
    this.perf?.dispose();
    this.ctx.renderer.dispose();
    this.ctx.renderer.domElement.remove();
    this._frameHooks.clear();
  }
}

function safe(fn, fallback) { try { return fn(); } catch (e) { console.warn('[game]', e); return fallback; } }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** True in the Vite dev server (shader checks stay on there; PERF §3.2). */
function devBuild() { try { return !!import.meta.env?.DEV; } catch { return false; } }

/** RENDER.toneMapping name → three constant (Neutral by default; K1, PERF §6.2). */
export function toneMappingOf(name) {
  return name === 'aces' ? THREE.ACESFilmicToneMapping : name === 'none' ? THREE.NoToneMapping : THREE.NeutralToneMapping;
}

/**
 * Canvas MSAA for a requested preset (X1): on for every tier, except the build-time Med FXAA fallback (`RENDER.medAA
 * === 'fxaa'`) when Med is requested explicitly ('auto' keeps it on: the context flag cannot change later).
 * @param {string|null|undefined} quality
 */
export function wantsCanvasAA(quality) { return !usesFxaaPath({ id: quality }, config.RENDER.medAA); }

/** Fixed-step cap per preset (PERF §4.1): Low 3, else 4. */
export function loopStepsFor(name) { return name === 'low' ? config.LOOP.maxStepsLow : config.LOOP.maxSteps; }

/**
 * Fade the warm splash out (PERF §10.1) once the title (or the ?level) is up, then remove it. ui may restyle it;
 * core guarantees it never covers a running game.
 */
export function dropSplash() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 450);
}
