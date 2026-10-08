// src/core/Actor.js  (owner: core) — FROZEN base (tech.md §4.3) + optional duck-typed members (§19.4).
import * as THREE from 'three';
import { lerpAngle } from './math.js';

let nextId = 1;

/**
 * Base for the player, enemies, companions, NPCs and Pudding.
 * Simulation state (`pos`, `vel`, `facing`) mutates only in fixed-step `update(dt)` (owned by the subclass);
 * `render(alpha)` interpolates the visual root `object3d` between the previous and current step.
 *
 * OPTIONAL duck-typed members (§19.4), implemented by subclasses where relevant:
 *   tags: Set<string>                        'player','enemy','boss','flyer','runner','kitten','npc','scripted'
 *   resolveIncoming(attacker, def, hitDir)   → 'hit' | 'block' | 'parry' | 'break' | 'immune'
 *   onParried(byActor, { gold })             enemy hook: stagger / dizzy
 *   onBlocked(byActor, def)
 * ScriptedActor interface (Player, NpcActor, Companion, Enemy, Pudding; used only by story/Cutscene.js):
 *   setScripted, moveTo, face, pose, play, emote, prop, attach   (see core/ScriptedActor.js for defaults)
 */
export class Actor {
  /**
   * @param {object} ctx
   * @param {{faction?:'player'|'enemy'|'ally'|'neutral', radius?:number, height?:number, maxHp?:number, mass?:number, maxPoise?:number}} [opts]
   */
  constructor(ctx, { faction = 'neutral', radius = 0.35, height = 1, maxHp = 3, mass = 1, maxPoise = 1 } = {}) {
    this.ctx = ctx; this.id = nextId++; this.faction = faction;   // 'player' | 'enemy' | 'ally' | 'neutral'
    this.object3d = new THREE.Group();                // visual root; position is interpolated in render()
    this.object3d.userData.actor = this;
    this.pos = new THREE.Vector3(); this.prevPos = new THREE.Vector3();   // feet position (sim)
    this.vel = new THREE.Vector3(); this.facing = 0; this.prevFacing = 0;
    this.radius = radius; this.height = height; this.mass = mass;
    this.hp = maxHp; this.maxHp = maxHp; this.poise = maxPoise; this.maxPoise = maxPoise;
    this.invulnT = 0; this.staggerT = 0; this.onGround = false; this.alive = true;
    this.hurtable = true;                             // false while dead/cutscene
    /** @type {Set<string>} */
    this.tags = new Set();                            // §19.4 optional; ActorRegistry.byTag reads it
    this.scripted = false;                            // §19.4 ScriptedActor: AI and input off while true
  }

  beginStep() { this.prevPos.copy(this.pos); this.prevFacing = this.facing; }   // subclasses tick invulnT/staggerT in update(dt)

  /** Called by Combat.applyHit after damage/knockback were applied. */
  onHit(hit) {}
  onDeath(hit) {}

  render(alpha) {
    this.object3d.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.object3d.rotation.y = lerpAngle(this.prevFacing, this.facing, alpha);
  }

  /** Snap the interpolation history (after teleports) so render() doesn't smear. */
  snap() { this.prevPos.copy(this.pos); this.prevFacing = this.facing; this.object3d.position.copy(this.pos); this.object3d.rotation.y = this.facing; }

  dispose() { this.object3d.removeFromParent(); }
}
