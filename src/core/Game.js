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
import { GameState } from './GameState.js';
import { PostFX } from './PostFX.js';
import { createRng } from './rng.js';
import { installDebug } from './debug.js';
import { SYSTEMS, STEP_ORDER, RENDER_ORDER, INIT_ORDER, MODE_GATES, GAMEPLAY_SYSTEMS } from './systems.js';
import { S as STRINGS, t as translate, has as hasString } from '../story/strings.js';

/**
 * URL switches: ?test (hooks, auto-start, fixed seed 1, no save load, no pointer lock, no dynamic res),
 * ?debug (hooks + Stats/lil-gui), ?seed=N, ?level=<id>&spawn=<id>, ?quality=low|med|high|auto.
 * @param {string} search
 */
export function parseParams(search = '') {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const test = flag('test'), debug = flag('debug');
  const seedRaw = q.get('seed');
  const seed = seedRaw != null && seedRaw !== '' && Number.isFinite(+seedRaw) ? (+seedRaw >>> 0) : (test ? 1 : (Date.now() >>> 0));
  return { test, debug, seed, level: q.get('level') || null, spawn: q.get('spawn') || null, quality: q.get('quality') || null, mute: flag('mute') };
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
 * @property {PostFX} postfx    + bloom / vignette / quality
 * @property {object} quality   + active QUALITY preset (config.QUALITY.*)
 * @property {ReturnType<typeof parseParams>} params  + URL switches
 */

export class Game {
  /** @param {HTMLElement} root  canvas host @param {{params?: ReturnType<typeof parseParams>}} [opts] */
  constructor(root, { params } = {}) {
    this.root = root;
    this.params = params ?? parseParams(typeof location !== 'undefined' ? location.search : '');
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

    // Low quality renders without the composer, so only then does the default framebuffer need MSAA.
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: params.quality === 'low' || (coarse && !params.quality), powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.RENDER.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false;          // Game resets once per frame: info = the whole frame (incl. post)
    renderer.domElement.tabIndex = 0;
    renderer.domElement.id = 'game-canvas';
    this.root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#B7C0C3');
    const camera = new THREE.PerspectiveCamera(config.RENDER.fov, 16 / 9, config.RENDER.near, config.RENDER.far);
    camera.position.set(0, 2, -4);
    scene.add(camera);   // audio listener / camera-attached fx live under it

    const bus = new EventBus();
    const ctx = this.ctx = /** @type {Ctx} */ ({
      game: this, bus, config, renderer, scene, camera,
      input: null, assets: null, actors: new ActorRegistry(), state: new GameState(), rng: createRng(params.seed),
      physics: null, combat: null, cam: null, player: null, enemies: null, companions: null, levels: null,
      env: null, objectives: null, strings: { t: translate, has: hasString, S: STRINGS }, fx: null, audio: null, story: null, ui: null, save: null,
      postfx: null, quality: config.QUALITY.med, params,
    });
    ctx.input = new Input(ctx);
    ctx.input.pointerLockEnabled = !params.test;
    ctx.assets = new Assets(ctx);
    ctx.postfx = new PostFX(ctx);
    ctx.postfx.dynamicRes = !params.test;

    /** @type {Map<string, any>} */
    this.systems = new Map([['input', ctx.input]]);
    for (const s of SYSTEMS) {
      const inst = new s.Class(ctx);
      ctx[s.key] = inst;
      this.systems.set(s.key, inst);
    }
    this.stepList = STEP_ORDER.filter((k) => this.systems.has(k)).map((k) => [k, this.systems.get(k)]);
    this.renderList = RENDER_ORDER.filter((k) => this.systems.has(k)).map((k) => [k, this.systems.get(k)]);

    this.debugApi = installDebug(this);

    // persistence (never in ?test: runs must be reproducible)
    if (!params.test) {
      const saved = safe(() => ctx.save.load?.(), null);
      if (saved) { ctx.state.reset(saved); bus.emit(E.SAVE_LOADED, { data: saved }); }
    }

    ctx.input.attach(renderer.domElement);
    ctx.postfx.setQuality(params.quality ?? ctx.state.settings.quality ?? 'auto');
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    bus.on(E.HITSTOP, (p) => this.requestHitstop(p?.seconds ?? 0));
    bus.on(E.SETTINGS_CHANGED, (p) => { if (p?.key === 'quality') ctx.postfx.setQuality(p.value); });

    for (const key of INIT_ORDER) {
      const sys = this.systems.get(key);
      if (sys?.init) await sys.init();
    }
    // the first setQuality() above ran before any system subscribed: announce the boot preset once more
    bus.emit(E.QUALITY, { name: ctx.postfx.qualityName, preset: ctx.quality });

    this.loop = new Loop(renderer, {
      update: (dt) => this.step(dt),
      render: (alpha, frameDt) => this.frame(alpha, frameDt),
      before: (frameDt) => this.beforeFrame(frameDt),
    });
    bus.emit(E.GAME_READY, {});
    this.loop.start();
    await this.boot();
  }

  /** Load the first level: ?level/&spawn, else `meadow` spawn `title` (the CS-00 backdrop; story takes over). */
  async boot() {
    const p = this.params;
    const level = p.level ?? 'meadow';
    const spawn = p.spawn ?? (p.level ? 'start' : 'title');
    await this.ctx.levels.load(level, spawn);
    this.bootedFrame = this.frameCount;
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
    for (const [key, sys] of this.stepList) {
      if (gate && !gate.has(key)) continue;
      if (loading && GAMEPLAY_SYSTEMS.has(key)) continue;
      try { sys.update(dt); } catch (e) { this._error(key, 'update', e); }
    }
    ctx.input.endStep();
    this.time += dt; this.stepCount++;
    if (!loading && this.mode !== 'menu') ctx.state.playtime += dt;
  }

  /** One rendered frame: systems render (actors → camera → fx → ui → audio), then post. */
  frame(alpha, frameDt) {
    this.realTime += frameDt;
    for (const [key, sys] of this.renderList) {
      if (!sys.render) continue;
      try { sys.render(alpha, frameDt); } catch (e) { this._error(key, 'render', e); }
    }
    this.ctx.postfx.update(frameDt);
    this.ctx.renderer.info.reset();
    this.ctx.postfx.render(frameDt);
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
    for (const key of [...INIT_ORDER].reverse()) safe(() => this.systems.get(key)?.dispose?.());
    window.removeEventListener('resize', this._onResize);
    this.ctx.postfx.dispose();
    this.ctx.renderer.dispose();
    this.ctx.renderer.domElement.remove();
    this._frameHooks.clear();
  }
}

function safe(fn, fallback) { try { return fn(); } catch (e) { console.warn('[game]', e); return fallback; } }
