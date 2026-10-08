// src/world/LevelManager.js  (owner: world) — the ctx.levels system (§19.3, tech.md §12.1):
//   load(id, spawnId)  (serialised; preloads the level's manifest subset, builds it with LevelKit, hands it to physics,
//                       applies its env preset, places the player, pre-compiles shaders, emits level:loaded)
//   current            the runtime Level (LevelData + id, def, spawnId), or null
//   loading            true while a load is in flight (Game skips gameplay systems)
//   anchor(name)       → { pos, facing } (level anchors, then spawns)
//   arenaNear(pos, maxDist = 20) → Arena (lock(), clear())
//   setVisible(group, on)  'terrain' | 'props' | 'grass' (CloudSea flights) + 'water' | 'skyline' | 'dawnstone' | 'pickups'
// Additive (world): arena(id), exit(to, spawnId) (exit box: flag <level>.done, level:exit, level:results, then the
// next level), results(), interact(id), spawnProp(name, at, opts) / despawnProp(obj) (story's placed props: signpost,
// post bag, cot...), setDawnstone(on). Level triggers / interacts / arenas run inside Level.update (play mode only).
import { E } from '../core/events.js';
import { KITTENS_BY_LEVEL } from '../core/config.js';
import { ENV_PRESETS } from './Env.js';
import { buildProp } from '../characters/index.js';

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
      // height-fog patch + pre-compile shaders (no hitch on first view); compileAsync only with KHR_parallel_shader_compile
      ctx.env?.patchScene?.();
      try {
        const r = ctx.renderer;
        if (r?.extensions?.has?.('KHR_parallel_shader_compile')) await r.compileAsync(scene, ctx.camera); else r?.compile?.(scene, ctx.camera);
      } catch (e) { console.warn('[levels] shader pre-compile failed', e); }
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

  _unload() {
    const ctx = this.ctx;
    if (!this.current) return;
    const old = this.current;
    ctx.bus.emit(E.LEVEL_UNLOAD, { id: old.id });
    for (const o of this._props) this.despawnProp(o);
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
    const g = this.current?.groups?.[group];
    if (g) g.visible = !!on;
    if (group === 'props') for (const t of this.current?.trees ?? []) t.visible = !!on;
  }

  setDawnstone(on) { this.current?.setDawnstone?.(on); }

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
      levelId: L.id, time: Math.max(0, (ctx.game?.time ?? 0) - (L.startTime ?? 0)),
      kittens: mine.filter((k) => st?.kittens?.includes?.(k)).length, kittensTotal: mine.length,
      letter: letterIds.some((l) => st?.letters?.includes?.(l)),
      fish: Math.max(0, (st?.fish ?? 0) - (L.fishAtStart ?? 0)), lives: ctx.player?.lives ?? null, livesLost: lost, rank: rankFor(lost),
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
