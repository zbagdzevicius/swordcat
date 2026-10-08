// src/world/Arena.js  (owner: world) — the §12.1 arena template, returned by ctx.levels.arenaNear(pos) / arena(id):
//  1. Enter: the trigger disc (r − 2; rectangles: inset 2 m) locks it → arena:lock, a fog wall (fx.mistRing + a ring
//     of collider circles; edges over deep water get only the mist) and the player is kept inside.
//  2. Combat music (boss music for boss arenas).
//  3. Waves: the next wave starts 1.5 s after alive ≤ 1, at the 3 of 6 ring points (r − 1.5) farthest from the
//     player, with a spawn poof; arena:wave {id, wave, total}.
//  4. Ring points over deep water, outside the bounds or inside static colliders are skipped.
//  5. Clear: arena:clear, the wall dissolves, explore music returns 4 s after the last kill.
//  6. Death inside resets it to wave 1 (reset()).
//  7. Rectangular arenas (`size: [w, d]`): corners + long-side midpoints, edges as walls.
import * as THREE from 'three';
import { E } from '../core/events.js';

const WAVE_DELAY = 1.5, EXPLORE_AFTER = 4;
const _v = new THREE.Vector3();

export class Arena {
  /**
   * @param {any} ctx
   * @param {{id:string, at:[number,number], r?:number, size?:[number,number], boss?:string, waves?:any[], lockOn?:string, autoLock?:boolean}} zone
   * @param {(x:number,z:number)=>number} [heightAt]
   * @param {any} [level] LevelData under construction (colliders, isDeepWater, bounds, music)
   */
  constructor(ctx, zone, heightAt = () => 0, level = null) {
    this.ctx = ctx;
    this.zone = zone;
    this.id = zone.id;
    this.heightAt = heightAt;
    this.level = level;
    this.center = new THREE.Vector3(zone.at[0], heightAt(zone.at[0], zone.at[1]), zone.at[1]);
    this.size = zone.size ?? null;
    this.r = zone.r ?? (zone.size ? Math.max(zone.size[0], zone.size[1]) / 2 : 12);
    this.boss = zone.boss ?? null;
    this.waves = zone.waves ?? [];
    this.autoLock = zone.autoLock ?? !zone.lockOn;
    this.wave = 0; this.locked = false; this.cleared = false;
    /** @type {any[]} */
    this.enemies = [];
    this._waitT = 0; this._exploreT = -1;
    this.wall = null; this._wallColliders = [];
    /** callbacks fired once on clear */
    this.onClear = [];
  }

  /** Inside the arena (disc, or rectangle) shrunk by `inset`. */
  contains(pos, inset = 0) {
    const dx = pos.x - this.center.x, dz = pos.z - this.center.z;
    if (this.size) return Math.abs(dx) <= this.size[0] / 2 - inset && Math.abs(dz) <= this.size[1] / 2 - inset;
    return Math.hypot(dx, dz) <= this.r - inset;
  }

  /** Distance from `pos` to the arena edge (0 inside). */
  distanceTo(pos) {
    const dx = pos.x - this.center.x, dz = pos.z - this.center.z;
    if (this.size) { const ex = Math.max(0, Math.abs(dx) - this.size[0] / 2), ez = Math.max(0, Math.abs(dz) - this.size[1] / 2); return Math.hypot(ex, ez); }
    return Math.max(0, Math.hypot(dx, dz) - this.r);
  }

  /** The 6 template ring points (world), in order. */
  ringPoints() {
    const c = this.center, out = [];
    if (this.size) {
      const hw = this.size[0] / 2 - 1.5, hd = this.size[1] / 2 - 1.5, longX = this.size[0] >= this.size[1];
      const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], longX ? [0, -hd] : [-hw, 0], longX ? [0, hd] : [hw, 0]];
      for (const [x, z] of pts) out.push(new THREE.Vector3(c.x + x, this.heightAt(c.x + x, c.z + z), c.z + z));
    } else {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, x = c.x + Math.sin(a) * (this.r - 1.5), z = c.z + Math.cos(a) * (this.r - 1.5);
        out.push(new THREE.Vector3(x, this.heightAt(x, z), z));
      }
    }
    return out;
  }

  /** §12.1 rule 4: skip points over deep water, outside the bounds or inside a static collider. */
  validPoint(p) {
    const L = this.level;
    if (L?.isDeepWater?.(p.x, p.z)) return false;
    const b = L?.bounds;
    if (b && (p.x < b.min.x + 1 || p.x > b.max.x - 1 || p.z < b.min.y + 1 || p.z > b.max.y - 1)) return false;
    for (const c of L?.colliders?.circles ?? []) if (!c.arenaWall && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.5) return false;
    for (const q of L?.colliders?.boxes ?? []) if (p.x > q.minX - 0.5 && p.x < q.maxX + 0.5 && p.z > q.minZ - 0.5 && p.z < q.maxZ + 0.5) return false;
    return true;
  }

  /** The 3 valid ring points farthest from the player (fewer if the ring is mostly water). */
  spawnPoints(n = 3) {
    const pp = this.ctx.player?.pos ?? this.center;
    const pts = this.ringPoints().filter((p) => this.validPoint(p));
    if (!pts.length) return [this.center.clone()];
    pts.sort((a, b) => Math.hypot(b.x - pp.x, b.z - pp.z) - Math.hypot(a.x - pp.x, a.z - pp.z));
    return pts.slice(0, n);
  }

  /** Start the fight: fog wall, music, boss at the centre or wave 1. Idempotent. */
  lock() {
    if (this.locked || this.cleared) return this;
    this.locked = true; this._exploreT = -1;
    this.ctx.bus.emit(E.ARENA_LOCK, { id: this.id });
    this._raiseWall();
    const music = this.level?.music ?? {};
    const track = this.boss ? (music.boss ?? music.combat) : music.combat;
    if (track) this.ctx.bus.emit(E.MUSIC, { track, fade: this.boss ? 0.3 : 1.0 });
    if (this.boss) {
      const p = this.ctx.player?.pos;
      const facing = p ? Math.atan2(p.x - this.center.x, p.z - this.center.z) : 0;
      const e = this.ctx.enemies?.spawn?.(this.boss, this.center, { facing });
      if (e) this.enemies.push(e);
    } else this._nextWave();
    return this;
  }

  _nextWave() {
    const list = this.waves[this.wave];
    if (!list) return this.clear();
    this.wave++;
    const pts = this.spawnPoints(3);
    let k = 0;
    for (const [type, n = 1, extra] of list) for (let i = 0; i < n; i++) {
      const base = pts[k++ % pts.length];
      const j = (k / pts.length) | 0, a = k * 2.399;
      _v.set(base.x + Math.sin(a) * 0.9 * j, 0, base.z + Math.cos(a) * 0.9 * j);
      _v.y = this.heightAt(_v.x, _v.z);
      const facing = Math.atan2(this.center.x - _v.x, this.center.z - _v.z);
      const e = this.ctx.enemies?.spawn?.(type, _v.clone(), { facing, ...(extra ?? {}) });
      if (e) this.enemies.push(e);
      this.ctx.bus.emit(E.BURST, { kind: type.startsWith('bonehead') ? 'spawnBones' : 'spawn', position: _v.clone() });
    }
    this.ctx.bus.emit(E.ARENA_WAVE, { id: this.id, wave: this.wave, total: this.waves.length });
  }

  clear() {
    if (this.cleared) return this;
    this.cleared = true; this.locked = false;
    this._dropWall();
    this.ctx.bus.emit(E.ARENA_CLEAR, { id: this.id });
    this._exploreT = EXPLORE_AFTER;
    for (const fn of this.onClear.splice(0)) { try { fn(this); } catch (e) { console.error('[arena] onClear', e); } }
    return this;
  }

  /** §12.1 rule 6: death inside → back to wave 1 (enemies despawned, wall down; re-entering locks again). */
  reset() {
    if (this.cleared || (!this.locked && this.wave === 0)) return;
    for (const e of this.enemies) if (this.ctx.enemies?.list?.includes(e)) this.ctx.enemies.despawn(e);
    this.enemies.length = 0;
    this.wave = 0; this.locked = false; this._waitT = 0;
    this._dropWall();
    const explore = this.level?.music?.explore;
    if (explore) this.ctx.bus.emit(E.MUSIC, { track: explore, fade: 1.5 });
  }

  aliveCount() {
    const list = this.ctx.enemies?.list ?? [];
    let n = 0;
    for (const e of this.enemies) if (e.alive && list.includes(e)) n++;
    return n;
  }

  update(dt) {
    if (this._exploreT > 0 && (this._exploreT -= dt) <= 0) {
      const explore = this.level?.music?.explore;
      if (explore) this.ctx.bus.emit(E.MUSIC, { track: explore, fade: 1.5 });
    }
    if (!this.locked || this.cleared) return;
    this._keepInside();
    const alive = this.aliveCount();
    if (this.boss) { if (alive === 0 && this.enemies.length) this.clear(); return; }
    if (alive <= 1) {
      this._waitT += dt;
      if (this._waitT >= WAVE_DELAY) {
        if (this.wave < this.waves.length) { this._waitT = 0; this._nextWave(); }
        else if (alive === 0) this.clear();
      }
    } else this._waitT = 0;
  }

  /** While locked the player (and the arena's enemies) stay inside the wall. */
  _keepInside() {
    const keep = (a, inset) => {
      if (!a?.pos) return;
      const dx = a.pos.x - this.center.x, dz = a.pos.z - this.center.z;
      if (this.size) {
        const hw = this.size[0] / 2 - inset, hd = this.size[1] / 2 - inset;
        if (dx < -hw) a.pos.x = this.center.x - hw; else if (dx > hw) a.pos.x = this.center.x + hw;
        if (dz < -hd) a.pos.z = this.center.z - hd; else if (dz > hd) a.pos.z = this.center.z + hd;
      } else {
        const d = Math.hypot(dx, dz), max = this.r - inset;
        if (d > max && d > 1e-4) { a.pos.x = this.center.x + dx / d * max; a.pos.z = this.center.z + dz / d * max; const vn = (a.vel.x * dx + a.vel.z * dz) / d; if (vn > 0) { a.vel.x -= dx / d * vn; a.vel.z -= dz / d * vn; } }
      }
    };
    const p = this.ctx.player;
    if (p?.alive) keep(p, 0.6);
    for (const e of this.enemies) if (e.alive && !e.tags?.has('flyer')) keep(e, 0.6);
  }

  _raiseWall() {
    const fx = this.ctx.fx;
    try { this.wall = fx?.mistRing?.(this.center.clone(), this.r, { size: this.size, id: this.id }) ?? null; } catch (e) { console.warn('[arena] mistRing', e); this.wall = null; }
    const L = this.level;
    if (!L?.colliders) return;
    const add = (x, z) => {
      if (L.isDeepWater?.(x, z)) return;
      const c = { x, z, r: 0.55, y0: this.heightAt(x, z) - 2, y1: this.heightAt(x, z) + 6, arenaWall: this.id };
      L.colliders.circles.push(c); this._wallColliders.push(c);
    };
    if (this.size) {
      const hw = this.size[0] / 2 + 0.4, hd = this.size[1] / 2 + 0.4, c = this.center;
      for (let x = -hw; x <= hw + 1e-3; x += 1.0) { add(c.x + x, c.z - hd); add(c.x + x, c.z + hd); }
      for (let z = -hd + 1; z <= hd - 1 + 1e-3; z += 1.0) { add(c.x - hw, c.z + z); add(c.x + hw, c.z + z); }
    } else {
      const R = this.r + 0.4, n = Math.ceil((Math.PI * 2 * R) / 1.0);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; add(this.center.x + Math.sin(a) * R, this.center.z + Math.cos(a) * R); }
    }
    refreshColliders(this.ctx, L);
  }

  _dropWall() {
    try { this.wall?.dispose?.(); } catch (e) { console.warn('[arena] wall dispose', e); }
    this.wall = null;
    const L = this.level;
    if (L?.colliders && this._wallColliders.length) {
      const set = new Set(this._wallColliders);
      const keep = L.colliders.circles.filter((c) => !set.has(c));
      L.colliders.circles.length = 0; L.colliders.circles.push(...keep);
      this._wallColliders.length = 0;
      refreshColliders(this.ctx, L);
    }
  }

  dispose() { this._dropWall(); this.enemies.length = 0; this.onClear.length = 0; }
}

/** Tell physics that level colliders changed (dynamic walls, gates). Defensive across physics versions. */
export function refreshColliders(ctx, level) {
  const ph = ctx.physics;
  if (!ph || ph.level !== level) return;
  if (typeof ph.refreshColliders === 'function') ph.refreshColliders();
  else ph.statics?.set?.(level.colliders);
}
