// src/companions/KittenVisual.js  (owner: companions) — the procedural cat look for every companion-area actor
// (Companion, NpcActor, LostKitten): characters' KittenView (buildKitten + the in-game glue: character env map,
// fur/cape wind, hitstop / pause / slow-mo aware visual dt, quality) plus this area's procedural motion layer
// (requests/characters.md: view.animate → our joint offsets → view.simulate):
//   trot / run gait, arm stances for kittens without a sword (relaxed, shield up, cheer, staff, bow), a shield-bash
//   swing, hops, squash, appear/vanish scale, head look-at and hurt flash.
// Warm-art / perf pass (ART §6, §6.6, §8.6; PERF §4.3, §9; X9, X13, K5): role head scale (kittens 1.22, villagers 1.05),
// no sun-shadow casting (a contact blob through fx.blobs), the ink hull per QUALITY.outline, tufts per
// QUALITY.charTufts, close-up shells through characters' setCloseUp, the camera glance, one-shot gestures (paw-bump,
// boop, yawn, ...), and the PERF §4.3 activity tier / NPC band that decides how often this cat animates and simulates.
// Visual only: driven from the owning actor's render(alpha, frameDt).
import * as THREE from 'three';
import * as CH from '../characters/index.js';
import { KittenView, KITTEN_IDS } from '../characters/index.js';
import { clamp, clamp01, damp, smoothstep, easeOutBack, wrapAngle } from '../core/math.js';
import { activityTier, npcBand, bandAnimates, ACTIVITY } from './activity.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _zero = new THREE.Vector3();
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

/** ART §6 head-size targets per role (`cfg.headScale`: kittens 1.22, villagers 1.05; the hero's 1.17 is characters'). */
export const HEAD_SCALE = Object.freeze({ kitten: 1.22, companion: 1.22, villager: 1.05 });
/** ART §6.6 glance at the camera: idle and calm, every 6–10 s (seeded), up to 25° (+ a 6° chin lift), held 0.8–1.4 s with a blink. */
export const GLANCE = Object.freeze({ every: [6, 10], hold: [0.8, 1.4], maxYaw: 25 * Math.PI / 180, chin: 0.1, inRate: 6, outRate: 9 });
/** Squash for a hop (ART §8.6: the rescued kitten's hop uses ×1.2): take-off stretch, landing squash. */
export const HOP_SQUASH = Object.freeze({ up: 0.08, land: -0.12 });
/** Outline widths (ART §5.4 / X9, px at dpr 1) and the ink they use (TONE.ink mixed toward the actor's hue; never black). */
export const HULL = Object.freeze({ companion: 1.6, kitten: 1.6, villager: 1.6, ink: '#4A2A1F' });
/**
 * Procedural one-shot gestures on the existing rig (WA §5.6): duration (s). `pawBump` paw up and out, `boop` a 12° head
 * tilt + lean (nose-boop), `yawn` head back + paws up, `nodBook` two nods over a tiny book, `cheer` both paws up.
 */
export const GESTURES = Object.freeze({ pawBump: 0.8, boop: 0.4, yawn: 1.4, nodBook: 1.6, cheer: 1.0, look: 1.6 });

/** Role of a buildKitten config when the owner did not say: lost kittens and named kittens → 'kitten', else 'villager'. */
export function roleOf(cfg) {
  if (!cfg) return 'villager';
  if (cfg.tier === 'kitten' || KITTEN_IDS.includes(cfg.id)) return 'kitten';
  return 'villager';
}

/** `cfg` with the role's ART head scale (villagers keep a little of their seeded variation). Pure; never mutates `cfg`. */
export function withHeadScale(cfg, role) {
  if (!cfg) return cfg;
  const target = HEAD_SCALE[role];
  if (!target) return cfg;
  const jitter = role === 'villager' && Number.isFinite(cfg.headScale) ? (cfg.headScale - 1.03) * 0.5 : 0;
  return { ...cfg, headScale: Math.round((target + jitter) * 1000) / 1000 };
}

/** Should an actor of `role` wear the ink hull at `QUALITY.outline` `tier` (X9: Low hero + boss, Med + companions, High all)? */
export function hullFor(role, tier) {
  if (tier === 'all') return true;
  if (tier === 'heroCompanionsEngaged') return role === 'companion';
  return false;
}

/** characters' hull builder (lands with A:characters; looked up by name so the bundle builds before it exists) */
const OUTLINE_BUILDER = 'buildOutline';
let _seed = 1;
const _rand = (s) => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export class KittenVisual {
  /**
   * @param {any} ctx
   * @param {object} cfg buildKitten config (characters/configs.js)
   * @param {{ role?: 'companion'|'kitten'|'villager', actor?: any, blobR?: number, glance?: boolean }} [o]
   *   role: ART head scale / hull tier (default from the config); actor: the owner (activity tier, NPC band, glance,
   *   contact blob); glance: ART §6.6 camera glance (default on)
   */
  constructor(ctx, cfg, o = {}) {
    this.ctx = ctx;
    this.role = o.role ?? roleOf(cfg);
    this.cfg = withHeadScale(cfg, this.role);
    this.actor = o.actor ?? null;
    /** offset group: hops, appear scale (the actor's object3d holds the interpolated transform) */
    this.root = new THREE.Group();
    this.root.name = 'kittenVisual:' + (cfg?.id ?? 'cat');
    // K5 / PERF §9: actors never cast sun shadows (contact blobs via fx.blobs instead)
    this.view = new KittenView(ctx, this.cfg, { parent: this.root, memeCam: false, castShadow: false, glance: false });
    this.k = this.view.kitten;
    this.hasSword = !!this.k.sword;
    this.seed = (_seed = (_seed * 1103515245 + 12345) & 0x7fffffff);
    this.phase = _rand(this.seed) * 6;           // visual only
    this.moveBlend = 0; this.speed = 0;
    /** current + target stance weights */
    this.stance = 'relaxed';
    this._stanceW = Object.fromEntries(Object.keys(STANCES).map((k) => [k, k === 'relaxed' ? 1 : 0]));
    this.attackT = -1; this.attackDur = 0.42; this.attackKind = 'bash';
    this.hopT = -1; this.hopDur = 0.4; this.hopH = 0.25; this.hopSquash = 1;
    this.flashT = 0;
    this.squash = 0; this._sqV = 0;
    this.look = 0; this.lookTarget = 0;
    this.fade = 1; this.fadeTarget = 1; this.fadeSpeed = 5;
    this.wave = 0;
    /** one-shot gesture overlay: { name, t, dur } or null */
    this.gestureName = null; this.gestureT = 0; this.gestureDur = 0;
    /** ART §6.6 glance state */
    this.glanceOn = o.glance !== false;
    this._gl = { t: GLANCE.every[0] + _rand(this.seed + 7) * (GLANCE.every[1] - GLANCE.every[0]), hold: 0, w: 0, yaw: 0, n: 0 };
    /** PERF §4.3 activity: tier (0..3), band ('full'|'half'|'slow'|'off'), accumulated frame dt of skipped frames */
    this.tier = 0; this.band = 'full'; this._acc = 0; this._simAcc = 0; this._simN = 0; this._closeUp = false;
    this.preset = null; this.hull = null; this._hullOn = false;
    this._tufts = this.k.root.getObjectByName?.('tufts') ?? null;
    this.blob = null;
    if (o.actor && Number.isFinite(o.blobR) && typeof ctx?.fx?.blobs?.add === 'function') {
      try { this.blob = ctx.fx.blobs.add(o.actor.object3d, o.blobR) ?? true; } catch (e) { console.warn('[companions] blob add failed', e); }
    }
    this.applyQuality(ctx?.quality);
  }

  get rig() { return this.k.rig; }
  get poseName() { return this.k.poseName; }
  /** Is the cat drawn this frame (activity band 'full' / 'half' and not faded out)? */
  get drawn() { return this.root.visible; }

  /** Quality preset changed: shells (iso / close-up), tufts, hull. */
  applyQuality(preset) {
    if (preset) this.preset = preset;
    this._syncLook();
  }

  /**
   * Shells, tufts and hull for the current preset, band and close-up (X8: 0 shells at the iso lens on every tier; the
   * close-up count ×0.6 for kittens, only in the 'full' band; characters' setCloseUp when it exists).
   */
  _syncLook() {
    const P = this.preset, k = this.k;
    if (!P) return;
    const close = this._closeUp && this.band === 'full';
    if (typeof this.view.setCloseUp === 'function') { try { this.view.setCloseUp(close); } catch (e) { console.warn('[companions] setCloseUp failed', e); } }
    else if (!k.lite) {
      const iso = P.kittenShellsIso ?? P.kittenShells ?? 0;
      const n = close ? Math.round((P.furShellsClose ?? iso) * 0.6) : this.band === 'full' ? iso : 0;
      if (typeof n === 'number' && n !== this._shells) { this._shells = n; k.setFurShells(n); }
    }
    if (this._tufts) this._tufts.visible = P.charTufts !== false;
    this._syncHull(hullFor(this.role, P.outline ?? 'hero') && this.band === 'full');
  }

  /**
   * The X9 ink hull (one merged proxy per actor, coloured ink, 1.6 px for kittens). Uses the characters API when it
   * lands (the view, then the kitten setOutline, then buildOutline(proxy, opts)); a no-op until then.
   */
  _syncHull(on) {
    if (on === this._hullOn) return;
    this._hullOn = on;
    const opts = { px: HULL[this.role] ?? 1.6, color: HULL.ink, kind: this.role };
    try {
      if (typeof this.view.setOutline === 'function') { this.view.setOutline(on, opts); return; }
      if (typeof this.k.setOutline === 'function') { this.k.setOutline(on, opts); return; }
      const build = CH[OUTLINE_BUILDER];
      if (!this.hull && on && typeof build === 'function') {
        const proxy = this.k.getSilhouetteProxy?.();
        this.hull = proxy ? build(proxy, opts) ?? null : null;
        if (this.hull && !this.hull.parent) this.k.root.add(this.hull);
      }
      if (this.hull) this.hull.visible = on;
    } catch (e) { console.warn('[companions] outline failed', e); this.hull = null; }
  }

  setPose(name, blend = 0.25) { this.k.setPose(name || 'idle', { blend }); return this; }
  setExpression(name) { this.k.setExpression(name); return this; }
  emote(name) { this.k.emote(name); return this; }
  setProp(name, on, opts) { this.k.setProp(name, on, opts); return this; }
  setStance(name) { this.stance = STANCES[name] ? name : 'relaxed'; return this; }

  /** Start a melee swing overlay ('bash' shield shove, 'swipe' paw swat). */
  attack(kind = 'bash') { this.attackT = 0; this.attackKind = kind; }
  /**
   * A little hop (height in metres). `squash` scales the take-off stretch and the landing squash (ART §8.6: the
   * rescued kitten's hop is ×1.2).
   */
  hop(h = 0.25, dur = 0.4, squash = 1) { this.hopT = 0; this.hopH = h; this.hopDur = dur; this.hopSquash = squash; this.punch(HOP_SQUASH.up * squash); }
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
   * A one-shot procedural gesture (GESTURES): 'pawBump' | 'boop' | 'yawn' | 'nodBook' | 'cheer' | 'look'. Returns
   * false for an unknown name.
   */
  gesture(name, dur = GESTURES[name]) {
    if (!GESTURES[name]) return false;
    if (this.gestureName === 'nodBook' && name !== 'nodBook') this.setProp('letter', false);
    this.gestureName = name; this.gestureT = 0; this.gestureDur = dur;
    if (name === 'cheer') { this.hop(0.22, 0.38, 1.1); this.setExpression('happy'); }
    else if (name === 'yawn') this.setExpression('sleepy');
    else if (name === 'boop') { this.emote('blink'); this.setExpression('happy'); }
    else if (name === 'nodBook') { this.setProp('letter', true); this.emote('nod'); }
    else if (name === 'pawBump') this.setExpression('happy');
    return true;
  }

  /** PERF §4.3: the activity tier and NPC band this frame (owner's actor; no actor = always 'full'). */
  _activity(o) {
    const a = this.actor;
    if (!a || !this.ctx) return;
    const tier = activityTier(this.ctx, a);
    const close = !!o.close || !!a.scripted || this.ctx.game?.mode === 'cutscene';
    const band = npcBand(this.ctx, a, tier, close);
    if (tier !== this.tier) {
      this.tier = tier;
      if (typeof this.view.setActivity === 'function') { try { this.view.setActivity(tier); } catch (e) { console.warn('[companions] setActivity failed', e); } }
    }
    const cu = !!this.ctx.cam?.closeUp;
    if (band !== this.band || cu !== this._closeUp) { this.band = band; this._closeUp = cu; this._syncLook(); }
  }

  /**
   * Per rendered frame.
   * @param {number} frameDt real frame seconds (KittenView turns it into the visual dt: 0 in hitstop / the pause
   *   menu, scaled by slow motion)
   * @param {{ velocity?: THREE.Vector3, onGround?: boolean, calm?: boolean, close?: boolean }} [o] calm: idle and out
   *   of combat (the glance may run); close: always the full band (the party, a speaker)
   */
  update(frameDt, o = {}) {
    this._activity(o);
    const band = this.band;
    this._acc += frameDt;
    if (!bandAnimates(band, this.actor?.id ?? 0, this.ctx?.game?.frameCount)) {
      this.root.visible = (band === 'full' || band === 'half') && this.fade > 1e-3;
      return;
    }
    frameDt = Math.min(this._acc, 0.25); this._acc = 0;
    const k = this.k, J = k.rig.joints, R = k.rest;
    const dt = this.view.animate(frameDt, { idle: true });
    if (k.shadowProxy) k.shadowProxy.visible = false;            // K5: no sun shadow → the shadow-only proxy is a dead draw
    this.dt = dt;
    const vel = o.velocity;
    const sp = vel ? Math.hypot(vel.x, vel.z) : 0;
    this.speed = damp(this.speed, sp, 12, dt);
    const pose = k.poseName || 'idle';
    const gait = GAIT_POSES.has(pose) && o.onGround !== false;
    this.moveBlend = damp(this.moveBlend, gait && this.speed > 0.25 ? 1 : 0, 10, dt);
    const s01 = clamp01(this.speed / 5.2) * this.moveBlend;

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

    // ---- gait (trot → run): diagonal pairs, body bob (ART §6.5: kittens 0.06 |sin|, two bounces a stride), lean
    if (s01 > 0.01) {
      this.phase += dt * (7 + 7 * s01);
      const ph = this.phase, sw = Math.sin(ph), cw = Math.cos(ph);
      const legA = (0.55 + 0.35 * s01) * s01 * 1.6;
      rot(J.thighL, sw * legA, 0, 0); rot(J.thighR, -sw * legA, 0, 0);
      rot(J.kneeL, Math.max(0, -cw) * 0.9 * s01 * 1.4, 0, 0); rot(J.kneeR, Math.max(0, cw) * 0.9 * s01 * 1.4, 0, 0);
      const armA = 0.45 * s01 * 1.4 * (this.stance === 'relaxed' ? 1 : 0.35);
      rot(J.shoulderL, -sw * armA, 0, 0); rot(J.shoulderR, sw * armA, 0, 0);
      J.body.position.y += Math.abs(sw) * 0.06 * s01;
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

    // ---- one-shot gesture overlay (WA §5.6)
    if (this.gestureName) this._gesture(dt, J);

    // ---- head look (lost kittens watch her, companions glance at targets) + ART §6.6 camera glance
    this.look = damp(this.look, this.lookTarget, 6, dt);
    if (Math.abs(this.look) > 1e-3) { rot(J.head, 0, this.look * 0.7, 0); rot(J.chest, 0, this.look * 0.3, 0); }
    this._glance(dt, J, o.calm === true && s01 < 0.05 && !this.gestureName);

    // ---- squash spring (volume preserving), hop, appear scale
    const sdt = Math.min(dt, 1 / 30);                         // explicit spring: keep the step stable on frame hitches
    const acc = -120 * this.squash - 14 * this._sqV;
    this._sqV += acc * sdt; this.squash += this._sqV * sdt;
    this.squash = clamp(this.squash, -0.35, 0.35);
    const sy = 1 + this.squash, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    J.body.scale.set(sxz * R.body.s.x, sy * R.body.s.y, sxz * R.body.s.z);
    let hopY = 0;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const u = this.hopT / this.hopDur;
      if (u >= 1) { this.hopT = -1; this.punch(HOP_SQUASH.land * this.hopSquash); } else hopY = this.hopH * 4 * u * (1 - u);
    }
    this.root.position.y = hopY;
    this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + dt * this.fadeSpeed) : Math.max(this.fadeTarget, this.fade - dt * this.fadeSpeed);
    const f = this.fadeTarget >= this.fade && this.fade < 1 ? easeOutBack(this.fade) : this.fade;
    this.root.scale.setScalar(Math.max(1e-3, f));
    this.root.visible = this.fade > 1e-3 && (band === 'full' || band === 'half');

    if (this.flashT > 0) { this.flashT = Math.max(0, this.flashT - dt); k.setFlash(this.flashT > 0 ? 1 : 0); }

    // secondary motion: every animated frame in 'full', every 2nd in 'half' (15 Hz, with the summed dt), never below
    const se = ACTIVITY.simEvery[band] ?? 1;
    this._simAcc += dt;
    if (se === 1 || (se > 1 && ++this._simN % se === 0)) {
      if (se > 1 && '_dt' in this.view) this.view._dt = this._simAcc;
      this._simAcc = 0;
      this.view.simulate({ velocity: vel ?? _zero, airborne: hopY > 0.05 || o.onGround === false });
    }
  }

  /** The gesture overlay (additive on the final joints; GESTURES). */
  _gesture(dt, J) {
    this.gestureT += dt;
    const u = this.gestureT / this.gestureDur;
    if (u >= 1) {
      if (this.gestureName === 'nodBook') this.setProp('letter', false);
      this.gestureName = null;
      return;
    }
    const w = Math.sin(Math.PI * clamp01(u));                 // 0 → 1 → 0
    switch (this.gestureName) {
      case 'pawBump': rot(J.shoulderR, -1.35 * w, 0, -0.25 * w); rot(J.elbowR, -0.35 * w, 0, 0); rot(J.chest, 0.08 * w, -0.2 * w, 0); break;
      case 'boop': rot(J.head, 0.12 * w, 0, 0.21 * w); rot(J.chest, 0.15 * w, 0, 0); rot(J.body, 0.06 * w, 0, 0); break;
      case 'yawn': rot(J.head, -0.4 * w, 0, 0.08 * w); rot(J.shoulderL, -1.9 * w, 0, 0.3 * w); rot(J.shoulderR, -1.9 * w, 0, -0.3 * w); break;
      case 'nodBook': rot(J.head, 0.22 * Math.max(0, Math.sin(u * Math.PI * 4)), 0, 0); rot(J.shoulderL, -0.7 * w, 0, 0); rot(J.shoulderR, -0.7 * w, 0, 0); break;
      case 'cheer': rot(J.shoulderL, -2.4 * w, 0, 0.35 * w); rot(J.shoulderR, -2.4 * w, 0, -0.35 * w); break;
      case 'look': rot(J.head, 0, Math.sin(u * Math.PI * 2) * 0.55 * w, 0); break;
      default: break;
    }
  }

  /**
   * ART §6.6: idle and calm, every 6–10 s (seeded per cat) the head turns up to 25° toward the camera with a small chin
   * lift and a blink, holds 0.8–1.4 s, and returns. `calm` false (moving, fighting, a gesture) drops it.
   */
  _glance(dt, J, calm) {
    const g = this._gl, a = this.actor, cam = this.ctx?.camera;
    if (!this.glanceOn || !a || !cam) return;
    if (!calm) g.hold = 0;
    else if (g.hold > 0) g.hold -= dt;
    else {
      g.t -= dt;
      if (g.t <= 0) {
        g.n++;
        g.hold = GLANCE.hold[0] + _rand(this.seed + g.n * 13) * (GLANCE.hold[1] - GLANCE.hold[0]);
        g.t = GLANCE.every[0] + _rand(this.seed + g.n * 29) * (GLANCE.every[1] - GLANCE.every[0]);
        g.yaw = clamp(wrapAngle(Math.atan2(cam.position.x - a.pos.x, cam.position.z - a.pos.z) - (a.facing ?? 0)), -GLANCE.maxYaw, GLANCE.maxYaw);
        this.emote('blink');
      }
    }
    g.w = damp(g.w, g.hold > 0 ? 1 : 0, g.hold > 0 ? GLANCE.inRate : GLANCE.outRate, dt);
    if (g.w > 1e-3) rot(J.head, -GLANCE.chin * g.w, g.yaw * g.w, 0);
  }

  /**
   * Hand this visual to another actor (a caged squire's cat becomes the party member's: no second buildKitten on the
   * join frame, requests/characters.md "join hitch"). Moves the contact blob, resets the per-owner overlays.
   * @param {any} actor @param {{ role?: string, blobR?: number }} [o]
   */
  rebind(actor, o = {}) {
    const fxb = this.ctx?.fx?.blobs;
    if (this.blob && this.actor && typeof fxb?.remove === 'function') { try { fxb.remove(this.actor.object3d); } catch { /* fx gone */ } }
    this.blob = null;
    this.actor = actor ?? null;
    if (o.role && o.role !== this.role) { this.role = o.role; this._hullOn = !this._hullOn; this._syncLook(); }
    if (actor && Number.isFinite(o.blobR) && typeof fxb?.add === 'function') { try { this.blob = fxb.add(actor.object3d, o.blobR) ?? true; } catch (e) { console.warn('[companions] blob add failed', e); } }
    this.root.removeFromParent();
    this.root.rotation.set(0, 0, 0); this.root.position.set(0, 0, 0);
    this.wave = 0; this.lookTarget = 0; this.stance = 'relaxed'; this.gestureName = null;
    this._gl.hold = 0; this.tier = 0; this.band = 'full'; this._acc = 0;
    return this;
  }

  /** Is the camera glance holding right now (tests, smoke)? */
  get glancing() { return this._gl.hold > 0; }

  snap() { this.view.snap(); }

  /** Paw position in world space (for props / arrows). */
  jointWorld(name, out = _v) { const b = this.k.rig.joints[name]; if (!b) return out.set(0, 0, 0); b.updateWorldMatrix(true, false); return b.getWorldPosition(out); }

  dispose() {
    if (this.blob && this.actor && typeof this.ctx?.fx?.blobs?.remove === 'function') { try { this.ctx.fx.blobs.remove(this.actor.object3d); } catch { /* fx gone */ } }
    this.blob = null;
    if (this.hull) { this.hull.removeFromParent(); this.hull = null; }
    this.view.dispose(); this.root.removeFromParent();
  }
}
