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
import { Poof, HelmetPops, DEBRIS_KINDS, helmetFor } from './Poof.js';
import { MistCards, AMBIENT_DENSITY } from './MistCards.js';
import { Horde } from './Horde.js';
import { ScreenFX } from './ScreenFX.js';
import { Ambient, motesFor } from './Ambient.js';
import { toVec3, resolveActor, resolveAnchor, isActor, actorWorldPos, headPoint, weaponPoint, groundY, visualDt } from './util.js';

/** Every `burst` kind fx draws (anything else falls back to a sparkle). */
export const BURST_KINDS = Object.freeze(['poof', 'hit', 'heavyHit', 'stars', 'spark', 'sparks', 'sparkle', 'sparkles', 'gold', 'dust',
  'dustRing', 'splash', 'heart', 'hearts', 'heal', 'spawn', 'spawnBones', 'smoke', 'helmet', 'fish', 'ring', 'confetti', 'shatter',
  'holy', 'sunburst', 'flash', 'choke', ...DEBRIS_KINDS]);

/** Mist-card budget per quality preset (art.md §9.2: 30–60). */
export const MIST_COUNT = Object.freeze({ low: 24, med: 44, high: 56 });

const HOLY_IDS = new Set(['holy', 'sunburst', 'holyWave']);

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
    this.dizzy = new Map();      // actor → { t, dur, gold }
    this._later = [];            // sim-timed calls { t, fn }
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
    this._applyQuality(ctx.quality);
    this._offs.push(ctx.game?.addFrameHook?.(() => this.screen.afterFrame()) ?? (() => {}));

    const on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    on(E.BURST, (p) => { if (p) this.burst(p.kind, p.position ?? p.pos, p); });
    on(E.TELEGRAPH, (p) => { if (p) this.telegraphs.start(p, p.id ?? this._teleId++); });
    on(E.TELEGRAPH_END, (p) => { if (p) this.telegraphs.end(p.id); });
    on(E.HIT, (h) => this._onHit(h));
    on(E.PLAYER_PARRY, (p) => this._onParry(p));
    on(E.PLAYER_HOLY, (p) => this._onHoly(p));
    on(E.PLAYER_SWING, (p) => { if (p?.attackId === 'sunburst') this._afterSim(ATTACKS.sunburst.active?.[0] ?? 0.2, () => this._sunburst()); });
    on(E.PLAYER_CHARGE, (p) => this.holyFx.chargeEvent(ctx.player, p));
    on(E.PLAYER_GOLDEN, (p) => { if (p?.on && ctx.player) { this.holyFx.goldenOn(actorWorldPos(ctx.player, _p)); this.bloomSpike(1.4, 0.6); } });
    on(E.PLAYER_DAMAGED, (p) => { if ((p?.amount ?? 0) > 0) { this.screen.hurt(); this.counts.hurts++; } });
    on(E.PLAYER_HEALED, (p) => this._onHeal(p));
    on(E.PLAYER_DODGE, () => { const pl = ctx.player; if (pl) this.poofs.dust(actorWorldPos(pl, _p), 1, 6); });
    on(E.PLAYER_LAND, (p) => { const pl = ctx.player; if (pl && (p?.impact ?? 0) > PLAYER.hardLandSpeed * 0.75) this.poofs.dustRing(actorWorldPos(pl, _p), 0.8); });
    on(E.PLAYER_PERFECT_DODGE, (p) => this._onPerfectDodge(p));
    on(E.PLAYER_GRIT, (p) => { if (p?.broken && ctx.player) this._guardBreak(ctx.player); });
    on(E.PLAYER_STILL_STANDING, () => this._stillStanding());
    on(E.PLAYER_MEOW, (p) => this._meow(p));
    on(E.ENEMY_DIED, (p) => this._onEnemyDied(p));
    on(E.ENEMY_CHOKE, (p) => { if (isActor(p?.enemy)) this.burst('choke', p.enemy); });
    on(E.REFLECT, (p) => { const pos = p?.projectile?.pos ?? p?.projectile?.position; if (pos) this.burst('spark', pos, { color: '#FFD34D', count: 12 }); });
    on(E.BOSS_DIZZY, (p) => { if (isActor(p?.boss)) { if (p.dizzy) this.dizzyFor(p.boss, Infinity, { gold: true }); else this.dizzy.delete(p.boss); } });
    on(E.BOSS_DEFEATED, (p) => { if (p?.boss) this.dizzy.delete(p.boss); });
    on(E.ITEM_PICKUP, (p) => this._onPickup(p));
    on(E.LEVEL_UNLOAD, () => this.clear());
    on(E.LEVEL_LOADED, (p) => this._onLevel(p?.id));
    on(E.ENV_CHANGED, (p) => { if (this.levelId) this.ambient.set(motesFor(this.levelId, p?.grade ?? ctx.env?.grade)); });
    on(E.QUALITY, (p) => this._applyQuality(p?.preset ?? ctx.quality));
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
      case 'ring':
        P.single(_p.setY(_p.y + 0.1), { shape: SHAPE.RING, color: opts.color ?? '#FFFFFF', intensity: 1.6, size0: 0.3 * S, size1: 3.2 * S, life: 0.35, grow: GROW.OUT });
        return;
      case 'flash': P.single(mid(), { shape: SHAPE.SOFT, color: opts.color ?? '#FFF6DA', intensity: 2.6, size0: 0.4 * S, size1: 1.6 * S, life: 0.16 }); return;
      case 'confetti': this._confetti(mid(), n(24), S); return;
      case 'shatter': this._shards(mid(), n(10), opts.color ?? '#D8E2EC', S); return;
      case 'holy': this.holyFx.cast(actor ? actorWorldPos(actor, _p) : _p, opts.dir ?? null); this.bloomSpike(); return;
      case 'sunburst': this.holyFx.sunburst(actor ? actorWorldPos(actor, _p) : _p); this.bloomSpike(1.3, 0.5); return;
      default:
        if (DEBRIS_KINDS.includes(kind)) { this.poofs.debris(mid(), kind, S, opts.color ?? null, opts.count ?? null); return; }
        this.burst('sparkle', _p.clone(), opts);
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
      dizzy: this.dizzy.size, marks: this.marks?.count ?? 0, counts: { ...this.counts },
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
    this.numbers.render(dt);
    this.marks.end();
    this.screen.render(frameDt);
  }

  dispose() {
    for (const off of this._offs) { try { off?.(); } catch { /* ignore */ } }
    this._offs.length = 0;
    this.particles?.dispose(); this.marks?.dispose(); this.trail?.dispose(); this.numbers?.dispose(); this.telegraphs?.dispose();
    this.holyFx?.dispose(); this.helmets?.dispose(); this.mist?.dispose(); this.hordeFx?.dispose(); this.ambient?.dispose(); this.screen?.dispose();
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
  }

  _onLevel(id) {
    this.levelId = id ?? null;
    const dens = AMBIENT_DENSITY[id] ?? 1;
    this.mist.setAmbient(dens > 0, dens);
    this.ambient.set(motesFor(id, this.ctx.env?.grade));
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

  _splash(pos, S, n) {
    const P = this.particles, gy = groundY(this.ctx, pos.x, pos.z, pos.y);
    P.burst(_q.set(pos.x, Math.max(gy, pos.y) + 0.05, pos.z), { n, shape: SHAPE.DROPLET, color: '#CFE6F2', size: [0.07 * S, 0.12 * S], life: [0.5, 0.8],
      speed: [1.6, 3.2], dir: _up, spread: 0.9, gravity: 11, drag: 0.4, fade: FADE.HOLD, jitter: 0.15 });
    P.single(_q, { shape: SHAPE.RING, color: '#E6F2F8', intensity: 1, size0: 0.3 * S, size1: 1.8 * S, life: 0.5, grow: GROW.OUT, alpha: 0.6, additive: false });
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
