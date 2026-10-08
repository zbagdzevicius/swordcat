// src/world/PropActor.js  (owner: world) — level objects that take part in combat (GAME_DESIGN §12.1, §5.4 tutorial,
// §18.3 procedural builds): straw dummies, crates/barrels, net rope posts, cage locks, cracked boulders, the swinging
// sack, the Wobble Knight, and placed critters (sleeping cows). They are Actors registered in ctx.actors so the
// player's swings hit them through Combat.applyHit: faction 'neutral' + `breakable = true` (combat lets player-side
// attacks hit breakables; aim assist, lock-on and enemy AI ignore them), tag 'prop' plus their kind ('dummy',
// 'crate', 'rope_post', 'boulder', 'sack', 'wobble_knight'). Their visuals are PropBatch instances (or own meshes)
// moved in render().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { Animator } from '../core/Animator.js';
import { E } from '../core/events.js';
import { ATTACKS, PLAYER, TELEGRAPH } from '../core/config.js';
import { dampAngle, wrapAngle } from '../core/math.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
let _teleId = 5000000;

/** Is `att` the player (or a projectile she owns)? */
export const byPlayer = (att) => att?.faction === 'player' || att?.owner?.faction === 'player' || att?.tags?.has?.('player');

/**
 * A static prop that can be hit. Options: { kind, hp, playerOnly, breaks ('cracked'), armed, wobble, radius, height,
 * visual: { batch, handle, base: Matrix4 } (batch instance moved by wobble) or object3d children, onHit, onBreak }.
 */
export class PropActor extends Actor {
  constructor(ctx, o = {}) {
    super(ctx, { faction: o.faction ?? 'neutral', radius: o.radius ?? 0.4, height: o.height ?? 1, maxHp: o.hp ?? 1, mass: 50, maxPoise: 99 });
    this.kind = o.kind ?? 'prop';
    this.propId = o.id ?? null;
    this.breakable = o.breakable !== false;
    this.tags.add('prop').add(this.kind);
    for (const t of o.tags ?? []) this.tags.add(t);
    this.fixed = true;
    this.infinite = !!o.infinite;               // training dummies never break
    this.playerOnly = o.playerOnly !== false;
    this.breaks = o.breaks ?? null;              // 'cracked' → only attacks with def.breaks including it
    this.armed = o.armed !== false;              // unarmed locks clink (block) instead of taking damage
    this.wobbleAmt = o.wobble ?? 0.35;
    this.visual = o.visual ?? null;              // { batch, handle, base }
    this.onHitCb = o.onHit ?? null; this.onBreakCb = o.onBreak ?? null;
    this.stateName = 'idle';
    this.wob = new THREE.Vector2(); this.wobV = new THREE.Vector2();
    if (o.pos) this.pos.copy(o.pos);
    this.facing = o.facing ?? 0;
    this.broken = false;
    this.snap();
  }

  /** §19.4 hook: who may hurt it and how. */
  resolveIncoming(att, def) {
    if (this.broken) return 'immune';
    if (this.playerOnly && !byPlayer(att)) return 'immune';
    if (!this.armed) return 'block';
    if (this.breaks && !(def?.breaks ?? []).includes(this.breaks)) return 'block';
    return 'hit';
  }

  onHit(hit) {
    const d = hit?.dir;
    if (d) { this.wobV.x += d.x * this.wobbleAmt * 9; this.wobV.y += d.z * this.wobbleAmt * 9; }
    if (this.infinite) { this.hp = this.maxHp; }
    this.onHitCb?.(this, hit);
  }

  onDeath(hit) {
    if (this.infinite) { this.alive = true; this.hp = this.maxHp; return; }
    this.broken = true; this.hurtable = false;
    this.onBreakCb?.(this, hit);
  }

  update(dt) {
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);
    this.vel.set(0, 0, 0); this.staggerT = 0; this.poise = this.maxPoise;
    // damped spring wobble (visual tilt, in radians)
    const k = 60, c = 7;
    this.wobV.x += (-k * this.wob.x - c * this.wobV.x) * dt; this.wobV.y += (-k * this.wob.y - c * this.wobV.y) * dt;
    this.wob.x += this.wobV.x * dt; this.wob.y += this.wobV.y * dt;
  }

  /** Visual: tilt the batch instance around its base by the wobble. */
  render() {
    const v = this.visual;
    if (!v?.batch || !v.base) { this.object3d.position.copy(this.pos); return; }
    if (this.broken) return;
    const tilt = Math.hypot(this.wob.x, this.wob.y);
    if (tilt < 1e-4 && !this._dirty) return;
    this._dirty = tilt >= 1e-4;
    _ax.set(this.wob.y, 0, -this.wob.x).normalize();
    _q.setFromAxisAngle(tilt > 1e-6 ? _ax : _up, tilt);
    _p.copy(this.pos);
    _m.makeRotationFromQuaternion(_q).setPosition(_p);                      // T(p)·R
    _m2.makeTranslation(-_p.x, -_p.y, -_p.z).premultiply(_m).multiply(v.base);   // T(p)·R·T(−p)·base
    v.batch.setMatrix(v.handle, _m2);
  }

  dispose() { this.ctx.actors?.unregister(this); super.dispose(); }
}

/**
 * The swinging sack (tutorial step 4): a 0.6 m sack on a 1.8 m rope; ATTACKS.sack_swing (period 2.0 s,
 * knock 3, no damage). Not hurtable. Swings along `axis` ('x' or 'z').
 */
export class SwingingSack extends PropActor {
  constructor(ctx, o) {
    super(ctx, { ...o, kind: 'sack', hp: 1, faction: 'neutral', radius: 0.3, height: 0.6, breakable: false });
    this.hurtable = false;
    this.pivot = o.pivot.clone();          // top of the rope (world)
    this.rope = 1.8; this.amp = o.amp ?? 0.85; this.axis = o.axis ?? 'x';
    this.def = ATTACKS.sack_swing;
    this.t = o.phase ?? 0; this.hitCd = 0;
    this.sackPos = new THREE.Vector3();
    this.mesh = o.mesh ?? null;             // own Object3D (rope + sack), rotated about the pivot
    this._place();
  }

  _place() {
    const th = this.amp * Math.sin((this.t / this.def.period) * Math.PI * 2);
    const sx = Math.sin(th) * this.rope, sy = -Math.cos(th) * this.rope;
    this.sackPos.set(this.pivot.x + (this.axis === 'x' ? sx : 0), this.pivot.y + sy, this.pivot.z + (this.axis === 'z' ? sx : 0));
    this.pos.set(this.sackPos.x, this.sackPos.y - 0.3, this.sackPos.z);
    this.angle = th;
  }

  update(dt) {
    super.update(dt);
    this.t += dt; this.hitCd = Math.max(0, this.hitCd - dt);
    this._place();
    const p = this.ctx.player;
    if (!p?.alive || this.hitCd > 0) return;
    const dx = p.pos.x - this.sackPos.x, dz = p.pos.z - this.sackPos.z;
    const yIn = this.sackPos.y - this.def.r < p.pos.y + p.height && this.sackPos.y + this.def.r > p.pos.y;
    if (yIn && Math.hypot(dx, dz) < this.def.r + p.radius) {
      this.hitCd = 0.6;
      this.ctx.combat?.applyHit?.(this, p, this.def);
    }
  }

  render() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pivot);
    if (this.axis === 'x') this.mesh.rotation.set(0, 0, this.angle); else this.mesh.rotation.set(-this.angle, 0, 0);
  }
}

/**
 * The Wobble Knight (tutorial steps 5–6): a spring dummy that turns to the player and swings ATTACKS.dummy_swing
 * every 2.0 s with a white parry glint. Parried → spins comically (parriedSpin). Blocked hits count for the tutorial
 * (story listens to combat:hit with attacker tag 'wobble_knight'). The first glint triggers a 0.25× slow-mo hint once.
 */
export class WobbleKnight extends PropActor {
  constructor(ctx, o) {
    super(ctx, { ...o, kind: 'wobble_knight', infinite: true, hp: 999, radius: 0.45, height: 1.3 });
    this.def = ATTACKS.dummy_swing;
    this.timer = o.delay ?? 1.0; this.phase = 'idle'; this.phaseT = 0;
    this.spinT = 0; this.spin = 0; this.arm = 0;
    this.active = o.active ?? (() => true);
    this.mesh = o.mesh ?? null;  this.armPivot = o.armPivot ?? null;
    this.hintDone = false; this.teleId = 0;
  }

  /** Combat calls this when the player parries the swing. */
  onParried() { this.spinT = this.def.parriedSpin ?? 1.0; this.phase = 'idle'; this.timer = this.def.every; this._endTele(); }
  onBlocked() {}

  _endTele() { if (this.teleId) { this.ctx.bus.emit(E.TELEGRAPH_END, { id: this.teleId }); this.teleId = 0; } }

  update(dt) {
    super.update(dt);
    const p = this.ctx.player, d = this.def;
    if (this.spinT > 0) { this.spinT -= dt; this.spin += dt * 14 * Math.max(0.2, this.spinT); return; }
    const near = p?.alive && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 5 && this.active();
    if (near) this.facing = dampAngle(this.facing, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 4, dt);
    this.phaseT += dt;
    switch (this.phase) {
      case 'idle':
        this.arm *= Math.exp(-6 * dt);
        if (!near) { this.timer = Math.min(this.timer, d.every); return; }
        if ((this.timer -= dt) <= 0) {
          this.phase = 'windup'; this.phaseT = 0;
          this.teleId = ++_teleId;
          const dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
          this.ctx.bus.emit(E.TELEGRAPH, { id: this.teleId, actor: this, kind: d.telegraph, shape: 'glint', pos: this.pos.clone().setY(this.pos.y + 1.1), dir, size: 0.6, duration: d.windup });
          if (!this.hintDone) { this.hintDone = true; this.ctx.game?.slowMo?.(0.25, 0.5); }
        }
        break;
      case 'windup':
        this.arm = -0.9 * Math.min(1, this.phaseT / d.windup);
        if (this.phaseT >= Math.max(TELEGRAPH.minLead.parry, d.windup)) { this.phase = 'strike'; this.phaseT = 0; this._endTele(); this._struck = false; }
        break;
      case 'strike':
        this.arm = -0.9 + 2.2 * Math.min(1, this.phaseT / 0.15);
        if (!this._struck && this.phaseT >= (d.active?.[0] ?? 0)) {
          this._struck = true;
          if (p?.alive && this._inArc(p)) this.ctx.combat?.applyHit?.(this, p, d);
        }
        if (this.phaseT >= d.dur) { this.phase = 'recover'; this.phaseT = 0; }
        break;
      case 'recover':
        this.arm *= Math.exp(-5 * dt);
        if (this.phaseT >= d.recover) { this.phase = 'idle'; this.timer = Math.max(0.2, d.every - d.windup - d.dur - d.recover); }
        break;
    }
  }

  _inArc(p) {
    const a = this.def.arc, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist > a.range + p.radius) return false;
    const ang = wrapAngle(Math.atan2(dx, dz) - this.facing);
    return Math.abs(ang) <= Math.max(Math.abs(a.from), Math.abs(a.to)) + 0.3;
  }

  render() {
    if (!this.mesh) return;
    const tilt = Math.hypot(this.wob.x, this.wob.y);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.wob.y * 0.8, this.facing + this.spin, -this.wob.x * 0.8, 'YXZ');
    if (tilt > 0.6) this.wob.multiplyScalar(0.6 / tilt);
    if (this.armPivot) this.armPivot.rotation.y = this.arm;
  }

  dispose() { this._endTele(); super.dispose(); }
}

/**
 * Merge the skinned meshes of one model that share a skeleton (Quaternius animals ship 7 flat-coloured parts) into
 * ONE vertex-coloured SkinnedMesh: 1 draw call + 1 shadow call instead of 7 + 7. Visual only; returns the new mesh
 * or null when there is nothing to merge (textured parts, different skeletons).
 */
export function mergeSkinnedMeshes(root) {
  const list = [];
  root.traverse((o) => { if (o.isSkinnedMesh) list.push(o); });
  if (list.length < 2) return null;
  const sk = list[0].skeleton;
  if (list.some((m) => m.skeleton.bones.length !== sk.bones.length || m.skeleton.bones.some((b, i) => b !== sk.bones[i]))) return null;
  if (list.some((m) => (Array.isArray(m.material) ? m.material : [m.material]).some((mt) => mt.map))) return null;
  const col = new THREE.Color();
  const geos = list.map((m) => {
    const src = m.geometry, g = new THREE.BufferGeometry();
    const n = src.attributes.position.count;
    g.setAttribute('position', src.attributes.position.clone());
    g.setAttribute('normal', src.attributes.normal ? src.attributes.normal.clone() : new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { si[i * 4 + k] = src.attributes.skinIndex.getComponent(i, k); sw[i * 4 + k] = src.attributes.skinWeight.getComponent(i, k); }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const c = new Float32Array(n * 3);
    const vm = new Int16Array(n);
    if (Array.isArray(m.material) && src.groups.length) for (const gr of src.groups) for (let k = gr.start; k < gr.start + gr.count; k++) vm[src.index ? src.index.getX(k) : k] = gr.materialIndex ?? 0;
    for (let i = 0; i < n; i++) { col.copy(mats[vm[i]]?.color ?? col.setRGB(1, 1, 1)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setIndex(src.index ? src.index.clone() : null);
    // the parts may sit under different nodes: bring them into the first part's space
    m.updateWorldMatrix(true, false);
    if (m !== list[0]) { list[0].updateWorldMatrix(true, false); g.applyMatrix4(new THREE.Matrix4().copy(list[0].matrixWorld).invert().multiply(m.matrixWorld)); }
    return g;
  });
  if (geos.some((g) => !g.index) && geos.some((g) => g.index)) for (const g of geos) if (g.index) { const ni = g.toNonIndexed(); g.copy(ni); }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const first = list[0];
  const mesh = new THREE.SkinnedMesh(merged, mat);
  mesh.name = first.name + ':merged';
  mesh.castShadow = first.castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
  first.parent.add(mesh);
  mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
  mesh.bind(first.skeleton, first.bindMatrix);
  for (const m of list) m.removeFromParent();
  mesh.userData.owned = true; mat.userData.owned = true; merged.userData = { owned: true };
  return mesh;
}

/**
 * A placed animated creature (sleeping cows): a ScriptedActor with an Animator; `meowWakes` → on a Meow within
 * PLAYER.meow.kittenRadius it moos, plays `wakeClip`, then walks `walkTo` (6 m east by default) and calls onWake.
 */
export class Critter extends ScriptedActorMixin(Actor) {
  constructor(ctx, o = {}) {
    super(ctx, { faction: 'neutral', radius: o.radius ?? 0.75, height: o.height ?? 1.6, maxHp: 1, mass: 30 });
    this.tags.add('critter'); if (o.kind) this.tags.add(o.kind);
    this.hurtable = false; this.fixed = true;
    this.path = o.model; this.fit = o.fit ?? { h: 1.6 }; this.clip = o.clip ?? 'Idle';
    this.meowWakes = !!o.meowWakes; this.walkTo = o.walkTo ?? null; this.onWake = o.onWake ?? null;
    this.woke = false; this.anim = null; this.model = null;
    this.moo = o.moo ?? 'creature/animal_moo';
    if (o.pos) this.pos.copy(o.pos);
    this.facing = o.facing ?? 0;
    this.object3d.name = 'critter:' + (o.kind ?? 'animal');
    this.snap();
  }

  async load() {
    try {
      const m = await this.ctx.assets.model(this.path, { fit: this.fit, castShadow: true });
      if (this.disposed) return;
      this.model = m;
      m.scene.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      try { mergeSkinnedMeshes(m.scene); } catch (e) { console.warn('[world] critter merge failed', e); }
      this.object3d.add(m.root);
      this.anim = new Animator(m.scene, m.animations);
      this.anim.play(this.anim.pick(this.clip, 'Idle'));
      this.anim.mixer.update(Math.abs(this.pos.x * 0.37 + this.pos.z * 0.11) % 2);   // desync idles (visual only)
    } catch (e) { console.warn('[world] critter model failed', this.path, e); }
  }

  /** React to a meow (LevelKit forwards E.PLAYER_MEOW). */
  hearMeow(pos) {
    if (!this.meowWakes || this.woke) return false;
    if (Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) > PLAYER.meow.kittenRadius) return false;
    this.wake();
    return true;
  }

  async wake() {
    if (this.woke) return;
    this.woke = true;
    this.ctx.audio?.play3D?.(this.moo, this.pos.clone(), { vol: 0.9 });
    if (this.anim) await this.anim.play(this.anim.pick('Idle_HitReact1', 'Idle_HitReact2', 'Idle'), { once: true, fade: 0.2 });
    if (this.disposed) return;
    this.onWake?.(this);
    if (this.walkTo) {
      const was = this.scripted; this.scripted = true;
      this.anim?.play(this.anim.pick('Walk', 'Idle'), { fade: 0.3 });
      await this.moveTo(this.walkTo, 1.1);
      if (this.disposed) return;
      this.scripted = was;
      this.anim?.play(this.anim.pick('Eating', 'Idle_Headlow', 'Idle'), { fade: 0.4 });
    }
  }

  playClip(clip, { once = false, speed = 1, clampEnd = false } = {}) { return this.anim?.play(clip, { once, speed, clampEnd }) ?? Promise.resolve(); }

  update(dt) {
    if (!this.ctx.game.simActive(this) && !this._move) return;
    this.scriptedStep(dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (!this._move) { this.vel.x = 0; this.vel.z = 0; }
    this.pos.y = this.ctx.physics?.heightAt?.(this.pos.x, this.pos.z) ?? this.pos.y;
  }

  render(alpha, dt) {
    super.render(alpha);
    // fog culling: beyond the fog the cow is invisible anyway (and its mixer can rest)
    const cam = this.ctx.camera, far = this.ctx.levels?.current?.cullDist?.() ?? 120;
    const vis = !cam || cam.position.distanceToSquared(this.pos) < far * far;
    this.object3d.visible = vis;
    if (vis) this.anim?.update(this.ctx.game?.hitstopT > 0 ? 0 : dt ?? 0);
  }

  dispose() {
    this.disposed = true;
    this.anim?.dispose();
    this.ctx.actors?.unregister(this);
    super.dispose();
  }
}
