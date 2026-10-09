// src/enemies/EnemyManager.js  (owner: enemies) — the ctx.enemies service (GAME_DESIGN §19.3):
//   spawn(type, pos, opts) → Enemy;  spawnWave(list, points) → Enemy[];  despawn(e);  list;  boss
// plus helpers other areas may use: alertNear(pos, r), count(filter?), byType(type), clear().
//
// Types (resolveEnemyDef): the type files in types/ and scripted/ (rat_pike, rat_xbow, crow, hyena, spider, stealer,
// pug, the Gloomjelly sizes 'jelly' / 'jelly_l|m|s|giant'; bosses boss_grizzlechop, boss_cacklejaw and Cacklejaw's
// shadow clone; the CS-02 cast cacklejaw, pilfer, barkus_silhouette; Pilfer's town chase `pilfer_chase`), base
// versions of the M3 rows (warhound, bat, hornet), 'bonehead:<minion|warrior|rogue|mage>', the other bosses
// 'boss_<key>' (BOSSES + BOSS_MODELS), any other Appendix A ENEMIES key, and a generic grunt (with a warning).
//
// M2 services: `webs` (spider web patches: add / cut / clear), `pilferChase(opts)`, `joinArena(e, id)`, the hyena
// pack's "behind" flank slot (claimBehind / releaseBehind), the Line's `pinThief`.
//
// Rules owned here:
//   - §8.3 arena budget: at most `quality.maxEnemies` (8; 6 on Low) AI enemies alive in one fight. A fight = the
//     enemies within TUNING.capRadius of the spawn point plus every alerted one (an idle squad in a far zone of the
//     level never holds back an arena wave). Extra spawns wait dormant (invisible, unregistered) and wake, with a
//     spawn poof, as slots free up. Scripted / AI-less cutscene actors and bosses never count and are never held.
//   - §7.7 Meow: unalerted enemies within PLAYER.meow.aggroRadius turn and alert.
//   - Pack alerts: idle pack-mates near an alerted enemy join after a short beat (TUNING.groupAlert*).
//   - A cutscene interrupts every free (non-scripted) enemy's attack: telegraphs end, tokens are released.
//   - §10.1 defeat: helmets spin off as debris (visual only, animated in render).
//   - Everything is cleared on level:unload.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { ENEMIES, PLAYER, GRAVITY } from '../core/config.js';
import { Enemy, visualDt } from './Enemy.js';
import { Boss } from './Boss.js';
import { TUNING, M2, rangeOf } from './tuning.js';
import ratPike from './types/rat_pike.js';
import ratXbow from './types/rat_xbow.js';
import crow from './types/crow.js';
import hyena from './types/hyena.js';
import spider from './types/spider.js';
import stealer from './types/stealer.js';
import pug from './types/pug.js';
import { JELLY_TYPES } from './types/jelly.js';
import bossGrizzlechop from './types/boss_grizzlechop.js';
import bossCacklejaw, { CACKLEJAW_CLONE } from './types/boss_cacklejaw.js';
import { GENERIC, boneheadDef, animsFor } from './types/generic.js';
import { dressKayKit } from './types/kaykitGear.js';
import cacklejaw from './scripted/Cacklejaw.js';
import grizzlechop from './scripted/Grizzlechop.js';
import pilfer, { PILFER_CHASE } from './scripted/Pilfer.js';
import barkusSilhouette from './scripted/BarkusSilhouette.js';
import { bossDef } from './bossBase.js';
import { WebPatches } from './WebPatches.js';
import { tickSlow } from './status.js';

/** Every hand-written type (Appendix B.3 shape). */
export const TYPES = Object.freeze({
  rat_pike: ratPike, rat_xbow: ratXbow, crow, hyena, ...GENERIC, spider, stealer, pug, ...JELLY_TYPES,
  boss_grizzlechop: bossGrizzlechop, boss_cacklejaw: bossCacklejaw, cacklejaw_clone: CACKLEJAW_CLONE,
  cacklejaw, grizzlechop, pilfer, pilfer_chase: PILFER_CHASE, barkus_silhouette: barkusSilhouette,
});

/** Base boss looks until the M3 boss type files replace them: the §11 builds on the shared rigs. */
const KNIGHT_PROPS = ['1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield'];
const BOSS_LOOKS = {
  brutus: { hide: ['Knight_Head', '1H_Sword', '1H_Sword_Offhand', 'Badge_Shield', 'Round_Shield', 'Spike_Shield'], show: ['2H_Sword', 'Rectangle_Shield', 'Knight_Helmet'],
    build: (e, m) => dressKayKit(e, m, { look: 'brutus', headNode: 'Knight_Head', expression: 'neutral', plate: false }) },
  barkus: { hide: ['Knight_Head', 'Knight_Helmet', ...KNIGHT_PROPS], show: ['Knight_Cape'], tint: { Knight_Cape: '#22242A' },
    build: (e, m) => dressKayKit(e, m, { look: 'barkus', headNode: 'Knight_Head', expression: 'angry', plate: false,
      weapon: { model: 'models/weapons/quaternius/Claymore.glb', bone: 'handslot.r', fit: 'barkus' } }) },
};

const GENERIC_GRUNT = { hp: 30, radius: 0.35, height: 1, mass: 1, poise: 1, walk: 1.5, run: 3, sight: 10, fov: 2.09, leash: 18,
  attacks: [{ id: 'rat_poke', weight: 1, range: 1.8 }] };

/**
 * Resolve a spawn type id to its def (pure; exported for tests). Always returns a def with `id === type`
 * (bonehead / jelly variants normalise unknown sub-ids to their default).
 * @param {string} type
 */
export function resolveEnemyDef(type) {
  const t = String(type ?? '');
  if (TYPES[t]) return { ...TYPES[t], id: t };
  if (t === 'bonehead' || t.startsWith('bonehead:')) return boneheadDef(t.split(':')[1] ?? 'minion');
  if (/^jelly_(l|m|s|giant)$/i.test(t)) return { ...TYPES[t.toLowerCase()], id: t };
  if (t.startsWith('boss_')) {
    const key = t.slice(5);
    const d = bossDef(key, BOSS_LOOKS[key] ?? {});
    if (d) return d;
  }
  if (ENEMIES[t]) {
    const row = ENEMIES[t];
    return { ...GENERIC_GRUNT, ...row, anims: row.model ? animsFor(row.model) : {}, id: t };
  }
  return { ...GENERIC_GRUNT, id: t, unknown: true };
}

/** Is `e` an AI combatant that counts against the §8.3 arena budget? */
export function countsTowardCap(e) {
  return !!e && e.alive && !e.dormant && e.ai && !e.scripted && !e.def?.boss && !e.tags?.has('cutscene') && e.faction === 'enemy';
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const GOLDEN = 2.399963229728653;        // golden angle (rad): even scatter of wave members around a point

/** Resolve a position-ish (Vector3, [x, z], [x, y, z], {x, z}, {pos}, anchor name) into `out` (null if unknown). */
function toPos(ctx, p, out) {
  if (p == null) return null;
  if (typeof p === 'string') { const a = ctx.levels?.anchor?.(p); return a?.pos ? out.copy(a.pos) : null; }
  if (Array.isArray(p)) return p.length >= 3 ? out.set(p[0], p[1], p[2]) : out.set(p[0] ?? 0, NaN, p[1] ?? 0);
  if (p.pos && typeof p.pos.x === 'number') return out.copy(p.pos);
  if (typeof p.x === 'number' && typeof p.z === 'number') return out.set(p.x, typeof p.y === 'number' ? p.y : NaN, p.z);
  return null;
}

export class EnemyManager {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Enemy[]} every spawned enemy (dormant ones included) */
    this.list = [];
    /** @type {Boss|null} */
    this.boss = null;
    /** @type {Enemy[]} over-budget spawns waiting for a free slot (FIFO) */
    this.pending = [];
    /** @type {{obj: THREE.Object3D, vel: THREE.Vector3, axis: THREE.Vector3, spin: number, t: number, life: number, base: THREE.Vector3, bounced: boolean}[]} */
    this.debris = [];
    this._iter = [];
    this._offs = [];
    /** spider web patches (WebPatches): add(pos, {r, life}) / cut(w) / clear() / list */
    this.webs = new WebPatches(ctx);
    /** the hyena pack's "behind" flank slot holder (§10.3 pack flank) */
    this.behind = null;
    /** The Line: the stealer currently holding the winch pin (one at a time) */
    this.pinThief = null;
    /** prewarm stand-ins kept (materials alive) until the level unloads */
    this._warmKeep = [];
  }

  async init() {
    const bus = this.ctx.bus;
    this.webs.init();
    this._offs.push(
      bus.on(E.LEVEL_UNLOAD, () => this.clear()),
      bus.on(E.CUTSCENE_START, () => this.interruptAll()),
      bus.on(E.PLAYER_MEOW, (p) => this.onMeow(p?.position ?? this.ctx.player?.pos)),
      // hyena Gloat (§10.3): an enemy that lands a hit on her (not blocked / parried; god mode still counts) hears about it
      bus.on(E.HIT, (h) => {
        const a = h?.attacker;
        if (!a || h.blocked || h.parried || (h.result !== 'hit' && h.result !== 'break') || a.faction !== 'enemy' || typeof a.onDealtHit !== 'function') return;
        if (h.target !== this.ctx.player) return;
        a.onDealtHit(h);
      }),
    );
  }

  // ------------------------------------------------------------------ M2 services
  /** Pack flank: take the "behind" slot (one flanker at a time). */
  claimBehind(e) {
    const b = this.behind;
    if (b && b !== e && b.alive && !b.disposed && b.flanker) return false;
    this.behind = e;
    return true;
  }

  releaseBehind(e) { if (this.behind === e) this.behind = null; }

  /** Put `e` in arena `id`'s fight (its alive count / wave clear): boss adds, jelly splits, clones. */
  joinArena(e, id) {
    if (!e || !id) return false;
    const a = this.ctx.levels?.current?.arena?.(id) ?? this.ctx.levels?.arena?.(id);
    if (!a || !Array.isArray(a.enemies) || a.enemies.includes(e)) return false;
    a.enemies.push(e);
    return true;
  }

  /**
   * §12.5 Pilfer's town chase: spawn Pilfer (actor id 'pilfer') at the path start running `chase_0..5` (or `path`).
   * Returns { pilfer, done } — `done` resolves { dropped: true } when 3 hits make him drop the bag (`item:returned`
   * {item: 'post_bag'} is emitted then; story plays CS-06). `onDrop(pilfer)` is called at that moment too.
   * @param {{path?: any[], onDrop?: Function, id?: string}} [opts]
   */
  pilferChase(opts = {}) {
    const start = opts.path?.[0] ?? 'chase_0';
    const e = this.spawn('pilfer_chase', start, { id: opts.id ?? 'pilfer', path: opts.path ?? null, onDrop: opts.onDrop ?? null, noCap: true });
    return { pilfer: e, done: e.done ?? Promise.resolve({ dropped: false }) };
  }

  /** Current §8.3 budget (quality preset: 8, Low 6). */
  get cap() { return this.ctx.quality?.maxEnemies ?? 8; }

  /** Number of enemies matching `filter` (default: live, non-dormant AI enemies that count against the budget). */
  count(filter = countsTowardCap) {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if (filter(this.list[i])) n++;
    return n;
  }

  /**
   * Budget enemies in the fight around `pos` (§8.3): alerted ones anywhere, the rest within TUNING.capRadius of `pos`.
   * @param {{x: number, z: number}} pos @param {Enemy|null} [skip]
   */
  countNear(pos, skip = null) {
    const r2 = TUNING.capRadius * TUNING.capRadius;
    let n = 0;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e === skip || !countsTowardCap(e)) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      if (e.alerted || dx * dx + dz * dz <= r2) n++;
    }
    return n;
  }

  /** Live enemies of a type id. Returns a new array. */
  byType(type) { return this.list.filter((e) => e.type === type && e.alive); }

  /**
   * Spawn an enemy (§19.3). `pos` is a Vector3, [x, z], [x, y, z], {x, z}, an anchor or an Actor-like {pos}; the
   * feet snap to the ground below unless the given y is higher (bridges, roofs, the Bell Tower).
   * @param {string} type
   * @param {any} pos
   * @param {{facing?: number, id?: string, runner?: boolean, y?: number, scripted?: boolean, ai?: boolean,
   *          perched?: boolean, grounded?: boolean, cage?: boolean|string, word?: string|null, seed?: number,
   *          home?: any, noCap?: boolean, alerted?: boolean}} [opts]
   *   y: height above the ground (a crossbowman on a cart: `{ y: 1.2 }` → perched; it stands on the nearest walkable
   *   top of about that height within TUNING.perch.search m, else floats at ground + y); scripted: cutscene actor from the
   *   start; ai: false = never thinks (CS-02 cast); cage / word: hyena dressing; alerted: spawn already fighting.
   * @returns {Enemy}
   */
  spawn(type, pos, opts = {}) {
    const ctx = this.ctx;
    if (type === 'pilfer' && opts.chase) type = 'pilfer_chase';
    const def = resolveEnemyDef(type);
    if (def.unknown) console.warn(`[enemies] unknown type "${type}" (generic stand-in)`);
    const p = new THREE.Vector3();
    if (!toPos(ctx, pos, p)) p.copy(ctx.player?.pos ?? _v.set(0, 0, 0)).setY(NaN);
    let ground = this._groundAt(p.x, p.z, Number.isFinite(p.y) ? p.y : undefined);
    // a point on a bridge deck given at terrain height (arena ring points, level zones) would drop the feet into the
    // stream under it: stand on the dry walkable top instead
    const ph = ctx.physics;
    if (!opts.y && typeof ph?.isDeepWater === 'function' && typeof ph.topAt === 'function' && ph.isDeepWater(p.x, p.z, ground)) {
      const top = ph.topAt(p.x, p.z);
      if (Number.isFinite(top) && top > ground && !ph.isDeepWater(p.x, p.z, top)) { ground = top; p.y = top; }
    }
    if (opts.y) { if (!this.findPerch(p, opts.y)) p.y = ground + opts.y; }
    else p.y = Number.isFinite(p.y) ? Math.max(p.y, ground) : ground;
    const facing = opts.facing ?? (ctx.player ? Math.atan2(ctx.player.pos.x - p.x, ctx.player.pos.z - p.z) : 0);
    const Cls = def.boss ? Boss : Enemy;
    const e = new Cls(ctx, def, { ...opts, pos: p, facing, y: opts.y ?? 0 });
    if (opts.home) toPos(ctx, opts.home, e.home);
    if (opts.ai === false) e.ai = false;
    const held = !opts.noCap && !def.boss && !opts.scripted && e.ai && !e.tags.has('cutscene') && TUNING.pending && this.countNear(p) >= this.cap;
    this.list.push(e);
    e.object3d.name = `enemy:${def.id}#${e.id}`;
    ctx.scene.add(e.object3d);
    if (held) {
      e.dormant = true; e.hurtable = false; e.object3d.visible = false;
      this.pending.push(e);
    } else this._activate(e, opts.id);
    e.snap();
    if (opts.scripted) e.setScripted(true);
    if (opts.alerted && !held) { e.alerted = true; if (e.ai && !e.scripted) e.setState('chase'); }
    if (def.boss) { this.boss = /** @type {Boss} */ (e); e.start(); }
    e.loadVisual();
    ctx.bus.emit(E.ENEMY_SPAWNED, { enemy: e });
    return e;
  }

  /**
   * Spawn a wave. `list` entries: [type, count = 1, at?, spread?, opts?] (Appendix B.1 zones: at = [x, z] centre,
   * spread = scatter radius) or [type, count, opts] (arena waves), or {type, count, at, spread, ...opts}.
   * `points` (Vector3 / [x, z] / anchor names) are used round-robin for entries without `at`; members sharing a point
   * fan out on a golden-angle spiral. Returns the spawned enemies.
   * @param {any[]} list @param {any[]|any} [points]
   */
  spawnWave(list, points = []) {
    const ctx = this.ctx, out = [];
    const pts = (Array.isArray(points) && !(points.length && typeof points[0] === 'number') ? points : [points])
      .map((q) => toPos(ctx, q, new THREE.Vector3())).filter(Boolean);
    let k = 0;
    for (const raw of list ?? []) {
      const entry = Array.isArray(raw) ? raw : [raw.type, raw.count ?? 1, raw.at, raw.spread, raw];
      const [type, n = 1] = entry;
      let at = null, spread = 0, o = {};
      for (const x of entry.slice(2)) {
        if (Array.isArray(x) || (x && typeof x === 'object' && (typeof x.x === 'number' || x.pos)) || typeof x === 'string') { if (!at) at = x; }
        else if (typeof x === 'number') spread = x;
        else if (x && typeof x === 'object') o = x;
      }
      const centre = at ? toPos(ctx, at, new THREE.Vector3()) : null;
      for (let i = 0; i < n; i++) {
        const c = centre ?? pts[k % Math.max(1, pts.length)] ?? ctx.player?.pos ?? _v.set(0, 0, 0);
        const ring = centre ? i : Math.floor(k / Math.max(1, pts.length));
        const r = centre ? (n > 1 ? spread * Math.sqrt((i + 0.5) / n) : 0) : 0.9 * ring;
        const a = (centre ? i : k) * GOLDEN + (centre ? ctx.rng() * 0.6 : 0);
        const pos = new THREE.Vector3(c.x + Math.sin(a) * r, Number.isFinite(c.y) ? c.y : NaN, c.z + Math.cos(a) * r);
        const { type: _t, count: _c, at: _a, spread: _s2, ...rest } = o;
        out.push(this.spawn(type, pos, rest));
        k++;
      }
    }
    return out;
  }

  /**
   * World request (shader warm-up): build hidden-from-the-game, dressed stand-ins of `list` ([{ type, opts }]) on a
   * ring around `at` — not in `list`, not registered as actors, no `enemy:spawned`, AI off, the alert "!" showing —
   * and resolve to a cleanup function once their models are dressed (bounded wait). Cleanup takes them out of the
   * scene; their materials stay alive (programs kept) until the level unloads. Bosses build as plain stand-ins (no
   * boss:start).
   * @param {{type: string, opts?: object}[]} list @param {{x: number, y?: number, z: number}} at
   * @returns {Promise<() => void>}
   */
  async prewarm(list, at) {
    const ctx = this.ctx, made = [], n = Math.max(1, list?.length ?? 0), W = M2.prewarm;
    (list ?? []).forEach(({ type, opts } = {}, i) => {
      try {
        const def = resolveEnemyDef(type);
        if (def.unknown) return;
        const a = (i / n) * Math.PI * 2;
        const pos = new THREE.Vector3(at.x + Math.sin(a) * W.ring, at.y ?? 0, at.z + Math.cos(a) * W.ring);
        const e = new Enemy(ctx, { ...def, boss: false }, { ...(opts ?? {}), pos, facing: a + Math.PI, ai: false });
        e.ai = false; e.hurtable = false; e.tags.add('warm');
        e.object3d.name = `warm:${def.id}`;
        ctx.scene?.add(e.object3d);
        e.loadVisual();
        made.push(e);
      } catch (err) { console.warn(`[enemies] prewarm ${type} failed`, err); }
    });
    const ready = (e) => e.disposed || (e.def.model && !e.def.procedural ? !!e.anim : !!e.visual);
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    while (made.length && !made.every(ready) && now() - t0 < W.timeout) await new Promise((res) => setTimeout(res, 30));
    for (const e of made) {
      e.bangT = TUNING.bang.dur;
      try { e.render(1, 1 / 60); } catch { /* not dressed in time */ }
      e.object3d.traverse((o) => { if (o.isMesh && !o.userData.sharedProp) o.castShadow = true; });
    }
    return () => {
      for (const e of made) { e.object3d.removeFromParent(); this._warmKeep.push(e); }
      made.length = 0;
    };
  }

  /** Remove an enemy for good (idempotent). */
  despawn(e) {
    if (!e) return;
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    const j = this.pending.indexOf(e);
    if (j >= 0) this.pending.splice(j, 1);
    if (this.boss === e) this.boss = null;
    this.ctx.combat?.tokens?.release?.(e);
    this.ctx.actors.unregister(e);
    if (!e.disposed) e.dispose();
  }

  /** Despawn everything (level unload, tests). */
  clear() {
    for (const e of [...this.list]) this.despawn(e);
    this.pending.length = 0;
    for (const d of this.debris) d.obj.removeFromParent();
    this.debris.length = 0;
    this.boss = null;
    this.behind = null;
    this.pinThief = null;
    this.webs.clear();
    for (const e of this._warmKeep.splice(0)) if (!e.disposed) e.dispose();
  }

  /** Pack alert: idle / patrolling enemies within `r` of `pos` join the fight after a short, staggered beat. */
  alertNear(pos, r = TUNING.groupAlertRadius, from = null) {
    if (!pos) return;
    for (const e of this.list) {
      if (e === from || !e.alive || e.dormant || e.alerted || !e.ai || e.scripted) continue;
      if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) > r) continue;
      this.wakeUp(e);
      e.wake(rangeOf(this.ctx.rng, TUNING.groupAlertDelay));
    }
  }

  /** §7.7 Meow: unalerted enemies within the aggro radius turn toward her and alert. */
  onMeow(pos) {
    if (!pos) return;
    const r = PLAYER.meow.aggroRadius;
    for (const e of this.list) {
      if (e.alive && !e.dormant && e.def.onMeow) e.def.onMeow(e, pos);     // B2 P3: only the real Cacklejaw answers
      if (!e.alive || e.dormant || e.alerted || !e.ai || e.scripted) continue;
      if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) > r) continue;
      this.wakeUp(e);
      e.facing = Math.atan2(pos.x - e.pos.x, pos.z - e.pos.z);
      e.alert();
    }
  }

  /** A cutscene starts: free enemies drop their attacks (no telegraph freezes on screen, tokens return). */
  interruptAll() {
    for (const e of this.list) if (!e.scripted && e.alive && !e.dormant) e.interrupt?.();
  }

  /**
   * §10.1: a defeated enemy's helmet pops off spinning. `obj` leaves its bone (world transform kept) and flies up and
   * away from the hit, bounces once, then shrinks away. Visual only.
   * @param {THREE.Object3D} obj @param {Enemy} e @param {THREE.Vector3|null} [dir]
   */
  spawnDebris(obj, e, dir = null, o = {}) {
    const scene = this.ctx.scene;
    if (!obj || !scene) return;
    obj.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(), base = new THREE.Vector3();
    obj.matrixWorld.decompose(pos, _q, base);
    obj.removeFromParent();
    obj.position.copy(pos); obj.quaternion.copy(_q); obj.scale.copy(base);
    scene.add(obj);
    const h = TUNING.helmet, rng = this.ctx.rng;
    const dx = dir?.x ?? rng.range(-1, 1), dz = dir?.z ?? rng.range(-1, 1), dl = Math.hypot(dx, dz) || 1;
    const side = (o.side ?? h.side) * (0.7 + rng() * 0.6), a = rng.range(-0.5, 0.5);
    const vx = (dx / dl) * Math.cos(a) - (dz / dl) * Math.sin(a), vz = (dz / dl) * Math.cos(a) + (dx / dl) * Math.sin(a);
    const vel = new THREE.Vector3(vx * side, (o.up ?? h.up) * (0.85 + rng() * 0.3), vz * side);
    const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(0.2, 1), rng.range(-1, 1)).normalize();
    this.debris.push({ obj, vel, axis, spin: (o.spin ?? h.spin) * (0.8 + rng() * 0.4), t: 0, life: o.life ?? h.life, base, bounced: false, flutter: !!o.flutter });
  }

  _updateDebris(dt) {
    if (!this.debris.length || !(dt > 0)) return;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], o = d.obj;
      d.t += dt;
      d.vel.y -= GRAVITY * dt;
      o.position.addScaledVector(d.vel, dt);
      const g = this._groundAt(o.position.x, o.position.z);
      if (o.position.y < g + 0.05 && d.vel.y < 0) {
        o.position.y = g + 0.05;
        if (!d.bounced) { d.bounced = true; d.vel.y *= -0.35; d.vel.x *= 0.5; d.vel.z *= 0.5; d.spin *= 0.4; }
        else { d.vel.set(0, 0, 0); d.spin *= 0.8; }
      }
      o.quaternion.multiply(_q.setFromAxisAngle(d.axis, d.spin * dt));
      const left = d.life - d.t, k = left < TUNING.die.shrink ? Math.max(0.001, left / TUNING.die.shrink) : 1;
      o.scale.copy(_s.copy(d.base).multiplyScalar(k));
      if (d.t >= d.life) { o.removeFromParent(); this.debris.splice(i, 1); }
    }
  }

  /**
   * Perch for a `{ y }` spawn: the nearest walkable top (wall, cart bed, hay bale) whose height above the terrain is
   * within [y × minFrac, y + slack], searched on rings out to TUNING.perch.search m. Moves `p` onto it and returns
   * true; false when the level has nothing there (the shooter then hovers at ground + y, as before).
   * @param {THREE.Vector3} p in/out @param {number} h requested height above the terrain
   */
  findPerch(p, h) {
    const ph = this.ctx.physics;
    if (typeof ph?.groundAt !== 'function' || !(h > 0)) return false;
    const P = TUNING.perch, x0 = p.x, z0 = p.z;
    for (let r = 0; r <= P.search + 1e-6; r += P.ring) {
      const n = r === 0 ? 1 : Math.max(8, Math.ceil((Math.PI * 2 * r) / P.arc));
      const a0 = Math.atan2(-x0, -z0);                       // deterministic start angle per spot
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2, x = x0 + Math.sin(a) * r, z = z0 + Math.cos(a) * r;
        const t = ph.heightAt?.(x, z) ?? 0, top = ph.groundAt(x, z, t + h + P.slack);
        if (top - t >= h * P.minFrac && top - t <= h + P.slack) { p.set(x, top, z); return true; }
      }
    }
    return false;
  }

  _groundAt(x, z, fromY) {
    const ph = this.ctx.physics;
    if (!ph) return 0;
    if (fromY !== undefined && typeof ph.groundAt === 'function') return ph.groundAt(x, z, fromY + 0.25);
    return typeof ph.heightAt === 'function' ? ph.heightAt(x, z) : 0;
  }

  _activate(e, id) {
    e.dormant = false;
    e.object3d.visible = true;
    if (e.alive && !e.scripted && e.def.hurtable !== false) e.hurtable = true;
    this.ctx.actors.register(e, id ?? e.spawnOpts?.id);
  }

  /** Wake held spawns (oldest first) whose fight has a free slot, each with the arena spawn poof. */
  _drainPending() {
    for (let i = 0; i < this.pending.length; i++) {
      const e = this.pending[i];
      if (!e.alive || e.disposed) { this.pending.splice(i--, 1); continue; }
      if (this.countNear(e.pos) >= this.cap) continue;
      this.pending.splice(i--, 1);
      this._activate(e);
      e.snap();
      this.ctx.bus.emit(E.BURST, { kind: 'spawn', position: e.pos.clone() });
    }
  }

  /**
   * World request (§18 budget): a pre-placed enemy that isn't in a fight and is far from her (and from the camera)
   * sleeps — no AI, no mixer, no draw — until she comes near (hysteresis), it is alerted (pack / Meow) or a cutscene
   * takes it. Arena / boss / runner spawns never sleep.
   * Pure decision; exported via the class for tests.
   */
  shouldSleep(e, p) {
    if (!p?.pos || e.alerted || e.scripted || !e.ai || e.def.boss || e.bossAdd || e.objectiveRunner || e.stateName === 'die'
      || e.spawnOpts?.arena || e.tags.has('cutscene') || e.wakeT > 0) return false;
    let d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    const cam = this.ctx.camera?.position;                     // a cutscene / shot camera near it keeps it awake too
    if (cam) d = Math.min(d, Math.hypot(e.pos.x - cam.x, e.pos.z - cam.z));
    const S = M2.sleep;
    return e.asleep ? d > S.dist - S.hysteresis : d > S.dist;
  }

  _sleepCheck(e, dt) {
    if ((e._sleepT = (e._sleepT ?? 0) - dt) > 0) return e.asleep;
    e._sleepT = M2.sleep.every;
    const want = this.shouldSleep(e, this.ctx.player);
    if (want !== !!e.asleep) {
      e.asleep = want;
      e.object3d.visible = !want;
      if (want) { e.vel.set(0, 0, 0); e.endTelegraph(); e.releaseToken(); }
      else e.snap();
    }
    return e.asleep;
  }

  /** Wake a sleeping enemy now (an alert reached it). */
  wakeUp(e) {
    if (!e?.asleep) return;
    e.asleep = false; e._sleepT = M2.sleep.every;
    e.object3d.visible = true;
    e.snap();
  }

  update(dt) {
    const g = this.ctx.game;
    if (this.pending.length) this._drainPending();
    const it = this._iter;
    it.length = 0;
    for (let i = 0; i < this.list.length; i++) it.push(this.list[i]);
    for (let i = 0; i < it.length; i++) {
      const e = it[i];
      if (e.disposed || e.dormant || !g.simActive(e)) continue;
      if (this._sleepCheck(e, dt)) continue;
      e.update(dt);
    }
    it.length = 0;
    if (g.mode === 'play' || g.mode === undefined) {
      this.webs.update(dt);
      tickSlow(this.ctx.player, dt);                          // spider slows until the player owns applySlow
    }
  }

  render(alpha, dt) {
    for (let i = 0; i < this.list.length; i++) { const e = this.list[i]; if (!e.dormant && !e.asleep) e.render(alpha, dt); }
    const vdt = visualDt(this.ctx, dt);
    this._updateDebris(vdt);
    this.webs.render(vdt);
  }

  dispose() {
    this.clear();
    this.webs.dispose();
    for (const off of this._offs) off?.();
    this._offs.length = 0;
  }
}
