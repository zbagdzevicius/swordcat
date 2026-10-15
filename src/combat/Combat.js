// src/combat/Combat.js  (owner: combat) — the ctx.combat service (§19.3) and the full hit-resolve path (§19.4, A6).
//
//   beginSwing(attacker, def, opts?) → swing      start a swing; keep it and call updateSwing every step
//   updateSwing(swing, dt) → n                     swept-arc hits this step (tech.md §9.2); n = damaging hits
//   applyHit(att, tgt, def, { dmgMul, crit, dmg, from }) → 'none'|'immune'|'parry'|'block'|'hit'|'break'
//   spawnProjectile(def, owner, pos, dir, opts?) → projectile   (pooled; parry reflects it — Projectiles.js)
//   tokens                                         AttackTokens (difficulty limits [melee, ranged])
//   extras: areaHit (rings, landings, dives, blasts), staggerArea, assistTarget, dealtMul, reflect, targetFilter
//   iso controls (CONTROLS_SPEC §7–§8): assistTarget(actor, range, angle, out?, opts?) = the §7.2 soft auto-target
//   score with stickiness + breakdown; nextParryable(actor) (parry ring / threat snap); hitRecently(attacker);
//   beginSwing opts.lungeTo (lunge magnetism → swing.lungeOverride); reflect toward the resolved aim (±25°).
//
// applyHit, in order (tech.md §9.3 + §19.4):
//   1. `none`  — target dead / not hurtable / invulnT > 0 (the caller may retry next step).
//      `immune` — the target is inside its own swing's `iframes` window (Holy Slash 0–0.46 s).
//   2. `tgt.resolveIncoming(att, def, hitDir)` → 'hit' | 'block' | 'parry' | 'break' | 'immune'
//      ('perfectDodge' / 'graze' from player/Guard.js are treated as 'immune').
//   3. parry  — att.onParried(tgt, {gold}) (enemy stagger / boss dizzy; a projectile reflects), hitstop 0.12,
//               time scale 0.5 for 0.15 s, shake, rumble, `player:parry` {attacker, gold, projectile?, position}.
//   4. block  — 0 damage, guard pushback / mass, att.onBlocked(tgt, def), block juice, `combat:hit` {blocked: true}.
//   5. hit / break — dmg = def.dmg × dmgMul × crit; player side: difficulty `roundTaken` (+ optional
//               `damageTakenMul`, rounded down); enemy side: × difficulty playerDmgMul. god → 0. Knockback /
//               mass, i-frames (player 0.9 s, others 0.12 s anti multi-hit; a harmless 0-damage def — tutorial
//               dummy, web glob — only 0.12 s and light juice), poise → stagger 0.6 s
//               (break → PLAYER.guard.breakStagger), hitstop + shake + rumble by the §8.2 row (+ kill bonus),
//               tgt.onHit(info), lethal hook `tgt.onLethal(info)` (Still Standing), death → tgt.onDeath,
//               `combat:hit` {attacker, target, attackId, damage, position, dir, killed, blocked, parried, crit,
//               popsSlime, heavy, broke, result, projectile?, reflected}. On the player side `damage` is what her
//               hp actually lost (after `damageTakenMul` and any hp clamp); enemies get the nominal dmg.
//   dmgMul defaults to `dealtMul(attacker)` (sharpness × Golden Hour for the heroine, 1 for everyone else).
//
// Shield Wall (companions): an enemy swing or area hit whose line from the attacker to a target crosses a wall
// (`ctx.companions.wallBetween(a, b)` → a wall post) lands on the wall instead (the post answers 'block').
//
// Optional duck-typed target members honoured here (all additive, see requests/combat.md):
//   resolveIncoming, onParried, onBlocked, onHit, onDeath, onLethal(info) → true to survive (sets its own hp),
//   god, superArmor (no knockback / poise / stagger), damageTakenMul (player-side, rounded down),
//   critTaken (crit multiplier while e.g. Dizzy; falls back to DIZZY.critMul when `isDizzy`), breakable (player
//   attacks may hit it even though it is not an enemy).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { PLAYER, JUICE, DIZZY, DIFFICULTY, ATTACKS, HUD } from '../core/config.js';
import { clamp, wrapAngle, easeSwing } from '../core/math.js';
import { isHostile } from '../core/ActorRegistry.js';
import { AttackTokens } from './AttackTokens.js';
import { Projectiles } from './Projectiles.js';
import { COMBAT, GLEAM_FROM, juiceFor, sharpMul, isFullCircle } from './attacks.js';
import { ThreatBook, timeToContact, PARRY_KINDS, pickAssist, lungeSpeed, aimCfg, normalizeTelegraph, glyphFor } from './targeting.js';
import { splitOf, jellySize, childBudget, aliveJellies } from '../enemies/types/jelly.js';
import { TRICKS } from '../player/tricks/tuning.js';

const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const RESULTS = new Set(['hit', 'block', 'parry', 'break', 'immune']);
/** assistTarget's default options (never mutated) */
const NO_OPTS = Object.freeze({});
/** Save flag prefix of the first sighting of each telegraph kind (WA §7.3 glyph one-shots; `telegraph:first`). */
export const TELE_SEEN_FLAG = 'tele.seen.';
/** Game modes in which a telegraph sighting counts as "seen" (not behind a cutscene / menu). */
const SEEN_MODES = new Set(['play', 'dialog', 'memecam']);

/**
 * WA §5.1 (combat.W2): is killing `tgt` (by `src`) the final blow of an encounter? The heroine's side made the kill,
 * the victim was an alerted hostile (or a boss), and no other alerted, awake hostile is left within
 * 2 × `HUD.tuck.combatR` of her (the same rule Player uses for the "Bonk!" word). Pure over its arguments.
 * @param {any} src killer (projectile owners already resolved) @param {any} tgt victim
 * @param {ArrayLike<any>|null|undefined} enemies live enemies (`ctx.enemies.list`)
 * Never while the fight goes on: a jelly whose death splits it into children (U7, `splitOf` with room under the
 * jelly cap; a `popsSlime` hit pops it whole), or any locked arena with waves still to come (the last foe of a
 * non-final wave).
 * @param {{x:number, z:number}|null} [here] her position (default: the killer's)
 * @param {any} [def] the killing attack def (`popsSlime`)
 * @param {ArrayLike<any>|null} [arenas] the current level's arenas (`ctx.levels.current.arenas`)
 */
export function isFinalBlow(src, tgt, enemies, here, def, arenas) {
  if (!src || src.faction !== 'player' || !tgt || tgt.breakable || !isHostile('player', tgt.faction)) return false;
  if (!tgt.alerted && !tgt.tags?.has?.('boss')) return false;
  if (willSplit(tgt, def, enemies)) return false;
  if (arenas) {
    for (let i = 0; i < arenas.length; i++) {
      const a = arenas[i];
      if (a && a.locked && !a.cleared && (a.wave ?? 0) < (a.waves?.length ?? 0)) return false;
    }
  }
  if (!enemies) return true;
  const c = here ?? src.pos, r = 2 * (HUD?.tuck?.combatR ?? 15), r2 = r * r;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || e === tgt || e.alive === false || !e.alerted || e.hidden || e.dormant) continue;
    if (e.stateName === 'die' || e.stateName === 'dead') continue;
    if (c && e.pos) { const dx = e.pos.x - c.x, dz = e.pos.z - c.z; if (dx * dx + dz * dz > r2) continue; }
    return false;
  }
  return true;
}

/**
 * Will killing `tgt` with `def` spawn split children (U7 jellies; capped by `ENEMIES.jelly.maxAlive`)? Pure.
 * @param {any} tgt @param {any} [def] @param {ArrayLike<any>|null} [enemies]
 */
export function willSplit(tgt, def, enemies) {
  const type = tgt?.type;
  if (typeof type !== 'string' || !type.startsWith('jelly')) return false;
  const sp = splitOf(jellySize(type), !!def?.popsSlime);
  if (!sp) return false;
  if (!enemies) return true;
  // the victim still counts as alive here; splitJelly runs after it is marked dead
  let alive = aliveJellies(enemies);
  if (tgt.alive !== false && !tgt.disposed && Array.prototype.includes.call(enemies, tgt)) alive--;
  return childBudget(sp[1], alive) > 0;
}

/** Is `actor` inside the `iframes` window of its own current swing (Holy Slash 0–0.46 s)? */
export function inSwingIframes(actor) {
  const sw = actor?.swing, f = sw?.def?.iframes;
  return !!f && sw.attacker === actor && !sw.cancelled && sw.t >= f[0] && sw.t <= f[1];
}

/** Does `tgt`'s hurt cylinder intersect the arc slice [a0, a1] (radians relative to att.facing)? tech.md §9.2 */
export function sectorHit(att, tgt, arc, a0, a1) {
  const dx = tgt.pos.x - att.pos.x, dz = tgt.pos.z - att.pos.z, d = Math.hypot(dx, dz);
  const tr = tgt.radius ?? 0;
  if (d > arc.range + tr) return false;
  if (tgt.pos.y > att.pos.y + arc.y1 || tgt.pos.y + (tgt.height ?? 1) < att.pos.y + arc.y0) return false;
  if (d < tr + COMBAT.pointBlank) return true;                             // point blank
  if (isFullCircle(arc)) return true;                                      // full circle
  const ang = wrapAngle(Math.atan2(dx, dz) - (att.facing ?? 0)), pad = Math.asin(Math.min(1, tr / d));
  return ang >= Math.min(a0, a1) - pad && ang <= Math.max(a0, a1) + pad;
}

/**
 * @typedef {object} Swing
 * @property {any} attacker @property {any} def @property {number} t seconds since beginSwing
 * @property {Set<number>} hitSet actor ids already resolved by this swing
 * @property {number} hits damaging hits so far @property {number} contacts every resolved contact (incl. block/parry/immune)
 * @property {boolean} landed @property {boolean} blocked @property {boolean} parried @property {boolean} done
 * @property {number} killed @property {number} angle current blade angle (relative to facing) for visuals
 * @property {any} target aim-assist target picked on the first active step (or null)
 */

export class Combat {
  constructor(ctx) {
    this.ctx = ctx;
    /** §19.3 contract field: attack tokens (difficulty-driven limits, fair queue) */
    this.tokens = new AttackTokens(
      () => ctx.state?.difficultyCfg?.tokens ?? DIFFICULTY.knight.tokens,
      () => ctx.game?.time ?? 0,
    );
    /** pooled projectile manager; `projectiles.list` = live projectiles */
    this.projectiles = new Projectiles(this);
    /** last parry: { attacker, by, gold, time, projectile } (Riposte auto-turn target) */
    this.lastParry = null;
    /** counters for debug overlays / smoke assertions */
    this.stats = { finalBlows: 0, swings: 0, hits: 0, kills: 0, blocks: 0, parries: 0, breaks: 0, immune: 0, reflects: 0, projectiles: 0, eaten: 0 };
    /** last few resolved hits (newest last): { attackId, result, damage, target, killed, crit } */
    this.log = [];
    this._offs = [];
    this._filters = new Map();
    this._scratch = []; this._sets = [];
    this._depth = 0;
    this._shakeKey = -1; this._shakeMax = 0;
    this._rumbleKey = -1;
    /** CONTROLS_SPEC §8.2 / §8.1: live melee wind-ups (combat:telegraph) → nextParryable (parry ring, threat snap) */
    this.threats = new ThreatBook(() => ctx.game?.time ?? 0);
    this._parryOut = { attacker: null, activeAt: 0, kind: 'parry', window: 0, projectile: null, pos: null };
    /** attacker id → sim time it last damaged the heroine (§7.2 "hit her within the last 2 s") */
    this._hitHer = new Map();
    /** telegraph kinds seen this session when there is no save state (the save flags are the real record) */
    this._seenKinds = new Set();
    // PERF B1: assistTarget / update run every step — their option bag and closures are built once, here
    this._teleHooks = {
      defOf: (a, x) => ATTACKS[x?.attackId] ?? ATTACKS[a?.attackId] ?? a?.currentAttack ?? null,
      targets: (a) => !a?.target || a.target === this.ctx.player || a.target?.tags?.has?.('player'),
    };
    this._assistOpts = {
      range: 0, angle: Math.PI, refYaw: 0, prev: null, sticky: undefined, breakables: false, selected: null, groundY: 0,
      windup: (a) => this.threats.windingUp(a), recentHit: (a) => this.hitRecently(a),
    };
    this._keepToken = (a) => a.alive !== false && (this.ctx.actors?.has ? this.ctx.actors.has(a) : true);
  }

  /** Fill the guaranteed telegraph fields (targeting.normalizeTelegraph); a malformed payload is left alone. */
  _normalize(p) {
    try { normalizeTelegraph(p, this.ctx.game?.time ?? 0, this._teleHooks); } catch { /* never break the emit */ }
  }

  /**
   * combat.W1: the first sighting of a telegraph kind in this save → `telegraph:first {kind}` (story shows the glyph
   * one-shot, WA §7.3). Recorded in the save flags (`tele.seen.<kind>`); kinds without a glyph never count, nor do
   * telegraphs behind a cutscene / menu or of hidden actors.
   */
  _sighted(p) {
    const kind = p?.kind;
    if (!kind || !glyphFor(kind) || p.actor?.hidden) return;
    const mode = this.ctx.game?.mode;
    if (mode && !SEEN_MODES.has(mode)) return;
    const st = this.ctx.state, key = TELE_SEEN_FLAG + kind;
    if (st && typeof st.getFlag === 'function') {
      if (st.getFlag(key)) return;
      st.setFlag(key, true);
    } else {
      if (this._seenKinds.has(kind)) return;
      this._seenKinds.add(kind);
    }
    this.ctx.bus.emit(E.TELEGRAPH_FIRST, { kind });
  }

  /** Did `attacker` damage the heroine within `AIM.recentHitWindow` (2 s)? (§7.2 score term) */
  hitRecently(attacker, window = aimCfg().recentHitWindow) {
    const t = attacker?.id != null ? this._hitHer.get(attacker.id) : undefined;
    return t !== undefined && (this.ctx.game?.time ?? 0) - t <= window;
  }

  /**
   * §12 combat 2: the single most imminent parryable attack on `actor` (a live white / gold wind-up aimed at it, or an
   * incoming hostile projectile) → `{ attacker, activeAt, kind, window, projectile, pos }` (a shared object) or null.
   * `window` is her parry window (difficulty + the touch bonus); `pos` is where the threat is now (the bolt itself for
   * projectiles, else the attacker) — what the Stand's threat snap should turn to.
   * @param {any} actor @param {number} [maxDist]
   */
  nextParryable(actor, maxDist = 6) {
    if (!actor?.pos) return null;
    this.threats.prune();
    const e = this.threats.soonest(actor, maxDist, (x) => x.targetsPlayer !== false && (x.actor?.target === actor || x.actor?.targetActor?.() === actor || x.targetsPlayer === true));
    const now = this.ctx.game?.time ?? 0, o = this._parryOut;
    let best = e ? e.activeAt : Infinity, att = e ? e.actor : null, kind = e ? e.kind : 'parry', proj = null;
    const list = this.projectiles?.list ?? [];
    for (let i = 0; i < list.length; i++) {
      const pr = list[i];
      if (!pr?.alive || pr.reflected || pr.wave || pr.faction === actor.faction || !pr.vel) continue;
      if (pr.faction && !isHostile(pr.faction, actor.faction)) continue;
      const tc = timeToContact(pr.pos, pr.vel, actor.pos, (actor.radius ?? 0.3) + (pr.r ?? 0.15));
      if (tc === Infinity || tc > aimCfg().projectileLead) continue;
      if (now + tc < best) { best = now + tc; att = pr.owner ?? null; kind = 'parry'; proj = pr; }
    }
    if (!e && !proj) return null;
    o.attacker = att; o.kind = PARRY_KINDS.has(kind) ? kind : 'parry'; o.projectile = proj; o.activeAt = best;
    o.pos = proj ? proj.pos : att?.pos ?? null;
    const touch = this.ctx.input?.device === 'touch';
    o.window = (this.ctx.state?.difficultyCfg?.parry ?? PLAYER.guard.parryWindow) + (touch ? PLAYER.guard.touchParryBonus ?? 0 : 0);
    return o;
  }

  async init() {
    const bus = this.ctx.bus;
    // §7.1 / WA §3.4: every `combat:telegraph` carries windup / activeAt / targetsPlayer / glyph / lane end. A bus tap
    // runs before ANY handler (ui / audio subscribe before combat), so every listener sees the filled payload.
    if (typeof bus.tap === 'function') {
      this._offs.push(bus.tap((type, p) => { if (type === E.TELEGRAPH) this._normalize(p); }));
    }
    this._offs.push(
      bus.on(E.TELEGRAPH, (p) => {
        try {
          this._normalize(p);                                   // no-op after the tap (idempotent)
          this.threats.add(p, this._teleHooks);
          this._sighted(p);
        } catch { /* a malformed payload never breaks combat */ }
      }),
      bus.on(E.TELEGRAPH_END, (p) => this.threats.end(p?.id, (a) => a?.stateName === 'strike' || a?.stateName === 'attack')),
      bus.on(E.LEVEL_UNLOAD, () => { this.threats.clear(); this._hitHer.clear(); }),
      bus.on(E.LEVEL_UNLOAD, () => this.clear()),
      bus.on(E.CUTSCENE_START, () => this.projectiles.clear()),
      bus.on(E.LEVEL_LOADED, () => this.projectiles.warm()),   // compile projectile shaders under the veil
    );
  }

  // ================================================================ swings
  /**
   * Start a swing. The attacker keeps the returned object and calls `updateSwing` every step.
   * Defs without `arc` get a body-contact arc (or a full circle of `def.r`); defs without `active` are active
   * from 0 to `dur` (pounce: until the caller stops updating).
   * Def side effects: `iframes` (applyHit answers 'immune' to the attacker while `swing.t` is inside them, as long
   * as the attacker exposes this swing as `attacker.swing`), and on the first active step `timeScale` (slow-mo),
   * aim assist (player), `projectile` (holyWave from `projectileMinShards`) and Golden Hour `gleam`s.
   * @param {any} attacker @param {any} def
   * `opts.lungeTo` (an actor or a point, §7.1 lunge magnetism for touch / pad / auto-target swings): when it stands
   * beyond the arc's reach the swing's lunge covers up to 1.0 m more (targeting.lungeSpeed) →
   * `swing.lungeOverride`, a speed like `def.lunge` (the attacker's movement reads it; the player's PlayerStates does).
   * @param {{ dmgMul?: number, crit?: number, dmg?: number, arc?: any, active?: [number, number], target?: any,
   *   assist?: boolean|{range?: number, angle?: number}, projectiles?: boolean, gleam?: boolean, timeScale?: boolean,
   *   lungeTo?: any }} [opts]
   * @returns {Swing}
   */
  beginSwing(attacker, def, opts = {}) {
    if (!def) throw new Error('[combat] beginSwing: missing def');
    const arc = opts.arc ?? def.arc ?? this._fallbackArc(attacker, def);
    const s = {
      attacker, def, t: 0, hitSet: new Set(), hits: 0, contacts: 0, opts,
      arc, active: opts.active ?? def.active ?? null, dur: def.dur ?? Infinity,
      started: false, done: false, landed: false, blocked: false, parried: false, killed: 0,
      angle: arc.from, prevAngle: arc.from, target: null, spawned: [],
      baseDmgMul: this.dealtMul(attacker),
      hitOpts: { dmgMul: opts.dmgMul ?? this.dealtMul(attacker), crit: opts.crit ?? 1, dmg: opts.dmg },
    };
    if (opts.lungeTo) { const l = this.lungeTo(s, opts.lungeTo); if (l != null) s.lungeOverride = l; }
    this.stats.swings++;
    return s;
  }

  /**
   * Advance a swing by dt; resolves hits for the arc slice swept during this step (tech.md §9.2).
   * Returns the number of NEW damaging hits ('hit' | 'break') this step. Blocks / parries / i-frame passes are
   * recorded on the swing (`blocked`, `parried`, `contacts`) and never retried; 'none' (target invulnerable right
   * now) is retried on later steps.
   * @param {Swing} s @param {number} dt
   */
  updateSwing(s, dt) {
    if (!s || s.cancelled) return 0;
    const a = s.attacker;
    const tPrev = s.t; s.t += dt;
    const def = s.def;
    if (s.t >= s.dur) s.done = true;
    if (!a || a.alive === false) return 0;
    const t0 = s.active ? s.active[0] : 0, t1 = s.active ? s.active[1] : s.dur;
    if (s.t < t0 || tPrev > t1) return 0;
    const ho = s.hitOpts, o = s.opts;                       // callers may set swing.opts.dmgMul / crit after beginSwing
    ho.dmgMul = o.dmgMul ?? s.baseDmgMul; ho.crit = o.crit ?? 1; ho.dmg = o.dmg;
    if (!s.started) { s.started = true; this._swingStart(s); }
    const arc = s.arc, span = t1 - t0;
    let a0 = arc.from, a1 = arc.to;
    if (span > 0 && span < Infinity) {
      a0 = arc.from + (arc.to - arc.from) * easeSwing(clamp((tPrev - t0) / span, 0, 1));
      a1 = arc.from + (arc.to - arc.from) * easeSwing(clamp((s.t - t0) / span, 0, 1));
    }
    s.prevAngle = a0; s.angle = a1;
    const list = this.ctx.actors.queryRadius(a.pos, arc.range + COMBAT.queryPad, this.targetFilter(a.faction), this._borrow());
    let n = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        let tgt = list[i];
        if (tgt === a || !tgt.alive || !tgt.hurtable || s.hitSet.has(tgt.id)) continue;
        if (!sectorHit(a, tgt, arc, a0, a1)) continue;
        const wall = this.wallFor(a, tgt, a.pos);                // a Shield Wall in the way takes the blow
        if (wall) { if (s.hitSet.has(wall.id)) continue; tgt = wall; }
        const r = this.applyHit(a, tgt, def, s.hitOpts);
        if (r === 'none') continue;
        s.hitSet.add(tgt.id); s.contacts++;
        if (r === 'hit' || r === 'break') { n++; s.hits++; s.landed = true; if (!tgt.alive) s.killed++; }
        else if (r === 'block') s.blocked = true;
        else if (r === 'parry') { s.parried = true; s.cancelled = true; break; }   // the attacker got parried: swing over
      }
    } finally { this._release(); }
    return n;
  }

  /**
   * Shield Wall occlusion (companions): the wall post standing between `origin` and `tgt` when an attacker hostile
   * to allies (an enemy) aims at someone behind the wall; null otherwise (or when the target is the wall itself).
   * @param {any} att @param {any} tgt @param {{x:number, z:number}} origin
   */
  wallFor(att, tgt, origin) {
    const comp = this.ctx.companions;
    if (!comp || typeof comp.wallBetween !== 'function' || !comp.walls?.length || !isHostile(att.faction, 'ally')) return null;
    if (tgt.tags?.has?.('shieldWall')) return null;
    const w = comp.wallBetween(origin, tgt.pos);
    return w && w !== tgt && w.alive !== false && w.hurtable !== false ? w : null;
  }

  /**
   * §7.1 lunge magnetism: the lunge speed (m/s, like `def.lunge`) swing `s` should use to reach `to` (actor or
   * {x, z}), or null when the def has no lunge. Within reach it is the def's own lunge.
   */
  lungeTo(s, to) {
    const lunge = s?.def?.lunge, a = s?.attacker, p = to?.pos ?? to;
    if (typeof lunge !== 'number' || !a?.pos || !p || typeof p.x !== 'number') return null;
    const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z) - (to?.pos ? (to.radius ?? 0) : 0);
    return lungeSpeed(s.def, d, s.arc?.range ?? 0);
  }

  /** Stop a swing early (stagger, hurt, roll cancel). Safe on null. */
  cancelSwing(s) { if (s) { s.cancelled = true; s.done = true; } }

  _fallbackArc(attacker, def) {
    if (typeof def.r === 'number') return { range: def.r, from: Math.PI, to: -Math.PI, y0: 0, y1: attacker?.height ?? 1 };
    const half = COMBAT.contactHalfArc;
    return { range: (attacker?.radius ?? 0.35) + COMBAT.contactReach, from: half, to: -half, y0: 0, y1: attacker?.height ?? 1 };
  }

  /** First active step: slow-mo (holy), aim assist (player side) and swing-spawned projectiles. */
  _swingStart(s) {
    const a = s.attacker, o = s.opts, def = s.def;
    // the moment of impact; a caller doing the same this step overlaps harmlessly (Game.slowMo keeps the slowest)
    if (def.timeScale && o.timeScale !== false) this.ctx.game?.slowMo?.(def.timeScale[0], def.timeScale[1]);
    // aim assist for the player side, unless the attacker runs its own (Player.aimAssist) or opts.assist === false
    const own = typeof a.aimAssist === 'function' && o.assist === undefined;
    if (a.faction === 'player' && o.assist !== false && !own && !isFullCircle(s.arc)) this._assist(s);
    if (o.projectiles !== false) this._swingProjectiles(s);
  }

  /** §7.2 Assists: turn toward the nearest enemy within 60° / 3 m (touch 90° / 4 m); Riposte: the parried enemy within 4 m. */
  _assist(s) {
    const a = s.attacker, def = s.def, o = s.opts, touch = this.ctx.input?.device === 'touch';
    let range = touch ? PLAYER.assist.touchRange : PLAYER.assist.range;
    let angle = touch ? PLAYER.assist.touchAngle : PLAYER.assist.angle;
    const lock = typeof a.lockTarget === 'function' ? a.lockTarget() : a.lockTarget;
    let prefer = o.target ?? lock ?? null;
    if (def.id === 'riposte') {
      range = PLAYER.guard.riposteRange; angle = Math.PI;
      const lp = this.lastParry, now = this.ctx.game?.time ?? 0;
      if (!prefer && lp && lp.by === a && !lp.projectile && now - lp.time <= PLAYER.guard.riposteWindow + (def.dur ?? 0)) prefer = lp.attacker;
    }
    if (o.assist && typeof o.assist === 'object') { range = o.assist.range ?? range; angle = o.assist.angle ?? angle; }
    const t = this.assistTarget(a, range, angle, null, { prefer, selected: lock ?? null });
    if (t) a.facing = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    s.target = t;
  }

  /** `def.projectile` (holyWave from Shard 2, Wave Reach upgrade) and Golden Hour gleams (every slash). */
  _swingProjectiles(s) {
    const a = s.attacker, def = s.def, ctx = this.ctx;
    const pos = _v.set(a.pos.x + Math.sin(a.facing) * (a.radius ?? 0.3), a.pos.y + (a.height ?? 1) * 0.5, a.pos.z + Math.cos(a.facing) * (a.radius ?? 0.3));
    const dir = _d.set(Math.sin(a.facing), 0, Math.cos(a.facing));
    if (typeof def.projectile === 'string') {
      const pdef = ATTACKS[def.projectile];
      const shards = a.shards ?? ctx.state?.shards ?? 0;
      if (pdef && shards >= (def.projectileMinShards ?? 0)) s.spawned.push(this.spawnProjectile(pdef, a, pos, dir, { dmgMul: s.hitOpts.dmgMul }));
    }
    if (a.faction === 'player' && GLEAM_FROM.has(def.id) && (s.opts.gleam ?? a.golden === true) && ATTACKS.gleam) {
      s.spawned.push(this.spawnProjectile(ATTACKS.gleam, a, pos, dir, { dmgMul: s.hitOpts.dmgMul }));
    }
  }

  // ================================================================ hits
  /**
   * §19.4 applyHit with the resolveIncoming hook. Returns 'none' | 'immune' | 'parry' | 'block' | 'hit' | 'break'.
   * `att` may be an actor or a projectile (then events report its owner as `attacker` and carry `projectile`).
   * @param {any} att @param {any} tgt @param {any} def
   * @param {{ dmgMul?: number, crit?: number, dmg?: number, from?: {x:number,z:number}, projectile?: any }} [opts]
   */
  applyHit(att, tgt, def, opts = {}) {
    if (!att || !tgt || !def) return 'none';
    if (!tgt.alive || !tgt.hurtable || tgt.invulnT > 0) return 'none';
    if (inSwingIframes(tgt)) { this.stats.immune++; this._log(def, 'immune', 0, tgt, false, false); return 'immune'; }
    const proj = att.isProjectile ? att : (opts.projectile ?? undefined);
    const src = att.isProjectile ? (att.owner ?? att) : att;
    this._hitDir(att, tgt, opts.from, _dir);
    let r = typeof tgt.resolveIncoming === 'function' ? tgt.resolveIncoming(att, def, _dir) : 'hit';
    if (r === 'perfectDodge' || r === 'graze' || r === 'none') r = 'immune';
    if (!RESULTS.has(r)) r = 'hit';
    if (r === 'immune') { this.stats.immune++; this._log(def, r, 0, tgt, false, false); return r; }
    if (r === 'parry') return this._parry(att, src, tgt, def, proj);
    if (r === 'block') return this._block(att, src, tgt, def, proj);
    return this._damage(att, src, tgt, def, r, opts, proj);
  }

  _parry(att, src, tgt, def, proj) {
    const ctx = this.ctx, gold = def.telegraph === 'gold';
    const position = tgt.pos.clone();
    this.lastParry = { attacker: src, by: tgt, gold, time: ctx.game?.time ?? 0, projectile: proj ?? null };
    att.onParried?.(tgt, { gold });                         // enemy: stagger / dizzy; projectile: reflect
    this.stats.parries++;
    this._log(def, 'parry', 0, tgt, false, false);
    const playerSide = tgt.faction === 'player' || src?.faction === 'player';
    if (playerSide) {
      ctx.game.requestHitstop(PLAYER.guard.parryHitstop);
      this._shake(JUICE.parry.shake);
      this._rumble(JUICE.parry.rumble);
    }
    if (tgt.faction === 'player') {
      ctx.game.slowMo?.(PLAYER.guard.parryTimeScale[0], PLAYER.guard.parryTimeScale[1]);
      ctx.bus.emit(E.PLAYER_PARRY, { attacker: src, gold, projectile: proj, position });
    } else {
      ctx.bus.emit(E.HIT, { attacker: src, target: tgt, attackId: def.id, damage: 0, position, dir: _dir.clone(), killed: false,
        blocked: true, parried: true, crit: false, popsSlime: false, heavy: !!def.heavy, broke: false, result: 'parry', projectile: proj, reflected: !!def.reflected });
    }
    return 'parry';
  }

  _block(att, src, tgt, def, proj) {
    const ctx = this.ctx;
    const pv = (PLAYER.guard.pushback * COMBAT.pushbackVelMul) / (tgt.mass || 1);
    if (tgt.vel && !tgt.superArmor) { tgt.vel.x += _dir.x * pv; tgt.vel.z += _dir.z * pv; }
    const dir = _dir.clone();
    att.onBlocked?.(tgt, def);
    this.stats.blocks++;
    this._log(def, 'block', 0, tgt, false, false);
    if (tgt.faction === 'player' || src?.faction === 'player') {
      ctx.game.requestHitstop(JUICE.block.hitstop);
      this._shake(JUICE.block.shake);
      this._rumble(JUICE.block.rumble);
    }
    ctx.bus.emit(E.HIT, { attacker: src, target: tgt, attackId: def.id, damage: 0, position: tgt.pos.clone(), dir, killed: false,
      blocked: true, parried: false, crit: false, popsSlime: false, heavy: !!def.heavy, broke: false, result: 'block', projectile: proj, reflected: !!def.reflected });
    return 'block';
  }

  _damage(att, src, tgt, def, r, opts, proj) {
    const ctx = this.ctx, game = ctx.game;
    const diff = ctx.state?.difficultyCfg ?? { roundTaken: (d) => d, playerDmgMul: 1 };
    const playerSide = tgt.faction === 'player' || tgt.faction === 'ally';
    const base = typeof opts.dmg === 'number' ? opts.dmg : (typeof def.dmg === 'number' ? def.dmg : 0);
    const harmless = !(base > 0);                             // tutorial dummy / sack, web glob, snatch: knock only
    const critMul = Math.max(opts.crit ?? 1, def.crit ?? 1, this._critTaken(tgt));
    let dmg = base * (opts.dmgMul ?? this.dealtMul(src)) * critMul;
    if (playerSide) {
      dmg = dmg > 0 ? Math.max(0, Math.round(diff.roundTaken(Math.round(dmg)))) : 0;
      const takenMul = tgt.damageTakenMul ?? 1;
      if (takenMul !== 1) dmg = Math.floor(dmg * takenMul);
    } else {
      dmg *= diff.playerDmgMul ?? 1;
      dmg = dmg > 0 ? Math.max(1, Math.round(dmg)) : 0;
    }
    if (tgt.god) dmg = 0;
    const hpBefore = tgt.hp;
    tgt.hp = Math.max(0, hpBefore - dmg);
    if (playerSide) dmg = Math.max(0, Math.min(dmg, hpBefore - tgt.hp));   // her hp setter may soften it

    // knockback / lift, i-frames, poise → stagger
    const armor = !!tgt.superArmor;
    if (!armor && tgt.vel) {
      const k = (def.knock ?? 0) / (tgt.mass || 1);
      tgt.vel.x += _dir.x * k; tgt.vel.z += _dir.z * k;
      if (k > 0) { tgt.vel.y += Math.min(COMBAT.knockLiftMax, k * COMBAT.knockLiftMul); tgt.onGround = false; }
    }
    const isPlayer = tgt.faction === 'player';
    tgt.invulnT = Math.max(tgt.invulnT ?? 0, isPlayer && !harmless ? PLAYER.hurt.iframes : COMBAT.antiMultiHit);
    if (!armor) {
      if (r === 'break') { tgt.staggerT = Math.max(tgt.staggerT ?? 0, PLAYER.guard.breakStagger); tgt.poise = tgt.maxPoise; }
      else if (!isPlayer) {                                   // the player's hurt stun is her own (§7.6)
        tgt.poise = (tgt.poise ?? 0) - (def.poise ?? 1);
        if (tgt.poise <= 0) { tgt.staggerT = Math.max(tgt.staggerT ?? 0, COMBAT.poiseBreakStagger); tgt.poise = tgt.maxPoise; }
      }
    }

    let killed = tgt.hp <= 0;
    const dir = _dir.clone();
    const info = { attacker: src, target: tgt, def, dmg, dir, killed, crit: critMul > 1, critMul, broke: r === 'break', result: r,
      projectile: proj, position: tgt.pos };
    if (killed && typeof tgt.onLethal === 'function' && tgt.onLethal(info) === true) { killed = tgt.hp <= 0; info.killed = killed; }
    // WA §5.1 (combat.W2): the last alerted foe of an encounter → JUICE.finalBlow (longer freeze + a short slow-mo)
    const finalBlow = killed && isFinalBlow(src, tgt, ctx.enemies?.list, ctx.player?.pos ?? src?.pos, def,
      ctx.levels?.current?.arenas);
    info.finalBlow = finalBlow;

    // juice (only when the heroine is involved: companion skirmishes never freeze the world)
    if (isPlayer || src?.faction === 'player') {
      const j = juiceFor(def, isPlayer && harmless ? 'bump' : tgt.faction, src?.faction);
      let hs = j.hitstop, sh = j.shake, rb = j.rumble;
      if (r === 'break') { hs = Math.max(hs, JUICE.guardBreak.hitstop); sh = Math.max(sh, JUICE.guardBreak.shake); rb = JUICE.guardBreak.rumble; }
      if (killed) { hs += JUICE.kill.hitstopAdd; sh += JUICE.kill.shakeAdd; }
      if (finalBlow) hs += JUICE.finalBlow.hitstopAdd;
      if (hs > 0) game.requestHitstop(hs);
      this._shake(sh);
      this._rumble(rb);
    }

    this.stats.hits++;
    if (r === 'break') this.stats.breaks++;
    if (isPlayer && src && src !== tgt && src.id != null) this._hitHer.set(src.id, game?.time ?? 0);
    tgt.onHit?.(info);
    if (killed) {
      tgt.alive = false;
      this.stats.kills++;
      tgt.onDeath?.({ attacker: src, def, projectile: proj });
      if (finalBlow) {
        this.stats.finalBlows++;
        game?.slowMo?.(JUICE.finalBlow.timeScale, JUICE.finalBlow.slowMo);   // real seconds; no camera zoom (WA §5.1)
      }
    }
    this._log(def, r, dmg, tgt, killed, critMul > 1);
    ctx.bus.emit(E.HIT, { attacker: src, target: tgt, attackId: def.id, damage: dmg, position: tgt.pos.clone(), dir, killed,
      blocked: false, parried: false, crit: critMul > 1, popsSlime: !!def.popsSlime, heavy: !!def.heavy, broke: r === 'break',
      result: r, projectile: proj, reflected: !!def.reflected, finalBlow });
    return r;
  }

  /** Direction the hit travels into the target (XZ, unit): projectile velocity, else from `from`/attacker to target. */
  _hitDir(att, tgt, from, out) {
    if (att.isProjectile && att.vel && (att.vel.x || att.vel.z)) out.set(att.vel.x, 0, att.vel.z);
    else {
      const o = from ?? att.pos;
      out.set(tgt.pos.x - o.x, 0, tgt.pos.z - o.z);
    }
    if (out.lengthSq() < 1e-8) out.set(Math.sin(att.facing ?? 0), 0, Math.cos(att.facing ?? 0));
    return out.normalize();
  }

  _critTaken(tgt) {
    if (typeof tgt.critTaken === 'number') return tgt.critTaken;
    // TT3 Catnip Cloud: the first hit on a giddy foe is the ×1.5 "belly-rub bonk" (Enemy.onHit then wakes it)
    if (tgt.stateName === 'giddy' && tgt.giddyT > 0) return TRICKS.cloud.bellyMul;
    return tgt.isDizzy === true ? DIZZY.critMul : 1;
  }

  /**
   * Area hit (pounce landing ring, crow dive, jelly slam, pug_slam shockwave ring, cheese bombs, Golden Hour...):
   * everything targetable whose cylinder overlaps the ring [rInner, r] around `center` and the height band
   * [center.y + y0, center.y + y1]. Returns the number of damaging hits; ids go into `hitSet` when given.
   * @param {any} att @param {any} def
   * @param {{ center?: THREE.Vector3, r?: number, rInner?: number, y0?: number, y1?: number, hitSet?: Set<number>,
   *   dmg?: number, dmgMul?: number, crit?: number, from?: THREE.Vector3 }} [opts]
   */
  areaHit(att, def, opts = {}) {
    const c = opts.center ?? att.pos;
    const R = opts.r ?? (typeof def.r === 'number' ? def.r : def.arc?.range ?? 1);
    const rIn = opts.rInner ?? 0;
    const y0 = opts.y0 ?? def.arc?.y0 ?? 0, y1 = opts.y1 ?? def.arc?.y1 ?? (att.height ?? 1);
    const list = this.ctx.actors.queryRadius(c, R + COMBAT.queryPad, this.targetFilter(att.faction), this._borrow());
    const from = opts.from ?? c;
    const seen = this._seenSet();                                 // ids resolved by this call (wall redirects)
    let n = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        let t = list[i];
        if (t === att || !t.alive || !t.hurtable || opts.hitSet?.has(t.id) || seen.has(t.id)) continue;
        const d = Math.hypot(t.pos.x - c.x, t.pos.z - c.z), tr = t.radius ?? 0;
        if (d > R + tr || d < rIn - tr) continue;
        if (t.pos.y > c.y + y1 || t.pos.y + (t.height ?? 1) < c.y + y0) continue;
        const wall = this.wallFor(att, t, from);                  // shielded by a Shield Wall: it takes the blast once
        if (wall) { if (seen.has(wall.id) || opts.hitSet?.has(wall.id)) continue; t = wall; }
        seen.add(t.id);
        const res = this.applyHit(att, t, def, { dmg: opts.dmg, dmgMul: opts.dmgMul ?? this.dealtMul(att), crit: opts.crit, from });
        if (res === 'none') continue;
        opts.hitSet?.add(t.id);
        if (res === 'hit' || res === 'break') n++;
      }
    } finally { this._release(); }
    return n;
  }

  /** Stagger every hostile within `r` of `att` for `dur` s (Golden Hour activation: 8 m, 0.5 s). Returns the count. */
  staggerArea(att, r, dur) {
    const list = this.ctx.actors.queryRadius(att.pos, r, this.targetFilter(att.faction), this._borrow());
    let n = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t === att || !t.alive || t.breakable) continue;
        if (typeof t.stagger === 'function') t.stagger(dur); else t.staggerT = Math.max(t.staggerT ?? 0, dur);
        n++;
      }
    } finally { this._release(); }
    return n;
  }

  /**
   * §7.2 soft auto-target (CONTROLS_SPEC §12 combat 1): the lowest-score target of `actor` within `range` (edge
   * distance) and `angle` (half-cone) of the reference direction, by
   *   dist + 2·|angle|/π − 2.5·winding up on her − 1·selected − 0.8·hp<30 % − 0.5·hit her in the last 2 s + 3·breakable,
   * with stickiness (`prev` stays unless a challenger beats it by AIM.sticky 0.75). Crows only below
   * `hittableBelow`; breakables only with `opts.breakables` and no hostile within 6 m.
   * `out` (optional) receives the breakdown — see targeting.pickAssist. Legacy call: a 4th argument that is an actor is
   * `opts.prefer` (returned outright while it is inside range and cone).
   * @param {any} actor @param {number} range @param {number} angle half-angle (π = all around)
   * @param {any} [out] breakdown out (or, legacy, the preferred actor)
   * @param {{ dir?: number|{x:number,z:number}, sticky?: boolean, prev?: any, breakables?: boolean, selected?: any,
   *   prefer?: any }} [opts] `dir`: yaw or vector of the stick / aim (default: facing)
   * @returns {any|null}
   */
  assistTarget(actor, range, angle, out = null, opts = NO_OPTS) {
    if (!actor?.pos) return null;
    opts ??= NO_OPTS;
    let prefer = opts.prefer;
    if (out && out.pos) { prefer = out; out = null; }         // legacy: a 4th argument that is an actor = prefer
    const filter = this.targetFilter(actor.faction);
    const dir = opts.dir;
    const refYaw = typeof dir === 'number' ? dir : dir && (dir.x || dir.z) ? Math.atan2(dir.x, dir.z) : (actor.facing ?? 0);
    if (prefer && prefer !== actor && prefer.pos && prefer.alive !== false && prefer.hurtable !== false && !prefer.hidden && filter(prefer)) {
      const dx = prefer.pos.x - actor.pos.x, dz = prefer.pos.z - actor.pos.z;
      if (Math.hypot(dx, dz) - (prefer.radius ?? 0) <= range && Math.abs(wrapAngle(Math.atan2(dx, dz) - refYaw)) <= angle) {
        if (out) { out.target = prefer; out.score = -Infinity; out.terms = null; out.kept = false; out.prevScore = Infinity; (out.list ??= []).length = 0; }
        return prefer;
      }
    }
    const list = this.ctx.actors.queryRadius(actor.pos, range + COMBAT.queryPad, filter, this._borrow());
    const o = this._assistOpts;                                   // PERF B1: one reused option bag, pre-bound hooks
    o.range = range; o.angle = angle; o.refYaw = refYaw; o.prev = opts.prev ?? null; o.sticky = opts.sticky;
    o.breakables = opts.breakables === true; o.selected = opts.selected ?? null; o.groundY = actor.pos.y;
    try {
      return pickAssist(actor, list, o, out ?? undefined);
    } finally { o.prev = null; o.selected = null; this._release(); }
  }

  /** Damage multiplier the heroine deals: sharpness upgrade × Golden Hour. 1 for everyone else. */
  dealtMul(actor) {
    if (!actor || actor.faction !== 'player') return 1;
    const sharp = sharpMul(this.ctx.state?.upgrades?.sharp ?? 0);
    return sharp * (actor.golden ? PLAYER.golden.dmgMul : 1);
  }

  /** Cached filter: actors `faction` may hit (hostile factions; plus `breakable` props for the player side). */
  targetFilter(faction) {
    let f = this._filters.get(faction);
    if (!f) {
      const playerSide = faction === 'player' || faction === 'ally';
      f = (a) => isHostile(faction, a.faction) || (playerSide && a.breakable === true);
      this._filters.set(faction, f);
    }
    return f;
  }

  // ================================================================ projectiles
  /**
   * Fire a projectile (§19.3). `def` = an attack def (rat_bolt: `projectile: {speed, range, r}`) or a projectile
   * attack (holyWave / gleam: `{speed, range, width}`). See Projectiles.spawn for `opts`. Returns the projectile.
   */
  spawnProjectile(def, owner, pos, dir, opts) {
    const d = typeof def === 'string' ? ATTACKS[def] : def;
    return this.projectiles.spawn(d, owner, pos, dir, opts);
  }

  /** §19.4: flip ×reflectSpeedMul, owner = the parrying actor, dmg = reflectDmg (also called by a parry). */
  reflect(p, by, opts) { return this.projectiles.reflect(p, by, opts); }

  // ================================================================ system
  update(dt) {
    this.projectiles.update(dt);
    this.tokens.prune(this._keepToken);
  }

  render(alpha, frameDt) { this.projectiles.render(alpha, frameDt); }

  clear() {
    this.projectiles.clear();
    this.tokens.clear();
    this.lastParry = null;
  }

  dispose() {
    this.clear();
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.projectiles.dispose();
  }

  // ================================================================ internals
  /** Per-step shake cap: several targets hit in one step shake like the strongest hit, not their sum. */
  _shake(trauma) {
    if (!(trauma > 0)) return;
    const key = this._stepKey();
    if (key !== this._shakeKey) { this._shakeKey = key; this._shakeMax = 0; }
    const extra = trauma - this._shakeMax;
    if (extra <= 1e-6) return;
    this._shakeMax = trauma;
    this.ctx.bus.emit(E.SHAKE, { trauma: extra });
  }

  _rumble(r) {
    if (!r) return;
    const key = this._stepKey();
    if (key === this._rumbleKey) return;
    this._rumbleKey = key;
    this.ctx.input?.rumble?.(r[0], r[1], r[2]);
  }

  _stepKey() { const g = this.ctx.game; return g?.stepCount ?? g?.frameCount ?? 0; }

  _log(def, result, damage, tgt, killed, crit) {
    const e = { attackId: def?.id ?? null, result, damage, target: tgt?.def?.id ?? tgt?.actorId ?? tgt?.faction ?? null, targetId: tgt?.id ?? null, killed, crit,
      time: this.ctx.game?.time ?? 0 };
    this.log.push(e);
    if (this.log.length > 16) this.log.shift();
  }

  /** Scratch arrays for queryRadius, one per nesting level (applyHit callbacks may query again). */
  _borrow() {
    const a = this._scratch[this._depth] ?? (this._scratch[this._depth] = []);
    this._depth++;
    return a;
  }

  _release() { this._depth = Math.max(0, this._depth - 1); }

  /** A cleared scratch Set for the current nesting level (call right after `_borrow`). */
  _seenSet() {
    const k = this._depth - 1, sets = this._sets;
    const set = sets[k] ?? (sets[k] = new Set());
    set.clear();
    return set;
  }
}
