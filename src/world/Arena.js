// src/world/Arena.js  (owner: world) — the §12.1 arena template, returned by ctx.levels.arenaNear(pos) / arena(id):
//  1. Enter: the trigger disc (r − 2; rectangles: inset 2 m) locks it → arena:lock, a fog wall (fx.mistRing cards
//     every 1.5 m + a physics ring collider; rectangles: 4 edge walls, edges over deep water get only the cards).
//  2. Combat music (boss music for boss arenas).
//  3. Waves: the next wave starts 1.5 s after alive ≤ 1, at the 3 of 6 ring points (r − 1.5) farthest from the
//     player, with the spawn poof (Boneheads: spawnBones), already alerted (the ring points sit beyond sight range);
//     arena:wave {id, wave, total}.
//  4. Ring points over deep water, outside the bounds or inside static colliders are skipped.
//  5. Clear: arena:clear, the wall dissolves, jingles/jingles_STEEL00, explore music returns 4 s after the last kill.
//  6. Death inside resets it to wave 1 (reset()); a boss arena keeps its boss (enemies reset the phase) and drops
//     the wall so the retry walks back in.
//  7. Rectangular arenas (`size: [w, d]`): corners + long-side midpoints, four edge walls.
// Zone options: `lockOn: '<cutsceneId>:end'` (no auto-lock; locks when that cutscene ends, e.g. the glade after CS-03),
// `autoLockWhen` (cond string / fn: auto-lock re-arms on reloads, e.g. meadow.pudding === 'netted'), `boss` (enemy
// type spawned at the centre), `waves: [[[type, n, opts?], ...], ...]`, `restoreUnless` (cond: never restore the
// saved clear while it holds, e.g. the glade while Pudding is still netted), `clearedWhen` (cond: start cleared, e.g. the
// town's arenas once `town.free`).
// TT2 §10.3 (the first fight): `calm: s` — the waves spawn idle (`ai: false` in their opts) and wake on her first
// order / swing / hit, or `calm` s after they appear; `softHit: n` — the first hit on her inside the fight deals at most
// n (the rest is given back at once).
// Saved clears: clear() sets the flag `<level>.cleared.<arenaId>` (the open-zone convention). On load, restore()
// starts the arena cleared (no trigger, no waves, no events) when that flag is set, or when its `rescue` is done
// (the bridge once Mochi is rescued).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { condOk } from './Level.js';

/** Metres outside a locked (non-boss) arena edge that count as having left the fight (teleported out). */
const ARENA_LEAVE = 4;

/** The flag that marks an arena cleared (pure; the same `<level>.cleared.<id>` convention as the open zones). */
export const arenaFlag = (levelId, arenaId) => `${levelId}.cleared.${arenaId}`;

export const ARENA = Object.freeze({ waveDelay: 1.5, firstWave: 1.2 /* AUTOCAM §8 room read: the first wave ≥ 1.2 s after the lock */, exploreAfter: 4, ringInset: 1.5, triggerInset: 2, wallPad: 0.4, clearJingle: 'jingles/jingles_STEEL00',
  /** fog wall look (fx.mistRing opts): card alpha (fx default 0.62) and width (5.5 m), the iso ground band 1.2 m / 0.12 */
  wall: Object.freeze({ alpha: 0.35, width: 3.5, bandW: 1.2, bandA: 0.12 }) });
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
    /** world.W6 soft arena (Mochi's cart): no fog wall, no wall colliders, she is never pulled or kept inside */
    this.soft = !!zone.soft;
    this._firstT = 0;
    this.wave = 0; this.locked = false; this.cleared = false;
    /** @type {any[]} */
    this.enemies = [];
    this._waitT = 0; this._exploreT = -1;
    this.wall = null; this._wallColliders = [];
    /** callbacks fired once on clear */
    this.onClear = [];
    this._offs = [];
    /** TT2 first fight: seconds until the idle wave wakes (0 = awake), and the soft first hit still owed */
    this.calm = zone.calm ?? 0; this._calmT = 0; this._calmOn = false;
    this.softHit = zone.softHit ?? null; this._softUsed = false;
    if (this.calm > 0) {
      const wake = () => { if (this._calmOn) this.wake(); };
      this._offs.push(ctx.bus.on(E.PLAYER_ORDER, (o) => { if (o?.valid !== false && o?.kind !== 'stop') wake(); }));
      this._offs.push(ctx.bus.on(E.PLAYER_SWING, wake));
      this._offs.push(ctx.bus.on(E.HIT, (h) => { if (h?.target && this.enemies.includes(h.target)) wake(); }));
    }
    if (this.softHit != null) {
      this._offs.push(ctx.bus.on(E.PLAYER_DAMAGED, (d) => {
        if (!this.locked || this._softUsed || !d || !this.enemies.includes(d.source)) return;
        this._softUsed = true;
        const p = ctx.player, give = Math.max(0, (d.amount ?? 0) - this.softHit);
        if (p && give > 0 && p.alive !== false) p.hp = Math.min(p.maxHp ?? p.hp + give, p.hp + give);
      }));
    }
    if (this.lockOn) {
      const [csId, when = 'end'] = String(this.lockOn).split(':');
      const ev = when === 'start' ? E.CUTSCENE_START : E.CUTSCENE_END;
      this._offs.push(ctx.bus.on(ev, (p) => { if (p?.id === csId && !this.cleared) this.lock(); }));
    }
  }

  /** The save flag for this arena (`<level>.cleared.<id>`). */
  get flag() { return arenaFlag(this.level?.id ?? this.level?.def?.id ?? 'level', this.id); }

  /** Was it cleared on an earlier visit (saved flag, or its rescue already done)? */
  savedCleared() {
    const st = this.ctx.state, z = this.zone;
    if (z.restoreUnless != null && condOk(this.ctx, z.restoreUnless)) return false;
    if (st?.getFlag?.(this.flag)) return true;
    if (z.clearedWhen != null && condOk(this.ctx, z.clearedWhen)) return true;     // the town once it is free (hub mode)
    const r = z.rescue;
    if (r && ((r.flag && st?.getFlag?.(r.flag)) || st?.companions?.unlocked?.includes?.(r.companion))) return true;
    return false;
  }

  /**
   * Level load: start cleared when savedCleared() (no trigger, no waves, no wall, no arena:clear event). The cleared
   * id is handed to the systems that track clears per level (objectives, companions' needClear) without the event.
   * @returns {boolean} restored
   */
  restore() {
    if (this.cleared || !this.savedCleared()) return false;
    this.cleared = true; this.locked = false; this.wave = this.waves.length;
    const c = this.ctx;
    try { c.objectives?.cleared?.add?.(this.id); } catch { /* optional */ }
    try {
      if (typeof c.companions?.markCleared === 'function') c.companions.markCleared(this.id);
      else c.companions?.cleared?.add?.(this.id);
    } catch { /* optional */ }
    return true;
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

  /**
   * Start the fight: fog wall, music, boss at the centre or wave 1 (after the ARENA.firstWave room read; `now` spawns
   * it at once). Idempotent. Pulls her inside if needed (never for a soft arena).
   * @param {{now?: boolean}} [o]
   */
  lock({ now = false } = {}) {
    if (this.locked || this.cleared) return this;
    this.locked = true; this._exploreT = -1; this._waitT = 0;
    const p = this.ctx.player;
    if (!this.soft && p?.alive !== false && p?.pos && !this.contains(p.pos, 0.8)) this._pullInside(p);
    // IMPLEMENTATION_PLAN §7.1 (X23): the camera's room-read beat frames { center, r }
    this.ctx.bus.emit(E.ARENA_LOCK, { id: this.id, center: this.center.clone(), r: this.r, size: this.size ? [...this.size] : null, soft: this.soft });
    if (!this.soft) this._raiseWall();
    const music = this.level?.music ?? {};
    const track = this.boss ? (music.boss ?? music.combat) : music.combat;
    if (track) this.ctx.bus.emit(E.MUSIC, { track, fade: this.boss ? 0.3 : 1.0 });
    if (this.boss) {
      const alive = this.enemies.find((e) => e.alive && this.ctx.enemies?.list?.includes(e));
      if (!alive) {
        const facing = p?.pos ? Math.atan2(p.pos.x - this.center.x, p.pos.z - this.center.z) : 0;
        const e = this.ctx.enemies?.spawn?.(this.boss, this.center.clone(), { facing, arena: this.id, alerted: true });
        if (e) this.enemies.push(e);
      }
    } else if (this.wave === 0) { if (now) this._nextWave(); else this._firstT = ARENA.firstWave; }     // the room read first, then wave 1
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
    // the nearest edge can be water or a wall (the Old Bridge arena spans the stream): walk the point in toward
    // the centre, then around the ring, until it is dry, open ground
    const q = new THREE.Vector3();
    const dry = (px, pz) => this.validPoint(q.set(px, this.heightAt(px, pz), pz));
    if (!dry(x, z)) {
      let found = false;
      const ox = x - this.center.x, oz = z - this.center.z;
      for (let k = 0.85; k > 0.05 && !found; k -= 0.15) { if (dry(this.center.x + ox * k, this.center.z + oz * k)) { x = this.center.x + ox * k; z = this.center.z + oz * k; found = true; } }
      const r = Math.hypot(ox, oz), a0 = Math.atan2(ox, oz);
      for (let i = 1; i <= 12 && !found; i++) {
        const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
        const px = this.center.x + Math.sin(a) * r, pz = this.center.z + Math.cos(a) * r;
        if (dry(px, pz)) { x = px; z = pz; found = true; }
      }
      if (!found) { x = this.center.x; z = this.center.z; }
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
      // `extra.at`: 'center' (the town square's giant jelly rises from the fountain) or [x, z]; else the ring points
      const at = extra?.at === 'center' ? [this.center.x, this.center.z] : Array.isArray(extra?.at) ? extra.at : null;
      if (at) _v.set(at[0] + (i ? Math.sin(i * 2.399) * 1.2 : 0), 0, at[1] + (i ? Math.cos(i * 2.399) * 1.2 : 0));
      else {
        const base = pts[k % pts.length];
        const ring = Math.floor(k / pts.length), a = k * 2.399;
        k++;
        _v.set(base.x + Math.sin(a) * 1.1 * ring, 0, base.z + Math.cos(a) * 1.1 * ring);
      }
      _v.y = this.heightAt(_v.x, _v.z);
      const pp = this.ctx.player?.pos;
      const facing = at && pp ? Math.atan2(pp.x - _v.x, pp.z - _v.z) : Math.atan2(this.center.x - _v.x, this.center.z - _v.z);
      const { at: _at, ...opts } = extra ?? {};
      const e = this.ctx.enemies?.spawn?.(type, _v.clone(), { facing, arena: this.id, alerted: true, ...opts });
      if (e) this.enemies.push(e);
      this.ctx.bus.emit(E.BURST, { kind: String(type).startsWith('bonehead') ? 'spawnBones' : 'spawn', position: _v.clone() });
    }
    if (this.calm > 0 && this.wave === 1) { this._calmOn = true; this._calmT = this.calm; }
    this.ctx.bus.emit(E.ARENA_WAVE, { id: this.id, wave: this.wave, total: this.waves.length });
  }

  /** TT2 first fight: the idle wave wakes and charges (her first order / swing / hit, or `calm` s). Idempotent. */
  wake() {
    if (!this._calmOn) return;
    this._calmOn = false; this._calmT = 0;
    const list = this.ctx.enemies?.list ?? [];
    for (const e of this.enemies) {
      if (!e?.alive || !list.includes(e) || e.ai !== false) continue;
      e.ai = true; e.alerted = true;
      try { e.setState?.('chase'); } catch (err) { console.warn('[arena] wake', err); }
    }
    this.ctx.bus.emit(E.ARENA_WAVE, { id: this.id, wave: this.wave, total: this.waves.length, woke: true });
  }

  clear() {
    if (this.cleared) return this;
    this.cleared = true; this.locked = false;
    this._dropWall();
    try { this.ctx.state?.setFlag?.(this.flag, true); } catch (e) { console.warn('[arena] clear flag', e); }   // saved with the flags
    this.ctx.bus.emit(E.ARENA_CLEAR, { id: this.id });
    if (!this.ctx.audio?.director) this.ctx.audio?.play2D?.(ARENA.clearJingle, { vol: 0.8 });   // audio plays the §16.1 victory sting itself
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
    this.locked = false; this._waitT = 0; this._firstT = 0; this._calmOn = false; this._calmT = 0; this._softUsed = false;
    this._dropWall();
    const explore = this._explore();
    if (explore) this.ctx.bus.emit(E.MUSIC, { track: explore, fade: 1.5 });
  }

  /** The level's explore track now (its byFlag pick, e.g. the town hub's), else `explore`. */
  _explore() {
    const m = this.level?.music;
    if (!m) return null;
    return this.ctx.levels?.pickMusic?.(m) ?? m.explore ?? null;
  }

  aliveCount() {
    const list = this.ctx.enemies?.list ?? [];
    let n = 0;
    for (const e of this.enemies) if (e.alive && list.includes(e)) n++;
    return n;
  }

  update(dt) {
    if (this._exploreT > 0 && (this._exploreT -= dt) <= 0) {
      const explore = this._explore();
      if (explore) this.ctx.bus.emit(E.MUSIC, { track: explore, fade: 1.5 });
    }
    if (!this.locked || this.cleared) return;
    // moved far out of a locked fight (a teleport: debug hooks, a respawn without a death): leave the fight like a
    // death does instead of dragging her back to the ring edge (which can be the stream at the Old Bridge)
    const p = this.ctx.player;
    if (p?.alive && p.pos && !this.boss && this.distanceTo(p.pos) > ARENA_LEAVE) { this.reset(); return; }
    if (!this.soft) this._keepInside();
    // AUTOCAM §8 room read: the camera frames the ring first; wave 1 follows ARENA.firstWave s after the lock
    if (this._firstT > 0) { if ((this._firstT -= dt) <= 0) { this._firstT = 0; this._nextWave(); } return; }
    if (this._calmOn && (this._calmT -= dt) <= 0) this.wake();
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
    // a lighter, narrower wall (ARENA.wall): from above the default cards and ground band read as a grey smear over
    // the ring stones; bandW / bandA are honoured once fx's mistRing takes them (requests/fx.md)
    const W = ARENA.wall;
    try { this.wall = fx?.mistRing?.(this.center.clone(), this.size ?? this.r, { size: this.size, id: this.id, alpha: W.alpha, width: W.width, bandW: W.bandW, bandA: W.bandA }) ?? null; } catch (e) { console.warn('[arena] mistRing', e); this.wall = null; }
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
