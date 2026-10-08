// src/enemies/EnemyManager.js  (owner: enemies) — M0 STUB satisfying the ctx.enemies contract (§19.3):
//   spawn(type, pos, opts) → Enemy;  spawnWave(list, points);  despawn(e);  list;  boss
// Types: Appendix A ENEMIES keys ('rat_pike', 'hyena', ...), 'bonehead:<variant>', 'jelly' / 'jelly_l|m|s',
// and bosses 'boss_<key>' (BOSSES + core BOSS_MODELS). Unknown types spawn a generic grunt with a warning.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { ENEMIES, BOSSES, BOSS_MODELS, MODEL_FIT } from '../core/config.js';
import { Enemy } from './Enemy.js';
import { Boss } from './Boss.js';

const DEFAULT_BOSS_ATTACK = [{ id: 'pug_chop', weight: 1, range: 2.2 }];

/** Resolve a spawn type to a def (pure; exported for tests). */
export function resolveEnemyDef(type) {
  if (ENEMIES[type]) return { ...ENEMIES[type], id: type };
  if (type.startsWith('bonehead:')) {
    const v = type.split(':')[1], base = ENEMIES.bonehead, variant = base.variants[v] ?? base.variants.minion;
    return { ...base, ...variant, id: type, variant: v, attacks: [{ id: variant.attack, weight: 1, range: 1.7 }] };
  }
  if (type.startsWith('jelly')) {
    const size = (type.split('_')[1] ?? 'l').toUpperCase(), base = ENEMIES.jelly, s = base.sizes[size] ?? base.sizes.L;
    return { ...base, id: type, size, hp: s.hp, radius: s.r, height: s.h, mass: 0.6, fish: [s.fish, s.fish] };
  }
  if (type.startsWith('boss_')) {
    const key = type.slice(5), b = BOSSES[key], m = BOSS_MODELS[key];
    if (b) {
      const h = m ? (MODEL_FIT[m.model]?.uses?.[m.role] ?? b.fit?.h ?? 2) : (b.fit?.h ?? 2);
      return { radius: Math.max(0.5, h * 0.22), height: h, mass: 4, sight: 30, leash: 60, run: 3.5, attacks: DEFAULT_BOSS_ATTACK,
        ...b, hp: Array.isArray(b.hp) ? b.hp[0] : b.hp, model: m?.model, role: m?.role, fit: m?.role, id: type, key, boss: true };
    }
  }
  return { id: type, hp: 30, radius: 0.35, height: 1, mass: 1, poise: 1, sight: 10, leash: 18, run: 3, attacks: [{ id: 'rat_poke', weight: 1, range: 1.8 }], unknown: true };
}

export class EnemyManager {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Enemy[]} */
    this.list = [];
    /** @type {Boss|null} */
    this.boss = null;
    this._offs = [];
  }

  async init() {
    this._offs.push(this.ctx.bus.on(E.LEVEL_UNLOAD, () => this.clear()));
  }

  /**
   * @param {string} type @param {THREE.Vector3} pos
   * @param {{facing?: number, id?: string, runner?: boolean, y?: number, scripted?: boolean}} [opts]
   */
  spawn(type, pos, opts = {}) {
    const def = resolveEnemyDef(type);
    if (def.unknown) console.warn(`[enemies] unknown type "${type}" (generic stand-in)`);
    const Cls = def.boss ? Boss : Enemy;
    const p = new THREE.Vector3().copy(pos ?? new THREE.Vector3());
    if (opts.y) p.y += opts.y;
    const e = new Cls(this.ctx, def, { pos: p, facing: opts.facing ?? 0, runner: opts.runner });
    this.list.push(e);
    this.ctx.actors.register(e, opts.id);
    this.ctx.scene.add(e.object3d);
    e.snap();
    if (opts.scripted) e.setScripted(true);
    if (def.boss) { this.boss = /** @type {Boss} */ (e); e.start(); }
    e.loadVisual();
    this.ctx.bus.emit(E.ENEMY_SPAWNED, { enemy: e });
    return e;
  }

  /** list: [[type, count, ...], ...]; points: Vector3[] used round-robin. Returns the spawned enemies. */
  spawnWave(list, points = []) {
    const out = [];
    let i = 0;
    for (const [type, n = 1] of list) for (let k = 0; k < n; k++) {
      const pt = points.length ? points[i++ % points.length] : this.ctx.player?.pos ?? new THREE.Vector3();
      out.push(this.spawn(type, pt));
    }
    return out;
  }

  despawn(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (this.boss === e) this.boss = null;
    this.ctx.combat?.tokens?.release(e);
    this.ctx.actors.unregister(e);
    e.dispose();
  }

  clear() { for (const e of [...this.list]) this.despawn(e); }

  update(dt) {
    const g = this.ctx.game;
    for (const e of [...this.list]) if (g.simActive(e)) e.update(dt);
  }

  render(alpha, dt) { for (const e of this.list) e.render(alpha, dt); }

  dispose() { this.clear(); for (const off of this._offs) off(); this._offs.length = 0; }
}
