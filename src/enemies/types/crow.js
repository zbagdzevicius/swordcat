// src/enemies/types/crow.js  (owner: enemies) — Crow Raider (GAME_DESIGN §10.2–§10.3; art.md §11).
// Circles its post (r 5 m, 4 m up), then circles her. crow_dive: a `shadow` decal grows under her for 1.0 s and
// TRACKS for the first 0.6 s, then freezes; the crow dives at 12 m/s to the decal centre (r 0.9), and, hit or miss,
// lands and pecks for 1.2 s, when anything can hit it. In the air it is hittable only below 2.2 m (Pounce), by
// projectiles, or while grounded by Sage (`groundFlyer(sec)`). Defeat: the poof (fx bursts the feathers by type), it tumbles down.
import * as THREE from 'three';
import { ENEMIES, ATTACKS } from '../../core/config.js';
import { E } from '../../core/events.js';
import { damp, dampAngle } from '../../core/math.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { TUNING } from '../tuning.js';
import { BASE_STATES, windupFor } from '../Enemy.js';
import { makeProp } from '../props.js';
import { attachAligned, bone, posIn } from '../rig.js';

const def = ENEMIES.crow;
const DIVE = ATTACKS.crow_dive;
/** Multiply over the blue Pigeon atlas (→ near-black feathers) and the violet sheen (art.md §11). */
const CROW_TINT = '#4A4B58';
const CROW_SHEEN = '#120C1E';
/** Gear on the round pigeon body (metres at the 1.2 m wingspan): iron hood on the crown, eye glints on the face. */
const CROW_FACE = { hoodY: 0.36, hoodZ: 0.05, hoodScale: 1.9, eyeY: 0.27, eyeZ: 0.27, eyeScale: 1.5 };
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();

const ground = (e, x = e.pos.x, z = e.pos.z) => e.ctx.physics?.heightAt?.(x, z) ?? 0;
const altitude = (e) => e.pos.y - ground(e);
/**
 * The walkable surface at (x, z) at or below `fromY` (a bridge deck, a cart, a ledge), not the terrain under it:
 * dives aim at her feet and pecks land on the deck, never in the stream below the Old Bridge.
 */
const standAt = (e, x, z, fromY) => {
  const ph = e.ctx.physics;
  return typeof ph?.groundAt === 'function' && Number.isFinite(fromY) ? ph.groundAt(x, z, fromY + 0.3) : ground(e, x, z);
};
/** Where a dive at `p` lands: her standing surface. */
const diveY = (e, p) => standAt(e, p.pos.x, p.pos.z, p.pos.y);

/** Steer in 3D toward (x, y, z) at `speed` (smoothed), with flock separation. Returns the distance left. */
function flyTo(e, x, y, z, speed, dt, rate = 4) {
  _d.set(x - e.pos.x, y - e.pos.y, z - e.pos.z);
  const d = _d.length();
  if (d > 1e-4) _d.multiplyScalar(Math.min(speed, d * 3) / d); else _d.set(0, 0, 0);
  const sep = e.separation(_s);
  e.vel.x = damp(e.vel.x, _d.x + sep.x * speed * 0.5, rate, dt);
  e.vel.y = damp(e.vel.y, _d.y, rate, dt);
  e.vel.z = damp(e.vel.z, _d.z + sep.z * speed * 0.5, rate, dt);
  return d;
}

/** Expected dive time from the hover point (hoverDist out, alt + hoverUp up) to the decal centre at the dive speed. */
export function diveTravel(e, a = DIVE) {
  const C = TUNING.crow;
  return Math.hypot(C.hoverDist, e.def.fly.alt + C.hoverUp) / (a.speed ?? DIVE.speed);
}

/** Circle (cx, cz) at radius r, altitude `alt` above the ground there. */
function circle(e, cx, cz, dt, speed = e.def.fly.speed) {
  const f = e.def.fly, r = f.circleR;
  e.circleA = Math.atan2(e.pos.x - cx, e.pos.z - cz) + e.circleDir * (speed / r) * 0.6;
  const tx = cx + Math.sin(e.circleA) * r, tz = cz + Math.cos(e.circleA) * r;
  flyTo(e, tx, ground(e, tx, tz) + f.alt, tz, speed, dt, 3);
  if (e.vel.x * e.vel.x + e.vel.z * e.vel.z > 0.05) e.facing = dampAngle(e.facing, Math.atan2(e.vel.x, e.vel.z), 6, dt);
}

export default {
  ...def,
  id: 'crow',
  token: 'ranged',
  onScreenOnly: true,                    // CONTROLS_SPEC §8.5: a crow dives only while it is on screen (no near exemption)
  walk: 1.2, run: def.fly.speed * 0.8,
  anims: { ...CLIP_MAPS.pigeon.roles },
  smallHeart: true,
  init(e) {
    const rng = e.ctx.rng;
    e.circleA = rng.angle(); e.circleDir = rng.sign(); e.diveTarget = new THREE.Vector3(); e.grounded = false; e.peckDur = def.peck; e.dived = false;
    // a flock sharing one zone centre (Appendix B.1 `['crow', 4, at, 8]`) spreads its r 5 circles over the patrol radius
    const a = rng.angle(), r = Math.max(0, e.patrolRadius - def.fly.circleR) * Math.sqrt(rng());
    e.circleOff = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
  },

  async build(e, m) {
    const space = m.root, head = bone(m.scene, 'Head'), k = (m.size?.x ?? 1.2) / 1.2;
    if (!head) return;
    // §10.2 / art.md §11: black feathers with a violet sheen. The Pigeon atlas is already blue-violet, so the row's
    // #17181C is reached by a softer multiply (CROW_TINT) plus a faint violet emissive lift; beak and eyes stay legible.
    m.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!mat?.userData?.enemyOwned) continue;
        if (mat.color) mat.color.set(CROW_TINT);
        if (mat.emissive) mat.emissive.set(CROW_SHEEN);
        mat.roughness = 0.55; mat.metalness = 0;
      }
    });
    const hp = posIn(space, head);
    const hood = makeProp('crowHood');
    attachAligned(space, head, hood, { pos: [hp.x, CROW_FACE.hoodY * k, CROW_FACE.hoodZ * k], rot: [-0.25, 0, 0], scale: k * CROW_FACE.hoodScale });
    e.helmet = hood;
    const eyes = makeProp('eyes', { material: 'eyeCrow' });
    attachAligned(space, head, eyes, { pos: [hp.x, CROW_FACE.eyeY * k, CROW_FACE.eyeZ * k], scale: k * CROW_FACE.eyeScale });
  },

  /** §10.3: in the air only projectiles (and Pounce below 2.2 m) connect. */
  resolveIncoming(e, att) {
    if (att?.isProjectile || e.grounded || altitude(e) <= e.def.hittableBelow) return 'hit';
    return 'immune';
  },

  ground(e, sec) {
    if (!e.alive || e.scripted) return;
    e.releaseToken(); e.endTelegraph();
    e.peckDur = sec;
    e.setState('peck');
  },

  render(e, dt) {
    const v = e.visual;
    if (!v) return;
    // gentle bob while airborne
    e.bobT = (e.bobT ?? e.id) + dt;
    v.position.y = e.grounded || e.stateName === 'strike' ? damp(v.position.y, 0, 10, dt) : Math.sin(e.bobT * 3.1) * 0.06;
  },

  states: {
    idle: {
      anim: 'move',
      update(e, dt) {
        if (e.checkWake(dt) || e.sees) return e.alert();
        circle(e, e.home.x + e.circleOff.x, e.home.z + e.circleOff.z, dt, e.def.fly.speed * 0.7);
      },
    },
    patrol: { anim: 'move', update(e) { e.setState('idle'); } },
    alert: {
      anim: 'move',
      enter(e) {
        e.alerted = true;
        e.ctx.bus.emit(E.ENEMY_ALERTED, { enemy: e });
        e.ctx.enemies?.alertNear?.(e.pos, TUNING.groupAlertRadius * 1.5, e);
      },
      update(e, dt) {
        circle(e, e.home.x + e.circleOff.x, e.home.z + e.circleOff.z, dt);
        if (e.stateT >= TUNING.alertDur) e.setState(e.targetActor() ? 'chase' : 'idle');
      },
    },
    chase: {
      anim: 'move',
      enter(e) { e.grounded = false; },
      update(e, dt) {
        const p = e.targetActor();
        if (!p) { e.releaseToken(); return e.setState('return'); }
        if (e.leashBroken()) return e.setState('return');
        const d = e.distToPlayer(), atk = e.pickAttack(d);
        if (atk && d <= atk.range && e.cooldownT <= 0 && altitude(e) > e.def.fly.alt * 0.6 && e.acquireToken(atk.kind)) return e.beginAttack(atk);
        circle(e, p.pos.x, p.pos.z, dt);
      },
      exit(e) { e.attackChoice = null; },
    },
    windup: {
      anim: (e) => ['windup', null],
      enter(e) {
        const a = e.attack?.def ?? DIVE;
        e.windupDur = windupFor(a, e.windupMul());
        e.trackDur = e.windupDur * ((a.track ?? a.windup * 0.6) / a.windup);   // §8.1 shadow tracks the first 60%
        const p = e.targetActor();
        if (p) e.diveTarget.set(p.pos.x, diveY(e, p), p.pos.z); else e.diveTarget.set(e.pos.x, ground(e), e.pos.z);
        // the decal stays up through the dive (ended on landing), so it reaches full size as the beak arrives
        e.telegraph('shadow', { shape: 'shadow', pos: e.diveTarget, dir: e.tellDir, size: a.r ?? 0.9, duration: e.windupDur + diveTravel(e, a) });
      },
      update(e, dt) {
        const p = e.targetActor();
        if (p && e.stateT < e.trackDur) e.diveTarget.set(p.pos.x, diveY(e, p), p.pos.z);
        // hover off to the side and above, beak toward the decal
        _d.set(e.pos.x - e.diveTarget.x, 0, e.pos.z - e.diveTarget.z);
        const dl = _d.length() || 1, hd = TUNING.crow.hoverDist;
        const hx = e.diveTarget.x + (_d.x / dl) * hd, hz = e.diveTarget.z + (_d.z / dl) * hd;
        flyTo(e, hx, ground(e, hx, hz) + e.def.fly.alt + TUNING.crow.hoverUp, hz, e.def.fly.speed, dt, 5);
        e.faceTo(e.diveTarget, dt, 10);
        if (e.stateT >= e.windupDur) e.setState('strike');
      },
    },
    strike: {
      anim: () => ['strike', { speed: 1.5 }],
      enter(e) { e.dashHit = false; },             // the shadow stays (frozen) until the dive lands: ended in peck
      update(e, dt) {
        const a = e.attack?.def ?? DIVE, t = e.diveTarget;
        _d.set(t.x - e.pos.x, t.y - e.pos.y, t.z - e.pos.z);
        const d = _d.length();
        if (d > 1e-4) e.vel.copy(_d).multiplyScalar(Math.min(a.speed, d / Math.max(dt, 1e-4)) / d);
        e.facing = dampAngle(e.facing, Math.atan2(_d.x, _d.z), 12, dt);
        const p = e.targetActor();
        if (!e.dashHit && p) {
          const hx = p.pos.x - e.pos.x, hz = p.pos.z - e.pos.z;
          if (Math.hypot(hx, hz) <= (a.r ?? 0.9) * 0.5 + p.radius && e.pos.y <= p.pos.y + p.height + 0.2 && e.pos.y >= p.pos.y - 0.3) {
            e.dashHit = true; e.ctx.combat.applyHit(e, p, a);
          }
        }
        if (d <= TUNING.crow.landDist || e.pos.y <= standAt(e, e.pos.x, e.pos.z, e.pos.y) + 0.02 || e.stateT > 3) {
          // the dive lands: an r 0.9 impact at the decal centre if the beak missed on the way in
          if (!e.dashHit && p && Math.hypot(p.pos.x - t.x, p.pos.z - t.z) <= (a.r ?? 0.9) + p.radius && p.pos.y <= t.y + 1.0) {
            e.dashHit = true; e.ctx.combat.applyHit(e, p, a);
          }
          e.peckDur = e.def.peck;
          if (e.stateName === 'strike') e.setState('peck');
        }
      },
    },
    peck: {
      anim: () => ['peck', { speed: 1.3 }],
      enter(e) { e.grounded = true; e.endTelegraph(); e.releaseToken(); e.vel.set(0, 0, 0); e.pos.y = standAt(e, e.pos.x, e.pos.z, Math.max(e.pos.y, e.diveTarget.y)); },
      update(e, dt) {
        e.brake(dt, 10); e.vel.y = 0; e.pos.y = standAt(e, e.pos.x, e.pos.z, e.pos.y);
        const p = e.targetActor();
        if (p) e.faceTo(p.pos, dt, 4);
        if (e.stateT >= e.peckDur) e.setState('recover');
      },
    },
    recover: {
      anim: 'move',
      enter(e) { e.grounded = false; },
      update(e, dt) {
        const a = e.attack?.def ?? DIVE;
        const tx = e.pos.x + Math.sin(e.facing) * 2, tz = e.pos.z + Math.cos(e.facing) * 2;
        flyTo(e, tx, ground(e, tx, tz) + e.def.fly.alt, tz, e.def.fly.speed, dt, 3);
        if (e.stateT >= (a.recover ?? 1.2)) e.finishAttack();
      },
    },
    stagger: {
      anim: () => ['hit', { once: true, clampEnd: false, speed: 0.8 }],
      enter(e) { BASE_STATES.stagger.enter(e); },
      update(e, dt) {
        e.staggerT -= dt;
        e.brake(dt, 5);
        if (e.grounded) { e.vel.y = 0; e.pos.y = standAt(e, e.pos.x, e.pos.z, e.pos.y); } else e.vel.y = damp(e.vel.y, -0.8, 4, dt);
        if (e.staggerT <= 0) { e.staggerT = 0; e.attack = null; e.grounded = false; e.setState(e.alive ? (e.targetActor() ? 'chase' : 'return') : 'die'); }
      },
    },
    return: {
      anim: 'move',
      enter(e) { e.releaseToken(); e.alerted = false; e.endTelegraph(); },
      update(e, dt) {
        if (e.stateT > 1.0 && e.sees && e.distToPlayer() < e.def.leash * 0.6) return e.alert();
        const left = flyTo(e, e.home.x, ground(e, e.home.x, e.home.z) + e.def.fly.alt, e.home.z, e.def.fly.speed, dt, 3);
        e.faceVel(dt, 6);
        if (left < 1.5 || e.stateT > 20) { e.hp = e.maxHp; e.setState('idle'); }
      },
    },
    die: {
      anim: () => ['death', { once: true, clampEnd: true }],
      enter(e) {
        BASE_STATES.die.enter(e);          // poof + ENEMY_DIED; fx bursts the crow's feathers by type (art.md §11)
        e.grounded = false;
      },
      update(e, dt) {
        e.brake(dt, 3);
        e.vel.y = damp(e.vel.y, -3, 3, dt);
        if (e.stateT >= e.dieDur()) e.ctx.enemies?.despawn?.(e);
      },
    },
  },
};
