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
import { KITTENS_BY_LEVEL, BOSSES } from '../core/config.js';
import { ENV_PRESETS } from './Env.js';
import { buildProp } from '../characters/index.js';
import { endLevelRun } from './Level.js';
import { disposeInstanceMaterials } from '../enemies/rig.js';

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

/** Shader warm-up tuning: frames rendered under the veil, and the time allowed for the warm models to load. */
export const PREWARM = Object.freeze({ frames: 2, loadTimeout: 6000 });

/** Dispose level-owned GPU resources (never shared GLB template geometry). */
export function disposeOwned(root) {
  root?.traverse((o) => {
    if (!o.userData?.owned) return;
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { for (const v of Object.values(m)) if (v?.isTexture && v.userData?.owned) v.dispose(); m.dispose(); }
  });
}

export class LevelManager {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {import('./Level.js').Level|null} the loaded level */
    this.current = null;
    /** true while a load is in flight (Game skips gameplay systems) */
    this.loading = false;
    this._queue = Promise.resolve();
    this._props = new Set();
    this._offs = [];
    /** @type {any[]} warm-up stand-in models kept (hidden, detached) until the level unloads */
    this._warmKeep = [];
  }

  async init() {}

  /** Load `id` and place the player at `spawnId` (falls back to 'start'). Loads are serialised. */
  load(id, spawnId = 'start') {
    const run = () => this._load(id, spawnId ?? 'start');
    const p = this._queue.then(run, run);
    this._queue = p.catch(() => {});
    return p;
  }

  async _load(id, spawnId) {
    const ctx = this.ctx, { bus, scene } = ctx;
    if (!LEVELS[id]) throw new Error(`[levels] unknown level "${id}"`);
    this.loading = true;
    ctx.ui?.loading?.(true);
    try {
      bus.emit(E.LEVEL_LOADING, { id, spawnId });
      this._unload();
      await ctx.assets.preloadLevel(id);
      const { default: def } = await LEVELS[id]();
      const level = await def.build(ctx);
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
      const track = this.pickMusic(level.music);
      if (track) bus.emit(E.MUSIC, { track, fade: 1.5 });
      return level;
    } finally {
      this.loading = false;
      ctx.ui?.loading?.(false);
    }
  }

  /**
   * Build every shader program the level can need before play: one stand-in of each enemy type it can spawn (arena
   * waves, open zones, cutscene casts; with the alert "!" sprite), a fog wall, and the spawn poofs, all placed around
   * her inside the shadow frustum. Then pre-compile (compileAsync with KHR_parallel_shader_compile) and let
   * PREWARM.frames real frames render under the veil, so the composer's target and the shadow-depth variants are
   * built too. The stand-ins are despawned afterwards. Uses `enemies.prewarm(types, at)` when enemies provide it.
   */
  async _prewarm(level) {
    const ctx = this.ctx, { scene } = ctx, r = ctx.renderer;
    const warm = [];          // stand-in enemies (despawned at the end)
    let wall = null, cleanup = null;
    const shown = [];         // level objects made visible for the warm-up (hidden again at the end)
    const unculled = [];      // objects drawn without frustum culling for the warm frames
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
      if (pp && level.arenas?.length && typeof ctx.fx?.mistRing === 'function') {
        try { wall = ctx.fx.mistRing(pp.clone(), 3, { id: '__warm' }); } catch { wall = null; }
      }
      if (pp) for (const kind of ['spawn', 'spawnBones']) ctx.bus.emit(E.BURST, { kind, position: pp.clone().setY(pp.y - 2) });
      // everything the level hides for now (distance-culled wheat, far setpieces, prologue-only props) is shown for
      // the warm-up too, else its program is first built when she walks up to it
      level.root.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
      ctx.env?.patchScene?.();
      // compile against the target the frame really renders into (the composer's linear half-float target on Med /
      // High: a canvas-target compile builds sRGB + tone-mapped variants nothing ever uses)
      try {
        if (r?.compile) {
          const prev = r.getRenderTarget?.() ?? null, target = ctx.postfx?.composer?.readBuffer ?? null;
          r.setRenderTarget?.(target);
          let pending = null;
          try { pending = r.extensions?.has?.('KHR_parallel_shader_compile') && r.compileAsync ? r.compileAsync(scene, ctx.camera) : (r.compile(scene, ctx.camera), null); }
          finally { r.setRenderTarget?.(prev); }
          if (pending) await pending;
        }
      } catch (e) { console.warn('[levels] shader pre-compile failed', e); }
      // real frames under the veil with culling off, so everything (off-screen setpieces too) is drawn once into the
      // real targets, including the shadow pass (depth variants); skipped headless / when nothing renders
      if (ctx.game?.addFrameHook && ctx.game.loop?.running === true) {
        scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); } });
        await this._frames(PREWARM.frames);
      }
    } catch (e) {
      console.warn('[levels] shader warm-up failed', e);
    } finally {
      for (const o of shown) o.visible = false;
      for (const o of unculled) o.frustumCulled = true;
      try { if (typeof wall?.remove === 'function') wall.remove(); else wall?.dispose?.(0); } catch { /* optional */ }
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

  /** Resolve after `n` rendered frames (bounded by a timeout so a stopped loop cannot hang a load). */
  _frames(n) {
    const game = this.ctx.game;
    return new Promise((resolve) => {
      let left = n, off = null;
      const done = () => { off?.(); clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 1500);
      off = game.addFrameHook(() => { if (--left <= 0) done(); });
    });
  }

  _unload() {
    const ctx = this.ctx;
    if (!this.current) return;
    const old = this.current;
    ctx.bus.emit(E.LEVEL_UNLOAD, { id: old.id });
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
    if (typeof env === 'string') return env;
    for (const [cond, name] of env.byFlag ?? []) if (this.ctx.state?.cond?.(cond) && ENV_PRESETS[name]) return name;
    return env.default ?? 'meadow_day';
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
