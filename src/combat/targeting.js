// src/combat/targeting.js  (owner: combat) — pure targeting maths for the iso controls (CONTROLS_SPEC §7–§8).
//
//   aimCfg()                       config.AIM (CONTROLS_SPEC §13) with every key filled from AIM_FALLBACK, so this
//                                  area works before / after core lands the table (no literals in the logic)
//   assistCone(device, o)          magnet cone + range around the RESOLVED aim (§7.1; contract change C5)
//   scoreCandidate(...)            the §7.2 soft auto-target score (lower wins) with its term breakdown
//   pickAssist(...)                best candidate + stickiness (§7.2 "sticky 0.75")
//   lungeFor(dist, range, lunge)   lunge magnetism (§7.1): clamp(dist − 0.7 × range, lunge, lunge + 1.0)
//   lungeSpeed(def, dist, range)   the same in the units swings use: `def.lunge` is a speed (m/s) held over the lunge
//                                  window, so the clamp runs on the distance it covers and returns the speed
//   isParryKind / isWindupKind     telegraph kinds the parry ring / the windup bonus care about
//   normalizeTelegraph(p, now)     the guaranteed `combat:telegraph` fields (windup, activeAt, targetsPlayer, glyph,
//                                  lane `end`) filled when an emitter left them out (IMPLEMENTATION_PLAN §7.1, WA §3.4)
//   ThreatBook                     live melee wind-ups (from combat:telegraph) → nextParryable (§8.2 parry ring,
//                                  §8.1 threat snap), with activeAt / windup filled when enemies don't send them
//
// Pure and node-safe: no three.js, no DOM, no ctx. Positions are duck-typed `{x, y, z}`.
import * as CFG from '../core/config.js';
import { wrapAngle } from '../core/math.js';

/**
 * CONTROLS_SPEC §13 `AIM` values this area reads, used only for keys `config.AIM` does not carry (yet), plus the
 * few combat-only numbers the spec states in prose (§7.2 "hit her within the last 2 s", §8.2 ring lead 0.6 s,
 * §12 combat 4: reflect toward the aim within ±25°). requests/combat.md asks core to adopt the extra keys.
 */
export const AIM_FALLBACK = Object.freeze({
  kbmCone: 0.436, kbmExtra: 1.0, selCone: 0.698, padCone: 0.785, padRange: 3.5, touchCone: Math.PI / 2,
  touchRange: 4.5, kbRange: 3.0, sticky: 0.75, lungeExtra: 1.0, lungeFrac: 0.7, selExtra: 1.5,
  score: Object.freeze({ angle: 2.0, windup: 2.5, selected: 1.0, lowHp: 0.8, lowHpFrac: 0.3, recentHit: 0.5, breakable: 3.0 }),
  breakableClear: 6, standSnapRange: 5, standSnapLead: 0.7,
  // combat-only (prose numbers of the spec)
  recentHitWindow: 2.0, reflectCone: 0.436, reflectRange: 16, projectileLead: 1.0, lungeSettle: 0.05, ringLead: 0.6, threatRange: 6, threatKeep: 0.1,
  hittableBelowDefault: 2.2,
});

let _cfgSrc = null, _cfg = AIM_FALLBACK;
/** The merged AIM table (cached per config object identity). */
export function aimCfg() {
  const src = CFG.AIM;
  if (src === _cfgSrc) return _cfg;
  _cfgSrc = src;
  _cfg = src ? Object.freeze({ ...AIM_FALLBACK, ...src, score: Object.freeze({ ...AIM_FALLBACK.score, ...(src.score ?? {}) }) }) : AIM_FALLBACK;
  return _cfg;
}

/** Telegraph kinds the Stand can parry (white / gold glints): the parry ring (§8.2.2) and the threat snap (§8.1). */
export const PARRY_KINDS = Object.freeze(new Set(['parry', 'gold']));
/** Kinds that count as "winding up on her" for the §7.2 score (red too: dodge it, but it is the threat). */
export const WINDUP_KINDS = Object.freeze(new Set(['parry', 'gold', 'red']));
/** Melee wind-up kinds that get a strike wedge (§8.2.1); `combat:telegraph` payloads of these kinds are filled. */
export const MELEE_KINDS = Object.freeze(new Set(['parry', 'gold', 'red', 'grab']));
export const isParryKind = (k) => PARRY_KINDS.has(k);
export const isWindupKind = (k) => WINDUP_KINDS.has(k);

/**
 * Aim-assist (magnet) cone around the resolved aim (§7.1). `device` ∈ kbm | pad | touch; `o.auto` = the soft
 * auto-target is the aim source (keyboard-only preset, pad without RS, touch with an idle stick: 360°);
 * `o.selected` = the candidate is the selected target (KBM ±40°); `o.arcRange` = the swing's reach.
 * @param {string} device @param {{ arcRange?: number, selected?: boolean, auto?: boolean, padAim?: boolean, stickIdle?: boolean }} [o]
 * @returns {{ angle: number, range: number }}
 */
export function assistCone(device, o = {}) {
  const A = aimCfg(), reach = o.arcRange ?? CFG.PLAYER?.assist?.range ?? A.kbRange;
  if (device === 'touch') return { angle: o.stickIdle ? Math.PI : A.touchCone, range: A.touchRange };
  if (device === 'pad') {
    if (o.padAim) return { angle: A.padCone, range: A.padRange };
    return { angle: Math.PI, range: A.padRange };                                  // pad auto: soft auto-target
  }
  if (o.auto) return { angle: Math.PI, range: A.kbRange };                          // keyboardOnly preset
  return { angle: o.selected ? A.selCone : A.kbmCone, range: reach + A.kbmExtra };
}

/** Auto-target search range per device (§7.2 candidates: 4.5 m touch / 3.5 m pad / 3 m keyboard-only). */
export function autoRange(device) {
  const A = aimCfg();
  return device === 'touch' ? A.touchRange : device === 'pad' ? A.padRange : A.kbRange;
}

/**
 * Lunge magnetism (§7.1, touch / pad / auto-target only): the step a swing lunges when its target stands beyond
 * reach. Returns `lunge` unchanged when the target is within range.
 * @param {number} dist edge distance to the target @param {number} range swing reach @param {number} lunge the def's lunge
 */
export function lungeFor(dist, range, lunge, extra = aimCfg().lungeExtra) {
  const base = lunge ?? 0;
  if (!(dist > range)) return base;
  const want = dist - aimCfg().lungeFrac * range;
  return Math.min(base + extra, Math.max(base, want));
}

/** The lunge window of a swing def (s): from half-way to the active frames to their end (PlayerStates' push). */
export function lungeWindow(def) {
  const act = def?.active ?? [0, def?.dur ?? 0.4];
  return Math.max(0, act[1] - act[0] * 0.5);
}

/**
 * Lunge magnetism in swing units (§7.1, GAME_DESIGN "lunge up to 1.0 m further to close a gap"): `def.lunge` is the
 * forward speed (m/s) a swing pushes over `lungeWindow(def)`, which covers ≈ lunge × (window − lungeSettle) m. The
 * clamp of `lungeFor` runs on that distance — clamp(dist − 0.7 × range, base, base + 1.0) — and the speed that covers
 * it comes back. Returns `def.lunge` when the target is within reach (or the def has no lunge / window).
 * @param {any} def swing def @param {number} dist edge distance to the target @param {number} [range] reach (def arc)
 */
export function lungeSpeed(def, dist, range = def?.arc?.range ?? 0) {
  const lunge = def?.lunge;
  if (typeof lunge !== 'number') return lunge;
  const w = lungeWindow(def) - aimCfg().lungeSettle;
  if (!(w > 0.02) || !(dist > range)) return lunge;
  const base = lunge * w;
  return lungeFor(dist, range, base) / w;
}

/**
 * §7.2 soft auto-target score of one candidate (lower wins). Writes the term breakdown into `terms` when given.
 * Filtering (range, cone, faction) is the caller's job; this is just the formula.
 * @param {{pos:{x:number,z:number}}} from @param {any} t candidate
 * @param {number} aimYaw yaw of the reference direction (stick / aim, else facing)
 * @param {{ windup?: boolean, selected?: boolean, recentHit?: boolean, breakable?: boolean }} f flags
 * @param {object} [terms] breakdown out
 */
export function scoreCandidate(from, t, aimYaw, f, terms) {
  const S = aimCfg().score;
  const dx = t.pos.x - from.pos.x, dz = t.pos.z - from.pos.z;
  const dist = Math.max(0, Math.hypot(dx, dz) - (t.radius ?? 0));
  const ang = dist > 1e-6 || Math.hypot(dx, dz) > 1e-6 ? Math.abs(wrapAngle(Math.atan2(dx, dz) - aimYaw)) : 0;
  const maxHp = t.maxHp ?? t.hpMax ?? 0;
  const lowHp = maxHp > 0 && t.hp > 0 && t.hp / maxHp < S.lowHpFrac;
  const angle = S.angle * (ang / Math.PI);
  const windup = f.windup ? -S.windup : 0;
  const selected = f.selected ? -S.selected : 0;
  const low = lowHp ? -S.lowHp : 0;
  const recent = f.recentHit ? -S.recentHit : 0;
  const brk = f.breakable ? S.breakable : 0;
  const score = dist + angle + windup + selected + low + recent + brk;
  if (terms) {
    terms.dist = dist; terms.ang = ang; terms.angle = angle; terms.windup = windup; terms.selected = selected;
    terms.lowHp = low; terms.recentHit = recent; terms.breakable = brk; terms.score = score;
  }
  return score;
}

/**
 * §7.2 soft auto-target over a candidate list: filter (alive, hurtable, not hidden / dormant, low enough, within
 * `range` edge distance and `angle` half-cone of `refYaw`; breakables only with no hostile within `breakableClear`),
 * score each with `scoreCandidate`, and keep `prev` unless a challenger beats it by `AIM.sticky` (no ping-pong).
 * Hostility / faction filtering is the caller's job (`cands` are already the actor's targets).
 *
 * `out` (optional) receives the breakdown: `{ target, score, terms, kept, prevScore, list: [{actor, score, terms}] }`
 * (`list` holds every candidate that passed the filter; `kept` = the sticky rule kept `prev`). PERF B1: allocation
 * free with an array `cands` — the `list` rows and their `terms` are pooled on `out._pool` and REUSED by the next
 * call on the same `out` (copy what you keep).
 * @param {{pos:{x:number,y?:number,z:number}}} from
 * @param {Iterable<any>} cands
 * @param {{ range: number, angle?: number, refYaw: number, selected?: any, prev?: any, sticky?: boolean,
 *   breakables?: boolean, windup?: (a:any) => boolean, recentHit?: (a:any) => boolean, groundY?: number }} o
 * @param {any} [out]
 * @returns {any|null}
 */
export function pickAssist(from, cands, o, out) {
  const A = aimCfg(), here = from.pos, range = o.range, half = o.angle ?? Math.PI;
  const groundY = o.groundY ?? here.y ?? 0, allowBrk = o.breakables !== false;
  const arr = Array.isArray(cands) ? cands : null;
  const src = arr ?? Array.from(cands);                        // non-array iterables (tests) copy once; arrays never
  const n = src.length;
  let hostileNear = false;
  if (allowBrk) {
    for (let i = 0; i < n; i++) {
      const a = src[i];
      if (!assistable(a, from) || a.breakable) continue;
      if (Math.hypot(a.pos.x - here.x, a.pos.z - here.z) - (a.radius ?? 0) <= A.breakableClear) { hostileNear = true; break; }
    }
  }
  let used = 0;
  if (out) {
    out.target = null; out.score = Infinity; out.terms = null; out.kept = false; out.prevScore = Infinity;
    (out.list ??= []).length = 0;
    out._pool ??= [];
  }
  const f = _flags;
  let best = null, bs = Infinity, bestTerms = null, prevScore = Infinity, prevTerms = null;
  for (let i = 0; i < n; i++) {
    const a = src[i];
    if (!assistable(a, from)) continue;
    if (a.breakable && (!allowBrk || hostileNear)) continue;
    if (!lowEnough(a, groundY)) continue;
    const dx = a.pos.x - here.x, dz = a.pos.z - here.z, d = Math.hypot(dx, dz) - (a.radius ?? 0);
    if (d > range) continue;
    if (half < Math.PI - 1e-6 && d > 1e-3 && Math.abs(wrapAngle(Math.atan2(dx, dz) - o.refYaw)) > half) continue;
    f.windup = !!o.windup?.(a); f.selected = o.selected != null && a === o.selected;
    f.recentHit = !!o.recentHit?.(a); f.breakable = !!a.breakable;
    let entry = null, t = null;
    if (out) {                                                   // pooled breakdown rows: reused across calls
      entry = out._pool[used] ?? (out._pool[used] = { actor: null, score: 0, terms: {} });
      used++;
      t = entry.terms;
    }
    const sc = scoreCandidate(from, a, o.refYaw, f, t);
    if (entry) { entry.actor = a; entry.score = sc; out.list.push(entry); }
    if (a === o.prev) { prevScore = sc; prevTerms = t; }
    if (sc < bs) { bs = sc; best = a; bestTerms = t; }
  }
  let kept = false;
  if ((o.sticky ?? o.prev != null) && o.prev && prevScore < Infinity && best !== o.prev && bs > prevScore - A.sticky) {
    best = o.prev; bs = prevScore; bestTerms = prevTerms; kept = true;
  }
  if (out) {
    out.target = best; out.score = bs; out.terms = bestTerms; out.kept = kept; out.prevScore = prevScore;
    const pool = out._pool;                                       // drop stale actor refs held by unused rows
    for (let i = used; i < pool.length; i++) pool[i].actor = null;
  }
  return best;
}

/** Scratch flags for scoreCandidate (pickAssist is not re-entrant: its hooks never call back into it). */
const _flags = { windup: false, selected: false, recentHit: false, breakable: false };

/** Candidate filter of pickAssist: alive, hurtable, visible, awake, not the picker itself. */
function assistable(a, from) {
  return !!a && a !== from && !!a.pos && a.alive !== false && a.hurtable !== false && !a.hidden && !a.dormant;
}

/** Is a flyer (crow) low enough to be hit (§7.2: crows only below `hittableBelow` 2.2 m)? */
export function lowEnough(t, groundY) {
  const below = t.def?.hittableBelow;
  if (below == null) return true;
  if (t.grounded) return true;
  return (t.pos.y - (groundY ?? 0)) <= below;
}

/** Telegraph shapes whose payload carries the lane end point `end` (AUTOCAM §6.2 THREAT / BOSS_LANE subjects). */
export const LANE_SHAPES = Object.freeze(new Set(['lane', 'line']));

/** The WA §3.4 glyph of a telegraph kind (`config.TELEGRAPH.glyph`), or null for kinds without one (jeer). */
export function glyphFor(kind) {
  return CFG.TELEGRAPH?.glyph?.[kind] ?? null;
}

/**
 * Lane end point (pos + unit dir × length, XZ; y = pos.y) of a `lane` / `line` telegraph, or null. Length:
 * `lane.l`, `l`, `range`, then `size` (a number, or `[w, l]`). Mirrors enemies' `laneEnd`; returns a new `{x, y, z}`.
 * @param {any} p telegraph payload
 */
export function telegraphLaneEnd(p) {
  const lane = p?.lane ?? null;
  if (!p || (!lane && !LANE_SHAPES.has(p.shape))) return null;
  const pos = p.pos, d = lane?.dir ?? p.dir;
  if (!pos || !d) return null;
  const sz = Array.isArray(p.size) ? p.size[1] : p.size;
  const l = lane?.l ?? p.l ?? p.range ?? sz ?? null;
  const n = Math.hypot(d.x ?? 0, d.z ?? 0);
  if (!(n > 1e-6) || !(l > 0)) return null;
  return { x: pos.x + (d.x / n) * l, y: pos.y ?? 0, z: pos.z + (d.z / n) * l };
}

/**
 * IMPLEMENTATION_PLAN §7.1 / AUTOCAM §15 combat 2 / WA §3.4 (combat.W1): make a `combat:telegraph` payload carry the
 * guaranteed fields, filling (mutating) ONLY the keys the emitter left out:
 *   windup (s; default `duration`), activeAt (absolute game.time; default now + windup + the def's `active[0]` for
 *   melee kinds), targetsPlayer (bool; `hooks.targets`, default true when there is no actor), glyph
 *   (`TELEGRAPH.glyph[kind]` or null) and `end` for `lane` / `line` shapes (or any payload with a `lane`).
 * Idempotent and allocation-free except the one `end` object it may create. Returns `p`.
 * @param {any} p @param {number} now game.time
 * @param {{ defOf?: (actor:any, p:any) => any, targets?: (actor:any, p:any) => boolean }} [hooks]
 */
export function normalizeTelegraph(p, now, hooks) {
  if (!p || typeof p !== 'object') return p;
  if (typeof p.windup !== 'number') p.windup = typeof p.duration === 'number' ? p.duration : 0;
  if (typeof p.activeAt !== 'number') {
    const def = MELEE_KINDS.has(p.kind) && p.actor ? hooks?.defOf?.(p.actor, p) ?? null : null;
    p.activeAt = now + p.windup + (def?.active?.[0] ?? 0);
  }
  if (typeof p.targetsPlayer !== 'boolean') {
    let t = true;
    if (p.actor && hooks?.targets) { try { t = !!hooks.targets(p.actor, p); } catch { t = true; } }
    p.targetsPlayer = t;
  }
  if (p.glyph == null) p.glyph = glyphFor(p.kind);
  if (p.end == null && (p.lane || LANE_SHAPES.has(p.shape))) p.end = telegraphLaneEnd(p);
  return p;
}

/**
 * Live melee wind-ups (fed from `combat:telegraph` / `combat:telegraphEnd`) and the queries built on them.
 * Entries are pooled; `now()` is sim time. An entry outlives its telegraph only while the strike it announced has
 * not reached `activeAt` yet (a swing whose active frames start late in the strike).
 */
export class ThreatBook {
  /** @param {() => number} now */
  constructor(now) {
    this.now = now;
    /** @type {Map<number, any>} telegraph id → entry */
    this.live = new Map();
    /** the same entries as a dense array: every query walks it by index (Map iterators allocate; PERF B1) */
    this.entries = [];
    this._pool = [];
  }

  /**
   * Record a telegraph. Fills (mutates) the payload with the §8.5 fields enemies may not send yet: `attackId`,
   * `arc`, `range`, `windup`, `activeAt`, `targetsPlayer` (only keys that are missing). Returns the entry or null.
   * @param {any} p payload @param {{ defOf?: (actor:any, p:any) => any, targets?: (actor:any, p:any) => boolean }} [hooks]
   */
  add(p, hooks = {}) {
    if (!p || p.id == null || !p.actor || !MELEE_KINDS.has(p.kind)) return null;
    const now = this.now();
    const def = hooks.defOf?.(p.actor, p) ?? null;
    const windup = typeof p.windup === 'number' ? p.windup : (p.duration ?? 0);
    const active0 = def?.active?.[0] ?? 0;
    const activeAt = typeof p.activeAt === 'number' ? p.activeAt : now + windup + active0;
    if (p.attackId === undefined && def?.id) p.attackId = def.id;
    if (p.arc === undefined && def?.arc) p.arc = def.arc;
    if (p.range === undefined && (def?.arc?.range ?? def?.r) != null) p.range = def.arc?.range ?? def.r;
    if (p.windup === undefined) p.windup = windup;
    if (p.activeAt === undefined) p.activeAt = activeAt;
    const targets = typeof p.targetsPlayer === 'boolean' ? p.targetsPlayer : (hooks.targets?.(p.actor, p) ?? true);
    if (p.targetsPlayer === undefined) p.targetsPlayer = targets;
    let e = this.live.get(p.id);
    if (!e) { e = this._pool.pop() ?? {}; this.entries.push(e); }
    e.id = p.id; e.actor = p.actor; e.kind = p.kind; e.start = now; e.windup = windup; e.activeAt = activeAt;
    e.attackId = p.attackId ?? null; e.targetsPlayer = targets; e.ended = false; e.payload = p;
    this.live.set(p.id, e);
    return e;
  }

  /**
   * The telegraph ended. Keeps the entry until `activeAt` when `striking(actor)` says the announced strike is
   * underway (the glint ends at strike start, the blade may land a little later); otherwise drops it.
   * @param {number} id @param {(actor:any) => boolean} [striking]
   */
  end(id, striking) {
    const e = this.live.get(id);
    if (!e) return;
    if (this.now() < e.activeAt - 1e-6 && striking?.(e.actor)) { e.ended = true; return; }
    this._drop(id, e);
  }

  /** Drop entries past their strike (+keep), dead attackers and ended wind-ups of staggered attackers. */
  prune(keep = aimCfg().threatKeep) {
    const now = this.now(), list = this.entries;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i], a = e.actor;
      if (!a || a.alive === false || now > e.activeAt + keep || (e.ended && (a.staggerT ?? 0) > 0)) this._drop(e.id, e);
    }
  }

  clear() { const list = this.entries; for (let i = list.length - 1; i >= 0; i--) this._drop(list[i].id, list[i]); }

  _drop(id, e) {
    if (this.live.get(id) === e) this.live.delete(id);
    const list = this.entries, i = list.indexOf(e);
    if (i >= 0) { list[i] = list[list.length - 1]; list.length--; }
    e.actor = null; e.payload = null; this._pool.push(e);
  }

  /** Does `actor` have a live wind-up of one of `kinds` aimed at the player (§7.2 "winding up on her")? */
  windingUp(actor, kinds = WINDUP_KINDS) {
    const list = this.entries;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.actor === actor && kinds.has(e.kind) && e.targetsPlayer && !e.ended) return true;
    }
    return false;
  }

  /**
   * The most imminent live parryable wind-up on `victim` (soonest `activeAt`, then nearest), or null.
   * `aimedAt(e)` decides whether the entry is aimed at this victim (default: `targetsPlayer`).
   * @param {{pos:any}} victim @param {number} maxDist @param {(e:any) => boolean} [aimedAt]
   */
  soonest(victim, maxDist, aimedAt) {
    const now = this.now();
    let best = null, bt = Infinity, bd = Infinity;
    const list = this.entries;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!PARRY_KINDS.has(e.kind) || e.activeAt < now - 1e-6) continue;
      const a = e.actor;
      if (!a?.pos || a.alive === false || (a.staggerT ?? 0) > 0) continue;
      if (aimedAt ? !aimedAt(e) : !e.targetsPlayer) continue;
      const d = Math.hypot(a.pos.x - victim.pos.x, a.pos.z - victim.pos.z) - (a.radius ?? 0);
      if (d > maxDist) continue;
      if (e.activeAt < bt - 1e-6 || (Math.abs(e.activeAt - bt) <= 1e-6 && d < bd)) { best = e; bt = e.activeAt; bd = d; }
    }
    return best;
  }
}

/**
 * Time (s) until a projectile moving with `vel` from `pos` passes within `reach` of `target` (XZ, straight-line),
 * or Infinity if it is moving away / misses. Used for incoming bolts in nextParryable.
 */
export function timeToContact(pos, vel, target, reach) {
  const rx = target.x - pos.x, rz = target.z - pos.z;
  const vv = vel.x * vel.x + vel.z * vel.z;
  if (vv < 1e-8) return Infinity;
  const tc = (rx * vel.x + rz * vel.z) / vv;                       // closest approach
  if (tc < 0) return Math.hypot(rx, rz) <= reach ? 0 : Infinity;
  const cx = rx - vel.x * tc, cz = rz - vel.z * tc;
  const miss2 = cx * cx + cz * cz;
  if (miss2 > reach * reach) return Infinity;
  return Math.max(0, tc - Math.sqrt(reach * reach - miss2) / Math.sqrt(vv));
}
