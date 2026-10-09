// src/companions/NpcActor.js  (owner: companions) — scripted NPCs (GAME_DESIGN §19.2): Pearl, Whiskerbottom,
// Marmalade, Snowpaw, Earl Grey, Pip, Tofu, squires, villagers, old knights (characters' buildKitten via catConfig)
// and Coo the courier pigeon (creatures/monsters-blob/Pigeon.glb, clip set S1). The ScriptedActor API is the
// story's handle on them; when not scripted they idle, turn to watch her when she is near, and can wave.
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { ScriptedActorMixin } from '../core/ScriptedActor.js';
import { Animator } from '../core/Animator.js';
import { damp, dampAngle, wrapAngle } from '../core/math.js';
import { catConfig, villagerConfig, visualDt } from '../characters/index.js';
import { KittenVisual } from './KittenVisual.js';
import { TextSprite } from './Bubble.js';
import { disposeInstance } from '../core/Assets.js';

/** GLB-backed NPCs (everything else is a procedural cat). Clip names are clip set S1 (ASSETS.md). */
export const NPC_GLB = {
  coo: { model: 'models/creatures/monsters-blob/Pigeon.glb', fit: { h: 0.5 }, idle: 'Idle', walk: 'Walk', clips: { hop: 'Jump', jump: 'Jump', yes: 'Yes', nod: 'Yes', no: 'No', shake: 'No', dance: 'Dance', peck: 'Bite_Front' } },
};

/** buildKitten config for an NPC id: named cats, squires, old knights, lost kittens, `villager_<seed>`, else a seeded villager. */
export function npcLook(npcId) {
  return catConfig(npcId) ?? villagerConfig(String(npcId), { id: String(npcId) });
}

const LOOK_RADIUS = 3.5;

export class NpcActor extends ScriptedActorMixin(Actor) {
  /**
   * @param {any} ctx @param {string} npcId
   * @param {{pos?: THREE.Vector3, facing?: number, cfg?: object, visual?: boolean, greet?: boolean}} [opts]
   */
  constructor(ctx, npcId, opts = {}) {
    const glb = NPC_GLB[npcId] ?? null;
    const look = glb ? null : (opts.cfg ?? npcLook(npcId));
    const scale = look?.scale ?? 1;
    super(ctx, { faction: 'neutral', radius: glb ? 0.22 : 0.28 * Math.max(0.7, scale) * (look?.width ?? 1), height: glb ? 0.5 : 0.95 * scale, maxHp: 1, mass: 1 });
    this.npcId = npcId;
    this.tags.add('npc');
    this.hurtable = false;
    if (opts.pos) this.pos.copy(opts.pos);
    this.facing = opts.facing ?? 0;
    this.homeFacing = this.facing;
    this.stateName = 'idle';
    this.greet = opts.greet ?? false;
    this.object3d.name = 'npc:' + npcId;
    this.visual = null; this.anim = null; this.glb = glb; this.model = null;
    this._clipWaits = [];
    if (opts.visual !== false) {
      if (glb) this._loadGlb();
      else { this.visual = new KittenVisual(ctx, look); this.object3d.add(this.visual.root); }
    }
    this.bubble = new TextSprite({ kind: 'bubble', y: this.height + 0.3 });
    this.object3d.add(this.bubble.object);
    this.snap();
  }

  async init() {}

  async _loadGlb() {
    try {
      const m = await this.ctx.assets.model(this.glb.model, { fit: this.glb.fit });
      if (this.disposed) return;
      this.model = m;
      this.object3d.add(m.root);
      this.anim = new Animator(m.scene, m.animations);
      this.anim.play(this.glb.idle);
    } catch (e) { console.warn(`[companions] ${this.npcId} model failed`, e); }
  }

  /** Show a speech bubble (barks; cutscene dialogue is the ui's). */
  say(text, dur = 1.6) { this.bubble.show(text, dur); this.visual?.emote('meow'); this.ctx.companions?.babble?.(this, text); }

  // ---- ScriptedActor visual hooks
  onPose(name) { this.visual?.setPose(name); }
  onEmote(name) {
    if (this.visual) this.visual.emote(name);
    else if (this.anim) { const c = this.glb.clips[name]; if (c) this._once(c); }
  }
  onProp(name, on) { this.visual?.setProp(name, on); }
  playClip(clip, { once = false, speed = 1, clampEnd = false } = {}) {
    if (this.anim) {
      const name = this.anim.has(clip) ? clip : this.glb.clips[String(clip).toLowerCase()];
      if (!name) return Promise.resolve();
      if (once) return this._once(name, speed, clampEnd);
      this.anim.play(name, { speed });
      this._loopClip = name;
      return Promise.resolve();
    }
    const v = this.visual;
    if (!v) return Promise.resolve();
    const c = String(clip).toLowerCase();
    if (c === 'cheer' || c === 'yes') { v.setPose('cheer'); v.hop(0.2); }
    else if (c === 'jump' || c === 'hop') v.hop(0.3);
    else if (c === 'wave') v.setWave(true);
    else if (c === 'no') v.emote('shake');
    else if (c === 'nod') v.emote('nod');
    else v.setPose(c);
    return once ? new Promise((r) => this._clipWaits.push({ t: 0.45, r })) : Promise.resolve();
  }
  _once(name, speed = 1, clampEnd = false) {
    const p = this.anim.play(name, { once: true, speed, clampEnd });
    if (!clampEnd) p.then(() => { if (!this.disposed && this.anim) this.anim.play(this._loopClip ?? this.glb.idle); });
    return p;
  }
  onAttach(to) { this.visual?.setPose(to ? 'sit' : 'idle'); }
  onScripted(on) { if (!on) this.homeFacing = this.facing; this.visual?.setWave(false); }

  update(dt) {
    if (!this.ctx.game.simActive(this)) return;
    const w = this._clipWaits;
    for (let i = w.length - 1; i >= 0; i--) if ((w[i].t -= dt) <= 0) { const r = w[i].r; w.splice(i, 1); r(); }
    if (this.scripted || this.attachedTo) {
      this.scriptedStep(dt);
      if (!this.attachedTo) this.ctx.physics.moveActor(this, dt);
      return;
    }
    // idle: turn to watch her when she is near, back to the home facing otherwise
    this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt);
    const p = this.ctx.player;
    const d = p ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : Infinity;
    if (d < LOOK_RADIUS) this.facing = dampAngle(this.facing, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 3, dt);
    else this.facing = dampAngle(this.facing, this.homeFacing, 1.5, dt);
    this.visual?.setWave(this.greet && d < 6 && d > 1.5);
    this.ctx.physics.moveActor(this, dt);
  }

  render(alpha, dt) {
    super.render(alpha);
    const vdt = visualDt(this.ctx, dt ?? 0);         // 0 in hitstop / the pause menu, × slow-mo
    if (this.visual) {
      const p = this.ctx.player;
      let look = 0;
      if (p && !this.scripted) {
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d < LOOK_RADIUS + 1.5) look = wrapAngle(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.facing);
      }
      this.visual.lookAt(look);
      this.visual.update(dt ?? 0, { velocity: this.vel, onGround: this.onGround || !!this.attachedTo });
    } else if (this.anim) {
      const moving = Math.hypot(this.vel.x, this.vel.z) > 0.3;
      const want = moving ? this.glb.walk : (this._loopClip ?? this.glb.idle);
      if (this.anim.currentName !== want && (this.anim.currentName === this.glb.walk || this.anim.currentName === this.glb.idle || this.anim.currentName === this._loopClip)) this.anim.play(want);
      this.anim.update(vdt);
    }
    this.bubble.update(vdt);
  }

  dispose() {
    this.disposed = true;
    for (const w of this._clipWaits) w.r();
    this._clipWaits.length = 0;
    this.anim?.dispose();
    this.visual?.dispose();
    this.bubble.dispose();
    if (this.object3d) disposeInstance(this.object3d, { detach: false });   // GLB NPCs (Coo): bone texture
    super.dispose();
  }
}
