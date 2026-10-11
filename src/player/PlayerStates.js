// src/player/PlayerStates.js  (owner: player) — Swordcat's fixed-step state machine (GAME_DESIGN §7).
// Each state: { enter?(p, arg), update(p, dt), exit?(p) }. Player.setState(name, arg) switches; states mutate
// only simulation fields (vel, facing, swing, timers) and call Player helpers for events and combat.
//
//   move     idle / walk / run / zoomies / jump / fall (+ attacks, Stand, Tumble, Milk, Meow, Golden entry)
//   attack   slash1-3, bright, riposte, holy, sunburst (combo windows, charge-from-recovery, cancels)
//   charge   held ⚔: tiers 0.60 / 1.10 s, walk at 40 %, release → slash3 / bright / holy
//   pounce   air ⚔: 0.12 s hang, 14 m/s dive, pogo on hit, landing ring + 0.25 s recovery
//   guard    the Stand (Vigil): shuffle 1.2 m/s, turn 360°/s; parry / block / break resolved in resolveIncoming
//   dodge    Tumble: 0.40 s, 9 → 4 m/s, i-frames 0.04–0.30, cooldown 0.20
//   hurt     0.35 s stun with knockback        stagger  guard break 0.8 s
//   land     hard landing lockout 0.15 s       sip      Milk Break 0.9 s (heal at 0.5 s)
//   golden   Golden Hour activation 0.8 s      rise     Still Standing slow rise 0.8 s
//   vigil    plant the sword at a Vigil Stone  dead     faint → respawn / game over
//   memecam  Oath pose while the Meme Cam runs scripted  cutscene control (ScriptedActor)
import * as THREE from 'three';
import { PLAYER, ATTACKS, LOOP } from '../core/config.js';
import { damp, dampAngle, clamp, wrapAngle } from '../core/math.js';
import { TUNING } from './tuning.js';

const _wish = new THREE.Vector3();

/** Pounce defs derived from ATTACKS.pounce (combat needs `active`/`dur`; the dive re-sweeps its cone every step). */
export const POUNCE_DIVE = Object.freeze({ ...ATTACKS.pounce, id: 'pounce', active: [0, LOOP.step], dur: LOOP.step });
export const POUNCE_RING = Object.freeze({
  ...ATTACKS.pounce, id: 'pounce', dmg: ATTACKS.pounce.ring.dmg, active: [0, LOOP.step], dur: ATTACKS.pounce.landRecover,
  arc: { range: ATTACKS.pounce.ring.r, from: Math.PI, to: -Math.PI, y0: -0.5, y1: 1.2 },
});

/** Ground speed for a stick magnitude (§7.1: walk ≤ 0.5, run at full stick). */
export function speedForStick(mag) {
  if (mag <= 0.02) return 0;
  const w = TUNING.walkStick;
  if (mag <= w) return (mag / w) * PLAYER.walk;
  return PLAYER.walk + ((mag - w) / (1 - w)) * (PLAYER.run - PLAYER.walk);
}

/**
 * Steer horizontal velocity toward the stick (camera-relative) at up to `maxSpeed`, and turn toward it.
 * @param {import('./Player.js').Player} p
 * @param {number} dt
 * @param {{max?:number, boost?:number, turn?:'damp'|'rate'|'none', rate?:number, face?:boolean, decel?:number}} [o]
 *   max: speed cap; boost: full-stick top speed above the run (Zoomies 7.2 m/s)
 */
export function locomote(p, dt, o = {}) {
  const mag = p.wishDir(_wish);
  let speed = speedForStick(mag);
  if (o.boost != null && mag > TUNING.walkStick) speed = Math.max(speed, o.boost * mag);
  if (o.max != null) speed = Math.min(speed, o.max);
  speed *= p.speedMul;
  let lambda;
  if (p.onGround) lambda = mag > 0.05 ? PLAYER.accelDamp : (o.decel ?? PLAYER.decelDamp);
  else { lambda = PLAYER.airDamp; speed = Math.min(speed, PLAYER.airMax * p.speedMul); }
  p.vel.x = damp(p.vel.x, _wish.x * speed, lambda, dt);
  p.vel.z = damp(p.vel.z, _wish.z * speed, lambda, dt);
  const turn = o.turn ?? 'damp';
  const lock = p.lockTarget();
  if (o.face && lock) {
    const yaw = Math.atan2(lock.pos.x - p.pos.x, lock.pos.z - p.pos.z);
    p.facing = turn === 'rate' ? approachAngle(p.facing, yaw, (o.rate ?? PLAYER.guard.turnRate) * dt) : dampAngle(p.facing, yaw, PLAYER.turnDamp, dt);
  } else if (mag > 0.05 && turn !== 'none') {
    const yaw = Math.atan2(_wish.x, _wish.z);
    p.facing = turn === 'rate' ? approachAngle(p.facing, yaw, (o.rate ?? PLAYER.guard.turnRate) * dt) : dampAngle(p.facing, yaw, PLAYER.turnDamp, dt);
  }
  return mag;
}

/** Rotate `a` toward `b` by at most `step` radians (shortest arc). */
export function approachAngle(a, b, step) {
  const d = wrapAngle(b - a);
  return Math.abs(d) <= step ? a + d : a + Math.sign(d) * step;
}

/** Brake horizontal velocity. */
function brake(p, dt, lambda = PLAYER.decelDamp) {
  p.vel.x = damp(p.vel.x, 0, lambda, dt);
  p.vel.z = damp(p.vel.z, 0, lambda, dt);
}

/** Common "start something" checks from move / recovery windows. Returns true if it switched state. */
function tryActions(p, { allowAttack = true, allowGuard = true, allowDodge = true, allowJump = true, allowSip = true } = {}) {
  if (p.tryGolden()) return true;
  if (allowDodge && p.dodgeBuf > 0 && p.canDodge()) { p.startDodge(); return true; }
  if (allowGuard && p.wantGuard() && p.onGround) { p.setState('guard'); return true; }
  if (allowAttack && p.attackBuf > 0) {
    if (p.onGround) { p.startGroundAttack(); return true; }
    if (p.pounceReady) { p.setState('pounce'); return true; }
  }
  if (allowJump && p.jumpBuf > 0 && (p.onGround || p.coyoteT > 0)) { p.doJump(); return false; }
  if (allowSip && p.milkPressed && p.canSip()) { p.setState('sip'); return true; }
  return false;
}

export const STATES = {
  // ------------------------------------------------------------------ locomotion
  move: {
    enter(p) { p.swing = null; },
    update(p, dt) {
      if (tryActions(p)) return;
      // a charge can also start from neutral (button held through a cancelled swing)
      if (p.onGround && p.chargeHeld() && p.attackHeldTime() >= PLAYER.charge.start) { p.setState('charge'); return; }
      const mag = locomote(p, dt, { boost: p.zoomies ? PLAYER.zoomies : undefined });
      p.updateZoomies(dt, mag);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      p.stateName = !p.onGround ? (p.vel.y > 0 ? 'jump' : 'fall') : p.zoomies ? 'zoomies' : sp > 3.5 ? 'run' : sp > 0.3 ? 'walk' : 'idle';
    },
  },

  // ------------------------------------------------------------------ swings
  attack: {
    enter(p) { p.stateName = p.swing?.def.id === 'holy' ? 'holy' : 'attack'; },
    update(p, dt) {
      const s = p.swing;
      if (!s) { p.setState('move'); return; }
      const def = s.def, act = def.active ?? [0, def.dur ?? 0.4];
      const tPrev = s.t;
      if (tPrev <= act[0] && tPrev + dt > act[0]) p.onActiveStart(s);
      p.ctx.combat.updateSwing(s, dt);
      // lunge: forward push from just before the active window to its end, then brake
      const lunging = s.t >= act[0] * 0.5 && s.t <= act[1];
      const lunge = lunging ? (s.lungeOverride ?? def.lunge ?? 0) * p.speedMul : 0;
      p.vel.x = damp(p.vel.x, Math.sin(p.facing) * lunge, TUNING.lungeDamp, dt);
      p.vel.z = damp(p.vel.z, Math.cos(p.facing) * lunge, TUNING.lungeDamp, dt);
      const recovering = s.t >= act[1];
      const preActive = s.t < act[0];
      // CONTROLS_SPEC §8.4: a new move order cancels a swing in its wind-up (no damage, combo resets), waits through the
      // active frames, and applies in recovery from active[1] + 0.05 s; WASD / the stick cut the recovery from there too
      const lateRecovery = s.t >= act[1] + 0.05 && !def.noCancel && def.id !== 'holy' && def.id !== 'sunburst';
      if (p.orders?.pendingSwingCancel && (preActive || lateRecovery) && !s.queued) {
        p.orders.pendingSwingCancel = false; p.endSwing(); p.comboNext = null; p.setState('move'); return;
      }
      if (lateRecovery && !s.queued && p.ctx.cam?.isIso && Math.hypot(p.ctx.input.move.x, p.ctx.input.move.y) >= 0.15 && p.attackBuf <= 0) {
        p.endSwing(); p.noteComboEnd(def); p.setState('move'); return;
      }
      // combo: a (buffered) press inside the window QUEUES the next swing; it starts when this one's recovery ends
      // (def.dur), so every slash sweeps its full arc and Snip–Snap–Swoosh keeps the designed ≈1.4 s rhythm (§7.2).
      // Touch auto-combo (§14.4): a tap anywhere in the swing queues the next hit (no need to hit combo[0]).
      const comboFrom = p.autoCombo() ? 0 : def.combo?.[0];
      if (def.next && def.combo && p.attackBuf > 0 && s.t >= comboFrom && s.t <= def.combo[1]) { s.queued = true; p.attackBuf = 0; }
      if (s.queued && s.t >= Math.max(def.dur ?? act[1], act[1])) { p.startAttack(def.next); return; }
      // cancels: Golden Hour any time before the active frames; Stand before/after them; Tumble / charge after.
      // A Stand already held when the swing started (⚔ out of the Stand, a Riposte, Auto-Stand) never cancels it:
      // only a fresh Stand press does (requests/combat.md); she drops back into the Stand when the swing ends.
      if (preActive && p.tryGolden()) return;
      const wantGuard = p.wantGuard();
      if (!wantGuard) p.swingGuardLatch = false;
      if ((preActive || recovering) && wantGuard && !p.swingGuardLatch && p.onGround && !def.noCancel) { p.endSwing(); p.setState('guard'); return; }
      const rollFrom = def.rollCancel ?? act[1];
      if (s.t >= rollFrom && p.dodgeBuf > 0 && p.canDodge() && !def.noCancel) { p.endSwing(); p.startDodge(); return; }
      // jump out of the recovery (after the active frames), so movement never feels glued to a swing
      if (recovering && !def.noCancel && def.id !== 'holy' && p.jumpBuf > 0 && p.onGround) { p.endSwing(); p.setState('move'); p.doJump(); return; }
      if (recovering && !def.noCancel && def.id !== 'holy' && p.chargeHeld() && p.attackHeldTime() >= PLAYER.charge.start && p.onGround) {
        p.endSwing(); p.setState('charge'); return;
      }
      if (s.t >= (def.dur ?? act[1])) { p.endSwing(); p.noteComboEnd(def); p.setState('move'); }
    },
    exit(p) { p.stateName = 'idle'; },
  },

  // ------------------------------------------------------------------ charge (§7.2 Charge rules)
  charge: {
    enter(p) { p.chargeT = Math.max(PLAYER.charge.start, p.attackHeldTime()); p.chargeTier = 0; p.charge = 0; p.chargeFizzled = false; p.stateName = 'charge'; p.emitCharge(0); },
    update(p, dt) {
      const C = PLAYER.charge;
      if (p.tryGolden()) return;
      if (p.wantGuard()) { p.cancelCharge(); p.setState('guard'); return; }
      if (p.dodgeBuf > 0 && p.canDodge()) { p.cancelCharge(); p.startDodge(); return; }
      if (!p.onGround) { p.cancelCharge(); p.setState('move'); return; }
      p.chargeT += dt;
      const t2 = p.tier2Time();
      const tier = p.chargeT >= t2 && p.canHoly() ? 2 : p.chargeT >= p.tier1Time() ? 1 : 0;
      if (p.chargeT >= t2 && !p.canHoly() && !p.chargeFizzled) { p.chargeFizzled = true; p.emitCharge(0.5, true); }
      if (tier !== p.chargeTier) { p.chargeTier = tier; p.emitCharge(tier / 2); }
      p.charge = clamp((p.chargeT - C.start) / (t2 - C.start), 0, 1);
      const turned = p.aimTurn?.(dt, 'charge');               // §6.2: she turns to the cursor / drag / RS at 540°/s
      locomote(p, dt, { max: PLAYER.run * C.moveMul, face: !turned, turn: turned ? 'none' : 'damp' });
      if (!p.chargeHeld()) {
        const id = p.chargeTier >= 2 ? 'holy' : p.chargeTier >= 1 ? 'bright' : 'slash3';
        p.clearCharge();
        p.startAttack(id);
      }
    },
    exit(p, next) { if (next === 'attack') p.clearCharge(); else p.cancelCharge(); },
  },

  // ------------------------------------------------------------------ pounce (§7.2)
  pounce: {
    enter(p) {
      p.pounceReady = false; p.pouncePhase = 'hang'; p.stateName = 'pounce';
      p.vel.set(p.vel.x * 0.3, 0, p.vel.z * 0.3);
      p.gravityMul = 0;
      p.swing = p.ctx.combat.beginSwing(p, POUNCE_DIVE);
      p.applySwingOpts(p.swing);
      p.emitSwing('pounce', 0);
    },
    update(p, dt) {
      const A = ATTACKS.pounce;
      if (p.pouncePhase === 'hang') {
        p.vel.y = 0; brake(p, dt, 8);
        if (p.stateT >= A.hang) {
          p.pouncePhase = 'dive';
          if (p.ctx.cam?.isIso) p.faceAim?.('pounce', ATTACKS.pounce.arc.range);   // §6.2: Pounce toward the cursor
          p.aimAssist();
        }
        return;
      }
      if (p.pouncePhase === 'dive') {
        p.vel.y = -A.diveSpeed;
        p.vel.x = damp(p.vel.x, Math.sin(p.facing) * 2, 6, dt); p.vel.z = damp(p.vel.z, Math.cos(p.facing) * 2, 6, dt);
        const s = p.swing;
        s.t = 0;                                         // re-sweep the whole ±0.9 cone every step
        const hits = p.ctx.combat.updateSwing(s, dt);
        if (hits > 0) {                                  // pogo: bounce up, Pounce refreshes (chain crows)
          p.vel.y = A.pogoV; p.gravityMul = 1; p.pounceReady = true; p.onGround = false;
          p.endSwing(); p.squashEvent = 'pogo'; p.setState('move'); return;
        }
        if (p.onGround) {
          p.pouncePhase = 'land'; p.gravityMul = 1;
          p.swing = p.ctx.combat.beginSwing(p, POUNCE_RING); p.applySwingOpts(p.swing);
          p.ctx.combat.updateSwing(p.swing, dt);
          p.landT = 0;
        }
        return;
      }
      // landing ring recovery
      p.landT += dt; brake(p, dt, 20);
      if (p.swing) p.ctx.combat.updateSwing(p.swing, dt);
      if (p.landT >= A.landRecover) { p.endSwing(); p.setState('move'); }
    },
    exit(p) { p.gravityMul = 1; if (p.swing?.def === POUNCE_DIVE || p.swing?.def === POUNCE_RING) p.endSwing(); },
  },

  // ------------------------------------------------------------------ the Stand (§7.3)
  guard: {
    enter(p) { p.startGuard(); p.stateName = 'guard'; },
    update(p, dt) {
      if (p.tryGolden()) return;
      if (!p.wantGuard() || !p.onGround) { p.setState('move'); return; }
      if (p.dodgeBuf > 0 && p.canDodge()) { p.startDodge(); return; }
      if (p.attackBuf > 0) { p.startGroundAttack(); return; }          // Riposte after a parry, else a slash out of the Stand
      if (p.pushT > 0) {                                  // block pushback carries, then the Stand brakes again
        p.vel.x = damp(p.vel.x, 0, TUNING.blockPushDamp, dt); p.vel.z = damp(p.vel.z, 0, TUNING.blockPushDamp, dt);
      } else {
        const turned = p.aimTurn?.(dt, 'guard');              // §8.1: cursor / threat / RS facing; the stick strafes
        locomote(p, dt, { max: PLAYER.guard.move, turn: turned ? 'none' : 'rate', rate: PLAYER.guard.turnRate, face: !turned });
      }
    },
    exit(p) { p.stopGuard(); },
  },

  // ------------------------------------------------------------------ Tumble (§7.3)
  dodge: {
    enter(p) { p.stateName = 'dodge'; p.guardState.dodging = true; p.guardState.dodgeT = 0; p.dodgeRewarded = false; },
    update(p, dt) {
      const d = PLAYER.dodge;
      p.guardState.dodgeT += dt;
      const u = Math.min(1, p.guardState.dodgeT / d.dur), sp = (d.v0 + (d.v1 - d.v0) * u) * p.speedMul;
      p.vel.x = p.dodgeDir.x * sp; p.vel.z = p.dodgeDir.z * sp;
      if (p.guardState.dodgeT >= d.dur) {
        p.dodgeCd = d.cooldown;
        p.setState('move');
        if (p.attackBuf > 0 && p.onGround) p.startGroundAttack();
      }
    },
    exit(p) { p.guardState.dodging = false; },
  },

  // ------------------------------------------------------------------ hurt / guard break / hard landing
  hurt: {
    enter(p, mul = 1) { p.stateName = 'hurt'; p.hurtDur = PLAYER.hurt.stun * mul; },
    update(p, dt) {
      brake(p, dt, TUNING.hurtDamp);
      if (p.stateT >= p.hurtDur) p.setState('move');
    },
  },
  stagger: {
    enter(p) { p.stateName = 'stagger'; },
    update(p, dt) {
      brake(p, dt, TUNING.hurtDamp);
      if (p.stateT >= PLAYER.guard.breakStagger) p.setState('move');
    },
  },
  land: {
    enter(p) { p.stateName = 'land'; },
    update(p, dt) {
      brake(p, dt, PLAYER.decelDamp);
      if (p.stateT >= PLAYER.hardLandLock) p.setState('move');
    },
  },

  // ------------------------------------------------------------------ Milk Break (§7.6)
  sip: {
    enter(p) { p.startSip(); p.stateName = 'sip'; },
    update(p, dt) {
      const M = PLAYER.milk;
      locomote(p, dt, { max: M.moveCap });
      if (!p.sipHealed && p.stateT >= M.healAt) p.sipHeal();
      if (!p.sipHealed && p.dodgeBuf > 0 && p.canDodge()) { p.cancelSip(); p.startDodge(); return; }
      if (p.stateT >= M.sip) p.setState('move');
    },
    exit(p) { if (!p.sipHealed) p.cancelSip(); p.sipActive = false; },
  },

  // ------------------------------------------------------------------ Golden Hour activation (§7.5)
  golden: {
    enter(p) { p.stateName = 'goldenHour'; },
    update(p, dt) {
      brake(p, dt, 12);
      if (p.stateT >= PLAYER.golden.activate) p.finishGoldenActivation();
    },
  },

  // ------------------------------------------------------------------ Still Standing rise (§7.6)
  rise: {
    enter(p) { p.stateName = 'stillStanding'; },
    update(p, dt) {
      brake(p, dt, TUNING.hurtDamp);
      if (p.stateT >= PLAYER.stillStanding.riseDur) p.setState('move');
    },
  },

  // ------------------------------------------------------------------ Vigil Stone plant (§7.6)
  vigil: {
    enter(p) { p.stateName = 'vigil'; },
    update(p, dt) {
      brake(p, dt, 20);
      if (p.stateT >= TUNING.vigilPlant) p.setState('move');
    },
  },

  // ------------------------------------------------------------------ faint (§7.6 Nine Lives)
  dead: {
    enter(p) { p.stateName = 'dead'; p.swing = null; },
    update(p, dt) {
      brake(p, dt, 8);
      if (p.stateT >= TUNING.faintDur && !p.livesState.gameOver) p.respawn();
    },
  },

  // ------------------------------------------------------------------ Meme Cam (§7.8)
  memecam: {
    enter(p) { p.stateName = 'memecam'; },
    update(p, dt) {
      brake(p, dt, 20);
      if (!p.memeCamTrigger.active) p.setState('move');
    },
  },

  // ------------------------------------------------------------------ cutscenes (ScriptedActor)
  scripted: {
    enter(p) { p.stateName = 'idle'; },
    update(p) {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      p.stateName = sp > 3.5 ? 'run' : sp > 0.3 ? 'walk' : 'idle';
    },
  },
};

export const STATE_NAMES = Object.freeze(Object.keys(STATES));
