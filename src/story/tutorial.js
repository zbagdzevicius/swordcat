// src/story/tutorial.js  (owner: story) — Morning Practice, the playable tutorial (WARM_ADVENTURE_SPEC §6–§7, ON §4,
// TT2 G2 docs/TOKENTAILS-PLAN.md §10.3), and the one-time gameplay hints that follow it (`tut.milk`, `tut.valor`, …).
//
// Four lessons on the sunny practice field (meadow, `meadow_morning`), Pearl guiding from a bubble, each one ending in
// a sticker (E.REWARD) and the next lesson 0.6 s later. Every lesson has a guide target (`guideTarget()`: the Pink Paw
// trail, the coin arrow and the objective line read it):
//   move  race Pearl to the middle dummy (0, −76) (done within PRACTICE.bonkR of a dummy, or 10 m travelled)
//   bonk  3 hits on a dummy (slash3, or 3 dummy hits); Pearl's 2-s bark "Bow's perfect. Now bonk!" replaces `tutbow`
//         (the bow outfit is set silently, the Pink Bow reward card stays)
//   stand block Sir Wobble once         parry  parry him once (one drill: a stand spot 1.3 m from him; he steps toward
//         her beyond ONBOARD.stepR; past ONBOARD.closeR the line says "Get close to Sir Wobble!"; the first swing of the
//         parry lesson runs in 0.45 slow motion; after 3 failed parries every swing does and Kitten mode is offered)
// Roll is an optional tip by Sir Sacky (taught for real on the first crossbow bolt, hint `tut.bolt`); Jump is taught at
// the first hop after practice (`tut.jump`: [Jump] (Space / A / Jump), or a click / tap order across a low fence hops it); Meow is taught at
// Noodle's barrel (StoryManager). The old jump / roll / meow lessons, the cow's hide and seek and `tutlook` are gone.
// Done (or skipped: hold Esc / P / Start / the Skip chip 1 s) → flag `prologue.practice` → the bell and CS-01 right there.
// A save made mid-practice under the old 7-lesson flow resumes at the nearest new lesson (`resumeLesson`, sticker flags).
// Prompts go out as `story:prompt { kind: 'tutorial', id: 'tutorial', textKey, step, total, progress, done, speaker,
// say, stepDots, folded, wiggle, ok, demo }` (WA §7.5: the guide bubble). The pure step logic (PracticeLog) and the pure
// guide timers (GuideClock) are unit-tested.
import { E } from '../core/events.js';
import { PLAYER, STORY, ONBOARD } from '../core/config.js';
import { reward } from './rewards.js';
import { buildSunRing } from './cutscenes/rig.js';
import { registerOnboardingStrings } from './strings.onboarding.js';

registerOnboardingStrings();

/**
 * Device-aware strings lookup (CONTROLS_SPEC §12): `key.touch` / `key.pad` for those devices when present, else `key`.
 * @param {object} ctx @param {string} key @returns {string}
 */
export function devText(ctx, key) {
  const s = ctx?.strings, dev = ctx?.input?.device;
  if ((dev === 'touch' || dev === 'pad') && s?.has?.(`${key}.${dev}`)) return s.t(`${key}.${dev}`);
  return s?.t?.(key) ?? key;
}

/**
 * fix round 2 (§10.10 #3): the in-place lessons (Bonk, Stand, Parry) have no way to walk once she is there, so the guide
 * rings the lesson's object with lit Pink Paw prints instead (fx GuideTrail ring mode): the dummy at `dummy` m, Sir
 * Wobble at ONBOARD.standR (the print on her side is the stand spot).
 */
export const RING_R = Object.freeze({ dummy: 1.0 });

/** TT2 §10.3 lessons, in order. `guide` speaks `intro` when the lesson starts and `praise` when it is done. */
export const TUTORIAL_STEPS = Object.freeze([
  { id: 'move', textKey: 'tut.move', guide: 'pearl', intro: 'pearl.race', demo: 'tap' },
  { id: 'bonk', textKey: 'tut.bonk', guide: 'pearl', intro: 'pearl.bow', demo: 'tap', reward: 'bonk' },
  { id: 'stand', textKey: 'tut.stand', guide: 'pearl', intro: 'pearl.wobble', demo: 'hold', need: 1, reward: 'stand' },
  { id: 'parry', textKey: 'tut.parry', guide: 'pearl', intro: 'pearl.parry', demo: 'tap', reward: 'parry', praise: 'pearl.parry.ok' },
]);

/** The pre-TT2 lesson ids (7-lesson flow) → the nearest new lesson (old mid-practice saves). */
export const OLD_LESSONS = Object.freeze({ move: 'move', bonk: 'bonk', jump: 'stand', roll: 'stand', stand: 'stand', parry: 'parry', meow: null });

/**
 * Where a save resumes practice (TT2 §10.3 save compatibility). Practice progress is not saved; the lesson stickers
 * (`sticker.<reward>`) are. Returns the index into `steps` of the first new lesson whose sticker is missing, or
 * `steps.length` when every new lesson was already passed (old saves past the parry: practice ends at once). Pure.
 * @param {{ getFlag?: (k: string) => any }|null} st
 */
export function resumeLesson(st, steps = TUTORIAL_STEPS) {
  const f = (k) => !!st?.getFlag?.(k);
  // old saves carry sticker.hop / .roll / .found too: anything past the bonk means the bonk lesson is done
  const past = { bonk: f('sticker.bonk') || f('sticker.bow') || f('sticker.hop') || f('sticker.roll') || f('sticker.stand') || f('sticker.parry'),
    stand: f('sticker.stand') || f('sticker.parry'), parry: f('sticker.parry') || f('sticker.found') };
  let i = 0;
  for (; i < steps.length; i++) {
    const id = steps[i].id;
    if (id === 'move') { if (!past.bonk) break; continue; }
    if (!past[id]) break;
  }
  return i;
}

/**
 * Practice-field facts (§12.3) and the lesson constants. `spots` = where Pearl waits during each lesson (clear of
 * Sir Wobble's reach and the sack's swing).
 */
export const PRACTICE = Object.freeze({
  centre: [0, -80], half: 20.5, fenceZ: -87, fenceX: [-20, -2], sack: [5, -85.5], rollR: 3.4, cow: [12, -72],
  dummies: [[-5, -76], [0, -76], [5, -76]], bonkR: 2.2, moveDist: 0, moveMax: 10, bonkFallback: 3,
  nextDelay: 0.6, skipHold: 1.0, idleDemo: 6, chipAfter: 6, demoCycles: 2, demoCycle: 1.6, skipHintAfter: 0, introSec: 0.3,
  parrySlowMo: Object.freeze({ scale: 0.45, firstOnly: true, maxReal: 2.0, windup: 0.9 }),
  cowId: 'cow_practice', boulder: 'practice_boulder',
  pearl: Object.freeze({ speed: 3.0, behind: 1.8, side: 1.4 }),
  spots: Object.freeze({ move: [1.7, -74.9], bonk: [2.4, -74.4], stand: [-1.9, -83.6], parry: [-1.9, -83.6] }),
  // the Sir Wobble drill: Sir Wobble's home, the stand spot ONBOARD.standR north of him
  wobble: ONBOARD.wobble, stand: Object.freeze([ONBOARD.wobble[0], ONBOARD.wobble[1] + ONBOARD.standR]),
  // a side flip only counts as a hop if she was airborne (or pressed Jump) within this many seconds of it
  hopWindow: 0.6,
  // the 3 sun sparkles run from the title spot to the dummy's sun ring
  sparkleLine: Object.freeze([[0.4, -67.4], [0.1, -73.4]]), sparkles: 3,
  sunRing: Object.freeze({ r: 0.95, color: '#FFD57A', pulse: 1.4 }),
  // the height chart (CS-01 plays in place now; kept for the old chart trigger and quest data)
  chart: Object.freeze([-6, -67.3]), chartR: 2.5,
  // Sir Sacky's optional roll tip: once, within this many metres of the sack during practice
  sackTipR: 3.2,
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

/** TT3 §11.4: the Paw Trick unlock event (package A emits it; the E constant once core/events.js lists it). */
export const EV_TRICK_UNLOCKED = E['TRICK_UNLOCKED'] ?? 'trick:unlocked';

/** TT3 §11.4: seconds after `trick.unlocked` before its hint shows (the 3 s unlock bark reads first). */
export const TRICK_HINT_DELAY = 3.2;

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
  // TT2 §10.3: roll is taught for real on the first crossbow bolt aimed at her (the practice roll is an optional tip)
  { key: 'tut.bolt', on: E.TELEGRAPH, when: (ctx, p) => !!ctx.state?.getFlag?.('prologue.done') && isXbow(p?.actor) },
]);

/** Is `a` a crossbow rat (the bolt hint)? Pure. */
export function isXbow(a) {
  const id = String(a?.def?.id ?? a?.type ?? '');
  return id.startsWith('rat_xbow');
}

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
    this.pending = false;        // a practice beat is playing / queued (kept for the old scene hand-offs)
    this.skipHeld = 0;
    this._last = null;           // last player pos sample (moved)
    this._talkScan = 0;          // tut.talk proximity scan timer
    this._shown = null;          // index of the lesson whose prompt is up
    this._resumed = false;       // the old-save resume ran for this practice
    this._side = 0;              // last inner-fence side (the post-practice hop)
    this._airT = -Infinity;      // game time she was last airborne / pressed Jump
    this._prog = 0;              // last progress sent (wiggle on change)
    this._slowDone = false;      // the first-swing parry slow motion ran
    this._slowAlways = false;    // 3 failed parries: every swing of the drill runs slowly
    this._carryStep = -1;        // lesson index the guard carry-over was sampled for
    this._carry = false;         // parry lesson: the guard has been held without a break since the lesson began
    this._letGoSaid = false;     // Pearl's one-time "let go, then tap" nudge
    this._far = null;            // the drill: is she past ONBOARD.closeR from Sir Wobble (the prompt says "Get close")
    this._sackTip = false;       // Sir Sacky's optional roll tip shown
    this._skipToasted = false;   // the "hold to skip" toast (once per practice, from second 0)
    this._hopScan = 0;           // post-practice hop tip scan timer
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
    on(E.PLAYER_JUMP, () => { this._airT = this._gameT; this._onJump(); });
    on(E.PLAYER_DODGE, () => this._onDodge());
    on(E.TELEGRAPH, (t) => this._onTelegraph(t));
    on(E.TELEGRAPH_FIRST, (t) => { const k = GLYPH_HINTS[t?.kind]; if (k) this.hint(k); });
    on(E.LEVEL_LOADED, () => { this.reset(); this._clickT = 0; });
    on(E.PLAYER_ORDER, (o) => { if (o?.valid !== false) this._ordered = true; });
    on(E.LEVEL_UNLOAD, () => { this._hide(true); this._sunRing(false); });
    on(E.FLAG_SET, (f) => { if (f?.key === 'prologue.practice' && f.value && this.active) this._end(false, { quiet: true }); });
    for (const h of HINTS) on(h.on, (p) => this._hint(h, p));
    // TT3 §11.4: a Paw Trick unlocked (package A) → its `trick.<id>.hint` once, after the unlock bark / any scene
    // (`bark: false` = a quiet catch-up on load for a save already past the hand-over: no hint then)
    on(EV_TRICK_UNLOCKED, (t) => { if (t?.id && t.bark !== false) this._trickHint = { key: `trick.${t.id}.hint`, t: TRICK_HINT_DELAY }; });
  }

  /** TT3 §11.4: the pending Paw Trick hint, shown once no scene / practice / bark holds the screen. */
  _trickHintTick(dt) {
    const h = this._trickHint;
    if (!h || (h.t -= dt) > 0) return;
    if (this.story?.isPlaying || this.active || this.ctx.game?.mode !== 'play') return;
    this._trickHint = null;
    if (this.ctx.strings?.has?.(h.key) === false) return;
    this.hint(h.key);
  }

  reset() {
    this.log = new PracticeLog();
    this.clock.reset();
    this.parryFails = new ParryFails();
    this.active = false; this.waitT = 0; this.pending = false; this.skipHeld = 0;
    this._last = null; this._shown = null; this._resumed = false; this._side = 0; this._airT = -Infinity; this._prog = 0;
    this._carryStep = -1; this._carry = false; this._letGoSaid = false; this._far = null; this._sackTip = false;
    this._slowDone = false; this._slowAlways = false; this._skipToasted = false;
    this._sunRing(false);
  }

  // ------------------------------------------------------------------ loop (play mode, StoryManager.update)
  update(dt) {
    const ctx = this.ctx, p = ctx.player;
    this._gameT += dt;
    this._clickTip(dt);
    this._talkTip(dt);
    this._hintTick(dt);
    this._trickHintTick(dt);
    this._hopTip(dt);
    if (!this.eligible() || !p) { if (this.active) this._hide(true); this.active = false; return; }
    if (this.story?.isPlaying || ctx.game?.mode === 'menu') return;
    if (!this.active) {
      if (!inPractice(p.pos.x, p.pos.z)) return;
      this.active = true; this._shown = null;
      this._last = p.pos.clone();
      // a save made mid-practice (also under the old 7-lesson flow) resumes at the nearest new lesson
      if (!this._resumed) {
        this._resumed = true;
        const i = resumeLesson(ctx.state, this.log.steps);
        if (i > 0) { this.log.i = Math.min(i, this.log.total); if (this.log.i >= this.log.total) this.log.finished = true; }
      }
      if (this.log.finished) { this._end(false); return; }
      this._pearlArrive();
      this.waitT = PRACTICE.introSec;
      // TT2: the skip is offered from second 0 (the Skip chip, and this toast once), never only after 20 s
      if (!this._skipToasted) { this._skipToasted = true; ctx.bus.emit(E.TOAST, { key: 'tut.skip', icon: 'hint' }); }
    }
    this._sample(dt, p);

    // hold Pause / the Skip chip 1 s → skip practice
    if (this.story?.skipPressed?.() ?? ctx.input?.down?.('pause')) {
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
    if (id === 'parry') {
      // a guard still up from the Stand lesson is a carry-over, not a timing miss; it ends the first frame it drops
      if (this._carryStep !== this.log.i) { this._carryStep = this.log.i; this._carry = !!p.guarding; }
      else if (!p.guarding) this._carry = false;
    }
    if (id === 'stand' || id === 'parry') {
      // the drill: past ONBOARD.closeR the bubble says "Get close to Sir Wobble!" (he steps toward her past stepR)
      const far = this.wobbleDist() > ONBOARD.closeR;
      if (this._shown === this.log.i && far !== this._far) { this._far = far; this._emit(far ? { textKey: 'onb.wobble.close' } : {}); }
    }
    // Sir Sacky: rolling past him is an optional tip (once), never a lesson
    if (!this._sackTip && (id === 'stand' || id === 'parry' || id === 'bonk')) {
      const [sx, sz] = PRACTICE.sack;
      if (Math.hypot(p.pos.x - sx, p.pos.z - sz) <= PRACTICE.sackTipR) {
        this._sackTip = true;
        const pearl = this._pearl(false);
        if (pearl) this.story?.barks?.say?.(pearl, 'pearl.sack.tip', 'pearl', 2.2);
      }
    }
  }

  /** Distance from her to Sir Wobble (his live position; his home when he is not loaded). */
  wobbleDist() {
    const p = this.ctx.player, w = this.ctx.actors?.get?.('wobble_knight');
    if (!p) return Infinity;
    const x = w?.pos?.x ?? PRACTICE.wobble[0], z = w?.pos?.z ?? PRACTICE.wobble[1];
    return Math.hypot(p.pos.x - x, p.pos.z - z);
  }

  /** The drill's stand spot: ONBOARD.standR from Sir Wobble, on the side facing the field (north). */
  standSpot() {
    const w = this.ctx.actors?.get?.('wobble_knight');
    const x = w?.pos?.x ?? PRACTICE.wobble[0], z = w?.pos?.z ?? PRACTICE.wobble[1];
    return [x, z + ONBOARD.standR];
  }

  /**
   * The current lesson's guide target (TT2 §10.7 contract; StoryManager.guideTarget asks during practice):
   * `{ id, x, z, arriveR, textKey, kind: 'lesson', speaker }`, or null when practice is not running.
   */
  guideTarget() {
    if (!this.eligible()) return null;
    const s = this.log.step;
    if (!s) return null;
    const P = PRACTICE;
    if (s.id === 'move' || s.id === 'bonk') {
      // (fix round 2: Move ends near ANY dummy and a hit on any dummy counts, so Bonk rings the dummy she is at)
      let [x, z] = P.dummies[1];
      const p = this.ctx.player?.pos;
      if (s.id === 'bonk' && p) {
        let bd = Infinity;
        for (const d of P.dummies) { const k = Math.hypot(p.x - d[0], p.z - d[1]); if (k < bd) { bd = k; [x, z] = d; } }
      }
      // (fix round 2: Bonk arrives where Move did, bonkR: she starts it in place, so the ring shows from its first frame)
      const t = { id: `tut.${s.id}`, x, z, arriveR: P.bonkR, textKey: s.textKey, kind: 'lesson', speaker: s.guide ?? 'pearl' };
      // fix round 2 (§10.10 #3): an in-place lesson rings its object with lit prints (fx GuideTrail ring mode), her side last
      if (s.id === 'bonk') t.ring = { x, z, r: RING_R.dummy };
      return t;
    }
    const [x, z] = this.standSpot();
    const far = this.wobbleDist() > ONBOARD.closeR;
    // arrival must also mean "close enough for the drill" (closeR), or the guide hides while the line says "Get close".
    // Once she is within closeR she has arrived wherever she stands: Sir Wobble hops to keep his distance and the stand
    // spot moves with him, so a fixed 0.25 m circle could stay just out of reach (Q1 portrait bot: 0.29 m, wobbleDist 1.01).
    const base = Math.max(0.2, ONBOARD.closeR - ONBOARD.standR - 0.05), p = this.ctx.player?.pos;
    const arriveR = !far && p ? Math.max(base, Math.hypot(p.x - x, p.z - z) + 0.05) : base;
    const w = this.ctx.actors?.get?.('wobble_knight');
    return { id: `tut.${s.id}`, x, z, arriveR, textKey: far ? 'onb.wobble.close' : s.textKey, kind: 'lesson', speaker: s.guide ?? 'pearl',
      // the badge sits on Wobble's body: a tap on it is a move to the stand spot, not an engage order (beacon.js)
      tapMove: true,
      // fix round 2 (§10.10 #3): the drill rings Sir Wobble at the stand distance; the print on her side is the stand spot
      ring: { x: w?.pos?.x ?? P.wobble[0], z: w?.pos?.z ?? P.wobble[1], r: ONBOARD.standR } };
  }

  _fact(f) {
    // facts count during the short pause between prompts too; the step only completes once its prompt is up (update())
    if ((f.type === 'parryFail' || f.type === 'block') && this.active && this.log.step?.id === 'parry') {
      // a hit blocked by a guard held since the lesson began is the Stand lesson's carry-over, not a missed parry:
      // no Kitten-mode count, and Pearl says once how to do it instead
      const held = f.type === 'block' && this._heldCarry();
      if (held) { f = { type: 'block', held: true }; this._letGo(); }
      else {
        if (this.parryFails.fail()) this._offerKitten();
        if (this.parryFails.failed >= this.parryFails.cfg.failedParries) this._slowAlways = true;
      }
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
    const far = (s?.id === 'stand' || s?.id === 'parry') && this._far;
    this.ctx.bus.emit(E.PROMPT, {
      kind: 'tutorial', id: ID, action: s ? DEMO_ACTION[s.id] ?? null : null, hold: 0,
      textKey: far ? 'onb.wobble.close' : s?.textKey ?? null, step, total, progress: this.log.progress(), done: false,
      speaker: s?.guide ?? 'pearl', say: s?.intro ?? null, stepDots: this.log.dots(),
      demo: s?.demo ?? null, target: s ? this._demoTarget(s) : null, chipAfter: PRACTICE.chipAfter, idleDemo: PRACTICE.idleDemo,
      ...o,
    });
  }

  _show() {
    const s = this.log.step;
    if (!s) return;
    this._shown = this.log.i; this._prog = 0;
    this._far = (s.id === 'stand' || s.id === 'parry') ? this.wobbleDist() > ONBOARD.closeR : null;
    this.clock.reset();
    this._emit();
    this._stepBegin(s);
  }

  /** Lesson start: Pearl goes to her spot, the per-lesson props (sun ring, sparkles, the bow). */
  _stepBegin(s) {
    const ctx = this.ctx;
    if (s.id === 'move') {
      this._pearlTo(PRACTICE.spots.move);
      // 3 sun sparkles on the way (+1 fish each) and the sun ring at the dummy
      try { ctx.levels?.current?.pickups?.fishLine?.(PRACTICE.sparkleLine[0], PRACTICE.sparkleLine[1], PRACTICE.sparkles, 'practice'); } catch (e) { console.warn(e); }
      this._sunRing(true);
    } else if (s.id === 'bonk') {
      this._pearlTo(PRACTICE.spots.bonk);
      this._bow();
    } else if (PRACTICE.spots[s.id]) this._pearlTo(PRACTICE.spots[s.id]);
  }

  /**
   * TT2: the old `tutbow` scene is a 2-s Pearl bark now (her lesson intro "Bow's perfect. Now bonk!"). The bow outfit
   * is set silently (Clem wears the bow from the first frame anyway) and the Pink Bow reward card stays.
   */
  _bow() {
    const ctx = this.ctx;
    try { ctx.player?.setOutfit?.('tunic_bow'); } catch { /* optional */ }
    if (ctx.state?.getFlag?.('sticker.bow')) return;
    setTimeoutish(ctx, ONBOARD.bowBark, () => reward(ctx, 'friend', 'bow'));
  }

  /** Progress wiggles the chip (one re-send per change); the ghost paw's ground spot. */
  _guide(dt) {
    const pr = this.log.progress();
    if (pr > this._prog + 1e-6) { this._prog = pr; this.clock.poke(); this._emit(); }
    const ev = this.clock.tick(dt);
    if (ev.demo && this.ctx.state?.settings?.tutorialHints !== false) {
      // ui's bubble plays the paw itself on the same clock; fx marks the world spot it taps (fx.W5, optional)
      try { this.ctx.fx?.ghostSpot?.(this._demoTarget(this.log.step)); } catch { /* fx optional */ }
    }
  }

  /** World point the ghost paw demonstrates on for a lesson ([x, y, z]; y from the ground). */
  _demoTarget(s) {
    const P = PRACTICE, xz = s?.id === 'move' || s?.id === 'bonk' ? P.dummies[1] : s?.id === 'stand' || s?.id === 'parry' ? this.standSpot() : null;
    const p = this.ctx.player;
    const x = xz ? xz[0] : p?.pos.x ?? 0, z = xz ? xz[1] : p?.pos.z ?? 0;
    return [x, this.ctx.physics?.heightAt?.(x, z) ?? p?.pos.y ?? 0, z];
  }

  _stepDone() {
    const s = this.log.step, ctx = this.ctx;
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
    if (s.id === 'bonk') { this._releaseDummy(); this._bonkPop(); }
    if (s.id === 'parry') this._comicPop('PARRY!');
    this.log.advance();
    this.waitT = PRACTICE.nextDelay + (this.log.finished ? 0 : extra);
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

  /** Rolling near Sir Sacky in practice: an optional sticker, never a lesson (once per save). */
  _onDodge() {
    const p = this.ctx.player, [sx, sz] = PRACTICE.sack;
    if (!this.active || !p || this.ctx.state?.getFlag?.('sticker.roll')) return;
    if (Math.hypot(p.pos.x - sx, p.pos.z - sz) <= PRACTICE.rollR) this.reward('roll');
  }

  // ------------------------------------------------------------------ jump, taught at the first hop after practice
  /**
   * TT2 §10.3: after practice, the first time her order path takes a hop link (or she stands by a level nav link, the
   * practice fence on the way to the barn) the jump tip shows once; her first hop there (an order hop: click / tap
   * across the fence, or [Jump]) sets `tut.jump.done` and the Fence Hopper sticker.
   */
  _hopTip(dt) {
    if ((this._hopScan -= dt) > 0) return;
    this._hopScan = 0.25;
    const ctx = this.ctx, st = ctx.state, p = ctx.player;
    if (!p || !st?.getFlag?.('prologue.practice') || st.getFlag('tut.jump.done') || st.getFlag('seen.tut.jump')) return;
    if (ctx.game?.mode !== 'play' || this.story?.isPlaying) return;
    if (this._nearHop(p, 3.0)) this.hint('tut.jump', { force: true });
  }

  /** Is she next to a hop: an order path waypoint that is a link, or within `r` m of a level nav link end? */
  _nearHop(p, r) {
    const path = p.orders?.path, wp = p.orders?.wp ?? 0;
    if (Array.isArray(path)) for (let i = wp; i < Math.min(path.length, wp + 3); i++) {
      const w = path[i];
      if (w?.link && w.link !== 'bounce' && Math.hypot(w.x - p.pos.x, w.z - p.pos.z) <= r + 2) return true;
    }
    for (const l of this.ctx.levels?.current?.navLinks ?? []) {
      for (const e of [l?.a, l?.b]) if (Array.isArray(e) && Math.hypot(e[0] - p.pos.x, e[1] - p.pos.z) <= r) return true;
    }
    // the practice field's low inner fence (meadow): right by it, with the guide target on the other side
    if (this.ctx.levels?.current?.id === 'meadow') {
      const side = fenceSide(p.pos.x, p.pos.z), tg = this.story?.guideTarget?.();
      if (side && Math.abs(p.pos.z - PRACTICE.fenceZ) <= r * 0.8 && tg && fenceSide(tg.x, tg.z) === -side) return true;
    }
    return false;
  }

  _onJump() {
    const ctx = this.ctx, st = ctx.state, p = ctx.player;
    if (!p || !st?.getFlag?.('prologue.practice') || st.getFlag('tut.jump.done')) return;
    const hop = !!p.orders?._hop || this._nearHop(p, 3.0);
    if (!hop) return;
    this._jumpDone();
    if (!st.getFlag('sticker.hop')) this.reward('hop');
  }

  // ------------------------------------------------------------------ parry slow motion, the kitten offer
  /**
   * Sir Wobble's swings in the parry lesson: the first one runs at 0.45 time scale from the glint to the impact; after
   * 3 failed parries every one does (and Kitten mode was offered).
   */
  _onTelegraph(t) {
    const S = PRACTICE.parrySlowMo;
    if (!this.active || this.log.step?.id !== 'parry') return;
    if (t?.actor?.kind !== 'wobble_knight') return;
    if (S.firstOnly && this._slowDone && !this._slowAlways) return;
    this._slowDone = true;
    const real = Math.min(S.maxReal, (t.duration ?? t.windup ?? S.windup) / S.scale);
    try { this.ctx.game?.slowMo?.(S.scale, real); } catch { /* optional */ }
  }

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

  /** The 3rd failed parry in practice: ui offers Kitten mode from Pearl's bubble (ui keeps the once-per-save flag). */
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

  /** Flag `tut.jump.done` through story.flag (emits story:flag, so physics re-evaluates gated nav links). */
  _jumpDone() {
    const ctx = this.ctx;
    if (ctx.state?.getFlag?.('tut.jump.done')) return;
    if (this.story?.flag) this.story.flag('tut.jump.done', true); else ctx.state?.setFlag?.('tut.jump.done', true);
  }

  /** Skip the rest of practice (hold Pause / the Skip chip 1 s, or ui's menu). */
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
    const dots = skipped ? { n: this.log.dots().n, of: this.log.total, half: false } : { n: this.log.total, of: this.log.total, half: false };
    if (was && !quiet) {
      // (a finished practice says nothing more: the parry praise and Pearl's bell bubble cover it; a toast here only
      // surfaced after CS-01 / CS-02)
      if (skipped) ctx.bus.emit(E.TOAST, { key: 'tut.skipped', icon: 'hint' });
      ctx.bus.emit(E.SAVE_REQUEST, {});
    }
    if (was) this.story?.toChart?.({ dots });                        // the bell rings, CS-01 plays right here
  }

  _hide(clear) {
    this._shown = null;
    // speaker set: ui's guide bubble takes the done (old card payloads without one hide the parchment tag)
    this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', id: ID, action: null, hold: 0, textKey: clear ? null : this.log.step?.textKey ?? null, step: 0, total: this.log.total, progress: 1, done: true, speaker: 'pearl' });
  }

  // ------------------------------------------------------------------ post-prologue hints
  /**
   * Can the player give move orders with a click / tap right now (touch, or a KBM preset with a mouse move button:
   * `moba`, `diablo`, `mouseOnly`; TT3: `hybrid` walks on WASD, so no click tip there)?
   */
  _pointerScheme() {
    const inp = this.ctx.input;
    if (this.ctx.cam?.isIso === false) return false;
    if (inp?.device === 'pad') return false;
    if (inp?.device === 'touch') return true;
    const codes = inp?.codesFor?.('move') ?? [];
    return codes.some((c) => String(c).startsWith('Mouse'));
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
 * (pad copy: [R3] picks the nearest foe); not the keyboard-only preset, whose base copy says "Click a foe".
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
