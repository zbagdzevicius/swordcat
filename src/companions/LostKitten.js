// src/companions/LostKitten.js  (owner: companions) — the 18 lost kittens (GAME_DESIGN §3.5, §6.4, §12.1), the
// caged companions (Mochi D-01, Sage D-02, Clover D-04) and the rescued service kittens (§3.4: Marmalade D-03,
// Tofu / Earl Grey D-04, Pip D-06), which play their scene instead of counting as lost kittens.
// Hides (§12.1 `kind: 'kitten'`):
//   meow   hidden until her Meow within PLAYER.meow.kittenRadius (10 m); the hiding barrel / bush wobbles every 6 s
//   cage   visible behind bars; 3 hits open the cage (companion cages: `hp` 30, `needClear` arena first)
//   stand  appears after a 3 s planted Stand within r 1.2 of the zone centre with no enemy near (+ `needClear`)
//   break  behind a cracked boulder: a Bright / Holy slash (ATTACKS[*].breaks 'cracked') nearby, or reveal()
//   climb  in plain view, hard to reach (`y` = perch height above the ground)
// Cage variants (M2): `hang` (Sage's treetop cage hangs on a rope at that height and is lowered by `lower()` when the
// rope posts are cut: its `lowerOn` objective / flag, or our own `ropes` posts), `cage: 'stocks'` (Clover: freed by
// 3 blows or E), `cageWith: <hostId>` (a guest sharing the host's cage: Tater / Mittens / Pip in the war-wagon).
// `appearOn: <arenaId>` keeps the kitten out of sight until that arena clears (Marmalade peeking out of the bakery).
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
import { COMPANION_IDS, SERVICE_IDS, SERVICE_FLAGS, SERVICE_SCENES, groundY, lodOrigin } from './steering.js';
import { buildStocks, buildRopePost, buildRope, disposeDressing } from './dressing.js';

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

export const RESCUE = { standClearR: 15, radius: 1.3, height: 1.6, leaveAfter: 2.8, leaveDur: 2.6, leaveSpeed: 2.2, wobbleEvery: 6, wobbleDur: 0.7, waveRadius: 7,
  knockR: 1.7, talkR: 3.2, guestStagger: 0.18 };

/** Sage's treetop cage (§12.4): hangs at 4 m on a rope over the branch, lowered over 2 s; the rope posts hold 30 HP. */
export const HANG = { lowerDur: 2.0, ropeTop: 3.2, postHp: 30, size: [0.95, 1.0, 0.95] };

/**
 * Barrel stack (§12.5 forge: Tofu hides in the 3rd of 6): the other five barrels around his, in his barrel's local
 * frame [x, z] (+z = toward the street): his is the middle of the front row.
 */
export const BARREL_STACK = [[-0.95, 0], [0.95, 0], [-0.95, -0.95], [0, -0.95], [0.95, -0.95]];

const _v = new THREE.Vector3(), _rA = new THREE.Vector3(), _rB = new THREE.Vector3();
const _lod = { x: 0, z: 0 };
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

/**
 * A rope post holding Sage's treetop cage (our fallback when the level brings no `ropes` objective): a breakable
 * `neutral` prop like the cage lock (her blows only, `hp` 30); cutting it calls the kitten's ropeCut().
 */
export class RopePost extends CageLock {
  constructor(ctx, owner, { pos, hp = HANG.postHp } = {}) {
    super(ctx, owner, { pos, radius: 0.32, height: 1.1, hp });
    this.tags.delete('cage'); this.tags.add('rope');
    this.object3d.name = 'ropePost';
  }
  onHit() { this.hold(); this.mesh && (this.mesh.rotation.z = 0.05); this.owner.visual?.punch(-0.08); }
  open() {
    if (this.opened) return;
    this.opened = true; this.alive = false; this.hurtable = false;
    this.ctx.actors.unregister(this);
    this.owner.ropeCut(this);
  }
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
    const service = SERVICE_IDS.includes(kittenId);
    const look = companion || service ? CATS[kittenId] : lostKittenConfig(kittenId);
    const scale = look?.scale ?? 0.72;
    super(ctx, { faction: 'neutral', radius: 0.2 * scale / 0.72, height: 0.95 * scale, maxHp: 1, mass: 0.5 });
    this.kittenId = kittenId;
    this.companion = companion;
    /** a service kitten (Marmalade, Tofu, Earl Grey, Pip): plays its scene, never counts as a lost kitten */
    this.service = service;
    this.tags.add('kitten'); this.tags.add(companion ? 'caged' : service ? 'rescue' : 'lost');
    this.hurtable = false;
    /** the cage this guest shares (war-wagon: Tater / Mittens / Pip in Tater's cage) */
    this.host = o.host ?? null;
    /** guests sharing our cage */
    this.guests = [];
    this.hide = this.host ? 'cage' : HIDES.includes(o.hide) ? o.hide : null;
    this.opts = o;
    this.hidden = this.hide === 'meow' || this.hide === 'stand' || this.hide === 'break' || !!o.appearOn;
    this.rescued = false;
    this.stateName = this.hidden ? 'hidden' : this.hide === 'cage' ? 'caged' : 'waiting';
    this.ghost = this.hidden;                            // no collisions while tucked away
    if (o.pos) this.pos.copy(o.pos);
    this.home = this.pos.clone();
    this.perchY = o.y ?? 0;
    if (this.perchY > 0) this.flying = true;            // perched above the heightfield (balcony, wagon bed)
    this.facing = o.facing ?? 0;
    this.standT = 0; this.wobbleT = 0; this.leaveT = 0; this.sparkleT = -1; this.t = 0;
    /** sim time (this.t) it became visible: autoRescue counts from here */
    this.revealT = this.hidden ? null : 0;
    this.cleared = false;
    /** Sage's treetop cage: hanging until lower() (then 'lowering' → the door pops) */
    this.hanging = this.hide === 'cage' && o.hang > 0 && !this.host;
    this.ropePosts = [];
    this.interactable = null;
    this.object3d.name = 'kitten:' + kittenId;
    this.visual = null;
    if (o.visual !== false) { this.visual = new KittenVisual(ctx, look); this.object3d.add(this.visual.root); }
    this.bubble = new TextSprite({ kind: 'bubble', y: this.height + 0.3 });
    this.object3d.add(this.bubble.object);
    this.propRoot = null; this.prop = null; this.cage = null; this.lock = null; this.cageOpen = 0; this.rattleT = 0;
    this._clipWaits = [];
    if (this.hide === 'cage' && !this.host) { this._buildCage(); this.collideActors = false; }   // sits inside the lock's solid circle
    else if (this.host) { this.collideActors = false; this.cageSize = this.host.cageSize; }
    if (this.hide === 'meow' && HIDE_PROPS[o.prop]) this._loadProp(o.prop);
    if (this.hide === 'meow' && o.prop === 'barrel' && o.stack > 1) this._loadStack(Math.min(o.stack - 1, BARREL_STACK.length));
    if (this.visual) {
      this.visual.setPose(this.hide === 'cage' && o.cage !== 'stocks' ? 'sit' : 'idle', 0);
      this.visual.setExpression(this.hide === 'cage' ? 'worried' : 'happy');
      if (this.hidden) this.visual.snapFade(0);
    }
    this.object3d.visible = !this.hidden;
    // already home? (a reload after the rescue): vanish on the first step
    // (a squire who already joined the party doesn't sit in the cage again either)
    const home = companion ? !!ctx.state?.companions?.unlocked?.includes?.(kittenId)
      : service ? !!ctx.state?.getFlag?.(SERVICE_FLAGS[kittenId]) : !!ctx.state?.hasKitten?.(kittenId);
    if (home) {
      this.rescued = true; this.hidden = false; this.stateName = 'gone'; this.object3d.visible = false; this.ghost = true;
      if (this.lock) this.lock.opened = true;
      this.cage?.userData?.setOpen?.(1); this.cageOpenT = 1;          // the empty cage stays, door open
      if (this.hanging) { this.hanging = false; this.perchY = 0; this.flying = false; }   // the cage was lowered
      if (service && o.stay) {                                     // Marmalade keeps his post at the bakery door
        this.stateName = 'stay'; this.object3d.visible = true; this.ghost = false;
        if (this.visual) this.visual.snapFade(1);
      }
    }
    this.homeFacing = this.facing;
    this.snap();
  }

  /** A guest joins our cage (cageWith): it opens with us. */
  addGuest(g) {
    if (!this.guests.includes(g)) { this.guests.push(g); const n = this.guests.length; g.hopYaw = (n % 2 ? 1 : -1) * 0.75 * Math.ceil(n / 2); } if (this.lock?.opened || this.stateName !== 'caged') g._hostOpened(); }

  /** Our host's cage opened (or was already open on a reload): hop out shortly after the host. */
  _hostOpened() {
    if (this.stateName !== 'caged') return;
    const i = Math.max(0, this.host?.guests?.indexOf(this) ?? 0);
    this.stateName = 'opening'; this.cageOpenT = -RESCUE.guestStagger * (i + 1);
  }

  /** Called by CompanionManager once registered (actor list + scene). */
  attachToWorld() {
    const h = this.host;
    if (h) {                                                      // a guest sits beside the host inside its cage
      const off = this.opts.off ?? [0.3, 0], f = h.facing;
      this.home.set(h.home.x + Math.cos(f) * off[0] + Math.sin(f) * off[1], h.home.y, h.home.z - Math.sin(f) * off[0] + Math.cos(f) * off[1]);
      this.perchY = h.perchY; this.flying = h.perchY > 0;
      this.pos.set(this.home.x, this.home.y + this.perchY, this.home.z);
      this.snap();
      h.addGuest(this);
      return;
    }
    const g = groundY(this.ctx, this.home.x, this.home.z, this.home.y);
    this.home.y = g;
    if (!(this.perchY > 0) && this.pos.y > g + 0.3) { this.perchY = this.pos.y - g; this.flying = true; }   // given a 3D perch
    this.pos.y = g + (this.perchY > 0 ? this.perchY : 0);
    if (this.cage) this.cage.position.y = this.perchY > 0 ? this.perchY : 0;
    if (this.lock) this.lock.height = (this.cageSize?.[1] ?? 0.75) + (this.perchY > 0 ? this.perchY : 0);
    if (this.lock) this.lock.home.y = g;
    this.snap();
    if (this.propRoot) { this.propRoot.position.set(this.home.x, g, this.home.z); this.ctx.scene?.add(this.propRoot); }
    if (this.hanging) this._buildRopes();
    if (this.opts.interact && this.lock) this._addInteract();
    this._syncLock();
  }

  // ------------------------------------------------------------------ M2 cage variants

  /** The rope from the hanging cage up to the branch, and (our own fallback) the rope posts that hold it. */
  _buildRopes() {
    const root = this._propRoot(), top = (this.cageSize?.[1] ?? 1) + this.perchY;
    // the rope runs up to the level's branch ring when it has one right above us (world's `treetop_branch`)
    const br = this.ctx.levels?.anchor?.(this.opts.branch ?? 'treetop_branch');
    this.branchY = br?.pos && Math.hypot(br.pos.x - this.home.x, br.pos.z - this.home.z) < 2 && br.pos.y - this.home.y > top + 0.5
      ? br.pos.y - 0.4 - this.home.y : top + HANG.ropeTop;
    this.rope = buildRope(new THREE.Vector3(0, top, 0), new THREE.Vector3(0, this.branchY, 0));
    root.add(this.rope);
    for (const at of this.opts.ropes ?? []) {
      const x = at[0], z = at[1], y = groundY(this.ctx, x, z, this.home.y);
      const post = new RopePost(this.ctx, this, { pos: new THREE.Vector3(x, y, z), hp: this.opts.ropeHp ?? HANG.postHp });
      post.mesh = buildRopePost();
      post.mesh.position.set(x - this.home.x, y - this.home.y, z - this.home.z);
      post.mesh.rotation.y = -this.facing;
      // a guy rope from the post's coil up to the cage's top ring
      post.line = buildRope(new THREE.Vector3(post.mesh.position.x, post.mesh.position.y + 0.85, post.mesh.position.z), new THREE.Vector3(0, top, 0), 0.015);
      root.add(post.mesh, post.line);
      // the group rotates with our facing: express the post in that frame
      const c = Math.cos(this.facing), sn = Math.sin(this.facing), lx = post.mesh.position.x, lz = post.mesh.position.z;
      post.mesh.position.set(lx * c - lz * sn, post.mesh.position.y, lx * sn + lz * c);
      post.line.userData.set(new THREE.Vector3(post.mesh.position.x, post.mesh.position.y + 0.85, post.mesh.position.z), new THREE.Vector3(0, top, 0));
      this.ropePosts.push(post);
      this.ctx.actors.register(post);
      post.collider = { x, z, r: 0.14, y0: y - 1, y1: y + 1.1 };
      try { this.ctx.physics?.addCollider?.(post.collider); } catch { post.collider = null; }
    }
  }

  /** A rope post was cut (her blows): when every post is cut the cage comes down. */
  ropeCut(post) {
    post.mesh?.userData?.setCut?.(true);
    if (post.line) post.line.visible = false;
    this.ctx.fx?.burst?.('wood', post.pos, { count: 8 });
    const cut = this.ropePosts.filter((p) => p.opened).length, max = this.ropePosts.length;
    this.ctx.bus.emit(E.OBJECTIVE, { id: this.opts.ropesId ?? 'treetop_ropes', value: cut, max, textKey: 'obj.ropes', frozen: false, done: cut >= max });
    if (cut >= max) this.lower();
  }

  /** Lower the hanging cage to the ground (§12.4: 3/3 ropes → it lowers over 2 s), then pop the door. */
  lower(dur = HANG.lowerDur) {
    if (!this.hanging || this.stateName !== 'caged') return false;
    this.hanging = false;
    this.stateName = 'lowering'; this.lowerT = 0; this.lowerDur = Math.max(0.01, dur); this.lowerFrom = this.perchY;
    this.ctx.audio?.play3D?.('world/creak1', this.pos);
    return true;
  }

  /** E next to the stocks / cage frees the prisoner (when the lock is in play). Lives in the level's interactables. */
  _addInteract() {
    const list = this.ctx.levels?.current?.interactables;
    if (!Array.isArray(list)) return;
    const pos = this.home.clone();
    this.interactable = {
      id: 'free_' + this.kittenId, kind: 'rescue', pos, r: 1.9, prompt: this.opts.prompt ?? 'prompt.interact',
      enabled: () => !!this.lock && !this.lock.opened && this.lock.hurtable !== false && (!this.opts.needClear || this.cleared),
      use: () => { if (this.lock && !this.lock.opened) this.lock.open(); },
    };
    list.push(this.interactable);
  }

  _removeInteract() {
    const list = this.ctx.levels?.current?.interactables, it = this.interactable;
    if (it && Array.isArray(list)) { const i = list.indexOf(it); if (i >= 0) list.splice(i, 1); }
    this.interactable = null;
  }

  /** Five more barrels around ours (the forge stack, §12.5): dressing that stays, with small colliders. */
  async _loadStack(n) {
    const def = HIDE_PROPS.barrel, root = this._propRoot();
    this.stackColliders = [];
    for (let i = 0; i < n; i++) {
      const [lx, lz] = BARREL_STACK[i];
      const c = Math.cos(this.facing), sn = Math.sin(this.facing);
      const wx = this.home.x + lx * c + lz * sn, wz = this.home.z - lx * sn + lz * c;
      const col = { x: wx, z: wz, r: 0.38, y0: -Infinity, y1: Infinity };
      try { this.ctx.physics?.addCollider?.(col); this.stackColliders.push(col); } catch { /* no physics */ }
    }
    for (let i = 0; i < n; i++) {
      try {
        const m = await this.ctx.assets.model(def.model, { fit: def.fit, receiveShadow: true, castShadow: true });
        if (this.disposed && !this._released) return;
        const [lx, lz] = BARREL_STACK[i];
        m.root.position.set(lx, 0, lz); m.root.rotation.y = i * 1.3;
        root.add(m.root);
      } catch (e) { console.warn('[companions] barrel stack failed', e); return; }
    }
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
    const o = this.opts, style = this.hanging ? 'hanging' : o.cage ?? (this.companion ? 'cart' : 'carry');
    if (style === 'stocks') return this._buildStocks();
    if (this.hanging) { this.perchY = o.hang; this.flying = true; }
    // A given perch height `y` means the level already built the surface the cage stands on (world's meadow places
    // `cart-high` at the Old Bridge and passes its bed height): then we add only the bars, not a second cart.
    const cart = style === 'cart' && o.cartModel !== false && !(o.y > 0);
    if (cart && !(this.perchY > 0)) { this.perchY = CAGE_CART.bedY; this.flying = true; }
    const size = o.size ?? (style === 'hanging' ? HANG.size : style === 'cart' ? CAGE_CART.size : this.companion ? [1.3, 1.2, 1.0] : undefined);
    const root = this._propRoot();
    try {
      this.cage = buildCage({ style, size, ribbon: o.ribbon ?? false });
      if (this.perchY > 0) this.cage.position.y = this.perchY;
      root.add(this.cage);
    } catch (e) { console.warn('[companions] cage build failed', e); }
    const sz = this.cage?.userData?.size ?? size ?? [0.6, 0.75, 0.5];
    if (style === 'hanging' && this.cage) { this.cage.userData.size = sz; this.cage.rotation.y = Math.PI; }   // door toward her path
    this.cageSize = sz;
    if (cart) this._loadCart();
    const lockPos = this.home.clone();
    this.lock = new CageLock(this.ctx, this, { pos: lockPos, facing: this.facing, radius: Math.max(sz[0], sz[2]) * 0.5, height: sz[1] + this.perchY, hits: o.hits ?? 3, hp: o.hp ?? (this.companion ? 30 : null) });
  }

  /** Clover's town stocks (§12.5): she stands behind the board; 3 blows or E lift it. */
  _buildStocks() {
    const o = this.opts, root = this._propRoot();
    const neckY = Math.max(0.4, this.height * 0.68);
    this.cage = buildStocks({ neckY });
    this.cage.position.z = 0.16;                                 // the board in front of her chest
    root.add(this.cage);
    const sz = this.cage.userData.size;
    this.cageSize = sz;
    this.lock = new CageLock(this.ctx, this, { pos: this.home.clone(), facing: this.facing, radius: 0.55, height: sz[1], hits: o.hits ?? 3, hp: o.hp ?? null });
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
    const open = (!this.opts.needClear || this.cleared) && !this.hanging;
    const reg = this.ctx.actors.has?.(l) ?? false;
    if (open && !reg) { l.alive = true; l.hurtable = true; this.ctx.actors.register(l); }
    else if (!open && reg) { this.ctx.actors.unregister(l); l.hurtable = false; }
    else if (!open) l.hurtable = false;
  }

  /** An arena cleared (CompanionManager forwards ARENA_CLEAR). */
  onArenaClear(id) {
    if (this.opts.needClear && id === this.opts.needClear) { this.cleared = true; this._syncLock(); }
    if (this.opts.appearOn && id === this.opts.appearOn && this.stateName === 'hidden') this.reveal();
  }

  rattle() { this.rattleT = 0.25; this.visual?.punch(-0.15); this.visual?.emote('earsFlat'); }

  openCage() {
    if (this.stateName !== 'caged' && this.stateName !== 'lowering') return;
    this.stateName = 'opening'; this.cageOpenT = 0;
    if (this.lock && !this.lock.opened) { this.lock.opened = true; this.ctx.actors.unregister(this.lock); }
    this._removeInteract();
    this.ctx.fx?.burst?.('sparkle', this.pos, { count: 10 });
    this.ctx.bus.emit(E.BURST, { kind: 'cage', position: this.pos.clone(), count: 0 });
    for (const g of this.guests) g._hostOpened();
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
    this.revealT = this.t;
    if (this.hide === 'stand') { this.visual?.setPose('vigil', 0); this.poseT = 2.2; }   // copying her Stand
    this.visual?.emote('meow');
    this.visual?.setExpression('surprised');
    this.sparkleT = 0;
    this.snapFacing();
    this.ctx.fx?.burst?.('sparkle', this.pos, { count: 12 });
    this.ctx.bus.emit(E.KITTEN_REVEAL, { kittenId: this.kittenId, position: this.pos.clone() });
  }

  snapFacing() { this.prevFacing = this.facing; }

  // ------------------------------------------------------------------ click / tap (iso controls)

  /**
   * What the camera's picker sees (CONTROLS_SPEC §7.6): a revealed kitten waiting for her is 'kitten' (tap it: she
   * walks over and the contact rescues it); a service kitten staying put after its scene (Marmalade at the door) is
   * 'npc'. Hidden kittens are never pickable (a hover ring would give the hiding place away); a cage is the lock's
   * (combat's breakable).
   */
  get pickKind() {
    if (this.hidden || this.scripted || this._far || !this.object3d.visible) return null;
    if (this.stateName === 'waiting' && !this.rescued) return 'kitten';
    if (this.stateName === 'stay') return 'npc';
    return null;
  }
  /** How close a `use` order walks: inside the contact radius, so arriving is the rescue. */
  get useR() { return Math.max(0.6, RESCUE.radius - 0.2); }
  /** She clicked it and arrived: a waiting kitten within reach is rescued; a staying one waves. */
  use() {
    const p = this.ctx.player;
    if (!p || this.scripted) return false;
    if (this.stateName === 'waiting' && !this.rescued) {
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d <= RESCUE.radius + (p.radius ?? 0.32) + 0.4) { this.rescue(); return true; }
      this.visual?.hop(0.2); this.visual?.emote('meow');
      return false;
    }
    if (this.stateName === 'stay') { this.visual?.hop(0.15); this.visual?.emote('nod'); return true; }
    return false;
  }

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
    if (this.service) { this._serviceRescue(); return; }
    this.ctx.state?.addKitten?.(this.kittenId);
    this.ctx.bus.emit(E.KITTEN_RESCUED, { kittenId: this.kittenId });
    this.visual?.setPose('cheer', 0.2); this.visual?.setExpression('happy'); this.visual?.hop(0.35);
    const line = lineText(this.ctx, 'kitten.' + this.kittenId);
    this.bubble.show(line, RESCUE.leaveAfter);
    this.ctx.companions?.babble?.(this, line);
    this.ctx.fx?.burst?.('sparkle', this.pos, { count: 14 });
    this.ctx.companions?.onKittenRescued?.(this);
  }

  /**
   * A service kitten is out (§5.4 D-03 / D-04 / D-06): play its scene (its end sets the flag; we set it ourselves if no
   * story is there), then it heads to `leaveTo` (Pip runs off to the gatehouse; Tofu to the forge) and poofs, or
   * stays put (`stay`: Marmalade at the bakery door).
   */
  _serviceRescue() {
    const id = this.kittenId, flag = SERVICE_FLAGS[id], play = this.opts.play ?? SERVICE_SCENES[id];
    this.visual?.setPose('idle', 0.2); this.visual?.setExpression(this.opts.expression ?? 'happy'); this.visual?.hop(0.25);
    this.ctx.fx?.burst?.('sparkle', this.pos, { count: 12 });
    this.serviceDone = false;
    const finish = () => {
      if (this.serviceDone) return;
      this.serviceDone = true;
      const st = this.ctx.state;
      if (flag && st && !st.getFlag?.(flag)) this.ctx.story?.flag ? this.ctx.story.flag(flag, true) : st.setFlag?.(flag, true);
      if (this.opts.stay) { this.stateName = 'stay'; return; }
      this.stateName = 'rescued'; this.leaveT = RESCUE.leaveAfter - 0.6;
    };
    this.stateName = 'talking';
    const st = this.ctx.story;
    if (play && st?.play && !(flag && this.ctx.state?.getFlag?.(flag))) {
      try { Promise.resolve(st.play(play)).then(finish, finish); } catch (e) { console.warn('[companions] rescue scene failed', e); finish(); }
    } else finish();
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
    for (let i = 0; i < this.ropePosts.length; i++) if (!this.ropePosts[i].opened) this.ropePosts[i].update(dt);
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
      case 'lowering': {
        // the treetop cage comes down on its rope (§12.4: over 2 s), then the door pops
        this.lowerT += dt;
        const u = clamp01(this.lowerT / this.lowerDur), e = u * u * (3 - 2 * u);
        this.perchY = this.lowerFrom * (1 - e);
        this.vel.set(0, 0, 0);
        this.pos.set(this.home.x, this.home.y + this.perchY, this.home.z);
        if (this.lock) this.lock.height = (this.cageSize?.[1] ?? 1) + this.perchY;
        if (u >= 1) {
          this.perchY = 0; this.flying = false;
          this.ctx.fx?.burst?.('dust', this.pos, { scale: 0.8 });
          this.ctx.cam?.shake?.(0.12);
          this.stateName = 'caged';
          this.openCage();
        }
        return;
      }
      case 'talking':
        this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt);
        if (p) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 4, dt);
        break;
      case 'stay':
        this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt);
        if (p && d < 6) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 3, dt);
        else this.facing = dampAngle(this.facing, this.homeFacing ?? this.facing, 1.5, dt);
        break;
      case 'opening': {
        // the door swings open (0.35 s), then a scripted hop toward her onto free ground: no collisions on the way,
        // so the cart (ours or the level's) can't catch the kitten mid-air or shove it out the far side
        this.cageOpenT += dt;
        if (this.cageOpenT >= 0.35 && !this.hop) {
          const buddy = this.companion ? this._buddy() : null;
          const to = buddy ? this._landBeside(buddy, new THREE.Vector3()) : this._hopTarget(new THREE.Vector3());
          this.landOn = buddy;
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
            if (this.landOn) {                                         // D-02: "Thanks for the landing." "Mrrf."
              this.landOn.visual?.punch(-0.32); this.landOn.visual?.setExpression?.('surprised');
              this.ctx.fx?.burst?.('dust', this.landOn.pos, { scale: 0.5 });
              this.landOn = null;
            }
            this.stateName = 'waiting'; this.rescue();
          }
        }
        return;
      }
      case 'waiting': {
        this.vel.x = damp(this.vel.x, 0, this.onGround ? 8 : 0.5, dt); this.vel.z = damp(this.vel.z, 0, this.onGround ? 8 : 0.5, dt);
        if (p) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 4, dt);
        if (this.poseT > 0 && (this.poseT -= dt) <= 0) this.visual?.setPose('idle', 0.3);
        const reach = this.service ? (this.opts.talkR ?? RESCUE.talkR) : RESCUE.radius;
        if (p && d <= reach + (p.radius ?? 0.32) && dy < RESCUE.height && !p.scripted) this.rescue();
        else if (this.opts.autoRescue >= 0 && this.revealT != null && this.t - this.revealT >= this.opts.autoRescue && d < 16
          && this.ctx.game?.mode === 'play' && !this.ctx.story?.isPlaying) this.rescue();
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
    if (this.stateName !== 'hidden' || !by) return false;
    if (this.hide === 'meow' && this.opts.prop && Math.hypot(by.pos.x - this.pos.x, by.pos.z - this.pos.z) <= RESCUE.knockR) {
      this.reveal();                                             // she knocks on the barrel: "Is it over?"
      return true;
    }
    if (this.hide !== 'break') return false;
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
    const base = (p && Math.hypot(p.pos.x - hx, p.pos.z - hz) > 0.3 ? Math.atan2(p.pos.x - hx, p.pos.z - hz) : this.facing) + (this.hopYaw ?? 0);
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

  /** An awake party member near the cage (D-02: Sage tumbles out onto Mochi). */
  _buddy() {
    for (const c of this.ctx.companions?.active ?? []) {
      if (c.kittenId === this.kittenId || c.napT > 0 || c.scripted) continue;
      if (Math.hypot(c.pos.x - this.home.x, c.pos.z - this.home.z) < 6) return c;
    }
    return null;
  }

  /** Landing spot on top of / just beside `buddy` (the squash sells "Thanks for the landing."). */
  _landBeside(buddy, out) {
    const a = Math.atan2(this.home.x - buddy.pos.x, this.home.z - buddy.pos.z);
    const x = buddy.pos.x + Math.sin(a) * 0.45, z = buddy.pos.z + Math.cos(a) * 0.45;
    return out.set(x, groundY(this.ctx, x, z, buddy.pos.y), z);
  }

  _homeYaw() {
    const to = this.opts.leaveTo ? this.ctx.levels?.anchor?.(this.opts.leaveTo) ?? null : null;
    const lt = to?.pos ?? (Array.isArray(this.opts.leaveTo) ? { x: this.opts.leaveTo[0], z: this.opts.leaveTo[1] } : null);
    if (lt && Math.hypot(lt.x - this.pos.x, lt.z - this.pos.z) > 1) return Math.atan2(lt.x - this.pos.x, lt.z - this.pos.z);
    const home = this.ctx.levels?.anchor?.('start');
    const p = this.ctx.player;
    if (home?.pos && Math.hypot(home.pos.x - this.pos.x, home.pos.z - this.pos.z) > 4) return Math.atan2(home.pos.x - this.pos.x, home.pos.z - this.pos.z);
    return p ? Math.atan2(this.pos.x - p.pos.x, this.pos.z - p.pos.z) : this.facing + Math.PI;
  }

  // ------------------------------------------------------------------ render

  /**
   * §18 draw-call budget (core integration, M2): a kitten (and its cage / hiding prop) far beyond what the level's fog
   * lets through is not drawn: d > max(40, 2 / fog density) from the camera FOCUS in play (CONTROLS_SPEC §2.8; the lens
   * in cutscene presets), 6 m hysteresis. Only the children / the prop root are toggled, so the gameplay
   * `object3d.visible` logic is untouched.
   */
  _farCull() {
    const o = lodOrigin(this.ctx, _lod);
    const fog = this.ctx.env?.fogDensity ?? this.ctx.scene?.fog?.density ?? 0;
    const D = Math.max(40, fog > 1e-4 ? 2 / fog : 1e9);
    const d = Math.hypot(o.x - this.pos.x, o.z - this.pos.z);
    const far = this._far ? d > D - 6 : d > D;
    if (far) {
      // (also catches children added while far, e.g. a visual that finished loading)
      this._farHidden ??= new Set();
      for (const c of this.object3d.children) if (c.visible) { c.visible = false; this._farHidden.add(c); }
      if (this.propRoot?.visible) { this.propRoot.visible = false; this._farProp = this.propRoot; }
      this._far = true;
    } else if (this._far) {
      this._far = false;
      for (const c of this._farHidden ?? []) c.visible = true;
      this._farHidden = null;
      if (this._farProp) { this._farProp.visible = true; this._farProp = null; }
    }
  }

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
      if (this.rope) {                                              // the hanging cage sways a little on its rope
        const top = (this.cageSize?.[1] ?? 1) + this.perchY, hang = this.stateName === 'caged' && this.hanging;
        this.cage.position.y = this.perchY;
        if (hang) this.cage.rotation.z += Math.sin(this.t * 1.3) * 0.025;
        const branch = this.branchY ?? (this.cageSize?.[1] ?? 1) + (this.opts.hang ?? 0) + HANG.ropeTop;
        _rA.set(0, top, 0); _rB.set(0, branch, 0);
        this.rope.userData.set(_rA, _rB);
        this.rope.visible = this.stateName === 'caged' || this.stateName === 'lowering';
      }
    }
    if (this.visual && this.object3d.visible) {
      const p = this.ctx.player;
      const near = p && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < RESCUE.waveRadius;
      this.visual.setWave((this.stateName === 'waiting' && near) || (this.stateName === 'caged' && near && (this.t % 3) < 1.4));
      this.visual.lookAt(p && this.stateName !== 'leaving' ? wrapAngle(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.facing) : 0);
      this.visual.update(dt ?? 0, { velocity: this.vel, onGround: this.onGround || this.flying });
    }
    this.bubble.update(vdt);
    this._farCull();                                   // last: the visual's own update may re-show its root
  }

  /**
   * Hand the hiding prop / the opened cage (and the cart's collider) over to the level: they stay after we leave.
   * CompanionManager keeps them until the level unloads. Returns null when there is nothing to keep.
   */
  releaseDressing() {
    const root = this.propRoot;
    if (!root) return null;
    if (this._farProp === root) { root.visible = true; this._farProp = null; }
    const d = { root, collider: this.cartCollider ?? null, cage: this.cage ?? null, colliders: [...(this.stackColliders ?? []), ...this.ropePosts.map((q) => q.collider).filter(Boolean)] };
    this.stackColliders = null; this._released = true;
    for (const q of this.ropePosts) { if (!q.opened) { q.opened = true; this.ctx.actors.unregister(q); } q.collider = null; }
    this._removeInteract();
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
    this._removeInteract();
    for (const q of this.ropePosts) {
      if (!q.opened) { q.opened = true; this.ctx.actors.unregister(q); }
      if (q.collider) { try { this.ctx.physics?.removeCollider?.(q.collider); } catch { /* level gone */ } q.collider = null; }
    }
    for (const c of this.stackColliders ?? []) { try { this.ctx.physics?.removeCollider?.(c); } catch { /* level gone */ } }
    this.stackColliders = null;
    if (this.cage?.userData?.kind === 'stocks') disposeDressing(this.cage);
    else if (this.cage) this.cage.traverse((c) => { if (c.isMesh) c.geometry?.dispose(); });
    if (this.cartCollider) { try { this.ctx.physics?.removeCollider?.(this.cartCollider); } catch { /* level gone */ } this.cartCollider = null; }
    this.propRoot?.removeFromParent();
    this.visual?.dispose();
    this.bubble.dispose();
    super.dispose();
  }
}
