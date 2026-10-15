// src/player/tricks/CatnipCloud.js  (owner: player, TT3 package A) — the Catnip Cloud (docs/TOKENTAILS-PLAN.md §11.3 #3).
// A pouch lobbed up to TRICKS.cloud.range m bursts into a lilac cloud (r TRICKS.cloud.r) for TRICKS.cloud.dur s. Normal
// foes inside go `giddy` for TRICKS.cloud.giddy s (Enemy.makeGiddy: on their backs, no attacks, the friend plate word,
// a GRUMP's jeer cancelled; the first hit wakes them for ×1.5, Combat). Bosses and elites (poise ≥ 5) only gain
// TRICKS.cloud.bossDizzy Dizzy. Crows in the cloud are grounded instead. Each foe is affected once per cloud.
import * as THREE from 'three';
import { TRICKS } from './tuning.js';

const K = TRICKS.cloud;

/**
 * What the cloud does to `e` (pure): 'boss' (Dizzy only: bosses and poise ≥ eliteMinPoise), 'crow' (a flyer:
 * grounded for the giddy time), 'giddy' (everyone else), or 'none' (not a live, awake foe).
 * @param {any} e
 */
export function cloudRule(e) {
  if (!e || e.alive === false || e.dormant || e.hidden || e.breakable || e.hurtable === false) return 'none';
  if (e.def?.boss || e.isBoss || e.tags?.has?.('boss') || (e.maxPoise ?? 0) >= K.eliteMinPoise) return 'boss';
  if (e.def?.fly || e.tags?.has?.('flyer')) return 'crow';
  return 'giddy';
}

/** Where the pouch lands for a throw toward (tx, tz) from (fx, fz): clamped to TRICKS.cloud.range. Pure; writes out. */
export function landPoint(fx, fz, tx, tz, out = { x: 0, z: 0 }) {
  let dx = tx - fx, dz = tz - fz;
  const d = Math.hypot(dx, dz);
  if (d > K.range) { dx *= K.range / d; dz *= K.range / d; }
  out.x = fx + dx; out.z = fz + dz;
  return out;
}

/** The pouch's arc height (m) at flight fraction u (0..1). Pure. */
export function pouchArc(u, apex = 2.2) { return 4 * apex * u * (1 - u); }

export class CatnipCloud {
  /** @param {any} ctx @param {any} player */
  constructor(ctx, player) {
    this.ctx = ctx; this.player = player;
    /** the pouch in the air (null = none) */
    this.pouch = null;
    /** the live cloud (null = none): { pos, t, dur, hit: Set } */
    this.cloud = null;
    this._tick = 0;
    this._q = [];
    this.stats = { throws: 0, giddy: 0, dizzy: 0, crows: 0, clouds: 0 };
  }

  get active() { return !!(this.pouch || this.cloud); }

  /** Lob the pouch from her paw toward the point (x, z) (clamped to range). */
  throw(x, z) {
    const p = this.player, at = landPoint(p.pos.x, p.pos.z, x, z);
    const gy = this._ground(at.x, at.z);
    this.pouch = { from: new THREE.Vector3(p.pos.x, p.pos.y + 0.8, p.pos.z), to: new THREE.Vector3(at.x, gy, at.z), t: 0, pos: new THREE.Vector3(p.pos.x, p.pos.y + 0.8, p.pos.z) };
    this.stats.throws++;
    return this.pouch.to;
  }

  /** Burst the cloud at `pos` now (also the pouch landing). */
  burst(pos) {
    this.pouch = null;
    this.cloud = { pos: new THREE.Vector3(pos.x, pos.y ?? this._ground(pos.x, pos.z), pos.z), t: 0, dur: K.dur, hit: new Set() };
    this._tick = 0;
    this.stats.clouds++;
    try { this.ctx.audio?.play3D?.('trickPoof', this.cloud.pos); } catch { /* audio optional */ }
    this._sweep();
  }

  reset() { this.pouch = null; this.cloud = null; }

  update(dt) {
    const pc = this.pouch;
    if (pc) {
      pc.t += dt;
      const u = Math.min(1, pc.t / K.flight);
      pc.pos.lerpVectors(pc.from, pc.to, u);
      pc.pos.y += pouchArc(u);
      if (u >= 1) this.burst(pc.to);
    }
    const c = this.cloud;
    if (!c) return;
    c.t += dt;
    if ((this._tick -= dt) <= 0) { this._tick = K.tick; this._sweep(); }
    if (c.t >= c.dur) this.cloud = null;
  }

  /** Every foe inside the cloud gets its rule, once per cloud. */
  _sweep() {
    const c = this.cloud, ctx = this.ctx;
    if (!c || !ctx.actors?.queryRadius) return;
    const filter = ctx.combat?.targetFilter?.('player') ?? ((a) => a.faction === 'enemy');
    const list = ctx.actors.queryRadius(c.pos, K.r + 1.5, filter, this._q);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e?.pos || c.hit.has(e.id)) continue;
      if (Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) > K.r + (e.radius ?? 0.35)) continue;
      const rule = cloudRule(e);
      if (rule === 'none') continue;
      if (rule === 'crow' && e.pos.y - c.pos.y > 4.5) continue;                  // high above the cloud
      c.hit.add(e.id);
      this.apply(e, rule);
    }
    this._q.length = 0;
  }

  /** Apply the cloud to one foe (public for tests). Returns what happened. */
  apply(e, rule = cloudRule(e)) {
    if (rule === 'boss') {
      try {
        if (typeof e.addDizzy === 'function') e.addDizzy(K.bossDizzy);
        else e.wobbleT = Math.max(e.wobbleT ?? 0, 1.0);                         // an elite with no meter: a woozy wobble
      } catch (err) { console.warn('[tricks] cloud dizzy', err); }
      this.stats.dizzy++;
      return 'dizzy';
    }
    if (rule === 'crow') {
      try { if (typeof e.groundFlyer === 'function') e.groundFlyer(K.giddy); else e.stagger?.(K.giddy); } catch (err) { console.warn('[tricks] cloud crow', err); }
      this.stats.crows++;
      return 'grounded';
    }
    if (rule === 'giddy') {
      let ok = false;
      try { ok = typeof e.makeGiddy === 'function' ? e.makeGiddy(K.giddy) !== false : (e.stagger?.(K.giddy), true); } catch (err) { console.warn('[tricks] giddy', err); }
      if (ok) { this.stats.giddy++; try { this.ctx.audio?.play3D?.('trickGiggle', e); } catch { /* audio optional */ } }
      return ok ? 'giddy' : 'none';
    }
    return 'none';
  }

  _ground(x, z) {
    const h = this.ctx.physics?.heightAt?.(x, z);
    return Number.isFinite(h) ? h : (this.player?.pos?.y ?? 0);
  }
}
