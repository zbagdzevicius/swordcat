// src/core/Loop.js  (owner: core) — fixed timestep + interpolation (tech.md §6).
// Hitstop lives in Game.step (the world freezes, rendering continues); slow motion is `timeScale`.
import * as THREE from 'three';
import { LOOP } from './config.js';

export class Loop {
  /**
   * @param {{ setAnimationLoop(fn: ((t:number)=>void)|null): void } | null} renderer
   * @param {{ step?:number, maxSteps?:number, maxFrameDt?:number, update:(dt:number)=>void,
   *           render:(alpha:number, frameDt:number)=>void, before?:(frameDt:number)=>void }} opts
   */
  constructor(renderer, { step = LOOP.step, maxSteps = LOOP.maxSteps, maxFrameDt = LOOP.maxFrameDt, update, render, before = null }) {
    Object.assign(this, { renderer, step, maxSteps, maxFrameDt, update, render, before, acc: 0, timeScale: 1 });
    this.timer = new THREE.Timer();
    if (typeof document !== 'undefined') this.timer.connect(document);   // resets delta after the tab becomes visible
    this.running = false;
    this.frameDt = 0; this.alpha = 0; this.stepsLastFrame = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.renderer?.setAnimationLoop((t) => this.tick(t));
  }

  stop() { this.running = false; this.renderer?.setAnimationLoop(null); }

  /** One rendered frame. `t` is the rAF timestamp in ms. */
  tick(t) {
    this.timer.update(t);
    const frameDt = Math.min(this.timer.getDelta(), this.maxFrameDt);   // clamp long frames
    this.advance(frameDt);
  }

  /** Advance by a real-time delta (used by tick; tests call it directly). */
  advance(frameDt) {
    this.frameDt = frameDt;
    this.before?.(frameDt);
    this.acc += frameDt * this.timeScale;
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) { this.update(this.step); this.acc -= this.step; n++; }
    if (n === this.maxSteps) this.acc = 0;                                // avoid the spiral of death
    this.stepsLastFrame = n;
    this.alpha = this.acc / this.step;
    this.render(this.alpha, frameDt);
  }

  dispose() { this.stop(); this.timer.dispose?.(); }
}
