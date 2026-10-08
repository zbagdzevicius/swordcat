// src/core/Animator.js  (owner: core) — small AnimationMixer wrapper for GLB creatures (tech.md §11.1).
// Optional helper for any area. Drive it from render(frameDt); during hitstop pass 0 so creatures freeze
// with the simulation (tech.md §11.1): `anim.update(ctx.game.hitstopT > 0 ? 0 : dt)`.
import * as THREE from 'three';

export class Animator {
  /** @param {THREE.Object3D} root @param {THREE.AnimationClip[]} clips */
  constructor(root, clips = []) {
    this.mixer = new THREE.AnimationMixer(root);
    /** @type {Record<string, THREE.AnimationAction>} */
    this.actions = {};
    for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.current = null; this.currentName = null;
    this._waiters = new Map();
    this.mixer.addEventListener('finished', (e) => {
      const fn = this._waiters.get(e.action);
      if (fn) { this._waiters.delete(e.action); fn(); }
    });
  }

  has(name) { return !!this.actions[name]; }

  /** First clip name that exists, from a list of candidates (clip names differ per pack). */
  pick(...names) { for (const n of names.flat()) if (n && this.actions[n]) return n; return null; }

  /**
   * Cross-fade to a clip. Returns a Promise resolved when a `once` clip finishes (immediately for loops
   * or unknown clips). `from`/`to` (0..1) play only part of the clip.
   */
  play(name, { fade = 0.15, once = false, speed = 1, clampEnd = once, restart = false } = {}) {
    const next = this.actions[name];
    if (!next) return Promise.resolve();
    if (next === this.current && !restart && !once) { next.timeScale = speed; return Promise.resolve(); }
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = clampEnd;
    next.timeScale = speed;
    next.enabled = true;
    if (this.current && this.current !== next) { next.fadeIn(fade); this.current.fadeOut(fade); }
    next.play();
    const prev = this._waiters.get(this.current);
    if (prev && this.current !== next) { this._waiters.delete(this.current); prev(); }
    this.current = next; this.currentName = name;
    if (!once) return Promise.resolve();
    return new Promise((resolve) => this._waiters.set(next, resolve));
  }

  /** Freeze on a frame (e.g. a statue on frame 0, a clamped "sleep" pose). */
  pose(name, time = 0) {
    const a = this.actions[name]; if (!a) return;
    this.mixer.stopAllAction();
    a.reset(); a.play(); a.paused = true; a.time = time;
    this.current = a; this.currentName = name;
    this.mixer.update(0);
  }

  update(dt) { this.mixer.update(dt); }

  dispose() {
    for (const fn of this._waiters.values()) fn();
    this._waiters.clear();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
