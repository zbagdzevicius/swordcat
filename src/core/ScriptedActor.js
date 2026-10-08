// src/core/ScriptedActor.js  (owner: core) — default implementation of the §19.4 ScriptedActor interface.
// Optional helper: Player, NpcActor, Companion, Enemy and Pudding may use `ScriptedActorMixin(Actor)` and
// override the visual hooks, or implement the interface themselves. Pure (three math only); node-safe.
//
// Contract (used ONLY by story/Cutscene.js):
//   setScripted(on)                          AI and input off; physics on
//   moveTo(target, speed = 2) → Promise      target: Vector3 | [x, z] | [x, y, z] | anchor name | Actor
//   face(target, dur = 0.3) → Promise        target: Actor | Vector3 | [x, z] | anchor name | yaw number
//   pose(name, { hold = true })              'vigil','oath','sip','selfie','faint','kneel','sit','sleep','idle'
//   play(clip, { once, speed, clampEnd }) → Promise
//   emote(name)                              'earsFlat' | 'tailPuff' | 'blink' | 'nod' | 'shake' (no-op where unsupported)
//   prop(name, on)                           'milk_cup' | 'lantern' | 'spoon' | 'letter' | 'pot_helm'
//   attach(toActor | null, bone?)            ride on another actor (Pudding); null detaches
//
// The owning update(dt) calls `this.scriptedStep(dt)` every fixed step while `scripted` (it also runs the
// attachment), then `ctx.physics.moveActor(this, dt)` unless `this.attachedTo` is set.
import * as THREE from 'three';
import { wrapAngle, damp, dampAngle } from './math.js';

export const SCRIPTED_METHODS = ['setScripted', 'moveTo', 'face', 'pose', 'play', 'emote', 'prop', 'attach'];
export const POSES = ['vigil', 'oath', 'sip', 'selfie', 'faint', 'kneel', 'sit', 'sleep', 'idle'];
export const EMOTES = ['earsFlat', 'tailPuff', 'blink', 'nod', 'shake'];
export const PROPS = ['milk_cup', 'lantern', 'spoon', 'letter', 'pot_helm'];

const _v = new THREE.Vector3();

/**
 * Resolve a cutscene target to a world XZ point (written into `out`), or null.
 * @param {any} ctx @param {any} target @param {THREE.Vector3} out
 */
export function resolveTarget(ctx, target, out) {
  if (target == null) return null;
  if (typeof target === 'string') {
    const actor = ctx.actors?.get?.(target);
    if (actor) return out.copy(actor.pos);
    const a = ctx.levels?.anchor?.(target);
    return a?.pos ? out.copy(a.pos) : null;
  }
  if (Array.isArray(target)) return target.length >= 3 ? out.set(target[0], target[1], target[2]) : out.set(target[0], 0, target[1]);
  if (target.pos && target.object3d) return out.copy(target.pos);               // Actor
  if (typeof target.x === 'number' && typeof target.z === 'number') return out.set(target.x, target.y ?? 0, target.z);
  return null;
}

/** @template {new (...args:any[]) => any} T @param {T} Base */
export function ScriptedActorMixin(Base) {
  return class ScriptedActor extends Base {
    constructor(...args) {
      super(...args);
      this._move = null; this._face = null; this._clipT = null;
      this.poseName = 'idle'; this.poseHold = true;
      /** @type {Record<string, boolean>} */
      this.props = {};
      this.attachedTo = null; this.attachBone = null;
      this.attachOffset = new THREE.Vector3();
    }

    setScripted(on) {
      this.scripted = !!on;
      if (on) this.tags?.add('scripted'); else this.tags?.delete('scripted');
      if (!on) { this._finishMove(); this._finishFace(); }
      this.onScripted?.(this.scripted);
    }

    moveTo(target, speed = 2) {
      this._finishMove();
      const p = resolveTarget(this.ctx, target, new THREE.Vector3());
      if (!p) return Promise.resolve();
      return new Promise((resolve) => {
        const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
        this._move = { x: p.x, z: p.z, speed: Math.max(0.1, speed), resolve, t: 0, limit: Math.max(3, (d / Math.max(0.1, speed)) * 2 + 1) };
      });
    }

    face(target, dur = 0.3) {
      this._finishFace();
      let yaw;
      if (typeof target === 'number') yaw = target;
      else {
        const p = resolveTarget(this.ctx, target, _v);
        if (!p) return Promise.resolve();
        yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      }
      if (!(dur > 0)) { this.facing = yaw; return Promise.resolve(); }
      return new Promise((resolve) => { this._face = { from: this.facing, to: this.facing + wrapAngle(yaw - this.facing), t: 0, dur, resolve }; });
    }

    pose(name, { hold = true } = {}) { this.poseName = name; this.poseHold = hold; this.onPose?.(name, { hold }); }

    play(clip, { once = false, speed = 1, clampEnd = false } = {}) {
      const r = this.playClip?.(clip, { once, speed, clampEnd });
      if (r && typeof r.then === 'function') return r;
      return Promise.resolve();
    }

    emote(name) { this.onEmote?.(name); }

    prop(name, on) { this.props[name] = !!on; this.onProp?.(name, !!on); }

    attach(toActor, bone) {
      this.attachedTo = toActor ?? null; this.attachBone = toActor ? (bone ?? null) : null;
      if (toActor) { this.vel.set(0, 0, 0); this.attachOffset.set(0, 0, 0); }
      this.onAttach?.(this.attachedTo, this.attachBone);
    }

    /** Drive moveTo / face / attach. Call every fixed step while scripted (and while attached). */
    scriptedStep(dt) {
      if (this.attachedTo) {
        const host = this.attachedTo, bone = this.attachBone ? host.object3d.getObjectByName(this.attachBone) : null;
        if (bone) { bone.updateWorldMatrix(true, false); bone.getWorldPosition(this.pos); }
        else this.pos.set(host.pos.x, host.pos.y + (host.height ?? 1), host.pos.z);
        this.pos.add(this.attachOffset);
        this.vel.set(0, 0, 0);
      }
      const m = this._move;
      if (m) {
        m.t += dt;
        const dx = m.x - this.pos.x, dz = m.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.12 || m.t > m.limit) {
          if (d >= 0.12) { this.pos.x = m.x; this.pos.z = m.z; }       // safety: never soft-lock a cutscene
          this.vel.x = 0; this.vel.z = 0; this._finishMove();
        } else {
          const s = Math.min(m.speed, d / Math.max(dt, 1e-4));
          this.vel.x = damp(this.vel.x, (dx / d) * s, 12, dt); this.vel.z = damp(this.vel.z, (dz / d) * s, 12, dt);
          if (!this._face) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 10, dt);
        }
      }
      const f = this._face;
      if (f) {
        f.t += dt;
        const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
        this.facing = f.from + (f.to - f.from) * e;
        if (u >= 1) { this.facing = wrapAngle(f.to); this._finishFace(); }
      }
    }

    get isMoving() { return !!this._move; }

    _finishMove() { const m = this._move; this._move = null; m?.resolve(); }
    _finishFace() { const f = this._face; this._face = null; f?.resolve(); }
  };
}
