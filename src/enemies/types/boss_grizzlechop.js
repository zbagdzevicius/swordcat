// src/enemies/types/boss_grizzlechop.js  (owner: enemies) — B1 Captain Grizzlechop (GAME_DESIGN §11.2), forest Cheese Mill.
// Rat.glb fitted to 1.6 m with a feathered captain's hat, a cheese-wheel shield (r 0.45, #E8C35A) on the left fore
// paw and a sabre (Sword_B) in the right. HP 450, poise 12, Dizzy max 100. Arena: mill yard r 12 with 6 millstone
// pillars (r 0.8) at radius 8 (level anchors `pillar_0..5` when the level has them, else the §11.2 ring around the
// arena centre, 30° off north so the mill deck stays clear).
//   P1 "En Garde" (100–60%)   Sabre Flurry: 3 hits, windups 0.55 / 0.30 / 0.30, damage 1 / 1 / 2, range 2.0; the 3rd
//                             is a GOLD glint (parry → Dizzy full). Cheese Wheel Toss: shield up 0.8 s (white glint),
//                             a 0.9 m wheel rolls at 7 m/s, bounces off the arena wall once, 2 damage; parrying the
//                             wheel breaks it ("My WHEEL!") and staggers him 3.0 s. At 80%: 2 rat_pike.
//   P2 "Wheel Ride" (60–25%)  opens with the ride: he jumps onto the giant wheel; 3 charge laps, each lane (3 m wide,
//                             ≤ 24 m) drawn as an `aoe` lane filling over 1.0 s (+ the red "!!"), then a 9 m/s charge
//                             for 2 damage (unblockable). A lane ending at a pillar: CRUNCH — the wheel cracks, he
//                             tumbles off, Dizzy fills. Otherwise he wobbles 2.0 s (hits ×1.5) after lap 3. Every 12 s,
//                             Sabre Flurries in between. At phase start: 2 rat_xbow on the mill deck (y 2.0).
//   P3 "Cheese Rage" (< 25%)  windups ×0.8. Cheese Bombs: 5 circles r 1.6 around her, 1.0 s fill, 1 damage each.
//                             Snack: eats a wedge over 0.8 s, heals 30, once per 15 s; a hit during it chokes him
//                             ("hrk— wrong pipe!") and fills Dizzy.
//   Defeat → boss:defeated (story plays CS-05); +100 fish (the row's `fish`).
import * as THREE from 'three';
import { BOSSES, GRAVITY } from '../../core/config.js';
import { E } from '../../core/events.js';
import { damp, dampAngle, wrapAngle } from '../../core/math.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { TUNING, M2 } from '../tuning.js';
import { windupFor } from '../Enemy.js';
import { bossDef } from '../bossBase.js';
import { laneTo, minLead } from '../moves.js';
import { makeProp } from '../props.js';
import { attachAligned, bone, posIn } from '../rig.js';
import { dressRat, ratBody } from './ratGear.js';

const B = BOSSES.grizzlechop;
const P2 = B.phases[1], P3 = B.phases[2];
const WHEEL = P2.wheel, SNACK = P3.snack;
const BODY = ratBody(2);
/** §11.2 ranges are from the rat's front (his 1.6 m quadruped body puts his snout ~1.2 m ahead of his centre). */
const REACH = BODY.front * 0.5;
const BM = M2.boss;
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();

const TOSS = Object.freeze({ id: 'grizz_cheeseToss', telegraph: 'parry', windup: 0.8, dmg: 2, knock: 6, poise: 3, recover: 0.9 });
const LAP = Object.freeze({ id: 'grizz_wheelCharge', telegraph: 'red', unblockable: true, dmg: 2, knock: 8, poise: 4 });
const BOMB = Object.freeze({ id: 'grizz_cheeseBomb', telegraph: 'aoe', dmg: 1, knock: 3, poise: 1, r: 1.6 });

/** The 6 millstone pillars: the level's anchors `mill_pillar_<i>` (forest), else the §11.2 ring around `centre`. */
export function millPillars(ctx, centre, P = B.pillars) {
  const out = [];
  for (let i = 0; i < P.n; i++) {
    const a = ctx?.levels?.anchor?.(`mill_pillar_${i}`) ?? ctx?.levels?.anchor?.(`pillar_${i}`);
    if (a?.pos && Math.hypot(a.pos.x - centre.x, a.pos.z - centre.z) < B.arenaR + 2) out.push({ x: a.pos.x, z: a.pos.z, r: P.radius });
  }
  if (out.length === P.n) return out;
  out.length = 0;
  for (let i = 0; i < P.n; i++) {
    const ang = Math.PI / P.n + (i / P.n) * Math.PI * 2;
    out.push({ x: centre.x + Math.sin(ang) * P.r, z: centre.z + Math.cos(ang) * P.r, r: P.radius });
  }
  return out;
}

/** Arena centre (the boss spawns at it; the home never moves). */
const centre = (e) => e.home;

/** A charge lane from the boss toward her: { len, pillar, dx, dz }. */
export function wheelLane(e, target, pillars = e.pillars) {
  _d.set(target.x - e.pos.x, 0, target.z - e.pos.z);
  if (_d.lengthSq() < 1e-6) _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  _d.normalize();
  const c = centre(e);
  const { len, pillar } = laneTo(e.pos.x, e.pos.z, _d.x, _d.z, {
    pillars, pad: e.radius * 0.6, arena: { cx: c.x, cz: c.z, r: B.arenaR }, edgePad: BM.wheelArenaPad, max: 2 * B.arenaR,
  });
  return { len, pillar, dx: _d.x, dz: _d.z };
}

// ------------------------------------------------------------------ the tossed cheese wheel (a contact "attacker")
class TossWheel {
  constructor(e, pos, dir) {
    this.owner = e; this.ctx = e.ctx;
    this.pos = pos.clone(); this.vel = dir.clone().multiplyScalar(BM.tossSpeed);
    this.radius = BM.tossR; this.height = BM.tossR * 2; this.faction = 'enemy'; this.facing = Math.atan2(dir.x, dir.z);
    this.alive = true; this.bounced = false; this.t = 0; this.hitDone = false;
    this.mesh = makeProp('cheeseWheel');
    this.mesh.scale.set(BM.tossR * 0.55, BM.tossR, BM.tossR);
    this.mesh.castShadow = true;
    e.ctx.scene?.add(this.mesh);
    this._place();
  }
  _place() {
    const m = this.mesh;
    m.position.set(this.pos.x, this.pos.y + this.radius, this.pos.z);
    m.rotation.set(0, this.facing, 0);
    m.rotateX(this.t * BM.tossSpeed / this.radius);
  }
  /** Combat: she parried it → it breaks; he staggers (the §11.2 lesson). */
  onParried() {
    const e = this.owner;
    this.shatter(true);
    if (e.alive) { e.bark(e.ctx.strings?.has?.('grizzlechop.cheese') ? 'grizzlechop.cheese' : 'grizzlechop.wheel'); e.stagger(3.0); e.wobbleT = 3.0; }
  }
  onBlocked() { this.shatter(false); }
  shatter(big) {
    if (!this.alive) return;
    this.alive = false;
    this.ctx.bus.emit(E.BURST, { kind: big ? 'shatter' : 'dust', position: this.mesh.position.clone(), count: big ? 14 : 8, color: '#E8C35A' });
    this.mesh.removeFromParent();
  }
  update(dt) {
    if (!this.alive) return;
    const e = this.owner, ctx = this.ctx;
    this.t += dt;
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = ctx.physics?.groundAt?.(this.pos.x, this.pos.z, this.pos.y + 0.5) ?? ctx.physics?.heightAt?.(this.pos.x, this.pos.z) ?? this.pos.y;
    // the arena wall (and a pillar) bounce it once; the second contact smashes it
    const c = centre(e), dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz);
    let nx = 0, nz = 0, hit = false;
    if (d > B.arenaR - this.radius) { nx = -dx / d; nz = -dz / d; hit = true; }
    for (const p of e.pillars ?? []) {
      const px = this.pos.x - p.x, pz = this.pos.z - p.z, pd = Math.hypot(px, pz);
      if (pd < p.r + this.radius) { nx = px / pd; nz = pz / pd; hit = true; break; }
    }
    if (hit) {
      if (this.bounced) { this.shatter(false); return; }
      this.bounced = true;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) { this.vel.x -= 2 * vn * nx; this.vel.z -= 2 * vn * nz; }
      this.pos.x += nx * 0.1; this.pos.z += nz * 0.1;
      this.facing = Math.atan2(this.vel.x, this.vel.z);
      ctx.bus.emit(E.BURST, { kind: 'dust', position: this.pos.clone(), count: 5 });
    }
    const p = ctx.player;
    if (!this.hitDone && p?.alive && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) <= this.radius + (p.radius ?? 0.3)
        && p.pos.y < this.pos.y + this.height && p.pos.y + (p.height ?? 1) > this.pos.y) {
      this.hitDone = true;
      const r = ctx.combat?.applyHit?.(this, p, TOSS);
      if (r === 'none') this.hitDone = false;               // her i-frames: it may still catch her
    }
    if (this.t >= BM.tossLife) this.shatter(false);
    if (this.alive) this._place();
  }
  dispose() { this.alive = false; this.mesh.removeFromParent(); }
}

// ------------------------------------------------------------------ states
const TOSS_STATE = {
  attacking: true,
  anim: (e) => (e.stateT < e.windupDur ? ['windup', { once: true, clampEnd: true, fitDur: e.windupDur }] : ['strike', { once: true, clampEnd: true }]),
  enter(e) {
    e.brakeHard();
    e.windupDur = windupFor(TOSS, e.windupMul());
    e.telegraph('parry', { duration: e.windupDur });
    e.tossed = false;
  },
  update(e, dt) {
    e.brake(dt);
    const p = e.targetActor();
    if (!e.tossed) {
      if (p && e.stateT < e.windupDur - TUNING.windupTrackStop) e.faceTo(p.pos, dt, TUNING.windupTurnRate);
      if (e.stateT >= e.windupDur) {
        e.endTelegraph();
        e.tossed = true;
        _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
        _v.set(e.pos.x + _d.x * (BODY.front + 0.4), e.pos.y, e.pos.z + _d.z * (BODY.front + 0.4));
        (e.wheels ??= []).push(new TossWheel(e, _v, _d));
        e.ctx.audio?.play3D?.('grizzleRoar', e);
      }
      return;
    }
    if (e.stateT >= e.windupDur + 0.35) { e.attack = { id: 'cheeseToss', def: TOSS, range: 12, kind: 'melee' }; e.setState('recover'); }
  },
};

function mount(e, on) {
  e.mounted = on;
  if (on && !e.rideWheel && e.ctx.scene) {
    const w = makeProp('cheeseWheel');
    w.name = 'grizzle-ride-wheel';
    w.scale.set(0.3, 0.8, 0.8);                               // width 0.6, r 0.8 (§11.2)
    w.position.y = 0.8;
    w.castShadow = true;
    e.rideWheel = w;
    e.object3d.add(w);
  }
  if (e.rideWheel) e.rideWheel.visible = on;
  e.rideLift = on ? BM.wheelRideY : 0;
}

const RIDE = {
  attacking: true,
  noStagger: false,
  anim: (e) => (e.ridePhase === 'charge' ? ['run', { loop: true, speed: 1.4 }] : ['idle', null]),
  enter(e) {
    e.brakeHard();
    e.ridePhase = 'mount'; e.rideT = 0; e.rideLap = 0; e.rideLane = null;
    e.vel.y = (GRAVITY * BM.wheelMount) / 2; e.onGround = false;   // hop up
    e.ctx.bus.emit(E.BURST, { kind: 'dust', position: e.pos.clone(), count: 8 });
  },
  update(e, dt) {
    e.rideT += dt;
    const p = e.targetActor();
    switch (e.ridePhase) {
      case 'mount':
        e.brake(dt);
        if (e.rideT >= BM.wheelMount * 0.5 && !e.mounted) mount(e, true);
        if (e.rideT >= BM.wheelMount) aimLap(e, p);
        break;
      case 'aim':
        e.brake(dt, 12);
        // the lane is fixed once drawn (a fair dodge); he turns along it
        e.facing = dampAngle(e.facing, Math.atan2(e.rideLane.dx, e.rideLane.dz), 10, dt);
        if (e.rideT >= e.rideTele) {
          e.endTelegraph();
          e.ridePhase = 'charge'; e.rideT = 0; e.rideFrom = e.pos.clone(); e.lapHit = false;
          e.ctx.bus.emit(E.SHAKE, { trauma: 0.12 });
        }
        break;
      case 'charge': {
        const L = e.rideLane, sp = WHEEL.speed;
        e.vel.x = L.dx * sp; e.vel.z = L.dz * sp;
        e.facing = Math.atan2(L.dx, L.dz);
        if (e.rideWheel) e.rideWheel.rotation.x += (sp / 0.8) * dt;
        if (!e.lapHit && p?.alive && Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) <= BM.wheelContact + (p.radius ?? 0.3) + BODY.front * 0.4) {
          const r = e.ctx.combat?.applyHit?.(e, p, LAP);
          if (r && r !== 'none') e.lapHit = true;
        }
        if ((e.rideDustT = (e.rideDustT ?? 0) - dt) <= 0) { e.rideDustT = 0.12; e.ctx.bus.emit(E.BURST, { kind: 'dust', position: e.pos.clone(), count: 2 }); }
        const went = Math.hypot(e.pos.x - e.rideFrom.x, e.pos.z - e.rideFrom.z);
        const stalled = e.rideT > L.len / sp + 0.6;
        if (went >= L.len - 0.05 || stalled) {
          e.brakeHard();
          if (L.pillar && (went >= L.len - 0.6 || stalled)) return crunch(e, L.pillar);
          e.rideLap++;
          if (e.rideLap >= WHEEL.laps) return endRide(e, false);
          e.ridePhase = 'gap'; e.rideT = 0;
        }
        break;
      }
      case 'gap':
        e.brake(dt, 10);
        if (p) e.faceTo(p.pos, dt, 6);
        if (e.rideT >= BM.wheelLapGap) aimLap(e, p);
        break;
      default: break;
    }
  },
  exit(e) {
    if (e.mounted) mount(e, false);
    e.endTelegraph();
  },
};

function aimLap(e, p) {
  const tgt = p?.pos ?? _v.set(e.pos.x + Math.sin(e.facing), 0, e.pos.z + Math.cos(e.facing));
  const L = wheelLane(e, tgt);
  e.rideLane = L;
  e.ridePhase = 'aim'; e.rideT = 0;
  e.rideTele = Math.max(minLead('aoe'), WHEEL.tele * e.windupMul());
  const pos = e.pos.clone(), dir = new THREE.Vector3(L.dx, 0, L.dz);
  // the "!!" on him; the lane rides in the payload too (CONTROLS_SPEC §8.2/§12: a red lane wedge from above)
  e.telegraph('red', { duration: e.rideTele, attackId: LAP.id, attackDef: LAP, lane: { w: WHEEL.laneW, l: Math.max(1, L.len), dir: dir.clone() }, range: Math.max(1, L.len) });
  e.telegraphExtra('aoe', { shape: 'lane', pos, dir, w: WHEEL.laneW, l: Math.max(1, L.len), size: [WHEEL.laneW, Math.max(1, L.len)], duration: e.rideTele, follow: false });
}

/** §11.2 lesson: the lane ended at a millstone — the wheel cracks, he tumbles off, Dizzy fills. */
function crunch(e, pillar) {
  e.ctx.bus.emit(E.BURST, { kind: 'shatter', position: new THREE.Vector3(pillar.x, e.pos.y + 1, pillar.z), count: 16, color: '#E8C35A' });
  e.ctx.bus.emit(E.BURST, { kind: 'rocks', position: new THREE.Vector3(pillar.x, e.pos.y + 1.2, pillar.z), count: 8 });
  e.ctx.bus.emit(E.SHAKE, { trauma: 0.45 });
  e.ctx.audio?.play3D?.('grizzleMonster', e);
  e.bark('grizzlechop.wheel');
  e.attackCd.wheelRide = WHEEL.every;
  mount(e, false);
  e.vel.set(-e.rideLane.dx * 2.5, 3.5, -e.rideLane.dz * 2.5); e.onGround = false;   // tumbles off backwards
  e.attack = null;
  e.fillDizzy();
  if (!e.isDizzy) e.setState('chase');
}

function endRide(e) {
  e.attackCd.wheelRide = WHEEL.every;
  mount(e, false);
  e.attack = null;
  e.wobble(WHEEL.dizzyAfter, BM.critBoost);                  // dizzy 2.0 s, hits ×1.5
}

const BOMBS = {
  attacking: true,
  anim: (e) => (e.stateT < 0.35 ? ['windup', { once: true, clampEnd: true, fitDur: 0.35 }] : ['strike', { once: true, clampEnd: true }]),
  enter(e) {
    e.brakeHard();
    const p = e.targetActor(), rng = e.ctx.rng;
    const at = p?.pos ?? e.pos;
    const n = 5, fill = Math.max(minLead('aoe'), 1.0 * e.windupMul());
    e.bombs = [];
    const a0 = rng.angle();
    for (let i = 0; i < n; i++) {
      const pos = i === 0 ? at.clone() : new THREE.Vector3(at.x + Math.sin(a0 + i * 1.5708) * BM.bombSpread, at.y, at.z + Math.cos(a0 + i * 1.5708) * BM.bombSpread);
      pos.y = e.ctx.physics?.groundAt?.(pos.x, pos.z, at.y + 0.5) ?? pos.y;
      const id = e.telegraphExtra('aoe', { shape: 'circle', pos, r: BOMB.r, size: BOMB.r, duration: fill, follow: false });
      const mesh = e.ctx.scene ? makeProp('cheeseWedge') : null;
      if (mesh) { mesh.scale.setScalar(1.6); e.ctx.scene.add(mesh); }
      e.bombs.push({ pos, id, mesh, from: e.pos.clone().setY(e.pos.y + e.height * 0.9) });
    }
    e.bombFill = fill;
    e.bombHit = new Set();
  },
  update(e, dt) {
    e.brake(dt);
    const u = Math.min(1, e.stateT / e.bombFill);
    for (const b of e.bombs) {
      if (!b.mesh) continue;
      b.mesh.position.lerpVectors(b.from, b.pos, u);
      b.mesh.position.y += Math.sin(u * Math.PI) * 3.0;
      b.mesh.rotation.set(u * 9, u * 5, 0);
    }
    if (e.stateT >= e.bombFill && e.bombs.length) {
      for (const b of e.bombs) {
        e.endTelegraphId(b.id);
        b.mesh?.removeFromParent();
        e.ctx.combat?.areaHit?.(e, BOMB, { center: b.pos, r: BOMB.r, y0: -0.3, y1: 1.4, hitSet: e.bombHit });
        e.ctx.bus.emit(E.BURST, { kind: 'dustRing', position: b.pos.clone(), scale: 1.2 });
        e.ctx.bus.emit(E.BURST, { kind: 'shatter', position: b.pos.clone().setY(b.pos.y + 0.3), count: 6, color: '#E8C35A' });
      }
      e.ctx.bus.emit(E.SHAKE, { trauma: 0.15 });
      e.bombs.length = 0;
    }
    if (e.stateT >= e.bombFill + 0.3) { e.attack = { id: 'cheeseBombs', def: { recover: 0.9 }, range: 12 }; e.setState('recover'); }
  },
  exit(e) { for (const b of e.bombs ?? []) b.mesh?.removeFromParent(); if (e.bombs) e.bombs.length = 0; },
};

const SNACK_STATE = {
  attacking: true,
  anim: () => ['idle', { speed: 1.6 }],
  enter(e) {
    e.brakeHard();
    e.releaseToken();
    e.attackCd.snack = SNACK.cooldown;
    e.bark('grizzlechop.snack');
    if (!e.wedge && e.visual) {
      e.wedge = makeProp('cheeseWedge');
      e.wedge.scale.setScalar(1.4);
      e.wedge.position.set(0, e.height * 0.42, BODY.front + 0.05);
      e.object3d.add(e.wedge);
    }
    if (e.wedge) e.wedge.visible = true;
  },
  update(e, dt) {
    e.brake(dt);
    if (e.wedge) e.wedge.scale.setScalar(1.4 * Math.max(0.2, 1 - e.stateT / SNACK.dur));
    if (e.stateT >= SNACK.dur) {
      e.hp = Math.min(e.maxHp, e.hp + SNACK.heal);
      e.ctx.bus.emit(E.BURST, { kind: 'heal', position: e.pos.clone().setY(e.pos.y + e.height), count: 8 });
      e.attack = { id: 'snack', def: { recover: 0.4 }, range: 99 };
      e.setState('recover');
    }
  },
  exit(e) { if (e.wedge) e.wedge.visible = false; },
};

// ------------------------------------------------------------------ the def
const base = bossDef('grizzlechop');

export default {
  ...base,
  body: BODY,
  radius: BODY.r,
  scamper: false,
  anims: { ...CLIP_MAPS.rat.roles },
  moves: {
    sabreFlurry: {
      range: 2.0 + REACH, recover: 0.9,
      chain: [
        { atk: 'grizz_flurry1', telegraph: 'parry', windup: 0.55, dmg: 1, range: 2.0 + REACH, arc: 0.9, knock: 3 },
        { atk: 'grizz_flurry2', telegraph: 'parry', windup: 0.30, dmg: 1, range: 2.0 + REACH, arc: 0.9, knock: 3 },
        { atk: 'grizz_flurry3', telegraph: 'gold', windup: 0.30, dmg: 2, range: 2.0 + REACH, arc: 1.0, knock: 6, poise: 3 },
      ],
    },
    cheeseToss: { state: 'cheeseToss', range: 12, minRange: 3.5, cooldown: 5 },
    wheelRide: { state: 'wheelRide', range: 99, cooldown: WHEEL.every },
    cheeseBombs: { state: 'cheeseBombs', range: 12, cooldown: 4 },
    snack: { state: 'snack', range: 99, cooldown: SNACK.cooldown, when: (e, d) => d > BM.snackMinDist },
  },
  states: { cheeseToss: TOSS_STATE, wheelRide: RIDE, cheeseBombs: BOMBS, snack: SNACK_STATE },
  onHitWhile: { snack: 'choke' },
  init(e) {
    e.pillars = millPillars(e.ctx, e.home);
    e.wheels = []; e.mounted = false; e.rideLift = 0; e.lift = 0;
  },
  onChoke(e) { e.bark('grizzlechop.choke'); if (e.wedge) e.wedge.visible = false; },
  onPhaseChange(e, i) {
    if (i === 1) e.forceMove = 'wheelRide';                  // "Wheel Ride" opens phase 2
    if (e.stateName === 'wheelRide') mount(e, false);
  },
  /** P2's crossbowmen stand on the mill deck (anchors `mill_deck_a/b`, else the north edge at y 2.0). */
  addsAt(e, type, k) {
    if (type !== 'rat_xbow') return null;
    const a = e.ctx.levels?.anchor?.(`mill_deck_${k ? 'b' : 'a'}`) ?? e.ctx.levels?.anchor?.(`mill_deck_${k}`);
    if (a?.pos) return { pos: a.pos.clone(), opts: { y: 2.0 } };
    const c = e.home;
    return { pos: new THREE.Vector3(c.x + (k ? 3 : -3), c.y, c.z + B.arenaR - 1.0), opts: { y: 2.0 } };
  },
  tick(e, dt) {
    for (const w of e.wheels) w.update(dt);
    if (e.wheels.length && e.wheels.some((w) => !w.alive)) e.wheels = e.wheels.filter((w) => w.alive);
  },
  onRestart(e) {
    for (const w of e.wheels) w.dispose();
    e.wheels.length = 0;
    mount(e, false);
  },
  onDefeat(e) { for (const w of e.wheels ?? []) w.dispose(); mount(e, false); },
  onBossDispose(e) {
    for (const w of e.wheels ?? []) w.dispose();
    e.rideWheel?.removeFromParent(); e.rideWheel = null;
    e.wedge?.removeFromParent(); e.wedge = null;
  },
  render(e, dt) {
    const v = e.visual;
    if (!v) return;
    e.lift = damp(e.lift ?? 0, e.rideLift ?? 0, 12, dt);
    v.position.y = e.lift;
  },
  async build(e, m) {
    await dressRat(e, m, {});
    if (e.disposed) return;
    const space = m.root, k = (m.size?.y ?? 1.6) / 0.8;
    const head = bone(m.scene, 'Head');
    if (head) {
      const hp = posIn(space, head);
      const hat = makeProp('featherHat');
      attachAligned(space, head, hat, { pos: [hp.x, hp.y + 0.13 * k, hp.z - 0.05 * k], rot: [-0.2, 0, 0.08], scale: k * 0.7 });
      e.helmet = hat;                                        // spins off on defeat (§10.1)
      // ART §7.2: a monocle over his right eye and a moustache card on the snout (Barkus keeps the eyepatch)
      const he = bone(m.scene, 'Head_end');
      const ep = he ? posIn(space, he) : null;
      const ey = ep ? THREE.MathUtils.lerp(hp.y, ep.y, 0.3) + 0.075 * k : hp.y + 0.08 * k;
      const ez = ep ? THREE.MathUtils.lerp(hp.z, ep.z, 0.32) : hp.z + 0.1 * k;
      const mono = makeProp('monocle');
      attachAligned(space, head, mono, { pos: [hp.x - 0.062 * k, ey, ez + 0.035 * k], scale: k });
      const mo = makeProp('moustache');
      const sz = ep ? THREE.MathUtils.lerp(hp.z, ep.z, 0.78) : hp.z + 0.22 * k, sy = ep ? THREE.MathUtils.lerp(hp.y, ep.y, 0.78) : hp.y;
      attachAligned(space, head, mo, { pos: [hp.x, sy - 0.01 * k, sz + 0.02 * k], rot: [-0.1, 0, 0], scale: k * 1.1 });
    }
    const lp = bone(m.scene, 'FrontLowLeg.L'), rp = bone(m.scene, 'FrontLowLeg.R');
    if (lp) {
      // the cheese-wheel shield (§11.2 r 0.45) on his left fore paw, its face turned out to his left
      const p0 = posIn(space, lp), g = new THREE.Group(), sh = makeProp('cheeseWheel');
      sh.scale.set(0.09, 0.45, 0.45);
      sh.castShadow = true;
      g.add(sh); g.name = 'cheese-shield';
      attachAligned(space, lp, g, { pos: [p0.x + 0.16 * k, p0.y + 0.12 * k, p0.z + 0.08 * k], rot: [0, -0.3, 0], scale: k / 2 });
    }
    if (rp) {
      try {
        const w = await e.ctx.assets.model('models/weapons/quaternius/Sword_B.glb', { fit: { max: 0.6 * (k / 2) * 1.6 }, ground: false, castShadow: true });
        if (e.disposed) return;
        const p0 = posIn(space, rp);
        attachAligned(space, rp, w.root, { pos: [p0.x - 0.1 * k, p0.y + 0.16 * k, p0.z + 0.12 * k], rot: [0.75, 0, -0.15], scale: 1 });
        const tip = new THREE.Object3D(); tip.name = 'tell'; tip.position.set(0, (w.size?.y ?? 0.8) * 0.45, 0);
        w.root.add(tip);
        e.tipNode = tip; e.weaponRoot = w.root;
      } catch (err) { console.warn('[grizzlechop] sabre failed', err); }
    }
  },
};

export { TossWheel, wrapAngle as _wrapAngle };
