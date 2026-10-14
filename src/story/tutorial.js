// src/story/tutorial.js  (owner: story) — Morning Practice, the playable tutorial (WARM_ADVENTURE_SPEC §6–§7, ON §4),
// and the one-time gameplay hints that follow it (`tut.milk`, `tut.valor`, the WA §7.3 glyph one-shots, …).
//
// Seven lessons on the sunny practice field (meadow, `meadow_morning`), Pearl guiding from a bubble, each one ending in
// a sticker (E.REWARD) and the next lesson 0.6 s later:
//   move  race Pearl to the straw dummy (done within PRACTICE.bonkR of a dummy, or 10 m travelled; 3 sun sparkles)
//   bonk  Snip–Snap–Swoosh on a dummy (slash3, or 6 dummy hits) → `tutbow`: Pearl straightens the Pink Bow (flavour; friend card)
//   jump  hop the 1.0 m inner fence (z −87, x −20…−2) in either direction (sets flag `tut.jump.done`: the nav link)
//   roll  tumble past Sir Sacky (8, −84)
//   stand block Sir Wobble once            parry  parry him once (the first swing runs in 0.45 slow motion)
//   meow  hide and seek: Pearl hides in the Very Suspicious Cow (12, −72); warmer / colder clues; Meow wakes the cow
//         → `tutpearl`; Pearl stays and leads Clem to the height chart (StoryManager plays CS-01 there).
// Done (or skipped: hold Pause 1 s) → flag `prologue.practice` + `tut.jump.done`.
// Prompts go out as `story:prompt { kind: 'tutorial', id: 'tutorial', textKey, step, total, progress, done, speaker,
// say, stepDots, folded, wiggle, ok, demo }` (WA §7.5: the guide bubble; payloads without `speaker` render the old
// card). The pure step logic (PracticeLog) and the pure guide timers (GuideClock) are unit-tested.
import { E } from '../core/events.js';
import { PLAYER, STORY, FADE_COLOR } from '../core/config.js';
import { reward } from './rewards.js';
import { buildSunRing } from './cutscenes/rig.js';

/**
 * Device-aware strings lookup (CONTROLS_SPEC §12): `key.touch` / `key.pad` for those devices when present, else `key`.
 * @param {object} ctx @param {string} key @returns {string}
 */
export function devText(ctx, key) {
  const s = ctx?.strings, dev = ctx?.input?.device;
  if ((dev === 'touch' || dev === 'pad') && s?.has?.(`${key}.${dev}`)) return s.t(`${key}.${dev}`);
  return s?.t?.(key) ?? key;
}

/** WA §7.1 lessons, in order. `guide` speaks `intro` when the lesson starts and `praise` when it is done. */
export const TUTORIAL_STEPS = Object.freeze([
  { id: 'move', textKey: 'tut.move', guide: 'pearl', intro: 'pearl.race', demo: 'tap' },
  { id: 'bonk', textKey: 'tut.bonk', guide: 'pearl', intro: 'pearl.bonk', demo: 'tap', reward: 'bonk' },
  { id: 'jump', textKey: 'tut.jump', guide: 'pearl', intro: 'pearl.fence', demo: 'tap', reward: 'hop' },
  { id: 'roll', textKey: 'tut.roll', guide: 'pearl', intro: 'pearl.sack', demo: 'swipe', reward: 'roll', praise: 'pearl.roll.ok' },
  { id: 'stand', textKey: 'tut.stand', guide: 'pearl', intro: 'pearl.wobble', demo: 'hold', need: 1, reward: 'stand' },
  { id: 'parry', textKey: 'tut.parry', guide: 'pearl', intro: 'pearl.parry', demo: 'tap', reward: 'parry', praise: 'pearl.parry.ok' },
  { id: 'meow', textKey: 'tut.meow', guide: 'pearl', intro: 'pearl.hide', demo: 'tap', reward: 'found' },
]);

/**
 * Practice-field facts (§12.3) and the WA §7.1 constants. `spots` = where Pearl waits during each lesson (clear of
 * Sir Wobble's reach and the sack's swing); `hop` = her fence hop (north side → south side).
 */
export const PRACTICE = Object.freeze({
  centre: [0, -80], half: 20.5, fenceZ: -87, fenceX: [-20, -2], sack: [8, -84], rollR: 3.4, cow: [12, -72],
  dummies: [[-5, -76], [0, -76], [5, -76]], bonkR: 2.2, moveDist: 0, moveMax: 10, bonkFallback: 6,
  nextDelay: 0.6, skipHold: 1.0, idleDemo: 8, chipAfter: 6, demoCycles: 2, demoCycle: 1.6, skipHintAfter: 20, introSec: 2.4,
  parrySlowMo: Object.freeze({ scale: 0.45, firstOnly: true, maxReal: 2.0, windup: 0.9 }),
  bowScene: 'tutbow', cowId: 'cow_practice', boulder: 'practice_boulder',
  cowClue: Object.freeze({ far: 14, farT: 10, near: 8, meowR: 14 }),
  pearl: Object.freeze({ speed: 3.0, behind: 1.8, side: 1.4 }),
  spots: Object.freeze({ move: [1.7, -74.9], bonk: [2.4, -74.4], jump: [-6, -88.6], roll: [5.2, -81.8], stand: [-2.8, -82.8], parry: [-2.8, -82.8] }),
  hop: Object.freeze([[-6, -85.9], [-6, -88.3]]),
  // a side flip only counts as a hop if she was airborne (or pressed Jump) within this many seconds of it
  hopWindow: 0.6,
  // the 3 sun sparkles run from the title spot to the dummy's sun ring (the look shot frames both ends)
  sparkleLine: Object.freeze([[0.4, -67.4], [0.1, -73.4]]), sparkles: 3,
  lookScene: 'tutlook', lookFrom: 7, sunRing: Object.freeze({ r: 0.95, color: '#FFD57A', pulse: 1.4 }),
  chart: Object.freeze([-6, -67.3]), chartR: 2.5, chartPath: Object.freeze([[9, -72], [4, -70], [-1, -68.5], [-4.6, -67.6]]),
  wipe: 1.2,
  // where Pearl pops out when hide-and-seek ends unfound (skip): the cow's lee, tutpearl's HIDE spot
  found: Object.freeze([12.3, -73.9]),
});

/** Telegraph kind → its WA §7.3 one-shot hint key (story listens for `telegraph:first`). */
export const GLYPH_HINTS = Object.freeze({ red: 'tut.red', aoe: 'tut.aoe', gold: 'tut.gold' });

/** Post-prologue hint key → Mochi's guide line (ON §4.5; shown in his bubble once he is in the party). */
export const MOCHI_LINES = Object.freeze({
  'tut.pounce': 'mochi.hint.pounce', 'tut.reflect': 'mochi.hint.reflect', 'tut.milk': 'mochi.hint.milk',
  'tut.valor': 'mochi.hint.valor', 'tut.companion': 'mochi.hint.companion', 'tut.vigil': 'mochi.hint.vigil',
  'tut.click': 'mochi.hint.click', 'tut.jeer': 'mochi.hint.jeer', 'tut.bright': 'mochi.hint.bright',
  'tut.fizzle': 'mochi.hint.fizzle',
});

/** Seconds a post-prologue hint bubble stays up. */
export const HINT_SHOW = 6;

/**
 * Pure step state. Feed it facts; it says when the current step is complete.
 * Facts: { type: 'moved', d } · { type: 'near', d } (distance to the nearest dummy) · { type: 'hit', attackId, dummy }
 *        · { type: 'crossed' } (over the inner fence) · { type: 'north' } (old alias of crossed) · { type: 'dodge', nearSack }
 *        · { type: 'block', held? } · { type: 'parry' } · { type: 'cow' } · { type: 'parryFail' }
 *   In the parry lesson a `block` is a miss (the guard went up outside the window) unless `held` says the guard has
 *   been held since the lesson began (the carry-over from the Stand lesson): that one is not the player's mistake.
 */
export class PracticeLog {
  constructor(steps = TUTORIAL_STEPS, cfg = PRACTICE) {
    this.steps = steps; this.cfg = cfg;
    this.i = 0; this.finished = false;
    this.moved = 0; this.nearest = Infinity; this.dummyHits = 0; this.blocks = 0; this.parries = 0; this.parryFails = 0;
    /** world states that stay true once seen (over the fence, the woken cow) */
    this.latched = new Set();
  }

  get step() { return this.steps[this.i] ?? null; }
  get total() { return this.steps.length; }

  /** Record a fact. Returns true when it completed the current step (call `advance()` to move on). */
  note(f) {
    if (this.finished || !f) return false;
    const id = this.step?.id;
    switch (f.type) {
      case 'moved': if (id === 'move') this.moved += Math.max(0, f.d ?? 0); break;
      case 'near': if (id === 'move') this.nearest = Math.min(this.nearest, f.d ?? Infinity); break;
      case 'crossed': case 'north': if (id === 'jump') this.latched.add('crossed'); break;
      case 'cow': this.latched.add('cow'); break;
      case 'hit': if (id === 'bonk' && f.dummy) { this.dummyHits++; if (f.attackId === 'slash3') this.latched.add('bonk'); } break;
      case 'dodge': if (id === 'roll' && f.nearSack) this.latched.add('roll'); break;
      case 'block': if (id === 'stand') this.blocks++; else if (id === 'parry' && !f.held) this.parryFails++; break;
      case 'parry': if (id === 'stand') this.blocks++; if (id === 'parry') this.parries++; break;
      case 'parryFail': if (id === 'parry') this.parryFails++; break;
      default: break;
    }
    return this.complete();
  }

  /** Is the current step's condition met? */
  complete() {
    const s = this.step, c = this.cfg;
    if (!s || this.finished) return false;
    switch (s.id) {
      // CONTROLS_SPEC C6: any way of moving counts (orders, WASD, the stick); reaching the dummy ring ends it at once
      case 'move': return this.nearest <= c.bonkR || this.moved >= Math.max(c.moveMax ?? 10, c.moveDist ?? 0);
      case 'bonk': return this.latched.has('bonk') || this.dummyHits >= c.bonkFallback;
      case 'jump': return this.latched.has('crossed');
      case 'roll': return this.latched.has('roll');
      case 'stand': return this.blocks >= (s.need ?? 1);
      case 'parry': return this.parries >= 1;
      case 'meow': return this.latched.has('cow');
      default: return true;
    }
  }

  /** 0…1 progress inside the current step (the half-filled paw dot, the chip wiggle). Pure. */
  progress() {
    const s = this.step, c = this.cfg;
    if (!s) return 1;
    if (this.complete()) return 1;
    switch (s.id) {
      case 'move': return Math.min(0.99, this.moved / Math.max(1, c.moveMax ?? 10));
      case 'bonk': return Math.min(0.99, this.dummyHits / Math.max(1, c.bonkFallback));
      case 'stand': return Math.min(0.99, this.blocks / Math.max(1, s.need ?? 1));
      default: return 0;
    }
  }

  /** The paw dots (WA §7.5): `{ n: lessons done, of: total, half: the current one has progress }`. Pure. */
  dots() { return { n: this.finished ? this.total : this.i, of: this.total, half: !this.finished && this.progress() > 0 }; }

  /** Move to the next step. Returns the new step (null when every step is done). */
  advance() {
    if (this.finished) return null;
    this.i++;
    this.moved = 0; this.nearest = Infinity;
    if (this.i >= this.steps.length) { this.finished = true; return null; }
    return this.step;
  }
}

/**
 * Pure guide-bubble clock for one lesson (WA §7.5). ui's guide bubble folds the speech after `chipAfter` s and runs
 * the ghost paw after `idleDemo` s without progress by itself (the prompt carries both numbers); story only mirrors
 * that clock to know when the paw is due (`demo`, the fx ground spot) and shows the "hold Pause to skip" hint once
 * after `skipHintAfter` s on one lesson. `tick` returns the events of this step.
 */
export class GuideClock {
  constructor(cfg = PRACTICE) { this.cfg = cfg; this.reset(); }

  reset() { this.t = 0; this.idle = 0; this.demoT = 0; this.folded = false; this.skipHinted = false; }

  /** Progress happened (resets the idle demo clock). */
  poke() { this.idle = 0; }

  /** @returns {{ fold: boolean, demo: boolean, skipHint: boolean }} */
  tick(dt) {
    const c = this.cfg, out = { fold: false, demo: false, skipHint: false };
    this.t += dt;
    if (!this.folded && this.t >= c.chipAfter) { this.folded = true; out.fold = true; }
    if (!this.skipHinted && this.t >= c.skipHintAfter) { this.skipHinted = true; out.skipHint = true; }
    if (this.demoT > 0) { this.demoT -= dt; if (this.demoT <= 0) this.idle = 0; return out; }
    this.idle += dt;
    if (this.idle >= c.idleDemo) { out.demo = true; this.demoT = c.demoCycles * c.demoCycle; }
    return out;
  }
}

/**
 * Practice half of the Kitten-mode offer (ON §3.3, `STORY.kittenOffer.failedParries`): the 3rd failed parry in
 * practice asks ui to offer it (ui counts the knock-outs itself and keeps the once-per-save flag). Pure.
 */
export class ParryFails {
  constructor(cfg = STORY.kittenOffer) { this.cfg = cfg; this.failed = 0; this.asked = false; }
  /** One real miss in the parry lesson (hit unguarded, or a guard raised outside the window). Returns true the moment the offer is due. */
  fail() { this.failed++; if (!this.asked && this.failed >= this.cfg.failedParries) { this.asked = true; return true; } return false; }
}

/** Touch button / input action each lesson demonstrates (ui's ghost paw sits on that button; null = a world target). */
// WA §7.5: a lesson's action also reveals its touch button (ui `_lesson`): bonk → ⚔, roll → Tumble (both were null, so
// on phones the Bonk and Roll lessons sat behind veiled buttons and taps fell through to the ground)
export const DEMO_ACTION = Object.freeze({ move: null, bonk: 'attack', jump: 'jump', roll: 'dodge', stand: 'guard', parry: 'guard', meow: 'meow' });

/** Is (x, z) inside the practice field (with a little margin)? Pure. */
export function inPractice(x, z, cfg = PRACTICE) {
  return Math.abs(x - cfg.centre[0]) <= cfg.half && Math.abs(z - cfg.centre[1]) <= cfg.half;
}

/** Which side of the inner fence (x, z) is on (+1 north / −1 south), or 0 when it is not over the fence's span. Pure. */
export function fenceSide(x, z, cfg = PRACTICE) {
  if (x < cfg.fenceX[0] - 0.3 || x > cfg.fenceX[1] + 0.3) return 0;
  return z >= cfg.fenceZ ? 1 : -1;
}

/**
 * Does a fence-side sample count as a hop over the fence? Only a flip between two non-zero sides, with her airborne
 * (or a Jump press) within `cfg.hopWindow` s — walking round the fence end resets the side to 0 (fenceSide leaves the
 * span), and a flip with no recent air time never counts. Pure.
 * @param {number} prev last side (0 = unknown / she left the span) @param {number} side this sample's fenceSide
 * @param {number} airAge seconds since she was last airborne / pressed Jump (Infinity = never)
 */
export function fenceHopped(prev, side, airAge, cfg = PRACTICE) {
  return !!prev && !!side && side !== prev && airAge <= cfg.hopWindow;
}

/** Distance from (x, z) to the nearest practice dummy. Pure. */
export function nearestDummy(x, z, cfg = PRACTICE) {
  let d = Infinity;
  for (const [dx, dz] of cfg.dummies) d = Math.min(d, Math.hypot(x - dx, z - dz));
  return d;
}

/**
 * One-time gameplay hints after the prologue (§6.6), once per save (flag `seen.<key>`). With Mochi in the party he says
 * them from the guide bubble (ON §4.5); before that they are toasts. `when(ctx, payload)` filters the trigger event.
 */
export const HINTS = Object.freeze([
  { key: 'tut.riposte', on: E.PLAYER_PARRY, when: (ctx, p) => ctx.state?.getFlag?.('prologue.done') && !p?.projectile,
    text: (ctx) => (ctx.player?.autoRiposteOn?.() ? 'tut.riposte.auto' : null) },   // Auto-Riposte (touch): no tap asked
  { key: 'tut.milk', on: E.PLAYER_DAMAGED, when: (ctx, p) => ctx.state?.getFlag?.('prologue.done') && (p?.hp ?? 99) <= 4 && (ctx.player?.milk ?? 0) > 0 },
  // The first fight (Mochi's cart) asks for Bright Slash, so it teaches only targeting (`tut.target`); the Valor tip waits
  // for the first foe after Mochi joins, so he says it from his bubble instead of a toast stacked on the cart fight.
  { key: 'tut.target', on: E.ENEMY_ALERTED, when: (ctx) => !!ctx.state?.getFlag?.('prologue.done') && canTarget(ctx) },
  { key: 'tut.valor', on: E.ENEMY_ALERTED, when: (ctx) => !!ctx.state?.getFlag?.('prologue.done') && mochiJoined(ctx) },
  { key: 'tut.companion', on: E.COMPANION_CHANGED, when: (ctx, p) => (p?.active?.length ?? 0) > 0 },
  { key: 'tut.holy', on: E.SHARD, when: (ctx, p) => (p?.n ?? 0) >= 1 },
  // first Holy Slash fizzle with a Shard in hand: it was Valor, not a bug (the charge itself only says 'pfft')
  { key: 'tut.fizzle', on: E.PLAYER_CHARGE, when: (ctx, p) => !!p?.fizzle && (ctx.state?.shards ?? 0) >= 1 },
  { key: 'tut.line', on: E.OBJECTIVE, when: (ctx, p) => p?.id === 'line' },
  { key: 'tut.jeer', on: E.ENEMY_JEER, when: (ctx, p) => !!p?.on },
  // CONTROLS_SPEC §14 (new): the first arena teaches zoom; the first talkable NPC in reach teaches click / tap to talk
  // (the proximity scan in Tutorial._talkTip usually fires it first, from further away)
  // (never a soft arena: Mochi's cart already carries tut.target + tut.bright, so zoom waits for the first hard lock)
  { key: 'tut.zoom', on: E.ARENA_LOCK, when: (ctx, p) => !!ctx.state?.getFlag?.('prologue.done') && ctx.cam?.isIso !== false && !p?.soft },
  { key: 'tut.talk', on: E.INTERACT_AVAILABLE, when: (ctx, p) => p?.prompt === 'prompt.talk' || p?.target?.kind === 'npc' },
  { key: 'tut.bones', on: E.ENEMY_SPAWNED, when: (ctx, p) => String(p?.enemy?.def?.id ?? '').startsWith('bonehead') },
]);

const ID = 'tutorial';
/** Pearl's praise bubble: shown this long after the mint ✓ (ui shows the ✓ for 0.5 s), and it adds this much to the gap. */
const PRAISE_AFTER = 0.55, PRAISE_SHOW = 1.6;

export class Tutorial {
  /** @param {any} ctx @param {any} story StoryManager */
  constructor(ctx, story) {
    this.ctx = ctx; this.story = story;
    this.log = new PracticeLog();
    this.clock = new GuideClock();
    this.parryFails = new ParryFails();
    this.active = false;
    this.waitT = 0;              // delay before the next prompt shows
    this.pending = false;        // a practice scene (tutbow / tutpearl) is playing / queued
    this.skipHeld = 0;
    this._last = null;           // last player pos sample (moved)
    this._talkScan = 0;          // tut.talk proximity scan timer
    this._shown = null;          // index of the lesson whose prompt is up
    this._intro = false;         // P0 "Knighting Day is TOMORROW!" shown
    this._side = 0;              // last fence side (jump lesson; 0 once she leaves the span)
    this._airT = -Infinity;      // game time she was last airborne / pressed Jump (jump lesson)
    this._prog = 0;              // last progress sent (wiggle on change)
    this._slowDone = false;      // the first-swing parry slow motion ran
    this._carryStep = -1;        // lesson index the guard carry-over was sampled for
    this._carry = false;         // parry lesson: the guard has been held without a break since the lesson began
    this._letGoSaid = false;     // Pearl's one-time "let go, then tap" nudge
    this._cow = { farT: 0, said: new Set() };
    this._wipeT = null;          // cancels the pending hide-and-seek wipe (meow lesson)
    this._hidden = false;        // Pearl is hiding (despawned, the cow wears her tail) until found / practice ends
    this._hintT = 0;             // seconds left on a post-prologue hint bubble
    this._gameT = 0;
    this._offs = [];
  }

  /** Total steps / the current step (1-based) / its strings key — for ui. */
  get total() { return this.log.total; }
  get step() { return this.log.finished ? this.log.total : this.log.i + 1; }
  get textKey() { return this.log.step?.textKey ?? null; }

  /** Is Morning Practice running for this save (meadow, a new adventure started, practice not done yet)? */
  eligible() {
    const ctx = this.ctx, st = ctx.state, f = (k) => !!st?.getFlag?.(k);
    return ctx.levels?.current?.id === 'meadow' && f('prologue.start') && !f('prologue.practice') && !f('prologue.done');
  }

  init() {
    const bus = this.ctx.bus, on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    on(E.HIT, (h) => {
      if (!h) return;
      const p = this.ctx.player;
      if (h.attacker === p && h.target?.kind === 'dummy') this._fact({ type: 'hit', attackId: h.attackId, dummy: true });
      else if (h.target === p && h.attacker?.kind === 'wobble_knight') this._fact(h.blocked ? { type: 'block' } : { type: 'parryFail' });
      else if (h.attacker === p && isMochiLock(h.target) && !this.ctx.state?.getFlag?.('meadow.mochi')) this.hint('tut.bright', { force: true });
    });
    on(E.PLAYER_PARRY, (p) => { if (p?.attacker?.kind === 'wobble_knight') this._fact({ type: 'parry' }); });
    on(E.PLAYER_JUMP, () => { this._airT = this._gameT; });
    on(E.PLAYER_DODGE, () => {
      const p = this.ctx.player, [sx, sz] = PRACTICE.sack;
      this._fact({ type: 'dodge', nearSack: !!p && Math.hypot(p.pos.x - sx, p.pos.z - sz) <= PRACTICE.rollR });
    });
    on(E.PLAYER_MEOW, (m) => this._onMeow(m));
    on(E.TELEGRAPH, (t) => this._onTelegraph(t));
    on(E.TELEGRAPH_FIRST, (t) => { const k = GLYPH_HINTS[t?.kind]; if (k) this.hint(k); });
    on(E.LEVEL_LOADED, () => { this.reset(); this._clickT = 0; });
    on(E.PLAYER_ORDER, (o) => { if (o?.valid !== false) this._ordered = true; });
    on(E.LEVEL_UNLOAD, () => { this._hide(true); this._sunRing(false); });
    on(E.FLAG_SET, (f) => { if (f?.key === 'prologue.practice' && f.value && this.active) this._end(false, { quiet: true }); });
    for (const h of HINTS) on(h.on, (p) => this._hint(h, p));
  }

  reset() {
    this.log = new PracticeLog();
    this.clock.reset();
    this.active = false; this.waitT = 0; this.pending = false; this.skipHeld = 0;
    this._last = null; this._shown = null; this._intro = false; this._side = 0; this._airT = -Infinity; this._prog = 0;
    this._carryStep = -1; this._carry = false; this._letGoSaid = false;
    this._cow = { farT: 0, said: new Set() };
    if (this._wipeT) { try { this._wipeT(); } catch { /* gone */ } }
    this._wipeT = null; this._hidden = false;
    this._looked = false;
    this._sunRing(false);
  }

  // ------------------------------------------------------------------ loop (play mode, StoryManager.update)
  update(dt) {
    const ctx = this.ctx, p = ctx.player;
    this._gameT += dt;
    this._clickTip(dt);
    this._talkTip(dt);
    this._hintTick(dt);
    if (!this.eligible() || !p) { if (this.active) this._hide(true); this.active = false; return; }
    if (this.story?.isPlaying || ctx.game?.mode === 'menu') return;
    if (!this.active) {
      if (!inPractice(p.pos.x, p.pos.z)) return;
      this.active = true; this._shown = null;
      this._last = p.pos.clone();
      this._pearlArrive();
      // P0: Pearl bounces in front of her with the big news (no pause, no letterbox), then the first lesson
      if (!this._intro && this.log.i === 0) {
        this._intro = true;
        this._emit({ textKey: null, say: 'pearl.start', step: 'intro', action: null, demo: null, target: null });
        this.waitT = PRACTICE.introSec;
      } else this.waitT = 0.6;
    }
    this._sample(dt, p);

    // hold Pause 1 s → skip practice (the hint shows only after 20 s on one lesson, WA §7.2)
    const input = ctx.input;
    if (input?.down?.('pause')) {
      if (this.skipHeld === 0) this._skipLabel = devText(ctx, 'tut.skip');   // resolved once per hold (device-aware)
      this.skipHeld += dt;
      this.story?.cinema?.skip(Math.min(1, this.skipHeld / PRACTICE.skipHold), this._skipLabel);
      if (this.skipHeld >= PRACTICE.skipHold) { this.skip(); return; }
    } else if (this.skipHeld > 0) { this.skipHeld = 0; this.story?.cinema?.skip(0); }

    if (this.pending) return;
    if (this.waitT > 0) { this.waitT -= dt; if (this.waitT <= 0) this._show(); return; }
    if (this._shown !== this.log.i) this._show();
    if (this.log.complete()) { this._stepDone(); return; }
    this._guide(dt);
  }

  /** Per-step position facts (C6: any way of moving counts; the iso camera never turns). */
  _sample(dt, p) {
    const id = this.log.step?.id;
    if (id === 'move') {
      if (this._last) { this.log.note({ type: 'moved', d: Math.hypot(p.pos.x - this._last.x, p.pos.z - this._last.z) }); this._last.copy(p.pos); }
      this.log.note({ type: 'near', d: nearestDummy(p.pos.x, p.pos.z) });
    } else if (this._last) this._last.copy(p.pos);
    if (id === 'jump') {
      // only a real hop counts: walking round the fence end leaves the span (side → 0), and a flip needs air time
      if (p.onGround === false) this._airT = this._gameT;
      const s = fenceSide(p.pos.x, p.pos.z);
      if (fenceHopped(this._side, s, this._gameT - this._airT)) this.log.note({ type: 'crossed' });
      this._side = s;
    }
    if (id === 'meow') this._cowClues(dt, p);
    if (id === 'parry') {
      // a guard still up from the Stand lesson is a carry-over, not a timing miss; it ends the first frame it drops
      if (this._carryStep !== this.log.i) { this._carryStep = this.log.i; this._carry = !!p.guarding; }
      else if (!p.guarding) this._carry = false;
    }
    const L = this.ctx.levels?.current;
    if (L?.critter?.(PRACTICE.cowId)?.woke) this.log.note({ type: 'cow' });
  }

  _fact(f) {
    // facts count during the short pause between prompts too (a roll right after the bonk still lands); the step
    // only completes once its prompt is up (update()).
    if ((f.type === 'parryFail' || f.type === 'block') && this.active && this.log.step?.id === 'parry') {
      // a hit blocked by a guard held since the lesson began is the Stand lesson's carry-over, not a missed parry:
      // no Kitten-mode count, and Pearl says once how to do it instead
      const held = f.type === 'block' && this._heldCarry();
      if (held) { f = { type: 'block', held: true }; this._letGo(); }
      else if (this.parryFails.fail()) this._offerKitten();
    }
    if (!this.active || this.pending) return;
    this.log.note(f);
  }

  // ------------------------------------------------------------------ prompts (the guide bubble)
  /**
   * One `story:prompt` for the current lesson (`o` overrides). ui's guide keys a bubble on speaker + textKey + say +
   * step, so a lesson keeps its `say` for every update (progress re-sends wiggle the chip instead of popping a new
   * bubble). `progress` is the in-lesson 0…1 fill, `demo` / `target` / `action` drive the ghost paw.
   */
  _emit(o = {}) {
    const s = this.log.step, total = this.log.total, step = Math.min(total, this.log.i + 1);
    this.ctx.bus.emit(E.PROMPT, {
      kind: 'tutorial', id: ID, action: s ? DEMO_ACTION[s.id] ?? null : null, hold: 0,
      textKey: s?.textKey ?? null, step, total, progress: this.log.progress(), done: false,
      speaker: s?.guide ?? 'pearl', say: s?.intro ?? null, stepDots: this.log.dots(),
      demo: s?.demo ?? null, target: s ? this._demoTarget(s) : null, chipAfter: PRACTICE.chipAfter, idleDemo: PRACTICE.idleDemo,
      ...o,
    });
  }

  _show() {
    const s = this.log.step;
    if (!s) return;
    this._shown = this.log.i; this._prog = 0;
    this.clock.reset();
    this._emit();
    this._stepBegin(s);
  }

  /** Lesson start: Pearl goes to her spot, the per-lesson props (sun ring, sparkles, the fence side). */
  _stepBegin(s) {
    const ctx = this.ctx, p = ctx.player;
    this._side = p ? fenceSide(p.pos.x, p.pos.z) : 0;
    if (s.id === 'move') {
      this._pearlTo(PRACTICE.spots.move);
      // 3 sun sparkles on the way (+1 fish each; the pickup pitch ladder plays them up) and the sun ring at the dummy
      try { ctx.levels?.current?.pickups?.fishLine?.(PRACTICE.sparkleLine[0], PRACTICE.sparkleLine[1], PRACTICE.sparkles, 'practice'); } catch (e) { console.warn(e); }
      this._sunRing(true);
      // the dummy is off-screen from the title spot (iso yaw π, 12 m south): a short look shot frames her, Pearl running
      // ahead and the sun ring together, then follow again (once per practice; no look when she starts near it)
      if (p && !this._looked && nearestDummy(p.pos.x, p.pos.z) > PRACTICE.lookFrom && typeof this.story?.play === 'function') {
        this._looked = true;
        this.pending = true;
        Promise.resolve(this.story.play(PRACTICE.lookScene)).catch(() => {}).finally(() => { this.pending = false; this.clock.reset(); });
      }
    } else if (s.id === 'jump') this._pearlHop();
    else if (s.id === 'meow') this._hideAndSeek();
    else if (PRACTICE.spots[s.id]) this._pearlTo(PRACTICE.spots[s.id]);
  }

  /** Progress wiggles the chip (one re-send per change); the ghost paw's ground spot; the skip hint after 20 s. */
  _guide(dt) {
    const pr = this.log.progress();
    if (pr > this._prog + 1e-6) { this._prog = pr; this.clock.poke(); this._emit(); }
    const ev = this.clock.tick(dt);
    if (ev.demo && this.ctx.state?.settings?.tutorialHints !== false) {
      // ui's bubble plays the paw itself on the same clock; fx marks the world spot it taps (fx.W5, optional)
      try { this.ctx.fx?.ghostSpot?.(this._demoTarget(this.log.step)); } catch { /* fx optional */ }
    }
    // key only: ui resolves it device-aware (tut.skip.touch on a phone)
    if (ev.skipHint) this.ctx.bus.emit(E.TOAST, { key: 'tut.skip', icon: 'hint' });
  }

  /** World point the ghost paw demonstrates on for a lesson ([x, y, z]; y from the ground). */
  _demoTarget(s) {
    const P = PRACTICE, xz = s?.id === 'move' || s?.id === 'bonk' ? P.dummies[1] : s?.id === 'jump' ? [-6, P.fenceZ]
      : s?.id === 'roll' ? P.sack : s?.id === 'meow' ? P.cow : null;
    const p = this.ctx.player;
    const x = xz ? xz[0] : p?.pos.x ?? 0, z = xz ? xz[1] : p?.pos.z ?? 0;
    return [x, this.ctx.physics?.heightAt?.(x, z) ?? p?.pos.y ?? 0, z];
  }

  _stepDone() {
    const s = this.log.step, ctx = this.ctx;
    if (s?.id === 'jump') this._jumpDone();                          // CONTROLS_SPEC §12 story 2
    if (s?.id === 'move') this._sunRing(false);
    // the chip turns mint with a ✓ (ui, 0.5 s), then the sticker; Pearl's praise line gets its own short bubble
    this._emit({ done: true, ok: true, progress: 1, stepDots: { n: this.log.i + 1, of: this.log.total, half: false } });
    try { ctx.audio?.play2D?.('ui.confirm', { vol: 0.7 }); } catch { /* audio optional */ }
    ctx.fx?.burst?.('sparkle', ctx.player, { count: 10 });
    if (s.reward) this.reward(s.reward);
    let extra = 0;
    if (s.praise) {
      extra = PRAISE_SHOW;
      const dots = { n: this.log.i + 1, of: this.log.total, half: false }, guide = s.guide ?? 'pearl', praise = s.praise;
      setTimeoutish(ctx, PRAISE_AFTER, () => {
        if (!this.active) return;
        ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: ID, action: null, hold: 0, textKey: null, step: 'praise', total: this.log.total, progress: 1, done: false, speaker: guide, say: praise, stepDots: dots });
      });
    }
    if (s.id === 'bonk') {
      this._releaseDummy();
      this._bonkPop();
      this.pending = true;
      this.log.advance();
      Promise.resolve(this.story?.play?.(PRACTICE.bowScene)).finally(() => { this.pending = false; this.waitT = PRACTICE.nextDelay; });
      return;
    }
    if (s.id === 'parry') this._comicPop('PARRY!');
    if (s.id === 'meow') {
      this.pending = true;
      this.log.advance();
      this._hide(false);
      // a Meow inside the wipe's first half (a quick ⚔-free tap right by the cow on touch) used to leave the wipe timer
      // running: it then despawned the Pearl `tutpearl` had just spawned, her face / clip waits hung to their 30 s
      // timeouts and practice never ended. Finish the hiding now, before the scene spawns her in the cow's lee.
      if (this._wipeT) { const off = this._wipeT; this._wipeT = null; off(); this._wipeNow(0.2); }
      Promise.resolve(this.story?.play?.('tutpearl')).finally(() => this._end(false));
      return;
    }
    this.log.advance();
    this.waitT = PRACTICE.nextDelay + extra;
    if (this.log.finished) this._end(false);
  }

  /** A sticker / card / friend reward (WA §5.4 one system; ui/celebrate.js shows it). Saved as flag `sticker.<id>`. */
  reward(id, kind = 'sticker') { return reward(this.ctx, kind, id); }

  /** The dummy bursts into straw confetti with a comic "BONK!" (WA §7.2, fx `pop` style; 0 draws). */
  _bonkPop() {
    const ctx = this.ctx, p = ctx.player;
    if (!p) return;
    let best = null, bd = Infinity;
    for (const [x, z] of PRACTICE.dummies) { const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d < bd) { bd = d; best = [x, z]; } }
    if (!best) return;
    const pos = { x: best[0], y: (ctx.physics?.heightAt?.(best[0], best[1]) ?? p.pos.y) + 0.8, z: best[1] };
    try { ctx.fx?.burst?.('confetti', pos, { count: 24, color: '#F2D27A', style: 'straw' }); } catch { /* fx optional */ }
    this._comicPop('BONK!', pos);
  }

  /** WA9 comic pop through the DamageNumbers pool (`pop` style; older fx draws it as a plain number). */
  _comicPop(word, pos = null) {
    const ctx = this.ctx, p = ctx.player;
    const at = pos ?? (p ? { x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z } : null);
    if (!at) return;
    try { ctx.fx?.damageNumber?.(at, word, 'pop'); } catch { /* fx optional */ }
  }

  /**
   * The pulsing gold sun ring at the middle dummy (WA §7.2): fx `marker` when fx has one, else the story's own ring
   * (one additive ring mesh, scaled by a frame hook; built once per lesson, disposed on `_sunRing(false)`).
   */
  _sunRing(on) {
    const ctx = this.ctx, [x, z] = PRACTICE.dummies[1], R = PRACTICE.sunRing;
    if (typeof ctx.fx?.marker === 'function') {
      try { ctx.fx.marker('practiceSunRing', on ? { x, y: ctx.physics?.heightAt?.(x, z) ?? 0, z } : null, { color: R.color, r: R.r, pulse: true }); } catch { /* fx optional */ }
      return;
    }
    if (!on) {
      const ring = this._ring;
      if (!ring) return;
      this._ring = null;
      try { ring.off?.(); ring.obj.removeFromParent(); ring.obj.userData.dispose?.(); } catch (e) { console.warn(e); }
      return;
    }
    if (this._ring || !ctx.scene) return;
    try {
      const obj = buildSunRing(R.r, R.color);
      obj.position.set(x, (ctx.physics?.heightAt?.(x, z) ?? 0) + 0.05, z);
      ctx.scene.add(obj);
      let t = 0;
      const off = ctx.game?.addFrameHook?.((dt) => {
        t += dt;
        const k = 0.5 + 0.5 * Math.sin((t / R.pulse) * Math.PI * 2);
        obj.scale.setScalar(1 + 0.12 * k);
        obj.material.opacity = 0.55 + 0.35 * k;
      }) ?? null;
      this._ring = { obj, off };
      ctx.fx?.burst?.('sparkle', { x, y: obj.position.y + 0.3, z }, { count: 12, color: R.color });
    } catch (e) { console.warn('[story] sun ring failed', e); }
  }

  // ------------------------------------------------------------------ Pearl, the guide
  /** Pearl (the practice guide NPC): the title's Pearl when she is still around, else spawned beside Clem. */
  _pearl(spawn = true) {
    const ctx = this.ctx;
    const live = (ctx.companions?.actors ?? []).find?.((a) => a?.npcId === 'pearl' && a.alive !== false) ?? null;
    if (live || !spawn) return live;
    const p = ctx.player;
    if (!p || typeof ctx.companions?.spawnNpc !== 'function') return null;
    const side = PRACTICE.pearl.side, f = p.facing ?? 0;
    try {
      const a = ctx.companions.spawnNpc('pearl', [p.pos.x + Math.cos(f) * side, 0, p.pos.z - Math.sin(f) * side], f);
      a?.setScripted?.(true);
      return a;
    } catch (e) { console.warn('[story] pearl spawn failed', e); return null; }
  }

  _pearlArrive() {
    const a = this._pearl();
    if (!a) return;
    a.setScripted?.(true);
    try { a.face?.(this.ctx.player ?? 0, 0.3); a.play?.('jump', { once: true }); } catch { /* optional */ }
  }

  _pearlTo(xz, speed = PRACTICE.pearl.speed) {
    const a = this._pearl();
    if (!a?.moveTo) return null;
    a.setScripted?.(true);
    return Promise.resolve(a.moveTo(xz, speed)).then(() => { try { a.face?.(this.ctx.player ?? 0, 0.3); } catch { /* gone */ } });
  }

  /** Jump lesson: Pearl hops the fence first and waves from the far side. */
  _pearlHop() {
    const a = this._pearl(), [h0, h1] = PRACTICE.hop;
    if (!a) return;
    Promise.resolve(this._pearlTo(h0)).then(() => {
      if (!a.pos || this.log.step?.id !== 'jump') return;
      try { a.play?.('jump', { once: true }); } catch { /* optional */ }
      a.pos.x = h1[0]; a.pos.z = h1[1];
      a.pos.y = this.ctx.physics?.heightAt?.(h1[0], h1[1]) ?? a.pos.y;
      a.snap?.();
      try { a.face?.(this.ctx.player ?? 0, 0.3); a.play?.('wave', { once: true }); } catch { /* optional */ }
    });
  }

  /** Meow lesson (WA §7.4): a 1.2 s cream wipe, Pearl gone; the cow shows a tiny pink tail. */
  _hideAndSeek() {
    const ctx = this.ctx, w = PRACTICE.wipe;
    this.story?.cinema?.apply?.({ fade: { to: FADE_COLOR, alpha: 1, dur: w * 0.35 } });
    this._wipeT = setTimeoutish(ctx, w * 0.45, () => { this._wipeT = null; this._wipeNow(w * 0.55); });
    this._cow = { farT: 0, said: new Set() };
  }

  /** The wipe's middle: the guide Pearl goes into hiding (despawned), the cow shows her tail, the cream fades out. */
  _wipeNow(fadeOut) {
    const ctx = this.ctx, a = this._pearl(false);
    if (a) { try { ctx.companions?.despawn?.(a); } catch { /* gone */ } }
    this._hidden = true;
    try { ctx.levels?.current?.critter?.(PRACTICE.cowId)?.setTail?.('pearl'); } catch { /* world optional */ }
    this.story?.cinema?.apply?.({ fade: { alpha: 0, dur: fadeOut } });
  }

  /**
   * Hide-and-seek is over (practice ended or skipped): the cow loses Pearl's pink tail and, when nobody found her
   * (`tutpearl` did not play), Pearl pops out of the cow's lee with "Found me anyway!" so toChart has a guide to run
   * ahead. Idempotent; a no-op outside the meow lesson.
   */
  _unhide() {
    const ctx = this.ctx, wiping = !!this._wipeT;
    if (wiping) { try { this._wipeT(); } catch { /* gone */ } this._wipeT = null; this.story?.cinema?.apply?.({ fade: { alpha: 0, dur: 0.3 } }); }
    if (!this._hidden && !wiping) return;
    this._hidden = false;
    try { ctx.levels?.current?.critter?.(PRACTICE.cowId)?.setTail?.(null); } catch { /* world optional */ }
    if (this._pearl(false) || typeof ctx.companions?.spawnNpc !== 'function') return;
    const [x, z] = PRACTICE.found, p = ctx.player;
    try {
      const f = p ? Math.atan2(p.pos.x - x, p.pos.z - z) : 0;
      const a = ctx.companions.spawnNpc('pearl', [x, 0, z], f);
      if (!a) return;
      a.setScripted?.(true);
      try { a.play?.('jump', { once: true }); } catch { /* optional */ }
      ctx.fx?.burst?.('sparkle', a, { count: 8, color: '#FFD2DE' });
      this.story?.barks?.say?.(a, 'tut.pearl.anyway', 'pearl', 2.2);
    } catch (e) { console.warn('[story] pearl respawn failed', e); }
  }

  /** Warmer / colder: the cow's clue bubbles (WA §7.4), each once. */
  _cowClues(dt, p) {
    const C = PRACTICE.cowClue, [cx, cz] = PRACTICE.cow, d = Math.hypot(p.pos.x - cx, p.pos.z - cz);
    const c = this._cow;
    if (d > C.far) {
      c.farT += dt;
      if (c.farT >= C.farT && !c.said.has(1)) {
        this._cowSay(1);
        try { this.ctx.audio?.play3D?.('cat/meow_baby_01', { x: cx, y: p.pos.y, z: cz }, { vol: 0.7 }); } catch { /* optional */ }
      }
    } else c.farT = 0;
    if (d < C.near && !c.said.has(2)) this._cowSay(2);
  }

  _onMeow(m) {
    if (!this.active || this.log.step?.id !== 'meow') return;
    const p = this.ctx.player, pos = m?.position ?? p?.pos;
    if (!pos) return;
    if (Math.hypot(pos.x - PRACTICE.cow[0], pos.z - PRACTICE.cow[1]) <= PRACTICE.cowClue.meowR) this._cowSay(3);
  }

  _cowSay(n) {
    const c = this._cow;
    if (c.said.has(n)) return;
    c.said.add(n);
    const cow = this.ctx.levels?.current?.critter?.(PRACTICE.cowId);
    if (cow) this.story?.barks?.say?.(cow, `tut.cow.${n}`, 'cow', 2.6);
  }

  // ------------------------------------------------------------------ parry slow motion, the kitten offer
  /** The first Sir Wobble swing of the parry lesson runs at 0.45 time scale from the glint to the impact. */
  _onTelegraph(t) {
    const S = PRACTICE.parrySlowMo;
    if (!this.active || this.log.step?.id !== 'parry' || (S.firstOnly && this._slowDone)) return;
    if (t?.actor?.kind !== 'wobble_knight') return;
    this._slowDone = true;
    const real = Math.min(S.maxReal, (t.duration ?? t.windup ?? S.windup) / S.scale);
    try { this.ctx.game?.slowMo?.(S.scale, real); } catch { /* optional */ }
  }

  /** The 3rd failed parry in practice: ui offers Kitten mode from Pearl's bubble (ui keeps the once-per-save flag). */
  /** Parry lesson: is the guard still the unbroken one from before the lesson? (sampled now if _sample has not run yet) */
  _heldCarry() {
    const p = this.ctx.player;
    if (this._carryStep !== this.log.i) { this._carryStep = this.log.i; this._carry = !!p?.guarding; }
    return this._carry && !!p?.guarding;
  }

  /** Pearl's one-time nudge after the first held block in the parry lesson (keeps the lesson chip, swaps her line). */
  _letGo() {
    // before the lesson prompt is up its intro would replace the line at once: wait for the next held block
    if (this._letGoSaid || this._shown !== this.log.i || this.pending) return;
    this._letGoSaid = true;
    this.clock.poke();
    this._emit({ say: 'pearl.parry.letgo' });
  }

  _offerKitten() {
    const ctx = this.ctx, st = ctx.state;
    if (st?.getFlag?.('seen.offer.kitten') || (st?.difficulty ?? 'knight') !== 'knight' || ctx.params?.test) return;
    try { ctx.ui?.offerKitten?.({ speaker: 'pearl' }); } catch (e) { console.warn('[story] kitten offer failed', e); }
  }

  // ------------------------------------------------------------------ end of practice
  /**
   * Let go of the dummy after the bonk lesson: a straw dummy is not a foe, so once the chain has landed she stops
   * attacking it and the selection is dropped (a selected target pulls the iso framing toward it as "combat").
   */
  _releaseDummy() {
    const ctx = this.ctx, p = ctx.player, o = p?.orders;
    try {
      if (o?.kind === 'attack' && o.target?.kind === 'dummy') p.order?.('stop');
      if (ctx.cam?.lockTarget?.kind === 'dummy') ctx.cam.select?.(null, 'clear');
    } catch (e) { console.warn(e); }
  }

  /** Flag `tut.jump.done` through story.flag (emits story:flag, so physics re-evaluates the practice-fence nav link). */
  _jumpDone() {
    const ctx = this.ctx;
    if (ctx.state?.getFlag?.('tut.jump.done')) return;
    if (this.story?.flag) this.story.flag('tut.jump.done', true); else ctx.state?.setFlag?.('tut.jump.done', true);
  }

  /** Skip the rest of practice (hold Pause 1 s, or ui's menu). */
  skip() {
    if (!this.eligible()) return;
    this._end(true);
  }

  _end(skipped, { quiet = false } = {}) {
    const ctx = this.ctx;
    const was = this.active || this.pending;
    this.active = false; this.pending = false; this.skipHeld = 0;
    this.story?.cinema?.skip(0);
    this._sunRing(false);
    this._hide(true);
    if (!ctx.state?.getFlag?.('prologue.practice')) this.story?.flag?.('prologue.practice', true);
    this._jumpDone();                                                // practice over: the fence link opens too
    const dots = skipped ? { n: this.log.dots().n, of: this.log.total, half: false } : { n: this.log.total, of: this.log.total, half: false };
    this._unhide();                                                  // meow lesson cut short: Pearl back, the cow's tail off
    if (was && !quiet) {
      ctx.bus.emit(E.TOAST, { key: skipped ? 'tut.skipped' : 'tut.done', icon: 'hint' });
      ctx.bus.emit(E.SAVE_REQUEST, {});
    }
    if (was) this.story?.toChart?.({ dots });                        // P8: the bell rings, Pearl runs to the chart
  }

  _hide(clear) {
    this._shown = null;
    // speaker set: ui's guide bubble takes the done (old card payloads without one hide the parchment tag)
    this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: ID, action: null, hold: 0, textKey: clear ? null : this.log.step?.textKey ?? null, step: 0, total: this.log.total, progress: 1, done: true, speaker: 'pearl' });
  }

  // ------------------------------------------------------------------ post-prologue hints
  /** Can the player click / tap things right now (mouse or touch; not a pad, the keyboard-only preset or classic)? */
  _pointerScheme() {
    const inp = this.ctx.input;
    if (this.ctx.cam?.isIso === false) return false;
    if (inp?.device === 'pad') return false;
    if (inp?.device !== 'touch' && inp?.preset === 'keyboardOnly') return false;
    return true;
  }

  /** CONTROLS_SPEC §14 `tut.click`: 20 s of meadow play without ever using an order → one tip (mouse / touch only). */
  _clickTip(dt) {
    const ctx = this.ctx;
    if (this._ordered || ctx.game?.mode !== 'play' || ctx.levels?.current?.id !== 'meadow' || !this._pointerScheme()) return;
    if (!ctx.state?.getFlag?.('prologue.done') || ctx.state?.getFlag?.('seen.tut.click') || ctx.params?.test) return;
    this._clickT = (this._clickT ?? 0) + dt;
    if (this._clickT >= 20) this._hint({ key: 'tut.click', when: () => true });
  }

  /** CONTROLS_SPEC §14 `tut.talk`: the first time a talkable NPC is within TALK_TIP_R m (after the prologue). */
  _talkTip(dt) {
    const ctx = this.ctx, p = ctx.player;
    if ((this._talkScan -= dt) > 0) return;
    this._talkScan = 0.5;
    if (!p || ctx.game?.mode !== 'play' || this.story?.isPlaying || ctx.state?.getFlag?.('seen.tut.talk') || !ctx.state?.getFlag?.('prologue.done')) return;
    for (const it of ctx.levels?.current?.interactables ?? []) {
      if (!it?.pos || (it.kind !== 'npc' && it.prompt !== 'prompt.talk')) continue;
      if (typeof it.enabled === 'function' && !it.enabled()) continue;
      if (Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z) <= TALK_TIP_R) { this._hint({ key: 'tut.talk', when: () => true }); return; }
    }
  }

  _hint(h, payload) {
    const ctx = this.ctx;
    if (ctx.state?.getFlag?.('seen.' + h.key) || this.story?.isPlaying) return;
    let ok = false;
    try { ok = !!h.when(ctx, payload); } catch { ok = false; }
    if (!ok) return;
    let tk = null;
    try { tk = h.text?.(ctx) ?? null; } catch { tk = null; }
    this.hint(h.key, { textKey: tk && ctx.strings?.has?.(tk) !== false ? tk : h.key });
  }

  /**
   * Show a one-time hint `key` (flag `seen.<key>`): Mochi's guide bubble once he is in the party (ON §4.5), a toast
   * before that. Other areas may call it (companions: the first "tink" on Mochi's cracked lock → `tut.bright`).
   * @param {string} key @param {{ textKey?: string, force?: boolean }} [o] force: show even during practice
   * @returns {boolean} shown
   */
  hint(key, { textKey = key, force = false } = {}) {
    const ctx = this.ctx, flag = 'seen.' + key;
    if (!key || ctx.state?.getFlag?.(flag) || (this.story?.isPlaying && !force) || (this.active && !force)) return false;
    ctx.state?.setFlag?.(flag, true);
    const mochi = key === 'tut.bright' || (ctx.companions?.active ?? []).some?.((c) => c?.kittenId === 'mochi');
    if (mochi && MOCHI_LINES[key]) {
      ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: 'hint', action: null, hold: 0, textKey, step: 0, total: 0, progress: 0, done: false,
        speaker: 'mochi', say: MOCHI_LINES[key], stepDots: null, hintKey: key });
      this._hintT = HINT_SHOW;
    } else ctx.bus.emit(E.TOAST, { key, textKey, icon: 'hint' });     // ui resolves textKey device-aware (.touch / .pad)
    return true;
  }

  _hintTick(dt) {
    if (!(this._hintT > 0) || (this._hintT -= dt) > 0) return;
    this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: 'hint', action: null, hold: 0, textKey: null, step: 0, total: 0, progress: 1, done: true, speaker: 'mochi' });
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
  }
}

/** Has Mochi joined (rescued this save, or in the active party)? Gates hints that wait for him to say them. */
export function mochiJoined(ctx) {
  if (ctx?.state?.getFlag?.('meadow.mochi')) return true;
  const a = ctx?.companions?.active;
  return Array.isArray(a) && a.some((c) => c?.kittenId === 'mochi');
}

/**
 * Can she pick a foe with the current scheme (CONTROLS_SPEC §14 `tut.target`)? Iso only; mouse, touch or pad
 * (pad copy: [RB] picks the nearest foe); not the keyboard-only preset, whose base copy would say "right-click".
 */
export function canTarget(ctx) {
  const inp = ctx?.input;
  if (ctx?.cam?.isIso === false) return false;
  return inp?.device === 'touch' || inp?.device === 'pad' || inp?.preset !== 'keyboardOnly';
}

/** Is `t` Mochi's cart lock / carrier (companions' rescue target; any of the names it may carry)? */
export function isMochiLock(t) {
  if (!t) return false;
  return t.kittenId === 'mochi' || t.cageOf === 'mochi' || t.propId === 'mochi_lock' || t.id === 'mochi_cage' || (t.kind === 'cage' && t.rescue === 'mochi');
}

/** A sim-time delay through the game's frame hooks (setTimeout where there is no game). Returns a cancel function. */
export function setTimeoutish(ctx, sec, fn) {
  const g = ctx?.game;
  if (!g?.addFrameHook) { const id = setTimeout(fn, sec * 1000); return () => clearTimeout(id); }
  let t = 0;
  const off = g.addFrameHook((dt) => { t += dt; if (t >= sec) { off(); try { fn(); } catch (e) { console.warn(e); } } });
  return off;
}

/** `tut.talk` fires when a talkable NPC is this close (m): far enough to read it before she arrives. */
export const TALK_TIP_R = 7;

/** Meow radius the cow listens to (for docs / tests). */
export const COW_MEOW_R = PLAYER.meow.kittenRadius;
