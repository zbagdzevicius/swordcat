// src/world/LevelManager.js  (owner: world) — M0 STUB satisfying the ctx.levels contract (§19.3, tech.md §12.1):
//   load(id, spawnId) (serialised; preloads the level's manifest subset);  current;  loading;
//   anchor(name) → {pos, facing};  arenaNear(pos, maxDist = 20) → Arena (lock(), clear());
//   setVisible('terrain' | 'props' | 'grass', on)
// Arena trigger discs (r − 2) lock automatically when the player walks in.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { ENV_PRESETS } from './Env.js';

/** Dynamic import per level = Vite code-splits each level (§19.1 A1 ids). */
export const LEVELS = {
  meadow: () => import('./levels/meadow.js'),
  forest: () => import('./levels/forest.js'),
  town: () => import('./levels/town.js'),
  gate: () => import('./levels/gate.js'),
  bog: () => import('./levels/bog.js'),
  keep: () => import('./levels/keep.js'),
};

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
    /** LevelData + { id, def, spawnId } of the loaded level, or null */
    this.current = null;
    /** true while a load is in flight (Game skips gameplay systems) */
    this.loading = false;
    this._queue = Promise.resolve();
  }

  async init() {}

  /** Load `id` and place the player at `spawnId` (falls back to 'start'). Loads are serialised. */
  load(id, spawnId = 'start') {
    const run = () => this._load(id, spawnId);
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
      if (this.current) {
        const old = this.current;
        bus.emit(E.LEVEL_UNLOAD, { id: old.id });
        old.dispose?.();
        disposeOwned(old.root);
        scene.remove(old.root);
        ctx.physics.setLevel(null);
        this.current = null;
      }
      await ctx.assets.preloadLevel(id);
      const { default: def } = await LEVELS[id]();
      const level = await def.build(ctx);
      scene.add(level.root);
      ctx.physics.setLevel(level);
      ctx.env?.preset?.(this.pickEnv(level.env), 0);
      this.current = { ...level, id, def, spawnId };
      ctx.state.levelId = id; ctx.state.spawnId = spawnId;
      const sp = level.spawns[spawnId] ?? level.spawns.start;
      if (!level.spawns[spawnId]) console.warn(`[levels] ${id}: no spawn "${spawnId}", using start`);
      ctx.player?.teleport({ pos: sp.pos.clone(), facing: sp.facing });
      // pre-compile shaders (no hitch on first view); compileAsync only where KHR_parallel_shader_compile exists
      try {
        const r = ctx.renderer;
        if (r.extensions?.has?.('KHR_parallel_shader_compile')) await r.compileAsync(scene, ctx.camera); else r.compile(scene, ctx.camera);
      } catch (e) { console.warn('[levels] shader pre-compile failed', e); }
      this.loading = false;
      bus.emit(E.LEVEL_LOADED, { id, level: this.current, spawnId });
      if (level.music?.explore) bus.emit(E.MUSIC, { track: level.music.explore, fade: 1.5 });
      return this.current;
    } finally {
      this.loading = false;
      ctx.ui?.loading?.(false);
    }
  }

  /** Env preset for a level: the first `byFlag` row whose condition holds, else `default`. */
  pickEnv(env) {
    if (!env) return 'meadow_day';
    if (typeof env === 'string') return env;
    for (const [cond, name] of env.byFlag ?? []) if (this.ctx.state.cond(cond) && ENV_PRESETS[name]) return name;
    return env.default ?? 'meadow_day';
  }

  /** Level anchor or spawn by name → { pos, facing } (null if unknown). */
  anchor(name) {
    const c = this.current;
    if (!c) return null;
    return c.anchors?.[name] ?? c.spawns?.[name] ?? null;
  }

  /** Nearest arena whose edge is within `maxDist` of `pos`. */
  arenaNear(pos, maxDist = 20) {
    let best = null, bd = Infinity;
    for (const a of this.current?.arenas ?? []) {
      const d = Math.max(0, Math.hypot(pos.x - a.center.x, pos.z - a.center.z) - a.r);
      if (d <= maxDist && d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Hide/show a level group (CloudSea flights). */
  setVisible(group, on) { const g = this.current?.groups?.[group]; if (g) g.visible = !!on; }

  update(dt) {
    const c = this.current;
    if (!c) return;
    const p = this.ctx.player;
    if (p?.alive) for (const a of c.arenas ?? []) if (!a.locked && !a.cleared && a.contains(p.pos, 2)) a.lock();
    c.update?.(dt);
  }

  render(alpha, dt) { this.current?.render?.(alpha, dt); }

  dispose() {
    if (this.current) { this.current.dispose?.(); disposeOwned(this.current.root); this.ctx.scene.remove(this.current.root); this.current = null; }
  }
}
