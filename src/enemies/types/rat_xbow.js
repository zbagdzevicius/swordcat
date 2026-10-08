// src/enemies/types/rat_xbow.js  (owner: enemies) — Rat Crossbowman (GAME_DESIGN §10.2–§10.3; art.md §11).
// Keeps 7–11 m away (strafing), aims rat_bolt for 0.8 s with a dotted `aim` line that STOPS TRACKING 0.2 s before
// the shot, fires a reflectable bolt (16 m/s, 18 m), reloads 2.0 s. Hops back 3 m (Rat_Jump) when she gets within
// 3 m (cooldown 3 s). Spawned with a height offset (`{ y: 1.2 }`, a cart or a wall) it is perched: it never leaves
// its spot, it only turns and shoots.
import * as THREE from 'three';
import { ENEMIES, GRAVITY } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { TUNING, rangeOf } from '../tuning.js';
import { windupFor } from '../Enemy.js';
import { dressRat } from './ratGear.js';

const _d = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Muzzle (world) for the current pose, written into `out`. */
function muzzle(e, out) {
  const t = TUNING.xbow;
  return out.set(e.pos.x + Math.sin(e.facing) * t.muzzleFwd, e.pos.y + t.muzzleUp, e.pos.z + Math.cos(e.facing) * t.muzzleFwd);
}

/** Aim at her chest from the muzzle (3D, normalised) → e.aimDir. */
function aimAt(e, p) {
  muzzle(e, e.tellPos);
  _t.set(p.pos.x, p.pos.y + p.height * 0.55, p.pos.z);
  e.aimDir.copy(_t).sub(e.tellPos);
  if (e.aimDir.lengthSq() < 1e-6) e.aimDir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  e.aimDir.normalize();
}

const def = ENEMIES.rat_xbow;

export default {
  ...def,
  id: 'rat_xbow',
  perchable: true,
  scamper: true,
  anims: { ...CLIP_MAPS.rat.roles, rat_bolt: { windup: { clip: 'Rat_Idle', speed: 0.5 }, strike: { clip: 'Rat_Attack', from: 0.35, to: 0.75, speed: 1.2 } } },
  build: (e, m) => dressRat(e, m, { hood: true, crossbow: def.weapon }),
  /** live aim telegraph: muzzle + frozen-after-lock direction */
  tell(e) { muzzle(e, e.tellPos); e.tellDir.copy(e.aimDir); },
  init(e) { e.aimDir = new THREE.Vector3(0, 0, 1); e.strafeT = 0; e.strafeDir = 1; },
  states: {
    chase: {
      anim: 'move',
      update(e, dt) {
        const p = e.targetActor();
        if (!p) { e.releaseToken(); return e.setState('return'); }
        if (e.leashBroken() && !e.perched) return e.setState('return');
        const d = e.distToPlayer(), [near, far] = e.def.keep, hb = e.def.hopBack;
        if (!e.perched && d < hb.within && (e.attackCd.hop ?? 0) <= 0) return e.setState('hop');
        const atk = e.pickAttack(d);
        if (atk && d <= atk.range && e.cooldownT <= 0 && (e.perched || d >= near * 0.5) && e.acquireToken(atk.kind)) return e.beginAttack(atk);
        if (e.perched) e.brake(dt);
        else {
          _d.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z);
          const dl = _d.length() || 1; _d.multiplyScalar(1 / dl);
          if (d < near) e.steerTo(e.pos.x + _d.x * 3, e.pos.z + _d.z * 3, e.def.walk, dt);             // back off
          else if (d > far) e.steerTo(p.pos.x + _d.x * (near + far) * 0.5, p.pos.z + _d.z * (near + far) * 0.5, e.def.run, dt);
          else {                                                                                       // strafe
            e.strafeT -= dt;
            if (e.strafeT <= 0) { e.strafeT = rangeOf(e.ctx.rng, TUNING.xbow.strafe); e.strafeDir = e.ctx.rng.sign(); }
            e.steerTo(e.pos.x - _d.z * e.strafeDir * 2, e.pos.z + _d.x * e.strafeDir * 2, e.def.walk * 0.7, dt);
          }
        }
        e.faceTo(p.pos, dt, TUNING.chaseTurnRate);
      },
      exit(e) { e.attackChoice = null; },
    },
    hop: {
      anim: () => ['hop', { once: true, clampEnd: true, speed: 1.2 }],
      enter(e) {
        e.releaseToken(); e.endTelegraph();
        const p = e.targetActor(), hb = e.def.hopBack;
        if (p) _d.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z); else _d.set(-Math.sin(e.facing), 0, -Math.cos(e.facing));
        if (_d.lengthSq() < 1e-6) _d.set(-Math.sin(e.facing), 0, -Math.cos(e.facing));
        _d.normalize();
        const vy = 4.2, air = (2 * vy) / GRAVITY;
        e.vel.set(_d.x * (hb.dist / air), vy, _d.z * (hb.dist / air));
        e.onGround = false;
        e.attackCd.hop = hb.cooldown;
      },
      update(e, dt) {
        const p = e.targetActor();
        if (p) e.faceTo(p.pos, dt, TUNING.turnRate);
        if (e.stateT > 0.15 && e.onGround) e.brake(dt, 14);
        if (e.stateT >= 0.6) e.setState(p ? 'chase' : 'return');
      },
    },
    windup: {
      anim: (e) => ['windup', { once: true, clampEnd: true, fitDur: e.windupDur }],
      enter(e) {
        e.brakeHard();
        const a = e.attack.def;
        e.windupDur = windupFor(a, e.windupMul());
        e.aimLockAt = Math.max(0, e.windupDur - (a.windup - (a.aimLock ?? a.windup)));   // §8.1: stops tracking 0.2 s before the shot
        const p = e.targetActor();
        if (p) aimAt(e, p); else e.aimDir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
        e.telegraph('aim', { shape: 'line', pos: e.tellPos, dir: e.tellDir, size: a.projectile?.range ?? 18, duration: e.windupDur });
        e.tellDir.copy(e.aimDir);
      },
      update(e, dt) {
        e.brake(dt);
        const p = e.targetActor();
        if (p && e.stateT < e.aimLockAt) { e.faceTo(p.pos, dt, TUNING.windupTurnRate * 2); aimAt(e, p); }
        muzzle(e, e.tellPos); e.tellDir.copy(e.aimDir);
        if (e.stateT >= e.windupDur) e.setState('strike');
      },
    },
    strike: {
      anim: () => ['strike', { once: true, clampEnd: true }],
      enter(e) {
        e.endTelegraph();
        const a = e.attack.def;
        muzzle(e, _t);
        e.ctx.combat.spawnProjectile(a, e, _t.clone(), e.aimDir.clone());
        e.vel.x -= Math.sin(e.facing) * 1.2; e.vel.z -= Math.cos(e.facing) * 1.2;          // recoil
      },
      update(e, dt) { e.brake(dt, 10); if (e.stateT >= 0.3) e.setState('recover'); },
    },
  },
};
