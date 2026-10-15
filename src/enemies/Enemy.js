// src/enemies/Enemy.js  (owner: enemies) — the Enemy actor: tech.md §10 FSM as amended by GAME_DESIGN §10.1
//   idle → patrol → alert (0.4 s "!" hop) → chase (tokens; tokenless enemies orbit at 1.4× range) → windup (telegraph)
//   → strike → recover (punish window) → stagger / flee / return / die (poof, helmet spin-off, scamper).
// Frozen contract (§19.4): fields def, stateName, objectiveRunner; methods setState(name), telegraph(kind, desc)
// (emits combat:telegraph; auto-ended on strike / stagger / death), stagger(sec), onParried(), onBlocked(), plus the
// ScriptedActor API (core/ScriptedActor.js mixin; visual hooks playClip / onPose / onEmote / onProp below).
// Types (types/*.js, Appendix B.3) add data, `anims`, a `build(e, model)` dresser and state overrides.
// Optional type hooks (all duck-typed on the def; M2):
//   init(e) · tick(e, dt) (every sim step) · render(e, dt) · pulse(e) → [sx, sy, sz] (squash / abdomen pulse)
//   gait(e, speed, dt) (skitter bursts) · canUse(e, attack, d) · whileWaiting(e, p, d, dt) (tokenless: jeer)
//   approachPoint(e, p, keep, out) (flank) · readyToAttack(e, p, atk, d) · startAttack(e, atk) (giggle first)
//   onHit(e, hit) · onHitWhile: { <state>: 'choke' } · onChoke(e) · onDealtHit(e, combatHit) (gloat)
//   onDashHit(e, target, result, def) (snatch) · onParried(e, by, {gold}) / onBlocked(e, by, def) → true = handled
//   onDeath(e, hit) (jelly split) · died(e) → extra enemy:died fields · onLethal(e, info) → true = survive
//   onRunnerArrive(e, dt) (The Line) · projectileOpts(e, def) (web glob) · dieDur(e) · onDispose(e)
// Moves with their own state: an attack def with `state: '<name>'`, or a state with `attacking: true` named like
// the attack id (moves.js CHAIN_STATE for combos). Multi-telegraph moves use telegraphExtra (all end together).
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { Animator } from '../core/Animator.js';
import { E } from '../core/events.js';
import { ATTACKS, PLAYER, TELEGRAPH, COMPANIONS, CAMERA, qualityShadowsOn } from '../core/config.js';
import { damp, dampAngle, wrapAngle, clamp } from '../core/math.js';
import { depthFor } from '../core/depth.js';
import { KIND } from '../core/ActorRegistry.js';
import { TUNING, M2, WARM, rangeOf } from './tuning.js';
import { clipKey, clipsFor, isSpec, specDuration } from './clipMaps.js';
import { flashMaterials, markOwned, disposeInstanceMaterials, applyUpright, applyPalette, stripConstantScaleTracks, scaleBones, setCasting, toonify } from './rig.js';
import { paletteFor, boneScalesFor } from './palette.js';
import { EnemyLook } from './look.js';
import { friendWordFor, displayNameFor } from './names.js';
import { rangedStartAllowed } from './onscreen.js';
import { topTint } from '../characters/Readability.js';
import { SHADOW_STAGE } from '../world/StaticShadow.js';
import { bakeEnemyVisual } from './bake.js';

/** `?bake=0`: keep enemy visuals unbaked (A/B of PERF §9.4; not a core URL switch, read here). */
const NO_BAKE = typeof location !== 'undefined' && /[?&]bake=0(&|$)/.test(location.search ?? '');

let teleId = 1;
/** States an open-zone enemy leaves (→ return) when she is walled off inside a locked arena it isn't part of. */
const DISENGAGE = new Set(['alert', 'chase', 'windup', 'strike', 'recover', 'hop']);                         // telegraph ids (fx numbers its own from 1 000 000)
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();
const _spA = { x0: 0, z0: 0, x1: 0, z1: 0, r: 0 };
const _spB = { x0: 0, z0: 0, x1: 0, z1: 0, r: 0 };
/** A plain circle actor as a zero-length spine. */
/** Feet probes look for the surface up to this far above the feet (≈ physics step-up). */
const STEP_PROBE = 0.35;
const pointSpine = (a, out) => { out.x0 = out.x1 = a.pos.x; out.z0 = out.z1 = a.pos.z; out.r = a.radius ?? 0.35; return out; };
const WHITE = new THREE.Color(1, 1, 1);

/**
 * Fields a type's build / the visual load wire onto the enemy; they travel with a pooled visual (PERF §3.4) and are
 * cleared on the enemy that gave it back.
 */
export const VISUAL_FIELDS = Object.freeze(['model', 'visual', 'anim', 'look', 'head', 'dress', 'plate', 'plateWord', 'plateFriendWord',
  'plateWordShown', 'plateFlipped', '_plateSwap', 'helmet', '_droppedHelmet', 'tipNode', 'weaponRoot', 'uprightProps', '_flash', '_visBaseX', '_visSnapshot']);

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

/**
 * AUTOCAM §7 / M:enemies.4: the far end of a lane / line telegraph (dash lanes, Wheel Ride, aim lines): `pos` +
 * unit(`dir`) × length (lane.l, desc.l, else the range). Null for other shapes. Pure; exported for tests.
 * @returns {{x: number, y: number, z: number}|null}
 */
export function laneEnd(shape, pay, desc, pos, dir) {
  const lane = pay?.lane ?? desc?.lane ?? null;
  if (!lane && shape !== 'lane' && shape !== 'line') return null;
  if (!pos || !dir) return null;
  const d = lane?.dir ?? dir, l = lane?.l ?? desc?.l ?? pay?.range ?? null;
  const n = Math.hypot(d.x, d.z);
  if (!(n > 1e-6) || !(l > 0)) return null;
  return { x: pos.x + (d.x / n) * l, y: pos.y, z: pos.z + (d.z / n) * l };
}

/** Telegraph kinds that come from a melee swing (CONTROLS_SPEC §8.2 strike wedges). */
export const WEDGE_KINDS = Object.freeze(new Set(['parry', 'gold', 'red', 'grab']));

/**
 * CONTROLS_SPEC §8.5 telegraph payload (additive `combat:telegraph` fields): `attackId`, `arc`, `range`, `windup`
 * (seconds after the difficulty multiplier), `activeAt` (absolute game.time the hit becomes live: strike start +
 * `active[0]` for swings) and `targetsPlayer`. `desc` may override any of them; `desc.strikeIn` (s until the strike
 * state starts, default = the telegraph duration) and `desc.attackDef` steer the defaults. Pure; exported for tests.
 * @param {any} e enemy @param {string} kind @param {any} desc @param {number} duration @param {number} now game.time
 */
export function telegraphPayload(e, kind, desc, duration, now) {
  const atk = e.attack;
  const adef = desc.attackDef ?? atk?.def ?? null;
  const strikeIn = desc.strikeIn ?? duration;
  const a0 = adef?.arc && WEDGE_KINDS.has(kind) ? (adef.active?.[0] ?? 0) : 0;
  const arc = desc.arc ?? adef?.arc ?? null;
  const p = e.ctx?.player;
  let tgt = null;
  try { tgt = e.targetActor?.() ?? null; } catch { tgt = null; }
  // dash attacks (hyena_lunge, stealer_snatch, rushes) have no arc: a lane along the facing (length = speed × dur)
  const lane = desc.lane ?? (!arc && adef?.speed ? { w: Math.max(0.6, (e.radius ?? 0.35) * 2 + 0.3), l: adef.speed * (adef.dur ?? 0.4) } : null);
  return {
    attackId: desc.attackId ?? adef?.id ?? atk?.id ?? null,
    arc, lane,
    range: desc.range ?? arc?.range ?? lane?.l ?? adef?.r ?? atk?.range ?? null,
    windup: desc.windup ?? strikeIn,
    activeAt: desc.activeAt ?? now + strikeIn + a0,
    targetsPlayer: desc.targetsPlayer ?? (!!p && tgt === p),
  };
}

/**
 * Closest points between XZ segments a0→a1 and b0→b1; returns the squared distance and writes the closest pair into
 * `out` ({ax, az, bx, bz}). Pure; exported for tests. Zero-length segments are points.
 */
export function segSegXZ(a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z, out) {
  const ux = a1x - a0x, uz = a1z - a0z, vx = b1x - b0x, vz = b1z - b0z, wx = a0x - b0x, wz = a0z - b0z;
  const a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz, d = ux * wx + uz * wz, e = vx * wx + vz * wz;
  let s = 0, t = 0;
  if (a <= 1e-9 && c <= 1e-9) { s = 0; t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(e / c, 0, 1); }
  else if (c <= 1e-9) { t = 0; s = clamp(-d / a, 0, 1); }
  else {
    const den = a * c - b * b;
    s = den > 1e-9 ? clamp((b * e - c * d) / den, 0, 1) : 0;
    t = (b * s + e) / c;
    if (t < 0) { t = 0; s = clamp(-d / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - d) / a, 0, 1); }
  }
  out.ax = a0x + ux * s; out.az = a0z + uz * s; out.bx = b0x + vx * t; out.bz = b0z + vz * t;
  const dx = out.ax - out.bx, dz = out.az - out.bz;
  return dx * dx + dz * dz;
}
const _seg = { ax: 0, az: 0, bx: 0, bz: 0 };
/** resolveBody candidates: player + allies (KIND bits), written into a reused array */
const BODY_MASK = KIND.player | KIND.ally;
const _bodyCands = [];

/**
 * ART §7.1 "faint and poof" timeline for a defeat, or null for the legacy path (bosses sit down for their befriend
 * beat, Gloomjellies split / pop at once, types with their own `dieDur` or `faint: false`). Pure; exported for tests.
 * @returns {{poofAt: number, flipped: boolean, poofed: boolean}|null}
 */
export function faintPlan(e) {
  const d = e?.def;
  if (!d || d.boss || e.isBoss || d.faint === false || d.procedural || d.dieDur) return null;
  const F = WARM.faint;
  return { poofAt: F.squashT + F.starsT, flipped: false, poofed: false };
}

/**
 * AUTOCAM §6.6 orbit penalty for a tokenless orbit slot (pure; exported for tests): `k × max(0, −(slot − her)·U − free)`
 * — metres down-screen (toward the lens) past `free`. U = the screen-up ground axis (unit).
 * @param {number} sx @param {number} sz slot @param {number} hx @param {number} hz her @param {number} ux @param {number} uz
 * @param {{k: number, free: number}} P
 */
export function orbitPenalty(sx, sz, hx, hz, ux, uz, P) {
  const up = (sx - hx) * ux + (sz - hz) * uz;
  return P.k * Math.max(0, -up - P.free);
}

/** Orbit penalty tuning: CAMERA.iso.framing.orbitPenalty (core) over the enemies fallback. */
const ORBIT = Object.freeze({ ...WARM.orbit, ...(CAMERA?.iso?.framing?.orbitPenalty ?? {}) });
const _axU = new THREE.Vector3(), _axR = new THREE.Vector3();

/** Base states (tech.md §10 + §10.1). `def.states` entries are merged over these per type. */
export const BASE_STATES = {
  idle: {
    anim: 'idle',
    enter(e) { e.idleFor = rangeOf(e.ctx.rng, TUNING.idleTime); },
    update(e, dt) {
      e.brake(dt);
      if (e.objectiveRunner && e.ai && e.runnerGoal()) { e.alerted = true; return e.setState('chase'); }
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
      const left = e.steerTo(e.goal.x, e.goal.z, e.gait(e.def.walk ?? 1.5, dt), dt);
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
      // − 1e-6: the step that lands exactly on the stop (0.55 − 0.15 = 24 steps) must not turn because the summed
      // stateT came out a hair short (it did at large game times: smoke enemies:telegraph-payload in full runs)
      if (p && e.stateT < e.windupDur - TUNING.windupTrackStop - 1e-6) e.faceTo(p.pos, dt, TUNING.windupTurnRate);
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
      if (def.projectile) e.fireProjectile(def, e.def.projectileOpts?.(e, def));
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
        if (e.stateT >= dur - Math.max(0, lead - w) && e.stateT > a1) {
          e.telegraph(fdef.telegraph, { duration: Math.max(lead, w), strikeIn: Math.max(0, dur - e.stateT) + w, attackId: e.followUp.id, attackDef: fdef });
        }
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
  // TT3 Catnip Cloud (docs/TOKENTAILS-PLAN.md §11.3 #3): on its back, paws wiggling, no attacks, the plate shows its
  // friend word; a jeer is cancelled (JEER.exit). The first hit wakes it (Combat: ×1.5 "belly-rub bonk"); else it gets
  // up after `giddyT` and goes back to the fight.
  giddy: {
    anim: 'idle',
    enter(e) {
      e.endTelegraph(); e.swing = null; e.followUp = null; e.preTold = false; e.releaseToken(); e.attack = null; e.attackChoice = null;
      e.brakeHard();
      e._giddyFlip = !e.plateFlipped && e.flipPlate();
      e.head?.setExpression?.('happy');
    },
    update(e, dt) {
      e.brake(dt, 8);
      e.giddyT -= dt;
      if (e.giddyT > 0) return;
      e.giddyT = 0;
      e.setState(e.alerted && e.targetActor() ? 'chase' : 'idle');
    },
    exit(e) {
      e.giddyT = 0;
      if (e._giddyFlip) { e._giddyFlip = false; e.unflipPlate(); }
      e.head?.setExpression?.(e.def.expression ?? 'sneer');
    },
  },
  die: {
    // ART §7.1 "faint and poof": the death clip plays 0.25 s at most (Enemy._updateAnim holds it), then the squash
    anim: (e) => (e.faint ? ['death', { once: true, clampEnd: true }] : e.def.scamper ? ['run', { speed: 1.3 }] : ['death', { once: true, clampEnd: true }]),
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
      e.faint = faintPlan(e);
      // `poofIn`: the puff comes this many seconds after enemy:died (fx defers its own poof; requests/fx.md)
      e.ctx.bus.emit(E.ENEMY_DIED, { enemy: e, type: e.def.id, position: e.deathAt.clone(), fish, smallHeart, height: e.height,
        ...(e.faint ? { poofIn: e.faint.poofAt, faint: true } : null), ...(e.def.died?.(e) ?? null) });
      e.dropHelmet(_d);
      if (e.faint) {
        e.poofDir = (e.poofDir ?? new THREE.Vector3()).copy(_d);
        // 3 dizzy stars for WARM.faint.starsT (fx's dizzy ring when it has one, else a star burst over the head)
        const F = WARM.faint;
        if (typeof e.ctx.fx?.dizzyFor === 'function') { try { e.ctx.fx.dizzyFor(e, F.squashT + F.starsT); } catch { /* fx optional */ } }
        else e.ctx.bus.emit(E.BURST, { kind: 'stars', position: _v.set(e.pos.x, e.pos.y + e.height * (1 + F.lift), e.pos.z).clone(), count: F.stars });
        return;
      }
      // legacy defeat (bosses, Gloomjellies, types with their own dieDur): the poof now (fx adds the faction debris by
      // `type`); our own helmet spins off, so fx's generic helmet pop is switched off with `helmet: false`
      e.ctx.bus.emit(E.BURST, { kind: 'poof', position: e.pos.clone(), type: e.def.id, height: e.height, dir: _d.clone(), helmet: false, count: 12 });
      if (e.def.scamper) {
        e.scamperYaw = Math.atan2(_d.x, _d.z) + (rng() - 0.5) * 0.8;
      }
    },
    update(e, dt) {
      if (e.faint) {
        e.brake(dt, 10);
        const F = e.faint;
        if (!F.flipped && e.stateT >= F.poofAt - WARM.faint.plateFlip) { F.flipped = true; e.flipPlate(); }
        if (!F.poofed && e.stateT >= F.poofAt) {
          F.poofed = true;
          e.ctx.bus.emit(E.BURST, { kind: 'poof', position: e.pos.clone(), type: e.def.id, height: e.height, dir: e.poofDir?.clone() ?? null, helmet: false, count: 12, faint: true });
          if (e.visual) e.visual.visible = false;
          if (e.bang) e.bang.visible = false;
        }
        if (e.stateT >= e.dieDur()) e.ctx.enemies?.despawn?.(e);
        return;
      }
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
    this.object3d.userData.perfCat = 'enemies';           // core perf drawsByCat (PERF §12)
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
    /** §9.1 token share: the companion this token's attack goes for (null = her) */
    this.shareTarget = null;
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
    /** ART §5.1 / WA §5.1 per-visual look (flash, rims, squash spring, shake); travels with a pooled visual */
    /** @type {EnemyLook|null} */
    this.look = null;
    /** PERF §4.3 activity tier (camera's activityOf; −1 = no camera tiers: the legacy distance LOD) */
    this._tier = 0; this._tierFrame = -1; this._mixAcc = 0;
    /** ART §7.1 faint-and-poof timeline while defeated (null = legacy defeat) */
    this.faint = null; this.poofDir = null;
    /** WA §8.3 plate words: the friend word for this plate and whether it shows */
    this.plateFriendWord = null; this.plateFlipped = false;
    /** VisualPool key this enemy's visual belongs to (null = built and disposed per enemy) */
    this.poolKey = null;
    /** WA §8.3 a befriended foe (hub hyenas after gate.done): its plate shows the friend word from the start */
    this.friendly = !!spawn.friend;
    /** shake / pose bookkeeping (visual-local x the shake writes over) */
    this._visBaseX = 0;
    /** reused candidate list for _pickAttack (no per-step allocation) */
    this._cands = [];
    /** AUTOCAM §6.6 screen-up ground axis (refreshed per perception tick) */
    this._orbitUok = false; this._orbitUx = 0; this._orbitUz = 1;
    this._lastActiveAt = 0;
    this._droppedHelmet = null; this._plateSwap = null; this.plateWord = null; this.plateWordShown = null;
    /** the rendered frame's real dt (the look runs on it through hitstop) */
    this._rdt = 0;
    /** dressed-visual visibility snapshot (VisualPool restores it on reuse) */
    this._visSnapshot = null;
    this.disposed = false; this.dormant = false;
    /** TT3 Catnip Cloud: seconds left on its back (`giddy` state), whether the giddy flip turned the plate, the roll */
    this.giddyT = 0; this._giddyFlip = false; this._giddyW = 0; this._giddyPh = 0;
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
    if (this.targetWalledOff()) return;
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
  /**
   * Seconds between perception ticks for the current activity tier (PERF §4.2: 10 / 5 / 2 Hz; an arena member or an
   * alerted fighter never drops below WARM.activity.arenaMin). Tier 0 keeps TUNING.thinkEvery exactly.
   */
  perceptEvery() {
    const t = this._tier;
    if (!(t > 0)) return TUNING.thinkEvery;
    const A = WARM.activity;
    let hz = A.perceptHz[Math.min(t, A.perceptHz.length - 1)] || A.perceptHz[2] || 2;
    if (this.spawnOpts?.arena || this.alerted) hz = Math.max(hz, A.arenaMin);
    return 1 / hz;
  }

  /** AUTOCAM §6.6: the screen-up ground axis from the camera (`cam.groundAxes(outU, outR)`), once per think tick. */
  refreshOrbitAxes() {
    const cam = this.ctx.cam;
    this._orbitUok = false;
    if (typeof cam?.groundAxes !== 'function') return;
    try {
      cam.groundAxes(_axU, _axR);
      const l = Math.hypot(_axU.x, _axU.z);
      if (l > 0.5) { this._orbitUx = _axU.x / l; this._orbitUz = _axU.z / l; this._orbitUok = true; }
    } catch { /* camera without the axes yet */ }
  }

  /** The actor this enemy fights (the player while she's playable). */
  targetActor() {
    const p = this.ctx.player;
    if (!p || !p.alive || p.scripted || p.hurtable === false) return null;
    // Mochi's Shield Wall taunt (§9; requests/companions.md): the taunter while it lasts and he is awake
    const tb = this.tauntedBy;
    if (tb && this.tauntT > 0 && tb.alive !== false && !((tb.napT ?? 0) > 0) && tb.pos) return tb;
    // §9.1 token share: this attack token went to a nearby awake companion (COMPANIONS.tokenShare of the grants)
    const st = this.shareTarget;
    if (st && st.alive !== false && !((st.napT ?? 0) > 0) && st.pos && this.hasToken()) return st;
    return p;
  }

  /** XZ distance to targetActor() (the player, or a taunting companion). */
  distToTarget() { const t = this.targetActor(); return t ? Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : this.distToPlayer(); }

  distToPlayer() { const p = this.ctx.player?.pos; return p ? Math.hypot(p.x - this.pos.x, p.z - this.pos.z) : Infinity; }

  /** tech.md §10 canSee: range + FOV cone + line of sight (eye to chest); closer than sight × 0.35 is "heard". */
  canSee() {
    const p = this.targetActor();
    if (!p) return false;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz), sight = this.def.sight ?? 10;
    if (d > sight) return false;
    if (this.targetWalledOff(p)) return false;
    if (d < sight * TUNING.heardFrac) return true;
    const fov = this.def.fov ?? 2.09;
    if (fov < Math.PI * 2 - 0.05 && Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing)) > fov * 0.5) return false;
    const ph = this.ctx.physics;
    if (typeof ph?.lineOfSight !== 'function') return true;
    _v.set(this.pos.x, this.pos.y + this.height * 0.8, this.pos.z);
    _d.set(p.pos.x, p.pos.y + p.height * 0.6, p.pos.z);
    return ph.lineOfSight(_v, _d);
  }

  /** Fire `def`'s projectile from chest height toward her chest (or straight ahead); `opts` → combat.spawnProjectile. */
  fireProjectile(def, opts = undefined) {
    const p = this.targetActor(), y0 = this.pos.y + this.height * 0.6;
    _v.set(this.pos.x + Math.sin(this.facing) * this.radius, y0, this.pos.z + Math.cos(this.facing) * this.radius);
    if (p) _d.set(p.pos.x - _v.x, p.pos.y + p.height * 0.55 - y0, p.pos.z - _v.z); else _d.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    if (_d.lengthSq() < 1e-6) _d.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    return this.ctx.combat.spawnProjectile(def, this, _v.clone(), _d.normalize().clone(), opts);
  }

  /** Contact check for dash attacks: one hit when her cylinder touches our front. */
  dashContact(def) {
    const p = this.targetActor();
    if (!p || !p.alive) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > this.radius + p.radius + 0.25 || Math.abs(p.pos.y - this.pos.y) > Math.max(this.height, p.height)) return;
    if (d > 1e-3 && (dx * Math.sin(this.facing) + dz * Math.cos(this.facing)) / d < 0.2) return;
    this.dashHit = true;
    const r = this.ctx.combat.applyHit(this, p, def);
    if (r === 'none') { this.dashHit = false; return r; }      // her i-frames: the dash may still catch her
    this.def.onDashHit?.(this, p, r, def);
    return r;
  }

  /** Sage's volley grounds flyers (COMPANIONS.sage.groundFlyers); no-op for walkers. */
  groundFlyer(sec) { this.def.ground?.(this, sec); }

  /** Leash: too far from the player or from home → return. */
  leashBroken() {
    if (this.objectiveRunner || this.def.boss || this.bossAdd) return false;
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
    if (vx * vx + vz * vz > 1e-6) { _v.set(vx, 0, vz); this.dryStep(_v); vx = _v.x; vz = _v.z; }
    this.vel.x = damp(this.vel.x, vx, TUNING.steerDamp, dt); this.vel.z = damp(this.vel.z, vz, TUNING.steerDamp, dt);
    return d;
  }

  /** Unit-ish push away from overlapping pack-mates (written into `out`); long bodies (def.body) space by their spines. */
  separation(out) {
    out.set(0, 0, 0);
    const list = this.ctx.enemies?.list;
    if (!list) return out;
    const sa = this.spine(_spA);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === this || !o.alive || o.dormant || o.flying !== this.flying) continue;
      const sb = typeof o.spine === 'function' ? o.spine(_spB) : pointSpine(o, _spB);
      const d2 = segSegXZ(sa.x0, sa.z0, sa.x1, sa.z1, sb.x0, sb.z0, sb.x1, sb.z1, _seg);
      const min = (sa.r + sb.r) * 1.6;
      if (d2 >= min * min) continue;
      let dx = _seg.ax - _seg.bx, dz = _seg.az - _seg.bz, d = Math.sqrt(d2);
      if (d < 1e-4) { dx = this.pos.x - o.pos.x; dz = this.pos.z - o.pos.z; d = Math.hypot(dx, dz); if (d < 1e-4) continue; }
      const w = (min - Math.sqrt(d2)) / min;
      out.x += (dx / d) * w; out.z += (dz / d) * w;
    }
    return out;
  }

  /**
   * The XZ collision spine: def.body = {front, back, r} (m along the facing; a quadruped rat), else the plain circle
   * (a zero-length segment of `radius`). Written into `out` ({x0, z0, x1, z1, r}; x1/z1 = the front).
   */
  spine(out = {}) {
    const b = this.def.body;
    if (!b) return pointSpine(this, out);
    const sx = Math.sin(this.facing), sz = Math.cos(this.facing);
    out.x0 = this.pos.x - sx * b.back; out.z0 = this.pos.z - sz * b.back;
    out.x1 = this.pos.x + sx * b.front; out.z1 = this.pos.z + sz * b.front;
    out.r = b.r ?? this.radius;
    return out;
  }

  /** Centre distance at which our capsule front (the snout) keeps TUNING.standoff off `a`'s collider (0: no body). */
  frontReach(a) {
    const b = this.def.body;
    return b ? b.front + (b.r ?? this.radius) + (a?.radius ?? 0.35) + TUNING.standoff : 0;
  }

  /**
   * Long bodies (def.body) vs her side (player, companions, Pudding): physics separates circles only, so a 2.7 m rat
   * would walk its snout through her. Pushes THIS enemy out of their circles from the spine's closest point.
   */
  resolveBody() {
    const b = this.def.body;
    if (!b || !this.alive || this.dormant || this.flying || this.attachedTo) return;
    const reg = this.ctx.actors;
    if (!reg?.list) return;
    const s = this.spine(_spA);
    // PERF §11 A15: typed query (her side only), no filter closure; radius covers the whole spine around `pos`
    const list = typeof reg.queryRadiusTyped === 'function'
      ? reg.queryRadiusTyped(this.pos, Math.max(b.front, b.back) + s.r, BODY_MASK, _bodyCands) : reg.list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || a === this || a.faction === 'enemy' || a.faction === 'neutral' || a.alive === false || !a.pos || !(a.radius > 0)) continue;
      if (a.ghost || a.noClip || a.attachedTo || a.collideActors === false) continue;
      if (a.pos.y >= this.pos.y + this.height || this.pos.y >= a.pos.y + (a.height ?? 1)) continue;
      const d2 = segSegXZ(s.x0, s.z0, s.x1, s.z1, a.pos.x, a.pos.z, a.pos.x, a.pos.z, _seg), min = s.r + a.radius;
      if (d2 >= min * min) continue;
      let dx = _seg.ax - a.pos.x, dz = _seg.az - a.pos.z, d = Math.sqrt(d2);
      if (d < 1e-4) { dx = Math.cos(this.facing); dz = -Math.sin(this.facing); d = 1; }   // on the spine: step sideways
      const push = min - Math.sqrt(d2), nx = dx / d, nz = dz / d;
      if (this.deepAt(this.pos.x + nx * (push + this.radius), this.pos.z + nz * (push + this.radius), this.pos.y)) continue;
      this.pos.x += nx * push; this.pos.z += nz * push;
      s.x0 += nx * push; s.z0 += nz * push; s.x1 += nx * push; s.z1 += nz * push;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) { this.vel.x -= nx * vn; this.vel.z -= nz * vn; }
    }
  }

  // ------------------------------------------------------------------ water + arenas
  /**
   * Deep water at (x, z)? With `fromY` (feet height): judged on the surface a walker at that height would stand on
   * there (the stream beside a bridge deck is deep for a rat on the bank, the deck is dry for one on it); without,
   * from the highest walkable surface there (bridge decks are dry).
   */
  deepAt(x, z, fromY) {
    const ph = this.ctx.physics;
    if (typeof ph?.isDeepWater !== 'function') return false;
    if (typeof ph.waterLevelAt === 'function' && ph.level && ph.waterLevelAt(x, z) == null) return false;   // cheap: no water here
    if (Number.isFinite(fromY) && typeof ph.groundAt === 'function') return !!ph.isDeepWater(x, z, ph.groundAt(x, z, fromY + STEP_PROBE));
    return !!ph.isDeepWater(x, z);
  }

  /**
   * Walkers never step into deep water: if the probe ahead of the planar velocity `v` is deep, turn `v` (same speed)
   * by TUNING.water.turns until the probe is dry (a back-off on the bank becomes a strafe), else stop. Mutates `v`.
   * @param {THREE.Vector3} v @returns {boolean} true when `v` was changed
   */
  dryStep(v) {
    if (this.flying || this.def.noPhysics || this.def.fly) return false;
    const sp = Math.hypot(v.x, v.z);
    if (sp < 1e-4) return false;
    const W = TUNING.water, look = this.radius + W.probe + sp * W.lookAhead, near = this.radius + 0.1;
    const ux = v.x / sp, uz = v.z / sp;
    // the whole stretch ahead must be dry (a far probe alone can see a bridge deck across a strip of stream)
    const y = this.pos.y, mid = (near + look) * 0.5;
    const dry = (dx, dz) => !this.deepAt(this.pos.x + dx * near, this.pos.z + dz * near, y)
      && !this.deepAt(this.pos.x + dx * mid, this.pos.z + dz * mid, y)
      && !this.deepAt(this.pos.x + dx * look, this.pos.z + dz * look, y);
    if (dry(ux, uz)) return false;
    for (const t of W.turns) {
      const c = Math.cos(t), s = Math.sin(t), rx = ux * c + uz * s, rz = -ux * s + uz * c;
      if (dry(rx, rz)) { v.x = rx * sp; v.z = rz * sp; return true; }
    }
    v.x = 0; v.z = 0;
    return true;
  }

  /** No deep water within `r` of us (4 compass probes). */
  dryAround(r) {
    const x = this.pos.x, z = this.pos.z, y = this.pos.y;
    return !this.deepAt(x + r, z, y) && !this.deepAt(x - r, z, y) && !this.deepAt(x, z + r, y) && !this.deepAt(x, z - r, y);
  }

  /** The Arena this enemy was spawned for (arena waves pass `arena: id`), or null. */
  homeArena() {
    const id = this.spawnOpts?.arena;
    if (!id) return null;
    const lv = this.ctx.levels;
    return lv?.current?.arena?.(id) ?? lv?.arena?.(id) ?? null;
  }

  /** A locked arena (not ours) whose fog ring (grown by `pad`) holds `pos`, or null. */
  foreignArenaAt(pos, pad = TUNING.foreignArena.pad) {
    const list = this.ctx.levels?.current?.arenas;
    if (!pos || !Array.isArray(list)) return null;
    const mine = this.spawnOpts?.arena;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a && a.locked && !a.cleared && a.id !== mine && typeof a.contains === 'function' && a.contains(pos, -pad)) return a;
    }
    return null;
  }

  /**
   * She is fighting inside a locked arena we aren't part of (and we aren't trapped inside it with her): that fight
   * is the arena's alone, so we don't alert on her and a running chase drops (Crow Fields crows vs the Picnic Glade).
   */
  targetWalledOff(t = this.targetActor()) {
    if (!t?.pos) return false;
    const a = this.foreignArenaAt(t.pos);
    return !!a && !a.contains(this.pos, 0);
  }

  /** Flyers stay outside a foreign locked arena's fog wall (walkers are stopped by its physics ring). */
  keepOutOfForeignArenas() {
    if (!this.flying || this.perched || !this.alive || this.dormant) return;
    const pad = TUNING.foreignArena.flyerPad;
    const a = this.foreignArenaAt(this.pos, pad);
    if (!a || !a.center) return;
    const c = a.center, dx = this.pos.x - c.x, dz = this.pos.z - c.z;
    let nx, nz;
    if (a.size) {
      const hw = a.size[0] / 2 + pad, hd = a.size[1] / 2 + pad;
      if (hw - Math.abs(dx) < hd - Math.abs(dz)) { nx = Math.sign(dx) || 1; nz = 0; this.pos.x = c.x + nx * hw; }
      else { nx = 0; nz = Math.sign(dz) || 1; this.pos.z = c.z + nz * hd; }
    } else {
      const d = Math.hypot(dx, dz), r = (a.r ?? 12) + pad;
      nx = d > 1e-4 ? dx / d : 0; nz = d > 1e-4 ? dz / d : 1;
      this.pos.x = c.x + nx * r; this.pos.z = c.z + nz * r;
    }
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn < 0) { this.vel.x -= nx * vn; this.vel.z -= nz * vn; }
  }

  /**
   * Safety net: a walker that ends up in deep water (knockback, a slip off the bank) or an arena member well outside
   * its locked arena goes back to its last dry footing / the nearest valid arena ring point, or is despawned (the
   * arena then counts it gone, so the wave still clears: no softlock behind the fog wall).
   */
  checkStranded(dt) {
    if (!this.alive || this.dormant || this.flying || this.def.noPhysics || this.def.fly || this.attachedTo || this.scripted) return;
    const W = TUNING.water, ph = this.ctx.physics;
    const deep = typeof ph?.isDeepWater === 'function' && !!ph.isDeepWater(this.pos.x, this.pos.z, this.pos.y);
    const arena = this.homeArena();
    const out = !!arena && arena.locked && !arena.cleared && typeof arena.distanceTo === 'function' && arena.distanceTo(this.pos) > W.arenaSlack;
    if (!deep && !out) {
      this._deepT = 0;
      if (this.onGround && (this._dryT = (this._dryT ?? 0) - dt) <= 0) {
        this._dryT = W.dryEvery;
        // footing well clear of the water (not the wet edge of the bank), inside our locked arena
        if ((!arena?.locked || arena.contains?.(this.pos, 0)) && this.dryAround(this.radius + 0.3)) (this._lastDry ??= new THREE.Vector3()).copy(this.pos);
      }
      return;
    }
    if (!out && (this._deepT = (this._deepT ?? 0) + dt) < W.rescueAfter) return;
    this._deepT = 0;
    this.rescue(arena);
  }

  /** Put a stranded walker back on dry, valid ground (see checkStranded); despawn it if there is none. */
  rescue(arena = this.homeArena()) {
    const locked = !!arena?.locked;
    const ok = (p) => p && !this.deepAt(p.x, p.z, p.y) && (!locked || arena.contains?.(p, 0.5));
    let to = ok(this._lastDry) ? this._lastDry.clone() : null, top = !to;
    if (!to && arena && typeof arena.ringPoints === 'function') {
      const pts = arena.ringPoints().filter((p) => (typeof arena.validPoint !== 'function' || arena.validPoint(p)) && !this.deepAt(p.x, p.z));
      pts.sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.z) - Math.hypot(b.x - this.pos.x, b.z - this.pos.z));
      if (pts[0]) to = pts[0].clone();
    }
    if (!to && !locked && this.home && !this.deepAt(this.home.x, this.home.z)) to = this.home.clone();
    if (!to) { this.ctx.enemies?.despawn?.(this); return; }
    if (top) {                                         // ring point / home: the dry walkable top there (a bridge deck)
      const ph = this.ctx.physics, gy = typeof ph?.topAt === 'function' ? ph.topAt(to.x, to.z) : ph?.heightAt?.(to.x, to.z);
      if (Number.isFinite(gy)) to.y = gy;
    }
    this.ctx.bus.emit(E.BURST, { kind: 'spawn', position: to.clone() });
    this.pos.copy(to); this.vel.set(0, 0, 0);
    this.snap();
    if (this.stateName === 'hop') this.setState(this.targetActor() ? 'chase' : 'return');
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

  /** Attack-def lookup: the type's own `moves` (a refined row, e.g. the dodge-only snatch), then Appendix A ATTACKS. */
  attackDef(id) { return this.def.moves?.[id] ?? ATTACKS[id] ?? null; }

  /** Weighted pick from def.attacks (seeded) among those usable at distance `d`; kept until used. */
  pickAttack(d = this.distToPlayer()) {
    const c = this._pickAttack(d);
    // CONTROLS_SPEC §8.5: no off-screen snipes. The choice is kept; it just can't start until she can see it.
    this.holdFire = !!c && !rangedStartAllowed(this, c);
    return this.holdFire ? null : c;
  }

  _pickAttack(d) {
    if (this.attackChoice && this.stateName === 'chase') return this.attackChoice;
    // PERF E4: the candidate list is reused (chase runs this every step)
    const list = this._cands, all = this.def.attacks ?? [];
    list.length = 0;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if ((this.attackCd[a.id] ?? 0) <= 0 && (a.minRange == null || d >= a.minRange * 0.8)
        && (!a.when || a.when(this)) && (!this.def.canUse || this.def.canUse(this, a, d))) list.push(a);
    }
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
  acquireToken(kind) {
    const t = this.tokens;
    if (!t) return true;
    const had = !!t.has?.(this);
    const ok = t.acquire(this, kind);
    if (ok && !had) this._rollTokenShare();
    return ok;
  }
  releaseToken() { this.tokens?.release?.(this); this.shareTarget = null; this.releaseBehind(); }

  /** Give back the pack's "behind" flank slot (hyena flankers). */
  releaseBehind() {
    if (!this.flanker) return;
    this.flanker = false;
    this.ctx.enemies?.releaseBehind?.(this);
  }

  /**
   * GAME_DESIGN §9.1 (requests/companions.md): when an attack token is granted and an awake companion is within
   * COMPANIONS.engage of her, this attack goes for the companion instead COMPANIONS.tokenShare of the time.
   */
  _rollTokenShare() {
    this.shareTarget = null;
    const comps = this.ctx.companions?.active, p = this.ctx.player;
    if (!comps?.length || !p?.pos || this.isBoss || this.def?.boss) return;
    const R = COMPANIONS.engage ?? 6, rng = this.ctx.rng ?? Math.random;
    for (const c of comps) {
      if (!c?.pos || c.alive === false || (c.napT ?? 0) > 0 || c.scripted || c.hurtable === false) continue;
      if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > R) continue;
      if (rng() < (COMPANIONS.tokenShare ?? 0.2)) this.shareTarget = c;
      return;
    }
  }

  /**
   * Start `atk` (token already held): the windup, or the move's own state when the type has one (`def.state` names it,
   * or a state with the attack's id exists: boss moves, chains).
   */
  beginAttack(atk) {
    this.attack = atk; this.attackChoice = null;
    const st = atk?.def?.state ?? (this.states[atk?.id]?.attacking ? atk.id : null);
    this.setState(st && this.states[st] ? st : 'windup');
  }

  /** Locomotion speed for this step (types with a gait: the spider's skitter bursts). */
  gait(speed, dt) { return this.def.gait ? this.def.gait(this, speed, dt) : speed; }

  // ------------------------------------------------------------------ objective runners (§12.6 The Line)
  /** Where an objective runner heads (spawn opts `goal`, else the level's `winch` anchor); null = none. */
  runnerGoal() {
    if (!this.objectiveRunner) return null;
    if (this._goal !== undefined) return this._goal;
    const g = this.spawnOpts?.goal ?? 'winch';
    const out = new THREE.Vector3();
    let ok = false;
    if (typeof g === 'string') { const a = this.ctx.levels?.anchor?.(g); if (a?.pos) { out.copy(a.pos); ok = true; } }
    else if (Array.isArray(g)) { out.set(g[0], 0, g[g.length - 1]); ok = true; }
    else if (g && typeof g.x === 'number') { out.set(g.x, g.y ?? 0, g.z); ok = true; }
    this._goal = ok ? out : null;
    return this._goal;
  }

  /**
   * Runner step: path straight for the goal and hold it (fight only if she is within M2.runner.fightWithin).
   * Returns true when it handled this step.
   */
  runnerStep(dt) {
    const g = this.runnerGoal();
    if (!g) return false;
    const p = this.targetActor();
    if (p && this.distToTarget() <= M2.runner.fightWithin) return false;
    if (this.hasToken() && !this.attack) this.releaseToken();
    const left = this.steerTo(g.x, g.z, this.gait(this.def.run ?? 3.5, dt), dt);
    if (left > M2.runner.arrive) this.faceVel(dt, TUNING.chaseTurnRate);
    else {
      this.brake(dt);
      if (p) this.faceTo(p.pos, dt, TUNING.turnRate);
      this.def.onRunnerArrive?.(this, dt);
    }
    return true;
  }

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
    if (this.objectiveRunner && this.runnerStep(dt)) return;
    const p = this.targetActor();
    if (!p) { this.releaseToken(); return this.setState('return'); }
    if (this.leashBroken()) return this.setState('return');
    const d = this.distToTarget();
    const atk = this.pickAttack(d);
    const range = atk?.range ?? 1.5, orbitR = range * TUNING.orbitMul;
    let has = this.hasToken();
    if (!has && atk && this.cooldownT <= 0 && d <= orbitR + 1.5) has = this.acquireToken(atk.kind);
    if (has && atk) {
      this.tokenT += dt;
      if (d <= range && (atk.minRange == null || d >= atk.minRange) && this.cooldownT <= 0 && (!this.def.readyToAttack || this.def.readyToAttack(this, p, atk, d))) {
        return this.def.startAttack ? this.def.startAttack(this, atk) : this.beginAttack(atk);
      }
      if (this.tokenT > (this.def.tokenHold ?? 4)) { this.releaseToken(); this.tokenT = 0; this.cooldownT = 1; }      // don't hog a token we can't use
      const keep = Math.max(0.2, range * 0.8, this.frontReach(p));
      if (!this.def.approachPoint?.(this, p, keep, _v)) {
        _d.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z);
        const dl = _d.length() || 1;
        _v.set(p.pos.x + (_d.x / dl) * keep, 0, p.pos.z + (_d.z / dl) * keep);
      }
      this.steerTo(_v.x, _v.z, this.gait(this.def.run ?? 3.5, dt), dt);
    } else {
      if (this.def.whileWaiting?.(this, p, d, dt)) return;
      // wait for a token: orbit the player at 1.4× attack range, drifting around her
      this.orbitT -= dt;
      if (this.orbitT <= 0) { this.orbitT = rangeOf(this.ctx.rng, TUNING.orbitRepick); this.orbitDir = this.ctx.rng.sign(); }
      const cur = Math.atan2(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
      // AUTOCAM §6.6 orbit penalty: drift the way whose next slot sits less far down-screen (toward the lens) past
      // `free` m, so a waiting pack spreads over the readable half of the screen (U refreshed per perception tick)
      if (this._orbitUok) {
        const R = orbitR, d0 = TUNING.orbitDrift * this.orbitDir, ux = this._orbitUx, uz = this._orbitUz;
        const pa = orbitPenalty(p.pos.x + Math.sin(cur + d0) * R, p.pos.z + Math.cos(cur + d0) * R, p.pos.x, p.pos.z, ux, uz, ORBIT);
        if (pa > 0) {
          const pb = orbitPenalty(p.pos.x + Math.sin(cur - d0) * R, p.pos.z + Math.cos(cur - d0) * R, p.pos.x, p.pos.z, ux, uz, ORBIT);
          if (pb < pa) this.orbitDir = -this.orbitDir;
        }
      }
      const a = cur + this.orbitDir * TUNING.orbitDrift;
      const fast = d > orbitR + 2;
      this.steerTo(p.pos.x + Math.sin(a) * orbitR, p.pos.z + Math.cos(a) * orbitR, this.gait(fast ? (this.def.run ?? 3.5) : (this.def.walk ?? 1.6), dt), dt);
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
    const id = this._emitTelegraph(kind, desc);
    this.telegraphId = id;
    // ART §5.1: the wind-up rim (TONE.telegraph at 0.8) until the hit goes live, then a 0.15 s fade
    this.look?.windup(this._lastActiveAt);
    return id;
  }

  /**
   * An extra telegraph alongside the main one (decals with a glint: a lane + the red "!!", 5 cheese-bomb circles).
   * Ended by endTelegraph() (all of them) or endTelegraphId(id). `desc` extras (w, l, angle, inner, follow, target)
   * pass through to fx (fx/Telegraphs normalizeTelegraph).
   */
  telegraphExtra(kind, desc = {}) {
    const id = this._emitTelegraph(kind, desc);
    (this._extraTele ??= new Set()).add(id);
    return id;
  }

  _emitTelegraph(kind, desc) {
    const id = teleId++;
    if (!desc.pos) this.updateTell();
    const duration = desc.duration ?? 0.5;
    const shape = desc.shape ?? defaultShape(kind), pos = desc.pos ?? this.tellPos, dir = desc.dir ?? this.tellDir;
    const pay = telegraphPayload(this, kind, desc, duration, this.ctx.game?.time ?? 0);
    this._lastActiveAt = pay.activeAt;
    this.ctx.bus.emit(E.TELEGRAPH, {
      ...desc, id, actor: this, kind, shape, pos, dir,
      size: desc.size ?? desc.r ?? 1, duration,
      ...pay,
      // WA §3.4 the glyph of this kind (fx draws it; combat.W1 may refine) and AUTOCAM §7 the lane end point
      glyph: desc.glyph ?? TELEGRAPH.glyph?.[kind] ?? null,
      end: desc.end ?? laneEnd(shape, pay, desc, pos, dir),
    });
    return id;
  }

  /** End one telegraph (main or extra) by id. */
  endTelegraphId(id) {
    if (id == null) return;
    if (id === this.telegraphId) { this.telegraphId = null; this.ctx.bus.emit(E.TELEGRAPH_END, { id }); return; }
    if (this._extraTele?.delete(id)) this.ctx.bus.emit(E.TELEGRAPH_END, { id });
  }

  /** End the main telegraph and every extra one. */
  endTelegraph() {
    if (this.telegraphId != null) {
      this.ctx.bus.emit(E.TELEGRAPH_END, { id: this.telegraphId });
      this.telegraphId = null;
    }
    if (this._extraTele?.size) {
      for (const id of this._extraTele) this.ctx.bus.emit(E.TELEGRAPH_END, { id });
      this._extraTele.clear();
    }
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
    if (this.def.onParried?.(this, byActor, { gold }) === true) return;     // the type handled it (pug shield break)
    const g = PLAYER.guard, elite = this.maxPoise >= g.eliteMinPoise;
    const sec = gold ? (this.attack?.def?.goldStagger ?? this.def.goldStagger ?? g.goldParryStagger)
      : (this.attack?.def?.parriedStun ?? (elite ? g.eliteParryStagger : g.parryStagger));
    this.stagger(sec);
  }

  /**
   * TT3 Catnip Cloud: roll onto its back for `sec` s (no attacks; the plate flips to its friend word). Bosses, elites
   * (poise ≥ PLAYER.guard.eliteMinPoise) and flyers are not giddy (the cloud gives them Dizzy / grounds them).
   * @returns {boolean} true when it went giddy
   */
  makeGiddy(sec) {
    if (!this.alive || this.dormant || this.scripted || !this.ai || this.disposed || !(sec > 0)) return false;
    if (this.def.boss || this.isBoss || this.maxPoise >= PLAYER.guard.eliteMinPoise || (this.def.fly && !this.grounded)) return false;
    if (this.stateName === 'die') return false;
    this.giddyT = Math.max(this.giddyT, sec);
    this.staggerT = 0;
    if (this.stateName !== 'giddy') this.setState('giddy');
    return true;
  }

  /** Is it on its back in the catnip right now? */
  get isGiddy() { return this.stateName === 'giddy' && this.giddyT > 0; }

  /** The player blocked our hit: recoil a step. */
  onBlocked(byActor, def) {
    if (this.def.onBlocked?.(this, byActor, def) === true) return;
    this.vel.x -= Math.sin(this.facing) * TUNING.blockRecoil; this.vel.z -= Math.cos(this.facing) * TUNING.blockRecoil;
  }

  /** Optional §19.4 hook; types refine it (crow: only hittable low unless grounded). */
  resolveIncoming(attacker, def, hitDir) {
    return this.def.resolveIncoming ? this.def.resolveIncoming(this, attacker, def, hitDir) : 'hit';
  }

  onHit(hit) {
    this.flashT = TUNING.hitFlash;
    // TT3: the belly-rub bonk wakes a giddy foe (Combat already dealt the ×1.5)
    if (this.stateName === 'giddy' && this.alive) {
      this.giddyT = 0;
      this.ctx.bus.emit(E.BURST, { kind: 'hearts', position: this.pos.clone().setY(this.pos.y + this.height), count: 2 });
      if (!this.scripted && this.ai) { this.alerted = true; this.setState(this.staggerT > 0 ? 'stagger' : 'chase'); }
    }
    // WA §5.1: flash 1 → 0 over the freeze (+0.06 s), Squash.kick(-2), a shake while frozen — on unscaled time
    this.look?.hit(this.ctx.game?.hitstopT ?? 0);
    if (this.roleSpec('hit')) this.hitReactT = TUNING.hitReact; else if (!this.look) this.squashT = TUNING.squash.dur;
    if (!this.alive || this.scripted || !this.ai) return;
    this.def.onHit?.(this, hit);
    if (!this.alive || this.disposed) return;
    // Appendix B.3 `onHitWhile`: a hit during a gloat / jeer / laugh windup chokes it
    if (this.def.onHitWhile?.[this.stateName] === 'choke' && !this.chokeLock) { this.choke(); return; }
    if (!this.alerted || this.stateName === 'idle' || this.stateName === 'patrol' || this.stateName === 'return') {
      this.alerted = true;
      if (this.staggerT <= 0) { this.ctx.bus.emit(E.ENEMY_ALERTED, { enemy: this }); this.ctx.enemies?.alertNear?.(this.pos, TUNING.groupAlertRadius, this); this.setState('chase'); }
    }
    if (this.def.fleeBelow && !this.fled && this.hp > 0 && this.hp / this.maxHp <= this.def.fleeBelow && this.staggerT <= 0) this.setState('flee');
  }

  onDeath(hit) { this.alive = false; this.def.onDeath?.(this, hit); this.setState('die'); }

  /** Combat's lethal hook: true = survive (the type set its own hp; Pilfer's chase can't be defeated). */
  onLethal(info) { return this.def.onLethal?.(this, info) === true; }

  /**
   * §10.3 choke ("hrk!"): stagger (def.gloat.chokeStagger, 1.0 s), `enemy:choke` (the player adds +10 Valor, fx and
   * audio react). Types refine it with `def.onChoke` (bosses: Dizzy to full, a bark).
   */
  choke() {
    if (!this.alive) return;
    this.endTelegraph(); this.releaseToken(); this.attack = null; this.swing = null;
    const g = this.def.gloat, sec = (typeof g === 'object' ? g?.chokeStagger : null) ?? 1.0;
    this.ctx.bus.emit(E.ENEMY_CHOKE, { enemy: this });
    if (this.def.onChoke?.(this) === true) return;
    this.stagger(sec);
  }

  /** Combat landed one of our hits on her (EnemyManager relays `combat:hit`): the hyena's Gloat starts here. */
  onDealtHit(h) { if (this.alive && this.ai && !this.scripted) this.def.onDealtHit?.(this, h); }

  dieDur() {
    if (this.def.dieDur) return this.def.dieDur(this);
    if (this.faint) return this.faint.poofAt + WARM.faint.after;
    return this.def.scamper ? TUNING.die.scamperDur : TUNING.die.dur;
  }

  /**
   * §10.1: the helmet spins off, away from the hit (EnemyManager animates the debris). The debris is a copy (shared
   * geometry and material) and the worn helm only hides, so a pooled visual gets it back on its next spawn.
   */
  dropHelmet(dir = null) {
    const h = this.helmet;
    if (!h || !h.parent) return;
    this.helmet = null;
    if (this.ctx.enemies?.spawnDebris) {
      h.updateWorldMatrix(true, false);
      const c = h.clone();
      c.matrixWorld.copy(h.matrixWorld);
      c.userData = { ...h.userData, debrisOf: h.uuid };
      h.visible = false;
      this._droppedHelmet = h;
      this.ctx.enemies.spawnDebris(c, this, dir);
    } else { h.visible = false; this._droppedHelmet = h; }
  }

  /**
   * WA §8.3 the HATER plate flips to its friend word (0.25 s before the puff): characters' flipPlate when it exists
   * (both words baked in one texture, a UV offset swap), else the friend texture pre-baked at dress time. Idempotent.
   * @returns {boolean} true when the plate now shows the friend word
   */
  flipPlate() {
    if (this.plateFlipped) return true;
    const w = this.plateFriendWord;
    if (!w || !this.plate) return false;
    let ok = false;
    try {
      if (typeof this.dress?.flipPlate === 'function') ok = this.dress.flipPlate(true) !== false;
      else if (this._plateSwap?.decal && this._plateSwap.friend) {
        const s = this._plateSwap;
        s.decal.material.map = s.friend; s.decal.material.needsUpdate = true;
        ok = true;
      }
    } catch (err) { console.warn('[enemies] plate flip', err); }
    if (ok) { this.plateFlipped = true; this.plateWordShown = w; }
    return ok;
  }

  /** Undo flipPlate (VisualPool reuse). */
  unflipPlate() {
    if (!this.plateFlipped) return;
    try {
      if (typeof this.dress?.flipPlate === 'function') this.dress.flipPlate(false);
      else if (this._plateSwap?.decal && this._plateSwap.foe) { this._plateSwap.decal.material.map = this._plateSwap.foe; this._plateSwap.decal.material.needsUpdate = true; }
    } catch { /* cosmetic */ }
    this.plateFlipped = false; this.plateWordShown = this.plateWord ?? null;
  }

  /**
   * Hover / selection rim (CONTROLS_SPEC §7.4, WA §3.6): composed by the look with the hit flash and the wind-up rim,
   * with a boing on the way in. `color` null clears. Same contract as characters.setHighlight.
   */
  setHighlight(color, strength = 1) {
    if (!this.visual) return false;
    this.visual.userData.highlight = color === null || color === undefined || !(strength > 0) ? null : { color, strength };
    return true;
  }

  /** WA §8.2 display name (Wobblejelly, Squeakybone, Big Chief Cacklejaw...). */
  get displayName() { return displayNameFor(this.def?.id); }

  // ------------------------------------------------------------------ step
  update(dt) {
    if (this.dormant || !this.ctx.game.simActive(this)) return;
    this.stateT += dt;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.cooldownT = Math.max(0, this.cooldownT - dt);
    if (this.tauntT > 0 && (this.tauntT -= dt) <= 0) { this.tauntT = 0; this.tauntedBy = null; }   // Shield Wall refreshes it every step
    for (const k in this.attackCd) if (this.attackCd[k] > 0) this.attackCd[k] -= dt;
    this.def.tick?.(this, dt);
    if (this.scripted || this.attachedTo) {
      this.scriptedStep(dt);
      if (!this.attachedTo) this.move(dt);
      return;
    }
    if (!this.ai) { this.brake(dt); this.move(dt); return; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      // PERF §4.2: perception at 10 Hz on screen, 5 / 2 Hz off screen (arena fights keep ≥ 5 Hz); windups, strikes and
      // steering stay at 60 Hz
      this.thinkT = Math.max(this.thinkT + this.perceptEvery(), 0);
      this.sees = this.canSee();
      this.refreshOrbitAxes();
      if (this.alerted && DISENGAGE.has(this.stateName) && !this.def.boss && this.targetWalledOff()) { this.interrupt(); this.setState('return'); }
    }
    if (this.staggerT > 0 && this.alive && this.stateName !== 'stagger' && this.stateName !== 'die' && this.stateName !== 'flee' && this.stateName !== 'giddy' && !this.state.noStagger) this.setState('stagger');
    this.state.update?.(this, dt);
    this.move(dt);
    this.resolveBody();
    this.keepOutOfForeignArenas();
    this.checkStranded(dt);
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
        this._finishVisual(root);
        return;
      }
      if (!def.model) return;
      // KayKit head meshes stay visible while fitting (§10.2 heights include the head); the beast head hides them
      const hide = def.hide?.filter((n) => !KAYKIT_HEADS.has(n));
      const m = await this.ctx.assets.model(def.model, { fit: def.fit ?? def.role, hide, show: def.show, tint: def.tint, cloneMaterials: true });
      if (def.hide && hide.length !== def.hide.length && !def.build) for (const n of def.hide) if (KAYKIT_HEADS.has(n)) { const o = m.scene.getObjectByName(n); if (o) o.visible = false; }
      if (this.disposed) return;
      markOwned(m.scene);
      // ART §7.3: the atlas → the mischief palette (one remap per (asset, palette), shared by every instance)
      const pal = paletteFor(def.model);
      if (pal && !def.noPalette) applyPalette(m.scene, pal, pal.key);
      // ART §7.3 step 4: KayKit's constant unit scale tracks go before any mixer binds the clips
      stripConstantScaleTracks(m.animations);
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
      // ART §7.2: big readable heads (static bone scales; the gear on a bone grows with it)
      const bs = def.boneScales ?? boneScalesFor(def.model);
      if (bs) scaleBones(m.scene, bs);
      // ART §7.3 step 3 / X28: GLB standard materials → pooled per-actor toon materials (uFlash / uHighlight, no clones)
      if (!def.noToon) { try { toonify(m.root, def.id); } catch (err) { console.warn(`[enemy] toon materials for ${def.id}`, err); } }
      // CONTROLS_SPEC §12 characters 3: helmet tops read from above. After toonify: the tint is a uniform of the toon
      // program (PERF §1.2: no extra program); owned non-toon materials are still patched in place, per instance
      if (this.ctx.cam?.isIso !== false && !def.noTopTint) { try { topTint(m.root); } catch { /* cosmetic only */ } }
      // PERF §9.4 / §5: body + rigid gear → one skinned draw (the helmet, beast head, plate, toggled and upright props
      // keep their own); `?bake=0` keeps the unbaked parts for A/B
      if (def.bake && !NO_BAKE) {
        try {
          bakeEnemyVisual(m.root, def.id, { skip: [this.helmet, this.head?.root, this.plate?.mesh ?? this.plate, ...Object.values(this.extraProps ?? {}), ...(this.uprightProps ?? [])] });
        } catch (err) { console.warn(`[enemy] bake failed for ${def.id}`, err); }
      }
      this._flash = def.noFlash ? [] : flashMaterials(m.root);
      this.anim = new Animator(m.scene, clipsFor(def.anims, m.animations));
      this._animKey = '';
      this._finishVisual(m.root);
      if (this._pendingClip) { const c = this._pendingClip; this._pendingClip = null; this.playClip(c.name, c).then(c.resolve); }
      this.render(1, 0);
    } catch (err) {
      console.error(`[enemy] visual failed for ${def.id}`, err);
    }
  }

  /** Shared tail of every visual build: the look, shadow casting (PERF §7 / E3 / E6), the plate's friend word. */
  _finishVisual(root) {
    this.look = this.def.noFlash ? null : new EnemyLook(root);
    this._visBaseX = root.position.x;
    this.applyCasting();
    if (this.plate && !this.plateFriendWord) this.plateFriendWord = friendWordFor(this.def.plateType ?? this.def.id, this.plateWord);
    this.plateWordShown = this.plateWord ?? null;
    if (this.poolKey) this.snapshotVisual();
    this.ctx.fx?.blobs?.add?.(this.object3d, (this.radius ?? 0.35) * 1.1);
  }

  /**
   * PERF §7 / K5: sun-shadow casting for this enemy — only its body and weapon (each with its kind's shared depth
   * material), and nothing at shadow stage 2 or on a tier without a shadow map (fx contact blobs ground it).
   */
  applyCasting() {
    if (!this.visual) return;
    const q = this.ctx.quality, on = SHADOW_STAGE < 2 && (q ? qualityShadowsOn(q) : true) && !this.def.noCast;
    setCasting(this.visual, on, depthFor);
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
    // ART §7.1: a fainting foe's death clip plays WARM.faint.clipMax s at most, then holds (the squash takes over)
    if (this.faint && this.stateName === 'die' && this.stateT > WARM.faint.clipMax && this._animKey) return;
    const key = role === 'hit' && this.stateName !== 'stagger' ? `hit#${this._hitSerial}` : opts?.once ? `${role}#${this._animSerial}` : role;
    if (key !== this._animKey) {
      this._animKey = key;
      if (!this.playRole(role, opts) && role !== 'idle') this.playRole('idle');
    } else if (opts?.loop && opts.speed && a.current) a.current.timeScale = opts.speed;
    this._tickMixer(dt);
  }

  /**
   * PERF §4.3 mixer LOD by activity tier (camera's `activityOf`): tier 0 every frame, tier 1 every 3rd frame with the
   * accumulated dt, tier ≥ 2 frozen (poses stay correct when it comes back; re-entry runs full rate the same frame).
   * Without camera tiers: the legacy rule (beyond TUNING.animFarDist from the focus, every 2nd frame). During hitstop
   * `dt` is 0 and the mixer still updates with 0 (tech.md §11.1).
   */
  _tickMixer(dt) {
    this._frame++;
    const tier = this._tier;
    if (tier >= 0 && this._tierFrame >= 0) {
      const k = WARM.activity.mixEvery[Math.min(tier, WARM.activity.mixEvery.length - 1)];
      if (!k) { this._mixAcc = 0; return; }
      this._mixAcc += dt;
      if (k > 1 && ((this.ctx.game?.frameCount ?? this._frame) + this.id) % k) return;
      dt = this._mixAcc; this._mixAcc = 0;
      this.anim.update(dt);
      return;
    }
    const cam = this.ctx.cam?.focus ?? this.ctx.camera?.position;        // CONTROLS_SPEC §2.8: LOD from the focus
    if (cam && dt > 0) {
      const dx = cam.x - this.pos.x, dz = cam.z - this.pos.z;
      if (dx * dx + dz * dz > TUNING.animFarDist * TUNING.animFarDist) {
        this._farDt += dt;
        if ((this._frame + this.id) % 2) return;
        dt = this._farDt;
      }
    }
    this._farDt = 0;
    this.anim.update(dt);
  }

  /**
   * PERF §4.3: this frame's activity tier from the camera (`cam.activityOf`, cached per frame by the camera); −1 when
   * the camera has no tiers (legacy LOD). Scripted (cutscene) actors always run at full rate.
   */
  _updateTier() {
    const cam = this.ctx.cam;
    if (this.scripted) { this._tier = 0; this._tierFrame = 0; return; }
    if (typeof cam?.activityOf !== 'function') { this._tier = -1; this._tierFrame = -1; return; }
    try { const t = cam.activityOf(this); this._tier = Number.isFinite(t) ? t : 0; this._tierFrame = cam.frameId ?? 0; }
    catch { this._tier = -1; this._tierFrame = -1; }
  }

  render(alpha, dt) {
    if (this.dormant) return;
    super.render(alpha);
    this._updateTier();
    const fdt = visualDt(this.ctx, dt);
    if (this.hitReactT > 0) { this.hitReactT -= fdt; if (this.hitReactT <= 0) this._hitSerial = (this._hitSerial ?? 0) + 1; }
    this._updateAnim(fdt);
    this.head?.update?.(fdt);
    this.cagedKitten?.render?.(dt);                 // KittenView applies hitstop / slow motion itself
    this.def.render?.(this, fdt, alpha);
    this._rdt = dt;
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

  /**
   * The rendered frame's real (unscaled) dt for the look: hitstop does NOT stop it (WA §5.1 the flash, squash and shake
   * play while the world is frozen); the pause menu does.
   */
  _lookDt(frameDt) {
    const g = this.ctx?.game;
    return g?.mode === 'menu' ? 0 : frameDt;
  }

  /** WA §3.2 / §3.4 motion language: wind-up squash −0.10, parry-window stretch +0.12 (the squash spring's target). */
  _poseTarget() {
    const st = this.stateName, P = WARM.pose;
    if (!this.alive) return 0;
    if (st === 'windup') return P.windup;
    if (st === 'strike' || this.state?.attacking) {
      const def = this.attack?.def, a1 = def?.active?.[1] ?? 0.12;
      return this.stateT <= a1 + P.ease ? P.parry : 0;
    }
    return 0;
  }

  /** Flash, rims, squash spring, shake, stagger wobble, faint squash / death shrink. */
  _renderFx(dt) {
    const v = this.visual;
    if (!v) return;
    const now = this.ctx.game?.time ?? 0;
    // ART §5.1 / WA §5.1: flash + wind-up rim + hover, the squash spring and the hitstop shake (unscaled time)
    let spring = 1;
    const look = this.look;
    if (look) {
      if (look.hlOn && this.telegraphId == null && this.stateName !== 'windup' && this.stateName !== 'strike' && !this.state?.attacking) look.endWindup(now);
      look.poseTarget = this._poseTarget();
      spring = look.update(this._lookDt(this._rdt ?? dt), now);
      if (look.shakeX !== 0 || v.position.x !== this._visBaseX) v.position.x = this._visBaseX + look.shakeX;
    } else {
      // no look (noFlash types): the §8.2 60 ms emissive flash
      const fl = this.flashT > 0 ? clamp(this.flashT / TUNING.hitFlash, 0, 1) : 0;
      if (this.flashT > 0) this.flashT -= dt;
      if (fl !== this._flashOn) {
        this._flashOn = fl;
        for (const f of this._flash) {
          if (fl > 0) { f.mat.emissive.copy(f.base).lerp(WHITE, fl); f.mat.emissiveIntensity = Math.max(f.baseI, 1); }
          else { f.mat.emissive.copy(f.base); f.mat.emissiveIntensity = f.baseI; }
        }
      }
    }
    // emote squash (§10.1 0.15 s to scale y 0.8), volume-preserving
    const base = this.def.visualScale ?? 1;
    let sy = spring;
    if (this.squashT > 0) {
      this.squashT -= dt;
      const u = 1 - Math.max(0, this.squashT) / TUNING.squash.dur;
      sy *= 1 - (1 - TUNING.squash.y) * Math.sin(Math.PI * u);
    }
    let k = 1;
    if (this.stateName === 'die') {
      if (this.faint) {
        // ART §7.1: squash flat to WARM.faint.squash over squashT (ease-out), then hold under the stars
        const F = WARM.faint, u = clamp(this.stateT / F.squashT, 0, 1), e = 1 - (1 - u) * (1 - u);
        sy *= 1 - (1 - F.squash) * e;
      } else {
        const left = this.dieDur() - this.stateT;
        if (left < TUNING.die.shrink) k = Math.max(0.001, left / TUNING.die.shrink);
      }
    }
    const sxz = 1 / Math.sqrt(sy);
    const pl = this.def.pulse ? this.def.pulse(this) : null;          // [sx, sy, sz] multipliers (abdomen pulse, jelly squash)
    v.scale.set(base * sxz * k * (pl?.[0] ?? 1), base * sy * k * (pl?.[1] ?? 1), base * sxz * k * (pl?.[2] ?? 1));
    // TT3 giddy: rolled onto its back, paws wiggling (eases in / out over ~0.15 s)
    const gw = this.stateName === 'giddy' && this.alive ? 1 : 0;
    if (gw || this._giddyW > 0) {
      this._giddyW = gw ? Math.min(1, this._giddyW + dt * 7) : Math.max(0, this._giddyW - dt * 7);
      this._giddyPh += dt * 11;
      const w = this._giddyW, e2 = w * w * (3 - 2 * w);
      v.rotation.x = -Math.PI * 0.5 * e2;
      v.position.y = (this.radius ?? 0.35) * 0.75 * e2;
      v.rotation.z = Math.sin(this._giddyPh) * 0.16 * e2;
      if (w === 0) { v.rotation.x = 0; v.position.y = 0; }
      return;
    }
    // stagger wobble
    if (this.wobbleT > 0) {
      this.wobbleT -= dt;
      this._wobblePh += dt * 18;
      v.rotation.z = Math.sin(this._wobblePh) * 0.12 * Math.min(1, this.wobbleT * 2);
    } else if (v.rotation.z !== 0) v.rotation.z = damp(v.rotation.z, 0, 12, dt);
  }

  // ------------------------------------------------------------------ PERF §3.4 visual pool
  /**
   * Hand this enemy's dressed visual to the pool (despawn): everything the build wired onto the enemy travels with it
   * (VISUAL_FIELDS), the enemy keeps nothing. Null when there is nothing poolable (no key, not fully built, disposed).
   * @returns {object|null} the visual record (VisualPool)
   */
  detachVisual() {
    if (!this.poolKey || !this.visual || this.disposed || (this.def.model && !this.anim)) return null;
    const rec = { key: this.poolKey, fields: {}, extraProps: { ...this.extraProps }, vis: this._visSnapshot ?? null };
    for (const k of VISUAL_FIELDS) { rec.fields[k] = this[k]; this[k] = k === '_flash' ? [] : null; }
    this.extraProps = {};
    rec.fields.visual.removeFromParent();
    this.ctx.fx?.blobs?.remove?.(this.object3d);
    return rec;
  }

  /**
   * Take a pooled visual (spawn): restore its fields, reset it to a fresh look (idle pose, no tints, plate unflipped,
   * gear and helm back, full scale), and parent it. The record must come from the same type + dressing key.
   * @param {object} rec
   */
  attachVisual(rec) {
    for (const k of VISUAL_FIELDS) this[k] = rec.fields[k];
    this.extraProps = { ...rec.extraProps };
    this.poolKey = rec.key;
    const v = this.visual;
    // visibility exactly as dressed (shield, bag, helm); transforms the render path writes back to rest
    if (rec.vis) for (const [o, on] of rec.vis) o.visible = on;
    this._visSnapshot = rec.vis;
    this.helmet = this.helmet ?? this._droppedHelmet ?? null;
    if (this.helmet) this.helmet.visible = true;
    this._droppedHelmet = null;
    v.visible = true; v.rotation.z = 0; v.position.x = this._visBaseX;
    const s = this.def.visualScale ?? 1; v.scale.set(s, s, s);
    this.unflipPlate();
    this.look?.reset();
    this.dress?.setExpression?.(this.def.expression ?? 'neutral');
    if (this.anim) { this.anim.mixer.stopAllAction(); this.anim.current = null; this.anim.currentName = null; this._animKey = ''; }
    this.object3d.add(v);
    this.applyCasting();
    this.ctx.fx?.blobs?.add?.(this.object3d, (this.radius ?? 0.35) * 1.1);
    if (this._pendingClip) { const c = this._pendingClip; this._pendingClip = null; this.playClip(c.name, c).then(c.resolve); }
    this.render(1, 0);
  }

  /** Remember which nodes of the dressed visual are visible (VisualPool restores it on reuse). */
  snapshotVisual() {
    const out = [];
    this.visual?.traverse((o) => { if (o !== this.visual) out.push([o, o.visible]); });
    if (this._droppedHelmet) out.push([this._droppedHelmet, true]);
    this._visSnapshot = out;
    return out;
  }

  dispose() {
    this.disposed = true;
    this.endTelegraph();
    this.releaseToken();
    this._pendingClip?.resolve(); this._pendingClip = null;
    this._finishMove?.(); this._finishFace?.();
    this.ctx.fx?.blobs?.remove?.(this.object3d);
    this.anim?.dispose(); this.anim = null;
    this.head?.dispose?.(); this.head = null; this.dress = null; this.plate = null;
    this.cagedKitten?.dispose?.(); this.cagedKitten = null;
    this._plateSwap?.friend?.dispose?.(); this._plateSwap = null;
    this.def.onDispose?.(this);
    if (this.visual) disposeInstanceMaterials(this.visual);
    super.dispose();
  }
}
