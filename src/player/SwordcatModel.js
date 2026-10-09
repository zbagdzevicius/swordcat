// src/player/SwordcatModel.js  (owner: player) — Swordcat's visual body: the characters area's hero kitten
// (`new KittenView(ctx, swordcatConfig())`) driven procedurally every rendered frame (GAME_DESIGN §7, tech.md §11.2):
//   • base poses from the gameplay state (idle / ready / vigil (the Stand) / oath (charge, Golden Hour, Meme Cam) /
//     sip / faint / kneel), blended by the kitten's pose system;
//   • additive layers on the rig: run cycle synced to the sim gait (footsteps), bob, forward lean, turn lean,
//     squash & stretch (jump +0.18 / land −0.25 / hits), ear and tail springs, zoomies ears-back + tail-up,
//     head tracking of the threat, hurt flinch, block recoil, the Tumble roll, pounce dive;
//   • sword swing arcs: the blade follows the SAME angle curve as Combat's swept arc (anticipation → easeSwing over
//     def.active → follow-through), with both arms solved onto the grip by two-bone IK; full-circle attacks spin her;
//   • holy glow (charge tier 2, Holy Slash, Golden Hour), Valor blade glow, i-frame blink, ground blob, Meme Cam cape.
// Visual only: reads player fields, never mutates simulation state.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { PLAYER, ATTACKS, LOOP } from '../core/config.js';
import { damp, clamp, lerp, easeSwing, easeOutCubic, easeInOutSine, wrapAngle, Spring } from '../core/math.js';
import { KittenView, MEME_CAPE, visualDt, swordcatConfig, solveTwoBone, ARM, SWORD_PTS, POSES, mulberry32 } from '../characters/index.js';
import { TUNING } from './tuning.js';

// ------------------------------------------------------------------ visual swing profiles (look only; hit arcs are config)
// e0 → e1: blade elevation (rad above horizontal) across the active window; eb: wind-up elevation; r: grip reach;
// h: grip height (H); twist: chest share of the arc; hop: body hop (H) at the strike; spin: full-circle body spin.
const VIS = {
  slash1:   { e0: 0.45, e1: -0.35, eb: 0.75, r: 1, h: 0.50, twist: 0.35 },
  slash2:   { e0: -0.25, e1: 0.40, eb: -0.30, r: 1, h: 0.46, twist: 0.35 },
  slash3:   { e0: 0.85, e1: -0.45, eb: 1.15, r: 1.1, h: 0.53, twist: 0.45, hop: 0.05 },
  bright:   { e0: 1.05, e1: -0.60, eb: 1.35, r: 1.1, h: 0.56, twist: 0.45, hop: 0.07 },
  riposte:  { e0: 0.08, e1: -0.05, eb: 0.15, r: 1, h: 0.47, twist: 0.15, thrust: true },
  holy:     { e0: 0.25, e1: 0.05, eb: 0.95, r: 1.1, h: 0.52, spin: true, hop: 0.12 },
  sunburst: { e0: 0.30, e1: 0.00, eb: 1.05, r: 1.1, h: 0.52, spin: true, hop: 0.16 },
  pounce:   { e0: -1.15, e1: -1.15, eb: 1.25, r: 0.9, h: 0.48, twist: 0 },
};
/** Running carry (look only): both paws low on the grip, blade forward-up and out to her right so the face stays clear. */
const CARRY = { a: -0.55, e: 0.55, reach: 0.9, h: 0.40, bob: 0.07, minSpeed: 2.2 };
/** Tumble look: pivot height (H), hop at the upside-down moment (H), ball squash. */
const ROLL = { pivot: 0.42, lift: 0.3, ball: 0.14 };
/** Upper-body pitch (rad, + = forward) during a swing: lean back on the wind-up, into the strike, settle after. */
const SWING_LEAN = { back: 0.07, strike: 0.16 };
const ANTIC = 0.35;          // extra wind-up beyond the arc start (rad), tech.md §11.2
const SIDE = 1.25;           // max sword angle relative to the body before the body turns with it
const GRIP_X = 0.17, GRIP_Z = 0.12, GRIP_Z0 = 0.1;
const SWING_POSE_BLEND = 0.06;
const POSE_BLEND = { vigil: PLAYER.guard.enter, oath: 0.14, ready: 0.14, idle: 0.35, faint: 0.35, sip: 0.12, kneel: 0.08 };
const SWING_IDS = new Set(Object.keys(VIS));
const SWORD_GLB = { diamond: 'models/weapons/quaternius/Sword_Diamond.glb', toobig: 'models/weapons/quaternius/Claymore.glb' };

// ------------------------------------------------------------------ temporaries (no per-frame allocation)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _P = new THREE.Vector3(), _O = new THREE.Vector3();
const _mBody = new THREE.Matrix4(), _mHips = new THREE.Matrix4(), _mChest = new THREE.Matrix4(), _mChestInv = new THREE.Matrix4();
const _mTmp = new THREE.Matrix4(), _mHand = new THREE.Matrix4(), _mSW = new THREE.Matrix4(), _mPose = new THREE.Matrix4();
const _qChest = new THREE.Quaternion(), _qChestInv = new THREE.Quaternion();
const _posP = new THREE.Vector3(), _quatP = new THREE.Quaternion(), _posS = new THREE.Vector3(), _quatS = new THREE.Quaternion();
const _qS = new THREE.Quaternion(), _qE = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _rot = new THREE.Quaternion();
const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _W = new THREE.Vector3(), _pole = new THREE.Vector3();
const _centre = new THREE.Vector3(...ARM.pawCentre);
const _pivot = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3();
const TWIST = { R: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.6)), L: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.6)) };
const POLE = { R: new THREE.Vector3(-1, -0.5, -0.45), L: new THREE.Vector3(1, -0.6, -0.45) };

/** Post-multiply a joint by an Euler offset (joint-local, like the kitten's pose offsets). */
function rot(j, x, y, z) {
  if (!x && !y && !z) return;
  j.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z)));
}

export class SwordcatModel {
  /** @param {import('./Player.js').Player} player */
  constructor(player) {
    this.player = player;
    this.ctx = player.ctx;
    /** @type {import('../characters/index.js').KittenView|null} characters' in-game glue (env map, wind, fur LOD) */
    this.view = null;
    /** @type {any} characters' Kitten (this.view.kitten) */
    this.k = null;
    this.fallback = null;
    this.ready = false;
    this.poseName = null; this.expr = null;
    this.scriptPose = null; this.scriptPoseExpr = true;
    this.outfit = 'armour';
    this.capeApplied = null; this.swordApplied = null; this._cosmeticT = 0;
    // secondary motion
    this.squash = new Spring(320, 11);
    this.earSpring = new Spring(140, 9); this.tailSpring = new Spring(60, 7); this.headSpring = new Spring(160, 14);
    this.gaitAmp = 0; this.air = 0; this.zoom = 0; this.turn = 0; this.lean = 0; this.prevYaw = null; this.prevSpeed = 0;
    this.flinch = 0; this.recoil = 0; this.parryKick = 0; this.headYaw = 0; this.charge = 0;
    this.holyVis = 0; this.holyLast = -1;
    this.flash = 0; this.flashLast = -1; this.stepOff = 0; this.stepSeen = 0; this.meme = false;
    // sword driver
    this.sw = { w: 0, a: 0, e: 0, reach: 1, h: 0.5, spin: 0, hop: 0, armW: 0 };
    this.carryW = 0;
    this.sw.twist = 0; this.sw.lean = 0;
    /** scripted visual swing / clip: { def, vis, t, speed, dur, resolve, kind } */
    this.clip = null;
    this.idleStill = 0; this.sneezeNext = 0; this.sneezeT = 0; this.blinkCd = 0; this.slowBlinkT = 0;
    this.rand = mulberry32(0x5c47);
    this.t = 0;
    this._offs = [];
    this._props = new Set();
  }

  // ------------------------------------------------------------------ lifecycle
  async init() {
    const ctx = this.ctx, bus = ctx.bus;
    this._build();
    this._offs.push(
      bus.on(E.PLAYER_JUMP, () => this._squashTo(PLAYER.stretchJump)),
      bus.on(E.PLAYER_LAND, (p) => this._squashTo(PLAYER.squashLand * clamp((p?.impact ?? 6) / PLAYER.hardLandSpeed, 0.45, 1.25))),
      bus.on(E.PLAYER_SWING, (p) => { if (p?.attackId !== 'pounce') this._squashTo(0.06); }),
      bus.on(E.PLAYER_DAMAGED, (p) => { if ((p?.amount ?? 0) > 0 || p?.broke) { this.flinch = 1; this.flash = 1; this._squashTo(-0.14); } }),
      bus.on(E.PLAYER_PARRY, () => { this.parryKick = 1; this._squashTo(0.08); }),
      bus.on(E.PLAYER_DODGE, () => this._squashTo(-0.12)),
      bus.on(E.PLAYER_STILL_STANDING, () => { this.holyVis = Math.max(this.holyVis, 0.6); }),
      bus.on(E.HIT, (h) => {
        if (h?.target === this.player && h.blocked) { this.recoil = 1; this._squashTo(-0.07); }
        else if (h?.attacker === this.player && !h.blocked) this._squashTo(h.killed ? -0.1 : -0.05);
      }),
      bus.on(E.PLAYER_SPAWNED, () => this.snap()),
    );
    this.sneezeNext = TUNING.sneezeEvery * (0.6 + 0.8 * this.rand());
  }

  _config() {
    const st = this.ctx.state, cos = st?.cosmetics ?? {};
    const sword = typeof cos.sword === 'string' && !SWORD_GLB[cos.sword] ? cos.sword : 'borrowed';
    const o = this.outfit;
    return swordcatConfig({ cape: cos.cape || 'cream', sword, armour: o === 'armour', bow: o !== 'tunic' });
  }

  _build() {
    const root = this.player.object3d;
    this._disposeKitten();
    try {
      this.view = new KittenView(this.ctx, this._config(), { actor: this.player, parent: root, memeCam: false });
      const k = this.k = this.view.kitten;
      if (this.meme) this.view.setMemeCam(true);
      this.poseName = null; this.expr = null;
      this.capeApplied = this.ctx.state?.cosmetics?.cape ?? 'cream';
      this.swordApplied = k.sword?.skin ?? null;
      for (const name of this._props) k.setProp(name, true);
      this.ready = true;
      this._applyCosmetics(true);
    } catch (e) {
      console.warn('[player] buildKitten failed; using the capsule fallback', e);
      this._buildFallback();
    }
  }

  _buildFallback() {
    const g = new THREE.Group(); g.name = 'swordcatFallback';
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 4, 12),
      new THREE.MeshStandardMaterial({ color: '#D4935A', roughness: 0.85 }));
    body.position.y = PLAYER.height / 2; body.castShadow = true;
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.012), new THREE.MeshStandardMaterial({ color: '#C9CED6', metalness: 0.9, roughness: 0.25 }));
    sword.position.set(-0.3, 0.5, 0.15);
    g.add(body, sword);
    this.player.object3d.add(g);
    this.fallback = g; this.fallbackSword = sword;
    this.ready = true;
  }

  _disposeKitten() {
    if (this.view) { this.view.dispose(); this.view = null; }
    this.k = null;
    if (this.fallback) {
      this.fallback.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      this.fallback.removeFromParent(); this.fallback = null;
    }
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    if (this.clip?.resolve) this.clip.resolve();
    this.clip = null;
    this._disposeKitten();
  }

  /** After teleports / respawns / cuts: settle the cape. */
  snap() { this.k?.snap(); this.prevYaw = null; }

  /** Wardrobe / unlocks change `state.cosmetics`: apply cape and sword skin (checked twice a second). */
  _applyCosmetics(force = false) {
    const k = this.k, cos = this.ctx.state?.cosmetics;
    if (!k || !cos) return;
    const capeWant = this.capeOverride || cos.cape;
    if (this.outfit === 'armour' && (force || capeWant !== this.capeApplied)) {
      this.capeApplied = capeWant;
      if (capeWant) k.setCape(capeWant);
    }
    const want = cos.sword || 'borrowed';
    if (this.outfit === 'armour' && (force || want !== this.swordApplied)) {
      this.swordApplied = want;
      if (SWORD_GLB[want]) {
        const path = SWORD_GLB[want];
        const fit = want === 'toobig' ? 'toobig' : undefined;
        this.ctx.assets?.model?.(path, fit ? { fit, castShadow: true } : { castShadow: true }).then((m) => {
          if (this.k === k && this.swordApplied === want) { k.setSword({ skin: want, model: m.root }); this.poseName = null; }
        }).catch((e) => console.warn('[player] sword skin', want, e));
      } else if (k.sword?.skin !== want) { k.setSword(want); this.poseName = null; }
    }
  }

  // ------------------------------------------------------------------ API used by Player (ScriptedActor hooks)
  setScriptPose(name, o = {}) { this.scriptPose = name || null; this.scriptPoseExpr = true; void o; }

  emote(name) { this.k?.emote(name); }

  prop(name, on) {
    if (on) this._props.add(name); else this._props.delete(name);
    this.k?.setProp(name, on);
  }

  setOutfit(name) {
    const o = name === 'tunic' || name === 'tunic_bow' ? name : 'armour';
    if (o === this.outfit && this.k) return;
    this.outfit = o;
    if (this.ready) this._build();
  }

  /** Meme Cam (§7.8): the hero cape cross-fades to the 3.8 s looping sway (and back on exit). */
  memeCam(on) {
    this.meme = !!on;
    this.view?.setMemeCam(this.meme);
  }

  /** ScriptedActor.play: swings and emotes are procedural "clips". Resolves when a `once` clip ends. */
  playClip(name, { once = false, speed = 1 } = {}) {
    const def = ATTACKS[name];
    if (def && SWING_IDS.has(name)) {
      if (this.clip?.resolve) this.clip.resolve();
      return new Promise((resolve) => {
        this.clip = { kind: 'swing', def, vis: VIS[name], t: 0, speed: Math.max(0.05, speed), dur: def.dur ?? 0.5, resolve };
      });
    }
    const timed = (sec, fn) => { fn?.(); return once ? new Promise((r) => setTimeout(r, (sec * 1000) / Math.max(0.05, speed))) : Promise.resolve(); };
    switch (name) {
      case 'meow': return timed(PLAYER.meow.dur, () => this.emote('meow'));
      case 'sneeze': return timed(0.5, () => this.emote('sneeze'));
      case 'nod': case 'shake': case 'blink': case 'earsFlat': case 'tailPuff': case 'bowBounce': return timed(0.6, () => this.emote(name));
      case 'jump': case 'hop': return timed(0.5, () => { this._squashTo(PLAYER.stretchJump); this.sw.hop = 0.12; });
      default:
        if (POSES[name]) { this.setScriptPose(name === 'idle' ? null : name); return Promise.resolve(); }
        return Promise.resolve();
    }
  }

  _squashTo(v) { this.squash.x = v; this.squash.v = 0; }

  // ------------------------------------------------------------------ per frame
  render(alpha, frameDt) {
    const p = this.player, ctx = this.ctx, game = ctx.game;
    if (!this.ready) return;
    const dt = Math.min(visualDt(ctx, frameDt), 0.1);          // 0 in hitstop / pause, × slow motion
    this.t += dt;
    if (this.fallback) { this._renderFallback(dt); return; }
    const k = this.k;
    if (!k) return;
    if ((this._cosmeticT += frameDt) > 0.5) { this._cosmeticT = 0; this._applyCosmetics(); }

    // ---- base pose + face
    const pose = this._basePose();
    if (pose !== this.poseName) {
      const scripted = p.scripted && pose === this.scriptPose;
      k.setPose(pose, { blend: this.poseName == null ? 0 : (POSE_BLEND[pose] ?? 0.2), expression: scripted });
      this.poseName = pose;
      if (scripted) this.expr = null;
    }
    if (!p.scripted || !this.scriptPose) this._expression();
    else if (this.exprOverride && this.expr !== this.exprOverride) { this.expr = this.exprOverride; k.setExpression(this.exprOverride); }
    this._propsForState();
    this.view.animate(frameDt);

    const J = k.rig.joints;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const yaw = p.object3d.rotation.y;
    if (this.prevYaw == null) this.prevYaw = yaw;
    const yawRate = dt > 0 ? wrapAngle(yaw - this.prevYaw) / dt : 0;
    this.prevYaw = yaw;
    const accel = dt > 0 ? (sp - this.prevSpeed) / dt : 0;
    this.prevSpeed = sp;

    this._layerGait(J, dt, sp);
    this._layerAir(J, dt);
    this._layerTurn(J, dt, sp, yawRate);
    this._layerSecondary(J, dt, accel);
    this._layerReactions(J, dt);
    this._layerStates(J, dt, alpha);

    // squash & stretch (volume preserving) on the body pivot at the feet — before the IK reads the chain
    const sq = clamp(this.squash.step(0, dt), -0.4, 0.4);
    const sy = 1 + sq, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    J.body.scale.set(sxz, sy, sxz);

    this._layerRoll(J, alpha);
    this._swordDriver(J, dt, alpha);

    // whole-body spin (full-circle attacks) and hop live on the kitten root (actor yaw is the sim facing)
    k.root.rotation.y = this.sw.spin;
    k.root.position.y = Math.max(0, this.sw.hop) + this._stepSmooth(dt);

    this._glow(dt);
    if (k.cape) k.cape.windMul = this.meme ? MEME_CAPE.windMul : p.standingGround ? TUNING.standCapeWind : 1;
    // the cape pins read the rig's world matrices: bring the actor root up to date first (teleports, turns)
    p.object3d.updateWorldMatrix(true, false);
    this.view.simulate({ velocity: p.attachedTo ? _zero : p.vel, airborne: !p.onGround && !p.attachedTo });
    this._blinkAndBlob(dt);
  }

  /** Which kitten pose the gameplay state shows. */
  _basePose() {
    const p = this.player;
    if (p.scripted) {
      if (this.scriptPose) return this.scriptPose;
      return Math.hypot(p.vel.x, p.vel.z) > 0.3 || this.clip ? 'ready' : 'idle';
    }
    switch (p.state) {
      case 'dead': return 'faint';
      case 'guard': case 'vigil': return 'vigil';
      case 'charge': case 'golden': case 'memecam': return 'oath';
      case 'sip': return 'sip';
      case 'rise': return p.stateT < PLAYER.stillStanding.riseDur * 0.45 ? 'kneel' : 'ready';
      case 'move': {
        if (!p.onGround || Math.hypot(p.vel.x, p.vel.z) > 0.3) return 'ready';
        return p.combatT > 0 || p.threatened || p.golden ? 'ready' : 'idle';
      }
      default: return 'ready';
    }
  }

  _expression() {
    const p = this.player, k = this.k;
    let x = 'neutral';
    switch (p.state) {
      case 'dead': x = 'faint'; break;
      case 'hurt': case 'stagger': x = 'surprised'; break;
      case 'guard': x = p.standingGround ? 'determined' : 'worried'; break;
      case 'charge': case 'golden': case 'attack': case 'pounce': case 'rise': x = 'determined'; break;
      case 'memecam': x = 'earnest'; break;
      case 'sip': x = 'happy'; break;
      case 'vigil': x = 'earnest'; break;
      default:
        if (p.meowT > 0 || p.zoomies) x = 'happy';
        else if (this.slowBlinkT > 0) x = 'sleepy';
        else if (p.hp <= 2 && p.alive) x = 'worried';
        else if (p.golden || p.combatT > 0) x = 'determined';
    }
    if (this.exprOverride) x = this.exprOverride;
    if (x !== this.expr) { this.expr = x; k.setExpression(x); }
  }

  /** Story: hold a face expression (null = back to the state's own). */
  setExpressionOverride(name) {
    this.exprOverride = name || null;
    this.expr = null;                                   // re-applied on the next render (scripted or not)
    if (!name && this.player?.scripted) this.poseName = null;   // the scripted pose's own face comes back
  }

  /** Story (CS-00): show a cape id regardless of `state.cosmetics.cape` (null = the equipped one). */
  setCapeOverride(id) { this.capeOverride = id || null; this._applyCosmetics(true); }

  /** Milk bottle in the paw while sipping (gameplay); cutscene props go through prop(). */
  _propsForState() {
    const sipping = this.player.state === 'sip';
    if (sipping !== !!this._sipProp) { this._sipProp = sipping; this.k.setProp('milk_bottle', sipping || this._props.has('milk_bottle')); }
  }

  // ------------------------------------------------------------------ layers
  _layerGait(J, dt, sp) {
    const p = this.player;
    const s = p.state;
    const moving = (s === 'move' || s === 'charge' || s === 'guard' || s === 'sip' || s === 'scripted') && p.onGround;
    this.gaitAmp = damp(this.gaitAmp, moving && sp > 0.25 ? clamp(sp / PLAYER.run, 0, 1.3) : 0, 12, dt);
    this.zoom = damp(this.zoom, p.zoomies ? 1 : 0, 6, dt);
    const A = this.gaitAmp;
    if (A < 0.002) return;
    const ph = p.gait * Math.PI, sn = Math.sin(ph), cs = Math.cos(ph);
    const stride = s === 'guard' ? 0.45 : s === 'charge' ? 0.6 : 1;
    const legA = 0.8 * A * stride;
    rot(J.thighL, sn * legA, 0, 0); rot(J.thighR, -sn * legA, 0, 0);
    rot(J.kneeL, Math.max(0, -cs) * 1.0 * A * stride, 0, 0); rot(J.kneeR, Math.max(0, cs) * 1.0 * A * stride, 0, 0);
    rot(J.footL, -sn * 0.35 * A, 0, 0); rot(J.footR, sn * 0.35 * A, 0, 0);
    J.body.position.y += (0.55 - Math.abs(sn)) * 0.05 * A * stride;                      // a bounce per step
    rot(J.hips, 0.12 * A * (1 + 0.4 * this.zoom), sn * 0.1 * A, sn * 0.05 * A);
    rot(J.chest, 0.05 * A, -sn * 0.12 * A, 0);
    rot(J.head, -0.12 * A, sn * 0.05 * A, 0);
    // tail streams behind and lifts; zoomies: straight up, ears pinned back
    rot(J.tail0, (0.45 + 0.7 * this.zoom) * A, Math.sin(ph * 0.5) * 0.15 * A, 0);
    rot(J.tail1, 0.15 * A, Math.sin(ph * 0.5 - 0.6) * 0.15 * A, 0);
    if (this.zoom > 0.01) {
      const z = this.zoom;
      rot(J.earL, -0.75 * z, 0, -0.55 * z); rot(J.earR, -0.75 * z, 0, 0.55 * z);
    }
  }

  _layerAir(J, dt) {
    const p = this.player;
    const airborne = !p.onGround && p.state !== 'dodge' && p.state !== 'pounce' && p.state !== 'scripted';
    this.air = damp(this.air, airborne ? 1 : 0, 14, dt);
    const a = this.air;
    if (a < 0.002) return;
    const rising = p.vel.y > 0.5 ? 1 : p.vel.y < -2 ? 0 : 0.5;
    const tuck = a * (0.4 + 0.6 * rising);
    rot(J.thighL, -0.7 * tuck - 0.15 * a, 0, 0.08 * a); rot(J.thighR, -0.55 * tuck - 0.1 * a, 0, -0.08 * a);
    rot(J.kneeL, 1.1 * tuck + 0.25 * a, 0, 0); rot(J.kneeR, 0.9 * tuck + 0.3 * a, 0, 0);
    rot(J.chest, -0.08 * a * rising, 0, 0);
    rot(J.tail0, 0.5 * a, 0, 0);
    const flop = a * (1 - rising);                                                      // falling: ears float up
    rot(J.earL, -0.35 * flop, 0, 0.15 * flop); rot(J.earR, -0.35 * flop, 0, -0.15 * flop);
  }

  _layerTurn(J, dt, sp, yawRate) {
    this.turn = damp(this.turn, clamp(yawRate, -12, 12), 10, dt);
    const lean = clamp(-this.turn * Math.min(sp, 7.5) * 0.012, -0.28, 0.28);
    this.lean = damp(this.lean, lean, 12, dt);
    rot(J.body, 0, 0, this.lean);
    const tailSwing = this.tailSpring.step(clamp(-this.turn * 0.06, -0.6, 0.6), dt);
    rot(J.tail1, 0, tailSwing, 0); rot(J.tail3, 0, tailSwing * 0.8, 0);
  }

  _layerSecondary(J, dt, accel) {
    const p = this.player;
    // ears lag behind acceleration (and flop on landings via squash)
    const lag = this.earSpring.step(clamp(-accel * 0.018 - this.squash.x * 1.4, -0.5, 0.5), dt);
    rot(J.earL, lag, 0, -lag * 0.3); rot(J.earR, lag, 0, lag * 0.3);
    // head: late bob + track the threat (lock target / riposte target / nearest alerted enemy)
    const hb = this.headSpring.step(-this.squash.x * 0.6, dt);
    let want = 0;
    const t = p.lockTarget?.() ?? p.riposteTarget ?? (p.threatened || p.combatT > 0 ? this._nearestEnemy(8) : null);
    if (t && p.state !== 'dead' && p.state !== 'memecam') {
      const rel = wrapAngle(Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - p.object3d.rotation.y - this.sw.spin);
      want = clamp(rel, -0.75, 0.75) * 0.6;
    }
    this.headYaw = damp(this.headYaw, want, 6, dt);
    rot(J.head, hb, this.headYaw, 0);
    // meow: chin up, mouth open (kitten emote)
    if (p.meowT > 0) {
      const m = Math.sin(Math.PI * (1 - p.meowT / PLAYER.meow.dur));
      rot(J.head, -0.28 * m, 0, 0.08 * m); rot(J.chest, -0.06 * m, 0, 0);
    }
    this._ambient(dt);
  }

  /** Sneeze in thick fog (1 per ~90 s) and slow blinks with a nearby companion (§7.7). */
  _ambient(dt) {
    const p = this.player, ctx = this.ctx;
    const still = p.state === 'move' && p.onGround && Math.hypot(p.vel.x, p.vel.z) < 0.1 && !p.scripted;
    this.idleStill = still ? this.idleStill + dt : 0;
    if (this.slowBlinkT > 0) this.slowBlinkT = Math.max(0, this.slowBlinkT - dt);
    if (this.blinkCd > 0) this.blinkCd -= dt;
    const fog = ctx.env?.fogDensity ?? ctx.scene?.fog?.density ?? 0;
    if (still && fog >= TUNING.sneezeMinFog) {
      this.sneezeT += dt;
      if (this.sneezeT >= this.sneezeNext) {
        this.sneezeT = 0; this.sneezeNext = TUNING.sneezeEvery * (0.6 + 0.8 * this.rand());
        this.k.emote('sneeze');
      }
    }
    if (this.idleStill >= TUNING.slowBlinkStill && this.blinkCd <= 0) {
      const c = ctx.companions?.active?.[0];
      if (c?.pos && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) <= TUNING.slowBlinkRadius) {
        this.blinkCd = TUNING.slowBlinkCooldown; this.slowBlinkT = 0.9;
        ctx.bus.emit(E.BURST, { kind: 'heart', position: _v.set(p.pos.x, p.pos.y + p.height * 1.15, p.pos.z).clone() });
      }
    }
  }

  _nearestEnemy(r) {
    const p = this.player, list = this.ctx.enemies?.list;
    if (!list) return null;
    let best = null, bd = r;
    for (const e of list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _layerReactions(J, dt) {
    if (dt > 0) {
      this.flinch = Math.max(0, this.flinch - dt / PLAYER.hurt.stun);
      this.recoil = Math.max(0, this.recoil - dt / 0.18);
      this.parryKick = Math.max(0, this.parryKick - dt / 0.25);
    }
    const f = easeOutCubic(this.flinch), r = this.recoil, pk = this.parryKick;
    if (f > 0) { rot(J.chest, -0.45 * f, 0, 0.1 * f); rot(J.head, -0.3 * f, 0, -0.08 * f); rot(J.hips, -0.12 * f, 0, 0); rot(J.tail0, 0.6 * f, 0, 0); }
    if (r > 0) { rot(J.chest, -0.2 * r, 0, 0); rot(J.hips, -0.07 * r, 0, 0); rot(J.head, 0.08 * r, 0, 0); }
    if (pk > 0) { rot(J.chest, 0.12 * pk, 0, 0); rot(J.head, -0.1 * pk, 0, 0); }
  }

  /** Per-state accents that are not swings: charge tremble, guard crouch, Standing Ground billow, stagger wobble. */
  _layerStates(J, dt, alpha) {
    const p = this.player, s = p.state;
    this.charge = damp(this.charge, s === 'charge' ? 0.3 + 0.7 * p.charge : 0, 10, dt);
    if (this.charge > 0.01) {
      const c = this.charge, tier2 = p.chargeTier >= 2 ? 1 : 0;
      const tr = (Math.sin(this.t * 61) * 0.6 + Math.sin(this.t * 37) * 0.4) * (0.012 + 0.03 * tier2) * c;
      rot(J.chest, 0.04 * c + tr, tr * 0.5, 0); rot(J.hips, 0.03 * c, 0, 0);
      J.body.position.y -= 0.018 * c;
      rot(J.thighL, -0.12 * c, 0, 0.06 * c); rot(J.thighR, 0.12 * c, 0, -0.06 * c); rot(J.kneeL, 0.2 * c, 0, 0); rot(J.kneeR, 0.2 * c, 0, 0);
    }
    if (s === 'guard') {
      const g = Math.min(1, p.guardT / Math.max(0.01, PLAYER.guard.enter));
      J.body.position.y -= 0.012 * g;
      rot(J.kneeL, 0.12 * g, 0, 0); rot(J.kneeR, 0.12 * g, 0, 0);
      if (p.standingGround) { const b = Math.sin(this.t * 3.1) * 0.02; rot(J.chest, b, 0, 0); }
    }
    if (s === 'stagger') {
      const w = Math.sin(this.t * 18) * 0.12 * Math.max(0, 1 - p.stateT / PLAYER.guard.breakStagger);
      rot(J.body, 0, 0, w); rot(J.head, 0.1, w * 2, 0); rot(J.chest, 0.15, 0, 0);
    }
    if (s === 'land') { const l = 1 - p.stateT / PLAYER.hardLandLock; J.body.position.y -= 0.03 * l; }
    if (s === 'rise') {
      const u = clamp(p.stateT / PLAYER.stillStanding.riseDur, 0, 1);
      rot(J.head, -0.15 * Math.sin(u * Math.PI), 0, 0);
    }
    void alpha;
  }

  /** Tumble: a full forward roll, tucked into a ball, about her middle; the hop arc keeps the big head off the ground. */
  _layerRoll(J, alpha) {
    const p = this.player;
    if (p.state !== 'dodge') return;
    const d = PLAYER.dodge;
    const tv = Math.max(0, p.stateT - (1 - (this.ctx.game.hitstopT > 0 ? 1 : alpha)) * LOOP.step);
    const u = clamp(tv / d.dur, 0, 1);
    const th = Math.PI * 2 * easeInOutSine(clamp(u / 0.9, 0, 1));
    const tuck = Math.sin(u * Math.PI);
    rot(J.thighL, -1.3 * tuck, 0, 0); rot(J.thighR, -1.3 * tuck, 0, 0);
    rot(J.kneeL, 1.7 * tuck, 0, 0); rot(J.kneeR, 1.7 * tuck, 0, 0);
    rot(J.chest, 0.5 * tuck, 0, 0); rot(J.head, 0.45 * tuck, 0, 0); rot(J.hips, 0.2 * tuck, 0, 0);
    rot(J.tail0, -0.6 * tuck, 0.5 * tuck, 0);
    _pivot.set(0, ROLL.pivot, 0);
    _q2.setFromAxisAngle(_v2.set(1, 0, 0), th);
    J.body.quaternion.premultiply(_q2);
    _v.copy(J.body.position).sub(_pivot).applyQuaternion(_q2).add(_pivot);
    J.body.position.copy(_v);
    J.body.position.y += ROLL.lift * Math.sin(th * 0.5);                                // upside down = top of the hop
    J.body.scale.multiplyScalar(1 - ROLL.ball * tuck);
  }

  // ------------------------------------------------------------------ sword driver (swing arcs + two-bone IK)
  /** Current swing source: the sim swing, the pounce, or a scripted clip. Returns {def, vis, t} or null. */
  _swingSource(alpha) {
    const p = this.player, frozen = this.ctx.game.hitstopT > 0;
    const a = frozen ? 1 : alpha;
    if (this.clip?.kind === 'swing') return this.clip;
    if (p.state === 'pounce') return { def: ATTACKS.pounce, vis: VIS.pounce, t: p.stateT, pounce: p.pouncePhase };
    const s = p.swing;
    if (!s || !VIS[s.def.id]) return null;
    return { def: s.def, vis: VIS[s.def.id], t: Math.max(0, s.t - (1 - a) * LOOP.step) };
  }

  /**
   * Target (total angle a, elevation e, reach, height, body spin, hop) for a swing at time t. The angle follows the
   * hit arc exactly during def.active: lerp(back, to, easeSwing(u)) (tech.md §11.2).
   */
  _profile(src, out) {
    const def = src.def, vis = src.vis, t = src.t;
    if (src.pounce) {
      const hang = src.pounce === 'hang';
      out.a = 0; out.e = hang ? vis.eb : vis.e0; out.reach = vis.r; out.h = hang ? 0.62 : vis.h; out.spin = 0; out.hop = 0; out.c = 0;
      out.twist = 0; out.lean = hang ? -0.12 : 0.3;
      return out;
    }
    const [t0, t1] = def.active ?? [0, def.dur ?? 0.4];
    const from = def.arc?.from ?? 0, to = def.arc?.to ?? 0;
    const full = Math.abs(from - to) >= Math.PI * 2 - 1e-3;
    const sgn = Math.sign(from - to) || 1;
    const post = Math.max(0.05, ((def.dur ?? t1) - t1) * 0.8);
    out.reach = vis.r; out.h = vis.h; out.hop = 0;
    out.twist = full ? 0 : (vis.twist ?? 0.3); out.lean = 0;
    if (full) {
      if (t < t0) { const u = easeOutCubic(t0 > 0 ? t / t0 : 1); out.c = SIDE * u; out.spin = (from - SIDE) * u; out.e = lerp(vis.e0, vis.eb, u); }
      else if (t <= t1) { const u = easeSwing((t - t0) / Math.max(1e-4, t1 - t0)); out.c = SIDE; out.spin = lerp(from, to, u) - SIDE; out.e = lerp(vis.e0, vis.e1, u); out.hop = (vis.hop ?? 0) * Math.sin(u * Math.PI); }
      else { const u = easeOutCubic(clamp((t - t1) / post, 0, 1)); out.c = SIDE * (1 - u); out.spin = lerp(to - SIDE, -Math.PI * 2, u); out.e = vis.e1 * (1 - u); }
      out.a = out.c + out.spin;
      return out;
    }
    const back = from + ANTIC * sgn;
    let a;
    if (t < t0) { const u = easeOutCubic(t0 > 0 ? t / t0 : 1); a = back; out.e = lerp(vis.e0, vis.eb, u); out.lean = -SWING_LEAN.back * u; }
    else if (t <= t1) {
      const u = easeSwing((t - t0) / Math.max(1e-4, t1 - t0));
      a = lerp(back, to, u); out.e = lerp(vis.eb, vis.e1, u);
      out.hop = (vis.hop ?? 0) * Math.sin(u * Math.PI);
      out.lean = SWING_LEAN.strike * (vis.hop ? 1.4 : 1) * Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.5);
      if (vis.thrust) out.reach = lerp(0.4, 1.9, Math.sin(u * Math.PI * 0.5));
    } else {
      const u = easeOutCubic(clamp((t - t1) / post, 0, 1));
      a = to - sgn * 0.22 * u; out.e = vis.e1 - 0.08 * u;
      out.lean = SWING_LEAN.strike * (vis.hop ? 1.4 : 1) * (1 - u);
      if (vis.thrust) out.reach = lerp(1.9, 1.2, u);
    }
    out.c = clamp(a, -SIDE, SIDE);
    out.spin = a - out.c;
    out.a = a;
    return out;
  }

  _swordDriver(J, dt, alpha) {
    const k = this.k, g = k.sword?.group;
    const sw = this.sw;
    const src = this._swingSource(alpha);
    if (this.clip?.kind === 'swing') {
      this.clip.t += dt * this.clip.speed;
      if (this.clip.t >= this.clip.dur) { const r = this.clip.resolve; this.clip = null; r?.(); }
    }
    const prof = this._prof || (this._prof = { a: 0, e: 0, c: 0, reach: 1, h: 0.5, spin: 0, hop: 0, twist: 0, lean: 0 });
    const active = !!src && !!g && g.visible;
    const p = this.player;
    const carry = !active && !!g && g.visible && this.poseName === 'ready' && p.onGround && (p.state === 'move' || p.scripted) &&
      Math.hypot(p.vel.x, p.vel.z) > CARRY.minSpeed;
    this.carryW = damp(this.carryW, carry ? 1 : 0, carry ? 6 : 10, dt);
    if (this.carryW < 0.002) this.carryW = 0;
    if (active) {
      this._profile(src, prof);
      const first = sw.w < 0.02;
      const k1 = first ? 1 : 1 - Math.exp(-55 * dt);
      sw.a = lerp(sw.a, prof.c, k1); sw.e = lerp(sw.e, prof.e, k1); sw.reach = lerp(sw.reach, prof.reach, k1); sw.h = lerp(sw.h, prof.h, k1);
      sw.spin = first ? prof.spin : lerp(sw.spin, prof.spin, 1 - Math.exp(-60 * dt));
      sw.hop = damp(sw.hop, prof.hop, 30, dt);
      sw.twist = lerp(sw.twist, prof.twist, k1); sw.lean = damp(sw.lean, prof.lean, 40, dt);
      sw.w = Math.min(1, sw.w + dt / SWING_POSE_BLEND);
    } else {
      sw.w = Math.max(0, sw.w - dt / 0.14);
      sw.spin = damp(wrapAngle(sw.spin), 0, 12, dt);
      sw.hop = damp(sw.hop, 0, 14, dt);
      if (Math.abs(sw.spin) < 1e-4) sw.spin = 0;
      if (this.carryW > 0) {                              // running carry: ease (a, e) there; a little bob per step
        const k1 = sw.w < 0.02 && this.carryW < 0.05 ? 1 : 1 - Math.exp(-14 * dt);
        const bob = Math.sin(p.gait * Math.PI * 2) * CARRY.bob * this.gaitAmp;
        sw.a = lerp(sw.a, CARRY.a, k1); sw.e = lerp(sw.e, CARRY.e + bob, k1);
        sw.reach = lerp(sw.reach, CARRY.reach, k1); sw.h = lerp(sw.h, CARRY.h + bob * 0.2, k1);
      }
      sw.twist = damp(sw.twist, this.carryW > 0 ? 0.2 : 0, 10, dt); sw.lean = damp(sw.lean, 0, 10, dt);
    }
    const wAll = Math.max(sw.w, this.carryW);
    if (wAll <= 0.001 || !g || !g.visible || !g.parent) return;
    const w = easeInOutSine(wAll);
    // body follows the blade: chest / hips twist toward the sword side, lean into the strike (the IK below adapts)
    const tw = sw.a * sw.twist * w;
    rot(J.hips, sw.lean * 0.35 * w, tw * 0.4, 0);
    rot(J.chest, sw.lean * 0.65 * w, tw * 0.6, 0);
    rot(J.head, -sw.lean * 0.5 * w, -tw * 0.45, 0);                    // the eyes stay on the target

    // ---- root-space chain body → hips → chest (after every layer above)
    _mBody.compose(J.body.position, J.body.quaternion, J.body.scale);
    _mHips.multiplyMatrices(_mBody, _mTmp.compose(J.hips.position, J.hips.quaternion, J.hips.scale));
    _mChest.multiplyMatrices(_mHips, _mTmp.compose(J.chest.position, J.chest.quaternion, J.chest.scale));
    _mChestInv.copy(_mChest).invert();
    _mChest.decompose(_v, _qChest, _s);
    _qChestInv.copy(_qChest).invert();

    // ---- the pose's own sword placement (root space)
    const parentIsHand = g.parent === k.rig.swordSocket;
    if (parentIsHand) this._handMatrix(J, _mHand); else _mHand.identity();
    _mPose.multiplyMatrices(_mHand, _mTmp.compose(g.position, g.quaternion, _one));
    _mPose.decompose(_posP, _quatP, _s);

    // ---- the swing's sword placement: blade dir from (angle, elevation); edge leads along the sweep
    const ca = Math.cos(sw.a), sa = Math.sin(sw.a), ce = Math.cos(sw.e), se = Math.sin(sw.e);
    _Y.set(sa * ce, se, ca * ce).normalize();
    _X.set(ca, 0, -sa);
    _X.addScaledVector(_Y, -_X.dot(_Y)).normalize();
    _Z.crossVectors(_X, _Y).normalize();
    _P.set(sa * GRIP_X * sw.reach, sw.h, ca * GRIP_Z * sw.reach + GRIP_Z0);
    _O.copy(_P).addScaledVector(_Y, -SWORD_PTS.gripMid);
    _mSW.makeBasis(_X, _Y, _Z).setPosition(_O);
    _mSW.decompose(_posS, _quatS, _s);

    // ---- blend, then put both paws on the grip
    _posS.lerpVectors(_posP, _posS, w);
    _quatS.copy(_quatP.slerp(_quatS, w));             // (slerpQuaternions(a, this) would alias: copy(a) first)
    _mSW.compose(_posS, _quatS, _one);
    _Y.set(0, 1, 0).applyQuaternion(_quatS);
    const armW = clamp(w * 3, 0, 1);
    for (const side of ['R', 'L']) {
      const grip = side === 'R' ? SWORD_PTS.gripTop - 0.022 : SWORD_PTS.gripLow + 0.006;
      _T.copy(_posS).addScaledVector(_Y, grip).applyMatrix4(_mChestInv);
      this._solveArm(J, side, _T, armW);
    }
    // ---- sword local transform under its parent
    if (parentIsHand) this._handMatrix(J, _mHand); else _mHand.identity();
    _mTmp.copy(_mHand).invert().multiply(_mSW);
    _mTmp.decompose(g.position, g.quaternion, _s);
  }

  /** Root-space matrix of the sword socket (chest → shoulderR → elbowR → pawR → socket). Requires _mChest. */
  _handMatrix(J, out) {
    out.copy(_mChest);
    for (const n of ['shoulderR', 'elbowR', 'pawR']) out.multiply(_mTmp.compose(J[n].position, J[n].quaternion, J[n].scale));
    const sock = this.k.rig.swordSocket;
    if (sock) out.multiply(_mTmp.compose(sock.position, sock.quaternion, sock.scale));
    return out;
  }

  /** Two-bone IK in chest space (characters' solveTwoBone), slerped over the pose by `weight`. */
  _solveArm(J, side, targetChest, weight) {
    const sh = J['shoulder' + side], el = J['elbow' + side], pw = J['paw' + side];
    _S.copy(sh.position);
    _pole.copy(POLE[side]).applyQuaternion(_qChestInv);
    _W.copy(targetChest);
    _qP.copy(TWIST[side]);
    for (let it = 0; it < 3; it++) {
      solveTwoBone(_S, _W, ARM.upper, ARM.fore, _pole, _qS, _qE);
      _rot.copy(_qS).multiply(_qE).multiply(_qP);
      _W.copy(targetChest).sub(_v.copy(_centre).applyQuaternion(_rot));
    }
    sh.quaternion.slerp(_qS, weight); el.quaternion.slerp(_qE, weight); pw.quaternion.slerp(_qP, weight);
  }

  // ------------------------------------------------------------------ glow, blink, blob
  _glow(dt) {
    const p = this.player, k = this.k, s = p.state;
    let target = 0;
    if (s === 'charge') target = p.chargeTier >= 2 ? 1 : p.chargeTier >= 1 ? 0.18 : 0;
    if (s === 'golden') target = 1;
    if (p.golden) target = Math.max(target, 0.55);
    if (p.swing && (p.swing.def.id === 'holy' || p.swing.def.id === 'sunburst')) target = 1;
    if (this.clip?.def?.id === 'holy') target = 1;
    if (p.immuneT > 0) target = Math.max(target, 0.4);
    this.holyVis = damp(this.holyVis, target, target > this.holyVis ? 18 : 3, dt);
    const h = this.holyVis < 0.005 ? 0 : this.holyVis;
    if (Math.abs(h - this.holyLast) > 0.004) {
      this.holyLast = h;
      k.setHoly(h);
      this.ctx.fx?.holy?.(p, h);
    }
    k.sword?.setValorGlow?.(p.valor / PLAYER.valor.max);
  }

  /** Physics step-ups (stepY) snap the feet up 0.3 m in one step: ease the body up over ~0.1 s instead. */
  _stepSmooth(dt) {
    const p = this.player, acc = p.stepAccum ?? 0;
    const d = acc - this.stepSeen;
    this.stepSeen = acc;
    if (d > 0 && d < 0.6) this.stepOff -= d;
    this.stepOff = damp(this.stepOff, 0, 22, dt);
    if (this.stepOff > -1e-4) this.stepOff = 0;
    return this.stepOff;
  }

  _blinkAndBlob(dt) {
    const p = this.player, k = this.k, ctx = this.ctx;
    // §7.6 hurt: 0.9 s of i-frames with the mesh blinking at 15 Hz (after the stun); a white flash on the hit itself
    const blink = p.alive && p.blinkT > 0 && p.state !== 'hurt' && p.state !== 'dead' && !p.scripted;
    k.root.visible = !blink || Math.floor(ctx.game.realTime * PLAYER.hurt.blinkHz * 2) % 2 === 0;
    if (dt > 0 || this.flash === 1) this.flash = Math.max(0, this.flash - (dt > 0 ? dt : 0) / TUNING.hurtFlash);
    const f = this.flash > 0 ? Math.min(1, this.flash * 1.5) : 0;
    if (Math.abs(f - this.flashLast) > 0.01) { this.flashLast = f; k.setFlash(f); }
    if (k.blob) {
      const ground = ctx.physics?.heightAt?.(p.object3d.position.x, p.object3d.position.z) ?? p.object3d.position.y;
      const h = p.object3d.position.y + k.root.position.y - ground;
      k.blob.position.y = 0.004 - Math.max(0, h);
      const s = 1 / (1 + Math.max(0, h) * 0.8);
      k.blob.scale.multiplyScalar(s);
    }
  }

  _renderFallback(dt) {
    const p = this.player, sw = this.fallbackSword;
    const swing = p.swing;
    let yaw = 0, tilt = 0;
    if (swing?.def.arc) {
      const d = swing.def, [t0, t1] = d.active ?? [0, d.dur ?? 0.4];
      const u = clamp((swing.t - t0) / Math.max(1e-3, t1 - t0), 0, 1);
      yaw = lerp(d.arc.from, d.arc.to, easeSwing(u)); tilt = 1.3;
    } else if (p.guarding) { tilt = 0.2; }
    sw.rotation.y = damp(sw.rotation.y, yaw, 30, dt);
    sw.rotation.x = damp(sw.rotation.x, tilt, 20, dt);
    this.fallback.visible = !(p.alive && p.blinkT > 0 && p.state !== 'hurt' && Math.floor(this.ctx.game.realTime * PLAYER.hurt.blinkHz * 2) % 2 === 1);
  }
}
