// src/player/tricks/CoinToss.js  (owner: player, TT3 package A) — the ":3" Coin Toss (docs/TOKENTAILS-PLAN.md §11.3 #1).
// A boomerang: out TRICKS.coin.range m and back to her paw in TRICKS.coin.total s. It stops at the first foe on the way
// out (or a wall), then flies home; on the way back it hits every foe once more and scoops up the catnip and small
// hearts it passes. One coin at a time. The per-enemy rules (stun, crow ground, steal drop, pug block, jelly no split,
// boss Dizzy) live in `coinRule` (pure) and `applyCoinHit`.
// The coin is its own little simulation, not a Combat projectile: it must home on her moving paw on the way back and
// keep separate out / back hit lists. It still deals damage through `combat.applyHit` (as a projectile-like attacker),
// so resolveIncoming (crow, pug shield, i-frames) and every combat:hit listener behave as for any other shot.
import * as THREE from 'three';
import { E } from '../../core/events.js';
import { TRICKS, COIN_SMALL } from './tuning.js';

const C = TRICKS.coin;
const _ray = new THREE.Ray();
const _w = new THREE.Vector3();
/** physics.sphereCast options: props and architecture turn the coin, the ground is not tested (it flies at chest height) */
const WALL_CAST = Object.freeze({ terrain: false, mesh: true, statics: true });

/** The hit defs (combat reads id, dmg, knock, poise; popsSlime = a Wobblejelly never splits from the coin). */
export const COIN_DEF = Object.freeze({ id: 'trickCoin', dmg: C.dmgOut, knock: 1.5, poise: 1, telegraph: null, valor: 0 });
export const COIN_DEF_JELLY = Object.freeze({ ...COIN_DEF, knock: C.knock, popsSlime: true });
export const COIN_DEF_BOSS = Object.freeze({ ...COIN_DEF, dmg: C.bossDmg, knock: 0 });

/**
 * Where the coin is `t` s after the throw when nothing stops it (pure): out along `dir` with an ease-out to the apex
 * at total/2, then back. Returns the distance from the throw origin along the throw line (0 → range → 0).
 * @param {number} t @param {number} [total] @param {number} [range]
 */
export function coinDistance(t, total = C.total, range = C.range) {
  const half = total / 2;
  if (t <= 0) return 0;
  if (t >= total) return 0;
  if (t <= half) return range * Math.sin((t / half) * Math.PI * 0.5);
  const u = (t - half) / half;
  return range * Math.cos(u * Math.PI * 0.5);
}

/** Return flight time (s) from a turn point `d` m from her: proportional to the full return leg, never below minBack. */
export function backTime(d, total = C.total, range = C.range) {
  return Math.max(C.minBack, (total / 2) * Math.min(1, Math.max(0, d) / range));
}

/**
 * What the coin does to `e` (pure; duck-typed on the enemy): one of
 *   'boss'    bosses: bossDmg + bossDizzy, no stun
 *   'block'   a pug's shield from the front (clang, the coin turns back)
 *   'crow'    a flyer within crowMaxAlt of the ground: grounded crowGround s
 *   'high'    a flyer above crowMaxAlt: out of reach (the coin passes under)
 *   'stealer' a SNACK SNATCHER: stun stunStealer, drops stealDrop of its loot
 *   'jelly'   a Wobblejelly: knocked back, never split (jelly_s is also 'small')
 *   'small'   rats, jelly S, the bonehead mage: stun stunSmall (a crossbow rat aiming also loses its bolt)
 *   'normal'  damage only
 * @param {any} e @param {{x:number,z:number}} [dir] the coin's travel direction (into the foe) for the pug's front test
 * @param {number} [groundY] the ground height under the foe (for the crow altitude)
 */
export function coinRule(e, dir = null, groundY = 0) {
  const type = String(e?.type ?? e?.def?.id ?? '');
  if (e?.def?.boss || e?.isBoss || e?.tags?.has?.('boss')) return 'boss';
  if (e?.def?.fly || e?.tags?.has?.('flyer')) {
    const alt = (e.pos?.y ?? 0) - (Number.isFinite(groundY) ? groundY : 0);
    if (e.grounded) return 'crow';
    return alt <= C.crowMaxAlt + 1e-6 ? 'crow' : 'high';
  }
  if (dir && typeof e?.blocksFrom === 'function') {
    let b = false;
    try { b = !!e.blocksFrom(dir); } catch { b = false; }
    if (b) return 'block';
  }
  if (type === 'stealer' || e?.def?.look === 'pilfer' || e?.spawnOpts?.id === 'pilfer' || typeof e?.dropStolen === 'function' && e?.loot) return 'stealer';
  if (COIN_SMALL.includes(type) || (type.startsWith('bonehead') && (e?.variant === 'mage' || type.endsWith('mage')))) return type.startsWith('jelly') ? 'jelly' : 'small';
  if (type.startsWith('jelly')) return 'jelly';
  return 'normal';
}

/** Stun seconds for a rule (0 = none). */
export function coinStun(rule, type = '') {
  if (rule === 'stealer') return C.stunStealer;
  if (rule === 'small') return C.stunSmall;
  if (rule === 'jelly' && String(type).toLowerCase() === 'jelly_s') return C.stunSmall;
  return 0;
}

const _seg = { x: 0, z: 0 };
/** XZ distance from point (px, pz) to segment a→b. Pure. */
export function segDist(ax, az, bx, bz, px, pz, out = _seg) {
  const ux = bx - ax, uz = bz - az, L2 = ux * ux + uz * uz;
  let u = L2 > 1e-10 ? ((px - ax) * ux + (pz - az) * uz) / L2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  out.x = ax + ux * u; out.z = az + uz * u;
  return Math.hypot(px - out.x, pz - out.z);
}

/**
 * One coin. `update` advances it (fixed step) and resolves its hits through `ctx.combat`; `active` false = in her paw.
 * The PawTricks controller owns the instance and its cooldown.
 */
export class CoinToss {
  /** @param {any} ctx @param {any} player */
  constructor(ctx, player) {
    this.ctx = ctx; this.player = player;
    this.active = false;
    /** 'out' | 'back' */
    this.phase = 'out';
    this.t = 0; this.legT = 0; this.legDur = 0;
    /** after a bonk the coin hangs spinning a moment (the foe's anti-multi-hit runs out), then flies home */
    this.hoverT = 0;
    this.origin = new THREE.Vector3();
    this.dir = { x: 0, z: 1 };
    this.turn = new THREE.Vector3();
    /** sim position (y is absolute: her chest height) */
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    /** the last applyHit result (a 'none' lets the foe be hit again next step) */
    this.lastRes = null;
    this.spin = 0;
    this.hitsOut = new Set(); this.hitsBack = new Set();
    /** the projectile-like attacker combat.applyHit sees (events report `owner` = her) */
    this.att = { isProjectile: true, owner: player, source: player, faction: 'player', pos: this.pos, prevPos: this.prev, vel: this.vel,
      facing: 0, id: -1, r: C.r, radius: C.r, coin: true, onParried: () => {}, onBlocked: () => {} };
    this._q = [];
    /** stats for tests / smoke: hits, rules seen, stops, catches */
    this.stats = { throws: 0, hits: 0, rules: {}, stops: 0, caught: 0, collected: 0, blocked: 0 };
    this.lastStop = null;
  }

  /** Throw toward unit (dx, dz) from her chest. Returns false while a coin is already out. */
  throw(dx, dz) {
    if (this.active) return false;
    const p = this.player, l = Math.hypot(dx, dz) || 1;
    this.dir.x = dx / l; this.dir.z = dz / l;
    this.origin.x = p.pos.x; this.origin.y = p.pos.y + C.lift; this.origin.z = p.pos.z;
    this._set(this.pos, this.origin); this._set(this.prev, this.origin);
    this.phase = 'out'; this.t = 0; this.legT = 0; this.legDur = C.total / 2; this.hoverT = 0;
    this.hitsOut.clear(); this.hitsBack.clear();
    this.active = true; this.lastStop = null;
    this.stats.throws++;
    return true;
  }

  _set(o, s) { o.x = s.x; o.y = s.y; o.z = s.z; }

  /** Turn back now (a foe, a wall, a shield). */
  turnBack(reason = 'foe') {
    if (!this.active || this.phase === 'back') return;
    this._set(this.turn, this.pos);
    const p = this.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.phase = 'back'; this.legT = 0; this.legDur = backTime(d);
    this.hoverT = reason === 'apex' ? 0 : reason === 'foe' ? C.hover : C.hover * 0.5;
    this.lastStop = reason;
    if (reason !== 'apex') this.stats.stops++;
  }

  /** Back in her paw. */
  catch() {
    if (!this.active) return;
    this.active = false;
    this.stats.caught++;
    try { this.ctx.audio?.play2D?.('trickCoinCatch'); } catch { /* audio optional */ }
  }

  /** Drop it silently (level change, cutscene, death). */
  reset() { this.active = false; this.phase = 'out'; }

  update(dt) {
    if (!this.active) return;
    const p = this.player;
    this._set(this.prev, this.pos);
    this.t += dt; this.legT += dt; this.spin += dt * 22;
    if (!p?.alive || Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) > C.range * 4) { this.reset(); return; }
    if (this.phase === 'out') {
      const u = Math.min(1, this.legT / this.legDur), d = C.range * Math.sin(u * Math.PI * 0.5);
      this.pos.x = this.origin.x + this.dir.x * d; this.pos.z = this.origin.z + this.dir.z * d;
      this.pos.y = this.origin.y;
      if (this._wall()) { this.turnBack('wall'); }
      else {
        this._hits(this.hitsOut, true);
        if (this.active && this.phase === 'out' && u >= 1) this.turnBack('apex');
      }
    } else if (this.hoverT > 0) {
      // the bonk: a little hop back off the foe, spinning in place
      this.hoverT = Math.max(0, this.hoverT - dt);
      this.legT = 0;
      this.pos.x -= this.dir.x * C.bounce * dt / C.hover; this.pos.z -= this.dir.z * C.bounce * dt / C.hover;
      if (this.hoverT === 0) this._set(this.turn, this.pos);
    } else {
      // home on her paw (she may have moved): ease-in from the turn point
      const u = Math.min(1, this.legT / Math.max(1e-3, this.legDur)), k = 1 - Math.cos(u * Math.PI * 0.5);
      const hx = p.pos.x, hy = p.pos.y + C.lift, hz = p.pos.z;
      this.pos.x = this.turn.x + (hx - this.turn.x) * k; this.pos.z = this.turn.z + (hz - this.turn.z) * k;
      this.pos.y = this.turn.y + (hy - this.turn.y) * k;
      this._hits(this.hitsBack, false);
      this._collect();
      if (u >= 1 || (u > 0.5 && Math.hypot(hx - this.pos.x, hz - this.pos.z) <= C.catchR)) this.catch();
    }
    this.vel.x = (this.pos.x - this.prev.x) / Math.max(1e-6, dt); this.vel.y = 0; this.vel.z = (this.pos.z - this.prev.z) / Math.max(1e-6, dt);
    if (this.vel.x || this.vel.z) this.att.facing = Math.atan2(this.vel.x, this.vel.z);
  }

  /** A wall / prop on this step's segment (physics.sphereCast when present). */
  _wall() {
    if (!C.wallBounce) return false;
    const ph = this.ctx.physics;
    if (typeof ph?.sphereCast !== 'function') return false;
    _w.subVectors(this.pos, this.prev);
    const len = _w.length();
    if (len < 1e-6) return false;
    _ray.origin.copy(this.prev); _ray.direction.copy(_w).multiplyScalar(1 / len);
    let hit = null;
    try { hit = ph.sphereCast(_ray, C.r * 0.6, len, WALL_CAST); } catch { hit = null; }
    if (!hit) return false;
    this.pos.copy(this.prev).addScaledVector(_ray.direction, Math.max(0, hit.distance ?? 0));
    return true;
  }

  _ground(x, z) {
    const h = this.ctx.physics?.heightAt?.(x, z);
    return Number.isFinite(h) ? h : 0;
  }

  /** Foes the coin touches this step. Out: the first one stops it. Back: each once. */
  _hits(set, out) {
    const ctx = this.ctx, combat = ctx.combat, actors = ctx.actors;
    if (!combat || !actors?.queryRadius) return;
    const filter = combat.targetFilter?.('player') ?? ((a) => a.faction === 'enemy');
    const reach = Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) + C.r + 1.5;
    const list = actors.queryRadius(this.pos, reach, filter, this._q);
    let best = null, bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e?.pos || e === this.player || !e.alive || e.hurtable === false || e.hidden || e.dormant || e.breakable || set.has(e.id)) continue;
      const d = segDist(this.prev.x, this.prev.z, this.pos.x, this.pos.z, e.pos.x, e.pos.z);
      if (d > C.r + (e.radius ?? 0.35)) continue;
      const flyer = !!(e.def?.fly || e.tags?.has?.('flyer'));
      if (!flyer && (this.pos.y < e.pos.y - C.r || this.pos.y > e.pos.y + (e.height ?? 1) + C.r)) continue;
      if (flyer && coinRule(e, null, this._ground(e.pos.x, e.pos.z)) === 'high') continue;
      // first along the travel: the nearest to the previous point
      const along = Math.hypot(e.pos.x - this.prev.x, e.pos.z - this.prev.z);
      if (out) { if (along < bestD) { bestD = along; best = e; } } else {
        set.add(e.id); this.hit(e, false);
        if (this.lastRes === 'none') set.delete(e.id);
        if (!this.active) break;
      }
    }
    this._q.length = 0;
    if (out && best) { set.add(best.id); this.hit(best, true); if (this.lastRes === 'none') set.delete(best.id); }
  }

  /**
   * Resolve the coin on `e` (rules from coinRule). `out` = the outbound leg (the coin then turns back). Returns the
   * rule applied. Public for tests.
   */
  hit(e, out = true) {
    const ctx = this.ctx, combat = ctx.combat, p = this.player;
    const dl = Math.hypot(this.vel.x, this.vel.z);
    const dir = dl > 1e-6 ? { x: this.vel.x / dl, z: this.vel.z / dl } : out ? this.dir : { x: -this.dir.x, z: -this.dir.z };
    const rule = coinRule(e, dir, this._ground(e.pos.x, e.pos.z));
    this.lastRes = null;
    if (rule === 'high') return rule;
    if (!(e.invulnT > 0)) this.stats.rules[rule] = (this.stats.rules[rule] ?? 0) + 1;
    if (rule === 'block') {
      this.stats.blocked++; this.lastRes = 'block';
      ctx.bus?.emit?.(E.BURST, { kind: 'spark', position: this.pos.clone(), count: 6 });
      try { ctx.audio?.play3D?.('block', e); } catch { /* audio optional */ }
      if (out) this.turnBack('block');
      return rule;
    }
    // the steal drop comes before the hit (the stealer's own onHit may drop the rest)
    if (rule === 'stealer') { try { e.dropStolen?.(C.stealDrop); } catch (err) { console.warn('[tricks] dropStolen', err); } }
    const xbowAiming = String(e.type) === 'rat_xbow' && e.stateName === 'windup';
    const def = rule === 'boss' ? COIN_DEF_BOSS : rule === 'jelly' ? COIN_DEF_JELLY : COIN_DEF;
    const dmg = rule === 'boss' ? C.bossDmg : out ? C.dmgOut : C.dmgBack;
    this.att.pos = this.pos; this.att.vel = this.vel;
    const res = combat.applyHit(this.att, e, def, { dmg, from: this.prev });
    this.lastRes = res;
    if (res === 'none') return rule;                       // i-frames this step: it may connect on the next one
    if (res === 'block') {
      this.stats.blocked++;
      if (out) this.turnBack('block');
      return 'block';
    }
    if (res === 'hit' || res === 'break') {
      this.stats.hits++;
      p?.addValor?.(C.valor, 'trick');
      if (e.alive) {
        if (rule === 'boss') { try { e.addDizzy?.(C.bossDizzy); } catch { /* a boss without a meter */ } }
        else if (rule === 'crow') { try { if (typeof e.groundFlyer === 'function') e.groundFlyer(C.crowGround); else e.stagger?.(C.crowGround); } catch (err) { console.warn('[tricks] crow ground', err); } }
        else {
          const sec = coinStun(rule, e.type);
          if (sec > 0) e.stagger?.(sec);
        }
        if (xbowAiming) {
          // it loses its bolt: the telegraph is gone (stagger ends it) and the reload starts over
          const rl = e.attack?.def?.reload ?? e.def?.attacks?.[0]?.cooldown ?? 2.0;
          e.cooldownT = Math.max(e.cooldownT ?? 0, rl);
          e.endTelegraph?.();
          this.stats.rules.xbowBolt = (this.stats.rules.xbowBolt ?? 0) + 1;
        }
      }
      try { ctx.audio?.play3D?.('trickCoinHit', e); } catch { /* audio optional */ }
    }
    if (out && this.active) this.turnBack('foe');
    return rule;
  }

  /** On the way back: catnip and small hearts within collectR ride home (collected now). */
  _collect() {
    const pk = this.ctx.levels?.current?.pickups, p = this.player;
    if (!pk?.items || typeof pk._collect !== 'function') return;
    for (const it of pk.items) {
      if (!it.alive || (it.kind !== 'fish' && it.kind !== 'heart') || (it.delay ?? 0) > 0) continue;
      if (Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) > C.collectR || Math.abs(it.pos.y - this.pos.y) > 1.8) continue;
      try { pk._collect(it, p, this.ctx.state); this.stats.collected++; } catch (err) { console.warn('[tricks] coin collect', err); }
    }
  }
}
