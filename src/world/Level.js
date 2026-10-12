// src/world/Level.js  (owner: world) — the runtime LevelData object (tech.md §12.1 typedef + GAME_DESIGN §12.1),
// built by LevelKit.buildLevel and driven by LevelManager. Besides the frozen LevelData fields (root, heightfield,
// colliders, octreeMeshes, spawns, enemySpawns, npcs, triggers, env, bounds, update, dispose) it carries:
//   id, def, spawnId, groups { terrain, props, grass, water, skyline, dawnstone, pickups, actors }, anchors, arenas,
//   vigils, interactables, actors (PropActors / critters), pickups, grass, batch, water[], music, indoor, fogBase,
//   waterLevelAt(x, z), isDeepWater(x, z, y), surfaceAt(x, z), anchor(name), arena(id), critter(id), actor(id),
//   setDawnstone(on), and the per-step trigger / interact / arena-autolock logic.
// Iso camera data (research/CONTROLS_SPEC.md §11, §12 world): `cam` ({ yaw, fog?, light? }), `zoneAt(pos)` (the zone
// she is in; zones with a `cam` hint win), `camZone` (the hint zone applied now; world drives `ctx.cam.setHint` on
// zone changes, out of combat only), `memeSpot` ({ at, yaw, r }), `navLinks` / `navBlock` (physics nav),
// `interactables` ({ id, pos, r, kind, enabled(), usePos?, use() }); E prefers the hovered interactable in reach.
// Everything gameplay-related runs in update(dt) (fixed step, play mode only); render() is visual only.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { distToPolyline, inBox } from './noise.js';
import { Terrain } from './Terrain.js';
import { pickZone } from './isoView.js';
import { CAMERA } from '../core/config.js';

const _v = new THREE.Vector3();
const GROUPS = ['terrain', 'props', 'grass', 'water', 'skyline', 'dawnstone', 'pickups', 'actors'];

/** Evaluate a zone condition: undefined → true, function(state, ctx) → bool, string → state.cond(). */
export function condOk(ctx, cond) {
  if (cond == null || cond === '') return true;
  if (typeof cond === 'function') { try { return !!cond(ctx.state, ctx); } catch (e) { console.warn('[world] condition failed', e); return false; } }
  if (typeof ctx.state?.cond === 'function') return !!ctx.state.cond(cond);
  return true;
}

/** Which LevelData.colliders list a collider shape belongs to (physics/StaticColliders shapes). */
export function colliderList(c) {
  if (c.kind === 'ring' || c.ring === true || c.inside === true) return 'rings';
  if (c.ax !== undefined || Array.isArray(c.a)) return 'segments';
  if (c.minX !== undefined || c.hx !== undefined || c.w !== undefined) return 'boxes';
  return 'circles';
}

/** Water surface y at (x, z) for one water entry (stream / rect / disc / plane), or null. Pure. */
export function waterEntryLevel(w, x, z) {
  if (!w) return null;
  const y = Number.isFinite(w.y) ? w.y : 0;
  switch (w.kind) {
    case 'stream': return distToPolyline(x, z, w.pts ?? [w.from, w.to]) <= (w.width ?? 6) / 2 ? y : null;
    case 'rect': return inBox(x, z, w.at, w.size, 0, w.yaw ?? 0) ? y : null;
    case 'disc': return Math.hypot(x - w.at[0], z - w.at[1]) <= w.r ? y : null;
    default: return y;           // a plane covering the level wherever the ground is lower
  }
}

/**
 * The current attempt at a level, kept in the save so Continue / game-over Retry add to the same run (results time,
 * lives lost, fish): `state.levels[id]` gets `runT0` (state.playtime at entry), `runLost` (lives lost) and `runFish0`
 * (fish at entry). An existing record is continued; LevelManager.exit drops it for the level left and the level
 * entered, so a normal entry always starts a fresh run. `scratch` (title backdrop): a throwaway record. Pure.
 * @returns {{runT0:number, runLost:number, runFish0:number}}
 */
export function levelRun(state, id, scratch = false) {
  const fresh = () => ({ runT0: state?.playtime ?? 0, runLost: 0, runFish0: state?.fish ?? 0 });
  if (scratch || !state || !id) return fresh();
  state.levels ??= {};
  const rec = state.levels[id] ??= {};
  if (!Number.isFinite(rec.runT0)) Object.assign(rec, fresh());
  if (!Number.isFinite(rec.runLost)) rec.runLost = 0;
  if (!Number.isFinite(rec.runFish0)) rec.runFish0 = state.fish ?? 0;
  return rec;
}

/** Drop the run record of a level (it is finished, or about to be entered normally). Pure. */
export function endLevelRun(state, id) {
  const rec = state?.levels?.[id];
  if (rec) { delete rec.runT0; delete rec.runLost; delete rec.runFish0; }
}

/** Ground-mist factor while an arena is locked (fx GroundMist reads `level.cam.fog.mist`): the fog wall is the edge. */
export const ARENA_MIST = 0.3;

/**
 * The level's own copy of `cam.fog` whose `mist` (fx GroundMist's per-level factor) drops to ARENA_MIST while one of
 * the level's arenas is locked: the 4–16 m mist ring otherwise washes the arena's own stones and walls 6–8 m from
 * her, and the fight's boundary is the fog wall. Outside fights it is the authored value (undefined = the preset's).
 */
export function arenaAwareFog(fog, level) {
  const out = { ...(fog ?? {}) }, base = out.mist;
  delete out.mist;
  Object.defineProperty(out, 'mist', {
    enumerable: true,
    get: () => (level.arenas?.some((a) => a.locked && !a.cleared) ? Math.min(Number.isFinite(base) ? base : 1, ARENA_MIST) : base),
  });
  return out;
}

export class Level {
  /** @param {any} ctx @param {any} def the defineLevel() definition */
  constructor(ctx, def) {
    this.ctx = ctx; this.def = def; this.id = def.id; this.spawnId = null;
    this.size = def.size ?? 200; this.half = this.size / 2;
    this.root = new THREE.Group(); this.root.name = 'level:' + def.id;
    /** @type {Record<string, THREE.Group>} */
    this.groups = {};
    for (const k of GROUPS) { const g = new THREE.Group(); g.name = k; this.groups[k] = g; this.root.add(g); }
    this.heightfield = null; this.terrain = null;
    this.colliders = { circles: [], boxes: [], segments: [], rings: [] };
    /** @type {THREE.Object3D[]} architecture for physics' Octree (bridge decks) */
    this.octreeMeshes = [];
    /** @type {Record<string, {pos: THREE.Vector3, facing: number}>} */
    this.spawns = {};
    /** @type {Record<string, {pos: THREE.Vector3, facing: number}>} */
    this.anchors = {};
    /** @type {import('./Arena.js').Arena[]} */
    this.arenas = [];
    this.triggers = []; this.vigils = []; this.interactables = []; this.actors = []; this.critters = [];
    this.enemySpawns = []; this.npcs = []; this.kittens = []; this.spawnedEnemies = [];
    this.water = def.water ?? [];
    this.spine = def.spine ?? [];
    this.pathWidth = def.pathWidth ?? 6;
    this.bounds = { min: new THREE.Vector2(-this.half + 2, -this.half + 2), max: new THREE.Vector2(this.half - 2, this.half - 2) };
    this.env = def.env ?? 'meadow_day';
    this.music = def.music ?? null;
    this.indoor = !!def.indoor;
    this.fogBase = def.fogBase ?? 0;
    /** CONTROLS_SPEC §11: the iso camera for this level ({ yaw, fog?: { clear, clearCombat, topMul } }; yaw π by default) */
    this.cam = def.cam ? { ...def.cam, fog: arenaAwareFog(def.cam.fog, this) } : null;
    /** §2.7 the level's Meme Cam spot { at: [x, z], yaw, r } (her facing for the shot; the camera looks back at her) */
    this.memeSpot = def.memeSpot ?? null;
    /** §5.3 authored nav links [{ a: [x, z], b: [x, z], kind: 'hop'|'drop'|'bounce'|'fence', when?, oneWay?, gate? }] */
    this.navLinks = def.navLinks ?? [];
    /** §5.3 cosmetic no-go rects [{ minX, maxX, minZ, maxZ }] (or { at: [x, z], size: [w, d] }) for the nav grid */
    this.navBlock = (def.navBlock ?? []).map((b) => (b.at && b.size ? { minX: b.at[0] - b.size[0] / 2, maxX: b.at[0] + b.size[0] / 2, minZ: b.at[1] - b.size[1] / 2, maxZ: b.at[1] + b.size[1] / 2 } : b));
    /** §2.2 the camera hint zone in effect (null = the level framing) and the one she is in now */
    this.camZone = null; this._zoneNow = null; this._calmT = 0; this._hintSent = false;
    this.pickups = null; this.grass = null; this.batch = null; this.trees = []; this.skyline = null; this.dawnstone = null; this.waterMeshes = null;
    /** visual-only animators { render(dt, t) } (windmill fans, flags) */
    this.animators = [];
    /** surface overrides [{ kind, test(x, z) → bool }] (bridges, planks) */
    this.surfaces = [];
    this._loaded = [];     // fns run once after physics + player are placed (enemy / kitten spawns)
    this._updaters = [];   // fns(dt) run every fixed step while the level is active
    this._renderers = [];  // fns(alpha, dt) visual
    this._timers = [];     // { t, fn } level-time callbacks (after())
    this._offs = [];
    this._time = 0;
    this._interact = null;
    this.startTime = 0; this.fishAtStart = 0;
    /** the run record (state.levels[id] runT0 / runLost / runFish0; a scratch object on the title backdrop) */
    this.run = { runT0: 0, runLost: 0, runFish0: 0 };
    this.exiting = false;
    this.disposed = false;
    this._dawnOn = true; this._farOn = undefined; this._farForce = null; this._skylineOn = true;
  }

  // ------------------------------------------------------------------ queries
  heightAt(x, z) { return this.heightfield ? this.heightfield.heightAt(x, z) : 0; }

  /** Water surface at (x, z) or null (physics, audio, fx). */
  waterLevelAt(x, z) {
    let best = null;
    for (const w of this.water) {
      const y = waterEntryLevel(w, x, z);
      if (y !== null && (best === null || y > best)) best = y;
    }
    return best;
  }

  /** Deep water at (x, z)? With feet height `y`, anything standing above the surface (bridge deck) is dry. */
  isDeepWater(x, z, y) {
    for (const w of this.water) {
      const wy = waterEntryLevel(w, x, z);
      if (wy === null) continue;
      if (Number.isFinite(y) && y >= wy - 0.05) continue;
      const depth = wy - this.heightAt(x, z);
      if (depth <= 0.05) continue;
      if (w.deep === true || (w.deep !== false && depth > 0.5)) return true;
    }
    return false;
  }

  /** Footstep surface: 'water' | 'wood' | 'stone' | 'dirt' | 'grass' (player → audio). */
  surfaceAt(x, z) {
    for (const s of this.surfaces) if (s.test(x, z)) return s.kind;
    const wy = this.waterLevelAt(x, z);
    if (wy !== null && wy > this.heightAt(x, z) + 0.02) return 'water';
    if (this.spine.length > 1 && distToPolyline(x, z, this.spine) < this.pathWidth * 0.42) return this.def.pathSurface ?? 'dirt';
    return this.def.surface ?? 'grass';
  }

  /** Lives lost in this run (Continue / Retry included). */
  get livesLost() { return this.run?.runLost ?? 0; }

  /** Anchor or spawn by name → { pos, facing } (null if unknown). */
  anchor(name) { return this.anchors[name] ?? this.spawns[name] ?? null; }

  arena(id) { return this.arenas.find((a) => a.id === id) ?? null; }

  /**
   * CONTROLS_SPEC §2.2 / §12 world: the zone def at `pos` ({ x, z }): zones with a camera hint (`zone.cam = { yaw?, dist?,
   * pitch?, clear? }`) win, then the smallest; the current hint zone holds until she is 1.5 m outside it. Or null.
   */
  zoneAt(pos) {
    if (!pos) return null;
    this._zoneOk ??= (zn) => zn.camIf == null || condOk(this.ctx, zn.camIf);
    return pickZone(this.def?.zones, pos.x, pos.z, this._zoneNow, undefined, this._zoneOk);
  }

  /** The level's iso yaw (default π: camera south of her, looking +Z). */
  get camYaw() { return Number.isFinite(this.cam?.yaw) ? this.cam.yaw : (CAMERA.iso?.yaw ?? Math.PI); }

  /**
   * §2.2 hint driver (fixed step): a zone change applies its `cam` hint (or the level framing on leaving) through
   * `ctx.cam.setHint`, only once no alerted hostile has been within the combat radius for `hint.calmFor` s; a blend
   * that started finishes. Reduce camera motion snaps. A camera that reads `zoneAt` itself sets `cam.zoneHints`.
   */
  _updateCamHint(dt, p) {
    const ctx = this.ctx, cam = ctx.cam, I = CAMERA.iso;
    if (!p || !I) return;
    const z = this.zoneAt(p.pos);
    this._zoneNow = z;
    const want = z?.cam ? z : null;
    // calm = no alerted, live hostile within the combat radius
    let engaged = false;
    const R = I.combat?.radius ?? 10;
    for (const e of ctx.enemies?.list ?? []) {
      if (!e || e.alive === false || e.dead || !e.alerted) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= R * R) { engaged = true; break; }
    }
    this._calmT = engaged ? 0 : this._calmT + dt;
    if (want === this.camZone && this._hintSent) return;
    if (this._hintSent && this._calmT < (I.hint?.calmFor ?? 2)) return;      // in combat the hint waits
    this.camZone = want; this._hintSent = true;
    if (cam?.zoneHints === true || typeof cam?.setHint !== 'function' || ctx.params?.cam === 'classic') return;
    const h = want?.cam ?? {};
    const snap = !!ctx.state?.settings?.reduceCameraMotion || !this._hintStarted;
    this._hintStarted = true;
    cam.setHint({ yaw: Number.isFinite(h.yaw) ? h.yaw : this.camYaw, pitch: h.pitch, dist: h.dist, clear: h.clear, zone: want?.id ?? null }, snap ? 0 : (I.hint?.blend ?? 1.2));
  }
  critter(id) { return this.critters.find((c) => c.critterId === id) ?? null; }
  actor(id) { return this.actors.find((a) => a.propId === id || a.critterId === id) ?? null; }

  /** The Dawnstone glow at `bell_far` (CS-02 shot 2 puts it out for good). */
  setDawnstone(on) { this._dawnOn = !!on; if (this.groups.dawnstone) this.groups.dawnstone.visible = !!on && this._farOn !== false; }

  /**
   * §4.1 the 'far' visibility group (sky dome, far skyline, horizon, Dawnstone): hidden in iso play (the lens never
   * sees the horizon from above), shown in cutscenes, presets and Meme Cam (the fog mode < 0.5). `on` = true / false
   * forces it (story `visible: { far }`), null = automatic again.
   */
  setFar(on) { this._farForce = on == null ? null : !!on; this._applyFar(); }

  _applyFar() {
    const env = this.ctx.env;
    const auto = this.ctx.params?.cam === 'classic' || !((env?._focusMode ?? 0) > 0.5);
    const on = this._farForce ?? auto;
    if (on === this._farOn) return;
    this._farOn = on;
    if (this.groups.skyline) this.groups.skyline.visible = on && this._skylineOn !== false;
    if (this.groups.dawnstone) this.groups.dawnstone.visible = on && this._dawnOn !== false;
    if (env?.sky?.mesh) env.sky.mesh.visible = on;
  }

  // ------------------------------------------------------------------ registration (LevelKit)
  /** Register a level actor (PropActor / Critter): actor registry + scene + per-step update. */
  addActor(a, id) {
    this.ctx.actors?.register(a, id);
    this.groups.actors.add(a.object3d);
    this.actors.push(a);
    return a;
  }

  removeActor(a) {
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
    const j = this.critters.indexOf(a);
    if (j >= 0) this.critters.splice(j, 1);
    this.ctx.actors?.unregister(a);
    a.dispose?.();
  }

  onLoaded(fn) { this._loaded.push(fn); }
  /** Run `fn` after `sec` seconds of level play time (fixed steps; paused in cutscenes / menus). */
  after(sec, fn) { this._timers.push({ t: Math.max(0, sec), fn }); }
  onUpdate(fn) { this._updaters.push(fn); }
  onRender(fn) { this._renderers.push(fn); }
  /** Bus subscription that lives as long as the level. */
  listen(name, fn) { this._offs.push(this.ctx.bus.on(name, fn)); }

  /** Physics colliders changed (gates opening, crates breaking): add / remove one. */
  addCollider(c) {
    const ph = this.ctx.physics;
    this.colliders[colliderList(c)].push(c);
    if (ph?.level === this && typeof ph.addCollider === 'function') ph.addCollider(c);
    return c;
  }

  removeCollider(c) {
    if (!c) return;
    const ph = this.ctx.physics;
    for (const list of Object.values(this.colliders)) { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); }
    if (ph?.level === this && typeof ph.removeCollider === 'function') ph.removeCollider(c);
  }

  // ------------------------------------------------------------------ lifecycle
  /** Called by LevelManager once physics has the level and the player is placed. */
  activate(spawnId) {
    const ctx = this.ctx;
    this.spawnId = spawnId;
    this.run = levelRun(ctx.state, this.id, spawnId === 'title');
    this.startTime = this.run.runT0; this.fishAtStart = this.run.runFish0;
    for (const fn of this._loaded.splice(0)) { try { fn(this); } catch (e) { console.error(`[world] ${this.id}: onLoaded failed`, e); } }
    this.listen(E.PLAYER_LIFE_LOST, () => { this.run.runLost = (this.run.runLost ?? 0) + 1; });
    this.listen(E.PLAYER_MEOW, (p) => { const pos = p?.position ?? ctx.player?.pos; if (pos) for (const c of this.critters) c.hearMeow?.(pos); });
    this.listen(E.PLAYER_DIED, () => { for (const a of this.arenas) if (a.locked) a.reset(); });
    // live mood (`def.moodLive`): a story flag that changes the env pick (town.free → hub_gold, forest.camp → night)
    // tweens to it in place; during a cutscene it waits for the scene to end (the scene owns the look). Music follows
    // the same `byFlag` rows on audio's side (musicMap re-evaluates them live).
    if (this.def?.moodLive) {
      const repick = () => { if (ctx.story?.isPlaying) return; this.repickMood(); };
      this.listen(E.FLAG_SET, repick);
      this.listen(E.CUTSCENE_END, () => this.repickMood());
    }
  }

  /** Re-pick the env preset from the level's byFlag rows; tween to it when it changed. */
  repickMood(dur = 3) {
    const ctx = this.ctx, lv = ctx.levels;
    if (!lv?.pickEnv || lv.current !== this) return;
    const env = lv.pickEnv(this.env);
    if (env && ctx.env && ctx.env.presetName !== env) ctx.env.preset(env, dur);
  }

  update(dt) {
    if (this.disposed) return;
    this._time += dt;
    const ctx = this.ctx, p = ctx.player;
    const alive = !!p && p.alive !== false;
    // arenas: auto-lock on entering the trigger disc (r − 2 / rect inset 2), waves, clear
    for (const a of this.arenas) {
      if (alive && !a.locked && !a.cleared && a.canAutoLock() && a.contains(p.pos, 2)) a.lock();
      a.update(dt);
    }
    // triggers (discs / boxes): fire on entry when their condition holds
    if (alive) for (const t of this.triggers) {
      if (t.fired && t.once) continue;
      const inside = t.size ? inBox(p.pos.x, p.pos.z, t.at, t.size, 0, t.yaw ?? 0) : Math.hypot(p.pos.x - t.at[0], p.pos.z - t.at[1]) <= (t.r ?? 2);
      if (inside && !t.inside && condOk(ctx, t.when)) {
        t.fired = true;
        try { t.fire(this, t); } catch (e) { console.error(`[world] trigger ${t.id} failed`, e); }
      }
      t.inside = inside;
    }
    for (const a of this.actors) a.update(dt);
    for (const v of this.vigils) v.update(dt);
    for (const fn of this._updaters) fn(dt);
    if (this._timers.length) {
      const due = [];
      for (let i = this._timers.length - 1; i >= 0; i--) { const tm = this._timers[i]; if ((tm.t -= dt) <= 0) { due.push(tm.fn); this._timers.splice(i, 1); } }
      for (const fn of due.reverse()) { try { fn(this); } catch (e) { console.error(`[world] ${this.id}: timer failed`, e); } }
    }
    this.pickups?.update(dt);
    this._updateCamHint(dt, alive ? p : null);
    this._updateInteract(alive ? p : null);
  }

  /** Nearest usable interactable → prompt events; `interact` press → use(). */
  _updateInteract(p) {
    const ctx = this.ctx;
    let best = null, bd = Infinity;
    if (p && ctx.game?.mode === 'play') {
      // §12 world 3: with two in reach, the one under the cursor / last tapped (player.hover) wins, else the nearest
      const hov = p.hover, hid = hov && (hov.kind === 'interact' || hov.kind === 'npc') ? (hov.id ?? hov.interact?.id ?? null) : null;
      for (const it of this.interactables) {
        if (it.enabled && !it.enabled()) continue;
        const d = Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z);
        if (!(d <= it.r && Math.abs(p.pos.y - it.pos.y) < 2.2)) continue;
        const dd = hid != null && it.id === hid ? -1 : d;
        if (dd < bd) { bd = dd; best = it; }
      }
    }
    if (best !== this._interact) {
      this._interact = best;
      if (best) ctx.bus.emit(E.INTERACT_AVAILABLE, { target: { id: best.id, kind: best.kind, position: best.pos.clone() }, prompt: best.prompt ?? 'prompt.interact' });
      else ctx.bus.emit(E.INTERACT_CLEAR, {});
    }
    if (best && ctx.input?.pressed?.('interact')) {
      ctx.bus.emit(E.INTERACT, { target: { id: best.id, kind: best.kind, position: best.pos.clone() } });
      try { best.use(this); } catch (e) { console.error(`[world] interact ${best.id} failed`, e); }
      if (best.enabled && !best.enabled()) { this._interact = null; ctx.bus.emit(E.INTERACT_CLEAR, {}); }
    }
  }

  /** Use the interactable `id` now (story / tests), as if she pressed E next to it. */
  interact(id) {
    const it = this.interactables.find((i) => i.id === id);
    if (!it || (it.enabled && !it.enabled())) return false;
    this.ctx.bus.emit(E.INTERACT, { target: { id: it.id, kind: it.kind, position: it.pos.clone() } });
    it.use(this);
    return true;
  }

  render(alpha, dt) {
    if (this.disposed) return;
    const ctx = this.ctx, t = this._time;
    const p = ctx.player, cam = ctx.camera;
    const center = p?.object3d?.position ?? cam?.position ?? _v.set(0, 0, 0);
    const vdt = ctx.game?.hitstopT > 0 ? 0 : dt;
    this._applyFar();
    // §4.2 grass tiles and LOD follow the iso focus (what the lens looks at), the trample follows her
    const focus = ctx.cam?.focus?.isVector3 && (ctx.env?._focusMode ?? 0) > 0.5 ? ctx.cam.focus : center;
    this.grass?.update(t, ctx.env, focus, p && p.alive !== false ? p.object3d.position : null);
    if (cam && this.groundLod) Terrain.updateGroundLod(this.groups.terrain, focus === center ? cam.position : focus, this.groundLod);
    if (this.batch && cam) this.batch.cull(cam.position, this.cullDist(), dt);
    for (const a of this.animators) a.render(vdt, t);
    for (const a of this.actors) a.render(alpha, vdt);
    for (const v of this.vigils) v.render(vdt, t);
    for (const fn of this._renderers) fn(alpha, vdt);
    this.pickups?.render(alpha, vdt);
    this.waterMeshes?.update(t, ctx.env);
    if (this.skyline && ctx.scene?.fog?.color) this.skyline.update(ctx.scene.fog.color);
    if (this.treeUniforms) { this.treeUniforms.uTime.value = t; this.treeUniforms.uWind.value = ctx.env?.wind ?? 0.6; }
  }

  /** Props beyond this distance are invisible in the fog anyway (FogExp2 > 99.5%). */
  cullDist() {
    const d = this.ctx.env?.fogDensity ?? 0.045;
    return Math.min(160, Math.max(45, 2.3 / Math.max(d, 1e-3)));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this._offs) off();
    this._offs.length = 0;
    if (this._interact) this.ctx.bus.emit(E.INTERACT_CLEAR, {});
    if (this.ctx.env?.sky?.mesh) this.ctx.env.sky.mesh.visible = true;
    for (const a of this.arenas) a.dispose();
    for (const a of [...this.actors]) this.removeActor(a);
    for (const v of this.vigils) v.dispose();
    for (const e of this.spawnedEnemies) if (this.ctx.enemies?.list?.includes(e)) this.ctx.enemies.despawn(e);
    this.spawnedEnemies.length = 0;
    this.pickups?.dispose();
    this.grass?.dispose();
    this.terrain?.dataTexture?.dispose?.();     // the grass ground-data texture (a uniform, not a material map)
    this.wheat?.dispose?.();
    // ground LOD tiles: both geometries (only one is attached at a time)
    this.groups.terrain?.traverse?.((m) => { const L = m.userData?.lod; if (L) { L.full.dispose(); L.coarse.dispose(); } });
    this.batch?.dispose();
    for (const t of this.trees) { t.geometry.dispose(); t.material.dispose(); t.removeFromParent(); }
    this.skyline?.dispose();
    this.waterMeshes?.dispose();
    this.terrain?.dataTexture?.dispose?.();
    this.triggers.length = 0; this.interactables.length = 0; this._updaters.length = 0; this._renderers.length = 0; this._timers.length = 0;
  }
}
