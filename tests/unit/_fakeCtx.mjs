// tests/unit/_fakeCtx.mjs  (owner: core) — shared helper for unit tests (not a test file itself).
//   import { fakeCtx } from './_fakeCtx.mjs';
//   const ctx = fakeCtx();                 // every system constructed (no init), no DOM, no network
//   const ctx2 = fakeCtx({ systems: false }); // core services only; add your own system: ctx.combat = new Combat(ctx)
import * as THREE from 'three';
import * as config from '../../src/core/config.js';
import { EventBus } from '../../src/core/EventBus.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { GameState } from '../../src/core/GameState.js';
import { Input } from '../../src/core/Input.js';
import { Assets } from '../../src/core/Assets.js';
import { createRng } from '../../src/core/rng.js';
import * as strings from '../../src/story/strings.js';
import { SYSTEMS } from '../../src/core/systems.js';

/** A minimal Game stand-in: mode, hitstop, slow-mo and simActive behave like core/Game.js. */
export function fakeGame() {
  return {
    mode: 'play', hitstopT: 0, time: 0, realTime: 0, frameCount: 0, hitstops: [], slowMos: [],
    simActive(actor) { const m = this.mode; return m === 'play' || m === 'memecam' || ((m === 'dialog' || m === 'cutscene') && actor?.scripted === true); },
    requestHitstop(s) { this.hitstops.push(s); this.hitstopT = Math.max(this.hitstopT, s); },
    slowMo(scale, sec) { this.slowMos.push([scale, sec]); },
    setTimeScale() {},
    setMode(m) { this.mode = m; },
    addFrameHook: () => () => {},
    get gameplay() { return this.mode === 'play' || this.mode === 'memecam'; },
  };
}

/** @param {{ systems?: boolean, seed?: number, state?: object }} [opts] */
export function fakeCtx({ systems = true, seed = 1, state } = {}) {
  const ctx = {
    game: fakeGame(), bus: new EventBus(), config, renderer: null, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    actors: new ActorRegistry(), state: new GameState(state), rng: createRng(seed), params: { test: true }, quality: config.QUALITY.med,
    strings: { t: strings.t, has: strings.has, S: strings.S }, postfx: null,
    input: null, assets: null, physics: null, combat: null, cam: null, player: null, enemies: null, companions: null,
    levels: null, env: null, objectives: null, fx: null, audio: null, story: null, ui: null, save: null,
  };
  ctx.input = new Input(ctx);
  ctx.assets = new Assets(ctx);
  ctx.assets.model = () => new Promise(() => {});      // no network in node: visuals stay placeholders
  if (systems) for (const s of SYSTEMS) ctx[s.key] = new s.Class(ctx);
  return ctx;
}
