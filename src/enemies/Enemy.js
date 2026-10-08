// src/enemies/Enemy.js  (owner: enemies) — the Enemy actor: tech.md §10 FSM as amended by GAME_DESIGN §10.1
//   idle → patrol → alert (0.4 s "!" hop) → chase (tokens; tokenless enemies orbit at 1.4× range) → windup (telegraph)
//   → strike → recover (punish window) → stagger / flee / return / die (poof, helmet spin-off, scamper).
// Frozen contract (§19.4): fields def, stateName, objectiveRunner; methods setState(name), telegraph(kind, desc)
// (emits combat:telegraph; auto-ended on strike / stagger / death), stagger(sec), onParried(), onBlocked(), plus the
// ScriptedActor API (core/ScriptedActor.js mixin; visual hooks playClip / onPose / onEmote / onProp below).
// Types (types/*.js, Appendix B.3) add data, `anims`, a `build(e, model)` dresser and state overrides.
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { Animator } from '../core/Animator.js';
import { E } from '../core/events.js';
import { ATTACKS, PLAYER, TELEGRAPH } from '../core/config.js';
import { damp, dampAngle, wrapAngle, clamp } from '../core/math.js';
import { TUNING, rangeOf } from './tuning.js';
import { clipKey, clipsFor, isSpec, specDuration } from './clipMaps.js';
import { flashMaterials, markOwned, disposeInstanceMaterials, applyUpright } from './rig.js';

let teleId = 1;                         // telegraph ids (fx numbers its own from 1 000 000)
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

/** KayKit head meshes a beast head replaces (characters' attachBeastHead hides them after measuring). */
const KAYKIT_HEADS = new Set(['Barbarian_Head', 'Knight_Head', 'Rogue_Head_Hooded', 'Rogue_Head', 'Mage_Head']);

const MELEE_FALLBACK = { telegraph: 'parry', windup: 0.6, dur: 0.45, active: [0, 0.12], arc: { range: 1.6, from: 0.7, to: -0.7, y0: 0, y1: 1.3 },
  dmg: 1, knock: 3, poise: 1, recover: 0.8 };

/**
 * Visual (animation) dt for a rendered frame: frozen during hitstop and the pause menu, scaled by slow motion
 * (the loop's timeScale) so mixers slow down with the simulation.
 */
export function visualDt(ctx, frameDt) {
  const g = ctx?.game;
  if (!g) return frameDt;
  if (g.hitstopT > 0 || g.mode === 'menu') return 0;
  return frameDt * (g.loop?.timeScale ?? 1);
}

/** Shared alert "!" material (§10.1 the 0.4 s "!" hop): drawn on a canvas on first use (browser only), never per enemy. */
let _bangMat = null;
function bangMaterial() {
  if (_bangMat) return _bangMat;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const mark = () => {                                     // tapered bar + dot, in a 64 × 128 box
    g.beginPath();
    g.moveTo(20, 14); g.quadraticCurveTo(32, 6, 44, 14); g.lineTo(38, 78); g.quadraticCurveTo(32, 84, 26, 78); g.closePath();
    g.moveTo(43, 103); g.arc(32, 103, 11, 0, Math.PI * 2);
  };
  g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = TUNING.bang.ink; mark(); g.stroke();
  g.fillStyle = TUNING.bang.color; mark(); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _bangMat = new THREE.SpriteMaterial({ name: 'enemy-alert-bang', map: tex, transparent: true, depthWrite: false, fog: false });
  return _bangMat;
}

/** Telegraph kind → default §19.5 shape. */
export function defaultShape(kind) {
  switch (kind) {
    case 'parry': case 'gold': case 'red': return 'glint';
    case 'aim': return 'line';
    case 'grab': return 'swirl';
    case 'jeer': return 'rings';
    case 'shadow': return 'shadow';
    default: return 'circle';
  }
}

/**
 * Windup length for an attack def (§8.1 minimum lead per kind, §10.1 minimum windup, difficulty multiplier).
 * Pure; exported for tests.
 * @param {any} def attack def @param {number} [mul] difficulty × boss-phase windup multiplier
 */
export function windupFor(def, mul = 1) {
  const lead = TELEGRAPH.minLead[def?.telegraph] ?? TUNING.windupMin;
  return Math.max(lead, TUNING.windupMin, (def?.windup ?? MELEE_FALLBACK.windup) * mul);
}

/** Base states (tech.md §10 + §10.1). `def.states` entries are merged over these per type. */
export const BASE_STATES = {
  idle: {
    anim: 'idle',
    enter(e) { e.idleFor = rangeOf(e.ctx.rng, TUNING.idleTime); },
    update(e, dt) {
      e.brake(dt);
      if (e.checkWake(dt) || e.sees) return e.alert();
      if (!e.perched && e.patrolRadius > 0 && e.stateT > e.idleFor) e.setState('patrol');
    },
  },
  patrol: {
    anim: 'move',
    enter(e) {
      const a = e.ctx.rng.angle(), r = e.ctx.rng() * e.patrolRadius;
      e.goal.set(e.home.x + Math.sin(a) * r, e.home.y, e.home.z + Math.cos(a) * r);
    },
    update(e, dt) {
      if (e.checkWake(dt) || e.sees) return e.alert();
      const left = e.steerTo(e.goal.x, e.goal.z, e.def.walk ?? 1.5, dt);
      e.faceVel(dt, TUNING.turnRate);
      if (left < TUNING.arrive || e.stateT > TUNING.patrolTimeout) e.setState('idle');
    },
  },
  alert: {
    anim: 'idle',
    enter(e) {
      e.alerted = true;
      if (e.onGround && !e.flying) { e.vel.y = TUNING.alertHopV; e.onGround = false; }
      e.ctx.bus.emit(E.ENEMY_ALERTED, { enemy: e });
      e.ctx.enemies?.alertNear?.(e.pos, TUNING.groupAlertRadius, e);
    },
    update(e, dt) {
      e.brake(dt);
      const p = e.targetActor();
      if (p) e.faceTo(p.pos, dt, TUNING.turnRate);
      if (e.stateT >= TUNING.alertDur) e.setState(p ? 'chase' : 'idle');
    },
  },
  chase: {
    anim: 'move',
    enter(e) { e.tokenT = 0; e.orbitT = 0; },
    update(e, dt) { e.chaseMelee(dt); },
    exit(e) { e.attackChoice = null; },
  },
  windup: {
    anim: (e) => ['windup', { once: true, clampEnd: true, fitDur: e.windupDur }],
    enter(e) {
      e.brakeHard();
      const def = e.attack?.def ?? MELEE_FALLBACK;
      if (e.preTold) { e.preTold = false; e.windupDur = Math.max(0.05, (def.windup ?? 0.3) * e.windupMul()); return; }
      e.windupDur = windupFor(def, e.windupMul());
      if (def.telegraph) e.telegraph(def.telegraph, { duration: e.windupDur });
    },
    update(e, dt) {
      e.brake(dt);
      const p = e.targetActor();
      if (p && e.stateT < e.windupDur - TUNING.windupTrackStop) e.faceTo(p.pos, dt, TUNING.windupTurnRate);
      if (e.stateT >= e.windupDur) e.setState('strike');
    },
  },
  strike: {
    anim: (e) => ['strike', { once: true, clampEnd: true }],
    enter(e) {
      e.endTelegraph();
      const def = e.attack?.def ?? MELEE_FALLBACK;
      e.swing = def.arc ? e.ctx.combat.beginSwing(e, def) : null;
      e.dashHit = false;
      if (def.projectile) e.fireProjectile(def);
      e.followUp = null;
      const fu = e.def.followUp;
      if (fu && e.attack?.id !== fu.id && ATTACKS[fu.id] && e.ctx.rng.chance(fu.chance ?? 0)) e.followUp = { id: fu.id, def: ATTACKS[fu.id], range: e.attack.range, cooldown: e.attack.cooldown, kind: e.attack.kind };
    },
    update(e, dt) {
      const def = e.attack?.def ?? MELEE_FALLBACK;
      if (e.swing) e.ctx.combat.updateSwing(e.swing, dt);
      const [a0, a1] = def.active ?? [0, 0.12];
      if (!def.arc && def.speed) {
        // dash attacks (hyena_lunge, stealer_snatch): run through her, one contact hit
        e.vel.x = Math.sin(e.facing) * def.speed; e.vel.z = Math.cos(e.facing) * def.speed;
        if (!e.dashHit) e.dashContact(def);
      } else if (def.lunge && e.stateT >= a0 && e.stateT <= a1 + 0.05) { e.vel.x = Math.sin(e.facing) * def.lunge; e.vel.z = Math.cos(e.facing) * def.lunge; }
      else e.brake(dt, 8);
      const dur = def.dur ?? 0.4;
      if (e.followUp && e.telegraphId == null) {
        // §10.3 follow-up: its gold glint must show ≥ minLead, so it starts before this strike ends (windup stays short)
        const fdef = e.followUp.def, lead = TELEGRAPH.minLead[fdef.telegraph] ?? TUNING.windupMin;
        const w = Math.max(0.05, (fdef.windup ?? 0.3) * e.windupMul());
        if (e.stateT >= dur - Math.max(0, lead - w) && e.stateT > a1) e.telegraph(fdef.telegraph, { duration: Math.max(lead, w) });
      }
      if (e.stateT >= dur) {
        if (e.followUp) { e.attack = e.followUp; e.followUp = null; e.preTold = e.telegraphId != null; e.setState('windup'); }
        else e.setState('recover');
      }
    },
    exit(e) { e.swing = null; },
  },
  recover: {
    anim: 'idle',
    update(e, dt) {
      e.brake(dt, 6);
      const def = e.attack?.def;
      if (e.stateT >= (def?.recover ?? def?.reload ?? TUNING.recoverDefault)) e.finishAttack();
    },
  },
  stagger: {
    anim: (e) => (e.roleSpec('hit') ? ['hit', { once: true, clampEnd: true, speed: 0.7 }] : ['idle', { speed: 0.4 }]),
    enter(e) { e.endTelegraph(); e.swing = null; e.followUp = null; e.preTold = false; e.releaseToken(); e.wobbleT = Math.max(e.wobbleT, e.staggerT); },
    update(e, dt) {
      e.staggerT -= dt;
      e.brake(dt, 6);
      if (e.staggerT > 0) return;
      e.staggerT = 0; e.attack = null;
      if (!e.alive) return e.setState('die');
      if (e.def.fleeBelow && !e.fled && e.hp / e.maxHp <= e.def.fleeBelow) return e.setState('flee');
      e.setState(e.targetActor() ? 'chase' : 'idle');
    },
  },
  flee: {
    anim: 'move',
    enter(e) { e.fled = true; e.endTelegraph(); e.releaseToken(); e.attack = null; },
    update(e, dt) {
      const p = e.targetActor();
      if (p) { _d.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z); if (_d.lengthSq() < 1e-6) _d.set(Math.sin(e.facing), 0, Math.cos(e.facing)); _d.normalize(); }
      else _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
      e.steerTo(e.pos.x + _d.x * 4, e.pos.z + _d.z * 4, e.def.run ?? 3.5, dt);
      e.faceVel(dt, TUNING.turnRate);
      if (e.stateT >= (e.def.fleeDur ?? 2)) e.setState(p ? 'chase' : 'return');
    },
  },
  return: {
    anim: 'move',
    enter(e) { e.releaseToken(); e.alerted = false; e.endTelegraph(); },
    update(e, dt) {
      if (e.stateT > 1.0 && e.sees && e.distToPlayer() < (e.def.leash ?? 18) * 0.6) return e.alert();
      const left = e.steerTo(e.home.x, e.home.z, e.def.walk ?? 1.5, dt);
      e.faceVel(dt, TUNING.turnRate);
      if (left < 0.5 || e.stateT > 20) { if (TUNING.returnHeal) e.hp = e.maxHp; e.setState('idle'); }
    },
  },
  die: {
    anim: (e) => (e.def.scamper ? ['run', { speed: 1.3 }] : ['death', { once: true, clampEnd: true }]),
    enter(e) {
      e.hurtable = false; e.endTelegraph(); e.swing = null; e.followUp = null; e.releaseToken();
      if (e.perched) { e.perched = false; e.flying = !!e.def.fly; }        // a perched shooter tumbles off its wall
      e.deathAt = e.pos.clone();
      const rng = e.ctx.rng, f = e.def.fish, fish = Array.isArray(f) ? rng.int(f[0], f[1] ?? f[0]) : (typeof f === 'number' ? f : 0);
      const smallHeart = e.def.smallHeart !== false && rng.chance(PLAYER.smallHeart.chance);
      const p = e.ctx.player;
      if (p) _d.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z); else _d.set(-Math.sin(e.facing), 0, -Math.cos(e.facing));
      if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1);
      _d.normalize();
      e.ctx.bus.emit(E.ENEMY_DIED, { enemy: e, type: e.def.id, position: e.deathAt.clone(), fish, smallHeart, height: e.height });
      // §8.2 Kill: the poof (fx adds the faction debris by `type`); our own helmet spins off below, so fx's
      // generic helmet pop is switched off with `helmet: false`
      e.ctx.bus.emit(E.BURST, { kind: 'poof', position: e.pos.clone(), type: e.def.id, height: e.height, dir: _d.clone(), helmet: false, count: 12 });
      e.dropHelmet(_d);
      if (e.def.scamper) {
        e.scamperYaw = Math.atan2(_d.x, _d.z) + (rng() - 0.5) * 0.8;
      }
    },
    update(e, dt) {
      if (e.def.scamper && e.stateT < TUNING.die.scamperDur) {
        e.facing = dampAngle(e.facing, e.scamperYaw, 12, dt);
        e.vel.x = Math.sin(e.facing) * TUNING.die.scamperSpeed; e.vel.z = Math.cos(e.facing) * TUNING.die.scamperSpeed;
      } else e.brake(dt, 6);
      if (e.stateT >= e.dieDur()) e.ctx.enemies?.despawn?.(e);
    },
  },
};

export class Enemy extends ScriptedActorMixin(Actor) {
  /**
   * @param {any} ctx @param {any} def resolved type def (Appendix A ENEMIES row + types/<id>.js + id)
   * @param {{pos?: THREE.Vector3, facing?: number, runner?: boolean, ai?: boolean, perched?: boolean, y?: number,
   *          id?: string, word?: string, cage?: boolean|string, seed?: number, patrolRadius?: number}} spawn
   *   patrolRadius: the level zone's patrol radius (Appendix B.1 `[type, n, at, patrolRadius]`) over the row's default
   */
  constructor(ctx, def, spawn = {}) {
    const diff = ctx.state?.difficultyCfg;
    const hp = Math.max(1, Math.round((def.hp ?? 30) * (diff?.enemyHp ?? 1)));
    super(ctx, { faction: def.faction ?? 'enemy', radius: def.radius ?? 0.35, height: def.height ?? 1, maxHp: hp, mass: def.mass ?? 1,
      maxPoise: Array.isArray(def.poise) ? def.poise[0] : (def.poise ?? 1) });
    this.def = def;
    this.type = def.id;
    this.spawnOpts = spawn;
    this.tags.add('enemy');
    for (const t of def.tags ?? []) this.tags.add(t);
    this.home = new THREE.Vector3().copy(spawn.pos ?? this.pos);
    this.pos.copy(this.home);
    this.facing = spawn.facing ?? 0;
    this.objectiveRunner = !!spawn.runner;
    if (this.objectiveRunner) this.tags.add('runner');
    this.ai = spawn.ai !== false && !def.aiLess;
    this.perched = spawn.perched ?? (!!def.perchable && (spawn.y ?? 0) >= TUNING.xbow.perchMinY);
    /** feet height a perched shooter is pinned to (its cart / wall top), independent of `home` (levels pass home y 0) */
    this.perchY = this.pos.y;
    /** idle → patrol wander radius around `home` (0 = stands its post) */
    this.patrolRadius = Math.max(0, spawn.patrolRadius ?? def.patrolRadius ?? 0);
    /** physics: no gravity (crows; perched shooters stay on their wall or cart) */
    this.flying = !!def.fly || this.perched;
    if (def.fly && !spawn.grounded) { this.pos.y += def.fly.alt ?? 3; this.home.y = this.pos.y; }
    if (def.hurtable === false) this.hurtable = false;
    this.seed = spawn.seed ?? this.id;

    // FSM
    this.states = { ...BASE_STATES, ...(def.states ?? {}) };
    this.stateName = ''; this.state = null; this.stateT = 0;
    this.alerted = false; this.sees = false; this.wakeT = 0;
    this.thinkT = (this.id % 6) * (TUNING.thinkEvery / 6);
    this.goal = new THREE.Vector3();
    /** @type {{id: string, def: any, range: number, minRange?: number, cooldown?: number, kind: string}|null} */
    this.attack = null; this.attackChoice = null; this.followUp = null; this.preTold = false;
    this.swing = null; this.cooldownT = 0; this.windupDur = 0; this.tokenT = 0;
    this.attackCd = {};
    this.orbitDir = 1; this.orbitT = 0; this.orbitAngle = 0;
    this.telegraphId = null; this.dashHit = false;
    this.tellPos = new THREE.Vector3(); this.tellDir = new THREE.Vector3(0, 0, 1);
    this.fled = false;
    this.idleFor = 0; this.scamperYaw = 0; this.deathAt = null;

    // visuals
    this.model = null; this.visual = null; this.anim = null; this.head = null; this.helmet = null; this.tipNode = null;
    this.flashT = 0; this.squashT = 0; this.hitReactT = 0; this.wobbleT = 0; this.bangT = 0; this.bang = null;
    this._flash = []; this._flashOn = 0;
    this._animKey = ''; this._animSerial = 0; this._hitSerial = 0; this._frame = 0; this._farDt = 0; this._wobblePh = 0;
    this.heldClip = null; this._pendingClip = null; this._pendingPose = null;
    this.extraProps = {};
    this.disposed = false; this.dormant = false;
    def.init?.(this);
    this.setState('idle');
  }

  // ------------------------------------------------------------------ FSM
  setState(name) {
    const next = this.states[name];
    if (!next) { console.warn(`[enemy] ${this.def.id}: unknown state ${name}`); return; }
    this.state?.exit?.(this);
    this.stateName = name; this.state = next; this.stateT = 0; this._animSerial++;
    if (name === 'alert') this.bangT = TUNING.bang.dur;      // the "!" pops over the head (render)
    next.enter?.(this);
  }

  /** Alert (with the "!" hop) unless already fighting. */
  alert() {
    if (!this.alive || this.scripted || !this.ai || this.dormant) return;
    if (this.stateName === 'idle' || this.stateName === 'patrol' || this.stateName === 'return') this.setState('alert');
  }

  /** Join a pack-mate's alert after `delay` seconds. */
  wake(delay = 0) {
    if (!this.alive || this.alerted || !this.ai) return;
    if (this.stateName !== 'idle' && this.stateName !== 'patrol') return;
    this.wakeT = Math.max(1e-4, delay);
  }

  checkWake(dt) {
    if (this.wakeT <= 0) return false;
    this.wakeT -= dt;
    if (this.wakeT <= 0) { this.wakeT = 0; return true; }
    return false;
  }

  // ------------------------------------------------------------------ perception
  /** The actor this enemy fights (the player while she's playable). */
  targetActor() {
    const p = this.ctx.player;
    return p && p.alive && !p.scripted && p.hurtable !== false ? p : null;
  }

  distToPlayer() { const p = this.ctx.player?.pos; return p ? Math.hypot(p.x - this.pos.x, p.z - this.pos.z) : Infinity; }

  /** tech.md §10 canSee: range + FOV cone + line of sight (eye to chest); closer than sight × 0.35 is "heard". */
  canSee() {
    const p = this.targetActor();
    if (!p) return false;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz), sight = this.def.sight ?? 10;
    if (d > sight) return false;
    if (d < sight * TUNING.heardFrac) return true;
    const fov = this.def.fov ?? 2.09;
    if (fov < Math.PI * 2 - 0.05 && Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing)) > fov * 0.5) return false;
    const ph = this.ctx.physics;
    if (typeof ph?.lineOfSight !== 'function') return true;
    _v.set(this.pos.x, this.pos.y + this.height * 0.8, this.pos.z);
    _d.set(p.pos.x, p.pos.y + p.height * 0.6, p.pos.z);
    return ph.lineOfSight(_v, _d);
  }

  /** Fire `def`'s projectile from chest height toward her chest (or straight ahead). */
  fireProjectile(def) {
    const p = this.targetActor(), y0 = this.pos.y + this.height * 0.6;
    _v.set(this.pos.x + Math.sin(this.facing) * this.radius, y0, this.pos.z + Math.cos(this.facing) * this.radius);
    if (p) _d.set(p.pos.x - _v.x, p.pos.y + p.height * 0.55 - y0, p.pos.z - _v.z); else _d.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    if (_d.lengthSq() < 1e-6) _d.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    return this.ctx.combat.spawnProjectile(def, this, _v.clone(), _d.normalize().clone());
  }

  /** Contact check for dash attacks: one hit when her cylinder touches our front. */
  dashContact(def) {
    const p = this.targetActor();
    if (!p || !p.alive) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > this.radius + p.radius + 0.25 || Math.abs(p.pos.y - this.pos.y) > Math.max(this.height, p.height)) return;
    if (d > 1e-3 && (dx * Math.sin(this.facing) + dz * Math.cos(this.facing)) / d < 0.2) return;
    this.dashHit = true;
    this.ctx.combat.applyHit(this, p, def);
  }

  /** Sage's volley grounds flyers (COMPANIONS.sage.groundFlyers); no-op for walkers. */
  groundFlyer(sec) { this.def.ground?.(this, sec); }

  /** Leash: too far from the player or from home → return. */
  leashBroken() {
    const leash = this.def.leash ?? 18;
    return this.distToPlayer() > leash || Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > leash * 1.5;
  }

  // ------------------------------------------------------------------ movement
  /** Steer (XZ) toward a point at `speed` with light separation from other enemies; returns the distance left. */
  steerTo(x, z, speed, dt) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > 1e-4) { const s = Math.min(speed, d * 4); vx = (dx / d) * s; vz = (dz / d) * s; }
    this.separation(_v);
    vx += _v.x * speed * 0.6; vz += _v.z * speed * 0.6;
    this.vel.x = damp(this.vel.x, vx, TUNING.steerDamp, dt); this.vel.z = damp(this.vel.z, vz, TUNING.steerDamp, dt);
    return d;
  }

  /** Unit-ish push away from overlapping pack-mates (written into `out`). */
  separation(out) {
    out.set(0, 0, 0);
    const list = this.ctx.enemies?.list;
    if (!list) return out;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === this || !o.alive || o.dormant || o.flying !== this.flying) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, min = (this.radius + o.radius) * 1.6, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), w = (min - d) / min;
      out.x += (dx / d) * w; out.z += (dz / d) * w;
    }
    return out;
  }

  brake(dt, rate = TUNING.steerDamp) { this.vel.x = damp(this.vel.x, 0, rate, dt); this.vel.z = damp(this.vel.z, 0, rate, dt); }
  brakeHard() { this.vel.x = 0; this.vel.z = 0; }

  faceTo(target, dt, rate = TUNING.turnRate) {
    if (!target) return;
    const yaw = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    const lim = this.def.turnRate;                                // pug: turns at only 120°/s
    if (lim) { const dl = wrapAngle(yaw - this.facing); this.facing = wrapAngle(this.facing + clamp(dl, -lim * dt, lim * dt)); }
    else this.facing = dampAngle(this.facing, yaw, rate, dt);
  }

  faceVel(dt, rate = TUNING.turnRate) {
    if (this.vel.x * this.vel.x + this.vel.z * this.vel.z > 0.04) this.facing = dampAngle(this.facing, Math.atan2(this.vel.x, this.vel.z), rate, dt);
  }

  // ------------------------------------------------------------------ attacks
  /** Difficulty × boss-phase windup multiplier. */
  windupMul() { return (this.ctx.state?.difficultyCfg?.windup ?? 1) * (this.phaseWindupMul ?? 1); }

  /** Attack-def lookup: Appendix A ATTACKS, then the type's own `moves`. */
  attackDef(id) { return ATTACKS[id] ?? this.def.moves?.[id] ?? null; }

  /** Weighted pick from def.attacks (seeded) among those usable at distance `d`; kept until used. */
  pickAttack(d = this.distToPlayer()) {
    if (this.attackChoice && this.stateName === 'chase') return this.attackChoice;
    const list = (this.def.attacks ?? []).filter((a) => (this.attackCd[a.id] ?? 0) <= 0 && (a.minRange == null || d >= a.minRange * 0.8) && (!a.when || a.when(this)));
    if (!list.length) return null;
    let total = 0; for (const a of list) total += a.weight ?? 1;
    let r = this.ctx.rng() * total, pick = list[0];
    for (const a of list) { r -= a.weight ?? 1; if (r <= 0) { pick = a; break; } }
    const def = this.attackDef(pick.id) ?? { ...MELEE_FALLBACK, id: pick.id };
    this.attackChoice = { id: pick.id, def, range: pick.range ?? def.arc?.range ?? 1.6, minRange: pick.minRange, cooldown: pick.cooldown,
      kind: pick.token ?? this.def.token ?? (def.projectile ? 'ranged' : 'melee') };
    return this.attackChoice;
  }

  get tokens() { return this.ctx.combat?.tokens ?? null; }
  hasToken() { return !!this.tokens?.has?.(this); }
  acquireToken(kind) { const t = this.tokens; return t ? t.acquire(this, kind) : true; }
  releaseToken() { this.tokens?.release?.(this); }

  /** Start the windup for `atk` (token already held). */
  beginAttack(atk) { this.attack = atk; this.attackChoice = null; this.setState('windup'); }

  /** End of recover: free the token, start cooldowns, back to the chase. */
  finishAttack() {
    const atk = this.attack;
    this.releaseToken();
    this.cooldownT = rangeOf(this.ctx.rng, TUNING.cooldown);
    if (atk?.cooldown) this.attackCd[atk.id] = atk.cooldown;
    this.attack = null;
    this.setState(this.targetActor() ? 'chase' : 'return');
  }

  /** Melee chase (tech.md §10 + §8.3): take a token near range, close in, attack; without a token orbit at 1.4× range. */
  chaseMelee(dt) {
    const p = this.targetActor();
    if (!p) { this.releaseToken(); return this.setState('return'); }
    if (this.leashBroken()) return this.setState('return');
    const d = this.distToPlayer();
    const atk = this.pickAttack(d);
    const range = atk?.range ?? 1.5, orbitR = range * TUNING.orbitMul;
    let has = this.hasToken();
    if (!has && atk && this.cooldownT <= 0 && d <= orbitR + 1.5) has = this.acquireToken(atk.kind);
    if (has && atk) {
      this.tokenT += dt;
      if (d <= range && (atk.minRange == null || d >= atk.minRange) && this.cooldownT <= 0) return this.beginAttack(atk);
      if (this.tokenT > 4) { this.releaseToken(); this.tokenT = 0; this.cooldownT = 1; }      // don't hog a token we can't use
      const keep = Math.max(0.2, range * 0.8);
      _d.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z);
      const dl = _d.length() || 1;
      this.steerTo(p.pos.x + (_d.x / dl) * keep, p.pos.z + (_d.z / dl) * keep, this.def.run ?? 3.5, dt);
    } else {
      // wait for a token: orbit the player at 1.4× attack range, drifting around her
      this.orbitT -= dt;
      if (this.orbitT <= 0) { this.orbitT = rangeOf(this.ctx.rng, TUNING.orbitRepick); this.orbitDir = this.ctx.rng.sign(); }
      const cur = Math.atan2(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
      const a = cur + this.orbitDir * TUNING.orbitDrift;
      const fast = d > orbitR + 2;
      this.steerTo(p.pos.x + Math.sin(a) * orbitR, p.pos.z + Math.cos(a) * orbitR, fast ? (this.def.run ?? 3.5) : (this.def.walk ?? 1.6), dt);
    }
    this.faceTo(p.pos, dt, TUNING.chaseTurnRate);
  }

  // ------------------------------------------------------------------ telegraphs (§8.1, §19.5)
  /**
   * Emit combat:telegraph; returns its id. Ended automatically on strike / stagger / death.
   * `pos` / `dir` default to LIVE vectors this enemy keeps updating (weapon tip, aim direction): fx may read them
   * every frame (aim lines and shadows stop tracking when the enemy stops writing them).
   * @param {string} kind @param {{shape?: string, pos?: THREE.Vector3, dir?: THREE.Vector3, size?: number, r?: number, duration?: number}} [desc]
   */
  telegraph(kind, desc = {}) {
    this.endTelegraph();
    const id = teleId++;
    this.telegraphId = id;
    if (!desc.pos) this.updateTell();
    this.ctx.bus.emit(E.TELEGRAPH, {
      id, actor: this, kind, shape: desc.shape ?? defaultShape(kind),
      pos: desc.pos ?? this.tellPos, dir: desc.dir ?? this.tellDir,
      size: desc.size ?? desc.r ?? 1, duration: desc.duration ?? 0.5,
    });
    return id;
  }

  endTelegraph() {
    if (this.telegraphId == null) return;
    this.ctx.bus.emit(E.TELEGRAPH_END, { id: this.telegraphId });
    this.telegraphId = null;
  }

  /** Refresh the live glint position (weapon tip, else head height) and facing direction. */
  updateTell() {
    if (this.def.tell) { this.def.tell(this); return; }
    if (this.tipNode && this.visual) this.tipNode.getWorldPosition(this.tellPos);
    else this.tellPos.set(this.pos.x + Math.sin(this.facing) * this.radius, this.pos.y + this.height * 0.8, this.pos.z + Math.cos(this.facing) * this.radius);
    this.tellDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  /** Drop the current attack (cutscene start, arena reset): telegraph ends, token returns, back to the chase. */
  interrupt() {
    this.endTelegraph(); this.swing = null; this.followUp = null; this.preTold = false;
    this.releaseToken();
    if (!this.alive || this.dormant) return;
    const busy = ['windup', 'strike', 'recover'].includes(this.stateName) || this.state?.attacking;
    this.attack = null; this.attackChoice = null;
    if (busy && this.ai) this.setState(this.alerted && this.targetActor() ? 'chase' : 'idle');
  }

  // ------------------------------------------------------------------ hits
  stagger(sec) {
    if (!this.alive || this.dormant) return;
    this.staggerT = Math.max(this.staggerT, sec);
    if (this.scripted) return;
    this.setState('stagger');
  }

  /** §7.3: a parry staggers 1.2 s (elites 0.8 s; gold glint 2.0 s or the attack's goldStagger). */
  onParried(byActor, { gold = false } = {}) {
    if (!this.alive) return;
    const g = PLAYER.guard, elite = this.maxPoise >= g.eliteMinPoise;
    const sec = gold ? (this.attack?.def?.goldStagger ?? this.def.goldStagger ?? g.goldParryStagger)
      : (this.attack?.def?.parriedStun ?? (elite ? g.eliteParryStagger : g.parryStagger));
    this.stagger(sec);
  }

  /** The player blocked our hit: recoil a step. */
  onBlocked(byActor, def) {
    this.vel.x -= Math.sin(this.facing) * TUNING.blockRecoil; this.vel.z -= Math.cos(this.facing) * TUNING.blockRecoil;
  }

  /** Optional §19.4 hook; types refine it (crow: only hittable low unless grounded). */
  resolveIncoming(attacker, def, hitDir) {
    return this.def.resolveIncoming ? this.def.resolveIncoming(this, attacker, def, hitDir) : 'hit';
  }

  onHit(hit) {
    this.flashT = TUNING.hitFlash;
    if (this.roleSpec('hit')) this.hitReactT = TUNING.hitReact; else this.squashT = TUNING.squash.dur;
    if (!this.alive || this.scripted || !this.ai) return;
    this.def.onHit?.(this, hit);
    if (!this.alerted || this.stateName === 'idle' || this.stateName === 'patrol' || this.stateName === 'return') {
      this.alerted = true;
      if (this.staggerT <= 0) { this.ctx.bus.emit(E.ENEMY_ALERTED, { enemy: this }); this.ctx.enemies?.alertNear?.(this.pos, TUNING.groupAlertRadius, this); this.setState('chase'); }
    }
    if (this.def.fleeBelow && !this.fled && this.hp > 0 && this.hp / this.maxHp <= this.def.fleeBelow && this.staggerT <= 0) this.setState('flee');
  }

  onDeath(hit) { this.alive = false; this.setState('die'); }

  dieDur() { return this.def.scamper ? TUNING.die.scamperDur : TUNING.die.dur; }

  /** §10.1: the helmet spins off, away from the hit (EnemyManager animates the debris). */
  dropHelmet(dir = null) {
    const h = this.helmet;
    if (!h || !h.parent) return;
    this.helmet = null;
    if (this.ctx.enemies?.spawnDebris) this.ctx.enemies.spawnDebris(h, this, dir);
    else h.visible = false;
  }

  // ------------------------------------------------------------------ step
  update(dt) {
    if (this.dormant || !this.ctx.game.simActive(this)) return;
    this.stateT += dt;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.cooldownT = Math.max(0, this.cooldownT - dt);
    for (const k in this.attackCd) if (this.attackCd[k] > 0) this.attackCd[k] -= dt;
    if (this.scripted || this.attachedTo) {
      this.scriptedStep(dt);
      if (!this.attachedTo) this.move(dt);
      return;
    }
    if (!this.ai) { this.brake(dt); this.move(dt); return; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT += TUNING.thinkEvery; this.sees = this.canSee(); }
    if (this.staggerT > 0 && this.alive && this.stateName !== 'stagger' && this.stateName !== 'die' && this.stateName !== 'flee' && !this.state.noStagger) this.setState('stagger');
    this.state.update?.(this, dt);
    this.move(dt);
  }

  /** Integrate through physics (perched shooters stay put: knockback can't push them off their perch). */
  move(dt) {
    if (this.perched) { this.vel.set(0, 0, 0); this.pos.y = this.perchY; return; }
    if (this.def.noPhysics) { this.pos.addScaledVector(this.vel, dt); return; }
    this.ctx.physics?.moveActor?.(this, dt);
  }

  // ------------------------------------------------------------------ ScriptedActor visual hooks (§19.4)
  onScripted(on) {
    if (on) {
      this.endTelegraph(); this.swing = null; this.followUp = null; this.releaseToken(); this.attack = null;
      this.vel.x = 0; this.vel.z = 0;
      this.hurtable = false;
      if (this.stateName !== 'idle' && this.alive) this.setState('idle');
    } else {
      this.hurtable = this.alive && this.def.hurtable !== false;
      this.heldClip = null;
      if (this.alive && this.ai) this.setState(this.alerted && this.targetActor() ? 'chase' : 'idle');
    }
  }

  /** Map a cutscene clip / role name to a playable spec ('laugh' → 'Cheer'); null if unknown. */
  scriptSpec(name) {
    const r = this.def.anims?.[name];
    if (isSpec(r)) return r;
    if (this.anim?.has(name)) return name;
    return null;
  }

  playClip(name, { once = false, speed = 1, clampEnd = false } = {}) {
    if (!this.anim) {
      return new Promise((resolve) => { this._pendingClip?.resolve(); this._pendingClip = { name, once, speed, clampEnd, resolve }; });
    }
    const spec = this.scriptSpec(name);
    if (!spec) return Promise.resolve();
    const key = clipKey(spec);
    this.heldClip = { key, once, clampEnd };
    this._animKey = '';
    const sp = (typeof spec === 'object' && typeof spec.speed === 'number' ? spec.speed : 1) * speed;
    const pr = this.anim.play(key, { once, clampEnd: clampEnd || false, speed: sp, fade: 0.2, restart: true });
    if (!once) return Promise.resolve();
    return pr.then(() => { if (this.heldClip?.key === key && !clampEnd) this.heldClip = null; });
  }

  onPose(name) {
    if (!name || name === 'idle') { this.heldClip = null; this._animKey = ''; this.head?.setExpression?.('neutral'); return; }
    const spec = this.scriptSpec(name);
    if (spec) { this.playClip(name, { once: name === 'kneel' || name === 'sitDown', clampEnd: true }); return; }
    if (this.head?.setExpression) this.head.setExpression(name);
  }

  onEmote(name) {
    if (this.head?.setExpression && ['neutral', 'sneer', 'angry', 'laugh', 'sad', 'surprised', 'kneel'].includes(name)) this.head.setExpression(name);
    else if (name === 'shake' || name === 'nod' || name === 'tailPuff') this.squashT = TUNING.squash.dur;
    this.def.onEmote?.(this, name);
  }

  onProp(name, on) {
    if (this.def.onProp) { this.def.onProp(this, name, on); return; }
    const p = this.extraProps[name];
    if (p) p.visible = !!on;
  }

  // ------------------------------------------------------------------ visuals
  /** Load + dress the type's model (fitted; facing +Z). Called by EnemyManager.spawn. */
  async loadVisual() {
    const def = this.def;
    try {
      if (def.procedural && def.buildProcedural) {
        const root = await def.buildProcedural(this);
        if (this.disposed || !root) return;
        this.visual = root; this.object3d.add(root);
        this._flash = flashMaterials(root);
        return;
      }
      if (!def.model) return;
      // KayKit head meshes stay visible while fitting (§10.2 heights include the head); the beast head hides them
      const hide = def.hide?.filter((n) => !KAYKIT_HEADS.has(n));
      const m = await this.ctx.assets.model(def.model, { fit: def.fit ?? def.role, hide, show: def.show, tint: def.tint, cloneMaterials: true });
      if (def.hide && hide.length !== def.hide.length && !def.build) for (const n of def.hide) if (KAYKIT_HEADS.has(n)) { const o = m.scene.getObjectByName(n); if (o) o.visible = false; }
      if (this.disposed) return;
      markOwned(m.scene);
      this.model = m; this.visual = m.root;
      if (def.visualScale) m.root.scale.setScalar(def.visualScale);
      this.object3d.add(m.root);
      this.object3d.updateMatrixWorld(true);
      if (def.build) {
        m.root.visible = false;                       // shown once dressed (beast heads, gear)
        try { await def.build(this, m); } catch (err) { console.warn(`[enemy] dressing failed for ${def.id}`, err); }
        m.root.visible = true;
      }
      if (this.disposed) return;
      this._flash = def.noFlash ? [] : flashMaterials(m.root);
      this.anim = new Animator(m.scene, clipsFor(def.anims, m.animations));
      this._animKey = '';
      if (this._pendingClip) { const c = this._pendingClip; this._pendingClip = null; this.playClip(c.name, c).then(c.resolve); }
      this.render(1, 0);
    } catch (err) {
      console.error(`[enemy] visual failed for ${def.id}`, err);
    }
  }

  /** Clip spec for a role, honouring per-attack overrides (`anims[attackId].windup`). */
  roleSpec(role) {
    const a = this.def.anims;
    if (!a) return null;
    const atk = this.attack?.id;
    if (atk && a[atk] && !isSpec(a[atk]) && a[atk][role] !== undefined) return a[atk][role];
    const v = a[role];
    return isSpec(v) ? v : null;
  }

  /** The role the current state wants: [role, opts]. */
  animFor() {
    const s = this.state?.anim;
    let r = typeof s === 'function' ? s(this) : s ?? 'idle';
    if (!Array.isArray(r)) r = [r, null];
    if (this.hitReactT > 0 && this.alive && this.stateName !== 'windup' && this.stateName !== 'strike' && this.stateName !== 'stagger') return ['hit', { once: true }];
    if (r[0] === 'move') {
      const hs = Math.hypot(this.vel.x, this.vel.z), walk = this.def.walk ?? 1.6, run = this.def.run ?? 3.5;
      if (hs > walk * 1.25 && this.roleSpec('run')) return ['run', { speed: clamp(hs / run, 0.6, 1.5), loop: true }];
      if (hs > 0.25) return [this.roleSpec('walk') ? 'walk' : 'run', { speed: clamp(hs / walk, 0.5, 1.6), loop: true }];
      return ['idle', null];
    }
    return r;
  }

  /** Play a role (spec lookup, sub-range keys, 'fit' speeds). Returns false if the role has no clip. */
  playRole(role, opts = {}) {
    const spec = this.roleSpec(role);
    if (!spec || !this.anim) return false;
    const key = clipKey(spec);
    if (!this.anim.has(key)) return false;
    let speed = 1;
    if (typeof spec === 'object' && spec.speed === 'fit') {
      const dur = specDuration(spec, this.model?.animations);
      speed = opts?.fitDur > 0 && dur > 0 ? dur / opts.fitDur : 1;
    } else if (typeof spec === 'object' && typeof spec.speed === 'number') speed = spec.speed;
    speed *= opts?.speed ?? 1;
    this.anim.play(key, { once: !!opts?.once, clampEnd: !!opts?.clampEnd, speed, fade: opts?.fade ?? 0.15, restart: !!opts?.once });
    return true;
  }

  _updateAnim(dt) {
    const a = this.anim;
    if (!a) return;
    if (this.heldClip) {
      // scripted clip holds until a pose/idle or it finishes; locomotion only if moving and the clip loops
      const moving = Math.hypot(this.vel.x, this.vel.z) > 0.3 && !this.heldClip.once;
      if (!moving) { this._tickMixer(dt); return; }
      this.heldClip = null;
    }
    if (this.scripted && !this.heldClip) {
      const hs = Math.hypot(this.vel.x, this.vel.z), walk = this.def.walk ?? 1.6;
      const role = hs > walk * 1.4 ? 'run' : hs > 0.2 ? 'walk' : 'idle';
      if (role !== this._animKey) { this._animKey = role; this.playRole(role, { speed: role === 'idle' ? 1 : clamp(hs / (role === 'run' ? (this.def.run ?? 3.5) : walk), 0.5, 1.6) }); }
      this._tickMixer(dt);
      return;
    }
    const [role, opts] = this.animFor();
    const key = role === 'hit' && this.stateName !== 'stagger' ? `hit#${this._hitSerial}` : opts?.once ? `${role}#${this._animSerial}` : role;
    if (key !== this._animKey) {
      this._animKey = key;
      if (!this.playRole(role, opts) && role !== 'idle') this.playRole('idle');
    } else if (opts?.loop && opts.speed && a.current) a.current.timeScale = opts.speed;
    this._tickMixer(dt);
  }

  _tickMixer(dt) {
    this._frame++;
    const cam = this.ctx.camera;
    if (cam && dt > 0) {
      const dx = cam.position.x - this.pos.x, dz = cam.position.z - this.pos.z;
      if (dx * dx + dz * dz > TUNING.animFarDist * TUNING.animFarDist) {
        this._farDt += dt;
        if ((this._frame + this.id) % 2) return;
        dt = this._farDt;
      }
    }
    this._farDt = 0;
    this.anim.update(dt);
  }

  render(alpha, dt) {
    if (this.dormant) return;
    super.render(alpha);
    const fdt = visualDt(this.ctx, dt);
    if (this.hitReactT > 0) { this.hitReactT -= fdt; if (this.hitReactT <= 0) this._hitSerial = (this._hitSerial ?? 0) + 1; }
    this._updateAnim(fdt);
    this.head?.update?.(fdt);
    this.cagedKitten?.render?.(dt);                 // KittenView applies hitstop / slow motion itself
    this.def.render?.(this, fdt, alpha);
    this._renderFx(fdt);
    this._renderBang(fdt);
    if (this.uprightProps) applyUpright(this);
    if (this.telegraphId != null) this.updateTell();
  }

  /** §10.1 alert: a "!" pops up over the head (overshoot, then holds) for the 0.4 s hop. */
  _renderBang(dt) {
    if (this.bangT <= 0) { if (this.bang?.visible) this.bang.visible = false; return; }
    this.bangT -= dt;
    if (!this.bang) {
      const mat = bangMaterial();
      if (!mat) { this.bangT = 0; return; }
      this.bang = new THREE.Sprite(mat);
      this.bang.name = 'alert-bang';
      this.bang.renderOrder = 10;
      this.object3d.add(this.bang);
    }
    const B = TUNING.bang, h = this.height * (this.def.visualScale ?? 1);
    const u = clamp(1 - this.bangT / B.dur, 0, 1), k = u < B.pop ? Math.sin((u / B.pop) * Math.PI * 0.5) * 1.25 : 1.25 - 0.25 * Math.min(1, (u - B.pop) / B.pop);
    const size = clamp(h * B.perH, B.min, B.max);
    this.bang.visible = this.bangT > 0 && this.alive;
    this.bang.position.set(0, h + B.lift + size * 0.5, 0);
    this.bang.scale.set(size * 0.5 * k, size * k, 1);
  }

  /** Flash, squash, stagger wobble, death shrink. */
  _renderFx(dt) {
    const v = this.visual;
    if (!v) return;
    // white flash (§8.2: 60 ms)
    const fl = this.flashT > 0 ? clamp(this.flashT / TUNING.hitFlash, 0, 1) : 0;
    if (this.flashT > 0) this.flashT -= dt;
    if (fl !== this._flashOn) {
      this._flashOn = fl;
      for (const f of this._flash) {
        if (fl > 0) { f.mat.emissive.copy(f.base).lerp(WHITE, fl); f.mat.emissiveIntensity = Math.max(f.baseI, 1); }
        else { f.mat.emissive.copy(f.base); f.mat.emissiveIntensity = f.baseI; }
      }
    }
    // squash (missing hit clip; §10.1 0.15 s to scale y 0.8), volume-preserving
    const base = this.def.visualScale ?? 1;
    let sy = 1;
    if (this.squashT > 0) {
      this.squashT -= dt;
      const u = 1 - Math.max(0, this.squashT) / TUNING.squash.dur;
      sy = 1 - (1 - TUNING.squash.y) * Math.sin(Math.PI * u);
    }
    let k = 1;
    if (this.stateName === 'die') {
      const left = this.dieDur() - this.stateT;
      if (left < TUNING.die.shrink) k = Math.max(0.001, left / TUNING.die.shrink);
    }
    const sxz = 1 / Math.sqrt(sy);
    v.scale.set(base * sxz * k, base * sy * k, base * sxz * k);
    // stagger wobble
    if (this.wobbleT > 0) {
      this.wobbleT -= dt;
      this._wobblePh += dt * 18;
      v.rotation.z = Math.sin(this._wobblePh) * 0.12 * Math.min(1, this.wobbleT * 2);
    } else if (v.rotation.z !== 0) v.rotation.z = damp(v.rotation.z, 0, 12, dt);
  }

  dispose() {
    this.disposed = true;
    this.endTelegraph();
    this.releaseToken();
    this._pendingClip?.resolve(); this._pendingClip = null;
    this._finishMove?.(); this._finishFace?.();
    this.anim?.dispose(); this.anim = null;
    this.head?.dispose?.(); this.head = null; this.dress = null; this.plate = null;
    this.cagedKitten?.dispose?.(); this.cagedKitten = null;
    this.def.onDispose?.(this);
    if (this.visual) disposeInstanceMaterials(this.visual);
    super.dispose();
  }
}
