// src/companions/Companion.js  (owner: companions) — a rescued squire who fights beside her (GAME_DESIGN §9.1):
//   follow  2.5 m behind and to the side (seek + arrive + separation); teleports to her side beyond 15 m or after
//           4 s out of line of sight; answers her Meow ("mrrp") and regroups; trades slow blinks when she is still
//   fight   only enemies already engaging her, within 6 m of her: 5 dmg every 1.6 s (combat.applyHit)
//   nap     never dies: a knock-out blow → curled up "zzz" for 8 s, then wakes at full HP
//   ability Q / LT (CompanionManager reads the input) → abilities.js; cooldown in `cooldown`
// Contract (§19.4): kittenId, napT, cooldown, useAbility() + the ScriptedActor API (core/ScriptedActor.js).
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { COMPANIONS, PLAYER } from '../core/config.js';
import { E } from '../core/events.js';
import { damp, dampAngle, clamp, wrapAngle } from '../core/math.js';
import { CATS, catConfig, visualDt } from '../characters/index.js';
import { KittenVisual } from './KittenVisual.js';
import { TextSprite } from './Bubble.js';
import { createAbility, updatePassive, COMPANION_HITS, Arrow } from './abilities.js';
import { followSlot, arrive, separation, pickTarget, estimateDamage, groundY, FOLLOW_SIDE, SLOT } from './steering.js';

const _slot = { x: 0, z: 0 }, _des = { x: 0, z: 0 }, _sep = { x: 0, z: 0 };
const _ray = new THREE.Ray(), _v = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3();
const _her = [null];                     // one-element list for separation() (no per-step allocation)
/** §6 bark rule: 25% per trigger (nap / wake / the Meow answer are status lines and always show). */
const BARK_CHANCE = 0.25;
const THINK = 0.2;                       // AI "thinks" (targets, line of sight) at 5 Hz (tech.md §10)

export class Companion extends ScriptedActorMixin(Actor) {
  /**
   * @param {any} ctx
   * @param {string} kittenId 'mochi' | 'sage' | 'clover'
   * @param {{ pos?: THREE.Vector3, facing?: number, visual?: boolean }} [opts]
   */
  constructor(ctx, kittenId, opts = {}) {
    const look = CATS[kittenId] ?? catConfig(kittenId) ?? CATS.mochi;
    const scale = look.scale ?? 0.95;
    super(ctx, { faction: 'ally', radius: 0.3 * scale / 0.95, height: 0.95 * scale, maxHp: COMPANIONS.hp, mass: 0.8, maxPoise: 2 });
    this.kittenId = kittenId;
    this.tags.add('kitten'); this.tags.add('companion');
    /** seconds of nap left (0 = awake) */
    this.napT = 0;
    /** ability cooldown left (s) */
    this.cooldown = 0;
    this.cfg = COMPANIONS[kittenId] ?? {};
    this.stateName = 'follow';
    this.side = FOLLOW_SIDE[kittenId] ?? 1;
    this.target = null;
    this.attackT = 0;            // time until the next basic attack may start
    this.swingT = -1;            // >= 0 while a bash is in progress
    this.thinkT = (ctx.rng?.() ?? 0.5) * THINK;
    this.losT = 0; this.regroupT = 0;
    this.heading = 0;            // smoothed player heading the follow slot hangs off
    this.stillT = 0; this.blinkCd = 6;
    this.herStillT = 0; this.settled = false;  // she has stood still this long / we're parked beside her
    /** terrain height for pickTarget's flyer check (bound once: no closure per think) */
    this._groundAt = (x, z) => this.ctx.physics?.heightAt?.(x, z) ?? this.pos.y;
    this.idleBarkT = 45 + (ctx.rng?.() ?? 0.5) * 40;
    this.ability = null;
    this.passive = {};
    this.arrows = [];
    this._clipWaits = [];
    this.stats ={ hits: 0, abilities: 0, naps: 0, teleports: 0, blocks: 0 };
    if (opts.pos) this.pos.copy(opts.pos);
    this.facing = opts.facing ?? 0;
    this.object3d.name = 'companion:' + kittenId;
    this.visual = null;
    if (opts.visual !== false) {
      this.visual = new KittenVisual(ctx, look);
      this.object3d.add(this.visual.root);
    }
    this.bubble = new TextSprite({ kind: 'bubble', y: this.height + 0.32 });
    this.zzz = new TextSprite({ kind: 'zzz', y: this.height * 0.7, scale: 0.08 });
    this.object3d.add(this.bubble.object, this.zzz.object);
    this.snap();
  }

  get napping() { return this.napT > 0; }
  /** 0..1 ability readiness (HUD ring). */
  get readiness() { const cd = this.cfg.cd ?? 1; return clamp(1 - this.cooldown / cd, 0, 1); }

  // ------------------------------------------------------------------ ability

  /** Fire the kitten's ability if off cooldown and awake. Returns true when used. */
  useAbility() {
    if (this.cooldown > 0 || this.napT > 0 || this.scripted || this.attachedTo || !this.cfg.ability) return false;
    if (this.ability && !this.ability.done) return false;
    const p = this.ctx.player;
    if (!p || p.alive === false) return false;
    const ab = createAbility(this);
    if (!ab || !ab.start()) return false;
    this.ability = ab;
    this.cooldown = this.cfg.cd ?? 10;
    this.abilityAt = this.ctx.game?.time ?? 0;     // sim time of the last use (HUD flash, tests)
    this.stateName = 'ability';
    this.stats.abilities++;
    this.ctx.bus.emit(E.COMPANION_ABILITY, { kittenId: this.kittenId, ability: this.cfg.ability, position: this.pos.clone() });
    this.ctx.companions?.bark?.(this, 'ability', { chance: BARK_CHANCE });
    return true;
  }

  _endAbility() { if (this.ability) { this.ability.end(); this.ability = null; } }

  /** Drop arrows in flight (level unload). */
  clearArrows() { for (const a of this.arrows) a.dispose(); this.arrows.length = 0; }

  /** Fire a homing arrow at `target` (Sage's volley and passive). */
  fireArrow(target, def, onHit) {
    const from = this.visual ? this.visual.jointWorld('pawL', _v).clone() : this.pos.clone().setY(this.pos.y + this.height * 0.6);
    this.arrows.push(new Arrow(this.ctx, this, target, def, from, { onHit: (e, r) => { this.stats.hits++; onHit?.(e, r); } }));
    this.visual?.punch(-0.06);
  }

  // ------------------------------------------------------------------ nap / damage

  /** Combat hook (§19.4): companions never die — a knock-out blow starts the nap instead. */
  resolveIncoming(att, def, dir) {
    if (this.napT > 0 || !this.hurtable) return 'immune';
    if (this.ability?.blocksFrom?.(att, dir)) { this.stats.blocks++; return 'block'; }
    const dmg = estimateDamage(def, this.ctx.state?.difficultyCfg, { ally: true });
    if (this.hp - dmg <= 0) { this.startNap(); return 'immune'; }
    return 'hit';
  }

  onHit(hit) {
    this.visual?.flash(0.12);
    this.visual?.punch(-0.2);
    if (hit?.attacker?.faction === 'enemy' && !this.target) this.target = hit.attacker;
  }

  onDeath() { this.alive = true; this.startNap(); }       // safety net: never stay dead

  startNap() {
    if (this.napT > 0) return;
    this._endAbility();
    this.napT = COMPANIONS.napTime;
    this.hp = 0; this.hurtable = false; this.alive = true;
    this.target = null; this.swingT = -1;
    this.stateName = 'nap';
    this.stats.naps++;
    this.visual?.setPose('sleep', 0.35);
    this.visual?.setExpression('sleep');
    this.zzz.show('zzz', Infinity);
    this.ctx.bus.emit(E.COMPANION_NAP, { kittenId: this.kittenId, on: true });
    this.ctx.companions?.bark?.(this, 'nap', { chance: 1, pool: 'any' });
  }

  wake() {
    this.napT = 0;
    this.hp = this.maxHp; this.hurtable = true; this.invulnT = 0.5;
    this.stateName = 'follow';
    this.visual?.setPose('idle', 0.3);
    this.visual?.setExpression('happy');
    this.visual?.hop(0.22);
    this.zzz.hide();
    this.ctx.bus.emit(E.COMPANION_NAP, { kittenId: this.kittenId, on: false });
    this.ctx.companions?.bark?.(this, 'wake', { chance: 1, pool: 'any', force: true });
  }

  // ------------------------------------------------------------------ reactions

  /** Her Meow (§7.7): answer "mrrp" and regroup to her side. */
  onMeow() {
    if (this.napT > 0 || this.scripted) return;
    this.regroupT = 3;
    this.visual?.emote('meow');
    this.visual?.hop(0.15);
    this.ctx.companions?.bark?.(this, 'meow', { chance: 1, pool: 'any', force: true, dur: 1.1 });
  }

  /**
   * A free spot beside her to teleport to: her side slot, the other side, straight behind, then her own spot.
   * Skips deep water and static colliders. Writes into `out` (y = walkable ground under the spot).
   */
  _landingNear(p, out) {
    const ph = this.ctx.physics, sides = [this.side, -this.side];
    for (let i = 0; i < 3; i++) {
      if (i < 2) followSlot(p.pos, this.heading, sides[i], _slot, { dist: SLOT.regroupDist + 0.5, angle: SLOT.regroupAngle });
      else followSlot(p.pos, this.heading, 0, _slot, { dist: 1.4, angle: 0 });
      if (ph?.isDeepWater?.(_slot.x, _slot.z)) continue;
      if (ph?.blockedAt?.(_slot.x, _slot.z, this.radius)) continue;
      if (ph?.inBounds && !ph.inBounds(_slot.x, _slot.z, 1)) continue;
      return out.set(_slot.x, groundY(this.ctx, _slot.x, _slot.z, p.pos.y), _slot.z);
    }
    return out.set(p.pos.x, p.pos.y, p.pos.z);
  }

  /** Teleport next to `pos` (on the ground) with a poof. */
  teleportTo(pos, facing = this.facing) {
    this.ctx.fx?.burst?.('poof', this.pos, { scale: 0.4 });
    this.pos.set(pos.x, groundY(this.ctx, pos.x, pos.z, pos.y), pos.z);
    this.vel.set(0, 0, 0); this.facing = facing; this.onGround = true;
    this.snap(); this.visual?.snap();
    this.ctx.fx?.burst?.('poof', this.pos, { scale: 0.4 });
    this.losT = 0; this.stats.teleports++;
  }

  // ------------------------------------------------------------------ ScriptedActor visual hooks

  onScripted(on) {
    if (on) { this._endAbility(); this.target = null; this.swingT = -1; this.vel.x = this.vel.z = 0; this.visual?.setStance('relaxed'); }
    else if (this.napT <= 0) this.stateName = 'follow';
  }
  onPose(name) { this.visual?.setPose(name === 'guard' ? 'idle' : name); if (name === 'guard') this.visual?.setStance('shieldUp'); }
  onEmote(name) { this.visual?.emote(name); }
  onProp(name, on) { this.visual?.setProp(name, on); }
  playClip(clip, { once = false } = {}) {
    // kittens have no GLB clips: map the common cutscene clip names onto poses / overlays
    const v = this.visual;
    if (!v) return Promise.resolve();
    const c = String(clip).toLowerCase();
    if (c === 'cheer' || c === 'yes') { v.setPose('cheer'); v.hop(0.2); }
    else if (c === 'jump' || c === 'hop') v.hop(0.3);
    else if (c.includes('attack') || c === 'bash' || c === 'punch') v.attack('bash');
    else if (c === 'no') v.emote('shake');
    else if (c === 'wave') v.setWave(true);
    else v.setPose(c);
    return once ? new Promise((r) => this._clipWaits.push({ t: 0.45, r })) : Promise.resolve();
  }

  /** Resolve finished `once` clip promises (sim time, so cutscene timing follows the game clock). */
  _tickClipWaits(dt) {
    const w = this._clipWaits;
    for (let i = w.length - 1; i >= 0; i--) if ((w[i].t -= dt) <= 0) { const r = w[i].r; w.splice(i, 1); r(); }
  }
  onAttach(to) { if (to) this.visual?.setPose('sit'); else this.visual?.setPose('idle'); }

  // ------------------------------------------------------------------ fixed step

  update(dt) {
    const ctx = this.ctx;
    if (!ctx.game.simActive(this)) return;
    this._tickClipWaits(dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (let i = this.arrows.length - 1; i >= 0; i--) if (!this.arrows[i].update(dt)) { this.arrows[i].dispose(); this.arrows.splice(i, 1); }

    if (this.scripted || this.attachedTo) {
      this.scriptedStep(dt);
      if (!this.attachedTo) ctx.physics.moveActor(this, dt);
      return;
    }
    const p = ctx.player;

    if (this.napT > 0) {
      this.napT -= dt;
      this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt);
      ctx.physics.moveActor(this, dt);
      if (this.napT <= 0) this.wake();
      return;
    }
    if (this.staggerT > 0) {
      this.staggerT = Math.max(0, this.staggerT - dt);
      this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt);
      ctx.physics.moveActor(this, dt);
      return;
    }

    if (this.ability) {
      const running = this.ability.update(dt);
      if (!running) this._endAbility();
    }
    if (!p) { ctx.physics.moveActor(this, dt); return; }

    // heading the slot hangs off: her velocity while moving, else her facing (smoothed: no orbit-chasing)
    const pSpeed = Math.hypot(p.vel.x, p.vel.z);
    const want = pSpeed > 0.6 ? Math.atan2(p.vel.x, p.vel.z) : p.facing;
    this.heading = dampAngle(this.heading, want, pSpeed > 0.6 ? 4 : 1.5, dt);

    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT += THINK; this._think(p); }

    if (this.ability?.holds) { this.stateName = 'ability'; }
    else if (this.target) this._engage(dt, p);
    else this._follow(dt, p, pSpeed);

    this._ambient(dt, p, pSpeed);
    updatePassive(this, dt, this.passive);
    ctx.physics.moveActor(this, dt);
  }

  /** Line of sight from our chest to hers (terrain, architecture and props), or true when physics can't tell. */
  _canSee(p) {
    const ph = this.ctx.physics;
    _from.set(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z);
    _to.set(p.pos.x, p.pos.y + (p.height ?? 1) * 0.6, p.pos.z);
    if (typeof ph?.lineOfSight === 'function') return ph.lineOfSight(_from, _to);
    if (typeof ph?.raycast !== 'function') return true;
    _ray.origin.copy(_from);
    _v.subVectors(_to, _from);
    const len = _v.length();
    if (len < 1e-4) return true;
    _ray.direction.copy(_v.divideScalar(len));
    const hit = ph.raycast(_ray, len);
    return !(hit && hit.distance < len - 0.3);
  }

  /** 5 Hz: target choice, line of sight, teleport. */
  _think(p) {
    const ctx = this.ctx;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const blocked = d > 1.5 && !this._canSee(p);
    this.losT = blocked ? this.losT + THINK : 0;
    if (d > COMPANIONS.teleportBeyond || this.losT >= COMPANIONS.teleportLos) {
      if (!this.ability?.holds) {
        this.teleportTo(this._landingNear(p, _v), p.facing);
        this.target = null;
      }
      return;
    }
    if (this.ability?.holds) return;
    const prev = this.target;
    this.target = pickTarget(this.pos, p.pos, ctx.enemies?.list ?? [], {
      engage: COMPANIONS.engage, current: prev, groundAt: this._groundAt,
    });
    if (this.target && !prev) {
      this.stateName = 'engage';
      this.ctx.companions?.bark?.(this, 'combat', { chance: BARK_CHANCE });
    }
  }

  _follow(dt, p, pSpeed) {
    const regroup = this.regroupT > 0;
    if (regroup) this.regroupT -= dt;
    this.herStillT = pSpeed < 0.3 ? this.herStillT + dt : 0;
    const dP = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let maxS = Math.max(PLAYER.run * 1.15, pSpeed * 1.2);
    // While she moves: the §9.1 slot, 2.5 m behind and to the side. Once she has stood still for a moment (or
    // after her Meow) we come up beside her, where the camera can see us, and settle inside a loose band.
    const beside = regroup || this.herStillT >= SLOT.besideAfter;
    if (beside) followSlot(p.pos, this.heading, this.side, _slot, { dist: SLOT.regroupDist, angle: SLOT.regroupAngle });
    else followSlot(p.pos, this.heading, this.side, _slot);
    const toSlot = Math.hypot(_slot.x - this.pos.x, _slot.z - this.pos.z);
    const [b0, b1] = SLOT.idleBand;
    if (this.settled && beside && !regroup && dP >= b0 && dP <= b1 && toSlot < SLOT.settleRadius) {
      _des.x = 0; _des.z = 0;                                          // settled: don't shuffle about
      this.stateName = 'idle';
    } else {
      const dist = arrive(this.pos.x, this.pos.z, _slot.x, _slot.z, beside ? PLAYER.walk * 1.4 + pSpeed : maxS, 2.2, _des, SLOT.deadZone);
      if (dist > 4) maxS *= 1.15;
      this.settled = beside && dist <= SLOT.deadZone + 0.05;
      this.stateName = dist > SLOT.deadZone ? 'follow' : 'idle';
    }
    // separation from her and other allies
    _sep.x = 0; _sep.z = 0;
    _her[0] = p; separation(this.pos, _her, 1.0, 3.0, _sep);
    const allies = this.ctx.companions?.active ?? [];
    separation(this.pos, allies, 0.9, 2.0, _sep, this);
    _des.x += _sep.x; _des.z += _sep.z;
    const sp = Math.hypot(_des.x, _des.z);
    if (sp > maxS) { _des.x *= maxS / sp; _des.z *= maxS / sp; }
    this.vel.x = damp(this.vel.x, _des.x, 8, dt);
    this.vel.z = damp(this.vel.z, _des.z, 8, dt);
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v > 0.35) this.facing = dampAngle(this.facing, Math.atan2(this.vel.x, this.vel.z), 10, dt);
    else this.facing = dampAngle(this.facing, p.facing, 2.5, dt);
  }

  _engage(dt, p) {
    const t = this.target;
    if (!t || !t.alive || t.hurtable === false) { this.target = null; return; }
    this.stateName = this.swingT >= 0 ? 'attack' : 'engage';
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const reach = (t.radius ?? 0.35) + this.radius + 0.55;
    this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);
    this.attackT = Math.max(0, this.attackT - dt);
    if (this.swingT >= 0) {
      this.swingT += dt;
      this.vel.x = damp(this.vel.x, 0, 12, dt); this.vel.z = damp(this.vel.z, 0, 12, dt);
      if (this.swingT >= 0.16 && !this._swingHit) {
        this._swingHit = true;
        if (d <= reach + 0.45 && t.alive) {
          const r = this.ctx.combat?.applyHit?.(this, t, COMPANION_HITS.bash);
          if (r && r !== 'none' && r !== 'immune') this.stats.hits++;
        }
      }
      if (this.swingT >= 0.42) this.swingT = -1;
      return;
    }
    if (d > reach) {
      // approach, offset to her side of the target so we don't stand in her swing
      const k = Math.min(PLAYER.run * 1.1, (d - reach) * 4 + 1.5);
      _sep.x = 0; _sep.z = 0;
      _her[0] = p; separation(this.pos, _her, 0.9, 2.5, _sep);
      this.vel.x = damp(this.vel.x, (dx / d) * k + _sep.x, 9, dt);
      this.vel.z = damp(this.vel.z, (dz / d) * k + _sep.z, 9, dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt);
      if (this.attackT <= 0) {
        this.attackT = COMPANIONS.rate;
        this.swingT = 0; this._swingHit = false;
        this.visual?.attack(this.kittenId === 'mochi' ? 'bash' : 'swipe');
      }
    }
  }

  /** Slow blinks, idle barks, head glances. */
  _ambient(dt, p, pSpeed) {
    this.blinkCd = Math.max(0, this.blinkCd - dt);
    const still = pSpeed < 0.1 && !p.swing && !p.guarding && !this.target;
    this.stillT = still ? this.stillT + dt : 0;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (this.stillT >= 3 && d < 3 && this.blinkCd <= 0) {
      this.blinkCd = 25;
      this.facing = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      this.visual?.emote('blink');
      this.visual?.setExpression('happy');
      _v.set((p.pos.x + this.pos.x) / 2, Math.max(p.pos.y, this.pos.y) + 0.9, (p.pos.z + this.pos.z) / 2);
      this.ctx.fx?.burst?.('heart', _v, { count: 1 });
    }
    if (!this.target) {
      this.idleBarkT -= dt;
      if (this.idleBarkT <= 0) { this.idleBarkT = 25 + (this.ctx.rng?.() ?? 0.5) * 30; this.ctx.companions?.bark?.(this, 'idle', { chance: BARK_CHANCE }); }
    }
  }

  // ------------------------------------------------------------------ render

  render(alpha, dt) {
    super.render(alpha);
    const vdt = visualDt(this.ctx, dt ?? 0);         // 0 in hitstop / the pause menu, × slow-mo
    if (this.visual) {
      const p = this.ctx.player;
      let look = 0;
      const tgt = this.target ?? (this.stateName === 'idle' && p ? p : null);
      if (tgt && this.napT <= 0) look = wrapAngle(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) - this.facing);
      this.visual.lookAt(look);
      this.visual.update(dt ?? 0, { velocity: this.vel, onGround: this.onGround || !!this.attachedTo });
    }
    this.ability?.render?.(vdt);
    for (const a of this.arrows) a.render();
    this.bubble.update(vdt); this.zzz.update(vdt);
  }

  dispose() {
    this._endAbility();
    for (const w of this._clipWaits) w.r();
    this._clipWaits.length = 0;
    for (const a of this.arrows) a.dispose();
    this.arrows.length = 0;
    this.bubble.dispose(); this.zzz.dispose();
    this.visual?.dispose();
    super.dispose();
  }
}
