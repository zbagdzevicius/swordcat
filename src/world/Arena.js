// src/world/Arena.js  (owner: world) — the §12.1 arena template, returned by ctx.levels.arenaNear(pos) / arena(id):
//  1. Enter: the trigger disc (r − 2; rectangles: inset 2 m) locks it → arena:lock, a fog wall (fx.mistRing cards
//     every 1.5 m + a physics ring collider; rectangles: 4 edge walls, edges over deep water get only the cards).
//  2. Combat music (boss music for boss arenas).
//  3. Waves: the next wave starts 1.5 s after alive ≤ 1, at the 3 of 6 ring points (r − 1.5) farthest from the
//     player, with the spawn poof (Boneheads: spawnBones); arena:wave {id, wave, total}.
//  4. Ring points over deep water, outside the bounds or inside static colliders are skipped.
//  5. Clear: arena:clear, the wall dissolves, jingles/jingles_STEEL00, explore music returns 4 s after the last kill.
//  6. Death inside resets it to wave 1 (reset()); a boss arena keeps its boss (enemies reset the phase) and drops
//     the wall so the retry walks back in.
//  7. Rectangular arenas (`size: [w, d]`): corners + long-side midpoints, four edge walls.
// Zone options: `lockOn: '<cutsceneId>:end'` (no auto-lock; locks when that cutscene ends, e.g. the glade after CS-03),
// `autoLockWhen` (cond string / fn: auto-lock re-arms on reloads, e.g. meadow.pudding === 'netted'), `boss` (enemy
// type spawned at the centre), `waves: [[[type, n, opts?], ...], ...]`.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { condOk } from './Level.js';

export const ARENA = Object.freeze({ waveDelay: 1.5, exploreAfter: 4, ringInset: 1.5, triggerInset: 2, wallPad: 0.4, clearJingle: 'jingles/jingles_STEEL00' });
const _v = new THREE.Vector3();

/** The 6 template spawn points of an arena zone (pure; unit-tested). Returns [[x, z], ...]. */
export function arenaRingPoints(zone) {
  const [cx, cz] = zone.at, out = [];
  if (zone.size) {
    const hw = zone.size[0] / 2 - ARENA.ringInset, hd = zone.size[1] / 2 - ARENA.ringInset, longX = zone.size[0] >= zone.size[1];
    for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], longX ? [0, -hd] : [-hw, 0], longX ? [0, hd] : [hw, 0]]) out.push([cx + x, cz + z]);
  } else {
    const r = (zone.r ?? 12) - ARENA.ringInset;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]); }
  }
  return out;
}

export class Arena {
  /**
   * @param {any} ctx
   * @param {{id:string, at:[number,number], r?:number, size?:[number,number], boss?:string, waves?:any[], lockOn?:string, autoLockWhen?:any}} zone
   * @param {(x:number,z:number)=>number} [heightAt]
   * @param {any} [level] the Level (colliders, isDeepWater, bounds, music)
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
    this.lockOn = zone.lockOn ?? null;
    this.wave = 0; this.locked = false; this.cleared = false;
    /** @type {any[]} */
    this.enemies = [];
    this._waitT = 0; this._exploreT = -1;
    this.wall = null; this._wallColliders = [];
    /** callbacks fired once on clear */
    this.onClear = [];
    this._offs = [];
    if (this.lockOn) {
      const [csId, when = 'end'] = String(this.lockOn).split(':');
      const ev = when === 'start' ? E.CUTSCENE_START : E.CUTSCENE_END;
      this._offs.push(ctx.bus.on(ev, (p) => { if (p?.id === csId && !this.cleared) this.lock(); }));
    }
  }

  /** May the trigger disc lock it on entry? (lockOn arenas only via their cutscene or `autoLockWhen`.) */
  canAutoLock() {
    if (this.zone.autoLock === false) return false;
    if (this.zone.autoLockWhen != null) return condOk(this.ctx, this.zone.autoLockWhen);
    return !this.lockOn;
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
    return arenaRingPoints({ at: [this.center.x, this.center.z], r: this.r, size: this.size })
      .map(([x, z]) => new THREE.Vector3(x, this.heightAt(x, z), z));
  }

  /** §12.1 rule 4: skip points over deep water, outside the bounds or inside a static collider. */
  validPoint(p) {
    const L = this.level, ph = this.ctx.physics;
    if (L?.isDeepWater?.(p.x, p.z)) return false;
    const b = L?.bounds;
    if (b && (p.x < b.min.x + 1 || p.x > b.max.x - 1 || p.z < b.min.y + 1 || p.z > b.max.y - 1)) return false;
    if (ph?.level === L && typeof ph.blockedAt === 'function') {
      const hit = ph.blockedAt(p.x, p.z, 0.5, p.y + 0.1, p.y + 1.0);
      if (hit && !hit.arenaWall) return false;
      return true;
    }
    for (const c of L?.colliders?.circles ?? []) if (!c.arenaWall && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.5) return false;
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

  /** Start the fight: fog wall, music, boss at the centre or wave 1. Idempotent. Pulls her inside if needed. */
  lock() {
    if (this.locked || this.cleared) return this;
    this.locked = true; this._exploreT = -1; this._waitT = 0;
    const p = this.ctx.player;
    if (p?.alive !== false && p?.pos && !this.contains(p.pos, 0.8)) this._pullInside(p);
    this.ctx.bus.emit(E.ARENA_LOCK, { id: this.id });
    this._raiseWall();
    const music = this.level?.music ?? {};
    const track = this.boss ? (music.boss ?? music.combat) : music.combat;
    if (track) this.ctx.bus.emit(E.MUSIC, { track, fade: this.boss ? 0.3 : 1.0 });
    if (this.boss) {
      const alive = this.enemies.find((e) => e.alive && this.ctx.enemies?.list?.includes(e));
      if (!alive) {
        const facing = p?.pos ? Math.atan2(p.pos.x - this.center.x, p.pos.z - this.center.z) : 0;
        const e = this.ctx.enemies?.spawn?.(this.boss, this.center.clone(), { facing, arena: this.id });
        if (e) this.enemies.push(e);
      }
    } else if (this.wave === 0) this._nextWave();
    return this;
  }

  /** Move the player just inside the edge nearest to her (forced locks: startBoss, cutscene locks). */
  _pullInside(p) {
    const dx = p.pos.x - this.center.x, dz = p.pos.z - this.center.z, d = Math.hypot(dx, dz) || 1;
    let x, z;
    if (this.size) {
      x = this.center.x + Math.max(-this.size[0] / 2 + 2, Math.min(this.size[0] / 2 - 2, dx));
      z = this.center.z + Math.max(-this.size[1] / 2 + 2, Math.min(this.size[1] / 2 - 2, dz));
    } else {
      const r = Math.max(1, this.r - 2.5);
      x = this.center.x + (dx / d) * r; z = this.center.z + (dz / d) * r;
    }
    const pos = _v.set(x, this.heightAt(x, z), z).clone();
    const facing = Math.atan2(this.center.x - x, this.center.z - z);
    if (typeof p.teleport === 'function') p.teleport({ pos, facing }); else { p.pos.copy(pos); p.facing = facing; }
  }

  _nextWave() {
    const list = this.waves[this.wave];
    if (!list) return this.clear();
    this.wave++;
    const pts = this.spawnPoints(3);
    let k = 0;
    for (const [type, n = 1, extra] of list) for (let i = 0; i < n; i++) {
      const base = pts[k % pts.length];
      const ring = Math.floor(k / pts.length), a = k * 2.399;
      k++;
      _v.set(base.x + Math.sin(a) * 1.1 * ring, 0, base.z + Math.cos(a) * 1.1 * ring);
      _v.y = this.heightAt(_v.x, _v.z);
      const facing = Math.atan2(this.center.x - _v.x, this.center.z - _v.z);
      const e = this.ctx.enemies?.spawn?.(type, _v.clone(), { facing, arena: this.id, ...(extra ?? {}) });
      if (e) this.enemies.push(e);
      this.ctx.bus.emit(E.BURST, { kind: String(type).startsWith('bonehead') ? 'spawnBones' : 'spawn', position: _v.clone() });
    }
    this.ctx.bus.emit(E.ARENA_WAVE, { id: this.id, wave: this.wave, total: this.waves.length });
  }

  clear() {
    if (this.cleared) return this;
    this.cleared = true; this.locked = false;
    this._dropWall();
    this.ctx.bus.emit(E.ARENA_CLEAR, { id: this.id });
    this.ctx.audio?.play2D?.(ARENA.clearJingle, { vol: 0.8 });
    this._exploreT = ARENA.exploreAfter;
    for (const fn of this.onClear.splice(0)) { try { fn(this); } catch (e) { console.error('[arena] onClear', e); } }
    return this;
  }

  /** §12.1 rule 6: death inside → back to wave 1 (enemies despawned, wall down; re-entering locks again). */
  reset() {
    if (this.cleared || (!this.locked && this.wave === 0)) return;
    if (this.boss) {
      this.enemies = this.enemies.filter((e) => e.alive && this.ctx.enemies?.list?.includes(e));
    } else {
      for (const e of this.enemies) if (this.ctx.enemies?.list?.includes(e)) this.ctx.enemies.despawn(e);
      this.enemies.length = 0;
      this.wave = 0;
    }
    this.locked = false; this._waitT = 0;
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
      if (this._waitT >= ARENA.waveDelay) {
        if (this.wave < this.waves.length) { this._waitT = 0; this._nextWave(); }
        else if (alive === 0) this.clear();
      }
    } else this._waitT = 0;
  }

  /** Safety net behind the physics wall: while locked she (and the arena's walkers) stay inside. */
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
        if (d > max && d > 1e-4) {
          a.pos.x = this.center.x + dx / d * max; a.pos.z = this.center.z + dz / d * max;
          const vn = a.vel ? (a.vel.x * dx + a.vel.z * dz) / d : 0;
          if (vn > 0) { a.vel.x -= dx / d * vn; a.vel.z -= dz / d * vn; }
        }
      }
    };
    const p = this.ctx.player;
    if (p?.alive) keep(p, -0.2);
    for (const e of this.enemies) if (e.alive && !e.tags?.has('flyer')) keep(e, -0.2);
  }

  _raiseWall() {
    const fx = this.ctx.fx;
    try { this.wall = fx?.mistRing?.(this.center.clone(), this.size ?? this.r, { size: this.size, id: this.id }) ?? null; } catch (e) { console.warn('[arena] mistRing', e); this.wall = null; }
    const L = this.level;
    if (!L) return;
    const add = (c) => { c.arenaWall = this.id; this._wallColliders.push(c); if (typeof L.addCollider === 'function') L.addCollider(c); };
    const y0 = this.center.y - 3, y1 = this.center.y + 8;
    if (this.size) {
      const hw = this.size[0] / 2 + ARENA.wallPad, hd = this.size[1] / 2 + ARENA.wallPad, c = this.center;
      const edges = [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]];
      for (const [ax, az, bx, bz] of edges) {
        const mx = c.x + (ax + bx) / 2, mz = c.z + (az + bz) / 2;
        if (L.isDeepWater?.(mx, mz)) continue;
        add({ ax: c.x + ax, az: c.z + az, bx: c.x + bx, bz: c.z + bz, r: 0.15, y0, y1, walkable: false });
      }
    } else {
      add({ x: this.center.x, z: this.center.z, r: this.r + ARENA.wallPad, kind: 'ring', thickness: 0.3, y0, y1 });
    }
  }

  _dropWall() {
    try { this.wall?.dispose?.(); } catch (e) { console.warn('[arena] wall dispose', e); }
    this.wall = null;
    const L = this.level;
    for (const c of this._wallColliders) L?.removeCollider?.(c);
    this._wallColliders.length = 0;
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._dropWall();
    this.enemies.length = 0; this.onClear.length = 0;
  }
}
