// src/story/tutorial.js  (owner: story) — Midnight Practice, the playable tutorial (GAME_DESIGN §5.4, §6.6) and the
// one-time gameplay hints that follow it (`tut.riposte`, `tut.milk`, `tut.valor`, …).
//
// Nine prompts on the practice field (meadow, prologue night), each advancing when its condition is met:
//   1 move 3 m by any method (RMB / tap orders, WASD, the stick: CONTROLS_SPEC C6, no camera look) · 2 jump the 1.0 m
//   fence (z −87; sets flag `tut.jump.done`, which opens physics' fence nav link) · 3 Snip–Snap–Swoosh on the straw
//   dummies · 4 target: an attack order on a dummy (RMB / tap it; on a pad or the keyboard-only preset the prompt is
//   informational and times out) · 5 roll past the swinging sack (8, −84) · 6 block the Wobble Knight twice · 7 parry
//   it once · 8 Bright Slash the cracked boulder · 9 Meow at the sleeping cow → Pearl pops out (scene `tutpearl`).
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
  { id: 'target', textKey: 'tut.target', info: true },
  { id: 'roll', textKey: 'tut.roll' },
  { id: 'stand', textKey: 'tut.stand', need: 2 },
  { id: 'parry', textKey: 'tut.parry' },
  { id: 'bright', textKey: 'tut.bright' },
  { id: 'meow', textKey: 'tut.meow' },
]);

/** Practice-field facts (§12.3): the fenced 40 × 40 field around (0, −80), the inner fence, the props. */
export const PRACTICE = Object.freeze({
  centre: [0, -80], half: 20.5, fenceZ: -87, fenceX: [-20, -2], sack: [8, -84], rollR: 3.4, cow: [12, -72],
  moveDist: 3, infoSec: 4.0, comboFallback: 6, nextDelay: 1.0, skipHold: 1.0, boulder: 'practice_boulder', cowId: 'cow_practice',
});

/**
 * Pure step state. Feed it facts; it says when the current step is complete.
 * Facts: { type: 'moved', d } · { type: 'north' } · { type: 'hit', attackId, dummy } · { type: 'order', kind, dummy }
 *        · { type: 'target' } · { type: 'info', t } · { type: 'dodge', nearSack } · { type: 'block' } · { type: 'parry' }
 *        · { type: 'boulder' } · { type: 'cow' }
 * ('info': seconds an `info` step's prompt has been up on a device without a pointer, e.g. a pad.)
 */
export class PracticeLog {
  constructor(steps = TUTORIAL_STEPS, cfg = PRACTICE) {
    this.steps = steps; this.cfg = cfg;
    this.i = 0; this.finished = false;
    this.moved = 0; this.infoT = 0; this.dummyHits = 0; this.blocks = 0; this.parries = 0;
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
      // an attack order on a dummy (RMB / tap it) is the target lesson, whenever it happens (it also swings at it)
      case 'order': if (f.kind === 'attack' && f.dummy) this.latched.add('target'); break;
      case 'target': if (id === 'target') this.latched.add('target'); break;
      case 'info': if (this.step?.info) this.infoT = Math.max(this.infoT, f.t ?? 0); break;
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
      // CONTROLS_SPEC C6: the iso camera never turns, so the move step needs only the distance (any method)
      case 'move': return this.moved >= c.moveDist;
      case 'jump': return this.latched.has('north');
      case 'combo': return this.latched.has('combo') || this.dummyHits >= c.comboFallback;
      case 'target': return this.latched.has('target') || this.infoT >= c.infoSec;
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
    this.i++; this.infoT = 0;
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
  { key: 'tut.riposte', on: E.PLAYER_PARRY, when: (ctx, p) => ctx.state?.getFlag?.('prologue.done') && !p?.projectile,
    text: (ctx) => (ctx.player?.autoRiposteOn?.() ? 'tut.riposte.auto' : null) },   // Auto-Riposte (touch): no tap asked
  { key: 'tut.milk', on: E.PLAYER_DAMAGED, when: (ctx, p) => ctx.state?.getFlag?.('prologue.done') && (p?.hp ?? 99) <= 4 && (ctx.player?.milk ?? 0) > 0 },
  { key: 'tut.valor', on: E.ENEMY_ALERTED, when: (ctx) => ctx.state?.getFlag?.('prologue.done') && ctx.levels?.current?.id === 'meadow' },
  { key: 'tut.companion', on: E.COMPANION_CHANGED, when: (ctx, p) => (p?.active?.length ?? 0) > 0 },
  { key: 'tut.holy', on: E.SHARD, when: (ctx, p) => (p?.n ?? 0) >= 1 },
  { key: 'tut.line', on: E.OBJECTIVE, when: (ctx, p) => p?.id === 'line' },
  { key: 'tut.jeer', on: E.ENEMY_JEER, when: (ctx, p) => !!p?.on },
  // CONTROLS_SPEC §14 (new): the first arena teaches zoom; the first talkable NPC in reach teaches click / tap to talk
  // (the proximity scan in Tutorial._talkTip usually fires it first, from further away)
  { key: 'tut.zoom', on: E.ARENA_LOCK, when: (ctx) => !!ctx.state?.getFlag?.('prologue.done') && ctx.cam?.isIso !== false },
  { key: 'tut.talk', on: E.INTERACT_AVAILABLE, when: (ctx, p) => p?.prompt === 'prompt.talk' || p?.target?.kind === 'npc' },
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
    this._shownT = 0;            // seconds the current prompt has been up (info steps)
    this._talkScan = 0;          // tut.talk proximity scan timer
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
    on(E.LEVEL_LOADED, () => { this.reset(); this._clickT = 0; });
    on(E.PLAYER_ORDER, (o) => {
      if (o?.valid === false) return;
      this._ordered = true;
      this._fact({ type: 'order', kind: o?.kind, dummy: o?.target?.kind === 'dummy' });
    });
    // pad RB / Tab picks a target (dummies are not lock-on targets, but a real foe in reach of the field still counts)
    on(E.TARGET_CHANGED, (t) => { if (t?.actor && t.source !== 'auto' && t.source !== 'clear') this._fact({ type: 'target' }); });
    on(E.LEVEL_UNLOAD, () => this._hide(true));
    on(E.FLAG_SET, (f) => { if (f?.key === 'prologue.tutorial' && f.value && this.active) this._end(false); });
    for (const h of HINTS) on(h.on, (p) => this._hint(h, p));
  }

  reset() {
    this.log = new PracticeLog();
    this.active = false; this.waitT = 0; this.pending = false; this.skipHeld = 0;
    this._last = null; this._shown = null; this._shownT = 0; this._releaseDummyT = 0;
  }

  // ------------------------------------------------------------------ loop (play mode, StoryManager.update)
  update(dt) {
    const ctx = this.ctx, p = ctx.player;
    this._clickTip(dt);
    this._talkTip(dt);
    if (!this.eligible() || !p) { if (this.active) this._hide(true); this.active = false; return; }
    if (this.story?.isPlaying || ctx.game?.mode === 'menu') return;
    if (!this.active) {
      if (!inPractice(p.pos.x, p.pos.z)) return;
      this.active = true; this.waitT = 0.6; this._shown = null;
      this._last = p.pos.clone();
    }
    // facts sampled every step (C6: any way of moving counts: orders, WASD, the stick; the iso camera never turns)
    if (this.log.step?.id === 'move' && this._last) {
      this.log.note({ type: 'moved', d: Math.hypot(p.pos.x - this._last.x, p.pos.z - this._last.z) });
      this._last.copy(p.pos);
    }
    // an informational step (target) on a device with no pointer to click with times out instead
    if (this.log.step?.info && this._shown === this.log.i) {
      this._shownT += dt;
      if (!this._pointerScheme()) this.log.note({ type: 'info', t: this._shownT });
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

    this._releaseDummy(dt);
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
    this._shown = this.log.i; this._shownT = 0;
    this._emit(s.textKey, false);
  }

  _emit(textKey, done) {
    const total = this.log.total, step = Math.min(total, this.log.i + 1);
    this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', action: null, hold: 0, textKey, step, total, progress: (done ? step : step - 1) / total, done, id: 'tutorial' });
  }

  _stepDone() {
    const s = this.log.step;
    if (s?.id === 'jump') this._jumpDone();                          // CONTROLS_SPEC §12 story 2
    if (s?.id === 'target') this._releaseDummyT = DUMMY_RELEASE;     // let one chain land, then let go of the dummy
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

  /**
   * After the target lesson: a straw dummy is not a foe, so once the first chain has landed she stops attacking it and
   * the selection is dropped (a selected target pulls the iso framing toward it as "combat": with the dummy still
   * selected the Wobble Knight south of her ends up at the screen's bottom edge). New input cancels the order anyway.
   */
  _releaseDummy(dt) {
    if (!(this._releaseDummyT > 0)) return;
    if ((this._releaseDummyT -= dt) > 0) return;
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

  _end(skipped) {
    const ctx = this.ctx;
    const was = this.active || this.pending;
    this.active = false; this.pending = false; this.skipHeld = 0;
    this.story?.cinema?.skip(0);
    this._hide(true);
    if (!ctx.state?.getFlag?.('prologue.tutorial')) this.story?.flag?.('prologue.tutorial', true);
    this._jumpDone();                                                // practice over: the fence link opens too
    if (was) ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.(skipped ? 'tut.skipped' : 'tut.done'), key: skipped ? 'tut.skipped' : 'tut.done', icon: 'hint' });
    if (was) ctx.bus.emit(E.SAVE_REQUEST, {});
  }

  _hide(clear) {
    this._shown = null;
    this.ctx.bus.emit(E.PROMPT, { kind: 'tutorial', action: null, hold: 0, textKey: clear ? null : this.log.step?.textKey ?? null, step: 0, total: this.log.total, progress: 1, done: true, id: 'tutorial' });
  }

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
    const ctx = this.ctx, flag = 'seen.' + h.key;
    if (ctx.state?.getFlag?.(flag) || this.story?.isPlaying) return;
    let ok = false;
    try { ok = !!h.when(ctx, payload); } catch { ok = false; }
    if (!ok) return;
    ctx.state?.setFlag?.(flag, true);
    let tk = null;
    try { tk = h.text?.(ctx) ?? null; } catch { tk = null; }
    const key = tk && ctx.strings?.has?.(tk) !== false ? tk : h.key;
    ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.(key) ?? key, key: h.key, icon: 'hint' });
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
  }
}

/** Seconds after the target step completes before she lets go of the dummy (one Snip–Snap–Swoosh ≈ 1.4 s). */
export const DUMMY_RELEASE = 2.0;

/** `tut.talk` fires when a talkable NPC is this close (m): far enough to read it before she arrives. */
export const TALK_TIP_R = 7;

/** Meow radius the cow listens to (for docs / tests). */
export const COW_MEOW_R = PLAYER.meow.kittenRadius;
