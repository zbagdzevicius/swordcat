// src/story/tutorial.js  (owner: story) — Midnight Practice, the playable tutorial (GAME_DESIGN §5.4, §6.6) and the
// one-time gameplay hints that follow it (`tut.riposte`, `tut.milk`, `tut.valor`, …).
//
// Eight prompts on the practice field (meadow, prologue night), each advancing when its condition is met:
//   1 move + look · 2 jump the 1.0 m fence (z −87) · 3 Snip–Snap–Swoosh on the straw dummies · 4 roll past the swinging
//   sack (8, −84) · 5 block the Wobble Knight twice · 6 parry it once · 7 Bright Slash the cracked boulder · 8 Meow at
//   the sleeping cow → Pearl pops out (scene `tutpearl`).
// Done (or skipped: hold Pause 1 s) → flag `prologue.tutorial` (world opens the north gate).
// Prompts go out as `story:prompt { kind: 'tutorial', textKey, step, total, progress, done }` (ui's parchment tag; the
// story overlay draws it until then). The pure step logic (PracticeLog) is unit-tested.
import { E } from '../core/events.js';
import { PLAYER } from '../core/config.js';

/** §5.4 steps, in order. */
export const TUTORIAL_STEPS = Object.freeze([
  { id: 'move', textKey: 'tut.move' },
  { id: 'jump', textKey: 'tut.jump' },
  { id: 'combo', textKey: 'tut.combo' },
  { id: 'roll', textKey: 'tut.roll' },
  { id: 'stand', textKey: 'tut.stand', need: 2 },
  { id: 'parry', textKey: 'tut.parry' },
  { id: 'bright', textKey: 'tut.bright' },
  { id: 'meow', textKey: 'tut.meow' },
]);

/** Practice-field facts (§12.3): the fenced 40 × 40 field around (0, −80), the inner fence, the props. */
export const PRACTICE = Object.freeze({
  centre: [0, -80], half: 20.5, fenceZ: -87, fenceX: [-20, -2], sack: [8, -84], rollR: 3.4, cow: [12, -72],
  moveDist: 3, lookRad: 0.5, moveAlone: 8, comboFallback: 6, nextDelay: 1.0, skipHold: 1.0, boulder: 'practice_boulder', cowId: 'cow_practice',
});

/**
 * Pure step state. Feed it facts; it says when the current step is complete.
 * Facts: { type: 'moved', d } · { type: 'looked', rad } · { type: 'north' } · { type: 'hit', attackId, dummy }
 *        · { type: 'dodge', nearSack } · { type: 'block' } · { type: 'parry' } · { type: 'boulder' } · { type: 'cow' }
 */
export class PracticeLog {
  constructor(steps = TUTORIAL_STEPS, cfg = PRACTICE) {
    this.steps = steps; this.cfg = cfg;
    this.i = 0; this.finished = false;
    this.moved = 0; this.looked = 0; this.dummyHits = 0; this.blocks = 0; this.parries = 0;
    /** world states that stay true once seen (crossing the fence, the broken boulder, the woken cow) */
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
      case 'looked': if (id === 'move') this.looked += Math.abs(f.rad ?? 0); break;
      case 'north': this.latched.add('north'); break;
      case 'boulder': this.latched.add('boulder'); break;
      case 'cow': this.latched.add('cow'); break;
      case 'hit': if (id === 'combo' && f.dummy) { this.dummyHits++; if (f.attackId === 'slash3') this.latched.add('combo'); } break;
      case 'dodge': if (id === 'roll' && f.nearSack) this.latched.add('roll'); break;
      case 'block': if (id === 'stand') this.blocks++; break;
      case 'parry': if (id === 'stand') this.blocks++; if (id === 'parry') this.parries++; break;
      default: break;
    }
    return this.complete();
  }

  /** Is the current step's condition met? */
  complete() {
    const s = this.step, c = this.cfg;
    if (!s || this.finished) return false;
    switch (s.id) {
      case 'move': return this.moved >= c.moveDist && (this.looked >= c.lookRad || this.moved >= c.moveAlone);
      case 'jump': return this.latched.has('north');
      case 'combo': return this.latched.has('combo') || this.dummyHits >= c.comboFallback;
      case 'roll': return this.latched.has('roll');
      case 'stand': return this.blocks >= (s.need ?? 2);
      case 'parry': return this.parries >= 1;
      case 'bright': return this.latched.has('boulder');
      case 'meow': return this.latched.has('cow');
      default: return true;
    }
  }

  /** Move to the next step. Returns the new step (null when every step is done). */
  advance() {
    if (this.finished) return null;
    this.i++;
    if (this.i >= this.steps.length) { this.finished = true; return null; }
    return this.step;
  }
}

/** Is (x, z) inside the practice field (with a little margin)? Pure. */
export function inPractice(x, z, cfg = PRACTICE) {
  return Math.abs(x - cfg.centre[0]) <= cfg.half && Math.abs(z - cfg.centre[1]) <= cfg.half;
}

/**
 * One-time gameplay hints after the prologue (§6.6), shown as toasts once per save (flag `seen.<key>`, the same
 * convention world uses for `tut.pounce` / `tut.reflect`). `when(ctx, payload)` filters the trigger event.
 */
export const HINTS = Object.freeze([
  { key: 'tut.riposte', on: E.PLAYER_PARRY, when: (ctx, p) => ctx.state?.getFlag?.('prologue.done') && !p?.projectile },
  { key: 'tut.milk', on: E.PLAYER_DAMAGED, when: (ctx, p) => ctx.state?.getFlag?.('prologue.done') && (p?.hp ?? 99) <= 4 && (ctx.player?.milk ?? 0) > 0 },
  { key: 'tut.valor', on: E.ENEMY_ALERTED, when: (ctx) => ctx.state?.getFlag?.('prologue.done') && ctx.levels?.current?.id === 'meadow' },
  { key: 'tut.companion', on: E.COMPANION_CHANGED, when: (ctx, p) => (p?.active?.length ?? 0) > 0 },
  { key: 'tut.holy', on: E.SHARD, when: (ctx, p) => (p?.n ?? 0) >= 1 },
  { key: 'tut.line', on: E.OBJECTIVE, when: (ctx, p) => p?.id === 'line' },
  { key: 'tut.jeer', on: E.ENEMY_JEER, when: (ctx, p) => !!p?.on },
  { key: 'tut.bones', on: E.ENEMY_SPAWNED, when: (ctx, p) => String(p?.enemy?.def?.id ?? '').startsWith('bonehead') },
]);

export class Tutorial {
  /** @param {any} ctx @param {any} story StoryManager */
  constructor(ctx, story) {
    this.ctx = ctx; this.story = story;
    this.log = new PracticeLog();
    this.active = false;
    this.waitT = 0;              // delay before the next prompt shows
    this.pending = false;        // Pearl's scene is playing / queued
    this.skipHeld = 0;
    this._last = null;           // last player pos sample (moved)
    this._yaw = null;            // last camera yaw sample (looked)
    this._shown = null;
    this._offs = [];
  }

  /** Total steps / the current step (1-based) / its strings key — for ui. */
  get total() { return this.log.total; }
  get step() { return this.log.finished ? this.log.total : this.log.i + 1; }
  get textKey() { return this.log.step?.textKey ?? null; }

  /** Is Midnight Practice running for this save (meadow, armour on, not yet done)? */
  eligible() {
    const ctx = this.ctx, st = ctx.state;
    return ctx.levels?.current?.id === 'meadow' && !!st?.getFlag?.('prologue.armour') && !st?.getFlag?.('prologue.tutorial') && !st?.getFlag?.('prologue.done');
  }

  init() {
    const bus = this.ctx.bus, on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    on(E.PLAYER_JUMP, () => this._fact({ type: 'jumped' }));
    on(E.HIT, (h) => {
      if (!h) return;
      const p = this.ctx.player;
      if (h.attacker === p && h.target?.kind === 'dummy') this._fact({ type: 'hit', attackId: h.attackId, dummy: true });
      else if (h.target === p && h.blocked && h.attacker?.kind === 'wobble_knight') this._fact({ type: 'block' });
    });
    on(E.PLAYER_PARRY, (p) => { if (p?.attacker?.kind === 'wobble_knight') this._fact({ type: 'parry' }); });
    on(E.PLAYER_DODGE, () => {
      const p = this.ctx.player, [sx, sz] = PRACTICE.sack;
      this._fact({ type: 'dodge', nearSack: !!p && Math.hypot(p.pos.x - sx, p.pos.z - sz) <= PRACTICE.rollR });
    });
    on(E.LEVEL_LOADED, () => this.reset());
    on(E.LEVEL_UNLOAD, () => this._hide(true));
    on(E.FLAG_SET, (f) => { if (f?.key === 'prologue.tutorial' && f.value && this.active) this._end(false); });
    for (const h of HINTS) on(h.on, (p) => this._hint(h, p));
  }

  reset() {
    this.log = new PracticeLog();
    this.active = false; this.waitT = 0; this.pending = false; this.skipHeld = 0;
    this._last = null; this._yaw = null; this._shown = null;
  }

  // ------------------------------------------------------------------ loop (play mode, StoryManager.update)
  update(dt) {
    const ctx = this.ctx, p = ctx.player;
    if (!this.eligible() || !p) { if (this.active) this._hide(true); this.active = false; return; }
    if (this.story?.isPlaying || ctx.game?.mode === 'menu') return;
    if (!this.active) {
      if (!inPractice(p.pos.x, p.pos.z)) return;
      this.active = true; this.waitT = 0.6; this._shown = null;
      this._last = p.pos.clone(); this._yaw = ctx.cam?.yaw ?? null;
    }
    // facts sampled every step
    if (this.log.step?.id === 'move') {
      if (this._last) { this.log.note({ type: 'moved', d: Math.hypot(p.pos.x - this._last.x, p.pos.z - this._last.z) }); this._last.copy(p.pos); }
      const yaw = ctx.cam?.yaw;
      if (typeof yaw === 'number') { if (this._yaw != null) this.log.note({ type: 'looked', rad: wrapPi(yaw - this._yaw) }); this._yaw = yaw; }
    }
    if (p.pos.z > PRACTICE.fenceZ + 0.6 && (p.onGround !== false)) this.log.note({ type: 'north' });
    const L = ctx.levels?.current;
    if (L && !this.log.latched.has('boulder') && this._boulderSeen && !L.actor?.(PRACTICE.boulder)) this.log.note({ type: 'boulder' });
    if (L?.actor?.(PRACTICE.boulder)) this._boulderSeen = true;
    if (L?.critter?.(PRACTICE.cowId)?.woke) this.log.note({ type: 'cow' });

    // hold Pause 1 s → skip practice (§5.4)
    const input = ctx.input;
    if (input?.down?.('pause')) {
      this.skipHeld += dt;
      this.story?.cinema?.skip(Math.min(1, this.skipHeld / PRACTICE.skipHold), ctx.strings?.t?.('tut.skip'));
      if (this.skipHeld >= PRACTICE.skipHold) { this.skip(); return; }
    } else if (this.skipHeld > 0) { this.skipHeld = 0; this.story?.cinema?.skip(0); }

    if (this.pending) return;
    if (this.waitT > 0) { this.waitT -= dt; if (this.waitT <= 0) this._show(); return; }
    if (this._shown !== this.log.i) this._show();
    if (this.log.complete()) this._stepDone();
  }

  _fact(f) {
    // facts count during the short pause between prompts too (a roll right after the combo still lands); the step
    // only completes once its prompt is up (update()).
    if (!this.active || this.pending) return;
    if (f.type === 'jumped') return;
    this.log.note(f);
  }

  _show() {
    const s = this.log.step;
    if (!s) return;
    this._shown = this.log.i;
    this._emit(s.textKey, false);
  }

  _emit(textKey, done) {
    const total = this.log.total, step = Math.min(total, this.log.i + 1);
    this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', action: null, hold: 0, textKey, step, total, progress: (done ? step : step - 1) / total, done, id: 'tutorial' });
  }

  _stepDone() {
    const s = this.log.step;
    this._emit(s.textKey, true);                                     // the tag glows gold for a beat
    try { this.ctx.audio?.play2D?.('ui.confirm', { vol: 0.7 }); } catch { /* audio optional */ }
    this.ctx.fx?.burst?.('sparkle', this.ctx.player, { count: 10 });
    if (s.id === 'meow') {
      this.pending = true;
      this.log.advance();
      this._hide(false);
      Promise.resolve(this.story?.play?.('tutpearl')).finally(() => this._end(false));
      return;
    }
    this.log.advance();
    this.waitT = PRACTICE.nextDelay;
    if (this.log.finished) this._end(false);
  }

  /** Skip the rest of practice (hold Pause 1 s, or ui's menu). */
  skip() {
    if (!this.eligible()) return;
    this._end(true);
  }

  _end(skipped) {
    const ctx = this.ctx;
    const was = this.active || this.pending;
    this.active = false; this.pending = false; this.skipHeld = 0;
    this.story?.cinema?.skip(0);
    this._hide(true);
    if (!ctx.state?.getFlag?.('prologue.tutorial')) this.story?.flag?.('prologue.tutorial', true);
    if (was) ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.(skipped ? 'tut.skipped' : 'tut.done'), key: skipped ? 'tut.skipped' : 'tut.done', icon: 'hint' });
    if (was) ctx.bus.emit(E.SAVE_REQUEST, {});
  }

  _hide(clear) {
    this._shown = null;
    this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', action: null, hold: 0, textKey: clear ? null : this.log.step?.textKey ?? null, step: 0, total: this.log.total, progress: 1, done: true, id: 'tutorial' });
  }

  _hint(h, payload) {
    const ctx = this.ctx, flag = 'seen.' + h.key;
    if (ctx.state?.getFlag?.(flag) || this.story?.isPlaying) return;
    let ok = false;
    try { ok = !!h.when(ctx, payload); } catch { ok = false; }
    if (!ok) return;
    ctx.state?.setFlag?.(flag, true);
    ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.(h.key) ?? h.key, key: h.key, icon: 'hint' });
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
  }
}

const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

/** Meow radius the cow listens to (for docs / tests). */
export const COW_MEOW_R = PLAYER.meow.kittenRadius;
