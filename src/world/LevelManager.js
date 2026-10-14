// src/world/LevelManager.js  (owner: world) — the ctx.levels system (§19.3, tech.md §12.1):
//   load(id, spawnId)  (serialised; preloads the level's manifest subset, builds it with LevelKit, hands it to physics,
//                       applies its env preset, places the player, pre-compiles shaders, emits level:loaded)
//   current            the runtime Level (LevelData + id, def, spawnId), or null
//   loading            true while a load is in flight (Game skips gameplay systems)
//   anchor(name)       → { pos, facing } (level anchors, then spawns)
//   arenaNear(pos, maxDist = 20) → Arena (lock(), clear())
//   setVisible(group, on)  'terrain' | 'props' | 'grass' (CloudSea flights) + 'water' | 'skyline' | 'dawnstone' | 'pickups'
//                          + 'far' (CONTROLS_SPEC §4.1: sky dome, skyline, Dawnstone; hidden in iso play; null = auto)
// Additive (world): arena(id), exit(to, spawnId) (exit box: flag <level>.done, level:exit, level:results, then the
// next level), results(), interact(id), spawnProp(name, at, opts) / despawnProp(obj) (story's placed props: signpost,
// post bag, cot...), setDawnstone(on). Level triggers / interacts / arenas run inside Level.update (play mode only).
import { E } from '../core/events.js';
import { KITTENS_BY_LEVEL, BOSSES, FADE_COLOR, LEVEL_IDS } from '../core/config.js';
import { prewarm } from '../core/prewarm.js';
import { ENV_PRESETS, resolvePreset } from './Env.js';
import { buildProp } from '../characters/index.js';
import { endLevelRun } from './Level.js';
import { ARENA } from './Arena.js';
// PERF §1.2: Dressing's flame / firefly shaders are modules of the linked fx program; importing it at boot links them
// in before the first compile (a level module importing it later would cost a program of its own)
import './Dressing.js';
import { disposeInstanceMaterials } from '../enemies/rig.js';
import { releaseCpuOnUpload } from '../core/Assets.js';
import { showRecovery, hideRecovery } from '../core/recovery.js';

/** Dynamic import per level = Vite code-splits each level (§19.1 A1 ids). */
export const LEVELS = {
  meadow: () => import('./levels/meadow.js'),
  forest: () => import('./levels/forest.js'),
  town: () => import('./levels/town.js'),
  gate: () => import('./levels/gate.js'),
  bog: () => import('./levels/bog.js'),
  keep: () => import('./levels/keep.js'),
};

/** §6.8 results ranks by lives lost in the level: 0–1 Paw-some, 2–4 Purr-fect, 5+ Mew-tiful. Pure. */
export function rankFor(livesLost) {
  if (livesLost <= 1) return 'pawsome';
  if (livesLost <= 4) return 'purrfect';
  return 'mewtiful';
}

/**
 * Every enemy variant a level can put on screen (shader warm-up): arena waves + bosses, open-fight spawns and the
 * level's `warm` rows ({ types, opts?, when? }: cutscene casts such as CS-02's caged hyenas, whose dressing differs).
 * Pure; `cond(c)` evaluates a `when`. Deduplicated by type + opts.
 * @returns {{type: string, opts: object}[]}
 */
export function levelEnemyWarm(def, cond = () => true) {
  const out = new Map();
  const add = (type, opts = {}) => { if (typeof type === 'string' && type) out.set(type + JSON.stringify(opts), { type, opts }); };
  for (const z of def?.zones ?? []) {
    if (z.kind === 'arena') { for (const w of z.waves ?? []) for (const [t] of w) add(t); if (z.boss) add(z.boss); }
    if (z.kind === 'open') for (const [t] of z.spawns ?? []) add(t);
  }
  for (const w of def?.warm ?? []) if (w.when == null || cond(w.when)) for (const t of w.types ?? []) add(t, w.opts ?? {});
  return [...out.values()];
}

/** The enemy type ids of levelEnemyWarm (pure). */
export const levelEnemyTypes = (def, cond) => [...new Set(levelEnemyWarm(def, cond).map((w) => w.type))];

/** Shader warm-up tuning: roots compiled per yield (core `prewarm`), and the time allowed for the warm models to load. */
export const PREWARM = Object.freeze({ batch: 12, loadTimeout: 6000 });

/** PERF §10.3 next-level prefetch: start `delay` s after `level:loaded`; while an arena is locked retry every `retry` s. */
export const PREFETCH = Object.freeze({ delay: 5, retry: 2 });

/** The chapter after `id` in LEVEL_IDS order (pure), or null for the last / an unknown one. */
export function nextLevelId(id) {
  const i = LEVEL_IDS.indexOf(id);
  return i >= 0 && i < LEVEL_IDS.length - 1 ? LEVEL_IDS[i + 1] : null;
}

/**
 * The warm-up roots for core `prewarm` (pure): the level's top-level groups plus every other visible scene child
 * (enemy stand-ins, fx pools, the player), so programs compile in batches rather than in one long stall.
 * @param {import('three').Object3D} scene @param {import('three').Object3D} levelRoot @returns {import('three').Object3D[]}
 */
export function warmRoots(scene, levelRoot) {
  const out = [];
  for (const c of scene.children) {
    if (c === levelRoot) { for (const g of c.children) if (g.visible) out.push(g); }
    else if (c.visible && !c.isLight && !c.isCamera) out.push(c);
  }
  return out;
}

/** Dispose level-owned GPU resources (never shared GLB template geometry). */
export function disposeOwned(root) {
  root?.traverse((o) => {
    if (!o.userData?.owned) return;
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData?.noDispose) continue;          // shared across levels (e.g. the critter toon material)
      for (const v of Object.values(m)) if (v?.isTexture && v.userData?.owned) v.dispose();
      m.dispose();
    }
  });
}

/** A failed dynamic import (Chromium / Firefox / Safari wording), which the browser will not retry in this page. Pure. */
export function isModuleImportError(message) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch module/i.test(String(message ?? ''));
}

/** F7: geometries under this many vertices keep their CPU arrays (see cpuReleaseSkip). */
export const CPU_RELEASE = Object.freeze({ minVerts: 1024 });

/**
 * F7 filter (pure): true when the CPU copy of `o`'s geometry must stay. `shared` = geometries owned by the asset cache
 * (template GLBs), `occl` = meshes / geometries the camera raycasts. Non-meshes return false (releaseCpuOnUpload
 * ignores them anyway).
 * @param {any} o @param {Set<any>} [shared] @param {Set<any>} [occl]
 */
export function cpuReleaseSkip(o, shared = new Set(), occl = new Set(), minVerts = CPU_RELEASE.minVerts) {
  if (!o?.isMesh) return false;
  const g = o.geometry, ud = o.userData ?? {};
  if (!g?.attributes) return true;
  // small geometry may come from a module-level cache (eyes, brows, prop parts) that a later build clones or merges;
  // the heap win is in the big level-unique buffers (terrain tiles, merged props, skyline)
  if ((g.attributes.position?.count ?? 0) < minVerts) return true;
  if (o.isBatchedMesh || o.isSkinnedMesh || o.isInstancedMesh) return true;
  if (shared.has(g) || occl.has(o) || occl.has(g)) return true;
  // camera fade / occluder tags (Occluders registers and raycasts these; `false` = never registered)
  if ((ud.camFade !== undefined && ud.camFade !== false) || ud.camFadeBox || ud.camFadeIds || ud.camFadeSolidIds) return true;
  const at = g.attributes;
  for (const k in at) if (k !== 'position' && at[k] === at.position) return true;   // uber: normal aliases position
  return false;
}

/** Every geometry under the settled glTF cache entries of `assets` (shared templates; never released). */
export function sharedGeometries(assets) {
  const out = new Set();
  const vals = assets?._values;
  if (!vals?.forEach) return out;
  vals.forEach((v, key) => {
    if (typeof key !== 'string' || !key.startsWith('gltf:')) return;
    const roots = v?.scenes ?? (v?.scene ? [v.scene] : []);
    for (const r of roots) r?.traverse?.((o) => { if (o.geometry) out.add(o.geometry); });
  });
  return out;
}

/** Meshes and ray geometries the camera's occluder fader registered (read defensively; camera owns the shape). */
export function occluderMeshes(cam) {
  const out = new Set();
  try {
    const list = cam?.occluderMeshes?.() ?? null;
    if (list) { for (const m of list) out.add(m); return out; }
    for (const u of cam?._fader?.units ?? []) for (const p of u?.parts ?? []) {
      if (p?.mesh) out.add(p.mesh);
      if (p?.rayGeo) out.add(p.rayGeo);
    }
  } catch { /* camera internals changed: skip nothing extra */ }
  return out;
}

export class LevelManager {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {import('./Level.js').Level|null} the loaded level */
    this.current = null;
    /** true while a load is in flight (Game skips gameplay systems) */
    this.loading = false;
    /** load() calls so far (requests, not completions): a caller that awaited something first compares it to learn
     *  whether a newer load was asked for meanwhile (Cutscene end blocks drop such a stale load) */
    this.requests = 0;
    this._queue = Promise.resolve();
    this._props = new Set();
    this._offs = [];
    /** @type {any[]} warm-up stand-in models kept (hidden, detached) until the level unloads */
    this._warmKeep = [];
  }

  async init() {}

  /** Load `id` and place the player at `spawnId` (falls back to 'start'). Loads are serialised. */
  load(id, spawnId = 'start') {
    this.requests++;
    const run = () => this._load(id, spawnId ?? 'start');
    const p = this._queue.then(run, run);
    this._queue = p.catch(() => {});
    return p;
  }

  /**
   * F6: the level module and its p0 assets are fetched FIRST, while the old level stays up; only then is the old level
   * unloaded (`level:loading`, `level:unload`) and the new one built. A failed fetch keeps the old level, lifts the
   * veil and shows the Retry panel (core/recovery.js), which re-queues `load(id, spawnId)`; the promise resolves to
   * null (callers such as `exit()` or story steps never see a rejection). A failed build (old level already gone)
   * shows the same panel. An unknown id still throws (a programming error, not a network one).
   */
  async _load(id, spawnId) {
    const ctx = this.ctx, { bus, scene } = ctx;
    if (!LEVELS[id]) throw new Error(`[levels] unknown level "${id}"`);
    this.loading = true;
    this._cancelPrefetch();
    hideRecovery('level');
    ctx.ui?.loading?.(true, { color: FADE_COLOR });     // core.W3 / WA §2.7: load veils are cream, never black
    // the previous level's delayed cache release must not drop what this load is about to preload (Assets cancels it
    // on level:loading, which now fires after the preload)
    try { ctx.assets?._cancelRelease?.(); } catch { /* optional */ }
    let def;
    try {
      // PERF W3 / §10.3: the p0 tier and the level module download in parallel; p1 follows without blocking the veil
      const [, mod] = await Promise.all([ctx.assets.preloadLevel(id, 'p0'), LEVELS[id]()]);
      def = mod?.default;
      if (typeof def?.build !== 'function') throw new Error(`[levels] ${id}: module has no build()`);
    } catch (e) {
      this.loading = false;
      ctx.ui?.loading?.(false);
      this._loadFailed(id, spawnId, e, 'fetch');
      return null;
    }
    try {
      bus.emit(E.LEVEL_LOADING, { id, spawnId });
      this._unload();
      const p1 = ctx.assets.preloadLevel?.(id, 'p1');
      p1?.catch?.(() => {});
      let level;
      try { level = await def.build(ctx); } catch (e) { this._loadFailed(id, spawnId, e, 'build'); return null; }
      level.id = id; level.def = def;
      scene.add(level.root);
      ctx.physics.setLevel(level);
      ctx.env?.preset?.(this.pickEnv(level.env), 0);
      this.current = level;
      if (ctx.state) { ctx.state.levelId = id; ctx.state.spawnId = spawnId; }
      const sp = level.spawns[spawnId] ?? level.spawns.start;
      if (!level.spawns[spawnId]) console.warn(`[levels] ${id}: no spawn "${spawnId}", using start`);
      ctx.player?.teleport?.({ pos: sp.pos.clone(), facing: sp.facing });
      level.activate(level.spawns[spawnId] ? spawnId : 'start');
      // shader warm-up under the loading veil (no hitch on first view, first arena lock or first wave)
      await this._prewarm(level);
      this.loading = false;
      bus.emit(E.LEVEL_LOADED, { id, level, spawnId });
      // F7 (PERF §5 heap): after the warm-up and after level:loaded (the camera has registered its occluders, whose
      // triangles it raycasts), free the CPU copies of the static level geometry once it is on the GPU
      this._releaseCpu(level);
      const track = this.pickMusic(level.music);
      if (track) bus.emit(E.MUSIC, { track, fade: 1.5 });
      this._schedulePrefetch(id, level);
      return level;
    } finally {
      this.loading = false;
      ctx.ui?.loading?.(false);
    }
  }

  /**
   * A load failed: log (warn, not error), lift the veil (the caller's finally) and offer Retry. Retry re-queues the load,
   * except after a failed module import: browsers cache a failed dynamic import for the page's lifetime, so there the
   * button saves and reloads the page (the title's Continue picks the run up again).
   */
  _loadFailed(id, spawnId, err, stage) {
    console.warn(`[levels] ${id}: ${stage} failed${this.current ? `; keeping ${this.current.id}` : ''}`, err);
    const message = String(err?.message ?? err);
    this.lastError = { id, spawnId, stage, message };
    const reload = stage === 'fetch' && isModuleImportError(message);
    showRecovery('level', {
      strings: this.ctx.strings,
      onAction: () => {
        if (!reload) { this.load(id, spawnId); return; }
        try { this.ctx.save?.save?.('retry'); } catch { /* best effort */ }
        this._reload();
      },
    });
  }

  /** Full page reload (a method so tests can stub it). */
  _reload() { try { location.reload(); } catch { /* no location (node) */ } }

  /**
   * F7: mark the level's static geometry for `releaseCpuOnUpload` (core/Assets.js). Skipped (`userData.keepCpu`), see
   * cpuReleaseSkip: GLB template geometry shared with the asset cache (later levels clone / merge it), BatchedMeshes
   * (the camera makes views of their buffers), the camera's occluder / fade meshes (triangle raycasts read uv and
   * normal), small geometry (module caches) and geometry whose `normal` aliases `position` (the uber pass). Returns the
   * attributes marked.
   */
  _releaseCpu(level) {
    const ctx = this.ctx;
    if (!level?.root || ctx.params?.keepCpu) return 0;
    try {
      const shared = sharedGeometries(ctx.assets);
      const occl = occluderMeshes(ctx.cam);
      level.root.traverse((o) => { if (cpuReleaseSkip(o, shared, occl)) o.userData.keepCpu = true; });
      // releaseCpuOnUpload flags each marked attribute needsUpdate itself (already-uploaded arrays drop on re-upload)
      const n = releaseCpuOnUpload(level.root);
      this.cpuReleased = n;
      return n;
    } catch (e) { console.warn('[levels] cpu release skipped', e); return 0; }
  }

  /**
   * PERF §10.3: `PREFETCH.delay` s after `level:loaded`, fetch the next level's p0 into the HTTP cache (Assets caps
   * the parallelism and skips `saveData`). Deferred while an arena is locked (a fight owns the network and the main
   * thread); cancelled by the next load. No-op for the last level and when Assets has no `prefetch`.
   */
  _schedulePrefetch(id, level) {
    const next = nextLevelId(id), assets = this.ctx.assets;
    if (!next || typeof assets?.prefetch !== 'function' || typeof setTimeout !== 'function') return;
    const tick = () => {
      this._prefetchTimer = null;
      if (this.current !== level) return;
      if (level.arenas?.some?.((a) => a.locked)) { this._prefetchTimer = setTimeout(tick, PREFETCH.retry * 1000); return; }
      Promise.resolve(assets.prefetch(next, 'p0')).catch(() => {});
    };
    this._prefetchTimer = setTimeout(tick, PREFETCH.delay * 1000);
  }

  /** Stop a pending next-level prefetch (a new load started). */
  _cancelPrefetch() { if (this._prefetchTimer) { clearTimeout(this._prefetchTimer); this._prefetchTimer = null; } }

  /**
   * PERF §3.3 batched warm-up under the veil: one stand-in of each enemy type the level can spawn (arena waves, open
   * zones, cutscene casts; with the alert "!" sprite), a fog wall and the spawn poofs, all placed around her, plus
   * everything the level hides for now. core `prewarm(renderer, scene, camera, roots)` compiles them in batches (the
   * veil keeps animating) and ends on one real frame; High then compiles its cinematic variants
   * (`postfx.prewarmCinematic`, X2). The old "real frames with culling off" pass is gone (PERF W2). Stand-ins are
   * despawned afterwards, their dressed models kept detached so their programs stay alive.
   */
  async _prewarm(level) {
    const ctx = this.ctx, { scene } = ctx, r = ctx.renderer;
    const warm = [];          // stand-in enemies (despawned at the end)
    const walls = [];         // warm fog walls (removed at the end)
    let cleanup = null;
    const shown = [];         // level objects made visible for the warm-up (hidden again at the end)
    try {
      const types = levelEnemyWarm(level.def, (c) => !!ctx.state?.cond?.(c));
      const pp = ctx.player?.pos ?? level.spawns.start?.pos;
      if (pp && ctx.enemies && types.length) {
        if (typeof ctx.enemies.prewarm === 'function') {
          // contract (requests/world.md): prewarm([{ type, opts }], at) resolves to a cleanup function or to the
          // stand-in enemies (despawned here)
          const res = await ctx.enemies.prewarm(types, pp.clone());
          if (typeof res === 'function') cleanup = res; else for (const e of [].concat(res ?? [])) if (e) warm.push(e);
        } else await this._prewarmEnemies(types, pp, warm);
      }
      // one fog wall per arena shape with the arena's own look (its ground band program depends on the options)
      if (pp && level.arenas?.length && typeof ctx.fx?.mistRing === 'function') {
        const W = ARENA.wall;
        for (const a of level.arenas) {
          try { walls.push(ctx.fx.mistRing(pp.clone(), a.size ?? a.r, { size: a.size, id: '__warm_' + a.id, alpha: W.alpha, width: W.width, bandW: W.bandW, bandA: W.bandA, warm: true })); } catch { /* optional */ }
        }
      }
      if (pp) for (const kind of ['spawn', 'spawnBones']) ctx.bus.emit(E.BURST, { kind, position: pp.clone().setY(pp.y - 2) });
      // everything the level hides for now (distance-culled wheat, far setpieces, prologue-only props) is shown for
      // the warm-up too, else its program is first built when she walks up to it
      level.root.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
      ctx.env?.patchScene?.();
      if (typeof r?.compile === 'function' && typeof r.render === 'function' && ctx.camera) {
        await prewarm(r, scene, ctx.camera, warmRoots(scene, level.root), { batch: PREWARM.batch });
        // every caster's shadow-depth variant (the old culling-off frames did this; one shadow render now)
        ctx.env?.prewarmShadows?.(r, ctx.camera, level.half ?? 60, level.root.position);
        await ctx.postfx?.prewarmCinematic?.(scene, ctx.camera);
      }
    } catch (e) {
      console.warn('[levels] shader warm-up failed', e);
    } finally {
      for (const o of shown) o.visible = false;
      for (const wall of walls) { try { if (typeof wall?.remove === 'function') wall.remove(); else wall?.dispose?.(0); } catch { /* optional */ } }
      for (const e of warm) {
        // keep each stand-in's dressed model (detached, never drawn) for the level's lifetime: its per-instance
        // materials stay alive, so three keeps their programs instead of releasing them when the stand-in goes
        // (a type whose only users were stand-ins, e.g. CS-02's hyenas, would otherwise recompile on first spawn)
        try { if (e.visual) { const v = e.visual; v.removeFromParent(); v.visible = false; e.visual = null; this._warmKeep.push(v); } } catch { /* keep is optional */ }
        try { ctx.enemies?.despawn?.(e); } catch (err) { console.warn('[levels] warm despawn', err); }
      }
      try { cleanup?.(); } catch (err) { console.warn('[levels] warm cleanup', err); }
    }
  }

  /** Fallback warm-up stand-ins through the public spawn API: frozen (ai off), uncapped, visible, alert "!" shown. */
  async _prewarmEnemies(types, pp, out) {   // types: [{ type, opts }]
    const ctx = this.ctx, list = [];
    // bosses start fights (boss:start → the HUD bar) and their arenas; bones: tutorial hint
    types = types.filter(({ type: t }) => !BOSSES?.[t] && !String(t).startsWith('boss_') && !String(t).startsWith('bonehead'));
    types.forEach(({ type: t, opts }, i) => {
      const a = (i / Math.max(1, types.length)) * Math.PI * 2, x = pp.x + Math.sin(a) * 2.5, z = pp.z + Math.cos(a) * 2.5;
      try {
        const e = ctx.enemies.spawn(t, [x, z], { ...opts, ai: false, noCap: true, facing: a + Math.PI, id: `__warm_${t}_${i}` });
        if (e) { e.hurtable = false; e.tags?.add?.('warm'); list.push(e); out.push(e); }
      } catch (err) { console.warn(`[levels] warm spawn ${t} failed`, err); }
    });
    if (!list.length) return;
    // wait (bounded) for the models + dressing; then show the alert "!" for the warm frames
    const t0 = performance.now();
    // ready = dressed: GLB types get their Animator after def.build (beast heads, gear, cage prisoners)
    const ready = (e) => e.disposed || (e.def?.model && !e.def?.procedural ? !!e.anim : !!e.visual);
    while (performance.now() - t0 < PREWARM.loadTimeout && !list.every(ready)) await new Promise((res) => setTimeout(res, 30));
    for (const e of list) {
      e.object3d.visible = true;
      e.bangT = 1;
      try { e.render?.(1, 0); } catch { /* visual not ready */ }
      e.object3d.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    }
  }


  _unload() {
    const ctx = this.ctx;
    if (!this.current) return;
    const old = this.current;
    ctx.bus.emit(E.LEVEL_UNLOAD, { id: old.id });
    this._cancelPrefetch();
    for (const o of this._props) this.despawnProp(o);
    for (const v of this._warmKeep.splice(0)) { try { disposeInstanceMaterials(v); } catch { /* already gone */ } }
    old.dispose?.();
    disposeOwned(old.root);
    for (const t of old.templates ?? []) { t.geometry?.dispose?.(); for (const p of t.parts ?? []) p.geometry?.dispose?.(); }
    ctx.scene.remove(old.root);
    ctx.physics.setLevel(null);
    this.current = null;
  }

  /** Env preset for a level: the first `byFlag` row whose condition holds, else `default`. */
  pickEnv(env) {
    if (!env) return 'meadow_day';
    if (typeof env === 'string') return resolvePreset(env);
    for (const [cond, name] of env.byFlag ?? []) if (this.ctx.state?.cond?.(cond) && ENV_PRESETS[name]) return resolvePreset(name);
    return resolvePreset(env.default ?? 'meadow_day');
  }

  /** Explore track on load: the first `music.byFlag` [cond, track] row that holds (meadow prologue), else `explore`. */
  pickMusic(music) {
    if (!music) return null;
    for (const [cond, track] of music.byFlag ?? []) if (this.ctx.state?.cond?.(cond)) return track;
    return music.explore ?? null;
  }

  /** Level anchor or spawn by name → { pos, facing } (null if unknown). */
  anchor(name) { return this.current?.anchor?.(name) ?? null; }

  /** Nearest arena whose edge is within `maxDist` of `pos`. */
  arenaNear(pos, maxDist = 20) {
    let best = null, bd = Infinity;
    if (!pos) return null;
    for (const a of this.current?.arenas ?? []) {
      const d = a.distanceTo(pos);
      if (d <= maxDist && d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Arena by zone id (story's `arena` steps: `levels.arena('glade').lock()`). */
  arena(id) { return this.current?.arena?.(id) ?? null; }

  /** Hide/show a level group (CloudSea flights): terrain, props, grass, water, skyline, dawnstone, pickups. */
  setVisible(group, on) {
    // CONTROLS_SPEC §4.1: 'far' = sky dome + skyline + horizon + Dawnstone (auto-hidden in iso play); null = automatic
    if (group === 'far') { this.current?.setFar?.(on); return; }
    if (group === 'skyline' && this.current) { this.current._skylineOn = !!on; this.current._farOn = undefined; }
    const g = this.current?.groups?.[group];
    if (g) g.visible = !!on;
    if (group === 'props') for (const t of this.current?.trees ?? []) t.visible = !!on;
    // a caster set changed visibility: the cached sun map (shadow stage 2) re-renders once
    if (group === 'props' || group === 'terrain') this.ctx.env?.staticShadow?.invalidate?.();
  }

  setDawnstone(on) { this.current?.setDawnstone?.(on); }

  /** Light a Vigil Stone now (story: CS-04 lights vigil_3); it becomes the respawn / Continue point. */
  activateVigil(id, { silent = false } = {}) {
    const v = this.current?.vigils?.find((x) => x.id === id);
    if (!v) return false;
    v.activate({ silent });
    return true;
  }

  /** Use an interactable now (story / tests). */
  interact(id) { return this.current?.interact?.(id) ?? false; }

  /** Results payload for the current level (§19.5 level:results). */
  results() {
    const ctx = this.ctx, L = this.current;
    if (!L) return null;
    const st = ctx.state, mine = KITTENS_BY_LEVEL[L.id] ?? [];
    const letterIds = (L.def?.zones ?? []).filter((z) => z.kind === 'letter').map((z) => z.letterId ?? z.id);
    const lost = L.livesLost ?? 0;
    return {
      levelId: L.id, time: Math.max(0, (st?.playtime ?? 0) - (L.run?.runT0 ?? L.startTime ?? 0)),
      kittens: mine.filter((k) => st?.kittens?.includes?.(k)).length, kittensTotal: mine.length,
      letter: letterIds.some((l) => st?.letters?.includes?.(l)),
      fish: Math.max(0, (st?.fish ?? 0) - (L.run?.runFish0 ?? L.fishAtStart ?? 0)), lives: ctx.player?.lives ?? null, livesLost: lost, rank: rankFor(lost),
    };
  }

  /**
   * Exit box reached (§12.1): flag `<level>.done`, best results in state.levels, level:exit + level:results, then
   * the results screen (ui.showResults(payload) → Promise when ui provides it) and the next level.
   */
  async exit(to, spawnId = 'start') {
    const ctx = this.ctx, L = this.current;
    if (!L || L.exiting || this.loading) return;
    L.exiting = true;
    const res = this.results();
    if (ctx.story?.flag) ctx.story.flag(`${L.id}.done`, true); else ctx.state?.setFlag?.(`${L.id}.done`, true);
    const st = ctx.state;
    if (st) {
      st.levels ??= {};
      const prev = st.levels[L.id] ?? {};
      const order = ['mewtiful', 'purrfect', 'pawsome'];
      st.levels[L.id] = { ...prev, cleared: true, bestRank: order.indexOf(res.rank) > order.indexOf(prev.bestRank ?? '') ? res.rank : (prev.bestRank ?? res.rank),
        bestTime: prev.bestTime ? Math.min(prev.bestTime, res.time) : res.time };
      // the run is over; the next level is entered normally, so it starts a fresh run
      endLevelRun(st, L.id);
      if (to) endLevelRun(st, to);
    }
    ctx.bus.emit(E.LEVEL_EXIT, { to, spawnId });
    ctx.bus.emit(E.LEVEL_RESULTS, res);
    try {
      if (typeof ctx.ui?.showResults === 'function') await ctx.ui.showResults(res);
      else await new Promise((r) => setTimeout(r, ctx.params?.test ? 300 : 1500));
    } catch (e) { console.warn('[levels] results screen failed', e); }
    if (to && LEVELS[to]) await this.load(to, spawnId);
  }

  /**
   * A placed cutscene prop built by characters' buildProp (signpost, post_bag, cot, soup_bowl, lantern...).
   * @param {string} name @param {[number, number] | {x:number, z:number}} at
   * @param {{ y?: number, yaw?: number, scale?: number, opts?: object }} [o]
   * @returns {Promise<any>}
   */
  async spawnProp(name, at, o = {}) {
    const L = this.current;
    if (!L) return null;
    try {
      const obj = buildProp(name, o.opts ?? {});
      if (!obj) return null;
      const x = Array.isArray(at) ? at[0] : at.x, z = Array.isArray(at) ? at[at.length - 1] : at.z;
      obj.position.set(x, (o.y ?? 0) + L.heightAt(x, z), z);
      obj.rotation.y = o.yaw ?? 0;
      if (o.scale) obj.scale.setScalar(o.scale);
      obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      L.groups.props.add(obj);
      this._props.add(obj);
      return obj;
    } catch (e) { console.warn(`[levels] spawnProp ${name} failed`, e); return null; }
  }

  despawnProp(obj) {
    if (!obj) return;
    this._props.delete(obj);
    obj.removeFromParent();
    obj.traverse((c) => { if (c.isMesh) { c.geometry?.dispose?.(); } });
  }

  update(dt) { this.current?.update?.(dt); }

  render(alpha, dt) { this.current?.render?.(alpha, dt); }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._unload();
  }
}
