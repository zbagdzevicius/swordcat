// src/companions/CompanionManager.js  (owner: companions) — the ctx.companions system (GAME_DESIGN §19.3, §9):
//   active                      Companion[] (COMPANIONS.maxActive = 1 in MVP); mirrored to state.companions.active
//   setActive(ids)              swap the party (known companion ids only; each newly active id is also unlocked)
//   spawnNpc(id, pos, facing)   scripted NPC (cutscene `spawn` step); 'pudding' → Pudding; an active companion id
//                               returns that Companion moved to `pos`
//   spawnKitten(id, pos, hide, opts?)  a LostKitten (hide: 'meow'|'cage'|'stand'|'break'|'climb'|null); companion
//                               ids make a caged squire (Mochi D-01) that joins when freed
//   pudding                     the Pudding actor or null
// Extras for other areas (additive): unlock(id), useAbility(i), wallBetween(a, b) (Shield Wall occlusion for
// Combat), milkBonus (Mochi passive), kittens, bark(actor, category, opts), get(id), despawn(actor), clearLevel().
// Listens: level load/unload, her Meow and swings, arena clears/waves, story flags (join flags, meadow.pudding),
// the net_ropes objective, quality changes. Reads the `ability` input (Q / LT) during play.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { COMPANIONS } from '../core/config.js';
import { Companion } from './Companion.js';
import { NpcActor } from './NpcActor.js';
import { LostKitten } from './LostKitten.js';
import { Pudding, PUDDING } from './Pudding.js';
import { BARKS, lineText } from './lines.js';
import { BarkGate, COMPANION_IDS, JOIN_FLAGS, followSlot, groundY, FOLLOW_SIDE, SLOT } from './steering.js';

const _slot = { x: 0, z: 0 };
const toVec = (p) => (p == null ? new THREE.Vector3()
  : Array.isArray(p) ? (p.length >= 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], 0, p[1]))
    : new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));

export class CompanionManager {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Companion[]} */
    this.active = [];
    /** @type {Pudding|null} */
    this.pudding = null;
    /** level-scoped actors (NPCs, lost kittens, Pudding) */
    this.actors = [];
    /** live Shield Walls */
    this.walls = [];
    /** hiding props and opened cages left behind by kittens who went home ({ root, collider }) */
    this.dressing = [];
    /** arena ids cleared in the current level (cage / stand hides that need a clear) */
    this.cleared = new Set();
    this.gate = new BarkGate({ gap: 6, noRepeat: 60 });
    this._offs = [];
  }

  get maxActive() { return COMPANIONS.maxActive; }
  /** Lost kittens (and caged squires) in the level. */
  get kittens() { return this.actors.filter((a) => a instanceof LostKitten); }
  /** Mochi's passive: +1 milk capacity while he is in the party (§7.6, §9.2). */
  get milkBonus() { let n = 0; for (const c of this.active) n += c.cfg.milkBonus ?? 0; return n; }

  async init() {
    const bus = this.ctx.bus;
    this._offs.push(
      bus.on(E.LEVEL_UNLOAD, () => this.clearLevel()),
      bus.on(E.LEVEL_LOADED, (p) => this._onLevelLoaded(p)),
      bus.on(E.SAVE_LOADED, () => this._syncFromState()),
      bus.on(E.PLAYER_MEOW, (p) => this._onMeow(p?.position ?? this.ctx.player?.pos)),
      bus.on(E.PLAYER_SWING, (p) => { for (const k of this.kittens) k.onSwing(p?.attackId, this.ctx.player); }),
      bus.on(E.ARENA_CLEAR, (p) => { if (!p?.id) return; this.cleared.add(p.id); for (const k of this.kittens) k.onArenaClear(p.id); }),
      bus.on(E.ARENA_WAVE, () => { for (const k of this.kittens) if (k.companion && k.stateName === 'caged') this.bark(k, 'caged', { chance: 0.7 }); }),
      bus.on(E.FLAG_SET, (p) => this._onFlag(p?.key, p?.value)),
      bus.on(E.OBJECTIVE, (p) => { if (p?.id === 'net_ropes' && this.pudding) this.pudding.setRopesCut(p.value ?? 0); }),
      bus.on(E.QUALITY, (p) => this._applyQuality(p?.preset ?? this.ctx.quality)),
      bus.on(E.CUTSCENE_END, () => this._ensurePudding()),
    );
  }

  // ------------------------------------------------------------------ party

  _spawnCompanion(id, pos, facing = 0) {
    const c = new Companion(this.ctx, id, { pos, facing });
    this.ctx.actors.register(c, id);
    this.ctx.scene.add(c.object3d);
    return c;
  }

  /**
   * Swap the active companions (max COMPANIONS.maxActive). Unknown ids are ignored; kept ids keep their instance.
   * @param {string[]} ids @param {{ place?: boolean }} [o]
   * @returns {Companion[]}
   */
  setActive(ids = [], { place = true } = {}) {
    const want = [...new Set((ids ?? []).filter((id) => COMPANION_IDS.includes(id)))].slice(0, this.maxActive);
    const next = [];
    for (const c of this.active) {
      if (want.includes(c.kittenId)) continue;
      this.ctx.actors.unregister(c); c.dispose();
    }
    const fresh = [];
    for (const id of want) {
      let c = this.active.find((x) => x.kittenId === id);
      if (!c) { c = this._spawnCompanion(id); fresh.push(c); }
      next.push(c);
    }
    this.active = next;
    const st = this.ctx.state;
    if (st) {
      st.companions.active = want.slice();
      for (const id of want) if (!st.companions.unlocked.includes(id)) st.companions.unlocked.push(id);
    }
    if (place) this._place(fresh);
    this.ctx.bus.emit(E.COMPANION_CHANGED, { active: want.slice() });
    return this.active;
  }

  /** Put companions beside her (just behind her shoulder, on their side, where the camera sees them), on the ground. */
  _place(list = this.active) {
    const p = this.ctx.player;
    if (!p) return;
    for (const c of list) {
      followSlot(p.pos, p.facing, FOLLOW_SIDE[c.kittenId] ?? 1, _slot, { dist: SLOT.regroupDist, angle: SLOT.regroupAngle });
      c.pos.set(_slot.x, groundY(this.ctx, _slot.x, _slot.z, p.pos.y), _slot.z);
      c.vel.set(0, 0, 0); c.facing = p.facing; c.heading = p.facing; c.target = null; c.losT = 0;
      c.herStillT = SLOT.besideAfter; c.settled = true;
      c.snap(); c.visual?.snap();
    }
  }

  /** Unlock a companion (join flag / freed cage). Joins the party if there is room, appearing where `at` stood. */
  unlock(id, { at = null, activate = true } = {}) {
    if (!COMPANION_IDS.includes(id)) return false;
    const st = this.ctx.state;
    if (st && !st.companions.unlocked.includes(id)) st.companions.unlocked.push(id);
    const caged = at ?? this.actors.find((a) => a instanceof LostKitten && a.kittenId === id) ?? null;
    if (this.active.some((c) => c.kittenId === id)) { if (caged && this.actors.includes(caged)) this.despawn(caged); return true; }
    if (!activate || this.active.length >= this.maxActive) return true;
    const pos = caged ? caged.pos.clone() : null, facing = caged?.facing ?? 0;
    if (caged && this.actors.includes(caged)) this.despawn(caged);
    this.setActive([...this.active.map((c) => c.kittenId), id], { place: !pos });
    const c = this.active.find((x) => x.kittenId === id);
    if (c && pos) {
      pos.y = groundY(this.ctx, pos.x, pos.z, pos.y);
      c.pos.copy(pos); c.facing = facing; c.snap(); c.visual?.snap(); c.visual?.hop(0.3);
    }
    return true;
  }

  /** A caged squire's cage opened: play its join scene (e.g. D-01), then unlock. */
  joinFromCage(k) {
    const id = k.kittenId, play = k.opts?.play;
    k.visual?.setPose('cheer', 0.2); k.visual?.setExpression('happy'); k.visual?.hop(0.35);
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      if (!this.actors.includes(k)) return this.unlock(id, { activate: true });
      if (this.active.length < this.maxActive || this.active.some((c) => c.kittenId === id)) this.unlock(id, { at: k });
      else this.unlock(id, { activate: false });                 // party full: they wave and head home
    };
    if (play && this.ctx.story?.play) {
      try { Promise.resolve(this.ctx.story.play(play)).then(finish, finish); } catch (e) { console.warn('[companions] join scene failed', e); finish(); }
    } else finish();
  }

  /** Fire the ability of active companion `i` (also the touch portrait button). */
  useAbility(i = 0) { return this.active[i]?.useAbility() ?? false; }

  // ------------------------------------------------------------------ spawning

  _add(actor, id) {
    this.actors.push(actor);
    // a party member keeps its cutscene id (a reloaded level re-spawning the empty squire cage must not steal 'mochi')
    const taken = this.active.some((c) => c.kittenId === id && c !== actor);
    this.ctx.actors.register(actor, taken ? undefined : id);
    this.ctx.scene.add(actor.object3d);
    return actor;
  }

  /** Spawn a scripted NPC (cutscene `spawn` step). 'pudding' creates the Pudding actor. */
  spawnNpc(id, pos, facing = 0) {
    const at = toVec(pos);
    if (at.y === 0) at.y = groundY(this.ctx, at.x, at.z, this.ctx.physics?.heightAt?.(at.x, at.z) ?? 0);
    if (id === 'pudding') {
      if (this.pudding) this.despawn(this.pudding);
      const p = new Pudding(this.ctx, { pos: at, facing });
      this.pudding = p;
      this._add(p, 'pudding');
      p.loadVisual();
      return p;
    }
    const comp = this.active.find((c) => c.kittenId === id);
    if (comp) {                                                   // the party member steps into the scene
      comp.pos.copy(at); comp.facing = facing; comp.vel.set(0, 0, 0); comp.snap(); comp.visual?.snap();
      return comp;
    }
    const prev = this.actors.find((a) => a instanceof NpcActor && a.npcId === id);
    if (prev) this.despawn(prev);
    return this._add(new NpcActor(this.ctx, id, { pos: at, facing }), id);
  }

  /**
   * Place a lost kitten (hide: 'meow' | 'cage' | 'stand' | 'break' | 'climb' | null).
   * opts (all optional): { facing, prop: 'barrel'|'bush', standTime, needClear: arenaId, zoneR, zoneAt, cage: style,
   * hits, hp, play: cutsceneId (companion join scene), y: perch height }.
   */
  spawnKitten(kittenId, pos, hide = null, opts = {}) {
    const prev = this.actors.find((a) => a instanceof LostKitten && a.kittenId === kittenId);
    if (prev) this.despawn(prev);
    const k = new LostKitten(this.ctx, kittenId, { ...opts, pos: toVec(pos), hide });
    if (opts.needClear && this.cleared.has(opts.needClear)) k.cleared = true;
    this._add(k, kittenId);
    k.attachToWorld();
    return k;
  }

  despawn(actor) {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
    const d = actor instanceof LostKitten ? actor.releaseDressing() : null;    // the barrel / empty cage stays
    if (d) this.dressing.push(d);
    if (this.pudding === actor) this.pudding = null;
    this.ctx.actors.unregister(actor);
    actor.dispose();
    for (const c of this.active) if (!this.ctx.actors.get(c.kittenId)) this.ctx.actors.register(c, c.kittenId);
  }

  clearLevel() {
    for (const a of [...this.actors]) this.despawn(a);
    for (const d of this.dressing) {
      d.root.removeFromParent();
      d.cage?.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });     // procedural; GLB clones share the cache
      if (d.collider) { try { this.ctx.physics?.removeCollider?.(d.collider); } catch { /* level gone */ } }
    }
    this.dressing.length = 0;
    for (const w of this.walls) w.dispose();
    this.walls.length = 0;
    for (const c of this.active) { c._endAbility(); c.clearArrows(); c.target = null; }
    this.cleared.clear();
  }

  /** Actor by id among this area's actors (active companions first). */
  get(id) { return this.active.find((c) => c.kittenId === id) ?? this.actors.find((a) => a.actorId === id || a.kittenId === id || a.npcId === id) ?? null; }

  // ------------------------------------------------------------------ Shield Wall

  addWall(wall) { this.walls.push(wall); wall.start(); return wall; }

  /**
   * The live Shield Wall crossed by the XZ segment a → b coming from the wall's outer side (an enemy blow or
   * shot aimed at someone behind it), or null. Combat redirects such hits to the wall (requests/companions.md).
   */
  wallBetween(a, b) {
    if (!a || !b) return null;
    for (const w of this.walls) if (w.alive && w.between(a.x, a.z, b.x, b.z)) return w.posts[Math.floor(w.posts.length / 2)] ?? w;
    return null;
  }

  // ------------------------------------------------------------------ barks

  /**
   * Bark (§6): ≤ 1 per 6 s across the party, `chance` per trigger, no repeat within 60 s; shown in a bubble
   * over the speaker for 1.6 s. `pool` 'any' uses the shared nap / wake / meow lines. 'meow' answers bypass the gate.
   * @returns {string|null} the strings key spoken
   */
  bark(actor, category, { chance = 0.25, force = false, pool = null, dur = 1.6 } = {}) {
    if (!actor?.bubble) return null;
    const keys = (pool === 'any' ? BARKS.any : BARKS[actor.kittenId ?? actor.npcId])?.[category];
    if (!keys?.length) return null;
    let key;
    if (category === 'meow') key = keys[0];
    else key = this.gate.pick(keys, this.ctx.game?.time ?? 0, this.ctx.rng ?? Math.random, { chance, force });
    if (!key) return null;
    const text = lineText(this.ctx, key);
    actor.bubble.show(text, dur);
    actor.visual?.emote('meow');
    this.babble(actor, text);
    return key;
  }

  /** Babble blips for a bubble line (§16.4), only in play: cutscene dialogue owns the voice channel. */
  babble(actor, text) {
    if (this.ctx.game?.mode !== 'play' && this.ctx.game?.mode !== 'memecam') return;
    try { this.ctx.audio?.babble?.(actor.kittenId ?? actor.npcId ?? 'kitten', text); } catch (e) { console.warn('[companions] babble failed', e); }
  }

  /** A lost kitten was rescued: the active companion may cheer about it. */
  onKittenRescued(k) {
    for (const c of this.active) if (c.napT <= 0 && !c.scripted) { this.bark(c, 'kitten', { chance: 0.25 }); break; }
  }

  // ------------------------------------------------------------------ events

  _onMeow(pos) {
    if (!pos) return;
    for (const c of this.active) c.onMeow();
    for (const k of this.kittens) k.onMeow(pos);
  }

  _onFlag(key, value) {
    const on = value !== undefined && value !== null && value !== false && value !== 0;
    if (JOIN_FLAGS[key] && on) this.unlock(JOIN_FLAGS[key]);
    if (key === 'meadow.pudding' && this.ctx.levels?.current?.id === 'meadow') {
      if (value === 'netted') {
        if (!this.pudding) this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing);
        if (!this.pudding.netted) this.pudding.setNetted(true);
      } else if (on) {
        if (!this.pudding) { this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing); this.pudding.perchNow(); }
        else this.pudding.free();
      }
    }
  }

  _syncFromState() {
    const want = this.ctx.state?.companions?.active ?? [];
    const have = this.active.map((c) => c.kittenId);
    if (want.length !== have.length || want.some((id, i) => id !== have[i])) this.setActive(want);
  }

  _onLevelLoaded(p) {
    this._syncFromState();
    for (const c of this.active) if (c.object3d.parent !== this.ctx.scene) this.ctx.scene.add(c.object3d);   // a level swap may clear the scene
    this._place();
    for (const c of this.active) { if (c.napT > 0) c.wake(); c.hp = c.maxHp; c.cooldown = 0; }
    this._ensurePudding(p?.id);
  }

  /**
   * Pudding's meadow state after CS-03 (`meadow.pudding` 'netted' → in the net, true → perched along the level). Runs
   * on level load (reload after a death or a save) and after every cutscene: a scene that spawned its own Pudding and
   * despawned him at its end (or set the flag before that despawn) must not leave the glade empty.
   */
  _ensurePudding(levelId = this.ctx.levels?.current?.id) {
    if (levelId !== 'meadow' || this.pudding || this.ctx.levels?.loading) return;
    const f = this.ctx.state?.getFlag?.('meadow.pudding');
    if (f === 'netted') { this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing); this.pudding.setNetted(true); }
    else if (f === true) { this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing); if (!this.pudding.perchNow()) this.despawn(this.pudding); }
  }

  _applyQuality(preset) {
    if (!preset) return;
    for (const c of this.active) c.visual?.applyQuality(preset);
    for (const a of this.actors) a.visual?.applyQuality?.(preset);
  }

  // ------------------------------------------------------------------ loop

  update(dt) {
    const ctx = this.ctx, g = ctx.game;
    if (g.mode === 'play' && !ctx.levels?.loading && ctx.input?.pressed?.('ability')) {
      const p = ctx.player;
      if (p && p.alive !== false && !p.scripted) this.useAbility(0);
    }
    for (const c of this.active) c.update(dt);
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      a.update(dt);
      if (a.stateName === 'gone' && a instanceof LostKitten) this.despawn(a);
    }
    if (g.mode === 'play' || g.mode === 'memecam') {
      for (let i = this.walls.length - 1; i >= 0; i--) if (!this.walls[i].update(dt)) this.walls.splice(i, 1);
    }
  }

  render(alpha, dt) {
    for (const c of this.active) c.render(alpha, dt);
    for (const a of this.actors) a.render(alpha, dt);
    for (const w of this.walls) w.render(dt);
  }

  dispose() {
    this.clearLevel();
    for (const c of this.active) { this.ctx.actors.unregister(c); c.dispose(); }
    this.active = [];
    for (const off of this._offs) off();
    this._offs.length = 0;
  }
}
