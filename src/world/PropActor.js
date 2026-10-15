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
import { disposeInstance } from '../core/Assets.js';
import { E } from '../core/events.js';
import { ATTACKS, PLAYER, TELEGRAPH, ONBOARD } from '../core/config.js';
import { dampAngle, wrapAngle } from '../core/math.js';
import { makeToonMaterial } from '../characters/materials.js';
import { procTemplate } from './Props.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
let _teleId = 5000000;

/** Hit-sound material per PropActor kind (audio plays it on combat:hit; world adds no hit sounds of its own). */
export const PROP_MATERIAL = Object.freeze({ dummy: 'straw', sack: 'straw', wobble_knight: 'armour', crate: 'wood', barrel: 'wood',
  rope_post: 'wood', post: 'wood', boulder: 'stone', lock: 'metal', cage: 'metal' });

/** A plain (non-interleaved) copy of a buffer attribute (meshopt GLBs ship interleaved ones; `clone()` warns on those). */
export function plainAttribute(a) {
  const n = a.count, k = a.itemSize, out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = a.getComponent(i, j);
  return new THREE.BufferAttribute(out, k);
}

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
    /** hit-sound material for audio (straw | wood | stone | armour | metal | rope); overrides the per-kind default */
    this.material = o.material ?? PROP_MATERIAL[this.kind] ?? 'wood';
    this.breakable = o.breakable !== false;
    /** CONTROLS_SPEC §7.2 / §11: the soft auto-target and the picker may pick it (rope posts, crates, cracked boulders) */
    this.assistable = o.assistable ?? this.breakable;
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
    /** the swing's ATTACKS row (not `def`: audio / ui read `actor.def.id` as an enemy type) */
    this.atk = ATTACKS.sack_swing;
    this.t = o.phase ?? 0; this.hitCd = 0;
    this.sackPos = new THREE.Vector3();
    this.mesh = o.mesh ?? null;             // own Object3D (rope + sack), rotated about the pivot
    this._place();
  }

  _place() {
    const th = this.amp * Math.sin((this.t / this.atk.period) * Math.PI * 2);
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
    const yIn = this.sackPos.y - this.atk.r < p.pos.y + p.height && this.sackPos.y + this.atk.r > p.pos.y;
    if (yIn && Math.hypot(dx, dz) < this.atk.r + p.radius) {
      this.hitCd = 0.6;
      this.ctx.combat?.applyHit?.(this, p, this.atk);
    }
  }

  render() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pivot);
    if (this.axis === 'x') this.mesh.rotation.set(0, 0, this.angle); else this.mesh.rotation.set(-this.angle, 0, 0);
  }
}

/**
 * Wobble Knight reach (centre to her centre): it only glints / swings when she is within `swing` (so a telegraph
 * always means the blow can land), and the strike connects up to `hit` (a step back during the windup, or the block
 * pushback, does not make it swing at air). It leans into the strike so the padded arm visibly covers that reach.
 */
export const WOBBLE_REACH = Object.freeze({ swing: 2.4, hit: 2.8, face: 6, lean: 0.32, keep: ONBOARD.standR, step: ONBOARD.stepR, roam: 4, hop: 1.6 });

/**
 * TT3 Sir Wobble look (docs/TOKENTAILS-PLAN.md §11.5 C): a cute spring dummy with big painted dot eyes and highlights,
 * rosy cheeks, a wide smile, a pink heart target painted flush on his tummy (was a red square standing off it) and the
 * sword arm on a visible wooden peg (the plank used to pass through his body). Colours, metres, facing +Z.
 */
export const WOBBLE_LOOK = Object.freeze({
  burlap: '#E3C38E', burlapDark: '#C9A46A', wood: '#B7773F', woodDark: '#7E4E2A', iron: '#6E7A8E', steel: '#C9D0D8',
  ink: '#3A2420', white: '#FFFFFF', cheek: '#F59AAE', smile: '#C9455A', heart: '#FF7FA8', heartLight: '#FFC2D6',
  head: Object.freeze({ y: 1.43, r: 0.22 }), body: Object.freeze({ y: 0.8, r: 0.27, len: 0.32 }), peg: 0.36, armY: 1.0,
});

/** Map a flat decal (built in the XY plane, depth along +Z) onto a sphere's front (centre `cy`, radius `r`). */
function onSphere(g, cy, r, lift = 0.003) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setZ(i, Math.sqrt(Math.max(0, r * r - x * x - (y - cy) ** 2)) + z + lift);
  }
  g.computeVertexNormals();
  return g;
}
/** Map a flat decal onto a vertical cylinder's front (radius `r`). */
function onCylinder(g, r, lift = 0.003) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setZ(i, Math.sqrt(Math.max(0, r * r - x * x)) + z + lift); }
  g.computeVertexNormals();
  return g;
}
/** A flat disc decal (radius `r`, thickness `t`) at (x, y), facing +Z. */
const disc = (r, x, y, t = 0.006, seg = 18) => new THREE.CylinderGeometry(r, r, t, seg, 1).rotateX(Math.PI / 2).translate(x, y, t / 2);

/** Sir Wobble's body parts ([geometry, colour] for procTemplate). Pure. */
export function wobbleBodyParts() {
  const L = WOBBLE_LOOK, H = L.head, B = L.body;
  const p = [[new THREE.CylinderGeometry(0.42, 0.48, 0.16, 18).translate(0, 0.08, 0), L.woodDark]];
  for (let i = 0; i < 5; i++) p.push([new THREE.TorusGeometry(0.13, 0.03, 6, 14).rotateX(Math.PI / 2).translate(0, 0.22 + i * 0.07, 0), L.iron]);
  p.push([new THREE.CapsuleGeometry(B.r, B.len, 6, 18).translate(0, B.y, 0), L.burlap]);
  p.push([new THREE.TorusGeometry(B.r * 0.99, 0.018, 5, 22).rotateX(Math.PI / 2).translate(0, B.y - 0.12, 0), L.burlapDark]);   // a stitched belt seam
  p.push([new THREE.SphereGeometry(H.r, 20, 14).translate(0, H.y, 0), L.burlap]);
  const helm = new THREE.SphereGeometry(H.r + 0.035, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, H.y + 0.04, 0);
  p.push([helm, L.steel], [new THREE.TorusGeometry(H.r + 0.035, 0.022, 6, 22).rotateX(Math.PI / 2).translate(0, H.y + 0.04, 0), L.iron]);
  p.push([new THREE.SphereGeometry(0.035, 10, 8).translate(0, H.y + H.r + 0.07, 0), L.heart]);                 // a pink pompom on the helm
  // the face: big painted dot eyes with two highlights each, rosy cheeks, a wide smile (all flush on the head sphere)
  for (const s of [1, -1]) {
    p.push([onSphere(disc(0.05, s * 0.078, H.y - 0.015), H.y, H.r, 0.002), L.ink]);
    p.push([onSphere(disc(0.018, s * 0.078 - 0.016, H.y + 0.005, 0.006, 12), H.y, H.r, 0.006), L.white]);
    p.push([onSphere(disc(0.008, s * 0.078 + 0.017, H.y - 0.03, 0.006, 10), H.y, H.r, 0.006), L.white]);
    p.push([onSphere(disc(0.034, s * 0.135, H.y - 0.075, 0.004, 14), H.y, H.r, 0.001), L.cheek]);
  }
  const smile = new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI).rotateZ(Math.PI).scale(1.25, 1, 0.4).translate(0, H.y - 0.075, 0);
  p.push([onSphere(smile, H.y, H.r, 0.004), L.smile]);
  // the pink heart target, painted flush on his tummy
  const heart = new THREE.Shape(), hs = 0.13;
  heart.moveTo(0, -0.9 * hs);
  heart.bezierCurveTo(-0.15 * hs, -0.55 * hs, -1.0 * hs, -0.2 * hs, -0.95 * hs, 0.3 * hs);
  heart.bezierCurveTo(-0.9 * hs, 0.85 * hs, -0.2 * hs, 0.95 * hs, 0, 0.45 * hs);
  heart.bezierCurveTo(0.2 * hs, 0.95 * hs, 0.9 * hs, 0.85 * hs, 0.95 * hs, 0.3 * hs);
  heart.bezierCurveTo(1.0 * hs, -0.2 * hs, 0.15 * hs, -0.55 * hs, 0, -0.9 * hs);
  const hg = new THREE.ExtrudeGeometry(heart, { depth: 0.006, bevelEnabled: false, curveSegments: 10 }).translate(0, B.y + 0.06, 0);
  p.push([onCylinder(hg, B.r, 0.002), L.heart]);
  const inner = new THREE.ExtrudeGeometry(heart, { depth: 0.006, bevelEnabled: false, curveSegments: 8 }).scale(0.4, 0.4, 1).translate(-0.04, B.y + 0.1, 0);
  p.push([onCylinder(inner, B.r, 0.006), L.heartLight]);
  // the arm peg: a wooden dowel from his side out to the shoulder pivot
  p.push([new THREE.CylinderGeometry(0.035, 0.035, L.peg - B.r + 0.05, 10).rotateZ(Math.PI / 2).translate((L.peg + B.r - 0.05) / 2, L.armY, 0), L.wood]);
  return p;
}

/** Sir Wobble's sword arm, pivot at the peg end (+X out of his side): a knob, a short stick, the padded blade forward. Pure. */
export function wobbleArmParts() {
  const L = WOBBLE_LOOK;
  return [[new THREE.SphereGeometry(0.06, 12, 10), L.woodDark],
    [new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8).rotateZ(Math.PI / 2).translate(0.12, 0, 0), L.wood],
    [new THREE.BoxGeometry(0.07, 0.07, 1.45).translate(0.24, 0, 0.7), '#C9A87A'],
    [new THREE.BoxGeometry(0.26, 0.05, 0.06).translate(0.24, 0, -0.04), L.woodDark],
    [new THREE.SphereGeometry(0.1, 12, 10).scale(1, 1, 1.35).translate(0.24, 0, 1.45), L.burlap]];
}

/**
 * Re-dress a Wobble Knight group from meadow.js (body mesh + arm pivot group) with the TT3 look, in place. Built fresh
 * per level load (the level frees uploaded arrays and disposes its geometries on unload, so a cached copy would come
 * back empty on the next load); the meadow's own geometries are left to the level's disposal as before.
 */
function dressWobble(mesh, armPivot) {
  if (!mesh?.isObject3D) return;
  const body = mesh.children.find((c) => c.isMesh && c !== armPivot);
  if (body) body.geometry = procTemplate('wobble_body_tt3', wobbleBodyParts()).geometry;
  if (armPivot) {
    armPivot.position.x = WOBBLE_LOOK.peg; armPivot.position.y = WOBBLE_LOOK.armY;
    const arm = armPivot.children.find((c) => c.isMesh);
    if (arm) arm.geometry = procTemplate('wobble_arm_tt3', wobbleArmParts()).geometry;
  }
}

/**
 * The Wobble Knight (tutorial steps 5–6): a spring dummy that turns to the player and swings ATTACKS.dummy_swing
 * every 2.0 s with a white parry glint while she is within WOBBLE_REACH.swing. TT2 §10.3 (no dead end): whenever she is
 * near (within `face`) but more than `step` m away (a block pushes her back ~0.4 m) it hops on its spring base toward
 * her between swings (up to `roam` m from home, to `keep` m from her = the drill's stand spot), and hops home when she
 * leaves. Its visual root (`object3d`) follows it, so the parry glint, the "!" and the ground ring sit on him. Parried → spins comically
 * (parriedSpin). Blocked hits count for the tutorial (story listens to combat:hit with attacker tag 'wobble_knight').
 * The 0.25× slow-mo parry hint fires once, on the first glint while `hint()` holds (the tutorial's Parry step).
 */
export class WobbleKnight extends PropActor {
  constructor(ctx, o) {
    super(ctx, { ...o, kind: 'wobble_knight', infinite: true, hp: 999, radius: 0.45, height: 1.3 });
    this.atk = ATTACKS.dummy_swing;
    this.timer = o.delay ?? 1.0; this.phase = 'idle'; this.phaseT = 0;
    this.spinT = 0; this.spin = 0; this.arm = 0;
    this.active = o.active ?? (() => true);
    /** may the one-time slow-mo parry hint fire now? (meadow: the tutorial's current step is 'parry') */
    this.hint = o.hint ?? (() => true);
    /** TT2: may he step toward her now? (meadow: only during the drill, so he never wanders into her path otherwise) */
    this.approach = o.approach ?? (() => true);
    this.mesh = o.mesh ?? null;  this.armPivot = o.armPivot ?? null;
    if (o.dress !== false) dressWobble(this.mesh, this.armPivot);   // TT3 look (WOBBLE_LOOK)
    this.hintDone = false; this.teleId = 0; this.lean = 0;
    this.home = this.pos.clone(); this.hopT = 0; this.hopping = false;
  }

  /** Combat calls this when the player parries the swing. */
  onParried() { this.spinT = this.atk.parriedSpin ?? 1.0; this.phase = 'idle'; this.timer = this.atk.every; this._endTele(); }
  onBlocked() {}

  _endTele() { if (this.teleId) { this.ctx.bus.emit(E.TELEGRAPH_END, { id: this.teleId }); this.teleId = 0; } }

  update(dt) {
    super.update(dt);
    const p = this.ctx.player, d = this.atk;
    if (this.spinT > 0) { this.spinT -= dt; this.spin += dt * 14 * Math.max(0.2, this.spinT); return; }
    const dist = p?.alive ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : Infinity;
    const on = !!p?.alive && this.active();
    const near = on && dist < WOBBLE_REACH.face, inReach = on && dist <= WOBBLE_REACH.swing;
    if (near) this.facing = dampAngle(this.facing, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 4, dt);
    this._hop(dt, p, near, inReach, dist);
    this.phaseT += dt;
    const leanTo = this.phase === 'strike' ? WOBBLE_REACH.lean : this.phase === 'windup' ? -0.08 : 0;
    this.lean += (leanTo - this.lean) * Math.min(1, dt * (this.phase === 'strike' ? 22 : 6));
    switch (this.phase) {
      case 'idle':
        this.arm *= Math.exp(-6 * dt);
        if (!inReach) { this.timer = Math.min(Math.max(this.timer, 0.35), d.every); return; }
        if ((this.timer -= dt) <= 0) {
          this.phase = 'windup'; this.phaseT = 0;
          this.teleId = ++_teleId;
          const dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
          this.ctx.bus.emit(E.TELEGRAPH, { id: this.teleId, actor: this, kind: d.telegraph, shape: 'glint', pos: this.pos.clone().setY(this.pos.y + 1.1), dir, size: 0.6, duration: d.windup });
          if (!this.hintDone && this.hint()) { this.hintDone = true; this.ctx.game?.slowMo?.(0.25, 0.5); }
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

  /** Between swings: hop toward her when she is near but out of reach, home when she has left. */
  _hop(dt, p, near, inReach, dist = Infinity) {
    const R = WOBBLE_REACH;
    let tx = this.home.x, tz = this.home.z;
    // past `step` he sets off and keeps hopping until he is `keep` m from her (hysteresis: no stop-start at 1.4 m)
    if (near && this.phase === 'idle' && this.approach() && (!inReach || dist > R.step || (this.hopping && dist > R.keep + 0.05))) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      tx = p.pos.x - (dx / d) * R.keep; tz = p.pos.z - (dz / d) * R.keep;
      const hx = tx - this.home.x, hz = tz - this.home.z, hd = Math.hypot(hx, hz);
      if (hd > R.roam) { tx = this.home.x + (hx / hd) * R.roam; tz = this.home.z + (hz / hd) * R.roam; }
    } else if (near && (inReach || this.approach())) { this.hopping = false; return; }   // in reach / mid-swing: stand
    const mx = tx - this.pos.x, mz = tz - this.pos.z, md = Math.hypot(mx, mz);
    this.hopping = md > 0.05;
    if (!this.hopping) return;
    const step = Math.min(md, R.hop * dt), nx = this.pos.x + (mx / md) * step, nz = this.pos.z + (mz / md) * step;
    // never hop into a fence / wall (static colliders)
    const ph = this.ctx.physics;
    if (typeof ph?.blockedAt === 'function' && ph.blockedAt(nx, nz, this.radius * 0.8, this.pos.y + 0.2, this.pos.y + 1.0)) { this.hopping = false; return; }
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y = this.ctx.physics?.heightAt?.(this.pos.x, this.pos.z) ?? this.home.y;
    this.hopT += dt;
  }

  _inArc(p) {
    const a = this.atk.arc, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist > Math.max(a.range + p.radius, WOBBLE_REACH.hit)) return false;
    const ang = wrapAngle(Math.atan2(dx, dz) - this.facing);
    return Math.abs(ang) <= Math.max(Math.abs(a.from), Math.abs(a.to)) + 0.3;
  }

  render() {
    // the visual root follows him (fx reads object3d for the parry glint / "!" / ground ring: it stayed at home, facing +Z)
    this.object3d.position.copy(this.pos); this.object3d.rotation.y = this.facing;
    if (!this.mesh) return;
    const tilt = Math.hypot(this.wob.x, this.wob.y);
    this.mesh.position.copy(this.pos);
    if (this.hopping) this.mesh.position.y += Math.abs(Math.sin(this.hopT * 9)) * 0.09;   // boing
    this.mesh.rotation.set(this.wob.y * 0.8 + this.lean, this.facing + this.spin, -this.wob.x * 0.8, 'YXZ');
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
    g.setAttribute('position', plainAttribute(src.attributes.position));
    g.setAttribute('normal', src.attributes.normal ? plainAttribute(src.attributes.normal) : new THREE.BufferAttribute(new Float32Array(n * 3), 3));
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
  // ART §5.1 actors are WarmToon (no Standard in play). PERF §1.2: the shared skinned kit program (the same one every
  // kitten body uses) with a constant matte rmse, not a skinned Lambert program of its own
  const rm = new Float32Array(merged.attributes.position.count * 4);
  for (let i = 0; i < rm.length; i += 4) { rm[i] = 0.9; rm[i + 2] = 0.3; }
  merged.setAttribute('rmse', new THREE.BufferAttribute(rm, 4));
  const mat = critterMaterial();
  const first = list[0];
  const mesh = new THREE.SkinnedMesh(merged, mat);
  mesh.name = first.name + ':merged';
  mesh.castShadow = first.castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
  first.parent.add(mesh);
  mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
  mesh.bind(first.skeleton, first.bindMatrix);
  for (const m of list) m.removeFromParent();
  mesh.userData.owned = true; merged.userData = { owned: true };
  return mesh;
}

let _critterMat = null;
/** The one shared critter material (skinned WarmToon, vertex colours; never disposed with a level). */
function critterMaterial() {
  if (!_critterMat) { _critterMat = makeToonMaterial({ kind: 'skinned' }); _critterMat.userData.sharedCritter = true; _critterMat.userData.noDispose = true; }
  return _critterMat;
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
    this.woke = false; this.anim = null; this.model = null; this.merged = null;
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
      try { this.merged = mergeSkinnedMeshes(m.scene); } catch (e) { console.warn('[world] critter merge failed', e); }
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
    // the merged SkinnedMesh is ours (not template geometry); Actor.dispose detaches object3d before the level's
    // disposeOwned(root) walk, so free it here
    if (this.merged) { this.merged.geometry?.dispose(); if (!this.merged.material?.userData?.sharedCritter) this.merged.material?.dispose(); this.merged = null; }
    // cloned skeletons' bone textures + tinted material clones (leaked +2 textures per meadow reload, requests/enemies.md)
    if (this.object3d) disposeInstance(this.object3d, { detach: false });
    this.ctx.actors?.unregister(this);
    super.dispose();
  }
}
