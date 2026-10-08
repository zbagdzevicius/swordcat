// src/camera/MemeCam.js  (owner: camera) — the Meme Cam framing (GAME_DESIGN §7.8, §5.2 MEME_LOOP) [TREND V1].
// FollowCamera owns the transitions: glide in over PLAYER.memeCam.blendIn (2.0 s) on a cylindrical arc around
// her, any input exits with a blendOut (0.6 s) back to follow. This module computes the held framing:
// MEME_LOOP in her local frame (her facing frozen at entry; FollowCamera may rotate the framing up to 60° around
// her when a wall, fence or trunk stands in front of her face), plus the 0.005 m handheld sway that repeats
// EXACTLY every 3.8 s, so the cape sway shader and the grass wind (same period) loop seamlessly with it.
//
// Sync for other areas: `ctx.cam.memeT` (0..3.8 s, loop-local time; 0 on entry) and `ctx.cam.memePhase` (0..1).
import * as THREE from 'three';
import { PLAYER } from '../core/config.js';
import { CamPose } from './pose.js';
import { PRESETS, localToWorld, memeSway } from './presets.js';

const _s = { x: 0, y: 0, z: 0 }, _l = [0, 0, 0];

export class MemeCam {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    /** loop-local time (s), wraps at `period` */
    this.t = 0;
    /** total time in the loop since entry (s) */
    this.elapsed = 0;
    this.period = PRESETS.MEME_LOOP.loop ?? PLAYER.memeCam.loop;
    /** her facing at entry (+ yawOffset): the framing never swings with small turns */
    this.yaw = 0;
    /** rotation of the framing around her (rad) chosen at entry so a wall / fence / trunk doesn't block the lens */
    this.yawOffset = 0;
    this.anchor = null;
    this.pose = new CamPose();
    this.origin = new THREE.Vector3();
  }

  get phase() { return this.t / this.period; }

  /**
   * @param {any} actor the subject (the player)
   * @param {number} [yawOffset] rotate the framing around her (rad; 0 = straight in front of her face)
   */
  enter(actor, yawOffset = 0) {
    this.active = true; this.t = 0; this.elapsed = 0;
    this.anchor = actor ?? null;
    this.yawOffset = Number.isFinite(yawOffset) ? yawOffset : 0;
    this.yaw = (actor?.facing ?? 0) + this.yawOffset;
    this._origin();
    this._compute();
    return this.pose;
  }

  exit() { this.active = false; this.anchor = null; this.yawOffset = 0; }

  _origin() {
    const a = this.anchor;
    if (a) this.origin.copy(a.object3d?.position ?? a.pos);
    return this.origin;
  }

  /** Advance the loop by `dt` (real seconds) and return the framing. */
  update(dt) {
    if (!this.active) return this.pose;
    this.elapsed += dt;
    this.t = this.elapsed % this.period;
    this._origin();
    return this._compute();
  }

  /**
   * The MEME_LOOP pose at loop time `t` (defaults to the current one) for the current origin/yaw → `out`.
   * Exposed for tests: sample(t) and sample(t + period) are identical.
   */
  sample(t = this.t, out = this.pose) {
    const P = PRESETS.MEME_LOOP;
    memeSway(t, this.period, P.sway, _s);
    _l[0] = P.pos[0] + _s.x; _l[1] = P.pos[1] + _s.y; _l[2] = P.pos[2] + _s.z;
    localToWorld(_l, this.origin, this.yaw, out.pos);
    // the look point sways at a third of the amplitude: a hint of handheld rotation, never a wobble
    _l[0] = P.look[0] + _s.x * 0.33; _l[1] = P.look[1] + _s.y * 0.33; _l[2] = P.look[2];
    localToWorld(_l, this.origin, this.yaw, out.look);
    out.fov = P.fov; out.roll = 0;
    return out;
  }

  _compute() {
    const out = this.sample(this.t, this.pose);
    // never inside rising ground in front of her
    const h = this.ctx.physics?.heightAt?.(out.pos.x, out.pos.z);
    if (Number.isFinite(h) && out.pos.y < h + 0.15) { const d = h + 0.15 - out.pos.y; out.pos.y += d; out.look.y += d * 0.5; }
    return out;
  }
}
