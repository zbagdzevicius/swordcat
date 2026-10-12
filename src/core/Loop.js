// src/core/Loop.js  (owner: core) — fixed timestep + interpolation (tech.md §6; PERF_SPEC §4.1, §5.3).
// Hitstop lives in Game.step (the world freezes, rendering continues); slow motion is `timeScale`.
// - 60 Hz fixed step everywhere; at most `maxSteps` per frame (4; Low 3), and when the cap is hit the remainder is
//   dropped (game time dilates for that frame instead of spiralling).
// - `gate(rafDtMs)` (optional, Pacing) decides per rAF whether this rAF renders (frame cap); skipped rAFs do not
//   advance the timer, so the next rendered frame sees the whole interval.
// - Paused while the document is hidden (`setAnimationLoop(null)`); THREE.Timer.connect resets the delta on return.
import * as THREE from 'three';
import { LOOP } from './config.js';

export class Loop {
  /**
   * @param {{ setAnimationLoop(fn: ((t:number)=>void)|null): void } | null} renderer
   * @param {{ step?:number, maxSteps?:number, maxFrameDt?:number, update:(dt:number)=>void,
   *           render:(alpha:number, frameDt:number)=>void, before?:(frameDt:number)=>void,
   *           gate?:((rafDtMs:number)=>boolean)|null }} opts
   */
  constructor(renderer, { step = LOOP.step, maxSteps = LOOP.maxSteps, maxFrameDt = LOOP.maxFrameDt, update, render, before = null, gate = null }) {
    Object.assign(this, { renderer, step, maxSteps, maxFrameDt, update, render, before, gate, acc: 0, timeScale: 1 });
    this.timer = new THREE.Timer();
    if (typeof document !== 'undefined') this.timer.connect(document);   // resets delta after the tab becomes visible
    this.running = false; this.hidden = false;
    this.frameDt = 0; this.alpha = 0;
    /** fixed steps run in the last rendered frame (PERF §4.1 `stepsThisFrame`) */
    this.stepsLastFrame = 0;
    /** times the step cap dropped a remainder */
    this.capHits = 0;
    this._lastRaf = -1;
    this._tick = (t) => this.tick(t);
    this._onVis = () => this._visibility();
  }

  /** `stepsThisFrame` alias (PERF §4.1 name). */
  get stepsThisFrame() { return this.stepsLastFrame; }

  start() {
    if (this.running) return;
    this.running = true;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVis);
    if (typeof document === 'undefined' || !document.hidden) this.renderer?.setAnimationLoop(this._tick);
    else this.hidden = true;
  }

  stop() {
    this.running = false;
    this.renderer?.setAnimationLoop(null);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVis);
  }

  _visibility() {
    if (!this.running) return;
    const hidden = !!document.hidden;
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this._lastRaf = -1;
    this.renderer?.setAnimationLoop(hidden ? null : this._tick);
  }

  /** One rAF. `t` is the rAF timestamp in ms. */
  tick(t) {
    const rafDt = this._lastRaf >= 0 ? t - this._lastRaf : 0;
    this._lastRaf = t;
    if (this.gate && !this.gate(rafDt)) return;           // frame cap: this rAF does not render
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
    const cap = Math.max(1, this.maxSteps | 0);
    while (this.acc >= this.step && n < cap) { this.update(this.step); this.acc -= this.step; n++; }
    if (n === cap && this.acc >= this.step) { this.acc = 0; this.capHits++; }   // drop the remainder (no spiral of death)
    this.stepsLastFrame = n;
    this.alpha = this.acc / this.step;
    this.render(this.alpha, frameDt);
  }

  dispose() { this.stop(); this.timer.dispose?.(); }
}
