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
import { CATS, lostKittenConfig, buildCage, visualDt } from '../characters/index.js';
import { KittenVisual } from './KittenVisual.js';
import { TextSprite } from './Bubble.js';
import { lineText } from './lines.js';
import { COMPANION_IDS, groundY } from './steering.js';

export const HIDES = Object.freeze(['meow', 'cage', 'stand', 'break', 'climb']);

/** Hiding props this area builds (the Crow Fields cow is world's `placed` creature: no prop here). */
export const HIDE_PROPS = {
  barrel: { model: 'models/env/village-kaykit/decoration/barrel.glb', fit: { h: 0.9 }, top: 0.82 },
  bush: { model: 'models/env/nature/plant_bushLarge.glb', fit: { h: 1.05 }, top: 0.5 },
};

/**
 * The squire cage cart (§12.3 Old Bridge, D-01 Mochi): Kenney's open `cart` fitted to 2.0 m long with the procedural
 * bars on its bed. (`cart-high` from §12.3 carries a load of sacks that fills the bed, so the bars had nowhere to sit.)
 * `offset` slides the cart (local X) so the middle of its bed is under the cage; `footprint` is the collider [x, z].
 */
export const CAGE_CART = {
  model: 'models/env/town/cart.glb', fit: { max: 2.0 }, yaw: Math.PI / 2, offset: -0.27,
  bedY: 0.5, size: [1.3, 1.0, 1.0], footprint: [2.0, 1.35],
};

export const RESCUE = { standClearR: 15, radius: 1.3, height: 1.6, leaveAfter: 2.8, leaveDur: 2.6, leaveSpeed: 2.2, wobbleEvery: 6, wobbleDur: 0.7, waveRadius: 7 };

const _v = new THREE.Vector3();
/** Hop-out directions tried around "toward her" (radians), nearest first. */
const HOP_TRIES = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, Math.PI];

/**
 * The breakable cage lock: a fixed `neutral` actor flagged `breakable` (requests/combat.md) so only player-side
 * attacks reach it, and only her blows count (companions, enemies and stray projectiles are immune). Tagged `prop`
 * so lock-on, threat arrows and companion targeting skip it (the world PropActor convention).
 */
export class CageLock extends Actor {
  constructor(ctx, owner, { pos, facing = 0, radius = 0.45, height = 0.9, hits = 3, hp = null } = {}) {
    super(ctx, { faction: 'neutral', radius, height, maxHp: hp ?? 1e4, mass: 100, maxPoise: 1e4 });
    this.owner = owner;
    this.fixed = true;
    this.breakable = true;
    this.hitsNeeded = hp == null ? hits : null;
    this.hits = 0; this.opened = false;
    this.tags.add('breakable'); this.tags.add('cage'); this.tags.add('prop');
    this.home = pos.clone(); this.pos.copy(pos); this.facing = facing;
    this.object3d.name = 'cageLock';
    this.snap();
  }
  /** Only her blows (or her reflected shots) count. */
  resolveIncoming(att) {
    const her = att?.faction === 'player' || att?.owner?.faction === 'player' || att?.tags?.has?.('player');
    return her ? 'hit' : 'immune';
  }
  onHit() {
    this.hits++; this.hold();
    this.owner.rattle();
    if (this.hitsNeeded != null && this.hits >= this.hitsNeeded) this.open();
  }
  /** Lethal blow on an hp lock (companion cages: 30 HP). */
  onDeath() { this.open(); }
  hold() { this.pos.copy(this.home); this.vel.set(0, 0, 0); this.staggerT = 0; this.poise = this.maxPoise; }
  open() {
    if (this.opened) return;
    this.opened = true; this.alive = false; this.hurtable = false;
    this.ctx.actors.unregister(this);
    this.owner.openCage();
  }
  /** Ticks the per-hit anti-multi-hit window (Combat sets `invulnT` on every hit; Actor subclasses own the countdown). */
  update(dt = 0) {
    this.invulnT = Math.max(0, (this.invulnT ?? 0) - dt);
    if (!this.opened) this.hold();
  }
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
    if (this.hide === 'cage') { this._buildCage(); this.collideActors = false; }   // sits inside the lock's solid circle
    if (this.hide === 'meow' && HIDE_PROPS[o.prop]) this._loadProp(o.prop);
    if (this.visual) {
      this.visual.setPose(this.hide === 'cage' ? 'sit' : 'idle', 0);
      this.visual.setExpression(this.hide === 'cage' ? 'worried' : 'happy');
      if (this.hidden) this.visual.snapFade(0);
    }
    this.object3d.visible = !this.hidden;
    // already home? (a reload after the rescue): vanish on the first step
    // (a squire who already joined the party doesn't sit in the cage again either)
    const home = companion ? !!ctx.state?.companions?.unlocked?.includes?.(kittenId) : !!ctx.state?.hasKitten?.(kittenId);
    if (home) {
      this.rescued = true; this.hidden = false; this.stateName = 'gone'; this.object3d.visible = false; this.ghost = true;
      if (this.lock) this.lock.opened = true;
      this.cage?.userData?.setOpen?.(1); this.cageOpenT = 1;          // the empty cage stays, door open
    }
    this.snap();
  }

  /** Called by CompanionManager once registered (actor list + scene). */
  attachToWorld() {
    const g = groundY(this.ctx, this.home.x, this.home.z, this.home.y);
    this.home.y = g;
    if (!(this.perchY > 0) && this.pos.y > g + 0.3) { this.perchY = this.pos.y - g; this.flying = true; }   // given a 3D perch
    this.pos.y = g + (this.perchY > 0 ? this.perchY : 0);
    if (this.cage) this.cage.position.y = this.perchY > 0 ? this.perchY : 0;
    if (this.lock) this.lock.height = (this.cageSize?.[1] ?? 0.75) + (this.perchY > 0 ? this.perchY : 0);
    if (this.lock) this.lock.home.y = g;
    this.snap();
    if (this.propRoot) { this.propRoot.position.set(this.home.x, g, this.home.z); this.ctx.scene?.add(this.propRoot); }
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
    // A given perch height `y` means the level already built the surface the cage stands on (world's meadow places
    // `cart-high` at the Old Bridge and passes its bed height): then we add only the bars, not a second cart.
    const cart = style === 'cart' && o.cartModel !== false && !(o.y > 0);
    if (cart && !(this.perchY > 0)) { this.perchY = CAGE_CART.bedY; this.flying = true; }
    const size = o.size ?? (style === 'cart' ? CAGE_CART.size : this.companion ? [1.3, 1.2, 1.0] : undefined);
    const root = this._propRoot();
    try {
      this.cage = buildCage({ style, size, ribbon: o.ribbon ?? false });
      if (this.perchY > 0) this.cage.position.y = this.perchY;
      root.add(this.cage);
    } catch (e) { console.warn('[companions] cage build failed', e); }
    const sz = this.cage?.userData?.size ?? size ?? [0.6, 0.75, 0.5];
    this.cageSize = sz;
    if (cart) this._loadCart();
    const lockPos = this.home.clone();
    this.lock = new CageLock(this.ctx, this, { pos: lockPos, facing: this.facing, radius: Math.max(sz[0], sz[2]) * 0.5, height: sz[1] + this.perchY, hits: o.hits ?? 3, hp: o.hp ?? (this.companion ? 30 : null) });
  }

  /** The rat cage cart under a squire's cage (§12.3 Old Bridge): fitted GLB + a box collider for everyone but us. */
  async _loadCart() {
    const root = this._propRoot();
    const c = CAGE_CART, f = this.facing;
    // collider in world space (the cart's footprint, rotated with the kitten's facing)
    this.cartCollider = { x: this.home.x + Math.cos(f) * c.offset, z: this.home.z - Math.sin(f) * c.offset, hx: c.footprint[0] / 2, hz: c.footprint[1] / 2, yaw: f, y0: -Infinity,
      y1: Infinity, walkable: false, factions: ['player', 'enemy', 'ally'] };
    try { this.ctx.physics?.addCollider?.(this.cartCollider); } catch (e) { console.warn('[companions] cart collider failed', e); this.cartCollider = null; }
    try {
      const m = await this.ctx.assets.model(c.model, { fit: c.fit, castShadow: true, receiveShadow: true });
      if (this.disposed) return;
      m.root.rotation.y = c.yaw; m.root.position.x = c.offset;
      this.cart = m.root; root.add(m.root);
    } catch (e) { console.warn('[companions] cage cart failed', e); }
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
    const line = lineText(this.ctx, 'kitten.' + this.kittenId);
    this.bubble.show(line, RESCUE.leaveAfter);
    this.ctx.companions?.babble?.(this, line);
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
        // pinned inside the bars: the cart / level colliders around the cage must not push us out
        this.vel.set(0, 0, 0);
        this.pos.set(this.home.x, this.home.y + (this.perchY > 0 ? this.perchY : 0), this.home.z);
        this.onGround = true;
        if (p && d < 10) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 3, dt);
        return;
      case 'opening': {
        // the door swings open (0.35 s), then a scripted hop toward her onto free ground: no collisions on the way,
        // so the cart (ours or the level's) can't catch the kitten mid-air or shove it out the far side
        this.cageOpenT += dt;
        if (this.cageOpenT >= 0.35 && !this.hop) {
          const to = this._hopTarget(new THREE.Vector3());
          const d = Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
          this.hop = { from: this.pos.clone(), to, t: 0, dur: 0.45 + 0.12 * d, h: 0.45 + 0.1 * d };
          this.ghost = true; this.onGround = false;
          if (d > 1e-3) this.facing = Math.atan2(to.x - this.pos.x, to.z - this.pos.z);
          this.visual?.setPose('idle', 0.15); this.visual?.setExpression('happy');
        }
        const h = this.hop;
        if (h) {
          h.t += dt;
          const u = clamp01(h.t / h.dur);
          this.pos.set(h.from.x + (h.to.x - h.from.x) * u, h.from.y + (h.to.y - h.from.y) * u + 4 * h.h * u * (1 - u), h.from.z + (h.to.z - h.from.z) * u);
          this.vel.set((h.to.x - h.from.x) / h.dur, 0, (h.to.z - h.from.z) / h.dur);
          if (u >= 1) {
            this.hop = null; this.ghost = false; this.flying = false; this.onGround = true; this.collideActors = true;
            this.vel.set(0, 0, 0);
            this.visual?.punch(-0.15);
            this.stateName = 'waiting'; this.rescue();
          }
        }
        return;
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
    // her Stand, or the Meme Cam pose it turns into after 2.5 s (§7.8 manual trigger): "I thought you were a statue"
    const standing = p?.guarding === true || p?.stateName === 'memecam' || this.ctx.game?.mode === 'memecam';
    let ok = !!p && p.alive !== false && standing && Math.hypot(p.vel.x, p.vel.z) < 0.35
      && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= r;
    if (ok && o.needClear && !this.cleared) ok = false;
    if (ok) for (const e of this.ctx.enemies?.list ?? []) if (e?.alive && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < RESCUE.standClearR) { ok = false; break; }
    this.standT = ok ? this.standT + dt : 0;
    if (this.standT >= (o.standTime ?? 3)) this.reveal();
  }

  /**
   * Where a freed kitten lands: toward her, just clear of the cage (and of the cart under a perched cage), on free
   * walkable ground (no static collider, no deep water); other directions are tried when that spot is blocked.
   * Writes into `out` (y = the ground there).
   */
  _hopTarget(out) {
    const ph = this.ctx.physics, p = this.ctx.player, hx = this.home.x, hz = this.home.z;
    const base = p && Math.hypot(p.pos.x - hx, p.pos.z - hz) > 0.3 ? Math.atan2(p.pos.x - hx, p.pos.z - hz) : this.facing;
    const half = Math.max(this.cageSize?.[0] ?? 0.5, this.cageSize?.[2] ?? 0.5) * 0.5;
    const dist = this.perchY > 0.3 ? half + 1.15 : half + 0.55;
    const r = this.radius + 0.1;
    for (const k of [1, 1.4]) {
      for (const off of HOP_TRIES) {
        const a = base + off, x = hx + Math.sin(a) * dist * k, z = hz + Math.cos(a) * dist * k;
        if (ph?.blockedAt?.(x, z, r)) continue;
        if (ph?.isDeepWater?.(x, z)) continue;
        if (ph?.inBounds && !ph.inBounds(x, z, 0.5)) continue;
        return out.set(x, groundY(this.ctx, x, z, this.home.y), z);
      }
    }
    const x = hx + Math.sin(base) * dist, z = hz + Math.cos(base) * dist;
    return out.set(x, groundY(this.ctx, x, z, this.home.y), z);
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
    const vdt = visualDt(this.ctx, dt ?? 0);         // 0 in hitstop / the pause menu, × slow-mo
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
      this.visual.update(dt ?? 0, { velocity: this.vel, onGround: this.onGround || this.flying });
    }
    this.bubble.update(vdt);
  }

  /**
   * Hand the hiding prop / the opened cage (and the cart's collider) over to the level: they stay after we leave.
   * CompanionManager keeps them until the level unloads. Returns null when there is nothing to keep.
   */
  releaseDressing() {
    const root = this.propRoot;
    if (!root) return null;
    const d = { root, collider: this.cartCollider ?? null, cage: this.cage ?? null };
    if (this.cage) this.cage.rotation.z = 0;
    if (this.prop) { this.prop.rotation.set(0, 0, 0); }
    this.propRoot = null; this.cartCollider = null; this.cage = null; this.prop = null; this.cart = null;
    return d;
  }

  dispose() {
    this.disposed = true;
    for (const w of this._clipWaits) w.r();
    this._clipWaits.length = 0;
    if (this.lock && !this.lock.opened) { this.lock.opened = true; this.ctx.actors.unregister(this.lock); }
    if (this.cage) this.cage.traverse((c) => { if (c.isMesh) c.geometry?.dispose(); });
    if (this.cartCollider) { try { this.ctx.physics?.removeCollider?.(this.cartCollider); } catch { /* level gone */ } this.cartCollider = null; }
    this.propRoot?.removeFromParent();
    this.visual?.dispose();
    this.bubble.dispose();
    super.dispose();
  }
}
