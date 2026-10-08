// src/companions/KittenVisual.js  (owner: companions) — the procedural cat look for every companion-area actor
// (Companion, NpcActor, LostKitten): characters' buildKitten(cfg) plus this area's procedural motion layer
// (requests/characters.md: k.animate → our joint offsets → k.simulate):
//   trot / run gait, arm stances for kittens without a sword (relaxed, shield up, cheer, staff, bow), a shield-bash
//   swing, hops, squash, appear/vanish scale, head look-at and hurt flash.
// Visual only: driven from the owning actor's render(alpha, frameDt).
import * as THREE from 'three';
import { buildKitten } from '../characters/index.js';
import { clamp, clamp01, damp, smoothstep, easeOutBack, wrapAngle } from '../core/math.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
/** Multiply a local Euler offset onto a joint (bones hang along −Y; +X swings a limb BACK, −X forward). */
function rot(bone, x, y, z) { if (bone) bone.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z, 'XYZ'))); }

/** Poses the gait layers onto (standing poses). Lying / sitting poses keep still. */
const GAIT_POSES = new Set(['idle', 'ready', 'guard', 'vigil', 'cheer']);
/** Poses where the no-sword arm stance replaces the pose's (sword-holding) arms. */
const STANCE_POSES = new Set(['idle', 'ready', 'guard', 'vigil']);

/**
 * Arm stances for kittens without a sword: Euler offsets on top of the rest rotation.
 * [shoulderL, elbowL, pawL, shoulderR, elbowR, pawR]
 */
export const STANCES = {
  relaxed: [[0.02, 0, 0.1], [-0.35, 0, 0], [0, 0, 0], [0.02, 0, -0.1], [-0.35, 0, 0], [0, 0, 0]],
  shieldUp: [[-1.2, -0.5, 0.15], [-0.75, 0, 0], [0, 0, 0], [-0.55, 0.2, -0.25], [-1.1, 0, 0], [0, 0, 0]],
  cheer: [[-2.5, 0, 0.35], [-0.3, 0, 0], [0, 0, 0], [-2.5, 0, -0.35], [-0.3, 0, 0], [0, 0, 0]],
  staff: [[-0.35, 0, 0.2], [-0.6, 0, 0], [0, 0, 0], [-1.9, 0, -0.15], [-0.4, 0, 0], [0, 0, 0]],
  bow: [[-1.45, -0.45, 0.1], [-0.05, 0, 0], [0, 0, 0], [-1.35, 0.55, -0.1], [-1.5, 0, 0], [0, 0, 0]],
  wave: [[0.02, 0, 0.1], [-0.35, 0, 0], [0, 0, 0], [-2.6, 0, -0.5], [-0.9, 0, 0], [0, 0, 0]],
};
const ARM_JOINTS = ['shoulderL', 'elbowL', 'pawL', 'shoulderR', 'elbowR', 'pawR'];

export class KittenVisual {
  /**
   * @param {any} ctx
   * @param {object} cfg buildKitten config (characters/configs.js)
   */
  constructor(ctx, cfg) {
    this.ctx = ctx; this.cfg = cfg;
    this.k = buildKitten(cfg);
    /** offset group: hops, appear scale (the actor's object3d holds the interpolated transform) */
    this.root = new THREE.Group();
    this.root.name = 'kittenVisual:' + (cfg?.id ?? 'cat');
    this.root.add(this.k.root);
    this.hasSword = !!this.k.sword;
    this.phase = Math.random() * 6;           // visual only
    this.moveBlend = 0; this.speed = 0;
    /** current + target stance weights */
    this.stance = 'relaxed';
    this._stanceW = Object.fromEntries(Object.keys(STANCES).map((k) => [k, k === 'relaxed' ? 1 : 0]));
    this.attackT = -1; this.attackDur = 0.42; this.attackKind = 'bash';
    this.hopT = -1; this.hopDur = 0.4; this.hopH = 0.25;
    this.flashT = 0;
    this.squash = 0; this._sqV = 0;
    this.look = 0; this.lookTarget = 0;
    this.fade = 1; this.fadeTarget = 1; this.fadeSpeed = 5;
    this.wave = 0;
    this.applyQuality(ctx?.quality);
  }

  get rig() { return this.k.rig; }
  get poseName() { return this.k.poseName; }

  /** Fur shells per the active quality preset (QUALITY.kittenShells; 0 = sheen). */
  applyQuality(preset) {
    if (this.k.lite || !preset) return;
    const n = preset.kittenShells;
    if (typeof n === 'number') this.k.setFurShells(n);
  }

  setPose(name, blend = 0.25) { this.k.setPose(name || 'idle', { blend }); return this; }
  setExpression(name) { this.k.setExpression(name); return this; }
  emote(name) { this.k.emote(name); return this; }
  setProp(name, on, opts) { this.k.setProp(name, on, opts); return this; }
  setStance(name) { this.stance = STANCES[name] ? name : 'relaxed'; return this; }

  /** Start a melee swing overlay ('bash' shield shove, 'swipe' paw swat). */
  attack(kind = 'bash') { this.attackT = 0; this.attackKind = kind; }
  /** A little hop (height in metres). */
  hop(h = 0.25, dur = 0.4) { this.hopT = 0; this.hopH = h; this.hopDur = dur; }
  /** Hurt / poof flash. */
  flash(sec = 0.15) { this.flashT = Math.max(this.flashT, sec); }
  /** Squash impulse (negative = squash, positive = stretch). */
  punch(amount = -0.15) { this._sqV += amount * 18; }
  /** Head yaw toward a world point (relative to the actor's facing), 0 to clear. */
  lookAt(relYaw) { this.lookTarget = clamp(wrapAngle(relYaw), -0.7, 0.7); }
  /** Appear (0 → 1 pop) / vanish (→ 0). */
  setFade(target, speed = 5) { this.fadeTarget = target; this.fadeSpeed = speed; }
  snapFade(v) { this.fade = this.fadeTarget = v; }
  /** Waving paw (lost kittens calling for her). */
  setWave(on) { this.wave = on ? 1 : 0; }

  /**
   * Per rendered frame.
   * @param {number} dt frame seconds (0 during hitstop)
   * @param {{ velocity?: THREE.Vector3, onGround?: boolean, frameId?: number, still?: boolean }} [o]
   */
  update(dt, o = {}) {
    const k = this.k, J = k.rig.joints, R = k.rest;
    const vel = o.velocity;
    const sp = vel ? Math.hypot(vel.x, vel.z) : 0;
    this.speed = damp(this.speed, sp, 12, dt);
    const pose = k.poseName || 'idle';
    const gait = GAIT_POSES.has(pose) && o.onGround !== false;
    this.moveBlend = damp(this.moveBlend, gait && this.speed > 0.25 ? 1 : 0, 10, dt);
    const s01 = clamp01(this.speed / 5.2) * this.moveBlend;

    k.animate(dt, { idle: true });

    // ---- arms: stance for kittens without a sword (the pose library's arms assume a sword grip)
    for (const key in this._stanceW) this._stanceW[key] = damp(this._stanceW[key], key === this.stance ? 1 : 0, 12, dt);
    if (!this.hasSword && STANCE_POSES.has(pose)) {
      for (let i = 0; i < 6; i++) {
        const n = ARM_JOINTS[i], b = J[n];
        b.quaternion.copy(R[n].q);
        let x = 0, y = 0, z = 0;
        for (const key in STANCES) { const w = this._stanceW[key]; if (w < 1e-3) continue; const s = STANCES[key][i]; x += s[0] * w; y += s[1] * w; z += s[2] * w; }
        rot(b, x, y, z);
      }
      if (this.wave > 0) {                                     // waving right paw on top of the stance
        const t = k.time;
        rot(J.shoulderR, -2.3 * this.wave, 0, -0.45 * this.wave);
        rot(J.elbowR, (-0.6 + 0.45 * Math.sin(t * 9)) * this.wave, 0, 0);
      }
    }

    // ---- gait (trot → run): diagonal pairs, body bob, forward lean
    if (s01 > 0.01) {
      this.phase += dt * (7 + 7 * s01);
      const ph = this.phase, sw = Math.sin(ph), cw = Math.cos(ph);
      const legA = (0.55 + 0.35 * s01) * s01 * 1.6;
      rot(J.thighL, sw * legA, 0, 0); rot(J.thighR, -sw * legA, 0, 0);
      rot(J.kneeL, Math.max(0, -cw) * 0.9 * s01 * 1.4, 0, 0); rot(J.kneeR, Math.max(0, cw) * 0.9 * s01 * 1.4, 0, 0);
      const armA = 0.45 * s01 * 1.4 * (this.stance === 'relaxed' ? 1 : 0.35);
      rot(J.shoulderL, -sw * armA, 0, 0); rot(J.shoulderR, sw * armA, 0, 0);
      J.body.position.y += Math.abs(sw) * 0.045 * s01;
      rot(J.body, 0.16 * s01, 0, 0);
      rot(J.head, -0.1 * s01, 0, 0);
      rot(J.chest, 0, sw * 0.08 * s01, 0);
    }

    // ---- melee overlay
    if (this.attackT >= 0) {
      this.attackT += dt;
      const u = this.attackT / this.attackDur;
      if (u >= 1) this.attackT = -1;
      else {
        const wind = smoothstep(0, 0.35, u) * (1 - smoothstep(0.35, 0.5, u));
        const hit = smoothstep(0.3, 0.5, u) * (1 - smoothstep(0.65, 1, u));
        if (this.attackKind === 'bash') {
          rot(J.shoulderL, 0.5 * wind - 0.9 * hit, 0, 0); rot(J.elbowL, 0.3 * hit, 0, 0);
          rot(J.chest, 0, 0.35 * wind - 0.25 * hit, 0);
          J.body.position.z += 0.08 * hit - 0.03 * wind;
        } else {
          rot(J.shoulderR, 0.5 * wind - 1.6 * hit, 0, -0.3 * hit); rot(J.elbowR, -0.4 * wind, 0, 0);
          rot(J.chest, 0, -0.3 * wind + 0.3 * hit, 0);
          J.body.position.z += 0.06 * hit;
        }
        rot(J.body, 0.12 * hit, 0, 0);
      }
    }

    // ---- head look (lost kittens watch her, companions glance at targets)
    this.look = damp(this.look, this.lookTarget, 6, dt);
    if (Math.abs(this.look) > 1e-3) { rot(J.head, 0, this.look * 0.7, 0); rot(J.chest, 0, this.look * 0.3, 0); }

    // ---- squash spring (volume preserving), hop, appear scale
    const acc = -120 * this.squash - 14 * this._sqV;
    this._sqV += acc * dt; this.squash += this._sqV * dt;
    this.squash = clamp(this.squash, -0.35, 0.35);
    const sy = 1 + this.squash, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    J.body.scale.set(sxz * R.body.s.x, sy * R.body.s.y, sxz * R.body.s.z);
    let hopY = 0;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const u = this.hopT / this.hopDur;
      if (u >= 1) { this.hopT = -1; this.punch(-0.12); } else hopY = this.hopH * 4 * u * (1 - u);
    }
    this.root.position.y = hopY;
    this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + dt * this.fadeSpeed) : Math.max(this.fadeTarget, this.fade - dt * this.fadeSpeed);
    const f = this.fadeTarget >= this.fade && this.fade < 1 ? easeOutBack(this.fade) : this.fade;
    this.root.scale.setScalar(Math.max(1e-3, f));
    this.root.visible = this.fade > 1e-3;

    if (this.flashT > 0) { this.flashT = Math.max(0, this.flashT - dt); k.setFlash(this.flashT > 0 ? 1 : 0); }

    k.simulate(dt, { velocity: vel, frameId: o.frameId, airborne: hopY > 0.05 || o.onGround === false });
  }

  snap() { this.k.snap(); }

  /** Paw position in world space (for props / arrows). */
  jointWorld(name, out = _v) { const b = this.k.rig.joints[name]; if (!b) return out.set(0, 0, 0); b.updateWorldMatrix(true, false); return b.getWorldPosition(out); }

  dispose() { this.k.dispose(); this.root.removeFromParent(); }
}
