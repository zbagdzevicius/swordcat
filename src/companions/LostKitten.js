// src/companions/LostKitten.js  (owner: companions) — the 18 lost kittens (GAME_DESIGN §3.5, §6.4, §12.1) and the
// caged companions (Mochi D-01, Sage D-02, Clover D-04).
// Hides (§12.1 `kind: 'kitten'`):
//   meow   hidden until her Meow within PLAYER.meow.kittenRadius (10 m); the hiding barrel / bush wobbles every 6 s
//   cage   visible behind bars; 3 hits open the cage (companion cages: `hp` 30, `needClear` arena first)
//   stand  appears after a 3 s planted Stand within r 1.2 of the zone centre with no enemy near (+ `needClear`)
//   break  behind a cracked boulder: a Bright / Holy slash (ATTACKS[*].breaks 'cracked') nearby, or reveal()
//   climb  in plain view, hard to reach (`y` = perch height above the ground)
// Once visible a kitten waves and is rescued when she comes within 1.3 m: state.addKitten, kitten:rescued, its line
// in a bubble, then it trots off home and poofs. Contract (§19.4): kittenId, hidden, reveal(), rescue().
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { E } from '../core/events.js';
import { PLAYER, ATTACKS } from '../core/config.js';
import { damp, dampAngle, wrapAngle, clamp01, easeOutCubic } from '../core/math.js';
import { CATS, lostKittenConfig, buildCage } from '../characters/index.js';
import { KittenVisual } from './KittenVisual.js';
import { TextSprite } from './Bubble.js';
import { lineText } from './lines.js';
import { COMPANION_IDS } from './steering.js';

export const HIDES = Object.freeze(['meow', 'cage', 'stand', 'break', 'climb']);

/** Hiding props this area builds (the Crow Fields cow is world's `placed` creature: no prop here). */
export const HIDE_PROPS = {
  barrel: { model: 'models/env/village-kaykit/decoration/barrel.glb', fit: { h: 0.9 }, top: 0.82 },
  bush: { model: 'models/env/nature/plant_bushLarge.glb', fit: { h: 1.05 }, top: 0.5 },
};

export const RESCUE = { radius: 1.3, height: 1.6, leaveAfter: 2.8, leaveDur: 2.6, leaveSpeed: 2.2, wobbleEvery: 6, wobbleDur: 0.7, waveRadius: 7 };

const _v = new THREE.Vector3();

/** The breakable cage lock: a fixed `enemy`-faction actor so her swings hit it (player hits only). */
export class CageLock extends Actor {
  constructor(ctx, owner, { pos, facing = 0, radius = 0.45, height = 0.9, hits = 3, hp = null } = {}) {
    super(ctx, { faction: 'enemy', radius, height, maxHp: hp ?? 1e4, mass: 100, maxPoise: 1e4 });
    this.owner = owner;
    this.fixed = true;
    this.hitsNeeded = hp == null ? hits : null;
    this.hits = 0; this.opened = false;
    this.tags.add('breakable'); this.tags.add('cage');
    this.home = pos.clone(); this.pos.copy(pos); this.facing = facing;
    this.object3d.name = 'cageLock';
    this.snap();
  }
  /** Only her blows count (enemies and companions can't open it). */
  resolveIncoming(att) { return att?.faction === 'player' ? 'hit' : 'immune'; }
  onHit() {
    this.hits++; this.hold();
    this.owner.rattle();
    if (this.hitsNeeded != null && this.hits >= this.hitsNeeded) this.open();
  }
  onDeath() { this.open(); }
  hold() { this.pos.copy(this.home); this.vel.set(0, 0, 0); this.staggerT = 0; this.poise = this.maxPoise; }
  open() {
    if (this.opened) return;
    this.opened = true; this.alive = false; this.hurtable = false;
    this.ctx.actors.unregister(this);
    this.owner.openCage();
  }
  update() { if (!this.opened) this.hold(); }
  render() {}
}

export class LostKitten extends ScriptedActorMixin(Actor) {
  /**
   * @param {any} ctx @param {string} kittenId one of KITTEN_IDS, or a companion id (caged squire)
   * @param {{ pos?: THREE.Vector3, hide?: string|null, facing?: number, prop?: string, standTime?: number,
   *   needClear?: string, zoneR?: number, zoneAt?: THREE.Vector3, cage?: string, hits?: number, hp?: number,
   *   play?: string, y?: number, visual?: boolean }} [o]
   */
  constructor(ctx, kittenId, o = {}) {
    const companion = COMPANION_IDS.includes(kittenId);
    const look = companion ? CATS[kittenId] : lostKittenConfig(kittenId);
    const scale = look?.scale ?? 0.72;
    super(ctx, { faction: 'neutral', radius: 0.2 * scale / 0.72, height: 0.95 * scale, maxHp: 1, mass: 0.5 });
    this.kittenId = kittenId;
    this.companion = companion;
    this.tags.add('kitten'); this.tags.add(companion ? 'caged' : 'lost');
    this.hurtable = false;
    this.hide = HIDES.includes(o.hide) ? o.hide : null;
    this.opts = o;
    this.hidden = this.hide === 'meow' || this.hide === 'stand' || this.hide === 'break';
    this.rescued = false;
    this.stateName = this.hidden ? 'hidden' : this.hide === 'cage' ? 'caged' : 'waiting';
    this.ghost = this.hidden;                            // no collisions while tucked away
    if (o.pos) this.pos.copy(o.pos);
    this.home = this.pos.clone();
    this.perchY = o.y ?? 0;
    if (this.perchY > 0) this.flying = true;            // perched above the heightfield (balcony, wagon bed)
    this.facing = o.facing ?? 0;
    this.standT = 0; this.wobbleT = 0; this.leaveT = 0; this.sparkleT = -1; this.t = 0;
    this.cleared = false;
    this.object3d.name = 'kitten:' + kittenId;
    this.visual = null;
    if (o.visual !== false) { this.visual = new KittenVisual(ctx, look); this.object3d.add(this.visual.root); }
    this.bubble = new TextSprite({ kind: 'bubble', y: this.height + 0.3 });
    this.object3d.add(this.bubble.object);
    this.propRoot = null; this.prop = null; this.cage = null; this.lock = null; this.cageOpen = 0; this.rattleT = 0;
    this._clipWaits = [];
    if (this.hide === 'cage') this._buildCage();
    if (this.hide === 'meow' && HIDE_PROPS[o.prop]) this._loadProp(o.prop);
    if (this.visual) {
      this.visual.setPose(this.hide === 'cage' ? 'sit' : 'idle', 0);
      this.visual.setExpression(this.hide === 'cage' ? 'worried' : 'happy');
      if (this.hidden) this.visual.snapFade(0);
    }
    this.object3d.visible = !this.hidden;
    // already home? (a reload after the rescue): vanish on the first step
    if (!companion && ctx.state?.hasKitten?.(kittenId)) { this.rescued = true; this.hidden = false; this.stateName = 'gone'; this.object3d.visible = false; this.ghost = true; }
    this.snap();
  }

  /** Called by CompanionManager once registered (actor list + scene). */
  attachToWorld() {
    if (this.perchY > 0) { this.pos.y = (this.ctx.physics?.heightAt?.(this.pos.x, this.pos.z) ?? 0) + this.perchY; this.snap(); }
    if (this.propRoot) { this.propRoot.position.set(this.home.x, this.ctx.physics?.heightAt?.(this.home.x, this.home.z) ?? this.home.y, this.home.z); this.ctx.scene?.add(this.propRoot); }
    this._syncLock();
  }

  // ------------------------------------------------------------------ hiding props / cage

  _propRoot() {
    if (!this.propRoot) { this.propRoot = new THREE.Group(); this.propRoot.name = 'kittenHide:' + this.kittenId; this.propRoot.rotation.y = this.facing; }
    return this.propRoot;
  }

  async _loadProp(name) {
    const def = HIDE_PROPS[name];
    const root = this._propRoot();
    this.propDef = def;
    try {
      const m = await this.ctx.assets.model(def.model, { fit: def.fit, receiveShadow: true });
      if (this.disposed) return;
      this.prop = m.root; root.add(m.root);
    } catch (e) { console.warn(`[companions] hide prop ${name} failed`, e); }
  }

  _buildCage() {
    const o = this.opts, style = o.cage ?? (this.companion ? 'cart' : 'carry');
    const size = this.companion ? [1.3, 1.2, 1.0] : undefined;
    const root = this._propRoot();
    try {
      this.cage = buildCage({ style, size, ribbon: !!o.ribbon });
      if (this.perchY > 0) this.cage.position.y = this.perchY;
      root.add(this.cage);
    } catch (e) { console.warn('[companions] cage build failed', e); }
    const sz = this.cage?.userData?.size ?? [0.6, 0.75, 0.5];
    this.cageSize = sz;
    const lockPos = this.home.clone();
    this.lock = new CageLock(this.ctx, this, { pos: lockPos, facing: this.facing, radius: Math.max(sz[0], sz[2]) * 0.5, height: sz[1] + this.perchY, hits: o.hits ?? 3, hp: o.hp ?? (this.companion ? 30 : null) });
  }

  /** Register the lock only while it can be opened (an `enemy`-faction actor must never hold an arena open). */
  _syncLock() {
    const l = this.lock;
    if (!l || l.opened) return;
    const open = !this.opts.needClear || this.cleared;
    const reg = this.ctx.actors.has?.(l) ?? false;
    if (open && !reg) { l.alive = true; l.hurtable = true; this.ctx.actors.register(l); }
    else if (!open && reg) { this.ctx.actors.unregister(l); l.hurtable = false; }
    else if (!open) l.hurtable = false;
  }

  /** An arena cleared (CompanionManager forwards ARENA_CLEAR). */
  onArenaClear(id) {
    if (this.opts.needClear && id === this.opts.needClear) { this.cleared = true; this._syncLock(); }
  }

  rattle() { this.rattleT = 0.25; this.visual?.punch(-0.15); this.visual?.emote('earsFlat'); }

  openCage() {
    if (this.stateName !== 'caged') return;
    this.stateName = 'opening'; this.cageOpenT = 0;
    this.ctx.fx?.burst?.('sparkle', this.pos, { count: 10 });
  }

  // ------------------------------------------------------------------ reveal / rescue

  reveal() {
    if (!this.hidden || this.rescued) return;
    this.hidden = false; this.ghost = false;
    this.object3d.visible = true;
    this.stateName = 'waiting';
    const p = this.ctx.player;
    const toP = p ? Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : this.facing;
    if (this.hide === 'meow' && this.propDef) {
      // pop out of the top of the barrel / bush and land in front of it, toward her
      this.pos.y += this.propDef.top;
      this.vel.set(Math.sin(toP) * 1.6, 4.2, Math.cos(toP) * 1.6);
      this.onGround = false;
      this.visual?.snapFade(0.6); this.visual?.setFade(1, 4);
    } else {
      this.visual?.snapFade(0); this.visual?.setFade(1, 3);
      this.visual?.hop(0.3);
    }
    this.facing = toP;
    if (this.hide === 'stand') { this.visual?.setPose('vigil', 0); this.poseT = 2.2; }   // copying her Stand
    this.visual?.emote('meow');
    this.visual?.setExpression('surprised');
    this.sparkleT = 0;
    this.snapFacing();
    this.ctx.fx?.burst?.('sparkle', this.pos, { count: 12 });
    this.ctx.bus.emit(E.KITTEN_REVEAL, { kittenId: this.kittenId, position: this.pos.clone() });
  }

  snapFacing() { this.prevFacing = this.facing; }

  rescue() {
    if (this.rescued) return;
    if (this.hidden) this.reveal();
    this.rescued = true;
    this.stateName = 'rescued';
    this.leaveT = 0;
    if (this.lock && !this.lock.opened) { this.lock.opened = true; this.ctx.actors.unregister(this.lock); this.cageOpenT = this.cageOpenT ?? 0; }
    if (this.companion) {
      this.ctx.companions?.joinFromCage?.(this);
      return;
    }
    this.ctx.state?.addKitten?.(this.kittenId);
    this.ctx.bus.emit(E.KITTEN_RESCUED, { kittenId: this.kittenId });
    this.visual?.setPose('cheer', 0.2); this.visual?.setExpression('happy'); this.visual?.hop(0.35);
    this.bubble.show(lineText(this.ctx, 'kitten.' + this.kittenId), RESCUE.leaveAfter);
    this.ctx.fx?.burst?.('sparkle', this.pos, { count: 14 });
    this.ctx.companions?.onKittenRescued?.(this);
  }

  // ------------------------------------------------------------------ ScriptedActor hooks

  onPose(name) { this.visual?.setPose(name); }
  onEmote(name) { this.visual?.emote(name); }
  onProp(name, on) { this.visual?.setProp(name, on); }
  playClip(clip, { once = false } = {}) {
    const v = this.visual, c = String(clip).toLowerCase();
    if (v) {
      if (c === 'cheer' || c === 'yes') { v.setPose('cheer'); v.hop(0.2); }
      else if (c === 'jump' || c === 'hop') v.hop(0.3);
      else if (c === 'wave') v.setWave(true);
      else v.setPose(c);
    }
    return once ? new Promise((r) => this._clipWaits.push({ t: 0.45, r })) : Promise.resolve();
  }
  onAttach(to) { this.visual?.setPose(to ? 'sit' : 'idle'); }

  // ------------------------------------------------------------------ fixed step

  update(dt) {
    if (!this.ctx.game.simActive(this)) return;
    const w = this._clipWaits;
    for (let i = w.length - 1; i >= 0; i--) if ((w[i].t -= dt) <= 0) { const r = w[i].r; w.splice(i, 1); r(); }
    this.t += dt;
    if (this.scripted || this.attachedTo) {
      this.scriptedStep(dt);
      if (!this.attachedTo) this.ctx.physics.moveActor(this, dt);
      return;
    }
    const p = this.ctx.player;
    const dx = p ? p.pos.x - this.pos.x : 0, dz = p ? p.pos.z - this.pos.z : 0;
    const d = p ? Math.hypot(dx, dz) : Infinity, dy = p ? Math.abs(p.pos.y - this.pos.y) : 0;
    if (this.lock && !this.lock.opened) { this.lock.update(dt); this._syncLock(); }
    if (this.rattleT > 0) this.rattleT -= dt;

    switch (this.stateName) {
      case 'hidden':
        this.vel.set(0, 0, 0);
        if (this.hide === 'meow') {
          this.wobbleT += dt;
          if (this.wobbleT >= RESCUE.wobbleEvery + RESCUE.wobbleDur) this.wobbleT = 0;
        } else if (this.hide === 'stand') this._standCheck(dt, p, d);
        return;
      case 'caged':
        this.vel.set(0, 0, 0);
        if (p && d < 10) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 3, dt);
        break;
      case 'opening': {
        this.cageOpenT += dt;
        if (this.cageOpenT >= 0.35 && !this._hopped) {
          this._hopped = true;
          const f = this.facing, out = (this.cageSize?.[2] ?? 0.5) * 0.5 + 0.55;
          this.vel.set(Math.sin(f) * out / 0.45, 3.4, Math.cos(f) * out / 0.45);
          this.onGround = false; this.flying = false;
          this.visual?.setPose('idle', 0.15); this.visual?.setExpression('happy');
        }
        if (this._hopped && this.onGround && this.cageOpenT > 0.6) { this.vel.x = 0; this.vel.z = 0; this.stateName = 'waiting'; this.rescue(); }
        break;
      }
      case 'waiting': {
        this.vel.x = damp(this.vel.x, 0, this.onGround ? 8 : 0.5, dt); this.vel.z = damp(this.vel.z, 0, this.onGround ? 8 : 0.5, dt);
        if (p) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 4, dt);
        if (this.poseT > 0 && (this.poseT -= dt) <= 0) this.visual?.setPose('idle', 0.3);
        if (p && d <= RESCUE.radius + (p.radius ?? 0.32) && dy < RESCUE.height) this.rescue();
        break;
      }
      case 'rescued': {
        this.leaveT += dt;
        this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt);
        if (this.leaveT >= RESCUE.leaveAfter) { this.stateName = 'leaving'; this.leaveT = 0; this.visual?.setPose('idle', 0.2); this.homeYaw = this._homeYaw(); this.flying = false; }
        break;
      }
      case 'leaving': {
        this.leaveT += dt;
        const s = RESCUE.leaveSpeed;
        this.facing = dampAngle(this.facing, this.homeYaw, 6, dt);
        this.vel.x = damp(this.vel.x, Math.sin(this.homeYaw) * s, 6, dt); this.vel.z = damp(this.vel.z, Math.cos(this.homeYaw) * s, 6, dt);
        if (this.leaveT >= RESCUE.leaveDur - 0.4) this.visual?.setFade(0, 2.5);
        if (this.leaveT >= RESCUE.leaveDur) {
          this.ctx.fx?.burst?.('poof', this.pos, { scale: 0.5 });
          this.stateName = 'gone'; this.object3d.visible = false; this.ghost = true;
        }
        break;
      }
      case 'gone':
        return;
      default: break;
    }
    if (this.sparkleT >= 0) {                    // §7.7: a 3 s sparkle after answering her Meow
      const prev = this.sparkleT; this.sparkleT += dt;
      if (Math.floor(prev / 0.75) !== Math.floor(this.sparkleT / 0.75)) this.ctx.fx?.burst?.('sparkle', this.pos, { count: 5 });
      if (this.sparkleT >= 3) this.sparkleT = -1;
    }
    this.ctx.physics.moveActor(this, dt);
  }

  /** Answer her Meow (CompanionManager forwards E.PLAYER_MEOW). */
  onMeow(pos) {
    if (this.stateName !== 'hidden' || this.hide !== 'meow' || !pos) return false;
    if (Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) > PLAYER.meow.kittenRadius) return false;
    this.reveal();
    return true;
  }

  /** A slash that breaks cracked things went off near the boulder (`break` hide). */
  onSwing(attackId, by) {
    if (this.stateName !== 'hidden' || this.hide !== 'break' || !by) return false;
    const def = ATTACKS[attackId];
    if (!def?.breaks?.includes('cracked')) return false;
    const reach = (def.arc?.range ?? 2.5) + 1.4;
    if (Math.hypot(by.pos.x - this.pos.x, by.pos.z - this.pos.z) > reach) return false;
    this.reveal();
    return true;
  }

  _standCheck(dt, p, d) {
    const o = this.opts, at = o.zoneAt ?? this.home, r = o.zoneR ?? 1.2;
    let ok = !!p && p.alive !== false && p.guarding === true && Math.hypot(p.vel.x, p.vel.z) < 0.35
      && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= r;
    if (ok && o.needClear && !this.cleared) ok = false;
    if (ok) for (const e of this.ctx.enemies?.list ?? []) if (e?.alive && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < 25) { ok = false; break; }
    this.standT = ok ? this.standT + dt : 0;
    if (this.standT >= (o.standTime ?? 3)) this.reveal();
  }

  _homeYaw() {
    const home = this.ctx.levels?.anchor?.('start');
    const p = this.ctx.player;
    if (home?.pos && Math.hypot(home.pos.x - this.pos.x, home.pos.z - this.pos.z) > 4) return Math.atan2(home.pos.x - this.pos.x, home.pos.z - this.pos.z);
    return p ? Math.atan2(this.pos.x - p.pos.x, this.pos.z - p.pos.z) : this.facing + Math.PI;
  }

  // ------------------------------------------------------------------ render

  render(alpha, dt) {
    super.render(alpha);
    const vdt = this.ctx.game.hitstopT > 0 ? 0 : (dt ?? 0);
    if (this.prop && this.hide === 'meow') {                          // hint wobble every 6 s while hidden
      const u = this.stateName === 'hidden' ? (this.wobbleT - RESCUE.wobbleEvery) / RESCUE.wobbleDur : -1;
      this.prop.rotation.z = u >= 0 && u <= 1 ? Math.sin(u * Math.PI * 6) * 0.09 * (1 - u) : 0;
      this.prop.rotation.x = u >= 0 && u <= 1 ? Math.cos(u * Math.PI * 5) * 0.04 * (1 - u) : 0;
    }
    if (this.cage) {
      if (this.cageOpenT != null) this.cage.userData.setOpen?.(easeOutCubic(clamp01(this.cageOpenT / 0.35)));
      this.cage.rotation.z = this.rattleT > 0 ? Math.sin(this.rattleT * 60) * 0.04 : 0;
    }
    if (this.visual && this.object3d.visible) {
      const p = this.ctx.player;
      const near = p && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < RESCUE.waveRadius;
      this.visual.setWave((this.stateName === 'waiting' && near) || (this.stateName === 'caged' && near && (this.t % 3) < 1.4));
      this.visual.lookAt(p && this.stateName !== 'leaving' ? wrapAngle(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.facing) : 0);
      this.visual.update(vdt, { velocity: this.vel, onGround: this.onGround || this.flying, frameId: this.ctx.game.frameCount });
    }
    this.bubble.update(vdt);
  }

  dispose() {
    this.disposed = true;
    for (const w of this._clipWaits) w.r();
    this._clipWaits.length = 0;
    if (this.lock && !this.lock.opened) { this.lock.opened = true; this.ctx.actors.unregister(this.lock); }
    if (this.cage) this.cage.traverse((c) => { if (c.isMesh) c.geometry?.dispose(); });
    this.propRoot?.removeFromParent();
    this.visual?.dispose();
    this.bubble.dispose();
    super.dispose();
  }
}
