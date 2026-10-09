// src/fx/FX.js  (owner: fx) — the `ctx.fx` service (GAME_DESIGN §19.3) and the visual half of the §8.2 juice table.
// Visuals only: combat owns hitstop / shake / rumble / the parry slow-mo, the camera owns the holy FOV punch, enemies
// own their white hit flash, squash and the helmet pop (requests/combat.md). fx keys everything else off bus events.
//
// Frozen contract (§19.3):
//   burst(kind, pos, opts)           one-shot effect (kinds: BURST_KINDS); also via `fx:burst` {kind, position, color?, count?}
//   telegraph(desc) → id              draw a §8.1 telegraph (also via `combat:telegraph`; ended by `combat:telegraphEnd`)
//   holy(actor, 0..1)                 holy glow level (sparkles, warm light, bloom; forwarded to the actor's own aura)
//   mistRing(center, r, opts) → handle { dissolve(sec), dispose(sec), remove(), alive }   (fog walls; rect via opts.size)
//   horde(on, anchor, opts)           instanced hyena silhouettes (Horde.js: 'march' | 'mill' | 'flee' | false)
// Additive helpers: telegraphEnd(id), bloomSpike(peak, dur), fovPunch(deg, dur), poof(pos, opts),
// damageNumber(pos, text, style), setAmbient(preset | null), clear(), stats().
// M2 additions: shockwave(pos, opts), crack(pos, dir, opts), webPatch(pos, opts) -> handle, lantern(at, opts) -> handle,
// purchase(opts), jeerFog(enemy, on, opts), repairSite(pos); automatic: jeer fog (enemy:jeer), theft loot (item:stolen /
// item:returned / a stealer despawning with loot), jelly split / pop (enemy:died + combat:hit popsSlime), The Line
// repair sparkles (objective:progress id 'line'), the Golden Hour sun rays (player:golden, sunburst).
//
// Systems: update(dt) runs in the fixed step (telegraph timers, sim-timed casts); render(alpha, frameDt) draws with the
// visual dt (0 while hitstop / the pause menu, scaled by slow motion). Two pooled particle draw calls, one marks batch,
// one trail, decal / aim-line pools, mist cards, ambient motes and the horde: every effect is pooled, nothing allocates
// per frame.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { ATTACKS, JUICE, PLAYER } from '../core/config.js';
import { Particles, SHAPE, FADE, GROW } from './Particles.js';
import { Marks, MARK } from './Marks.js';
import { SwordTrail } from './SwordTrail.js';
import { DamageNumbers, formatDamage, formatHeal } from './DamageNumbers.js';
import { Telegraphs } from './Telegraphs.js';
import { HolyFX } from './HolyFX.js';
import { Poof, HelmetPops, DEBRIS_KINDS, DEBRIS_ALIAS, helmetFor } from './Poof.js';
import { MistCards, AMBIENT_DENSITY } from './MistCards.js';
import { Horde } from './Horde.js';
import { ScreenFX } from './ScreenFX.js';
import { Ambient, motesFor } from './Ambient.js';
import { Shockwaves, slamColor } from './Shockwaves.js';
import { WebPatches } from './WebPatches.js';
import { SunRays } from './SunRays.js';
import { Lanterns } from './Lanterns.js';
import { Encounters } from './Encounters.js';
import { ShopSparkle } from './ShopSparkle.js';
import { toVec3, resolveActor, resolveAnchor, isActor, actorWorldPos, headPoint, weaponPoint, groundY, visualDt } from './util.js';

/** Every `burst` kind fx draws (anything else falls back to a sparkle). */
export const BURST_KINDS = Object.freeze(['poof', 'hit', 'heavyHit', 'stars', 'spark', 'sparks', 'sparkle', 'sparkles', 'gold', 'dust',
  'dustRing', 'splash', 'heart', 'hearts', 'heal', 'spawn', 'spawnBones', 'smoke', 'helmet', 'fish', 'ring', 'confetti', 'shatter',
  'holy', 'sunburst', 'flash', 'choke', 'shockwave', 'slam', 'crack', 'jellySplit', 'jellyPop', 'jellySlam', 'web', 'webCut', 'stealerPoof',
  'purchase', 'lanternLight', ...DEBRIS_KINDS, ...Object.keys(DEBRIS_ALIAS)]);

/** Mist-card budget per quality preset (art.md §9.2: 30–60). */
export const MIST_COUNT = Object.freeze({ low: 24, med: 44, high: 56 });

const HOLY_IDS = new Set(['holy', 'sunburst', 'holyWave']);
/** Attacks that pop a Gloomjelly without splitting it (§10.3 jelly `popsSlime`). */
const POP_IDS = new Set(['bright', 'holy', 'holyWave', 'gleam', 'sunburst']);

/** Did this (killing) hit pop a jelly instead of splitting it? (pure) */
export const popsSlime = (h) => !!h && (h.popsSlime === true || POP_IDS.has(h.attackId));

/** Gloomjelly size key from an enemy type id / actor (pure): 'jelly_giant' -> 'GIANT', 'jelly_l' -> 'L', ... default 'M'. */
export function jellySize(type, e = null) {
  const s = String(e?.size ?? e?.sizeKey ?? '').toUpperCase();
  if (['GIANT', 'L', 'M', 'S'].includes(s)) return s;
  const m = /^jelly_(giant|l|m|s)$/i.exec(String(type ?? ''));
  return m ? m[1].toUpperCase() : 'M';
}
export const JELLY_SCALE = Object.freeze({ GIANT: 2.0, L: 1.35, M: 1.0, S: 0.7 });

const facingDir = (a) => ({ x: Math.sin(a.facing ?? 0), z: Math.cos(a.facing ?? 0) });

/**
 * The §8.2 juice row fx draws for a `combat:hit` (pure; unit-tested). Returns null when fx draws nothing.
 * kinds: 'light' (4 stars + number), 'heavy' (8 stars + dust ring + number), 'holy' (gold stars + number), 'block'
 * (white sparks at her guard), 'blockNpc' (sparks on a shield), 'parryNpc' (small gold ring), 'hurt' (she took damage),
 * 'break' (her guard broke: shards + hurt).
 * @param {any} h combat:hit payload @param {any} player
 */
export function hitJuice(h, player) {
  if (!h || !h.target) return null;
  const toPlayer = !!player && h.target === player;
  if (h.parried) return toPlayer ? null : { kind: 'parryNpc', stars: 0, dust: false, number: null };
  if (h.blocked) return { kind: toPlayer ? 'block' : 'blockNpc', stars: 0, dust: false, number: null };
  if (!(h.damage > 0)) return null;
  if (toPlayer) return { kind: h.broke ? 'break' : 'hurt', stars: 0, dust: false, number: null };
  const holy = HOLY_IDS.has(h.attackId);
  const heavy = holy || !!h.heavy || ATTACKS[h.attackId]?.heavy === true;
  const ally = h.target.faction === 'ally' || h.target.faction === 'player';
  return {
    kind: holy ? 'holy' : heavy ? 'heavy' : 'light',
    stars: heavy ? 8 : 4,
    dust: heavy && !holy,
    crit: !!h.crit,
    number: ally ? null : formatDamage({ damage: h.damage, crit: h.crit, heavy }),
  };
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const GOLD = new THREE.Color('#FFD34D'), STAR_COL = new THREE.Color('#FFE88A');

export class FX {
  constructor(ctx) {
    this.ctx = ctx;
    this._teleId = 1000000;      // ids for telegraphs started directly through ctx.fx (enemies use their own)
    this.ready = false;
    this.particles = null; this.marks = null; this.trail = null; this.numbers = null; this.telegraphs = null;
    this.holyFx = null; this.poofs = null; this.helmets = null; this.mist = null; this.hordeFx = null; this.screen = null;
    this.ambient = null;
    this.shock = null; this.webs = null; this.sunRays = null; this.lanterns = null; this.encounters = null; this.shop = null;
    this._pops = new WeakMap();  // enemy -> popsSlime of its killing hit (jelly pop vs split)
    this._goldT = 0;
    this.dizzy = new Map();      // actor → { t, dur, gold }
    this._later = [];            // sim-timed calls { t, fn }
    this._warm = 0;              // frames left to draw the shader warm-up (requests/player.md: first-use stalls)
    this._warmSaved = [];        // [object, drawStart, drawCount, instanceCount, …] restored after the frame
    this.warmups = 0;            // warm-up frames drawn (tests/smoke)
    this._offs = [];
    this._poofAt = { t: -1, x: 0, z: 0 };
    this.levelId = null;
    this.counts = { bursts: 0, hits: 0, poofs: 0, parries: 0, blocks: 0, hurts: 0, numbers: 0 };
  }

  async init() {
    const ctx = this.ctx, scene = ctx.scene, bus = ctx.bus;
    const rng = ctx.rng?.fork ? ctx.rng.fork('fx') : Math.random;
    this.rng = rng;
    const ground = (x, z, fb) => groundY(ctx, x, z, fb);
    this.particles = new Particles({ rng, groundY: ground });
    this.particles.attach(scene);
    this.marks = new Marks(128);
    scene.add(this.marks.mesh);
    this.trail = new SwordTrail();
    scene.add(this.trail.mesh);
    this.numbers = new DamageNumbers(ctx);
    this.numbers.init();
    this.telegraphs = new Telegraphs(ctx, this.marks);
    this.telegraphs.init(scene);
    this.screen = new ScreenFX(ctx);
    this.screen.init();
    this.holyFx = new HolyFX(ctx, { particles: this.particles, marks: this.marks, screen: this.screen, rng });
    this.holyFx.init(scene);
    this.helmets = new HelmetPops({ rng, groundY: ground });
    this.helmets.attach(scene);
    this.poofs = new Poof({ particles: this.particles, helmets: this.helmets });
    this.mist = new MistCards(ctx);
    this.mist.init(scene, MIST_COUNT[ctx.quality?.id] ?? MIST_COUNT.med);
    this.hordeFx = new Horde(ctx);
    this.hordeFx.init(scene, ctx.quality);
    this.ambient = new Ambient(ctx);
    this.ambient.init(scene);
    this.shock = new Shockwaves(ctx, { particles: this.particles, groundY: ground, rng });
    this.shock.init(scene);
    this.webs = new WebPatches(ctx, { particles: this.particles, groundY: ground, rng });
    this.webs.attach(scene);
    this.sunRays = new SunRays(ctx, rng);
    this.sunRays.attach(scene);
    this.lanterns = new Lanterns(ctx, { particles: this.particles, marks: this.marks, rng });
    this.lanterns.attach(scene);
    this.encounters = new Encounters(ctx, { particles: this.particles, marks: this.marks, holyFx: this.holyFx, rng, screen: this.screen });
    this.shop = new ShopSparkle(rng);
    this._applyQuality(ctx.quality);
    this._offs.push(ctx.game?.addFrameHook?.(() => { this.screen.afterFrame(); this._warmEnd(); }) ?? (() => {}));
    this._warm = 1;

    const on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    on(E.BURST, (p) => { if (p) this.burst(p.kind, p.position ?? p.pos, p); });
    on(E.TELEGRAPH, (p) => { if (p) this.telegraphs.start(p, p.id ?? this._teleId++); });
    on(E.TELEGRAPH_END, (p) => { if (p) this.telegraphs.end(p.id); });
    on(E.HIT, (h) => this._onHit(h));
    on(E.PLAYER_PARRY, (p) => this._onParry(p));
    on(E.PLAYER_HOLY, (p) => this._onHoly(p));
    on(E.PLAYER_SWING, (p) => { if (p?.attackId === 'sunburst') this._afterSim(ATTACKS.sunburst.active?.[0] ?? 0.2, () => this._sunburst()); });
    on(E.ENEMY_JEER, (p) => { if (isActor(p?.enemy)) this.encounters.jeer(p.enemy, !!p.on, p); });
    on(E.ITEM_STOLEN, (p) => this.encounters.stolen(p));
    on(E.ITEM_RETURNED, (p) => this.encounters.returned(p));
    on(E.OBJECTIVE, (p) => this.encounters.objective(p));
    on(E.PLAYER_CHARGE, (p) => this.holyFx.chargeEvent(ctx.player, p));
    on(E.PLAYER_GOLDEN, (p) => {
      if (p?.on && ctx.player) { this.holyFx.goldenOn(actorWorldPos(ctx.player, _p)); this.sunRays.open(ctx.player); this.bloomSpike(1.25, 0.6); this._goldT = 1; }
      else if (!p?.on) this.sunRays.close();
    });
    on(E.PLAYER_DAMAGED, (p) => { if ((p?.amount ?? 0) > 0) { this.screen.hurt(); this.counts.hurts++; } });
    on(E.PLAYER_HEALED, (p) => this._onHeal(p));
    on(E.PLAYER_DODGE, () => { const pl = ctx.player; if (pl) this.poofs.dust(actorWorldPos(pl, _p), 1, 6); });
    on(E.PLAYER_LAND, (p) => { const pl = ctx.player; if (pl && (p?.impact ?? 0) > PLAYER.hardLandSpeed * 0.75) this.poofs.dustRing(actorWorldPos(pl, _p), 0.8); });
    on(E.PLAYER_PERFECT_DODGE, (p) => this._onPerfectDodge(p));
    on(E.PLAYER_GRIT, (p) => { if (p?.broken && ctx.player) this._guardBreak(ctx.player); });
    on(E.PLAYER_STILL_STANDING, () => this._stillStanding());
    on(E.PLAYER_MEOW, (p) => this._meow(p));
    on(E.ENEMY_DIED, (p) => this._onEnemyDied(p));
    on(E.ENEMY_CHOKE, (p) => { if (isActor(p?.enemy)) { this.burst('choke', p.enemy); this.encounters.jeer(p.enemy, false); } });
    on(E.REFLECT, (p) => { const pos = p?.projectile?.pos ?? p?.projectile?.position; if (pos) this.burst('spark', pos, { color: '#FFD34D', count: 12 }); });
    on(E.BOSS_DIZZY, (p) => { if (isActor(p?.boss)) { if (p.dizzy) this.dizzyFor(p.boss, Infinity, { gold: true }); else this.dizzy.delete(p.boss); } });
    on(E.BOSS_DEFEATED, (p) => { if (p?.boss) this.dizzy.delete(p.boss); });
    on(E.ITEM_PICKUP, (p) => this._onPickup(p));
    on(E.LEVEL_UNLOAD, () => this.clear());
    on(E.LEVEL_LOADED, (p) => { this._onLevel(p?.id); this._warm = 1; });
    on(E.ENV_CHANGED, (p) => { if (this.levelId) this.ambient.set(motesFor(this.levelId, p?.grade ?? ctx.env?.grade)); });
    on(E.QUALITY, (p) => { this._applyQuality(p?.preset ?? ctx.quality); this._warm = 1; });
    on(E.MEME_CAM, (p) => { this.mist.speedMul = p?.on ? (PLAYER.memeCam.mist ?? 2) : 1; });
    if (ctx.levels?.current?.id) this._onLevel(ctx.levels.current.id);
    this.ready = true;
  }

  // ================================================================== §19.3 contract
  /**
   * One-shot effect. `pos`: Vector3, actor (or cutscene actor id), level anchor name, [x, y, z] / [x, z].
   * `opts`: { count, color, scale, type (enemy type for poof debris), dir, height }.
   */
  burst(kind, pos, opts = {}) {
    if (!this.particles) return;
    const ref = typeof pos === 'string' ? (resolveActor(this.ctx, pos) ?? pos) : pos;
    const actor = isActor(ref) ? ref : null;
    if (actor) { actorWorldPos(actor, _p); }
    else if (typeof ref === 'string') { if (resolveAnchor(this.ctx, ref, _p) === null) return; }
    else if (!toVec3(ref, _p)) return;
    if (!Number.isFinite(_p.x + _p.y + _p.z)) return;
    this.counts.bursts++;
    const P = this.particles, S = opts.scale ?? 1, n = (d) => Math.max(1, Math.round(opts.count ?? d));
    const h = actor ? (actor.height ?? 1) * (actor.object3d?.scale?.y ?? 1) : 1;
    const mid = () => { if (actor) _p.y += h * 0.55; return _p; };
    switch (kind) {
      case 'poof': {
        if (!actor && this._isDupPoof(_p)) return;
        const gy = groundY(this.ctx, _p.x, _p.z, _p.y - 0.5);
        const centre = !actor && _p.y - gy > 0.25;
        this.poof(_p, { centre, height: actor ? h : centre ? (_p.y - gy) * 2 : 0.7 * S, scale: actor ? 1 : S, type: opts.type, color: opts.color, fish: opts.fish });
        return;
      }
      case 'hit': case 'stars': this._stars(mid(), opts.dir ?? null, n(4), S, opts.color); return;
      case 'heavyHit': this._stars(mid(), opts.dir ?? null, n(8), S * 1.25, opts.color); this.poofs.dustRing(actor ? actorWorldPos(actor, _q) : _p, S); return;
      case 'spark': case 'sparks': this._sparks(mid(), opts.dir ?? null, n(10), opts.color ?? '#F4F8FF', S); return;
      case 'sparkle': case 'sparkles': case 'gold':
        P.burst(mid(), { additive: true, n: n(8), shape: SHAPE.STAR4, color: opts.color ?? (kind === 'gold' ? '#FFD34D' : '#FFF1C4'), intensity: 2.4,
          size: [0.1 * S, 0.2 * S], sizeEnd: 0.2, life: [0.5, 0.9], speed: [0.6, 1.6], up: 0.8, spread: Math.PI, drag: 2.2, gravity: -0.4,
          fade: FADE.TWINKLE, jitter: 0.25 * S });
        return;
      case 'dust': this.poofs.dust(_p, S, n(5)); return;
      case 'dustRing': this.poofs.dustRing(_p, S); return;
      case 'splash': this._splash(_p, S, n(14)); return;
      case 'heart': case 'hearts':
        P.burst(actor ? _p.setY(_p.y + h * 1.1) : _p, { n: n(1), shape: SHAPE.HEART, color: opts.color ?? '#FF8FB1', size: [0.18 * S, 0.24 * S], sizeEnd: 1.25,
          grow: GROW.BACK, fade: FADE.HOLD, life: [0.9, 1.2], speed: [0.2, 0.5], up: 0.9, drag: 1.5, jitter: 0.12 });
        return;
      case 'heal':
        P.burst(mid(), { additive: true, n: n(10), shape: SHAPE.STAR4, color: opts.color ?? '#7FD38A', intensity: 1.8, size: [0.1, 0.18], sizeEnd: 0.3,
          life: [0.6, 1.0], speed: [0.3, 0.8], up: 1.4, drag: 1.2, fade: FADE.TWINKLE, jitter: 0.35 });
        P.burst(_p, { n: 2, shape: SHAPE.HEART, color: '#7FD38A', size: [0.14, 0.18], sizeEnd: 1.1, grow: GROW.BACK, fade: FADE.HOLD,
          life: [0.8, 1.0], speed: [0.1, 0.3], up: 1.0, drag: 1.5, jitter: 0.2 });
        return;
      case 'spawn': this.poofs.spawn(_p, S); return;
      case 'spawnBones': this.poofs.spawn(_p, S); _p.y += 0.4; this.poofs.debris(_p, 'bones', S); return;
      case 'smoke':
        P.burst(mid(), { n: n(6), shape: SHAPE.PUFF, color: opts.color ?? '#8E8C86', tint: 0.08, alpha: 0.7, size: [0.25 * S, 0.4 * S], sizeEnd: 2.2,
          grow: GROW.OUT, fade: FADE.HOLD, life: [0.7, 1.1], speed: [0.3, 0.8], up: 0.8, drag: 2, jitter: 0.25 * S });
        return;
      case 'choke':
        if (actor) headPoint(actor, _p, -0.1);
        P.burst(_p, { n: n(4), shape: SHAPE.PUFF, color: '#B9B2A4', alpha: 0.75, size: [0.12, 0.18], sizeEnd: 2.0, grow: GROW.OUT, fade: FADE.HOLD,
          life: [0.5, 0.8], speed: [0.6, 1.2], dir: _up, spread: 1.0, drag: 3, jitter: 0.1 });
        P.burst(_p, { additive: true, n: 3, shape: SHAPE.STAR5, color: '#FFE88A', intensity: 1.6, size: [0.1, 0.14], sizeEnd: 0.5, life: [0.5, 0.7],
          speed: [1.0, 1.6], dir: _up, spread: 0.8, gravity: 4, spin: 6, fade: FADE.HOLD });
        return;
      case 'helmet': this.helmets.pop(actor ? _p.setY(_p.y + h * 0.95) : _p, opts.style ?? helmetFor(opts.type ?? actor?.def?.id) ?? 'kettle', 0.34 * S, opts.dir ?? null); return;
      case 'fish': this._fish(mid(), n(4)); return;
      case 'ring': {      // a flat shockwave ring on the ground
        const gy = groundY(this.ctx, _p.x, _p.z, _p.y);
        this.holyFx.arc({ x: _p.x, y: (actor ? _p.y : Math.max(gy, _p.y - 0.3)) + 0.06, z: _p.z, ring: true, r0: 0.3 * S, r1: 2.2 * S, thick: 0.22 * S,
          life: 0.4, grow: 0.35, intensity: 1.1, color: opts.color ?? '#F4F8FF' });
        return;
      }
      case 'flash': P.single(mid(), { shape: SHAPE.SOFT, color: opts.color ?? '#FFF6DA', intensity: 2.6, size0: 0.4 * S, size1: 1.6 * S, life: 0.16 }); return;
      case 'confetti': this._confetti(mid(), n(24), S); return;
      case 'shatter': this._shards(mid(), n(10), opts.color ?? '#D8E2EC', S); return;
      case 'holy': this.holyFx.cast(actor ? actorWorldPos(actor, _p) : _p, opts.dir ?? null); this.bloomSpike(); return;
      case 'sunburst': { const at = actor ? actorWorldPos(actor, _p) : _p; this.holyFx.sunburst(at); this.sunRays.burst(at); this.bloomSpike(1.3, 0.5); return; }
      case 'shockwave': this.shockwave(actor ? actorWorldPos(actor, _p) : _p, opts); return;
      case 'slam': {
        const at = actor ? actorWorldPos(actor, _p) : _p, r = opts.r ?? 2.5 * S;
        this.shock.thud(at, Math.max(0.6, r / 2.5), opts.flash ?? '#FFE0C8');
        if (opts.shockwave !== false) this.shockwave(at, { r, dur: opts.dur ?? 0.4, speed: opts.speed, color: opts.color ?? opts.style ?? 'red', height: opts.height });
        if (opts.crack) this.crack(at, opts.dir ?? (actor ? facingDir(actor) : null), typeof opts.crack === 'object' ? opts.crack : {});
        return;
      }
      case 'crack': this.crack(actor ? actorWorldPos(actor, _p) : _p, opts.dir ?? (actor ? facingDir(actor) : null), opts); return;
      case 'jellySplit': case 'jellyPop': case 'jellySlam': this._jelly(kind, actor ? actorWorldPos(actor, _p) : _p, S, opts.color); return;
      case 'web': this.webs.splat(mid(), S); return;
      case 'webCut': this.webs.shreds(actor ? actorWorldPos(actor, _p) : _p, S); return;
      case 'stealerPoof': this.encounters.stealerPoof(actor ? actorWorldPos(actor, _p) : _p, S); return;
      case 'purchase': this._purchaseWorld(mid(), S, opts.color); if (opts.el) this.shop.burst({ el: opts.el, color: opts.color }); return;
      case 'lanternLight': this.lanterns.ignite(mid()); return;
      default: {
        if (DEBRIS_KINDS.includes(kind)) { this.poofs.debris(mid(), kind, S, opts.color ?? null, opts.count ?? null); return; }
        const al = DEBRIS_ALIAS[kind];
        if (al) {
          mid();
          this.poofs.debris(_p, al.debris, S, opts.color ?? null, opts.count ?? null);
          this.poofs.dust(_p, 0.8 * S, 4);
          if (al.sparks) this._sparks(_p, _up, 8, '#FFE3A3', S);
          return;
        }
        this.burst('sparkle', _p.clone(), opts);
      }
    }
  }

  /** Draw a §8.1 telegraph; notifies the bus (`combat:telegraph`) so audio / ui react too. Returns its id. */
  telegraph(desc = {}) {
    const id = desc.id ?? this._teleId++;
    const payload = { ...desc, id };
    if (this.ctx.bus) this.ctx.bus.emit(E.TELEGRAPH, payload);
    else this.telegraphs?.start(payload, id);
    return id;
  }

  /** End a telegraph started with `telegraph()` (emits `combat:telegraphEnd`). */
  telegraphEnd(id) { if (id != null) this.ctx.bus.emit(E.TELEGRAPH_END, { id }); }

  /** Holy glow level 0..1 on an actor (or cutscene actor id). */
  holy(actor, level) {
    const a = resolveActor(this.ctx, actor);
    if (a && this.holyFx) this.holyFx.set(a, level);
  }

  /** Mist-card fog wall; returns a handle with dissolve(sec) / dispose(sec) / remove(). */
  mistRing(center, r, opts = {}) {
    if (!this.mist) return { center, r, size: null, alive: false, dissolve() {}, dispose() {}, remove() {} };
    return this.mist.ring(center, r, opts);
  }

  /** Horde silhouettes (see Horde.js): `on` true | 'march' | 'mill' | 'flee' | false. */
  horde(on, anchor, opts = {}) { return this.hordeFx ? this.hordeFx.set(on, anchor, opts) : 'off'; }

  // ================================================================== M2 helpers
  /**
   * Expanding shockwave wall (pug_slam, Laugh Quake, belly flops): `pos` ground centre (or an actor); opts { r (or r1),
   * r0 (0.3), dur (0.4) or speed (m/s), height (0.3), color (a colour or 'red' | 'boss' | 'jeer' | 'goo' | 'gold' | 'white'),
   * dust }. Returns { r0, r1, dur, height } (the timing the visual uses) or null.
   */
  shockwave(pos, opts = {}) {
    if (!this.shock) return null;
    const ref = typeof pos === 'string' ? resolveActor(this.ctx, pos) : pos;
    if (!(isActor(ref) ? actorWorldPos(ref, _v) : toVec3(ref, _v))) return null;
    return this.shock.start(_v, { ...opts, color: slamColor(opts.color ?? opts.style) });
  }

  /** Glowing ground crack from `pos` along `dir` ({x, z}); opts { length (4), width, life (0.5), travel, color }. */
  crack(pos, dir, opts = {}) {
    if (!this.shock || !toVec3(pos, _v)) return;
    this.shock.crack(_v, dir, { ...opts, color: slamColor(opts.color ?? opts.style, '#FF7A3A') });
  }

  /** Spider web patch decal -> handle { alive, pos, r, cut(), remove() }. opts { r (1.0), life (8 s; Infinity = dressing) }. */
  webPatch(pos, opts = {}) {
    if (!this.webs || !toVec3(pos, _v)) return { alive: false, pos: null, r: 0, cut() {}, remove() {} };
    return this.webs.add(_v, opts);
  }

  /** Warm lantern light (CS-04, Lantern Alley) -> handle { lit, alive, pos, light(), out(), set(), remove() }. See Lanterns.js. */
  lantern(at, opts = {}) {
    if (!this.lanterns) return { lit: false, alive: false, pos: null, light() { return this; }, out() { return this; }, set() { return this; }, remove() {} };
    return this.lanterns.add(at, opts);
  }

  /** Shop purchase sparkle: DOM burst over `el` (or client `x`, `y`) and, with `at`, gold coins in the world. */
  purchase(opts = {}) {
    if (!this.shop) return false;
    if (opts.at != null) this.burst('purchase', opts.at, { color: opts.color, scale: opts.scale });
    return this.shop.burst(opts);
  }

  /** Jeer fog on / off for an enemy (automatic from `enemy:jeer`); opts { r (8), dur (cap, 6 s) }. */
  jeerFog(enemy, on, opts = {}) { this.encounters?.jeer(resolveActor(this.ctx, enemy) ?? enemy, on, opts); }

  /** Point The Line's repair sparkles at a position (default: the `winch` anchor). */
  repairSite(pos) { this.encounters?.setRepairSite(pos); }

  // ================================================================== additive helpers
  /** Bloom spike base → peak → base over `dur` real seconds (cutscene `fx.bloomSpike`; capped by reduceFlashes in PostFX). */
  bloomSpike(peak = JUICE.holy.bloom[1], dur = JUICE.holy.bloom[2]) { this.screen?.spike(peak, dur); }

  /** FOV punch (explicit; the camera already punches on player:holy). */
  fovPunch(deg, dur) { this.screen?.fovPunch(deg, dur); }

  /** The cute defeat poof (art.md §8). */
  poof(pos, o = {}) {
    if (!this.poofs || !toVec3(pos, _v)) return;
    this.counts.poofs++;
    this.poofs.poof(_v, o);
    if (o.fish > 0) { _q.copy(_v); if (!o.centre) _q.y += (o.height ?? 1) * 0.5; this._fish(_q, Math.min(6, o.fish)); }
  }

  /** A floating number at a world position (`style`: DamageNumbers.DAMAGE_STYLE key). */
  damageNumber(pos, text, style = 'normal') {
    if (!this.numbers || !toVec3(pos, _v)) return;
    this.counts.numbers++;
    this.numbers.show(_v, String(text), style);
  }

  /** Ambient mote preset ('fluff', 'fireflies', 'embers', 'spores', 'dust', 'ash') or null. */
  setAmbient(name) { this.ambient?.set(name); }

  /** Stun stars circling an actor's head for `sec` (Infinity = until removed; boss Dizzy uses a gold "!"). */
  dizzyFor(actor, sec, { gold = false } = {}) {
    if (!isActor(actor)) return;
    const d = this.dizzy.get(actor);
    if (d) { d.dur = Math.max(d.dur - d.t, sec); d.t = 0; d.gold ||= gold; return; }
    this.dizzy.set(actor, { t: 0, dur: sec, gold });
  }

  /** Drop every transient effect (level unload). Fog walls and the horde go too; holy states reset. */
  clear() {
    this.particles?.clear(); this.trail?.clear(); this.numbers?.clear(); this.telegraphs?.clear(); this.holyFx?.clear();
    this.helmets?.clear(); this.mist?.clearWalls(); this.hordeFx?.clear(); this.screen?.clear();
    this.shock?.clear(); this.webs?.clear(); this.sunRays?.clear(); this.lanterns?.clear(); this.encounters?.clear(); this.shop?.clear();
    this.dizzy.clear(); this._later.length = 0;
  }

  /** Small summary for smoke tests / the debug overlay. */
  stats() {
    return {
      particles: this.particles?.live ?? 0, telegraphs: this.telegraphs?.count ?? 0, telegraphsStarted: this.telegraphs?.started ?? 0,
      byKind: { ...(this.telegraphs?.byKind ?? {}) }, trailSamples: this.trail?.samples ?? 0, trailVisible: !!this.trail?.mesh.visible,
      numbersShown: this.numbers?.shown ?? 0, numbersActive: this.numbers?.active ?? 0, walls: this.mist?.wallCount ?? 0,
      ambientMist: !!this.mist?.ambient?.mesh.visible, motes: this.ambient?.preset ?? null,
      horde: { mode: this.hordeFx?.mode ?? 'off', count: this.hordeFx?.count ?? 0, visible: this.hordeFx?.visibleCount ?? 0 },
      holy: { casts: this.holyFx?.casts ?? 0, flashes: this.holyFx?.flashes ?? 0, fizzles: this.holyFx?.fizzles ?? 0, bloomLevel: this.holyFx?.bloomLevel ?? 0,
        light: this.holyFx?.light?.intensity ?? 0, player: this.ctx.player ? this.holyFx?.level(this.ctx.player) ?? 0 : 0 },
      bloom: this.ctx.postfx?.bloom ?? 0, peakBloom: this.screen?.peakBloom ?? 0, vignette: this.screen?.vignette ?? 0,
      dizzy: this.dizzy.size, marks: this.marks?.count ?? 0, counts: { ...this.counts }, warmups: this.warmups,
      mistLoop: this.mist?.loopW ?? 0,
      m2: {
        shocks: this.shock?.active ?? 0, shocksStarted: this.shock?.started ?? 0, cracks: this.shock?.activeCracks ?? 0, cracksStarted: this.shock?.crackCount ?? 0,
        webs: this.webs?.count ?? 0, websMade: this.webs?.made ?? 0, webCuts: this.webs?.cuts ?? 0, sunRays: this.sunRays?.mode ?? null,
        sunOpened: this.sunRays?.opened ?? 0, sunBursts: this.sunRays?.bursts ?? 0,
        lanterns: this.lanterns?.count ?? 0, lanternsLit: this.lanterns?.litCount ?? 0, lanternLights: this.lanterns?.pool.length ?? 0,
        lanternLightsOn: this.lanterns?.lightsOn ?? 0, ignitions: this.lanterns?.ignitions ?? 0, jeers: this.encounters?.jeerCount ?? 0,
        thieves: this.encounters?.thieves.size ?? 0,
        line: this.encounters ? { active: this.encounters.line.active, pct: this.encounters.line.pct, frozen: this.encounters.line.frozen,
          done: this.encounters.line.done, site: this.encounters.line.site.toArray() } : null,
        counts: { ...(this.encounters?.counts ?? {}) }, shop: this.shop?.shown ?? 0,
      },
    };
  }

  // ================================================================== systems
  update(dt) {
    this.telegraphs?.update(dt);
    for (let i = this._later.length - 1; i >= 0; i--) {
      const l = this._later[i];
      if ((l.t -= dt) <= 0) { this._later.splice(i, 1); try { l.fn(); } catch (e) { console.warn('[fx] delayed effect', e); } }
    }
  }

  render(alpha, frameDt) {
    if (!this.ready) return;
    this._warmEnd();                    // normally done by the frame hook; a no-op when it already ran
    const ctx = this.ctx, dt = visualDt(ctx, frameDt), p = ctx.player;
    this.marks.begin();
    this.particles.update(dt);
    this.helmets.update(dt);
    if (p) this.trail.track(p, dt, { skin: ctx.state?.cosmetics?.sword, golden: !!p.golden });
    this.holyFx.render(dt, frameDt);
    this.screen.holy = this.holyFx.bloomLevel;
    this.screen.golden = !!p?.golden && p.alive !== false;
    this.telegraphs.render(dt);
    this._dizzyMarks(dt);
    this.mist.render(dt);
    this.hordeFx.render(dt);
    this.ambient.render(dt);
    const time = ctx.game?.realTime ?? 0;
    this.shock.render(dt, time);
    this.webs.render(dt);
    this.sunRays.render(dt, time);
    this.lanterns.render(dt, time);
    this.encounters.render(dt, time);
    this._goldenPulse(dt);
    this.numbers.render(dt);
    this.marks.end();
    this.screen.render(frameDt);
    if (this._warm > 0) { this._warm--; this._warmBegin(); }
  }

  /**
   * One representative object per fx shader program (pure list; the first trail, holy charge, Golden Hour ring,
   * telegraph, fog wall or horde would otherwise compile its program mid-fight: requests/player.md).
   */
  warmObjects() {
    return [this.particles?.add.mesh, this.particles?.alpha.mesh, this.marks?.mesh, this.trail?.mesh,
      this.holyFx?.fields[0]?.points, this.holyFx?.arcs[0]?.mesh, this.helmets?.list[0], this.telegraphs?.decals[0]?.mesh,
      this.telegraphs?.lines[0]?.mesh, this.mist?.ambient?.mesh, this.hordeFx?.mesh, this.ambient?.points,
      this.shock?.rings[0]?.mesh, this.shock?.cracks[0]?.mesh, this.webs?.mesh, this.sunRays?.follow.mesh].filter(Boolean);
  }

  /**
   * Shader warm-up: show every hidden fx object for this one frame with an empty draw range, so the real renderer
   * (with the level's fog, lights and the composer's render target) builds its program now — under the loading veil —
   * while nothing is actually drawn. `_warmEnd` (frame hook, after the frame) restores everything.
   */
  _warmBegin() {
    const S = this._warmSaved;
    for (const o of this.warmObjects()) {
      if (o.visible || !o.parent) continue;
      const g = o.geometry;
      S.push(o, g.drawRange.start, g.drawRange.count, g.isInstancedBufferGeometry ? g.instanceCount : -1);
      g.setDrawRange(0, 0);
      if (g.isInstancedBufferGeometry) g.instanceCount = 0;
      o.visible = true;
    }
    if (S.length) this.warmups++;
  }

  _warmEnd() {
    const S = this._warmSaved;
    if (!S.length) return;
    for (let i = S.length - 4; i >= 0; i -= 4) {          // reverse: shared geometries get their original range back last
      const o = S[i], g = o.geometry;
      o.visible = false;
      g.setDrawRange(S[i + 1], S[i + 2]);
      if (S[i + 3] >= 0) g.instanceCount = S[i + 3];
    }
    S.length = 0;
  }

  dispose() {
    for (const off of this._offs) { try { off?.(); } catch { /* ignore */ } }
    this._offs.length = 0;
    this.particles?.dispose(); this.marks?.dispose(); this.trail?.dispose(); this.numbers?.dispose(); this.telegraphs?.dispose();
    this.holyFx?.dispose(); this.helmets?.dispose(); this.mist?.dispose(); this.hordeFx?.dispose(); this.ambient?.dispose(); this.screen?.dispose();
    this.shock?.dispose(); this.webs?.dispose(); this.sunRays?.dispose(); this.lanterns?.dispose(); this.encounters?.clear(); this.shop?.dispose();
    this.dizzy.clear(); this._later.length = 0;
    this.ready = false;
  }

  // ================================================================== event handlers
  _afterSim(sec, fn) { if (sec > 0) this._later.push({ t: sec, fn }); else fn(); }

  _applyQuality(q) {
    if (!q || !this.particles) return;
    this.particles.setBudget(q.particles ?? 2000);
    this.mist.setCount(MIST_COUNT[q.id] ?? MIST_COUNT.med);
    this.ambient.setBudget((q.particles ?? 2000) / 2000);
    if (this.encounters) this.encounters.lowQ = (q.particles ?? 2000) < 1000;
  }

  _onLevel(id) {
    this.levelId = id ?? null;
    const dens = AMBIENT_DENSITY[id] ?? 1;
    this.mist.setAmbient(dens > 0, dens);
    this.ambient.set(motesFor(id, this.ctx.env?.grade));
    // a level without light-casting fx lanterns drops the pooled lantern lights (one less light in every program)
    if (this.lanterns && !this.lanterns.castCount) this.lanterns.dropLights();
  }

  _isDupPoof(pos) {
    const P = this._poofAt, t = this.ctx.game?.time ?? 0;
    return P.t >= 0 && Math.abs(t - P.t) < 0.05 && Math.hypot(pos.x - P.x, pos.z - P.z) < 1.5;
  }

  /** Impact point on a target: chest height, on the attacker's side. */
  _hitPoint(h, out) {
    const T = h.target;
    if (isActor(T)) { actorWorldPos(T, out); out.y += (T.height ?? 1) * (T.object3d?.scale?.y ?? 1) * 0.55; }
    else if (!toVec3(h.position, out)) return null;
    else out.y += 0.6;
    if (h.dir && Number.isFinite(h.dir.x)) { const r = (T?.radius ?? 0.35) * 0.8; out.x -= h.dir.x * r; out.z -= h.dir.z * r; }
    return out;
  }

  _onHit(h) {
    if (h?.killed && isActor(h.target)) this._pops.set(h.target, popsSlime(h));
    const ctx = this.ctx, J = hitJuice(h, ctx.player);
    if (!J) return;
    this.counts.hits++;
    if (!this._hitPoint(h, _p)) return;
    const dir = h.dir && Number.isFinite(h.dir.x) ? _d.set(-h.dir.x, 0.55, -h.dir.z).normalize() : null;
    switch (J.kind) {
      case 'light': case 'heavy': case 'holy': {
        const S = J.kind === 'light' ? 1 : 1.25;
        if (J.kind === 'holy') {
          this.particles.burst(_p, { additive: true, n: 10, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.6, size: [0.14, 0.26], sizeEnd: 0.2,
            life: [0.35, 0.6], speed: [2.5, 4.5], dir, spread: 1.2, drag: 3, fade: FADE.TWINKLE });
        }
        this._stars(_p, dir, J.stars, S, J.kind === 'holy' ? '#FFD34D' : null);
        if (J.crit) this.particles.single(_q.copy(_p).setY(_p.y + 0.15), { shape: SHAPE.STAR8, color: '#FFD34D', intensity: 3, size0: 0.25, size1: 1.1, life: 0.28, fade: FADE.POP, spin: 3 });
        if (J.dust && isActor(h.target)) this.poofs.dustRing(actorWorldPos(h.target, _q), 0.9);
        if (J.number) {
          const T = h.target;
          if (isActor(T)) headPoint(T, _q, 0.12); else _q.copy(_p).setY(_p.y + 0.6);
          this.damageNumber(_q, J.number.text, J.number.style);
        }
        return;
      }
      case 'block': this.counts.blocks++; this._guardSparks(h.target, '#F4F8FF', 10); return;
      case 'blockNpc': this.counts.blocks++; this._sparks(_p, dir, 8, '#F4F8FF', 1); return;
      case 'parryNpc':
        this.particles.single(_p, { shape: SHAPE.RING, color: '#FFD34D', intensity: 2.2, size0: 0.2, size1: 1.2, life: 0.22, grow: GROW.OUT });
        this._sparks(_p, dir, 6, '#FFE3A3', 0.8);
        return;
      case 'break':     // the guard shatter itself is drawn on player:grit {broken} (emitted in the same step)
      case 'hurt':
        this.particles.single(_p, { shape: SHAPE.SOFT, color: '#FFFFFF', intensity: 1.6, size0: 0.35, size1: 0.9, life: 0.1 });
        this.particles.burst(_p, { additive: true, n: 3, shape: SHAPE.STAR5, color: '#FFF0D0', intensity: 1.5, size: [0.1, 0.15], sizeEnd: 0.5,
          life: [0.3, 0.45], speed: [2.0, 3.2], dir, spread: 1.1, drag: 3, gravity: 3, spin: 8, fade: FADE.HOLD });
        return;
      default:
    }
  }

  /** Hit-stars: a white flash, `n` chunky 5-point stars flung out of the target, and a few slash sparks. */
  _stars(pos, dir, n, S = 1, color = null) {
    const P = this.particles;
    P.single(pos, { shape: SHAPE.SOFT, color: '#FFFFFF', intensity: 1.4, size0: 0.45 * S, size1: 1.0 * S, life: 0.08 });
    P.single(pos, { shape: SHAPE.STAR4, color: '#FFFFFF', intensity: 2.6, size0: 0.35 * S, size1: 0.9 * S, life: 0.12, fade: FADE.POP, rot: this.rng() * 1.5 });
    P.burst(pos, { additive: true, n, shape: SHAPE.STAR5, color: color ?? '#FFF0B8', intensity: 2.0, size: [0.2 * S, 0.28 * S], sizeEnd: 0.4,
      life: [0.34, 0.5], speed: [2.8 * S, 4.4 * S], dir, spread: dir ? 1.25 : Math.PI, gravity: 4, drag: 3.2, spin: 9, fade: FADE.HOLD, grow: GROW.LINEAR });
    P.burst(pos, { additive: true, n: Math.ceil(n * 1.5), shape: SHAPE.SPARK, color: '#F4F8FF', intensity: 2.2, size: [0.06 * S, 0.08 * S],
      life: [0.12, 0.2], speed: [5, 8], dir, spread: dir ? 1.0 : Math.PI, drag: 6, stretch: 3.5, fade: FADE.LINEAR });
  }

  /** Metal sparks (blocks, reflects, projectiles on shields). */
  _sparks(pos, dir, n, color, S = 1) {
    const P = this.particles;
    P.single(pos, { shape: SHAPE.STAR4, color, intensity: 2.8, size0: 0.2 * S, size1: 0.75 * S, life: 0.12, fade: FADE.POP });
    P.burst(pos, { additive: true, n, shape: SHAPE.SPARK, color, intensity: 2.6, size: [0.04 * S, 0.06 * S], life: [0.18, 0.32],
      speed: [3.5, 7], dir, spread: dir ? 1.1 : Math.PI, gravity: 9, drag: 2.5, stretch: 4, fade: FADE.LINEAR });
  }

  /** Sparks off her blade / guard (block, guard break): in front of her chest, toward the attacker. */
  _guardSparks(pl, color, n) {
    if (!isActor(pl)) return;
    weaponPoint(pl, _q);
    actorWorldPos(pl, _p);
    const f = pl.object3d?.rotation?.y ?? pl.facing ?? 0;
    _p.set(_p.x + Math.sin(f) * 0.42, _p.y + (pl.height ?? 1) * 0.62, _p.z + Math.cos(f) * 0.42);
    if (Number.isFinite(_q.x)) _p.lerp(_q, 0.35);
    _d.set(Math.sin(f), 0.4, Math.cos(f)).normalize();
    this._sparks(_p, _d, n, color, 1);
  }

  _guardBreak(pl) {
    if (!isActor(pl)) return;
    this._guardSparks(pl, '#E9EEF6', 8);
    this._shards(_p, 9, '#C9D1DA', 1);
    this.particles.single(_p, { shape: SHAPE.RING, color: '#FFFFFF', intensity: 1.8, size0: 0.3, size1: 1.6, life: 0.22, grow: GROW.OUT });
  }

  _shards(pos, n, color, S = 1) {
    this.particles.burst(pos, { n, shape: SHAPE.SHARD, color, tint: 0.15, size: [0.06 * S, 0.11 * S], life: [0.45, 0.7], speed: [2.2, 4.0], up: 1.2,
      spread: Math.PI, gravity: 12, drag: 0.6, spin: 14, fade: FADE.HOLD, floor: true });
  }

  _onParry(p) {
    const ctx = this.ctx, pl = ctx.player;
    this.counts.parries++;
    const gold = !!p?.gold;
    // the contact point: her blade, pulled toward the attacker (or the reflected projectile)
    if (pl) weaponPoint(pl, _p); else if (!toVec3(p?.position, _p)) return;
    const src = p?.projectile?.pos ?? (isActor(p?.attacker) ? actorWorldPos(p.attacker, _q).setY(_q.y + (p.attacker.height ?? 1) * 0.6) : null);
    if (src && Number.isFinite(src.x)) _p.lerp(src, 0.3);
    const P = this.particles, S = gold ? 1.35 : 1;
    P.single(_p, { shape: SHAPE.RING, color: '#FFD34D', intensity: 3.0, size0: 0.25 * S, size1: 1.8 * S, life: 0.26, grow: GROW.OUT });
    P.single(_p, { shape: SHAPE.STAR8, color: '#FFF1C4', intensity: 3.2, size0: 0.3 * S, size1: 1.1 * S, life: 0.2, fade: FADE.POP, spin: 4 });
    P.burst(_p, { additive: true, n: gold ? 18 : 12, shape: SHAPE.SPARK, color: '#FFD34D', intensity: 2.8, size: [0.05, 0.07], life: [0.2, 0.35],
      speed: [4, 8], spread: Math.PI, gravity: 6, drag: 3, stretch: 4, fade: FADE.LINEAR });
    P.burst(_p, { additive: true, n: gold ? 10 : 6, shape: SHAPE.STAR4, color: '#FFE9A8', intensity: 2.4, size: [0.1, 0.18], sizeEnd: 0.3,
      life: [0.4, 0.7], speed: [1.2, 2.6], spread: Math.PI, drag: 2.5, fade: FADE.TWINKLE });
    this.bloomSpike(gold ? 1.1 : 0.9, gold ? 0.35 : 0.25);
    if (isActor(p?.attacker) && !p.projectile) this.dizzyFor(p.attacker, gold ? PLAYER.guard.goldParryStagger : PLAYER.guard.parryStagger * 0.8);
  }

  _onHoly(p) {
    const pl = this.ctx.player;
    const at = ATTACKS.holy.active?.[0] ?? 0.22;
    const dir = p?.dir?.clone?.() ?? null;
    this._afterSim(Math.max(0, at - 0.02), () => {
      if (pl && isActor(pl)) actorWorldPos(pl, _p); else if (!toVec3(p?.position, _p)) return;
      if (pl && dir) { const f = pl.facing ?? 0; dir.set(Math.sin(f), 0, Math.cos(f)); }
      this.holyFx.cast(_p, dir);
      this.bloomSpike();
    });
  }

  _sunburst() {
    const pl = this.ctx.player;
    if (!isActor(pl)) return;
    this.holyFx.sunburst(actorWorldPos(pl, _p));
    this.sunRays.burst(_p);
    this.bloomSpike(1.3, 0.5);
  }

  _onHeal(p) {
    const pl = this.ctx.player;
    if (!isActor(pl) || !(p?.amount > 0)) return;
    this.burst('heal', pl, { count: 12 });
    const t = formatHeal(p.amount);
    if (t) this.damageNumber(headPoint(pl, _q, 0.15), t.text, t.style);
  }

  _onPerfectDodge(p) {
    const pl = this.ctx.player;
    if (!isActor(pl)) return;
    actorWorldPos(pl, _p); _p.y += (pl.height ?? 1) * 0.5;
    if (p?.graze) {
      this.particles.burst(_p, { additive: true, n: 5, shape: SHAPE.SPARK, color: '#DDE8FF', intensity: 2, size: [0.04, 0.06], life: [0.15, 0.25],
        speed: [3, 5], spread: Math.PI, drag: 4, stretch: 3 });
      return;
    }
    this.particles.single(_p, { shape: SHAPE.RING, color: '#CFE3FF', intensity: 2.0, size0: 0.4, size1: 2.4, life: 0.35, grow: GROW.OUT });
    this.particles.burst(_p, { additive: true, n: 14, shape: SHAPE.STAR4, color: '#E4EEFF', intensity: 2.4, size: [0.1, 0.2], sizeEnd: 0.3,
      life: [0.5, 0.8], speed: [0.8, 2.0], spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.3 });
  }

  _stillStanding() {
    const pl = this.ctx.player;
    if (!isActor(pl)) return;
    actorWorldPos(pl, _p);
    this.holyFx.arc({ x: _p.x, y: _p.y + 0.06, z: _p.z, ring: true, r0: 0.3, r1: 4, thick: 0.4, life: 0.7, grow: 0.6, intensity: 2.4 });
    _p.y += (pl.height ?? 1) * 0.6;
    this.particles.burst(_p, { additive: true, n: 24, shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.6, size: [0.14, 0.26], sizeEnd: 0.3,
      life: [0.6, 1.0], speed: [1.5, 3.5], spread: Math.PI, gravity: -0.6, drag: 2, fade: FADE.TWINKLE, jitter: 0.25 });
    this.bloomSpike(1.2, 0.5);
  }

  _meow(p) {
    const pl = this.ctx.player;
    if (isActor(pl)) headPoint(pl, _p, -0.15); else if (!toVec3(p?.position, _p)) return;
    for (let k = 0; k < 2; k++) {
      this.particles.single(_p, { shape: SHAPE.RING, color: '#FFD9E6', intensity: 1.2, size0: 0.25 + k * 0.1, size1: 1.6 + k * 0.8, life: 0.45 + k * 0.15,
        grow: GROW.OUT, alpha: 0.8 - k * 0.25 });
    }
  }

  _onEnemyDied(p) {
    if (!p) return;
    const e = p.enemy;
    const pos = p.position ?? (isActor(e) ? e.pos : null);
    if (!pos || !toVec3(pos, _v)) return;
    const h = isActor(e) ? (e.height ?? 1) * (e.def?.visualScale ?? 1) : 1;
    this.poof(_v, { type: p.type ?? e?.def?.id, height: h, dir: null, fish: p.fish ?? 0 });
    const type = String(p.type ?? e?.def?.id ?? '');
    if (type.startsWith('jelly')) {
      const size = jellySize(type, e);
      const pops = isActor(e) ? this._pops.get(e) === true : false;
      const col = e?.def?.color ?? e?.color ?? null;
      this._jelly(pops ? 'jellyPop' : size === 'S' ? 'jellySlam' : 'jellySplit', _v, JELLY_SCALE[size] ?? 1, typeof col === 'string' ? col : null);
    }
    if (isActor(e)) { this.encounters.jeer(e, false); this.encounters.died(e); }
    const t = this.ctx.game?.time ?? 0;
    this._poofAt.t = t; this._poofAt.x = _v.x; this._poofAt.z = _v.z;
    this.dizzy.delete(e);
  }

  _onPickup(p) {
    if (!p) return;
    const pos = p.position ?? p.pos;
    if (!pos) return;
    switch (p.item) {
      case 'fish': this.burst('sparkle', pos, { count: 4, color: '#DDF2FF' }); break;
      case 'smallHeart': case 'heartBell': this.burst('heart', pos, { count: 1 }); break;
      case 'letter': this.burst('sparkle', pos, { count: 10 }); break;
      case 'milk': this.burst('sparkle', pos, { count: 6, color: '#FFFFFF' }); break;
      default: this.burst('sparkle', pos, { count: 5 });
    }
  }

  /**
   * Gloomjelly goo: 'jellySplit' (splits in two: goo blobs fling apart where the children appear), 'jellyPop' (holy pop:
   * gold ring, no split), 'jellySlam' (a landing splat; also the smallest one's death). `pos` = ground point.
   */
  _jelly(kind, pos, S = 1, color = null) {
    const P = this.particles, col = color ?? '#7FD38A', gy = groundY(this.ctx, pos.x, pos.z, pos.y);
    const by = Math.max(gy, pos.y - 0.3);
    _q.set(pos.x, by + 0.3 * S, pos.z);
    P.burst(_q, { n: Math.round(12 * S), shape: SHAPE.DROPLET, color: col, tint: 0.12, alpha: 0.9, size: [0.08 * S, 0.15 * S], life: [0.5, 0.85],
      speed: [2.0 * S, 3.8 * S], up: 1.6, spread: Math.PI, gravity: 10, drag: 0.6, fade: FADE.HOLD, floor: true, bounce: 0.1 });
    this.holyFx.arc({ x: pos.x, y: by + 0.05, z: pos.z, ring: true, r0: 0.2 * S, r1: 1.4 * S, thick: 0.3 * S, life: 0.5, grow: 0.35, intensity: 0.7, color: col });
    if (kind === 'jellySplit') {
      const a = this.rng() * Math.PI;
      for (const sgn of [-1, 1]) {
        P.single(_q, { additive: false, shape: SHAPE.PUFF, color: col, alpha: 0.85, size0: 0.35 * S, size1: 0.15 * S, life: 0.35, grow: GROW.LINEAR,
          vx: Math.cos(a) * 3.2 * sgn, vy: 1.2, vz: Math.sin(a) * 3.2 * sgn, fade: FADE.HOLD });
      }
      P.single(_v2.copy(_q).setY(_q.y + 0.25 * S), { shape: SHAPE.RING, color: '#CFF5D6', intensity: 1.2, size0: 0.25 * S, size1: 1.1 * S, life: 0.26, grow: GROW.OUT });
    } else if (kind === 'jellyPop') {
      _v2.copy(_q).setY(_q.y + 0.25 * S);
      P.single(_v2, { shape: SHAPE.RING, color: '#FFD34D', intensity: 2.0, size0: 0.25 * S, size1: 1.3 * S, life: 0.28, grow: GROW.OUT });
      P.single(_v2, { shape: SHAPE.STAR8, color: '#FFF1C4', intensity: 2.6, size0: 0.25 * S, size1: 0.9 * S, life: 0.22, fade: FADE.POP, spin: 3 });
      P.burst(_q, { additive: true, n: Math.round(14 * S), shape: SHAPE.STAR4, color: '#FFE3A3', intensity: 2.4, size: [0.12, 0.22], sizeEnd: 0.3,
        life: [0.5, 0.9], speed: [1.5, 3.2], spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.2 * S });
    }
  }

  /** Purchase in the world: gold coins hop up, a star flash and sparkles (the DOM half is ShopSparkle). */
  _purchaseWorld(pos, S = 1, color = null) {
    const P = this.particles;
    P.burst(pos, { n: Math.round(8 * S), shape: SHAPE.SHARD, color: '#FFC83D', tint: 0.15, size: [0.07, 0.11], life: [0.6, 0.9], speed: [2.2, 3.4],
      dir: _up, spread: 0.7, gravity: 9, drag: 0.5, spin: 14, fade: FADE.HOLD });
    P.single(pos, { shape: SHAPE.STAR8, color: color ?? '#FFE9A8', intensity: 3, size0: 0.3 * S, size1: 1.4 * S, life: 0.3, fade: FADE.POP, spin: 2 });
    P.burst(pos, { additive: true, n: Math.round(16 * S), shape: SHAPE.STAR4, color: color ?? '#FFE3A3', intensity: 2.4, size: [0.1, 0.2], sizeEnd: 0.3,
      life: [0.6, 1.0], speed: [0.8, 2.2], up: 0.8, spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.25 });
  }

  /** While Golden Hour lasts: a soft gold ring breathes out from her feet once a second (the sunbeam she stands in). */
  _goldenPulse(dt) {
    const p = this.ctx.player;
    if (!isActor(p) || !p.golden || p.alive === false) { this._goldT = 0; return; }
    if ((this._goldT -= dt) > 0) return;
    this._goldT = 1.0;
    actorWorldPos(p, _p);
    this.holyFx.arc({ x: _p.x, y: _p.y + 0.06, z: _p.z, ring: true, r0: 0.4, r1: 2.6, thick: 0.3, life: 0.9, grow: 0.85, intensity: 0.55 });
  }

  _splash(pos, S, n) {
    const P = this.particles, gy = groundY(this.ctx, pos.x, pos.z, pos.y);
    P.burst(_q.set(pos.x, Math.max(gy, pos.y) + 0.05, pos.z), { n, shape: SHAPE.DROPLET, color: '#CFE6F2', size: [0.07 * S, 0.12 * S], life: [0.5, 0.8],
      speed: [1.6, 3.2], dir: _up, spread: 0.9, gravity: 11, drag: 0.4, fade: FADE.HOLD, jitter: 0.15 });
    // the ripple lies flat on the water
    this.holyFx.arc({ x: _q.x, y: _q.y - 0.02, z: _q.z, ring: true, r0: 0.2 * S, r1: 1.5 * S, thick: 0.14 * S, life: 0.6, grow: 0.55, intensity: 0.55,
      color: '#DCEEF6' });
  }

  _fish(pos, n) {
    this.particles.burst(pos, { n, shape: SHAPE.FISH, color: '#BFD3E0', tint: 0.1, size: [0.16, 0.22], sizeEnd: 0.8, life: [0.6, 0.85],
      speed: [2.0, 3.2], dir: _up, spread: 0.8, gravity: 9, drag: 0.5, spin: 8, fade: FADE.HOLD, grow: GROW.BACK });
    this.particles.burst(pos, { additive: true, n: Math.max(2, n), shape: SHAPE.STAR4, color: '#DDF2FF', intensity: 1.8, size: [0.08, 0.14], sizeEnd: 0.3,
      life: [0.4, 0.6], speed: [1.0, 2.0], spread: Math.PI, drag: 2, fade: FADE.TWINKLE });
  }

  _confetti(pos, n, S) {
    const cols = ['#FF8FB1', '#FFD34D', '#7FD38A', '#8FC8FF', '#FFFFFF'];
    for (let k = 0; k < cols.length; k++) {
      this.particles.burst(pos, { n: Math.ceil(n / cols.length), shape: SHAPE.SHARD, color: cols[k], size: [0.06 * S, 0.1 * S], life: [0.9, 1.4],
        speed: [2.5, 4.5], dir: _up, spread: 0.9, gravity: 5, drag: 2.2, spin: 12, fade: FADE.HOLD });
    }
  }

  /** Stun stars circling heads (boss Dizzy: gold "!" first; parried grunts: small stars while staggered). */
  _dizzyMarks(dt) {
    if (!this.dizzy.size) return;
    const M = this.marks, time = this.ctx.game?.realTime ?? 0;
    for (const [a, d] of this.dizzy) {
      d.t += dt;
      if (a.alive === false || !a.object3d?.parent || d.t >= d.dur) { this.dizzy.delete(a); continue; }
      const big = d.gold;
      headPoint(a, _p, big ? 0.22 : 0.12);
      const r = (a.radius ?? 0.35) * (big ? 1.1 : 0.9) + 0.12, fade = Math.min(1, d.t / 0.1, (d.dur - d.t) / 0.25);
      for (let k = 0; k < 3; k++) {
        const ang = time * 4.2 + (k / 3) * Math.PI * 2;
        M.push(_p.x + Math.cos(ang) * r, _p.y + Math.sin(ang * 2) * 0.05, _p.z + Math.sin(ang) * r, big ? 0.26 : 0.18, MARK.STAR5, STAR_COL, 1.5,
          fade, ang * 1.5);
      }
      if (big && d.t < 0.9) {
        const pop = Math.min(1, d.t / 0.12);
        M.push(_p.x, _p.y + 0.42, _p.z, 0.42 * (pop < 1 ? 1 + 0.4 * Math.sin(pop * Math.PI) : 1), MARK.EXCL, GOLD, 1.4, Math.min(1, (0.9 - d.t) / 0.2));
      }
    }
  }
}
