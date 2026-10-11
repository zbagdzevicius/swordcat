// src/companions/abilities.js  (owner: companions) — companion abilities and passives (GAME_DESIGN §9.2,
// Appendix A COMPANIONS):
//   Mochi  shieldWall  plant a 3.0 × 1.6 m barrier 1.5 m from her for 4 s, taunt within 6 m; where: along the aim
//                      (aimed cast), else between her and the engaged enemies within 6 m, else her facing (§7.5)
//   Sage   volley      5 arrows over 0.6 s split across ≤ 3 targets within 14 m, 8 dmg each, flyers grounded 3 s
//                      (aimed: the targets nearest the aim point; the selected target takes 2 arrows)
//                      passive: one flyer every 2.5 s for 6 dmg; hidden lost kittens within 15 m sparkle
//   Clover mend        1.0 s channel, then 4 HP over 3 s, cleanses slow; passive: +1 HP every 20 s out of combat
// Each ability instance: start(plan) → bool (false = nothing to do, no cooldown spent; `plan` from abilityAim.js
// planAbility, a smart plan when omitted), update(dt) → bool (still running), end(), `holds` (it drives the companion's
// movement), blocksFrom(att, dir), render(dt).
import * as THREE from 'three';
import { COMPANIONS } from '../core/config.js';
import { E } from '../core/events.js';
import { ShieldWall } from './ShieldWall.js';
import { isEngaged, isFlyer, groundY } from './steering.js';
import { planAbility, playerAimYaw, playerForwardYaw } from './abilityAim.js';

export { playerAimYaw, playerForwardYaw };

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** Hit defs for companion attacks (no hitstop / shake: companions are helpers, the juice is hers). */
export const COMPANION_HITS = {
  bash: { id: 'companion_bash', dmg: COMPANIONS.dmg, knock: 3, poise: 1, hitstop: 0, shake: 0 },
  arrow: { id: 'companion_arrow', dmg: COMPANIONS.sage.dmg, knock: 1.5, poise: 1, hitstop: 0, shake: 0 },
  shot: { id: 'companion_shot', dmg: COMPANIONS.dmg, knock: 1, poise: 1, hitstop: 0, shake: 0 },
  passiveArrow: { id: 'companion_arrow_passive', dmg: COMPANIONS.sage.passive.flyerDmg, knock: 1, poise: 1, hitstop: 0, shake: 0 },
};

/**
 * Ground a flyer for `sec` (§9.2 Volley). Enemy.groundFlyer(sec) is the enemies' hook (a no-op for walkers);
 * older duck types: ground(sec), else the `groundedT` / `grounded` fields.
 */
export function groundFlyer(e, sec) {
  if (!e?.alive || !isFlyer(e)) return false;
  if (typeof e.groundFlyer === 'function') e.groundFlyer(sec);
  else if (typeof e.ground === 'function') e.ground(sec);
  else { e.groundedT = Math.max(e.groundedT ?? 0, sec); e.grounded = true; }
  return true;
}

class Ability {
  constructor(c) { this.c = c; this.ctx = c.ctx; this.cfg = c.cfg; this.t = 0; this.holds = false; this.done = false; }
  start() { return true; }
  /** The plan to cast with: the caller's, else a smart one (§7.5). */
  plan(plan) { return plan?.ability === this.cfg.ability ? plan : planAbility(this.ctx, this.c, null); }
  update(dt) { this.t += dt; return !this.done; }
  end() { this.done = true; }
  blocksFrom() { return false; }
  render() {}
}

// ------------------------------------------------------------------ Mochi: Shield Wall

export class ShieldWallAbility extends Ability {
  start(plan) {
    const ctx = this.ctx, p = ctx.player, cfg = this.cfg;
    if (!p) return false;
    const pl = this.plan(plan);
    if (!pl.valid) return false;
    const yaw = pl.yaw;
    const center = new THREE.Vector3(p.pos.x + Math.sin(yaw) * cfg.dist, p.pos.y, p.pos.z + Math.cos(yaw) * cfg.dist);
    center.y = groundY(ctx, center.x, center.z, p.pos.y);
    this.wall = new ShieldWall(ctx, { center, yaw, owner: this.c, width: cfg.width, height: cfg.height, dur: cfg.dur });
    ctx.companions?.addWall?.(this.wall) ?? this.wall.start();
    this.yaw = yaw;
    // Mochi's spot: just behind the middle of the wall, shield up
    this.spot = new THREE.Vector3(center.x - Math.sin(yaw) * 0.68, center.y, center.z - Math.cos(yaw) * 0.68);
    const c = this.c, d = Math.hypot(this.spot.x - c.pos.x, this.spot.z - c.pos.z);
    if (d > 5) c.teleportTo(this.spot, yaw);
    this.holds = true;
    this.taunted = new Set();
    this._taunt();
    c.visual?.setStance('shieldUp');
    c.visual?.punch(-0.18);
    return true;
  }

  _taunt() {
    const list = this.ctx.enemies?.list ?? [], r = this.cfg.taunt, w = this.wall, left = Math.max(0, this.cfg.dur - this.t);
    for (const e of list) {
      if (!e?.alive || e.faction !== 'enemy') continue;
      if (Math.hypot(e.pos.x - w.center.x, e.pos.z - w.center.z) > r) continue;
      e.tauntedBy = this.c; e.tauntT = left;
      this.taunted.add(e);
    }
  }

  update(dt) {
    this.t += dt;
    const c = this.c;
    // dash to the spot, then hold the shield facing out
    const dx = this.spot.x - c.pos.x, dz = this.spot.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.08) {
      const s = Math.min(9, d / Math.max(dt, 1e-4));
      c.vel.x = (dx / d) * s; c.vel.z = (dz / d) * s;
      c.facing = Math.atan2(dx, dz);
    } else { c.vel.x = 0; c.vel.z = 0; c.facing = this.yaw; }
    if (d < 0.6) c.facing = this.yaw;
    if (((this.t * 10) | 0) !== (((this.t - dt) * 10) | 0)) this._taunt();     // 10 Hz: new arrivals get taunted too
    for (const e of this.taunted) if (e.tauntedBy === c) e.tauntT = Math.max(0, this.cfg.dur - this.t);
    if (this.t >= this.cfg.dur || !this.wall.alive) this.done = true;
    return !this.done;
  }

  /** Frontal hits on Mochi while he holds the wall are blocked by his shield. */
  blocksFrom(att) {
    if (this.done || !att?.pos) return false;
    return this.wall.alive && !this.wall.behind(att.pos.x, att.pos.z);
  }

  end() {
    if (this.ended) return;
    this.ended = true; this.done = true;
    this.wall?.end();
    for (const e of this.taunted ?? []) if (e.tauntedBy === this.c) { e.tauntedBy = null; e.tauntT = 0; }
    this.c.visual?.setStance('relaxed');
  }
}

// ------------------------------------------------------------------ arrows (Sage)

let _arrowGeo = null, _arrowMat = null, _fletchMat = null;
function arrowMesh() {
  if (!_arrowGeo) {
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5).rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.03, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0, 0.31);
    _arrowGeo = [shaft, head];
    _arrowMat = [new THREE.MeshStandardMaterial({ color: '#7A5230', roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: '#B8BCC2', roughness: 0.4, metalness: 0.6 })];
    _fletchMat = new THREE.MeshStandardMaterial({ color: '#E9E2D2', roughness: 0.9, side: THREE.DoubleSide });
  }
  const g = new THREE.Group(); g.name = 'arrow';
  g.add(new THREE.Mesh(_arrowGeo[0], _arrowMat[0]), new THREE.Mesh(_arrowGeo[1], _arrowMat[1]));
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.1), _fletchMat);
    f.position.z = -0.24; f.rotation.set(Math.PI / 2, 0, i * Math.PI / 2);
    g.add(f);
  }
  return g;
}

/** A homing arrow: flies from `from` to the target's chest, then applies the hit. Fixed-step driven. */
export class Arrow {
  constructor(ctx, owner, target, def, from, { speed = 24, onHit = null } = {}) {
    this.ctx = ctx; this.owner = owner; this.target = target; this.def = def; this.onHit = onHit;
    this.pos = from.clone(); this.prev = from.clone(); this.speed = speed; this.alive = true; this.t = 0;
    this.mesh = ctx.scene ? arrowMesh() : null;
    if (this.mesh) { this.mesh.position.copy(from); ctx.scene.add(this.mesh); }
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt; this.prev.copy(this.pos);
    const tg = this.target;
    _v.set(tg.pos.x, tg.pos.y + (tg.height ?? 0.6) * 0.55, tg.pos.z).sub(this.pos);
    const d = _v.length();
    if (d <= this.speed * dt + 0.15 || this.t > 2) {
      if (tg.alive && tg.hurtable !== false && this.t <= 2) {
        const r = this.ctx.combat?.applyHit?.(this.owner, tg, this.def);
        if (r && r !== 'none' && r !== 'immune') this.onHit?.(tg, r);
      }
      this.alive = false;
      return false;
    }
    this.pos.addScaledVector(_v, (this.speed * dt) / d);
    return true;
  }

  render() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pos);
    _w.copy(this.pos).sub(this.prev);
    if (_w.lengthSq() > 1e-8) this.mesh.lookAt(_w.add(this.pos));
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    for (const ch of this.mesh.children) if (ch.geometry?.type === 'PlaneGeometry') ch.geometry.dispose();
    this.mesh = null;
  }
}

// ------------------------------------------------------------------ Sage: Volley

export class VolleyAbility extends Ability {
  start(plan) {
    const c = this.c;
    const pl = this.plan(plan);
    if (!pl.valid || !pl.targets.length) return false;
    // round-robin over the plan's order: the first (the selected target when there is one) takes 2 of the 5 arrows
    this.targets = pl.targets.slice();
    this.fired = 0;
    this.holds = true;
    c.visual?.setStance('bow');
    return true;
  }

  update(dt) {
    this.t += dt;
    const cfg = this.cfg, c = this.c;
    const tg0 = this.targets[0];
    if (tg0) { c.facing = Math.atan2(tg0.pos.x - c.pos.x, tg0.pos.z - c.pos.z); }
    c.vel.x = 0; c.vel.z = 0;
    const every = cfg.over / Math.max(1, cfg.arrows - 1);
    while (this.fired < cfg.arrows && this.t >= this.fired * every) {
      const live = this.targets.filter((e) => e.alive);
      if (!live.length) { this.fired = cfg.arrows; break; }
      const tg = live[this.fired % live.length];
      this.c.fireArrow(tg, COMPANION_HITS.arrow, (e) => groundFlyer(e, cfg.groundFlyers));
      this.fired++;
    }
    if (this.t >= cfg.over + 0.3) this.done = true;
    return !this.done;
  }

  end() { this.done = true; this.c.visual?.setStance('relaxed'); }
}

// ------------------------------------------------------------------ Clover: Purr of Mending

export class MendAbility extends Ability {
  start(plan) {
    const p = this.ctx.player;
    if (!p || p.alive === false) return false;
    if (plan && plan.ability === 'mend' && !plan.valid) return false;
    this.holds = true; this.healed = 0; this.channelled = false;
    this.c.visual?.setStance('staff');
    return true;
  }

  update(dt) {
    this.t += dt;
    const cfg = this.cfg, p = this.ctx.player;
    if (!this.channelled) {
      this.c.vel.x = 0; this.c.vel.z = 0;
      if (p) this.c.facing = Math.atan2(p.pos.x - this.c.pos.x, p.pos.z - this.c.pos.z);
      if (this.t >= cfg.channel) {
        this.channelled = true; this.holds = false;
        this.c.visual?.setStance('relaxed');
        if (p) {                                                       // cleanse (webs): duck-typed slow fields
          if (typeof p.cleanse === 'function') for (const k of cfg.cleanse) p.cleanse(k);
          if ('slowT' in p) p.slowT = 0;
          if ('slow' in p && typeof p.slow === 'number') p.slow = 0;
        }
      }
      return true;
    }
    const tick = cfg.over / cfg.heal;
    while (this.healed < cfg.heal && this.t - cfg.channel >= (this.healed + 1) * tick - 1e-6) {
      this.healed++;
      healPlayer(this.ctx, 1);
      this.ctx.fx?.burst?.('heal', p?.pos ?? this.c.pos, { color: '#7FD38A', count: 6 });
    }
    if (this.healed >= cfg.heal) this.done = true;
    return !this.done;
  }

  end() { this.done = true; this.c.visual?.setStance('relaxed'); }
}

/** Heal the player through her API (player.heal emits player:healed), else directly. */
export function healPlayer(ctx, n) {
  const p = ctx.player;
  if (!p || !p.alive) return 0;
  if (typeof p.heal === 'function') { p.heal(n); return n; }
  const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + n);
  if (p.hp > before) ctx.bus.emit(E.PLAYER_HEALED, { amount: p.hp - before, hp: p.hp, maxHp: p.maxHp });
  return p.hp - before;
}

export const ABILITIES = { shieldWall: ShieldWallAbility, volley: VolleyAbility, mend: MendAbility };

/** New ability instance for companion `c` (null if its config has none). */
export function createAbility(c) {
  const Cls = ABILITIES[c.cfg?.ability];
  return Cls ? new Cls(c) : null;
}

// ------------------------------------------------------------------ passives

/**
 * Per-step passive effects of an awake, unscripted companion. `st` is the companion's scratch object.
 * Sage: shoot one flyer every flyerEvery s; sparkle hidden lost kittens within sparkleRadius.
 * Clover: +1 HP every outOfCombatEvery s while no engaged enemy is within 20 m.
 */
export function updatePassive(c, dt, st) {
  const ctx = c.ctx, id = c.kittenId, p = ctx.player;
  if (!p) return;
  if (id === 'sage') {
    const pc = c.cfg.passive;
    st.flyerT = (st.flyerT ?? pc.flyerEvery) - dt;
    if (st.flyerT <= 0) {
      st.flyerT = pc.flyerEvery;
      let best = null, bd = c.cfg.range;
      for (const e of ctx.enemies?.list ?? []) {
        if (!e?.alive || e.hurtable === false || !isFlyer(e) || !isEngaged(e)) continue;
        const d = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) c.fireArrow(best, COMPANION_HITS.passiveArrow);
      else st.flyerT = 0.5;
    }
    st.sparkT = (st.sparkT ?? 0) - dt;
    if (st.sparkT <= 0) {
      st.sparkT = 2.5;
      for (const k of ctx.companions?.kittens ?? []) {
        if (!k.hidden || k.rescued) continue;
        if (Math.hypot(k.pos.x - c.pos.x, k.pos.z - c.pos.z) <= pc.sparkleRadius) ctx.fx?.burst?.('sparkle', k.pos, { count: 6 });
      }
    }
  } else if (id === 'clover') {
    const pc = c.cfg.passive;
    let fighting = false;
    for (const e of ctx.enemies?.list ?? []) if (isEngaged(e) && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 20) { fighting = true; break; }
    if (fighting || p.hp >= p.maxHp) { st.mendT = 0; return; }
    st.mendT = (st.mendT ?? 0) + dt;
    if (st.mendT >= pc.outOfCombatEvery) { st.mendT = 0; healPlayer(ctx, pc.heal); }
  }
}
